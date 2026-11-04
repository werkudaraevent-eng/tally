"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { expressive } from "@/lib/m3/motion";
import { readableOn } from "@/lib/color";
import { initialsOf } from "@/lib/undian";
import { WALL_WAVE_MS, type AnimationProps } from "./undian-animations";

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

/** Ukuran dinding setelah tiap gelombang, sebelum gelombang terakhir (pemenang). */
const WAVES = [60, 12];

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

export function WallAnimation({ roster, winners, endsAt, accent, text, fontFamily, round, poolSize }: AnimationProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const drawing = winners.length === 0;
  const main = useMemo(() => winners.filter((winner) => !winner.is_backup), [winners]);
  const backups = useMemo(() => winners.filter((winner) => winner.is_backup), [winners]);

  // Setiap poll membawa array roster baru dengan isi sama; kunci memo pada
  // isinya supaya gelombang sorot tidak diacak ulang di tengah jalan.
  const namesKey = roster.map((item) => item.name).join("\u0000");
  const names = useMemo(() => (namesKey === "" ? [] : namesKey.split("\u0000")), [namesKey]);
  const initialsWall = useMemo(() => names.length > 0 && names.every((name) => /^(\S\.){1,2}$/u.test(name)), [names]);

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
  const { columns, tileW, tileH } = layoutFor(names.length, box.width, box.height);
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
    const used = new Set<number>();
    return main.map((winner) => {
      const target = initialsWall ? initialsOf(winner.name) : winner.name;
      const index = names.findIndex((name, i) => !used.has(i) && name === target);
      if (index >= 0) used.add(index);
      return index;
    });
    // `mainKey` mewakili isi `main`: array-nya dibangun ulang setiap poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainKey, names, initialsWall]);

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
    const all = names.map((_, index) => index);
    const keep = winnerTiles.filter((index) => index >= 0);
    const sets: Set<number>[] = [new Set(all)];
    let alive = all;
    for (const size of WAVES) {
      alive = alive.length > size ? survivors(alive, size, keep) : alive;
      sets.push(new Set(alive));
    }
    sets.push(new Set(keep));
    return sets;
  }, [names, winnerTiles]);
  const litNow = lit[Math.min(step, lit.length - 1)];
  const showCards = !drawing && step >= WAVES.length + 2;

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
  const nameSize = cardCount === 1 ? "clamp(28px, 6.4vw, 120px)"
    : cardCount <= 3 ? "clamp(18px, 3.4vw, 60px)"
    : cardCount <= 6 ? "clamp(14px, 2.3vw, 40px)"
    : "clamp(11px, 1.6vw, 28px)";
  const subSize = cardCount === 1 ? "clamp(12px, 1.8vw, 30px)" : "clamp(9px, 1.15vw, 18px)";
  const shown = names.length;
  const total = poolSize ?? shown;

  return <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden px-[3vw] py-[1.5vh]">
    <div ref={boxRef} className="relative min-h-0 w-full flex-1">
      {/* Dinding redup: semua nama, selalu terpasang. */}
      <div aria-hidden className="absolute inset-0" style={{ ...gridStyle, opacity: showCards ? 0.28 : 1, transition: "opacity 600ms ease" }}>
        {names.map((name, index) => {
          const on = litNow.has(index);
          const hot = !drawing && step > 0 && on;
          const winnerAt = winnerTiles.indexOf(index);
          const final = !drawing && step === WAVES.length + 1 && winnerAt >= 0;
          const tile = <div
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
              transition: reduceMotion ? "none" : `opacity 520ms ease ${(scatter(index, round) * 600).toFixed(0)}ms, transform 520ms ease, background 400ms ease, box-shadow 400ms ease`,
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
          // Ubin pemenang berbagi layoutId dengan kartunya: framer menerbangkan
          // kartu dari posisi ubin ini ke tengah.
          return winnerAt >= 0 && !showCards
            ? <motion.div key={index} layoutId={`wall-${round}-${winnerAt}`} className="min-w-0">{tile}</motion.div>
            : <div key={index} className="min-w-0">{tile}</div>;
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
        {drawing ? names.map((name, index) => <div key={index} className="min-w-0">
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
      {showCards ? <div className="absolute inset-0 z-10 flex flex-wrap content-center items-center justify-center gap-[1.6vw] px-[2vw]">
        {main.map((winner, index) => {
          const fromTile = winnerTiles[index] >= 0;
          return <motion.div
            key={`${winner.name}-${winner.slot_order}`}
            layoutId={fromTile ? `wall-${round}-${index}` : undefined}
            initial={fromTile ? undefined : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...expressive.spatial.slow, delay: Math.min(index * 0.22, 1.2) }}
            className="flex min-w-0 max-w-[90%] flex-col items-center justify-center text-center"
            style={{
              borderRadius: "1.2vw",
              padding: cardCount === 1 ? "3vh 3.4vw" : "1.6vh 1.8vw",
              background: accent,
              color: onAccent,
              boxShadow: `0 0 0 0.25vw ${onAccent}33, 0 2vh 6vh rgba(0, 0, 0, 0.45), 0 0 8vh ${accent}99`,
            }}
          >
            <p className="font-semibold uppercase" style={{ fontFamily, fontSize: "clamp(9px, 1vw, 16px)", letterSpacing: "0.28em", opacity: 0.75 }}>
              {main.length === 1 ? "Pemenang" : `Pemenang ${index + 1}`}
            </p>
            <p className="max-w-full font-bold tracking-[-0.02em]" style={{ fontFamily, fontSize: nameSize, lineHeight: 1.05, marginTop: "0.8vh", textWrap: "balance" }}>
              {winner.name}
            </p>
            {winner.company || winner.seat ? <p className="max-w-full truncate" style={{ fontFamily, fontSize: subSize, opacity: 0.8, marginTop: "0.6vh" }}>
              {[winner.company, winner.seat && `Kursi ${winner.seat}`].filter(Boolean).join(" · ")}
            </p> : null}
          </motion.div>;
        })}
      </div> : null}
    </div>

    {/* Keterangan di bawah dinding: berapa nama yang tampil, dan cadangan. */}
    <p className="mt-[1vh] shrink-0 text-center" style={{ fontFamily, fontSize: "clamp(10px, 1.3vw, 20px)", color: text, opacity: 0.6 }}>
      {showCards && backups.length > 0
        ? `Cadangan: ${backups.map((winner) => winner.name).join(" · ")}`
        : !drawing && step > 0 && step <= WAVES.length
          ? `${litNow.size} nama tersisa`
          : total > shown
            ? `${shown} dari ${total} nama tampil · semua ${total} ikut diundi`
            : `${shown} nama di dinding`}
    </p>
  </div>;
}
