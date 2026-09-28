import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  budgetsTable,
  conveningsTable,
  engagementsTable,
  delegatesTable,
  passTypeConfigsTable,
  partnersTable,
  portalUsersTable,
} from "@workspace/db";
import { eq, and, inArray, like } from "drizzle-orm";
import { requirePermission, requireAnyPermission, requireConveningAccess } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { writeAudit } from "../lib/audit";
import { notDeleted } from "../lib/softDelete";
import { sendBudgetSummaryEmail } from "../lib/email";
import { renderToPdf } from "../lib/render-pdf";
import { z } from "zod";
import ExcelJS from "exceljs";

const router: IRouter = Router();

const BUDGET_CATEGORIES = [
  "Origination", "Sponsorships", "DelegatePasses", "Operations",
  "Marketing", "Venue", "Catering", "AV", "Travel", "Contingency",
] as const;

const PAYING_PASS_TYPES = ["EarlyBird", "Standard", "Late", "Paid"] as const;

// ── GET /budgets ──────────────────────────────────────────────────────────────
router.get(
  "/budgets",
  requirePermission("budget:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    if (typeof conveningId !== "string" || !conveningId) {
      res.status(422).json({ error: "conveningId is required" });
      return;
    }

    const rows = await db.select().from(budgetsTable).where(eq(budgetsTable.conveningId, conveningId));

    res.json(rows);
    return;
  },
);

// ── POST /budgets ─────────────────────────────────────────────────────────────
const CreateBudgetSchema = z.object({
  conveningId:      z.string().min(1),
  category:         z.enum(BUDGET_CATEGORIES),
  type:             z.enum(["Income", "Expense"]).optional(),
  lineItemName:     z.string().max(300).optional(),
  units:            z.number().optional(),
  unitCost:         z.number().optional(),
  committedAmount:  z.coerce.string().optional(),
  actualAmount:     z.coerce.string().optional(),
  notes:            z.string().max(2000).optional(),
  relatedPartnerId: z.string().optional(),
});

router.post(
  "/budgets",
  requirePermission("budget:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = CreateBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const { conveningId, category, type, lineItemName, units, unitCost,
      committedAmount, actualAmount, notes, relatedPartnerId } = parsed.data;

    const [created] = await db
      .insert(budgetsTable)
      .values({
        conveningId, category,
        ...(type             !== undefined && { type }),
        ...(lineItemName     !== undefined && { lineItemName }),
        ...(units            !== undefined && { units }),
        ...(unitCost         !== undefined && { unitCost }),
        ...(committedAmount  !== undefined && { committedAmount }),
        ...(actualAmount     !== undefined && { actualAmount }),
        ...(notes            !== undefined && { notes }),
        ...(relatedPartnerId !== undefined && { relatedPartnerId }),
      })
      .returning();

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Budget",
      entityId: created.id,
      summary: `Added budget line "${category}${lineItemName ? ` — ${lineItemName}` : ""}"`,
      after: created,
    });

    res.status(201).json(created);
    return;
  },
);

// ── Shared helper: per-tier sponsor comp allocations ─────────────────────────
async function computeSponsorCompByTier(conveningId: string): Promise<{ tier: string; allocated: number; issued: number }[]> {
  // Allocated: sum delegatePassesAllocated from all non-deleted engagements, grouped by finalTier
  const engRows = await db
    .select({
      finalTier:               engagementsTable.finalTier,
      delegatePassesAllocated: engagementsTable.delegatePassesAllocated,
    })
    .from(engagementsTable)
    .where(
      and(
        eq(engagementsTable.conveningId, conveningId),
        notDeleted(engagementsTable),
      ),
    );

  const tierAllocMap = new Map<string, number>();
  for (const row of engRows) {
    const tier = row.finalTier ?? "Untiered";
    tierAllocMap.set(tier, (tierAllocMap.get(tier) ?? 0) + (row.delegatePassesAllocated ?? 0));
  }

  // Issued: count FreeSponsor delegates (confirmed/attended)
  const sponsorDelegates = await db
    .select({ id: delegatesTable.id })
    .from(delegatesTable)
    .where(
      and(
        eq(delegatesTable.conveningId, conveningId),
        eq(delegatesTable.passType, "FreeSponsor"),
        inArray(delegatesTable.status, ["Confirmed", "Attended", "Registered"]),
        notDeleted(delegatesTable),
      ),
    );
  const totalIssued = sponsorDelegates.length;

  // Build per-tier rows; put issued only on the first tier (aggregate, not tier-attributed)
  const rows: { tier: string; allocated: number; issued: number }[] = [];
  let issuedAssigned = false;
  for (const [tier, allocated] of tierAllocMap.entries()) {
    if (allocated === 0) continue; // skip tiers with no allocation
    rows.push({ tier, allocated, issued: !issuedAssigned ? totalIssued : 0 });
    issuedAssigned = true;
  }

  return rows;
}

// ── GET /budgets/comp-allocations ─────────────────────────────────────────────
router.get(
  "/budgets/comp-allocations",
  requirePermission("budget:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = String(req.query.conveningId ?? "");
    if (!conveningId) { res.status(422).json({ error: "conveningId is required" }); return; }

    const byTier = await computeSponsorCompByTier(conveningId);
    const totalAllocated = byTier.reduce((s, r) => s + r.allocated, 0);
    const totalIssued    = byTier.reduce((s, r) => s + r.issued, 0);

    res.json({ byTier, totalAllocated, totalIssued });
    return;
  },
);

// ── POST /budgets/sync ────────────────────────────────────────────────────────
const SyncBudgetSchema = z.object({
  conveningId: z.string().min(1),
});

