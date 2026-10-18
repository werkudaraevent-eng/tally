import { Check, MapPin, QrCode } from "@phosphor-icons/react/dist/ssr";
import type { CheckpointPeserta, LangkahPeserta } from "@/lib/checkpoint/server";
import type { LandingLang } from "@/lib/landing-i18n";
import type { EventTimeZone } from "@/lib/timezone";
import { BarisTujuanPoin } from "@/components/member/baris-tujuan-poin";
import { CheckpointLipat } from "@/components/member/checkpoint-lipat";
import { CINCIN_NAVY } from "@/components/landing/modern/cincin-horizon";
import { PemicuQr } from "@/components/member/qr-fokus";
import { PindaiCheckpoint } from "@/components/member/pindai-checkpoint";

/**
 * Panduan checkpoint di Beranda Horizon: langkah wajib peserta, bukan rundown,
 * jadi tampil sebagai kartu aksi navy (pola pesanan aktif di beranda Grab/Gojek:
 * langkah berikutnya, lokasi, satu tombol QR, lalu linimasa semua langkah).
 * Ponsel: di atas pass. Layar lebar: puncak kolom kanan. Setelah semua selesai
 * kartunya putih dan tenang, dan dashboard memindahkannya ke bawah tiket kereta.
 * Rancangan: /mnt/project-files/gathering-v5/checkpoint-ui/.
 */

const TEKS = {
  id: {
    judul: "Panduan checkpoint",
    berikut: "Langkah berikutnya",
    // Satu sebutan untuk yang memindai QR di seluruh portal: panitia (U-20).
    qr: "Tunjukkan QR ke panitia",
    kendala: "Ada kendala?",
    qrSendiri: "Tunjukkan QR-mu ke panitia",
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
  },
  en: {
    judul: "Checkpoint guide",
    berikut: "Next step",
    qr: "Show QR to the organisers",
    kendala: "Having trouble?",
    qrSendiri: "Show your QR to the organisers",
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
  },
} as const;

/** Ponsel melipat daftar yang lebih panjang dari ini menjadi langkah yang belum selesai saja. */
const MAKS_PONSEL = 4;

