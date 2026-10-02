"use client";

import { DotsThree } from "@phosphor-icons/react";
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconButton, Popover, POPOVER_ITEM, POPOVER_ITEM_DANGER, usePopoverAnchor } from "@/components/m3";
import { cx } from "@/lib/m3/cx";

export type ItemMenuBlok = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Aksi yang membuang sesuatu. Dipisah garis dari yang lain dan diwarnai merah. */
  bahaya?: boolean;
};

/**
 * Tombol ⋯ satu baris Susunan halaman, dengan menunya.
 *
 * Komponen tersendiri karena setiap baris butuh jangkar popover-nya sendiri,
 * dan hook tidak boleh dipanggil di dalam perulangan baris.
 */
export function MenuBlok({ label, items, width = 224 }: { label: string; items: ItemMenuBlok[]; width?: number }) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();

  // Menu dirender di portal, jauh dari pemicunya di urutan dokumen. Tanpa
  // memindahkan fokus ke dalamnya, Tab dari tombol ⋯ jatuh ke baris berikutnya
  // dan menunya tidak bisa dipakai tanpa tetikus.
  useEffect(() => {
    if (!menu.open) return;
    const frame = window.requestAnimationFrame(() => butir(menuId)[0]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [menu.open, menuId]);

  /** Panah, Home, End berpindah antar butir; Tab menutup menu (pola menu WAI-ARIA). */
  function tombol(event: KeyboardEvent) {
    if (event.key === "Tab") {
      menu.tutup();
      return;
    }
    const daftar = butir(menuId);
    if (daftar.length === 0) return;
    const sekarang = daftar.indexOf(document.activeElement as HTMLElement);
    const tujuan =
      event.key === "ArrowDown" ? (sekarang + 1) % daftar.length
        : event.key === "ArrowUp" ? (sekarang - 1 + daftar.length) % daftar.length
          : event.key === "Home" ? 0
            : event.key === "End" ? daftar.length - 1
              : null;
    if (tujuan === null) return;
    event.preventDefault();
    daftar[tujuan].focus();
  }
  return (
    <>
      <IconButton
        ref={setPemicu}
        size="sm"
        label={label}
        // `!`: profil `.press` mengecilkan tombol ikon kecil jadi 32px, di bawah
        // target sentuh 40px yang dijanjikan desain editor ini.
        className={cx("size-10!", menu.open && "bg-surface-container-high text-on-surface")}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
      >
        <DotsThree size={20} weight="bold" />
      </IconButton>
      {menu.open ? (
        <Popover anchor={menu} id={menuId} label={label} width={width} onKeyDown={tombol}>
          {items.map((item, indeks) => (
            <div key={item.label}>
              {item.bahaya && indeks > 0 ? <hr className="my-1 border-outline-variant" /> : null}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => {
                  menu.tutup();
                  // Kembali ke tombol ⋯, bukan ke <body>: Naikkan/Turunkan dipakai berulang.
                  menu.fokus();
                  item.onSelect();
                }}
                className={cx(item.bahaya ? POPOVER_ITEM_DANGER : POPOVER_ITEM, "whitespace-nowrap disabled:pointer-events-none disabled:opacity-40")}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </Popover>
      ) : null}
    </>
  );
}

/** Butir menu yang bisa dipilih, sesuai urutan tampil. */
function butir(menuId: string): HTMLElement[] {
  const panel = document.getElementById(menuId);
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)")) : [];
}