router.post(
  "/budgets/sync",
  requirePermission("budget:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = SyncBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const { conveningId } = parsed.data;

    // ── 1. Sponsorship lines: one per paid financial engagement ──────────────
    const paidEngagements = await db
      .select({
        id:              engagementsTable.id,
        partnerId:       engagementsTable.partnerId,
        partnerProfile:  engagementsTable.partnerProfile,
        financialAmount: engagementsTable.financialAmount,
        currency:        engagementsTable.currency,
        finalTier:       engagementsTable.finalTier,
      })
      .from(engagementsTable)
      .where(
        and(
          eq(engagementsTable.conveningId, conveningId),
          eq(engagementsTable.paymentStatus, "Paid"),
          notDeleted(engagementsTable),
        ),
      );

    // Fetch partner names for line item labels
    const partnerIds = [...new Set(paidEngagements.map(e => e.partnerId))];
    const partners = partnerIds.length > 0
      ? await db.select({ id: partnersTable.id, institutionName: partnersTable.institutionName })
          .from(partnersTable)
          .where(and(inArray(partnersTable.id, partnerIds), notDeleted(partnersTable)))
      : [];
    const partnerMap = new Map(partners.map(p => [p.id, p.institutionName]));

    // Build sync-key marker: one budget line per paid engagement, keyed by engagement ID
    const engSyncKey = (engId: string) => `[sync:eng:${engId}]`;

    // ── 2. Delegate pass revenue lines: one per paying pass type ─────────────
    const passConfigs = await db
      .select()
      .from(passTypeConfigsTable)
      .where(eq(passTypeConfigsTable.conveningId, conveningId));

    // Count only Confirmed + Attended delegates by pass type (actual revenue realised)
    const delegateRows = await db
      .select({ passType: delegatesTable.passType })
      .from(delegatesTable)
      .where(
        and(
          eq(delegatesTable.conveningId, conveningId),
          notDeleted(delegatesTable),
          inArray(delegatesTable.status, ["Confirmed", "Attended"]),
        ),
      );

    const delegateCountByType = new Map<string, number>();
    for (const d of delegateRows) {
      delegateCountByType.set(d.passType, (delegateCountByType.get(d.passType) ?? 0) + 1);
    }

    // Apply all sponsor + delegate line upserts atomically.
    const { sponsorLines, delegateLines } = await db.transaction(async (tx) => {
      let sponsorLines = 0;
      for (const eng of paidEngagements) {
        const partnerName = eng.partnerProfile
          ? eng.partnerProfile.institutionName
          : partnerMap.get(eng.partnerId) ?? `Sponsor ${eng.partnerId.slice(0, 8)}`;
        const tierSuffix  = eng.finalTier ? ` — ${eng.finalTier}` : "";
        const lineItemName = `${partnerName}${tierSuffix}`;
        const amount       = String(eng.financialAmount);
        const syncKey      = engSyncKey(eng.id);

        // Match on the engagement-specific sync key stored in notes
        const [existing] = await tx
          .select()
          .from(budgetsTable)
          .where(
            and(
              eq(budgetsTable.conveningId, conveningId),
              eq(budgetsTable.category, "Sponsorships"),
              eq(budgetsTable.type, "Income"),
              like(budgetsTable.notes, `%${syncKey}%`),
            ),
          )
          .limit(1);

        if (existing) {
          await tx
            .update(budgetsTable)
            .set({ committedAmount: amount, actualAmount: amount, lineItemName, relatedPartnerId: eng.partnerId })
            .where(eq(budgetsTable.id, existing.id));
        } else {
          await tx
            .insert(budgetsTable)
            .values({
              conveningId,
              type: "Income",
              category: "Sponsorships",
              lineItemName,
              committedAmount: amount,
              actualAmount: amount,
              relatedPartnerId: eng.partnerId,
              notes: syncKey,
            });
        }
        sponsorLines++;
      }

      let delegateLines = 0;
      for (const cfg of passConfigs) {
        if (!(PAYING_PASS_TYPES as readonly string[]).includes(cfg.passType)) continue;

        const price     = Number(cfg.price);
        const capacity  = cfg.capacity;
        const count     = delegateCountByType.get(cfg.passType) ?? 0;
        const committed = String(price * capacity);
        const actual    = String(price * count);
        const lineItemName = cfg.label;

        const [existing] = await tx
          .select()
          .from(budgetsTable)
          .where(
            and(
              eq(budgetsTable.conveningId, conveningId),
              eq(budgetsTable.category, "DelegatePasses"),
              eq(budgetsTable.type, "Income"),
              eq(budgetsTable.lineItemName, lineItemName),
            ),
          )
          .limit(1);

        if (existing) {
          await tx
            .update(budgetsTable)
            .set({
              committedAmount: committed,
              actualAmount: actual,
              units: capacity,
              unitCost: price,
            })
            .where(eq(budgetsTable.id, existing.id));
        } else {
          await tx
            .insert(budgetsTable)
            .values({
              conveningId,
              type: "Income",
              category: "DelegatePasses",
              lineItemName,
              units: capacity,
              unitCost: price,
              committedAmount: committed,
              actualAmount: actual,
            });
        }
        delegateLines++;
      }

      return { sponsorLines, delegateLines };
    });

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Budget",
      entityId: conveningId,
      summary: `Synced budget: ${sponsorLines} sponsor line(s), ${delegateLines} delegate pass line(s)`,
    });

    const sponsorCompByTier = await computeSponsorCompByTier(conveningId);
    res.json({ sponsorLines, delegateLines, sponsorCompByTier });
    return;
  },
);

// ── PATCH /budgets/:id ────────────────────────────────────────────────────────
const UpdateBudgetSchema = z.object({
  category:         z.enum(BUDGET_CATEGORIES).optional(),
  type:             z.enum(["Income", "Expense"]).optional(),
  lineItemName:     z.string().max(300).nullable().optional(),
  units:            z.number().nullable().optional(),
  unitCost:         z.number().nullable().optional(),
  committedAmount:  z.coerce.string().optional(),
  actualAmount:     z.coerce.string().optional(),
  notes:            z.string().max(2000).nullable().optional(),
  relatedPartnerId: z.string().nullable().optional(),
});

