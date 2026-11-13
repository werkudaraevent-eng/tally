# Security

Tally runs live events: registration, check-in, lucky draws and voting for real participants. Please report security problems privately, not in a public issue.

## Reporting a problem

- Use GitHub's **Report a vulnerability** button on this repository (Security tab). It opens a private advisory that only the maintainers can read.
- Say what you found, where, and how to reproduce it. Leave out real participant data; a fake account or a draft event is enough.
- Please do not test against events that are live, and do not try to read or change other people's data beyond what you need to show the problem.

We reply within a few working days. We will tell you when it is fixed, and credit you if you want.

## How Tally is protected (summary)

- **Staff accounts.** Sessions live on the server and can be revoked: signing out, a new PIN or a deactivated account ends them. Admin and super admin accounts sign in with a password and an authenticator app code, with one-time recovery codes. Device accounts (booth, cashier, scanner) use a PIN and are limited to their event and role.
- **Access per event.** Every admin API checks the caller's role for that event on the server. A missing or unreadable access row means no access.
- **Database.** Row level security is on, and the browser never writes to the database directly; the server does, after its own checks.
- **Participants.** Participants sign in per event. Personal links are signed, and a participant's QR code is never sent to non-admin roles.
- **Rate limits.** Staff sign-in and the authenticator code step are rate limited.
- **Headers.** Pages cannot be framed by other sites, and responses carry `nosniff` and an explicit referrer policy.

## Rules for contributors (and agents)

- Never commit credentials, project references, internal URLs, email addresses or details of a weakness that is not fixed yet. This repository is public.
- Open security items are tracked privately with the project owner, not in `docs/STATUS.md`.
- Production schema changes are written as a reviewed SQL file and run by the owner. See `CLAUDE.md` > Production safety.
- What to do when something goes wrong in production: `docs/ops/insiden.md`.
