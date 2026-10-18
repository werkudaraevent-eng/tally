# Tally status

Current state only. History is in `git log` and PR descriptions. Last updated: 2026-10-18.

## How to update this file

- Every PR edits this file in the same PR: move its item out of "In flight" when it merges, add the Lows it parks, delete the ones it fixes, and fix "Waiting on".
- Keep entries one line, say what each waits on and on whom, and name the PR number.
- Do not add credentials, project refs, internal URLs, emails or unfixed security weaknesses (public repo). Open security items are tracked privately with the project owner.

## Live events to time merges around

- KSO gathering, 6-8 Nov 2026, Yogyakarta: in client review. Visible changes to it need Mas's OK on timing. Never advise "Reset to Gathering" on it.
- `main` deploys to every event at once, so anything visible on a live or in-review event waits for Mas's merge time.

## In flight

- Portal polish (U-06, U-14, U-17, U-24 zone note, U-31, U-33; this PR): desktop Schedule day list fades at the bottom while more days are below, Seat/Live voting/Feedback hidden in Participant area for Gathering layouts, Home train row opens Travel at the train card, "Semua jam WIB" in the Travel subtitle, navy browser bar on Horizon guest pages (root values now the surface colours), map link labels by link type, "Tutup pengumuman" on the phone bell. No SQL. Waits on coordinator QA and Mas's merge time (visible on KSO).
- Lucky draw admin screens are still Indonesian (should be English): offered to Mas, waiting on his yes.
- Build with AI: proposal written, waiting on Mas's "lanjut".
- PR "Kontak darurat" (E-03): emergency contacts filled in Participant area > Emergency and help (name or role, phone, note, map link per contact) with Call, WhatsApp and Map buttons on the portal Menu card; the Participant area preview opens Menu while that form is in use; an existing Columns block keeps working until "Copy into contacts". No SQL. Waiting on QA, then Mas's merge time.
- Participant words (audit U-20, U-21, U-22, E-09): "Susunan acara" for the schedule, "Dashboard saya" for the participant area, "QR kehadiran" and "panitia" for the QR, on every layout. No SQL. Visible on KSO: waits on coordinator QA and Mas's merge time. The emails that still say "area peserta" follow with U-23 (kamu/Anda), waiting on Mas.
- Participant area tabs on a slow connection: a tab tapped before its prefetch finished kept Home on screen. The proxy now passes the event slug and language to `/peserta` in request headers instead of the query. No SQL, no URL changes. Waits on coordinator QA and Mas's merge time.
- Admin language phase 4a (remaining Indonesian strings on admin screens, including the Check-in page): not started.

## Recently merged (for context; details in the PRs)

