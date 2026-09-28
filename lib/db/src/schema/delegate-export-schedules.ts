import { pgTable, text, timestamp, boolean, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";
import { portalUsersTable } from "./users";

export const delegateExportScheduleStatusEnum = ["Success", "Failed"] as const;

export const delegateExportSchedulesTable = pgTable(
  "delegate_export_schedules",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    timeOfDay: text("time_of_day").notNull().default("08:00"),
    recipients: text("recipients").array().notNull().default([]),
    segment: text("segment"),
    passTypeCategory: text("pass_type_category").notNull().default("All"),
    createdByUserId: text("created_by_user_id").notNull().references(() => portalUsersTable.id, { onDelete: "restrict" }),
    daysOfWeek: integer("days_of_week").array().notNull().default([0, 1, 2, 3, 4, 5, 6]),
    columns: text("columns").array(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("delegate_export_schedules_convening_id_idx").on(table.conveningId),
    index("delegate_export_schedules_created_by_user_id_idx").on(table.createdByUserId),
  ],
);

export const insertDelegateExportScheduleSchema = createInsertSchema(delegateExportSchedulesTable, {
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeOfDay must be in HH:mm (24h, UTC) format"),
  recipients: z.array(z.string().email()),
  passTypeCategory: z.enum(["All", "Paying", "Comp"]).default("All"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  columns: z.array(z.string()).nullish(),
})
  .omit({
    id: true,
    createdByUserId: true,
    lastRunAt: true,
    lastStatus: true,
    createdAt: true,
    updatedAt: true,
  })
  .superRefine((data, ctx) => {
    if (data.enabled && data.recipients.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "At least one recipient email is required when the schedule is enabled",
        path: ["recipients"],
      });
    }
  });

export type InsertDelegateExportSchedule = z.infer<typeof insertDelegateExportScheduleSchema>;
export type DelegateExportSchedule = typeof delegateExportSchedulesTable.$inferSelect;
