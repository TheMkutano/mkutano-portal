# Mkutano Design System
Convening Portal · McKinsey-derived palette · Inter typeface

---

## Brand Colors

| Name           | Hex       | CSS Token              |
|----------------|-----------|------------------------|
| Primary Blue   | `#2A6FB0` | `--brand-primary`      |
| Accent Blue    | `#1B9DD9` | `--brand-accent`       |
| Navy           | `#0A2F5C` | `--brand-navy`         |
| Ink            | `#0F1F33` | `--brand-ink`          |
| Tint           | `#EEF3F9` | `--brand-tint`         |
| Page BG        | `#F6F8FB` | `--brand-page-bg`      |
| Border         | `#E3E8EE` | `--brand-border`       |
| Text Secondary | `#5A6472` | `--brand-text-secondary` |
| Primary Dark   | `#245d95` | `--brand-primary-dark` |

---

## Semantic / Status Colors

| Token                  | Hex       | Usage                          |
|------------------------|-----------|--------------------------------|
| `--status-completed`   | `#2E7D5B` | Task complete                  |
| `--status-inprogress`  | `#2A6FB0` | Task in progress               |
| `--status-blocked`     | `#B5462F` | Task blocked                   |
| `--status-notstarted`  | `#9AA4B0` | Task not started               |
| `--variance-fav`       | `#2E7D5B` | Favourable budget variance     |
| `--variance-adv`       | `#B5462F` | Adverse budget variance        |
| `--destructive`        | `#C44B2B` | Delete / danger actions        |

---

## Typography — Inter

| Level              | Size  | Weight | Notes                            |
|--------------------|-------|--------|----------------------------------|
| Page title         | 22px  | 600    | Never `text-3xl font-bold`       |
| Section heading    | 14px  | 600    |                                  |
| Body               | 13px  | 400    |                                  |
| Table header       | 11px  | 500    | Uppercase · `--text-secondary`   |
| Numbers            | 13px  | 400    | Always `tabular-nums`            |
| Caption / label    | 11px  | 400    | `--text-secondary`               |

---

## Tier Badges — Tonal (never solid/dark)

| Tier     | Background  | Text      |
|----------|-------------|-----------|
| Platinum | `#EEF1F6`   | `#0A2F5C` |
| Gold     | `#FBF3E2`   | `#8A6516` |
| Silver   | `#F0F2F4`   | `#5A6472` |
| Bronze   | `#F5EDE4`   | `#7A4C2C` |

> ❌ Never `bg-gray-900 text-white` or `bg-amber-600 text-white`

---

## Role Badges — Tonal

| Role         | Background  | Text      |
|--------------|-------------|-----------|
| Admin        | `#EEF1F6`   | `#0A2F5C` |
| Curator      | `#EDF5FF`   | `#1D5FA8` |
| Finance      | `#FBF3E2`   | `#8A6516` |
| PartnerLead  | `#F0F5F0`   | `#2E6B3E` |
| SpeakerLead  | `#F5EEF8`   | `#7B3F9E` |
| Ops          | `#F0F2F4`   | `#5A6472` |
| PressManager | `#FFF4EF`   | `#9B3E1A` |
| Advisor      | `#F5EDE4`   | `#7A4C2C` |
| Client       | `#EEF3F9`   | `#2A6FB0` |
| External     | `#F0F2F4`   | `#5A6472` |

---

## Pipeline Stages

| Stage       | Background  | Text      |
|-------------|-------------|-----------|
| Prospect    | `#F0F2F4`   | `#5A6472` |
| Outreach    | `#EDF5FF`   | `#1D5FA8` |
| Negotiation | `#FBF3E2`   | `#8A6516` |
| Committed   | `#EEF7F2`   | `#2E6B3E` |
| Onboarded   | `#E6F7F0`   | `#2E7D5B` |
| Declined    | `#FEF0EE`   | `#B5462F` |

---

## Buttons

| Variant     | Background  | Text      | Border     | Height |
|-------------|-------------|-----------|------------|--------|
| Primary     | `#2A6FB0`   | `#fff`    | `#245d95`  | 32px   |
| Secondary   | `#EEF3F9`   | `#2A6FB0` | `#C8D8EA`  | 32px   |
| Outline     | `#fff`      | `#0F1F33` | `#D4D9DF`  | 32px   |
| Ghost       | transparent | `#5A6472` | none       | 32px   |
| Destructive | `#C44B2B`   | `#fff`    | `#a83a1e`  | 32px   |

- Small size: 28px height, `px-10`
- Font: 13px / 500 · Border-radius: 4px

---

## Form Elements

- Input height: 32px
- Border: `1px solid #D4D9DF`
- Border-radius: 4px
- Font: 13px / 400
- Focus ring: `2px solid #2A6FB0`

---

## Budget Variance Semantics

**Expense rows:** `variance = committed − actual`
- actual < committed → positive → **Favourable** → `#2E7D5B`
- actual > committed → negative → **Adverse** → `#B5462F`

**Income rows:** `variance = actual − committed`
- actual > committed → positive → **Favourable** → `#2E7D5B`
- actual < committed → negative → **Adverse** → `#B5462F`

**Net P&L:**
- Show `—` when `income.length === 0 || expenses.length === 0`
- Only render the Net P&L table row when both income and expenses are populated
- Sign must always agree with colour

---

## Chart Palette (Recharts)

| Token      | Hex       | HSL                  | Role             |
|------------|-----------|----------------------|------------------|
| `chart-1`  | `#2A6FB0` | `213 62% 43%`        | Primary Blue     |
| `chart-2`  | `#1B9DD9` | `202 73% 48%`        | Accent Blue      |
| `chart-3`  | `#EDB218` | `45 93% 47%`         | Amber            |
| `chart-4`  | `#9933FF` | `280 80% 50%`        | Violet           |
| `chart-5`  | `#808080` | `0 0% 50%`           | Neutral grey     |

---

## Spacing Scale

`4 · 8 · 12 · 16 · 24 · 32 · 48px`

Base spacing unit: `0.25rem` (4px)

---

## Border Radius

| Name  | Value | Usage              |
|-------|-------|--------------------|
| sm    | 2px   | Badges, chips      |
| md    | 4px   | Inputs, buttons    |
| lg    | 6px   | Cards              |
| card  | 8px   | Modals, panels     |

Base: `--radius: 0.25rem` (4px)

---

## Empty State Rules

| Display | Meaning                         | When to use                    |
|---------|---------------------------------|--------------------------------|
| `—`     | Data is absent / not recorded   | Field has no value at all      |
| `$0`    | Zero, explicitly counted        | Confirmed zero value           |
| ~~`−$0`~~ | Computed delta from empty input | ❌ Never — scary and wrong   |

> "$0" ≠ "—" — zero means counted and empty; dash means data absent.
> Net P&L shows "—" if either income or expenses array is empty.

---

## Source of Truth

| What              | Where                                                    |
|-------------------|----------------------------------------------------------|
| CSS tokens        | `artifacts/portal/src/index.css`                         |
| Design decisions  | `.agents/memory/mkutano-design-system.md`                |
| Permission matrix | `artifacts/api-server/src/lib/permissions.ts`            |
| OpenAPI contract  | `lib/api-spec/openapi.yaml`                              |
