"use client";

import { X } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HariHighlight } from "@/lib/laporan/harian/jenis";
import { Bingkai, hurufCss } from "./carousel";
import { HalamanHarianView, LEBAR, TINGGI } from "./halaman";

/**
 * Mode cerita: highlight harian yang dikunci, diputar seperti stories di tab
 * Report klien. Ketuk kanan untuk lanjut, kiri untuk kembali; habis satu hari
 * langsung ke hari berikutnya. Tanpa timer: angka perlu dibaca, bukan dikejar.
 */
const GAYA = `
.cr-hal{animation:cr-masuk .32s cubic-bezier(.2,0,0,1) both}
.cr-hal [data-gerak="angka"]{animation:cr-naik .56s cubic-bezier(.2,0,0,1) .12s both}
.cr-hal [data-gerak="orang"]{animation:cr-pop .36s cubic-bezier(.3,1.4,.5,1) both}
.cr-hal [data-gerak="batang"]{transform-origin:50% 100%;animation:cr-tumbuh .6s cubic-bezier(.2,0,0,1) both}
.cr-hal [data-gerak="nilai"]{animation:cr-muncul .3s ease-out both}
.cr-hal [data-gerak="isi"]{transform-origin:0 50%;animation:cr-lebar .7s cubic-bezier(.2,0,0,1) .1s both}
${Array.from({ length: 12 }, (_, i) => `.cr-hal [data-gerak="orang"]:nth-child(${i + 1}),.cr-hal div:nth-child(${i + 1})>[data-gerak="batang"]{animation-delay:${120 + i * 50}ms}.cr-hal div:nth-child(${i + 1})>[data-gerak="nilai"]{animation-delay:${520 + i * 50}ms}`).join("")}
@keyframes cr-masuk{from{opacity:0;transform:translateY(12px) scale(.985)}}
@keyframes cr-naik{from{opacity:0;transform:translateY(48px)}}
@keyframes cr-muncul{from{opacity:0}}
@keyframes cr-pop{from{opacity:0;transform:scale(.4)}}
@keyframes cr-tumbuh{from{transform:scaleY(0)}}
@keyframes cr-lebar{from{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){.cr-hal,.cr-hal [data-gerak]{animation:none!important}}
`;

