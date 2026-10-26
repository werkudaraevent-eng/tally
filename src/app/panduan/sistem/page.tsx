import Link from "next/link";
import { ArrowSquareOut, Printer } from "@phosphor-icons/react/dist/ssr";
import { getPublicPageEvent } from "@/lib/auth/request-event";

/**
 * Panduan sistem — seluruh modul, bukan hanya operator booth.
 *
 * `/panduan` yang sudah ada adalah kartu cetak untuk staf booth dan kasir:
 * sepuluh langkah, dirancang untuk diletakkan di meja dan dibaca sambil melayani
 * antrean. Halaman ini menjawab pertanyaan yang berbeda — "modul ini untuk apa,
 * dan kapan saya membukanya" — dan pembacanya panitia yang sedang menyiapkan
 * acara, bukan yang sedang melayani orang.
 *
 * Susunannya SENGAJA mengikuti urutan kerja, bukan urutan menu di sidebar.
 * Panduan yang disusun mengikuti menu memaksa pembacanya melompat-lompat: menu
 * disusun menurut jenis pekerjaan, sedangkan orang yang baru pertama menyiapkan
 * acara butuh tahu apa yang dikerjakan lebih dulu.
 *
 * Tanpa autentikasi, sama seperti /panduan: isinya tidak memuat data peserta,
 * nominal, maupun kredensial — hanya penjelasan cara pakai — dan panitia harus
 * bisa membukanya di ponselnya sendiri tanpa login.
 */

export const metadata = { title: "System guide — Tally" };

export const dynamic = "force-dynamic";

/** Satu gambar layar asli dengan data contoh. Tidak ada data peserta sungguhan: halaman ini terbuka tanpa login. */
type Gambar = { src: string; alt: string; keterangan: string; lebar: number; tinggi: number };

type Blok = {
  judul: string;
  /** Langkah bernomor, untuk tugas yang dikerjakan berurutan. */
  langkah?: string[];
  poin?: string[];
  gambar?: Gambar;
};

type Bagian = {
  id: string;
  judul: string;
  ringkas: string;
  isi: Blok[];
};

const g = (nama: string, alt: string, keterangan: string, lebar: number, tinggi: number): Gambar => ({
  src: `/panduan/sistem/${nama}`,
  alt,
  keterangan,
  lebar,
  tinggi,
});

/*
 * Disusun per TUGAS ("taruh peserta di hotel sebelum nomor kamar ada"), bukan
 * per menu, seperti pusat bantuan Eventbrite dan Whova: orang membuka panduan
 * dengan satu pertanyaan, dan judul tugas menjawabnya lebih cepat daripada
 * nama modul. Nama tombol ditulis persis seperti di layar.
 *
 * Gambar diambil dari layar admin asli dengan backend palsu (nama contoh).
 * Saat layar yang digambar berubah, ambil ulang gambarnya di PR yang sama.
 */
