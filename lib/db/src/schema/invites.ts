import { pgTable, text, timestamp, json, index } from "drizzle-orm/pg-core";
import { roleEnum, accountTypeEnum, portalUsersTable } from "./users";
import { conveningsTable, type PortalSection } from "./convenings";

export const inviteTokensTable = pgTable("invite_tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  token: text("token").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("Client"),
  accountType: accountTypeEnum("account_type").notNull().default("Internal"),
  conveningId: text("convening_id").references(() => conveningsTable.id, { onDelete: "cascade" }),
  allowedSections: json("allowed_sections").$type<PortalSection[] | null>(),
  createdByUserId: text("created_by_user_id").notNull().references(() => portalUsersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invite_tokens_convening_id_idx").on(t.conveningId),
  index("invite_tokens_created_by_user_id_idx").on(t.createdByUserId),
]);

export type InviteToken = typeof inviteTokensTable.$inferSelect;
