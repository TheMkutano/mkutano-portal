import { type Request, type Response, type NextFunction } from "express";
import { hasPermission, type Permission } from "../lib/permissions";
import { canAccessConvening } from "./portalUserMiddleware";

/**
 * Enforces that the authenticated portal user holds the given permission.
 * Must be placed after authMiddleware + portalUserMiddleware.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!req.portalUser) {
      res.status(403).json({ error: "No portal profile. Request access from an Admin." });
      return;
    }
    if (!hasPermission(req.portalUser.role, permission)) {
      res.status(403).json({ error: `Forbidden: requires ${permission}` });
      return;
    }
    next();
  };
}

/**
 * Enforces that the authenticated portal user holds at least one of the given
 * permissions. Use this for endpoints that intentionally allow multiple capability
 * paths (e.g. budget:export OR delegates:export).
 */
export function requireAnyPermission(permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!req.portalUser) {
      res.status(403).json({ error: "No portal profile. Request access from an Admin." });
      return;
    }
    const ok = permissions.some(p => hasPermission(req.portalUser!.role, p));
    if (!ok) {
      res.status(403).json({ error: `Forbidden: requires one of ${permissions.join(", ")}` });
      return;
    }
    next();
  };
}

/**
 * Tenant-isolation guard for convening-scoped endpoints.
 * Reads conveningId from query, params, and body. If more than one of those
 * sources supplies a conveningId, they must all match — otherwise the request
 * is rejected, so a caller cannot pass an authorized id in one source while a
 * different (unauthorized) id is actually used by the route handler.
 * Rejects External/Client users who don't have access to the resolved convening.
 */
export function requireConveningAccess() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const portalUser = req.portalUser;

    const candidates = [
      req.query.conveningId as string | undefined,
      req.params.conveningId ? String(req.params.conveningId) : undefined,
      (req.body?.conveningId as string | undefined) ?? undefined,
    ].filter((v): v is string => Boolean(v));

    const uniqueIds = new Set(candidates);
    if (uniqueIds.size > 1) {
      res.status(400).json({ error: "Conflicting conveningId values across request" });
      return;
    }

    if (!portalUser) { next(); return; }

    // Internal users have unrestricted access
    if (portalUser.accountType === "Internal") { next(); return; }

    const conveningId = candidates[0];
    if (!conveningId) { next(); return; }

    if (!canAccessConvening(portalUser, conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" });
      return;
    }
    next();
  };
}
