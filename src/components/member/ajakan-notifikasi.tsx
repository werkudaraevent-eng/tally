"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { BellRinging, BellSlash, Bed, CalendarCheck, CheckCircle, Export, Megaphone, PlusSquare, ShieldCheck } from "@phosphor-icons/react";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Ajakan menyalakan notifikasi HP (Participant area > Phone notifications).
 *
 * Polanya "minta izin dengan konteks" (web.dev Permission UX, Apple HIG
 * "Requesting permission", Airbnb dan Booking.com): peramban tidak pernah
 * ditanya begitu halaman dibuka. Peserta lebih dulu melihat lembar yang
 * menjelaskan apa yang akan mereka terima, dengan contoh notifikasinya, dan
 * jendela izin peramban baru muncul setelah ia mengetuk "Aktifkan notifikasi".
 * Yang menolak di lembar ini tidak pernah melihat jendela peramban, jadi
 * izinnya tidak terkunci "diblokir" dan bisa diajak lagi nanti.
 *
 * Keadaan per perangkat:
 * - tanya      : peramban bisa, belum diizinkan -> lembar ajakan.
 * - pasang     : iPhone/iPad di Safari biasa. Apple hanya mengizinkan notifikasi
 *                dari aplikasi web di Layar Utama (iOS 16.4+), jadi lembarnya
 *                berisi 3 langkah memasang, bukan tombol izin yang pasti gagal.
 * - aktif      : diizinkan dan terdaftar di server.
 * - diblokir   : izin ditolak di peramban; hanya pengaturan peramban yang bisa
 *                membukanya, jadi lembarnya berisi caranya.
 * - tidakBisa  : peramban tanpa Web Push (iOS lama, peramban di dalam aplikasi).
 *
 * Lembar terbuka sendiri sekali setelah masuk, menunggu pop-up pengumuman
 * ditutup lebih dulu. "Nanti saja" menunda sehari; setelah dua kali ditunda
 * lembar tidak terbuka sendiri lagi. Peserta tetap bisa membukanya kapan saja
 * dari baris "Notifikasi HP" (lonceng, tab Pengumuman), lewat bukaNotifikasi().
 */

export type DataNotifikasi = {
  slug: string;
  /** Service worker portal dan lingkupnya, sama dengan QR luring (app/peserta-sw.js). */
  sw: string;
  lingkup: string;
  /** Alamat portal yang dibuka notifikasi uji. */
  portal: string;
  /** Ikon acara 180 px (lib/push/manifest.ts), untuk contoh notifikasi dan Layar Utama. */
  ikon: string;
  namaAcara: string;
  namaPendek: string;
  /** Kamar dan kendaraan tampil di portal: disebut di daftar manfaat. */
  logistik: boolean;
};

export type StatusNotifikasi = "memuat" | "tanya" | "pasang" | "aktif" | "diblokir" | "tidakBisa" | "mati";

// ---- Status bersama: satu ajakan per halaman, banyak baris yang membacanya ----

let statusSaatIni: StatusNotifikasi = "memuat";
const pendengar = new Set<() => void>();
function setStatusBersama(status: StatusNotifikasi) {
  statusSaatIni = status;
  for (const satu of pendengar) satu();
}
function langgan(fn: () => void) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}
export function useStatusNotifikasi(): StatusNotifikasi {
  return useSyncExternalStore(langgan, () => statusSaatIni, () => "memuat");
}

const BUKA = "tally:buka-notifikasi";
/** Membuka lembar notifikasi dari mana saja di halaman (lonceng, tab Pengumuman). */
export function bukaNotifikasi() {
  window.dispatchEvent(new Event(BUKA));
}

// ---- Deteksi perangkat ----

