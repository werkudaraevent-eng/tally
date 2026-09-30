"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown } from "@phosphor-icons/react";
import type { LandingSpeaker } from "@/lib/domain";

/**
 * Kisi pembicara tata letak Modern: kartu tinggi dengan foto (atau inisial),
 * bayangan gelap dari bawah, nama, chip instansi, dan jabatan.
 *
 * Delapan kartu pertama tampil, sisanya di balik tombol "Semua pembicara".
 * Tidak ada halaman pembicara terpisah, jadi tombolnya membuka kisi di tempat,
 * bukan berpindah halaman.
 */

const AWAL = 8;

/** Dua huruf awal nama, untuk pembicara tanpa foto. */
function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter((kata) => /^\p{L}/u.test(kata))
    .slice(0, 2)
    .map((kata) => kata[0]!.toUpperCase())
    .join("");
}

/**
 * Latar kartu tanpa foto: nada tema yang turun ke gelap. Bagian bawahnya
 * tertutup bayangan hitam tempat nama berdiri, jadi teks putih tetap terbaca
 * apa pun warna temanya.
 */
const LATAR_INISIAL =
  "linear-gradient(to bottom, color-mix(in srgb, var(--reg-primary) 14%, var(--reg-panel)), color-mix(in srgb, var(--reg-primary) 22%, var(--reg-outline)))";

/** Bayangan bawah kartu. Mulai gelap sebelum separuh kartu: di ponsel nama dua baris dan jabatan panjang naik sampai ke sana. */
const BAYANGAN = "linear-gradient(to bottom, transparent 22%, rgb(0 0 0 / 0.55) 48%, rgb(0 0 0 / 0.85))";

function Kartu({ speaker }: { speaker: LandingSpeaker }) {
  // Chip menampilkan instansi. Acara lama belum punya kolom instansi; peran
  // (mis. "Opening Keynote") dipakai sebagai gantinya supaya kartu tidak kosong.
  const chip = speaker.company?.trim() || speaker.role?.trim() || null;
  return (
    <li className="relative isolate aspect-[3/4] overflow-hidden rounded-lg">
      {speaker.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={speaker.photo_url} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: LATAR_INISIAL }}>
          <span className="absolute left-4 top-3 text-[56px] leading-[1.25] text-white/60 [font-family:var(--landing-heading)] sm:left-6 sm:top-5 sm:text-[96px]">
            {inisial(speaker.name)}
          </span>
        </div>
      )}
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: BAYANGAN }} />
      <div className="flex h-full flex-col justify-end gap-2 p-4 text-white sm:gap-3 sm:p-6">
        <p className="text-balance text-title-medium font-medium sm:text-title-large sm:font-medium">{speaker.name}</p>
        {chip ? (
          <p className="max-w-full self-start truncate rounded-full border border-white/30 bg-white/15 px-3 py-1 text-label-medium font-normal sm:px-3.5 sm:py-1.5 sm:text-label-large sm:font-normal">
            {chip}
          </p>
        ) : null}
        {speaker.title ? <p className="text-body-small text-white/85 sm:text-body-medium">{speaker.title}</p> : null}
      </div>
    </li>
  );
}

export function SpeakerGrid({ speakers, heading }: { speakers: LandingSpeaker[]; heading: ReactNode }) {
  const [semua, setSemua] = useState(false);
  const lebih = speakers.length > AWAL;
  const tampil = semua ? speakers : speakers.slice(0, AWAL);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {heading}
        {lebih && !semua ? (
          <button
            type="button"
            onClick={() => setSemua(true)}
            className="m3-state inline-flex min-h-[52px] items-center gap-2 rounded-full border border-[var(--reg-on-surface)] px-5 text-title-medium font-medium"
          >
            Semua pembicara
            <span className="tabular-nums text-[var(--reg-on-surface-variant)]">{speakers.length}</span>
            <ArrowDown size={16} aria-hidden />
          </button>
        ) : null}
      </div>
      <ul className="mt-10 grid grid-cols-2 gap-3 sm:mt-14 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {tampil.map((speaker, index) => (
          <Kartu key={`${speaker.name}-${index}`} speaker={speaker} />
        ))}
      </ul>
    </>
  );
}
