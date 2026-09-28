import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  conveningsTable,
  engagementsTable,
  speakerEngagementsTable,
  speakersTable,
  mediaConsentsTable,
  budgetsTable,
  tasksTable,
  workstreamsTable,
  delegatesTable,
} from "@workspace/db";
import { agendaSessionsTable, providerBookingsTable, serviceProvidersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAnyPermission } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";

const router: IRouter = Router();

const KEY_PROVIDER_CATEGORIES = new Set<string>(["VenueHotel", "Catering", "AVStreaming", "Security"]);
const CONTRACTED_STATUSES = new Set<string>(["Contracted", "Paid", "Completed"]);
const MIN_CELL = 5;

function tally(rows: { [k: string]: unknown }[], key: string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const v = r[key] as string | null | undefined;
    if (v) m[v] = (m[v] ?? 0) + 1;
  }
  return m;
}

function suppressSmallCells(map: Record<string, number>, min = MIN_CELL): Record<string, number> {
  const out: Record<string, number> = {};
  let hidden = 0;
  for (const [k, v] of Object.entries(map)) {
    if (v >= min) out[k] = v;
    else hidden += v;
  }
  if (hidden > 0) out["Other / undisclosed"] = (out["Other / undisclosed"] ?? 0) + hidden;
  return out;
}

