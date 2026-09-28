import { db } from "@workspace/db";
import { delegatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "./softDelete";

const PAYING_TYPES = new Set(["Paid", "EarlyBird", "Standard", "Late", "VIP"]);
const COMP_TYPES   = new Set(["FreeSponsor", "FreeComp", "Speaker", "Press", "Official"]);

const DEFAULT_EXPORT_COLUMNS = ["name", "email", "jobTitle", "organization", "country", "segment", "passType", "status"];

export const ALL_EXPORT_COLUMNS = [
  "name", "email", "jobTitle", "organization", "country",
  "segment", "passType", "status", "gender", "ageBand", "aum", "notes",
] as const;

export type ExportColumn = typeof ALL_EXPORT_COLUMNS[number];

function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    // Neutralise CSV/formula injection: prefix values that start with a
    // spreadsheet formula character so Excel/Sheets won't execute them.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export interface DelegateExportFilters {
  conveningId: string;
  segment?: string;
  passTypeCategory?: string;
  columns?: string[];
}

export interface DelegateExportResult {
  csv: string;
  rowCount: number;
  segment: string;
  passTypeCategory: string;
}

/**
 * Builds the delegate export CSV for a convening, applying the same segment /
 * pass-type-category filters and sensitive-field stripping used by the manual
 * export endpoint. Shared by the manual export route and the scheduled export job.
 */
export async function buildDelegateExportCsv(filters: DelegateExportFilters): Promise<DelegateExportResult> {
  const { conveningId } = filters;

  let rows = await db
    .select()
    .from(delegatesTable)
    .where(
      and(
        eq(delegatesTable.conveningId, conveningId),
        notDeleted(delegatesTable),
      ),
    );

  const seg = filters.segment ? filters.segment : "All";
  if (seg && seg !== "All") {
    rows = rows.filter(r => (r.segment ?? "Unassigned") === seg);
  }

  const ptCat = filters.passTypeCategory ? filters.passTypeCategory : "All";
  if (ptCat === "Paying") {
    rows = rows.filter(r => PAYING_TYPES.has(r.passType));
  } else if (ptCat === "Comp") {
    rows = rows.filter(r => COMP_TYPES.has(r.passType));
  }

  // Strip sensitive fields — the CSV spec omits dietary/access needs for all callers
  const exportRows = rows.map(({ dietaryRequirements: _d, accessNeeds: _a, ...rest }) => rest);

  // Resolve which columns to emit; validate against the allow-list so callers
  // can't request sensitive columns (dietary/access are already stripped above).
  const allowedSet = new Set<string>(ALL_EXPORT_COLUMNS);
  const cols =
    filters.columns && filters.columns.length > 0
      ? filters.columns.filter(c => allowedSet.has(c))
      : [...DEFAULT_EXPORT_COLUMNS];

  // Guarantee at least one column to avoid empty CSV
  const effectiveCols = cols.length > 0 ? cols : [...DEFAULT_EXPORT_COLUMNS];

  return {
    csv: toCsv(exportRows as Record<string, unknown>[], effectiveCols),
    rowCount: exportRows.length,
    segment: seg,
    passTypeCategory: ptCat,
  };
}
