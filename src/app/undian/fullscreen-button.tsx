"use client";

import { ArrowsIn, ArrowsOut } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

/**
 * Tombol layar penuh di layar panggung (Mas 6 Nov, KSO: di Mac, tombol hijau
 * Chrome tetap menyisakan bilah alamat dan tab).
 *
 * Tombol hijau macOS memakai layar penuh JENDELA, yang di Chrome Mac tetap
 * menampilkan toolbar kecuali "Always Show Toolbar in Full Screen" dimatikan.
 * Fullscreen API (`requestFullscreen`) adalah layar penuh ELEMEN: tanpa
 * toolbar di semua peramban, Esc untuk keluar.
 *
 * Muncul saat mouse bergerak, hilang sendiri setelah 2,5 detik, jadi tidak
 * pernah ikut tampil di depan penonton selama tidak ada yang menyentuh laptop.
 * Di layar besar panggung ada di dalam iframe (StageScaler): yang dibuat
 * layar penuh adalah halaman induk, supaya skalanya tetap.
 */
const HIDE_AFTER_MS = 2500;

function rootDocument() {
  try {
    return window.parent !== window ? window.parent.document : document;
  } catch {
    return document;
  }
}

export function FullscreenButton() {
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = rootDocument();
    let timer = 0;
    const show = () => {
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    };
    const sync = () => setActive(Boolean(root.fullscreenElement));
    window.addEventListener("mousemove", show);
    window.addEventListener("touchstart", show);
    root.addEventListener("fullscreenchange", sync);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
      root.removeEventListener("fullscreenchange", sync);
    };
  }, []);

  const toggle = () => {
    const root = rootDocument();
    if (root.fullscreenElement) void root.exitFullscreen?.().catch(() => {});
    else void root.documentElement.requestFullscreen?.().catch(() => {});
  };

  return <button
    type="button"
    onClick={toggle}
    aria-label={active ? "Keluar dari layar penuh" : "Layar penuh"}
    className="fixed bottom-4 right-4 z-50 inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-[16px] font-medium transition-opacity duration-300 focus-visible:opacity-100"
    style={{
      background: "rgba(0, 0, 0, 0.72)",
      color: "#FFFFFF",
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? "auto" : "none",
    }}
  >
    {active ? <ArrowsIn size={20} aria-hidden /> : <ArrowsOut size={20} aria-hidden />}
    {active ? "Keluar (Esc)" : "Layar penuh"}
  </button>;
}
