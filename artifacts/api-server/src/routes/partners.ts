import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { partnersTable, engagementsTable, insertPartnerSchema, conveningsTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { insertEngagementSchema, pillarsTable } from "@workspace/db";
import { z } from "zod";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";
import { matchingInstitutions, scopedPartnerRows } from "../lib/partnerScope";
import { isForeignKeyViolation, isUniqueViolation } from "../lib/pgError";
import { projectProfile } from "../lib/projectProfile";

const router: IRouter = Router();

class PartnerLinkError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const linkSchema = z.object({
  conveningId: z.string().min(1),
  partnerId: z.string().min(1).optional(),
  partner: z.object({ institutionName: z.string().trim().min(1) }).passthrough().optional(),
  engagement: z.record(z.string(), z.unknown()).optional(),
}).refine(v => !!v.partnerId !== !!v.partner, { message: "Provide either partnerId or partner" });

// One request/transaction for directory creation or reuse and event linking.
router.post("/partners/link", requirePermission("partners:write"), requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: parsed.error.issues[0]?.message ?? "Invalid partner link" }); return; }
    const { conveningId, partnerId, partner, engagement } = parsed.data;
    const partnerData = partner ? insertPartnerSchema.safeParse(cleanPartnerBody(partner)) : null;
    const engagementData = insertEngagementSchema.safeParse({ ...engagement, conveningId, partnerId: partnerId ?? "pending" });
    if (partnerData && !partnerData.success) { res.status(422).json({ error: "Invalid partner", errors: partnerData.error.flatten().fieldErrors }); return; }
    if (!engagementData.success) { res.status(422).json({ error: "Invalid engagement", errors: engagementData.error.flatten().fieldErrors }); return; }
    const [convening] = await db.select({ id: conveningsTable.id }).from(conveningsTable)
      .where(eq(conveningsTable.id, conveningId));
    if (!convening) { res.status(422).json({ error: "Convening not found" }); return; }
    if (engagementData.data.pillarId) {
      const [pillar] = await db.select({ id: pillarsTable.id }).from(pillarsTable).where(and(
        eq(pillarsTable.id, engagementData.data.pillarId), eq(pillarsTable.conveningId, conveningId), isNull(pillarsTable.deletedAt)));
      if (!pillar) { res.status(422).json({ error: "Pillar does not belong to this convening" }); return; }
    }
    // Serialize same-name creation across case variants before looking up directory rows.
    // The database unique index only covers exact names; no schema change is required.
    const name = partnerData?.success ? partnerData.data.institutionName.trim() : null;
    let result;
    try {
      result = await db.transaction(async tx => {
        if (name) {
          await tx.execute(sql`select pg_advisory_xact_lock(29859, hashtext(${name.toLowerCase()}))`);
        }
        const candidates = name ? await tx.select().from(partnersTable)
          .where(sql`lower(trim(${partnersTable.institutionName})) = ${name.toLowerCase()}`) : [];
        const matches = name ? matchingInstitutions(candidates, name) : [];
        if (matches.length > 1) throw new PartnerLinkError(409, "Multiple institutions match this name. Select an existing institution by ID.");
        if (matches[0]?.deletedAt) throw new PartnerLinkError(409, "This institution is archived. Restore it before linking.");
        const existing = partnerId ? (await tx.select().from(partnersTable)
          .where(and(eq(partnersTable.id, partnerId), notDeleted(partnersTable))))[0] : matches[0];
        if (partnerId && !existing) throw new PartnerLinkError(422, "Partner not found");
        const existingLink = existing && (await tx.select().from(engagementsTable).where(and(
          eq(engagementsTable.conveningId, conveningId), eq(engagementsTable.partnerId, existing.id))))[0];
        if (existingLink) throw new PartnerLinkError(409, existingLink.deletedAt
          ? "This institution was previously removed from this convening. Restore its engagement before linking again."
          : "This institution is already linked to this convening.");
        const selected = existing ?? (await tx.insert(partnersTable).values({
          ...partnerData!.data, institutionName: name!, principals: partnerData!.data.principals ?? [],
        }).returning())[0];
        const [linked] = await tx.insert(engagementsTable).values({
          ...engagementData.data, partnerId: selected.id,
          partnerProfile: { ...selected, ...(partnerData?.success ? partnerData.data : {}) },
        }).returning();
        return { partner: projectProfile(selected, linked.partnerProfile), engagement: linked };
      });
    } catch (error) {
      if (error instanceof PartnerLinkError) {
        res.status(error.status).json({ error: error.message }); return;
      }
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Institution or engagement already exists. Refresh and link the existing institution." }); return;
      }
      if (isForeignKeyViolation(error)) {
        res.status(422).json({ error: "Convening or pillar not found" }); return;
      }
      throw error;
    }
    void writeAudit({ actorUserId: req.portalUser!.id, conveningId, action: "Create", entityType: "Engagement",
      entityId: result.engagement.id, summary: `Linked partner ${result.partner.institutionName} to convening`, after: result.engagement });
    res.status(201).json(result);
  });

