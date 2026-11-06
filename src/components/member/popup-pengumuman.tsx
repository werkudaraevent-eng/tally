"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowSquareOut, Megaphone } from "@phosphor-icons/react";
import { FotoPengumuman } from "@/components/member/foto-pengumuman";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Pengumuman "Show as pop-up" (Messages > Announcements, migrasi 202611060002).
 *
 * Dialog modal M3 di atas area peserta yang terbuka sendiri sekali, sampai
 * peserta menekan Tutup (atau Esc, WCAG 2.1.2: tidak boleh menjebak keyboard).
 * Ketukan di luar dialog TIDAK menutupnya: panitia memakai ini untuk kabar
 * mendesak yang harus terbaca, seperti dialog konfirmasi di aplikasi maskapai.
 *
 * Hanya pengumuman pop-up yang paling baru yang dibuka, supaya peserta tidak
 * menutup dialog berderet. Yang sudah ditutup dicatat di localStorage per
 * `kunci` (id + published_at): tidak terbuka lagi di perangkat itu, kecuali
 * panitia memakai Notify again (published_at berganti). Tanpa localStorage
 * (mode privat) dialog terbuka sekali per halaman.
 *
 * Tidak menandai pengumuman terbaca: angka di lonceng tetap urusan lonceng.
 */

export type PopupItem = {
  /** `${id}:${published_at}`. */
  kunci: string;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  foto: { src: string; alt: string } | null;
  /** Waktu terbit, sudah diformat server dalam zona waktu acara. */
  waktu: string;
};

const AWALAN = "tally:popup-tutup:";

function sudahDitutup(kunci: string) {
  try {
    return window.localStorage.getItem(AWALAN + kunci) === "1";
  } catch {
    return false;
  }
}

function catatTutup(kunci: string) {
  try {
    window.localStorage.setItem(AWALAN + kunci, "1");
  } catch {
    // Mode privat: cukup tertutup untuk halaman ini.
  }
}

export function PopupPengumuman({ items, lang }: { items: PopupItem[]; lang: LandingLang }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tutupRef = useRef<HTMLButtonElement>(null);
  const isiRef = useRef<HTMLDivElement>(null);
  const judulId = useId();
  // Garis pemisah di atas dan bawah isi hanya muncul saat isi bergulir (M3 dialog).
  const [bergulir, setBergulir] = useState(false);
  const [item, setItem] = useState<PopupItem | null>(null);
  const terbaru = items[0] ?? null;
  const en = lang === "en";

  useEffect(() => {
    // localStorage hanya ada di peramban: diputuskan setelah hidrasi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItem(terbaru && !sudahDitutup(terbaru.kunci) ? terbaru : null);
  }, [terbaru]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!item || !dialog || dialog.open) return;
    dialog.showModal();
    // Fokus ke Tutup, bukan ke foto (elemen pertama yang bisa difokus).
    // preventScroll: peramban tidak boleh menggulir dialog demi tombol ini.
    tutupRef.current?.focus({ preventScroll: true });
    const gulir = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = gulir;
    };
  }, [item]);

  useEffect(() => {
    const isi = isiRef.current;
    if (!item || !isi) return;
    // Ukur ulang saat layar berputar atau foto selesai dimuat.
    const ukur = () => setBergulir(isi.scrollHeight > isi.clientHeight + 1);
    ukur();
    const amati = new ResizeObserver(ukur);
    amati.observe(isi);
    for (const anak of Array.from(isi.children)) amati.observe(anak);
    return () => amati.disconnect();
  }, [item]);

  if (!item) return null;
  const adaIsi = Boolean(item.body || item.foto);

  function tutup() {
    if (item) catatTutup(item.kunci);
    dialogRef.current?.close();
    setItem(null);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={judulId}
      lang={en ? "en" : "id"}
      // Esc = Tutup, dicatat sama.
      onCancel={(event) => {
        event.preventDefault();
        tutup();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[560px] overflow-hidden rounded-[28px] bg-[var(--reg-surface,#fff)] p-0 text-[var(--reg-on-surface,#1b1b1f)] shadow-xl backdrop:bg-black/50"
    >
      <div className="flex max-h-[calc(100dvh-48px)] flex-col">
        {/* Judul tetap di atas, hanya isi yang bergulir, tombol tetap di bawah
            (M3 dialog). Dulu judul ikut area gulir, jadi pengumuman panjang
            menenggelamkan judulnya saat peserta menggulir. */}
        <div className={`shrink-0 px-6 pt-6 ${item.body ? "pb-3" : item.foto ? "pb-4" : ""}`}>
          <p className="flex items-center gap-2 text-[14px] font-medium leading-5 text-[var(--reg-on-surface-variant,#46464f)]">
            <Megaphone size={18} aria-hidden="true" className="shrink-0 text-[var(--reg-primary,#1a56db)]" />
            {en ? "Announcement" : "Pengumuman"} · {item.waktu}
          </p>
          <h2 id={judulId} className="mt-3 text-[22px] font-semibold leading-7">
            {item.title}
          </h2>
        </div>
        {adaIsi ? (
          <div
            ref={isiRef}
            // Area gulir tanpa tautan tetap bisa digulir dengan keyboard (WCAG 2.1.1).
            tabIndex={bergulir ? 0 : undefined}
            role={bergulir ? "region" : undefined}
            aria-label={bergulir ? (en ? "Announcement text" : "Isi pengumuman") : undefined}
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 ${bergulir ? "border-y border-[var(--reg-outline-variant,#c7c6d0)] py-4" : ""}`}
          >
            {item.body ? <p className="whitespace-pre-line text-[16px] leading-6 text-[var(--reg-on-surface-variant,#46464f)]">{item.body}</p> : null}
            {item.foto ? <FotoPengumuman src={item.foto.src} alt={item.foto.alt} lang={en ? "en" : "id"} className={item.body ? "mt-4" : ""} /> : null}
          </div>
        ) : null}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-6 pb-6 pt-4">
          {item.link_url ? (
            <a
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-[var(--reg-primary,#1a56db)] underline-offset-4 hover:underline"
            >
              {item.link_label || (en ? "Open link" : "Buka tautan")}
              <ArrowSquareOut size={16} aria-hidden="true" />
            </a>
          ) : null}
          <button
            ref={tutupRef}
            type="button"
            onClick={tutup}
            className="inline-flex min-h-12 min-w-24 items-center justify-center rounded-full bg-[var(--reg-primary,#1a56db)] px-6 text-[14px] font-semibold text-[var(--reg-on-primary,#fff)]"
          >
            {en ? "Close" : "Tutup"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
