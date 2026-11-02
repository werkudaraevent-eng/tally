"use client";

import { ArrowRight, ArrowUpRight, X } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { LandingSpeaker, LandingSpeakerFrame } from "@/lib/domain";
import type { SpeakerTab } from "@/lib/landing-speaker-tabs";
import { punyaProfil, TEKS_PROFIL_ID, type TeksProfil } from "@/lib/landing-speaker-profil";
import { JUDUL_BUTIR } from "./styles";

/**
 * Bagian Pembicara tata letak Modern: tab sesi di atas kisi kartu.
 *
 * Tab "Sorotan" (bila ada yang ditonjolkan) paling banyak 8 kartu; pembicara
 * lain dibuka per sesi lewat tab, di tempat, tanpa halaman atau panel baru. Tab
 * memakai bentuk filter chip M3 (satu terpilih) dan pola tab WAI-ARIA untuk
 * papan ketik. Dengan satu tab saja, baris tab tidak digambar.
 *
 * Nama, jabatan, dan instansi berdiri di BAWAH foto, bukan di atasnya: teks di
 * atas foto butuh bayangan gelap dan tetap kalah terbaca dari teks di kertas.
 */

/** Dua huruf awal nama, untuk pembicara tanpa foto. */
function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter((kata) => /^\p{L}/u.test(kata))
    .slice(0, 2)
    .map((kata) => kata[0]!.toUpperCase())
    .join("");
}

const LATAR_INISIAL =
  "var(--inisial-latar, linear-gradient(to bottom, color-mix(in srgb, var(--reg-primary) 10%, var(--reg-surface)), color-mix(in srgb, var(--reg-primary) 22%, var(--reg-surface))))";

/**
 * Bingkai foto per acara (`speaker_frame`), hanya untuk kartu ini; deret foto
 * di Susunan acara tetap bulat (avatar bertumpuk butuh bentuk bulat).
 * - Potret: keempat sudut mengikuti Tema > Corners.
 * - Lengkung: atas setengah lingkaran (radius 50% lebar = 40% tinggi pada
 *   4:5), sudut bawah mengikuti Corners.
 * - Bulat: tidak memakai Corners.
 */
const BINGKAI: Record<LandingSpeakerFrame, string> = {
  portrait: "aspect-[4/5] rounded-lg",
  circle: "aspect-square rounded-full",
  arch: "aspect-[4/5] rounded-b-lg [border-top-left-radius:50%_40%] [border-top-right-radius:50%_40%]",
};

/**
 * Letak wajah. Foto pejabat setengah badan dipotong dari seperlima atas supaya
 * dahi tidak hilang. Di bingkai bulat potongan 4:5 ke 1:1 diambil dari tepi
 * atas: ruang di atas kepala tetap ada dan mata jatuh di sekitar 40% tinggi.
 */
const LETAK_FOTO: Record<LandingSpeakerFrame, string> = {
  portrait: "object-[50%_20%]",
  circle: "object-top",
  arch: "object-[50%_20%]",
};


// Peran umum ("Pembicara", "Speaker") tidak ditulis: di bagian Pembicara
// semua orang pembicara. Yang ditulis hanya peran pembeda, mis. Moderator.
function keteranganDari(speaker: LandingSpeaker): string {
  const peran = speaker.role?.trim();
  return [peran && !/^(pembicara|speaker)$/i.test(peran) ? peran : null, speaker.title?.trim()].filter(Boolean).join(", ");
}

/**
 * Profil pembicara: lembar bawah di ponsel, dialog di tengah di layar lebar
 * (pola Sessionize dan Luma: kartu tetap ringkas, profil panjang dibuka di
 * tempat tanpa pindah halaman). `<dialog>` bawaan: fokus terkunci, Escape
 * menutup, fokus kembali ke kartu.
 */
