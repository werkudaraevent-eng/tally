"use client";

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { expressive } from "@/lib/m3/motion";
import { readableOn } from "@/lib/color";
import { initialsOf } from "@/lib/undian";
import { WALL_FLIGHT_MS, WALL_WAVE_MS, type AnimationProps } from "./undian-animations";
import { GreenScreenContext } from "./undian-stage-fx";

// ===========================================================================
// Spotlight wall (Dinding Sorot)
// ===========================================================================
//
// Seluruh kolam (dibatasi 500 nama oleh /api/undian/control) tampil sebagai
// dinding ubin. Selama undian, lampu sorot menyapu dinding. Begitu `winners`
// datang, dinding padam dalam tiga gelombang (60, 12, lalu pemenang), dan ubin
// pemenang terbang ke tengah menjadi kartu nama besar.
//
// Kontraknya sama dengan varian lain: komponen ini TIDAK tahu pemenang sebelum
// `winners` terisi. Gelombang padam baru dimulai sesudahnya, jadi tidak ada ubin
// yang "diunggulkan" selama lampu menyapu.
//
// Biaya: 500 ubin adalah div biasa dengan transisi CSS. Lampu sorot adalah
// lapisan kedua yang di-mask `radial-gradient`; posisinya ditulis ke dua CSS
// variable per frame, tanpa render React.

/** Jeda terbang kartu pemenang ke-`index`, dalam detik sejak kartu tampil. */
const cardDelay = (index: number) => Math.min(index * 0.22, 1.2);

/** Ukuran dinding setelah tiap gelombang, sebelum gelombang terakhir (pemenang). */
const WAVES = [60, 12];

/**
 * Dinding penuh (wall_tiles = fixed): jumlah ubin selalu sama, berapa pun
 * besar kolamnya, dan nama berganti di ubin selama undian. Penonton tidak bisa
 * menghitung ubin untuk tahu berapa orang yang ikut (Hanung, 5 Nov).
 */
const FIXED_TILES = 180;
/** Denyut pergantian nama di dinding penuh. Tiap ubin berganti setiap 3-8 denyut. */
const FIXED_TICK_MS = 350;

/** Acak yang dapat diulang: server dan browser menggambar kedipan yang sama. */
function scatter(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Ambil `count` indeks acak dari `from`, selalu termasuk `keep`. */
function survivors(from: number[], count: number, keep: number[]): number[] {
  const rest = from.filter((index) => !keep.includes(index));
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...keep, ...rest.slice(0, Math.max(0, count - keep.length))];
}

/**
 * Kolom dinding dari ukuran wadahnya: ubin kira-kira 2,4 kali lebar tingginya,
 * cukup untuk dua baris nama pendek.
 */
function layoutFor(count: number, width: number, height: number) {
  if (count === 0 || width === 0 || height === 0) return { columns: 1, rows: 1, tileW: 0, tileH: 0 };
  const columns = Math.max(1, Math.min(count, Math.round(Math.sqrt((count * width) / (height * 2.4)))));
  const rows = Math.ceil(count / columns);
  return { columns, rows, tileW: width / columns, tileH: height / rows };
}

/**
 * Kartu pemenang yang muat satu layar. Kolom dipilih supaya huruf nama sebesar
 * mungkin: tinggi kartu memuat label, nama dua baris dan perusahaan; lebarnya
 * memuat separuh nama terpanjang per baris. Kartu sama lebar, baris terakhir
 * di tengah. Sebelumnya kartu ber-flex-wrap dengan huruf tetap, sehingga 25
 * pemenang meluber keluar layar atas dan bawah.
 */
