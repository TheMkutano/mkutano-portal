import { db } from "@workspace/db";
import { conveningsTable, portalUsersTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { syncConveningToSheets, GoogleSheetsNotConfiguredError } from "./sheetsSync";
import { sendSheetsSyncSuccessEmail, sendSheetsSyncFailureEmail } from "./email";

const CHECK_INTERVAL_MS = 60_000;
const SYNC_HOUR_UTC = 6;
const INTER_CONVENING_DELAY_MS = 2_000;

function currentUtcHour(): number {
  return new Date().getUTCHours();
}

function currentUtcMinute(): number {
  return new Date().getUTCMinutes();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns email addresses of all Admin-role portal users. */
async function getAdminEmails(): Promise<string[]> {
  const admins = await db
    .select({ email: portalUsersTable.email })
    .from(portalUsersTable)
    .where(eq(portalUsersTable.role, "Admin"));
  return admins.flatMap((a) => (a.email ? [a.email] : []));
}

async function runScheduledSync(): Promise<void> {
  const hour   = currentUtcHour();
  const minute = currentUtcMinute();

  if (hour !== SYNC_HOUR_UTC || minute !== 0) return;

  logger.info("Running scheduled Google Sheets sync (06:00 UTC)");

  // Only sync convenings that already have a linked spreadsheet.
  // The scheduler must never auto-create sheets for convenings that have
  // not been manually synced at least once.
  const convenings = await db
    .select({ id: conveningsTable.id, name: conveningsTable.name })
    .from(conveningsTable)
    .where(isNotNull(conveningsTable.googleSheetId));

  // Fetch admin emails once for the whole run (same set for all convenings).
  const adminEmails = await getAdminEmails().catch((err) => {
    logger.error({ err }, "Failed to fetch admin emails for sync notification");
    return [] as string[];
  });

  for (const convening of convenings) {
    try {
      const result = await syncConveningToSheets(convening.id, "scheduler");
      logger.info({ conveningId: convening.id, name: convening.name }, "Scheduled sheets sync complete");

      if (adminEmails.length > 0) {
        void sendSheetsSyncSuccessEmail({
          to: adminEmails,
          conveningName: convening.name,
          spreadsheetUrl: result.spreadsheetUrl,
          tabCounts: result.tabCounts,
          syncedAt: result.sheetsLastSyncedAt,
        }).catch((err) => {
          logger.error({ err, conveningId: convening.id }, "Failed to send sheets sync success email");
        });
      }
    } catch (err) {
      if (err instanceof GoogleSheetsNotConfiguredError) {
        logger.warn({ conveningId: convening.id }, "Google Sheets connector not configured — skipping");
        break;
      }
      logger.error({ err, conveningId: convening.id }, "Scheduled sheets sync failed for convening");

      if (adminEmails.length > 0) {
        const message = err instanceof Error ? err.message : String(err);
        void sendSheetsSyncFailureEmail({
          to: adminEmails,
          conveningName: convening.name,
          errorMessage: message,
          failedAt: new Date().toISOString(),
        }).catch((emailErr) => {
          logger.error({ emailErr, conveningId: convening.id }, "Failed to send sheets sync failure email");
        });
      }
    }

    // Pause between convenings to avoid hitting Google API quota limits
    await sleep(INTER_CONVENING_DELAY_MS);
  }
}

export function startSheetsSyncScheduler(): void {
  setInterval(() => {
    void runScheduledSync().catch((err) => {
      logger.error({ err }, "Sheets sync scheduler tick failed");
    });
  }, CHECK_INTERVAL_MS);

  logger.info({ hourUtc: SYNC_HOUR_UTC }, "Google Sheets sync scheduler started");
}
