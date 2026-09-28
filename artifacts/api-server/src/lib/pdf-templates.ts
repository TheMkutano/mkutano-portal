// ── Design tokens ─────────────────────────────────────────────────────────────
const BRAND = {
  primary:   "#1A3D6B",
  ink:       "#0C1929",
  secondary: "#5A6472",
  border:    "#E3E8EE",
  pageBg:    "#F6F8FB",
  tint:      "#EEF3F9",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Proposed:   { bg: "#F1EFE8", fg: "#5A6472" },
  Agreed:     { bg: "#E6F1FB", fg: "#0C447C" },
  InProgress: { bg: "#E6F1FB", fg: "#2A6FB0" },
  Delivered:  { bg: "#E1F5EE", fg: "#0F6E56" },
  Stalled:    { bg: "#FCEBEB", fg: "#A32D2D" },
};

const CAT_STYLE: Record<string, { bg: string; fg: string }> = {
  Policy:     { bg: "#EEE6F8", fg: "#5E35B1" },
  Investment: { bg: "#FBF3E2", fg: "#8A6516" },
  Skills:     { bg: "#E6F1FB", fg: "#0C447C" },
  Innovation: { bg: "#E1F5EE", fg: "#0F6E56" },
  ESG:        { bg: "#E1F5EE", fg: "#0F6E56" },
  Inclusion:  { bg: "#FCEBEB", fg: "#A32D2D" },
  Governance: { bg: "#F1EFE8", fg: "#5A6472" },
};

const SOURCE_LABEL: Record<string, string> = {
  BusinessCircle: "Business Circle",
  DealRoom:       "Deal Room",
  Plenary:        "Plenary",
  Roundtable:     "Roundtable",
};

function badge(text: string, style: { bg: string; fg: string }): string {
  return `<span style="display:inline-block;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600;background:${style.bg};color:${style.fg};white-space:nowrap;">${text}</span>`;
}

function statusBadge(status: string): string {
  return badge(status, STATUS_STYLE[status] ?? { bg: "#F1EFE8", fg: "#5A6472" });
}

