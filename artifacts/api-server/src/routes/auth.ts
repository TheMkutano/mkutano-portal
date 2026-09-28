import * as oidc from "openid-client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod/v4";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { sendEmailVerificationEmail, sendPasswordResetEmail } from "../lib/email";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { db, usersTable, portalUsersTable, conveningsTable, conveningTeamMembersTable } from "@workspace/db";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

// Rate limiter: max 10 password-login attempts per IP per 15 minutes
const passwordLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkPasswordRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const max = 10;
  const entry = passwordLoginAttempts.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= max) return false;
    entry.count++;
  } else {
    passwordLoginAttempts.set(ip, { count: 1, resetAt: now + window });
  }
  return true;
}

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

const REMEMBER_ME_TTL = 30 * 24 * 60 * 60 * 1000;

function setSessionCookie(res: Response, sid: string, rememberMe = false) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: rememberMe ? REMEMBER_ME_TTL : SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: (claims.email as string) || null,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.post("/auth/password-login", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  if (!checkPasswordRateLimit(ip)) {
    res.status(429).json({ error: "Too many attempts. Please try again later." });
    return;
  }

  const { email, password, rememberMe } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Look up the auth user by email
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (!dbUser) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  // Look up portal user for the password hash
  const [portalUser] = await db
    .select()
    .from(portalUsersTable)
    .where(eq(portalUsersTable.authUserId, String(dbUser.id)));

  if (!portalUser?.passwordHash) {
    // User exists but has no password set — they must use the email link
    res.status(401).json({ error: "No password set for this account. Use the email link to sign in." });
    return;
  }

  const match = await bcrypt.compare(password, portalUser.passwordHash);
  if (!match) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: "password",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid, rememberMe === true);
  res.json({ success: true });
});

// ── Self-registration for internal domain users ───────────────────────────────

const INTERNAL_DOMAINS: string[] = (process.env.INTERNAL_EMAIL_DOMAINS ?? "themkutano.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function isInternalEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return INTERNAL_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

const registrationAttempts = new Map<string, { count: number; resetAt: number }>();
function checkRegistrationRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const max = 5;
  const entry = registrationAttempts.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= max) return false;
    entry.count++;
  } else {
    registrationAttempts.set(ip, { count: 1, resetAt: now + window });
  }
  return true;
}

