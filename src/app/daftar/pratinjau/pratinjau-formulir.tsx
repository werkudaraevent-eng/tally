"use client";

import { useEffect, useState, type ReactNode } from "react";
import { renderPratinjauFormulir } from "./actions";

/** Jeda setelah ketikan terakhir sebelum draf dirender ulang. */
const JEDA_MS = 350;

/**
 * Isi iframe pratinjau formulir. Mulai dari versi tersimpan (dirender server),
 * lalu menerima draf dari CMS lewat postMessage: `{ jenis:
 * "tally-pratinjau-formulir", form?, landing? }`. Hanya pesan dari jendela
 * induk dengan asal yang sama yang diterima.
 *
 * Formulir di sini tidak bisa dikirim dan tautannya tidak berpindah halaman:
 * pratinjau bukan tempat mendaftar, dan pendaftaran sungguhan di dalamnya akan
 * masuk ke data acara yang sedang tayang.
 */
export function PratinjauFormulir({ slug, children }: { slug: string; children: ReactNode }) {
  const [isi, setIsi] = useState<ReactNode>(children);

  useEffect(() => {
    let timer: number | undefined;
    let urutan = 0;
    const lapor = (pesan: object) => window.parent.postMessage(pesan, window.location.origin);

    function terima(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.jenis !== "tally-pratinjau-formulir") return;
      const draf = { form: event.data.form, landing: event.data.landing };
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const nomor = ++urutan;
        const hasil = await renderPratinjauFormulir(slug, draf).catch(() => null);
        if (nomor !== urutan) return;
        if (hasil?.ok) setIsi(hasil.isi);
        lapor({ jenis: "tally-pratinjau-hasil", ok: Boolean(hasil?.ok), pesan: !hasil ? "Pratinjau gagal dimuat. Coba lagi." : hasil.ok ? null : hasil.pesan });
      }, JEDA_MS);
    }

    // Fase tangkap di document: berjalan sebelum React menerima kiriman
    // formulir maupun klik tautan, jadi tidak ada yang sampai ke server.
    function tahanKirim(event: SubmitEvent) {
      event.preventDefault();
      event.stopPropagation();
    }
    function tahanTautan(event: MouseEvent) {
      const tautan = (event.target as Element | null)?.closest?.("a");
      if (!tautan || (tautan.getAttribute("href") ?? "").startsWith("#")) return;
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("message", terima);
    document.addEventListener("submit", tahanKirim, true);
    document.addEventListener("click", tahanTautan, true);
    lapor({ jenis: "tally-pratinjau-siap" });
    return () => {
      window.removeEventListener("message", terima);
      document.removeEventListener("submit", tahanKirim, true);
      document.removeEventListener("click", tahanTautan, true);
      window.clearTimeout(timer);
    };
  }, [slug]);

  // `inert`: Tab dari CMS tidak masuk ke kolom-kolom pratinjau yang diperkecil
  // (cincin fokusnya tinggal sepertiga). Gulir dengan roda tetap berjalan.
  return <div inert>{isi}</div>;
}
