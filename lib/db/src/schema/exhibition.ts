import { pgTable, text, timestamp, numeric, real, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";

export const boothTierEnum = pgEnum("booth_tier", ["Premium", "Standard", "Startup"]);
export const boothStatusEnum = pgEnum("booth_status", ["Available", "Reserved", "Booked"]);
export const exhibitorContractStatusEnum = pgEnum("exhibitor_contract_status", [
  "Prospect",
  "Contracted",
  "Paid",
]);

export const exhibitorsTable = pgTable("exhibitors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  company: text("company").notNull(),
  sector: text("sector"),
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  url: text("url"),
  logoUrl: text("logo_url"),
  description: text("description"),
  contractStatus: exhibitorContractStatusEnum("contract_status").notNull().default("Prospect"),
  feeAmount: numeric("fee_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("exhibitors_convening_id_idx").on(t.conveningId),
]);

export const boothsTable = pgTable("booths", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  zone: text("zone").notNull(),
  tier: boothTierEnum("tier").notNull().default("Standard"),
  sizeSqm: real("size_sqm").notNull().default(12),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("4000"),
  status: boothStatusEnum("status").notNull().default("Available"),
  posX: real("pos_x").notNull().default(0),
  posY: real("pos_y").notNull().default(0),
  width: real("width").notNull().default(120),
  height: real("height").notNull().default(80),
  exhibitorId: text("exhibitor_id").references(() => exhibitorsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("booths_convening_id_idx").on(t.conveningId),
  index("booths_exhibitor_id_idx").on(t.exhibitorId),
]);

export const insertExhibitorSchema = createInsertSchema(exhibitorsTable)
  .omit({ id: true, createdAt: true, deletedAt: true })
  .extend({
    feeAmount: z.union([z.string(), z.number()]).transform(String).optional(),
  });
export type InsertExhibitor = z.infer<typeof insertExhibitorSchema>;
export type Exhibitor = typeof exhibitorsTable.$inferSelect;

export const insertBoothSchema = createInsertSchema(boothsTable)
  .omit({ id: true, createdAt: true, deletedAt: true })
  .extend({
    price: z.union([z.string(), z.number()]).transform(String).optional(),
  });
export type InsertBooth = z.infer<typeof insertBoothSchema>;
export type Booth = typeof boothsTable.$inferSelect;
