"use client";

import { CaretDown, FileCsv, FileXls, Package } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Popover, usePopoverAnchor } from "@/components/m3";

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
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        ref={setPemicu}
        type="button"
        onClick={menu.toggle}
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
        aria-haspopup="menu"
        className="m3-btn inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-label-large font-medium text-on-surface transition-colors duration-150 hover:bg-primary-soft"
        data-size="md"
      >
        <Package size={16} /> {label}
        <CaretDown size={14} className={`transition-transform ${menu.open ? "rotate-180" : ""}`} />
      </button>

      {/* Portal, sama seperti menu lain: tombol ini duduk di kepala halaman
          sekarang, tapi ia juga dipakai di dalam kartu, dan kartu yang memotong
          isinya akan memotong menunya. */}
      {menu.open ? (
        <Popover anchor={menu} id={menuId} label="Pilih format export" width={288} className="p-0">
          {CHOICES.map(({ format, label, detail, Icon }) => (
            <a
              key={format}
              role="menuitem"
              href={`${endpoint}?format=${format}`}
              onClick={menu.tutup}
              className="flex items-start gap-3 border-b border-outline-variant p-3 text-left last:border-b-0 hover:bg-primary-soft"
            >
              <Icon size={18} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <span>
                <span className="block text-body-medium font-medium">{label}</span>
                <span className="mt-0.5 block text-body-small text-on-surface-variant">{detail}</span>
              </span>
            </a>
          ))}
        </Popover>
      ) : null}
    </div>
  );
}
