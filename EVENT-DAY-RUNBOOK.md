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
- [ ] Create cashier and admin users.
- [ ] Replace demo PIN hashes.
- [ ] Change `CRON_SECRET` to a random production value.
- [ ] Run `npm run build`.
- [ ] Deploy HTTPS; camera requires secure context.
- [ ] Install PWA on Android booth devices and cashier tablet.
- [ ] Test camera permission and QR scan.
- [ ] Test two devices claiming same participant discount simultaneously.
- [ ] Decide the cashier confirmation mode in Settings before doors open, not mid-event.
- [ ] Review active payment methods in Settings; confirm each one's reference rule.
- [ ] Test payment for every active method, plus partial payment, hand-over, void, and export.
- [ ] Confirm projector URL and fullscreen.
- [ ] Confirm auto-void scheduler calls `POST /api/cron/auto-void` every 5 minutes with `Authorization: Bearer <CRON_SECRET>`.

## Operational rules

- Offline banner means stop mutation. Do not create order offline.
- Booth owns only its own booth orders.
- Cashier owns settlement and normal void.
- Admin owns settings, export, and override operations.
- If cashier confirmation is off, booth orders are final on creation and count toward top spender immediately. Booth staff can void their own orders with a reason; no payment method is recorded, so EDC reconciliation does not apply.
- Switching cashier confirmation off settles every pending order in the queue. Do it before doors open, or announce it first.
- Never share `SUPABASE_SERVICE_ROLE_KEY`.
- Reconcile cashier total against EDC settlement, then against any other active method separately.
- Payment methods are managed in Settings. Disable a method instead of deleting it; at least one must stay active or the cashier cannot settle.
