"use client";

import { Warning } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cx } from "@/lib/m3/cx";
import { Field, INPUT } from "@/components/admin/compact-form";

export { Field, INPUT };

// Potongan formulir yang dipakai bersama oleh panel-panel CMS Undian. `Field`
// dan `INPUT` berasal dari formulir padat admin; sisanya khusus Undian.

export function NumberField({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? Math.max(min, Math.min(max, next)) : min);
        }}
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
      {busy ? "Mengunggah..." : label}
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
