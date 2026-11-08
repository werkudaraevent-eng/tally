"use client";

import { DownloadSimple, Printer } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/m3";
import { pdfDariJpeg, ukuranJpeg } from "@/lib/laporan/pdf";

/** `sibuk` memakai {n} dan {total}, mis. "Making PDF {n}/{total}". */
type Teks = { unduh: string; sibuk: string; cetak: string; gagal: string };

/**
 * Di gambar html-to-image, SVG kehilangan warna dari CSS: atribut
 * `fill="var(--lp-trek)"` jadi hitam, dan teks grafik (`.lp-svg text`, warna
 * dan tebal dari gaya.ts) jadi hitam biasa. Tulis sementara nilai yang sudah
 * dihitung peramban langsung di elemennya; kembalikan setelah gambar jadi.
 */
function bekukanWarnaSvg(akar: HTMLElement): () => void {
  const kembali: Array<() => void> = [];
  for (const el of akar.querySelectorAll<SVGElement>("svg *")) {
    for (const atr of ["fill", "stroke"] as const) {
      const lama = el.getAttribute(atr);
      if (!lama?.includes("var(")) continue;
      el.setAttribute(atr, getComputedStyle(el)[atr]);
      kembali.push(() => el.setAttribute(atr, lama));
    }
  }
  for (const el of akar.querySelectorAll<SVGTextElement>("svg text, svg tspan")) {
    const lama = el.getAttribute("style");
    const g = getComputedStyle(el);
    el.style.setProperty("fill", g.fill);
    el.style.setProperty("font-weight", g.fontWeight);
    el.style.setProperty("font-size", g.fontSize);
    el.style.setProperty("font-family", g.fontFamily);
    kembali.push(() => (lama === null ? el.removeAttribute("style") : el.setAttribute("style", lama)));
  }
  return () => kembali.reverse().forEach((f) => f());
}

const dataUrlKeByte = (u: string) => Uint8Array.from(atob(u.slice(u.indexOf(",") + 1)), (c) => c.charCodeAt(0));

/**
 * Download PDF: tiap slide digambar ke JPEG 2560×1440 lalu dirangkai jadi PDF
 * 16:9 di peramban, jadi hasilnya penuh satu halaman di perangkat apa pun.
 * Dialog cetak (Print) tetap ada untuk komputer: Chrome Android mengabaikan
 * `@page size` dan memakai kertas Letter tegak.
 */
export function TombolCetak({ teks, nama }: { teks: Teks; nama: string }) {
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState(false);
  const label = (n: number, total: number) => teks.sibuk.replace("{n}", String(n)).replace("{total}", String(total));

  async function unduh() {
    const slide = [...document.querySelectorAll<HTMLElement>(".lp-bingkai .lp-stage")];
    if (!slide.length) return;
    setGalat(false);
    setSibuk(label(0, slide.length));
    try {
      const { toJpeg } = await import("html-to-image");
      await document.fonts.ready;
      const halaman = [];
      for (const [i, el] of slide.entries()) {
        setSibuk(label(i + 1, slide.length));
        const pulihkan = bekukanWarnaSvg(el);
        const jpeg = dataUrlKeByte(await toJpeg(el, { width: 1280, height: 720, pixelRatio: 2, quality: 0.92 }).finally(pulihkan));
        const u = ukuranJpeg(jpeg);
        if (!u) throw new Error("not a jpeg");
        halaman.push({ jpeg, lebarPx: u.lebar, tinggiPx: u.tinggi });
      }
      // 1280×720 px pada 96 dpi = 960×540 pt.
      const pdf = pdfDariJpeg(halaman, { lebar: 960, tinggi: 540 });
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nama}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setGalat(true);
    } finally {
      setSibuk(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {galat ? <span role="alert" className="text-body-medium text-error">{teks.gagal}</span> : null}
      <Button variant="text" icon={<Printer size={18} aria-hidden />} disabled={!!sibuk} onClick={() => window.print()}>{teks.cetak}</Button>
      <Button icon={<DownloadSimple size={18} aria-hidden />} loading={!!sibuk} onClick={() => void unduh()}>{sibuk ?? teks.unduh}</Button>
    </div>
  );
}
