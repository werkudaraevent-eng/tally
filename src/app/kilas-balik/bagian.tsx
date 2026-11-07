"use client";

import {
  AirplaneTilt, Bed, Boat, Bus, CalendarCheck, Gift, Smiley, SmileyBlank, SmileyMeh, SmileyNervous, SmileySad, Train,
} from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { LandingLang } from "@/lib/landing-i18n";
import type { Kenangan } from "@/lib/kilas-balik/alur";
import { KILAS_UI } from "@/lib/kilas-balik/i18n";
import type { JenisPertanyaan, KunciKartu, NilaiJawaban } from "@/lib/kilas-balik/setelan";
import type { Syarat } from "@/lib/kilas-balik/logika";
import { Hitung, KataMuncul, gelar } from "./meriah";

/**
 * Bagian yang dipakai ketiga tampilan Kilas balik (kilas, percakapan,
 * ringkas): isian per jenis pertanyaan, isi kartu kenangan, dan penutup.
 */

export type TanyaKlien = { key: string; type: JenisPertanyaan; title: string; required: boolean; max: number; options: string[]; show_if?: Syarat[]; options_from?: string | null };
export type LayarKlien = { jenis: "buka" } | { jenis: "kartu"; kartu: KunciKartu } | { jenis: "tanya"; q: TanyaKlien } | { jenis: "tutup" };
export type Kirim = "diam" | "mengirim" | "terkirim" | "luring" | "gagal";

export const WAJAH = [SmileySad, SmileyNervous, SmileyMeh, SmileyBlank, Smiley];
const IKON_TRIP = { train: Train, flight: AirplaneTilt, ship: Boat, bus: Bus } as const;