const BAGIAN: Bagian[] = [
  {
    id: "mulai",
    judul: "1. Before you start",
    ringkas: "What Tally contains, and who sees what.",
    isi: [
      {
        judul: "Three kinds of screen",
        poin: [
          "Staff workspace: at /e/<slug>/admin/…, sign-in required. Every module in the sidebar lives here.",
          "Participant pages: the event page, registration form, agenda, seating plan and the participant area (“Dashboard saya”), opened on participants' own phones.",
          "Event-day screens: the scanner (/scan) on staff phones, and the stage screens (welcome screen, lucky draw, live voting, leaderboard) on a projector.",
        ],
      },
      {
        judul: "One event, one workspace",
        poin: [
          "Each event has its own workspace, staff access and data. Nothing mixes between events.",
          "Switch events with the event name at the top of the sidebar. Picking another event opens the same page in that event.",
          "Ctrl K (Quick search) finds any page or setting by name, in English or Indonesian.",
        ],
      },
      {
        judul: "Roles",
        poin: [
          "Admin: sets up and runs the events they hold. Super admin: every event, plus users, access, audit trail and danger zone.",
          "Scanner staff: the /scan screen only. Booth staff and Cashier: their sales screens. Viewer: the client's read-only live list.",
          "Every role except Super admin needs access to each event, given in Users & roles.",
        ],
      },
    ],
  },
  {
    id: "persiapan",
    judul: "2. Setup, in order",
    ringkas: "Each step needs the result of the one before it.",
    isi: [
      {
        judul: "a. Event settings",
        poin: [
          "Choose the time zone FIRST (WIB, WITA or WIT). Every time in the system means that zone: agenda, check-in, orders. Changing it later makes recorded times read differently.",
          "Organiser contact, email sender name and reply-to. The organiser phone shows on the participant area's help card.",
        ],
      },
      {
        judul: "b. Users & roles",
        poin: [
          "Create an account per person and role, then give it access to this event. Staff sign in with a username and a 6-digit PIN.",
          "An admin can reset a PIN at any time. An old PIN is never shown again.",
        ],
      },
      {
        judul: "c. Participants",
        poin: [
          "Participant list: import an Excel file (template in Import), add people by hand, or sync from the external scanner system (Event settings → Integrations).",
          "Import matches people on QR code, so re-importing a file updates them instead of adding them twice. Empty cells never erase data.",
          "Columns you only need internally (Batch, Gender, Department) are staff-only questions: Registration → Edit form → turn off “Ask on the registration form”. They are then columns and filters, and conditions in Agenda and Directions.",
          "Registration and invited guests: turn registration on when people register through the form; invited guests get a personal link.",
        ],
      },
    ],
  },
  {
    id: "hotel",
    judul: "3. Hotels and rooms",
    ringkas:
      "Logistics → Assignments places people, Rooms holds the hotels and rooms. Hotels often send the rooming list late, so place people in a hotel first and add room numbers when the list arrives.",
    isi: [
      {
        judul: "Add hotels and rooms",
        langkah: [
          "Logistics → Rooms → Add hotel: name, address, map link, check-in and check-out time.",
          "Add room under each hotel: room number, type, capacity, floor. You can skip this step and let the rooming-list import create the rooms.",
          "Room rules (on the Rooms tab): pick the Gender field and turn on Same-gender rooms only, or allow mixed rooms. Until one is chosen, people can still be placed in a hotel, but not in a room.",
        ],
        gambar: g(
          "logistik-kamar.jpg",
          "Rooms tab with Hotel Melati and Hotel Kenanga, each with a To follow row and rooms 1208, 1210 and 1212",
          "Rooms: each hotel shows how many people are waiting for a room, and a To follow row lists them.",
          1100,
          689,
        ),
      },
      {
        judul: "Place people in a hotel before you have room numbers",
        langkah: [
          "Logistics → Assignments. Use the Stay filter → No hotel to see who still needs one.",
          "Tick the people, then press Assign to hotel.",
          "Choose the hotel and leave Room on Room later. Leave the dates as they are: they are the hotel's dates.",
          "Press Assign. The Stay column shows the hotel with “Room to follow”.",
        ],
        poin: [
          "Participants already see the hotel name, address and dates, with “Nomor kamar menyusul”, once Room and vehicle is on (section 6).",
          "Agenda rows and Directions blocks limited to a hotel (Who sees it → Hotel) already reach these people.",
        ],
        gambar: g(
          "logistik-hotel-dulu.jpg",
          "Assign 1 person to a hotel dialog with Hotel only, room later selected and the rooms of Hotel Melati listed",
          "Assign to hotel: Hotel only, room later sits above each hotel's rooms.",
          864,
          1080,
        ),
      },
      {
        judul: "Add room numbers when the hotel sends the rooming list",
        langkah: [
          "Logistics → Import from Excel → Hotel stays → Download template.",
          "One row per person: QR code (best) or Name, then Hotel 1, Room 1, Check-in 1, Check-out 1. These are the same columns as the participant export. Rooms that don't exist yet are created.",
          "Choose the file. The preview lists every change before anything is saved; press Save.",
        ],
        poin: [
          "For a few people, open Rooms, find the hotel's To follow row and add them to a room by hand.",
          "Removing someone from a room keeps them in the hotel with their dates.",
        ],
        gambar: g(
          "logistik-impor.jpg",
          "Import hotel stays from Excel dialog with Download template and Download current stays",
          "Import from Excel: the help text says what each column does.",
          1000,
          607,
        ),
      },
      {
        judul: "Someone changes hotel during the event",
        langkah: [
          "Tick the people who move, then Assign to hotel. Choose the first hotel and its Check-in and Check-out.",
          "Press Add another hotel, choose the second hotel and enter its dates. It starts on the day they leave the first hotel.",
          "Read the sentences under the hotels: they say which other hotels are removed and who keeps a room. Press Assign.",
          "The Stay column now shows both, for example “1208 · Hotel Melati 5–6 Nov → Hotel Kenanga (Room to follow) 6–8 Nov”.",
        ],
        poin: [
          "Click a person's Stay cell to open their Stays: Choose room or Change room, Change nights, Remove, and Add another hotel.",
          "The hotels you choose replace every other hotel these people have. People who already have a room at one of the chosen hotels keep it.",
          "Many people at once: Import from Excel → Download current stays, fill Hotel 2 with its Check-in and Check-out (and the dates of Hotel 1), and import it back. Each person in the file gets exactly the hotels in their row; people not in the file are unchanged.",
          "A dated rooming list from one hotel removes those people's stay at the other hotel. The preview warns about it.",
          "Participants see one hotel card per stay; later ones read “Pindah hotel · Jum, 6 Nov”. Agenda rows limited by hotel follow the row's date, so on the move day both hotels see them.",
        ],
        gambar: g(
          "logistik-beberapa-malam.jpg",
          "Assign to hotel dialog with Only some nights selected and Check-in 06/11/2026, Check-out 08/11/2026",
          "Only some nights keeps the person's other hotel for the other nights.",
          864,
          1080,
        ),
      },
      {
        judul: "Change one person's stays",
        poin: [
          "Assignments → click the Stay cell, or Participant list → the person → Logistics → Edit stays.",
          "Each hotel shows its room (or Room to follow) and its nights. Choose room lists free places per room; full rooms can't be picked.",
        ],
        gambar: g(
          "logistik-stays.jpg",
          "Stays dialog for Budi Santoso: Hotel Melati room 1208 Thu 5 to Fri 6 Nov, Hotel Kenanga room to follow Fri 6 to Sun 8 Nov",
          "Stays: one row per hotel, in date order.",
          768,
          603,
        ),
      },
      {
        judul: "Check who still needs something",
        poin: [
          "The line under the Logistics title counts people without a hotel and people waiting for a room.",
          "Stay filter: No hotel, Room to follow, Has a room, Moves hotel. Vehicle filter: No vehicle, Has a vehicle.",
        ],
        gambar: g(
          "logistik-penempatan.jpg",
          "Logistics Assignments tab: 11 active participants, 6 without a hotel, 3 waiting for a room, with a Stay column",
          "Assignments: the Stay column shows each person's hotels, rooms and nights.",
          1100,
          511,
        ),
      },
    ],
  },
  {
    id: "transport",
    judul: "4. Vehicles, trains and kit",
    ringkas: "The other Logistics tabs. Each one has its own Excel import with a preview.",
    isi: [
      {
        judul: "Vehicles and trips",
        poin: [
          "Vehicles → Add vehicle: name, capacity, plate and crew contact. Put the type in the name, such as Bus 1, Hiace 2 or Elf 3: participants see it as written. Choose what participants see: vehicle name only, plate, crew, or plate and crew.",
          "Add trip for each departure (meeting point, from, to, time). Link it to an Agenda row so the departure moves when the row's time changes, and the participant schedule shows the vehicle on that row.",
          "Assignments → tick → Assign to vehicle: choose their default vehicle, then Add a trip for each trip where they ride something else, or No vehicle on this trip. One dialog, like Assign to hotel. A trip that uses its own list only carries the people added to it here or under Trips.",
        ],
      },
      {
        judul: "Train tickets",
        poin: [
          "Trains → Add train ticket, or Import from Excel → Train tickets, matched by QR code: outbound or return, train, class, stations, date, times, carriage, seat, booking code.",
          "Participants see their own tickets in Perjalanan, with an Add to calendar file.",
        ],
      },
      {
        judul: "Kit items",
        poin: [
          "Kit items → Add kit item: name, optional size taken from a participant field, a note for participants.",
          "Choose the check-in point that hands it out on the Check-in page. The scanner then shows a checklist after each scan, and each item can be collected once per person.",
        ],
      },
    ],
  },
  {
    id: "dari-peserta",
    judul: "5. Logistics from the Participant list",
    ringkas: "The same Logistics dialogs, without leaving the list you are already filtering.",
    isi: [
      {
        judul: "Assign or remove many people at once",
        langkah: [
          "Filter the Participant list (for example Batch is Batch 2), then tick the people.",
          "In the bar that appears, open Logistics: Assign to hotel or room, Assign to vehicle, Remove from hotel, Remove from vehicle.",
          "The Logistics dialog opens; capacity and room rules are checked the same way as on the Logistics page.",
        ],
        gambar: g(
          "peserta-menu-logistik.jpg",
          "Participant list selection bar with the Logistics menu open: Assign to hotel or room, Assign to vehicle, Remove from hotel, Remove from vehicle",
          "Participant list → tick people → Logistics.",
          1280,
          300,
        ),
      },
      {
        judul: "One person, columns and export",
        poin: [
          "Click a person: the Logistics section lists every stay, the vehicle, both trains and the kit collected, with Edit stays and Change vehicle.",
          "Columns → Hotel, Room, Hotel check-in, Hotel check-out (numbered Hotel 1, Hotel 2 when someone moves), Vehicle, each train field, one column per kit item. They are hidden until you choose them.",
          "Export includes them as read-only “logistics: …” columns. The participant import skips those columns, so an exported file can be re-imported safely.",
          "Import asks what you are importing: Participant details, or Hotels, rooms, vehicles, train tickets (the Logistics import).",
        ],
      },
    ],
  },
  {
    id: "peserta-lihat",
    judul: "6. What participants see",
    ringkas: "Nothing from Logistics reaches participants until you turn it on.",
    isi: [
      {
        judul: "Turn it on",
        poin: [
          "Participant area → What shows → Room and vehicle (off by default). On Gathering Horizon, hotel, vehicle, trains and luggage then appear in Perjalanan; other layouts show them on the participant home.",
          "Participants see only their own hotel, room, roommates, vehicles, trains and kit, never anyone else's (roommates' names only).",
        ],
      },
      {
        judul: "Show a row or a route only to some people",
        poin: [
          "Agenda → Edit item → Who sees it: Everyone, or Some participants with up to 3 conditions (a dropdown or choice field such as Batch, or Hotel). After sign-in, other participants and badges never get the row. Before sign-in, the event page shows every row of a day whose Show before sign-in is on, so switch that day off if a row must stay private. Turn on “Show Batch answers on the event page” (named after your question) under the conditions to label those rows “Batch 1” there and give visitors a Semua · Batch 1 · Batch 2 picker above the schedule.",
          "Event page → Directions block → Who sees it works the same way for routes (for example lobby to ballroom, only for one hotel's guests).",
          "Agenda → section → Show first for only sorts: a participant's own batch section comes first, nothing is hidden.",
          "Agenda → section → Show before sign-in: switch it off for a day that only signed-in participants should see (for example a departure day). The event page and /rundown then leave that day out; the portal still shows it.",
        ],
      },
    ],
  },
  {
    id: "checkin",
    judul: "7. Check-in and scanners",
    ringkas: "Check-in sessions are the scan points: the entrance, each session, kit hand-out, the luggage desks.",
    isi: [
      {
        judul: "Set up the scan points",
        langkah: [
          "Check-in → Sessions → add a session per scan point (Registration, Luggage drop, Luggage pick-up, Gala dinner). Each one has its own scanner address, /scan?sesi=<session>.",
          "Turn on kit items for the session that hands them out, and set Luggage on the luggage desks (Drop-off or Pick-up).",
          "With more than one physical desk, add the desks so each phone picks its own; each desk can drive its own welcome screen.",
          "Walk-ins: allow them only if the desk may register people on the spot.",
          "Give each scanner phone a Scanner staff account with access to this event.",
        ],
      },
      {
        judul: "Luggage desks",
        poin: [
          "Check-in → Sessions → the session → Luggage: Off (default), Drop-off or Pick-up.",
          "Drop-off: after each scan, staff enter the number of bags and take one photo of them. The count is saved first, so a weak signal never loses it.",
          "Pick-up: after each scan, staff see the bags and photo from every drop-off desk, then press Hand over. Each drop-off is handed over once; staff can undo their own handover.",
          "Participants see their own count and photo in Perjalanan (Bagasi card), and the pick-up time once collected. Photos are private and are deleted 30 days after the event ends; the counts stay.",
          "Test both desks on a scanner phone before the rehearsal: drop off, re-scan to see the record, then pick up.",
        ],
      },
      {
        judul: "Scanner crew and rehearsals",
        poin: [
          "The scanner has its own guide in Indonesian: on /scan, ⋮ → Scanner guide. Share it with the crew before the event.",
          "After a rehearsal, reset test scans per person: Participant list → the person → Check-in → reset one point or Reset all. A copy goes to the audit trail.",
          "A session with scans can only be closed, not deleted.",
        ],
      },
    ],
  },
  {
    id: "checkpoint",
    judul: "8. Checkpoints",
    ringkas: "Steps participants tick off (collect the badge, collect train tickets, hand in luggage), shown as a card in the participant area.",
    isi: [
      {
        judul: "Set them up",
        langkah: [
          "Check-in → Checkpoints → turn on Show in participant area.",
          "Add a checkpoint: title, where, and what records it (a scan at a session, or a kit item collected).",
          "How it gets done: Staff (default), Participants (they scan a checkpoint QR from their phone) or Both.",
          "When (optional): link one or more Agenda rows. Each participant sees the date of the earliest linked row they can see, so Batch 1 and Batch 2 can get different dates.",
          "Points and a points goal are optional; a lucky draw prize can require the goal.",
        ],
        poin: [
          "Order is shown, not enforced: the desk never turns anyone away for a skipped step.",
        ],
      },
    ],
  },
  {
    id: "publik",
    judul: "9. Event page and agenda",
    ringkas: "What participants see before the event, on their own phones.",
    isi: [
      {
        judul: "Event page",
        poin: [
          "Start from a preset (Conference, Forum, Gathering, Gathering Horizon), then change texts, colours and sections. A section turned on but empty is not shown.",
          "Blocks (Modern layout) choose where they show: event page, participant area, or both.",
          "The editor preview shows the SAVED version, so press Save first.",
        ],
      },
      {
        judul: "Agenda",
        poin: [
          "Fill it in once: the event page, the /rundown screen, the participant schedule, vehicle trips and checkpoints all read it.",
          "New sections start as drafts; publish them when they are ready.",
          "Dress code (Gathering Horizon): Agenda → Dress code per day, and Participant area → Dress code page for the every-day line.",
        ],
      },
      {
        judul: "Seating plan",
        poin: ["A map of tables and seats that participants open at /denah to find where they sit. Seats come from the external scanner system or are set by hand."],
      },
    ],
  },
  {
    id: "panggung",
    judul: "10. Stage screens",
    ringkas: "Open them in a separate window before the MC starts, then send it to the projector.",
    isi: [
      {
        judul: "Lucky draw",
        poin: [
          "Prizes & rules: prizes, who may win (conditions such as checked in, checkpoint points, form answers), win-again rules and stage look.",
          "Operator panel: choose a prize, draw, then CONFIRM the winner. Without confirmation the result is not recorded. Rehearsal mode records nothing.",
          "Readiness at the top says what is still missing before a draw can run.",
        ],
      },
      {
        judul: "Live voting and welcome screen",
        poin: [
          "Live voting: questions opened and closed by staff; results move on the stage screen as votes come in.",
          "Welcome screen: a TV at the entrance greets each guest by name when they are scanned.",
        ],
      },
      {
        judul: "Leaderboard (booth events)",
        poin: [
          "Spending ranking from booth orders, with a staged reveal and exclusions. Amounts can be hidden; they are then never sent to the screen.",
        ],
      },
    ],
  },
  {
    id: "sesudah",
    judul: "11. After the event",
    ringkas: "Closing the books and keeping the record.",
    isi: [
      {
        judul: "Exports, orders and audit",
        poin: [
          "Participant list → Export: follows your filters, with check-in per session and the logistics columns.",
          "Orders and Reports (booth events): every order, revenue per booth, reconciliation against the cash.",
          "Audit trail (Super admin, Event settings): who changed what and when.",
        ],
      },
    ],
  },
  {
    id: "masalah",
    judul: "12. Common problems",
    ringkas: "",
    isi: [
      {
        judul: "A participant does not see their hotel or vehicle",
        poin: [
          "Check Participant area → Room and vehicle is on.",
          "Check the person has a stay on Logistics → Assignments (Stay filter → No hotel).",
        ],
      },
      {
        judul: "Assign to hotel shows no rooms",
        poin: [
          "Room rules are incomplete: choose the Gender field or allow mixed rooms on the Rooms tab. Hotel only, room later still works meanwhile.",
          "Rooms without enough space for everyone selected are hidden; tick “Also show rooms without enough space”, or select fewer people.",
        ],
      },
      {
        judul: "An agenda row is missing for some participants",
        poin: ["Open the row → Who sees it. “Matches N of M participants” says how many see it; a red “Nobody sees this row” means a chosen answer or field was deleted."],
      },
      {
        judul: "The time on screen differs from the time in the room",
        poin: ["Check the time zone in Event settings. The whole system uses that zone, not the zone of a staff laptop."],
      },
      {
        judul: "A participant did not get an email",
        poin: [
          "Messages → the blast → the per-recipient report says whether it was sent, and why not.",
          "Participants can always sign in from the event page; staff can resend a sign-in link from Messages.",
        ],
      },
    ],
  },
];

