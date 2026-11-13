"use client";

import { useCallback, useEffect, useRef } from "react";
import { type Hasil } from "../types";
import { bukaSuara, bunyikan, simpanSuara } from "../umpan-balik";
import { eventApiPath } from "@/lib/event-url";
import { usePemindaiKeyboard } from "../pemindai-keyboard";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BARUSAN_MS, BATAS_TUNGGU_MS, KELONGGARAN_JAM_MS, KOLOM_KODE, KUNCI_KAMERA_DEPAN, KUNCI_TUTUP, TAHAN_GAGAL_MS, TAHAN_SUKSES_MS, pesanGalat } from "./pindai-bantu";
import type { useScanClient0 } from "./pindai-0";
import type { useScanClient1 } from "./pindai-1";
import type { useScanClient2 } from "./pindai-2";

/** Bagian 4 dari 7 badan ScanClient, dipindah apa adanya (audit platform, Fase 3). */
export function useScanClient3(c: Awaited<ReturnType<typeof useScanClient0>> & Awaited<ReturnType<typeof useScanClient1>> & Awaited<ReturnType<typeof useScanClient2>>) {
  const { barusanRef, bodyCetak, dialogWalkIn, gagalRef, hasilRef, kamera, kameraDepan, kontrolKameraRef, laneId, lanes, mode, pasangLembar, senter, sessionId, sessionRef, sessions, setBisaGantiKamera, setHasil, setKameraDepan, setMembaca, setOffline, setPesan, setPindaiDitolak, setSenter, setSibuk, setSuara, setTutupOtomatis, simpanKeAntrean, suaraRef, tampilGagal, tampilQr, terakhirRef, terapkanHasil, videoRef } = c;
  /**
   * Mengirim satu pencatatan. `qr` dari kamera, pemindai genggam, atau Ulangi;
   * `dicoba` dari Cari nama, yang hanya membawa id peserta (lihat
   * /api/attendance/search). Kunci internalnya `id:<uuid>` supaya tahanan dan
   * pengenalan Ulangi tetap bekerja tanpa kode.
   */
  const kirim = useCallback(async (kodeMasuk: string, dicoba?: { id: string; nama: string }): Promise<Hasil | null> => {
    const qr = dicoba ? `id:${dicoba.id}` : kodeMasuk;
    if (!sessionId) { setPesan("Choose a check-in point first."); return null; }
    // Meja belum dipilih padahal acara ini punya meja: lembar "Siapkan meja
    // ini" sedang terbuka. Pemindai genggam tetap mengetik di baliknya, dan
    // tanpa penjaga ini kehadirannya tersimpan tanpa meja dan lembar hasilnya
    // menumpuk di atas pertanyaan yang belum dijawab.
    if (lanes.length > 0 && laneId === null) {
      setPindaiDitolak(true);
      bunyikan("galat", suaraRef.current);
      return null;
    }
    setSibuk(true);
    setMembaca(dicoba ? dicoba.nama : qr);
    const dikirim = Date.now();
    const batas = new AbortController();
    const pewaktu = window.setTimeout(() => batas.abort(), BATAS_TUNGGU_MS);
    const response = await fetch(eventApiPath("/api/attendance/scan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Jalur ikut di setiap pemindaian, bukan disimpulkan belakangan dari siapa
      // yang memindai: satu akun petugas dipakai bergantian di beberapa meja,
      // jadi `scanned_by` tidak pernah bisa menjawab "meja yang mana".
      // Stasiun cetak dan mode cetak otomatis HP ini. Server yang mengantrekan
      // badge-nya, di permintaan yang sama dengan pencatatan kehadiran.
      body: JSON.stringify({
        session_id: sessionId,
        ...(dicoba ? { participant_id: dicoba.id } : { qr }),
        lane_id: laneId,
        cetak: bodyCetak(),
      }),
      signal: batas.signal,
    }).catch(() => null);
    window.clearTimeout(pewaktu);
    setSibuk(false);
    setMembaca(null);

    // Sesi yang mengizinkan check-in tanpa sinyal: pindaian yang tidak sampai
    // disimpan di ponsel, bukan merah. Hanya untuk kegagalan jaringan dan
    // gateway (502-504), bukan galat server lain yang tidak akan pulih sendiri.
    const tanpaSinyal = sessions.find((sesi) => sesi.id === sessionId)?.tanpa_sinyal === true;
    if (tanpaSinyal && (!response || response.status === 502 || response.status === 503 || response.status === 504)) {
      setOffline(true);
      return simpanKeAntrean(qr, sessionId, laneId, dicoba);
    }
    if (!response || response.status >= 500) {
      tampilGagal(qr, "gagal", "Connection lost or the server did not respond, so this participant is NOT checked in. Tap Retry, or scan the badge again.", dikirim, dicoba);
      return null;
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      tampilGagal(qr, "login", "You are signed out on this phone, so this scan was NOT saved. Sign in again, then scan again.", dikirim, dicoba);
      return null;
    }
    if (!response.ok) {
      tampilGagal(qr, "ditolak", pesanGalat(body, "The server rejected this scan. Contact the organisers."), dikirim, dicoba);
      return null;
    }

    let data = body as Hasil;
    // Jawaban percobaan sebelumnya hilang, tetapi server sempat menyimpannya.
    // "Sudah pernah dipindai" di sini menyesatkan: tamunya baru datang.
    const gagal = gagalRef.current;
    const jamServer = Date.parse(response.headers.get("date") ?? "");
    if (
      data.status === "duplicate" &&
      gagal?.qr === qr &&
      data.scan_count === 2 &&
      data.first_scan_at &&
      Number.isFinite(jamServer)
    ) {
      // Selisih jam server terhadap tablet, lalu waktu percobaan yang gagal
      // menurut jam server.
      const selisih = jamServer - Date.now();
      const pertama = new Date(data.first_scan_at).getTime();
      if (pertama >= gagal.waktu + selisih - KELONGGARAN_JAM_MS) data = { ...data, tersimpanSebelumnya: true };
    }
    terapkanHasil({ ...data, qr: data.qr ?? (dicoba ? undefined : qr) }, sessionId);
    return data;
  }, [bodyCetak, laneId, lanes.length, sessionId, sessions, simpanKeAntrean, terapkanHasil, tampilGagal, gagalRef, setMembaca, setOffline, setPesan, setPindaiDitolak, setSibuk, suaraRef]);

  /**
   * Pintu masuk setiap kode yang terbaca kamera atau pemindai genggam.
   *
   * Dua penahan, keduanya demi tamu yang memegang badge-nya lama di depan lensa:
   * tahanan bergeser untuk kode yang sama, dan daftar tamu yang tercatat di
   * ponsel ini dalam 30 detik terakhir.
   */
  const terbaca = useCallback((nilai: string, dariPemindaiGenggam = false) => {
    const sekarang = Date.now();
    const terakhir = terakhirRef.current;
    // Tahanan bergeser hanya untuk kamera, yang membaca badge yang sama puluhan
    // kali per detik. Pemindai genggam mengirim satu kode per tekanan pelatuk,
    // jadi kode yang sama berarti petugas memang memindainya lagi.
    if (!dariPemindaiGenggam && terakhir.qr === nilai && sekarang - terakhir.waktu < terakhir.tahan) {
      terakhir.waktu = sekarang;
      return;
    }
    terakhirRef.current = { qr: nilai, waktu: sekarang, tahan: TAHAN_SUKSES_MS };
    // Catatan yang lewat jendela dibuang setiap kali dibaca, supaya daftarnya
    // tidak tumbuh sepanjang hari.
    for (const [kunci, catatan] of barusanRef.current) {
      if (sekarang - catatan.waktu >= BARUSAN_MS) barusanRef.current.delete(kunci);
    }
    const barusan = barusanRef.current.get(`${sessionRef.current}:${nilai}`);
    if (barusan) {
      // Tidak dikirim lagi, tetapi juga tidak diam: lembar hijau tamu itu
      // dibuka lagi dari ingatan ponsel, dengan bunyinya.
      pasangLembar(barusan.hasil);
      bunyikan("ok", suaraRef.current);
      return;
    }
    void kirim(nilai).then((data) => {
      if (!data && terakhirRef.current.qr === nilai) terakhirRef.current.tahan = TAHAN_GAGAL_MS;
    });
  }, [kirim, pasangLembar, barusanRef, sessionRef, suaraRef, terakhirRef]);

  const terbacaRef = useRef(terbaca);
  useEffect(() => { terbacaRef.current = terbaca; });

  // Pemindai genggam yang mengetik kodenya, aktif selama tab Pindai QR terbuka,
  // termasuk saat lembar hasil menutupi layar.
  usePemindaiKeyboard(mode === "qr" && !dialogWalkIn && !tampilQr, (kode) => terbacaRef.current(kode, true), KOLOM_KODE);

  useEffect(() => {
    if (!kamera || mode !== "qr" || !videoRef.current) return;
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
          video: { facingMode: { ideal: kameraDepan ? "user" : "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
        // Daftar kamera baru lengkap setelah izin kamera diberikan.
        void navigator.mediaDevices?.enumerateDevices?.()
          .then((perangkat) => { if (!berhenti) setBisaGantiKamera(perangkat.filter((item) => item.kind === "videoinput").length > 1); })
          .catch(() => {});
      })
      .catch(() => setPesan("Camera not available or permission denied."));

    return () => {
      berhenti = true;
      kontrol?.stop();
      kontrolKameraRef.current = null;
      setSenter({ ada: false, nyala: false });
    };
  }, [mode, kamera, kameraDepan, kontrolKameraRef, setBisaGantiKamera, setPesan, setSenter, videoRef]);

  /**
   * Layar tidak meredup selama kamera menyala.
   *
   * Saat antrean sepi, layar ponsel meredup lalu terkunci, kamera ikut mati, dan
   * tamu berikutnya menunggu petugas membuka kunci dan menekan Nyalakan kamera.
   * Peramban melepas kuncinya sendiri saat halaman ke belakang; kamera juga mati
   * saat itu, dan "Nyalakan kamera" memintanya lagi.
   */
  useEffect(() => {
    if (!kamera) return;
    let kunci: { release: () => Promise<void> } | null = null;
    let lepas = false;
    const wl = (navigator as Navigator & { wakeLock?: { request: (jenis: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    void wl?.request("screen")
      .then((k) => { if (lepas) void k.release(); else kunci = k; })
      .catch(() => { /* ditolak atau tidak didukung: layar meredup seperti biasa */ });
    return () => { lepas = true; void kunci?.release().catch(() => {}); };
  }, [kamera]);

  async function gantiSenter() {
    const kontrol = kontrolKameraRef.current;
    if (!kontrol?.switchTorch) return;
    const nyala = !senter.nyala;
    try {
      await kontrol.switchTorch(nyala);
      setSenter({ ada: true, nyala });
    } catch { /* sebagian kamera menolak di tengah jalan; tombolnya tetap */ }
  }

  function gantiKamera() {
    const depan = !kameraDepan;
    setKameraDepan(depan);
    try {
      if (depan) window.localStorage.setItem(KUNCI_KAMERA_DEPAN, "1");
      else window.localStorage.removeItem(KUNCI_KAMERA_DEPAN);
    } catch { /* penyimpanan tidak tersedia; pilihan tetap berlaku sesi ini */ }
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
  }, [hasilRef, setHasil]);
  return { kirim, terbaca, terbacaRef, gantiSenter, gantiKamera, gantiSuara, gantiTutupOtomatis, tutupLembar };
}
