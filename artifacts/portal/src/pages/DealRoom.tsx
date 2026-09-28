import { useState, useRef, useMemo } from "react";
import type { DragEvent } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import { formatMoney } from "@/lib/money";
import { SECTORS, isRegulated, sectorLabel } from "@/lib/sectors";
import { label } from "@/lib/labels";
import {
  useListDealProjects,
  useCreateDealProject,
  useUpdateDealProject,
  useDeleteDealProject,
  useListDealMatches,
  useSuggestDealMatches,
  useUpdateDealMatch,
  useListDealMeetings,
  useCreateDealMeeting,
  useUpdateDealMeeting,
  useDeleteDealMeeting,
  useListDealCommitments,
  useCreateDealCommitment,
  useDeleteDealCommitment,
  useListBooths,
  getListDealProjectsQueryKey,
  getListDealMatchesQueryKey,
  getListDealMeetingsQueryKey,
  getListDealCommitmentsQueryKey,
  getListBoothsQueryKey,
  type DealProject,
  type DealMatchWithProjects,
  type DealMeeting,
  type DealCommitment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Sparkles, Check, X, Trash2, GripVertical,
  ShieldCheck, Calendar, PenLine, Building2, FileSpreadsheet,
} from "lucide-react";
import { exportXlsx } from "@/lib/exportXlsx";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens ──────────────────────────────────────────────────────────────
const FL   = "block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1";
const MUTED = "var(--brand-text-secondary)";

// ── Stage config ───────────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  "Preliminary", "PreFeasibility", "Feasibility",
  "CommercialClose", "PartFinance", "Refinance", "Closed",
] as const;

const STAGE_LABELS: Record<string, string> = {
  Preliminary: "Preliminary",
  PreFeasibility: "Pre-Feasibility",
  Feasibility: "Feasibility",
  CommercialClose: "Commercial Close",
  PartFinance: "Part-Finance",
  Refinance: "Refinance",
  Closed: "Closed",
  Stalled: "Stalled",
};

type BS = { bg: string; fg: string };

const STAGE_STYLE: Record<string, BS> = {
  Preliminary:    { bg: "#F1EFE8", fg: "#5A6472" },
  PreFeasibility: { bg: "#E6F1FB", fg: "#0C447C" },
  Feasibility:    { bg: "#E6F1FB", fg: "#2A6FB0" },
  CommercialClose:{ bg: "#EEE6F8", fg: "#5E35B1" },
  PartFinance:    { bg: "#FBF3E2", fg: "#8A6516" },
  Refinance:      { bg: "#FBF3E2", fg: "#8A6516" },
  Closed:         { bg: "#E1F5EE", fg: "#0F6E56" },
  Stalled:        { bg: "#FCEBEB", fg: "#A32D2D" },
};

// ── ProjectStage badge ─────────────────────────────────────────────────────────
const PROJECT_STAGE_STYLE: Record<string, BS> = {
  Concept:        { bg: "#F1EFE8", fg: "#5A6472" },
  Prefeasibility: { bg: "#E6F1FB", fg: "#0C447C" },
  Feasibility:    { bg: "#E6F1FB", fg: "#2A6FB0" },
  Bankable:       { bg: "#EEE6F8", fg: "#5E35B1" },
  Construction:   { bg: "#FBF3E2", fg: "#8A6516" },
  Operational:    { bg: "#E1F5EE", fg: "#0F6E56" },
};

// ── Match status ───────────────────────────────────────────────────────────────
const MATCH_STYLE: Record<string, BS> = {
  Suggested: { bg: "#FBF3E2", fg: "#8A6516" },
  Accepted:  { bg: "#E1F5EE", fg: "#0F6E56" },
  Declined:  { bg: "#FCEBEB", fg: "#A32D2D" },
};

// ── Meeting status ─────────────────────────────────────────────────────────────
const MEETING_STYLE: Record<string, BS> = {
  Proposed:  { bg: "#E6F1FB", fg: "#0C447C" },
  Confirmed: { bg: "#EEE6F8", fg: "#5E35B1" },
  Held:      { bg: "#E1F5EE", fg: "#0F6E56" },
  NoShow:    { bg: "#FCEBEB", fg: "#A32D2D" },
};

const SIDE_LABELS: Record<string, string> = {
  CapitalSeeking:  "Capital Seeking",
  CapitalProvider: "Capital Provider",
  Offtaker:        "Offtaker",
  Supplier:        "Supplier",
};

