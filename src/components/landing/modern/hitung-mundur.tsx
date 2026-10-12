"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LandingCountdownStyle } from "@/lib/domain";
import { jedaBerikutnya, keadaanHitungMundur, pecahSisa, rentangAcara, sisaHariKalender, type JadwalHitungMundur } from "@/lib/landing-hitung-mundur";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { HEAD, MUTED } from "./styles";

/**
 * Isi blok Hitung mundur, lima gaya. Render pertama memakai waktu server
 * (`sekarangAwal`), jadi hidrasi tidak mengubah apa pun; sesudahnya angka
 * berjalan tiap detik (bila detik tampil) atau tiap pergantian menit. Angka
 * memakai tabular-nums dan nol di depan, jadi pergantiannya tidak menggeser
 * tata letak. Animasi balik di Papan berhenti bila pengguna meminta gerak
 * dikurangi.
 *
 * Pembaca layar membaca judul, tanggal, dan tujuan seperti biasa; angka yang
 * berjalan disembunyikan dan diganti satu kalimat (tidak live, jadi tidak
 * dibacakan ulang tiap menit).
 */

export type TeksHitungMundur = {
  alis: string | null;
  judul: string;
  /** "Jumat, 6 November 2026 · mulai 08.00 WIB" */
  kapan: string;
  /** Tanggal pendek, mis. "Jum, 6 Nov". */
  tanggalPendek: string;
  /** Jam mulai, mis. "08.00 WIB". */
  jamMulai: string | null;
  dari: string;
  ke: string;
};

type Sisa = ReturnType<typeof pecahSisa>;

const dua = (n: number) => String(n).padStart(2, "0");

const ANIMASI = `
@keyframes hm-balik { from { transform: rotateX(80deg); opacity: .25 } to { transform: rotateX(0); opacity: 1 } }
.hm-balik { animation: hm-balik 360ms cubic-bezier(.2,.7,.2,1); transform-origin: 50% 0; }
@media (prefers-reduced-motion: reduce) { .hm-balik { animation: none } }
`;

export function HitungMundurIsi({
  gaya,
  jadwal,
  lang,
  detik,
  teks,
  ikon,
  mulaiProgres,
  sekarangAwal,
}: {
  gaya: LandingCountdownStyle;
  jadwal: JadwalHitungMundur;
  lang: LandingLang;
  detik: boolean;
  teks: TeksHitungMundur;
  /** Ikon penanda rute (Tiket, Pita), dirender server. Null = titik. */
  ikon: ReactNode;
  /** Awal garis kemajuan (ms), biasanya saat acara dibuat. */
  mulaiProgres: number;
  sekarangAwal: number;
}) {
  const [sekarang, setSekarang] = useState(sekarangAwal);
  const akar = useRef<HTMLDivElement>(null);
  const t = LANDING_UI[lang];

  useEffect(() => {
    let jeda: ReturnType<typeof setTimeout>;
    const perbarui = () => {
      const kini = Date.now();
      setSekarang(kini);
      jeda = setTimeout(perbarui, detik ? 1000 - (kini % 1000) : jedaBerikutnya(jadwal, kini));
    };
    // Satu putaran sesudah hidrasi: halaman dari cache bisa membawa angka lama.
    jeda = setTimeout(perbarui, 0);
    return () => clearTimeout(jeda);
  }, [jadwal, detik]);

  const keadaan = keadaanHitungMundur(jadwal, sekarang) ?? { fase: "selesai" as const };

  // Acara selesai saat halaman masih terbuka: seluruh blok ikut hilang.
  useEffect(() => {
    const bagian = akar.current?.closest("section");
    if (bagian) bagian.hidden = keadaan.fase === "selesai";
  }, [keadaan.fase]);

  if (keadaan.fase === "selesai") return <div ref={akar} hidden />;

  const rentang = rentangAcara(jadwal)!;
  const sisa = pecahSisa(rentang.mulai - sekarang, detik);
  const berlangsung = keadaan.fase === "berlangsung";
  const hariKe = berlangsung && keadaan.lama > 1 ? t.countdown(0, keadaan.hariKe, keadaan.lama).teks : null;
  const kemajuan = berlangsung ? 1 : Math.min(1, Math.max(0, (sekarang - mulaiProgres) / Math.max(1, rentang.mulai - mulaiProgres)));
  // Kalimat pembaca layar memakai menit dibulatkan ke atas: tidak pernah "0 menit" sebelum mulai.
  const sisaMenit = pecahSisa(rentang.mulai - sekarang, false);
  const sr = berlangsung ? [t.countdownLive, hariKe].filter(Boolean).join(", ") : t.countdownSr(sisaMenit.hari, sisaMenit.jam, sisaMenit.menit);
  // Tanggal "dari" Tiket dihitung di sini, bukan di server: halaman yang terbuka
  // melewati tengah malam ikut berganti hari bersama "Hari ini" di potongannya.
  const hariIni = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", timeZone: jadwal.time_zone }).format(sekarang);
  const dasar = { sisa, detik, teks, lang, berlangsung, hariKe, hariKalender: sisaHariKalender(jadwal, sekarang), hariIni };

  const isi = (() => {
    switch (gaya) {
      case "board": return <Papan {...dasar} />;
      case "ticket": return <Tiket {...dasar} ikon={ikon} kemajuan={kemajuan} />;
      case "strip": return <Pita {...dasar} ikon={ikon} kemajuan={kemajuan} />;
      case "photo": return <Foto {...dasar} />;
      default: return <Angka {...dasar} />;
    }
  })();
  return (
    // Tata letak lebar mengikuti lebar wadah, bukan layar: blok yang sama juga
    // tampil sebagai kartu di kolom dashboard peserta yang lebih sempit.
    <div ref={akar} className="@container">
      {isi}
      {/* Sesudah isi, jadi pembaca layar mendengar judulnya dulu. */}
      <p className="sr-only">{sr}</p>
    </div>
  );
}

