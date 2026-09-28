/**
 * Google Sheets client via Apps Script web app.
 * The Apps Script is deployed as a public web app that accepts POST requests
 * and writes data to the bound Google Sheet.
 *
 * Set GOOGLE_APPS_SCRIPT_URL to the deployed web app exec URL.
 */

export class GoogleSheetsNotConfiguredError extends Error {
  constructor(cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause ?? "");
    super(
      "Google Sheets integration is not configured. " +
      "Set GOOGLE_APPS_SCRIPT_URL to the deployed Apps Script exec URL." +
      (detail ? ` (${detail})` : ""),
    );
    this.name = "GoogleSheetsNotConfiguredError";
  }
}

export interface AppsScriptResponse {
  ok: boolean;
  written?: number;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  error?: string;
}

/**
 * POST a payload to the Apps Script web app.
 * The script is deployed as "Execute as: Me, Who has access: Anyone",
 * so no auth header is required — the exec URL is the credential.
 *
 * Apps Script redirects the POST to an internal URL; fetch follows automatically.
 */
export async function appsScriptPost(payload: unknown): Promise<AppsScriptResponse> {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!url) {
    throw new GoogleSheetsNotConfiguredError("GOOGLE_APPS_SCRIPT_URL env var is not set");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
  } catch (err) {
    throw new GoogleSheetsNotConfiguredError(`Network error reaching Apps Script: ${err instanceof Error ? err.message : String(err)}`);
  }

  let data: AppsScriptResponse;
  try {
    const text = await res.text();
    data = JSON.parse(text) as AppsScriptResponse;
  } catch {
    throw new GoogleSheetsNotConfiguredError(`Apps Script returned a non-JSON response (HTTP ${res.status})`);
  }

  if (!data.ok) {
    throw new Error(`Apps Script error: ${data.error ?? "unknown error"}`);
  }

  return data;
}
