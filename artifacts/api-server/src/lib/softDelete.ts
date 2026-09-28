import { isNull } from "drizzle-orm";

/**
 * Returns a Drizzle WHERE condition that excludes soft-deleted rows.
 * Usage: .where(and(notDeleted(myTable), eq(myTable.id, id)))
 */
export function notDeleted<T extends { deletedAt: unknown }>(table: T) {
  return isNull(table.deletedAt as Parameters<typeof isNull>[0]);
}
