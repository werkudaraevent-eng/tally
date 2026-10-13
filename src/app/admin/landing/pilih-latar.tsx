"use client";

import { useId, useState } from "react";
import { SegmentedButton } from "@/components/m3";
import { LANDING_BLOCK_TONE_LABELS, type LandingBlockTone } from "@/lib/domain";
import { hexLatarSendiri, LATAR_SENDIRI_AWAL, warnaLatarSendiri } from "@/lib/landing-latar-sendiri";
import { cx } from "@/lib/m3/cx";

type Pilihan = LandingBlockTone | "custom";

/** "#abc", "abc", "#AABBCC", "aabbcc" menjadi "#AABBCC"; selain itu null. */
function bacaHex(teks: string): string | null {
  const isi = teks.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(isi)) return `#${isi.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(isi)) return `#${isi}`.toUpperCase();
  return null;
}

/**
 * Background untuk blok dan bagian halaman acara: Light, Grey, Dark brand,
 * atau Custom (warna bebas lewat pemilih warna atau kode hex). Teks di atas
 * warna sendiri dipilih otomatis (landing-latar-sendiri.ts); editor hanya
 * memberi tahu hasilnya dan memperingatkan warna tengah yang sulit dibaca.
 *
 * `saran`: warna milik acara ini (merek, aksen, warna yang sudah dipakai di
 * halaman), bukan daftar tetap, supaya bagian-bagian mudah diseragamkan.
 */
export function PilihLatar({
  label,
  tone,
  warna,
  saran,
  onTone,
  onWarna,
}: {
  label: string;
  tone: LandingBlockTone;
  /** Warna sendiri "#RRGGBB"; kosong = memakai `tone`. */
  warna: string | undefined;
  saran: string[];
  onTone: (tone: LandingBlockTone) => void;
  onWarna: (hex: string) => void;
}) {
  const id = useId();
  const sendiri = hexLatarSendiri(warna);
  const pilihan: Pilihan = sendiri ? "custom" : tone;
  const usul = [...new Set(saran.map((item) => hexLatarSendiri(item)).filter((item): item is string => Boolean(item)))].slice(0, 6);

  return (
    <div className="flex flex-col gap-1.5">
      <p id={`${id}-judul`} className="text-body-medium font-medium text-on-surface">Background</p>
      <SegmentedButton<Pilihan>
        label={label}
        labelledBy={`${id}-judul`}
        value={pilihan}
        onChange={(nilai) => (nilai === "custom" ? onWarna(sendiri ?? usul[0] ?? LATAR_SENDIRI_AWAL) : onTone(nilai))}
        options={[
          ...(["light", "panel", "dark"] as const).map((nilai) => ({ value: nilai, label: LANDING_BLOCK_TONE_LABELS[nilai] })),
          { value: "custom" as const, label: "Custom" },
        ]}
      />
      {sendiri ? <WarnaSendiri id={id} label={label} value={sendiri} usul={usul} onChange={onWarna} /> : null}
    </div>
  );
}

function WarnaSendiri({ id, label, value, usul, onChange }: { id: string; label: string; value: string; usul: string[]; onChange: (hex: string) => void }) {
  const [ketik, setKetik] = useState(value);
  const [salah, setSalah] = useState(false);
  // Pemilih warna dan saran mengganti nilai dari luar kolom hex.
  const [terakhir, setTerakhir] = useState(value);
  if (terakhir !== value) {
    setTerakhir(value);
    setKetik(value);
    setSalah(false);
  }
  const hasil = warnaLatarSendiri(value);

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={value.toLowerCase()}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent p-0.5"
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          inputMode="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          value={ketik}
          aria-label={`${label} hex code`}
          aria-invalid={salah || undefined}
          aria-describedby={salah ? `${id}-salah` : `${id}-catatan`}
          onChange={(event) => {
            setKetik(event.target.value);
            const hex = bacaHex(event.target.value);
            setSalah(false);
            if (hex && event.target.value.replace(/^#/, "").length === 6) onChange(hex);
          }}
          onBlur={() => {
            const hex = bacaHex(ketik);
            if (hex) {
              onChange(hex);
              setKetik(hex);
            } else setSalah(true);
          }}
          className={cx(
            "h-9 w-[6.5rem] rounded-md border bg-surface-container-lowest px-2.5 font-mono text-body-medium uppercase text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary",
            salah ? "border-error" : "border-outline-variant",
          )}
        />
        {usul.length > 0 ? (
          <div role="group" aria-label="Colours from this event" className="flex items-center gap-1.5 pl-1">
            {usul.map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                aria-label={`Use ${hex}`}
                aria-pressed={hex === value}
                onClick={() => onChange(hex)}
                className={cx(
                  "size-7 rounded-full border border-outline-variant outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary",
                  hex === value && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        ) : null}
      </div>
      {salah ? (
        <p id={`${id}-salah`} className="text-body-small text-error">Type a hex code such as #7A1F2B.</p>
      ) : (
        <p id={`${id}-catatan`} className="text-body-small text-on-surface-variant">
          Text turns {hasil.gelap ? "white" : "dark"} automatically so it stays readable.
        </p>
      )}
    </div>
  );
}
