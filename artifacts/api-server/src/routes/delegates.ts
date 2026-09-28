import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { delegatesTable, insertDelegateSchema, delegateExportSchedulesTable, insertDelegateExportScheduleSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";
import { buildDelegateExportCsv } from "../lib/delegateExport";

const router: IRouter = Router();

// ── Rate limiter (in-memory, per-IP) for public verify endpoint ───────────────
const verifyLimiter = new Map<string, { count: number; resetAt: number }>();
const VERIFY_MAX = 30;
const VERIFY_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = verifyLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    verifyLimiter.set(ip, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
    return true;
  }
  if (entry.count >= VERIFY_MAX) return false;
  entry.count++;
  return true;
}

// Clean up stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of verifyLimiter) {
    if (now > entry.resetAt) verifyLimiter.delete(ip);
  }
}, 5 * 60_000);

// ── Helpers ───────────────────────────────────────────────────────────────────
type DelegateRow = typeof delegatesTable.$inferSelect;

function isInternal(req: Request): boolean {
  return req.portalUser?.accountType === "Internal";
}

function stripSensitive(rows: DelegateRow[]): Omit<DelegateRow, "dietaryRequirements" | "accessNeeds">[] {
  return rows.map(({ dietaryRequirements: _d, accessNeeds: _a, ...rest }) => rest);
}

