import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { portalUsersTable, conveningAccessTable } from "@workspace/db";
import type { PortalUser } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface PortalUserWithAccess extends PortalUser {
  conveningIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      portalUser?: PortalUserWithAccess;
    }
  }
}

export async function portalUserMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.isAuthenticated()) {
    next();
    return;
  }

  try {
    const [portalUser] = await db
      .select()
      .from(portalUsersTable)
      .where(eq(portalUsersTable.authUserId, req.user.id))
      .limit(1);

    if (portalUser) {
      const accessRows = await db
        .select({ conveningId: conveningAccessTable.conveningId })
        .from(conveningAccessTable)
        .where(eq(conveningAccessTable.userId, portalUser.id));

      req.portalUser = {
        ...portalUser,
        conveningIds: accessRows.map((r) => r.conveningId),
      };
    }
  } catch (err) {
    // non-fatal — routes still require isAuthenticated()
  }

  next();
}

/**
 * Returns true if the portal user can access a given convening.
 * Internal users see all. External/Client users only see their assigned conveningIds.
 */
export function canAccessConvening(
  portalUser: PortalUserWithAccess,
  conveningId: string,
): boolean {
  if (portalUser.accountType === "Internal") return true;
  return portalUser.conveningIds.includes(conveningId);
}
