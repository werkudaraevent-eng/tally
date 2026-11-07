"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { expressive } from "@/lib/m3/motion";
import {
  ARENA_CYCLE_MS, ARENA_FALL_MS, ARENA_FINAL_FALL_MS, ARENA_FINAL_RUN_MS, ARENA_FINAL_WARN_MS, ARENA_LIST_MS,
  ARENA_PODIUM_MS, ARENA_RUN_MS, ARENA_WARN_MS, WinnerList, type AnimationProps,
} from "./undian-animations";
import { WallAnimation } from "./undian-wall";

// ===========================================================================
// Arena Gugur (3D)
// ===========================================================================
//
// Seluruh kolam berdiri sebagai kerumunan di arena petak segi enam. Tiap babak
// semua orang berlarian pindah petak, sebagian petak menyala merah, lalu runtuh
// bersama orang di atasnya. Angka TERSISA turun babak demi babak. Begitu
// tinggal sekitar 12 orang, nama muncul di atas kepala; babak final lebih lama,
// lalu petak pemenang meluncur menjadi podium emas (Hanung, 7 Nov: konsep
// "kerumunan menyusut sampai pemenang", gaya Lantai runtuh). Desainnya
// orisinal: yang diambil hanya mekanik gugur bertahap, bukan tampilan atau
// karakter acara mana pun.
//
// Kontraknya sama dengan varian lain: komponen ini TIDAK tahu pemenang sebelum
// `winners` terisi. Selama mengundi, orang-orangnya belum bernama, jadi siapa
// yang jatuh tidak berarti apa-apa. Saat `winners` datang, pemenang dipasang
// pada orang yang masih berdiri, lalu dua babak terakhir (ARENA_* di
// undian-animations) menyisakan mereka. Nama baru tampil sesudah itu.
//
// Kerumunan dibatasi 500 orang (roster dari /api/undian/control). Kolam yang
// lebih besar tetap terbaca di angka TERSISA, yang dihitung dari pool_size.
//
// three.js dimuat dinamis (modul yang sama dengan Tabung bola dan Dart). Tanpa
// WebGL, atau dengan reduced motion, layar memakai Spotlight wall: gelombang
// padam yang sama idenya, dalam 2D.

type Three = typeof import("three");
let threeModule: Promise<Three> | null = null;

/** Mulai mengunduh three.js tanpa menunggu hasilnya. */
export function preloadArena() {
  if (!threeModule) threeModule = import("three");
  return threeModule;
}

/** Batas pemenang per undi; sama dengan ANIMATION_MAX_WINNERS di lib/undian. */
const ARENA_MAX = 20;
/** Orang di arena paling banyak, sama dengan batas roster panggung. */
const CROWD_MAX = 500;
/** Nama tampil di atas kepala bila orang yang tersisa sebanyak ini atau kurang. */
const LABEL_AT = 12;
/** Podium dengan nama di atas kepala; di atasnya cukup cincin emas, nama ada di daftar. */
const PODIUM_NAMES_MAX = 5;
const HEX = 1.15;
const GOLD = "#E8C968";
const SHIRTS = ["#ff5d73", "#4cc9f0", "#ffd166", "#06d6a0", "#b388ff", "#ff9f1c", "#f15bb5", "#80ed99", "#a0c4ff", "#e9ecef", "#3a86ff", "#ffadad"];
const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
/** Tujuh posisi berdiri di satu petak: tengah dan enam di sekelilingnya. */
const SLOT: [number, number][] = [[0, 0], ...Array.from({ length: 6 }, (_, k): [number, number] => [Math.sin(k * Math.PI / 3 + Math.PI / 6) * 0.58, Math.cos(k * Math.PI / 3 + Math.PI / 6) * 0.58])];

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Berapa orang yang masih berdiri saat pemenang datang. Cukup banyak supaya dua
 * babak terakhir terasa sebagai babak (bukan sekadar sisa), dan tidak pernah
 * kurang dari jumlah pemenang.
 */
export function arenaFloor(crowd: number, winners: number) {
  return Math.min(crowd, Math.max(winners + 6, 24));
}

/**
 * Sisa orang setelah tiap babak selama mengundi: menurun geometris dari
 * `crowd` ke `floor` dalam `rounds` babak.
 */
export function arenaPlan(crowd: number, floor: number, rounds: number): number[] {
  if (rounds <= 0 || crowd <= floor) return [];
  const out: number[] = [];
  let previous = crowd;
  for (let i = 1; i <= rounds; i += 1) {
    let next = i === rounds ? floor : Math.round(crowd * (floor / crowd) ** (i / rounds) * (0.94 + Math.random() * 0.12));
    next = Math.max(floor + (rounds - i), Math.min(previous - 1, next));
    out.push(next);
    previous = next;
  }
  return out;
}

/** Babak selama mengundi yang muat di durasi undi, paling banyak sampai lantai. */
export function arenaSpinRounds(crowd: number, floor: number, spinMs: number | null) {
  if (crowd <= floor) return 0;
  // Tiap babak memangkas paling banyak ~55%, supaya kerumunan terasa menyusut,
  // bukan lenyap.
  const needed = Math.max(1, Math.ceil(Math.log(crowd / floor) / Math.log(2.2)));
  if (spinMs === null) return needed;
  return clamp(Math.floor((spinMs - 600) / ARENA_CYCLE_MS), 1, needed);
}

type Live = {
  current: {
    names: string[];
    mains: string[];
    pending: number;
    endsAt: number | null;
    round: number;
    poolSize: number;
    fontFamily: string;
  };
};
type Hud = {
  count: HTMLElement | null;
  countWrap: HTMLElement | null;
  countLabel: HTMLElement | null;
  countSub: HTMLElement | null;
  status: HTMLElement | null;
  flash: HTMLElement | null;
};

