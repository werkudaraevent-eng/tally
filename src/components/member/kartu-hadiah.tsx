import { Gift } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { KARTU_HZ, KELAS_ALIS, KELAS_JUDUL_ISI, KELAS_KET, KELAS_TAUTAN, KepalaKartuHorizon, LATAR_STRIP, PAD_KARTU } from "@/components/member/portal-horizon";
import { HADIAH_UI, type HadiahPeserta, type NadaHadiah } from "@/lib/member/hadiah";
import type { LandingLang } from "@/lib/landing-i18n";
import type { EventTimeZone } from "@/lib/timezone";

/**
 * Kartu "Hadiah kamu" di Beranda (lib/member/hadiah.ts): hadiah undian yang
 * sudah dikonfirmasi untuk peserta ini, dengan cara mengambilnya dan tautan ke
 * QR. Pola kartu pesanan Booking.com/Tokopedia: bukti dan langkah berikutnya
 * di satu kartu. Gaya mengikuti tata letak portal, sama dengan KartuPanitia.
 */
export type GayaKartuHadiah = "horizon" | "trip" | "gathering" | "modern" | "klasik";

function waktu(iso: string, zona: EventTimeZone, lang: LandingLang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function KartuHadiah({
  gaya,
  hadiah,
  lang,
  zona,
  qrHref,
}: {
  gaya: GayaKartuHadiah;
  hadiah: readonly HadiahPeserta[];
  lang: LandingLang;
  zona: EventTimeZone;
  /** Tautan ke QR peserta; null bila QR tidak ditampilkan di portal ini. */
  qrHref: string | null;
}) {
  if (!hadiah.length) return null;
  const t = HADIAH_UI[lang];
  const nada: NadaHadiah = gaya === "modern" || gaya === "klasik" ? "anda" : "kamu";
  const judul = t.judul(nada);
  const hz = gaya === "horizon" || gaya === "trip";

  const kelas = hz
    ? {
        bingkai: `${KARTU_HZ} ${PAD_KARTU} flex flex-col gap-4`,
        nama: KELAS_JUDUL_ISI,
        ket: `${KELAS_KET} text-[#526078]`,
        alis: `${KELAS_ALIS} text-[#4D5D77]`,
        isiStrip: `${KELAS_KET} text-[#101E38] whitespace-pre-line`,
        garis: "border-[#E6E8EC]",
        tautan: `m3-state -mx-2 rounded-md px-2 ${KELAS_TAUTAN} ${gaya === "trip" ? "text-[#101E38] underline decoration-[var(--hz-emas)] decoration-2 underline-offset-[5px]" : "text-[#274FC0]"}`,
      }
    : {
        bingkai:
          gaya === "gathering"
            ? "flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6"
            : gaya === "modern"
              ? "flex flex-col gap-4 rounded-lg bg-[var(--reg-panel)] p-6"
              : "flex flex-col gap-4 rounded-md border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6",
        nama: "text-title-medium font-bold [overflow-wrap:anywhere]",
        ket: "text-body-medium text-[var(--reg-on-surface-variant)] [overflow-wrap:anywhere]",
        alis: "text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-[var(--reg-on-surface-variant)]",
        isiStrip: "text-body-medium whitespace-pre-line [overflow-wrap:anywhere]",
        garis: "border-[color-mix(in_srgb,var(--reg-on-surface)_10%,transparent)]",
        tautan: "m3-state -mx-2 -my-3.5 inline-flex min-h-12 items-center gap-1 self-start rounded-md px-2 text-[14px] font-semibold leading-5 text-[var(--reg-primary)]",
      };
  const tanda = (
    <span
      className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[12px] font-semibold leading-4 ${hz ? "bg-[var(--hz-navy)] text-[var(--hz-emas)]" : "bg-[color-mix(in_srgb,var(--reg-brand)_12%,white)] text-[var(--reg-brand)]"}`}
    >
      {t.tanda}
    </span>
  );

  return (
    <section aria-labelledby="hadiah-judul" className={kelas.bingkai} style={hz ? { color: "#101E38" } : undefined}>
      {hz ? (
        <KepalaKartuHorizon Ikon={Gift} judul={judul} idJudul="hadiah-judul" meta={tanda} />
      ) : (
        <div className="flex items-center gap-3">
          <Gift size={22} weight="bold" aria-hidden className="shrink-0 text-[var(--reg-brand)]" />
          <h2 id="hadiah-judul" className="min-w-0 flex-1 text-title-medium font-bold">
            {judul}
          </h2>
          {tanda}
        </div>
      )}
      <ul className="flex flex-col gap-4">
        {hadiah.map((item, index) => (
          <li key={item.id} className={`flex flex-col gap-3 ${index > 0 ? `border-t pt-4 ${kelas.garis}` : ""}`}>
            <div className="flex items-center gap-3">
              {item.gambar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.gambar} alt="" loading="lazy" decoding="async" className="size-16 shrink-0 rounded-[12px] object-cover" />
              ) : null}
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className={kelas.nama}>{item.nama}</h3>
                {item.sponsor ? <p className={kelas.ket}>{t.dari(item.sponsor)}</p> : null}
                <p className={`${kelas.ket} tabular-nums`}>{waktu(item.waktu, zona, lang)}</p>
              </div>
            </div>
            {item.catatan ? (
              <div className={`flex flex-col gap-1 rounded-[12px] px-3 py-2 ${hz ? "" : "bg-[color-mix(in_srgb,var(--reg-on-surface)_5%,transparent)]"}`} style={hz ? { background: LATAR_STRIP } : undefined}>
                <p className={kelas.alis}>{t.caraAmbil}</p>
                <p className={kelas.isiStrip}>{item.catatan}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {qrHref ? (
        <Link href={qrHref} className={kelas.tautan}>
          {t.bukaQr}
        </Link>
      ) : null}
    </section>
  );
}
