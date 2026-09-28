import { useState, useMemo } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import {
  useListSessions,
  useCreateSession,
  useUpdateSession,
  useDeleteSession,
  useAddSessionSpeaker,
  useRemoveSessionSpeaker,
  useUpdateSessionSpeaker,
  useListSpeakers,
  getListSpeakersQueryKey,
  useListPartners,
  useListPillars,
  getListSessionsQueryKey,
  getListPartnersQueryKey,
  getListPillarsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import {
  Plus,
  CalendarDays,
  Clock,
  Trash2,
  Pencil,
  UserPlus,
  X,
  Globe,
  Users,
  FileSpreadsheet,
  Building2,
} from "lucide-react";
import { exportXlsx } from "@/lib/exportXlsx";
import { label } from "@/lib/labels";
import type { AgendaSession } from "@workspace/api-client-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const SESSION_FORMATS = [
  "StandAlone", "Fireside", "Panel", "Presentation", "Breakaway", "Break", "Intermission",
] as const;
const SESSION_STATUSES = ["Proposed", "Tentative", "Confirmed"] as const;
const SPEAKER_ROLES    = ["Speaker", "Panelist", "Moderator", "Chair"] as const;
const SPEAKER_STATUSES = ["Proposed", "Confirmed"] as const;

// ── Tonal token maps ──────────────────────────────────────────────────────────
const FORMAT_STYLE: Record<string, { bg: string; fg: string }> = {
  StandAlone:   { bg: "#EEF1F6", fg: "#0A2F5C" },
  Panel:        { bg: "#EEF3F9", fg: "#2A6FB0" },
  Fireside:     { bg: "#F5EEF9", fg: "#7B4FA6" },
  Presentation: { bg: "#EEF3F9", fg: "#1E5E99" },
  Breakaway:    { bg: "#E8F5ED", fg: "#2E7D5B" },
  Break:        { bg: "#F4F5F6", fg: "#9AA4B0" },
  Intermission: { bg: "#F4F5F6", fg: "#9AA4B0" },
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Confirmed: { bg: "#E8F5ED", fg: "#2E7D5B" },
  Tentative: { bg: "#FBF3E2", fg: "#8A6516" },
  Proposed:  { bg: "#F4F5F6", fg: "#6C7A99" },
};

const CHIP_STYLE: Record<string, { bg: string; fg: string }> = {
  Confirmed: { bg: "#E8F5ED", fg: "#2E7D5B" },
  Proposed:  { bg: "#FBF3E2", fg: "#8A6516" },
};

