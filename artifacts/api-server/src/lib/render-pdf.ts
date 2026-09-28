import puppeteer from "puppeteer";
import { execSync } from "child_process";

function findChromium(): string {
  // 1. Prefer system chromium installed via nix
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/run/current-system/sw/bin/chromium",
  ];

  for (const p of candidates) {
    if (p) {
      try { execSync(`test -x ${p}`); return p; } catch { /* skip */ }
    }
  }

  // 2. Find chromium in nix store (pattern: /nix/store/*/bin/chromium)
  try {
    const found = execSync("which chromium 2>/dev/null || find /nix/store -maxdepth 3 -name chromium -type f 2>/dev/null | head -1")
      .toString()
      .trim();
    if (found) return found;
  } catch { /* skip */ }

  // 3. Let puppeteer use its own bundled chrome (may be absent in nix)
  return "";
}

const CHROMIUM_PATH = findChromium();

let _browserPromise: Promise<import("puppeteer").Browser> | null = null;

function getBrowser() {
  if (!_browserPromise) {
    const opts: Parameters<typeof puppeteer.launch>[0] = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    };
    if (CHROMIUM_PATH) opts.executablePath = CHROMIUM_PATH;

    _browserPromise = puppeteer.launch(opts).catch((err) => {
      _browserPromise = null;
      throw err;
    });
  }
  return _browserPromise;
}

export async function renderToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

process.on("SIGTERM", async () => {
  if (_browserPromise) {
    const b = await _browserPromise.catch(() => null);
    await b?.close().catch(() => undefined);
  }
});
