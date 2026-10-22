import type { Icon } from "@phosphor-icons/react";
import { ArrowUpRight, Car, CaretDown, MapPin, NavigationArrow } from "@phosphor-icons/react/dist/ssr";
import type { LandingBlock, LandingBlockItem, LandingRouteStop } from "@/lib/domain";
import { LANDING_CARD_ICON_POLA, type LandingCardTone } from "@/lib/landing-card-icons";
import type { LandingHotel } from "@/lib/landing-hotel";
import { hexLatarSendiri, warnaLatarSendiri } from "@/lib/landing-latar-sendiri";
import type { LandingLang } from "@/lib/landing-i18n";
import { FotoLangkah, GambarDenah } from "./gambar-denah";
import { GambarIkonKartu } from "./gambar-ikon-kartu";
import { MUAT_IKON } from "./ikon-ssr";
import { PilihCara } from "./pilih-cara";

// Blok Rute (Directions): dari satu tempat ke tempat lain, mis. hotel A ke
// hotel B. Titik berangkat dan tujuan dipilih dari hotel di Logistik (nama dan
// alamat ikut Logistik) atau ditulis bebas. Butir = cara ke sana (ikon, nama,
// waktu, langkah cara itu dengan foto patokan per langkah); `body` blok =
// langkah untuk semua cara (bentuk lama); `map_image_url` = denah, utuh di bawah cara, ketuk untuk
// layar penuh. Tombol Google Maps dibangun dari dua alamat itu, kecuali
// `maps_button` false (rute di dalam gedung). Tampil di halaman acara
// (BagianRute) dan/atau halaman peserta (KartuRute), sesuai `show_on`.

const UI = {
  id: {
    from: "Dari", to: "Ke", ways: "Cara ke sana", steps: "Langkah", eyebrow: "Rute",
    openMaps: "Buka rute di Google Maps",
    heading: (a: string, b: string) => `Dari ${a} ke ${b}`,
    stepByStep: (n: number) => `Langkah demi langkah (${n})`,
    photoOf: (cara: string) => `Foto patokan: ${cara}`,
    count: (n: number) => `${n} rute`,
    waysCount: (n: number) => `${n} cara`,
    detail: "Detail", journey: "Perjalanan", chooseWay: "Pilih cara",
    map: "Denah",
    mapOf: (judul: string) => `Denah: ${judul}`,
    openMap: "Buka denah layar penuh",
    stepPhoto: (n: number) => `Langkah ${n}`,
    openPhoto: (n: number) => `Buka foto langkah ${n} layar penuh`,
    close: "Tutup",
  },
  en: {
    from: "From", to: "To", ways: "Ways to get there", steps: "Steps", eyebrow: "Directions",
    openMaps: "Open route in Google Maps",
    heading: (a: string, b: string) => `From ${a} to ${b}`,
    stepByStep: (n: number) => `Step by step (${n})`,
    photoOf: (cara: string) => `Landmark photo: ${cara}`,
    count: (n: number) => `${n} routes`,
    waysCount: (n: number) => `${n} ways`,
    detail: "Details", journey: "Journey", chooseWay: "Choose a way",
    map: "Map",
    mapOf: (judul: string) => `Map: ${judul}`,
    openMap: "Open map full screen",
    stepPhoto: (n: number) => `Step ${n}`,
    openPhoto: (n: number) => `Open step ${n} photo full screen`,
    close: "Close",
  },
} as const;

type Titik = { name: string; address: string | null };

function titik(stop: LandingRouteStop | undefined, hotels: LandingHotel[]): Titik | null {
  if (!stop) return null;
  if (stop.hotel_id) {
    // Hotel yang sudah dihapus dari Logistik: blok tidak tampil, bukan alamat lama.
    const hotel = hotels.find((h) => h.id === stop.hotel_id);
    return hotel ? { name: hotel.name, address: hotel.address?.trim() || null } : null;
  }
  const name = stop.name?.trim();
  return name ? { name, address: stop.address?.trim() || null } : null;
}

