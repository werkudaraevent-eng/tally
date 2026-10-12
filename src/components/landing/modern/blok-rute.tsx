import type { Icon } from "@phosphor-icons/react";
import { ArrowUpRight, Car, CaretDown, MapPin, NavigationArrow } from "@phosphor-icons/react/dist/ssr";
import type { LandingBlock, LandingRouteStop } from "@/lib/domain";
import { LANDING_CARD_ICON_POLA } from "@/lib/landing-card-icons";
import type { LandingHotel } from "@/lib/landing-hotel";
import type { LandingLang } from "@/lib/landing-i18n";
import { MUAT_IKON } from "./ikon-ssr";

// Blok Rute (Directions): dari satu tempat ke tempat lain, mis. hotel A ke
// hotel B. Titik berangkat dan tujuan dipilih dari hotel di Logistik (nama dan
// alamat ikut Logistik) atau ditulis bebas. Butir = cara ke sana (ikon, nama,
// waktu, catatan, foto patokan); `body` = langkah, satu per baris. Tombol
// Google Maps dibangun dari dua alamat itu. Tampil di halaman acara
// (BagianRute) dan/atau halaman peserta (KartuRute), sesuai `show_on`.

const UI = {
  id: {
    from: "Dari", to: "Ke", ways: "Cara ke sana", steps: "Langkah", eyebrow: "Rute",
    openMaps: "Buka rute di Google Maps",
    heading: (a: string, b: string) => `Dari ${a} ke ${b}`,
    stepByStep: (n: number) => `Langkah demi langkah (${n})`,
    photoOf: (cara: string) => `Foto patokan: ${cara}`,
  },
  en: {
    from: "From", to: "To", ways: "Ways to get there", steps: "Steps", eyebrow: "Directions",
    openMaps: "Open route in Google Maps",
    heading: (a: string, b: string) => `From ${a} to ${b}`,
    stepByStep: (n: number) => `Step by step (${n})`,
    photoOf: (cara: string) => `Landmark photo: ${cara}`,
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
  cara: { Ikon: Icon; label: string; waktu: string | null; catatan: string | null; foto: string | null }[];
  langkah: string[];
  peta: string;
};

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
        .map(async (item) => ({
          Ikon: await ikon(item.icon),
          label: item.label!.trim(),
          waktu: item.value?.trim() || null,
          catatan: item.body?.trim() || null,
          foto: item.image_url || null,
        })),
    ),
    // Nomor yang diketik admin ("1.", "-") dibuang: nomornya digambar sendiri.
    langkah: (block.body ?? "").split("\n").map((baris) => baris.replace(/^\s*(\d+[.)]|[-•*])\s+/, "").trim()).filter(Boolean),
    peta: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(kueri(dari))}&destination=${encodeURIComponent(kueri(ke))}&travelmode=${block.maps_mode ?? "driving"}`,
  };
}

const LABEL = "text-[12px] font-bold uppercase leading-4 tracking-[0.08em]";
/** Teks sekunder di dalam kartu putih: selalu gelap, juga di latar Dark brand. */
const MUTED_KARTU = "text-[#5F6B7F]";
const KARTU_PUTIH = "bg-white text-[#1A2333] shadow-[0_1px_2px_rgb(16_24_40/0.06)]";
const TOMBOL = "m3-state inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--aksi,var(--reg-primary))] px-5 text-center font-bold text-[var(--on-aksi,#fff)]";

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
            <span aria-hidden className="absolute -bottom-4 left-[11px] top-8 border-l-2 border-dashed border-[color-mix(in_srgb,var(--reg-brand)_30%,white)]" />
          )}
          <span aria-hidden className="flex size-6 shrink-0 items-center justify-center pt-0.5">
            {akhir ? (
              <MapPin size={24} weight="fill" className="text-[var(--aksi,var(--reg-primary))]" />
            ) : (
              <span className="size-4 rounded-full border-4 border-[var(--reg-brand)] bg-white" />
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
      {rute.cara.map(({ Ikon, label, waktu, catatan, foto }, index) => (
        <li key={index} className={kartu}>
          <div className="flex items-start gap-4">
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-[var(--reg-brand)]">
              <Ikon size={24} />
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

function DaftarLangkah({ rute }: { rute: Rute }) {
  return (
    <ol className="flex flex-col">
      {rute.langkah.map((baris, index) => (
        <li key={index} className="relative flex gap-4 pb-4 last:pb-0">
          {index < rute.langkah.length - 1 ? <span aria-hidden className="absolute bottom-0 left-[13px] top-8 w-px bg-[#D9DEE5]" /> : null}
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--reg-brand)] text-[13px] font-bold tabular-nums text-white">
            {index + 1}
          </span>
          <span className="min-w-0 pt-0.5 text-body-large [overflow-wrap:anywhere]">{baris}</span>
        </li>
      ))}
    </ol>
  );
}

function TombolPeta({ rute, lang, className }: { rute: Rute; lang: LandingLang; className: string }) {
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
  return (
    <section id={block.id} className={section} style={{ backgroundColor: latar, color: block.tone === "dark" ? "#fff" : undefined }}>
      <div className={`${shell} grid gap-10 lg:grid-cols-12 lg:gap-16`}>
        <div className="flex flex-col gap-8 lg:col-span-5">
          <div className="flex flex-col gap-3">
            <p className={alisKelas}>{rute.alis}</p>
            <h2 className={judulKelas}>{rute.judul}</h2>
          </div>
          <div className={`${KARTU_PUTIH} rounded-[20px] p-6`}>
            <TitikRute rute={rute} lang={lang} besar />
            <TombolPeta rute={rute} lang={lang} className={`${TOMBOL} mt-6 text-title-medium`} />
          </div>
        </div>
        <div className="flex flex-col gap-8 lg:col-span-7">
          {rute.cara.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h3 className={`${LABEL} ${block.tone === "dark" ? "text-white/80" : muted}`}>{t.ways}</h3>
              <DaftarCara rute={rute} lang={lang} kartu={`${KARTU_PUTIH} rounded-[16px] p-4`} />
            </div>
          ) : null}
          {rute.langkah.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h3 className={`${LABEL} ${block.tone === "dark" ? "text-white/80" : muted}`}>{t.steps}</h3>
              <div className={`${KARTU_PUTIH} rounded-[16px] p-5`}>
                <DaftarLangkah rute={rute} />
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
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-[var(--reg-brand)]">
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
      {rute.langkah.length > 0 ? (
        <details className="group mt-5 border-t border-[#E6E9EE] pt-2">
          <summary className="m3-state flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-title-small font-bold text-[var(--alis,var(--reg-brand))] [&::-webkit-details-marker]:hidden">
            {t.stepByStep(rute.langkah.length)}
            <CaretDown size={18} weight="bold" aria-hidden className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="pt-3">
            <DaftarLangkah rute={rute} />
          </div>
        </details>
      ) : null}
    </section>
  );
}
