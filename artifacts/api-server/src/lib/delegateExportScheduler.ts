import { db } from "@workspace/db";
import { delegateExportSchedulesTable, conveningsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { writeAudit } from "./audit";
import { buildDelegateExportCsv } from "./delegateExport";
import { sendScheduledDelegateExportEmail } from "./email";

const CHECK_INTERVAL_MS = 60_000;

function currentUtcHHmm(): string {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

function currentUtcDayOfWeek(): number {
  return new Date().getUTCDay(); // 0 = Sunday, 6 = Saturday
}

async function runDueSchedules(): Promise<void> {
  const nowHHmm = currentUtcHHmm();
  const now = new Date();
  const todayDow = currentUtcDayOfWeek();

  const dueSchedules = await db
    .select()
    .from(delegateExportSchedulesTable)
    .where(eq(delegateExportSchedulesTable.enabled, true));

  for (const schedule of dueSchedules) {
    if (schedule.timeOfDay !== nowHHmm) continue;
    if (schedule.lastRunAt && isSameUtcDay(schedule.lastRunAt, now)) continue;
    // Respect day-of-week selection; empty array or all-7 means run every day
    const days = schedule.daysOfWeek ?? [];
    if (days.length > 0 && days.length < 7 && !days.includes(todayDow)) continue;

    try {
      const [convening] = await db
        .select({ name: conveningsTable.name })
        .from(conveningsTable)
        .where(eq(conveningsTable.id, schedule.conveningId))
        .limit(1);

      if (!convening) {
        logger.error({ conveningId: schedule.conveningId }, "Scheduled delegate export skipped — convening not found");
        continue;
      }

      const { csv, rowCount, segment, passTypeCategory } = await buildDelegateExportCsv({
        conveningId: schedule.conveningId,
        segment: schedule.segment ?? undefined,
        passTypeCategory: schedule.passTypeCategory,
        columns: schedule.columns ?? undefined,
      });

      await sendScheduledDelegateExportEmail({
        to: schedule.recipients,
        conveningName: convening.name,
        rowCount,
        segment,
        passTypeCategory,
        csvContent: csv,
        csvFilename: `delegates-${schedule.conveningId}-${now.toISOString().slice(0, 10)}.csv`,
      });

      void writeAudit({
        conveningId: schedule.conveningId,
        actorUserId: schedule.createdByUserId,
        action: "Export",
        entityType: "Delegate",
        entityId: schedule.conveningId,
        summary: `Scheduled export sent ${rowCount} delegates to ${schedule.recipients.length} recipient${schedule.recipients.length === 1 ? "" : "s"} (segment=${segment}, passTypeCategory=${passTypeCategory})`,
      });

      await db
        .update(delegateExportSchedulesTable)
        .set({ lastRunAt: now, lastStatus: "Success" })
        .where(eq(delegateExportSchedulesTable.id, schedule.id));
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, "Scheduled delegate export failed");
      await db
        .update(delegateExportSchedulesTable)
        .set({ lastRunAt: now, lastStatus: "Failed" })
        .where(eq(delegateExportSchedulesTable.id, schedule.id))
        .catch((updateErr) => {
          logger.error({ err: updateErr, scheduleId: schedule.id }, "Failed to record scheduled export failure");
        });
    }
  }
}

/**
 * Starts the minute-tick scheduler that checks for delegate export schedules
 * due to run and sends them via email. Idempotent per-day via lastRunAt.
 */
export function startDelegateExportScheduler(): void {
  setInterval(() => {
    void runDueSchedules().catch((err) => {
      logger.error({ err }, "Delegate export scheduler tick failed");
    });
  }, CHECK_INTERVAL_MS);
}
