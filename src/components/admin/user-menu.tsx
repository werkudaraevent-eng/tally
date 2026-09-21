"use client";

import { CaretRight, Check } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { Popover, POPOVER_ITEM, POPOVER_ITEM_DANGER, usePopoverAnchor } from "@/components/m3";
import { applyTheme, readTheme, type ThemePreference } from "@/lib/m3/theme";
import { ROLE_LABEL, type UserRole } from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

/**
 * Menu akun di ujung kanan bilah atas.
 *
 * Menampung hal-hal yang BUKAN tujuan navigasi: siapa yang sedang login, tema,
 * pengaturan, dan keluar. Sebelumnya ketiganya tinggal di kaki drawer dan
 * memakan ~170px dari ruang yang sama dengan daftar menu.
 *
 * Nama akun yang sedang login sebelumnya TIDAK ADA di mana pun di layar admin.
 * Di sistem yang dipakai bergantian oleh panitia dari satu laptop di meja
 * registrasi, itu masalah nyata: tidak ada cara memastikan tindakan yang tercatat
 * di audit trail akan atas nama siapa.
 *
 * ---- Kenapa tanpa ikon di itemnya -----------------------------------------
 *
 * Menu ini berisi empat baris, dan keempatnya sudah dibedakan oleh kata. Ikon
 * roda gigi di sebelah "Pengaturan akun" tidak menambah satu pun informasi;
 * yang ia tambahkan adalah kolom 24px di kiri yang memundurkan semua teks, dan
 * satu bentuk lagi untuk dipindai mata sebelum sampai ke katanya.
 */

const TEMA: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
  { value: "system", label: "Ikut sistem" },
];

/**
 * Sumber kebenaran tema adalah atribut `data-theme` di `<html>`, bukan state.
 *
 * Atribut itu sudah ditulis skrip di `<head>` sebelum React jalan, dan CSS
 * membacanya langsung. Menyalinnya ke `useState` berarti ada dua sumber yang
 * bisa berbeda.
 */
function subscribeTema(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Submenu tema. Popover kedua, berlabuh pada barisnya sendiri. */
function SubmenuTampilan({ tutupInduk }: { tutupInduk: () => void }) {
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const sub = usePopoverAnchor(pemicu);
  const subId = useId();
  const tema = useSyncExternalStore(subscribeTema, readTheme, () => "system" as ThemePreference);

  return (
    <>
      <button
        ref={setPemicu}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={sub.open}
        aria-controls={sub.open ? subId : undefined}
        onClick={sub.toggle}
        // Panah kanan membuka submenu, sesuai pola menu di mana pun. Panah kiri
        // menutupnya kembali tanpa memindahkan fokus keluar dari menu induk.
        onKeyDown={(peristiwa) => {
          if (peristiwa.key === "ArrowRight") { peristiwa.preventDefault(); sub.buka(); }
          if (peristiwa.key === "ArrowLeft") { peristiwa.preventDefault(); sub.tutup(); }
        }}
        className={cx(POPOVER_ITEM, sub.open && "bg-primary-soft")}
      >
        <span className="flex-1">Tampilan</span>
        <CaretRight size={14} className="shrink-0 text-on-surface-variant" />
      </button>

      {sub.open ? (
        // `align="start"` dan lebarnya sendiri: panel ini berlabuh pada BARIS,
        // bukan pada tombol di bilah atas, jadi ia tumbuh ke bawah dari baris itu.
        // Penjepitan ke dalam jendela ditangani `Popover`, termasuk saat ruang di
        // kanan habis.
        <Popover anchor={sub} id={subId} label="Pilih tema" width={180} align="start">
          {TEMA.map((pilihan) => (
            <button
              key={pilihan.value}
              type="button"
              role="menuitemradio"
              aria-checked={tema === pilihan.value}
              onClick={() => { applyTheme(pilihan.value); sub.tutup(); tutupInduk(); }}
              className={POPOVER_ITEM}
            >
              <span className="flex-1">{pilihan.label}</span>
              {tema === pilihan.value ? <Check size={14} weight="bold" className="shrink-0" /> : null}
            </button>
          ))}
        </Popover>
      ) : null}
    </>
  );
}

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
  loggingOut?: boolean;
}) {
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();

  const inisial = (username ?? "?").slice(0, 1).toUpperCase();

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
        aria-label={username ? `Menu akun ${username}` : "Menu akun"}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body-small font-medium text-on-surface transition-colors duration-150 hover:bg-secondary-container"
      >
        {inisial}
      </button>

      {menu.open ? (
        <Popover anchor={menu} id={menuId} label="Menu akun" width={240}>
          {/* Kepala menu bukan item: ia tidak bisa ditekan, jadi ia tidak boleh
              terlihat seperti yang bisa. Nama akun 13px abu, bukan judul tebal —
              yang dicari orang di menu ini adalah aksinya, dan nama hanya
              memastikan ia sedang bertindak atas nama siapa. */}
          <div className="px-3 py-2">
            <p className="truncate text-body-small text-on-surface-variant" title={username ?? undefined}>
              {username ?? "Tidak diketahui"}
            </p>
            {role ? (
              <p className="mt-0.5 truncate text-label-medium text-on-surface-variant">{ROLE_LABEL[role as UserRole] ?? role}</p>
            ) : null}
          </div>

          <div className="my-1 border-t border-outline-variant" />

          <Link href={settingsHref} role="menuitem" onClick={menu.tutup} className={POPOVER_ITEM}>
            Pengaturan akun
          </Link>

          <SubmenuTampilan tutupInduk={menu.tutup} />

          <div className="my-1 border-t border-outline-variant" />

          {/* Merah, dan hanya di sini. Keluar adalah satu-satunya aksi di menu ini
              yang membuang pekerjaan yang sedang berjalan. */}
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            disabled={loggingOut}
            className={cx(POPOVER_ITEM_DANGER, "disabled:opacity-50")}
          >
            {loggingOut ? "Keluar…" : "Keluar"}
          </button>
        </Popover>
      ) : null}
    </>
  );
}
