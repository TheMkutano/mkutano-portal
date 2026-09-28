import { useState, useMemo, useRef, useEffect } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import { projectObjectUrl } from "@/lib/projectObjectUrl";
import {
  useListSpeakers,
  useCreateSpeaker,
  useUpdateSpeaker,
  useDeleteSpeaker,
  useUpdateSpeakerEngagement,
  useCreateConsent,
  useAddSessionSpeaker,
  useRemoveSessionSpeaker,
  useListSessions,
  useListPillars,
  getListSpeakersQueryKey,
  getListSessionsQueryKey,
  getListPillarsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import {
  Plus, Search, Mic, AlertCircle, Camera, Video, Radio, FileText, Share2, Globe,
  CalendarDays, ChevronDown, Pencil, Trash2, FileSpreadsheet,
} from "lucide-react";
import { exportXlsx } from "@/lib/exportXlsx";
import { label } from "@/lib/labels";
import type { SpeakerWithConsent, AgendaSession } from "@workspace/api-client-react";

// ── Constants ────────────────────────────────────────────────────────────────
const GENDERS            = ["Male", "Female", "NonBinary", "PreferNotToSay"] as const;
const AFFILIATION_TYPES  = ["Public", "Private", "DevelopmentPartner", "Academic", "Other"] as const;
const SPEAKER_CATEGORIES = ["PartnerLinked", "NonPartnerLinked", "AdvisoryBoard", "Internal"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  PartnerLinked:    "Partner-linked",
  NonPartnerLinked: "Non partner-linked",
  AdvisoryBoard:    "Advisory board",
  Internal:         "Internal",
};
const CATEGORY_STYLE: Record<string, { bg: string; fg: string }> = {
  PartnerLinked:    { bg: "#EEF3F9", fg: "#2A6FB0" },
  NonPartnerLinked: { bg: "#F4F5F6", fg: "#6C7A99" },
  AdvisoryBoard:    { bg: "#F5EEF9", fg: "#7B4FA6" },
  Internal:         { bg: "#E8F5ED", fg: "#2E7D5B" },
};
function CategoryBadge({ category }: { category?: string | null }) {
  if (!category) return <span className="text-[var(--brand-border)]">—</span>;
  const s = CATEGORY_STYLE[category] ?? { bg: "#F4F5F6", fg: "#6C7A99" };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}
const INVITATION_STATUSES= ["Identified", "Invited", "Confirmed", "Briefed", "Ready", "Attended", "Thanked"] as const;
const CONSENT_STATUSES   = ["NotRequested", "Pending", "Granted", "PartiallyGranted", "Declined", "Withdrawn"] as const;
const SPEAKER_ROLES      = ["Speaker", "Panelist", "Moderator", "Chair"] as const;
const BREAK_FORMATS      = new Set(["Break", "Intermission"]);
const CONFIRMED_STATUSES = new Set(["Confirmed", "Briefed", "Ready", "Attended", "Thanked"]);

// ── Consent badge ─────────────────────────────────────────────────────────────
const CONSENT_STYLE: Record<string, { bg: string; fg: string; text: string }> = {
  Granted:          { bg: "#E8F5ED", fg: "#2E7D5B", text: "Granted"       },
  PartiallyGranted: { bg: "#EEF3F9", fg: "#2A6FB0", text: "Partial"       },
  Pending:          { bg: "#FBF3E2", fg: "#8A6516", text: "Pending"       },
  Declined:         { bg: "#FCEAE8", fg: "#B5462F", text: "Declined"      },
  Withdrawn:        { bg: "#F4F5F6", fg: "#6C7A99", text: "Withdrawn"     },
  NotRequested:     { bg: "#F4F5F6", fg: "#9AA4B0", text: "Not requested" },
};

function ConsentBadge({ status }: { status: string | null | undefined }) {
  const s = CONSENT_STYLE[status ?? "NotRequested"] ?? CONSENT_STYLE.NotRequested;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {s.text}
    </span>
  );
}