- #208 Checkpoint self-scan (E-14, merged 18 Oct): Check-in > Checkpoints > "How it gets done" per checkpoint (Staff default, Participants, Both; kit items always Staff). Staff show a QR from the scanner app (Show QR) or `/checkpoint-qr` on a big screen; the code changes every 30 seconds; participants scan it from the checkpoint card. Migration 202610180001 was run by Mas on 18 Oct.
- #206 QR queue fixes (U-02, U-07, U-09 warnings, U-10, merged 18 Oct): cashier offline banner only on Cashier and Booth; the reloaded QR page skips announcements and loads only the bus; the offline QR copy follows the signed-in account; Readiness items for the organiser phone and Agenda sections outside the event dates, plus a warning under the section Date. No SQL.
- #207 Lucky draw: a session list that failed to load no longer shows conditions as deleted; Retry instead (opencode pilot, merged 18 Oct).
- Tighter access checks: the scanner, print-station routes (only while desk badge printing is on, admins always), the staff event list, and event page image and map addresses (http(s), or a path on this site for block images). No SQL.
- #202 Bus trips linked to an Agenda row (merged 18 Oct): Logistics > Buses > Trips > New/Edit trip has an optional "Agenda row" picker; a linked trip's departure moves with its row (triggers keep the bus offset when the row's time or its section's date changes; deleting the row keeps the trip, unlinked). Agenda shows a Bus chip on linked items, and the participant Schedule marks exactly the linked row. Migration 202610170002 was run by Mas on 18 Oct.
- #201 Staff-only columns (merged 18 Oct): Registration > Edit form has an "Ask on the registration form" switch per question. Off makes the question a Participant list column only: not on the public form, the walk-in desk or participant pages, never required, and a value for it in a public or desk submission is dropped on the server. Participant list > Columns > "Add a column in Registration" opens Edit form on a new staff-only question. No SQL.
- #200 E-08 checkpoint points goal (merged 18 Oct): Check-in > Checkpoints > Points goal adds one line to the participant checkpoint card ("20 poin lagi untuk masuk undian malam puncak."); no line while Points is off, no goal is set, or the goal is above the points on offer. Migration 202610170001 was run by Mas on 18 Oct.
- #199 Horizon participant portal fixes from the 17 Oct audit (merged 18 Oct): compact top bar, next and happening-now cards with real dates and every batch labelled, unread announcements first with a count badge, date chips and batch switch in Schedule, QR layer that opens instantly and offline (wake lock, small service worker, guest offline note), help card with call and WhatsApp, bus trips with maps, train tickets to calendar, an emergency card from a participant-only Columns block (Participant area > Emergency and help).
- #198 Horizon Profil redesign: ticket card with QR, personal details, help card; two columns on desktop.
- #194 Participant home clarity: each row says where it is edited ("Automatic · Edit in <source>", "Your block"), Add block opens the Event page with a participant-only block, and participant-only blocks are shown or hidden only with the eye in Participant home.
- #195 + #196 participant sign-in method per event (email + password default; email code; two participant fields). Every event stays on password until changed in Participant area > How participants sign in.
- #192 bus plate and crew contact on the participant side (per-event switches, default off).
- #190 faster participant list + filter RPC; #186 search rows only; #184 Vercel functions in sin1 (US-hosted outside calls such as email are ~200 ms further).
- #191 + #193 lucky draw orphan count per event and session close scoped to the event.
- #188 + #189 export per-session `check_in: <session>` columns, import skips them.

## Waiting on Mas (owner)

- SQL cleanup from #119 (pending registration rows) to run.
- Event content and settings in the CMS for upcoming events (tracked with him directly).
- Portal audit follow-up "your batch": an "Applies to" setting per Agenda section so Schedule and Home open the participant's own batch first. It needs its own mockup and a small SQL file he runs; #201 (merged) gives it the staff-only Batch column to read. For KSO, add Batch from Participant list > Columns > Add a column in Registration before the import; the import template includes staff-only columns.

## KSO participant-area audit (17 Oct): open items

Every item (finding, recommendation, what is left, decisions and code pointers) is in `docs/kso-portal-audit.md` (U-xx findings, E-xx Eventnook lessons); change an item's status there and here in the same PR. Done in #199/#200: U-03, U-05, U-11, U-16, U-18, U-28, E-03, E-07, E-08; U-02, U-07 and U-10 in #206. #201 adds the staff-only Batch column (nothing in the portal reads it yet), and #202 links bus trips to Agenda rows.

