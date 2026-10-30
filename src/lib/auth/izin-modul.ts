/**
 * Izin per modul untuk akun berperan `custom` (Users & roles > Roles).
 *
 * Fungsi murni tanpa akses database, supaya bisa diuji langsung dengan Node
 * (izin-modul.check.ts) dan dipakai bersama oleh server dan sidebar.
 *
 * ---- Kenapa daftar aturan API, bukan sakelar di tiap route ----------------
 *
 * Lebih dari seratus route admin memanggil `requireRequestEvent(request,
 * ["admin"])`. Menambahkan pemeriksaan modul di masing-masing berarti satu saja
 * terlewat dan akun klien bisa menulis ke modul yang tidak diberikan, tanpa
 * satu pun tanda. Jadi aturannya satu tabel di sini, dibaca di satu titik
 * (request-event.ts), dan yang TIDAK tercantum ditolak. Route baru tertutup
 * untuk akun kustom sampai seseorang sengaja menambahkannya.
 */

export type Tingkat = "none" | "view" | "manage";

export type KunciModul =
  | "dashboard" | "event_page" | "agenda" | "speakers" | "seating" | "participants" | "registration"
  | "logistics" | "messages" | "participant_area" | "checkin" | "badges" | "lucky_draw" | "voting"
  | "orders" | "booths" | "reports";

export type IzinPeran = {
  modules: Partial<Record<KunciModul, Tingkat>>;
  /** Unduh CSV daftar peserta. Data pribadi keluar dari Tally, jadi sakelarnya sendiri. */
  participants_download: boolean;
  /** Kirim email blast dan email uji. Email terkirim tidak bisa ditarik. */
  messages_send_email: boolean;
};

export type Modul = {
  key: KunciModul;
  label: string;
  /** Satu kalimat di editor peran. */
  description: string;
  /** Tingkat yang bisa dipilih. Kosong = belum tersedia untuk peran kustom. */
  levels: Tingkat[];
  /** Awalan halaman admin (tanpa /e/<slug>). `/admin` dicocokkan persis. */
  pages: string[];
};

const TERSEDIA: Tingkat[] = ["none", "view", "manage"];
const LIHAT: Tingkat[] = ["none", "view"];

/** Urutan sama dengan sidebar. */
export const MODUL: Modul[] = [
  { key: "dashboard", label: "Dashboard", description: "Event summary and check-ins by checkpoint.", levels: LIHAT, pages: ["/admin"] },
  { key: "event_page", label: "Event page", description: "", levels: [], pages: ["/admin/landing"] },
  { key: "agenda", label: "Agenda", description: "", levels: [], pages: ["/admin/rundown"] },
  { key: "speakers", label: "Speakers", description: "", levels: [], pages: ["/admin/speakers"] },
  { key: "seating", label: "Seating plan", description: "", levels: [], pages: ["/admin/seat-map"] },
  { key: "participants", label: "Participant list", description: "Add, edit and delete participants. QR codes stay hidden.", levels: TERSEDIA, pages: ["/admin/participants"] },
  { key: "registration", label: "Registration", description: "New registrants and invited guests. Manage approves, rejects and invites.", levels: TERSEDIA, pages: ["/admin/registrasi"] },
  { key: "logistics", label: "Logistics", description: "", levels: [], pages: ["/admin/logistik"] },
  { key: "messages", label: "Messages", description: "Announcements and emails. Manage writes them; sending email has its own switch.", levels: TERSEDIA, pages: ["/admin/pengumuman"] },
  { key: "participant_area", label: "Participant area", description: "", levels: [], pages: ["/admin/area-peserta"] },
  { key: "checkin", label: "Check-in", description: "Check-ins per desk lane and per checkpoint.", levels: LIHAT, pages: ["/admin/attendance"] },
  { key: "badges", label: "Badges & labels", description: "", levels: [], pages: ["/admin/label"] },
  { key: "lucky_draw", label: "Lucky draw", description: "", levels: [], pages: ["/admin/undian"] },
  { key: "voting", label: "Live voting", description: "", levels: [], pages: ["/admin/vote"] },
  { key: "orders", label: "Orders", description: "", levels: [], pages: ["/admin/orders"] },
  { key: "booths", label: "Booths & items", description: "", levels: [], pages: ["/admin/booths"] },
  { key: "reports", label: "Reports", description: "", levels: [], pages: ["/admin/reports"] },
];

const KUNCI = new Set<string>(MODUL.map((modul) => modul.key));
const PERINGKAT: Record<Tingkat, number> = { none: 0, view: 1, manage: 2 };

/**
 * Bentuk izin yang aman dari isi jsonb apa pun: kunci asing dibuang, tingkat
 * yang tidak tersedia untuk modul itu turun ke tingkat tertinggi yang tersedia.
 */
