"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { expressive } from "@/lib/m3/motion";
import {
  DART_CARD_MS, DART_CARD_STAGGER_MS, DART_CARDS_AFTER_MS, DART_GAP_MS, DART_LAND_MS, DART_MAX_SHOWN, LIST_AFTER_MS,
  DartAnimation as FlatDartAnimation, WinnerList, type AnimationProps,
} from "./undian-animations";

// ===========================================================================
// Lempar dart (3D)
// ===========================================================================
//
// Semua nama di kolam ditempel di papan gabus dengan paku payung, dilihat dari
// mata pelempar. Selama mengundi, dart dipegang di bawah layar dan bergoyang
// pelan mengikuti bidikan. Begitu `winners` datang, dart dilempar satu per satu
// (paling banyak enam): terbang melengkung menjauh, menancap miring, bergetar,
// papan ikut bergetar. Lalu kamera maju, lampu ruangan meredup, dan kertas
// pemenang dicabut dari paku dan dibawa ke depan kamera (Hanung, 5 Nov:
// versi 2D "ga terasa realistis", versi 3D disetujui, minta kualitas HD).
//
// Kontraknya sama dengan varian lain: sebelum `winners` terisi tidak ada kertas
// yang dipilih. Pemenang lebih dari enam: enam pertama dilempar, sisanya
// tampil di daftar nama sesudahnya.
//
// three.js dimuat dinamis (modul yang sama dengan Tabung bola). Bila WebGL
// gagal, layar jatuh ke versi 2D lama supaya undian tetap berjalan.

type Three = typeof import("three");
type V3 = import("three").Vector3;
let threeModule: Promise<Three> | null = null;

/** Mulai mengunduh three.js tanpa menunggu hasilnya. */
export function preloadDart() {
  if (!threeModule) threeModule = import("three");
  return threeModule;
}

/** Kertas di papan dibatasi; di atas ini tiap kertas terlalu kecil dan atlas teks terlalu besar. */
const SLIP_MAX = 600;
const BW = 4.0;
const BH = 2.5;
const SLIP_RATIO = 2.5;
const PIN_COLORS = [0xc7372b, 0xe0a21b, 0x2f62c9, 0x2e8b57, 0x7b4bb7];
const SPEED: Record<NonNullable<AnimationProps["speed"]>, number> = { slow: 0.7, normal: 1, fast: 1.35 };

