import { useState, useRef } from "react";
import type { Task, Workstream, ConveningTeamMember } from "@workspace/api-client-react";
import { BarChart2 } from "lucide-react";

// ── Theme ─────────────────────────────────────────────────────────────────────
const CATEGORICAL = [
  "#0A2F5C", "#2A6FB0", "#4FA0C0", "#6C7A99",
  "#C99A3B", "#8E6FAE", "#4E8A66", "#BB6B4F",
];

const STATUS_BAR: Record<string, string> = {
  NotStarted: "#C4CAD4",
  InProgress:  "#2A6FB0",
  Blocked:     "#B5462F",
  Completed:   "#4E8A66",
};

const STATUS_CIRCLE: Record<string, { border: string; bg: string; check?: boolean }> = {
  NotStarted: { border: "#C4CAD4",  bg: "transparent" },
  InProgress:  { border: "#2A6FB0", bg: "#EEF3F9" },
  Blocked:     { border: "#B5462F", bg: "#FCEAE8" },
  Completed:   { border: "#2E7D5B", bg: "#E8F5ED", check: true },
};

// ── Constants ─────────────────────────────────────────────────────────────────
type Zoom    = "quarter" | "month" | "week";
type GroupBy = "workstream" | "assignee";

const PX_PER_DAY: Record<Zoom, number> = { quarter: 3.5, month: 12, week: 52 };
const BUFFER:     Record<Zoom, [number, number]> = {
  quarter: [30, 45],
  month:   [14, 21],
  week:    [3,  7],
};

const LABEL_W    = 220;
const HDR_H      = 34;
const WS_ROW_H   = 30;
const TASK_ROW_H = 36;

// ── Date helpers ──────────────────────────────────────────────────────────────
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function parseLocal(s: string) { return new Date(s + "T00:00:00"); }

// ── Column generators ─────────────────────────────────────────────────────────
interface Col { key: string; label: string; dayOffset: number; days: number }

function monthColumns(start: Date, end: Date): Col[] {
  const cols: Col[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const origin = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const daysInMonth = Math.round((next.getTime() - cur.getTime()) / 86400000);
    cols.push({
      key:       cur.toISOString(),
      label:     cur.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      dayOffset: daysBetween(origin, cur),
      days:      daysInMonth,
    });
    cur = next;
  }
  return cols;
}

function weekColumns(start: Date, end: Date): Col[] {
  const cols: Col[] = [];
  const first = new Date(start);
  const dow = first.getDay();
  first.setDate(first.getDate() - (dow === 0 ? 6 : dow - 1));
  let cur = new Date(first);
  while (cur <= end) {
    cols.push({
      key:       cur.toISOString(),
      label:     cur.toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
      dayOffset: daysBetween(first, cur),
      days:      7,
    });
    cur = addDays(cur, 7);
  }
  return cols;
}

function dayColumns(start: Date, end: Date): Col[] {
  const cols: Col[] = [];
  let cur = new Date(start);
  let i = 0;
  while (cur <= end) {
    cols.push({
      key:       cur.toISOString(),
      label:     cur.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
      dayOffset: i,
      days:      1,
    });
    cur = addDays(cur, 1);
    i++;
  }
  return cols;
}

function getColumns(zoom: Zoom, start: Date, end: Date): { cols: Col[]; origin: Date } {
  if (zoom === "quarter") {
    const origin = new Date(start.getFullYear(), start.getMonth(), 1);
    return { cols: monthColumns(start, end), origin };
  }
  if (zoom === "month") {
    const dow = start.getDay();
    const origin = new Date(start);
    origin.setDate(origin.getDate() - (dow === 0 ? 6 : dow - 1));
    return { cols: weekColumns(start, end), origin };
  }
  return { cols: dayColumns(start, end), origin: new Date(start) };
}