// ── Invitation status badge ───────────────────────────────────────────────────
function InvitationBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-[var(--brand-border)]">—</span>;
  const isConfirmed = CONFIRMED_STATUSES.has(status);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={isConfirmed
        ? { background: "#E8F5ED", color: "#2E7D5B" }
        : { background: "#FBF3E2", color: "#8A6516" }
      }
    >
      {label(status)}
    </span>
  );
}

// ── Gender badge ──────────────────────────────────────────────────────────────
const GENDER_STYLE: Record<string, { bg: string; fg: string }> = {
  Female:         { bg: "#EEF3F9", fg: "#2A6FB0" },
  Male:           { bg: "#F0F2F4", fg: "#5A6472" },
  NonBinary:      { bg: "#F5EEF9", fg: "#7B4FA6" },
  PreferNotToSay: { bg: "#F4F5F6", fg: "#9AA4B0" },
};

function GenderBadge({ gender }: { gender: string | null | undefined }) {
  if (!gender) return <span className="text-[var(--brand-border)]">—</span>;
  const s = GENDER_STYLE[gender] ?? { bg: "#F4F5F6", fg: "#6C7A99" };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {label(gender)}
    </span>
  );
}

// ── Sector badge ──────────────────────────────────────────────────────────────
const AFFILIATION_STYLE: Record<string, { bg: string; fg: string; text: string }> = {
  Public:             { bg: "#EEF3F9", fg: "#2A6FB0", text: "Public"       },
  Private:            { bg: "#E8F5ED", fg: "#2E7D5B", text: "Private"      },
  DevelopmentPartner: { bg: "#F5EEF9", fg: "#7B4FA6", text: "Dev. Partner" },
  Academic:           { bg: "#FBF3E2", fg: "#8A6516", text: "Academic"     },
  Other:              { bg: "#F4F5F6", fg: "#6C7A99", text: "Other"        },
};

function SectorBadge({ affiliationType }: { affiliationType: string | null | undefined }) {
  if (!affiliationType) return <span className="text-[var(--brand-border)]">—</span>;
  const s = AFFILIATION_STYLE[affiliationType] ?? { bg: "#F4F5F6", fg: "#6C7A99", text: affiliationType };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {s.text}
    </span>
  );
}

