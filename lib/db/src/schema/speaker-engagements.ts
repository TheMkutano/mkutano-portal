import { pgTable, text, timestamp, boolean, numeric, integer, pgEnum, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import type { Speaker } from "./speakers";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";
import { partnersTable } from "./partners";
import { pillarsTable } from "./pillars";

export const sessionTypeEnum = pgEnum("session_type", [
  "Keynote",
  "Panelist",
  "WorkshopLead",
  "Chair",
  "Breakaway",
  "BusinessCircle",
]);
export const sourceTypeEnum = pgEnum("source_type", ["Partner", "External"]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "Identified",
  "Invited",
  "Confirmed",
  "Briefed",
  "Ready",
  "Attended",
  "Thanked",
]);
export const invitationResponseEnum = pgEnum("invitation_response", [
  "Accepted",
  "Declined",
  "Negotiating",
  "NoResponse",
]);

export const speakerEngagementsTable = pgTable("speaker_engagements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  // A legacy production row references a removed speaker. Keep application-level
  // ownership checks until that record is repaired, then this FK can be restored.
  speakerId: text("speaker_id").notNull(),
  // A full project-owned copy. Legacy null values read from the original speaker.
  speakerProfile: jsonb("speaker_profile").$type<Speaker | null>(),
  sessionType: sessionTypeEnum("session_type"),
  sessionTitle: text("session_title"),
  sessionTheme: text("session_theme"),
  sourcePartnerId: text("source_partner_id").references(() => partnersTable.id, { onDelete: "set null" }),
  sourceType: sourceTypeEnum("source_type").notNull().default("External"),
  invitationStatus: invitationStatusEnum("invitation_status").notNull().default("Identified"),
  invitationResponse: invitationResponseEnum("invitation_response").notNull().default("NoResponse"),
  dueDate: text("due_date"),
  briefingDocsSent: boolean("briefing_docs_sent").notNull().default(false),
  briefingDocsUrl: text("briefing_docs_url"),
  logisticsConfirmed: boolean("logistics_confirmed").notNull().default(false),
  flightBookingRequired: boolean("flight_booking_required").notNull().default(false),
  accommodationRequired: boolean("accommodation_required").notNull().default(false),
  groundTransportRequired: boolean("ground_transport_required").notNull().default(false),
  honorariumAmount: numeric("honorarium_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  honorariumPaid: boolean("honorarium_paid").notNull().default(false),
  pillarId: text("pillar_id").references(() => pillarsTable.id, { onDelete: "set null" }),
  responsiblePerson: text("responsible_person"),
  thankYouSent: boolean("thank_you_sent").notNull().default(false),
  thankYouDate: text("thank_you_date"),
  sessionRecordingShared: boolean("session_recording_shared").notNull().default(false),
  photoReleasedToMedia: boolean("photo_released_to_media").notNull().default(false),
  feedbackCollected: boolean("feedback_collected").notNull().default(false),
  feedbackScore: integer("feedback_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("speaker_engagements_convening_speaker_unique").on(t.conveningId, t.speakerId),
  index("speaker_engagements_convening_id_idx").on(t.conveningId),
  index("speaker_engagements_speaker_id_idx").on(t.speakerId),
  index("speaker_engagements_source_partner_id_idx").on(t.sourcePartnerId),
  index("speaker_engagements_pillar_id_idx").on(t.pillarId),
]);

export const insertSpeakerEngagementSchema = createInsertSchema(speakerEngagementsTable)
  .omit({ id: true, createdAt: true, deletedAt: true, speakerProfile: true })
  .extend({
    // Postgres `numeric` returns/accepts strings in drizzle, but the API spec
    // types this as number — accept both and coerce to string for Drizzle.
    honorariumAmount: z.union([z.string(), z.number()]).transform(String).optional(),
  });
export type InsertSpeakerEngagement = z.infer<typeof insertSpeakerEngagementSchema>;
export type SpeakerEngagement = typeof speakerEngagementsTable.$inferSelect;
