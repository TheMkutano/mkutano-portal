import { Router, type IRouter, type Request, type Response } from "express";
import { db, mediaConsentsTable, speakerEngagementsTable, speakersTable, insertMediaConsentSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireConveningAccess, requirePermission } from "../middlewares/requirePermission";
import { notDeleted } from "../lib/softDelete";
import { belongsToProject, resolveProjectId } from "../lib/projectIsolation";

const router: IRouter = Router();

function projectId(req: Request, res: Response): string | undefined {
  const scope = resolveProjectId(req.query.conveningId, req.body?.conveningId);
  if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }
  return scope.id;
}

async function speakerLinked(speakerId: string, conveningId: string): Promise<boolean> {
  const [link] = await db.select({ id: speakerEngagementsTable.id })
    .from(speakerEngagementsTable)
    .innerJoin(speakersTable, eq(speakersTable.id, speakerEngagementsTable.speakerId))
    .where(and(
      eq(speakerEngagementsTable.speakerId, speakerId),
      eq(speakerEngagementsTable.conveningId, conveningId),
      notDeleted(speakerEngagementsTable), notDeleted(speakersTable),
    )).limit(1);
  return !!link;
}

router.get("/consents", requirePermission("speakers:read"), requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = projectId(req, res);
    if (!conveningId) return;
    const speakerId = req.query.speakerId;
    if (speakerId !== undefined && (typeof speakerId !== "string" || !speakerId)) {
      res.status(422).json({ error: "speakerId must be a string" }); return;
    }
    const conditions = [eq(mediaConsentsTable.conveningId, conveningId)];
    if (speakerId) conditions.push(eq(mediaConsentsTable.speakerId, speakerId));
    const rows = await db.select({ consent: mediaConsentsTable }).from(mediaConsentsTable)
      .innerJoin(speakerEngagementsTable, and(
        eq(speakerEngagementsTable.speakerId, mediaConsentsTable.speakerId),
        eq(speakerEngagementsTable.conveningId, mediaConsentsTable.conveningId),
        notDeleted(speakerEngagementsTable)))
      .innerJoin(speakersTable, and(eq(speakersTable.id, mediaConsentsTable.speakerId), notDeleted(speakersTable)))
      .where(and(...conditions));
    res.json(rows.map(row => row.consent));
  });

router.post("/consents", requirePermission("speakers:write"), requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = projectId(req, res);
    if (!conveningId) return;
    const parsed = insertMediaConsentSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.conveningId) {
      res.status(422).json({ error: "Valid consent, speakerId and conveningId are required",
        errors: parsed.success ? undefined : parsed.error.flatten().fieldErrors }); return;
    }
    if (!await speakerLinked(parsed.data.speakerId, conveningId)) {
      res.status(422).json({ error: "Speaker is not linked to this convening" }); return;
    }
    const [existing] = await db.select({ id: mediaConsentsTable.id }).from(mediaConsentsTable)
      .where(and(eq(mediaConsentsTable.speakerId, parsed.data.speakerId),
        eq(mediaConsentsTable.conveningId, conveningId))).limit(1);
    if (existing) { res.status(409).json({ error: "Consent has already been recorded for this speaker and convening" }); return; }
    const [created] = await db.insert(mediaConsentsTable)
      .values({ ...parsed.data, conveningId, status: parsed.data.status ?? "Pending",
        capturedVia: parsed.data.capturedVia ?? "AdminRecorded" }).returning();
    res.status(201).json(created);
  });

const patchConsentSchema = insertMediaConsentSchema.partial()
  .omit({ speakerId: true, conveningId: true });

router.patch("/consents/:id", requirePermission("speakers:write"), requireConveningAccess(),
  async (req: Request, res: Response) => {
    const conveningId = projectId(req, res);
    if (!conveningId) return;
    const [before] = await db.select().from(mediaConsentsTable)
      .where(eq(mediaConsentsTable.id, String(req.params.id)));
    if (!before || !belongsToProject(before, conveningId)) {
      res.status(404).json({ error: "Consent not found in this convening" }); return;
    }
    if (!await speakerLinked(before.speakerId, conveningId)) {
      res.status(404).json({ error: "Speaker is not linked to this convening" }); return;
    }
    const parsed = patchConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Invalid consent update", errors: parsed.error.flatten().fieldErrors }); return;
    }
    const [updated] = await db.update(mediaConsentsTable).set(parsed.data)
      .where(and(eq(mediaConsentsTable.id, before.id), eq(mediaConsentsTable.conveningId, conveningId))).returning();
    if (!updated) { res.status(404).json({ error: "Consent not found in this convening" }); return; }
    res.json(updated);
  });

export default router;