type Dasar = {
  sisa: Sisa;
  detik: boolean;
  teks: TeksHitungMundur;
  lang: LandingLang;
  berlangsung: boolean;
  hariKe: string | null;
  /** Sisa hari menurut kalender di zona acara (0 = hari ini, 1 = besok), untuk kalimat. */
  hariKalender: number;
  /** Tanggal hari ini di zona acara, mis. "12 Okt". */
  hariIni: string;
};

function sel(sisa: Sisa, detik: boolean, lang: LandingLang) {
  const u = LANDING_UI[lang].countdownUnits;
  return [
    { angka: dua(sisa.hari), label: u.days },
    { angka: dua(sisa.jam), label: u.hours },
    { angka: dua(sisa.menit), label: u.minutes },
    ...(detik ? [{ angka: dua(sisa.detik), label: u.seconds }] : []),
  ];
}

// Label kecil memakai sorot yang lolos 4,5:1 (teks biasa), bukan 3:1 untuk angka besar.
const ALIS = "text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-[var(--hm-sorot-kecil)]";
const JUDUL = `${HEAD} text-balance text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[36px]`;

function Kepala({ teks, kapan = true }: { teks: TeksHitungMundur; kapan?: boolean }) {
  return (
    <div className="flex max-w-[480px] flex-col gap-3">
      {teks.alis ? <p className={ALIS}>{teks.alis}</p> : null}
      <h2 className={JUDUL}>{teks.judul}</h2>
      {kapan && teks.kapan ? <p className={`text-isi ${MUTED}`}>{teks.kapan}</p> : null}
    </div>
  );
}

/** Baris "Sedang berlangsung" dengan titik sorot. */
function BarisLangsung({ lang, hariKe, ukuran }: { lang: LandingLang; hariKe: string | null; ukuran: string }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      <p className={`${HEAD} flex items-center gap-3 font-semibold leading-none tracking-[-0.02em] ${ukuran}`}>
        <span className="size-3 shrink-0 rounded-full bg-[var(--hm-sorot)]" />
        {LANDING_UI[lang].countdownLive}
      </p>
      {hariKe ? <p className={`text-isi ${MUTED}`}>{hariKe}</p> : null}
    </div>
  );
}

