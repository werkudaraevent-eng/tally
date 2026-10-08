"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { Kelompok } from "@/components/admin/compact-form";
import { susunanDenganPortal, type EventLandingConfig } from "@/lib/domain";
import { Button } from "@/components/m3";
import {
  LANDING_THEME_PRESETS,
  gayaPreset,
  isiGathering,
  isiGatheringMengubah,
  presetCocok,
  presetDiubah,
  terapkanPreset,
  type LandingThemePreset,
  type TentangBawaan,
} from "@/lib/landing-theme-presets";
import { landingTokens } from "@/lib/landing-tokens";
import { LANDING_UI } from "@/lib/landing-i18n";
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
      note="Click to preview it, then Apply. A preset sets the layout, colours, fonts and corners. Page content and the hero text placement stay. Gathering also makes the top bar white, fills the About heading and three About cards if they are empty, hides Location (with the hotel card), and adds a hidden “Sebelum berangkat” section for you to fill in."
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
      {LANDING_THEME_PRESETS.filter(
        (preset) => presetCocok(preset, landing) && (presetDiubah(preset, landing) || (preset.features.gathering && isiGatheringMengubah(landing).tentang)),
      ).map((preset) => (
        <ResetPreset key={preset.key} preset={preset} landing={landing} setLanding={setLanding} />
      ))}
    </Kelompok>
  );
}

/**
 * "Reset colours and fonts" untuk preset yang dipakai tapi sudah diubah. Kalau
 * Reset juga mengganti warna merek, minta konfirmasi dulu dan tunjukkan kedua
 * warnanya: acara yang tidak pernah memakai preset (ILO, KSO 21) tampil
 * "Edited" karena warna mereknya sendiri, dan sekali klik di sana menghapus
 * warna yang sudah disetujui klien.
 */
function ResetPreset({ preset, landing, setLanding }: { preset: LandingThemePreset; landing: EventLandingConfig; setLanding: (next: EventLandingConfig) => void }) {
  const [tanya, setTanya] = useState(false);
  const kotak = useRef<HTMLDivElement | null>(null);
  // Fokus ikut berpindah (QA #91 L4): ke "Keep my colours" saat konfirmasi
  // muncul, supaya pembaca layar membacakan kalimatnya, lalu kembali ke tombol
  // Reset saat ditutup. Tanpa ini tombolnya hilang dan fokus jatuh ke <body>.
  const sudahBuka = useRef(false);
  useEffect(() => {
    if (!sudahBuka.current && !tanya) return;
    sudahBuka.current = true;
    kotak.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [tanya]);
  const sekarang = landingTokens(landing).brand;
  const gantiMerek = sekarang.toLowerCase() !== preset.tokens.brand.toLowerCase();
  // Gathering juga menulis bilah atas: Reset yang mengganti bilah ikut ditanyakan (QA #106 L2).
  const bilah = preset.tokens.nav;
  const gantiBilah = Boolean(
    bilah &&
      ((landing.nav?.color ?? "").toLowerCase() !== bilah.color.toLowerCase() || landing.nav?.opacity !== bilah.opacity || landing.nav?.height !== bilah.height),
  );
  // Gathering: Reset juga mengisi Tentang acara yang kosong dan menyembunyikan
  // Lokasi, sama seperti Apply (QA #107 M1).
  const isi = preset.features.gathering ? isiGatheringMengubah(landing) : null;
  const reset = () => {
    setTanya(false);
    const gaya = gayaPreset(preset, landing);
    setLanding(preset.features.gathering ? isiGathering(gaya, TENTANG_BAWAAN) : gaya);
    // Baris ini hilang setelah Reset (preset tidak lagi "Edited"): fokus ke kartu yang dipakai.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Preset"] [aria-checked="true"]')?.focus());
  };
  if (tanya) {
    return (
      <div
        ref={kotak}
        role="group"
        aria-label={`Reset to ${preset.label}`}
        aria-describedby={`reset-${preset.key}`}
        className="-mt-2 flex flex-col gap-2 rounded-md bg-surface-container px-3 py-2"
        // Esc = Keep, seperti menutup dialog.
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          setTanya(false);
        }}
      >
        <p id={`reset-${preset.key}`} className="text-body-small text-on-surface">
          {gantiMerek ? (
            <>
              This also changes the brand colour from <Contoh warna={sekarang} /> to <Contoh warna={preset.tokens.brand} />.
            </>
          ) : null}
          {gantiMerek && gantiBilah ? " " : null}
          {gantiBilah && bilah ? `${gantiMerek ? "The" : "This also makes the"} top bar ${gantiMerek ? "becomes " : ""}${bilah.color.toLowerCase() === "#ffffff" ? "white" : bilah.color.toUpperCase()}, ${bilah.height} px tall.` : null}
          {isi?.tentang ? `${gantiMerek || gantiBilah ? " " : ""}An empty About heading and cards get the ${preset.label} text.` : null}
          {isi?.lokasi ? `${gantiMerek || gantiBilah || isi.tentang ? " " : ""}Location and the hotel card are hidden; show them again in Page sections.` : null}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="text" size="sm" onClick={() => setTanya(false)}>
            Keep my colours
          </Button>
          <Button variant="tonal" size="sm" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div ref={kotak} className="-mt-2 flex items-center gap-2">
      <p className="min-w-0 flex-1 text-body-small text-on-surface-variant">
        {isi ? "Colours, fonts, top bar, corners or About" : "Colours, fonts or corners"} differ from {preset.label}.
      </p>
      <Button variant="text" size="sm" onClick={gantiMerek || gantiBilah || isi?.tentang || isi?.lokasi ? () => setTanya(true) : reset}>
        {isi ? `Reset to ${preset.label}` : "Reset colours and fonts"}
      </Button>
    </div>
  );
}

