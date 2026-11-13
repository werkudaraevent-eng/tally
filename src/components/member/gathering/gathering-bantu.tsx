import { type EventTimeZone } from "@/lib/timezone";
import type { EventLandingConfig, EventRow, LandingMemberConfig } from "@/lib/domain";
import { type LandingLang } from "@/lib/landing-i18n";
import type { MemberSession } from "@/lib/member/account";
import { type MemberAnnouncements } from "@/lib/member/pengumuman";
import { type CSSProperties, type ReactNode } from "react";
import { landingTokens } from "@/lib/landing-tokens";
import { gatheringColors, latarGathering } from "@/lib/registration-theme-css";
import { gayaModern } from "@/components/landing/modern/kerangka";
import { HORIZON_GOLD_DEFAULT, sorotHorizon } from "@/lib/landing-tokens";
import { gayaHorizon } from "@/components/landing/modern/horizon";
import { kontras } from "@/lib/landing-hitung-mundur";
import { LATAR_PORTAL_HORIZON } from "@/components/member/portal-horizon";
import { agendaBerikutnya, type LogistikPeserta } from "@/lib/logistik/peserta";
import { HEAD } from "@/components/landing/modern/styles";
import { House } from "@phosphor-icons/react/dist/ssr";
import { PemicuQr } from "@/components/member/qr-fokus";
import Link from "next/link";

/**
 * Portal peserta gaya gathering (`/e/<slug>/peserta`, preset Gathering),
 * rancangan pen.dev Hanung yang disetujui 2026-10-07 dengan tombol hijau.
 *
 * Empat tab lewat `?tab=` (beranda, jadwal, info, profil) dan QR layar penuh
 * (`?tab=qr`): tautan biasa, jadi tombol Kembali peramban dan tautan yang
 * dibagikan tetap bekerja tanpa JavaScript. Ponsel memakai bilah tab bawah;
 * layar lebar memakai tab di bilah atas.
 *
 * Semua isi dari data yang sudah ada: rundown, pengumuman, logistik
 * (member_logistics), kontak acara. Yang datanya belum ada di skema (tiket
 * kereta, kategori pengumuman, kontak darurat) tidak ditampilkan.
 *
 * Acara Modern non-gathering tetap memakai DashboardModern.
 */

/**
 * `perjalanan` dan `outfit` hanya untuk Gathering Horizon; preset lain
 * membukanya sebagai Beranda. `outfit` juga Beranda selama belum ada outfit.
 */
export type PortalTab = "beranda" | "jadwal" | "perjalanan" | "outfit" | "info" | "profil" | "qr";

export const KARTU = "rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6";
export const MUTED = "text-[#5F6B7F]";
/** Warna tanda ==warna== di Details agenda portal: tinta judul, bukan warna merek (kontras aman di kartu putih). */
export const TINTA_TANDA = "#1A2333";
export const LABEL = "text-[12px] font-bold uppercase tracking-[0.08em]";
export const PANEL = "#F4F6F8";
/** Gradasi hero halaman acara (LATAR_HERO di gathering-app), dari `--latar-gathering`. */
export const LATAR_HERO =
  "var(--latar-gathering, linear-gradient(160deg, color-mix(in srgb, var(--reg-brand) 62%, black) 0%, color-mix(in srgb, var(--reg-brand) 85%, black) 60%, var(--reg-brand) 100%))";
/** Lencana di atas judul, sama dengan hero halaman acara. */
export const ALIS_HERO =
  "inline-flex items-center rounded-full bg-white/10 px-[18px] py-2 text-[12px] font-semibold uppercase leading-[1.2] tracking-[2px] text-[var(--hero-lencana,var(--hero-alis))]";
export const REDUP_HERO = "text-[var(--hero-redup,rgb(255_255_255/0.8))]";

/** Tanggal "YYYY-MM-DD" dan menit sejak tengah malam di zona waktu acara. */
export function sekarangDi(zona: EventTimeZone, now: Date) {
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { tanggal: `${bagian.year}-${bagian.month}-${bagian.day}`, menit: Number(bagian.hour) * 60 + Number(bagian.minute), jam: Number(bagian.hour) };
}

/** Props DashboardGathering. */
export type DashboardGatheringProps = {
  event: EventRow;
  lang?: LandingLang;
  member: LandingMemberConfig;
  sesi: MemberSession;
  pengumuman: MemberAnnouncements;
  konfirmasi: "ok" | "gagal" | null;
  tab: PortalTab;
  /** Hari yang dipilih di tab Jadwal (1, 2, ...). */
  hari: number | null;
  /** Tab asal QR layar penuh (`?dari=`): tombol tutup dan Escape kembali ke sana. */
  dari?: "jadwal" | "perjalanan" | "outfit" | "info" | "profil" | null;
  /** Halaman di dalam Profil Horizon (`?lihat=`): "data" = Data diri. */
  lihat?: "data" | null;
  /** Pratinjau di Participant area: tiap isi Beranda diberi penanda untuk digulir ke sana. */
  pratinjau?: boolean;
  /** Pratinjau saja: saat yang dipilih di "Preview on" (ms epoch); tanpa itu, saat ini. */
  waktuPratinjau?: number | null;
};

