import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { passTypeConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requirePermission, requireConveningAccess } from "../middlewares/requirePermission.js";
import { canAccessConvening } from "../middlewares/portalUserMiddleware.js";
import { writeAudit } from "../lib/audit.js";

const router: IRouter = Router();

router.get(
  "/pass-type-configs",
  requirePermission("passTypes:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId } = req.query;
    if (!conveningId) { res.status(400).json({ error: "conveningId is required" }); return; }
    const rows = await db.select().from(passTypeConfigsTable)
      .where(eq(passTypeConfigsTable.conveningId, String(conveningId)));
    res.json(rows);
  },
);

router.post(
  "/pass-type-configs",
  requirePermission("passTypes:write"),
  requireConveningAccess(),
  async (req: Request, res: Response) => {
    const { conveningId, passType, label, price, capacity, description } = req.body;
    if (!conveningId || !passType || !label) { res.status(400).json({ error: "conveningId, passType and label are required" }); return; }
    const [row] = await db.insert(passTypeConfigsTable)
      .values({ conveningId, passType, label, price: price ?? 0, capacity: capacity ?? 0, description })
      .returning();
    void writeAudit({ actorUserId: req.portalUser!.id, action: "Create", entityType: "PassTypeConfig", entityId: row.id, conveningId });
    res.status(201).json(row);
  },
);

const copyFromSchema = z.object({
  sourceConveningId: z.string().min(1),
  targetConveningId: z.string().min(1),
});

router.post("/pass-type-configs/copy-from", requirePermission("passTypes:write"), async (req: Request, res: Response) => {
  const parsed = copyFromSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { sourceConveningId, targetConveningId } = parsed.data;

  if (sourceConveningId === targetConveningId) {
    res.status(400).json({ error: "Source and target convening must be different" });
    return;
  }

  // Tenant isolation: verify access to BOTH source and target convenings
  if (req.portalUser && req.portalUser.accountType !== "Internal") {
    if (!canAccessConvening(req.portalUser, sourceConveningId) ||
        !canAccessConvening(req.portalUser, targetConveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" });
      return;
    }
  }

  const sourceConfigs = await db.select().from(passTypeConfigsTable)
    .where(eq(passTypeConfigsTable.conveningId, sourceConveningId));

  if (sourceConfigs.length === 0) {
    res.json([]);
    return;
  }

  const results = await db.transaction(async (tx) => {
    const targetConfigs = await tx.select().from(passTypeConfigsTable)
      .where(eq(passTypeConfigsTable.conveningId, targetConveningId));

    const targetByPassType = new Map(targetConfigs.map(c => [c.passType, c]));

    const out: typeof sourceConfigs = [];

    for (const src of sourceConfigs) {
      const existing = targetByPassType.get(src.passType);
      if (existing) {
        const [updated] = await tx.update(passTypeConfigsTable)
          .set({ label: src.label, price: src.price, capacity: src.capacity, description: src.description })
          .where(and(eq(passTypeConfigsTable.id, existing.id), eq(passTypeConfigsTable.conveningId, targetConveningId)))
          .returning();
        if (updated) out.push(updated);
      } else {
        const [created] = await tx.insert(passTypeConfigsTable)
          .values({
            conveningId: targetConveningId,
            passType:    src.passType,
            label:       src.label,
            price:       src.price,
            capacity:    src.capacity,
            description: src.description,
          })
          .returning();
        if (created) out.push(created);
      }
    }

    return out;
  });

  void writeAudit({
    actorUserId: req.portalUser!.id,
    action:      "Update",
    entityType:  "PassTypeConfig",
    entityId:    targetConveningId,
    conveningId: targetConveningId,
    summary:     `Copied ${results.length} pass type config(s) from convening ${sourceConveningId}`,
  });

  res.json(results);
});

router.patch("/pass-type-configs/:id", requirePermission("passTypes:write"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(passTypeConfigsTable).where(eq(passTypeConfigsTable.id, id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  if (req.portalUser && req.portalUser.accountType !== "Internal" &&
      !canAccessConvening(req.portalUser, before.conveningId)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" });
    return;
  }

  const { passType, label, price, capacity, description } = req.body;
  const [row] = await db.update(passTypeConfigsTable)
    .set({ passType, label, price, capacity, description })
    .where(eq(passTypeConfigsTable.id, id))
    .returning();
  void writeAudit({ actorUserId: req.portalUser!.id, action: "Update", entityType: "PassTypeConfig", entityId: row.id, conveningId: row.conveningId });
  res.json(row);
});

router.delete("/pass-type-configs/:id", requirePermission("passTypes:write"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(passTypeConfigsTable).where(eq(passTypeConfigsTable.id, id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  if (req.portalUser && req.portalUser.accountType !== "Internal" &&
      !canAccessConvening(req.portalUser, before.conveningId)) {
    res.status(403).json({ error: "Forbidden: no access to this convening" });
    return;
  }

  await db.delete(passTypeConfigsTable).where(eq(passTypeConfigsTable.id, id));
  void writeAudit({ actorUserId: req.portalUser!.id, action: "Delete", entityType: "PassTypeConfig", entityId: id, conveningId: before.conveningId });
  res.status(204).end();
});

export default router;
