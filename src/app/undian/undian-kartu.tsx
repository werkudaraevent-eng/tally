"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { expressive } from "@/lib/m3/motion";
import { PACK_MAX_CARDS, TIER_HEX, type PackPlan, type TierNumber } from "@/lib/undian-kartu";
import { CardsAnimation, type AnimationProps } from "./undian-animations";
import { GreenScreenContext } from "./undian-stage-fx";
import type { PackCard, PackHud, PackLive } from "./undian-kartu-scene";

// ===========================================================================
// Mesin Kartu (Card machine)
// ===========================================================================
//
// Pembungkus React untuk adegan three.js di undian-kartu-scene.ts. Komponen ini
// hanya menyalurkan prop ke adegan lewat ref (tanpa render ulang per frame) dan
// menggambar HUD: status, hitungan kartu, hadiah kartu yang sedang dibuka (mode
// semua hadiah), dan nama besar di bawah untuk satu kartu dan Grand Prize.
//
// Pemenang cadangan tidak dijadikan kartu. Setelah kartu terakhir duduk, nama
// mereka tampil di satu baris di bawah, seperti "Cadangan" di daftar biasa.
//
// Tanpa WebGL, atau dengan reduced motion: Card reveal (2D), kartu yang sama
// idenya tanpa mesin.

type Three = typeof import("three");
type Loaded = {
  T: Three;
  X: {
    RoomEnvironment: typeof import("three/examples/jsm/environments/RoomEnvironment.js").RoomEnvironment;
    RoundedBoxGeometry: typeof import("three/examples/jsm/geometries/RoundedBoxGeometry.js").RoundedBoxGeometry;
  };
  build: typeof import("./undian-kartu-scene").buildPackScene;
};
let loading: Promise<Loaded> | null = null;

/** Mulai mengunduh three.js dan adegan tanpa menunggu hasilnya. */
export function preloadPack() {
  if (!loading) {
    loading = Promise.all([
      import("three"),
      import("three/examples/jsm/environments/RoomEnvironment.js"),
      import("three/examples/jsm/geometries/RoundedBoxGeometry.js"),
      import("./undian-kartu-scene"),
    ]).then(([T, room, rounded, scene]) => ({
      T,
      X: { RoomEnvironment: room.RoomEnvironment, RoundedBoxGeometry: rounded.RoundedBoxGeometry },
      build: scene.buildPackScene,
    }));
    loading.catch(() => { loading = null; });
  }
  return loading;
}

export type PackAnimationProps = AnimationProps & {
  /** Rencana bungkus dari /api/undian/state (hadiah dan jumlah kartu, tanpa nama). */
  pack?: PackPlan | null;
  /** Nama hadiah aktif, untuk kartu bila rencana belum ada (pratinjau CMS). */
  prizeName?: string;
  /** Warna kartu untuk pratinjau CMS. */
  previewTier?: TierNumber;
  /** Efek suara mesin (Stage display > Sound). */
  sound?: boolean;
  /** Fanfare Grand Prize; mati bila lagu pemenang (Music) sudah berbunyi. */
  fanfare?: boolean;
  /** Judul halaman undian, di papan mesin dan di kartu. */
  title?: string;
};

type Winner = AnimationProps["winners"][number];

/** Pemenang utama dengan hadiah dan warna kartunya, urut sesuai rencana bungkus. */
function packOrder(winners: AnimationProps["winners"], plan: PackPlan | null | undefined, fallback: { prize: string; tier: TierNumber }) {
  const mains = winners.filter((winner) => !winner.is_backup);
  if (!plan || plan.groups.length === 0) return mains.slice(0, PACK_MAX_CARDS).map((winner) => ({ winner, prize: fallback.prize, tier: fallback.tier }));
  const out: { winner: Winner; prize: string; tier: TierNumber }[] = [];
  const used = new Set<number>();
  for (const group of plan.groups) {
    const own = mains
      .map((winner, index) => ({ winner, index }))
      .filter(({ winner, index }) => !used.has(index) && (winner.prize_id === undefined ? plan.groups.length === 1 : winner.prize_id === group.prize_id))
      .sort((a, b) => a.winner.slot_order - b.winner.slot_order);
    for (const { winner, index } of own) {
      used.add(index);
      out.push({ winner, prize: group.prize, tier: group.tier });
    }
  }
  return out.slice(0, PACK_MAX_CARDS);
}

/** Kartu dari pemenang utama, urut sesuai rencana bungkus. */
export function packCards(
  winners: AnimationProps["winners"],
  plan: PackPlan | null | undefined,
  fallback: { prize: string; tier: TierNumber },
): PackCard[] {
  return packOrder(winners, plan, fallback).map(({ winner, prize, tier }) => ({ name: winner.name, prize, tier }));
}

