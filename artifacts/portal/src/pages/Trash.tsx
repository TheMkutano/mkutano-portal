import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useConvening } from "@/contexts/ConveningContext";

interface TrashGroup {
  entityType: string;
  items: Record<string, unknown>[];
}

// Maps a trash entityType to the list-query URL prefixes that should be
// refreshed after a restore/permanent-delete so the affected entity lists
// reflect the change (not just the trash view).
const ENTITY_QUERY_PREFIXES: Record<string, string[]> = {
  Delegate:          ["/api/delegates"],
  Engagement:        ["/api/engagements", "/api/partners"],
  SpeakerEngagement: ["/api/speaker-engagements", "/api/speakers"],
  DealProject:       ["/api/deal-projects"],
  DealCommitment:    ["/api/deal-commitments"],
  AgendaSession:     ["/api/sessions"],
  Exhibitor:         ["/api/exhibitors"],
  Booth:             ["/api/booths"],
};

async function fetchTrash(conveningId: string): Promise<TrashGroup[]> {
  const res = await fetch(`/api/trash?conveningId=${encodeURIComponent(conveningId)}`, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json()).error ?? `${res.status}`);
  return res.json();
}

async function restoreItem(entityType: string, id: string, conveningId: string): Promise<void> {
  const res = await fetch(`/api/trash/${entityType}/${id}/restore?conveningId=${encodeURIComponent(conveningId)}`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `${res.status}`);
}

async function hardDeleteItem(entityType: string, id: string, conveningId: string): Promise<void> {
  const res = await fetch(`/api/trash/${entityType}/${id}?conveningId=${encodeURIComponent(conveningId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `${res.status}`);
}

function getDisplayName(item: Record<string, unknown>): string {
  return (
    (item.institutionName as string) ??
    (item.name as string) ??
    (item.company as string) ??
    (item.title as string) ??
    (item.code as string) ??
    String(item.id as string).slice(0, 12)
  );
}

export default function Trash() {
  const { activeConveningId } = useConvening();
  const { data: profile } = useGetMe();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState<{ entityType: string; id: string } | null>(null);

  const invalidateEntityLists = (entityType: string) => {
    const prefixes = ENTITY_QUERY_PREFIXES[entityType] ?? [];
    if (prefixes.length > 0) {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const first = query.queryKey[0];
          return typeof first === "string" && prefixes.some((p) => first.startsWith(p));
        },
      });
    }
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["trash", activeConveningId],
    queryFn: () => fetchTrash(activeConveningId!),
    enabled: profile?.role === "Admin" && !!activeConveningId,
  });

  const restore = useMutation({
    mutationFn: ({ entityType, id }: { entityType: string; id: string }) =>
      restoreItem(entityType, id, activeConveningId!),
    onSuccess: (_data, { entityType }) => {
      queryClient.invalidateQueries({ queryKey: ["trash", activeConveningId] });
      invalidateEntityLists(entityType);
    },
    onError: (error) =>
      toast({
        title: "Restore failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const hardDelete = useMutation({
    mutationFn: ({ entityType, id }: { entityType: string; id: string }) =>
      hardDeleteItem(entityType, id, activeConveningId!),
    onSuccess: (_data, { entityType }) => {
      setConfirming(null);
      queryClient.invalidateQueries({ queryKey: ["trash", activeConveningId] });
      invalidateEntityLists(entityType);
    },
    onError: (error) =>
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  if (profile?.role !== "Admin") {
    return (
      <div className="p-8 text-center text-[var(--brand-text-secondary)]">
        Trash is visible to Admins only.
      </div>
    );
  }

  const totalItems = data?.reduce((sum, g) => sum + g.items.length, 0) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-[var(--brand-ink)]">Trash</h1>
        <p className="text-[13px] text-[var(--brand-text-secondary)] mt-0.5">
          Soft-deleted records. Restore to bring back, or permanently delete (irreversible).
        </p>
      </div>

      {isLoading && (
        <p className="text-[13px] text-[var(--brand-text-secondary)]">Loading…</p>
      )}

      {error && (
        <p className="text-[13px] text-red-600">Failed to load trash.</p>
      )}

      {data && totalItems === 0 && (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-[var(--brand-text-secondary)] text-[13px]">Trash is empty.</p>
        </div>
      )}

      {data?.map((group) => (
        <div key={group.entityType} className="border rounded-lg overflow-hidden">
          <div className="bg-[var(--brand-tint)] px-4 py-2.5 border-b flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
              {group.entityType}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {group.items.length}
            </Badge>
          </div>
          <div className="divide-y divide-[var(--brand-border)]">
            {group.items.map((item) => {
              const id = String(item.id);
              const deletedAt = item.deletedAt as string | null;
              return (
                <div key={id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--brand-ink)] truncate">
                      {getDisplayName(item)}
                    </p>
                    <p className="text-[11px] text-[var(--brand-text-secondary)]">
                      Deleted {deletedAt ? format(new Date(deletedAt), "dd MMM yyyy HH:mm") : "recently"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[12px] h-7"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate({ entityType: group.entityType, id })}
                    >
                      Restore
                    </Button>

                    {confirming?.entityType === group.entityType && confirming?.id === id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-red-600 font-medium">Permanent — sure?</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-[12px] h-7"
                          disabled={hardDelete.isPending}
                          onClick={() => hardDelete.mutate({ entityType: group.entityType, id })}
                        >
                          Delete forever
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[12px] h-7"
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[12px] h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setConfirming({ entityType: group.entityType, id })}
                      >
                        Delete forever
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