function catBadge(cat: string): string {
  return badge(cat, CAT_STYLE[cat] ?? { bg: "#F1EFE8", fg: "#5A6472" });
}

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};background:#fff;padding:36px 40px}
  h1{font-size:22px;font-weight:600;color:${BRAND.ink}}
  h2{font-size:14px;font-weight:600;color:${BRAND.ink};margin-bottom:12px}
  h3{font-size:12px;font-weight:600;color:${BRAND.secondary};text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px}
  p{font-size:13px;line-height:1.5}
  table{width:100%;border-collapse:collapse}
  th{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.secondary};text-align:left;padding:7px 10px;border-bottom:1px solid ${BRAND.border};background:${BRAND.pageBg}}
  td{padding:9px 10px;font-size:12px;border-bottom:1px solid ${BRAND.border};vertical-align:top}
  .muted{color:${BRAND.secondary}}
  .section{margin-bottom:32px}
  .header-block{border-bottom:2px solid ${BRAND.primary};padding-bottom:14px;margin-bottom:24px}
  .meta{font-size:12px;color:${BRAND.secondary};margin-top:4px}
  .stat-row{display:flex;gap:24px;margin-bottom:24px}
  .stat-card{flex:1;border:1px solid ${BRAND.border};border-radius:8px;padding:14px 16px;background:#fff}
  .stat-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:${BRAND.secondary};margin-bottom:4px}
  .stat-number{font-size:26px;font-weight:600;color:${BRAND.ink};font-variant-numeric:tabular-nums}
  .stat-sub{font-size:11px;color:${BRAND.secondary};margin-top:2px}
  .progress-bar-wrap{height:6px;background:${BRAND.tint};border-radius:3px;overflow:hidden;margin:4px 0 8px}
  .progress-bar-fill{height:100%;border-radius:3px;background:#0F6E56}
  @media print{body{padding:20px 24px}@page{margin:16mm}}
`;

type Commitment = {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  ownerName?: string | null;
  ownerOrg?: string | null;
  source: string;
  dueDate?: string | null;
  status: string;
  inAideMemoire: boolean;
  publishedToScorecard: boolean;
  originEdition?: string | null;
  progressNote?: string | null;
};

type ScorecardData = {
  headline: { total: number; delivered: number; deliveryRatePct: number };
  signedDealValue: number;
  signedDealCount: number;
  categories: Array<{
    category: string;
    total: number;
    delivered: number;
    items: Array<{ title: string; owner: string | null; status: string; originEdition: string | null }>;
  }>;
};

// ── Aide Mémoire ───────────────────────────────────────────────────────────────
export function aideMemoireHtml(
  conveningName: string,
  commitments: Commitment[],
  generatedAt: Date = new Date()
): string {
  const items = commitments.filter((c) => c.inAideMemoire);

  const byCategory: Record<string, Commitment[]> = {};
  for (const c of items) {
    byCategory[c.category] ??= [];
    byCategory[c.category].push(c);
  }

  const dateStr = generatedAt.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const categoryOrder = ["Policy", "Investment", "Skills", "Innovation", "ESG", "Inclusion", "Governance"];
  const orderedCats = categoryOrder.filter((k) => byCategory[k]);

  const catSections = orderedCats.map((cat) => {
    const catItems = byCategory[cat];
    const rows = catItems.map((c) => `
      <tr>
        <td style="width:44%">
          <p style="font-weight:500;font-size:12px;color:${BRAND.ink}">${c.title}</p>
          ${c.description ? `<p style="font-size:11px;color:${BRAND.secondary};margin-top:2px">${c.description}</p>` : ""}
          ${c.progressNote ? `<p style="font-size:11px;color:${BRAND.secondary};font-style:italic;margin-top:2px">Progress: ${c.progressNote}</p>` : ""}
        </td>
        <td style="width:18%">${c.ownerOrg ?? c.ownerName ?? '<span class="muted">—</span>'}</td>
        <td style="width:13%">${SOURCE_LABEL[c.source] ?? c.source}</td>
        <td style="width:11%">${c.dueDate ?? '<span class="muted">—</span>'}</td>
        <td style="width:14%">${statusBadge(c.status)}${c.originEdition ? `<p style="font-size:10px;color:${BRAND.secondary};margin-top:3px">${c.originEdition}</p>` : ""}</td>
      </tr>`).join("");

    return `
      <div class="section">
        <h2>${catBadge(cat)} <span style="margin-left:6px">${cat}</span>
          <span style="font-size:12px;font-weight:400;color:${BRAND.secondary};margin-left:6px">(${catItems.length})</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Commitment</th><th>Owner</th><th>Source</th><th>Due</th><th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  const delivered = items.filter((c) => c.status === "Delivered").length;
  const inProgress = items.filter((c) => c.status === "InProgress" || c.status === "Agreed").length;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_CSS}</style></head>
<body>
  <div class="header-block">
    <h1>Aide Mémoire</h1>
    <p class="meta">${conveningName} &nbsp;·&nbsp; Generated ${dateStr}</p>
  </div>

  <div class="stat-row">
    <div class="stat-card">
      <div class="stat-label">Commitments in Aide Mémoire</div>
      <div class="stat-number">${items.length}</div>
      <div class="stat-sub">${categoryOrder.filter((k) => byCategory[k]).length} categories</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Delivered</div>
      <div class="stat-number" style="color:#0F6E56">${delivered}</div>
      <div class="stat-sub">${items.length ? Math.round((delivered / items.length) * 100) : 0}% delivery rate</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">In Progress / Agreed</div>
      <div class="stat-number" style="color:#0C447C">${inProgress}</div>
      <div class="stat-sub">active commitments</div>
    </div>
  </div>

  ${items.length === 0
    ? '<p style="text-align:center;color:#5A6472;padding:48px 0">No commitments marked for Aide Mémoire.</p>'
    : catSections}

  <p style="font-size:10px;color:${BRAND.secondary};text-align:right;margin-top:32px;border-top:1px solid ${BRAND.border};padding-top:10px">
    Mkutano Convening Portal · Confidential · ${conveningName} · ${dateStr}
  </p>