export const reduksiGerak = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Jawaban sebagai kalimat pendek, untuk gelembung balasan di Percakapan. */
export function teksJawaban(lang: LandingLang, q: Pick<TanyaKlien, "type">, v: NilaiJawaban | undefined): string | null {
  const t = KILAS_UI[lang];
  if (v === undefined) return null;
  if (q.type === "faces" && typeof v === "number") return t.faces[v - 1] ?? String(v);
  if (q.type === "nps" && typeof v === "number") return t.npsOf(v);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

/**
 * Isian satu pertanyaan. `onWajah` dipanggil sesudah wajah diketuk, supaya
 * tampilan yang berjalan per layar bisa lanjut sendiri.
 */
export function IsianTanya({
  lang, tanya, nilai, idJudul, onNilai, onReaksi, onWajah,
}: {
  lang: LandingLang;
  tanya: TanyaKlien;
  nilai: NilaiJawaban | undefined;
  idJudul: string;
  onNilai: (v: NilaiJawaban | undefined) => void;
  onReaksi?: (teks: string) => void;
  onWajah?: () => void;
}) {
  const t = KILAS_UI[lang];
  if (tanya.type === "faces") {
    return (
      <div className="kb-wajah" role="radiogroup" aria-labelledby={idJudul}>
        {t.faces.map((label, n) => {
          const Ikon = WAJAH[n];
          const dipilih = nilai === n + 1;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={dipilih}
              className="kb-wajah-tombol"
              onClick={() => {
                onNilai(n + 1);
                onReaksi?.(t.reactFaces[n]);
                onWajah?.();
              }}
            >
              <Ikon size={34} weight={dipilih ? "fill" : "regular"} aria-hidden />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  if (tanya.type === "nps") {
    return (
      <div className="kb-nps">
        <output className="kb-nps-angka" key={typeof nilai === "number" ? nilai : "kosong"} data-isi={typeof nilai === "number" || undefined}>
          {typeof nilai === "number" ? nilai : "?"}
        </output>
        <div className="kb-nps-baris" role="radiogroup" aria-labelledby={idJudul}>
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={nilai === n}
              aria-label={t.npsOf(n)}
              className="kb-nps-tombol"
              onClick={() => {
                onNilai(n);
                onReaksi?.(t.reactNps(n));
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="kb-ujung">
          <span>{t.npsLow}</span>
          <span>{t.npsHigh}</span>
        </div>
      </div>
    );
  }
  if (tanya.type === "choice") {
    const pilih = Array.isArray(nilai) ? nilai : [];
    return (
      <>
        <p className="kb-bantu">{t.pickUpTo(tanya.max)}</p>
        <div className="kb-chip-baris" role="group" aria-labelledby={idJudul}>
          {tanya.options.map((opsi) => {
            const dipilih = pilih.includes(opsi);
            return (
              <button
                key={opsi}
                type="button"
                aria-pressed={dipilih}
                className="kb-chip"
                onClick={() => {
                  if (dipilih) onNilai(pilih.filter((p) => p !== opsi).length ? pilih.filter((p) => p !== opsi) : undefined);
                  else if (tanya.max === 1) {
                    onNilai([opsi]);
                    onReaksi?.(t.reactChoice);
                  }
                  else if (pilih.length < tanya.max) {
                    onNilai([...pilih, opsi]);
                    onReaksi?.(t.reactChoice);
                  }
                }}
              >
                {opsi}
              </button>
            );
          })}
        </div>
      </>
    );
  }
  return (
    <textarea
      className="kb-isian"
      aria-labelledby={idJudul}
      placeholder={t.typeHere}
      maxLength={1000}
      rows={4}
      value={typeof nilai === "string" ? nilai : ""}
      onChange={(e) => onNilai(e.target.value ? e.target.value : undefined)}
      onBlur={(e) => {
        if (e.target.value.trim()) onReaksi?.(t.reactText);
      }}
    />
  );
}

/** Isi kartu kenangan: fakta kecil di atas, judul, dan isi. Null bila peserta tidak punya datanya. */
export function isiKenangan(lang: LandingLang, kartu: KunciKartu, k: Kenangan): { fakta: string | null; judul: string; isi: ReactNode } | null {
  const t = KILAS_UI[lang];
  if (kartu === "trip" && k.trip) {
    const Ikon = IKON_TRIP[k.trip.mode];
    return {
      fakta: k.trip.kapan,
      judul: t.trip[k.trip.mode],
      isi: (
        <ul className="kb-daftar">
          <li>
            <Ikon size={24} aria-hidden />
            <span>
              <b>{k.trip.judul}</b>
              {k.trip.detail ? <small>{k.trip.detail}</small> : null}
            </span>
          </li>
        </ul>
      ),
    };
  }
  if (kartu === "stay" && k.stay) {
    const sub = [k.stay.kamar ? t.room(k.stay.kamar) : null, k.stay.teman.length ? t.roommates(k.stay.teman) : null].filter(Boolean).join(", ");
    return {
      fakta: k.stay.malam > 0 ? t.nights(k.stay.malam) : null,
      judul: t.stayTitle,
      isi: (
        <ul className="kb-daftar">
          <li>
            <Bed size={24} aria-hidden />
            <span>
              <b>{k.stay.hotel}</b>
              {sub ? <small>{sub}</small> : null}
            </span>
          </li>
        </ul>
      ),
    };
  }
  if (kartu === "agenda" && k.agenda) {
    return {
      fakta: null,
      judul: t.agendaTitle,
      isi: (
        <>
          {k.agenda.hadir > 0 ? (
            <p className="kb-angka">
              <b>
                <Hitung ke={k.agenda.hadir} />
              </b>
              <span>{t.agendaCount}</span>
            </p>
          ) : null}
          {k.agenda.sorotan.length ? (
            <ul className="kb-daftar">
              {k.agenda.sorotan.map((s) => (
                <li key={s}>
                  <CalendarCheck size={24} aria-hidden />
                  <span>
                    <b>{s}</b>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ),
    };
  }
  if (kartu === "prize" && k.prize) {
    return {
      fakta: null,
      judul: t.prizeTitle,
      isi: (
        <>
          <p className="kb-teks">{t.prizeBody}</p>
          <ul className="kb-daftar">
            {k.prize.hadiah.map((h, n) => (
              <li key={`${h}-${n}`}>
                <Gift size={24} aria-hidden />
                <span>
                  <b>{h}</b>
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    };
  }
  return null;
}

/** Ubin angka untuk rekap: hari, sesi, malam, hadiah. */
export function ubinRekap(lang: LandingLang, k: Kenangan): { n: number; l: string }[] {
  const t = KILAS_UI[lang];
  return [
    { n: k.hari, l: t.tileDays(k.hari) },
    k.agenda && k.agenda.hadir > 0 ? { n: k.agenda.hadir, l: t.tileSessions } : null,
    k.stay && k.stay.malam > 0 ? { n: k.stay.malam, l: t.tileNights } : null,
    k.prize && k.prize.hadiah.length ? { n: k.prize.hadiah.length, l: t.tilePrizes } : null,
  ].filter((x): x is { n: number; l: string } => x !== null && x.n > 0);
}

/** Konfeti singkat di kanvas sesudah terkirim; tidak ada untuk reduced motion. */
export function useKonfeti(nyala: boolean) {
  const kanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!nyala || reduksiGerak()) return;
    const cv = kanvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const kotak = cv.getBoundingClientRect();
    cv.width = kotak.width;
    cv.height = kotak.height;
    const gaya = getComputedStyle(cv);
    const warna = [gaya.getPropertyValue("--kb-aksen").trim() || "#e8c968", "#ffffff", gaya.getPropertyValue("--kb-kertas").trim() || "#f6f1e3"];
    const butir = Array.from({ length: 70 }, () => ({
      x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.6, vx: (Math.random() - 0.5) * 1.6, vy: 1.6 + Math.random() * 2.4,
      s: 4 + Math.random() * 5, c: warna[Math.floor(Math.random() * warna.length)], a: Math.random() * 6,
    }));
    let langkah = 0;
    let bingkai = 0;
    const gambar = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const b of butir) {
        b.x += b.vx;
        b.y += b.vy;
        b.a += 0.08;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.a);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.6);
        ctx.restore();
      }
      if (++langkah < 150) bingkai = requestAnimationFrame(gambar);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    };
    bingkai = requestAnimationFrame(gambar);
    return () => cancelAnimationFrame(bingkai);
  }, [nyala]);
  return kanvas;
}

/**
 * Isi kartu penutup: terima kasih, lalu "kartu karakter" yang bisa
 * di-screenshot (gelar, angka perjalanan, momen favorit), ucapan panitia, dan
 * status kiriman.
 */
export function Penutup({
  lang, kenangan, jawaban, tanya, penutup, penanda, namaAcara, kirim, galat, tutupTanggal, portalUrl, judulRef, onKirim, onUbah,
}: {
  lang: LandingLang;
  kenangan: Kenangan;
  jawaban: Record<string, NilaiJawaban>;
  tanya: TanyaKlien[];
  penutup: string | null;
  penanda: string | null;
  namaAcara: string;
  kirim: Kirim;
  galat: string | null;
  tutupTanggal: string | null;
  portalUrl: string;
  judulRef?: RefObject<HTMLHeadingElement | null>;
  onKirim: () => void;
  onUbah: () => void;
}) {
  const t = KILAS_UI[lang];
  const kanvas = useKonfeti(kirim === "terkirim");
  const favorit = tanya.find((q) => q.type === "choice" && Array.isArray(jawaban[q.key]) && (jawaban[q.key] as string[]).length);
  const momen = favorit ? (jawaban[favorit.key] as string[])[0] : null;
  const ubin = ubinRekap(lang, kenangan);

  return (
    <>
      <canvas ref={kanvas} className="kb-konfeti" aria-hidden />
      <h1 id="kb-judul" ref={judulRef} tabIndex={-1} className="kb-judul">
        <KataMuncul teks={t.thanks(kenangan.nama)} jeda={90} />
      </h1>
      <section className="kb-karakter" aria-label={t.recapTitle}>
        <span className="kb-karakter-bintang" aria-hidden>
          <svg viewBox="0 0 24 24" width="40" height="40">
            <path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z" fill="currentColor" />
          </svg>
        </span>
        <p className="kb-karakter-acara">
          {t.recapTitle} · {namaAcara}
        </p>
        <p className="kb-karakter-nama">{kenangan.nama}</p>
        <p className="kb-karakter-gelar">
          <span>{t.yourTitle}</span>
          <b>{gelar(lang, kenangan, jawaban, tanya)}</b>
        </p>
        {ubin.length ? (
          <dl className="kb-ubin">
            {ubin.map((u) => (
              <div key={u.l}>
                <dt>{u.l}</dt>
                <dd>
                  <Hitung ke={u.n} tunda={500} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {momen ? (
          <p className="kb-favorit">
            <span>{t.favourite}</span>
            <b>{momen}</b>
          </p>
        ) : null}
      </section>
      <blockquote className="kb-ucapan">
        <p>{penutup?.trim() || t.closingDefault}</p>
        {penanda?.trim() ? <footer>{penanda.trim()}</footer> : null}
      </blockquote>
      <div className="kb-isi-bawah">
        {kirim === "mengirim" ? <p className="kb-status" role="status">{t.sending}</p> : null}
        {kirim === "terkirim" ? (
          <p className="kb-status" role="status">
            {t.sent} {tutupTanggal ? t.editUntil(tutupTanggal) : null}
          </p>
        ) : null}
        {kirim === "luring" ? <p className="kb-status kb-status-tunda" role="status">{t.offline}</p> : null}
        {kirim === "gagal" ? <p className="kb-galat" role="alert">{galat ?? t.failed}</p> : null}
        {kirim === "luring" || kirim === "gagal" ? (
          <button type="button" className="kb-tombol" onClick={onKirim}>
            {t.retry}
          </button>
        ) : (
          <a href={portalUrl} className="kb-tombol">
            {t.backToPortal}
          </a>
        )}
        {kirim === "terkirim" ? (
          <button type="button" className="kb-tombol-teks" onClick={onUbah}>
            {t.editAnswers}
          </button>
        ) : null}
      </div>
    </>
  );
}
