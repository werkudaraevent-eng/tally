# KSO participant-area audit (17 Oct 2026)

Status per item as of 18 Oct 2026, after #199 to #202. This is the working copy of the audit: change an item's status here in the PR that changes it, and keep the audit summary in `docs/STATUS.md` in step.

## Scope

- The KSO gathering's participant area after sign-in (Home, Schedule, Travel, Announcements, Profil and the QR) and the public event page that leads to it, at 390×844, 768×1024 and 1280×588.
- U-xx are findings. E-xx are lessons from Eventnook, used as a UX reference: compare with it and name it as the source, do not copy it.
- Method: the live portal was opened signed in as Mas's test account; each page was measured by script (type sizes, contrast, touch targets, headings, landmarks, sticky elements, sideways overflow); the participant-area code was read for behaviour not visible on screen; five review lenses ran separately (flow, visual hierarchy and identity, accessibility, phone and tablet layout, language), and every finding was re-tested by a checker trying to refute it. Findings were checked against DESIGN.md, CLAUDE.md and the Lows parked in `docs/STATUS.md`.
- Limits: nothing was saved, sent or signed out on the KSO event (sign-in, password reset and sign-out were read from code); screen readers and real keyboard focus were not tested; empty, error and offline states were judged from code; organiser content may be test data; the production database was not read, so participants' batches and KSO's sign-in method were not checked.

## Summary

| Status | Count | Items |
|---|---|---|
| KSO content in the CMS (Mas) | 5 | U-04, U-08, U-15, U-34, U-35 |
| Needs a decision or a mockup from Mas | 3 | U-25, U-30, E-13 |
| Partly done | 10 | U-01, U-09, U-21, U-24, U-26, E-01, E-06, E-09, E-10, E-12 |
| Not started | 9 | U-23, U-27, U-32, U-36, E-02, E-04, E-05, E-11, E-15 |
| Done | 24 | U-02, U-03, U-05, U-06, U-07, U-10, U-11, U-12, U-13, U-14, U-16, U-17, U-18, U-19, U-20, U-22, U-28, U-29, U-31, U-33, E-03, E-07, E-08, E-14 |

Suggested order:

1. Mas: the KSO content items in the CMS. They need no code.
2. "Your batch" (U-01 step 2, E-01, E-06, E-10): done in #223 (merged 19 Oct) as Agenda > Section > Who it's for, reading a dropdown participant field such as the staff-only Batch column from #201; migration 202610180002 run by Mas on 19 Oct. Left for KSO: the Batch column and Who it's for on each Batch section.
3. Code: the "After KSO" list (accessibility, polish, language), in small PRs; U-12, U-13, U-19 and U-29 are done.

## What already works (keep it)

Measured at audit time:

- The QR is one tap away on phones: the gold button in the middle of the bottom bar on every tab, plus the QR stub on the pass and the button on the checkpoint card.
- The QR screen is ready to scan: a white card, the name and job title for staff to match, a text code to type when a scanner fails, a brightness hint, and "Unduh kode", which saves the card as an image.
- Travel is a personal page with one card per kind: the hotel with a map and check-in time, the bus with its plate and a crew member to call or WhatsApp, and the outbound and return trains with coach and seat.
- The checkpoint guide gives the next step, the place, one QR button, progress and points, with screen-reader text "Sudah selesai" and "Belum".
- 0 contrast failures and 0 touch targets under 48 px on every portal page at all three sizes, and no sideways overflow.
- A distinctive identity on two surfaces: the navy boarding-pass travel card with the KV, the tear line and the QR stub, on the event page and in the portal. Home passes the logo-swap test.
- The structure is right: tabs and days are real links, so Back and shared links work; start and end times sit on one line; one H1 per page; logistics and bus crew are per-event switches, off by default.

## Findings (U-xx)

### U-01 Two-batch days: Home and Schedule default to Batch 1, and the portal never names the participant's batch