router.patch(
  "/budgets/:id",
  requirePermission("budget:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const [before] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }
    if ((req.query.conveningId && req.query.conveningId !== before.conveningId) ||
        (req.body?.conveningId && req.body.conveningId !== before.conveningId)) {
      res.status(400).json({ error: "Conflicting conveningId values across request" }); return;
    }
    if (!canAccessConvening(req.portalUser!, before.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
    }

    const parsed = UpdateBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as typeof parsed.data;

    const [updated] = await db
      .update(budgetsTable)
      .set(updates)
      .where(eq(budgetsTable.id, id))
      .returning();

    void writeAudit({
      conveningId: before.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Budget",
      entityId: id,
      summary: `Updated budget line "${updated.category}"`,
      before,
      after: updated,
    });

    res.json(updated);
    return;
  },
);

// ── Shared export helpers ─────────────────────────────────────────────────────
const INCOME_CATS_ORDER  = ["Origination", "Sponsorships", "DelegatePasses"] as const;
const EXPENSE_CATS_ORDER = ["Operations", "Marketing", "Venue", "Catering", "AV", "Travel", "Contingency"] as const;

function exportComputeVariance(type: string, budget: number, actual: number): { dollar: number | null; pct: number | null } {
  if (budget === 0) return { dollar: null, pct: null };
  const fav = type === "Income" ? actual - budget : budget - actual;
  return { dollar: fav, pct: (fav / budget) * 100 };
}

// ── GET /budgets/export ───────────────────────────────────────────────────────
router.get(
  "/budgets/export",
  requireAnyPermission(["budget:export", "delegates:export"]),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = String(req.query.conveningId ?? "");
    if (!conveningId) {
      res.status(422).json({ error: "conveningId is required" });
      return;
    }

    const format = String(req.query.format ?? "csv").toLowerCase();
    if (format !== "csv" && format !== "xlsx" && format !== "pdf") {
      res.status(422).json({ error: "format must be csv, xlsx or pdf" });
      return;
    }

    // Optional currency code for XLSX column headers / number formats (e.g. "USD", "KES")
    const rawCurrency = String(req.query.currency ?? "").toUpperCase();
    const currencyCode = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : "USD";

    // Fetch convening for slug and metadata (used in filename and cover sheet)
    const [convening] = await db
      .select({
        slug:      conveningsTable.slug,
        name:      conveningsTable.name,
        startDate: conveningsTable.startDate,
        endDate:   conveningsTable.endDate,
      })
      .from(conveningsTable)
      .where(eq(conveningsTable.id, conveningId))
      .limit(1);

    const slug            = convening?.slug      ?? conveningId.slice(0, 12);
    const conveningName   = convening?.name      ?? slug;
    const conveningStart  = convening?.startDate ?? null;
    const conveningEnd    = convening?.endDate   ?? null;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const rows = await db
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.conveningId, conveningId))
      .orderBy(budgetsTable.type, budgetsTable.category);

    // Pre-compute P&L totals (needed for the cover sheet before the detail sheet is built)
    let coverIncomeBudget = 0, coverIncomeActual = 0;
    let coverExpenseBudget = 0, coverExpenseActual = 0;
    for (const r of rows) {
      const b = Number(r.committedAmount ?? 0);
      const a = Number(r.actualAmount ?? 0);
      if ((r.type ?? "Expense") === "Income") { coverIncomeBudget += b; coverIncomeActual += a; }
      else                                     { coverExpenseBudget += b; coverExpenseActual += a; }
    }
    const coverNetBudget = coverIncomeBudget - coverExpenseBudget;
    const coverNetActual = coverIncomeActual - coverExpenseActual;

    void writeAudit({
      conveningId,
      actorUserId: req.portalUser!.id,
      action: "Export",
      entityType: "Budget",
      entityId: conveningId,
      summary: `Exported budget P&L ${format.toUpperCase()} (${rows.length} line${rows.length !== 1 ? "s" : ""})`,
    });

    // ── CSV export (legacy) ─────────────────────────────────────────────────
    if (format === "csv") {
      const filename = `budget-${slug}-${today}.csv`;
      const header = ["Category", "Type", "Description", "Units", "Unit Cost", "Budget", "Actual", "Variance", "%"];

      function csvCell(v: unknown): string {
        const s = v == null ? "" : String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      }

      const lines: string[] = [header.map(csvCell).join(",")];

      for (const row of rows) {
        const budget = Number(row.committedAmount ?? 0);
        const actual = Number(row.actualAmount ?? 0);
        const type   = row.type ?? "Expense";
        const { dollar, pct } = exportComputeVariance(type, budget, actual);

        lines.push([
          csvCell(row.category),
          csvCell(type),
          csvCell(row.lineItemName ?? ""),
          csvCell(row.units != null ? row.units : ""),
          csvCell(row.unitCost != null ? row.unitCost : ""),
          csvCell(budget.toFixed(2)),
          csvCell(actual.toFixed(2)),
          csvCell(dollar != null ? dollar.toFixed(2) : ""),
          csvCell(pct != null ? pct.toFixed(1) + "%" : ""),
        ].join(","));
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(lines.join("\r\n"));
      return;
    }

    // ── PDF export ──────────────────────────────────────────────────────────
    if (format === "pdf") {
      const pdfFilename = `budget-${slug}-${today}.pdf`;

      // Helper: format a number as currency string
      function pdfFmt(v: number): string {
        return `${currencyCode} ${Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }

      function pdfVar(type: string, budget: number, actual: number): { dollar: string; pct: string; color: string } {
        if (budget === 0) return { dollar: "—", pct: "—", color: "#888" };
        const fav = type === "Income" ? actual - budget : budget - actual;
        const pct = (fav / budget) * 100;
        const color = fav > 0 ? "#0F6E56" : fav < 0 ? "#A32D2D" : "#888";
        const sign = fav > 0 ? "+" : fav < 0 ? "−" : "";
        const dollar = fav === 0 ? "—" : `${sign}${pdfFmt(Math.abs(fav))}`;
        const pctStr = fav === 0 ? "—" : `${sign}${Math.abs(pct).toFixed(1)}%`;
        return { dollar, pct: pctStr, color };
      }

      // Group rows by type then category
      const incomeRows = rows.filter(r => (r.type ?? "Expense") === "Income");
      const expenseRows = rows.filter(r => (r.type ?? "Expense") === "Expense");

      function buildSection(sectionRows: typeof rows, type: string, cats: readonly string[]): string {
        const catMap = new Map<string, typeof rows>();
        for (const r of sectionRows) {
          if (!catMap.has(r.category)) catMap.set(r.category, []);
          catMap.get(r.category)!.push(r);
        }

        let html = "";
        const orderedCats = [
          ...cats.filter(c => catMap.has(c)),
          ...[...catMap.keys()].filter(c => !(cats as readonly string[]).includes(c)),
        ];

        let sectionBudget = 0;
        let sectionActual = 0;

        for (const cat of orderedCats) {
          const lines_ = catMap.get(cat) ?? [];
          let catBudget = 0;
          let catActual = 0;

          html += `<tr class="cat-header"><td colspan="7">${cat}</td></tr>`;

          for (const line of lines_) {
            const budget = Number(line.committedAmount ?? 0);
            const actual = Number(line.actualAmount ?? 0);
            catBudget += budget;
            catActual += actual;
            const v = pdfVar(type, budget, actual);
            html += `<tr class="data-row">
              <td class="desc">${line.lineItemName || cat}</td>
              <td class="num">${line.units != null ? line.units.toLocaleString("en-GB") : "—"}</td>
              <td class="num">${line.unitCost != null ? pdfFmt(Number(line.unitCost)) : "—"}</td>
              <td class="num">${pdfFmt(budget)}</td>
              <td class="num">${pdfFmt(actual)}</td>
              <td class="num" style="color:${v.color}">${v.dollar}</td>
              <td class="num" style="color:${v.color}">${v.pct}</td>
            </tr>`;
          }

          const sv = pdfVar(type, catBudget, catActual);
          html += `<tr class="subtotal">
            <td class="desc">${cat} Subtotal</td>
            <td colspan="2"></td>
            <td class="num">${pdfFmt(catBudget)}</td>
            <td class="num">${pdfFmt(catActual)}</td>
            <td class="num" style="color:${sv.color}">${sv.dollar}</td>
            <td class="num" style="color:${sv.color}">${sv.pct}</td>
          </tr>`;

          sectionBudget += catBudget;
          sectionActual += catActual;
        }

        return { html, sectionBudget, sectionActual } as unknown as string;
      }

      type SectionResult = { html: string; sectionBudget: number; sectionActual: number };

      function buildSectionResult(sectionRows: typeof rows, type: string, cats: readonly string[]): SectionResult {
        const catMap = new Map<string, typeof rows>();
        for (const r of sectionRows) {
          if (!catMap.has(r.category)) catMap.set(r.category, []);
          catMap.get(r.category)!.push(r);
        }

        let html = "";
        const orderedCats = [
          ...cats.filter(c => catMap.has(c)),
          ...[...catMap.keys()].filter(c => !(cats as readonly string[]).includes(c)),
        ];

        let sectionBudget = 0;
        let sectionActual = 0;

        for (const cat of orderedCats) {
          const lines_ = catMap.get(cat) ?? [];
          let catBudget = 0;
          let catActual = 0;

          html += `<tr class="cat-header"><td colspan="7">${cat}</td></tr>`;

          for (const line of lines_) {
            const budget = Number(line.committedAmount ?? 0);
            const actual = Number(line.actualAmount ?? 0);
            catBudget += budget;
            catActual += actual;
            const v = pdfVar(type, budget, actual);
            html += `<tr class="data-row">
              <td class="desc">${line.lineItemName || cat}</td>
              <td class="num">${line.units != null ? line.units.toLocaleString("en-GB") : "—"}</td>
              <td class="num">${line.unitCost != null ? pdfFmt(Number(line.unitCost)) : "—"}</td>
              <td class="num">${pdfFmt(budget)}</td>
              <td class="num">${pdfFmt(actual)}</td>
              <td class="num" style="color:${v.color}">${v.dollar}</td>
              <td class="num" style="color:${v.color}">${v.pct}</td>
            </tr>`;
          }

          const sv = pdfVar(type, catBudget, catActual);
          html += `<tr class="subtotal">
            <td class="desc">${cat} Subtotal</td>
            <td colspan="2"></td>
            <td class="num">${pdfFmt(catBudget)}</td>
            <td class="num">${pdfFmt(catActual)}</td>
            <td class="num" style="color:${sv.color}">${sv.dollar}</td>
            <td class="num" style="color:${sv.color}">${sv.pct}</td>
          </tr>`;

          sectionBudget += catBudget;
          sectionActual += catActual;
        }

        return { html, sectionBudget, sectionActual };
      }

      const income  = buildSectionResult(incomeRows,  "Income",  INCOME_CATS_ORDER);
      const expense = buildSectionResult(expenseRows, "Expense", EXPENSE_CATS_ORDER);

      const netBudget = income.sectionBudget - expense.sectionBudget;
      const netActual = income.sectionActual - expense.sectionActual;
      const netColor  = netActual >= 0 ? "#0F6E56" : "#A32D2D";
      const netSign   = (v: number) => v >= 0 ? "+" : "−";

      const dateRange = conveningStart && conveningEnd
        ? `${conveningStart} → ${conveningEnd}`
        : conveningStart ?? conveningEnd ?? "";

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
  .header { background: #1A3A2E; color: #fff; padding: 20px 24px 16px; }
  .header h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
  .header .meta { margin-top: 6px; font-size: 11px; opacity: 0.8; display: flex; gap: 20px; flex-wrap: wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 0; }
  th { background: #2D5A47; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase;
       letter-spacing: 0.08em; padding: 6px 8px; }
  th.left { text-align: left; }
  th.right { text-align: right; }
  tr.section-header td { background: #1A3A2E; color: #fff; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em; padding: 7px 8px; }
  tr.cat-header td { background: #E8F0EC; color: #4a4a4a; font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; padding: 5px 8px;
    border-bottom: 1px solid #B2CECA; }
  tr.data-row td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  tr.data-row:hover td { background: #f7fbf9; }
  tr.subtotal td { background: #D0E3DA; font-weight: 700; font-size: 10px; padding: 5px 8px;
    border-top: 1px solid #B2CECA; }
  tr.section-total td { background: #c2d9ce; font-weight: 700; font-size: 10.5px; padding: 6px 8px; }
  tr.net-pl td { background: #1A3A2E; color: #fff; font-weight: 800; font-size: 12px; padding: 8px 8px; }
  tr.spacer td { height: 12px; }
  .desc { text-align: left; }
  .num { text-align: right; tabular-nums; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 16px; font-size: 9px; color: #888; padding: 0 24px 16px; }
  .page-body { padding: 0 0 0 0; }
</style>
</head>
<body>
<div class="header">
  <h1>Budget P&amp;L — ${conveningName}</h1>
  <div class="meta">
    ${dateRange ? `<span>📅 ${dateRange}</span>` : ""}
    <span>Currency: ${currencyCode}</span>
    <span>Exported: ${today}</span>
  </div>
</div>
<div class="page-body">
<table>
  <thead>
    <tr>
      <th class="left" style="width:32%">Description</th>
      <th class="right" style="width:7%">Units</th>
      <th class="right" style="width:11%">Unit Cost</th>
      <th class="right" style="width:13%">Budget (${currencyCode})</th>
      <th class="right" style="width:13%">Actual (${currencyCode})</th>
      <th class="right" style="width:13%">Variance</th>
      <th class="right" style="width:11%">Var %</th>
    </tr>
  </thead>
  <tbody>
    ${incomeRows.length > 0 ? `
    <tr class="section-header"><td colspan="7">INCOME</td></tr>
    ${income.html}
    <tr class="section-total">
      <td class="desc">TOTAL INCOME</td>
      <td colspan="2"></td>
      <td class="num">${pdfFmt(income.sectionBudget)}</td>
      <td class="num">${pdfFmt(income.sectionActual)}</td>
      <td class="num" style="color:${pdfVar("Income", income.sectionBudget, income.sectionActual).color}">${pdfVar("Income", income.sectionBudget, income.sectionActual).dollar}</td>
      <td class="num" style="color:${pdfVar("Income", income.sectionBudget, income.sectionActual).color}">${pdfVar("Income", income.sectionBudget, income.sectionActual).pct}</td>
    </tr>` : ""}
    ${expenseRows.length > 0 ? `
    <tr class="spacer"><td colspan="7"></td></tr>
    <tr class="section-header"><td colspan="7">EXPENSES</td></tr>
    ${expense.html}
    <tr class="section-total">
      <td class="desc">TOTAL EXPENSES</td>
      <td colspan="2"></td>
      <td class="num">${pdfFmt(expense.sectionBudget)}</td>
      <td class="num">${pdfFmt(expense.sectionActual)}</td>
      <td class="num" style="color:${pdfVar("Expense", expense.sectionBudget, expense.sectionActual).color}">${pdfVar("Expense", expense.sectionBudget, expense.sectionActual).dollar}</td>
      <td class="num" style="color:${pdfVar("Expense", expense.sectionBudget, expense.sectionActual).color}">${pdfVar("Expense", expense.sectionBudget, expense.sectionActual).pct}</td>
    </tr>` : ""}
    ${rows.length > 0 ? `
    <tr class="spacer"><td colspan="7"></td></tr>
    <tr class="net-pl">
      <td class="desc">NET P&amp;L</td>
      <td colspan="2"></td>
      <td class="num" style="color:${netBudget >= 0 ? "#86EFAC" : "#FCA5A5"}">${netSign(netBudget)}${pdfFmt(Math.abs(netBudget))}</td>
      <td class="num" style="color:${netActual >= 0 ? "#86EFAC" : "#FCA5A5"}">${netSign(netActual)}${pdfFmt(Math.abs(netActual))}</td>
      <td colspan="2"></td>
    </tr>` : ""}
  </tbody>
</table>
</div>
<div class="footer">Generated by Mkutano Convening Portal · ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</div>
</body>
</html>`;

      const pdfBuffer = await renderToPdf(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
      res.send(pdfBuffer);
      return;
    }

    // ── XLSX export ─────────────────────────────────────────────────────────
    const filename = `budget-${slug}-${today}.xlsx`;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Mkutano Convening Portal";
    wb.created = new Date();

    // ── Summary (cover) sheet — must be added first so it becomes tab 1 ─────
    const wsCover = wb.addWorksheet("Summary");
    wsCover.columns = [
      { key: "label", width: 28 },
      { key: "value", width: 38 },
    ];

    const COVER_HEADER_BG = "FF1A3A2E";
    const COVER_LABEL_BG  = "FFE8F0EC";

    // Title banner
    wsCover.mergeCells("A1:B1");
    const titleCell = wsCover.getCell("A1");
    titleCell.value = "Budget P&L — Export Summary";
    titleCell.font  = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    titleCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COVER_HEADER_BG } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    wsCover.getRow(1).height = 36;

    // Helper: add a label/value row to the cover sheet
    function addCoverRow(label: string, value: string | number | null, isCurrency = false) {
      const row = wsCover.addRow([label, value]);
      row.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COVER_LABEL_BG } };
      row.getCell(1).font  = { bold: true, size: 11 };
      row.getCell(2).font  = { size: 11 };
      row.getCell(2).alignment = { horizontal: "left" };
      if (isCurrency && typeof value === "number") {
        const currFmt = `"${currencyCode} "#,##0.00;[Red]"${currencyCode} "-#,##0.00`;
        row.getCell(2).numFmt = currFmt;
      }
      row.height = 22;
    }

    // Spacer
    wsCover.addRow([]);

    // Convening metadata
    addCoverRow("Convening", conveningName);

    const dateRange = conveningStart && conveningEnd
      ? `${conveningStart} → ${conveningEnd}`
      : conveningStart ?? conveningEnd ?? "—";
    addCoverRow("Event dates", dateRange);

    // Fetch exporter name for the cover sheet
    const [exporterRow] = await db
      .select({ name: portalUsersTable.name, email: portalUsersTable.email })
      .from(portalUsersTable)
      .where(eq(portalUsersTable.id, req.portalUser!.id))
      .limit(1);
    const exportedBy = exporterRow?.name ?? exporterRow?.email ?? "—";

    addCoverRow("Exported by", exportedBy);
    addCoverRow("Export date", new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    addCoverRow("Currency", currencyCode);
    addCoverRow("Budget lines", rows.length);

    // Spacer
    wsCover.addRow([]);

    // P&L summary figures
    addCoverRow("Total Income (Budget)",   coverIncomeBudget,  true);
    addCoverRow("Total Income (Actual)",   coverIncomeActual,  true);
    addCoverRow("Total Expenses (Budget)", coverExpenseBudget, true);
    addCoverRow("Total Expenses (Actual)", coverExpenseActual, true);

    // Net P&L rows — styled green/red based on sign
    function addCoverNetRow(label: string, amount: number) {
      const row = wsCover.addRow([label, amount]);
      const currFmt = `"${currencyCode} "#,##0.00;[Red]"${currencyCode} "-#,##0.00`;
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COVER_HEADER_BG } };
      row.getCell(1).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COVER_HEADER_BG } };
      row.getCell(2).numFmt = currFmt;
      row.getCell(2).font = {
        bold: true, size: 11,
        color: { argb: amount >= 0 ? "FF86EFAC" : "FFFCA5A5" },
      };
      row.getCell(2).alignment = { horizontal: "left" };
      row.height = 24;
    }
    addCoverNetRow("Net P&L (Budget)", coverNetBudget);
    addCoverNetRow("Net P&L (Actual)", coverNetActual);

    // ── P&L Detail sheet ─────────────────────────────────────────────────────
    const ws = wb.addWorksheet("P&L Detail");

    // Column widths
    ws.columns = [
      { key: "desc",     width: 36 },
      { key: "units",    width: 10 },
      { key: "unitCost", width: 14 },
      { key: "budget",   width: 16 },
      { key: "actual",   width: 16 },
      { key: "variance", width: 16 },
      { key: "pct",      width: 10 },
    ];

    // Color palette
    const GREEN_FG  = "FF0F6E56";
    const RED_FG    = "FFA32D2D";
    const HEADER_BG = "FF1A3A2E";  // dark brand green
    const SECTION_BG = "FFE8F0EC"; // light teal tint
    const SUBTOTAL_BG = "FFD0E3DA";
    const NET_BG    = "FF1A3A2E";

    // Accounting-style currency format: symbol prefix, two decimals, negative in parens
    const currencyFmt = `"${currencyCode} "#,##0.00;[Red]"${currencyCode} "-#,##0.00`;
    const pctFmt = '0.0"%"';

    // Helper: apply bold section header row
    function addSectionHeader(title: string) {
      const row = ws.addRow([title, "", "", "", "", "", ""]);
      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      });
      row.height = 18;
    }

    // Helper: add a category sub-header
    function addCategoryHeader(catName: string) {
      const row = ws.addRow([catName, "", "", "", "", "", ""]);
      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_BG } };
        cell.font = { bold: true, size: 10 };
        cell.border = { bottom: { style: "thin", color: { argb: "FFB2CECA" } } };
      });
      row.height = 16;
    }

    // Helper: add a data row
    function addDataRow(name: string, units: number | null, unitCost: number | null, budget: number, actual: number, type: string) {
      const { dollar, pct } = exportComputeVariance(type, budget, actual);
      const isPos = dollar != null && dollar > 0;
      const isNeg = dollar != null && dollar < 0;
      const varColor = isPos ? GREEN_FG : isNeg ? RED_FG : "FF666666";

      const row = ws.addRow([name, units ?? null, unitCost ?? null, budget, actual, dollar ?? null, pct != null ? pct / 100 : null]);

      // Description cell
      row.getCell(1).font = { size: 11 };

      // Units / Unit Cost
      row.getCell(2).numFmt = "#,##0";
      row.getCell(2).alignment = { horizontal: "right" };
      row.getCell(3).numFmt = currencyFmt;
      row.getCell(3).alignment = { horizontal: "right" };

      // Budget / Actual (currency)
      row.getCell(4).numFmt = currencyFmt;
      row.getCell(4).alignment = { horizontal: "right" };
      row.getCell(5).numFmt = currencyFmt;
      row.getCell(5).alignment = { horizontal: "right" };

      // Variance $
      row.getCell(6).numFmt = currencyFmt;
      row.getCell(6).alignment = { horizontal: "right" };
      row.getCell(6).font = { color: { argb: varColor }, bold: false };

      // Variance %
      row.getCell(7).numFmt = pctFmt;
      row.getCell(7).alignment = { horizontal: "right" };
      row.getCell(7).font = { color: { argb: varColor } };

      row.height = 18;
      return row;
    }

    // Helper: add a subtotal row
    function addSubtotalRow(label: string, type: string, totalBudget: number, totalActual: number) {
      const { dollar, pct } = exportComputeVariance(type, totalBudget, totalActual);
      const isPos = dollar != null && dollar > 0;
      const isNeg = dollar != null && dollar < 0;
      const varColor = isPos ? GREEN_FG : isNeg ? RED_FG : "FF666666";

      const row = ws.addRow([label, "", "", totalBudget, totalActual, dollar ?? null, pct != null ? pct / 100 : null]);

      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_BG } };
        cell.font = { bold: true };
        cell.border = { top: { style: "thin", color: { argb: "FFB2CECA" } } };
      });

      row.getCell(1).font = { bold: true, size: 10 };
      row.getCell(4).numFmt = currencyFmt;
      row.getCell(4).alignment = { horizontal: "right" };
      row.getCell(5).numFmt = currencyFmt;
      row.getCell(5).alignment = { horizontal: "right" };
      row.getCell(6).numFmt = currencyFmt;
      row.getCell(6).alignment = { horizontal: "right" };
      row.getCell(6).font = { bold: true, color: { argb: varColor } };
      row.getCell(7).numFmt = pctFmt;
      row.getCell(7).alignment = { horizontal: "right" };
      row.getCell(7).font = { bold: true, color: { argb: varColor } };

      row.height = 19;
    }

    // ── Column header row ───────────────────────────────────────────────────
    const colHeaderRow = ws.addRow([
      "Description", "Units", `Unit Cost (${currencyCode})`, `Budget (${currencyCode})`,
      `Actual (${currencyCode})`, `Variance (${currencyCode})`, "Var %",
    ]);
    colHeaderRow.eachCell((cell, colNumber) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D5A47" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = { horizontal: colNumber === 1 ? "left" : "right" };
    });
    colHeaderRow.height = 20;

    // Group rows by type then by category
    const byType = new Map<string, Map<string, typeof rows>>();
    for (const row of rows) {
      const type = row.type ?? "Expense";
      const cat  = row.category;
      if (!byType.has(type)) byType.set(type, new Map());
      const catMap = byType.get(type)!;
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(row);
    }

    let totalIncomeBudget = 0, totalIncomeActual = 0;
    let totalExpenseBudget = 0, totalExpenseActual = 0;

    // ── INCOME section ──────────────────────────────────────────────────────
    const incomeMap = byType.get("Income");
    if (incomeMap && incomeMap.size > 0) {
      addSectionHeader("INCOME");
      for (const cat of INCOME_CATS_ORDER) {
        const lines_ = incomeMap.get(cat);
        if (!lines_ || lines_.length === 0) continue;
        addCategoryHeader(cat);
        let catBudget = 0, catActual = 0;
        for (const row of lines_) {
          const budget = Number(row.committedAmount ?? 0);
          const actual = Number(row.actualAmount ?? 0);
          catBudget += budget;
          catActual += actual;
          addDataRow(row.lineItemName || cat, row.units ?? null, row.unitCost != null ? Number(row.unitCost) : null, budget, actual, "Income");
        }
        totalIncomeBudget += catBudget;
        totalIncomeActual += catActual;
        addSubtotalRow(`${cat} Subtotal`, "Income", catBudget, catActual);
      }
      // Handle any categories not in INCOME_CATS_ORDER
      for (const [cat, lines_] of incomeMap.entries()) {
        if ((INCOME_CATS_ORDER as readonly string[]).includes(cat)) continue;
        addCategoryHeader(cat);
        let catBudget = 0, catActual = 0;
        for (const row of lines_) {
          const budget = Number(row.committedAmount ?? 0);
          const actual = Number(row.actualAmount ?? 0);
          catBudget += budget;
          catActual += actual;
          addDataRow(row.lineItemName || cat, row.units ?? null, row.unitCost != null ? Number(row.unitCost) : null, budget, actual, "Income");
        }
        totalIncomeBudget += catBudget;
        totalIncomeActual += catActual;
        addSubtotalRow(`${cat} Subtotal`, "Income", catBudget, catActual);
      }
      addSubtotalRow("TOTAL INCOME", "Income", totalIncomeBudget, totalIncomeActual);
    }

    // ── EXPENSE section ─────────────────────────────────────────────────────
    const expenseMap = byType.get("Expense");
    if (expenseMap && expenseMap.size > 0) {
      ws.addRow([]); // spacer
      addSectionHeader("EXPENSES");
      for (const cat of EXPENSE_CATS_ORDER) {
        const lines_ = expenseMap.get(cat);
        if (!lines_ || lines_.length === 0) continue;
        addCategoryHeader(cat);
        let catBudget = 0, catActual = 0;
        for (const row of lines_) {
          const budget = Number(row.committedAmount ?? 0);
          const actual = Number(row.actualAmount ?? 0);
          catBudget += budget;
          catActual += actual;
          addDataRow(row.lineItemName || cat, row.units ?? null, row.unitCost != null ? Number(row.unitCost) : null, budget, actual, "Expense");
        }
        totalExpenseBudget += catBudget;
        totalExpenseActual += catActual;
        addSubtotalRow(`${cat} Subtotal`, "Expense", catBudget, catActual);
      }
      // Handle any categories not in EXPENSE_CATS_ORDER
      for (const [cat, lines_] of expenseMap.entries()) {
        if ((EXPENSE_CATS_ORDER as readonly string[]).includes(cat)) continue;
        addCategoryHeader(cat);
        let catBudget = 0, catActual = 0;
        for (const row of lines_) {
          const budget = Number(row.committedAmount ?? 0);
          const actual = Number(row.actualAmount ?? 0);
          catBudget += budget;
          catActual += actual;
          addDataRow(row.lineItemName || cat, row.units ?? null, row.unitCost != null ? Number(row.unitCost) : null, budget, actual, "Expense");
        }
        totalExpenseBudget += catBudget;
        totalExpenseActual += catActual;
        addSubtotalRow(`${cat} Subtotal`, "Expense", catBudget, catActual);
      }
      addSubtotalRow("TOTAL EXPENSES", "Expense", totalExpenseBudget, totalExpenseActual);
    }

    // ── NET P&L row — always shown when there are any budget rows ───────────
    if (rows.length > 0) {
      ws.addRow([]);
      const netBudget = totalIncomeBudget  - totalExpenseBudget;
      const netActual = totalIncomeActual  - totalExpenseActual;
      const netRow = ws.addRow(["NET P&L", "", "", netBudget, netActual, "", ""]);

      netRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NET_BG } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      });
      netRow.getCell(4).numFmt = currencyFmt;
      netRow.getCell(4).alignment = { horizontal: "right" };
      netRow.getCell(4).font = { bold: true, color: { argb: netBudget >= 0 ? "FF86EFAC" : "FFFCA5A5" }, size: 12 };
      netRow.getCell(5).numFmt = currencyFmt;
      netRow.getCell(5).alignment = { horizontal: "right" };
      netRow.getCell(5).font = { bold: true, color: { argb: netActual >= 0 ? "FF86EFAC" : "FFFCA5A5" }, size: 12 };
      netRow.height = 22;
    }

    // Stream workbook to response
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
    return;
  },
);

