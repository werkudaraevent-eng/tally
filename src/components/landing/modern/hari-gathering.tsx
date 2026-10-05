import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import type { AgendaItem, AgendaPreview } from "@/lib/landing-agenda";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { HEAD, MUTED } from "./styles";

/**
 * Susunan acara gaya gathering (rancangan v3 KSO 21): satu kartu putih per hari
 * di atas permukaan pasir, dengan nomor hari, tanggal, judul bagian rundown,
 * cerita singkat dari CMS, dan paling banyak tiga jam penting. Jadwal lengkap
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
          const tanggal = tanggalPanjang(bagian.tanggal, lang);
          return (
            <li
              key={bagian.sectionTitle ?? index}
              className="flex flex-col rounded-[20px] border border-[color-mix(in_srgb,var(--alis)_18%,transparent)] bg-[var(--reg-panel)] p-6 sm:p-7"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--reg-primary)] text-[18px] font-bold tabular-nums text-[var(--aksen)]"
                >
                  {index + 1}
                </span>
                <p className="text-[13px] font-semibold uppercase leading-4 tracking-[0.06em] text-[var(--alis)]">
                  <span className="sr-only">{t.day(index + 1)}, </span>
                  {tanggal ?? t.day(index + 1)}
                </p>
              </div>
              <h3 className={`${HEAD} mt-5 text-balance text-[22px] font-bold leading-7 tracking-[-0.01em]`}>
                {bagian.sectionTitle?.trim() || t.day(index + 1)}
              </h3>
              {cerita ? <p className={`mt-2 whitespace-pre-line text-[15px] leading-[22px] ${MUTED}`}>{cerita}</p> : null}
              {tampil.length > 0 ? (
                <ul className="mt-5 border-t border-[color-mix(in_srgb,var(--reg-on-surface)_10%,transparent)]">
                  {tampil.map((item) => (
                    <li
                      key={item.id}
                      className="flex gap-3 border-b border-[color-mix(in_srgb,var(--reg-on-surface)_10%,transparent)] py-3 text-[14px] leading-5 last:border-b-0 last:pb-0"
                    >
                      <span className="w-11 shrink-0 font-semibold tabular-nums text-[var(--reg-primary)]">{item.time}</span>
                      <span className="min-w-0">{item.title}</span>
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
        <summary className="m3-state inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-md text-title-medium font-semibold text-[var(--reg-primary)] [&::-webkit-details-marker]:hidden">
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

/** "2026-11-06" menjadi "Jumat, 6 Nov" (Indonesia) atau "Friday, 6 Nov" (English). */
function tanggalPanjang(tanggal: string | null, lang: LandingLang): string | null {
  if (!tanggal) return null;
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