const tanggalPendek = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Deret sampul hari, seperti lingkaran stories; ketuk untuk memutar. */
export function CeritaHarian({ hari }: { hari: HariHighlight[] }) {
  const [buka, setBuka] = useState<number | null>(null);
  const asal = useRef<HTMLButtonElement | null>(null);
  if (!hari.length) return null;
  return (
    <section aria-labelledby="cr-judul" className="flex flex-col gap-3">
      <style>{GAYA}</style>
      <div className="flex flex-col gap-1">
        <h2 id="cr-judul" className="m-0 text-title-medium text-on-surface">Daily highlights</h2>
        <p className="m-0 text-body-medium text-on-surface-variant">Tap a day to play it. Figures were locked by the committee at the end of each day.</p>
      </div>
      <ul className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-2">
        {hari.map((h, i) => (
          <li key={h.tanggal} className="shrink-0">
            <button
              type="button"
              className="flex w-[104px] cursor-pointer flex-col gap-2 rounded-xl border-0 bg-transparent p-0 text-left text-on-surface outline-offset-4"
              onClick={(e) => {
                asal.current = e.currentTarget;
                setBuka(i);
              }}
              aria-label={`Play day ${h.hariKe}, ${tanggalPendek(h.tanggal)}, ${h.halaman.length} images`}
            >
              <span className="block w-full rounded-xl p-[3px]" style={{ background: h.tema.aksen }}>
                <span className="block overflow-hidden rounded-[9px] bg-surface p-[2px]">
                  <Bingkai className="rounded-[7px]">
                    <HalamanHarianView hari={h} p={h.halaman[0]} nomor={1} total={h.halaman.length} huruf={hurufCss(h)} />
                  </Bingkai>
                </span>
              </span>
              <span className="flex flex-col">
                <span className="text-label-large">{h.totalHari > 1 ? `Day ${h.hariKe}` : "Event day"}</span>
                <span className="text-body-small text-on-surface-variant">{tanggalPendek(h.tanggal)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {buka !== null ? (
        <Pemutar
          hari={hari}
          mulai={buka}
          tutup={() => {
            setBuka(null);
            // Setelah pemutar lepas dan halaman tidak lagi inert.
            requestAnimationFrame(() => asal.current?.focus());
          }}
        />
      ) : null}
    </section>
  );
}

function Pemutar({ hari, mulai, tutup }: { hari: HariHighlight[]; mulai: number; tutup: () => void }) {
  const [pos, setPos] = useState({ d: mulai, p: 0 });
  const h = hari[pos.d];
  const total = h.halaman.length;
  const tombolTutup = useRef<HTMLButtonElement>(null);

  const maju = useCallback(() => {
    setPos(({ d, p }) => (p + 1 < hari[d].halaman.length ? { d, p: p + 1 } : d + 1 < hari.length ? { d: d + 1, p: 0 } : { d, p }));
  }, [hari]);
  const mundur = useCallback(() => {
    setPos(({ d, p }) => (p > 0 ? { d, p: p - 1 } : d > 0 ? { d: d - 1, p: hari[d - 1].halaman.length - 1 } : { d, p }));
  }, [hari]);
  const akhir = pos.d === hari.length - 1 && pos.p === total - 1;

  // Kanvas sebesar mungkin di bawah bilah atas, tanpa memotong halaman.
  const [lebar, setLebar] = useState(0);
  useLayoutEffect(() => {
    const ukur = () => setLebar(Math.floor(Math.min(document.documentElement.clientWidth - 16, ((window.innerHeight - 88) * LEBAR) / TINGGI, 520)));
    ukur();
    window.addEventListener("resize", ukur);
    return () => window.removeEventListener("resize", ukur);
  }, []);

  useEffect(() => {
    const sebelum = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Halaman di belakang tidak bisa difokus atau diklik selama pemutar terbuka.
    const dialog = tombolTutup.current?.closest("[role=dialog]");
    const belakang = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== dialog && !el.inert);
    belakang.forEach((el) => (el.inert = true));
    tombolTutup.current?.focus();
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape") tutup();
      else if (e.key === "ArrowRight") maju();
      else if (e.key === "ArrowLeft") mundur();
    };
    window.addEventListener("keydown", tekan);
    return () => {
      document.body.style.overflow = sebelum;
      belakang.forEach((el) => (el.inert = false));
      window.removeEventListener("keydown", tekan);
    };
  }, [maju, mundur, tutup]);

  const label = `${h.totalHari > 1 ? `Day ${h.hariKe}` : "Event day"}, ${tanggalPendek(h.tanggal)}`;
  // Di body, supaya tidak terkurung wadah halaman (transform, overflow).
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Daily highlights, ${label}`} className="fixed left-0 top-0 z-50 flex h-dvh w-screen flex-col items-center bg-[#0b0b0f] text-white">
      <div className="flex w-full flex-col gap-2 px-3 pt-2" style={{ maxWidth: lebar || undefined }}>
        <div className="flex gap-1" aria-hidden>
          {h.halaman.map((p, i) => (
            <span key={p.kunci} className="h-[3px] flex-1 rounded-full" style={{ background: i <= pos.p ? "#fff" : "rgb(255 255 255 / .32)" }} />
          ))}
        </div>
        <div className="flex h-12 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-label-large" aria-live="polite">{`${label} · ${pos.p + 1} of ${total}`}</span>
          <button ref={tombolTutup} type="button" onClick={tutup} aria-label="Close" className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-white">
            <X size={24} weight="bold" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex w-full flex-1 items-center justify-center pb-4">
      <div className="relative w-full" style={{ maxWidth: lebar || undefined }}>
        {lebar ? (
          <Bingkai className="rounded-xl">
            <div key={`${pos.d}-${pos.p}`} className="cr-hal">
              <HalamanHarianView hari={h} p={h.halaman[pos.p]} nomor={pos.p + 1} total={total} huruf={hurufCss(h)} />
            </div>
          </Bingkai>
        ) : null}
        <button type="button" onClick={mundur} aria-label="Previous image" className="absolute inset-y-0 left-0 w-[30%] cursor-pointer border-0 bg-transparent" />
        <button type="button" onClick={akhir ? tutup : maju} aria-label={akhir ? "Close" : "Next image"} className="absolute inset-y-0 right-0 w-[70%] cursor-pointer border-0 bg-transparent" />
      </div>
      </div>
    </div>,
    document.body,
  );
}
