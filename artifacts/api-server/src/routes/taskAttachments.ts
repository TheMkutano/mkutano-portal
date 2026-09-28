import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { taskAttachmentsTable, tasksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requirePermission } from "../middlewares/requirePermission";
import { writeAudit } from "../lib/audit";
import { notDeleted } from "../lib/softDelete";
import { z } from "zod/v4";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { privateObjectReferencePermitsProject } from "../lib/projectIsolation";

const router: IRouter = Router();

const SOURCE_VALUES = ["Upload", "GoogleDrive", "Link"] as const;

// ── GET /tasks/:id/attachments ──────────────────────────────────────────────
router.get(
  "/tasks/:id/attachments",
  requirePermission("tasks:read"),
  async (req: Request, res: Response) => {
    const taskId = String(req.params.id);
    const [task] = await db.select({ conveningId: tasksTable.conveningId }).from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    if (!canAccessConvening(req.portalUser!, task.conveningId)) { res.status(403).json({ error: "Forbidden" }); return; }

    const rows = await db
      .select()
      .from(taskAttachmentsTable)
      .where(and(eq(taskAttachmentsTable.taskId, taskId), notDeleted(taskAttachmentsTable)));

    res.json(rows);
  },
);

// ── POST /tasks/:id/attachments ─────────────────────────────────────────────
const CreateAttachmentSchema = z.object({
  source: z.enum(SOURCE_VALUES),
  title: z.string().min(1).max(300),
  url: z.string().min(1).max(2000),
  contentType: z.string().max(200).optional(),
  fileSize: z.number().int().min(0).optional(),
});

router.post(
  "/tasks/:id/attachments",
  requirePermission("tasks:write"),
  async (req: Request, res: Response) => {
    const taskId = String(req.params.id);

    const parsed = CreateAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    if (!canAccessConvening(req.portalUser!, task.conveningId)) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!privateObjectReferencePermitsProject(parsed.data.url, task.conveningId)) {
      res.status(422).json({ error: "This file belongs to a different convening" }); return;
    }

    if (parsed.data.source === "GoogleDrive" || parsed.data.source === "Link") {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(parsed.data.url);
      } catch {
        res.status(422).json({ error: "Validation failed", errors: { url: "Must be a valid URL" } });
        return;
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        res.status(422).json({ error: "Validation failed", errors: { url: "Must be an http(s) URL" } });
        return;
      }
    }

    const { source, title, url, contentType, fileSize } = parsed.data;

    const [created] = await db
      .insert(taskAttachmentsTable)
      .values({
        taskId,
        conveningId: task.conveningId,
        source,
        title,
        url,
        ...(contentType !== undefined && { contentType }),
        ...(fileSize !== undefined && { fileSize }),
        createdByUserId: req.portalUser!.id,
      })
      .returning();

    void writeAudit({
      conveningId: task.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "TaskAttachment",
      entityId: created.id,
      summary: `Attached "${title}" to task "${task.title}"`,
      after: created,
    });

    res.status(201).json(created);
  },
);

// ── DELETE /task-attachments/:id ────────────────────────────────────────────
router.delete(
  "/task-attachments/:id",
  requirePermission("tasks:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const [row] = await db
      .select()
      .from(taskAttachmentsTable)
      .where(and(eq(taskAttachmentsTable.id, id), notDeleted(taskAttachmentsTable)));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    if (!canAccessConvening(req.portalUser!, row.conveningId)) { res.status(403).json({ error: "Forbidden" }); return; }

    await db
      .update(taskAttachmentsTable)
      .set({ deletedAt: new Date() })
      .where(eq(taskAttachmentsTable.id, id));

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "TaskAttachment",
      entityId: id,
      summary: `Removed attachment "${row.title}" from task`,
      before: row,
    });

    res.status(204).end();
  },
);

export default router;
