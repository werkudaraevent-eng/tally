"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, WifiSlash, X } from "@phosphor-icons/react";
import { RegistrationCodeCard, buatGambarQr } from "@/components/registration-code-card";
import { QrHorizon } from "@/components/member/qr-horizon";
import { CINCIN_NAVY } from "@/components/landing/modern/cincin-horizon";
import { KonteksLapisanQr } from "@/components/member/qr-fokus";
import { PindaiCheckpoint } from "@/components/member/pindai-checkpoint";
import { CACHE_QR_LURING, halamanQrLuring, kunciQrLuring } from "@/lib/member/halaman-qr-luring";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Lapisan QR kehadiran portal Horizon (U-02). Tombol QR di portal tidak lagi
 * menunggu render server: QR dibuat dari kode yang sudah ada di halaman saat
 * portal dimuat, lalu tombol membuka lapisan ini seketika dan menambah
 * `?tab=qr` ke riwayat, jadi tombol Kembali menutupnya. Muat ulang tetap
 * membuka halaman QR server.
 *
 * Selama QR terbuka layar diminta tetap menyala (Screen Wake Lock, pola
 * pemindai staf), dan diam bila peramban menolak. Saat sinyal ada, portal
 * menyimpan halaman QR luring di Cache Storage dan memasang service worker
 * kecil (app/peserta-sw.js), supaya portal yang dibuka tanpa sinyal tetap
 * menampilkan QR. Klaim "tersimpan" hanya tampil bila keduanya berhasil.
 * Salinannya dihapus saat Keluar.
 */

export type TeksLapisanQr = {
  judul: string;
  tutup: string;
  petunjuk: string;
  petunjukCatatan: string;
  kecerahan: string;
  kode: string;
  simpan: string;
  tersimpan: string;
  /** Dengan `{waktu}`, mis. "Tersimpan {waktu} di ponsel ini" (teks, bukan fungsi: dikirim dari server). */
  tersimpanPada: string;
  layarMenyala: string;
  luring: string;
  luringCatatan: string;
  tampilkanQr: string;
  cobaLagi: string;
};

export type DataLapisanQr = {
  lang: LandingLang;
  kode: string;
  nama: string;
  sub: string | null;
  pil: string | null;
  /** Untuk gambar unduhan. */
  acara: string;
  jadwal: string | null;
  /** "24 Fly Beyond Limit · 6–8 Nov 2026" di bawah judul. */
  baris: string | null;
  zona: string;
  teks: TeksLapisanQr;
  /** Alamat skrip service worker dan lingkupnya (alamat portal). */
  luring: { sw: string; lingkup: string };
  /** Slug acara bila ada checkpoint scan mandiri: layar QR memberi tombol Pindai QR checkpoint. */
  pindai: string | null;
};

const langgananDaring = (berubah: () => void) => {
  window.addEventListener("online", berubah);
  window.addEventListener("offline", berubah);
  return () => {
    window.removeEventListener("online", berubah);
    window.removeEventListener("offline", berubah);
  };
};

/** Status sinyal; server dan render pertama menganggap daring. */
export function useDaring() {
  return useSyncExternalStore(langgananDaring, () => navigator.onLine, () => true);
}

type KunciLayar = { release: () => Promise<void>; addEventListener?: (jenis: "release", fn: () => void) => void };

/** Minta layar tetap menyala selama `aktif`; true hanya bila peramban mengabulkan. */
function useLayarMenyala(aktif: boolean) {
  const [menyala, setMenyala] = useState(false);
  useEffect(() => {
    if (!aktif) return;
    let kunci: KunciLayar | null = null;
    let lepas = false;
    const minta = async () => {
      const wl = (navigator as Navigator & { wakeLock?: { request: (jenis: "screen") => Promise<KunciLayar> } }).wakeLock;
      if (!wl || document.visibilityState !== "visible" || kunci) return;
      try {
        const baru = await wl.request("screen");
        if (lepas) {
          void baru.release().catch(() => {});
          return;
        }
        kunci = baru;
        setMenyala(true);
        baru.addEventListener?.("release", () => {
          if (kunci === baru) {
            kunci = null;
            setMenyala(false);
          }
        });
      } catch {
        // Ditolak (hemat baterai, iframe) atau tidak didukung: layar meredup seperti biasa.
        setMenyala(false);
      }
    };
    void minta();
    // Kunci dilepas peramban saat tab disembunyikan; minta lagi saat kembali.
    const lihat = () => {
      if (document.visibilityState === "visible") void minta();
    };
    document.addEventListener("visibilitychange", lihat);
    return () => {
      lepas = true;
      document.removeEventListener("visibilitychange", lihat);
      void kunci?.release().catch(() => {});
      kunci = null;
      setMenyala(false);
    };
  }, [aktif]);
  return menyala;
}