export function PackAnimation(props: PackAnimationProps) {
  const { winners, text, fontFamily, round, pendingCount, pack, prizeName = "", previewTier = 1, sound = true, fanfare = true, title = "" } = props;
  const reduceMotion = useReducedMotion() ?? false;
  const greenScreen = useContext(GreenScreenContext);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [doneRound, setDoneRound] = useState<number | null>(null);

  const fallback = useMemo(() => ({ prize: prizeName, tier: previewTier }), [prizeName, previewTier]);
  const cards = useMemo(() => packCards(winners, pack, fallback), [winners, pack, fallback]);
  const plan = useMemo(() => {
    if (pack && pack.groups.length > 0) return pack.groups.flatMap((group) => Array.from({ length: group.count }, () => ({ prize: group.prize, tier: group.tier })));
    return Array.from({ length: Math.max(1, Math.min(PACK_MAX_CARDS, pendingCount ?? 1)) }, () => ({ prize: fallback.prize, tier: fallback.tier }));
  }, [pack, pendingCount, fallback]);
  const backups = winners.filter((winner) => winner.is_backup);

  const live: PackLive = useRef<PackLive["current"]>({ round, plan, cards, sound, fanfare, title, greenScreen }) as PackLive;
  useEffect(() => {
    live.current = { round, plan, cards, sound, fanfare, title, greenScreen };
  });
  const hudRef = useRef<PackHud>({ status: null, count: null, prize: null, win: null, winName: null, winPrize: null, flash: null, onDone: () => {} });
  useEffect(() => {
    hudRef.current.onDone = (finished) => setDoneRound(finished);
  });
  const skipToEnd = useRef(winners.length > 0);

  useEffect(() => {
    if (reduceMotion) return;
    let disposed = false;
    let cleanup = () => {};
    preloadPack().then(({ T, X, build }) => {
      if (disposed) return;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      try {
        cleanup = build(T, X, canvas, wrap, live, hudRef.current, skipToEnd);
      } catch {
        setFailed(true);
      }
    }).catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [reduceMotion, live]);

  if (failed || reduceMotion) {
    // Card reveal 2D, tetapi tiap kartu tetap membawa hadiah dan warnanya:
    // pada bungkus "semua hadiah" penonton harus bisa membedakan doorprize dari
    // Grand Prize tanpa adegan 3D. Urutannya sama, Grand Prize terakhir.
    const flat = [
      ...packOrder(winners, pack, fallback).map(({ winner, prize, tier }, index) => ({ ...winner, label: prize, tint: TIER_HEX[tier], slot_order: index + 1 })),
      ...backups,
    ];
    return <CardsAnimation {...props} winners={winners.length === 0 ? winners : flat} pendingCount={plan.length} />;
  }

  const hudFont = { fontFamily };
  const showBackups = backups.length > 0 && doneRound === round;
  return <div className="relative h-full w-full min-h-0" style={{ containerType: "size", fontFamily }}>
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ color: text }}>
        <div
          ref={(element) => { hudRef.current.status = element; }}
          className="gs-plate absolute left-[2%] top-[3%] rounded-full px-[1em] py-[0.45em] font-semibold"
          style={{ ...hudFont, fontSize: "clamp(10px, 1.8cqh, 20px)", color: "#FFFFFF", background: "rgba(5, 8, 16, 0.72)", border: "1px solid rgba(255, 255, 255, 0.16)" }}
        />
        <div
          ref={(element) => { hudRef.current.count = element; }}
          className="gs-plate absolute right-[2%] top-[3%] rounded-full px-[0.9em] py-[0.35em] font-bold tabular-nums empty:hidden"
          style={{ ...hudFont, fontSize: "clamp(11px, 2.4cqh, 26px)", color: "#E8C968", background: "rgba(5, 8, 16, 0.72)", border: "1px solid rgba(232, 201, 104, 0.5)" }}
        />
        <div
          ref={(element) => { hudRef.current.prize = element; }}
          className="absolute inset-x-0 top-[3%] text-center font-bold @max-[640px]:top-[calc(3%+3em)]"
          style={{ ...hudFont, fontSize: "clamp(12px, 3.4cqh, 40px)", color: "#E8C968", textShadow: "0 2px 8px rgba(0, 0, 0, 0.6)" }}
        />
        <div
          ref={(element) => { hudRef.current.flash = element; }}
          className="gs-hide absolute inset-0 opacity-0 transition-opacity duration-300"
          style={{ background: "radial-gradient(circle at 50% 50%, rgba(255, 236, 170, 0.9), rgba(255, 236, 170, 0) 60%)" }}
        />
        <div
          ref={(element) => { hudRef.current.win = element; }}
          className="absolute inset-x-0 bottom-[5%] text-center opacity-0 transition-[opacity,transform] duration-[400ms]"
          style={{ transform: "translateY(12px)", textShadow: "0 3px 14px rgba(0, 0, 0, 0.8)" }}
        >
          <b ref={(element) => { hudRef.current.winName = element; }} className="block font-black" style={{ ...hudFont, fontSize: "clamp(20px, 9cqh, 96px)", lineHeight: 1.1 }} />
          <span ref={(element) => { hudRef.current.winPrize = element; }} className="block font-semibold" style={{ ...hudFont, fontSize: "clamp(12px, 3.4cqh, 36px)", lineHeight: 1.4, color: "#FFFFFF" }} />
        </div>
      </div>
    </div>
    <AnimatePresence>
      {showBackups && <motion.p
        key={`cadangan-${round}`}
        className="gs-plate absolute inset-x-[18%] top-[3%] rounded-full px-[1.2em] py-[0.4em] text-center @max-[640px]:inset-x-[4%] @max-[640px]:top-[calc(3%+3.2em)]"
        style={{ ...hudFont, fontSize: "clamp(11px, 2.6cqh, 26px)", color: "#FFFFFF", background: "rgba(5, 8, 16, 0.72)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={expressive.effects.default}
      >
        Cadangan: {backups.map((winner) => winner.name).join(", ")}
      </motion.p>}
    </AnimatePresence>
  </div>;
}
