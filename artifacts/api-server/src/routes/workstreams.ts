import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { tasksTable, workstreamsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { writeAudit } from "../lib/audit";
import { isForeignKeyViolation } from "../lib/pgError";
import { z } from "zod/v4";

const router: IRouter = Router();

// ── GET /workstreams ──────────────────────────────────────────────────────────
router.get(
  "/workstreams",
  requirePermission("tasks:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = String(req.query.conveningId ?? "").trim();
    if (!conveningId) {
      res.status(400).json({ error: "conveningId is required" });
      return;
    }

    const rows = await db
      .select()
      .from(workstreamsTable)
      .where(eq(workstreamsTable.conveningId, conveningId));

    res.json(rows);
  },
);

// ── POST /workstreams ─────────────────────────────────────────────────────────
const CreateWorkstreamSchema = z.object({
  conveningId: z.string().min(1),
  name:        z.string().min(1).max(200),
});

router.post(
  "/workstreams",
  requirePermission("tasks:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = CreateWorkstreamSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const { conveningId, name } = parsed.data;

    const [created] = await db
      .insert(workstreamsTable)
      .values({ conveningId, name })
      .returning();

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Workstream",
      entityId: created.id,
      summary: `Created workstream "${name}"`,
      after: created,
    });

    res.status(201).json(created);
  },
);

// ── PATCH /workstreams/:id ────────────────────────────────────────────────────
const UpdateWorkstreamSchema = z.object({
  name: z.string().min(1).max(200),
});

router.patch(
  "/workstreams/:id",
  requirePermission("tasks:write"),
  async (req: Request, res: Response) => {
    const parsed = UpdateWorkstreamSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const id = String(req.params.id);
    const [before] = await db.select().from(workstreamsTable).where(eq(workstreamsTable.id, id));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const [updated] = await db
      .update(workstreamsTable)
      .set(parsed.data)
      .where(eq(workstreamsTable.id, id))
      .returning();

    void writeAudit({
      conveningId: before.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Workstream",
      entityId: id,
      summary: `Renamed workstream to "${updated.name}"`,
      before,
      after: updated,
    });

    res.json(updated);
  },
);

// ── DELETE /workstreams/:id ───────────────────────────────────────────────────
router.delete(
  "/workstreams/:id",
  requirePermission("tasks:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const [row] = await db.select().from(workstreamsTable).where(eq(workstreamsTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const [{ taskCount }] = await db
      .select({ taskCount: sql<number>`cast(count(*) as int)` })
      .from(tasksTable)
      .where(eq(tasksTable.workstreamId, id));

    if (taskCount > 0) {
      res.status(409).json({
        error: "Workstream has linked tasks and cannot be deleted",
        taskCount,
      });
      return;
    }

    try {
      await db.delete(workstreamsTable).where(eq(workstreamsTable.id, id));
    } catch (err) {
      // Covers a task created after the count but before the delete.
      if (isForeignKeyViolation(err)) {
        res.status(409).json({ error: "Workstream has linked tasks and cannot be deleted" });
        return;
      }
      throw err;
    }

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Workstream",
      entityId: id,
      summary: `Deleted workstream "${row.name}"`,
      before: row,
    });

    res.status(204).end();
  },
);

export default router;
