import { useState } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import {
  useListConveningTeam,
  useAddConveningTeamMember,
  useRemoveConveningTeamMember,
  useListUsers,
  getListConveningTeamQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Loader2, Users, Trash2, Star } from "lucide-react";
import type { ConveningTeamMember } from "@workspace/api-client-react";

const PROJECT_ROLES = [
  "Admin", "Curator", "Finance", "PartnerLead",
  "SpeakerLead", "Ops", "PressManager", "Advisor",
];

function FL({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1">
      {children}
    </label>
  );
}

function Initials({ name }: { name: string }) {
  const ini = name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-[var(--brand-tint)] flex items-center justify-center text-[var(--brand-primary)] text-[11px] font-bold shrink-0">
      {ini}
    </div>
  );
}

function WorkloadBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--brand-tint)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: pct === 100 ? "#4E8A66" : "var(--brand-primary)" }}
        />
      </div>
      <span className="text-[11px] text-[var(--brand-text-secondary)] shrink-0 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function Team() {
  const { activeConveningId } = useConvening();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ userId: "", projectRole: "", isLead: false });

  const teamKey = getListConveningTeamQueryKey(activeConveningId ?? "");

  const { data: teamMembers = [], isLoading } = useListConveningTeam(
    activeConveningId ?? "",
    { query: { enabled: !!activeConveningId, queryKey: teamKey } },
  );

  const { data: allUsers = [] } = useListUsers(
    { query: { enabled: showAdd, queryKey: getListUsersQueryKey() } },
  );

  const memberUserIds = new Set(teamMembers.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: teamKey });

  const addMember = useAddConveningTeamMember({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowAdd(false);
        setAddForm({ userId: "", projectRole: "", isLead: false });
      },
      onError: () => toast({ title: "Could not add team member", description: "Please try again.", variant: "destructive" }),
    },
  });

  const removeMember = useRemoveConveningTeamMember({
    mutation: {
      onSuccess: () => { invalidate(); setRemoving(null); },
      onError: () => toast({ title: "Could not remove team member", description: "Please try again.", variant: "destructive" }),
    },
  });

  if (!activeConveningId) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.userId || !addForm.projectRole) return;
    await addMember.mutateAsync({
      id: activeConveningId,
      data: { userId: addForm.userId, projectRole: addForm.projectRole, isLead: addForm.isLead },
    });
  };

  const handleRemove = async (member: ConveningTeamMember) => {
    setRemoving(member.userId);
    await removeMember.mutateAsync({ id: activeConveningId, userId: member.userId });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--brand-ink)]">Project Team</h1>
          <p className="text-sm text-[var(--brand-text-secondary)] mt-0.5">
            Internal team members assigned to this convening.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add member
        </Button>
      </div>

      {/* Roster */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-text-secondary)]" />
        </div>
      ) : teamMembers.length === 0 ? (
        <div className="rounded-lg border border-dashed py-20 text-center" style={{ borderColor: "var(--brand-border)" }}>
          <Users className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--brand-border)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--brand-ink)" }}>No team members yet</p>
          <p className="text-sm mt-1 mb-4" style={{ color: "var(--brand-text-secondary)" }}>
            Add internal team members to track workload and assign tasks.
          </p>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add first member
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--brand-border)", background: "#fff" }}>
          {/* Table header */}
          <div
            className="grid border-b px-4 py-2.5"
            style={{
              gridTemplateColumns: "1fr 120px 80px 60px 60px 60px 100px 44px",
              borderColor: "var(--brand-border)",
              background: "var(--brand-page-bg)",
            }}
          >
            {["Member", "Role", "Lead", "Open", "Overdue", "Done", "Progress", ""].map((h, i) => (
              <span
                key={i}
                className="text-[10px] font-semibold uppercase tracking-[0.07em]"
                style={{ color: "var(--brand-text-secondary)", textAlign: i >= 3 ? "center" : "left" }}
              >
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y" style={{ borderColor: "var(--brand-border)" }}>
            {teamMembers.map((m) => (
              <div
                key={m.userId}
                className="grid items-center px-4 py-3 hover:bg-[var(--brand-tint)] transition-colors group"
                style={{ gridTemplateColumns: "1fr 120px 80px 60px 60px 60px 100px 44px" }}
              >
                {/* Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Initials name={m.userName} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--brand-ink)] truncate">{m.userName}</p>
                    {m.userEmail && (
                      <p className="text-[11px] text-[var(--brand-text-secondary)] truncate">{m.userEmail}</p>
                    )}
                  </div>
                </div>

                {/* Role */}
                <span className="text-[12px] text-[var(--brand-ink)] truncate">{m.projectRole}</span>

                {/* Lead */}
                <div className="flex justify-center">
                  {m.isLead && <Star className="h-3.5 w-3.5 text-[#C99A3B] fill-[#C99A3B]" />}
                </div>

                {/* Open tasks */}
                <div className="text-center">
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: m.openTasks > 0 ? "var(--brand-ink)" : "var(--brand-text-secondary)" }}
                  >
                    {m.openTasks}
                  </span>
                </div>

                {/* Overdue tasks */}
                <div className="text-center">
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: m.overdueTasks > 0 ? "#B5462F" : "var(--brand-text-secondary)" }}
                  >
                    {m.overdueTasks}
                  </span>
                </div>

                {/* Completed tasks */}
                <div className="text-center">
                  <span className="text-[12px] text-[var(--brand-text-secondary)]">{m.completedTasks}/{m.totalTasks}</span>
                </div>

                {/* Progress bar */}
                <WorkloadBar completed={m.completedTasks} total={m.totalTasks} />

                {/* Remove */}
                <div className="flex justify-end">
                  <button
                    className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-600 text-[var(--brand-text-secondary)]"
                    title="Remove from team"
                    onClick={() => void handleRemove(m)}
                    disabled={removing === m.userId}
                  >
                    {removing === m.userId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add member modal */}
      <Modal
        open={showAdd}
        onClose={() => { setShowAdd(false); setAddForm({ userId: "", projectRole: "", isLead: false }); }}
        title="Add team member"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={(e) => { void handleAdd(e as unknown as React.FormEvent); }}
              disabled={!addForm.userId || !addForm.projectRole || addMember.isPending}
            >
              {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Add to team
            </Button>
          </>
        }
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <FL>Team member</FL>
            <Select value={addForm.userId} onValueChange={(v) => setAddForm((f) => ({ ...f, userId: v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a user…" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] text-[var(--brand-text-secondary)]">
                    All internal users are already on the team.
                  </div>
                ) : (
                  availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{u.email ? ` (${u.email})` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FL>Project role</FL>
            <Select value={addForm.projectRole} onValueChange={(v) => setAddForm((f) => ({ ...f, projectRole: v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.isLead}
              onChange={(e) => setAddForm((f) => ({ ...f, isLead: e.target.checked }))}
              className="rounded accent-[var(--brand-primary)] h-4 w-4"
            />
            <span className="text-sm text-[var(--brand-ink)]">Workstream lead</span>
          </label>
        </form>
      </Modal>
    </div>
  );
}
