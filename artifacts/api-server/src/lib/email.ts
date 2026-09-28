import { logger } from "./logger";

const FROM = process.env.RESEND_FROM_EMAIL ?? "Mkutano Portal <onboarding@resend.dev>";

interface Attachment {
  filename: string;
  content: string; // base64-encoded
}

async function send(to: string | string[], subject: string, html: string, attachments?: Attachment[], text?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.error("RESEND_API_KEY is not configured — email not sent");
    return;
  }

  const payload: Record<string, unknown> = { from: FROM, to, subject, html };
  if (text) payload.text = text;
  if (attachments && attachments.length > 0) payload.attachments = attachments;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body }, "Resend delivery failure");
    throw new Error(`Resend error ${res.status}`);
  }
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mkutano Portal</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #F1F5F9;text-align:center;">
            <span style="font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#0F172A;">Mkutano</span><br>
            <span style="font-size:9px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;color:#94A3B8;">Convening Management Portal</span>
          </td>
        </tr>
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #F1F5F9;text-align:center;">
            <span style="font-size:11px;color:#94A3B8;">This link expires in 48 hours. If you did not expect this email, you can ignore it.</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendInviteEmail({
  to,
  inviteUrl,
  role,
  senderName,
}: {
  to: string;
  inviteUrl: string;
  role: string;
  senderName: string;
}): Promise<void> {
  const isClient = role === "Client";
  const subject = isClient
    ? "You've been granted access to a Mkutano convening"
    : "You've been invited to the Mkutano Convening Portal";

  const roleLabel = isClient ? "Client (read-only)" : role;
  const description = isClient
    ? "You can view your assigned convening's information."
    : "You now have access to manage convenings on behalf of Mkutano.";

  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0F172A;">You've been invited</p>
    <p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.6;">
      <strong>${senderName}</strong> has invited you to the Mkutano Convening Management Portal as <strong>${roleLabel}</strong>. ${description}
    </p>
    <p style="margin:0 0 28px;font-size:13px;color:#475569;">Click the button below to accept your invitation and sign in.</p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${inviteUrl}" style="display:inline-block;background:#2A6FB0;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        Accept invitation
      </a>
    </div>
    <p style="margin:0;font-size:11px;color:#94A3B8;word-break:break-all;">Or copy this link: ${inviteUrl}</p>
  `);

  await send(to, subject, html);
}

export async function sendEmailVerificationEmail({
  to,
  name,
  verifyUrl,
}: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0F172A;">Verify your email address</p>
    <p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.6;">
      Hi <strong>${name}</strong>, thanks for registering with the Mkutano Convening Portal.
      Click the button below to verify your email and activate your account.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${verifyUrl}" style="display:inline-block;background:#2A6FB0;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        Verify email &amp; sign in
      </a>
    </div>
    <p style="margin:0;font-size:11px;color:#94A3B8;word-break:break-all;">Or copy this link: ${verifyUrl}</p>
  `);
  await send(to, "Verify your Mkutano Portal email", html);
}

export async function sendAccessRequestNotification({
  adminEmail,
  requesterName,
  requesterEmail,
  organization,
  message,
  conveningName,
}: {
  adminEmail: string;
  requesterName: string;
  requesterEmail: string;
  organization?: string | null;
  message?: string | null;
  conveningName?: string | null;
}): Promise<void> {
  const projectLine = conveningName ? `<p style="margin:0 0 6px;font-size:13px;color:#475569;"><strong>Requested project:</strong> ${conveningName}</p>` : "";
  const orgLine = organization ? `<p style="margin:0 0 6px;font-size:13px;color:#475569;"><strong>Organization:</strong> ${organization}</p>` : "";
  const msgLine = message ? `<p style="margin:0 0 6px;font-size:13px;color:#475569;"><strong>Message:</strong> ${message}</p>` : "";
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0F172A;">New portal access request</p>
    <p style="margin:0 0 16px;font-size:13px;color:#475569;">Someone has requested external access to the Mkutano Convening Portal.</p>
    <div style="background:#F8FAFC;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:13px;color:#475569;"><strong>Name:</strong> ${requesterName}</p>
      <p style="margin:0 0 6px;font-size:13px;color:#475569;"><strong>Email:</strong> ${requesterEmail}</p>
      ${projectLine}${orgLine}${msgLine}
    </div>
    <p style="margin:0;font-size:13px;color:#475569;">Sign in to the portal and go to <strong>Settings → Access Requests</strong> to review and approve or reject this request.</p>
  `);
  await send(adminEmail, `Portal access request from ${requesterName}`, html);
}

export async function sendSignInLinkEmail({
  to,
  signInUrl,
}: {
  to: string;
  signInUrl: string;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0F172A;">Your sign-in link</p>
    <p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.6;">
      Click the button below to sign in to the Mkutano Convening Management Portal. This link expires in 1 hour and can only be used once.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${signInUrl}" style="display:inline-block;background:#2A6FB0;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        Sign in to portal
      </a>
    </div>
    <p style="margin:0;font-size:11px;color:#94A3B8;word-break:break-all;">Or copy this link: ${signInUrl}</p>
  `);

  await send(to, "Your Mkutano Portal sign-in link", html);
}