// ── POST /budgets/email-export ────────────────────────────────────────────────
const EmailExportSchema = z.object({
  conveningId: z.string().min(1),
  recipients:  z.array(z.string().email()).min(1).max(20),
  message:     z.string().max(2000).nullish(),
  currency:    z.string().regex(/^[A-Za-z]{3}$/).nullish(),
});

router.post(
  "/budgets/email-export",
  requirePermission("budget:export"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parsed = EmailExportSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const { conveningId, recipients, message, currency } = parsed.data;
    const currencyCode = currency ? currency.toUpperCase() : "USD";

    // Fetch convening name and slug
    const [convening] = await db
      .select({ name: conveningsTable.name, slug: conveningsTable.slug })
      .from(conveningsTable)
      .where(eq(conveningsTable.id, conveningId))
      .limit(1);

    const conveningName = convening?.name ?? "Convening";
    const slug = convening?.slug ?? conveningId.slice(0, 12);

    // Fetch sender name
    const actor = req.portalUser!;
    const [senderRow] = await db
      .select({ name: portalUsersTable.name })
      .from(portalUsersTable)
      .where(eq(portalUsersTable.id, actor.id))
      .limit(1);
    const senderName = senderRow?.name ?? actor.email ?? "Mkutano Team";

    // Fetch budget rows
    const rows = await db
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.conveningId, conveningId))
      .orderBy(budgetsTable.type, budgetsTable.category);

    // Build CSV
    function csvCell(v: unknown): string {
      const s = v == null ? "" : String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }

    const csvHeader = ["Category", "Type", "Description", "Units", "Unit Cost", "Budget", "Actual", "Variance", "%"];
    const csvLines: string[] = [csvHeader.map(csvCell).join(",")];

    let totalIncomeBudget = 0, totalIncomeActual = 0;
    let totalExpenseBudget = 0, totalExpenseActual = 0;

    for (const row of rows) {
      const budget = Number(row.committedAmount ?? 0);
      const actual = Number(row.actualAmount ?? 0);
      const type   = row.type ?? "Expense";
      const { dollar, pct } = exportComputeVariance(type, budget, actual);

      if (type === "Income") {
        totalIncomeBudget += budget;
        totalIncomeActual += actual;
      } else {
        totalExpenseBudget += budget;
        totalExpenseActual += actual;
      }

      csvLines.push([
        csvCell(row.category),
        csvCell(type),
        csvCell(row.lineItemName ?? ""),
        csvCell(row.units != null ? row.units : ""),
        csvCell(row.unitCost != null ? row.unitCost : ""),
        csvCell(budget.toFixed(2)),
        csvCell(actual.toFixed(2)),
        csvCell(dollar != null ? dollar.toFixed(2) : ""),
        csvCell(pct != null ? pct.toFixed(1) + "%" : ""),
      ].join(","));
    }

    const csvContent = csvLines.join("\r\n");
    const today = new Date().toISOString().slice(0, 10);
    const csvFilename = `budget-${slug}-${today}.csv`;

    const netBudget = totalIncomeBudget - totalExpenseBudget;
    const netActual = totalIncomeActual - totalExpenseActual;

    await sendBudgetSummaryEmail({
      to: recipients,
      conveningName,
      senderName,
      message: message ?? null,
      csvContent,
      csvFilename,
      summary: {
        currency: currencyCode,
        totalIncomeBudget,
        totalIncomeActual,
        totalExpenseBudget,
        totalExpenseActual,
        netBudget,
        netActual,
      },
    });

    void writeAudit({
      conveningId,
      actorUserId: actor.id,
      action: "Export",
      entityType: "Budget",
      entityId: conveningId,
      summary: `Emailed budget P&L snapshot to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""} (${recipients.join(", ")})`,
    });

    res.json({ sent: true, recipients: recipients.length });
    return;
  },
);

// ── DELETE /budgets/:id ───────────────────────────────────────────────────────
router.delete(
  "/budgets/:id",
  requirePermission("budget:write"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const [row] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    if ((req.query.conveningId && req.query.conveningId !== row.conveningId) ||
        (req.body?.conveningId && req.body.conveningId !== row.conveningId)) {
      res.status(400).json({ error: "Conflicting conveningId values across request" }); return;
    }
    if (!canAccessConvening(req.portalUser!, row.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
    }

    await db.delete(budgetsTable).where(eq(budgetsTable.id, id));

    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Budget",
      entityId: id,
      summary: `Deleted budget line "${row.category}"`,
      before: row,
    });

    res.status(204).end();
    return;
  },
);

export default router;