/** Warna dan huruf portal dari Tema acara; Horizon: navy dan emas, latar krem. */
export function gayaPortal(config: EventLandingConfig, horizon: boolean): CSSProperties {
  const tokensTema = landingTokens(config, "modern");
  const latarHalaman = latarGathering(tokensTema.brand);
  const warna = gatheringColors(tokensTema.accent ?? undefined, tokensTema.brand, false, config.button_color);
  const gaya = {
    ...gayaModern(config),
    // Portal berlatar putih dan abu-abu muda: tombol versi putih (QA #103 M3).
    "--aksi": warna.ctaPutih,
    "--on-aksi": warna.onCtaPutih,
    "--chip-aksi": warna.chipAksi.latar,
    "--on-chip-aksi": warna.chipAksi.teks,
    "--chip-merek": warna.chipMerek.latar,
    "--on-chip-merek": warna.chipMerek.teks,
    "--chip-aksen": warna.chipAksen.latar,
    "--on-chip-aksen": warna.chipAksen.teks,
    "--alis": warna.aksiTeks,
    "--aksen": warna.aksen,
    "--aksen-teks": warna.aksenTeks,
    "--hero-angka": warna.heroAngka,
    // Hero sama dengan halaman acara: gradasi, teks redup, lencana, tepi 56px.
    "--latar-gathering": latarHalaman.latar,
    "--hero-redup": latarHalaman.redup ?? undefined,
    "--hero-lencana": warna.heroLencana,
    "--hero-alis": warna.heroAlis,
    "--tanda-latar": warna.tanda.latar,
    "--tanda-teks": warna.tanda.teks,
    "--pinggir-lg": "56px",
    "--pinggir-xl": "56px",
    // Sama dengan halaman acara: Inter polos, tanpa varian global (cv01/ss03)
    // dan angka tabel, supaya bilah atas sama persis.
    fontFeatureSettings: "normal",
    fontVariantNumeric: "normal",
    backgroundColor: PANEL,
  } as CSSProperties;
  // Gathering Horizon (rancangan V5): navy dan emas dari Tema, latar krem.
  if (horizon) {
    const emas = [config.button_color, tokensTema.accent].find((nilai) => /^#[0-9a-f]{6}$/i.test(nilai ?? "")) ?? HORIZON_GOLD_DEFAULT;
    // Teks emas di atas navy (label dan sorot kartu checkpoint) memakai sorot yang
    // diukur kontrasnya, sama dengan halaman acara; emas yang sudah terbaca tidak berubah.
    Object.assign(gaya, gayaHorizon(tokensTema.brand, emas, kontras(emas, "#101E38") >= 4.5 ? "#101E38" : "#ffffff", sorotHorizon(emas, tokensTema.accent, tokensTema.brand)), { backgroundColor: LATAR_PORTAL_HORIZON, "--kartu-garis": "1px", "--kartu-sudut": "16px", "--kartu-pad": "16px", "--kartu-pad-lebar": "24px" });
  }
  return gaya;
}

/** "Jum 6 Nov" (id) atau "Fri 6 Nov" (en) dari tanggal "YYYY-MM-DD". */
export function hariPendekTanggal(tanggal: string, lang: LandingLang): string {
  const bagian = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(new Date(`${tanggal}T00:00:00Z`));
  const ambil = (jenis: string) => bagian.find((item) => item.type === jenis)?.value.replace(/\.$/, "") ?? "";
  return `${ambil("weekday")} ${ambil("day")} ${ambil("month")}`;
}

/** Tanggal "YYYY-MM-DD" digeser sejumlah hari. */
export function geserTanggal(tanggal: string, hari: number): string {
  const waktu = new Date(`${tanggal}T00:00:00Z`);
  waktu.setUTCDate(waktu.getUTCDate() + hari);
  return waktu.toISOString().slice(0, 10);
}

/** Bus peserta: bus perjalanan berikutnya, atau bus bawaannya. */
export function namaBusPeserta(logistik: LogistikPeserta, sekarang: Date): string | null {
  return agendaBerikutnya(logistik, sekarang)?.bus ?? logistik.transport?.default_bus ?? null;
}

/** Pil di bawah nama di layar QR: "Batch 2 · Bus 3", salah satunya, atau null. */
export function labelPil(kelompok: string | null, bus: string | null, kata: string): string | null {
  return [kelompok, bus ? labelBus(bus, kata) : null].filter(Boolean).join(", ") || null;
}

/** "Bus 3" apa adanya; kode yang hanya angka ("3") diberi kata "Bus" di depannya (E-10). */
export function labelBus(kode: string, kata: string): string {
  return /^\d+$/.test(kode.trim()) ? `${kata} ${kode.trim()}` : kode;
}

/** "Kam, 5 Nov" (id) atau "Thu, 5 Nov" (en), dalam zona acara. */
export function hariHorizon(iso: string, zona: EventTimeZone, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(/\.(?=\s|$)/g, "");
}

/** "14.00" (id) atau "14:00" (en), dalam zona acara. */
export function jamHorizon(iso: string, zona: EventTimeZone, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}


/** "6 November" untuk label bab Horizon. */
export function tanggalBab(tanggal: string, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${tanggal}T00:00:00Z`));
}

/** Chip hari dua baris di Jadwal Horizon: "Jum" / "6 Nov" (U-06). */
export function chipTanggal(tanggal: string, lang: LandingLang): { atas: string; bawah: string } {
  const bagian = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(new Date(`${tanggal}T00:00:00Z`));
  const ambil = (jenis: string) => bagian.find((item) => item.type === jenis)?.value.replace(/\.$/, "") ?? "";
  return { atas: ambil("weekday"), bawah: `${ambil("day")} ${ambil("month")}` };
}

/** "Sabtu, 7 November" di atas judul Beranda Horizon dan di kartu dresscode (tanpa tahun). */
export function tanggalSapaan(tanggal: string, lang: LandingLang): string {
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Jam "8:20", "08:20" atau "08.20:00" menjadi "08.20" (Indonesia, seperti jam susunan acara) atau "08:20" (English), tanpa detik. */
export function jamTampil(jam: string | null | undefined, lang: LandingLang): string | null {
  const cocok = jam?.match(/^(\d{1,2})[.:](\d{2})/);
  return cocok ? `${cocok[1].padStart(2, "0")}${lang === "en" ? ":" : "."}${cocok[2]}` : null;
}

/** Menit sejak tengah malam (jam dinding zona acara) menjadi "08.15". */
export function jamDariMenit(menit: number, lang: LandingLang): string {
  return `${String(Math.floor(menit / 60)).padStart(2, "0")}${lang === "en" ? ":" : "."}${String(menit % 60).padStart(2, "0")}`;
}

/** "Jumat, 6 November 2026" untuk judul hari di halaman Jadwal Horizon. */
export function tanggalPanjangBab(tanggal: string, lang: LandingLang): string {
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function JudulKepala({ judul, catatan }: { judul: string; catatan: string | null }) {
  return (
    <div>
      <h1 className={`${HEAD} text-[28px] font-extrabold leading-tight tracking-[-0.02em] lg:text-[40px]`}>{judul}</h1>
      {catatan ? <p className="mt-1 text-body-medium opacity-85">{catatan}</p> : null}
    </div>
  );
}

export function Chip({ nada, children }: { nada: "aksi" | "brand" | "aksen"; children: ReactNode }) {
  // Teks chip dihitung terhadap latar chip itu sendiri (gatheringColors).
  const warna =
    nada === "aksi"
      ? "bg-[var(--chip-aksi)] text-[var(--on-chip-aksi)]"
      : nada === "aksen"
        ? "bg-[var(--chip-aksen)] text-[var(--on-chip-aksen)]"
        : "bg-[var(--chip-merek)] text-[var(--on-chip-merek)]";
  return <span className={`inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-bold ${warna}`}>{children}</span>;
}

export function KartuAngka({
  id,
  Ikon,
  ikonWarna,
  label,
  angka,
  catatan,
  children,
}: {
  id: string;
  Ikon: typeof House;
  ikonWarna: "brand" | "aksen";
  label: string;
  angka: string;
  catatan: string | null;
  children?: ReactNode;
}) {
  return (
    <section id={id} className={`${KARTU} scroll-mt-6`}>
      <span
        aria-hidden
        className={`flex size-12 items-center justify-center rounded-xl ${
          ikonWarna === "brand" ? "bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-[var(--reg-brand)]" : "bg-[color-mix(in_srgb,var(--aksen)_22%,white)] text-[var(--aksen-teks)]"
        }`}
      >
        <Ikon size={24} />
      </span>
      <h2 className={`mt-3 text-body-medium ${MUTED}`}>{label}</h2>
      <p className={`${HEAD} mt-1 break-words text-[28px] font-extrabold leading-tight lg:text-[32px]`}>{angka}</p>
      {catatan ? <p className={`mt-1 text-body-medium ${MUTED}`}>{catatan}</p> : null}
      {children}
    </section>
  );
}

export function TautanPortal({ href, luar, className, children, pemicuQr }: { href: string; luar: boolean; className: string; children: ReactNode; pemicuQr?: string }) {
  if (pemicuQr) {
    return (
      <PemicuQr id={pemicuQr} href={href} className={className}>
        {children}
      </PemicuQr>
    );
  }
  if (luar) {
    const baru = href.startsWith("http");
    return (
      <a href={href} className={className} {...(baru ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** "Kamis, 5 Nov" di kartu hari Susunan acara tema Trip. */
export function tanggalKartuHari(tanggal: string, lang: LandingLang): string {
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}
