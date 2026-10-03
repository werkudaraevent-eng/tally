"use client";

import { Kelompok } from "@/components/admin/compact-form";
import { Switch } from "@/components/m3/switch";
import { LANDING_HEADING_FONTS, type EventLandingConfig } from "@/lib/domain";
import { LANDING_THEME_PRESETS, presetCocok, terapkanPreset } from "@/lib/landing-theme-presets";

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
    <Kelompok title="Preset tema" first={first} note="Satu klik mengisi tata letak, warna, dan huruf judul. Isi halaman tidak berubah, dan semuanya tetap bisa diatur satu per satu di bawah.">
      <div role="radiogroup" aria-label="Preset tema" className="grid gap-2">
        {LANDING_THEME_PRESETS.map((preset) => {
          const pilih = presetCocok(preset, landing);
          return (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={pilih}
              onClick={() => setLanding(terapkanPreset(preset, landing))}
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
      {/* Bagian dari preset Gathering, tetapi bisa dimatikan sendiri: acara
          lain pun bisa khusus undangan. Hanya Modern yang membacanya. */}
      <Switch
        checked={landing.layout === "modern" && Boolean(landing.invite_only)}
        onChange={(value) => setLanding({ ...landing, invite_only: value })}
        disabled={landing.layout !== "modern"}
        label="Khusus undangan"
        description={
          landing.layout !== "modern"
            ? "Hanya untuk tata letak Modern."
            : landing.invite_only
              ? "Saat pendaftaran ditutup, tombol utama halaman mengajak tamu undangan masuk untuk melihat tiket dan info perjalanannya."
              : "Peserta yang diimpor panitia masuk lewat undangan. Saat pendaftaran ditutup, halaman mengajak mereka masuk."
        }
      />
    </Kelompok>
  );
}
