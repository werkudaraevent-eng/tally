import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowsOut, Broadcast, Bus, CaretRight, CoatHanger, Suitcase } from "@phosphor-icons/react/dist/ssr";
import { PenandaTab } from "@/components/member/muat-portal";
import { ChipHorizon, GARIS_KARTU } from "@/components/member/portal-horizon";
import { PemicuQr } from "@/components/member/qr-fokus";

/**
 * Kartu Beranda "Hari ini" Gathering Horizon (keputusan Mas 20 Okt; papan
 * "Area peserta · usulan 20 Okt", layar rxapD, v5T1l, Uq6Qy, Qpgcc). Beranda
 * hanya memuat yang penting hari itu; tiap info punya satu rumah (hotel, bus,
 * dan kereta di Perjalanan, dresscode di Susunan acara, QR di bilah bawah),
 * dan kartu di sini meringkasnya dengan tautan ke rumahnya.
 *
 * Teks datang apa adanya dari data yang sudah ada; yang datanya kosong tidak
 * ditampilkan. Label 12-13 px dalam kalimat biasa (U-25).
 */

const TINTA = "#101E38";
const REDUP = "#526078";
const LABEL = "#4D5D77";
const BIRU = "#274FC0";
const KARTU = `${GARIS_KARTU} rounded-[20px] bg-white md:rounded-[24px]`;
const GARIS = "border-[#E6E8EC]";

/** Ikon kartu dalam ubin abu-abu, sama dengan kartu Checkpoint. */
function UbinIkon({ Ikon }: { Ikon: typeof Bus }) {
  return (
    <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#EEF1F6]" style={{ color: TINTA }}>
      <Ikon size={22} />
    </span>
  );
}

/** Tautan teks biru setinggi 48 px dengan panah, ke halaman rumah infonya. */
function TautanKartu({ href, label, tab, lampu, className = "" }: { href: string; label: string; tab: string; lampu?: string; className?: string }) {
  return (
    <Link href={href} className={`m3-state -mx-2 inline-flex min-h-12 items-center gap-1 rounded-md px-2 text-[15px] font-semibold ${className}`} style={{ color: BIRU }}>
      {label}
      <CaretRight size={16} aria-hidden className="shrink-0" />
      <PenandaTab tab={tab} lampu={lampu} />
    </Link>
  );
}

export type ButirSekarang = { kunci: string; label: string | null; judul: string; catatan: string | null };

/**
 * Kartu Sekarang dan berikutnya (E-06, U-05; pola layar Now + Up next): yang
 * sedang berjalan dan yang berikutnya dalam satu kartu, berdampingan mulai
 * 1280 px. Bus pagi itu tampil di butir berikutnya bila perjalanan Logistik
 * tertaut ke barisnya. Tanpa yang berlangsung dan dengan satu butir
 * berikutnya, butir sesudahnya tampil sebagai satu baris ringkas. Hari dengan beberapa bagian (peserta
 * tanpa jawaban batch): satu butir per bagian, dengan label bagiannya.
 */