export function rapikanIzin(raw: unknown): IzinPeran {
  const sumber = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const modules: Partial<Record<KunciModul, Tingkat>> = {};
  const mentah = (sumber.modules && typeof sumber.modules === "object" ? sumber.modules : {}) as Record<string, unknown>;
  for (const modul of MODUL) {
    const nilai = mentah[modul.key];
    if (nilai !== "view" && nilai !== "manage") continue;
    const tertinggi = modul.levels.filter((tingkat) => PERINGKAT[tingkat] <= PERINGKAT[nilai]).at(-1);
    if (tertinggi && tertinggi !== "none") modules[modul.key] = tertinggi;
  }
  return {
    modules,
    participants_download: sumber.participants_download === true && Boolean(modules.participants),
    messages_send_email: sumber.messages_send_email === true && modules.messages === "manage",
  };
}

export function tingkatModul(izin: IzinPeran, key: KunciModul): Tingkat {
  return KUNCI.has(key) ? izin.modules[key] ?? "none" : "none";
}

/* ------------------------------------------------------------- Halaman */

/**
 * Halaman di dalam modul yang tetap milik panitia: Email otomatis memakai
 * setelan email seluruh acara (pengirim, gambar, preset), bukan isi pesan.
 */
const HALAMAN_PEMILIK = ["/admin/pengumuman/otomatis"];