function jamTersimpan(waktu: Date, zona: string, lang: LandingLang) {
  try {
    const bagian = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(waktu);
    const ambil = (jenis: string) => bagian.find((item) => item.type === jenis)?.value.replace(/\.$/, "") ?? "";
    const pemisah = lang === "en" ? ":" : ".";
    return `${ambil("weekday")}, ${ambil("day")} ${ambil("month")} ${ambil("hour")}${pemisah}${ambil("minute")}`;
  } catch {
    return waktu.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function PenyediaQr({ data, children }: { data: DataLapisanQr; children: ReactNode }) {
  const params = useSearchParams();
  const terbuka = params.get("tab") === "qr";
  const daring = useDaring();
  const dialog = useRef<HTMLDialogElement | null>(null);
  // Juga sebagai state: layar kamera Pindai dipasang di dalam dialog (lapisan atas).
  const [wadah, setWadah] = useState<HTMLDialogElement | null>(null);
  const pasangDialog = useCallback((el: HTMLDialogElement | null) => {
    dialog.current = el;
    setWadah(el);
  }, []);
  const router = useRouter();
  const pemicu = useRef<HTMLElement | null>(null);
  const qr = useQrSiap(data.kode);
  const tersimpan = useSalinanLuring(data, qr);
  const menyala = useLayarMenyala(terbuka);
  const t = data.teks;

  // Dialog mengikuti alamat: `?tab=qr` (dari pushState) membuka, Kembali menutup.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (terbuka && !el.open) {
      el.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!terbuka && el.open) {
      el.close();
    }
    if (!terbuka) {
      document.documentElement.style.overflow = "";
      const tombol = pemicu.current;
      pemicu.current = null;
      if (tombol?.isConnected) tombol.focus();
    }
  }, [terbuka]);

  // Portal dilepas saat dialog masih terbuka (mis. Kembali ke halaman QR server):
  // gulir halaman dikembalikan, kalau tidak halaman berikutnya tidak bisa digulir.
  useEffect(
    () => () => {
      document.documentElement.style.overflow = "";
    },
    [],
  );

  const tutup = useCallback(() => {
    // Lapisan dibuka dengan pushState, jadi entri sebelumnya adalah tab asal.
    window.history.back();
  }, []);

  const buka = useCallback((href: string, el: HTMLElement) => {
    pemicu.current = el;
    window.history.pushState(null, "", href);
  }, []);
  const konteks = useMemo(() => ({ buka }), [buka]);

  // Checkpoint tercatat dari layar QR: tutup lapisannya, lalu segarkan kartu
  // checkpoint sesudah alamatnya kembali (bukan saat `?tab=qr` masih terpasang,
  // karena itu merender halaman QR server).
  const sesudahPindai = useCallback(() => {
    window.addEventListener("popstate", () => window.setTimeout(() => router.refresh(), 0), { once: true });
    tutup();
  }, [router, tutup]);


  return (
    <KonteksLapisanQr.Provider value={konteks}>
      {children}
      {!daring ? (
        // Pesan luring untuk tamu, di atas bilah bawah (spanduk kasir global disembunyikan di portal).
        <div role="status" className="fixed inset-x-0 bottom-[calc(100px+env(safe-area-inset-bottom))] z-20 px-4 lg:bottom-6">
          <div className="mx-auto flex max-w-[560px] items-center gap-3 rounded-[16px] bg-[var(--chip-aksen)] px-4 py-2 text-[14px] leading-5 text-[var(--on-chip-aksen)] shadow-[0_4px_16px_rgb(16_30_56/0.18)]">
            <WifiSlash size={20} weight="bold" aria-hidden className="shrink-0" />
            <p className="min-w-0 flex-1">
              <b>{t.luring}</b> {t.luringCatatan}
            </p>
            <button
              type="button"
              onClick={(event) => buka(`${data.luring.lingkup}?tab=qr`, event.currentTarget)}
              className="m3-state inline-flex min-h-12 shrink-0 items-center rounded-full px-3 font-bold underline underline-offset-2"
            >
              {t.tampilkanQr}
            </button>
          </div>
        </div>
      ) : null}
      <dialog
        ref={pasangDialog}
        aria-labelledby="lapisan-qr-judul"
        onCancel={(event) => {
          // Escape: tutup lewat riwayat supaya alamat ikut kembali.
          event.preventDefault();
          tutup();
        }}
        onClose={() => {
          // Ditutup peramban tanpa lewat riwayat (Escape beruntun): alamatnya ikut kembali.
          if (new URLSearchParams(window.location.search).get("tab") === "qr") tutup();
        }}
        className={`m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-[var(--hz-navy)] p-0 text-white backdrop:bg-[var(--hz-navy)] ${CINCIN_NAVY}`}
      >
        {terbuka ? (
          <QrHorizon
            judul={t.judul}
            judulId="lapisan-qr-judul"
            judulTag="h2"
            baris={data.baris}
            tutup={
              <button type="button" onClick={tutup} aria-label={t.tutup} className="m3-state flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10">
                <X size={18} weight="bold" aria-hidden />
              </button>
            }
            luring={<PesanLuringQr teks={t} />}
            nama={data.nama}
            sub={data.sub}
            pil={data.pil}
            kartuKode={
              <RegistrationCodeCard code={data.kode} eventName={data.acara} personName={data.nama} schedule={data.jadwal} lang={data.lang} horizon qrSiap={qr} teksHorizon={{ kode: t.kode, simpan: t.simpan }} />
            }
            petunjuk={t.petunjuk}
            petunjukCatatan={t.petunjukCatatan}
            status={<BarisStatusQr tersimpan={tersimpan} menyala={menyala} daring={daring} data={data} />}
            kecerahan={t.kecerahan}
            aksi={data.pindai ? <TombolPindaiQr slug={data.pindai} lang={data.lang} wadah={wadah} sesudah={sesudahPindai} /> : null}
          />
        ) : null}
      </dialog>
    </KonteksLapisanQr.Provider>
  );
}

