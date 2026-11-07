"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CAHAYA_LAG_MS, CAHAYA_PADAM_MS, CAHAYA_SEBAR_MS, acakTetap, campur, jadwalCahaya, selisihJam, sisaMenyala, waktuTampil, warnaPertunjukan,
  type CahayaJadwal, type Rgb,
} from "@/lib/undian-cahaya";
import { WinnerList, type AnimationProps } from "./undian-animations";

// ===========================================================================
// Cahaya HP di layar panggung: satu titik per orang di kolam, menyala dan
// berganti warna serentak dengan HP di ruangan (jam server yang sama), lalu
// padam per gelombang sampai tinggal titik pemenang yang emas, lalu nama.
//
// Titik-titik ini anonim. Urutan padamnya acak per undian dan tidak terkait
// siapa pun; yang tersisa di akhir hanya berjumlah sama dengan pemenang. Nama
// pemenang datang lewat `winners` setelah reveal_at, seperti animasi lain.
// ===========================================================================

/** Dari gelombang terakhir tampil sampai daftar nama. */
export const CAHAYA_LIST_MS = CAHAYA_LAG_MS + CAHAYA_SEBAR_MS + 1800;

const DIM: Rgb = [28, 30, 38];
const RED: Rgb = [179, 38, 30];
const SILVER: Rgb = [196, 203, 214];

function hexToRgb(hex: string, fallback: Rgb): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return fallback;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Selisih jam server untuk panggung: diukur saat dipasang dan tiap menit. */
function useJamServer(enabled: boolean) {
  const offset = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const setel = async () => {
      const samples: { sent: number; received: number; server: number }[] = [];
      for (let i = 0; i < 3 && !stop; i += 1) {
        try {
          const sent = Date.now();
          const response = await fetch("/api/undian/hp?jam=1", { cache: "no-store" });
          const data = (await response.json()) as { now: number };
          samples.push({ sent, received: Date.now(), server: data.now });
        } catch {
          // Tetap memakai selisih terakhir.
        }
      }
      if (samples.length && !stop) offset.current = selisihJam(samples);
    };
    void setel();
    const timer = window.setInterval(() => { void setel(); }, 60000);
    return () => { stop = true; window.clearInterval(timer); };
  }, [enabled]);
  return offset;
}

type Props = AnimationProps & {
  /** Jadwal dari /api/undian/state. Pratinjau CMS tidak punya: dibuat sendiri dari jumlah kolam. */
  jadwal?: CahayaJadwal | null;
  /** Pratinjau CMS: jam lokal, tanpa mengukur jam server. */
  localClock?: boolean;
  /** Pratinjau CMS: lama undian, untuk membuat jadwal tanpa server. */
  durationMs?: number;
};

