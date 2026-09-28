import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sponsorshipPackagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireAnyPermission, requireConveningAccess } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

router.get(
  "/sponsorship-packages",
  requirePermission("partners:read"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    if (!conveningId) { res.status(400).json({ error: "conveningId is required" }); return; }
    const rows = await db.select().from(sponsorshipPackagesTable)
      .where(eq(sponsorshipPackagesTable.conveningId, String(conveningId)));
    res.json(rows);
  },
);

router.post(
  "/sponsorship-packages",
  requireAnyPermission(["budget:write", "partners:write"]),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId, tier, price, slots, description, perks } = req.body;
    if (!conveningId || !tier) { res.status(400).json({ error: "conveningId and tier are required" }); return; }
    const [row] = await db.insert(sponsorshipPackagesTable)
      .values({ conveningId, tier, price: price ?? 0, slots: slots ?? 0, description, perks: perks ?? [] })
      .returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Create",
      entityType: "SponsorshipPackage",
      entityId: row.id,
      summary: `Created sponsorship package ${row.tier}`,
      after: row,
    });
    res.status(201).json(row);
  },
);

router.patch(
  "/sponsorship-packages/:id",
  requireAnyPermission(["budget:write", "partners:write"]),
  async (req: Request, res: Response) => {
    const [before] = await db.select().from(sponsorshipPackagesTable)
      .where(eq(sponsorshipPackagesTable.id, String(req.params.id)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    if (req.portalUser && req.portalUser.accountType !== "Internal" &&
        !canAccessConvening(req.portalUser, before.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" });
      return;
    }

    const { tier, price, slots, description, perks } = req.body;
    const [row] = await db.update(sponsorshipPackagesTable)
      .set({ tier, price, slots, description, perks })
      .where(eq(sponsorshipPackagesTable.id, String(req.params.id)))
      .returning();
    void writeAudit({
      conveningId: row.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Update",
      entityType: "SponsorshipPackage",
      entityId: row.id,
      summary: `Updated sponsorship package ${row.tier}`,
      before,
      after: row,
    });
    res.json(row);
  },
);

router.delete(
  "/sponsorship-packages/:id",
  requireAnyPermission(["budget:write", "partners:write"]),
  async (req: Request, res: Response) => {
    const [before] = await db.select().from(sponsorshipPackagesTable)
      .where(eq(sponsorshipPackagesTable.id, String(req.params.id)));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    if (req.portalUser && req.portalUser.accountType !== "Internal" &&
        !canAccessConvening(req.portalUser, before.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" });
      return;
    }

    await db.delete(sponsorshipPackagesTable).where(eq(sponsorshipPackagesTable.id, String(req.params.id)));
    void writeAudit({
      conveningId: before.conveningId,
      actorUserId: req.portalUser!.id,
      action: "Delete",
      entityType: "SponsorshipPackage",
      entityId: before.id,
      summary: `Deleted sponsorship package ${before.tier}`,
      before,
    });
    res.status(204).end();
  },
);

export default router;
