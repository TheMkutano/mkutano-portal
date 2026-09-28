import { pgTable, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";

export const documentTypeEnum = pgEnum("document_type", [
  "Deck",
  "GuidingDoc",
  "Prospectus",
  "Report",
  "AideMemoire",
  "Communique",
  "Contract",
  "Other",
]);

export const templateCategoryEnum = pgEnum("template_category", [
  "PartnerLetter",
  "SponsorLetter",
  "PensionFundLetter",
  "AdvisoryBoardConceptNote",
  "AdvisoryBoardInvitation",
  "SteeringCommitteeConceptNote",
  "Other",
]);

export const templateScopeEnum = pgEnum("template_scope", [
  "Global",
  "Convening",
]);

export const conveningDocumentsTable = pgTable("convening_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").references(() => conveningsTable.id, { onDelete: "cascade" }),
  type: documentTypeEnum("type").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  version: integer("version").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("convening_documents_convening_id_idx").on(t.conveningId),
]);

export const outreachTemplatesTable = pgTable("outreach_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  category: templateCategoryEnum("category").notNull(),
  scope: templateScopeEnum("scope").notNull().default("Global"),
  conveningId: text("convening_id").references(() => conveningsTable.id, { onDelete: "cascade" }),
  bodyMarkdown: text("body_markdown").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("outreach_templates_convening_id_idx").on(t.conveningId),
]);

export const insertConveningDocumentSchema = createInsertSchema(conveningDocumentsTable).omit({ id: true, createdAt: true });
export const insertOutreachTemplateSchema = createInsertSchema(outreachTemplatesTable).omit({ id: true, createdAt: true });

export type ConveningDocument = typeof conveningDocumentsTable.$inferSelect;
export type OutreachTemplate = typeof outreachTemplatesTable.$inferSelect;
export type InsertConveningDocument = z.infer<typeof insertConveningDocumentSchema>;
export type InsertOutreachTemplate = z.infer<typeof insertOutreachTemplateSchema>;
