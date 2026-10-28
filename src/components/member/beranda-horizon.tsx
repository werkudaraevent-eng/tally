import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowsOut, Broadcast, Bus, CaretRight, CoatHanger, Suitcase } from "@phosphor-icons/react/dist/ssr";
import { PenandaTab } from "@/components/member/muat-portal";
import { ChipHorizon, KARTU_HZ, KELAS_ALIS, KELAS_KET, KELAS_NILAI, KELAS_TAUTAN, KepalaKartuHorizon, PAD_KARTU } from "@/components/member/portal-horizon";
import { PemicuQr } from "@/components/member/qr-fokus";

/**
 * Kartu Beranda "Hari ini" Gathering Horizon (keputusan Mas 20 Okt; papan
 * "Area peserta · usulan 20 Okt", layar rxapD, v5T1l, Uq6Qy, Qpgcc). Beranda
 * hanya memuat yang penting hari itu; tiap info punya satu rumah (hotel, bus,
 * dan kereta di Perjalanan, dresscode di Susunan acara, QR di bilah bawah),
 * dan kartu di sini meringkasnya dengan tautan ke rumahnya.
 *
 * Teks datang apa adanya dari data yang sudah ada; yang datanya kosong tidak
 * ditampilkan. Ukuran dan jarak mengikuti DESIGN.md "Kartu di portal Horizon".
 */

const TINTA = "#101E38";
const REDUP = "#526078";
const LABEL = "#4D5D77";
const BIRU = "#274FC0";
const KARTU = KARTU_HZ;
const GARIS = "border-[#E6E8EC]";

