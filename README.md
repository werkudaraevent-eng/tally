# Tally

One multi-event platform (Next.js + Supabase) for running live events: public event pages, registration, the participant area, check-in and scanners, seating, agenda, logistics, messages, lucky draw, live voting, stage screens, and booth sales.

## Where to read

| Document | What it is |
| --- | --- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | What the platform does today: every module, who uses it, what the organiser sets in the CMS, and what was decided against. |
| [`docs/STATUS.md`](docs/STATUS.md) | What is in flight, what waits on whom, parked Lows. Updated by every PR. |
| [`DESIGN.md`](DESIGN.md) | UI source of truth: palette, type, motion, components. |
| [`CLAUDE.md`](CLAUDE.md) | Rules for every coding agent (and a good summary for humans): production safety, data rules, roles, language. |
| [`docs/ops/cron.md`](docs/ops/cron.md) | Scheduled jobs (pg_cron and the external cron) and how to check them. |

History lives in `git log` and PR descriptions.

## Local development

```bash
npm install
npm run dev
```

Never point a local run at the production database. Use a local Postgres (apply `supabase/migrations/` in order) or a fake PostgREST, and stub every email and WhatsApp sender. See "Running locally" in `CLAUDE.md`.

Environment variables are read through `src/lib/env.ts`. The Supabase ones are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (server only, never in browser code).

## Checks before a PR

```bash
npm run typecheck
npm run check
npm run lint
npm run build
```

## URL shape

- `/login`, then `/events` (event picker). `/users` is workspace-wide.
- `/e/<slug>` is the public event page (`/e/<slug>/en`, `/e/<slug>/id` for other languages). Other event-scoped pages are `/e/<slug>/<page>`, which `src/proxy.ts` rewrites to `/<page>?eventSlug=<slug>`.
- Admin is `/e/<slug>/admin/...`. Participant, staff and stage screens are listed per module in `docs/PRODUCT.md`.
