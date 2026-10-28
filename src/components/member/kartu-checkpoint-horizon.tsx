import { CalendarBlank, Check, Flag, MapPin, Target } from "@phosphor-icons/react/dist/ssr";
import type { CheckpointPeserta, LangkahPeserta } from "@/lib/checkpoint/server";
import { tanggalDiZona, teksSelesai, teksWaktu } from "@/lib/checkpoint/waktu";
import type { LandingLang } from "@/lib/landing-i18n";
import type { EventTimeZone } from "@/lib/timezone";
import { SEPARATOR, gabungMeta } from "@/lib/typography";
import { BarisTujuanPoin } from "@/components/member/baris-tujuan-poin";
import { CheckpointLipat } from "@/components/member/checkpoint-lipat";
import { KARTU_HZ, KELAS_ALIS, KELAS_JUDUL_ISI, KELAS_KET, KepalaKartuHorizon, PAD_KARTU } from "@/components/member/portal-horizon";
import { PindaiCheckpoint } from "@/components/member/pindai-checkpoint";

/**
 * Kartu checkpoint di Beranda Horizon (keputusan Mas 20 Okt, "satu info, satu
 * tempat"): kartu putih ringkas, bukan kartu aksi navy. Isinya kemajuan,
 * langkah berikutnya dengan tempatnya, cara menyelesaikannya (menurut siapa
 * yang memindai, `self_scan`), dan garis tujuan poin (E-08). Daftar lengkap
 * dibuka di tempat. Tombol emas satu-satunya tetap QR di bilah bawah, jadi
 * kartu ini tidak punya tombol emas sendiri.
 *
 * Langkah bertanggal (When, dari Agenda) menulis tanggal dan jamnya di atas
 * tempat, seperti segmen perjalanan di aplikasi maskapai: "Hari ini" sebagai
 * chip, "Besok", atau tanggalnya. Langkah tanpa tanggal tampil seperti dulu.
 */

const TEKS = {
  id: {
    judul: "Checkpoint",
    berikut: "Langkah berikutnya",
    // Satu sebutan untuk yang memindai QR di seluruh portal: panitia (U-20).
    tunjukkan: "Tunjukkan QR kehadiran ke panitia.",
    jugaTunjukkan: "Bisa juga dengan menunjukkan QR kehadiran ke panitia.",
    selesaiJam: (jam: string) => `Selesai ${jam}`,
    ukuran: (ukuran: string) => `ukuran ${ukuran}`,
    kemajuan: (selesai: number, total: number) => `${selesai} dari ${total} selesai`,
    poin: (dapat: number, total: number) => `${dapat}/${total} poin`,
    poinSr: (n: number) => `${n} poin`,
    semuaSelesai: "Semua checkpoint selesai",
    sudah: "Sudah selesai",
    belum: "Belum",
    lihatSemua: (n: number) => `Lihat semua ${n} checkpoint`,
    sembunyikan: "Sembunyikan",
    hariIni: "Hari ini",
  },
  en: {
    judul: "Checkpoints",
    berikut: "Next step",
    tunjukkan: "Show your attendance QR to the organisers.",
    jugaTunjukkan: "You can also show your attendance QR to the organisers.",
    selesaiJam: (jam: string) => `Done ${jam}`,
    ukuran: (ukuran: string) => `size ${ukuran}`,
    kemajuan: (selesai: number, total: number) => `${selesai} of ${total} done`,
    poin: (dapat: number, total: number) => `${dapat}/${total} points`,
    poinSr: (n: number) => `${n} points`,
    semuaSelesai: "All checkpoints done",
    sudah: "Done",
    belum: "Not yet",
    lihatSemua: (n: number) => `See all ${n} checkpoints`,
    sembunyikan: "Hide",
    hariIni: "Today",
  },
} as const;

const TINTA = "#101E38";
const REDUP = "#526078";
const LABEL = "#4D5D77";