export function KartuSekarangHorizon({
  berlangsung,
  berikutnya,
  sesudahnya,
  tautan,
}: {
  berlangsung: { status: string; butir: (ButirSekarang & { sampai: string | null })[] } | null;
  berikutnya: (ButirSekarang & { alis: string; hitung: string | null; bus: { judul: string; catatan: string | null } | null })[];
  sesudahnya: { judul: string; jam: string } | null;
  tautan: { href: string; label: string; tab: string } | null;
}) {
  const adaSekarang = Boolean(berlangsung && berlangsung.butir.length > 0);
  const adaBerikut = berikutnya.length > 0;
  if (!adaSekarang && !adaBerikut) return null;
  return (
    <section className={`${KARTU} overflow-hidden`} style={{ color: TINTA }}>
      <div className={adaSekarang && adaBerikut ? "xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}>
        {adaSekarang && berlangsung ? (
          <div className={`flex flex-col gap-5 p-5 md:p-7 ${adaBerikut ? `border-b ${GARIS} xl:border-b-0 xl:border-r` : ""}`}>
            {berlangsung.butir.map((item, index) => (
              <div key={item.kunci} className={`flex flex-col gap-1.5 ${index > 0 ? `border-t ${GARIS} pt-5` : ""}`}>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <ChipHorizon nada="aksi">
                    <Broadcast size={16} weight="bold" aria-hidden />
                    {berlangsung.status}
                  </ChipHorizon>
                  {item.label && berlangsung.butir.length > 1 ? <ChipHorizon>{item.label}</ChipHorizon> : null}
                  {item.sampai ? <span className="text-[14px] font-semibold text-[var(--alis)]">{item.sampai}</span> : null}
                </p>
                <h2 className="mt-1 text-[20px] font-semibold leading-7 [overflow-wrap:anywhere]">{item.judul}</h2>
                {item.catatan ? (
                  <p className="text-[15px] leading-[22px] [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                    {item.catatan}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {adaBerikut ? (
          <div className="flex min-w-0 flex-col gap-5 p-5 md:p-7">
            {berikutnya.map((item, index) => (
              <div key={item.kunci} className={`flex flex-col ${index > 0 ? `border-t ${GARIS} pt-5` : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] leading-[18px]" style={{ color: LABEL }}>
                    {item.label && berikutnya.length > 1 ? <ChipHorizon>{item.label}</ChipHorizon> : null}
                    <span>{item.alis}</span>
                  </p>
                  {item.hitung ? <span className="shrink-0 text-[13px] font-semibold leading-[18px] text-[var(--alis)]">{item.hitung}</span> : null}
                </div>
                <h2 className="mt-2 text-balance text-[24px] font-bold leading-[1.25] [overflow-wrap:anywhere] md:text-[28px]">{item.judul}</h2>
                {item.catatan ? (
                  <p className="mt-1 text-[15px] leading-[22px] [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                    {item.catatan}
                  </p>
                ) : null}
                {item.bus ? (
                  <div className="mt-4 flex items-center gap-3">
                    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#EEF1F6]">
                      <Bus size={20} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-[22px]">{item.bus.judul}</p>
                      {item.bus.catatan ? (
                        <p className="text-[13px] leading-[18px] [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                          {item.bus.catatan}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {sesudahnya ? (
              <p className={`flex items-baseline justify-between gap-4 border-t ${GARIS} pt-4 text-[15px] font-medium leading-[22px]`}>
                <span className="min-w-0 [overflow-wrap:anywhere]">{sesudahnya.judul}</span>
                <span className="shrink-0 tabular-nums" style={{ color: REDUP }}>
                  {sesudahnya.jam}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {tautan ? (
        <div className={`border-t ${GARIS} px-5 py-1 md:px-7`}>
          <TautanKartu href={tautan.href} label={tautan.label} tab={tautan.tab} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * Kartu dresscode di Beranda: pakaian hari ini (saat acara) atau tanggal
 * berikutnya (sebelum acara), mengikuti batch peserta, ditulis apa adanya
 * seperti diisi panitia di Agenda > Section > Outfit. Judulnya memakai label
 * halaman acara ("Dresscode hari ini"). "Lihat semua" di bawah isian di ponsel
 * dan di kolom samping desktop (mulai 1024 px); di kepala kartu pada 768-1023 px.
 */
export function KartuOutfitBerandaHorizon({
  judul,
  meta,
  isian,
  tautan,
}: {
  judul: string;
  meta: string | null;
  isian: { kunci: string; kapan: string | null; apa: string; catatan: string | null; foto: string | null }[];
  tautan: { href: string; label: string; tab: string; lampu?: string };
}) {
  if (isian.length === 0) return null;
  return (
    <section aria-labelledby="outfit-beranda-judul" className={`${KARTU} grid grid-cols-1 gap-x-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:p-7 lg:grid-cols-1`} style={{ color: TINTA }}>
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
        <UbinIkon Ikon={CoatHanger} />
        <h2 id="outfit-beranda-judul" className="min-w-0 text-[17px] font-semibold leading-6 [overflow-wrap:anywhere]">
          {judul}
        </h2>
      </div>
      <div className="row-start-2 min-w-0 md:col-span-2 lg:col-span-1">
        {meta ? (
          <p className="mt-4 text-[13px] leading-[18px]" style={{ color: LABEL }}>
            {meta}
          </p>
        ) : null}
        <ul className={`flex flex-col gap-4 ${meta ? "mt-3" : "mt-4"}`}>
          {isian.map((item) => (
            <li key={item.kunci} className="flex items-start gap-3">
              {item.foto ? (
                // Foto contoh dari panitia (opsional), 4:5 seperti di halaman dresscode.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.foto} alt="" loading="lazy" decoding="async" className="h-[70px] w-14 shrink-0 rounded-[12px] object-cover" />
              ) : null}
              <div className="min-w-0">
                {item.kapan ? (
                  <p className="text-[13px] leading-[18px]" style={{ color: LABEL }}>
                    {item.kapan}
                  </p>
                ) : null}
                <p className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.apa}</p>
                {item.catatan ? (
                  <p className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                    {item.catatan}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <TautanKartu
        href={tautan.href}
        label={tautan.label}
        tab={tautan.tab}
        lampu={tautan.lampu}
        // Ponsel dan kolom samping desktop: di bawah isian; 768-1023 px (satu kolom lebar): di kepala kartu.
        className="row-start-3 mt-3 self-start justify-self-start md:col-start-2 md:row-start-1 md:mt-0 md:self-center lg:col-start-1 lg:row-start-3 lg:mt-3 lg:self-start"
      />
    </section>
  );
}

/**
 * Kartu Perjalananmu, pengganti kartu perjalanan selama acara: hotel dan
 * kamar (dengan teman sekamar), kereta berikutnya, atau bus bila tanpa
 * keduanya. Rincian lengkapnya di halaman Perjalanan.
 */
export function KartuPerjalananmuHorizon({
  judul,
  tautan,
  baris,
}: {
  judul: string;
  tautan: { href: string; label: string; tab: string } | null;
  baris: { kunci: string; label: string; judul: string; catatan: string | null }[];
}) {
  if (baris.length === 0) return null;
  return (
    <section aria-labelledby="perjalananmu-judul" className={`${KARTU} grid grid-cols-1 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-3 md:p-7`} style={{ color: TINTA }}>
      <div className="row-start-1 flex min-w-0 items-center gap-3">
        <UbinIkon Ikon={Suitcase} />
        <h2 id="perjalananmu-judul" className="min-w-0 text-[17px] font-semibold leading-6">
          {judul}
        </h2>
      </div>
      {/* Ponsel: di bawah isinya; mulai 768 px di kepala kartu. */}
      {tautan ? (
        <TautanKartu href={tautan.href} label={tautan.label} tab={tautan.tab} className="row-start-3 mt-3 justify-self-start md:col-start-2 md:row-start-1 md:mt-0 md:self-center" />
      ) : null}
      <dl className={`row-start-2 mt-4 grid gap-4 md:col-span-2 ${baris.length > 1 ? "md:grid-cols-2 md:gap-6" : ""}`}>
        {baris.map((item, index) => (
          <div key={item.kunci} className={`flex min-w-0 flex-col gap-0.5 ${index > 0 ? `border-t ${GARIS} pt-4 md:border-t-0 md:pt-0` : ""}`}>
            <dt className="text-[13px] leading-[18px]" style={{ color: LABEL }}>
              {item.label}
            </dt>
            <dd className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.judul}</dd>
            {item.catatan ? (
              <dd className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                {item.catatan}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Kartu QR kehadiran di kolom samping desktop: mulai 1024 px bilah bawah
 * (dan tombol QR emasnya) tidak ada, jadi QR tetap satu ketukan dari Beranda.
 * Tombolnya satu-satunya tombol emas di layar itu.
 */
export function KartuQrSampingHorizon({ href, judul, tombol, kode }: { href: string; judul: string; tombol: string; kode: ReactNode }) {
  return (
    <section aria-labelledby="qr-samping-judul" className={`${KARTU} hidden items-center gap-4 p-5 md:p-6 lg:flex`} style={{ color: TINTA }}>
      <span className="size-[72px] shrink-0 rounded-[14px] bg-white p-1.5 ring-1 ring-[#E6E9EE]">{kode}</span>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <h2 id="qr-samping-judul" className="text-[16px] font-semibold leading-6">
          {judul}
        </h2>
        <PemicuQr
          id="pemicu-qr-samping"
          href={href}
          className="m3-state inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--hz-emas)] px-5 text-[14px] font-bold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)]"
        >
          <ArrowsOut size={16} weight="bold" aria-hidden />
          {tombol}
        </PemicuQr>
      </div>
    </section>
  );
}
