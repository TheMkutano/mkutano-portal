import { useEffect, useRef, useState } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import { projectObjectUrl } from "@/lib/projectObjectUrl";
import {
  useListWorkstreams,
  useListTasks,
  useCreateWorkstream,
  useUpdateWorkstream,
  useDeleteWorkstream,
  useCreateTask,
  useUpdateTask,
  useListConveningTeam,
  useListMilestones,
  useListTaskAttachments,
  useCreateTaskAttachment,
  useDeleteTaskAttachment,
  useDeleteTask,
  getListWorkstreamsQueryKey,
  getListTasksQueryKey,
  getListConveningTeamQueryKey,
  getListMilestonesQueryKey,
  getListTaskAttachmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { GanttChart } from "@/components/gantt/GanttChart";
import {
  Plus, Loader2, LayoutList, Kanban, GanttChartSquare, X,
  Upload, Link2, FileText, FileSpreadsheet, HardDrive, Trash2, Pencil, Check, AlertTriangle,
} from "lucide-react";
import { exportXlsx } from "@/lib/exportXlsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { label } from "@/lib/labels";
import type { Task, ConveningTeamMember, TaskAttachment } from "@workspace/api-client-react";

// ── Design-system tokens ──────────────────────────────────────────────────────
const CATEGORICAL = [
  "#0A2F5C", "#2A6FB0", "#4FA0C0", "#6C7A99",
  "#C99A3B", "#8E6FAE", "#4E8A66", "#BB6B4F",
];

type ViewMode = "list" | "board" | "gantt";

const UNASSIGNED_VALUE = "__unassigned__";

const STATUS_CYCLE: Record<string, string> = {
  NotStarted: "InProgress",
  InProgress:  "Completed",
  Completed:   "NotStarted",
  Blocked:     "InProgress",
};

const STATUS_COLUMNS = ["NotStarted", "InProgress", "Blocked", "Completed"] as const;

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  NotStarted: { bg: "#F4F5F6", fg: "#6C7A99" },
  InProgress:  { bg: "#EEF3F9", fg: "#2A6FB0" },
  Blocked:     { bg: "#FCEAE8", fg: "#B5462F" },
  Completed:   { bg: "#E8F5ED", fg: "#2E7D5B" },
};

const STATUS_BORDER: Record<string, string> = {
  NotStarted: "#C4CAD4",
  InProgress:  "#2A6FB0",
  Blocked:     "#B5462F",
  Completed:   "#2E7D5B",
};

const STATUS_CIRCLE: Record<string, { border: string; bg: string; check?: boolean }> = {
  NotStarted: { border: "#C4CAD4",  bg: "transparent" },
  InProgress:  { border: "#2A6FB0", bg: "#EEF3F9" },
  Blocked:     { border: "#B5462F", bg: "#FCEAE8" },
  Completed:   { border: "#2E7D5B", bg: "#E8F5ED", check: true },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.NotStarted;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0"
      style={{ background: s.bg, color: s.fg }}
    >
      {label(status)}
    </span>
  );
}

