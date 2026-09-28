import { Router, type IRouter, type Request, type Response } from "express";
import { db, serviceProvidersTable, providerBookingsTable } from "@workspace/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { requireAnyPermission, requireConveningAccess } from "../middlewares/requirePermission";

const router: IRouter = Router();
const read = requireAnyPermission(["tasks:read", "budget:read"]);
const write = requireAnyPermission(["tasks:write", "budget:write"]);

function scope(req: Request, res: Response): string | null {
  const id = req.body?.conveningId ?? req.query.conveningId;
  if (typeof id !== "string" || !id.trim()) {
    res.status(422).json({ error: "conveningId is required" });
    return null;
  }
  return id;
}

function providerInput(body: unknown) {
  const b = body as Record<string, unknown>;
  const company = typeof b?.company === "string" ? b.company.trim() : "";
  const categories = serviceProvidersTable.category.enumValues as readonly string[];
  if (!company || !categories.includes(String(b?.category ?? ""))) return null;
  return {
    company,
    category: b.category as typeof serviceProvidersTable.$inferInsert.category,
    contactPerson: typeof b.contactPerson === "string" ? b.contactPerson : null,
    contactPhone: typeof b.contactPhone === "string" ? b.contactPhone : null,
    contactEmail: typeof b.contactEmail === "string" ? b.contactEmail : null,
    url: typeof b.url === "string" ? b.url : null,
    notes: typeof b.notes === "string" ? b.notes : null,
  };
}

async function duplicateCompany(conveningId: string, company: string, exceptId?: string) {
  const rows = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.conveningId, conveningId), eq(serviceProvidersTable.company, company)));
  return rows.some(row => row.id !== exceptId);
}

function bookingWithProvider(
  booking: typeof providerBookingsTable.$inferSelect,
  provider: typeof serviceProvidersTable.$inferSelect,
) {
  return {
    ...booking,
    provider: booking.providerProfile
      ? { ...provider, ...booking.providerProfile, id: provider.id, conveningId: provider.conveningId }
      : provider,
  };
}

// Project-owned providers plus legacy providers already booked by this project.
// Unbooked legacy directory rows and other projects' providers are never exposed.
router.get("/service-providers", read, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  const [owned, booked] = await Promise.all([
    db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.conveningId, cid)),
    db.select({ booking: providerBookingsTable, provider: serviceProvidersTable })
      .from(providerBookingsTable)
      .innerJoin(serviceProvidersTable, eq(providerBookingsTable.serviceProviderId, serviceProvidersTable.id))
      .where(eq(providerBookingsTable.conveningId, cid)),
  ]);
  const byId = new Map(owned.map(p => [p.id, p]));
  for (const { booking, provider } of booked) {
    if (provider.conveningId === null) byId.set(provider.id, bookingWithProvider(booking, provider).provider);
  }
  res.json([...byId.values()].sort((a, b) => a.category.localeCompare(b.category) || a.company.localeCompare(b.company)));
});

router.post("/service-providers", write, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  const input = providerInput(req.body);
  if (!input) { res.status(422).json({ error: "Valid company and category are required" }); return; }
  if (await duplicateCompany(cid, input.company)) {
    res.status(409).json({ error: "A service provider with this company name already exists in this convening" });
    return;
  }
  const [provider] = await db.insert(serviceProvidersTable).values({ ...input, conveningId: cid }).returning();
  res.status(201).json(provider);
});

router.get("/service-providers/:id", read, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  const id = String(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, id));
  if (!provider) { res.status(404).json({ error: "Not found" }); return; }
  if (provider.conveningId === cid) { res.json(provider); return; }
  if (provider.conveningId === null) {
    const [booking] = await db.select().from(providerBookingsTable).where(and(
      eq(providerBookingsTable.conveningId, cid), eq(providerBookingsTable.serviceProviderId, id),
    )).limit(1);
    if (booking) { res.json(bookingWithProvider(booking, provider).provider); return; }
  }
  res.status(404).json({ error: "Not found" });
});

router.put("/service-providers/:id", write, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  const id = String(req.params.id);
  const input = providerInput(req.body);
  if (!input) { res.status(422).json({ error: "Valid company and category are required" }); return; }
  const [owned] = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, id), eq(serviceProvidersTable.conveningId, cid)));
  if (!owned) { res.status(404).json({ error: "Project-owned provider not found" }); return; }
  if (await duplicateCompany(cid, input.company, id)) {
    res.status(409).json({ error: "A service provider with this company name already exists in this convening" });
    return;
  }
  const provider = await db.transaction(async tx => {
    const [updated] = await tx.update(serviceProvidersTable).set(input)
      .where(and(eq(serviceProvidersTable.id, id), eq(serviceProvidersTable.conveningId, cid))).returning();
    // Keep any booking snapshot current when editing an event-owned provider.
    await tx.update(providerBookingsTable).set({ providerProfile: updated })
      .where(and(eq(providerBookingsTable.serviceProviderId, id), eq(providerBookingsTable.conveningId, cid)));
    return updated;
  });
  res.json(provider);
});