router.post("/auth/register", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  if (!checkRegistrationRateLimit(ip)) {
    res.status(429).json({ error: "Too many registration attempts. Please try again later." });
    return;
  }

  const schema = z.object({
    name: z.string().min(1, "Full name is required").max(120),
    email: z.string().email().refine(
      (e) => isInternalEmail(e),
      { message: `Only Mkutano staff email addresses can self-register. External partners should request access.` },
    ),
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

  const { email, password, name } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Check if an active portal account already exists for this email
  const [existingAuthUser] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existingAuthUser) {
    const [existingPortal] = await db.select().from(portalUsersTable)
      .where(eq(portalUsersTable.authUserId, String(existingAuthUser.id)));
    if (existingPortal?.emailVerified) {
      res.status(409).json({ error: "An account with this email already exists. Please sign in." });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? null;
  const lastName = nameParts.slice(1).join(" ") || null;

  const [dbUser] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, firstName, lastName })
    .onConflictDoUpdate({ target: usersTable.email, set: { firstName, lastName, updatedAt: new Date() } })
    .returning();

  const verificationToken = crypto.randomUUID();
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [existingPortal] = await db.select().from(portalUsersTable)
    .where(eq(portalUsersTable.authUserId, String(dbUser.id)));

  if (existingPortal) {
    await db.update(portalUsersTable).set({
      name,
      passwordHash,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: verificationExpiry,
    }).where(eq(portalUsersTable.id, existingPortal.id));
  } else {
    await db.insert(portalUsersTable).values({
      authUserId: String(dbUser.id),
      name,
      email: normalizedEmail,
      role: "Curator",
      accountType: "Internal",
      passwordHash,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: verificationExpiry,
    });
  }

  const verifyUrl = `${getOrigin(req)}/api/auth/verify-email?token=${verificationToken}`;
  try {
    await sendEmailVerificationEmail({ to: normalizedEmail, name, verifyUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to send verification email");
  }

  res.json({ success: true });
});

router.get("/auth/verify-email", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  if (!token) {
    res.redirect("/?error=invalid_token");
    return;
  }

  const [portalUser] = await db.select().from(portalUsersTable)
    .where(eq(portalUsersTable.emailVerificationToken, token));

  if (!portalUser) {
    res.redirect("/?error=invalid_token");
    return;
  }

  if (portalUser.emailVerificationExpiry && portalUser.emailVerificationExpiry < new Date()) {
    res.redirect("/?error=expired_token");
    return;
  }

  await db.update(portalUsersTable).set({
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
  }).where(eq(portalUsersTable.id, portalUser.id));

  // Auto-add verified Internal staff to every convening so they appear
  // in the task-assignee dropdown immediately after confirming their account.
  if (portalUser.accountType === "Internal") {
    const allConvenings = await db.select({ id: conveningsTable.id }).from(conveningsTable);
    for (const conv of allConvenings) {
      await db
        .insert(conveningTeamMembersTable)
        .values({ conveningId: conv.id, userId: portalUser.id, projectRole: "Staff", isLead: false })
        .onConflictDoNothing();
    }
  }

  const [dbUser] = await db.select().from(usersTable)
    .where(eq(usersTable.id, portalUser.authUserId));

  if (!dbUser) {
    res.redirect("/?error=invalid_token");
    return;
  }

  const sid = await createSession({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: "password",
  });
  setSessionCookie(res, sid);
  res.redirect("/");
});

// ── Forgot password ───────────────────────────────────────────────────────────

const forgotPasswordAttempts = new Map<string, { count: number; resetAt: number }>();
function checkForgotPasswordRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const max = 5;
  const entry = forgotPasswordAttempts.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= max) return false;
    entry.count++;
  } else {
    forgotPasswordAttempts.set(ip, { count: 1, resetAt: now + window });
  }
  return true;
}

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  if (!checkForgotPasswordRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  const { email } = req.body ?? {};
  if (typeof email !== "string" || !email) {
    res.status(400).json({ error: "Email is required." });
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();

  // Always respond with success to prevent user enumeration
  res.json({ success: true });

  // Do the work asynchronously after responding
  try {
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (!dbUser) return;

    const [portalUser] = await db.select().from(portalUsersTable)
      .where(eq(portalUsersTable.authUserId, String(dbUser.id)));
    if (!portalUser?.passwordHash) return; // no password account

    const resetToken = crypto.randomUUID();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.update(portalUsersTable).set({
      passwordResetToken: resetToken,
      passwordResetExpiry: resetExpiry,
    }).where(eq(portalUsersTable.id, portalUser.id));

    const resetUrl = `${getOrigin(req)}/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail({ to: normalizedEmail, resetUrl });
  } catch (err) {
    req.log.error({ err }, "Error in forgot-password flow");
  }
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().min(1),
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

  const { token, password } = parsed.data;

  const [portalUser] = await db.select().from(portalUsersTable)
    .where(eq(portalUsersTable.passwordResetToken, token));

  if (!portalUser) {
    res.status(400).json({ error: "That reset link is invalid or has already been used." });
    return;
  }

  if (portalUser.passwordResetExpiry && portalUser.passwordResetExpiry < new Date()) {
    res.status(400).json({ error: "That reset link has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.update(portalUsersTable).set({
    passwordHash,
    passwordResetToken: null,
    passwordResetExpiry: null,
  }).where(eq(portalUsersTable.id, portalUser.id));

  req.log.info({ userId: portalUser.id }, "Password reset successfully");
  res.json({ success: true });
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  const session = sid ? await getSession(sid) : null;
  await clearSession(res, sid);

  // Password/invite sessions don't have an OIDC session — just redirect home
  if (session?.access_token === "password" || session?.access_token === "invite") {
    res.redirect("/");
    return;
  }

  const config = await getOidcConfig();
  const origin = getOrigin(req);
  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: origin,
  });
  res.redirect(endSessionUrl.href);
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
