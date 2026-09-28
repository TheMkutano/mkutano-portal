import { Router, type IRouter, type Request, type Response } from "express";
import { requirePermission } from "../middlewares/requirePermission";
import { canAccessConvening } from "../middlewares/portalUserMiddleware";
import { buildExportData, recordSheetSync, GoogleSheetsNotConfiguredError } from "../lib/sheetsSync";
import { z } from "zod";

const router: IRouter = Router();

const ConveningIdSchema = z.object({ conveningId: z.string().min(1) });

const RecordSyncSchema = z.object({
  conveningId:    z.string().min(1),
  spreadsheetId:  z.string().min(1),
  spreadsheetUrl: z.string().min(1),
});

// GET /api/admin/sheets/export-data?conveningId=X
// Returns all tab data as JSON for the browser to POST to Apps Script.
// No rate-limit: this is a read-only DB query; the actual Google write happens in the browser.
router.get(
  "/admin/sheets/export-data",
  requirePermission("settings:manage"),
  async (req: Request, res: Response) => {
    const parsed = ConveningIdSchema.safeParse({ conveningId: req.query.conveningId });
    if (!parsed.success) {
      res.status(422).json({ error: "conveningId query param required" });
      return;
    }
    if (!canAccessConvening(req.portalUser!, parsed.data.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
    }
    try {
      const data = await buildExportData(parsed.data.conveningId);
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to build export data";
      res.status(502).json({ error: message });
    }
  },
);

// POST /api/admin/sheets/record-sync
// Called by the browser after a successful Apps Script POST to persist the result.
// The browser must only call this after verifying Apps Script wrote all expected tabs.
router.post(
  "/admin/sheets/record-sync",
  requirePermission("settings:manage"),
  async (req: Request, res: Response) => {
    const parsed = RecordSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }
    if (!canAccessConvening(req.portalUser!, parsed.data.conveningId)) {
      res.status(403).json({ error: "Forbidden: no access to this convening" }); return;
    }

    try {
      const { conveningId, spreadsheetId, spreadsheetUrl } = parsed.data;
      const result = await recordSheetSync(conveningId, req.portalUser!.id, spreadsheetId, spreadsheetUrl);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record sync";
      res.status(502).json({ error: message });
    }
  },
);

export { GoogleSheetsNotConfiguredError };
export default router;
