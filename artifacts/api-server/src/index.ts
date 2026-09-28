import app from "./app";
import { logger } from "./lib/logger";
import { startDelegateExportScheduler } from "./lib/delegateExportScheduler";
import { startTaskReminderScheduler } from "./lib/taskReminderScheduler";
import { startSheetsSyncScheduler } from "./lib/sheetsSyncScheduler";
import { db, conveningsTable, conveningTeamMembersTable, portalUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * Idempotent seed: ensure every verified Internal staff member appears in every
 * convening's team so they show up in the task-assignee dropdown.
 * Safe to run on every boot — ON CONFLICT DO NOTHING is a no-op for existing rows.
 */
async function seedStaffTeamMembership() {
  try {
    const [convenings, staff] = await Promise.all([
      db.select({ id: conveningsTable.id }).from(conveningsTable),
      db
        .select({ id: portalUsersTable.id })
        .from(portalUsersTable)
        .where(
          and(
            eq(portalUsersTable.accountType, "Internal"),
            eq(portalUsersTable.emailVerified, true),
          ),
        ),
    ]);

    let inserted = 0;
    for (const conv of convenings) {
      for (const s of staff) {
        const result = await db
          .insert(conveningTeamMembersTable)
          .values({ conveningId: conv.id, userId: s.id, projectRole: "Staff", isLead: false })
          .onConflictDoNothing()
          .returning({ id: conveningTeamMembersTable.id });
        inserted += result.length;
      }
    }

    if (inserted > 0) {
      logger.info({ inserted }, "Seeded staff team membership");
    }
  } catch (err) {
    logger.warn({ err }, "Staff team membership seed failed — non-fatal");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void seedStaffTeamMembership();
  startDelegateExportScheduler();
  startTaskReminderScheduler();
  startSheetsSyncScheduler();
});
