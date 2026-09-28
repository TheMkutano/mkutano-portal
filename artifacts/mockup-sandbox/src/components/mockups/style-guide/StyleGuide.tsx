export function StyleGuide() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#F6F8FB", minHeight: "100vh", padding: "48px 40px", color: "#0F1F33" }}>

      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 10, height: 32, background: "#2A6FB0", borderRadius: 2 }} />
          <span style={{ fontSize: 22, fontWeight: 600, color: "#0F1F33" }}>Mkutano Design System</span>
        </div>
        <p style={{ fontSize: 13, color: "#5A6472", marginLeft: 22 }}>Convening Portal · McKinsey-derived palette · Inter typeface</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* ── Brand Colors ── */}
        <Section title="Brand Colors">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { name: "Primary Blue", hex: "#2A6FB0", dark: true },
              { name: "Accent Blue", hex: "#1B9DD9", dark: true },
              { name: "Navy", hex: "#0A2F5C", dark: true },
              { name: "Ink", hex: "#0F1F33", dark: true },
              { name: "Tint", hex: "#EEF3F9" },
              { name: "Page BG", hex: "#F6F8FB" },
              { name: "Border", hex: "#E3E8EE" },
              { name: "Secondary", hex: "#5A6472", dark: true },
              { name: "Primary Dark", hex: "#245d95", dark: true },
            ].map(c => (
              <div key={c.name} style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #E3E8EE" }}>
                <div style={{ background: c.hex, height: 48 }} />
                <div style={{ padding: "6px 8px", background: "#fff" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#0F1F33" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "#5A6472", fontFamily: "Menlo, monospace" }}>{c.hex}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Semantic Colors ── */}
        <Section title="Semantic Colors">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Status · Completed", bg: "#2E7D5B", text: "#fff", token: "--status-completed" },
              { label: "Status · In Progress", bg: "#2A6FB0", text: "#fff", token: "--status-inprogress" },
              { label: "Status · Blocked", bg: "#B5462F", text: "#fff", token: "--status-blocked" },
              { label: "Status · Not Started", bg: "#9AA4B0", text: "#fff", token: "--status-notstarted" },
              { label: "Variance · Favourable", bg: "#2E7D5B", text: "#fff", token: "--variance-fav" },
              { label: "Variance · Adverse", bg: "#B5462F", text: "#fff", token: "--variance-adv" },
              { label: "Destructive", bg: "#C44B2B", text: "#fff", token: "--destructive" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 22, borderRadius: 4, background: s.bg, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0F1F33" }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: "#5A6472", fontFamily: "Menlo, monospace" }}>{s.token}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Typography ── */}
        <Section title="Typography — Inter">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <TypeRow label="Page title" sample="Nairobi Convening 2026" style={{ fontSize: 22, fontWeight: 600 }} spec="22px / 600" />
            <TypeRow label="Section heading" sample="Partner Pipeline" style={{ fontSize: 14, fontWeight: 600 }} spec="14px / 600" />
            <TypeRow label="Body" sample="All confirmed speakers and delegates." style={{ fontSize: 13, fontWeight: 400 }} spec="13px / 400" />
            <TypeRow label="Table header" sample="INSTITUTION NAME" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", color: "#5A6472", letterSpacing: "0.05em" }} spec="11px / 500 uppercase" />
            <TypeRow label="Numeric" sample="$1,234,567" style={{ fontSize: 13, fontWeight: 400, fontVariantNumeric: "tabular-nums" }} spec="13px · tabular-nums" />
            <TypeRow label="Caption / label" sample="Updated 2 days ago" style={{ fontSize: 11, color: "#5A6472" }} spec="11px / 400 secondary" />
          </div>
        </Section>

        {/* ── Tier Badges ── */}
        <Section title="Tier Badges — Tonal">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { tier: "Platinum", bg: "#EEF1F6", fg: "#0A2F5C" },
              { tier: "Gold", bg: "#FBF3E2", fg: "#8A6516" },
              { tier: "Silver", bg: "#F0F2F4", fg: "#5A6472" },
              { tier: "Bronze", bg: "#F5EDE4", fg: "#7A4C2C" },
            ].map(t => (
              <div key={t.tier} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ background: t.bg, color: t.fg, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, display: "inline-block", minWidth: 72, textAlign: "center" }}>
                  {t.tier}
                </span>
                <div style={{ fontSize: 11, color: "#5A6472", fontFamily: "Menlo, monospace" }}>
                  bg: {t.bg} · text: {t.fg}
                </div>
              </div>
            ))}
            <p style={{ fontSize: 11, color: "#9AA4B0", marginTop: 4, borderTop: "1px solid #E3E8EE", paddingTop: 8 }}>
              Never solid/dark: no <code style={{ background: "#F0F2F4", padding: "1px 4px", borderRadius: 3 }}>bg-gray-900 text-white</code>
            </p>
          </div>
        </Section>

        {/* ── Role Badges ── */}
        <Section title="Role Badges">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { role: "Admin", bg: "#EEF1F6", fg: "#0A2F5C" },
              { role: "Curator", bg: "#EDF5FF", fg: "#1D5FA8" },
              { role: "Finance", bg: "#FBF3E2", fg: "#8A6516" },
              { role: "PartnerLead", bg: "#F0F5F0", fg: "#2E6B3E" },
              { role: "SpeakerLead", bg: "#F5EEF8", fg: "#7B3F9E" },
              { role: "Ops", bg: "#F0F2F4", fg: "#5A6472" },
              { role: "PressManager", bg: "#FFF4EF", fg: "#9B3E1A" },
              { role: "Advisor", bg: "#F5EDE4", fg: "#7A4C2C" },
              { role: "Client", bg: "#EEF3F9", fg: "#2A6FB0" },
              { role: "External", bg: "#F0F2F4", fg: "#5A6472" },
            ].map(r => (
              <span key={r.role} style={{ background: r.bg, color: r.fg, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4 }}>
                {r.role}
              </span>
            ))}
          </div>
        </Section>

        {/* ── Pipeline Stages ── */}
        <Section title="Pipeline Stages">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { stage: "Prospect", bg: "#F0F2F4", fg: "#5A6472" },
              { stage: "Outreach", bg: "#EDF5FF", fg: "#1D5FA8" },
              { stage: "Negotiation", bg: "#FBF3E2", fg: "#8A6516" },
              { stage: "Committed", bg: "#EEF7F2", fg: "#2E6B3E" },
              { stage: "Onboarded", bg: "#E6F7F0", fg: "#2E7D5B" },
              { stage: "Declined", bg: "#FEF0EE", fg: "#B5462F" },
            ].map(s => (
              <div key={s.stage} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, minWidth: 88, textAlign: "center" }}>
                  {s.stage}
                </span>
                <div style={{ flex: 1, height: 4, background: "#E3E8EE", borderRadius: 2 }}>
                  <div style={{ height: 4, background: s.fg, opacity: 0.4, borderRadius: 2, width: { Prospect: "10%", Outreach: "25%", Negotiation: "50%", Committed: "70%", Onboarded: "100%", Declined: "0%" }[s.stage] }} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Buttons ── */}
        <Section title="Buttons">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Btn variant="primary">Invite</Btn>
              <Btn variant="secondary">Export CSV</Btn>
              <Btn variant="outline">Cancel</Btn>
              <Btn variant="ghost">View all</Btn>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Btn variant="destructive">Delete</Btn>
              <Btn variant="primary" size="sm">Add Speaker</Btn>
              <Btn variant="outline" size="sm">Filter</Btn>
            </div>
            <div style={{ fontSize: 11, color: "#5A6472", borderTop: "1px solid #E3E8EE", paddingTop: 8 }}>
              Height: 32px (md) · 28px (sm) · Border-radius: 4px · Font: 13px/500
            </div>
          </div>
        </Section>

        {/* ── Budget Variance ── */}
        <Section title="Budget Variance Semantics">
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Category", "Committed", "Actual", "Variance", "Colour"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontSize: 11, fontWeight: 500, color: "#5A6472", textTransform: "uppercase", paddingBottom: 6, borderBottom: "1px solid #E3E8EE", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "8px 0", color: "#0F1F33", fontWeight: 500 }}>Venue (expense)</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>$80,000</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>$72,000</td>
                <td style={{ fontVariantNumeric: "tabular-nums", color: "#2E7D5B", fontWeight: 600 }}>+$8,000</td>
                <td><span style={{ background: "#E6F7F0", color: "#2E7D5B", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3 }}>Favourable</span></td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", color: "#0F1F33", fontWeight: 500 }}>Catering (expense)</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>$30,000</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>$35,000</td>
                <td style={{ fontVariantNumeric: "tabular-nums", color: "#B5462F", fontWeight: 600 }}>−$5,000</td>
                <td><span style={{ background: "#FEF0EE", color: "#B5462F", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3 }}>Adverse</span></td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", color: "#0F1F33", fontWeight: 500 }}>Sponsorship (income)</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>$120,000</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>$145,000</td>
                <td style={{ fontVariantNumeric: "tabular-nums", color: "#2E7D5B", fontWeight: 600 }}>+$25,000</td>
                <td><span style={{ background: "#E6F7F0", color: "#2E7D5B", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3 }}>Favourable</span></td>
              </tr>
              <tr style={{ borderTop: "1px solid #E3E8EE" }}>
                <td colSpan={5} style={{ paddingTop: 8, fontSize: 11, color: "#5A6472" }}>
                  <strong>Expense:</strong> fav when actual &lt; committed · <strong>Income:</strong> fav when actual &gt; committed · Net P&L shows "—" when either side is empty
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* ── Chart Palette ── */}
        <Section title="Chart Palette">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Chart 1 — Primary Blue", hex: "#2A6FB0" },
              { label: "Chart 2 — Accent Blue", hex: "#1B9DD9" },
              { label: "Chart 3 — Amber", hex: "#EDB218" },
              { label: "Chart 4 — Violet", hex: "#9933FF" },
              { label: "Chart 5 — Neutral grey", hex: "#808080" },
            ].map(c => (
              <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 80, height: 14, background: c.hex, borderRadius: 3, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#0F1F33" }}>{c.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#5A6472", fontFamily: "Menlo, monospace" }}>{c.hex}</span>
              </div>
            ))}
            <p style={{ fontSize: 11, color: "#5A6472", marginTop: 4 }}>Used in Recharts bar/line charts across all dashboard views.</p>
          </div>
        </Section>

        {/* ── Spacing & Radius ── */}
        <Section title="Spacing & Radius">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              {[4, 8, 12, 16, 24, 32, 48].map(n => (
                <div key={n} style={{ textAlign: "center" }}>
                  <div style={{ width: n, height: n, background: "#2A6FB0", opacity: 0.7, marginBottom: 4, borderRadius: 2 }} />
                  <div style={{ fontSize: 9, color: "#5A6472" }}>{n}px</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              {[
                { label: "sm", r: 2 },
                { label: "md", r: 4 },
                { label: "lg", r: 6 },
                { label: "card", r: 8 },
              ].map(r => (
                <div key={r.label} style={{ textAlign: "center" }}>
                  <div style={{ width: 40, height: 24, background: "#EEF3F9", border: "1px solid #2A6FB0", borderRadius: r.r, marginBottom: 4 }} />
                  <div style={{ fontSize: 10, color: "#5A6472" }}>r-{r.label}<br />{r.r}px</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#5A6472", marginTop: 4 }}>Base radius: 4px (--radius: 0.25rem) · Cards use 6–8px</p>
          </div>
        </Section>

        {/* ── Empty States ── */}
        <Section title="Empty State Rules">
          <div style={{ display: "flex", gap: 16 }}>
            <EmptyExample
              label="Correct — Missing data"
              value="—"
              sub="No commitments recorded"
              color="#5A6472"
            />
            <EmptyExample
              label="Correct — Zero value"
              value="$0"
              sub="0 partners committed"
              color="#0F1F33"
            />
            <EmptyExample
              label="Wrong — Computed from nothing"
              value="−$0"
              sub="Never show computed delta when input is empty"
              color="#B5462F"
              strike
            />
          </div>
          <p style={{ fontSize: 11, color: "#5A6472", marginTop: 10, borderTop: "1px solid #E3E8EE", paddingTop: 8 }}>
            "$0" ≠ "—" · Zero means counted and empty. Dash means data absent. Net P&L shows "—" when income or expenses array is empty.
          </p>
        </Section>

        {/* ── Form Elements ── */}
        <Section title="Form Elements">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#0F1F33", display: "block", marginBottom: 4 }}>Institution Name</label>
              <input
                readOnly
                value="African Development Bank"
                style={{ width: "100%", height: 32, border: "1px solid #D4D9DF", borderRadius: 4, padding: "0 10px", fontSize: 13, color: "#0F1F33", background: "#fff", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#0F1F33", display: "block", marginBottom: 4 }}>Tier</label>
              <select style={{ width: "100%", height: 32, border: "1px solid #D4D9DF", borderRadius: 4, padding: "0 10px", fontSize: 13, color: "#0F1F33", background: "#fff", boxSizing: "border-box" }}>
                <option>Gold</option>
                <option>Platinum</option>
                <option>Silver</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="primary">Save changes</Btn>
              <Btn variant="outline">Cancel</Btn>
            </div>
            <p style={{ fontSize: 11, color: "#5A6472" }}>Input height: 32px · Border: 1px #D4D9DF · Focus ring: 2px #2A6FB0</p>
          </div>
        </Section>

      </div>

      {/* Footer note */}
      <div style={{ marginTop: 40, padding: "16px 20px", background: "#EEF3F9", borderRadius: 8, border: "1px solid #C8D8EA" }}>
        <p style={{ fontSize: 12, color: "#2A6FB0", fontWeight: 500, margin: 0 }}>Source of truth</p>
        <p style={{ fontSize: 11, color: "#5A6472", margin: "4px 0 0" }}>
          CSS tokens live in <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 3, fontFamily: "Menlo, monospace" }}>artifacts/portal/src/index.css</code> ·
          Design decisions in <code style={{ background: "#fff", padding: "1px 4px", borderRadius: 3, fontFamily: "Menlo, monospace" }}>.agents/memory/mkutano-design-system.md</code>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #E3E8EE", padding: "20px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#5A6472", paddingBottom: 10, borderBottom: "1px solid #F0F2F4" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function TypeRow({ label, sample, style, spec }: { label: string; sample: string; style: React.CSSProperties; spec: string }) {
  return (
    <div>
      <div style={style}>{sample}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <span style={{ fontSize: 10, color: "#9AA4B0" }}>{label}</span>
        <span style={{ fontSize: 10, color: "#C8D0D8", fontFamily: "Menlo, monospace" }}>{spec}</span>
      </div>
    </div>
  );
}

function Btn({ variant = "primary", size = "md", children }: { variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive"; size?: "md" | "sm"; children: React.ReactNode }) {
  const base: React.CSSProperties = {
    height: size === "sm" ? 28 : 32,
    padding: size === "sm" ? "0 10px" : "0 14px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 4,
    border: "1px solid transparent",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'Inter', sans-serif",
  };
  const variants: Record<string, React.CSSProperties> = {
    primary:     { background: "#2A6FB0", color: "#fff", borderColor: "#245d95" },
    secondary:   { background: "#EEF3F9", color: "#2A6FB0", borderColor: "#C8D8EA" },
    outline:     { background: "#fff", color: "#0F1F33", borderColor: "#D4D9DF" },
    ghost:       { background: "transparent", color: "#5A6472", borderColor: "transparent" },
    destructive: { background: "#C44B2B", color: "#fff", borderColor: "#a83a1e" },
  };
  return <button style={{ ...base, ...variants[variant] }}>{children}</button>;
}

function EmptyExample({ label, value, sub, color, strike }: { label: string; value: string; sub: string; color: string; strike?: boolean }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${strike ? "#FADDD8" : "#E3E8EE"}`, borderRadius: 6, padding: "12px", background: strike ? "#FEF9F8" : "#fff", textAlign: "center" }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <div style={{ fontSize: 20, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
        {strike && <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "#B5462F", opacity: 0.6, transform: "translateY(-50%)" }} />}
      </div>
      <div style={{ fontSize: 10, color: "#5A6472", marginTop: 4 }}>{sub}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: strike ? "#B5462F" : "#2E7D5B", marginTop: 6 }}>{label}</div>
    </div>
  );
}
