import { useState, useMemo } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  useListBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
  useSyncBudgets,
  useListPassTypeConfigs,
  useCreatePassTypeConfig,
  useUpdatePassTypeConfig,
  useDeletePassTypeConfig,
  useUpdateConvening,
  useListDelegates,
  useGetSponsorCompAllocations,
  useGetMe,
  useEmailBudgetExport,
  getListBudgetsQueryKey,
  getListPassTypeConfigsQueryKey,
  getListDelegatesQueryKey,
  getGetSponsorCompAllocationsQueryKey,
  type Budget,
  type PassTypeConfig,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, RefreshCw, ChevronDown, ChevronRight, Trash2, Download, Mail, FileSpreadsheet, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { label } from "@/lib/labels";

const BUDGET_EXPORT_ROLES: string[] = ["Admin", "Finance", "Ops"];
const BUDGET_SHARE_ROLES: string[] = ["Admin", "Finance"];

// ── Design tokens §2, §7 ──────────────────────────────────────────────────────
const FAV   = "#0F6E56";
const ADV   = "#A32D2D";
const MUTED = "var(--brand-text-secondary)";

// ── Pass type taxonomy ────────────────────────────────────────────────────────
const PAYING_PASS_TYPES  = ["EarlyBird", "Standard", "Late", "Paid"] as const;
const COMP_PASS_TYPES    = ["FreeSponsor", "FreeComp", "Speaker", "Press", "Official", "VIP"] as const;
const ALL_PASS_TYPES     = [...PAYING_PASS_TYPES, ...COMP_PASS_TYPES] as const;
type PayingPassType = typeof PAYING_PASS_TYPES[number];
type CompPassType   = typeof COMP_PASS_TYPES[number];

// ── Category lists ────────────────────────────────────────────────────────────
const INCOME_CATS  = ["Origination", "Sponsorships", "DelegatePasses"] as const;
const EXPENSE_CATS = ["Operations", "Marketing", "Venue", "Catering", "AV", "Travel", "Contingency"] as const;

// ── Numeric helpers ───────────────────────────────────────────────────────────
function n(v: unknown): number { return Number(v ?? 0); }

