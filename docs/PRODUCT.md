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

**Gaps against the goal** (full list in the Target map below): organisations (each organiser's events, staff and settings kept to itself), WhatsApp sending with custom templates, self-serve sign-up, plans with usage limits and recurring billing, gamification beyond checkpoint points.

**Order:** the KSO event (6-8 Nov) first; then organisations; then WhatsApp; then self-serve sign-up and billing, just before public launch. The existing modules are the product core; new modules wait until these are done.

**Not doing:** online ticket sales or a payment gateway for participants (booth sales are a ledger; money moves at the cashier); a native app (phones use the web participant area); a free-form page builder.

Review this section when the order changes; the date in the heading says when it was last decided.

---

## Target map (decided 2026-10-19)

What "end to end" means feature by feature, per stage of an event. **Today:** Yes, Partly, No, or Not doing. **Priority:** P1 before public launch, P2 after launch, P3 only when customers ask. The reference names the product whose screen to look at first. When a row ships, update its Today column and its module in section 2.

The aim is an answer at every stage, not parity with enterprise suites: Tally goes deep where Indonesian corporate events need it (logistics, seating, the event-day desk, the stage, WhatsApp).

### Platform

| Feature | Today | Priority | Reference |
| --- | --- | --- | --- |
| Organisations: each organiser's events, staff, senders and settings kept to itself | No | P1 | Luma calendars, Eventbrite organisations |
| Plans with usage limits and recurring billing | No | P1 | Luma Plus, Cvent licence + per registrant |
| Staff sign-in with email and two-step verification (today: username and PIN) | No | P1 | Cvent platform licence (SSO) |
| Consent at registration, delete-my-data requests, retention rules (UU PDP) | Partly | P1 | Eventbrite, Luma privacy per organiser |
| Duplicate event, audit trail | Yes | | Cvent |
| API, webhooks, Zapier | No | P2 | Eventbrite API, Luma API |

### 1. Invite and register

| Feature | Today | Priority | Reference |
| --- | --- | --- | --- |
| Event page, registration form, client domain, two languages | Yes | | Luma, Eventbrite |
| Private invitations and reminders | Yes | | Luma invites |
| A quota per participant category (VIP, Regular, Media), closing when full; categories exist, quotas do not | No | P1 | Eventbrite ticket types |
| Waitlist when a category is full | No | P1 | Luma waitlist |
| Conditional questions on the form | No | P2 | Cvent registration |
| One person registers several colleagues | No | P2 | Cvent group registration |
| Paid tickets | Not doing | | |

### 2. Communicate

| Feature | Today | Priority | Reference |
| --- | --- | --- | --- |
| Email blasts with merge fields, scheduling, preview | Yes | | Luma |
| Email sender per organisation (own domain, SPF/DKIM) | No | P1 | Cvent, Bizzabo custom sender |
| WhatsApp approved templates (Meta), one number per organisation | No | P1 | SleekFlow event flows |
| Automatic reminders (7 days, 1 day, morning of the event) | No | P1 | Luma reminders |
| Inbox for WhatsApp replies | No | P2 | SleekFlow inbox |
| Delivery and open statistics | Partly | P2 | Cvent email reports |

### 3. Prepare participants

| Feature | Today | Priority | Reference |
| --- | --- | --- | --- |
| Hotels (rooms later, hotel changes mid-event), vehicles, trains, kit items, luggage drop | Yes | | |
| Flight tickets | No | P2 | Airline app boarding pass |
| Seating plan and seat assignment | Yes | | Cvent seating |
| Choose parallel sessions, with capacity | No | P2 | Cvent session selection, Sched |
| Participants book their own hotel room | No | P3 | Cvent Passkey |

### 4. Run the day

| Feature | Today | Priority | Reference |
| --- | --- | --- | --- |
| QR check-in, walk-ins, badge and sticker printing | Yes | | Cvent OnArrival |
| Welcome screen, checkpoints, participant self-scan | Yes | | Bizzabo Klik |
| Staff scanners keep working when the venue internet drops, and sync later | Partly | P1 | Cvent OnArrival, Swapcard offline scan |
| Self check-in kiosk with badge printing | No | P2 | Cvent OnArrival kiosk |
| Booth sales and cashier | Yes | | |

### 5. Stage and gamification

| Feature | Today | Priority | Reference |
| --- | --- | --- | --- |
| Lucky draw, live voting, leaderboard | Yes | | Slido polls |
| Q&A with upvotes and moderation | No | P2 | Slido Q&A |
| Quiz with scores | No | P2 | Kahoot, Whova contests |
| One points total from check-in, sessions, quiz, booths and checkpoints | Partly | P2 | Whova leaderboard |
| Networking and 1:1 meetings | No | P3 | Brella, Swapcard |
| Exhibitor lead retrieval | No | P3 | Swapcard exhibitor tools |

### 6. After the event and reports

| Feature | Today | Priority | Reference |
| --- | --- | --- | --- |
| Live client view and exports | Yes | | Cvent reports |
| One end-of-event report for the client (attendance vs registered, by organisation, checkpoints, winners, votes) | No | P1 | Bizzabo analytics, Cvent reports |
| Post-event survey, NPS, rating per session | Partly | P2 | Cvent surveys |
| E-certificate of attendance | No | P2 | Cvent CE tracking |
| Photo gallery and materials after the event | Partly | P3 | Whova |

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
  - Directions block: from/to stops (a Logistics hotel or a free place), ways to get there (icon, name, time) each with its own numbered steps (one row per step, up to 12, Enter adds the next, pasted lines split into steps) and an optional photo per step shown beside it that opens full screen with the step as caption; one step without a photo shows as a short note. An optional map image (floor plan) shows uncropped under the ways and opens full screen on tap. The Google Maps button (walking/driving/transit) can be switched off for a route inside one building. Older blocks keep their block-level steps and per-way landmark photo; those fields show in the editor only while filled. On the participant page it can be limited to one group ("Who sees it": a participant field or a Logistics hotel) and linked to Agenda rows ("Cara ke sana"). Horizon shows each route in Perjalanan as its own ticket-style card (from and to in large type with the way icon between them, the ways as chips under a tear line), or on Beranda for participants without travel info; Detail opens the journey from start to destination with numbered steps and photos, a tab per way when there are two or more, and the map image and Google Maps button beside it on desktop. The block heading is not used there: the two places title the card.
  - Invite only: when registration is closed, invited guests are asked to sign in instead.
- **Client domain** (Event settings → Event): connect the client's own (sub)domain. Only participant-facing pages are served there; staff screens stay on the Tally address.
- **Shows at:** `/e/<slug>`, `/e/<slug>/en`, `/e/<slug>/id`; Forum adds `/program` and `/info`.

### Agenda
- **For:** public visitors, participants, big screens.
- **CMS (Agenda):**
  - Sections (usually one per day): name, tab label, date, highlight the current item, Published (off hides the section everywhere, the participant portal included). New sections start as drafts.
  - Show before sign-in (per section, on by default): off keeps that day off the event page and the `/rundown` screen for visitors who haven't signed in; signed-in participants still see it in the portal. A day whose published items all have a Who sees it rule is left off the event page (and shows as an empty tab on `/rundown`), and the Section panel warns about it.
  - Items: start, end, title, details (one speaker per line; bold, italic, colour, lists), note, break. English title optional. Items sort by time; only parallel items are reordered by hand.
  - Show first for (per section, was "Who it's for"): Everyone, or one group picked from a dropdown/choice participant field. Gathering Horizon shows the participant's own sections first and hides nothing; no answer sees all.
  - Who sees it (per item, in Edit item and New item, every layout): Everyone, or Some participants with 1 to 3 conditions that must all match; each condition is one dropdown/choice participant field (staff-only ones included) or Hotel from Logistics, with one or more answers (any matches). Rows that don't match are hidden from that participant on the server (failing closed), and limited rows never show on the public page, the `/rundown` screen or badges. A dress code line linked to a hidden row is hidden too. The editor shows a live "Matches N of M participants" count; Hotel matches only while rooms are shown in Participant area.
  - Dress code (per section, Horizon; Agenda > Dress code): up to 3 lines per tab, each for the whole day, one of the tab's agenda items (its text follows the item's start time and title, and it is deleted with the item) or a named part of the day, with what to wear and an optional note and photo. A pinned Dress code row sits above each tab's schedule, and Edit item shows the item's dress code. Shown on that day of the participant Schedule, on the Dress code page under Susunan acara and in the Home row; the page name is set in Participant area. The event's Every day line (set in Participant area) shows read-only first in the pinned row and in the editor; a tab's own Whole day line replaces it on that tab.
  - Public agenda header: title, subtitle, colours, background, logo.
  - A linked Logistics trip shows a Vehicle chip; moving the item moves the trip.
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
  - Columns and filters: registration, RSVP, hotel, vehicle, seat, source, type, check-in, lucky draw, plus every form question. Logistics columns (hidden until chosen in Columns): Hotel, Room, Hotel check-in and Hotel check-out per stay (numbered Hotel 1, Hotel 2 only when someone moves hotels), each outbound and return train field, one column per kit item.
  - Export follows the filters and adds the Logistics columns read-only (`logistics: Hotel 1`, ...) after the session columns; the importer skips them.
  - Bulk: send message (opens a draft blast), export, delete, and a Logistics menu (Assign to hotel or room, Assign to vehicle, Remove from hotel, Remove from vehicle) that opens the same dialogs as the Logistics page.
  - Import asks what to import: Participant details, or Hotels, rooms, vehicles, train tickets (the Logistics import).
  - Detail panel: check-in per session with reset, logistics (every stay with room and dates, vehicle, trains, kit collected; Edit stays and Change vehicle), seat, lucky-draw exclusion, contact, answers.
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
  - Assignments: put many participants in a hotel or a room, or on a vehicle: Assign to vehicle sets the default vehicle and, in the same dialog, a different vehicle (or none) on chosen trips; trips listed there replace the person's per-trip changes, and the dialog says which ones it removes. "Hotel only, room later" places people in a hotel before the rooming list arrives; room rules apply only to rooms. Nights: All nights (replaces the person's other hotels) or Only some nights (keeps their other hotels for the other nights; a sentence says what happens before Assign). Filters: No hotel, Room to follow, Has a room, Moves hotel. The Stay column lists each person's stays ("GRAMM Hotel 5–6 Nov → Hotel Tentrem (Room to follow) 6–8 Nov"); its Stays panel changes nights, picks or changes the room, removes a stay or adds another hotel.
  - Stays: a participant has at most one stay per hotel, each with its own nights (empty dates follow the room, then the hotel). Nights never overlap; a new stay trims the other one.
  - Rooms: hotels (name, address, map, check-in/out), rooms (number, capacity, type, floor, staff note), gender field and same-gender rooms rule. Each hotel shows "N waiting for a room" with a To follow row; Remove from room keeps the hotel and the dates. A hotel with guests can't be deleted.
  - Vehicles (the tab was "Buses" before 26 Oct; one term because events also hire Hiace and Elf vans): name typed with its type ("Bus 1", "Hiace 2"), no separate Type field, capacity, plate, crew contact, default passengers; show plate / crew contact to participants (both off by default).
  - Trips: name, departure, from, to, meeting point, default or per-trip vehicles; can follow an agenda item's time.
  - Trains: direction, train, class, stations, date, times, carriage, seat, booking code.
  - Kit items: name, size taken from a field, note for participants. Which check-in points hand them out is set in Check-in.
  - Import from Excel for rooms, vehicles, train tickets (templates, preview first). Rooms: an empty Room column places the person hotel only, and a later rooming list fills the room by QR code; Check-in and Check-out columns (empty = the hotel's dates) give one row per hotel for people who move. Download current stays exports every stay to edit and import back; people in the file are set to match it, others are unchanged.
  - The same actions are on the Participant list (selection Logistics menu, detail panel, Import).
- **Shows at:** participant area when "Room and vehicle" is on (off by default): hotel (with "Nomor kamar menyusul" until a room is set), room, roommates, vehicle per trip, trains (with a calendar file), kit items. Horizon puts them in Perjalanan as cards with one shape: a header row (icon and card type on the left; nights, trips still to come, tickets still to use or the luggage state on the right), then short sentence lines and one grey strip for the key fact (room and floor, carriage and seat with the booking code). One hotel card per stay ("Pindah hotel" on later ones); the vehicle card leads with the vehicle name; each train leg reads "Gambir → Yogyakarta" with times and the train. With three or more travel cards, a row of chips (Hotel, Kendaraan, Kereta, Bagasi, Rute) sticks under the header and jumps to each card; finished items fold into one row that opens on tap: a hotel stay after its check-out, vehicle trips already departed, a train leg already arrived (event time zone; preview time applies). Modern and Classic show the current or next hotel. Who sees it by hotel (Agenda rows, Directions blocks) reads the stay: Agenda rows match the hotel of that row's date (both hotels on the move day), Directions blocks match any of the person's hotels.
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
  - Participant home (Modern and Gathering): order and show/hide its cards; organiser blocks are added from the Event page. On Gathering Horizon, cards are dragged in the Phone preview or in the list (Next up fixed at the top, Help card at the bottom, Today's dress code and Help card as rows), and "Preview on" shows Home on any event day.
  - Dress code page (Horizon): Every day, one dress code for the whole event (what to wear, optional note and photo; empty means none), shown first on every day, also without Agenda tabs, except on a tab with its own Whole day line; and Page name for the whole event (empty reads "Outfit"). A day's or an agenda item's dress code is set in Agenda > Dress code.
  - Emergency and help (Horizon): card title, note, up to 8 contacts with call, WhatsApp and map buttons.
  - What shows: QR code (on), seat, agenda, room and vehicle (off), live voting, feedback link.
- **Horizon portal tabs:** Beranda, Acara, Perjalanan, Pengumuman, Profil/Menu, and a QR button in the bottom bar. The QR can be saved for offline use. Outfit is part of Acara: a strip on each Schedule day with outfits opens the Outfit page (back to Susunan acara, Acara stays lit), and both follow the participant's batch; an outfit photo opens full screen with its time, outfit and note as caption. With the Schedule hidden for participants, Outfit is a desktop tab and a Menu row instead. The header avatar opens Profil, laid out like an app account page: name and "View your details" on the navy band, tiles for checkpoints, room and vehicle (each only when there is data), a one-line attendance QR card, then rows for Your details, Outfit (when the Schedule is hidden), Language, Event page, a Help group (organiser WhatsApp, phone or email from Kontak panitia, and the emergency card) and Sign out. Your details is its own page and read-only; participants ask the organisers to fix wrong data.
- **Horizon Home ("Hari ini"):** "Halo, {Nama}" under today's date and the event phase (before, during or after, from the event dates). Below 1024 px the cards follow Participant home; by default Announcements, Now and next (with the vehicle of a Logistics trip linked to the row), the day's outfit (the next date's before the event), Checkpoints, travel (the full pass before the event; during it a Perjalananmu summary of hotel, roommates and the next train), organiser blocks, and Contact the organisers. Now and next stays first (only Announcements may go above it) and Contact the organisers last; the outfit and Contact the organisers can be hidden. From 1024 px a main column (Now and next, Checkpoints, travel, blocks, help) and a sticky side column with Announcements, the outfit and, from the start of the event, the QR kehadiran card. After the event: announcements, checkpoint progress, blocks and help.
- **Shows at:** `/e/<slug>/peserta` (and `/en/peserta`), sign-in `/e/<slug>/masuk`, update details `/e/<slug>/lengkapi`, event calendar `/e/<slug>/kalender.ics`.

### Check-in
- **For:** scanners and admins at the door and at sessions.
- **CMS (Check-in):**
  - Sessions: name, open/closed, kit items checked at this session, Luggage: Off (default), Drop-off (count and photo; shows the session's total bags for loading) or Pick-up (hand the bags back; shows how many people and bags are handed over and still waiting across all drop-off desks). A session with scans can only be closed, not deleted.
  - Registration desks (lanes): one per physical desk, open/closed; each desk can drive its own welcome screen.
  - Walk-ins: allow walk-ins (off by default); the form follows the registration form fields.
  - Checkpoints (below).
- **Scanner screen** `/e/<slug>/scan?sesi=<session>`: camera QR, name search, or a handheld scanner. Results: recorded, already recorded, not found, walk-in created. Shows the seat, kit items to hand out (once per person), and can print a label. With several desks, the phone must pick its desk first. The ⋮ menu opens the Scanner guide (`/panduan/scanner.html`, Indonesian with the English button names; it covers the luggage drop-off and pick-up desks).
- **Luggage pick-up desk** (session with Luggage: Pick-up): after the scan, the sheet shows every drop-off of that participant in the event, from any drop-off desk (no pairing to set up): a large photo to match the bags against, the count, when and where it was dropped and who recorded it. "Hand over N bags" records the time and staff; the next scan waits until it is pressed or the sheet is closed. A re-scan says who handed it over and when, with no second handover; staff can Undo their own handover. Someone with no drop-off gets "No luggage recorded". The participant's Bagasi card then reads "Sudah kamu terima" with the pick-up time. All bags of one drop-off go back together (no partial pick-up).
- **Luggage drop-off desk** (session with Luggage: Drop-off): after the scan, staff set the number of bags (0 = "No luggage") and take one photo of all of them with the phone camera; the count is saved first and the photo (shrunk on the phone) follows, with Try photo again or Skip photo on a weak signal. The next scan waits until it is saved. A re-scan shows the count, photo, time and who saved it, with Edit. Checkpoints on such a session are always done by staff scan. Photos sit in a private bucket: admins and scanners of the event see them, each participant sees their own (Horizon Perjalanan "Bagasi" card), and they are deleted 30 days after the event ends; counts stay.

### Checkpoints
- **For:** participants tick off steps (collect ID card, visit a stand); staff or participants record them.
- **CMS (Check-in → Checkpoints):** show in participant area, points, points goal and what it's for; per checkpoint a title, where, recorded by (a session scan or a kit hand-out), how it gets done (staff scan, participant scans the checkpoint QR, or both), When (optional: one or more Agenda rows, one per batch when the dates differ), points, English text, order.
- **Date on the card:** each participant sees the date and time of the earliest linked Agenda row they can see (Who sees it), with "Hari ini" and "Besok" on Horizon; a checkpoint without When has no date.
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