/** Tautan teks biru dengan panah ke halaman rumah infonya; area ketuk 48 px tanpa menambah jarak. */
function TautanKartu({ href, label, tab, lampu, className = "" }: { href: string; label: string; tab: string; lampu?: string; className?: string }) {
  return (
    <Link href={href} className={`m3-state -mx-2 rounded-md px-2 ${KELAS_TAUTAN} ${className}`} style={{ color: BIRU }}>
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
          <div className={`flex flex-col gap-4 ${PAD_KARTU} ${adaBerikut ? `border-b ${GARIS} xl:border-b-0 xl:border-r` : ""}`}>
            {berlangsung.butir.map((item, index) => (
              <div key={item.kunci} className={`flex flex-col gap-1 ${index > 0 ? `border-t ${GARIS} pt-4` : ""}`}>
                <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ChipHorizon nada="aksi">
                    <Broadcast size={16} weight="bold" aria-hidden />
                    {berlangsung.status}
                  </ChipHorizon>
                  {item.label && berlangsung.butir.length > 1 ? <ChipHorizon>{item.label}</ChipHorizon> : null}
                  {item.sampai ? <span className="text-[14px] font-semibold leading-5 text-[var(--alis)]">{item.sampai}</span> : null}
                </p>
                <h2 className="text-[18px] font-bold leading-6 [overflow-wrap:anywhere]">{item.judul}</h2>
                {item.catatan ? (
                  <p className={KELAS_KET} style={{ color: REDUP }}>
                    {item.catatan}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {adaBerikut ? (
          <div className={`flex min-w-0 flex-col gap-4 ${PAD_KARTU}`}>
            {berikutnya.map((item, index) => (
              <div key={item.kunci} className={`flex flex-col gap-1 ${index > 0 ? `border-t ${GARIS} pt-4` : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${KELAS_ALIS}`} style={{ color: LABEL }}>
                    {item.label && berikutnya.length > 1 ? <ChipHorizon>{item.label}</ChipHorizon> : null}
                    <span>{item.alis}</span>
                  </p>
                  {item.hitung ? <span className={`shrink-0 ${KELAS_ALIS} text-[var(--alis)]`}>{item.hitung}</span> : null}
                </div>
                {/* Satu-satunya judul 22/28 di portal: kartu sorotan Beranda (DESIGN.md). */}
                <h2 className="text-balance text-[22px] font-bold leading-7 [overflow-wrap:anywhere]">{item.judul}</h2>
                {item.catatan ? (
                  <p className={KELAS_KET} style={{ color: REDUP }}>
                    {item.catatan}
                  </p>
                ) : null}
                {item.bus ? (
                  <div className="mt-2 flex items-start gap-3 rounded-[12px] px-3 py-2" style={{ background: "#F1F3F8" }}>
                    <Bus size={22} weight="bold" aria-hidden className="mt-px shrink-0" />
                    <div className="min-w-0">
                      <p className={KELAS_NILAI}>{item.bus.judul}</p>
                      {item.bus.catatan ? (
                        <p className={KELAS_KET} style={{ color: REDUP }}>
                          {item.bus.catatan}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {sesudahnya ? (
              <p className={`flex items-baseline justify-between gap-4 border-t ${GARIS} pt-4 text-[14px] font-medium leading-5`}>
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
        <div className={`border-t ${GARIS} px-4 py-3.5 md:px-6`}>
          {/* Kaki kartu setinggi tautannya (48 px): cincin fokus ke dalam supaya tidak terpotong tepi kartu. */}
          <TautanKartu href={tautan.href} label={tautan.label} tab={tautan.tab} className="focus-visible:!outline-offset-[-2px]" />
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
    <section aria-labelledby="outfit-beranda-judul" className={`${KARTU} flex flex-col gap-4 ${PAD_KARTU}`} style={{ color: TINTA }}>
      <KepalaKartuHorizon Ikon={CoatHanger} judul={judul} idJudul="outfit-beranda-judul" />
      {/* Tanggal dan batch bisa panjang (kolom samping desktop 360 px): satu baris alis, bukan keterangan kepala. */}
      {meta ? (
        <p className={`-mb-1 ${KELAS_ALIS}`} style={{ color: LABEL }}>
          {meta}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {isian.map((item) => (
          <li key={item.kunci} className="flex items-start gap-3">
            {item.foto ? (
              // Foto contoh dari panitia (opsional), 4:5 seperti di halaman dresscode.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.foto} alt="" loading="lazy" decoding="async" className="h-[70px] w-14 shrink-0 rounded-[12px] object-cover" />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              {item.kapan ? (
                <p className={KELAS_ALIS} style={{ color: LABEL }}>
                  {item.kapan}
                </p>
              ) : null}
              <p className={KELAS_NILAI}>{item.apa}</p>
              {item.catatan ? (
                <p className={KELAS_KET} style={{ color: REDUP }}>
                  {item.catatan}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <TautanKartu href={tautan.href} label={tautan.label} tab={tautan.tab} lampu={tautan.lampu} />
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
    <section aria-labelledby="perjalananmu-judul" className={`${KARTU} flex flex-col gap-4 ${PAD_KARTU}`} style={{ color: TINTA }}>
      <KepalaKartuHorizon Ikon={Suitcase} judul={judul} idJudul="perjalananmu-judul" />
      <dl className={`grid gap-3 ${baris.length > 1 ? "md:grid-cols-2 md:gap-6" : ""}`}>
        {baris.map((item, index) => (
          <div key={item.kunci} className={`flex min-w-0 flex-col gap-1 ${index > 0 ? `border-t ${GARIS} pt-3 md:border-t-0 md:pt-0` : ""}`}>
            <dt className={KELAS_ALIS} style={{ color: LABEL }}>
              {item.label}
            </dt>
            <dd className={KELAS_NILAI}>{item.judul}</dd>
            {item.catatan ? (
              <dd className={KELAS_KET} style={{ color: REDUP }}>
                {item.catatan}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
      {tautan ? <TautanKartu href={tautan.href} label={tautan.label} tab={tautan.tab} /> : null}
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
    <section aria-labelledby="qr-samping-judul" className={`${KARTU} hidden items-center gap-4 ${PAD_KARTU} lg:flex`} style={{ color: TINTA }}>
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
