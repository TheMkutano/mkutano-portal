/**
 * One-time deduplication using Drizzle ORM.
 * Removes duplicate rows keeping the OLDEST of each group and repointing
 * child rows to the survivor before deleting extras.
 *
 * RUN ORDER:
 *   1. pnpm run typecheck:libs   (ensure @workspace/db is built)
 *   2. npx tsx scripts/src/dedupe.ts
 *   3. (schema unique constraints will be added automatically)
 *   4. pnpm --filter @workspace/db run push
 */
import { db } from "@workspace/db";
import {
  partnersTable,
  speakersTable,
  engagementsTable,
  speakerEngagementsTable,
  agendaSessionsTable,
  budgetsTable,
  mediaConsentsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const log: string[] = [];

function groupBy<T>(rows: T[], keyFn: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

function oldest<T extends { createdAt: Date | string }>(rows: T[]): T {
  return [...rows].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0];
}

async function dedupePartners() {
  const partners = await db.select().from(partnersTable);
  const groups = groupBy(partners, (p) => p.institutionName.trim().toLowerCase());

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const keep = oldest(rows);
    const dropIds = rows.filter((r) => r.id !== keep.id).map((r) => r.id);

    // Repoint engagements to the surviving partner
    await db
      .update(engagementsTable)
      .set({ partnerId: keep.id })
      .where(inArray(engagementsTable.partnerId, dropIds));

    await db.delete(partnersTable).where(inArray(partnersTable.id, dropIds));
    log.push(`Partner "${keep.institutionName}": removed ${dropIds.length} duplicate(s)`);
  }
}

async function dedupeSpeakers() {
  const speakers = await db.select().from(speakersTable);
  const groups = groupBy(speakers, (s) => s.name.trim().toLowerCase());

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const keep = oldest(rows);
    const dropIds = rows.filter((r) => r.id !== keep.id).map((r) => r.id);

    // Repoint speaker engagements
    await db
      .update(speakerEngagementsTable)
      .set({ speakerId: keep.id })
      .where(inArray(speakerEngagementsTable.speakerId, dropIds));

    // Repoint media consents
    await db
      .update(mediaConsentsTable)
      .set({ speakerId: keep.id })
      .where(inArray(mediaConsentsTable.speakerId, dropIds));

    await db.delete(speakersTable).where(inArray(speakersTable.id, dropIds));
    log.push(`Speaker "${keep.name}": removed ${dropIds.length} duplicate(s)`);
  }
}

async function dedupeEngagements() {
  const rows = await db.select().from(engagementsTable);
  const groups = groupBy(rows, (e) => `${e.conveningId}|${e.partnerId}`);

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = oldest(group);
    const dropIds = group.filter((r) => r.id !== keep.id).map((r) => r.id);
    await db.delete(engagementsTable).where(inArray(engagementsTable.id, dropIds));
    log.push(`Engagement ${keep.conveningId}/${keep.partnerId}: removed ${dropIds.length}`);
  }
}

async function dedupeSpeakerEngagements() {
  const rows = await db.select().from(speakerEngagementsTable);
  const groups = groupBy(rows, (e) => `${e.conveningId}|${e.speakerId}`);

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = oldest(group);
    const dropIds = group.filter((r) => r.id !== keep.id).map((r) => r.id);
    await db.delete(speakerEngagementsTable).where(inArray(speakerEngagementsTable.id, dropIds));
    log.push(`SpeakerEngagement ${keep.conveningId}/${keep.speakerId}: removed ${dropIds.length}`);
  }
}

async function dedupeAgendaSessions() {
  const rows = await db.select().from(agendaSessionsTable);
  const groups = groupBy(
    rows,
    (s) => `${s.conveningId}|${s.day}|${s.track}|${s.startTime}|${s.title}`,
  );

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = oldest(group);
    const dropIds = group.filter((r) => r.id !== keep.id).map((r) => r.id);
    await db.delete(agendaSessionsTable).where(inArray(agendaSessionsTable.id, dropIds));
    log.push(`Session "${keep.title}": removed ${dropIds.length} duplicate(s)`);
  }
}

async function dedupeBudgets() {
  const rows = await db.select().from(budgetsTable);
  const groups = groupBy(
    rows,
    (b) => `${b.conveningId}|${b.type}|${b.category}|${b.lineItemName ?? ""}`,
  );

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = oldest(group);
    const dropIds = group.filter((r) => r.id !== keep.id).map((r) => r.id);
    await db.delete(budgetsTable).where(inArray(budgetsTable.id, dropIds));
    log.push(`Budget "${keep.lineItemName ?? keep.category}": removed ${dropIds.length} duplicate(s)`);
  }
}

async function run() {
  console.log("Running deduplication…\n");

  // Order matters: dedupe entities before their join tables
  await dedupePartners();
  await dedupeSpeakers();
  await dedupeEngagements();
  await dedupeSpeakerEngagements();
  await dedupeAgendaSessions();
  await dedupeBudgets();

  if (log.length === 0) {
    console.log("✓ No duplicates found — database is clean.");
  } else {
    console.log("Dedupe complete:\n" + log.map((l) => "  • " + l).join("\n") + "\n");
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
