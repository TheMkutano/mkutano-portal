import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requirePermission } from "../middlewares/requirePermission";

const router: IRouter = Router();

/**
 * GET /audit
 * Admin-only: list audit log entries with optional filters.
 * Query params: entityType, actorUserId, conveningId, after (ISO date), before (ISO date), limit
 */
router.get("/audit", requirePermission("audit:read"), async (req: Request, res: Response) => {
  const { entityType, action, actorUserId, conveningId, after, before } = req.query;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  const conditions = [];
  if (entityType)   conditions.push(eq(auditLogsTable.entityType, String(entityType)));
  if (action)       conditions.push(eq(auditLogsTable.action,     String(action) as typeof auditLogsTable.action._.data));
  if (actorUserId)  conditions.push(eq(auditLogsTable.actorUserId, String(actorUserId)));
  if (conveningId)  conditions.push(eq(auditLogsTable.conveningId, String(conveningId)));
  if (after)        conditions.push(gte(auditLogsTable.createdAt, new Date(String(after))));
  if (before)       conditions.push(lte(auditLogsTable.createdAt, new Date(String(before))));

  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);

  res.json(rows);
});

export default router;