/** Gaya Angka: judul kiri, angka besar kanan, dipisah garis tipis seperti Pita angka. */
function Angka({ sisa, detik, teks, lang, berlangsung, hariKe }: Dasar) {
  return (
    <div className="flex flex-col gap-10 @4xl:flex-row @4xl:items-center @4xl:justify-between @4xl:gap-16">
      <Kepala teks={teks} />
      {berlangsung ? (
        <BarisLangsung lang={lang} hariKe={hariKe} ukuran="text-[32px] sm:text-[44px]" />
      ) : (
        <dl aria-hidden className={`grid ${detik ? "grid-cols-4" : "grid-cols-3"} @4xl:flex`}>
          {sel(sisa, detik, lang).map((item, index) => (
            <div key={item.label} className={`flex flex-col-reverse justify-end gap-2 @4xl:min-w-[148px] @4xl:pl-8 ${index > 0 ? "border-l border-[var(--reg-outline-variant)] pl-3 sm:pl-4" : "pr-3 sm:pr-4 @4xl:border-l @4xl:border-[var(--reg-outline-variant)]"}`}>
              <dt className={`text-body-medium leading-[1.55] sm:text-isi ${MUTED}`}>{item.label}</dt>
              <dd className={`${HEAD} whitespace-nowrap font-semibold leading-none tracking-[-0.02em] tabular-nums text-[var(--hm-sorot)] ${detik ? "text-[36px] sm:text-[56px]" : "text-[44px] sm:text-[64px]"}`}>{item.angka}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Gaya Papan: tiap digit di ubin gelap, membalik saat berganti (papan keberangkatan bandara). */
function Papan({ sisa, detik, teks, lang, berlangsung, hariKe }: Dasar) {
  const grup = sel(sisa, detik, lang);
  const sempit = detik;
  return (
    <div className="flex flex-col gap-8 @4xl:flex-row @4xl:items-center @4xl:justify-between @4xl:gap-12">
      <style>{ANIMASI}</style>
      <Kepala teks={teks} kapan={false} />
      <div className="rounded-xl bg-[#0D1117] p-4 text-white ring-1 ring-white/10 sm:p-6">
        <div className="mb-4 flex flex-col gap-1 font-mono text-[12px] uppercase tracking-[0.12em] text-white/60 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="break-words sm:truncate">{teks.ke}</span>
          <span className="shrink-0 text-[var(--hm-papan)]">{[teks.tanggalPendek, teks.jamMulai].filter(Boolean).join(" · ")}</span>
        </div>
        {berlangsung ? (
          <div aria-hidden className="flex min-h-[84px] flex-col justify-center gap-2 sm:min-h-[112px]">
            <p className={`${HEAD} flex items-center gap-3 text-[28px] font-semibold leading-none sm:text-[40px]`}>
              <span className="size-3 shrink-0 rounded-full bg-[var(--hm-papan)]" />
              {LANDING_UI[lang].countdownLive}
            </p>
            {hariKe ? <p className="text-isi text-white/70">{hariKe}</p> : null}
          </div>
        ) : (
          <div aria-hidden className={`flex items-start ${sempit ? "gap-1.5 sm:gap-3" : "gap-2 sm:gap-3"}`}>
            {grup.map((g, i) => (
              <div key={g.label} className={`flex items-start ${sempit ? "gap-1.5 sm:gap-3" : "gap-2 sm:gap-3"}`}>
                {i > 0 ? <span className={`${HEAD} pt-1.5 text-[20px] font-semibold text-white/40 sm:pt-4 sm:text-[36px]`}>:</span> : null}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-0.5 sm:gap-1">
                    {g.angka.split("").map((d, k) => (
                      <span key={k} className={`relative flex items-center justify-center overflow-hidden rounded-md bg-[#1A1F29] [perspective:300px] ${sempit ? "h-[44px] w-[28px]" : "h-[56px] w-[38px]"} sm:h-[84px] sm:w-[56px]`}>
                        <span key={d} className={`hm-balik ${HEAD} font-semibold tabular-nums ${sempit ? "text-[26px]" : "text-[34px]"} sm:text-[52px]`}>{d}</span>
                        <span className="absolute inset-x-0 top-1/2 h-px bg-black/70" />
                        <span className="absolute inset-x-0 top-0 h-1/2 bg-white/[0.04]" />
                      </span>
                    ))}
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/60 sm:text-[12px]">{g.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Garis rute dengan penanda yang maju menuju hari H (Tiket dan Pita). Hiasan: kemajuannya tidak dibacakan. */
function Rute({ kemajuan, ikon, jalur, isi, ujung, penanda }: { kemajuan: number; ikon: ReactNode; jalur: string; isi: string; ujung: string; penanda: string }) {
  const persen = `${(kemajuan * 100).toFixed(2)}%`;
  return (
    <div aria-hidden className="relative h-8">
      <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 ${jalur}`} />
      <div className={`absolute left-0 top-1/2 -translate-y-1/2 ${isi}`} style={{ width: persen }} />
      <span className={`absolute right-0 top-1/2 size-3 -translate-y-1/2 rounded-full ${ujung}`} />
      <span className={`absolute top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${penanda}`} style={{ left: persen }}>
        {ikon ?? <span className="size-2.5 rounded-full bg-current" />}
      </span>
    </div>
  );
}

/** Gaya Tiket: boarding pass dengan sobekan; sisa hari di potongan kanan. */
function Tiket({ sisa, detik, teks, lang, berlangsung, hariKe, hariKalender, hariIni, ikon, kemajuan }: Dasar & { ikon: ReactNode; kemajuan: number }) {
  const t = LANDING_UI[lang];
  const LABEL = `whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--reg-on-surface-variant)]`;
  const hitung = t.countdown(hariKalender, 0, 1);
  return (
    <div className="flex flex-col gap-8">
      <Kepala teks={teks} kapan={false} />
      {/* Kartu tiket selalu putih, apa pun latar bloknya: warnanya dikembalikan ke tinta. */}
      <div className="relative flex flex-col rounded-2xl bg-white text-[#0B1020] shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-16px_rgb(0_0_0/0.35)] [--reg-on-surface-variant:#4B5263] [--reg-outline-variant:#D9DCE3] sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6 p-5 sm:p-8">
          <div className="flex items-end justify-between gap-4">
            <div className="flex shrink-0 flex-col gap-1">
              <span className={LABEL}>{teks.dari}</span>
              <span className={`${HEAD} whitespace-nowrap text-[24px] font-semibold leading-none sm:text-[36px]`}>{hariIni}</span>
            </div>
            <div className="flex min-w-0 flex-col items-end gap-1 text-right">
              <span className={LABEL}>{t.countdownDay}</span>
              <span className={`${HEAD} text-balance text-[24px] font-semibold leading-none sm:text-[36px]`}>{teks.ke}</span>
            </div>
          </div>
          {/* Kartu putih: garis, ujung, dan penanda memakai sorot yang diukur terhadap putih. */}
          <Rute kemajuan={kemajuan} ikon={ikon} jalur="border-t-2 border-dashed border-[#D9DCE3]" isi="border-t-2 border-[var(--hm-sorot-putih)]" ujung="border-2 border-[var(--hm-sorot-putih)] bg-white" penanda="bg-[var(--hm-sorot-putih)] text-[var(--hm-pada-sorot-putih)]" />
          <p className="text-body-medium text-[#4B5263]">{teks.kapan}</p>
        </div>
        {/* Sobekan: garis putus dengan dua takik setengah lingkaran warna latar blok. */}
        <div className="relative mx-5 border-t-2 border-dashed border-[#D9DCE3] sm:mx-0 sm:my-5 sm:border-l-2 sm:border-t-0">
          <span className="absolute -left-8 -top-3 size-6 rounded-full bg-[var(--hm-latar)] sm:-left-3 sm:-top-8" />
          <span className="absolute -right-8 -top-3 size-6 rounded-full bg-[var(--hm-latar)] sm:-bottom-8 sm:-left-3 sm:right-auto sm:top-auto" />
        </div>
        <div aria-hidden className="flex items-center justify-between gap-6 p-5 sm:w-[280px] sm:flex-col sm:items-start sm:justify-center sm:gap-3 sm:p-8">
          {berlangsung ? (
            <div className="flex flex-col gap-1">
              <span className={`${HEAD} text-[28px] font-semibold leading-tight text-[var(--hm-sorot-putih)]`}>{t.countdownLive}</span>
              {hariKe ? <span className="text-body-medium text-[#4B5263]">{hariKe}</span> : null}
            </div>
          ) : (
            <>
              {hitung.angka ? (
                <div className="flex items-baseline gap-2">
                  <span className={`${HEAD} text-[56px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--hm-sorot-putih)] sm:text-[72px]`}>{hitung.angka}</span>
                  <span className="whitespace-nowrap text-title-medium font-semibold">{t.countdownDaysLeft(hariKalender)}</span>
                </div>
              ) : (
                <span className={`${HEAD} text-[40px] font-semibold leading-none tracking-[-0.02em] text-[var(--hm-sorot-putih)] sm:text-[48px]`}>{hitung.teks}</span>
              )}
              <span className="text-right text-body-medium tabular-nums text-[#4B5263] sm:text-left">{t.countdownIn(sisa, detik)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Gaya Pita: satu baris tipis, cocok tepat di bawah hero. */
function Pita({ sisa, detik, teks, lang, berlangsung, hariKe, hariKalender, ikon, kemajuan }: Dasar & { ikon: ReactNode; kemajuan: number }) {
  const t = LANDING_UI[lang];
  return (
    <div className="flex flex-col gap-4 @4xl:flex-row @4xl:items-center @4xl:gap-10">
      {/* Tujuan bisa nama tempat yang panjang: kalimatnya boleh membungkus, tidak mendorong rute keluar. */}
      <p className={`${HEAD} min-w-0 text-balance break-words text-[22px] font-semibold leading-tight sm:text-[26px] @4xl:max-w-[45%]`}>
        {berlangsung ? (
          <>
            <span className="text-[var(--hm-sorot)]">{t.countdownLive}</span>
            {hariKe ? <span className={`ml-2 text-isi font-normal ${MUTED}`}>{hariKe}</span> : null}
          </>
        ) : (
          t.countdownStrip(hariKalender, teks.ke).map((bagian, i) => (bagian.sorot ? <span key={i} className="tabular-nums text-[var(--hm-sorot)]">{bagian.teks}</span> : <span key={i}>{bagian.teks}</span>))
        )}
      </p>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Rute kemajuan={kemajuan} ikon={ikon} jalur="h-1 rounded-full bg-[color-mix(in_srgb,currentColor_18%,transparent)]" isi="h-1 rounded-full bg-[var(--hm-sorot)]" ujung="bg-current" penanda="bg-[var(--hm-sorot)] text-[var(--hm-pada-sorot)]" />
        <div className={`flex justify-between gap-4 text-body-small ${MUTED}`}>
          <span>{teks.dari}</span>
          <span className="text-right">{[teks.tanggalPendek, teks.jamMulai].filter(Boolean).join(" · ")}</span>
        </div>
        {berlangsung ? null : (
          <span aria-hidden className={`pt-1 text-body-medium tabular-nums ${MUTED}`}>{t.countdownIn(sisa, detik)}</span>
        )}
      </div>
    </div>
  );
}

/** Gaya Foto: angka besar di tengah, di atas foto berlapis gelap. */
function Foto({ sisa, detik, teks, lang, berlangsung, hariKe }: Dasar) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex max-w-[640px] flex-col items-center gap-3">
        {teks.alis ? <p className={ALIS}>{teks.alis}</p> : null}
        <h2 className={JUDUL}>{teks.judul}</h2>
        {teks.kapan ? <p className="text-isi text-white/80">{teks.kapan}</p> : null}
      </div>
      {berlangsung ? (
        <BarisLangsung lang={lang} hariKe={hariKe} ukuran="text-[36px] sm:text-[56px]" />
      ) : (
        <div aria-hidden className="flex items-start justify-center gap-3 sm:gap-8">
          {sel(sisa, detik, lang).map((item, i) => (
            <div key={item.label} className="flex items-start gap-3 sm:gap-8">
              {i > 0 ? <span className={`${HEAD} text-[32px] font-semibold leading-none text-white/40 sm:text-[72px]`}>:</span> : null}
              <div className="flex flex-col items-center gap-2">
                <span className={`${HEAD} font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--hm-sorot)] ${detik ? "text-[40px] sm:text-[88px]" : "text-[48px] sm:text-[96px]"}`}>{item.angka}</span>
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/75 sm:text-[13px]">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