export async function sendBudgetSummaryEmail({
  to,
  conveningName,
  senderName,
  message,
  csvContent,
  csvFilename,
  summary,
}: {
  to: string[];
  conveningName: string;
  senderName: string;
  message?: string | null;
  csvContent: string;
  csvFilename: string;
  summary: {
    currency: string;
    totalIncomeBudget: number;
    totalIncomeActual: number;
    totalExpenseBudget: number;
    totalExpenseActual: number;
    netBudget: number;
    netActual: number;
  };
}): Promise<void> {
  function fmtMoney(v: number, cur: string): string {
    const abs = Math.abs(v);
    return `${cur} ${abs.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  function varStr(type: "income" | "expense", budget: number, actual: number, cur: string): string {
    if (budget === 0) return "—";
    const fav = type === "income" ? actual - budget : budget - actual;
    const pct = (fav / budget) * 100;
    const sign = fav >= 0 ? "+" : "−";
    return `${sign}${fmtMoney(fav, cur)} (${sign}${Math.abs(pct).toFixed(1)}%)`;
  }

  const { currency: cur, totalIncomeBudget, totalIncomeActual, totalExpenseBudget, totalExpenseActual, netBudget, netActual } = summary;

  const netBudgetColor = netBudget >= 0 ? "#0F6E56" : "#A32D2D";
  const netActualColor = netActual >= 0 ? "#0F6E56" : "#A32D2D";
  const netSign = (v: number) => v >= 0 ? "+" : "−";

  const messageBlock = message
    ? `<div style="background:#F8FAFC;border-left:3px solid #2A6FB0;padding:12px 16px;margin:0 0 20px;border-radius:0 6px 6px 0;">
        <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;white-space:pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      </div>`
    : "";

  const html = baseTemplate(`
    <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#0F172A;">Budget summary — ${conveningName}</p>
    <p style="margin:0 0 18px;font-size:13px;color:#475569;line-height:1.6;">
      <strong>${senderName}</strong> has shared a budget snapshot for <strong>${conveningName}</strong>.
      The full P&amp;L spreadsheet is attached as a CSV file.
    </p>
    ${messageBlock}
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:20px;font-size:13px;">
      <thead>
        <tr style="background:#1A3A2E;">
          <th style="padding:10px 14px;text-align:left;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Category</th>
          <th style="padding:10px 14px;text-align:right;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Budget</th>
          <th style="padding:10px 14px;text-align:right;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Actual</th>
          <th style="padding:10px 14px;text-align:right;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Variance</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:#E8F0EC;">
          <td style="padding:9px 14px;font-weight:600;color:#0F172A;">Total Income</td>
          <td style="padding:9px 14px;text-align:right;color:#475569;font-family:monospace;">${fmtMoney(totalIncomeBudget, cur)}</td>
          <td style="padding:9px 14px;text-align:right;color:#475569;font-family:monospace;">${fmtMoney(totalIncomeActual, cur)}</td>
          <td style="padding:9px 14px;text-align:right;color:#475569;font-family:monospace;">${varStr("income", totalIncomeBudget, totalIncomeActual, cur)}</td>
        </tr>
        <tr style="background:#F8FAFC;">
          <td style="padding:9px 14px;font-weight:600;color:#0F172A;">Total Expenses</td>
          <td style="padding:9px 14px;text-align:right;color:#475569;font-family:monospace;">${fmtMoney(totalExpenseBudget, cur)}</td>
          <td style="padding:9px 14px;text-align:right;color:#475569;font-family:monospace;">${fmtMoney(totalExpenseActual, cur)}</td>
          <td style="padding:9px 14px;text-align:right;color:#475569;font-family:monospace;">${varStr("expense", totalExpenseBudget, totalExpenseActual, cur)}</td>
        </tr>
        <tr style="background:#1A3A2E;">
          <td style="padding:10px 14px;font-weight:700;color:#fff;font-size:13px;">Net P&amp;L</td>
          <td style="padding:10px 14px;text-align:right;font-weight:700;font-family:monospace;color:${netBudgetColor === "#0F6E56" ? "#86EFAC" : "#FCA5A5"};">${netSign(netBudget)}${fmtMoney(netBudget, cur)}</td>
          <td style="padding:10px 14px;text-align:right;font-weight:700;font-family:monospace;color:${netActualColor === "#0F6E56" ? "#86EFAC" : "#FCA5A5"};">${netSign(netActual)}${fmtMoney(netActual, cur)}</td>
          <td style="padding:10px 14px;text-align:right;color:#94A3B8;">—</td>
        </tr>
      </tbody>
    </table>
    <p style="margin:0;font-size:11px;color:#94A3B8;">The full line-item detail is in the attached CSV file. This snapshot was exported from the Mkutano Convening Management Portal.</p>
  `);

  // Plain-text fallback
  const messageLine = message ? `\n${message.trim()}\n` : "";
  const varTxt = (type: "income" | "expense", budget: number, actual: number): string => {
    if (budget === 0) return "—";
    const fav = type === "income" ? actual - budget : budget - actual;
    const pct = (fav / budget) * 100;
    const sign = fav >= 0 ? "+" : "-";
    return `${sign}${fmtMoney(fav, cur)} (${sign}${Math.abs(pct).toFixed(1)}%)`;
  };
  const netBudgetTxt = `${netBudget >= 0 ? "+" : "-"}${fmtMoney(netBudget, cur)}`;
  const netActualTxt = `${netActual >= 0 ? "+" : "-"}${fmtMoney(netActual, cur)}`;

  const plainText = [
    `Budget snapshot — ${conveningName}`,
    "=".repeat(50),
    "",
    `${senderName} has shared a budget snapshot for ${conveningName}.`,
    messageLine,
    "P&L SUMMARY",
    "-".repeat(50),
    `${"Category".padEnd(20)} ${"Budget".padStart(14)} ${"Actual".padStart(14)} ${"Variance".padStart(20)}`,
    "-".repeat(70),
    `${"Total Income".padEnd(20)} ${fmtMoney(totalIncomeBudget, cur).padStart(14)} ${fmtMoney(totalIncomeActual, cur).padStart(14)} ${varTxt("income", totalIncomeBudget, totalIncomeActual).padStart(20)}`,
    `${"Total Expenses".padEnd(20)} ${fmtMoney(totalExpenseBudget, cur).padStart(14)} ${fmtMoney(totalExpenseActual, cur).padStart(14)} ${varTxt("expense", totalExpenseBudget, totalExpenseActual).padStart(20)}`,
    "-".repeat(70),
    `${"Net P&L".padEnd(20)} ${netBudgetTxt.padStart(14)} ${netActualTxt.padStart(14)}`,
    "",
    "The full line-item detail is in the attached CSV file.",
    "This snapshot was exported from the Mkutano Convening Management Portal.",
  ].join("\n");

  const attachment: Attachment = {
    filename: csvFilename,
    content: Buffer.from(csvContent, "utf-8").toString("base64"),
  };

  await send(to, `Budget snapshot — ${conveningName}`, html, [attachment], plainText);
}

export async function sendScheduledDelegateExportEmail({
  to,
  conveningName,
  rowCount,
  segment,
  passTypeCategory,
  csvContent,
  csvFilename,
}: {
  to: string[];
  conveningName: string;
  rowCount: number;
  segment: string;
  passTypeCategory: string;
  csvContent: string;
  csvFilename: string;
}): Promise<void> {
  const filterLine = [
    segment && segment !== "All" ? `Segment: <strong>${segment}</strong>` : null,
    passTypeCategory && passTypeCategory !== "All" ? `Pass type: <strong>${passTypeCategory}</strong>` : null,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0F172A;">Daily delegate export — ${conveningName}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#475569;line-height:1.6;">
      Your scheduled daily delegate CSV export for <strong>${conveningName}</strong> is attached, with <strong>${rowCount}</strong> record${rowCount === 1 ? "" : "s"}.
      ${filterLine ? `<br>${filterLine}` : ""}
    </p>
    <p style="margin:0;font-size:11px;color:#94A3B8;">This export was generated automatically from the schedule configured in Settings on the Mkutano Convening Management Portal.</p>
  `);

  const plainText = [
    `Daily delegate export — ${conveningName}`,
    "=".repeat(50),
    "",
    `${rowCount} record${rowCount === 1 ? "" : "s"} attached as CSV.`,
    filterLine ? filterLine.replace(/<[^>]+>/g, "") : "",
    "",
    "This export was generated automatically from the schedule configured in Settings.",
  ].join("\n");

  const attachment: Attachment = {
    filename: csvFilename,
    content: Buffer.from(csvContent, "utf-8").toString("base64"),
  };

  await send(to, `Daily delegate export — ${conveningName}`, html, [attachment], plainText);
}

