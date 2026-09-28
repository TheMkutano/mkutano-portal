import { useState, useMemo } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { formatMoney } from "@/lib/money";
import { label } from "@/lib/labels";
import {
  listServiceProviders,
  useCreateServiceProvider,
  useListProviderBookings,
  useCreateProviderBooking,
  getListProviderBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck, Plus, ExternalLink, Pencil, Trash2, ChevronDown,
  CalendarDays, User, Link as LinkIcon, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens ─────────────────────────────────────────────────────────────
const MUTED = "var(--brand-text-secondary)";
const FL    = "block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1";

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  "VenueHotel", "Sound", "Stage", "Lighting", "AVStreaming", "Power",
  "InternetIT", "Graphics", "PrintSignage", "PhotoVideo", "MediaPR",
  "Catering", "Entertainment", "FurnitureDecor", "Gifting", "TravelLogistics",
  "Health", "Security", "ProtocolStaffing", "Interpretation", "Payments",
  "Insurance", "ExhibitionBuild", "Other",
] as const;

const PROCUREMENT_STATUSES = [
  "Identified", "Shortlisted", "Quoted", "Contracted", "Paid", "Completed", "OnHold",
] as const;

// ── Category dot colours (categorical) ───────────────────────────────────────
const CAT_DOT: Record<string, string> = {
  VenueHotel: "#2A6FB0",      Sound: "#8B5CF6",       Stage: "#7C3AED",
  Lighting: "#F59E0B",        AVStreaming: "#3B82F6",  Power: "#EF4444",
  InternetIT: "#06B6D4",      Graphics: "#EC4899",     PrintSignage: "#F97316",
  PhotoVideo: "#10B981",      MediaPR: "#6366F1",      Catering: "#00C49A",
  Entertainment: "#A855F7",   FurnitureDecor: "#84CC16", Gifting: "#F43F5E",
  TravelLogistics: "#0EA5E9", Health: "#22C55E",       Security: "#DC2626",
  ProtocolStaffing: "#7C3AED",Interpretation: "#0891B2", Payments: "#059669",
  Insurance: "#64748B",       ExhibitionBuild: "#92400E", Other: "#9CA3AF",
};

// ── §4 Tonal status badges ─────────────────────────────────────────────────────
interface BadgeStyle { bg: string; fg: string }

function procurementStyle(status: string | undefined): BadgeStyle {
  if (!status) return { bg: "#F1EFE8", fg: "#5A6472" };
  if (status === "Contracted" || status === "Paid" || status === "Completed")
    return { bg: "#E1F5EE", fg: "#0F6E56" };
  if (status === "Quoted" || status === "Shortlisted")
    return { bg: "#E6F1FB", fg: "#0C447C" };
  if (status === "OnHold")
    return { bg: "#FCEBEB", fg: "#A32D2D" };
  // Identified
  return { bg: "#F1EFE8", fg: "#5A6472" };
}

