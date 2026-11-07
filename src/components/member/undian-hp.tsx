"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { LandingLang } from "@/lib/landing-i18n";
import { UNDIAN_HP_UI } from "@/lib/member/undian-hp-i18n";
import {
  CAHAYA_PADAM_MS, CAHAYA_SEBAR_MS, acakTetap, bacaHasil, campur, emberHp, selisihJam, sisaMenyala, waktuTampil, warnaPertunjukan,
  type CahayaHasil, type CahayaJadwal, type Rgb,
} from "@/lib/undian-cahaya";

// ===========================================================================
// Cahaya HP di Area peserta.
//
// Muncul hanya bila acara punya hadiah aktif dengan animasi Phone lights
// (page.tsx memasangnya), dan baru menutupi portal saat undian menyala dengan
// hadiah itu terpilih di panggung. Selebihnya ia hanya membaca
// /api/undian/hp setiap 10 detik dari cache CDN.
//
// Waktu: semua perhitungan memakai JAM SERVER (selisih diukur saat dimuat dan
// tiap menit), jadi HP dan layar panggung berganti warna dan padam pada detik
// yang sama walau jam HP meleset.
//
// Hasil: HP mengambil kotak terkunci miliknya sekali per undian, lalu membuka
// kotak gelombang j dengan kunci yang terbit di /api/undian/hp sesudah waktu
// gelombang itu. Lihat lib/undian-cahaya.ts.
// ===========================================================================

type HpInfo = {
  now: number;
  live: boolean;
  /** Mode Live di panggung (hadiah apa pun): HP memakai ember 2 detik supaya Select lalu Undi tidak terlewat. */
  armed?: boolean;
  rehearsal?: boolean;
  phase?: "idle" | "spinning" | "revealed";
  draw?: string | null;
  prize?: { name: string; image_url: string | null; sponsor_name: string | null };
  accent?: string | null;
  started_at?: string | null;
  reveal_at?: string | null;
  jadwal?: CahayaJadwal | null;
  show_count?: boolean;
  keys?: string[];
};

type Sealed = { draw: string; in_pool: boolean; boxes: { iv: string; ct: string }[] } | { draw: string; failed: true };

type Status =
  | { kind: "ready" }
  | { kind: "lit" }
  | { kind: "out"; at: number }
  | { kind: "win"; at: number }
  | { kind: "backup"; at: number; n: number }
  | { kind: "notin" }
  | { kind: "unknown" };

