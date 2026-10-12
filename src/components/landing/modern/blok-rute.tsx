import type { Icon } from "@phosphor-icons/react";
import { ArrowUpRight, Car, CaretDown, MapPin, NavigationArrow } from "@phosphor-icons/react/dist/ssr";
import type { LandingBlock, LandingRouteStop } from "@/lib/domain";
import type { LandingHotel } from "@/lib/landing-hotel";
import type { LandingLang } from "@/lib/landing-i18n";
import { MUAT_IKON } from "./ikon-ssr";

// Blok Rute: dari satu tempat ke tempat lain (mis. hotel A ke hotel B). Titik
// berangkat dan tujuan dipilih dari hotel di Logistik atau ditulis bebas;
// butir = pilihan transportasi (ikon, nama, waktu, catatan); `body` = langkah,
// satu per baris. Tombol Maps dibangun dari dua alamat itu.

const UI = {
  id: { from: "Dari", to: "Ke", ways: "Cara ke sana", steps: "Langkah", openMaps: "Buka rute di Google Maps", heading: (a: string, b: string) => `Dari ${a} ke ${b}`, eyebrow: "Rute" },
  en: { from: "From", to: "To", ways: "Ways to get there", steps: "Steps", openMaps: "Open route in Google Maps", heading: (a: string, b: string) => `From ${a} to ${b}`, eyebrow: "Directions" },
} as const;

type Titik = { name: string; address: string | null };

function titik(stop: LandingRouteStop | undefined, hotels: LandingHotel[]): Titik | null {
  if (!stop) return null;
  const hotel = stop.hotel_id ? hotels.find((h) => h.id === stop.hotel_id) : undefined;
  const name = hotel?.name ?? stop.name?.trim();
  if (!name) return null;
  return { name, address: hotel?.address ?? stop.address?.trim() ?? null };
}

function namaPendek(nama: string): string {
  return nama.replace(/^(hotel|the)\s+/i, "").split(/\s+/).slice(0, 2).join(" ");
}

async function ikon(nama: string | undefined): Promise<Icon> {
  const ambil = nama && Object.hasOwn(MUAT_IKON, nama) ? MUAT_IKON[nama] : undefined;
  return (ambil ? await ambil().catch(() => null) : null) ?? Car;
}

export type RuteSiap = {
  dari: Titik;
  ke: Titik;
  judul: string;
  alis: string;
  pilihan: { Ikon: Icon; label: string; waktu: string | null; catatan: string | null }[];
  langkah: string[];
  peta: string;
};