const editLinkSchema = z.object({
  conveningId: z.string().min(1),
  partner: z.record(z.string(), z.unknown()).optional(),
  engagement: z.record(z.string(), z.unknown()).optional(),
});
router.patch("/partners/:id/engagement", requirePermission("partners:write"), requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = editLinkSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ error: "Invalid update" }); return; }
    const { conveningId } = parsed.data;
    const [before] = await db.select().from(partnersTable).where(and(eq(partnersTable.id, String(req.params.id)), notDeleted(partnersTable)));
    const [oldEngagement] = await db.select().from(engagementsTable).where(and(
      eq(engagementsTable.partnerId, String(req.params.id)), eq(engagementsTable.conveningId, conveningId), notDeleted(engagementsTable)));
    if (!before || !oldEngagement) { res.status(404).json({ error: "Partner is not linked to this convening" }); return; }
    const partnerData = insertPartnerSchema.partial().safeParse(cleanPartnerBody(parsed.data.partner ?? {}));
    const engagementData = insertEngagementSchema.partial().omit({ partnerId: true, conveningId: true }).safeParse(parsed.data.engagement ?? {});
    if (!partnerData.success || !engagementData.success) { res.status(422).json({ error: "Invalid partner or engagement fields",
      errors: { ...(!partnerData.success ? partnerData.error.flatten().fieldErrors : {}), ...(!engagementData.success ? engagementData.error.flatten().fieldErrors : {}) } }); return; }
    if (partnerData.data.institutionName !== undefined) {
      const name = partnerData.data.institutionName.trim();
      if (!name) { res.status(422).json({ error: "Institution name is required" }); return; }
      partnerData.data.institutionName = name;
    }
    if (engagementData.data.pillarId) {
      const [pillar] = await db.select({ id: pillarsTable.id }).from(pillarsTable).where(and(
        eq(pillarsTable.id, engagementData.data.pillarId), eq(pillarsTable.conveningId, conveningId), isNull(pillarsTable.deletedAt)));
      if (!pillar) { res.status(422).json({ error: "Pillar does not belong to this convening" }); return; }
    }
    let result;
    try {
      result = await db.transaction(async tx => {
        const [locked] = await tx.select().from(engagementsTable)
          .where(eq(engagementsTable.id, oldEngagement.id)).for("update");
        if (!locked || locked.deletedAt) throw new PartnerLinkError(404, "Partner is no longer linked to this convening");
        const profile = projectProfile(projectProfile(before, locked.partnerProfile), partnerData.data);
        const [updatedEngagement] = await tx.update(engagementsTable).set({
          ...engagementData.data, partnerProfile: profile,
        }).where(eq(engagementsTable.id, oldEngagement.id)).returning();
        return { partner: profile, engagement: updatedEngagement };
      });
    } catch (error) {
      if (error instanceof PartnerLinkError) {
        res.status(error.status).json({ error: error.message }); return;
      }
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Institution name already exists" }); return;
      }
      throw error;
    }
    void writeAudit({ actorUserId: req.portalUser!.id, conveningId, action: "Update", entityType: "Engagement",
      entityId: oldEngagement.id, summary: `Updated partner ${before.institutionName} and engagement`, before: oldEngagement, after: result.engagement });
    res.json(result);
  });

/**
 * Strip empty strings from enum fields before Zod parsing.
 * Drizzle-zod enum schemas reject "" — the form sends "" for unset selects,
 * so we convert them to undefined (omitted) so the DB default is used instead.
 */
function cleanPartnerBody(body: Record<string, unknown>): Record<string, unknown> {
  const ENUM_FIELDS = ["historicalEngagement", "sector", "partnerType", "potentialTier"] as const;
  const out: Record<string, unknown> = { ...body };
  for (const field of ENUM_FIELDS) {
    if (out[field] === "") delete out[field];
  }
  return out;
}

// ── GET /partners ──────────────────────────────────────────────────────────────
router.get(
  "/partners",
  requirePermission("partners:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    const portalUser = req.portalUser!;

    if (!conveningId) {
      res.status(422).json({ error: "conveningId is required" });
      return;
    }

    const { partnerType } = req.query;

    const rows = await db.select({ partner: partnersTable, engagement: engagementsTable })
      .from(engagementsTable).innerJoin(partnersTable, eq(partnersTable.id, engagementsTable.partnerId))
      .where(and(eq(engagementsTable.conveningId, String(conveningId)), notDeleted(engagementsTable), notDeleted(partnersTable)));
    res.json(scopedPartnerRows(rows.map(r => r.partner), rows.map(r => r.engagement),
      String(conveningId), partnerType ? String(partnerType) : undefined));
  },
);

// ── POST /partners ─────────────────────────────────────────────────────────────
router.post(
  "/partners",
  requirePermission("partners:write"),
  (_req: Request, res: Response) => {
    res.status(410).json({ error: "Global creation is disabled. Use POST /partners/link with conveningId." });
  },
);

// ── GET /partners/:id ──────────────────────────────────────────────────────────
router.get(
  "/partners/:id",
  requirePermission("partners:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = String(req.query.conveningId ?? "");
    if (!conveningId) { res.status(422).json({ error: "conveningId is required" }); return; }
    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(
        and(
          eq(partnersTable.id, String(req.params.id)),
          notDeleted(partnersTable),
        ),
      );
    if (!partner) { res.status(404).json({ error: "Not found" }); return; }
    const [engagement] = await db.select().from(engagementsTable).where(and(
      eq(engagementsTable.partnerId, partner.id), eq(engagementsTable.conveningId, conveningId), notDeleted(engagementsTable)));
    if (!engagement) { res.status(404).json({ error: "Partner is not linked to this convening" }); return; }
    res.json(projectProfile(partner, engagement.partnerProfile));
  },
);

// ── PATCH /partners/:id ────────────────────────────────────────────────────────
router.patch(
  "/partners/:id",
  requirePermission("partners:write"),
  (_req: Request, res: Response) => {
    res.status(410).json({ error: "Global edits are disabled. Use PATCH /partners/:id/engagement with conveningId." });
  },
);

// ── DELETE /partners/:id  (soft delete) ────────────────────────────────────────
router.delete(
  "/partners/:id",
  requirePermission("partners:write"),
  (_req: Request, res: Response) => {
    res.status(410).json({ error: "Global deletion is disabled. Remove the engagement for the selected convening." });
  },
);

export default router;
