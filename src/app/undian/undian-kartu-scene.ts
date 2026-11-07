// ===========================================================================
// Mesin Kartu: adegan three.js (tanpa React)
// ===========================================================================
//
// Port dari prototipe v3 yang disetujui Hanung (7 Nov 2026). Mesin vending
// dengan kaca, rak, spiral, dan keypad; MC "mengetik" kode slot, spiral
// berputar, bungkus foil jatuh ke laci lalu diangkat ke depan kamera. Bungkus
// bergetar dan cahaya bocor dari sobekannya dalam warna kartu teratas, disobek
// dari kiri ke kanan, tumpukan kartu ditarik keluar, lalu kartu dibuka satu
// per satu dan duduk di grid. Kartu emas terakhir mendapat babak sendiri.
//
// Kontraknya sama dengan animasi lain: adegan ini tidak tahu pemenang sebelum
// `live.winners` terisi. Pembukaan (PACK_INTRO_MS) berjalan selama mengundi;
// bungkus menunggu sambil bergetar pelan sampai nama datang, baru disobek.
// Semua jadwal setelah itu memakai PACK_TIMING di lib/undian-kartu, angka yang
// sama dengan revealSettleMs.

import type * as THREE_NS from "three";
import {
  PACK_TIMING, isBigCard, isLegendCard, type TierNumber,
} from "@/lib/undian-kartu";

type Three = typeof THREE_NS;
type V3 = THREE_NS.Vector3;
type Group = THREE_NS.Group;
type Mesh = THREE_NS.Mesh;

export type PackCard = { name: string; prize: string; tier: TierNumber };

export type PackLive = {
  current: {
    round: number;
    /** Warna dan hadiah tiap kartu dari rencana bungkus (tanpa nama); diketahui sejak mengundi. */
    plan: { prize: string; tier: TierNumber }[];
    /** Kartu dengan nama; kosong sampai waktu reveal. */
    cards: PackCard[];
    sound: boolean;
    fanfare: boolean;
    title: string;
    greenScreen: boolean;
  };
};

export type PackHud = {
  status: HTMLElement | null;
  count: HTMLElement | null;
  prize: HTMLElement | null;
  win: HTMLElement | null;
  winName: HTMLElement | null;
  winPrize: HTMLElement | null;
  flash: HTMLElement | null;
  onDone: (round: number) => void;
};

const GOLD = "#E8C968";
const RARITY: Record<TierNumber, string> = { 1: "DOORPRIZE", 2: "HADIAH BESAR", 3: "GRAND PRIZE" };
const TIER_HEX: Record<TierNumber, string> = { 1: "#5aa9ff", 2: "#c27bff", 3: "#ffc94a" };
const TEXT_HEX: Record<TierNumber, string> = { 1: "#8fb4ff", 2: "#c9a2ff", 3: GOLD };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;

type Extras = {
  RoomEnvironment: typeof import("three/examples/jsm/environments/RoomEnvironment.js").RoomEnvironment;
  RoundedBoxGeometry: typeof import("three/examples/jsm/geometries/RoundedBoxGeometry.js").RoundedBoxGeometry;
};

