import { pgTable, text, timestamp, boolean, pgEnum, real, integer, uniqueIndex, index, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { portalUsersTable } from "./users";

export const conveningStatusEnum = pgEnum("convening_status", [
  "Planning",
  "Active",
  "Completed",
  "Archived",
]);

export const conveningsTable = pgTable("convenings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  theme: text("theme"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  venueName: text("venue_name"),
  venueConfirmed: boolean("venue_confirmed").notNull().default(false),
  status: conveningStatusEnum("status").notNull().default("Planning"),
  timezone: text("timezone").notNull().default("Africa/Kampala"),
  usdToUgxRate: real("usd_to_ugx_rate"),
  rateUpdatedAt: timestamp("rate_updated_at", { withTimezone: true }),
  registrationTarget: integer("registration_target").notNull().default(0),
  compPassCap: integer("comp_pass_cap").notNull().default(0),
  whiteLabel: boolean("white_label").notNull().default(false),
  brandLogoUrl: text("brand_logo_url"),
  brandPrimaryColor: text("brand_primary_color"),
  brandAccentColor: text("brand_accent_color"),
  googleSheetId: text("google_sheet_id"),
  sheetsLastSyncedAt: timestamp("sheets_last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const PORTAL_SECTIONS = [
  "Partners", "Speakers", "Delegates", "Budget", "DealRoom",
  "Agenda", "Exhibition", "Outcomes", "Documents", "Tasks",
] as const;
export type PortalSection = typeof PORTAL_SECTIONS[number];

export const conveningAccessTable = pgTable("convening_access", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => portalUsersTable.id, { onDelete: "cascade" }),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
  allowedSections: json("allowed_sections").$type<PortalSection[] | null>(),
}, (t) => [
  index("convening_access_convening_id_idx").on(t.conveningId),
  index("convening_access_user_id_idx").on(t.userId),
]);

export const conveningTeamMembersTable = pgTable("convening_team_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => portalUsersTable.id, { onDelete: "cascade" }),
  projectRole: text("project_role").notNull(),
  isLead: boolean("is_lead").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("convening_team_members_convening_user_unique").on(t.conveningId, t.userId),
  index("convening_team_members_convening_idx").on(t.conveningId),
  index("convening_team_members_user_id_idx").on(t.userId),
]);

export const insertConveningSchema = createInsertSchema(conveningsTable).omit({ id: true, createdAt: true });
export const insertConveningTeamMemberSchema = createInsertSchema(conveningTeamMembersTable).omit({ id: true, createdAt: true });
export type InsertConvening = z.infer<typeof insertConveningSchema>;
export type InsertConveningTeamMember = z.infer<typeof insertConveningTeamMemberSchema>;
export type Convening = typeof conveningsTable.$inferSelect;
export type ConveningAccess = typeof conveningAccessTable.$inferSelect;
export type ConveningTeamMember = typeof conveningTeamMembersTable.$inferSelect;
