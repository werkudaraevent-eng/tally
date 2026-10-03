"use client";

import { Kelompok } from "@/components/admin/compact-form";
import { LANDING_HEADING_FONTS, normalizeLandingSections, type EventLandingConfig } from "@/lib/domain";
import { LANDING_THEME_PRESETS, presetCocok, terapkanPreset, type LandingThemePreset } from "@/lib/landing-theme-presets";
import { buatBlok } from "./blocks";

/**
 * Kelompok "Preset tema" di tab Tema. Dipisah dari page.tsx supaya pekerjaan
 * lain di tab Tema tidak bertabrakan dengan daftar preset.
 */
export function PresetTema({
  landing,
  setLanding,
  nama,
  first = true,
}: {
  landing: EventLandingConfig;
  setLanding: (next: EventLandingConfig) => void;
  nama: string;
  /** False bila ada kelompok lain di atasnya (garis pemisah tampil). */
  first?: boolean;
}) {
  return (
    <Kelompok title="Preset tema" first={first} note="Satu klik mengisi tata letak, warna, dan huruf judul. Isi halaman tidak berubah, dan semuanya tetap bisa diatur satu per satu di bawah. Gathering juga menambahkan bagian Sebelum berangkat yang masih tersembunyi di Susunan, untuk Anda isi.">
      <div role="radiogroup" aria-label="Preset tema" className="grid gap-2">
        {LANDING_THEME_PRESETS.map((preset) => {
          const pilih = presetCocok(preset, landing);
          return (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={pilih}
              onClick={() => setLanding(pakaiPreset(preset, landing))}
              className={`m3-state flex overflow-hidden rounded-md border text-left ${pilih ? "border-primary ring-1 ring-primary" : "border-outline-variant"}`}
            >
              {/* Cuplikan hero dengan warna preset yang sebenarnya. */}
              <span aria-hidden className="flex w-36 shrink-0 flex-col justify-center gap-1.5 px-3 py-3" style={{ background: preset.seed }}>
                {preset.accent ? <span className="h-2 w-10" style={{ background: preset.accent }} /> : null}
                <span className="line-clamp-2 text-body-medium font-bold leading-tight text-white" style={{ fontFamily: LANDING_HEADING_FONTS[preset.heading_font].cssVar }}>
                  {nama}
                </span>
                {preset.secondary ? <span className="h-3 w-12" style={{ background: preset.secondary }} /> : null}
              </span>
              <span className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2.5">
                <span className="text-body-medium font-medium text-on-surface">{preset.label}</span>
                <span className="text-body-small text-on-surface-variant">{preset.note}</span>
                {pilih ? <span className="text-body-small font-medium text-primary">Sedang dipakai</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </Kelompok>
  );
}

/** Judul kartu bagian "Sebelum berangkat" untuk acara gathering. */
const INFO_GATHERING = ["Dress code", "Yang perlu dibawa", "Kontak panitia"];

/**
 * Preset ditambah, khusus Gathering, blok Kartu poin "Sebelum berangkat"
 * (sekali saja). Bloknya masuk Susunan dalam keadaan TERSEMBUNYI: kartu
 * berjudul tanpa isi tetap tampil, dan halaman publik tidak boleh memuat teks
 * contoh. Panitia mengisi teksnya lalu menampilkannya.
 */
function pakaiPreset(preset: LandingThemePreset, landing: EventLandingConfig): EventLandingConfig {
  const hasil = terapkanPreset(preset, landing);
  const sudahAda = (hasil.blocks ?? []).some((block) => block.type === "points" && block.heading === "Sebelum berangkat");
  if (!preset.gathering || sudahAda) return hasil;
  const blok = {
    ...buatBlok("points"),
    layout: "cards" as const,
    eyebrow: "Info penting",
    heading: "Sebelum berangkat",
    nav_label: "Info penting",
    items: INFO_GATHERING.map((title) => ({ title, body: "" })),
  };
  const sections = normalizeLandingSections(hasil.sections, hasil.blocks);
  // Sebelum FAQ, seperti di rancangan; tanpa FAQ, di ujung.
  const faq = sections.findIndex((section) => section.id === "faq");
  const posisi = faq === -1 ? sections.length : faq;
  return {
    ...hasil,
    blocks: [...(hasil.blocks ?? []), blok],
    sections: [...sections.slice(0, posisi), { id: blok.id, enabled: false }, ...sections.slice(posisi)],
  };
}