/** Nama pendek untuk judul bawaan: tanpa "Hotel"/"The", paling banyak dua kata. */
function namaPendek(nama: string): string {
  return nama.replace(/^(hotel|the)\s+/i, "").split(/\s+/).slice(0, 2).join(" ");
}

async function ikon(nama: string | undefined): Promise<Icon> {
  const ambil = nama && LANDING_CARD_ICON_POLA.test(nama) && Object.hasOwn(MUAT_IKON, nama) ? MUAT_IKON[nama] : undefined;
  return (ambil ? await ambil().catch(() => null) : null) ?? Car;
}

type Rute = {
  dari: Titik;
  ke: Titik;
  judul: string;
  alis: string;
  /** Catatan = satu langkah tanpa foto; selebihnya `langkah` bernomor. */
  cara: { Ikon: Icon; nada: LandingCardTone; gambarIkon: string | null; label: string; waktu: string | null; catatan: string | null; langkah: Langkah[]; foto: string | null }[];
  langkah: Langkah[];
  /** Denah (gambar utuh), atau null. */
  denah: string | null;
  /** Tautan Google Maps, atau null bila tombolnya dimatikan. */
  peta: string | null;
};

type Langkah = { teks: string; foto: string | null };

/** Nomor yang diketik admin ("1.", "-") dibuang karena nomornya digambar sendiri. */
function tanpaNomor(teks: string): string {
  return teks.replace(/^\s*(\d+[.)]|[-•*])\s+/, "").trim();
}

/** Bentuk lama: satu langkah per baris, tanpa foto. */
function barisLangkah(teks: string | undefined): Langkah[] {
  return (teks ?? "").split("\n").map(tanpaNomor).filter(Boolean).map((teks) => ({ teks, foto: null }));
}

/** Langkah satu cara: `steps` bila ada, selain itu `body` satu langkah per baris. */
function langkahCara(item: LandingBlockItem): Langkah[] {
  if (!item.steps) return barisLangkah(item.body);
  return item.steps.map((langkah) => ({ teks: tanpaNomor(langkah.text ?? ""), foto: langkah.image_url?.trim() || null })).filter((langkah) => langkah.teks);
}

async function siapkanRute(block: LandingBlock, hotels: LandingHotel[], lang: LandingLang): Promise<Rute | null> {
  const dari = titik(block.route_from, hotels);
  const ke = titik(block.route_to, hotels);
  if (!dari || !ke) return null;
  const t = UI[lang];
  const kueri = (x: Titik) => [x.name, x.address].filter(Boolean).join(", ");
  return {
    dari,
    ke,
    judul: block.heading?.trim() || t.heading(namaPendek(dari.name), namaPendek(ke.name)),
    alis: block.eyebrow?.trim() || t.eyebrow,
    cara: await Promise.all(
      (block.items ?? [])
        .filter((item) => item.label?.trim())
        .map(async (item) => {
          // Satu langkah tanpa foto tetap catatan seperti dulu; selebihnya langkah bernomor.
          const langkah = langkahCara(item);
          const catatan = langkah.length === 1 && !langkah[0].foto;
          return {
            Ikon: await ikon(item.icon),
            nada: item.tone ?? "brand",
            gambarIkon: item.icon_url?.trim() || null,
            label: item.label!.trim(),
            waktu: item.value?.trim() || null,
            catatan: catatan ? (item.steps ? langkah[0].teks : item.body?.trim() || null) : null,
            langkah: catatan ? [] : langkah,
            foto: item.image_url || null,
          };
        }),
    ),
    denah: block.map_image_url?.trim() || null,
    langkah: barisLangkah(block.body),
    peta: block.maps_button === false ? null : `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(kueri(dari))}&destination=${encodeURIComponent(kueri(ke))}&travelmode=${block.maps_mode ?? "driving"}`,
  };
}