function computeBounds(tasks: Task[], zoom: Zoom): { start: Date; end: Date } {
  const today = new Date();
  const dates: Date[] = [today];
  for (const t of tasks) {
    if (t.startDate) dates.push(parseLocal(t.startDate));
    if (t.dueDate)   dates.push(parseLocal(t.dueDate));
  }
  const minMs = Math.min(...dates.map((d) => d.getTime()));
  const maxMs = Math.max(...dates.map((d) => d.getTime()));
  const rawStart = new Date(minMs);
  const rawEnd   = new Date(maxMs);
  const [bufBefore, bufAfter] = BUFFER[zoom];
  return {
    start: addDays(rawStart, -bufBefore),
    end:   addDays(rawEnd,   bufAfter),
  };
}

function barBounds(task: Task): { s: Date; e: Date } | null {
  const s = task.startDate ? parseLocal(task.startDate) : null;
  const e = task.dueDate   ? parseLocal(task.dueDate)   : null;
  if (!s && !e) return null;
  if (s && e)   return { s, e };
  if (e)        return { s: addDays(e, -1), e };
  return         { s: s!, e: addDays(s!, 1) };
}

function milestoneDate(task: Task): Date | null {
  if (task.dueDate)   return parseLocal(task.dueDate);
  if (task.startDate) return parseLocal(task.startDate);
  return null;
}

const STATUS_CYCLE: Record<string, string> = {
  NotStarted: "InProgress",
  InProgress:  "Completed",
  Completed:   "NotStarted",
  Blocked:     "InProgress",
};

