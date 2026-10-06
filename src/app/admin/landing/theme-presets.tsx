"use client";

import { Check } from "@phosphor-icons/react";
import { Kelompok } from "@/components/admin/compact-form";
import { normalizeLandingSections, type EventLandingConfig } from "@/lib/domain";
import { Button } from "@/components/m3";
import { LANDING_THEME_PRESETS, gayaPreset, presetCocok, presetDiubah, terapkanPreset, type LandingThemePreset } from "@/lib/landing-theme-presets";
import { buatBlok } from "./blocks";

/**
 * Kelompok "Start from a preset" di tab Theme. Klik kartu = pratinjau dulu:
 * pratinjau besar memakai preset itu, isi CMS belum berubah (status tetap
 * "Saved"), sampai admin menekan Apply di bilah atas panel. Pola Preview di
 * Shopify dan Squarespace: perbedaan preset baru terlihat di halaman utuh.
 */
export function PresetTema({
  landing,
  setLanding,
  pratinjau,
  onPratinjau,
}: {
  landing: EventLandingConfig;
  setLanding: (next: EventLandingConfig) => void;
  /** Kunci preset yang sedang dipratinjau, atau null. */
  pratinjau: string | null;
  onPratinjau: (key: string | null) => void;
}) {
  return (
    <Kelompok
      first
      title="Start from a preset"
      note="Click to preview it, then Apply. A preset sets the layout, colours, fonts and corners. Page content and the hero text placement stay. Gathering also adds a hidden “Sebelum berangkat” section for you to fill in."
    >
      <div role="radiogroup" aria-label="Preset" className="flex flex-col gap-2">
        {LANDING_THEME_PRESETS.map((preset) => {
          const dipakai = presetCocok(preset, landing);
          const diubah = dipakai && presetDiubah(preset, landing);
          const dilihat = pratinjau === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={dilihat || (pratinjau === null && dipakai)}
              // Kartu yang sedang dipakai tidak punya apa-apa untuk dipratinjau.
              onClick={() => onPratinjau(dipakai ? null : preset.key)}
              className={`m3-state flex overflow-hidden rounded-md border text-left ${
                dilihat ? "border-primary ring-2 ring-primary" : dipakai ? "border-primary ring-1 ring-primary" : "border-outline-variant"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preset.thumb} alt="" width={162} height={100} className="h-[100px] w-[162px] shrink-0 border-r border-outline-variant bg-surface-container object-cover object-top" />
              <span className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2">
                <span className="text-body-medium font-medium text-on-surface">{preset.label}</span>
                <span className="text-body-small text-on-surface-variant">{preset.note}</span>
                {dilihat ? (
                  <span className="text-body-small font-medium text-primary">Previewing</span>
                ) : dipakai ? (
                  <span className="inline-flex items-center gap-1 text-body-small font-medium text-primary">
                    <Check size={14} weight="bold" aria-hidden />
                    {diubah ? "In use · Edited" : "In use"}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {/* Reset di luar kartu: kartu sudah sebuah tombol, dan tombol di dalam
          tombol tidak bisa difokus terpisah. */}
      {LANDING_THEME_PRESETS.filter((preset) => presetCocok(preset, landing) && presetDiubah(preset, landing)).map((preset) => (
        <div key={preset.key} className="-mt-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-body-small text-on-surface-variant">Colours, fonts or corners differ from {preset.label}.</p>
          <Button variant="text" size="sm" onClick={() => setLanding(gayaPreset(preset, landing))}>
            Reset to {preset.label}
          </Button>
        </div>
      ))}
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
export function pakaiPreset(preset: LandingThemePreset, landing: EventLandingConfig): EventLandingConfig {
  const hasil = terapkanPreset(preset, landing);
  const sudahAda = (hasil.blocks ?? []).some((block) => block.type === "points" && block.heading === "Sebelum berangkat");
  if (!preset.features.gathering || sudahAda) return hasil;
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