export default async function PanduanSistemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Slug dipakai HANYA untuk menautkan kembali ke ruang kerja acara yang sedang
  // dibuka. Isi panduannya sendiri sama untuk semua acara — ia menjelaskan cara
  // kerja sistem, bukan data acara.
  const event = await getPublicPageEvent(searchParams);
  const prefix = event ? `/e/${event.slug}` : "";

  return (
    <main lang="en" className="press min-h-dvh bg-surface px-5 pb-16 pt-8 text-on-surface sm:px-8">
      <div className="mx-auto max-w-[900px]">
        <p className="ed-label border-b border-outline-variant pb-4 text-on-surface-variant">System guide</p>
        <h1 className="mt-6 text-display-small font-bold tracking-tight">How to use Tally</h1>
        <p className="mt-4 max-w-[68ch] text-body-large leading-8 text-on-surface-variant">
          Organised by task, in working order: what to set up first, how to place people in hotels and in vehicles,
          what to use while the event runs, and what to wrap up afterwards.
          {event ? <> You opened this guide from the <span className="font-semibold text-on-surface">{event.name}</span> workspace.</> : null}
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`${prefix}/admin`}
            className="inline-flex min-h-12 items-center gap-2 border-2 border-on-surface bg-on-surface px-6 text-label-large font-semibold text-surface transition-colors duration-200 ease-standard hover:bg-transparent hover:text-on-surface"
          >
            Back to the app
          </Link>
          {/* Panduan cetak operator TIDAK digabung ke halaman ini. Ia dirancang
              untuk dicetak dan diletakkan di meja booth; menyatukannya berarti
              staf booth mencetak tujuh bagian yang tidak ia butuhkan saat sedang
              melayani antrean. */}
          <Link
            href={`${prefix}/panduan`}
            className="inline-flex min-h-12 items-center gap-2 border border-outline px-6 text-label-large font-semibold transition-colors duration-200 ease-standard hover:bg-on-surface hover:text-surface"
          >
            <Printer size={18} />
            Printed guide for booth staff &amp; cashiers
            <ArrowSquareOut size={14} className="opacity-70" />
          </Link>
        </div>

        {/* Daftar isi. Panduan sepanjang ini dibuka untuk mencari satu jawaban,
            bukan dibaca dari atas ke bawah. */}
        <nav aria-label="Contents" className="mt-10 border border-outline-variant bg-panel p-5">
          <p className="text-label-medium font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Contents</p>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {BAGIAN.map((bagian) => (
              <li key={bagian.id}>
                <a href={`#${bagian.id}`} className="text-body-medium font-semibold text-primary hover:underline">
                  {bagian.judul}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {BAGIAN.map((bagian) => (
          <section key={bagian.id} id={bagian.id} className="scroll-mt-8 border-t border-outline-variant pt-8 first-of-type:mt-12">
            <h2 className="text-headline-small font-semibold tracking-tight">{bagian.judul}</h2>
            {bagian.ringkas ? (
              <p className="mt-2 max-w-[68ch] text-body-large leading-7 text-on-surface-variant">{bagian.ringkas}</p>
            ) : null}

            <div className="mt-6 space-y-6 pb-8">
              {bagian.isi.map((blok) => (
                <div key={blok.judul} className="border border-outline-variant bg-panel p-5">
                  <h3 className="text-title-medium font-semibold">{blok.judul}</h3>
                  {blok.langkah ? (
                    <ol className="mt-3 space-y-2">
                      {blok.langkah.map((langkah, i) => (
                        <li key={langkah} className="flex gap-3 text-body-medium leading-6 text-on-surface">
                          <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-label-medium font-semibold text-on-primary">
                            {i + 1}
                          </span>
                          <span>{langkah}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {blok.poin ? (
                    <ul className="mt-3 space-y-2">
                      {blok.poin.map((poin) => (
                        <li key={poin} className="flex gap-3 text-body-medium leading-6 text-on-surface-variant">
                          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{poin}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {blok.gambar ? (
                    <figure className="mt-4">
                      {/* Gambar layar admin: dibuka di tab baru untuk dilihat ukuran penuh di ponsel. */}
                      <a href={blok.gambar.src} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- gambar statis di public/, sudah dikecilkan */}
                        <img
                          src={blok.gambar.src}
                          alt={blok.gambar.alt}
                          width={blok.gambar.lebar}
                          height={blok.gambar.tinggi}
                          loading="lazy"
                          className="h-auto w-full max-w-[640px] rounded-md border border-outline-variant"
                        />
                      </a>
                      <figcaption className="mt-2 text-body-small text-on-surface-variant">{blok.gambar.keterangan}</figcaption>
                    </figure>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="border-t border-outline-variant pt-8 text-body-small text-on-surface-variant">
          Tally v{process.env.NEXT_PUBLIC_APP_VERSION ?? "—"} · This guide explains how the system works, not event
          data. Safe to share with all staff.
        </p>
      </div>
    </main>
  );
}
