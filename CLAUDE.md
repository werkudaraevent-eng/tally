@AGENTS.md

<!-- antislop:start -->
## antislop

For UI, copy, or layout work, load the antislop core first by running `/antislop`. It is a filter against generic AI-generated UI. It is not a source of design direction: that lives in `DESIGN.md`, which is authoritative for palette, typography, motion tier, and the calm/expressive split per screen.

antislop is enabled as a plugin in `.claude/settings.json` (marketplace `miqdadbadjuber/anti-slop`, plugin `antislop@anti-slop`), so local and cloud sessions both load it. The plugin ships the core and every sub-skill: `antislop-ui`, `antislop-copywriting`, `antislop-human`, `antislop-layoutmobile`, `antislop-code`. Load the sub-skill that matches the task alongside the core.

Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->

# Tally: rules for every agent

Tally is one multi-event platform (Next.js + Supabase) that runs real, live events: public event pages, registration, participant area, check-in and scanners, seating, agenda, logistics, lucky draw, voting, booth and cashier. The project owner is Hanung (call him "Mas"; he writes Bahasa Indonesia, so reply to him in Bahasa Indonesia).

Read `docs/STATUS.md` before you start: it says what is in flight, what waits on whom, and which known Lows are parked per area. `DESIGN.md` is authoritative for palette, type and motion. `STATUS-MULTI-EVENT.md` and `tasks/*.md` are older snapshots, not the current state.

## Every PR updates docs/STATUS.md

- Each PR changes `docs/STATUS.md` in the same PR: move the item between "In flight" and done, add the Lows you park, remove the ones you fix, change "Waiting on".
- History lives in `git log` and PR descriptions. Do not keep a hand-written changelog: a second copy drifts. Write PR descriptions so they stand alone (Before / After / How, what was tested).
- Never put credentials, project refs, internal URLs, people's emails or unfixed security weaknesses in this repo (it is public). Write only "open security items are tracked privately with the project owner".

## Production safety (non-negotiable)

- `main` auto-deploys to production for ALL events at once. Time merges around live events; a visible change to an event in client review needs Mas's OK on timing.
- Vercel preview deployments use the PRODUCTION database. Never press Save on a real event from a preview; test writes and sends only on a draft event.
- Agents never run SQL against production. Prod schema changes are written as a reviewed SQL file and Mas runs it himself:
  - wrap in `begin; ... commit;`, `set local lock_timeout = '5s'`, end with `notify pgrst, 'reload schema';`; guard every delete;
  - ship a read-only post-check (one combined `select` of booleans; the Supabase SQL editor shows only the last result). It must return false, not error, before the migration: reference new columns via `to_jsonb(r)->'col'`;
  - a function rewrite needs an md5 pre-check of the current body using `md5(replace(prosrc, E'\r',''))` (bodies pasted through the SQL editor carry CRLF);
  - replay it on a local Postgres first;
  - code that depends on it merges only after Mas has run it and the post-check output is seen. Say what breaks if the code merges first.
- Migration file versions (`supabase/migrations/YYYYMMDDNNNN_*.sql`) must not collide with ones already on `main`. Check before naming.
- Production has some columns the repo migrations don't create (e.g. `participants.seats`, `participant_type`, `rsvp_status`, `source_*`). Local QA databases add them by hand.
- Never push empty commits, never force-push someone else's branch, never skip or disable tests to get green.
- Never rotate the invite-link secret (it breaks every link already sent). Cron secrets live in several places and rotate together.

## Running locally

- Never point local runs at production. If your shell exports production Supabase or app secrets, run `next` with all of them unset (`env -i ...` or `env -u` for every `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, `DATABASE_URL`, session/invite/cron secrets, `RESEND*`) and confirm zero requests reach the production host.
- Use a local Postgres or a fake PostgREST, and stub every email/WhatsApp sender.
- Checks before a PR: `npm run typecheck`, `npm run check`, `npm run build` (and `npm run lint`). New pure logic gets a `*.check.ts` added to the `check` script; on merge conflicts in that script, keep the union.
- This Next.js version differs from older ones: read `node_modules/next/dist/docs/` before relying on an API (see `AGENTS.md`).

## Data rules and gotchas

- Every table and RPC is scoped by `event_id`; event-scoped admin APIs must filter by it. Cross-event FKs are composite `(event_id, id)`.
- Reads cap at 1,000 rows (RPCs too). Page bulk reads with keyset paging and chunk large `.in()` lists.
- `qr_code` is never sent to non-admin roles.
- `landing_config` writers use an `updated_at` compare-and-swap; clients must send the `updated_at` they LOADED, or a stale tab overwrites newer work.
- Registration rows are created only through the `submit_event_registration` RPC.
- Staff auth is the `tally_session` cookie. Participants sign in per event: email + password by default, or email code / two participant fields when the event chooses; imported and walk-in participants get a one-time link.
- Sends (email blasts, confirmation mail) run in `after()`, never awaited inside a request a desk is waiting on.
- `not seats cs ...` in PostgREST drops NULL rows; PostgREST < 14 returns `[]` on PATCH + select.

## Roles

- Admin (per event) can configure everything; Logistics is for event admins only. There is no "editor" role.
- Scanner needs a per-event access row.
- Viewer is a read-only client; the client view `/e/<slug>/live` shows only the client columns plus the event's chosen client fields.

## Language

- Admin and staff screens (`/admin`, `/scan`, `/booth`, `/cashier`, print station) are English only, en-GB spelling.
- Public pages, the participant area, badges, emails and stage screens follow the event's language.

## Product and design rules

- One CMS for all events. No hardcoded per-event lists or options; everything is data the admin sets.
- New options ship so existing events change by 0 px. Anything that sends a message is a per-event switch, default off.
- One setting lives in one place. Admin lists link to the screen that edits each thing ("Edit in Agenda ↗"); never duplicate an editor. Mas must instantly see where to configure anything.
- The editor follows the chosen preset: show only fields the layout renders, and every option must show in preview and live.
- Material 3, Inter, 4/8 grid. Admin is dense: 36 px controls. Public UI wears the event's look, tap targets ≥ 48 px. Primary screen size to check: 1280×588 and 390 wide (also 768-1279).
- Mockup on a real render before writing UI code, and ground proposals in how well-known apps solve the same problem.
- Rejected before, don't propose again: big speaker cards, carousels, side sheets, 96 px heroes, purple greys, per-element pixel controls, checkbox event pickers, coloured left-border accents, forced-uppercase titles, a standalone sign-in page (sign-in is a dialog over the event page), centred/narrow desktop layouts that waste space, inconsistent header heights between portal tabs, disabled primary buttons with no reason shown, announcements at the bottom of participant home, a QR button in the portal top bar, start/end time stacked on two lines (write "10:00 - 13:00"), paste fields for hundreds of names (use template import), mixing topics on one portal page (one page per topic), a free-form page builder.

## Working with Mas

- Be a firm UI/UX partner, not a yes-man: give one recommendation, with a picture, and say why.
- He reads on his phone: put mockups in a shareable page with images embedded, not local file paths. Give SQL for him inline, one statement or select per run.
- Merge only after he picks a merge time. If he says "merge sekarang" before QA ends, merge; QA continues and findings become a follow-up PR. Don't hold a merge for Lows.
- Merges into `main` are timed around live events (see "Waiting on" in `docs/STATUS.md`).
