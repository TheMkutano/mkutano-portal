import { useConvening } from "@/contexts/ConveningContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useGetAnalytics, getGetAnalyticsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { ReadinessRing } from "@/components/charts/ReadinessRing";
import { DonutChart, DonutLegend } from "@/components/charts/DonutChart";
import { Users, Mic, LayoutGrid, Globe2, DollarSign, CalendarDays, MapPin, CheckCircle2 } from "lucide-react";

// ── McKinsey CATEGORICAL palette (theme-mckinsey.ts) ─────────────────────────
const CAT = [
  "#0A2F5C", "#2A6FB0", "#4FA0C0", "#6C7A99",
  "#C99A3B", "#8E6FAE", "#4E8A66", "#BB6B4F",
];

// Blues-only sub-palette for readiness breakdown (keeps the section cohesive)
const BLUES = ["#0A2F5C", "#2A6FB0", "#4FA0C0", "#6C7A99"];

// Brand pipeline stage colours — keyed to the exact stage strings from the analytics funnel
// (funnelStages = ["Prospect","Negotiation","ContractSigned","Onboarded","PostEvent"])
const PIPELINE_COLORS: Record<string, string> = {
  Prospect:      "#9AA4B0",
  Negotiation:   "#C99A3B",
  ContractSigned:"#1D5FA8",
  Onboarded:     "#2E7D5B",
  PostEvent:     "#2E6B3E",
};

// Semantic status colours for delegate status breakdown
const STATUS_COLORS: Record<string, string> = {
  Confirmed:  "#2E7D5B",
  Attended:   "#2E7D5B",
  Registered: "#2A6FB0",
  Cancelled:  "#B5462F",
  Waitlisted: "#9AA4B0",
};

// Semantic colours
function scoreColor(s: number) {
  return s >= 75 ? "#2E7D5B" : s >= 50 ? "#2A6FB0" : "#B5462F";
}

const PASS_LABELS: Record<string, string> = {
  Paid: "Paid",
  FreeSponsor: "Free – Sponsor",
  FreeComp: "Free – Comp",
};

