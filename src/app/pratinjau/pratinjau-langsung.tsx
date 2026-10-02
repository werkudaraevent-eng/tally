"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LandingForumPage } from "@/lib/domain";
import { renderPratinjau } from "./actions";

/** Jeda setelah ketikan terakhir sebelum draf dirender ulang. */
const JEDA_MS = 350;

/**
 * Isi iframe pratinjau di CMS Halaman acara.
 *
 * Mulai dari versi tersimpan (dirender server), lalu menerima draf dari CMS
 * lewat postMessage. Hanya pesan dari jendela induk dengan asal yang sama yang
 * diterima: halaman ini butuh login admin, dan draf tidak pernah datang dari URL.
 */
export function PratinjauLangsung({ slug, halaman, children }: { slug: string; halaman: LandingForumPage; children: ReactNode }) {
  const [isi, setIsi] = useState<ReactNode>(children);

  useEffect(() => {
    let timer: number | undefined;
    let urutan = 0;
    const lapor = (pesan: object) => window.parent.postMessage(pesan, window.location.origin);

    function terima(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.jenis !== "tally-pratinjau-draf") return;
      const draf = event.data.draf;
      const bahasa = event.data.bahasa === "en" ? "en" : "id";
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const nomor = ++urutan;
        const hasil = await renderPratinjau(slug, draf, bahasa, halaman).catch(() => null);
        // Draf yang lebih baru sudah dikirim: hasil ini sudah basi.
        if (nomor !== urutan) return;
        if (hasil?.ok) setIsi(hasil.isi);
        const pesan = !hasil ? "Pratinjau gagal dimuat. Coba lagi." : hasil.ok ? hasil.peringatan : hasil.pesan;
        lapor({ jenis: "tally-pratinjau-hasil", ok: Boolean(hasil?.ok), pesan });
      }, JEDA_MS);
    }

    // Pilihan ID | EN di bilah atas pratinjau tidak membuka halaman publik:
    // ia memindah mode bahasa editor, dan pratinjau ikut.
    function pindahBahasa(event: MouseEvent) {
      const tautan = (event.target as Element | null)?.closest?.("a[hreflang]");
      if (!tautan) return;
      event.preventDefault();
      event.stopPropagation();
      lapor({ jenis: "tally-pratinjau-bahasa", bahasa: tautan.getAttribute("hreflang") === "en" ? "en" : "id" });
    }

    // Tautan selain ID | EN tidak berpindah halaman sendiri. Tautan antarhalaman
    // Forum (`data-halaman`) diteruskan ke CMS, yang memuat ulang bingkai pada
    // halaman itu dan mengirim drafnya lagi. Tautan lain (Daftar, Masuk, peta)
    // diabaikan: pratinjau bukan tempat mendaftar, dan halaman di baliknya
    // tidak memuat draf.
    function klik(event: MouseEvent) {
      const tautan = (event.target as Element | null)?.closest?.("a");
      if (!tautan) return;
      const href = tautan.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      event.preventDefault();
      const tujuan = tautan.getAttribute("data-halaman");
      if (tujuan) lapor({ jenis: "tally-pratinjau-halaman", halaman: tujuan, jangkar: href.split("#")[1] ?? null });
    }

    window.addEventListener("message", terima);
    document.addEventListener("click", pindahBahasa, true);
    document.addEventListener("click", klik);
    lapor({ jenis: "tally-pratinjau-siap", halaman });
    return () => {
      window.removeEventListener("message", terima);
      document.removeEventListener("click", pindahBahasa, true);
      document.removeEventListener("click", klik);
      window.clearTimeout(timer);
    };
  }, [slug, halaman]);

  return <>{isi}</>;
}
