import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowsOut, Bell, CalendarDots, CaretRight, CoatHanger, Compass, Lifebuoy, List, Phone, QrCode, SignOut, Suitcase, Train, User, WhatsappLogo, X } from "@phosphor-icons/react/dist/ssr";
import type { PortalTab } from "@/components/member/dashboard-gathering";
import { GulirHariAktif } from "@/components/member/gulir-hari-aktif";
import { PemicuQr } from "@/components/member/qr-fokus";

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

/** Tombol pil emas rancangan (14/700), teks dari --hz-on-emas, tinggi >= 48px. */
const PIL_EMAS =
  "m3-state inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--hz-emas)] px-[18px] py-4 text-[14px] font-bold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)] md:py-[17px]";

export type TabHorizon = { id: Exclude<PortalTab, "qr">; label: string; labelPendek: string; href: string };

// Profil di ponsel menjadi "Menu": halaman yang juga memuat Perjalanan, kontak, dan Keluar.
const IKON_TAB = { beranda: Compass, jadwal: CalendarDots, perjalanan: Suitcase, outfit: CoatHanger, info: Bell, profil: List } as const;

/** Bilah navy atas (frame "Portal navigation" / "Portal header"): logo, tab, inisial. */
export function KepalaHorizon({
  logo,
  nama,
  homeHref,
  tabs,
  aktif,
  inisial,
  profilLabel,
  infoBaru,
  tabsAria,
}: {
  logo: string | null;
  nama: string;
  homeHref: string;
  tabs: TabHorizon[];
  aktif: Exclude<PortalTab, "qr">;
  inisial: string;
  profilLabel: string;
  infoBaru: boolean;
  tabsAria: string;
}) {
  const profil = tabs.find((tab) => tab.id === "profil");
  return (
    <header className="sticky top-0 z-30 bg-[var(--hz-navy)] text-white">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 px-6 py-5 md:px-16">
        <a href={homeHref} className="flex min-h-12 min-w-0 items-center">
          {logo ? (
            // Logo dari CMS: ukuran asli tidak diketahui, jadi <img> biasa.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={nama} className="h-[58px] w-auto max-w-[140px] object-contain object-left md:h-[62px]" />
          ) : (
            <span className="truncate text-[18px] font-extrabold">{nama}</span>
          )}
        </a>
        {/* Tab di kanan, berdampingan dengan profil: sama dengan bilah atas halaman acara Horizon. */}
        <nav aria-label={tabsAria} className="ml-auto hidden md:block">
          <ul className="flex items-center gap-6">
            {tabs
              .filter((tab) => tab.id !== "profil")
              .map((tab) => (
                <li key={tab.id}>
                  <Link
                    href={tab.href}
                    aria-current={tab.id === aktif ? "page" : undefined}
                    className="m3-state relative inline-flex min-h-12 items-center gap-1.5 rounded-md px-1 text-[14px] font-semibold text-[#E1E6F1] aria-[current]:text-white"
                  >
                    {tab.label}
                    {tab.id === "info" && infoBaru ? <span aria-hidden className="size-1.5 rounded-full bg-[var(--hz-emas)]" /> : null}
                    {tab.id === aktif ? <span aria-hidden className="absolute inset-x-1 bottom-2 h-0.5 rounded-full bg-[var(--hz-emas)]" /> : null}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        {profil ? (
          <Link
            href={profil.href}
            aria-label={profilLabel}
            aria-current={aktif === "profil" ? "page" : undefined}
            className="m3-state -mr-3 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[16px] font-extrabold text-[var(--hz-emas)] aria-[current]:bg-white/10"
          >
            {inisial}
          </Link>
        ) : null}
      </div>
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
  tabsAria,
  infoBaru,
  qr,
}: {
  tabs: TabHorizon[];
  aktif: Exclude<PortalTab, "qr">;
  tabsAria: string;
  infoBaru: boolean;
  qr?: { href: string; label: string; labelPendek: string } | null;
}) {
  const tengah = Math.ceil(tabs.length / 2);
  return (
    <nav aria-label={tabsAria} className="fixed inset-x-0 bottom-0 z-20 bg-white px-2 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-1px_0_#E6E9EE] md:hidden">
      <ul className={`mx-auto grid max-w-[560px] ${qr ? "grid-cols-5" : "grid-cols-4"}`}>
        {tabs.flatMap((tab, index) => {
          const Ikon = IKON_TAB[tab.id];
          const ini = tab.id === aktif;
          const tombolQr =
            qr && index === tengah ? (
              <li key="qr">
                <PemicuQr id="pemicu-qr-nav" href={qr.href} className="m3-state flex min-h-12 flex-col items-center justify-center gap-[5px] rounded-md text-[10px] font-bold text-[#101E38]">
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
                aria-current={ini ? "page" : undefined}
                className={`m3-state flex min-h-12 flex-col items-center justify-center gap-[5px] rounded-md text-[10px] ${ini ? "font-bold text-[#101E38]" : "font-semibold text-[#526078]"}`}
              >
                {/* Rancangan: ikon dan label aktif emas di atas putih (kontras 1,6:1).
                    Diganti pil emas di belakang ikon, label navy. */}
                <span aria-hidden className={`relative flex h-6 w-12 items-center justify-center rounded-full ${ini ? "bg-[var(--hz-emas)] text-[var(--hz-on-emas)]" : ""}`}>
                  <Ikon size={20} weight={ini ? "fill" : "regular"} />
                  {tab.id === "info" && infoBaru && !ini ? <span className="absolute right-3 top-0 size-1.5 rounded-full bg-[#B42318]" /> : null}
                </span>
                {tab.labelPendek}
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
  kembali = null,
}: {
  alis: string;
  judul: string;
  judulPonsel: string;
  catatan: string;
  catatanPonsel?: boolean;
  /** Ponsel: halaman yang dibuka dari Menu (bukan dari bilah bawah) punya tautan kembali ke Menu. */
  kembali?: { href: string; label: string } | null;
}) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 pt-6 md:px-16 md:pb-7 md:pt-12">
      {kembali ? (
        <Link href={kembali.href} className="m3-state -ml-2 -mt-3 mb-1 inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-[14px] font-semibold md:hidden" style={{ color: BIRU }}>
          <ArrowLeft size={20} aria-hidden />
          {kembali.label}
        </Link>
      ) : null}
      <p className="hidden text-[11px] font-bold uppercase leading-[1.26] tracking-[1.5px] md:block" style={{ color: LABEL }}>
        {alis}
      </p>
      <h1 className="whitespace-pre-line text-balance text-[30px] font-extrabold leading-[1.15] [overflow-wrap:anywhere] md:mt-[14px] md:text-[48px] md:leading-[1.2]" style={{ color: TINTA }}>
        <span className="md:hidden">{judulPonsel}</span>
        <span className="hidden md:inline">{judul}</span>
      </h1>
      {catatan ? (
        <p className={`text-[17px] leading-[1.5] md:mt-[14px] md:block ${catatanPonsel ? "mt-1.5 text-[15px] md:text-[17px]" : "mt-[14px] hidden"}`} style={{ color: REDUP }}>
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
export type FaktaPass = { label: string; nilai: string; ponsel: boolean; lebar?: boolean; pendek?: boolean };

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
}) {
  const faktaPonsel = fakta.filter((item) => item.ponsel);
  return (
    <section aria-label={label} className="overflow-hidden rounded-[20px] bg-[var(--hz-navy)] text-white md:rounded-[24px]">
      {kv ? (
        // Hiasan: KV acara, dipotong tengah seperti rancangan (cover).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={kv} alt="" aria-hidden decoding="async" className="h-[145px] w-full select-none object-cover md:h-[200px]" />
      ) : null}
      {/* Sobekan QR di samping rute hanya bila kartunya cukup lebar (xl); di bawahnya rute tetap utuh. */}
      <div className="xl:flex">
      <div className="flex min-w-0 flex-col gap-4 p-5 md:gap-6 md:p-[30px] xl:flex-1">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[1.3px] text-[var(--hz-emas)] md:text-[11px] md:tracking-[1.7px]">{label}</p>
          {tanggalPendek ? <p className="hidden text-[12px] font-semibold uppercase md:block">{tanggalPendek}</p> : null}
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
        {fakta.length > 0 ? (
          <dl className="hidden flex-wrap justify-between gap-x-6 gap-y-4 border-t pt-5 md:flex" style={{ borderColor: GARIS_NAVY }}>
            {fakta.map((item) => (
              <div key={item.label} className={`flex flex-col gap-2 ${item.pendek ? "max-w-[14rem] shrink-0" : item.lebar ? "min-w-[9rem] flex-[1_1_12rem]" : "min-w-0"}`}>
                <dt className="text-[10px] uppercase tracking-[1px]" style={{ color: REDUP_NAVY }}>
                  {item.label}
                </dt>
                <dd className={`text-[16px] font-bold ${item.pendek ? "[overflow-wrap:break-word]" : "[overflow-wrap:anywhere]"}`}>{item.nilai}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {faktaPonsel.length > 0 ? (
          <dl className="grid grid-cols-2 gap-7 border-t pt-4 md:hidden" style={{ borderColor: GARIS_NAVY }}>
            {faktaPonsel.map((item) => (
              <div key={item.label} className={`flex min-w-0 flex-col gap-[5px] ${item.lebar ? "col-span-2" : ""}`}>
                <dt className="text-[10px] uppercase tracking-[1px]" style={{ color: REDUP_NAVY }}>
                  {item.label}
                </dt>
                <dd className={`${item.lebar ? "text-[18px] font-bold" : "text-[26px] font-extrabold"} leading-[1.26] [overflow-wrap:anywhere]`}>{item.nilai}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {qr ? (
        <PemicuQr
          id="pemicu-qr-pass"
          href={qr.href}
          className="m3-state group relative flex items-center gap-4 border-t border-dashed border-[#405272] px-5 py-4 focus-visible:outline-offset-[-4px] md:px-[30px] xl:w-[210px] xl:shrink-0 xl:flex-col xl:justify-center xl:gap-3 xl:border-l xl:border-t-0 xl:px-6 xl:py-[30px]"
        >
          <span className="size-[72px] shrink-0 rounded-xl bg-white p-1.5 xl:size-[148px] xl:rounded-2xl xl:p-2.5">{qr.kode}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 xl:flex-none xl:items-center xl:text-center">
            <span className="text-[15px] font-bold">{qr.label}</span>
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--hz-emas)]">
              <ArrowsOut size={14} weight="bold" aria-hidden />
              {qr.perbesar}
            </span>
          </span>
        </PemicuQr>
      ) : null}
      </div>
    </section>
  );
}

/**
 * Panel "Next action panel" (desktop: kartu putih) dan "Upcoming agenda"
 * (ponsel: tanpa kartu). Tanpa agenda berikutnya hanya tombol QR yang tampil.
 */
export function SelanjutnyaHorizon({
  alis,
  alisPonsel,
  judul,
  baris,
  catatan,
  qr,
  bantuan,
  sisipan,
}: {
  alis: string | null;
  alisPonsel: string | null;
  judul: string | null;
  baris: string | null;
  catatan: string | null;
  qr: { href: string; label: string; pemicu: ReactNode } | null;
  bantuan: { href: string; label: string } | null;
  /** Pengganti isi agenda (status pendaftaran yang belum disetujui). */
  sisipan?: ReactNode;
}) {
  if (!judul && !qr && !sisipan && !bantuan) return null;
  return (
    <section className={`flex flex-col gap-3 md:gap-5 ${judul || sisipan ? "md:rounded-[24px] md:bg-white md:p-7" : ""}`} style={{ color: TINTA }}>
      {sisipan}
      {judul ? (
        <>
          {alisPonsel ? (
            <p className="text-[10px] font-bold uppercase tracking-[1px] md:hidden" style={{ color: LABEL }}>
              {alisPonsel}
            </p>
          ) : null}
          {alis ? (
            <p className="hidden text-[11px] font-bold uppercase md:block" style={{ color: BIRU }}>
              {alis}
            </p>
          ) : null}
          <h2 className="text-balance text-[25px] font-extrabold leading-[1.26] [overflow-wrap:anywhere] md:text-[34px] md:leading-[1.2]">{judul}</h2>
          {baris || catatan ? (
            <p className="text-[14px] leading-[1.6] md:text-[16px]" style={{ color: REDUP }}>
              {baris}
              {baris && catatan ? <br /> : null}
              {catatan}
            </p>
          ) : null}
        </>
      ) : null}
      {qr ? qr.pemicu : null}
      {bantuan ? (
        <a href={bantuan.href} className="hidden min-h-12 items-center self-start text-[13px] font-semibold md:inline-flex" style={{ color: BIRU }}>
          {bantuan.label}
        </a>
      ) : null}
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

/** Ponsel: "Roommate information" di antara dua garis. */
export function TemanSekamarHorizon({ judul, orang }: { judul: string; orang: { nama: string; detail: string | null }[] }) {
  if (orang.length === 0) return null;
  return (
    <section className="flex flex-col gap-[10px] border-y border-[#BCC7DA] py-5 md:hidden" style={{ color: TINTA }}>
      <h2 className="text-[13px]" style={{ color: REDUP }}>
        {judul}
      </h2>
      <ul className="flex flex-col gap-3">
        {orang.map((item) => (
          <li key={item.nama} className="flex flex-col gap-[10px]">
            <p className="text-[19px] font-bold [overflow-wrap:anywhere]">{item.nama}</p>
            {item.detail ? (
              <p className="text-[12px]" style={{ color: REDUP }}>
                {item.detail}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

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
    <nav aria-label={aria} className="sticky top-[118px] -my-1 -ml-6 -mr-1 hidden max-h-[calc(100dvh-134px)] scroll-py-1 self-start overflow-y-auto p-1 print:max-h-none print:overflow-visible lg:block" style={{ color: TINTA }}>
      <GulirHariAktif />
      <ol className="flex flex-col gap-1">
        {hari.map((item) => (
          <li key={item.href}>
            {/* Hari terpilih memakai kartu putih yang sama dengan kartu acara di kanannya. */}
            <Link
              href={item.href}
              aria-current={item.aktif ? "page" : undefined}
              className={`m3-state flex min-h-12 flex-col gap-1.5 rounded-[16px] px-5 py-4 ${item.aktif ? "bg-white shadow-[0_1px_2px_rgb(16_24_40/0.06)]" : ""}`}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.6px]" style={{ color: item.aktif ? BIRU : LABEL }}>
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

/** Tautan bantuan ponsel di bawah teman sekamar. */
export function BantuanPonselHorizon({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="inline-flex min-h-12 items-center self-start text-[13px] font-bold md:hidden" style={{ color: BIRU }}>
      {label}
    </a>
  );
}

/** Kepala tab selain Beranda: pita navy pendek di bawah bilah, teks putih. */
export function PitaKepalaHorizon({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[var(--hz-navy)] text-white">
      <div className="mx-auto w-full max-w-[1440px] px-6 pb-10 pt-4 md:px-16 md:pb-14 md:pt-8">{children}</div>
    </div>
  );
}

/** Layar QR kehadiran (frame eY05h): navy, kartu putih 340px, petunjuk di bawah. */
export function QrHorizon({
  judul,
  tutup,
  tutupLabel,
  nama,
  sub,
  kartuKode,
  petunjuk,
  petunjukCatatan,
  kecerahan,
}: {
  judul: string;
  tutup: string;
  tutupLabel: string;
  nama: string;
  sub: string | null;
  kartuKode: ReactNode;
  petunjuk: string;
  petunjukCatatan: string;
  kecerahan: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-6 pb-10">
      <div className="flex items-center justify-between gap-3 pb-4 pt-7">
        <h1 className="text-[20px] font-extrabold">{judul}</h1>
        {/* Rancangan 44px; dibuat 48px supaya area ketuknya cukup. */}
        <Link href={tutup} aria-label={tutupLabel} className="m3-state flex size-12 items-center justify-center rounded-full bg-white/10">
          <X size={18} weight="bold" aria-hidden />
        </Link>
      </div>
      <div className="mx-auto mt-6 flex w-full max-w-[340px] flex-col items-center gap-4 rounded-[24px] bg-white p-[30px]" style={{ color: TINTA }}>
        <p className="text-center text-[20px] font-extrabold [overflow-wrap:anywhere]">{nama}</p>
        {sub ? (
          <p className="-mt-2 text-center text-[13px]" style={{ color: REDUP }}>
            {sub}
          </p>
        ) : null}
        <div className="w-full">{kartuKode}</div>
      </div>
      <div className="mx-auto mt-12 flex w-full max-w-[340px] flex-col items-center gap-2 text-center">
        <p className="text-[15px] font-bold">{petunjuk}</p>
        <p className="text-[13px] text-[#C6D2E8]">{petunjukCatatan}</p>
        <p className="mt-6 text-[13px] leading-[1.6]" style={{ color: REDUP_NAVY }}>
          {kecerahan}
        </p>
      </div>
    </div>
  );
}

export const LATAR_PORTAL_HORIZON = KREM;

export type LegKereta = { kunci: string; arah: string; judul: string; baris: string | null; jam: string | null; gerbong: string | null; kursi: string | null; kode: string | null };

/**
 * Kartu "Tiket kereta" di bawah pass: satu blok per arah (berangkat, pulang)
 * dengan gerbong dan kursi sebesar fakta pass, lalu kode booking. Hanya tampil
 * bila peserta punya tiket (train_tickets).
 */
export function TiketKeretaHorizon({ judul, label, leg }: { judul: string; label: { gerbong: string; kursi: string; kode: string }; leg: LegKereta[] }) {
  return (
    <section aria-label={judul} className="flex flex-col gap-5 rounded-[20px] bg-white p-5 md:rounded-[24px] md:p-7" style={{ color: TINTA }}>
      <div className="flex items-center gap-2">
        <Train size={18} weight="bold" aria-hidden style={{ color: BIRU }} />
        <h2 className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: LABEL }}>
          {judul}
        </h2>
      </div>
      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-2 xl:gap-10">
      {leg.map((item, index) => {
        const isian = [
          [label.gerbong, item.gerbong],
          [label.kursi, item.kursi],
        ].filter((pasangan): pasangan is [string, string] => Boolean(pasangan[1]));
        return (
          <div key={item.kunci} className={`flex flex-col gap-3 ${index > 0 ? "border-t border-dashed pt-5 xl:border-l xl:border-t-0 xl:pl-10 xl:pt-0" : ""}`} style={{ borderColor: "#C9D1DE" }}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.6px]" style={{ color: BIRU }}>
              {item.arah}
            </p>
            <div className="flex flex-col gap-1">
              <p className="text-[20px] font-extrabold leading-[1.26] [overflow-wrap:anywhere] md:text-[24px]">{item.judul}</p>
              {item.baris || item.jam ? (
                <p className="text-[14px] leading-[1.5]" style={{ color: REDUP }}>
                  {item.baris}
                  {item.baris && item.jam ? " • " : null}
                  {/* Jam berangkat–tiba tidak dipisah di tanda pisah saat baris panjang. */}
                  {item.jam ? <span className="whitespace-nowrap">{item.jam}</span> : null}
                </p>
              ) : null}
            </div>
            {isian.length > 0 ? (
              <dl className="grid grid-cols-2 gap-3">
                {isian.map(([dt, dd]) => (
                  <div key={dt} className="flex min-w-0 flex-col gap-1">
                    <dt className="text-[10px] uppercase tracking-[1px]" style={{ color: LABEL }}>
                      {dt}
                    </dt>
                    <dd className="text-[26px] font-extrabold leading-[1.26] tabular-nums [overflow-wrap:anywhere]">{dd}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {item.kode ? (
              <p className="flex items-baseline justify-between gap-3 rounded-[12px] px-4 py-3 text-[13px]" style={{ background: "#F1F3F8", color: REDUP }}>
                {label.kode}
                <span className="whitespace-nowrap text-[16px] font-bold tracking-[1.5px] tabular-nums" style={{ color: TINTA }}>
                  {item.kode}
                </span>
              </p>
            ) : null}
          </div>
        );
      })}
      </div>
    </section>
  );
}

/**
 * Baris ringkas di Beranda yang membuka halaman topiknya (pola kartu "Upcoming"
 * aplikasi perjalanan): satu baris ringkasan, rinciannya di halaman sendiri.
 */
export function BarisTautanHorizon({ href, Ikon, alis, judul, catatan }: { href: string; Ikon: typeof Train; alis: string; judul: string; catatan: string | null }) {
  return (
    <Link href={href} className="m3-state flex min-h-[72px] items-center gap-4 rounded-[20px] bg-white px-5 py-4 md:rounded-[24px] md:px-6 md:py-5" style={{ color: TINTA }}>
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF1F6]">
        <Ikon size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.8px]" style={{ color: BIRU }}>
          {alis}
        </span>
        <span className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{judul}</span>
        {catatan ? (
          <span className="text-[14px] leading-5" style={{ color: REDUP }}>
            {catatan}
          </span>
        ) : null}
      </span>
      <CaretRight size={20} aria-hidden className="shrink-0" style={{ color: LABEL }} />
    </Link>
  );
}

export type FaktaInfo = { label: string; nilai: string; catatan?: string | null; besar?: boolean };

/** Kartu putih halaman Perjalanan: judul kecil berikon, kepala opsional, lalu fakta. */
export function KartuInfoHorizon({
  judul,
  Ikon,
  nama,
  alamat,
  tautan,
  fakta,
  kolom,
  children,
}: {
  judul: string;
  Ikon: typeof Train;
  nama?: string | null;
  alamat?: string | null;
  tautan?: { href: string; label: string } | null;
  fakta: FaktaInfo[];
  /** Kolom fakta di layar lebar (ponsel selalu dua). */
  kolom: 3 | 4;
  children?: ReactNode;
}) {
  return (
    <section aria-label={judul} className="flex flex-col gap-5 rounded-[20px] bg-white p-5 md:rounded-[24px] md:p-7" style={{ color: TINTA }}>
      <div className="flex items-center gap-2">
        <Ikon size={18} weight="bold" aria-hidden style={{ color: BIRU }} />
        <h2 className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: LABEL }}>
          {judul}
        </h2>
      </div>
      {nama ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[22px] font-extrabold leading-[1.2] [overflow-wrap:anywhere] md:text-[28px]">{nama}</p>
          {alamat ? (
            <p className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
              {alamat}
            </p>
          ) : null}
          {tautan ? (
            <a href={tautan.href} target="_blank" rel="noreferrer noopener" className="-my-1 inline-flex min-h-12 items-center self-start text-[13px] font-semibold" style={{ color: BIRU }}>
              {tautan.label}
            </a>
          ) : null}
        </div>
      ) : null}
      {fakta.length > 0 ? (
        <dl className={`grid grid-cols-2 gap-5 ${kolom === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          {fakta.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: LABEL }}>
                {item.label}
              </dt>
              <dd className={`${item.besar ? "text-[20px] font-extrabold md:text-[24px]" : "text-[16px] font-semibold"} leading-[1.3] [overflow-wrap:anywhere]`}>{item.nilai}</dd>
              {item.catatan ? (
                <dd className="text-[14px] leading-5" style={{ color: REDUP }}>
                  {item.catatan}
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}

/** Perjalanan bus per agenda di kartu Bus: nama agenda, jam, rute, titik kumpul. */
export function PerjalananBusHorizon({ baris }: { baris: { kunci: string; judul: string; jam: string | null; detail: string[]; kru?: ReactNode }[] }) {
  if (baris.length === 0) return null;
  return (
    <ol className="flex flex-col border-t border-dashed" style={{ borderColor: "#C9D1DE" }}>
      {baris.map((item) => (
        <li key={item.kunci} className="flex flex-col gap-1 border-b border-dashed py-4 last:border-b-0 last:pb-0" style={{ borderColor: "#C9D1DE" }}>
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.judul}</span>
            {item.jam ? <span className="whitespace-nowrap text-[14px] font-medium tabular-nums" style={{ color: BIRU }}>{item.jam}</span> : null}
          </p>
          {item.detail.map((teks) => (
            <p key={teks} className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
              {teks}
            </p>
          ))}
          {item.kru}
        </li>
      ))}
    </ol>
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: LABEL }}>
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
 * Pilihan hari di ponsel (halaman Outfit): pil yang sama dengan pilihan hari
 * tab Jadwal Horizon. Layar lebar memakai HariJadwalHorizon di kiri.
 */
export function ChipHariHorizon({ hari, aria }: { hari: { label: string; href: string; aktif: boolean }[]; aria: string }) {
  return (
    <nav aria-label={aria} className="-mx-5 overflow-x-auto px-5 [mask-image:linear-gradient(to_right,transparent,#000_20px,#000_calc(100%-56px),transparent)] sm:mx-0 sm:px-0 sm:[mask-image:none] lg:hidden">
      <ul className="flex gap-2">
        {hari.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.aktif ? "page" : undefined}
              className={`m3-state inline-flex min-h-12 min-w-[104px] items-center justify-center whitespace-nowrap rounded-full px-5 text-[14px] font-semibold leading-5 ${
                item.aktif ? "bg-[var(--hz-emas)] text-[var(--hz-on-emas)]" : "bg-white text-[#1A2333] shadow-[inset_0_0_0_1px_#E6E9EE]"
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

/**
 * Kartu satu outfit (pola "Attire" Zola, "Tonight's Attire" Royal Caribbean):
 * foto contoh 4:5 bila ada (tanpa kotak kosong bila tidak), waktu sebagai alis
 * biru, pakaiannya sebagai judul, catatan redup.
 */
export function KartuOutfitHorizon({ kapan, apa, catatan, foto }: { kapan: string | null; apa: string; catatan: string | null; foto: string | null }) {
  // Rancangan yang Mas Hanung setujui: foto kecil 4:5 di samping teks, jadi satu
  // hari dengan tiga pakaian tetap terbaca sekilas. Ketuk foto untuk ukuran penuh.
  return (
    <article className="flex min-w-0 items-start gap-4 rounded-[20px] bg-white p-4 md:gap-5 md:rounded-[24px] md:p-5" style={{ color: TINTA }}>
      {foto ? (
        <a href={foto} target="_blank" rel="noreferrer noopener" className="m3-state block w-24 shrink-0 overflow-hidden rounded-[16px] md:w-32">
          {/* Foto dari unggahan admin: ukuran asli tidak diketahui, jadi <img> biasa dipotong 4:5.
              Hiasan: isi kartu sudah menyebut pakaiannya. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="" loading="lazy" decoding="async" className="aspect-[4/5] w-full bg-[#EEF1F6] object-cover" />
        </a>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        {kapan ? (
          <p className="text-[12px] font-bold uppercase leading-4 tracking-[0.8px] [overflow-wrap:anywhere]" style={{ color: BIRU }}>
            {kapan}
          </p>
        ) : null}
        <h3 className="text-[17px] font-semibold leading-6 [overflow-wrap:anywhere] md:text-[20px] md:leading-7">{apa}</h3>
        {catatan ? (
          <p className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
            {catatan}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export type BarisProfil = { href: string; judul: string; isi: string | null; Ikon: typeof Train; luar?: boolean };

function DaftarProfil({ baris, rapat = false }: { baris: BarisProfil[]; rapat?: boolean }) {
  return (
    <ul className={rapat ? "" : "-mx-2 -mb-2 md:-mx-3 md:-mb-3"}>
      {baris.map(({ href, judul, isi, Ikon, luar }) => {
        const dalam = (
          <>
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF1F6]">
              <Ikon size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[16px] font-semibold leading-6">{judul}</span>
              {isi ? (
                <span className="truncate text-[14px] leading-5" style={{ color: REDUP }}>
                  {isi}
                </span>
              ) : null}
            </span>
            <CaretRight size={18} aria-hidden className="shrink-0" style={{ color: LABEL }} />
          </>
        );
        const kelas = "m3-state flex min-h-16 items-center gap-4 rounded-[14px] px-2 py-2 md:px-3";
        return (
          <li key={judul} className="border-[#E6E8EC] [&+&]:border-t">
            {luar ? (
              <a href={href} className={kelas}>
                {dalam}
              </a>
            ) : (
              <Link href={href} className={kelas}>
                {dalam}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function JudulKartuProfil({ Ikon, judul }: { Ikon: typeof Train; judul: string }) {
  return (
    <div className="flex items-center gap-2">
      <Ikon size={18} weight="bold" aria-hidden style={{ color: BIRU }} />
      <h2 className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: LABEL }}>
        {judul}
      </h2>
    </div>
  );
}

const KARTU_PROFIL = "flex flex-col gap-5 rounded-[20px] bg-white p-5 md:rounded-[24px] md:p-7";

/**
 * Halaman Profil Horizon (pola halaman akun Luma/Eventbrite dan Airbnb/Google
 * Account): kartu tiket navy berisi identitas dan QR, data diri sebagai label
 * dan nilai, lalu bantuan dan pengaturan dalam satu kartu. Layar lebar dua
 * kolom; ponsel satu tumpukan dengan Menu (Perjalanan, Outfit) di bawah tiket,
 * karena di ponsel halaman ini adalah tab "Menu".
 */
export function ProfilHorizon({
  sisipan,
  kartu,
  menu,
  data,
  bantuan,
  keluar,
}: {
  sisipan: ReactNode;
  kartu: {
    inisial: string;
    nama: string;
    catatan: string | null;
    status: string;
    qr: { href: string; label: string; kode: string; petunjuk: string; perbesar: string; gambar: ReactNode } | null;
  };
  menu: { judul: string; baris: BarisProfil[] };
  data: { judul: string; fakta: { label: string; nilai: string }[]; salah: { teks: string; tautan: { href: string; label: string } } | null };
  bantuan: { judul: string; baris: BarisProfil[] };
  keluar: { action: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 md:gap-6">
      {sisipan}
      <div className="flex flex-col gap-4 md:gap-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <section aria-label={kartu.qr?.label ?? kartu.nama} className="overflow-hidden rounded-[20px] bg-[var(--hz-navy)] text-white md:rounded-[24px]">
            <div className="flex items-center gap-4 p-5 md:gap-5 md:p-[30px]">
              <span aria-hidden className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--hz-emas)] text-[19px] font-extrabold text-[var(--hz-on-emas)] md:size-[72px] md:text-[26px]">
                {kartu.inisial}
              </span>
              <div className="flex min-w-0 flex-col items-start">
                <p className="text-[21px] font-extrabold leading-[1.2] [overflow-wrap:anywhere] md:text-[28px]">{kartu.nama}</p>
                {kartu.catatan ? (
                  <p className="text-[14px] leading-5 [overflow-wrap:anywhere] md:text-[15px]" style={{ color: REDUP_NAVY }}>
                    {kartu.catatan}
                  </p>
                ) : null}
                <p className="mt-2.5 inline-flex min-h-7 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--hz-emas)]">
                  {kartu.status}
                </p>
              </div>
            </div>
            {kartu.qr ? (
              <PemicuQr
                id="pemicu-qr-profil"
                href={kartu.qr.href}
                className="m3-state flex items-center gap-4 border-t border-dashed border-[#405272] px-5 pb-5 pt-[18px] focus-visible:outline-offset-[-4px] md:gap-6 md:px-[30px] md:pb-[30px] md:pt-[26px]"
              >
                <span className="size-[92px] shrink-0 rounded-[14px] bg-white p-2 md:size-[136px] md:rounded-[20px] md:p-2.5">{kartu.qr.gambar}</span>
                <span className="flex min-w-0 flex-col items-start">
                  <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-[var(--hz-emas)]">{kartu.qr.label}</span>
                  <span className="mt-1 text-[20px] font-extrabold tracking-[0.5px] [overflow-wrap:anywhere] md:text-[24px]">{kartu.qr.kode}</span>
                  <span className="mt-0.5 text-[14px] leading-5" style={{ color: REDUP_NAVY }}>
                    {kartu.qr.petunjuk}
                  </span>
                  <span className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[var(--hz-emas)] px-4 text-[14px] font-bold text-[var(--hz-on-emas)]">
                    <ArrowsOut size={16} weight="bold" aria-hidden />
                    {kartu.qr.perbesar}
                  </span>
                </span>
              </PemicuQr>
            ) : null}
          </section>
          {/* Layar lebar: Perjalanan dan Outfit sudah ada di bilah atas. */}
          {menu.baris.length > 0 ? (
            <section aria-label={menu.judul} className="rounded-[20px] bg-white p-3 md:hidden" style={{ color: TINTA }}>
              <DaftarProfil baris={menu.baris} rapat />
            </section>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <section aria-label={data.judul} className={KARTU_PROFIL} style={{ color: TINTA }}>
            <JudulKartuProfil Ikon={User} judul={data.judul} />
            <dl className="grid gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5">
              {data.fakta.map((item) => (
                <div key={item.label} className="flex min-w-0 flex-col gap-1">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: LABEL }}>
                    {item.label}
                  </dt>
                  <dd className="text-[16px] font-semibold leading-[1.3] [overflow-wrap:anywhere]">{item.nilai}</dd>
                </div>
              ))}
            </dl>
            {data.salah ? (
              <p className="border-t border-[#E6E8EC] pt-4 text-[14px]" style={{ color: REDUP }}>
                {data.salah.teks}{" "}
                <a href={data.salah.tautan.href} className="font-semibold underline-offset-2 hover:underline" style={{ color: BIRU }}>
                  {data.salah.tautan.label}
                </a>
              </p>
            ) : null}
          </section>
          {bantuan.baris.length > 0 ? (
            <section aria-label={bantuan.judul} className={KARTU_PROFIL} style={{ color: TINTA }}>
              <JudulKartuProfil Ikon={Lifebuoy} judul={bantuan.judul} />
              <DaftarProfil baris={bantuan.baris} />
            </section>
          ) : null}
          <form method="post" action={keluar.action}>
            <button type="submit" className="m3-state inline-flex min-h-12 items-center gap-2 rounded-full border border-[#F1C9C5] bg-white px-7 text-[15px] font-bold text-[#B42318] [--m3-state-color:#B42318]">
              <SignOut size={18} aria-hidden />
              {keluar.label}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
