import { useState } from "react";
import {
  useGetMe,
  useGetAuditLog,
  getGetAuditLogQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const ENTITY_TYPES = [
  "All", "Partner", "Speaker", "Delegate", "Engagement", "SpeakerEngagement",
  "DealProject", "DealCommitment", "AgendaSession", "Exhibitor", "Booth", "Budget",
];

const ACTION_TYPES = ["All", "Create", "Update", "Delete", "Restore", "Export"] as const;

interface DelegateExportMeta {
  rowCount: string | null;
  segment: string | null;
  passTypeCategory: string | null;
}

function parseDelegateExportSummary(summary: string): DelegateExportMeta | null {
  if (!summary.startsWith("Exported") || !summary.includes("delegates")) return null;
  const countMatch   = summary.match(/Exported (\d+) delegate/);
  const segMatch     = summary.match(/segment=([^,)]+)/);
  const ptCatMatch   = summary.match(/passTypeCategory=([^,)]+)/);
  const toNull = (v: string | undefined) =>
    !v || v === "undefined" || v === "null" ? null : v;
  return {
    rowCount: countMatch?.[1] ?? null,
    segment: toNull(segMatch?.[1]),
    passTypeCategory: toNull(ptCatMatch?.[1]),
  };
}

const ACTION_COLORS: Record<string, string> = {
  Create:  "bg-[#E8F5ED] text-[#2E7D5B]",
  Update:  "bg-blue-50 text-blue-700",
  Delete:  "bg-red-50 text-red-700",
  Restore: "bg-purple-50 text-purple-700",
  Export:  "bg-amber-50 text-amber-700",
};

export default function AuditLog() {
  const qc = useQueryClient();
  const { data: profile } = useGetMe();
  const [entityType, setEntityType] = useState("All");
  const [action, setAction]         = useState("All");
  const [after, setAfter]   = useState("");
  const [before, setBefore] = useState("");

  const params = {
    ...(entityType !== "All" && { entityType }),
    ...(action     !== "All" && { action: action as "Create" | "Update" | "Delete" | "Restore" | "Export" }),
    ...(after  && { after }),
    ...(before && { before }),
    limit: 200,
  };

  const { data, isLoading, error } = useGetAuditLog(params, {
    query: {
      queryKey: getGetAuditLogQueryKey(params),
      enabled: profile?.role === "Admin",
    },
  });

  if (profile?.role !== "Admin") {
    return (
      <div className="p-8 text-center text-[var(--brand-text-secondary)]">
        Audit log is visible to Admins only.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--brand-ink)]">Audit Log</h1>
          <p className="text-[13px] text-[var(--brand-text-secondary)] mt-0.5">
            Read-only history of all create / update / delete / restore / export actions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: getGetAuditLogQueryKey(params) })}
        >
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
            Entity type
          </label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="w-44 h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
            Action
          </label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-36 h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((a) => (
                <SelectItem key={a} value={a}>
                  {a === "All" ? "All actions" : (
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${
                        a === "Create"  ? "bg-[#2E7D5B]" :
                        a === "Update"  ? "bg-blue-500"  :
                        a === "Delete"  ? "bg-red-500"   :
                        a === "Restore" ? "bg-purple-500":
                        "bg-amber-500"
                      }`} />
                      {a}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
            From
          </label>
          <Input
            type="date"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            className="h-8 text-[13px] w-40"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
            To
          </label>
          <Input
            type="date"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            className="h-8 text-[13px] w-40"
          />
        </div>

        {(entityType !== "All" || action !== "All" || after || before) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[13px]"
            onClick={() => { setEntityType("All"); setAction("All"); setAfter(""); setBefore(""); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading && (
        <div className="text-[13px] text-[var(--brand-text-secondary)] py-8 text-center">
          Loading…
        </div>
      )}

      {error && (
        <div className="text-[13px] text-red-600 py-4">
          Failed to load audit log.
        </div>
      )}

      {data && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--brand-tint)] border-b text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)]">
                <th className="px-4 py-2.5 text-left">Time</th>
                <th className="px-4 py-2.5 text-left">Action</th>
                <th className="px-4 py-2.5 text-left">Entity</th>
                <th className="px-4 py-2.5 text-left">Summary</th>
                <th className="px-4 py-2.5 text-left">Actor ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--brand-border)]">
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--brand-text-secondary)]">
                    No audit entries found.
                  </td>
                </tr>
              )}
              {data.map((entry) => (
                <tr key={entry.id} className="hover:bg-[var(--brand-tint)]/40 transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap text-[var(--brand-text-secondary)] font-mono text-[11px]">
                    {format(new Date(entry.createdAt), "dd MMM yyyy HH:mm")}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      className={`text-[10px] font-semibold ${ACTION_COLORS[entry.action] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {entry.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-[var(--brand-ink)]">{entry.entityType}</span>
                    <span className="text-[var(--brand-text-secondary)] ml-1.5 font-mono text-[11px] truncate max-w-[80px] inline-block align-middle">
                      {entry.entityId.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--brand-ink)] max-w-[380px]">
                    {entry.action === "Export" && entry.entityType === "Delegate" && entry.summary
                      ? (() => {
                          const meta = parseDelegateExportSummary(entry.summary);
                          if (!meta) return <span className="truncate block">{entry.summary}</span>;
                          return (
                            <div className="space-y-1">
                              <span className="block text-[var(--brand-ink)]">
                                Exported{meta.rowCount ? ` ${meta.rowCount}` : ""} delegates
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {meta.segment ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                    <span className="text-amber-500 font-semibold">Segment</span>
                                    {meta.segment}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500">
                                    <span className="font-semibold">Segment</span>All
                                  </span>
                                )}
                                {meta.passTypeCategory ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                    <span className="text-amber-500 font-semibold">Pass type</span>
                                    {meta.passTypeCategory}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500">
                                    <span className="font-semibold">Pass type</span>All
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      : <span className="truncate block">{entry.summary ?? "—"}</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--brand-text-secondary)]">
                    {entry.actorUserId.slice(0, 8)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p className="text-[11px] text-[var(--brand-text-secondary)]">
          {data.length} entries shown (max 200). Use date filters to narrow results.
        </p>
      )}
    </div>
  );
}
