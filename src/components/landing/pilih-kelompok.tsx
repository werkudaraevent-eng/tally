"use client";

import { useSyncExternalStore } from "react";
import { barisCocok, labelTerjawab, pilihanSah, type PilihanKelompok } from "@/lib/agenda-kelompok";
import type { AgendaItem } from "@/lib/landing-agenda";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

/**
 * "Semua · Batch 1 · Batch 2" di atas agenda hari yang punya baris berlabel
 * (halaman acara sebelum masuk). Satu pilihan untuk seluruh halaman: setiap
 * hari membaca toko yang sama, jadi memilih Batch 1 di hari kedua juga
 * menyaring hari pertama dan ketiga. Diingat di perangkat tamu per alamat
 * halaman; penyimpanan yang gagal hanya berarti pilihan tidak diingat.
 */
const KUNCI = () => `tally-agenda-kelompok:${window.location.pathname}`;
let pilihanKini: PilihanKelompok | null = null;
const pendengar = new Set<() => void>();

function baca(): PilihanKelompok {
  if (pilihanKini) return pilihanKini;
  try {
    const isi = JSON.parse(window.localStorage.getItem(KUNCI()) ?? "{}") as unknown;
    pilihanKini = isi && typeof isi === "object" && !Array.isArray(isi) ? (isi as PilihanKelompok) : {};
  } catch {
    pilihanKini = {};
  }
  return pilihanKini;
}

function tulis(next: PilihanKelompok) {
  pilihanKini = next;
  try {
    window.localStorage.setItem(KUNCI(), JSON.stringify(next));
  } catch {
    // Mode privat atau penyimpanan diblokir: pilihan tetap berlaku sampai halaman ditutup.
  }
  for (const dengar of pendengar) dengar();
}

const KOSONG: PilihanKelompok = {};

/** Pilihan tamu yang masih sah untuk daftar jawaban ini. Server dan render pertama: Semua. */
export function usePilihanKelompok(pilihan: ReadonlyArray<ReadonlyArray<string>> | undefined): PilihanKelompok {
  const mentah = useSyncExternalStore(
    (dengar) => {
      pendengar.add(dengar);
      return () => pendengar.delete(dengar);
    },
    baca,
    () => KOSONG,
  );
  return pilihan?.length ? pilihanSah(mentah, pilihan) : KOSONG;
}

/** Baris yang tampil untuk pilihan ini, dengan label yang sudah terjawab dibuang. */
export function saringKelompok(items: AgendaItem[], pilihan: PilihanKelompok): AgendaItem[] {
  if (Object.keys(pilihan).length === 0) return items;
  return items.filter((item) => barisCocok(item.kelompok, pilihan)).map((item) => (labelTerjawab(item.kelompok, pilihan) ? { ...item, untuk: null } : item));
}

/** Hari ini punya baris berkelompok? Hari lain tidak mendapat pilihan, jadi tampil seperti dulu. */
export const hariBerkelompok = (items: AgendaItem[]) => items.some((item) => item.kelompok?.length);

/**
 * Tombol pilihan. `nada` mengikuti latar preset: "gelap" untuk Horizon (navy),
 * "terang" untuk preset bertema M3. Tinggi 40 px dengan area ketuk 48 px.
 */
export function PilihKelompok({ pilihan, lang, nada }: { pilihan: ReadonlyArray<ReadonlyArray<string>>; lang: LandingLang; nada: "gelap" | "terang" }) {
  const aktif = usePilihanKelompok(pilihan);
  const t = LANDING_UI[lang];
  const kelas = (on: boolean) =>
    nada === "gelap"
      ? `border ${on ? "border-[var(--hz-sorot,var(--hz-emas))] bg-[var(--hz-sorot,var(--hz-emas))] text-[#0B182D]" : "border-[#CDD7EA]/45 text-[#FAF8F2]"}`
      : `border ${on ? "border-transparent bg-[var(--reg-primary)] text-[var(--reg-on-primary)]" : "border-[var(--reg-outline-variant)] text-[var(--reg-on-surface)]"}`;
  return (
    <div className="flex flex-col gap-2">
      {pilihan.map((daftar, grup) => {
        const dipilih = aktif[grup];
        const pilih = (nilai: string | undefined) => {
          const next = { ...aktif };
          if (nilai === undefined) delete next[grup];
          else next[grup] = nilai;
          tulis(next);
        };
        return (
          <div key={grup} role="radiogroup" aria-label={t.agendaGroupPick} className="flex flex-wrap gap-x-2">
            {[undefined, ...daftar].map((nilai) => {
              const on = dipilih === nilai;
              return (
                <button
                  key={nilai ?? ""}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pilih(nilai)}
                  className="group flex min-h-12 items-center"
                >
                  <span className={`inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold transition-colors ${kelas(on)}`}>{nilai ?? t.agendaGroupAll}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
