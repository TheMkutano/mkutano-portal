import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  db,
  usersTable,
  portalUsersTable,
  conveningAccessTable,
  inviteTokensTable,
} from "@workspace/db";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";
import { requirePermission } from "../middlewares/requirePermission";
import { writeAudit } from "../lib/audit";
import { sendInviteEmail, sendSignInLinkEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
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

// Rate limiter for sign-in link requests: 5 per IP per 15 min
const signinLinkAttempts = new Map<string, { count: number; resetAt: number }>();
function checkSignInRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const max = 5;
  const entry = signinLinkAttempts.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= max) return false;
    entry.count++;
  } else {
    signinLinkAttempts.set(ip, { count: 1, resetAt: now + window });
  }
  return true;
}

const VALID_ROLES = ["Admin", "Curator", "Finance", "PartnerLead", "SpeakerLead", "Ops", "PressManager", "Advisor", "Client"] as const;
const INTERNAL_DOMAINS = (process.env.INTERNAL_EMAIL_DOMAINS ?? "themkutano.com")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);

// ── POST /invites — Admin creates an invite and sends email ───────────────────

router.post("/invites", requirePermission("settings:manage"), async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(VALID_ROLES),
    conveningId: z.string().optional(),
    allowedSections: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, role, conveningId, allowedSections } = parsed.data;
  const isClient = role === "Client";

  if (isClient && !conveningId) {
    res.status(422).json({ errors: { conveningId: ["Convening is required for Client access."] } });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!isClient && !INTERNAL_DOMAINS.some((domain) => normalizedEmail.endsWith(`@${domain}`))) {
    res.status(422).json({
      errors: { email: ["Mkutano team members must use a @themkutano.com email address."] },
    });
    return;
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const [invite] = await db
    .insert(inviteTokensTable)
    .values({
      email: normalizedEmail,
      role,
      accountType: isClient ? "External" : "Internal",
      conveningId: conveningId ?? null,
      allowedSections: (isClient && allowedSections?.length ? allowedSections : null) as never,
      createdByUserId: req.portalUser!.id,
      expiresAt,
    })
    .returning();

  const inviteUrl = `${getOrigin(req)}/api/invites/accept?token=${invite.token}`;

  try {
    await sendInviteEmail({
      to: invite.email,
      inviteUrl,
      role,
      senderName: req.portalUser!.name,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send invite email");
    res.status(500).json({ error: "Invite created but email failed to send. Check RESEND_API_KEY." });
    return;
  }

  void writeAudit({
    actorUserId: req.portalUser!.id,
    action: "Create",
    entityType: "invite",
    entityId: invite.id,
    summary: `Invited ${invite.email} as ${role}`,
  });

  res.json({ success: true, inviteId: invite.id });
});

// ── GET /invites/accept?token= — Validate token, redirect to set-password page ─

router.get("/invites/accept", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  if (!token) {
    res.redirect("/?error=invalid_token");
    return;
  }

  const [invite] = await db
    .select()
    .from(inviteTokensTable)
    .where(and(eq(inviteTokensTable.token, token), isNull(inviteTokensTable.usedAt)));

  if (!invite || invite.expiresAt < new Date()) {
    res.redirect("/?error=expired_token");
    return;
  }

  // Check if this user already has a password set — skip to login
  const [existingAuthUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, invite.email));

  if (existingAuthUser) {
    const [existingPortalUser] = await db
      .select()
      .from(portalUsersTable)
      .where(eq(portalUsersTable.authUserId, String(existingAuthUser.id)));

    if (existingPortalUser?.passwordHash) {
      // Returning user — mark invite used and send to login
      await db
        .update(inviteTokensTable)
        .set({ usedAt: new Date() })
        .where(eq(inviteTokensTable.id, invite.id));
      res.redirect("/?notice=already_registered");
      return;
    }
  }

  // New user — redirect to the set-password page with the token
  res.redirect(`/set-password?token=${encodeURIComponent(token)}`);
});

// ── POST /invites/set-password — New user sets their password and activates ────