- KSO content in the CMS (Mas): U-04 (who the Thursday 5 Nov section is for; "Taksaka"; check a few real tickets per batch against the rundown times), U-08 (organiser phone in Event settings, a bus trip per Agenda row in Logistics > Buses > Trips, linked to that row with #202, replace the ten "Microsite" rundown notes), U-15 (typos and one term per rundown item, the pinned tumbler announcement, FAQ), U-34 (two "Bukan sekadar..." headings), U-35 ("Limit" or "Limits"), E-03 (add the contacts in Participant area > Emergency and help, after "Kontak darurat" merges), E-08 (set the points goal, or turn Points off; if the goal is a Lucky draw entry, draw conditions can count scans but not points yet).
- Needs a decision or a mockup from Mas first: "your batch" (U-01 step 2, E-01, E-06, E-10: an "Applies to" setting per Agenda section reading the #201 Batch column, then Home, Schedule and the QR show the participant's batch; small SQL), U-25 (V5 label sizes or 12 px rem labels), U-30 (a Masuk or initials control in the event page phone bar), E-13 (draw status in the portal), E-15 (post-event Home), and the bus time on participant Schedule rows (#202 follow-up).
- Code, partly done: U-09 (the event page day heading and the 01-NN counter count sections), U-21 and E-09 (emails and registration account messages still say "area peserta" and "Tiket", waiting on U-23), U-24 (one metadata separator, the countdown date range), U-26 (old Gathering cards in Announcements and Schedule), E-12 (map links for Agenda locations).
- Code, not started: U-23 ("kamu" or "Anda"), U-27 (Horizon blue from the Theme brand colour), U-32 (email subjects and announcement email language), U-36 (DESIGN.md Horizon section), E-02 (WhatsApp channel), E-04 (Home Screen manifest), E-05 (web push), E-11 (photos in announcements).

## Parked Lows and open findings

Known issues that QA left open on purpose, by area. Fix one only when it is cheap and user-visible, or when you are already in that code; remove it here in the same PR. The full write-ups are in each PR's QA report (kept with the project owner).

### Seating
- #136 L2/L4-L10: seat import edge cases: the 50-cap issue list can let a rejected row keep its seat, Tally seat entries are orphaned after a source switch or session delete, the session name is a stale snapshot, the Edit prefill can be stale, the audit row lands on the taker rather than the freed person, rejected rows get contradictory notes, and scanner rows are detected from RPC wording.
- #131: the aisle field accepts invalid values ("abc", "30") with no inline error, and merges duplicates and decimals silently.
- #137 L2 / #150: /denah and its LED mode log a hydration mismatch, because `useState` reads `window`.
- #138 Lows: the DB default greeting is still lowercase "Selamat datang", the scroll mask fades the STAGE bar, the sticky row letter covers the leftmost seats, and auto-scroll ignores reduced motion.
- #142 L1/L3/L4/L6/L5b: the dashboard mini map adds about 63 KB of SSR HTML, passes unneeded config keys, keeps Indonesian per-seat tooltips on EN pages, and its link opens the LED view (no highlight) on QR-mode events.
- #142 L7: the public seat map reads participants without paging, so the 1,000-row cap applies.
- #143 Lows: sections are cleaned rather than zod-validated (a 7th section is dropped silently), label-changing edits are not blocked when seats exist, duplicate zone names give duplicate keys, and the canvas bound is loose.
- #146 L1-L3: a trailing space in a label prefix is dropped silently, repeated spaces are shown but collapsed for matching, and the 422 reason only appears in `details`.
- #148 L1/L2: row letters of a stretched named theatre cross the zone frame, and long prefixes clip off the left edge of the canvas.
- #149 L1: with company search on, company hits can truncate a name query.
- #150 L1-L4: the cinema hit rect is dead code, square and cinema markers are not rotated around tables, a junk `seat_shape` resets the shape to circle, and the cinema branch drops extra props.
- #151 L3/L4: the result list scrolls at 6 rows, and VIP seats sort last.
- #152 L1-L9: the Assign dialog has 30 px buttons, shows every 409 as "someone else changed this seat", offers Assign on an unsaved Tally source, shows stale occupancy, drops unseated people after 200 matches, flashes stale results, and has tiny mouse-only seats with Indonesian titles.
- #152 U1/U2: Undo of a displacement does not restore the mover, and Undo of a Remove reseats someone who was seated elsewhere since.
- #152 residual: two edits to one participant's seats in different sessions can lose one update (also on main; needs an atomic RPC).

### Scanner
- #60 N1: a reply lost to the 8 s timeout shows the orange "already scanned" sheet for a guest who just checked in.
- #60 N2/N3: hand-scanner reads also get the 2.5 s same-code hold, and re-opening a sheet restarts the bar but not its close timer.
- #60 L1-L6: the handover confirmation is replaced at once, ticks are lost on close, `aria-controls` points at nothing, the assertive live region is too wide, the code field is below the fold at 1280x588, and the title is cut off at 360-375 px.
- #62 N3/N4: there is no hint that A6 badges print 2 per A4, and a smaller custom size does not flag clipped elements.
- #66 R1-R3: the history polls every 5 s while offline, a tab that lost the lease keeps its Web Lock, and phone times show no time zone.
- #133 Lows: setup sheets are centred rather than bottom-anchored, the "ready" pill shows when the camera is denied, some state containers have weak contrast, and with no session a wedge scan is refused silently.
- #134 L1/L2/L4: a rescan after a lost Cari check-in shows orange, an unknown id returns a generic VALIDATION_ERROR, and lower-case codes only match in their exact case.
- #139 M1: stricter walk-in form defaults can block the desk, so the live event's form settings need confirming.
- #139 L1/L2/L4: some email errors fall to the general error box, the big count includes removed participants, and "belum" never reaches 0 when there are no-shows.
- #140 L1-L8: copy issues: the phone counter does not say "all desks", some pairing and printer errors are still Indonesian, staff text says "guest", lane and desk are mixed, the message mapping relies on Indonesian text, and the phone rule text is stricter than the rule.
- #145 L1/L4: a slow seat lookup can push the scan reply past the phone's 8 s timeout, and walk-ins no longer show their new code on the sheet (by design).
- #145 L3: the scanner shows the seat even when it is hidden from participants (confirm with the owner).
- #153 L1-L3: one guide screenshot labels a walk-in "checked in", the example contact looks real and routable, and the chip bar gives no sign that it scrolls.

### Agenda
- #121 L10/L11: a speaker is duplicated when Details abbreviates the organisation or rewords the title, and the "+N" chip is nearly invisible on the dark tone.
- #122 L1/L4/L9-L11/L13: rich-details editor: `<ol>` has no start, escapes are stored, undo is lost after a rejected change, the caret jumps to the end, IME input at the limit misbehaves, and pasting over a selection under-fills the 800 limit.
- #122 note: the theme mark colour often reads as bold, and the editor previews a fixed blue.
- #70 L1: the EN translation cards still sort by `sort_order` only (the session picker was fixed in #72).
- #164 L10/L12/L14/L16: the full Horizon schedule is not in the DOM until expanded, the focus ring is about 2.6:1 on navy, simultaneous tab reorders race, and an orphan "Moderator:" label is kept.
- #80 L1/L2: wide initials pairs are clipped about 1 px in stacked faces, and at 390 the Forum names label hides the "dan N lainnya" count.
- #155 L1-L4: KSO labels start at "Hari ke-0", section labels have no English, long labels wrap the Modern pills, and duplicate tab labels give duplicate React keys and merged admin tabs.
- #36: the EN counter says everything is translated when the rundown fails to load, and the `subtitle_en` limit is checked before normalisation.
- #40 F2/F4: a legacy text session whose row is draft keeps an empty "Sesi 1" tab, and Program card notes are positional, so a draft middle section shifts them.
- #47 I1: with no section published, legacy speakers show a "pick a row" warning when there is no row to pick.
- #72 L3/L6: at 1280x588 the role suggestions cover the row's session title, and the role field has only a placeholder, no label.
- #97 Lows: stale "max 8 cards" comments, events with no sessions now show one big grid (tell the PO), the help text misses that case, the tab panel is not focusable, and `speakerTabs()` has no check script.
- #120 L1/L2/L5/L7/L8: speaker reorder drops arrow presses during a save, sidebar navigation loses a draft, speaker strings are still counted as untranslated on the Event page, the CAS token is a client timestamp, and the search field is about 65 px wide at 390.
- #120 R2-L4/R3-L3/R3-L4: the conflict alert does not show the other admin's value, typed edits are lost after a refusal toast, and two records that differ only in the edited fields can still be swapped.
- #187 L3/L4: three simultaneous member saves can return 409, and the day-pill fade hides the last pill at 390 even when all fit.
- #202: the Agenda tab strip at 1280 px has no cue that more tabs are off-screen, and the Bus chip and note refresh on load and save only, so a trip changed in Logistics in another tab shows after a reload.

### Horizon portal
- #198 L2/L3/L5: at 1280x588 the "Perbesar QR" pill sits on the fold, at 390 the contact row is lower than before (below Data diri), and a rejected registration gets the same gold status chip as "Terdaftar".
- #105 L5 (remaining): on the QR page opened by reload or a shared link, Escape and Tutup push history entries. The QR opened inside the portal is a layer that closes with Back and returns focus.
- #166 L1/L3/L5/L6: items are keyed by label, the bus label is a single word, Bus and Kamar sit on different rows at 768/1024, and `justify-between` spreads the second row.
- #171: the last day's entries sit under the fold until the list sticks, and the Jadwal wrapper is full width below lg (L3).
- #174 L1/L2: phone focus order differs from visual order (CSS `order`), and the editor highlight is lost on remount.
- #175 D1/D2/L2/L3: the phone note is 17 px instead of 15 and has no overflow-wrap, and a long unbroken announcement word overflows.
- #180 L2: the fold also applies on tablets; booking codes of 17+ characters may overflow at 390.
- #183 L1/L2: re-inserting moves Agenda and Quick links in classic order, and the drop indicator on a fixed row does nothing.
- #199: offline, every portal address shows the saved QR page (by design); Schedule links to Travel by matching date and time only for bus trips not linked to an Agenda row (#202 links the row itself), and shows no bus time on the row (needs its own mockup). Emergency card: rows have no icons (the approved mockup had icon tiles), and it is not in the saved offline page (offline shows the QR only).
- #185 L3: `?tab=perjalanan` with no travel data shows no active tab.
- #194 L8/L9: the short description has no tooltip, and block rows say only "Edit ›".
- #132 Lows: at 390 the "Preview as" button shrinks to about 28 px and clips the name, and clicking a home row can scroll the preview toolbar out of view.

### Logistics
- #124 L3: the hotel map embed ignores `map_url`.
- #126: the 3-column hotel card is about 44 px taller than a 1280x588 viewport.
- #167 Low1/Low4/Info5/R2-1: the post-check cannot detect an old `train_tickets` shape, 1904-date-system times are rejected, re-import overwrites `created_by`, and the preview Ticket column pushes Status off-screen.
- #170 L5/L6/R3-I1: manual add leaves `created_by` NULL, an invalid `depart_date` returns 500 (API only), and switching direction remounts the picker.
- #56 L0/L1: the participant sheet and column menu show Logistik for events with no logistics data.
- #56 L4-L7: the Logistik tables do not match Daftar peserta styling, the tab strip cuts "Barang" at 390 with no scroll hint, `copy_logistics_config` is dead SQL, and a planning note ships in the repo.
- #192 L4/L6/L7: long tokens overflow the classic bus tile, the header button is 30 px tall, and every tab makes an extra query when a switch is on (L8, off-state Perjalanan change, accepted).
- #127 L3/L7/L9/L10: Directions photos have generic alt text and no alt field, the CMS preview cannot show member-only blocks, every page carries +781 B, and an untouched new way is saved as `{}`.
- #127 L11/L12: the editor tile colours are hard-coded instead of themed, and reordering ways keeps focus on the old position, with index keys.

### Lucky draw
- #178 L1/L5/L6: the session picker shows on events with no scan sessions, "any session" semantics are undocumented in the UI, and at 390 the trash icon wraps in nested groups.
- #178 L2 / #182 L4: session ids and participant ids from another event are accepted on save (no effect, no leak).
- #178 L3: when the scan read fails, check-in prizes give a generic 500 on the stage.
- #178 L7 / #182 L7: rollback caveat: reverting would silently widen session conditions and turn bonus weighting into equal.
- #178 L8/L9: old and /scan sources count in different units, and existing weighted prizes change odds once /scan check-ins exist.
- #178: with the editor open at 1280, the prize list hides prize names (pre-existing); the "SESI CHECK-IN SUDAH DIHAPUS" summary is literal uppercase.
- #181 L14/L15: when the session list cannot be read, every participant prize is refused, and rule counts skip the deleted-session check.
- #182 L2/L3/L5/L6/L8: a removed participant's reason reads "QR tidak ada", a header with no QR/Email column is read as headerless, rule cards and the odds table count differently, an over-max bonus is capped silently, and preview payloads carry all participant ids.
- #182 L1b: very large bonus lists are not handled gracefully.
- #191 I1/N2: another event's entry group returns 500 instead of 404, and the orphan-winner banner stays after a 422.

### Export/Import
- #188 L2: duplicate session names give duplicate export headers.
- #189: a plain `check_in` column can fill a "Check in" question, and a label starting "check_in: " is ignored silently.
- #102: phones in the CSV show a visible `'` prefix (accepted), and the admin export menu clips at 390 (pre-existing).
- #92 R1/R5: the check SQL is not in the repo, and users with saved column prefs do not see the new Registered column until they reset.
- #93: at 390 the Send and Export icon targets are 46 px wide, and the phone has no active-filter indicator.
- #130 L2-L7: facet counts exclude source-deleted rows that the table includes, Client view sorts blanks differently, `?f=` first flashes the unfiltered list, value options lack listbox keyboard support, "+ Filter" wraps at 390, and repeated `f` params resolve differently.
- #147 L1/L3-L5: a hand-edited filter with both `has` and `kosong` widens results, paging among ties has no id tie-break, Seat "contains" matches across the separator, and a blank first seat label shows ", B1".
- #154 L2/L4/L5/L7-L9/L13: the Room filter decides hotel names event-wide, number answers sort as text, events over 20,000 get the 422 cap on every new sort, a deleted sort column errors until reload, check-in filter names lack "(closed)", "Registered" without sort has no filter menu, and Export and Select all ignore the on-screen sort.

### Participant sign-in
- #77 R2: on EN-primary events the unprefixed /peserta and /masuk titles are Indonesian.
- #49 L1-L4/L6/L7/L10: the Tampilkan button radius and size are off, aria-pressed is used together with a label change, the password dialog has no Show, there is no "change email" after a link is sent, the confirmation email wording is off, and old sign-in token rows are not pruned yet.
- #162 L3: the "Hubungi panitia" help line needs the Contact section switched on, not only contact details (confirm intent).
- #162 L4/L6/L7: with the phone keyboard open, Masuk must be scrolled into view, a few mock gaps and a stale comment remain, and /masuk shows the landing page until hydration.
- #163 remaining: on the standalone /masuk page "Lupa kata sandi?" is still 44 px, and the form-only "Area peserta" eyebrow is 2.58:1 over the KV.
- #67 nit: top app bar aria labels sit outside `lang="en"`.
- #195/#196: Participant area saves the whole participant-area setting it loaded, so an admin tab left open from before a sign-in change puts the old sign-in method back when it saves anything. The server checks `updated_at` only against its own re-read, not against the tab's; fix by sending only changed keys, or by sending the loaded `updated_at` and answering 409.
- #201: sign-in by "Participant fields" can still use a staff-only question (e.g. an imported staff ID); confirm with Mas whether that is intended.

### Checkpoints
- Self-scan: the classic and modern checkpoint cards show "Tampilkan QR" next to the scan button only where the dashboard already passes a QR link (modern does not), so Both on modern has no fallback link on the card; the QR stays in the portal's own QR place.
- #169 L2/L5: the post-check SQL misses grants and constraints, and POST returns 500 before the migration.
- #172/#173 F4: Sessions tab strings are still Indonesian; F2, a ~120 ms Assignments-to-Kit flash, is accepted.

### Registration
- #52 L1-L10: the badge has low contrast on the dark bar, touch targets are 44 not 48, type tokens and KV band spacing are off, times show no zone, "Lihat denah" links to an unpublished map, the admin menu is misplaced, the email audience includes rejected or unverified people, the footer lacks Keluar, and an aria-label sits on a bare span.
- #52 new: the logo fallback drops its href, aria-modal is decided at open, and the mobile X is labelled "Tutup menu".
- #112 L3-L6: tap targets under 48, the focus ring on navy, validation scrolls under the sticky nav, and font CLS; closed and invite headings use the old weight, and signed-in users still see "Sudah terdaftar? Masuk".
- #113: the KV is the LCP (by design), and `banner_url` and the KV can disagree with the nav under 50%.
- #59: a retry inside the claim window reports "0 email terkirim", the idempotency key includes attempts, a render failure has no audit line, meta wraps with a leading "·", and there is no EN version.
- #75: the `{acara}` token shows in the EN placeholder (accepted), there is no ID render hash-check, and PilihanRadio is a local copy.
- #69: clicking the active tab on the Registration page leaves it loading forever, and phone is labelled three different ways.
- #129 L1-L6: Event settings show generic validation errors and mixed-language toasts, a spaces-only email is rejected, phone accepts a newline or tab, names do not match, and Event page Import drops contacts silently; the invitation email names Reply-to, not the organiser contact.
- #128 L4/L5: the notch colour is off in Editorial, and a long Editorial h1 overflows at 390.
- #92 R4: a form submitted with an imported participant's email creates a second participant (pre-existing).
- #144 L4-L9: field errors and the email are Indonesian on EN events, the Modern dashboard puts the card on its own row at 1280, Classic hardcodes `lang="id"`, the post-check could miss a stray constraint, and an admin full save can overwrite a concurrent self-update.
- #119 R2-L1-L3: deleting a participant does not clear the invitation's `rejected_at` or write a new-link audit row, and the invitation update seq-scans.
- #201: keys of questions deleted before this branch are not in `retired_keys`, so a new question named like one of those still gets its key and the answers stored under it; turning "Ask on the registration form" back on after saving it off leaves Required off; `/admin/registrasi?kolom=baru` opened as a new page (not from the Columns menu) shows the moderation screen until hydration; Client view > "Form answers the client sees" lists staff-only questions with no mark (needs a mockup).

### Landing/CMS
- #108 L7: editor `data-sunting` attributes ship in public HTML (not re-confirmed).
- #109 N2-N4/R3-4: stored backslashes or edge-spaced marks render differently, overlap leaves an empty `<mark>`, CJK runs expand whole, and some execCommand edge cases remain; an over-200 tagline save shows a raw 422 toast.
- #110 L5/N3/K1: a custom Gathering agenda eyebrow is not counted when hidden, the Highlights subtitle is truncated at 1280, and the KV hint omits the confirmation email header.
- #110 notes: the disabled-Highlight reason is not reachable by keyboard, the caret jumps after a refused IME commit, and the readiness link for the link preview image opens the wrong tab.
- #114 L3: a portal dragged to the end is stored as the default (by design).
- #115 R2-L3-L6: rundown separator lines are 2.2:1, a custom icon fails on plain-http storage (local only), the build output is larger, and tile colour placement differs from the mockups.
- #116 L3/L4/L6/I2: Logistics is not in the focus refresh, no-link box actions are not keyboard reachable, hero ink at 80% is under 4.5:1 on mid-tone brands, and the bar loses width while boxes show.
- #117 L1: the focus ring on hero pills is faint.
- #123 L5-L7/L9/R2-L2: CLS at the end, no pause on `visibilitychange`, style-picker radios lack arrow keys, the layout enum and icon are not validated per type, and colon separators remain; a long venue overflows the hero info row at 390.
- #156 L1/L3/L5: the logo-over-hero option shows without a hero image, any future `next/dynamic` without a loading state blanks admin and sticks dialogs, and the aria-busy skeleton has no label.
- #106 L1/L3/L4: Reset colours on Conference or Forum removes the admin's own white bar, every existing Gathering event shows "In use · Edited", and the Gathering thumbnail has a white strip.
- #107 L3/N2: existing Gathering events restyle on merge without Apply, and the footer year strip has edge cases ("© 2026 2026").
- #111 R3-L1/R3-L3/R3-L4: thin line-art KVs are under-measured, so the button edge dips under 2:1; a forged `hero_bg_terang` removes the shade; the 8000 px limit applies to every upload kind; and there is no JPEG fallback when WebP encoding is unavailable.
- #87 / #116: hero ink fails on saturated brands without a KV (shared, pre-existing).
- #88 Lows: footer links are under 48 px wide, the bell, EN toggle and the /daftar "Halaman acara" link are 44 px, and the footer focus ring is faint.
- #158 L1/L6-L9/L11/L13-L15/N1-N3: agenda rows are shorter than the mockup, click-to-edit is section-level only, tablet is cramped, a long tagline outgrows the hero, the phone menu merges with the hero, fixed copy is not editable, the focus ring is 2.63:1 on navy, the no-KV hero runs into the agenda, day tabs are 44 px, and long words do not scale at md/lg.
- #160 L2: the section dot for a block without an h2 floats in whitespace.
- #57: Modern after Gathering keeps the teal Source font (accepted), and Editorial keeps the Gathering flags.
- #24/#26 F3/C1: SSR `<html lang>` stays "id" (accepted), and a translation draft cannot be imported directly.
- #27: page-level `en` fields are not checked in the client, screen-reader text in row names has no pause, and EN has no badge count.
- #35 F5/F6: all tabs point `aria-controls` at one panel, the Label and Sapa screens still use radiogroup tabs, and "Huruf judul" has 6 tab stops.
- #37 F7: typing `?bahasa=en` on the main address switches the language; an EN upload 429 says "Too many registrations".
- #13 R1/R2: in the 390 Forum drawer the focus ring is white on white and Masuk is invisible, and Forum line length is 74-85 characters.
- #79 info5: removing the image keeps its descriptions.
- #74: popover and toast portals inherit `lang="id"`, daftar and pratinjau actions return Indonesian, an item-count overflow is reported as "too long", and the Forum hint overflows 4 px at 390.
- #50 L3-L6/R2-L1: preview submit gives no feedback, a non-admin gets "Sesi login berakhir", a form-only event name links to the form, copy mentions a page that does not exist, and the locked switch ring is 2.3:1.
- #51 L1-L4/L6-L8: inconsistent title weight, no selected-card state, a wasteful dropdown card, a numeric aria-label, typography drift, an auto-grow estimate, and duplicate option titles not validated.
- #29 P1-P4 / #30 L1/L2: one FAQ line runs 76 characters, a JSDoc is orphaned, `LEBAR_BACA` is used once, `text-isi` sets no letter-spacing, the label-to-heading gap is 20 px in TeksGambar, Unduhan and Lokasi (target 12-16), and an eyebrow prop is dead.
- #32 B1: Shift+Tab hides focused fields under the sticky editor header (fix proposed; no re-check in the report), and sticky does not work on phones.
- #46 V1/U5: an EN Chip 2 over 30 characters on a cards/columns layout returns a raw 422, and at 146 px the "Isi" label sits 12 px under the sticky header.
- #90/#91: own-brand events show "In use · Edited" with "Reset to …" (now behind a confirm), and at 390 the preview header sits under the app bar after the scroll.
- #94: the Inter fallback fits one 62-character title on 2 lines where the real font takes 3 (accepted).
- #157 L3/D1: the API accepts `bg_color` on a CTA block that ignores it, and card fills can sit almost on the background colour.

### Speed
- #92 R3: deep-offset participant pages project every row first, and the `source` EXISTS seq-scans registrations across all events.
- #130 M2 / #147 L2: column filters and `sort=seat` read the whole event (about 1.3-4.3 s at 2.5-5k rows).
- #154 L6: every list GET makes an extra sequential sessions read.
- #145 L2: each scan adds 1-3 serial queries (+20-60 ms in production).
- #178 L4: `GET /prizes?pool=1` rebuilds the pool once per prize (about 2 s for 5 prizes at 2.5k).
- #56 L2: the participant list runs logistics queries on every load, even with no logistics.
- #127 L8: the Directions editor fetches the whole logistics payload just for hotel names.
- #91 L5: font preloads delay FCP and LCP by about 150-300 ms on throttled Forum and Editorial loads (accepted trade-off).
- #186 L1: up to 45 s staleness, by design.

### Admin shell
- #78: on rail close, the top bar covers the still-wide rail head for about 75 ms (optional).
- #76 F2/F3: Users & roles hides assignments on archived events from the super admin too, and the event-id `.in()` list grows the URL.
- #82 N2: an unknown event id returns 404 with a VALIDATION_ERROR body.
- #83 Lows: "shares an event" counts archived events, the PATCH access lookup has no paging, and /users gets 400 from the booths API once 2+ events are active, so booth labels fall back to "#1".
- #61 L2-L7/L9: client-domain copy after the 72 h stop, a 20 px "Batalkan domain" button, a misleading error when the domain is already in the project, a WhatsApp `link_origin` note, root shorthands drop the event, and the HTTPS step has no "Periksa sekarang".
- #93: at 390 the selection bar row leaves a lot of empty tint (cosmetic).

### Other
- #55: preview blasts stuck in `mengirim` stay there and keep waking the prod cron, the list and report count failures differently (N4), and L2-L4 and L6-L12 were not re-checked.
- #58 L1/L3/L5: sender validation errors show only a generic toast, other instances keep the old sender for up to 30 s, and the DB check on reply-to is looser than the API.
- #63 Lows: the beacon fires on scripted focus or scroll, a held Invitation blast cannot be cancelled, cancel error copy misleads, and the `patch-or` guard is textual.
- #141 L1/L3-L10: walk-in link email: copy inlines lower-case option labels, no warning when email is not configured, an unused token stays after a failed send, DB errors look like "not eligible", the language follows the event default, and "Forgot password?" advice is wrong for some skip reasons.
- #144 L6/L7: the update-details email is always Indonesian, and Classic dashboards hardcode Indonesian.
- #100: the live client view "status" column still shows Type (pending a product decision), only a super admin can reset a Viewer PIN, pagination has no thousands separator, and `BarisForm.id` is typed as number.
- #101 L2: with a larger default font, the chip overflows and columns truncate.
- #104 L1-L4: after copy_created the copy is not shown so Duplicate can run twice, retry has no pause, the form still looks live, and start-aligned popovers are not clamped on the right.
- #190 L1/L2/I2: the pre-check is labelled optional but must be run, the post-check is incomplete, and the total is 0 when offset is at or past the total.
- #37 / #48: `favicon.ico` returns 404 on every page.
