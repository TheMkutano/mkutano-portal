import { pgTable, text, timestamp, json, index } from "drizzle-orm/pg-core";
import { conveningsTable } from "./convenings";

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").references(() => conveningsTable.id, { onDelete: "set null" }),
  // Historical production logs include actors that predate portal user records.
  // Preserve those immutable logs and defer this FK until their identities are reconciled.
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull().$type<"Create" | "Update" | "Delete" | "Restore" | "Export">(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  summary: text("summary"),
  before: json("before"),
  after: json("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_logs_convening_id_idx").on(t.conveningId),
  index("audit_logs_actor_user_id_idx").on(t.actorUserId),
]);

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
