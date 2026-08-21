"use client";

import { CaretDown, Check, ListDashes } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Pemilih event di bilah atas.
 *
 * Sebelumnya ini tautan berbentuk pil yang bercaret — bentuknya menjanjikan
 * menu, isinya melempar ke halaman pemilih event. Caret yang tidak membuka apa
 * pun adalah janji yang dilanggar pada ketukan pertama, dan setelah itu tidak
 * ada yang percaya caret di layar ini.
 *
 * Sekarang ia benar-benar menu: daftar event yang boleh dibuka pengguna,
 * langsung pindah tanpa mampir ke halaman perantara. "Semua event" tetap ada di
 * kaki menu untuk yang memang mau melihat halaman pemilihnya (arsip, buat baru).
 *
 * Bentuknya tombol teks, bukan pil berlatar. Nama event adalah bagian dari
 * remah roti `event / halaman`; memberinya bidang berwarna sendiri membuatnya
 * terbaca sebagai tombol aksi yang bersaing dengan judul halaman di sebelahnya.
 */

export type EventPilihan = { slug: string; name: string; status: string };

export function EventMenu({ events, activeSlug }: { events: EventPilihan[]; activeSlug: string | null }) {
  const [open, setOpen] = useState(false);
  const wadah = useRef<HTMLDivElement | null>(null);
  const tombol = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
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

  const aktif = events.find((event) => event.slug === activeSlug);
  const label = aktif?.name ?? "Semua event";

  return (
    <div ref={wadah} className="relative min-w-0">
      <button
        ref={tombol}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="m3-state -mx-2 flex min-h-10 min-w-0 items-center gap-1.5 rounded-lg px-2 text-title-medium font-semibold text-on-surface-variant"
      >
        <span className="max-w-[22ch] truncate">{label}</span>
        <CaretDown size={14} weight="bold" className="shrink-0" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Pilih event"
          className="absolute left-0 top-[calc(100%+8px)] z-50 max-h-[70vh] w-72 overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-high p-2 shadow-level2"
        >
          {events.length === 0 ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">Tidak ada event yang bisa dibuka.</p>
          ) : (
            events.map((event) => {
              const terpilih = event.slug === activeSlug;
              return (
                <Link
                  key={event.slug}
                  // Ke halaman yang SAMA di event lain, bukan ke dashboard-nya.
                  // Admin yang sedang membandingkan rundown dua event ingin
                  // mendarat di rundown, bukan mengulang navigasi dari awal.
                  href={`/e/${event.slug}${pathname.replace(/^\/e\/[^/]+/, "") || "/admin"}`}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="m3-state flex min-h-11 items-center gap-2 rounded-xl px-3 text-label-large font-semibold"
                >
                  <span className="min-w-0 flex-1 truncate">{event.name}</span>
                  {event.status !== "active" ? (
                    <span className="shrink-0 text-body-small font-normal text-on-surface-variant">{event.status}</span>
                  ) : null}
                  {terpilih ? <Check size={16} weight="bold" className="shrink-0" /> : null}
                </Link>
              );
            })
          )}

          <div className="my-2 border-t border-outline-variant" />

          <Link
            href="/events"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="m3-state flex min-h-11 items-center gap-3 rounded-xl px-3 text-label-large font-semibold text-on-surface-variant"
          >
            <ListDashes size={18} />
            Semua event
          </Link>
        </div>
      ) : null}
    </div>
  );
}
