"use client";

import { CaretDown, GearSix, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Menu akun di ujung kanan bilah atas.
 *
 * Menampung hal-hal yang BUKAN tujuan navigasi: siapa yang sedang login,
 * pengaturan sistem, dan keluar. Sebelumnya ketiganya tinggal di kaki drawer dan
 * memakan ~170px dari ruang yang sama dengan daftar menu — pada jendela pendek,
 * itu selisih antara tiga baris menu terlihat dan enam.
 *
 * Nama akun yang sedang login sebelumnya TIDAK ADA di mana pun di layar admin.
 * Di sistem yang dipakai bergantian oleh panitia dari satu laptop di meja
 * registrasi, itu masalah nyata: tidak ada cara memastikan tindakan yang tercatat
 * di audit trail akan atas nama siapa.
 *
 * Pola menunya mengikuti yang dipakai Linear, Vercel, dan Stripe: satu tombol
 * avatar, satu menu, tidak ada yang tersembunyi di tempat lain.
 */

const LABEL_ROLE: Record<string, string> = {
  booth: "Admin Booth",
  cashier: "Kasir",
  admin: "Panitia / Admin",
  super_admin: "Super Admin",
};

export function UserMenu({
  username,
  role,
  settingsHref,
  onLogout,
  loggingOut,
}: {
  username: string | null;
  role: string | null;
  settingsHref: string;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wadah = useRef<HTMLDivElement | null>(null);
  const tombol = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    // Dua jalan menutup, keduanya wajib: Escape untuk papan ketik, dan ketukan
    // di luar untuk tetikus/sentuh. Menu yang hanya bisa ditutup dengan menekan
    // tombolnya lagi adalah jebakan di layar sempit, tempat menu menutupi hal
    // yang ingin ditekan berikutnya.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Fokus dikembalikan ke tombolnya. Tanpa ini fokus jatuh ke <body> dan
      // Tab berikutnya memulai lagi dari awal halaman.
      tombol.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!wadah.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const inisial = (username ?? "?").slice(0, 1).toUpperCase();

  return (
    <div ref={wadah} className="relative">
      <button
        ref={tombol}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={username ? `Menu akun ${username}` : "Menu akun"}
        className="m3-state flex min-h-11 items-center gap-2 rounded-full bg-surface-container-high pl-1 pr-2 text-label-large font-semibold"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-primary text-label-large text-on-primary">
          {inisial}
        </span>
        <CaretDown size={16} weight="bold" className="text-on-surface-variant" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu akun"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-outline-variant bg-surface-container-high p-2 shadow-level2"
        >
          <div className="px-3 py-2">
            <p className="truncate text-body-medium font-semibold">{username ?? "Tidak diketahui"}</p>
            <p className="mt-0.5 text-body-small text-on-surface-variant">
              {role ? LABEL_ROLE[role] ?? role : "Sesi tidak terbaca"}
            </p>
          </div>

          <div className="my-2 border-t border-outline-variant" />

          <Link
            href={settingsHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="m3-state flex min-h-11 items-center gap-3 rounded-xl px-3 text-label-large font-semibold"
          >
            <GearSix size={20} />
            Pengaturan
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            disabled={loggingOut}
            className="m3-state flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-label-large font-semibold text-error disabled:opacity-50"
          >
            <SignOut size={20} />
            {loggingOut ? "Keluar…" : "Logout"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
