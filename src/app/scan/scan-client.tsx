"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import {
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  CircleNotch,
  Flashlight,
  MagnifyingGlass,
  Printer,
  QrCode,
  SpeakerHigh,
  SpeakerSlash,
  UserCheck,
  UserPlus,
  WarningCircle,
  WifiSlash,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  SegmentedButton,
  SelectField,
  Switch,
  Tabs,
  TextField,
  TopAppBar,
} from "@/components/m3";
import { SearchResultsSkeleton } from "@/components/search-loading";
import { LogoutButton } from "@/components/logout-button";
import type { RegistrationField } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import type { LabelData, LabelSettings } from "@/lib/label/layout";
import {
  identifyPrinter,
  loadPrinterDriver,
  printLabel,
  printerSupported,
  readPrintHeadWidth,
  type PrinterInfo,
} from "@/lib/label/printer";
import { renderLabelDataUrl } from "@/lib/label/render";
import { usePemindaiKeyboard } from "./pemindai-keyboard";
import { ResultSheet, TUTUP_OTOMATIS_MS } from "./result-sheet";
import { bacaSuara, bukaSuara, bunyikan, simpanSuara } from "./umpan-balik";
import { WalkinDialog } from "./walkin-dialog";
import {
  FORM_KOSONG,
  type BarisCari,
  type FormWalkIn,
  type Hasil,
  type Jalur,
  type Kandidat,
  type ModeCetak,
  type Sesi,
  type StatusCetak,
} from "./types";

/**
 * Pemindai kehadiran.
 *
 * ---- Bentuknya mengikuti alur meja, bukan daftar fitur ---------------------
 *
 * Perangkat lunak check-in acara besar (Cvent OnArrival, Swapcard, Eventleaf,
 * Accelevents) semuanya berputar pada satu lingkaran yang sama: pindai, pastikan
 * siapa yang barusan masuk, cetak badge-nya dengan satu ketukan, lanjut ke tamu
 * berikutnya. Layar ini disusun mengikuti lingkaran itu:
 *
 *   1. Bilah meja di atas: sesi dan jalur. Disetel sekali, lalu tidak disentuh
 *      lagi berjam-jam, jadi ia setipis mungkin.
 *   2. Panggung: kamera, atau pencarian nama saat kamera tidak menolong.
 *   3. Lembar hasil yang muncul dari bawah, tempat satu-satunya keputusan
 *      sesungguhnya diambil: cetak atau tidak.
 *   4. Panel meja di kanan: berapa yang sudah masuk, printer meja ini, dan arus
 *      pemindaian terakhir.
 *
 * Material 3 dipakai sebagai ATURAN, bukan sebagai rupa: peran warna berpasangan
 * (container dan on-container) yang menjamin kontras, skala tipografi, tinggi
 * sentuh minimum, dan lapisan status pada setiap permukaan yang bisa ditekan.
 * Rupa akhirnya milik DESIGN.md, yang menempatkan layar operasional di lapisan
 * tenang: gerak teredam, radius sedang, tanpa shape morph.
 *
 * ---- Dua jalur, bukan satu ------------------------------------------------
 *
 * QR adalah jalur cepat; pencarian nama adalah jalur yang menyelamatkan antrean
 * ketika jalur cepat gagal. Keduanya duduk di tab terpisah karena menuntut hal
 * yang berlawanan dari petugas: memindai berarti mengarahkan ponsel dan tidak
 * melihat layar, mencari berarti menunduk dan mengetik.
 *
 * ---- Kenapa kamera hanya menyala setelah ditekan ---------------------------
 *
 * Izin kamera diminta pada tindakan yang disengaja, bukan saat halaman dibuka.
 * Izin yang muncul tanpa diminta cenderung ditolak, dan izin yang sudah ditolak
 * sekali jauh lebih sulit dipulihkan daripada diminta.
 */

/**
 * Jalur disimpan di perangkat, bukan di akun.
 *
 * Satu akun petugas scan lazim dipakai bergantian di beberapa ponsel, dan satu
 * meja bisa berganti tiga petugas dalam satu pagi. Yang menetap adalah PONSEL
 * yang tergeletak di meja itu, jadi di situlah pilihannya disimpan.
 */
const KUNCI_JALUR = "scan-lane-id";

/**
 * Kapan ponsel INI mencetak sendiri.
 *
 * Printer label tergeletak di satu meja. Lima meja registrasi bisa berbagi satu
 * printer, dan setelan per acara akan menyuruh empat ponsel lain mencetak ke
 * perangkat yang tidak ada di dekatnya. Yang tahu ada printer di sebelahnya
 * adalah ponsel itu sendiri.
 */
const KUNCI_CETAK = "scan-label-autoprint";

/** Lembar hijau menutup sendiri. Bawaan nyala; disimpan per perangkat, seperti Suara. */
const KUNCI_TUTUP = "scan-tutup-otomatis";

/** Nama kolom "ketik kode peserta". Pemindai genggam boleh mengetik ke sana. */
const KOLOM_KODE = "qr";

/** Permintaan yang tidak terjawab selama ini dianggap gagal, bukan dibiarkan berputar. */
const BATAS_TUNGGU_MS = 8000;

/**
 * Berapa lama kode yang sama ditahan setelah terbaca.
 *
 * Bergeser: setiap kali kamera masih melihat kode itu, hitungannya mulai lagi.
 * Badge yang dipegang lama di depan lensa tidak pernah terkirim dua kali; ia
 * baru boleh terkirim lagi setelah HILANG dari pandangan selama jeda ini.
 * Setelah gagal jedanya lebih pendek supaya "pindai lagi badge-nya" langsung
 * bekerja, tetapi tidak nol: badge yang tertinggal di depan lensa saat jaringan
 * mati akan mengulang lembar merah dan bunyinya setiap setengah detik.
 */
const TAHAN_SUKSES_MS = 2500;
const TAHAN_GAGAL_MS = 1000;

/**
 * Tamu yang tercatat di ponsel ini dalam jendela ini tidak dikirim ulang.
 * Server akan menjawab "sudah pernah dipindai", jumlah hadir tidak berubah, dan
 * lembar hijau tamu yang baru datang berganti oranye di depan matanya.
 */
const BARUSAN_MS = 30_000;

/**
 * Jawaban `duplicate` atas Ulangi dianggap tersimpan pada percobaan yang gagal
 * bila pemindaian pertamanya sedekat ini dengan percobaan itu. Lebar, karena
 * jam server dan jam tablet venue jarang sama persis.
 */
const TOLERANSI_JAM_MS = 10 * 60_000;

function bacaTutupOtomatis(): boolean {
  try {
    return window.localStorage.getItem(KUNCI_TUTUP) !== "0";
  } catch {
    return true;
  }
}

/** Tidak ada yang perlu dilangganani: kemampuan peramban tidak berubah saat halaman terbuka. */
const langgananKosong = () => () => {};

/**
 * Membaca mode cetak yang tersimpan, termasuk bentuk lamanya.
 *
 * Versi pertama menyimpan sakelar dua posisi sebagai "1". Perangkat yang sudah
 * menyalakannya tidak boleh kehilangan pilihannya hanya karena bentuk datanya
 * bertambah; "1" berarti persis apa yang dulu dijanjikan sakelar itu, yaitu
 * cetak untuk tamu walk-in.
 */
function bacaModeCetak(): ModeCetak {
  try {
    const nilai = window.localStorage.getItem(KUNCI_CETAK);
    if (nilai === "1" || nilai === "walkin") return "walkin";
    if (nilai === "semua") return "semua";
  } catch { /* penyimpanan tidak tersedia */ }
  return "off";
}

/**
 * Jalur mana yang dipakai saat layar dibuka.
 *
 * Urutannya dari yang paling disengaja ke yang paling menebak: pilihan yang
 * sedang aktif, lalu alamat (`?jalur=meja-1`, untuk ponsel yang disiapkan
 * panitia), lalu yang tersimpan di perangkat ini, lalu, hanya bila memang cuma
 * ada satu jalur, jalur itu sendiri.
 *
 * Tidak pernah menebak ketika ada beberapa jalur. Menebak berarti sebagian
 * pemindaian pagi itu tercatat di meja yang salah, dan tidak ada satu pun tanda
 * di layar petugas bahwa itu terjadi.
 */
function pilihJalur(daftar: Jalur[], sekarang: number | null): number | null {
  if (sekarang && daftar.some((jalur) => jalur.id === sekarang)) return sekarang;

  const slug = new URLSearchParams(window.location.search).get("jalur");
  const dariAlamat = slug ? daftar.find((jalur) => jalur.slug === slug) : undefined;
  if (dariAlamat) return dariAlamat.id;

  try {
    const tersimpan = Number(window.localStorage.getItem(KUNCI_JALUR));
    if (daftar.some((jalur) => jalur.id === tersimpan)) return tersimpan;
  } catch { /* penyimpanan tidak tersedia */ }

  return daftar.length === 1 ? daftar[0].id : null;
}

type Mode = "qr" | "cari";

/**
 * Kata di kolom kanan daftar pemindaian terakhir.
 *
 * Peta, bukan rantai ternari: rantainya sudah salah sekali ketika status keempat
 * ditambahkan, dan apa pun yang bukan recorded atau duplicate terbaca "gagal",
 * termasuk peserta yang baru saja berhasil didaftarkan.
 */
