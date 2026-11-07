"use client";

import { Warning } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { cx } from "@/lib/m3/cx";
import { Field, INPUT } from "@/components/admin/compact-form";

export { Field, INPUT };

// Potongan formulir yang dipakai bersama oleh panel-panel CMS Undian. `Field`
// dan `INPUT` berasal dari formulir padat admin; sisanya khusus Undian.

export function NumberField({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  // Teks yang sedang diketik disimpan sendiri, jadi kolom boleh kosong atau
  // sementara di luar batas. Dulu nilai di-clamp tiap ketukan: kolom tak bisa
  // dikosongkan (langsung jadi `min`) dan angka baru tidak bisa diketik.
  // Angka yang sah langsung dikirim; batasnya ditegakkan saat fokus lepas/Enter.
  const [text, setText] = useState<string | null>(null);
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.round(next)));
  const commit = () => {
    if (text === null) return;
    const next = Number(text);
    onChange(text.trim() !== "" && Number.isFinite(next) ? clamp(next) : clamp(value));
    setText(null);
  };
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text ?? String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          const next = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(next) && next >= min && next <= max) onChange(Math.round(next));
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || text === null) return;
          // Angka di luar batas: tahan kirim formulir supaya angka yang
          // disesuaikan terlihat dulu sebelum disimpan.
          const next = Number(text);
          if (text.trim() === "" || !(next >= min && next <= max)) event.preventDefault();
          commit();
        }}
        aria-invalid={text !== null && (text.trim() === "" || !(Number(text) >= min && Number(text) <= max)) ? true : undefined}
        className={cx(INPUT, "tabular-nums")}
      />
    </Field>
  );
}

/** Tombol unggah berkas bergaya tombol outlined. Input aslinya `sr-only`, jadi fokus papan ketik tetap sampai. */
export function UploadButton({ label, accept, busy, onFile, icon }: { label: string; accept: string; busy?: boolean; onFile: (file: File) => void; icon?: ReactNode }) {
  return (
    <label className={cx(
      "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-medium font-medium text-on-surface hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
      busy && "pointer-events-none opacity-60",
    )}>
      {icon}
      {busy ? "Uploading..." : label}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Nilai input dikosongkan supaya memilih berkas yang sama dua kali
          // berturut-turut tetap memicu onChange.
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

/** Pesan galat di dalam panel. */
export function PaneError({ children }: { children: ReactNode }) {
  return <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><Warning size={16} className="mt-0.5 shrink-0" aria-hidden />{children}</p>;
}
