import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Bus, CalendarBlank, CalendarPlus, CaretDown, CaretRight, Check, Clock, CoatHanger, MapPin, Phone, Train, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { KartuFotoOutfit } from "@/components/member/foto-outfit";
import { PilihanOutfit } from "@/components/member/pilihan-outfit";
import type { OutfitPilihan } from "@/lib/outfit";
import { PenandaTab } from "@/components/member/muat-portal";
import type { ModaTiket } from "@/lib/logistik/types";
import { GARIS_KARTU, KARTU_HZ, KELAS_ALIS, KELAS_JUDUL_ISI, KELAS_KET, KELAS_NILAI, KELAS_STRIP, KELAS_TAUTAN, LABEL, LATAR_STRIP, PAD_KARTU, REDUP, TINTA } from "./gaya";
import { KepalaKartuHorizon } from "./kepala";

export type LegKereta = {
  kunci: string;
  /** Kereta (bawaan), pesawat, atau kapal: ikon di bentuk tiket. */
  moda?: ModaTiket;
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
export function TiketKeretaHorizon({ judul, label, leg, Ikon = Train }: { judul: string; label: { gerbong: string; kursi: string; kode: string; jumlah: (n: number) => string; selesai: string; ke: string }; leg: LegKereta[]; /** Ikon moda (pesawat, kapal, tiket campur); bawaan kereta. */ Ikon?: typeof Train }) {
  const pergi = leg.filter((item) => !item.lipat).length;
  return (
    // id "kereta": baris kereta di Beranda membuka Perjalanan tepat di kartu ini (U-17), jarak setinggi bilah atas.
    <section id="kereta" aria-label={judul} className={`${GARIS_KARTU} flex scroll-mt-24 flex-col gap-4 rounded-[16px] bg-white p-4 md:p-6 lg:scroll-mt-32`} style={{ color: TINTA }}>
      <KepalaKartuHorizon Ikon={Ikon} judul={judul} meta={pergi > 0 ? label.jumlah(pergi) : label.selesai} nadaMeta={pergi > 0 ? "redup" : "hijau"} />
      <div className="flex flex-col xl:grid xl:grid-cols-2 xl:items-start xl:gap-8">
      {leg.map((item, index) => {
        const kursi = [item.gerbong ? `${label.gerbong} ${item.gerbong}` : null, item.kursi ? `${label.kursi} ${item.kursi}` : null].filter(Boolean).join(", ");
        const blok = (
          <div key={item.kunci} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className={KELAS_ALIS} style={{ color: TINTA }}>
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
                {item.jam && item.baris ? ", " : null}
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
              <a href={item.kalender.href} className={`${KELAS_TAUTAN} gap-2`} style={{ color: TINTA }}>
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
              <a href={tautan.href} target="_blank" rel="noreferrer noopener" className={KELAS_TAUTAN} style={{ color: TINTA }}>
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
              <span className={KELAS_ALIS} style={{ color: TINTA }}>
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
              <a href={item.peta.href} target="_blank" rel="noreferrer noopener" className={KELAS_TAUTAN} style={{ color: TINTA }}>
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
          <a href={`tel:${nomor.tel}`} aria-label={aksi.callAria} className="inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold" style={{ color: TINTA, borderColor: "#C9D1DE" }}>
            <Phone size={18} weight="bold" aria-hidden />
            {aksi.call}
          </a>
          <a href={nomor.wa} target="_blank" rel="noreferrer noopener" aria-label={aksi.whatsappAria} className="inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold" style={{ color: TINTA, borderColor: "#C9D1DE" }}>
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
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold leading-5" style={{ color: TINTA }}>
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
          <span className="font-bold tabular-nums">{jam[1]}</span>{" "}
          <span className="ml-1 font-semibold">{jam[2]}</span>
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
export function KartuOutfitHorizon({ kapan, apa, catatan, foto, pilihan, tingkat = 3, judulFoto, teksFoto, teksPilihan, wadah = false }: {
  kapan: string | null;
  apa: string;
  catatan: string | null;
  foto: string | null;
  /** Pilihan gaya (Agenda > Dress code > Options): menggantikan foto tunggal. */
  pilihan?: OutfitPilihan[];
  /** Tingkat judul pakaian: 4 di blok Dress code halaman acara (di bawah judul hari). */
  tingkat?: 2 | 3 | 4;
  /** Judul bilah atas penampil foto (label halaman per acara). */
  judulFoto: string;
  teksFoto: { buka: string; lihat: string; perbesar: string; tutup: string };
  teksPilihan?: { pilih: string; buka: (nama: string) => string; tutup: string; sebelumnya: string; berikutnya: string };
  /** Kartu foto dan grid pilihan ikut lebar wadah `@container`, bukan layar (blok Dress code halaman acara). */
  wadah?: boolean;
}) {
  const Judul = tingkat === 2 ? "h2" : tingkat === 4 ? "h4" : "h3";
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
          wadah={wadah}
        />
      </article>
    );
  }
  if (foto) {
    // Fotonya isi utama (papan dress code penuh teks dan contoh gaya). Ponsel dan
    // tablet: foto selebar kartu dengan rasio aslinya, teks di bawah (keputusan
    // 23 Okt; dulu foto 96 px yang terpotong 4:5). Layar lebar: foto 320 px di
    // kiri (keputusan 22 Okt). Ketuk foto untuk layar penuh beserta keterangannya.
    const kelas = `${KARTU_HZ} flex min-w-0 flex-col gap-4 ${PAD_KARTU} ${wadah ? "@2xl:flex-row @2xl:items-start @2xl:gap-6" : "lg:flex-row lg:items-start lg:gap-6"}`;
    return (
      <KartuFotoOutfit kelas={kelas} warna={TINTA} foto={foto} kapan={kapan} apa={apa} catatan={catatan} judul={judulFoto} teks={teksFoto} wadah={wadah}>
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