- Status: Partly done (#199, #201)
- Priority: high. Area: Home and Schedule. Scope: platform.
- Finding: On 6 and 8 November, the days with two batches, Home and Schedule took the first Agenda section of the day, so Batch 2 participants would read Batch 1's meeting and train times with a countdown (on the 6 November departure, an hour or more earlier than their own). The portal never says which batch a participant is in, the "(Batch 1)" label is gone after the first two items, and organisers cannot send an announcement to one batch only.
- Compared with: Cvent targets rule-based audience segments, Luma shows each guest only their own blasts, and Eventnook filters the agenda by track (see E-01).
- Recommendation: (1) No SQL: when more than one Agenda section is dated today, Home and Schedule show the next item of each section with its label instead of silently using the first; days with one section do not change. (2) After Mas decides: an "Applies to" choice on Agenda sections and announcements, defaulting to all participants and using groups from existing participant data. The portal then shows the participant's own section, offers a "Lihat jadwal semua batch" link, and names the batch on the travel card. The new column is one SQL file that Mas runs himself.
- Left: Step 1 shipped in #199: Home lists the current and next item of each section with its label, and Schedule groups days by date with a labelled Batch switch (it still opens on the first section of the day). Step 2 is open: an "Applies to" setting per Agenda section and announcement that reads the participant's batch, so Home, Schedule and the travel card show their own batch first. It needs a mockup and a small SQL file Mas runs. #201 supplies the data: in Registration > Edit form, a question with "Ask on the registration form" switched off becomes a staff-only Participant list column, but nothing in the portal reads it yet. For KSO, add Batch from Participant list > Columns > "Add a column in Registration" before the import; the import template includes staff-only columns.
- Decision on record or question for Mas: DESIGN.md and the header comment in src/app/peserta/page.tsx record "Susunan acara, bukan Jadwal Anda": the agenda is the same for everyone, not a personal schedule. Targeting sections at a batch changes that decision, so step 2 needs Mas's agreement.
- Code: `src/lib/member/hari-agenda.ts` (ringkasanBeranda, kelompokkanHari, labelPembeda); `src/components/member/portal-horizon.tsx` (KartuBerlangsungHorizon, KartuBerikutnyaHorizon, SegmenBagianHorizon); `src/components/member/dashboard-gathering.tsx`; `src/lib/kolom-staf.ts` (staff-only columns, #201); `src/lib/member/pengumuman.ts` (announcement audience); `src/lib/landing-agenda.ts` (loadAgendaPreview)
- Related: E-01, E-06, E-10, U-04, U-05, U-06

### U-02 Attendance QR without signal: needs the network to open, lets the screen sleep, and shows guests the cashier offline banner

- Status: Done (#199, #206)
- Priority: high. Area: QR. Scope: platform.
- Finding: Check-in and checkpoints happen in crowded stations and on the train, where signal is worst. At audit time a participant opening the QR without signal got a browser error page, the screen could switch off in the queue so they had to unlock it in front of staff, and the offline banner guests saw was the staff cashier text ("OFFLINE", "jangan buat order"), covering the bottom bar.
- Compared with: Eventbrite lets attendees save the ticket as an image to get in without internet, and the QR in a Luma Wallet pass shows offline.
- Recommendation: (1) Keep the ?tab=qr address, but show the QR at once from the code already on the page; the server render for that tab only needs the code. (2) Request a Screen Wake Lock while the QR is open, as the staff scanner does, and stay silent when the browser does not support it. (3) Keep the cashier banner to staff screens and give guests their own message above the bottom bar, for example "Kamu sedang offline. QR yang tersimpan tetap bisa ditunjukkan." (4) Before departure, one row, "Simpan QR ke galeri sebelum berangkat", that calls the same save as "Unduh kode". If the QR is kept on the device, keep it per account and delete it on "Keluar". Enlarging the QR from 192 px to the card width is optional.
- Left: Shipped in #199: the QR opens at once as a layer from the code on the page, a service worker shows a saved offline copy without signal (deleted on "Keluar"), the screen stays on while the QR is open, guests get their own offline note, and Home shows a "Simpan QR ke galeri" row from three days before the event to its last day. #206 finished it: the cashier banner now lives only in the Cashier and Booth layouts, so no guest page shows it; the reloaded QR page skips the announcements query and loads only the bus (see U-10); the saved offline copy follows the signed-in account (removed when someone signs in or registers with a password on that phone, and when the signed-in account has no QR).
- Code: `src/components/member/qr-fokus.tsx` (PemicuQr); `src/components/member/lapisan-qr.tsx` (PenyediaQr, PesanLuringQr, wake lock); `src/components/member/simpan-qr-galeri.tsx` (SimpanQrGaleri); `src/app/offline-banner.tsx` (OfflineBanner); `src/app/peserta-sw.js/route.ts` (participant service worker); `src/lib/member/halaman-qr-luring.ts` (halamanQrLuring); `src/components/member/form-keluar.tsx` (hapusSalinanQr); `src/components/member/dashboard-gathering.tsx` (?tab=qr branch)
- Related: U-10, U-18, U-28

### U-03 Announcement unread marks: cleared before anything is read, silent to screen readers, and the pinned item always first on Home

- Status: Done (#199)
- Priority: high. Area: Announcements and Home. Scope: platform.
- Finding: Announcements carry last-minute time changes. At audit time Home showed only the first announcement and pinned items came first, so an older pinned note kept a new bus time off Home; opening the QR marked everything read unseen; and by the time the list was opened, new items had lost their "Baru" mark. The tab mark was an aria-hidden dot with no count.
- Compared with: Whova shows an unread dot on each tile and a count badge on the tab, and Luma keeps blasts on the event page even when notifications are off.
- Recommendation: Mark announcements read only when the Announcements tab opens or an item is actually shown, not on every render and not on the QR screen, and keep "Baru" for the rest of that visit, as the event page bell does. On Home show unread items first, and the pinned one only when nothing is new. Use one mark for the bell and the tab: a visible count badge, read to screen readers as "Pengumuman, 1 belum dibaca".
- Decision on record or question for Mas: At audit time the header comment in src/app/peserta/page.tsx recorded "opening the page marks everything read", an earlier decision written before the portal had tabs, and the audit asked Mas to confirm the bell pattern instead. #199 (merged) applies the bell pattern to the tabbed Gathering portals and the comment now says so; other layouts keep the old rule. The unread-first Home card and the count badge are in the Horizon portal only: the classic Gathering Home card still shows the first announcement, pinned first.
- Code: `src/app/peserta/page.tsx` (mark-read rule per layout); `src/components/member/tandai-pengumuman.tsx` (TandaiPengumumanDibaca); `src/components/member/dashboard-gathering.tsx` (Announcements tab and Home card); `src/components/member/portal-horizon.tsx` (KartuPengumumanHorizon, LencanaBelum); `src/lib/member/pengumuman.ts`; `src/components/member/lonceng-pengumuman.tsx` (event page bell)
- Related: E-05

### U-04 KSO content contradicts itself on the trip length and the first day, and misspells the Batch 2 train

- Status: KSO content in the CMS (Mas)
- Priority: high. Area: KSO event content (event page, Home, Schedule). Scope: KSO content.
- Finding: The public hero says "Tiga hari", Home said "empat hari", and the Schedule is headed 6 to 8 November but starts on Thursday 5 November with a copy of the Batch 1 morning and no group label. Because Home takes the first dated section, on 4 November it would show every participant the Batch 1 station meeting as tomorrow's next item, so people outside the Thursday group could arrive a day early.
- Compared with: Traveloka and Luma show a schedule change on the e-ticket and in the schedule at once, so there are never two versions.
- Recommendation: Before November: (1) Mas confirms with the organisers who the Thursday 5 November section is for. If it is not part of the trip, switch off Show on public page for that section in Agenda: the event page and Home then count three days and Next points to Friday. If it is for a particular group, rename it to name that group, then align the event dates and the hero text. (2) Change "Kereta Api Takshaka" to "Kereta Api Taksaka". (3) Check the tickets of two or three real participants per batch against the Agenda times before changing any time.
- Left: All three steps, for Mas in the CMS. #199 took the section count out of the Home subtitle (it now uses the event dates) and the Next card names the real date, but the event page day heading and the Schedule days still come from the Agenda section dates. While the Thursday section is published, the event page counts four days and on 4 November Home shows it to everyone as "Berikutnya · Besok, Kam 5 Nov". Real tickets cannot be checked from the code; the audit only saw a test account.
- Decision on record or question for Mas: Open for Mas: who is the Thursday 5 November section for? PR #155 recorded its "Hari ke-0" label.
- Code: `src/lib/landing-agenda.ts` (jumlahHariAgenda, loadAgendaPreview); `src/lib/member/hari-agenda.ts` (ringkasanBeranda); `src/components/landing/event-landing-modern.tsx` (day heading)
- Related: U-01, U-05, U-09, U-15

### U-05 Home Next card: no real date in the eyebrow, and placed near the bottom on phones

- Status: Done (#199)
- Priority: medium. Area: Home. Scope: platform.
- Finding: On desktop and tablet the eyebrow read "Selanjutnya • Hari pertama", counted from the order of Agenda sections rather than from dates, so next to the "6–8 Nov" pass it read as Friday although the item was on Thursday. On phones it said only "Agenda berikutnya" with no day, and the card came about two screens down.
- Compared with: Eventbrite shows the next event as a large ticket card with date and time, and Cvent's My Event has a Schedule Snapshot of what is on now and next.
- Recommendation: Write the real short date in the eyebrow at every width, in the train-row format: "Selanjutnya • Kam, 5 Nov", "Hari ini", or "Besok • Jum, 6 Nov"; only the eyebrow text changes. Separately, a layout choice for Mas by mockup: one "next" card at the top of Home that combines checkpoint, ticket, bus and then Agenda, or the agenda card moved up on phones right under Announcements (Announcements stay on top, as the list of rejected changes requires). See also E-06.
- Decision on record or question for Mas: On record: the navy checkpoint card at the top, the 34 px heading and the fixed Horizon order come from V5, the checkpoint UI work and #194. Mas chose the second layout in the mockup: on phones Now and Next sit right under Announcements. #199 shipped it with eyebrows such as "Berikutnya · Besok, Jum 6 Nov".
- Code: `src/components/member/portal-horizon.tsx` (KartuBerikutnyaHorizon, KartuBerlangsungHorizon); `src/components/member/dashboard-gathering.tsx` (hariPendekTanggal, phone order on Home); `src/lib/member/hari-agenda.ts` (ringkasanBeranda)
- Related: E-01, E-06, U-01, U-04, U-19

### U-06 Schedule day picker: the selected day is not scrolled into view on phones and tablets, and at 1280x588 the last day is hidden with no cue

- Status: Done (this PR)
- Priority: medium. Area: Schedule. Scope: platform.
- Finding: Friday and Sunday are the two-batch days. At 390 px only the first pill was fully readable and "(Batch n)" was cut off, and at 768 px the selected Batch 2 pill was cut at the right edge. On a 1280x588 laptop the Batch 2 return day could only be reached by scrolling inside the day list, with no sign that it scrolls.
- Compared with: Whova puts a short date strip above Full Agenda | My Agenda, and Cvent's session list scrolls itself to what is coming up.
- Recommendation: (1) On load, scroll the selected pill to the centre of the strip, using the GulirHariAktif pattern horizontally. (2) Add a fade at the bottom edge of the desktop list, only when its content is taller than its container. (3) No code, with Mas's OK: shorten the KSO Agenda section titles in the CMS, for example "Jumat · Batch 1"; the date already comes from the data, so the doubled date goes too. Building labels from data for every event changes the V5 design and needs a mockup.
- Left: Done: (1) in #199; (2) in this PR, the desktop day list (HariJadwalHorizon) fades out over its bottom 32 px only while more days are below (class pudar-bawah-gulir in globals.css: a scroll-driven animation on the list's own scroll timeline, so a list that fits or is scrolled to its end has no fade; browsers without animation-timeline, Firefox today, show no cue). A fade rather than a shadow, because DESIGN.md keeps shadows for floating surfaces. Optional KSO content: under each date the desktop list still shows the first section's CMS title without "(Batch n)"; shorter section titles in Agenda would fix that.
- Code: `src/components/member/portal-horizon.tsx` (ChipTanggalHorizon, SegmenBagianHorizon, HariJadwalHorizon); `src/components/member/gulir-hari-aktif.tsx` (GulirChipAktif, GulirHariAktif); `src/lib/member/hari-agenda.ts` (kelompokkanHari, labelPembeda); `src/components/member/dashboard-gathering.tsx` (Horizon Schedule tab)
- Related: U-01, U-29

### U-07 Organiser help: a phone link only, no WhatsApp or email, and missing when the number is empty

- Status: Done (#199, #206)
- Priority: medium. Area: Home, Travel and Profile. Scope: platform.
- Finding: A participant who is lost or has missed the bus needs one button that is always in the same place, and in Indonesia that is usually WhatsApp. At audit time help depended on a single phone field, which was empty for KSO, so the participant area had no organiser contact at all, while bus crews already had Call and WhatsApp buttons.
- Compared with: Luma has a Contact the Host button, Traveloka puts "Need Check-in Help?" on the hotel voucher, and Eventnook has an emergency contact page in its corporate meeting app.
- Recommendation: Show "Hubungi panitia" with two buttons like the bus crew card (call and WhatsApp), from the existing organiser contact setting, with email as a fallback when there is no number. Put it in fixed places: one row on Home and one under "Bantuan dan pengaturan" in Profile. Add an English Readiness item, for example "Organiser contact for the Participant area". See also E-03 for the emergency card.
- Left: #199 shipped call and WhatsApp buttons from Event settings > Kontak panitia (WhatsApp only for an Indonesian mobile number, email when there is no phone): a "Hubungi panitia" card on Home and Travel, and a "Hubungi panitia" block under "Bantuan dan pengaturan" in Profile. #206 added the Readiness item "Organiser phone for the Participant area" (shown while the participant area is on; links to Event settings).
- Code: `src/components/member/portal-horizon.tsx` (TombolKontakHorizon, KartuBantuanHorizon); `src/components/member/dashboard-gathering.tsx`; `src/lib/kontak-panitia.ts` (kontakPanitia); `src/components/admin/settings-panel.tsx` (Kontak panitia setting); `src/app/admin/page.tsx` (kesiapan, the Readiness list)
- Related: E-03, U-08

### U-08 KSO Agenda sends participants to the "Microsite" for bus and hotel details, while bus times and the organiser contact are not filled in

- Status: KSO content in the CMS (Mas); related work in #199, #202
- Priority: medium. Area: KSO event content (Schedule and Travel). Scope: KSO content.
- Finding: Eight Agenda items say "Informasi pembagian kendaraan dapat dicek pada Microsite." and two say "Informasi hotel dapat dicek pada Microsite.", but participants are already on that site, and on phones the Travel page sits under Menu, so the note leads nowhere. The bus card showed only the bus number, plate and crew, with no time or meeting point, and there was no organiser contact anywhere.
- Compared with: Cvent Attendee Hub keeps train, hotel and bus details in one place, and Whova has a Logistics section.
- Recommendation: Before go-live: fill in the phone number in Event settings > Kontak panitia. Add the bus trips per Agenda item in Logistics and give each trip its bus, or use Pick from Agenda once it ships. Change the Agenda notes to "Pembagian bus ada di halaman Perjalanan." and "Hotel dan nomor kamar ada di halaman Perjalanan."
- Left: All content, for Mas: (1) fill in the organiser phone in Event settings > Kontak panitia, as an Indonesian mobile number so the WhatsApp button shows. (2) In Logistics > Buses > Trips, add each bus trip with its bus and meeting point, and link it to its Agenda row with the "Agenda row" picker from #202 (migration 202610170002 was run on 18 Oct). A linked trip's departure then moves with its row, Agenda shows a Bus chip on that item, and the participant Schedule marks exactly that row as the bus trip. (3) Replace the ten "Microsite" notes in Agenda with the two notes above that point to "Perjalanan". The code to show the data is in place: #199 shows each trip's date and time, route, meeting point and map in Travel. Showing the bus time on Schedule rows is a #202 follow-up that needs its own mockup.
- Code: `src/components/admin/logistik/pilih-baris-agenda.tsx` (PilihBarisAgenda); `src/components/admin/logistik/tab-bus.tsx` (New trip and Edit trip dialog); `src/lib/logistik/trip-agenda.ts`; `src/lib/member/trip-jadwal.ts` (pencocokBarisTrip); `src/app/admin/rundown/page.tsx` (Bus chip, CatatanBus); `src/components/member/portal-horizon.tsx` (PerjalananBusHorizon); `src/components/member/dashboard-gathering.tsx`; `supabase/migrations/202610170002_trip_dari_agenda.sql`
- Related: E-03, E-12, U-07

### U-09 Day count taken from Agenda sections instead of the event dates, with no guard for sections outside the event

- Status: Partly done (#199)
- Priority: medium. Area: Home, Schedule and event page. Scope: platform.
- Finding: The KSO event page says "Tiga hari", "Empat hari", a counter "01–06" and 6 to 8 November at the same time, and Home said "empat hari yang menunggumu" right above the "6–8 Nov" pass. The trip length is the first fact participants and the client read, and because the counting rule is in the platform, any event with a travel day or two batches gets the same result.
- Compared with: Airbnb's trip card takes its date range from the booking, and Luma writes multi-day events as a date range.
- Recommendation: Count "N hari" from the event start and end dates, the same source as the pass. Make the "01–NN" counter follow the same count or remove it (a V5 element, Mas decides). Add an English warning in Agenda and a Readiness item when a section is published outside the event dates. The subtitle names only what has data.
- Left: #199 moved the Home and Schedule subtitles to the event date range. Still open: jumlahHariAgenda still counts unique section dates and feeds the event page day heading (classic and Horizon), so it can disagree with the CMS hint, which counts event dates; the "01–NN" counter still counts sections, batches included; #206 added the warnings: Agenda > Section shows one under Date when the date is outside the event, and Readiness lists "N Agenda sections dated outside the event" (drafts included, the same rule as the Agenda warning). Minor: the Home subtitle ("Tiket dan jadwalmu untuk" plus the dates) names the ticket and schedule even when those are switched off. #201 and #202 change none of this.
- Decision on record or question for Mas: Open for Mas: (1) the "01–NN" counter on the event page is a V5 element; should it follow the date count or go? (2) Home has two headings from V5, "siap bikin cerita baru?" on desktop and "ini perjalananmu." on phones; keep two, or use one?
- Code: `src/lib/landing-agenda.ts` (jumlahHariAgenda); `src/components/landing/event-landing-modern.tsx` (day heading and 01–NN counter); `src/components/member/dashboard-gathering.tsx` (Home subtitle); `src/lib/member/portal-i18n.ts` (subtitleDates); `src/app/admin/landing/page.tsx` (day count hint); `src/app/admin/rundown/page.tsx` (Agenda, where the out-of-range warning would go); `src/app/admin/page.tsx` (kesiapan, the Readiness list)
- Related: U-04

### U-10 Tab switches and opening the QR wait on the server with no sign of progress, and there is no participant error page

- Status: Done for Horizon (#199, #206)
- Priority: medium. Area: All portal tabs and QR. Scope: platform.
- Finding: Two seconds with no sign makes people tap again or think the link is broken, and on station networks the wait is longer (switching days in Schedule measured 1.8 to 2.4 seconds on desktop). Server errors ended on the default Next.js error page with no way back to the QR.
- Compared with: Eventbrite tells attendees when the device is offline, and saved tickets still open.
- Recommendation: (1) A loading skeleton for the participant page that keeps the top and bottom bars, or a pending marker (useLinkStatus) on the tabs and the QR button. (2) An error.tsx with "Coba lagi" and links to Home and the QR. (3) A participant-only offline text (U-02). (4) The QR tab does not load the agenda, logistics or lodging. Empty states stay honest and do not promise times the platform does not know.
- Left: (1) to (3) shipped in #199 for the Horizon portal: tabs show a pending marker and a skeleton with a gold progress line under the top bar, QR buttons open a client layer with no server request, the participant error page offers "Coba lagi", "Tampilkan QR" and "Beranda", and guests get their own offline note (the reloaded QR page still shows the cashier banner, see U-02). (4) done in #206: the QR page opened by reload or a shared link skips the agenda and the announcements query, and reads member_logistics without train tickets or bus details. Layouts other than Horizon get only the error page.
- Code: `src/components/member/muat-portal.tsx` (PenandaTab, KerangkaPortal); `src/app/peserta/error.tsx`; `src/components/member/qr-fokus.tsx` (PemicuQr); `src/components/member/lapisan-qr.tsx` (PesanLuringQr); `src/components/member/dashboard-gathering.tsx` (?tab=qr branch); `src/lib/logistik/peserta.ts` (loadMemberLogistics); `src/app/peserta/page.tsx` (loadMemberAnnouncements runs before the QR branch)
- Related: U-02

### U-11 At 1280x588 the top bar and tab header fill the first screen, and the phone top bar never compacts

- Status: Done (#199)
- Priority: medium. Area: All portal tabs (top bar and page header). Scope: platform.
- Finding: 1280x588 and 390 px are the main sizes Mas checks. On desktop the first content started about 315 px down on every tab, and on Home the next 200 px were the decorative pass image, so destination, hotel, bus, room and the mini QR fell below the fold. On phones the 98 px top bar and 89 px bottom bar left 657 px for content.
- Compared with: Eventbrite and Airbnb open with the ticket or stay card, and the M3 small top app bar is 64 dp tall.
- Recommendation: Use the compact bar the Horizon event page already has on every portal tab: 64 px with a 40 px logo on phones. On short desktop screens (720 px tall or less): a 72 px bar, 48 px logo, 30 px H1 without the eyebrow, and a 145 px pass image. Keep the header height the same across tabs and the V5 sizes on tall screens. Mock it up on a real render first, because the change shows in KSO.
- Decision on record or question for Mas: On record: the 48 px heading, the eyebrow, the 200 px pass image, the logo size and the tall top bar come from V5 and stay on desktop screens taller than 720 px; the change only adds a compact variant for phones, tablets and short laptops. The approved mockup uses a 64 px bar on short laptops instead of the suggested 72 px.
- Code: `src/components/member/portal-horizon.tsx` (KepalaHorizon, SapaanHorizon, PassHorizon); `src/app/globals.css` (short variant, max-height 720px); `src/components/member/muat-portal.tsx` (KerangkaPortal); `src/components/landing/modern/landing-nav-modern.tsx` (compact bar on the event page)

### U-12 Focus ring under 3:1 on navy areas, and on cream cards when the device is in dark mode

- Status: Done (this PR)
- Priority: medium. Area: All guest pages (event page and portal). Scope: platform.
- Finding: Keyboard users, for example on a hotel laptop or an iPad with a keyboard, cannot see where they are on the navy bar that every page has: the global ring colour (#2b4dd4) measures 2.46 to 2.62:1 on navy. In dark mode the ring also fails on cream and white cards (2.09:1 and 2.22:1), and with prefers-contrast it all but vanishes on navy, so in any setting a large part of the portal has no visible focus. Touch on phones does not show this ring.
- Compared with: Tally's own Forum layout already flips the ring colour on dark areas (CINCIN_TERANG).
- Recommendation: One shared helper for guest pages (the Horizon event page and the portal) that picks the ring colour per container with kontras(): event gold on navy (#e8c968, about 10:1) and navy ink on cream and white (#101E38, 15.6:1). Lock the values, including a light color-scheme, so dark mode and prefers-contrast do not swap them. This also closes #164 L12, #158 L11 and #112 L4. Then test Tab at 390, 768 and 1280x588, in light and dark.
- Left: Done in this PR: guest pages that use Horizon (the event page and the participant area) draw the focus ring from `--cincin-fokus` (globals.css). gayaHorizon sets navy ink #101E38 for cream and white areas and locks color-scheme to light; navy areas (portal top bar, pass, Profile ticket card, the navy checkpoint card, the QR screen and layer, the event page hero, Agenda band and footer) take the Theme gold through CINCIN_NAVY, or white when the gold is under 3:1 against the navy; the event page bar uses its own text colour, and the bell panel goes back to navy ink. Other layouts keep the primary colour. Not yet done: a Tab test with a real keyboard at 390, 768 and 1280x588 in light and dark (coordinator QA).
- Code: `src/app/globals.css` (global :focus-visible rule); `src/components/landing/modern/horizon.tsx` (gayaHorizon, shared by the event page and the portal); `src/components/landing/forum/styles.ts` (CINCIN_TERANG); `src/lib/landing-hitung-mundur.ts` (kontras)

### U-13 Every tab of every event has the document title "Area peserta", so screen readers do not announce tab changes

- Status: Done (this PR)
- Priority: medium. Area: All portal tabs. Scope: platform.
- Finding: VoiceOver and TalkBack users who tap a tab such as "Jadwal" get no confirmation, because the Next.js route announcer only speaks when document.title changes. The browser tab and history also show "Area peserta" for every tab of every event.
- Compared with: Tally's own public event pages already include the event name in the document title.
- Recommendation: Give each tab its own title through generateMetadata in the form "`<Tab>` · `<event name>`" ("Beranda", "Jadwal", "Perjalanan", "Pengumuman", "Profil", "QR kehadiran"), using the same portal-i18n labels as the menu. Move the top bar and bottom nav out of `<main>`, and give the Home cards clear section names.
- Left: Done in this PR: generateMetadata in src/app/peserta/page.tsx gives each Gathering tab the title "`<Tab>` · `<event name>`" from the portal menu labels ("QR kehadiran" for the QR, the event's Outfit label for Outfit), and the portals without tabs get "Dashboard saya · `<event name>`" (U-21 step 2). KepalaHorizon and NavBawahHorizon now sit outside `<main>`, which holds only the tab content. The Home section names were already in place.
- Code: `src/app/peserta/page.tsx` (generateMetadata); `src/components/member/dashboard-gathering.tsx` (DashboardGathering); `src/components/member/portal-horizon.tsx` (KepalaHorizon, NavBawahHorizon); `src/lib/member/portal-i18n.ts`; `src/lib/outfit.ts` (labelOutfit)
- Related: U-21, U-10

### U-14 Seat, Live voting and Feedback form link show in Participant area for every layout, though the Gathering portal never renders them

- Status: Done (this PR)
- Priority: medium. Area: Participant area (admin) > Shown in the Participant area. Scope: platform.
- Finding: Organisers who set up seats for the gala dinner or add a feedback link will assume participants see them, but the Gathering portal (Horizon included) shows none of it and the editor gives no sign. Seat and Live voting are even on by default. This goes against Mas's rule that the editor shows only the fields the chosen layout renders.
- Compared with: Swapcard hides features that are not available instead of showing them disabled.
- Recommendation: No change for participants. Hide the controls the chosen layout does not render, or add an English note such as "Not shown in the Gathering layout", the same way the Participant home editor adapts for Horizon. If seats or feedback should appear in Gathering, build that as a new feature behind a per-event switch that is off by default.
- Left: Done in this PR: Participant area > Shown in the Participant area hides Seat, Live voting and Feedback form link when the event uses the Gathering layout (Horizon included). Saved values are kept, so switching back to another layout shows them again.
- Decision on record or question for Mas: On record: one content model shared by all portal presets is a long-term direction to discuss, not part of this finding.
- Code: `src/app/admin/area-peserta/page.tsx`; `src/app/admin/area-peserta/susunan-beranda.tsx` (SusunanBeranda); `src/components/member/dashboard-gathering.tsx` (DashboardGathering); `src/components/member/dashboard-modern.tsx` (DashboardModern)

### U-15 KSO's texts in the CMS have typos in the most visible places and name one thing in several ways

- Status: KSO content in the CMS (Mas)
- Priority: medium. Area: KSO content: pinned announcement (Announcements and Home), checkpoints, Schedule (Agenda items), event page FAQ. Scope: KSO content.
- Finding: The pinned announcement, which is the top Home card on phones, has typos and puts the whole message in its title field, and a checkpoint name mixes English and Indonesian spelling. Agenda items mix "Free Time" with "Waktu Bebas", "Check In Hotel" with "Check in Hotel" and "Perjalanan menuju" with "Perjalanan Menuju", and the FAQ writes "Dimana" and answers a question about the venue with the city only. The client is reviewing this event, so these are among the first texts they read.
- Recommendation: Announcement: title "Bawa tumbler untuk hari Sabtu", body "Untuk acara hari Sabtu, 7 November, jangan lupa membawa tumbler, ya." Delete it if it was a test. Checkpoint: "Penitipan Bagasi". Agenda: one term per item ("Waktu Bebas" or "Free Time", not both; "Check-in Hotel") and one capitalisation style. FAQ: "Di mana" in both questions, with answers that name the place and point to the Schedule ("Jadwal").
- Left: Mas fixes the KSO texts in the CMS: the pinned tumbler announcement in Messages > Announcements (or deletes it if it was a test), the checkpoint name "Penitipan Bagasi" in Check-in > Checkpoints, one term per item and one capitalisation style across Agenda, and "Di mana" in both FAQ questions on the Event page, with answers that name the place and point to "Jadwal". No code change applies. Production data was not read for this handoff, so it is not known whether any of these texts have been edited since the audit.
- Decision on record or question for Mas: On record: the client chooses between Indonesian and English terms; what is required is using one consistently.
- Related: U-04, U-08, U-34, U-35

### U-16 On phones the pass facts ("Hotel", "Bus", "Kamar") could not be tapped, and the initials link was named only "Profil"

- Status: Done (#199)
- Priority: low. Area: Home (phone): pass card and top bar initials. Scope: platform.
- Finding: Participants on the move look for the bus crew contacts and directions to the hotel more than anything else. Yet from the phone Home the only ways to Travel were the train row (when there is a ticket) or the Menu tab. Voice-control users who said the visible initials found no link by that name, because its accessible name was "Profil".
- Compared with: Airbnb makes Trips a main tab, and Swapcard acknowledges that badges reachable only from Profile are hard to find.
- Recommendation: Make the pass fact area one link to Travel with a visible "Detail perjalanan" hint; the QR stub stays its own link. Give the initials an accessible name that contains the visible text, for example "`<initials>`, Profil". Optional for Mas: hide the initials on phones, since Menu opens the same page.
- Decision on record or question for Mas: On record: five phone destinations with Travel inside Menu is the #185 decision and not part of this finding. Open for Mas (optional, not done): hide the initials on phones, since Menu opens the same page.
- Code: `src/components/member/portal-horizon.tsx` (PassHorizon, KepalaHorizon); `src/components/member/dashboard-gathering.tsx` (DashboardGathering); `src/lib/member/portal-i18n.ts` (travelDetails, profileAriaWith)
- Related: U-17

### U-17 The Home train row opens Travel at the top instead of at the train card

- Status: Done (this PR)
- Priority: low. Area: Home, Travel. Scope: platform.
- Finding: A participant who taps their train ticket on Home lands on the "Hotel & kamar" card and has to scroll. The train card starts below the fold, about 657 px down at 1280×588 and 958 px down at 390 px wide.
- Compared with: Cvent Attendee Hub has a Train tab, and Apple Wallet uses one pass per journey.
- Recommendation: Give the train card an anchor with a scroll-margin as tall as the top bar, then point the Home train row at it. Optional: on departure and return days, show the train card first. A navy pass style for the train card is a separate design proposal that needs a mockup.
- Left: Done in this PR: TiketKeretaHorizon has id "kereta" with the same scroll margin as the emergency card (scroll-mt-24, lg:scroll-mt-32), and the Home train row opens Travel at #kereta. Optional and not done: show the train card first on departure and return days.
- Decision on record or question for Mas: On record: the Travel card order and the white cards come from #185 ("Data yang ada").
- Code: `src/components/member/portal-horizon.tsx` (TiketKeretaHorizon, KartuDaruratHorizon, BarisTautanHorizon); `src/components/member/dashboard-gathering.tsx` (DashboardGathering: Home train row, Travel tab)
- Related: U-16

### U-18 On tablets (768 to 1023 px) the attendance QR took two taps from Schedule, Travel and Announcements

- Status: Done (#199)
- Priority: low. Area: All portal tabs on tablet (768 to 1023 px). Scope: platform.
- Finding: In this range the portal used the desktop top bar with no bottom bar and no QR button, so the QR could only be reached through Home or Profile. A long custom Outfit tab label could also wrap the top tabs onto two lines at 768 and 820 px (shown in a replica; the default "Outfit" label fits).
- Compared with: Material 3 uses a bottom navigation bar for compact and medium windows (below 840 dp).
- Recommendation: Use the bottom bar with the centre QR button up to lg (1024 px), so the breakpoint matches the two-column Home and the Schedule day list, and show the top tabs only from lg.
- Code: `src/components/member/portal-horizon.tsx` (KepalaHorizon, NavBawahHorizon); `src/components/member/dashboard-gathering.tsx` (DashboardGathering)

### U-19 Below 1024 px the Home reading and Tab order differ from the visual order

- Status: Done (this PR)
- Priority: low. Area: Home (phone and tablet, below 1024 px). Scope: platform.
- Finding: Below lg, Home reorders its cards with CSS order inside display: contents wrappers, so the DOM order is not the order phones show. In the current code, screen readers and the Tab key go through the pass, Save QR, train, outfit and help cards before Now, Next, Announcements and an unfinished checkpoint, while phones show Now, Next and an unfinished checkpoint above the pass, with Announcements first by default. All content stays reachable, but the reading order is wrong on phones and at tablet 768.
- Recommendation: Do not move the mismatch to desktop. Cheapest step: reading-flow: flex-visual on the flex container below lg as progressive enhancement (Chromium 137 and later; check Safari and Firefox). Changing the DOM order is only worth it if U-05 also changes the desktop column order.
- Left: Done in this PR: the Home flex container has reading-flow: flex-visual below lg, so in Chromium 137 and later the reading and Tab order follow the phone order. Safari and Firefox do not support it yet and keep the DOM order, as before. Desktop is unchanged.
- Code: `src/components/member/dashboard-gathering.tsx` (DashboardGathering: Home flex container and its display: contents wrappers)
- Related: U-05

### U-20 The participant QR has several names, and the person who scans it is called three different things

- Status: Done (#199, this PR)
- Priority: low. Area: QR screen, Menu, Home, checkpoints, saved QR image, public event page. Scope: platform.
- Finding: At the audit the QR was called "QR kehadiran" (pass, QR screen), "Tiket masuk" (Profile), "Tiket perjalanan" (public pass preview) and "Lihat tiket saya" (public button that opens Home). The person scanning it was "petugas" (checkpoint), "panitia" (QR screen) or "meja registrasi" (saved image). At a trip event "tiket" also means the train ticket, so "Tiket masuk" was the easiest to mix up, and organisers who say "siapkan tiketnya" at the station can send participants to the wrong screen.
- Compared with: Luma uses one name for the same QR across email, the event page, the app and Wallet; Eventnook is the example to avoid (E-09).
- Recommendation: (1) One name for the QR in the participant area: "QR kehadiran", or Mas's choice. (2) One word for the person who scans, for example "panitia". (3) Action labels use the bottom-bar text "Tampilkan QR", so the pill on Profile does not grow longer. The code-card string is also used by the registration form and the code page (src/app/daftar, src/app/kode), so change it everywhere at once or limit the change to Horizon.
- Left: Nothing. This PR: the saved QR image caption is "Tunjukkan QR ini ke panitia" for the portal, the registration form and the code page alike (code.showAtDesk); the public event page says "Buka Dashboard saya" (was "Lihat tiket saya") and the pass preview "QR kehadiran • Bus • Kamar • Susunan acara" (was "Tiket perjalanan • …"); the Menu subtitle is "QR kehadiran, data diri, dan bantuan acara."; the Home subtitles no longer start with "Tiket" ("Kamar dan susunan acaramu untuk …"); the pending card says "QR kehadiran muncul di sini …"; the classic Gathering quick link and row say "QR" and "QR kehadiran"; the non-Horizon portal tile is "QR kehadiran" with "Tunjukkan ke panitia saat datang"; the Modern dashboard eyebrow, the Forum and Editorial portal card and the closed-registration hint say "QR kehadiran"; the non-Horizon checkpoint card says "panitia" (was "petugas"). "Tiket" is now only the train ticket. Done in #199: the QR card on Menu is titled "QR kehadiran" (was "Tiket masuk") and its pill says "Tampilkan QR" (was "Perbesar QR"), and the Horizon checkpoint card says "panitia" (was "petugas"), as the QR screen already did.
- Code: `src/lib/daftar-i18n.ts` (DAFTAR_UI code.showAtDesk); `src/components/registration-code-card.tsx` (simpanGambarKode, RegistrationCodeCard); `src/components/member/simpan-qr-galeri.tsx` (SimpanQrGaleri); `src/components/member/lapisan-qr.tsx` (PenyediaQr); `src/lib/landing-i18n.ts` (viewMyTicket, horizon.passInfo); `src/components/landing/event-landing-modern.tsx`; `src/lib/member/portal-i18n.ts`; `src/lib/member/peserta-i18n.ts` (pendingBody); `src/components/member/kartu-checkpoint-horizon.tsx`
- Related: E-09, U-28

### U-21 One destination has several names: "Dashboard saya", "Area peserta" and "portal peserta"

- Status: Partly done (this PR)
- Priority: low. Area: Public event page, sign-in dialog, browser tab title, emails. Scope: platform.
- Finding: The bar pill and the email button say "Dashboard saya", the sign-in dialog and the browser tab title say "Area peserta", and the closing band says "portal peserta". On the public event page "Perjalanan" in the bar scrolls to the invitation band, while in the portal the same word means hotel, bus and train.
- Compared with: Eventbrite uses the same Tickets tab everywhere.
- Recommendation: Use one name, "Dashboard saya". Mas chose it on 9 October, and it is already used in the most visible places. Use it also in the sign-in dialog, the tab title (U-13), the closing band and the email footer. For signed-in participants, "Perjalanan" in the public bar opens the portal Travel tab. Admin screens stay "Participant area".
- Left: The sign-in, password and code emails (src/lib/email/member-links.ts) and the account messages on the registration form (src/lib/daftar-i18n.ts account.message*) still say "area peserta". Every one of those sentences also says "Anda", so they are rewritten together with U-23. Done in this PR: the sign-in dialog is "Masuk ke Dashboard saya" with the eyebrow "Peserta"; the closing band, the portal band and the non-Horizon portal CTA say "Masuk ke Dashboard saya"; the bar pill for guests is "Masuk"; the footer guest link and the registration page links say "Dashboard saya"; the announcement email footer no longer names the area; for an approved Horizon participant with travel info switched on, "Perjalanan" in the public bar opens the portal Travel tab (English "Travel", was "Your trip"). The browser tab title is "Dashboard saya" here, and per tab with U-13. Also renamed: the Forum bar link, the legacy event page link, the /masuk eyebrow and heading, and the participant-facing API errors ("Masuk dulu ke Dashboard saya.").
- Decision on record or question for Mas: On record: Mas chose "Dashboard saya" on 9 October.
- Code: `src/lib/member/masuk-i18n.ts` (MASUK_UI); `src/app/peserta/page.tsx` (generateMetadata); `src/lib/landing-i18n.ts` (horizon.registered, navPortal, horizon.inviteCta, portalCta, navPortalSignIn, signInMemberArea); `src/components/landing/event-landing-modern.tsx` (menuAtas, tautanTamu); `src/components/landing/modern/landing-nav-modern.tsx`; `src/lib/email/pengumuman.ts`; `src/lib/email/member-links.ts`
- Related: U-13, U-30

### U-22 The schedule is called "Jadwal", "Rundown", "agenda" and "Susunan acara"

- Status: Done (this PR)
- Priority: low. Area: Schedule, Home, public event page. Scope: platform.
- Finding: The same content is called "Jadwal" (portal tab), "Rundown" (public bar), "ikuti agenda" (the portal band on the public event page) and "Susunan acara" (DESIGN.md and the older portal pages). All of these words are common, so this is a matter of keeping the terms tidy. Still, one CMS that serves many events should use the same word in every layout.
- Compared with: Whova, Cvent and Swapcard use one word from the page through to notifications.
- Recommendation: Use "Jadwal" for participants in every layout, with the page title "Jadwal acara", and keep "agenda" for a single item. The next-item card uses one label at every width ("Agenda berikutnya", not "Selanjutnya" on desktop). Update DESIGN.md and the header comment in src/app/peserta/page.tsx once Mas has chosen.
- Left: Nothing. This PR uses "Susunan acara" for every participant view: the portal tab and page title (the phone bottom bar, Horizon and classic Gathering, says "Acara" so it stays on one line at 360 px, as Profil already says "Menu"), "Lihat susunan acara" links, the public bar link and eyebrow (was "Rundown"), "Lihat susunan acara" (was "Intip Rundown"), "ikuti susunan acara" in the portal band, the classic Gathering Home ("Susunan acara hari ini", was "Rundown hari ini") and the empty state. English says "Schedule" throughout. "Agenda" stays for a single item ("Agenda selanjutnya") and "Jadwal bus" stays for the bus timetable. The public /rundown page that badges link to says "Susunan acara" too. Out of scope: the stage and LED screen title and badge back texts, which are not participant pages.
- Decision on record or question for Mas: On record: Mas chose "Susunan acara" on 18 October, for every participant view including the Horizon tab.
- Code: `src/lib/landing-i18n.ts` (navTrip, seeTrip, tripEyebrow, horizon.inviteNote); `src/components/landing/modern/kerangka.tsx`; `src/lib/member/portal-i18n.ts`; `src/app/peserta/page.tsx`; `DESIGN.md`
- Related: U-36, U-21

### U-23 Participant texts switch between "kamu" and "Anda" within one flow

- Status: Not started
- Priority: low. Area: Sign-in dialog, Home cards, emails. Scope: platform.
- Finding: Horizon's own texts use "kamu" ("perjalananmu", "Hotel, kamar, bus, dan kereta kamu"). The shared texts use "Anda": the sign-in dialog, the email confirmation ribbon, the registration status card, the "Lengkapi data" card and every email. Which "Anda" texts appear depends on the participant's state, so a participant can meet two voices within five minutes.
- Recommendation: Write the shared texts without pronouns and without a new setting, for example "Cek email", "Lengkapi data", "Panitia meminta data ini: {daftar}." Horizon keeps "kamu" once Mas confirms the voice of the V5 mockups, and formal layouts keep "Anda".
- Left: Rewrite without pronouns the shared participant texts that Horizon participants see: the sign-in dialog (MASUK_UI in src/lib/member/masuk-i18n.ts, for example "Cek email Anda"), the email ribbon and registration status card (PESERTA_UI in src/lib/member/peserta-i18n.ts), the "Lengkapi data Anda" card with "Panitia meminta Anda mengisi: {daftar}." (LENGKAPI_UI in src/lib/member/lengkapi-i18n.ts), and the emails (src/lib/email/member-links.ts, src/lib/email/pengumuman.ts). The non-Horizon Gathering public page also mixes "Perjalanan Anda" with "kamarmu" (src/lib/landing-i18n.ts). Mas still has to confirm that "kamu" is the Horizon voice.
- Decision on record or question for Mas: Open for Mas: confirm that "kamu" is the Horizon voice.
- Code: `src/lib/member/masuk-i18n.ts` (MASUK_UI); `src/lib/member/peserta-i18n.ts` (PESERTA_UI); `src/lib/member/lengkapi-i18n.ts` (LENGKAPI_UI); `src/lib/email/member-links.ts`; `src/lib/email/pengumuman.ts`; `src/lib/landing-i18n.ts`
- Related: U-21, U-32

### U-24 Date ranges written two ways, two metadata separators, and the time zone named on one card only

- Status: Partly done (#199, this PR)
- Priority: low. Area: Schedule, Travel, QR screen, Menu, public event page countdown. Scope: platform.
- Finding: Participants check dates and times against their tickets and the organisers' WhatsApp messages more than anything else. At the audit, the long form "6 November 2026 – 8 November 2026" wrapped the Schedule header onto two lines at 390 px. Metadata also used both "•" and "·", and only the Next card named the time zone ("WIB").
- Compared with: Luma shows times in the venue's time zone, with the local time in brackets when it differs.
- Recommendation: Use formatEventDateRingkas for the Schedule header and the countdown. Use one metadata separator across the portal; Mas chooses between "•" from V5 and the SEPARATOR constant "·". Add one zone note on each page that shows times, for example "Semua jam WIB". Keep two day patterns: "Jum, 6 Nov" for rows and "Jumat, 6 November" for headings.
- Left: 1) Mas picks one metadata separator ("•" or "·"); see the decision below. 2) The countdown block on the public event page still shows the long range from formatEventDate (siapkanHitungMundur in src/components/landing/modern/landing-blocks.tsx); it is a block every layout uses, so it waits for the same decision rather than changing other events now. Done in this PR: 3) the Travel subtitle carries the zone ("Hotel, kamar, bus, dan kereta kamu. Semua jam WIB."), so check-in, bus and train times have a zone note like Schedule.
- Decision on record or question for Mas: Open for Mas: pick one metadata separator, "•" or "·".
- Code: `src/lib/event-datetime.ts` (formatEventDate, formatEventDateRingkas); `src/components/landing/modern/landing-blocks.tsx` (siapkanHitungMundur); `src/components/member/dashboard-gathering.tsx` (DashboardGathering: dataLapisanQr, Travel tab); `src/lib/typography.ts` (SEPARATOR, gabungMeta); `src/lib/member/portal-i18n.ts` (schedule.timeNote, travel.note)

### U-25 Fact and bottom bar labels are 10 px, sizes are set in px, and card titles are uppercased by CSS

- Status: Needs a decision or a mockup from Mas
- Priority: low. Area: All portal tabs: bottom bar (phone and tablet), Home pass, Travel and Profile cards (phone, tablet, desktop). Scope: platform.
- Finding: The labels that tell a room from a bus, or a carriage from a seat, are the smallest text on the card: 10 px, below the 11 px label-small in DESIGN.md, and set in px, so they do not grow when a participant raises the browser text size. Travel and Profile card titles are written in sentence case in the i18n file and then uppercased by CSS at 11 px. Contrast passes and the sizes follow the V5 design, so this is a choice for Mas rather than a defect.
- Compared with: Material 3 navigation bar labels are 12 sp; iOS tab bar labels are 10 pt.
- Recommendation: Choose between staying with V5 and labels of at least 12 px, set in rem, with sentence-case card titles. Short uppercase labels are not banned (PR #30 used 13 px uppercase section labels). On desktop the eyebrow above the H1 repeats the event name already in the logo; if it is removed or turned into a fact, treat every tab the same way, Home included, so header heights stay equal (CLAUDE.md rejected list: inconsistent header heights between portal tabs).
- Left: Mas chooses between the V5 sizes (10 px labels, 11 px uppercase card titles) and labels of at least 12 px in rem with sentence-case card titles, bottom bar labels included; no code change until then. The eyebrow condition holds for what has changed so far: SapaanHorizon hides the eyebrow on every tab, Home included, on short laptop screens (720 px tall or less). On tablets and taller desktop screens it still shows, and on every tab except Home (whose eyebrow is "Perjalananmu dimulai di sini") it is the event name.
- Decision on record or question for Mas: Open for Mas: keep the V5 sizes or follow the DESIGN.md type scale; the bottom bar label size waits on the same choice.
- Code: `src/components/member/portal-horizon.tsx` (NavBawahHorizon, PassHorizon, TiketKeretaHorizon, KartuInfoHorizon, JudulKartuProfil, SapaanHorizon); `src/lib/member/portal-i18n.ts`; `DESIGN.md`
- Related: U-11, U-36

### U-26 Announcements and the Schedule timeline still use the old Gathering card styles, so neighbouring tabs look slightly different

- Status: Partly done (#199)
- Priority: low. Area: Announcements, Schedule, Home checkpoint card (phone, tablet, desktop). Scope: platform.
- Finding: For participants the difference is subtle: corner radii of 16, 20 or 24 px, thin shadows and three similar bluish greys side by side. The cost is mainly upkeep, because every Horizon style change has to be written in several places.
- Recommendation: Build one set of primitives for the card, linked row, fact label and card header, and use it on every Horizon tab. Set one radius scale and record it in DESIGN.md, use one grey for supporting text, and remove the shadow from the checkpoint card, which already sits on navy.
- Left: Done in #199: the Home announcement card is a Horizon card (KartuPengumumanHorizon); Profile already used Horizon styles after #198. Left: Announcements tab cards still use the old KARTU class (20 px radius with a shadow); Horizon Schedule rows are still 16 px with a shadow; the navy checkpoint card keeps its 0 8px 24px shadow; there are no shared card, row or label primitives, so each Horizon card repeats its own classes; Horizon writes its radii as fixed 16, 20 and 24 px values instead of the DESIGN.md shape classes (24 px is not on that scale), and DESIGN.md records no Horizon rule; several similar support greys remain (for example #526078 and #4D5D77 in portal-horizon.tsx, #5F6B7F in dashboard-gathering.tsx and #C6D2E8 on the QR screen).
- Code: `src/components/member/dashboard-gathering.tsx` (KARTU and MUTED classes; Horizon Schedule rows in DashboardGathering); `src/components/member/portal-horizon.tsx` (KartuPengumumanHorizon; grey constants REDUP and LABEL); `src/components/member/kartu-checkpoint-horizon.tsx` (KartuCheckpointHorizon); `src/components/member/qr-horizon.tsx` (QrHorizon); `DESIGN.md`
- Related: U-03, U-27, U-36

### U-27 Horizon blue is hard-coded, so a Horizon event with another brand gets KSO's blue accent

- Status: Not started
- Priority: low. Area: All portal tabs, the participant error page and the Horizon event page (phone, tablet, desktop). Scope: platform.
- Finding: Nothing is visibly wrong for KSO, but any event can choose the Gathering Horizon preset, and only navy, gold and the highlight colour follow its Theme. An event with a green or maroon brand would get royal blue links and labels next to its own brand colours.
- Recommendation: Derive the link and label blue, and the pale blue, from the Theme brand colour in one module, with no new setting, so that KSO's brand gives exactly the V5 values and KSO does not change. If the selected day in the Schedule list needs another marker, use a filled plane, not a coloured left border (CLAUDE.md rejected list).
- Left: Derive the Horizon link and label blue (#274FC0) and the pale blue (#EDF1FB) from the Theme brand colour in one module, giving exactly the V5 values for KSO. #199 added more fixed uses that this must cover: the Schedule bus trip link, the Home "Simpan QR ke galeri" row and the participant error page. #201 and #202 do not change this (#202 kept the fixed blue on the Schedule bus trip link).
- Decision on record or question for Mas: On record: limiting the blue to clickable elements only would change the V5 palette on KSO while it is under review, so the recommendation leaves it out; that change would be Mas's call.
- Code: `src/components/member/portal-horizon.tsx` (BIRU); `src/components/landing/modern/horizon.tsx` (BIRU, PUCAT, gayaHorizon, UndanganHorizon); `src/components/member/kartu-checkpoint-horizon.tsx` (KartuCheckpointHorizon); `src/components/member/dashboard-gathering.tsx` (gayaPortal; Schedule bus trip link); `src/components/member/simpan-qr-galeri.tsx` (SimpanQrGaleri); `src/app/peserta/error.tsx`
- Related: U-26, U-29

### U-28 The attendance QR screen did not name the event, although the saved QR image does

- Status: Done (#199)
- Priority: low. Area: QR screen ("QR kehadiran"), including its offline copy (phone, tablet, desktop). Scope: platform.
- Finding: The QR screen showed no event name, while the image participants save from it shows the event name and schedule. The risk was small, because the screen opens only from the event's own portal and the desk scanner rejects other events' codes; the gain is consistency with the saved image and clarity for desk staff.
- Compared with: Luma and Eventbrite put the event name and date on the ticket; see also E-10.
- Recommendation: Show the event name and the same schedule line as the saved image in the navy area, beside or just under the "QR kehadiran" title. If a logo is used, place it in the navy area (KSO's logo is gold). Keep the white card and the QR size unchanged.
- Decision on record or question for Mas: On record: the navy screen with a 340 px white card comes from the V5 design (frame eY05h). The approved mockup put the event name and date under the title, so the shipped line shows the date range without the time that the saved image carries, and no logo is used.
- Code: `src/components/member/qr-horizon.tsx` (QrHorizon, baris prop); `src/components/member/lapisan-qr.tsx` (PenyediaQr); `src/components/member/dashboard-gathering.tsx` (QR data: event name with formatEventDateRingkas); `src/lib/member/halaman-qr-luring.ts` (halamanQrLuring, offline copy); `src/components/registration-code-card.tsx` (RegistrationCodeCard, saved image)
- Related: E-10

### U-29 Profile is the only tab whose active state is not a gold underline, and the active day in the desktop Schedule list is faint

- Status: Done (this PR)
- Priority: low. Area: Top bar Profile initials (desktop and tablet) and the desktop Schedule day list. Scope: platform.
- Finding: In the top bar, the active Profile tab is marked only by a faint circle behind the initials (1.32:1 against navy), unlike the gold underline on the other four tabs; the page stays clear thanks to the "Profil" H1. The active day in the desktop Schedule day list is a white plane at 1.06:1 against the cream background. Phones are not affected.
- Compared with: Reference from DESIGN.md rather than another product: a selection is shown by colour, a check mark and shape.
- Recommendation: Give the active initials a 2 px gold ring in the same colour as the tab underline. Optional for the active day in the desktop Schedule list: a 1-2 px border with at least 3:1 contrast against cream. Do not use a coloured left border, and do not make the text bolder again (the weight was lowered on purpose in commit 5b18dff).
- Left: Done in this PR: the active Profile initials get a 2 px gold ring (inset, the tab underline colour), and the active day in the desktop Schedule list gets a 1 px #6F7C94 outline (3.9:1 against the cream page) with the same weight as before.
- Code: `src/components/member/portal-horizon.tsx` (KepalaHorizon: Profile initials link and tab underline; HariJadwalHorizon: active day)
- Related: U-16, U-27

### U-30 On the phone event page, the way into the participant area always goes through the menu

- Status: Needs a decision or a mockup from Mas
- Priority: low. Area: Public event page: phone top bar and closing band (phone only). Scope: platform.
- Finding: Phones are participants' main device and the event page is the door from the invitation, yet the phone bar holds only the logo and Menu. Without opening the menu, the first sign-in prompt is about 5,300 px down the page, and the "Sudah terdaftar? Masuk ke portal peserta" link in the closing band is hidden below 768 px. The "Dashboard saya" pill is hidden below 640 px and "Masuk" and "Daftar sekarang" below 768 px; tablet and desktop are not affected.
- Compared with: Luma shows the guest's ticket on the event page as soon as they are signed in.
- Recommendation: Proposal for Mas to decide: one 48 px control in the phone bar, "Masuk" when signed out or the initials circle when signed in. Registration stays in the menu. Test at 360 px wide and on an event with the ID/EN language choice.
- Left: Mas decides whether the event page phone bar gets one 48 px "Masuk" or initials control. If yes, it needs a mockup on a real render first (none exists yet; the mockup round did not draw U-30), then tests at 360 px wide and on an event with the ID/EN choice.
- Decision on record or question for Mas: On record: the phone bar with only the logo and Menu is the V5 design (frame mIqta), so changing it is Mas's decision.
- Code: `src/components/landing/modern/landing-nav-modern.tsx` (LandingNavModern); `src/components/landing/modern/horizon.tsx` (PenutupHorizon)
- Related: U-21

### U-31 The phone browser bar is still the old lavender, not the event's navy

- Status: Done (this PR)
- Priority: low. Area: Browser address bar on phones: every page, most visible on the event page, participant area and QR screen. Scope: platform.
- Finding: Chrome on Android colours the address bar with theme-color, so above the navy portal bar participants see a pale bar in a colour that has been dropped from the design system. The root layout sets #f9f5ff (light) and #0a082f (dark) for every page, while the current surface colours are #f6f6f6 and #0e0e0e.
- Compared with: Airbnb and Eventbrite set theme-color to match their page header; Luma, Whova, Swapcard and Eventnook do not set it.
- Recommendation: On guest pages (event page, participant area, QR screen), set theme-color from the event's Theme navy through a per-page viewport. Staff pages use the current surface colour. No new setting is needed, but KSO's browser bar changes too, so the change follows Mas's merge schedule.
- Left: Done in this PR: generateViewport on the event page routes (/e/<slug>, /en, /id) and the participant area (which also serves the QR screen) sets theme-color to the Theme navy for Gathering Horizon events (warnaBilahPeramban in src/lib/landing-tokens.ts). Other events and staff pages use the root layout values, now the current surface colours #f6f6f6 and #0e0e0e. Other guest layouts keep their own bars and were left on the root values.
- Code: `src/app/layout.tsx` (viewport.themeColor); `src/app/m3-theme.css` (--md-sys-color-surface); `src/app/e/[slug]/page.tsx`; `src/app/e/[slug]/en/page.tsx`; `src/app/e/[slug]/id/page.tsx`; `src/app/peserta/page.tsx`

### U-32 Participant email subjects use an em dash, and announcement emails are always in Indonesian

- Status: Not started
- Priority: low. Area: Participant emails: account and sign-in emails, announcement emails. Scope: platform.
- Finding: Participant email subjects join their parts with an em dash, and announcement emails are always written in Indonesian, even for events whose main language is English. The impact is style in the subject line and language on English-first events; KSO is not affected. A similar pattern is already recorded for other emails (#144 L6, #59).
- Recommendation: Use a middle dot in subjects, for example "Kode masuk area peserta · {acara}". Split the code-page sentence into two sentences. Send announcement emails in the event's main language, with an English version.
- Left: Use a middle dot in the participant email subjects (Indonesian and English sets) and in the announcement subject; split the pending-approval sentence on the code page into two sentences; send announcement emails in the event's main language with an English version. emailPengumuman takes no language input today and the send route passes none.
- Code: `src/lib/email/member-links.ts` (ISI, ISI_EN); `src/lib/email/pengumuman.ts` (emailPengumuman); `src/app/api/admin/pengumuman/email/route.ts`; `src/lib/member/peserta-i18n.ts` (kode.pendingBody); `src/app/kode/[token]/page.tsx` (the code page that shows kode.pendingBody)
- Related: U-21, U-23

### U-33 Small label fixes: "Bus utama", "Plat nomor", map link labels, the bell close button and a split "check-in"

- Status: Done (#199, this PR)
- Priority: low. Area: Travel (bus and hotel cards), Profile ticket card, event page hotel card and the announcement bell in the event page top bar (phone, tablet, desktop). Scope: platform.
- Finding: Each is small, but "Bus utama" makes people ask whether there is a second bus, and a screen-reader label that names a panel that is not there misleads. The set covers the bus label, "Plat nomor" (KBBI spells it "Pelat"), the hotel map link labels, the phone bell close button label, and "check-in" breaking at its hyphen on the phone Profile ticket card.
- Recommendation: (1) Write "Bus" when no trip uses another bus, and "Bus utama" only when one does. (2) Use "Pelat nomor", as in KBBI, the official Indonesian dictionary. (3) Use tautanPeta() for both hotel links so the label follows the map type. (4) Label the phone bell panel close button "Tutup pengumuman". (5) On the phone Profile ticket card, "check-in" breaks into "check-" and "in."; use a non-breaking hyphen (U+2011) or nowrap.
- Left: Done in this PR: (3) both hotel links use labelTautanPeta() (moved to src/lib/landing-i18n.ts): "Buka di Google Maps" for Google links, "Buka peta" for others, on the event page hotel card and the portal Travel hotel card; (4) the phone bell close button is labelled "Tutup pengumuman" ("Close announcements"). Still noted: the Modern preset bus tile writes "Plat", outside the Horizon portal.
- Code: `src/lib/member/portal-i18n.ts` (mainBus, onlyBus, plate, openMap, ticketHint); `src/components/member/dashboard-gathering.tsx` (bus label choice; hotel card map link); `src/components/landing/event-landing-modern.tsx` (tautanPeta, InfoHotel); `src/components/member/lonceng-pengumuman.tsx` (LoncengPengumuman close button); `src/lib/landing-i18n.ts` (closeMenu, openMap, openGoogleMaps); `src/components/member/kartu-logistik.tsx` (DetailBus)

### U-34 The KSO event page has two headings in a row that both start "Bukan sekadar"

- Status: KSO content in the CMS (Mas)
- Priority: low. Area: Public event page: Opening line and About heading (phone, tablet, desktop). Scope: KSO content.
- Finding: "Bukan sekadar pergi." and "Bukan sekadar kumpul, ini waktunya kita recharge bareng." are easy to recognise as template text, and "recharge" mixes languages. Both come from Mas's mockup and can already be edited.
- Recommendation: For KSO, fill the Opening line and the About heading with the organisers' own words. Replacing the platform default texts is Mas's call, and a new default opening line would change the KSO page at once while its field is empty.
- Left: Mas fills KSO's Opening line and About heading (Event page > About the event > "Opening line" and "Heading") with the organisers' own words; changing the platform default texts stays his call. The Opening line falls back to the platform text whenever its field is empty; the About heading default is copied into the event's own fields when the Gathering preset is applied, so it is edited like any other text.
- Decision on record or question for Mas: On record: both texts come from the V5 design and the green mockup in #107. Open for Mas: whether to change the platform defaults.
- Code: `src/lib/landing-i18n.ts` (LANDING_UI: horizon.teaser, aboutHeadingDefault); `src/components/landing/event-landing-modern.tsx` (EventLandingModern: Opening line fallback); `src/app/admin/landing/theme-presets.tsx` (TENTANG_BAWAAN, pakaiPreset); `src/lib/landing-theme-presets.ts` (isiGathering)

### U-35 The event name is spelt two ways: "Limits" in the logo and "Limit" in the CMS

- Status: KSO content in the CMS (Mas)
- Priority: low. Area: Event page hero and logo; the event name in the portal tab eyebrows, footer and browser tab title, in emails and on the QR image. Scope: KSO content.
- Finding: The logo and the hero label say "Limits", while the event name in the CMS says "Limit"; that name is the eyebrow on Schedule, Travel, Announcements and Profile and appears in the footer and the browser tab title. A brand name one letter off under its own logo reads as a typo in front of the client, and the event name appears in every email and QR image.
- Recommendation: Mas and the client confirm the official spelling. If it is "Limits", change the event name; if it is "Limit", fix the hero label and ask for a matching logo. Do not change the slug without a redirect, because the link has already been shared.
- Left: Mas confirms the official spelling with the client, then fixes it in the CMS without changing the slug. The name participants see is Event page > Hero > Content > "Event name on the public page", or the event name in Edit details (Dashboard header or the Events list menu) when that field is empty; the hero label is Event page > Hero > Hero text > "Label above the title".
- Decision on record or question for Mas: Open for Mas: the official spelling has to come from the client.
- Code: `src/lib/domain.ts` (publicEventName); `src/app/admin/landing/page.tsx` ("Event name on the public page", "Label above the title"); `src/components/admin/event-details-dialog.tsx` (EventDetailsDialog)

### U-36 DESIGN.md does not cover the Horizon portal and contradicts the shipped code

- Status: Not started
- Priority: low. Area: DESIGN.md (project documentation). Scope: platform.
- Finding: Participants are not affected directly. The risk is the next PR that reads DESIGN.md first: its participant area section still describes the old portal, Horizon is never mentioned, and several lines contradict the code.
- Recommendation: One documentation PR: (1) fix the stale lines so they match the code; (2) add a short "Gathering Horizon" section recording what ships; (3) list the decisions still open for Mas, without writing them as rules; (4) align the test points with CLAUDE.md.
- Left: All four steps. Stale lines found: the Area peserta section describes the old portal (for example, it says there is no activation email, while the platform now sends a confirmation email, password emails and email sign-in codes; it also says the schedule is called "Susunan acara", while the Horizon portal says "Jadwal", a choice still open for Mas in U-22); the event page font lines list six heading fonts with Inter for body text, while the code offers 13 heading fonts and a separate body font, and the Horizon preset uses Plus Jakarta Sans for both; the focus ring is written as 3 px while globals.css draws a 2 px outline; the event page section says there is no scroll animation, while Horizon uses scroll reveals and a scroll-linked line; the responsive test points (375, 768, 1024, 1440, 1920×1080) differ from CLAUDE.md (1280×588 and 390 wide, also 768-1279). DESIGN.md does not mention Horizon at all.
- Code: `DESIGN.md`; `CLAUDE.md`; `src/app/globals.css` (:focus-visible outline); `src/components/landing/modern/horizon-gerak.tsx` (Muncul, JalurHorizon); `src/lib/domain.ts` (LANDING_HEADING_FONTS, LANDING_BODY_FONTS); `src/lib/email/member-links.ts` (MemberLinkKind)
- Related: U-01, U-22, U-25, U-26

## Eventnook lessons (E-xx)

### E-01 Schedule that follows the participant's batch

- Status: Partly done (#199, #201)
- Priority: high. Area: Schedule, Home. Scope: platform.
- Finding: On the two-batch days (Friday 6 and Sunday 8 Nov) every participant saw every section, and Home took the first section with that date, so a Batch 2 participant was shown Batch 1's meeting and train times with a countdown. The portal never said which batch a participant was in.
- Eventnook: The NookPass agenda can be filtered by track (chips such as All tracks, Main stage, Workshops) and by the sessions a participant saved; filtering by batch is an adaptation of that for KSO.
- Recommendation: On days with two sections (Friday and Sunday), open the participant's own batch first, marked "Batch kamu", put the other batch behind "Lihat batch lain", and apply the same rule to the next-agenda card on Home. The audit suggested deriving the batch from the dates of the train tickets already on file.
- Left: Shipped: #199 labels every batch on Home (one row per batch in the "Berlangsung" and "Berikutnya" cards) and in Schedule, which has a batch switch but still opens on the day's first section. #201 adds an "Ask on the registration form" switch per question (Registration > Edit form); off makes the question a staff-only Participant list column, so KSO can keep each participant's batch in a staff-only Batch column. Left: opening the participant's own batch first in Schedule and Home ("Batch kamu", the other batch behind "Lihat batch lain"). Plan: an "Applies to" setting per Agenda section that reads the Batch column; it needs its own mockup, then a small SQL file Mas runs. Nothing in the portal reads the Batch column yet. For KSO, Mas adds the column from Participant list > Columns > "Add a column in Registration" before the participants are imported (the import template includes staff-only columns). #199 did not use the audit's train-ticket route: the only ticket checked, on a test account, matched neither batch's rundown train time, and U-04 asks Mas to check a few real tickets per batch against the rundown first.
- Decision on record or question for Mas: On record: DESIGN.md and the comment in src/app/peserta/page.tsx call the portal schedule "Susunan acara", not "Jadwal Anda", because the rundown applies to every participant and there is no personal schedule data. Opening a participant's own batch first changes that decision, so it needs Mas's OK together with the mockup (U-01 step 2).
- Code: `src/lib/member/hari-agenda.ts` (kelompokkanHari, labelPembeda, ringkasanBeranda); `src/components/member/portal-horizon.tsx` (SegmenBagianHorizon, KartuBerikutnyaHorizon); `src/components/member/dashboard-gathering.tsx` (DashboardGathering: Schedule batch switch, Home cards); `src/app/admin/rundown/page.tsx` (Agenda editor: section Tab label and Date, where a per-section "Applies to" would go); `src/lib/kolom-staf.ts` (ditanyakan, asalJawaban); `src/components/admin/participant-list.tsx` (Columns menu: Add a column in Registration)
- Related: U-01, U-04, U-05, E-06, E-10

### E-02 WhatsApp for the sign-in link, reminders and last-minute changes

- Status: Not started
- Priority: high. Area: All tabs (admin: Messages). Scope: platform.
- Finding: The WhatsApp channel in Messages refused every send; only email worked. The sign-in link, the reminder before the train and news of bus or meeting-point changes could only go by email, while U-07 notes that in Indonesia the help channel participants expect is usually WhatsApp.
- Eventnook: Eventnook sells a per-event WhatsApp module for confirmations, QR tickets and event-day reminders; its docs say templates need Meta approval (1 to 3 working days), are limited to 1,024 characters, and need phone numbers with a country code.
- Recommendation: Connect the WhatsApp channel in Messages for three sends: the sign-in link, a reminder the day before the train, and news of bus or meeting-point changes. Submit the templates well before the first batch leaves.
- Left: Everything. The Messages send route still answers MESSAGE_WHATSAPP_NOT_READY for any channel other than email, and the composer keeps the WhatsApp option disabled ("once a WhatsApp Business account is connected"). The channel first needs a connected WhatsApp Business account and Meta-approved templates for the three sends.
- Decision on record or question for Mas: Open question for Mas: whether and when to connect a WhatsApp Business account for KSO. Meta takes 1 to 3 working days to approve templates, so the account and the three templates have to be ready well before the first batch leaves.
- Code: `src/app/api/admin/pesan/[id]/kirim/route.ts` (send route; MESSAGE_WHATSAPP_NOT_READY for non-email channels); `src/app/admin/pengumuman/kiriman/[id]/penyusun.tsx` (Channel row, WhatsApp option disabled)
- Related: U-07, E-05, E-09

### E-03 Emergency and help card, always in the same place

- Status: Done (#199, #209)
- Priority: medium. Area: Profile (Menu on phones), Travel. Scope: platform.
- Finding: The only contacts in the portal were the crew of each bus, and the organiser help link did not show because KSO's organiser phone in Event settings was empty (the portal read only the phone). A participant who is ill, lost or misses the bus had no single place to look.
- Eventnook: For corporate meetings, Eventnook's app content includes an emergency contacts page (coordinator, duty phone, hotel reception, local emergency numbers) and travel requirements.
- Recommendation: Add a "Darurat dan bantuan" card in Profile (Menu on phones) with the 24-hour organiser number, the medical team, hotel reception, the nearest clinic with a map, and what to do after missing the bus. Link to it from Travel.
- Left: KSO content (Mas). In Participant area > Emergency and help, add one contact per row (24-hour organiser, medical team, hotel reception, nearest hospital with a Maps link) and a note on what to do after missing the bus; the preview shows the Menu card while you type. Mobile numbers get Call and WhatsApp, office numbers get Call, a map link gets Map. With an English page on, each text has an English field (empty shows the Indonesian text). An event that already chose a Columns block keeps it until "Copy into contacts". Fill in the organiser phone in Event settings (the "Kontak panitia" row): the Travel help card that links to the emergency card only shows when an organiser phone or email is set. Parked Lows (docs/STATUS.md): rows have no icons, and the card is not in the saved offline page.
- Code: `src/components/member/portal-horizon.tsx` (KartuDaruratHorizon); `src/components/member/dashboard-gathering.tsx` (DashboardGathering: help, help_block fallback, Travel help card link); `src/app/admin/area-peserta/kontak-darurat.tsx` (KontakDaruratForm); `src/lib/member/kontak-darurat.ts` (barisKontakDarurat, nomorTelepon, kontakDariBlok, bantuanBahasa); `src/app/peserta/pratinjau/` (preview opens Menu)
- Related: U-07, U-08

### E-04 Add the portal to the Home Screen

- Status: Not started
- Priority: medium. Area: All tabs. Scope: platform.
- Finding: The portal used the staff manifest (name Tally, start_url /login, no icons). A participant who adds the portal to the Home Screen gets an app called Tally with no icon that opens the staff sign-in page instead of their event.
- Eventnook: Eventnook asks participants to add the NookPass web app to the Home Screen for one-tap access, with iPhone steps on the event home; its manifest is global, so the name and icon are NookPass for every event.
- Recommendation: Serve a portal manifest per event (event name, 192 and 512 px icons, start_url to that event's portal) and add a short hint on Home.
- Left: Everything: a per-event portal manifest (event name, 192 and 512 px icons, start_url to that event's portal) and a short Add to Home Screen hint on Home. public/manifest.webmanifest is still the staff manifest, linked from the root layout for every page, portal included.
- Code: `public/manifest.webmanifest` (staff manifest); `src/app/layout.tsx` (metadata.manifest)
- Related: E-05

### E-05 Lock-screen notifications for important announcements

- Status: Not started
- Priority: medium. Area: Announcements. Scope: platform.
- Finding: Announcements had a feed, pins and unread dots, but there was no service worker or push, so a change of time or place only reached participants who opened the portal or read their email.
- Eventnook: NookPass has opt-in web push per device, a per-announcement switch to send a notification (off by default), a count of devices that opted in, and a tap that opens the full announcement.
- Recommendation: After WhatsApp, add push for time and place changes only, with opt-in in Profile and an Add to Home Screen hint for iPhone.
- Left: Everything: web push for time and place changes only, with opt-in in Profile and an iPhone Home Screen hint. The portal service worker added in #199 only serves the saved QR page when the network fails; it has no push or notificationclick handler, and there is no push opt-in anywhere in src. Do it after WhatsApp (E-02) and the Home Screen manifest (E-04): on iPhone, web push only works once the portal is on the Home Screen.
- Code: `src/app/peserta-sw.js/route.ts` (portal service worker, offline QR only); `src/components/member/lapisan-qr.tsx` (registers the worker)
- Related: E-02, E-04

### E-06 What is happening now, above what is next

- Status: Partly done (#199)
- Priority: medium. Area: Home. Scope: platform.
- Finding: The running item ("Berlangsung") was only marked in Schedule; Home showed only the next item, so a participant had to open Schedule to see what is on now and until when.
- Eventnook: The NookPass Now screen pairs a Live now bar with an Up next card, so participants know what is happening and what comes after (seen in the vendor demo).
- Recommendation: On Home, show the running item (title, place, until when) above the next agenda item. Do it after E-01 so the item shown belongs to the participant's batch.
- Left: Shipped in #199: a "Berlangsung" card above "Berikutnya" on Home with the title, until when ("sampai 07.45", from the row's end time or else the next row's start) and the row subtitle; on phones it follows Announcements in the default Home order. Left: on two-batch days it lists every batch, each labelled; once the E-01 batch link exists, show only the participant's batch. Agenda rows have no location field, so a place only shows when it is written in the row subtitle (see E-12).
- Decision on record or question for Mas: Waits on the "your batch" decision and mockup (see E-01) before Home shows only the participant's batch.
- Code: `src/lib/member/hari-agenda.ts` (ringkasanBeranda, statusHari); `src/components/member/portal-horizon.tsx` (KartuBerlangsungHorizon, KartuBerikutnyaHorizon); `src/components/member/dashboard-gathering.tsx` (DashboardGathering, Horizon Home)
- Related: E-01, U-05, E-12

### E-07 Save train tickets to the calendar

- Status: Done (#199)
- Priority: medium. Area: Travel. Scope: platform.
- Finding: The calendar file covered only the event as a whole and was not offered in the Horizon portal, so participants could not put their own train legs into their phone calendar, where reminders ring even without signal.
- Eventnook: Eventnook puts Add to calendar (Outlook, Apple, Google, Yahoo) on the thank-you page and the event microsite.
- Recommendation: Add a "Simpan ke kalender" button to each train leg, with stations, time, carriage, seat and booking code. Calendar reminders still ring without signal.
- Code: `src/components/member/portal-horizon.tsx` (TiketKeretaHorizon); `src/components/member/dashboard-gathering.tsx` (legDenganKalender); `src/app/api/peserta/kalender-kereta/route.ts` (GET: the signed-in participant's own ticket, private, no-store); `src/lib/kalender-ics.ts` (icsTiketKereta: alarm 2 h before departure)

### E-08 Say what checkpoint points are for

- Status: Done (#200)
- Priority: medium. Area: Home ("Panduan checkpoint" card). Scope: platform.
- Finding: The checkpoint card showed steps done and points out of a total without saying what the points were for, so the numbers gave participants no reason to act on them.
- Eventnook: The NookPass passport mockup puts "Collect 9 stamps to enter the draw" above the progress, with a "3 left" pill.
- Recommendation: If points are exchanged for something, write one line with the goal at the head of "Panduan checkpoint" and say concretely what is left. If they are not exchanged for anything, hide the point numbers.
- Left: KSO content (Mas): in Check-in > Checkpoints > Points goal, set the goal and what it is for, or turn Points off if points are not exchanged for anything (turning Points off hides every point number).
- Decision on record or question for Mas: Open question for Mas: what KSO's points are exchanged for, if anything. If the answer is a lucky draw entry, use the draw condition "Checkpoint points goal" (reached), added in the lucky draw checkpoint conditions PR; it reads the same Points goal (see E-13).
- Code: `src/lib/checkpoint/tujuan.ts` (tujuanPeserta, kalimatTujuan); `src/components/member/baris-tujuan-poin.tsx` (BarisTujuanPoin); `src/components/member/kartu-checkpoint-horizon.tsx`; `src/components/member/kartu-checkpoint.tsx`; `src/app/admin/attendance/checkpoints.tsx` (Points goal pane); `src/lib/checkpoint/server.ts` (loadSetelanCheckpoint); `supabase/migrations/202610170001_checkpoint_tujuan_poin.sql` (run by Mas on 18 Oct)
- Related: E-13

### E-09 One name for the participant QR

- Status: Partly done (#199)
- Priority: low. Area: All tabs, confirmation email, public event page. Scope: platform.
- Finding: The same QR was called "QR kehadiran", "Tiket masuk" and "kode". On a trip where "tiket" also means the train ticket, an organiser asking for the ticket at the station can send a participant to the wrong screen (see U-20).
- Eventnook: An example to avoid: Eventnook's docs call the same ticket "View eTicket Pass", "e-Ticket" and "View e-Ticket" in three places.
- Recommendation: Use one name, for example "QR kehadiran", on Home, Profile, the QR screen, checkpoints, email and WhatsApp. Keep "tiket" for train tickets.
- Left: The confirmation email default still says "Tiket Anda: {acara}" and "QR di bawah adalah tiket masuk Anda" (it applies only while an event has not saved its own template, so a saved KSO copy is edited in Messages > Automated emails). It is rewritten with U-23, since it also says "Anda". WhatsApp does not exist yet (E-02). Done: #199 inside the Horizon portal, and this PR on the Profile and Home subtitles, the public event page, the pass preview, the saved QR image, the classic Gathering portal and the non-Horizon portal tile (see U-20).
- Decision on record or question for Mas: In use since #199 (approved with its mockups): "QR kehadiran" is the one name for the QR, "Tampilkan QR" the action label and "panitia" the person who scans (U-20). Open choice from U-20: the saved-image string is shared with the registration and code pages, so change them together or limit the change to Horizon.
- Code: `src/lib/member/portal-i18n.ts` (qrTitle, profile.note, subtitleDates); `src/components/member/kartu-checkpoint-horizon.tsx`; `src/lib/email/konfirmasi/templat.ts` (defaultTemplat, DEFAULT_PEMBUKA); `src/lib/email/konfirmasi/bahasa.ts`; `src/lib/landing-i18n.ts` (viewMyTicket, portalTicket, passInfo); `src/components/landing/event-landing-modern.tsx` (portal section: Horizon pass preview and non-Horizon tiles); `src/lib/daftar-i18n.ts` (showAtDesk); `src/components/registration-code-card.tsx` (saved QR image caption)
- Related: U-20, E-02

### E-10 Batch and bus under the name on the QR screen

- Status: Partly done (#199)
- Priority: low. Area: QR screen. Scope: platform.
- Finding: Under the name, the QR screen showed only job title and organisation, so crew boarding a bus or staffing a checkpoint without a scanner could not tell at a glance whether a participant was in the right batch and bus.
- Eventnook: The NookPass badge shows job title and company under the name, then the pass type ("Full Pass"), and its scanner shows "Full Pass · eligible".
- Recommendation: Add "Batch 2 · Bus 3" to the QR screen so crew can match participants at a glance when boarding a bus or at a checkpoint without a scanner. Keep the job title line, as the NookPass badge does.
- Left: Shipped in #199: the bus shows as a pill under the name ("Bus 3") on the QR screen, the QR layer and the saved offline QR page. Left: the batch. The portal has no batch value, and a staff-only Batch column (possible since #201) is kept off every participant page by design; once Mas agrees, the same three places would show "Batch 2 · Bus 3".
- Decision on record or question for Mas: Part of the "your batch" decision (see E-01): may participants see their own batch? #201 keeps staff-only columns off every participant page by design, so showing the batch on the QR screen needs Mas's OK.
- Code: `src/components/member/qr-horizon.tsx` (QrHorizon, pil); `src/components/member/dashboard-gathering.tsx` (namaBusPeserta, labelBus); `src/lib/member/halaman-qr-luring.ts` (halamanQrLuring); `src/lib/kolom-staf.ts` (asalJawaban)
- Related: E-01

### E-11 Allow a photo in announcements

- Status: Not started
- Priority: low. Area: Announcements. Scope: platform.
- Finding: Announcements had only a title, body, link and pin. A meeting point or the place where buses park is easier to find from a photo than from a description.
- Eventnook: NookPass announcements can include formatting, links and one image (its mockup shows "Lunch is served on Level 2 · with photo").
- Recommendation: Allow one photo per announcement, for example of the meeting point or the bus parking area.
- Left: Everything: an image field on event_announcements (a small SQL file Mas runs), upload in Messages > Announcements, and display on the portal announcement card and Announcements tab.
- Code: `supabase/migrations/202610030002_event_announcements.sql` (event_announcements, no image column); `src/app/admin/pengumuman/lonceng/page.tsx` (Messages > Announcements); `src/app/api/admin/pengumuman/route.ts`; `src/lib/member/pengumuman.ts`; `src/components/member/portal-horizon.tsx` (KartuPengumumanHorizon)

### E-12 Maps for meeting points and Agenda locations

- Status: Partly done (#199)
- Priority: low. Area: Travel, Schedule. Scope: platform.
- Finding: Only the hotel had a Google Maps link. Bus meeting points and Agenda locations outside the hotel had none, so participants had to search for them on their own.
- Eventnook: The Eventnook microsite opens an "Event Location and Map" dialog with the address, Google Map and Apple Map buttons, and a map.
- Recommendation: Give a map link for bus meeting points and for Agenda locations outside the hotel.
- Left: Shipped in #199: "Buka peta" on each bus meeting point in Travel (the hotel's map when the meeting point is the hotel, otherwise a Google Maps search). Left: map links for Agenda locations outside the hotel. Agenda rows have no location or map field and Schedule shows the subtitle as plain text, so this needs a new optional field (a small SQL file Mas runs), a field in the Agenda editor and a link on the Schedule row. #202 does not change this; it only decides which Schedule row links to Travel.
- Decision on record or question for Mas: On record: the rundown CMS migration (202608030004) keeps the Agenda row subtitle as one free-text line on purpose and chose not to split speaker, job title and location into separate columns, so a map link would be a new optional field beside the subtitle, not a split of it.
- Code: `src/components/member/dashboard-gathering.tsx` (petaTrip); `src/components/member/portal-horizon.tsx` (PerjalananBusHorizon); `supabase/migrations/202608030004_rundown_cms.sql` (rundown_items); `src/lib/member/trip-jadwal.ts` (pencocokBarisTrip)
- Related: E-06, U-08

### E-13 Lucky draw status in the portal

- Status: Needs a decision or a mockup from Mas
- Priority: low. Area: Home, Profile. Scope: platform.
- Finding: Tally has a lucky draw module, but the participant portal did not show it, so if KSO holds a draw, participants cannot see whether they are entered, what the conditions are, or their number.
- Eventnook: Per its feature page, NookPass shows eligible participants a draw number in the app together with the prizes, and that screen can be turned off (the participant screen itself was not seen).
- Recommendation: If KSO holds a draw, show whether the participant is entered, the conditions, and their number.
- Left: If KSO runs a draw through Tally: entry status, conditions and draw number in the portal, after a mockup. The portal has no draw code, and the draw rules in Lucky draw > Prizes & rules have no condition on checkpoint points (they can count scans, not points).
- Decision on record or question for Mas: Open question for Mas, left open on 18 Oct: does KSO run a lucky draw through Tally, and is it tied to checkpoint points (E-08)?
- Code: `src/app/admin/undian/page.tsx` (Lucky draw > Prizes & rules); `src/components/admin/undian-condition-builder.tsx` (VAR_LABEL, no points variable); `src/components/member/baris-tujuan-poin.tsx` (BarisTujuanPoin, example line mentions a draw)
- Related: E-08

### E-14 Self-scan at busy checkpoints

- Status: Done
- Priority: low. Area: Home ("Panduan checkpoint" card). Scope: platform.
- Finding: Every checkpoint was scanned by staff, so a busy checkpoint needs enough staff to keep the queue short.
- Eventnook: NookPass lets participants scan a rotating code on the checkpoint screen with their own phone; a photo of the code stops working after about a minute, and each scan records how it was made.
- Recommendation: Consider it only for checkpoints with no item handover. The risks are real: camera permission, printed codes can be photographed, and a phone with problems still needs staff.
- Left: nothing (#208; migration 202610180001 was run on 18 Oct). Follow-up Lows are parked in STATUS.md. Nothing changes until an admin picks Participants or Both for a checkpoint.
- Decision on record or question for Mas: Mas approved the mockup on 18 Oct: per checkpoint, Check-in > Checkpoints > "How it gets done" is Staff (default), Participants or Both; staff show a QR from the scanner app (Show QR) or a big screen; the code changes every 30 seconds; kit-item checkpoints stay staff-scanned.
- Code: `src/app/admin/attendance/checkpoints.tsx` (Check-in > Checkpoints, where checkpoints are set up); `src/lib/checkpoint/server.ts` (checkpoint data for the portal); `src/lib/checkpoint/kode-qr.ts` (rotating code); `src/components/member/pindai-checkpoint.tsx` (participant camera); `src/app/scan/tampil-qr.tsx` and `src/app/checkpoint-qr/` (Show QR and the big screen)

### E-15 Home after the trip ends

- Status: Not started
- Priority: low. Area: Home. Scope: platform.
- Finding: Home had no view for after the event, so after the last day it gives participants nothing new to come back for (no photos, no closing message). The state after 8 November could not be seen in the audit.
- Eventnook: Eventnook promises that photos and materials stay open with the same access after the event (for example "248 photos across 6 albums"); this is a marketing claim, not a screen that was seen.
- Recommendation: After the last day, turn Home into a photo album and a closing message.
- Left: Everything: a post-event Home after the last day (photo album and closing message). It needs a mockup and a source for the photos.
- Decision on record or question for Mas: Open question for Mas: should Home change after the last day, and where would the photos come from? It needs a mockup first.
- Code: `src/components/member/dashboard-gathering.tsx` (DashboardGathering: Horizon Home; sesudahAcara only picks the last day for the classic rundown card); `src/lib/member/hari-agenda.ts` (ringkasanBeranda: returns nothing after the last day, so the "Berlangsung" and "Berikutnya" cards drop out)
