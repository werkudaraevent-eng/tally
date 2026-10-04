"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RegistrationFormConfig } from "@/lib/domain";

/**
 * Pratinjau formulir pendaftaran di Atur formulir.
 *
 * Memuat formulir publik yang SUNGGUHAN (`/e/<slug>/daftar/pratinjau`) di
 * iframe, bukan tiruannya: tema, logo, gambar utama, dan huruf ikut persis
 * seperti yang dilihat pendaftar, karena dirender komponen yang sama. Susunan
 * yang belum disimpan dikirim lewat postMessage dan dirender ulang di server.
 *
 * Iframe dirender selebar laptop (1280) lalu DIPERKECIL dengan transform,
 * alasan yang sama dengan pratinjau halaman acara: menyempitkan iframe-nya
 * sendiri memicu tata letak ponsel di panel yang sempit.
 */
const LEBAR = 1280;

export function FormPreview({ slug, form }: { slug: string; form: RegistrationFormConfig }) {
  const wadah = useRef<HTMLDivElement | null>(null);
  const bingkai = useRef<HTMLIFrameElement | null>(null);
  const [ukuran, setUkuran] = useState({ lebar: 0, tinggi: 0 });
  const [tertinggal, setTertinggal] = useState<string | null>(null);

  const kirim = useCallback(() => {
    bingkai.current?.contentWindow?.postMessage({ jenis: "tally-pratinjau-formulir", form }, window.location.origin);
  }, [form]);

  useEffect(() => { kirim(); }, [kirim]);

  useEffect(() => {
    function terima(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== bingkai.current?.contentWindow) return;
      if (event.data?.jenis === "tally-pratinjau-siap") kirim();
      if (event.data?.jenis === "tally-pratinjau-hasil") setTertinggal(event.data.ok ? null : String(event.data.pesan ?? "The preview hasn't updated yet."));
    }
    window.addEventListener("message", terima);
    return () => window.removeEventListener("message", terima);
  }, [kirim]);

  useEffect(() => {
    const element = wadah.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setUkuran({ lebar: entry.contentRect.width, tinggi: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const skala = ukuran.lebar > 0 ? Math.min(1, ukuran.lebar / LEBAR) : 0.35;
  const tinggi = ukuran.tinggi > 0 ? ukuran.tinggi / skala : 1600;

  return (
    <>
      <p
        role="status"
        className={`shrink-0 border-b border-outline-variant px-4 py-2.5 ${tertinggal ? "text-body-small text-error" : "text-body-medium text-on-surface-variant"}`}
      >
        {tertinggal ?? "Preview · as registrants see it"}
      </p>
      <div ref={wadah} className="min-h-[480px] flex-1 overflow-hidden bg-surface-container-lowest lg:min-h-0">
        <iframe
          ref={bingkai}
          src={`/e/${slug}/daftar/pratinjau`}
          title="Registration form preview"
          sandbox="allow-scripts allow-same-origin"
          style={{ width: LEBAR, height: tinggi, border: 0, transform: `scale(${skala})`, transformOrigin: "top left" }}
        />
      </div>
    </>
  );
}
