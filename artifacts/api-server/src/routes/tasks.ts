import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { tasksTable, portalUsersTable, milestonesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { writeAudit } from "../lib/audit";
import { z } from "zod/v4";

const router: IRouter = Router();

// ── GET /tasks ────────────────────────────────────────────────────────────────
router.get(
  "/tasks",
  requirePermission("tasks:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId, workstreamId } = req.query;
    if (typeof conveningId !== "string" || !conveningId) {
      res.status(422).json({ error: "conveningId is required" });
      return;
    }
    const conditions = [];

    conditions.push(eq(tasksTable.conveningId, conveningId));
    if (workstreamId) conditions.push(eq(tasksTable.workstreamId, String(workstreamId)));

    const rows = await db.select().from(tasksTable).where(and(...conditions));

    // Enrich with assignee names
    const assigneeUserIds = [
      ...new Set(rows.map((r) => r.assigneeUserId).filter(Boolean)),
    ] as string[];
    const assigneeUsers =
      assigneeUserIds.length > 0
        ? await db
            .select({ id: portalUsersTable.id, name: portalUsersTable.name })
            .from(portalUsersTable)
        : [];
    const userNameById = new Map(assigneeUsers.map((u) => [u.id, u.name]));

    const milestoneIds = [
      ...new Set(rows.map((r) => r.milestoneId).filter(Boolean)),
    ] as string[];
    const milestoneRows =
      milestoneIds.length > 0
        ? await db
            .select({ id: milestonesTable.id, title: milestonesTable.title })
            .from(milestonesTable)
            .where(inArray(milestonesTable.id, milestoneIds))
        : [];
    const milestoneTitleById = new Map(milestoneRows.map((m) => [m.id, m.title]));

    const result = rows.map((r) => ({
      ...r,
      assigneeName: r.assigneeUserId ? (userNameById.get(r.assigneeUserId) ?? null) : null,
      milestoneName: r.milestoneId ? (milestoneTitleById.get(r.milestoneId) ?? null) : null,
    }));

    res.json(result);
  },
);

// ── POST /tasks ───────────────────────────────────────────────────────────────
const PRIORITY_VALUES = ["Low", "Medium", "High", "Urgent"] as const;

const CreateTaskSchema = z.object({
  conveningId:    z.string().min(1),
  workstreamId:   z.string().min(1),
  title:          z.string().min(1).max(500),
  description:    z.string().max(2000).optional(),
  status:         z.enum(["NotStarted", "InProgress", "Blocked", "Completed"]).optional(),
  priority:       z.enum(PRIORITY_VALUES).optional(),
  assigneeUserId: z.string().optional(),
  dueDate:        z.string().optional(),
  startDate:      z.string().optional(),
  progressPct:    z.number().int().min(0).max(100).optional(),
  isMilestone:    z.boolean().optional(),
  milestoneId:    z.string().optional(),
});

router.post(
  "/tasks",
  requirePermission("tasks:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = CreateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const { conveningId, workstreamId, title, description, assigneeUserId,
      dueDate, startDate, progressPct, isMilestone, milestoneId, status, priority } = parsed.data;

    const [created] = await db
      .insert(tasksTable)
      .values({
        conveningId, workstreamId, title,
        ...(description    !== undefined && { description }),
        ...(assigneeUserId !== undefined && { assigneeUserId }),
        ...(dueDate        !== undefined && { dueDate }),
        ...(startDate      !== undefined && { startDate }),
        ...(progressPct    !== undefined && { progressPct }),
        ...(isMilestone    !== undefined && { isMilestone }),
        ...(milestoneId    !== undefined && { milestoneId }),
        ...(status         !== undefined && { status }),
        ...(priority       !== undefined && { priority }),
      })
      .returning();

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Task",
      entityId: created.id,
      summary: `Created task "${title}"`,
      after: created,
    });

    res.status(201).json(created);
  },
);

// ── PATCH /tasks/:id ──────────────────────────────────────────────────────────
const UpdateTaskSchema = z.object({
  title:          z.string().min(1).max(500).optional(),
  description:    z.string().max(2000).nullable().optional(),
  status:         z.enum(["NotStarted", "InProgress", "Blocked", "Completed"]).optional(),
  priority:       z.enum(PRIORITY_VALUES).optional(),
  assigneeUserId: z.string().nullable().optional(),
  dueDate:        z.string().nullable().optional(),
  startDate:      z.string().nullable().optional(),
  progressPct:    z.number().int().min(0).max(100).optional(),
  isMilestone:    z.boolean().optional(),
  milestoneId:    z.string().nullable().optional(),
  workstreamId:   z.string().optional(),
});

router.patch(
  "/tasks/:id",
  requirePermission("tasks:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const [before] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }
    if ((req.query.conveningId && req.query.conveningId !== before.conveningId) ||
        (req.body?.conveningId && req.body.conveningId !== before.conveningId)) {
      res.status(400).json({ error: "Conflicting conveningId values across request" }); return;
    }
    if (!canAccessConvening(req.portalUser!, before.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
    }

    const parsed = UpdateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const [updated] = await db
      .update(tasksTable)
      .set(parsed.data)
      .where(eq(tasksTable.id, id))
      .returning();

    void writeAudit({
      conveningId: before.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Task",
      entityId: id,
      summary: `Updated task "${updated.title}"`,
      before,
      after: updated,
    });

    res.json(updated);
  },
);

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────
router.delete(
  "/tasks/:id",
  requirePermission("tasks:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    if ((req.query.conveningId && req.query.conveningId !== row.conveningId) ||
        (req.body?.conveningId && req.body.conveningId !== row.conveningId)) {
      res.status(400).json({ error: "Conflicting conveningId values across request" }); return;
    }
    if (!canAccessConvening(req.portalUser!, row.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
    }

    await db.delete(tasksTable).where(eq(tasksTable.id, id));

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Task",
      entityId: id,
      summary: `Deleted task "${row.title}"`,
      before: row,
    });

    res.status(204).end();
  },
);

export default router;
