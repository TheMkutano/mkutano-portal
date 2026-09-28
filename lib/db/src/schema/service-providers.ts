import { pgTable, text, timestamp, real, pgEnum, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conveningsTable } from "./convenings";

export const serviceProviderCategoryEnum = pgEnum("service_provider_category", [
  "VenueHotel",
  "Sound",
  "Stage",
  "Lighting",
  "AVStreaming",
  "Power",
  "InternetIT",
  "Graphics",
  "PrintSignage",
  "PhotoVideo",
  "MediaPR",
  "Catering",
  "Entertainment",
  "FurnitureDecor",
  "Gifting",
  "TravelLogistics",
  "Health",
  "Security",
  "ProtocolStaffing",
  "Interpretation",
  "Payments",
  "Insurance",
  "ExhibitionBuild",
  "Other",
]);

export const procurementStatusEnum = pgEnum("procurement_status", [
  "Identified",
  "Shortlisted",
  "Quoted",
  "Contracted",
  "Paid",
  "Completed",
  "OnHold",
]);

export const serviceProvidersTable = pgTable("service_providers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Null marks pre-existing global directory rows. They remain read-only.
  conveningId: text("convening_id").references(() => conveningsTable.id, { onDelete: "restrict" }),
  company: text("company").notNull(),
  category: serviceProviderCategoryEnum("category").notNull(),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  url: text("url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("service_providers_convening_id_idx").on(t.conveningId),
]);

export const providerBookingsTable = pgTable("provider_bookings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "restrict" }),
  serviceProviderId: text("service_provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "restrict" }),
  // Existing bookings fall back to the legacy global provider when null.
  providerProfile: jsonb("provider_profile").$type<ServiceProvider | null>(),
  procurementStatus: procurementStatusEnum("procurement_status").notNull().default("Identified"),
  estimatedCost: real("estimated_cost"),
  currency: text("currency").notNull().default("USD"),
  contractUrl: text("contract_url"),
  responsiblePerson: text("responsible_person"),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
  scheduledEnd: timestamp("scheduled_end", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("provider_bookings_convening_id_idx").on(t.conveningId),
  index("provider_bookings_service_provider_id_idx").on(t.serviceProviderId),
]);

export const insertServiceProviderSchema = createInsertSchema(serviceProvidersTable).omit({ id: true, createdAt: true });
export const insertProviderBookingSchema = createInsertSchema(providerBookingsTable).omit({ id: true, createdAt: true });
export type InsertServiceProvider = z.infer<typeof insertServiceProviderSchema>;
export type InsertProviderBooking = z.infer<typeof insertProviderBookingSchema>;
export type ServiceProvider = typeof serviceProvidersTable.$inferSelect;
export type ProviderBooking = typeof providerBookingsTable.$inferSelect;
