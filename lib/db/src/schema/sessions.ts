import { pgTable, text, timestamp, boolean, pgEnum, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";
import { speakersTable } from "./speakers";
import { pillarsTable } from "./pillars";
import { engagementsTable } from "./engagements";

export const sessionFormatEnum = pgEnum("session_format", [
  "StandAlone",
  "Fireside",
  "Panel",
  "Presentation",
  "Breakaway",
  "Break",
  "Intermission",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "Proposed",
  "Tentative",
  "Confirmed",
]);

export const sessionSpeakerRoleEnum = pgEnum("session_speaker_role", [
  "Speaker",
  "Panelist",
  "Moderator",
  "Chair",
]);

export const sessionSpeakerStatusEnum = pgEnum("session_speaker_status", [
  "Proposed",
  "Confirmed",
]);

export const agendaSessionsTable = pgTable("agenda_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  day: text("day").notNull(),
  track: text("track").notNull().default("Main Stage"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  title: text("title").notNull(),
  theme: text("theme"),
  format: sessionFormatEnum("format").notNull().default("StandAlone"),
  status: sessionStatusEnum("status").notNull().default("Proposed"),
  chairSpeakerId: text("chair_speaker_id").references(() => speakersTable.id, { onDelete: "set null" }),
  pillarId: text("pillar_id").references(() => pillarsTable.id, { onDelete: "set null" }),
  sponsoredByEngagementId: text("sponsored_by_engagement_id").references(() => engagementsTable.id, { onDelete: "set null" }),
  isSponsored: boolean("is_sponsored").notNull().default(false),
  description: text("description"),
  targetSpeakers: integer("target_speakers").notNull().default(1),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("agenda_sessions_convening_day_track_time_title_unique").on(
    t.conveningId, t.day, t.track, t.startTime, t.title,
  ),
  index("agenda_sessions_convening_id_idx").on(t.conveningId),
  index("agenda_sessions_chair_speaker_id_idx").on(t.chairSpeakerId),
  index("agenda_sessions_pillar_id_idx").on(t.pillarId),
  index("agenda_sessions_sponsored_by_engagement_id_idx").on(t.sponsoredByEngagementId),
]);

export const agendaSessionSpeakersTable = pgTable("agenda_session_speakers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Production contains legacy junction rows whose parents were removed.
  // Defer these two FKs until those rows are repaired through the supported flow.
  sessionId: text("session_id").notNull(),
  speakerId: text("speaker_id").notNull(),
  role: sessionSpeakerRoleEnum("role").notNull().default("Speaker"),
  status: sessionSpeakerStatusEnum("status").notNull().default("Proposed"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("agenda_session_speakers_session_speaker_unique").on(t.sessionId, t.speakerId),
  index("agenda_session_speakers_speaker_id_idx").on(t.speakerId),
]);

export const insertAgendaSessionSchema = createInsertSchema(agendaSessionsTable).omit({ id: true, createdAt: true, deletedAt: true });
export const insertAgendaSessionSpeakerSchema = createInsertSchema(agendaSessionSpeakersTable).omit({ id: true, createdAt: true });
export type InsertAgendaSession = z.infer<typeof insertAgendaSessionSchema>;
export type InsertAgendaSessionSpeaker = z.infer<typeof insertAgendaSessionSpeakerSchema>;
export type AgendaSession = typeof agendaSessionsTable.$inferSelect;
export type AgendaSessionSpeaker = typeof agendaSessionSpeakersTable.$inferSelect;
