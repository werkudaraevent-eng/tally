import Link from "next/link";
import type { CSSProperties } from "react";
import { HEAD } from "@/components/landing/modern/styles";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Kartu "Kilas balikmu sudah siap" di Beranda portal Gathering (Horizon, Trip).
 * Tampil hanya selama Feedback dibuka dan peserta ini belum mengirim jawaban,
 * jadi acara tanpa Feedback tidak berubah sama sekali.
 */
const TEKS = {
  id: { judul: "Kilas balikmu sudah siap", isi: "Lihat lagi perjalananmu, dan bantu kami dengan beberapa pertanyaan singkat. Bisa ditutup dan dilanjutkan kapan saja.", tombol: "Buka kilas balik" },
  en: { judul: "Your recap is ready", isi: "Look back at your trip and help us with a few quick questions. Close it and carry on any time.", tombol: "Open my recap" },
};

export function KartuKilas({ lang, href }: { lang: LandingLang; href: string | null }) {
  if (!href) return null;
  const t = TEKS[lang];
  return (
    <section aria-labelledby="kilas-judul" className="flex min-w-0 flex-col items-start gap-4 rounded-[16px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h2 id="kilas-judul" className={`${HEAD} text-[20px] font-semibold leading-tight sm:text-[22px]`}>
          {t.judul}
        </h2>
        <p className="mt-2 text-body-large leading-7 text-[#5F6B7F] [overflow-wrap:anywhere]">{t.isi}</p>
      </div>
      <Link
        href={href}
        className="m3-state inline-flex min-h-12 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[var(--aksi)] px-6 text-title-small font-bold text-[var(--on-aksi)] sm:w-auto"
        style={{ "--m3-state-color": "var(--on-aksi)" } as CSSProperties}
      >
        {t.tombol}
      </Link>
    </section>
  );
}