function StatusDot({ status, taskId, onCycle }: { status: string; taskId: string; onCycle: (id: string, status: string) => void }) {
  const cs = STATUS_CIRCLE[status] ?? STATUS_CIRCLE.NotStarted;
  return (
    <button
      className="shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
      style={{ borderColor: cs.border, background: cs.bg }}
      onClick={() => onCycle(taskId, status)}
      title={`Advance → ${STATUS_CYCLE[status]}`}
    >
      {cs.check && (
        <svg className="w-2 h-2" fill="none" viewBox="0 0 10 10">
          <path d="M1.5 5l2.5 2.5 5-5" stroke="#2E7D5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ── Assignee initials ─────────────────────────────────────────────────────────
function AssigneeChip({ name }: { name: string }) {
  const ini = name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  return (
    <div
      className="w-4 h-4 rounded-full bg-white/90 flex items-center justify-center text-[7px] font-bold border shrink-0"
      style={{ color: "#2A6FB0", borderColor: "rgba(42,111,176,0.3)" }}
      title={name}
    >
      {ini}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export interface GanttChartProps {
  workstreams: Workstream[];
  tasks: Task[];
  onStatusCycle: (taskId: string, currentStatus: string) => void;
  teamMembers?: ConveningTeamMember[];
}

export function GanttChart({ workstreams, tasks, onStatusCycle, teamMembers = [] }: GanttChartProps) {
  const [zoom, setZoom]       = useState<Zoom>("month");
  const [groupBy, setGroupBy] = useState<GroupBy>("workstream");
  const scrollRef             = useRef<HTMLDivElement>(null);

  const tasksWithDates = tasks.filter((t) => t.startDate || t.dueDate);

  if (tasksWithDates.length === 0) {
    return (
      <div className="py-16 text-center">
        <BarChart2 className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--brand-ink)" }}>No tasks with dates</p>
        <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
          Set start or due dates on tasks to populate the Gantt.
        </p>
      </div>
    );
  }

  const today      = new Date();
  const { start: tlStart, end: tlEnd } = computeBounds(tasksWithDates, zoom);
  const pxPerDay   = PX_PER_DAY[zoom];
  const { cols, origin } = getColumns(zoom, tlStart, tlEnd);
  const totalDays  = daysBetween(origin, tlEnd) + 1;
  const totalW     = Math.ceil(totalDays * pxPerDay);
  const todayX     = Math.max(0, daysBetween(origin, today) * pxPerDay);
  const xOf        = (d: Date) => Math.max(0, daysBetween(origin, d) * pxPerDay);

  // team members index
  const memberByUserId = new Map(teamMembers.map((m) => [m.userId, m]));

  // ── Shared: task bar renderer ──────────────────────────────────────────
  const renderTaskRow = (task: Task, laneColor: string) => {
    const isMilestone = task.isMilestone;
    const bounds      = barBounds(task);
    const mDate       = isMilestone ? milestoneDate(task) : null;
    const isCompleted = task.status === "Completed";
    const isBlocked   = task.status === "Blocked";
    const isLate      = task.dueDate
      ? parseLocal(task.dueDate) < today && !isCompleted
      : false;

    let barColor = laneColor;
    if (isCompleted) barColor = STATUS_BAR.Completed;
    if (isBlocked)   barColor = STATUS_BAR.Blocked;
    if (isLate && !isCompleted) barColor = STATUS_BAR.Blocked;

    const barLeft  = bounds ? xOf(bounds.s) : 0;
    const barRight = bounds ? xOf(bounds.e) : 0;
    const barWidth = Math.max(4, barRight - barLeft);
    const mX       = mDate ? xOf(mDate) : 0;

    const assigneeName = task.assigneeName
      ?? (task.assigneeUserId ? memberByUserId.get(task.assigneeUserId)?.userName : null)
      ?? null;

    return (
      <div
        key={task.id}
        className="flex border-b group"
        style={{ borderColor: "var(--brand-border)", height: TASK_ROW_H }}
      >
        {/* Label cell */}
        <div
          className="shrink-0 sticky left-0 z-10 flex items-center gap-2 px-3 border-r"
          style={{
            width: LABEL_W, minWidth: LABEL_W,
            borderColor: "var(--brand-border)",
            background: "#fff",
          }}
        >
          <StatusDot status={task.status} taskId={task.id} onCycle={onStatusCycle} />
          <span
            className="text-xs truncate leading-snug flex-1"
            style={{
              color: isCompleted ? "var(--brand-text-secondary)" : "var(--brand-ink)",
              textDecoration: isCompleted ? "line-through" : undefined,
            }}
          >
            {task.title}
          </span>
          {assigneeName && <AssigneeChip name={assigneeName} />}
          {isMilestone && (
            <span className="shrink-0 text-[9px] font-bold uppercase text-[#C99A3B]">M</span>
          )}
        </div>

        {/* Timeline cell */}
        <div className="relative flex-1" style={{ height: TASK_ROW_H }}>
          {zoom === "week" && cols
            .filter((c) => { const d = addDays(origin, c.dayOffset); const dow = d.getDay(); return dow === 0 || dow === 6; })
            .map((c) => (
              <div
                key={c.key}
                className="absolute inset-y-0 pointer-events-none"
                style={{ left: c.dayOffset * pxPerDay, width: pxPerDay, background: "var(--brand-page-bg)" }}
              />
            ))}

          <div className="absolute inset-y-0 w-px pointer-events-none" style={{ left: todayX, background: "var(--brand-primary)", opacity: 0.3, zIndex: 2 }} />

          {isMilestone && mDate && (
            <div
              className="absolute"
              style={{
                left: mX - 6, top: "50%",
                transform: "translateY(-50%) rotate(45deg)",
                width: 12, height: 12,
                background: isCompleted ? STATUS_BAR.Completed : "#C99A3B",
                opacity: isCompleted ? 0.5 : 1,
                zIndex: 3, borderRadius: 2,
              }}
            />
          )}

          {!isMilestone && bounds && (
            <div
              className="absolute rounded-sm"
              style={{
                left: barLeft, width: barWidth,
                top: 10, bottom: 10,
                background: barColor, opacity: isCompleted ? 0.45 : 0.85, zIndex: 3,
              }}
            />
          )}

          {!isMilestone && bounds && (task.progressPct ?? 0) > 0 && !isCompleted && (
            <div
              className="absolute rounded-l-sm"
              style={{
                left: barLeft,
                width: barWidth * Math.min(100, task.progressPct ?? 0) / 100,
                top: 10, bottom: 10,
                background: barColor, opacity: 1, zIndex: 4,
              }}
            />
          )}

          {task.dueDate && (
            <span
              className="absolute text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{
                left: Math.max(barLeft + 2, xOf(parseLocal(task.dueDate)) + 2),
                top: "50%", transform: "translateY(-50%)",
                color: "var(--brand-text-secondary)", zIndex: 5,
              }}
            >
              {task.dueDate}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ── Workstream view groups ─────────────────────────────────────────────
  const workstreamGroups = workstreams
    .map((ws, wsIdx) => ({ ws, wsIdx, wsTasks: tasks.filter((t) => t.workstreamId === ws.id) }))
    .filter((g) => g.wsTasks.length > 0);

  // ── Assignee view groups ───────────────────────────────────────────────
  const assigneeGroups = (() => {
    const groups: { label: string; initials: string; userId: string | null; color: string; tasks: Task[] }[] = [];
    const seen = new Map<string | null, Task[]>();

    // group tasks by assigneeUserId (null = Unassigned)
    for (const task of tasks) {
      const uid = task.assigneeUserId ?? null;
      if (!seen.has(uid)) seen.set(uid, []);
      seen.get(uid)!.push(task);
    }

    let colorIdx = 0;
    // named assignees first
    for (const [uid, ts] of seen.entries()) {
      if (!uid) continue;
      const member = memberByUserId.get(uid);
      const name = member?.userName ?? uid;
      const ini  = name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
      groups.push({ label: name, initials: ini, userId: uid, color: CATEGORICAL[colorIdx++ % CATEGORICAL.length], tasks: ts });
    }
    // unassigned last
    const unassigned = seen.get(null);
    if (unassigned && unassigned.length > 0) {
      groups.push({ label: "Unassigned", initials: "—", userId: null, color: "#C4CAD4", tasks: unassigned });
    }
    return groups;
  })();

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-3 px-1 gap-3 flex-wrap">
        {/* Group by toggle */}
        <div className="flex rounded overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
          {(["workstream", "assignee"] as GroupBy[]).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className="px-3 py-1 text-xs font-medium transition-colors capitalize"
              style={
                groupBy === g
                  ? { background: "var(--brand-primary)", color: "#fff" }
                  : { background: "#fff", color: "var(--brand-text-secondary)" }
              }
            >
              {g === "workstream" ? "Workstream" : "Assignee"}
            </button>
          ))}
        </div>

        {/* Zoom switcher */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--brand-text-secondary)" }}>
            Zoom
          </span>
          <div className="flex rounded overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
            {(["quarter", "month", "week"] as Zoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className="px-3 py-1 text-xs font-medium transition-colors capitalize"
                style={
                  zoom === z
                    ? { background: "var(--brand-primary)", color: "#fff" }
                    : { background: "#fff", color: "var(--brand-text-secondary)" }
                }
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        ref={scrollRef}
        className="rounded-lg border overflow-auto"
        style={{ borderColor: "var(--brand-border)", maxHeight: "min(600px, 65vh)" }}
      >
        <div style={{ minWidth: LABEL_W + totalW }}>

          {/* ── Sticky header ── */}
          <div
            className="flex border-b sticky top-0 z-20"
            style={{ borderColor: "var(--brand-border)", background: "var(--brand-page-bg)", height: HDR_H }}
          >
            <div
              className="shrink-0 sticky left-0 z-30 flex items-center px-4 border-r text-[10px] font-semibold uppercase tracking-[0.07em]"
              style={{
                width: LABEL_W, minWidth: LABEL_W,
                borderColor: "var(--brand-border)",
                background: "var(--brand-page-bg)",
                color: "var(--brand-text-secondary)",
              }}
            >
              {groupBy === "workstream" ? "Task" : "Assignee / Task"}
            </div>
            <div className="relative flex-1 overflow-hidden">
              <div className="absolute inset-0 flex">
                {cols.map((col) => (
                  <div
                    key={col.key}
                    className="shrink-0 flex items-center justify-center border-r text-[10px] font-medium"
                    style={{
                      width: col.days * pxPerDay, minWidth: col.days * pxPerDay,
                      borderColor: "var(--brand-border)",
                      color: "var(--brand-text-secondary)",
                    }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          {groupBy === "workstream" ? (
            /* ── Workstream grouping ── */
            workstreamGroups.map(({ ws, wsIdx, wsTasks }) => {
              const wsColor = CATEGORICAL[wsIdx % CATEGORICAL.length];
              return (
                <div key={ws.id}>
                  <div
                    className="flex sticky top-[34px] z-10 border-b"
                    style={{ borderColor: "var(--brand-border)", background: wsColor + "14", height: WS_ROW_H }}
                  >
                    <div
                      className="shrink-0 sticky left-0 z-20 flex items-center gap-2 px-3 border-r"
                      style={{ width: LABEL_W, minWidth: LABEL_W, borderColor: "var(--brand-border)", background: wsColor + "14" }}
                    >
                      <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: wsColor }} />
                      <span className="text-[11px] font-semibold truncate" style={{ color: "var(--brand-navy, #0A2F5C)" }}>
                        {ws.name}
                      </span>
                    </div>
                    <div className="relative flex-1" style={{ height: WS_ROW_H }}>
                      <div className="absolute inset-y-0 w-px z-10 pointer-events-none" style={{ left: todayX, background: "var(--brand-primary)", opacity: 0.25 }} />
                    </div>
                  </div>
                  {wsTasks.map((task) => renderTaskRow(task, wsColor))}
                </div>
              );
            })
          ) : (
            /* ── Assignee grouping ── */
            assigneeGroups.map((group) => (
              <div key={group.userId ?? "unassigned"}>
                {/* Lane header */}
                <div
                  className="flex sticky top-[34px] z-10 border-b"
                  style={{ borderColor: "var(--brand-border)", background: group.color + "14", height: WS_ROW_H }}
                >
                  <div
                    className="shrink-0 sticky left-0 z-20 flex items-center gap-2 px-3 border-r"
                    style={{ width: LABEL_W, minWidth: LABEL_W, borderColor: "var(--brand-border)", background: group.color + "14" }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 text-white"
                      style={{ background: group.color }}
                    >
                      {group.initials}
                    </div>
                    <span className="text-[11px] font-semibold truncate" style={{ color: "var(--brand-navy, #0A2F5C)" }}>
                      {group.label}
                    </span>
                    <span className="text-[10px] ml-auto shrink-0" style={{ color: "var(--brand-text-secondary)" }}>
                      {group.tasks.length}
                    </span>
                  </div>
                  <div className="relative flex-1" style={{ height: WS_ROW_H }}>
                    <div className="absolute inset-y-0 w-px z-10 pointer-events-none" style={{ left: todayX, background: "var(--brand-primary)", opacity: 0.25 }} />
                  </div>
                </div>
                {/* Task rows for this assignee */}
                {group.tasks.filter((t) => t.startDate || t.dueDate).map((task) =>
                  renderTaskRow(task, group.color)
                )}
              </div>
            ))
          )}

          {/* Today line label */}
          <div className="sticky bottom-0 h-0 pointer-events-none" style={{ zIndex: 15 }}>
            <div
              className="absolute bottom-0 text-[9px] font-semibold px-1 py-0.5 rounded"
              style={{ left: LABEL_W + todayX - 12, background: "var(--brand-primary)", color: "#fff" }}
            >
              Today
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
