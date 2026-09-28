import { pgTable, text, timestamp, numeric, pgEnum, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";
import { partnersTable } from "./partners";

export const budgetCategoryEnum = pgEnum("budget_category", [
  "Origination",
  "Sponsorships",
  "DelegatePasses",
  "Operations",
  "Marketing",
  "Venue",
  "Catering",
  "AV",
  "Travel",
  "Contingency",
]);

export const budgetTypeEnum = pgEnum("budget_type", ["Income", "Expense"]);

export const budgetsTable = pgTable("budgets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  type: budgetTypeEnum("type").notNull().default("Expense"),
  category: budgetCategoryEnum("category").notNull(),
  lineItemName: text("line_item_name"),
  units: real("units"),
  unitCost: real("unit_cost"),
  committedAmount: numeric("committed_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  actualAmount: numeric("actual_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  relatedPartnerId: text("related_partner_id").references(() => partnersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("budgets_convening_id_idx").on(t.conveningId),
  index("budgets_related_partner_id_idx").on(t.relatedPartnerId),
]);

export const insertBudgetSchema = createInsertSchema(budgetsTable)
  .omit({ id: true, createdAt: true })
  .extend({
    // Postgres `numeric` returns/accepts strings in drizzle, but the API spec
    // types these as number — accept both and coerce to string for Drizzle.
    committedAmount: z.union([z.string(), z.number()]).transform(String).optional(),
    actualAmount: z.union([z.string(), z.number()]).transform(String).optional(),
  });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;
