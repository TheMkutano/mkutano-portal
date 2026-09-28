import { pgTable, text, timestamp, real, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";
import { partnersTable } from "./partners";

export const projectStageEnum = pgEnum("project_stage", [
  "Concept",
  "Prefeasibility",
  "Feasibility",
  "Bankable",
  "Construction",
  "Operational",
]);

export const dealSideEnum = pgEnum("deal_side", [
  "CapitalSeeking",
  "CapitalProvider",
  "Offtaker",
  "Supplier",
]);

export const dealStageEnum = pgEnum("deal_stage", [
  "Preliminary",
  "PreFeasibility",
  "Feasibility",
  "CommercialClose",
  "PartFinance",
  "Refinance",
  "Closed",
  "Stalled",
]);

export const matchStatusEnum = pgEnum("match_status", [
  "Suggested",
  "Accepted",
  "Declined",
]);

export const meetingStatusEnum = pgEnum("meeting_status", [
  "Proposed",
  "Confirmed",
  "Held",
  "NoShow",
]);

export const dealCommitmentTypeEnum = pgEnum("deal_commitment_type", [
  "LOI",
  "MoU",
  "TermSheet",
  "Investment",
]);

export const registrationStatusEnum = pgEnum("registration_status", [
  "Registered",
  "Pending",
  "NotRequired",
  "Expired",
]);

export const licensingStatusEnum = pgEnum("licensing_status", [
  "Licensed",
  "Pending",
  "NotRequired",
  "Expired",
]);

export const dealProjectsTable = pgTable("deal_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  side: dealSideEnum("side").notNull(),
  sector: text("sector"),
  ticketSizeMin: real("ticket_size_min"),
  ticketSizeMax: real("ticket_size_max"),
  currency: text("currency").notNull().default("USD"),
  description: text("description"),
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
  originator: text("originator"),
  partnerId: text("partner_id").references(() => partnersTable.id, { onDelete: "set null" }),
  bankabilityScore: integer("bankability_score"),
  stage: dealStageEnum("stage").notNull().default("Preliminary"),
  projectStage: projectStageEnum("project_stage"),
  registrationStatus: registrationStatusEnum("registration_status").default("NotRequired"),
  licensingStatus: licensingStatusEnum("licensing_status").default("NotRequired"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("deal_projects_convening_id_idx").on(t.conveningId),
  index("deal_projects_partner_id_idx").on(t.partnerId),
]);

export const dealMatchesTable = pgTable("deal_matches", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
  projectAId: text("project_a_id").notNull().references(() => dealProjectsTable.id, { onDelete: "cascade" }),
  projectBId: text("project_b_id").notNull().references(() => dealProjectsTable.id, { onDelete: "cascade" }),
  matchScore: integer("match_score").notNull().default(0),
  rationale: text("rationale"),
  status: matchStatusEnum("status").notNull().default("Suggested"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("deal_matches_convening_id_idx").on(t.conveningId),
  index("deal_matches_project_a_id_idx").on(t.projectAId),
  index("deal_matches_project_b_id_idx").on(t.projectBId),
]);

export const dealMeetingsTable = pgTable("deal_meetings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
  projectAId: text("project_a_id").notNull().references(() => dealProjectsTable.id, { onDelete: "cascade" }),
  projectBId: text("project_b_id").notNull().references(() => dealProjectsTable.id, { onDelete: "cascade" }),
  scheduledAt: text("scheduled_at"),
  room: text("room"),
  status: meetingStatusEnum("status").notNull().default("Proposed"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("deal_meetings_convening_id_idx").on(t.conveningId),
  index("deal_meetings_project_a_id_idx").on(t.projectAId),
  index("deal_meetings_project_b_id_idx").on(t.projectBId),
]);

export const dealCommitmentsTable = pgTable("deal_commitments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  type: dealCommitmentTypeEnum("type").notNull(),
  value: real("value").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  partiesText: text("parties_text"),
  signedAt: text("signed_at"),
  dealProjectId: text("deal_project_id").references(() => dealProjectsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("deal_commitments_convening_id_idx").on(t.conveningId),
  index("deal_commitments_deal_project_id_idx").on(t.dealProjectId),
]);

export const insertDealProjectSchema = createInsertSchema(dealProjectsTable).omit({ id: true, createdAt: true, deletedAt: true });
export const insertDealMatchSchema = createInsertSchema(dealMatchesTable).omit({ id: true, createdAt: true });
export const insertDealMeetingSchema = createInsertSchema(dealMeetingsTable).omit({ id: true, createdAt: true });
export const insertDealCommitmentSchema = createInsertSchema(dealCommitmentsTable).omit({ id: true, createdAt: true, deletedAt: true });

export type DealProject = typeof dealProjectsTable.$inferSelect;
export type DealMatch = typeof dealMatchesTable.$inferSelect;
export type DealMeeting = typeof dealMeetingsTable.$inferSelect;
export type DealCommitment = typeof dealCommitmentsTable.$inferSelect;
export type InsertDealProject = z.infer<typeof insertDealProjectSchema>;
export type InsertDealMatch = z.infer<typeof insertDealMatchSchema>;
export type InsertDealMeeting = z.infer<typeof insertDealMeetingSchema>;
export type InsertDealCommitment = z.infer<typeof insertDealCommitmentSchema>;