function StatusCircle({ status, onCycle }: { status: string; onCycle: () => void }) {
  const cs = STATUS_CIRCLE[status] ?? STATUS_CIRCLE.NotStarted;
  return (
    <button
      className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 hover:scale-125 hover:shadow-sm cursor-pointer"
      style={{ borderColor: cs.border, background: cs.bg }}
      onClick={onCycle}
      title={`Advance → ${label(STATUS_CYCLE[status] ?? "InProgress")}`}
    >
      {cs.check && (
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 10 10">
          <path d="M1.5 5l2.5 2.5 5-5" stroke="#2E7D5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function FL({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1">
      {children}
    </label>
  );
}

function AssigneeAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  const ini = name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const cls = size === "xs" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";
  return (
    <div
      className={`${cls} rounded-full bg-[var(--brand-tint)] flex items-center justify-center text-[var(--brand-primary)] font-bold shrink-0`}
      title={name}
    >
      {ini}
    </div>
  );
}

// ── Priority helpers ──────────────────────────────────────────────────────────
const PRIORITY_VALUES = ["Low", "Medium", "High", "Urgent"] as const;
type TaskPriority = typeof PRIORITY_VALUES[number];

const PRIORITY_STYLE: Record<TaskPriority, { bg: string; fg: string; label: string }> = {
  Low:    { bg: "#F0FDF4", fg: "#166534", label: "Low" },
  Medium: { bg: "#EFF6FF", fg: "#1E40AF", label: "Medium" },
  High:   { bg: "#FEF3C7", fg: "#92400E", label: "High" },
  Urgent: { bg: "#FEE2E2", fg: "#991B1B", label: "Urgent" },
};

function PriorityBadge({ priority }: { priority: string }) {
  const s = PRIORITY_STYLE[priority as TaskPriority] ?? PRIORITY_STYLE.Medium;
  return (
    <span
      className="text-[9px] font-bold uppercase rounded px-1.5 py-0.5 shrink-0 tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

// ── Task edit modal ───────────────────────────────────────────────────────────
interface TaskEditForm {
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string;
  startDate: string;
  assigneeUserId: string;
  progressPct: number;
  isMilestone: boolean;
  milestoneId: string;
  workstreamId: string;
}

// ── Attachments ────────────────────────────────────────────────────────────────

const DRIVE_URL_RE = /(drive|docs)\.google\.com/i;

function attachmentIcon(a: TaskAttachment) {
  const ct = (a.contentType ?? "").toLowerCase();
  const url = a.url.toLowerCase();
  if (a.source === "GoogleDrive") return <HardDrive className="h-3.5 w-3.5 shrink-0" style={{ color: "#2A6FB0" }} />;
  if (ct.includes("pdf") || url.endsWith(".pdf")) return <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "#B0362A" }} />;
  if (ct.includes("word") || url.endsWith(".doc") || url.endsWith(".docx")) return <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "#2A6FB0" }} />;
  if (ct.includes("sheet") || ct.includes("excel") || url.endsWith(".xls") || url.endsWith(".xlsx")) return <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" style={{ color: "#0F6E56" }} />;
  return <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: "#6B7A8D" }} />;
}

function attachmentHref(a: TaskAttachment, conveningId: string | null | undefined) {
  return projectObjectUrl(a.url, conveningId);
}

