import type { ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

// Potongan formulir padat untuk panel detail admin (denah kursi, undian, booth,
// penawaran, papan peringkat).
//
// Kolom setinggi 36px dan label di atasnya: panel detail ini padat oleh isian,
// dan kolom setinggi 56px milik `TextField` membuat satu entri butuh tiga layar
// untuk digulir.

export const INPUT = "mt-1.5 h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium text-on-surface outline-none focus:border-primary";

export function Field({ label, hint, htmlFor, children, className }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-body-medium font-medium text-on-surface">{label}</label>
      {children}
      {hint ? <div className="mt-1 text-body-medium text-on-surface-variant">{hint}</div> : null}
    </div>
  );
}

/** Satu kelompok isian di panel samping. Kelompok kedua dan seterusnya dipisah garis tipis. */
export function Kelompok({ title, note, first, children }: { title?: string; note?: ReactNode; first?: boolean; children: ReactNode }) {
  return (
    <section className={cx("flex flex-col gap-4", !first && "border-t border-outline-variant pt-5")}>
      {title || note ? (
        <div>
          {title ? <h3 className="text-body-medium font-semibold text-on-surface">{title}</h3> : null}
          {note ? <p className="mt-1 text-body-medium text-on-surface-variant">{note}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
