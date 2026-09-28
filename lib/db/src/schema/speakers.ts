import { pgTable, text, timestamp, boolean, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const preferredContactMethodEnum = pgEnum("preferred_contact_method", [
  "Email",
  "Phone",
  "WhatsApp",
]);

export const affiliationTypeEnum = pgEnum("affiliation_type", [
  "Public",
  "Private",
  "DevelopmentPartner",
  "Academic",
  "Other",
]);

export const speakerCategoryEnum = pgEnum("speaker_category", [
  "PartnerLinked",
  "NonPartnerLinked",
  "AdvisoryBoard",
  "Internal",
]);

export const speakersTable = pgTable("speakers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  title: text("title"),
  gender: text("gender"),
  expertise: text("expertise").array().notNull().default([]),
  experienceSummary: text("experience_summary"),
  photoUrl: text("photo_url"),
  bioShort: text("bio_short"),
  bioMedium: text("bio_medium"),
  bioLong: text("bio_long"),
  email: text("email"),
  phone: text("phone"),
  whatsappCapable: boolean("whatsapp_capable").notNull().default(false),
  preferredContactMethod: preferredContactMethodEnum("preferred_contact_method").notNull().default("Email"),
  timezone: text("timezone"),
  location: text("location"),
  affiliationType: affiliationTypeEnum("affiliation_type"),
  speakerCategory: speakerCategoryEnum("speaker_category"),
  notes: text("notes"),
  emergencyContact: text("emergency_contact"),
  dietaryPreferences: text("dietary_preferences"),
  sleepingPreferences: text("sleeping_preferences"),
  religiousSensitivities: text("religious_sensitivities"),
  specialAssistance: text("special_assistance"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("speakers_name_unique").on(t.name),
]);

export const insertSpeakerSchema = createInsertSchema(speakersTable).omit({ id: true, createdAt: true, deletedAt: true });
export type InsertSpeaker = z.infer<typeof insertSpeakerSchema>;
export type Speaker = typeof speakersTable.$inferSelect;
