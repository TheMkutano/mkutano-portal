import { pgTable, text, timestamp, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";
import { agendaSessionsTable } from "./sessions";

export const commitmentCategoryEnum = pgEnum("commitment_category", [
  "Policy",
  "Investment",
  "Skills",
  "Innovation",
  "ESG",
  "Inclusion",
  "Governance",
]);

export const commitmentSourceEnum = pgEnum("commitment_source", [
  "BusinessCircle",
  "DealRoom",
  "Plenary",
  "Roundtable",
]);

export const commitmentStatusEnum = pgEnum("commitment_status", [
  "Proposed",
  "Agreed",
  "InProgress",
  "Delivered",
  "Stalled",
]);

export const commitmentsTable = pgTable("commitments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description"),
  category: commitmentCategoryEnum("category").notNull(),
  ownerName: text("owner_name"),
  ownerOrg: text("owner_org"),
  source: commitmentSourceEnum("source").notNull().default("Plenary"),
  sourceSessionId: text("source_session_id").references(() => agendaSessionsTable.id, { onDelete: "set null" }),
  dueDate: text("due_date"),
  status: commitmentStatusEnum("status").notNull().default("Proposed"),
  inAideMemoire: boolean("in_aide_memoire").notNull().default(false),
  publishedToScorecard: boolean("published_to_scorecard").notNull().default(false),
  originEdition: text("origin_edition"),
  progressNote: text("progress_note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("commitments_convening_id_idx").on(t.conveningId),
  index("commitments_source_session_id_idx").on(t.sourceSessionId),
]);

export const insertCommitmentSchema = createInsertSchema(commitmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Commitment = typeof commitmentsTable.$inferSelect;
export type InsertCommitment = z.infer<typeof insertCommitmentSchema>;
