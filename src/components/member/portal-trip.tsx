import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowsOut, CalendarPlus, CaretRight, Train } from "@phosphor-icons/react/dist/ssr";
import { PenandaTab } from "@/components/member/muat-portal";
import { PemicuQr } from "@/components/member/qr-fokus";
import { GARIS_KARTU, KELAS_ALIS, KELAS_KET, LATAR_PORTAL_HORIZON, LipatanHorizon, type LegKereta } from "@/components/member/portal-horizon";
import { SalinKodeTrip } from "@/components/member/salin-kode-trip";
import { lamaPerjalanan } from "@/lib/member/rencana-trip";

/**
 * Tema Gathering Trip (keputusan Mas 28 Okt 2026): portal peserta Horizon
 * dengan pola aplikasi perjalanan. Mockup yang disetujui:
 * https://claude.ai/artifact/AC8fPPthwhccpbkwuApQTM
 *
 * - Tiket kereta seperti e-tiket tiket.com: jam besar, lama perjalanan, sobekan.
 * - Hotel seperti reservasi Airbnb: kotak Check-in | Check-out.
 * - Tiap jenis pesanan punya kepala bagian sendiri dengan ikon berwarna
 *   (Trip.com My bookings), jadi Kereta, Hotel, dan Kendaraan tidak terbaca
 *   sebagai satu kolom panjang.
 *
 * Hanya dipakai bila `horizon_style === "trip"`; Horizon klasik tidak berubah.
 */

const TINTA = "#101E38";
const REDUP = "#526078";
const GARIS = "rgb(16 30 56 / 0.12)";

/** Warna ubin per jenis pesanan: semantik, bukan aksen tema (pola Trip.com). */
export const NADA_TRIP = {
  kereta: { latar: "#E6EEFB", ikon: "#1F4E9C" },
  hotel: { latar: "#E7F4EC", ikon: "#1E7B45" },
  bus: { latar: "#F6E9F3", ikon: "#8A2B6E" },
  bagasi: { latar: "#FBF3D9", ikon: "#6B4F00" },
  netral: { latar: "#EEF1F6", ikon: TINTA },
} as const;
export type NadaTrip = keyof typeof NADA_TRIP;

export const KARTU_TRIP = `${GARIS_KARTU} rounded-[16px] bg-white`;
/** Tautan tema Trip: navy bergaris bawah emas, area ketuk 48 px. */
export const TAUTAN_TRIP =
  "-my-3.5 inline-flex min-h-12 items-center gap-1 self-start text-[14px] font-semibold leading-5 underline decoration-[var(--hz-emas)] decoration-2 underline-offset-[5px]";

export function UbinTrip({ Ikon, nada, kecil = false }: { Ikon: typeof Train; nada: NadaTrip; kecil?: boolean }) {
  const warna = NADA_TRIP[nada];
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center ${kecil ? "size-8 rounded-[8px]" : "size-10 rounded-[12px]"}`} style={{ background: warna.latar, color: warna.ikon }}>
      <Ikon size={kecil ? 18 : 20} weight="regular" />
    </span>
  );
}

/** Kepala satu jenis pesanan: ubin, judul, dan keterangan di kanan ("2 tiket"). */
export function KepalaBagianTrip({ id, Ikon, nada, judul, meta }: { id?: string; Ikon: typeof Train; nada: NadaTrip; judul: string; meta?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <UbinTrip Ikon={Ikon} nada={nada} kecil />
      <h2 id={id} className="min-w-0 flex-1 text-[16px] font-semibold leading-6">
        {judul}
      </h2>
      {meta ? (
        <p className="shrink-0 text-[14px] leading-5" style={{ color: REDUP }}>
          {meta}
        </p>
      ) : null}
    </div>
  );
}

/** Satu bagian halaman Perjalanan: kepala lalu kartu-kartunya. */
export function BagianTrip({ id, Ikon, nada, judul, meta, duaKolom = false, children }: { id: string; Ikon: typeof Train; nada: NadaTrip; judul: string; meta?: string | null; duaKolom?: boolean; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-judul`} className="flex scroll-mt-24 flex-col gap-3 lg:scroll-mt-32" style={{ color: TINTA }}>
      <KepalaBagianTrip id={`${id}-judul`} Ikon={Ikon} nada={nada} judul={judul} meta={meta} />
      <div className={duaKolom ? "flex flex-col gap-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4" : "flex flex-col gap-3"}>{children}</div>
    </section>
  );
}

