import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { milestonesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";
import { z } from "zod/v4";

const router: IRouter = Router();

const STATUSES = ["NotStarted", "InProgress", "Complete", "AtRisk", "Blocked"] as const;
const PHASES   = ["PreEvent", "EventDay", "PostEvent"] as const;

// ── GET /milestones ───────────────────────────────────────────────────────────
router.get(
  "/milestones",
  requirePermission("tasks:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    const conditions = [isNull(milestonesTable.deletedAt)];
    if (conveningId) conditions.push(eq(milestonesTable.conveningId, String(conveningId)));

    const rows = await db
      .select()
      .from(milestonesTable)
      .where(and(...conditions))
      .orderBy(milestonesTable.sortOrder, milestonesTable.targetDate, milestonesTable.createdAt);

    res.json(rows);
  },
);

// ── POST /milestones ──────────────────────────────────────────────────────────
const CreateMilestoneSchema = z.object({
  conveningId: z.string().min(1),
  title:       z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  phase:       z.enum(PHASES).optional(),
  targetDate:  z.string().optional(),
  owner:       z.string().max(200).optional(),
  status:      z.enum(STATUSES).optional(),
  dependency:  z.string().max(500).optional(),
  notes:       z.string().max(2000).optional(),
  sortOrder:   z.number().int().min(0).optional(),
});

router.post(
  "/milestones",
  requirePermission("tasks:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = CreateMilestoneSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join(".") || "root", i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const { conveningId, title, description, phase, targetDate, owner,
            status, dependency, notes, sortOrder } = parsed.data;

    const [created] = await db
      .insert(milestonesTable)
      .values({
        conveningId, title,
        ...(description !== undefined && { description }),
        ...(phase       !== undefined && { phase }),
        ...(targetDate  !== undefined && { targetDate }),
        ...(owner       !== undefined && { owner }),
        ...(status      !== undefined && { status }),
        ...(dependency  !== undefined && { dependency }),
        ...(notes       !== undefined && { notes }),
        ...(sortOrder   !== undefined && { sortOrder }),
      })
      .returning();

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Milestone",
      entityId: created.id,
      summary: `Created milestone "${title}"`,
      after: created,
    });

    res.status(201).json(created);
  },
);

// ── PATCH /milestones/:id ─────────────────────────────────────────────────────
const UpdateMilestoneSchema = z.object({
  title:       z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  phase:       z.enum(PHASES).optional(),
  targetDate:  z.string().optional().nullable(),
  owner:       z.string().max(200).optional().nullable(),
  status:      z.enum(STATUSES).optional(),
  dependency:  z.string().max(500).optional().nullable(),
  notes:       z.string().max(2000).optional().nullable(),
  sortOrder:   z.number().int().min(0).optional(),
});

router.patch(
  "/milestones/:id",
  requirePermission("tasks:write"),
  async (req: Request, res: Response) => {
    const parsed = UpdateMilestoneSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join(".") || "root", i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const id = String(req.params.id);
    const [before] = await db
      .select()
      .from(milestonesTable)
      .where(and(eq(milestonesTable.id, id), notDeleted(milestonesTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const [updated] = await db
      .update(milestonesTable)
      .set(parsed.data)
      .where(eq(milestonesTable.id, id))
      .returning();

    void writeAudit({
      conveningId: before.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Milestone",
      entityId: id,
      summary: `Updated milestone "${updated.title}"`,
      before,
      after: updated,
    });

    res.json(updated);
  },
);

// ── DELETE /milestones/:id ────────────────────────────────────────────────────
router.delete(
  "/milestones/:id",
  requirePermission("tasks:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const [row] = await db
      .select()
      .from(milestonesTable)
      .where(and(eq(milestonesTable.id, id), notDeleted(milestonesTable)));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    await db
      .update(milestonesTable)
      .set({ deletedAt: new Date() })
      .where(eq(milestonesTable.id, id));

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Milestone",
      entityId: id,
      summary: `Deleted milestone "${row.title}"`,
      before: row,
    });

    res.status(204).end();
  },
);

export default router;