router.delete("/service-providers/:id", write, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  const id = String(req.params.id);
  const deleted = await db.transaction(async tx => {
    const [owned] = await tx.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
      .where(and(eq(serviceProvidersTable.id, id), eq(serviceProvidersTable.conveningId, cid)));
    if (!owned) return false;
    await tx.delete(providerBookingsTable).where(and(
      eq(providerBookingsTable.serviceProviderId, id), eq(providerBookingsTable.conveningId, cid),
    ));
    await tx.delete(serviceProvidersTable).where(and(
      eq(serviceProvidersTable.id, id), eq(serviceProvidersTable.conveningId, cid),
    ));
    return true;
  });
  if (!deleted) { res.status(404).json({ error: "Project-owned provider not found" }); return; }
  res.status(204).send();
});

router.get("/provider-bookings", read, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  const rows = await db.select({ booking: providerBookingsTable, provider: serviceProvidersTable })
    .from(providerBookingsTable)
    .innerJoin(serviceProvidersTable, eq(providerBookingsTable.serviceProviderId, serviceProvidersTable.id))
    .where(and(eq(providerBookingsTable.conveningId, cid), or(
      eq(serviceProvidersTable.conveningId, cid), isNull(serviceProvidersTable.conveningId),
    )));
  res.json(rows.map(({ booking, provider }) => bookingWithProvider(booking, provider)));
});

router.post("/provider-bookings", write, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  const b = req.body;
  if (typeof b?.serviceProviderId !== "string") {
    res.status(422).json({ error: "serviceProviderId is required" }); return;
  }
  const [provider] = await db.select().from(serviceProvidersTable).where(and(
    eq(serviceProvidersTable.id, b.serviceProviderId), eq(serviceProvidersTable.conveningId, cid),
  ));
  if (!provider) { res.status(404).json({ error: "Project-owned provider not found" }); return; }
  const [existing] = await db.select({ id: providerBookingsTable.id }).from(providerBookingsTable).where(and(
    eq(providerBookingsTable.conveningId, cid), eq(providerBookingsTable.serviceProviderId, provider.id),
  ));
  if (existing) { res.status(409).json({ error: "This provider is already booked for this convening" }); return; }
  const [booking] = await db.insert(providerBookingsTable).values({
    conveningId: cid, serviceProviderId: provider.id, providerProfile: provider,
    procurementStatus: b.procurementStatus ?? "Identified",
    estimatedCost: b.estimatedCost ?? null, currency: b.currency ?? "USD",
    contractUrl: b.contractUrl ?? null, responsiblePerson: b.responsiblePerson ?? null,
    scheduledStart: b.scheduledStart ? new Date(b.scheduledStart) : null,
    scheduledEnd: b.scheduledEnd ? new Date(b.scheduledEnd) : null,
    notes: b.notes ?? null,
  }).returning();
  res.status(201).json(bookingWithProvider(booking, provider));
});

router.put("/provider-bookings/:id", write, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  if (!req.body || typeof req.body !== "object") {
    res.status(422).json({ error: "Booking details are required" }); return;
  }
  const id = String(req.params.id);
  const [before] = await db.select().from(providerBookingsTable)
    .where(and(eq(providerBookingsTable.id, id), eq(providerBookingsTable.conveningId, cid)));
  if (!before) { res.status(404).json({ error: "Booking not found" }); return; }
  const [owner] = await db.select({ conveningId: serviceProvidersTable.conveningId }).from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.id, before.serviceProviderId));
  if (!owner || (owner.conveningId !== null && owner.conveningId !== cid)) {
    res.status(404).json({ error: "Booking provider not found in this convening" }); return;
  }
  if (req.body?.serviceProviderId !== undefined && req.body.serviceProviderId !== before.serviceProviderId) {
    res.status(400).json({ error: "Cannot move a booking to another provider" }); return;
  }
  const [booking] = await db.update(providerBookingsTable).set({
    procurementStatus: req.body.procurementStatus ?? before.procurementStatus,
    estimatedCost: req.body.estimatedCost ?? null,
    currency: req.body.currency ?? before.currency,
    contractUrl: req.body.contractUrl ?? null,
    responsiblePerson: req.body.responsiblePerson ?? null,
    scheduledStart: req.body.scheduledStart ? new Date(req.body.scheduledStart) : null,
    scheduledEnd: req.body.scheduledEnd ? new Date(req.body.scheduledEnd) : null,
    notes: req.body.notes ?? null,
  }).where(and(eq(providerBookingsTable.id, id), eq(providerBookingsTable.conveningId, cid))).returning();
  const [provider] = await db.select().from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.id, booking.serviceProviderId));
  res.json(bookingWithProvider(booking, provider));
});

router.delete("/provider-bookings/:id", write, requireConveningAccess(), async (req, res) => {
  const cid = scope(req, res);
  if (!cid) return;
  const [deleted] = await db.delete(providerBookingsTable).where(and(
    eq(providerBookingsTable.id, String(req.params.id)), eq(providerBookingsTable.conveningId, cid),
  )).returning({ id: providerBookingsTable.id });
  if (!deleted) { res.status(404).json({ error: "Booking not found" }); return; }
  res.status(204).send();
});

export default router;