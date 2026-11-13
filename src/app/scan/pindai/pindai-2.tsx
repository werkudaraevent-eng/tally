"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Hasil } from "../types";
import { bunyikan } from "../umpan-balik";
import { printerSupported } from "@/lib/label/printer";
import { eventApiPath } from "@/lib/event-url";
import { Antre, BATAS_RIWAYAT, BATAS_TUNGGU_MS, bacaAntrean, simpanAntrean } from "./pindai-bantu";
import type { useScanClient0 } from "./pindai-0";
import type { useScanClient1 } from "./pindai-1";

/** Bagian 3 dari 7 badan ScanClient, dipindah apa adanya (audit platform, Fase 3). */
export function useScanClient2(c: Awaited<ReturnType<typeof useScanClient0>> & Awaited<ReturnType<typeof useScanClient1>>) {
  const { barusanRef, catatCetak, cetakRef, gagalRef, modeRef, pasangLembar, setHadirTerbaru, setOffline, setPesan, setRiwayat, setTerakhirHadir, suaraRef } = c;
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
    catatCetak(data.badge_cetak, data.participant?.name ?? "");
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
      // Kode mentah tidak disimpan: bisa jadi QR asli peserta yang dibatalkan,
      // dan History bertahan di ponsel sampai akhir hari.
      {
        nama: data.participant?.name
          ?? (data.reason === "cancelled" && data.participant_name ? data.participant_name : data.status === "not_found" ? "Unknown code" : "Unknown"),
        status: beres ? "recorded" : data.status,
        waktu,
        ...(data.reason ? { alasan: data.reason } : {}),
      },
      ...current,
    ].slice(0, BATAS_RIWAYAT));
    if (beres && data.participant) {
      setTerakhirHadir({ nama: data.participant.name, waktu });
      const catatan = { waktu: Date.now(), hasil: data };
      if (data.participant.qr_code) barusanRef.current.set(`${sesi}:${data.participant.qr_code}`, catatan);
      if (data.qr) barusanRef.current.set(`${sesi}:${data.qr}`, catatan);
    }

    // Cetak otomatis TIDAK berlaku untuk pemindaian ulang: tamu itu sudah
    // memegang badge-nya sejak tadi, dan mencetak lagi hanya menghabiskan
    // gulungan. Cetak ulang tetap tersedia satu ketukan di lembar hasil.
    // Tanpa Bluetooth tidak ada cetak otomatis sama sekali: di sana "mencetak"
    // berarti membuka lembar bagikan, dan itu ditolak peramban tanpa ketukan.
    const mode = printerSupported() ? modeRef.current : "off";
    const perlu = mode === "semua" ? beres : mode === "walkin" ? data.status === "created" : false;
    if (perlu && data.participant) void cetakRef.current(data.participant);
  }, [catatCetak, pasangLembar, barusanRef, cetakRef, gagalRef, modeRef, setHadirTerbaru, setOffline, setPesan, setRiwayat, setTerakhirHadir, suaraRef]);

  /**
   * Lembar untuk pemindaian yang tidak menghasilkan jawaban server yang sah.
   *
   * Dulu ini sebaris pesan di puncak halaman yang mendorong kamera 76 px ke
   * bawah, tanpa bunyi, di tempat yang tidak dilihat petugas yang sedang
   * menatap tamu. Sekarang ia lembar yang sama dengan hasil lain: merah, berbunyi,
   * dan membawa aksi yang memang menolong.
   */
  const tampilGagal = useCallback((qr: string, status: "gagal" | "login" | "ditolak", teks: string, dikirim: number, dicoba?: { id: string; nama: string }) => {
    if (status === "gagal") {
      setOffline(true);
      // Waktu KIRIM, bukan waktu lembar merah muncul. Jawaban yang hilang paling
      // sering adalah jawaban yang telat lewat 8 detik, dan server sudah
      // menyimpannya sebelum lembar merah ini terbuka.
      gagalRef.current = { qr, waktu: dikirim };
    }
    pasangLembar({ status, qr: dicoba ? undefined : qr, pesan: teks, dicoba });
    bunyikan("galat", suaraRef.current);
  }, [pasangLembar, gagalRef, setOffline, suaraRef]);

  // ---- Antrean tanpa sinyal ----------------------------------------------
  const [antrean, setAntrean] = useState<Antre[]>([]);
  /** Nama pindaian dari antrean yang ditolak server setelah sinyal kembali. */
  const [ditolakAntrean, setDitolakAntrean] = useState<string[]>([]);
  const antreanRef = useRef<Antre[]>([]);
  const mengirimAntrean = useRef(false);
  const gantiAntrean = useCallback((berikut: Antre[]) => {
    antreanRef.current = berikut;
    setAntrean(berikut);
    simpanAntrean(berikut);
  }, []);
  // Antrean yang tertinggal dari halaman sebelumnya (dimuat ulang tanpa sinyal).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const lama = bacaAntrean();
      if (lama.length) { antreanRef.current = lama; setAntrean(lama); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  /** Menyimpan pindaian yang tidak sampai ke server, lalu membuka lembar abu "Saved on this phone". */
  const simpanKeAntrean = useCallback((qr: string, sesi: number, jalur: number | null, dicoba?: { id: string; nama: string }): Hasil => {
    const item: Antre = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ...(dicoba ? { pesertaId: dicoba.id, nama: dicoba.nama } : { kode: qr }),
      sesi,
      jalur,
      waktu: new Date().toISOString(),
    };
    gantiAntrean([...antreanRef.current, item]);
    const data: Hasil = { status: "antri", qr: dicoba ? undefined : qr, dicoba };
    pasangLembar(data);
    bunyikan("ok", suaraRef.current);
    setRiwayat((current) => [{ nama: dicoba?.nama ?? qr, status: "antri" as const, waktu: item.waktu, antre: item.id }, ...current].slice(0, BATAS_RIWAYAT));
    // Badge yang masih di depan lensa tidak masuk antrean dua kali.
    barusanRef.current.set(`${sesi}:${qr}`, { waktu: Date.now(), hasil: data });
    return data;
  }, [gantiAntrean, pasangLembar, barusanRef, setRiwayat, suaraRef]);

  /**
   * Mengirim antrean satu per satu, yang tertua dulu. Berhenti pada kegagalan
   * jaringan pertama (sinyal belum kembali) dan pada 401 (petugas harus masuk
   * lagi; antreannya tetap). Jawaban yang menolak (sesi ditutup, dsb.) dibuang
   * dari antrean dan ditandai di History.
   */
  const kirimAntrean = useCallback(async () => {
    if (mengirimAntrean.current || antreanRef.current.length === 0) return;
    mengirimAntrean.current = true;
    try {
      while (antreanRef.current.length > 0) {
        const item = antreanRef.current[0];
        const batas = new AbortController();
        const pewaktu = window.setTimeout(() => batas.abort(), BATAS_TUNGGU_MS);
        const response = await fetch(eventApiPath("/api/attendance/scan"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: item.sesi,
            ...(item.pesertaId ? { participant_id: item.pesertaId } : { qr: item.kode }),
            lane_id: item.jalur,
            scanned_at: item.waktu,
          }),
          signal: batas.signal,
        }).catch(() => null);
        window.clearTimeout(pewaktu);
        if (!response || response.status >= 500 || response.status === 401) {
          if (response?.status === 401) setOffline(false);
          else setOffline(true);
          return;
        }
        setOffline(false);
        const body = (await response.json().catch(() => ({}))) as Hasil;
        const status: Hasil["status"] = response.ok ? body.status : "ditolak";
        const nama = response.ok
          ? body.participant?.name ?? (body.reason === "cancelled" && body.participant_name ? body.participant_name : item.nama ?? (body.status === "not_found" ? "Unknown code" : item.kode) ?? "Unknown")
          : item.nama ?? item.kode ?? "Unknown";
        setRiwayat((current) => current.map((baris) => (baris.antre === item.id ? { nama, status, waktu: baris.waktu, ...(body.reason ? { alasan: body.reason } : {}) } : baris)));
        // Orangnya sudah dibiarkan masuk saat sinyal hilang. Kalau server ternyata
        // menolak, petugas harus tahu sekarang, bukan saat membaca History nanti.
        if (status !== "recorded" && status !== "created" && status !== "duplicate") {
          setDitolakAntrean((current) => [...current, nama]);
        }
        if (response.ok && typeof body.session_unique_total === "number") {
          const total = body.session_unique_total;
          setHadirTerbaru((current) => ({ ...current, [item.sesi]: total }));
        }
        gantiAntrean(antreanRef.current.filter((a) => a.id !== item.id));
      }
    } finally {
      mengirimAntrean.current = false;
    }
  }, [gantiAntrean, setHadirTerbaru, setOffline, setRiwayat]);

  // Dicoba lagi tiap 5 detik selama ada antrean, dan seketika saat peramban
  // melaporkan jaringan kembali.
  useEffect(() => {
    if (antrean.length === 0) return;
    const jalan = () => void kirimAntrean();
    const timer = window.setInterval(jalan, 5_000);
    window.addEventListener("online", jalan);
    return () => { window.clearInterval(timer); window.removeEventListener("online", jalan); };
  }, [antrean.length, kirimAntrean]);
  return { terapkanHasil, tampilGagal, antrean, setAntrean, ditolakAntrean, setDitolakAntrean, antreanRef, mengirimAntrean, gantiAntrean, simpanKeAntrean, kirimAntrean };
}
