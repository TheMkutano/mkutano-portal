import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
}

const ALIGN: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  loading = false,
  skeletonRows = 5,
  emptyTitle = "Nothing here yet",
  emptyBody,
  emptyAction,
  emptyIcon,
  onRowClick,
  className,
  toolbarLeft,
  toolbarRight,
}: DataTableProps<T>) {
  const hasToolbar = toolbarLeft || toolbarRight;

  return (
    <div
      className={cn(
        "rounded-[10px] border border-[var(--brand-border)] overflow-hidden bg-white",
        className,
      )}
    >
      {hasToolbar && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--brand-border)] bg-[var(--brand-tint)]/40">
          <div className="flex-1">{toolbarLeft}</div>
          {toolbarRight}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--brand-border)] bg-[var(--brand-tint)]/30">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.07em]",
                    "text-[var(--brand-text-secondary)]",
                    ALIGN[col.align ?? "left"],
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--brand-border)] last:border-b-0">
                  {columns.map((col) => (
                    <td key={col.id} className={cn("px-4 py-3", col.className)}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle}
                    body={emptyBody}
                    action={emptyAction}
                    className="py-14"
                  />
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "group border-b border-[var(--brand-border)] last:border-b-0 transition-colors",
                    onRowClick
                      ? "cursor-pointer hover:bg-[var(--brand-tint)]/60"
                      : "hover:bg-[var(--brand-tint)]/40",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        "px-4 py-3",
                        ALIGN[col.align ?? "left"],
                        col.align === "right" && "tabular-nums",
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
