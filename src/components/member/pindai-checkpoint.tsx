"use client";

import { Check, Checks, Scan, Ticket, WarningCircle, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { LandingLang } from "@/lib/landing-i18n";
import { bacaQrCheckpoint } from "@/lib/checkpoint/qr-alamat";

/**
 * Tombol "Pindai QR checkpoint" di kartu checkpoint (scan mandiri).
 *
 * Pola pembayaran QRIS dari sisi pembeli: tombol membuka kamera di halaman yang
 * sama, kamera membaca QR yang ditampilkan panitia, lalu checkpoint tercatat
 * dan kartunya disegarkan. QR itu juga berupa tautan, jadi kamera bawaan ponsel
 * tetap jalan bila kamera di sini ditolak (halaman /pindai).
 */

const TEKS = {
  id: {
    tombol: "Pindai QR checkpoint",
    judul: "Pindai QR checkpoint",
    tutup: "Tutup",
    arahkan: "Arahkan ke QR di layar panitia",
    catatan: "QR-nya berganti tiap 30 detik. Pindai langsung dari layar, bukan dari foto.",
    mencatat: "Mencatat…",
    kameraGagal: "Kamera tidak bisa dibuka. Izinkan kamera untuk situs ini, atau pindai QR-nya dengan kamera bawaan ponsel.",
    bukanQr: "Ini bukan QR checkpoint",
    bukanQrRinci: "Arahkan ke QR di layar panitia. Kamera tetap menyala.",
    acaraLain: "QR ini untuk acara lain",
    acaraLainRinci: "Arahkan ke QR checkpoint acara ini. Kamera tetap menyala.",
    koneksi: "Koneksi terputus. Coba pindai lagi.",
    lagi: "Pindai lagi",
    cadangan: "Tidak bisa? Tunjukkan QR kehadiran ke panitia",
    cadanganSingkat: "Tunjukkan QR kehadiran ke panitia",
    tercatat: "Checkpoint tercatat",
    sudahTercatat: "Sudah tercatat sebelumnya",
    tanpaPoin: "Scan ini tidak menambah poin. Kamu tidak perlu scan lagi.",
    tanpaUlang: "Kamu tidak perlu scan lagi.",
    belum: "Belum tercatat",
    poin: "poin",
    poinSr: (n: number) => `${n} poin ditambahkan`,
    kemajuan: (done: number, total: number, poin: number | null) => [`${done} dari ${total} checkpoint`, poin !== null ? `${poin} poin` : null].filter(Boolean).join(" · "),
    berikutnya: "Langkah berikutnya",
    selesai: "Selesai",
    checkpoint: "Checkpoint",
  },
  en: {
    tombol: "Scan checkpoint QR",
    judul: "Scan checkpoint QR",
    tutup: "Close",
    arahkan: "Point at the QR on the organisers' screen",
    catatan: "The QR changes every 30 seconds. Scan it straight from the screen, not from a photo.",
    mencatat: "Recording…",
    kameraGagal: "The camera could not open. Allow the camera for this site, or scan the QR with the phone's own camera.",
    bukanQr: "This is not a checkpoint QR",
    bukanQrRinci: "Point at the QR on the organisers' screen. The camera stays on.",
    acaraLain: "This QR is for another event",
    acaraLainRinci: "Point at this event's checkpoint QR. The camera stays on.",
    koneksi: "Connection lost. Try scanning again.",
    lagi: "Scan again",
    cadangan: "Can't scan? Show the attendance QR to the organisers",
    cadanganSingkat: "Show the attendance QR to the organisers",
    tercatat: "Checkpoint recorded",
    sudahTercatat: "Already recorded",
    tanpaPoin: "This scan adds no points. You don't need to scan again.",
    tanpaUlang: "You don't need to scan again.",
    belum: "Not recorded yet",
    poin: "points",
    poinSr: (n: number) => `${n} points added`,
    kemajuan: (done: number, total: number, poin: number | null) => [`${done} of ${total} checkpoints`, poin !== null ? `${poin} points` : null].filter(Boolean).join(" · "),
    berikutnya: "Next step",
    selesai: "Done",
    checkpoint: "Checkpoint",
  },
} as const;

type Jawaban = {
  status?: "recorded" | "already";
  done_at_text?: string | null;
  steps?: { id: number; title: string; points: number | null }[];
  done?: number | null;
  total?: number | null;
  points?: { earned: number; total: number } | null;
  next?: { title: string; place: string | null; when: string | null } | null;
  goal_reached?: { tebal: string; sisa: string } | null;
  message?: string | null;
  error?: { message?: string };
};

/** Isi layar hasil sesudah checkpoint tercatat (baru atau sudah sebelumnya). */
export type KabarCheckpoint = {
  jenis: "baru" | "sudah";
  judul: string;
  /** "Hari ini · 16.09": jam tercatat di zona acara. */
  waktu: string | null;
  /** Poin dari scan ini; null bila poin mati atau nol. */
  poin: number | null;
  done: number | null;
  total: number | null;
  /** Poin yang sudah dikumpulkan; null bila poin mati. */
  terkumpul: number | null;
  berikut: { judul: string; rinci: string | null } | null;
  /** Kalimat tujuan poin, hanya pada scan yang membuat poinnya cukup. */
  tujuan: { tebal: string; sisa: string } | null;
  /** Message after scan dari panitia (Check-in > Checkpoints). */
  pesan: string | null;
};

export function kabarDariJawaban(body: Jawaban, lang: LandingLang): KabarCheckpoint {
  const t = TEKS[lang];
  const baru = body.status !== "already";
  const poin = baru && body.points ? (body.steps ?? []).reduce((jumlah, step) => jumlah + (step.points ?? 0), 0) : 0;
  const berikut = body.next ?? null;
  return {
    jenis: baru ? "baru" : "sudah",
    judul: body.steps?.map((step) => step.title).join(", ") || t.checkpoint,
    waktu: body.done_at_text ?? null,
    poin: poin > 0 ? poin : null,
    done: body.done ?? null,
    total: body.total ?? null,
    terkumpul: body.points ? body.points.earned : null,
    berikut: berikut ? { judul: berikut.title, rinci: [berikut.when, berikut.place].filter(Boolean).join(" · ") || null } : null,
    tujuan: baru ? body.goal_reached ?? null : null,
    pesan: body.message?.trim() || null,
  };
}

/** Kirim isi QR ke server. Dipakai tombol kamera dan halaman /pindai. */
export async function kirimQrCheckpoint(slug: string, sesi: number, kode: string, lang: LandingLang): Promise<{ ok: true; kabar: KabarCheckpoint } | { ok: false; pesan: string }> {
  const response = await fetch(`/e/${encodeURIComponent(slug)}/api/peserta/checkpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ s: sesi, k: kode, lang }),
  }).catch(() => null);
  if (!response) return { ok: false, pesan: TEKS[lang].koneksi };
  const body = ((await response.json().catch(() => null)) ?? {}) as Jawaban;
  if (!response.ok) return { ok: false, pesan: body.error?.message ?? TEKS[lang].koneksi };
  return { ok: true, kabar: kabarDariJawaban(body, lang) };
}

/** Getar singkat di Android. Safari iOS tidak punya API getar; layarnya sendiri sudah cukup jelas. */
function getar(pola: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pola);
  } catch {
    // Diabaikan: getar hanya tambahan.
  }
}

// Warna status tetap, tidak mengikuti tema acara (sama dengan lembar hasil
// scanner panitia): hijau harus selalu berarti tercatat. Nilainya peran
// success/error terang dari m3-theme.css; teks putih 6,4:1 dan 6,6:1.
const NADA = {
  baru: "bg-[#006B58]",
  sudah: "bg-[#26303F]",
  gagal: "bg-[#B41340]",
} as const;
const TEKS_TOMBOL = { baru: "text-[#00382D]", sudah: "text-[#26303F]", gagal: "text-[#7A0C2B]" } as const;

/** Layar hasil yang tutup sendiri: 5 detik, berhenti bila layar disentuh. */
const TUTUP_SENDIRI_MS = 5000;

type Aksi = { label: string; onClick?: () => void; href?: string };

/**
 * Layar hasil scan checkpoint, layar penuh seperti "Pembayaran berhasil"
 * sesudah membayar QRIS. Tiga nada: baru tercatat (hijau), sudah tercatat
 * sebelumnya (abu gelap, tanpa poin), dan gagal (merah). Kartu checkpoint di
 * belakangnya sudah disegarkan, jadi semua isinya juga ada di sana sesudah
 * layar ini tertutup (WCAG 2.2.1 untuk yang tutup sendiri).
 */
export function LayarHasil({
  lang,
  kabar,
  gagal,
  utama,
  kedua,
  tutupSendiri,
  onTutup,
  className = "fixed inset-0 z-[120]",
}: {
  lang: LandingLang;
  /** Hasil tercatat. Tidak dipakai bila `gagal` diisi. */
  kabar?: KabarCheckpoint;
  /** Kalimat galat dari server. */
  gagal?: string;
  utama: Aksi;
  kedua?: Aksi | null;
  /** Hitung mundur di tombol utama, lalu `utama.onClick`. */
  tutupSendiri?: boolean;
  /** Tombol X dan Escape. Tanpa ini: tanpa tombol X. */
  onTutup?: () => void;
  className?: string;
}) {
  const t = TEKS[lang];
  const nada = gagal !== undefined ? "gagal" : kabar?.jenis ?? "baru";
  const layarRef = useRef<HTMLDivElement>(null);
  const [jalan, setJalan] = useState(Boolean(tutupSendiri));
  const aksiRef = useRef(utama);
  useEffect(() => { aksiRef.current = utama; });
  const tutupRef = useRef(onTutup);
  useEffect(() => { tutupRef.current = onTutup; });

  // Fokus ke layarnya (pembaca layar membacakan judul dan rinciannya), bukan ke
  // tombol: cincin fokus di tombol yang belum disentuh terlihat seperti galat.
  // Dari lapisan QR, dialognya baru tertutup sesudah Kembali, jadi fokusnya
  // dicoba lagi sebentar kemudian.
  useEffect(() => {
    const fokus = () => { if (!layarRef.current?.contains(document.activeElement)) layarRef.current?.focus({ preventScroll: true }); };
    const bingkai = window.requestAnimationFrame(fokus);
    const timer = window.setTimeout(fokus, 300);
    return () => { window.cancelAnimationFrame(bingkai); window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (nada === "baru") getar(90);
    else if (nada === "gagal") getar([250]);
  }, [nada]);

  useEffect(() => {
    if (!jalan) return;
    const timer = window.setTimeout(() => aksiRef.current.onClick?.(), TUTUP_SENDIRI_MS);
    return () => window.clearTimeout(timer);
  }, [jalan]);

  useEffect(() => {
    const tombol = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !tutupRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      tutupRef.current();
    };
    window.addEventListener("keydown", tombol, true);
    return () => window.removeEventListener("keydown", tombol, true);
  }, []);

  const judul = gagal !== undefined ? t.belum : kabar?.judul ?? t.checkpoint;
  const alis = gagal !== undefined ? null : nada === "sudah" ? t.sudahTercatat : t.tercatat;
  const Ikon = nada === "gagal" ? WarningCircle : nada === "sudah" ? Checks : Check;
  const kelasTombol = `m3-state relative flex min-h-14 w-full items-center justify-center overflow-hidden rounded-full px-5 text-center text-[17px] font-bold leading-6`;
  const tombolUtama = (
    <>
      {jalan ? <span aria-hidden className={`hasil-scan-isi absolute inset-y-0 left-0 ${nada === "sudah" ? "bg-[#26303F]/15" : "bg-[#006B58]/15"}`} style={{ animationDuration: `${TUTUP_SENDIRI_MS}ms` }} /> : null}
      <span className="relative">{utama.label}</span>
    </>
  );
  const kelasUtama = `${kelasTombol} bg-white ${TEKS_TOMBOL[nada]} [--m3-state-color:currentColor]`;
  const kelasKedua = `${kelasTombol} min-h-12 text-[15px] font-semibold text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.7)] [--m3-state-color:#fff]`;
  const jumlah = kabar && kabar.done !== null && kabar.total !== null && kabar.total > 0 ? { done: kabar.done, total: kabar.total } : null;

  return (
    <div
      ref={layarRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hasil-scan-judul"
      aria-describedby="hasil-scan-rinci"
      onPointerDown={() => setJalan(false)}
      className={`${className} hasil-scan flex flex-col overflow-hidden outline-none text-white ${NADA[nada]} pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]`}
    >
      <div className="flex h-12 shrink-0 items-center px-2">
        {onTutup ? (
          <button type="button" aria-label={t.tutup} onClick={onTutup} className="m3-state flex size-12 items-center justify-center rounded-full [--m3-state-color:#fff]">
            <X size={24} aria-hidden />
          </button>
        ) : null}
      </div>
      {/* Isi bergulir sendiri; tombolnya selalu terlihat di bawah, juga di layar pendek. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6">
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center [@media(max-height:700px)]:py-3">
          <span aria-hidden className={`hasil-scan-ikon flex size-[104px] shrink-0 items-center [@media(max-height:700px)]:size-20 justify-center rounded-full ${nada === "sudah" ? "shadow-[inset_0_0_0_4px_rgb(255_255_255/0.85)]" : "bg-white"}`}>
            <Ikon size={nada === "gagal" ? 72 : 60} weight={nada === "gagal" ? "fill" : "bold"} className={nada === "baru" ? "text-[#006B58]" : nada === "gagal" ? "text-[#B41340]" : "text-white"} />
          </span>
          {alis ? <p className="mt-6 text-[16px] [@media(max-height:700px)]:mt-4 font-bold leading-6 text-white/90">{alis}</p> : null}
          <h2 id="hasil-scan-judul" className={`${alis ? "mt-1.5" : "mt-6"} max-w-full font-extrabold [overflow-wrap:anywhere] [text-wrap:balance] ${judul.length > 32 ? "text-[26px] leading-8" : "text-[32px] leading-10"}`}>
            {judul}
          </h2>
          <div id="hasil-scan-rinci" className="flex w-full flex-col items-center">
            {gagal !== undefined ? (
              <p className="mt-3 max-w-[320px] text-[16px] leading-6 text-white/90">{gagal}</p>
            ) : kabar ? (
              <>
                {kabar.waktu ? <p className="mt-2 text-[16px] leading-6 text-white/85 tabular-nums">{kabar.waktu}</p> : null}
                {kabar.poin !== null ? (
                  <p className="mt-6 inline-flex items-baseline gap-2 rounded-full bg-white/15 px-6 pb-2 pt-1.5 [@media(max-height:700px)]:mt-4">
                    <span className="sr-only">{t.poinSr(kabar.poin)}</span>
                    <span aria-hidden className="text-[40px] font-extrabold leading-[48px] tabular-nums">{`+${kabar.poin}`}</span>
                    <span aria-hidden className="text-[18px] font-bold">{t.poin}</span>
                  </p>
                ) : null}
                {kabar.jenis === "sudah" ? <p className="mt-3 max-w-[320px] text-[16px] leading-6 text-white/90">{kabar.terkumpul !== null ? t.tanpaPoin : t.tanpaUlang}</p> : null}
                {jumlah ? (
                  <>
                    <div aria-hidden className="mt-7 grid w-[min(260px,100%)] gap-1.5 [@media(max-height:700px)]:mt-5" style={{ gridTemplateColumns: `repeat(${Math.min(jumlah.total, 12)}, minmax(0, 1fr))` }}>
                      {Array.from({ length: Math.min(jumlah.total, 12) }, (_, i) => (
                        <i key={i} className={`h-1.5 rounded-full ${i < Math.round((jumlah.done / jumlah.total) * Math.min(jumlah.total, 12)) ? "bg-white" : "bg-white/30"}`} />
                      ))}
                    </div>
                    <p className="mt-2.5 text-[15px] leading-5 text-white/90 tabular-nums">{t.kemajuan(jumlah.done, jumlah.total, kabar.terkumpul)}</p>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3 empty:hidden">
          {kabar?.pesan ? (
            <p className="whitespace-pre-line rounded-2xl bg-white px-4 py-3.5 text-[16px] leading-[22px] text-[#1B2230] [overflow-wrap:anywhere]">{kabar.pesan}</p>
          ) : null}
          {kabar?.tujuan ? (
            <p className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3.5 text-left text-[16px] leading-[22px] text-[#00382D]">
              <Ticket size={24} weight="bold" aria-hidden className="mt-px shrink-0 text-[#006B58]" />
              <span><b className="font-bold">{kabar.tujuan.tebal}</b> {kabar.tujuan.sisa}</span>
            </p>
          ) : null}
          {kabar?.berikut && !kabar.pesan && !kabar.tujuan ? (
            <div className="rounded-2xl bg-black/20 px-4 py-3.5 text-[15px] leading-[21px] [@media(max-height:700px)]:hidden">
              <p className="text-[13px] font-bold text-white/80">{t.berikutnya}</p>
              <p className="mt-0.5 text-[16px] font-bold [overflow-wrap:anywhere]">{kabar.berikut.judul}</p>
              {kabar.berikut.rinci ? <p className="[overflow-wrap:anywhere]">{kabar.berikut.rinci}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      </div>
      <div className="mx-auto flex w-full max-w-md shrink-0 flex-col gap-3 px-6 pt-3">
          {utama.href ? (
            <a href={utama.href} className={kelasUtama}>{tombolUtama}</a>
          ) : (
            <button type="button" onClick={utama.onClick} className={kelasUtama}>{tombolUtama}</button>
          )}
          {kedua ? (
            kedua.href ? (
              <a href={kedua.href} className={kelasKedua}>{kedua.label}</a>
            ) : (
              <button type="button" onClick={kedua.onClick} className={kelasKedua}>{kedua.label}</button>
            )
          ) : null}
      </div>
    </div>
  );
}

// Layar hasil dipasang di root sendiri, bukan di dalam kartu: sesudah
// router.refresh langkah berikutnya bisa langkah panitia, dan tombol kamera
// (beserta isinya) hilang.
let hasilAktif: { root: Root; wadah: HTMLDivElement } | null = null;

function tutupHasil() {
  if (!hasilAktif) return;
  hasilAktif.root.unmount();
  hasilAktif.wadah.remove();
  hasilAktif = null;
}

function tampilkanHasil(kabar: KabarCheckpoint, lang: LandingLang, huruf: string | null, kembaliKe: HTMLElement | null) {
  tutupHasil();
  const wadah = document.createElement("div");
  // Huruf acara: portal memasangnya di pembungkus halaman, bukan di body.
  if (huruf) wadah.style.fontFamily = huruf;
  // Gulir halaman dikunci lewat CSS (globals.css, body:has([data-hasil-scan])),
  // bukan body.style: kamera yang baru ditutup memulihkan body.style-nya
  // sendiri sesudah layar ini dipasang.
  wadah.dataset.hasilScan = "";
  document.body.append(wadah);
  const root = createRoot(wadah);
  hasilAktif = { root, wadah };
  const tutup = () => {
    if (hasilAktif?.root !== root) return;
    tutupHasil();
    if (kembaliKe?.isConnected) kembaliKe.focus({ preventScroll: true });
  };
  // Momen tujuan poin tidak tutup sendiri: peserta perlu membacanya.
  root.render(
    <LayarHasil lang={lang} kabar={kabar} utama={{ label: TEKS[lang].selesai, onClick: tutup }} tutupSendiri={!kabar.tujuan && !kabar.pesan} onTutup={tutup} />,
  );
}

export function PindaiCheckpoint({
  slug,
  lang,
  className,
  qrHref,
  children,
  wadah,
  kembaliKeQr,
  sesudah,
}: {
  slug: string;
  lang: LandingLang;
  className: string;
  /** Cadangan di layar kamera: QR peserta untuk dipindai panitia. Null: tanpa cadangan. */
  qrHref: string | null;
  children?: ReactNode;
  /** Tempat layar kamera dipasang. Dari lapisan QR: dialognya (lapisan atas), bukan body. */
  wadah?: HTMLElement | null;
  /** Dibuka dari layar QR: cadangannya cukup menutup kamera, QR-nya ada di belakang. */
  kembaliKeQr?: boolean;
  /** Sesudah tercatat, menggantikan penyegaran kartu (mis. menutup lapisan QR, lalu menyegarkan). */
  sesudah?: () => void;
}) {
  const t = TEKS[lang];
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const tombolRef = useRef<HTMLButtonElement>(null);

  const tutup = useCallback(() => {
    setBuka(false);
    window.requestAnimationFrame(() => tombolRef.current?.focus());
  }, []);

  return (
    <>
      <button ref={tombolRef} type="button" className={className} onClick={() => { tutupHasil(); setBuka(true); }}>
        {children ?? (
          <>
            <Scan size={20} weight="bold" aria-hidden />
            {t.tombol}
          </>
        )}
      </button>
      {buka ? (
        <LayarKamera
          slug={slug}
          lang={lang}
          qrHref={qrHref}
          wadah={wadah ?? null}
          kembaliKeQr={kembaliKeQr === true}
          onTutup={tutup}
          onBerhasil={(hasil) => {
            setBuka(false);
            const tombol = tombolRef.current;
            tampilkanHasil(hasil, lang, tombol ? window.getComputedStyle(tombol).fontFamily : null, tombol);
            if (sesudah) sesudah();
            else router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function LayarKamera({
  slug,
  lang,
  qrHref,
  wadah,
  kembaliKeQr,
  onTutup,
  onBerhasil,
}: {
  slug: string;
  lang: LandingLang;
  qrHref: string | null;
  wadah: HTMLElement | null;
  kembaliKeQr: boolean;
  onTutup: () => void;
  onBerhasil: (kabar: KabarCheckpoint) => void;
}) {
  const t = TEKS[lang];
  const videoRef = useRef<HTMLVideoElement>(null);
  const tutupRef = useRef<HTMLButtonElement>(null);
  // Petunjuk saat kamera masih menyala (QR lain, kamera ditolak). Galat dari
  // server menjadi layar hasil merah, kamera berhenti sampai "Pindai lagi".
  const [petunjuk, setPetunjuk] = useState<{ judul: string | null; rinci: string } | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);
  const [mencatat, setMencatat] = useState(false);
  // Kamera berhenti setelah membaca satu QR checkpoint; "Pindai lagi" di layar
  // hasil merah menyalakannya lagi.
  // Naik satu tiap "Pindai lagi": kamera dinyalakan ulang.
  const [putaran, setPutaran] = useState(0);
  const sibukRef = useRef(false);
  const berhasilRef = useRef(onBerhasil);
  useEffect(() => { berhasilRef.current = onBerhasil; });

  // Escape menutup; fokus ke tombol tutup saat terbuka; halaman di belakang tidak bergulir.
  useEffect(() => {
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    tutupRef.current?.focus();
    // Fase tangkap dan preventDefault: di dalam lapisan QR, Escape hanya menutup
    // kamera, tidak ikut menutup dialog QR di belakangnya.
    const tombol = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onTutup();
    };
    window.addEventListener("keydown", tombol, true);
    return () => {
      document.body.style.overflow = lama;
      window.removeEventListener("keydown", tombol, true);
    };
  }, [onTutup]);

  useEffect(() => {
    let berhenti = false;
    let kontrol: { stop: () => void } | undefined;
    sibukRef.current = false;
    void (async () => {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      if (berhenti || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]), {
        delayBetweenScanAttempts: 150,
        delayBetweenScanSuccess: 300,
      });
      kontrol = await reader
        .decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          videoRef.current,
          (result) => {
            if (berhenti || sibukRef.current || !result) return;
            const qr = bacaQrCheckpoint(result.getText());
            if (!qr) {
              setPetunjuk({ judul: t.bukanQr, rinci: t.bukanQrRinci });
              return;
            }
            if (qr.slug !== null && qr.slug !== slug) {
              setPetunjuk({ judul: t.acaraLain, rinci: t.acaraLainRinci });
              return;
            }
            sibukRef.current = true;
            kontrol?.stop();
            setMencatat(true);
            setPetunjuk(null);
            void kirimQrCheckpoint(slug, qr.sesi, qr.kode, lang).then((hasil) => {
              if (berhenti) return;
              setMencatat(false);
              if (hasil.ok) berhasilRef.current(hasil.kabar);
              else setGagal(hasil.pesan);
            });
          },
        )
        .catch(() => {
          if (!berhenti) setPetunjuk({ judul: null, rinci: t.kameraGagal });
          return undefined;
        });
      if (berhenti) kontrol?.stop();
    })();
    return () => {
      berhenti = true;
      kontrol?.stop();
    };
  }, [putaran, slug, lang, t]);

  const lagi = () => { setGagal(null); setPetunjuk(null); setPutaran((n) => n + 1); };
  // Jalan keluar bila scan tidak bisa: dari layar QR cukup menutup kamera.
  const cadangan = kembaliKeQr ? { label: t.cadanganSingkat, onClick: onTutup } : qrHref ? { label: t.cadanganSingkat, href: qrHref } : null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t.judul} className="fixed inset-0 z-[110] flex flex-col bg-[#0B0F17] text-white">
      <div className="flex items-center justify-between px-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button ref={tutupRef} type="button" aria-label={t.tutup} onClick={onTutup} className="m3-state flex size-12 items-center justify-center rounded-full">
          <X size={24} aria-hidden />
        </button>
        <p className="text-[16px] font-semibold">{t.judul}</p>
        <span className="size-12" aria-hidden />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay muted playsInline aria-hidden />
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center pb-24">
          <div className="relative aspect-square w-[min(68vw,300px)]">
            {["left-0 top-0 rounded-tl-3xl border-l-4 border-t-4", "right-0 top-0 rounded-tr-3xl border-r-4 border-t-4", "bottom-0 left-0 rounded-bl-3xl border-b-4 border-l-4", "bottom-0 right-0 rounded-br-3xl border-b-4 border-r-4"].map((sudut) => (
              <i key={sudut} className={`absolute size-12 border-[#E8C968] ${sudut}`} />
            ))}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-16 text-center">
          {petunjuk ? (
            // Kotak kuning besar di atas gambar kamera: kameranya tetap membaca.
            <p role="alert" className="mx-auto flex max-w-md items-start gap-3 rounded-[18px] bg-[#F2B53A] px-4 py-3.5 text-left text-[15px] leading-[21px] text-[#241A00]">
              <WarningCircle size={24} weight="fill" aria-hidden className="shrink-0" />
              <span className="min-w-0">
                {petunjuk.judul ? <b className="block text-[17px] font-bold leading-[23px]">{petunjuk.judul}</b> : null}
                <span className={petunjuk.judul ? "mt-0.5 block" : "block font-semibold"}>{petunjuk.rinci}</span>
              </span>
            </p>
          ) : mencatat ? (
            <p role="status" className="text-[17px] font-semibold">{t.mencatat}</p>
          ) : (
            <>
              <p className="text-[17px] font-semibold">{t.arahkan}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-5 text-white/80">{t.catatan}</p>
            </>
          )}
        </div>
      </div>
      {kembaliKeQr ? (
        <div className="px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={onTutup} className="m3-state flex min-h-12 w-full items-center justify-center rounded-full border border-white/40 px-4 text-center text-[15px] font-semibold">
            {t.cadangan}
          </button>
        </div>
      ) : qrHref ? (
        <div className="px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          <a href={qrHref} className="m3-state flex min-h-12 items-center justify-center rounded-full border border-white/40 px-4 text-center text-[15px] font-semibold">
            {t.cadangan}
          </a>
        </div>
      ) : null}
      {gagal !== null ? (
        <LayarHasil lang={lang} gagal={gagal} utama={{ label: t.lagi, onClick: lagi }} kedua={cadangan} onTutup={onTutup} className="absolute inset-0 z-10" />
      ) : null}
    </div>,
    wadah ?? document.body,
  );
}