const LABEL = "text-[12px] font-bold uppercase leading-4 tracking-[0.08em]";
/** Teks sekunder di dalam kartu putih: selalu gelap, juga di latar Dark brand. */
const MUTED_KARTU = "text-[#5F6B7F]";
// `--kartu-garis`: garis kartu portal Horizon (GARIS_KARTU); halaman lain tidak menyetelnya, jadi 0 px.
const KARTU_PUTIH = "bg-white text-[#1A2333] shadow-[0_1px_2px_rgb(16_24_40/0.06)] ring-[length:var(--kartu-garis,0px)] ring-[rgb(16_30_56/0.12)]";
// Semua warna di atas kartu putih memakai versi "di atas putih" (cukup kontras
// dengan putih): merek yang terlalu terang jatuh ke tinta gelap (QA #127 M3).
const TOMBOL = "m3-state inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--aksi-putih,var(--aksi,var(--reg-primary)))] px-5 text-center font-bold text-[var(--on-aksi-putih,var(--on-aksi,var(--reg-on-primary)))]";
/** Ubin ikon: warna chip tema Gathering, atau warna primary di tata letak lain. */
const UBIN: Record<LandingCardTone, { latar: string; teks: string }> = {
  button: { latar: "var(--chip-aksi,var(--reg-primary-container))", teks: "var(--on-chip-aksi,var(--reg-on-primary-container))" },
  brand: { latar: "var(--chip-merek,var(--reg-primary-container))", teks: "var(--on-chip-merek,var(--reg-on-primary-container))" },
  accent: { latar: "var(--chip-aksen,var(--reg-primary-container))", teks: "var(--on-chip-aksen,var(--reg-on-primary-container))" },
};

