"use client";

import { Printer } from "@phosphor-icons/react";
import { usePakaiQrCheckpoint } from "@/components/checkpoint/pakai-qr-checkpoint";

/**
 * Poster A4 tegak untuk QR checkpoint tetap. Teksnya dalam bahasa utama acara
 * (yang membacanya peserta), dengan satu baris bahasa lain di bawahnya, sama
 * dengan layar QR. Hitam di atas putih supaya terbaca kamera ponsel murah dan
 * hemat tinta. QR 120 mm: terbaca dari sekitar satu meter.
 */

const TEKS = {
  id: {
    ke: (n: number, total: number) => `Checkpoint ${n} dari ${total}`,
    cara: "Pindai dengan kamera ponsel, atau buka halaman pesertamu dan ketuk Pindai QR checkpoint.",
    lain: "Scan with your phone camera, or open your participant page and tap Scan checkpoint QR.",
  },
  en: {
    ke: (n: number, total: number) => `Checkpoint ${n} of ${total}`,
    cara: "Scan with your phone camera, or open your participant page and tap Scan checkpoint QR.",
    lain: "Pindai dengan kamera ponsel, atau buka halaman pesertamu dan ketuk Pindai QR checkpoint.",
  },
} as const;

export default function PosterQrCheckpoint({ sesiId }: { sesiId: number | null }) {
  const { data, gambar, galat, tetap } = usePakaiQrCheckpoint(sesiId);
  const lang = data?.event.lang ?? "id";
  const t = TEKS[lang];
  const pertama = data?.checkpoints[0] ?? null;
  const judul = data?.checkpoints.map((cp) => (lang === "en" && cp.title_en?.trim()) || cp.title).join(" · ") ?? "";
  const tempat = pertama ? (lang === "en" && pertama.place_en?.trim()) || pertama.place : null;

  let pesan: string | null = null;
  if (sesiId === null) pesan = "Open this poster from Check-in > Checkpoints (Print poster).";
  else if (galat && !data) pesan = galat;
  else if (data && !tetap) pesan = "This checkpoint QR changes every 30 seconds, so it can't be printed. In Check-in > Checkpoints, choose Fixed, can be printed and save.";

  return (
    <main className="min-h-dvh bg-[#eceef3] py-6 text-[#111] print:bg-white print:py-0">
      <style>{"@page { size: A4 portrait; margin: 0 } @media print { html, body { background: #fff } }"}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-3 px-4 print:hidden">
        <p className="min-w-0 flex-1 text-[14px] leading-5 text-[#44474e]">
          {tetap ? `Printed code no. ${tetap.version}. Making a new code in Check-in > Checkpoints stops this poster from working.` : "Loading…"}
        </p>
        <button
          type="button"
          disabled={!tetap || !gambar}
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#1f5bd6] px-5 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          <Printer size={18} aria-hidden />
          Print
        </button>
      </div>
      {pesan ? (
        <p role="alert" className="mx-auto max-w-[210mm] px-4 text-[16px] font-medium text-[#B3261E]">{pesan}</p>
      ) : (
        <article className="mx-auto flex aspect-[210/297] w-full max-w-[210mm] flex-col items-center bg-white px-[16mm] py-[18mm] text-center shadow-sm print:h-[297mm] print:w-[210mm] print:max-w-none print:shadow-none">
          {pertama && data ? <p className="text-[clamp(14px,2.4vw,18pt)] font-semibold uppercase tracking-[0.08em] text-[#555]">{t.ke(pertama.position, data.total_checkpoints)}</p> : null}
          <h1 className="mt-[4mm] text-balance text-[clamp(26px,6vw,40pt)] font-bold leading-[1.1] [overflow-wrap:anywhere]">{judul || " "}</h1>
          {tempat ? <p className="mt-[3mm] text-[clamp(16px,3vw,20pt)] text-[#444]">{tempat}</p> : null}
          <div className="my-auto py-[6mm]">
            {gambar ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR dari data URL
              <img src={gambar} alt="Checkpoint QR" className="block aspect-square w-[min(72vw,120mm)] [image-rendering:pixelated]" />
            ) : (
              <div aria-hidden className="aspect-square w-[min(72vw,120mm)] animate-pulse bg-[#eceef3] motion-reduce:animate-none" />
            )}
          </div>
          <p className="max-w-[150mm] text-balance text-[clamp(16px,3vw,18pt)] font-medium leading-[1.35]">{t.cara}</p>
          <p lang={lang === "en" ? "id" : "en"} className="mt-[3mm] max-w-[150mm] text-balance text-[clamp(13px,2.2vw,12pt)] leading-[1.35] text-[#555]">{t.lain}</p>
          <p className="mt-[6mm] text-[clamp(11px,1.8vw,9pt)] tabular-nums text-[#777]">
            {data?.event.name}
            {tetap ? ` · ${tetap.version}` : ""}
          </p>
        </article>
      )}
    </main>
  );
}
