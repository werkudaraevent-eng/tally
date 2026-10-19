# Tally: what the platform does

This is the feature map: what each module does **today**, who uses it, what the organiser sets in the CMS, and where it shows. It is written from the code, not from plans.

- Work in flight, waiting items and parked Lows: `docs/STATUS.md`.
- Look and feel: `DESIGN.md`.
- Product rules that apply to every module (one CMS, 0 px for existing events, sends default off, one setting in one place): "Product and design rules" in `CLAUDE.md`.

**Keep it true.** A PR that adds, removes or changes a feature or a CMS setting updates its module here in the same PR. Describe behaviour, not code. Never write credentials, production addresses, people's data or unfixed security weaknesses here: the repo is public.

URLs are written as `/e/<slug>/<page>`. Admin pages are `/e/<slug>/admin/<page>`.

---

## Direction (decided 2026-10-19)

**Goal.** Tally becomes an all-in-one event management platform, open to the public by subscription: one place to run an event end to end, from the first invitation to the final report.

**Who it is for.** Event organisers and companies that run their own events (gatherings, forums, conferences, incentive trips). Each organiser works in its own organisation with its own events, staff and senders. Werkudara is the first. Their clients watch live numbers, participants use it on their phones, and field staff use it at desks, booths and on stage.

**End to end:**
1. Invite and register: event page, registration page and form, invitation blasts, confirmation and custom emails, custom WhatsApp messages, a custom domain per event.
2. Manage participants: import, sync, approval, logistics, seating.
3. Run the day: badge design and printing, check-in, welcome screen, checkpoints and gamification, booth sales.
4. Run the stage: lucky draw, live voting, leaderboard.
5. Report: live client view, reports and exports.

Every feature is set up by the organiser alone in the CMS; placement and audience come from data they already enter, never from per-event or per-customer code.

