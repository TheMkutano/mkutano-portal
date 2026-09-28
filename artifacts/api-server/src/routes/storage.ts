import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAnyPermission } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { hasPermission } from "../lib/permissions";
import { objectPathPermitsProject } from "../lib/projectIsolation";
import { db, conveningDocumentsTable, taskAttachmentsTable, engagementsTable, speakerEngagementsTable, partnersTable, speakersTable, conveningsTable, providerBookingsTable } from "@workspace/db";
import { eq, and, or, isNull, sql, type AnyColumn } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const PERMISSIONS = ["documents:read", "tasks:read", "partners:read", "speakers:read"] as const;

function projectId(req: Request, res: Response, fromBody = false): string | undefined {
  const id: unknown = fromBody ? req.body?.conveningId : req.query.conveningId;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(422).json({ error: "conveningId is required for private storage" }); return;
  }
  if (!canAccessConvening(req.portalUser!, id)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
  }
  return id;
}

/** Do not serve orphan uploads or legacy object URLs without an active project-owned reference. */
async function referencedInProject(path: string, cid: string, role: string): Promise<boolean> {
  const urls = [path, `/api/storage${path}`];
  const matches = (column: AnyColumn) => or(eq(column, urls[0]), eq(column, urls[1]))!;
  if (hasPermission(role, "documents:read")) {
    const [document] = await db.select({ id: conveningDocumentsTable.id }).from(conveningDocumentsTable)
      .where(and(eq(conveningDocumentsTable.conveningId, cid), matches(conveningDocumentsTable.url))).limit(1);
    if (document) return true;
  }
  if (hasPermission(role, "tasks:read")) {
    const [attachment] = await db.select({ id: taskAttachmentsTable.id }).from(taskAttachmentsTable)
      .where(and(eq(taskAttachmentsTable.conveningId, cid), matches(taskAttachmentsTable.url))).limit(1);
    if (attachment) return true;
  }
  if (hasPermission(role, "partners:read")) {
    const [partner] = await db.select({ id: partnersTable.id }).from(engagementsTable)
      .innerJoin(partnersTable, eq(engagementsTable.partnerId, partnersTable.id))
      .where(and(eq(engagementsTable.conveningId, cid), isNull(engagementsTable.deletedAt),
        isNull(partnersTable.deletedAt), or(
          and(isNull(engagementsTable.partnerProfile), matches(partnersTable.logoUrl)),
          sql`${engagementsTable.partnerProfile}->>'logoUrl' in (${urls[0]}, ${urls[1]})`,
        ))).limit(1);
    if (partner) return true;
  }
  if (hasPermission(role, "speakers:read")) {
    const [speaker] = await db.select({ id: speakersTable.id }).from(speakerEngagementsTable)
      .innerJoin(speakersTable, eq(speakerEngagementsTable.speakerId, speakersTable.id))
      .where(and(eq(speakerEngagementsTable.conveningId, cid), isNull(speakerEngagementsTable.deletedAt),
        isNull(speakersTable.deletedAt), or(
          and(isNull(speakerEngagementsTable.speakerProfile), matches(speakersTable.photoUrl)),
          sql`${speakerEngagementsTable.speakerProfile}->>'photoUrl' in (${urls[0]}, ${urls[1]})`,
        ))).limit(1);
    if (speaker) return true;
  }
  const [convening] = await db.select({ id: conveningsTable.id }).from(conveningsTable)
    .where(and(eq(conveningsTable.id, cid), matches(conveningsTable.brandLogoUrl))).limit(1);
  if (convening) return true;
  const [booking] = await db.select({ id: providerBookingsTable.id }).from(providerBookingsTable)
    .where(and(eq(providerBookingsTable.conveningId, cid), matches(providerBookingsTable.contractUrl))).limit(1);
  return !!booking && hasPermission(role, "documents:read");
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireAnyPermission([
  "documents:write", "tasks:write", "partners:write", "speakers:write",
]), async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  const conveningId = projectId(req, res, true);
  if (!conveningId) return;
  const [convening] = await db.select({ id: conveningsTable.id }).from(conveningsTable)
    .where(eq(conveningsTable.id, conveningId)).limit(1);
  if (!convening) { res.status(404).json({ error: "Convening not found" }); return; }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL(conveningId);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", requireAnyPermission([
  "documents:read", "tasks:read", "partners:read", "speakers:read",
]), async (req: Request, res: Response) => {
  const conveningId = projectId(req, res);
  if (!conveningId) return;
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    if (!objectPathPermitsProject(wildcardPath, conveningId)) {
      res.status(403).json({ error: "This file belongs to a different convening" }); return;
    }
    const objectPath = `/objects/${wildcardPath}`;
    if (!await referencedInProject(objectPath, conveningId, req.portalUser!.role)) {
      res.status(404).json({ error: "No file reference belongs to this convening; legacy or orphan file access denied" });
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
