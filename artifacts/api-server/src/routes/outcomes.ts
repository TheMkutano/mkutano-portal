import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { commitmentsTable, dealCommitmentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { writeAudit } from "../lib/audit";
import { aideMemoireHtml, scorecardHtml } from "../lib/pdf-templates.js";
import { renderToPdf } from "../lib/render-pdf.js";
import { z } from "zod/v4";

const router = Router();

// ── Commitments ────────────────────────────────────────────────────────────────

const COMMITMENT_CATEGORIES = ["Policy", "Investment", "Skills", "Innovation", "ESG", "Inclusion", "Governance"] as const;
const COMMITMENT_STATUSES    = ["Proposed", "Agreed", "InProgress", "Delivered", "Stalled"] as const;
const COMMITMENT_SOURCES     = ["BusinessCircle", "DealRoom", "Plenary", "Roundtable"] as const;

router.get(
  "/commitments",
  requirePermission("outcomes:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }
    const rows = await db
      .select()
      .from(commitmentsTable)
      .where(eq(commitmentsTable.conveningId, conveningId))
      .orderBy(commitmentsTable.category, commitmentsTable.createdAt);
    res.json(rows);
  },
);

const CreateCommitmentSchema = z.object({
  conveningId:          z.string().min(1),
  title:                z.string().min(1).max(500),
  description:          z.string().max(2000).optional(),
  category:             z.enum(COMMITMENT_CATEGORIES),
  ownerName:            z.string().max(200).optional(),
  ownerOrg:             z.string().max(200).optional(),
  source:               z.enum(COMMITMENT_SOURCES).optional(),
  sourceSessionId:      z.string().optional(),
  dueDate:              z.string().optional(),
  status:               z.enum(COMMITMENT_STATUSES).optional(),
  inAideMemoire:        z.boolean().optional(),
  publishedToScorecard: z.boolean().optional(),
  originEdition:        z.string().optional(),
  progressNote:         z.string().max(2000).optional(),
});

router.post(
  "/commitments",
  requirePermission("outcomes:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = CreateCommitmentSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const [row] = await db.insert(commitmentsTable).values(parsed.data).returning();

    void writeAudit({
      conveningId: parsed.data.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Commitment",
      entityId: row.id,
      summary: `Created commitment "${parsed.data.title}"`,
      after: row,
    });

    res.status(201).json(row);
  },
);

const PatchCommitmentSchema = z.object({
  title:                z.string().min(1).max(500).optional(),
  description:          z.string().max(2000).optional(),
  category:             z.enum(COMMITMENT_CATEGORIES).optional(),
  ownerName:            z.string().max(200).optional(),
  ownerOrg:             z.string().max(200).optional(),
  source:               z.enum(COMMITMENT_SOURCES).optional(),
  sourceSessionId:      z.string().optional(),
  dueDate:              z.string().optional(),
  status:               z.enum(COMMITMENT_STATUSES).optional(),
  inAideMemoire:        z.boolean().optional(),
  publishedToScorecard: z.boolean().optional(),
  originEdition:        z.string().optional(),
  progressNote:         z.string().max(2000).optional(),
});

router.patch(
  "/commitments/:id",
  requirePermission("outcomes:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const [before] = await db.select().from(commitmentsTable).where(eq(commitmentsTable.id, id));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const parsed = PatchCommitmentSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const [row] = await db
      .update(commitmentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(commitmentsTable.id, id))
      .returning();

    void writeAudit({
      conveningId: before.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Commitment",
      entityId: id,
      summary: `Updated commitment "${row.title}"`,
      before,
      after: row,
    });

    res.json(row);
  },
);

router.delete(
  "/commitments/:id",
  requirePermission("outcomes:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const [row] = await db.select().from(commitmentsTable).where(eq(commitmentsTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    await db.delete(commitmentsTable).where(eq(commitmentsTable.id, id));

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Commitment",
      entityId: id,
      summary: `Deleted commitment "${row.title}"`,
      before: row,
    });

    res.status(204).end();
  },
);

// ── Scorecard ──────────────────────────────────────────────────────────────────

