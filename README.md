# PRIMA Executive Gathering 2026

Booth transaction and live leaderboard system.

## Local environment

1. Create Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open project: **Project Settings → API**.
3. Copy `.env.example` to `.env.local`.
4. Fill these variables in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Use Supabase's **Publishable key** for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. If dashboard shows legacy keys, use the `anon` key in this variable. Use `service_role` only for `SUPABASE_SERVICE_ROLE_KEY`; never expose it in browser code or commit it.

5. Apply SQL migration from `supabase/migrations/202607270001_initial_schema.sql`:
	- Supabase Dashboard → **SQL Editor** → New query.
	- Paste migration content.
	- Run.
6. Restart local server after changing `.env.local`:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

```powershell
npm run dev
npm run lint
npm run typecheck
npm run build
```

## Routes

- `/login`
- `/booth`
- `/cashier`
- `/admin`
- `/display?fullscreen=1`

Supabase database schema, seed participants, transactional order RPCs, authentication, and protected API routes are connected. UI routes still contain demo presentation data; operational screens will be wired to these APIs in the next implementation increment.

See `EVENT-DAY-RUNBOOK.md` for local accounts and event preparation steps.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
