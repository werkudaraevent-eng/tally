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
- Attendance scanner: `/scan` — `scanner` or `admin` role
- Projector: `/display?fullscreen=1`
- Operator guide (print): `/panduan` — no login required

## Pre-event checklist

- [ ] Replace `[isi nama item]` on all six booths.
- [ ] Import real participants CSV.
- [ ] Create one user per booth and assign correct `booth_id`.
- [ ] Create cashier and admin users. Give the client an `admin` account, never `super_admin`.
- [ ] Confirm at least one active `super_admin` exists and its PIN is held only by the system owner.
- [ ] Replace demo PIN hashes.
- [ ] Change `CRON_SECRET` to a random production value.
- [ ] For public-registration events: set `RESEND_API_KEY` and `EMAIL_FROM`, and verify the sending domain in Resend first. Leaving them empty is a valid choice — the app then never promises an email anywhere, and the participant code stays visible on the registration success screen and in `/admin/registrasi`. Setting them with an unverified domain is the failure case: every send is rejected and registrants are told a code is coming.
- [ ] Send one test registration to a real inbox and confirm the QR attachment opens. Do this on a draft event, not on the live one.
- [ ] Run `npm run build`.
- [ ] Deploy HTTPS; camera requires secure context.
- [ ] Install PWA on Android booth devices and cashier tablet.
- [ ] Test camera permission and QR scan.
- [ ] Test two devices claiming same participant discount simultaneously.
- [ ] Test two devices claiming the same global offer (Tebus Murah) at different booths simultaneously; only one may succeed.
- [ ] Decide the cashier confirmation mode in Settings before doors open, not mid-event.
- [ ] Print `/panduan` **after** the settings above are final, one copy per booth desk plus one for the cashier. The page adapts to the active settings, so a copy printed earlier can contradict the live flow (BR-19).
- [ ] Walk booth staff through the in-app help panel (the `?` button in the header) during briefing, so they know it exists before the queue starts.
- [ ] Review special offers in `/admin/offers`: price, scope, per-participant quota, minimum accumulated spend, and whether each one counts toward top spender.
- [ ] Verify the Tebus Murah threshold with a real participant below and above the limit.
- [ ] Review active payment methods in Settings; confirm each one's reference rule.
- [ ] Test payment for every active method, plus partial payment, hand-over, void, and export.
- [ ] Confirm projector URL and fullscreen.
- [ ] Confirm auto-void scheduler calls `POST /api/cron/auto-void` every 5 minutes with `Authorization: Bearer <CRON_SECRET>`.
- [ ] Decide the walk-in policy in Admin → Kehadiran. It is **off** by default: switching it on lets the `scanner` account create participant rows, which is the widest permission that account ever gets. Leave it off for events with fixed catering or numbered seating.
- [ ] For label printing: set size, density, and layout in Admin → Label & printer, then pair the printer at each desk from `/scan` (**Sambungkan printer**) and run one test print. Scan that test label with a booth device before doors open — a label that prints but does not scan is worse than no label.
- [ ] Confirm each registration desk that owns a printer runs **Chrome or Edge on Android, Windows, or macOS**. Web Bluetooth does not exist on iPhone, iPad, or Firefox; those devices fall back to saving a PNG that must be printed from the NIIMBOT app.

## Operational rules

- Offline banner means stop mutation. Do not create order offline.
- Booth owns only its own booth orders.
- Cashier owns settlement and normal void.
- Admin owns settings, export, and override operations.
- Audit trail lives at `/admin/audit`, visible to `super_admin` only (BR-18). Use it to answer "who changed this setting" without opening the database. Config changes survive a trial data reset; transaction logs do not.
- With `pickup_mode = immediate` there is no rack, so physical stickers serve no purpose and the guide stops presenting the number as a step (BR-19b). If a booth runs two devices, a duplicate order number can be rejected; staff raise the number by one and retry, which the guide spells out (BR-19c).
- Operator guide is two layers (BR-19): a help panel in the booth and cashier headers for mid-queue questions, and `/panduan` for briefing and the printed desk copy. Both read live settings and reword themselves, so if the cashier confirmation toggle changes mid-event, reprint `/panduan` — the printed copies are the only part that cannot update itself.
- Two admin tiers (BR-17). `admin` is the client-facing role: everything operational, plus viewing the user list and resetting `booth`/`cashier` PINs. `super_admin` additionally owns clearing recorded data and managing accounts or roles - both irreversible.
- If an operator forgets their PIN mid-event, the client can reset it themselves from User & role. No need to reach the system owner.
- If cashier confirmation is off, booth orders are final on creation and count toward top spender immediately. Booth staff can void their own orders with a reason; no payment method is recorded, so EDC reconciliation does not apply.
- Switching cashier confirmation off settles every pending order in the queue. Do it before doors open, or announce it first.
- Registration emails are best effort. Approval always succeeds; the email is a second copy. Each approved row shows whether the code was sent, and a **Kirim ulang** button retries one registrant at a time. There is deliberately no bulk send: one wrong click would mail hundreds of people irreversibly and get the event domain flagged as spam, so the *next* registrant would receive nothing either. Read the code aloud from `/admin/registrasi` when someone says the email never arrived — that always works, even when email is off.
- Deleting an event is permanent and `super_admin` only. It is refused for `active`/`completed` events and for any event that has orders, because orders are the only data here that represents money. Archive those instead. The dialog requires typing the event slug — that is the guard against hitting the button on the neighbouring card, not against acting without thinking.
- Walk-in guests are registered from `/scan`, and the button only appears after a name search comes back empty. That order is the duplicate guard: staff who skip the search create a second row for a guest who was already on the list. The server repeats the check — an identical name is returned as a candidate list and **nothing is written** until staff confirm it is a different person.
- A walk-in creates the participant and records attendance in one transaction. The code is a normal `REG######`, so booth, undian, and voting accept it immediately. Rows are marked `Walk-in` in the participant list and export `sumber` column, and every creation is in `/admin/audit`.
- Printer pairing belongs to the device, not the event. Each desk pairs its own printer from `/scan`, and the auto-print switch there is stored on that phone — a desk without a printer never sees a print attempt.
- Auto-print fires for walk-in guests only. Registered participants already received their code by email; reprinting for all of them wastes the roll and adds seconds per guest at the door.
- If the printer sleeps, the browser must show its device chooser again and that needs a real tap. Auto-print will report the failure and the guest's result panel keeps a **Cetak label** button — use it, do not re-register the guest.
- The B21 has never been tested by the authors of the printer library; it is assumed to share the B1 command set. If the first label comes out blank, clipped at the right edge, or too faint, the fix is in Admin → Label & printer — command order, printhead width in px, and density are all editable there on purpose.
- Never share `SUPABASE_SERVICE_ROLE_KEY`.
- Reconcile cashier total against EDC settlement, then against any other active method separately.
- Payment methods are managed in Settings. Disable a method instead of deleting it; at least one must stay active or the cashier cannot settle.
- Special offers are managed in `/admin/offers` only. The Booth & item page shows a summary and links there; it no longer edits price, quota, or stock. A booth's discount item row is created automatically when the booth is created.
- Offer `code` cannot be changed after creation. Scope and booth can still be changed while the offer has no claims; after the first claim they lock. Builtin booth offers can never change scope.
- Special offers are managed in `/admin/offers`. Disable instead of deleting; anything already claimed cannot be deleted.
- Changing an offer's price or top-spender flag only affects future claims. Existing claims keep the values captured at claim time, so projector figures never shift on their own.
- If a participant's spend drops below an offer threshold after a void, the claim already made stays valid. Barang sudah di tangan peserta.
