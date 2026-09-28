import { useEffect, useState, useRef } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { projectObjectUrl } from "@/lib/projectObjectUrl";
import { useConvening } from "@/contexts/ConveningContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  useListPartners,
  useLinkPartner,
  useUpdatePartnerEngagement,
  useDeleteEngagement,
  useListPillars,
  getListPartnersQueryKey,
  getListPillarsQueryKey,
  getListEngagementsQueryKey,
  getGetPartnerQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, Users, AlertCircle, Pencil, Mail, Phone, Trash2, FileSpreadsheet, X, Upload, ImageOff } from "lucide-react";
import { exportXlsx } from "@/lib/exportXlsx";
import { label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { PartnerWithEngagement } from "@workspace/api-client-react";

function apiMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { error?: string; errors?: Record<string, string | string[]> } }).data;
    if (data?.error) return `${data.error}${data.errors ? `: ${Object.entries(data.errors).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join("; ")}` : ""}`;
  }
  return error instanceof Error ? error.message : "Unable to save partner.";
}

// ── Outreach stage badge ──────────────────────────────────────────────────────
const OUTREACH_STAGE_CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  // ── Canonical 9-stage progression ──────────────────────────────────────────
  NotStarted:          { label: "Not Started",          bg: "#F0F2F4", fg: "#9AA4B0" },
  ContactMade:         { label: "Contact Made",         bg: "#FEF9E0", fg: "#B87C10" },
  EmailSent:           { label: "Email Sent",           bg: "#E3EDFA", fg: "#2A6FB0" },
  FollowUpRequired:    { label: "Follow-up Required",   bg: "#FEF0E0", fg: "#E8820C" },
  MeetingScheduled:    { label: "Meeting Scheduled",    bg: "#FFF0DB", fg: "#C0650A" },
  MeetingHeld:         { label: "Meeting Held",         bg: "#E5F4EC", fg: "#2E7D5B" },
  ProposalSent:        { label: "Proposal / Pack Sent", bg: "#E5F0FB", fg: "#1E6FA8" },
  AwaitingDecision:    { label: "Awaiting Decision",    bg: "#F5F0FF", fg: "#6030A0" },
  PartnershipConfirmed:{ label: "Partnership Confirmed",bg: "#DFFAED", fg: "#1A6B45" },
  // ── Legacy fallbacks (existing records only) ────────────────────────────────
  Researching:           { label: "Researching",        bg: "#F3EEFB", fg: "#7B4FA6" },
  LetterSent:            { label: "Letter Sent",        bg: "#E3EDFA", fg: "#1A5EA0" },
  IntroductionRequested: { label: "Intro Requested",    bg: "#FEF0E0", fg: "#E8820C" },
  FollowUpSent:          { label: "Follow-up Sent",     bg: "#EEF3FF", fg: "#3B5FC0" },
  NegotiationUnderway:   { label: "Negotiating",        bg: "#FFF0F0", fg: "#B03030" },
  ContractSent:          { label: "Contract Sent",      bg: "#F0F9FF", fg: "#0C6B8A" },
  AwaitingSignature:     { label: "Awaiting Signature", bg: "#F5F0FF", fg: "#6030A0" },
};