router.get("/analytics", requireAnyPermission([
  "partners:read", "speakers:read", "budget:read", "delegates:read",
  "deal:read", "exhibition:read", "tasks:read", "sessions:read",
  "outcomes:read", "documents:read",
]), async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { conveningId } = req.query;
  if (typeof conveningId !== "string" || !conveningId) {
    res.status(422).json({ error: "conveningId is required" });
    return;
  }

  const cid = conveningId;
  if (!canAccessConvening(req.portalUser!, cid)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
  }

  const [convening] = await db
    .select()
    .from(conveningsTable)
    .where(eq(conveningsTable.id, cid));

  if (!convening) {
    res.status(404).json({ error: "Convening not found" });
    return;
  }

  const [engagements, speakerEngagements, consents, budgets, tasks, workstreams, sessions, bookingsWithCategory, delegates] =
    await Promise.all([
      db.select().from(engagementsTable).where(eq(engagementsTable.conveningId, cid)),
      db
        .select({
          id: speakerEngagementsTable.id,
          speakerId: speakerEngagementsTable.speakerId,
          invitationStatus: speakerEngagementsTable.invitationStatus,
          gender: speakersTable.gender,
          speakerProfile: speakerEngagementsTable.speakerProfile,
        })
        .from(speakerEngagementsTable)
        .leftJoin(speakersTable, eq(speakerEngagementsTable.speakerId, speakersTable.id))
        .where(eq(speakerEngagementsTable.conveningId, cid)),
      db.select().from(mediaConsentsTable).where(eq(mediaConsentsTable.conveningId, cid)),
      db.select().from(budgetsTable).where(eq(budgetsTable.conveningId, cid)),
      db.select().from(tasksTable).where(eq(tasksTable.conveningId, cid)),
      db.select().from(workstreamsTable).where(eq(workstreamsTable.conveningId, cid)),
      db.select().from(agendaSessionsTable).where(eq(agendaSessionsTable.conveningId, cid)),
      db
        .select({
          procurementStatus: providerBookingsTable.procurementStatus,
          category: serviceProvidersTable.category,
        })
        .from(providerBookingsTable)
        .innerJoin(
          serviceProvidersTable,
          eq(providerBookingsTable.serviceProviderId, serviceProvidersTable.id),
        )
        .where(eq(providerBookingsTable.conveningId, cid)),
      db.select().from(delegatesTable).where(eq(delegatesTable.conveningId, cid)),
    ]);

  // ── Partner funnel ──────────────────────────────────────────────────────
  const funnelStages = ["Prospect", "Negotiation", "ContractSigned", "Onboarded", "PostEvent"];
  const funnel = funnelStages.map((stage) => ({
    stage,
    count: engagements.filter((e) => e.status === stage).length,
  }));

  // ── Speaker confirmation ────────────────────────────────────────────────
  const confirmedStatuses = ["Confirmed", "Briefed", "Ready", "Attended", "Thanked"];
  const invitedStatuses = ["Invited", ...confirmedStatuses];
  const invited = speakerEngagements.filter((se) => invitedStatuses.includes(se.invitationStatus)).length;
  const confirmed = speakerEngagements.filter((se) => confirmedStatuses.includes(se.invitationStatus)).length;

  // ── Gender diversity (speakers) ─────────────────────────────────────────
  const genderCounts: Record<string, number> = {};
  for (const se of speakerEngagements) {
    const g = (se.speakerProfile ? se.speakerProfile.gender : se.gender) ?? "Unspecified";
    genderCounts[g] = (genderCounts[g] ?? 0) + 1;
  }
  const diversity = Object.entries(genderCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // ── Session-type distribution ───────────────────────────────────────────
  const sessionTypeCounts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.format === "Break" || s.format === "Intermission") continue;
    sessionTypeCounts[s.format] = (sessionTypeCounts[s.format] ?? 0) + 1;
  }
  const sessionTypes = Object.entries(sessionTypeCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // ── Budget ─────────────────────────────────────────────────────────────
  const budgetByCategory = new Map<string, { committed: number; actual: number }>();
  for (const b of budgets) {
    const existing = budgetByCategory.get(b.category) ?? { committed: 0, actual: 0 };
    budgetByCategory.set(b.category, {
      committed: existing.committed + parseFloat(b.committedAmount ?? "0"),
      actual: existing.actual + parseFloat(b.actualAmount ?? "0"),
    });
  }
  const budgetData = Array.from(budgetByCategory.entries()).map(([category, vals]) => ({
    category,
    committed: vals.committed,
    actual: vals.actual,
    variance: vals.committed - vals.actual,
  }));

  // ── Provider readiness check ───────────────────────────────────────────
  const contractedCategories = new Set<string>(
    bookingsWithCategory
      .filter((b) => CONTRACTED_STATUSES.has(b.procurementStatus))
      .map((b) => b.category),
  );
  const hasAnyProviderBookings = bookingsWithCategory.length > 0;
  const missingKeyProviders = [...KEY_PROVIDER_CATEGORIES].filter(
    (cat) => !contractedCategories.has(cat),
  );

  // ── Readiness ──────────────────────────────────────────────────────────
  const hasOnboardedPartner = engagements.some((e) => e.status === "Onboarded");
  const totalBudgetSet = budgets.length > 0;
  const hasTasks = tasks.some((t) => ["InProgress", "Completed"].includes(t.status));
  const allNotBlocked = !tasks.some((t) => t.status === "Blocked");
  const consentRequested = consents.length > 0;

  const providerOpsBonus = missingKeyProviders.length === 0 ? 40
    : hasAnyProviderBookings ? 25
    : 0;

  const categoryScores: { label: string; score: number; weight: number }[] = [
    {
      label: "Partners & Funding",
      weight: 30,
      score:
        (hasOnboardedPartner ? 60 : engagements.some((e) => e.status !== "Prospect") ? 30 : 0) +
        (totalBudgetSet ? 40 : 0),
    },
    {
      label: "Programme & Speakers",
      weight: 35,
      score:
        (invited >= 5 ? 40 : invited >= 3 ? 25 : invited >= 1 ? 15 : 0) +
        (confirmed >= 3 ? 40 : confirmed >= 1 ? 25 : 0) +
        (consentRequested ? 20 : 0),
    },
    {
      label: "Venue & Logistics",
      weight: 20,
      score: convening.venueConfirmed ? 100 : 0,
    },
    {
      label: "Operations",
      weight: 15,
      score:
        (workstreams.length >= 2 ? 30 : workstreams.length > 0 ? 20 : 0) +
        (hasTasks ? 20 : 0) +
        (allNotBlocked ? 10 : 0) +
        providerOpsBonus,
    },
  ];

  const totalWeight = categoryScores.reduce((s, c) => s + c.weight, 0);
  const rawScore = Math.round(
    (categoryScores.reduce((s, c) => s + (c.score * c.weight) / 100, 0) / totalWeight) * 100,
  );

  // Capping gates
  const gates: { label: string; passed: boolean; capsAt: number }[] = [
    { label: "Venue confirmed", passed: convening.venueConfirmed, capsAt: 70 },
    { label: "Sponsor onboarded", passed: hasOnboardedPartner, capsAt: 85 },
    { label: "Key vendors contracted", passed: missingKeyProviders.length === 0, capsAt: 90 },
  ];

  const activeCaps = gates.filter((g) => !g.passed).map((g) => g.capsAt);
  const score = activeCaps.length > 0 ? Math.min(rawScore, Math.min(...activeCaps)) : rawScore;

  // ── Registration ───────────────────────────────────────────────────────
  const activeStatuses = new Set(["Registered", "Confirmed", "Attended", "Waitlisted"]);
  const activeDelegates = delegates.filter((d) => activeStatuses.has(d.status));

  const statusCounts: Record<string, number> = {};
  for (const d of delegates) {
    statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;
  }
  const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  const passCounts: Record<string, number> = {};
  for (const d of activeDelegates) {
    passCounts[d.passType] = (passCounts[d.passType] ?? 0) + 1;
  }
  const passMix = Object.entries(passCounts).map(([type, count]) => ({ type, count }));

  const segmentCounts: Record<string, number> = {};
  for (const d of activeDelegates) {
    const seg = d.segment ?? "Unassigned";
    segmentCounts[seg] = (segmentCounts[seg] ?? 0) + 1;
  }
  const byConstituency = Object.entries(segmentCounts)
    .map(([segment, count]) => ({ segment, count }))
    .sort((a, b) => b.count - a.count);

  const countries = new Set(activeDelegates.map((d) => d.country).filter(Boolean));
  const totalAum = activeDelegates.reduce((s, d) => s + (d.aum ?? 0), 0);

  const registration = {
    total: activeDelegates.length,
    target: convening.registrationTarget ?? 0,
    statusBreakdown,
    passMix,
    byConstituency,
    countriesCount: countries.size,
    totalAum,
  };

  // ── Delegate demographics ───────────────────────────────────────────────
  const total = activeDelegates.length;
  const rawGender = tally(activeDelegates as { [k: string]: unknown }[], "gender");
  const rawAge = tally(activeDelegates as { [k: string]: unknown }[], "ageBand");
  const rawCountry = tally(activeDelegates as { [k: string]: unknown }[], "country");
  const rawSegment = tally(activeDelegates as { [k: string]: unknown }[], "segment");

  const declaredGender = Object.values(rawGender).reduce((a, b) => a + b, 0);
  const declaredAge = Object.values(rawAge).reduce((a, b) => a + b, 0);

  const demographics = {
    total,
    countriesRepresented: Object.keys(rawCountry).length,
    byCountry: suppressSmallCells(rawCountry, MIN_CELL),
    byGender: suppressSmallCells(rawGender, MIN_CELL),
    byAgeBand: suppressSmallCells(rawAge, MIN_CELL),
    byConstituency: rawSegment,
    declaredRates: {
      genderPct: total ? Math.round((declaredGender / total) * 100) : 0,
      agePct: total ? Math.round((declaredAge / total) * 100) : 0,
    },
  };

  res.json({
    convening: {
      name: convening.name,
      venueConfirmed: convening.venueConfirmed,
      status: convening.status,
      theme: convening.theme ?? null,
      startDate: convening.startDate ?? null,
      endDate: convening.endDate ?? null,
      venueName: convening.venueName ?? null,
    },
    readiness: {
      score,
      rawScore,
      categories: categoryScores,
      gates,
    },
    funnel,
    confirmation: { invited, confirmed },
    diversity,
    sessionTypes,
    budget: budgetData,
    registration,
    demographics,
  });
});

export default router;
