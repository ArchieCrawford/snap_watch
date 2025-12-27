# SnapSearch

SnapSearch is a TypeScript monorepo that ingests Farcaster Hub events, computes deterministic causality scores, and serves a Google-like Mini App UI.

## Repo layout

- `apps/api`: Fastify REST API for search + analytics
- `apps/worker`: Hub ingest + backfill worker
- `apps/web`: Next.js Mini App UI
- `packages/core`: scoring + shared types
- `packages/db`: Drizzle schema + DB helpers
- `packages/ui`: shared Tailwind UI components
- `supabase/migrations`: SQL migrations + RLS

## Requirements

- Node 18+
- pnpm
- Supabase CLI (for migrations)

## Setup

1) Install dependencies

```
pnpm install
```

2) Create env files

```
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
```

Update `SUPABASE_DB_URL` in `apps/api/.env` and `apps/worker/.env` with your Supabase connection string (or a local Postgres URL if using `USE_LOCAL_DB=1`).

3) Link your Supabase project and push migrations

```
supabase link --project-ref vdagcnletgoazzorxpua
pnpm db:push
```

## Development

Start the stack (API + worker + web). By default this uses Supabase remote.

```
pnpm dev
```

To start a local Postgres instance and point the apps at it:

```
USE_LOCAL_DB=1 pnpm dev

## Production deployment (Vercel + Render + Supabase)

Recommended split:

- **Vercel**: `apps/web` (Next.js UI)
- **Render**: `apps/api` (Fastify API) + `apps/worker` (long-running Farcaster ingest)
- **Supabase**: Postgres + Auth (keys)

This repo includes a Render Blueprint at [render.yaml](render.yaml).

### 1) Supabase

- Create a Supabase project.
- Apply the schema in [supabase/migrations/20250101000000_init.sql](supabase/migrations/20250101000000_init.sql).

You will need:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `SUPABASE_DB_URL` (direct Postgres URL for server-side queries)
- `NEXT_PUBLIC_SUPABASE_URL` (same as `SUPABASE_URL`, safe for browser)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2) Render (API + worker)

Create a new Render project using the Blueprint in [render.yaml](render.yaml).

Set env vars:

- API service: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
- Worker service: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `HUB_RPC_URL` (default `hub.farcaster.xyz:2283`)

Notes:

- The worker is a continuous process (streams Farcaster hub events). Deploy it as a Render **Background Worker**.
- Logs are written to stdout and also to `logs/*.log` when a writable filesystem exists.

### 3) Vercel (web)

Deploy `apps/web` to Vercel.

Set env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL` (your Render API URL)

# snap_watch
```

## Seed a small dataset

```
pnpm seed
```

Adjust `SEED_HUB_URL` and `SEED_BACKFILL_DAYS` in `apps/worker/.env` if needed.

## API endpoints

- `GET /health`
- `GET /search?q=...&cursor=...&limit=...`
- `GET /topic/resolve?q=...`
- `GET /topic/:topic_id/origin`
- `GET /topic/:topic_id/spread`
- `GET /fid/:fid`
- `GET /thread/:root_hash`

## Scoring overview

Scores are deterministic, explicit heuristics (no ML). Each result returns:

```
{
  origin,
  early_amp,
  downstream,
  quality,
  penalties,
  total
}
```

High level logic:

- Origin score: earliest matching casts, weighted by account reputation and adoption lag
- Early amplifier score: early engagement counts with time decay
- Signal score: unique engagers + meaningful replies + sustained activity
- Spam resistance: penalties for very-new accounts, repeated text, high-volume/low-reply, low follow reciprocity

## Database + RLS

All tables have RLS enabled. Public read policies are defined for casts, users, topics, topic events, and scores. Writes are only performed by API/worker using the service role key.

## Notes

- Simple reads use the Supabase PostgREST client.
- Complex search and ingestion uses direct Postgres.