/** Dua titik dengan garis putus-putus di antaranya. */
function TitikRute({ rute, lang, besar = false }: { rute: Rute; lang: LandingLang; besar?: boolean }) {
  const t = UI[lang];
  return (
    <ol className="flex flex-col gap-5">
      {[
        { x: rute.dari, label: t.from, akhir: false },
        { x: rute.ke, label: t.to, akhir: true },
      ].map(({ x, label, akhir }) => (
        <li key={label} className="relative flex gap-4">
          {akhir ? null : (
            <span aria-hidden className="absolute -bottom-4 left-[11px] top-8 border-l-2 border-dashed border-[color-mix(in_srgb,var(--reg-primary)_40%,white)]" />
          )}
          <span aria-hidden className="flex size-6 shrink-0 items-center justify-center pt-0.5">
            {akhir ? (
              <MapPin size={24} weight="fill" className="text-[var(--aksi-putih,var(--aksi,var(--reg-primary)))]" />
            ) : (
              <span className="size-4 rounded-full border-4 border-[var(--reg-primary)] bg-white" />
            )}
          </span>
          <span className="min-w-0">
            <span className={`block ${LABEL} ${MUTED_KARTU}`}>{label}</span>
            <span className={`mt-0.5 block [overflow-wrap:anywhere] ${besar ? "text-[20px] font-bold leading-tight" : "text-title-medium font-bold"}`}>{x.name}</span>
            {x.address ? <span className={`mt-0.5 block text-body-medium [overflow-wrap:anywhere] ${MUTED_KARTU}`}>{x.address}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function DaftarCara({ rute, lang, kartu }: { rute: Rute; lang: LandingLang; kartu: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {rute.cara.map(({ Ikon, nada, gambarIkon, label, waktu, catatan, langkah, foto }, index) => (
        <li key={index} className={kartu}>
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center [&>img]:my-0 [&>img]:size-12">
              {/* Ikon sendiri menggantikan ubin; ubin kembali bila gambarnya gagal dimuat. */}
              <GambarIkonKartu src={gambarIkon}>
                <span aria-hidden className="flex size-12 items-center justify-center rounded-[14px]" style={{ background: UBIN[nada].latar, color: UBIN[nada].teks }}>
                  <Ikon size={24} />
                </span>
              </GambarIkonKartu>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-title-medium font-bold [overflow-wrap:anywhere]">{label}</span>
                {waktu ? (
                  <span className="inline-flex min-h-7 items-center rounded-full bg-[var(--chip-aksi,#E6F2EC)] px-3 text-label-large font-bold tabular-nums text-[var(--on-chip-aksi,#00603C)]">
                    {waktu}
                  </span>
                ) : null}
              </span>
              {catatan ? <span className={`mt-1 block text-body-medium [overflow-wrap:anywhere] ${MUTED_KARTU}`}>{catatan}</span> : null}
            </span>
          </div>
          {langkah.length > 0 ? (
            <div className="mt-3 sm:pl-16">
              <DaftarLangkah langkah={langkah} lang={lang} kecil />
            </div>
          ) : null}
          {foto ? (
            <div className="mt-3 sm:pl-16">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL bebas dari unggahan admin, sama seperti gambar blok lain */}
              <img src={foto} alt={UI[lang].photoOf(label)} loading="lazy" decoding="async" className="aspect-[16/9] w-full max-w-[360px] rounded-[12px] bg-[#E6E9EE] object-cover" />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Langkah bernomor. `kecil` = di dalam kartu satu cara; foto patokan di kanan, ketuk untuk layar penuh. */
function DaftarLangkah({ langkah, lang, kecil = false }: { langkah: Langkah[]; lang: LandingLang; kecil?: boolean }) {
  const t = UI[lang];
  return (
    <ol className="flex flex-col">
      {langkah.map(({ teks: baris, foto }, index) => (
        <li key={index} className={`relative flex ${kecil ? "gap-3 pb-3" : "gap-4 pb-4"} last:pb-0`}>
          {index < langkah.length - 1 ? <span aria-hidden className={`absolute bottom-0 w-px bg-[#D9DEE5] ${kecil ? "left-[11px] top-7" : "left-[13px] top-8"}`} /> : null}
          <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--reg-primary)] font-bold tabular-nums text-[var(--reg-on-primary)] ${kecil ? "size-6 text-[12px]" : "size-7 text-[13px]"}`}>
            {index + 1}
          </span>
          <span className={`min-w-0 [overflow-wrap:anywhere] ${foto ? "flex-1" : ""} ${kecil ? "pt-px text-body-medium" : "pt-0.5 text-body-large"}`}>{baris}</span>
          {foto ? <FotoLangkah src={foto} alt={t.photoOf(baris)} judul={t.stepPhoto(index + 1)} buka={t.openPhoto(index + 1)} tutup={t.close} keterangan={baris} /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Denah di bawah cara ke sana; label kecil mengikuti kartu tempatnya. */
function BagianDenah({ rute, lang, labelKelas }: { rute: Rute; lang: LandingLang; labelKelas: string }) {
  if (!rute.denah) return null;
  const t = UI[lang];
  return (
    <div className="has-[[data-denah-gagal]]:hidden">
      <h3 className={`${LABEL} ${labelKelas}`}>{t.map}</h3>
      <div className="mt-3">
        <GambarDenah src={rute.denah} alt={t.mapOf(rute.judul)} judul={t.map} buka={t.openMap} tutup={t.close} />
      </div>
    </div>
  );
}

function TombolPeta({ rute, lang, className }: { rute: Rute; lang: LandingLang; className: string }) {
  if (!rute.peta) return null;
  return (
    <a href={rute.peta} target="_blank" rel="noreferrer noopener" className={className}>
      <NavigationArrow size={20} weight="fill" aria-hidden />
      {UI[lang].openMaps}
      <ArrowUpRight size={16} weight="bold" aria-hidden />
    </a>
  );
}

/** Blok Rute di halaman acara (Modern): selebar layar, latar dari `tone`. */
export async function BagianRute({ block, hotels, lang, shell, section, judulKelas, alisKelas, muted }: {
  block: LandingBlock;
  hotels: LandingHotel[];
  lang: LandingLang;
  shell: string;
  section: string;
  judulKelas: string;
  alisKelas: string;
  muted: string;
}) {
  const rute = await siapkanRute(block, hotels, lang);
  if (!rute) return null;
  const t = UI[lang];
  const latar = block.tone === "light" ? undefined : block.tone === "dark" ? "color-mix(in srgb, var(--reg-primary) 45%, black)" : "var(--reg-panel)";
  // Background › Custom: teks dan label kecil ikut warna yang terbaca di latar itu.
  const sendiri = hexLatarSendiri(block.bg_color);
  const warnaSendiri = sendiri ? warnaLatarSendiri(sendiri) : null;
  const labelGelap = warnaSendiri ? "text-[var(--alis)]" : block.tone === "dark" ? "text-white/80" : muted;
  return (
    <section
      id={block.id}
      className={section}
      // Di latar gelap label kecil memakai putih redup, sama dengan blok lain (QA #127 M3).
      style={(warnaSendiri
        ? { backgroundColor: warnaSendiri.latar, color: warnaSendiri.teks, "--alis": warnaSendiri.redup }
        : { backgroundColor: latar, ...(block.tone === "dark" ? { color: "#fff", "--alis": "rgb(255 255 255 / 0.8)" } : {}) }) as React.CSSProperties}
    >
      <div className={`${shell} grid gap-10 lg:grid-cols-12 lg:gap-16`}>
        <div className="flex flex-col gap-8 lg:col-span-5">
          <div className="flex flex-col gap-3">
            <p className={alisKelas}>{rute.alis}</p>
            <h2 className={judulKelas}>{rute.judul}</h2>
          </div>
          <div className={`${KARTU_PUTIH} rounded-[20px] p-6`}>
            <TitikRute rute={rute} lang={lang} besar />
            {rute.peta ? <TombolPeta rute={rute} lang={lang} className={`${TOMBOL} mt-6 text-title-medium`} /> : null}
          </div>
        </div>
        <div className="flex flex-col gap-8 lg:col-span-7">
          {rute.cara.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h3 className={`${LABEL} ${labelGelap}`}>{t.ways}</h3>
              <DaftarCara rute={rute} lang={lang} kartu={`${KARTU_PUTIH} rounded-[16px] p-4`} />
            </div>
          ) : null}
          {rute.denah ? (
            <div className={`${KARTU_PUTIH} rounded-[16px] p-4 has-[[data-denah-gagal]]:hidden`}>
              <BagianDenah rute={rute} lang={lang} labelKelas={MUTED_KARTU} />
            </div>
          ) : null}
          {rute.langkah.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h3 className={`${LABEL} ${labelGelap}`}>{t.steps}</h3>
              <div className={`${KARTU_PUTIH} rounded-[16px] p-5`}>
                <DaftarLangkah langkah={rute.langkah} lang={lang} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Blok Rute di halaman peserta: satu kartu di kolom utama. */
export async function KartuRute({ block, hotels, lang }: { block: LandingBlock; hotels: LandingHotel[]; lang: LandingLang }) {
  const rute = await siapkanRute(block, hotels, lang);
  if (!rute) return null;
  const t = UI[lang];
  return (
    <section aria-labelledby={`${block.id}-judul`} className={`${KARTU_PUTIH} rounded-[20px] p-5 sm:p-6`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: UBIN.brand.latar, color: UBIN.brand.teks }}>
          <NavigationArrow size={20} weight="fill" />
        </span>
        <div className="min-w-0">
          <p className={`${LABEL} ${MUTED_KARTU}`}>{rute.alis}</p>
          <h2 id={`${block.id}-judul`} className="text-title-large font-bold [overflow-wrap:anywhere]">{rute.judul}</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="flex flex-col gap-5">
          <TitikRute rute={rute} lang={lang} />
          <TombolPeta rute={rute} lang={lang} className={`${TOMBOL} text-title-small`} />
        </div>
        {rute.cara.length > 0 ? (
          <div>
            <h3 className={`${LABEL} ${MUTED_KARTU}`}>{t.ways}</h3>
            <div className="mt-3">
              <DaftarCara rute={rute} lang={lang} kartu="rounded-[16px] bg-[#F4F6F8] p-3" />
            </div>
          </div>
        ) : null}
      </div>
      {rute.denah ? (
        <div className="mt-6 has-[[data-denah-gagal]]:hidden">
          <BagianDenah rute={rute} lang={lang} labelKelas={MUTED_KARTU} />
        </div>
      ) : null}
      {rute.langkah.length > 0 ? (
        <details className="group mt-5 border-t border-[#E6E9EE] pt-2">
          <summary className="m3-state flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-title-small font-bold text-[var(--alis,var(--reg-primary))] [&::-webkit-details-marker]:hidden">
            {t.stepByStep(rute.langkah.length)}
            <CaretDown size={18} weight="bold" aria-hidden className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="pt-3">
            <DaftarLangkah langkah={rute.langkah} lang={lang} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** Warna halaman portal Horizon (KREM): lubang sobekan tiket memakai warna ini. */
const LATAR_HALAMAN = "#FAF8F2";

const GARIS_LINTASAN = "absolute left-[15px] w-0.5 bg-[#D9DEE5]";

/** Titik asal atau tujuan di Lintasan; garisnya turun ke baris berikutnya. */
function TitikLintasan({ x, label, akhir }: { x: Titik; label: string; akhir: boolean }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {akhir ? null : <span aria-hidden className={`${GARIS_LINTASAN} bottom-0 top-8`} />}
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center">
        {akhir ? (
          <MapPin size={28} weight="fill" className="text-[var(--aksi-putih,var(--aksi,var(--reg-primary)))]" />
        ) : (
          <span className="size-[18px] rounded-full border-[5px] border-[var(--reg-primary)] bg-white" />
        )}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className={`block ${LABEL} ${MUTED_KARTU}`}>{label}</span>
        <span className="mt-0.5 block text-[17px] font-extrabold leading-snug [overflow-wrap:anywhere]">{x.name}</span>
        {x.address ? <span className={`mt-0.5 block text-body-medium [overflow-wrap:anywhere] ${MUTED_KARTU}`}>{x.address}</span> : null}
      </span>
    </li>
  );
}

/**
 * Satu perjalanan dari asal sampai tujuan, tegak seperti detail perjalanan di
 * app kereta dan Google Maps transit: titik asal, baris cara (ikon, nama,
 * waktu), langkah bernomor dengan foto patokan, lalu titik tujuan.
 */
function Lintasan({ rute, cara, lang }: { rute: Rute; cara: Rute["cara"][number] | null; lang: LandingLang }) {
  const t = UI[lang];
  // Langkah untuk semua cara (bentuk lama) dipakai cara yang tidak punya langkah sendiri.
  const langkah = cara?.langkah.length ? cara.langkah : rute.langkah;
  return (
    <ol className="flex flex-col">
      <TitikLintasan x={rute.dari} label={t.from} akhir={false} />
      {cara ? (
        <li className="relative flex gap-3 pb-5">
          <span aria-hidden className={`${GARIS_LINTASAN} -top-1 bottom-0`} />
          <span aria-hidden className="relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white [&>img]:my-0 [&>img]:size-8 [&>img]:rounded-full">
            <GambarIkonKartu src={cara.gambarIkon}>
              <span className="flex size-8 items-center justify-center rounded-full" style={{ background: UBIN[cara.nada].latar, color: UBIN[cara.nada].teks }}>
                <cara.Ikon size={18} weight="bold" />
              </span>
            </GambarIkonKartu>
          </span>
          <span className="min-w-0 flex-1 pt-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-title-small font-bold [overflow-wrap:anywhere]">{cara.label}</span>
              {cara.waktu ? <span className={`text-body-medium font-semibold tabular-nums ${MUTED_KARTU}`}>{cara.waktu}</span> : null}
            </span>
            {cara.catatan ? <span className={`mt-1 block text-body-medium [overflow-wrap:anywhere] ${MUTED_KARTU}`}>{cara.catatan}</span> : null}
            {cara.foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL bebas dari unggahan admin, sama seperti gambar blok lain
              <img src={cara.foto} alt={t.photoOf(cara.label)} loading="lazy" decoding="async" className="mt-3 aspect-[16/9] w-full max-w-[360px] rounded-[12px] bg-[#E6E9EE] object-cover" />
            ) : null}
          </span>
        </li>
      ) : null}
      {langkah.map(({ teks, foto }, index) => (
        <li key={index} className="relative flex gap-3 pb-5">
          <span aria-hidden className={`${GARIS_LINTASAN} -top-1 bottom-0`} />
          <span aria-hidden className="relative flex size-8 shrink-0 items-center justify-center">
            <span className="flex size-6 items-center justify-center rounded-full bg-[#1A2333] text-[12px] font-bold tabular-nums text-white ring-4 ring-white">{index + 1}</span>
          </span>
          <span className={`min-w-0 pt-1 text-body-medium [overflow-wrap:anywhere] ${foto ? "flex-1" : ""}`}>{teks}</span>
          {foto ? <FotoLangkah src={foto} alt={t.photoOf(teks)} judul={t.stepPhoto(index + 1)} buka={t.openPhoto(index + 1)} tutup={t.close} keterangan={teks} /> : null}
        </li>
      ))}
      <TitikLintasan x={rute.ke} label={t.to} akhir />
    </ol>
  );
}

/**
 * Rute di tab Perjalanan portal Horizon: satu kartu tiket per rute di bawah
 * kartu hotel, bus, dan kereta, mengikuti kartu tiket Traveloka, tiket.com,
 * dan KAI Access: asal dan tujuan besar di kiri dan kanan dengan garis dan
 * ikon cara di tengah, sobekan putus-putus, lalu cara-caranya sebagai chip.
 * Kartu dibuka untuk detail perjalanan (Lintasan), satu tab per cara, denah,
 * dan tombol Google Maps; tautan `#<id blok>` membukanya (BukaRuteDariHash).
 * Judul blok tidak dipakai di sini: nama dua tempatnya sudah judulnya.
 */
export async function DaftarRuteRingkas({ blocks, hotels, lang }: { blocks: LandingBlock[]; hotels: LandingHotel[]; lang: LandingLang }) {
  const t = UI[lang];
  const rute = (await Promise.all(blocks.map(async (block) => ({ block, rute: await siapkanRute(block, hotels, lang) })))).filter(
    (isi): isi is { block: LandingBlock; rute: Rute } => isi.rute !== null,
  );
  if (!rute.length) return null;
  return (
    <section aria-label={t.eyebrow} className="flex flex-col gap-3">
      <p className={`flex items-center gap-2 px-1 ${LABEL} text-[var(--alis,var(--reg-primary))]`}>
        <NavigationArrow size={16} weight="fill" aria-hidden />
        {t.eyebrow}
        {rute.length > 1 ? <span className={`font-semibold normal-case tracking-normal ${MUTED_KARTU}`}>· {t.count(rute.length)}</span> : null}
      </p>
      {rute.map(({ block, rute: r }) => {
        const tunggal = r.cara.length === 1 ? r.cara[0] : null;
        const IkonTengah = r.cara[0]?.Ikon ?? NavigationArrow;
        const tengah = tunggal ? tunggal.waktu : r.cara.length > 1 ? t.waysCount(r.cara.length) : null;
        const panel = r.cara.length ? r.cara.map((cara, index) => <Lintasan key={index} rute={r} cara={cara} lang={lang} />) : [<Lintasan key={0} rute={r} cara={null} lang={lang} />];
        const sisi = r.denah || r.peta;
        return (
          <details key={block.id} id={block.id} className={`group scroll-mt-28 overflow-hidden rounded-[20px] ${KARTU_PUTIH}`}>
            <summary className="m3-state block cursor-pointer list-none focus-visible:outline-offset-[-3px] [&::-webkit-details-marker]:hidden">
              <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 px-5 pb-4 pt-5 sm:gap-6 sm:px-7">
                <span className="min-w-0">
                  <span className={`block ${LABEL} ${MUTED_KARTU}`}>{t.from}</span>
                  <span className="mt-1 block text-[16px] font-extrabold leading-snug [overflow-wrap:break-word] sm:text-[22px]">{r.dari.name}</span>
                </span>
                <span aria-hidden className="flex w-16 flex-col items-center gap-1 pt-5 sm:w-40 lg:w-56">
                  <span className="flex w-full items-center text-[color-mix(in_srgb,var(--reg-primary)_45%,white)]">
                    <span className="size-1.5 shrink-0 rounded-full bg-current" />
                    <span className="flex-1 border-t-2 border-dashed border-current" />
                    <span className="mx-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--on-chip-merek,var(--reg-on-primary-container))]" style={{ background: UBIN.brand.latar }}>
                      <IkonTengah size={18} weight="bold" />
                    </span>
                    <span className="flex-1 border-t-2 border-dashed border-current" />
                    <span className="size-1.5 shrink-0 rounded-full bg-current" />
                  </span>
                  {tengah ? <span className={`text-body-small font-semibold tabular-nums ${MUTED_KARTU}`}>{tengah}</span> : null}
                </span>
                <span className="min-w-0 text-right">
                  <span className={`block ${LABEL} ${MUTED_KARTU}`}>{t.to}</span>
                  <span className="mt-1 block text-[16px] font-extrabold leading-snug [overflow-wrap:break-word] sm:text-[22px]">{r.ke.name}</span>
                </span>
              </span>
              {/* Sobekan tiket: garis putus-putus dengan dua lubang setengah lingkaran di tepi. */}
              <span aria-hidden className="relative block h-0 border-t-2 border-dashed border-[#E3E7EE] mx-5 sm:mx-7">
                <span className="absolute -left-[34px] -top-[11px] size-5 rounded-full ring-1 ring-[rgb(16_30_56/0.12)] sm:-left-[42px]" style={{ background: LATAR_HALAMAN }} />
                <span className="absolute -right-[34px] -top-[11px] size-5 rounded-full ring-1 ring-[rgb(16_30_56/0.12)] sm:-right-[42px]" style={{ background: LATAR_HALAMAN }} />
              </span>
              <span className="flex min-h-14 items-center gap-3 px-5 py-3 sm:px-7">
                <span className="flex min-w-0 flex-1 flex-wrap gap-2">
                  {r.cara.map(({ Ikon, label, waktu }, index) => (
                    <span key={index} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-[#F1F3F8] px-3 text-label-large">
                      <Ikon size={16} weight="bold" aria-hidden className="shrink-0" />
                      <span className="truncate font-semibold">{label}</span>
                      {waktu ? <span className={`shrink-0 tabular-nums ${MUTED_KARTU}`}>{waktu}</span> : null}
                    </span>
                  ))}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-label-large font-bold text-[var(--aksi-putih,var(--aksi,var(--reg-primary)))]">
                  {t.detail}
                  <CaretDown size={18} weight="bold" aria-hidden className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </span>
              </span>
            </summary>
            <div className={`border-t border-[#E6E9EE] px-5 pb-6 pt-5 sm:px-7 ${sisi ? "lg:grid lg:grid-cols-2 lg:gap-10" : ""}`}>
              <div className={`flex flex-col gap-5 ${sisi ? "" : "max-w-[640px]"}`}>
                <h3 className={`${LABEL} ${MUTED_KARTU}`}>{r.cara.length > 1 ? t.chooseWay : t.journey}</h3>
                <PilihCara label={t.ways} pilihan={r.cara.map(({ label, waktu }) => ({ judul: label, waktu }))} panel={panel} />
              </div>
              {sisi ? (
                <div className="mt-6 flex flex-col gap-5 lg:mt-0">
                  <BagianDenah rute={r} lang={lang} labelKelas={MUTED_KARTU} />
                  <TombolPeta rute={r} lang={lang} className={`${TOMBOL} text-title-small`} />
                </div>
              ) : null}
            </div>
          </details>
        );
      })}
    </section>
  );
}
