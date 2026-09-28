import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { engagementsTable } from "./engagements";
import { conveningsTable } from "./convenings";

export const engagementStageHistoryTable = pgTable("engagement_stage_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  engagementId: text("engagement_id").notNull().references(() => engagementsTable.id, { onDelete: "cascade" }),
  conveningId: text("convening_id").notNull().references(() => conveningsTable.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  actorName: text("actor_name"),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("engagement_stage_history_engagement_id_idx").on(t.engagementId),
  index("engagement_stage_history_convening_id_idx").on(t.conveningId),
]);

export const selectEngagementStageHistorySchema = createSelectSchema(engagementStageHistoryTable);
export type EngagementStageHistory = z.infer<typeof selectEngagementStageHistorySchema>;
