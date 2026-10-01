"use client";

import { Kelompok } from "@/components/admin/compact-form";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { SegmentedButton, TextField } from "@/components/m3";
import {
  LANDING_NAV_DEFAULTS,
  LANDING_NAV_HEIGHT_MAX,
  LANDING_NAV_HEIGHT_MIN,
  LANDING_NAV_WIDTH_LABELS,
  type LandingNavConfig,
  type LandingNavWidth,
} from "@/lib/domain";
import { modernNavStyle } from "@/lib/registration-theme-css";

/**
 * Contoh kecil bilah atas di panel setelan. Pratinjau besar hanya memuat versi
 * tersimpan, sedangkan warna dan transparansi paling mudah dinilai sambil
 * menggeser; latar bergaris gelap-terang memperlihatkan seberapa tembus bilahnya.
 */
function BilahAtasContoh({ warna, opasitas, lebar, nama, logo }: { warna: string; opasitas: number; lebar: LandingNavWidth; nama: string; logo: string | null }) {
  // Variabel yang sama dengan halaman publik (hero ber-KV), supaya warna teks
  // di contoh ini tidak bisa berbeda dari yang dilihat tamu.
  const gaya = modernNavStyle({ color: warna, opacity: opasitas }, { ink: "#ffffff", onInk: "#181d27" });
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-md border border-outline-variant"
      style={{ ...gaya, background: "linear-gradient(110deg, #3b2f25 0%, #8a6a4a 35%, #d9c7a8 55%, #f4efe6 70%, #6b5a48 100%)" }}
    >
      <div className={lebar === "content" ? "px-4" : ""}>
        <div
          className={`flex h-10 items-center justify-between bg-[var(--nav-bg)] px-3 text-body-small font-semibold text-[var(--nav-ink)] ${lebar === "content" ? "rounded-b-md" : ""}`}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="block max-h-7 w-auto max-w-[120px] object-contain object-left" />
          ) : (
            <span className="truncate">{nama}</span>
          )}
          <span className="font-normal">Masuk</span>
        </div>
      </div>
      <div className="h-10" />
    </div>
  );
}

/**
 * Setelan bilah atas tata letak Modern di CMS Halaman acara > Tampilan:
 * logo, warna, transparansi, lebar, tinggi.
 */
export function BilahAtasEditor({
  value: bilahAtas,
  onChange,
  eventName,
  disabled,
}: {
  value: LandingNavConfig;
  onChange: (next: LandingNavConfig) => void;
  eventName: string;
  disabled?: boolean;
}) {
  const setBilahAtas = (patch: Partial<LandingNavConfig>) => onChange({ ...bilahAtas, ...patch });
  const warnaBilah = bilahAtas.color ?? LANDING_NAV_DEFAULTS.color;
  const opasitasBilah = bilahAtas.opacity ?? LANDING_NAV_DEFAULTS.opacity;
  return (
    <Kelompok title="Bilah atas" note="Bilah berisi logo atau nama acara, Masuk, dan Daftar yang menempel di atas halaman.">
      <BilahAtasContoh
        warna={warnaBilah}
        opasitas={opasitasBilah}
        lebar={bilahAtas.width ?? "full"}
        nama={eventName}
        logo={bilahAtas.logo_url ?? null}
      />
      <ImageUploadField
        label="Logo acara"
        kind="landing"
        fit="contain"
        previewClassName="h-12 w-36"
        hint="Tampil di pojok kiri bilah menggantikan nama acara. Kosongkan untuk memakai nama. PNG transparan paling rapi; tingginya menyesuaikan bilah, lebar maks 240px."
        value={bilahAtas.logo_url ?? null}
        onChange={(url) => setBilahAtas({ logo_url: url })}
        disabled={disabled}
      />
      <label className="flex items-center gap-3">
        <input
          type="color"
          value={warnaBilah}
          onChange={(event) => setBilahAtas({ color: event.target.value })}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent"
          aria-label="Warna bilah"
        />
        <span className="min-w-0">
          <span className="block text-body-medium font-medium text-on-surface">Warna bilah</span>
          <span className="block text-body-medium text-on-surface-variant">{warnaBilah.toUpperCase()}</span>
        </span>
      </label>
      <div>
        <label htmlFor="bilah-opasitas" className="flex items-baseline justify-between text-body-medium font-medium text-on-surface">
          <span>Ketidaktembusan</span>
          <span className="tabular-nums text-on-surface-variant">{opasitasBilah}%</span>
        </label>
        <input
          id="bilah-opasitas"
          type="range"
          min={0}
          max={100}
          step={1}
          value={opasitasBilah}
          onChange={(event) => setBilahAtas({ opacity: Number.parseInt(event.target.value, 10) })}
          className="h-11 w-full accent-primary"
        />
        <p className="mt-1.5 text-body-medium text-on-surface-variant">
          0% bening, 100% pekat. Berlaku selama bilah di atas gambar hero. Setelah hero lewat, bilah dibuat paling sedikit 90% pekat supaya teksnya tetap terbaca di atas halaman putih.
        </p>
      </div>
      <div>
        <p className="text-body-medium font-medium text-on-surface">Lebar bilah</p>
        <SegmentedButton<LandingNavWidth>
          className="mt-1.5 w-full"
          label="Lebar bilah"
          value={bilahAtas.width ?? "full"}
          onChange={(value) => setBilahAtas({ width: value })}
          options={[
            { value: "full", label: LANDING_NAV_WIDTH_LABELS.full },
            { value: "content", label: LANDING_NAV_WIDTH_LABELS.content },
          ]}
        />
        <p className="mt-1.5 text-body-medium text-on-surface-variant">
          Selebar isi: bilah sejajar dengan kolom isi halaman, sudut bawahnya membulat, dan gambar hero terlihat di kiri-kanannya.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <TextField
          className="w-32"
          label="Tinggi bilah"
          type="number"
          inputMode="numeric"
          min={LANDING_NAV_HEIGHT_MIN}
          max={LANDING_NAV_HEIGHT_MAX}
          step={1}
          trailing={<span className="text-body-medium text-on-surface-variant">px</span>}
          value={bilahAtas.height ?? LANDING_NAV_DEFAULTS.height}
          onChange={(event) => {
            const angka = Number.parseInt(event.target.value, 10);
            setBilahAtas({ height: Number.isNaN(angka) ? undefined : angka });
          }}
        />
        <input
          type="range"
          aria-label="Tinggi bilah, penggeser"
          min={LANDING_NAV_HEIGHT_MIN}
          max={LANDING_NAV_HEIGHT_MAX}
          step={1}
          value={bilahAtas.height ?? LANDING_NAV_DEFAULTS.height}
          onChange={(event) => setBilahAtas({ height: Number(event.target.value) })}
          className="h-11 w-full accent-primary"
        />
        <p className="text-body-medium text-on-surface-variant">
          Bawaan {LANDING_NAV_DEFAULTS.height}. Rentang {LANDING_NAV_HEIGHT_MIN} sampai {LANDING_NAV_HEIGHT_MAX} px.
        </p>
      </div>
    </Kelompok>
  );
}
