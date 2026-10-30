"use client";

import { useId, useState } from "react";
import { Popover, POPOVER_ITEM, ThemeToggle, usePopoverAnchor } from "@/components/m3";
import { ROLE_LABEL, type UserRole } from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

/**
 * Menu akun di ujung kanan bilah atas.
 *
 * Menampung hal-hal yang BUKAN tujuan navigasi: siapa yang sedang login, tema,
 * dan keluar. Pengaturan acara sengaja tidak di sini: menu avatar
 * hanya untuk akun pribadi, dan "Pengaturan akun" yang membuka setelan acara
 * membuat panitia mencari setelan di tempat yang salah. Sebelumnya ketiganya tinggal di kaki drawer dan
 * memakan ~170px dari ruang yang sama dengan daftar menu.
 *
 * Nama akun yang sedang login sebelumnya TIDAK ADA di mana pun di layar admin.
 * Di sistem yang dipakai bergantian oleh panitia dari satu laptop di meja
 * registrasi, itu masalah nyata: tidak ada cara memastikan tindakan yang tercatat
 * di audit trail akan atas nama siapa.
 *
 * ---- Bentuknya mengikuti menu akun Vercel, Linear, GitHub ------------------
 *
 * Kepala: avatar, nama akun tebal berwarna tinta (DATA), lalu peran dan
 * cakupan akses abu (LABEL). Sebelumnya nama, peran, dan "Tally v0.1.0" tiga
 * baris abu sebobot, jadi tidak ada yang terbaca duluan, dan nomor versi adalah
 * info untuk kita, bukan untuk klien. Versi kini hanya di tooltip tombol
 * Panduan (?) dan kaki halaman Panduan sistem.
 *
 * Tema satu baris dengan tiga ikon, bukan submenu: satu klik, dan pilihan yang
 * aktif terlihat tanpa membuka apa pun.
 *
 * Keluar ditulis polos, bukan merah. Merah dipakai untuk aksi yang membuang
 * sesuatu; keluar tidak menghapus apa pun, dan tidak satu pun menu akun
 * acuan di atas mewarnainya.
 */

/**
 * Baris kedua kepala menu: cakupan akses akun. super_admin mencapai semua
 * acara tanpa baris akses; akun lain sebanyak acara di daftarnya. `jumlah` null
 * selama daftar belum dimuat: lebih baik tidak menulis apa-apa daripada "0 events".
 */
export function cakupanAkses(role: string | null, jumlah: number | null) {
  if (role === "super_admin") return "All events";
  if (jumlah === null) return null;
  return `${jumlah} ${jumlah === 1 ? "event" : "events"}`;
}

export function UserMenu({
  username,
  role,
  scope,
  onLogout,
  loggingOut,
}: {
  username: string | null;
  role: string | null;
  /** Cakupan akses, mis. "1 event" atau "All events". Null selama daftar acara dimuat. */
  scope?: string | null;
  onLogout: () => void;
  loggingOut?: boolean;
}) {
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();

  const inisial = (username ?? "?").slice(0, 1).toUpperCase();
  const namaPeran = role ? ROLE_LABEL[role as UserRole] ?? role : null;
  const baris2 = [namaPeran, scope].filter(Boolean).join(" · ");

  return (
    <>
      {/* Avatar 32px saja, tanpa pil abu dan tanpa caret di sebelahnya.
          Pil itu membuat satu-satunya kontrol bundar di bilah atas jadi bidang
          abu selebar 64px — di sudut yang seharusnya paling tenang di layar. */}
      <button
        ref={setPemicu}
        type="button"
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
        aria-label={username ? `Account menu for ${username}` : "Account menu"}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body-small font-medium text-on-surface transition-colors duration-150 hover:bg-secondary-container"
      >
        {inisial}
      </button>

      {menu.open ? (
        <Popover anchor={menu} id={menuId} label="Account menu" width={264}>
          {/* Kepala menu bukan item: ia tidak bisa ditekan, jadi ia tidak boleh
              terlihat seperti yang bisa. */}
          <div className="flex items-center gap-3 px-3 pb-2.5 pt-2">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body-small font-medium text-on-surface">
              {inisial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-body-medium font-medium text-on-surface" title={username ?? undefined}>
                {username ?? "Unknown"}
              </p>
              {baris2 ? <p className="truncate text-body-small text-on-surface-variant">{baris2}</p> : null}
            </div>
          </div>

          <div className="my-1 border-t border-outline-variant" />

          <div className="flex h-10 items-center justify-between gap-3 pl-3 pr-1 text-body-medium text-on-surface">
            <span aria-hidden>Theme</span>
            <ThemeToggle menu />
          </div>

          <div className="my-1 border-t border-outline-variant" />

          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            disabled={loggingOut}
            className={cx(POPOVER_ITEM, "disabled:opacity-50")}
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </Popover>
      ) : null}
    </>
  );
}
