# PRIMA Executive Gathering 2026 — Event-Day Runbook

## Demo accounts

These accounts exist in development Supabase project only:

| Username | Role | Booth | PIN |
| --- | --- | --- | --- |
| `ratna.booth3` | Booth | 3 | `123456` |
| `kasir.utama` | Cashier | — | `123456` |
| `admin.prima` | Admin | — | `123456` |

Replace all demo PINs before production event.

## Start local app

```powershell
npm run dev
```

Open `http://localhost:3000/login`.

## Device routes

- Booth: `/booth`
- Cashier: `/cashier`
- Admin: `/admin`
- Projector: `/display?fullscreen=1`

## Pre-event checklist

- [ ] Replace `[isi nama item]` on all six booths.
- [ ] Import real participants CSV.
- [ ] Create one user per booth and assign correct `booth_id`.
- [ ] Create cashier and admin users. Give the client an `admin` account, never `super_admin`.
- [ ] Confirm at least one active `super_admin` exists and its PIN is held only by the system owner.
- [ ] Replace demo PIN hashes.
- [ ] Change `CRON_SECRET` to a random production value.
- [ ] Run `npm run build`.
- [ ] Deploy HTTPS; camera requires secure context.
- [ ] Install PWA on Android booth devices and cashier tablet.
- [ ] Test camera permission and QR scan.
- [ ] Test two devices claiming same participant discount simultaneously.
- [ ] Test two devices claiming the same global offer (Tebus Murah) at different booths simultaneously; only one may succeed.
- [ ] Decide the cashier confirmation mode in Settings before doors open, not mid-event.
- [ ] Review special offers in `/admin/offers`: price, scope, per-participant quota, minimum accumulated spend, and whether each one counts toward top spender.
- [ ] Verify the Tebus Murah threshold with a real participant below and above the limit.
- [ ] Review active payment methods in Settings; confirm each one's reference rule.
- [ ] Test payment for every active method, plus partial payment, hand-over, void, and export.
- [ ] Confirm projector URL and fullscreen.
- [ ] Confirm auto-void scheduler calls `POST /api/cron/auto-void` every 5 minutes with `Authorization: Bearer <CRON_SECRET>`.

## Operational rules

- Offline banner means stop mutation. Do not create order offline.
- Booth owns only its own booth orders.
- Cashier owns settlement and normal void.
- Admin owns settings, export, and override operations.
- Audit trail lives at `/admin/audit`, visible to `super_admin` only (BR-18). Use it to answer "who changed this setting" without opening the database. Config changes survive a trial data reset; transaction logs do not.
- Two admin tiers (BR-17). `admin` is the client-facing role: everything operational, plus viewing the user list and resetting `booth`/`cashier` PINs. `super_admin` additionally owns clearing recorded data and managing accounts or roles - both irreversible.
- If an operator forgets their PIN mid-event, the client can reset it themselves from User & role. No need to reach the system owner.
- If cashier confirmation is off, booth orders are final on creation and count toward top spender immediately. Booth staff can void their own orders with a reason; no payment method is recorded, so EDC reconciliation does not apply.
- Switching cashier confirmation off settles every pending order in the queue. Do it before doors open, or announce it first.
- Never share `SUPABASE_SERVICE_ROLE_KEY`.
- Reconcile cashier total against EDC settlement, then against any other active method separately.
- Payment methods are managed in Settings. Disable a method instead of deleting it; at least one must stay active or the cashier cannot settle.
- Special offers are managed in `/admin/offers` only. The Booth & item page shows a summary and links there; it no longer edits price, quota, or stock. A booth's discount item row is created automatically when the booth is created.
- Offer `code` cannot be changed after creation. Scope and booth can still be changed while the offer has no claims; after the first claim they lock. Builtin booth offers can never change scope.
- Special offers are managed in `/admin/offers`. Disable instead of deleting; anything already claimed cannot be deleted.
- Changing an offer's price or top-spender flag only affects future claims. Existing claims keep the values captured at claim time, so projector figures never shift on their own.
- If a participant's spend drops below an offer threshold after a void, the claim already made stays valid. Barang sudah di tangan peserta.
