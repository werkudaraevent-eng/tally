"use client";

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { LandingSpeaker } from "@/lib/domain";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { pembicaraSesi } from "@/lib/landing-speaker-tabs";
import { rentangAkhir } from "@/lib/landing-agenda-range";

/**
 * Susunan acara tata letak Modern: tab pil per bagian rundown di atas daftar
 * sesi, jam di kiri tiap baris (di atas judul pada ponsel).
 *
 * Perilakunya sama dengan AgendaTabs (Editorial): satu bagian tampil utuh,
 * papan ketik mengikuti pola tab WAI-ARIA, dan tanpa tab bila rundown hanya
 * punya satu bagian. Berkas terpisah karena bentuk tab dan barisnya berbeda
 * seluruhnya; satu komponen dengan dua gaya akan membuat keduanya sulit diubah.
 */
export function AgendaPills({ agenda, speakers = [] }: { agenda: AgendaPreview[]; speakers?: LandingSpeaker[] }) {
  const [aktif, setAktif] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dasar = useId();
  const multi = agenda.length > 1;
  const blok = agenda[aktif] ?? agenda[0];

  function pindah(event: KeyboardEvent<HTMLDivElement>) {
    const maju = event.key === "ArrowRight" || event.key === "ArrowDown";
    const mundur = event.key === "ArrowLeft" || event.key === "ArrowUp";
    let tujuan: number | null = null;
    if (maju) tujuan = (aktif + 1) % agenda.length;
    if (mundur) tujuan = (aktif - 1 + agenda.length) % agenda.length;
    if (event.key === "Home") tujuan = 0;
    if (event.key === "End") tujuan = agenda.length - 1;
    if (tujuan === null) return;
    event.preventDefault();
    setAktif(tujuan);
    tabRefs.current[tujuan]?.focus();
  }

  return (
    <div>
      {multi ? (
        <div
          role="tablist"
          aria-label="Bagian acara"
          onKeyDown={pindah}
          // Menggulir menyamping di ponsel, bukan terlipat: dua baris pil
          // terbaca seperti dua kelompok pilihan yang berbeda.
          className="-mx-5 mb-10 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {agenda.map((bagian, index) => {
            const pilih = index === aktif;
            const awal = bagian.items[0]?.time;
            const akhir = rentangAkhir(bagian);
            const rentang = awal ? (akhir && akhir !== awal ? `${awal} – ${akhir}` : awal) : null;
            return (
              <button
                key={bagian.sectionTitle ?? index}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                id={`${dasar}-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={pilih}
                aria-controls={`${dasar}-panel`}
                tabIndex={pilih ? 0 : -1}
                onClick={() => setAktif(index)}
                className={`m3-state inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-[18px] text-label-large font-medium tabular-nums ${
                  pilih
                    ? "border-[var(--reg-primary)] bg-[var(--reg-primary)] text-[var(--reg-on-primary)]"
                    : "border-[var(--reg-outline-variant)] text-[var(--reg-on-surface)]"
                }`}
                style={pilih ? ({ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties) : undefined}
              >
                {bagian.sectionTitle || `Bagian ${index + 1}`}
                {rentang ? <span aria-hidden> · </span> : null}
                {rentang ? <span>{rentang}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <ol
        id={`${dasar}-panel`}
        role={multi ? "tabpanel" : undefined}
        aria-labelledby={multi ? `${dasar}-tab-${aktif}` : undefined}
        className="border-b border-[color-mix(in_srgb,var(--reg-outline-variant)_70%,transparent)]"
      >
        {blok?.items.map((item, index) => {
          const orang = pembicaraSesi(speakers, item.title);
          // Jeda (registrasi, makan siang): tanpa keterangan dan tanpa
          // pembicara. Ditulis tenang supaya sesi inti menonjol sendiri dan
          // rundown terbaca sebagai alur acara, bukan daftar rata.
          const jeda = !item.subtitle && orang.length === 0;
          return (
            // Hierarki M3 lewat peran warna, satu penekanan per baris: judul
            // on-surface 16px/600; jam sesi inti satu-satunya aksen warna.
            // Jam satu baris ("08.00–09.00"): dua baris jam membuat tiap baris
            // setinggi 140-180px dan rundown tidak muat satu layar.
            <li
              key={`${item.time}-${item.title}-${index}`}
              className="flex flex-col gap-1 border-t border-[color-mix(in_srgb,var(--reg-outline-variant)_70%,transparent)] py-4 sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-x-8 lg:grid-cols-[8.5rem_minmax(0,1fr)_auto]"
            >
              <span
                className={`text-body-medium font-medium tabular-nums sm:pt-px sm:text-[15px] ${
                  jeda ? "text-[var(--reg-on-surface-variant)]" : "text-[var(--reg-primary)]"
                }`}
              >
                {item.time}
                {item.end && item.end !== item.time ? `–${item.end}` : null}
              </span>
              <div className="min-w-0 max-w-[760px]">
                <p
                  className={`text-[16px] leading-[1.45] ${
                    jeda ? "font-normal text-[var(--reg-on-surface-variant)]" : "font-semibold text-[var(--reg-on-surface)]"
                  }`}
                >
                  {item.title}
                </p>
                {item.subtitle ? (
                  // pre-line: satu sesi bisa punya beberapa pilihan, satu per baris
                  // (mis. tiga kelompok diskusi di jam yang sama).
                  <p className="mt-1 whitespace-pre-line text-body-medium leading-[1.55] text-[var(--reg-on-surface-variant)]">{item.subtitle}</p>
                ) : null}
              </div>
              {orang.length > 0 ? <DeretPembicara orang={orang} /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const MAKS_FOTO = 5;

function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter((kata) => /^\p{L}/u.test(kata))
    .slice(0, 2)
    .map((kata) => kata[0]!.toUpperCase())
    .join("");
}

/**
 * Wajah pembicara sesi: deret foto bulat bertumpuk. Tamu langsung tahu siapa
 * bicara kapan tanpa bolak-balik ke bagian Pembicara. Paling banyak lima foto,
 * sisanya "+N".
 *
 * Layar lebar: di kolom kanan sebaris dengan judul, tanpa menambah tinggi
 * baris, supaya rundown tetap muat satu layar laptop. Nama lengkap ada di
 * tooltip dan di bagian Pembicara. Layar sempit: di bawah judul dengan nama
 * singkat.
 */
function DeretPembicara({ orang }: { orang: LandingSpeaker[] }) {
  const tampil = orang.slice(0, MAKS_FOTO);
  const sisa = orang.length - tampil.length;
  const nama = orang.slice(0, 2).map((speaker) => speaker.name.trim());
  const keterangan = orang.length > 2 ? `${nama.join(", ")}, dan ${orang.length - 2} lainnya` : nama.join(" dan ");
  return (
    <div className="mt-3 flex items-center gap-3 sm:col-start-2 lg:col-start-3 lg:row-start-1 lg:mt-0 lg:self-start lg:pt-0.5" title={orang.map((speaker) => speaker.name.trim()).join(", ")}>
      <ul aria-hidden className="flex shrink-0">
        {tampil.map((speaker, index) => (
          <li
            key={`${speaker.name}-${index}`}
            className="-ml-2 flex size-8 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--reg-primary)_14%,var(--reg-surface))] text-[11px] font-semibold text-[var(--reg-primary)] ring-2 ring-[var(--reg-surface)] first:ml-0"
          >
            {speaker.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={speaker.photo_url} alt="" loading="lazy" className="size-full object-cover object-[50%_20%]" />
            ) : (
              inisial(speaker.name)
            )}
          </li>
        ))}
        {sisa > 0 ? (
          <li className="-ml-2 flex size-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--reg-outline-variant)_45%,var(--reg-surface))] text-[11px] font-semibold text-[var(--reg-on-surface-variant)] ring-2 ring-[var(--reg-surface)]">
            +{sisa}
          </li>
        ) : null}
      </ul>
      <p className="min-w-0 text-body-small text-[var(--reg-on-surface-variant)] sm:text-body-medium lg:sr-only">{keterangan}</p>
    </div>
  );
}