router.get(
  "/scorecard",
  requirePermission("outcomes:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }

    const commitments = await db
      .select()
      .from(commitmentsTable)
      .where(eq(commitmentsTable.conveningId, conveningId));

    const published = commitments.filter((c) => c.publishedToScorecard);
    const total = published.length;
    const delivered = published.filter((c) => c.status === "Delivered").length;

    const byCategory: Record<string, { category: string; total: number; delivered: number; items: unknown[] }> = {};
    for (const c of published) {
      const k = c.category;
      byCategory[k] ??= { category: k, total: 0, delivered: 0, items: [] };
      byCategory[k].total += 1;
      if (c.status === "Delivered") byCategory[k].delivered += 1;
      byCategory[k].items.push({
        title: c.title,
        owner: c.ownerOrg ?? c.ownerName ?? null,
        status: c.status,
        originEdition: c.originEdition ?? null,
      });
    }

    const deals = await db
      .select()
      .from(dealCommitmentsTable)
      .where(eq(dealCommitmentsTable.conveningId, conveningId));
    const signedValue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);

    res.json({
      headline: {
        total,
        delivered,
        deliveryRatePct: total ? Math.round((delivered / total) * 100) : 0,
      },
      signedDealValue: signedValue,
      signedDealCount: deals.length,
      categories: Object.values(byCategory).sort((a, b) => b.total - a.total),
    });
  },
);

// ── PDF helpers ────────────────────────────────────────────────────────────────

async function getConveningName(conveningId: string): Promise<string> {
  const row = await db.query.conveningsTable.findFirst({
    where: (t, { eq: e }) => e(t.id, conveningId),
  });
  return row?.name ?? "Convening";
}

// GET /aide-memoire/pdf?conveningId=...
router.get(
  "/aide-memoire/pdf",
  requirePermission("outcomes:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }

    const [conveningName, commitments] = await Promise.all([
      getConveningName(conveningId),
      db.select().from(commitmentsTable).where(eq(commitmentsTable.conveningId, conveningId)),
    ]);

    const html = aideMemoireHtml(conveningName, commitments);
    const pdf = await renderToPdf(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="aide-memoire-${conveningId}.pdf"`);
    res.send(pdf);
  },
);

// GET /scorecard/pdf?conveningId=...
router.get(
  "/scorecard/pdf",
  requirePermission("outcomes:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query as { conveningId?: string };
    if (!conveningId) { res.status(400).json({ error: "conveningId required" }); return; }

    const [conveningName, commitments, deals] = await Promise.all([
      getConveningName(conveningId),
      db.select().from(commitmentsTable).where(eq(commitmentsTable.conveningId, conveningId)),
      db.select().from(dealCommitmentsTable).where(eq(dealCommitmentsTable.conveningId, conveningId)),
    ]);

    const published = commitments.filter((c) => c.publishedToScorecard);
    const total = published.length;
    const delivered = published.filter((c) => c.status === "Delivered").length;
    const byCategory: Record<string, { category: string; total: number; delivered: number; items: { title: string; owner: string | null; status: string; originEdition: string | null }[] }> = {};
    for (const c of published) {
      const k = c.category;
      byCategory[k] ??= { category: k, total: 0, delivered: 0, items: [] };
      byCategory[k].total += 1;
      if (c.status === "Delivered") byCategory[k].delivered += 1;
      byCategory[k].items.push({
        title: c.title,
        owner: c.ownerOrg ?? c.ownerName ?? null,
        status: c.status,
        originEdition: c.originEdition ?? null,
      });
    }
    const signedValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

    const data = {
      headline: { total, delivered, deliveryRatePct: total ? Math.round((delivered / total) * 100) : 0 },
      signedDealValue: signedValue,
      signedDealCount: deals.length,
      categories: Object.values(byCategory).sort((a, b) => b.total - a.total),
    };

    const html = scorecardHtml(conveningName, data);
    const pdf = await renderToPdf(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="scorecard-${conveningId}.pdf"`);
    res.send(pdf);
  },
);

export default router;