/** Path halaman tanpa prefiks `/e/<slug>`. Null = tidak pernah untuk peran kustom. */
export function modulHalaman(href: string): KunciModul | null {
  const path = href.split(/[?#]/)[0];
  if (HALAMAN_PEMILIK.some((awal) => path === awal || path.startsWith(`${awal}/`))) return null;
  let terbaik: { key: KunciModul; panjang: number } | null = null;
  for (const modul of MODUL) {
    for (const awal of modul.pages) {
      const cocok = awal === "/admin" ? path === "/admin" : path === awal || path.startsWith(`${awal}/`);
      if (cocok && (!terbaik || awal.length > terbaik.panjang)) terbaik = { key: modul.key, panjang: awal.length };
    }
  }
  return terbaik?.key ?? null;
}

/** Halaman pertama yang boleh dibuka, untuk mengalihkan dari halaman terlarang. */
export function halamanPertama(izin: IzinPeran): string | null {
  const modul = MODUL.find((item) => tingkatModul(izin, item.key) !== "none");
  return modul ? modul.pages[0] : null;
}

/* ------------------------------------------------------------------ API */

type Bendera = "participants_download" | "messages_send_email";

type Aturan = {
  pola: RegExp;
  metode: string[];
  /** Cukup SALAH SATU modul ini yang memenuhi `perlu`. */
  modul: KunciModul[];
  perlu: Exclude<Tingkat, "none">;
  bendera?: Bendera;
};

const ID = "[^/]+";
const BACA = ["GET", "HEAD"];

/**
 * Yang tidak tercantum DITOLAK untuk akun kustom, termasuk impor peserta, sinkron
 * Scanner API, reset check-in, setelan pendaftaran, dan semua modul lain. Tambah
 * baris di sini hanya bersama mode View halamannya.
 */
const ATURAN: Aturan[] = [
  // Dashboard
  { pola: /^\/api\/admin\/overview$/, metode: BACA, modul: ["dashboard"], perlu: "view" },
  { pola: /^\/api\/admin\/overview\/checkins$/, metode: BACA, modul: ["dashboard", "checkin"], perlu: "view" },

  // Participant list. Daftar peserta juga dibaca pemilih penerima di Messages.
  { pola: /^\/api\/admin\/participants$/, metode: BACA, modul: ["participants", "messages"], perlu: "view" },
  { pola: /^\/api\/admin\/participants$/, metode: ["POST"], modul: ["participants"], perlu: "manage" },
  { pola: new RegExp(`^/api/admin/participants/(?!export$|import$|sync$|bulk-delete$|seat-options$|scanner-config$)${ID}$`), metode: ["PATCH", "DELETE"], modul: ["participants"], perlu: "manage" },
  { pola: /^\/api\/admin\/participants\/bulk-delete$/, metode: ["POST"], modul: ["participants"], perlu: "manage" },
  { pola: /^\/api\/admin\/participants\/export$/, metode: [...BACA, "POST"], modul: ["participants"], perlu: "view", bendera: "participants_download" },
  { pola: /^\/api\/admin\/participants\/seat-options$/, metode: BACA, modul: ["participants"], perlu: "view" },
  { pola: new RegExp(`^/api/admin/participants/${ID}/check-in$`), metode: BACA, modul: ["participants", "checkin"], perlu: "view" },
  { pola: /^\/api\/admin\/registrasi\/upload$/, metode: BACA, modul: ["participants", "registration"], perlu: "view" },

  // Registration. PATCH (buka/tutup pendaftaran, mode persetujuan) tetap milik panitia.
  { pola: /^\/api\/admin\/registrasi$/, metode: BACA, modul: ["registration"], perlu: "view" },
  { pola: /^\/api\/admin\/registrasi$/, metode: ["POST"], modul: ["registration"], perlu: "manage" },
  { pola: /^\/api\/admin\/registrasi\/theme$/, metode: BACA, modul: ["registration"], perlu: "view" },
  { pola: /^\/api\/admin\/registrasi\/resend$/, metode: ["POST"], modul: ["registration"], perlu: "manage" },
  { pola: /^\/api\/admin\/undangan(\/templat)?$/, metode: BACA, modul: ["registration"], perlu: "view" },
  { pola: /^\/api\/admin\/undangan\/(tambah|impor)$/, metode: ["POST"], modul: ["registration"], perlu: "manage" },
  { pola: new RegExp(`^/api/admin/undangan/(?!tambah$|impor$|templat$)${ID}$`), metode: ["PATCH", "DELETE"], modul: ["registration"], perlu: "manage" },
  { pola: new RegExp(`^/api/admin/undangan/${ID}/tautan$`), metode: ["POST"], modul: ["registration"], perlu: "manage" },

  // Check-in: lihat saja.
  { pola: /^\/api\/admin\/attendance(\/lanes|\/items)?$/, metode: BACA, modul: ["checkin"], perlu: "view" },
  { pola: /^\/api\/admin\/checkpoints$/, metode: BACA, modul: ["checkin"], perlu: "view" },
  { pola: /^\/api\/admin\/area-peserta$/, metode: BACA, modul: ["checkin"], perlu: "view" },

  // Messages
  { pola: /^\/api\/admin\/pesan$/, metode: BACA, modul: ["messages", "participants"], perlu: "view" },
  { pola: /^\/api\/admin\/pesan$/, metode: ["POST"], modul: ["messages"], perlu: "manage" },
  { pola: new RegExp(`^/api/admin/pesan/(?!tes$)${ID}(/penerima)?$`), metode: BACA, modul: ["messages"], perlu: "view" },
  { pola: new RegExp(`^/api/admin/pesan/(?!tes$)${ID}$`), metode: ["PATCH", "DELETE"], modul: ["messages"], perlu: "manage" },
  { pola: new RegExp(`^/api/admin/pesan/${ID}/batal$`), metode: ["POST"], modul: ["messages"], perlu: "manage" },
  { pola: new RegExp(`^/api/admin/pesan/${ID}/(kirim|ulang|lanjutkan)$`), metode: ["POST"], modul: ["messages"], perlu: "manage", bendera: "messages_send_email" },
  { pola: /^\/api\/admin\/pesan\/tes$/, metode: ["POST"], modul: ["messages"], perlu: "manage", bendera: "messages_send_email" },
  { pola: /^\/api\/admin\/pengumuman$/, metode: BACA, modul: ["messages"], perlu: "view" },
  { pola: /^\/api\/admin\/pengumuman$/, metode: ["POST", "PATCH", "DELETE"], modul: ["messages"], perlu: "manage" },
  { pola: /^\/api\/admin\/pengumuman\/sasaran$/, metode: [...BACA, "POST"], modul: ["messages"], perlu: "view" },
  { pola: /^\/api\/admin\/pengumuman\/email$/, metode: ["POST"], modul: ["messages"], perlu: "manage", bendera: "messages_send_email" },
  { pola: /^\/api\/settings$/, metode: BACA, modul: ["messages"], perlu: "view" },
];

/** Buang prefiks `/e/<slug>` yang dipakai panggilan API ber-slug. */
export function normalkanPathApi(pathname: string) {
  const cocok = /^\/e\/[^/]+(\/api\/.*)$/.exec(pathname);
  return cocok ? cocok[1] : pathname;
}

export type HasilIzinApi = { boleh: true } | { boleh: false; alasan: "tidak_tercantum" | "kurang" | "bendera" };

export function izinApi(izin: IzinPeran, pathname: string, method: string): HasilIzinApi {
  const path = normalkanPathApi(pathname);
  const metode = method.toUpperCase();
  const aturan = ATURAN.find((item) => item.metode.includes(metode) && item.pola.test(path));
  if (!aturan) return { boleh: false, alasan: "tidak_tercantum" };
  const cukup = aturan.modul.some((key) => PERINGKAT[tingkatModul(izin, key)] >= PERINGKAT[aturan.perlu]);
  if (!cukup) return { boleh: false, alasan: "kurang" };
  if (aturan.bendera && !izin[aturan.bendera]) return { boleh: false, alasan: "bendera" };
  return { boleh: true };
}
