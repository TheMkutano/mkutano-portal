import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { pillarsTable, insertPillarSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();

const UpdatePillarSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
});

router.get(
  "/convenings/:conveningId/pillars",
  requirePermission("partners:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = String(req.params.conveningId);
    const rows = await db
      .select()
      .from(pillarsTable)
      .where(and(eq(pillarsTable.conveningId, conveningId), notDeleted(pillarsTable)));
    res.json(rows);
  },
);

router.post(
  "/convenings/:conveningId/pillars",
  requirePermission("partners:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = String(req.params.conveningId);
    const parse = insertPillarSchema.safeParse({ ...req.body, conveningId });
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const [created] = await db.insert(pillarsTable).values(parse.data).returning();

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Pillar",
      entityId: created.id,
      summary: `Created pillar "${created.name}" for convening ${conveningId}`,
      after: created,
    });

    res.status(201).json(created);
  },
);

router.patch(
  "/convenings/:conveningId/pillars/:pillarId",
  requirePermission("partners:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = String(req.params.conveningId);
    const pillarId = String(req.params.pillarId);

    const [before] = await db
      .select()
      .from(pillarsTable)
      .where(and(eq(pillarsTable.id, pillarId), eq(pillarsTable.conveningId, conveningId), notDeleted(pillarsTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const parse = UpdatePillarSchema.safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (parse.data.name !== undefined) updates.name = parse.data.name;
    if (parse.data.description !== undefined) updates.description = parse.data.description;

    const [updated] = await db
      .update(pillarsTable)
      .set(updates)
      .where(eq(pillarsTable.id, pillarId))
      .returning();

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Pillar",
      entityId: pillarId,
      summary: `Updated pillar "${updated.name}"`,
      before,
      after: updated,
    });

    res.json(updated);
  },
);

router.delete(
  "/convenings/:conveningId/pillars/:pillarId",
  requirePermission("partners:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = String(req.params.conveningId);
    const pillarId = String(req.params.pillarId);

    const [existing] = await db
      .select()
      .from(pillarsTable)
      .where(and(eq(pillarsTable.id, pillarId), eq(pillarsTable.conveningId, conveningId), notDeleted(pillarsTable)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await db
      .update(pillarsTable)
      .set({ deletedAt: new Date() })
      .where(eq(pillarsTable.id, pillarId));

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Pillar",
      entityId: pillarId,
      summary: `Deleted pillar "${existing.name}"`,
      before: existing,
    });

    res.status(204).end();
  },
);

export default router;
