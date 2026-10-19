import Link from "next/link";
import { Check, Flag, QrCode } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import type { CheckpointPeserta, LangkahPeserta } from "@/lib/checkpoint/server";
import type { LandingLang } from "@/lib/landing-i18n";
import type { EventTimeZone } from "@/lib/timezone";
import { BarisTujuanPoin } from "@/components/member/baris-tujuan-poin";
import { CheckpointLipat } from "@/components/member/checkpoint-lipat";
import { PindaiCheckpoint } from "@/components/member/pindai-checkpoint";

/**
 * Kartu Checkpoint di Beranda Dashboard saya (Check-in > Checkpoints).
 *
 * Satu isi untuk Gathering klasik (kartu putih, warna tombol tema) dan Modern
 * (panel abu, warna utama). Horizon punya kartunya sendiri:
 * kartu-checkpoint-horizon.tsx. Rancangan:
 * /mnt/project-files/checkpoint/ (4-classic, 5-classic-390, 6-horizon-390).
 *
 * Layar lebar menampilkan semua langkah. Ponsel hanya langkah berikutnya dan
 * "Lihat semua N checkpoint", supaya rundown tidak terdorong jauh ke bawah.
 * Urutan hanya petunjuk: langkah yang dilompati tetap bisa selesai belakangan.
 */

const TEKS = {
  id: {
    judul: "Checkpoint",
    berikut: (judul: string) => `Berikutnya: ${judul}`,
    semuaSelesai: "Semua checkpoint selesai",
    kemajuan: (selesai: number, total: number) => `${selesai} dari ${total} selesai`,
    poin: (dapat: number, total: number) => [String(dapat), ` / ${total} poin`] as const,
    selesaiJam: (jam: string) => `Selesai ${jam}`,
    ukuran: (ukuran: string) => `ukuran ${ukuran}`,
    tandaBerikut: "Berikutnya",
    lihatSemua: (n: number) => `Lihat semua ${n} checkpoint`,
    sembunyikan: "Sembunyikan",
    catatan: "Tunjukkan QR kehadiran ke panitia di tiap checkpoint. Centangnya muncul di sini otomatis.",
    catatanMandiri: "Di checkpoint ini, pindai QR yang ditampilkan panitia. Centangnya muncul di sini otomatis.",
    tampilkanQr: "Tampilkan QR",
    sudah: "Sudah selesai",
    belum: "Belum",
    poinSr: (n: number) => `${n} poin`,
  },
  en: {
    judul: "Checkpoints",
    berikut: (judul: string) => `Next: ${judul}`,
    semuaSelesai: "All checkpoints done",
    kemajuan: (selesai: number, total: number) => `${selesai} of ${total} done`,
    poin: (dapat: number, total: number) => [String(dapat), ` / ${total} points`] as const,
    selesaiJam: (jam: string) => `Done ${jam}`,
    ukuran: (ukuran: string) => `size ${ukuran}`,
    tandaBerikut: "Next",
    lihatSemua: (n: number) => `See all ${n} checkpoints`,
    sembunyikan: "Hide",
    catatan: "Show your attendance QR to the organisers at each checkpoint. It ticks off here by itself.",
    catatanMandiri: "At this checkpoint you scan the QR the organisers show. It ticks off here by itself.",
    tampilkanQr: "Show QR",
    sudah: "Done",
    belum: "Not yet",
    poinSr: (n: number) => `${n} points`,
  },
} as const;

/** Warna dan bentuk per tata letak. Semua warna lewat variabel tema halaman itu. */
type Gaya = {
  kartu: string;
  label: string;
  redup: string;
  judul: string;
  /** Isi segmen kemajuan dan lingkaran selesai. */
  isi: string;
  /** Teks di atas `isi`. */
  diAtasIsi: string;
  /** Lingkaran langkah berikutnya. */
  berikut: string;
  tandaBerikut: string;
  barisBerikut: string;
  garis: string;
  tautan: string;
  titik: "lg" | "md";
};

