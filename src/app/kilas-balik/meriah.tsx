"use client";

import {
  AirplaneTilt, Bed, Boat, Bus, CalendarStar, Clock, Confetti, Gift, Key, MapPin, MoonStars, Star, Ticket, Train, UsersThree,
} from "@phosphor-icons/react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { LandingLang } from "@/lib/landing-i18n";
import type { Kenangan } from "@/lib/kilas-balik/alur";
import { KILAS_UI } from "@/lib/kilas-balik/i18n";
import type { KunciKartu, NilaiJawaban } from "@/lib/kilas-balik/setelan";
import { reduksiGerak, type LayarKlien, type TanyaKlien } from "./bagian";

/**
 * Lapisan meriah Kilas balik, seperti kilas balik tahunan aplikasi musik:
 * judul muncul per kata, label stiker yang tiba-tiba menempel, angka yang
 * berhitung naik, ornamen yang melayang, dan warna latar yang berganti tiap
 * layar. Semuanya hiasan: isi dan urutan baca tetap sama, dan dengan reduced
 * motion semuanya langsung tampil diam.
 */

const IKON_TRIP = { train: Train, flight: AirplaneTilt, ship: Boat, bus: Bus } as const;

type Gaya = CSSProperties & Record<`--${string}`, string | number>;

/** Warna latar layar. Keempatnya sudah dijaga kontrasnya di warna.ts. */
export type WarnaLayar = "gelap" | "aksen" | "malam" | "kertas";
const URUTAN: WarnaLayar[] = ["aksen", "malam", "kertas", "gelap"];

/** Warna untuk layar ke-n. Pertanyaan tidak pernah di latar kertas, supaya tidak terasa seperti lembar soal. */
export function warnaLayar(layar: LayarKlien[], n: number): WarnaLayar {
  const l = layar[n];
  if (!l || l.jenis === "buka") return "gelap";
  if (l.jenis === "tutup") return "malam";
  const w = URUTAN[(n - 1) % URUTAN.length];
  if (l.jenis === "tanya" && w === "kertas") return "aksen";
  return w;
}

/** Judul yang muncul kata demi kata. Teks tetap utuh untuk pembaca layar. */
export function KataMuncul({ teks, mulai = 0, jeda = 70 }: { teks: string; mulai?: number; jeda?: number }) {
  let n = 0;
  return (
    <>
      {teks.split(/(\s+)/).map((bagian, idx) =>
        /^\s+$/.test(bagian) || !bagian ? (
          bagian
        ) : (
          <span key={idx} className="kb-kata" style={{ "--d": `${mulai + n++ * jeda}ms` } as Gaya}>
            {bagian}
          </span>
        ),
      )}
    </>
  );
}

/** Angka yang berhitung naik dari 0. Pembaca layar langsung mendengar angka akhirnya. */
export function Hitung({ ke, tunda = 250 }: { ke: number; tunda?: number }) {
  const [n, setN] = useState(ke);
  useEffect(() => {
    if (reduksiGerak() || ke <= 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setN(ke);
      return;
    }
    setN(0);
    const lama = Math.min(1400, 600 + ke * 80);
    let bingkai = 0;
    let awal: number | null = null;
    const langkah = (w: number) => {
      awal ??= w + tunda;
      const p = Math.max(0, Math.min(1, (w - awal) / lama));
      setN(Math.round(ke * (1 - (1 - p) ** 3)));
      if (p < 1) bingkai = requestAnimationFrame(langkah);
    };
    bingkai = requestAnimationFrame(langkah);
    return () => cancelAnimationFrame(bingkai);
  }, [ke, tunda]);
  return (
    <>
      <span aria-hidden>{n}</span>
      <span className="sr-only">{ke}</span>
    </>
  );
}

/** Label stiker miring yang menempel satu per satu. */
export function Stiker({ label, mulai = 500 }: { label: { teks: string; ikon?: ReactNode }[]; mulai?: number }) {
  if (!label.length) return null;
  const miring = [-4, 3, -2, 5, -3];
  return (
    <ul className="kb-label-baris">
      {label.map((l, n) => (
        <li
          key={`${l.teks}-${n}`}
          className="kb-label"
          data-ragam={n % 3}
          style={{ "--r": `${miring[n % miring.length]}deg`, "--d": `${mulai + n * 220}ms` } as Gaya}
        >
          {l.ikon}
          <span>{l.teks}</span>
        </li>
      ))}
    </ul>
  );
}