// ── Micro-badge components ────────────────────────────────────────────────────
function FormatBadge({ format }: { format: string }) {
  const s = FORMAT_STYLE[format] ?? { bg: "#F4F5F6", fg: "#6C7A99" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {label(format)}
    </span>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "#F4F5F6", fg: "#6C7A99" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {label(status)}
    </span>
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

// ── Rollup progress bar ───────────────────────────────────────────────────────
function ProgressBar({
  confirmed,
  target,
  height = "h-1.5",
}: {
  confirmed: number;
  target: number;
  height?: string;
}) {
  const pct = target > 0 ? Math.min(100, (confirmed / target) * 100) : 0;
  const color =
    confirmed >= target
      ? "var(--variance-fav)"
      : confirmed > 0
      ? "#C99A3B"
      : "var(--brand-border)";
  return (
    <div className={`flex-1 ${height} rounded-full bg-[var(--brand-tint)] overflow-hidden`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Form types ────────────────────────────────────────────────────────────────
interface SessionForm {
  day: string;
  track: string;
  startTime: string;
  endTime: string;
  title: string;
  theme: string;
  format: string;
  status: string;
  description: string;
  targetSpeakers: number;
  sponsoredByEngagementId: string;
  pillarId: string;
}

interface AttachForm {
  speakerId: string;
  role: string;
  status: string;
}

const BLANK_SESSION: SessionForm = {
  day: "",
  track: "Main Stage",
  startTime: "09:00",
  endTime: "10:00",
  title: "",
  theme: "",
  format: "StandAlone",
  status: "Proposed",
  description: "",
  targetSpeakers: 1,
  sponsoredByEngagementId: "",
  pillarId: "",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function Agenda() {
  const { activeConveningId, activeConvening } = useConvening();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedDay,      setSelectedDay]      = useState<string | null>(null);
  const [showAdd,          setShowAdd]          = useState(false);
  const [editingId,        setEditingId]        = useState<string | null>(null);
  const [form,             setForm]             = useState<SessionForm>(BLANK_SESSION);
  const [attachSessionId,  setAttachSessionId]  = useState<string | null>(null);
  const [attachForm,       setAttachForm]       = useState<AttachForm>({ speakerId: "", role: "Speaker", status: "Proposed" });
  const [speakerSearch,    setSpeakerSearch]    = useState("");
  const [submitting,         setSubmitting]         = useState(false);
  const [inlineSpeakerSearch, setInlineSpeakerSearch] = useState("");
  const [inlineSpeakerId,     setInlineSpeakerId]     = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────
  const sessionParams = { conveningId: activeConveningId ?? "" };
  const { data: rawSessions, isLoading } = useListSessions(sessionParams, {
    query: { enabled: !!activeConveningId, queryKey: getListSessionsQueryKey(sessionParams) },
  });
  const { data: allSpeakers = [] } = useListSpeakers(
    { conveningId: activeConveningId ?? "" },
    { query: { enabled: !!activeConveningId, queryKey: getListSpeakersQueryKey({ conveningId: activeConveningId ?? "" }) } },
  );
  const partnerParams = { conveningId: activeConveningId ?? "" };
  const { data: allPartners = [] } = useListPartners(partnerParams, {
    query: { enabled: !!activeConveningId, queryKey: getListPartnersQueryKey(partnerParams) },
  });
  const { data: pillars = [] } = useListPillars(activeConveningId ?? "", {
    query: { enabled: !!activeConveningId, queryKey: getListPillarsQueryKey(activeConveningId ?? "") },
  });

  // Map engagement.id → partner name for sponsor badge on cards
  const partnerByEngagementId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allPartners) {
      if (p.engagement?.id) m.set(p.engagement.id, p.institutionName);
    }
    return m;
  }, [allPartners]);

  // Map pillar.id → pillar object for session pillar chips
  const pillarById = useMemo(
    () => new Map(pillars.map((p) => [p.id, p])),
    [pillars],
  );

  // Dedup sessions by id — guard against API returning duplicates
  const sessions = useMemo(() => {
    const map = new Map<string, AgendaSession>();
    for (const s of rawSessions ?? []) map.set(s.id, s);
    return [...map.values()];
  }, [rawSessions]);

  const filteredSpeakers = useMemo(() => {
    const q = speakerSearch.toLowerCase();
    return allSpeakers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [allSpeakers, speakerSearch]);

  const attachSessionSpeakerIds = useMemo(() => {
    if (!attachSessionId) return new Set<string>();
    const sess = sessions.find((s) => s.id === attachSessionId);
    return new Set((sess?.speakers ?? []).map((sp) => sp.speakerId));
  }, [attachSessionId, sessions]);

  const availableSpeakers = useMemo(
    () => filteredSpeakers.filter((s) => !attachSessionSpeakerIds.has(s.id)),
    [filteredSpeakers, attachSessionSpeakerIds],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey(sessionParams) });

  const onSessionError = () =>
    toast({ title: "Could not save session", description: "Please try again.", variant: "destructive" });
  const onSpeakerError = () =>
    toast({ title: "Could not update session speaker", description: "Please try again.", variant: "destructive" });

  const createSession = useCreateSession({ mutation: { onError: onSessionError } });
  const updateSession = useUpdateSession({ mutation: { onError: onSessionError } });
  const deleteSession = useDeleteSession({ mutation: { onSuccess: invalidate, onError: onSessionError } });
  const addSpeaker    = useAddSessionSpeaker({ mutation: { onError: onSpeakerError } });
  const removeSpeaker = useRemoveSessionSpeaker({ mutation: { onSuccess: invalidate, onError: onSpeakerError } });
  const updateSpeaker = useUpdateSessionSpeaker({ mutation: { onSuccess: invalidate, onError: onSpeakerError } });

  if (!activeConveningId) return null;

  // ── Derived ───────────────────────────────────────────────────────────────
  const timezone = activeConvening?.timezone ?? "Africa/Kampala";
  const tzAbbr   = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? timezone;

  const days = [...new Set(sessions.map((s) => s.day))].sort();
  const activeDay = selectedDay ?? days[0] ?? null;

  const sessionsForDay = sessions
    .filter((s) => s.day === activeDay)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.startTime.localeCompare(b.startTime);
    });

  const tracks = [...new Set(sessionsForDay.map((s) => s.track))].sort();

  const programSessions = sessions.filter(
    (s) => s.format !== "Break" && s.format !== "Intermission",
  );
  const totalTarget    = programSessions.reduce((n, s) => n + (s.targetSpeakers ?? 1), 0);
  const totalConfirmed = programSessions.reduce(
    (n, s) => n + (s.speakers?.filter((sp) => sp.status === "Confirmed").length ?? 0),
    0,
  );

  const formatDayLabel = (day: string) => {
    try {
      return new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", {
        weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
      });
    } catch { return day; }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const setF = <K extends keyof SessionForm>(k: K, v: SessionForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setForm({ ...BLANK_SESSION, day: activeDay ?? "" });
    setShowAdd(true);
  };

  const openEdit = (s: AgendaSession) => {
    setForm({
      day:                     s.day,
      track:                   s.track,
      startTime:               s.startTime,
      endTime:                 s.endTime,
      title:                   s.title,
      theme:                   s.theme ?? "",
      format:                  s.format,
      status:                  s.status,
      description:             s.description ?? "",
      targetSpeakers:          s.targetSpeakers ?? 1,
      sponsoredByEngagementId: s.sponsoredByEngagementId ?? "",
      pillarId:                s.pillarId ?? "",
    });
    setInlineSpeakerSearch("");
    setInlineSpeakerId("");
    setEditingId(s.id);
  };

  const handleCloseSessionModal = () => {
    setShowAdd(false);
    setEditingId(null);
  };

  const handleSubmitSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.day) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await updateSession.mutateAsync({
          id: editingId,
          data: {
            day:                     form.day,
            track:                   form.track,
            startTime:               form.startTime,
            endTime:                 form.endTime,
            title:                   form.title,
            theme:                   form.theme || null,
            format:                  form.format as typeof SESSION_FORMATS[number],
            status:                  form.status as typeof SESSION_STATUSES[number],
            description:             form.description || null,
            targetSpeakers:          form.targetSpeakers,
            sponsoredByEngagementId: form.sponsoredByEngagementId || null,
            pillarId:                form.pillarId || null,
          },
        });
      } else {
        await createSession.mutateAsync({
          data: {
            conveningId:             activeConveningId,
            day:                     form.day,
            track:                   form.track || "Main Stage",
            startTime:               form.startTime,
            endTime:                 form.endTime,
            title:                   form.title,
            theme:                   form.theme || undefined,
            format:                  form.format as typeof SESSION_FORMATS[number],
            status:                  form.status as typeof SESSION_STATUSES[number],
            description:             form.description || undefined,
            targetSpeakers:          form.targetSpeakers,
            sponsoredByEngagementId: form.sponsoredByEngagementId || undefined,
            pillarId:                form.pillarId || undefined,
          },
        });
      }
      invalidate();
      handleCloseSessionModal();
    } finally {
      setSubmitting(false);
    }
  };

  const openAttach = (sessionId: string) => {
    setAttachForm({ speakerId: "", role: "Speaker", status: "Proposed" });
    setSpeakerSearch("");
    setAttachSessionId(sessionId);
  };

  const handleAttach = async () => {
    if (!attachSessionId || !attachForm.speakerId) return;
    setSubmitting(true);
    try {
      await addSpeaker.mutateAsync({
        id: attachSessionId,
        data: {
          speakerId: attachForm.speakerId,
          role:      attachForm.role as typeof SPEAKER_ROLES[number],
          status:    "Proposed" as const,
        },
      });
      invalidate();
      // Stay open so multiple speakers can be added; reset the add-form only
      setSpeakerSearch("");
      setAttachForm((f) => ({ ...f, speakerId: "" }));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Agenda</h1>
          <p className="text-sm text-[var(--brand-text-secondary)] mt-0.5">
            Programme builder — sessions, tracks, and run of show.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => exportXlsx(
              sessions.map((s) => ({
                "Title":           s.title,
                "Theme":           s.theme ?? "",
                "Format":          s.format ?? "",
                "Status":          s.status ?? "",
                "Day":             s.day ?? "",
                "Start Time":      s.startTime ?? "",
                "End Time":        s.endTime ?? "",
                "Track":           s.track ?? "",
                "Order":           s.order ?? "",
                "Target Speakers": s.targetSpeakers ?? "",
                "Description":     s.description ?? "",
              })),
              "agenda-sessions"
            )}>
            <FileSpreadsheet className="h-4 w-4" /> Export XLSX
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" /> Add session
          </Button>
        </div>
      </div>

      {/* ── Confirmation rollup banner ─────────────────────────────────── */}
      {totalTarget > 0 && (
        <div className="rounded-lg border border-[var(--brand-border)] bg-white px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <Users className="h-4 w-4 text-[var(--brand-text-secondary)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
              Speaker confirmation
            </span>
          </div>
          <ProgressBar confirmed={totalConfirmed} target={totalTarget} />
          <div className="shrink-0 text-right">
            <span
              className="text-sm font-semibold"
              style={{ color: totalConfirmed >= totalTarget ? "var(--variance-fav)" : "var(--brand-ink)" }}
            >
              {totalConfirmed}
            </span>
            <span className="text-xs text-[var(--brand-text-secondary)]"> / {totalTarget} confirmed</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 border-l border-[var(--brand-border)] pl-4">
            <Globe className="h-3.5 w-3.5 text-[var(--brand-text-secondary)]" />
            <span className="text-xs text-[var(--brand-text-secondary)]">{tzAbbr}</span>
          </div>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="rounded-lg border border-[var(--brand-border)] bg-white py-16 text-center text-[var(--brand-text-secondary)] text-sm">
          Loading agenda…
        </div>
      ) : days.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--brand-border)] bg-white py-20 text-center">
          <CalendarDays className="h-10 w-10 text-[var(--brand-border)] mx-auto mb-4" />
          <p className="text-sm font-medium text-[var(--brand-ink)] mb-1">No sessions yet</p>
          <p className="text-sm text-[var(--brand-text-secondary)] mb-4">
            Add the first session to build the programme.
          </p>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add session
          </Button>
        </div>
      ) : (
        <>
          {/* ── Day tabs ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            {days.map((day) => {
              const active = day === activeDay;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className="px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style={
                    active
                      ? { background: "var(--brand-primary)", color: "#fff" }
                      : {
                          background: "#fff",
                          color: "var(--brand-ink)",
                          border: "1px solid var(--brand-border)",
                        }
                  }
                >
                  {formatDayLabel(day)}
                </button>
              );
            })}
            <button
              onClick={() => { setForm({ ...BLANK_SESSION }); setShowAdd(true); }}
              className="px-3.5 py-1.5 rounded-md text-sm font-medium border border-dashed transition-colors"
              style={{ borderColor: "var(--brand-border)", color: "var(--brand-text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand-ink)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--brand-text-secondary)")}
            >
              + New day
            </button>
          </div>

          {/* ── Track columns ─────────────────────────────────────────── */}
          {activeDay && (
            <div
              className={[
                "grid gap-4",
                tracks.length >= 3
                  ? "grid-cols-1 xl:grid-cols-3"
                  : tracks.length === 2
                  ? "grid-cols-1 lg:grid-cols-2"
                  : "grid-cols-1",
              ].join(" ")}
            >
              {tracks.map((track) => {
                const trackSessions = sessionsForDay.filter((s) => s.track === track);
                return (
                  <div key={track} className="min-w-0">
                    {/* Track header */}
                    <div className="flex items-center gap-2 mb-3 pl-3 border-l-2 border-[var(--brand-primary)]">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-navy)]">
                        {track}
                      </h3>
                      <span className="text-[11px] text-[var(--brand-text-secondary)]">
                        {trackSessions.length} session{trackSessions.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Session cards */}
                    <div className="space-y-2">
                      {trackSessions.length === 0 ? (
                        <div
                          className="py-6 text-center text-sm rounded-lg border border-dashed"
                          style={{ borderColor: "var(--brand-border)", color: "var(--brand-text-secondary)" }}
                        >
                          No sessions in this track
                        </div>
                      ) : (
                        trackSessions.map((session) => {
                          const isBreak = session.format === "Break" || session.format === "Intermission";
                          const confirmedCount = session.speakers?.filter((sp) => sp.status === "Confirmed").length ?? 0;
                          const target = session.targetSpeakers ?? 1;

                          return (
                            <div
                              key={session.id}
                              className="rounded-lg border transition-shadow group"
                              style={{
                                background: isBreak ? "var(--brand-tint)" : "#fff",
                                borderColor: isBreak ? "transparent" : "var(--brand-border)",
                              }}
                            >
                              <div className="p-4">
                                {/* Time + badges row */}
                                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                  <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--brand-text-secondary)] mr-0.5">
                                    <Clock className="h-3 w-3" />
                                    {session.startTime}–{session.endTime}
                                    <span className="opacity-60 ml-0.5">{tzAbbr}</span>
                                  </span>
                                  <FormatBadge format={session.format} />
                                  {!isBreak && <SessionStatusBadge status={session.status} />}
                                  {/* x/y confirmed chip */}
                                  {!isBreak && target > 0 && (
                                    <span
                                      className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                                      style={
                                        confirmedCount >= target
                                          ? { background: "#E8F5ED", color: "#2E7D5B" }
                                          : confirmedCount > 0
                                          ? { background: "#FBF3E2", color: "#8A6516" }
                                          : { background: "var(--brand-tint)", color: "var(--brand-text-secondary)" }
                                      }
                                    >
                                      <Users className="h-2.5 w-2.5" />
                                      {confirmedCount}/{target}
                                    </span>
                                  )}
                                </div>

                                {/* Title */}
                                <p
                                  className="text-sm font-semibold leading-snug"
                                  style={{ color: isBreak ? "var(--brand-text-secondary)" : "var(--brand-ink)" }}
                                >
                                  {session.title}
                                </p>
                                {session.theme && (
                                  <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                                    {session.theme}
                                  </p>
                                )}
                                {!isBreak && session.pillarId && pillarById.get(session.pillarId) && (
                                  <div
                                    className="inline-flex flex-col rounded-md px-2 py-1 mt-1.5 max-w-full"
                                    style={{ background: "#EEF3F9" }}
                                  >
                                    <span className="text-[10px] font-semibold leading-tight" style={{ color: "#2A6FB0" }}>
                                      {pillarById.get(session.pillarId)!.name}
                                    </span>
                                    {pillarById.get(session.pillarId)!.description && (
                                      <span className="text-[10px] leading-snug mt-0.5" style={{ color: "#5A8EC0" }}>
                                        {pillarById.get(session.pillarId)!.description}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Sponsor partner badge */}
                                {session.sponsoredByEngagementId && partnerByEngagementId.get(session.sponsoredByEngagementId) && (
                                  <div className="flex items-center gap-1 mt-1.5">
                                    <Building2 className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--brand-text-secondary)" }} />
                                    <span className="text-[10px] font-medium truncate" style={{ color: "var(--brand-text-secondary)" }}>
                                      {partnerByEngagementId.get(session.sponsoredByEngagementId)}
                                    </span>
                                  </div>
                                )}

                                {/* Speaker chips */}
                                {(session.speakers?.length ?? 0) > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2.5">
                                    {session.speakers!.map((sp) => {
                                      const cs = CHIP_STYLE[sp.status] ?? CHIP_STYLE.Proposed;
                                      return (
                                        <span
                                          key={sp.id}
                                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                                          style={{ background: cs.bg, color: cs.fg }}
                                        >
                                          {sp.speakerName}
                                          <span className="opacity-60">· {label(sp.role)}</span>
                                          <button
                                            onClick={() =>
                                              removeSpeaker.mutate({
                                                sessionId: session.id,
                                                speakerId: sp.speakerId,
                                              })
                                            }
                                            className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                                            title="Remove"
                                          >
                                            <X className="h-2.5 w-2.5" />
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Per-session progress bar */}
                                {!isBreak && target > 0 && (
                                  <div className="flex items-center gap-2 mt-2.5">
                                    <ProgressBar confirmed={confirmedCount} target={target} height="h-1" />
                                  </div>
                                )}
                              </div>

                              {/* Action row — visible on hover */}
                              <div className="flex items-center justify-end gap-0.5 px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!isBreak && (
                                  <button
                                    onClick={() => openAttach(session.id)}
                                    className="p-1.5 rounded hover:bg-[var(--brand-tint)] transition-colors"
                                    title="Add speaker"
                                    style={{ color: "var(--brand-text-secondary)" }}
                                  >
                                    <UserPlus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => openEdit(session)}
                                  className="p-1.5 rounded hover:bg-[var(--brand-tint)] transition-colors"
                                  title="Edit session"
                                  style={{ color: "var(--brand-text-secondary)" }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteSession.mutate({ id: session.id })}
                                  className="p-1.5 rounded hover:bg-red-50 transition-colors"
                                  title="Delete session"
                                  style={{ color: "var(--brand-text-secondary)" }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = "#B5462F")}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--brand-text-secondary)")}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Add / Edit Session modal ────────────────────────────────────── */}
      <Modal
        open={showAdd || !!editingId}
        onClose={handleCloseSessionModal}
        title={editingId ? "Edit session" : "New session"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={handleCloseSessionModal}>Cancel</Button>
            <Button
              disabled={!form.title || !form.day || submitting}
              onClick={(e) => { void handleSubmitSession(e as unknown as React.FormEvent); }}
            >
              {submitting ? "Saving…" : editingId ? "Save changes" : "Add session"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitSession} className="space-y-4">

          {/* Day + Track */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FL>Day (date) *</FL>
              <Input
                type="date"
                value={form.day}
                onChange={(e) => setF("day", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <FL>Track</FL>
              <Input
                value={form.track}
                onChange={(e) => setF("track", e.target.value)}
                placeholder="Main Stage"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FL>Start time ({tzAbbr})</FL>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setF("startTime", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <FL>End time ({tzAbbr})</FL>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setF("endTime", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <FL>Title *</FL>
            <Input
              value={form.title}
              onChange={(e) => setF("title", e.target.value)}
              placeholder="Session title"
              required
            />
          </div>

          {/* Theme */}
          <div>
            <FL>Theme / sub-topic</FL>
            <Input
              value={form.theme}
              onChange={(e) => setF("theme", e.target.value)}
              placeholder="Optional thematic focus"
            />
          </div>

          {/* Format + Status + Target */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FL>Format</FL>
              <Select value={form.format} onValueChange={(v) => setF("format", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSION_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>{label(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Status</FL>
              <Select value={form.status} onValueChange={(v) => setF("status", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{label(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FL>Target speakers</FL>
              <Input
                type="number"
                min={0}
                max={20}
                value={form.targetSpeakers}
                onChange={(e) => setF("targetSpeakers", parseInt(e.target.value) || 0)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <FL>Description</FL>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={2}
              value={form.description}
              onChange={(e) => setF("description", e.target.value)}
              placeholder="Optional session description…"
            />
          </div>

          {/* Thematic pillar */}
          {pillars.length > 0 && (
            <div>
              <FL>Thematic pillar</FL>
              <Select
                value={form.pillarId || "__none__"}
                onValueChange={(v) => setF("pillarId", v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {pillars.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sponsored by partner */}
          {allPartners.some((p) => p.engagement?.id) && (
            <div>
              <FL>Sponsored by partner</FL>
              <Select
                value={form.sponsoredByEngagementId || "__none__"}
                onValueChange={(v) => setF("sponsoredByEngagementId", v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {allPartners.map((p) =>
                    p.engagement?.id ? (
                      <SelectItem key={p.engagement.id} value={p.engagement.id}>
                        {p.institutionName}
                      </SelectItem>
                    ) : null
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Inline speakers — only when editing an existing session */}
          {editingId && (() => {
            const sess = sessions.find((s) => s.id === editingId);
            const currentSpeakers = sess?.speakers ?? [];
            const existingSpeakerIds = new Set(currentSpeakers.map((sp) => sp.speakerId));
            const filteredInline = allSpeakers
              .filter((s) => s.name.toLowerCase().includes(inlineSpeakerSearch.toLowerCase()) && !existingSpeakerIds.has(s.id))
              .slice(0, 6);

            return (
              <div>
                <FL>Speakers</FL>

                {/* Current speaker chips */}
                {currentSpeakers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {currentSpeakers.map((sp) => {
                      const cs = CHIP_STYLE[sp.status] ?? CHIP_STYLE.Proposed;
                      return (
                        <span
                          key={sp.id}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: cs.bg, color: cs.fg }}
                        >
                          {sp.speakerName}
                          <span className="opacity-60">· {label(sp.role)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              removeSpeaker.mutate({ sessionId: editingId, speakerId: sp.speakerId });
                              invalidate();
                            }}
                            className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                            title="Remove"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Add speaker search */}
                <div className="relative flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      value={inlineSpeakerSearch}
                      onChange={(e) => { setInlineSpeakerSearch(e.target.value); setInlineSpeakerId(""); }}
                      placeholder="Search speakers to add…"
                      className="h-8 text-sm"
                    />
                    {inlineSpeakerSearch && filteredInline.length > 0 && (
                      <div
                        className="absolute left-0 right-0 top-full mt-0.5 z-20 rounded-md overflow-hidden shadow-md border bg-white"
                        style={{ borderColor: "var(--brand-border)" }}
                      >
                        {filteredInline.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { setInlineSpeakerId(s.id); setInlineSpeakerSearch(s.name); }}
                            className="w-full text-left px-3 py-2 text-sm border-b last:border-0 transition-colors hover:bg-[var(--brand-tint)]"
                            style={{
                              borderColor: "var(--brand-border)",
                              fontWeight: inlineSpeakerId === s.id ? 600 : undefined,
                              color: inlineSpeakerId === s.id ? "var(--brand-primary)" : "var(--brand-ink)",
                            }}
                          >
                            {s.name}
                            {s.title && <span className="ml-1.5 text-xs text-[var(--brand-text-secondary)]">{s.title}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {inlineSpeakerSearch && filteredInline.length === 0 && (
                      <p className="mt-1 text-xs px-1 text-[var(--brand-text-secondary)]">
                        {allSpeakers.some((s) => s.name.toLowerCase().includes(inlineSpeakerSearch.toLowerCase()))
                          ? "All matching speakers are already on this session"
                          : `No speakers match "${inlineSpeakerSearch}"`}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!inlineSpeakerId}
                    onClick={async () => {
                      if (!inlineSpeakerId || !editingId) return;
                      await addSpeaker.mutateAsync({
                        id: editingId,
                        data: { speakerId: inlineSpeakerId, role: "Speaker", status: "Proposed" },
                      });
                      invalidate();
                      setInlineSpeakerSearch("");
                      setInlineSpeakerId("");
                    }}
                    className="h-8 shrink-0"
                  >
                    Add
                  </Button>
                </div>
              </div>
            );
          })()}
        </form>
      </Modal>

      {/* ── Manage speakers modal ───────────────────────────────────────── */}
      <Modal
        open={!!attachSessionId}
        onClose={() => { setAttachSessionId(null); setSpeakerSearch(""); setAttachForm({ speakerId: "", role: "Speaker", status: "Proposed" }); }}
        title={(() => {
          const sess = sessions.find((s) => s.id === attachSessionId);
          return sess ? `Speakers — ${sess.title}` : "Manage speakers";
        })()}
        size="sm"
        footer={
          <Button
            variant="ghost"
            onClick={() => { setAttachSessionId(null); setSpeakerSearch(""); setAttachForm({ speakerId: "", role: "Speaker", status: "Proposed" }); }}
          >
            Close
          </Button>
        }
      >
        <div className="space-y-4">

          {/* ── Current speakers ── */}
          {(() => {
            const sess = sessions.find((s) => s.id === attachSessionId);
            const existing = sess?.speakers ?? [];
            if (existing.length === 0) return null;
            return (
              <div>
                <p className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-2">
                  On this session
                </p>
                <div className="space-y-1.5">
                  {existing.map((sp) => {
                    const isConfirmed = sp.status === "Confirmed";
                    return (
                      <div key={sp.id} className="flex items-center gap-1.5">
                        {/* Name */}
                        <span className="flex-1 min-w-0 text-[13px] font-medium text-[var(--brand-ink)] truncate">
                          {sp.speakerName}
                        </span>
                        {/* Role selector */}
                        <Select
                          value={sp.role}
                          onValueChange={(v) =>
                            updateSpeaker.mutate({
                              sessionId: attachSessionId!,
                              speakerId: sp.speakerId,
                              data: { role: v as typeof SPEAKER_ROLES[number] },
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-[11px] w-24 shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SPEAKER_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{label(r)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Status toggle */}
                        <button
                          onClick={() =>
                            updateSpeaker.mutate({
                              sessionId: attachSessionId!,
                              speakerId: sp.speakerId,
                              data: { status: isConfirmed ? "Proposed" : "Confirmed" },
                            })
                          }
                          className="shrink-0 h-7 px-2 rounded text-[10px] font-semibold border transition-colors"
                          style={
                            isConfirmed
                              ? { background: "#E8F5ED", color: "#2E7D5B", borderColor: "#B8DFCC" }
                              : { background: "#F4F5F6", color: "#6C7A99", borderColor: "var(--brand-border)" }
                          }
                          title={isConfirmed ? "Mark as Proposed" : "Mark as Confirmed"}
                        >
                          {isConfirmed ? "✓ Confirmed" : "◌ Proposed"}
                        </button>
                        {/* Remove */}
                        <button
                          onClick={() =>
                            removeSpeaker.mutate({
                              sessionId: attachSessionId!,
                              speakerId: sp.speakerId,
                            })
                          }
                          className="shrink-0 p-1 rounded hover:bg-red-50 transition-colors"
                          style={{ color: "var(--brand-text-secondary)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#B5462F")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--brand-text-secondary)")}
                          title="Remove from session"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 border-t border-[var(--brand-border)]" />
              </div>
            );
          })()}

          {/* ── Add speaker ── */}
          <div className="space-y-3">
            <p className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
              Add speaker
            </p>
            <div>
              <Input
                value={speakerSearch}
                onChange={(e) => { setSpeakerSearch(e.target.value); setAttachForm((f) => ({ ...f, speakerId: "" })); }}
                placeholder="Type a name…"
                autoFocus
                className="h-9"
              />
              {speakerSearch && availableSpeakers.length > 0 && (
                <div className="mt-1 rounded-md overflow-hidden shadow-sm border" style={{ borderColor: "var(--brand-border)" }}>
                  {availableSpeakers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setAttachForm((f) => ({ ...f, speakerId: s.id }));
                        setSpeakerSearch(s.name);
                      }}
                      className="w-full text-left px-3 py-2 text-sm border-b last:border-0 transition-colors"
                      style={{
                        borderColor: "var(--brand-border)",
                        background: attachForm.speakerId === s.id ? "var(--brand-tint)" : "#fff",
                        color: attachForm.speakerId === s.id ? "var(--brand-primary)" : "var(--brand-ink)",
                        fontWeight: attachForm.speakerId === s.id ? 600 : undefined,
                      }}
                    >
                      {s.name}
                      {s.title && (
                        <span className="ml-1.5 text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                          {s.title}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {speakerSearch && availableSpeakers.length === 0 && (
                <p className="mt-1 text-xs px-1" style={{ color: "var(--brand-text-secondary)" }}>
                  {filteredSpeakers.length > 0
                    ? "All matching speakers are already on this session"
                    : `No speakers match "${speakerSearch}"`}
                </p>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <FL>Role</FL>
                <Select value={attachForm.role} onValueChange={(v) => setAttachForm((f) => ({ ...f, role: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPEAKER_ROLES.map((r) => <SelectItem key={r} value={r}>{label(r)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={!attachForm.speakerId || submitting}
                onClick={() => { void handleAttach(); }}
                className="h-9"
              >
                {submitting ? "…" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