const GAYA: Record<"gathering" | "modern", Gaya> = {
  gathering: {
    kartu: "rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6",
    label: "text-[12px] font-bold uppercase tracking-[0.08em] text-[#5F6B7F]",
    redup: "text-[#5F6B7F]",
    judul: "text-[22px] font-extrabold leading-tight sm:text-[24px]",
    isi: "bg-[var(--aksi)]",
    diAtasIsi: "text-[var(--on-aksi)]",
    berikut: "border-2 border-[var(--aksi)] text-[var(--alis)]",
    tandaBerikut: "bg-[var(--chip-aksi)] text-[var(--on-chip-aksi)]",
    barisBerikut: "",
    garis: "border-[#E6E9EE]",
    tautan: "text-[var(--alis)]",
    titik: "lg",
  },
  modern: {
    kartu: "rounded-lg bg-[var(--reg-panel)] p-6",
    label: "text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--reg-on-surface-variant,#535862)]",
    redup: "text-[var(--reg-on-surface-variant,#535862)]",
    judul: "text-[22px] font-semibold leading-tight sm:text-[24px]",
    isi: "bg-[var(--reg-primary)]",
    diAtasIsi: "text-[var(--reg-on-primary)]",
    berikut: "border-2 border-[var(--reg-primary)] text-[var(--reg-primary)]",
    tandaBerikut: "bg-[color-mix(in_srgb,var(--reg-primary)_12%,var(--reg-surface,white))] text-[var(--reg-primary)]",
    barisBerikut: "",
    garis: "border-[var(--reg-outline-variant)]",
    tautan: "text-[var(--reg-primary)]",
    titik: "lg",
  },

};

