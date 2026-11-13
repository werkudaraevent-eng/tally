import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowsOut, Bell, CalendarDots, CaretRight, CoatHanger, Compass, List, QrCode, Suitcase, Train } from "@phosphor-icons/react/dist/ssr";
import type { PortalTab } from "@/components/member/dashboard-gathering";
import { CINCIN_NAVY } from "@/components/landing/modern/cincin-horizon";
import { IkonTabBawah, PenandaTab } from "@/components/member/muat-portal";
import { PemicuQr } from "@/components/member/qr-fokus";
import { GARIS_NAVY, LABEL, REDUP, REDUP_NAVY, TINTA, WARNA_GARIS } from "./gaya";

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
        <p className="max-w-[45%] text-right text-[14px] font-normal leading-5 tabular-nums" style={{ color: nadaMeta === "hijau" ? "#1E7B45" : REDUP }}>
          {meta}
        </p>
      ) : null}
    </div>
  );
}

/** Tombol pil emas rancangan (14/700), teks dari --hz-on-emas, tinggi >= 48px. */
export const PIL_EMAS =
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
            <span className="truncate text-[18px] font-bold">{nama}</span>
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
            className="m3-state -mr-3 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[16px] font-bold text-[var(--hz-emas)] ring-2 ring-inset ring-[var(--hz-emas)] aria-[current]:bg-[var(--hz-emas)] aria-[current]:text-[var(--hz-on-emas)] aria-[current]:[--m3-state-color:var(--hz-on-emas)]"
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
          style={{ color: TINTA }}
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
        className={`text-[14px] font-normal leading-5 [overflow-wrap:anywhere] md:text-[0.875rem] lg:short:hidden ${kembali ? (kembali.semua ? "hidden" : "hidden md:block") : ""}`}
        style={{ color: LABEL }}
      >
        {alis}
      </p>
      <h1
        className={`mt-1 whitespace-pre-line text-balance font-bold [overflow-wrap:anywhere] md:mt-[14px] lg:short:mt-0 ${sapaan ? "max-w-[790px] text-[24px] leading-8 md:text-[36px] md:leading-[44px] lg:short:text-[28px] lg:short:leading-9" : "text-[30px] leading-[1.15] md:text-[48px] md:leading-[1.2] lg:short:text-[30px]"}`}
        style={{ color: TINTA }}
      >
        <span className="lg:hidden">{judulPonsel}</span>
        <span className="hidden lg:inline">{judul}</span>
      </h1>
      {catatan ? (
        <p className={`text-[16px] leading-6 md:mt-[14px] md:block lg:short:mt-2 ${catatanPonsel ? "mt-1.5 text-[14px] leading-5 md:text-[16px] md:leading-6" : "mt-[14px] hidden"}`} style={{ color: REDUP }}>
          {alisDiCatatan && alis ? <span className="hidden lg:short:inline">{`${alis}. `}</span> : null}
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
          <p className="text-[22px] font-bold leading-[1.26] [overflow-wrap:anywhere]">{dari ? `${dari} → ${ke}` : ke}</p>
          {tanggalPanjang ? (
            <p className="mt-4 text-[13px]" style={{ color: REDUP_NAVY }}>
              {tanggalPanjang}
            </p>
          ) : null}
        </div>
        <div className={`hidden items-center gap-6 md:flex ${dari ? "justify-between" : ""}`}>
          {dari ? (
            <>
              <p className="min-w-0 text-[35px] font-bold leading-[1.26] [overflow-wrap:anywhere]">{dari}</p>
              <Train size={28} weight="bold" aria-hidden className="shrink-0 text-[var(--hz-emas)]" />
            </>
          ) : null}
          <p className={`min-w-0 text-[35px] font-bold leading-[1.26] [overflow-wrap:anywhere] ${dari ? "text-right" : ""}`}>{ke}</p>
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
                      <dd className={`${item.lebar || tigaPendek ? "text-[18px] font-bold" : "text-[26px] font-bold"} leading-[1.26] ${tigaPendek ? "whitespace-nowrap" : "[overflow-wrap:anywhere]"}`}>{item.nilai}</dd>
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
