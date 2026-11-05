"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { expressive } from "@/lib/m3/motion";
import { initialsOf } from "@/lib/undian";
import { DRUM_DROP_GAP_MS, DRUM_FIRST_LAND_MS, LIST_AFTER_MS, WinnerList, type AnimationProps } from "./undian-animations";

// ===========================================================================
// Tabung bola lotre (3D)
// ===========================================================================
//
// Tabung kaca berisi 44 bola berwarna yang ditiup udara dari tengah bawah:
// bola naik lewat tengah, menyebar di atas, lalu jatuh lewat pinggir dan saling
// memantul. Begitu `winners` datang, tiupan mereda, pintu di DASAR tabung
// terbuka, dan bola yang paling dekat pintu jatuh lewat pipa ke rel di depan,
// satu bola per pemenang (Hanung, 5 Nov: lubangnya harus di bawah, bola keluar
// karena jatuh). Inisial pemenang tertulis di bola yang keluar; tulisan itu
// dipasang selama bola berada di dalam pipa yang tidak tembus pandang.
//
// Kontraknya sama dengan varian lain: sebelum `winners` terisi tidak ada bola
// yang dipilih. Jumlah bola selalu 44, berapa pun pesertanya.
//
// three.js (~150 KB gz) dimuat dinamis, hanya untuk animasi ini; layar panggung
// memuatnya lebih dulu begitu hadiah dengan tabung dipilih (preloadDrum).

/** Batas bola per undi; sama dengan ANIMATION_MAX_WINNERS di lib/undian. Rel memuat enam. */
const MAX_SHOWN = 6;
const BALLS = 44;
const SPEED: Record<NonNullable<AnimationProps["speed"]>, number> = { slow: 0.7, normal: 1, fast: 1.35 };
const BALL_COLORS = ["#e8463a", "#f2b33d", "#2f8fe0", "#2fb36b", "#9b5de5", "#f06aa5"];

type Three = typeof import("three");
let threeModule: Promise<Three> | null = null;