export async function siapkanRute(block: LandingBlock, hotels: LandingHotel[], lang: LandingLang): Promise<RuteSiap | null> {
  const dari = titik(block.route_from, hotels);
  const ke = titik(block.route_to, hotels);
  if (!dari || !ke) return null;
  const t = UI[lang];
  const alamat = (x: Titik) => [x.name, x.address].filter(Boolean).join(", ");
  return {
    dari,
    ke,
    judul: block.heading?.trim() || t.heading(namaPendek(dari.name), namaPendek(ke.name)),
    alis: block.eyebrow?.trim() || t.eyebrow,
    pilihan: await Promise.all(
      (block.items ?? [])
        .filter((item) => item.label?.trim())
        .map(async (item) => ({ Ikon: await ikon((item as { icon?: string }).icon), label: item.label!.trim(), waktu: item.value?.trim() || null, catatan: item.body?.trim() || null })),
    ),
    langkah: (block.body ?? "").split("\n").map((baris) => baris.replace(/^\s*(\d+[.)]|[-•])\s*/, "").trim()).filter(Boolean),
    peta: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(alamat(dari))}&destination=${encodeURIComponent(alamat(ke))}&travelmode=${block.maps_mode ?? "driving"}`,
  };
}

/** Dua titik dengan garis putus-putus di antaranya. */
export function TitikRute({ rute, lang, muted, besar = false }: { rute: RuteSiap; lang: LandingLang; muted: string; besar?: boolean }) {
  const t = UI[lang];
  const nama = besar ? "text-[20px] font-bold leading-tight" : "text-title-medium font-bold";
  return (
    <ol className="relative flex flex-col gap-5">
      {[{ x: rute.dari, label: t.from, akhir: false }, { x: rute.ke, label: t.to, akhir: true }].map(({ x, label, akhir }) => (
        <li key={label} className="relative flex gap-4">
          {akhir ? null : <span aria-hidden className="absolute -bottom-4 left-[11px] top-8 border-l-2 border-dashed border-[color-mix(in_srgb,var(--reg-brand)_30%,white)]" />}
          <span aria-hidden className="flex size-6 shrink-0 items-center justify-center pt-0.5">
            {akhir ? (
              <MapPin size={24} weight="fill" className="text-[var(--aksi,var(--reg-primary))]" />
            ) : (
              <span className="size-4 rounded-full border-[4px] border-[var(--reg-brand)] bg-white" />
            )}
          </span>
          <span className="min-w-0">
            <span className={`block text-[12px] font-bold uppercase tracking-[0.08em] ${muted}`}>{label}</span>
            <span className={`mt-0.5 block ${nama}`}>{x.name}</span>
            {x.address ? <span className={`mt-0.5 block text-body-medium ${muted}`}>{x.address}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function PilihanRute({ rute, muted, kartu }: { rute: RuteSiap; muted: string; kartu: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {rute.pilihan.map(({ Ikon, label, waktu, catatan }) => (
        <li key={label} className={`flex items-start gap-4 ${kartu}`}>
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-[var(--reg-brand)]">
            <Ikon size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-title-medium font-bold">{label}</span>
              {waktu ? <span className="inline-flex min-h-7 items-center rounded-full bg-[var(--chip-aksi,#E6F2EC)] px-3 text-label-large font-bold tabular-nums text-[var(--on-chip-aksi,#00603C)]">{waktu}</span> : null}
            </span>
            {catatan ? <span className={`mt-1 block text-body-medium ${muted}`}>{catatan}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LangkahRute({ rute, muted }: { rute: RuteSiap; muted: string }) {
  return (
    <ol className="flex flex-col">
      {rute.langkah.map((baris, index) => (
        <li key={index} className="relative flex gap-4 pb-4 last:pb-0">
          {index < rute.langkah.length - 1 ? <span aria-hidden className="absolute bottom-0 left-[13px] top-8 w-px bg-[#D9DEE5]" /> : null}
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--reg-brand)] text-[13px] font-bold text-white tabular-nums">{index + 1}</span>
          <span className={`pt-0.5 text-body-large ${index === 0 ? "" : ""}`}>{baris}</span>
        </li>
      ))}
      <span className={`sr-only ${muted}`} />
    </ol>
  );
}

export function TombolPeta({ rute, lang, className }: { rute: RuteSiap; lang: LandingLang; className: string }) {
  return (
    <a href={rute.peta} target="_blank" rel="noreferrer noopener" className={className}>
      <NavigationArrow size={20} weight="fill" aria-hidden />
      {UI[lang].openMaps}
      <ArrowUpRight size={16} weight="bold" aria-hidden />
    </a>
  );
}

export const RUTE_UI = UI;

/** Blok Rute di halaman acara (Modern): selebar layar, latar dari `tone`. */
export async function BagianRute({ block, hotels, lang, shell, section, judulKelas, alisKelas, muted }: {
  block: LandingBlock; hotels: LandingHotel[]; lang: LandingLang; shell: string; section: string; judulKelas: string; alisKelas: string; muted: string;
}) {
  const rute = await siapkanRute(block, hotels, lang);
  if (!rute) return null;
  const t = UI[lang];
  const latar = block.tone === "light" ? undefined : block.tone === "dark" ? "color-mix(in srgb, var(--reg-primary) 45%, black)" : "var(--reg-panel)";
  const kartu = "rounded-[16px] bg-white p-4 text-[#1A2333] shadow-[0_1px_2px_rgb(16_24_40/0.06)]";
  const mutedKartu = "text-[#5F6B7F]";
  return (
    <section id={block.id} className={section} style={{ backgroundColor: latar }}>
      <div className={`${shell} grid gap-10 lg:grid-cols-12 lg:gap-16`}>
        <div className="flex flex-col gap-8 lg:col-span-5">
          <div className="flex flex-col gap-3">
            <p className={alisKelas}>{rute.alis}</p>
            <h2 className={judulKelas}>{rute.judul}</h2>
          </div>
          <div className="rounded-[20px] bg-white p-6 text-[#1A2333] shadow-[0_1px_2px_rgb(16_24_40/0.06)]">
            <TitikRute rute={rute} lang={lang} muted={mutedKartu} besar />
            <TombolPeta rute={rute} lang={lang} className="m3-state mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--aksi,var(--reg-primary))] px-5 text-title-medium font-bold text-[var(--on-aksi,#fff)]" />
          </div>
        </div>
        <div className="flex flex-col gap-8 lg:col-span-7">
          {rute.pilihan.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h3 className={`text-[12px] font-bold uppercase tracking-[0.08em] ${muted}`}>{t.ways}</h3>
              <PilihanRute rute={rute} muted={mutedKartu} kartu={kartu} />
            </div>
          ) : null}
          {rute.langkah.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h3 className={`text-[12px] font-bold uppercase tracking-[0.08em] ${muted}`}>{t.steps}</h3>
              <div className={`${kartu} p-5`}>
                <LangkahRute rute={rute} muted={mutedKartu} />
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
  const muted = "text-[#5F6B7F]";
  return (
    <section aria-labelledby={`${block.id}-judul`} className="rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-[var(--reg-brand)]">
          <NavigationArrow size={20} weight="fill" />
        </span>
        <div className="min-w-0">
          <p className={`text-[12px] font-bold uppercase tracking-[0.08em] ${muted}`}>{rute.alis}</p>
          <h2 id={`${block.id}-judul`} className="text-title-large font-bold">{rute.judul}</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="flex flex-col gap-5">
          <TitikRute rute={rute} lang={lang} muted={muted} />
          <TombolPeta rute={rute} lang={lang} className="m3-state inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--aksi)] px-5 text-title-small font-bold text-[var(--on-aksi)]" />
        </div>
        {rute.pilihan.length > 0 ? (
          <div>
            <h3 className={`text-[12px] font-bold uppercase tracking-[0.08em] ${muted}`}>{t.ways}</h3>
            <PilihanRute rute={rute} muted={muted} kartu="mt-3 rounded-[16px] bg-[#F4F6F8] p-3" />
          </div>
        ) : null}
      </div>
      {rute.langkah.length > 0 ? (
        <details className="group mt-5 border-t border-[#E6E9EE] pt-2">
          <summary className="m3-state flex min-h-12 cursor-pointer list-none items-center justify-between text-title-small font-bold text-[var(--alis)]">
            {lang === "en" ? `Step by step (${rute.langkah.length})` : `Langkah demi langkah (${rute.langkah.length})`}
            <CaretDown size={18} weight="bold" aria-hidden className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="pt-3">
            <LangkahRute rute={rute} muted={muted} />
          </div>
        </details>
      ) : null}
    </section>
  );
}
