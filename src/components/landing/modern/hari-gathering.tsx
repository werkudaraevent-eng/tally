import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import type { AgendaItem, AgendaPreview } from "@/lib/landing-agenda";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { HEAD, MUTED } from "./styles";

/** Nomor hari bergiliran warna tombol, warna merek, dan aksen (rancangan pen.dev). */
const WARNA_NOMOR = ["text-[var(--alis)]", "text-[var(--primer-teks)]", "text-[var(--aksen-teks)]"];
const WARNA_CHIP = [
  // Teks chip dihitung terhadap latar chip itu sendiri (gatheringColors, QA #103 L1).
  "bg-[var(--chip-aksi)] text-[var(--on-chip-aksi)]",
  "bg-[var(--chip-merek)] text-[var(--on-chip-merek)]",
  "bg-[var(--chip-aksen)] text-[var(--on-chip-aksen)]",
];

/**
 * Susunan acara gaya gathering (rancangan pen.dev Hanung, 2026-10-07): satu
 * kartu putih per hari di atas pita abu-abu, dengan nomor hari besar, nama
 * hari, judul bagian rundown, cerita singkat dari CMS, dan paling banyak tiga jam penting. Jadwal lengkap
 * jam per jam (AgendaPills) dilipat di bawah kartu.
 *
 * Datanya bagian rundown yang SAMA dengan daftar lengkap, jadi kartu dan jadwal
 * tidak bisa berbeda jam. Cerita per hari memakai `program_notes` (urutan bagian
 * yang diterbitkan), kolom yang sama dengan keterangan kartu Program.
 */
export function HariGathering({
  agenda,
  catatan,
  lang,
  jadwalLengkap,
}: {
  agenda: AgendaPreview[];
  catatan: string[];
  lang: LandingLang;
  jadwalLengkap: ReactNode;
}) {
  const t = LANDING_UI[lang];
  return (
    <div className="mt-8 flex flex-col gap-6 sm:mt-10">
      <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {agenda.map((bagian, index) => {
          const { tampil, sisa } = jamPenting(bagian.items);
          const cerita = catatan[index]?.trim();
          const hari = namaHari(bagian.tanggal, lang);
          return (
            <li
              // Indeks, bukan judul: dua bagian rundown boleh berjudul sama.
              key={index}
              className="flex flex-col rounded-[20px] border border-[color-mix(in_srgb,var(--reg-on-surface)_10%,transparent)] bg-white p-6 text-[var(--reg-on-surface)] sm:p-7 [--reg-on-surface:var(--terang-on-surface,#181d27)] [--reg-on-surface-variant:var(--terang-on-surface-variant,#5F6B7F)] [--alis:var(--terang-alis)] [--primer-teks:var(--terang-primer-teks)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span aria-hidden className={`${HEAD} text-[44px] font-extrabold leading-none tabular-nums tracking-[-0.02em] ${WARNA_NOMOR[index % WARNA_NOMOR.length]}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                {hari ? (
                  <p className={`inline-flex min-h-7 items-center rounded-full px-3 text-[12px] font-bold ${WARNA_CHIP[index % WARNA_CHIP.length]}`}>
                    <span className="sr-only">{t.day(index + 1)}, </span>
                    {hari}
                  </p>
                ) : (
                  <span className="sr-only">{t.day(index + 1)}</span>
                )}
              </div>
              <h3 className={`${HEAD} mt-5 text-balance text-[20px] font-bold leading-7 tracking-[-0.01em]`}>
                {bagian.sectionTitle?.trim() || t.day(index + 1)}
              </h3>
              {cerita ? <p className={`mt-2 whitespace-pre-line text-[15px] leading-[22px] ${MUTED}`}>{cerita}</p> : null}
              {tampil.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-1.5">
                  {tampil.map((item) => (
                    <li key={item.id} className="flex gap-3 text-[14px] leading-6">
                      <span className="w-11 shrink-0 font-bold tabular-nums">{item.time}</span>
                      <span className={`min-w-0 ${MUTED}`}>{item.title}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {sisa > 0 ? <p className={`mt-3 text-[14px] leading-5 ${MUTED}`}>{t.moreItems(sisa)}</p> : null}
            </li>
          );
        })}
      </ol>
      <details className="group">
        <summary className="m3-state -mx-3 inline-flex min-h-12 px-3 cursor-pointer list-none items-center gap-2 rounded-md text-title-medium font-semibold text-[var(--primer-teks)] [&::-webkit-details-marker]:hidden">
          {t.fullSchedule}
          <CaretDown size={18} weight="bold" aria-hidden className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4">{jadwalLengkap}</div>
      </details>
    </div>
  );
}

/**
 * Jam penting satu hari: semua bila tiga atau kurang, selain itu dua yang
 * pertama dan yang terakhir. Pembuka hari dan acara malamnya biasanya yang
 * ditunggu tamu; jeda (makan siang, rehat) tidak dihitung.
 */
function jamPenting(items: AgendaItem[]): { tampil: AgendaItem[]; sisa: number } {
  const isi = items.filter((item) => !item.jeda);
  if (isi.length <= 3) return { tampil: isi, sisa: 0 };
  return { tampil: [isi[0], isi[1], isi[isi.length - 1]], sisa: isi.length - 3 };
}

/** "2026-11-06" menjadi "Jumat" (Indonesia) atau "Friday" (English); tanggal lengkap ada di kepala bagian. */
function namaHari(tanggal: string | null, lang: LandingLang): string | null {
  if (!tanggal) return null;
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
    weekday: "long",
    timeZone: "UTC",
  });
}