/** Gambar QR dibuat sekali saat halaman dimuat: tanpa sinyal paket `qrcode` tidak bisa diunduh lagi. */
function useQrSiap(kode: string) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let batal = false;
    buatGambarQr(kode)
      .then((src) => {
        if (!batal) setQr(src);
      })
      .catch(() => {});
    return () => {
      batal = true;
    };
  }, [kode]);
  return qr;
}

/**
 * Salinan luring: halaman QR utuh di Cache Storage dan service worker
 * penyajinya. Waktu tersimpan hanya bila keduanya berhasil, jadi klaim
 * "bisa dibuka tanpa sinyal" tidak pernah tampil tanpa dasar.
 */
function useSalinanLuring(data: DataLapisanQr, qr: string | null) {
  const [tersimpan, setTersimpan] = useState<Date | null>(null);
  const t = data.teks;
  const isi = useMemo(
    () => ({ lang: data.lang, judul: t.judul, baris: data.baris, nama: data.nama, sub: data.sub, pil: data.pil, kode: data.kode, kodeLabel: t.kode, petunjuk: t.petunjuk, petunjukCatatan: t.petunjukCatatan, kecerahan: t.kecerahan, luring: t.luring, luringCatatan: t.luringCatatan, cobaLagi: t.cobaLagi, portal: data.luring.lingkup }),
    [data, t],
  );
  useEffect(() => {
    if (!qr) return;
    let batal = false;
    void (async () => {
      try {
        if (!("caches" in window) || !("serviceWorker" in navigator)) return;
        const kunci = kunciQrLuring(location.origin, data.luring.lingkup);
        const cache = await caches.open(CACHE_QR_LURING);
        if (navigator.onLine) {
          const waktu = new Date();
          const html = halamanQrLuring({ ...isi, qr, tersimpan: t.tersimpanPada.replace("{waktu}", jamTersimpan(waktu, data.zona, data.lang)) });
          await cache.put(kunci, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Tally-Tersimpan": waktu.toISOString() } }));
          await navigator.serviceWorker.register(data.luring.sw, { scope: data.luring.lingkup });
          if (!batal) setTersimpan(waktu);
        } else {
          const lama = await cache.match(kunci);
          const waktu = lama?.headers.get("X-Tally-Tersimpan");
          const daftar = await navigator.serviceWorker.getRegistration(data.luring.lingkup);
          if (!batal && waktu && daftar) setTersimpan(new Date(waktu));
        }
      } catch {
        // Penyimpanan atau service worker ditolak (mode pribadi): tanpa klaim tersimpan.
      }
    })();
    return () => {
      batal = true;
    };
  }, [qr, isi, data.luring, data.zona, data.lang, t]);
  return tersimpan;
}

/** Baris status di bawah petunjuk QR: tersimpan di ponsel, dan layar tetap menyala. */
function BarisStatusQr({ tersimpan, menyala, daring, data }: { tersimpan: Date | null; menyala: boolean; daring: boolean; data: DataLapisanQr }) {
  if (!tersimpan && !menyala) return null;
  const t = data.teks;
  return (
    <>
      {tersimpan ? (
        <p className="flex items-center gap-2 font-semibold text-white">
          <CheckCircle size={20} weight="fill" aria-hidden className="shrink-0 text-[var(--hz-emas)]" />
          {daring ? t.tersimpan : t.tersimpanPada.replace("{waktu}", jamTersimpan(tersimpan, data.zona, data.lang))}
        </p>
      ) : null}
      {menyala ? <p>{t.layarMenyala}</p> : null}
    </>
  );
}

/** Pesan luring di layar QR, hanya selama tanpa sinyal. */
export function PesanLuringQr({ teks }: { teks: Pick<TeksLapisanQr, "luring" | "luringCatatan"> }) {
  const daring = useDaring();
  if (daring) return null;
  return (
    <p role="status" className="mt-2 flex items-start gap-3 rounded-[16px] bg-[var(--chip-aksen)] px-4 py-3 text-[15px] leading-[22px] text-[var(--on-chip-aksen)]">
      <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-current" />
      <span>
        <b>{teks.luring}</b> {teks.luringCatatan}
      </span>
    </p>
  );
}

/**
 * Status di halaman QR server (muat ulang atau tautan langsung `?tab=qr`):
 * layar tetap menyala dan salinan luring juga dibuat dari sini.
 */
export function StatusQrHalaman({ data }: { data: DataLapisanQr }) {
  const qr = useQrSiap(data.kode);
  const tersimpan = useSalinanLuring(data, qr);
  const menyala = useLayarMenyala(true);
  const daring = useDaring();
  return <BarisStatusQr tersimpan={tersimpan} menyala={menyala} daring={daring} data={data} />;
}

/**
 * "Pindai QR checkpoint" di layar QR kehadiran: dua arah seperti layar QRIS
 * e-wallet. Kamera terbuka di atas QR; "Tidak bisa?" menutupnya kembali ke QR.
 * Sesudah tercatat, lapisan QR ditutup (halaman QR server: kembali ke portal)
 * supaya kabar hijau dan kartu checkpoint yang sudah diperbarui terlihat.
 */
export function TombolPindaiQr({
  slug,
  lang,
  wadah,
  sesudah,
  kePortal,
}: {
  slug: string;
  lang: LandingLang;
  wadah?: HTMLElement | null;
  sesudah?: () => void;
  /** Halaman QR server (muat ulang): sesudah tercatat kembali ke portal, tempat kartunya. */
  kePortal?: string;
}) {
  const router = useRouter();
  return (
    <PindaiCheckpoint
      slug={slug}
      lang={lang}
      qrHref={null}
      kembaliKeQr
      wadah={wadah}
      sesudah={sesudah ?? (kePortal ? () => router.replace(kePortal) : undefined)}
      className="m3-state inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--hz-emas)] px-5 text-[15px] font-semibold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)]"
    />
  );
}
