import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  dealProjectsTable,
  dealMatchesTable,
  dealMeetingsTable,
  dealCommitmentsTable,
  insertDealProjectSchema,
  insertDealMatchSchema,
  insertDealMeetingSchema,
  insertDealCommitmentSchema,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function validationErrors(error: { issues: { path: unknown[]; message: string }[] }) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "root";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

// ── Deal Projects ─────────────────────────────────────────────────────────────

router.get(
  "/deal-projects",
  requirePermission("deal:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }
    const rows = await db
      .select()
      .from(dealProjectsTable)
      .where(and(eq(dealProjectsTable.conveningId, conveningId), notDeleted(dealProjectsTable)))
      .orderBy(dealProjectsTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/deal-projects",
  requirePermission("deal:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parse = insertDealProjectSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(422).json({ error: "Validation failed", errors: validationErrors(parse.error) });
      return;
    }
    const [row] = await db.insert(dealProjectsTable).values(parse.data).returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "DealProject",
      entityId: row.id,
      summary: `Created deal project ${row.name}`,
      after: row,
    });
    res.status(201).json(row);
  },
);

router.get(
  "/deal-projects/:id",
  requirePermission("deal:read"),
  async (req: Request, res: Response) => {
    const [row] = await db
      .select()
      .from(dealProjectsTable)
      .where(and(eq(dealProjectsTable.id, String(req.params.id)), notDeleted(dealProjectsTable)));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  },
);

