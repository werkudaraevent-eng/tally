"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { hariBerkelompok, PilihKelompok, saringKelompok, usePilihanKelompok } from "@/components/landing/pilih-kelompok";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { rentangAkhir } from "@/lib/landing-agenda-range";
import { TeksKaya } from "@/components/landing/teks-kaya";
import { LabelUntuk } from "@/components/landing/label-untuk";

/**
 * Susunan acara per bagian rundown (mis. "Pagi" dan "Malam").
 *
 * Satu bagian tampil utuh sekaligus, bagian lain di balik tab. Menumpuk semua
 * bagian berurutan membuat acara dua sesi menjadi daftar tiga puluh baris yang
 * harus digulir untuk menemukan jam acara malam, dan tamu yang membuka halaman
 * ini biasanya mencari satu sesi, bukan membaca seluruh hari.
 *
 * Satu bagian saja: tab tidak dirender, daftar berdiri sendiri.
 *
 * Tab vertikal di layar lebar (di rel kiri, di bawah judul bagian), mendatar di
 * ponsel. Papan ketik mengikuti pola tab WAI-ARIA: panah berpindah tab, Home
 * dan End ke ujung.
 */
export function AgendaTabs({
  agenda,
  stacked = false,
  warnaTanda = "var(--warna-tanda, var(--reg-primary))",
}: {
  agenda: AgendaPreview[];
  /** Warna tanda Theme colour di Details; null = tebal saja (warna utama sama dengan teks). */
  warnaTanda?: string | null;
  /** Tab selalu mendatar di atas daftar, untuk kolom sempit (area peserta). */
  stacked?: boolean;
}) {
  /** Kelas tata letak layar lebar; dibuang saat `stacked`. */
  const lebar = (kelas: string) => (stacked ? "" : kelas);
  const [aktif, setAktif] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dasar = useId();
  const multi = agenda.length > 1;
  const blok = agenda[aktif] ?? agenda[0];
  // Hari dengan baris per kelompok: "Semua · Batch 1 · …" di atas daftar (pilih-kelompok.tsx).
  const berkelompok = Boolean(blok?.pilihan?.length) && hariBerkelompok(blok?.items ?? []);
  const pilihanTamu = usePilihanKelompok(berkelompok ? blok?.pilihan : undefined);
  const barisTampil = blok ? (berkelompok ? saringKelompok(blok.items, pilihanTamu) : blok.items) : [];

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

  const daftarBaris = (
    <ol
      id={`${dasar}-panel`}
      role={multi ? "tabpanel" : undefined}
      aria-labelledby={multi ? `${dasar}-tab-${aktif}` : undefined}
      // Tanpa tab, daftar mengambil posisi yang sama dengan kolom isi bagian
      // lain, jadi tepi kirinya tetap lurus dengan paragraf di atasnya.
      className={`divide-y divide-[var(--reg-outline-variant)] border-y border-[var(--reg-outline-variant)] ${
        berkelompok ? "" : lebar(multi ? "lg:col-span-8 xl:col-span-9" : "lg:col-span-12")
      }`}
    >
      {barisTampil.map((item, index) => (
        <li
          key={`${item.time}-${item.title}-${index}`}
          className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-x-8"
        >
          <span className="pt-0.5 text-body-medium tabular-nums text-[var(--reg-on-surface-variant)]">
            {item.time}
            {item.end ? <span className="hidden sm:inline"> hingga {item.end}</span> : null}
          </span>
          <div className="min-w-0">
            <p className="text-title-medium font-semibold text-balance">
              {item.title}
              <LabelUntuk teks={item.untuk} className="text-[var(--reg-on-surface-variant)]" />
            </p>
            {item.subtitle ? (
              <TeksKaya teks={item.subtitle} warna={warnaTanda} className="mt-1 text-body-medium text-[var(--reg-on-surface-variant)]" />
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <div className={`grid gap-8 ${lebar("lg:grid-cols-12 lg:gap-12")}`}>
      {multi ? (
        <div
          role="tablist"
          aria-label="Bagian acara"
          onKeyDown={pindah}
          className={`-mx-1 flex gap-1 overflow-x-auto border-b border-[var(--reg-outline-variant)] px-1 ${lebar("lg:col-span-4 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:border-b-0 lg:px-0 xl:col-span-3")}`}
        >
          {agenda.map((bagian, index) => {
            const pilih = index === aktif;
            const awal = bagian.items[0]?.time;
            const akhir = rentangAkhir(bagian);
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
                className={`m3-state flex min-h-12 shrink-0 flex-col justify-center border-b-2 px-4 py-2 text-left ${lebar("lg:rounded-md lg:border-b-0 lg:border-l-2 lg:py-3")} ${
                  pilih
                    ? "border-[var(--reg-primary)] text-[var(--reg-on-surface)]"
                    : "border-transparent text-[var(--reg-on-surface-variant)]"
                }`}
              >
                <span className="text-title-small font-semibold">{bagian.sectionTitle || `Bagian ${index + 1}`}</span>
                {awal ? (
                  <span className={`hidden text-body-small tabular-nums text-[var(--reg-on-surface-variant)] ${lebar("lg:block")}`}>
                    {akhir && akhir !== awal ? `${awal} hingga ${akhir}` : awal}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {berkelompok && blok?.pilihan ? (
        // Pilihan dan daftar satu kolom, supaya keduanya tetap di samping tab di layar lebar.
        <div className={`flex flex-col gap-3 ${lebar(multi ? "lg:col-span-8 xl:col-span-9" : "lg:col-span-12")}`}>
          <div className="print:hidden">
            <PilihKelompok pilihan={blok.pilihan} items={blok.items} lang="id" nada="terang" />
          </div>
          {daftarBaris}
        </div>
      ) : (
        daftarBaris
      )}
    </div>
  );
}

