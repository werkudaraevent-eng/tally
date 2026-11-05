"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { expressive } from "@/lib/m3/motion";
import { LIST_AFTER_MS, TUNNEL_ARRIVE_MS, WinnerList, tunnelGapMs, type AnimationProps } from "./undian-animations";

// ===========================================================================
// Terowongan nama
// ===========================================================================
//
// Nama-nama dari kolam terbang dari ujung terowongan ke arah layar. Begitu
// `winners` datang, aliran melambat dan meredup, lalu nama pemenang MASUK DARI
// UJUNG TEROWONGAN seperti nama lain dan berhenti tepat di depan. Nama yang
// terlihat mendekat itulah pemenangnya (Hanung, 5 Nov: versi pertama mengganti
// nama di depan dengan nama lain, dan itu terasa tidak nyambung).
//
// Banyak pemenang: tiba satu per satu, tiap nama berhenti sebentar lalu terbang
// melewati kamera, dan setelah nama terakhir tiba daftar lengkap (WinnerList,
// termasuk cadangan) tampil di atas terowongan yang diredupkan.
//
// Kontraknya sama dengan varian lain: sebelum `winners` terisi, aliran hanya
// berisi nama acak dari `roster`. Jumlah nama di layar selalu sama, berapa pun
// besar kolamnya, jadi penonton tidak bisa menghitung peserta.

/** Batas pemenang yang terbang satu per satu; sama dengan ANIMATION_MAX_WINNERS di lib/undian. */
const MAX_SHOWN = 10;
const SPEED: Record<NonNullable<AnimationProps["speed"]>, number> = { slow: 0.6, normal: 1, fast: 1.6 };
const PARTICLES = 54;
const RINGS = 10;
const FAR = 8;
const NEAR = 0.55;
/** Jarak awal nama pemenang di dalam terowongan. */
const WIN_FROM = 7;

