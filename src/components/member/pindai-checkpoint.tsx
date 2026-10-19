"use client";

import { CheckCircle, Scan, WarningCircle, X } from "@phosphor-icons/react";
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
    bukanQr: "Ini bukan QR checkpoint. Arahkan ke QR di layar panitia.",
    acaraLain: "QR ini untuk acara lain.",
    koneksi: "Koneksi terputus. Coba pindai lagi.",
    lagi: "Pindai lagi",
    cadangan: "Tidak bisa? Tunjukkan QR kehadiran ke panitia",
    selesai: (judul: string) => `${judul} selesai`,
    sudah: (judul: string) => `${judul} sudah selesai sebelumnya`,
    rinci: (poin: number | null, done: number | null, total: number | null) =>
      [poin ? `+${poin} poin` : null, done != null && total != null ? `${done} dari ${total} checkpoint` : null].filter(Boolean).join(" · "),
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
    bukanQr: "This is not a checkpoint QR. Point at the QR on the organisers' screen.",
    acaraLain: "This QR is for another event.",
    koneksi: "Connection lost. Try scanning again.",
    lagi: "Scan again",
    cadangan: "Can't scan? Show the attendance QR to the organisers",
    selesai: (judul: string) => `${judul} done`,
    sudah: (judul: string) => `${judul} was already done`,
    rinci: (poin: number | null, done: number | null, total: number | null) =>
      [poin ? `+${poin} points` : null, done != null && total != null ? `${done} of ${total} checkpoints` : null].filter(Boolean).join(" · "),
    checkpoint: "Checkpoint",
  },
} as const;

type Jawaban = {
  status?: "recorded" | "already";
  steps?: { id: number; title: string; points: number | null }[];
  done?: number | null;
  total?: number | null;
  error?: { message?: string };
};

/** Kabar sesudah memindai: judul tebal dan satu baris rincian. */
export type KabarCheckpoint = { judul: string; rinci: string };

export function kabarDariJawaban(body: Jawaban, lang: LandingLang): KabarCheckpoint {
  const t = TEKS[lang];
  const judul = body.steps?.map((step) => step.title).join(", ") || t.checkpoint;
  const poin = body.status === "recorded" ? (body.steps ?? []).reduce((jumlah, step) => jumlah + (step.points ?? 0), 0) : 0;
  return {
    judul: body.status === "already" ? t.sudah(judul) : t.selesai(judul),
    rinci: t.rinci(poin || null, body.done ?? null, body.total ?? null),
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

/** Kabar hijau di atas layar selama 6 detik, seperti notifikasi pembayaran berhasil. */
function KabarBerhasil({ kabar, onTutup }: { kabar: KabarCheckpoint; onTutup: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onTutup, 6000);
    return () => window.clearTimeout(timer);
  }, [onTutup]);
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[max(16px,env(safe-area-inset-top))] z-[120] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#13321F] px-4 py-3.5 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
    >
      <CheckCircle size={32} weight="fill" aria-hidden className="shrink-0 text-[#3CCF7A]" />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{kabar.judul}</span>
        {kabar.rinci ? <span className="mt-0.5 block text-[14px] leading-5 text-white/80">{kabar.rinci}</span> : null}
      </span>
    </div>
  );
}

// Kabarnya dipasang di root sendiri, bukan di dalam kartu: sesudah router.refresh
// langkah berikutnya bisa langkah panitia, dan tombol kamera (beserta isinya) hilang.
let kabarAktif: { root: Root; wadah: HTMLDivElement } | null = null;

function tutupKabar() {
  if (!kabarAktif) return;
  kabarAktif.root.unmount();
  kabarAktif.wadah.remove();
  kabarAktif = null;
}

function tampilkanKabar(kabar: KabarCheckpoint) {
  tutupKabar();
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const root = createRoot(wadah);
  kabarAktif = { root, wadah };
  root.render(<KabarBerhasil kabar={kabar} onTutup={() => { if (kabarAktif?.root === root) tutupKabar(); }} />);
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
      <button ref={tombolRef} type="button" className={className} onClick={() => { tutupKabar(); setBuka(true); }}>
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
            tampilkanKabar(hasil);
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
  const [pesan, setPesan] = useState("");
  const [mencatat, setMencatat] = useState(false);
  // Kamera berhenti setelah membaca satu QR checkpoint; "Pindai lagi" menyalakannya.
  const [diam, setDiam] = useState(false);
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
              setPesan(t.bukanQr);
              return;
            }
            if (qr.slug !== null && qr.slug !== slug) {
              setPesan(t.acaraLain);
              return;
            }
            sibukRef.current = true;
            kontrol?.stop();
            setDiam(true);
            setMencatat(true);
            setPesan("");
            void kirimQrCheckpoint(slug, qr.sesi, qr.kode, lang).then((hasil) => {
              if (berhenti) return;
              setMencatat(false);
              if (hasil.ok) berhasilRef.current(hasil.kabar);
              else setPesan(hasil.pesan);
            });
          },
        )
        .catch(() => {
          if (!berhenti) setPesan(t.kameraGagal);
          return undefined;
        });
      if (berhenti) kontrol?.stop();
    })();
    return () => {
      berhenti = true;
      kontrol?.stop();
    };
  }, [putaran, slug, lang, t]);

  const berhenti = diam && !mencatat;

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
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-6 pt-16 text-center">
          {pesan ? (
            <p role="alert" className="mx-auto flex max-w-sm items-start gap-2 text-left text-[15px] font-medium leading-5 text-[#FFDAD6]">
              <WarningCircle size={20} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
              {pesan}
            </p>
          ) : mencatat ? (
            <p role="status" className="text-[17px] font-semibold">{t.mencatat}</p>
          ) : (
            <>
              <p className="text-[17px] font-semibold">{t.arahkan}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-5 text-white/80">{t.catatan}</p>
            </>
          )}
          {berhenti ? (
            <button
              type="button"
              onClick={() => { setPesan(""); setDiam(false); setPutaran((n) => n + 1); }}
              className="m3-state mx-auto mt-4 inline-flex min-h-12 items-center justify-center rounded-full bg-[#E8C968] px-6 text-[15px] font-semibold text-[#1F1A0B]"
            >
              {t.lagi}
            </button>
          ) : null}
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
    </div>,
    wadah ?? document.body,
  );
}