/** Mulai mengunduh three.js tanpa menunggu hasilnya. */
export function preloadDrum() {
  if (!threeModule) threeModule = import("three");
  return threeModule;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
function easeInOut(k: number) {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}
function easeOut(k: number) {
  return 1 - (1 - k) ** 3;
}

export function DrumAnimation({ roster, winners, accent, text, fontFamily, round, speed = "normal" }: AnimationProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const mains = winners.filter((winner) => !winner.is_backup);
  const shown = (mains.length > 0 ? mains : winners).slice(0, MAX_SHOWN);
  const shownNames = shown.map((winner) => winner.name);

  const live = useRef({ names: roster.map((item) => item.name), shownNames, accent, speed, round });
  useEffect(() => {
    live.current = { names: roster.map((item) => item.name), shownNames, accent, speed, round };
  });

  const [listRound, setListRound] = useState<number | null>(() => (winners.length > 0 ? round : null));
  const showList = (listRound === round || failed) && winners.length > 0;
  const hasWinners = winners.length > 0;
  const shownCount = shown.length;
  useEffect(() => {
    if (!hasWinners || listRound === round) return;
    const delay = DRUM_FIRST_LAND_MS + (shownCount - 1) * DRUM_DROP_GAP_MS + LIST_AFTER_MS;
    const timer = window.setTimeout(() => setListRound(round), delay);
    return () => window.clearTimeout(timer);
  }, [hasWinners, shownCount, round, listRound]);
  const skipReveal = useRef(winners.length > 0);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    preloadDrum().then((T) => {
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

  return <div className="relative h-full w-full min-h-0">
    <motion.div
      ref={wrapRef}
      className="absolute inset-0"
      animate={{ opacity: showList ? 0.25 : 1 }}
      transition={{ duration: 0.4 }}
    >
      {failed
        ? !hasWinners && <p className="flex h-full items-center justify-center" style={{ fontFamily, fontSize: "clamp(16px, 3vw, 44px)", opacity: 0.5 }}>Mengundi...</p>
        : <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />}
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

type Live = { current: { names: string[]; shownNames: string[]; accent: string; speed: NonNullable<AnimationProps["speed"]>; round: number } };

function buildScene(T: Three, canvas: HTMLCanvasElement, wrap: HTMLElement, live: Live, skipReveal: { current: boolean }) {
  const view = wrap.ownerDocument.defaultView ?? window;
  const doc = wrap.ownerDocument;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, view.devicePixelRatio || 1));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(40, 16 / 9, 0.1, 100);
  const look = new T.Vector3();
  scene.add(new T.HemisphereLight(0xbfd4ff, 0x1a1208, 1.6));
  const key = new T.SpotLight(0xffffff, 120, 40, 0.6, 0.5);
  key.position.set(4, 9, 9);
  scene.add(key);
  const rim = new T.PointLight(new T.Color(live.current.accent), 20, 20);
  rim.position.set(-5, -1, 4);
  scene.add(rim);
  const railLight = new T.PointLight(0xffd27a, 0, 7);
  scene.add(railLight);

  // Ukuran dunia: tabung bola, pipa siku ke depan, rel pemenang.
  const R = 2.6;
  const r = 0.34;
  const YC = 1.0;
  const HOLE_Y = YC - R;
  const PIPE_Y = -2.55;
  const PIPE_END = 1.3;
  const RAIL_Z = 1.95;
  const SLOT = 2 * r + 0.14;
  const pr = r + 0.1;
  railLight.position.set(0, PIPE_Y + 1.4, RAIL_Z + 1.2);

  const disposables: { dispose: () => void }[] = [];
  const keep = <D extends { dispose: () => void }>(item: D) => {
    disposables.push(item);
    return item;
  };
  const trim = keep(new T.MeshStandardMaterial({ color: new T.Color(live.current.accent), metalness: 0.85, roughness: 0.3 }));
  const chrome = keep(new T.MeshStandardMaterial({ color: 0xaab3c0, metalness: 0.7, roughness: 0.25 }));
  const dark = keep(new T.MeshStandardMaterial({ color: 0x161c28, metalness: 0.5, roughness: 0.5 }));
  const add = (geometry: import("three").BufferGeometry, material: import("three").Material, setup?: (mesh: import("three").Mesh) => void) => {
    keep(geometry);
    const mesh = new T.Mesh(geometry, material);
    setup?.(mesh);
    scene.add(mesh);
    return mesh;
  };

  // Tabung kaca dan cincin yang ikut berputar.
  const glassMaterial = keep(new T.MeshPhysicalMaterial({ color: 0xaecdff, transparent: true, opacity: 0.12, roughness: 0.05, clearcoat: 1, side: T.DoubleSide, depthWrite: false }));
  add(new T.SphereGeometry(R + 0.05, 64, 48), glassMaterial, (mesh) => { mesh.position.y = YC; });
  const rig = new T.Group();
  rig.position.y = YC;
  scene.add(rig);
  const ringGeometry = keep(new T.TorusGeometry(R + 0.07, 0.04, 10, 96));
  for (const tilt of [0, Math.PI / 3, -Math.PI / 3]) {
    const ring = new T.Mesh(ringGeometry, trim);
    ring.rotation.y = Math.PI / 2;
    ring.rotation.x = tilt;
    rig.add(ring);
  }
  add(new T.TorusGeometry(R + 0.09, 0.06, 12, 96), trim, (mesh) => { mesh.position.y = YC; });

  // Pintu di dasar tabung, pipa siku, rel pemenang, alas, dan kaki.
  add(new T.TorusGeometry(pr, 0.06, 12, 40), trim, (mesh) => { mesh.rotation.x = Math.PI / 2; mesh.position.y = HOLE_Y; });
  const gate = add(new T.CylinderGeometry(pr, pr, 0.06, 32), trim, (mesh) => { mesh.position.y = HOLE_Y; });
  add(new T.CylinderGeometry(pr, pr, HOLE_Y - PIPE_Y, 32), chrome, (mesh) => { mesh.position.y = (HOLE_Y + PIPE_Y) / 2; });
  add(new T.SphereGeometry(pr, 32, 16), chrome, (mesh) => { mesh.position.y = PIPE_Y; });
  add(new T.CylinderGeometry(pr, pr, PIPE_END, 32), chrome, (mesh) => { mesh.rotation.x = Math.PI / 2; mesh.position.set(0, PIPE_Y, PIPE_END / 2); });
  add(new T.TorusGeometry(pr, 0.05, 10, 40), trim, (mesh) => { mesh.position.set(0, PIPE_Y, PIPE_END); });
  const railWidth = MAX_SHOWN * SLOT + 0.4;
  add(new T.BoxGeometry(railWidth, 0.08, 1.0), dark, (mesh) => { mesh.position.set(0, PIPE_Y - r - 0.04, RAIL_Z); });
  // Bibir rel hanya di depan: bola datang dari mulut pipa di belakang rel.
  add(new T.BoxGeometry(railWidth, 0.2, 0.06), trim, (mesh) => { mesh.position.set(0, PIPE_Y - r + 0.06, RAIL_Z + 0.5); });
  const plate = add(new T.CylinderGeometry(3.4, 3.6, 0.25, 64), dark, (mesh) => { mesh.position.y = PIPE_Y - r - 0.22; });
  const legGeometry = keep(new T.CylinderGeometry(0.07, 0.09, YC - 0.6 - plate.position.y, 12));
  for (const [x, z] of [[-1.9, -1], [1.9, -1], [-1.9, 1], [1.9, 1]]) {
    const leg = new T.Mesh(legGeometry, chrome);
    leg.position.set(x, (YC - 0.6 + plate.position.y) / 2, z);
    scene.add(leg);
  }

  // Bola.
  const ballGeometry = keep(new T.SphereGeometry(r, 32, 24));
  const textures: import("three").Texture[] = [];
  const ballTexture = (label: string, color: string) => {
    const paper = doc.createElement("canvas");
    paper.width = 256;
    paper.height = 128;
    const pen = paper.getContext("2d");
    if (pen) {
      pen.fillStyle = color;
      pen.fillRect(0, 0, 256, 128);
      for (const cx of [64, 192]) {
        pen.fillStyle = "#ffffff";
        pen.beginPath();
        pen.arc(cx, 64, 36, 0, Math.PI * 2);
        pen.fill();
        pen.fillStyle = "#111111";
        pen.font = `bold ${label.length > 2 ? 24 : 32}px sans-serif`;
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText(label, cx, 66);
      }
    }
    const texture = new T.CanvasTexture(paper);
    texture.colorSpace = T.SRGBColorSpace;
    textures.push(texture);
    return texture;
  };
  const randomLabel = () => {
    const names = live.current.names;
    return names.length > 0 ? initialsOf(names[Math.floor(Math.random() * names.length)]).replace(/\./g, "") : "";
  };
  type Ball = { mesh: import("three").Mesh; material: import("three").MeshStandardMaterial; color: string; p: import("three").Vector3; v: import("three").Vector3; slot: number; swapped: boolean; from: import("three").Vector3 };
  const balls: Ball[] = Array.from({ length: BALLS }, (_, index) => {
    const color = BALL_COLORS[index % BALL_COLORS.length];
    const material = keep(new T.MeshStandardMaterial({ map: ballTexture(randomLabel(), color), roughness: 0.22, metalness: 0.05 }));
    const mesh = new T.Mesh(ballGeometry, material);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    scene.add(mesh);
    return {
      mesh, material, color, slot: -1, swapped: false, from: new T.Vector3(),
      p: new T.Vector3((Math.random() - 0.5) * 3, -R + r + Math.random() * 1.4, (Math.random() - 0.5) * 3),
      v: new T.Vector3(),
    };
  });

  const resize = () => {
    const rect = wrap.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(wrap);

  const gravity = new T.Vector3(0, -9.8, 0);
  const n = new T.Vector3();
  const wall = new T.Vector3();
  const tangent = new T.Vector3();
  const gatePoint = new T.Vector3(0, -R + r, 0);

  const step = (dt: number, stir: number, omega: number) => {
    for (const ball of balls) {
      if (ball.slot >= 0) continue;
      ball.v.addScaledVector(gravity, dt);
      if (stir > 0) {
        // Udara dari tengah bawah: bola naik lewat tengah, menyebar di atas, jatuh lewat pinggir.
        const spread = ball.p.x * ball.p.x + ball.p.z * ball.p.z;
        const jet = Math.exp(-spread / 1.1) * (ball.p.y < R * 0.5 ? 1 : 0.2);
        ball.v.y += (10 + Math.random() * 34) * jet * stir * dt;
        if (ball.p.y > R * 0.35) {
          n.set(ball.p.x, 0, ball.p.z);
          const length = n.length() || 1;
          ball.v.x += (n.x / length) * 9 * stir * dt;
          ball.v.z += (n.z / length) * 9 * stir * dt;
        }
        ball.v.x += (Math.random() - 0.5) * 16 * stir * dt;
        ball.v.z += (Math.random() - 0.5) * 16 * stir * dt;
      }
      ball.v.multiplyScalar(1 - 0.15 * dt);
      ball.p.addScaledVector(ball.v, dt);
      const distance = ball.p.length();
      const limit = R - r;
      if (distance > limit) {
        n.copy(ball.p).divideScalar(distance);
        ball.p.copy(n).multiplyScalar(limit);
        const into = ball.v.dot(n);
        if (into > 0) ball.v.addScaledVector(n, -1.55 * into);
        wall.set(-omega * ball.p.y, omega * ball.p.x, 0);
        tangent.copy(ball.v).addScaledVector(n, -ball.v.dot(n));
        ball.v.addScaledVector(tangent.sub(wall), -0.12);
      }
    }
    for (let i = 0; i < BALLS; i += 1) {
      for (let j = i + 1; j < BALLS; j += 1) {
        const a = balls[i];
        const b = balls[j];
        n.subVectors(b.p, a.p);
        const gap = n.length();
        if (gap >= 2 * r || gap < 1e-4) continue;
        n.divideScalar(gap);
        const push = (2 * r - gap) / 2;
        const aFixed = a.slot >= 0;
        const bFixed = b.slot >= 0;
        if (aFixed && bFixed) continue;
        if (aFixed) b.p.addScaledVector(n, push * 2);
        else if (bFixed) a.p.addScaledVector(n, -push * 2);
        else {
          a.p.addScaledVector(n, -push);
          b.p.addScaledVector(n, push);
        }
        const closing = b.v.dot(n) - a.v.dot(n);
        if (closing < 0) {
          const impulse = (-1.7 * closing) / 2;
          if (!aFixed) a.v.addScaledVector(n, -impulse);
          if (!bFixed) b.v.addScaledVector(n, impulse);
        }
      }
    }
  };

  const resetChosen = () => {
    for (const ball of balls) {
      if (ball.slot < 0) continue;
      ball.slot = -1;
      ball.p.set((Math.random() - 0.5) * 1.5, -R + r + 0.8, (Math.random() - 0.5) * 1.5);
      ball.v.set(0, 0, 0);
      ball.mesh.visible = true;
      if (ball.swapped) {
        ball.material.map = ballTexture(randomLabel(), ball.color);
        ball.material.needsUpdate = true;
        ball.swapped = false;
      }
    }
  };

  let revealAt: number | null = null;
  let revealRound = live.current.round;
  let mountedAt = view.performance.now();
  let spin = 0;
  let last = mountedAt;
  let frame = 0;

  const draw = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const { shownNames: names, speed, round } = live.current;
    const pace = SPEED[speed];
    if (round !== revealRound) {
      revealRound = round;
      revealAt = null;
      skipReveal.current = false;
      mountedAt = now;
      resetChosen();
    }
    if (names.length > 0 && revealAt === null) revealAt = skipReveal.current ? now - 60_000 : now;
    if (names.length === 0 && revealAt !== null) {
      revealAt = null;
      resetChosen();
    }
    const t = revealAt === null ? -1 : (now - revealAt) / 1000;
    const sinceStart = (now - mountedAt) / 1000;

    // Tiupan: naik di awal, penuh selama mengundi, mereda saat pemenang datang.
    const stir = t < 0 ? clamp01(sinceStart / 0.8) : Math.max(0, 1 - t / 0.9);
    const omega = (0.2 + stir * 0.5) * pace;
    spin += dt * omega;
    rig.rotation.z = spin;
    step(dt / 2, stir * pace, omega);
    step(dt / 2, stir * pace, omega);

    const firstStart = 1.0;
    const gap = DRUM_DROP_GAP_MS / 1000;
    const lastPass = firstStart + (names.length - 1) * gap + 1.0;
    const open = t < 0 ? 0 : clamp01((t - 0.7) / 0.3) * (1 - clamp01((t - lastPass) / 0.4));
    gate.position.x = open * pr * 2.1;

    for (let i = 0; i < names.length && t >= 0; i += 1) {
      const start = firstStart + i * gap;
      if (t < start) break;
      let ball = balls.find((item) => item.slot === i);
      if (!ball) {
        // Bola yang sedang paling dekat pintu yang keluar.
        const free = balls.filter((item) => item.slot < 0);
        ball = free.reduce((best, item) => {
          const score = (item.p.y + Math.abs(item.p.x) * 0.3 + Math.abs(item.p.z) * 0.3);
          const bestScore = (best.p.y + Math.abs(best.p.x) * 0.3 + Math.abs(best.p.z) * 0.3);
          return score < bestScore ? item : best;
        });
        ball.slot = i;
        ball.from.copy(ball.p);
      }
      const local = t - start;
      const slotX = (i - (names.length - 1) / 2) * SLOT;
      if (local < 0.5) {
        ball.p.lerpVectors(ball.from, gatePoint, easeInOut(local / 0.5));
        ball.mesh.rotation.y += dt * 2;
        ball.mesh.visible = true;
      } else if (local < 1.0) {
        // Di dalam pipa: tidak terlihat. Inisial pemenang dipasang di sini.
        ball.mesh.visible = false;
        if (!ball.swapped) {
          ball.material.map = ballTexture(initialsOf(names[i]).replace(/\./g, ""), ball.color);
          ball.material.needsUpdate = true;
          ball.swapped = true;
        }
        ball.p.set(0, PIPE_Y - YC, PIPE_END * ((local - 0.5) / 0.5));
      } else {
        ball.mesh.visible = true;
        const out = clamp01((local - 1.0) / 0.35);
        const roll = easeOut(clamp01((local - 1.35) / 0.85));
        const z = PIPE_END + (RAIL_Z - PIPE_END) * out;
        const x = slotX * roll;
        ball.p.set(x, PIPE_Y - YC, z);
        ball.mesh.rotation.set((z - RAIL_Z) / r, 0, -(x - slotX) / r);
      }
    }

    for (const ball of balls) {
      ball.mesh.position.set(ball.p.x, ball.p.y + YC, ball.p.z);
      if (ball.slot < 0) {
        ball.mesh.rotation.x += (ball.v.z * dt) / r * 0.5;
        ball.mesh.rotation.z -= (ball.v.x * dt) / r * 0.5;
      }
    }

    // Kamera: seluruh mesin, lalu turun ke rel saat bola pertama keluar.
    const portrait = Math.max(1, 1.5 / Math.max(0.3, camera.aspect));
    const dolly = t < 0 ? 0 : clamp01((t - 2.4) / 1.6);
    const ease = dolly * dolly * (3 - 2 * dolly);
    const near = (4.8 + names.length * 0.3) * portrait;
    const far = 10.5 * portrait;
    camera.position.set(0, 0.6 + (PIPE_Y + 2.2 - 0.6) * ease, far + (RAIL_Z + near - far) * ease);
    look.set(0, -0.4 + (PIPE_Y + 0.3 + 0.4) * ease, (RAIL_Z - 0.4) * ease);
    camera.lookAt(look);
    railLight.intensity = t > 2 ? 2.5 : 0;
    renderer.render(scene, camera);
    frame = view.requestAnimationFrame(draw);
  };
  frame = view.requestAnimationFrame(draw);

  return () => {
    view.cancelAnimationFrame(frame);
    observer.disconnect();
    for (const texture of textures) texture.dispose();
    for (const item of disposables) item.dispose();
    renderer.dispose();
  };
}
