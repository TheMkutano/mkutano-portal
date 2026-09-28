import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { logger } from "./logger";

export type AuditAction = "Create" | "Update" | "Delete" | "Restore" | "Export";

export interface WriteAuditParams {
  conveningId?: string | null;
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(params: WriteAuditParams): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      conveningId: params.conveningId ?? null,
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      summary: params.summary ?? null,
      before: (params.before ?? null) as Record<string, unknown> | null,
      after: (params.after ?? null) as Record<string, unknown> | null,
    });
  } catch (err) {
    logger.error({ err, params }, "Failed to write audit log — non-fatal");
  }
}
