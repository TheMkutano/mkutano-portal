import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  conveningsTable,
  conveningAccessTable,
  conveningTeamMembersTable,
  portalUsersTable,
  engagementsTable,
  speakerEngagementsTable,
  delegatesTable,
  budgetsTable,
} from "@workspace/db";
import {
  workstreamsTable,
  tasksTable,
  agendaSessionsTable,
  milestonesTable,
  pillarsTable,
  exhibitorsTable,
  boothsTable,
  dealProjectsTable,
  dealCommitmentsTable,
  commitmentsTable,
  providerBookingsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { requirePermission } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { writeAudit } from "../lib/audit";
import { isForeignKeyViolation, isUniqueViolation } from "../lib/pgError";
import { notDeleted } from "../lib/softDelete";
import { z } from "zod/v4";

const router: IRouter = Router();

// ── GET /convenings/public — unauthenticated: id + name only ─────────────────
router.get("/convenings/public", async (_req: Request, res: Response) => {
  const rows = await db
    .select({ id: conveningsTable.id, name: conveningsTable.name })
    .from(conveningsTable)
    .orderBy(conveningsTable.name);
  res.json(rows);
});

const DAY_MS = 86_400_000;
function shiftDate(d: string | null | undefined, offsetDays: number): string | null | undefined {
  if (!d) return d;
  return new Date(+new Date(d) + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

router.get("/convenings", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const authUserId = req.user.id;
  const [portalUser] = await db
    .select()
    .from(portalUsersTable)
    .where(eq(portalUsersTable.authUserId, authUserId));

  if (!portalUser) {
    res.json([]);
    return;
  }

  let convenings;
  if (portalUser.accountType === "Internal") {
    convenings = await db.select().from(conveningsTable);
  } else {
    const accessRows = await db
      .select()
      .from(conveningAccessTable)
      .where(eq(conveningAccessTable.userId, portalUser.id));

    if (accessRows.length === 0) {
      res.json([]);
      return;
    }

    const ids = accessRows.map((r) => r.conveningId);
    convenings = await db
      .select()
      .from(conveningsTable)
      .where(inArray(conveningsTable.id, ids));
  }

  res.json(convenings);
});

const CreateConveningSchema = z.object({
  name:              z.string().trim().min(1).max(300),
  slug:              z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
  theme:             z.string().max(500).optional(),
  startDate:         z.string().optional(),
  endDate:           z.string().optional(),
  venueName:         z.string().max(300).optional(),
  venueConfirmed:    z.boolean().optional(),
  status:            z.enum(["Planning", "Active", "Completed", "Archived"]).optional(),
  timezone:          z.string().optional(),
  usdToUgxRate:      z.number().optional(),
  whiteLabel:        z.boolean().optional(),
  brandLogoUrl:      z.string().optional(),
  brandPrimaryColor: z.string().optional(),
  brandAccentColor:  z.string().optional(),
});

router.post(
  "/convenings",
  requirePermission("settings:manage"),
  async (req: Request, res: Response) => {
    const parsed = CreateConveningSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const { name, slug, theme, startDate, endDate, venueName, venueConfirmed, status,
      timezone, usdToUgxRate, whiteLabel, brandLogoUrl, brandPrimaryColor, brandAccentColor } = parsed.data;

    let created;
    try {
      created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(conveningsTable).values({
        name, slug,
        ...(theme             !== undefined && { theme }),
        ...(startDate         !== undefined && { startDate }),
        ...(endDate           !== undefined && { endDate }),
        ...(venueName         !== undefined && { venueName }),
        ...(venueConfirmed    !== undefined && { venueConfirmed }),
        ...(status            !== undefined && { status }),
        ...(timezone          !== undefined && { timezone }),
        ...(usdToUgxRate      !== undefined && { usdToUgxRate }),
        ...(whiteLabel        !== undefined && { whiteLabel }),
        ...(brandLogoUrl      !== undefined && { brandLogoUrl }),
        ...(brandPrimaryColor !== undefined && { brandPrimaryColor }),
        ...(brandAccentColor  !== undefined && { brandAccentColor }),
        }).returning();
        // Keep project and team provisioning atomic: a failed team insert must
        // never turn a successful project insert into an apparent failed save.
        const internalStaff = await tx
          .select({ id: portalUsersTable.id })
          .from(portalUsersTable)
          .where(and(
            eq(portalUsersTable.accountType, "Internal"),
            eq(portalUsersTable.emailVerified, true),
          ));
        for (const staff of internalStaff) {
          await tx.insert(conveningTeamMembersTable)
            .values({ conveningId: row.id, userId: staff.id, projectRole: "Staff", isLead: false })
            .onConflictDoNothing();
        }
        return row;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "A project with this slug already exists. Choose a different slug." });
        return;
      }
      throw err;
    }

    void writeAudit({
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "Convening",
      entityId: created.id,
      summary: `Created convening "${name}"`,
      after: created,
    });
    res.status(201).json(created);
  },
);

