import { pgTable, text, timestamp, pgEnum, json, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const historicalEngagementEnum = pgEnum("historical_engagement", ["Yes", "No", "Partial"]);
export const potentialTierEnum = pgEnum("potential_tier", [
  "Platinum",
  "Gold",
  "Silver",
  "CredibilityOnly",
  "InKind",
]);
export const partnerTypeEnum = pgEnum("partner_type", [
  "GovernmentPolicy",     // 1. Government & Public Institutions
  "DevelopmentPartner",   // 2. Development Partners & Multilaterals
  "DevelopmentFinance",   // 3. Development Finance Institutions (DFIs)
  "BanksFinancial",       // 4. Banks & Private Financial Institutions
  "PensionFunds",         // 5. Pension Funds & Social Security Institutions
  "PensionBodies",        // 6. Pension Industry Bodies & Associations
  "CapitalMarkets",       // 7. Capital Markets & Financial Infrastructure
  "TelecomDigital",       // 8. Telecom & Digital Solutions
  "KnowledgeMedia",       // 9. Knowledge, Research & Media
  "TourismHospitality",   // 10. Tourism, Destination Promotion & Hospitality
  "AviationLogistics",    // 11. Aviation, Logistics & Event Services
  "Media",                // Legacy media-partner category retained for production compatibility
  "Institutional",        // Unclassified / Other
]);
export const partnerSectorEnum = pgEnum("partner_sector", [
  "Public",
  "Private",
  "DevelopmentPartner",
  "CivilSociety",
  "Academia",
]);

export const partnersTable = pgTable("partners", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  institutionName: text("institution_name").notNull(),
  partnerType: partnerTypeEnum("partner_type").notNull().default("Institutional"),
  sector: partnerSectorEnum("sector"),
  industry: text("industry"),
  logoUrl: text("logo_url"),
  description: text("description"),
  location: text("location"),
  contactName: text("contact_name"),
  contactTitle: text("contact_title"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  principals: json("principals").notNull().default([]),
  potentialTier: potentialTierEnum("potential_tier").notNull().default("Silver"),
  historicalEngagement: historicalEngagementEnum("historical_engagement").notNull().default("No"),
  fitWithThem: text("fit_with_them"),
  historicalNotes: text("historical_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("partners_institution_name_unique").on(t.institutionName),
]);

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({ id: true, createdAt: true, deletedAt: true });
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
