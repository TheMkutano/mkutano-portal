import { db } from "@workspace/db";
import {
  tasksTable,
  workstreamsTable,
  conveningsTable,
  portalUsersTable,
} from "@workspace/db";
import { eq, ne, and, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { sendTaskReminderEmail } from "./email";

const CHECK_INTERVAL_MS = 60_000;
const REMINDER_HOUR_UTC = 9;

function currentUtcHour(): number {
  return new Date().getUTCHours();
}

function currentUtcMinute(): number {
  return new Date().getUTCMinutes();
}

async function runReminders(): Promise<void> {
  const hour = currentUtcHour();
  const minute = currentUtcMinute();

  if (hour !== REMINDER_HOUR_UTC || minute !== 0) return;

  logger.info("Running daily task reminder emails");

  const incompleteAssigned = await db
    .select({
      taskId:         tasksTable.id,
      title:          tasksTable.title,
      priority:       tasksTable.priority,
      dueDate:        tasksTable.dueDate,
      status:         tasksTable.status,
      assigneeUserId: tasksTable.assigneeUserId,
      conveningId:    tasksTable.conveningId,
      workstreamId:   tasksTable.workstreamId,
    })
    .from(tasksTable)
    .where(
      and(
        ne(tasksTable.status, "Completed"),
        isNotNull(tasksTable.assigneeUserId),
      ),
    );

  if (incompleteAssigned.length === 0) {
    logger.info("No incomplete assigned tasks — skipping reminders");
    return;
  }

  const uniqueConveningIds = [...new Set(incompleteAssigned.map((t) => t.conveningId))];
  const uniqueWorkstreamIds = [...new Set(incompleteAssigned.map((t) => t.workstreamId))];
  const uniqueUserIds = [...new Set(
    incompleteAssigned.map((t) => t.assigneeUserId).filter(Boolean) as string[],
  )];

  const [conveningRows, workstreamRows, portalUserRows] = await Promise.all([
    db.select({ id: conveningsTable.id, name: conveningsTable.name })
      .from(conveningsTable)
      .then((rows) => rows.filter((r) => uniqueConveningIds.includes(r.id))),
    db.select({ id: workstreamsTable.id, name: workstreamsTable.name })
      .from(workstreamsTable)
      .then((rows) => rows.filter((r) => uniqueWorkstreamIds.includes(r.id))),
    db.select({ id: portalUsersTable.id, name: portalUsersTable.name, email: portalUsersTable.email })
      .from(portalUsersTable)
      .then((rows) => rows.filter((r) => uniqueUserIds.includes(r.id))),
  ]);

  const conveningById = new Map(conveningRows.map((c) => [c.id, c.name]));
  const workstreamById = new Map(workstreamRows.map((w) => [w.id, w.name]));
  const userById = new Map(portalUserRows.map((u) => [u.id, u]));

  const tasksByUser = new Map<string, typeof incompleteAssigned>();
  for (const task of incompleteAssigned) {
    if (!task.assigneeUserId) continue;
    const list = tasksByUser.get(task.assigneeUserId) ?? [];
    list.push(task);
    tasksByUser.set(task.assigneeUserId, list);
  }

  const origin = process.env.PORTAL_URL ?? "https://portal.themkutano.com";

  for (const [userId, userTasks] of tasksByUser) {
    const user = userById.get(userId);
    if (!user?.email) continue;

    const priorityOrder: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
    const sorted = [...userTasks].sort(
      (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2),
    );

    try {
      await sendTaskReminderEmail({
        to: user.email,
        assigneeName: user.name ?? user.email,
        tasks: sorted.map((t) => ({
          title:         t.title,
          priority:      t.priority,
          dueDate:       t.dueDate,
          status:        t.status,
          conveningName: conveningById.get(t.conveningId) ?? t.conveningId,
          workstreamName: workstreamById.get(t.workstreamId) ?? t.workstreamId,
        })),
        portalUrl: origin,
      });
      logger.info({ userId, taskCount: sorted.length }, "Task reminder email sent");
    } catch (err) {
      logger.error({ err, userId }, "Failed to send task reminder email");
    }
  }
}

export function startTaskReminderScheduler(): void {
  setInterval(() => {
    void runReminders().catch((err) => {
      logger.error({ err }, "Task reminder scheduler tick failed");
    });
  }, CHECK_INTERVAL_MS);

  logger.info({ hourUtc: REMINDER_HOUR_UTC }, "Task reminder scheduler started");
}
