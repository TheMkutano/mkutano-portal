import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { portalUsersTable, conveningAccessTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/me", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const authUserId = req.user.id;

  const [portalUser] = await db
    .select()
    .from(portalUsersTable)
    .where(eq(portalUsersTable.authUserId, authUserId));

  // ADMIN_EMAILS: specific emails always promoted to Admin
  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  // ADMIN_DOMAINS: all users on these domains are promoted to Admin.
  const adminDomains = (process.env.ADMIN_DOMAINS ?? "themkutano.com")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  if (!portalUser) {
    // Bootstrap: if no portal users exist at all, auto-create the first authenticated user as Admin
    const [existingUser] = await db.select().from(portalUsersTable).limit(1);
    if (!existingUser) {
      const name = (req.user as { name?: string; username?: string }).name
        ?? (req.user as { name?: string; username?: string }).username
        ?? "Admin";
      const [newUser] = await db.insert(portalUsersTable).values({
        authUserId,
        name,
        role: "Admin",
        accountType: "Internal",
      }).returning();
      req.log.info({ authUserId, userId: newUser.id }, "Bootstrapped first admin user");
      res.json({
        id: newUser.id,
        authUserId: newUser.authUserId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        accountType: newUser.accountType,
        conveningIds: [],
        createdAt: newUser.createdAt,
      });
      return;
    }
    res.status(404).json({ error: "No portal profile found. Request access from an Admin." });
    return;
  }

  // Auto-promote to Admin if email matches ADMIN_EMAILS or ADMIN_DOMAINS
  const userEmail = (portalUser.email ?? "").toLowerCase();
  const emailParts = userEmail.split("@");
  const userDomain = emailParts.length === 2 ? emailParts[1] : "";
  const shouldBeAdmin =
    portalUser.role !== "Admin" &&
    userEmail &&
    (adminEmails.has(userEmail) || adminDomains.includes(userDomain));
  if (shouldBeAdmin) {
    await db
      .update(portalUsersTable)
      .set({ role: "Admin" })
      .where(eq(portalUsersTable.id, portalUser.id));
    portalUser.role = "Admin";
    req.log.info({ userId: portalUser.id, email: userEmail }, "Auto-promoted user to Admin via domain/email rule");
  }

  const accessRows = await db
    .select()
    .from(conveningAccessTable)
    .where(eq(conveningAccessTable.userId, portalUser.id));

  const conveningIds = accessRows.map((r) => r.conveningId);
  const conveningAccess = accessRows.map((r) => ({
    conveningId: r.conveningId,
    allowedSections: (r.allowedSections as string[] | null) ?? null,
  }));

  res.json({
    id: portalUser.id,
    authUserId: portalUser.authUserId,
    name: portalUser.name,
    email: portalUser.email,
    role: portalUser.role,
    accountType: portalUser.accountType,
    conveningIds,
    conveningAccess,
    createdAt: portalUser.createdAt,
  });
});

export default router;
