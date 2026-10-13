import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, CalendarDots, Compass, QrCode, Train, User, X } from "@phosphor-icons/react/dist/ssr";
import type { PortalTab } from "@/components/member/dashboard-gathering";

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

const IKON_TAB = { beranda: Compass, jadwal: CalendarDots, info: Bell, profil: User } as const;

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
        <nav aria-label={tabsAria} className="hidden md:block">
          <ul className="flex items-center gap-4">
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
export function NavBawahHorizon({ tabs, aktif, tabsAria, infoBaru }: { tabs: TabHorizon[]; aktif: Exclude<PortalTab, "qr">; tabsAria: string; infoBaru: boolean }) {
  return (
    <nav aria-label={tabsAria} className="fixed inset-x-0 bottom-0 z-20 bg-white px-2 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-1px_0_#E6E9EE] md:hidden">
      <ul className="mx-auto grid max-w-[560px] grid-cols-4">
        {tabs.map((tab) => {
          const Ikon = IKON_TAB[tab.id];
          const ini = tab.id === aktif;
          return (
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
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Sapaan (frame "Personal greeting"; ponsel: "Personal greeting" 30/800). */
export function SapaanHorizon({ alis, judul, judulPonsel, catatan }: { alis: string; judul: string; judulPonsel: string; catatan: string }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 pt-6 md:px-16 md:pb-7 md:pt-12">
      <p className="hidden text-[11px] font-bold uppercase leading-[1.26] tracking-[1.5px] md:block" style={{ color: LABEL }}>
        {alis}
      </p>
      <h1 className="whitespace-pre-line text-balance text-[30px] font-extrabold leading-[1.15] [overflow-wrap:anywhere] md:mt-[14px] md:text-[48px] md:leading-[1.2]" style={{ color: TINTA }}>
        <span className="md:hidden">{judulPonsel}</span>
        <span className="hidden md:inline">{judul}</span>
      </h1>
      <p className="mt-[14px] hidden text-[17px] leading-[1.5] md:block" style={{ color: REDUP }}>
        {catatan}
      </p>
    </div>
  );
}

export type FaktaPass = { label: string; nilai: string; ponsel: boolean };

/** Kartu "Personal journey pass": KV, rute, dan fakta peserta. */
export function PassHorizon({
  kv,
  label,
  tanggalPendek,
  tanggalPanjang,
  dari,
  ke,
  fakta,
}: {
  kv: string | null;
  label: string;
  tanggalPendek: string | null;
  tanggalPanjang: string | null;
  dari: string | null;
  ke: string;
  fakta: FaktaPass[];
}) {
  const faktaPonsel = fakta.filter((item) => item.ponsel);
  return (
    <section aria-label={label} className="overflow-hidden rounded-[20px] bg-[var(--hz-navy)] text-white md:rounded-[24px]">
      {kv ? (
        // Hiasan: KV acara, dipotong tengah seperti rancangan (cover).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={kv} alt="" aria-hidden decoding="async" className="h-[145px] w-full select-none object-cover md:h-[200px]" />
      ) : null}
      <div className="flex flex-col gap-4 p-5 md:gap-6 md:p-[30px]">
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
          <dl className="hidden justify-between gap-6 border-t pt-5 md:flex" style={{ borderColor: GARIS_NAVY }}>
            {fakta.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-col gap-2">
                <dt className="text-[10px] uppercase tracking-[1px]" style={{ color: REDUP_NAVY }}>
                  {item.label}
                </dt>
                <dd className="text-[16px] font-bold [overflow-wrap:anywhere]">{item.nilai}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {faktaPonsel.length > 0 ? (
          <dl className="grid grid-cols-2 gap-7 border-t pt-4 md:hidden" style={{ borderColor: GARIS_NAVY }}>
            {faktaPonsel.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-col gap-[5px]">
                <dt className="text-[10px] uppercase tracking-[1px]" style={{ color: REDUP_NAVY }}>
                  {item.label}
                </dt>
                <dd className="text-[26px] font-extrabold leading-[1.26] [overflow-wrap:anywhere]">{item.nilai}</dd>
              </div>
            ))}
          </dl>
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
    <section className="flex flex-col gap-3 md:gap-5 md:rounded-[24px] md:bg-white md:p-7" style={{ color: TINTA }}>
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
