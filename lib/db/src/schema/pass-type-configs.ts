import { pgTable, text, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { delegatePassTypeEnum } from "./delegates";
import { conveningsTable } from "./convenings";

export const passTypeConfigsTable = pgTable("pass_type_configs", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
  passType:    delegatePassTypeEnum("pass_type").notNull(),
  label:       text("label").notNull(),
  price:       numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  capacity:    integer("capacity").notNull().default(0),
  description: text("description"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pass_type_configs_convening_pass_type_unique").on(t.conveningId, t.passType),
  index("pass_type_configs_convening_id_idx").on(t.conveningId),
]);

export const insertPassTypeConfigSchema = createInsertSchema(passTypeConfigsTable)
  .omit({ id: true, createdAt: true })
  .extend({
    price: z.union([z.string(), z.number()]).transform(String).optional(),
  });
export type InsertPassTypeConfig = z.infer<typeof insertPassTypeConfigSchema>;
export type PassTypeConfig = typeof passTypeConfigsTable.$inferSelect;
