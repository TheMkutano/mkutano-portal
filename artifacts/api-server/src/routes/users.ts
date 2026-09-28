import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { portalUsersTable, conveningAccessTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/users", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const users = await db.select().from(portalUsersTable);

  const allAccess = await db.select().from(conveningAccessTable);
  const accessByUser = new Map<string, string[]>();
  for (const row of allAccess) {
    const existing = accessByUser.get(row.userId) ?? [];
    existing.push(row.conveningId);
    accessByUser.set(row.userId, existing);
  }

  const result = users.map((u) => ({
    ...u,
    conveningIds: accessByUser.get(u.id) ?? [],
  }));

  res.json(result);
});

router.post("/users", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { authUserId, name, email, role, accountType, conveningIds } = req.body;

  if (!authUserId || !name) {
    res.status(400).json({ error: "authUserId and name are required" });
    return;
  }

  const [created] = await db
    .insert(portalUsersTable)
    .values({ authUserId, name, email, role, accountType })
    .returning();

  if (conveningIds && conveningIds.length > 0) {
    await db.insert(conveningAccessTable).values(
      conveningIds.map((cId: string) => ({ userId: created.id, conveningId: cId })),
    );
  }

  res.status(201).json({ ...created, conveningIds: conveningIds ?? [] });
});

router.patch("/users/:id", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, email, role, accountType, conveningIds } = req.body;

  const [updated] = await db
    .update(portalUsersTable)
    .set({ name, email, role, accountType })
    .where(eq(portalUsersTable.id, String(req.params.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (conveningIds !== undefined) {
    await db.delete(conveningAccessTable).where(eq(conveningAccessTable.userId, String(req.params.id)));
    if (conveningIds.length > 0) {
      await db.insert(conveningAccessTable).values(
        conveningIds.map((cId: string) => ({ userId: String(req.params.id), conveningId: cId })),
      );
    }
  }

  const accessRows = await db
    .select()
    .from(conveningAccessTable)
    .where(eq(conveningAccessTable.userId, String(req.params.id)));

  res.json({ ...updated, conveningIds: accessRows.map((r) => r.conveningId) });
});

export default router;