/** Pil kecil di pojok kartu ("Berangkat · Kam, 5 Nov", "Hotel 2 · 2 malam"). */
export function PilTrip({ children, emas = false }: { children: ReactNode; emas?: boolean }) {
  return (
    <span className="inline-flex min-h-6 items-center self-start rounded-full px-2 text-[12px] font-semibold leading-4" style={emas ? { background: "#FBF3D9", color: "#6B4F00" } : { background: "#EEF1F6", color: TINTA }}>
      {children}
    </span>
  );
}

/** Garis sobekan e-tiket dengan dua takik di tepi kartu. */
function Sobekan() {
  return (
    <div aria-hidden className="relative mx-4 border-t-2 border-dashed" style={{ borderColor: GARIS }}>
      <span className="absolute -left-[29px] -top-[13px] size-6 rounded-full" style={{ background: LATAR_PORTAL_HORIZON, boxShadow: `inset 0 0 0 1px ${GARIS}` }} />
      <span className="absolute -right-[29px] -top-[13px] size-6 rounded-full" style={{ background: LATAR_PORTAL_HORIZON, boxShadow: `inset 0 0 0 1px ${GARIS}` }} />
    </div>
  );
}

type LabelKereta = { gerbong: string; kursi: string; kode: string; ke: string; salin: string; tersalin: string; lama: (menit: number) => string };

/**
 * Satu tiket kereta sebagai e-tiket (pola tiket.com dan KAI Access): arah dan
 * tanggal, jam berangkat dan tiba besar dengan stasiun di bawahnya, lama
 * perjalanan di tengah, sobekan, lalu Gerbong, Kursi, dan Kode booking.
 */