/* Bentuk ornamen, digambar sendiri (bukan emoji): bintang, cincin, coretan, tiket, titik, setengah bulat. */
const BENTUK: Record<string, ReactNode> = {
  bintang: <path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z" fill="currentColor" />,
  cincin: <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="3" />,
  coretan: <path d="M1 14C4 6 7 6 9 12S14 18 16 11 21 5 23 10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
  tiket: <path d="M2 6h20v4a2 2 0 0 0 0 4v4H2v-4a2 2 0 0 0 0-4Z" fill="currentColor" />,
  titik: (
    <g fill="currentColor">
      {[4, 12, 20].flatMap((x) => [4, 12, 20].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" />))}
    </g>
  ),
  bulat: <path d="M2 16a10 10 0 0 1 20 0Z" fill="currentColor" />,
};

type Letak = { b: keyof typeof BENTUK; x: string; y: string; s: number; r: number; w?: 0 | 1 };
/* Tata letak di tepi layar, supaya tidak menutupi tulisan. Satu pola per layar, bergiliran. */
const POLA: Letak[][] = [
  [{ b: "bintang", x: "82%", y: "6%", s: 34, r: 0 }, { b: "cincin", x: "-8%", y: "64%", s: 64, r: 0, w: 1 }, { b: "coretan", x: "76%", y: "46%", s: 60, r: -12 }, { b: "bintang", x: "8%", y: "84%", s: 18, r: 0, w: 1 }],
  [{ b: "tiket", x: "78%", y: "10%", s: 52, r: 18 }, { b: "titik", x: "4%", y: "6%", s: 46, r: 0, w: 1 }, { b: "bintang", x: "86%", y: "70%", s: 26, r: 0 }, { b: "bulat", x: "-6%", y: "86%", s: 90, r: 20, w: 1 }],
  [{ b: "coretan", x: "62%", y: "4%", s: 80, r: 8, w: 1 }, { b: "bintang", x: "6%", y: "12%", s: 28, r: 0 }, { b: "cincin", x: "84%", y: "60%", s: 48, r: 0 }, { b: "titik", x: "6%", y: "90%", s: 40, r: 0, w: 1 }],
  [{ b: "bulat", x: "80%", y: "2%", s: 76, r: 200 }, { b: "bintang", x: "4%", y: "30%", s: 22, r: 0, w: 1 }, { b: "tiket", x: "76%", y: "84%", s: 46, r: -20 }, { b: "bintang", x: "90%", y: "46%", s: 16, r: 0, w: 1 }],
  [{ b: "bintang", x: "86%", y: "26%", s: 22, r: 0 }, { b: "coretan", x: "74%", y: "90%", s: 56, r: -8, w: 1 }, { b: "bulat", x: "-6%", y: "92%", s: 70, r: 20, w: 1 }],
];
/** Pola tepi untuk kepala halaman yang pendek (Ringkas): tidak menyentuh baris atas. */
export const POLA_KEPALA = 4;

/** Ornamen melayang di belakang isi. Warna ikut tema lewat --kb-orn-*. */
export function Ornamen({ pola, ikon }: { pola: number; ikon?: ReactNode }) {
  const daftar = POLA[((pola % POLA.length) + POLA.length) % POLA.length];
  return (
    <div className="kb-ornamen" aria-hidden>
      {daftar.map((o, n) => (
        <span
          key={n}
          className="kb-orn"
          data-warna={o.w ?? 0}
          style={{ left: o.x, top: o.y, width: o.s, height: o.s, "--rr": `${o.r}deg`, "--d": `${120 + n * 90}ms`, "--t": `${3.2 + n * 0.7}s` } as Gaya}
        >
          <svg viewBox="0 0 24 24" width={o.s} height={o.s}>
            {BENTUK[o.b]}
          </svg>
        </span>
      ))}
      {ikon ? <span className="kb-orn-ikon">{ikon}</span> : null}
    </div>
  );
}

/** Stiker reaksi yang menempel dengan semburan kecil, tiap kali menjawab. */
export function Reaksi({ teks, kunci }: { teks: string | null; kunci: number }) {
  if (!teks) return null;
  return (
    <p key={kunci} className="kb-reaksi" role="status">
      <span className="kb-semburan" aria-hidden>
        {Array.from({ length: 8 }, (_, n) => (
          <i key={n} style={{ "--a": `${n * 45}deg` } as Gaya} />
        ))}
      </span>
      {teks}
    </p>
  );
}

/** Label kecil di atas pertanyaan: ringan, tanpa nomor soal. */
export function labelTanya(lang: LandingLang, urutan: number, sisa: number): string {
  const t = KILAS_UI[lang];
  if (sisa <= 1) return t.lastOne;
  return t.vibes[urutan % t.vibes.length];
}

/**
 * Gelar di kartu penutup, dari data dan jawaban peserta sendiri. Selalu ada
 * gelar yang ramah, jadi tidak ada yang merasa "kalah".
 */
export function gelar(lang: LandingLang, k: Kenangan, jawaban: Record<string, NilaiJawaban>, tanya: TanyaKlien[]): string {
  const t = KILAS_UI[lang];
  const nps = tanya.find((q) => q.type === "nps");
  const skor = nps ? jawaban[nps.key] : undefined;
  if (k.prize && k.prize.hadiah.length) return t.titles.lucky;
  if (typeof skor === "number" && skor >= 9) return t.titles.fan;
  if (k.agenda && k.agenda.hadir >= 5) return t.titles.present;
  if (k.stay && k.stay.teman.length) return t.titles.roomie;
  return t.titles.buddy;
}

/** Isi kartu kenangan versi panggung: satu fakta raksasa, judul, lalu label stiker. */
export type KenanganMeriah = {
  judul: string;
  besar: { angka: number; satuan: string } | { ikon: ReactNode; gerak: "geser" | "goyang" };
  label: { teks: string; ikon?: ReactNode }[];
  coretan: ReactNode;
};

export function kenanganMeriah(lang: LandingLang, kartu: KunciKartu, k: Kenangan): KenanganMeriah | null {
  const t = KILAS_UI[lang];
  const kecil = { size: 18, weight: "bold" as const, "aria-hidden": true };
  const besar = { size: 120, weight: "fill" as const, "aria-hidden": true };
  const tipis = { size: 260, weight: "thin" as const };
  if (kartu === "trip" && k.trip) {
    const Ikon = IKON_TRIP[k.trip.mode];
    return {
      judul: t.trip[k.trip.mode],
      besar: { ikon: <Ikon {...besar} />, gerak: "geser" },
      label: [
        k.trip.kapan ? { teks: k.trip.kapan, ikon: <Clock {...kecil} /> } : null,
        { teks: k.trip.judul, ikon: <MapPin {...kecil} /> },
        k.trip.detail ? { teks: k.trip.detail, ikon: <Ticket {...kecil} /> } : null,
      ].filter((x) => x !== null),
      coretan: <Ticket {...tipis} />,
    };
  }
  if (kartu === "stay" && k.stay) {
    return {
      judul: t.stayTitle,
      besar: k.stay.malam > 0 ? { angka: k.stay.malam, satuan: t.nightsUnit(k.stay.malam) } : { ikon: <Bed {...besar} />, gerak: "goyang" },
      label: [
        { teks: k.stay.hotel, ikon: <Bed {...kecil} /> },
        k.stay.kamar ? { teks: t.room(k.stay.kamar), ikon: <Key {...kecil} /> } : null,
        ...k.stay.teman.slice(0, 3).map((nama) => ({ teks: t.withName(nama), ikon: <UsersThree {...kecil} /> })),
      ].filter((x) => x !== null),
      coretan: <MoonStars {...tipis} />,
    };
  }
  if (kartu === "agenda" && k.agenda) {
    return {
      judul: t.agendaTitle,
      besar: k.agenda.hadir > 0 ? { angka: k.agenda.hadir, satuan: t.sessionsUnit(k.agenda.hadir) } : { ikon: <CalendarStar {...besar} />, gerak: "goyang" },
      label: k.agenda.sorotan.map((s) => ({ teks: s, ikon: <Star {...kecil} /> })),
      coretan: <CalendarStar {...tipis} />,
    };
  }
  if (kartu === "prize" && k.prize && k.prize.hadiah.length) {
    return {
      judul: t.prizeTitle,
      besar: k.prize.hadiah.length > 1 ? { angka: k.prize.hadiah.length, satuan: t.prizeUnit(k.prize.hadiah.length) } : { ikon: <Gift {...besar} />, gerak: "goyang" },
      label: k.prize.hadiah.map((h) => ({ teks: h, ikon: <Gift {...kecil} /> })),
      coretan: <Confetti {...tipis} />,
    };
  }
  return null;
}
