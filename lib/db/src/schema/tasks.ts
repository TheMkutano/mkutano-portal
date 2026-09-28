import { pgTable, text, timestamp, pgEnum, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";
import { portalUsersTable } from "./users";
import { milestonesTable } from "./milestones";

export const taskStatusEnum = pgEnum("task_status", [
  "NotStarted",
  "InProgress",
  "Blocked",
  "Completed",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "Low",
  "Medium",
  "High",
  "Urgent",
]);

export const taskAttachmentSourceEnum = pgEnum("task_attachment_source", [
  "Upload",
  "GoogleDrive",
  "Link",
]);

export const workstreamsTable = pgTable("workstreams", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  colorToken: text("color_token").notNull().default("#6B7280"),
  ownerUserId: text("owner_user_id").references(() => portalUsersTable.id, { onDelete: "set null" }),
  targetDate: text("target_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("workstreams_convening_id_name_unique").on(table.conveningId, table.name),
  index("workstreams_owner_user_id_idx").on(table.ownerUserId),
]);

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  workstreamId: text("workstream_id").notNull().references(() => workstreamsTable.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description"),
  assignee: text("assignee"),
  assigneeUserId: text("assignee_user_id").references(() => portalUsersTable.id, { onDelete: "set null" }),
  dueDate: text("due_date"),
  startDate: text("start_date"),
  progressPct: integer("progress_pct").notNull().default(0),
  isMilestone: boolean("is_milestone").notNull().default(false),
  milestoneId: text("milestone_id").references(() => milestonesTable.id, { onDelete: "set null" }),
  ownerUserId: text("owner_user_id").references(() => portalUsersTable.id, { onDelete: "set null" }),
  status: taskStatusEnum("status").notNull().default("NotStarted"),
  priority: taskPriorityEnum("priority").notNull().default("Medium"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tasks_convening_id_idx").on(t.conveningId),
  index("tasks_workstream_id_idx").on(t.workstreamId),
  index("tasks_assignee_user_id_idx").on(t.assigneeUserId),
  index("tasks_owner_user_id_idx").on(t.ownerUserId),
  index("tasks_milestone_id_idx").on(t.milestoneId),
]);

export const taskAttachmentsTable = pgTable("task_attachments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
  source: taskAttachmentSourceEnum("source").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  createdByUserId: text("created_by_user_id").references(() => portalUsersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("task_attachments_task_id_idx").on(t.taskId),
  index("task_attachments_convening_id_idx").on(t.conveningId),
  index("task_attachments_created_by_user_id_idx").on(t.createdByUserId),
]);

export const insertWorkstreamSchema = createInsertSchema(workstreamsTable).omit({ id: true, createdAt: true });
export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export const insertTaskAttachmentSchema = createInsertSchema(taskAttachmentsTable).omit({ id: true, createdAt: true, deletedAt: true });
export type InsertWorkstream = z.infer<typeof insertWorkstreamSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type InsertTaskAttachment = z.infer<typeof insertTaskAttachmentSchema>;
export type Workstream = typeof workstreamsTable.$inferSelect;
export type Task = typeof tasksTable.$inferSelect;
export type TaskAttachment = typeof taskAttachmentsTable.$inferSelect;
