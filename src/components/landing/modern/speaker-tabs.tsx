"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { LandingSpeaker } from "@/lib/domain";
import type { SpeakerTab } from "@/lib/landing-speaker-tabs";
import { JUDUL_BUTIR } from "./styles";

/**
 * Bagian Pembicara tata letak Modern: tab sesi di atas kisi kartu.
 *
 * Paling banyak 8 kartu tampil sekaligus (tab "Sorotan"); pembicara lain
 * dibuka per sesi lewat tab, di tempat, tanpa halaman atau panel baru. Tab
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
  "linear-gradient(to bottom, color-mix(in srgb, var(--reg-primary) 10%, var(--reg-surface)), color-mix(in srgb, var(--reg-primary) 22%, var(--reg-surface)))";

function Kartu({ speaker }: { speaker: LandingSpeaker }) {
  // Peran umum ("Pembicara", "Speaker") tidak ditulis: di bagian Pembicara
  // semua orang pembicara. Yang ditulis hanya peran pembeda, mis. Moderator.
  const peran = speaker.role?.trim();
  const keterangan = [peran && !/^(pembicara|speaker)$/i.test(peran) ? peran : null, speaker.title?.trim()].filter(Boolean).join(" · ");
  return (
    <li className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-[var(--reg-outline-variant)]">
        {speaker.photo_url ? (
          // Dipotong dari sepertiga atas: foto pejabat setengah badan atau
          // lanskap tidak kehilangan dahi.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={speaker.photo_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover object-[50%_20%]" />
        ) : (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center" style={{ background: LATAR_INISIAL }}>
            <span className="text-[48px] font-semibold text-[var(--reg-primary)] opacity-60 [font-family:var(--landing-heading)] sm:text-[72px]">
              {inisial(speaker.name)}
            </span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className={JUDUL_BUTIR}>{speaker.name}</p>
        {keterangan ? <p className="text-body-medium text-[var(--reg-on-surface-variant)]">{keterangan}</p> : null}
        {speaker.company?.trim() ? (
          // Warna teks, bukan warna utama: teks biru tebal terbaca sebagai tautan.
          <p className="text-label-large font-semibold text-[var(--reg-on-surface)]">{speaker.company.trim()}</p>
        ) : null}
      </div>
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
}: {
  tabs: SpeakerTab[];
  eyebrow: string | null;
  heading: string;
  eyebrowClassName: string;
  headingClassName: string;
  /** Nama baris tab untuk pembaca layar, dalam bahasa halaman. */
  tablistLabel?: string;
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
            <Kartu key={`${speaker.name}-${index}`} speaker={speaker} />
          ))}
        </ul>
      </div>
    </>
  );
}