export function TiketKeretaTrip({ leg, label, pertama }: { leg: LegKereta; label: LabelKereta; pertama: boolean }) {
  const lama = lamaPerjalanan(leg.berangkat ?? null, leg.tiba ?? null);
  const bentukTiket = Boolean(leg.dari && leg.ke && leg.berangkat);
  const fakta = [
    leg.gerbong ? { label: label.gerbong, nilai: leg.gerbong } : null,
    leg.kursi ? { label: label.kursi, nilai: leg.kursi } : null,
  ].filter((item): item is { label: string; nilai: string } => item !== null);
  const kartu = (
    <article aria-label={`${leg.arah}: ${leg.judul}`} className={`${KARTU_TRIP} overflow-hidden`} style={{ color: TINTA }}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-4 pb-3">
        <PilTrip emas={pertama}>{leg.arah}</PilTrip>
        {leg.baris ? (
          <p className={KELAS_ALIS} style={{ color: REDUP }}>
            {leg.baris}
          </p>
        ) : null}
      </div>
      {bentukTiket ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 pb-4">
          <p className="flex flex-col">
            <span className="text-[22px] font-bold leading-7 tabular-nums">{leg.berangkat}</span>
            <span className={KELAS_KET} style={{ color: REDUP }}>
              {leg.dari}
            </span>
          </p>
          <p className="flex flex-col items-center gap-1" style={{ color: REDUP }}>
            {lama ? <span className="text-[12px] leading-4">{label.lama(lama)}</span> : null}
            <span className="flex w-full items-center gap-1.5">
              <span className="h-0.5 flex-1" style={{ background: GARIS }} />
              <Train size={16} aria-label={label.ke} />
              <span className="h-0.5 flex-1" style={{ background: GARIS }} />
            </span>
          </p>
          <p className="flex flex-col text-right">
            <span className="text-[22px] font-bold leading-7 tabular-nums">{leg.tiba ?? ""}</span>
            <span className={KELAS_KET} style={{ color: REDUP }}>
              {leg.ke}
            </span>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-4 pb-4">
          <p className="flex flex-wrap items-center gap-x-2 text-[18px] font-bold leading-6 [overflow-wrap:anywhere]">
            {leg.dari && leg.ke ? (
              <>
                {leg.dari}
                <ArrowRight size={18} weight="bold" aria-label={label.ke} style={{ color: REDUP }} />
                {leg.ke}
              </>
            ) : (
              leg.judul
            )}
          </p>
          {leg.jam ? <p className="text-[14px] font-semibold leading-5 tabular-nums">{leg.jam}</p> : null}
        </div>
      )}
      {fakta.length > 0 || leg.kode ? (
        <>
          <Sobekan />
          <div className="flex flex-wrap gap-x-8 gap-y-3 p-4">
            {fakta.map((item) => (
              <p key={item.label} className="flex flex-col gap-1">
                <span className={KELAS_ALIS} style={{ color: REDUP }}>
                  {item.label}
                </span>
                <span className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.nilai}</span>
              </p>
            ))}
            {leg.kode ? (
              <div className="ml-auto flex flex-col gap-1">
                <span className={KELAS_ALIS} style={{ color: REDUP }}>
                  {label.kode}
                </span>
                <SalinKodeTrip kode={leg.kode} label={label.salin} tersalin={label.tersalin} />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {leg.kalender ? (
        <div className="border-t px-4" style={{ borderColor: "#E6E8EC" }}>
          <a href={leg.kalender.href} className={`${TAUTAN_TRIP} my-0 gap-2`} style={{ color: TINTA }}>
            <CalendarPlus size={18} aria-hidden />
            {leg.kalender.label}
          </a>
        </div>
      ) : null}
    </article>
  );
  return leg.lipat ? (
    <LipatanHorizon label={leg.lipat.label} judul={leg.judul} catatan={leg.lipat.catatan}>
      {kartu}
    </LipatanHorizon>
  ) : (
    kartu
  );
}

export type StayTrip = {
  pil: string;
  nama: string | null;
  alamat: string | null;
  peta: { href: string; label: string } | null;
  masuk: { label: string; hari: string; jam: string } | null;
  keluar: { label: string; hari: string; jam: string } | null;
  kamar: string;
  tipe: string | null;
  teman: { label: string; nama: string[] } | null;
};

/** Satu stay hotel seperti reservasi (Airbnb, Traveloka Hotel). */
export function KartuHotelTrip({ stay, id }: { stay: StayTrip; id?: string }) {
  return (
    <article id={id} aria-label={stay.nama ?? stay.pil} className={`${KARTU_TRIP} flex scroll-mt-24 flex-col gap-4 p-4 md:p-6 lg:scroll-mt-32`} style={{ color: TINTA }}>
      <div className="flex flex-col gap-1">
        <PilTrip>{stay.pil}</PilTrip>
        {stay.nama ? <p className="mt-2 text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{stay.nama}</p> : null}
        {stay.alamat ? (
          <p className={KELAS_KET} style={{ color: REDUP }}>
            {stay.alamat}
          </p>
        ) : null}
      </div>
      {stay.masuk || stay.keluar ? (
        <div className="grid grid-cols-2 rounded-[12px] border" style={{ borderColor: GARIS }}>
          {[stay.masuk, stay.keluar].map((waktu, urut) => (
            <div key={urut} className={`flex min-w-0 flex-col gap-1 px-4 py-3 ${urut === 1 ? "border-l" : ""}`} style={{ borderColor: GARIS }}>
              {waktu ? (
                <>
                  <span className={KELAS_ALIS} style={{ color: REDUP }}>
                    {waktu.label}
                  </span>
                  <span className="text-[14px] font-semibold leading-5">{waktu.hari}</span>
                  <span className="text-[14px] leading-5 tabular-nums" style={{ color: REDUP }}>
                    {waktu.jam}
                  </span>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[12px] px-4 py-3" style={{ background: "#EEF1F6" }}>
        <p className="text-[16px] font-semibold leading-6">{stay.kamar}</p>
        {stay.tipe ? (
          <p className="text-[14px] leading-5" style={{ color: REDUP }}>
            {stay.tipe}
          </p>
        ) : null}
      </div>
      {stay.teman && stay.teman.nama.length > 0 ? (
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold" style={{ background: "#FBF3D9", color: "#6B4F00" }}>
            {inisial(stay.teman.nama[0])}
          </span>
          <p className="flex min-w-0 flex-col">
            <span className="text-[14px] leading-5 [overflow-wrap:anywhere]">{stay.teman.nama.join(", ")}</span>
            <span className="text-[12px] leading-4" style={{ color: REDUP }}>
              {stay.teman.label}
            </span>
          </p>
        </div>
      ) : null}
      {stay.peta ? (
        <a href={stay.peta.href} target="_blank" rel="noreferrer noopener" className={TAUTAN_TRIP} style={{ color: TINTA }}>
          {stay.peta.label}
        </a>
      ) : null}
    </article>
  );
}

function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((kata) => kata[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * "Rencana perjalananmu": seluruh perjalanan peserta urut waktu, di kolom kiri
 * desktop (pola itinerary Trip.com). Langkah pertama yang belum lewat diberi
 * titik emas.
 */
export function RencanaTrip({ judul, langkah }: { judul: string; langkah: { kunci: string; waktu: string; teks: string; lewat: boolean }[] }) {
  if (langkah.length === 0) return null;
  const berikut = langkah.findIndex((item) => !item.lewat);
  return (
    <section aria-labelledby="rencana-trip" className={`${KARTU_TRIP} p-4`} style={{ color: TINTA }}>
      <h2 id="rencana-trip" className="text-[16px] font-semibold leading-6">
        {judul}
      </h2>
      <ol className="mt-4 flex flex-col">
        {langkah.map((item, urut) => (
          <li key={item.kunci + item.teks} className="relative grid grid-cols-[12px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            {urut < langkah.length - 1 ? <span aria-hidden className="absolute bottom-0 left-[5px] top-4 w-0.5" style={{ background: "rgb(16 30 56 / 0.08)" }} /> : null}
            <span
              aria-hidden
              className="relative mt-1 size-3 rounded-full border-2"
              style={urut === berikut ? { background: "var(--hz-emas)", borderColor: "var(--hz-emas)" } : { background: "#fff", borderColor: item.lewat ? "#C9D1DE" : "#6B7385" }}
            />
            <p className="flex min-w-0 flex-col">
              <span className="text-[12px] leading-4" style={{ color: REDUP }}>
                {item.waktu}
              </span>
              <span className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={item.lewat ? { color: REDUP } : undefined}>
                {item.teks}
              </span>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}


/**
 * Kartu peserta Beranda (pola boarding pass Traveloka dan tiket.com): nama dan
 * tanggal di atas, sobekan, lalu QR kehadiran di atas latar putih supaya kodenya
 * selalu terbaca. Di ponsel paling atas, di desktop menempel di kolom kanan.
 */
export function KartuPesertaTrip({
  alis,
  nama,
  catatan,
  qr,
}: {
  alis: string;
  nama: string;
  catatan: string | null;
  qr: { href: string; judul: string; kode: string; tombol: string; gambar: ReactNode } | null;
}) {
  return (
    <section aria-labelledby="kartu-peserta-trip" className={`${KARTU_TRIP} @container flex flex-col overflow-hidden`} style={{ color: TINTA }}>
      <div className="flex flex-col gap-1 p-4 md:p-6">
        <p className="text-[12px] leading-4" style={{ color: REDUP }}>
          {alis}
        </p>
        <h2 id="kartu-peserta-trip" className="text-[22px] font-bold leading-7 [overflow-wrap:anywhere]">
          {nama}
        </h2>
        {catatan ? (
          <p className="text-[14px] leading-5" style={{ color: REDUP }}>
            {catatan}
          </p>
        ) : null}
      </div>
      {qr ? (
        <>
          <Sobekan />
          <div className="flex flex-wrap items-center gap-4 p-4 md:px-6">
            <span className="size-[72px] shrink-0 rounded-[8px] bg-white p-1 ring-1 ring-[#E6E9EE]">{qr.gambar}</span>
            <p className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14px] font-semibold leading-5">{qr.judul}</span>
              <span className="text-[14px] leading-5 tabular-nums [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                {qr.kode}
              </span>
            </p>
            <PemicuQr
              id="pemicu-qr-peserta"
              href={qr.href}
              className="m3-state inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--hz-emas)] px-5 text-[14px] font-bold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)] @[400px]:w-auto"
            >
              <ArrowsOut size={16} weight="bold" aria-hidden />
              {qr.tombol}
            </PemicuQr>
          </div>
        </>
      ) : null}
    </section>
  );
}

export type BarisBerikutTrip = { kunci: string; jam: string; sampai: string | null; judul: string; catatan: string | null; lencana: string | null; aktif: boolean };

/**
 * "Berikutnya" sebagai linimasa (pola Trip.com itinerary): jam di kiri, titik di
 * rel, judul dan tempatnya di kanan. Butir pertama diberi titik emas dan lencana
 * ("Sedang berlangsung", "30 menit lagi").
 */
export function BerikutnyaTrip({ judul, meta, baris, tautan }: { judul: string; meta: string | null; baris: BarisBerikutTrip[]; tautan: { href: string; label: string; tab: string } | null }) {
  if (baris.length === 0) return null;
  return (
    <section aria-labelledby="berikut-trip" className="flex flex-col gap-3" style={{ color: TINTA }}>
      <div className="flex items-baseline gap-3">
        <h2 id="berikut-trip" className="min-w-0 flex-1 text-[16px] font-semibold leading-6">
          {judul}
        </h2>
        {meta ? (
          <p className="shrink-0 text-[14px] leading-5" style={{ color: REDUP }}>
            {meta}
          </p>
        ) : null}
      </div>
      <div className={KARTU_TRIP}>
        <ol className="flex flex-col p-4 md:p-6">
          {baris.map((item, urut) => (
            <li key={item.kunci} className="relative grid grid-cols-[48px_12px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
              <p className="flex flex-col tabular-nums">
                <span className="text-[14px] font-semibold leading-5">{item.jam}</span>
                {item.sampai ? (
                  <span className="text-[12px] leading-4" style={{ color: REDUP }}>
                    {item.sampai}
                  </span>
                ) : null}
              </p>
              {urut < baris.length - 1 ? <span aria-hidden className="absolute bottom-0 left-[65px] top-5 w-0.5" style={{ background: "rgb(16 30 56 / 0.08)" }} /> : null}
              <span
                aria-hidden
                className="relative mt-1 size-3 rounded-full border-2"
                style={urut === 0 ? { background: "var(--hz-emas)", borderColor: "var(--hz-emas)", boxShadow: "0 0 0 4px #FBF3D9" } : { background: "#fff", borderColor: "#6B7385" }}
              />
              <div className="flex min-w-0 flex-col gap-1">
                {item.lencana ? <PilTrip emas={urut === 0}>{item.lencana}</PilTrip> : null}
                <p className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.judul}</p>
                {item.catatan ? (
                  <p className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                    {item.catatan}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {tautan ? (
          <div className="border-t px-4 md:px-6" style={{ borderColor: "#E6E8EC" }}>
            <Link href={tautan.href} className={`${TAUTAN_TRIP} my-0`} style={{ color: TINTA }}>
              {tautan.label}
              <CaretRight size={16} aria-hidden className="shrink-0" />
              <PenandaTab tab={tautan.tab} />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * "Perjalananmu" di Beranda (pola My bookings Trip.com): satu baris per pesanan,
 * ubin berwarna per jenis, ringkasan di bawah nama, dan tautan ke bagiannya di
 * halaman Perjalanan.
 */
export function PerjalananmuTrip({
  judul,
  tautan,
  baris,
}: {
  judul: string;
  tautan: { href: string; label: string } | null;
  baris: { kunci: string; href: string; Ikon: typeof Train; nada: NadaTrip; judul: string; catatan: string | null }[];
}) {
  if (baris.length === 0) return null;
  return (
    <section aria-labelledby="perjalananmu-trip" className="flex flex-col gap-3" style={{ color: TINTA }}>
      <div className="flex items-center gap-3">
        <h2 id="perjalananmu-trip" className="min-w-0 flex-1 text-[16px] font-semibold leading-6">
          {judul}
        </h2>
        {tautan ? (
          <Link href={tautan.href} className={`${TAUTAN_TRIP} min-w-12 justify-center self-center`} style={{ color: TINTA }}>
            {tautan.label}
            <PenandaTab tab="perjalanan" />
          </Link>
        ) : null}
      </div>
      <ul className={`${KARTU_TRIP} flex flex-col`}>
        {baris.map((item) => (
          <li key={item.kunci} className="border-t first:border-t-0" style={{ borderColor: "#E6E8EC" }}>
            <Link href={item.href} className="m3-state flex min-h-[72px] items-center gap-3 px-4 py-3 md:px-6">
              <UbinTrip Ikon={item.Ikon} nada={item.nada} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.judul}</span>
                {item.catatan ? (
                  <span className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                    {item.catatan}
                  </span>
                ) : null}
              </span>
              <CaretRight size={16} aria-hidden className="shrink-0" style={{ color: REDUP }} />
              <PenandaTab tab="perjalanan" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
