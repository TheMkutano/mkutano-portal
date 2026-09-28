import { useState, useMemo } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import {
  useListCommitments,
  useCreateCommitment,
  useUpdateCommitment,
  useDeleteCommitment,
  useGetScorecard,
  getListCommitmentsQueryKey,
  getGetScorecardQueryKey,
  type Commitment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, CheckCircle2, BarChart3, FileText,
  Download, ChevronRight, Target, FileSpreadsheet,
} from "lucide-react";
import { exportXlsx } from "@/lib/exportXlsx";
import { formatMoney } from "@/lib/money";

// ── Design tokens ──────────────────────────────────────────────────────────────
const FL   = "block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1";
const MUTED = "var(--brand-text-secondary)";

// ── Status config ──────────────────────────────────────────────────────────────
const STATUSES = ["Proposed", "Agreed", "InProgress", "Delivered", "Stalled"] as const;

type StatusStyle = { bg: string; fg: string };

const STATUS_STYLE: Record<string, StatusStyle> = {
  Proposed:   { bg: "#F1EFE8", fg: "#5A6472" },
  Agreed:     { bg: "#E6F1FB", fg: "#0C447C" },
  InProgress: { bg: "#E6F1FB", fg: "#2A6FB0" },
  Delivered:  { bg: "#E1F5EE", fg: "#0F6E56" },
  Stalled:    { bg: "#FCEBEB", fg: "#A32D2D" },
};

const STATUS_NEXT: Record<string, Commitment["status"]> = {
  Proposed:   "Agreed",
  Agreed:     "InProgress",
  InProgress: "Delivered",
};

// ── Category config ────────────────────────────────────────────────────────────
const CATEGORIES = ["Policy", "Investment", "Skills", "Innovation", "ESG", "Inclusion", "Governance"] as const;

const CAT_STYLE: Record<string, StatusStyle> = {
  Policy:     { bg: "#EEE6F8", fg: "#5E35B1" },
  Investment: { bg: "#FBF3E2", fg: "#8A6516" },
  Skills:     { bg: "#E6F1FB", fg: "#0C447C" },
  Innovation: { bg: "#E1F5EE", fg: "#0F6E56" },
  ESG:        { bg: "#E1F5EE", fg: "#0F6E56" },
  Inclusion:  { bg: "#FCEBEB", fg: "#A32D2D" },
  Governance: { bg: "#F1EFE8", fg: "#5A6472" },
};

// ── Source labels ──────────────────────────────────────────────────────────────
const SOURCES = ["BusinessCircle", "DealRoom", "Plenary", "Roundtable"] as const;

const SOURCE_LABEL: Record<string, string> = {
  BusinessCircle: "Business Circle",
  DealRoom:       "Deal Room",
  Plenary:        "Plenary",
  Roundtable:     "Roundtable",
};

