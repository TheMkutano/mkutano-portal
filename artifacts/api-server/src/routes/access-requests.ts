import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { eq, desc } from "drizzle-orm";
import { db, accessRequestsTable, inviteTokensTable, portalUsersTable } from "@workspace/db";
import { requirePermission } from "../middlewares/requirePermission";
import { writeAudit } from "../lib/audit";
import { sendAccessRequestNotification, sendInviteEmail } from "../lib/email";

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? "info@themkutano.com";

// Rate limiter: 5 requests per IP per hour
const requestAttempts = new Map<string, { count: number; resetAt: number }>();
function checkRequestRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = 60 * 60 * 1000;
  const max = 5;
  const entry = requestAttempts.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= max) return false;
    entry.count++;
  } else {
    requestAttempts.set(ip, { count: 1, resetAt: now + window });
  }
  return true;
}

// ── POST /auth/request-access — Public: external partners request access ──────

router.post("/auth/request-access", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  if (!checkRequestRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  const schema = z.object({
    name: z.string().min(1, "Name is required").max(120),
    email: z.string().email("Valid email is required"),
    organization: z.string().max(200).optional(),
    message: z.string().max(1000).optional(),
    conveningId: z.string().optional(),
    conveningName: z.string().max(200).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, email, organization, message, conveningId, conveningName } = parsed.data;

  const [request] = await db.insert(accessRequestsTable).values({
    name,
    email: email.toLowerCase().trim(),
    organization: organization ?? null,
    message: message ?? null,
    requestedConveningId: conveningId ?? null,
    requestedConveningName: conveningName ?? null,
    status: "Pending",
  }).returning();

  try {
    await sendAccessRequestNotification({
      adminEmail: ADMIN_NOTIFY_EMAIL,
      requesterName: name,
      requesterEmail: email,
      organization,
      message,
      conveningName,
    });
  } catch (err) {
    // Non-fatal — request is stored even if email fails
    req.log.error({ err }, "Failed to notify admin of access request");
  }

  req.log.info({ requestId: request.id, email }, "Access request submitted");
  res.json({ success: true });
});

// ── GET /access-requests — Admin: list all requests ───────────────────────────

router.get("/access-requests", requirePermission("settings:manage"), async (req: Request, res: Response) => {
  const requests = await db.select().from(accessRequestsTable).orderBy(desc(accessRequestsTable.createdAt));
  res.json(requests);
});

// ── PATCH /access-requests/:id/approve — Admin: approve with convening + sections ──

router.patch("/access-requests/:id/approve", requirePermission("settings:manage"), async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const schema = z.object({
    conveningId: z.string().min(1, "Convening is required"),
    allowedSections: z.array(z.string()).min(1, "At least one section must be granted"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { conveningId, allowedSections } = parsed.data;

  const [request] = await db.select().from(accessRequestsTable).where(eq(accessRequestsTable.id, id));
  if (!request) {
    res.status(404).json({ error: "Access request not found." });
    return;
  }

  if (request.status !== "Pending") {
    res.status(409).json({ error: "This request has already been processed." });
    return;
  }

  // Create an invite token for the external user
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const [invite] = await db.insert(inviteTokensTable).values({
    email: request.email,
    role: "Client",
    accountType: "External",
    conveningId,
    allowedSections: allowedSections as never,
    createdByUserId: req.portalUser!.id,
    expiresAt,
  }).returning();

  // Mark request as approved
  await db.update(accessRequestsTable)
    .set({ status: "Approved" })
    .where(eq(accessRequestsTable.id, id));

  const inviteUrl = `${getOrigin(req)}/api/invites/accept?token=${invite.token}`;

  try {
    await sendInviteEmail({
      to: request.email,
      inviteUrl,
      role: "Client",
      senderName: req.portalUser!.name,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send access-granted invite email");
    res.status(500).json({ error: "Approved but email failed to send. Check RESEND_API_KEY." });
    return;
  }

  void writeAudit({
    actorUserId: req.portalUser!.id,
    action: "Update",
    entityType: "access_request",
    entityId: id,
    summary: `Approved access request from ${request.email} for convening ${conveningId}`,
  });

  res.json({ success: true });
});

// ── PATCH /access-requests/:id/reject — Admin: reject request ─────────────────

router.patch("/access-requests/:id/reject", requirePermission("settings:manage"), async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const [request] = await db.select().from(accessRequestsTable).where(eq(accessRequestsTable.id, id));
  if (!request) {
    res.status(404).json({ error: "Access request not found." });
    return;
  }

  await db.update(accessRequestsTable)
    .set({ status: "Rejected" })
    .where(eq(accessRequestsTable.id, id));

  void writeAudit({
    actorUserId: req.portalUser!.id,
    action: "Update",
    entityType: "access_request",
    entityId: id,
    summary: `Rejected access request from ${request.email}`,
  });

  res.json({ success: true });
});

export default router;