const RIWAYAT: Record<Hasil["status"], { teks: string; kelas: string }> = {
  recorded: { teks: "hadir", kelas: "text-success" },
  created: { teks: "baru", kelas: "text-primary" },
  duplicate: { teks: "ulang", kelas: "text-warning" },
  not_found: { teks: "gagal", kelas: "text-error" },
  // Tiga yang terakhir tidak pernah masuk riwayat: tidak ada yang tercatat.
  gagal: { teks: "belum", kelas: "text-error" },
  login: { teks: "belum", kelas: "text-error" },
  ditolak: { teks: "ditolak", kelas: "text-error" },
};

const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

/**
 * Isi label uji cetak.
 *
 * Bukan data contoh dari CMS: kode contoh di sana berbentuk seperti kode
 * sungguhan, dan label uji yang membawa kode milik peserta nyata bisa menempel
 * di dada orang yang salah. TEST0000 tidak akan pernah cocok dengan siapa pun,
 * karena kode peserta selalu berawalan REG diikuti enam angka.
 */
const UJI_LABEL: LabelData = { name: "Uji Cetak", company: "Tes printer", title: null, qr_code: "TEST0000" };

type JawabanGalat = { error?: { message?: string; details?: unknown } };

/**
 * Kalimat yang benar-benar ditampilkan dari sebuah jawaban galat.
 *
 * Tiga bentuk `details` beredar di API ini: `{ message }` yang ditulis tangan di
 * route handler, peta `{ "extra.ukuran_kaus": "..." }` dari pemeriksaan jawaban
 * formulir, dan `flatten()` milik Zod. Yang ketiga paling mudah terlewat, dan
 * hasilnya petugas membaca "Gagal disimpan. Coba lagi." untuk sebuah kolom yang
 * sebenarnya sudah disebutkan namanya oleh server.
 */
function pesanGalat(body: JawabanGalat, cadangan: string): string {
  const details = body.error?.details;
  if (details && typeof details === "object") {
    const rekaman = details as Record<string, unknown>;
    if (typeof rekaman.message === "string") return rekaman.message;

    const bidang = rekaman.fieldErrors;
    if (bidang && typeof bidang === "object") {
      for (const nilai of Object.values(bidang as Record<string, unknown>)) {
        if (Array.isArray(nilai) && typeof nilai[0] === "string") return nilai[0];
      }
    }
    for (const nilai of Object.values(rekaman)) {
      if (typeof nilai === "string") return nilai;
    }
  }
  return body.error?.message ?? cadangan;
}

/**
 * Kegagalan printer, diterjemahkan menjadi langkah yang bisa dikerjakan petugas.
 *
 * Web Bluetooth melaporkan kegagalannya lewat NAMA galat, bukan pesannya, dan
 * pesan bawaannya berbahasa Inggris teknis. Dua di antaranya bukan kerusakan
 * sama sekali, yaitu dibatalkan dan aktivasi pengguna yang kedaluwarsa, dan
 * keduanya persis yang paling sering terjadi di meja registrasi.
 */
function pesanPrinter(error: unknown): string {
  const nama = error instanceof Error ? error.name : "";
  const pesan = error instanceof Error ? error.message : String(error ?? "");
  if (nama === "NotFoundError") {
    return "Tidak ada printer yang dipilih. Pastikan printernya menyala dan tidak sedang tersambung ke ponsel lain.";
  }
  if (nama === "NotAllowedError") {
    return "Peramban minta printer dipilih ulang. Tekan Cetak label sekali lagi, lalu pilih printernya.";
  }
  if (nama === "SecurityError") {
    return "Bluetooth hanya bisa lewat HTTPS. Buka layar ini dari alamat https.";
  }
  if (/Web Bluetooth unavailable/i.test(pesan)) {
    return "Peramban ini tidak punya Bluetooth. Pakai Chrome atau Edge di Android, Windows, atau macOS.";
  }
  return pesan || "Printer tidak menjawab. Periksa dayanya dan gulungan labelnya.";
}

