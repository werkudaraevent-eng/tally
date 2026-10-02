"use client";

import { useEffect, useState, type ReactNode } from "react";
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
export function PratinjauLangsung({ slug, children }: { slug: string; children: ReactNode }) {
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
        const hasil = await renderPratinjau(slug, draf, bahasa).catch(() => null);
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

    window.addEventListener("message", terima);
    document.addEventListener("click", pindahBahasa, true);
    lapor({ jenis: "tally-pratinjau-siap" });
    return () => {
      window.removeEventListener("message", terima);
      document.removeEventListener("click", pindahBahasa, true);
      window.clearTimeout(timer);
    };
  }, [slug]);

  return <>{isi}</>;
}
