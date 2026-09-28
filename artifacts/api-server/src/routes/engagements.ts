import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { engagementsTable, insertEngagementSchema, pillarsTable, engagementStageHistoryTable, partnersTable, conveningsTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

const patchEngagementSchema = insertEngagementSchema
  .partial()
  .omit({ conveningId: true, partnerId: true });

async function validatePillarOwnership(
  pillarId: string,
  conveningId: string,
  res: Response,
): Promise<boolean> {
  const [pillar] = await db
    .select({ id: pillarsTable.id })
    .from(pillarsTable)
    .where(
      and(
        eq(pillarsTable.id, pillarId),
        eq(pillarsTable.conveningId, conveningId),
        isNull(pillarsTable.deletedAt),
      ),
    );
  if (!pillar) {
    res.status(422).json({
      error: "Validation failed",
      errors: { pillarId: "Pillar not found or does not belong to this convening" },
    });
    return false;
  }
  return true;
}

router.get(
  "/engagements",
  requirePermission("partners:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId, partnerId } = req.query;
    if (req.portalUser!.accountType !== "Internal" && !conveningId) {
      res.status(403).json({ error: "conveningId is required" }); return;
    }
    const conditions = [isNull(engagementsTable.deletedAt)];
    if (conveningId) conditions.push(eq(engagementsTable.conveningId, String(conveningId)));
    if (partnerId)   conditions.push(eq(engagementsTable.partnerId, String(partnerId)));

    const rows = await db
      .select()
      .from(engagementsTable)
      .where(and(...conditions));

    res.json(rows);
  },
);

router.post(
  "/engagements",
  requirePermission("partners:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parse = insertEngagementSchema.safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    if (parse.data.pillarId) {
      const ok = await validatePillarOwnership(parse.data.pillarId, parse.data.conveningId, res);
      if (!ok) return;
    }
    const [partner] = await db.select().from(partnersTable)
      .where(and(eq(partnersTable.id, parse.data.partnerId), notDeleted(partnersTable)));
    if (!partner) { res.status(422).json({ error: "Partner not found" }); return; }
    const [convening] = await db.select({ id: conveningsTable.id }).from(conveningsTable)
      .where(eq(conveningsTable.id, parse.data.conveningId));
    if (!convening) { res.status(422).json({ error: "Convening not found" }); return; }
    const [prior] = await db.select({ deletedAt: engagementsTable.deletedAt }).from(engagementsTable).where(and(
      eq(engagementsTable.conveningId, parse.data.conveningId), eq(engagementsTable.partnerId, parse.data.partnerId)));
    if (prior) { res.status(409).json({ error: prior.deletedAt ? "Engagement was previously removed. Restore it before linking again." : "Partner already linked to this convening." }); return; }

    const [created] = await db
      .insert(engagementsTable)
      .values({ ...parse.data, partnerProfile: partner })
      .returning();

    void writeAudit({
      conveningId: created.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Engagement",
      entityId: created.id,
      summary: `Created engagement for partner ${created.partnerId} in convening ${created.conveningId}`,
      after: created,
    });

    res.status(201).json(created);
  },
);

router.patch(
  "/engagements/:id",
  requirePermission("partners:write"),
  async (req: Request, res: Response) => {
    const [before] = await db
      .select()
      .from(engagementsTable)
      .where(and(eq(engagementsTable.id, String(req.params.id)), notDeleted(engagementsTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    if (req.portalUser && req.portalUser.accountType !== "Internal" &&
        !canAccessConvening(req.portalUser, before.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" });
      return;
    }

    const parse = patchEngagementSchema.safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    if (parse.data.pillarId) {
      const ok = await validatePillarOwnership(parse.data.pillarId, before.conveningId, res);
      if (!ok) return;
    }

    const [updated] = await db
      .update(engagementsTable)
      .set(parse.data)
      .where(eq(engagementsTable.id, String(req.params.id)))
      .returning();

    // Record outreach stage change history — best-effort, must not crash the server
    if (parse.data.outreachStage && parse.data.outreachStage !== before.outreachStage) {
      const actor = req.portalUser!;
      db.insert(engagementStageHistoryTable).values({
        id: crypto.randomUUID(),
        engagementId: updated.id,
        conveningId: updated.conveningId,
        actorUserId: actor.id,
        actorName: actor.name ?? null,
        fromStage: before.outreachStage,
        toStage: parse.data.outreachStage,
      }).catch((err: unknown) => {
        console.error("[stage-history] Failed to insert stage history entry — non-fatal", err);
      });
    }

    void writeAudit({
      conveningId: updated.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Engagement",
      entityId: updated.id,
      summary: `Updated engagement ${updated.id}`,
      before,
      after: updated,
    });

    res.json(updated);
  },
);

router.get(
  "/engagements/:id/stage-history",
  requirePermission("partners:read"),
  async (req: Request, res: Response) => {
    const engagementId = String(req.params.id);

    const [engagement] = await db
      .select({ id: engagementsTable.id, conveningId: engagementsTable.conveningId })
      .from(engagementsTable)
      .where(and(eq(engagementsTable.id, engagementId), notDeleted(engagementsTable)));
    if (!engagement) { res.status(404).json({ error: "Not found" }); return; }

    if (req.portalUser && req.portalUser.accountType !== "Internal" &&
        !canAccessConvening(req.portalUser, engagement.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" });
      return;
    }

    const rows = await db
      .select()
      .from(engagementStageHistoryTable)
      .where(eq(engagementStageHistoryTable.engagementId, engagementId))
      .orderBy(desc(engagementStageHistoryTable.createdAt));

    res.json(rows);
  },
);

router.delete(
  "/engagements/:id",
  requirePermission("partners:write"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(engagementsTable)
      .where(and(eq(engagementsTable.id, String(req.params.id)), notDeleted(engagementsTable)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    if (req.portalUser && req.portalUser.accountType !== "Internal" &&
        !canAccessConvening(req.portalUser, existing.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" });
      return;
    }

    await db
      .update(engagementsTable)
      .set({ deletedAt: new Date() })
      .where(eq(engagementsTable.id, String(req.params.id)));

    void writeAudit({
      conveningId: existing.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Engagement",
      entityId: existing.id,
      summary: `Soft-deleted engagement ${existing.id}`,
      before: existing,
    });

    res.status(204).end();
  },
);

export default router;
