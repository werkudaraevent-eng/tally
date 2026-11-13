import type { ReactNode } from "react";
import Link from "next/link";
import { CaretRight, SignOut, Train } from "@phosphor-icons/react/dist/ssr";
import { FormKeluar } from "@/components/member/form-keluar";
import { PenandaTab } from "@/components/member/muat-portal";
import { PemicuQr } from "@/components/member/qr-fokus";
import { KARTU_HZ, KELAS_ALIS, KELAS_KET, KELAS_TAUTAN, LABEL, PAD_KARTU, REDUP, TINTA } from "./gaya";

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
export function DaftarProfil({ baris }: { baris: BarisProfil[] }) {
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
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--hz-emas)] text-[18px] font-bold text-[var(--hz-on-emas)] shadow-[0_0_0_2px_var(--hz-navy),0_0_0_4px_var(--hz-emas)]">
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
            <a href={bantuan.tautan.href} className={KELAS_TAUTAN} style={{ color: TINTA }}>
              {bantuan.tautan.label}
            </a>
          ) : null}
          {bantuan.kontak}
        </div>
      ) : null}
    </div>
  );
}
