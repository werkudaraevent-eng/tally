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
- [ ] Test EDC payment, cash payment, partial payment, hand-over, void, and export.
- [ ] Confirm projector URL and fullscreen.
- [ ] Confirm auto-void scheduler calls `POST /api/cron/auto-void` every 5 minutes with `Authorization: Bearer <CRON_SECRET>`.

## Operational rules

- Offline banner means stop mutation. Do not create order offline.
- Booth owns only its own booth orders.
- Cashier owns settlement and normal void.
- Admin owns settings, export, and override operations.
- Never share `SUPABASE_SERVICE_ROLE_KEY`.
- Reconcile cashier total against EDC settlement.
