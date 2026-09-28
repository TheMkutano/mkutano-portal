import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  agendaSessionsTable, agendaSessionSpeakersTable, speakersTable, speakerEngagementsTable,
  insertAgendaSessionSchema, insertAgendaSessionSpeakerSchema,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getSpeakersBySession(
  sessionIds: string[],
): Promise<Record<string, Array<{ id: string; sessionId: string; speakerId: string; speakerName: string; role: string; status: string; order: number }>>> {
  if (sessionIds.length === 0) return {};
  const rows = await db
    .select({
      id:          agendaSessionSpeakersTable.id,
      sessionId:   agendaSessionSpeakersTable.sessionId,
      speakerId:   agendaSessionSpeakersTable.speakerId,
      speakerName: speakersTable.name,
      profile: speakerEngagementsTable.speakerProfile,
      role:        agendaSessionSpeakersTable.role,
      status:      agendaSessionSpeakersTable.status,
      order:       agendaSessionSpeakersTable.order,
    })
    .from(agendaSessionSpeakersTable)
    .innerJoin(speakersTable, eq(agendaSessionSpeakersTable.speakerId, speakersTable.id))
    .innerJoin(agendaSessionsTable, eq(agendaSessionsTable.id, agendaSessionSpeakersTable.sessionId))
    .innerJoin(speakerEngagementsTable, and(
      eq(speakerEngagementsTable.speakerId, speakersTable.id),
      eq(speakerEngagementsTable.conveningId, agendaSessionsTable.conveningId),
      notDeleted(speakerEngagementsTable)))
    .where(inArray(agendaSessionSpeakersTable.sessionId, sessionIds))
    .orderBy(agendaSessionSpeakersTable.order);

  const map: Record<string, Array<{ id: string; sessionId: string; speakerId: string; speakerName: string; role: string; status: string; order: number }>> = {};
  for (const r of rows) {
    if (!map[r.sessionId]) map[r.sessionId] = [];
    const { profile, ...placement } = r;
    map[r.sessionId].push({ ...placement, speakerName: profile?.name ?? r.speakerName });
  }
  return map;
}

async function syncChairSpeakerId(sessionId: string, speakerId: string, newRole: string, oldRole?: string) {
  if (newRole === "Chair") {
    await db
      .update(agendaSessionsTable)
      .set({ chairSpeakerId: speakerId })
      .where(eq(agendaSessionsTable.id, sessionId));
  } else if (oldRole === "Chair") {
    const [session] = await db
      .select({ chairSpeakerId: agendaSessionsTable.chairSpeakerId })
      .from(agendaSessionsTable)
      .where(eq(agendaSessionsTable.id, sessionId));
    if (session?.chairSpeakerId === speakerId) {
      await db
        .update(agendaSessionsTable)
        .set({ chairSpeakerId: null })
        .where(eq(agendaSessionsTable.id, sessionId));
    }
  }
}

/**
 * Loads a session by id (non-deleted) and enforces tenant access. Returns the
 * session on success, or null after having sent the appropriate error response.
 */
async function loadSessionWithAccess(
  sessionId: string,
  req: Request,
  res: Response,
): Promise<typeof agendaSessionsTable.$inferSelect | null> {
  const [session] = await db
    .select()
    .from(agendaSessionsTable)
    .where(and(eq(agendaSessionsTable.id, sessionId), notDeleted(agendaSessionsTable)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return null;
  }

  if (req.portalUser && req.portalUser.accountType !== "Internal" &&
      !canAccessConvening(req.portalUser, session.conveningId)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" });
    return null;
  }

  return session;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/sessions", requirePermission("sessions:read"), requireConveningAccess(), async (req: Request, res: Response) => {
  const { conveningId, day } = req.query as Record<string, string>;
  if (!conveningId) { res.status(400).json({ error: "conveningId is required" }); return; }
  const conditions = [];
  conditions.push(eq(agendaSessionsTable.conveningId, conveningId));
  if (day) conditions.push(eq(agendaSessionsTable.day, day));
  conditions.push(notDeleted(agendaSessionsTable));

  const sessions = await db
    .select()
    .from(agendaSessionsTable)
    .where(and(...conditions))
    .orderBy(agendaSessionsTable.day, agendaSessionsTable.order, agendaSessionsTable.startTime);

  const speakersBySession = await getSpeakersBySession(sessions.map((s) => s.id));
  res.json(sessions.map((s) => ({ ...s, speakers: speakersBySession[s.id] ?? [] })));
});

