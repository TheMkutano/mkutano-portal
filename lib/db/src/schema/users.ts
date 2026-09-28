import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const accountTypeEnum = pgEnum("account_type", ["Internal", "External"]);
export const roleEnum = pgEnum("role", [
  "Admin",
  "Curator",
  "Finance",
  "PartnerLead",
  "SpeakerLead",
  "Ops",
  "PressManager",
  "Advisor",
  "Client",
]);

export const portalUsersTable = pgTable("portal_users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  authUserId: text("auth_user_id").notNull().unique().references(() => usersTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  email: text("email"),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry", { withTimezone: true }),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry", { withTimezone: true }),
  role: roleEnum("role").notNull().default("Client"),
  accountType: accountTypeEnum("account_type").notNull().default("External"),
  displayCurrency: text("display_currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPortalUserSchema = createInsertSchema(portalUsersTable).omit({ id: true, createdAt: true });
export type InsertPortalUser = z.infer<typeof insertPortalUserSchema>;
export type PortalUser = typeof portalUsersTable.$inferSelect;