function jam(iso: string, zona: EventTimeZone, lang: LandingLang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function KartuCheckpointHorizon({
  data,
  lang,
  zona,
  qrHref,
  slug,
  berakhir = false,
}: {
  data: CheckpointPeserta;
  lang: LandingLang;
  zona: EventTimeZone;
  qrHref: string | null;
  /** Acara ini: tombol Pindai QR checkpoint (scan mandiri) mengirim ke sini. */
  slug: string;
  /**
   * Sesudah acara (fase Beranda): langkah yang tersisa tidak bisa lagi
   * diselesaikan, jadi kartu hanya merangkum kemajuan dan daftarnya.
   */
  berakhir?: boolean;
}) {
  const t = TEKS[lang];
  const total = data.steps.length;
  const berikut = data.steps.find((step) => !step.done_at) ?? null;
  const sisa = berikut && !berakhir ? berikut : null;
  const hariIni = tanggalDiZona(new Date(), zona);

  const baris = (step: LangkahPeserta, akhir: boolean) => {
    const index = data.steps.indexOf(step);
    const selesai = Boolean(step.done_at);
    const ini = step.id === berikut?.id;
    // Langkah bertanggal yang selesai di hari lain menyebut tanggalnya juga.
    const jamSelesai = selesai ? (step.when ? teksSelesai(step.done_at!, zona, hariIni, lang) : jam(step.done_at!, zona, lang)) : "";
    const sub = selesai ? gabungMeta([t.selesaiJam(jamSelesai), step.size ? t.ukuran(step.size) : null]) : step.place;
    const kapan = !selesai && step.when ? teksWaktu(step.when, hariIni, lang, false).teks : null;
    return (
      <li key={step.id} className={`relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 ${akhir ? "" : "pb-4"}`}>
        {!akhir ? <i aria-hidden className={`absolute bottom-0 left-[13px] top-7 w-0.5 ${selesai ? "bg-[var(--hz-navy)]" : "bg-[#E1E6F1]"}`} /> : null}
        <span
          aria-hidden
          className={`relative flex size-7 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
            selesai ? "bg-[var(--hz-navy)] text-white" : ini ? "border-2 border-[var(--hz-emas)] bg-white" : "border-[1.5px] border-[#AEBBD3] bg-white text-[#526078]"
          }`}
        >
          {selesai ? <Check size={14} weight="bold" /> : index + 1}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className={`text-[14px] leading-5 [overflow-wrap:anywhere] ${ini ? "font-semibold" : "font-medium"}`} style={selesai ? { color: REDUP } : undefined}>
            <span className="sr-only">{`${index + 1}. ${selesai ? t.sudah : t.belum}: `}</span>
            {step.title}
          </p>
          {kapan ? <p className={`mt-1 ${KELAS_ALIS}`}>{kapan}</p> : null}
          {sub ? (
            <p className={`mt-1 ${KELAS_ALIS} font-normal`} style={{ color: REDUP }}>
              {sub}
            </p>
          ) : null}
        </div>
        {step.points !== null ? (
          <span className={`pt-0.5 ${KELAS_ALIS} tabular-nums`} style={{ color: REDUP }}>
            <span className="sr-only">{t.poinSr(step.points)}</span>
            <span aria-hidden>{`+${step.points}`}</span>
          </span>
        ) : (
          <span />
        )}
      </li>
    );
  };
  const daftar = <ol className="mt-3 border-t border-[#E6E8EC] pt-4">{data.steps.map((step, urutan) => baris(step, urutan === data.steps.length - 1))}</ol>;

  // Cara menyelesaikan langkah berikutnya, menurut siapa yang memindai. Tanpa
  // tombol emas: QR kehadiran ada di bilah bawah; di desktop di sobekan kartu
  // perjalanan sebelum acara, lalu di kartu QR samping sejak acara mulai.
  const aksi = !sisa ? null : sisa.self_scan ? (
    // Scan mandiri: peserta memindai QR panitia, seperti membayar dengan QRIS.
    <>
      <PindaiCheckpoint
        slug={slug}
        lang={lang}
        qrHref={sisa.self_scan === "both" ? qrHref : null}
        className="m3-state -mx-2 -mb-3.5 mt-[-2px] inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-[14px] font-semibold leading-5 text-[var(--hz-navy)] underline decoration-[var(--hz-emas)] decoration-2 underline-offset-[5px]"
      />
      {sisa.self_scan === "both" ? <p className={`mt-3 ${KELAS_KET}`}>{t.jugaTunjukkan}</p> : null}
    </>
  ) : (
    <p className={`mt-3 ${KELAS_KET}`}>{t.tunjukkan}</p>
  );

  // Tujuan poin hanya selama masih bisa dikejar, atau sebagai hasil bila semua selesai.
  const tujuan = data.goal && (sisa || !berikut) ? (
    // Ponsel: satu baris di bawah langkahnya; dari 768 px kotak emas pucat, di samping langkahnya mulai 1280 px.
    <div className="flex items-start gap-2 md:rounded-[12px] md:bg-[var(--chip-aksen)] md:px-3 md:py-2">
      <Target size={18} weight="bold" aria-hidden className="mt-px shrink-0 text-[var(--on-chip-aksen)]" />
      <BarisTujuanPoin tujuan={data.goal} className="text-[14px] leading-5" tebalKelas="font-semibold text-[var(--on-chip-aksen)]" sisaKelas="text-[var(--on-chip-aksen)]" />
    </div>
  ) : null;

  return (
    <section id="checkpoint" aria-labelledby="checkpoint-judul" className={`${KARTU_HZ} ${PAD_KARTU} scroll-mt-24 lg:scroll-mt-32`} style={{ color: TINTA }}>
      <KepalaKartuHorizon
        Ikon={Flag}
        judul={t.judul}
        idJudul="checkpoint-judul"
        meta={
          <>
            <span className="sr-only">{t.kemajuan(data.done, total)}</span>
            <span aria-hidden>{`${data.done}/${total}`}</span>
            {data.points ? <span>{` ${SEPARATOR} ${t.poin(data.earned, data.total_points)}`}</span> : null}
          </>
        }
      />
      <div aria-hidden className="mt-4 flex gap-1">
        {data.steps.map((step) => (
          <i key={step.id} className={`h-1 flex-1 rounded-full ${step.done_at ? "bg-[var(--hz-emas)]" : "bg-[#E6E9EE]"}`} />
        ))}
      </div>
      {sisa || !berikut || tujuan ? (
      <div className={`mt-4 flex flex-col gap-3 ${tujuan ? "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)] xl:items-start xl:gap-6" : ""}`}>
        <div className="min-w-0">
          {sisa ? (
            <>
              <p className={KELAS_ALIS} style={{ color: LABEL }}>
                {t.berikut}
              </p>
              <p className={`mt-1 ${KELAS_JUDUL_ISI}`}>{sisa.title}</p>
              {sisa.when ? <BarisKapan teks={teksWaktu(sisa.when, hariIni, lang, true)} hariIni={t.hariIni} /> : null}
              {sisa.place ? (
                <p className={`mt-1 flex items-start gap-1.5 ${KELAS_KET}`} style={{ color: REDUP }}>
                  <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
                  {sisa.place}
                </p>
              ) : null}
              {aksi}
            </>
          ) : !berikut ? (
            <p className={KELAS_JUDUL_ISI}>{t.semuaSelesai}</p>
          ) : null}
        </div>
        {tujuan}
      </div>
      ) : null}
      <CheckpointLipat
        titik="semua"
        ringkas={null}
        lengkap={daftar}
        bukaLabel={t.lihatSemua(total)}
        tutupLabel={t.sembunyikan}
        tombolKelas="m3-state -mx-2 -mb-3.5 mt-[-2px] inline-flex min-h-12 items-center gap-1 rounded-md px-2 text-[14px] font-semibold leading-5 text-[var(--hz-navy)] underline decoration-[var(--hz-emas)] decoration-2 underline-offset-[5px]"
      />
    </section>
  );
}

/** Baris tanggal Langkah berikutnya: ikon kalender, chip "Hari ini" bila hari ini, lalu jam atau tanggalnya. */
function BarisKapan({ teks, hariIni }: { teks: ReturnType<typeof teksWaktu>; hariIni: string }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] font-medium leading-5 [overflow-wrap:anywhere]">
      <CalendarBlank size={16} aria-hidden className="shrink-0" style={{ color: REDUP }} />
      {teks.relatif === "hari-ini" ? (
        <span className="rounded-full bg-[var(--chip-aksen)] px-2 text-[12px] font-semibold leading-5 text-[var(--on-chip-aksen)]">{hariIni}</span>
      ) : null}
      <span className="min-w-0">{teks.tanpaRelatif}</span>
    </p>
  );
}
