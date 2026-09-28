import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, usersTable, portalUsersTable } from "@workspace/db";
import { createSession, SESSION_COOKIE, SESSION_TTL, type SessionData } from "../lib/auth";

const router: IRouter = Router();

async function hasAnyUsers(): Promise<boolean> {
  const [row] = await db.select({ id: portalUsersTable.id }).from(portalUsersTable).limit(1);
  return !!row;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

/**
 * GET /setup/status
 * Returns whether first-run setup is required (no portal users exist yet).
 * Public endpoint — no auth required.
 */
router.get("/setup/status", async (_req: Request, res: Response) => {
  const ready = await hasAnyUsers();
  res.json({ needsSetup: !ready });
});

const setupSchema = z.object({
  name: z.string().min(1, "Full name is required").max(120),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

/**
 * POST /setup
 * Creates the first Admin account. Permanently disabled once any portal user exists.
 */
router.post("/setup", async (req: Request, res: Response) => {
  if (await hasAnyUsers()) {
    res.status(403).json({ error: "Setup is already complete. Use the invite flow to add users." });
    return;
  }

  const parse = setupSchema.safeParse(req.body);
  if (!parse.success) {
    const errors: Record<string, string> = {};
    for (const issue of parse.error.issues) {
      const key = issue.path.join(".") || "root";
      if (!errors[key]) errors[key] = issue.message;
    }
    res.status(422).json({ errors });
    return;
  }

  const { name, email, password } = parse.data;
  const passwordHash = await bcrypt.hash(password, 12);

  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? name;
  const lastName = nameParts.slice(1).join(" ") || "";

  const [authUser] = await db
    .insert(usersTable)
    .values({ email, firstName, lastName })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { firstName, lastName },
    })
    .returning();

  const [portalUser] = await db
    .insert(portalUsersTable)
    .values({
      authUserId: authUser.id,
      name,
      email,
      passwordHash,
      role: "Admin",
      accountType: "Internal",
    })
    .onConflictDoUpdate({
      target: portalUsersTable.authUserId,
      set: { name, email, passwordHash, role: "Admin", accountType: "Internal" },
    })
    .returning();

  const sessionData: SessionData = {
    user: {
      id: authUser.id,
      email: authUser.email,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      profileImageUrl: authUser.profileImageUrl,
    },
    access_token: "",
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  res.status(201).json({ success: true, userId: portalUser.id });
});

export default router;
