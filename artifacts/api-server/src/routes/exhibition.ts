import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { exhibitorsTable, boothsTable, insertBoothSchema } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

// ── Exhibitors ──────────────────────────────────────────────────────────────

router.get(
  "/exhibitors",
  requirePermission("exhibition:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    if (!conveningId) { res.status(400).json({ error: "conveningId is required" }); return; }
    const rows = await db
      .select()
      .from(exhibitorsTable)
      .where(and(eq(exhibitorsTable.conveningId, String(conveningId)), notDeleted(exhibitorsTable)));
    res.json(rows);
  },
);

router.post(
  "/exhibitors",
  requirePermission("exhibition:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId, company, sector, contactPerson, contactEmail, contactPhone, url, logoUrl, description, contractStatus, feeAmount } = req.body;
    if (!conveningId || !company) { res.status(400).json({ error: "conveningId and company are required" }); return; }
    const [row] = await db
      .insert(exhibitorsTable)
      .values({ conveningId, company, sector, contactPerson, contactEmail, contactPhone, url, logoUrl, description, contractStatus, feeAmount: feeAmount ?? 0 })
      .returning();

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Exhibitor",
      entityId: row.id,
      summary: `Created exhibitor ${row.company}`,
      after: row,
    });

    res.status(201).json(row);
  },
);

router.patch(
  "/exhibitors/:id",
  requirePermission("exhibition:write"),
  async (req: Request, res: Response) => {
    const [before] = await db
      .select()
      .from(exhibitorsTable)
      .where(and(eq(exhibitorsTable.id, String(req.params.id)), notDeleted(exhibitorsTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const { company, sector, contactPerson, contactEmail, contactPhone, url, logoUrl, description, contractStatus, feeAmount } = req.body;
    const [row] = await db
      .update(exhibitorsTable)
      .set({ company, sector, contactPerson, contactEmail, contactPhone, url, logoUrl, description, contractStatus, feeAmount })
      .where(eq(exhibitorsTable.id, String(req.params.id)))
      .returning();

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Exhibitor",
      entityId: row.id,
      summary: `Updated exhibitor ${row.company}`,
      before,
      after: row,
    });

    res.json(row);
  },
);

router.delete(
  "/exhibitors/:id",
  requirePermission("exhibition:write"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(exhibitorsTable)
      .where(and(eq(exhibitorsTable.id, String(req.params.id)), notDeleted(exhibitorsTable)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    // Release any booth assigned to this exhibitor and soft-delete the
    // exhibitor together, so a partial failure can never leave a booth pointing
    // at a deleted exhibitor.
    await db.transaction(async (tx) => {
      await tx
        .update(boothsTable)
        .set({ exhibitorId: null, status: "Available" })
        .where(eq(boothsTable.exhibitorId, String(req.params.id)));

      await tx
        .update(exhibitorsTable)
        .set({ deletedAt: new Date() })
        .where(eq(exhibitorsTable.id, String(req.params.id)));
    });

    void writeAudit({
      conveningId: existing.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Exhibitor",
      entityId: existing.id,
      summary: `Soft-deleted exhibitor ${existing.company}`,
      before: existing,
    });

    res.status(204).end();
  },
);

// ── Booths ───────────────────────────────────────────────────────────────────

router.get(
  "/booths",
  requirePermission("exhibition:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    if (!conveningId) { res.status(400).json({ error: "conveningId is required" }); return; }
    const rows = await db
      .select()
      .from(boothsTable)
      .where(and(eq(boothsTable.conveningId, String(conveningId)), notDeleted(boothsTable)));
    res.json(rows);
  },
);

router.post(
  "/booths",
  requirePermission("exhibition:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parse = insertBoothSchema.safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }
    const [row] = await db.insert(boothsTable).values(parse.data).returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Booth",
      entityId: row.id,
      summary: `Created booth ${row.code} (${row.zone})`,
      after: row,
    });
    res.status(201).json(row);
  },
);

router.patch(
  "/booths/:id",
  requirePermission("exhibition:write"),
  async (req: Request, res: Response) => {
    const [before] = await db
      .select()
      .from(boothsTable)
      .where(and(eq(boothsTable.id, String(req.params.id)), notDeleted(boothsTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const parse = insertBoothSchema.partial().safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }
    const [row] = await db
      .update(boothsTable)
      .set(parse.data)
      .where(and(eq(boothsTable.id, String(req.params.id)), notDeleted(boothsTable)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Booth",
      entityId: row.id,
      summary: `Updated booth ${row.code}`,
      before,
      after: row,
    });
    res.json(row);
  },
);

router.delete(
  "/booths/:id",
  requirePermission("exhibition:write"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(boothsTable)
      .where(and(eq(boothsTable.id, String(req.params.id)), notDeleted(boothsTable)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await db
      .update(boothsTable)
      .set({ deletedAt: new Date() })
      .where(eq(boothsTable.id, String(req.params.id)));

    void writeAudit({
      conveningId: existing.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Booth",
      entityId: existing.id,
      summary: `Soft-deleted booth ${existing.code}`,
      before: existing,
    });
    res.status(204).end();
  },
);

export default router;