**Gaps against the goal:** organisations (each organiser's events, staff and settings kept to itself), WhatsApp sending with custom templates, self-serve sign-up, plans with usage limits and recurring billing, gamification beyond checkpoint points.

**Order:** the KSO event (6-8 Nov) first; then organisations; then WhatsApp; then self-serve sign-up and billing, just before public launch. The existing modules are the product core; new modules wait until these are done.

**Not doing:** online ticket sales or a payment gateway for participants (booth sales are a ledger; money moves at the cashier); a native app (phones use the web participant area); a free-form page builder.

Review this section when the order changes; the date in the heading says when it was last decided.

---

## 1. Platform and roles

Tally runs many events from one workspace. Every event has its own data, settings, look and staff access. Staff sign in with a username and a 6-digit PIN; participants sign in per event in the participant area.

| Role | Lands on | Can do |
| --- | --- | --- |
| Super admin | Events list | Everything, on every event: create, duplicate, change status, delete events; users and per-event access; audit trail; danger zone. |
| Admin | Event dashboard | Runs the events they hold: setup, participants, messages, event-day screens, reports. Can scan and use any booth. Can't create events or manage access. |
| Scanner | `/scan` | Check-in at the entrance and sessions; walk-ins and kit hand-out when the event allows them. |
| Booth | `/booth` | Records purchases and hand-overs at its one assigned booth. |
| Cashier | `/cashier` | Settles payments, voids orders. |
| Viewer | `/live` | Client account: read-only live registration list, counts and download. |
| Participant | Participant area | Their own QR, agenda, travel, announcements, checkpoints. |

Booth, Cashier and Scanner can open only an Active event. Every role except Super admin needs an access row per event.

**Event lifecycle.** New events start as Draft (the event page and registration already work). Draft → Active → Completed → Archived. Active and Archived can go back to Draft, and Completed can be activated again. Only Draft or Archived events can be deleted (type the slug to confirm). Duplicate copies configuration only (settings, agenda, seating, booths, offers, lucky-draw setup, leaderboard exclusions), never participants, orders, winners or access, and the copy starts as Draft. A slug change keeps old links and printed QR codes working through a redirect.

**Admin menu**, grouped by when the organiser does the work: Setup (Event page, Agenda, Speakers, Seating plan), Participants (Participant list, Registration, Logistics, Messages, Participant area), Event day (Check-in, Badges & labels, Welcome screen, Lucky draw, Live voting, Leaderboard), Sales (Orders, Booths & items, Reports). Leaderboard and Sales show only when the event has booths. Event settings sits at the foot of the sidebar; Users & roles is workspace-wide (`/users`).

---

## 2. Modules

### Dashboard
- **For:** admins. Event phase (preparation, event day, finished), key counts, a readiness checklist and links to every event-day screen.
- **Readiness, required:** date and time, venue, event description, agenda, participant-code email sending. **Optional:** banner or link-preview image, seating plan, active booth, registration open, lucky-draw prizes, voting questions, organiser phone (when the participant area is on), agenda sections dated outside the event.
- **Needs action:** registrations waiting for approval, email not set up, unpaid booth orders.

### Event page
- **For:** public visitors; participants see blocks set to show in the participant area.
- **CMS (Event page):**
  - What `/e/<slug>` shows: the event page, or the registration form only.
  - Start from a preset: Conference, Forum, Gathering, Gathering Horizon. A preset writes values; the card then shows "In use" or "In use · Edited".
  - Layout: Editorial (default), Modern, Forum (three pages: home, `/program`, `/info`). Gathering and Horizon are styles on Modern, not separate layouts.
  - Theme: brand colour (plus accent/secondary/button colours per layout), separate form colour, heading and body fonts, corners, link-preview image.
  - Language: English version (off by default, Modern only) and main language. Forum has its own label language.
  - Built-in sections, each switchable and orderable: About, Key figures, Agenda, Speakers, Venue, FAQ, Sponsors & partners, Staff contacts. The hero always comes first.
  - Blocks (Modern only, up to 30): text and image, image cards, point cards, photo gallery, figures strip, quote, partner logos, downloads, call-to-action strip, columns, directions (route), countdown. Each block chooses where it shows: event page, participant area, or both.
  - Directions block: from/to stops (a Logistics hotel or a free place), walking/driving/transit, steps, landmark photo.
  - Invite only: when registration is closed, invited guests are asked to sign in instead.
- **Client domain** (Event settings → Event): connect the client's own (sub)domain. Only participant-facing pages are served there; staff screens stay on the Tally address.
- **Shows at:** `/e/<slug>`, `/e/<slug>/en`, `/e/<slug>/id`; Forum adds `/program` and `/info`.

### Agenda
- **For:** public visitors, participants, big screens.
- **CMS (Agenda):**
  - Sections (usually one per day): name, tab label, date, highlight the current item, show on public page. New sections start as drafts.
  - Items: start, end, title, details (one speaker per line; bold, italic, colour, lists), note, break. English title optional. Items sort by time; only parallel items are reordered by hand.
  - Who it's for (per section): Everyone, or one group picked from a dropdown/choice participant field. Gathering Horizon shows the participant's own sections first and hides nothing; no answer sees all.
  - Outfit / what to wear (per section, Horizon).
  - Public agenda header: title, subtitle, colours, background, logo.
  - A linked Logistics trip shows a Bus chip; moving the item moves the trip.
- **Shows at:** `/e/<slug>/rundown?sesi=<section>`, the event page Agenda section, Forum `/program`, the participant area schedule.
- **Rule:** agenda times are wall-clock in the event time zone.

### Speakers
- **CMS (Speakers):** name, job title, organisation, main role, photo, featured, sessions (linked to agenda items, with a role per session), English fields, order per tab, photo frame (Modern).
- **Shows at:** event page Speakers section (tabs: featured, one per session, others) and next to sessions in the agenda (text, names, or names with photos).
- **Limits:** 60 speakers, 8 featured.

### Seating plan
- **For:** participants and public screens find their seat; admins assign seats.
- **CMS (Seating plan):**
  - Room: 8 layouts (banquet, cabaret, theatre, classroom, U-shape, hollow square, boardroom, head table + banquet) or a composite room of up to 6 sections; tables, seats, rows, aisles, seat label pattern, custom table labels, stage label, seat shape.
  - Sessions: title, seat source (set in Tally, or from the external scanner system), show to participants (new sessions start as drafts), colours, background, header and footer.
  - Public screens: default session; display mode Name search (phones, touch screens) or QR for LED; search by organisation (off by default).
  - Assign seats: search participants and place them.
- **Shows at:** `/e/<slug>/denah?sesi=<session>`, the participant seat card, the event page Venue section.
- **Rule:** the public page never shows full names; the event's name mode and each person's own display choice apply, the strictest wins.

### Participant list
- **For:** admins; walk-ins are added by scanners.
- **CMS (Participant list):**
  - Add, import (CSV/XLSX with templates; preview first, then apply), export (follows filters), client view link.
  - Import matches on QR code; new rows get a code; duplicate email/phone is rejected; empty cells never erase data.
  - Columns and filters: registration, RSVP, room, bus, seat, source, type, check-in, lucky draw, plus every form question.
  - Bulk: send message (opens a draft blast), export, delete.
  - Detail panel: check-in per session with reset, logistics, seat, lucky-draw exclusion, contact, answers.
  - Sources: manual, external scanner system, public form, or both. The external sync is set in Event settings → Integrations (switch, slug, key, sync now, auto interval); a scheduled job also syncs every active or draft event that uses it. People removed at the source are kept and labelled.
- **Reset check-in:** one session or all; previews what changes; winners already drawn stay; copied to the audit trail first.

### Registration
- **For:** public visitors and invited guests; admins moderate.
- **CMS (Registration):**
  - Open / close registration (closed by default).
  - Approval: auto-approve (off by default). With invited guests: open to anyone with the link or invited guests only; auto-approve invited guests; auto-approve others.
  - Tabs: Invited guests, Pending approval, Approved, Rejected (reject with a staff-only reason).
  - Invited guests: add or import (import sends nothing), send invitation, remind, copy or renew the private link. Guests who never register are removed 30 days after the event.
  - Form: name always required; email, phone (required by default), organisation, job title (optional by default); up to 20 extra questions (short/long text, email, phone, dropdown, multiple choice, checkboxes, date, number, file). Per question: required, ask on the form or staff-only, participants can update it later.
  - Form colours follow the event theme.
- **Shows at:** `/e/<slug>/daftar` (and `/en/daftar`), the code page `/e/<slug>/kode/<token>`.
- **Rules:** registration rows are created only by the `submit_event_registration` RPC. With the participant area on, the form also sets a password, and an email already on the list is sent to "get a sign-in link" instead.

### Logistics
- **For:** admins assign; participants see their own; scanners hand out kit.
- **CMS (Logistics):**
  - Assignments: put many participants in a room or on a default bus.
  - Rooms: hotels (name, address, map, check-in/out), rooms (number, capacity, type, floor, staff note), gender field and same-gender rooms rule.
  - Buses: name, capacity, plate, crew contact, default passengers; show plate / crew contact to participants (both off by default).
  - Trips: name, departure, from, to, meeting point, default or per-trip buses; can follow an agenda item's time.
  - Trains: direction, train, class, stations, date, times, carriage, seat, booking code.
  - Kit items: name, size taken from a field, note for participants. Which check-in points hand them out is set in Check-in.
  - Import from Excel for rooms, buses, train tickets (templates, preview first).
- **Shows at:** participant area when "Room and bus" is on (off by default): room, roommates, bus per trip, trains (with a calendar file), kit items. Horizon puts them in Perjalanan.
- **Rule:** capacity and gender are re-checked by the database; only active participants count.

### Messages
- **For:** admins send; participants and invited guests receive.
- **Blasts:** email (WhatsApp shown but not connected yet). Types: sign-in link (7 days), event update, update-details link (14 days), invitation (to invited guests). Recipients: everyone, never signed in, not answered, not sent yet, not registered, or a hand-picked selection; narrow by organisation. Subject and body with merge fields. Send now or schedule; preview as a recipient; test email; per-recipient report.
- **Announcements:** title, body, link; to all participant accounts or approved only; pin to top; optionally email it (off by default). Shown in the bell on the event page and in the participant area.
- **Automated emails** (registration): sender name and reply-to, language, preset (KV banner, colour band, plain), font. The Approved email always sends; Pending email on by default; Rejected email off by default. Approved, Pending and Rejected each have ID and EN versions built from orderable sections.
- **Rules:** sends run in the background and never block a desk. Outside production, sending is blocked except to an allowlist.

### Participant area
- **For:** participants ("Dashboard saya"); admins configure and preview.
- **CMS (Participant area):**
  - Open participant area (adds Sign in to the event page).
  - Who can sign in: approved registrations (default) or everyone on the list.
  - How: email and password (default), email code, or two participant fields (weaker; the screen says so and counts duplicates). Optionally email a sign-in link to new walk-ins (off by default).
  - Participant home (Modern and Gathering): order and show/hide its cards; organiser blocks are added from the Event page.
  - Emergency and help (Horizon): card title, note, up to 8 contacts with call, WhatsApp and map buttons.
  - What shows: QR code (on), seat, agenda, room and bus (off), live voting, feedback link.
- **Horizon portal tabs:** Beranda, Acara, Perjalanan, Pengumuman, Profil/Menu, a QR button in the bottom bar, optional Outfit. The QR can be saved for offline use.
- **Shows at:** `/e/<slug>/peserta` (and `/en/peserta`), sign-in `/e/<slug>/masuk`, update details `/e/<slug>/lengkapi`, event calendar `/e/<slug>/kalender.ics`.

### Check-in
- **For:** scanners and admins at the door and at sessions.
- **CMS (Check-in):**
  - Sessions: name, open/closed, kit items checked at this session. A session with scans can only be closed, not deleted.
  - Registration desks (lanes): one per physical desk, open/closed; each desk can drive its own welcome screen.
  - Walk-ins: allow walk-ins (off by default); the form follows the registration form fields.
  - Checkpoints (below).
- **Scanner screen** `/e/<slug>/scan?sesi=<session>`: camera QR, name search, or a handheld scanner. Results: recorded, already recorded, not found, walk-in created. Shows the seat, kit items to hand out (once per person), and can print a label. With several desks, the phone must pick its desk first.

### Checkpoints
- **For:** participants tick off steps (collect ID card, visit a stand); staff or participants record them.
- **CMS (Check-in → Checkpoints):** show in participant area, points, points goal and what it's for; per checkpoint a title, where, recorded by (a session scan or a kit hand-out), how it gets done (staff scan, participant scans the checkpoint QR, or both), points, English text, order.
- **Shows at:** participant home card; the checkpoint QR screen `/e/<slug>/checkpoint-qr` (signed-in staff); the participant self-scan page `/e/<slug>/pindai`. Points and goals feed lucky-draw conditions. The desk never turns anyone away for a skipped step.

### Badges & labels
- **For:** admins design and bulk-print; scanners print at the desk.
- **CMS (Badges & labels):**
  - Paper badge: folded A6/A5 formats, single-sided, or custom size; background (plain, event KV, uploaded design); elements (name, organisation, job title, participant QR, agenda QR, agenda, event name, free text, colour band, image) with size, colour and alignment; printer profiles and calibration (per laptop).
  - Sticker label (thermal printer over Bluetooth): roll size, fields, printer model and print settings.
  - What the registration desk prints: paper badge, sticker label, or nothing.
- **Shows at:** `/e/<slug>/cetak-badge` (sample, all, one, calibration); print station `/e/<slug>/stasiun` (a laptop that prints badges queued by the phones); stickers print from `/scan`.

### Welcome screen
- **For:** a TV at the entrance greets each guest by name when scanned.
- **CMS (Welcome screen):** on/off, landscape or portrait, title, idle message, which sessions, how long a name stays, show organisation, greet re-scans, "just arrived" strip and its length, colours, background, header and footer, connected screens.
- **Shows at:** `/e/<slug>/sapa`, or one desk's guests with `?jalur=<desk>`. With several desks, a TV pairs with a desk through a 6-digit code from `/scan`.

### Lucky draw
- **For:** admins set up and run it; the audience watches the stage screen.
- **CMS (Lucky draw → Prizes & rules):**
  - Prize: name, sponsor, description, image, animation (wheel, slot machine, card, digits, dart, instant), automatic or manual stop, winners per draw, total quota, backups.
  - Name source: event participants or an entry list (pasted from Excel).
  - Eligibility conditions with AND/OR groups: organisation, name, job title, type, RSVP, check-in (any or one session), seat, spend, booths visited, scans, checkpoint points/goal, form answers; with a pool preview.
  - Win again: can win many times, not this prize twice, or excluded from all prizes after one win (default).
  - Chances: equal, or bonus tickets from a file or from conditions, capped per person.
  - Exclusion rules and per-person exclusions.
  - Stage display: title, name display, organisation, seat, sound, confetti, reveal delay, colours, background.
  - Sessions & results: start/close a session, export, delete results (owner only).
- **Operator panel:** stage screen on/off, choose prize, draw, stop, confirm or mark absent, redraw, rehearsal (nothing recorded).
- **Shows at:** `/e/<slug>/undian`.
- **Rules:** the prize being drawn decides who may win again; absent winners return to the pool; winners from closed sessions no longer block; if past winners can't be read, the draw refuses to run.

### Live voting
- **For:** the audience votes from phones; results on a stage screen.
- **CMS (Live voting):** question types single choice, multiple choice, rating scale, word cloud (with moderation, on by default); options with images; who may vote (anonymous per device by default, participant code, pick a name, type a name); stage steps show question → open → close → show results; export; reset votes. Display: event join code for `/join`, title, colours, background.
- **Shows at:** `/e/<slug>/vote`, stage `/e/<slug>/vote/layar`, `/join`. Signed-in participants vote without a code.

### Leaderboard (booth events)
- **For:** a projector "top spender" board from booth orders.
- **CMS (Leaderboard):** show/hide, how names show (full, initials, organisation only, hidden), number of rows, show organisation, show amounts, booth explorer panel, ticker; staged reveal by rank ranges (freeze numbers or follow live); exclusions by organisation or person (still counted in Reports).
- **Shows at:** `/e/<slug>/display`.

### Booth sales
- **For:** booth staff record purchases, cashiers settle, admins reconcile.
- **CMS:**
  - Booths & items: booth code and name, with or without transactions (hand-over only), active; each booth gets a Rp 1 discount item, one per participant. Special items: price, stock, max per participant, which booths, conditions (total spend, booths visited, participant type), counts toward top spend or not.
  - Event settings: hand-over after payment or at the booth; through the cashier or without; auto-void pending orders after N minutes. Payment methods with optional reference numbers.
  - Orders: filter, detail, admin void with a reason. Reports: revenue, paid orders, pending, discount claims, per-booth reconciliation, export (Excel or CSV).
- **Shows at:** `/e/<slug>/booth`, `/e/<slug>/cashier`.

### Client view
- **For:** Viewer accounts (the client).
- **Shows at:** `/e/<slug>/live`: counts (registered, awaiting approval, checked in), the list with fixed columns plus the form answers the admin chose to share, search, filters, download. Refreshes every 30 s.
- **CMS:** on that page, admins choose which form answers the client sees (none by default; file uploads never).

### Event settings
- **Event:** time zone (WIB default, WITA, WIT), email sender name and reply-to, organiser contact (shown on the event page, closed-registration page, invitation and participant area), booth order flow, client domain.
- **Payments:** payment methods (see Booth sales).
- **Integrations:** participant sync from the external scanner system.
- **Audit trail** (super admin): configuration and transaction changes with before/after, filtered by category and actor.
- **Danger zone** (super admin): clear recorded orders, optionally the participant list too.

---

## 3. Decided against

Rejected after review. Don't propose these again without a new reason.

- **Layout and navigation:** carousels; side sheets; centred or narrow desktop layouts that waste space; a standalone sign-in page (sign-in is a dialog over the event page); a free-form page builder; pill tabs on Horizon; mixing topics on one participant-area page (one page per topic); inconsistent header heights between participant-area tabs.
- **Components:** big speaker cards; 96 px heroes; checkbox event pickers; native select menus (use the menu popover); coloured left-border accents; two competing gold CTAs; disabled primary buttons with no reason shown.
- **Content and data entry:** per-element pixel controls; forced-uppercase titles; purple greys; start and end time on two lines (write "10:00 - 13:00"); paste fields for hundreds of names (use template import).
- **Participant area:** announcements at the bottom of participant home; a QR button in the top bar (the QR lives in the bottom bar).