export function fitCards(count: number, longest: number, width: number, height: number, withSub: boolean) {
  if (count === 0 || width <= 0 || height <= 0) return { columns: 1, cardW: 0, font: 0, gap: 0 };
  const gap = Math.max(6, Math.min(width, height) * 0.018);
  // Tinggi kartu dalam satuan huruf nama: padding 0.9, label 0.55, nama
  // 1.08 per baris, perusahaan 0.75. Lebar: 0.56 em per huruf tebal + 1.4 em
  // padding samping. Nama satu baris lebih mudah dibaca dari jauh, jadi dipilih
  // selama hurufnya tidak lebih dari ~10% lebih kecil daripada dua baris.
  const base = 0.9 + 0.55 + (withSub ? 0.75 : 0);
  const chars = Math.min(longest, 40);
  const cap = count === 1 ? 120 : count <= 3 ? 64 : count <= 6 ? 48 : 40;
  let best = { columns: 1, cardW: 0, font: 0, gap, perLine: chars, score: 0 };
  for (let columns = 1; columns <= Math.min(count, 8); columns++) {
    const rows = Math.ceil(count / columns);
    const cardW = (width - gap * (columns - 1)) / columns;
    const cardH = (height - gap * (rows - 1)) / rows;
    for (const lineCount of [1, 2]) {
      const perLine = Math.max(6, Math.ceil(chars / lineCount) + (lineCount === 2 ? 1 : 0));
      const font = Math.min(cap, cardH / (base + 1.08 * lineCount), cardW / (perLine * 0.56 + 1.4));
      const score = font * (lineCount === 1 ? 1.12 : 1);
      if (score > best.score) best = { columns, cardW, font, gap, perLine, score };
    }
  }
  // Kartu tidak lebih lebar daripada isinya: satu pemenang tidak menjadi pita selebar layar.
  const cardW = Math.min(best.cardW, best.font * (best.perLine * 0.56 + 1.4) * 1.25);
  return { columns: best.columns, font: best.font, gap: best.gap, cardW };
}