// Jadwal lemparan dalam detik sejak pemenang datang. Angka ms-nya ada di
// undian-animations supaya revealSettleMs memakai angka yang sama.
const LAND0 = DART_LAND_MS / 1000;
const GAP = DART_GAP_MS / 1000;
const CAM_AFTER = 0.42;
const CAM_DUR = 1.05;
const CARD_DUR = DART_CARD_MS / 1000;
const CARD_STAGGER = DART_CARD_STAGGER_MS / 1000;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function hashOf(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Jadwal satu dart, dalam detik sejak pemenang datang. */
function dartTimes(index: number) {
  if (index === 0) return { reload: -1, settle: 0, settleEnd: 0.65, windEnd: 0.82, land: LAND0 };
  const start = LAND0 + (index - 1) * GAP;
  return { reload: start, settle: start + 0.22, settleEnd: start + 0.48, windEnd: start + 0.59, land: start + GAP };
}

type Shown = { name: string; company: string | null };
type Live = { current: { names: string[]; shown: Shown[]; overflow: boolean; accent: string; fontFamily: string; speed: NonNullable<AnimationProps["speed"]>; round: number } };

export function DartAnimation3D(props: AnimationProps) {
  const { roster, winners, accent, text, fontFamily, round, speed = "normal" } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const mains = winners.filter((winner) => !winner.is_backup);
  const backups = winners.filter((winner) => winner.is_backup);
  const shown = (mains.length > 0 ? mains : winners).slice(0, DART_MAX_SHOWN).map((winner) => ({ name: winner.name, company: winner.company }));
  const overflow = mains.length > DART_MAX_SHOWN;

  const live = useRef({ names: roster.map((item) => item.name), shown, overflow, accent, fontFamily, speed, round });
  useEffect(() => {
    live.current = { names: roster.map((item) => item.name), shown, overflow, accent, fontFamily, speed, round };
  });

  // Daftar nama (pemenang lebih dari enam) atau baris cadangan tampil setelah
  // kartu terakhir berhenti.
  const [doneRound, setDoneRound] = useState<number | null>(() => (winners.length > 0 ? round : null));
  const hasWinners = winners.length > 0;
  const shownCount = shown.length;
  useEffect(() => {
    if (!hasWinners || doneRound === round) return;
    // Lebih dari enam pemenang: tidak ada kartu yang dicabut, daftar nama
    // langsung menyusul dart terakhir.
    const lastLand = DART_LAND_MS + (shownCount - 1) * DART_GAP_MS;
    const delay = overflow ? lastLand + LIST_AFTER_MS : lastLand + DART_CARDS_AFTER_MS + (shownCount - 1) * DART_CARD_STAGGER_MS + DART_CARD_MS;
    const timer = window.setTimeout(() => setDoneRound(round), delay);
    return () => window.clearTimeout(timer);
  }, [hasWinners, shownCount, round, doneRound, overflow]);
  const done = doneRound === round && hasWinners;
  const skipReveal = useRef(winners.length > 0);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    preloadDart().then((T) => {
      if (disposed) return;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      try {
        cleanup = buildScene(T, canvas, wrap, live, skipReveal);
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
  }, []);

  if (failed) return <FlatDartAnimation {...props} />;

  return <div className="relative h-full w-full min-h-0">
    <motion.div
      ref={wrapRef}
      className="absolute inset-0"
      animate={{ opacity: done && overflow ? 0.25 : 1 }}
      transition={{ duration: 0.4 }}
    >
      <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />
    </motion.div>
    <AnimatePresence>
      {done && overflow && <motion.div
        key={`daftar-${round}`}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={expressive.effects.default}
      >
        <WinnerList winners={winners} accent={accent} text={text} fontFamily={fontFamily} />
      </motion.div>}
      {done && !overflow && backups.length > 0 && <motion.p
        key={`cadangan-${round}`}
        className="absolute bottom-[3%] left-1/2 max-w-[92%] -translate-x-1/2 truncate rounded-full px-[2.4%] py-[0.6%] text-center"
        style={{ fontFamily, fontSize: "clamp(11px, 1.8vh, 24px)", color: "#FFFFFF", background: "rgba(0, 0, 0, 0.55)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={expressive.effects.default}
      >
        Cadangan: {backups.map((winner) => winner.name).join(" · ")}
      </motion.p>}
    </AnimatePresence>
  </div>;
}

function buildScene(T: Three, canvas: HTMLCanvasElement, wrap: HTMLElement, live: Live, skipReveal: { current: boolean }) {
  const view = wrap.ownerDocument.defaultView ?? window;
  const doc = wrap.ownerDocument;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  // HD: layar 1x (proyektor 1080p) dirender 1,5x supaya tepi dan teks halus.
  // Laptop yang tidak kuat turun ke 1x otomatis (lihat `lower`).
  renderer.setPixelRatio(Math.min(2, Math.max(1.5, view.devicePixelRatio || 1)));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const maxTexture = Math.min(8192, renderer.capabilities.maxTextureSize);

  const disposables: { dispose: () => void }[] = [];
  const keep = <D extends { dispose: () => void }>(item: D) => {
    disposables.push(item);
    return item;
  };

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 16 / 9, 0.05, 60);
  const look = new T.Vector3();

  // Pantulan logam dart dari ruang buatan, bukan dari lampu: tanpa ini barrel
  // tungsten terlihat seperti plastik abu-abu.
  const envScene = new T.Scene();
  envScene.add(new T.Mesh(keep(new T.SphereGeometry(10, 16, 12)), keep(new T.MeshBasicMaterial({ color: 0x2a2f3a, side: T.BackSide }))));
  const glow = keep(new T.MeshBasicMaterial({ color: 0xffffff }));
  for (const [x, y, z, sx, sy] of [[0, 6, 0, 6, 0.5], [-6, 2, 3, 0.5, 4], [6, 1, -2, 0.5, 3]] as const) {
    const panel = new T.Mesh(keep(new T.BoxGeometry(sx, sy, 0.3)), glow);
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    envScene.add(panel);
  }
  const pmrem = new T.PMREMGenerator(renderer);
  const envTexture = keep(pmrem.fromScene(envScene, 0.04).texture);
  pmrem.dispose();

  const hemi = new T.HemisphereLight(0x9fb4ff, 0x2a1a0c, 0.55);
  scene.add(hemi);
  const SPOT = 170;
  const spot = new T.SpotLight(0xfff1dc, SPOT, 16, 0.62, 0.65, 1.6);
  spot.position.set(-2.6, 3.4, 4.6);
  spot.target.position.set(0.2, -0.1, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(4096, 4096);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.015;
  spot.shadow.camera.near = 2;
  spot.shadow.camera.far = 12;
  scene.add(spot, spot.target);
  const fill = new T.DirectionalLight(0xdfe6ff, 0.25);
  fill.position.set(1, 0, 6);
  scene.add(fill);
  const cardLight = new T.DirectionalLight(0xffffff, 0);
  scene.add(cardLight, cardLight.target);

  // Dinding tak terlihat yang hanya menerima bayangan: latar panggung acara
  // tetap tampil, bayangan papan jatuh di atasnya.
  const wall = new T.Mesh(keep(new T.PlaneGeometry(40, 24)), keep(new T.ShadowMaterial({ opacity: 0.45 })));
  wall.position.z = -0.09;
  wall.receiveShadow = true;
  scene.add(wall);

  const board = new T.Group();
  scene.add(board);

  const cork = doc.createElement("canvas");
  cork.width = cork.height = 1024;
  const corkPen = cork.getContext("2d");
  if (corkPen) {
    const random = seeded(3);
    corkPen.fillStyle = "#B4875A";
    corkPen.fillRect(0, 0, 1024, 1024);
    for (let index = 0; index < 36000; index += 1) {
      const x = random() * 1024;
      const y = random() * 1024;
      const size = 0.6 + random() * 2.4;
      const light = random();
      corkPen.fillStyle = light < 0.5 ? `rgba(80,45,15,${0.15 + random() * 0.35})` : `rgba(235,195,140,${0.1 + random() * 0.3})`;
      corkPen.beginPath();
      corkPen.ellipse(x, y, size, size * (0.5 + random() * 0.6), random() * 3, 0, Math.PI * 2);
      corkPen.fill();
    }
  }
  const corkTexture = keep(new T.CanvasTexture(cork));
  corkTexture.wrapS = corkTexture.wrapT = T.RepeatWrapping;
  corkTexture.repeat.set(5, 3.1);
  corkTexture.colorSpace = T.SRGBColorSpace;
  corkTexture.anisotropy = anisotropy;
  const corkMesh = new T.Mesh(keep(new T.PlaneGeometry(BW, BH)), keep(new T.MeshStandardMaterial({ map: corkTexture, bumpMap: corkTexture, bumpScale: 1.2, roughness: 0.95 })));
  corkMesh.receiveShadow = true;
  board.add(corkMesh);
  const backing = new T.Mesh(keep(new T.BoxGeometry(BW + 0.2, BH + 0.2, 0.05)), keep(new T.MeshStandardMaterial({ color: 0x24150b, roughness: 0.8 })));
  backing.position.z = -0.03;
  backing.castShadow = true;
  board.add(backing);
  const wood = keep(new T.MeshStandardMaterial({ color: 0x5a3519, roughness: 0.55 }));
  const F = 0.11;
  const FD = 0.07;
  for (const [x, y, w, h] of [[0, BH / 2 + F / 2, BW + 2 * F, F], [0, -BH / 2 - F / 2, BW + 2 * F, F], [-BW / 2 - F / 2, 0, F, BH], [BW / 2 + F / 2, 0, F, BH]]) {
    const bar = new T.Mesh(keep(new T.BoxGeometry(w, h, FD)), wood);
    bar.position.set(x, y, FD / 2 - 0.02);
    bar.castShadow = bar.receiveShadow = true;
    board.add(bar);
  }

  // ---- Dart: ujung di titik asal, badan ke +Y ----
  const steel = keep(new T.MeshStandardMaterial({ color: 0xe8edf2, metalness: 1, roughness: 0.22, envMap: envTexture, envMapIntensity: 1.2 }));
  const tungsten = keep(new T.MeshStandardMaterial({ color: 0xa7b0ba, metalness: 1, roughness: 0.38, envMap: envTexture, envMapIntensity: 1.1 }));
  const plastic = keep(new T.MeshStandardMaterial({ color: 0x111316, roughness: 0.35, envMap: envTexture, envMapIntensity: 0.6 }));
  const flightMaterial = keep(new T.MeshStandardMaterial({ color: new T.Color(live.current.accent), roughness: 0.55, side: T.DoubleSide, envMap: envTexture, envMapIntensity: 0.3 }));
  const tipGeometry = keep(new T.LatheGeometry([new T.Vector2(0, 0), new T.Vector2(0.003, 0.008), new T.Vector2(0.0055, 0.1), new T.Vector2(0.0075, 0.105)], 24));
  const barrelPoints = [new T.Vector2(0.0075, 0.105), new T.Vector2(0.016, 0.11)];
  for (let y = 0.115; y < 0.27; y += 0.009) barrelPoints.push(new T.Vector2(0.0185, y), new T.Vector2(0.0165, y + 0.0045));
  barrelPoints.push(new T.Vector2(0.017, 0.275), new T.Vector2(0.009, 0.285));
  const barrelGeometry = keep(new T.LatheGeometry(barrelPoints, 48));
  const shaftGeometry = keep(new T.CylinderGeometry(0.0065, 0.0075, 0.2, 32));
  shaftGeometry.translate(0, 0.385, 0);
  const flightShape = new T.Shape();
  flightShape.moveTo(0, 0);
  flightShape.lineTo(0.042, 0.06);
  flightShape.quadraticCurveTo(0.058, 0.15, 0.046, 0.17);
  flightShape.lineTo(0, 0.17);
  flightShape.closePath();
  const flightGeometry = keep(new T.ShapeGeometry(flightShape));
  flightGeometry.translate(0, 0.41, 0);
  const makeDart = () => {
    const group = new T.Group();
    const parts: import("three").Mesh[] = [new T.Mesh(tipGeometry, steel), new T.Mesh(barrelGeometry, tungsten), new T.Mesh(shaftGeometry, plastic)];
    for (let index = 0; index < 4; index += 1) {
      const fin = new T.Mesh(flightGeometry, flightMaterial);
      fin.rotation.y = (index * Math.PI) / 2;
      parts.push(fin);
    }
    for (const part of parts) {
      part.castShadow = true;
      group.add(part);
    }
    return group;
  };
  const darts = Array.from({ length: DART_MAX_SHOWN }, () => {
    const dart = makeDart();
    dart.visible = false;
    board.add(dart);
    return dart;
  });
  const UP = new T.Vector3(0, 1, 0);
  const spinQ = new T.Quaternion();
  const orient = (object: import("three").Object3D, direction: V3, spin: number) => {
    object.quaternion.setFromUnitVectors(UP, direction.clone().negate().normalize());
    object.quaternion.multiply(spinQ.setFromAxisAngle(UP, spin));
  };

  // ---- Huruf: canvas tidak mengenal var(--font-...) ----
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

  const wrapLines = (pen: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (pen.measureText(next).width <= maxWidth || !current) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
    if (lines.length > 2) {
      lines[1] = lines.slice(1).join(" ");
      lines.length = 2;
    }
    return lines;
  };
  const drawSlip = (pen: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string, sub: string | null, border: string | null) => {
    const paper = pen.createLinearGradient(0, y, 0, y + h);
    paper.addColorStop(0, "#FFFDF7");
    paper.addColorStop(1, "#EDE6D3");
    pen.fillStyle = paper;
    pen.fillRect(x, y, w, h);
    pen.strokeStyle = "rgba(120,95,50,.25)";
    pen.lineWidth = Math.max(1, w * 0.004);
    pen.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (border) {
      const line = w * 0.014;
      pen.strokeStyle = border;
      pen.lineWidth = line;
      pen.strokeRect(x + line / 2, y + line / 2, w - line, h - line);
    }
    const font = fontOf(live.current.fontFamily);
    pen.fillStyle = "#231B0E";
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    let size = h * (sub ? 0.26 : 0.27);
    let lines: string[] = [name];
    for (;;) {
      pen.font = `700 ${size}px ${font}`;
      lines = wrapLines(pen, name, w * 0.86);
      if (lines.every((line) => pen.measureText(line).width <= w * 0.88) || size < 6) break;
      size *= 0.92;
    }
    const lineHeight = size * 1.08;
    const top = y + h * (sub ? 0.5 : 0.56) - ((lines.length - 1) * lineHeight) / 2 - (sub ? h * 0.06 : 0);
    lines.forEach((line, index) => pen.fillText(line, x + w / 2, top + index * lineHeight));
    if (sub) {
      pen.font = `500 ${size * 0.48}px ${font}`;
      pen.fillStyle = "rgba(35,27,14,.62)";
      pen.fillText(sub, x + w / 2, top + (lines.length - 1) * lineHeight + size * 1.05);
    }
  };

  // ---- Kertas nama: satu InstancedMesh + atlas teks ----
  type Slip = { name: string; x: number; y: number; z: number; rx: number; rz: number; pin: V3 };
  let slips: Slip[] = [];
  let slipW = 1;
  let slipH = 1;
  let slipMesh: import("three").InstancedMesh | null = null;
  let pinMesh: import("three").InstancedMesh | null = null;
  let atlas: { canvas: HTMLCanvasElement; texture: import("three").CanvasTexture; px: number; py: number; columns: number } | null = null;
  let slipsKey = "";
  const slipMatrix = new T.Matrix4();
  const slipQuat = new T.Quaternion();
  const slipEuler = new T.Euler();
  const ONE = new T.Vector3(1, 1, 1);
  const ZERO = new T.Vector3(0, 0, 0);

  const disposeSlips = () => {
    for (const mesh of [slipMesh, pinMesh]) {
      if (!mesh) continue;
      board.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as import("three").Material).dispose();
    }
    atlas?.texture.dispose();
    slipMesh = pinMesh = null;
    atlas = null;
  };
  const paintAtlas = () => {
    if (!atlas) return;
    const pen = atlas.canvas.getContext("2d");
    if (!pen) return;
    pen.clearRect(0, 0, atlas.canvas.width, atlas.canvas.height);
    slips.forEach((slip, index) => drawSlip(pen, (index % atlas!.columns) * atlas!.px, Math.floor(index / atlas!.columns) * atlas!.py, atlas!.px, atlas!.py, slip.name, null, null));
    atlas.texture.needsUpdate = true;
  };
  const buildSlips = (source: string[]) => {
    disposeSlips();
    const names = source.length > 0 ? source.slice(0, SLIP_MAX) : ["• • •"];
    const count = names.length;
    const pad = 0.1;
    const sw = BW - 2 * pad;
    const sh = BH - 2 * pad;
    const columns = Math.min(count, Math.max(1, Math.round(Math.sqrt((count * (sw / sh)) / SLIP_RATIO))));
    const rows = Math.ceil(count / columns);
    const cellW = sw / columns;
    const cellH = sh / rows;
    slipW = Math.min(cellW * 0.86, sw * 0.3, cellH * 0.78 * SLIP_RATIO);
    slipH = slipW / SLIP_RATIO;

    let px = count <= 20 ? 1024 : count <= 100 ? 768 : 448;
    while (Math.ceil(count / Math.floor(maxTexture / px)) * Math.round(px / SLIP_RATIO) > maxTexture) px = Math.round(px * 0.85);
    const py = Math.round(px / SLIP_RATIO);
    const atlasColumns = Math.floor(maxTexture / px);
    const atlasCanvas = doc.createElement("canvas");
    atlasCanvas.width = Math.min(maxTexture, atlasColumns * px);
    atlasCanvas.height = Math.ceil(count / atlasColumns) * py;
    const texture = new T.CanvasTexture(atlasCanvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    atlas = { canvas: atlasCanvas, texture, px, py, columns: atlasColumns };

    const geometry = new T.PlaneGeometry(slipW, slipH);
    const uvRect = new Float32Array(count * 4);
    const material = new T.MeshStandardMaterial({ map: texture, roughness: 0.88 });
    // Tiap kertas membaca potongan atlasnya sendiri lewat atribut per-instance.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute vec4 uvRect;\n${shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = uv * uvRect.zw + uvRect.xy;")}`;
    };
    const slipsInstanced = new T.InstancedMesh(geometry, material, count);
    slipsInstanced.castShadow = slipsInstanced.receiveShadow = true;
    const pinGeometry = new T.SphereGeometry(Math.max(0.012, slipH * 0.085), 20, 14);
    const pins = new T.InstancedMesh(pinGeometry, new T.MeshStandardMaterial({ roughness: 0.3, envMap: envTexture, envMapIntensity: 0.5 }), count);
    pins.castShadow = true;
    const random = seeded(11);
    const color = new T.Color();
    slips = names.map((name, index) => {
      const row = Math.floor(index / columns);
      const inRow = row === rows - 1 ? count - row * columns : columns;
      const offset = (columns - inRow) / 2;
      const x = -sw / 2 + ((index % columns) + offset + 0.5) * cellW + (random() - 0.5) * (cellW - slipW) * 0.5;
      const y = sh / 2 - (row + 0.5) * cellH + (random() - 0.5) * (cellH - slipH) * 0.5;
      const rz = (random() - 0.5) * 0.12;
      const rx = 0.02 + random() * 0.05;
      const z = 0.006 + (slipH / 2) * Math.sin(rx) + index * 1e-6;
      slipQuat.setFromEuler(slipEuler.set(rx, 0, rz));
      slipMatrix.compose(new T.Vector3(x, y, z), slipQuat, ONE);
      slipsInstanced.setMatrixAt(index, slipMatrix);
      uvRect.set([
        ((index % atlasColumns) * px) / atlasCanvas.width,
        1 - ((Math.floor(index / atlasColumns) + 1) * py) / atlasCanvas.height,
        px / atlasCanvas.width,
        py / atlasCanvas.height,
      ], index * 4);
      const pin = new T.Vector3(0, slipH * 0.34, 0.012).applyEuler(new T.Euler(0, 0, rz)).add(new T.Vector3(x, y, 0.006));
      slipMatrix.compose(pin, new T.Quaternion(), new T.Vector3(1, 1, 0.7));
      pins.setMatrixAt(index, slipMatrix);
      pins.setColorAt(index, color.setHex(PIN_COLORS[index % PIN_COLORS.length]));
      return { name, x, y, z, rx, rz, pin };
    });
    geometry.setAttribute("uvRect", new T.InstancedBufferAttribute(uvRect, 4));
    slipMesh = slipsInstanced;
    pinMesh = pins;
    board.add(slipsInstanced, pins);
    paintAtlas();
  };
  const showSlip = (index: number, visible: boolean) => {
    if (!slipMesh) return;
    const slip = slips[index];
    if (visible) slipMatrix.compose(new T.Vector3(slip.x, slip.y, slip.z), slipQuat.setFromEuler(slipEuler.set(slip.rx, 0, slip.rz)), ONE);
    else slipMatrix.compose(ZERO, slipQuat.identity(), ZERO);
    slipMesh.setMatrixAt(index, slipMatrix);
    slipMesh.instanceMatrix.needsUpdate = true;
  };

  // ---- Kertas pemenang: mesh sendiri, tekstur tajam, berporos di paku ----
  type Winner = { index: number; mesh: import("three").Mesh; material: import("three").MeshStandardMaterial; texture: import("three").CanvasTexture; target: V3 };
  let chosen: Winner[] = [];
  const clearChosen = () => {
    for (const item of chosen) {
      board.remove(item.mesh);
      item.mesh.geometry.dispose();
      item.material.dispose();
      item.texture.dispose();
      showSlip(item.index, true);
    }
    chosen = [];
    for (const dart of darts) dart.visible = false;
  };
  const choose = (shown: Shown[]) => {
    const used = new Set<number>();
    chosen = shown.map((winner, order) => {
      let index = slips.findIndex((slip, at) => !used.has(at) && slip.name === winner.name);
      if (index < 0) {
        // Nama di luar 600 kertas yang tampil: kertas lain dipakai, mesh pemenang
        // menutupinya dengan nama yang benar.
        index = hashOf(`${winner.name}#${order}`) % slips.length;
        while (used.has(index) && used.size < slips.length) index = (index + 1) % slips.length;
      }
      used.add(index);
      const slip = slips[index];
      const px = 2048;
      const paper = doc.createElement("canvas");
      paper.width = px;
      paper.height = Math.round(px / SLIP_RATIO);
      const pen = paper.getContext("2d");
      if (pen) drawSlip(pen, 0, 0, paper.width, paper.height, winner.name, winner.company, live.current.accent);
      const texture = new T.CanvasTexture(paper);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = anisotropy;
      const geometry = new T.PlaneGeometry(slipW, slipH);
      geometry.translate(0, -slipH * 0.34, 0);
      const material = new T.MeshStandardMaterial({ map: texture, roughness: 0.85, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0 });
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      board.add(mesh);
      showSlip(index, false);
      const random = seeded(hashOf(winner.name) + order);
      const target = new T.Vector3(slip.x + (random() - 0.5) * slipW * 0.35, slip.y - slipH * 0.05 + (random() - 0.5) * slipH * 0.3, -0.028);
      return { index, mesh, material, texture, target };
    });
  };

  // ---- Kamera ----
  const tanHalf = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
  const home = { pos: new T.Vector3(), look: new T.Vector3(0, -0.05, 0) };
  const handBase = new T.Vector3();
  const resize = () => {
    const rect = wrap.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
    // Papan selalu muat utuh, di layar lebar maupun pratinjau sempit.
    const distance = Math.max((BW + 0.4) / 0.9 / (2 * tanHalf * camera.aspect), (BH + 0.4) / 0.86 / (2 * tanHalf));
    home.pos.set(distance * 0.066, -0.1, distance);
    // Tangan berjarak sebanding dengan jarak kamera, supaya ukuran dart di
    // layar sama di layar lebar maupun pratinjau tegak.
    const reach = distance / 5.3;
    handBase.set(home.pos.x + 0.01 * reach, -0.1 - 0.2 * reach, distance - 1.35 * reach);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(wrap);

  // Sasaran kamera setelah semua dart menancap: membingkai semua titik tancap,
  // tidak pernah keluar dari papan.
  const framing = () => {
    const box = new T.Box3();
    for (const item of chosen) {
      const slip = slips[item.index];
      box.expandByPoint(new T.Vector3(slip.x - slipW / 2, slip.y - slipH / 2, 0));
      box.expandByPoint(new T.Vector3(slip.x + slipW / 2, slip.y + slipH / 2, 0));
    }
    const centre = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    let distance = Math.max(size.x / (0.55 * 2 * tanHalf * camera.aspect), size.y / (0.5 * 2 * tanHalf), slipW / (0.24 * 2 * tanHalf * camera.aspect), 1.7);
    distance = Math.min(distance, home.pos.z);
    const halfW = distance * tanHalf * camera.aspect;
    const halfH = distance * tanHalf;
    if (halfW < BW / 2 + 0.05) centre.x = Math.max(-BW / 2 - 0.05 + halfW, Math.min(BW / 2 + 0.05 - halfW, centre.x));
    if (halfH < BH / 2 + 0.05) centre.y = Math.max(-BH / 2 - 0.05 + halfH, Math.min(BH / 2 + 0.05 - halfH, centre.y));
    return { pos: new T.Vector3(centre.x + distance * 0.07, centre.y - distance * 0.05, distance), look: new T.Vector3(centre.x, centre.y, 0), distance };
  };

  // ---- Bidikan ----
  const aimIdle = (now: number, pace: number) => {
    const t = now * pace;
    return new T.Vector3(
      BW * (0.34 * Math.sin(t * 0.00071) + 0.08 * Math.sin(t * 0.0023 + 1)),
      BH * (0.26 * Math.sin(t * 0.00093 + 2) + 0.06 * Math.sin(t * 0.0031)),
      0,
    );
  };
  const handPose = (aim: V3, now: number, sway: number) => {
    const position = handBase.clone().add(new T.Vector3(aim.x * 0.08 + Math.sin(now * 0.0041) * 0.006 * sway, aim.y * 0.05 + Math.sin(now * 0.0029) * 0.008 * sway, 0));
    const direction = aim.clone().add(new T.Vector3(0, 0.32, 0)).sub(position).normalize();
    return { position, direction };
  };

  // Laptop lemah: bila 20 frame rata-rata di atas 25 ms, resolusi dan bayangan
  // diturunkan sekali. Animasi yang mulus lebih penting dari tepi yang halus.
  const stamps: number[] = [];
  let lowered = false;
  const watchSpeed = (now: number) => {
    if (lowered) return;
    stamps.push(now);
    if (stamps.length > 40) stamps.shift();
    if (stamps.length >= 30 && (stamps[stamps.length - 1] - stamps[stamps.length - 21]) / 20 > 25) {
      lowered = true;
      renderer.setPixelRatio(1);
      spot.shadow.mapSize.set(2048, 2048);
      spot.shadow.map?.dispose();
      spot.shadow.map = null;
      resize();
    }
  };

  let revealAt: number | null = null;
  let revealRound = live.current.round;
  let revealFrom = new T.Vector3();
  const lastAim = new T.Vector3();
  let frame = 0;
  const cardQ = new T.Quaternion();
  const cardM = new T.Matrix4();
  const shakeAxis = new T.Vector3();
  const quiver = new T.Quaternion();

  const reset = () => {
    clearChosen();
    revealAt = null;
    board.position.set(0, 0, 0);
  };

  const draw = (now: number) => {
    watchSpeed(now);
    const { names, shown, speed, round, accent } = live.current;
    const pace = SPEED[speed];
    flightMaterial.color.set(accent);

    if (round !== revealRound) {
      revealRound = round;
      skipReveal.current = false;
      reset();
    }
    const key = `${names.length}|${names[0] ?? ""}|${names[names.length - 1] ?? ""}`;
    if (key !== slipsKey && revealAt === null) {
      slipsKey = key;
      buildSlips(names);
    }
    if (shown.length > 0 && revealAt === null) {
      revealAt = skipReveal.current ? now - 60_000 : now;
      revealFrom = lastAim.clone();
      choose(shown);
    }
    if (shown.length === 0 && revealAt !== null) reset();

    const t = revealAt === null ? -1 : (now - revealAt) / 1000;
    const k = chosen.length;

    if (t < 0) {
      // Membidik: satu dart di tangan, bayangannya menyusuri papan.
      const aim = aimIdle(now, pace);
      lastAim.copy(aim);
      const pose = handPose(aim, now, 1);
      const dart = darts[0];
      dart.visible = true;
      dart.position.copy(pose.position);
      orient(dart, pose.direction, Math.sin(now * 0.001) * 0.3);
      board.position.set(0, 0, 0);
    } else {
      let shakeZ = 0;
      let shakeX = 0;
      for (let index = 0; index < DART_MAX_SHOWN; index += 1) {
        const dart = darts[index];
        if (index >= k) {
          dart.visible = false;
          continue;
        }
        const times = dartTimes(index);
        const target = chosen[index].target;
        const from = index === 0 ? revealFrom : chosen[index - 1].target;
        if (index > 0 && t < times.reload) {
          dart.visible = false;
          continue;
        }
        dart.visible = true;
        const settle = easeOut(clamp01((t - times.settle) / (times.settleEnd - times.settle)));
        const aim = from.clone().lerp(target, settle);
        const pose = handPose(aim, now, 1 - settle);
        if (t < times.settle) {
          // Dart baru naik ke tangan dari bawah layar.
          const rise = easeOut(clamp01((t - times.reload) / (times.settle - times.reload)));
          dart.position.copy(pose.position).add(new T.Vector3(0.1, -0.5, 0.1).multiplyScalar(1 - rise));
          orient(dart, pose.direction, 0);
        } else if (t < times.settleEnd) {
          dart.position.copy(pose.position);
          orient(dart, pose.direction, 0);
        } else if (t < times.windEnd) {
          const back = easeInOut((t - times.settleEnd) / (times.windEnd - times.settleEnd));
          dart.position.copy(pose.position).addScaledVector(pose.direction, -0.14 * back).add(new T.Vector3(0, -0.03 * back, 0));
          orient(dart, pose.direction, 0);
        } else {
          const start = pose.position.clone().addScaledVector(pose.direction, -0.14).add(new T.Vector3(0, -0.03, 0));
          const arc = 0.45;
          const at = (u: number) => new T.Vector3(lerp(start.x, target.x, u), lerp(start.y, target.y, u) + arc * 4 * u * (1 - u), lerp(start.z, target.z, u));
          const raw = clamp01((t - times.windEnd) / (times.land - times.windEnd));
          const u = 1 - (1 - raw) ** 1.35;
          const p = at(u);
          const ahead = u < 1 ? at(Math.min(1, u + 0.02)).sub(p) : p.clone().sub(at(0.98));
          dart.position.copy(p);
          orient(dart, ahead.normalize(), u * 2.2 + index);
          if (t >= times.land) {
            const since = t - times.land;
            const wobble = 0.16 * Math.exp(-since * 7) * Math.sin(since * 52);
            shakeAxis.set(1, 0, 0).applyQuaternion(dart.quaternion);
            dart.quaternion.premultiply(quiver.setFromAxisAngle(shakeAxis, wobble));
            const s = clamp01(since / 0.32);
            if (s < 1) {
              shakeZ += -0.012 * Math.exp(-s * 5) * Math.sin(s * 22);
              shakeX += 0.004 * Math.exp(-s * 5) * Math.sin(s * 17);
            }
          }
        }
      }
      board.position.set(shakeX, 0, shakeZ);
    }

    // Kertas pemenang: bergoyang saat tertancap, lalu dicabut ke depan kamera.
    const lastLand = k > 0 ? dartTimes(k - 1).land : 0;
    const camStart = lastLand + CAM_AFTER;
    const cardsStart = camStart + CAM_DUR + 0.3;
    const shot = k > 0 && t >= 0 && !live.current.overflow ? framing() : null;
    const cam = clamp01((t - camStart) / CAM_DUR);
    if (shot && t >= camStart) {
      const ease = easeInOut(cam);
      camera.position.lerpVectors(home.pos, shot.pos, ease);
      look.lerpVectors(home.look, shot.look, ease);
    } else {
      camera.position.copy(home.pos);
      look.copy(home.look);
    }
    camera.lookAt(look);

    const dim = shot ? clamp01((t - cardsStart) / 0.7) : 0;
    spot.intensity = SPOT * (1 - 0.82 * dim);
    hemi.intensity = 0.55 * (1 - 0.75 * dim);
    cardLight.intensity = 1.8 * dim;

    if (shot) {
      // Arah pandang kamera akhir (bukan Object3D.lookAt, yang menghadapkan +Z
      // ke sasaran sehingga kartu terlihat dari belakang).
      cardQ.setFromRotationMatrix(cardM.lookAt(shot.pos, shot.look, UP));
      const right = new T.Vector3(1, 0, 0).applyQuaternion(cardQ);
      const up = new T.Vector3(0, 1, 0).applyQuaternion(cardQ);
      const forward = new T.Vector3(0, 0, -1).applyQuaternion(cardQ);
      const reach = Math.min(1.1, shot.distance * 0.42);
      const viewH = 2 * reach * tanHalf;
      const viewW = viewH * camera.aspect;
      const columns = camera.aspect < 1 ? Math.min(k, 2) : Math.min(k, 3);
      const rows = Math.ceil(k / columns);
      const gap = viewW * 0.025;
      const cardW = Math.min((viewW * (k === 1 ? 0.62 : 0.9) - (columns - 1) * gap) / columns, ((viewH * 0.66 - (rows - 1) * gap) / rows) * SLIP_RATIO);
      const cardH = cardW / SLIP_RATIO;
      const centre = shot.pos.clone().addScaledVector(forward, reach);
      cardLight.position.copy(shot.pos).addScaledVector(up, 0.6);
      cardLight.target.position.copy(centre);

      chosen.forEach((item, index) => {
        const slip = slips[item.index];
        const mesh = item.mesh;
        const land = dartTimes(index).land;
        const flap = clamp01((t - land) / 0.7);
        const baseZ = slip.rz + (t >= land && flap < 1 ? 0.09 * Math.exp(-flap * 5) * Math.sin(flap * 20) : 0);
        const baseX = slip.rx + (t >= land && flap < 1 ? 0.12 * Math.exp(-flap * 6) * Math.abs(Math.sin(flap * 14)) : 0);
        const restQ = new T.Quaternion().setFromEuler(new T.Euler(baseX, 0, baseZ));
        const p0 = slip.pin.clone().setZ(slip.z + 0.001);
        const raw = clamp01((t - cardsStart - index * CARD_STAGGER) / CARD_DUR);
        if (raw <= 0) {
          mesh.position.copy(p0);
          mesh.quaternion.copy(restQ);
          mesh.scale.setScalar(1);
          item.material.emissiveIntensity = 0;
          return;
        }
        const row = Math.floor(index / columns);
        const inRow = row === rows - 1 ? k - row * columns : columns;
        const column = index % columns;
        const cx = -(inRow * cardW + (inRow - 1) * gap) / 2 + column * (cardW + gap) + cardW / 2;
        const cy = (rows * cardH + (rows - 1) * gap) / 2 - row * (cardH + gap) - cardH / 2;
        const pinTo = centre.clone().addScaledVector(right, cx).addScaledVector(up, cy + cardH * 0.34);
        const peelQ = restQ.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(-0.75, 0, 0.12)));
        const lift = p0.clone().add(new T.Vector3(0, 0.02, 0.12));
        // Board ikut bergeser saat bergetar; posisi akhir dihitung di ruang dunia.
        const toLocal = (world: V3) => world.sub(board.position);
        if (raw < 0.25) {
          const peel = easeOut(raw / 0.25);
          mesh.quaternion.slerpQuaternions(restQ, peelQ, peel);
          mesh.position.lerpVectors(p0, lift, peel);
          mesh.scale.setScalar(1);
        } else {
          const fly = easeInOut((raw - 0.25) / 0.75);
          mesh.quaternion.slerpQuaternions(peelQ, cardQ, fly);
          mesh.position.copy(toLocal(lift.clone().lerp(pinTo, fly).addScaledVector(forward, -Math.sin(fly * Math.PI) * 0.25)));
          mesh.scale.setScalar(lerp(1, cardW / slipW, fly));
          item.material.emissiveIntensity = lerp(0, 0.62, fly);
        }
      });
    }

    renderer.render(scene, camera);
    frame = view.requestAnimationFrame(draw);
  };
  frame = view.requestAnimationFrame(draw);

  // Huruf acara mungkin belum termuat saat atlas pertama dilukis.
  doc.fonts?.ready.then(() => {
    if (frame) paintAtlas();
  }).catch(() => {});

  return () => {
    view.cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
    clearChosen();
    disposeSlips();
    for (const dart of darts) board.remove(dart);
    for (const item of disposables) item.dispose();
    spot.shadow.map?.dispose();
    renderer.dispose();
  };
}