type Particle = { name: string; angle: number; radius: number; z: number };

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function TunnelAnimation({ roster, winners, accent, text, fontFamily, round, speed = "normal" }: AnimationProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mains = winners.filter((winner) => !winner.is_backup);
  const shown = (mains.length > 0 ? mains : winners).slice(0, MAX_SHOWN);
  const shownNames = shown.map((winner) => winner.name);

  // Daftar nama tampil setelah pemenang terakhir tiba. Pemenang yang sudah ada
  // saat komponen dipasang (layar dimuat ulang setelah undian) langsung ke daftar.
  const [listRound, setListRound] = useState<number | null>(() => (winners.length > 0 ? round : null));
  const showList = listRound === round && winners.length > 0;
  const hasWinners = winners.length > 0;
  const shownCount = shown.length;
  useEffect(() => {
    if (!hasWinners || listRound === round) return;
    const delay = TUNNEL_ARRIVE_MS + (shownCount - 1) * tunnelGapMs(shownCount) + LIST_AFTER_MS;
    const timer = window.setTimeout(() => setListRound(round), delay);
    return () => window.clearTimeout(timer);
  }, [hasWinners, shownCount, round, listRound]);
  const skipReveal = useRef(winners.length > 0);

  // Nilai terbaru dibaca loop canvas lewat ref, supaya polling 2 detik di
  // halaman panggung tidak memasang ulang loop dan memotong gerakan. Begitu
  // daftar tampil, nama besar di canvas berhenti digambar: daftar yang menggantikannya.
  const live = useRef({ names: roster.map((item) => item.name), shownNames, accent, text, fontFamily, speed, round, listShown: showList });
  useEffect(() => {
    live.current = { names: roster.map((item) => item.name), shownNames, accent, text, fontFamily, speed, round, listShown: showList };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const view = wrap.ownerDocument.defaultView ?? window;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.min(2, view.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const pickName = () => {
      const names = live.current.names;
      return names.length > 0 ? names[Math.floor(Math.random() * names.length)] : "• • •";
    };
    const particles: Particle[] = Array.from({ length: PARTICLES }, () => ({
      name: pickName(), angle: Math.random() * Math.PI * 2, radius: 0.35 + Math.random() * 0.65, z: NEAR + Math.random() * (FAR - NEAR),
    }));
    const rings = Array.from({ length: RINGS }, (_, index) => NEAR + (index / RINGS) * (FAR - NEAR));

    // Huruf panggung datang sebagai `var(--font-...), serif`. Canvas tidak
    // mengenal var(): font yang tidak sah diabaikan diam-diam dan teks jatuh ke
    // 10px sans-serif. Nama keluarga yang sudah jadi dibaca dari gaya terhitung.
    let fontKey = "";
    let resolvedFont = "sans-serif";
    const fontOf = (stack: string) => {
      if (stack !== fontKey) {
        fontKey = stack;
        wrap.style.fontFamily = stack;
        resolvedFont = view.getComputedStyle(wrap).fontFamily || "sans-serif";
      }
      return resolvedFont;
    };

    let revealAt: number | null = null;
    let listAt: number | null = null;
    let revealRound = live.current.round;
    let twist = 0;
    let last = view.performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { shownNames: names, accent: gold, text: ink, fontFamily: stack, speed: pace, round: currentRound, listShown } = live.current;
      const font = fontOf(stack);

      // Undian baru di pratinjau (round naik tanpa pasang ulang): mulai dari aliran penuh.
      if (currentRound !== revealRound) {
        revealRound = currentRound;
        revealAt = null;
        skipReveal.current = false;
      }
      if (names.length > 0 && revealAt === null) revealAt = skipReveal.current ? now - 60_000 : now;
      if (names.length === 0) revealAt = null;
      const t = revealAt === null ? -1 : (now - revealAt) / 1000;

      // Aliran melambat dan meredup begitu pemenang datang, supaya mata pindah ke nama yang masuk.
      const flow = t < 0 ? 1 : Math.max(0.22, 1 - (t / 1.5) * 0.78);
      const dim = t < 0 ? 1 : Math.max(0.06, 1 - t / 1.2);
      const velocity = 1.6 * SPEED[pace] * flow;
      twist += dt * 0.12 * SPEED[pace] * flow;

      const cx = width / 2;
      const cy = height / 2;
      const focal = Math.min(width, height * 1.6) * 0.5;
      const base = Math.min(height * 0.11, width * 0.06);
      ctx.clearRect(0, 0, width, height);

      // Cincin terowongan untuk kedalaman.
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ink;
      for (let i = 0; i < rings.length; i += 1) {
        rings[i] -= velocity * dt;
        if (rings[i] < NEAR) rings[i] += FAR - NEAR;
        const z = rings[i];
        const alpha = 0.1 * clamp01((FAR - z) / 2) * clamp01((z - NEAR) / 0.8) * (0.4 + dim * 0.6);
        if (alpha <= 0.004) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.ellipse(cx, cy, (1.15 * focal) / z, (0.72 * focal) / z, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Nama-nama di aliran.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = ink;
      for (const item of particles) {
        item.z -= velocity * dt;
        if (item.z < NEAR) {
          item.z = FAR - Math.random() * 0.6;
          item.name = pickName();
          item.angle = Math.random() * Math.PI * 2;
          item.radius = 0.35 + Math.random() * 0.65;
        }
        const angle = item.angle + twist;
        const x = cx + (Math.cos(angle) * item.radius * focal) / item.z;
        const y = cy + (Math.sin(angle) * item.radius * 0.62 * focal) / item.z;
        const size = base / item.z;
        const alpha = 0.85 * clamp01((FAR - item.z) / 1.5) * clamp01((item.z - NEAR) / 0.9) * dim;
        if (alpha <= 0.01 || size < 7) continue;
        ctx.globalAlpha = alpha;
        ctx.font = `600 ${Math.round(size)}px ${font}`;
        ctx.fillText(item.name, x, y);
      }

      // Pemenang: masuk dari ujung, berhenti di depan, lalu (kecuali yang
      // terakhir) terbang melewati kamera saat nama berikutnya datang.
      if (!listShown) listAt = null;
      else if (listAt === null) listAt = now;
      const handOff = listAt === null ? 1 : 1 - clamp01((now - listAt) / 300);
      if (t >= 0 && handOff > 0) {
        const travel = TUNNEL_ARRIVE_MS / 1000;
        const gap = tunnelGapMs(names.length) / 1000;
        for (let i = names.length - 1; i >= 0; i -= 1) {
          const arrive = travel + i * gap;
          const local = t - (arrive - travel);
          if (local < 0) continue;
          const isLast = i === names.length - 1;
          const leaveAt = arrive + gap * 0.55;
          let z: number;
          let alpha: number;
          if (t < arrive) {
            const k = clamp01(local / travel);
            z = WIN_FROM - (WIN_FROM - 1) * (1 - (1 - k) ** 3);
            alpha = clamp01(local / 0.6);
          } else if (isLast || t < leaveAt) {
            z = 1;
            alpha = 1;
          } else {
            const k = clamp01((t - leaveAt) / 0.35);
            z = 1 - 0.6 * k * k;
            alpha = 0.6 * (1 - k);
          }
          // Nama berikutnya tetap samar selama nama sebelumnya masih di depan,
          // supaya dua nama tidak terbaca bertumpuk.
          if (i > 0) alpha *= 0.25 + 0.75 * clamp01((t - (arrive - gap + gap * 0.55)) / 0.35);
          alpha *= handOff;
          const leaving = !isLast && t >= leaveAt;
          if (alpha <= 0.01) continue;

          // Huruf besar dan warna aksen, sama dengan WinnerList, supaya
          // pergantian ke daftar nama tidak terlihat sebagai lompatan.
          const label = names[i].toLocaleUpperCase("id-ID");
          ctx.font = `800 100px ${font}`;
          const measured = Math.max(1, ctx.measureText(label).width);
          const target = Math.min(Math.max(32, Math.min(132, view.innerWidth * 0.08)), height * 0.3, (width * 0.86 * 100) / measured);
          const size = target / z;
          const glow = clamp01((t - (arrive - 0.4)) / 0.4);

          ctx.globalAlpha = alpha;
          ctx.font = `800 ${Math.round(size)}px ${font}`;
          ctx.shadowColor = gold;
          ctx.shadowBlur = 28 * glow;
          ctx.fillStyle = glow >= 1 ? gold : ink;
          if (glow > 0 && glow < 1) {
            ctx.fillStyle = ink;
            ctx.fillText(label, cx, cy);
            ctx.globalAlpha = alpha * glow;
            ctx.fillStyle = gold;
          }
          ctx.fillText(label, cx, cy);
          ctx.globalAlpha = alpha;
          ctx.shadowBlur = 0;
          if (glow > 0 && !leaving) {
            ctx.globalAlpha = alpha * glow;
            ctx.fillStyle = gold;
            ctx.font = `700 ${Math.round(target * 0.26)}px ${font}`;
            ctx.fillText("PEMENANG", cx, cy - size * 0.78);
          }
        }
      }
      ctx.globalAlpha = 1;
      frame = view.requestAnimationFrame(draw);
    };
    frame = view.requestAnimationFrame(draw);

    return () => {
      view.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <div className="relative h-full w-full min-h-0">
    <motion.div
      ref={wrapRef}
      className="absolute inset-0"
      animate={{ opacity: showList ? 0.25 : 1 }}
      transition={{ duration: 0.4 }}
    >
      <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />
    </motion.div>
    <AnimatePresence>
      {showList && <motion.div
        key={`daftar-${round}`}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={expressive.effects.default}
      >
        <WinnerList winners={winners} accent={accent} text={text} fontFamily={fontFamily} />
      </motion.div>}
    </AnimatePresence>
  </div>;
}