function Contoh({ warna }: { warna: string }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle font-medium">
      <span aria-hidden className="inline-block size-3 rounded-full border border-outline-variant" style={{ background: warna }} />
      {warna.toUpperCase()}
    </span>
  );
}

/** Teks bawaan Tentang acara gaya gathering, Indonesia dan English. Umum: tanpa nama kota atau jumlah orang. */
const TENTANG_BAWAAN: TentangBawaan = {
  id: { heading: LANDING_UI.id.aboutHeadingDefault, cards: LANDING_UI.id.aboutCardsDefault },
  en: { heading: LANDING_UI.en.aboutHeadingDefault, cards: LANDING_UI.en.aboutCardsDefault },
};

/** Judul kartu bagian "Sebelum berangkat" untuk acara gathering. */
const INFO_GATHERING = ["Dress code", "Yang perlu dibawa", "Kontak panitia"];

/**
 * Preset ditambah, khusus Gathering, blok Kartu poin "Sebelum berangkat"
 * (sekali saja). Bloknya masuk Susunan dalam keadaan TERSEMBUNYI: kartu
 * berjudul tanpa isi tetap tampil, dan halaman publik tidak boleh memuat teks
 * contoh. Panitia mengisi teksnya lalu menampilkannya.
 */
export function pakaiPreset(preset: LandingThemePreset, landing: EventLandingConfig): EventLandingConfig {
  const terapan = terapkanPreset(preset, landing);
  // Gathering: judul, label, dan tiga kartu Tentang acara seperti rancangan
  // (hanya yang masih kosong), Lokasi disembunyikan. Lihat isiGathering.
  const hasil = preset.features.gathering ? isiGathering(terapan, TENTANG_BAWAAN) : terapan;
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
  const sections = susunanDenganPortal(hasil.sections, hasil.blocks);
  // Sebelum FAQ, seperti di rancangan; tanpa FAQ, di ujung.
  const faq = sections.findIndex((section) => section.id === "faq");
  const posisi = faq === -1 ? sections.length : faq;
  return {
    ...hasil,
    blocks: [...(hasil.blocks ?? []), blok],
    sections: [...sections.slice(0, posisi), { id: blok.id, enabled: false }, ...sections.slice(posisi)],
  };
}
