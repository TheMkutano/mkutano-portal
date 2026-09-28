import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMilestones,
  useCreateMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
  getListMilestonesQueryKey,
  useListTasks,
  getListTasksQueryKey,
  type Milestone,
  type Task,
} from "@workspace/api-client-react";
import { label } from "@/lib/labels";
import { Link } from "wouter";
import { useConvening } from "@/contexts/ConveningContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Flag, Plus, Pencil, Trash2, ChevronDown, ChevronRight, ListTodo } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const PHASES = ["PreEvent", "EventDay", "PostEvent"] as const;
type Phase = (typeof PHASES)[number];

const PHASE_LABELS: Record<Phase, string> = {
  PreEvent:  "Pre-Event",
  EventDay:  "Event Day",
  PostEvent: "Post-Event",
};

const STATUSES = ["NotStarted", "InProgress", "Complete", "AtRisk", "Blocked"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_META: Record<Status, { label: string; bg: string; color: string }> = {
  NotStarted: { label: "Not Started", bg: "#F1F5F9", color: "#64748B" },
  InProgress: { label: "In Progress", bg: "#EFF6FF", color: "#1D4ED8" },
  Complete:   { label: "Complete",    bg: "#ECFDF5", color: "#059669" },
  AtRisk:     { label: "At Risk",     bg: "#FFF7ED", color: "#D97706" },
  Blocked:    { label: "Blocked",     bg: "#FFF1F2", color: "#BE123C" },
};

// ── Task status colours (mirrors Tasks.tsx) ───────────────────────────────────
const TASK_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  NotStarted: { bg: "#F4F5F6", fg: "#6C7A99" },
  InProgress:  { bg: "#EEF3F9", fg: "#2A6FB0" },
  Blocked:     { bg: "#FCEAE8", fg: "#B5462F" },
  Completed:   { bg: "#E8F5ED", fg: "#2E7D5B" },
};

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: m.bg, color: m.color }}
    >
      {m.label}
    </span>
  );
}

// ── Form types ───────────────────────────────────────────────────────────────

interface MilestoneFormValues {
  title:       string;
  description: string;
  phase:       Phase;
  targetDate:  string;
  owner:       string;
  status:      Status;
  dependency:  string;
  notes:       string;
}

const EMPTY_FORM: MilestoneFormValues = {
  title:       "",
  description: "",
  phase:       "PreEvent",
  targetDate:  "",
  owner:       "",
  status:      "NotStarted",
  dependency:  "",
  notes:       "",
};

// ── Add / Edit dialog ────────────────────────────────────────────────────────

interface MilestoneDialogProps {
  open:       boolean;
  initial:    MilestoneFormValues;
  title:      string;
  saving:     boolean;
  onSave:     (values: MilestoneFormValues) => void;
  onClose:    () => void;
}

