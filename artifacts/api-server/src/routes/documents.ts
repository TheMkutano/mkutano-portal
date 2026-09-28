import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conveningDocumentsTable, outreachTemplatesTable } from "@workspace/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { requirePermission } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { writeAudit } from "../lib/audit";
import { z } from "zod/v4";
import { belongsToProject, privateObjectReferencePermitsProject, resolveProjectId } from "../lib/projectIsolation";

const router = Router();

// ── Documents ─────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = ["Deck", "GuidingDoc", "Prospectus", "Report", "AideMemoire", "Communique", "Contract", "Other"] as const;

function scopedId(req: Request, res: Response): string | undefined {
  const scope = resolveProjectId(req.query.conveningId, req.body?.conveningId);
  if ("error" in scope) {
    res.status(scope.status).json({ error: scope.error }); return;
  }
  const id = scope.id;
  if (!canAccessConvening(req.portalUser!, id)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
  }
  return id;
}

function ownedRow(res: Response, row: { conveningId: string | null } | undefined, id: string): boolean {
  if (!row) { res.status(404).json({ error: "Not found" }); return false; }
  if (row.conveningId === null) {
    res.status(409).json({ error: "Legacy global records are read-only. Create a convening-specific copy instead." }); return false;
  }
  if (!belongsToProject(row, id)) { res.status(404).json({ error: "Not found in this convening" }); return false; }
  return true;
}

router.get(
  "/documents",
  requirePermission("documents:read"),
  async (req: Request, res: Response) => {
    const conveningId = scopedId(req, res);
    if (!conveningId) return;
    const rows = await db
      .select()
      .from(conveningDocumentsTable)
      .where(eq(conveningDocumentsTable.conveningId, conveningId))
      .orderBy(conveningDocumentsTable.createdAt);
    res.json(rows);
  },
);

const CreateDocumentSchema = z.object({
  conveningId: z.string().min(1),
  type:        z.enum(DOCUMENT_TYPES),
  title:       z.string().min(1).max(500),
  url:         z.string().min(1),
  version:     z.number().int().positive().optional(),
  notes:       z.string().max(2000).optional(),
});

router.post(
  "/documents",
  requirePermission("documents:write"),
  async (req: Request, res: Response) => {
    const conveningId = scopedId(req, res);
    if (!conveningId) return;
    const parsed = CreateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }
    if (!privateObjectReferencePermitsProject(parsed.data.url, conveningId)) {
      res.status(422).json({ error: "This file belongs to a different convening" }); return;
    }

    const [row] = await db.insert(conveningDocumentsTable).values(parsed.data).returning();

    void writeAudit({
      conveningId: parsed.data.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Document",
      entityId: row.id,
      summary: `Added document "${parsed.data.title}"`,
      after: row,
    });

    res.status(201).json(row);
  },
);

const UpdateDocumentSchema = z.object({
  type:    z.enum(DOCUMENT_TYPES).optional(),
  title:   z.string().min(1).max(500).optional(),
  url:     z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
  notes:   z.string().max(2000).optional(),
});

router.patch(
  "/documents/:id",
  requirePermission("documents:write"),
  async (req: Request, res: Response) => {
    const conveningId = scopedId(req, res);
    if (!conveningId) return;
    const parsed = UpdateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }
    if (parsed.data.url && !privateObjectReferencePermitsProject(parsed.data.url, conveningId)) {
      res.status(422).json({ error: "This file belongs to a different convening" }); return;
    }

    const id = String(req.params.id);
    const [before] = await db
      .select()
      .from(conveningDocumentsTable)
      .where(eq(conveningDocumentsTable.id, id));
    if (!ownedRow(res, before, conveningId)) return;

    const [row] = await db
      .update(conveningDocumentsTable)
      .set(parsed.data)
      .where(and(eq(conveningDocumentsTable.id, id), eq(conveningDocumentsTable.conveningId, conveningId)))
      .returning();

    void writeAudit({
      conveningId: before.conveningId ?? undefined,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Document",
      entityId: id,
      summary: `Updated document "${row.title}"`,
      before,
      after: row,
    });

    res.json(row);
  },
);