router.patch(
  "/deal-projects/:id",
  requirePermission("deal:write"),
  async (req: Request, res: Response) => {
    const [before] = await db
      .select()
      .from(dealProjectsTable)
      .where(and(eq(dealProjectsTable.id, String(req.params.id)), notDeleted(dealProjectsTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const parse = insertDealProjectSchema.partial().safeParse(req.body);
    if (!parse.success) {
      res.status(422).json({ error: "Validation failed", errors: validationErrors(parse.error) });
      return;
    }
    const [row] = await db
      .update(dealProjectsTable)
      .set(parse.data)
      .where(eq(dealProjectsTable.id, String(req.params.id)))
      .returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "DealProject",
      entityId: row.id,
      summary: `Updated deal project ${row.name}`,
      before,
      after: row,
    });
    res.json(row);
  },
);

router.delete(
  "/deal-projects/:id",
  requirePermission("deal:write"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(dealProjectsTable)
      .where(and(eq(dealProjectsTable.id, String(req.params.id)), notDeleted(dealProjectsTable)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await db
      .update(dealProjectsTable)
      .set({ deletedAt: new Date() })
      .where(eq(dealProjectsTable.id, String(req.params.id)));

    void writeAudit({
      conveningId: existing.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "DealProject",
      entityId: existing.id,
      summary: `Soft-deleted deal project ${existing.name}`,
      before: existing,
    });
    res.status(204).end();
  },
);

// ── Deal Matches ──────────────────────────────────────────────────────────────

router.get(
  "/deal-matches",
  requirePermission("deal:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }

    const matches = await db
      .select()
      .from(dealMatchesTable)
      .where(eq(dealMatchesTable.conveningId, conveningId))
      .orderBy(dealMatchesTable.matchScore);

    const projects = await db
      .select()
      .from(dealProjectsTable)
      .where(eq(dealProjectsTable.conveningId, conveningId));
    const pMap = new Map(projects.map((p) => [p.id, p]));

    res.json(
      matches.map((m) => ({
        ...m,
        projectA: pMap.get(m.projectAId),
        projectB: pMap.get(m.projectBId),
      })),
    );
  },
);

router.post(
  "/deal-matches/suggest",
  requirePermission("deal:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.body as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }

    const projects = await db
      .select()
      .from(dealProjectsTable)
      .where(eq(dealProjectsTable.conveningId, conveningId));

    const seeking = projects.filter((p) => p.side === "CapitalSeeking");
    const counterparties = projects.filter(
      (p) => p.side === "CapitalProvider" || p.side === "Offtaker",
    );

    const sectorScore = (a?: string | null, b?: string | null) => {
      if (!a || !b) return 0;
      const norm = (s: string) => s.toLowerCase().trim();
      if (norm(a) === norm(b)) return 60;
      const aw = new Set(norm(a).split(/[\s/&-]+/));
      const overlap = norm(b).split(/[\s/&-]+/).some((w) => w.length > 3 && aw.has(w));
      return overlap ? 35 : 0;
    };

    const ticketScore = (
      proj: { ticketSizeMin?: number | null; ticketSizeMax?: number | null },
      cp:   { ticketSizeMin?: number | null; ticketSizeMax?: number | null },
    ) => {
      const ask = proj.ticketSizeMax ?? proj.ticketSizeMin ?? 0;
      const lo = cp.ticketSizeMin ?? 0;
      const hi = cp.ticketSizeMax ?? Number.POSITIVE_INFINITY;
      if (!ask) return 0;
      if (ask >= lo && ask <= hi) return 40;
      const nearLo = lo > 0 && ask >= lo * 0.75;
      const nearHi = hi !== Infinity && ask <= hi * 1.25;
      return nearLo && nearHi ? 20 : 0;
    };

    const results: (typeof dealMatchesTable.$inferSelect)[] = [];

    for (const proj of seeking) {
      for (const cp of counterparties) {
        const score = sectorScore(proj.sector, cp.sector) + ticketScore(proj, cp);
        if (score < 35) continue;
        const rationale =
          (score >= 60 ? "Sector match" : "Adjacent sector") +
          (ticketScore(proj, cp) >= 40
            ? "; ticket size fits"
            : ticketScore(proj, cp) > 0
            ? "; ticket near range"
            : "");

        const existing = await db.query.dealMatchesTable.findFirst({
          where: (t, { and: a, eq: e }) =>
            a(e(t.conveningId, conveningId), e(t.projectAId, proj.id), e(t.projectBId, cp.id)),
        });

        if (existing) {
          const [updated] = await db
            .update(dealMatchesTable)
            .set({ matchScore: score, rationale })
            .where(eq(dealMatchesTable.id, existing.id))
            .returning();
          results.push(updated);
        } else {
          const [created] = await db
            .insert(dealMatchesTable)
            .values({ conveningId, projectAId: proj.id, projectBId: cp.id, matchScore: score, rationale, status: "Suggested" })
            .returning();
          results.push(created);
        }
      }
    }

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "DealMatch",
      entityId: conveningId,
      summary: `Generated ${results.length} deal match suggestions`,
    });

    const sorted = results.sort((a, b) => b.matchScore - a.matchScore);
    const pMap = new Map(projects.map((p) => [p.id, p]));
    res.json(sorted.map((m) => ({ ...m, projectA: pMap.get(m.projectAId), projectB: pMap.get(m.projectBId) })));
  },
);

router.patch(
  "/deal-matches/:id",
  requirePermission("deal:write"),
  async (req: Request, res: Response) => {
    const parse = insertDealMatchSchema.partial().safeParse(req.body);
    if (!parse.success) {
      res.status(422).json({ error: "Validation failed", errors: validationErrors(parse.error) });
      return;
    }
    const [row] = await db
      .update(dealMatchesTable)
      .set(parse.data)
      .where(eq(dealMatchesTable.id, String(req.params.id)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const projects = await db
      .select()
      .from(dealProjectsTable)
      .where(eq(dealProjectsTable.conveningId, row.conveningId));
    const pMap = new Map(projects.map((p) => [p.id, p]));
    res.json({ ...row, projectA: pMap.get(row.projectAId), projectB: pMap.get(row.projectBId) });
  },
);

// ── Deal Meetings ─────────────────────────────────────────────────────────────

router.get(
  "/deal-meetings",
  requirePermission("deal:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }
    const rows = await db
      .select()
      .from(dealMeetingsTable)
      .where(eq(dealMeetingsTable.conveningId, conveningId))
      .orderBy(dealMeetingsTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/deal-meetings",
  requirePermission("deal:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parse = insertDealMeetingSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(422).json({ error: "Validation failed", errors: validationErrors(parse.error) });
      return;
    }
    const [row] = await db.insert(dealMeetingsTable).values(parse.data).returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "DealMeeting",
      entityId: row.id,
      summary: `Scheduled deal meeting`,
      after: row,
    });
    res.status(201).json(row);
  },
);

router.patch(
  "/deal-meetings/:id",
  requirePermission("deal:write"),
  async (req: Request, res: Response) => {
    const [before] = await db
      .select()
      .from(dealMeetingsTable)
      .where(eq(dealMeetingsTable.id, String(req.params.id)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const parse = insertDealMeetingSchema.partial().safeParse(req.body);
    if (!parse.success) {
      res.status(422).json({ error: "Validation failed", errors: validationErrors(parse.error) });
      return;
    }
    const [row] = await db
      .update(dealMeetingsTable)
      .set(parse.data)
      .where(eq(dealMeetingsTable.id, String(req.params.id)))
      .returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "DealMeeting",
      entityId: row.id,
      summary: `Updated deal meeting`,
      before,
      after: row,
    });
    res.json(row);
  },
);

router.delete(
  "/deal-meetings/:id",
  requirePermission("deal:write"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(dealMeetingsTable)
      .where(eq(dealMeetingsTable.id, String(req.params.id)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await db.delete(dealMeetingsTable).where(eq(dealMeetingsTable.id, String(req.params.id)));

    void writeAudit({
      conveningId: existing.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "DealMeeting",
      entityId: existing.id,
      summary: `Deleted deal meeting`,
      before: existing,
    });
    res.status(204).end();
  },
);

// ── Deal Commitments ──────────────────────────────────────────────────────────

router.get(
  "/deal-commitments",
  requirePermission("deal:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }
    const rows = await db
      .select()
      .from(dealCommitmentsTable)
      .where(and(eq(dealCommitmentsTable.conveningId, conveningId), notDeleted(dealCommitmentsTable)))
      .orderBy(dealCommitmentsTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/deal-commitments",
  requirePermission("deal:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parse = insertDealCommitmentSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(422).json({ error: "Validation failed", errors: validationErrors(parse.error) });
      return;
    }
    const [row] = await db.insert(dealCommitmentsTable).values(parse.data).returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "DealCommitment",
      entityId: row.id,
      summary: `Created deal commitment: ${row.title}`,
      after: row,
    });
    res.status(201).json(row);
  },
);

router.patch(
  "/deal-commitments/:id",
  requirePermission("deal:write"),
  async (req: Request, res: Response) => {
    const [before] = await db
      .select()
      .from(dealCommitmentsTable)
      .where(and(eq(dealCommitmentsTable.id, String(req.params.id)), notDeleted(dealCommitmentsTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const parse = insertDealCommitmentSchema.partial().safeParse(req.body);
    if (!parse.success) {
      res.status(422).json({ error: "Validation failed", errors: validationErrors(parse.error) });
      return;
    }
    const [row] = await db
      .update(dealCommitmentsTable)
      .set(parse.data)
      .where(eq(dealCommitmentsTable.id, String(req.params.id)))
      .returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "DealCommitment",
      entityId: row.id,
      summary: `Updated deal commitment: ${row.title}`,
      before,
      after: row,
    });
    res.json(row);
  },
);

router.delete(
  "/deal-commitments/:id",
  requirePermission("deal:write"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(dealCommitmentsTable)
      .where(and(eq(dealCommitmentsTable.id, String(req.params.id)), notDeleted(dealCommitmentsTable)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    await db
      .update(dealCommitmentsTable)
      .set({ deletedAt: new Date() })
      .where(eq(dealCommitmentsTable.id, String(req.params.id)));

    void writeAudit({
      conveningId: existing.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "DealCommitment",
      entityId: existing.id,
      summary: `Soft-deleted deal commitment: ${existing.title}`,
      before: existing,
    });
    res.status(204).end();
  },
);

export default router;