function OutreachStageBadge({ stage }: { stage: string }) {
  const cfg = OUTREACH_STAGE_CONFIG[stage] ?? { label: stage, bg: "#F0F2F4", fg: "#9AA4B0" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}

// ── Tonal tier badge ─────────────────────────────────────────────────────────
const TIER_STYLE: Record<string, { bg: string; fg: string }> = {
  Platinum:        { bg: "#EEF1F6", fg: "#0A2F5C" },
  Gold:            { bg: "#FBF3E2", fg: "#8A6516" },
  Silver:          { bg: "#F0F2F4", fg: "#5A6472" },
  CredibilityOnly: { bg: "#F0F2F4", fg: "#5A6472" },
  InKind:          { bg: "#ECFAF3", fg: "#2E7D5B" },
};

function TierBadge({ tier }: { tier: string }) {
  const s = TIER_STYLE[tier] ?? { bg: "#F0F2F4", fg: "#5A6472" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {label(tier)}
    </span>
  );
}

// ── Payment cell ─────────────────────────────────────────────────────────────
const PAYMENT_LABEL: Record<string, string> = {
  Unpaid: "Unpaid",
  PartiallyPaid: "Partial",
  Paid: "Paid",
};
const PAYMENT_COLOR: Record<string, string> = {
  Unpaid: "#C99A3B",
  PartiallyPaid: "#2A6FB0",
  Paid: "#2E7D5B",
};

function PaymentCell({ eng }: { eng: PartnerWithEngagement["engagement"] }) {
  if (!eng) return <span className="text-[var(--brand-border)]">—</span>;
  const status = eng.paymentStatus;
  const due    = eng.paymentDueDate;
  const today  = new Date().toISOString().slice(0, 10);
  const overdue = due && due < today && status !== "Paid";

  return (
    <div className="space-y-0.5">
      {status ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: overdue ? "#B5462F" : (PAYMENT_COLOR[status] ?? "#6C7A99") }}
        >
          {overdue && <AlertCircle className="h-3 w-3 shrink-0" />}
          {PAYMENT_LABEL[status] ?? status}
        </span>
      ) : (
        <span className="text-[var(--brand-border)] text-[11px]">—</span>
      )}
      {due && (
        <p
          className="text-[10px] leading-none"
          style={{ color: overdue ? "#B5462F" : "var(--brand-text-secondary)" }}
        >
          Due {due}
        </p>
      )}
    </div>
  );
}

// ── Standard package names keyed by tier ─────────────────────────────────────
const STANDARD_PACKAGES: Record<string, string[]> = {
  Platinum:        ["Platinum Diamond", "Platinum Presenting", "Platinum Associate"],
  Gold:            ["Gold Partner", "Gold Community"],
  Silver:          ["Silver Partner", "Silver Supporting"],
  CredibilityOnly: ["Credibility Partner"],
  InKind:          ["In-Kind Partner"],
};

const TIERS = ["Platinum", "Gold", "Silver", "CredibilityOnly", "InKind"];
type HistoricalEngagement = "Yes" | "No" | "Partial";
const PARTNER_SECTORS = ["Public", "Private", "DevelopmentPartner", "CivilSociety", "Academia"] as const;
type PartnerSector = typeof PARTNER_SECTORS[number];
// ── Partner types ─────────────────────────────────────────────────────────────
const PARTNER_TYPES = [
  "GovernmentPolicy",
  "DevelopmentPartner",
  "DevelopmentFinance",
  "BanksFinancial",
  "PensionFunds",
  "PensionBodies",
  "CapitalMarkets",
  "TelecomDigital",
  "KnowledgeMedia",
  "TourismHospitality",
  "AviationLogistics",
  "Media",
  "Institutional",
] as const;
type PartnerType = typeof PARTNER_TYPES[number];

const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  GovernmentPolicy:   "Government & Public",
  DevelopmentPartner: "Development Partners",
  DevelopmentFinance: "DFIs",
  BanksFinancial:     "Banks & Financial",
  PensionFunds:       "Pension Funds",
  PensionBodies:      "Pension Bodies",
  CapitalMarkets:     "Capital Markets",
  TelecomDigital:     "Telecom & Digital",
  KnowledgeMedia:     "Knowledge & Media",
  TourismHospitality: "Tourism & Hospitality",
  AviationLogistics:  "Aviation & Logistics",
  Media:               "Media Partner",
  Institutional:      "Other",
};


// ── Form shape ────────────────────────────────────────────────────────────────
interface Principal {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
}

interface FormState {
  institutionName: string;
  partnerType: PartnerType;
  sector: PartnerSector | "";
  industry: string;
  location: string;
  logoUrl: string;
  potentialTier: string;
  historicalEngagement: HistoricalEngagement | "";
  description: string;
  fitWithThem: string;
  historicalNotes: string;
  principals: Principal[];
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  // engagement fields
  financialAmount: string;
  currency: string;
  paymentStatus: string;
  paymentDueDate: string;
  packageType: string;
  packageName: string;
  packageBenefits: string;
  outreachStage: string;
  pillarId: string;
}

const BLANK_PRINCIPAL: Principal = { name: "", title: "", email: "", phone: "", linkedin: "" };