/** Dua huruf awal dari dua kata pertama. Cukup untuk membedakan baris sekilas. */
const inisial = (nama: string) =>
  nama
    .split(/\s+/)
    .slice(0, 2)
    .map((kata) => kata.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * Penanda bahwa permintaan TERAKHIR gagal sampai ke server. Ikon plus kata,
 * bukan warna saja. Hilang sendiri pada jawaban berikutnya yang berhasil.
 */
function ChipOffline({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-error px-2.5 text-label-medium font-semibold text-on-error ${className}`}>
      <WifiSlash size={14} weight="bold" aria-hidden />
      Offline
    </span>
  );
}

export default function ScanClient() {
  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [lanes, setLanes] = useState<Jalur[]>([]);
  const [laneId, setLaneId] = useState<number | null>(null);
  // Dibaca dari dalam callback pemuatan, tempat state React masih bernilai lama.
  const laneRef = useRef<number | null>(null);
  const [kodeLayar, setKodeLayar] = useState("");
  const [memasang, setMemasang] = useState(false);
  const [pesanLayar, setPesanLayar] = useState<{ nada: "ok" | "galat"; teks: string } | null>(null);
  const [eventName, setEventName] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<Mode>("qr");
  const [scanning, setScanning] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  // Naik satu setiap ada jawaban baru. Dipakai sebagai `key` lembar hasil supaya
  // ia benar-benar berkedip sekali: dua tamu berturut-turut yang sama-sama
  // tercatat hadir menghasilkan lembar yang identik, dan tanpa kedipan itu
  // petugas tidak punya cara tahu apakah pemindaian keduanya terbaca.
  const [kedip, setKedip] = useState(0);
  // Angka hadir yang lebih baru daripada yang ikut terkirim bersama daftar sesi.
  // Disimpan per sesi: petugas yang berpindah dari Registrasi ke Makan siang dan
  // kembali lagi harus melihat angka masing-masing sesi.
  const [hadirTerbaru, setHadirTerbaru] = useState<Record<number, number>>({});
  const [riwayat, setRiwayat] = useState<Array<{ nama: string; status: Hasil["status"]; waktu: string }>>([]);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // ---- Umpan balik di jendela kamera ----------------------------------------
  // Kode yang sudah terbaca dan sedang menunggu jawaban server. Tanpa tanda ini,
  // di Wi-Fi venue yang lambat satu-satunya kabar bahwa badge sudah terbaca
  // hanyalah putaran kecil di tombol Catat di bawah, dan tamu menyodorkan ulang.
  const [membaca, setMembaca] = useState<string | null>(null);
  // Diturunkan dari permintaan TERAKHIR, bukan dari `navigator.onLine`: Wi-Fi
  // venue yang tersambung tetapi mati tetap melaporkan "online".
  const [offline, setOffline] = useState(false);
  // Tamu terakhir yang tercatat, untuk pil di kamera setelah lembarnya menutup
  // sendiri. Di ponsel, riwayat ada di bawah kamera, di luar pandangan.
  const [terakhirHadir, setTerakhirHadir] = useState<{ nama: string; waktu: string } | null>(null);
  const [suara, setSuara] = useState(true);
  const suaraRef = useRef(true);
  const [senter, setSenter] = useState<{ ada: boolean; nyala: boolean }>({ ada: false, nyala: false });
  const kontrolKameraRef = useRef<{ stop: () => void; switchTorch?: (nyala: boolean) => Promise<void> } | null>(null);

  // ---- Bilah meja -------------------------------------------------------------
  const [mejaTerbuka, setMejaTerbuka] = useState(false);
  const [sesiHilang, setSesiHilang] = useState(false);
  const sessionRef = useRef<number | null>(null);

  // ---- Lembar hasil -----------------------------------------------------------
  const [tutupOtomatis, setTutupOtomatis] = useState(true);
  // `kedip` lembar yang hitung mundurnya dihentikan oleh sentuhan petugas.
  const [hitungBatal, setHitungBatal] = useState<number | null>(null);
  // Centang barang yang belum diserahkan. Selama masih ada, hasil berikutnya
  // menunggu (`tertahan`) dan tidak mengganti lembar.
  const centangRef = useRef(0);
  const [tertahan, setTertahan] = useState<Hasil | null>(null);
  const tertahanRef = useRef<Hasil | null>(null);
  const hasilRef = useRef<Hasil | null>(null);
  // Percobaan terakhir yang gagal, untuk mengenali Ulangi yang ternyata sudah
  // tersimpan (jawabannya hilang, bukan permintaannya).
  const gagalRef = useRef<{ qr: string; waktu: number } | null>(null);
  // Kode yang tercatat di ponsel ini beberapa detik terakhir. Lihat BARUSAN_MS.
  const barusanRef = useRef<Map<string, number>>(new Map());

  const [kueri, setKueri] = useState("");
  /**
   * Hasil pencarian DAN kunci yang menghasilkannya, dalam satu state.
   *
   * Dipasangkan supaya "sedang mencari" bisa diturunkan, yaitu benar persis
   * ketika kunci yang tersimpan berbeda dari kunci sekarang, alih-alih dijaga
   * sebagai penanda tersendiri yang harus dinyalakan dan dimatikan di setiap
   * cabang. Penanda terpisah adalah yang membuat daftar lama sempat berkedip di
   * bawah kueri baru, karena keduanya tidak pernah berubah pada render yang sama.
   */
  const [cari, setCari] = useState<{ kunci: string; hasil: BarisCari[]; terpotong: boolean; gagal: boolean } | null>(null);
  const [mencatatId, setMencatatId] = useState<string | null>(null);

  // ---- Tamu walk-in -------------------------------------------------------
  // Setelan acara, bukan pilihan petugas: sebagian acara memang melarang tamu
  // yang tidak terdaftar, dan di sana tombolnya harus benar-benar tidak ada.
  const [allowWalkIn, setAllowWalkIn] = useState(false);
  const [walkinFields, setWalkinFields] = useState<RegistrationField[]>([]);
  const [dialogWalkIn, setDialogWalkIn] = useState(false);
  const [formWalkIn, setFormWalkIn] = useState<FormWalkIn>(FORM_KOSONG);
  const [kandidat, setKandidat] = useState<Kandidat[] | null>(null);
  const [menyimpanWalkIn, setMenyimpanWalkIn] = useState(false);
  const [galatWalkIn, setGalatWalkIn] = useState("");

  // ---- Printer label ------------------------------------------------------
  const [label, setLabel] = useState<LabelSettings | null>(null);
  const [printer, setPrinter] = useState<PrinterInfo | null>(null);
  const [lebarKepala, setLebarKepala] = useState<number | null>(null);
  const [cetak, setCetak] = useState<StatusCetak>({ fase: "diam" });
  const [modeCetak, setModeCetak] = useState<ModeCetak>("off");

  /**
   * Apakah peramban ini punya Web Bluetooth sama sekali.
   *
   * `useSyncExternalStore` dengan langganan kosong, pola yang sama dengan kartu
   * kode peserta: kemampuan peramban tidak berubah selama halaman terbuka, dan
   * yang dibutuhkan hanyalah jawaban berbeda antara server (yang tidak punya
   * `navigator`) dan klien tanpa membuat React membuang pohonnya karena
   * ketidakcocokan hidrasi.
   */
  const bisaBluetooth = useSyncExternalStore(langgananKosong, printerSupported, () => false);

  const videoRef = useRef<HTMLVideoElement>(null);
  // Menahan pemindaian beruntun dari QR yang sama. Kamera membaca puluhan frame
  // per detik, dan tanpa jeda satu badge yang tertinggal di depan lensa akan
  // menghasilkan belasan baris catatan dalam sekejap.
  const terakhirRef = useRef<{ qr: string; waktu: number; tahan: number }>({ qr: "", waktu: 0, tahan: TAHAN_SUKSES_MS });

  const muatSesi = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/attendance/sessions"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setPesan("Daftar sesi gagal dimuat. Periksa koneksi lalu muat ulang."); return; }
    const body = await response.json();
    const daftar = (body.sessions ?? []) as Sesi[];
    const jalurDaftar = (body.lanes ?? []) as Jalur[];
    setSessions(daftar);
    setLanes(jalurDaftar);
    setEventName(body.event?.name ?? "");
    setUsername(body.user?.username ?? "");
    setAllowWalkIn(Boolean(body.allow_walk_in));
    setWalkinFields((body.walkin_fields ?? []) as RegistrationField[]);
    setLabel((body.label ?? null) as LabelSettings | null);
    // Sesi yang dipilih bisa ditutup admin di tengah hari. Diam-diam pindah ke
    // sesi pertama berarti pemindaian berikutnya tercatat di sesi yang salah;
    // yang benar adalah membuka bilah meja dan meminta petugas memilih lagi.
    const dipilih = sessionRef.current;
    const hilang = dipilih !== null && !daftar.some((sesi) => sesi.id === dipilih);
    const sesiBaru = hilang ? null : dipilih ?? daftar[0]?.id ?? null;
    sessionRef.current = sesiBaru;
    setSessionId(sesiBaru);
    setSesiHilang(hilang);

    // Dihitung di luar `setLaneId`, bukan di dalam updaternya: updater harus
    // murni, dan yang ini membaca alamat halaman serta localStorage.
    const jalurTerpilih = pilihJalur(jalurDaftar, laneRef.current);
    laneRef.current = jalurTerpilih;
    setLaneId(jalurTerpilih);

    setPesan(daftar.length === 0 ? "Belum ada sesi kehadiran yang dibuka. Hubungi panitia." : "");
  }, []);

  function gantiJalur(id: number | null) {
    laneRef.current = id;
    setLaneId(id);
    setPesanLayar(null);
    try {
      if (id === null) window.localStorage.removeItem(KUNCI_JALUR);
      else window.localStorage.setItem(KUNCI_JALUR, String(id));
    } catch { /* penyimpanan tidak tersedia; pilihan tetap berlaku sesi ini */ }
  }

  /**
   * Memasang TV di meja ini ke jalur yang sedang dipilih.
   *
   * Yang mengetik kodenya adalah orang yang berdiri di sebelah layarnya, dan itu
   * memang izinnya, sama seperti memasang perangkat digital signage. Admin di
   * ruang kontrol tahu ada lima TV; ia tidak tahu TV yang menampilkan 4821
   * menghadap meja yang mana.
   */
  async function pasangLayar(kode: string) {
    if (!laneId) { setPesanLayar({ nada: "galat", teks: "Pilih jalur meja ini lebih dulu." }); return; }
    setMemasang(true);
    const response = await fetch(eventApiPath("/api/sapa/pair"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: kode, lane_id: laneId }),
    }).catch(() => null);
    setMemasang(false);

    if (!response) { setPesanLayar({ nada: "galat", teks: "Koneksi terputus. Coba lagi." }); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPesanLayar({ nada: "galat", teks: pesanGalat(body, "Kode tidak diterima. Lihat lagi angka di layar.") });
      return;
    }
    setKodeLayar("");
    setPesanLayar({ nada: "ok", teks: `Layar terpasang ke ${body.lane?.name ?? "jalur ini"}.` });
  }

  useEffect(() => {
    // Ditunda satu putaran, pola yang sama dengan layar admin lain: pemuatan
    // pertama tidak boleh memanggil setState di dalam badan efek.
    const timer = window.setTimeout(() => void muatSesi(), 0);
    return () => window.clearTimeout(timer);
  }, [muatSesi]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setModeCetak(bacaModeCetak());
      const nyala = bacaSuara();
      suaraRef.current = nyala;
      setSuara(nyala);
      setTutupOtomatis(bacaTutupOtomatis());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  /**
   * Driver printer diunduh SEBELUM tombolnya ditekan.
   *
   * Web Bluetooth hanya membuka dialog pemilih perangkat selama aktivasi
   * pengguna masih berlaku, yaitu beberapa detik setelah klik. Mengunduh berkas
   * driver 160 KB di dalam penanganan klik menghabiskan jendela itu di jaringan
   * venue, dan dialognya tidak pernah muncul: tombol ditekan lalu tidak terjadi
   * apa-apa. Diunduh lebih awal, panggilannya tinggal menunggu promise yang
   * sudah selesai.
   */
  useEffect(() => {
    if (!label?.enabled || !bisaBluetooth) return;
    void loadPrinterDriver().catch(() => { /* dilaporkan saat tombol ditekan */ });
  }, [bisaBluetooth, label?.enabled]);

  /**
   * Menyimpan label sebagai PNG, untuk perangkat tanpa Web Bluetooth.
   *
   * iOS tidak punya Web Bluetooth di peramban mana pun, termasuk Chrome di
   * iPhone yang memakai mesin Safari, dan Firefox juga tidak. Di sana jalan
   * keluarnya adalah berkas gambar yang dicetak dari aplikasi NIIMBOT. Jalur dan
   * alasannya sama dengan kartu kode peserta di halaman pendaftaran.
   */
  async function simpanLabelPng(dataUrl: string, kode: string) {
    const blob = await (await fetch(dataUrl)).blob();
    const berkas = new File([blob], `label-${kode}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [berkas] })) {
      await navigator.share({ files: [berkas], title: `Label ${kode}` });
      return;
    }
    const tautan = document.createElement("a");
    tautan.href = dataUrl;
    tautan.download = `label-${kode}.png`;
    tautan.click();
  }

  const cetakLabel = useCallback(async (data: LabelData) => {
    if (!label?.enabled) return;
    setCetak({ fase: "jalan", teks: "Mengirim ke printer..." });
    try {
      const dataUrl = await renderLabelDataUrl(label, data);
      if (!bisaBluetooth) {
        await simpanLabelPng(dataUrl, data.qr_code);
        setCetak({ fase: "selesai", teks: "Label disimpan sebagai gambar. Cetak dari aplikasi NIIMBOT." });
        return;
      }
      await printLabel(dataUrl, label);
      setCetak({ fase: "selesai", teks: `Label ${data.qr_code} tercetak.` });
    } catch (error) {
      setCetak({ fase: "galat", teks: pesanPrinter(error) });
    }
  }, [bisaBluetooth, label]);

  /**
   * Jalur untuk cetak otomatis.
   *
   * Refs, bukan dependensi: `terapkanHasil` dipanggil dari dalam callback kamera
   * yang dipasang sekali, dan mengikat fungsi cetak sebagai dependensi berarti
   * memasang ulang pemindai setiap kali status printer berubah, di tengah
   * antrean.
   */
  const cetakRef = useRef(cetakLabel);
  const modeRef = useRef<ModeCetak>("off");
  useEffect(() => { cetakRef.current = cetakLabel; });
  useEffect(() => { modeRef.current = modeCetak; });

  function gantiModeCetak(nilai: ModeCetak) {
    modeRef.current = nilai;
    setModeCetak(nilai);
    try {
      if (nilai === "off") window.localStorage.removeItem(KUNCI_CETAK);
      else window.localStorage.setItem(KUNCI_CETAK, nilai);
    } catch { /* penyimpanan tidak tersedia; pilihan tetap berlaku sesi ini */ }
  }

  /**
   * Memasang satu hasil sebagai lembar yang terlihat, atau menahannya.
   *
   * Ditahan bila lembar yang sedang terbuka masih punya barang yang dicentang
   * tetapi belum diserahkan. Kamera tetap memindai di balik lembar, dan tamu
   * berikutnya sering sudah menyodorkan badge selagi petugas mengulurkan kaos.
   * Mengganti lembar di saat itu menghapus centangnya, dan kaos yang sudah di
   * tangan tamu tidak pernah tercatat.
   */
  const pasangLembar = useCallback((data: Hasil) => {
    if (centangRef.current > 0 && hasilRef.current) {
      tertahanRef.current = data;
      setTertahan(data);
      return;
    }
    hasilRef.current = data;
    setHasil(data);
    setKedip((current) => current + 1);
    setCetak({ fase: "diam" });
  }, []);

  /**
   * Menerapkan satu jawaban server ke seluruh layar.
   *
   * Dipakai bersama oleh pemindaian, pencatatan dari hasil pencarian, dan
   * pendaftaran tamu walk-in. Ketiganya menghasilkan lembar hasil, kedipan,
   * bunyi, getaran, baris riwayat, dan angka hadir yang sama. Ditulis tiga kali,
   * cepat atau lambat salah satunya ketinggalan saat yang lain diperbaiki.
   */
  const terapkanHasil = useCallback((data: Hasil, sesi: number) => {
    pasangLembar(data);
    setPesan("");
    setOffline(false);
    gagalRef.current = null;
    if (typeof data.session_unique_total === "number") {
      const total = data.session_unique_total;
      setHadirTerbaru((current) => ({ ...current, [sesi]: total }));
    }
    const beres = data.status === "recorded" || data.status === "created" || Boolean(data.tersimpanSebelumnya);
    bunyikan(beres ? "ok" : data.status === "duplicate" ? "ulang" : "galat", suaraRef.current);
    const waktu = new Date().toISOString();
    setRiwayat((current) => [
      { nama: data.participant?.name ?? data.qr ?? "Tidak dikenal", status: beres ? "recorded" : data.status, waktu },
      ...current,
    ].slice(0, 20));
    if (beres && data.participant) {
      setTerakhirHadir({ nama: data.participant.name, waktu });
      const sekarang = Date.now();
      barusanRef.current.set(data.participant.qr_code, sekarang);
      if (data.qr) barusanRef.current.set(data.qr, sekarang);
    }

    // Cetak otomatis TIDAK berlaku untuk pemindaian ulang: tamu itu sudah
    // memegang badge-nya sejak tadi, dan mencetak lagi hanya menghabiskan
    // gulungan. Cetak ulang tetap tersedia satu ketukan di lembar hasil.
    // Tanpa Bluetooth tidak ada cetak otomatis sama sekali: di sana "mencetak"
    // berarti membuka lembar bagikan, dan itu ditolak peramban tanpa ketukan.
    const mode = printerSupported() ? modeRef.current : "off";
    const perlu = mode === "semua" ? beres : mode === "walkin" ? data.status === "created" : false;
    if (perlu && data.participant) void cetakRef.current(data.participant);
  }, [pasangLembar]);

  /**
   * Lembar untuk pemindaian yang tidak menghasilkan jawaban server yang sah.
   *
   * Dulu ini sebaris pesan di puncak halaman yang mendorong kamera 76 px ke
   * bawah, tanpa bunyi, di tempat yang tidak dilihat petugas yang sedang
   * menatap tamu. Sekarang ia lembar yang sama dengan hasil lain: merah, berbunyi,
   * dan membawa aksi yang memang menolong.
   */
  const tampilGagal = useCallback((qr: string, status: "gagal" | "login" | "ditolak", teks: string) => {
    if (status === "gagal") {
      setOffline(true);
      gagalRef.current = { qr, waktu: Date.now() };
    }
    pasangLembar({ status, qr, pesan: teks });
    bunyikan("galat", suaraRef.current);
  }, [pasangLembar]);

  const kirim = useCallback(async (qr: string): Promise<Hasil | null> => {
    if (!sessionId) { setPesan("Pilih sesi lebih dulu."); return null; }
    setSibuk(true);
    setMembaca(qr);
    const batas = new AbortController();
    const pewaktu = window.setTimeout(() => batas.abort(), BATAS_TUNGGU_MS);
    const response = await fetch(eventApiPath("/api/attendance/scan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Jalur ikut di setiap pemindaian, bukan disimpulkan belakangan dari siapa
      // yang memindai: satu akun petugas dipakai bergantian di beberapa meja,
      // jadi `scanned_by` tidak pernah bisa menjawab "meja yang mana".
      body: JSON.stringify({ session_id: sessionId, qr, lane_id: laneId }),
      signal: batas.signal,
    }).catch(() => null);
    window.clearTimeout(pewaktu);
    setSibuk(false);
    setMembaca(null);

    if (!response || response.status >= 500) {
      tampilGagal(qr, "gagal", "Koneksi terputus atau server tidak menjawab, jadi tamu ini BELUM masuk daftar hadir. Tekan Ulangi, atau pindai lagi badge-nya.");
      return null;
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      tampilGagal(qr, "login", "Login petugas di ponsel ini sudah habis, jadi pemindaian ini TIDAK tercatat. Login lagi, lalu pindai ulang.");
      return null;
    }
    if (!response.ok) {
      tampilGagal(qr, "ditolak", pesanGalat(body, "Server menolak pemindaian ini. Hubungi panitia."));
      return null;
    }

    let data = body as Hasil;
    // Jawaban percobaan sebelumnya hilang, tetapi server sempat menyimpannya.
    // "Sudah pernah dipindai" di sini menyesatkan: tamunya baru datang.
    const gagal = gagalRef.current;
    if (
      data.status === "duplicate" &&
      gagal?.qr === qr &&
      data.scan_count === 2 &&
      data.first_scan_at &&
      Math.abs(new Date(data.first_scan_at).getTime() - gagal.waktu) < TOLERANSI_JAM_MS
    ) {
      data = { ...data, tersimpanSebelumnya: true };
    }
    terapkanHasil({ ...data, qr: data.qr ?? qr }, sessionId);
    return data;
  }, [laneId, sessionId, terapkanHasil, tampilGagal]);

  /**
   * Pintu masuk setiap kode yang terbaca kamera atau pemindai genggam.
   *
   * Dua penahan, keduanya demi tamu yang memegang badge-nya lama di depan lensa:
   * tahanan bergeser untuk kode yang sama, dan daftar tamu yang tercatat di
   * ponsel ini dalam 30 detik terakhir.
   */
  const terbaca = useCallback((nilai: string) => {
    const sekarang = Date.now();
    const terakhir = terakhirRef.current;
    if (terakhir.qr === nilai && sekarang - terakhir.waktu < terakhir.tahan) {
      terakhir.waktu = sekarang;
      return;
    }
    terakhirRef.current = { qr: nilai, waktu: sekarang, tahan: TAHAN_SUKSES_MS };
    const barusan = barusanRef.current.get(nilai);
    if (barusan && sekarang - barusan < BARUSAN_MS) return;
    void kirim(nilai).then((data) => {
      if (!data && terakhirRef.current.qr === nilai) terakhirRef.current.tahan = TAHAN_GAGAL_MS;
    });
  }, [kirim]);

  const terbacaRef = useRef(terbaca);
  useEffect(() => { terbacaRef.current = terbaca; });

  // Pemindai genggam yang mengetik kodenya, aktif selama tab Pindai QR terbuka,
  // termasuk saat lembar hasil menutupi layar.
  usePemindaiKeyboard(mode === "qr" && !dialogWalkIn, (kode) => terbacaRef.current(kode), KOLOM_KODE);

  useEffect(() => {
    if (!scanning || mode !== "qr" || !videoRef.current) return;
    // Hanya QR: membuang format lain memangkas kerja tiap frame. Jeda 150 ms,
    // bukan 500 ms bawaan zxing; lebih rapat lagi memanaskan Android murah.
    const petunjuk = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
    const reader = new BrowserMultiFormatReader(petunjuk, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 150 });
    let berhenti = false;
    let kontrol: { stop: () => void; switchTorch?: (nyala: boolean) => Promise<void> } | undefined;

    void reader
      .decodeFromConstraints(
        {
          // `ideal`, bukan nilai pasti: iPhone memilih aliran potretnya sendiri,
          // dan permintaan pasti yang tidak bisa dipenuhi membuat kamera gagal.
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        },
        videoRef.current,
        (result) => {
          if (berhenti || !result) return;
          const nilai = result.getText().trim();
          // Kamera TIDAK dimatikan setelah membaca: antrean bergerak terus, dan
          // menyalakan ulang kamera untuk setiap orang menambah dua detik per tamu.
          if (nilai) terbacaRef.current(nilai);
        },
      )
      .then((value) => {
        kontrol = value;
        if (berhenti) { kontrol.stop(); return; }
        kontrolKameraRef.current = kontrol;
        // Senter hanya muncul bila kameranya memang punya. iPhone dan iPad tidak
        // pernah melaporkannya ke peramban.
        setSenter({ ada: typeof kontrol.switchTorch === "function", nyala: false });
      })
      .catch(() => setPesan("Kamera tidak tersedia atau izinnya ditolak."));

    return () => {
      berhenti = true;
      kontrol?.stop();
      kontrolKameraRef.current = null;
      setSenter({ ada: false, nyala: false });
    };
  }, [mode, scanning]);

  /**
   * Layar tidak meredup selama kamera menyala.
   *
   * Saat antrean sepi, layar ponsel meredup lalu terkunci, kamera ikut mati, dan
   * tamu berikutnya menunggu petugas membuka kunci dan menekan Nyalakan kamera.
   * Peramban melepas kuncinya sendiri saat halaman ke belakang; kamera juga mati
   * saat itu, dan "Nyalakan kamera" memintanya lagi.
   */
  useEffect(() => {
    if (!scanning) return;
    let kunci: { release: () => Promise<void> } | null = null;
    let lepas = false;
    const wl = (navigator as Navigator & { wakeLock?: { request: (jenis: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    void wl?.request("screen")
      .then((k) => { if (lepas) void k.release(); else kunci = k; })
      .catch(() => { /* ditolak atau tidak didukung: layar meredup seperti biasa */ });
    return () => { lepas = true; void kunci?.release().catch(() => {}); };
  }, [scanning]);

  async function gantiSenter() {
    const kontrol = kontrolKameraRef.current;
    if (!kontrol?.switchTorch) return;
    const nyala = !senter.nyala;
    try {
      await kontrol.switchTorch(nyala);
      setSenter({ ada: true, nyala });
    } catch { /* sebagian kamera menolak di tengah jalan; tombolnya tetap */ }
  }

  function gantiSuara() {
    const nyala = !suaraRef.current;
    suaraRef.current = nyala;
    setSuara(nyala);
    simpanSuara(nyala);
    bukaSuara();
  }

  function gantiTutupOtomatis(nyala: boolean) {
    setTutupOtomatis(nyala);
    try {
      if (nyala) window.localStorage.removeItem(KUNCI_TUTUP);
      else window.localStorage.setItem(KUNCI_TUTUP, "0");
    } catch { /* penyimpanan tidak tersedia; pilihan tetap berlaku sesi ini */ }
  }

  const tutupLembar = useCallback(() => {
    hasilRef.current = null;
    setHasil(null);
  }, []);

  /** Laporan centang dari daftar barang. Nol berarti hasil yang tertahan boleh tampil. */
  const onCentang = useCallback((jumlah: number) => {
    centangRef.current = jumlah;
    const tunggu = tertahanRef.current;
    if (jumlah === 0 && tunggu) {
      tertahanRef.current = null;
      setTertahan(null);
      pasangLembar(tunggu);
    }
  }, [pasangLembar]);

  function lewatiBarang() {
    const tunggu = tertahanRef.current;
    if (!tunggu) return;
    centangRef.current = 0;
    tertahanRef.current = null;
    setTertahan(null);
    pasangLembar(tunggu);
  }

  // Kamera dimatikan begitu layar berpindah ke belakang. Ponsel petugas masuk
  // saku puluhan kali per acara, dan kamera yang tetap menyala di dalam saku
  // memakan baterai sepanjang sisa hari tanpa memindai satu pun tamu.
  useEffect(() => {
    if (!scanning) return;
    const tersembunyi = () => { if (document.hidden) setScanning(false); };
    document.addEventListener("visibilitychange", tersembunyi);
    return () => document.removeEventListener("visibilitychange", tersembunyi);
  }, [scanning]);

  // Pencarian ditunda 300 ms setelah ketukan terakhir. Nama Indonesia panjang,
  // dan satu permintaan per huruf berarti belasan kueri terbuang untuk satu nama.
  useEffect(() => {
    const q = kueri.trim();
    // Tidak ada pembersihan state di sini, dan itu disengaja: kueri yang terlalu
    // pendek cukup TIDAK menjalankan apa pun. Hasil lama tetap tersimpan tetapi
    // tidak pernah tergambar, karena kunci yang menempel padanya sudah tidak
    // cocok lagi dengan kueri sekarang.
    if (q.length < 2) return;
    const kunci = `${sessionId ?? 0}|${q}`;

    let basi = false;
    const timer = window.setTimeout(async () => {
      const alamat = eventApiPath(
        `/api/attendance/search?q=${encodeURIComponent(q)}${sessionId ? `&session_id=${sessionId}` : ""}`,
      );
      const response = await fetch(alamat, { cache: "no-store" }).catch(() => null);
      // Jawaban yang datang setelah kuerinya berganti dibuang. Tanpa penjaga ini
      // permintaan lambat untuk "bu" bisa mendarat setelah "budi" dan menimpa
      // hasil yang benar dengan hasil yang sudah tidak diminta.
      if (basi) return;
      if (!response?.ok) {
        setCari({ kunci, hasil: [], terpotong: false, gagal: true });
        return;
      }
      const body = await response.json().catch(() => ({}));
      setCari({
        kunci,
        hasil: (body.results ?? []) as BarisCari[],
        terpotong: Boolean(body.truncated),
        gagal: false,
      });
    }, 300);

    return () => { basi = true; window.clearTimeout(timer); };
  }, [kueri, sessionId]);

  const gantiMode = (berikutnya: Mode) => {
    setMode(berikutnya);
    // Kamera dimatikan saat berpindah ke tab pencarian. Membiarkannya hidup di
    // balik tab yang tidak terlihat berarti lampu kamera tetap menyala tanpa ada
    // pratinjau yang menjelaskan kenapa.
    if (berikutnya !== "qr") setScanning(false);
  };

  const catatDariCari = async (baris: BarisCari) => {
    setMencatatId(baris.id);
    const data = await kirim(baris.qr_code);
    setMencatatId(null);
    if (!data) return;
    // Baris diperbarui di tempat, bukan lewat pencarian ulang. Daftar yang
    // dimuat ulang akan melompat kembali ke atas, dan petugas yang sedang
    // mencatat rombongan tujuh orang kehilangan posisinya setiap kali.
    setCari((current) =>
      current === null
        ? current
        : {
            ...current,
            hasil: current.hasil.map((row) =>
              row.id === baris.id
                ? {
                    ...row,
                    scan_count: data.scan_count ?? row.scan_count + 1,
                    first_scan_at: data.first_scan_at ?? row.first_scan_at ?? new Date().toISOString(),
                  }
                : row,
            ),
          },
    );
  };

  async function sambungPrinter() {
    if (!label?.enabled) return;
    setCetak({ fase: "jalan", teks: "Mencari printer..." });
    try {
      const info = await identifyPrinter(label);
      setPrinter(info);
      // Lebar kepala cetak ditanyakan ke printernya sendiri, sekali, saat
      // tersambung. Ini satu-satunya cara mengetahui angka itu tanpa
      // menghabiskan label untuk mencobanya, dan angka itulah yang diisikan
      // admin di Setelan printer ketika tepi kanan label hilang.
      setLebarKepala(await readPrintHeadWidth().catch(() => null));
      setCetak({ fase: "selesai", teks: `Tersambung ke ${info.label}.` });
    } catch (error) {
      setPrinter(null);
      setCetak({ fase: "galat", teks: pesanPrinter(error) });
    }
  }

  /**
   * Membuka dialog walk-in dengan nama yang BARU SAJA dicari sudah terisi.
   *
   * Mengetik nama dua kali berarti salah ketik satu kali, dan nama yang salah
   * ketik di sini tidak ketahuan sampai badge-nya sudah dipegang tamu.
   */
  function bukaWalkIn(namaAwal: string) {
    setFormWalkIn({ ...FORM_KOSONG, name: namaAwal.trim() });
    setKandidat(null);
    setGalatWalkIn("");
    setDialogWalkIn(true);
  }

  async function simpanWalkIn(paksa: boolean) {
    if (!sessionId) { setGalatWalkIn("Pilih sesi lebih dulu."); return; }
    const nama = formWalkIn.name.trim();
    if (!nama) { setGalatWalkIn("Nama wajib diisi."); return; }

    setMenyimpanWalkIn(true);
    setGalatWalkIn("");
    const response = await fetch(eventApiPath("/api/attendance/walkin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        lane_id: laneId,
        name: nama,
        company: formWalkIn.company.trim() || null,
        title: formWalkIn.title.trim() || null,
        phone: formWalkIn.phone.trim() || null,
        email: formWalkIn.email.trim() || null,
        extra: formWalkIn.extra,
        force: paksa,
      }),
    }).catch(() => null);
    setMenyimpanWalkIn(false);

    // Menyebut dengan tegas bahwa TIDAK ada yang tersimpan. Petugas yang ragu
    // akan menutup dialognya dan mencari nama itu di tab pencarian, menemukan
    // kosong, lalu mengulang dari awal dengan yakin.
    if (!response) { setGalatWalkIn("Koneksi terputus. Tamu ini BELUM tersimpan, coba lagi."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setGalatWalkIn(pesanGalat(body, "Gagal disimpan. Coba lagi.")); return; }

    if (body.status === "possible_duplicate") {
      setKandidat((body.candidates ?? []) as Kandidat[]);
      return;
    }

    terapkanHasil(body as Hasil, sessionId);
    setDialogWalkIn(false);
    setFormWalkIn(FORM_KOSONG);
    setKandidat(null);
    // Kolom pencarian dikosongkan. Tamu ini selesai, dan kueri yang tertinggal
    // membuat tamu berikutnya dilayani di atas daftar milik orang sebelumnya.
    setKueri("");
  }

  /** Memakai peserta yang sudah ada, bukan membuat orang kedua bernama sama. */
  async function pakaiKandidat(baris: Kandidat) {
    setDialogWalkIn(false);
    setKandidat(null);
    setFormWalkIn(FORM_KOSONG);
    await kirim(baris.qr_code);
    setKueri("");
  }

  const sesiAktif = sessions.find((sesi) => sesi.id === sessionId);
  const hadir = sessionId === null ? null : hadirTerbaru[sessionId] ?? sesiAktif?.hadir ?? null;
  const perluJalur = lanes.length > 0 && laneId === null;
  const jalurAktif = lanes.find((jalur) => jalur.id === laneId);
  // Bilah meja terbuka sampai sesi (dan jalur, bila ada) benar-benar dipilih.
  // Terlipat sebelum itu berarti petugas tidak pernah melihat pertanyaannya.
  const mejaTerlipat = !mejaTerbuka && sessionId !== null && !perluJalur && !sesiHilang;

  /**
   * Apakah lembar yang sedang terbuka menutup sendiri.
   *
   * Hanya hijau "Tercatat hadir" (bukan walk-in, yang datanya masih perlu
   * diperiksa), hanya di sesi tanpa barang, tidak selama label dicetak atau
   * setelah printer gagal (kabarnya hanya ada di lembar ini), tidak bila ada
   * tamu yang tertahan, dan tidak setelah petugas menyentuh lembarnya. Dengan
   * cetak otomatis, hitungannya baru mulai setelah labelnya keluar.
   */
  const menungguCetakOtomatis = Boolean(label?.enabled) && bisaBluetooth && modeCetak === "semua";
  const hijau = hasil?.status === "recorded" || Boolean(hasil?.tersimpanSebelumnya);
  const lembarMenutup =
    tutupOtomatis &&
    hijau &&
    (sesiAktif?.jumlah_barang ?? 0) === 0 &&
    hitungBatal !== kedip &&
    tertahan === null &&
    cetak.fase !== "jalan" &&
    cetak.fase !== "galat" &&
    (!menungguCetakOtomatis || cetak.fase === "selesai");

  // Keadaan pencarian, seluruhnya diturunkan dari kueri yang sedang diketik dan
  // kunci yang menempel pada hasil terakhir. Tidak ada penanda "sedang memuat"
  // yang dijaga terpisah, jadi tidak ada keadaan yang bisa tertinggal menyala.
  const kueriBersih = kueri.trim();
  const cukupHuruf = kueriBersih.length >= 2;
  const kunciSekarang = `${sessionId ?? 0}|${kueriBersih}`;
  const cariSekarang = cari?.kunci === kunciSekarang ? cari : null;
  const mencari = cukupHuruf && cariSekarang === null;

  // Pewaktu sungguhan, milik satu hasil. Bukan akhir animasi bilahnya: dengan
  // gerak dikurangi animasinya tidak berjalan, dan lembarnya akan menutup
  // seketika. Penjaga `=== target` memastikan pewaktu yang basi tidak pernah
  // menutup lembar tamu berikutnya.
  useEffect(() => {
    if (!lembarMenutup || !hasil) return;
    const target = hasil;
    const pewaktu = window.setTimeout(() => {
      if (hasilRef.current !== target) return;
      hasilRef.current = null;
      setHasil(null);
    }, TUTUP_OTOMATIS_MS);
    return () => window.clearTimeout(pewaktu);
  }, [hasil, lembarMenutup]);

  const pil = membaca
    ? { teks: "Terbaca, menyimpan…", nada: "bg-primary text-on-primary" }
    : terakhirHadir
      ? { teks: `Terakhir: ${terakhirHadir.nama} · ${jam(terakhirHadir.waktu)}`, nada: "bg-black/60 text-white" }
      : { teks: "Siap memindai", nada: "bg-black/60 text-white" };

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <TopAppBar
        title="Pemindai kehadiran"
        subtitle={`${eventName || "Memuat..."}${username ? ` · ${username}` : ""}`}
        actions={<LogoutButton size="md" />}
        maxWidth="1280px"
      />

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        {/* -------------------------------------------------------------------
            Bilah meja.

            Sesi dan jalur disetel sekali di awal pagi lalu tidak disentuh lagi
            berjam-jam. Versi sebelumnya memberi keduanya satu kartu penuh di
            puncak layar, sehingga bagian yang paling jarang dipakai justru yang
            paling besar. Sekarang ia satu baris setinggi kolom isian.
            ------------------------------------------------------------------- */}
        {mejaTerlipat ? (
          // Satu tombol setinggi 56 px, seluruh barisnya. "Ganti" di ujungnya
          // hanya penanda; yang ditekan adalah barisnya.
          <button
            type="button"
            aria-expanded={false}
            aria-controls="bilah-meja"
            onClick={() => setMejaTerbuka(true)}
            className="m3-state flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface-container pl-4 pr-2 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-body-large">
              {sesiAktif?.name ?? "Sesi"}
              {jalurAktif ? <span className="text-on-surface-variant"> · {jalurAktif.name}</span> : null}
            </span>
            {offline ? <ChipOffline /> : null}
            <span className="flex min-h-12 shrink-0 items-center gap-1 rounded-full px-3 text-label-large text-primary">
              Ganti
              <CaretDown size={16} aria-hidden />
            </span>
          </button>
        ) : (
          <div id="bilah-meja" className="rounded-2xl bg-surface-container px-3 py-3 sm:px-4">
            {/* Lipat lagi hanya setelah semuanya terpilih. Barisnya sendiri di
                atas, supaya baris kolom di bawahnya tetap sama dengan sebelumnya
                dan tidak menyempit di ponsel. */}
            {sessionId !== null && !perluJalur ? (
              <div className="-mt-1 mb-1 flex items-center justify-between gap-2">
                <span className="text-title-small text-on-surface-variant">Sesi dan meja ini</span>
                <IconButton
                  label="Lipat bilah meja"
                  aria-expanded
                  aria-controls="bilah-meja"
                  onClick={() => { setMejaTerbuka(false); setSesiHilang(false); }}
                >
                  <CaretUp size={22} />
                </IconButton>
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <SelectField
                label="Sesi kehadiran"
                value={sessionId ?? ""}
                onChange={(event) => {
                  const id = Number(event.target.value) || null;
                  sessionRef.current = id;
                  setSessionId(id);
                  setSesiHilang(false);
                  tutupLembar();
                }}
                className="min-w-0 flex-1 sm:max-w-xs"
              >
                {sessions.length === 0 ? <option value="">Belum ada sesi</option> : null}
                {sessions.map((sesi) => <option key={sesi.id} value={sesi.id}>{sesi.name}</option>)}
              </SelectField>

              {/* Pemilih jalur hanya muncul kalau acara ini memang punya jalur.
                  Acara satu meja tidak boleh dipaksa memahami konsep yang tidak
                  dipakainya: kolom berisi satu pilihan adalah pertanyaan yang
                  jawabannya sudah pasti. */}
              {lanes.length > 0 ? (
                <SelectField
                  label="Jalur / meja"
                  value={laneId ?? ""}
                  onChange={(event) => gantiJalur(Number(event.target.value) || null)}
                  error={perluJalur ? "Belum dipilih" : undefined}
                  className="min-w-0 flex-1 sm:max-w-xs"
                >
                  <option value="">Pilih meja...</option>
                  {lanes.map((jalur) => <option key={jalur.id} value={jalur.id}>{jalur.name}</option>)}
                </SelectField>
              ) : null}

              {/* `lg` = 56px, tinggi yang sama persis dengan kolom pilihan di
                  sebelahnya. Ukuran yang lebih kecil menggantung di atas garis dasar
                  kolom dan membuat barisnya terbaca miring. */}
              <IconButton label="Muat ulang daftar sesi" variant="outlined" size="lg" onClick={() => void muatSesi()}>
                <ArrowsClockwise size={22} />
              </IconButton>

              {offline ? <ChipOffline className="self-center" /> : null}
            </div>
            {sesiHilang ? (
              <p role="alert" className="mt-2 text-body-medium text-error">
                Sesi yang tadi dipilih sudah ditutup. Pilih sesi lagi sebelum memindai.
              </p>
            ) : null}
          </div>
        )}

        {pesan ? (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-error-soft p-3 text-body-medium text-on-error-soft">
            <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
            {pesan}
          </p>
        ) : null}

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* ---------------------------------------------------------------
              Panggung
              --------------------------------------------------------------- */}
          <div className="min-w-0 space-y-4">
            {/* Tab, bukan segmented button. Keduanya BERGANTI TAMPILAN, dan itu
                yang membedakan tab dari segmented button di spesifikasi M3:
                segmented button menyaring isi yang sedang dilihat, tab
                menggantinya. Perbedaannya ikut terdengar, karena `tablist`
                mengumumkan panel yang dikendalikannya dan `radiogroup` tidak. */}
            <Tabs<Mode>
              label="Cara mencatat kehadiran"
              idPrefix="mode"
              size="lg"
              value={mode}
              onChange={gantiMode}
              options={[
                { value: "qr", label: "Pindai QR", icon: <QrCode size={20} aria-hidden /> },
                { value: "cari", label: "Cari nama", icon: <MagnifyingGlass size={20} aria-hidden /> },
              ]}
            />

            {mode === "qr" ? (
              <div role="tabpanel" id="mode-panel-qr" aria-labelledby="mode-tab-qr" className="space-y-3">
                {/* 4:5 di ponsel supaya bingkai bidiknya besar, dibatasi tinggi
                    layar supaya tombol dan kolom kode tetap terlihat di ponsel
                    pendek. Tablet dan layar lebar tetap 4:3 dan 16:9. */}
                <div className="relative aspect-[4/5] max-h-[52dvh] w-full overflow-hidden rounded-2xl bg-scrim sm:aspect-[4/3] lg:aspect-video">
                  {scanning ? (
                    <>
                      <video
                        ref={videoRef}
                        className="h-full w-full object-cover"
                        autoPlay
                        muted
                        playsInline
                        aria-label="Pratinjau kamera pemindai"
                      />
                      {/* Bingkai bidik. QR yang dipegang di luar tengah bingkai
                          tetap terbaca, tetapi tamu mengarahkan badge-nya ke
                          tempat yang ditunjukkan layar, dan yang di tengah
                          adalah yang paling tajam di hampir semua lensa ponsel. */}
                      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div
                          className={`aspect-square h-[62%] max-h-64 min-h-32 rounded-2xl transition-colors ${
                            membaca ? "border-4 border-primary-fixed-dim bg-white/10" : "border-2 border-on-primary/70"
                          }`}
                        />
                      </div>

                      {/* Kabar di atas gambar kamera, tempat mata petugas berada
                          saat mengarahkan ponsel. Pil di kiri: siap, terbaca dan
                          menyimpan, atau tamu terakhir yang tercatat. */}
                      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                        <p role="status" className={`flex min-h-8 min-w-0 items-center gap-2 rounded-full px-3 py-1 text-label-large ${pil.nada}`}>
                          {membaca ? (
                            <CircleNotch size={16} weight="bold" className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
                          ) : (
                            <span aria-hidden className="size-2 shrink-0 rounded-full bg-[#4ade80]" />
                          )}
                          <span className="truncate">{pil.teks}</span>
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <IconButton
                            label={suara ? "Suara nyala" : "Suara mati"}
                            selected={suara}
                            onClick={gantiSuara}
                            className="!rounded-full !bg-black/60 !text-white"
                          >
                            {suara ? <SpeakerHigh size={22} weight="fill" /> : <SpeakerSlash size={22} weight="fill" />}
                          </IconButton>
                          {senter.ada ? (
                            <IconButton
                              label={senter.nyala ? "Senter nyala" : "Senter mati"}
                              selected={senter.nyala}
                              onClick={() => void gantiSenter()}
                              className={senter.nyala ? "!rounded-full" : "!rounded-full !bg-black/60 !text-white"}
                            >
                              <Flashlight size={22} weight="fill" />
                            </IconButton>
                          ) : null}
                        </div>
                      </div>

                      {membaca ? (
                        <p
                          aria-hidden
                          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-title-medium text-white"
                          style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", letterSpacing: "0.04em" }}
                        >
                          {membaca}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-on-surface-variant">
                      <QrCode size={56} />
                      <p className="text-body-medium">Kamera mati</p>
                    </div>
                  )}
                </div>

                <Button
                  variant={scanning ? "outlined" : "filled"}
                  size="xl"
                  shape="pill"
                  block
                  onClick={() => { bukaSuara(); setScanning((current) => !current); }}
                  disabled={!sessionId}
                  icon={<QrCode size={24} weight="bold" aria-hidden />}
                >
                  {scanning ? "Matikan kamera" : "Nyalakan kamera"}
                </Button>

                {/* Jalur cadangan di dalam jalur cadangan. Kamera ponsel bisa
                    rusak, badge bisa terlipat, dan antrean tidak berhenti untuk
                    menunggu keduanya beres. */}
                <form
                  className="flex items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const kode = String(new FormData(form).get(KOLOM_KODE) ?? "").trim();
                    if (kode) { bukaSuara(); void kirim(kode); form.reset(); }
                  }}
                >
                  <TextField
                    className="min-w-0 flex-1"
                    label="Atau ketik kode peserta"
                    name={KOLOM_KODE}
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="mis. REG159425"
                    // Font mono lewat `style`, bukan kelas pada pembungkus:
                    // pembungkusnya juga memuat label, dan label berhuruf mono
                    // terbaca sebagai bagian dari kodenya.
                    style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
                  />
                  <Button type="submit" variant="tonal" size="lg" loading={sibuk} disabled={!sessionId}>
                    Catat
                  </Button>
                </form>
              </div>
            ) : (
              <Card role="tabpanel" id="mode-panel-cari" aria-labelledby="mode-tab-cari" padded={false} className="p-4 sm:p-5">
                <TextField
                  label="Cari nama atau instansi"
                  type="search"
                  size="lg"
                  value={kueri}
                  onChange={(event) => setKueri(event.target.value)}
                  autoComplete="off"
                  placeholder="Hanung, Werkudara, REG159425..."
                  leading={<MagnifyingGlass size={20} />}
                  hint="Boleh sepenggal dan boleh dibolak-balik."
                />

                <div className="mt-4" aria-busy={mencari}>
                  {!cukupHuruf ? (
                    <p className="rounded-lg bg-surface-container px-4 py-8 text-center text-body-medium text-on-surface-variant">
                      Ketik minimal dua huruf untuk mulai mencari.
                    </p>
                  ) : mencari ? (
                    <SearchResultsSkeleton rows={3} />
                  ) : cariSekarang?.gagal ? (
                    <EmptyState
                      icon={<WarningCircle size={40} />}
                      title="Pencarian gagal"
                      description="Jaringan venue sedang tidak menjawab. Ubah satu huruf pada kata kuncinya untuk mengulang, atau pakai tab Pindai QR sementara."
                    />
                  ) : cariSekarang && cariSekarang.hasil.length === 0 ? (
                    /* Satu-satunya tempat tombol walk-in muncul di jalur
                       pencarian, dan itu disengaja. Tombol yang berdiri sendiri
                       di bilah atas akan ditekan lebih dulu daripada kolom
                       pencarian, dan hasilnya satu tamu tercatat sebagai tiga
                       peserta karena namanya dieja berbeda oleh tiga petugas.
                       Melewati pencarian menjadi mustahil ketika tombolnya hanya
                       ada di dalam hasil pencarian yang kosong. */
                    <EmptyState
                      icon={<MagnifyingGlass size={40} />}
                      title="Tidak ada yang cocok"
                      description={
                        allowWalkIn
                          ? "Coba potongan nama yang lebih pendek, atau cari dengan nama instansinya. Kalau tetap kosong, tamu ini memang belum terdaftar."
                          : "Coba potongan nama yang lebih pendek, atau cari dengan nama instansinya. Kalau tetap kosong, tamu ini belum terdaftar. Arahkan ke meja panitia."
                      }
                      action={
                        allowWalkIn ? (
                          <Button
                            size="lg"
                            disabled={!sessionId}
                            onClick={() => bukaWalkIn(kueriBersih)}
                            icon={<UserPlus size={20} weight="bold" aria-hidden />}
                          >
                            Daftarkan sebagai tamu walk-in
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <>
                      {/* Wadah bernada, bukan kotak bergaris. M3 mendahulukan
                          elevasi tonal: naikkan tier `surface-container` sebelum
                          menambah garis atau bayangan. Garis disisakan untuk tepi
                          yang membawa arti, seperti kolom isian. */}
                      <ul key={cariSekarang?.kunci} className="rise-in-fast divide-y divide-outline-variant overflow-hidden rounded-lg bg-surface-container">
                        {(cariSekarang?.hasil ?? []).map((baris) => {
                          const sudahHadir = baris.scan_count > 0;
                          return (
                            <li key={baris.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                              <span
                                aria-hidden
                                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-large font-semibold text-on-secondary-container"
                              >
                                {inisial(baris.name)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-body-large font-semibold">{baris.name}</p>
                                <p className="truncate text-body-small text-on-surface-variant">
                                  {[baris.company, baris.title].filter(Boolean).join(" · ") || baris.qr_code}
                                </p>
                                {/* Status dibawa ikon DAN teks, tidak hanya warna. */}
                                {sudahHadir ? (
                                  <p className="mt-1 text-label-medium text-warning">
                                    Sudah hadir {jam(baris.first_scan_at)}, {baris.scan_count} kali
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                variant={sudahHadir ? "outlined" : "filled"}
                                size="md"
                                onClick={() => { bukaSuara(); void catatDariCari(baris); }}
                                loading={mencatatId === baris.id}
                                disabled={!sessionId || (sibuk && mencatatId !== baris.id)}
                                icon={<UserCheck size={18} weight="bold" aria-hidden />}
                                className="shrink-0"
                              >
                                <span className="hidden sm:inline">{sudahHadir ? "Catat lagi" : "Catat hadir"}</span>
                                <span className="sr-only sm:hidden">
                                  {sudahHadir ? `Catat lagi ${baris.name}` : `Catat hadir ${baris.name}`}
                                </span>
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                      {/* Pemotongan diberitahukan, bukan didiamkan. Daftar yang
                          diam-diam dipotong terbaca sebagai "hanya ini yang ada",
                          dan petugas berhenti mencari orang yang sebenarnya
                          terdaftar. */}
                      {cariSekarang?.terpotong ? (
                        <p className="mt-3 text-body-small text-on-surface-variant">
                          Menampilkan 25 teratas. Persempit kata kuncinya dengan menambahkan nama instansi.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            )}

          </div>

          {/* ---------------------------------------------------------------
              Panel meja.

              Satu kartu, bukan empat. Versi sebelumnya menumpuk empat kartu
              sederajat di kolom ini, sehingga tidak ada satu pun yang terbaca
              sebagai yang utama. Sekarang angka hadir memimpin, dan sisanya
              adalah bagian di bawah garis pemisah.
              --------------------------------------------------------------- */}
          <aside className="lg:sticky lg:top-[88px]">
            <Card>
              <p className="text-label-large text-on-surface-variant">{sesiAktif?.name ?? "Belum ada sesi"}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-display-small tabular-nums">{hadir ?? "0"}</span>
                <span className="text-body-medium text-on-surface-variant">orang hadir</span>
              </p>
              <p className="mt-1 text-body-small text-on-surface-variant">
                Peserta unik. Pemindaian ulang menambah catatan, bukan angka ini.
              </p>

              {label?.enabled ? (
                <>
                  <Divider className="my-4" />
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-title-small">
                      <Printer size={18} aria-hidden />
                      Printer meja ini
                    </h2>
                    {bisaBluetooth ? (
                      <span className={`text-label-medium ${printer ? "text-success" : "text-on-surface-variant"}`}>
                        {printer ? "tersambung" : "belum"}
                      </span>
                    ) : null}
                  </div>

                  {!bisaBluetooth ? (
                    <p className="mt-2 text-body-small text-on-surface-variant">
                      Peramban di perangkat ini tidak punya Bluetooth, dan iPhone, iPad, serta Firefox memang tidak
                      pernah punya. Tombol cetak tetap ada dan menyimpan labelnya sebagai gambar untuk dicetak dari
                      aplikasi NIIMBOT.
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant={printer ? "outlined" : "filled"} size="md" onClick={() => void sambungPrinter()}>
                          {printer ? "Sambungkan ulang" : "Sambungkan"}
                        </Button>
                        {/* Menghabiskan satu lembar label, dan itu disebutkan.
                            Uji cetak yang diam-diam memakan label adalah cara
                            tercepat menghabiskan gulungan di pagi hari. */}
                        <Button variant="text" size="md" onClick={() => void cetakLabel(UJI_LABEL)}>
                          Uji cetak, 1 label
                        </Button>
                      </div>

                      {printer ? (
                        <p className="mt-2 text-body-small text-on-surface-variant">
                          {printer.label}
                          {printer.modelId != null ? ` · id ${printer.modelId}` : ""}
                        </p>
                      ) : null}

                      {/* Angka yang dilaporkan printer, bukan yang kita duga.
                          Inilah yang harus diketik admin di Setelan printer saat
                          tepi kanan label hilang, dan tidak ada layar lain yang
                          bisa menanyakannya. */}
                      {lebarKepala != null && lebarKepala !== label.head_px ? (
                        <p className="mt-2 rounded-lg bg-warning-soft p-3 text-body-small text-on-warning-soft">
                          Printer melaporkan lebar kepala cetak {lebarKepala} px, setelan acara memakai {label.head_px}.
                          Minta admin membetulkannya di Label &amp; printer.
                        </p>
                      ) : null}
                    </>
                  )}

                  {/* Tanpa Bluetooth tidak ada cetak otomatis: "mencetak" di sana
                      berarti membuka lembar bagikan, dan peramban menolaknya
                      tanpa ketukan. Penjelasannya sudah ada di paragraf atas. */}
                  {bisaBluetooth ? (
                    <div className="mt-4">
                      <p className="text-label-large text-on-surface-variant">Cetak otomatis</p>
                      <SegmentedButton
                        className="mt-2"
                        size="lg"
                        label="Kapan label dicetak sendiri"
                        value={modeCetak}
                        onChange={gantiModeCetak}
                        options={[
                          { value: "off" as const, label: "Mati" },
                          { value: "walkin" as const, label: "Walk-in" },
                          { value: "semua" as const, label: "Semua" },
                        ]}
                      />
                      <p className="mt-2 text-body-small text-on-surface-variant">
                        {modeCetak === "off"
                          ? "Label hanya tercetak kalau tombolnya ditekan."
                          : modeCetak === "walkin"
                            ? "Hanya tamu yang didaftarkan di meja ini. Peserta terdaftar sudah punya kodenya."
                            : "Setiap tamu yang baru tercatat hadir. Pemindaian ulang tidak ikut."}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}

              <Divider className="my-4" />
              {/* Per perangkat, seperti Suara. Meja yang memeriksa setiap tamu
                  lebih lama dari tiga detik mematikannya di sini. */}
              <Switch label="Tutup otomatis" checked={tutupOtomatis} onChange={gantiTutupOtomatis} />
              <p className="mt-2 text-body-small text-on-surface-variant">
                Lembar hijau di sesi tanpa barang menutup sendiri setelah 3 detik; sentuh lembarnya untuk menahan. Suara
                diatur dari tombol speaker di kamera. Di iPhone, bunyi ikut mati kalau sakelar senyap menyala.
              </p>

              {/* Pemasangan TV hanya muncul kalau jalurnya LEBIH DARI SATU. Kode
                  enam angka menjawab "TV ini melayani meja yang mana", dan
                  pertanyaan itu tidak ada ketika mejanya cuma satu. Terlipat,
                  karena dikerjakan sekali di pagi hari. */}
              {lanes.length > 1 ? (
                <>
                  <Divider className="my-4" />
                  <details>
                    <summary className="m3-state flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-title-small">
                      Layar sapa di meja ini
                      <CaretDown size={18} aria-hidden />
                    </summary>
                    <p className="mt-2 text-body-small text-on-surface-variant">
                      TV yang belum terpasang menampilkan enam angka. Ketik angkanya di sini.
                    </p>
                    <form
                      className="mt-3 flex items-end gap-2"
                      onSubmit={(event) => { event.preventDefault(); void pasangLayar(kodeLayar); }}
                    >
                      <TextField
                        className="min-w-0 flex-1"
                        label="Kode layar"
                        value={kodeLayar}
                        onChange={(event) => setKodeLayar(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        // `inputMode` numerik, bukan `type="number"`: kode ini
                        // bisa diawali nol, dan input angka membuang nol di depan
                        // pada sebagian peramban.
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="000000"
                        style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", letterSpacing: "0.2em" }}
                      />
                      <Button type="submit" variant="tonal" size="lg" loading={memasang} disabled={kodeLayar.length !== 6 || !laneId}>
                        Hubungkan
                      </Button>
                    </form>
                    {pesanLayar ? (
                      <p role="status" className={`mt-3 text-body-small ${pesanLayar.nada === "ok" ? "text-primary" : "text-error"}`}>
                        {pesanLayar.teks}
                      </p>
                    ) : null}
                  </details>
                </>
              ) : null}

              <Divider className="my-4" />
              <h2 className="text-title-small">Pemindaian terakhir</h2>
              {riwayat.length === 0 ? (
                <p className="mt-2 text-body-small text-on-surface-variant">
                  Belum ada yang dipindai di perangkat ini sejak layar dibuka.
                </p>
              ) : (
                <ul className="mt-1 divide-y divide-outline-variant">
                  {riwayat.slice(0, 8).map((baris, index) => (
                    <li key={`${baris.waktu}-${index}`} className="flex items-center justify-between gap-3 py-2 text-body-medium">
                      <span className="min-w-0 flex-1 truncate">{baris.nama}</span>
                      <span className={RIWAYAT[baris.status].kelas}>{RIWAYAT[baris.status].teks}</span>
                      <span className="tabular-nums text-on-surface-variant">{jam(baris.waktu)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </main>

      {/* Modal hasil dan dialog walk-in adalah dua lapisan yang tidak boleh
          bertumpuk. Lihat `onWalkIn`: yang satu ditutup sebelum yang lain
          dibuka, supaya petugas tidak perlu menutup dua lapis untuk kembali. */}
      <ResultSheet
        hasil={hasil}
        kedip={kedip}
        onTutup={tutupLembar}
        bisaCetak={Boolean(label?.enabled)}
        labelUntukPerangkatIni={bisaBluetooth}
        cetak={cetak}
        onCetak={() => { if (hasil?.participant) void cetakLabel(hasil.participant); }}
        bolehWalkIn={allowWalkIn}
        onWalkIn={() => { tutupLembar(); bukaWalkIn(""); }}
        onUlangi={() => {
          // Langsung ke server, melewati tahanan kode-sama: petugas menekannya
          // dengan sengaja.
          const kode = hasil?.qr;
          if (kode) void kirim(kode);
        }}
        barang={sessionId !== null && (sesiAktif?.jumlah_barang ?? 0) > 0 ? { sessionId, laneId } : null}
        onCentang={onCentang}
        tutupOtomatis={lembarMenutup}
        onSentuh={() => setHitungBatal(kedip)}
        tertahan={tertahan}
        onLewati={lewatiBarang}
      />

      <WalkinDialog
        open={dialogWalkIn}
        onClose={() => setDialogWalkIn(false)}
        form={formWalkIn}
        onForm={setFormWalkIn}
        fields={walkinFields}
        kandidat={kandidat}
        onLupakanKandidat={() => setKandidat(null)}
        sesiNama={sesiAktif?.name ?? "yang dipilih"}
        menyimpan={menyimpanWalkIn}
        galat={galatWalkIn}
        onSimpan={(paksa) => void simpanWalkIn(paksa)}
        onPakaiKandidat={(baris) => void pakaiKandidat(baris)}
        bisaSimpan={Boolean(formWalkIn.name.trim()) && sessionId != null}
      />
    </div>
  );
}
