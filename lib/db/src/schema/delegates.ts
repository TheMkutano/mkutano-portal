import { pgTable, text, timestamp, pgEnum, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";

export const delegatePassTypeEnum = pgEnum("delegate_pass_type", [
  "Paid",
  "EarlyBird",
  "Standard",
  "Late",
  "FreeSponsor",
  "FreeComp",
  "Speaker",
  "Press",
  "Official",
  "VIP",
]);

export const delegateStatusEnum = pgEnum("delegate_status", [
  "Registered",
  "Confirmed",
  "Attended",
  "Cancelled",
  "Waitlisted",
]);

export const delegateGenderEnum = pgEnum("delegate_gender", [
  "Female",
  "Male",
  "Other",
  "Undisclosed",
]);

export const delegateAgeBandEnum = pgEnum("delegate_age_band", [
  "Under35",
  "Age35to50",
  "Over50",
  "Undisclosed",
]);

export const delegatesTable = pgTable("delegates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  jobTitle: text("job_title"),
  organization: text("organization"),
  email: text("email"),
  country: text("country"),
  segment: text("segment"),
  passType: delegatePassTypeEnum("pass_type").notNull().default("Paid"),
  status: delegateStatusEnum("status").notNull().default("Registered"),
  gender: delegateGenderEnum("gender"),
  ageBand: delegateAgeBandEnum("age_band"),
  aum: real("aum"),
  notes: text("notes"),
  qrCode: text("qr_code").default(sql`gen_random_uuid()`).notNull(),
  dietaryRequirements: text("dietary_requirements"),
  accessNeeds: text("access_needs"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("delegates_convening_email_unique").on(t.conveningId, t.email),
  index("delegates_convening_id_idx").on(t.conveningId),
]);

export const insertDelegateSchema = createInsertSchema(delegatesTable).omit({
  id: true,
  createdAt: true,
  qrCode: true,
  deletedAt: true,
});
export type InsertDelegate = z.infer<typeof insertDelegateSchema>;
export type Delegate = typeof delegatesTable.$inferSelect;