// ── Shared mini-bar row ───────────────────────────────────────────────────────
function MiniBar({
  rowLabel,
  count,
  max,
  color,
}: {
  rowLabel: string;
  count: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(3, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-[11px] text-[var(--brand-text-secondary)] truncate shrink-0">
        {rowLabel}
      </span>
      <div className="flex-1 h-3 rounded-sm overflow-hidden bg-[var(--brand-tint)]">
        <div
          className="h-full rounded-sm transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-[var(--brand-ink)] w-5 text-right shrink-0">
        {count}
      </span>
    </div>
  );
}

// ── Section header (left-bar accent per brand guide) ─────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="inline-block w-[3px] h-4 rounded-full bg-[var(--brand-primary)] shrink-0" />
      <h2 className="text-[13px] font-semibold text-[var(--brand-ink)]">{children}</h2>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-[10px]" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-52 rounded-[10px]" />)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { activeConveningId } = useConvening();
  const { displayCurrency, usdToUgxRate } = useCurrency();

  const params = { conveningId: activeConveningId || "" };
  const { data: analytics, isLoading } = useGetAnalytics(params, {
    query: { enabled: !!activeConveningId, queryKey: getGetAnalyticsQueryKey(params) },
  });

  if (!activeConveningId) return null;
  if (isLoading) return <DashboardSkeleton />;
  if (!analytics) return null;

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalCommitted = analytics.budget.reduce((s, b) => s + b.committed, 0);
  const totalActual    = analytics.budget.reduce((s, b) => s + b.actual,    0);
  const confirmationPct =
    analytics.confirmation.invited > 0
      ? Math.round((analytics.confirmation.confirmed / analytics.confirmation.invited) * 100)
      : 0;
  const isCapped       = analytics.readiness.score < analytics.readiness.rawScore;
  const failedGates    = analytics.readiness.gates.filter((g) => !g.passed);
  const sessionTypes   = (analytics.sessionTypes ?? []).map((s) => ({ ...s, name: label(s.name) }));
  const diversityData  = analytics.diversity.map((d)           => ({ ...d, name: label(d.name) }));
  const reg            = analytics.registration;
  const demo           = analytics.demographics;

  // Registration derived
  const regConfirmed = reg
    ? reg.statusBreakdown.filter((s) => ["Confirmed", "Attended"].includes(s.status)).reduce((n, s) => n + s.count, 0)
    : 0;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl bg-[#0A2F5C] px-7 py-6 text-white shadow-md">
        {/* decorative blobs */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/[0.04]" />
        <div className="pointer-events-none absolute bottom-0 right-24 h-28 w-28 rounded-full bg-[#C99A3B]/20" />
        <div className="pointer-events-none absolute top-0 left-1/2 h-px w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* left: name + theme + meta */}
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold tracking-[0.18em] uppercase text-blue-300/60">
              Active project
            </p>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-white">
              {analytics.convening.name}
            </h1>
            {analytics.convening.theme && (
              <p className="mt-1 text-[13px] italic text-blue-200/70">
                {analytics.convening.theme}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {(analytics.convening.startDate || analytics.convening.endDate) && (
                <span className="flex items-center gap-1.5 text-[12px] text-blue-200/70">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#C99A3B]" />
                  {analytics.convening.startDate
                    ? new Date(analytics.convening.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : ""}
                  {analytics.convening.endDate && analytics.convening.startDate && " – "}
                  {analytics.convening.endDate
                    ? new Date(analytics.convening.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : ""}
                </span>
              )}
              {analytics.convening.venueName && (
                <span className="flex items-center gap-1.5 text-[12px] text-blue-200/70">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#C99A3B]" />
                  {analytics.convening.venueName}
                  {analytics.convening.venueConfirmed && (
                    <span className="ml-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
                      confirmed
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* right: status + readiness */}
          <div className="flex shrink-0 flex-row items-center gap-5 sm:flex-col sm:items-end sm:gap-3">
            <StatusBadge status={analytics.convening.status} />
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                Readiness
              </p>
              <p
                className="text-[32px] font-black leading-none tabular-nums"
                style={{ color: analytics.readiness.score >= 75 ? "#4ade80" : analytics.readiness.score >= 50 ? "#93c5fd" : "#fca5a5" }}
              >
                {analytics.readiness.score}
                <span className="text-sm font-normal text-blue-300/40">/100</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Top metric strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

        {/* Readiness — number carries the colour */}
        <MetricCard
          label="Readiness"
          value={
            <span style={{ color: scoreColor(analytics.readiness.score) }}>
              {analytics.readiness.score}
            </span>
          }
          sub={
            isCapped
              ? `Raw ${analytics.readiness.rawScore} — gated`
              : "Score out of 100"
          }
          accentIcon={{ icon: <CheckCircle2 />, bg: "#E8F5EE", fg: "#2E7D5B" }}
        >
          <div className="flex flex-col items-center gap-2 mt-3 -mb-1">
            <ReadinessRing
              score={analytics.readiness.score}
              rawScore={analytics.readiness.rawScore}
              size={88}
            />
            {isCapped && failedGates.length > 0 && (
              <div className="w-full space-y-1 pt-1">
                {failedGates.map((g) => (
                  <p key={g.label} className="text-[11px] text-amber-700 leading-snug">
                    {g.capsAt > 0
                      ? `↳ Capped at ${g.capsAt}% — ${g.label}`
                      : `↳ ${g.label} outstanding`}
                  </p>
                ))}
              </div>
            )}
          </div>
        </MetricCard>

        {/* Speakers confirmed */}
        <MetricCard
          label="Speakers confirmed"
          value={
            <span style={{ color: scoreColor(confirmationPct) }}>
              {analytics.confirmation.confirmed}
              <span className="text-xl font-normal ml-1" style={{ color: "var(--brand-border)" }}>
                / {analytics.confirmation.invited}
              </span>
            </span>
          }
          sub={`${confirmationPct}% confirmation rate`}
          accentIcon={{ icon: <Mic />, bg: "#E8F1F8", fg: "#2A6FB0" }}
        >
          <div className="relative h-1.5 bg-[var(--brand-tint)] rounded-full overflow-hidden mt-3">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{
                width: `${confirmationPct}%`,
                background: scoreColor(confirmationPct),
              }}
            />
          </div>
        </MetricCard>

        {/* Funding committed */}
        <MetricCard
          label="Funding committed"
          value={
            <span style={{ color: totalCommitted > 0 ? "#2A6FB0" : "var(--brand-text-secondary)" }}>
              {formatMoney(totalCommitted, "USD", displayCurrency, usdToUgxRate)}
            </span>
          }
          sub={
            totalActual > 0
              ? `${formatMoney(totalActual, "USD", displayCurrency, usdToUgxRate)} actual spend`
              : "No spend recorded yet"
          }
          accentIcon={{ icon: <DollarSign />, bg: "#FAF3E4", fg: "#C99A3B" }}
        >
          {totalCommitted > 0 && (
            <div className="relative h-1.5 bg-[var(--brand-tint)] rounded-full overflow-hidden mt-3">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (totalActual / totalCommitted) * 100)}%`,
                  background: totalActual > totalCommitted ? "#C99A3B" : "#2A6FB0",
                }}
              />
            </div>
          )}
        </MetricCard>

        {/* Convening status */}
        <MetricCard
          label="Status"
          value={<StatusBadge status={analytics.convening.status} size="sm" />}
          sub={analytics.convening.venueConfirmed ? "✓ Venue confirmed" : "⚠ Venue TBD"}
          accentIcon={{ icon: <LayoutGrid />, bg: "#E8EDF5", fg: "#0A2F5C" }}
        />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Programme overview</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Partner pipeline — brand pipeline stage colours */}
          <Card className="border-[var(--brand-border)] border-t-2 border-t-[var(--brand-tint)] shadow-none">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-[13px] font-semibold text-[var(--brand-ink)]">
                Partner pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {analytics.funnel.every((f) => f.count === 0) ? (
                <EmptyState
                  icon={<Users />}
                  title="No partners yet"
                  body="Add partners to track the pipeline."
                  className="py-8"
                />
              ) : (
                <div className="space-y-2.5">
                  {(() => {
                    const max = Math.max(...analytics.funnel.map((f) => f.count), 1);
                    return analytics.funnel.map((stage) => (
                      <MiniBar
                        key={stage.stage}
                        rowLabel={label(stage.stage)}
                        count={stage.count}
                        max={max}
                        color={PIPELINE_COLORS[stage.stage] ?? CAT[0]}
                      />
                    ));
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Speaker diversity donut — CATEGORICAL (DonutChart default) */}
          <Card className="border-[var(--brand-border)] border-t-2 border-t-[var(--brand-tint)] shadow-none">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-[13px] font-semibold text-[var(--brand-ink)]">
                Speaker diversity
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {diversityData.length === 0 ? (
                <EmptyState
                  icon={<Mic />}
                  title="No speakers engaged yet"
                  body="Gender diversity appears once speakers are added."
                  className="py-8"
                />
              ) : (
                <div className="flex items-center gap-4">
                  <DonutChart data={diversityData} colors={CAT} size={100} />
                  <div className="flex-1 min-w-0">
                    <DonutLegend data={diversityData} colors={CAT} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Session formats donut — CATEGORICAL */}
          <Card className="border-[var(--brand-border)] border-t-2 border-t-[var(--brand-tint)] shadow-none">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-[13px] font-semibold text-[var(--brand-ink)]">
                Session formats
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {sessionTypes.length === 0 ? (
                <EmptyState
                  icon={<LayoutGrid />}
                  title="No sessions yet"
                  body="Format breakdown appears once agenda sessions are created."
                  className="py-8"
                />
              ) : (
                <div className="flex items-center gap-4">
                  <DonutChart data={sessionTypes} colors={CAT} size={100} />
                  <div className="flex-1 min-w-0">
                    <DonutLegend data={sessionTypes} colors={CAT} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Registration tally ─────────────────────────────────────────── */}
      {reg && (
        <div>
          <SectionTitle>Delegate registration</SectionTitle>

          {/* 4 MetricCards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <MetricCard
              label="Registered"
              value={
                <span>
                  {reg.total}
                  {reg.target > 0 && (
                    <span className="text-xl font-normal ml-1" style={{ color: "var(--brand-border)" }}>
                      / {reg.target}
                    </span>
                  )}
                </span>
              }
              sub={
                reg.target > 0
                  ? `${Math.round((reg.total / reg.target) * 100)}% of target`
                  : undefined
              }
            >
              {reg.target > 0 && (
                <div className="relative h-1.5 bg-[var(--brand-tint)] rounded-full overflow-hidden mt-3">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (reg.total / reg.target) * 100)}%`,
                      background: "var(--brand-primary)",
                    }}
                  />
                </div>
              )}
            </MetricCard>

            <MetricCard
              label="Confirmed"
              value={
                <span style={{ color: regConfirmed > 0 ? "#2E7D5B" : "var(--brand-text-secondary)" }}>
                  {regConfirmed}
                </span>
              }
              sub={reg.total > 0 ? `${Math.round((regConfirmed / reg.total) * 100)}% of registered` : undefined}
            />

            <MetricCard
              label="Countries"
              value={
                <span style={{ color: reg.countriesCount > 0 ? "#2A6FB0" : "var(--brand-text-secondary)" }}>
                  {reg.countriesCount || "—"}
                </span>
              }
              sub={reg.countriesCount > 0 ? "represented" : "No country data yet"}
            />

            <MetricCard
              label="Total AUM ($M)"
              value={
                <span style={{ color: reg.totalAum > 0 ? "#0A2F5C" : "var(--brand-text-secondary)" }}>
                  {reg.totalAum > 0
                    ? reg.totalAum.toLocaleString("en-GB", { maximumFractionDigits: 0 })
                    : "—"}
                </span>
              }
              sub={reg.totalAum > 0 ? "across active delegates" : "No AUM data yet"}
            />
          </div>

          {/* Breakdown mini-charts */}
          {reg.total > 0 && (
            <Card className="border-[var(--brand-border)] shadow-none">
              <CardContent className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

                  {/* Pass mix */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-secondary)]">
                      Pass mix
                    </p>
                    {reg.passMix.length === 0 ? (
                      <p className="text-xs text-[var(--brand-border)]">No data</p>
                    ) : (
                      <div className="space-y-2">
                        {reg.passMix.map((p, i) => (
                          <MiniBar
                            key={p.type}
                            rowLabel={PASS_LABELS[p.type] ?? p.type}
                            count={p.count}
                            max={reg.total}
                            color={CAT[i % CAT.length]}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Status breakdown */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-secondary)]">
                      By status
                    </p>
                    {reg.statusBreakdown.length === 0 ? (
                      <p className="text-xs text-[var(--brand-border)]">No data</p>
                    ) : (
                      <div className="space-y-2">
                        {reg.statusBreakdown.map((s) => (
                          <MiniBar
                            key={s.status}
                            rowLabel={s.status}
                            count={s.count}
                            max={reg.total}
                            color={STATUS_COLORS[s.status] ?? CAT[0]}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* By constituency */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-secondary)]">
                      By constituency
                    </p>
                    {reg.byConstituency.length === 0 ? (
                      <p className="text-xs text-[var(--brand-border)]">No segments yet</p>
                    ) : (
                      <div className="space-y-2">
                        {reg.byConstituency.slice(0, 6).map((c, i) => (
                          <MiniBar
                            key={c.segment}
                            rowLabel={c.segment}
                            count={c.count}
                            max={reg.byConstituency[0]?.count || 1}
                            color={CAT[i % CAT.length]}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Delegate demographics ─────────────────────────────────────── */}
      {demo && demo.total > 0 && (
        <div>
          <SectionTitle>Delegate demographics</SectionTitle>
          <Card className="border-[var(--brand-border)] shadow-none">
            <CardHeader className="pb-1 pt-4 px-5">
              <p className="text-[11px] text-[var(--brand-text-secondary)]">
                Aggregate only · self-reported · groups &lt;5 merged into "Other / undisclosed"
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

                {/* Gender */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-secondary)]">
                      Gender
                    </p>
                    <span className="text-[11px] text-[var(--brand-text-secondary)]">
                      {demo.declaredRates.genderPct}% declared
                    </span>
                  </div>
                  {Object.keys(demo.byGender).length === 0 ? (
                    <p className="text-xs text-[var(--brand-border)]">No data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(demo.byGender)
                        .sort(([, a], [, b]) => b - a)
                        .map(([k, v], i) => {
                          const max = Math.max(...Object.values(demo.byGender));
                          return (
                            <MiniBar
                              key={k}
                              rowLabel={k}
                              count={v}
                              max={max}
                              color={CAT[i % CAT.length]}
                            />
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Age bands */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-secondary)]">
                      Age band
                    </p>
                    <span className="text-[11px] text-[var(--brand-text-secondary)]">
                      {demo.declaredRates.agePct}% declared
                    </span>
                  </div>
                  {Object.keys(demo.byAgeBand).length === 0 ? (
                    <p className="text-xs text-[var(--brand-border)]">No data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(demo.byAgeBand)
                        .sort(([, a], [, b]) => b - a)
                        .map(([k, v], i) => {
                          const max = Math.max(...Object.values(demo.byAgeBand));
                          const agLabel =
                            k === "Under35" ? "Under 35"
                            : k === "Age35to50" ? "35–50"
                            : k === "Over50" ? "Over 50"
                            : k;
                          return (
                            <MiniBar
                              key={k}
                              rowLabel={agLabel}
                              count={v}
                              max={max}
                              color={CAT[i % CAT.length]}
                            />
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Countries */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-secondary)]">
                    Countries
                  </p>
                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span
                      className="text-[26px] font-semibold tabular-nums leading-none"
                      style={{ color: "#2A6FB0" }}
                    >
                      {demo.countriesRepresented}
                    </span>
                    <span className="text-xs text-[var(--brand-text-secondary)]">represented</span>
                  </div>
                  {Object.keys(demo.byCountry).length > 0 && (
                    <div className="space-y-1.5">
                      {Object.entries(demo.byCountry)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([country, count]) => (
                          <div key={country} className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[11px] text-[var(--brand-text-secondary)] truncate">
                              <Globe2 className="h-3 w-3 shrink-0" />
                              {country}
                            </span>
                            <span className="text-[11px] font-semibold tabular-nums text-[var(--brand-ink)] ml-2">
                              {count}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Readiness breakdown ───────────────────────────────────────── */}
      {analytics.readiness.categories.length > 0 && (
        <div>
          <SectionTitle>Readiness breakdown</SectionTitle>
          <Card className="border-[var(--brand-border)] shadow-none">
            <CardContent className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {analytics.readiness.categories.map((cat, i) => (
                  <div key={cat.label} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-[var(--brand-text-secondary)] font-medium truncate">
                        {cat.label}
                      </span>
                      <span
                        className="text-sm font-bold tabular-nums shrink-0"
                        style={{ color: scoreColor(cat.score) }}
                      >
                        {Math.round(cat.score)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-[var(--brand-tint)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${cat.score}%`, background: BLUES[i % BLUES.length] }}
                      />
                    </div>
                    <p className="text-[11px] text-[var(--brand-text-secondary)]">
                      weight {cat.weight}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