// ── TonalBadge ────────────────────────────────────────────────────────────────
function TonalBadge({ text, style, size = "sm" }: { text: string; style: BS; size?: "xs" | "sm" }) {
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

// ── ProjectCard ────────────────────────────────────────────────────────────────
function ProjectCard({
  project,
  onDragStart,
  onEdit,
  onDelete,
}: {
  project: DealProject;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onEdit: (p: DealProject) => void;
  onDelete: (id: string) => void;
}) {
  const regulated = isRegulated(project.sector);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, project.id)}
      className="group bg-white rounded-lg border border-[var(--brand-border)] p-3 space-y-2 cursor-grab active:cursor-grabbing select-none shadow-sm"
    >
      {/* Header row */}
      <div className="flex items-start gap-1.5">
        <GripVertical className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: MUTED }} />
        <p className="flex-1 text-[13px] font-semibold text-[var(--brand-ink)] leading-snug">{project.name}</p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(project)} className="p-0.5 rounded hover:bg-[var(--brand-tint)]" style={{ color: MUTED }}>
            <PenLine className="h-3 w-3" />
          </button>
          <button onClick={() => onDelete(project.id)} className="p-0.5 rounded hover:bg-[#FCEBEB]" style={{ color: MUTED }}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Side + ProjectStage badges */}
      <div className="flex flex-wrap gap-1">
        <TonalBadge
          text={SIDE_LABELS[project.side] ?? project.side}
          style={{ bg: "#F1EFE8", fg: "#5A6472" }}
          size="xs"
        />
        {project.projectStage && (
          <TonalBadge
            text={project.projectStage}
            style={PROJECT_STAGE_STYLE[project.projectStage] ?? { bg: "#F1EFE8", fg: "#5A6472" }}
            size="xs"
          />
        )}
      </div>

      {/* Sector + licensing */}
      {project.sector && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px]" style={{ color: MUTED }}>{sectorLabel(project.sector)}</span>
          {regulated && project.licensingStatus && project.licensingStatus !== "NotRequired" && (
            <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1 py-px rounded"
              style={{
                background: project.licensingStatus === "Licensed" ? "#E1F5EE" : "#FCEBEB",
                color: project.licensingStatus === "Licensed" ? "#0F6E56" : "#A32D2D",
              }}
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              {project.licensingStatus}
            </span>
          )}
        </div>
      )}

      {/* Originator / promoter */}
      {project.originator && (
        <p className="text-[11px]" style={{ color: MUTED }}>
          <span className="font-medium">Promoter:</span> {project.originator}
        </p>
      )}

      {/* Ticket size */}
      {(project.ticketSizeMin || project.ticketSizeMax) && (
        <p className="text-[11px] font-medium tabular-nums" style={{ color: MUTED }}>
          {project.ticketSizeMin ? formatMoney(project.ticketSizeMin, project.currency) : ""}
          {project.ticketSizeMin && project.ticketSizeMax ? " – " : ""}
          {project.ticketSizeMax ? formatMoney(project.ticketSizeMax, project.currency) : ""}
        </p>
      )}
    </div>
  );
}

// ── MatchCard ──────────────────────────────────────────────────────────────────
function MatchCard({
  match,
  onAccept,
  onDecline,
  onSchedule,
}: {
  match: DealMatchWithProjects;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onSchedule: (match: DealMatchWithProjects) => void;
}) {
  const ms = MATCH_STYLE[match.status] ?? { bg: "#F1EFE8", fg: "#5A6472" };
  return (
    <div className="bg-white rounded-lg border border-[var(--brand-border)] p-4 space-y-3 shadow-sm">
      {/* Score header */}
      <div className="flex items-center justify-between gap-2">
        <TonalBadge text={match.status} style={ms} />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]" style={{ color: MUTED }}>Score</span>
          <span className="text-[15px] font-bold tabular-nums text-[var(--brand-ink)]">{match.matchScore}</span>
        </div>
      </div>

      {/* Project pair */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <div className="rounded-md px-2 py-1.5 text-center" style={{ background: "var(--brand-tint)" }}>
          <p className="text-[12px] font-medium text-[var(--brand-ink)] truncate">{match.projectA?.name ?? "—"}</p>
          <p className="text-[10px]" style={{ color: MUTED }}>{SIDE_LABELS[match.projectA?.side ?? ""] ?? ""}</p>
        </div>
        <span className="text-[12px]" style={{ color: MUTED }}>↔</span>
        <div className="rounded-md px-2 py-1.5 text-center" style={{ background: "var(--brand-tint)" }}>
          <p className="text-[12px] font-medium text-[var(--brand-ink)] truncate">{match.projectB?.name ?? "—"}</p>
          <p className="text-[10px]" style={{ color: MUTED }}>{SIDE_LABELS[match.projectB?.side ?? ""] ?? ""}</p>
        </div>
      </div>

      {/* Rationale */}
      {match.rationale && (
        <p className="text-[12px]" style={{ color: MUTED }}>{match.rationale}</p>
      )}

      {/* Actions */}
      {match.status === "Suggested" && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 text-xs gap-1 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
            onClick={() => onAccept(match.id)}
          >
            <Check className="h-3 w-3" /> Accept
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onDecline(match.id)}>
            <X className="h-3 w-3" /> Decline
          </Button>
        </div>
      )}
      {match.status === "Accepted" && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => onSchedule(match)}
        >
          <Calendar className="h-3 w-3" /> Schedule meeting
        </Button>
      )}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-[var(--brand-border)] p-3 space-y-2 shadow-sm animate-pulse">
      <div className="h-3 rounded" style={{ background: "var(--brand-border)", width: "75%" }} />
      <div className="h-2 rounded" style={{ background: "var(--brand-border)", width: "45%" }} />
      <div className="h-2 rounded" style={{ background: "var(--brand-border)", width: "55%" }} />
    </div>
  );
}