// ── TonalBadge ─────────────────────────────────────────────────────────────────
function TonalBadge({ text, style, size = "sm" }: { text: string; style: StatusStyle; size?: "xs" | "sm" }) {
  const px = size === "xs" ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center ${px} font-semibold rounded-[5px] whitespace-nowrap leading-tight`}
      style={{ background: style.bg, color: style.fg }}
    >
      {text}
    </span>
  );
}

// ── Metric card ─────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-[10px] border border-[var(--brand-border)] p-4 shadow-[0_1px_2px_rgba(15,31,51,.04)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-2">{label}</p>
      <p className="text-[26px] font-semibold tabular-nums leading-none" style={{ color: color ?? "var(--brand-ink)" }}>{value}</p>
      {sub && <p className="text-[12px] text-[var(--brand-text-secondary)] mt-1">{sub}</p>}
    </div>
  );
}

// ── CommitmentRow ───────────────────────────────────────────────────────────────
function CommitmentRow({
  c, onStatusAdvance, onDelete, onToggleScorecard, onToggleAideMemoire, onEdit,
}: {
  c: Commitment;
  onStatusAdvance: (id: string, status: Commitment["status"]) => void;
  onDelete: (id: string) => void;
  onToggleScorecard: (id: string, v: boolean) => void;
  onToggleAideMemoire: (id: string, v: boolean) => void;
  onEdit: (c: Commitment) => void;
}) {
  const next = STATUS_NEXT[c.status];
  const ss = STATUS_STYLE[c.status] ?? STATUS_STYLE.Proposed;
  const cs = CAT_STYLE[c.category] ?? { bg: "#F1EFE8", fg: "#5A6472" };

  return (
    <tr
      className="group"
      style={{ height: 44, borderBottom: "1px solid var(--brand-border)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-tint)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
    >
      {/* Status circle */}
      <td className="px-3 py-2 w-8">
        <button
          onClick={() => next && onStatusAdvance(c.id, next)}
          title={next ? `Advance to ${next}` : "Delivered"}
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0"
          style={c.status === "Delivered"
            ? { background: "#0F6E56", borderColor: "#0F6E56" }
            : { borderColor: "var(--brand-border)" }
          }
        >
          {c.status === "Delivered" && <CheckCircle2 className="h-3 w-3 text-white" />}
        </button>
      </td>

      {/* Title + meta */}
      <td className="px-3 py-2 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <p className="text-[13px] font-medium text-[var(--brand-ink)]">{c.title}</p>
          {c.originEdition && (
            <span className="text-[10px] px-1 rounded" style={{ background: "#F1EFE8", color: MUTED }}>{c.originEdition}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(c.ownerOrg || c.ownerName) && (
            <span className="text-[11px]" style={{ color: MUTED }}>{c.ownerOrg ?? c.ownerName}</span>
          )}
          <span className="text-[11px]" style={{ color: MUTED }}>{SOURCE_LABEL[c.source] ?? c.source}</span>
          {c.dueDate && <span className="text-[11px]" style={{ color: MUTED }}>Due {c.dueDate}</span>}
        </div>
      </td>

      {/* Category */}
      <td className="px-3 py-2 w-28">
        <TonalBadge text={c.category} style={cs} size="xs" />
      </td>

      {/* Status */}
      <td className="px-3 py-2 w-24">
        <TonalBadge text={c.status === "InProgress" ? "In Progress" : c.status} style={ss} size="xs" />
      </td>

      {/* Flags */}
      <td className="px-3 py-2 w-32">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" title="In Aide Mémoire">
            <Switch
              checked={c.inAideMemoire}
              onCheckedChange={(v) => onToggleAideMemoire(c.id, v)}
              className="scale-75 origin-left"
            />
            <span className="text-[10px]" style={{ color: MUTED }}>AM</span>
          </div>
          <div className="flex items-center gap-1" title="Published to Scorecard">
            <Switch
              checked={c.publishedToScorecard}
              onCheckedChange={(v) => onToggleScorecard(c.id, v)}
              className="scale-75 origin-left"
            />
            <span className="text-[10px]" style={{ color: MUTED }}>SC</span>
          </div>
        </div>
      </td>

      {/* Row actions */}
      <td className="px-3 py-2 w-16 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(c)}
            className="p-1 rounded hover:bg-[var(--brand-tint)]"
            style={{ color: MUTED }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(c.id)}
            className="p-1 rounded hover:bg-[#FCEBEB]"
            style={{ color: MUTED }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Row skeleton ───────────────────────────────────────────────────────────────
function RowSkeleton() {
  return (
    <tr style={{ height: 44, borderBottom: "1px solid var(--brand-border)" }}>
      {[8, 64, 16, 16, 16, 8].map((w, i) => (
        <td key={i} className="px-3 py-2">
          <div className="h-3 rounded animate-pulse" style={{ background: "var(--brand-border)", width: `${w * 4}px`, maxWidth: "100%" }} />
        </td>
      ))}
    </tr>
  );
}

// ── Scorecard category row ─────────────────────────────────────────────────────
function ScorecardCategory({ cat }: {
  cat: {
    category: string;
    total: number;
    delivered: number;
    items: { title: string; owner: string | null; status: string; originEdition: string | null }[];
  };
}) {
  const [open, setOpen] = useState(false);
  const pct = cat.total ? Math.round((cat.delivered / cat.total) * 100) : 0;

  const rangeStyle: StatusStyle =
    pct === 100 ? STATUS_STYLE.Delivered :
    pct >= 50   ? STATUS_STYLE.InProgress :
    pct > 0     ? STATUS_STYLE.Agreed :
                  STATUS_STYLE.Proposed;

  const barColor = pct === 100 ? "#0F6E56" : pct >= 50 ? "#2A6FB0" : pct > 0 ? "#8A6516" : "#E3E8EE";
  const catStyle = CAT_STYLE[cat.category] ?? { bg: "#F1EFE8", fg: "#5A6472" };

  return (
    <div className="border border-[var(--brand-border)] rounded-lg overflow-hidden bg-white">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--brand-tint)] transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <TonalBadge text={cat.category} style={catStyle} />
        {/* Progress bar */}
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--brand-border)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <span className="text-[12px] tabular-nums font-medium" style={{ color: MUTED }}>
          {cat.delivered}/{cat.total}
        </span>
        <TonalBadge text={`${pct}%`} style={rangeStyle} size="xs" />
        <ChevronRight
          className="h-4 w-4 transition-transform shrink-0"
          style={{ color: MUTED, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Item rows */}
      {open && (
        <div style={{ borderTop: "1px solid var(--brand-border)" }}>
          {cat.items.map((item, i) => {
            const ss = STATUS_STYLE[item.status] ?? STATUS_STYLE.Proposed;
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--brand-tint)] transition-colors"
                style={{ borderBottom: i < cat.items.length - 1 ? "1px solid var(--brand-border)" : "none" }}
              >
                <p className="text-[12px] text-[var(--brand-ink)] flex-1">{item.title}</p>
                <div className="flex items-center gap-2 shrink-0">
                  {item.owner && <span className="text-[11px]" style={{ color: MUTED }}>{item.owner}</span>}
                  {item.originEdition && (
                    <span className="text-[10px] px-1 py-px rounded" style={{ background: "#F1EFE8", color: MUTED }}>
                      {item.originEdition}
                    </span>
                  )}
                  <TonalBadge text={item.status === "InProgress" ? "In Progress" : item.status} style={ss} size="xs" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Form type ──────────────────────────────────────────────────────────────────
type CommitmentForm = {
  title: string;
  description: string;
  category: string;
  ownerName: string;
  ownerOrg: string;
  source: string;
  dueDate: string;
  status: string;
  inAideMemoire: boolean;
  publishedToScorecard: boolean;
  originEdition: string;
  progressNote: string;
};

const emptyForm = (): CommitmentForm => ({
  title: "", description: "", category: "Policy", ownerName: "", ownerOrg: "",
  source: "Plenary", dueDate: "", status: "Proposed",
  inAideMemoire: false, publishedToScorecard: false,
  originEdition: "", progressNote: "",
});

// ── Main component ─────────────────────────────────────────────────────────────
export default function Outcomes() {
  const { activeConveningId } = useConvening();
  const qc = useQueryClient();
  const { toast } = useToast();

  const p = { conveningId: activeConveningId ?? "" };
  const enabled = !!activeConveningId;

  const { data: commitments = [], isLoading } = useListCommitments(p, {
    query: { enabled, queryKey: getListCommitmentsQueryKey(p) },
  });
  const { data: scorecard } = useGetScorecard(p, {
    query: { enabled, queryKey: getGetScorecardQueryKey(p) },
  });

  const createCommitment = useCreateCommitment();
  const updateCommitment = useUpdateCommitment();
  const deleteCommitment = useDeleteCommitment();

  const [activeTab, setActiveTab] = useState<"tracker" | "scorecard">("tracker");
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CommitmentForm>(emptyForm());
  const [downloadingAM, setDownloadingAM] = useState(false);
  const [downloadingSC, setDownloadingSC] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: getListCommitmentsQueryKey(p) });
    void qc.invalidateQueries({ queryKey: getGetScorecardQueryKey(p) });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    commitments
      .filter((c) => filterCategory === "All" || c.category === filterCategory)
      .filter((c) => filterStatus === "All" || c.status === filterStatus),
    [commitments, filterCategory, filterStatus]
  );

  const deliveredCount = commitments.filter((c) => c.status === "Delivered").length;
  const inAMCount      = commitments.filter((c) => c.inAideMemoire).length;
  const onSCCount      = commitments.filter((c) => c.publishedToScorecard).length;

  // ── Handlers ───────────────────────────────────────────────────────────────
  function openNew() {
    setForm(emptyForm());
    setEditingId(null);
    setShowModal(true);
  }
  function openEdit(c: Commitment) {
    setForm({
      title: c.title, description: c.description ?? "",
      category: c.category, ownerName: c.ownerName ?? "",
      ownerOrg: c.ownerOrg ?? "", source: c.source,
      dueDate: c.dueDate ?? "", status: c.status,
      inAideMemoire: c.inAideMemoire, publishedToScorecard: c.publishedToScorecard,
      originEdition: c.originEdition ?? "", progressNote: c.progressNote ?? "",
    });
    setEditingId(c.id);
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.title || !activeConveningId) return;
    const data = {
      title: form.title,
      description: form.description || undefined,
      category: form.category as Commitment["category"],
      ownerName: form.ownerName || undefined,
      ownerOrg: form.ownerOrg || undefined,
      source: form.source as Commitment["source"],
      dueDate: form.dueDate || undefined,
      status: form.status as Commitment["status"],
      inAideMemoire: form.inAideMemoire,
      publishedToScorecard: form.publishedToScorecard,
      originEdition: form.originEdition || undefined,
      progressNote: form.progressNote || undefined,
    };
    if (editingId) {
      await updateCommitment.mutateAsync({ id: editingId, data });
      toast({ title: "Commitment updated" });
    } else {
      await createCommitment.mutateAsync({ data: { conveningId: activeConveningId, ...data } });
      toast({ title: "Commitment added" });
    }
    invalidate();
    setShowModal(false);
  }

  function handleStatusAdvance(id: string, status: Commitment["status"]) {
    updateCommitment.mutate({ id, data: { status } }, { onSuccess: invalidate });
  }
  function handleToggleScorecard(id: string, v: boolean) {
    updateCommitment.mutate({ id, data: { publishedToScorecard: v } }, { onSuccess: invalidate });
  }
  function handleToggleAideMemoire(id: string, v: boolean) {
    updateCommitment.mutate({ id, data: { inAideMemoire: v } }, { onSuccess: invalidate });
  }
  function handleDelete(id: string) {
    if (!confirm("Delete this commitment?")) return;
    deleteCommitment.mutate({ id }, { onSuccess: invalidate });
  }

  async function downloadPdf(type: "aide-memoire" | "scorecard") {
    if (!activeConveningId) return;
    const setter = type === "aide-memoire" ? setDownloadingAM : setDownloadingSC;
    setter(true);
    try {
      const url = `/api/${type}/pdf?conveningId=${activeConveningId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${type}-${activeConveningId}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast({ title: "PDF generation failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setter(false);
    }
  }

  if (!activeConveningId) return null;

  // ── Tab pill ───────────────────────────────────────────────────────────────
  function TabPill({ id, label }: { id: typeof activeTab; label: string }) {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors"
        style={active
          ? { background: "var(--brand-primary)", color: "#fff" }
          : { color: MUTED }
        }
      >
        {id === "scorecard" && <BarChart3 className="h-3.5 w-3.5" />}
        {label}
      </button>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Outcomes</h1>
          <p className="text-[13px] mt-0.5" style={{ color: MUTED }}>
            {commitments.length} commitment{commitments.length !== 1 ? "s" : ""}
            {deliveredCount > 0 && ` · ${deliveredCount} delivered`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[12px] h-8"
            disabled={downloadingAM}
            onClick={() => downloadPdf("aide-memoire")}
          >
            <FileText className="h-3.5 w-3.5" />
            {downloadingAM ? "Generating…" : "Aide Mémoire PDF"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[12px] h-8"
            disabled={downloadingSC}
            onClick={() => downloadPdf("scorecard")}
          >
            <Download className="h-3.5 w-3.5" />
            {downloadingSC ? "Generating…" : "Scorecard PDF"}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-[12px] h-8"
            onClick={() => exportXlsx(
              commitments.map((c) => ({
                "Title":          c.title,
                "Category":       c.category ?? "",
                "Source":         c.source ?? "",
                "Status":         c.status ?? "",
                "Origin Edition": c.originEdition ?? "",
                "Aide Mémoire":   c.inAideMemoire ? "Yes" : "No",
                "Scorecard":      c.publishedToScorecard ? "Yes" : "No",
                "Progress Note":  c.progressNote ?? "",
                "Owner":          c.ownerName ?? "",
                "Owner Org":      c.ownerOrg ?? "",
              })),
              "outcomes"
            )}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export XLSX
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
            onClick={openNew}
          >
            <Plus className="h-4 w-4" /> Add commitment
          </Button>
        </div>
      </div>

      {/* ── Metric cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Total"
          value={String(commitments.length)}
          sub="commitments tracked"
        />
        <MetricCard
          label="Delivery Rate"
          value={commitments.length ? `${Math.round((deliveredCount / commitments.length) * 100)}%` : "—"}
          sub={`${deliveredCount} of ${commitments.length} delivered`}
          color={deliveredCount > 0 ? "#0F6E56" : undefined}
        />
        <MetricCard
          label="In Aide Mémoire"
          value={String(inAMCount)}
          sub="marked for AM"
        />
        <MetricCard
          label="On Scorecard"
          value={scorecard ? String(scorecard.headline.total) : String(onSCCount)}
          sub={scorecard
            ? `${scorecard.signedDealCount} deals · ${scorecard.signedDealValue > 0 ? formatMoney(scorecard.signedDealValue) : "$0"}`
            : "published"}
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[var(--brand-border)] pb-px">
        <TabPill id="tracker"  label="Tracker" />
        <TabPill id="scorecard" label="Scorecard" />
      </div>

      {/* ══ TRACKER tab ════════════════════════════════════════════════════ */}
      {activeTab === "tracker" && (
        <div className="space-y-4">
          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {["All", ...CATEGORIES].map((cat) => {
                const active = filterCategory === cat;
                const count = cat === "All" ? commitments.length : commitments.filter((c) => c.category === cat).length;
                const cs = cat !== "All" ? CAT_STYLE[cat] : null;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
                    style={active && cs
                      ? { background: cs.bg, color: cs.fg }
                      : active
                      ? { background: "var(--brand-primary)", color: "#fff" }
                      : { background: "var(--brand-tint)", color: MUTED }
                    }
                  >
                    {cat}
                    <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Status filter */}
            <div className="ml-auto">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 text-[12px] w-36 border-[var(--brand-border)]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "InProgress" ? "In Progress" : s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="border border-[var(--brand-border)] rounded-[10px] overflow-hidden bg-white shadow-[0_1px_2px_rgba(15,31,51,.04)]">
            <table className="w-full">
              <thead>
                <tr style={{ height: 36, borderBottom: "1px solid var(--brand-border)", background: "var(--brand-page-bg)" }}>
                  <th className="w-8 px-3"></th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>Commitment</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] w-28" style={{ color: MUTED }}>Category</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] w-24" style={{ color: MUTED }}>Status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] w-32" style={{ color: MUTED }}>Flags</th>
                  <th className="w-16 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? [0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)
                  : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <Target className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
                        <p className="text-[14px] font-medium text-[var(--brand-ink)] mb-1">
                          {filterCategory !== "All" || filterStatus !== "All"
                            ? "No matches for these filters"
                            : "No commitments yet"}
                        </p>
                        <p className="text-[13px]" style={{ color: MUTED }}>
                          {filterCategory === "All" && filterStatus === "All"
                            ? "Add your first commitment from a plenary or roundtable."
                            : "Clear the filters to see all commitments."}
                        </p>
                      </td>
                    </tr>
                  )
                  : filtered.map((c) => (
                    <CommitmentRow
                      key={c.id}
                      c={c}
                      onStatusAdvance={handleStatusAdvance}
                      onDelete={handleDelete}
                      onToggleScorecard={handleToggleScorecard}
                      onToggleAideMemoire={handleToggleAideMemoire}
                      onEdit={openEdit}
                    />
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ SCORECARD tab ══════════════════════════════════════════════════ */}
      {activeTab === "scorecard" && (
        <div className="space-y-4">
          {!scorecard ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-lg animate-pulse border border-[var(--brand-border)]"
                  style={{ background: "var(--brand-tint)" }} />
              ))}
            </div>
          ) : (
            <>
              {/* Headline metrics */}
              <div className="grid grid-cols-3 gap-3">
                <MetricCard
                  label="Delivery Rate"
                  value={`${scorecard.headline.deliveryRatePct}%`}
                  sub={`${scorecard.headline.delivered} of ${scorecard.headline.total} delivered`}
                  color={
                    scorecard.headline.deliveryRatePct >= 75 ? "#0F6E56" :
                    scorecard.headline.deliveryRatePct >= 40 ? "#0C447C" :
                    scorecard.headline.deliveryRatePct > 0   ? "#8A6516" : undefined
                  }
                />
                <MetricCard
                  label="Signed Deal Value"
                  value={scorecard.signedDealValue > 0
                    ? formatMoney(scorecard.signedDealValue)
                    : "—"}
                  sub={`${scorecard.signedDealCount} deal${scorecard.signedDealCount !== 1 ? "s" : ""} signed`}
                />
                <MetricCard
                  label="Published Commitments"
                  value={String(scorecard.headline.total)}
                  sub={`across ${scorecard.categories.length} categor${scorecard.categories.length !== 1 ? "ies" : "y"}`}
                />
              </div>

              {/* Per-category breakdown */}
              {scorecard.categories.length === 0 ? (
                <div className="py-16 text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
                  <p className="text-[14px] font-medium text-[var(--brand-ink)] mb-1">No scorecard data yet</p>
                  <p className="text-[13px]" style={{ color: MUTED }}>
                    Toggle <strong>SC</strong> on commitments to publish them here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(scorecard.categories as Array<{ category: string; total: number; delivered: number; items: { title: string; owner: string | null; status: string; originEdition: string | null }[] }>)
                    .map((cat) => (
                      <ScorecardCategory key={cat.category} cat={cat} />
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Add / Edit Commitment modal ──────────────────────────────────── */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Edit commitment" : "Add commitment"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={!form.title || createCommitment.isPending || updateCommitment.isPending}
              onClick={handleSubmit}
            >
              {editingId ? "Save" : "Add"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 py-1">
          <div className="col-span-2">
            <label className={FL}>Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. NSSF to reform fee cap by Q3"
            />
          </div>

          <div>
            <label className={FL}>Category *</label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={FL}>Source</label>
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={FL}>Status</label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "InProgress" ? "In Progress" : s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={FL}>Due Date</label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>

          <div>
            <label className={FL}>Owner Name</label>
            <Input value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} placeholder="Person responsible" />
          </div>

          <div>
            <label className={FL}>Owner Organisation</label>
            <Input value={form.ownerOrg} onChange={(e) => setForm((f) => ({ ...f, ownerOrg: e.target.value }))} placeholder="e.g. NSSF Uganda" />
          </div>

          <div>
            <label className={FL}>Origin Edition</label>
            <Input
              value={form.originEdition}
              onChange={(e) => setForm((f) => ({ ...f, originEdition: e.target.value }))}
              placeholder="e.g. Mkutano 2024"
            />
          </div>

          <div className="col-span-2">
            <label className={FL}>Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="resize-none text-sm"
              placeholder="Optional detail…"
            />
          </div>

          <div className="col-span-2">
            <label className={FL}>Progress Note</label>
            <Input
              value={form.progressNote}
              onChange={(e) => setForm((f) => ({ ...f, progressNote: e.target.value }))}
              placeholder="Latest update on delivery…"
            />
          </div>

          {/* Flag toggles */}
          <div className="col-span-2 flex items-center gap-6 pt-1">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.inAideMemoire}
                onCheckedChange={(v) => setForm((f) => ({ ...f, inAideMemoire: v }))}
              />
              <div>
                <p className="text-[13px] font-medium text-[var(--brand-ink)]">Include in Aide Mémoire</p>
                <p className="text-[11px]" style={{ color: MUTED }}>Appears in the AM PDF export</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.publishedToScorecard}
                onCheckedChange={(v) => setForm((f) => ({ ...f, publishedToScorecard: v }))}
              />
              <div>
                <p className="text-[13px] font-medium text-[var(--brand-ink)]">Publish to Scorecard</p>
                <p className="text-[11px]" style={{ color: MUTED }}>Visible in scorecard view &amp; PDF</p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
