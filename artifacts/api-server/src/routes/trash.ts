import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  delegatesTable, engagementsTable,
  speakerEngagementsTable, dealProjectsTable, dealCommitmentsTable,
  agendaSessionsTable, exhibitorsTable, boothsTable,
} from "@workspace/db";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { requirePermission } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { writeAudit } from "../lib/audit";
import { isForeignKeyViolation } from "../lib/pgError";
import { resolveProjectId } from "../lib/projectIsolation";

const router: IRouter = Router();

// Loose transaction type — the concrete driver-specific generics are not
// exported, and each purge only needs the runtime .delete() method.
type Tx = Pick<typeof db, "delete">;

/**
 * Per-entity purge of dependent child rows that carry an ON DELETE RESTRICT
 * foreign key back to the parent. These children would otherwise block a
 * permanent delete with a raw FK violation. Rows with CASCADE / SET NULL FKs
 * are handled automatically by the database and are intentionally not listed.
 *
 * Runs inside the same transaction as the parent delete, in dependency order.
 */
const PURGE_CHILDREN: Record<string, (tx: Tx, parentId: string) => Promise<void>> = {};

// ── Soft-delete table registry ────────────────────────────────────────────────
interface SoftDeleteEntry {
  table: { id: unknown; deletedAt: unknown; conveningId: unknown };
  selectAll: (conveningId: string) => Promise<unknown[]>;
  softDelete: (id: string) => Promise<void>;
  hardDelete: (id: string, conveningId: string) => Promise<unknown>;
  restore: (id: string, conveningId: string) => Promise<unknown>;
}

function makeEntry<T extends { id: unknown; deletedAt: unknown; conveningId: unknown }>(table: T, entityType?: string): SoftDeleteEntry {
  return {
    table,
    selectAll: (conveningId: string) =>
      // @ts-expect-error — generic Drizzle table access
      db.select().from(table).where(and(isNotNull(table.deletedAt), eq(table.conveningId, conveningId))) as Promise<unknown[]>,
    softDelete: async (id: string) => {
      // @ts-expect-error
      await db.update(table).set({ deletedAt: new Date() }).where(and(eq(table.id, id), isNull(table.deletedAt)));
    },
    hardDelete: async (id: string, conveningId: string) => {
      // Purge RESTRICT-blocking children then the parent, atomically.
      const purge = entityType ? PURGE_CHILDREN[entityType] : undefined;
      return db.transaction(async (tx) => {
        if (purge) await purge(tx, id);
        // @ts-expect-error
        const [row] = await tx.delete(table).where(and(eq(table.id, id), isNotNull(table.deletedAt), eq(table.conveningId, conveningId))).returning();
        return row;
      });
    },
    restore: async (id: string, conveningId: string) => {
      // @ts-expect-error
      const [row] = await db.update(table).set({ deletedAt: null }).where(and(eq(table.id, id), isNotNull(table.deletedAt), eq(table.conveningId, conveningId))).returning();
      return row;
    },
  };
}

const REGISTRY: Record<string, SoftDeleteEntry> = {
  Delegate:          makeEntry(delegatesTable, "Delegate"),
  Engagement:        makeEntry(engagementsTable, "Engagement"),
  SpeakerEngagement: makeEntry(speakerEngagementsTable, "SpeakerEngagement"),
  DealProject:       makeEntry(dealProjectsTable, "DealProject"),
  DealCommitment:    makeEntry(dealCommitmentsTable, "DealCommitment"),
  AgendaSession:     makeEntry(agendaSessionsTable, "AgendaSession"),
  Exhibitor:         makeEntry(exhibitorsTable, "Exhibitor"),
  Booth:             makeEntry(boothsTable, "Booth"),
};

const SUPPORTED = Object.keys(REGISTRY);
// Shared identities cannot safely be restored or purged from a project trash.
// Event links have their own scoped trash entries.
function entryFor(entityType: string, res: Response): SoftDeleteEntry | undefined {
  if (entityType === "Partner" || entityType === "Speaker") {
    res.status(409).json({ error: "Shared identities cannot be managed from project trash; restore their event engagement instead." });
    return;
  }
  const entry = REGISTRY[entityType];
  if (!entry) res.status(400).json({ error: `Unknown entityType: ${entityType}` });
  return entry;
}

