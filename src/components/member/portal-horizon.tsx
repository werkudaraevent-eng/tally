import type { ReactNode } from "react";
import Link from "next/link";
import { Ambulance, ArrowLeft, ArrowRight, ArrowsOut, Bell, Bus, CalendarBlank, CalendarDots, CalendarPlus, CaretDown, CaretRight, Check, Clock, CoatHanger, Compass, FireTruck, Hospital, Bed, PoliceCar, Question, Siren, EnvelopeSimple, Lifebuoy, List, MapPin, Phone, QrCode, SignOut, Suitcase, Train, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import type { PortalTab } from "@/components/member/dashboard-gathering";
import { GulirChipAktif, GulirHariAktif } from "@/components/member/gulir-hari-aktif";
import { CINCIN_NAVY } from "@/components/landing/modern/cincin-horizon";
import { FormKeluar } from "@/components/member/form-keluar";
import { KartuFotoOutfit } from "@/components/member/foto-outfit";
import { PilihanOutfit } from "@/components/member/pilihan-outfit";
import type { OutfitPilihan } from "@/lib/outfit";
import { IkonTabBawah, PenandaTab } from "@/components/member/muat-portal";
import { PemicuQr } from "@/components/member/qr-fokus";
import { SEPARATOR } from "@/lib/typography";

/**
 * Portal peserta Gathering Horizon: rancangan pen.dev V5 Hanung (2026-10-13),
 * frame f13sV (desktop), pgOAT (ponsel), dan eY05h (QR kehadiran). Dibangun
 * ulang setia dari properti node, ukuran ditulis apa adanya.
 *
 * Isi dari data yang sudah ada: nama sesi, rundown, member_logistics (bus,
 * kamar, teman sekamar), kode peserta. Yang datanya tidak ada tidak
 * ditampilkan; tidak ada data contoh. Dipakai oleh DashboardGathering bila
 * `gathering_variant === "horizon"`; acara Gathering lain tidak berubah.
 */

const KREM = "#FAF8F2";
const TINTA = "#101E38";
const REDUP = "#526078";
const LABEL = "#4D5D77";
const BIRU = "#274FC0";
const GARIS_NAVY = "#405272";
const REDUP_NAVY = "#CDD7EA";

/**
 * Kartu putih di latar krem: pola M3 Outlined card, garis 1 px tinta 12%
 * (~1,3:1, lebih lembut dari outline-variant). Putih di krem tanpa garis hanya
 * ~1,05:1, jadi batas kartu hilang di susunan dua kolom Beranda.
 */
export const GARIS_KARTU = "ring-1 ring-[rgb(16_30_56/0.12)]";

/*
 * Satu skala untuk setiap kartu putih portal Horizon (DESIGN.md "Kartu di
 * portal Horizon"): judul isi 18/24 tebal, nilai kunci 16/24, keterangan
 * 14/20, alis 12/16, dan tautan 14/20 yang area ketuknya tetap 48 px tanpa
 * menambah jarak baris (-my-3.5 menarik balik kelebihan 28 px). Jarak: 4 px
 * antar-baris satu kelompok, 12 px antar-kelompok, 16 px antar-bagian kartu.
 */
export const KARTU_HZ = `${GARIS_KARTU} rounded-[16px] bg-white`;
export const PAD_KARTU = "p-4 md:p-6";
export const KELAS_JUDUL_ISI = "text-[18px] font-bold leading-6 [overflow-wrap:anywhere]";
export const KELAS_NILAI = "text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]";
export const KELAS_ALIS = "text-[12px] font-semibold leading-4";
export const KELAS_KET = "text-[14px] leading-5 [overflow-wrap:anywhere]";
export const KELAS_TAUTAN = "-my-3.5 inline-flex min-h-12 items-center gap-1 self-start text-[14px] font-semibold leading-5";
const KELAS_STRIP = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[12px] px-3 py-2";
export const LATAR_STRIP = "#F1F3F8";
export const WARNA_GARIS = "#E6E8EC";

/**
 * Kepala kartu putih: ikon 22 px dan jenis kartu (16/24) di kiri, satu
 * keterangan di kanan, garis tipis di bawahnya (pola Trip.com "All bookings").
 * Jenis kartu dibedakan oleh ikon dan namanya, bukan oleh warna.
 */
export function KepalaKartuHorizon({ Ikon, judul, meta, nadaMeta = "redup", idJudul, warna = TINTA }: { Ikon: typeof Train; judul: string; meta?: ReactNode; nadaMeta?: "redup" | "hijau"; idJudul?: string; /** Merah hanya untuk kartu darurat. */ warna?: string }) {
  return (
    <div className="-mx-4 flex items-center gap-3 border-b px-4 pb-4 md:-mx-6 md:px-6" style={{ borderColor: WARNA_GARIS }}>
      <Ikon size={22} weight="bold" aria-hidden className="shrink-0" style={{ color: warna }} />
      <h2 id={idJudul} className="min-w-0 flex-1 text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]" style={{ color: warna }}>
        {judul}
      </h2>
      {meta ? (
        <p className="max-w-[45%] text-right text-[14px] font-medium leading-5 tabular-nums" style={{ color: nadaMeta === "hijau" ? "#1E7B45" : REDUP }}>
          {meta}
        </p>
      ) : null}
    </div>
  );
}

/** Tombol pil emas rancangan (14/700), teks dari --hz-on-emas, tinggi >= 48px. */
const PIL_EMAS =
  "m3-state inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--hz-emas)] px-[18px] py-4 text-[14px] font-bold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)] md:py-[17px]";

export type TabHorizon = { id: Exclude<PortalTab, "qr">; label: string; labelPendek: string; href: string };

// Profil di ponsel menjadi "Menu": halaman yang juga memuat kontak dan Keluar (dan Outfit bila Jadwal disembunyikan).
const IKON_TAB = { beranda: Compass, jadwal: CalendarDots, perjalanan: Suitcase, outfit: CoatHanger, info: Bell, profil: List } as const;

/**
 * Lencana angka pengumuman yang belum dibaca (pola tab Whova): angka terlihat,
 * dan teks untuk pembaca layar di dalam tautannya ("Pengumuman, 1 belum dibaca").
 */
function LencanaBelum({ jumlah, label, className }: { jumlah: number; label: string; className: string }) {
  if (jumlah <= 0) return null;
  return (
    <>
      <span aria-hidden className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#B42318] px-1 text-[11px] font-bold leading-none text-white ring-2 ${className}`}>
        {jumlah > 9 ? "9+" : jumlah}
      </span>
      <span className="sr-only">{`, ${label}`}</span>
    </>
  );
}

/**
 * Bilah navy atas (frame "Portal navigation" / "Portal header"): logo, tab, inisial.
 * Ringkas di ponsel, tablet, dan laptop berlayar pendek (64 px, logo 40/48 px,
 * pola bilah ringkas halaman acara Horizon); layar tinggi tetap ukuran V5.
 * Tingginya sama di semua tab.
 */
export function KepalaHorizon({
  logo,
  nama,
  homeHref,
  tabs,
  aktif,
  halaman = aktif,
  inisial,
  profilLabel,
  infoBelum,
  infoBelumLabel,
  tabsAria,
  indikator,
}: {
  logo: string | null;
  nama: string;
  homeHref: string;
  tabs: TabHorizon[];
  /** Tab yang menyala. */
  aktif: Exclude<PortalTab, "qr">;
  /** Halaman yang terbuka, bila bukan tab itu sendiri (Outfit di bawah Susunan acara). */
  halaman?: Exclude<PortalTab, "qr">;
  inisial: string;
  profilLabel: string;
  /** Jumlah pengumuman yang belum dibaca; 0 = tanpa lencana. */
  infoBelum: number;
  infoBelumLabel: string;
  tabsAria: string;
  /** Garis kemajuan di tepi bawah bilah saat pindah tab (U-10). */
  indikator?: ReactNode;
}) {
  const profil = tabs.find((tab) => tab.id === "profil");
  return (
    <header className={`sticky top-0 z-30 bg-[var(--hz-navy)] text-white ${CINCIN_NAVY}`}>
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 px-6 py-2 md:px-16 lg:py-5 lg:short:py-2">
        <a href={homeHref} className="flex min-h-12 min-w-0 items-center">
          {logo ? (
            // Logo dari CMS: ukuran asli tidak diketahui, jadi <img> biasa.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={nama} className="h-10 w-auto max-w-[120px] object-contain object-left lg:h-[62px] lg:max-w-[140px] lg:short:h-12" />
          ) : (
            <span className="truncate text-[18px] font-extrabold">{nama}</span>
          )}
        </a>
        {/* Tab di kanan, berdampingan dengan profil: sama dengan bilah atas halaman acara Horizon.
            Di bawah 1024 px bilah bawah yang dipakai, supaya QR selalu satu ketukan (U-18). */}
        <nav aria-label={tabsAria} className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-6">
            {tabs
              .filter((tab) => tab.id !== "profil")
              .map((tab) => (
                <li key={tab.id}>
                  <Link
                    href={tab.href}
                    aria-current={tab.id === halaman ? "page" : tab.id === aktif ? "true" : undefined}
                    className="m3-state relative inline-flex min-h-12 items-center gap-1.5 rounded-md px-1 text-[14px] font-semibold text-[#E1E6F1] aria-[current]:text-white"
                  >
                    {tab.label}
                    {tab.id === "info" ? <LencanaBelum jumlah={infoBelum} label={infoBelumLabel} className="-mt-3 ring-[var(--hz-navy)]" /> : null}
                    {tab.id === aktif ? <span aria-hidden className="absolute inset-x-1 bottom-2 h-0.5 rounded-full bg-[var(--hz-emas)]" /> : null}
                    {tab.id !== halaman ? <PenandaTab tab={tab.id} /> : null}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        {/* Lingkaran emas di semua halaman supaya inisial terbaca sebagai tombol akun (pola Gmail/Maps).
            Saat Menu terbuka lingkarannya terisi, sama dengan ikon bilah bawah yang berganti garis ke isi. */}
        {profil ? (
          <Link
            href={profil.href}
            aria-label={profilLabel}
            aria-current={halaman === "profil" ? "page" : aktif === "profil" ? "true" : undefined}
            className="m3-state -mr-3 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[16px] font-extrabold text-[var(--hz-emas)] ring-2 ring-inset ring-[var(--hz-emas)] aria-[current]:bg-[var(--hz-emas)] aria-[current]:text-[var(--hz-on-emas)] aria-[current]:[--m3-state-color:var(--hz-on-emas)]"
          >
            {inisial}
            {halaman !== "profil" ? <PenandaTab tab="profil" /> : null}
          </Link>
        ) : null}
      </div>
      {indikator}
    </header>
  );
}

/** Bilah tab bawah ponsel (frame "Bottom navigation"). */
/**
 * Navigasi bawah ponsel. `qr`: tombol emas di tengah (pola tombol Bayar/Pindai
 * di aplikasi dompet), jadi QR kehadiran terjangkau ibu jari dari tab mana pun.
 */
export function NavBawahHorizon({
  tabs,
  aktif,
  halaman = aktif,
  tabsAria,
  infoBelum,
  infoBelumLabel,
  qr,
}: {
  tabs: TabHorizon[];
  /** Tab yang menyala. */
  aktif: Exclude<PortalTab, "qr">;
  /** Halaman yang terbuka, bila bukan tab itu sendiri (Outfit di bawah Susunan acara). */
  halaman?: Exclude<PortalTab, "qr">;
  tabsAria: string;
  infoBelum: number;
  infoBelumLabel: string;
  qr?: { href: string; label: string; labelPendek: string } | null;
}) {
  const tengah = Math.ceil(tabs.length / 2);
  return (
    <nav aria-label={tabsAria} className="fixed inset-x-0 bottom-0 z-20 bg-white px-2 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-1px_0_#E6E9EE] max-[339px]:px-0 lg:hidden">
      {/* Label 12 px (U-25); 11 px di bawah 380 px dan 10 px di bawah 340 px, dengan sel QR
          selebar isinya, supaya "Perjalanan" dan "Pengumuman" tidak bertumpuk. */}
      <ul className={`mx-auto grid max-w-[560px] ${qr ? "grid-cols-5 max-[339px]:grid-cols-[1fr_1fr_auto_1fr_1fr]" : "grid-cols-4"}`}>
        {tabs.flatMap((tab, index) => {
          const Ikon = IKON_TAB[tab.id];
          const ini = tab.id === aktif;
          const tombolQr =
            qr && index === tengah ? (
              <li key="qr">
                <PemicuQr id="pemicu-qr-nav" href={qr.href} className="m3-state flex min-h-12 flex-col items-center justify-center gap-[5px] rounded-md text-[0.6875rem] font-bold text-[#101E38] max-[339px]:text-[0.625rem] min-[380px]:text-[0.75rem]">
                  <span aria-hidden className="-mt-7 flex size-14 items-center justify-center rounded-full bg-[var(--hz-emas)] text-[var(--hz-on-emas)] shadow-[0_4px_12px_rgba(16,30,56,0.25)] ring-4 ring-white">
                    <QrCode size={26} weight="bold" />
                  </span>
                  <span aria-hidden>{qr.labelPendek}</span>
                  <span className="sr-only">{qr.label}</span>
                </PemicuQr>
              </li>
            ) : null;
          return [
            tombolQr,
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={tab.id === halaman ? "page" : ini ? "true" : undefined}
                className={`m3-state flex min-h-12 flex-col items-center justify-center gap-[5px] rounded-md text-[0.6875rem] max-[339px]:text-[0.625rem] min-[380px]:text-[0.75rem] ${ini ? "font-bold text-[#101E38]" : "font-semibold text-[#526078]"}`}
              >
                {/* Rancangan: ikon dan label aktif emas di atas putih (kontras 1,6:1).
                    Diganti pil emas di belakang ikon, label navy. */}
                <IkonTabBawah tab={tab.id} aktif={ini} isi={<Ikon size={20} />} isiAktif={<Ikon size={20} weight="fill" />} />
                {tab.labelPendek}
                {tab.id === "info" && !ini ? <LencanaBelum jumlah={infoBelum} label={infoBelumLabel} className="absolute left-1/2 top-0 ml-1 ring-white" /> : null}
                {tab.id !== halaman ? <PenandaTab tab={tab.id} /> : null}
              </Link>
            </li>,
          ];
        })}
      </ul>
    </nav>
  );
}

/** Sapaan (frame "Personal greeting"; ponsel: "Personal greeting" 30/800). */
export function SapaanHorizon({
  alis,
  judul,
  judulPonsel,
  catatan,
  catatanPonsel = false,
  alisDiCatatan = false,
  sapaan = false,
  kembali = null,
}: {
  alis: string;
  judul: string;
  judulPonsel: string;
  catatan: string;
  catatanPonsel?: boolean;
  /**
   * Laptop berlayar pendek menyembunyikan alis; alis yang berisi fakta (tanggal
   * dan fase di Beranda, rentang tanggal dan tempat di Susunan acara) ikut di
   * depan catatan di sana, jadi tidak hilang.
   */
  alisDiCatatan?: boolean;
  /**
   * Judul berisi nama peserta (Beranda): panjangnya tidak tentu, jadi lebih kecil
   * dari judul tab (24/32 di ponsel, 36/44 di desktop) dan selebar kolom utama
   * (790 px), supaya nama lengkap paling banyak dua baris dan tidak selebar layar.
   */
  sapaan?: boolean;
  /**
   * Ponsel: halaman yang dibuka dari Menu (bukan dari bilah bawah) punya tautan
   * kembali ke Menu. `semua`: halaman bagian dari tab lain (Outfit di bawah
   * Susunan acara); tautannya tampil di semua lebar, di tempat alis.
   */
  kembali?: { href: string; label: string; semua?: boolean; tab?: string } | null;
}) {
  // Laptop berlayar pendek (1280×588): judul 30 px tanpa alis, supaya isi tab
  // naik ke layar pertama (U-11). Berlaku di semua tab, jadi tinggi kepala tetap sama.
  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 pt-6 md:px-16 md:pb-7 md:pt-12 lg:short:pb-5 lg:short:pt-6">
      {kembali ? (
        <Link
          href={kembali.href}
          // `semua` dari 768 px: tetap 48 px untuk jari, tetapi margin negatif
          // membuatnya setinggi alis yang digantikannya, jadi judul tiap tab sejajar.
          // Laptop pendek tanpa alis: disembunyikan, tab yang menyala di bilah atas
          // sudah menjadi jalan kembali.
          // `semua`: 48 px untuk jari, tetapi kotak marginnya 20 px, setinggi alis yang
          // digantikannya (margin bawah negatif menyatu dengan margin atas judul), jadi
          // judul tiap tab sejajar di semua lebar.
          className={`m3-state -ml-2 min-h-12 items-center gap-2 rounded-md px-2 text-[14px] font-semibold ${kembali.semua ? "-mb-3 -mt-4 flex w-fit md:-mb-[11px] md:-mt-[17px] lg:short:hidden" : "-mt-3 mb-1 inline-flex lg:hidden"}`}
          style={{ color: BIRU }}
        >
          <ArrowLeft size={20} aria-hidden />
          {kembali.label}
          {kembali.tab ? <PenandaTab tab={kembali.tab} /> : null}
        </Link>
      ) : null}
      {/* Alis kalimat biasa 13-14 px (U-25), juga di ponsel: tanggal dan fase di
          Beranda, rentang tanggal dan tempat di Susunan acara. Tautan kembali
          menggantikan tempatnya, jadi tinggi kepala tiap tab tetap sama. */}
      <p
        className={`text-[0.8125rem] font-medium leading-5 [overflow-wrap:anywhere] md:text-[0.875rem] lg:short:hidden ${kembali ? (kembali.semua ? "hidden" : "hidden md:block") : ""}`}
        style={{ color: LABEL }}
      >
        {alis}
      </p>
      <h1
        className={`mt-1 whitespace-pre-line text-balance font-extrabold [overflow-wrap:anywhere] md:mt-[14px] lg:short:mt-0 ${sapaan ? "max-w-[790px] text-[24px] leading-8 md:text-[36px] md:leading-[44px] lg:short:text-[28px] lg:short:leading-9" : "text-[30px] leading-[1.15] md:text-[48px] md:leading-[1.2] lg:short:text-[30px]"}`}
        style={{ color: TINTA }}
      >
        <span className="lg:hidden">{judulPonsel}</span>
        <span className="hidden lg:inline">{judul}</span>
      </h1>
      {catatan ? (
        <p className={`text-[16px] leading-6 md:mt-[14px] md:block lg:short:mt-2 ${catatanPonsel ? "mt-1.5 text-[14px] leading-5 md:text-[16px] md:leading-6" : "mt-[14px] hidden"}`} style={{ color: REDUP }}>
          {alisDiCatatan && alis ? <span className="hidden lg:short:inline">{`${alis} ${SEPARATOR} `}</span> : null}
          {catatan}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `lebar`: nilai panjang (nama hotel). Di ponsel satu baris penuh dengan teks
 * lebih kecil; di desktop mengambil sisa lebar baris, paling sempit 9rem
 * (fakta lain turun ke baris kedua bila tidak muat).
 * `pendek`: nilai singkat (bus, nomor kamar) yang tidak boleh dipatahkan di
 * tengah kata, mis. "1208" menjadi "12/08" saat baris desktop sempit.
 */
export type FaktaPass = {
  label: string;
  nilai: string;
  ponsel: boolean;
  lebar?: boolean;
  pendek?: boolean;
  /**
   * Beberapa nilai di bawah satu label, mis. dua hotel peserta yang pindah
   * hotel: nama tebal dan keterangan redup (tanggal, kamar) per baris.
   */
  daftar?: { judul: string; catatan: string | null }[];
};

/** Isi fakta `daftar`: satu baris per nilai, nama lalu keterangannya. */
function DaftarFakta({ daftar, besar }: { daftar: NonNullable<FaktaPass["daftar"]>; besar: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {daftar.map((isi, urut) => (
        <li key={urut} className="flex flex-col gap-1">
          <span className={`${besar} font-bold leading-[1.26] [overflow-wrap:anywhere]`}>{isi.judul}</span>
          {isi.catatan ? (
            <span className="text-[14px] font-normal leading-5" style={{ color: REDUP_NAVY }}>
              {isi.catatan}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Kartu "Personal journey pass": KV, rute, dan fakta peserta. */
export function PassHorizon({
  kv,
  label,
  tanggalPendek,
  tanggalPanjang,
  dari,
  ke,
  fakta,
  qr,
  detail = null,
}: {
  kv: string | null;
  label: string;
  tanggalPendek: string | null;
  tanggalPanjang: string | null;
  dari: string | null;
  ke: string;
  fakta: FaktaPass[];
  /**
   * Sobekan tiket berisi QR kehadiran (pola boarding pass / Wallet): desktop di
   * kanan kartu, ponsel di bawahnya. Seluruh sobekan membuka QR layar penuh.
   */
  qr?: { href: string; label: string; perbesar: string; kode: ReactNode } | null;
  /**
   * Fakta pass (hotel, bus, kamar) sebagai satu tautan ke halaman Perjalanan,
   * dengan petunjuk yang terlihat (U-16). Sobekan QR tetap tautan sendiri.
   */
  detail?: { href: string; label: string } | null;
}) {
  const faktaPonsel = fakta.filter((item) => item.ponsel);
  // Tiga fakta pendek (kereta: berangkat, gerbong, kursi) muat satu baris di 360 px.
  const tigaPendek = faktaPonsel.length === 3 && faktaPonsel.every((item) => item.pendek);
  const isiSobekan = qr ? (
    <>
      <span className="size-[72px] shrink-0 rounded-xl bg-white p-1.5 xl:size-[148px] xl:rounded-2xl xl:p-2.5">{qr.kode}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 xl:flex-none xl:items-center xl:text-center">
        <span className="text-[15px] font-bold">{qr.label}</span>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--hz-emas)]">
          <ArrowsOut size={14} weight="bold" aria-hidden />
          {qr.perbesar}
        </span>
      </span>
    </>
  ) : null;
  // Di bawah 1024 px QR ada di bilah bawah, jadi sobekannya hanya untuk layar tanpa bilah bawah (v5T1l).
  const kelasSobekan =
    "m3-state group relative flex items-center gap-4 border-t border-dashed border-[#405272] px-5 py-4 focus-visible:outline-offset-[-4px] max-lg:hidden md:px-[30px] xl:w-[210px] xl:shrink-0 xl:flex-col xl:justify-center xl:gap-3 xl:border-l xl:border-t-0 xl:px-6 xl:py-[30px]";
  return (
    <section aria-label={label} className={`overflow-hidden rounded-[16px] bg-[var(--hz-navy)] text-white ${CINCIN_NAVY}`}>
      {kv ? (
        // Hiasan: KV acara, dipotong tengah seperti rancangan (cover). Laptop berlayar pendek: 145 px (U-11).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={kv} alt="" aria-hidden decoding="async" className="h-[145px] w-full select-none object-cover md:h-[200px] lg:short:h-[145px]" />
      ) : null}
      {/* Sobekan QR di samping rute hanya bila kartunya cukup lebar (xl); di bawahnya rute tetap utuh. */}
      <div className="xl:flex">
      <div className="flex min-w-0 flex-col gap-4 p-5 md:gap-6 md:p-[30px] xl:flex-1">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.8125rem] font-semibold text-[var(--hz-emas)]">{label}</p>
          {tanggalPendek ? <p className="hidden text-[0.8125rem] font-semibold md:block">{tanggalPendek}</p> : null}
        </div>
        {/* Ponsel: satu baris "Gambir → Yogyakarta" dan tanggal di bawahnya. */}
        <div className="md:hidden">
          <p className="text-[22px] font-extrabold leading-[1.26] [overflow-wrap:anywhere]">{dari ? `${dari} → ${ke}` : ke}</p>
          {tanggalPanjang ? (
            <p className="mt-4 text-[13px]" style={{ color: REDUP_NAVY }}>
              {tanggalPanjang}
            </p>
          ) : null}
        </div>
        <div className={`hidden items-center gap-6 md:flex ${dari ? "justify-between" : ""}`}>
          {dari ? (
            <>
              <p className="min-w-0 text-[35px] font-extrabold leading-[1.26] [overflow-wrap:anywhere]">{dari}</p>
              <Train size={28} weight="bold" aria-hidden className="shrink-0 text-[var(--hz-emas)]" />
            </>
          ) : null}
          <p className={`min-w-0 text-[35px] font-extrabold leading-[1.26] [overflow-wrap:anywhere] ${dari ? "text-right" : ""}`}>{ke}</p>
        </div>
        {fakta.length > 0 || detail ? (
          // Seluruh bidang fakta mengetuk ke Perjalanan lewat tautan "Detail perjalanan"
          // (area ketuk diregangkan dengan ::before), jadi fakta tetap dibaca sebagai daftar.
          <div className="relative flex flex-col gap-4 md:gap-5">
            {fakta.length > 0 ? (
              <dl className="hidden flex-wrap justify-between gap-x-6 gap-y-4 border-t pt-5 md:flex" style={{ borderColor: GARIS_NAVY }}>
                {fakta.map((item) => (
                  <div key={item.label} className={`flex flex-col gap-2 ${item.pendek ? "max-w-[14rem] shrink-0" : item.lebar ? "min-w-[9rem] flex-[1_1_12rem]" : "min-w-0"}`}>
                    <dt className="text-[0.75rem]" style={{ color: REDUP_NAVY }}>
                      {item.label}
                    </dt>
                    {item.daftar ? (
                      <dd>
                        <DaftarFakta daftar={item.daftar} besar="text-[16px]" />
                      </dd>
                    ) : (
                      <dd className={`text-[16px] font-bold ${item.pendek ? "[overflow-wrap:break-word]" : "[overflow-wrap:anywhere]"}`}>{item.nilai}</dd>
                    )}
                  </div>
                ))}
              </dl>
            ) : null}
            {faktaPonsel.length > 0 ? (
              <dl className={`border-t pt-4 md:hidden ${tigaPendek ? "flex justify-between gap-4" : "grid grid-cols-2 gap-7"}`} style={{ borderColor: GARIS_NAVY }}>
                {faktaPonsel.map((item) => (
                  <div key={item.label} className={`flex min-w-0 flex-col gap-[5px] ${item.lebar ? "col-span-2" : ""}`}>
                    <dt className="text-[0.75rem]" style={{ color: REDUP_NAVY }}>
                      {item.label}
                    </dt>
                    {item.daftar ? (
                      <dd>
                        <DaftarFakta daftar={item.daftar} besar="text-[18px]" />
                      </dd>
                    ) : (
                      <dd className={`${item.lebar || tigaPendek ? "text-[18px] font-bold" : "text-[26px] font-extrabold"} leading-[1.26] ${tigaPendek ? "whitespace-nowrap" : "[overflow-wrap:anywhere]"}`}>{item.nilai}</dd>
                    )}
                  </div>
                ))}
              </dl>
            ) : null}
            {detail ? (
              <Link
                href={detail.href}
                className="-my-2 flex min-h-12 items-center justify-between gap-3 rounded-md text-[14px] font-semibold text-[var(--hz-emas)] before:absolute before:inset-0 before:content-[''] focus-visible:outline-offset-4"
              >
                {detail.label}
                <CaretRight size={18} aria-hidden className="shrink-0" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      {qr && isiSobekan ? (
        <PemicuQr id="pemicu-qr-pass" href={qr.href} className={kelasSobekan}>
          {isiSobekan}
        </PemicuQr>
      ) : null}
      </div>
    </section>
  );
}

/** Isi tombol QR emas (dibungkus PemicuQr oleh pemanggil supaya fokus kembali). */
export function IsiTombolQr({ label }: { label: string }) {
  return (
    <>
      <QrCode size={22} aria-hidden className="shrink-0" />
      {label}
    </>
  );
}

export { PIL_EMAS as TOMBOL_QR_HORIZON };

/** Desktop: "Three chapter progress", satu kolom per hari, menuju tab Jadwal. */
export function BabHorizon({ bab }: { bab: { label: string; judul: string; href: string }[] }) {
  if (bab.length === 0) return null;
  return (
    <ol className="hidden gap-6 md:flex" style={{ color: TINTA }}>
      {bab.map((item) => (
        <li key={item.href} className="min-w-0 flex-1 border-t-2 border-[#AEBBD3]">
          <Link href={item.href} className="m3-state flex min-h-12 flex-col gap-[10px] rounded-b-md py-5">
            <span className="text-[11px] font-bold" style={{ color: LABEL }}>
              {item.label}
            </span>
            <span className="text-[20px] font-extrabold leading-[1.26] [overflow-wrap:anywhere]">{item.judul}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * Daftar hari di kiri halaman Jadwal (layar lebar): pola bab yang sama dengan
 * BabHorizon di Beranda, disusun tegak dan menempel saat digulir, supaya
 * semua hari terlihat sekaligus tanpa tab yang harus digeser.
 */
export function HariJadwalHorizon({ hari, aria }: { hari: { label: string; judul: string; href: string; aktif: boolean }[]; aria: string }) {
  return (
    // pudar-bawah-gulir: tepi bawah memudar selama masih ada hari di bawah (U-06).
    <nav aria-label={aria} className="pudar-bawah-gulir sticky top-[118px] -my-1 -ml-6 -mr-1 hidden max-h-[calc(100dvh-134px)] scroll-py-1 self-start overflow-y-auto p-1 print:max-h-none print:overflow-visible lg:block" style={{ color: TINTA }}>
      <GulirHariAktif />
      <ol className="flex flex-col gap-1">
        {hari.map((item) => (
          <li key={item.href}>
            {/* Hari terpilih memakai kartu putih yang sama dengan kartu acara di kanannya. */}
            <Link
              href={item.href}
              aria-current={item.aktif ? "page" : undefined}
              className={`m3-state flex min-h-12 flex-col gap-1.5 rounded-[16px] px-5 py-4 ${item.aktif ? "bg-white shadow-[0_1px_2px_rgb(16_24_40/0.06)] ring-1 ring-inset ring-[#6F7C94]" : ""}`}
            >
              <span className="text-[0.8125rem] font-semibold" style={{ color: item.aktif ? BIRU : LABEL }}>
                {item.label}
              </span>
              <span className={`text-[16px] leading-6 text-balance [overflow-wrap:anywhere] ${item.aktif ? "font-semibold" : "font-medium"}`} style={item.aktif ? undefined : { color: REDUP }}>
                {item.judul}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Kepala tab selain Beranda: pita navy pendek di bawah bilah, teks putih. */
export function PitaKepalaHorizon({ children }: { children: ReactNode }) {
  return (
    <div className={`bg-[var(--hz-navy)] text-white ${CINCIN_NAVY}`}>
      <div className="mx-auto w-full max-w-[1440px] px-6 pb-10 pt-4 md:px-16 md:pb-14 md:pt-8">{children}</div>
    </div>
  );
}

/** Chip kecil di kartu Horizon (label bagian, "Baru"): warna aksen dari palet acara. */
export function ChipHorizon({ children, nada = "aksen" }: { children: ReactNode; nada?: "aksen" | "aksi" }) {
  return (
    <span
      className={`inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-bold leading-4 ${
        nada === "aksi" ? "bg-[var(--chip-aksi)] text-[var(--on-chip-aksi)]" : "bg-[var(--chip-aksen)] text-[var(--on-chip-aksen)]"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Kartu Pengumuman di Beranda (U-03): yang belum dibaca lebih dulu dengan chip
 * Baru; yang disematkan cukup disebut ("+1 disematkan") selama ada kabar baru.
 * Rancangan 20 Okt (rxapD): tanpa judul kartu; baris "Pengumuman · waktu"
 * memberi konteks, dan judul pengumumannya menjadi judul kartu.
 */
export function KartuPengumumanHorizon({
  judul,
  label,
  baru,
  item,
  tautan,
  kosong,
}: {
  judul: string;
  /** "Pengumuman", di depan waktu terbitnya. */
  label: string;
  baru: string | null;
  item: { judul: string; isi: string | null; waktu: string } | null;
  tautan: { href: string; label: string } | null;
  kosong: string;
}) {
  return (
    <section aria-labelledby={item ? "pengumuman-isi" : "pengumuman-judul"} className={`${KARTU_HZ} flex flex-col gap-4 ${PAD_KARTU}`} style={{ color: TINTA }}>
      <KepalaKartuHorizon Ikon={Bell} judul={item ? label : judul} idJudul="pengumuman-judul" meta={item?.waktu} />
      {item ? (
        <div className="flex flex-col gap-1">
          {baru ? (
            <p className="mb-1 flex">
              <ChipHorizon>
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {baru}
              </ChipHorizon>
            </p>
          ) : null}
          <p id="pengumuman-isi" className={KELAS_JUDUL_ISI}>
            {item.judul}
          </p>
          {item.isi ? (
            <p className={`line-clamp-3 whitespace-pre-line ${KELAS_KET}`} style={{ color: REDUP }}>
              {item.isi}
            </p>
          ) : null}
        </div>
      ) : (
        <p className={KELAS_KET} style={{ color: REDUP }}>
          {kosong}
        </p>
      )}
      {item && tautan ? (
        <Link href={tautan.href} className={`m3-state -mx-2 rounded-md px-2 ${KELAS_TAUTAN}`} style={{ color: BIRU }}>
          {tautan.label}
          <CaretRight size={16} aria-hidden className="shrink-0" />
          <PenandaTab tab="info" />
        </Link>
      ) : null}
    </section>
  );
}

/** Nomor telepon panitia untuk tombol Telepon dan WhatsApp. */
/** Tombol pil bergaris 48 px: kontak (panitia, kru bus, darurat) dan kalender kereta. */
const PIL_KONTAK = "m3-state inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold";
const GAYA_PIL_KONTAK = { color: BIRU, borderColor: "#C9D1DE" };

export type KontakPanitiaHorizon = { tel: string | null; wa: string | null; email: string | null };

/**
 * Tombol kontak panitia (U-07), bentuknya sama dengan tombol kru bus: pil
 * bergaris 48 px. WhatsApp hanya untuk nomor ponsel yang terbaca; tanpa nomor,
 * email panitia sebagai cadangan.
 */
export function TombolKontakHorizon({ kontak, label }: { kontak: KontakPanitiaHorizon; label: { call: string; whatsapp: string; email: string } }) {
  const kelas = PIL_KONTAK;
  const gaya = GAYA_PIL_KONTAK;
  return (
    <div className="flex flex-wrap gap-2">
      {kontak.tel ? (
        <a href={`tel:${kontak.tel}`} className={kelas} style={gaya}>
          <Phone size={18} weight="bold" aria-hidden />
          {label.call}
        </a>
      ) : null}
      {kontak.wa ? (
        <a href={kontak.wa} target="_blank" rel="noreferrer noopener" className={kelas} style={gaya}>
          <WhatsappLogo size={18} weight="bold" aria-hidden />
          {label.whatsapp}
        </a>
      ) : null}
      {!kontak.tel && kontak.email ? (
        <a href={`mailto:${kontak.email}`} className={kelas} style={gaya}>
          <EnvelopeSimple size={18} weight="bold" aria-hidden />
          {label.email}
        </a>
      ) : null}
    </div>
  );
}

/**
 * Kartu "Butuh bantuan?" (U-07): selalu di tempat yang sama di Beranda dan
 * Perjalanan. `tautan`: ke kartu darurat di Menu (E-03), bila panitia membuatnya.
 */
export function KartuBantuanHorizon({
  alis,
  judul,
  catatan,
  kontak,
  label,
  tautan = null,
}: {
  alis: string;
  judul: string;
  catatan: string;
  kontak: KontakPanitiaHorizon;
  label: { call: string; whatsapp: string; email: string };
  tautan?: { href: string; label: string; tab: string } | null;
}) {
  return (
    <section aria-label={judul} className={`${KARTU_HZ} flex flex-col gap-4 ${PAD_KARTU}`} style={{ color: TINTA }}>
      <KepalaKartuHorizon Ikon={Phone} judul={alis} />
      <div className="flex flex-col gap-1">
        <p className={KELAS_JUDUL_ISI}>{judul}</p>
        <p className={KELAS_KET} style={{ color: REDUP }}>
          {catatan}
        </p>
      </div>
      <TombolKontakHorizon kontak={kontak} label={label} />
      {tautan ? (
        <Link href={tautan.href} className={`m3-state -mx-2 rounded-md px-2 ${KELAS_TAUTAN}`} style={{ color: BIRU }}>
          {tautan.label}
          <CaretRight size={16} aria-hidden className="shrink-0" />
          <PenandaTab tab={tautan.tab} />
        </Link>
      ) : null}
    </section>
  );
}

/**
 * Kartu Bantuan di Beranda (keputusan Mas 28 Okt): pintu ke dua daftar di Profil,
 * Kontak panitia (Event settings) dan Kontak darurat (Participant area), seperti
 * baris "Get help" di halaman trip Airbnb. Tidak menelepon langsung: dengan lima
 * kontak, peserta memilih orangnya di Profil.
 */
export function KartuBantuanBeranda({ judul, baris }: { judul: string; baris: BarisProfil[] }) {
  return (
    <section aria-label={judul} className={`${KARTU_HZ} flex flex-col gap-2 ${PAD_KARTU}`} style={{ color: TINTA }}>
      <KepalaKartuHorizon Ikon={Question} judul={judul} />
      <DaftarProfil baris={baris} />
    </section>
  );
}

/**
 * Pilihan hari Jadwal di ponsel dan tablet (U-06): satu chip per TANGGAL, dua
 * baris ("Jum" / "6 Nov"), jadi empat hari muat utuh di layar 390. Hari lebih
 * banyak bergeser mendatar, dan hari terpilih digulir ke tengah.
 */
export function ChipTanggalHorizon({ hari, aria }: { hari: { atas: string; bawah: string | null; href: string; aktif: boolean }[]; aria: string }) {
  return (
    <nav aria-label={aria} className="-mx-6 overflow-x-auto px-6 pb-1 md:-mx-16 md:px-16 lg:hidden">
      <GulirChipAktif />
      <ul className="flex gap-2">
        {hari.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.aktif ? "page" : undefined}
              className={`m3-state flex min-h-14 min-w-[74px] flex-col items-center justify-center rounded-[16px] px-3 py-1.5 text-center ${
                item.aktif ? "bg-[var(--hz-emas)] text-[var(--hz-on-emas)]" : "bg-white text-[#1A2333] shadow-[inset_0_0_0_1px_#E6E9EE]"
              }`}
            >
              <span className="text-[12px] font-medium leading-4">{item.atas}</span>
              {item.bawah ? <span className="text-[16px] font-bold leading-6">{item.bawah}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Kontrol segmen bagian di satu hari (U-01): "Batch 1 | Batch 2". Tiap segmen
 * tautan ke bagian itu, jadi Kembali dan tautan yang dibagikan tetap bekerja.
 */
export function SegmenBagianHorizon({ bagian, aria }: { bagian: { label: string; href: string; aktif: boolean }[]; aria: string }) {
  return (
    <nav aria-label={aria} className="max-w-full overflow-x-auto">
      <ul className="inline-flex gap-1 rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_#E6E9EE]">
        {bagian.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.aktif ? "page" : undefined}
              className={`m3-state inline-flex min-h-12 items-center whitespace-nowrap rounded-full px-5 text-[14px] leading-5 ${
                item.aktif ? "bg-[var(--hz-emas)] font-bold text-[var(--hz-on-emas)]" : "font-medium text-[#1A2333]"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type BarisDaruratHorizon = {
  judul: string;
  isi: string | null;
  href: string | null;
  luar: boolean;
  /** Kontak dari Participant area (E-03): nomor tampil sebagai teks, tombolnya di bawah. */
  kontak?: { nomor: string | null; tel: string | null; wa: string | null; peta: string | null };
  /** Ikon jenis kontak darurat (rumah sakit, polisi, ...); lihat ikonJenisDarurat. */
  Ikon?: typeof Train | null;
};

/** Ikon tiap jenis kontak darurat. Satu kontak berjenis = semua baris kartu berikon (tanpa jenis = Telepon), agar nama sejajar. */
export function ikonJenisDarurat(jenis: string | null): typeof Train {
  return jenis === "hospital" ? Hospital : jenis === "police" ? PoliceCar : jenis === "fire" ? FireTruck : jenis === "ambulance" ? Ambulance : jenis === "hotel" ? Bed : jenis === "other" ? Siren : Phone;
}

/**
 * Kartu "Darurat dan bantuan" di Menu (E-03, pola halaman kontak darurat
 * aplikasi rapat perusahaan): isi dari blok peserta pilihan panitia. Tiap
 * baris bisa diketuk: tautannya sendiri bila ada, atau nomor ponsel di dalam
 * teksnya (tel:). Tetap di tempat yang sama, tepat di bawah Perjalanan.
 */
export function KartuDaruratHorizon({
  judul,
  isi,
  baris,
  label = null,
  id = "darurat",
  Ikon = Lifebuoy,
  warna = "#B42318",
  kelompok = null,
}: {
  judul: string;
  isi: string | null;
  baris: BarisDaruratHorizon[];
  label?: { call: string; whatsapp: string; map: string } | null;
  /** Kartu kontak panitia memakai susunan yang sama; null = kepala navy. */
  id?: string;
  Ikon?: typeof Lifebuoy;
  warna?: string | null;
  /** Kontak darurat berjenis: dikelompokkan dengan subjudul jenis; `baris` diabaikan. */
  kelompok?: { judul: string; Ikon: typeof Lifebuoy; baris: BarisDaruratHorizon[] }[] | null;
}) {
  // Daftar kontak memakai jarak 16 px DESIGN.md; baris blok lama tetap seperti dulu (12 px + 4 px di bawah kepala).
  const adaKontak = baris.some((item) => item.kontak);
  // Desktop: kartu selebar halaman, kontak dalam dua kolom supaya 12 kontak tidak memanjang.
  const daftar = (isiBaris: BarisDaruratHorizon[], duaKolom: boolean) => (
    <ul className={adaKontak ? `flex flex-col ${duaKolom ? "lg:grid lg:grid-cols-2 lg:gap-x-8" : ""}` : "-mx-2"}>
      {isiBaris.map((item, index) => {
        const dalam = (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.judul}</span>
              {item.isi ? (
                <span className="whitespace-pre-line text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                  {item.isi}
                </span>
              ) : null}
            </span>
            {item.href ? <CaretRight size={18} aria-hidden className="shrink-0" style={{ color: LABEL }} /> : null}
          </>
        );
        const kontak = item.kontak;
        if (kontak) {
          // Baris daftar M3 dua-tiga baris: nama, nomor, catatan di kiri; tombol ikon
          // 48 px di kanan (pola daftar kontak Google Phone dan Uber Safety Toolkit).
          const aksi = label
            ? [
                kontak.tel ? { href: `tel:${kontak.tel}`, Ikon: Phone, teks: label.call, luar: false, hijau: false } : null,
                kontak.wa ? { href: kontak.wa, Ikon: WhatsappLogo, teks: label.whatsapp, luar: true, hijau: true } : null,
                kontak.peta ? { href: kontak.peta, Ikon: MapPin, teks: label.map, luar: true, hijau: false } : null,
              ].filter((x) => x !== null)
            : [];
          return (
            <li key={`${index}-${item.judul}`} className={`flex items-start gap-3 border-[#E6E8EC] py-3 first:pt-0 last:pb-0 [&+&]:border-t ${duaKolom ? "lg:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(2)]:pt-0" : ""}`}>
              {item.Ikon ? (
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FCEBEA] text-[#B42318]">
                  <item.Ikon size={20} />
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.judul}</span>
                {kontak.nomor ? (
                  <span className="text-[14px] font-medium leading-5 tabular-nums [overflow-wrap:anywhere]">{kontak.nomor}</span>
                ) : null}
                {item.isi ? (
                  <span className="whitespace-pre-line text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                    {item.isi}
                  </span>
                ) : null}
              </span>
              {aksi.length > 0 ? (
                // Area ketuk 48 px, lingkaran 40 px: tepi lingkaran sejajar padding kartu.
                <span className="-my-1 -mr-1 flex shrink-0">
                  {aksi.map(({ href, Ikon, teks, luar, hijau }) => (
                    <a
                      key={teks}
                      href={href}
                      {...(luar ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                      aria-label={`${teks}: ${item.judul}`}
                      title={teks}
                      className="group flex size-12 items-center justify-center rounded-full"
                    >
                      <span className={`m3-state flex size-10 items-center justify-center rounded-full ${hijau ? "bg-[#E7F4EC] text-[#1E7B45] [--m3-state-color:#1E7B45]" : "bg-[#EEF1F6] text-[#101E38]"}`}>
                        <Ikon size={20} weight="bold" aria-hidden />
                      </span>
                    </a>
                  ))}
                </span>
              ) : null}
            </li>
          );
        }
        return (
          <li key={`${index}-${item.judul}`} className="border-[#E6E8EC] [&+&]:border-t">
            {item.href ? (
              <a href={item.href} {...(item.luar ? { target: "_blank", rel: "noreferrer noopener" } : {})} className="m3-state flex min-h-14 items-center gap-4 rounded-[12px] px-2 py-2">
                {dalam}
              </a>
            ) : (
              <div className="flex min-h-14 items-center gap-4 px-2 py-2">{dalam}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <section id={id} aria-label={judul} className={`${KARTU_HZ} flex scroll-mt-24 flex-col ${adaKontak ? "gap-4" : "gap-3"} ${PAD_KARTU} lg:scroll-mt-32`} style={{ color: TINTA }}>
      <div className={adaKontak ? "" : "mb-1"}>
        <KepalaKartuHorizon Ikon={Ikon} judul={judul} warna={warna ?? TINTA} />
      </div>
      {isi ? (
        <p className={`whitespace-pre-line ${KELAS_KET}`} style={{ color: REDUP }}>
          {isi}
        </p>
      ) : null}
      {kelompok && kelompok.length > 0 ? (
        // Dikelompokkan per jenis (Mas 28 Okt); desktop: kelompok mengalir dalam dua kolom.
        <div className="flex flex-col gap-6 lg:block lg:columns-2 lg:gap-x-8">
          {kelompok.map((grup) => (
            <section key={grup.judul} aria-label={grup.judul} className="flex break-inside-avoid flex-col gap-3 lg:mb-6 lg:last:mb-0">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold leading-5" style={{ color: LABEL }}>
                <grup.Ikon size={18} aria-hidden style={{ color: warna ?? TINTA }} />
                {grup.judul}
              </h3>
              {daftar(grup.baris, false)}
            </section>
          ))}
        </div>
      ) : baris.length > 0 ? (
        daftar(baris, adaKontak)
      ) : null}
    </section>
  );
}

export const LATAR_PORTAL_HORIZON = KREM;

export type LegKereta = {
  kunci: string;
  arah: string;
  judul: string;
  baris: string | null;
  jam: string | null;
  gerbong: string | null;
  kursi: string | null;
  kode: string | null;
  /** Stasiun dan jam terpisah untuk bentuk tiket; tanpa keduanya kartu memakai `judul`. */
  dari?: string | null;
  ke?: string | null;
  berangkat?: string | null;
  tiba?: string | null;
  /** Berkas kalender leg ini (E-07): pengingatnya berbunyi walau tanpa sinyal. */
  kalender?: { href: string; label: string } | null;
  /** Leg yang sudah tiba: dilipat jadi satu baris, mis. "Berangkat · Kam, 5 Nov · selesai". */
  lipat?: { label: string; catatan: string | null } | null;
};

/**
 * Kartu "Tiket kereta" di bawah pass: satu blok per arah (berangkat, pulang)
 * dengan gerbong dan kursi sebesar fakta pass, lalu kode booking. Hanya tampil
 * bila peserta punya tiket (train_tickets).
 */
export function TiketKeretaHorizon({ judul, label, leg }: { judul: string; label: { gerbong: string; kursi: string; kode: string; jumlah: (n: number) => string; selesai: string; ke: string }; leg: LegKereta[] }) {
  const pergi = leg.filter((item) => !item.lipat).length;
  return (
    // id "kereta": baris kereta di Beranda membuka Perjalanan tepat di kartu ini (U-17), jarak setinggi bilah atas.
    <section id="kereta" aria-label={judul} className={`${GARIS_KARTU} flex scroll-mt-24 flex-col gap-4 rounded-[16px] bg-white p-4 md:p-6 lg:scroll-mt-32`} style={{ color: TINTA }}>
      <KepalaKartuHorizon Ikon={Train} judul={judul} meta={pergi > 0 ? label.jumlah(pergi) : label.selesai} nadaMeta={pergi > 0 ? "redup" : "hijau"} />
      <div className="flex flex-col xl:grid xl:grid-cols-2 xl:items-start xl:gap-8">
      {leg.map((item, index) => {
        const kursi = [item.gerbong ? `${label.gerbong} ${item.gerbong}` : null, item.kursi ? `${label.kursi} ${item.kursi}` : null].filter(Boolean).join(` ${SEPARATOR} `);
        const blok = (
          <div key={item.kunci} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className={KELAS_ALIS} style={{ color: BIRU }}>
                {item.arah}
              </p>
              <p className={`flex flex-wrap items-center gap-x-2 ${KELAS_JUDUL_ISI}`}>
                {item.dari && item.ke ? (
                  <>
                    {item.dari}
                    <ArrowRight size={18} weight="bold" aria-label={label.ke} style={{ color: REDUP }} />
                    {item.ke}
                  </>
                ) : (
                  item.judul
                )}
              </p>
              <p className={KELAS_KET} style={{ color: REDUP }}>
                {item.jam ? <span className="whitespace-nowrap font-semibold" style={{ color: TINTA }}>{item.jam}</span> : null}
                {item.jam && item.baris ? ` ${SEPARATOR} ` : null}
                {item.baris}
              </p>
            </div>
            {kursi || item.kode ? (
              <div className={KELAS_STRIP} style={{ background: LATAR_STRIP }}>
                {kursi ? <p className="text-[16px] font-semibold leading-6">{kursi}</p> : null}
                {item.kode ? (
                  <p className="text-[14px] leading-5" style={{ color: REDUP }}>
                    {label.kode} <span className="font-semibold tracking-[1px]" style={{ color: TINTA }}>{item.kode}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {item.kalender ? (
              <a href={item.kalender.href} className={`${KELAS_TAUTAN} gap-2`} style={{ color: BIRU }}>
                <CalendarPlus size={18} weight="bold" aria-hidden />
                {item.kalender.label}
              </a>
            ) : null}
          </div>
        );
        const tepi = index > 0 ? "mt-4 border-t pt-4 xl:mt-0 xl:border-t-0 xl:pt-0" : "";
        return (
          <div key={item.kunci} className={tepi} style={{ borderColor: "#E6E8EC" }}>
            {item.lipat ? (
              <LipatanHorizon dalam label={item.lipat.label} judul={item.judul} catatan={item.lipat.catatan}>
                {blok}
              </LipatanHorizon>
            ) : (
              blok
            )}
          </div>
        );
      })}
      </div>
    </section>
  );
}


/** Kartu putih halaman Perjalanan: kepala berikon dengan keterangan di kanan, lalu isi sebagai kalimat ringkas. */
export function KartuInfoHorizon({
  judul,
  Ikon,
  nama,
  alamat,
  tautan,
  id,
  meta,
  baris,
  tanpaKepala = false,
  children,
}: {
  judul: string;
  Ikon: typeof Train;
  /** Keterangan di kanan kepala (tanggal, jumlah, keadaan). */
  meta?: { teks: string; nada?: "redup" | "hijau" } | null;
  /** Isi sebagai kalimat ringkas, bukan kisi label/nilai. */
  baris?: string[];
  /** Tujuan chip lompat di Perjalanan. */
  id?: string;
  nama?: string | null;
  alamat?: string | null;
  tautan?: { href: string; label: string } | null;
  /**
   * Tema Gathering Trip: kepala bagian di luar kartu sudah menyebut jenisnya,
   * jadi kepala kartu tidak diulang; keterangannya menjadi pil di atas isi.
   */
  tanpaKepala?: boolean;
  children?: ReactNode;
}) {
  return (
    <section id={id} aria-label={judul} className={`${GARIS_KARTU} flex flex-col gap-4 rounded-[16px] bg-white p-4 md:p-6`} style={{ color: TINTA }}>
      {!tanpaKepala ? (
        <KepalaKartuHorizon Ikon={Ikon} judul={judul} meta={meta?.teks} nadaMeta={meta?.nada} />
      ) : meta ? (
        <span
          className="-mb-2 inline-flex min-h-6 items-center self-start rounded-full px-2 text-[12px] font-semibold leading-4"
          style={meta.nada === "hijau" ? { background: "#E7F4EC", color: "#1E7B45" } : { background: "#EEF1F6", color: TINTA }}
        >
          {meta.teks}
        </span>
      ) : null}
      <div className="flex flex-col gap-3">
        {nama ? (
          <div className="flex flex-col gap-1">
            <p className={KELAS_JUDUL_ISI}>{nama}</p>
            {alamat ? (
              <p className={KELAS_KET} style={{ color: REDUP }}>
                {alamat}
              </p>
            ) : null}
            {tautan ? (
              <a href={tautan.href} target="_blank" rel="noreferrer noopener" className={KELAS_TAUTAN} style={{ color: BIRU }}>
                {tautan.label}
              </a>
            ) : null}
          </div>
        ) : null}
        {baris && baris.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {baris.map((teks) => (
              <li key={teks} className={KELAS_KET} style={{ color: REDUP }}>
                {teks}
              </li>
            ))}
          </ul>
        ) : null}
        {children}
      </div>
    </section>
  );
}

export type BarisBusHorizon = {
  kunci: string;
  /** "Jum, 6 Nov" dan "14.20" di kolom kiri. */
  tanggal: string | null;
  jam: string | null;
  judul: string;
  /**
   * Kendaraan perjalanan ini, mis. "BUS 11 · AB 1234 CD". Hanya bila peserta
   * naik lebih dari satu kendaraan; satu kendaraan sudah jadi nama kartunya.
   */
  kendaraan?: string | null;
  detail: string[];
  /** Titik kumpul dan tautan petanya (E-12). */
  titikKumpul: string | null;
  peta: { href: string; label: string } | null;
  kru?: ReactNode;
};

/**
 * Perjalanan bus per agenda di kartu Bus (pola daftar perjalanan aplikasi
 * travel): tanggal dan jam di kiri, nama agenda dan rute di kanan, lalu titik
 * kumpul dengan tautan peta (E-12).
 */
export function PerjalananBusHorizon({
  judul,
  baris,
  lewat = [],
  labelLewat,
}: {
  judul: string;
  baris: BarisBusHorizon[];
  /** Perjalanan yang sudah berangkat: dilipat jadi satu baris di atas daftar. */
  lewat?: BarisBusHorizon[];
  labelLewat?: (jumlah: number) => string;
}) {
  if (baris.length === 0 && lewat.length === 0) return null;
  // Kolom kiri memakai skala yang sama dengan isi kartu (alis 12/16, jam 18/24),
  // baris dipisah garis putus dengan jarak 12 px seperti kelompok lain di kartu.
  const daftar = (isi: BarisBusHorizon[], aria?: string) => (
    <ol aria-label={aria} className="flex flex-col">
      {isi.map((item) => (
        <li key={item.kunci} className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 border-b border-dashed py-3 first:pt-0 last:border-b-0 last:pb-0" style={{ borderColor: "#C9D1DE" }}>
          <p className="flex flex-col gap-1">
            {item.tanggal ? (
              <span className={KELAS_ALIS} style={{ color: BIRU }}>
                {item.tanggal}
              </span>
            ) : null}
            {item.jam ? <span className="text-[18px] font-bold leading-6 tabular-nums">{item.jam}</span> : null}
          </p>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.judul}</p>
            {item.kendaraan ? (
              // Label kendaraan per segmen, seperti nomor penerbangan di tiap leg itinerary maskapai.
              <p className="flex w-fit max-w-full items-center gap-1.5 rounded-[8px] px-2 py-1 text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]" style={{ background: LATAR_STRIP }}>
                <Bus size={16} aria-hidden className="shrink-0" />
                {item.kendaraan}
              </p>
            ) : null}
            {item.detail.map((teks) => (
              <p key={teks} className={KELAS_KET} style={{ color: REDUP }}>
                {teks}
              </p>
            ))}
            {item.titikKumpul ? (
              <p className={`flex items-start gap-1.5 ${KELAS_KET}`} style={{ color: REDUP }}>
                <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
                {item.titikKumpul}
              </p>
            ) : null}
            {item.peta ? (
              <a href={item.peta.href} target="_blank" rel="noreferrer noopener" className={KELAS_TAUTAN} style={{ color: BIRU }}>
                {item.peta.label}
                <CaretRight size={16} aria-hidden />
              </a>
            ) : null}
            {item.kru}
          </div>
        </li>
      ))}
    </ol>
  );
  // Judul daftar hanya untuk pembaca layar: kepala kartu sudah berbunyi "Bus · 4 perjalanan".
  return (
    <div className="flex flex-col gap-3 border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "#E6E8EC" }}>
      {lewat.length > 0 ? (
        <LipatanHorizon dalam judul={labelLewat ? labelLewat(lewat.length) : String(lewat.length)}>
          {daftar(lewat, judul)}
        </LipatanHorizon>
      ) : null}
      {baris.length > 0 ? daftar(baris, judul) : null}
    </div>
  );
}

/**
 * Satu baris untuk hal yang sudah lewat di Perjalanan (hotel yang sudah
 * check-out, perjalanan bus yang sudah berangkat, kereta yang sudah tiba),
 * pola aplikasi maskapai untuk penerbangan yang selesai. `<details>` bawaan:
 * bisa dibuka lagi tanpa JavaScript, dan pembaca layar mengumumkan keadaannya.
 * `dalam`: di dalam kartu (latar abu), selain itu kartu sendiri.
 */
export function LipatanHorizon({
  id,
  label,
  judul,
  catatan,
  dalam = false,
  children,
}: {
  id?: string;
  label?: string | null;
  judul: string;
  catatan?: string | null;
  dalam?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} className="group">
      <summary
        className={`m3-state flex min-h-16 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden ${
          dalam ? "rounded-[12px] px-3" : `${KARTU_HZ} px-4 md:px-6`
        }`}
        style={{ color: TINTA, ...(dalam ? { background: "#F3F5F9" } : {}) }}
      >
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: "#E7F4EC", color: "#1E7B45" }}>
          <Check size={18} weight="bold" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {label ? (
            <span className={KELAS_ALIS} style={{ color: LABEL }}>
              {label}
            </span>
          ) : null}
          <span className={KELAS_NILAI}>{judul}</span>
          {catatan ? (
            <span className={KELAS_KET} style={{ color: REDUP }}>
              {catatan}
            </span>
          ) : null}
        </span>
        <CaretDown size={20} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" style={{ color: LABEL }} />
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

/**
 * Kontak kru bus (Logistics > Buses, bila panitia menampilkannya): teks panitia
 * apa adanya, lalu tombol Telepon dan WhatsApp untuk nomor pertama di dalamnya.
 * Tombol 48 px; tanpa nomor yang terbaca hanya teksnya yang tampil.
 */
export function KontakKruHorizon({
  label,
  teks,
  nomor,
  aksi,
}: {
  /** Mis. "Kru bus" di kartu bus utama; null di baris agenda (sudah jelas dari konteks). */
  label: string | null;
  teks: string;
  nomor: { tel: string; wa: string } | null;
  aksi: { call: string; whatsapp: string; callAria: string; whatsappAria: string };
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <p className={KELAS_ALIS} style={{ color: LABEL }}>
          {label}
        </p>
      ) : null}
      <p className="whitespace-pre-line text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: label ? TINTA : REDUP }}>
        {teks}
      </p>
      {nomor ? (
        <div className="mt-1 flex flex-wrap gap-2">
          <a href={`tel:${nomor.tel}`} aria-label={aksi.callAria} className="inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold" style={{ color: BIRU, borderColor: "#C9D1DE" }}>
            <Phone size={18} weight="bold" aria-hidden />
            {aksi.call}
          </a>
          <a href={nomor.wa} target="_blank" rel="noreferrer noopener" aria-label={aksi.whatsappAria} className="inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold" style={{ color: BIRU, borderColor: "#C9D1DE" }}>
            <WhatsappLogo size={18} weight="bold" aria-hidden />
            {aksi.whatsapp}
          </a>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Ringkasan outfit satu hari sebagai satu tautan (pola kartu berkepala M3,
 * "Hours" Google Maps, kartu Airbnb Trips): kepala sebaris (ikon, judul, aksi)
 * lalu tiap outfit satu blok selebar kartu, label waktu di atas nama, dipisah
 * garis tipis. Dulu ikon rata tengah di kiri dan semua isian satu blok teks,
 * jadi baris yang terlipat tidak terbedakan dari outfit berikutnya (23 Okt).
 * `aksi`: teks tautan di kepala; tanpa itu hanya panah. Layar lebar: blok
 * berdampingan.
 */
export function KartuRingkasOutfit({ Ikon, judul, aksi, isian, href, tab, lampu, redup = false }: {
  Ikon: typeof CoatHanger;
  judul: string;
  aksi?: string;
  isian: { kapan: string | null; apa: string }[];
  href: string;
  /** Penanda pindah tab (strip di Susunan acara); tanpa itu tautan di halaman yang sama. */
  tab?: string;
  lampu?: string;
  /** Baris sekunder (Berikutnya): tanpa latar putih. */
  redup?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${GARIS_KARTU} m3-state mt-4 flex flex-col rounded-[16px] p-4 ${redup ? "" : "bg-white"}`}
      style={{ color: TINTA }}
    >
      <span className="flex min-h-6 items-center gap-2">
        <Ikon size={22} weight="bold" aria-hidden className="shrink-0" />
        <span className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${redup ? "text-[14px] font-semibold leading-5" : "text-[16px] font-semibold leading-6"}`} style={redup ? { color: LABEL } : undefined}>
          {judul}
        </span>
        {aksi ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold leading-5" style={{ color: BIRU }}>
            {aksi}
            <CaretRight size={14} aria-hidden />
          </span>
        ) : (
          <CaretRight size={16} aria-hidden className="shrink-0" style={{ color: REDUP }} />
        )}
      </span>
      <span className="flex flex-col xl:flex-row xl:gap-6">
        {isian.map((item, index) => (
          <span key={index} className="mt-3 flex min-w-0 flex-col items-start gap-1 border-t border-[#E6E8EC] pt-3 xl:flex-1">
            {item.kapan ? <LabelWaktuOutfit kapan={item.kapan} kecil /> : null}
            <span className={KELAS_NILAI}>{item.apa}</span>
          </span>
        ))}
      </span>
      {tab ? <PenandaTab tab={tab} lampu={lampu} /> : null}
    </Link>
  );
}

/**
 * Label waktu kartu outfit: penanda tenang (bukan chip, jadi tanpa garis dan
 * panah, karena chip M3 berarti bisa diketuk) supaya "kapan dipakai" terbaca
 * sekilas seperti jam di boarding pass. Diawali jam ("17.30 Gala Dinner", ditulis
 * server untuk isian baris agenda, atau diketik panitia): ikon jam dan jamnya
 * tebal; selain itu ikon kalender ("Sepanjang hari", "Setiap hari", "Malam
 * hari"). Tetap di bawah judul pakaian secara bobot.
 */
function LabelWaktuOutfit({ kapan, kecil = false }: { kapan: string; /** Ringkasan (strip, Berikutnya): 24 px. */ kecil?: boolean }) {
  const jam = /^(\d{1,2}[.:]\d{2})\s+(.+)$/.exec(kapan.trim());
  const Ikon = jam ? Clock : CalendarBlank;
  const Tag = kecil ? "span" : "p";
  return (
    <Tag
      className={
        kecil
          ? "inline-flex min-h-6 items-center gap-1.5 self-start rounded-[6px] bg-[#EEF1F6] px-2 py-1 text-[12px] leading-4 [overflow-wrap:anywhere]"
          : "mb-1 inline-flex min-h-8 items-center gap-1.5 self-start rounded-[8px] bg-[#EEF1F6] px-2 py-1.5 text-[14px] leading-5 [overflow-wrap:anywhere]"
      }
    >
      <Ikon size={kecil ? 14 : 16} weight="bold" aria-hidden className="shrink-0" />
      {jam ? (
        <span>
          <span className="font-bold tabular-nums">{jam[1]}</span>
          <span aria-hidden className="mx-1.5" style={{ color: LABEL }}>
            {SEPARATOR}
          </span>
          <span className="font-semibold">{jam[2]}</span>
        </span>
      ) : (
        <span className="font-bold">{kapan}</span>
      )}
    </Tag>
  );
}

/**
 * Kartu satu outfit (pola "Attire" Zola, "Tonight's Attire" Royal Caribbean):
 * foto contoh bila ada (tanpa kotak kosong bila tidak), label waktu, pakaiannya
 * sebagai judul, catatan redup.
 * `tingkat`: judulnya h3 di bawah judul tanggal (h2); h2 bila kartu langsung di
 * bawah judul halaman (acara tanpa tab Agenda), supaya tidak melompat dari h1 ke h3.
 */
export function KartuOutfitHorizon({ kapan, apa, catatan, foto, pilihan, tingkat = 3, judulFoto, teksFoto, teksPilihan }: {
  kapan: string | null;
  apa: string;
  catatan: string | null;
  foto: string | null;
  /** Pilihan gaya (Agenda > Dress code > Options): menggantikan foto tunggal. */
  pilihan?: OutfitPilihan[];
  tingkat?: 2 | 3;
  /** Judul bilah atas penampil foto (label halaman per acara). */
  judulFoto: string;
  teksFoto: { buka: string; lihat: string; perbesar: string; tutup: string };
  teksPilihan?: { pilih: string; buka: (nama: string) => string; tutup: string; sebelumnya: string; berikutnya: string };
}) {
  const Judul = tingkat === 2 ? "h2" : "h3";
  const teks = (
    <>
      {kapan ? <LabelWaktuOutfit kapan={kapan} /> : null}
      <Judul className={KELAS_JUDUL_ISI}>{apa}</Judul>
      {catatan ? (
        <p className={KELAS_KET} style={{ color: REDUP }}>
          {catatan}
        </p>
      ) : null}
    </>
  );
  if (pilihan && pilihan.length > 0 && teksPilihan) {
    // Beberapa gaya untuk satu agenda (mis. Gala Dinner): teks di atas, lalu
    // pilihan selebar kartu di semua ukuran. Foto tunggal tidak dipakai.
    return (
      <article className={`${KARTU_HZ} flex min-w-0 flex-col gap-4 ${PAD_KARTU}`} style={{ color: TINTA }}>
        <div className="flex min-w-0 flex-col gap-1">{teks}</div>
        <PilihanOutfit pilihan={pilihan} kapan={kapan} apa={apa} judul={judulFoto} warna={{ tinta: TINTA, redup: REDUP, label: LABEL }}
          labelBuka={pilihan.map((isi) => teksPilihan.buka(isi.name))}
          teks={{ pilih: teksPilihan.pilih, tutup: teksPilihan.tutup, sebelumnya: teksPilihan.sebelumnya, berikutnya: teksPilihan.berikutnya }}
        />
      </article>
    );
  }
  if (foto) {
    // Fotonya isi utama (papan dress code penuh teks dan contoh gaya). Ponsel dan
    // tablet: foto selebar kartu dengan rasio aslinya, teks di bawah (keputusan
    // 23 Okt; dulu foto 96 px yang terpotong 4:5). Layar lebar: foto 320 px di
    // kiri (keputusan 22 Okt). Ketuk foto untuk layar penuh beserta keterangannya.
    const kelas = `${KARTU_HZ} flex min-w-0 flex-col gap-4 ${PAD_KARTU} lg:flex-row lg:items-start lg:gap-6`;
    return (
      <KartuFotoOutfit kelas={kelas} warna={TINTA} foto={foto} kapan={kapan} apa={apa} catatan={catatan} judul={judulFoto} teks={teksFoto}>
        {teks}
      </KartuFotoOutfit>
    );
  }
  return (
    <article className={`${KARTU_HZ} flex min-w-0 items-start gap-4 ${PAD_KARTU}`} style={{ color: TINTA }}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">{teks}</div>
    </article>
  );
}

/**
 * Baris daftar akun. `tab`: tujuan di portal (penanda pindah tab); `luar`:
 * tautan tel:/mailto: atau situs lain; `tabBaru`: dibuka di tab baru (WhatsApp);
 * `nada`: warna lingkaran ikon (hijau WhatsApp).
 */
export type BarisProfil = { href: string; judul: string; isi: string | null; Ikon: typeof Train; luar?: boolean; tab?: string; tabBaru?: boolean; nada?: "hijau" | "merah" };

const BARIS_PROFIL = "m3-state -mx-3 flex min-h-14 items-center gap-4 rounded-[12px] px-3 py-2";

/** Lingkaran ikon 40 px di baris daftar akun (pola halaman Account Trip.com). */
function IkonBulat({ Ikon, nada }: { Ikon: typeof Train; nada?: "hijau" | "merah" }) {
  const warna = nada === "hijau" ? "bg-[#E7F4EC] text-[#1E7B45]" : nada === "merah" ? "bg-[#FCEBEA] text-[#B42318]" : "bg-[#EEF1F6] text-[#101E38]";
  return (
    <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full ${warna}`}>
      <Ikon size={20} />
    </span>
  );
}

/** Daftar datar tanpa kartu di latar halaman: ikon bulat, judul, keterangan, panah. */
function DaftarProfil({ baris }: { baris: BarisProfil[] }) {
  return (
    <ul className="flex flex-col">
      {baris.map(({ href, judul, isi, Ikon, luar, tab, tabBaru, nada }) => {
        const dalam = (
          <>
            <IkonBulat Ikon={Ikon} nada={nada} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[16px] leading-6">{judul}</span>
              {isi ? (
                <span className="truncate text-[14px] leading-5" style={{ color: REDUP }}>
                  {isi}
                </span>
              ) : null}
            </span>
            <CaretRight size={20} aria-hidden className="shrink-0" style={{ color: LABEL }} />
          </>
        );
        return (
          <li key={judul}>
            {luar ? (
              <a href={href} className={BARIS_PROFIL} {...(tabBaru ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
                {dalam}
              </a>
            ) : (
              <Link href={href} className={BARIS_PROFIL}>
                {dalam}
                {tab ? <PenandaTab tab={tab} /> : null}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Judul kelompok daftar ("Bantuan"), seperti "Perks" di Trip.com. */
function JudulKelompok({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="pb-1 pt-3 text-[16px] font-semibold leading-6 lg:pt-0" style={{ color: TINTA }}>
      {children}
    </h2>
  );
}

/** Ubin ringkas di pita navy Profil: checkpoint, kamar, bus. */
export type UbinProfil = { href: string; Ikon: typeof Train; judul: string; isi: string; tab?: string };

/**
 * Kepala halaman Profil Horizon (pola halaman Account Trip.com; keputusan Mas
 * 25 Okt, versi C): avatar, nama, dan "Lihat data diri" langsung di pita navy,
 * lalu ubin ringkas yang hanya muncul bila datanya ada. Tanpa judul "Profil".
 */
export function IdentitasProfilHorizon({ inisial, nama, data, ubin, trip = false }: { inisial: string; nama: string; data: { href: string; label: string }; ubin: UbinProfil[]; /** Tema Gathering Trip: ubin di kanan identitas mulai 1024 px. */ trip?: boolean }) {
  return (
    <div className={`flex flex-col gap-4 pb-2 md:pb-0 ${trip ? "lg:flex-row lg:items-center lg:justify-between lg:gap-8" : ""}`}>
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--hz-emas)] text-[18px] font-extrabold text-[var(--hz-on-emas)] shadow-[0_0_0_2px_var(--hz-navy),0_0_0_4px_var(--hz-emas)]">
          {inisial}
        </span>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-[22px] font-bold leading-7 [overflow-wrap:anywhere]">{nama}</h1>
          <Link href={data.href} className="m3-state -mx-1 -my-2 inline-flex min-h-12 w-fit items-center gap-1 rounded-md px-1 text-[14px] leading-5 text-white/85">
            {data.label}
            <CaretRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
      {ubin.length > 0 ? (
        // Bergulir ke samping di ponsel bila tidak muat, seperti ubin Diamond di Trip.com.
        <ul className={`-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 ${trip ? "lg:shrink-0 lg:flex-nowrap" : ""}`}>
          {ubin.map(({ href, Ikon, judul, isi, tab }) => (
            <li key={href} className="flex shrink-0">
              <Link href={href} className="m3-state flex w-[148px] flex-col gap-1 rounded-[12px] bg-white/[0.08] p-3 [--m3-state-color:#fff] md:w-[176px]">
                <Ikon size={22} aria-hidden className="text-[var(--hz-emas)]" />
                <span className="truncate text-[16px] font-semibold leading-6">{judul}</span>
                <span className="line-clamp-2 text-[12px] leading-4 text-white/75">{isi}</span>
                {tab ? <PenandaTab tab={tab} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Isi halaman Profil Horizon di bawah pita navy: kartu QR satu baris yang
 * menumpang di tepi pita (seperti kartu Trip Coins; kodenya tidak pernah patah),
 * lalu daftar datar berikon bulat, kelompok Bantuan, dan Keluar di paling bawah.
 * Layar lebar dua kolom: akun di kiri, bantuan di kanan.
 */
export function ProfilHorizon({
  sisipan,
  qr,
  akun,
  bantuan,
  darurat = null,
  keluar,
  trip = false,
}: {
  sisipan: ReactNode;
  qr: { href: string; label: string; kode: string; tampilkan: string; gambar: ReactNode } | null;
  akun: BarisProfil[];
  /** Kontak panitia sebagai baris (WhatsApp, Telepon, atau Email). */
  bantuan: { judul: string; baris: BarisProfil[] };
  /** Kartu darurat dan bantuan dari panitia (E-03): tetap terbuka, tidak di balik ketukan. */
  darurat?: ReactNode;
  /** `lingkup`: alamat portal yang salinan QR luringnya dihapus sebelum keluar. */
  keluar: { action: string; label: string; lingkup: string[] };
  /**
   * Tema Gathering Trip: kartu QR besar di kolom kiri desktop (kode di atas
   * putih, seperti boarding pass), daftar akun dan Keluar di dalam kartu.
   */
  trip?: { catatanQr: string } | false;
}) {
  const adaBantuan = bantuan.baris.length > 0 || Boolean(darurat);
  if (trip) {
    const kartu = `${KARTU_HZ} px-4 py-1 [&_li+li]:border-t [&_li+li]:border-[#E6E8EC]`;
    return (
      <div className={`flex flex-col gap-6 pb-6 ${qr ? "" : "mt-3 md:mt-6"}`} style={{ color: TINTA }}>
        {qr ? (
          <PemicuQr id="pemicu-qr-profil" href={qr.href} className={`${KARTU_HZ} m3-state relative -mt-5 flex items-center gap-4 p-4 text-[#101E38] md:-mt-2 lg:hidden`}>
            <span className="size-12 shrink-0 rounded-[8px] bg-white p-0.5 ring-1 ring-[#E6E9EE]">{qr.gambar}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[18px] font-bold leading-6 tracking-[0.5px] [overflow-wrap:anywhere]">{qr.kode}</span>
              <span className="truncate text-[12px] leading-4" style={{ color: REDUP }}>
                {qr.label}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[14px] font-semibold leading-5">
              <span className="sr-only md:not-sr-only">{qr.tampilkan}</span>
              <CaretRight size={20} aria-hidden className="md:size-4" />
            </span>
          </PemicuQr>
        ) : null}
        {sisipan}
        <div className={`flex flex-col gap-6 lg:grid lg:items-start lg:gap-8 ${qr ? `lg:mt-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] ${adaBantuan ? "lg:grid-rows-[auto_1fr_auto]" : "lg:grid-rows-[auto_1fr]"}` : "lg:grid-cols-2"} lg:gap-y-6 lg:[reading-flow:grid-rows]`}>
          {qr ? (
            <PemicuQr id="pemicu-qr-profil-besar" href={qr.href} className={`${KARTU_HZ} m3-state hidden flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1 items-center gap-4 px-6 pb-6 pt-8 text-center lg:flex`}>
              <span className="size-[200px] bg-white">{qr.gambar}</span>
              <span className="flex flex-col gap-1">
                <span className="text-[22px] font-bold leading-7 tracking-[0.5px] [overflow-wrap:anywhere]">{qr.kode}</span>
                <span className="text-[14px] leading-5" style={{ color: REDUP }}>
                  {trip.catatanQr}
                </span>
              </span>
            </PemicuQr>
          ) : null}
          {/* Desktop: QR kiri, akun dan Keluar kanan, Bantuan selebar halaman di bawah. */}
          <div className="flex min-w-0 flex-col gap-6 lg:contents">
            <section aria-label={akun[0]?.judul} className={`${kartu} ${qr ? "lg:col-start-2" : "lg:col-start-1"} lg:row-start-1`}>
              <DaftarProfil baris={akun} />
            </section>
            {adaBantuan ? (
              <section aria-labelledby="profil-bantuan" className={`flex flex-col gap-3 lg:col-span-2 ${qr ? "lg:row-start-3" : "lg:row-start-2"}`}>
                <JudulKelompok id="profil-bantuan">{bantuan.judul}</JudulKelompok>
                {bantuan.baris.length > 0 ? (
                  <div className={kartu}>
                    <DaftarProfil baris={bantuan.baris} />
                  </div>
                ) : null}
                {darurat}
              </section>
            ) : null}
            <div className={`${KARTU_HZ} px-4 py-1 ${qr ? "lg:col-start-2 lg:row-start-2" : adaBantuan ? "lg:col-start-2 lg:row-start-1" : "lg:col-start-1 lg:row-start-2"}`}>
              <FormKeluar action={keluar.action} lingkup={keluar.lingkup}>
                <button type="submit" className={`${BARIS_PROFIL} w-[calc(100%+24px)] text-left text-[16px] font-semibold leading-6 text-[#B42318] [--m3-state-color:#B42318]`}>
                  <IkonBulat Ikon={SignOut} nada="merah" />
                  {keluar.label}
                </button>
              </FormKeluar>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    // Pembungkus isi naik 12/24 px ke pita; kartu QR naik lagi 20/8 px, jadi menumpang 32 px.
    // Tanpa QR, isi turun kembali ke bawah pita.
    <div className={`flex flex-col gap-4 pb-6 ${qr ? "" : "mt-3 md:mt-6"}`}>
      {qr ? (
        <PemicuQr id="pemicu-qr-profil" href={qr.href} className={`${KARTU_HZ} m3-state relative -mt-5 flex items-center gap-4 p-4 text-[#101E38] md:-mt-2 lg:max-w-[480px]`}>
          <span className="size-12 shrink-0 rounded-[8px] bg-white p-0.5 ring-1 ring-[#E6E9EE]">{qr.gambar}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            {/* Kode dari impor bisa panjang: tidak pernah dipotong (dibacakan petugas), patah bila perlu. */}
            <span className="text-[18px] font-bold leading-6 tracking-[0.5px] [overflow-wrap:anywhere]">{qr.kode}</span>
            <span className="truncate text-[12px] leading-4" style={{ color: REDUP }}>
              {qr.label}
            </span>
          </span>
          {/* Ponsel: panah saja, supaya kode mendapat lebar penuh; labelnya tetap dibaca pembaca layar. */}
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[14px] font-semibold leading-5">
            <span className="sr-only md:not-sr-only">{qr.tampilkan}</span>
            <CaretRight size={20} aria-hidden className="md:size-4" />
          </span>
        </PemicuQr>
      ) : null}
      {sisipan}
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-16" style={{ color: TINTA }}>
        <section aria-label={akun[0]?.judul} className="min-w-0 lg:col-start-1 lg:row-start-1">
          <DaftarProfil baris={akun} />
        </section>
        {/* Desktop: Bantuan selebar halaman di bawah akun, Keluar tetap baris terakhir. */}
        <div className="flex min-w-0 flex-col gap-2 border-t border-[#E6E8EC] pt-2 lg:contents">
          {adaBantuan ? (
            <section aria-labelledby="profil-bantuan" className="flex flex-col gap-2 lg:col-span-2 lg:row-start-2 lg:mt-6">
              <JudulKelompok id="profil-bantuan">{bantuan.judul}</JudulKelompok>
              {bantuan.baris.length > 0 ? <DaftarProfil baris={bantuan.baris} /> : null}
              {darurat}
            </section>
          ) : null}
          {/* Keluar: baris terakhir, merah, seperti "Sign out" di halaman akun aplikasi. */}
          <div className={adaBantuan ? "mt-2 border-t border-[#E6E8EC] pt-2 lg:col-start-1 lg:row-start-3" : "lg:col-start-2 lg:row-start-1"}>
            <FormKeluar action={keluar.action} lingkup={keluar.lingkup}>
              <button type="submit" className={`${BARIS_PROFIL} w-[calc(100%+24px)] text-left text-[16px] font-semibold leading-6 text-[#B42318] [--m3-state-color:#B42318]`}>
                <IkonBulat Ikon={SignOut} nada="merah" />
                {keluar.label}
              </button>
            </FormKeluar>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Halaman Data diri (dibuka dari "Lihat data diri", seperti "Manage my account"
 * di Trip.com): baris label dan nilai, lalu cara menghubungi panitia bila ada
 * yang salah. Peserta tidak mengubah datanya sendiri.
 */
export function DataDiriHorizon({
  fakta,
  bantuan,
}: {
  fakta: { label: string; nilai: string }[];
  /** `kontak`: tombol Telepon dan WhatsApp; tanpa itu cukup tautan telepon. */
  bantuan: { teks: string; kontak: ReactNode; tautan: { href: string; label: string } | null } | null;
}) {
  return (
    <div className="flex w-full max-w-[640px] flex-col gap-4 pb-6" style={{ color: TINTA }}>
      <div className={`${KARTU_HZ} overflow-hidden`}>
        <dl>
          {fakta.map((item) => (
            <div key={item.label} className="flex min-h-14 flex-col justify-center gap-1 border-[#E6E8EC] px-4 py-3 md:px-6 [&+&]:border-t">
              <dt className={KELAS_ALIS} style={{ color: LABEL }}>
                {item.label}
              </dt>
              <dd className="text-[16px] leading-6 [overflow-wrap:anywhere]">{item.nilai}</dd>
            </div>
          ))}
        </dl>
      </div>
      {bantuan ? (
        <div className={`${KARTU_HZ} flex flex-col gap-3 ${PAD_KARTU}`}>
          <p className={KELAS_KET} style={{ color: REDUP }}>
            {bantuan.teks}
          </p>
          {bantuan.tautan ? (
            <a href={bantuan.tautan.href} className={`${KELAS_TAUTAN} underline-offset-2 hover:underline`} style={{ color: BIRU }}>
              {bantuan.tautan.label}
            </a>
          ) : null}
          {bantuan.kontak}
        </div>
      ) : null}
    </div>
  );
}