function AttachmentsSection({ taskId }: { taskId: string }) {
  const { activeConveningId } = useConvening();
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = getListTaskAttachmentsQueryKey(taskId);
  const { data: attachments = [], isLoading } = useListTaskAttachments(taskId, { query: { queryKey: key } });
  const invalidate = () => void qc.invalidateQueries({ queryKey: key });
  const onAttachmentError = () =>
    toast({ title: "Could not update attachments", description: "Please try again.", variant: "destructive" });
  const createAttachment = useCreateTaskAttachment({ mutation: { onSuccess: invalidate, onError: onAttachmentError } });
  const deleteAttachment = useDeleteTaskAttachment({ mutation: { onSuccess: invalidate, onError: onAttachmentError } });

  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useUpload({
    conveningId: activeConveningId,
    onSuccess: (res) => {
      void createAttachment.mutateAsync({
        id: taskId,
        data: {
          source: "Upload",
          title: res.metadata.name,
          url: res.objectPath,
          contentType: res.metadata.contentType,
          fileSize: res.metadata.size,
        },
      });
    },
  });

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await upload.uploadFile(file);
    e.target.value = "";
  };

  const addLink = async () => {
    const url = linkUrl.trim();
    if (!url) return;
    await createAttachment.mutateAsync({
      id: taskId,
      data: {
        source: DRIVE_URL_RE.test(url) ? "GoogleDrive" : "Link",
        title: linkTitle.trim() || url,
        url,
      },
    });
    setLinkUrl("");
    setLinkTitle("");
    setAddingLink(false);
  };

  return (
    <div>
      <FL>Attachments</FL>
      <div className="space-y-1.5 mb-2">
        {attachments.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
            style={{ borderColor: "var(--brand-border, #E3E8EE)" }}
          >
            {attachmentIcon(a)}
            <a
              href={attachmentHref(a, activeConveningId)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 truncate text-sm hover:underline"
              style={{ color: "var(--brand-ink)" }}
            >
              {a.title}
            </a>
            <button
              type="button"
              onClick={() => void deleteAttachment.mutateAsync({ id: a.id })}
              className="text-[var(--brand-text-secondary,#6B7A8D)] hover:text-red-600 shrink-0"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {!isLoading && attachments.length === 0 && !addingLink && (
          <p className="text-xs" style={{ color: "var(--brand-text-secondary,#6B7A8D)" }}>
            No attachments yet.
          </p>
        )}
      </div>

      {addingLink ? (
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-1.5">
            <Input
              autoFocus
              placeholder="Paste a Google Drive or file link…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <Input
              placeholder="Label (optional)"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Button size="sm" disabled={!linkUrl.trim() || createAttachment.isPending} onClick={() => void addLink()}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setAddingLink(false); setLinkUrl(""); setLinkTitle(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={upload.isUploading}
            onClick={() => fileRef.current?.click()}
          >
            {upload.isUploading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            Upload file
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAddingLink(true)}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            Add link
          </Button>
        </div>
      )}
      {upload.error && (
        <p className="text-xs text-red-600 mt-1.5">{upload.error.message}</p>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => void onFileChange(e)}
      />
    </div>
  );
}

const NO_MILESTONE = "__none__";

function TaskEditModal({
  task,
  workstreams,
  teamMembers,
  milestones,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  task: Task | null;
  workstreams: { id: string; name: string }[];
  teamMembers: ConveningTeamMember[];
  milestones: { id: string; title: string; description?: string | null }[];
  onClose: () => void;
  onSave: (form: TaskEditForm) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
  deleting: boolean;
}) {
  const [form, setForm] = useState<TaskEditForm>({
    title:          task?.title ?? "",
    description:    task?.description ?? "",
    status:         task?.status ?? "NotStarted",
    priority:       task?.priority ?? "Medium",
    dueDate:        task?.dueDate ?? "",
    startDate:      task?.startDate ?? "",
    assigneeUserId: task?.assigneeUserId ?? "",
    progressPct:    task?.progressPct ?? 0,
    isMilestone:    task?.isMilestone ?? false,
    milestoneId:    task?.milestoneId ?? "",
    workstreamId:   task?.workstreamId ?? "",
  });

  useEffect(() => {
    setForm({
      title:          task?.title ?? "",
      description:    task?.description ?? "",
      status:         task?.status ?? "NotStarted",
      priority:       task?.priority ?? "Medium",
      dueDate:        task?.dueDate ?? "",
      startDate:      task?.startDate ?? "",
      assigneeUserId: task?.assigneeUserId ?? "",
      progressPct:    task?.progressPct ?? 0,
      isMilestone:    task?.isMilestone ?? false,
      milestoneId:    task?.milestoneId ?? "",
      workstreamId:   task?.workstreamId ?? "",
    });
  }, [task]);

  const set = <K extends keyof TaskEditForm>(k: K, v: TaskEditForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title="Edit task"
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={deleting}
            onClick={() => void onDelete()}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
            Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.title || saving} onClick={() => void onSave(form)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FL>Title</FL>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Task title…" />
        </div>
        <div>
          <FL>Description</FL>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional details…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FL>Status</FL>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["NotStarted", "InProgress", "Blocked", "Completed"].map((s) => (
                  <SelectItem key={s} value={s}>{label(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FL>Priority</FL>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_VALUES.map((p) => {
                  const s = PRIORITY_STYLE[p];
                  return (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase rounded px-1.5 py-0.5"
                          style={{ background: s.bg, color: s.fg }}>{p}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FL>Workstream</FL>
            <Select value={form.workstreamId} onValueChange={(v) => set("workstreamId", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {workstreams.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FL>Start date</FL>
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div>
            <FL>Due date</FL>
            <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>
          <div>
            <FL>Assignee</FL>
            <Select
              value={form.assigneeUserId || UNASSIGNED_VALUE}
              onValueChange={(v) => set("assigneeUserId", v === UNASSIGNED_VALUE ? "" : v)}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                {teamMembers.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>{m.userName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FL>Progress %</FL>
            <Input
              type="number"
              min={0} max={100}
              value={form.progressPct}
              onChange={(e) => set("progressPct", Number(e.target.value))}
            />
          </div>
          {milestones.length > 0 && (
            <div className="col-span-2">
              <FL>Linked milestone</FL>
              <Select
                value={form.milestoneId || NO_MILESTONE}
                onValueChange={(v) => set("milestoneId", v === NO_MILESTONE ? "" : v)}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MILESTONE}>— None —</SelectItem>
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col leading-snug py-0.5">
                        <span>{m.title}</span>
                        {m.description && (
                          <span className="text-[11px]" style={{ color: "var(--brand-text-secondary)" }}>{m.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isMilestone}
            onChange={(e) => set("isMilestone", e.target.checked)}
            className="rounded accent-[var(--brand-primary)] h-4 w-4"
          />
          <span className="text-sm text-[var(--brand-ink)]">Mark as milestone</span>
        </label>
        {task && <AttachmentsSection taskId={task.id} />}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { activeConveningId } = useConvening();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [viewMode,     setViewMode]     = useState<ViewMode>("list");
  const [newWsName,    setNewWsName]    = useState("");
  const [addingWs,     setAddingWs]     = useState(false);
  const [newTaskInput, setNewTaskInput] = useState<Record<string, string>>({});
  const [addingTask,   setAddingTask]   = useState<Record<string, boolean>>({});
  const [editingTask,  setEditingTask]  = useState<Task | null>(null);
  const [editSaving,   setEditSaving]   = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);
  const [editingWsId,     setEditingWsId]     = useState<string | null>(null);
  const [editingWsName,   setEditingWsName]   = useState("");
  const [confirmDeleteWsId, setConfirmDeleteWsId] = useState<string | null>(null);

  const wsParams   = { conveningId: activeConveningId ?? "" };
  const taskParams = { conveningId: activeConveningId ?? "" };

  const { data: workstreams, isLoading: wsLoading } = useListWorkstreams(wsParams, {
    query: { enabled: !!activeConveningId, queryKey: getListWorkstreamsQueryKey(wsParams) },
  });

  const { data: tasks = [] } = useListTasks(taskParams, {
    query: { enabled: !!activeConveningId, queryKey: getListTasksQueryKey(taskParams) },
  });

  const teamKey = getListConveningTeamQueryKey(activeConveningId ?? "");
  const { data: teamMembers = [] } = useListConveningTeam(activeConveningId ?? "", {
    query: { enabled: !!activeConveningId, queryKey: teamKey },
  });

  const msParams = { conveningId: activeConveningId ?? "" };
  const { data: milestones = [] } = useListMilestones(msParams, {
    query: { enabled: !!activeConveningId, queryKey: getListMilestonesQueryKey(msParams) },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListWorkstreamsQueryKey(wsParams) });
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(taskParams) });
  };

  const onWorkstreamError = () =>
    toast({ title: "Could not save workstream", description: "Please try again.", variant: "destructive" });

  const createWorkstream = useCreateWorkstream({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setNewWsName("");
        setAddingWs(false);
      },
      onError: onWorkstreamError,
    },
  });

  const updateWorkstream = useUpdateWorkstream({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setEditingWsId(null);
        setEditingWsName("");
      },
      onError: onWorkstreamError,
    },
  });

  const deleteWorkstream = useDeleteWorkstream({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setConfirmDeleteWsId(null);
      },
      onError: onWorkstreamError,
    },
  });

  const startEditingWs = (wsId: string, currentName: string) => {
    setEditingWsId(wsId);
    setEditingWsName(currentName);
  };

  const handleSaveWsName = async () => {
    if (!editingWsId || !editingWsName.trim()) return;
    await updateWorkstream.mutateAsync({ id: editingWsId, data: { name: editingWsName.trim() } });
  };

  const onTaskError = () =>
    toast({ title: "Could not save task", description: "Please try again.", variant: "destructive" });
  const createTask = useCreateTask({ mutation: { onSuccess: invalidateAll, onError: onTaskError } });
  const updateTask = useUpdateTask({ mutation: { onSuccess: invalidateAll, onError: onTaskError } });
  const deleteTask = useDeleteTask({ mutation: { onSuccess: invalidateAll, onError: onTaskError } });

  if (!activeConveningId) return null;

  const deletingWorkstreamTaskCount = tasks.filter(
    (task) => task.workstreamId === confirmDeleteWsId,
  ).length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreateWs = async () => {
    if (!newWsName.trim()) return;
    await createWorkstream.mutateAsync({
      data: { conveningId: activeConveningId, name: newWsName.trim() },
    });
  };

  const handleCreateTask = async (wsId: string) => {
    const title = newTaskInput[wsId]?.trim();
    if (!title) return;
    await createTask.mutateAsync({
      data: { conveningId: activeConveningId, workstreamId: wsId, title },
    });
    setNewTaskInput((p) => ({ ...p, [wsId]: "" }));
    setAddingTask((p) => ({ ...p, [wsId]: false }));
  };

  const handleStatusCycle = async (taskId: string, currentStatus: string) => {
    const next = STATUS_CYCLE[currentStatus] ?? "InProgress";
    await updateTask.mutateAsync({ id: taskId, data: { status: next as "NotStarted" } });
  };

  const handleEditSave = async (form: TaskEditForm) => {
    if (!editingTask) return;
    setEditSaving(true);
    try {
      await updateTask.mutateAsync({
        id: editingTask.id,
        data: {
          title:          form.title,
          description:    form.description || null,
          status:         form.status as "NotStarted",
          priority:       form.priority as "Low",
          workstreamId:   form.workstreamId || editingTask.workstreamId,
          dueDate:        form.dueDate || null,
          startDate:      form.startDate || null,
          assigneeUserId: form.assigneeUserId || null,
          progressPct:    form.progressPct,
          isMilestone:    form.isMilestone,
          milestoneId:    form.milestoneId || null,
        },
      });
      setEditingTask(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!editingTask) return;
    if (!confirm(`Delete task "${editingTask.title}"? This cannot be undone.`)) return;
    setEditDeleting(true);
    try {
      await deleteTask.mutateAsync({ id: editingTask.id });
      setEditingTask(null);
    } finally {
      setEditDeleting(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const tasksByWs     = (id: string) => tasks.filter((t) => t.workstreamId === id);
  const tasksByStatus = (s: string)  => tasks.filter((t) => t.status === s);
  const wsColor       = (i: number)  => CATEGORICAL[i % CATEGORICAL.length];
  const wsNameById    = (id: string) => workstreams?.find((w) => w.id === id)?.name ?? "";
  const wsIndexById   = (id: string) => workstreams?.findIndex((w) => w.id === id) ?? 0;

  const teamMemberByUserId = new Map(teamMembers.map((m) => [m.userId, m]));

  const VIEW_ICONS = [
    { mode: "list"  as ViewMode, Icon: LayoutList,       label: "List"  },
    { mode: "board" as ViewMode, Icon: Kanban,            label: "Board" },
    { mode: "gantt" as ViewMode, Icon: GanttChartSquare, label: "Gantt" },
  ];

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Tasks</h1>
          <p className="text-sm text-[var(--brand-text-secondary)] mt-0.5">
            Workstreams and operational tasks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex rounded overflow-hidden border"
            style={{ borderColor: "var(--brand-border)" }}
          >
            {VIEW_ICONS.map(({ mode, Icon, label: lbl }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={lbl}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
                style={
                  viewMode === mode
                    ? { background: "var(--brand-primary)", color: "#fff" }
                    : { background: "#fff", color: "var(--brand-text-secondary)" }
                }
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{lbl}</span>
              </button>
            ))}
          </div>

          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => exportXlsx(
              tasks.map((t) => ({
                "Workstream": wsNameById(t.workstreamId ?? ""),
                "Title":      t.title,
                "Status":     t.status,
                "Priority":   t.priority ?? "Medium",
                "Start Date": t.startDate ?? "",
                "Due Date":   t.dueDate ?? "",
                "Progress %": t.progressPct ?? 0,
                "Milestone":  t.isMilestone ? "Yes" : "No",
                "Assignee":   teamMemberByUserId.get(t.assigneeUserId ?? "")?.userName ?? "",
                "Description": t.description ?? "",
              })),
              "tasks"
            )}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export XLSX
          </Button>

          {viewMode === "list" && (
            <Button size="sm" variant="outline" onClick={() => setAddingWs(true)}>
              <Plus className="h-4 w-4 mr-1" /> Workstream
            </Button>
          )}
        </div>
      </div>

      {/* ── Add workstream inline input ─────────────────────────────────── */}
      {addingWs && viewMode === "list" && (
        <div className="rounded-lg border p-4 flex gap-2" style={{ borderColor: "var(--brand-border)", background: "#fff" }}>
          <div className="flex-1">
            <FL>Workstream name</FL>
            <Input
              autoFocus
              placeholder="e.g. Logistics, Communications…"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleCreateWs()}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => void handleCreateWs()} disabled={createWorkstream.isPending || !newWsName.trim()}>
              {createWorkstream.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
            <Button variant="ghost" onClick={() => setAddingWs(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Loading / empty ─────────────────────────────────────────────── */}
      {wsLoading ? (
        <div className="flex items-center justify-center h-40" style={{ color: "var(--brand-text-secondary)" }}>
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !workstreams || workstreams.length === 0 ? (
        <div className="rounded-lg border border-dashed py-20 text-center" style={{ borderColor: "var(--brand-border)" }}>
          <LayoutList className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--brand-ink)" }}>No workstreams yet</p>
          <p className="text-sm mt-1 mb-4" style={{ color: "var(--brand-text-secondary)" }}>
            Create a workstream to organise tasks.
          </p>
          <Button size="sm" onClick={() => { setAddingWs(true); setViewMode("list"); }}>
            Create workstream
          </Button>
        </div>

      ) : viewMode === "list" ? (
        /* ════════════════════════════════ LIST ════════════════════════════════ */
        <div className="space-y-4">
          {workstreams.map((ws, wsIdx) => {
            const wsTasks        = tasksByWs(ws.id);
            const completedCount = wsTasks.filter((t) => t.status === "Completed").length;
            const pct = wsTasks.length > 0 ? Math.round((completedCount / wsTasks.length) * 100) : 0;
            const color = wsColor(wsIdx);

            return (
              <div
                key={ws.id}
                className="rounded-lg border overflow-hidden group"
                style={{ borderColor: "var(--brand-border)", background: "#fff" }}
              >
                {/* Workstream header */}
                <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--brand-border)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      {editingWsId === ws.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            autoFocus
                            value={editingWsName}
                            onChange={(e) => setEditingWsName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleSaveWsName();
                              if (e.key === "Escape") { setEditingWsId(null); setEditingWsName(""); }
                            }}
                            className="h-7 text-sm font-semibold py-0"
                          />
                          <button
                            className="p-1 rounded transition-colors"
                            style={{ color: "var(--brand-primary)" }}
                            onClick={() => void handleSaveWsName()}
                            disabled={updateWorkstream.isPending}
                            title="Save"
                          >
                            {updateWorkstream.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            className="p-1 rounded transition-colors"
                            style={{ color: "var(--brand-text-secondary)" }}
                            onClick={() => { setEditingWsId(null); setEditingWsName(""); }}
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="group flex items-center gap-1.5 text-left"
                          onClick={() => startEditingWs(ws.id, ws.name)}
                          title="Click to rename workstream"
                        >
                          <span className="text-sm font-semibold" style={{ color: "var(--brand-ink)" }}>
                            {ws.name}
                          </span>
                          <Pencil
                            className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
                            style={{ color: "var(--brand-text-secondary)" }}
                          />
                        </button>
                      )}
                      <span className="text-xs shrink-0" style={{ color: "var(--brand-text-secondary)" }}>
                        {completedCount}/{wsTasks.length} done
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors"
                        style={{ color: "var(--brand-text-secondary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--brand-text-secondary)")}
                        onClick={() => setAddingTask((p) => ({ ...p, [ws.id]: true }))}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add task
                      </button>
                      <button
                        className="p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                        style={{ color: "var(--brand-text-secondary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#DC2626")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--brand-text-secondary)")}
                        onClick={() => setConfirmDeleteWsId(ws.id)}
                        title="Delete workstream"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {wsTasks.length > 0 && (
                    <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--brand-tint)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: pct === 100 ? "#4E8A66" : color }}
                      />
                    </div>
                  )}
                </div>

                {/* Task rows */}
                <div className="divide-y" style={{ borderColor: "var(--brand-border)" }}>
                  {wsTasks.length === 0 && !addingTask[ws.id] ? (
                    <p className="px-4 py-3 text-sm" style={{ color: "var(--brand-text-secondary)" }}>
                      No tasks yet.
                    </p>
                  ) : (
                    wsTasks.map((task) => {
                      const assignee = task.assigneeUserId ? teamMemberByUserId.get(task.assigneeUserId) : null;
                      const assigneeName = task.assigneeName ?? assignee?.userName ?? null;
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 px-4 py-2.5 group transition-colors"
                          style={{ borderColor: "var(--brand-border)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--brand-tint)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <StatusCircle
                            status={task.status}
                            onCycle={() => void handleStatusCycle(task.id, task.status)}
                          />
                          <span
                            className="flex-1 flex items-center gap-1.5 text-sm leading-snug cursor-pointer group/title hover:text-[var(--brand-primary)] transition-colors min-w-0"
                            style={{
                              color:          task.status === "Completed" ? "var(--brand-text-secondary)" : "var(--brand-ink)",
                              textDecoration: task.status === "Completed" ? "line-through" : undefined,
                            }}
                            onClick={() => setEditingTask(task)}
                          >
                            <span className="truncate">{task.title}</span>
                            <Pencil className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover/title:opacity-40 transition-opacity" />
                          </span>
                          {assigneeName && (
                            <AssigneeAvatar name={assigneeName} size="xs" />
                          )}
                          {task.dueDate && (
                            <span className="text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--brand-text-secondary)" }}>
                              Due {task.dueDate}
                            </span>
                          )}
                          {task.isMilestone && (
                            <span
                              className="text-[9px] font-bold uppercase rounded px-1 py-0.5 shrink-0"
                              style={{ background: "#FBF3E2", color: "#8A6516" }}
                            >
                              Milestone
                            </span>
                          )}
                          {(task as Task & { milestoneName?: string | null }).milestoneName && (
                            <span
                              className="text-[10px] font-medium rounded px-1.5 py-0.5 shrink-0 truncate max-w-[130px]"
                              style={{ background: "#F3EEFB", color: "#7B4FA6" }}
                            >
                              {(task as Task & { milestoneName?: string | null }).milestoneName}
                            </span>
                          )}
                          <PriorityBadge priority={task.priority ?? "Medium"} />
                          <StatusBadge status={task.status} />
                        </div>
                      );
                    })
                  )}

                  {addingTask[ws.id] && (
                    <div className="px-4 py-3 flex gap-2">
                      <Input
                        autoFocus
                        placeholder="Task title…"
                        value={newTaskInput[ws.id] ?? ""}
                        onChange={(e) => setNewTaskInput((p) => ({ ...p, [ws.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && void handleCreateTask(ws.id)}
                        className="flex-1 h-8 text-sm"
                      />
                      <Button size="sm" className="h-8" onClick={() => void handleCreateTask(ws.id)} disabled={createTask.isPending}>
                        {createTask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddingTask((p) => ({ ...p, [ws.id]: false }))}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      ) : viewMode === "board" ? (
        /* ════════════════════════════════ BOARD ═══════════════════════════════ */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {STATUS_COLUMNS.map((status) => {
            const colTasks = tasksByStatus(status);
            const ss = STATUS_STYLE[status];
            const borderAccent = STATUS_BORDER[status];
            return (
              <div
                key={status}
                className="rounded-lg border-t-4 overflow-hidden"
                style={{ borderTopColor: borderAccent, borderLeft: "1px solid var(--brand-border)", borderRight: "1px solid var(--brand-border)", borderBottom: "1px solid var(--brand-border)", background: "#fff" }}
              >
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--brand-border)" }}>
                  <span className="text-sm font-semibold" style={{ color: "var(--brand-ink)" }}>
                    {label(status)}
                  </span>
                  <span
                    className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: ss.bg, color: ss.fg }}
                  >
                    {colTasks.length}
                  </span>
                </div>

                <div className="p-3 space-y-2 min-h-28">
                  {colTasks.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: "var(--brand-border)" }}>—</p>
                  ) : (
                    colTasks.map((task) => {
                      const idx = wsIndexById(task.workstreamId);
                      const color = wsColor(idx);
                      const assigneeName = task.assigneeName
                        ?? (task.assigneeUserId ? teamMemberByUserId.get(task.assigneeUserId)?.userName : null)
                        ?? null;
                      return (
                        <div
                          key={task.id}
                          className="rounded-lg border p-3 cursor-pointer transition-all duration-150 hover:shadow-md hover:border-[var(--brand-primary)]/30 hover:-translate-y-px"
                          style={{ borderColor: "var(--brand-border)", background: "#fff" }}
                          onClick={() => setEditingTask(task)}
                        >
                          <p className="text-sm font-medium leading-snug" style={{ color: "var(--brand-ink)" }}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-xs truncate flex-1" style={{ color: "var(--brand-text-secondary)" }}>
                              {wsNameById(task.workstreamId)}
                            </span>
                            {assigneeName && <AssigneeAvatar name={assigneeName} size="xs" />}
                          </div>
                          {task.dueDate && (
                            <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
                              Due {task.dueDate}
                            </p>
                          )}
                          {task.isMilestone && (
                            <span
                              className="inline-block mt-1.5 text-[9px] font-bold uppercase rounded px-1 py-0.5"
                              style={{ background: "#FBF3E2", color: "#8A6516" }}
                            >
                              Milestone
                            </span>
                          )}
                          {(task as Task & { milestoneName?: string | null }).milestoneName && (
                            <span
                              className="inline-block mt-1 text-[10px] font-medium rounded px-1.5 py-0.5 truncate max-w-full"
                              style={{ background: "#F3EEFB", color: "#7B4FA6" }}
                            >
                              {(task as Task & { milestoneName?: string | null }).milestoneName}
                            </span>
                          )}
                          {(task.progressPct ?? 0) > 0 && (
                            <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "var(--brand-tint)" }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${task.progressPct ?? 0}%`, background: color }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

      ) : (
        /* ════════════════════════════════ GANTT ═══════════════════════════════ */
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--brand-border)", background: "#fff" }}>
          <div className="px-4 pt-4 pb-2">
            <GanttChart
              workstreams={workstreams ?? []}
              tasks={tasks}
              onStatusCycle={(id, status) => void handleStatusCycle(id, status)}
              teamMembers={teamMembers}
            />
          </div>
        </div>
      )}

      {/* ── Delete workstream confirmation ──────────────────────────────── */}
      <AlertDialog open={!!confirmDeleteWsId} onOpenChange={(open) => { if (!open) setConfirmDeleteWsId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Delete workstream?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-gray-900">
                {workstreams?.find((workstream) => workstream.id === confirmDeleteWsId)?.name}
              </span>{" "}
              {deletingWorkstreamTaskCount > 0
                ? `cannot be deleted while it contains ${deletingWorkstreamTaskCount} task${deletingWorkstreamTaskCount !== 1 ? "s" : ""}. Move or delete those tasks first.`
                : "will be permanently deleted. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { if (confirmDeleteWsId) void deleteWorkstream.mutateAsync({ id: confirmDeleteWsId }); }}
              disabled={deleteWorkstream.isPending || deletingWorkstreamTaskCount > 0}
            >
              {deleteWorkstream.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Delete workstream
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Task edit modal ─────────────────────────────────────────────── */}
      <TaskEditModal
        task={editingTask}
        workstreams={workstreams ?? []}
        teamMembers={teamMembers}
        milestones={milestones}
        onClose={() => setEditingTask(null)}
        onSave={handleEditSave}
        onDelete={handleDeleteTask}
        deleting={editDeleting}
        saving={editSaving}
      />
    </div>
  );
}