function jam(iso: string, zona: EventTimeZone, lang: LandingLang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function KartuCheckpoint({
  data,
  lang,
  zona,
  gaya: jenis,
  qrHref,
  slug,
}: {
  data: CheckpointPeserta;
  lang: LandingLang;
  zona: EventTimeZone;
  gaya: "gathering" | "modern";
  /** Tombol "Tampilkan QR" di kartu. */
  qrHref?: string | null;
  /** Acara ini: tombol Pindai QR checkpoint (scan mandiri) mengirim ke sini. */
  slug: string;
}) {
  const t = TEKS[lang];
  const g = GAYA[jenis];
  const total = data.steps.length;
  const berikut = data.steps.find((step) => !step.done_at) ?? null;
  const [dapat, sisaPoin] = t.poin(data.earned, data.total_points);

  const baris = (step: LangkahPeserta, index: number, pertama: boolean): ReactNode => {
    const selesai = Boolean(step.done_at);
    const iniBerikut = step.id === berikut?.id;
    const sub = selesai
      ? [t.selesaiJam(jam(step.done_at!, zona, lang)), step.size ? t.ukuran(step.size) : null].filter(Boolean).join(" · ")
      : step.place;
    return (
      <li
        key={step.id}
        className={`grid min-h-14 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 ${pertama ? "" : `border-t ${g.garis}`} ${iniBerikut ? g.barisBerikut : ""}`}
      >
        <span
          aria-hidden
          className={`flex size-7 items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${
            selesai ? `${g.isi} ${g.diAtasIsi}` : iniBerikut ? g.berikut : `border-[1.5px] border-[#AEBBD3] ${g.redup}`
          }`}
        >
          {selesai ? <Check size={14} weight="bold" /> : index + 1}
        </span>
        <div className="min-w-0">
          <p className={`[overflow-wrap:anywhere] text-[15px] leading-snug ${selesai ? `font-medium ${g.redup}` : "font-semibold"}`}>
            <span className="sr-only">{`${index + 1}. ${selesai ? t.sudah : t.belum}: `}</span>
            {step.title}
            {iniBerikut ? (
              <span className={`ml-2 inline-flex min-h-6 items-center rounded-md px-2 align-[2px] text-[12px] font-semibold ${g.tandaBerikut}`}>{t.tandaBerikut}</span>
            ) : null}
          </p>
          {sub ? <p className={`mt-0.5 text-[13px] [overflow-wrap:anywhere] ${g.redup}`}>{sub}</p> : null}
        </div>
        {step.points !== null ? (
          <span className={`text-[13px] font-semibold tabular-nums ${g.redup}`}>
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
    <ol className={`mt-4 border-t ${g.garis}`}>{langkah.map((step, urutan) => baris(step, data.steps.indexOf(step), urutan === 0))}</ol>
  );
  const tombolLipat = `m3-state mt-1 inline-flex min-h-12 items-center gap-1.5 rounded-md text-[14px] font-bold ${g.tautan}`;

  return (
    <section aria-labelledby="checkpoint-judul" className={g.kartu}>
      <div className="flex items-center justify-between gap-4">
        <p className={`inline-flex items-center gap-2 ${g.label}`}>
          <Flag size={16} weight="bold" aria-hidden />
          {t.judul}
        </p>
        {data.points ? (
          <p className="text-[14px] font-bold tabular-nums">
            {dapat}
            <span className={`font-medium ${g.redup}`}>{sisaPoin}</span>
          </p>
        ) : null}
      </div>
      <h2 id="checkpoint-judul" className={`mt-2 [overflow-wrap:anywhere] ${g.judul}`}>
        {berikut ? t.berikut(berikut.title) : t.semuaSelesai}
      </h2>
      <div aria-hidden className="mt-3 flex gap-1">
        {data.steps.map((step) => (
          <i key={step.id} className={`h-1.5 flex-1 rounded-full ${step.done_at ? g.isi : "bg-[#E1E6F1]"}`} />
        ))}
      </div>
      <p className={`mt-2 text-[13.5px] ${g.redup}`}>{t.kemajuan(data.done, total)}</p>
      {/* Tujuan poin (E-08). Bagian tebal memakai warna teks utama kartu. */}
      {data.goal ? <BarisTujuanPoin tujuan={data.goal} className="mt-1 text-[13.5px] leading-[1.5]" tebalKelas="font-bold" sisaKelas={g.redup} /> : null}

      {/* Satu langkah tidak perlu dilipat. Semua selesai: layar lebar tetap
          menampilkan riwayatnya, ponsel cukup judul "Semua checkpoint selesai". */}
      {total === 1 ? (
        daftar(data.steps)
      ) : (
        <CheckpointLipat
          titik={g.titik}
          ringkas={berikut ? daftar([berikut]) : null}
          lengkap={daftar(data.steps)}
          bukaLabel={t.lihatSemua(total)}
          tutupLabel={t.sembunyikan}
          tombolKelas={tombolLipat}
        />
      )}

      {berikut?.self_scan ? (
        // Scan mandiri: tombol utamanya kamera; "Tampilkan QR" tetap ada bila panitia juga memindai.
        <div className="mt-3 flex flex-col gap-3">
          <p className={`text-[13px] leading-[1.5] ${g.redup}`}>{t.catatanMandiri}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <PindaiCheckpoint
              slug={slug}
              lang={lang}
              qrHref={berikut.self_scan === "both" ? qrHref ?? null : null}
              className={`m3-state inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[12px] px-4 text-[14px] font-semibold ${g.isi} ${g.diAtasIsi}`}
            />
            {berikut.self_scan === "both" && qrHref ? (
              <Link href={qrHref} className="m3-state inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[#C3C9D4] px-4 text-[14px] font-semibold">
                <QrCode size={20} aria-hidden />
                {t.tampilkanQr}
              </Link>
            ) : null}
          </div>
        </div>
      ) : berikut ? (
        <div className={`mt-3 flex flex-col gap-3 ${qrHref ? "sm:flex-row sm:items-center sm:justify-between" : ""}`}>
          <p className={`text-[13px] leading-[1.5] ${g.redup}`}>{t.catatan}</p>
          {qrHref ? (
            <Link
              href={qrHref}
              className={`m3-state inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[#C3C9D4] px-4 text-[14px] font-semibold`}
            >
              <QrCode size={20} aria-hidden />
              {t.tampilkanQr}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