export async function sendTaskReminderEmail({
  to,
  assigneeName,
  tasks,
  portalUrl,
}: {
  to: string;
  assigneeName: string;
  tasks: Array<{
    title: string;
    priority: string;
    dueDate: string | null;
    conveningName: string;
    workstreamName: string;
    status: string;
  }>;
  portalUrl: string;
}): Promise<void> {
  const priorityColor: Record<string, { bg: string; fg: string }> = {
    Urgent: { bg: "#FEE2E2", fg: "#991B1B" },
    High:   { bg: "#FEF3C7", fg: "#92400E" },
    Medium: { bg: "#EFF6FF", fg: "#1E40AF" },
    Low:    { bg: "#F0FDF4", fg: "#166534" },
  };

  const taskRows = tasks.map((t) => {
    const pc = priorityColor[t.priority] ?? priorityColor.Medium;
    const dueLine = t.dueDate
      ? `<span style="font-size:11px;color:#64748B;">Due ${t.dueDate}</span>`
      : "";
    return `
      <tr style="border-bottom:1px solid #F1F5F9;">
        <td style="padding:10px 14px;">
          <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:#0F172A;">${t.title}</p>
          <p style="margin:0;font-size:11px;color:#64748B;">${t.conveningName} · ${t.workstreamName}</p>
          ${dueLine}
        </td>
        <td style="padding:10px 14px;vertical-align:top;">
          <span style="display:inline-block;background:${pc.bg};color:${pc.fg};font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;letter-spacing:0.05em;text-transform:uppercase;">${t.priority}</span>
        </td>
      </tr>`;
  }).join("");

  const count = tasks.length;
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0F172A;">Daily task reminder</p>
    <p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.6;">
      Hi <strong>${assigneeName}</strong>, you have <strong>${count} open task${count === 1 ? "" : "s"}</strong> assigned to you.
      These reminders will stop automatically once each task is marked complete.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <thead>
        <tr style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;">
          <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748B;">Task</th>
          <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748B;">Priority</th>
        </tr>
      </thead>
      <tbody>${taskRows}</tbody>
    </table>
    <div style="text-align:center;margin-bottom:16px;">
      <a href="${portalUrl}/tasks" style="display:inline-block;background:#2A6FB0;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;">
        Open Tasks
      </a>
    </div>
    <p style="margin:0;font-size:11px;color:#94A3B8;">You are receiving this because tasks are assigned to you. Reminders stop when tasks are completed.</p>
  `);

  const plain = [
    `Daily task reminder — ${count} open task${count === 1 ? "" : "s"}`,
    "",
    `Hi ${assigneeName},`,
    "",
    ...tasks.map((t) => `- [${t.priority}] ${t.title} (${t.conveningName} · ${t.workstreamName})${t.dueDate ? ` — Due ${t.dueDate}` : ""}`),
    "",
    `Open tasks: ${portalUrl}/tasks`,
  ].join("\n");

  await send(to, `You have ${count} open task${count === 1 ? "" : "s"} — Mkutano Portal`, html, undefined, plain);
}

export async function sendSheetsSyncSuccessEmail({
  to,
  conveningName,
  spreadsheetUrl,
  tabCounts,
  syncedAt,
}: {
  to: string[];
  conveningName: string;
  spreadsheetUrl: string;
  tabCounts: Array<{ title: string; rows: number }>;
  syncedAt: string;
}): Promise<void> {
  const totalRows = tabCounts.reduce((s, t) => s + t.rows, 0);
  const tabRows = tabCounts
    .map(
      (t) =>
        `<tr style="border-bottom:1px solid #F1F5F9;">
          <td style="padding:8px 14px;font-size:13px;color:#0F172A;">${t.title}</td>
          <td style="padding:8px 14px;font-size:13px;color:#475569;text-align:right;font-family:monospace;">${t.rows.toLocaleString()}</td>
        </tr>`,
    )
    .join("");

  const html = baseTemplate(`
    <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#0F172A;">
      <span style="color:#0F9D58;">✓</span> Google Sheets sync complete — ${conveningName}
    </p>
    <p style="margin:0 0 18px;font-size:13px;color:#475569;line-height:1.6;">
      The scheduled daily sync for <strong>${conveningName}</strong> completed successfully at <strong>${new Date(syncedAt).toUTCString()}</strong>.
      <strong>${totalRows.toLocaleString()}</strong> total rows written across ${tabCounts.length} tab${tabCounts.length === 1 ? "" : "s"}.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:20px;font-size:13px;">
      <thead>
        <tr style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;">
          <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748B;">Tab</th>
          <th style="padding:8px 14px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748B;">Rows</th>
        </tr>
      </thead>
      <tbody>${tabRows}</tbody>
    </table>
    <div style="text-align:center;margin-bottom:16px;">
      <a href="${spreadsheetUrl}" style="display:inline-block;background:#0F9D58;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;">
        Open in Google Sheets
      </a>
    </div>
    <p style="margin:0;font-size:11px;color:#94A3B8;">This notification was sent automatically by the Mkutano Convening Management Portal daily sync scheduler.</p>
  `);

  const plain = [
    `Google Sheets sync complete — ${conveningName}`,
    "=".repeat(50),
    "",
    `Synced at: ${new Date(syncedAt).toUTCString()}`,
    `Total rows: ${totalRows.toLocaleString()}`,
    "",
    ...tabCounts.map((t) => `  ${t.title.padEnd(20)} ${t.rows.toLocaleString()} rows`),
    "",
    `Open sheet: ${spreadsheetUrl}`,
  ].join("\n");

  await send(
    to,
    `Sheets sync complete — ${conveningName}`,
    html,
    undefined,
    plain,
  );
}

export async function sendSheetsSyncFailureEmail({
  to,
  conveningName,
  errorMessage,
  failedAt,
}: {
  to: string[];
  conveningName: string;
  errorMessage: string;
  failedAt: string;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#0F172A;">
      <span style="color:#DC2626;">✕</span> Google Sheets sync failed — ${conveningName}
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#475569;line-height:1.6;">
      The scheduled daily sync for <strong>${conveningName}</strong> failed at <strong>${new Date(failedAt).toUTCString()}</strong>.
      No data was written to the spreadsheet.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#991B1B;">Error</p>
      <p style="margin:0;font-size:13px;color:#7F1D1D;font-family:monospace;word-break:break-all;">${errorMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>
    <p style="margin:0 0 16px;font-size:13px;color:#475569;">To resolve this, go to <strong>Settings → Google Sheets sync</strong> and re-authorise the connector or trigger a manual sync.</p>
    <p style="margin:0;font-size:11px;color:#94A3B8;">This notification was sent automatically by the Mkutano Convening Management Portal daily sync scheduler.</p>
  `);

  const plain = [
    `Google Sheets sync FAILED — ${conveningName}`,
    "=".repeat(50),
    "",
    `Failed at: ${new Date(failedAt).toUTCString()}`,
    `Error: ${errorMessage}`,
    "",
    "To resolve: go to Settings → Google Sheets sync and re-authorise or trigger a manual sync.",
  ].join("\n");

  await send(
    to,
    `Sheets sync failed — ${conveningName}`,
    html,
    undefined,
    plain,
  );
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0F172A;">Reset your password</p>
    <p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.6;">
      We received a request to reset the password for your Mkutano Portal account.
      Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetUrl}" style="display:inline-block;background:#2A6FB0;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        Reset password
      </a>
    </div>
    <p style="margin:0 0 12px;font-size:11px;color:#94A3B8;word-break:break-all;">Or copy this link: ${resetUrl}</p>
    <p style="margin:0;font-size:11px;color:#94A3B8;">If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
  `);
  await send(to, "Reset your Mkutano Portal password", html);
}
