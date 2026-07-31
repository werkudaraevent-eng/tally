"use client";

import { CaretDown, FileCsv, FileXls, Package } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

// Tombol export dengan pilihan format.
//
// Satu komponen dipakai tiga halaman admin (Dashboard, Orders, Reports). Kalau
// tiap halaman menyusun menunya sendiri, pilihan formatnya akan pelan-pelan
// berbeda dan panitia menemukan tombol yang tidak sama di tempat berbeda.
//
// Unduhan memakai tautan biasa, bukan fetch: peramban menangani sendiri berkas
// yang datang dengan Content-Disposition attachment, jadi tidak perlu menahan
// seluruh isi berkas di memori tab hanya untuk menyimpannya.

type Choice = {
  format: "csv" | "xlsx";
  label: string;
  detail: string;
  Icon: typeof FileCsv;
};

const CHOICES: Choice[] = [
  { format: "xlsx", label: "Excel (.xlsx)", detail: "Siap dibuka dan dijumlahkan di Excel.", Icon: FileXls },
  { format: "csv", label: "CSV (.csv)", detail: "Untuk diolah ulang atau diimpor ke sistem lain.", Icon: FileCsv },
];

export function ExportMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Menu ditutup saat klik di luar atau menekan Esc. Tanpa keduanya, menu yang
  // terbuka tidak sengaja akan menutupi kontrol lain dan terasa macet.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-semibold text-white"
      >
        <Package size={19} /> Export data
        <CaretDown size={15} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Pilih format export"
          // Menu dibuat melebar minimal selebar tombolnya dan diberi lapisan di
          // atas isi halaman, supaya tidak terpotong kartu di bawahnya.
          className="absolute right-0 z-30 mt-1 w-72 border border-[var(--line)] bg-[var(--surface)] shadow-lg"
        >
          {CHOICES.map(({ format, label, detail, Icon }) => (
            <a
              key={format}
              role="menuitem"
              href={`/api/admin/export?format=${format}`}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 border-b border-[var(--line)] p-3 text-left last:border-b-0 hover:bg-[var(--surface-muted)]"
            >
              <Icon size={20} className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{detail}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