export function WallAnimation({ roster, winners, endsAt, accent, text, fontFamily, round, poolSize, wallTiles }: AnimationProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const greenScreen = useContext(GreenScreenContext);
  const drawing = winners.length === 0;
  const main = useMemo(() => winners.filter((winner) => !winner.is_backup), [winners]);
  const backups = useMemo(() => winners.filter((winner) => winner.is_backup), [winners]);

  // Setiap poll membawa array roster baru dengan isi sama; kunci memo pada
  // isinya supaya gelombang sorot tidak diacak ulang di tengah jalan.
  const namesKey = roster.map((item) => item.name).join("\u0000");
  const names = useMemo(() => (namesKey === "" ? [] : namesKey.split("\u0000")), [namesKey]);
  const initialsWall = useMemo(() => names.length > 0 && names.every((name) => /^(\S\.){1,2}$/u.test(name)), [names]);
  const fixed = wallTiles === "fixed" && names.length > 0;

  // Dinding penuh: denyut yang menggeser nama di ubin. Berhenti begitu pemenang
  // datang, jadi dinding membeku saat gelombang padam mulai.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!fixed || !drawing || reduceMotion) return;
    const timer = window.setInterval(() => setTick((current) => current + 1), FIXED_TICK_MS);
    return () => window.clearInterval(timer);
  }, [fixed, drawing, reduceMotion]);

  // Ukuran wadah, untuk menghitung kolom dan huruf ubin.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((current) => (Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1 ? current : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { columns, rows, tileW, tileH } = layoutFor(fixed ? FIXED_TILES : names.length, box.width, box.height);
  // Dinding penuh mengisi baris terakhir juga, supaya tidak ada celah di ujung.
  const tileCount = fixed ? columns * rows : names.length;
  const tileFont = initialsWall
    ? Math.max(8, Math.min(tileH * 0.42, tileW * 0.3))
    : Math.max(7, Math.min(tileH * 0.27, tileW * 0.11));

  /**
   * Ubin pemenang dicari dari namanya. Nama sama dipakai dua orang? Ubin
   * pertama yang belum dipakai: ini tampilan, bukan penentuan pemenang.
   * Dinding inisial dicocokkan lewat inisialnya. Pemenang dari kolam di atas
   * 500 nama bisa tidak ada di dinding; kartunya lalu muncul dari tengah.
   */
  const mainKey = main.map((winner) => winner.name).join("\u0000");
  const winnerTiles = useMemo(() => {
    // Dinding penuh: nama tidak terikat ke ubin, jadi pemenang mendapat ubin acak.
    // Diurutkan dengan acak yang dapat diulang (per undian), supaya ubin
    // pemenang tidak pindah saat layar dimuat ulang.
    if (fixed) {
      return Array.from({ length: tileCount }, (_, index) => index)
        .sort((a, b) => scatter(a, round * 13 + 5) - scatter(b, round * 13 + 5))
        .slice(0, main.length);
    }
    const used = new Set<number>();
    return main.map((winner) => {
      const target = initialsWall ? initialsOf(winner.name) : winner.name;
      const index = names.findIndex((name, i) => !used.has(i) && name === target);
      if (index >= 0) used.add(index);
      return index;
    });
    // `mainKey` mewakili isi `main`: array-nya dibangun ulang setiap poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainKey, names, initialsWall, fixed, tileCount, round]);

  // Nama di tiap ubin. Dinding biasa: satu orang per ubin. Dinding penuh: nama
  // diambil dari kolam per ubin per "zaman" ubin itu, sehingga ubin berganti
  // tidak serentak; ubin pemenang memakai nama pemenang begitu ia datang.
  const tileNames = useMemo(() => {
    if (!fixed) return names;
    if (!drawing) {
      // Dinding membeku: nama dibagikan tanpa pengulangan dari kolam yang
      // diacak sekali, TANPA nama pemenang. Nama pemenang hanya ada di ubin
      // pemenang, jadi gelombang padam tidak pernah menyalakan namanya di ubin
      // lain. Kolam lebih kecil dari dinding: nama bukan pemenang diulang.
      const winnerNames = new Set(main.map((winner) => (initialsWall ? initialsOf(winner.name) : winner.name)));
      const others = names.filter((name) => !winnerNames.has(name));
      const deck = (others.length > 0 ? others : names)
        .map((name, index) => ({ name, key: scatter(index, round * 17 + 9) }))
        .sort((a, b) => a.key - b.key)
        .map((item) => item.name);
      let next = 0;
      return Array.from({ length: tileCount }, (_, index) => {
        const winnerAt = winnerTiles.indexOf(index);
        if (winnerAt >= 0) return initialsWall ? initialsOf(main[winnerAt].name) : main[winnerAt].name;
        const name = deck[next % deck.length];
        next += 1;
        return name;
      });
    }
    return Array.from({ length: tileCount }, (_, index) => {
      const period = 3 + Math.floor(scatter(index, 31) * 6);
      const epoch = Math.floor((tick + scatter(index, 32) * period) / period);
      return names[Math.floor(scatter(index, epoch * 7 + 3) * names.length) % names.length];
    });
    // `mainKey` mewakili isi `main`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixed, names, tick, drawing, winnerTiles, initialsWall, mainKey, tileCount, round]);

  // Gelombang padam: 0 = dinding penuh, 1..WAVES.length = gelombang,
  // WAVES.length + 1 = hanya pemenang, WAVES.length + 2 = kartu pemenang.
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState({ round, drawing });
  if (seen.round !== round || seen.drawing !== drawing) {
    setSeen({ round, drawing });
    setStep(0);
  }
  useEffect(() => {
    if (drawing) return;
    const every = reduceMotion ? 120 : WALL_WAVE_MS;
    const timers = Array.from({ length: WAVES.length + 2 }, (_, index) => window.setTimeout(
      // Hanya maju: dinding yang menyala lagi terbaca sebagai hasil yang ditarik ulang.
      () => setStep((current) => Math.max(current, index + 1)),
      (reduceMotion ? 0 : 250) + index * every,
    ));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [drawing, round, reduceMotion]);

  // Ubin yang masih menyala per langkah. Diacak sekali per undian; pemenang
  // selalu ikut supaya gelombang terakhir berakhir di ubinnya.
  const lit = useMemo(() => {
    const all = Array.from({ length: tileCount }, (_, index) => index);
    const keep = winnerTiles.filter((index) => index >= 0);
    const sets: Set<number>[] = [new Set(all)];
    let alive = all;
    for (const size of WAVES) {
      alive = alive.length > size ? survivors(alive, size, keep) : alive;
      sets.push(new Set(alive));
    }
    sets.push(new Set(keep));
    return sets;
  }, [tileCount, winnerTiles]);
  const litNow = lit[Math.min(step, lit.length - 1)];
  const showCards = !drawing && step >= WAVES.length + 2;

  // Ubin pemenang menjadi kartu (FLIP): kartu dirender di posisi akhirnya,
  // lalu Web Animations menariknya dari kotak ubin (termasuk skala 1,18) ke
  // tempatnya. Animasi berjalan di luar React, jadi render ulang di tengah
  // jalan tidak bisa membuatnya melompat (Hanung, 7 Nov: dengan layoutId
  // framer, kartu sempat meloncat dan ubin mengecil tepat saat serah terima).
  const tileRefs = useRef(new Map<number, HTMLDivElement>());
  const cardRefs = useRef(new Map<number, HTMLDivElement>());
  const cardTotal = main.length;
  useLayoutEffect(() => {
    if (!showCards) return;
    const animations: Animation[] = [];
    const timers: number[] = [];
    for (let index = 0; index < cardTotal; index += 1) {
      const card = cardRefs.current.get(index);
      if (!card) continue;
      const delay = reduceMotion ? 0 : cardDelay(index) * 1000;
      // Kartu yang menunggu jeda terbang ada di bawah; yang sudah berangkat di
      // atasnya, yang terakhir berangkat paling atas. Nama yang sudah tampil
      // tidak tertutup ubin kecil (Hanung, 5 Nov).
      card.style.zIndex = String(cardTotal - index);
      timers.push(window.setTimeout(() => { card.style.zIndex = String(100 + index); }, delay));
      const tile = tileRefs.current.get(index);
      if (!tile || reduceMotion || typeof card.animate !== "function") continue;
      const from = tile.getBoundingClientRect();
      const to = card.getBoundingClientRect();
      if (from.width === 0 || to.width === 0) continue;
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const sx = from.width / to.width;
      const sy = from.height / to.height;
      animations.push(card.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transform: "translate(0px, 0px) scale(1, 1)" },
        ],
        // Emphasized (M3): lepas landas pelan dari ubin, mendarat pelan. Kurva
        // decelerate membuat ubin seperti meletup di frame pertama.
        { duration: WALL_FLIGHT_MS, delay, easing: "cubic-bezier(0.3, 0, 0, 1)", fill: "backwards" },
      ));
    }
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      animations.forEach((animation) => animation.cancel());
    };
  }, [showCards, cardTotal, round, reduceMotion]);

  // Lampu sorot: posisi ditulis langsung ke CSS variable, tanpa render React.
  const spotRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = spotRef.current;
    if (!element || !drawing || reduceMotion) return;
    let raf = 0;
    let phase = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const remaining = endsAt ? endsAt - Date.now() : Number.POSITIVE_INFINITY;
      // Melambat di dua detik terakhir, seperti lampu yang mencari sasaran.
      const speed = remaining > 2000 ? 1 : 0.35 + 0.65 * Math.max(0, remaining) / 2000;
      phase += ((now - last) / 1000) * speed;
      last = now;
      const x = 50 + 40 * Math.sin(phase * 1.7) * Math.cos(phase * 0.43);
      const y = 50 + 36 * Math.sin(phase * 2.3 + 1);
      element.style.setProperty("--spot-x", `${x.toFixed(2)}%`);
      element.style.setProperty("--spot-y", `${y.toFixed(2)}%`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [drawing, endsAt, reduceMotion, round]);

  const onAccent = readableOn(accent);
  // Green screen: ubin tembus pandang di atas hijau ter-key menjadi bayangan
  // hijau samar. Ubin dibuat pekat di atas warna dasar yang kontras dengan
  // teks, dan redupnya pindah ke warna, bukan opasitas.
  const plate = readableOn(text);
  const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, ${plate})`;
  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridAutoRows: `${tileH}px`,
    gap: 0,
  };
  const tileBase = "flex items-center justify-center overflow-hidden text-center";
  const tileText: CSSProperties = {
    fontFamily, fontSize: `${tileFont}px`, lineHeight: 1.08,
    fontWeight: initialsWall ? 700 : 500,
    letterSpacing: initialsWall ? "0.04em" : undefined,
    overflowWrap: "anywhere",
  };

  const cardCount = Math.max(1, main.length);
  const withSub = main.some((winner) => winner.company || winner.seat);
  const longest = main.reduce((max, winner) => Math.max(max, winner.name.length), 0);
  const fit = fitCards(cardCount, longest, box.width * 0.96, box.height * 0.96, withSub);
  const shown = names.length;
  const total = poolSize ?? shown;

  return <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden px-[3vw] py-[1.5vh]">
    <div ref={boxRef} className="relative min-h-0 w-full flex-1">
      {/* Dinding redup: semua nama, selalu terpasang. */}
      <div aria-hidden className="absolute inset-0" style={{ ...gridStyle, opacity: showCards ? (greenScreen ? 0 : 0.28) : 1, transition: "opacity 600ms ease" }}>
        {tileNames.map((name, index) => {
          const on = litNow.has(index);
          const hot = !drawing && step > 0 && on;
          const winnerAt = winnerTiles.indexOf(index);
          // Ubin pemenang tetap besar sampai kartunya berangkat: kotak inilah
          // titik awal kartu.
          const final = !drawing && step >= WAVES.length + 1 && winnerAt >= 0;
          const tile = <div
            ref={winnerAt >= 0 ? (element) => {
              if (element) tileRefs.current.set(winnerAt, element);
              else tileRefs.current.delete(winnerAt);
            } : undefined}
            className={tileBase}
            style={{
              ...tileText,
              position: "relative",
              height: `calc(100% - ${2 * Math.max(1, tileH * 0.05)}px)`,
              margin: `${Math.max(1, tileH * 0.05)}px`,
              borderRadius: Math.max(2, tileH * 0.12),
              padding: `0 ${Math.max(1, tileW * 0.04)}px`,
              background: final ? accent : hot ? `${accent}b3` : `${text}12`,
              color: final || hot ? onAccent : text,
              // Ubin pemenang kosong setelah kartunya terbang keluar.
              opacity: showCards && winnerAt >= 0 ? 0 : on ? (hot || final ? 1 : 0.42) : 0.06,
              transform: final ? "scale(1.18)" : on ? "scale(1)" : "scale(0.86)",
              boxShadow: final ? `0 0 ${tileH * 0.8}px ${accent}` : hot ? `0 0 ${tileH * 0.4}px ${accent}99` : "none",
              zIndex: final ? 2 : hot ? 1 : 0,
              ...(greenScreen ? {
                background: final ? accent : hot ? mix(accent, 70) : mix(text, on ? 14 : 7),
                color: final || hot ? onAccent : mix(text, on ? 70 : 30),
                opacity: showCards && winnerAt >= 0 ? 0 : 1,
              } : {}),
              // Ubin pemenang hilang seketika: kartunya berangkat dari kotak yang sama.
              transition: reduceMotion || (showCards && winnerAt >= 0) ? "none" : `opacity 520ms ease ${(scatter(index, round) * 600).toFixed(0)}ms, transform 520ms ease, background 400ms ease, box-shadow 400ms ease`,
            }}
          >
            {drawing && index % 6 === 0 ? <span
              className="wall-flicker pointer-events-none absolute inset-0"
              style={{
                borderRadius: "inherit", background: `${accent}66`,
                "--flicker-duration": `${(2 + scatter(index, 21) * 2.4).toFixed(2)}s`,
                "--flicker-delay": `${(scatter(index, 22) * 3).toFixed(2)}s`,
              } as CSSProperties}
            /> : null}
            <span className="relative line-clamp-2">{name}</span>
          </div>;
          return <div key={index} className="min-w-0">{tile}</div>;
        })}
      </div>

      {/* Lampu sorot: dinding yang sama, terang, di-mask lingkaran bergerak. */}
      {!reduceMotion ? <div
        ref={spotRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          ...gridStyle,
          opacity: drawing ? 1 : 0,
          transition: "opacity 500ms ease",
          WebkitMaskImage: "radial-gradient(circle min(22vw, 28vh) at var(--spot-x, 50%) var(--spot-y, 50%), #000 0%, #000 30%, transparent 100%)",
          maskImage: "radial-gradient(circle min(22vw, 28vh) at var(--spot-x, 50%) var(--spot-y, 50%), #000 0%, #000 30%, transparent 100%)",
        }}
      >
        {drawing ? tileNames.map((name, index) => <div key={index} className="min-w-0">
          <div
            className={tileBase}
            style={{
              ...tileText,
              height: `calc(100% - ${2 * Math.max(1, tileH * 0.05)}px)`,
              margin: `${Math.max(1, tileH * 0.05)}px`,
              borderRadius: Math.max(2, tileH * 0.12),
              padding: `0 ${Math.max(1, tileW * 0.04)}px`,
              background: `${accent}59`,
              color: "#FFFFFF",
              boxShadow: `0 0 ${tileH * 0.3}px ${accent}80`,
            }}
          >
            <span className="line-clamp-2">{name}</span>
          </div>
        </div>) : null}
      </div> : null}

      {/* Kartu pemenang. */}
      {showCards ? <div className="absolute inset-0 z-10 flex flex-wrap content-center items-stretch justify-center" style={{ gap: fit.gap, padding: "2%" }}>
        {main.map((winner, index) => {
          const fromTile = winnerTiles[index] >= 0;
          return <motion.div
            key={`${winner.name}-${winner.slot_order}`}
            ref={(element: HTMLDivElement | null) => {
              if (element) cardRefs.current.set(index, element);
              else cardRefs.current.delete(index);
            }}
            initial={fromTile ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...expressive.spatial.slow, delay: cardDelay(index) }}
            className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden text-center"
            style={{
              // zIndex diatur langsung oleh efek terbang di atas.
              width: fit.cardW,
              borderRadius: Math.max(8, fit.font * 0.5),
              padding: `${fit.font * 0.45}px ${fit.font * 0.7}px`,
              background: accent,
              color: onAccent,
              boxShadow: `0 0 0 0.25vw ${onAccent}33, 0 2vh 6vh rgba(0, 0, 0, 0.45), 0 0 8vh ${accent}99`,
            }}
          >
            <p className="font-semibold uppercase" style={{ fontFamily, fontSize: Math.max(9, fit.font * 0.42), lineHeight: 1.3, letterSpacing: "0.2em", opacity: 0.75 }}>
              {main.length === 1 ? "Pemenang" : `Pemenang ${index + 1}`}
            </p>
            <p className="line-clamp-2 max-w-full font-bold tracking-[-0.02em]" style={{ fontFamily, fontSize: fit.font, lineHeight: 1.08, textWrap: "balance" }}>
              {winner.name}
            </p>
            {winner.company || winner.seat ? <p className="max-w-full truncate" style={{ fontFamily, fontSize: Math.max(10, fit.font * 0.58), lineHeight: 1.3, opacity: 0.8 }}>
              {[winner.company, winner.seat && `Kursi ${winner.seat}`].filter(Boolean).join(" · ")}
            </p> : null}
          </motion.div>;
        })}
      </div> : null}
    </div>

    {/* Keterangan di bawah dinding: berapa nama yang tampil, dan cadangan. */}
    <p className="gs-solid mt-[1vh] shrink-0 text-center" style={{ fontFamily, fontSize: "clamp(10px, 1.3vw, 20px)", color: text, opacity: 0.6 }}>
      {showCards && backups.length > 0
        ? `Cadangan: ${backups.map((winner) => winner.name).join(" · ")}`
        : fixed
          // Dinding penuh: ubin bukan orang, jadi tidak ada angka ubin di sini.
          ? (poolSize ? `${poolSize} nama ikut diundi` : "Semua nama ikut diundi")
        : !drawing && step > 0 && step <= WAVES.length + 1
          ? `${litNow.size} nama tersisa`
          : !poolSize
            // Jumlah disembunyikan (Stage display): tanpa angka sama sekali.
            ? "Semua nama ikut diundi"
          : total > shown
            ? `${shown} dari ${total} nama tampil · semua ${total} ikut diundi`
            : `${shown} nama di dinding`}
    </p>
  </div>;
}
