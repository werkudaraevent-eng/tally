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

type Bagian = {
  id: string;
  judul: string;
  ringkas: string;
  isi: { judul: string; poin: string[] }[];
};

const BAGIAN: Bagian[] = [
  {
    id: "peta",
    judul: "1. System map",
    ringkas: "What Tally contains, and who sees what.",
    isi: [
      {
        judul: "Three kinds of screen",
        poin: [
          "Staff workspace: at /e/<slug>/admin/…, sign-in required. Every module in the sidebar lives here.",
          "Public pages: participants open them on their own phones without signing in. The event page, registration form, agenda, seating plan and participant code page.",
          "Stage screens: shown on the projector. Leaderboard, lucky draw and live voting.",
        ],
      },
      {
        judul: "One event, one workspace",
        poin: [
          "Each event has its own workspace. Booth, participant and order data never mix between events.",
          "Switch events with the event name in the top bar. It is a menu, and picking another event takes you to the same page in that event.",
          "The event's public address uses its slug: /e/<slug>. That is the address printed on invitations and QR codes.",
        ],
      },
    ],
  },
  {
    id: "persiapan",
    judul: "2. Setup, in order",
    ringkas: "This order is not a preference: each step needs the result of the one before it.",
    isi: [
      {
        judul: "a. Settings → Event tab",
        poin: [
          "Choose the time zone FIRST. It decides what every time means across the system: orders, audit, agenda, leaderboard. Changing it after orders exist makes recorded times read differently.",
          "Hand-over mode: items are handed over at the booth straight away, or after the cashier confirms payment. This changes the booth staff's steps and their printed guide.",
          "Cashier confirmation: on means orders wait for the cashier to mark them paid; off means orders are paid at the booth.",
        ],
      },
      {
        judul: "b. Users & roles",
        poin: [
          "Create an account for each role: Booth staff (serves at a booth), Cashier, Scanner staff, Admin, Super admin.",
          "One booth account per physical booth, not one account shared in turns. Order history follows the signed-in account.",
          "An admin can reset a PIN at any time. An old PIN is never shown again after it is created.",
        ],
      },
      {
        judul: "c. Booths & items",
        poin: [
          "Booths tab: booth code (printed and stuck on the booth), name, active status, and whether the booth takes orders.",
          "Special items tab: items with a special price, a quota per participant, a minimum spend, and whether their value counts towards the leaderboard.",
          "A new booth gets one built-in discount item. Set its details in the Special items tab.",
        ],
      },
      {
        judul: "d. Participants",
        poin: [
          "Participant list: pull from the Event Scanner API, import a file, or add people by hand, depending on the participant source chosen for the event.",
          "Registration: turn it on when participants sign up themselves through the form. Build the questions on the same page, then review incoming registrants.",
          "Invited guests: on the Invited guests tab of Registration, add people one by one or import an Excel file, then send each one a personal registration link.",
          "Participant codes are issued straight away for events that approve registrations automatically. For moderated events, the code is issued once staff press Approve.",
        ],
      },
    ],
  },
  {
    id: "publik",
    judul: "3. Public pages",
    ringkas: "What participants see before the event day, on their own phones.",
    isi: [
      {
        judul: "Event page",
        poin: [
          "Content of /e/<slug>: banner, date, venue, description, key figures, agenda, FAQ, sponsors and staff contacts.",
          "A section that is turned on but has no content does NOT appear on the public page. There is no heading left hanging over an empty space.",
          "Brand colours are set here, and the registration page follows them. A switch lets the form use different colours when it must.",
          "The preview in the editor loads the real public page. It shows the SAVED version, so press Save first.",
        ],
      },
      {
        judul: "Agenda",
        poin: [
          "The programme, item by item. Three places share it: the event page, the public agenda screen, and the “now on” marker.",
          "Fill it in once here. There is no need to retype it on the event page.",
        ],
      },
      {
        judul: "Seating plan",
        poin: [
          "A map of tables and seats that participants open at /denah to find where they sit.",
          "Seat assignments can come from sub-events in the Scanner API, or be set by hand.",
        ],
      },
    ],
  },
  {
    id: "panggung",
    judul: "4. Stage screens",
    ringkas: "Three screens that come alive while the MC holds the microphone. Open them in a separate window, then send it to the projector.",
    isi: [
      {
        judul: "Leaderboard",
        poin: [
          "Shows participants' spending ranking on the projector. Title, colours, logo and layout are set in this module.",
          "Staged reveal: ranks open one at a time on the MC's cue instead of all at once. Its controls are on a separate page in the same module.",
          "Exclusions: take certain names off the board, such as staff who also made purchases.",
          "Amounts can be hidden. The figures are then never sent to the screen at all, not merely covered up.",
        ],
      },
      {
        judul: "Lucky draw",
        poin: [
          "Prize list, participant eligibility rules, screen title, stage effects and background colour.",
          "The operator panel is used during the event: choose a prize, run the draw, then CONFIRM the winner. A draw does not finish on its own. Without confirmation, the result is not recorded.",
          "Draw readiness at the top of the module tells you what is still missing before the draw can run.",
        ],
      },
      {
        judul: "Live voting",
        poin: [
          "Questions and their options, opened and closed by staff while the event runs.",
          "The stage screen shows results that move as votes come in. Results can be exported per question.",
          "Votes can be cleared if a test run was recorded by mistake.",
        ],
      },
    ],
  },
  {
    id: "hari-h",
    judul: "5. Event day",
    ringkas: "The usual order, from the moment participants arrive until the event ends.",
    isi: [
      {
        judul: "Check-in desk",
        poin: [
          "Participants show their participant code (number or QR) from the email, their code page, or a saved image.",
          "Staff can always see the code in the Registration module, so a participant who lost their code can still be served.",
        ],
      },
      {
        judul: "Booth",
        poin: [
          "Booth staff use the /booth screen: scan the participant's QR, choose items, enter the amount, save.",
          "The full steps are in the printed operator guide. Print it and leave it at the booth desk.",
        ],
      },
      {
        judul: "Stage",
        poin: [
          "Open the stage screens in a separate window before the event starts, not once the MC is already speaking.",
          "The leaderboard updates within a few seconds every time its settings are saved. There is no need to reload the projector screen.",
        ],
      },
    ],
  },
  {
    id: "sesudah",
    judul: "6. After the event",
    ringkas: "Closing the books and keeping the record.",
    isi: [
      {
        judul: "Orders & reports",
        poin: [
          "Orders: every order, with filters for status and booth, and search by sticker number.",
          "Reports: revenue summary, per booth, and reconciliation figures to check against the cash.",
        ],
      },
      {
        judul: "Audit trail",
        poin: [
          "Under Settings → Audit trail tab, for Super admins only.",
          "Records who changed what and when: settings, special items, booths, accounts, and data resets.",
        ],
      },
    ],
  },
  {
    id: "masalah",
    judul: "7. Common problems",
    ringkas: "",
    isi: [
      {
        judul: "A section that is turned on does not appear on the public page",
        poin: ["Sections without content are not shown. Add the content first, then press Save."],
      },
      {
        judul: "A participant did not get the code email",
        poin: [
          "Sending email needs an email provider key set on the server. Without it, the review screen says so plainly instead of showing “send failed”.",
          "Staff can still read the code out from the Registration module, and participants have a code page link they can open at any time.",
        ],
      },
      {
        judul: "The time on screen differs from the time in the room",
        poin: ["Check the time zone in Settings → Event. The whole system uses that zone, not the zone of a staff laptop."],
      },
      {
        judul: "Leaderboard figures look wrong",
        poin: [
          "Check which special items count towards the leaderboard. There is a switch per item.",
          "Check the participant exclusions list in the Leaderboard module.",
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
          Every module, in working order: what to set up first, what to use while the event runs, and what to
          wrap up afterwards.
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
                  <ul className="mt-3 space-y-2">
                    {blok.poin.map((poin) => (
                      <li key={poin} className="flex gap-3 text-body-medium leading-6 text-on-surface-variant">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{poin}</span>
                      </li>
                    ))}
                  </ul>
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
