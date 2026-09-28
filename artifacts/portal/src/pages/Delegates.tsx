import { useState, useMemo } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import { label } from "@/lib/labels";
import { PASS_STYLE, PASS_STYLE_FALLBACK, PAYING_TYPES, COMP_TYPES, ALL_PASS_TYPES } from "@/lib/passTypes";
import {
  useListDelegates,
  useCreateDelegate,
  useUpdateDelegate,
  useDeleteDelegate,
  useCheckInByQr,
  useGetAnalytics,
  useGetMe,
  useListPassTypeConfigs,
  getListDelegatesQueryKey,
  getGetAnalyticsQueryKey,
  getListPassTypeConfigsQueryKey,
} from "@workspace/api-client-react";
import type { Delegate, RegistrationAnalytics, DelegatesDemographics, PassTypeConfig } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, Plus, Pencil, Trash2, Globe2,
  QrCode, BadgeCheck, ScanLine, CheckCircle2, AlertCircle, Download, Loader2, FileSpreadsheet, Columns3,
} from "lucide-react";
import { exportXlsx } from "@/lib/exportXlsx";
import { useToast } from "@/hooks/use-toast";
import { BadgeSheet } from "@/components/delegates/BadgeSheet";

// ── Design tokens ────────────────────────────────────────────────────────────
const MUTED = "var(--brand-text-secondary)";
const FL    = "block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1";

// ── §4 Tonal badge helpers ────────────────────────────────────────────────────
interface BS { bg: string; fg: string }

const STATUS_STYLE: Record<string, BS> = {
  Registered: { bg: "#E6F1FB", fg: "#0C447C" },
  Confirmed:  { bg: "#E6F1FB", fg: "#0C447C" },
  Attended:   { bg: "#E1F5EE", fg: "#0F6E56" },
  Cancelled:  { bg: "#FCEBEB", fg: "#A32D2D" },
  Waitlisted: { bg: "#FBF3E2", fg: "#8A6516" },
};

