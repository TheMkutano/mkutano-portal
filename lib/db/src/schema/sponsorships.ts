import { pgTable, text, timestamp, integer, json, index } from "drizzle-orm/pg-core";
import { numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { potentialTierEnum } from "./partners";
import { conveningsTable } from "./convenings";

export const sponsorshipPackagesTable = pgTable("sponsorship_packages", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
  tier:        potentialTierEnum("tier").notNull(),
  price:       numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  slots:       integer("slots").notNull().default(0),
  description: text("description"),
  perks:       json("perks").$type<string[]>().notNull().default([]),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sponsorship_packages_convening_id_idx").on(t.conveningId),
]);

export const insertSponsorshipPackageSchema = createInsertSchema(sponsorshipPackagesTable)
  .omit({ id: true, createdAt: true })
  .extend({
    price: z.union([z.string(), z.number()]).transform(String).optional(),
  });
export type InsertSponsorshipPackage = z.infer<typeof insertSponsorshipPackageSchema>;
export type SponsorshipPackage = typeof sponsorshipPackagesTable.$inferSelect;
