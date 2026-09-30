"use client";

import { KETERANGAN_KUNCI, useTerkunci } from "@/components/admin/page-context";
import { ArrowsClockwise, CaretDown, GearSix } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useId, useState } from "react";
import { Popover, StatusDot, usePopoverAnchor } from "@/components/m3";

// Tombol sinkron Scanner API di area aksi kepala halaman.
//
// Status sinkron dan tautannya dulu ditulis di baris meta di bawah judul. Di
// sana ia berebut satu baris dengan hitungan peserta, dan di layar sempit
// baris meta pecah jadi dua. Keadaannya hanya perlu dilihat saat seseorang
// berniat menyinkron, jadi ia ikut masuk ke menu ini. Sync yang GAGAL tetap
// punya banner sendiri di halaman, karena itu yang tidak boleh terlewat.

export type SyncMenuProps = {
  /** Menit antar-sync otomatis; 0 berarti mati. */
  menit: number;
  gagal: string | null | undefined;
  /** Teks waktu sync terakhir yang sudah diformat, termasuk zona. */
  terakhir: string | null;
  syncing: boolean;
  onSync: () => void;
};

export function SyncMenu({ menit, gagal, terakhir, syncing, onSync }: SyncMenuProps) {
  // Sinkron menulis peserta ke acara: ikut terkunci seperti tombol simpan.
  const terkunci = useTerkunci(true);
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();
  const status = gagal ? "Sync terakhir gagal" : menit > 0 ? `Otomatis tiap ${menit} menit` : "Sync otomatis mati";

  return (
    <div className="relative">
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
        <ArrowsClockwise size={16} className={syncing ? "animate-spin" : undefined} /> Sinkron
        <CaretDown size={14} className={`transition-transform ${menu.open ? "rotate-180" : ""}`} />
      </button>

      {menu.open ? (
        <Popover anchor={menu} id={menuId} label="Sinkron Scanner API" width={288} className="p-0">
          <div className="border-b border-outline-variant p-3 text-body-medium">
            <span className="flex items-center gap-2 font-medium text-on-surface">
              <StatusDot tone={gagal ? "error" : menit > 0 ? "success" : "neutral"} />
              {status}
            </span>
            <span className="mt-0.5 block text-body-small text-on-surface-variant">{terakhir ? `Terakhir ${terakhir}` : "Belum pernah sync"}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={syncing || terkunci}
            title={terkunci ? KETERANGAN_KUNCI : undefined}
            onClick={() => { onSync(); menu.tutup(); }}
            className="flex w-full items-center gap-3 border-b border-outline-variant p-3 text-left text-body-medium font-medium hover:bg-primary-soft disabled:opacity-50"
          >
            <ArrowsClockwise size={18} className="shrink-0 text-on-surface-variant" />
            {syncing ? "Menyinkron..." : "Sync sekarang"}
          </button>
          <Link
            role="menuitem"
            href="/admin/settings?tab=integrasi"
            onClick={menu.tutup}
            className="flex items-center gap-3 p-3 text-body-medium font-medium hover:bg-primary-soft"
          >
            <GearSix size={18} className="shrink-0 text-on-surface-variant" />
            Atur sinkron
          </Link>
        </Popover>
      ) : null}
    </div>
  );
}