function TonalBadge({ text, style }: { text: string; style: BS }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-[6px] whitespace-nowrap"
      style={{ background: style.bg, color: style.fg }}
    >
      {text}
    </span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[30, 20, 22, 16, 12, 9, 9].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-3 rounded animate-pulse"
            style={{ width: `${w}%`, background: "var(--brand-border)", marginLeft: i >= 5 ? "auto" : undefined }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Registration tally card ───────────────────────────────────────────────────
function RegistrationCard({
  reg,
  configs,
  resolvePassTypeLabel,
}: {
  reg: RegistrationAnalytics;
  configs: PassTypeConfig[];
  resolvePassTypeLabel: (pt: string) => string;
}) {
  const pct = reg.target > 0 ? Math.min(100, Math.round((reg.total / reg.target) * 100)) : null;

  // Build capacity breakdown: only pass types that have a config AND ≥1 registered.
  // Sort by utilisation desc, cap at 4.
  const capacityBreakdown = useMemo(() => {
    const countByType = new Map(reg.passMix.map(p => [p.type, p.count]));

    const rows = configs
      .filter(c => (countByType.get(c.passType) ?? 0) > 0)
      .map(c => {
        const registered = countByType.get(c.passType) ?? 0;
        const capacity = c.capacity ?? 0;
        const util = capacity > 0 ? registered / capacity : 0;
        return { passType: c.passType, registered, capacity, util };
      });

    rows.sort((a, b) => b.util - a.util);
    return rows.slice(0, 4);
  }, [configs, reg.passMix]);

  return (
    <div className="rounded-[10px] border border-[var(--brand-border)] bg-white px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-3" style={{ color: MUTED }}>
        Registration
      </p>
      <div className="flex items-end gap-3 mb-3">
        <span className="text-[32px] font-semibold tabular-nums leading-none text-[var(--brand-ink)]">
          {reg.total.toLocaleString("en-GB")}
        </span>
        {reg.target > 0 && (
          <span className="text-[13px] mb-0.5" style={{ color: MUTED }}>
            of {reg.target.toLocaleString("en-GB")} target
          </span>
        )}
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <div className="mb-3">
          <div className="h-1.5 rounded-full" style={{ background: "var(--brand-border)" }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${pct}%`, background: "var(--brand-primary)" }}
            />
          </div>
          <p className="text-[10px] mt-1" style={{ color: MUTED }}>{pct}% of target</p>
        </div>
      )}

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {reg.statusBreakdown
          .filter(s => s.count > 0)
          .map(s => (
            <div key={s.status} className="flex items-center gap-1.5">
              <TonalBadge
                text={`${s.count} ${label(s.status)}`}
                style={STATUS_STYLE[s.status] ?? { bg: "#F1EFE8", fg: "#5A6472" }}
              />
            </div>
          ))}
      </div>

      {/* Per-pass-type capacity breakdown */}
      {capacityBreakdown.length > 0 && (
        <div className="mt-3 pt-3 flex flex-wrap gap-x-4 gap-y-1.5" style={{ borderTop: "1px solid var(--brand-border)" }}>
          {capacityBreakdown.map(({ passType, registered, capacity, util }) => {
            const style = PASS_STYLE[passType] ?? PASS_STYLE_FALLBACK;
            const pctFill = capacity > 0 ? Math.min(100, Math.round(util * 100)) : null;
            return (
              <div key={passType} className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: style.fg }}>
                  {resolvePassTypeLabel(passType)}
                </span>
                <span className="text-[11px] tabular-nums font-semibold text-[var(--brand-ink)]">
                  {registered}
                </span>
                {capacity > 0 && (
                  <>
                    <span className="text-[10px]" style={{ color: MUTED }}>/ {capacity}</span>
                    <div className="w-10 h-1 rounded-full" style={{ background: "var(--brand-border)" }}>
                      <div
                        className="h-1 rounded-full"
                        style={{
                          width: `${pctFill}%`,
                          background: (pctFill ?? 0) >= 90 ? "#D97706" : style.fg,
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer stats */}
      <div className="flex gap-4 mt-3 pt-3" style={{ borderTop: "1px solid var(--brand-border)" }}>
        <div>
          <p className="text-[10px] uppercase tracking-[0.07em]" style={{ color: MUTED }}>Countries</p>
          <p className="text-[15px] font-semibold tabular-nums text-[var(--brand-ink)]">{reg.countriesCount}</p>
        </div>
        {reg.passMix.map(p => (
          <div key={p.type}>
            <p className="text-[10px] uppercase tracking-[0.07em]" style={{ color: MUTED }}>
              {resolvePassTypeLabel(p.type)}
            </p>
            <p className="text-[15px] font-semibold tabular-nums text-[var(--brand-ink)]">{p.count}</p>
          </div>
        ))}
        {reg.totalAum > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.07em]" style={{ color: MUTED }}>AUM ($M)</p>
            <p className="text-[15px] font-semibold tabular-nums text-[var(--brand-ink)]">
              {reg.totalAum.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Demographics panel ────────────────────────────────────────────────────────
function pctBar(val: number, max: number) {
  return max > 0 ? Math.round((val / max) * 100) : 0;
}

function DemoBars({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;
  const maxVal = Math.max(...entries.map(([, v]) => v));
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-2" style={{ color: MUTED }}>{title}</p>
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-[11px] w-28 truncate" style={{ color: MUTED }}>{label(k)}</span>
            <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--brand-border)" }}>
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${pctBar(v, maxVal)}%`, background: "var(--brand-primary)" }}
              />
            </div>
            <span className="text-[11px] tabular-nums w-6 text-right text-[var(--brand-ink)]">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemographicsPanel({ demo }: { demo: DelegatesDemographics }) {
  return (
    <div className="rounded-[10px] border border-[var(--brand-border)] bg-white px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: MUTED }}>
          Demographics
        </p>
        <div className="flex gap-3">
          {demo.declaredRates.genderPct > 0 && (
            <span className="text-[10px]" style={{ color: MUTED }}>
              Gender declared: <strong className="text-[var(--brand-ink)]">{demo.declaredRates.genderPct}%</strong>
            </span>
          )}
          {demo.declaredRates.agePct > 0 && (
            <span className="text-[10px]" style={{ color: MUTED }}>
              Age declared: <strong className="text-[var(--brand-ink)]">{demo.declaredRates.agePct}%</strong>
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <DemoBars title="Gender" data={demo.byGender} />
        <DemoBars title="Age Band" data={demo.byAgeBand} />
        <DemoBars title="Constituency" data={demo.byConstituency} />
      </div>
    </div>
  );
}

// ── Pass type summary row ─────────────────────────────────────────────────────
interface PassTypeSummaryProps {
  delegates: Delegate[];
  configs: PassTypeConfig[];
  activeCategory: "All" | "Paying" | "Comp";
  onCategoryChange: (c: "All" | "Paying" | "Comp") => void;
  resolvePassTypeLabel: (pt: string) => string;
}

function PassTypeSummary({
  delegates,
  configs,
  activeCategory,
  onCategoryChange,
  resolvePassTypeLabel,
}: PassTypeSummaryProps) {
  // Count non-cancelled delegates per pass type
  const countByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of delegates) {
      if (d.status !== "Cancelled") {
        m[d.passType] = (m[d.passType] ?? 0) + 1;
      }
    }
    return m;
  }, [delegates]);

  const configByType = useMemo(() => {
    const m: Record<string, PassTypeConfig> = {};
    for (const c of configs) m[c.passType] = c;
    return m;
  }, [configs]);

  // Category counts also use non-cancelled delegates
  const payingCount = Object.entries(countByType)
    .filter(([pt]) => PAYING_TYPES.has(pt))
    .reduce((sum, [, n]) => sum + n, 0);
  const compCount = Object.entries(countByType)
    .filter(([pt]) => COMP_TYPES.has(pt))
    .reduce((sum, [, n]) => sum + n, 0);

  // Only show pass types present in this convening
  const activeTypes = ALL_PASS_TYPES.filter(pt => (countByType[pt] ?? 0) > 0);

  const totalCapacity = configs.reduce((sum, c) => sum + (c.capacity ?? 0), 0);
  const totalRegistered = Object.values(countByType).reduce((a, b) => a + b, 0);
  const utilPct = totalCapacity > 0 ? Math.min(100, Math.round((totalRegistered / totalCapacity) * 100)) : null;

  const CATEGORIES: Array<{ key: "All" | "Paying" | "Comp"; label: string; count: number }> = [
    { key: "All",    label: "All",    count: payingCount + compCount },
    { key: "Paying", label: "Paying", count: payingCount },
    { key: "Comp",   label: "Comp",   count: compCount },
  ];

  return (
    <div className="rounded-[10px] border border-[var(--brand-border)] bg-white px-4 py-3 space-y-3">
      {/* Category filter + utilisation bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => onCategoryChange(cat.key)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors"
              style={activeCategory === cat.key ? {
                background: "var(--brand-primary)", color: "#fff", borderColor: "transparent",
              } : {
                borderColor: "var(--brand-border)", color: MUTED,
              }}
            >
              {cat.label}
              <span
                className="ml-1 tabular-nums"
                style={{ opacity: activeCategory === cat.key ? 0.85 : 0.7 }}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Utilisation bar vs capacity */}
        {utilPct !== null && (
          <div className="flex items-center gap-2 flex-1 min-w-[140px]">
            <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--brand-border)" }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${utilPct}%`,
                  background: utilPct >= 90 ? "#D97706" : "var(--brand-primary)",
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: MUTED }}>
              {totalRegistered} / {totalCapacity} capacity ({utilPct}%)
            </span>
          </div>
        )}
      </div>

      {/* Per-pass-type breakdown chips */}
      {activeTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeTypes.map(pt => {
            const count = countByType[pt] ?? 0;
            const cfg   = configByType[pt];
            const cap   = cfg?.capacity ?? 0;
            const pct   = cap > 0 ? Math.min(100, Math.round((count / cap) * 100)) : null;
            const style = PASS_STYLE[pt] ?? PASS_STYLE_FALLBACK;

            return (
              <div
                key={pt}
                className="flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 border"
                style={{ borderColor: "var(--brand-border)", background: style.bg + "55" }}
              >
                <span className="text-[11px] font-semibold" style={{ color: style.fg }}>
                  {resolvePassTypeLabel(pt)}
                </span>
                <span className="text-[12px] font-bold tabular-nums text-[var(--brand-ink)]">{count}</span>
                {pct !== null && (
                  <span className="text-[10px] tabular-nums" style={{ color: MUTED }}>
                    / {cap}
                  </span>
                )}
                {pct !== null && (
                  <div className="w-12 h-1 rounded-full" style={{ background: "var(--brand-border)" }}>
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: pct >= 90 ? "#D97706" : style.fg,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Column picker ─────────────────────────────────────────────────────────────
interface CsvColumn { key: string; label: string }

const CSV_COLUMNS: CsvColumn[] = [
  { key: "name",         label: "Name" },
  { key: "email",        label: "Email" },
  { key: "jobTitle",     label: "Job Title" },
  { key: "organization", label: "Organisation" },
  { key: "country",      label: "Country" },
  { key: "segment",      label: "Constituency" },
  { key: "passType",     label: "Pass Type" },
  { key: "status",       label: "Status" },
  { key: "gender",       label: "Gender" },
  { key: "ageBand",      label: "Age Band" },
  { key: "aum",          label: "AUM ($M)" },
  { key: "notes",        label: "Notes" },
];

const DEFAULT_CSV_COLUMNS = ["name", "email", "jobTitle", "organization", "country", "segment", "passType", "status"];

// ── Form types ─────────────────────────────────────────────────────────────────
type DelegateForm = {
  name: string; jobTitle: string; organization: string; email: string;
  country: string; segment: string; passType: string; status: string;
  gender: string; ageBand: string; aum: string; notes: string;
  dietaryRequirements: string; accessNeeds: string;
};

const emptyForm = (): DelegateForm => ({
  name: "", jobTitle: "", organization: "", email: "",
  country: "", segment: "", passType: "Paid", status: "Registered",
  gender: "", ageBand: "", aum: "", notes: "",
  dietaryRequirements: "", accessNeeds: "",
});

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Delegates() {
  const { activeConvening, activeConveningId } = useConvening();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const isInternal = me?.accountType === "Internal";
  const canExport = ["Admin", "Finance", "Ops"].includes(me?.role ?? "");

  // Data
  const params = { conveningId: activeConveningId ?? "" };
  const { data: delegates = [], isLoading } = useListDelegates(params, {
    query: { enabled: !!activeConveningId, queryKey: getListDelegatesQueryKey(params) },
  });

  const analyticsParams = { conveningId: activeConveningId ?? "" };
  const { data: analytics } = useGetAnalytics(analyticsParams, {
    query: { enabled: !!activeConveningId, queryKey: getGetAnalyticsQueryKey(analyticsParams) },
  });

  const ptcParams = { conveningId: activeConveningId ?? "" };
  const { data: passTypeConfigs = [] } = useListPassTypeConfigs(ptcParams, {
    query: { enabled: !!activeConveningId, queryKey: getListPassTypeConfigsQueryKey(ptcParams) },
  });

  const reg  = analytics?.registration;
  const demo = analytics?.demographics;

  // Build label resolver: prefer backend config label, fall back to labels.ts
  const configLabelByType = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of passTypeConfigs) {
      if (c.label) m[c.passType] = c.label;
    }
    return m;
  }, [passTypeConfigs]);

  const resolvePassTypeLabel = (pt: string) => configLabelByType[pt] ?? label(pt);

  // Mutations
  const createDelegate = useCreateDelegate();
  const updateDelegate = useUpdateDelegate();
  const deleteDelegate = useDeleteDelegate();
  const checkInByQr    = useCheckInByQr();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListDelegatesQueryKey(params) });

  // Export state
  const [exporting, setExporting] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_CSV_COLUMNS);

  // UI state
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DelegateForm>(emptyForm());
  const [segmentFilter, setSegmentFilter] = useState("All");
  const [passTypeCategory, setPassTypeCategory] = useState<"All" | "Paying" | "Comp">("All");
  const [showBadgeSheet, setShowBadgeSheet] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [checkInResult, setCheckInResult] = useState<{ ok: boolean; name?: string; msg?: string } | null>(null);

  // Derived
  const segments = useMemo(() =>
    ["All", ...Array.from(new Set(delegates.map(d => d.segment ?? "Unassigned")))],
    [delegates],
  );

  const filtered = useMemo(() => {
    let result = delegates;
    if (segmentFilter !== "All") {
      result = result.filter(d => (d.segment ?? "Unassigned") === segmentFilter);
    }
    if (passTypeCategory === "Paying") {
      result = result.filter(d => PAYING_TYPES.has(d.passType));
    } else if (passTypeCategory === "Comp") {
      result = result.filter(d => COMP_TYPES.has(d.passType));
    }
    return result;
  }, [delegates, segmentFilter, passTypeCategory]);

  // Handlers
  function openNew() {
    setForm(emptyForm());
    setEditingId(null);
    setShowDelegateModal(true);
  }
  function openEdit(d: Delegate) {
    setForm({
      name: d.name, jobTitle: d.jobTitle ?? "", organization: d.organization ?? "",
      email: d.email ?? "", country: d.country ?? "", segment: d.segment ?? "",
      passType: d.passType, status: d.status, gender: d.gender ?? "",
      ageBand: d.ageBand ?? "", aum: d.aum != null ? String(d.aum) : "", notes: d.notes ?? "",
      dietaryRequirements: (d as any).dietaryRequirements ?? "",
      accessNeeds: (d as any).accessNeeds ?? "",
    });
    setEditingId(d.id);
    setShowDelegateModal(true);
  }

  async function handleSubmit() {
    if (!form.name || !activeConveningId) return;
    const payload = {
      name: form.name,
      jobTitle: form.jobTitle || undefined,
      organization: form.organization || undefined,
      email: form.email || undefined,
      country: form.country || undefined,
      segment: form.segment || undefined,
      passType: form.passType as "Paid" | "EarlyBird" | "Standard" | "Late" | "FreeSponsor" | "FreeComp" | "Speaker" | "Press" | "Official" | "VIP",
      status: form.status as "Registered" | "Confirmed" | "Attended" | "Cancelled" | "Waitlisted",
      gender: form.gender ? form.gender as "Female" | "Male" | "Other" | "Undisclosed" : undefined,
      ageBand: form.ageBand ? form.ageBand as "Under35" | "Age35to50" | "Over50" | "Undisclosed" : undefined,
      aum: form.aum ? parseFloat(form.aum) : undefined,
      notes: form.notes || undefined,
      dietaryRequirements: form.dietaryRequirements || undefined,
      accessNeeds: form.accessNeeds || undefined,
    };
    if (editingId) {
      await updateDelegate.mutateAsync({ id: editingId, data: payload });
    } else {
      await createDelegate.mutateAsync({ data: { conveningId: activeConveningId, ...payload } });
    }
    await invalidate();
    setShowDelegateModal(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this delegate?")) return;
    await deleteDelegate.mutateAsync({ id });
    await invalidate();
    toast({ title: "Delegate deleted" });
  }

  function handleExportXlsx(cols: string[]) {
    const colMap = new Map(CSV_COLUMNS.map(c => [c.key, c.label]));
    const rows = filtered.map(d => {
      const row: Record<string, unknown> = {};
      for (const col of cols) {
        const header = colMap.get(col) ?? col;
        row[header] = (d as unknown as Record<string, unknown>)[col] ?? "";
      }
      return row;
    });
    exportXlsx(rows, `delegates-${activeConveningId}`);
    setShowColumnPicker(false);
  }

  async function handleExport(cols: string[]) {
    if (!activeConveningId) return;
    setExporting(true);
    setShowColumnPicker(false);
    try {
      const qs = new URLSearchParams({ conveningId: activeConveningId });
      if (segmentFilter !== "All") qs.set("segment", segmentFilter);
      if (passTypeCategory !== "All") qs.set("passTypeCategory", passTypeCategory);
      qs.set("columns", cols.join(","));
      const resp = await fetch(`/api/delegates/export?${qs.toString()}`, { credentials: "include" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        alert((body as { error?: string }).error ?? `Export failed (${resp.status})`);
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = resp.headers.get("Content-Disposition") ?? "";
      const filenameMatch = cd.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch?.[1] ?? `delegates-${activeConveningId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleCheckIn() {
    if (!qrInput.trim()) return;
    setCheckInResult(null);
    try {
      const updated = await checkInByQr.mutateAsync({ data: { qrCode: qrInput.trim() } });
      setCheckInResult({ ok: true, name: updated.name });
      setQrInput("");
      await invalidate();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "Delegate not found";
      setCheckInResult({ ok: false, msg });
    }
  }

  const TH = "px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em]";
  const TH_R = "px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em]";

  if (!activeConveningId) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Delegates</h1>
          <p className="text-[13px] mt-0.5" style={{ color: MUTED }}>
            {delegates.filter(d => d.status !== "Cancelled").length} registered
            {delegates.filter(d => d.status === "Attended").length > 0 && (
              <span> · {delegates.filter(d => d.status === "Attended").length} attended</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => { setShowCheckIn(true); setCheckInResult(null); setQrInput(""); }}
          >
            <ScanLine className="h-4 w-4" /> Check in
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => setShowBadgeSheet(true)}
          >
            <BadgeCheck className="h-4 w-4" /> Badges
          </Button>
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setShowColumnPicker(true)}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export CSV
            </Button>
          )}
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setShowColumnPicker(true)}
              disabled={exporting}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export XLSX
            </Button>
          )}
          <Button
            size="sm"
            className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
            onClick={openNew}
          >
            <Plus className="h-4 w-4" /> Add delegate
          </Button>
        </div>
      </div>

      {/* ── Registration tally + Demographics ────────────────────────────────── */}
      {(reg || demo) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {reg && <RegistrationCard reg={reg} configs={passTypeConfigs} resolvePassTypeLabel={resolvePassTypeLabel} />}
          {demo && <DemographicsPanel demo={demo} />}
        </div>
      )}

      {/* ── Pass type summary + category filter ──────────────────────────────── */}
      <PassTypeSummary
        delegates={delegates}
        configs={passTypeConfigs}
        activeCategory={passTypeCategory}
        onCategoryChange={setPassTypeCategory}
        resolvePassTypeLabel={resolvePassTypeLabel}
      />

      {/* ── Segment filter pills ─────────────────────────────────────────────── */}
      {segments.length > 2 && (
        <div className="flex gap-2 flex-wrap">
          {segments.map(seg => (
            <button
              key={seg}
              onClick={() => setSegmentFilter(seg)}
              className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
              style={segmentFilter === seg ? {
                background: "var(--brand-primary)", color: "#fff", borderColor: "transparent",
              } : {
                borderColor: "var(--brand-border)", color: MUTED,
              }}
            >
              {seg}
            </button>
          ))}
        </div>
      )}

      {/* ── Delegates table ──────────────────────────────────────────────────── */}
      <div className="border border-[var(--brand-border)] rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{
                background: "var(--brand-page-bg)",
                borderBottom: "1px solid var(--brand-border)",
                height: 36,
              }}
            >
              <th className={TH}    style={{ color: MUTED }}>Name</th>
              <th className={TH}    style={{ color: MUTED }}>Designation</th>
              <th className={TH}    style={{ color: MUTED }}>Organisation</th>
              <th className={TH}    style={{ color: MUTED }}>Constituency</th>
              <th className={TH}    style={{ color: MUTED }}>Country</th>
              <th className={TH}    style={{ color: MUTED }}>Pass Type</th>
              <th className={TH}    style={{ color: MUTED }}>Status</th>
              <th className={TH_R}  style={{ color: MUTED }}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <ClipboardList className="h-9 w-9 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
                  <p className="text-[14px] font-medium text-[var(--brand-ink)] mb-1">No delegates yet</p>
                  <p className="text-[13px] mb-4" style={{ color: MUTED }}>
                    {passTypeCategory !== "All"
                      ? `No ${passTypeCategory.toLowerCase()} delegates in this view.`
                      : "Register the first attendee for this convening."}
                  </p>
                  {passTypeCategory === "All" && (
                    <Button
                      size="sm"
                      className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
                      onClick={openNew}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add delegate
                    </Button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map(d => {
                const ss = STATUS_STYLE[d.status] ?? { bg: "#F1EFE8", fg: "#5A6472" };
                const ps = PASS_STYLE[d.passType] ?? PASS_STYLE_FALLBACK;
                return (
                  <tr
                    key={d.id}
                    className="group transition-colors"
                    style={{ height: 44, borderBottom: "1px solid var(--brand-border)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-tint)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-[13px] font-medium text-[var(--brand-ink)]">{d.name}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-[13px]" style={{ color: MUTED }}>{d.jobTitle ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <span className="text-[13px]" style={{ color: MUTED }}>{d.organization ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <span className="text-[13px]" style={{ color: MUTED }}>{d.segment ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      {d.country ? (
                        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: MUTED }}>
                          <Globe2 className="h-3 w-3 shrink-0" />{d.country}
                        </span>
                      ) : (
                        <span style={{ color: MUTED }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <TonalBadge text={resolvePassTypeLabel(d.passType)} style={ps} />
                    </td>
                    <td className="px-4 py-2.5">
                      <TonalBadge text={label(d.status)} style={ss} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(d)}
                          className="p-1.5 rounded transition-colors"
                          style={{ color: MUTED }}
                          onMouseEnter={e => { e.currentTarget.style.color = "var(--brand-primary)"; e.currentTarget.style.background = "var(--brand-tint)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = MUTED; e.currentTarget.style.background = ""; }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => void handleDelete(d.id)}
                          className="p-1.5 rounded transition-colors"
                          style={{ color: MUTED }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#A32D2D"; e.currentTarget.style.background = "#FCEBEB"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = MUTED; e.currentTarget.style.background = ""; }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add / Edit Delegate modal ─────────────────────────────────────────── */}
      <Modal
        open={showDelegateModal}
        onClose={() => setShowDelegateModal(false)}
        title={editingId ? "Edit delegate" : "Add delegate"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowDelegateModal(false)}>Cancel</Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={!form.name || createDelegate.isPending || updateDelegate.isPending}
              onClick={handleSubmit}
            >
              {editingId ? "Save changes" : "Add delegate"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 py-1">
          <div className="col-span-2">
            <label className={FL}>Full name *</label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Sarah Osei"
            />
          </div>
          <div>
            <label className={FL}>Designation (job title)</label>
            <Input
              value={form.jobTitle}
              onChange={e => setForm({ ...form, jobTitle: e.target.value })}
              placeholder="e.g. CIO"
            />
          </div>
          <div>
            <label className={FL}>Organisation</label>
            <Input
              value={form.organization}
              onChange={e => setForm({ ...form, organization: e.target.value })}
              placeholder="e.g. NSSF"
            />
          </div>
          <div>
            <label className={FL}>Email</label>
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="sarah@example.com"
            />
          </div>
          <div>
            <label className={FL}>Country</label>
            <Input
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
              placeholder="e.g. Uganda"
            />
          </div>
          <div>
            <label className={FL}>Constituency / Segment</label>
            <Input
              value={form.segment}
              onChange={e => setForm({ ...form, segment: e.target.value })}
              placeholder="e.g. Pension Funds"
            />
          </div>
          <div>
            <label className={FL}>Gender <span className="font-normal normal-case">(self-reported)</span></label>
            <Select
              value={form.gender || "_none"}
              onValueChange={v => setForm({ ...form, gender: v === "_none" ? "" : v })}
            >
              <SelectTrigger className="text-sm"><SelectValue placeholder="Not specified" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Not specified</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
                <SelectItem value="Undisclosed">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Age band <span className="font-normal normal-case">(self-reported)</span></label>
            <Select
              value={form.ageBand || "_none"}
              onValueChange={v => setForm({ ...form, ageBand: v === "_none" ? "" : v })}
            >
              <SelectTrigger className="text-sm"><SelectValue placeholder="Not specified" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Not specified</SelectItem>
                <SelectItem value="Under35">Under 35</SelectItem>
                <SelectItem value="Age35to50">35–50</SelectItem>
                <SelectItem value="Over50">Over 50</SelectItem>
                <SelectItem value="Undisclosed">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>AUM ($M)</label>
            <Input
              type="number" min="0" step="0.1"
              value={form.aum}
              onChange={e => setForm({ ...form, aum: e.target.value })}
              placeholder="e.g. 450"
            />
          </div>
          <div>
            <label className={FL}>Pass type</label>
            <Select value={form.passType} onValueChange={v => setForm({ ...form, passType: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Paid">{resolvePassTypeLabel("Paid")}</SelectItem>
                <SelectItem value="EarlyBird">{resolvePassTypeLabel("EarlyBird")}</SelectItem>
                <SelectItem value="Standard">{resolvePassTypeLabel("Standard")}</SelectItem>
                <SelectItem value="Late">{resolvePassTypeLabel("Late")}</SelectItem>
                <SelectItem value="VIP">{resolvePassTypeLabel("VIP")}</SelectItem>
                <SelectItem value="FreeSponsor">{resolvePassTypeLabel("FreeSponsor")}</SelectItem>
                <SelectItem value="FreeComp">{resolvePassTypeLabel("FreeComp")}</SelectItem>
                <SelectItem value="Speaker">{resolvePassTypeLabel("Speaker")}</SelectItem>
                <SelectItem value="Press">{resolvePassTypeLabel("Press")}</SelectItem>
                <SelectItem value="Official">{resolvePassTypeLabel("Official")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Status</label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Registered">Registered</SelectItem>
                <SelectItem value="Confirmed">Confirmed</SelectItem>
                <SelectItem value="Attended">Attended</SelectItem>
                <SelectItem value="Waitlisted">Waitlisted</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className={FL}>Notes</label>
            <Input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Internal notes"
            />
          </div>

          {/* Sensitive fields — internal users only */}
          {isInternal && (
            <>
              <div>
                <label className={FL}>Dietary requirements</label>
                <Input
                  value={form.dietaryRequirements}
                  onChange={e => setForm({ ...form, dietaryRequirements: e.target.value })}
                  placeholder="e.g. Vegetarian, Halal"
                />
              </div>
              <div>
                <label className={FL}>Access needs</label>
                <Input
                  value={form.accessNeeds}
                  onChange={e => setForm({ ...form, accessNeeds: e.target.value })}
                  placeholder="e.g. Wheelchair access"
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── QR Check-in modal ───────────────────────────────────────────────── */}
      <Modal
        open={showCheckIn}
        onClose={() => { setShowCheckIn(false); setCheckInResult(null); setQrInput(""); }}
        title="QR Check-in"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowCheckIn(false); setCheckInResult(null); setQrInput(""); }}>
              Close
            </Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={!qrInput.trim() || checkInByQr.isPending}
              onClick={handleCheckIn}
            >
              <QrCode className="h-4 w-4 mr-1.5" />
              Check in
            </Button>
          </>
        }
      >
        <div className="py-1 space-y-3">
          <p className="text-[13px]" style={{ color: MUTED }}>
            Scan or paste a delegate's QR code to mark them as Attended.
          </p>
          <div>
            <label className={FL}>QR code</label>
            <Input
              value={qrInput}
              onChange={e => setQrInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void handleCheckIn(); }}
              placeholder="Paste or scan QR value…"
              autoFocus
            />
          </div>

          {/* Result feedback */}
          {checkInResult && (
            <div
              className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px]"
              style={checkInResult.ok
                ? { background: "#E1F5EE", color: "#0F6E56" }
                : { background: "#FCEBEB", color: "#A32D2D" }
              }
            >
              {checkInResult.ok
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle   className="h-4 w-4 mt-0.5 shrink-0" />
              }
              <span>
                {checkInResult.ok
                  ? `✓ Checked in: ${checkInResult.name}`
                  : checkInResult.msg ?? "Not found"
                }
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Column picker modal ─────────────────────────────────────────────── */}
      <Modal
        open={showColumnPicker}
        onClose={() => setShowColumnPicker(false)}
        title="Choose export columns"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowColumnPicker(false)}>Cancel</Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={selectedColumns.length === 0}
              onClick={() => handleExportXlsx(selectedColumns)}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download XLSX
            </Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white gap-2"
              disabled={selectedColumns.length === 0 || exporting}
              onClick={() => void handleExport(selectedColumns)}
            >
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </>
        }
      >
        <div className="py-1 space-y-4">
          <p className="text-[13px]" style={{ color: MUTED }}>
            Select the fields to include. Both CSV and XLSX will use the same selection.
          </p>

          {/* Quick select all / none */}
          <div className="flex gap-3">
            <button
              className="text-[12px] font-medium underline"
              style={{ color: "var(--brand-primary)" }}
              onClick={() => setSelectedColumns(CSV_COLUMNS.map(c => c.key))}
            >
              Select all
            </button>
            <button
              className="text-[12px] font-medium underline"
              style={{ color: MUTED }}
              onClick={() => setSelectedColumns([])}
            >
              Clear all
            </button>
            <button
              className="text-[12px] font-medium underline ml-auto"
              style={{ color: MUTED }}
              onClick={() => setSelectedColumns([...DEFAULT_CSV_COLUMNS])}
            >
              Reset to default
            </button>
          </div>

          {/* Column checkboxes */}
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {CSV_COLUMNS.map(col => {
              const checked = selectedColumns.includes(col.key);
              return (
                <label
                  key={col.key}
                  className="flex items-center gap-2.5 cursor-pointer select-none group"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedColumns(prev =>
                        checked ? prev.filter(k => k !== col.key) : [...prev, col.key]
                      )
                    }
                    className="h-3.5 w-3.5 rounded border-[var(--brand-border)] accent-[var(--brand-primary)]"
                  />
                  <span
                    className="text-[13px]"
                    style={{ color: checked ? "var(--brand-ink)" : MUTED }}
                  >
                    {col.label}
                  </span>
                </label>
              );
            })}
          </div>

          {selectedColumns.length === 0 && (
            <p className="text-[12px] text-center py-1" style={{ color: "#A32D2D" }}>
              Select at least one column to export.
            </p>
          )}
        </div>
      </Modal>

      {/* ── Badge Sheet ──────────────────────────────────────────────────────── */}
      <BadgeSheet
        open={showBadgeSheet}
        onClose={() => setShowBadgeSheet(false)}
        delegates={delegates.filter(d => d.status !== "Cancelled")}
        conveningName={activeConvening?.name}
        configLabelByType={configLabelByType}
      />

    </div>
  );
}
