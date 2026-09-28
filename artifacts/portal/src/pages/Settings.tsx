import { useState, useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import {
  useGetMe,
  useListUsers,
  useUpdateUser,
  useListConvenings,
  useCreateConvening,
  useCloneConvening,
  useUpdateConvening,
  useDeleteConvening,
  type DeleteConvening409,
  useListSponsorshipPackages,
  useCreateSponsorshipPackage,
  useUpdateSponsorshipPackage,
  useDeleteSponsorshipPackage,
  useListPassTypeConfigs,
  useCreatePassTypeConfig,
  useUpdatePassTypeConfig,
  useDeletePassTypeConfig,
  useCopyPassTypeConfigs,
  useGetDelegateExportSchedule,
  usePutDelegateExportSchedule,
  useListInvites,
  useResendInvite,
  useListPillars,
  useCreatePillar,
  useUpdatePillar,
  useDeletePillar,
  getListUsersQueryKey,
  getListConveningsQueryKey,
  getListSponsorshipPackagesQueryKey,
  getListPassTypeConfigsQueryKey,
  getGetConveningQueryKey,
  getGetDelegateExportScheduleQueryKey,
  getListInvitesQueryKey,
  getListPillarsQueryKey,
  type Convening,
  type SponsorshipPackage,
  type PassTypeConfig,
  type InviteRecord,
  type Pillar,
} from "@workspace/api-client-react";
import type { PortalUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useConvening } from "@/contexts/ConveningContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { label as labelFn } from "@/lib/labels";
import { ALL_PASS_TYPES } from "@/lib/passTypes";
import {
  Building2, Palette, Users, Package, Ticket, Plus,
  Pencil, Trash2, Copy, Save, ShieldAlert, Check, UserPlus, Mail, Inbox, X, Clock,
  Loader2, Link2, RefreshCw, KeyRound, Sheet, ExternalLink, Layers,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES = ["Admin", "Curator", "Finance", "PartnerLead", "SpeakerLead", "Ops", "PressManager", "Advisor", "Client"] as const;
type Role = typeof ROLES[number];

const TIERS = ["Platinum", "Gold", "Silver", "CredibilityOnly", "InKind"] as const;

const TIMEZONES = [
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Dar_es_Salaam",
  "Africa/Addis_Ababa",
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Kigali",
  "Africa/Lusaka",
  "UTC",
];

// Section access: which roles can VIEW each section
const SECTION_VIEW: Record<string, Role[]> = {
  convening:        ["Admin", "Curator", "Finance", "PartnerLead", "SpeakerLead", "Ops", "PressManager", "Advisor"],
  branding:         ["Admin"],
  sponsorships:     ["Admin", "Finance", "PartnerLead"],
  passTypes:        ["Admin", "Ops", "Finance"],
  pillars:          ["Admin", "PartnerLead", "Curator"],
  users:            ["Admin"],
  convenings:       ["Admin"],
  "access-requests": ["Admin"],
  "partner-access": ["Admin"],
  "delegate-exports": ["Admin", "Finance"],
  "google-sheets":    ["Admin"],
};

// Section edit: which roles can EDIT each section (subset of view)
const SECTION_EDIT: Record<string, Role[]> = {
  convening:        ["Admin"],
  branding:         ["Admin"],
  sponsorships:     ["Admin", "Finance", "PartnerLead"],
  passTypes:        ["Admin", "Ops", "Finance"],
  pillars:          ["Admin", "PartnerLead", "Curator"],
  users:            ["Admin"],
  convenings:       ["Admin"],
  "access-requests": ["Admin"],
  "partner-access": ["Admin"],
  "delegate-exports": ["Admin", "Finance"],
  "google-sheets":    ["Admin"],
};

// ── Tonal tokens ──────────────────────────────────────────────────────────────

const ROLE_TONAL: Record<string, { bg: string; color: string }> = {
  Admin:        { bg: "#EFF6FF", color: "#1D4ED8" },
  Curator:      { bg: "#F5F3FF", color: "#6D28D9" },
  Finance:      { bg: "#EFF6FF", color: "#1E40AF" },
  PartnerLead:  { bg: "#FFFBEB", color: "#B45309" },
  SpeakerLead:  { bg: "#ECFDF5", color: "#059669" },
  Ops:          { bg: "#F1F5F9", color: "#475569" },
  PressManager: { bg: "#FFF1F2", color: "#BE123C" },
  Advisor:      { bg: "#F0FDF4", color: "#166534" },
  Client:       { bg: "#F8FAFC", color: "#94A3B8" },
};

const TIER_TONAL: Record<string, { bg: string; color: string }> = {
  Platinum:       { bg: "#F1F5F9", color: "#334155" },
  Gold:           { bg: "#FFFBEB", color: "#B45309" },
  Silver:         { bg: "#F8FAFC", color: "#64748B" },
  CredibilityOnly:{ bg: "#F5F3FF", color: "#6D28D9" },
  InKind:         { bg: "#ECFDF5", color: "#059669" },
};

const PASS_TONAL: Record<string, { bg: string; color: string }> = {
  Paid:        { bg: "#E6F1FB", color: "#0C447C" },
  EarlyBird:   { bg: "#E1F5EE", color: "#0F6E56" },
  Standard:    { bg: "#EAF0FB", color: "#2356A5" },
  Late:        { bg: "#FEF3E2", color: "#B45309" },
  VIP:         { bg: "#FBF3E2", color: "#8A6516" },
  FreeSponsor: { bg: "#EEE6F8", color: "#5E35B1" },
  FreeComp:    { bg: "#F1EFE8", color: "#5A6472" },
  Speaker:     { bg: "#E2F4F2", color: "#0D6B5E" },
  Press:       { bg: "#EEF2F5", color: "#3D5A73" },
  Official:    { bg: "#E8ECF4", color: "#2B4070" },
};

// ── Shared DS primitives ──────────────────────────────────────────────────────

const HL = "0.5px solid #E3E8EE";

function FL({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1">
      {children}
    </label>
  );
}

function TonalBadge({ text, tonal }: { text: string; tonal?: { bg: string; color: string } }) {
  return (
    <span style={{
      background: tonal?.bg ?? "#F1F5F9",
      color: tonal?.color ?? "#475569",
      fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 6,
      display: "inline-block", lineHeight: 1.6,
    }}>
      {text}
    </span>
  );
}

function SectionCard({ title, sub, canEdit, action, children }: {
  title: string; sub?: string;
  canEdit?: boolean; action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] bg-white" style={{ border: HL }}>
      <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: HL }}>
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--brand-ink)]">{title}</h2>
          {sub && <p className="text-[12px] text-[var(--brand-text-secondary)] mt-0.5">{sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!canEdit && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] px-2 py-1 rounded bg-[#F6F8FB]">
              Read-only
            </span>
          )}
          {action}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function SkeletonRows({ cols = 5, rows = 3 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} style={{ height: 44, borderBottom: HL }}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4">
              <div className="h-3 rounded bg-[#E3E8EE] animate-pulse" style={{ width: j === 0 ? "55%" : "35%" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function SaveRow({ onSave, saving, saved }: { onSave: () => void; saving: boolean; saved: boolean }) {
  return (
    <div className="flex justify-end pt-4" style={{ borderTop: HL }}>
      <Button size="sm" onClick={onSave} disabled={saving} className="gap-2 min-w-28">
        {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
      </Button>
    </div>
  );
}

// ── Convening Details section ─────────────────────────────────────────────────

function ConveningSection({ convening, canEdit, onSaved }: {
  convening: Convening; canEdit: boolean; onSaved: () => void;
}) {
  const updateConvening = useUpdateConvening();
  const [form, setForm] = useState({
    name:               convening.name,
    theme:              convening.theme ?? "",
    startDate:          convening.startDate ?? "",
    endDate:            convening.endDate ?? "",
    venueName:          convening.venueName ?? "",
    venueConfirmed:     convening.venueConfirmed,
    status:             convening.status,
    timezone:           convening.timezone ?? "Africa/Kampala",
    usdToUgxRate:       convening.usdToUgxRate != null ? String(convening.usdToUgxRate) : "",
    registrationTarget: convening.registrationTarget != null ? String(convening.registrationTarget) : "0",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      name:               convening.name,
      theme:              convening.theme ?? "",
      startDate:          convening.startDate ?? "",
      endDate:            convening.endDate ?? "",
      venueName:          convening.venueName ?? "",
      venueConfirmed:     convening.venueConfirmed,
      status:             convening.status,
      timezone:           convening.timezone ?? "Africa/Kampala",
      usdToUgxRate:       convening.usdToUgxRate != null ? String(convening.usdToUgxRate) : "",
      registrationTarget: convening.registrationTarget != null ? String(convening.registrationTarget) : "0",
    });
  }, [convening.id]);

  function set(k: string, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function save() {
    await updateConvening.mutateAsync({
      id: convening.id,
      data: {
        name: form.name,
        theme: form.theme || undefined,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        venueName: form.venueName || null,
        venueConfirmed: form.venueConfirmed,
        status: form.status as Convening["status"],
        timezone: form.timezone,
        usdToUgxRate: form.usdToUgxRate ? parseFloat(form.usdToUgxRate) : null,
        registrationTarget: parseInt(form.registrationTarget) || 0,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  const fields = (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <FL>Name</FL>
        <Input className="h-9 text-sm" value={form.name} disabled={!canEdit}
          onChange={e => set("name", e.target.value)} />
      </div>
      <div className="col-span-2">
        <FL>Theme</FL>
        <Input className="h-9 text-sm" placeholder="e.g. Financing Africa's Future"
          value={form.theme} disabled={!canEdit}
          onChange={e => set("theme", e.target.value)} />
      </div>
      <div>
        <FL>Start date</FL>
        <Input className="h-9 text-sm" type="date" value={form.startDate} disabled={!canEdit}
          onChange={e => set("startDate", e.target.value)} />
      </div>
      <div>
        <FL>End date</FL>
        <Input className="h-9 text-sm" type="date" value={form.endDate} disabled={!canEdit}
          onChange={e => set("endDate", e.target.value)} />
      </div>
      <div>
        <FL>Venue</FL>
        <Input className="h-9 text-sm" placeholder="e.g. Serena Hotel, Nairobi"
          value={form.venueName} disabled={!canEdit}
          onChange={e => set("venueName", e.target.value)} />
      </div>
      <div>
        <FL>Status</FL>
        <Select value={form.status} onValueChange={v => set("status", v)} disabled={!canEdit}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Planning", "Active", "Completed", "Archived"].map(s => (
              <SelectItem key={s} value={s}>{labelFn(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FL>Timezone</FL>
        <Select value={form.timezone} onValueChange={v => set("timezone", v)} disabled={!canEdit}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIMEZONES.map(tz => (
              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FL>USD → UGX rate</FL>
        <div className="flex items-center gap-2">
          <Input className="h-9 text-sm" type="number" min={1} placeholder="e.g. 3700"
            value={form.usdToUgxRate} disabled={!canEdit}
            onChange={e => set("usdToUgxRate", e.target.value)} />
          <span className="text-[12px] text-[var(--brand-text-secondary)] shrink-0">UGX</span>
        </div>
      </div>
      <div>
        <FL>Registration target</FL>
        <Input className="h-9 text-sm" type="number" min={0}
          value={form.registrationTarget} disabled={!canEdit}
          onChange={e => set("registrationTarget", e.target.value)} />
      </div>
      <div className="col-span-2 flex items-center gap-3 pt-1">
        <Switch
          checked={form.venueConfirmed}
          onCheckedChange={v => set("venueConfirmed", v)}
          disabled={!canEdit}
        />
        <span className="text-[13px] text-[var(--brand-ink)]">Venue confirmed</span>
      </div>
    </div>
  );

  return (
    <SectionCard title="Convening details"
      sub="Core logistics for the active convening"
      canEdit={canEdit}>
      {fields}
      {canEdit && (
        <SaveRow onSave={save} saving={updateConvening.isPending} saved={saved} />
      )}
    </SectionCard>
  );
}

// ── Branding / white-label section ────────────────────────────────────────────

function BrandingSection({ convening, onSaved }: { convening: Convening; onSaved: () => void }) {
  const updateConvening = useUpdateConvening();
  const [form, setForm] = useState({
    whiteLabel:        convening.whiteLabel,
    brandLogoUrl:      convening.brandLogoUrl ?? "",
    brandPrimaryColor: convening.brandPrimaryColor ?? "#2A6FB0",
    brandAccentColor:  convening.brandAccentColor  ?? "#1B9DD9",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      whiteLabel:        convening.whiteLabel,
      brandLogoUrl:      convening.brandLogoUrl ?? "",
      brandPrimaryColor: convening.brandPrimaryColor ?? "#2A6FB0",
      brandAccentColor:  convening.brandAccentColor  ?? "#1B9DD9",
    });
  }, [convening.id]);

  function set(k: string, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function save() {
    await updateConvening.mutateAsync({
      id: convening.id,
      data: {
        whiteLabel:        form.whiteLabel,
        brandLogoUrl:      form.brandLogoUrl || null,
        brandPrimaryColor: form.brandPrimaryColor || null,
        brandAccentColor:  form.brandAccentColor  || null,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  return (
    <SectionCard title="White-label & branding"
      sub="Override portal colours and logo for this convening"
      canEdit>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Switch checked={form.whiteLabel} onCheckedChange={v => set("whiteLabel", v)} />
          <div>
            <p className="text-[13px] font-medium text-[var(--brand-ink)]">White-label mode</p>
            <p className="text-[11px] text-[var(--brand-text-secondary)]">
              Shows custom logo and colours instead of the Mkutano defaults
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <FL>Logo URL</FL>
            <Input className="h-9 text-sm" placeholder="https://cdn.example.com/logo.svg"
              value={form.brandLogoUrl} onChange={e => set("brandLogoUrl", e.target.value)} />
          </div>
          <div>
            <FL>Primary colour</FL>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.brandPrimaryColor}
                onChange={e => set("brandPrimaryColor", e.target.value)}
                className="h-9 w-12 rounded border cursor-pointer p-0.5"
                style={{ border: HL }}
              />
              <Input className="h-9 text-sm font-mono flex-1"
                value={form.brandPrimaryColor}
                onChange={e => set("brandPrimaryColor", e.target.value)}
                placeholder="#2A6FB0" />
            </div>
          </div>
          <div>
            <FL>Accent colour</FL>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.brandAccentColor}
                onChange={e => set("brandAccentColor", e.target.value)}
                className="h-9 w-12 rounded border cursor-pointer p-0.5"
                style={{ border: HL }}
              />
              <Input className="h-9 text-sm font-mono flex-1"
                value={form.brandAccentColor}
                onChange={e => set("brandAccentColor", e.target.value)}
                placeholder="#1B9DD9" />
            </div>
          </div>
        </div>

        {form.whiteLabel && form.brandLogoUrl && (
          <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: "#F6F8FB", border: HL }}>
            <img src={form.brandLogoUrl} alt="Logo preview"
              className="h-8 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span className="text-[11px] text-[var(--brand-text-secondary)]">Logo preview</span>
          </div>
        )}
      </div>
      <SaveRow onSave={save} saving={updateConvening.isPending} saved={saved} />
    </SectionCard>
  );
}

// ── Sponsorship packages section ───────────────────────────────────────────────

type PkgForm = { tier: string; price: string; slots: string; description: string; perks: string };
const emptyPkg = (): PkgForm => ({ tier: "Platinum", price: "", slots: "0", description: "", perks: "" });

function SponsorshipsSection({ conveningId, canEdit }: { conveningId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const params = { conveningId };
  const { data: packages = [], isLoading } = useListSponsorshipPackages(params, {
    query: { queryKey: getListSponsorshipPackagesQueryKey(params) },
  });
  const create = useCreateSponsorshipPackage();
  const update = useUpdateSponsorshipPackage();
  const del    = useDeleteSponsorshipPackage();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorshipPackage | null>(null);
  const [form, setForm] = useState<PkgForm>(emptyPkg());

  function inv() { qc.invalidateQueries({ queryKey: getListSponsorshipPackagesQueryKey(params) }); }

  function openAdd() { setEditing(null); setForm(emptyPkg()); setDialogOpen(true); }
  function openEdit(p: SponsorshipPackage) {
    setEditing(p);
    setForm({
      tier:        p.tier,
      price:       p.price != null ? String(p.price) : "",
      slots:       String(p.slots),
      description: p.description ?? "",
      perks:       (p.perks as string[]).join("\n"),
    });
    setDialogOpen(true);
  }

  async function save() {
    const perks = form.perks.split("\n").map(s => s.trim()).filter(Boolean);
    const data = {
      tier:        form.tier as SponsorshipPackage["tier"],
      price:       form.price ? parseFloat(form.price) : 0,
      slots:       parseInt(form.slots) || 0,
      description: form.description || undefined,
      perks,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, data });
    } else {
      await create.mutateAsync({ data: { conveningId, ...data } });
    }
    setDialogOpen(false);
    inv();
  }

  async function remove(id: string) {
    if (!confirm("Delete this sponsorship package?")) return;
    await del.mutateAsync({ id });
    inv();
  }

  const isSaving = create.isPending || update.isPending;

  return (
    <SectionCard
      title="Sponsorship packages"
      sub="Define per-tier pricing, slot caps, and partner perks"
      canEdit={canEdit}
      action={canEdit ? (
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add package
        </Button>
      ) : undefined}
    >
      <div className="overflow-hidden" style={{ border: HL, borderRadius: 8 }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ height: 36, borderBottom: HL, background: "#F6F8FB" }}>
              {["Tier", "Price", "Slots", "Description", "Perks", ""].map((h, i) => (
                <th key={i} className={`px-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] ${i >= 1 ? "text-right" : "text-left"} ${i === 5 ? "w-16" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? <SkeletonRows cols={6} rows={3} /> :
             packages.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-[var(--brand-text-secondary)]">
                  No packages yet — add one for each sponsor tier.
                </td>
              </tr>
            ) : packages.map((p, i) => (
              <tr key={p.id} className="group transition-colors"
                style={{ height: 44, borderBottom: i < packages.length - 1 ? HL : "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#EEF3F9")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <td className="px-4">
                  <TonalBadge text={labelFn(p.tier)} tonal={TIER_TONAL[p.tier]} />
                </td>
                <td className="px-4 text-right font-medium text-[var(--brand-ink)] tabular-nums">
                  {Number(p.price) > 0 ? formatMoney(Number(p.price), "USD") : "—"}
                </td>
                <td className="px-4 text-right text-[var(--brand-text-secondary)]">
                  {p.slots === 0 ? "∞" : p.slots}
                </td>
                <td className="px-4 text-[var(--brand-text-secondary)] max-w-[200px] truncate">
                  {p.description ?? "—"}
                </td>
                <td className="px-4 text-[var(--brand-text-secondary)]">
                  {(p.perks as string[]).length > 0
                    ? <span className="text-[11px]">{(p.perks as string[]).length} perks</span>
                    : <span className="opacity-30">—</span>}
                </td>
                <td className="px-3">
                  {canEdit && (
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(p)}
                        className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-white transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(p.id)}
                        className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-red-600 hover:bg-white transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
              {editing ? "Edit package" : "Add sponsorship package"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <FL>Tier</FL>
              <Select value={form.tier} onValueChange={v => setForm(f => ({ ...f, tier: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map(t => <SelectItem key={t} value={t}>{labelFn(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FL>Price (USD)</FL>
                <Input className="h-9 text-sm" type="number" min={0} placeholder="0"
                  value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div>
                <FL>Slots (0 = unlimited)</FL>
                <Input className="h-9 text-sm" type="number" min={0}
                  value={form.slots} onChange={e => setForm(f => ({ ...f, slots: e.target.value }))} />
              </div>
            </div>
            <div>
              <FL>Description</FL>
              <Input className="h-9 text-sm" placeholder="Brief description for this tier"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <FL>Perks (one per line)</FL>
              <textarea
                className="w-full rounded-md border text-sm px-3 py-2 min-h-[80px] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] resize-none"
                style={{ border: HL }}
                placeholder={"Logo on all materials\nVIP table for 4\nBackdrop branding"}
                value={form.perks}
                onChange={e => setForm(f => ({ ...f, perks: e.target.value }))}
              />
              <p className="text-[10px] text-[var(--brand-text-secondary)] mt-0.5">Each line becomes one perk bullet</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={isSaving}>
              {isSaving ? "Saving…" : editing ? "Save changes" : "Add package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ── Pass types section ────────────────────────────────────────────────────────

type PtRow = { label: string; price: string; capacity: string; description: string };

const emptyPtRow = (): PtRow => ({ label: "", price: "", capacity: "0", description: "" });

function rowFromConfig(c: PassTypeConfig): PtRow {
  return {
    label:       c.label,
    price:       c.price != null ? String(c.price) : "",
    capacity:    String(c.capacity),
    description: c.description ?? "",
  };
}

// ── Copy diff helper ──────────────────────────────────────────────────────────

function DiffCell({ before, after }: { before: string; after: string }) {
  if (!before) return <span className="font-medium" style={{ color: "#065F46" }}>{after || "—"}</span>;
  if (before === after) return <span style={{ color: "var(--brand-ink)" }}>{after || "—"}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="line-through opacity-50" style={{ color: "var(--brand-text-secondary)" }}>{before || "—"}</span>
      <span className="font-medium" style={{ color: "#065F46" }}>{after || "—"}</span>
    </span>
  );
}

function PassTypesSection({ conveningId, canEdit }: { conveningId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const params = { conveningId };
  const { data: configs = [], isLoading } = useListPassTypeConfigs(params, {
    query: { queryKey: getListPassTypeConfigsQueryKey(params) },
  });
  const create   = useCreatePassTypeConfig();
  const update   = useUpdatePassTypeConfig();
  const del      = useDeletePassTypeConfig();
  const copyFrom = useCopyPassTypeConfigs();

  const { data: allConvenings = [] } = useListConvenings({
    query: { queryKey: getListConveningsQueryKey() },
  });
  const otherConvenings = allConvenings.filter(c => c.id !== conveningId);

  const defaultRows = (): Record<string, PtRow> =>
    Object.fromEntries(ALL_PASS_TYPES.map(pt => [pt, emptyPtRow()]));

  const [rows, setRows] = useState<Record<string, PtRow>>(defaultRows);
  const [dirtyTypes, setDirtyTypes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [sourceConveningId, setSourceConveningId] = useState("");
  const [previewStep, setPreviewStep] = useState<"select" | "preview">("select");
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function handleCopyFrom() {
    if (!sourceConveningId) return;
    setCopying(true);
    setCopyError(null);
    try {
      await copyFrom.mutateAsync({ data: { sourceConveningId, targetConveningId: conveningId } });
      void qc.invalidateQueries({ queryKey: getListPassTypeConfigsQueryKey(params) });
      setCopyDialogOpen(false);
      setSourceConveningId("");
      setPreviewStep("select");
    } catch {
      setCopyError("Copy failed — please try again.");
      setPreviewStep("select");
    } finally {
      setCopying(false);
    }
  }

  const configMap = useMemo(() => {
    const m = new Map<string, PassTypeConfig>();
    for (const c of configs) m.set(c.passType, c);
    return m;
  }, [configs]);

  // Source convening configs — loaded for copy preview
  const srcParams = { conveningId: sourceConveningId };
  const { data: sourcePassConfigs = [], isFetching: previewLoading } = useListPassTypeConfigs(
    srcParams,
    { query: { enabled: !!sourceConveningId, queryKey: getListPassTypeConfigsQueryKey(srcParams) } },
  );

  type DiffKind = "new" | "update" | "unchanged";
  interface DiffRow { passType: string; kind: DiffKind; before: PtRow | null; after: PtRow }

  const diffRows = useMemo((): DiffRow[] => {
    if (!sourceConveningId) return [];
    return sourcePassConfigs.map(src => {
      const current = configMap.get(src.passType);
      const after  = rowFromConfig(src);
      const before = current ? rowFromConfig(current) : null;
      const hasChange = !current || (
        current.label !== src.label ||
        Number(current.price  ?? 0) !== Number(src.price  ?? 0) ||
        Number(current.capacity ?? 0) !== Number(src.capacity ?? 0) ||
        (current.description ?? "") !== (src.description ?? "")
      );
      return { passType: src.passType, kind: !current ? "new" : hasChange ? "update" : "unchanged", before, after };
    });
  }, [sourceConveningId, sourcePassConfigs, configMap]);

  useEffect(() => {
    if (isLoading) return;
    setRows(Object.fromEntries(
      ALL_PASS_TYPES.map(pt => {
        const c = configMap.get(pt);
        return [pt, c ? rowFromConfig(c) : emptyPtRow()];
      })
    ));
    setDirtyTypes(new Set());
  }, [configs, isLoading]);

  function setCell(pt: string, key: keyof PtRow, value: string) {
    setRows(prev => ({ ...prev, [pt]: { ...prev[pt], [key]: value } }));
    setDirtyTypes(prev => new Set([...prev, pt]));
    setSaved(false);
  }

  async function handleSave() {
    if (dirtyTypes.size === 0) return;
    setSaving(true);
    try {
      await Promise.all([...dirtyTypes].map(async pt => {
        const row = rows[pt];
        if (!row?.label) return;
        const baseData = {
          label:       row.label,
          price:       row.price ? parseFloat(row.price) : 0,
          capacity:    parseInt(row.capacity) || 0,
          description: row.description || undefined,
        };
        const existing = configMap.get(pt);
        if (existing) {
          await update.mutateAsync({ id: existing.id, data: baseData });
        } else {
          const passType = pt as PassTypeConfig["passType"];
          await create.mutateAsync({ data: { conveningId, passType, ...baseData } });
        }
      }));
      void qc.invalidateQueries({ queryKey: getListPassTypeConfigsQueryKey(params) });
      setDirtyTypes(new Set());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(pt: string) {
    const existing = configMap.get(pt);
    if (!existing) return;
    if (!confirm(`Remove configuration for ${labelFn(pt)}?`)) return;
    await del.mutateAsync({ id: existing.id });
    void qc.invalidateQueries({ queryKey: getListPassTypeConfigsQueryKey(params) });
  }

  const hasDirty = dirtyTypes.size > 0;

  return (
    <>
    <SectionCard
      title="Pass types"
      sub="Set capacity limits and pricing for each of the 10 delegate pass types — capacity drives the utilisation bar on the Delegates page"
      canEdit={canEdit}
      action={canEdit && otherConvenings.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-[12px]"
          onClick={() => { setSourceConveningId(""); setCopyError(null); setCopyDialogOpen(true); }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy from…
        </Button>
      ) : undefined}
    >
      <div className="overflow-hidden" style={{ border: HL, borderRadius: 8 }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ height: 36, borderBottom: HL, background: "#F6F8FB" }}>
              {["Pass type", "Display label", "Price (USD)", "Capacity", ""].map((h, i) => (
                <th
                  key={i}
                  className={`px-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] ${i >= 2 && i < 4 ? "text-right" : "text-left"} ${i === 4 ? "w-14" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? <SkeletonRows cols={5} rows={5} /> : ALL_PASS_TYPES.map((pt, i) => {
              const row        = rows[pt] ?? emptyPtRow();
              const existing   = configMap.get(pt);
              const isDirty    = dirtyTypes.has(pt);
              const configured = !!existing;
              const tonal      = PASS_TONAL[pt] ?? { bg: "#F1EFE8", color: "#5A6472" };

              return (
                <tr
                  key={pt}
                  style={{
                    height: 52,
                    borderBottom: i < ALL_PASS_TYPES.length - 1 ? HL : "none",
                    background: isDirty ? "#FAFBFE" : undefined,
                    transition: "background 0.15s",
                  }}
                >
                  <td className="px-4 w-36">
                    <div className="flex items-center gap-2">
                      <span style={{
                        background: tonal.bg, color: tonal.color,
                        fontSize: 11, fontWeight: 600,
                        padding: "2px 8px", borderRadius: 6,
                        display: "inline-block", lineHeight: 1.6, whiteSpace: "nowrap",
                      }}>
                        {labelFn(pt)}
                      </span>
                      {configured && (
                        <span
                          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                          style={{ background: "#34D399" }}
                          title="Configured"
                        />
                      )}
                    </div>
                  </td>

                  <td className="px-4">
                    {canEdit ? (
                      <Input
                        className="h-8 text-[12px] w-44"
                        placeholder="e.g. Full delegate pass"
                        value={row.label}
                        onChange={e => setCell(pt, "label", e.target.value)}
                      />
                    ) : (
                      <span className="text-[var(--brand-ink)]">{row.label || "—"}</span>
                    )}
                  </td>

                  <td className="px-4 text-right">
                    {canEdit ? (
                      <Input
                        className="h-8 text-[12px] w-24 text-right tabular-nums ml-auto"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={row.price}
                        onChange={e => setCell(pt, "price", e.target.value)}
                      />
                    ) : (
                      <span className="tabular-nums text-[var(--brand-ink)]">
                        {Number(row.price) > 0 ? formatMoney(Number(row.price), "USD") : "Free"}
                      </span>
                    )}
                  </td>

                  <td className="px-4 text-right">
                    {canEdit ? (
                      <Input
                        className="h-8 text-[12px] w-24 text-right tabular-nums ml-auto"
                        type="number"
                        min={0}
                        value={row.capacity}
                        onChange={e => setCell(pt, "capacity", e.target.value)}
                      />
                    ) : (
                      <span className="tabular-nums text-[var(--brand-text-secondary)]">
                        {row.capacity === "0" ? "∞" : row.capacity}
                      </span>
                    )}
                  </td>

                  <td className="px-3 text-right">
                    {canEdit && configured && (
                      <button
                        onClick={() => handleRemove(pt)}
                        className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove configuration"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex items-center justify-between pt-4" style={{ borderTop: HL }}>
          <p className="text-[11px] text-[var(--brand-text-secondary)]">
            {hasDirty
              ? `${dirtyTypes.size} row${dirtyTypes.size > 1 ? "s" : ""} modified — fill in a label to save`
              : "Set a label on any row to activate it"}
          </p>
          <Button size="sm" onClick={handleSave} disabled={saving || !hasDirty} className="gap-2 min-w-28">
            {saved && !hasDirty ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : saved && !hasDirty ? "Saved!" : "Save changes"}
          </Button>
        </div>
      )}
    </SectionCard>

    <Dialog
      open={copyDialogOpen}
      onOpenChange={open => {
        if (!open) {
          setCopyDialogOpen(false);
          setSourceConveningId("");
          setCopyError(null);
          setPreviewStep("select");
        }
      }}
    >
      <DialogContent className={previewStep === "preview" ? "max-w-3xl" : "max-w-sm"}>
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {previewStep === "select" ? "Copy pass type configs" : "Preview changes"}
          </DialogTitle>
        </DialogHeader>

        {previewStep === "select" ? (
          /* ── Step 1: pick source convening ─────────────────────────────── */
          <>
            <div className="space-y-4 pt-1">
              <p className="text-[13px] text-[var(--brand-text-secondary)]">
                Select a convening to copy its pass type labels, prices, and capacities into this one. You'll see exactly what will change before anything is applied.
              </p>
              <div>
                <label className="text-[11px] font-semibold text-[var(--brand-text-secondary)] uppercase tracking-[0.07em] block mb-1.5">
                  Copy from
                </label>
                <Select
                  value={sourceConveningId || "__placeholder__"}
                  onValueChange={v => setSourceConveningId(v === "__placeholder__" ? "" : v)}
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Select a convening…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__placeholder__" disabled>Select a convening…</SelectItem>
                    {otherConvenings.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.startDate ? ` · ${c.startDate.slice(0, 4)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {copyError && <p className="text-[12px] text-red-600">{copyError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => setPreviewStep("preview")}
                disabled={!sourceConveningId || previewLoading}
                className="gap-1.5"
              >
                {previewLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Copy className="h-3.5 w-3.5" />}
                {previewLoading ? "Loading…" : "Preview changes →"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Step 2: diff preview ───────────────────────────────────────── */
          <>
            <div className="pt-1 space-y-3">
              {/* Summary chips */}
              {diffRows.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  {(() => {
                    const nNew  = diffRows.filter(r => r.kind === "new").length;
                    const nUpd  = diffRows.filter(r => r.kind === "update").length;
                    const nSame = diffRows.filter(r => r.kind === "unchanged").length;
                    return (
                      <>
                        {nNew  > 0 && <span style={{ background: "#D1FAE5", color: "#065F46", fontWeight: 700, fontSize: 11, padding: "3px 8px", borderRadius: 6 }}>{nNew} new</span>}
                        {nUpd  > 0 && <span style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 700, fontSize: 11, padding: "3px 8px", borderRadius: 6 }}>{nUpd} updated</span>}
                        {nSame > 0 && <span style={{ background: "#F1F5F9", color: "#94A3B8", fontWeight: 600, fontSize: 11, padding: "3px 8px", borderRadius: 6 }}>{nSame} unchanged</span>}
                        {nNew === 0 && nUpd === 0 && (
                          <span className="text-[var(--brand-text-secondary)]">No changes — source configs match this convening.</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Diff table */}
              <div className="overflow-auto rounded-lg" style={{ border: HL, maxHeight: 360 }}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ height: 32, background: "#F6F8FB", borderBottom: HL, position: "sticky", top: 0 }}>
                      {["Pass type", "Change", "Label", "Price (USD)", "Capacity"].map((h, i) => (
                        <th
                          key={h}
                          className={`px-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] ${i >= 3 ? "text-right" : "text-left"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {diffRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-[12px] text-[var(--brand-text-secondary)]">
                          The selected convening has no pass type configs to copy.
                        </td>
                      </tr>
                    ) : diffRows.map((row, i) => {
                      const tonal = PASS_TONAL[row.passType] ?? { bg: "#F1EFE8", color: "#5A6472" };
                      const rowBg = row.kind === "new" ? "#F0FDF4" : row.kind === "update" ? "#FFFBEB" : "transparent";
                      const beforePrice = row.before
                        ? (Number(row.before.price) > 0 ? formatMoney(Number(row.before.price), "USD") : "Free")
                        : "";
                      const afterPrice = Number(row.after.price) > 0 ? formatMoney(Number(row.after.price), "USD") : "Free";
                      const beforeCap = row.before ? (row.before.capacity === "0" ? "∞" : row.before.capacity) : "";
                      const afterCap  = row.after.capacity === "0" ? "∞" : row.after.capacity;
                      return (
                        <tr
                          key={row.passType}
                          style={{ borderBottom: i < diffRows.length - 1 ? HL : "none", background: rowBg }}
                        >
                          <td className="px-3 py-2">
                            <TonalBadge text={labelFn(row.passType)} tonal={tonal} />
                          </td>
                          <td className="px-3 py-2">
                            {row.kind === "new" ? (
                              <span style={{ background: "#D1FAE5", color: "#065F46", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>NEW</span>
                            ) : row.kind === "update" ? (
                              <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>UPDATE</span>
                            ) : (
                              <span style={{ background: "#F1F5F9", color: "#94A3B8", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4 }}>NO CHANGE</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <DiffCell before={row.before?.label ?? ""} after={row.after.label} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <DiffCell before={beforePrice} after={afterPrice} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <DiffCell before={beforeCap} after={afterCap} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setPreviewStep("select")} disabled={copying}>
                ← Back
              </Button>
              <Button
                size="sm"
                onClick={handleCopyFrom}
                disabled={copying || diffRows.filter(r => r.kind !== "unchanged").length === 0}
                className="gap-1.5"
              >
                {copying
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
                {copying
                  ? "Applying…"
                  : (() => {
                      const n = diffRows.filter(r => r.kind !== "unchanged").length;
                      return `Apply ${n} change${n !== 1 ? "s" : ""}`;
                    })()}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

// ── Scheduled delegate export section ────────────────────────────────────────

const PASS_TYPE_CATEGORIES = ["All", "Paying", "Comp"] as const;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const ALL_EXPORT_COLUMNS = [
  "name", "email", "jobTitle", "organization", "country",
  "segment", "passType", "status", "gender", "ageBand", "aum", "notes",
] as const;
type ExportColumnKey = typeof ALL_EXPORT_COLUMNS[number];

const EXPORT_COLUMN_LABELS: Record<ExportColumnKey, string> = {
  name:         "Name",
  email:        "Email",
  jobTitle:     "Job title",
  organization: "Organisation",
  country:      "Country",
  segment:      "Segment",
  passType:     "Pass type",
  status:       "Status",
  gender:       "Gender",
  ageBand:      "Age band",
  aum:          "AUM",
  notes:        "Notes",
};

const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
  "name", "email", "jobTitle", "organization", "country", "segment", "passType", "status",
];

function DelegateExportScheduleSection({ conveningId, canEdit }: { conveningId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const params = { conveningId };
  const { data: schedule, isLoading } = useGetDelegateExportSchedule(params, {
    query: { queryKey: getGetDelegateExportScheduleQueryKey(params) },
  });
  const put = usePutDelegateExportSchedule();

  const [enabled, setEnabled] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState("08:00");
  const [recipientsText, setRecipientsText] = useState("");
  const [segment, setSegment] = useState("");
  const [passTypeCategory, setPassTypeCategory] = useState<typeof PASS_TYPE_CATEGORIES[number]>("All");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([...ALL_DAYS]);
  const [columns, setColumns] = useState<ExportColumnKey[]>([...DEFAULT_EXPORT_COLUMNS]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    setEnabled(schedule?.enabled ?? false);
    setTimeOfDay(schedule?.timeOfDay ?? "08:00");
    setRecipientsText((schedule?.recipients ?? []).join(", "));
    setSegment(schedule?.segment ?? "");
    setPassTypeCategory((schedule?.passTypeCategory as typeof PASS_TYPE_CATEGORIES[number]) ?? "All");
    const loaded = schedule?.daysOfWeek ?? [...ALL_DAYS];
    setDaysOfWeek(loaded.length === 0 ? [...ALL_DAYS] : loaded);
    const loadedCols = (schedule?.columns ?? null) as ExportColumnKey[] | null;
    setColumns(loadedCols && loadedCols.length > 0 ? loadedCols : [...DEFAULT_EXPORT_COLUMNS]);
  }, [schedule, isLoading]);

  function toggleDay(dow: number) {
    setDaysOfWeek(prev => {
      const next = prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort((a, b) => a - b);
      return next.length === 0 ? prev : next; // prevent deselecting all
    });
    setSaved(false);
  }

  function toggleColumn(col: ExportColumnKey) {
    setColumns(prev => {
      const next = prev.includes(col)
        ? prev.filter(c => c !== col)
        : [...prev, col];
      return next.length === 0 ? prev : next; // prevent deselecting all
    });
    setSaved(false);
  }

  async function handleSave() {
    setError(null);
    const recipients = recipientsText.split(",").map(r => r.trim()).filter(Boolean);
    if (enabled && recipients.length === 0) {
      setError("Add at least one recipient email to enable the schedule.");
      return;
    }
    setSaving(true);
    try {
      await put.mutateAsync({
        data: {
          conveningId,
          enabled,
          timeOfDay,
          recipients,
          segment: segment || null,
          passTypeCategory,
          daysOfWeek,
          columns: columns.length > 0 ? columns : null,
        },
      });
      void qc.invalidateQueries({ queryKey: getGetDelegateExportScheduleQueryKey(params) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save schedule";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Scheduled delegate export"
      sub="Automatically email a fresh delegate CSV to your team every day — uses the same export permissions and is logged to the audit trail"
      canEdit={canEdit}
    >
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-8 rounded bg-[#E3E8EE] animate-pulse w-1/3" />
          <div className="h-8 rounded bg-[#E3E8EE] animate-pulse w-2/3" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--brand-text-secondary)]" />
              <div>
                <p className="text-[13px] font-medium text-[var(--brand-ink)]">Daily export</p>
                <p className="text-[11px] text-[var(--brand-text-secondary)]">
                  {schedule?.lastRunAt
                    ? `Last sent ${new Date(schedule.lastRunAt).toLocaleString()} (${schedule.lastStatus ?? "Success"})`
                    : "Not run yet"}
                </p>
              </div>
            </div>
            <Switch checked={enabled} disabled={!canEdit} onCheckedChange={(v) => { setEnabled(v); setSaved(false); }} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FL>Time (UTC)</FL>
              <Input
                type="time"
                className="h-9 text-[13px]"
                value={timeOfDay}
                disabled={!canEdit}
                onChange={e => { setTimeOfDay(e.target.value); setSaved(false); }}
              />
            </div>
            <div>
              <FL>Pass type filter</FL>
              <Select
                value={passTypeCategory}
                disabled={!canEdit}
                onValueChange={(v) => { setPassTypeCategory(v as typeof PASS_TYPE_CATEGORIES[number]); setSaved(false); }}
              >
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PASS_TYPE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <FL>Run on days</FL>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {ALL_DAYS.map((dow) => {
                const active = daysOfWeek.includes(dow);
                return (
                  <button
                    key={dow}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleDay(dow)}
                    className={[
                      "h-8 w-10 rounded text-[12px] font-medium border transition-colors",
                      active
                        ? "bg-[var(--brand-ink)] text-white border-[var(--brand-ink)]"
                        : "bg-white text-[var(--brand-text-secondary)] border-[#D1D9E0] hover:border-[var(--brand-ink)]",
                      !canEdit ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                    ].join(" ")}
                  >
                    {DAY_LABELS[dow]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--brand-text-secondary)] mt-1">
              {daysOfWeek.length === 7
                ? "Every day"
                : daysOfWeek.map(d => DAY_LABELS[d]).join(", ")}
            </p>
          </div>

          <div>
            <FL>Segment filter (optional)</FL>
            <Input
              className="h-9 text-[13px]"
              placeholder="Leave blank for all segments"
              value={segment}
              disabled={!canEdit}
              onChange={e => { setSegment(e.target.value); setSaved(false); }}
            />
          </div>

          <div>
            <FL>Columns to include</FL>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {ALL_EXPORT_COLUMNS.map((col) => {
                const active = columns.includes(col);
                return (
                  <button
                    key={col}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleColumn(col)}
                    className={[
                      "h-7 px-2.5 rounded text-[11px] font-medium border transition-colors",
                      active
                        ? "bg-[var(--brand-ink)] text-white border-[var(--brand-ink)]"
                        : "bg-white text-[var(--brand-text-secondary)] border-[#D1D9E0] hover:border-[var(--brand-ink)]",
                      !canEdit ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                    ].join(" ")}
                  >
                    {EXPORT_COLUMN_LABELS[col]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--brand-text-secondary)] mt-1">
              {columns.length === ALL_EXPORT_COLUMNS.length
                ? "All columns"
                : `${columns.length} column${columns.length === 1 ? "" : "s"}: ${columns.map(c => EXPORT_COLUMN_LABELS[c]).join(", ")}`}
            </p>
          </div>

          <div>
            <FL>Recipients</FL>
            <Input
              className="h-9 text-[13px]"
              placeholder="ops@example.org, finance@example.org"
              value={recipientsText}
              disabled={!canEdit}
              onChange={e => { setRecipientsText(e.target.value); setSaved(false); }}
            />
            <p className="text-[11px] text-[var(--brand-text-secondary)] mt-1">Comma-separated email addresses</p>
          </div>

          {error && <p className="text-[12px] text-red-600">{error}</p>}

          {canEdit && (
            <SaveRow onSave={handleSave} saving={saving} saved={saved} />
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Users & roles section ─────────────────────────────────────────────────────

function UsersSection({ me, convenings }: { me: PortalUser; convenings: Convening[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: users = [], isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey() },
  });
  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() }),
      onError: () => toast({ title: "Could not save user", description: "Please try again.", variant: "destructive" }),
    },
  });

  const [editUser, setEditUser] = useState<typeof users[number] | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", role: "Client" as Role, accountType: "External" as "Internal" | "External",
    conveningIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTab, setInviteTab] = useState<"team" | "client">("team");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("Curator");
  const [inviteConveningId, setInviteConveningId] = useState("");
  const [inviteSections, setInviteSections] = useState<string[]>([]);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  function openInviteDialog(tab: "team" | "client" = "team") {
    setInviteOpen(true);
    setInviteTab(tab);
    setInviteEmail("");
    setInviteRole("Curator");
    setInviteConveningId("");
    setInviteSections([]);
    setInviteSent(false);
    setInviteError(null);
  }

  // Keep old alias for callers that don't pass a tab
  const openInvite = () => openInviteDialog("team");

  function toggleInviteSection(s: string) {
    setInviteSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function handleInvite() {
    setInviteError(null);
    setInviteSending(true);
    try {
      const body = inviteTab === "team"
        ? { email: inviteEmail, role: inviteRole }
        : {
            email: inviteEmail,
            role: "Client" as Role,
            conveningId: inviteConveningId,
            allowedSections: inviteSections.length ? inviteSections : undefined,
          };
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        setInviteSent(true);
        void qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        void qc.invalidateQueries({ queryKey: getListInvitesQueryKey() });
      } else {
        const data = await res.json().catch(() => ({}));
        setInviteError(data.error ?? "Failed to send invite. Please try again.");
      }
    } finally {
      setInviteSending(false);
    }
  }

  function openEdit(u: typeof users[number]) {
    setEditUser(u);
    setEditForm({
      name:         u.name,
      role:         u.role as Role,
      accountType:  u.accountType,
      conveningIds: u.conveningIds ?? [],
    });
  }

  async function handleSave() {
    if (!editUser) return;
    setSaving(true);
    try {
      await updateUser.mutateAsync({
        id: editUser.id,
        data: {
          name:         editForm.name,
          role:         editForm.role,
          accountType:  editForm.accountType,
          conveningIds: editForm.accountType === "Internal" ? [] : editForm.conveningIds,
        },
      });
      setEditUser(null);
    } finally {
      setSaving(false);
    }
  }

  function toggleConveningId(cid: string) {
    setEditForm(f => ({
      ...f,
      conveningIds: f.conveningIds.includes(cid)
        ? f.conveningIds.filter(id => id !== cid)
        : [...f.conveningIds, cid],
    }));
  }

  const INTERNAL_ROLES: Role[] = ["Admin", "Curator", "Finance", "PartnerLead", "SpeakerLead", "Ops", "PressManager", "Advisor"];

  return (
    <SectionCard title="Users & roles"
      sub="Manage portal access, roles, and convening visibility per user"
      canEdit
      action={
        <Button size="sm" variant="outline" onClick={openInvite} className="gap-1.5 h-8 text-[12px]">
          <UserPlus className="h-3.5 w-3.5" /> Invite
        </Button>
      }>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={open => { if (!open) setInviteOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
              Invite someone
            </DialogTitle>
          </DialogHeader>

          {inviteSent ? (
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
                <Mail className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--brand-ink)]">Invitation sent!</p>
                <p className="text-[12px] text-[var(--brand-text-secondary)] mt-1">
                  An email with a sign-in link has been sent to <strong>{inviteEmail}</strong>.<br />
                  The link expires in 48 hours.
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => { setInviteSent(false); setInviteEmail(""); }}>
                  Invite another
                </Button>
                <Button size="sm" onClick={() => setInviteOpen(false)}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex rounded-lg overflow-hidden text-[12px] font-medium" style={{ border: HL }}>
                {(["team", "client"] as const).map(tab => (
                  <button key={tab} onClick={() => setInviteTab(tab)}
                    className={`flex-1 py-2 capitalize transition-colors ${inviteTab === tab ? "bg-gray-900 text-white" : "bg-white text-[var(--brand-text-secondary)] hover:bg-gray-50"} ${tab === "client" ? "border-l" : ""}`}
                    style={tab === "client" ? { borderLeftColor: HL.replace(/"/g, "").trim() || "#E2E8F0" } : {}}>
                    {tab === "team" ? "Team member" : "Client (read-only)"}
                  </button>
                ))}
              </div>

              <div className="space-y-3 py-1">
                <div>
                  <FL>Email address</FL>
                  <Input className="h-9 text-sm" type="email" placeholder="name@example.com"
                    value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                </div>

                {inviteTab === "team" ? (
                  <div>
                    <FL>Role</FL>
                    <Select value={inviteRole} onValueChange={v => setInviteRole(v as Role)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INTERNAL_ROLES.map(r => (
                          <SelectItem key={r} value={r}>
                            <span className="flex items-center gap-1.5">
                              <TonalBadge text={labelFn(r)} tonal={ROLE_TONAL[r]} />
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-[var(--brand-text-secondary)] mt-1">
                      Internal team member — can access all convenings based on their role.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <FL>Convening</FL>
                      <Select value={inviteConveningId} onValueChange={setInviteConveningId}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a convening…" /></SelectTrigger>
                        <SelectContent>
                          {convenings.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FL>Sections to grant access <span className="normal-case font-normal">(optional — leave blank for all)</span></FL>
                      <div className="grid grid-cols-2 gap-1.5 mt-1">
                        {ACCESS_SECTIONS.map(s => (
                          <label key={s} className="flex items-center gap-2 text-[12px] cursor-pointer select-none">
                            <Checkbox checked={inviteSections.includes(s)} onCheckedChange={() => toggleInviteSection(s)} />
                            <span className={s === "Budget" || s === "DealRoom" ? "font-medium text-amber-700" : ""}>
                              {s === "DealRoom" ? "Deal Room" : s}
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-600 mt-1">Budget and Deal Room are sensitive — grant with care.</p>
                    </div>
                    <p className="text-[10px] text-[var(--brand-text-secondary)]">
                      Client access is read-only and restricted to this convening only.
                    </p>
                  </div>
                )}

                {inviteError && <p className="text-[12px] text-red-500">{inviteError}</p>}
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void handleInvite()}
                  disabled={inviteSending || !inviteEmail || (inviteTab === "client" && !inviteConveningId)}>
                  {inviteSending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Sending…</> : "Send invitation"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden" style={{ border: HL, borderRadius: 8 }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ height: 36, borderBottom: HL, background: "#F6F8FB" }}>
              {["Name", "Email", "Account", "Role", "Convenings", ""].map((h, i) => (
                <th key={i} className={`px-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] text-left ${i === 5 ? "w-12" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? <SkeletonRows cols={6} rows={4} /> :
             users.map((u, i) => {
               const isMe = u.id === me.id;
               const isInternal = u.accountType === "Internal";
               const cIds: string[] = u.conveningIds ?? [];
               const assignedConvenings = convenings.filter(c => cIds.includes(c.id));
               return (
                 <tr key={u.id} className="group transition-colors"
                   style={{ height: 44, borderBottom: i < users.length - 1 ? HL : "none" }}
                   onMouseEnter={e => (e.currentTarget.style.background = "#EEF3F9")}
                   onMouseLeave={e => (e.currentTarget.style.background = "")}>
                   <td className="px-4">
                     <div className="flex items-center gap-1.5">
                       <span className="font-medium text-[var(--brand-ink)]">{u.name}</span>
                       {isMe && <span className="text-[10px] text-[var(--brand-text-secondary)]">(you)</span>}
                     </div>
                   </td>
                   <td className="px-4 text-[var(--brand-text-secondary)]">{u.email ?? "—"}</td>
                   <td className="px-4">
                     <TonalBadge
                       text={u.accountType}
                       tonal={u.accountType === "Internal"
                         ? { bg: "#EFF6FF", color: "#1D4ED8" }
                         : { bg: "#F1F5F9", color: "#475569" }}
                     />
                   </td>
                   <td className="px-4">
                     <TonalBadge text={labelFn(u.role)} tonal={ROLE_TONAL[u.role]} />
                   </td>
                   <td className="px-4 text-[var(--brand-text-secondary)] text-[12px]">
                     {isInternal
                       ? <span className="opacity-50">All convenings</span>
                       : assignedConvenings.length === 0
                         ? <span className="opacity-40">None</span>
                         : assignedConvenings.map(c => c.name).join(", ")}
                   </td>
                   <td className="px-3">
                     <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => openEdit(u)}
                         className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-white transition-colors">
                         <Pencil className="h-3.5 w-3.5" />
                       </button>
                     </div>
                   </td>
                 </tr>
               );
             })}
          </tbody>
        </table>
      </div>

      {/* Edit user dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
              Edit user
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FL>Name</FL>
                <Input className="h-9 text-sm" value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <FL>Role</FL>
                <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v as Role }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r} value={r}>
                        <span className="flex items-center gap-1.5">
                          <TonalBadge text={labelFn(r)} tonal={ROLE_TONAL[r]} />
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FL>Account type</FL>
                <Select value={editForm.accountType} onValueChange={v => setEditForm(f => ({ ...f, accountType: v as "Internal" | "External" }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Internal">Internal</SelectItem>
                    <SelectItem value="External">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editForm.accountType === "External" && convenings.length > 0 && (
              <div>
                <FL>Convening access</FL>
                <div className="rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto"
                  style={{ border: HL, background: "#F6F8FB" }}>
                  {convenings.map(c => (
                    <label key={c.id} className="flex items-center gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editForm.conveningIds.includes(c.id)}
                        onCheckedChange={() => toggleConveningId(c.id)}
                      />
                      <span className="text-[13px] text-[var(--brand-ink)]">{c.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--brand-text-secondary)] mt-1">
                  External users only see the convenings checked above.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!editForm.name || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ── Convenings management section ─────────────────────────────────────────────

type ConvForm = {
  name: string; slug: string; theme: string; startDate: string; endDate: string;
  venueName: string; sourceId: string; includeWorkstreams: boolean;
  includeTasks: boolean; includeAgenda: boolean;
};

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface DeleteState {
  convening: Convening;
  counts?: DeleteConvening409["counts"];
  error?: string;
}

function ConveningsSection({ convenings }: { convenings: Convening[] }) {
  const qc = useQueryClient();
  const createConvening = useCreateConvening();
  const cloneConvening  = useCloneConvening();
  const deleteConvening = useDeleteConvening();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [form, setForm] = useState<ConvForm>({
    name: "", slug: "", theme: "", startDate: "", endDate: "",
    venueName: "", sourceId: "", includeWorkstreams: true,
    includeTasks: true, includeAgenda: false,
  });

  const CONV_STATUS_TONAL: Record<string, { bg: string; color: string }> = {
    Planning:  { bg: "#EFF6FF", color: "#1D4ED8" },
    Active:    { bg: "#ECFDF5", color: "#059669" },
    Completed: { bg: "#F1F5F9", color: "#475569" },
    Archived:  { bg: "#FFF1F2", color: "#BE123C" },
  };

  async function handleCreate() {
    const { name, slug, theme, startDate, endDate, venueName, sourceId,
      includeWorkstreams, includeTasks, includeAgenda } = form;
    if (!name.trim() || !slug.trim()) return;
    setCreateError(null);
    try {
      const created = sourceId
        ? await cloneConvening.mutateAsync({
        id: sourceId,
        data: { name: name.trim(), slug: slug.trim(), theme: theme || undefined, startDate: startDate || undefined,
          endDate: endDate || undefined, venueName: venueName || undefined,
          include: { workstreams: includeWorkstreams, tasks: includeTasks, agenda: includeAgenda } },
      })
        : await createConvening.mutateAsync({
        data: { name: name.trim(), slug: slug.trim(), theme: theme || undefined, startDate: startDate || undefined,
          endDate: endDate || undefined, venueName: venueName || undefined },
      });
      qc.setQueryData<Convening[]>(getListConveningsQueryKey(), (previous) =>
        previous?.some((c) => c.id === created.id) ? previous : [...(previous ?? []), created]);
      void qc.invalidateQueries({ queryKey: getListConveningsQueryKey() });
      setDialogOpen(false);
      setForm({ name: "", slug: "", theme: "", startDate: "", endDate: "",
        venueName: "", sourceId: "", includeWorkstreams: true, includeTasks: true, includeAgenda: false });
    } catch (err) {
      const data = (err as { data?: { error?: string } })?.data;
      setCreateError(data?.error ?? (err instanceof Error ? err.message : "Could not create project. Try again."));
    }
  }

  async function handleDelete() {
    if (!deleteState) return;
    try {
      await deleteConvening.mutateAsync({ id: deleteState.convening.id });
      await qc.invalidateQueries({ queryKey: getListConveningsQueryKey() });
      setDeleteState(null);
    } catch (err: unknown) {
      const body = (err as { response?: { data?: DeleteConvening409 } })?.response?.data;
      if (body?.counts) {
        setDeleteState(s => s ? { ...s, counts: body!.counts, error: body!.error } : null);
      } else {
        setDeleteState(s => s ? { ...s, error: "Delete failed. Try again." } : null);
      }
    }
  }

  const isSaving = createConvening.isPending || cloneConvening.isPending;
  const isDeleting = deleteConvening.isPending;

  return (
    <SectionCard title="Convenings"
      sub="Create a new convening from scratch or clone scaffolding from an existing one"
      canEdit
      action={
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New convening
        </Button>
      }
    >
      <div className="overflow-hidden" style={{ border: HL, borderRadius: 8 }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ height: 36, borderBottom: HL, background: "#F6F8FB" }}>
              {["Name", "Slug", "Status", "Dates", ""].map((h, i) => (
                <th key={i} className="px-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {convenings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[12px] text-[var(--brand-text-secondary)]">
                  No convenings yet.
                </td>
              </tr>
            ) : convenings.map((c, i) => (
              <tr key={c.id} className="transition-colors group"
                style={{ height: 44, borderBottom: i < convenings.length - 1 ? HL : "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#EEF3F9")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <td className="px-4 font-medium text-[var(--brand-ink)]">{c.name}</td>
                <td className="px-4 font-mono text-[11px] text-[var(--brand-text-secondary)]">{c.slug}</td>
                <td className="px-4">
                  <TonalBadge text={labelFn(c.status)} tonal={CONV_STATUS_TONAL[c.status]} />
                </td>
                <td className="px-4 text-[12px] text-[var(--brand-text-secondary)]">
                  {c.startDate ?? "—"}{c.endDate ? ` → ${c.endDate}` : ""}
                </td>
                <td className="px-4 text-right">
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-[var(--brand-text-secondary)] hover:text-red-600"
                    title="Delete convening"
                    onClick={() => setDeleteState({ convening: c })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteState} onOpenChange={open => { if (!open) setDeleteState(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
              Delete convening?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-[13px]">
            <p className="text-[var(--brand-ink)]">
              <span className="font-medium">{deleteState?.convening.name}</span> will be permanently removed.
              This cannot be undone.
            </p>
            {deleteState?.counts && (
              <div className="rounded-lg p-3 space-y-1.5" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <p className="font-semibold text-red-700 text-[12px]">
                  Cannot delete — convening has linked data:
                </p>
                {Object.entries(deleteState.counts)
                  .filter(([, v]) => Number(v) > 0)
                  .map(([k, v]) => (
                    <p key={k} className="text-red-600 text-[12px]">
                      · {Number(v)} {k}
                    </p>
                  ))}
                <p className="text-red-600 text-[11px] mt-1">
                  Remove all linked records first, then delete the convening.
                </p>
              </div>
            )}
            {deleteState?.error && !deleteState.counts && (
              <p className="text-red-600 text-[12px]">{deleteState.error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteState(null)}>Cancel</Button>
            {!deleteState?.counts && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete permanently"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / clone dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setCreateError(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
              New convening
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FL>
                <Copy className="inline h-3 w-3 mr-1 relative -top-px" />
                Clone scaffolding from
              </FL>
              <Select
                value={form.sourceId || "_none"}
                onValueChange={v => setForm(f => ({ ...f, sourceId: v === "_none" ? "" : v }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Start from scratch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Start from scratch</SelectItem>
                  {convenings.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-[var(--brand-text-secondary)] mt-1">
                Copies workstreams/tasks/agenda — never partners, speakers, or financial data.
              </p>
            </div>

            {form.sourceId && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: "#F6F8FB", border: HL }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
                  What to copy
                </p>
                {[
                  { key: "includeWorkstreams", label: "Workstreams" },
                  { key: "includeTasks",       label: "Tasks (requires workstreams)", dep: !form.includeWorkstreams },
                  { key: "includeAgenda",      label: "Agenda skeleton (Proposed sessions, no speakers)" },
                ].map(({ key, label, dep }) => (
                  <label key={key} className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <Checkbox
                      checked={form[key as keyof ConvForm] as boolean}
                      disabled={dep}
                      onCheckedChange={v => setForm(f => ({ ...f, [key]: !!v }))}
                    />
                    <span className={dep ? "text-[var(--brand-text-secondary)] opacity-40" : "text-[var(--brand-ink)]"}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FL>Name *</FL>
                <Input className="h-9 text-sm" placeholder="e.g. Mkutano 2027"
                  value={form.name}
                  onChange={e => {
                    const name = e.target.value;
                    setForm(f => ({
                      ...f, name,
                      slug: f.slug === toSlug(f.name) ? toSlug(name) : f.slug,
                    }));
                  }} />
              </div>
              <div className="col-span-2">
                <FL>Slug *</FL>
                <Input className="h-9 text-sm font-mono" placeholder="e.g. mkutano-2027"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
                <p className="text-[10px] text-[var(--brand-text-secondary)] mt-0.5">
                  Lowercase, letters, numbers, hyphens only.
                </p>
              </div>
              <div>
                <FL>Theme</FL>
                <Input className="h-9 text-sm" placeholder="e.g. Africa Rising"
                  value={form.theme}
                  onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} />
              </div>
              <div>
                <FL>Venue</FL>
                <Input className="h-9 text-sm" placeholder="e.g. Kampala Serena"
                  value={form.venueName}
                  onChange={e => setForm(f => ({ ...f, venueName: e.target.value }))} />
              </div>
              <div>
                <FL>Start date</FL>
                <Input className="h-9 text-sm" type="date" value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <FL>End date</FL>
                <Input className="h-9 text-sm" type="date" value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
          </div>
          {createError && <p role="alert" className="text-xs text-red-600">{createError}</p>}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}
              disabled={!form.name || !form.slug || isSaving}
              className="gap-1.5">
              {form.sourceId ? <Copy className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {isSaving ? "Creating…" : form.sourceId ? "Clone & create" : "Create convening"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ── Access Requests section ───────────────────────────────────────────────────

const ACCESS_SECTIONS = [
  "Partners", "Speakers", "Delegates", "Budget", "DealRoom",
  "Agenda", "Exhibition", "Outcomes", "Documents", "Tasks",
] as const;

type AccessRequestRecord = {
  id: string;
  name: string;
  email: string;
  organization?: string | null;
  message?: string | null;
  status: string;
  createdAt: string;
};

function AccessRequestsSection({ convenings }: { convenings: Convening[] }) {
  const [requests, setRequests] = useState<AccessRequestRecord[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approveConveningId, setApproveConveningId] = useState("");
  const [approveSections, setApproveSections] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadRequests() {
    setLoadingRequests(true);
    try {
      const res = await fetch("/api/access-requests", { credentials: "include" });
      if (res.ok) setRequests(await res.json());
    } finally {
      setLoadingRequests(false);
    }
  }

  useEffect(() => { void loadRequests(); }, []);

  function toggleSection(s: string) {
    setApproveSections(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  function openApprove(id: string) {
    setExpandedId(id);
    setApproveConveningId("");
    setApproveSections([]);
    setActionError(null);
  }

  async function handleApprove(id: string) {
    if (!approveConveningId) { setActionError("Select a convening."); return; }
    if (!approveSections.length) { setActionError("Select at least one section."); return; }
    setProcessing(true); setActionError(null);
    try {
      const res = await fetch(`/api/access-requests/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conveningId: approveConveningId, allowedSections: approveSections }),
        credentials: "include",
      });
      if (res.ok) {
        setExpandedId(null);
        await loadRequests();
      } else {
        const d = await res.json().catch(() => ({}));
        setActionError(d.error ?? "Failed to approve.");
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject(id: string) {
    if (!confirm("Reject this access request?")) return;
    await fetch(`/api/access-requests/${id}/reject`, { method: "PATCH", credentials: "include" });
    await loadRequests();
  }

  const pending = requests.filter(r => r.status === "Pending");
  const processed = requests.filter(r => r.status !== "Pending");

  return (
    <SectionCard title="Access requests" sub="Review and grant portal access to external partners" canEdit>
      {loadingRequests ? (
        <p className="text-[12px] text-[var(--brand-text-secondary)]">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="py-8 text-center">
          <Inbox className="h-6 w-6 mx-auto mb-2 text-[var(--brand-text-secondary)] opacity-40" />
          <p className="text-[13px] text-[var(--brand-text-secondary)]">No access requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
                Pending ({pending.length})
              </p>
              {pending.map(req => (
                <div key={req.id} className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--brand-ink)]">{req.name}</p>
                      <p className="text-[11px] text-[var(--brand-text-secondary)]">{req.email}</p>
                      {req.organization && <p className="text-[11px] text-[var(--brand-text-secondary)]">{req.organization}</p>}
                      {req.message && <p className="text-[12px] text-[var(--brand-ink)] mt-1 leading-relaxed">{req.message}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5"
                        onClick={() => openApprove(expandedId === req.id ? null! : req.id)}>
                        {expandedId === req.id ? "Cancel" : "Approve"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleReject(req.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {expandedId === req.id && (
                    <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <FL>Convening</FL>
                        <select
                          value={approveConveningId}
                          onChange={e => setApproveConveningId(e.target.value)}
                          className="h-9 rounded-md border border-gray-200 px-2 text-[12px] bg-white w-full"
                        >
                          <option value="">Select convening…</option>
                          {convenings.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <FL>Sections to grant access</FL>
                        <div className="grid grid-cols-2 gap-1.5">
                          {ACCESS_SECTIONS.map(section => (
                            <label key={section} className="flex items-center gap-2 text-[12px] cursor-pointer select-none">
                              <Checkbox
                                checked={approveSections.includes(section)}
                                onCheckedChange={() => toggleSection(section)}
                              />
                              <span className={section === "Budget" || section === "DealRoom" ? "font-medium text-amber-700" : ""}>
                                {section === "DealRoom" ? "Deal Room" : section}
                              </span>
                            </label>
                          ))}
                        </div>
                        <p className="text-[10px] text-amber-600">Budget and Deal Room are sensitive — grant with care.</p>
                      </div>
                      {actionError && <p className="text-[11px] text-red-500">{actionError}</p>}
                      <Button size="sm" className="h-8 text-[12px]" disabled={processing}
                        onClick={() => handleApprove(req.id)}>
                        {processing ? "Sending invite…" : "Grant access & send invite"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {processed.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mt-4">
                Processed
              </p>
              {processed.map(req => (
                <div key={req.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[var(--brand-ink)]">{req.name} <span className="font-normal text-[var(--brand-text-secondary)]">— {req.email}</span></p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${req.status === "Approved" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Partner Access section ────────────────────────────────────────────────────

function PartnerAccessSection({ convenings }: { convenings: Convening[] }) {
  const qc = useQueryClient();
  const { data: me } = useGetMe();

  const { data: invites = [], isLoading } = useListInvites({
    query: { queryKey: getListInvitesQueryKey() },
  });

  const resend = useResendInvite({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListInvitesQueryKey() });
      },
    },
  });

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteConveningId, setInviteConveningId] = useState("");
  const [inviteSections, setInviteSections] = useState<string[]>([]);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  function openInvite() {
    setInviteOpen(true);
    setInviteEmail("");
    setInviteConveningId("");
    setInviteSections([]);
    setInviteSent(false);
    setInviteError(null);
  }

  function toggleSection(s: string) {
    setInviteSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function handleSendInvite() {
    setInviteError(null);
    setInviteSending(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: "Client",
          conveningId: inviteConveningId,
          allowedSections: inviteSections.length ? inviteSections : undefined,
        }),
        credentials: "include",
      });
      if (res.ok) {
        setInviteSent(true);
        void qc.invalidateQueries({ queryKey: getListInvitesQueryKey() });
      } else {
        const d = await res.json().catch(() => ({}));
        setInviteError(d.error ?? "Failed to send invite.");
      }
    } finally {
      setInviteSending(false);
    }
  }

  async function handleResend(id: string) {
    setResendingId(id);
    setResendError(null);
    try {
      await resend.mutateAsync({ id });
    } catch {
      setResendError("Failed to resend. Please try again.");
    } finally {
      setResendingId(null);
    }
  }

  function inviteStatus(inv: InviteRecord): { label: string; color: string; bg: string } {
    if (inv.usedAt) return { label: "Accepted", color: "#059669", bg: "#ECFDF5" };
    if (new Date(inv.expiresAt) < new Date()) return { label: "Expired", color: "#DC2626", bg: "#FEF2F2" };
    return { label: "Pending", color: "#B45309", bg: "#FFFBEB" };
  }

  function conveningName(id: string | null | undefined): string {
    if (!id) return "—";
    return convenings.find(c => c.id === id)?.name ?? id;
  }

  // Only show partner (Client) invites
  const partnerInvites = invites.filter(inv => inv.role === "Client");
  const pending = partnerInvites.filter(inv => !inv.usedAt && new Date(inv.expiresAt) >= new Date());
  const accepted = partnerInvites.filter(inv => inv.usedAt);
  const expired = partnerInvites.filter(inv => !inv.usedAt && new Date(inv.expiresAt) < new Date());

  return (
    <div className="space-y-4">
      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={open => { if (!open) setInviteOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
              Invite a partner
            </DialogTitle>
          </DialogHeader>

          {inviteSent ? (
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
                <Mail className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--brand-ink)]">Invite sent!</p>
                <p className="text-[12px] text-[var(--brand-text-secondary)] mt-1">
                  An email was sent to <strong>{inviteEmail}</strong>.<br />
                  The link expires in 48 hours.
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => { setInviteSent(false); setInviteEmail(""); }}>Invite another</Button>
                <Button size="sm" onClick={() => setInviteOpen(false)}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-1">
                <div>
                  <FL>Partner email</FL>
                  <Input className="h-9 text-sm" type="email" placeholder="partner@organization.com"
                    value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} autoFocus />
                </div>
                <div>
                  <FL>Convening</FL>
                  <Select value={inviteConveningId} onValueChange={setInviteConveningId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a convening…" /></SelectTrigger>
                    <SelectContent>
                      {convenings.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FL>Sections to grant <span className="normal-case font-normal">(optional — leave blank for all)</span></FL>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {ACCESS_SECTIONS.map(s => (
                      <label key={s} className="flex items-center gap-2 text-[12px] cursor-pointer select-none">
                        <Checkbox checked={inviteSections.includes(s)} onCheckedChange={() => toggleSection(s)} />
                        <span className={s === "Budget" || s === "DealRoom" ? "font-medium text-amber-700" : ""}>
                          {s === "DealRoom" ? "Deal Room" : s}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-600 mt-1">Budget and Deal Room are sensitive — grant with care.</p>
                </div>
                {inviteError && <p className="text-[12px] text-red-500">{inviteError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void handleSendInvite()}
                  disabled={inviteSending || !inviteEmail || !inviteConveningId}>
                  {inviteSending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Sending…</> : "Send invite"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Header card */}
      <SectionCard
        title="Partner access"
        sub="Invite partners by email — they'll receive a link to set up their account and access only their convening"
        canEdit
        action={
          <Button size="sm" onClick={openInvite} className="gap-1.5 h-8 text-[12px]">
            <Link2 className="h-3.5 w-3.5" /> Invite partner
          </Button>
        }
      >
        {resendError && (
          <p className="text-[12px] text-red-500 mb-2">{resendError}</p>
        )}

        {isLoading ? (
          <SkeletonRows cols={5} rows={3} />
        ) : partnerInvites.length === 0 ? (
          <div className="py-10 text-center">
            <KeyRound className="h-6 w-6 mx-auto mb-2 text-[var(--brand-text-secondary)] opacity-30" />
            <p className="text-[13px] text-[var(--brand-text-secondary)]">No partner invites yet.</p>
            <p className="text-[11px] text-[var(--brand-text-secondary)] mt-1">Click "Invite partner" to send a partner their access link.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary pills */}
            <div className="flex gap-3">
              {[
                { label: "Accepted", count: accepted.length, bg: "#ECFDF5", color: "#059669" },
                { label: "Pending", count: pending.length, bg: "#FFFBEB", color: "#B45309" },
                { label: "Expired", count: expired.length, bg: "#FEF2F2", color: "#DC2626" },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: s.bg, color: s.color }}>
                  <span className="text-[15px] font-bold">{s.count}</span>
                  {s.label}
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--brand-border)" }}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--brand-border)", background: "#F6F8FB" }}>
                    {["Email", "Convening", "Sections", "Status", "Sent", ""].map((h, i) => (
                      <th key={i} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {partnerInvites.map(inv => {
                    const st = inviteStatus(inv);
                    const canResend = !inv.usedAt;
                    return (
                      <tr key={inv.id} className="group border-b last:border-b-0 hover:bg-[var(--brand-tint)]/40 transition-colors"
                        style={{ borderColor: "var(--brand-border)" }}>
                        <td className="px-4 py-3 font-medium text-[var(--brand-ink)]">{inv.email}</td>
                        <td className="px-4 py-3 text-[var(--brand-text-secondary)]">{conveningName(inv.conveningId)}</td>
                        <td className="px-4 py-3">
                          {inv.allowedSections?.length ? (
                            <span className="text-[11px] text-[var(--brand-text-secondary)]">
                              {(inv.allowedSections as string[]).join(", ")}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--brand-border)]">All</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--brand-text-secondary)]">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {canResend && (
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] font-medium text-[var(--brand-primary)] hover:underline"
                              onClick={() => void handleResend(inv.id)}
                              disabled={resendingId === inv.id}
                              title="Resend invite"
                            >
                              {resendingId === inv.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RefreshCw className="h-3 w-3" />}
                              Resend
                            </button>
                          )}
                          {inv.usedAt && (
                            <span title="Accepted"><Check className="h-3.5 w-3.5 text-green-600 opacity-60" /></span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-[var(--brand-text-secondary)]">
              Partners log in at <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">/</code> using their email and password.
              They only see the convening they were invited to.
              Expired links can be resent — expiry will be extended by 48 hours.
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Google Sheets sync section ────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

function GoogleSheetsSection({ convening, conveningId }: {
  convening: Convening | null;
  conveningId: string;
}) {
  const qc = useQueryClient();
  const [lastResult, setLastResult] = useState<{ spreadsheetUrl: string; sheetsLastSyncedAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const sheetUrl = lastResult?.spreadsheetUrl
    ?? (convening?.googleSheetId ? `https://docs.google.com/spreadsheets/d/${convening.googleSheetId}` : null);
  const lastSynced = lastResult?.sheetsLastSyncedAt ?? convening?.sheetsLastSyncedAt ?? null;
  const isConfigured = Boolean(convening?.googleSheetId) || Boolean(lastResult);

  async function handleSync() {
    setError(null);
    setSyncing(true);
    try {
      // Step 1: fetch all tab data from our API
      const exportRes = await fetch(`/api/admin/sheets/export-data?conveningId=${encodeURIComponent(conveningId)}`, {
        credentials: "include",
      });
      if (!exportRes.ok) {
        const body = await exportRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Failed to fetch export data (HTTP ${exportRes.status})`);
      }
      const exportData = await exportRes.json() as { tabs: { sheet: string; values: string[][] }[]; tabCount?: number };
      const expectedTabCount = exportData.tabCount ?? exportData.tabs.length;

      // Step 2: POST directly to Apps Script from the browser
      const appsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined;
      if (!appsScriptUrl) throw new Error("Google Sheets is not configured (VITE_APPS_SCRIPT_URL not set).");

      const scriptRes = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" }, // avoid CORS preflight
        body: JSON.stringify(exportData),
        redirect: "follow",
      });
      if (!scriptRes.ok) {
        throw new Error(`Apps Script returned HTTP ${scriptRes.status}. Check that the deployment access is set to "Anyone".`);
      }
      const scriptData = await scriptRes.json() as { ok: boolean; written?: number; spreadsheetId?: string; spreadsheetUrl?: string; error?: string };
      if (!scriptData.ok) throw new Error(`Apps Script error: ${scriptData.error ?? "unknown"}`);

      // Guard against silent partial writes caused by an expired connector token.
      // Only proceed to record-sync when ALL tabs were written successfully.
      if (typeof scriptData.written === "number" && scriptData.written < expectedTabCount) {
        throw new Error(
          `Partial sync: Apps Script wrote ${scriptData.written} of ${expectedTabCount} tabs. ` +
          `The Google connector token may have expired — re-authorise and try again.`,
        );
      }

      const spreadsheetId = scriptData.spreadsheetId ?? "";
      const spreadsheetUrl = scriptData.spreadsheetUrl ?? (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : "");

      // Step 3: record the sync in our DB (only reached when all tabs confirmed written)
      if (spreadsheetId) {
        const recordRes = await fetch("/api/admin/sheets/record-sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conveningId, spreadsheetId, spreadsheetUrl }),
        });
        if (recordRes.ok) {
          const recorded = await recordRes.json() as { sheetsLastSyncedAt?: string };
          setLastResult({ spreadsheetUrl, sheetsLastSyncedAt: recorded.sheetsLastSyncedAt ?? new Date().toISOString() });
        } else {
          setLastResult({ spreadsheetUrl, sheetsLastSyncedAt: new Date().toISOString() });
        }
      } else {
        setLastResult({ spreadsheetUrl, sheetsLastSyncedAt: new Date().toISOString() });
      }
      qc.invalidateQueries({ queryKey: getListConveningsQueryKey() });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Sync failed";
      setError(raw || "An unexpected error occurred. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  function handleCopy() {
    if (!sheetUrl) return;
    void navigator.clipboard.writeText(sheetUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <SectionCard
      title="Google Sheets sync"
      sub="Automatically write convening data to a shared Google Spreadsheet (10 tabs)"
      canEdit
    >
      <div className="space-y-5">
        {/* Status row */}
        <div className="flex items-start gap-3 p-4 rounded-lg" style={{ background: "#F6F8FB", border: HL }}>
          <div className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1 ${isConfigured ? "bg-green-500" : "bg-slate-300"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[var(--brand-ink)]">
              {isConfigured ? "Spreadsheet connected" : "No spreadsheet yet"}
            </p>
            {lastSynced ? (
              <p className="text-[11px] text-[var(--brand-text-secondary)] mt-0.5">
                Last synced {relativeTime(lastSynced)}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--brand-text-secondary)] mt-0.5">
                {isConfigured
                  ? 'Click "Sync now" to refresh all 10 tabs with the latest data.'
                  : 'Click "Create Sheet" to generate a new linked Google Spreadsheet for this convening.'}
              </p>
            )}
            {/* Copyable sheet URL */}
            {sheetUrl && (
              <div className="flex items-center gap-2 mt-2 rounded-md px-2 py-1.5" style={{ background: "#EEF3F9", border: HL }}>
                <span className="text-[11px] text-[var(--brand-text-secondary)] truncate flex-1 font-mono">
                  {sheetUrl}
                </span>
                <button
                  onClick={handleCopy}
                  className="text-[11px] font-medium text-[var(--brand-primary)] hover:underline shrink-0 flex items-center gap-1"
                  title="Copy link"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-[var(--brand-primary)] hover:underline shrink-0 flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Tabs info */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-2">
            10 tabs synced
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["Partners", "Speakers", "Agenda", "Tasks", "Delegates", "Budget", "Commitments", "Deal Room", "Exhibition", "Outcomes"].map((tab) => (
              <span key={tab} className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                style={{ background: "#EEF3F9", color: "#2A6FB0" }}>
                {tab}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-[var(--brand-text-secondary)] mt-2">
            Synced daily at 06:00 UTC. The sheet is shared as "anyone with the link can view" — no portal account needed.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg p-3 text-[12px]" style={{ background: "#FFF1F2", border: "0.5px solid #FECDD3", color: "#BE123C" }}>
            <strong>{isConfigured ? "Sync" : "Create"} failed:</strong> {error}
          </div>
        )}

        {/* Action button */}
        <div className="flex justify-end pt-2" style={{ borderTop: HL }}>
          <Button
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2 min-w-32"
          >
            {syncing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : isConfigured
                ? <RefreshCw className="h-3.5 w-3.5" />
                : <Sheet className="h-3.5 w-3.5" />
            }
            {syncing
              ? (isConfigured ? "Syncing…" : "Creating…")
              : isConfigured
                ? "Sync now"
                : "Create Sheet"}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Pillars section ────────────────────────────────────────────────────────────

function PillarsSection({ conveningId, canEdit }: { conveningId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: pillars = [], isLoading } = useListPillars(conveningId, {
    query: { queryKey: getListPillarsQueryKey(conveningId) },
  });
  const create = useCreatePillar();
  const update = useUpdatePillar();
  const remove = useDeletePillar();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setError(null);
    setShowAdd(true);
  }

  function openEdit(p: Pillar) {
    setEditingId(p.id);
    setFormName(p.name);
    setFormDesc(p.description ?? "");
    setError(null);
    setShowAdd(true);
  }

  function closeForm() {
    setShowAdd(false);
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setError(null);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await update.mutateAsync({ id: conveningId, pillarId: editingId, data: { name: formName.trim(), description: formDesc.trim() || undefined } });
      } else {
        await create.mutateAsync({ id: conveningId, data: { name: formName.trim(), description: formDesc.trim() || undefined } });
      }
      qc.invalidateQueries({ queryKey: getListPillarsQueryKey(conveningId) });
      closeForm();
    } catch {
      setError("Could not save pillar. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Pillar) {
    if (!confirm(`Delete pillar "${p.name}"? Partners assigned to this pillar will lose the assignment.`)) return;
    await remove.mutateAsync({ id: conveningId, pillarId: p.id });
    qc.invalidateQueries({ queryKey: getListPillarsQueryKey(conveningId) });
  }

  return (
    <SectionCard
      title="Thematic pillars"
      sub="Define focus areas that partners can be assigned to"
      canEdit={canEdit}
      action={canEdit && (
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add pillar
        </Button>
      )}
    >
      {/* Inline add/edit form */}
      {showAdd && (
        <div className="mb-4 rounded-lg p-4 space-y-3" style={{ background: "#F6F8FB", border: HL }}>
          <div>
            <FL>Pillar name *</FL>
            <input
              className="w-full rounded-md border text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              style={{ border: "0.5px solid #D1D9E0" }}
              placeholder="e.g. Digital Finance"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <FL>Description (optional)</FL>
            <textarea
              className="w-full rounded-md border text-sm px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              style={{ border: "0.5px solid #D1D9E0" }}
              rows={2}
              placeholder="Brief description of this pillar's focus"
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-[11px] text-red-600">{error}</p>
          )}
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={closeForm}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!formName.trim() || saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create pillar"}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-8 text-center text-[12px] text-[var(--brand-text-secondary)] animate-pulse">Loading pillars…</div>
      ) : pillars.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <Layers className="h-7 w-7 text-[var(--brand-text-secondary)] opacity-30 mx-auto" />
          <p className="text-[12px] text-[var(--brand-text-secondary)]">No pillars defined yet.</p>
          {canEdit && !showAdd && (
            <Button size="sm" variant="outline" className="mt-1" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add first pillar
            </Button>
          )}
        </div>
      ) : (
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: HL }}>
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">Name</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">Description</th>
              {canEdit && <th className="px-3 py-2 w-20" />}
            </tr>
          </thead>
          <tbody>
            {pillars.map(p => (
              <tr key={p.id} style={{ borderBottom: HL }} className="group">
                <td className="px-3 py-3">
                  <span className="font-medium text-[var(--brand-ink)] text-[13px]">{p.name}</span>
                </td>
                <td className="px-3 py-3 text-[12px] text-[var(--brand-text-secondary)]">
                  {p.description ?? <span className="text-[var(--brand-border)]">—</span>}
                </td>
                {canEdit && (
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-[var(--brand-tint)] transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void handleDelete(p)}
                        className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "convening",        label: "Convening details",       icon: Building2, section: "convening"         },
  { id: "branding",         label: "White-label & branding",  icon: Palette,   section: "branding"          },
  { id: "sponsorships",     label: "Sponsorship packages",    icon: Package,   section: "sponsorships"      },
  { id: "passTypes",        label: "Pass types",              icon: Ticket,    section: "passTypes"          },
  { id: "pillars",          label: "Thematic pillars",        icon: Layers,    section: "pillars"            },
  { id: "users",            label: "Users & roles",           icon: Users,     section: "users"             },
  { id: "convenings",       label: "Convenings",              icon: Copy,      section: "convenings"        },
  { id: "access-requests",  label: "Access requests",         icon: Inbox,     section: "access-requests"   },
  { id: "partner-access",   label: "Partner access",          icon: KeyRound,  section: "partner-access"    },
  { id: "delegate-exports", label: "Delegate export schedule", icon: Clock,    section: "delegate-exports"  },
  { id: "google-sheets",    label: "Google Sheets sync",      icon: Sheet,     section: "google-sheets"     },
] as const;

export default function Settings() {
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const { activeConvening, activeConveningId } = useConvening();
  const { data: convenings = [] } = useListConvenings({
    query: { queryKey: getListConveningsQueryKey() },
  });
  const search = useSearch();
  const urlSection = new URLSearchParams(search).get("section");

  const role = (me?.role ?? "Client") as Role;

  const visibleNav = NAV_ITEMS.filter(n => SECTION_VIEW[n.section]?.includes(role));
  const [activeSection, setActiveSection] = useState<string>(() => {
    if (urlSection && NAV_ITEMS.find(n => n.id === urlSection)) return urlSection;
    return visibleNav[0]?.id ?? "convening";
  });

  useEffect(() => {
    if (urlSection && NAV_ITEMS.find(n => n.id === urlSection)) {
      setActiveSection(urlSection);
    }
  }, [urlSection]);

  useEffect(() => {
    if (visibleNav.length > 0 && !visibleNav.find(n => n.id === activeSection)) {
      setActiveSection(visibleNav[0].id);
    }
  }, [role]);

  if (visibleNav.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <ShieldAlert className="h-8 w-8 text-[var(--brand-text-secondary)] opacity-40" />
        <p className="text-[14px] text-[var(--brand-ink)]">No settings accessible</p>
        <p className="text-[12px] text-[var(--brand-text-secondary)]">
          Your role ({labelFn(role)}) doesn't have access to any settings sections.
        </p>
      </div>
    );
  }

  const canEdit = (sectionId: string) => SECTION_EDIT[sectionId]?.includes(role) ?? false;

  function onSaved() {
    qc.invalidateQueries({ queryKey: getListConveningsQueryKey() });
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--brand-ink)]">Settings</h1>
        <p className="text-[13px] text-[var(--brand-text-secondary)] mt-0.5">
          Portal configuration for {activeConvening?.name ?? "the active convening"}
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left nav ── */}
        <nav className="w-48 shrink-0 space-y-0.5 sticky top-6">
          {visibleNav.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors text-left"
                style={isActive
                  ? { background: "var(--brand-primary)", color: "#fff" }
                  : { color: "var(--brand-text-secondary)" }
                }
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#EEF3F9"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ""; }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* ── Section content ── */}
        <div className="flex-1 min-w-0 space-y-5">
          {activeSection === "convening" && visibleNav.find(n => n.id === "convening") && (
            activeConvening
              ? <ConveningSection convening={activeConvening} canEdit={canEdit("convening")} onSaved={onSaved} />
              : <div className="rounded-[10px] px-6 py-10 text-center text-[13px] text-[var(--brand-text-secondary)]"
                  style={{ border: HL }}>
                  Select a convening from the sidebar to edit its details.
                </div>
          )}

          {activeSection === "branding" && visibleNav.find(n => n.id === "branding") && (
            activeConvening
              ? <BrandingSection convening={activeConvening} onSaved={onSaved} />
              : <div className="rounded-[10px] px-6 py-10 text-center text-[13px] text-[var(--brand-text-secondary)]"
                  style={{ border: HL }}>
                  Select a convening first.
                </div>
          )}

          {activeSection === "sponsorships" && visibleNav.find(n => n.id === "sponsorships") && (
            activeConveningId
              ? <SponsorshipsSection conveningId={activeConveningId} canEdit={canEdit("sponsorships")} />
              : <div className="rounded-[10px] px-6 py-10 text-center text-[13px] text-[var(--brand-text-secondary)]"
                  style={{ border: HL }}>
                  Select a convening first.
                </div>
          )}

          {activeSection === "passTypes" && visibleNav.find(n => n.id === "passTypes") && (
            activeConveningId
              ? <PassTypesSection conveningId={activeConveningId} canEdit={canEdit("passTypes")} />
              : <div className="rounded-[10px] px-6 py-10 text-center text-[13px] text-[var(--brand-text-secondary)]"
                  style={{ border: HL }}>
                  Select a convening first.
                </div>
          )}

          {activeSection === "pillars" && visibleNav.find(n => n.id === "pillars") && (
            activeConveningId
              ? <PillarsSection conveningId={activeConveningId} canEdit={canEdit("pillars")} />
              : <div className="rounded-[10px] px-6 py-10 text-center text-[13px] text-[var(--brand-text-secondary)]"
                  style={{ border: HL }}>
                  Select a convening first.
                </div>
          )}

          {activeSection === "users" && visibleNav.find(n => n.id === "users") && me && (
            <UsersSection me={me as unknown as PortalUser} convenings={convenings} />
          )}

          {activeSection === "convenings" && visibleNav.find(n => n.id === "convenings") && (
            <ConveningsSection convenings={convenings} />
          )}

          {activeSection === "access-requests" && visibleNav.find(n => n.id === "access-requests") && (
            <AccessRequestsSection convenings={convenings} />
          )}

          {activeSection === "partner-access" && visibleNav.find(n => n.id === "partner-access") && (
            <PartnerAccessSection convenings={convenings} />
          )}

          {activeSection === "delegate-exports" && visibleNav.find(n => n.id === "delegate-exports") && (
            activeConveningId
              ? <DelegateExportScheduleSection conveningId={activeConveningId} canEdit={canEdit("delegate-exports")} />
              : <div className="rounded-[10px] px-6 py-10 text-center text-[13px] text-[var(--brand-text-secondary)]"
                  style={{ border: HL }}>
                  Select a convening first.
                </div>
          )}

          {activeSection === "google-sheets" && visibleNav.find(n => n.id === "google-sheets") && (
            activeConveningId
              ? <GoogleSheetsSection convening={activeConvening ?? null} conveningId={activeConveningId} />
              : <div className="rounded-[10px] px-6 py-10 text-center text-[13px] text-[var(--brand-text-secondary)]"
                  style={{ border: HL }}>
                  Select a convening first.
                </div>
          )}
        </div>
      </div>
    </div>
  );
}
