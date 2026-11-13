import { type CSSProperties, type ReactNode } from "react";
import type { LandingHeadingScale, LandingHeroHeight } from "@/lib/domain";
import { JUDUL, LABEL_BAGIAN, PIL, SECTION } from "./styles";

/** Label kecil di atas judul bagian, sama dengan blok dari pustaka blok. */
/** `--alis` hanya disetel gaya gathering (aksen yang digelapkan); acara lain tetap primary. */
export const ALIS = `${LABEL_BAGIAN} text-[var(--alis,var(--reg-primary))]`;

export const STATE_ON_PRIMARY = { "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties;

/** Kartu di atas putih dan pita susunan acara gaya gathering. */
export const PANEL_GATHERING = "#F4F6F8";
/** Garis 1px selebar layar di tepi pita (tanpa menambah gulir menyamping). */
export const GARIS_LEBAR = "pointer-events-none absolute inset-x-0 h-px bg-[var(--garis-pita,#E6EAEF)] [box-shadow:0_0_0_100vmax_var(--garis-pita,#E6EAEF)] [clip-path:inset(0_-100vmax)]";


/**
 * Tinggi minimum hero, termasuk bilah nav yang menumpang di atasnya. Patokan
 * `tall` = 850px, tinggi hero di rancangan, tapi tidak pernah lebih dari
 * tinggi layar: tombol daftar harus terlihat tanpa menggulir.
 */
export const HERO_HEIGHT: Record<LandingHeroHeight, string> = {
  compact: "min-h-[480px] lg:min-h-[min(600px,100svh)]",
  standard: "min-h-[560px] sm:min-h-[min(640px,100svh)] lg:min-h-[min(760px,100svh)]",
  tall: "min-h-[620px] sm:min-h-[min(720px,100svh)] lg:min-h-[min(850px,100svh)]",
};

/** Tinggi hero dari angka di CMS (`--hero-h`), ponsel 75% darinya, tidak pernah melebihi layar. */
export const HERO_HEIGHT_ANGKA = "min-h-[min(calc(var(--hero-h)*0.75),100svh)] lg:min-h-[min(var(--hero-h),100svh)]";

/**
 * Ukuran nama acara. Paling besar 72px: di atas itu nama acara yang panjang
 * memakan dua baris dan mendorong tombol ke bawah lipatan layar.
 */
export const HEADING_SCALE: Record<LandingHeadingScale, string> = {
  md: "text-[36px] sm:text-[44px] lg:text-[52px]",
  lg: "text-[40px] sm:text-[52px] lg:text-[64px]",
  xl: "text-[44px] sm:text-[60px] lg:text-[72px]",
};



/**
 * Bayangan KV gaya gathering: isinya di tengah, jadi bagian tengah ikut cukup
 * gelap untuk teks putih, bukan hanya bagian bawah seperti KV_SCRIM.
 */
export const KV_SCRIM_TENGAH = "linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.45) 45%, rgb(0 0 0 / 0.6))";

export const HERO_DELAY = (step: number) => ({ "--rise-delay": `${step * 60}ms` }) as CSSProperties;


/** Chip pil di atas permukaan terang (kartu program). */
export const CHIP =
  "inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--reg-on-surface)_12%,transparent)] bg-[color-mix(in_srgb,var(--reg-on-surface)_5%,transparent)] px-3.5 py-1.5 text-label-large font-normal tabular-nums";

/**
 * Tombol di atas bidang bergambar: latar `--ink`, teks `--ink-accent`. Lihat
 * `tinta` untuk pasangannya.
 */
export const PIL_INK = `${PIL} bg-[var(--ink)] font-semibold text-[var(--ink-accent)]`;
/** Tombol utama di atas KV: warna dari heroCtaColors lewat `--cta-bg`/`--cta-fg`. */
export const PIL_CTA_KV = `${PIL} bg-[var(--cta-bg)] font-semibold text-[var(--cta-fg)] shadow-[0_1px_3px_rgb(0_0_0/0.3)]`;
/** Tombol kedua di atas bidang bergambar: garis `--ink`, tanpa isi. */
export const PIL_INK_GARIS = `${PIL} border border-[color-mix(in_srgb,var(--ink)_60%,transparent)] font-semibold text-[var(--ink)]`;

export function Kv({ src, scrim }: { src: string; scrim: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="settle-in absolute inset-0 -z-10 size-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: scrim }} />
    </>
  );
}

/** Pengantar FAQ; diberi titik bila kalimat kontak ("Hubungi panitia ...") ditempel di belakangnya. */
export function pengantarFaq(teks: string, adaKontak: boolean): string {
  return adaKontak && !/[.!?…]$/.test(teks) ? `${teks}.` : teks;
}

/** Label kecil (opsional) dan judul bagian, 12px di antaranya. */
export function JudulBagian({ alis, judul }: { alis: string | null; judul: string }) {
  if (!alis) return <h2 className={JUDUL}>{judul}</h2>;
  return (
    <div className="flex flex-col gap-3">
      <p className={ALIS}>{alis}</p>
      <h2 className={JUDUL}>{judul}</h2>
    </div>
  );
}

export function Section({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <section id={id} className={SECTION}>
      {children}
    </section>
  );
}