router.get("/convenings/:id", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [convening] = await db
    .select()
    .from(conveningsTable)
    .where(eq(conveningsTable.id, String(req.params.id)));

  // Fail closed: an authenticated user without a portal profile has no access.
  if (!req.portalUser) {
    res.status(403).json({ error: "No portal profile. Request access from an Admin." });
    return;
  }

  if (!convening) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (req.portalUser.accountType !== "Internal" &&
      !canAccessConvening(req.portalUser, convening.id)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" });
    return;
  }

  res.json(convening);
});

const UpdateConveningSchema = z.object({
  name:               z.string().min(1).max(300).optional(),
  slug:               z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
  theme:              z.string().max(500).optional(),
  startDate:          z.string().optional(),
  endDate:            z.string().optional(),
  venueName:          z.string().max(300).optional(),
  venueConfirmed:     z.boolean().optional(),
  status:             z.enum(["Planning", "Active", "Completed", "Archived"]).optional(),
  timezone:           z.string().optional(),
  usdToUgxRate:       z.number().optional(),
  whiteLabel:         z.boolean().optional(),
  brandLogoUrl:       z.string().optional(),
  brandPrimaryColor:  z.string().optional(),
  brandAccentColor:   z.string().optional(),
  registrationTarget: z.number().int().min(0).optional(),
  compPassCap:        z.number().int().min(0).optional(),
});

router.patch(
  "/convenings/:id",
  requirePermission("settings:manage"),
  async (req: Request, res: Response) => {
    const parsed = UpdateConveningSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }

    const id = String(req.params.id);
    const [before] = await db.select().from(conveningsTable).where(eq(conveningsTable.id, id));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as typeof parsed.data;

    const [updated] = await db
      .update(conveningsTable)
      .set(updates)
      .where(eq(conveningsTable.id, id))
      .returning();

    void writeAudit({
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "Convening",
      entityId: id,
      summary: `Updated convening "${updated.name}"`,
      before,
      after: updated,
    });

    res.json(updated);
  },
);

/**
 * POST /convenings/:id/clone
 * Body: { name, slug, theme?, startDate?, endDate?, venueName?, status?,
 *         include?: { workstreams?, tasks?, agenda? } }
 *
 * Creates a new convening and optionally clones scaffolding (structure only,
 * never people or financial data) from the source convening.
 * - workstreams: copied with dates shifted by the gap between start dates
 * - tasks: copied with dates shifted, progress reset to 0, status NotStarted
 * - agenda: session skeleton copied (no speakers), status forced to Proposed
 */
