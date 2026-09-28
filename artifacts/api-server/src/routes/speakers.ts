import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  speakersTable, speakerEngagementsTable, mediaConsentsTable,
  agendaSessionSpeakersTable, agendaSessionsTable, insertSpeakerSchema,
  pillarsTable,
} from "@workspace/db";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";
import { isUniqueViolation } from "../lib/pgError";
import { projectProfile } from "../lib/projectProfile";

const router: IRouter = Router();

// ── GET /speakers ──────────────────────────────────────────────────────────────
router.get("/speakers", requirePermission("speakers:read"), requireConveningAccess(), async (req: Request, res: Response) => {
  const { conveningId } = req.query;

  if (typeof conveningId !== "string" || !conveningId) {
    res.status(422).json({ error: "conveningId is required" }); return;
  }

  const engagements = await db
    .select()
    .from(speakerEngagementsTable)
    .where(
      and(
        eq(speakerEngagementsTable.conveningId, conveningId as string),
        isNull(speakerEngagementsTable.deletedAt),
      ),
    );

  if (engagements.length === 0) { res.json([]); return; }

  const speakerIds = [...new Set(engagements.map((e) => e.speakerId))];

  const speakers = await db
    .select()
    .from(speakersTable)
    .where(and(inArray(speakersTable.id, speakerIds), notDeleted(speakersTable)));

  const consents = await db
    .select()
    .from(mediaConsentsTable)
    .where(
      and(
        inArray(mediaConsentsTable.speakerId, speakerIds),
        eq(mediaConsentsTable.conveningId, conveningId as string),
      ),
    );

  const conveningSessionsRaw = await db
    .select({ id: agendaSessionsTable.id, title: agendaSessionsTable.title, day: agendaSessionsTable.day, startTime: agendaSessionsTable.startTime })
    .from(agendaSessionsTable)
    .where(
      and(
        eq(agendaSessionsTable.conveningId, conveningId as string),
        notDeleted(agendaSessionsTable),
      ),
    );

  const sessionIds = conveningSessionsRaw.map((s) => s.id);
  const sessionById = new Map(conveningSessionsRaw.map((s) => [s.id, s]));

  let sessionSpeakerRows: { sessionId: string; speakerId: string; role: string; status: string }[] = [];
  if (sessionIds.length > 0) {
    sessionSpeakerRows = await db
      .select({
        sessionId: agendaSessionSpeakersTable.sessionId,
        speakerId: agendaSessionSpeakersTable.speakerId,
        role:      agendaSessionSpeakersTable.role,
        status:    agendaSessionSpeakersTable.status,
      })
      .from(agendaSessionSpeakersTable)
      .where(
        and(
          inArray(agendaSessionSpeakersTable.sessionId, sessionIds),
          inArray(agendaSessionSpeakersTable.speakerId, speakerIds),
        ),
      );
  }

  const sessionsBySpeaker = new Map<string, { sessionId: string; sessionTitle: string | null; day: string | null; startTime: string | null; role: string; status: string }[]>();
  for (const row of sessionSpeakerRows) {
    const sess = sessionById.get(row.sessionId);
    if (!sessionsBySpeaker.has(row.speakerId)) sessionsBySpeaker.set(row.speakerId, []);
    sessionsBySpeaker.get(row.speakerId)!.push({
      sessionId:    row.sessionId,
      sessionTitle: sess?.title ?? null,
      day:          sess?.day ?? null,
      startTime:    sess?.startTime ?? null,
      role:         row.role,
      status:       row.status,
    });
  }

  const consentBySpeaker = new Map(consents.map((c) => [c.speakerId, c]));
  const engagementBySpeaker = new Map(engagements.map((e) => [e.speakerId, e]));

  // Load pillars once for this convening so we can resolve pillarId → name
  const pillarIds = [...new Set(engagements.map((e) => e.pillarId).filter(Boolean))] as string[];
  const pillarRows = pillarIds.length > 0
    ? await db.select({ id: pillarsTable.id, name: pillarsTable.name })
        .from(pillarsTable)
        .where(inArray(pillarsTable.id, pillarIds))
    : [];
  const pillarNameById = new Map(pillarRows.map((p) => [p.id, p.name]));

  const result = speakers.map((s) => {
    const eng = engagementBySpeaker.get(s.id);
    return {
      ...projectProfile(s, eng?.speakerProfile),
      consentStatus:     consentBySpeaker.get(s.id)?.status ?? "NotRequested",
      engagementStatus:  eng?.invitationStatus ?? "Identified",
      engagementDueDate: eng?.dueDate ?? null,
      engagementId:      eng?.id ?? null,
      pillarId:          eng?.pillarId ?? null,
      pillarName:        eng?.pillarId ? (pillarNameById.get(eng.pillarId) ?? null) : null,
      sessions:          sessionsBySpeaker.get(s.id) ?? [],
    };
  });

  res.json(result.sort((a, b) => a.name.localeCompare(b.name)));
});