// ── Due date cell ─────────────────────────────────────────────────────────────
function DueCell({ dueDate, engagementStatus }: { dueDate?: string | null; engagementStatus?: string | null }) {
  if (!dueDate) return <span className="text-[var(--brand-border)]">—</span>;
  const isConfirmed = CONFIRMED_STATUSES.has(engagementStatus ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !isConfirmed && dueDate < today;
  return (
    <span className={`text-[12px] font-mono ${isOverdue ? "text-red-600 font-semibold" : "text-[var(--brand-text-secondary)]"}`}>
      {dueDate}
    </span>
  );
}

// ── Initials avatar ───────────────────────────────────────────────────────────
function InitialsAvatar({ name, photoUrl, hasPhotoConsent, conveningId }: {
  name: string; photoUrl?: string | null; hasPhotoConsent?: boolean; conveningId: string | null | undefined;
}) {
  const initials = name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  if (photoUrl && hasPhotoConsent) {
    return <img src={projectObjectUrl(photoUrl, conveningId)} alt={name} className="w-7 h-7 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-7 h-7 rounded-full bg-[var(--brand-tint)] flex items-center justify-center text-[var(--brand-primary)] text-[10px] font-bold shrink-0">
      {initials}
    </div>
  );
}

// ── Inline session picker ─────────────────────────────────────────────────────
function SessionCell({
  speaker,
  programSessions,
  invalidate,
}: {
  speaker: SpeakerWithConsent;
  programSessions: AgendaSession[];
  invalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const addSession    = useAddSessionSpeaker({ mutation: { onSuccess: invalidate } });
  const removeSession = useRemoveSessionSpeaker({ mutation: { onSuccess: invalidate } });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const speakerSessionIds = new Set(speaker.sessions?.map((s) => s.sessionId));
  const currentSessions   = speaker.sessions ?? [];

  const toggle = async (sessionId: string) => {
    if (speakerSessionIds.has(sessionId)) {
      await removeSession.mutateAsync({ sessionId, speakerId: speaker.id });
    } else {
      await addSession.mutateAsync({
        id: sessionId,
        data: { speakerId: speaker.id, role: "Speaker", status: "Proposed" },
      });
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        className="flex items-center gap-1 flex-wrap max-w-[180px] text-left"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        {currentSessions.length === 0 ? (
          <span className="text-[11px] text-[var(--brand-text-secondary)] hover:text-[var(--brand-primary)] transition-colors flex items-center gap-0.5">
            <Plus className="h-3 w-3" /> session
          </span>
        ) : (
          <>
            {currentSessions.slice(0, 2).map((s) => (
              <span
                key={s.sessionId}
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight"
                style={{ background: "#EEF3F9", color: "#2A6FB0" }}
                title={s.sessionTitle ?? undefined}
              >
                {(s.sessionTitle ?? "Session").split(" ").slice(0, 3).join(" ")}
              </span>
            ))}
            {currentSessions.length > 2 && (
              <span className="text-[10px] text-[var(--brand-text-secondary)]">
                +{currentSessions.length - 2}
              </span>
            )}
            <ChevronDown className="h-3 w-3 text-[var(--brand-text-secondary)] shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 top-full mt-1 w-72 bg-white rounded-lg border shadow-lg overflow-hidden"
          style={{ borderColor: "var(--brand-border)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]"
            style={{ borderColor: "var(--brand-border)" }}>
            Assign sessions
          </div>
          <div className="max-h-56 overflow-y-auto divide-y" style={{ borderColor: "var(--brand-border)" }}>
            {programSessions.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-[var(--brand-text-secondary)]">
                No sessions — add agenda sessions first.
              </p>
            ) : (
              programSessions.map((s) => {
                const checked = speakerSessionIds.has(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex items-start gap-2.5 px-3 py-2 hover:bg-[var(--brand-tint)] cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => void toggle(s.id)}
                      className="mt-0.5 accent-[var(--brand-primary)] shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[var(--brand-ink)] truncate">{s.title}</p>
                      <p className="text-[10px] text-[var(--brand-text-secondary)]">
                        {s.day} · {s.startTime}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Consent toggle row ────────────────────────────────────────────────────────
function ConsentToggle({ icon, label: rowLabel, checked, onChange }: {
  icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer py-1.5 group">
      <span className="text-[var(--brand-text-secondary)] group-hover:text-[var(--brand-primary)] transition-colors shrink-0">{icon}</span>
      <span className="flex-1 text-sm text-[var(--brand-ink)]">{rowLabel}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={["relative w-9 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] shrink-0", checked ? "bg-[var(--brand-primary)]" : "bg-[var(--brand-border)]"].join(" ")}
      >
        <span className={["absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0"].join(" ")} />
      </button>
    </label>
  );
}

// ── Field label ───────────────────────────────────────────────────────────────
function FL({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1">
      {children}
    </label>
  );
}

// ── Form state ────────────────────────────────────────────────────────────────
interface ConsentForm {
  photographyConsent: boolean;
  videoRecordingConsent: boolean;
  liveStreamConsent: boolean;
  nameAndBioPublication: boolean;
  socialMediaUse: boolean;
  thirdPartyMediaSharing: boolean;
  status: string;
  notes: string;
}

interface FormState {
  name: string;
  title: string;
  gender: string;
  email: string;
  phone: string;
  location: string;
  affiliationType: string;
  speakerCategory: string;
  notes: string;
  invitationStatus: string;
  engagementDueDate: string;
  pillarId: string;
  addConsent: boolean;
  consent: ConsentForm;
  selectedSessions: Record<string, string>;
}

const BLANK_CONSENT: ConsentForm = {
  photographyConsent: false,
  videoRecordingConsent: false,
  liveStreamConsent: false,
  nameAndBioPublication: true,
  socialMediaUse: false,
  thirdPartyMediaSharing: false,
  status: "Pending",
  notes: "",
};

const BLANK: FormState = {
  name: "",
  title: "",
  gender: "",
  email: "",
  phone: "",
  location: "",
  affiliationType: "",
  speakerCategory: "",
  notes: "",
  invitationStatus: "Identified",
  engagementDueDate: "",
  pillarId: "",
  addConsent: false,
  consent: BLANK_CONSENT,
  selectedSessions: {},
};

// ─────────────────────────────────────────────────────────────────────────────
export default function Speakers() {
  const { activeConveningId } = useConvening();
  const queryClient = useQueryClient();
  const [search,        setSearch]        = useState("");
  const [pillarFilter,  setPillarFilter]  = useState<string>("All");
  const [showDialog,    setShowDialog]    = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [createError,   setCreateError]  = useState<string | null>(null);
  const [form,          setForm]          = useState<FormState>(BLANK);
  const [sessionSearch, setSessionSearch] = useState("");
  const [editingSpeaker, setEditingSpeaker] = useState<SpeakerWithConsent | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const params = { conveningId: activeConveningId ?? "" };
  const { data: speakers, isLoading } = useListSpeakers(params, {
    query: { enabled: !!activeConveningId, queryKey: getListSpeakersQueryKey(params) },
  });

  const sessionParams = { conveningId: activeConveningId ?? "" };
  const { data: rawSessions = [] } = useListSessions(sessionParams, {
    query: { enabled: !!activeConveningId, queryKey: getListSessionsQueryKey(sessionParams) },
  });

  const pillarParams = activeConveningId ?? "";
  const { data: pillars = [] } = useListPillars(pillarParams, {
    query: { enabled: !!activeConveningId, queryKey: getListPillarsQueryKey(pillarParams) },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createSpeaker           = useCreateSpeaker();
  const updateSpeaker           = useUpdateSpeaker();
  const deleteSpeaker           = useDeleteSpeaker();
  const updateSpeakerEngagement = useUpdateSpeakerEngagement();

  const handleDelete = async (speaker: SpeakerWithConsent) => {
    if (!confirm(`Delete speaker "${speaker.name}"? This cannot be undone.`)) return;
    await deleteSpeaker.mutateAsync({ id: speaker.id, params: { conveningId: activeConveningId ?? "" } });
    queryClient.invalidateQueries({ queryKey: getListSpeakersQueryKey(params) });
  };
  const createConsent           = useCreateConsent();
  const addSessionSpeaker       = useAddSessionSpeaker();

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const bySearch = (speakers ?? []).filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.title?.toLowerCase().includes(search.toLowerCase()) ?? false),
    );
    if (pillarFilter === "All") return bySearch;
    return bySearch.filter(
      (s) => (s as SpeakerWithConsent & { pillarId?: string | null }).pillarId === pillarFilter,
    );
  }, [speakers, search, pillarFilter]);

  const programSessions = useMemo(() =>
    rawSessions.filter((s) => !BREAK_FORMATS.has(s.format)),
  [rawSessions]);

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.toLowerCase();
    return q
      ? programSessions.filter((s) =>
          s.title.toLowerCase().includes(q) || s.track.toLowerCase().includes(q),
        )
      : programSessions;
  }, [programSessions, sessionSearch]);

  if (!activeConveningId) return null;

  const isEditing = editingSpeaker !== null;
  const selectedCount = Object.keys(form.selectedSessions).length;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setConsent = <K extends keyof ConsentForm>(k: K, v: ConsentForm[K]) =>
    setForm((f) => ({ ...f, consent: { ...f.consent, [k]: v } }));

  const toggleSession = (sessionId: string) =>
    setForm((f) => {
      const next = { ...f.selectedSessions };
      if (next[sessionId]) {
        delete next[sessionId];
      } else {
        next[sessionId] = "Speaker";
      }
      return { ...f, selectedSessions: next };
    });

  const setSessionRole = (sessionId: string, role: string) =>
    setForm((f) => ({ ...f, selectedSessions: { ...f.selectedSessions, [sessionId]: role } }));

  const invalidateSpeakers = () =>
    queryClient.invalidateQueries({ queryKey: getListSpeakersQueryKey(params) });

  const handleClose = () => {
    setShowDialog(false);
    setCreateError(null);
    setSessionSearch("");
    setForm(BLANK);
    setEditingSpeaker(null);
  };

  function openEdit(speaker: SpeakerWithConsent) {
    setForm({
      name:             speaker.name,
      title:            speaker.title ?? "",
      gender:           speaker.gender ?? "",
      email:            speaker.email ?? "",
      phone:            "",
      location:         speaker.location ?? "",
      affiliationType:  speaker.affiliationType ?? "",
      speakerCategory:  speaker.speakerCategory ?? "",
      notes:            speaker.notes ?? "",
      invitationStatus: speaker.engagementStatus ?? "Identified",
      engagementDueDate: speaker.engagementDueDate ?? "",
      pillarId:         (speaker as SpeakerWithConsent & { pillarId?: string | null }).pillarId ?? "",
      addConsent:       false,
      consent:          BLANK_CONSENT,
      selectedSessions: {},
    });
    setEditingSpeaker(speaker);
    setShowDialog(true);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !activeConveningId) return;
    setSubmitting(true);
    setCreateError(null);

    // ── Edit mode ──
    if (isEditing && editingSpeaker) {
      try {
        await updateSpeaker.mutateAsync({
          id: editingSpeaker.id,
          data: {
            conveningId: activeConveningId,
            name:            form.name,
            title:           form.title           || undefined,
            gender:          form.gender          || undefined,
            email:           form.email           || undefined,
            location:        form.location        || undefined,
            affiliationType: (form.affiliationType || undefined) as typeof AFFILIATION_TYPES[number] | undefined,
            speakerCategory: (form.speakerCategory || undefined) as typeof SPEAKER_CATEGORIES[number] | undefined,
            notes:           form.notes           || undefined,
          },
        });
        const engId = (editingSpeaker as SpeakerWithConsent & { engagementId?: string | null }).engagementId;
        if (engId) {
          await updateSpeakerEngagement.mutateAsync({
            id: engId,
            data: {
              invitationStatus: form.invitationStatus as "Identified",
              ...(form.engagementDueDate ? { dueDate: form.engagementDueDate } : {}),
              pillarId: form.pillarId || null,
            },
          });
        }
      } catch {
        setCreateError("Could not save changes. Please try again.");
        setSubmitting(false);
        return;
      }
      invalidateSpeakers();
      setSubmitting(false);
      handleClose();
      return;
    }

    // ── Create mode ──
    let speaker: { id: string; engagementId?: string };
    try {
      speaker = await createSpeaker.mutateAsync({
        data: {
          conveningId: activeConveningId,
          name:            form.name,
          title:           form.title           || undefined,
          gender:          form.gender          || undefined,
          email:           form.email           || undefined,
          phone:           form.phone           || undefined,
          location:        form.location        || undefined,
          affiliationType: (form.affiliationType || undefined) as typeof AFFILIATION_TYPES[number] | undefined,
          speakerCategory: (form.speakerCategory || undefined) as typeof SPEAKER_CATEGORIES[number] | undefined,
          notes:           form.notes           || undefined,
        },
      });
    } catch {
      setCreateError("Could not create speaker record. Please try again.");
      setSubmitting(false);
      return;
    }

    if (speaker.engagementId && (form.invitationStatus !== "Identified" || form.engagementDueDate || form.pillarId)) {
      try {
        await updateSpeakerEngagement.mutateAsync({ id: speaker.engagementId, data: {
          invitationStatus: form.invitationStatus as "Identified",
          ...(form.engagementDueDate ? { dueDate: form.engagementDueDate } : {}),
          pillarId: form.pillarId || null,
        } });
      } catch {
        setCreateError("Speaker linked, but invitation details could not be saved. Please retry editing.");
        invalidateSpeakers(); setSubmitting(false); return;
      }
    }

    if (form.addConsent) {
      try {
        await createConsent.mutateAsync({
          data: {
            speakerId:              speaker.id,
            conveningId:            activeConveningId,
            photographyConsent:     form.consent.photographyConsent,
            videoRecordingConsent:  form.consent.videoRecordingConsent,
            liveStreamConsent:      form.consent.liveStreamConsent,
            nameAndBioPublication:  form.consent.nameAndBioPublication,
            socialMediaUse:         form.consent.socialMediaUse,
            thirdPartyMediaSharing: form.consent.thirdPartyMediaSharing,
            status:                 form.consent.status as "Pending",
            capturedVia:            "AdminRecorded" as const,
            ...(form.consent.notes ? { notes: form.consent.notes } : {}),
          },
        });
      } catch {
        // non-fatal — consent can be added from detail page
      }
    }

    for (const [sessionId, role] of Object.entries(form.selectedSessions)) {
      try {
        await addSessionSpeaker.mutateAsync({
          id: sessionId,
          data: { speakerId: speaker.id, role: role as typeof SPEAKER_ROLES[number], status: "Proposed" },
        });
      } catch {
        // non-fatal
      }
    }
    if (Object.keys(form.selectedSessions).length > 0) {
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey(sessionParams) });
    }

    invalidateSpeakers();
    setSubmitting(false);
    handleClose();
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: Column<SpeakerWithConsent>[] = [
    {
      id: "name",
      header: "Speaker",
      cell: (s) => (
        <div className="flex items-center gap-2.5">
          <InitialsAvatar
            conveningId={activeConveningId}
            name={s.name}
            photoUrl={s.photoUrl}
            hasPhotoConsent={s.consentStatus === "Granted" || s.consentStatus === "PartiallyGranted"}
          />
          <div className="min-w-0">
            <Link
              href={`/speakers/${s.id}`}
              className="font-medium text-[var(--brand-ink)] hover:text-[var(--brand-primary)] transition-colors block truncate"
            >
              {s.name}
            </Link>
            {s.email && (
              <span className="text-[11px] text-[var(--brand-text-secondary)] truncate block">{s.email}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "title",
      header: "Title / Role",
      cell: (s) =>
        s.title
          ? <span className="text-sm text-[var(--brand-text-secondary)]">{s.title}</span>
          : <span className="text-[var(--brand-border)]">—</span>,
    },
    {
      id: "sessions",
      header: "Sessions",
      cell: (s) => (
        <SessionCell
          speaker={s}
          programSessions={programSessions}
          invalidate={invalidateSpeakers}
        />
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (s) => <InvitationBadge status={s.engagementStatus} />,
    },
    {
      id: "consent",
      header: "Consent",
      cell: (s) => <ConsentBadge status={s.consentStatus} />,
    },
    {
      id: "due",
      header: "Due",
      cell: (s) => <DueCell dueDate={s.engagementDueDate} engagementStatus={s.engagementStatus} />,
    },
    {
      id: "gender",
      header: "Gender",
      cell: (s) => <GenderBadge gender={s.gender} />,
    },
    {
      id: "category",
      header: "Category",
      cell: (s) => <CategoryBadge category={s.speakerCategory} />,
    },
    {
      id: "pillar",
      header: "Pillar",
      cell: (s) => {
        const enriched = s as SpeakerWithConsent & { pillarId?: string | null; pillarName?: string | null };
        const pillar = enriched.pillarId ? pillars.find((p) => p.id === enriched.pillarId) : null;
        return enriched.pillarName ? (
          <div className="flex flex-col gap-0.5 max-w-[160px]">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap self-start"
              style={{ background: "#EEF3F9", color: "#2A6FB0" }}
            >
              {enriched.pillarName}
            </span>
            {pillar?.description && (
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
      id: "sector",
      header: "Sector",
      cell: (s) => <SectorBadge affiliationType={s.affiliationType} />,
    },
    {
      id: "location",
      header: "Location",
      cell: (s) =>
        s.location
          ? <span className="text-[12px] text-[var(--brand-text-secondary)]">{s.location}</span>
          : <span className="text-[var(--brand-border)]">—</span>,
    },
    {
      id: "actions",
      header: "",
      cell: (s) => (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(s); }}
            className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-[var(--brand-tint)] transition-colors"
            title="Edit speaker"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleDelete(s); }}
            className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete speaker"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Speakers</h1>
          <p className="text-sm text-[var(--brand-text-secondary)] mt-0.5">
            Manage speaker roster, consent, and logistics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => exportXlsx(
              filtered.map((s) => ({
                "Name":               s.name,
                "Title":              s.title ?? "",
                "Gender":             s.gender ?? "",
                "Affiliation Type":   s.affiliationType ?? "",
                "Speaker Category":   s.speakerCategory ?? "",
                "Email":              s.email ?? "",
                "Location":           s.location ?? "",
                "Engagement Status":  s.engagementStatus ?? "",
                "Consent Status":     s.consentStatus ?? "",
                "Due Date":           s.engagementDueDate ?? "",
                "Notes":              s.notes ?? "",
              })),
              "speakers"
            )}>
            <FileSpreadsheet className="h-4 w-4" /> Export XLSX
          </Button>
          <Button onClick={() => { setEditingSpeaker(null); setForm(BLANK); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New speaker
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(s) => s.id}
        loading={isLoading}
        emptyTitle={search ? "No speakers match your search" : "No speakers yet"}
        emptyBody={search ? undefined : "Add your first speaker to track invitations and consent."}
        emptyIcon={<Mic />}
        emptyAction={
          !search ? (
            <Button size="sm" onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> New speaker
            </Button>
          ) : undefined
        }
        toolbarLeft={
          <div className="flex items-center gap-2">
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--brand-text-secondary)]" />
              <Input
                placeholder="Search speakers…"
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
            {filtered.length} speaker{filtered.length !== 1 ? "s" : ""}
          </span>
        }
      />

      {/* ── New / Edit speaker modal ───────────────────────────────────────── */}
      <Modal
        open={showDialog}
        onClose={handleClose}
        title={isEditing ? "Edit speaker" : "New speaker"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={(e) => { void handleSubmit(e as unknown as React.FormEvent); }}
              disabled={!form.name || submitting}
            >
              {submitting
                ? (isEditing ? "Saving…" : "Creating…")
                : (isEditing ? "Save changes" : "Create speaker")}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">

          {createError && (
            <div className="flex gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {createError}
            </div>
          )}

          {/* ── Core fields ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FL>Full name *</FL>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Dr. Amira Hassan" required />
            </div>
            <div>
              <FL>Title / Role</FL>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="CEO, World Bank" />
            </div>
            <div>
              <FL>Gender</FL>
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => <SelectItem key={g} value={g}>{label(g)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Email</FL>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@org.com" />
            </div>
            <div>
              <FL>Phone / WhatsApp</FL>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+256 700 000 000" />
            </div>
            <div>
              <FL>Location</FL>
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Nairobi, Kenya" />
            </div>
            <div>
              <FL>Sector</FL>
              <Select value={form.affiliationType} onValueChange={(v) => set("affiliationType", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {AFFILIATION_TYPES.map((a) => (
                    <SelectItem key={a} value={a}>{AFFILIATION_STYLE[a]?.text ?? a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Category</FL>
              <Select value={form.speakerCategory} onValueChange={(v) => set("speakerCategory", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {SPEAKER_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Invitation status</FL>
              <Select value={form.invitationStatus} onValueChange={(v) => set("invitationStatus", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVITATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Confirmation due</FL>
              <Input type="date" value={form.engagementDueDate} onChange={(e) => set("engagementDueDate", e.target.value)} />
            </div>
            {pillars.length > 0 && (
              <div className="col-span-2">
                <FL>Thematic pillar</FL>
                <Select value={form.pillarId || "__none__"} onValueChange={(v) => set("pillarId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
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
            )}
            <div className="col-span-2">
              <FL>Additional notes</FL>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Internal notes, sensitivities…"
              />
            </div>
          </div>

          {/* Sessions + Consent only when creating */}
          {!isEditing && (
            <>
              <hr className="border-[var(--brand-border)]" />

              {/* ── Sessions ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
                    Sessions
                  </p>
                  {selectedCount > 0 && (
                    <span className="text-[11px] font-semibold text-[var(--brand-primary)]">
                      {selectedCount} selected
                    </span>
                  )}
                </div>

                {programSessions.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--brand-border)] px-3 py-3 text-[13px] text-[var(--brand-text-secondary)]">
                    <CalendarDays className="h-4 w-4 shrink-0 opacity-40" />
                    No agenda sessions yet — add sessions first, then assign this speaker.
                  </div>
                ) : (
                  <>
                    {programSessions.length > 4 && (
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--brand-text-secondary)]" />
                        <Input
                          value={sessionSearch}
                          onChange={(e) => setSessionSearch(e.target.value)}
                          placeholder="Filter sessions…"
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                    )}
                    <div className="rounded-lg border border-[var(--brand-border)] divide-y divide-[var(--brand-border)] max-h-52 overflow-y-auto">
                      {filteredSessions.length === 0 ? (
                        <div className="px-3 py-4 text-center text-[12px] text-[var(--brand-text-secondary)]">
                          No sessions match "{sessionSearch}"
                        </div>
                      ) : (
                        filteredSessions.map((s) => {
                          const isSelected = !!form.selectedSessions[s.id];
                          return (
                            <div
                              key={s.id}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--brand-tint)] transition-colors cursor-pointer"
                              onClick={() => toggleSession(s.id)}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSession(s.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded accent-[var(--brand-primary)] shrink-0 h-4 w-4 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-[var(--brand-ink)] truncate">{s.title}</p>
                                <p className="text-[11px] text-[var(--brand-text-secondary)]">
                                  {s.day} · {s.startTime}–{s.endTime} · {s.track}
                                </p>
                              </div>
                              {isSelected && (
                                <Select
                                  value={form.selectedSessions[s.id]}
                                  onValueChange={(v) => setSessionRole(s.id, v)}
                                >
                                  <SelectTrigger
                                    className="h-7 text-[11px] w-28 shrink-0 bg-white"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SPEAKER_ROLES.map((r) => (
                                      <SelectItem key={r} value={r}>{label(r)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>

              <hr className="border-[var(--brand-border)]" />

              {/* ── Consent ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
                    Media consent
                  </p>
                  <button
                    type="button"
                    onClick={() => set("addConsent", !form.addConsent)}
                    className="text-[11px] font-semibold"
                    style={{ color: form.addConsent ? "var(--brand-text-secondary)" : "var(--brand-primary)" }}
                  >
                    {form.addConsent ? "Remove" : "+ Add consent record"}
                  </button>
                </div>

                {form.addConsent && (
                  <div className="rounded-lg border p-4 space-y-1" style={{ borderColor: "var(--brand-border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <FL>Initial status</FL>
                      <Select value={form.consent.status} onValueChange={(v) => setConsent("status", v)}>
                        <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CONSENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <ConsentToggle icon={<Camera className="h-4 w-4" />} label="Photography" checked={form.consent.photographyConsent} onChange={(v) => setConsent("photographyConsent", v)} />
                    <ConsentToggle icon={<Video className="h-4 w-4" />} label="Video recording" checked={form.consent.videoRecordingConsent} onChange={(v) => setConsent("videoRecordingConsent", v)} />
                    <ConsentToggle icon={<Radio className="h-4 w-4" />} label="Live stream" checked={form.consent.liveStreamConsent} onChange={(v) => setConsent("liveStreamConsent", v)} />
                    <ConsentToggle icon={<FileText className="h-4 w-4" />} label="Name & bio publication" checked={form.consent.nameAndBioPublication} onChange={(v) => setConsent("nameAndBioPublication", v)} />
                    <ConsentToggle icon={<Share2 className="h-4 w-4" />} label="Social media use" checked={form.consent.socialMediaUse} onChange={(v) => setConsent("socialMediaUse", v)} />
                    <ConsentToggle icon={<Globe className="h-4 w-4" />} label="Third-party media sharing" checked={form.consent.thirdPartyMediaSharing} onChange={(v) => setConsent("thirdPartyMediaSharing", v)} />
                    <div className="pt-2">
                      <FL>Consent notes</FL>
                      <textarea
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        rows={2} value={form.consent.notes}
                        onChange={(e) => setConsent("notes", e.target.value)}
                        placeholder="Any conditions, restrictions, or context…"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {isEditing && (
            <p className="text-[12px] text-[var(--brand-text-secondary)]">
              Sessions and consent can be managed from the speaker's profile page.
            </p>
          )}

        </form>
      </Modal>
    </div>
  );
}