const BLANK: FormState = {
  institutionName: "",
  partnerType: "GovernmentPolicy",
  sector: "",
  industry: "",
  location: "",
  logoUrl: "",
  potentialTier: "Gold",
  historicalEngagement: "",
  description: "",
  fitWithThem: "",
  historicalNotes: "",
  principals: [],
  contactName: "",
  contactTitle: "",
  contactEmail: "",
  contactPhone: "",
  financialAmount: "",
  currency: "USD",
  paymentStatus: "Unpaid",
  paymentDueDate: "",
  packageType: "",
  packageName: "",
  packageBenefits: "",
  outreachStage: "NotStarted",
  pillarId: "",
};

// ── Field label ───────────────────────────────────────────────────────────────
function FL({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1">
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Partners() {
  const { activeConveningId } = useConvening();
  const { displayCurrency, usdToUgxRate } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PartnerType | "All">("All");
  const [pillarFilter, setPillarFilter] = useState<string>("All");
  const [showDialog, setShowDialog] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [editingPartner, setEditingPartner] = useState<PartnerWithEngagement | null>(null);

  // A form opened for one convening must never be submitted after switching events.
  useEffect(() => {
    setShowDialog(false);
    setEditingPartner(null);
    setForm(BLANK);
    setCreateError(null);
  }, [activeConveningId]);

  const params = { conveningId: activeConveningId || "" };
  const { data: partners, isLoading } = useListPartners(params, {
    query: { enabled: !!activeConveningId, queryKey: getListPartnersQueryKey(params) },
  });
  const { data: pillars = [] } = useListPillars(activeConveningId || "", {
    query: {
      enabled: !!activeConveningId,
      queryKey: getListPillarsQueryKey(activeConveningId || ""),
    },
  });
  const linkPartner = useLinkPartner();
  const updatePartnerEngagement = useUpdatePartnerEngagement();
  const deleteEngagement = useDeleteEngagement();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading: isUploadingLogo } = useUpload({
    conveningId: activeConveningId,
    onSuccess: (res) => set("logoUrl", res.objectPath),
  });

  const handleDelete = async (partner: PartnerWithEngagement) => {
    if (!partner.engagement || !confirm(`Remove "${partner.institutionName}" from this convening? The institution remains in other convenings.`)) return;
    try {
      await deleteEngagement.mutateAsync({ id: partner.engagement.id });
      queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey(params) });
      queryClient.invalidateQueries({ queryKey: getListEngagementsQueryKey({ conveningId: activeConveningId ?? "", partnerId: partner.id }) });
    } catch (error) { setCreateError(apiMessage(error)); }
  };

  const typeFiltered = (partners ?? []).filter((p) =>
    typeFilter === "All" || p.partnerType === typeFilter
  );
  const pillarFiltered = pillarFilter === "All"
    ? typeFiltered
    : typeFiltered.filter((p) => p.engagement?.pillarId === pillarFilter);
  const filtered = pillarFiltered.filter((p) =>
    p.institutionName.toLowerCase().includes(search.toLowerCase())
  );

  if (!activeConveningId) return null;

  const isEditing = editingPartner !== null;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function openEdit(partner: PartnerWithEngagement) {
    const eng = partner.engagement;
    setForm({
      institutionName:      partner.institutionName,
      partnerType:          (partner.partnerType ?? "GovernmentPolicy") as PartnerType,
      sector:               (partner.sector ?? "") as PartnerSector | "",
      industry:             partner.industry ?? "",
      location:             partner.location ?? "",
      logoUrl:              partner.logoUrl ?? "",
      potentialTier:        partner.potentialTier,
      historicalEngagement: (partner.historicalEngagement ?? "") as HistoricalEngagement | "",
      description:          partner.description ?? "",
      fitWithThem:          partner.fitWithThem ?? "",
      historicalNotes:      partner.historicalNotes ?? "",
      principals:           (partner.principals ?? []) as Principal[],
      contactName:          partner.contactName ?? "",
      contactTitle:         partner.contactTitle ?? "",
      contactEmail:         partner.contactEmail ?? "",
      contactPhone:         partner.contactPhone ?? "",
      financialAmount:      eng?.financialAmount != null ? String(eng.financialAmount) : "",
      currency:             eng?.currency ?? "USD",
      paymentStatus:        eng?.paymentStatus ?? "Unpaid",
      paymentDueDate:       eng?.paymentDueDate ?? "",
      packageType:          eng?.packageType ?? "",
      packageName:          eng?.packageName ?? "",
      packageBenefits:      eng?.packageBenefits ?? "",
      outreachStage:        eng?.outreachStage ?? "NotStarted",
      pillarId:             eng?.pillarId ?? "",
    });
    setEditingPartner(partner);
    setShowDialog(true);
  }

  const handleClose = () => {
    setShowDialog(false);
    setCreateError(null);
    setForm(BLANK);
    setEditingPartner(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.institutionName.trim()) { setCreateError("Institution name is required."); return; }
    setCreateError(null);
    const partnerData = {
      institutionName: form.institutionName.trim(),
      partnerType: form.partnerType,
      sector: form.sector || undefined,
      industry: form.industry || undefined,
      location: form.location || undefined,
      logoUrl: form.logoUrl || undefined,
      potentialTier: form.potentialTier as "Gold",
      historicalEngagement: (form.historicalEngagement || undefined) as HistoricalEngagement | undefined,
      description: form.description || undefined,
      fitWithThem: form.fitWithThem || undefined,
      historicalNotes: form.historicalNotes || undefined,
      principals: form.principals,
      contactName: form.contactName || undefined,
      contactTitle: form.contactTitle || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
    };
    const engagementData = {
      financialAmount: form.financialAmount === "" ? 0 : Number(form.financialAmount),
      currency: form.currency,
      paymentStatus: form.paymentStatus as "Unpaid",
      paymentDueDate: form.paymentDueDate || null,
      packageType: (form.packageType || null) as "Standard" | null,
      packageName: form.packageName || null,
      packageBenefits: form.packageBenefits || null,
      outreachStage: form.outreachStage as "NotStarted",
      pillarId: form.pillarId || null,
    };
    try {
      if (editingPartner) {
        await updatePartnerEngagement.mutateAsync({ id: editingPartner.id, data: {
          conveningId: activeConveningId,
          partner: { ...partnerData, sector: form.sector || null, industry: form.industry || null,
            location: form.location || null, logoUrl: form.logoUrl || null,
            description: form.description || null, fitWithThem: form.fitWithThem || null,
            historicalNotes: form.historicalNotes || null, contactName: form.contactName || null,
            contactTitle: form.contactTitle || null, contactEmail: form.contactEmail || null,
            contactPhone: form.contactPhone || null },
          engagement: engagementData,
        } });
        queryClient.invalidateQueries({ queryKey: getGetPartnerQueryKey(editingPartner.id, { conveningId: activeConveningId }) });
        queryClient.invalidateQueries({ queryKey: getListEngagementsQueryKey({ conveningId: activeConveningId, partnerId: editingPartner.id }) });
      } else {
        await linkPartner.mutateAsync({ data: { conveningId: activeConveningId, partner: partnerData,
          engagement: { ...engagementData, paymentDueDate: form.paymentDueDate || undefined,
            packageType: (form.packageType || undefined) as "Standard" | undefined,
            packageName: form.packageName || undefined, packageBenefits: form.packageBenefits || undefined,
            pillarId: form.pillarId || undefined } } });
      }
    } catch (error) {
      setCreateError(apiMessage(error));
      return;
    }
    queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey(params) });
    handleClose();
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: Column<PartnerWithEngagement>[] = [
    {
      id: "institution",
      header: "Institution",
      cell: (p) => (
        <div>
          <Link
            href={`/partners/${p.id}`}
            className="font-medium text-[var(--brand-ink)] hover:text-[var(--brand-primary)] transition-colors"
          >
            {p.institutionName}
          </Link>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] font-medium text-[var(--brand-text-secondary)]">
              {PARTNER_TYPE_LABEL[p.partnerType as PartnerType] ?? p.partnerType}
            </span>
            {p.location && (
              <span className="text-[10px] text-[var(--brand-border)]">· {p.location}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      cell: (p) => {
        if (!p.contactName) return <span className="text-[var(--brand-border)]">—</span>;
        return (
          <div className="space-y-0.5">
            <p className="text-[13px] font-medium text-[var(--brand-ink)]">{p.contactName}</p>
            {p.contactTitle && (
              <p className="text-[11px] text-[var(--brand-text-secondary)]">{p.contactTitle}</p>
            )}
            <div className="flex flex-col gap-0.5 mt-0.5">
              {p.contactEmail && (
                <a href={`mailto:${p.contactEmail}`} className="flex items-center gap-1 text-[11px] text-[var(--brand-primary)] hover:underline">
                  <Mail className="h-2.5 w-2.5" />{p.contactEmail}
                </a>
              )}
              {p.contactPhone && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--brand-text-secondary)]">
                  <Phone className="h-2.5 w-2.5" />{p.contactPhone}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (p) =>
        p.engagement?.status ? (
          <StatusBadge status={p.engagement.status} />
        ) : (
          <span className="text-[var(--brand-border)]">—</span>
        ),
    },
    {
      id: "outreach",
      header: "Stage",
      cell: (p) =>
        <OutreachStageBadge stage={p.engagement?.outreachStage ?? "NotStarted"} />,
    },
    {
      id: "pillar",
      header: "Pillar",
      cell: (p) => {
        const pillar = pillars.find((pl) => pl.id === p.engagement?.pillarId);
        return pillar ? (
          <div className="flex flex-col gap-0.5 max-w-[160px]">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap self-start"
              style={{ background: "#EEF3F9", color: "#2A6FB0" }}
            >
              {pillar.name}
            </span>
            {pillar.description && (
              <span className="text-[10px] leading-snug" style={{ color: "var(--brand-text-secondary)" }}>
                {pillar.description}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[var(--brand-border)]">—</span>
        );
      },
    },
    {
      id: "tier",
      header: "Tier",
      cell: (p) => <TierBadge tier={p.potentialTier} />,
    },
    {
      id: "payment",
      header: "Payment",
      cell: (p) => <PaymentCell eng={p.engagement ?? null} />,
    },
    {
      id: "commitment",
      header: "Commitment",
      align: "right",
      cell: (p) => {
        if (!p.engagement) return <span className="text-[var(--brand-border)] tabular-nums">—</span>;
        const amt = Number(p.engagement.financialAmount ?? 0);
        return (
          <span className="tabular-nums font-medium">
            {formatMoney(amt, p.engagement.currency ?? "USD", displayCurrency, usdToUgxRate)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: (p) => (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(p); }}
            className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-[var(--brand-tint)] transition-colors"
            title="Edit partner"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleDelete(p); }}
            className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Remove from this convening"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  // ── Standard package options for selected tier ────────────────────────────
  const stdOptions = STANDARD_PACKAGES[form.potentialTier] ?? [];

  const isSaving =
    linkPartner.isPending || updatePartnerEngagement.isPending;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {createError && !showDialog && <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{createError}</div>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Partners</h1>
          <p className="text-sm text-[var(--brand-text-secondary)] mt-0.5">
            Manage institutional relationships and funding.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => exportXlsx(
              filtered.map((p) => ({
                "Institution":       p.institutionName,
                "Category":          p.partnerType,
                "Sector":            p.sector ?? "",
                "Location":          p.location ?? "",
                "Contact Name":      p.contactName ?? "",
                "Contact Title":     p.contactTitle ?? "",
                "Contact Email":     p.contactEmail ?? "",
                "Contact Phone":     p.contactPhone ?? "",
                "Status":            p.engagement?.status ?? "",
                "Tier":              p.potentialTier ?? "",
                "Financial Amount":  p.engagement?.financialAmount ?? "",
                "Currency":          p.engagement?.currency ?? "",
                "Payment Status":    p.engagement?.paymentStatus ?? "",
                "Payment Due Date":  p.engagement?.paymentDueDate ?? "",
                "Package Type":      p.engagement?.packageType ?? "",
                "Historical":        p.historicalEngagement ?? "",
              })),
              `partners-${typeFilter === "All" ? "all" : typeFilter.toLowerCase()}`
            )}>
            <FileSpreadsheet className="h-4 w-4" /> Export XLSX
          </Button>
          <Button onClick={() => {
            setEditingPartner(null);
            setForm({
              ...BLANK,
              partnerType: typeFilter !== "All" ? typeFilter : "GovernmentPolicy",
            });
            setShowDialog(true);
          }}>
            <Plus className="h-4 w-4 mr-1.5" /> New partner
          </Button>
        </div>
      </div>

      {/* Partner type filter — only show types that have at least one partner */}
      <div className="flex flex-wrap gap-1.5">
        {(["All", ...PARTNER_TYPES] as const)
          .filter((t) => t === "All" || (partners ?? []).some((p) => p.partnerType === t))
          .map((t) => {
            const count = t === "All"
              ? (partners ?? []).length
              : (partners ?? []).filter((p) => p.partnerType === t).length;
            return (
              <button
                key={t}
                onClick={() => { setTypeFilter(t as PartnerType | "All"); }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  typeFilter === t
                    ? "bg-[var(--brand-primary)] text-white"
                    : "bg-[var(--brand-tint)] text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)]"
                }`}
              >
                {t === "All" ? "All" : PARTNER_TYPE_LABEL[t as PartnerType]}
                <span className={`text-[10px] px-1 rounded-full ${
                  typeFilter === t ? "bg-white/20" : "bg-[var(--brand-border)]"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
      </div>



      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(p) => p.id}
        loading={isLoading}
        emptyTitle={search ? "No partners match your search" : "No partners yet"}
        emptyBody={
          search ? undefined : "Add your first partner to track the pipeline."
        }
        emptyIcon={<Users />}
        emptyAction={
          !search ? (
            <Button size="sm" onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> New partner
            </Button>
          ) : undefined
        }
        toolbarLeft={
          <div className="flex items-center gap-2">
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--brand-text-secondary)]" />
              <Input
                placeholder="Search partners…"
                className="pl-8 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {pillars.length > 0 && (
              <Select value={pillarFilter} onValueChange={setPillarFilter}>
                <SelectTrigger className="h-8 text-sm w-[160px]">
                  <SelectValue placeholder="All pillars" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All pillars</SelectItem>
                  {pillars.map((pl) => (
                    <SelectItem key={pl.id} value={pl.id}>{pl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        }
        toolbarRight={
          <span className="text-xs text-[var(--brand-text-secondary)] whitespace-nowrap">
            {filtered.length} partner{filtered.length !== 1 ? "s" : ""}
          </span>
        }
      />

      {/* ── New / Edit partner modal ─────────────────────────────────────── */}
      <Modal
        open={showDialog}
        onClose={handleClose}
        title={isEditing ? "Edit partner" : "New partner"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={(e) => { void handleSubmit(e as unknown as React.FormEvent); }}
              disabled={!form.institutionName || isSaving}
            >
              {isSaving
                ? (isEditing ? "Saving…" : "Creating…")
                : (isEditing ? "Save changes" : "Create partner")}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-xs text-[var(--brand-text-secondary)]">
            Institution details are shared across convenings; stage, pillar, payment and package details apply only to this convening.
            An existing institution with the same name will be linked rather than duplicated.
          </p>

          {/* Error banner */}
          {createError && (
            <div className="flex gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {createError}
            </div>
          )}

          {/* ── Category + Pillar ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FL>Category</FL>
              <Select value={form.partnerType} onValueChange={(v) => set("partnerType", v as PartnerType)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTNER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PARTNER_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Thematic pillar</FL>
              <Select value={form.pillarId || "__none__"} onValueChange={(v) => set("pillarId", v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {pillars.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col leading-snug py-0.5">
                        <span>{p.name}</span>
                        {p.description && (
                          <span className="text-[11px]" style={{ color: "var(--brand-text-secondary)" }}>{p.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Institution ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FL>Institution name *</FL>
              <Input
                value={form.institutionName}
                onChange={(e) => set("institutionName", e.target.value)}
                placeholder="e.g. African Development Bank"
                required
              />
            </div>
            <div>
              <FL>Location</FL>
              <Input
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. Abidjan"
              />
            </div>
            <div>
              <FL>Prior engagement</FL>
              <Select
                value={form.historicalEngagement}
                onValueChange={(v) => set("historicalEngagement", v as HistoricalEngagement)}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes — prior relationship</SelectItem>
                  <SelectItem value="No">No — new contact</SelectItem>
                  <SelectItem value="Partial">Partial — some history</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <FL>Logo</FL>
              <div className="flex items-center gap-3">
                {/* Preview / placeholder */}
                <div className="flex-shrink-0 w-16 h-16 rounded-md border border-input bg-muted flex items-center justify-center overflow-hidden">
                  {form.logoUrl ? (
                    <img
                      src={projectObjectUrl(form.logoUrl, activeConveningId)}
                      alt="Partner logo"
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }}
                    />
                  ) : null}
                  <div className={`w-full h-full items-center justify-center text-muted-foreground ${form.logoUrl ? "hidden" : "flex"}`}>
                    <ImageOff className="w-6 h-6 opacity-40" />
                  </div>
                </div>
                {/* Controls */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 w-fit"
                    disabled={isUploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isUploadingLogo ? "Uploading…" : form.logoUrl ? "Replace image" : "Upload image"}
                  </Button>
                  {form.logoUrl && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 w-fit"
                      onClick={() => set("logoUrl", "")}
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Description ── */}
          <div>
            <FL>Description</FL>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief overview of the institution — who they are, what they do, and why they matter to the convening."
            />
          </div>

          <hr className="border-[var(--brand-border)]" />

          {/* ── Contact person ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FL>Contact name</FL>
              <Input
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="e.g. Jane Mwangi"
              />
            </div>
            <div>
              <FL>Contact title</FL>
              <Input
                value={form.contactTitle}
                onChange={(e) => set("contactTitle", e.target.value)}
                placeholder="e.g. Head of Partnerships"
              />
            </div>
            <div>
              <FL>Contact email</FL>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="e.g. j.mwangi@org.com"
              />
            </div>
            <div>
              <FL>Contact phone</FL>
              <Input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
                placeholder="e.g. +254 712 345 678"
              />
            </div>
          </div>

          {/* ── Additional principals ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <FL>Additional principals / contacts</FL>
              <button
                type="button"
                onClick={() => set("principals", [...form.principals, { ...BLANK_PRINCIPAL }])}
                className="text-[11px] font-semibold text-[var(--brand-primary)] hover:underline"
              >
                + Add person
              </button>
            </div>
            {form.principals.length === 0 && (
              <p className="text-xs text-[var(--brand-text-secondary)] italic">No additional contacts yet.</p>
            )}
            <div className="space-y-3">
              {form.principals.map((p, i) => (
                <div key={i} className="rounded-md border border-[var(--brand-border)] p-3 space-y-2 relative">
                  <button
                    type="button"
                    onClick={() => set("principals", form.principals.filter((_, j) => j !== i))}
                    className="absolute top-2 right-2 text-[var(--brand-text-secondary)] hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="grid grid-cols-2 gap-2 pr-4">
                    <div>
                      <FL>Name</FL>
                      <Input
                        value={p.name}
                        onChange={(e) => {
                          const next = [...form.principals];
                          next[i] = { ...next[i], name: e.target.value };
                          set("principals", next);
                        }}
                        placeholder="e.g. David Kamau"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <FL>Title</FL>
                      <Input
                        value={p.title}
                        onChange={(e) => {
                          const next = [...form.principals];
                          next[i] = { ...next[i], title: e.target.value };
                          set("principals", next);
                        }}
                        placeholder="e.g. CEO"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <FL>Email</FL>
                      <Input
                        type="email"
                        value={p.email}
                        onChange={(e) => {
                          const next = [...form.principals];
                          next[i] = { ...next[i], email: e.target.value };
                          set("principals", next);
                        }}
                        placeholder="email@org.com"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <FL>Phone</FL>
                      <Input
                        type="tel"
                        value={p.phone}
                        onChange={(e) => {
                          const next = [...form.principals];
                          next[i] = { ...next[i], phone: e.target.value };
                          set("principals", next);
                        }}
                        placeholder="+256 …"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <FL>LinkedIn</FL>
                      <Input
                        value={p.linkedin}
                        onChange={(e) => {
                          const next = [...form.principals];
                          next[i] = { ...next[i], linkedin: e.target.value };
                          set("principals", next);
                        }}
                        placeholder="https://linkedin.com/in/…"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-[var(--brand-border)]" />

          {/* ── Tier & Commitment ── */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FL>Tier</FL>
              <Select
                value={form.potentialTier}
                onValueChange={(v) => {
                  set("potentialTier", v);
                  set("packageName", "");
                }}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Commitment (amount)</FL>
              <Input
                type="number"
                min={0}
                value={form.financialAmount}
                onChange={(e) => set("financialAmount", e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <FL>Currency</FL>
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="UGX">UGX</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Payment ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FL>Payment status</FL>
              <Select value={form.paymentStatus} onValueChange={(v) => set("paymentStatus", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Unpaid">Unpaid</SelectItem>
                  <SelectItem value="PartiallyPaid">Partially paid</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Payment due date</FL>
              <Input
                type="date"
                value={form.paymentDueDate}
                onChange={(e) => set("paymentDueDate", e.target.value)}
              />
            </div>
          </div>

          {/* ── Outreach ── */}
          <div>
            <FL>Outreach stage</FL>
            <Select value={form.outreachStage} onValueChange={(v) => set("outreachStage", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NotStarted">Not Started</SelectItem>
                <SelectItem value="ContactMade">Contact Made</SelectItem>
                <SelectItem value="EmailSent">Email Sent</SelectItem>
                <SelectItem value="FollowUpRequired">Follow-up Required</SelectItem>
                <SelectItem value="MeetingScheduled">Meeting Scheduled</SelectItem>
                <SelectItem value="MeetingHeld">Meeting Held</SelectItem>
                <SelectItem value="ProposalSent">Proposal / Pack Sent</SelectItem>
                <SelectItem value="AwaitingDecision">Awaiting Decision</SelectItem>
                <SelectItem value="PartnershipConfirmed">Partnership Confirmed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <hr className="border-[var(--brand-border)]" />

          {/* ── Package ── */}
          <div className="space-y-3">
            <div>
              <FL>Package type</FL>
              <div className="flex gap-2">
                {(["Standard", "Custom", ""] as const).map((pt) => (
                  <button
                    key={pt === "" ? "none" : pt}
                    type="button"
                    onClick={() => {
                      set("packageType", pt);
                      if (pt === "Standard" && stdOptions[0]) set("packageName", stdOptions[0]);
                      if (pt !== "Standard") set("packageName", "");
                    }}
                    className={[
                      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      form.packageType === pt
                        ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                        : "bg-white text-[var(--brand-text-secondary)] border-[var(--brand-border)] hover:border-[var(--brand-primary)]",
                    ].join(" ")}
                  >
                    {pt === "" ? "None" : pt}
                  </button>
                ))}
              </div>
            </div>

            {form.packageType === "Standard" && stdOptions.length > 0 && (
              <div>
                <FL>Package name</FL>
                <Select value={form.packageName} onValueChange={(v) => set("packageName", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select package…" /></SelectTrigger>
                  <SelectContent>
                    {stdOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.packageType === "Custom" && (
              <div>
                <FL>Package name</FL>
                <Input
                  value={form.packageName}
                  onChange={(e) => set("packageName", e.target.value)}
                  placeholder="e.g. Bespoke Presenting Partner"
                />
              </div>
            )}

            {form.packageType && (
              <div>
                <FL>Package benefits</FL>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={2}
                  value={form.packageBenefits}
                  onChange={(e) => set("packageBenefits", e.target.value)}
                  placeholder="e.g. Logo on stage backdrop, 4 delegate passes, fireside slot"
                />
              </div>
            )}
          </div>

          <hr className="border-[var(--brand-border)]" />

          {/* ── Strategic notes ── */}
          <div className="space-y-3">
            <div>
              <FL>Why this partner? (fit with us)</FL>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                rows={3}
                value={form.fitWithThem}
                onChange={(e) => set("fitWithThem", e.target.value)}
                placeholder="How does this partner align with the convening's goals? What do they bring?"
              />
            </div>
            <div>
              <FL>Historical notes</FL>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                rows={3}
                value={form.historicalNotes}
                onChange={(e) => set("historicalNotes", e.target.value)}
                placeholder="Past interactions, outstanding issues, context from previous convenings…"
              />
            </div>
          </div>

        </form>
      </Modal>
    </div>
  );
}