// ── Form types ─────────────────────────────────────────────────────────────────
type ProjectForm = {
  name: string; side: string; sector: string; ticketSizeMin: string; ticketSizeMax: string;
  originator: string; description: string; contactPerson: string; contactEmail: string;
  projectStage: string; registrationStatus: string; licensingStatus: string;
};

const emptyProjectForm = (): ProjectForm => ({
  name: "", side: "CapitalSeeking", sector: "", ticketSizeMin: "", ticketSizeMax: "",
  originator: "", description: "", contactPerson: "", contactEmail: "",
  projectStage: "", registrationStatus: "NotRequired", licensingStatus: "NotRequired",
});

type MeetingForm = {
  projectAId: string; projectBId: string; scheduledAt: string; room: string; notes: string;
};

const emptyMeetingForm = (): MeetingForm => ({
  projectAId: "", projectBId: "", scheduledAt: "", room: "", notes: "",
});

type CommitmentForm = {
  title: string; type: string; value: string; currency: string; partiesText: string;
  signedAt: string; dealProjectId: string;
};

const emptyCommitmentForm = (): CommitmentForm => ({
  title: "", type: "LOI", value: "", currency: "USD", partiesText: "", signedAt: "", dealProjectId: "",
});

// ── Main component ─────────────────────────────────────────────────────────────
export default function DealRoom() {
  const { activeConveningId } = useConvening();
  const qc = useQueryClient();
  const { toast } = useToast();

  const p = { conveningId: activeConveningId ?? "" };
  const enabled = !!activeConveningId;

  const { data: projects = [], isLoading: loadingProjects } = useListDealProjects(p, {
    query: { enabled, queryKey: getListDealProjectsQueryKey(p) },
  });
  const { data: matches = [] } = useListDealMatches(p, {
    query: { enabled, queryKey: getListDealMatchesQueryKey(p) },
  });
  const { data: meetings = [] } = useListDealMeetings(p, {
    query: { enabled, queryKey: getListDealMeetingsQueryKey(p) },
  });
  const { data: commitments = [] } = useListDealCommitments(p, {
    query: { enabled, queryKey: getListDealCommitmentsQueryKey(p) },
  });
  const { data: booths = [] } = useListBooths(p, {
    query: { enabled, queryKey: getListBoothsQueryKey(p) },
  });

  // Mutations
  const createProject    = useCreateDealProject();
  const updateProject    = useUpdateDealProject();
  const deleteProject    = useDeleteDealProject();
  const suggestMatches   = useSuggestDealMatches();
  const updateMatch      = useUpdateDealMatch();
  const createMeeting    = useCreateDealMeeting();
  const updateMeeting    = useUpdateDealMeeting();
  const deleteMeeting    = useDeleteDealMeeting();
  const createCommitment = useCreateDealCommitment();
  const deleteCommitment = useDeleteDealCommitment();

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: getListDealProjectsQueryKey(p) });
    void qc.invalidateQueries({ queryKey: getListDealMatchesQueryKey(p) });
    void qc.invalidateQueries({ queryKey: getListDealMeetingsQueryKey(p) });
    void qc.invalidateQueries({ queryKey: getListDealCommitmentsQueryKey(p) });
  };

  // UI state
  const [activeTab, setActiveTab] = useState<"pipeline" | "matches" | "meetings" | "signings">("pipeline");
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProjectForm());
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingForm, setMeetingForm] = useState<MeetingForm>(emptyMeetingForm());
  const [showCommitmentModal, setShowCommitmentModal] = useState(false);
  const [commitmentForm, setCommitmentForm] = useState<CommitmentForm>(emptyCommitmentForm());

  // Drag state
  const draggingId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const pipelineValue = useMemo(() =>
    projects
      .filter((p) => p.stage !== "Stalled" && p.stage !== "Closed")
      .reduce((sum, p) => sum + (p.ticketSizeMax ?? p.ticketSizeMin ?? 0), 0),
    [projects]
  );
  const totalSigned = useMemo(() =>
    commitments.reduce((s, c) => s + (c.value ?? 0), 0),
    [commitments]
  );
  const pendingMatches = matches.filter((m) => m.status === "Suggested").length;

  const byStage = useMemo(() =>
    PIPELINE_STAGES.reduce<Record<string, DealProject[]>>((acc, s) => {
      acc[s] = projects.filter((p) => p.stage === s);
      return acc;
    }, {} as Record<string, DealProject[]>),
    [projects]
  );
  const stalledProjects = projects.filter((p) => p.stage === "Stalled");

  const pMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // ── Drag handlers ────────────────────────────────────────────────────────────
  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>, stage: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(stage);
  }
  function handleDragLeave() { setDropTarget(null); }
  function handleDrop(e: DragEvent<HTMLDivElement>, stage: string) {
    e.preventDefault();
    setDropTarget(null);
    const id = draggingId.current;
    draggingId.current = null;
    if (!id) return;
    const project = projects.find((p) => p.id === id);
    if (!project || project.stage === stage) return;
    updateProject.mutate(
      { id, data: { stage: stage as DealProject["stage"] } },
      { onSuccess: invalidateAll }
    );
  }

  // ── Project handlers ─────────────────────────────────────────────────────────
  function openNewProject() {
    setProjectForm(emptyProjectForm());
    setEditingProjectId(null);
    setShowProjectModal(true);
  }
  function openEditProject(pr: DealProject) {
    setProjectForm({
      name: pr.name,
      side: pr.side,
      sector: pr.sector ?? "",
      ticketSizeMin: pr.ticketSizeMin != null ? String(pr.ticketSizeMin) : "",
      ticketSizeMax: pr.ticketSizeMax != null ? String(pr.ticketSizeMax) : "",
      originator: pr.originator ?? "",
      description: pr.description ?? "",
      contactPerson: pr.contactPerson ?? "",
      contactEmail: pr.contactEmail ?? "",
      projectStage: pr.projectStage ?? "",
      registrationStatus: pr.registrationStatus ?? "NotRequired",
      licensingStatus: pr.licensingStatus ?? "NotRequired",
    });
    setEditingProjectId(pr.id);
    setShowProjectModal(true);
  }
  async function handleProjectSubmit() {
    if (!projectForm.name || !activeConveningId) return;
    const data = {
      name: projectForm.name,
      side: projectForm.side as DealProject["side"],
      sector: projectForm.sector || undefined,
      ticketSizeMin: projectForm.ticketSizeMin ? Number(projectForm.ticketSizeMin) : undefined,
      ticketSizeMax: projectForm.ticketSizeMax ? Number(projectForm.ticketSizeMax) : undefined,
      originator: projectForm.originator || undefined,
      description: projectForm.description || undefined,
      contactPerson: projectForm.contactPerson || undefined,
      contactEmail: projectForm.contactEmail || undefined,
      projectStage: (projectForm.projectStage as "Concept" | "Prefeasibility" | "Feasibility" | "Bankable" | "Construction" | "Operational") || undefined,
      registrationStatus: projectForm.registrationStatus as "Registered" | "Pending" | "NotRequired" | "Expired",
      licensingStatus: projectForm.licensingStatus as "Licensed" | "Pending" | "NotRequired" | "Expired",
    };
    if (editingProjectId) {
      await updateProject.mutateAsync({ id: editingProjectId, data });
    } else {
      await createProject.mutateAsync({ data: { conveningId: activeConveningId, ...data } });
    }
    invalidateAll();
    setShowProjectModal(false);
    toast({ title: editingProjectId ? "Project updated" : "Project registered" });
  }
  function handleDeleteProject(id: string) {
    if (!confirm("Delete this project?")) return;
    deleteProject.mutate({ id }, { onSuccess: invalidateAll });
    toast({ title: "Project deleted" });
  }

  // ── Match handlers ───────────────────────────────────────────────────────────
  function handleSuggestMatches() {
    if (!activeConveningId) return;
    suggestMatches.mutate(
      { data: { conveningId: activeConveningId } },
      {
        onSuccess: (data) => {
          invalidateAll();
          toast({ title: `${data.length} match${data.length !== 1 ? "es" : ""} suggested` });
        },
      }
    );
  }
  function handleMatchStatus(id: string, status: "Accepted" | "Declined") {
    updateMatch.mutate({ id, data: { status } }, { onSuccess: invalidateAll });
  }
  function openScheduleMeeting(match: DealMatchWithProjects) {
    setMeetingForm({ ...emptyMeetingForm(), projectAId: match.projectAId, projectBId: match.projectBId });
    setShowMeetingModal(true);
    setActiveTab("meetings");
  }

  // ── Meeting handlers ─────────────────────────────────────────────────────────
  async function handleMeetingSubmit() {
    if (!meetingForm.projectAId || !meetingForm.projectBId || !activeConveningId) return;
    await createMeeting.mutateAsync({
      data: {
        conveningId: activeConveningId,
        projectAId: meetingForm.projectAId,
        projectBId: meetingForm.projectBId,
        scheduledAt: meetingForm.scheduledAt || undefined,
        room: meetingForm.room || undefined,
        notes: meetingForm.notes || undefined,
        status: "Proposed",
      },
    });
    invalidateAll();
    setShowMeetingModal(false);
    toast({ title: "Meeting scheduled" });
  }
  function advanceMeetingStatus(m: DealMeeting) {
    const order: DealMeeting["status"][] = ["Proposed", "Confirmed", "Held"];
    const idx = order.indexOf(m.status);
    if (idx < 0 || idx >= order.length - 1) return;
    updateMeeting.mutate({ id: m.id, data: { status: order[idx + 1] } }, { onSuccess: invalidateAll });
  }

  // ── Commitment handlers ──────────────────────────────────────────────────────
  async function handleCommitmentSubmit() {
    if (!commitmentForm.title || !activeConveningId) return;
    await createCommitment.mutateAsync({
      data: {
        conveningId: activeConveningId,
        title: commitmentForm.title,
        type: commitmentForm.type as DealCommitment["type"],
        value: commitmentForm.value ? Number(commitmentForm.value) : 0,
        currency: commitmentForm.currency,
        partiesText: commitmentForm.partiesText || undefined,
        signedAt: commitmentForm.signedAt || undefined,
        dealProjectId: commitmentForm.dealProjectId || undefined,
      },
    });
    invalidateAll();
    setShowCommitmentModal(false);
    setCommitmentForm(emptyCommitmentForm());
    toast({ title: "Signing recorded" });
  }

  if (!activeConveningId) return null;

  // ── Tab pill helper ──────────────────────────────────────────────────────────
  function TabPill({ id, label: lbl, badge }: { id: typeof activeTab; label: string; badge?: number }) {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors"
        style={active
          ? { background: "var(--brand-primary)", color: "#fff" }
          : { color: MUTED }
        }
      >
        {lbl}
        {badge != null && badge > 0 && (
          <span
            className="text-[10px] font-bold px-1 py-px rounded-full leading-none"
            style={active
              ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
              : { background: "#FBF3E2", color: "#8A6516" }
            }
          >
            {badge}
          </span>
        )}
      </button>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Deal Room</h1>
          <p className="text-[13px] mt-0.5 flex flex-wrap gap-3" style={{ color: MUTED }}>
            <span>{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
            {pipelineValue > 0 && (
              <span>Pipeline: <strong className="text-[var(--brand-ink)]">{formatMoney(pipelineValue)}</strong></span>
            )}
            {commitments.length > 0 && (
              <span>
                {commitments.length} signed
                {totalSigned > 0 && (
                  <strong className="text-[var(--brand-ink)] ml-1">({formatMoney(totalSigned)})</strong>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => exportXlsx(
              projects.map((p) => ({
                "Project Name":    p.name,
                "Side":           p.side ?? "",
                "Sector":         p.sector ?? "",
                "Project Stage":  p.projectStage ?? "",
                "Pipeline Stage": p.stage ?? "",
                "Ticket Min":     p.ticketSizeMin ?? "",
                "Ticket Max":     p.ticketSizeMax ?? "",
                "Currency":       p.currency ?? "",
                "Registration":   p.registrationStatus ?? "",
                "Licensing":      p.licensingStatus ?? "",
                "Description":    p.description ?? "",
              })),
              "deal-room-projects"
            )}>
            <FileSpreadsheet className="h-4 w-4" /> Export XLSX
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
            onClick={openNewProject}
          >
            <Plus className="h-4 w-4" /> Register project
          </Button>
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[var(--brand-border)] pb-px">
        <TabPill id="pipeline"  label="Pipeline" />
        <TabPill id="matches"   label="Matches"  badge={pendingMatches} />
        <TabPill id="meetings"  label="Meetings" badge={meetings.filter(m => m.status === "Proposed").length} />
        <TabPill id="signings"  label="Signings" />
      </div>

      {/* ══ PIPELINE tab ══════════════════════════════════════════════════════ */}
      {activeTab === "pipeline" && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {/* Active stage columns */}
            {PIPELINE_STAGES.map((stage) => {
              const ss = STAGE_STYLE[stage];
              const isTarget = dropTarget === stage;
              return (
                <div
                  key={stage}
                  className="w-[200px] shrink-0 flex flex-col gap-2"
                  onDragOver={(e) => handleDragOver(e, stage)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage)}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors"
                    style={isTarget
                      ? { background: ss.bg, outline: `2px dashed ${ss.fg}` }
                      : { background: ss.bg }
                    }
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: ss.fg }}>
                      {STAGE_LABELS[stage]}
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: ss.fg }}>
                      {byStage[stage]?.length ?? 0}
                    </span>
                  </div>
                  {/* Cards */}
                  {loadingProjects
                    ? [0, 1].map((i) => <CardSkeleton key={i} />)
                    : (byStage[stage] ?? []).map((pr) => (
                      <ProjectCard
                        key={pr.id}
                        project={pr}
                        onDragStart={handleDragStart}
                        onEdit={openEditProject}
                        onDelete={handleDeleteProject}
                      />
                    ))
                  }
                  {/* Drop zone hint when empty */}
                  {!loadingProjects && (byStage[stage] ?? []).length === 0 && (
                    <div
                      className="rounded-lg border-2 border-dashed h-16 flex items-center justify-center transition-colors"
                      style={{
                        borderColor: isTarget ? ss.fg : "var(--brand-border)",
                        background: isTarget ? ss.bg : "transparent",
                      }}
                    >
                      <span className="text-[10px]" style={{ color: MUTED }}>Drop here</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Stalled column (only when populated) */}
            {stalledProjects.length > 0 && (
              <div
                className="w-[200px] shrink-0 flex flex-col gap-2"
                onDragOver={(e) => handleDragOver(e, "Stalled")}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, "Stalled")}
              >
                <div
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md"
                  style={dropTarget === "Stalled"
                    ? { background: STAGE_STYLE.Stalled.bg, outline: `2px dashed ${STAGE_STYLE.Stalled.fg}` }
                    : { background: STAGE_STYLE.Stalled.bg }
                  }
                >
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: STAGE_STYLE.Stalled.fg }}>Stalled</span>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: STAGE_STYLE.Stalled.fg }}>{stalledProjects.length}</span>
                </div>
                {stalledProjects.map((pr) => (
                  <ProjectCard
                    key={pr.id}
                    project={pr}
                    onDragStart={handleDragStart}
                    onEdit={openEditProject}
                    onDelete={handleDeleteProject}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MATCHES tab ═══════════════════════════════════════════════════════ */}
      {activeTab === "matches" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px]" style={{ color: MUTED }}>
              {matches.length} match{matches.length !== 1 ? "es" : ""}
              {pendingMatches > 0 && ` · ${pendingMatches} pending review`}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={suggestMatches.isPending}
              onClick={handleSuggestMatches}
            >
              <Sparkles className="h-4 w-4" />
              {suggestMatches.isPending ? "Running…" : "Suggest matches"}
            </Button>
          </div>

          {matches.length === 0 ? (
            <div className="py-16 text-center">
              <Sparkles className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
              <p className="text-[14px] font-medium text-[var(--brand-ink)] mb-1">No matches yet</p>
              <p className="text-[13px] mb-4" style={{ color: MUTED }}>
                Register projects on both sides of the deal, then click "Suggest matches".
              </p>
              <Button size="sm" variant="outline" className="gap-2" onClick={handleSuggestMatches}>
                <Sparkles className="h-4 w-4" /> Suggest matches
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...matches]
                .sort((a, b) => {
                  if (a.status === "Suggested" && b.status !== "Suggested") return -1;
                  if (b.status === "Suggested" && a.status !== "Suggested") return 1;
                  return b.matchScore - a.matchScore;
                })
                .map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    onAccept={(id) => handleMatchStatus(id, "Accepted")}
                    onDecline={(id) => handleMatchStatus(id, "Declined")}
                    onSchedule={openScheduleMeeting}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* ══ MEETINGS tab ══════════════════════════════════════════════════════ */}
      {activeTab === "meetings" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px]" style={{ color: MUTED }}>
              {meetings.length} meeting{meetings.length !== 1 ? "s" : ""}
            </p>
            <Button
              size="sm"
              className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              onClick={() => { setMeetingForm(emptyMeetingForm()); setShowMeetingModal(true); }}
            >
              <Plus className="h-4 w-4" /> Schedule meeting
            </Button>
          </div>

          {meetings.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
              <p className="text-[14px] font-medium text-[var(--brand-ink)] mb-1">No meetings yet</p>
              <p className="text-[13px] mb-4" style={{ color: MUTED }}>
                Accept a match and schedule a meeting in a booth.
              </p>
            </div>
          ) : (
            <div className="border border-[var(--brand-border)] rounded-lg overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--brand-page-bg)", borderBottom: "1px solid var(--brand-border)", height: 36 }}>
                    {["Projects", "Booth / Room", "Scheduled", "Status", ""].map((h, i) => (
                      <th key={i} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m) => {
                    const ms = MEETING_STYLE[m.status] ?? { bg: "#F1EFE8", fg: "#5A6472" };
                    const pA = pMap.get(m.projectAId);
                    const pB = pMap.get(m.projectBId);
                    return (
                      <tr
                        key={m.id}
                        className="group"
                        style={{ height: 44, borderBottom: "1px solid var(--brand-border)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-tint)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                      >
                        <td className="px-4 py-2.5">
                          <p className="text-[12px] font-medium text-[var(--brand-ink)]">
                            {pA?.name ?? m.projectAId} ↔ {pB?.name ?? m.projectBId}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[12px]" style={{ color: MUTED }}>{m.room ?? "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[12px]" style={{ color: MUTED }}>{m.scheduledAt ?? "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <TonalBadge text={m.status} style={ms} size="xs" />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {m.status !== "Held" && m.status !== "NoShow" && (
                              <button
                                onClick={() => advanceMeetingStatus(m)}
                                className="text-[11px] px-2 py-0.5 rounded"
                                style={{ background: "var(--brand-tint)", color: "var(--brand-primary)" }}
                              >
                                Advance
                              </button>
                            )}
                            <button
                              onClick={() => deleteMeeting.mutate({ id: m.id }, { onSuccess: invalidateAll })}
                              className="p-1 rounded hover:bg-[#FCEBEB]"
                              style={{ color: MUTED }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ SIGNINGS tab ══════════════════════════════════════════════════════ */}
      {activeTab === "signings" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            {totalSigned > 0 && (
              <p className="text-[13px]" style={{ color: MUTED }}>
                Total signed: <strong className="text-[var(--brand-ink)]">{formatMoney(totalSigned)}</strong>
              </p>
            )}
            <Button
              size="sm"
              className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white ml-auto"
              onClick={() => { setCommitmentForm(emptyCommitmentForm()); setShowCommitmentModal(true); }}
            >
              <PenLine className="h-4 w-4" /> Record signing
            </Button>
          </div>

          {commitments.length === 0 ? (
            <div className="py-16 text-center">
              <PenLine className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
              <p className="text-[14px] font-medium text-[var(--brand-ink)] mb-1">No signings yet</p>
              <p className="text-[13px]" style={{ color: MUTED }}>Record LOIs, MoUs and investment commitments here.</p>
            </div>
          ) : (
            <div className="border border-[var(--brand-border)] rounded-lg overflow-hidden bg-white">
              {commitments.map((c) => (
                <div
                  key={c.id}
                  className="group flex items-center justify-between px-4 py-3 hover:bg-[var(--brand-tint)] transition-colors"
                  style={{ borderBottom: "1px solid var(--brand-border)" }}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-[var(--brand-ink)]">{c.title}</p>
                      <TonalBadge
                        text={c.type}
                        style={{ bg: "#EEE6F8", fg: "#5E35B1" }}
                        size="xs"
                      />
                    </div>
                    <p className="text-[11px]" style={{ color: MUTED }}>
                      {c.partiesText && `${c.partiesText} · `}
                      {c.signedAt && `Signed ${c.signedAt}`}
                      {c.dealProjectId && ` · ${pMap.get(c.dealProjectId)?.name ?? c.dealProjectId}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.value > 0 && (
                      <p className="text-[13px] font-semibold tabular-nums text-[var(--brand-ink)]">
                        {formatMoney(c.value, c.currency)}
                      </p>
                    )}
                    <button
                      onClick={() => deleteCommitment.mutate({ id: c.id }, { onSuccess: invalidateAll })}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#FCEBEB] transition"
                      style={{ color: MUTED }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Register / Edit Project modal ────────────────────────────────────── */}
      <Modal
        open={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        title={editingProjectId ? "Edit project" : "Register deal project"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowProjectModal(false)}>Cancel</Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={!projectForm.name || createProject.isPending || updateProject.isPending}
              onClick={handleProjectSubmit}
            >
              {editingProjectId ? "Save" : "Register"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 py-1">
          <div className="col-span-2">
            <label className={FL}>Project / Entity name *</label>
            <Input value={projectForm.name} onChange={(e) => setProjectForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nile Solar Ltd" />
          </div>
          <div>
            <label className={FL}>Side *</label>
            <Select value={projectForm.side} onValueChange={(v) => setProjectForm(f => ({ ...f, side: v }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SIDE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Sector</label>
            <Select value={projectForm.sector || "_none"} onValueChange={(v) => setProjectForm(f => ({ ...f, sector: v === "_none" ? "" : v }))}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Select sector" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Not specified —</SelectItem>
                <SelectItem value="_reg_header" disabled className="text-[10px] uppercase tracking-wider text-[var(--brand-text-secondary)] font-bold pt-2">
                  Regulated sectors
                </SelectItem>
                {SECTORS.filter(s => s.regulated).map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
                <SelectItem value="_unreg_header" disabled className="text-[10px] uppercase tracking-wider text-[var(--brand-text-secondary)] font-bold pt-2">
                  Other sectors
                </SelectItem>
                {SECTORS.filter(s => !s.regulated).map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Project maturity</label>
            <Select value={projectForm.projectStage || "_none"} onValueChange={(v) => setProjectForm(f => ({ ...f, projectStage: v === "_none" ? "" : v }))}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Select stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Not set —</SelectItem>
                {["Concept", "Prefeasibility", "Feasibility", "Bankable", "Construction", "Operational"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Promoter / Originator</label>
            <Input value={projectForm.originator} onChange={(e) => setProjectForm(f => ({ ...f, originator: e.target.value }))} placeholder="e.g. Uganda DFI" />
          </div>
          <div>
            <label className={FL}>Ticket min (USD)</label>
            <Input type="number" value={projectForm.ticketSizeMin} onChange={(e) => setProjectForm(f => ({ ...f, ticketSizeMin: e.target.value }))} placeholder="500000" />
          </div>
          <div>
            <label className={FL}>Ticket max (USD)</label>
            <Input type="number" value={projectForm.ticketSizeMax} onChange={(e) => setProjectForm(f => ({ ...f, ticketSizeMax: e.target.value }))} placeholder="5000000" />
          </div>
          {isRegulated(projectForm.sector) && (
            <>
              <div>
                <label className={FL}>Registration status</label>
                <Select value={projectForm.registrationStatus} onValueChange={(v) => setProjectForm(f => ({ ...f, registrationStatus: v }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Registered", "Pending", "NotRequired", "Expired"].map(s => (
                      <SelectItem key={s} value={s}>{s === "NotRequired" ? "Not Required" : s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={FL}>Licensing status</label>
                <Select value={projectForm.licensingStatus} onValueChange={(v) => setProjectForm(f => ({ ...f, licensingStatus: v }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Licensed", "Pending", "NotRequired", "Expired"].map(s => (
                      <SelectItem key={s} value={s}>{s === "NotRequired" ? "Not Required" : s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="col-span-2">
            <label className={FL}>Contact person</label>
            <Input value={projectForm.contactPerson} onChange={(e) => setProjectForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder="Name" />
          </div>
          <div className="col-span-2">
            <label className={FL}>Description</label>
            <Textarea
              value={projectForm.description}
              onChange={(e) => setProjectForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief project description"
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>
      </Modal>

      {/* ── Schedule Meeting modal ───────────────────────────────────────────── */}
      <Modal
        open={showMeetingModal}
        onClose={() => setShowMeetingModal(false)}
        title="Schedule meeting"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowMeetingModal(false)}>Cancel</Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={!meetingForm.projectAId || !meetingForm.projectBId || createMeeting.isPending}
              onClick={handleMeetingSubmit}
            >
              Schedule
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <div>
            <label className={FL}>Project A *</label>
            <Select value={meetingForm.projectAId || "_none"} onValueChange={(v) => setMeetingForm(f => ({ ...f, projectAId: v === "_none" ? "" : v }))}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Select —</SelectItem>
                {projects.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Project B *</label>
            <Select value={meetingForm.projectBId || "_none"} onValueChange={(v) => setMeetingForm(f => ({ ...f, projectBId: v === "_none" ? "" : v }))}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Select —</SelectItem>
                {projects.filter(pr => pr.id !== meetingForm.projectAId).map(pr => (
                  <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Booth / Room</label>
            {booths.length > 0 ? (
              <Select value={meetingForm.room || "_none"} onValueChange={(v) => setMeetingForm(f => ({ ...f, room: v === "_none" ? "" : v }))}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Select booth" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Not assigned —</SelectItem>
                  {booths.map(b => (
                    <SelectItem key={b.id} value={b.code}>
                      {b.code} — {b.zone} ({b.tier})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={meetingForm.room}
                onChange={(e) => setMeetingForm(f => ({ ...f, room: e.target.value }))}
                placeholder="e.g. Room 3A"
              />
            )}
          </div>
          <div>
            <label className={FL}>Scheduled at</label>
            <Input
              value={meetingForm.scheduledAt}
              onChange={(e) => setMeetingForm(f => ({ ...f, scheduledAt: e.target.value }))}
              placeholder="e.g. Day 1, 14:00"
            />
          </div>
          <div>
            <label className={FL}>Notes</label>
            <Textarea
              value={meetingForm.notes}
              onChange={(e) => setMeetingForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Agenda, context…"
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>
      </Modal>

      {/* ── Record Signing modal ─────────────────────────────────────────────── */}
      <Modal
        open={showCommitmentModal}
        onClose={() => setShowCommitmentModal(false)}
        title="Record signing"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCommitmentModal(false)}>Cancel</Button>
            <Button
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white"
              disabled={!commitmentForm.title || createCommitment.isPending}
              onClick={handleCommitmentSubmit}
            >
              Record
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 py-1">
          <div className="col-span-2">
            <label className={FL}>Title *</label>
            <Input value={commitmentForm.title} onChange={(e) => setCommitmentForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Nile Solar LOI" />
          </div>
          <div>
            <label className={FL}>Type</label>
            <Select value={commitmentForm.type} onValueChange={(v) => setCommitmentForm(f => ({ ...f, type: v }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["LOI", "MoU", "TermSheet", "Investment"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Project (optional)</label>
            <Select value={commitmentForm.dealProjectId || "_none"} onValueChange={(v) => setCommitmentForm(f => ({ ...f, dealProjectId: v === "_none" ? "" : v }))}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— None —</SelectItem>
                {projects.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={FL}>Value</label>
            <Input type="number" value={commitmentForm.value} onChange={(e) => setCommitmentForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label className={FL}>Currency</label>
            <Select value={commitmentForm.currency} onValueChange={(v) => setCommitmentForm(f => ({ ...f, currency: v }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="UGX">UGX</SelectItem>
                <SelectItem value="KES">KES</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className={FL}>Parties</label>
            <Input value={commitmentForm.partiesText} onChange={(e) => setCommitmentForm(f => ({ ...f, partiesText: e.target.value }))} placeholder="e.g. Nile Solar Ltd + NSSF Uganda" />
          </div>
          <div className="col-span-2">
            <label className={FL}>Signed at (date / session)</label>
            <Input value={commitmentForm.signedAt} onChange={(e) => setCommitmentForm(f => ({ ...f, signedAt: e.target.value }))} placeholder="e.g. 2026-06-15 or Day 2 closing" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
