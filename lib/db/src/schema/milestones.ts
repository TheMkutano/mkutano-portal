import { pgTable, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "NotStarted",
  "InProgress",
  "Complete",
  "AtRisk",
  "Blocked",
]);

export const milestonePhaseEnum = pgEnum("milestone_phase", [
  "PreEvent",
  "EventDay",
  "PostEvent",
]);

export const milestonesTable = pgTable("milestones", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  title:       text("title").notNull(),
  description: text("description"),
  phase:       milestonePhaseEnum("phase").notNull().default("PreEvent"),
  targetDate:  text("target_date"),
  owner:       text("owner"),
  status:      milestoneStatusEnum("status").notNull().default("NotStarted"),
  dependency:  text("dependency"),
  notes:       text("notes"),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt:   timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("milestones_convening_id_idx").on(t.conveningId),
]);

export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({
  id: true, createdAt: true, deletedAt: true,
});
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestonesTable.$inferSelect;
