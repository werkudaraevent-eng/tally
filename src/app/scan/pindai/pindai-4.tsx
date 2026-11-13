"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { eventApiPath } from "@/lib/event-url";
import { type BarisCari } from "../types";
import { Mode } from "./pindai-bantu";
import type { useScanClient0 } from "./pindai-0";
import type { useScanClient1 } from "./pindai-1";
import type { useScanClient3 } from "./pindai-3";

/** Bagian 5 dari 7 badan ScanClient, dipindah apa adanya (audit platform, Fase 3). */
export function useScanClient4(c: Awaited<ReturnType<typeof useScanClient0>> & Awaited<ReturnType<typeof useScanClient1>> & Awaited<ReturnType<typeof useScanClient3>>) {
  const { bagasiRef, centangRef, dialogWalkIn, gantiJob, hasilRef, kueri, lembarMeja, menuTerbuka, mode, nomorBagasi, pasangLembar, scanning, sessionId, sessions, setCari, setDialogWalkIn, setFokusCari, setGantiJob, setLembarMeja, setMenuTerbuka, setMode, setScanning, setTertahan, tertahanRef, tutupLembar } = c;
  // Meja titip bagasi: check-in sudah tercatat saat scan, jumlah bagasi baru
  // tersimpan saat petugas menekan simpan. Lembar yang ditutup lebih dulu
  // meninggalkan peserta ter-check-in tanpa catatan bagasi ("No luggage
  // recorded"), jadi petugas ditanya dulu. Hanya tombol tutup oleh petugas;
  // walk-in, cari dan tamu berikutnya punya jalurnya sendiri.
  const [tanyaTutup, setTanyaTutup] = useState(false);
  const bagasiTitipAktif = Boolean(sessions.find((sesi) => sesi.id === sessionId)?.bagasi);
  const mintaTutup = useCallback(() => {
    // 2 = jumlahnya belum pernah tersimpan (LuggageForm). Foto gagal atau Edit
    // catatan lama tidak ditanya: jumlahnya sudah aman.
    if (bagasiTitipAktif && bagasiRef.current === 2) { setTanyaTutup(true); return; }
    tutupLembar();
  }, [bagasiTitipAktif, tutupLembar, bagasiRef]);

  // Gestur kembali (geser dari tepi layar, tombol back Android) di ponsel
  // petugas. Halaman ini dibuka dari daftar acara, jadi satu geseran tak
  // sengaja melempar petugas keluar dari scanner di tengah antrean. Seperti
  // aplikasi Android: kembali menutup lapisan teratas dulu (dialog, lembar
  // hasil, menu); tanpa lapisan terbuka, geseran pertama hanya memberi tahu,
  // geseran kedua dalam 3 detik baru keluar. Satu entri riwayat penjaga
  // dipasang setelah sentuhan pertama: entri tanpa aktivasi pengguna dilewati
  // tombol back Chrome.
  const [pesanKembali, setPesanKembali] = useState(false);
  const tutupLapisanRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    tutupLapisanRef.current = () => {
      if (tanyaTutup) { setTanyaTutup(false); return true; }
      if (gantiJob !== null) { setGantiJob(null); return true; }
      if (dialogWalkIn) { setDialogWalkIn(false); return true; }
      if (hasilRef.current) { mintaTutup(); return true; }
      if (menuTerbuka) { setMenuTerbuka(false); return true; }
      if (lembarMeja) { setLembarMeja(false); return true; }
      return false;
    };
  });
  useEffect(() => {
    let terpasang = false;
    let peringatan = 0;
    const pasang = () => {
      if (terpasang) return;
      terpasang = true;
      window.history.pushState(null, "", window.location.href);
    };
    const kembali = () => {
      if (!terpasang) return;
      terpasang = false;
      if (tutupLapisanRef.current()) { pasang(); return; }
      const sekarang = Date.now();
      if (sekarang - peringatan < 3000) { setPesanKembali(false); window.history.back(); return; }
      peringatan = sekarang;
      setPesanKembali(true);
      pasang();
    };
    window.addEventListener("pointerdown", pasang);
    window.addEventListener("keydown", pasang);
    window.addEventListener("popstate", kembali);
    return () => {
      window.removeEventListener("pointerdown", pasang);
      window.removeEventListener("keydown", pasang);
      window.removeEventListener("popstate", kembali);
    };
  }, []);
  useEffect(() => {
    if (!pesanKembali) return;
    const jeda = window.setTimeout(() => setPesanKembali(false), 3000);
    return () => window.clearTimeout(jeda);
  }, [pesanKembali]);

  /** Laporan centang dari daftar barang. Nol berarti hasil yang tertahan boleh tampil. */
  const onCentang = useCallback((jumlah: number) => {
    centangRef.current = jumlah;
    const tunggu = tertahanRef.current;
    if (jumlah === 0 && bagasiRef.current === 0 && tunggu) {
      tertahanRef.current = null;
      setTertahan(null);
      pasangLembar(tunggu);
    }
  }, [pasangLembar, bagasiRef, centangRef, setTertahan, tertahanRef]);

  /** Laporan isian bagasi. Nol berarti hasil yang tertahan boleh tampil. */
  const onBagasi = useCallback((jumlah: number) => {
    bagasiRef.current = jumlah;
    const tunggu = tertahanRef.current;
    if (jumlah === 0 && centangRef.current === 0 && tunggu) {
      tertahanRef.current = null;
      setTertahan(null);
      pasangLembar(tunggu);
    }
  }, [pasangLembar, bagasiRef, centangRef, setTertahan, tertahanRef]);

  function lewatiBarang() {
    const tunggu = tertahanRef.current;
    if (!tunggu) return;
    centangRef.current = 0;
    bagasiRef.current = 0;
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
  }, [scanning, setScanning]);

  // Foto bagasi memakai kamera bawaan ponsel. Kamera pemindai dilepas dulu
  // (sebagian Android tidak memberi kamera ke dua pemakai sekaligus), lalu
  // dinyalakan lagi begitu petugas kembali dari kamera, supaya tamu berikutnya
  // terpindai tanpa mengetuk "Turn on camera" setiap kali.
  const lanjutKameraRef = useRef(false);
  const scanningRef = useRef(scanning);
  useEffect(() => { scanningRef.current = scanning; }, [scanning]);
  const onKameraFoto = useCallback((buka: boolean) => {
    if (buka) {
      lanjutKameraRef.current = scanningRef.current;
      setScanning(false);
      return;
    }
    if (lanjutKameraRef.current) {
      lanjutKameraRef.current = false;
      setScanning(true);
    }
  }, [setScanning]);
  useEffect(() => {
    const kembali = () => { if (!document.hidden && lanjutKameraRef.current) { lanjutKameraRef.current = false; setScanning(true); } };
    document.addEventListener("visibilitychange", kembali);
    return () => document.removeEventListener("visibilitychange", kembali);
  }, [setScanning]);

  // Pencarian ditunda 300 ms setelah ketukan terakhir. Nama Indonesia panjang,
  // dan satu permintaan per huruf berarti belasan kueri terbuang untuk satu nama.
  useEffect(() => {
    const q = kueri.trim();
    // Tidak ada pembersihan state di sini, dan itu disengaja: kueri yang terlalu
    // pendek cukup TIDAK menjalankan apa pun. Hasil lama tetap tersimpan tetapi
    // tidak pernah tergambar, karena kunci yang menempel padanya sudah tidak
    // cocok lagi dengan kueri sekarang.
    // Satu angka boleh bila acara punya Luggage number (nomor bagasi 1-9).
    if (q.length < 2 && !(nomorBagasi && /^[0-9]$/.test(q))) return;
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
  }, [kueri, sessionId, nomorBagasi, setCari]);

  const gantiMode = (berikutnya: Mode) => {
    setMode(berikutnya);
    if (berikutnya === "cari") setFokusCari(true);
    // Kamera dimatikan saat berpindah ke tab pencarian. Membiarkannya hidup di
    // balik tab yang tidak terlihat berarti lampu kamera tetap menyala tanpa ada
    // pratinjau yang menjelaskan kenapa.
    if (berikutnya !== "qr") setScanning(false);
  };

  // Riwayat adalah tab ponsel saja. Layar yang melebar ke ukuran desktop
  // (tablet diputar) kembali ke Pindai, karena tab riwayatnya tidak ada di sana.
  useEffect(() => {
    if (mode !== "riwayat") return;
    const lebar = window.matchMedia("(min-width: 1024px)");
    const cek = () => { if (lebar.matches) setMode("qr"); };
    cek();
    lebar.addEventListener("change", cek);
    return () => lebar.removeEventListener("change", cek);
  }, [mode, setMode]);
  return { tanyaTutup, setTanyaTutup, bagasiTitipAktif, mintaTutup, pesanKembali, setPesanKembali, tutupLapisanRef, onCentang, onBagasi, lewatiBarang, lanjutKameraRef, scanningRef, onKameraFoto, gantiMode };
}