function TonalBadge({ text, style }: { text: string; style: BadgeStyle }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-[6px] whitespace-nowrap"
      style={{ background: style.bg, color: style.fg }}
    >
      {text}
    </span>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[40, 18, 20, 14, 10].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-3 rounded animate-pulse"
            style={{ width: `${w}%`, background: "var(--brand-border)", marginLeft: i >= 3 ? "auto" : undefined }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Form types ────────────────────────────────────────────────────────────────
type ProviderForm = {
  company: string; category: string; contactPerson: string;
  contactPhone: string; contactEmail: string; url: string; notes: string;
};
type BookingForm = {
  serviceProviderId: string; procurementStatus: string; estimatedCost: string;
  currency: string; contractUrl: string; responsiblePerson: string;
  scheduledStart: string; scheduledEnd: string; notes: string;
};

const emptyProvider: ProviderForm = {
  company: "", category: "VenueHotel", contactPerson: "",
  contactPhone: "", contactEmail: "", url: "", notes: "",
};
const emptyBooking: BookingForm = {
  serviceProviderId: "", procurementStatus: "Identified", estimatedCost: "",
  currency: "USD", contractUrl: "", responsiblePerson: "",
  scheduledStart: "", scheduledEnd: "", notes: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ServiceProviders() {
  const { activeConveningId } = useConvening();
  const { displayCurrency, usdToUgxRate } = useCurrency();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Which provider row is expanded
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Provider dialog
  const [providerDialog, setProviderDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [providerForm, setProviderForm] = useState<ProviderForm>(emptyProvider);
  const [savingProvider, setSavingProvider] = useState(false);

  // Booking dialog
  const [bookingDialog, setBookingDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [bookingForm, setBookingForm] = useState<BookingForm>(emptyBooking);
  const [savingBooking, setSavingBooking] = useState(false);

  // Data queries
  // Until the API client is regenerated, send the required event query explicitly.
  const providersKey = ["/api/service-providers", activeConveningId];
  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: providersKey,
    enabled: !!activeConveningId,
    queryFn: async (): Promise<Awaited<ReturnType<typeof listServiceProviders>>> => {
      const response = await fetch(`/api/service-providers?conveningId=${encodeURIComponent(activeConveningId!)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Failed to load service providers (${response.status})`);
      return response.json();
    },
  });
  const bookingsParams = { conveningId: activeConveningId ?? "" };
  const { data: bookings = [], isLoading: loadingBookings } = useListProviderBookings(
    bookingsParams,
    { query: { enabled: !!activeConveningId, queryKey: getListProviderBookingsQueryKey(bookingsParams) } },
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/service-providers"] });
    queryClient.invalidateQueries({ queryKey: getListProviderBookingsQueryKey() });
  };
  const scopedRequest = async (url: string, options: RequestInit) => {
    const response = await fetch(url, { credentials: "include", ...options });
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      const message = result?.error ?? `Request failed (${response.status})`;
      toast({ title: "Provider action failed", description: message, variant: "destructive" });
      throw new Error(message);
    }
    return response;
  };

  // Mutations
  const createProvider  = useCreateServiceProvider ({ mutation: { onSuccess: () => { invalidateAll(); setProviderDialog({ open: false }); } } });
  const createBooking   = useCreateProviderBooking ({ mutation: { onSuccess: () => { invalidateAll(); setBookingDialog({ open: false }); } } });

  // Booking lookup by providerId
  const bookingByProvider = useMemo(() => {
    const m: Record<string, typeof bookings[number]> = {};
    for (const b of bookings) m[b.serviceProviderId] = b;
    return m;
  }, [bookings]);

  // Stats
  const booked     = bookings.length;
  const contracted = bookings.filter(b =>
    b.procurementStatus === "Contracted" || b.procurementStatus === "Paid" || b.procurementStatus === "Completed"
  ).length;

  // ── Provider dialog helpers ──────────────────────────────────────────────
  const openAddProvider = () => {
    setProviderForm(emptyProvider);
    setProviderDialog({ open: true });
  };
  const openEditProvider = (p: typeof providers[number]) => {
    setProviderForm({
      company: p.company, category: p.category,
      contactPerson: p.contactPerson ?? "", contactPhone: p.contactPhone ?? "",
      contactEmail: p.contactEmail ?? "", url: p.url ?? "", notes: p.notes ?? "",
    });
    setProviderDialog({ open: true, editId: p.id });
  };
  const handleSaveProvider = async () => {
    if (!activeConveningId) return;
    const payload = {
      conveningId: activeConveningId,
      company: providerForm.company, category: providerForm.category,
      contactPerson: providerForm.contactPerson   || null,
      contactPhone:  providerForm.contactPhone    || null,
      contactEmail:  providerForm.contactEmail    || null,
      url:           providerForm.url             || null,
      notes:         providerForm.notes           || null,
    };
    if (providerDialog.editId) {
      setSavingProvider(true);
      try {
        await scopedRequest(`/api/service-providers/${encodeURIComponent(providerDialog.editId)}?conveningId=${encodeURIComponent(activeConveningId)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        invalidateAll();
        setProviderDialog({ open: false });
      } finally { setSavingProvider(false); }
    } else {
      await createProvider.mutateAsync({ data: payload });
    }
  };
  const handleDeleteProvider = async (id: string) => {
    if (!activeConveningId || !confirm("Delete this service provider and its bookings for this convening?")) return;
    await scopedRequest(`/api/service-providers/${encodeURIComponent(id)}?conveningId=${encodeURIComponent(activeConveningId)}`, {
      method: "DELETE",
    });
    invalidateAll();
    setExpandedId(null);
    toast({ title: "Provider deleted" });
  };
  const copyLegacyProvider = async (p: typeof providers[number]) => {
    if (!activeConveningId) return;
    const copy = {
      conveningId: activeConveningId,
      company: p.company, category: p.category,
      contactPerson: p.contactPerson, contactPhone: p.contactPhone,
      contactEmail: p.contactEmail, url: p.url, notes: p.notes,
    };
    await createProvider.mutateAsync({ data: copy });
    toast({ title: "Added a private copy for this convening" });
  };

  // ── Booking dialog helpers ───────────────────────────────────────────────
  const openBookProvider = (providerId: string) => {
    const existing = bookingByProvider[providerId];
    if (existing) {
      setBookingForm({
        serviceProviderId: providerId,
        procurementStatus: existing.procurementStatus,
        estimatedCost:     existing.estimatedCost?.toString() ?? "",
        currency:          existing.currency,
        contractUrl:       existing.contractUrl ?? "",
        responsiblePerson: existing.responsiblePerson ?? "",
        scheduledStart:    existing.scheduledStart
          ? new Date(existing.scheduledStart).toISOString().slice(0, 10) : "",
        scheduledEnd:      existing.scheduledEnd
          ? new Date(existing.scheduledEnd).toISOString().slice(0, 10) : "",
        notes:             existing.notes ?? "",
      });
      setBookingDialog({ open: true, editId: existing.id });
    } else {
      setBookingForm({ ...emptyBooking, serviceProviderId: providerId, currency: displayCurrency });
      setBookingDialog({ open: true });
    }
  };
  const handleSaveBooking = async () => {
    if (!activeConveningId) return;
    const payload = {
      conveningId:       activeConveningId,
      serviceProviderId: bookingForm.serviceProviderId,
      procurementStatus: bookingForm.procurementStatus,
      estimatedCost:     bookingForm.estimatedCost ? parseFloat(bookingForm.estimatedCost) : null,
      currency:          bookingForm.currency,
      contractUrl:       bookingForm.contractUrl       || null,
      responsiblePerson: bookingForm.responsiblePerson || null,
      scheduledStart:    bookingForm.scheduledStart    || null,
      scheduledEnd:      bookingForm.scheduledEnd      || null,
      notes:             bookingForm.notes             || null,
    };
    if (bookingDialog.editId) {
      setSavingBooking(true);
      try {
        await scopedRequest(`/api/provider-bookings/${encodeURIComponent(bookingDialog.editId)}?conveningId=${encodeURIComponent(activeConveningId)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        invalidateAll();
        setBookingDialog({ open: false });
      } finally { setSavingBooking(false); }
    } else {
      await createBooking.mutateAsync({ data: payload });
    }
  };
  const handleDeleteBooking = async (id: string) => {
    if (!activeConveningId) return;
    await scopedRequest(`/api/provider-bookings/${encodeURIComponent(id)}?conveningId=${encodeURIComponent(activeConveningId)}`, {
      method: "DELETE",
    });
    invalidateAll();
    toast({ title: "Booking removed" });
  };

  const isLoading = loadingProviders || loadingBookings;

  // ── Column header helper ─────────────────────────────────────────────────
  const TH_L = "px-4 py-2 text-left  text-[10px] font-semibold uppercase tracking-[0.08em]";
  const TH_R = "px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em]";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Service Providers</h1>
          <p className="text-[13px] mt-0.5" style={{ color: MUTED }}>
            Vendor directory &amp; procurement tracker
            {booked > 0 && (
              <span className="ml-2">
                · <span className="font-medium text-[var(--brand-ink)]">{contracted}</span>
                <span> of {booked} contracted</span>
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          disabled={!activeConveningId}
          className="shrink-0 gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
          onClick={openAddProvider}
        >
          <Plus className="h-4 w-4" /> Add provider
        </Button>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
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
              <th className={TH_L} style={{ color: MUTED }}>Company</th>
              <th className={TH_L} style={{ color: MUTED }}>Category</th>
              <th className={TH_L} style={{ color: MUTED }}>Contact</th>
              <th className={TH_L} style={{ color: MUTED }}>Booking Status</th>
              <th className={TH_R} style={{ color: MUTED }}>Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : providers.length === 0 ? (
              // §6 Empty state
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <Truck className="h-9 w-9 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
                  <p className="text-[14px] font-medium text-[var(--brand-ink)] mb-1">
                    No service providers yet
                  </p>
                  <p className="text-[13px] mb-4" style={{ color: MUTED }}>
                     Add providers for this convening.
                  </p>
                  <Button
                    size="sm"
                    className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
                    onClick={openAddProvider}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add provider
                  </Button>
                </td>
              </tr>
            ) : (
              providers.map(provider => {
                const isLegacy = !(provider as typeof provider & { conveningId?: string | null }).conveningId;
                const booking   = bookingByProvider[provider.id];
                const isOpen    = expandedId === provider.id;
                const dotColor  = CAT_DOT[provider.category] ?? "#9CA3AF";
                const bStyle    = procurementStyle(booking?.procurementStatus);

                const estCost = booking?.estimatedCost != null
                  ? formatMoney(booking.estimatedCost, booking.currency, displayCurrency, usdToUgxRate)
                  : "—";

                return (
                  <>
                    {/* ── Provider row ─────────────────────────────────── */}
                    <tr
                      key={provider.id}
                      className="cursor-pointer group transition-colors"
                      style={{
                        height: 44,
                        borderBottom: isOpen ? "none" : "1px solid var(--brand-border)",
                        background: isOpen ? "var(--brand-tint)" : undefined,
                      }}
                      onClick={() => setExpandedId(isOpen ? null : provider.id)}
                      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = "var(--brand-tint)"; }}
                      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = ""; }}
                    >
                      {/* Company */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronDown
                            className="h-3.5 w-3.5 shrink-0 transition-transform"
                            style={{
                              color: MUTED,
                              transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                            }}
                          />
                          <span className="text-[13px] font-medium text-[var(--brand-ink)] truncate">
                            {provider.company}
                          </span>
                          {provider.url && (
                            <a
                              href={provider.url.startsWith("http") ? provider.url : `https://${provider.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="shrink-0 transition-colors"
                              style={{ color: MUTED }}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: dotColor }}
                          />
                          <span className="text-[13px]" style={{ color: MUTED }}>
                            {label(provider.category)}
                          </span>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-2.5">
                        {provider.contactPerson ? (
                          <div>
                            <p className="text-[13px] text-[var(--brand-ink)]">
                              {provider.contactPerson}
                            </p>
                            {provider.contactEmail && (
                              <p className="text-[11px] truncate" style={{ color: MUTED }}>
                                {provider.contactEmail}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: MUTED }}>—</span>
                        )}
                      </td>

                      {/* Booking status — tonal badge (§4) */}
                      <td className="px-4 py-2.5">
                        {activeConveningId ? (
                          booking ? (
                            <TonalBadge text={label(booking.procurementStatus)} style={bStyle} />
                          ) : (
                            <TonalBadge
                              text="Not booked"
                              style={{ bg: "#F1EFE8", fg: "#5A6472" }}
                            />
                          )
                        ) : (
                          <span style={{ color: MUTED }}>—</span>
                        )}
                      </td>

                      {/* Est. cost — right-aligned, tabular-nums */}
                      <td className="px-4 py-2.5 text-right text-[13px] font-medium tabular-nums"
                        style={{ color: estCost === "—" ? MUTED : "var(--brand-ink)" }}>
                        {estCost}
                      </td>
                    </tr>

                    {/* ── Provider detail (expanded) ───────────────────── */}
                    {isOpen && (
                      <tr
                        key={`${provider.id}-detail`}
                        style={{ borderBottom: "1px solid var(--brand-border)", background: "var(--brand-tint)" }}
                      >
                        <td colSpan={5} className="px-6 pb-5 pt-0">
                          <div className="grid grid-cols-2 gap-6 pt-1">

                            {/* Left — Provider contact details */}
                            <div className="space-y-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                                Provider
                              </p>
                              <div className="space-y-1.5 text-[13px]">
                                {provider.contactPerson && (
                                  <div className="flex items-center gap-2">
                                    <User className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
                                    <span className="text-[var(--brand-ink)]">{provider.contactPerson}</span>
                                    {provider.contactPhone && (
                                      <span style={{ color: MUTED }}>· {provider.contactPhone}</span>
                                    )}
                                  </div>
                                )}
                                {provider.contactEmail && (
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
                                    <a
                                      href={`mailto:${provider.contactEmail}`}
                                      className="hover:underline"
                                      style={{ color: "var(--brand-primary)" }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      {provider.contactEmail}
                                    </a>
                                  </div>
                                )}
                                {provider.url && (
                                  <div className="flex items-center gap-2">
                                    <LinkIcon className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
                                    <a
                                      href={provider.url.startsWith("http") ? provider.url : `https://${provider.url}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline truncate"
                                      style={{ color: "var(--brand-primary)" }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      {provider.url}
                                    </a>
                                  </div>
                                )}
                                {provider.notes && (
                                  <p style={{ color: MUTED }}>{provider.notes}</p>
                                )}
                              </div>
                               {/* Legacy shared records remain read-only; a private copy can be edited. */}
                              <div className="flex gap-2 pt-1">
                                 {isLegacy ? (
                                   <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1"
                                     onClick={e => { e.stopPropagation(); copyLegacyProvider(provider); }}>
                                     <Plus className="h-3 w-3" /> Copy to this convening
                                   </Button>
                                 ) : (
                                   <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs gap-1"
                                  onClick={e => { e.stopPropagation(); openEditProvider(provider); }}
                                >
                                  <Pencil className="h-3 w-3" /> Edit provider
                                </Button>
                                   </>
                                 )}
                                   {!isLegacy && <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2.5 text-xs gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={e => { e.stopPropagation(); handleDeleteProvider(provider.id); }}
                                >
                                  <Trash2 className="h-3 w-3" /> Delete
                                   </Button>}
                              </div>
                            </div>

                            {/* Right — Booking details */}
                            <div className="space-y-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                                Booking (this convening)
                              </p>
                              {!activeConveningId ? (
                                <p className="text-[13px]" style={{ color: MUTED }}>Select a convening to manage bookings.</p>
                              ) : booking ? (
                                <div className="space-y-1.5 text-[13px]">
                                  <div className="flex items-center gap-2">
                                    <TonalBadge
                                      text={label(booking.procurementStatus)}
                                      style={procurementStyle(booking.procurementStatus)}
                                    />
                                    {booking.estimatedCost != null && (
                                      <span className="font-medium tabular-nums text-[var(--brand-ink)]">
                                        {formatMoney(booking.estimatedCost, booking.currency, displayCurrency, usdToUgxRate)}
                                      </span>
                                    )}
                                  </div>
                                  {(booking.scheduledStart || booking.scheduledEnd) && (
                                    <div className="flex items-center gap-2" style={{ color: MUTED }}>
                                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        {fmtDate(booking.scheduledStart)}
                                        {booking.scheduledEnd && ` – ${fmtDate(booking.scheduledEnd)}`}
                                      </span>
                                    </div>
                                  )}
                                  {booking.responsiblePerson && (
                                    <div className="flex items-center gap-2" style={{ color: MUTED }}>
                                      <User className="h-3.5 w-3.5 shrink-0" />
                                      <span>{booking.responsiblePerson}</span>
                                    </div>
                                  )}
                                  {booking.contractUrl && (
                                    <div className="flex items-center gap-2">
                                      <LinkIcon className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
                                      <a
                                        href={booking.contractUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline truncate text-[13px]"
                                        style={{ color: "var(--brand-primary)" }}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        Contract / document
                                      </a>
                                    </div>
                                  )}
                                  {booking.notes && (
                                    <p style={{ color: MUTED }}>{booking.notes}</p>
                                  )}
                                  {/* Booking actions */}
                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2.5 text-xs gap-1"
                                      onClick={e => { e.stopPropagation(); openBookProvider(provider.id); }}
                                    >
                                      <Pencil className="h-3 w-3" /> Edit booking
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2.5 text-xs gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                                      onClick={e => { e.stopPropagation(); handleDeleteBooking(booking.id); }}
                                    >
                                      <Trash2 className="h-3 w-3" /> Remove
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-[13px] mb-3" style={{ color: MUTED }}>
                                    This provider hasn't been booked for this convening yet.
                                  </p>
                                  <Button
                                    size="sm"
                                    className="h-7 px-3 text-xs bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
                                    onClick={e => { e.stopPropagation(); openBookProvider(provider.id); }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" /> Book for this convening
                                  </Button>
                                </div>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add / Edit Provider modal (§5) ───────────────────────────────── */}
      <Modal
        open={providerDialog.open}
        onClose={() => setProviderDialog({ open: false })}
        title={providerDialog.editId ? "Edit provider" : "New service provider"}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProviderDialog({ open: false })}>Cancel</Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={!providerForm.company || createProvider.isPending || savingProvider}
              onClick={handleSaveProvider}
            >
              {providerDialog.editId ? "Save changes" : "Add provider"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={FL}>Company *</label>
              <Input
                value={providerForm.company}
                onChange={e => setProviderForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Company name"
              />
            </div>
            <div className="col-span-2">
              <label className={FL}>Category *</label>
              <Select value={providerForm.category} onValueChange={v => setProviderForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{label(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={FL}>Contact person</label>
              <Input
                value={providerForm.contactPerson}
                onChange={e => setProviderForm(f => ({ ...f, contactPerson: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className={FL}>Phone</label>
              <Input
                value={providerForm.contactPhone}
                onChange={e => setProviderForm(f => ({ ...f, contactPhone: e.target.value }))}
                placeholder="+256…"
              />
            </div>
            <div className="col-span-2">
              <label className={FL}>Email</label>
              <Input
                value={providerForm.contactEmail}
                onChange={e => setProviderForm(f => ({ ...f, contactEmail: e.target.value }))}
                placeholder="contact@vendor.com"
              />
            </div>
            <div className="col-span-2">
              <label className={FL}>Website URL</label>
              <Input
                value={providerForm.url}
                onChange={e => setProviderForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="col-span-2">
              <label className={FL}>Notes</label>
              <Input
                value={providerForm.notes}
                onChange={e => setProviderForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Add / Edit Booking modal (§5) ────────────────────────────────── */}
      <Modal
        open={bookingDialog.open}
        onClose={() => setBookingDialog({ open: false })}
        title={bookingDialog.editId ? "Edit booking" : "Book provider"}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBookingDialog({ open: false })}>Cancel</Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={createBooking.isPending || savingBooking}
              onClick={handleSaveBooking}
            >
              {bookingDialog.editId ? "Save changes" : "Book provider"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <div>
            <label className={FL}>Procurement status</label>
            <Select
              value={bookingForm.procurementStatus}
              onValueChange={v => setBookingForm(f => ({ ...f, procurementStatus: v }))}
            >
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROCUREMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FL}>Estimated cost</label>
              <Input
                type="number"
                value={bookingForm.estimatedCost}
                onChange={e => setBookingForm(f => ({ ...f, estimatedCost: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className={FL}>Currency</label>
              <Select
                value={bookingForm.currency}
                onValueChange={v => setBookingForm(f => ({ ...f, currency: v }))}
              >
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="UGX">UGX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className={FL}>Responsible person</label>
            <Input
              value={bookingForm.responsiblePerson}
              onChange={e => setBookingForm(f => ({ ...f, responsiblePerson: e.target.value }))}
              placeholder="Team member name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FL}>Scheduled start</label>
              <Input
                type="date"
                value={bookingForm.scheduledStart}
                onChange={e => setBookingForm(f => ({ ...f, scheduledStart: e.target.value }))}
              />
            </div>
            <div>
              <label className={FL}>Scheduled end</label>
              <Input
                type="date"
                value={bookingForm.scheduledEnd}
                onChange={e => setBookingForm(f => ({ ...f, scheduledEnd: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className={FL}>Contract / document URL</label>
            <Input
              value={bookingForm.contractUrl}
              onChange={e => setBookingForm(f => ({ ...f, contractUrl: e.target.value }))}
              placeholder="Drive / Notion link"
            />
          </div>
          <div>
            <label className={FL}>Notes</label>
            <Input
              value={bookingForm.notes}
              onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
        </div>
      </Modal>

    </div>
  );
}
