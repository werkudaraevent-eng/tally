"use client";

import { useEffect, useState, type ReactNode } from "react";
import { renderPratinjauPeserta } from "./actions";

/** Jeda setelah perubahan terakhir sebelum draf dirender ulang. */
const JEDA_MS = 300;

/** Elemen pertama yang benar-benar tampil di dalam penanda `data-beranda` (display: contents). */
function kotakTampil(id: string): HTMLElement | null {
  for (const penanda of document.querySelectorAll<HTMLElement>(`[data-beranda="${CSS.escape(id)}"]`)) {
    for (const anak of penanda.querySelectorAll<HTMLElement>("*")) {
      const kotak = anak.getBoundingClientRect();
      if (kotak.width > 0 && kotak.height > 0) return anak;
    }
  }
  return null;
}

/**
 * Isi iframe pratinjau di Participant area. Mulai dari setelan tersimpan
 * (dirender server), lalu menerima draf dan perintah gulir dari layar admin
 * lewat postMessage, hanya dari jendela induk dengan asal yang sama.
 *
 * Tautan tidak berpindah halaman: halaman di baliknya tidak memuat draf, dan
 * tanpa sesi peserta semuanya berakhir di dialog Masuk.
 */
export function PratinjauBeranda({ slug, pesertaId, children }: { slug: string; pesertaId: string; children: ReactNode }) {
  const [isi, setIsi] = useState<ReactNode>(children);

  useEffect(() => {
    let timer: number | undefined;
    let urutan = 0;
    let sorotan: HTMLElement | null = null;
    let timerGulir: number | undefined;
    const lapor = (pesan: object) => window.parent.postMessage(pesan, window.location.origin);

    // `coba`: isi hasil render server bisa baru tampil beberapa saat setelah
    // setIsi (mis. pindah ke tab Profil), jadi penanda dicari ulang sebentar.
    function gulir(id: string, coba = 0) {
      const kotak = kotakTampil(id);
      if (!kotak && coba > 0) { timerGulir = window.setTimeout(() => gulir(id, coba - 1), 100); return; }
      if (!kotak) { lapor({ jenis: "tally-beranda-gulir", ada: false, id }); return; }
      sorotan?.style.removeProperty("outline");
      sorotan?.style.removeProperty("outline-offset");
      kotak.scrollIntoView({ block: "center", behavior: "smooth" });
      kotak.style.outline = "3px solid #1D4ED8";
      kotak.style.outlineOffset = "4px";
      sorotan = kotak;
      lapor({ jenis: "tally-beranda-gulir", ada: true, id });
    }

    function terima(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.jenis === "tally-beranda-sorot" && typeof event.data.id === "string") { window.clearTimeout(timerGulir); gulir(event.data.id); return; }
      if (event.data?.jenis !== "tally-beranda-draf") return;
      const draf = event.data.member;
      const sorot = typeof event.data.sorot === "string" ? event.data.sorot : null;
      const tab = event.data.tab === "profil" ? "profil" : "beranda";
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const nomor = ++urutan;
        const hasil = await renderPratinjauPeserta(slug, pesertaId, draf, tab).catch(() => null);
        if (nomor !== urutan) return;
        if (hasil?.ok) {
          setIsi(hasil.isi);
          if (sorot) { window.clearTimeout(timerGulir); window.requestAnimationFrame(() => window.requestAnimationFrame(() => gulir(sorot, 10))); }
        }
        lapor({ jenis: "tally-beranda-hasil", ok: Boolean(hasil?.ok), pesan: !hasil ? "The preview couldn't load. Try again." : hasil.ok ? null : hasil.pesan });
      }, JEDA_MS);
    }

    function klik(event: Event) {
      const sasaran = event.type === "submit" || (event.target as Element | null)?.closest?.("a, button[type=submit]");
      if (!sasaran) return;
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("message", terima);
    window.addEventListener("click", klik, true);
    window.addEventListener("submit", klik, true);
    lapor({ jenis: "tally-beranda-siap" });
    return () => {
      window.removeEventListener("message", terima);
      window.removeEventListener("click", klik, true);
      window.removeEventListener("submit", klik, true);
      window.clearTimeout(timer);
      window.clearTimeout(timerGulir);
    };
  }, [slug, pesertaId]);

  return <>{isi}</>;
}