function MilestoneDialog({ open, initial, title, saving, onSave, onClose }: MilestoneDialogProps) {
  const [form, setForm] = useState<MilestoneFormValues>(initial);

  // reset when re-opened with a new initial value
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(initial); setLastOpen(true); }
  if (!open && lastOpen)  { setLastOpen(false); }

  function set(field: keyof MilestoneFormValues) {
    return (value: string) => setForm((f) => ({ ...f, [field]: value }));
  }

  function handleInput(field: keyof MilestoneFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Milestone *</Label>
            <Input
              className="mt-1"
              value={form.title}
              onChange={handleInput("title")}
              placeholder="e.g. Venue confirmed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phase</Label>
              <Select value={form.phase} onValueChange={set("phase")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASES.map((p) => (
                    <SelectItem key={p} value={p}>{PHASE_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target Date</Label>
              <Input
                className="mt-1"
                type="date"
                value={form.targetDate}
                onChange={handleInput("targetDate")}
              />
            </div>

            <div>
              <Label>Owner</Label>
              <Input
                className="mt-1"
                value={form.owner}
                onChange={handleInput("owner")}
                placeholder="Person responsible"
              />
            </div>
          </div>

          <div>
            <Label>Dependency</Label>
            <Input
              className="mt-1"
              value={form.dependency}
              onChange={handleInput("dependency")}
              placeholder="What must happen first?"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={form.description}
              onChange={handleInput("description")}
              placeholder="Optional context"
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={form.notes}
              onChange={handleInput("notes")}
              placeholder="Internal notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim()}
            style={{ background: "var(--brand-navy)", color: "#fff" }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Phase section ─────────────────────────────────────────────────────────────

interface PhaseGroupProps {
  phase:      Phase;
  rows:       Milestone[];
  tasks:      Task[];
  onEdit:     (m: Milestone) => void;
  onDelete:   (m: Milestone) => void;
}

function PhaseGroup({ phase, rows, tasks, onEdit, onDelete }: PhaseGroupProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Phase header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[11px] font-bold uppercase tracking-[0.07em] px-2.5 py-0.5 rounded-full"
          style={{
            background: phase === "PreEvent"  ? "#EFF6FF"
                      : phase === "EventDay"  ? "#F5F3FF"
                      : "#ECFDF5",
            color:      phase === "PreEvent"  ? "#1D4ED8"
                      : phase === "EventDay"  ? "#6D28D9"
                      : "#059669",
          }}
        >
          {PHASE_LABELS[phase]}
        </span>
        <span className="text-xs text-[var(--brand-text-secondary)]">{rows.length} milestone{rows.length !== 1 ? "s" : ""}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-secondary)] italic pl-1 mb-4">No milestones yet.</p>
      ) : (
        <div className="rounded-lg border border-[var(--brand-border)] overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--brand-text-secondary)] text-[11px] uppercase tracking-wide w-[30%]">Milestone</th>
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--brand-text-secondary)] text-[11px] uppercase tracking-wide w-[12%]">Target Date</th>
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--brand-text-secondary)] text-[11px] uppercase tracking-wide w-[14%]">Owner</th>
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--brand-text-secondary)] text-[11px] uppercase tracking-wide w-[13%]">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--brand-text-secondary)] text-[11px] uppercase tracking-wide w-[23%]">Dependency</th>
                <th className="px-4 py-2.5 w-[8%]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const linkedTasks = tasks.filter((t) => t.milestoneId === m.id);
                const isExpanded  = expanded.has(m.id);
                const rowBg       = i % 2 === 1 ? "bg-[var(--brand-surface)]" : "bg-white";

                return (
                  <React.Fragment key={m.id}>
                    <tr
                      className={`border-b border-[var(--brand-border)] ${isExpanded ? "" : "last:border-0"} ${rowBg}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--brand-navy)] leading-snug">{m.title}</div>
                        {m.description && (
                          <div className="text-xs text-[var(--brand-text-secondary)] mt-0.5 line-clamp-1">{m.description}</div>
                        )}
                        {/* Linked-tasks chip */}
                        {linkedTasks.length > 0 ? (
                          <button
                            onClick={() => toggle(m.id)}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors hover:opacity-80"
                            style={{ background: "#F5F3FF", color: "#6D28D9" }}
                          >
                            <ListTodo size={10} />
                            {linkedTasks.length} task{linkedTasks.length !== 1 ? "s" : ""}
                            {isExpanded
                              ? <ChevronDown size={10} />
                              : <ChevronRight size={10} />}
                          </button>
                        ) : (
                          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[var(--brand-text-secondary)] opacity-40 select-none">
                            <ListTodo size={10} />
                            No tasks
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--brand-text-secondary)]">
                        {m.targetDate
                          ? new Date(m.targetDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                          : <span className="text-[var(--brand-text-secondary)] opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--brand-text-secondary)]">
                        {m.owner || <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={m.status as Status} />
                      </td>
                      <td className="px-4 py-3 text-[var(--brand-text-secondary)] text-xs">
                        {m.dependency || <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => onEdit(m)}
                            className="p-1 rounded hover:bg-[var(--brand-surface)] text-[var(--brand-text-secondary)]"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => onDelete(m)}
                            className="p-1 rounded hover:bg-red-50 text-[var(--brand-text-secondary)] hover:text-red-500"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded task list ───────────────────────────── */}
                    {isExpanded && (
                      <tr className="border-b border-[var(--brand-border)] last:border-0">
                        <td colSpan={6} className="px-4 pt-0 pb-3 bg-[#FAFAFF]">
                          <div className="rounded-md border border-[#DDD6FE] overflow-hidden mt-1">
                            {linkedTasks.map((t) => {
                              const ss = TASK_STATUS_STYLE[t.status] ?? TASK_STATUS_STYLE.NotStarted;
                              return (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-3 px-3 py-2 border-b border-[#EDE9FE] last:border-0 bg-white hover:bg-[#FAF8FF] transition-colors"
                                >
                                  <span
                                    className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                    style={{ background: ss.bg, color: ss.fg }}
                                  >
                                    {label(t.status)}
                                  </span>
                                  <span className="flex-1 truncate text-[13px] text-[var(--brand-ink)]">
                                    {t.title}
                                  </span>
                                  {t.assigneeName && (
                                    <span className="shrink-0 text-[11px] text-[var(--brand-text-secondary)]">
                                      {t.assigneeName}
                                    </span>
                                  )}
                                  <Link
                                    to="/tasks"
                                    className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--brand-primary)] hover:underline"
                                  >
                                    Open <ChevronRight size={10} />
                                  </Link>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Roadmap() {
  const { activeConveningId } = useConvening();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const qKey = getListMilestonesQueryKey(activeConveningId ? { conveningId: activeConveningId } : undefined);

  const { data: milestones = [], isLoading } = useListMilestones(
    activeConveningId ? { conveningId: activeConveningId } : undefined,
    { query: { queryKey: qKey, enabled: !!activeConveningId } },
  );

  // Fetch tasks so we can join them to milestones client-side
  const tasksParams = { conveningId: activeConveningId ?? "" };
  const { data: tasks = [] } = useListTasks(
    tasksParams,
    { query: { queryKey: getListTasksQueryKey(tasksParams), enabled: !!activeConveningId } },
  );

  const createMutation = useCreateMilestone({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
      onError: () => toast({ title: "Could not create milestone", description: "Please try again.", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateMilestone({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
      onError: () => toast({ title: "Could not save milestone", description: "Please try again.", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteMilestone({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
      onError: () => toast({ title: "Could not delete milestone", description: "Please try again.", variant: "destructive" }),
    },
  });

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Milestone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);

  function milestoneToForm(m: Milestone): MilestoneFormValues {
    return {
      title:       m.title,
      description: m.description ?? "",
      phase:       m.phase as Phase,
      targetDate:  m.targetDate ?? "",
      owner:       m.owner ?? "",
      status:      m.status as Status,
      dependency:  m.dependency ?? "",
      notes:       m.notes ?? "",
    };
  }

  // ── Save handlers ───────────────────────────────────────────────────────────
  function handleCreate(values: MilestoneFormValues) {
    if (!activeConveningId) return;
    createMutation.mutate(
      {
        data: {
          conveningId: activeConveningId,
          title:       values.title.trim(),
          ...(values.description && { description: values.description }),
          phase:       values.phase,
          ...(values.targetDate && { targetDate: values.targetDate }),
          ...(values.owner      && { owner:      values.owner }),
          status:      values.status,
          ...(values.dependency && { dependency: values.dependency }),
          ...(values.notes      && { notes:      values.notes }),
        },
      },
      { onSuccess: () => setAddOpen(false) },
    );
  }

  function handleUpdate(values: MilestoneFormValues) {
    if (!editTarget) return;
    updateMutation.mutate(
      {
        id: editTarget.id,
        data: {
          title:       values.title.trim(),
          description: values.description || null,
          phase:       values.phase,
          targetDate:  values.targetDate  || null,
          owner:       values.owner       || null,
          status:      values.status,
          dependency:  values.dependency  || null,
          notes:       values.notes       || null,
        },
      },
      { onSuccess: () => setEditTarget(null) },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id },
      { onSuccess: () => setDeleteTarget(null) },
    );
  }

  // ── Group by phase ──────────────────────────────────────────────────────────
  const byPhase = PHASES.reduce<Record<Phase, Milestone[]>>(
    (acc, p) => ({ ...acc, [p]: milestones.filter((m) => m.phase === p) }),
    { PreEvent: [], EventDay: [], PostEvent: [] },
  );

  const totalComplete = milestones.filter((m) => m.status === "Complete").length;
  const pctComplete = milestones.length > 0 ? Math.round((totalComplete / milestones.length) * 100) : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!activeConveningId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--brand-text-secondary)]">
        <Flag size={36} className="mb-3 opacity-30" />
        <p>Select a convening from the sidebar to view its roadmap.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="font-semibold leading-tight"
            style={{ fontSize: 22, color: "var(--brand-navy)" }}
          >
            Roadmap
          </h1>
          {milestones.length > 0 && (
            <div className="flex items-center gap-3 mt-2">
              <div className="h-2 w-48 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pctComplete}%`, background: "#059669" }}
                />
              </div>
              <span className="text-sm text-[var(--brand-text-secondary)]">
                {totalComplete} of {milestones.length} complete ({pctComplete}%)
              </span>
            </div>
          )}
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          style={{ background: "var(--brand-navy)", color: "#fff" }}
          className="flex items-center gap-1.5"
        >
          <Plus size={15} />
          Add Milestone
        </Button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--brand-text-secondary)]">
          <Flag size={40} className="mb-3 opacity-20" />
          <p className="font-medium">No milestones yet.</p>
          <p className="text-sm mt-1">Add your first milestone to start tracking the roadmap to event day.</p>
        </div>
      ) : (
        PHASES.map((phase) => (
          <PhaseGroup
            key={phase}
            phase={phase}
            rows={byPhase[phase]}
            tasks={tasks}
            onEdit={(m) => setEditTarget(m)}
            onDelete={(m) => setDeleteTarget(m)}
          />
        ))
      )}

      {/* Add dialog */}
      <MilestoneDialog
        open={addOpen}
        initial={EMPTY_FORM}
        title="Add Milestone"
        saving={createMutation.isPending}
        onSave={handleCreate}
        onClose={() => setAddOpen(false)}
      />

      {/* Edit dialog */}
      <MilestoneDialog
        open={!!editTarget}
        initial={editTarget ? milestoneToForm(editTarget) : EMPTY_FORM}
        title="Edit Milestone"
        saving={updateMutation.isPending}
        onSave={handleUpdate}
        onClose={() => setEditTarget(null)}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Milestone</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
