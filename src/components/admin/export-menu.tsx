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

export type ExportMenuProps = {
  /**
   * Alamat unduhan. Formatnya ditambahkan sebagai `?format=`.
   *
   * Ada karena menu ini sekarang dipakai Daftar peserta juga, dan di sana
   * endpointnya berbeda. Sebelumnya halaman itu memasang DUA tombol terpisah,
   * "Ekspor XLSX" dan "CSV", dan dua tombol untuk satu keputusan format adalah
   * dua tombol yang harus dibaca sebelum salah satunya ditekan.
   */
  endpoint?: string;
  label?: string;
  className?: string;
};

export function ExportMenu({ endpoint = "/api/admin/export", label = "Export data", className }: ExportMenuProps) {
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
        className="m3-btn inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-label-large font-medium text-on-surface transition-colors duration-150 hover:bg-primary-soft"
        data-size="md"
      >
        <Package size={16} /> {label}
        <CaretDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Pilih format export"
          // Menu dibuat melebar minimal selebar tombolnya dan diberi lapisan di
          // atas isi halaman, supaya tidak terpotong kartu di bawahnya.
          className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-level2"
        >
          {CHOICES.map(({ format, label, detail, Icon }) => (
            <a
              key={format}
              role="menuitem"
              href={`${endpoint}?format=${format}`}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 border-b border-outline-variant p-3 text-left last:border-b-0 hover:bg-primary-soft"
            >
              <Icon size={18} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <span>
                <span className="block text-body-medium font-medium">{label}</span>
                <span className="mt-0.5 block text-body-small text-on-surface-variant">{detail}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