</body></html>`;
}

// ── Scorecard ─────────────────────────────────────────────────────────────────
export function scorecardHtml(
  conveningName: string,
  data: ScorecardData,
  generatedAt: Date = new Date()
): string {
  const dateStr = generatedAt.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const fmtMoney = (v: number) => {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  const categoryRows = data.categories.map((cat) => {
    const pct = cat.total ? Math.round((cat.delivered / cat.total) * 100) : 0;
    const barColor = pct === 100 ? "#0F6E56" : pct >= 50 ? "#2A6FB0" : "#8A6516";
    const statusStyle = pct === 100
      ? STATUS_STYLE.Delivered
      : pct >= 50 ? STATUS_STYLE.InProgress : STATUS_STYLE.Proposed;

    const itemRows = cat.items.map((item) => `
      <tr style="background:#fff">
        <td style="padding-left:24px;font-size:12px">${item.title}</td>
        <td style="font-size:11px;color:${BRAND.secondary}">${item.owner ?? "—"}</td>
        <td style="font-size:11px;color:${BRAND.secondary}">${item.originEdition ?? "—"}</td>
        <td>${statusBadge(item.status)}</td>
      </tr>`).join("");

    return `
      <tr>
        <td colspan="4" style="padding:0">
          <div style="background:${BRAND.pageBg};padding:10px 12px 4px;border-bottom:1px solid ${BRAND.border}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="font-weight:600;font-size:13px">${cat.category}</span>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;color:${BRAND.secondary}">${cat.delivered}/${cat.total} delivered</span>
                ${badge(`${pct}%`, statusStyle)}
              </div>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width:${pct}%;background:${barColor}"></div>
            </div>
          </div>
          <table>${itemRows}</table>
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${BASE_CSS}
  .scorecard-table{border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden}
</style></head>
<body>
  <div class="header-block">
    <h1>Outcomes Scorecard</h1>
    <p class="meta">${conveningName} &nbsp;·&nbsp; Generated ${dateStr}</p>
  </div>

  <div class="stat-row">
    <div class="stat-card">
      <div class="stat-label">Delivery Rate</div>
      <div class="stat-number" style="color:${data.headline.deliveryRatePct >= 75 ? "#0F6E56" : data.headline.deliveryRatePct >= 40 ? "#0C447C" : "#A32D2D"}">
        ${data.headline.deliveryRatePct}%
      </div>
      <div class="stat-sub">${data.headline.delivered} of ${data.headline.total} delivered</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Signed Deal Value</div>
      <div class="stat-number">${fmtMoney(data.signedDealValue)}</div>
      <div class="stat-sub">${data.signedDealCount} deal${data.signedDealCount !== 1 ? "s" : ""} signed</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Commitment Categories</div>
      <div class="stat-number">${data.categories.length}</div>
      <div class="stat-sub">${data.headline.total} commitments published</div>
    </div>
  </div>

  <div class="section">
    <h2>Commitments by Category</h2>
    ${data.categories.length === 0
      ? '<p style="text-align:center;color:#5A6472;padding:32px 0">No commitments published to scorecard.</p>'
      : `<div class="scorecard-table">
          <table>
            <thead>
              <tr><th>Commitment</th><th>Owner</th><th>Edition</th><th>Status</th></tr>
            </thead>
            <tbody>${categoryRows}</tbody>
          </table>
        </div>`}
  </div>

  <p style="font-size:10px;color:${BRAND.secondary};text-align:right;margin-top:32px;border-top:1px solid ${BRAND.border};padding-top:10px">
    Mkutano Convening Portal · Confidential · ${conveningName} · ${dateStr}
  </p>
</body></html>`;
}
