# Mkutano Convening Portal

A multi-convening event management CRM for the Mkutano team. Manage partners, speakers, media consent, budget, and operational tasks across convenings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/portal run dev` — run the React portal (port 25265)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed database with demo data
- `pnpm --filter @workspace/scripts run isolation-test` — run tenant-isolation unit tests
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (wildcard syntax `/{*splat}`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- API client: generated React Query hooks in `lib/api-client-react`
- Auth: custom email/password auth (bcryptjs, `/api/auth/password-login`, `/api/auth/register` restricted to `@themkutano.com`), plus a Partner request-access flow. NOT Replit Auth OIDC, despite `@workspace/replit-auth-web` appearing in dependencies.
- Frontend: React 19 + Vite + Tailwind v4 + shadcn/ui + wouter
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — all Drizzle table definitions (source of truth)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `artifacts/api-server/src/routes/` — all Express route handlers
- `artifacts/portal/src/pages/` — all portal page components
- `artifacts/portal/src/components/layout/` — Shell + Sidebar
- `artifacts/portal/src/contexts/ConveningContext.tsx` — active convening state
- `scripts/src/seed.ts` — seed data script
- `scripts/src/isolation-test.ts` — tenant-isolation test (runs without a browser)

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval codegen → typed React Query hooks + Zod schemas
- Role-based access: 8 internal roles (Admin, Curator, Finance, PartnerLead, SpeakerLead, Ops, PressManager, Advisor) + Client/External
- First authenticated user auto-bootstraps as Admin (see `/api/me` route)
- Internal users see all convenings; External/Client users see only their `conveningAccess` list
- Express 5: `req.params.id` types as `string | string[]` — always use `String(req.params.id)` in Drizzle where clauses

## Security standing requirements (enforced per PR / before client onboarding)

1. **Permission middleware on every mutating route** — all POST/PATCH/DELETE routes must use `requirePermission(perm)`. New routes without it must be justified and documented.
2. **Tenant isolation** — External/Client users are scoped to their `conveningIds` list. `requireConveningAccess()` must be applied to any route that accepts a `conveningId` query param or body field. Run `pnpm --filter @workspace/scripts run isolation-test` — all assertions must pass.
3. **Soft delete, not hard delete** — tables with `deletedAt` must use `set({ deletedAt: new Date() })` on DELETE, and `notDeleted(table)` must be added to all SELECT WHERE clauses on those tables.
4. **Audit trail** — `writeAudit(...)` (fire-and-forget) must be called for Create, Update, Delete, and Export actions. `actorUserId` must come from `req.portalUser!.id`.
5. **Zod validation on inputs** — POST/PATCH bodies must be parsed through a Zod schema before being passed to Drizzle. Field-level errors (`{ errors: { field: message } }`) must be returned on 422.
6. **CSV export auth** — any `/export` or `/csv` endpoint must require `delegates:export` (or equivalent) permission and must call `writeAudit` with action `"Export"`.
7. **Rate limiting on high-risk endpoints** — `/verify` and similar unauthenticated or semi-public endpoints must have an in-memory rate limiter (30 req/min per IP, sliding window).
8. **No secrets in logs** — never log `req.body` directly; log structured summaries only. `console.log` is forbidden in server code; use `req.log` or the `logger` singleton.

## Product

- **Dashboard** — readiness score, speaker confirmation rate, partner funnel, session diversity
- **Partners CRM** — institutional partners with pipeline stages (Prospect → Onboarded), financial commitments, engagement history
- **Speakers CRM** — speaker roster with invitation lifecycle, session assignments, media consent tracking
- **Tasks** — workstreams with kanban-style task tracking (click circles to advance status)
- **Budget** — committed vs. actual spend by category with variance tracking
- **Settings** — user/role management (Admin only)
- **Audit Log** — filterable history of all CUD + export actions (Admin only, `/audit`)
- **Trash** — restore or permanently delete soft-deleted records (Admin only, `/trash`)
- **Multi-convening switcher** — sidebar dropdown to switch between convenings

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Express 5 wildcard: use `/{*splat}` not `/*` for catch-all routes
- After changing `lib/*` packages, run `pnpm run typecheck:libs` before leaf package checks
- `pnpm --filter @workspace/scripts run seed` requires `@workspace/db` to be built first (`pnpm run typecheck:libs`)
- The analytics `diversity` field is `{ name, value }[]` — session types, not gender breakdown
- Budget amounts are `number` in the API schema (not strings) — use `??` not `|| "0"`
- Generated React Query hooks require `queryKey` in `options.query` — pass the appropriate `get*QueryKey()` getter
- `req.portalUser` is attached by `portalUserMiddleware` after `authMiddleware` — it includes `conveningIds` for External/Client users
- `notDeleted(table)` returns `isNull(table.deletedAt)` — use it in every SELECT WHERE on soft-delete tables
- `writeAudit` is fire-and-forget (`void writeAudit(...)`) — it logs errors internally but never throws
- `requirePermission(perm)` returns a middleware that checks `req.portalUser.role` against the permission matrix in `lib/permissions.ts`
- `requireConveningAccess()` checks that External/Client users only access their own convenings
- Budget `committedAmount` / `actualAmount` are Drizzle `numeric` columns — they return and accept `string` in JS (not `number`). Use `z.string()` in Zod schemas for those fields, not `z.number()`
- DB enum columns (`budgetCategoryEnum`, `commitmentCategoryEnum`, `documentTypeEnum`, `templateCategoryEnum`, etc.) require Zod enum literals that match the enum values exactly — a plain `z.string()` will fail TypeScript even if it works at runtime. Always define a `const VALUES = [...] as const` and use `z.enum(VALUES)` to stay in sync with the Drizzle schema
- **Always use `uniqueIndex()` (not `unique()`) for unique constraints in Drizzle schemas.** `unique()` creates a UNIQUE CONSTRAINT; drizzle-kit push v0.31 requires interactive TTY to apply it (even with `--force`). `uniqueIndex()` creates a UNIQUE INDEX, which push applies non-interactively. The post-merge script runs with stdin closed, so `unique()` breaks every merge that touches unique constraints.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- OpenAPI spec lives at `lib/api-spec/openapi.yaml` — edit this, then run codegen
- Permission matrix: `artifacts/api-server/src/lib/permissions.ts`
- Audit helper: `artifacts/api-server/src/lib/audit.ts`
- Soft-delete helper: `artifacts/api-server/src/lib/softDelete.ts`
- Tenant isolation middleware: `artifacts/api-server/src/middlewares/requirePermission.ts`
