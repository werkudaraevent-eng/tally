"use client";

import { DotsThree } from "@phosphor-icons/react";
import { useId, useState, type ReactNode } from "react";
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
export function MenuBlok({ label, items }: { label: string; items: ItemMenuBlok[] }) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();
  return (
    <>
      <IconButton
        ref={setPemicu}
        size="sm"
        label={label}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
        className={cx(menu.open && "bg-surface-container-high text-on-surface")}
      >
        <DotsThree size={20} weight="bold" />
      </IconButton>
      {menu.open ? (
        <Popover anchor={menu} id={menuId} label={label} width={224}>
          {items.map((item, indeks) => (
            <div key={item.label}>
              {item.bahaya && indeks > 0 ? <hr className="my-1 border-outline-variant" /> : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  menu.tutup();
                  item.onSelect();
                }}
                className={cx(item.bahaya ? POPOVER_ITEM_DANGER : POPOVER_ITEM, "disabled:pointer-events-none disabled:opacity-40")}
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