export function buildPackScene(T: Three, X: Extras, canvas: HTMLCanvasElement, wrap: HTMLElement, live: PackLive, hud: PackHud, skipToEnd: { current: boolean }) {
  const view = wrap.ownerDocument.defaultView ?? window;
  const doc = wrap.ownerDocument;
  const family = () => view.getComputedStyle(wrap).fontFamily || "sans-serif";

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, Math.max(1.25, view.devicePixelRatio || 1)));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const textures: THREE_NS.Texture[] = [];
  const scene = new T.Scene();
  const BG = new T.Color("#0b0a12");
  const pmrem = new T.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new X.RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  const cam = new T.PerspectiveCamera(32, 16 / 9, 0.005, 60);
  let W = 1;
  let H = 1;
  const resize = () => {
    W = Math.max(1, wrap.clientWidth);
    H = Math.max(1, wrap.clientHeight);
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(wrap);

  const amb = new T.HemisphereLight("#cfd8ff", "#201828", 0.35);
  scene.add(amb);
  const keyL = new T.SpotLight("#fff1dc", 40, 12, 0.6, 0.6, 1.4);
  keyL.position.set(1.6, 3.2, 2.6);
  keyL.target.position.set(0, 0.9, 0);
  keyL.castShadow = true;
  keyL.shadow.mapSize.set(1024, 1024);
  keyL.shadow.bias = -0.0004;
  scene.add(keyL, keyL.target);
  const floor = new T.Mesh(new T.PlaneGeometry(30, 30), new T.MeshStandardMaterial({ color: "#16141e", roughness: 0.35, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wall = new T.Mesh(new T.PlaneGeometry(30, 8), new T.MeshStandardMaterial({ color: "#1b1826", roughness: 0.9 }));
  wall.position.set(0, 4, -0.6);
  scene.add(wall);

  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = doc.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) draw(g, w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    textures.push(t);
    return t;
  };
  const fitText = (g: CanvasRenderingContext2D, text: string, weight: number, size: number, min: number, maxW: number) => {
    let fs = size;
    g.font = `${weight} ${fs}px ${family()}`;
    while (g.measureText(text).width > maxW && fs > min) {
      fs -= 2;
      g.font = `${weight} ${fs}px ${family()}`;
    }
    return fs;
  };

  // ---------- mesin ----------
  const M = new T.Group();
  scene.add(M);
  const MW = 1.0;
  const MH = 1.86;
  const MD = 0.78;
  const cabMat = new T.MeshPhysicalMaterial({ color: "#1e2a5a", metalness: 0.6, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE_NS.Material = cabMat, rad = 0.012) => {
    const m = new T.Mesh(new X.RoundedBoxGeometry(w, h, d, 3, rad), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    M.add(m);
    return m;
  };
  const FT = 0.03;
  panel(0.04, MH, MD, -MW / 2 + 0.02, MH / 2, -MD / 2, cabMat, 0.018);
  panel(0.04, MH, MD, MW / 2 - 0.02, MH / 2, -MD / 2, cabMat, 0.018);
  panel(MW, 0.05, MD, 0, MH - 0.025, -MD / 2, cabMat, 0.018);
  panel(MW, 0.04, MD, 0, 0.02, -MD / 2);
  panel(MW, MH, 0.03, 0, MH / 2, -MD + 0.015);
  const WX = -0.12;
  const WW = 0.66;
  const WY0 = 0.56;
  const WY1 = 1.66;
  const WH = WY1 - WY0;
  const recess = new T.Mesh(new T.BoxGeometry(WW, WH, 0.62), new T.MeshStandardMaterial({ color: "#f3f1ff", roughness: 0.9, side: T.BackSide, emissive: "#ffffff", emissiveIntensity: 0.08 }));
  recess.position.set(WX, (WY0 + WY1) / 2, -0.31 - 0.002);
  M.add(recess);
  {
    const xl = -MW / 2;
    const xr = MW / 2;
    const wl = WX - WW / 2;
    const wr = WX + WW / 2;
    panel(wl - xl, MH, FT, (xl + wl) / 2, MH / 2, -FT / 2);
    panel(xr - wr, MH, FT, (xr + wr) / 2, MH / 2, -FT / 2);
    panel(WW + 0.002, MH - WY1, FT, WX, (MH + WY1) / 2, -FT / 2, cabMat, 0.006);
    const bw = WW - 0.06;
    panel(WW + 0.002, 0.22, FT, WX, 0.11, -FT / 2, cabMat, 0.006);
    panel(WW + 0.002, WY0 - 0.42, FT, WX, (WY0 + 0.42) / 2, -FT / 2, cabMat, 0.006);
    panel((WW - bw) / 2 + 0.001, 0.2, FT, wl + (WW - bw) / 4, 0.32, -FT / 2, cabMat, 0.004);
    panel((WW - bw) / 2 + 0.001, 0.2, FT, wr - (WW - bw) / 4, 0.32, -FT / 2, cabMat, 0.004);
    const strip = new T.Mesh(new T.BoxGeometry(0.012, MH - 0.1, 0.004), new T.MeshBasicMaterial({ color: GOLD }));
    strip.position.set(wr + 0.03, MH / 2, 0.002);
    M.add(strip);
  }
  const frameMat = new T.MeshStandardMaterial({ color: "#b9c0cc", metalness: 0.9, roughness: 0.25 });
  for (const [w, h, x, y] of [[WW + 0.03, 0.015, WX, WY1 + 0.008], [WW + 0.03, 0.015, WX, WY0 - 0.008], [0.015, WH + 0.03, WX - WW / 2 - 0.008, (WY0 + WY1) / 2], [0.015, WH + 0.03, WX + WW / 2 + 0.008, (WY0 + WY1) / 2]]) {
    const f = new T.Mesh(new T.BoxGeometry(w, h, 0.02), frameMat);
    f.position.set(x, y, 0.006);
    M.add(f);
  }
  const glass = new T.Mesh(new T.PlaneGeometry(WW, WH), new T.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.03, transparent: true, opacity: 0.12, envMapIntensity: 1.6, clearcoat: 1 }));
  glass.position.set(WX, (WY0 + WY1) / 2, 0.004);
  M.add(glass);
  const innerL = new T.PointLight("#fff8ee", 2.2, 1.6, 1.5);
  innerL.position.set(WX, WY1 - 0.05, -0.12);
  M.add(innerL);
  const innerL2 = new T.PointLight("#fff8ee", 1.2, 1.4, 1.5);
  innerL2.position.set(WX, WY0 + 0.35, -0.12);
  M.add(innerL2);
  const ledStrip = new T.Mesh(new T.BoxGeometry(WW - 0.02, 0.012, 0.02), new T.MeshBasicMaterial({ color: "#ffffff" }));
  ledStrip.position.set(WX, WY1 - 0.015, -0.03);
  M.add(ledStrip);

  let signMat: THREE_NS.MeshStandardMaterial | null = null;
  const sign = new T.Mesh(new T.PlaneGeometry(MW - 0.08, 0.19), new T.MeshStandardMaterial({ roughness: 0.4 }));
  sign.position.set(0, MH - 0.12, 0.002);
  M.add(sign);
  let signTitle = "";
  const setSign = (title: string) => {
    if (title === signTitle) return;
    signTitle = title;
    const tex = canvasTex(1024, 220, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "#2b1a6b");
      gr.addColorStop(1, "#6b1a5a");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = GOLD;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `900 120px ${family()}`;
      g.fillText("LUCKY PACK", w / 2, h / 2 + 6);
      if (title) {
        g.fillStyle = "rgba(255,255,255,.75)";
        fitText(g, title, 600, 30, 16, w - 80);
        g.fillText(title, w / 2, h - 26);
      }
    });
    signMat?.map?.dispose();
    signMat?.dispose();
    signMat = new T.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.4 });
    sign.material = signMat;
  };

  const ROWS = 4;
  const COLS = 4;
  const DEEP = 4;
  const PW = 0.082;
  const PH = 0.142;
  const packArtTex = (hue: number, cards: number) => canvasTex(512, 900, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, `hsl(${hue},70%,22%)`);
    gr.addColorStop(0.55, `hsl(${(hue + 30) % 360},75%,38%)`);
    gr.addColorStop(1, `hsl(${(hue + 60) % 360},70%,20%)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.save();
    g.globalAlpha = 0.16;
    g.strokeStyle = "#fff";
    g.lineWidth = 3;
    for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - h * 0.6, h); g.stroke(); }
    g.restore();
    g.save();
    g.translate(w / 2, h * 0.47);
    for (let i = 0; i < 28; i += 1) { g.rotate((Math.PI * 2) / 28); g.fillStyle = i % 2 ? "rgba(255,230,160,.18)" : "rgba(255,255,255,.05)"; g.beginPath(); g.moveTo(0, 0); g.lineTo(-30, -420); g.lineTo(30, -420); g.fill(); }
    g.restore();
    g.save();
    g.translate(w / 2, h * 0.45);
    g.fillStyle = GOLD;
    g.beginPath();
    for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 62 : 150; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath();
    g.fill();
    g.strokeStyle = "#fff6d0";
    g.lineWidth = 6;
    g.stroke();
    g.restore();
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.shadowColor = "rgba(0,0,0,.5)";
    g.shadowBlur = 12;
    g.font = `900 92px ${family()}`;
    g.fillText("LUCKY", w / 2, h * 0.72);
    g.font = `900 70px ${family()}`;
    g.fillStyle = GOLD;
    g.fillText("PACK", w / 2, h * 0.8);
    g.shadowBlur = 0;
    g.fillStyle = "rgba(255,255,255,.85)";
    const title = live.current.title.toUpperCase();
    if (title) { fitText(g, title, 700, 30, 16, w - 60); g.fillText(title, w / 2, h * 0.14); }
    g.font = `600 24px ${family()}`;
    g.fillStyle = "rgba(255,255,255,.7)";
    g.fillText(cards > 1 ? `${cards} KARTU PEMENANG` : "1 KARTU PEMENANG", w / 2, h * 0.88);
    for (const [y0, y1] of [[0, h * 0.07], [h * 0.93, h]]) {
      g.fillStyle = "rgba(220,220,230,.85)";
      g.fillRect(0, y0, w, y1 - y0);
      g.fillStyle = "rgba(0,0,0,.25)";
      for (let x = 0; x < w; x += 10) g.fillRect(x, y0, 4, y1 - y0);
    }
  });
  const bulgeGeo = (w: number, h: number, depth: number, segX = 18, segY = 28, crimp = 0.07) => {
    const geo = new T.PlaneGeometry(w, h, segX, segY);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i) / (w / 2);
      const y = p.getY(i) / (h / 2);
      const inCrimp = Math.abs(y) > 1 - crimp * 2;
      const b = inCrimp ? 0 : (1 - Math.abs(x) ** 4) * (1 - (Math.abs(y) / (1 - crimp * 2)) ** 6);
      const ridge = inCrimp ? Math.sin(p.getX(i) * 900) * 0.0006 : 0;
      p.setZ(i, Math.max(0, b) * depth + ridge);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const foilMat = (tex: THREE_NS.Texture) => new T.MeshPhysicalMaterial({ map: tex, metalness: 0.75, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15, iridescence: 0.55, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 700], envMapIntensity: 1.3, side: T.DoubleSide });
  const shelfMats = new Map<THREE_NS.Texture, THREE_NS.MeshStandardMaterial>();
  const shelfFoil = (tex: THREE_NS.Texture) => {
    let mat = shelfMats.get(tex);
    if (!mat) { mat = new T.MeshStandardMaterial({ map: tex, metalness: 0.65, roughness: 0.3, envMapIntensity: 1.3, side: T.DoubleSide }); shelfMats.set(tex, mat); }
    return mat;
  };
  const PACK_BACK = new T.MeshStandardMaterial({ color: "#c9ccd6", metalness: 0.85, roughness: 0.3, side: T.DoubleSide });
  const PACK_GEO = bulgeGeo(PW, PH, 0.006);
  const makePack = (tex: THREE_NS.Texture) => {
    const g = new T.Group();
    const front = new T.Mesh(PACK_GEO, shelfFoil(tex));
    const back = new T.Mesh(PACK_GEO, PACK_BACK);
    back.rotation.y = Math.PI;
    g.add(front, back);
    return g;
  };
  const coilMat = new T.MeshStandardMaterial({ color: "#d9dde4", metalness: 1, roughness: 0.2 });
  const coilGeo = (len: number, r: number, turns: number) => {
    const pts: V3[] = [];
    const n = turns * 24;
    for (let i = 0; i <= n; i += 1) { const a = (i / 24) * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * r, Math.sin(a) * r, (-i / n) * len)); }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, 0.0028, 6, false);
  };
  const COIL_GEO = coilGeo(0.52, 0.036, 6);
  type Slot = { code: string; cx: number; sy: number; coil: Mesh; packs: Group[]; hue: number };
  const slots: Slot[] = [];
  const hues = [210, 280, 330, 20, 160, 250, 190, 300];
  const shelfMat = new T.MeshStandardMaterial({ color: "#d0d4dc", metalness: 0.7, roughness: 0.35 });
  const lipMat = new T.MeshStandardMaterial({ color: "#2a2f3a", roughness: 0.6 });
  const labelC = (txt: string) => canvasTex(128, 48, (g, w, h) => { g.fillStyle = "#111"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = `700 30px ${family()}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, w / 2, h / 2 + 2); });
  const rowH = WH / ROWS;
  const shelfTex = new Map<number, THREE_NS.Texture>();
  for (let r = 0; r < ROWS; r += 1) {
    const sy = WY1 - (r + 1) * rowH + 0.01;
    const shelf = new T.Mesh(new T.BoxGeometry(WW - 0.01, 0.008, 0.6), shelfMat);
    shelf.position.set(WX, sy, -0.31);
    shelf.receiveShadow = true;
    M.add(shelf);
    const lip = new T.Mesh(new T.BoxGeometry(WW - 0.01, 0.03, 0.006), lipMat);
    lip.position.set(WX, sy + 0.01, -0.008);
    M.add(lip);
    for (let c = 0; c < COLS; c += 1) {
      const cx = WX - WW / 2 + (c + 0.5) * (WW / COLS);
      const code = `${"ABCD"[r]}${c + 1}`;
      const lab = new T.Mesh(new T.PlaneGeometry(0.045, 0.017), new T.MeshBasicMaterial({ map: labelC(code) }));
      lab.position.set(cx, sy + 0.01, -0.004);
      M.add(lab);
      const coil = new T.Mesh(COIL_GEO, coilMat);
      coil.position.set(cx, sy + 0.04, -0.03);
      M.add(coil);
      const hue = hues[(r * COLS + c) % hues.length];
      let tex = shelfTex.get(hue);
      if (!tex) { tex = packArtTex(hue, 0); shelfTex.set(hue, tex); }
      const packs: Group[] = [];
      for (let d = 0; d < DEEP; d += 1) { const p = makePack(tex); p.position.set(cx, sy + 0.004 + PH / 2, -0.2 - d * 0.125); p.rotation.x = -0.08; M.add(p); packs.push(p); }
      slots.push({ code, cx, sy, coil, packs, hue });
    }
  }
  const PX = WX + WW / 2 + (MW / 2 - (WX + WW / 2)) / 2;
  const dispC = doc.createElement("canvas");
  dispC.width = 256;
  dispC.height = 96;
  const dispTex = new T.CanvasTexture(dispC);
  textures.push(dispTex);
  const setDisp = (t: string) => {
    const g = dispC.getContext("2d");
    if (!g) return;
    g.fillStyle = "#04140a";
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = "#3cff8f";
    g.shadowColor = "#3cff8f";
    g.shadowBlur = 12;
    g.font = "700 54px monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(t, 128, 52);
    dispTex.needsUpdate = true;
  };
  setDisp("PILIH");
  const disp = new T.Mesh(new T.PlaneGeometry(0.15, 0.056), new T.MeshBasicMaterial({ map: dispTex, toneMapped: false }));
  disp.position.set(PX, 1.5, 0.002);
  M.add(disp);
  const keys: Record<string, Mesh> = {};
  const keyFaces: Record<string, THREE_NS.MeshStandardMaterial> = {};
  const keyGeo = new X.RoundedBoxGeometry(0.036, 0.036, 0.012, 3, 0.005);
  const keySide = new T.MeshStandardMaterial({ color: "#c8ccd6", metalness: 0.5, roughness: 0.4 });
  ["A", "B", "C", "D", "1", "2", "3", "4", "OK"].forEach((kl, i) => {
    const kt = canvasTex(64, 64, (g) => { g.fillStyle = "#e9ebf0"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#1a1d26"; g.font = `700 ${kl.length > 1 ? 24 : 34}px ${family()}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(kl, 32, 34); });
    const face = new T.MeshStandardMaterial({ map: kt, roughness: 0.5, emissive: "#000000" });
    const key = new T.Mesh(keyGeo, [keySide, keySide, keySide, keySide, face, keySide]);
    key.position.set(PX - 0.045 + (i % 3) * 0.045, 1.38 - Math.floor(i / 3) * 0.045, 0.006);
    M.add(key);
    keys[kl] = key;
    keyFaces[kl] = face;
  });
  const coinSlot = new T.Mesh(new T.BoxGeometry(0.08, 0.012, 0.01), new T.MeshStandardMaterial({ color: "#0a0a0a" }));
  coinSlot.position.set(PX, 1.18, 0.004);
  M.add(coinSlot);
  const bin = new T.Mesh(new T.BoxGeometry(WW - 0.06, 0.2, 0.2), new T.MeshStandardMaterial({ color: "#07070a", roughness: 0.9, side: T.BackSide }));
  bin.position.set(WX, 0.32, -0.1);
  M.add(bin);
  const flapPivot = new T.Group();
  flapPivot.position.set(WX, 0.42, 0.012);
  M.add(flapPivot);
  const flap = new T.Mesh(new T.BoxGeometry(WW - 0.06, 0.2, 0.008), new T.MeshPhysicalMaterial({ color: "#20242e", metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.85 }));
  flap.position.y = -0.1;
  flapPivot.add(flap);
  const pushT = canvasTex(256, 48, (g, w, h) => { g.fillStyle = "rgba(255,255,255,.75)"; g.font = `700 26px ${family()}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("DORONG", w / 2, h / 2); });
  const pushL = new T.Mesh(new T.PlaneGeometry(0.12, 0.022), new T.MeshBasicMaterial({ map: pushT, transparent: true }));
  pushL.position.set(0, -0.1, 0.0045);
  flapPivot.add(pushL);

  // ---------- kartu ----------
  const CW = 0.063;
  const CH = 0.088;
  const CARD_GEO = (() => {
    const r = 0.0035;
    const w = CW;
    const h = CH;
    const s = new T.Shape();
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new T.ShapeGeometry(s, 8);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i += 1) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
    return g;
  })();
  const backTex = canvasTex(504, 704, (g, w, h) => {
    g.fillStyle = "#1a1446"; g.fillRect(0, 0, w, h); g.strokeStyle = GOLD; g.lineWidth = 16; g.beginPath(); g.roundRect(18, 18, w - 36, h - 36, 22); g.stroke();
    g.save(); g.translate(w / 2, h / 2); for (let i = 0; i < 24; i += 1) { g.rotate(Math.PI / 12); g.fillStyle = i % 2 ? "#251c63" : "#2f2478"; g.beginPath(); g.moveTo(0, 0); g.lineTo(-60, -420); g.lineTo(60, -420); g.fill(); } g.restore();
    g.fillStyle = GOLD; g.beginPath(); g.arc(w / 2, h / 2, 96, 0, 7); g.fill(); g.fillStyle = "#1a1446"; g.font = `900 40px ${family()}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("LUCKY", w / 2, h / 2 - 16); g.font = `800 30px ${family()}`; g.fillText("PACK", w / 2, h / 2 + 22);
  });
  const backMat = new T.MeshStandardMaterial({ map: backTex, roughness: 0.55 });
  const frontTex = (card: PackCard, idx: number, total: number) => canvasTex(630, 880, (g, w, h) => {
    const tier = card.tier;
    const col = TEXT_HEX[tier];
    const gr = g.createLinearGradient(0, 0, w, h);
    if (tier === 3) { gr.addColorStop(0, "#fff4c8"); gr.addColorStop(0.45, "#e8c968"); gr.addColorStop(1, "#a8761f"); } else if (tier === 2) { gr.addColorStop(0, "#f3e8ff"); gr.addColorStop(1, "#8c5ce6"); } else { gr.addColorStop(0, "#eef3ff"); gr.addColorStop(1, "#6f93e8"); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#0f0c22"; g.beginPath(); g.roundRect(28, 28, w - 56, h - 56, 18); g.fill();
    g.fillStyle = "#fff"; g.font = `800 30px ${family()}`; g.textAlign = "left"; g.fillText("PEMENANG", 56, 84);
    g.textAlign = "right"; g.fillStyle = col; g.font = `800 28px ${family()}`; g.fillText(total > 1 ? `${idx}/${total}` : "★".repeat(tier), w - 56, 84);
    const ag = g.createRadialGradient(w / 2, 300, 10, w / 2, 300, 300); ag.addColorStop(0, col); ag.addColorStop(0.6, "#2a1f5e"); ag.addColorStop(1, "#14102e");
    g.fillStyle = ag; g.beginPath(); g.roundRect(56, 110, w - 112, 380, 14); g.fill();
    g.save(); g.translate(w / 2, 300); g.globalAlpha = 0.25; for (let i = 0; i < 24; i += 1) { g.rotate(Math.PI / 12); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(0, 0); g.lineTo(-12, -260); g.lineTo(12, -260); g.fill(); } g.globalAlpha = 1;
    g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 46 : 112; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.restore();
    g.strokeStyle = gr; g.lineWidth = 6; g.beginPath(); g.roundRect(56, 110, w - 112, 380, 14); g.stroke();
    g.textAlign = "center"; g.fillStyle = "#fff";
    // Nama panjang: dua baris sebelum mengecil terlalu jauh.
    const name = card.name;
    const fs = fitText(g, name, 900, 70, 40, w - 110);
    if (g.measureText(name).width > w - 110 && name.includes(" ")) {
      const words = name.split(" ");
      const half = Math.ceil(words.length / 2);
      const a = words.slice(0, half).join(" ");
      const b = words.slice(half).join(" ");
      const fs2 = Math.min(fitText(g, a, 900, 58, 30, w - 110), fitText(g, b, 900, 58, 30, w - 110));
      g.font = `900 ${fs2}px ${family()}`;
      g.fillText(a, w / 2, 560);
      g.fillText(b, w / 2, 560 + fs2 * 1.05);
    } else {
      g.font = `900 ${fs}px ${family()}`;
      g.fillText(name, w / 2, 590);
    }
    g.fillStyle = col; fitText(g, card.prize, 800, 34, 20, w - 110); g.fillText(card.prize, w / 2, 660);
    g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(56, 695, w - 112, 2);
    g.fillStyle = "rgba(255,255,255,.75)"; g.font = `700 26px ${family()}`; g.fillText(RARITY[tier], w / 2, 748);
    const title = live.current.title;
    if (title) { g.fillStyle = "rgba(255,255,255,.6)"; fitText(g, title, 500, 22, 14, w - 110); g.fillText(title, w / 2, 792); }
  });
  const crackTex = canvasTex(504, 704, (g, w, h) => { g.strokeStyle = "#fff2b0"; g.shadowColor = "#ffc94a"; g.shadowBlur = 18; g.lineCap = "round"; const cx = w / 2; const cy = h / 2; for (let k = 0; k < 9; k += 1) { let x = cx; let y = cy; let a = (k / 9) * Math.PI * 2 + rand(-0.2, 0.2); g.lineWidth = 7; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 9; s += 1) { a += rand(-0.6, 0.6); const L = rand(25, 55); x += Math.cos(a) * L; y += Math.sin(a) * L; g.lineTo(x, y); g.lineWidth = Math.max(2, 7 - s); } g.stroke(); } });
  const sweepTex = canvasTex(256, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.45, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,.85)"); gr.addColorStop(0.55, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  type CardObj = Group & { userData: { name: string; sweep: Mesh; crack: Mesh; sweepOn: number | null; wobble: boolean; popped: boolean; owned: THREE_NS.Material[] } };
  const makeCard = (card: PackCard, idx: number, total: number) => {
    const g = new T.Group() as CardObj;
    const tier = card.tier;
    const fm = new T.MeshPhysicalMaterial({ map: frontTex(card, idx, total), roughness: tier === 3 ? 0.25 : 0.4, metalness: tier === 3 ? 0.35 : 0.1, iridescence: tier === 3 ? 0.9 : tier === 2 ? 0.5 : 0.15, iridescenceIOR: 1.8, iridescenceThicknessRange: [150, 650], clearcoat: 0.5, envMapIntensity: tier === 3 ? 1.5 : 1 });
    const f = new T.Mesh(CARD_GEO, fm);
    f.position.z = 0.0002;
    const b = new T.Mesh(CARD_GEO, backMat);
    b.rotation.y = Math.PI;
    b.position.z = -0.0002;
    f.castShadow = true;
    b.castShadow = true;
    g.add(f, b);
    const st = sweepTex.clone();
    textures.push(st);
    st.needsUpdate = true;
    st.repeat.set(0.5, 1);
    st.offset.x = 1;
    st.wrapS = T.ClampToEdgeWrapping;
    const swMat = new T.MeshBasicMaterial({ map: st, transparent: true, opacity: tier === 3 ? 0.9 : tier === 2 ? 0.7 : 0.45, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sw = new T.Mesh(CARD_GEO, swMat);
    sw.position.z = 0.0004;
    sw.rotation.z = -0.35;
    sw.visible = false;
    g.add(sw);
    const ckMat = new T.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ck = new T.Mesh(CARD_GEO, ckMat);
    ck.rotation.y = Math.PI;
    ck.position.z = -0.0004;
    g.add(ck);
    g.userData = { name: card.name, sweep: sw, crack: ck, sweepOn: null, wobble: false, popped: false, owned: [fm, swMat, ckMat] };
    return g;
  };

  // ---------- kamera ----------
  const camPos = new T.Vector3(1.25, 1.35, 2.5);
  const camLook = new T.Vector3(0.05, 1.05, 0);
  const goalPos = camPos.clone();
  const goalLook = camLook.clone();
  let camK = 2.2;
  let handheld = 0;
  const setShot = (p: V3, l: V3, k = 2.2) => { goalPos.copy(p); goalLook.copy(l); camK = k; };
  const led = () => W / H > 2.2;
  const shotMachine = (): [V3, V3] => (led() ? [new T.Vector3(1.1, 1.05, 3.6), new T.Vector3(0.75, 0.95, 0)] : [new T.Vector3(1.3, 1.15, 3.7), new T.Vector3(0.05, 0.95, 0)]);
  const R0 = new T.Vector3(0, 1.12, 0.85);
  const stackPos = (k: number) => new T.Vector3(R0.x + (k > 1 ? -0.02 : 0.07 + (led() ? 0.13 : 0)), R0.y - 0.003, R0.z);
  /**
   * Tata letak grid dari ukuran layar sebenarnya: tumpukan kartu di kiri, grid
   * di kanannya. Jumlah kolom dan skala dipilih supaya kartu sebesar mungkin di
   * layar (16:9, LED 3:1, HP tegak), lalu kamera mundur sejauh yang perlu.
   */
  const GAP = 1.08;
  let layoutKey = "";
  let layoutVal = { cols: 1, rows: 1, s: 1, gx0: 0, cx: 0, cy: 0, d: 0.33 };
  const gridLayout = (k: number) => {
    const key = `${k}:${W}:${H}`;
    if (key === layoutKey) return layoutVal;
    const aspect = W / H;
    const tanHalf = Math.tan(T.MathUtils.degToRad(cam.fov / 2));
    const sx = stackPos(k).x;
    const pad = 0.006;
    const gx0 = sx + CW / 2 + 0.012;
    const left = sx - CW / 2 - pad;
    // Bagian atas dan bawah layar dipakai HUD (status, hitungan, cadangan).
    const useH = 0.8;
    const useW = 0.94;
    let best = { score: 0, cols: 1, rows: k, s: 1, fh: 1 };
    for (let cols = 1; cols <= k; cols += 1) {
      const rows = Math.ceil(k / cols);
      for (let s = 0.2; s <= 1.0001; s += 0.02) {
        const wc = gx0 + cols * CW * GAP * s + pad - left;
        const hc = Math.max(rows * CH * GAP * s, CH) + pad * 2;
        const fh = Math.max(hc / useH, wc / (useW * aspect));
        const score = s / fh;
        if (score > best.score + 1e-9) best = { score, cols, rows, s, fh };
      }
    }
    const right = gx0 + best.cols * CW * GAP * best.s + pad;
    layoutVal = { cols: best.cols, rows: best.rows, s: best.s, gx0, cx: (left + right) / 2, cy: R0.y - 0.008, d: best.fh / 2 / tanHalf };
    layoutKey = key;
    return layoutVal;
  };
  const gridSlot = (i: number, k: number) => {
    const { cols, rows, s, gx0, cy } = gridLayout(k);
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? k - r * cols : cols;
    const c = (i % cols) + (cols - inRow) / 2;
    return { pos: new T.Vector3(gx0 + (c + 0.5) * CW * GAP * s, cy + ((rows - 1) / 2 - r) * CH * GAP * s, R0.z - 0.01), s };
  };
  /** Kamera akhir: tumpukan dan grid kartu memenuhi layar. */
  const gridShot = (k: number) => {
    const sp = stackPos(k);
    if (k === 1) { setShot(new T.Vector3(sp.x, sp.y + 0.005, sp.z + 0.3), sp.clone(), 1.8); return; }
    const { cx, cy, d } = gridLayout(k);
    setShot(new T.Vector3(cx, cy + 0.004, R0.z - 0.01 + d), new T.Vector3(cx, cy, R0.z - 0.01), 1.8);
  };

  // ---------- jam ----------
  // Jam maya: maju per frame dengan pengali `speed`. Bila nama datang sebelum
  // pembukaan selesai (Manual stop ditekan cepat), sisa pembukaan dipercepat.
  let VT = 0;
  let speed = 1;
  let runId = 0;
  type Waiter = { until: number; id: number; resolve: (ok: boolean) => void };
  let waiters: Waiter[] = [];
  type Tween = { t0: number; ms: number; fn: (t: number) => void; id: number; resolve: (ok: boolean) => void };
  let tweens: Tween[] = [];
  const tween = (ms: number, fn: (t: number) => void, id: number) => new Promise<boolean>((resolve) => {
    if (id !== runId) return resolve(false);
    fn(0);
    tweens.push({ t0: VT, ms, fn, id, resolve });
  });
  const wait = (ms: number, id: number) => new Promise<boolean>((resolve) => {
    if (id !== runId) return resolve(false);
    waiters.push({ until: VT + ms, id, resolve });
  });
  const stepClock = () => {
    const keepTweens: Tween[] = [];
    for (const tw of tweens) {
      if (tw.id !== runId) { tw.resolve(false); continue; }
      const t = clamp((VT - tw.t0) / tw.ms);
      tw.fn(t);
      if (t >= 1) tw.resolve(true);
      else keepTweens.push(tw);
    }
    tweens = keepTweens;
    const keepWaiters: Waiter[] = [];
    for (const w of waiters) {
      if (w.id !== runId) w.resolve(false);
      else if (VT >= w.until) w.resolve(true);
      else keepWaiters.push(w);
    }
    waiters = keepWaiters;
  };

  // ---------- suara (WebAudio, tanpa berkas) ----------
  let AC: AudioContext | null = null;
  let NOISE: AudioBuffer | null = null;
  const ac = () => {
    if (!live.current.sound || speed > 4) return null;
    try {
      const Ctor = view.AudioContext ?? (view as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      AC = AC ?? new Ctor();
      if (AC.state === "suspended") void AC.resume();
      if (!NOISE) {
        NOISE = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
        const d = NOISE.getChannelData(0);
        for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
      }
      return AC;
    } catch {
      return null;
    }
  };
  const env = (g: GainNode, t: number, a: number, peak: number, dec: number) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  const noise = (dur: number, f0: number, f1: number, q: number, peak: number, type: BiquadFilterType = "bandpass") => {
    const c = ac(); if (!c || !NOISE) return;
    const t = c.currentTime; const s = c.createBufferSource(); s.buffer = NOISE;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); env(g, t, 0.02, peak, dur); s.connect(f).connect(g).connect(c.destination); s.start(t); s.stop(t + dur + 0.1);
  };
  const tone = (freq: number, dur: number, type: OscillatorType = "sine", peak = 0.2, when = 0, f1?: number) => {
    const c = ac(); if (!c) return;
    const t = c.currentTime + when; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); env(g, t, 0.01, peak, dur); o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  };
  const timers = new Set<number>();
  const SFX = {
    beep: () => tone(1320, 0.08, "square", 0.05),
    clunk: () => { tone(140, 0.18, "sine", 0.35, 0, 60); noise(0.12, 900, 300, 1, 0.2); },
    tear: (d: number) => { for (let i = 0; i < d * 18; i += 1) { const id = view.setTimeout(() => { timers.delete(id); noise(0.05, 2500 + Math.random() * 2500, 1800, 2, 0.08 + Math.random() * 0.08); }, i * (1000 / 18)); timers.add(id); } },
    whoosh: () => noise(0.45, 400, 3500, 1.2, 0.25),
    boom: (p = 0.5) => { tone(110, 0.9, "sine", p, 0, 38); noise(0.3, 200, 60, 0.7, p * 0.5, "lowpass"); },
    shimmer: (tier: TierNumber) => { const base = [523, 659, 784, 1047, 1319, 1568]; const n = tier === 3 ? 6 : tier === 2 ? 5 : 3; for (let i = 0; i < n; i += 1) tone(base[i], 0.5, "triangle", 0.07, i * 0.06); },
    crack: () => { noise(0.08, 4000, 1200, 3, 0.3); tone(90, 0.25, "sine", 0.25, 0, 50); },
    rumble: (d: number) => noise(d, 80, 160, 0.8, 0.25, "lowpass"),
    fanfare: () => { if (!live.current.fanfare) return; const ch = [[523, 659, 784], [587, 740, 880], [659, 831, 988], [784, 988, 1175, 1568]]; ch.forEach((c, i) => c.forEach((f) => tone(f, i === 3 ? 1.6 : 0.28, "sawtooth", 0.045, i * 0.22))); },
  };

  // ---------- efek: sinar, percikan, konfeti, guncangan, neon ----------
  const TIERCOL: Record<TierNumber, THREE_NS.Color> = { 1: new T.Color(TIER_HEX[1]), 2: new T.Color(TIER_HEX[2]), 3: new T.Color(TIER_HEX[3]) };
  const raysTex = canvasTex(512, 512, (g, w, h) => { g.translate(w / 2, h / 2); for (let i = 0; i < 36; i += 1) { g.rotate((Math.PI * 2) / 36); const gr = g.createLinearGradient(0, 0, 0, -w / 2); gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(-(i % 2 ? 10 : 22), -w / 2); g.lineTo(i % 2 ? 10 : 22, -w / 2); g.fill(); } });
  const glowTex = canvasTex(256, 256, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const raysMat = new T.MeshBasicMaterial({ map: raysTex, transparent: false, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rays = new T.Mesh(new T.PlaneGeometry(1, 1), raysMat);
  rays.renderOrder = -12;
  scene.add(rays);
  const glowMat = new T.MeshBasicMaterial({ map: glowTex, transparent: false, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new T.Mesh(new T.PlaneGeometry(1, 1), glowMat);
  glow.renderOrder = -11;
  scene.add(glow);
  const fx = { rays: 0, raysTo: 0, glow: 0, glowTo: 0, pos: new T.Vector3(), size: 0.2, col: new T.Color() };
  const setRays = (p: V3, col: THREE_NS.Color, size: number, r: number, g: number) => { fx.pos.copy(p); fx.col.copy(col); fx.size = size; fx.raysTo = r; fx.glowTo = g; };

  const PN = 900;
  const pGeo = new T.BufferGeometry();
  const pPos = new Float32Array(PN * 3);
  const pCol = new Float32Array(PN * 3);
  const pVel = new Float32Array(PN * 3);
  const pLife = new Float32Array(PN);
  pGeo.setAttribute("position", new T.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new T.BufferAttribute(pCol, 3));
  const sparks = new T.Points(pGeo, new T.PointsMaterial({ size: 0.0035, map: glowTex, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let pHead = 0;
  for (let i = 0; i < PN; i += 1) pPos[i * 3 + 1] = -99;
  const white = new T.Color("#ffffff");
  const burst = (c: V3, col: THREE_NS.Color, n: number, sp: number) => {
    if (speed > 4) return;
    for (let j = 0; j < n; j += 1) {
      pHead = (pHead + 1) % PN; const i = pHead;
      const th = Math.random() * Math.PI * 2; const ph = Math.acos(rand(-1, 1)); const v = sp * rand(0.3, 1);
      pPos.set([c.x, c.y, c.z], i * 3);
      pVel.set([Math.sin(ph) * Math.cos(th) * v, Math.sin(ph) * Math.sin(th) * v + sp * 0.2, Math.cos(ph) * v * 0.5], i * 3);
      pLife[i] = rand(0.7, 1.6);
      const cc = Math.random() < 0.3 ? white : col;
      pCol.set([cc.r, cc.g, cc.b], i * 3);
    }
  };
  const CN = 260;
  const confetti = new T.InstancedMesh(new T.PlaneGeometry(0.006, 0.0035), new T.MeshBasicMaterial({ side: T.DoubleSide, toneMapped: false }), CN);
  confetti.frustumCulled = false;
  scene.add(confetti);
  type Bit = { p: V3; v: V3; r: V3; w: V3; life: number };
  const cf: Bit[] = [];
  const m4 = new T.Matrix4();
  const q4 = new T.Quaternion();
  const e4 = new T.Euler();
  const s4 = new T.Vector3(1, 1, 1);
  const CONF_COLS = ["#ffd35a", "#ffffff", "#ff6b8b", "#6be3ff", "#b48bff", "#ffe9a6"].map((c) => new T.Color(c));
  for (let i = 0; i < CN; i += 1) { cf.push({ p: new T.Vector3(0, -99, 0), v: new T.Vector3(), r: new T.Vector3(), w: new T.Vector3(), life: 0 }); confetti.setColorAt(i, CONF_COLS[i % CONF_COLS.length]); }
  const confettiBurst = (c: V3, spread: number) => { if (speed > 4) return; cf.forEach((o) => { o.p.set(c.x + rand(-spread, spread), c.y + rand(0.02, 0.12), c.z + rand(-0.05, 0.03)); o.v.set(rand(-0.08, 0.08), rand(-0.02, 0.06), rand(-0.02, 0.04)); o.r.set(rand(0, 6), rand(0, 6), rand(0, 6)); o.w.set(rand(-9, 9), rand(-9, 9), rand(-9, 9)); o.life = rand(3, 5); }); };
  let shake = 0;
  const kick = (a: number) => { if (speed <= 4) shake = Math.max(shake, a); };

  const NB = 44;
  const bulbs = new T.InstancedMesh(new T.SphereGeometry(0.0075, 10, 8), new T.MeshBasicMaterial({ toneMapped: false }), NB);
  M.add(bulbs);
  {
    const per = 2 * (WW + WH) + 0.08;
    for (let i = 0; i < NB; i += 1) {
      let d = (i / NB) * per; let x: number; let y: number;
      const w = WW + 0.04; const h = WH + 0.04;
      if (d < w) { x = -w / 2 + d; y = h / 2; } else if ((d -= w) < h) { x = w / 2; y = h / 2 - d; } else if ((d -= h) < w) { x = w / 2 - d; y = -h / 2; } else { d -= w; x = -w / 2; y = -h / 2 + Math.min(d, h); }
      m4.makeTranslation(WX + x, (WY0 + WY1) / 2 + y, 0.012);
      bulbs.setMatrixAt(i, m4);
    }
  }
  let neonMode: "chase" | "jackpot" | "off" = "chase";
  const bulbOn = new T.Color("#ffd35a");
  const bulbOff = new T.Color("#3a2a10");
  const bulbAlt = new T.Color("#ff4f8a");
  for (let i = 0; i < NB; i += 1) bulbs.setColorAt(i, bulbOn);
  const slotLight = new T.PointLight("#ffd35a", 0, 0.5, 1.5);
  M.add(slotLight);

  const revealG = new T.Group();
  scene.add(revealG);
  const veilMat = new T.MeshBasicMaterial({ color: "#05040a", transparent: false, opacity: 0, depthWrite: false, blending: T.CustomBlending, blendSrc: T.SrcAlphaFactor, blendDst: T.OneMinusSrcAlphaFactor });
  const veil = new T.Mesh(new T.PlaneGeometry(8, 6), veilMat);
  veil.position.set(0, 1.2, 0.62);
  veil.renderOrder = -15;
  scene.add(veil);
  const spot = new T.SpotLight("#fff6e6", 0, 3, 0.5, 0.7, 1.2);
  spot.position.set(R0.x + 0.4, R0.y + 0.7, R0.z + 0.6);
  spot.target.position.copy(R0);
  scene.add(spot, spot.target);
  M.traverse((o) => { o.renderOrder = -20; });
  floor.renderOrder = -20;
  wall.renderOrder = -20;

  const gs = () => live.current.greenScreen;
  const veilTo = (o: number) => { veilMat.opacity = gs() ? 0 : o; };

  // ---------- HUD (DOM, ditulis langsung tanpa render React) ----------
  const setText = (el: HTMLElement | null, value: string) => { if (el && el.textContent !== value) el.textContent = value; };
  const status = (t: string) => setText(hud.status, t);
  const showWin = (card: PackCard | null) => {
    if (!hud.win) return;
    if (!card) { hud.win.style.opacity = "0"; hud.win.style.transform = "translateY(12px)"; return; }
    setText(hud.winName, card.name);
    setText(hud.winPrize, card.prize);
    if (hud.winName) hud.winName.style.color = card.tier === 3 ? GOLD : TEXT_HEX[card.tier];
    hud.win.style.opacity = "1";
    hud.win.style.transform = "none";
  };
  const flash = () => { if (!hud.flash || speed > 4) return; hud.flash.style.opacity = "1"; const id = view.setTimeout(() => { timers.delete(id); if (hud.flash) hud.flash.style.opacity = "0"; }, 300); timers.add(id); };

  // ---------- pembersihan antar undian ----------
  const owned = new Set<{ dispose: () => void }>();
  const clearReveal = () => {
    for (const child of [...revealG.children]) {
      child.traverse((o) => {
        const ud = o.userData as { owned?: THREE_NS.Material[] };
        ud.owned?.forEach((m) => { (m as THREE_NS.MeshPhysicalMaterial).map?.dispose(); m.dispose(); });
      });
      revealG.remove(child);
    }
    for (const item of owned) item.dispose();
    owned.clear();
  };
  const resetMachine = () => {
    for (const s of slots) {
      s.coil.rotation.z = 0;
      s.packs.forEach((p, d) => { if (p.parent !== M) M.add(p); p.visible = true; p.position.set(s.cx, s.sy + 0.004 + PH / 2, -0.2 - d * 0.125); p.rotation.set(-0.08, 0, 0); });
    }
    flapPivot.rotation.x = 0;
    veilTo(0);
    M.visible = true;
    neonMode = "chase";
    spot.intensity = 0;
    amb.intensity = 0.35;
    innerL.intensity = 2.2;
    setRays(R0, TIERCOL[1], 0.1, 0, 0);
    for (let i = 0; i < PN; i += 1) { pLife[i] = 0; pPos[i * 3 + 1] = -99; }
    cf.forEach((o) => { o.life = 0; o.p.y = -99; });
    setDisp("PILIH");
    showWin(null);
    setText(hud.count, "");
    setText(hud.prize, "");
  };

  // ---------- satu undian ----------
  const cardsReady = () => live.current.cards.length > 0;
  /** Tunggu sampai nama datang; bungkus bergetar pelan selama menunggu. */
  const waitCards = (id: number, onIdle: () => void) => new Promise<boolean>((resolve) => {
    const tick = () => {
      if (id !== runId) return resolve(false);
      if (cardsReady()) return resolve(true);
      onIdle();
      waiters.push({ until: VT + 16, id, resolve: (ok) => (ok ? tick() : resolve(false)) });
    };
    tick();
  });

  /** Setelah halaman dimuat ulang di tengah hasil: langsung ke grid kartu, tanpa pertunjukan. */
  const placeFinal = () => {
    clearReveal();
    resetMachine();
    const cards = live.current.cards;
    const k = cards.length;
    if (k === 0) return;
    veilTo(0.78);
    if (gs()) M.visible = false;
    spot.intensity = 6;
    amb.intensity = 0.15;
    cards.forEach((card, i) => {
      const c = makeCard(card, i + 1, k);
      const slot = k === 1 ? { pos: stackPos(1), s: 1 } : gridSlot(i, k);
      c.position.copy(slot.pos);
      c.scale.setScalar(slot.s);
      c.userData.wobble = k > 1;
      revealG.add(c);
    });
    gridShot(k);
    camPos.copy(goalPos);
    camLook.copy(goalLook);
    setText(hud.count, k > 1 ? `${k} / ${k}` : "");
    status("Selesai");
    if (k === 1) showWin(cards[0]);
    hud.onDone(live.current.round);
  };

  const run = async (round: number) => {
    const id = ++runId;
    speed = 1;
    clearReveal();
    resetMachine();
    setSign(live.current.title);
    const plan = live.current.plan.length > 0 ? live.current.plan : [{ prize: "", tier: 1 as TierNumber }];
    const kPlan = plan.length;
    const topTier = Math.max(...plan.map((item) => item.tier)) as TierNumber;
    const leakCol = TIERCOL[topTier];
    const sl = slots[Math.floor(Math.random() * slots.length)];
    const [mp, ml] = shotMachine();
    setShot(mp, ml, 2.2);
    handheld = 0;
    setText(hud.count, kPlan > 1 ? `0 / ${kPlan}` : "");
    // Pembukaan: kode slot, spiral, bungkus jatuh dan diangkat. Total PACK_INTRO_MS.
    const fastIfReady = () => { if (cardsReady() && speed < 4) speed = 4; };
    status("Memilih slot...");
    if (!(await wait(700, id))) return;
    fastIfReady();
    setShot(new T.Vector3(PX + 0.25, 1.42, 0.95), new T.Vector3(PX - 0.05, 1.38, 0), 2.6);
    if (!(await wait(500, id))) return;
    for (let i = 0; i < 10; i += 1) { setDisp(slots[Math.floor(Math.random() * slots.length)].code); if (!(await wait(50 + i * i * 3.2, id))) return; }
    setDisp("");
    if (!(await wait(200, id))) return;
    const pressKey = async (kl: string) => {
      SFX.beep();
      const k = keys[kl];
      const z = k.position.z;
      keyFaces[kl].emissive.set("#3cff8f");
      keyFaces[kl].emissiveIntensity = 0.4;
      const ok = await tween(160, (t) => { k.position.z = z - Math.sin(t * Math.PI) * 0.006; }, id);
      keyFaces[kl].emissive.set("#000000");
      return ok;
    };
    if (!(await pressKey(sl.code[0]))) return;
    setDisp(`${sl.code[0]}_`);
    if (!(await wait(200, id))) return;
    if (!(await pressKey(sl.code[1]))) return;
    setDisp(sl.code);
    if (!(await wait(260, id))) return;
    if (!(await pressKey("OK"))) return;
    status(`Slot ${sl.code}`);
    neonMode = "jackpot";
    slotLight.position.set(sl.cx, sl.sy + 0.08, -0.02);
    SFX.shimmer(2);
    fastIfReady();
    setShot(new T.Vector3(sl.cx + 0.25, sl.sy + 0.2, 0.95), new T.Vector3(sl.cx, sl.sy + 0.02, -0.1), 2.2);
    if (!(await wait(500, id))) return;
    const front = sl.packs[0];
    const z0s = sl.packs.map((p) => p.position.z);
    if (!(await tween(1300, (t) => { const e = ease(t); sl.coil.rotation.z = -e * Math.PI * 2; sl.packs.forEach((p, d) => { p.position.z = z0s[d] + e * 0.125; }); front.rotation.x = -0.08 - easeIn(clamp((t - 0.7) / 0.3)) * 0.5; }, id))) return;
    status("Bungkus jatuh!");
    setShot(new T.Vector3(WX + 0.35, 0.62, 1.25), new T.Vector3(WX, 0.42, 0), 2.6);
    const fy = front.position.y;
    const fz = front.position.z;
    if (!(await tween(600, (t) => { front.position.y = fy + (0.27 - fy) * easeIn(t); front.position.z = fz + (-0.05 - fz) * t; front.rotation.x = -0.6 - t * 2.4; front.rotation.z = t * 0.5; }, id))) return;
    SFX.clunk();
    kick(0.006);
    if (!(await tween(400, (t) => { front.position.y = 0.27 + Math.sin(t * Math.PI) * 0.03 * (1 - t); front.rotation.x = -3.0 + t * (3.0 - Math.PI / 2 + 0.1); front.position.z = -0.05 - 0.04 * t; }, id))) return;
    status("Diambil...");
    fastIfReady();
    if (!(await tween(400, (t) => { flapPivot.rotation.x = -ease(t) * 1.1; }, id))) return;
    M.remove(front);
    revealG.add(front);
    const bigTex = packArtTex(sl.hue, kPlan);
    const bigFoil = foilMat(bigTex);
    owned.add(bigFoil);
    owned.add(bigTex);
    (front.children[0] as Mesh).material = bigFoil;
    (front.children[0] as Mesh).castShadow = true;
    const pStart = front.position.clone();
    const rStart = front.rotation.clone();
    const packAt = stackPos(kPlan).clone().add(new T.Vector3(0, 0.005, 0.02));
    { const d = led() ? 0.36 : 0.42; const lx = packAt.x + (kPlan > 1 ? 0.05 : 0); setShot(new T.Vector3(lx, packAt.y + 0.01, packAt.z + d), new T.Vector3(lx, packAt.y + 0.01, packAt.z), 2.4); }
    handheld = 1;
    if (!(await tween(1200, (t) => { const e = ease(t); front.position.lerpVectors(pStart, packAt, e); front.position.y += Math.sin(t * Math.PI) * 0.12; front.rotation.set(rStart.x * (1 - e), Math.PI * 2 * (1 - e) * 0.5, rStart.z * (1 - e) + Math.sin(t * Math.PI) * 0.2); flapPivot.rotation.x = -1.1 * (1 - clamp(t * 2)); }, id))) return;
    neonMode = "chase";
    if (!(await tween(500, (t) => { spot.intensity = 6 * t; veilTo(0.78 * t); if (gs() && t > 0.5) M.visible = false; amb.intensity = 0.35 - 0.2 * t; innerL.intensity = 2.2 * (1 - t * 0.7); }, id))) return;
    // Pembukaan selesai. Menunggu nama sambil bergetar pelan.
    speed = 1;
    const tear = buildTearable(front, bigTex);
    revealG.remove(front);
    revealG.add(tear.g);
    const tearPt = tear.g.position.clone().add(new T.Vector3(0, PH / 2 - PH * 0.1, 0.008));
    const leak = new T.PointLight(leakCol, 0, 0.4, 1.2);
    leak.position.set(0, PH / 2 - PH * 0.1, 0.03);
    tear.g.add(leak);
    const baseRot = tear.g.rotation.z;
    status("...");
    if (!(await waitCards(id, () => { tear.g.rotation.z = baseRot + Math.sin(VT * 0.05) * 0.004; setRays(tearPt, leakCol, 0.1, 0.06, 0.15); leak.intensity = 0.3; }))) return;

    // Nama datang. Kartu, hadiah, dan warna diambil dari hasil server.
    const cards = live.current.cards.slice(0, 30);
    const k = cards.length;
    const tiers = cards.map((card) => card.tier);
    SFX.rumble(topTier === 3 ? 1.6 : 1);
    const tense = PACK_TIMING.tense(topTier);
    if (!(await tween(tense, (t) => { const a = easeIn(t) * 0.03; tear.g.rotation.z = baseRot + Math.sin(VT * 0.09) * a; tear.g.position.x = tearPt.x + Math.sin(VT * 0.13) * a * 0.05; setRays(tearPt, leakCol, 0.1 + t * 0.06, t * 0.25, t * 0.5); leak.intensity = t * 1.5; }, id))) return;
    tear.g.position.x = tearPt.x;
    status("Sobek!");
    const tearMs = PACK_TIMING.tear(topTier);
    SFX.tear(tearMs / 1000);
    if (!(await tween(tearMs, (t) => { tear.progress(t); setRays(tearPt, leakCol, 0.16 + t * 0.1, 0.25 + t * 0.55, 0.5 + t * 0.5); leak.intensity = 1.5 + t * 3; if (Math.random() < 0.25) burst(tearPt.clone().add(new T.Vector3(-PW / 2 + t * PW, 0, 0)), leakCol, 3, 0.05); }, id))) return;
    SFX.whoosh();
    burst(tearPt, leakCol, topTier === 3 ? 160 : 80, 0.12);
    kick(0.004);
    if (!(await tween(PACK_TIMING.strip, (t) => { tear.flyStrip(t); }, id))) return;
    status(k > 1 ? `${k} kartu di dalam` : "Kartunya...");
    setShot(goalPos.clone().add(new T.Vector3(0, 0.03, 0)), goalLook.clone().add(new T.Vector3(0, 0.03, 0)), 2.4);
    const stack: CardObj[] = [];
    for (let i = 0; i < k; i += 1) { const c = makeCard(cards[i], i + 1, k); c.position.set(0, -0.012, 0.003 - (k - i) * 0.00025); c.rotation.y = Math.PI; tear.g.add(c); stack.push(c); }
    if (!(await tween(PACK_TIMING.pull, (t) => { const e = ease(t); stack.forEach((c) => { c.position.y = -0.012 + e * 0.075; }); leak.intensity = 4.5 * (1 - e); setRays(tearPt.clone().add(new T.Vector3(0, e * 0.04, 0)), leakCol, 0.26, 0.8 - t * 0.5, 1 - t * 0.4); }, id))) return;
    const stackG = new T.Group();
    revealG.add(stackG);
    stackG.position.copy(tear.g.position).add(new T.Vector3(0, 0.063, 0));
    stack.forEach((c, i) => { tear.g.remove(c); c.position.set(0, 0, (k - i) * 0.0004); stackG.add(c); });
    const tgY = tear.g.position.y;
    gridShot(k);
    if (!(await tween(PACK_TIMING.drop, (t) => { tear.g.position.y = tgY - easeIn(t) * 0.3; tear.g.rotation.x = t * 0.6; stackG.position.lerp(stackPos(k), 0.2); setRays(stackG.position, leakCol, 0.2, 0.2 * (1 - t), 0.5); }, id))) return;
    revealG.remove(tear.g);
    tear.dispose();
    setRays(stackG.position, leakCol, 0.16, 0, 0);
    const heroAt = (fill: number) => { const dir = goalLook.clone().sub(goalPos).normalize(); const D = CH / (fill * 2 * Math.tan(T.MathUtils.degToRad(cam.fov / 2))); return goalPos.clone().addScaledVector(dir, D).add(new T.Vector3(0, CH * 0.06, 0)); };
    const takeTop = (c: CardObj) => { const p0 = new T.Vector3(); c.getWorldPosition(p0); stackG.remove(c); revealG.add(c); c.position.copy(p0); c.rotation.set(0, Math.PI, 0); return p0; };
    const mixed = new Set(cards.map((card) => card.prize)).size > 1;

    for (let i = 0; i < k; i += 1) {
      const c = stack[i];
      const card = cards[i];
      const tier = card.tier;
      const col = TIERCOL[tier];
      const legend = isLegendCard(tiers, i);
      const big = isBigCard(tiers, i);
      if (mixed) setText(hud.prize, legend ? "???" : card.prize);
      if (legend) {
        const L = PACK_TIMING.legend;
        status(k > 1 ? "Kartu terakhir..." : "...");
        neonMode = "off";
        const p0 = takeTop(c);
        const hp = heroAt(0.62);
        if (!(await tween(L.blackout, (t) => { veilTo(0.78 + 0.2 * t); spot.intensity = 6 * (1 - t); stackG.children.forEach((x) => { x.visible = t < 0.5; }); }, id))) return;
        if (gs()) M.visible = false;
        SFX.rumble(1.8);
        if (!(await tween(L.float, (t) => { const e = ease(t); c.position.lerpVectors(p0, hp, e); c.rotation.set(0, Math.PI + Math.sin(t * Math.PI) * 0.25, Math.sin(t * 6) * 0.03); setRays(c.position, col, 0.16 + e * 0.1, e * 0.2, e * 0.6); }, id))) return;
        for (let s = 0; s < L.cracks; s += 1) {
          SFX.crack();
          kick(0.003 + s * 0.002);
          (c.userData.crack.material as THREE_NS.MeshBasicMaterial).opacity = (s + 1) / L.cracks;
          setRays(c.position, col, 0.26 + s * 0.05, 0.25 + s * 0.2, 0.7 + s * 0.15);
          burst(c.position, col, 30 + s * 30, 0.06);
          if (!(await tween(L.crack, (t) => { c.rotation.z = Math.sin(t * 60) * 0.012 * (1 - t); }, id))) return;
        }
        SFX.whoosh();
        if (!(await tween(L.flip, (t) => { const e = easeOut(t); c.rotation.set(0, Math.PI + e * Math.PI * 3, 0); c.position.z = hp.z + Math.sin(t * Math.PI) * 0.03; if (t > 0.6 && !c.userData.popped) { c.userData.popped = true; flash(); SFX.boom(0.8); SFX.fanfare(); burst(c.position, col, 520, 0.28); confettiBurst(c.position, 0.25); kick(0.012); setRays(c.position, col, 0.55, 0.85, 0.75); } }, id))) return;
        c.rotation.set(0, 0, 0);
        c.userData.sweepOn = VT;
        setText(hud.count, k > 1 ? `${i + 1} / ${k}` : "");
        status("GRAND PRIZE!");
        setText(hud.prize, mixed ? card.prize : "");
        showWin(card);
        if (!(await wait(L.hold, id))) return;
        if (k > 1) {
          showWin(null);
          const slot = gridSlot(i, k);
          const h0 = c.position.clone();
          setRays(slot.pos, col, 0.12, 0.25, 0.4);
          veilTo(0.78);
          if (!(await tween(L.toGrid, (t) => { const e = ease(t); c.position.lerpVectors(h0, slot.pos, e); c.scale.setScalar(1 + (slot.s - 1) * e); }, id))) return;
          c.userData.wobble = true;
        }
        continue;
      }
      status(k > 1 ? `Kartu ${i + 1}` : "Kartunya...");
      if (big) {
        const B = PACK_TIMING.big;
        const teaseMs = B.tease(tier, i);
        if (tier > 1) SFX.rumble(teaseMs / 1000);
        if (!(await tween(teaseMs, (t) => { setRays(stackG.position, col, 0.14 + t * 0.06, t * (tier > 1 ? 0.5 : 0.2), 0.3 + t * 0.5); c.position.x = Math.sin(VT * 0.12) * 0.0008 * t * tier; }, id))) return;
        const p0 = takeTop(c);
        const hp = heroAt(k === 1 ? 0.62 : 0.58);
        SFX.whoosh();
        const spins = tier === 1 ? 1 : 2;
        if (!(await tween(B.fly(tier), (t) => { const e = easeOut(t); c.position.lerpVectors(p0, hp, e); c.position.y += Math.sin(t * Math.PI) * 0.02; c.rotation.set(0, Math.PI + e * Math.PI * (2 * spins - 1), Math.sin(t * Math.PI) * 0.2); setRays(c.position, col, 0.2 + e * 0.2, 0.3 + e * 0.3, 0.6); if (t > 0.7 && !c.userData.popped) { c.userData.popped = true; SFX.boom(tier === 1 ? 0.35 : 0.55); SFX.shimmer(tier); burst(c.position, col, tier === 1 ? 140 : 280, tier === 1 ? 0.14 : 0.2); kick(tier === 1 ? 0.004 : 0.007); setRays(c.position, col, 0.45, 0.85, 1); if (k === 1 && tier === 3) { confettiBurst(c.position, 0.2); SFX.fanfare(); } } }, id))) return;
        c.rotation.set(0, 0, 0);
        c.userData.sweepOn = VT;
        setText(hud.count, k > 1 ? `${i + 1} / ${k}` : "");
        status(k > 1 ? `Kartu ${i + 1} · ${RARITY[tier]}` : "Pemenang!");
        if (k === 1) showWin(card);
        if (!(await wait(B.hold(tier, k === 1), id))) return;
        if (k === 1) break;
        const slot = gridSlot(i, k);
        const h0 = c.position.clone();
        setRays(stackG.position, col, 0.14, 0, 0.2);
        if (!(await tween(B.toGrid, (t) => { const e = ease(t); c.position.lerpVectors(h0, slot.pos, e); c.rotation.z = Math.sin(t * Math.PI) * -0.2; c.scale.setScalar(1 + (slot.s - 1) * e); }, id))) return;
        c.userData.wobble = true;
      } else {
        const Q = PACK_TIMING.quick;
        const p0 = takeTop(c);
        const slot = gridSlot(i, k);
        SFX.shimmer(1);
        if (!(await tween(Q.flip, (t) => { const e = easeOut(t); c.rotation.set(0, Math.PI + e * Math.PI, 0); c.position.z = p0.z + Math.sin(t * Math.PI) * 0.02; if (t > 0.6 && !c.userData.popped) { c.userData.popped = true; burst(c.position, col, 50, 0.08); } }, id))) return;
        c.rotation.set(0, 0, 0);
        setText(hud.count, `${i + 1} / ${k}`);
        if (!(await wait(Q.hold, id))) return;
        if (!(await tween(Q.toGrid, (t) => { const e = ease(t); c.position.lerpVectors(p0, slot.pos, e); c.position.z += Math.sin(t * Math.PI) * 0.015; c.scale.setScalar(1 + (slot.s - 1) * e); }, id))) return;
        c.userData.wobble = true;
      }
    }
    setRays(stackPos(k), TIERCOL[topTier], 0.2, 0, 0);
    status("Selesai");
    if (mixed) setText(hud.prize, "");
    hud.onDone(round);
  };

  function buildTearable(pack: Group, tex: THREE_NS.Texture) {
    const g = new T.Group();
    g.position.copy(pack.position);
    g.rotation.copy(pack.rotation);
    const mat = foilMat(tex);
    const backMatT = new T.MeshPhysicalMaterial({ color: "#c9ccd6", metalness: 0.85, roughness: 0.3, side: T.DoubleSide });
    const geos: THREE_NS.BufferGeometry[] = [];
    const tearY = PH / 2 - PH * 0.1;
    const bodyH = PH / 2 + tearY;
    const bodyGeo = bulgeGeo(PW, bodyH, 0.006, 18, 24, 0.04);
    geos.push(bodyGeo);
    const uv = bodyGeo.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setY(i, uv.getY(i) * (bodyH / PH));
    const body = new T.Mesh(bodyGeo, mat);
    body.position.y = -PH / 2 + bodyH / 2;
    g.add(body);
    const backGeo = bulgeGeo(PW, bodyH, 0.006, 18, 24, 0.04);
    geos.push(backGeo);
    const backB = new T.Mesh(backGeo, backMatT);
    backB.rotation.y = Math.PI;
    backB.position.y = body.position.y;
    g.add(backB);
    const N = 16;
    const segW = PW / N;
    const stripH = PH - bodyH;
    const segs: Group[] = [];
    const segBack = new T.MeshPhysicalMaterial({ color: "#c9ccd6", metalness: 0.85, roughness: 0.3 });
    for (let i = 0; i < N; i += 1) {
      const pv = new T.Group();
      pv.position.set(-PW / 2 + (i + 0.5) * segW, tearY, 0);
      g.add(pv);
      const sg = new T.PlaneGeometry(segW * 1.02, stripH);
      geos.push(sg);
      const su = sg.attributes.uv;
      for (let j = 0; j < su.count; j += 1) su.setXY(j, (i + su.getX(j)) / N, (bodyH + su.getY(j) * stripH) / PH);
      const sm = new T.Mesh(sg, mat);
      sm.position.y = stripH / 2;
      sm.position.z = 0.0005;
      pv.add(sm);
      const sbg = new T.PlaneGeometry(segW * 1.02, stripH);
      geos.push(sbg);
      const sb = new T.Mesh(sbg, segBack);
      sb.rotation.y = Math.PI;
      sb.position.y = stripH / 2;
      pv.add(sb);
      segs.push(pv);
    }
    const edgePts: V3[] = [];
    for (let i = 0; i <= N * 3; i += 1) edgePts.push(new T.Vector3(-PW / 2 + (i / (N * 3)) * PW, tearY + (i % 2 ? 0.0012 : -0.0008), 0.0062 * (1 - Math.abs((i / (N * 3)) * 2 - 1) ** 4)));
    const edgeGeo = new T.BufferGeometry().setFromPoints(edgePts);
    geos.push(edgeGeo);
    const edgeMat = new T.LineBasicMaterial({ color: "#ffffff" });
    const edge = new T.Line(edgeGeo, edgeMat);
    edge.geometry.setDrawRange(0, 0);
    g.add(edge);
    const fn = 60;
    const fg = new T.BufferGeometry();
    geos.push(fg);
    fg.setAttribute("position", new T.BufferAttribute(new Float32Array(fn * 3), 3));
    const flMat = new T.PointsMaterial({ size: 0.0012, color: "#fff4c8", transparent: true });
    const fl = new T.Points(fg, flMat);
    g.add(fl);
    const fv: ([number, number, number] | null)[] = [];
    for (let i = 0; i < fn; i += 1) { fg.attributes.position.setXYZ(i, 0, -9, 0); fv.push(null); }
    const baseY = g.position.y;
    const x1 = segs.map((pv) => pv.position.x);
    return {
      g,
      progress(t: number) {
        const frontAt = t * (N + 4);
        segs.forEach((pv, i) => { const p = clamp(frontAt - i, 0, 4) / 4; pv.rotation.x = -easeOut(p) * 1.2; pv.rotation.z = easeOut(p) * 0.25; pv.position.y = tearY + easeOut(p) * 0.004; });
        edge.geometry.setDrawRange(0, Math.floor(clamp(frontAt / N) * edgePts.length));
        g.rotation.z = Math.sin(t * 50) * 0.006;
        g.position.y = baseY + Math.sin(t * 70) * 0.0008;
        const fxp = -PW / 2 + clamp(frontAt / N) * PW;
        const pa = fg.attributes.position;
        for (let i = 0; i < fn; i += 1) {
          if (!fv[i] && Math.random() < 0.08) { fv[i] = [rand(-0.02, 0.06), rand(0.02, 0.08), rand(0, 0.05)]; pa.setXYZ(i, fxp, tearY, 0.006); }
          const v = fv[i];
          if (v) { pa.setXYZ(i, pa.getX(i) + v[0] * 0.016, pa.getY(i) + v[1] * 0.016, pa.getZ(i) + v[2] * 0.016); v[1] -= 0.004; }
        }
        pa.needsUpdate = true;
      },
      flyStrip(t: number) {
        const e = easeIn(t);
        g.position.y = baseY;
        segs.forEach((pv, i) => { pv.position.x = x1[i] + t * 0.05 + e * 0.15; pv.position.y = tearY + 0.004 + e * 0.06; pv.rotation.z = 0.25 + t * 1.6; });
        flMat.opacity = 1 - t;
      },
      dispose() {
        for (const geo of geos) geo.dispose();
        for (const m of [mat, backMatT, segBack, edgeMat, flMat]) m.dispose();
      },
    };
  }

  // ---------- loop ----------
  let raf = 0;
  let last = view.performance.now();
  let seenRound = Number.NaN;
  let disposed = false;
  const frame = (now: number) => {
    if (disposed) return;
    const raw = Math.min(now - last, 100);
    last = now;
    VT += raw * speed;
    const dt = Math.min((raw * Math.min(speed, 4)) / 1000, 0.05 * Math.min(speed, 4));
    const t = VT / 1000;
    if (live.current.round !== seenRound) {
      seenRound = live.current.round;
      if (skipToEnd.current && cardsReady()) { runId += 1; placeFinal(); } else void run(seenRound);
      skipToEnd.current = false;
    }
    stepClock();
    scene.background = gs() ? null : BG;
    floor.visible = !gs();
    wall.visible = !gs();
    const kk = 1 - Math.exp(-dt * camK);
    camPos.lerp(goalPos, kk);
    camLook.lerp(goalLook, kk);
    cam.position.copy(camPos);
    cam.position.x += handheld * Math.sin(t * 1.3) * 0.0025;
    cam.position.y += handheld * Math.sin(t * 1.7 + 1) * 0.0018;
    cam.lookAt(camLook);
    revealG.children.forEach((child, i) => {
      const ud = child.userData as Partial<CardObj["userData"]>;
      if (!ud.name) return;
      if (ud.wobble) { child.rotation.x = Math.sin(t * 1.1 + i) * 0.04; child.rotation.y = Math.sin(t * 0.8 + i) * 0.08; }
      if (ud.sweepOn != null && ud.sweep) {
        const u = ((VT - ud.sweepOn) / 1400) % 1.6;
        const map = (ud.sweep.material as THREE_NS.MeshBasicMaterial).map;
        if (map) map.offset.x = 0.9 - u * 1.25;
        ud.sweep.visible = u < 1.2;
      }
    });
    // efek
    fx.rays += (fx.raysTo - fx.rays) * (1 - Math.exp(-dt * 6));
    fx.glow += (fx.glowTo - fx.glow) * (1 - Math.exp(-dt * 6));
    rays.position.copy(fx.pos);
    glow.position.copy(fx.pos);
    const back = cam.getWorldDirection(new T.Vector3()).multiplyScalar(0.02);
    rays.position.add(back);
    glow.position.add(back.multiplyScalar(0.9));
    rays.quaternion.copy(cam.quaternion);
    glow.quaternion.copy(cam.quaternion);
    rays.rotateZ(t * 0.35);
    rays.scale.setScalar(fx.size * (1 + Math.sin(t * 2) * 0.03));
    glow.scale.setScalar(fx.size * 0.8);
    raysMat.opacity = fx.rays;
    glowMat.opacity = fx.glow;
    raysMat.color.copy(fx.col);
    glowMat.color.copy(fx.col);
    rays.visible = fx.rays > 0.01;
    glow.visible = fx.glow > 0.01;
    for (let i = 0; i < PN; i += 1) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      const o = i * 3;
      pVel[o + 1] -= 0.12 * dt;
      pVel[o] *= 0.985; pVel[o + 1] *= 0.985; pVel[o + 2] *= 0.985;
      pPos[o] += pVel[o] * dt; pPos[o + 1] += pVel[o + 1] * dt; pPos[o + 2] += pVel[o + 2] * dt;
      if (pLife[i] <= 0) pPos[o + 1] = -99;
      else { pCol[o] *= 0.995; pCol[o + 1] *= 0.995; pCol[o + 2] *= 0.995; }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    cf.forEach((o, i) => {
      if (o.life > 0) {
        o.life -= dt; o.v.y -= 0.05 * dt; o.v.multiplyScalar(0.97); o.v.y = Math.max(o.v.y, -0.035);
        o.p.addScaledVector(o.v, dt); o.p.x += Math.sin(t * 3 + i) * 0.0003; o.r.addScaledVector(o.w, dt);
        if (o.life <= 0) o.p.y = -99;
      }
      e4.set(o.r.x, o.r.y, o.r.z); q4.setFromEuler(e4); m4.compose(o.p, q4, s4); confetti.setMatrixAt(i, m4);
    });
    confetti.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NB; i += 1) {
      const c = neonMode === "jackpot" ? (Math.floor(t * 10) % 2 ? bulbOn : bulbAlt) : neonMode === "off" ? bulbOff : (i + Math.floor(t * 9)) % 4 === 0 ? bulbAlt : (Math.floor(i / 2 + t * 4) % 2 ? bulbOn : bulbOff);
      bulbs.setColorAt(i, c);
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    slotLight.intensity = neonMode === "jackpot" ? 1.2 + Math.sin(t * 30) : 0;
    shake *= Math.exp(-dt * 5);
    if (shake > 0.0002) { cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; }
    renderer.render(scene, cam);
    raf = view.requestAnimationFrame(frame);
  };
  resize();
  setSign(live.current.title);
  {
    const [p, l] = shotMachine();
    camPos.copy(p); camLook.copy(l); goalPos.copy(p); goalLook.copy(l);
  }
  raf = view.requestAnimationFrame(frame);

  return () => {
    disposed = true;
    runId += 1;
    stepClock();
    view.cancelAnimationFrame(raf);
    observer.disconnect();
    for (const id of timers) view.clearTimeout(id);
    clearReveal();
    scene.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) m.dispose();
    });
    for (const t of textures) t.dispose();
    signMat?.dispose();
    envTarget.dispose();
    pmrem.dispose();
    void AC?.close().catch(() => {});
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
