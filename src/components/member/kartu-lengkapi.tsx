import Link from "next/link";
import type { CSSProperties } from "react";
import { HEAD, LABEL_BAGIAN, MUTED, PIL_PENUH } from "@/components/landing/modern/styles";
import type { RegistrationField } from "@/lib/domain";
import type { LandingLang } from "@/lib/landing-i18n";
import { LENGKAPI_UI } from "@/lib/member/lengkapi-i18n";

/**
 * Kartu "Lengkapi data Anda" di dashboard peserta: tampil hanya bila ada
 * pertanyaan "Participants can update this" yang masih kosong, dan menyebut
 * pertanyaan itu dengan label dari formulir, bukan kalimat karangan.
 *
 * Bentuknya kartu biasa dari keluarga dashboard masing-masing (panel Modern,
 * kartu putih Gathering, garis tipis Klasik), tanpa garis aksen di tepi.
 */
export function KartuLengkapi({
  lang,
  href,
  fields,
  gaya,
  className = "",
}: {
  lang: LandingLang;
  href: string;
  fields: RegistrationField[];
  gaya: "modern" | "gathering" | "klasik";
  className?: string;
}) {
  if (fields.length === 0) return null;
  const t = LENGKAPI_UI[lang];
  const daftar = new Intl.ListFormat(lang === "en" ? "en-GB" : "id-ID", { style: "long", type: "conjunction" }).format(fields.map((field) => field.label.trim()));
  const wadah =
    gaya === "gathering"
      ? "rounded-[16px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)]"
      : gaya === "modern"
        ? "rounded-lg bg-[var(--reg-panel)] p-6"
        : "rounded-md border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6";
  const g = gaya === "gathering";
  // Gathering memakai warna aksinya sendiri (--aksi, --alis) dan tombol bulat.
  const alis = g ? "text-[var(--alis)]" : "text-[var(--reg-primary)]";
  const redup = g ? "text-[#5F6B7F]" : MUTED;
  const tombol = g
    ? "m3-state inline-flex min-h-12 items-center rounded-full bg-[var(--aksi)] px-6 text-title-small font-bold text-[var(--on-aksi)]"
    : PIL_PENUH;
  return (
    <section aria-labelledby="lengkapi-judul" className={`flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${wadah} ${className}`}>
      <div className="min-w-0">
        <p className={`${LABEL_BAGIAN} ${alis}`}>{t.cardEyebrow}</p>
        <h2 id="lengkapi-judul" className={`${HEAD} mt-1.5 text-[20px] font-semibold leading-tight sm:text-[22px]`}>
          {t.cardTitle}
        </h2>
        <p className={`mt-2 text-body-large leading-7 [overflow-wrap:anywhere] ${redup}`}>{t.cardBody(daftar)}</p>
      </div>
      <Link href={href} className={`${tombol} w-full shrink-0 justify-center whitespace-nowrap sm:w-auto`} style={{ "--m3-state-color": g ? "var(--on-aksi)" : "var(--reg-on-primary)" } as CSSProperties}>
        {t.cardButton}
      </Link>
    </section>
  );
}
