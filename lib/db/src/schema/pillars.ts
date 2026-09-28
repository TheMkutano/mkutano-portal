import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";

export const pillarsTable = pgTable("pillars", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  // Partial index — only active (non-deleted) pillars must be unique per convening+name.
  // Applied directly via SQL: WHERE deleted_at IS NULL
  uniqueIndex("pillars_convening_name_unique").on(t.conveningId, t.name),
  index("pillars_convening_id_idx").on(t.conveningId),
]);

export const insertPillarSchema = createInsertSchema(pillarsTable).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});
export type InsertPillar = z.infer<typeof insertPillarSchema>;
export type Pillar = typeof pillarsTable.$inferSelect;