function getConveningId(req: Request, res: Response): string | undefined {
  const scope = resolveProjectId(req.query.conveningId, req.body?.conveningId);
  if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }
  const id = scope.id;
  if (!canAccessConvening(req.portalUser!, id)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
  }
  return id;
}

async function ownsDeletedRow(entityType: string, id: string, conveningId: string) {
  // Registry access is generic, but each table has the same conveningId ownership column.
  const entry = REGISTRY[entityType];
  const rows = await entry.selectAll(conveningId) as { id: string; conveningId: string }[];
  return rows.some(row => row.id === id && row.conveningId === conveningId);
}

/**
 * GET /trash?entityType=Partner
 * Lists soft-deleted items. Requires trash:restore permission.
 */
router.get("/trash", requirePermission("trash:restore"), async (req: Request, res: Response) => {
  const conveningId = getConveningId(req, res);
  if (!conveningId) return;
  const entityType = req.query.entityType ? String(req.query.entityType) : undefined;

  if (entityType && !SUPPORTED.includes(entityType)) {
    res.status(400).json({ error: `Unknown entityType. Supported: ${SUPPORTED.join(", ")}` });
    return;
  }

  const targetTypes = entityType ? [entityType] : SUPPORTED;
  const results: { entityType: string; items: unknown[] }[] = [];

  for (const type of targetTypes) {
    const items = await REGISTRY[type].selectAll(conveningId);
    if (items.length > 0) results.push({ entityType: type, items });
  }

  res.json(results);
});

/**
 * PATCH /trash/:entityType/:id/restore
 * Restores a soft-deleted item. Requires trash:restore permission.
 */
router.patch("/trash/:entityType/:id/restore", requirePermission("trash:restore"), async (req: Request, res: Response) => {
  const conveningId = getConveningId(req, res);
  if (!conveningId) return;
  const entityType = String(req.params.entityType);
  const id = String(req.params.id);

  const entry = entryFor(entityType, res);
  if (!entry) return;
  if (!await ownsDeletedRow(entityType, id, conveningId)) {
    res.status(404).json({ error: "Item not found in this convening's trash" }); return;
  }

  const restored = await entry.restore(id, conveningId);
  if (!restored) { res.status(404).json({ error: "Item not found in trash" }); return; }

  void writeAudit({
    conveningId,
    actorUserId: req.portalUser!.id,
    action: "Restore",
    entityType,
    entityId: id,
    summary: `Restored ${entityType} ${id} from trash`,
  });

  res.json(restored);
});

/**
 * DELETE /trash/:entityType/:id
 * Permanently deletes a soft-deleted item. Admin-only (trash:hardDelete).
 */
router.delete("/trash/:entityType/:id", requirePermission("trash:hardDelete"), async (req: Request, res: Response) => {
  const conveningId = getConveningId(req, res);
  if (!conveningId) return;
  const entityType = String(req.params.entityType);
  const id = String(req.params.id);

  const entry = entryFor(entityType, res);
  if (!entry) return;
  if (!await ownsDeletedRow(entityType, id, conveningId)) {
    res.status(404).json({ error: "Item not found in this convening's trash" }); return;
  }

  let deleted: unknown;
  try {
    deleted = await entry.hardDelete(id, conveningId);
  } catch (err) {
    // A foreign-key violation means something still references this record that
    // our purge policy does not remove. Return a clean 409 rather than a 500.
    if (isForeignKeyViolation(err)) {
      res.status(409).json({ error: `Cannot permanently delete ${entityType}: other records still reference it.` });
      return;
    }
    throw err;
  }
  if (!deleted) { res.status(404).json({ error: "Item not found in trash (must be soft-deleted first)" }); return; }

  void writeAudit({
    conveningId,
    actorUserId: req.portalUser!.id,
    action: "Delete",
    entityType,
    entityId: id,
    summary: `Permanently deleted ${entityType} ${id}`,
    before: deleted,
  });

  res.status(204).end();
});

export default router;