router.post("/invites/set-password", async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().min(1),
    name: z.string().min(1, "Full name is required").max(120),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  }).refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { token, password, name } = parsed.data;

  const [invite] = await db
    .select()
    .from(inviteTokensTable)
    .where(and(eq(inviteTokensTable.token, token), isNull(inviteTokensTable.usedAt)));

  if (!invite || invite.expiresAt < new Date()) {
    res.status(400).json({ error: "This invite link has expired or already been used." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Upsert auth user by email — use provided name parts
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? null;
  const lastName = nameParts.slice(1).join(" ") || null;

  const [dbUser] = await db
    .insert(usersTable)
    .values({ email: invite.email, firstName, lastName })
    .onConflictDoUpdate({ target: usersTable.email, set: { firstName, lastName, updatedAt: new Date() } })
    .returning();

  // Upsert portal user with password hash and full name
  const [existingPortalUser] = await db
    .select()
    .from(portalUsersTable)
    .where(eq(portalUsersTable.authUserId, String(dbUser.id)));

  let portalUserId: string;
  if (existingPortalUser) {
    await db
      .update(portalUsersTable)
      .set({ name: name.trim(), role: invite.role, accountType: invite.accountType, email: invite.email, passwordHash })
      .where(eq(portalUsersTable.id, existingPortalUser.id));
    portalUserId = existingPortalUser.id;
  } else {
    const [created] = await db
      .insert(portalUsersTable)
      .values({
        authUserId: String(dbUser.id),
        name: name.trim(),
        email: invite.email,
        role: invite.role,
        accountType: invite.accountType,
        passwordHash,
      })
      .returning();
    portalUserId = created.id;
  }

  // Add convening access for external/client users
  if (invite.conveningId && invite.accountType === "External") {
    const [existing] = await db
      .select()
      .from(conveningAccessTable)
      .where(
        and(
          eq(conveningAccessTable.userId, portalUserId),
          eq(conveningAccessTable.conveningId, invite.conveningId),
        ),
      );
    if (!existing) {
      await db.insert(conveningAccessTable).values({
        userId: portalUserId,
        conveningId: invite.conveningId,
        allowedSections: invite.allowedSections ?? null,
      });
    }
  }

  // Mark invite as used
  await db
    .update(inviteTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(inviteTokensTable.id, invite.id));

  // Create session — user is now logged in
  const sessionData: SessionData = {
    user: {
      id: String(dbUser.id),
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: "password",
  };

  const sid = await createSession(sessionData);
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
  res.json({ success: true });
});

// ── POST /invites/request-signin — Returning user requests a fresh link ───────

router.post("/invites/request-signin", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  const allowed = checkSignInRateLimit(ip);

  // Always respond success — don't reveal whether email exists
  res.json({ success: true });

  if (!allowed) return;

  const { email } = req.body ?? {};
  if (typeof email !== "string" || !email) return;

  void (async () => {
    const normalizedEmail = email.toLowerCase().trim();

    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail));
    if (!dbUser) return;

    const [portalUser] = await db
      .select()
      .from(portalUsersTable)
      .where(eq(portalUsersTable.authUserId, String(dbUser.id)));
    if (!portalUser) return;

    // Get their convening access if client
    const accessRows = await db
      .select()
      .from(conveningAccessTable)
      .where(eq(conveningAccessTable.userId, portalUser.id));
    const conveningId = accessRows[0]?.conveningId ?? null;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const [invite] = await db
      .insert(inviteTokensTable)
      .values({
        email: normalizedEmail,
        role: portalUser.role,
        accountType: portalUser.accountType,
        conveningId,
        createdByUserId: portalUser.id,
        expiresAt,
      })
      .returning();

    const origin = `https://${req.headers["x-forwarded-host"] || req.headers["host"] || "localhost"}`;
    const signInUrl = `${origin}/api/invites/accept?token=${invite.token}`;

    await sendSignInLinkEmail({ to: normalizedEmail, signInUrl });
  })().catch((err) => logger.error({ err }, "Failed to send sign-in link"));
});

// ── GET /invites — Admin: list all sent invites ───────────────────────────────

router.get("/invites", requirePermission("settings:manage"), async (req: Request, res: Response) => {
  const invites = await db
    .select()
    .from(inviteTokensTable)
    .orderBy(desc(inviteTokensTable.createdAt));
  res.json(invites);
});

// ── POST /invites/:id/resend — Admin: extend expiry and resend invite email ───

router.post("/invites/:id/resend", requirePermission("settings:manage"), async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const [invite] = await db
    .select()
    .from(inviteTokensTable)
    .where(eq(inviteTokensTable.id, id));

  if (!invite) {
    res.status(404).json({ error: "Invite not found." });
    return;
  }

  if (invite.usedAt) {
    res.status(409).json({ error: "This invite has already been used and cannot be resent." });
    return;
  }

  const newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const [updated] = await db
    .update(inviteTokensTable)
    .set({ expiresAt: newExpiresAt })
    .where(eq(inviteTokensTable.id, id))
    .returning();

  const inviteUrl = `${getOrigin(req)}/api/invites/accept?token=${updated.token}`;

  try {
    await sendInviteEmail({
      to: updated.email,
      inviteUrl,
      role: updated.role,
      senderName: req.portalUser!.name,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to resend invite email");
    res.status(500).json({ error: "Failed to resend. Check RESEND_API_KEY." });
    return;
  }

  void writeAudit({
    actorUserId: req.portalUser!.id,
    action: "Update",
    entityType: "invite",
    entityId: id,
    summary: `Resent invite to ${updated.email}`,
  });

  res.json({ success: true });
});

export default router;
