# Mkutano Convening Portal

This repository is a pnpm/TypeScript monorepo: a React/Vite portal in `artifacts/portal`, an Express API in `artifacts/api-server`, and shared libraries under `lib/`. The API contract lives in `lib/api-spec/openapi.yaml`; generated clients/types live under `lib/api-client-react` and `lib/api-zod`. PostgreSQL/Drizzle table definitions live in `lib/db/src/schema`. Seed and maintenance scripts are under `scripts`; checked-in runtime assets are under the portal's `public` directory. Large documents and media remain in company Google Drive and are not copied into GitHub.

**Export status:** The current app runs with Replit-managed routing, PostgreSQL and object storage. A Git checkout alone is **not** a working Vercel deployment. Read [MIGRATION.md](MIGRATION.md) before configuring Vercel or transferring live data. Do not run the demo seed against an existing or production database.

## Requirements

- Node.js 24 and pnpm compatible with `pnpm-lock.yaml` (enable via Corepack).
- PostgreSQL 16-compatible database and a `DATABASE_URL` accessible from the API.
- A persistent HTTP server and same-origin routing for `/api/*` to Express and all other paths to the Vite SPA. The current server requires a `PORT`; Vite also requires `PORT` and `BASE_PATH`. Use **different** ports when starting API and portal locally.
- For uploads, email, and Sheets sync, configure the services described in [MIGRATION.md](MIGRATION.md). Replit's object-storage sidecar is not available outside Replit.

Copy `.env.example` to a **local, untracked** `.env` and populate only the services you actually use. The scripts do **not** automatically load `.env`; export the required values in your terminal or use a private environment loader. Never commit values or data exports.

## Install and local development

From the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Provision a **disposable development** PostgreSQL database first, and explicitly export its URL. Drizzle's `push` applies the current schema directly; it is **not** a historical migration runner and must not be run against production. With a confirmed disposable database only:

```sh
export DATABASE_URL='your-local-development-database-url'
pnpm --filter @workspace/db run push
```

Start two terminals from the repository root, both with the correct development `DATABASE_URL` where needed:

```sh
# Terminal 1: API
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2: portal
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/portal run dev
```

The portal makes same-origin `/api/*` requests. Outside Replit, put a local reverse proxy in front of these ports (forward `/api/*` to 8080 and everything else to 5173); the Vite config does not contain a local `/api` proxy. The sign-in cookie is `Secure`, so authentication requires HTTPS or a carefully configured local TLS proxy; simply browsing plain HTTP may not retain a session. Replit's existing preview supplies its own routing.

For **new disposable databases only**, `pnpm --filter @workspace/scripts run seed` runs the included example/demo seed (`scripts/src/seed.ts`); it writes multiple records and must **never** be used to reconstruct or overwrite live customer data. Real data is stored separately in PostgreSQL and object storage, not in this Git repository. Do not use files under `attached_assets` as a substitute for a database backup.

## Typecheck and build

```sh
pnpm run typecheck
pnpm run build
```

The root build invokes typechecking and workspace builds. To build services individually:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/portal run build
pnpm --filter @workspace/api-server run build
```

The portal output is `artifacts/portal/dist/public`; the API output is `artifacts/api-server/dist/index.mjs`. To start a built API on an appropriately provisioned persistent host, set `PORT`, `DATABASE_URL` and applicable service settings, then run `pnpm --filter @workspace/api-server run start`. API health is `/api/healthz`. Built output is generated and excluded from Git.

## Deployment architecture

The existing Replit production artifact builds the portal as a static SPA (all non-API paths rewrite to `index.html`) and runs Express continuously behind `/api/*` (`artifacts/*/.replit-artifact/artifact.toml`). Preserve the same-origin URL arrangement for cookie authentication, uploads and API calls. The current Express entry point calls `app.listen`, launches three in-process schedulers, and depends on Replit object-storage credentials; it is **not** a Vercel serverless function as-is. A Vercel frontend can host the static portal **after** configuring `PORT`/`BASE_PATH` during build and an HTTPS same-origin `/api/*` rewrite to a separately hosted persistent API. Alternatively, engineering can adapt the API, storage and scheduled jobs for Vercel functions and Vercel Cron, with a tested database connection strategy. Neither deployment adaptation nor production cutover is included in the export.

The Replit artifact manifests are retained as deployment metadata. The root `.replit` file is deliberately excluded from this export because it contains a live Apps Script endpoint and recipient addresses; the existing Replit workspace keeps its original file unchanged. These files are not Vercel configuration. See [MIGRATION.md](MIGRATION.md) for prerequisites, database safety, external integrations, and cutover/rollback.