// ── POST /speakers ─────────────────────────────────────────────────────────────
router.post("/speakers", requirePermission("speakers:write"), requireConveningAccess(), async (req: Request, res: Response) => {
  const conveningId = req.body?.conveningId;
  if (typeof conveningId !== "string" || !conveningId) {
    res.status(422).json({ error: "conveningId is required" }); return;
  }
  const parse = insertSpeakerSchema.safeParse(req.body);
  if (!parse.success) {
    const errors: Record<string, string> = {};
    for (const issue of parse.error.issues) {
      const key = issue.path.join(".") || "root";
      if (!errors[key]) errors[key] = issue.message;
    }
    res.status(400).json({ error: "Validation failed", errors });
    return;
  }

  const name = parse.data.name.trim();
  if (!name) { res.status(422).json({ error: "Speaker name is required" }); return; }
  let created;
  try {
    // Reuse canonical identity if present; each project stores an independent profile.
    created = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(29860, hashtext(${name.toLowerCase()}))`);
      const matches = await tx.select().from(speakersTable)
        .where(sql`lower(trim(${speakersTable.name})) = ${name.toLowerCase()}`);
      if (matches.length > 1) throw new Error("Multiple speaker identities match. Resolve duplicate identities before linking.");
      if (matches[0]?.deletedAt) throw new Error("Speaker identity is archived. Restore it before linking.");
      const speaker = matches[0] ?? (await tx.insert(speakersTable)
        .values({ ...parse.data, name, expertise: parse.data.expertise ?? [] }).returning())[0];
      const [prior] = await tx.select().from(speakerEngagementsTable).where(and(
        eq(speakerEngagementsTable.speakerId, speaker.id),
        eq(speakerEngagementsTable.conveningId, conveningId)));
      if (prior) throw new Error(prior.deletedAt
        ? "Speaker was previously removed from this convening. Restore their engagement first."
        : "Speaker already belongs to this convening.");
      const [engagement] = await tx.insert(speakerEngagementsTable).values({
        speakerId: speaker.id, conveningId, speakerProfile: {
          ...speaker, ...parse.data, name, id: speaker.id,
        },
      }).returning();
      return { ...speaker, ...engagement.speakerProfile, engagementId: engagement.id };
    });
  } catch (error) {
    if (isUniqueViolation(error) || error instanceof Error && /already|archived|removed|Multiple/.test(error.message)) {
      res.status(409).json({ error: error instanceof Error ? error.message : "Speaker already linked" }); return;
    }
    throw error;
  }

  void writeAudit({
    actorUserId: req.portalUser!.id,
    action: "Create",
    entityType: "Speaker",
    entityId: created.id,
    summary: `Created speaker ${created.name}`,
    after: created,
  });

  res.status(201).json(created);
});

// ── GET /speakers/:id ──────────────────────────────────────────────────────────
router.get("/speakers/:id", requirePermission("speakers:read"), requireConveningAccess(), async (req: Request, res: Response) => {
  const conveningId = String(req.query.conveningId ?? "");
  if (!conveningId) { res.status(422).json({ error: "conveningId is required" }); return; }
  const [speaker] = await db
    .select()
    .from(speakersTable)
    .where(and(eq(speakersTable.id, String(req.params.id)), notDeleted(speakersTable)));
  if (!speaker) { res.status(404).json({ error: "Not found" }); return; }
  const [engagement] = await db.select().from(speakerEngagementsTable).where(and(
    eq(speakerEngagementsTable.conveningId, conveningId), eq(speakerEngagementsTable.speakerId, speaker.id),
    notDeleted(speakerEngagementsTable)));
  if (!engagement) { res.status(404).json({ error: "Speaker is not linked to this convening" }); return; }
  res.json(projectProfile(speaker, engagement.speakerProfile));
});

// ── PATCH /speakers/:id ────────────────────────────────────────────────────────
router.patch("/speakers/:id", requirePermission("speakers:write"), requireConveningAccess(), async (req: Request, res: Response) => {
  const conveningId = String(req.body?.conveningId ?? "");
  if (!conveningId) { res.status(422).json({ error: "conveningId is required" }); return; }
  const [before] = await db
    .select()
    .from(speakersTable)
    .where(and(eq(speakersTable.id, String(req.params.id)), notDeleted(speakersTable)));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  const parse = insertSpeakerSchema.partial().safeParse(req.body);
  if (!parse.success) {
    const errors: Record<string, string> = {};
    for (const issue of parse.error.issues) {
      const key = issue.path.join(".") || "root";
      if (!errors[key]) errors[key] = issue.message;
    }
    res.status(400).json({ error: "Validation failed", errors });
    return;
  }

  const [engagement] = await db.select().from(speakerEngagementsTable).where(and(
    eq(speakerEngagementsTable.speakerId, before.id), eq(speakerEngagementsTable.conveningId, conveningId),
    notDeleted(speakerEngagementsTable)));
  if (!engagement) { res.status(404).json({ error: "Speaker is not linked to this convening" }); return; }
  const updated = await db.transaction(async tx => {
    const [locked] = await tx.select().from(speakerEngagementsTable)
      .where(eq(speakerEngagementsTable.id, engagement.id)).for("update");
    if (!locked || locked.deletedAt) throw new Error("Speaker engagement was removed while editing");
    const profile = projectProfile(projectProfile(before, locked.speakerProfile), parse.data);
    await tx.update(speakerEngagementsTable).set({ speakerProfile: profile })
      .where(eq(speakerEngagementsTable.id, locked.id));
    return profile;
  });

  void writeAudit({
    conveningId,
    actorUserId: req.portalUser!.id,
    action: "Update",
    entityType: "Speaker",
    entityId: updated.id,
    summary: `Updated speaker ${updated.name}`,
    before,
    after: updated,
  });

  res.json(updated);
});

// ── DELETE /speakers/:id  (soft delete) ────────────────────────────────────────
router.delete("/speakers/:id", requirePermission("speakers:write"), requireConveningAccess(), async (req: Request, res: Response) => {
  const conveningId = String(req.query.conveningId ?? "");
  if (!conveningId) { res.status(422).json({ error: "conveningId is required" }); return; }
  const [existing] = await db
    .select()
    .from(speakersTable)
    .where(and(eq(speakersTable.id, String(req.params.id)), notDeleted(speakersTable)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const [engagement] = await db.select().from(speakerEngagementsTable).where(and(
    eq(speakerEngagementsTable.conveningId, conveningId), eq(speakerEngagementsTable.speakerId, existing.id),
    notDeleted(speakerEngagementsTable)));
  if (!engagement) { res.status(404).json({ error: "Speaker is not linked to this convening" }); return; }
  await db.transaction(async tx => {
    await tx.update(speakerEngagementsTable)
      .set({ deletedAt: new Date() })
      .where(eq(speakerEngagementsTable.id, engagement.id));
    const sessions = await tx.select({ id: agendaSessionsTable.id }).from(agendaSessionsTable)
      .where(eq(agendaSessionsTable.conveningId, conveningId));
    if (sessions.length) {
      await tx.delete(agendaSessionSpeakersTable).where(and(
        inArray(agendaSessionSpeakersTable.sessionId, sessions.map(s => s.id)),
        eq(agendaSessionSpeakersTable.speakerId, existing.id)));
      await tx.update(agendaSessionsTable).set({ chairSpeakerId: null }).where(and(
        eq(agendaSessionsTable.conveningId, conveningId),
        eq(agendaSessionsTable.chairSpeakerId, existing.id)));
    }
  });

  void writeAudit({
    conveningId,
    actorUserId: req.portalUser!.id,
    action: "Delete",
    entityType: "Speaker",
    entityId: existing.id,
    summary: `Deleted speaker ${existing.name}`,
    before: existing,
  });

  res.status(204).end();
});

export default router;
