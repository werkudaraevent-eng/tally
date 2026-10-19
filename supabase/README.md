# Supabase

`migrations/` holds every schema change in version order. Production has a few columns these migrations don't create (see "Production safety" in `CLAUDE.md`); local QA databases add them by hand.

- Local: use the Supabase local stack; plain Postgres lacks pg_cron, pg_net, Vault and the Supabase roles the migrations use. Never run them against production from a laptop or an agent.
- Production: a schema change ships as a reviewed SQL file that the project owner runs in the SQL editor, with a read-only post-check. The full rules are in `CLAUDE.md`.

`seed.sql` is demo data from the first single-event version. It is not maintained; don't rely on it.
