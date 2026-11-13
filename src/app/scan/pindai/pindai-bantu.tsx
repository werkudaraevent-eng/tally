"use client";

import { type Hasil, type Jalur, type ModeCetak } from "../types";
import type { LabelData } from "@/lib/label/layout";
import { WifiSlash } from "@phosphor-icons/react";

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
export const KUNCI_JALUR = "scan-lane-id";

/**
 * Kapan ponsel INI mencetak sendiri.
 *
 * Printer label tergeletak di satu meja. Lima meja registrasi bisa berbagi satu
 * printer, dan setelan per acara akan menyuruh empat ponsel lain mencetak ke
 * perangkat yang tidak ada di dekatnya. Yang tahu ada printer di sebelahnya
 * adalah ponsel itu sendiri.
 */
export const KUNCI_CETAK = "scan-label-autoprint";

/** Lembar hijau menutup sendiri. Bawaan nyala; disimpan per perangkat, seperti Suara. */
export const KUNCI_TUTUP = "scan-tutup-otomatis";
/** "1" = kamera depan. Disimpan per perangkat: HP yang dipasang tetap di meja
 *  sebagai kios (peserta menyodorkan QR ke layar) tidak perlu diatur ulang. */
export const KUNCI_KAMERA_DEPAN = "scan-kamera-depan";

/** Nama kolom "ketik kode peserta". Pemindai genggam boleh mengetik ke sana. */
export const KOLOM_KODE = "qr";

/** Permintaan yang tidak terjawab selama ini dianggap gagal, bukan dibiarkan berputar. */
export const BATAS_TUNGGU_MS = 8000;

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
export const TAHAN_SUKSES_MS = 2500;
export const TAHAN_GAGAL_MS = 1000;

/**
 * Tamu yang tercatat di ponsel ini, di sesi yang sama, dalam jendela ini tidak
 * dikirim ulang. Server akan menjawab "sudah pernah dipindai", jumlah hadir
 * tidak berubah, dan lembar hijau tamu yang baru datang berganti oranye di
 * depan matanya. Yang dibuka lagi adalah lembar hijaunya sendiri, tanpa kirim.
 *
 * Kuncinya sesi + kode, dan daftarnya dikosongkan saat sesi atau meja diganti:
 * "salah sesi, pindai ulang" adalah koreksi yang harus sampai ke server.
 */
export const BARUSAN_MS = 30_000;

/**
 * Jawaban `duplicate` atas Ulangi dianggap tersimpan pada percobaan yang gagal
 * hanya bila pemindaian pertamanya terjadi SESUDAH percobaan itu dikirim,
 * menurut jam server. Selisih jam tablet dihitung dari header `Date` jawaban;
 * kelonggaran ini menutup pembulatan header ke detik dan waktu tempuh.
 * Satu arah: pemindaian yang lebih tua adalah duplikat sungguhan.
 */
export const KELONGGARAN_JAM_MS = 5_000;

/**
 * Riwayat pindaian ponsel ini, disimpan sampai akhir hari.
 *
 * Dulu hanya di memori: justru saat sinyal jelek petugas memuat ulang halaman,
 * dan bukti siapa yang barusan masuk ikut hilang. Kuncinya per alamat acara
 * (`/e/<slug>`), tanggalnya tanggal ponsel; hari berganti = daftar kosong.
 * Hanya nama, status, dan jam: tidak ada kode QR di sini.
 */
export type BarisRiwayat = { nama: string; status: Hasil["status"]; waktu: string; antre?: string; alasan?: string };
export const BATAS_RIWAYAT = 50;
export function kunciRiwayat(): string {
  const awalan = window.location.pathname.match(/^\/e\/[^/]+/)?.[0] ?? "";
  return `scan-riwayat:${awalan}`;
}
export function tanggalPonsel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function bacaRiwayat(): BarisRiwayat[] {
  try {
    const isi = JSON.parse(window.localStorage.getItem(kunciRiwayat()) ?? "null") as { tanggal?: string; baris?: BarisRiwayat[] } | null;
    if (!isi || isi.tanggal !== tanggalPonsel() || !Array.isArray(isi.baris)) return [];
    return isi.baris.filter((b) => typeof b?.nama === "string" && typeof b?.waktu === "string").slice(0, BATAS_RIWAYAT);
  } catch {
    return [];
  }
}
export function simpanRiwayat(baris: BarisRiwayat[]) {
  try {
    window.localStorage.setItem(kunciRiwayat(), JSON.stringify({ tanggal: tanggalPonsel(), baris: baris.slice(0, BATAS_RIWAYAT) }));
  } catch { /* penyimpanan penuh atau tidak tersedia: riwayat tetap di memori */ }
}

/**
 * Antrean check-in tanpa sinyal (Check-in > Sessions > Allow check-in without
 * signal). Satu pindaian yang gagal sampai ke server disimpan di sini dan
 * dikirim belakangan dengan waktu pindai aslinya. Kodenya ikut disimpan di
 * ponsel ini sampai terkirim: itu kode yang baru saja dibaca kamera ponsel ini
 * sendiri, bukan daftar peserta yang diunduh.
 */
export type Antre = { id: string; kode?: string; pesertaId?: string; nama?: string; sesi: number; jalur: number | null; waktu: string };
export function kunciAntrean(): string {
  const awalan = window.location.pathname.match(/^\/e\/[^/]+/)?.[0] ?? "";
  return `scan-antrean:${awalan}`;
}
export function bacaAntrean(): Antre[] {
  try {
    const isi = JSON.parse(window.localStorage.getItem(kunciAntrean()) ?? "[]") as Antre[];
    return Array.isArray(isi) ? isi.filter((a) => typeof a?.id === "string" && typeof a?.sesi === "number") : [];
  } catch {
    return [];
  }
}
export function simpanAntrean(daftar: Antre[]) {
  try {
    if (daftar.length) window.localStorage.setItem(kunciAntrean(), JSON.stringify(daftar));
    else window.localStorage.removeItem(kunciAntrean());
  } catch { /* penyimpanan tidak tersedia: antrean tetap di memori sampai halaman ditutup */ }
}