function jam(iso: string, zona: EventTimeZone, lang: LandingLang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function KartuCheckpointHorizon({
  data,
  lang,
  zona,
  qrHref,
  slug,
}: {
  data: CheckpointPeserta;
  lang: LandingLang;
  zona: EventTimeZone;
  qrHref: string | null;
  /** Acara ini: tombol Pindai QR checkpoint (scan mandiri) mengirim ke sini. */
  slug: string;
}) {
  const t = TEKS[lang];
  const total = data.steps.length;
  const berikut = data.steps.find((step) => !step.done_at) ?? null;
  // Navy hanya selama ada langkah tersisa; sesudahnya kartu putih biasa.
  const aktif = Boolean(berikut);
  const w = aktif
    ? { kartu: `bg-[var(--hz-navy)] text-white shadow-[0_8px_24px_rgba(16,30,56,0.18)] ${CINCIN_NAVY}`, label: "text-[var(--hz-sorot,var(--hz-emas))]", redup: "text-white/70", samar: "text-white/60", garis: "border-white/15", rel: "bg-white/20", isi: "bg-[var(--hz-emas)]", diAtasIsi: "text-[var(--hz-on-emas)]", kosong: "border-white/35 text-white/70", latar: "bg-[var(--hz-navy)]", tautan: "text-[var(--hz-sorot,var(--hz-emas))]" }
    : { kartu: "bg-white text-[#101E38]", label: "text-[#4D5D77]", redup: "text-[#526078]", samar: "text-[#526078]", garis: "border-[#E6E9EE]", rel: "bg-[#E1E6F1]", isi: "bg-[var(--hz-navy)]", diAtasIsi: "text-white", kosong: "border-[#AEBBD3] text-[#526078]", latar: "bg-white", tautan: "text-[#274FC0]" };

  const baris = (step: LangkahPeserta, akhir: boolean) => {
    const index = data.steps.indexOf(step);
    const selesai = Boolean(step.done_at);
    const ini = step.id === berikut?.id;
    const sub = selesai ? [t.selesaiJam(jam(step.done_at!, zona, lang)), step.size ? t.ukuran(step.size) : null].filter(Boolean).join(" · ") : step.place;
    return (
      <li key={step.id} className={`relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 ${akhir ? "" : "pb-4"}`}>
        {!akhir ? <i aria-hidden className={`absolute bottom-0 left-[13px] top-7 w-0.5 ${selesai ? w.isi : w.rel}`} /> : null}
        <span
          aria-hidden
          className={`relative flex size-7 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
            selesai ? `${w.isi} ${w.diAtasIsi}` : ini ? `border-2 border-[var(--hz-emas)] ${w.latar}` : `border-[1.5px] ${w.kosong} ${w.latar}`
          }`}
        >
          {selesai ? <Check size={14} weight="bold" /> : index + 1}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className={`text-[15px] leading-5 [overflow-wrap:anywhere] ${ini ? "font-semibold" : selesai ? `font-medium ${w.redup}` : "font-medium"}`}>
            <span className="sr-only">{`${index + 1}. ${selesai ? t.sudah : t.belum}: `}</span>
            {step.title}
          </p>
          {sub ? <p className={`mt-0.5 text-[13px] leading-[18px] [overflow-wrap:anywhere] ${w.samar}`}>{sub}</p> : null}
        </div>
        {step.points !== null ? (
          <span className={`pt-0.5 text-[13px] font-semibold tabular-nums ${selesai && aktif ? "text-[var(--hz-sorot,var(--hz-emas))]" : w.samar}`}>
            <span className="sr-only">{t.poinSr(step.points)}</span>
            <span aria-hidden>{`+${step.points}`}</span>
          </span>
        ) : (
          <span />
        )}
      </li>
    );
  };
  const daftar = (langkah: LangkahPeserta[]) => (
    <ol className={`mt-5 border-t pt-4 ${w.garis}`}>{langkah.map((step, urutan) => baris(step, urutan === langkah.length - 1))}</ol>
  );
  const belumSelesai = data.steps.filter((step) => !step.done_at);

  return (
    <section aria-labelledby="checkpoint-judul" className={`rounded-[20px] p-5 md:rounded-[24px] md:p-6 ${w.kartu}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[12px] font-semibold uppercase tracking-[0.8px] ${w.label}`}>{t.judul}</p>
        <p className="text-[14px] font-semibold tabular-nums">
          <span className="sr-only">{t.kemajuan(data.done, total)}</span>
          <span aria-hidden>{`${data.done}/${total}`}</span>
          {data.points ? <span className={`font-medium ${w.redup}`}>{` · ${t.poin(data.earned, data.total_points)}`}</span> : null}
        </p>
      </div>
      <div aria-hidden className="mt-3 flex gap-1">
        {data.steps.map((step) => (
          <i key={step.id} className={`h-1.5 flex-1 rounded-full ${step.done_at ? w.isi : w.rel}`} />
        ))}
      </div>
      {/* Tujuan poin (E-08): tepat di bawah bilah kemajuan selama ada langkah
          tersisa; sesudah semuanya selesai, di bawah judul "Semua checkpoint selesai". */}
      {data.goal && aktif ? (
        <BarisTujuanPoin
          tujuan={data.goal}
          className="mt-3 text-[14px] leading-5"
          tebalKelas="font-bold text-[var(--hz-sorot,var(--hz-emas))]"
          sisaKelas="text-[#CDD7EA]"
        />
      ) : null}
      {berikut ? (
        <>
          <p className={`mt-5 text-[14px] font-medium ${w.redup}`}>{t.berikut}</p>
          <h2 id="checkpoint-judul" className="mt-1 text-[22px] font-semibold leading-7 [overflow-wrap:anywhere] md:text-[24px] md:leading-8">
            {berikut.title}
          </h2>
          {berikut.place ? (
            <p className="mt-2 flex items-start gap-2 text-[15px] leading-5 text-white/85 [overflow-wrap:anywhere]">
              <MapPin size={20} aria-hidden className="shrink-0 text-[var(--hz-emas)]" />
              {berikut.place}
            </p>
          ) : null}
          {berikut.self_scan ? (
            // Scan mandiri: peserta memindai QR panitia, seperti membayar dengan QRIS.
            <>
              <PindaiCheckpoint
                slug={slug}
                lang={lang}
                qrHref={berikut.self_scan === "both" ? qrHref : null}
                className="m3-state mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--hz-emas)] px-5 text-[15px] font-semibold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)]"
              />
              {berikut.self_scan === "both" && qrHref ? (
                <p className="mt-1 text-center text-[14px] text-white/80">
                  {`${t.kendala} `}
                  <PemicuQr id="pemicu-qr-checkpoint" href={qrHref} className="inline-flex min-h-12 items-center rounded-md font-semibold text-[var(--hz-sorot,var(--hz-emas))] underline-offset-2 hover:underline">
                    {t.qrSendiri}
                  </PemicuQr>
                </p>
              ) : null}
            </>
          ) : qrHref ? (
            <PemicuQr
              id="pemicu-qr-checkpoint"
              href={qrHref}
              className="m3-state mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--hz-emas)] px-5 text-[15px] font-semibold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)]"
            >
              <QrCode size={20} weight="bold" aria-hidden />
              {t.qr}
            </PemicuQr>
          ) : null}
        </>
      ) : (
        <>
          <h2 id="checkpoint-judul" className="mt-4 text-[20px] font-semibold leading-7">
            {t.semuaSelesai}
          </h2>
          {data.goal ? (
            <BarisTujuanPoin tujuan={data.goal} className="mt-1 text-[14px] leading-5" tebalKelas="font-bold text-[#101E38]" sisaKelas={w.redup} />
          ) : null}
        </>
      )}
      {total > MAKS_PONSEL && belumSelesai.length > 0 ? (
        <CheckpointLipat
          titik="lg"
          ringkas={daftar(belumSelesai)}
          lengkap={daftar(data.steps)}
          bukaLabel={t.lihatSemua(total)}
          tutupLabel={t.sembunyikan}
          tombolKelas={`m3-state mt-2 inline-flex min-h-12 items-center gap-1.5 rounded-md text-[14px] font-semibold ${w.tautan}`}
        />
      ) : (
        daftar(data.steps)
      )}
    </section>
  );
}