function fmt(v: number, cur: string): string {
  return `${cur} ${Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtInt(v: number): string {
  return Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function varFav(type: string, budget: number, actual: number): number {
  return type === "Income" ? actual - budget : budget - actual;
}

interface VarResult { dollar: string; pct: string; color: string }

function computeVar(type: string, budget: number, actual: number): VarResult {
  if (budget === 0) return { dollar: "—", pct: "—", color: MUTED };
  const fav  = varFav(type, budget, actual);
  const pct  = (fav / budget) * 100;
  const color = fav > 0 ? FAV : fav < 0 ? ADV : MUTED;
  const sign  = fav > 0 ? "+" : fav < 0 ? "−" : "";
  const dollar = fav === 0 ? "—" : `${sign}${fmtInt(fav)}`;
  const pctStr = fav === 0 ? "—" : `${sign}${Math.abs(pct).toFixed(1)}%`;
  return { dollar, pct: pctStr, color };
}

// ── Shared CSS ────────────────────────────────────────────────────────────────
const TH_R = "px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em]";
const TH_L = "px-3 py-2 text-left  text-[10px] font-semibold uppercase tracking-[0.08em]";
const FL   = "block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1";

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow({ cols = 7 }: { cols?: number }) {
  const widths = [52, 10, 12, 13, 13, 10, 10];
  return (
    <tr>
      {widths.slice(0, cols).map((w, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-3 rounded animate-pulse"
            style={{ width: `${w}%`, background: "var(--brand-border)", marginLeft: i > 0 ? "auto" : undefined }} />
        </td>
      ))}
    </tr>
  );
}

// ── Section header row ────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <tr style={{ background: "var(--brand-page-bg)", borderTop: "1px solid var(--brand-border)", borderBottom: "1px solid var(--brand-border)" }}>
      <td colSpan={7} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
        {title}
      </td>
    </tr>
  );
}

// ── Sub-section header (indented) ─────────────────────────────────────────────
function SubSectionHeader({ title }: { title: string }) {
  return (
    <tr style={{ background: "var(--brand-page-bg)", borderBottom: "1px solid var(--brand-border)" }}>
      <td colSpan={7} className="px-3 py-1 pl-5 text-[10px] font-semibold uppercase tracking-[0.09em]" style={{ color: MUTED, opacity: 0.7 }}>
        {title}
      </td>
    </tr>
  );
}

// ── Subtotal row ──────────────────────────────────────────────────────────────
function SubtotalRow({ lbl, type, totalBudget, totalActual, cur }: {
  lbl: string; type: string; totalBudget: number; totalActual: number; cur: string;
}) {
  const v = computeVar(type, totalBudget, totalActual);
  return (
    <tr style={{ background: "var(--brand-page-bg)", borderTop: "1px solid var(--brand-border)" }}>
      <td className="px-3 py-2 pl-5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: MUTED }}>{lbl}</td>
      <td colSpan={2} />
      <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums text-[var(--brand-ink)]">{fmt(totalBudget, cur)}</td>
      <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums" style={{ color: MUTED }}>{fmt(totalActual, cur)}</td>
      <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums" style={{ color: v.color }}>{v.dollar}</td>
      <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums" style={{ color: v.color }}>{v.pct}</td>
    </tr>
  );
}

// ── Inline-edit state ─────────────────────────────────────────────────────────
interface EditState {
  lineItemName: string; units: string; unitCost: string;
  committedAmount: string; actualAmount: string;
}

// ── Budget row ────────────────────────────────────────────────────────────────
function BudgetRow({ line, onSave, onDelete, cur }: {
  line: Budget; onSave: (id: string, v: EditState) => Promise<void>; onDelete: (line: Budget) => Promise<void>; cur: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [vals, setVals] = useState<EditState>({
    lineItemName:    line.lineItemName ?? "",
    units:           line.units    != null ? String(line.units)    : "",
    unitCost:        line.unitCost != null ? String(line.unitCost) : "",
    committedAmount: String(n(line.committedAmount)),
    actualAmount:    String(n(line.actualAmount)),
  });

  const budget = n(line.committedAmount);
  const actual = n(line.actualAmount);
  const type   = line.type ?? "Expense";
  const v      = computeVar(type, budget, actual);
  const name   = line.lineItemName || label(line.category);

  const compBudget = vals.units && vals.unitCost ? Number(vals.units) * Number(vals.unitCost) : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(line.id, vals);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <tr style={{ background: "var(--brand-tint)", borderBottom: "1px solid var(--brand-border)" }}>
        <td className="px-3 py-2">
          <Input className="h-7 text-xs" value={vals.lineItemName}
            onChange={e => setVals(s => ({ ...s, lineItemName: e.target.value }))}
            placeholder={label(line.category)} />
        </td>
        <td className="px-3 py-2">
          <Input className="h-7 text-xs text-right tabular-nums w-20 ml-auto" type="number"
            value={vals.units} placeholder="—"
            onChange={e => setVals(s => ({ ...s, units: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <Input className="h-7 text-xs text-right tabular-nums w-24 ml-auto" type="number"
            value={vals.unitCost} placeholder="—"
            onChange={e => setVals(s => ({ ...s, unitCost: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <Input className="h-7 text-xs text-right tabular-nums w-28 ml-auto" type="number"
            value={compBudget != null ? String(compBudget) : vals.committedAmount}
            disabled={compBudget != null}
            onChange={e => setVals(s => ({ ...s, committedAmount: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <Input className="h-7 text-xs text-right tabular-nums w-28 ml-auto" type="number"
            value={vals.actualAmount}
            onChange={e => setVals(s => ({ ...s, actualAmount: e.target.value }))} />
        </td>
        <td colSpan={2} className="px-3 py-2">
          <div className="flex gap-1 justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled={deleting}
              onClick={async () => {
                if (!confirm(`Delete line item "${name}"? This cannot be undone.`)) return;
                setDeleting(true);
                await onDelete(line);
                setDeleting(false);
              }}
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>✕</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group cursor-pointer transition-colors"
      style={{ height: 44, borderBottom: "1px solid var(--brand-border)" }}
      onClick={() => setEditing(true)}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--brand-tint)")}
      onMouseLeave={e => (e.currentTarget.style.background = "")}>
      <td className="px-3 py-2.5 text-[13px] text-[var(--brand-ink)]">{name}</td>
      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums" style={{ color: MUTED }}>
        {line.units != null ? line.units.toLocaleString("en-GB") : "—"}
      </td>
      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums" style={{ color: MUTED }}>
        {line.unitCost != null ? `${cur} ${fmtInt(n(line.unitCost))}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right text-[13px] font-medium tabular-nums text-[var(--brand-ink)]">{fmt(budget, cur)}</td>
      <td className="px-3 py-2.5 text-right text-[13px] tabular-nums" style={{ color: MUTED }}>{fmt(actual, cur)}</td>
      <td className="px-3 py-2.5 text-right text-[13px] font-medium tabular-nums" style={{ color: v.color }}>{v.dollar}</td>
      <td className="px-3 py-2.5 text-right text-[13px] font-medium tabular-nums" style={{ color: v.color }}>{v.pct}</td>
    </tr>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ lbl, value, sub, color }: {
  lbl: string; value: string; sub: string; color?: string;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>{lbl}</p>
      <p className="text-[22px] font-semibold mt-0.5 tabular-nums" style={{ color: color ?? "var(--brand-ink)" }}>{value}</p>
      <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>{sub}</p>
    </div>
  );
}

// ── Pass Pricing Panel ────────────────────────────────────────────────────────
interface PassPricingProps {
  conveningId: string;
  compPassCap: number;
  onCapChange: (cap: number) => void;
  capSaving: boolean;
  cur: string;
}

