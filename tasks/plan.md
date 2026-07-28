# PRIMA Executive Gathering 2026 — Ready-to-Use Plan

## Scope

Deliver operational PWA for event booth staff, cashier, admin, and projector display. Existing spec remains source of truth: `SPEC-prima-executive-gathering-2026.md`.

## Important execution constraint

Agent work runs only while current session/tools remain active. Closing VS Code, sleeping the computer, or ending session stops execution. All completed work is saved in repository files and Supabase migrations.

## Phase 1 — Database foundation

- [x] Apply initial schema migration to Supabase.
- [x] Seed 6 booths.
- [x] Seed 4 demo participants.
- [x] Verify migration list, tables, row counts, settings singleton.
- [x] Add transactional RPCs for participant lookup, order create, settlement, hand-over, void, leaderboard.
- [ ] Add secure role-aware RPC authorization and server-side service wrapper.
- [ ] Add finite stock return rules and auto-void job.
- [ ] Add final RLS policies after auth mapping is implemented.

## Phase 2 — Application foundation

- [x] Next.js App Router TypeScript project.
- [x] UI design system and screen inventory.
- [x] Supabase browser/server helpers.
- [ ] Add middleware/session refresh.
- [ ] Add server auth context and role guard.
- [ ] Add consistent API error contract.
- [ ] Add safe environment validation without leaking secrets.
- [ ] Add PWA manifest/service worker and offline banner.

## Phase 3 — Authentication and roles

- [ ] Choose secure production auth mapping: Supabase Auth identity linked to public users.
- [ ] Add staff users in Supabase Auth and public users table.
- [ ] Implement PIN login without plaintext storage.
- [ ] Enforce role on every server mutation.
- [ ] Enforce booth ownership for booth users.
- [ ] Protect route navigation and redirect unauthorized users.
- [ ] Add session persistence for event duration.
- [ ] Add logout and inactive-user handling.

## Phase 4 — Booth vertical slice

- [ ] QR camera using `@zxing/browser` or approved scanner library.
- [ ] QR lookup via Supabase RPC.
- [ ] Participant identity and discount availability UI from live DB.
- [ ] Order code validation with booth prefix and 3-digit sticker suffix.
- [ ] Create order via transactional RPC.
- [ ] Map unique violation to friendly duplicate-discount message.
- [ ] Map used code, stock, offline, and server errors.
- [ ] Success screen and pickup-mode instructions.
- [ ] Paid order hand-over flow.
- [ ] Manual participant search.

## Phase 5 — Cashier vertical slice

- [ ] Scan/lookup participant.
- [ ] Query pending orders.
- [ ] Partial order selection.
- [ ] Server-calculated total.
- [ ] EDC approval six-digit validation.
- [ ] Cash flow.
- [ ] Atomic all-or-nothing settlement.
- [ ] Immediate mode behavior.
- [ ] Settlement success screen.
- [ ] Void pending/paid order with reason.
- [ ] Persistent transaction/revenue header.

## Phase 6 — Live display

- [ ] Leaderboard query from DB.
- [ ] Server-side privacy formatting.
- [ ] Individual name opt-out.
- [ ] Booth explorer.
- [ ] Activity feed.
- [ ] Admin stats.
- [ ] Five-second polling.
- [ ] Settings polling every 30 seconds.
- [ ] Fullscreen mode.
- [ ] Disabled leaderboard mode.
- [ ] Reduced-motion fallback.

## Phase 7 — Admin operations

- [ ] Admin dashboard stats from DB.
- [ ] Orders table with filters/search/pagination.
- [ ] Pending order chase page.
- [ ] Participant CSV import with validation.
- [ ] Participant privacy flag management.
- [ ] Booth management and stock.
- [ ] Staff user management.
- [ ] Settings update with confirmation dialog.
- [ ] Audit log viewer.
- [ ] CSV reconciliation export.

## Phase 8 — Automation and production hardening

- [ ] Auto-void pending orders every 5 minutes.
- [ ] Protected scheduler endpoint or Supabase scheduled function.
- [ ] Structured server logs with request IDs, no secrets/PII.
- [ ] Security headers and HTTPS deployment config.
- [ ] Rate limiting PIN login and mutation endpoints.
- [ ] Supabase security/performance advisor review.
- [ ] Backup and restore check.
- [ ] Error states and retry behavior.

## Phase 9 — Tests

- [ ] Unit tests: money, validation, privacy, state machine.
- [ ] DB tests: unique discount race, stock, settlement, auto-void.
- [ ] API auth matrix tests.
- [ ] E2E: Booth create order.
- [ ] E2E: Cashier settle EDC/cash/partial.
- [ ] E2E: hand-over and void.
- [ ] E2E: leaderboard/settings propagation.
- [ ] E2E: offline banner and disabled mutations.
- [ ] Browser test at 375px, tablet, and 1920×1080.

## Phase 10 — Event readiness

- [ ] Replace placeholder booth discount names.
- [ ] Import real participant CSV.
- [ ] Create all staff accounts and assign booths.
- [ ] Configure event settings.
- [ ] Deploy HTTPS URL.
- [ ] Install PWA on booth/cashier devices.
- [ ] Test camera permissions.
- [ ] Print and verify sticker code ranges.
- [ ] Run full rehearsal with two devices racing same discount.
- [ ] Verify export and EDC reconciliation.
- [ ] Prepare event-day runbook and emergency fallback.

## Final definition of ready

- All Section 12 acceptance criteria pass.
- No mock data on operational routes.
- No client-only authorization.
- No service-role key in browser bundle.
- Database migration and seed reproducible.
- Supabase advisors reviewed.
- Production URL works on Chrome Android and Safari iOS.
- Admin can export a complete reconciliation CSV.
