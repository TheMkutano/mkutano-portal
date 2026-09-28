import { pgTable, text, timestamp, boolean, numeric, integer, pgEnum, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { partnersTable, type Partner } from "./partners";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pillarsTable } from "./pillars";
import { conveningsTable } from "./convenings";

export const natureOfResponseEnum = pgEnum("nature_of_response", [
  "Interested",
  "Negotiating",
  "Declined",
  "Deferred",
]);
export const commitmentTypeEnum = pgEnum("commitment_type", [
  "Financial",
  "Speakers",
  "InKind",
  "Credibility",
  "Multiple",
]);
export const engagementStatusEnum = pgEnum("engagement_status", [
  "Prospect",
  "Negotiation",
  "ContractSigned",
  "Onboarded",
  "PostEvent",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "Unpaid",
  "PartiallyPaid",
  "Paid",
]);
export const packageTypeEnum = pgEnum("package_type", [
  "Standard",
  "Custom",
]);
export const outreachStageEnum = pgEnum("outreach_stage", [
  // Canonical 9-stage progression
  "NotStarted",
  "ContactMade",
  "EmailSent",
  "FollowUpRequired",
  "MeetingScheduled",
  "MeetingHeld",
  "ProposalSent",
  "AwaitingDecision",
  "PartnershipConfirmed",
  // Legacy values (kept for existing records)
  "Researching",
  "LetterSent",
  "IntroductionRequested",
  "FollowUpSent",
  "NegotiationUnderway",
  "ContractSent",
  "AwaitingSignature",
]);

export const engagementsTable = pgTable("engagements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  partnerId: text("partner_id").notNull().references(() => partnersTable.id, { onDelete: "restrict" }),
  // Null on legacy rows: reads fall back to the canonical record until first edit.
  // A complete snapshot (including explicit nulls) prevents edits leaking across projects.
  partnerProfile: jsonb("partner_profile").$type<Partner | null>(),
  responsiblePerson: text("responsible_person"),
  status: engagementStatusEnum("status").notNull().default("Prospect"),
  natureOfResponse: natureOfResponseEnum("nature_of_response"),
  commitmentType: commitmentTypeEnum("commitment_type"),
  commitmentDetails: text("commitment_details"),
  financialAmount: numeric("financial_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  invoiceSent: boolean("invoice_sent").notNull().default(false),
  invoicePaid: boolean("invoice_paid").notNull().default(false),
  finalTier: text("final_tier"),
  delegatePassesAllocated: integer("delegate_passes_allocated").notNull().default(0),
  brandingAssetsReceived: boolean("branding_assets_received").notNull().default(false),
  logisticsNotes: text("logistics_notes"),
  paymentPreferences: text("payment_preferences"),
  followUpRequired: boolean("follow_up_required").notNull().default(false),
  followUpDate: text("follow_up_date"),
  followUpAction: text("follow_up_action"),
  paymentStatus: paymentStatusEnum("payment_status").default("Unpaid"),
  paymentDueDate: text("payment_due_date"),
  packageName: text("package_name"),
  packageType: packageTypeEnum("package_type"),
  packageBenefits: text("package_benefits"),
  outreachStage: outreachStageEnum("outreach_stage").notNull().default("NotStarted"),
  pillarId: text("pillar_id").references(() => pillarsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("engagements_convening_partner_unique").on(t.conveningId, t.partnerId),
  index("engagements_convening_id_idx").on(t.conveningId),
  index("engagements_partner_id_idx").on(t.partnerId),
  index("engagements_pillar_id_idx").on(t.pillarId),
]);

export const insertEngagementSchema = createInsertSchema(engagementsTable)
  .omit({ id: true, createdAt: true, deletedAt: true, partnerProfile: true })
  .extend({
    // Postgres `numeric` returns/accepts strings in drizzle, but the API spec
    // types this as number — accept both and coerce to string for Drizzle.
    financialAmount: z.union([z.string(), z.number()]).transform(String).optional(),
  });
export type InsertEngagement = z.infer<typeof insertEngagementSchema>;
export type Engagement = typeof engagementsTable.$inferSelect;
