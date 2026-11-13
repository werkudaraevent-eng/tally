import type { ReactNode } from "react";
import Link from "next/link";
import { Ambulance, Bell, CaretRight, FireTruck, Hospital, Bed, PoliceCar, Question, Siren, EnvelopeSimple, Lifebuoy, MapPin, Phone, QrCode, Train, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { GulirChipAktif, GulirHariAktif } from "@/components/member/gulir-hari-aktif";
import { CINCIN_NAVY } from "@/components/landing/modern/cincin-horizon";
import { PenandaTab } from "@/components/member/muat-portal";
import { KARTU_HZ, KELAS_JUDUL_ISI, KELAS_KET, KELAS_TAUTAN, KREM, LABEL, PAD_KARTU, REDUP, TINTA } from "./gaya";
import { KepalaKartuHorizon, PIL_EMAS } from "./kepala";
import { DaftarProfil, type BarisProfil } from "./profil";

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
            <span className="text-[20px] font-bold leading-[1.26] [overflow-wrap:anywhere]">{item.judul}</span>
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
              <span className="text-[0.8125rem] font-semibold" style={{ color: item.aktif ? TINTA : LABEL }}>
                {item.label}
              </span>
              <span className={`text-[16px] leading-6 text-balance [overflow-wrap:anywhere] ${item.aktif ? "font-semibold" : "font-normal"}`} style={item.aktif ? undefined : { color: REDUP }}>
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
        <Link href={tautan.href} className={`m3-state -mx-2 rounded-md px-2 ${KELAS_TAUTAN}`} style={{ color: TINTA }}>
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
const GAYA_PIL_KONTAK = { color: TINTA, borderColor: "#C9D1DE" };

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
        <Link href={tautan.href} className={`m3-state -mx-2 rounded-md px-2 ${KELAS_TAUTAN}`} style={{ color: TINTA }}>
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
              <span className="text-[12px] font-normal leading-4">{item.atas}</span>
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
                item.aktif ? "bg-[var(--hz-emas)] font-bold text-[var(--hz-on-emas)]" : "font-normal text-[#1A2333]"
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
                  <span className="text-[14px] font-normal leading-5 tabular-nums [overflow-wrap:anywhere]">{kontak.nomor}</span>
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
