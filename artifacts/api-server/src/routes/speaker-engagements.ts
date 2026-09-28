import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { speakerEngagementsTable, speakersTable, insertSpeakerEngagementSchema } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { notDeleted } from "../lib/softDelete";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

const patchSpeakerEngagementSchema = insertSpeakerEngagementSchema
  .partial()
  .omit({ conveningId: true, speakerId: true });

router.get(
  "/speaker-engagements",
  requirePermission("speakers:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId, speakerId } = req.query;

    // conveningId is mandatory: without it we would return rows across every
    // convening (tenant leak). requireConveningAccess() has already verified
    // access to this conveningId when present.
    if (!conveningId) {
      res.status(400).json({ error: "conveningId is required" });
      return;
    }

    const conditions = [
      isNull(speakerEngagementsTable.deletedAt),
      eq(speakerEngagementsTable.conveningId, String(conveningId)),
    ];
    if (speakerId) conditions.push(eq(speakerEngagementsTable.speakerId, String(speakerId)));

    const rows = await db
      .select()
      .from(speakerEngagementsTable)
      .where(and(...conditions));

    res.json(rows);
  },
);

router.post(
  "/speaker-engagements",
  requirePermission("speakers:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const parse = insertSpeakerEngagementSchema.safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const [speaker] = await db.select().from(speakersTable).where(and(
      eq(speakersTable.id, parse.data.speakerId), notDeleted(speakersTable)));
    if (!speaker) { res.status(422).json({ error: "Speaker not found" }); return; }
    const [created] = await db
      .insert(speakerEngagementsTable)
      .values({ ...parse.data, speakerProfile: speaker })
      .returning();

    void writeAudit({
      conveningId: created.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "SpeakerEngagement",
      entityId: created.id,
      summary: `Created speaker engagement for speaker ${created.speakerId}`,
      after: created,
    });

    res.status(201).json(created);
  },
);

router.patch(
  "/speaker-engagements/:id",
  requirePermission("speakers:write"),
  async (req: Request, res: Response) => {
    const [before] = await db
      .select()
      .from(speakerEngagementsTable)
      .where(and(eq(speakerEngagementsTable.id, String(req.params.id)), notDeleted(speakerEngagementsTable)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    if (req.portalUser && req.portalUser.accountType !== "Internal" &&
        !canAccessConvening(req.portalUser, before.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" });
      return;
    }

    const parse = patchSpeakerEngagementSchema.safeParse(req.body);
    if (!parse.success) {
      const errors: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const key = issue.path.join(".") || "root";
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const [updated] = await db
      .update(speakerEngagementsTable)
      .set(parse.data)
      .where(eq(speakerEngagementsTable.id, String(req.params.id)))
      .returning();

    void writeAudit({
      conveningId: updated.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "SpeakerEngagement",
      entityId: updated.id,
      summary: `Updated speaker engagement ${updated.id}`,
      before,
      after: updated,
    });

    res.json(updated);
  },
);

export default router;