router.delete(
  "/documents/:id",
  requirePermission("documents:write"),
  async (req: Request, res: Response) => {
    const conveningId = scopedId(req, res);
    if (!conveningId) return;
    const id = String(req.params.id);
    const [row] = await db
      .select()
      .from(conveningDocumentsTable)
      .where(eq(conveningDocumentsTable.id, id));
    if (!ownedRow(res, row, conveningId)) return;

    await db.delete(conveningDocumentsTable).where(and(eq(conveningDocumentsTable.id, id), eq(conveningDocumentsTable.conveningId, conveningId)));

    void writeAudit({
      conveningId: row.conveningId ?? undefined,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Document",
      entityId: id,
      summary: `Deleted document "${row.title}"`,
      before: row,
    });

    res.status(204).end();
  },
);

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATE_CATEGORIES = [
  "PartnerLetter", "SponsorLetter", "PensionFundLetter",
  "AdvisoryBoardConceptNote", "AdvisoryBoardInvitation",
  "SteeringCommitteeConceptNote", "Other",
] as const;

router.get(
  "/templates",
  requirePermission("documents:read"),
  async (req: Request, res: Response) => {
    const conveningId = scopedId(req, res);
    if (!conveningId) return;
    const rows = await db
      .select()
      .from(outreachTemplatesTable)
      .where(or(eq(outreachTemplatesTable.conveningId, conveningId), isNull(outreachTemplatesTable.conveningId)))
      .orderBy(outreachTemplatesTable.category, outreachTemplatesTable.createdAt);
    res.json(rows);
  },
);

const CreateTemplateSchema = z.object({
  name:         z.string().min(1).max(300),
  category:     z.enum(TEMPLATE_CATEGORIES),
  scope:        z.literal("Convening").optional(),
  conveningId:  z.string().min(1),
  bodyMarkdown: z.string().min(1),
});

router.post(
  "/templates",
  requirePermission("documents:write"),
  async (req: Request, res: Response) => {
    const conveningId = scopedId(req, res);
    if (!conveningId) return;
    const parsed = CreateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const [row] = await db.insert(outreachTemplatesTable).values({ ...parsed.data, scope: "Convening" }).returning();

    void writeAudit({
      conveningId: parsed.data.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Template",
      entityId: row.id,
      summary: `Added template "${parsed.data.name}"`,
      after: row,
    });

    res.status(201).json(row);
  },
);

const UpdateTemplateSchema = z.object({
  name:         z.string().min(1).max(300).optional(),
  category:     z.enum(TEMPLATE_CATEGORIES).optional(),
  scope:        z.literal("Convening").optional(),
  bodyMarkdown: z.string().min(1).optional(),
});

router.patch(
  "/templates/:id",
  requirePermission("documents:write"),
  async (req: Request, res: Response) => {
    const conveningId = scopedId(req, res);
    if (!conveningId) return;
    const parsed = UpdateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const id = String(req.params.id);
    const [before] = await db
      .select()
      .from(outreachTemplatesTable)
      .where(eq(outreachTemplatesTable.id, id));
    if (!ownedRow(res, before, conveningId)) return;
    if (before.scope === "Global") { res.status(409).json({ error: "Global templates are read-only; create a convening copy." }); return; }

    const [row] = await db
      .update(outreachTemplatesTable)
      .set(parsed.data)
      .where(and(eq(outreachTemplatesTable.id, id), eq(outreachTemplatesTable.conveningId, conveningId)))
      .returning();

    void writeAudit({
      conveningId: before.conveningId ?? undefined,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Template",
      entityId: id,
      summary: `Updated template "${row.name}"`,
      before,
      after: row,
    });

    res.json(row);
  },
);

router.delete(
  "/templates/:id",
  requirePermission("documents:write"),
  async (req: Request, res: Response) => {
    const conveningId = scopedId(req, res);
    if (!conveningId) return;
    const id = String(req.params.id);
    const [row] = await db
      .select()
      .from(outreachTemplatesTable)
      .where(eq(outreachTemplatesTable.id, id));
    if (!ownedRow(res, row, conveningId)) return;
    if (row.scope === "Global") { res.status(409).json({ error: "Global templates are read-only; create a convening copy." }); return; }

    await db.delete(outreachTemplatesTable).where(and(eq(outreachTemplatesTable.id, id), eq(outreachTemplatesTable.conveningId, conveningId)));

    void writeAudit({
      conveningId: row.conveningId ?? undefined,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "Template",
      entityId: id,
      summary: `Deleted template "${row.name}"`,
      before: row,
    });

    res.status(204).end();
  },
);

export default router;
