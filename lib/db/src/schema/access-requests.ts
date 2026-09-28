import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const accessRequestsTable = pgTable("access_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull(),
  organization: text("organization"),
  message: text("message"),
  requestedConveningId: text("requested_convening_id"),
  requestedConveningName: text("requested_convening_name"),
  status: text("status").notNull().default("Pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccessRequest = typeof accessRequestsTable.$inferSelect;