export function ArenaAnimation(props: AnimationProps) {
  const { roster, winners, accent, text, fontFamily, round, endsAt, pendingCount, poolSize = 0 } = props;
  const reduceMotion = useReducedMotion() ?? false;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<Hud>({ count: null, countWrap: null, countLabel: null, countSub: null, status: null, flash: null });
  const [failed, setFailed] = useState(false);
  const mains = useMemo(() => winners.filter((winner) => !winner.is_backup).slice(0, ARENA_MAX).map((winner) => winner.name), [winners]);
  const namesKey = roster.map((item) => item.name).join("\u0000");
  const names = useMemo(() => (namesKey === "" ? [] : namesKey.split("\u0000")), [namesKey]);

  const live = useRef({ names, mains, pending: pendingCount ?? 1, endsAt, round, poolSize, fontFamily });
  useEffect(() => {
    live.current = { names, mains, pending: pendingCount ?? 1, endsAt, round, poolSize, fontFamily };
  });

  // Daftar pemenang (termasuk cadangan) tampil setelah podium berhenti.
  const [listRound, setListRound] = useState<number | null>(() => (winners.length > 0 ? round : null));
  const hasWinners = winners.length > 0;
  const showList = hasWinners && (listRound === round || failed);
  useEffect(() => {
    if (!hasWinners || listRound === round) return;
    const timer = window.setTimeout(() => setListRound(round), ARENA_LIST_MS);
    return () => window.clearTimeout(timer);
  }, [hasWinners, round, listRound]);
  const skipReveal = useRef(winners.length > 0);

  useEffect(() => {
    if (reduceMotion) return;
    let disposed = false;
    let cleanup = () => {};
    preloadArena().then((T) => {
      if (disposed) return;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      try {
        cleanup = buildScene(T, canvas, wrap, live, skipReveal, hudRef.current);
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
  }, [reduceMotion]);

  // Tanpa WebGL atau dengan reduced motion: Spotlight wall, gelombang padam dalam 2D.
  if (failed || reduceMotion) return <WallAnimation {...props} />;

  const hudFont = { fontFamily };
  return <div className="relative h-full w-full min-h-0" style={{ containerType: "size", fontFamily }}>
    <motion.div
      ref={wrapRef}
      className="absolute inset-0"
      animate={{ opacity: showList ? 0.22 : 1 }}
      transition={{ duration: 0.5 }}
    >
      <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />
      {/* Papan TERSISA dan status babak. Teksnya ditulis langsung oleh loop
          gambar (tanpa render React per frame). */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ color: text }}>
        <div
          ref={(element) => { hudRef.current.status = element; }}
          className="gs-plate absolute left-[2%] top-[3%] rounded-full px-[1em] py-[0.45em] font-semibold transition-colors duration-200"
          style={{ ...hudFont, fontSize: "clamp(10px, 1.6cqh, 20px)", color: "#FFFFFF", background: "rgba(5, 12, 26, 0.72)", border: "1px solid rgba(255, 255, 255, 0.16)" }}
        />
        <div
          ref={(element) => { hudRef.current.countWrap = element; }}
          className="absolute right-[2%] top-[2%] text-right"
          style={{ ...hudFont, letterSpacing: "0.16em" }}
        >
          <span ref={(element) => { hudRef.current.countLabel = element; }} className="gs-solid block font-semibold" style={{ fontSize: "clamp(9px, 1.5cqh, 18px)", opacity: 0.75 }}>TERSISA</span>
          <b ref={(element) => { hudRef.current.count = element; }} className="block font-bold tabular-nums" style={{ fontSize: "clamp(26px, 9cqh, 112px)", lineHeight: 1, letterSpacing: "-0.02em" }} />
          <span ref={(element) => { hudRef.current.countSub = element; }} className="gs-solid block tabular-nums" style={{ fontSize: "clamp(9px, 1.4cqh, 16px)", opacity: 0.7 }} />
        </div>
        <div
          ref={(element) => { hudRef.current.flash = element; }}
          className="absolute inset-x-0 top-[40%] text-center font-extrabold opacity-0 transition-opacity duration-300"
          style={{ ...hudFont, fontSize: "clamp(22px, 9cqh, 104px)", lineHeight: 1, color: "#FFFFFF", textShadow: "0 0.08em 0.35em rgba(0, 0, 0, 0.6)" }}
        />
      </div>
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

type Person = {
  index: number;
  x: number; y: number; z: number;
  fx: number; fz: number; tx: number; tz: number;
  face: number; tilt: number; spin: number; phase: number; vy: number;
  tile: number;
  alive: boolean; falling: boolean; gone: boolean;
  winner: boolean; win: boolean;
  label: import("three").Sprite | null;
};
type Tile = { x: number; z: number; y: number; vy: number; rot: number; spin: number; alive: boolean; dropping: boolean; gone: boolean; flash: number; gold: boolean };
type Round = {
  start: number; run: number; warn: number; fall: number; pulses: number;
  movers: Person[]; drop: number[]; losers: Person[]; fake: number[];
  keep: number; final: boolean; dropped: boolean; title: string; labelsAfter: boolean;
};

function buildScene(T: Three, canvas: HTMLCanvasElement, wrap: HTMLElement, live: Live, skipReveal: { current: boolean }, hud: Hud) {
  const view = wrap.ownerDocument.defaultView ?? window;
  const doc = wrap.ownerDocument;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, Math.max(1.25, view.devicePixelRatio || 1)));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const disposables: { dispose: () => void }[] = [];
  const keep = <D extends { dispose: () => void }>(item: D) => {
    disposables.push(item);
    return item;
  };

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 16 / 9, 0.1, 400);
  scene.add(new T.HemisphereLight(0xc8d6ff, 0x1a1024, 1.0));
  const key = new T.DirectionalLight(0xfff3dc, 2.0);
  key.position.set(-14, 30, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, far: 90 });
  scene.add(key);

  const tileGeometry = keep(new T.CylinderGeometry(HEX * 0.95, HEX * 0.88, 0.5, 6));
  const tileMaterial = keep(new T.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 }));
  const bodyGeometry = keep(new T.CapsuleGeometry(0.2, 0.42, 4, 10));
  bodyGeometry.translate(0, 0.55, 0);
  const headGeometry = keep(new T.SphereGeometry(0.16, 14, 10));
  headGeometry.translate(0, 1.07, 0);
  const bodyMaterial = keep(new T.MeshStandardMaterial({ roughness: 0.6 }));
  const headMaterial = keep(new T.MeshStandardMaterial({ roughness: 0.7 }));
  const ringMaterial = keep(new T.MeshBasicMaterial({ color: GOLD, toneMapped: false }));
  const ringGeometry = keep(new T.TorusGeometry(0.45, 0.06, 8, 32));
  const bulbGeometry = keep(new T.SphereGeometry(0.18, 8, 6));
  const bulbMaterial = keep(new T.MeshBasicMaterial({ color: 0xffe9a8 }));
  const TILE_A = new T.Color("#2b3a5c");
  const TILE_B = new T.Color("#3e5385");
  const RED = new T.Color("#ff2a3d");
  const GOLD_C = new T.Color(GOLD);
  const scratch = new T.Color();

  const m4 = new T.Matrix4();
  const quat = new T.Quaternion();
  const euler = new T.Euler();
  const scale = new T.Vector3();
  const pos = new T.Vector3();

  let tiles: Tile[] = [];
  let people: Person[] = [];
  let tileMesh: import("three").InstancedMesh | null = null;
  let bodyMesh: import("three").InstancedMesh | null = null;
  let headMesh: import("three").InstancedMesh | null = null;
  let ringMesh: import("three").InstancedMesh | null = null;
  let bulbs: import("three").InstancedMesh | null = null;
  let labels: import("three").Sprite[] = [];
  let arenaR = 10;
  let crowd = 0;

  const dropLabel = (sprite: import("three").Sprite) => {
    scene.remove(sprite);
    sprite.material.map?.dispose();
    sprite.material.dispose();
  };
  const clearLabels = () => {
    for (const sprite of labels) dropLabel(sprite);
    labels = [];
    for (const person of people) person.label = null;
  };

  const nameSprite = (name: string, big: boolean) => {
    const paper = doc.createElement("canvas");
    const fontSize = big ? 64 : 42;
    // Huruf judul panggung bisa berupa CSS variable (next/font); canvas tidak
    // mengenalnya, jadi pakai nilai yang sudah dihitung browser.
    const family = view.getComputedStyle(wrap).fontFamily || "sans-serif";
    const font = `${big ? 700 : 600} ${fontSize}px ${family}`;
    const probe = paper.getContext("2d");
    if (!probe) return null;
    probe.font = font;
    const text = name.length > 28 ? `${name.slice(0, 27)}…` : name;
    const width = Math.ceil(probe.measureText(text).width) + fontSize * 1.4;
    paper.width = width;
    paper.height = Math.round(fontSize * 1.9);
    const pen = paper.getContext("2d");
    if (!pen) return null;
    pen.fillStyle = big ? GOLD : "rgba(5, 12, 26, 0.92)";
    pen.beginPath();
    pen.roundRect(2, 2, width - 4, paper.height - 4, paper.height / 2);
    pen.fill();
    if (!big) {
      pen.strokeStyle = "rgba(255, 255, 255, 0.4)";
      pen.lineWidth = 3;
      pen.stroke();
    }
    pen.fillStyle = big ? "#0B182D" : "#FFFFFF";
    pen.font = font;
    pen.textBaseline = "middle";
    pen.textAlign = "center";
    pen.fillText(text, width / 2, paper.height / 2 + 2);
    const texture = new T.CanvasTexture(paper);
    texture.colorSpace = T.SRGBColorSpace;
    // Ukuran tetap di layar (bukan di dunia 3D): nama tetap terbaca saat kamera
    // menjauh, dan tidak membesar menutupi kepala saat kamera mendekat.
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true, toneMapped: false, sizeAttenuation: false }));
    const screenShare = big ? 0.075 : 0.065;
    const height = screenShare * 2 * Math.tan((camera.fov * Math.PI) / 360);
    sprite.scale.set(height * width / paper.height, height, 1);
    sprite.renderOrder = big ? 12 : 10;
    scene.add(sprite);
    labels.push(sprite);
    return sprite;
  };

  const build = (count: number) => {
    clearLabels();
    for (const mesh of [tileMesh, bodyMesh, headMesh, ringMesh, bulbs]) {
      if (!mesh) continue;
      scene.remove(mesh);
      mesh.dispose();
    }
    crowd = count;
    let ring = 1;
    while (3 * ring * (ring + 1) + 1 < count / 3.2) ring += 1;
    tiles = [];
    for (let q = -ring; q <= ring; q += 1) {
      for (let r = Math.max(-ring, -q - ring); r <= Math.min(ring, -q + ring); r += 1) {
        tiles.push({ x: HEX * Math.sqrt(3) * (q + r / 2), z: HEX * 1.5 * r, y: 0, vy: 0, rot: 0, spin: 0, alive: true, dropping: false, gone: false, flash: 0, gold: false });
      }
    }
    arenaR = Math.sqrt(3) * HEX * (ring + 0.6);
    tileMesh = new T.InstancedMesh(tileGeometry, tileMaterial, tiles.length);
    tileMesh.receiveShadow = true;
    scene.add(tileMesh);

    bulbs = new T.InstancedMesh(bulbGeometry, bulbMaterial, 72);
    for (let i = 0; i < 72; i += 1) {
      const angle = (i / 72) * Math.PI * 2;
      m4.makeTranslation(Math.cos(angle) * (arenaR + 3), -0.4, Math.sin(angle) * (arenaR + 3));
      bulbs.setMatrixAt(i, m4);
    }
    scene.add(bulbs);

    bodyMesh = new T.InstancedMesh(bodyGeometry, bodyMaterial, Math.max(1, count));
    headMesh = new T.InstancedMesh(headGeometry, headMaterial, Math.max(1, count));
    bodyMesh.castShadow = true;
    headMesh.castShadow = true;
    scene.add(bodyMesh, headMesh);
    ringMesh = new T.InstancedMesh(ringGeometry, ringMaterial, ARENA_MAX);
    ringMesh.count = 0;
    scene.add(ringMesh);

    const slots = shuffle(tiles.flatMap((_, tile) => SLOT.map((__, slot): [number, number] => [tile, slot]))).slice(0, count);
    people = slots.map(([tile, slot], index) => {
      const at = tiles[tile];
      const x = at.x + SLOT[slot][0] * HEX + (Math.random() - 0.5) * 0.16;
      const z = at.z + SLOT[slot][1] * HEX + (Math.random() - 0.5) * 0.16;
      bodyMesh?.setColorAt(index, scratch.set(SHIRTS[index % SHIRTS.length]));
      headMesh?.setColorAt(index, scratch.set(SKIN[(index * 7) % SKIN.length]));
      return {
        index, x, y: 0.25, z, fx: x, fz: z, tx: x, tz: z,
        face: Math.random() * Math.PI * 2, tilt: 0, spin: (Math.random() - 0.5) * 6, phase: Math.random() * Math.PI * 2, vy: 0,
        tile, alive: true, falling: false, gone: false, winner: false, win: false, label: null,
      };
    });
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
    cam.r = arenaR;
    cam.tx = 0;
    cam.tz = 0;
    cam.podium = 0;
    camGoal.podium = 0;
    camGoal.r = arenaR;
    camGoal.tx = 0;
    camGoal.tz = 0;
    orbitOn = true;
  };

  // ---- Kamera: mengorbit pelan, mengikuti sisa kerumunan ----
  // `podium`: 0 selama babak, 1 saat podium; kamera turun lebih landai
  // supaya pemenang terlihat dari depan, bukan dari atas.
  const cam = { r: 10, tx: 0, tz: 0, podium: 0 };
  const camGoal = { r: 10, tx: 0, tz: 0, podium: 0 };
  let orbit = 0;
  let orbitOn = true;
  const placeCamera = (dt: number) => {
    const k = 1 - Math.exp(-dt * (camGoal.podium > 0 ? 2.6 : 1.4));
    cam.r += (camGoal.r - cam.r) * k;
    cam.tx += (camGoal.tx - cam.tx) * k;
    cam.tz += (camGoal.tz - cam.tz) * k;
    cam.podium += (camGoal.podium - cam.podium) * k;
    const wide = camera.aspect > 2.2;
    const elevation = (wide ? 0.55 : 0.78) * (1 - cam.podium) + 0.42 * cam.podium;
    const fit = Math.max(cam.r, 2.2);
    const vfov = (camera.fov * Math.PI) / 180;
    const needV = fit * 2 * Math.sin(elevation) + 1.2;
    const needH = (fit * 2) / camera.aspect;
    // Layar LED 3:1 pendek: arena dilihat lebih landai dan dari lebih jauh
    // supaya tepi depan tidak terpotong di bawah.
    const distance = (Math.max(needV, needH) / (2 * Math.tan(vfov / 2))) * (wide ? 1.5 - 0.75 * cam.podium : 1.3) + fit * 0.35;
    if (orbitOn) orbit += dt * 0.05;
    camera.position.set(cam.tx + Math.sin(orbit) * distance * Math.cos(elevation), distance * Math.sin(elevation), cam.tz + Math.cos(orbit) * distance * Math.cos(elevation));
    camera.lookAt(cam.tx, (wide ? 0.2 : -0.3 - fit * 0.06) * (1 - cam.podium) + 0.75 * cam.podium, cam.tz);
  };
  const frameAlive = () => {
    const alive = people.filter((person) => person.alive);
    if (alive.length === 0) return;
    let cx = 0;
    let cz = 0;
    for (const person of alive) { cx += person.tx; cz += person.tz; }
    cx /= alive.length;
    cz /= alive.length;
    let radius = 0;
    for (const person of alive) radius = Math.max(radius, Math.hypot(person.tx - cx, person.tz - cz));
    camGoal.r = radius + 1.6;
    camGoal.tx = cx;
    camGoal.tz = cz;
  };

  // ---- HUD ----
  let shownCount = -1;
  let countFrom = 0;
  let countTo = 0;
  let countAt = 0;
  let flashUntil = 0;
  const display = (alive: number) => {
    // Kerumunan dibatasi 500; angka di papan mengikuti besar kolam sebenarnya
    // sampai sisa sedikit, lalu sama persis dengan orang di layar.
    const pool = live.current.poolSize;
    if (pool <= crowd || alive <= LABEL_AT) return alive;
    return Math.max(alive, Math.round((alive / crowd) * pool));
  };
  /** Stage display > Show the number in the draw. Mati: tidak ada angka kerumunan di layar. */
  const counts = () => live.current.poolSize > 0;
  const setStatus = (value: string, warn = false) => {
    if (!hud.status) return;
    if (hud.status.textContent !== value) hud.status.textContent = value;
    hud.status.style.background = warn ? "#C62828" : "rgba(5, 12, 26, 0.72)";
    hud.status.style.borderColor = warn ? "#FF8A80" : "rgba(255, 255, 255, 0.16)";
  };
  const setCount = (alive: number, now: number) => {
    countFrom = shownCount < 0 ? display(alive) : shownCount;
    countTo = display(alive);
    countAt = now;
  };
  const flash = (big: string, small: string, now: number, ms: number) => {
    if (!hud.flash) return;
    hud.flash.innerHTML = "";
    hud.flash.append(doc.createTextNode(big));
    if (small) {
      const line = doc.createElement("small");
      line.style.cssText = "display:block;font-size:0.3em;letter-spacing:0.2em;margin-top:0.5em;opacity:0.85";
      line.textContent = small;
      hud.flash.append(line);
    }
    hud.flash.style.opacity = "1";
    flashUntil = now + ms;
  };
  const tickHud = (now: number) => {
    const showCount = live.current.poolSize > 0;
    if (hud.countWrap) hud.countWrap.style.visibility = showCount ? "visible" : "hidden";
    const k = clamp((now - countAt) / 900);
    const value = Math.round(countFrom + (countTo - countFrom) * easeInOut(k));
    if (value !== shownCount && hud.count) {
      hud.count.textContent = String(value);
      shownCount = value;
    }
    if (hud.flash && flashUntil > 0 && now > flashUntil) {
      hud.flash.style.opacity = "0";
      flashUntil = 0;
    }
  };

  // ---- Babak ----
  const aliveTiles = () => tiles.map((_, index) => index).filter((index) => tiles[index].alive);
  /** Petak yang selamat: beberapa "pulau" acak, petak terdekat ke pulau bertahan. */
  const chooseSafe = (from: number[], count: number, few: boolean) => {
    if (count >= from.length) return from.slice();
    const seeds = shuffle(from).slice(0, few ? 1 : clamp(Math.round(count / 4), 1, 6));
    return from
      .map((tile): [number, number] => [tile, Math.min(...seeds.map((seed) => Math.hypot(tiles[tile].x - tiles[seed].x, tiles[tile].z - tiles[seed].z))) + Math.random() * 1.4])
      .sort((a, b) => a[1] - b[1])
      .slice(0, count)
      .map(([tile]) => tile);
  };
  /** Pindahkan sekelompok orang ke posisi berdiri di petak-petak itu. `spread`: satu orang per petak dulu. */
  const assign = (group: Person[], tileIds: number[], spread: boolean) => {
    if (tileIds.length === 0) return;
    const slots: [number, number][] = [];
    if (spread) for (let slot = 0; slot < SLOT.length; slot += 1) for (const tile of shuffle(tileIds)) slots.push([tile, slot]);
    else for (const tile of tileIds) for (let slot = 0; slot < SLOT.length; slot += 1) slots.push([tile, slot]);
    const order = spread ? slots : shuffle(slots);
    group.forEach((person, index) => {
      const [tile, slot] = order[index % order.length];
      person.tile = tile;
      person.fx = person.x;
      person.fz = person.z;
      person.tx = tiles[tile].x + SLOT[slot][0] * HEX + (Math.random() - 0.5) * 0.14;
      person.tz = tiles[tile].z + SLOT[slot][1] * HEX + (Math.random() - 0.5) * 0.14;
      const heading = Math.atan2(person.tx - person.fx, person.tz - person.fz);
      if (Number.isFinite(heading) && Math.hypot(person.tx - person.fx, person.tz - person.fz) > 0.05) person.face = heading;
    });
  };

  /**
   * Siapkan satu babak: sisakan `keep` orang. `losers` boleh ditentukan dari
   * luar (babak sesudah pemenang datang); tanpa itu dipilih acak. `keep` sama
   * dengan jumlah yang hidup berarti babak gertakan: lantai menyala, tidak ada
   * yang runtuh.
   */
  const startRound = (now: number, keepCount: number, options: { final?: boolean; title: string; run?: number; warn?: number; fall?: number; protect?: Person[]; labelsAfter?: boolean }): Round => {
    const alive = people.filter((person) => person.alive);
    const keepN = clamp(keepCount, 1, alive.length);
    const protect = new Set(options.protect ?? []);
    const pool = shuffle(alive.filter((person) => !protect.has(person)));
    const losers = pool.slice(0, alive.length - keepN);
    const loserSet = new Set(losers);
    const survivors = alive.filter((person) => !loserSet.has(person));
    const open = aliveTiles();
    const cap = SLOT.length;
    let drop: number[] = [];
    let fake: number[] = [];
    if (losers.length > 0) {
      // Sedikit orang: satu orang per petak dulu, supaya arena tidak menyusut
      // menjadi segelintir petak penuh sesak sebelum babak final.
      const few = keepN <= 30;
      let safeCount = Math.round((open.length * keepN) / alive.length);
      safeCount = clamp(safeCount, Math.ceil(keepN / cap), open.length - Math.ceil(losers.length / cap));
      if (few) safeCount = clamp(Math.max(safeCount, keepN), 1, open.length - Math.ceil(losers.length / cap));
      if (options.final) safeCount = Math.min(keepN, open.length - 1);
      const safe = chooseSafe(open, Math.max(1, safeCount), few);
      const safeSet = new Set(safe);
      drop = open.filter((tile) => !safeSet.has(tile));
      assign(survivors, safe, few);
      assign(losers, drop, false);
    } else {
      // Gertakan: semua pindah, sebagian petak menyala lalu padam lagi.
      const target = alive.length <= 20
        ? chooseSafe(open, Math.min(open.length, Math.max(alive.length, Math.ceil(open.length * 0.6))), false)
        : open;
      assign(alive, target, alive.length <= 20);
      const used = new Set(alive.map((person) => person.tile));
      const empty = open.filter((tile) => !used.has(tile));
      fake = shuffle(empty.length > 0 ? empty : open).slice(0, Math.max(1, Math.round(open.length * 0.25)));
    }
    if (keepN <= 20) frameAlive();
    return {
      start: now,
      run: options.run ?? ARENA_RUN_MS,
      warn: options.warn ?? ARENA_WARN_MS,
      fall: options.fall ?? ARENA_FALL_MS,
      pulses: options.final ? 5 : 3,
      movers: alive, drop, losers, fake,
      keep: keepN, final: options.final ?? false, dropped: false, title: options.title,
      labelsAfter: options.labelsAfter ?? false,
    };
  };

  let walking = 0;
  /** Jalankan babak sampai waktu `now`. Mengembalikan true bila babak selesai. */
  const stepRound = (current: Round, now: number) => {
    const t = now - current.start;
    if (t < current.run) {
      const k = easeInOut(clamp(t / current.run));
      walking = Math.sqrt(Math.sin(clamp(t / current.run) * Math.PI));
      for (const person of current.movers) {
        if (!person.alive) continue;
        person.x = person.fx + (person.tx - person.fx) * k;
        person.z = person.fz + (person.tz - person.fz) * k;
      }
      return false;
    }
    walking = 0;
    if (t < current.run + current.warn) {
      for (const person of current.movers) {
        person.x = person.tx;
        person.z = person.tz;
      }
      const k = (t - current.run) / current.warn;
      const glow = 0.25 + 0.75 * Math.abs(Math.sin(k * Math.PI * current.pulses));
      for (const tile of current.drop) tiles[tile].flash = glow;
      for (const tile of current.fake) tiles[tile].flash = k > 0.8 ? glow * (1 - (k - 0.8) / 0.2) : glow;
      return false;
    }
    if (!current.dropped) {
      current.dropped = true;
      for (const tile of current.fake) tiles[tile].flash = 0;
      for (const index of current.drop) {
        const tile = tiles[index];
        tile.alive = false;
        tile.dropping = true;
        tile.vy = -Math.random();
        tile.flash = 1;
        tile.spin = (Math.random() - 0.5) * 2;
      }
      for (const person of current.losers) {
        person.alive = false;
        person.falling = true;
        person.vy = 1.5 + Math.random() * 2;
      }
      setCount(people.filter((person) => person.alive).length, now);
      if (current.losers.length > 0 && !current.final) {
        if (counts()) flash(`−${display(current.losers.length + current.keep) - display(current.keep)}`, "GUGUR", now, 1100);
        else flash("GUGUR", "", now, 1100);
      }
      if (current.losers.length === 0 && !current.final) flash("Aman!", "", now, 900);
      if (current.labelsAfter) labelSurvivors();
      frameAlive();
    }
    return t >= current.run + current.warn + current.fall;
  };

  /** Pasang nama di atas kepala semua yang masih berdiri. */
  const assigned = new Map<Person, string>();
  const labelSurvivors = () => {
    for (const person of people) {
      if (!person.alive || person.label) continue;
      const name = assigned.get(person);
      if (!name) continue;
      person.label = nameSprite(name, false);
    }
  };

  // ---- Alur ----
  let built = -1;
  let builtFor = "";
  let current: Round | null = null;
  let plan: number[] = [];
  let planned = false;
  let spinStart = 0;
  let roundNo = 0;
  let revealAt: number | null = null;
  let revealStep = 0;
  let podium: { from: [number, number][]; to: [number, number][]; offset: [number, number][]; winners: Person[] } | null = null;

  const restart = (now: number) => {
    const { names, round } = live.current;
    built = round;
    builtFor = names.length > 0 ? "names" : "empty";
    build(Math.max(1, Math.min(CROWD_MAX, names.length || 60)));
    assigned.clear();
    current = null;
    plan = [];
    planned = false;
    spinStart = now;
    roundNo = 0;
    revealAt = null;
    revealStep = 0;
    podium = null;
    shownCount = -1;
    setCount(crowd, now);
    countAt = -1e9;
    setStatus(counts() ? `${display(crowd)} peserta di arena` : "Semua peserta di arena");
    if (hud.countLabel) hud.countLabel.textContent = "TERSISA";
    if (hud.countSub) hud.countSub.textContent = `dari ${display(crowd)}`;
  };

  /** Pasang pemenang pada orang yang masih berdiri, nama acak dari kolam untuk sisanya. */
  const castWinners = () => {
    const { mains, names } = live.current;
    const alive = shuffle(people.filter((person) => person.alive));
    const chosen = alive.slice(0, mains.length);
    chosen.forEach((person, index) => {
      person.winner = true;
      assigned.set(person, mains[index]);
    });
    const taken = new Set(mains);
    const others = shuffle(names.filter((name) => !taken.has(name)));
    alive.slice(mains.length).forEach((person, index) => {
      assigned.set(person, others[index % Math.max(1, others.length)] ?? "");
    });
    return chosen;
  };

  /** Petak pemenang meluncur menjadi barisan podium yang menghadap kamera. */
  const startPodium = (winners: Person[]) => {
    const count = winners.length;
    const perRow = count <= 7 ? count : Math.ceil(count / (count > 14 ? 3 : 2));
    const rows = Math.ceil(count / perRow);
    // Nama emas di atas kepala butuh jarak lebih lebar daripada petak.
    const gap = HEX * (count <= PODIUM_NAMES_MAX ? 3.4 : 2.05);
    const angle = orbit;
    const from = winners.map((person): [number, number] => [tiles[person.tile].x, tiles[person.tile].z]);
    const offset = winners.map((person): [number, number] => [person.x - tiles[person.tile].x, person.z - tiles[person.tile].z]);
    const to = winners.map((_, index): [number, number] => {
      const row = Math.floor(index / perRow);
      const inRow = Math.min(perRow, count - row * perRow);
      const u = ((index % perRow) - (inRow - 1) / 2) * gap;
      const v = (row - (rows - 1) / 2) * gap * 0.9;
      return [u * Math.cos(angle) + v * Math.sin(angle), -u * Math.sin(angle) + v * Math.cos(angle)];
    });
    podium = { from, to, offset, winners };
    orbitOn = false;
    camGoal.r = Math.max((perRow * gap) / 2 + 1.4, (rows * gap) / 2 + 1.6, 4.6);
    camGoal.podium = 1;
    camGoal.tx = 0;
    camGoal.tz = 0;
  };
  const finishPodium = (now: number) => {
    if (!podium) return;
    for (const tile of tiles) if (tile.alive) tile.gold = true;
    clearLabels();
    const big = podium.winners.length <= PODIUM_NAMES_MAX;
    for (const person of podium.winners) {
      person.win = true;
      person.face = Math.atan2(camera.position.x - person.x, camera.position.z - person.z);
      if (big) person.label = nameSprite(assigned.get(person) ?? "", true);
    }
    setStatus("Pemenang!");
    if (hud.countLabel) hud.countLabel.textContent = "PEMENANG";
    if (hud.countSub) hud.countSub.textContent = `dari ${display(crowd)} peserta`;
    setCount(podium.winners.length, now);
  };

  /** Pemenang sudah ada saat layar dibuka (muat ulang halaman): langsung ke podium. */
  const jumpToEnd = (now: number) => {
    const chosen = castWinners();
    for (const person of people) {
      if (person.winner) continue;
      person.alive = false;
      person.gone = true;
    }
    const keepTiles = new Set<number>();
    assign(chosen, chooseSafe(aliveTiles(), chosen.length, true), true);
    for (const person of chosen) {
      person.x = person.tx;
      person.z = person.tz;
      keepTiles.add(person.tile);
    }
    tiles.forEach((tile, index) => {
      if (keepTiles.has(index)) return;
      tile.alive = false;
      tile.gone = true;
    });
    startPodium(chosen);
    if (podium) {
      const done: NonNullable<typeof podium> = podium;
      done.winners.forEach((person, index) => {
        tiles[person.tile].x = done.to[index][0];
        tiles[person.tile].z = done.to[index][1];
        person.x = done.to[index][0];
        person.z = done.to[index][1];
      });
    }
    cam.r = camGoal.r;
    cam.tx = camGoal.tx;
    cam.tz = camGoal.tz;
    cam.podium = 1;
    finishPodium(now);
    revealStep = 99;
  };

  const resize = () => {
    const rect = wrap.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(wrap);

  // Laptop lemah: bila frame dalam ~1 detik terakhir umumnya di atas 25 ms,
  // resolusi dan bayangan diturunkan sekali (sama dengan Dart).
  const stamps: number[] = [];
  let lowered = false;
  const watchSpeed = (now: number) => {
    if (lowered) return;
    stamps.push(now);
    while (stamps.length > 4 && now - stamps[0] > 1000) stamps.shift();
    if (stamps.length < 4) return;
    const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]).sort((a, b) => a - b);
    if (gaps[Math.floor(gaps.length / 2)] > 25) {
      lowered = true;
      renderer.setPixelRatio(1);
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.map?.dispose();
      key.shadow.map = null;
      resize();
    }
  };

  const sync = (time: number) => {
    if (!tileMesh || !bodyMesh || !headMesh || !ringMesh) return;
    tiles.forEach((tile, index) => {
      euler.set(tile.rot * 0.7, 0, tile.rot);
      quat.setFromEuler(euler);
      const size = tile.gone ? 0 : 1;
      scale.set(size, size, size);
      pos.set(tile.x, tile.y, tile.z);
      m4.compose(pos, quat, scale);
      tileMesh?.setMatrixAt(index, m4);
      if (tile.flash > 0) scratch.copy(TILE_A).lerp(RED, tile.flash);
      else if (tile.gold) scratch.copy(TILE_A).lerp(GOLD_C, 0.6);
      else scratch.copy(index % 2 ? TILE_A : TILE_B);
      tileMesh?.setColorAt(index, scratch);
    });
    tileMesh.instanceMatrix.needsUpdate = true;
    if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
    let rings = 0;
    for (const person of people) {
      const bob = person.alive && !person.falling ? Math.abs(Math.sin(time * 9 + person.phase)) * 0.12 * walking + Math.sin(time * 2 + person.phase) * 0.015 : 0;
      const jump = person.win ? Math.abs(Math.sin(time * 6 + person.phase)) * 0.5 : 0;
      euler.set(person.tilt, person.face, person.tilt * 0.6 * Math.sign(person.spin));
      quat.setFromEuler(euler);
      const size = person.gone ? 0 : 1;
      scale.set(size, size, size);
      pos.set(person.x, person.y + bob + jump, person.z);
      m4.compose(pos, quat, scale);
      bodyMesh.setMatrixAt(person.index, m4);
      headMesh.setMatrixAt(person.index, m4);
      if (person.win && rings < ARENA_MAX) {
        euler.set(Math.PI / 2, 0, 0);
        quat.setFromEuler(euler);
        const pulse = 1 + Math.sin(time * 4) * 0.08;
        scale.set(pulse, pulse, 1);
        pos.set(person.x, person.y + 0.05, person.z);
        m4.compose(pos, quat, scale);
        ringMesh.setMatrixAt(rings, m4);
        rings += 1;
      }
      if (person.label) {
        person.label.position.set(person.x, person.y + 1.75 + jump, person.z);
        person.label.visible = !person.gone && !(person.falling && person.y < -3);
      }
    }
    ringMesh.count = rings;
    ringMesh.instanceMatrix.needsUpdate = true;
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
  };

  let last = view.performance.now();
  let frame = 0;
  const draw = (now: number) => {
    watchSpeed(now);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const { names, mains, round, pending, endsAt } = live.current;
    if (round !== built || (builtFor === "empty" && names.length > 0 && revealAt === null && roundNo === 0)) restart(now);

    // Pemenang datang: babak yang sedang berjalan dihentikan (orangnya belum
    // bernama, jadi tidak ada yang perlu diselesaikan), lalu jadwal tetap.
    if (mains.length > 0 && revealAt === null) {
      if (skipReveal.current) {
        skipReveal.current = false;
        revealAt = now - 60_000;
        jumpToEnd(now);
      } else {
        revealAt = now;
        if (current) {
          for (const tile of current.drop) tiles[tile].flash = 0;
          for (const tile of current.fake) tiles[tile].flash = 0;
          for (const person of current.movers) {
            person.fx = person.x;
            person.fz = person.z;
            person.tx = person.x;
            person.tz = person.z;
          }
          current = null;
        }
        walking = 0;
      }
    }
    if (mains.length === 0 && revealAt !== null) restart(now);

    if (revealAt === null) {
      // Selama mengundi: babak tanpa nama sampai lantai, lalu gertakan.
      if (!planned) {
        planned = true;
        const floor = arenaFloor(crowd, Math.min(ARENA_MAX, Math.max(1, pending)));
        const spinMs = endsAt === null ? null : endsAt - Date.now();
        plan = arenaPlan(crowd, floor, arenaSpinRounds(crowd, floor, spinMs));
      }
      if (!current && now - spinStart > 700) {
        roundNo += 1;
        const next = plan.shift();
        current = next === undefined
          ? startRound(now, people.filter((person) => person.alive).length, { title: `Babak ${roundNo} · siapa yang bertahan?` })
          : startRound(now, next, { title: `Babak ${roundNo}` });
      }
    } else if (revealStep < 99) {
      const t = now - revealAt;
      if (revealStep === 0) {
        revealStep = 1;
        const chosen = castWinners();
        const alive = people.filter((person) => person.alive).length;
        const k = chosen.length;
        let keepMid = alive;
        if (alive > LABEL_AT && k < LABEL_AT) keepMid = clamp(Math.max(k + 3, Math.ceil(alive * 0.3)), k + 1, LABEL_AT);
        else if (alive > k + 2) keepMid = Math.max(k + 2, Math.ceil(alive * 0.6));
        if (alive <= LABEL_AT) labelSurvivors();
        roundNo += 1;
        current = startRound(now, keepMid, { title: `Babak ${roundNo}`, protect: chosen, labelsAfter: keepMid <= LABEL_AT });
      } else if (revealStep === 1 && t >= ARENA_CYCLE_MS) {
        revealStep = 2;
        const chosen = people.filter((person) => person.winner);
        current = startRound(now, chosen.length, {
          final: true, title: "Babak final", protect: chosen, labelsAfter: true,
          run: ARENA_FINAL_RUN_MS, warn: ARENA_FINAL_WARN_MS, fall: ARENA_FINAL_FALL_MS,
        });
        flash("BABAK FINAL", counts() ? `${people.filter((person) => person.alive).length} orang, ${chosen.length} pemenang` : `${chosen.length} pemenang`, now, 1800);
      } else if (revealStep === 2 && t >= ARENA_PODIUM_MS) {
        revealStep = 3;
        current = null;
        startPodium(people.filter((person) => person.winner));
        setStatus("Pemenang!");
      } else if (revealStep === 3 && podium) {
        const k = easeInOut(clamp((t - ARENA_PODIUM_MS) / 1600));
        const p = podium;
        p.winners.forEach((person, index) => {
          const tile = tiles[person.tile];
          tile.x = p.from[index][0] + (p.to[index][0] - p.from[index][0]) * k;
          tile.z = p.from[index][1] + (p.to[index][1] - p.from[index][1]) * k;
          person.x = tile.x + p.offset[index][0] * (1 - k);
          person.z = tile.z + p.offset[index][1] * (1 - k);
        });
        if (k >= 1) {
          revealStep = 99;
          finishPodium(now);
        }
      }
    }

    if (current) {
      const sinceStart = now - current.start;
      const inWarn = sinceStart >= current.run && sinceStart < current.run + current.warn;
      if (sinceStart < current.run) setStatus(`${current.title} · semua pindah posisi`);
      else if (inWarn) setStatus(current.final ? "Babak final" : current.drop.length > 0 ? `${current.title} · lantai merah runtuh` : `${current.title} · lantai merah...`, true);
      if (stepRound(current, now)) {
        const survivors = people.filter((person) => person.alive).length;
        setStatus(current.final ? "Pemenang!" : counts() ? `Tersisa ${display(survivors)} orang` : `${current.title} selesai`);
        current = null;
      }
    }

    // Fisika jatuh.
    for (const tile of tiles) {
      if (!tile.dropping) continue;
      tile.vy -= 22 * dt;
      tile.y += tile.vy * dt;
      tile.rot += tile.spin * dt;
      if (tile.y < -40) { tile.dropping = false; tile.gone = true; }
    }
    for (const person of people) {
      if (!person.falling) continue;
      person.vy -= 22 * dt;
      person.y += person.vy * dt;
      person.tilt += person.spin * dt * 0.8;
      if (person.y < -40) { person.falling = false; person.gone = true; }
    }
    // Lingkaran lampu stadion hanya terlihat saat kamera memandang seluruh arena.
    if (bulbs) bulbs.visible = revealStep < 3 && cam.r > arenaR * 0.55;
    tickHud(now);
    sync(now / 1000);
    placeCamera(dt);
    renderer.render(scene, camera);
    frame = view.requestAnimationFrame(draw);
  };
  frame = view.requestAnimationFrame(draw);

  return () => {
    view.cancelAnimationFrame(frame);
    observer.disconnect();
    clearLabels();
    for (const mesh of [tileMesh, bodyMesh, headMesh, ringMesh, bulbs]) mesh?.dispose();
    for (const item of disposables) item.dispose();
    renderer.dispose();
  };
}