function iPhoneAtauIPad(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Versi iOS dari user agent, atau null. iPadOS "desktop" tidak membawanya. */
function versiIos(): number | null {
  const m = /OS (\d+)[._](\d+)/.exec(navigator.userAgent);
  return m && /iPhone|iPad|iPod/.test(navigator.userAgent) ? Number(m[1]) + Number(m[2]) / 100 : null;
}

function dariLayarUtama(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function adaWebPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64KeUint8(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const mentah = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const hasil = new Uint8Array(new ArrayBuffer(mentah.length));
  for (let i = 0; i < mentah.length; i++) hasil[i] = mentah.charCodeAt(i);
  return hasil;
}

// ---- Penundaan "Nanti saja" ----

const KUNCI_NANTI = "tally:notif-nanti:";
const SEHARI = 24 * 60 * 60 * 1000;

function bacaNanti(slug: string): { kali: number; waktu: number } {
  try {
    const isi = JSON.parse(window.localStorage.getItem(KUNCI_NANTI + slug) ?? "null") as { kali?: number; waktu?: number } | null;
    return { kali: isi?.kali ?? 0, waktu: isi?.waktu ?? 0 };
  } catch {
    return { kali: 0, waktu: 0 };
  }
}

function catatNanti(slug: string) {
  try {
    const lama = bacaNanti(slug);
    window.localStorage.setItem(KUNCI_NANTI + slug, JSON.stringify({ kali: lama.kali + 1, waktu: Date.now() }));
  } catch {
    // Mode privat: cukup tertutup untuk halaman ini.
  }
}

function bolehBukaSendiri(slug: string): boolean {
  const { kali, waktu } = bacaNanti(slug);
  if (kali === 0) return true;
  if (kali === 1) return Date.now() - waktu > SEHARI;
  return false;
}

// ---- Teks ----

const TEKS = {
  id: {
    contoh: "Contoh",
    sekarang: "sekarang",
    contohJudul: "Jadwal berubah",
    contohIsi: "Makan malam dimulai pukul 19.30 di Ballroom.",
    judulTanya: "Jangan lewatkan kabar dari panitia",
    pengantarTanya: "Nyalakan notifikasi supaya kabar penting langsung muncul di HP, walau halaman ini sedang tertutup.",
    manfaatJadwal: "Perubahan jadwal dan titik kumpul",
    manfaatLogistik: "Nomor kamar dan kendaraan",
    manfaatPengumuman: "Pengumuman penting selama acara",
    jaminan: (nama: string) => `Hanya dari panitia ${nama}. Berhenti setelah acara selesai, dan bisa dimatikan kapan saja.`,
    aktifkan: "Aktifkan notifikasi",
    menunggu: "Pilih Izinkan di jendela yang muncul",
    nanti: "Nanti saja",
    judulAktif: "Notifikasi sudah aktif",
    isiAktif: "Kami baru mengirim satu notifikasi uji ke perangkat ini. Kalau tidak muncul, periksa mode Jangan Ganggu atau Fokus.",
    isiAktifLama: "Kabar dari panitia akan muncul di perangkat ini.",
    kirimUji: "Kirim notifikasi uji",
    ujiTerkirim: "Notifikasi uji terkirim",
    matikan: "Matikan di perangkat ini",
    selesai: "Selesai",
    judulPasang: "Pasang di iPhone dulu, lalu aktifkan notifikasi",
    pengantarPasang: "iPhone hanya menampilkan notifikasi dari halaman yang ada di Layar Utama. Tanpa App Store, cukup 3 langkah.",
    langkah1: "Ketuk tombol Bagikan di bilah Safari",
    langkah2: "Pilih Tambah ke Layar Utama, lalu Tambah",
    langkah3: (nama: string) => `Buka ikon ${nama} dari Layar Utama, masuk, lalu ketuk Aktifkan notifikasi`,
    dariWhatsapp: "Dibuka dari WhatsApp atau Instagram? Buka dulu di Safari lewat menu di pojok layar.",
    pratinjauIkon: "Ikonnya di Layar Utama",
    mengerti: "Mengerti",
    judulBlokir: "Notifikasi diblokir di peramban ini",
    isiBlokir: "Izin notifikasi pernah ditolak, jadi hanya pengaturan peramban yang bisa membukanya lagi.",
    caraAndroid: "Android (Chrome): ketuk ikon di kiri alamat situs, pilih Izin, lalu nyalakan Notifikasi.",
    caraIos: (nama: string) => `iPhone: buka Pengaturan, Notifikasi, pilih ${nama}, lalu nyalakan Izinkan Notifikasi.`,
    caraDesktop: "Laptop: klik ikon di kiri alamat situs, lalu ubah Notifikasi menjadi Izinkan.",
    tetapLonceng: "Sementara itu, semua pengumuman tetap ada di halaman ini.",
    judulTidakBisa: "Peramban ini belum bisa menerima notifikasi",
    isiTidakBisa: "Semua pengumuman tetap ada di halaman ini. Untuk notifikasi, buka halaman ini di Chrome (Android) atau Safari (iPhone).",
    isiIosLama: "Notifikasi butuh iOS 16.4 atau lebih baru. Perbarui iPhone di Pengaturan, Umum, Pembaruan Perangkat Lunak.",
    tutup: "Tutup",
    gagal: "Notifikasi belum aktif. Periksa sinyal, lalu coba lagi.",
    cobaLagi: "Coba lagi",
  },
  en: {
    contoh: "Example",
    sekarang: "now",
    contohJudul: "Schedule change",
    contohIsi: "Dinner now starts at 7.30 pm in the Ballroom.",
    judulTanya: "Don't miss updates from the organisers",
    pengantarTanya: "Turn on notifications so important updates reach your phone, even when this page is closed.",
    manfaatJadwal: "Schedule and meeting point changes",
    manfaatLogistik: "Room numbers and transport",
    manfaatPengumuman: "Important announcements during the event",
    jaminan: (nama: string) => `Only from the ${nama} organisers. They stop after the event, and you can turn them off any time.`,
    aktifkan: "Turn on notifications",
    menunggu: "Choose Allow in the window that opens",
    nanti: "Not now",
    judulAktif: "Notifications are on",
    isiAktif: "We just sent a test notification to this device. If it didn't show, check Do Not Disturb or Focus.",
    isiAktifLama: "Updates from the organisers will show on this device.",
    kirimUji: "Send a test notification",
    ujiTerkirim: "Test notification sent",
    matikan: "Turn off on this device",
    selesai: "Done",
    judulPasang: "Add to your iPhone first, then turn on notifications",
    pengantarPasang: "iPhone only shows notifications from pages on the Home Screen. No App Store needed, just 3 steps.",
    langkah1: "Tap the Share button in the Safari bar",
    langkah2: "Choose Add to Home Screen, then Add",
    langkah3: (nama: string) => `Open ${nama} from your Home Screen, sign in, then tap Turn on notifications`,
    dariWhatsapp: "Opened from WhatsApp or Instagram? Open it in Safari first from the menu in the corner.",
    pratinjauIkon: "The icon on your Home Screen",
    mengerti: "Got it",
    judulBlokir: "Notifications are blocked in this browser",
    isiBlokir: "Notifications were declined before, so only the browser settings can turn them back on.",
    caraAndroid: "Android (Chrome): tap the icon left of the site address, choose Permissions, then turn on Notifications.",
    caraIos: (nama: string) => `iPhone: open Settings, Notifications, choose ${nama}, then turn on Allow Notifications.`,
    caraDesktop: "Laptop: click the icon left of the site address, then set Notifications to Allow.",
    tetapLonceng: "Meanwhile, every announcement stays on this page.",
    judulTidakBisa: "This browser can't receive notifications yet",
    isiTidakBisa: "Every announcement stays on this page. For notifications, open this page in Chrome (Android) or Safari (iPhone).",
    isiIosLama: "Notifications need iOS 16.4 or later. Update your iPhone in Settings, General, Software Update.",
    tutup: "Close",
    gagal: "Notifications aren't on yet. Check your connection and try again.",
    cobaLagi: "Try again",
  },
} as const;

// ---- Komponen ----

type Lembar = "tanya" | "pasang" | "aktif" | "diblokir" | "tidakBisa";

export function AjakanNotifikasi({ data, lang }: { data: DataNotifikasi; lang: LandingLang }) {
  const t = TEKS[lang === "en" ? "en" : "id"];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const judulId = useId();
  const [status, setStatus] = useState<StatusNotifikasi>("memuat");
  const [lembar, setLembar] = useState<Lembar | null>(null);
  const [baruAktif, setBaruAktif] = useState(false);
  const [sibuk, setSibuk] = useState<null | "izin" | "uji" | "matikan">(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ujiTerkirim, setUjiTerkirim] = useState(false);
  const [iosLama, setIosLama] = useState(false);
  const kunciRef = useRef<string | null>(null);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const api = `/e/${encodeURIComponent(data.slug)}/api/peserta/notifikasi`;

  const ubahStatus = useCallback((baru: StatusNotifikasi) => {
    setStatus(baru);
    setStatusBersama(baru);
  }, []);

  // Keadaan awal perangkat ini, setelah hidrasi.
  useEffect(() => {
    let batal = false;
    void (async () => {
      if (iPhoneAtauIPad() && !dariLayarUtama()) {
        const versi = versiIos();
        if (versi !== null && versi < 16.04) {
          setIosLama(true);
          return ubahStatus("tidakBisa");
        }
        return ubahStatus("pasang");
      }
      if (!adaWebPush()) return ubahStatus("tidakBisa");
      try {
        // Daftarkan service worker lebih dulu, supaya ketukan "Aktifkan" langsung
        // memanggil subscribe() di dalam gestur (Safari menolak bila tidak).
        const reg = await navigator.serviceWorker.register(data.sw, { scope: data.lingkup });
        regRef.current = reg;
        const langganan = await reg.pushManager.getSubscription();
        const respon = await fetch(`${api}${langganan ? `?endpoint=${encodeURIComponent(langganan.endpoint)}` : ""}`, { cache: "no-store" });
        if (!respon.ok) return ubahStatus("mati"); // saklar mati atau migrasi belum jalan
        const isi = (await respon.json()) as { publicKey: string; terdaftar: boolean };
        kunciRef.current = isi.publicKey;
        if (batal) return;
        if (Notification.permission === "denied") return ubahStatus("diblokir");
        if (Notification.permission === "granted" && langganan) {
          // Izin ada tapi server belum tahu (misal setelah pindah akun): daftarkan ulang diam-diam.
          if (!isi.terdaftar) await simpan(langganan);
          return ubahStatus("aktif");
        }
        ubahStatus("tanya");
      } catch {
        ubahStatus("tidakBisa");
      }
    })();
    return () => {
      batal = true;
    };
    // simpan stabil (bergantung api saja)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.sw, data.lingkup, api, ubahStatus]);

  async function simpan(langganan: PushSubscription) {
    const json = langganan.toJSON();
    const respon = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
    if (!respon.ok) throw new Error("simpan");
  }

  const buka = useCallback(
    (paksa: boolean) => {
      const s = statusSaatIni;
      if (s === "memuat" || s === "mati") return;
      if (!paksa && !(s === "tanya" || s === "pasang")) return;
      setGalat(null);
      setUjiTerkirim(false);
      setBaruAktif(false);
      setLembar(s === "aktif" ? "aktif" : s === "diblokir" ? "diblokir" : s === "tidakBisa" ? "tidakBisa" : s);
    },
    [],
  );

  // Terbuka sendiri sekali setelah masuk, setelah pop-up pengumuman ditutup.
  useEffect(() => {
    if (status !== "tanya" && status !== "pasang") return;
    if (!bolehBukaSendiri(data.slug)) return;
    let percobaan = 0;
    const jam = window.setInterval(() => {
      percobaan += 1;
      if (document.querySelector("dialog[open]")) {
        if (percobaan > 120) window.clearInterval(jam);
        return;
      }
      window.clearInterval(jam);
      buka(false);
    }, 1500);
    return () => window.clearInterval(jam);
  }, [status, data.slug, buka]);

  // Dibuka dari baris "Notifikasi HP".
  useEffect(() => {
    const dengar = () => buka(true);
    window.addEventListener(BUKA, dengar);
    return () => window.removeEventListener(BUKA, dengar);
  }, [buka]);

  const terbuka = lembar !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!terbuka || !dialog || dialog.open) return;
    dialog.showModal();
    const gulir = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = gulir;
    };
  }, [terbuka]);

  // Fokus ke judul, bukan ke tombol: pembaca layar membaca judulnya lebih dulu,
  // tombol utama tidak bercincin fokus saat lembar muncul, dan pindah keadaan
  // (misal ke "aktif") tidak meninggalkan fokus di tombol yang sudah hilang.
  useEffect(() => {
    if (lembar) dialogRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [lembar]);

  function tutup(nanti: boolean) {
    if (nanti) catatNanti(data.slug);
    dialogRef.current?.close();
    setLembar(null);
  }

  async function kirimUji(endpoint: string) {
    const respon = await fetch(`${api}/uji`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, portal: data.portal, lang }),
    });
    return respon.ok;
  }

  // HARUS dipanggil langsung dari ketukan: subscribe() memunculkan jendela izin.
  async function aktifkan() {
    const reg = regRef.current;
    const kunci = kunciRef.current;
    if (!reg || !kunci) return setGalat(t.gagal);
    setSibuk("izin");
    setGalat(null);
    try {
      const langganan = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64KeUint8(kunci) });
      await simpan(langganan);
      ubahStatus("aktif");
      // "Kami baru mengirim notifikasi uji" hanya bila memang terkirim; bila
      // gagal, lembar aktif menawarkan tombol Kirim notifikasi uji.
      const terkirim = await kirimUji(langganan.endpoint).catch(() => false);
      setBaruAktif(terkirim);
      setLembar("aktif");
    } catch {
      if (Notification.permission === "denied") {
        ubahStatus("diblokir");
        setLembar("diblokir");
      } else if (Notification.permission === "granted") {
        setGalat(t.gagal);
      }
      // "default": jendela izin ditutup tanpa memilih. Lembar tetap, tanpa galat.
    } finally {
      setSibuk(null);
    }
  }

  async function ujiLagi() {
    const langganan = await regRef.current?.pushManager.getSubscription();
    if (!langganan) return;
    setSibuk("uji");
    setUjiTerkirim(false);
    setGalat(null);
    const ok = await kirimUji(langganan.endpoint).catch(() => false);
    setSibuk(null);
    if (ok) setUjiTerkirim(true);
    else setGalat(t.gagal);
  }

  async function matikan() {
    setSibuk("matikan");
    try {
      const langganan = await regRef.current?.pushManager.getSubscription();
      if (langganan) {
        await fetch(api, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: langganan.endpoint }) }).catch(() => null);
        await langganan.unsubscribe().catch(() => false);
      }
      ubahStatus("tanya");
      tutup(false);
    } finally {
      setSibuk(null);
    }
  }

  if (!lembar) return null;
  const ios = typeof navigator !== "undefined" && iPhoneAtauIPad();
  const tombolUtama =
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--reg-primary,#1a56db)] px-6 text-[16px] font-semibold text-[var(--reg-on-primary,#fff)] disabled:opacity-60";
  const tombolTeks =
    "inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-[16px] font-semibold text-[var(--reg-primary,#1a56db)] disabled:opacity-60";
  const tinta = "text-[var(--reg-on-surface-variant,#46464f)]";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={judulId}
      lang={lang === "en" ? "en" : "id"}
      onCancel={(event) => {
        event.preventDefault();
        tutup(lembar === "tanya" || lembar === "pasang");
      }}
      // Ponsel: lembar bawah M3 (menempel di bawah, sudut atas 28). Layar lebar: dialog di tengah.
      className="mx-auto mb-0 mt-auto w-full max-w-[480px] overflow-hidden rounded-t-[28px] bg-[var(--reg-surface,#fff)] p-0 text-[var(--reg-on-surface,#1b1b1f)] shadow-xl backdrop:bg-black/50 sm:m-auto sm:w-[calc(100%-32px)] sm:rounded-[28px]"
    >
      <div className="flex max-h-[calc(100dvh-24px)] flex-col overflow-y-auto overscroll-contain px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3 sm:pb-6 sm:pt-6">
        {/* Pegangan lembar bawah M3 (hiasan; Esc dan tombol yang menutup). */}
        <span aria-hidden className="mx-auto mb-4 block h-1 w-8 shrink-0 rounded-full bg-[var(--reg-outline-variant,#c7c6d0)] sm:hidden" />

        {lembar === "tanya" ? (
          <>
            <ContohNotifikasi data={data} t={t} />
            <h2 id={judulId} tabIndex={-1} style={{ outline: "none", boxShadow: "none" }} className="mt-6 text-[24px] font-bold leading-8 [font-family:var(--landing-heading)]">
              {t.judulTanya}
            </h2>
            <p className={`mt-2 text-[16px] leading-6 ${tinta}`}>{t.pengantarTanya}</p>
            <ul className="mt-5 flex flex-col gap-3 text-[16px] leading-6">
              <Manfaat ikon={<CalendarCheck size={24} aria-hidden />} teks={t.manfaatJadwal} />
              {data.logistik ? <Manfaat ikon={<Bed size={24} aria-hidden />} teks={t.manfaatLogistik} /> : null}
              <Manfaat ikon={<Megaphone size={24} aria-hidden />} teks={t.manfaatPengumuman} />
            </ul>
            <p className={`mt-5 flex gap-2 text-[14px] leading-5 ${tinta}`}>
              <ShieldCheck size={20} aria-hidden className="shrink-0" />
              {t.jaminan(data.namaAcara)}
            </p>
            {galat ? <p role="alert" className="mt-4 text-[14px] font-semibold leading-5 text-[var(--reg-error,#b3261e)]">{galat}</p> : null}
            <div className="mt-6 flex flex-col gap-1">
              <button type="button" onClick={() => void aktifkan()} disabled={sibuk !== null} className={tombolUtama}>
                <BellRinging size={20} aria-hidden />
                {galat ? t.cobaLagi : t.aktifkan}
              </button>
              {sibuk === "izin" ? (
                <p aria-live="polite" className={`py-3 text-center text-[14px] leading-5 ${tinta}`}>{t.menunggu}</p>
              ) : (
                <button type="button" onClick={() => tutup(true)} className={tombolTeks}>
                  {t.nanti}
                </button>
              )}
            </div>
          </>
        ) : null}

        {lembar === "pasang" ? (
          <>
            <h2 id={judulId} tabIndex={-1} style={{ outline: "none", boxShadow: "none" }} className="text-[24px] font-bold leading-8 [font-family:var(--landing-heading)]">
              {t.judulPasang}
            </h2>
            <p className={`mt-2 text-[16px] leading-6 ${tinta}`}>{t.pengantarPasang}</p>
            <ol className="mt-5 flex flex-col gap-4 text-[16px] leading-6">
              <Langkah n={1} ikon={<Export size={24} aria-hidden />} teks={t.langkah1} />
              <Langkah n={2} ikon={<PlusSquare size={24} aria-hidden />} teks={t.langkah2} />
              <Langkah n={3} ikon={<img src={data.ikon} alt="" width={24} height={24} className="size-6 rounded-[6px]" />} teks={t.langkah3(data.namaPendek)} />
            </ol>
            <figure className="mt-5 flex items-center gap-3 rounded-2xl bg-[var(--reg-surface-container,#f3f3f7)] p-3">
              <img src={data.ikon} alt="" width={56} height={56} className="size-14 rounded-[14px]" />
              <figcaption className="min-w-0">
                <span className={`block text-[14px] leading-5 ${tinta}`}>{t.pratinjauIkon}</span>
                <span className="block truncate text-[16px] font-semibold leading-6">{data.namaPendek}</span>
              </figcaption>
            </figure>
            <p className={`mt-4 text-[14px] leading-5 ${tinta}`}>{t.dariWhatsapp}</p>
            <div className="mt-6 flex flex-col gap-1">
              <button type="button" onClick={() => tutup(true)} className={tombolUtama}>
                {t.mengerti}
              </button>
            </div>
          </>
        ) : null}

        {lembar === "aktif" ? (
          <>
            <CheckCircle size={48} weight="fill" aria-hidden className="text-[var(--reg-primary,#1a56db)]" />
            <h2 id={judulId} tabIndex={-1} style={{ outline: "none", boxShadow: "none" }} className="mt-4 text-[24px] font-bold leading-8 [font-family:var(--landing-heading)]">
              {t.judulAktif}
            </h2>
            <p className={`mt-2 text-[16px] leading-6 ${tinta}`}>{baruAktif ? t.isiAktif : t.isiAktifLama}</p>
            {galat ? <p role="alert" className="mt-4 text-[14px] font-semibold leading-5 text-[var(--reg-error,#b3261e)]">{galat}</p> : null}
            {ujiTerkirim ? <p role="status" className={`mt-4 text-[14px] font-semibold leading-5 ${tinta}`}>{t.ujiTerkirim}</p> : null}
            <div className="mt-6 flex flex-col gap-1">
              <button type="button" onClick={() => tutup(false)} className={tombolUtama}>
                {t.selesai}
              </button>
              {!baruAktif ? (
                <>
                  <button type="button" onClick={() => void ujiLagi()} disabled={sibuk !== null} className={tombolTeks}>
                    {t.kirimUji}
                  </button>
                  <button type="button" onClick={() => void matikan()} disabled={sibuk !== null} className={tombolTeks}>
                    <BellSlash size={20} aria-hidden className="mr-2" />
                    {t.matikan}
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        {lembar === "diblokir" ? (
          <>
            <BellSlash size={40} aria-hidden className={tinta} />
            <h2 id={judulId} tabIndex={-1} style={{ outline: "none", boxShadow: "none" }} className="mt-4 text-[24px] font-bold leading-8 [font-family:var(--landing-heading)]">
              {t.judulBlokir}
            </h2>
            <p className={`mt-2 text-[16px] leading-6 ${tinta}`}>{t.isiBlokir}</p>
            <p className="mt-4 rounded-2xl bg-[var(--reg-surface-container,#f3f3f7)] p-4 text-[16px] leading-6">
              {ios ? t.caraIos(data.namaPendek) : /Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? t.caraAndroid : t.caraDesktop}
            </p>
            <p className={`mt-4 text-[14px] leading-5 ${tinta}`}>{t.tetapLonceng}</p>
            <div className="mt-6">
              <button type="button" onClick={() => tutup(false)} className={tombolUtama}>
                {t.tutup}
              </button>
            </div>
          </>
        ) : null}

        {lembar === "tidakBisa" ? (
          <>
            <BellSlash size={40} aria-hidden className={tinta} />
            <h2 id={judulId} tabIndex={-1} style={{ outline: "none", boxShadow: "none" }} className="mt-4 text-[24px] font-bold leading-8 [font-family:var(--landing-heading)]">
              {t.judulTidakBisa}
            </h2>
            <p className={`mt-2 text-[16px] leading-6 ${tinta}`}>{iosLama ? t.isiIosLama : t.isiTidakBisa}</p>
            <div className="mt-6">
              <button type="button" onClick={() => tutup(false)} className={tombolUtama}>
                {t.tutup}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}

function Manfaat({ ikon, teks }: { ikon: React.ReactNode; teks: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0 shrink-0 text-[var(--reg-primary,#1a56db)]">{ikon}</span>
      <span>{teks}</span>
    </li>
  );
}

function Langkah({ n, ikon, teks }: { n: number; ikon: React.ReactNode; teks: string }) {
  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)_24px] items-start gap-3">
      <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--reg-primary-container,#dbe1ff)] text-[14px] font-bold text-[var(--reg-on-primary-container,#00174b)]">
        {n}
      </span>
      <span className="pt-1">{teks}</span>
      <span className="pt-1 text-[var(--reg-primary,#1a56db)]">{ikon}</span>
    </li>
  );
}

/** Contoh notifikasi seperti di layar kunci: peserta melihat persis apa yang akan muncul. */
function ContohNotifikasi({ data, t }: { data: DataNotifikasi; t: (typeof TEKS)["id"] | (typeof TEKS)["en"] }) {
  return (
    <figure aria-label={`${t.contoh}: ${t.contohJudul}. ${t.contohIsi}`} className="relative rounded-[22px] bg-[linear-gradient(160deg,#2b3a73,#5a3c7a)] p-3">
      <div aria-hidden className="flex gap-3 rounded-[16px] bg-white/90 p-3 text-[#1b1b1f] shadow-sm backdrop-blur">
        <img src={data.ikon} alt="" width={40} height={40} className="size-10 shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-[13px] leading-[18px] text-[#46464f]">
            <span className="truncate font-semibold text-[#1b1b1f]">{data.namaAcara}</span>
            <span className="shrink-0">{t.sekarang}</span>
          </div>
          <p className="text-[14px] font-semibold leading-5">{t.contohJudul}</p>
          <p className="text-[14px] leading-5">{t.contohIsi}</p>
        </div>
      </div>
      <span aria-hidden className="absolute right-3 top-[-10px] rounded-full bg-[var(--reg-surface,#fff)] px-2 text-[12px] font-semibold leading-5 text-[#46464f] shadow-sm">
        {t.contoh}
      </span>
    </figure>
  );
}

/**
 * Baris "Notifikasi HP" untuk panel lonceng dan tab Pengumuman: pintu masuk
 * yang selalu ada setelah lembar ajakan ditutup (pola banner "Turn on
 * notifications" di Inbox Airbnb). Hilang bila fitur mati di acara ini.
 */
export function BarisNotifikasi({ lang, onBuka, className = "" }: { lang: LandingLang; onBuka?: () => void; className?: string }) {
  const status = useStatusNotifikasi();
  if (status === "memuat" || status === "mati") return null;
  const en = lang === "en";
  const aktif = status === "aktif";
  const judul = en ? "Phone notifications" : "Notifikasi HP";
  const keterangan = aktif
    ? en ? "On for this device" : "Aktif di perangkat ini"
    : status === "diblokir"
      ? en ? "Blocked in this browser" : "Diblokir di peramban ini"
      : en ? "Get these updates on your phone" : "Dapatkan kabar ini langsung di HP";
  return (
    <button
      type="button"
      onClick={() => {
        onBuka?.();
        bukaNotifikasi();
      }}
      className={`m3-state flex min-h-14 w-full items-center gap-3 text-left ${className}`}
    >
      {aktif ? <BellRinging size={24} aria-hidden className="shrink-0" /> : <BellSlash size={24} aria-hidden className="shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-[22px]">{judul}</span>
        <span className="block text-[14px] leading-5 opacity-80">{keterangan}</span>
      </span>
      {!aktif ? <span className="shrink-0 text-[14px] font-semibold text-[var(--reg-primary,#1a56db)]">{status === "diblokir" ? (en ? "How to fix" : "Caranya") : en ? "Turn on" : "Aktifkan"}</span> : null}
    </button>
  );
}