function PassPricingPanel({ conveningId, compPassCap, onCapChange, capSaving, cur }: PassPricingProps) {
  const [open, setOpen] = useState(false);
  const [capDraft, setCapDraft] = useState(String(compPassCap));
  const [addForm, setAddForm] = useState<{ passType: string; label_: string; price: string; capacity: string } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const onConfigError = () =>
    toast({ title: "Could not save pass type", description: "Please try again.", variant: "destructive" });

  const ptParams = { conveningId };
  const { data: configs = [], isLoading } = useListPassTypeConfigs(
    ptParams,
    { query: { enabled: open && !!conveningId, queryKey: getListPassTypeConfigsQueryKey(ptParams) } },
  );

  const createConfig = useCreatePassTypeConfig({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPassTypeConfigsQueryKey(ptParams) });
        setAddForm(null);
      },
      onError: onConfigError,
    },
  });

  const updateConfig = useUpdatePassTypeConfig({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPassTypeConfigsQueryKey(ptParams) }),
      onError: onConfigError,
    },
  });

  const deleteConfig = useDeletePassTypeConfig({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPassTypeConfigsQueryKey(ptParams) }),
      onError: onConfigError,
    },
  });

  const payingConfigs = configs.filter(c => (PAYING_PASS_TYPES as readonly string[]).includes(c.passType));
  const compConfigs   = configs.filter(c => (COMP_PASS_TYPES   as readonly string[]).includes(c.passType));

  const usedPassTypes = new Set(configs.map(c => c.passType));
  const availablePayingTypes = PAYING_PASS_TYPES.filter(t => !usedPassTypes.has(t));
  const availableCompTypes   = COMP_PASS_TYPES.filter(t => !usedPassTypes.has(t));
  const allAvailable = [...availablePayingTypes, ...availableCompTypes];

  return (
    <div className="border border-[var(--brand-border)] rounded-lg overflow-hidden bg-white">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" style={{ color: MUTED }} /> : <ChevronRight className="h-4 w-4" style={{ color: MUTED }} />}
          <span className="text-[13px] font-semibold text-[var(--brand-ink)]">Pass Pricing & Caps</span>
          <span className="text-[11px]" style={{ color: MUTED }}>
            {configs.length} pass type{configs.length !== 1 ? "s" : ""} configured
          </span>
        </div>
        <span className="text-[11px]" style={{ color: MUTED }}>
          Comp cap: {compPassCap > 0 ? compPassCap : "not set"}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--brand-border)] px-4 py-4 space-y-5">

          {/* ── Paying pass types ─────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: MUTED }}>
              Paying Pass Types — generate delegate revenue
            </p>
            {isLoading ? (
              <div className="h-8 animate-pulse rounded" style={{ background: "var(--brand-border)" }} />
            ) : payingConfigs.length === 0 ? (
              <p className="text-[12px]" style={{ color: MUTED }}>None configured — add below.</p>
            ) : (
              <table className="w-full text-sm mb-2">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--brand-border)" }}>
                    <th className={TH_L} style={{ color: MUTED }}>Label</th>
                    <th className={TH_R} style={{ color: MUTED }}>Pass type</th>
                    <th className={TH_R} style={{ color: MUTED }}>Capacity</th>
                    <th className={TH_R} style={{ color: MUTED }}>Price ({cur})</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payingConfigs.map(cfg => (
                    <PassConfigRow
                      key={cfg.id}
                      cfg={cfg}
                      showPrice
                      cur={cur}
                      onUpdate={(id, data) => updateConfig.mutateAsync({ id, data })}
                      onDelete={id => deleteConfig.mutateAsync({ id })}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Comp pass types ───────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: MUTED }}>
              Complimentary Pass Types — no revenue, count against cap
            </p>
            {isLoading ? (
              <div className="h-8 animate-pulse rounded" style={{ background: "var(--brand-border)" }} />
            ) : compConfigs.length === 0 ? (
              <p className="text-[12px]" style={{ color: MUTED }}>None configured — add below.</p>
            ) : (
              <table className="w-full text-sm mb-2">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--brand-border)" }}>
                    <th className={TH_L} style={{ color: MUTED }}>Label</th>
                    <th className={TH_R} style={{ color: MUTED }}>Pass type</th>
                    <th className={TH_R} style={{ color: MUTED }}>Capacity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {compConfigs.map(cfg => (
                    <PassConfigRow
                      key={cfg.id}
                      cfg={cfg}
                      showPrice={false}
                      cur={cur}
                      onUpdate={(id, data) => updateConfig.mutateAsync({ id, data })}
                      onDelete={id => deleteConfig.mutateAsync({ id })}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Add new pass type ─────────────────────────────────────── */}
          {allAvailable.length > 0 && (
            <div>
              {addForm ? (
                <div className="flex gap-2 items-end flex-wrap">
                  <div>
                    <label className={FL}>Pass type</label>
                    <Select value={addForm.passType} onValueChange={v => setAddForm(f => f ? { ...f, passType: v } : f)}>
                      <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {allAvailable.map(t => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={FL}>Label</label>
                    <Input className="h-8 text-xs w-36" value={addForm.label_}
                      onChange={e => setAddForm(f => f ? { ...f, label_: e.target.value } : f)}
                      placeholder={addForm.passType ? label(addForm.passType) : "e.g. Early Bird"} />
                  </div>
                  <div>
                    <label className={FL}>Capacity</label>
                    <Input className="h-8 text-xs w-24" type="number" value={addForm.capacity}
                      onChange={e => setAddForm(f => f ? { ...f, capacity: e.target.value } : f)}
                      placeholder="0" />
                  </div>
                  {(PAYING_PASS_TYPES as readonly string[]).includes(addForm.passType) && (
                    <div>
                      <label className={FL}>Price ({cur})</label>
                      <Input className="h-8 text-xs w-24" type="number" value={addForm.price}
                        onChange={e => setAddForm(f => f ? { ...f, price: e.target.value } : f)}
                        placeholder="0" />
                    </div>
                  )}
                  <Button size="sm" className="h-8 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
                    disabled={!addForm.passType || createConfig.isPending}
                    onClick={async () => {
                      if (!addForm.passType) return;
                      await createConfig.mutateAsync({
                        data: {
                          conveningId,
                          passType: addForm.passType as typeof ALL_PASS_TYPES[number],
                          label: addForm.label_ || label(addForm.passType),
                          price: addForm.price ? Number(addForm.price) : 0,
                          capacity: addForm.capacity ? Number(addForm.capacity) : 0,
                        },
                      });
                    }}>
                    {createConfig.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddForm(null)}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                  onClick={() => setAddForm({ passType: availablePayingTypes[0] ?? availableCompTypes[0] ?? "", label_: "", price: "", capacity: "" })}>
                  <Plus className="h-3 w-3" /> Add pass type
                </Button>
              )}
            </div>
          )}

          {/* ── Comp cap ──────────────────────────────────────────────── */}
          <div className="flex items-end gap-3 pt-1 border-t border-[var(--brand-border)]">
            <div>
              <label className={FL}>Event-wide complimentary pass cap</label>
              <Input className="h-8 text-xs w-32" type="number" value={capDraft}
                onChange={e => setCapDraft(e.target.value)} placeholder="0" />
            </div>
            <Button size="sm" className="h-8 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={capSaving || capDraft === String(compPassCap)}
              onClick={() => onCapChange(Number(capDraft) || 0)}>
              {capSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save cap"}
            </Button>
            <p className="text-[11px] pb-1" style={{ color: MUTED }}>
              Total comp passes (Speaker, VIP, Press, Official, Sponsor comp) will count against this limit.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}

// ── PassConfigRow (inline editable) ──────────────────────────────────────────
function PassConfigRow({ cfg, showPrice, cur, onUpdate, onDelete }: {
  cfg: PassTypeConfig;
  showPrice: boolean;
  cur: string;
  onUpdate: (id: string, data: { label?: string; price?: number; capacity?: number }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [lbl, setLbl] = useState(cfg.label);
  const [cap, setCap] = useState(String(cfg.capacity));
  const [prc, setPrc] = useState(String(n(cfg.price)));

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(cfg.id, { label: lbl, capacity: Number(cap) || 0, price: Number(prc) || 0 });
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <tr style={{ background: "var(--brand-tint)", borderBottom: "1px solid var(--brand-border)" }}>
        <td className="px-2 py-1.5">
          <Input className="h-7 text-xs w-28" value={lbl} onChange={e => setLbl(e.target.value)} />
        </td>
        <td className="px-2 py-1.5 text-right text-[12px]" style={{ color: MUTED }}>{label(cfg.passType)}</td>
        <td className="px-2 py-1.5">
          <Input className="h-7 text-xs text-right w-20 ml-auto" type="number" value={cap} onChange={e => setCap(e.target.value)} />
        </td>
        {showPrice && (
          <td className="px-2 py-1.5">
            <Input className="h-7 text-xs text-right w-24 ml-auto" type="number" value={prc} onChange={e => setPrc(e.target.value)} />
          </td>
        )}
        <td className="px-2 py-1.5">
          <div className="flex gap-1 justify-end">
            <Button size="sm" className="h-6 px-2 text-xs bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>✕</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group cursor-pointer" style={{ borderBottom: "1px solid var(--brand-border)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--brand-tint)")}
      onMouseLeave={e => (e.currentTarget.style.background = "")}>
      <td className="px-2 py-2 text-[13px] text-[var(--brand-ink)]" onClick={() => setEditing(true)}>{cfg.label}</td>
      <td className="px-2 py-2 text-right text-[12px]" style={{ color: MUTED }} onClick={() => setEditing(true)}>{label(cfg.passType)}</td>
      <td className="px-2 py-2 text-right text-[13px] tabular-nums" style={{ color: MUTED }} onClick={() => setEditing(true)}>
        {cfg.capacity.toLocaleString("en-GB")}
      </td>
      {showPrice && (
        <td className="px-2 py-2 text-right text-[13px] tabular-nums" style={{ color: MUTED }} onClick={() => setEditing(true)}>
          {n(cfg.price) > 0 ? `${cur} ${fmtInt(n(cfg.price))}` : "—"}
        </td>
      )}
      <td className="px-2 py-2 text-right">
        <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50"
          onClick={() => onDelete(cfg.id)}>
          <Trash2 className="h-3 w-3 text-red-500" />
        </button>
      </td>
    </tr>
  );
}

// ── Add-line form ─────────────────────────────────────────────────────────────
interface AddForm {
  type: "Income" | "Expense"; category: string; lineItemName: string;
  units: string; unitCost: string; committedAmount: string; actualAmount: string;
}
const EMPTY_FORM: AddForm = {
  type: "Expense", category: "", lineItemName: "",
  units: "", unitCost: "", committedAmount: "", actualAmount: "",
};

// ── Budget page ───────────────────────────────────────────────────────────────
export default function Budget() {
  const { activeConveningId, activeConvening } = useConvening();
  const { displayCurrency: cur } = useCurrency();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useGetMe();
  const canExport = BUDGET_EXPORT_ROLES.includes(me?.role ?? "");
  const canShare  = BUDGET_SHARE_ROLES.includes(me?.role ?? "");

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [capSaving, setCapSaving] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareEmails, setShareEmails] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareDone, setShareDone] = useState(false);

  const params = { conveningId: activeConveningId ?? "" };

  const { data: raw = [], isLoading } = useListBudgets(
    params,
    { query: { enabled: !!activeConveningId, queryKey: getListBudgetsQueryKey(params) } },
  );

  // Fetch delegates for comp pass count (passType + status fields)
  const dlgParams = { conveningId: activeConveningId ?? "" };
  const { data: allDelegates = [] } = useListDelegates(
    dlgParams,
    { query: { enabled: !!activeConveningId, queryKey: getListDelegatesQueryKey(dlgParams) } },
  );

  // Fetch pass type configs for comp usage breakdown in P&L table
  const ptParams = { conveningId: activeConveningId ?? "" };
  const { data: passConfigs = [] } = useListPassTypeConfigs(
    ptParams,
    { query: { enabled: !!activeConveningId, queryKey: getListPassTypeConfigsQueryKey(ptParams) } },
  );

  // Fetch sponsor comp allocations: per-tier delegatePassesAllocated vs issued FreeSponsor delegates
  const compAllocParams = { conveningId: activeConveningId ?? "" };
  const { data: sponsorCompData } = useGetSponsorCompAllocations(
    compAllocParams,
    { query: { enabled: !!activeConveningId, queryKey: getGetSponsorCompAllocationsQueryKey(compAllocParams) } },
  );

  const onBudgetError = () =>
    toast({ title: "Could not save budget line", description: "Please try again.", variant: "destructive" });

  const createBudget = useCreateBudget({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey(params) });
        setShowAdd(false);
        setForm(EMPTY_FORM);
      },
      onError: onBudgetError,
    },
  });

  const updateBudget = useUpdateBudget({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey(params) }),
      onError: onBudgetError,
    },
  });

  const deleteBudget = useDeleteBudget({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey(params) }),
      onError: onBudgetError,
    },
  });

  const syncBudgets = useSyncBudgets({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey(params) }),
      onError: () => toast({ title: "Budget sync failed", description: "Please try again.", variant: "destructive" }),
    },
  });

  const updateConvening = useUpdateConvening({
    mutation: {
      onError: () => toast({ title: "Could not save comp pass cap", description: "Please try again.", variant: "destructive" }),
    },
  });

  const emailExport = useEmailBudgetExport();

  // ── Derived data ──────────────────────────────────────────────────────────
  const budgets = useMemo(() => {
    const seen = new Set<string>();
    return raw.filter(b => {
      const key = `${b.type}|${b.category}|${b.lineItemName ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [raw]);

  const receipts        = budgets.filter(b => b.type === "Income");
  const expenses        = budgets.filter(b => b.type !== "Income");
  const delegateReceipts = receipts.filter(b => b.category === "DelegatePasses");
  const otherReceipts   = receipts.filter(b => b.category !== "DelegatePasses");

  const recBudget  = receipts.reduce((s, b) => s + n(b.committedAmount), 0);
  const recActual  = receipts.reduce((s, b) => s + n(b.actualAmount), 0);
  const expBudget  = expenses.reduce((s, b) => s + n(b.committedAmount), 0);
  const expActual  = expenses.reduce((s, b) => s + n(b.actualAmount), 0);
  const delBudget  = delegateReceipts.reduce((s, b) => s + n(b.committedAmount), 0);
  const delActual  = delegateReceipts.reduce((s, b) => s + n(b.actualAmount), 0);

  const hasReceipts = receipts.length > 0;
  const hasExpenses = expenses.length > 0;
  const hasBoth     = hasReceipts && hasExpenses;

  const netBudget = hasBoth ? recBudget - expBudget : 0;
  const netActual = hasBoth ? recActual - expActual : 0;

  const netVar = hasBoth ? (() => {
    const fav   = netActual - netBudget;
    const color = fav > 0 ? FAV : fav < 0 ? ADV : MUTED;
    const sign  = fav > 0 ? "+" : fav < 0 ? "−" : "";
    return { dollar: fav === 0 ? "—" : `${sign}${fmtInt(fav)}`, pct: "—", color };
  })() : null;

  // Comp pass counts from delegates — keyed by passType
  const compCountByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of allDelegates) {
      if ((COMP_PASS_TYPES as readonly string[]).includes(d.passType) && d.status !== "Cancelled") {
        m.set(d.passType, (m.get(d.passType) ?? 0) + 1);
      }
    }
    return m;
  }, [allDelegates]);

  const compPassCount = useMemo(
    () => Array.from(compCountByType.values()).reduce((s, c) => s + c, 0),
    [compCountByType],
  );

  // Comp pass type configs for the P&L summary row
  const compConfigs = useMemo(
    () => passConfigs.filter(c => (COMP_PASS_TYPES as readonly string[]).includes(c.passType)),
    [passConfigs],
  );

  const compPassCap = activeConvening?.compPassCap ?? 0;

  // Computed budget for the add-form
  const compBudget = form.units && form.unitCost ? Number(form.units) * Number(form.unitCost) : null;

  const handleAdd = async () => {
    if (!form.category || !activeConveningId) return;
    await createBudget.mutateAsync({
      data: {
        conveningId:     activeConveningId,
        type:            form.type,
        category:        form.category as "Venue",
        lineItemName:    form.lineItemName || undefined,
        units:           form.units    ? Number(form.units)    : undefined,
        unitCost:        form.unitCost ? Number(form.unitCost) : undefined,
        committedAmount: compBudget ?? (form.committedAmount ? Number(form.committedAmount) : 0),
        actualAmount:    form.actualAmount ? Number(form.actualAmount) : 0,
      },
    });
  };

  const handleSave = async (id: string, vals: EditState) => {
    const units    = vals.units    ? Number(vals.units)    : undefined;
    const unitCost = vals.unitCost ? Number(vals.unitCost) : undefined;
    const committed = units != null && unitCost != null ? units * unitCost : Number(vals.committedAmount ?? 0);
    await updateBudget.mutateAsync({
      id,
      data: {
        lineItemName:    vals.lineItemName || null,
        units:           units ?? null,
        unitCost:        unitCost ?? null,
        committedAmount: committed,
        actualAmount:    Number(vals.actualAmount ?? 0),
      },
    });
  };

  const handleDelete = async (line: Budget) => {
    await deleteBudget.mutateAsync({ id: line.id });
  };

  const handleSync = async () => {
    if (!activeConveningId) return;
    setSyncing(true);
    try {
      await syncBudgets.mutateAsync({ data: { conveningId: activeConveningId } });
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    if (!activeConveningId) return;
    setExporting(true);
    try {
      const resp = await fetch(`/api/budgets/export?conveningId=${encodeURIComponent(activeConveningId)}&format=xlsx&currency=${encodeURIComponent(cur)}`, {
        credentials: "include",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        alert((body as { error?: string }).error ?? `Export failed (${resp.status})`);
        return;
      }
      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "budget-export.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async () => {
    if (!activeConveningId) return;
    setExportingCsv(true);
    try {
      const resp = await fetch(`/api/budgets/export?conveningId=${encodeURIComponent(activeConveningId)}&format=csv&currency=${encodeURIComponent(cur)}`, {
        credentials: "include",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        alert((body as { error?: string }).error ?? `Export failed (${resp.status})`);
        return;
      }
      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "budget-export.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportPdf = async () => {
    if (!activeConveningId) return;
    setExportingPdf(true);
    try {
      const resp = await fetch(`/api/budgets/export?conveningId=${encodeURIComponent(activeConveningId)}&format=pdf&currency=${encodeURIComponent(cur)}`, {
        credentials: "include",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        alert((body as { error?: string }).error ?? `Export failed (${resp.status})`);
        return;
      }
      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "budget-export.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCapChange = async (cap: number) => {
    if (!activeConveningId) return;
    setCapSaving(true);
    try {
      await updateConvening.mutateAsync({ id: activeConveningId, data: { compPassCap: cap } });
    } finally {
      setCapSaving(false);
    }
  };

  const handleShare = async () => {
    if (!activeConveningId) return;
    setShareError(null);

    const rawEmails = shareEmails.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = rawEmails.filter(e => !emailRegex.test(e));
    if (rawEmails.length === 0) { setShareError("Please enter at least one recipient email."); return; }
    if (invalid.length > 0) { setShareError(`Invalid email address${invalid.length > 1 ? "es" : ""}: ${invalid.join(", ")}`); return; }
    if (rawEmails.length > 20) { setShareError("Maximum 20 recipients per send."); return; }

    try {
      await emailExport.mutateAsync({
        data: {
          conveningId: activeConveningId,
          recipients: rawEmails,
          message: shareMessage.trim() || null,
          currency: cur,
        },
      });
      setShareDone(true);
    } catch {
      setShareError("Failed to send the email. Please check your connection and try again.");
    }
  };

  const handleShareClose = () => {
    setShowShare(false);
    setShareEmails("");
    setShareMessage("");
    setShareError(null);
    setShareDone(false);
  };

  if (!activeConveningId) return null;

  const netSign = (v: number) => (v >= 0 ? "+" : "−");

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Budget</h1>
          <p className="text-[13px] mt-0.5" style={{ color: MUTED }}>
            Profit &amp; Loss — budget vs actual to date ({cur})
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {canShare && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setShowShare(true)}
            >
              <Mail className="h-4 w-4" />
              Share via email
            </Button>
          )}
          {canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={exporting || exportingCsv || exportingPdf}
                >
                  {(exporting || exportingCsv || exportingPdf) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Export
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  disabled={exporting}
                  onSelect={handleExport}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export XLSX
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  disabled={exportingCsv}
                  onSelect={handleExportCsv}
                >
                  <FileText className="h-4 w-4" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  disabled={exportingPdf}
                  onSelect={handleExportPdf}
                >
                  <FileText className="h-4 w-4" />
                  Export PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-[var(--brand-primary)] border-[var(--brand-primary)]"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync from live data
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="h-4 w-4" /> Add Line
          </Button>
        </div>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-lg overflow-hidden border border-[var(--brand-border)]"
        style={{ background: "var(--brand-border)" }}>
        <MetricCard
          lbl="Total Receipts (Budget)"
          value={hasReceipts ? fmt(recBudget, cur) : "—"}
          sub={hasReceipts ? `Actual to date: ${fmt(recActual, cur)}` : "No income lines added yet"}
          color={hasReceipts ? FAV : MUTED}
        />
        <MetricCard
          lbl="Delegate Revenue (Budget)"
          value={delegateReceipts.length > 0 ? fmt(delBudget, cur) : "—"}
          sub={delegateReceipts.length > 0 ? `Actual: ${fmt(delActual, cur)}` : "Sync to populate"}
          color={delegateReceipts.length > 0 ? FAV : MUTED}
        />
        <MetricCard
          lbl="Total Expenses (Budget)"
          value={hasExpenses ? fmt(expBudget, cur) : "—"}
          sub={hasExpenses ? `Actual to date: ${fmt(expActual, cur)}` : "No expense lines added yet"}
        />
        <MetricCard
          lbl="Net P&L (Budget)"
          value={hasBoth ? `${netSign(netBudget)}${cur} ${fmtInt(netBudget)}` : "—"}
          sub={hasBoth ? `Actual: ${netSign(netActual)}${cur} ${fmtInt(netActual)}` : "Add both receipts and expenses"}
          color={hasBoth ? (netBudget >= 0 ? FAV : ADV) : MUTED}
        />
        <MetricCard
          lbl="Comp Passes Issued"
          value={compPassCap > 0 ? `${compPassCount} / ${compPassCap}` : String(compPassCount)}
          sub={compPassCap > 0
            ? `${Math.max(0, compPassCap - compPassCount)} remaining of ${compPassCap} cap`
            : "Set a cap in Pass Pricing"}
          color={compPassCap > 0 && compPassCount > compPassCap ? ADV : MUTED}
        />
      </div>

      {/* ── Pass Pricing panel ──────────────────────────────────────── */}
      <PassPricingPanel
        conveningId={activeConveningId}
        compPassCap={compPassCap}
        onCapChange={handleCapChange}
        capSaving={capSaving}
        cur={cur}
      />

      {/* ── P&L table ───────────────────────────────────────────────── */}
      <div className="border border-[var(--brand-border)] rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr style={{
              background: "var(--brand-page-bg)",
              borderBottom: "1px solid var(--brand-border)",
              height: 36,
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}>
              <th className={TH_L} style={{ color: MUTED }}>Description</th>
              <th className={TH_R} style={{ color: MUTED }}>Units</th>
              <th className={TH_R} style={{ color: MUTED }}>Unit Cost</th>
              <th className={TH_R} style={{ color: MUTED }}>Budget ({cur})</th>
              <th className={TH_R} style={{ color: MUTED }}>Actual to Date ({cur})</th>
              <th className={TH_R} style={{ color: MUTED }}>Variance</th>
              <th className={TH_R} style={{ color: MUTED }}>%</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
            ) : (
              <>
                {/* ── RECEIPTS ─────────────────────────────────────── */}
                <SectionHeader title="Receipts" />

                {/* Other income (Origination, Sponsorships) */}
                {otherReceipts.length > 0 && (
                  <>
                    <SubSectionHeader title="Sponsorships & Origination" />
                    {otherReceipts.map(line => (
                      <BudgetRow key={line.id} line={line} onSave={handleSave} onDelete={handleDelete} cur={cur} />
                    ))}
                  </>
                )}

                {/* Delegate Revenue sub-section */}
                <SubSectionHeader title="Delegate Revenue — Paying Passes" />
                {delegateReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-[13px]" style={{ color: MUTED }}>
                      No delegate revenue lines yet — click <strong>Sync from live data</strong> to auto-fill from pass pricing.
                    </td>
                  </tr>
                ) : (
                  delegateReceipts.map(line => (
                    <BudgetRow key={line.id} line={line} onSave={handleSave} onDelete={handleDelete} cur={cur} />
                  ))
                )}

                {/* Comp pass usage summary — read-only breakdown */}
                {compConfigs.length > 0 && (
                  <>
                    <SubSectionHeader title="Complimentary Passes (no revenue)" />
                    {compConfigs.map(cfg => {
                      const issued = compCountByType.get(cfg.passType) ?? 0;
                      const cap    = cfg.capacity;
                      const over   = cap > 0 && issued > cap;
                      return (
                        <tr key={cfg.id} style={{ borderBottom: "1px solid var(--brand-border)" }}>
                          <td className="px-3 py-2 pl-5 text-[12px] text-[var(--brand-ink)]">{cfg.label}</td>
                          <td className="px-3 py-2 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>
                            {cap > 0 ? cap : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>—</td>
                          <td className="px-3 py-2 text-right text-[12px]" style={{ color: MUTED }}>—</td>
                          <td className="px-3 py-2 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>—</td>
                          <td className="px-3 py-2 text-right text-[12px] tabular-nums font-medium" style={{ color: over ? ADV : MUTED }}>
                            {issued} issued{cap > 0 ? ` / ${cap}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-[12px]" style={{ color: over ? ADV : MUTED }}>
                            {over ? "Over cap" : cap > 0 ? `${cap - issued} left` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Comp total row */}
                    <tr style={{ borderBottom: "1px solid var(--brand-border)", background: "var(--brand-page-bg)" }}>
                      <td className="px-3 py-1.5 pl-5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>
                        Total comp passes
                      </td>
                      <td colSpan={4} />
                      <td className="px-3 py-1.5 text-right text-[12px] font-semibold tabular-nums"
                        style={{ color: compPassCap > 0 && compPassCount > compPassCap ? ADV : MUTED }}>
                        {compPassCount} issued{compPassCap > 0 ? ` / ${compPassCap} cap` : ""}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[11px]"
                        style={{ color: compPassCap > 0 && compPassCount > compPassCap ? ADV : MUTED }}>
                        {compPassCap > 0
                          ? compPassCount > compPassCap
                            ? `${compPassCount - compPassCap} over cap`
                            : `${compPassCap - compPassCount} remaining`
                          : "—"}
                      </td>
                    </tr>
                    {/* Sponsor comp allocations — per-tier from engagements.delegatePassesAllocated */}
                    {sponsorCompData && sponsorCompData.byTier.length > 0 && (() => {
                      const totalAlloc  = sponsorCompData.totalAllocated;
                      const totalIssued = sponsorCompData.totalIssued;
                      const over        = totalIssued > totalAlloc && totalAlloc > 0;
                      return (
                        <>
                          {/* Sub-header */}
                          <tr style={{ background: "var(--brand-page-bg)" }}>
                            <td colSpan={7} className="px-3 pt-3 pb-1 pl-5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                              style={{ color: MUTED }}>
                              Sponsor comp allocations (by tier)
                            </td>
                          </tr>
                          {sponsorCompData.byTier.map(row => (
                            <tr key={row.tier} style={{ borderBottom: "1px solid var(--brand-border)" }}>
                              <td className="px-3 py-1.5 pl-7 text-[12px]" style={{ color: "var(--brand-ink)" }}>
                                {row.tier}
                              </td>
                              <td colSpan={4} />
                              <td className="px-3 py-1.5 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>
                                {row.allocated} allocated
                              </td>
                              <td className="px-3 py-1.5 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>—</td>
                            </tr>
                          ))}
                          {/* Sponsor comp totals row */}
                          <tr style={{ borderBottom: "2px solid var(--brand-border)", background: "var(--brand-page-bg)" }}>
                            <td className="px-3 py-1.5 pl-5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>
                              Sponsor comp total
                            </td>
                            <td colSpan={4} />
                            <td className="px-3 py-1.5 text-right text-[12px] font-semibold tabular-nums"
                              style={{ color: over ? ADV : MUTED }}>
                              {totalIssued} issued / {totalAlloc} allocated
                            </td>
                            <td className="px-3 py-1.5 text-right text-[11px]"
                              style={{ color: over ? ADV : FAV }}>
                              {totalAlloc === 0
                                ? "—"
                                : over
                                  ? `${totalIssued - totalAlloc} over`
                                  : `${totalAlloc - totalIssued} remaining`}
                            </td>
                          </tr>
                        </>
                      );
                    })()}
                  </>
                )}

                {/* Empty receipts fallback */}
                {receipts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-5 text-center text-[13px]" style={{ color: MUTED }}>
                      No income lines yet — click <strong>Add Line</strong> and select Income.
                    </td>
                  </tr>
                )}

                {receipts.length > 0 && (
                  <SubtotalRow lbl="Total Receipts" type="Income" totalBudget={recBudget} totalActual={recActual} cur={cur} />
                )}

                {/* ── EXPENSES ─────────────────────────────────────── */}
                <SectionHeader title="Expenses" />
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-5 text-center text-[13px]" style={{ color: MUTED }}>
                      No expense lines yet — click <strong>Add Line</strong> to add costs.
                    </td>
                  </tr>
                ) : (
                  expenses.map(line => (
                    <BudgetRow key={line.id} line={line} onSave={handleSave} onDelete={handleDelete} cur={cur} />
                  ))
                )}
                {expenses.length > 0 && (
                  <SubtotalRow lbl="Total Expenses" type="Expense" totalBudget={expBudget} totalActual={expActual} cur={cur} />
                )}

                {/* ── NET P&L ──────────────────────────────────────── */}
                {hasBoth && (
                  <tr style={{ borderTop: "2px solid var(--brand-ink)", background: "white" }}>
                    <td className="px-3 py-3 text-[12px] font-black uppercase tracking-[0.1em] text-[var(--brand-ink)]">
                      Net P&amp;L
                    </td>
                    <td colSpan={2} />
                    <td className="px-3 py-3 text-right text-[14px] font-black tabular-nums" style={{ color: netBudget >= 0 ? FAV : ADV }}>
                      {netSign(netBudget)}{cur} {fmtInt(netBudget)}
                    </td>
                    <td className="px-3 py-3 text-right text-[14px] font-black tabular-nums" style={{ color: netActual >= 0 ? FAV : ADV }}>
                      {netSign(netActual)}{cur} {fmtInt(netActual)}
                    </td>
                    <td className="px-3 py-3 text-right text-[12px] font-black tabular-nums" style={{ color: netVar?.color ?? MUTED }}>
                      {netVar?.dollar ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>—</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Share via email modal ────────────────────────────────────── */}
      <Modal
        open={showShare}
        onClose={handleShareClose}
        title="Share budget via email"
        size="md"
        footer={
          shareDone ? (
            <Button onClick={handleShareClose} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white">
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={handleShareClose}>Cancel</Button>
              <Button
                className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white gap-2"
                onClick={handleShare}
                disabled={emailExport.isPending || !shareEmails.trim()}
              >
                {emailExport.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {emailExport.isPending ? "Sending…" : "Send"}
              </Button>
            </>
          )
        }
      >
        {shareDone ? (
          <div className="py-6 text-center space-y-2">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full" style={{ background: "var(--brand-tint)" }}>
              <Mail className="h-6 w-6" style={{ color: "var(--brand-primary)" }} />
            </div>
            <p className="text-[15px] font-semibold text-[var(--brand-ink)]">Email sent!</p>
            <p className="text-[13px]" style={{ color: MUTED }}>
              The budget snapshot has been delivered to {shareEmails.split(/[\s,;]+/).filter(Boolean).length} recipient{shareEmails.split(/[\s,;]+/).filter(Boolean).length !== 1 ? "s" : ""}.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div>
              <label className={FL}>Recipients *</label>
              <Input
                value={shareEmails}
                onChange={e => { setShareEmails(e.target.value); setShareError(null); }}
                placeholder="alice@example.com, bob@example.com"
              />
              <p className="text-[11px] mt-1" style={{ color: MUTED }}>
                Separate multiple addresses with commas or spaces. Max 20 recipients.
              </p>
            </div>
            <div>
              <label className={FL}>Message (optional)</label>
              <textarea
                className="w-full rounded-md border border-[var(--brand-border)] bg-white px-3 py-2 text-[13px] text-[var(--brand-ink)] placeholder:text-[var(--brand-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] resize-none"
                rows={4}
                value={shareMessage}
                onChange={e => setShareMessage(e.target.value)}
                placeholder="Add a note to include in the email body…"
                maxLength={2000}
              />
            </div>
            <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-page-bg)] px-4 py-3 text-[12px]" style={{ color: MUTED }}>
              <p className="font-semibold mb-1 text-[var(--brand-ink)]">What recipients will receive:</p>
              <ul className="space-y-0.5">
                <li>• A plain-text P&L summary (income, expenses, net P&L) in the email body</li>
                <li>• The full line-item CSV attached to the email</li>
              </ul>
            </div>
            {shareError && (
              <p className="text-[12px] font-medium" style={{ color: ADV }}>{shareError}</p>
            )}
          </div>
        )}
      </Modal>

      {/* ── Add Line modal ──────────────────────────────────────────── */}
      <Modal
        open={showAdd}
        onClose={() => { setShowAdd(false); setForm(EMPTY_FORM); }}
        title="Add Budget Line"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}>Cancel</Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              onClick={handleAdd}
              disabled={!form.category || createBudget.isPending}>
              {createBudget.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {createBudget.isPending ? "Adding…" : "Add Line"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-1">
          <div>
            <label className={FL}>Type</label>
            <div className="flex rounded-md overflow-hidden border border-[var(--brand-border)]">
              {(["Income", "Expense"] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, type: t, category: "" }))}
                  className="flex-1 py-2 text-sm font-medium transition-colors"
                  style={{ background: form.type === t ? "var(--brand-primary)" : "white", color: form.type === t ? "white" : MUTED }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FL}>Category *</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {(form.type === "Income" ? INCOME_CATS : EXPENSE_CATS).map(c => (
                    <SelectItem key={c} value={c}>{label(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={FL}>Description</label>
              <Input value={form.lineItemName}
                onChange={e => setForm(f => ({ ...f, lineItemName: e.target.value }))}
                placeholder="e.g. Serena Hotel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FL}>Units</label>
              <Input type="number" value={form.units}
                onChange={e => setForm(f => ({ ...f, units: e.target.value }))} placeholder="—" />
            </div>
            <div>
              <label className={FL}>Unit Cost ({cur})</label>
              <Input type="number" value={form.unitCost}
                onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FL}>
                Budget ({cur})
                {compBudget != null && <span className="ml-1 normal-case font-normal" style={{ color: MUTED }}>= {compBudget.toLocaleString("en-GB")}</span>}
              </label>
              <Input type="number"
                value={compBudget != null ? String(compBudget) : form.committedAmount}
                onChange={e => setForm(f => ({ ...f, committedAmount: e.target.value }))}
                disabled={compBudget != null} placeholder="0"
                className={compBudget != null ? "opacity-60" : ""} />
            </div>
            <div>
              <label className={FL}>Actual to Date ({cur})</label>
              <Input type="number" value={form.actualAmount}
                onChange={e => setForm(f => ({ ...f, actualAmount: e.target.value }))} placeholder="0" />
            </div>
          </div>
        </div>
      </Modal>

    </div>
  );
}