router.post("/sessions", requirePermission("sessions:write"), requireConveningAccess(), async (req: Request, res: Response) => {
  const parse = insertAgendaSessionSchema.safeParse(req.body);
  if (!parse.success) {
    const errors: Record<string, string> = {};
    for (const issue of parse.error.issues) {
      const key = issue.path.join(".") || "root";
      errors[key] = issue.message;
    }
    res.status(422).json({ errors });
    return;
  }

  const [session] = await db
    .insert(agendaSessionsTable)
    .values(parse.data)
    .returning();

  void writeAudit({
    conveningId:  session.conveningId,
    actorUserId:  req.portalUser!.id,
    action:       "Create",
    entityType:   "AgendaSession",
    entityId:     session.id,
    summary:      `Created session: ${session.title}`,
    after:        session,
  });

  res.status(201).json({ ...session, speakers: [] });
});

router.get("/sessions/:id", requirePermission("sessions:read"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const session = await loadSessionWithAccess(id, req, res);
  if (!session) return;

  const speakersBySession = await getSpeakersBySession([id]);
  res.json({ ...session, speakers: speakersBySession[id] ?? [] });
});

router.patch("/sessions/:id", requirePermission("sessions:write"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const before = await loadSessionWithAccess(id, req, res);
  if (!before) return;

  const parse = insertAgendaSessionSchema.partial().safeParse(req.body);
  if (!parse.success) {
    const errors: Record<string, string> = {};
    for (const issue of parse.error.issues) {
      const key = issue.path.join(".") || "root";
      errors[key] = issue.message;
    }
    res.status(422).json({ errors });
    return;
  }

  const [updated] = await db
    .update(agendaSessionsTable)
    .set(parse.data)
    .where(eq(agendaSessionsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Session not found" }); return; }

  void writeAudit({
    conveningId:  updated.conveningId,
    actorUserId:  req.portalUser!.id,
    action:       "Update",
    entityType:   "AgendaSession",
    entityId:     updated.id,
    summary:      `Updated session: ${updated.title}`,
    before,
    after:        updated,
  });

  const speakersBySession = await getSpeakersBySession([id]);
  res.json({ ...updated, speakers: speakersBySession[id] ?? [] });
});

router.delete("/sessions/:id", requirePermission("sessions:write"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await loadSessionWithAccess(id, req, res);
  if (!existing) return;

  await db.update(agendaSessionsTable)
    .set({ deletedAt: new Date() })
    .where(eq(agendaSessionsTable.id, id));

  void writeAudit({
    conveningId:  existing.conveningId,
    actorUserId:  req.portalUser!.id,
    action:       "Delete",
    entityType:   "AgendaSession",
    entityId:     existing.id,
    summary:      `Soft-deleted session: ${existing.title}`,
    before:       existing,
  });

  res.status(204).send();
});

// ── Session speakers ────────────────────────────────────────────────────────

router.get("/sessions/:id/speakers", requirePermission("sessions:read"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const session = await loadSessionWithAccess(id, req, res);
  if (!session) return;
  const speakersBySession = await getSpeakersBySession([id]);
  res.json(speakersBySession[id] ?? []);
});

router.post("/sessions/:id/speakers", requirePermission("sessions:write"), async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const session = await loadSessionWithAccess(sessionId, req, res);
  if (!session) return;

  const parse = insertAgendaSessionSpeakerSchema.partial({ order: true }).safeParse({
    sessionId,
    ...req.body,
  });
  if (!parse.success) {
    const errors: Record<string, string> = {};
    for (const issue of parse.error.issues) {
      errors[issue.path.join(".") || "root"] = issue.message;
    }
    res.status(422).json({ errors });
    return;
  }

  const { speakerId, role = "Speaker", status = "Proposed", order = 0 } = parse.data;
  const [linked] = await db.select({ id: speakerEngagementsTable.id }).from(speakerEngagementsTable).where(and(
    eq(speakerEngagementsTable.speakerId, speakerId),
    eq(speakerEngagementsTable.conveningId, session.conveningId), notDeleted(speakerEngagementsTable)));
  if (!linked) { res.status(422).json({ error: "Speaker is not linked to this convening" }); return; }

  const [existing] = await db
    .select()
    .from(agendaSessionSpeakersTable)
    .where(
      and(
        eq(agendaSessionSpeakersTable.sessionId, sessionId),
        eq(agendaSessionSpeakersTable.speakerId, speakerId),
      ),
    );

  let row;
  if (existing) {
    [row] = await db
      .update(agendaSessionSpeakersTable)
      .set({ role, status })
      .where(eq(agendaSessionSpeakersTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(agendaSessionSpeakersTable)
      .values({ sessionId, speakerId, role, status, order })
      .returning();
  }

  await syncChairSpeakerId(sessionId, speakerId, role, existing?.role);

  const [speaker] = await db
    .select({ name: speakersTable.name, profile: speakerEngagementsTable.speakerProfile })
    .from(speakerEngagementsTable).innerJoin(speakersTable, eq(speakersTable.id, speakerEngagementsTable.speakerId))
    .where(and(eq(speakerEngagementsTable.speakerId, speakerId), eq(speakerEngagementsTable.conveningId, session.conveningId)));

  res.status(existing ? 200 : 201).json({ ...row, speakerName: speaker?.profile?.name ?? speaker?.name ?? "" });
});

router.patch("/sessions/:sessionId/speakers/:speakerId", requirePermission("sessions:write"), async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const speakerId = String(req.params.speakerId);
  const session = await loadSessionWithAccess(sessionId, req, res);
  if (!session) return;
  const [linked] = await db.select({ id: speakerEngagementsTable.id }).from(speakerEngagementsTable).where(and(
    eq(speakerEngagementsTable.speakerId, speakerId),
    eq(speakerEngagementsTable.conveningId, session.conveningId), notDeleted(speakerEngagementsTable)));
  if (!linked) { res.status(422).json({ error: "Speaker is not linked to this convening" }); return; }
  const { role, status } = req.body;

  const [existing] = await db
    .select()
    .from(agendaSessionSpeakersTable)
    .where(
      and(
        eq(agendaSessionSpeakersTable.sessionId, sessionId),
        eq(agendaSessionSpeakersTable.speakerId, speakerId),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "Session speaker not found" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (role   !== undefined) updates.role   = role;
  if (status !== undefined) updates.status = status;

  const [updated] = await db
    .update(agendaSessionSpeakersTable)
    .set(updates)
    .where(eq(agendaSessionSpeakersTable.id, existing.id))
    .returning();

  await syncChairSpeakerId(sessionId, speakerId, updated.role, existing.role);

  const [speaker] = await db
    .select({ name: speakersTable.name, profile: speakerEngagementsTable.speakerProfile })
    .from(speakerEngagementsTable).innerJoin(speakersTable, eq(speakersTable.id, speakerEngagementsTable.speakerId))
    .where(and(eq(speakerEngagementsTable.speakerId, speakerId), eq(speakerEngagementsTable.conveningId, session.conveningId)));

  res.json({ ...updated, speakerName: speaker?.profile?.name ?? speaker?.name ?? "" });
});

router.delete("/sessions/:sessionId/speakers/:speakerId", requirePermission("sessions:write"), async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const speakerId = String(req.params.speakerId);
  const session = await loadSessionWithAccess(sessionId, req, res);
  if (!session) return;

  const [existing] = await db
    .select({ role: agendaSessionSpeakersTable.role })
    .from(agendaSessionSpeakersTable)
    .where(
      and(
        eq(agendaSessionSpeakersTable.sessionId, sessionId),
        eq(agendaSessionSpeakersTable.speakerId, speakerId),
      ),
    );

  if (existing?.role === "Chair") {
    await syncChairSpeakerId(sessionId, speakerId, "Speaker", "Chair");
  }

  await db
    .delete(agendaSessionSpeakersTable)
    .where(
      and(
        eq(agendaSessionSpeakersTable.sessionId, sessionId),
        eq(agendaSessionSpeakersTable.speakerId, speakerId),
      ),
    );

  res.status(204).send();
});

export default router;
