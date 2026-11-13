"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FORM_KOSONG, type BarisCari, type FormWalkIn, type Hasil, type Jalur, type Kandidat, type ModeCetak, type SasaranPemindai, type Sesi, type StatusCetak } from "../types";
import { useRouter } from "next/navigation";
import { type StatusDaftar } from "../daftar-hadir";
import type { RegistrationField } from "@/lib/domain";
import { aturanWalkIn, type AturanWalkIn } from "@/lib/walkin-form";
import type { LabelSettings } from "@/lib/label/layout";
import { printerSupported, type PrinterInfo } from "@/lib/label/printer";
import { useCetakMeja } from "../cetak-meja";
import { BATAS_RIWAYAT, BarisRiwayat, Mode, TAHAN_SUKSES_MS, bacaRiwayat, langgananKosong, simpanRiwayat } from "./pindai-bantu";

/** Bagian 1 dari 7 badan ScanClient, dipindah apa adanya (audit platform, Fase 3). */
export function useScanClient0() {
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
  // Show QR (scan mandiri) yang dipilih petugas per sesi. Bawaan: QR tampil,
  // karena sesi itu memang disiapkan untuk dipindai peserta sendiri.
  const [pilihTampilQr, setPilihTampilQr] = useState<Record<number, boolean>>({});
  const mandiri = sessions.find((sesi) => sesi.id === sessionId)?.self_scan ?? null;
  const tampilQr = mode === "qr" && sessionId !== null && (mandiri === "self" || (mandiri === "both" && (pilihTampilQr[sessionId] ?? true)));
  // Kamera tidak menyala di belakang QR yang sedang ditampilkan.
  const kamera = scanning && !tampilQr;
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
  // Peserta aktif acara, seluruh meja. Null sampai terbaca, atau bila hitungannya
  // gagal: layar lalu kembali ke angka hadir saja, tanpa "dari".
  const [terdaftar, setTerdaftar] = useState<number | null>(null);
  // Sesi yang dipakai checkpoint bertautan baris Agenda dengan Who sees it
  // (titik kumpul Batch 1): yang diharapkan di sana, dari server
  // (lib/pantau-checkin.ts sasaranSesi). `dasar` = angka hadir semua orang saat
  // angka ini dibaca, supaya pindaian sesudahnya ikut menaikkan angka sampai
  // pembaruan 30 detik berikutnya.
  const [sasaran, setSasaran] = useState<Record<number, SasaranPemindai & { dasar: number | null }>>({});
  const [riwayat, setRiwayat] = useState<BarisRiwayat[]>([]);
  // Dibaca setelah hidrasi (localStorage tidak ada di server), lalu disimpan
  // setiap kali berubah. `riwayatDimuat` mencegah daftar kosong awal menimpa
  // simpanan sebelum sempat dibaca.
  const riwayatDimuat = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const lama = bacaRiwayat();
      if (lama.length) setRiwayat((sekarang) => [...sekarang, ...lama].slice(0, BATAS_RIWAYAT));
      riwayatDimuat.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (riwayatDimuat.current) simpanRiwayat(riwayat);
  }, [riwayat]);
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
  // Kamera depan atau belakang. Tombolnya hanya muncul bila perangkat punya
  // lebih dari satu kamera (laptop dan sebagian tablet hanya punya satu).
  const [kameraDepan, setKameraDepan] = useState(false);
  const [bisaGantiKamera, setBisaGantiKamera] = useState(false);
  const kontrolKameraRef = useRef<{ stop: () => void; switchTorch?: (nyala: boolean) => Promise<void> } | null>(null);

  // ---- Bilah meja -------------------------------------------------------------
  // Lembar sesi/meja yang dibuka petugas sendiri. Yang terbuka karena meja
  // belum disiapkan diturunkan dari keadaan, lihat `perluSetup`.
  const [lembarMeja, setLembarMeja] = useState(false);
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [keluarJalan, setKeluarJalan] = useState(false);
  // Ada pemindaian yang ditolak karena meja belum dipilih. Ditampilkan di
  // lembar meja, satu-satunya yang terlihat saat itu.
  const [pindaiDitolak, setPindaiDitolak] = useState(false);
  const router = useRouter();
  const [sesiHilang, setSesiHilang] = useState(false);
  const sessionRef = useRef<number | null>(null);

  // ---- Lembar hasil -----------------------------------------------------------
  const [tutupOtomatis, setTutupOtomatis] = useState(true);
  // `kedip` lembar yang hitung mundurnya dihentikan oleh sentuhan petugas.
  const [hitungBatal, setHitungBatal] = useState<number | null>(null);
  // Centang barang yang belum diserahkan. Selama masih ada, hasil berikutnya
  // menunggu (`tertahan`) dan tidak mengganti lembar.
  const centangRef = useRef(0);
  // Sama untuk bagasi: 1 selama jumlah atau foto tamu ini belum tersimpan.
  const bagasiRef = useRef(0);
  const [alasanTahan, setAlasanTahan] = useState<"barang" | "bagasi" | "ambil">("barang");
  // Acara ini punya Luggage number (Check-in > sesi > Luggage): di meja bagasi
  // pencarian menyebutnya dan hasilnya menampilkan nomornya.
  const [nomorBagasi, setNomorBagasi] = useState(false);
  // Sesi aktif adalah meja ambil bagasi: kalimat tamu tertahan berbunyi "Hand over".
  const sesiAmbilRef = useRef(false);
  const [tertahan, setTertahan] = useState<Hasil | null>(null);
  const tertahanRef = useRef<Hasil | null>(null);
  const hasilRef = useRef<Hasil | null>(null);
  // Percobaan terakhir yang gagal, untuk mengenali Ulangi yang ternyata sudah
  // tersimpan (jawabannya hilang, bukan permintaannya).
  const gagalRef = useRef<{ qr: string; waktu: number } | null>(null);
  // Kode yang tercatat di ponsel ini beberapa detik terakhir. Lihat BARUSAN_MS.
  const barusanRef = useRef<Map<string, { waktu: number; hasil: Hasil }>>(new Map());

  const [kueri, setKueri] = useState("");
  // Daftar Not yet / Checked in di Find name (daftar-hadir.tsx). "See who" di
  // kartu hitungan membuka tab ini tanpa memunculkan papan ketik.
  const [statusDaftar, setStatusDaftar] = useState<StatusDaftar>("belum");
  const [fokusCari, setFokusCari] = useState(true);
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
  const [walkinWajib, setWalkinWajib] = useState<AturanWalkIn>(() => aturanWalkIn(null));
  const [galatKolomWalkIn, setGalatKolomWalkIn] = useState<Record<string, string>>({});
  const [tolakSimpanWalkIn, setTolakSimpanWalkIn] = useState(0);
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

  // ---- Badge kertas lewat stasiun cetak (cetak-meja.tsx) -------------------
  // Null: acara ini tidak mencetak badge kertas di meja. `siap: false`: memilih
  // badge, tetapi migrasi stasiun belum dijalankan.
  const [badgeMeja, setBadgeMeja] = useState<{ siap: boolean; menit: number } | null>(null);
  const [eventSlug, setEventSlug] = useState("");
  const suaraNyala = useCallback(() => suaraRef.current, []);
  const meja = useCetakMeja(Boolean(badgeMeja?.siap), laneId, suaraNyala);
  const { bodyCetak, catat: catatCetak } = meja;
  // Pekerjaan Print again yang dibuat dari lembar `kedip` ini, menggantikan
  // pekerjaan yang datang bersama jawaban scan.
  const [ulangLembar, setUlangLembar] = useState<{ kedip: number; id: number } | null>(null);
  const [mengantre, setMengantre] = useState(false);
  const [gantiJob, setGantiJob] = useState<number | null>(null);

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
  return { sessions, setSessions, sessionId, setSessionId, lanes, setLanes, laneId, setLaneId, laneRef, kodeLayar, setKodeLayar, memasang, setMemasang, pesanLayar, setPesanLayar, eventName, setEventName, username, setUsername, mode, setMode, scanning, setScanning, pilihTampilQr, setPilihTampilQr, mandiri, tampilQr, kamera, hasil, setHasil, kedip, setKedip, hadirTerbaru, setHadirTerbaru, terdaftar, setTerdaftar, sasaran, setSasaran, riwayat, setRiwayat, riwayatDimuat, pesan, setPesan, sibuk, setSibuk, membaca, setMembaca, offline, setOffline, terakhirHadir, setTerakhirHadir, suara, setSuara, suaraRef, senter, setSenter, kameraDepan, setKameraDepan, bisaGantiKamera, setBisaGantiKamera, kontrolKameraRef, lembarMeja, setLembarMeja, menuTerbuka, setMenuTerbuka, keluarJalan, setKeluarJalan, pindaiDitolak, setPindaiDitolak, router, sesiHilang, setSesiHilang, sessionRef, tutupOtomatis, setTutupOtomatis, hitungBatal, setHitungBatal, centangRef, bagasiRef, alasanTahan, setAlasanTahan, nomorBagasi, setNomorBagasi, sesiAmbilRef, tertahan, setTertahan, tertahanRef, hasilRef, gagalRef, barusanRef, kueri, setKueri, statusDaftar, setStatusDaftar, fokusCari, setFokusCari, cari, setCari, mencatatId, setMencatatId, allowWalkIn, setAllowWalkIn, walkinFields, setWalkinFields, walkinWajib, setWalkinWajib, galatKolomWalkIn, setGalatKolomWalkIn, tolakSimpanWalkIn, setTolakSimpanWalkIn, dialogWalkIn, setDialogWalkIn, formWalkIn, setFormWalkIn, kandidat, setKandidat, menyimpanWalkIn, setMenyimpanWalkIn, galatWalkIn, setGalatWalkIn, label, setLabel, printer, setPrinter, lebarKepala, setLebarKepala, cetak, setCetak, modeCetak, setModeCetak, badgeMeja, setBadgeMeja, eventSlug, setEventSlug, suaraNyala, meja, bodyCetak, catatCetak, ulangLembar, setUlangLembar, mengantre, setMengantre, gantiJob, setGantiJob, bisaBluetooth, videoRef, terakhirRef };
}
