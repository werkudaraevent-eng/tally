"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowSquareOut, Bell, PushPin, X } from "@phosphor-icons/react";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

/**
 * Lonceng pengumuman di bilah atas halaman acara, untuk peserta yang sudah masuk.
 *
 * Tombol ikon 44px dengan lencana jumlah belum dibaca (M3 Badge, warna error)
 * yang membuka panel di bawahnya. Panelnya non-modal: halaman di belakang tetap
 * bisa digulir, Esc atau ketukan di luar menutupnya, dan fokus kembali ke
 * lonceng saat ditutup dengan Esc.
 *
 * Membuka panel = semua pengumuman dianggap terbaca (POST /api/peserta/pengumuman),
 * seperti pusat notifikasi Swapcard dan Whova: angka di lonceng hilang. Titik
 * "baru" di panel yang sedang terbuka tetap, supaya peserta masih tahu mana
 * yang baru saja masuk.
 *
 * Di ponsel panelnya selebar layar tepat di bawah bilah; di layar lebar 400px,
 * rata kanan dengan tombol Dashboard saya.
 */

export type LoncengItem = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  pinned: boolean;
  /** Waktu terbit, sudah diformat server dalam zona waktu acara. */
  waktu: string;
  baru: boolean;
};

export function LoncengPengumuman({
  slug,
  lang,
  items,
  unread,
  dashboardHref,
  buka,
  onBukaChange,
}: {
  slug: string;
  lang: LandingLang;
  items: LoncengItem[];
  unread: number;
  /** Tautan "Lihat semua"; null di Dashboard saya sendiri. */
  dashboardHref: string | null;
  /** Dikendalikan bilah atas, supaya panel ini dan menu tidak terbuka bersamaan. */
  buka: boolean;
  onBukaChange: (buka: boolean) => void;
}) {
  const t = LANDING_UI[lang];
  const setBuka = onBukaChange;
  const [belum, setBelum] = useState(unread);
  const tandai = useRef(false);
  const akarRef = useRef<HTMLDivElement>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const judulId = useId();

  useEffect(() => {
    if (!buka) return;
    panelRef.current?.focus();
    if (!tandai.current && belum > 0) {
      tandai.current = true;
      setBelum(0);
      fetch(`/e/${encodeURIComponent(slug)}/api/peserta/pengumuman`, { method: "POST" }).catch(() => null);
    }
    // Ponsel: panel menutupi halaman di atas lapisan gelap, jadi ia modal; Tab
    // berputar di dalam panel. Layar lebar: panel melayang seperti menu, dan
    // tertutup begitu fokus keluar darinya (lonceng sendiri masih di dalam).
    const ponsel = window.matchMedia("(max-width: 639.98px)").matches;
    const panel = panelRef.current;
    if (ponsel) panel?.setAttribute("aria-modal", "true");
    else panel?.removeAttribute("aria-modal");
    const tekan = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBuka(false);
        tombolRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !ponsel || !panel) return;
      const fokus = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (fokus.length === 0) return;
      const pertama = fokus[0];
      const terakhir = fokus[fokus.length - 1];
      const aktif = document.activeElement;
      if (event.shiftKey && (aktif === pertama || aktif === panel || !panel.contains(aktif))) {
        event.preventDefault();
        terakhir.focus();
      } else if (!event.shiftKey && (aktif === terakhir || !panel.contains(aktif))) {
        event.preventDefault();
        pertama.focus();
      }
    };
    const ketuk = (event: PointerEvent) => {
      if (!akarRef.current?.contains(event.target as Node)) setBuka(false);
    };
    const keluar = (event: FocusEvent) => {
      const ke = event.relatedTarget as Node | null;
      if (!ponsel && ke && !akarRef.current?.contains(ke)) setBuka(false);
    };
    const akar = akarRef.current;
    document.addEventListener("keydown", tekan);
    document.addEventListener("pointerdown", ketuk);
    akar?.addEventListener("focusout", keluar);
    return () => {
      document.removeEventListener("keydown", tekan);
      document.removeEventListener("pointerdown", ketuk);
      akar?.removeEventListener("focusout", keluar);
    };
  }, [buka, belum, slug, setBuka]);

  return (
    <div ref={akarRef} className="flex sm:relative">
      <button
        ref={tombolRef}
        type="button"
        aria-expanded={buka}
        aria-controls={panelId}
        aria-label={t.announcementsButton(belum)}
        onClick={() => setBuka(!buka)}
        className={`m3-state relative inline-flex size-11 items-center justify-center rounded-md ${
          buka ? "bg-[color-mix(in_srgb,var(--nav-text)_10%,transparent)]" : ""
        }`}
      >
        <Bell size={22} aria-hidden />
        {belum > 0 ? (
          // Lencana besar M3: tinggi 16dp, minimal selebar tingginya, di pojok
          // kanan atas ikon. Cincin selaras latar bilah supaya tidak menyatu
          // dengan garis ikon.
          <span
            aria-hidden
            className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#b41340] px-1 text-[11px] font-semibold leading-none text-white tabular-nums ring-2 ring-[var(--nav-fill)]"
          >
            {belum > 9 ? "9+" : belum}
          </span>
        ) : null}
      </button>

      {buka ? (
        // Ponsel: lapisan gelap 32% di bawah bilah, seperti lembar M3; ketukan
        // di atasnya menutup panel (lihat `ketuk`).
        // Tingginya eksplisit: blur latar bilah membuat `fixed` diukur dari bilah,
        // bukan dari layar, jadi `bottom-0` membuat lapisannya setinggi nol.
        <div aria-hidden onClick={() => setBuka(false)} className="fixed inset-x-0 top-[var(--nav-h)] z-30 h-dvh bg-black/30 sm:hidden" />
      ) : null}
      {buka ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={judulId}
          tabIndex={-1}
          className="fixed inset-x-0 top-[var(--nav-h)] z-40 flex max-h-[calc(100dvh-var(--nav-h)-16px)] flex-col overflow-hidden rounded-b-lg bg-white text-[#181d27] shadow-[0_12px_32px_rgb(0_0_0/0.18),0_2px_6px_rgb(0_0_0/0.08)] outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[400px] sm:max-h-[min(560px,calc(100dvh-var(--nav-h)-24px))] sm:rounded-lg"
          style={{ "--m3-state-color": "#181d27" } as React.CSSProperties}
        >
          <div className="flex items-center justify-between gap-3 py-2 pl-5 pr-2 sm:pr-5 sm:pt-4 sm:pb-3">
            <h2 id={judulId} className="text-[16px] font-semibold leading-6 [font-family:var(--landing-heading)]">
              {t.announcements}
            </h2>
            <button
              type="button"
              onClick={() => {
                setBuka(false);
                tombolRef.current?.focus();
              }}
              aria-label={t.closeMenu}
              className="m3-state inline-flex size-11 items-center justify-center rounded-md sm:hidden"
            >
              <X size={20} aria-hidden />
            </button>
          </div>
          {items.length === 0 ? (
            <p className="border-t border-[#e9eaeb] px-5 py-6 text-[15px] leading-[22px] text-[#414651]">{t.noAnnouncements}</p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {items.map((item) => (
                <li key={item.id} className="grid grid-cols-[8px_minmax(0,1fr)] gap-3 border-t border-[#e9eaeb] px-5 py-3.5">
                  <span
                    aria-hidden
                    className={`mt-[7px] size-2 rounded-full ${item.baru ? "bg-[#b41340]" : ""}`}
                  />
                  <div className="min-w-0">
                    {item.pinned ? (
                      <p className="mb-0.5 inline-flex items-center gap-1 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-[var(--reg-primary)]">
                        <PushPin size={13} weight="fill" aria-hidden />
                        {t.pinned}
                      </p>
                    ) : null}
                    <p className="text-[15px] font-semibold leading-[22px]">
                      {item.baru ? <span className="sr-only">{t.newAnnouncement}: </span> : null}
                      {item.title}
                    </p>
                    {item.body ? (
                      <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[14px] leading-5 text-[#414651]">{item.body}</p>
                    ) : null}
                    {item.link_url ? (
                      <a
                        href={item.link_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-flex min-h-9 items-center gap-1 text-[14px] font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline"
                      >
                        {item.link_label?.trim() || item.link_url}
                        <ArrowSquareOut size={14} aria-hidden />
                      </a>
                    ) : null}
                    <p className="mt-1 text-[13px] leading-[18px] text-[#535862]">{item.waktu}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {dashboardHref ? (
            <div className="border-t border-[#e9eaeb] px-5 pb-4 pt-3">
              <Link
                href={dashboardHref}
                className="m3-state flex min-h-11 items-center justify-center rounded-md border border-[#a4a7ae] text-[14px] font-semibold"
              >
                {t.viewAllInDashboard}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