export function bacaKameraDepan(): boolean {
  try {
    return window.localStorage.getItem(KUNCI_KAMERA_DEPAN) === "1";
  } catch {
    return false;
  }
}

export function bacaTutupOtomatis(): boolean {
  try {
    return window.localStorage.getItem(KUNCI_TUTUP) !== "0";
  } catch {
    return true;
  }
}

/** Tidak ada yang perlu dilangganani: kemampuan peramban tidak berubah saat halaman terbuka. */
export const langgananKosong = () => () => {};

/**
 * Membaca mode cetak yang tersimpan, termasuk bentuk lamanya.
 *
 * Versi pertama menyimpan sakelar dua posisi sebagai "1". Perangkat yang sudah
 * menyalakannya tidak boleh kehilangan pilihannya hanya karena bentuk datanya
 * bertambah; "1" berarti persis apa yang dulu dijanjikan sakelar itu, yaitu
 * cetak untuk tamu walk-in.
 */
export function bacaModeCetak(): ModeCetak {
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
export function pilihJalur(daftar: Jalur[], sekarang: number | null): number | null {
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

/** `riwayat` hanya di ponsel; di layar lebar riwayat selalu tampil di panel kanan. */
export type Mode = "qr" | "cari" | "riwayat";

/**
 * Kata di kolom kanan daftar pemindaian terakhir.
 *
 * Peta, bukan rantai ternari: rantainya sudah salah sekali ketika status keempat
 * ditambahkan, dan apa pun yang bukan recorded atau duplicate terbaca "gagal",
 * termasuk peserta yang baru saja berhasil didaftarkan.
 */
export const RIWAYAT: Record<Hasil["status"], { teks: string; kelas: string }> = {
  recorded: { teks: "checked in", kelas: "text-success" },
  created: { teks: "new", kelas: "text-primary" },
  duplicate: { teks: "repeat", kelas: "text-warning" },
  not_found: { teks: "failed", kelas: "text-error" },
  // Tiga yang terakhir tidak pernah masuk riwayat: tidak ada yang tercatat.
  gagal: { teks: "not saved", kelas: "text-error" },
  login: { teks: "not saved", kelas: "text-error" },
  ditolak: { teks: "rejected", kelas: "text-error" },
  antri: { teks: "waiting to send", kelas: "text-warning" },
};

/** Label History yang lebih tepat dari "failed" bila server memberi alasannya. */
export const ALASAN_RIWAYAT: Record<string, string> = { cancelled: "cancelled", other_event: "other event" };
export const labelRiwayat = (baris: BarisRiwayat) =>
  (baris.status === "not_found" && baris.alasan && ALASAN_RIWAYAT[baris.alasan]) || RIWAYAT[baris.status].teks;

export const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

/**
 * Isi label uji cetak.
 *
 * Bukan data contoh dari CMS: kode contoh di sana berbentuk seperti kode
 * sungguhan, dan label uji yang membawa kode milik peserta nyata bisa menempel
 * di dada orang yang salah. TEST0000 tidak akan pernah cocok dengan siapa pun,
 * karena kode peserta selalu berawalan REG diikuti enam angka.
 */
export const UJI_LABEL: LabelData = { name: "Test print", company: "Printer test", title: null, qr_code: "TEST0000" };

export type JawabanGalat = { error?: { message?: string; details?: unknown } };

/**
 * Kalimat yang benar-benar ditampilkan dari sebuah jawaban galat.
 *
 * Tiga bentuk `details` beredar di API ini: `{ message }` yang ditulis tangan di
 * route handler, peta `{ "extra.ukuran_kaus": "..." }` dari pemeriksaan jawaban
 * formulir, dan `flatten()` milik Zod. Yang ketiga paling mudah terlewat, dan
 * hasilnya petugas membaca "Could not save. Try again." untuk sebuah kolom yang
 * sebenarnya sudah disebutkan namanya oleh server.
 */
export function pesanGalat(body: JawabanGalat, cadangan: string): string {
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
export function pesanPrinter(error: unknown): string {
  const nama = error instanceof Error ? error.name : "";
  const pesan = error instanceof Error ? error.message : String(error ?? "");
  if (nama === "NotFoundError") {
    return "No printer was chosen. Make sure the printer is on and not connected to another phone.";
  }
  if (nama === "NotAllowedError") {
    return "The browser needs the printer chosen again. Tap Print label once more, then choose the printer.";
  }
  if (nama === "SecurityError") {
    return "Bluetooth only works over HTTPS. Open this screen from an https address.";
  }
  if (/Web Bluetooth unavailable/i.test(pesan)) {
    return "This browser has no Bluetooth. Use Chrome or Edge on Android, Windows or macOS.";
  }
  return pesan || "The printer is not responding. Check its power and label roll.";
}

/** Dua huruf awal dari dua kata pertama. Cukup untuk membedakan baris sekilas. */
export const inisial = (nama: string) =>
  nama
    .split(/\s+/)
    .slice(0, 2)
    .map((kata) => kata.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * Penanda bahwa permintaan TERAKHIR gagal sampai ke server. Ikon plus kata,
 * bukan warna saja. Hilang sendiri pada jawaban berikutnya yang berhasil.
 */
export function ChipOffline({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-error px-2.5 text-label-medium font-semibold text-on-error ${className}`}>
      <WifiSlash size={14} weight="bold" aria-hidden />
      Offline
    </span>
  );
}