router.post("/convenings/:id/clone", requirePermission("settings:manage"), async (req: Request, res: Response) => {
  // Fail closed: requirePermission guarantees an authenticated portal user with
  // settings:manage (same permission as POST /convenings).
  if (!req.portalUser) {
    res.status(403).json({ error: "No portal profile. Request access from an Admin." });
    return;
  }

  const sourceId = String(req.params.id);
  const {
    name, slug, theme, startDate, endDate, venueName, status,
    include = {},
  } = req.body as {
    name: string;
    slug: string;
    theme?: string;
    startDate?: string;
    endDate?: string;
    venueName?: string;
    status?: string;
    include?: { workstreams?: boolean; tasks?: boolean; agenda?: boolean };
  };

  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  const [source] = await db
    .select()
    .from(conveningsTable)
    .where(eq(conveningsTable.id, sourceId));

  if (!source) {
    res.status(404).json({ error: "Source convening not found" });
    return;
  }

  // Tenant isolation: non-Internal users may only clone from a source they
  // can access.
  if (req.portalUser.accountType !== "Internal" &&
      !canAccessConvening(req.portalUser, source.id)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" });
    return;
  }

  const offsetDays =
    source.startDate && startDate
      ? Math.round((+new Date(startDate) - +new Date(source.startDate)) / DAY_MS)
      : 0;

  const inc = { workstreams: true, tasks: true, agenda: false, ...include };

  let conv;
  try {
    conv = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conveningsTable)
      .values({ name, slug, theme, startDate, endDate, venueName, status: (status as "Planning" | "Active" | "Completed" | "Archived") ?? "Planning" })
      .returning();

    if (inc.workstreams) {
      const ws = await tx
        .select()
        .from(workstreamsTable)
        .where(eq(workstreamsTable.conveningId, sourceId));

      for (const w of ws) {
        const [nw] = await tx
          .insert(workstreamsTable)
          .values({
            conveningId: created.id,
            name: w.name,
            order: w.order,
            colorToken: w.colorToken,
            ownerUserId: null,
            targetDate: shiftDate(w.targetDate, offsetDays) ?? undefined,
          })
          .returning();

        if (inc.tasks) {
          const tasks = await tx
            .select()
            .from(tasksTable)
            .where(eq(tasksTable.workstreamId, w.id));

          for (const t of tasks) {
            await tx.insert(tasksTable).values({
              conveningId: created.id,
              workstreamId: nw.id,
              title: t.title,
              description: t.description,
              startDate: shiftDate(t.startDate, offsetDays) ?? undefined,
              dueDate: shiftDate(t.dueDate, offsetDays) ?? undefined,
              progressPct: 0,
              isMilestone: t.isMilestone,
              ownerUserId: null,
              assignee: null,
              status: "NotStarted",
            });
          }
        }
      }
    }

    if (inc.agenda) {
      const sessions = await tx
        .select()
        .from(agendaSessionsTable)
        .where(eq(agendaSessionsTable.conveningId, sourceId));

      for (const s of sessions) {
        await tx.insert(agendaSessionsTable).values({
          conveningId: created.id,
          day: s.day,
          track: s.track,
          startTime: s.startTime,
          endTime: s.endTime,
          title: s.title,
          theme: s.theme,
          format: s.format,
          status: "Proposed",
          chairSpeakerId: null,
          sponsoredByEngagementId: null,
          isSponsored: s.isSponsored,
          description: s.description,
          targetSpeakers: s.targetSpeakers,
          order: s.order,
        });
      }
    }

    // Auto-add all verified Internal staff to the cloned convening too.
    const internalStaff = await tx
      .select({ id: portalUsersTable.id })
      .from(portalUsersTable)
      .where(and(
        eq(portalUsersTable.accountType, "Internal"),
        eq(portalUsersTable.emailVerified, true),
      ));
    for (const staff of internalStaff) {
      await tx
        .insert(conveningTeamMembersTable)
        .values({ conveningId: created.id, userId: staff.id, projectRole: "Staff", isLead: false })
        .onConflictDoNothing();
    }

    return created;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "A project with this slug already exists. Choose a different slug." });
      return;
    }
    throw err;
  }

  res.status(201).json(conv);
});

router.delete(
  "/convenings/:id",
  requirePermission("settings:manage"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    // Every table with an ON DELETE RESTRICT foreign key to convenings blocks a
    // hard delete. Count them all so we can return a clear 409 listing exactly
    // what still references the convening, instead of a raw FK 500.
    const countBy = async (
      table: { conveningId: PgColumn },
    ): Promise<number> => {
      const [{ n }] = await db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(table as never)
        .where(eq(table.conveningId, id));
      return Number(n);
    };

    const [
      partners, speakers, delegates, workstreams, tasks, sessions,
      budgetItems, milestones, pillars, exhibitors, booths,
      dealProjects, dealCommitments, commitments, providerBookings,
    ] = await Promise.all([
      countBy(engagementsTable),
      countBy(speakerEngagementsTable),
      countBy(delegatesTable),
      countBy(workstreamsTable),
      countBy(tasksTable),
      countBy(agendaSessionsTable),
      countBy(budgetsTable),
      countBy(milestonesTable),
      countBy(pillarsTable),
      countBy(exhibitorsTable),
      countBy(boothsTable),
      countBy(dealProjectsTable),
      countBy(dealCommitmentsTable),
      countBy(commitmentsTable),
      countBy(providerBookingsTable),
    ]);

    const counts = {
      partners, speakers, delegates, workstreams, tasks, sessions,
      budgetItems, milestones, pillars, exhibitors, booths,
      dealProjects, dealCommitments, commitments, providerBookings,
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0) {
      res.status(409).json({ error: "Convening has linked data and cannot be deleted", counts });
      return;
    }

    let deleted;
    try {
      // Cascade-only children (convening_access, team, invites, documents, …)
      // are removed by the database. conveningAccess is deleted explicitly to
      // keep behaviour identical to the previous implementation.
      deleted = await db.transaction(async (tx) => {
        await tx.delete(conveningAccessTable).where(eq(conveningAccessTable.conveningId, id));
        const [row] = await tx.delete(conveningsTable).where(eq(conveningsTable.id, id)).returning();
        return row;
      });
    } catch (err) {
      // A RESTRICT FK we did not count (or a race that inserted linked data)
      // must surface as a clean 409, never a raw 500.
      if (isForeignKeyViolation(err)) {
        res.status(409).json({ error: "Convening has linked data and cannot be deleted" });
        return;
      }
      throw err;
    }

    if (!deleted) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    void writeAudit({
      action: "Delete",
      entityType: "Convening",
      entityId: id,
      actorUserId: req.portalUser!.id,
      summary: `Deleted convening: ${deleted.name}`,
    });

    res.status(204).send();
  },
);

export default router;
