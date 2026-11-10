import { ArrowSquareOut, Images } from "@phosphor-icons/react/dist/ssr";
import { KARTU_HZ, KepalaKartuHorizon, PAD_KARTU } from "@/components/member/portal-horizon";
import { DOKUMENTASI_UI, labelTanpaTanggal, layananTautan, type AlbumDokumentasi } from "@/lib/member/dokumentasi";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Kartu "Foto dan video acara" di Beranda (lib/member/dokumentasi.ts): satu
 * baris per album yang sudah terbuka, ke tab baru. Pola daftar baris "Bantuan"
 * Horizon (ikon bulat, judul, keterangan), dengan ikon tautan luar karena
 * linknya meninggalkan Tally. Gaya mengikuti tata letak portal, sama dengan
 * KartuHadiah.
 */
export type GayaKartuDokumentasi = "horizon" | "trip" | "gathering" | "modern";

function tanggalAlbum(tanggal: string, lang: LandingLang): string {
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

/** Judul dan keterangan satu baris album. */
export function teksAlbum(album: AlbumDokumentasi, lang: LandingLang): { judul: string; isi: string | null } {
  const t = DOKUMENTASI_UI[lang];
  const layanan = layananTautan(album.url);
  const tanggal = album.tanggal ? tanggalAlbum(album.tanggal, lang) : null;
  const gabung = (...bagian: Array<string | null>) => bagian.filter(Boolean).join(" · ") || null;
  if (album.jenis === "event") return { judul: t.semua, isi: layanan };
  if (album.jenis === "session") return { judul: album.judul ?? t.sesi, isi: gabung(tanggal, layanan) };
  // Tanggal di label bagian tidak ditulis dua kali; sisanya ("Batch 2") tetap.
  const label = tanggal ? labelTanpaTanggal(album.judul) : album.judul;
  return tanggal ? { judul: tanggal, isi: gabung(label, layanan) } : { judul: album.judul ?? t.semua, isi: layanan };
}

export function KartuDokumentasi({ gaya, album, lang }: { gaya: GayaKartuDokumentasi; album: readonly AlbumDokumentasi[]; lang: LandingLang }) {
  if (!album.length) return null;
  const t = DOKUMENTASI_UI[lang];
  const hz = gaya === "horizon" || gaya === "trip";
  const meta = album.length > 1 ? t.jumlah(album.length) : null;
  const bingkai = hz
    ? `${KARTU_HZ} ${PAD_KARTU} flex flex-col gap-2`
    : gaya === "gathering"
      ? "flex flex-col gap-2 rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6"
      : "flex flex-col gap-2 rounded-lg bg-[var(--reg-panel)] p-6";

  return (
    <section aria-labelledby="dokumentasi-judul" className={bingkai} style={hz ? { color: "#101E38" } : undefined}>
      {hz ? (
        <KepalaKartuHorizon Ikon={Images} judul={t.judul} idJudul="dokumentasi-judul" meta={meta} />
      ) : (
        <div className="flex items-center gap-3 pb-2">
          <Images size={22} weight="bold" aria-hidden className="shrink-0 text-[var(--reg-primary)]" />
          <h2 id="dokumentasi-judul" className="min-w-0 flex-1 text-title-medium font-bold">
            {t.judul}
          </h2>
          {meta ? <p className="shrink-0 text-body-medium tabular-nums text-[var(--reg-on-surface-variant)]">{meta}</p> : null}
        </div>
      )}
      <ul className="flex flex-col">
        {album.map((item) => {
          const { judul, isi } = teksAlbum(item, lang);
          return (
            <li key={item.kunci}>
              <a href={item.url} target="_blank" rel="noreferrer noopener" className="m3-state -mx-3 flex min-h-14 items-center gap-4 rounded-[12px] px-3 py-2">
                <span
                  aria-hidden
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full ${hz ? "bg-[#EEF1F6] text-[#101E38]" : "bg-[color-mix(in_srgb,var(--reg-primary)_12%,white)] text-[var(--reg-primary)]"}`}
                >
                  <Images size={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[16px] leading-6 [overflow-wrap:anywhere]">{judul}</span>
                  {isi ? <span className={`truncate text-[14px] leading-5 ${hz ? "text-[#526078]" : "text-[var(--reg-on-surface-variant)]"}`}>{isi}</span> : null}
                </span>
                <ArrowSquareOut size={20} aria-hidden className={`shrink-0 ${hz ? "text-[#4D5D77]" : "text-[var(--reg-on-surface-variant)]"}`} />
                <span className="sr-only">({t.tabBaru})</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
