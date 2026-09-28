import { pgTable, text, timestamp, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { speakersTable } from "./speakers";
import { conveningsTable } from "./convenings";

export const consentStatusEnum = pgEnum("consent_status", [
  "NotRequested",
  "Pending",
  "Granted",
  "PartiallyGranted",
  "Declined",
  "Withdrawn",
]);
export const capturedViaEnum = pgEnum("captured_via", ["SelfService", "AdminRecorded"]);

export const mediaConsentsTable = pgTable("media_consents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  speakerId: text("speaker_id").notNull().references(() => speakersTable.id, { onDelete: "cascade" }),
  conveningId: text("convening_id").references(() => conveningsTable.id, { onDelete: "set null" }),
  photographyConsent: boolean("photography_consent").notNull().default(false),
  videoRecordingConsent: boolean("video_recording_consent").notNull().default(false),
  liveStreamConsent: boolean("live_stream_consent").notNull().default(false),
  nameAndBioPublication: boolean("name_and_bio_publication").notNull().default(false),
  socialMediaUse: boolean("social_media_use").notNull().default(false),
  thirdPartyMediaSharing: boolean("third_party_media_sharing").notNull().default(false),
  status: consentStatusEnum("consent_status").notNull().default("NotRequested"),
  consentTextVersion: text("consent_text_version"),
  capturedVia: capturedViaEnum("captured_via"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("media_consents_speaker_id_idx").on(t.speakerId),
  index("media_consents_convening_id_idx").on(t.conveningId),
]);

export const insertMediaConsentSchema = createInsertSchema(mediaConsentsTable).omit({ id: true, createdAt: true });
export type InsertMediaConsent = z.infer<typeof insertMediaConsentSchema>;
export type MediaConsent = typeof mediaConsentsTable.$inferSelect;
