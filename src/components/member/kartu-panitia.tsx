import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import { KARTU_HZ, KELAS_ALIS, KELAS_TAUTAN, KepalaKartuHorizon, PAD_KARTU } from "@/components/member/portal-horizon";
import { RingkasPanitia } from "@/components/member/ringkas-panitia";
import { PANITIA_UI } from "@/lib/member/panitia-i18n";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Kartu "Pantau kehadiran" di Beranda, hanya untuk peserta yang Tipe-nya
 * dipilih admin (lib/member/akses-panitia.ts). Pola Whova: fungsi relawan
 * check-in ada di aplikasi peserta yang sama, terlihat hanya oleh perannya.
 * Bukan tab di bilah bawah: lima tujuannya dipakai semua peserta (M3
 * navigation bar, 3-5 tujuan). Kartunya pintu ke halaman Kehadiran.
 */
export type GayaKartuPanitia = "horizon" | "trip" | "gathering" | "modern" | "klasik";

export function KartuPanitia({ gaya, slug, lang, href }: { gaya: GayaKartuPanitia; slug: string; lang: LandingLang; href: string }) {
  const t = PANITIA_UI[lang];
  const tag = (kelas: string) => <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[12px] font-semibold leading-4 ${kelas}`}>{t.peran}</span>;

  if (gaya === "horizon" || gaya === "trip") {
    const tautan = gaya === "trip" ? "text-[#101E38] underline decoration-[var(--hz-emas)] decoration-2 underline-offset-[5px]" : "text-[#274FC0]";
    return (
      <section aria-labelledby="panitia-judul" className={`${KARTU_HZ} ${PAD_KARTU}`} style={{ color: "#101E38" }}>
        <KepalaKartuHorizon Ikon={UsersThree} judul={t.kartuJudul} idJudul="panitia-judul" meta={tag("bg-[var(--hz-navy)] text-[var(--hz-emas)]")} />
        <RingkasPanitia
          slug={slug}
          lang={lang}
          href={href}
          kelas={{
            alis: `${KELAS_ALIS} text-[#4D5D77]`,
            nama: "text-[14px] font-semibold leading-5",
            angka: "text-[14px] font-semibold leading-5",
            jalur: "bg-[#E6E9EE]",
            isi: "bg-[var(--hz-emas)]",
            tautan: `m3-state -mx-2 rounded-md px-2 ${KELAS_TAUTAN} ${tautan}`,
            redup: "text-[#526078]",
          }}
        />
      </section>
    );
  }

  const bingkai =
    gaya === "gathering"
      ? "rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6"
      : gaya === "modern"
        ? "rounded-lg bg-[var(--reg-panel)] p-6"
        : "rounded-md border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6";
  return (
    <section aria-labelledby="panitia-judul" className={bingkai}>
      <div className="flex items-center gap-3">
        <UsersThree size={22} weight="bold" aria-hidden className="shrink-0 text-[var(--reg-brand)]" />
        <h2 id="panitia-judul" className="min-w-0 flex-1 text-title-medium font-bold">
          {t.kartuJudul}
        </h2>
        {tag("bg-[color-mix(in_srgb,var(--reg-brand)_12%,white)] text-[var(--reg-brand)]")}
      </div>
      <RingkasPanitia
        slug={slug}
        lang={lang}
        href={href}
        kelas={{
          alis: "text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-[var(--reg-on-surface-variant)]",
          nama: "text-[14px] font-semibold leading-5",
          angka: "text-[14px] font-semibold leading-5",
          jalur: "bg-[color-mix(in_srgb,var(--reg-on-surface)_10%,transparent)]",
          isi: "bg-[var(--reg-brand)]",
          tautan: "m3-state -mx-2 -my-3.5 inline-flex min-h-12 items-center gap-1 self-start rounded-md px-2 text-[14px] font-semibold leading-5 text-[var(--reg-primary)]",
          redup: "text-[var(--reg-on-surface-variant)]",
        }}
      />
    </section>
  );
}
