import type { LandingLang } from "@/lib/landing-i18n";

const angka = (n: number, lang: LandingLang) => n.toLocaleString(lang === "en" ? "en-GB" : "id-ID");

/** Teks kartu "Pantau kehadiran" dan halaman Kehadiran panitia di portal. */
export const PANITIA_UI = {
  id: {
    kartuJudul: "Pantau kehadiran",
    peran: "Panitia",
    berjalan: "Sedang berjalan",
    hariIni: "Hari ini",
    lihatSemua: "Lihat semua titik",
    memuat: "Memuat kehadiran…",
    gagal: "Kehadiran belum bisa dimuat. Coba lagi sebentar.",
    kosong: "Belum ada titik check-in di acara ini.",
    dari: (sudah: number, harap: number) => `${angka(sudah, "id")} dari ${angka(harap, "id")}`,
    halamanJudul: "Kehadiran",
    kembali: "Kembali",
    kembaliKeBeranda: "Kembali ke Beranda",
    kembaliKeDaftar: "Kembali ke daftar titik",
    diperbarui: (jam: string) => `Diperbarui ${jam} · otomatis tiap 30 detik`,
    hariLabel: "Pilih hari",
    tanpaJadwal: "Tanpa jam di Agenda",
    belumN: (n: number) => `${angka(n, "id")} belum`,
    semuaSudah: "Semua sudah",
    ditutup: "Ditutup",
    belumMulai: "Belum ada yang tercatat",
    catatanAngka: "Angka = orang, bukan jumlah pindaian. Yang diharapkan = peserta yang dijadwalkan di titik itu menurut susunan acara.",
    sudahDari: (_sudah: number, harap: number, persen: number) => `dari ${angka(harap, "id")} sudah · ${persen}%`,
    tabBelum: (n: number) => `Belum · ${angka(n, "id")}`,
    tabSudah: (n: number) => `Sudah · ${angka(n, "id")}`,
    cari: "Cari nama, unit, atau kelompok",
    cariLabel: "Cari peserta",
    tidakDitemukan: (q: string) => `Tidak ada yang cocok dengan "${q}".`,
    belumKosong: "Semua yang diharapkan sudah tercatat.",
    sudahKosong: "Belum ada yang tercatat di titik ini.",
    lainnya: (n: number) => `${angka(n, "id")} orang lain juga tercatat di sini, di luar kelompok yang diharapkan.`,
    privasi: "Hanya nama, unit, dan jam. Untuk data lain, hubungi admin acara.",
    hanyaPanitia: "Kehadiran hanya untuk panitia acara ini.",
  },
  en: {
    kartuJudul: "Attendance",
    peran: "Committee",
    berjalan: "In progress",
    hariIni: "Today",
    lihatSemua: "See all check-in points",
    memuat: "Loading attendance…",
    gagal: "Attendance could not be loaded. Try again in a moment.",
    kosong: "This event has no check-in points yet.",
    dari: (sudah: number, harap: number) => `${angka(sudah, "en")} of ${angka(harap, "en")}`,
    halamanJudul: "Attendance",
    kembali: "Back",
    kembaliKeBeranda: "Back to Home",
    kembaliKeDaftar: "Back to check-in points",
    diperbarui: (jam: string) => `Updated ${jam} · refreshes every 30 seconds`,
    hariLabel: "Choose a day",
    tanpaJadwal: "No time in the Agenda",
    belumN: (n: number) => `${angka(n, "en")} not yet`,
    semuaSudah: "Everyone is in",
    ditutup: "Closed",
    belumMulai: "Nobody recorded yet",
    catatanAngka: "Numbers count people, not scans. Expected = participants scheduled for that point in the programme.",
    sudahDari: (_sudah: number, harap: number, persen: number) => `of ${angka(harap, "en")} in · ${persen}%`,
    tabBelum: (n: number) => `Not yet · ${angka(n, "en")}`,
    tabSudah: (n: number) => `In · ${angka(n, "en")}`,
    cari: "Search name, unit, or group",
    cariLabel: "Search participants",
    tidakDitemukan: (q: string) => `Nobody matches "${q}".`,
    belumKosong: "Everyone expected has been recorded.",
    sudahKosong: "Nobody has been recorded here yet.",
    lainnya: (n: number) => `${angka(n, "en")} other people were also recorded here, outside the expected group.`,
    privasi: "Names, units, and times only. Ask the event admin for anything else.",
    hanyaPanitia: "Attendance is only for the organising committee.",
  },
} as const satisfies Record<LandingLang, unknown>;

export type BarisKehadiran = {
  key: string;
  nama: string;
  tempat: string | null;
  tanggal: string | null;
  jam: string | null;
  diharapkan: number;
  sudah: number;
  lainnya: number;
  terakhir: string | null;
  aktif: boolean;
};

export type OrangKehadiran = { nama: string; unit: string | null; kelompok: string | null; at: string | null };

export function persenKehadiran(baris: Pick<BarisKehadiran, "sudah" | "diharapkan">): number {
  return baris.diharapkan > 0 ? Math.min(100, Math.round((baris.sudah / baris.diharapkan) * 100)) : 0;
}

export function jamDiZona(iso: string, zona: string, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** "Kam, 5 Nov" untuk chip hari. */
export function hariPendek(tanggal: string, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${tanggal}T00:00:00Z`));
}

export function angkaKehadiran(n: number, lang: LandingLang): string {
  return angka(n, lang);
}