function DialogProfil({ speaker, bingkai, teks, onTutup }: { speaker: LandingSpeaker; bingkai: LandingSpeakerFrame; teks: TeksProfil; onTutup: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const judulId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const akar = document.documentElement;
    const lama = akar.style.overflow;
    akar.style.overflow = "hidden";
    return () => { akar.style.overflow = lama; };
  }, []);
  const keterangan = keteranganDari(speaker);
  const paragraf = (speaker.bio ?? "").split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const tautan = speaker.link?.trim();
  return (
    <dialog
      ref={ref}
      aria-labelledby={judulId}
      onClose={onTutup}
      onClick={(event) => { if (event.target === event.currentTarget) ref.current?.close(); }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-xl bg-[var(--reg-surface)] p-0 text-[var(--reg-on-surface)] backdrop:bg-black/50 sm:m-auto sm:max-h-[min(80dvh,720px)] sm:w-[min(560px,calc(100vw-48px))] sm:rounded-xl"
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-start gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className={`relative size-[72px] shrink-0 overflow-hidden bg-[var(--bingkai-foto,var(--reg-outline-variant))] ${bingkai === "circle" ? "rounded-full" : "rounded-lg"}`}>
            {speaker.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={speaker.photo_url} alt="" className={`absolute inset-0 size-full object-cover ${LETAK_FOTO[bingkai] ?? LETAK_FOTO.portrait}`} />
            ) : (
              <div aria-hidden className="absolute inset-0 flex items-center justify-center" style={{ background: LATAR_INISIAL }}>
                <span className="text-[24px] font-semibold text-[var(--inisial-teks,var(--reg-primary))] opacity-[var(--inisial-opasitas,0.6)] [font-family:var(--landing-heading)]">{inisial(speaker.name)}</span>
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
            <h3 id={judulId} className="text-title-large font-semibold [font-family:var(--landing-heading)]">{speaker.name}</h3>
            {keterangan ? <p className="text-body-medium text-[var(--reg-on-surface-variant)]">{keterangan}</p> : null}
            {speaker.company?.trim() ? <p className="text-label-large font-semibold">{speaker.company.trim()}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={teks.tutup}
            className="m3-state -mr-2 -mt-2 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--reg-on-surface-variant)]"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {paragraf.length ? (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
            <div className="flex flex-col gap-3 pb-1 text-body-large text-[var(--reg-on-surface)]">
              {paragraf.map((isi, index) => <p key={index} className="whitespace-pre-line">{isi}</p>)}
            </div>
          </div>
        ) : null}
        <div className="flex shrink-0 justify-start px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          {tautan ? (
            <a
              href={tautan}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="m3-state inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--reg-outline)] px-5 text-label-large font-semibold text-[var(--reg-on-surface)]"
            >
              {teks.tautan}
              <ArrowUpRight size={16} aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

/** Isi kartu yang bisa diketuk untuk membuka profil. Juga dipakai kartu tema Trip. */
export function BukaProfil({ speaker, bingkai = "portrait", teks, className, children }: { speaker: LandingSpeaker; bingkai?: LandingSpeakerFrame; teks: TeksProfil; className?: string; children: ReactNode }) {
  const [buka, setBuka] = useState(false);
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setBuka(true)} className={`group w-full min-w-0 text-left ${className ?? ""}`}>
        {children}
      </button>
      {buka ? <DialogProfil speaker={speaker} bingkai={bingkai} teks={teks} onTutup={() => setBuka(false)} /> : null}
    </>
  );
}

/** Tautan kecil "Lihat profil" di bawah kartu yang bisa dibuka. */
export function TandaProfil({ teks, className }: { teks: TeksProfil; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-label-large font-semibold underline-offset-4 group-hover:underline ${className ?? "text-[var(--reg-primary)]"}`}>
      {teks.profil}
      <ArrowRight size={14} aria-hidden />
    </span>
  );
}

function Kartu({ speaker, bingkai, teks }: { speaker: LandingSpeaker; bingkai: LandingSpeakerFrame; teks: TeksProfil }) {
  const keterangan = keteranganDari(speaker);
  const bisaDibuka = punyaProfil(speaker);
  const isi = (
    <>
      <div data-bingkai={bingkai} className={`relative overflow-hidden bg-[var(--bingkai-foto,var(--reg-outline-variant))] ${BINGKAI[bingkai] ?? BINGKAI.portrait}`}>
        {speaker.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={speaker.photo_url} alt="" loading="lazy" className={`absolute inset-0 size-full object-cover ${LETAK_FOTO[bingkai] ?? LETAK_FOTO.portrait}`} />
        ) : (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center" style={{ background: LATAR_INISIAL }}>
            <span className="text-[48px] font-semibold text-[var(--inisial-teks,var(--reg-primary))] opacity-[var(--inisial-opasitas,0.6)] [font-family:var(--landing-heading)] sm:text-[72px]">
              {inisial(speaker.name)}
            </span>
          </div>
        )}
      </div>
      {/* Di bawah lingkaran, teks rata kiri mulai di tempat lengkungnya sudah masuk. */}
      <div className={`flex min-w-0 flex-col gap-1 ${bingkai === "circle" ? "items-center text-center" : ""}`}>
        <p className={JUDUL_BUTIR}>{speaker.name}</p>
        {keterangan ? <p className="text-body-medium text-[var(--reg-on-surface-variant)]">{keterangan}</p> : null}
        {speaker.company?.trim() ? (
          // Warna teks, bukan warna utama: teks biru tebal terbaca sebagai tautan.
          <p className="text-label-large font-semibold text-[var(--reg-on-surface)]">{speaker.company.trim()}</p>
        ) : null}
        {bisaDibuka ? <TandaProfil teks={teks} className="mt-1 text-[var(--reg-primary)]" /> : null}
      </div>
    </>
  );
  if (!bisaDibuka) return <li className="flex min-w-0 flex-col gap-3 sm:gap-4">{isi}</li>;
  return (
    <li className="min-w-0">
      <BukaProfil speaker={speaker} bingkai={bingkai} teks={teks} className="flex flex-col gap-3 rounded-lg sm:gap-4">{isi}</BukaProfil>
    </li>
  );
}

export function SpeakerTabs({
  tabs,
  eyebrow,
  heading,
  eyebrowClassName,
  headingClassName,
  tablistLabel = "Pembicara per sesi",
  bingkai = "portrait",
  teksProfil = TEKS_PROFIL_ID,
}: {
  tabs: SpeakerTab[];
  eyebrow: string | null;
  heading: string;
  eyebrowClassName: string;
  headingClassName: string;
  /** Nama baris tab untuk pembaca layar, dalam bahasa halaman. */
  tablistLabel?: string;
  /** Bentuk foto (`landing_config.speaker_frame`). Hanya Modern; Forum memakai bentuk rancangannya sendiri. */
  bingkai?: LandingSpeakerFrame;
  /** Teks dialog profil dalam bahasa halaman. */
  teksProfil?: TeksProfil;
}) {
  const [aktif, setAktif] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dasar = useId();
  const multi = tabs.length > 1;
  const tab = tabs[aktif] ?? tabs[0];
  if (!tab) return null;

  function pindah(event: KeyboardEvent<HTMLDivElement>) {
    const maju = event.key === "ArrowRight" || event.key === "ArrowDown";
    const mundur = event.key === "ArrowLeft" || event.key === "ArrowUp";
    let tujuan: number | null = null;
    if (maju) tujuan = (aktif + 1) % tabs.length;
    if (mundur) tujuan = (aktif - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") tujuan = 0;
    if (event.key === "End") tujuan = tabs.length - 1;
    if (tujuan === null) return;
    event.preventDefault();
    setAktif(tujuan);
    tabRefs.current[tujuan]?.focus();
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {eyebrow ? <p className={eyebrowClassName}>{eyebrow}</p> : null}
        <h2 className={headingClassName}>{heading}</h2>
      </div>

      {multi ? (
        <div
          role="tablist"
          aria-label={tablistLabel}
          onKeyDown={pindah}
          // Menggeser menyamping di ponsel, bukan terlipat: dua baris chip
          // terbaca sebagai dua kelompok pilihan yang berbeda.
          className="-mx-5 mt-8 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:mt-10 sm:flex-wrap sm:px-0"
        >
          {tabs.map((item, index) => {
            const pilih = index === aktif;
            return (
              <button
                key={item.key}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                id={`${dasar}-tab-${index}`}
                data-tab={item.key}
                type="button"
                role="tab"
                aria-selected={pilih}
                aria-controls={`${dasar}-panel`}
                title={item.fullTitle}
                tabIndex={pilih ? 0 : -1}
                onClick={() => setAktif(index)}
                // Terpilih = tonal (M3 filter chip), bukan isi penuh warna utama:
                // ini pemilih tampilan, tidak boleh bersaing dengan tombol utama.
                className={`m3-state inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-md border px-4 text-label-large font-medium text-[var(--reg-on-surface)] ${
                  pilih
                    ? "border-transparent bg-[color-mix(in_srgb,var(--reg-primary)_14%,var(--reg-surface))] font-semibold"
                    : "border-[var(--reg-outline-variant)] bg-[var(--reg-surface)]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        id={`${dasar}-panel`}
        role={multi ? "tabpanel" : undefined}
        aria-labelledby={multi ? `${dasar}-tab-${aktif}` : undefined}
        className={multi ? "mt-6" : "mt-10 sm:mt-12"}
      >
        {tab.note ? <p className="mb-6 text-isi text-[var(--reg-on-surface-variant)]">{tab.note}</p> : null}
        <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
          {tab.speakers.map((speaker, index) => (
            <Kartu key={`${speaker.name}-${index}`} speaker={speaker} bingkai={bingkai} teks={teksProfil} />
          ))}
        </ul>
      </div>
    </>
  );
}