export function CahayaAnimation({ roster, winners, endsAt, accent, text, fontFamily, round, pendingCount, poolSize, jadwal: fromServer, localClock = false, durationMs = 20000 }: Props) {
  const offset = useJamServer(!localClock);
  // Pratinjau: jadwal dibuat di sini dari ukuran kolam dan Duration.
  const [mountedAt] = useState(() => Date.now());
  const jadwal = useMemo(() => {
    if (fromServer) return fromServer;
    const total = Math.max(poolSize || roster.length, 1);
    const end = endsAt ?? mountedAt + durationMs;
    return jadwalCahaya(total, Math.min(total, Math.max(1, pendingCount ?? 1)), end - durationMs, end);
  }, [fromServer, poolSize, roster.length, endsAt, mountedAt, pendingCount, durationMs]);
  const revealAt = endsAt;

  // Titik ke gelombang: acak tetap per undian. Indeks akhir = titik yang menyala sampai akhir.
  const dots = useMemo(() => {
    const n = jadwal.total;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => acakTetap(`${round}:${a}`) - acakTetap(`${round}:${b}`));
    const wave = new Int16Array(n);
    let index = 0;
    let prev = n;
    jadwal.waves.forEach((item, w) => {
      const count = prev - item.left;
      for (let c = 0; c < count && index < n; c += 1) wave[order[index++]] = w + 1;
      prev = item.left;
    });
    // Sisanya (0) bertahan sampai akhir; urutan bertahannya dipakai untuk emas/perak.
    const survivors: number[] = [];
    for (; index < n; index += 1) survivors.push(order[index]);
    const rank = new Int16Array(n).fill(-1);
    survivors.forEach((dot, i) => { rank[dot] = i; });
    const jitter = Float32Array.from({ length: n }, (_, i) => acakTetap(`j${round}:${i}`) * CAHAYA_SEBAR_MS);
    const phase = Float32Array.from({ length: n }, (_, i) => acakTetap(`p${round}:${i}`));
    return { n, wave, rank, jitter, phase };
  }, [jadwal, round]);

  const mainCount = winners.filter((winner) => !winner.is_backup).length;
  const gold = useMemo(() => hexToRgb(accent, [245, 196, 81]), [accent]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const statusEl = useRef<HTMLSpanElement>(null);
  const [listShown, setListShown] = useState(false);
  const hasWinners = winners.length > 0;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const tenang = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let listTimer = 0;
    const last = jadwal.waves.length - 1;
    const finalAt = waktuTampil(jadwal.waves[last], revealAt);
    const draw = () => {
      const now = Date.now() + offset.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const n = dots.n;
      const cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / Math.max(1, h))));
      const rows = Math.ceil(n / cols);
      const cell = Math.min(w / cols, h / rows);
      const radius = Math.max(1.2, cell * 0.34);
      const ox = (w - cols * cell) / 2 + cell / 2;
      const oy = (h - rows * cell) / 2 + cell / 2;
      const show = warnaPertunjukan(jadwal, now, 0, tenang);
      for (let i = 0; i < n; i += 1) {
        const wave = dots.wave[i];
        let rgb: Rgb;
        let glow = 0;
        if (wave > 0) {
          const at = waktuTampil(jadwal.waves[wave - 1], revealAt) + dots.jitter[i];
          if (now < at) { rgb = warnaPertunjukan(jadwal, now, dots.phase[i], tenang); glow = 0.6; }
          else {
            const f = (now - at) / CAHAYA_PADAM_MS;
            rgb = f < 0.35 ? campur(show, RED, f / 0.35) : campur(RED, DIM, Math.min(1, (f - 0.35) / 0.65));
          }
        } else if (now >= finalAt + dots.jitter[i] * 0.3) {
          const backup = hasWinners && dots.rank[i] >= mainCount;
          rgb = backup ? SILVER : campur(gold, [255, 255, 255], tenang ? 0.1 : 0.1 + 0.15 * ((Math.sin(now / 400 + i) + 1) / 2));
          glow = 1.4;
        } else { rgb = warnaPertunjukan(jadwal, now, dots.phase[i], tenang); glow = 0.6; }
        // Baris terakhir yang tidak penuh dipusatkan, supaya tidak ada titik "yatim" di pojok kiri.
        const row = Math.floor(i / cols);
        const inRow = row === rows - 1 ? n - row * cols : cols;
        const x = ox + (i % cols) * cell + ((cols - inRow) * cell) / 2;
        const y = oy + row * cell;
        if (glow > 0 && cell > 6) {
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.18)`;
          ctx.beginPath();
          ctx.arc(x, y, radius * (1 + glow * 0.9), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.beginPath();
        ctx.arc(x, y, radius * (glow > 1 ? 1.25 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
      if (counter.current) counter.current.textContent = new Intl.NumberFormat("id-ID").format(sisaMenyala(jadwal, now, revealAt));
      if (statusEl.current) {
        const next = jadwal.waves.findIndex((item) => now < waktuTampil(item, revealAt) + CAHAYA_SEBAR_MS);
        statusEl.current.textContent = next === -1 ? "Pemenang!"
          : now - jadwal.start < 4000 ? "Angkat HP kamu!"
          : next === 0 && now < waktuTampil(jadwal.waves[0], revealAt) - 1500 ? "Seisi ruangan menyala"
          : next === last ? (now > waktuTampil(jadwal.waves[last], revealAt) - 3500 ? "Gelombang terakhir" : `Gelombang ${next + 1}`)
          : `Gelombang ${next + 1}`;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    // Daftar nama setelah titik emas berdiri sebentar, hanya bila nama sudah tiba.
    if (hasWinners) {
      const wait = Math.max(0, finalAt + CAHAYA_SEBAR_MS + 1800 - (Date.now() + offset.current));
      listTimer = window.setTimeout(() => setListShown(true), wait);
    }
    return () => { cancelAnimationFrame(frame); window.clearTimeout(listTimer); };
  }, [dots, jadwal, revealAt, offset, gold, mainCount, hasWinners]);

  const shown = listShown && hasWinners;
  // "Show the number in the draw" mati: panggung menerima pool_size 0 dan jadwal berskala, jadi angkanya tidak ditulis.
  const countHidden = Boolean(fromServer) && !poolSize;
  const total = new Intl.NumberFormat("id-ID").format(jadwal.total);

  return (
    <div className="relative h-full w-full" style={{ color: text, fontFamily }}>
      {/* Titik di bawah baris status dan penghitung, tidak tertimpa keduanya. */}
      <div className="absolute inset-x-0 bottom-0 top-[clamp(48px,16%,200px)] transition-opacity duration-700" style={{ opacity: shown ? 0.18 : 1 }}>
        <canvas ref={canvas} aria-hidden className="block h-full w-full" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-[2vw] px-[1.5vw] pt-[1vh]">
        <span ref={statusEl} className="rounded-full px-[1.2em] py-[0.5em] font-semibold" style={{ fontSize: "clamp(10px, 1.3vw, 26px)", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.16)", opacity: shown ? 0 : 1 }} />
        <span className="text-right leading-none" style={{ opacity: shown || countHidden ? 0 : 1 }}>
          <span ref={counter} className="block font-bold tabular-nums" style={{ fontSize: "clamp(22px, 4.2vw, 84px)" }} />
          <span className="mt-[0.4em] block font-semibold" style={{ fontSize: "clamp(9px, 1.05vw, 20px)", opacity: 0.75 }}>masih menyala dari {total}</span>
        </span>
      </div>
      {shown ? (
        <div className="absolute inset-0 px-[3vw] py-[2vh]">
          <WinnerList winners={winners} accent={accent} text={text} fontFamily={fontFamily} />
        </div>
      ) : null}
    </div>
  );
}