const DARK: Rgb = [11, 11, 15];
const RED: Rgb = [179, 38, 30];
const SILVER: Rgb = [196, 203, 214];
const IDLE_MS = 10000;
const LIVE_MS = 2000;

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function bukaKotak(key: string, box: { iv: string; ct: string }): Promise<CahayaHasil | null> {
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", fromBase64(key), "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(box.iv) }, cryptoKey, fromBase64(box.ct));
    return bacaHasil(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

function hexToRgb(hex: string | null | undefined, fallback: Rgb): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? "");
  if (!match) return fallback;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const css = (rgb: Rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

export function UndianHp({ base, lang, name, seat, gladi }: {
  base: string;
  lang: LandingLang;
  /** Nama dan kursi peserta ini di layar menang, supaya panitia bisa mencocokkan (tangkapan layar teman tidak lolos). */
  name: string;
  seat: string | null;
  /** Peserta dengan Committee access: hanya mereka yang melihat undian saat gladi (latihan). */
  gladi: boolean;
}) {
  const t = UNDIAN_HP_UI[lang];
  const offset = useRef(0);
  const [info, setInfo] = useState<HpInfo | null>(null);
  const infoRef = useRef<HpInfo | null>(null);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [results, setResults] = useState<{ draw: string; list: (CahayaHasil | null)[] }>({ draw: "", list: [] });
  const [dismissed, setDismissed] = useState("");
  const [joined, setJoined] = useState(false);
  // Jam server terakhir, diperbarui 10 kali per detik selama undian: status dihitung darinya saat render.
  const [nowServer, setNowServer] = useState(0);
  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const terima = useCallback((next: HpInfo) => {
    const current = infoRef.current;
    // Respons datang tidak berurutan (CDN, wifi venue): yang lebih tua dari yang sudah dipegang dibuang.
    if (current && next.now < current.now && next.draw === current.draw) return;
    infoRef.current = next;
    setInfo(next);
  }, []);

  const ambil = useCallback(async (width: number, bucket: number) => {
    try {
      const response = await fetch(`${base}/api/undian/hp?w=${width}&b=${bucket}`);
      if (!response.ok) return null;
      const data = (await response.json()) as HpInfo;
      terima(data);
      return data;
    } catch {
      return null;
    }
  }, [base, terima]);

  // Jam server: tiga sampel, ambil yang perjalanannya tersingkat. Diulang tiap
  // menit, hanya selama hadiah Cahaya HP terpilih di panggung. Sebelum itu ember
  // polling 10 detik cukup memakai jam HP apa adanya.
  const live = info?.live === true;
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const setel = async () => {
      const samples: { sent: number; received: number; server: number }[] = [];
      for (let i = 0; i < 3 && !stop; i += 1) {
        try {
          const sent = Date.now();
          const response = await fetch(`${base}/api/undian/hp?jam=1`, { cache: "no-store" });
          const data = (await response.json()) as { now: number };
          samples.push({ sent, received: Date.now(), server: data.now });
        } catch {
          // Satu sampel gagal tidak apa-apa; selisih lama tetap dipakai.
        }
      }
      if (samples.length) offset.current = selisihJam(samples);
    };
    void setel();
    const timer = window.setInterval(() => { void setel(); }, 60000);
    return () => { stop = true; window.clearInterval(timer); };
  }, [base, live]);

  // Polling keadaan: 10 detik saat diam, 2 detik selama panggung di mode Live
  // (hadiah apa pun), supaya MC yang memilih hadiah lalu langsung menekan Undi
  // tidak membuat HP terlambat sampai 10 detik.
  useEffect(() => {
    let timer = 0;
    let stop = false;
    const loop = async () => {
      if (stop) return;
      const width = infoRef.current?.live || infoRef.current?.armed ? LIVE_MS : IDLE_MS;
      if (document.visibilityState === "visible") await ambil(width, emberHp(serverNow(), width));
      if (stop) return;
      const next = infoRef.current?.live || infoRef.current?.armed ? LIVE_MS : IDLE_MS;
      timer = window.setTimeout(() => { void loop(); }, next - (serverNow() % next) + 30);
    };
    void loop();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      void loop();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [ambil, serverNow, live]);

  // Kunci gelombang berikutnya: diminta tepat setelah waktunya, pada ember
  // 0,5 detik yang dimulai SESUDAH waktu gelombang, supaya respons CDN-nya
  // pasti sudah memuat kunci itu. Kalau belum (jaringan, cache), coba lagi.
  // Gladi: hanya HP panitia yang ikut, peserta lain tidak diambil alih layarnya.
  const ikut = info?.live === true && (!info.rehearsal || gladi);
  const draw = ikut && info?.phase !== "idle" ? info?.draw ?? null : null;
  const keyCount = info?.keys?.length ?? 0;
  const waves = info?.jadwal?.waves;
  const revealAt = info?.reveal_at ? new Date(info.reveal_at).getTime() : null;
  useEffect(() => {
    if (!draw || !waves || keyCount >= waves.length) return;
    const due = revealAt !== null ? Math.min(waves[keyCount].at, revealAt) : waves[keyCount].at;
    let bucket = Math.ceil(due / 500);
    let timer = 0;
    let stop = false;
    const run = async () => {
      if (stop) return;
      const data = await ambil(500, bucket);
      if (stop) return;
      if (!data || (data.keys?.length ?? 0) <= keyCount) {
        bucket = Math.max(bucket + 1, emberHp(serverNow(), 500) + 1);
        timer = window.setTimeout(() => { void run(); }, Math.max(80, bucket * 500 + 80 - serverNow()));
      }
    };
    timer = window.setTimeout(() => { void run(); }, Math.max(0, bucket * 500 + 80 - serverNow()));
    return () => { stop = true; window.clearTimeout(timer); };
  }, [draw, waves, keyCount, revealAt, ambil, serverNow]);

  // Hasil terkunci milik HP ini: sekali per undian. Disebar 0 sampai 1,2 detik
  // supaya 500 HP tidak mengetuk server pada milidetik yang sama.
  useEffect(() => {
    if (!draw) return;
    let stop = false;
    const timer = window.setTimeout(async () => {
      for (let attempt = 0; attempt < 3 && !stop; attempt += 1) {
        try {
          const response = await fetch(`${base}/api/peserta/undian-hp`, { cache: "no-store" });
          if (response.ok) {
            const data = (await response.json()) as { draw: string | null; in_pool?: boolean; sealed?: { iv: string; ct: string }[] };
            if (stop) return;
            if (data.draw === draw) {
              setSealed({ draw, in_pool: data.in_pool === true, boxes: data.sealed ?? [] });
              return;
            }
          } else if (response.status === 401 || response.status === 404) break;
        } catch {
          // Coba lagi di bawah.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 800 * (attempt + 1)));
      }
      if (!stop) setSealed({ draw, failed: true });
    }, Math.random() * 1200);
    return () => { stop = true; window.clearTimeout(timer); };
  }, [draw, base]);

  // Buka kotak yang kuncinya sudah terbit.
  const keys = info?.keys;
  useEffect(() => {
    if (!draw || !keys?.length || !sealed || sealed.draw !== draw || "failed" in sealed || !sealed.in_pool) return;
    let stop = false;
    void Promise.all(keys.map((key, index) => (sealed.boxes[index] ? bukaKotak(key, sealed.boxes[index]) : Promise.resolve(null)))).then((list) => {
      if (!stop) setResults({ draw, list });
    });
    return () => { stop = true; };
  }, [draw, keys, sealed]);

  // Detak 10 kali per detik selama undian berjalan, untuk pergantian status pada waktunya.
  const showing = Boolean(draw);
  useEffect(() => {
    if (!showing) return;
    const timer = window.setInterval(() => setNowServer(serverNow()), 100);
    return () => window.clearInterval(timer);
  }, [showing, serverNow]);

  // Jeda padam milik HP ini: tetap untuk satu undian, berbeda antar-HP.
  const [phoneSeed] = useState(() => Math.random());
  const jitter = useMemo(() => acakTetap(`${draw ?? ""}:${phoneSeed}`) * CAHAYA_SEBAR_MS, [draw, phoneSeed]);

  const status: Status | null = (() => {
    if (!info?.live || !ikut) return null;
    if (info.phase === "idle" || !draw || !info.jadwal) return { kind: "ready" };
    const now = nowServer;
    const jadwal = info.jadwal;
    const last = jadwal.waves.length - 1;
    const tampil = (index: number) => waktuTampil(jadwal.waves[index], revealAt) + jitter;
    if (sealed && sealed.draw === draw && !("failed" in sealed) && !sealed.in_pool) return { kind: "notin" };
    const list = results.draw === draw ? results.list : [];
    for (let index = 0; index < list.length; index += 1) {
      const hasil = list[index];
      if (!hasil || now < tampil(index)) continue;
      if (hasil === "out") return { kind: "out", at: tampil(index) };
      if (index === last && hasil === "win") return { kind: "win", at: tampil(index) };
      if (index === last && hasil.startsWith("backup:")) return { kind: "backup", at: tampil(index), n: Number(hasil.slice(7)) };
    }
    // Gelombang terakhir sudah lewat tanpa hasil (gagal mengambil, keluar sesi): arahkan ke layar panggung.
    if (now > tampil(last) + 1500 && (!sealed || "failed" in sealed || list.length <= last)) return { kind: "unknown" };
    return { kind: "lit" };
  })();

  const kind = status?.kind ?? null;
  const dismissKey = draw ?? `idle:${info?.prize?.name ?? ""}`;
  const open = Boolean(status) && dismissed !== dismissKey;

  // Getar sekali saat menang (Android; iPhone tidak mendukung getar dari web).
  const vibrated = useRef("");
  useEffect(() => {
    if (kind !== "win" || !draw || vibrated.current === draw) return;
    vibrated.current = draw;
    try {
      navigator.vibrate?.([220, 120, 220, 120, 700]);
    } catch {
      // Diabaikan.
    }
  }, [kind, draw]);

  // Layar tidak mati selama undian terbuka, setelah peserta menekan Siap ikut.
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!joined || !open) return;
    let stop = false;
    const minta = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
        const lock = await nav.wakeLock?.request("screen");
        if (stop) void lock?.release();
        else wakeLock.current = lock ?? null;
      } catch {
        // Browser tanpa Wake Lock: layar mengikuti setelan HP.
      }
    };
    void minta();
    const onVisible = () => { if (document.visibilityState === "visible") void minta(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLock.current?.release().catch(() => undefined);
      wakeLock.current = null;
    };
  }, [joined, open]);

  // Warna per bingkai ditulis langsung ke DOM, bukan lewat state React.
  const layer = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLParagraphElement>(null);
  const gold = useMemo(() => hexToRgb(info?.accent, [245, 196, 81]), [info?.accent]);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  });
  const showCount = info?.show_count !== false;
  const jadwal = info?.jadwal ?? null;
  useEffect(() => {
    if (!open || !jadwal) return;
    const tenang = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const paint = () => {
      const now = serverNow();
      const current = statusRef.current;
      let rgb: Rgb = DARK;
      if (current?.kind === "lit" || current?.kind === "unknown") rgb = warnaPertunjukan(jadwal, now, phoneSeed, tenang);
      else if (current?.kind === "out") {
        const f = (now - current.at) / CAHAYA_PADAM_MS;
        rgb = f < 0.35 ? campur(warnaPertunjukan(jadwal, now, phoneSeed, true), RED, f / 0.35) : campur(RED, DARK, Math.min(1, (f - 0.35) / 0.65));
      } else if (current?.kind === "win" || current?.kind === "backup") {
        const base = current.kind === "win" ? gold : SILVER;
        const shimmer = tenang ? 0 : (Math.sin((now - current.at) / 450) + 1) / 2;
        rgb = campur(base, [255, 255, 255], 0.08 + 0.18 * shimmer);
      }
      if (layer.current) layer.current.style.backgroundColor = css(rgb);
      if (counter.current) {
        counter.current.textContent = showCount && current?.kind !== "ready" ? t.lit(new Intl.NumberFormat(lang === "en" ? "en-GB" : "id-ID").format(sisaMenyala(jadwal, now, revealAt))) : "";
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [open, jadwal, serverNow, phoneSeed, gold, showCount, revealAt, t, lang]);

  if (!open || !status || !info?.prize) return null;
  const prize = info.prize;
  const bright = status.kind === "win" || status.kind === "backup";
  const onGold = bright ? "text-[#1d1500]" : "text-white";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.dialog}
      data-status={status.kind}
      className={`fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-[#0b0b0f] ${onGold}`}
      style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}
    >
      <div ref={layer} aria-hidden className="pointer-events-none fixed inset-0 bg-[#0b0b0f]" />
      {info.rehearsal ? (
        <p className="relative z-10 bg-[#ffb4ab] px-4 py-2 text-center text-label-large font-semibold tracking-[0.08em] text-[#410002]">{t.rehearsal}</p>
      ) : null}
      <div className="relative z-10 flex items-start gap-2 px-4 pt-3">
        <p className={`min-w-0 flex-1 pt-3 text-label-large font-semibold uppercase tracking-[0.12em] ${bright ? "opacity-80" : "opacity-75"}`}>{t.kicker}</p>
        <button
          type="button"
          onClick={() => setDismissed(dismissKey)}
          aria-label={t.close}
          className={`grid size-12 shrink-0 place-items-center rounded-full ${bright ? "bg-black/10" : "bg-white/12"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-current`}
        >
          <X size={22} weight="bold" aria-hidden />
        </button>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-8 text-center">
        {status.kind === "ready" ? (
          <div className="flex w-full max-w-[420px] flex-col items-center">
            {prize.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prize.image_url} alt="" className="mb-6 aspect-square w-40 rounded-xl bg-white/10 object-contain" />
            ) : null}
            <p className="text-title-large font-semibold">{prize.name}</p>
            {prize.sponsor_name ? <p className="mt-1 text-body-medium opacity-75">{t.sponsor(prize.sponsor_name)}</p> : null}
            <h2 className="mt-8 text-headline-medium font-semibold text-balance">{joined ? t.joined : t.readyTitle}</h2>
            <p className="mt-3 text-body-large opacity-85 text-pretty">{joined ? t.joinedBody : t.readyBody}</p>
            {joined ? null : (
              <button
                type="button"
                onClick={() => setJoined(true)}
                className="mt-8 min-h-14 w-full rounded-full bg-white px-8 text-title-medium font-semibold text-[#0b0b0f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                {t.join}
              </button>
            )}
          </div>
        ) : status.kind === "lit" ? (
          <p className="text-headline-medium font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.45),0_2px_16px_rgba(0,0,0,0.4)]">{t.raise}</p>
        ) : (
          <div aria-live="assertive" className="flex w-full max-w-[420px] flex-col items-center">
            <h2 className={`font-bold text-balance ${status.kind === "win" ? "text-display-medium" : "text-headline-large"}`}>
              {status.kind === "out" ? t.outTitle
                : status.kind === "win" ? t.winTitle
                : status.kind === "backup" ? t.backupTitle(status.n)
                : status.kind === "notin" ? t.notInTitle
                : t.unknownTitle}
            </h2>
            {status.kind === "win" || status.kind === "backup" ? (
              <>
                <p className="mt-4 text-title-large font-semibold">{prize.name}</p>
                <p className="mt-6 rounded-xl bg-black/10 px-5 py-3 text-title-medium font-semibold">
                  {name}
                  {seat ? <span className="block text-body-medium font-medium opacity-80">{t.seat(seat)}</span> : null}
                </p>
              </>
            ) : null}
            <p className="mt-4 text-body-large opacity-90 text-pretty">
              {status.kind === "out" ? t.outBody
                : status.kind === "win" ? t.winBody
                : status.kind === "backup" ? t.backupBody
                : status.kind === "notin" ? t.notInBody
                : t.unknownBody}
            </p>
          </div>
        )}
      </div>
      {status.kind === "win" ? <Confetti /> : null}
      <p ref={counter} aria-hidden className="relative z-10 pb-[max(24px,env(safe-area-inset-bottom))] text-center text-title-medium font-semibold tabular-nums opacity-85 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]" />
    </div>
  );
}

/** Kertas warna jatuh di layar pemenang. Tanpa gerak bila prefers-reduced-motion. */
function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => {
    const r = acakTetap(`c${i}`);
    const r2 = acakTetap(`d${i}`);
    return {
      left: `${Math.round(r * 100)}%`,
      delay: `${(r2 * 1.6).toFixed(2)}s`,
      duration: `${(2.6 + r * 1.8).toFixed(2)}s`,
      color: ["#1d1500", "#ffffff", "#b3261e", "#0b57d0", "#146c2e"][i % 5],
      rotate: `${Math.round(r2 * 360)}deg`,
    };
  });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden motion-reduce:hidden">
      <style>{"@keyframes undian-hp-jatuh{0%{transform:translateY(-10vh) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(540deg);opacity:.9}}"}</style>
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="absolute top-0 block h-3 w-2 rounded-[2px]"
          style={{ left: piece.left, background: piece.color, rotate: piece.rotate, animation: `undian-hp-jatuh ${piece.duration} linear ${piece.delay} infinite` }}
        />
      ))}
    </div>
  );
}