// ── GET /delegates/export  (CSV) ──────────────────────────────────────────────
router.get(
  "/delegates/export",
  requirePermission("delegates:export"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId, segment, passTypeCategory, columns } = req.query;
    if (!conveningId) { res.status(400).json({ error: "conveningId is required" }); return; }

    const columnList = columns
      ? String(columns).split(",").map(c => c.trim()).filter(Boolean)
      : undefined;

    const { csv, rowCount, segment: seg, passTypeCategory: ptCat } = await buildDelegateExportCsv({
      conveningId: String(conveningId),
      segment: segment ? String(segment) : undefined,
      passTypeCategory: passTypeCategory ? String(passTypeCategory) : undefined,
      columns: columnList,
    });

    void writeAudit({
      conveningId: String(conveningId),
      actorUserId: req.portalUser!.id,
      action: "Export",
      entityType: "Delegate",
      entityId: String(conveningId),
      summary: `Exported ${rowCount} delegates (conveningId=${conveningId}, segment=${seg}, passTypeCategory=${ptCat})`,
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="delegates-${conveningId}.csv"`);
    res.send(csv);
  },
);

// ── GET /delegates/export-schedule  (scheduled CSV export config) ────────────
router.get(
  "/delegates/export-schedule",
  requirePermission("delegates:export"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    if (!conveningId) { res.status(400).json({ error: "conveningId is required" }); return; }

    const [row] = await db
      .select()
      .from(delegateExportSchedulesTable)
      .where(eq(delegateExportSchedulesTable.conveningId, String(conveningId)))
      .limit(1);

    res.json(row ?? null);
  },
);

// ── PUT /delegates/export-schedule  (create/update scheduled CSV export) ─────
router.put(
  "/delegates/export-schedule",
  requirePermission("delegates:export"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parse = insertDelegateExportScheduleSchema.safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ errors });
      return;
    }

    const { conveningId } = parse.data;

    const [existing] = await db
      .select()
      .from(delegateExportSchedulesTable)
      .where(eq(delegateExportSchedulesTable.conveningId, conveningId))
      .limit(1);

    let row;
    if (existing) {
      [row] = await db
        .update(delegateExportSchedulesTable)
        .set({ ...parse.data, updatedAt: new Date() })
        .where(eq(delegateExportSchedulesTable.conveningId, conveningId))
        .returning();
    } else {
      [row] = await db
        .insert(delegateExportSchedulesTable)
        .values({ ...parse.data, createdByUserId: req.portalUser!.id })
        .returning();
    }

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: existing ? "Update" : "Create",
      entityType: "DelegateExportSchedule",
      entityId: row.id,
      summary: `${existing ? "Updated" : "Created"} scheduled delegate export (${row.enabled ? "enabled" : "disabled"}, ${row.timeOfDay} UTC, ${row.recipients.length} recipient${row.recipients.length === 1 ? "" : "s"})`,
      before: existing ?? undefined,
      after: row,
    });

    res.json(row);
  },
);

// ── GET /delegates/verify  (public, rate-limited, no PII) ─────────────────────
router.get("/delegates/verify", async (req: Request, res: Response) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests. Try again in a minute." });
    return;
  }

  const { qrCode } = req.query;
  if (!qrCode) { res.status(400).json({ error: "qrCode is required" }); return; }

  const [row] = await db
    .select({
      id:       delegatesTable.id,
      name:     delegatesTable.name,
      passType: delegatesTable.passType,
      status:   delegatesTable.status,
      qrCode:   delegatesTable.qrCode,
    })
    .from(delegatesTable)
    .where(
      and(
        eq(delegatesTable.qrCode, String(qrCode)),
        notDeleted(delegatesTable),
      ),
    )
    .limit(1);

  if (!row) { res.status(404).json({ error: "Delegate not found" }); return; }
  res.json(row);
});

// ── GET /delegates ────────────────────────────────────────────────────────────
router.get(
  "/delegates",
  requirePermission("delegates:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    if (!conveningId) { res.status(400).json({ error: "conveningId is required" }); return; }

    const rows = await db
      .select()
      .from(delegatesTable)
      .where(
        and(
          eq(delegatesTable.conveningId, String(conveningId)),
          notDeleted(delegatesTable),
        ),
      );

    res.json(isInternal(req) ? rows : stripSensitive(rows));
  },
);

// ── POST /delegates/check-in ─────────────────────────────────────────────────
router.post(
  "/delegates/check-in",
  requirePermission("delegates:write"),
  async (req: Request, res: Response) => {
    const { qrCode } = req.body as { qrCode?: string };
    if (!qrCode) { res.status(400).json({ error: "qrCode is required" }); return; }

    const [existing] = await db
      .select()
      .from(delegatesTable)
      .where(and(eq(delegatesTable.qrCode, qrCode), notDeleted(delegatesTable)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Delegate not found" }); return; }
    if (existing.status === "Cancelled") {
      res.status(400).json({ error: "Cannot check in a cancelled delegate" });
      return;
    }

    const [updated] = await db
      .update(delegatesTable)
      .set({ status: "Attended" })
      .where(eq(delegatesTable.qrCode, qrCode))
      .returning();

    void writeAudit({
      conveningId: updated.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Delegate",
      entityId: updated.id,
      summary: `Checked in delegate ${updated.name}`,
      before: { status: existing.status },
      after: { status: updated.status },
    });

    res.json(isInternal(req) ? updated : stripSensitive([updated])[0]);
  },
);

// ── POST /delegates ───────────────────────────────────────────────────────────
router.post(
  "/delegates",
  requirePermission("delegates:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parse = insertDelegateSchema.safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }

    const [row] = await db.insert(delegatesTable).values(parse.data).returning();

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Delegate",
      entityId: row.id,
      summary: `Registered delegate ${row.name}`,
      after: row,
    });

    res.status(201).json(isInternal(req) ? row : stripSensitive([row])[0]);
  },
);

// ── PATCH /delegates/:id ──────────────────────────────────────────────────────
router.patch(
  "/delegates/:id",
  requirePermission("delegates:write"),
  async (req: Request, res: Response) => {
    const [before] = await db
      .select()
      .from(delegatesTable)
      .where(and(eq(delegatesTable.id, String(req.params.id)), notDeleted(delegatesTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const parse = insertDelegateSchema.partial().safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }

    const [row] = await db
      .update(delegatesTable)
      .set(parse.data)
      .where(eq(delegatesTable.id, String(req.params.id)))
      .returning();

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Delegate",
      entityId: row.id,
      summary: `Updated delegate ${row.name}`,
      before,
      after: row,
    });

    res.json(isInternal(req) ? row : stripSensitive([row])[0]);
  },
);

// ── DELETE /delegates/:id  (soft delete) ──────────────────────────────────────
router.delete(
  "/delegates/:id",
  requirePermission("delegates:write"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(delegatesTable)
      .where(and(eq(delegatesTable.id, String(req.params.id)), notDeleted(delegatesTable)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await db
      .update(delegatesTable)
      .set({ deletedAt: new Date() })
      .where(eq(delegatesTable.id, String(req.params.id)));

    void writeAudit({
      conveningId: existing.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Delegate",
      entityId: existing.id,
      summary: `Soft-deleted delegate ${existing.name}`,
      before: existing,
    });

    res.status(204).end();
  },
);

export default router;
