"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { eventApiPath } from "@/lib/event-url";

/**
 * QR checkpoint yang berganti (scan mandiri), untuk Show QR di /scan dan layar
 * /checkpoint-qr. Server yang menghitung kodenya; layar ini hanya menanyakannya
 * tiap 5 detik dan tepat saat kodenya berganti (jam server, bukan jam ponsel),
 * lalu menggambar QR-nya sendiri.
 */

export type DataQrCheckpoint = {
  event: { name: string; lang: "id" | "en" };
  url: string;
  mode: "self" | "both";
  open: boolean;
  period: number;
  now: number;
  changes_at: number;
  checkpoints: { id: number; title: string; title_en: string | null; position: number }[];
  total_checkpoints: number;
  done: number | null;
  recent: { name: string; at: string }[];
};

const TANYA_MS = 5_000;

export function usePakaiQrCheckpoint(sesiId: number | null) {
  const [data, setData] = useState<DataQrCheckpoint | null>(null);
  const [gambar, setGambar] = useState<string | null>(null);
  const [galat, setGalat] = useState("");
  // Selisih jam server dan jam perangkat: hitung mundur memakai jam server.
  const [selisih, setSelisih] = useState(0);
  const [sekarang, setSekarang] = useState(() => Date.now());
  const urlRef = useRef("");

  useEffect(() => {
    if (sesiId === null) return;
    let berhenti = false;
    let pengatur: number | undefined;
    const tanya = async () => {
      window.clearTimeout(pengatur);
      const response = await fetch(eventApiPath(`/api/attendance/checkpoint-qr?session_id=${sesiId}`), { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as (DataQrCheckpoint & { error?: { details?: { message?: string } } }) | null;
      if (berhenti) return;
      if (!response?.ok || !body?.url) {
        setGalat(body?.error?.details?.message ?? "The checkpoint QR could not be loaded. Retrying…");
        pengatur = window.setTimeout(() => void tanya(), TANYA_MS);
        return;
      }
      setGalat("");
      const beda = body.now - Date.now();
      setSelisih(beda);
      setData(body);
      if (body.url !== urlRef.current) {
        urlRef.current = body.url;
        const png = await QRCode.toDataURL(body.url, { margin: 1, width: 720, errorCorrectionLevel: "M" }).catch(() => null);
        if (!berhenti) setGambar(png);
      }
      // Berikutnya: tepat setelah kode berganti, atau 5 detik lagi bila lebih dulu.
      const keGanti = body.changes_at - (Date.now() + beda) + 300;
      pengatur = window.setTimeout(() => void tanya(), Math.max(500, Math.min(TANYA_MS, keGanti)));
    };
    void tanya();
    return () => {
      berhenti = true;
      window.clearTimeout(pengatur);
    };
  }, [sesiId]);

  // Layar tidak meredup selama QR tampil (sama dengan kamera di /scan).
  useEffect(() => {
    if (sesiId === null) return;
    let kunci: { release: () => Promise<void> } | null = null;
    let lepas = false;
    const wl = (navigator as Navigator & { wakeLock?: { request: (jenis: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    void wl?.request("screen")
      .then((k) => { if (lepas) void k.release(); else kunci = k; })
      .catch(() => { /* ditolak atau tidak didukung */ });
    return () => { lepas = true; void kunci?.release().catch(() => {}); };
  }, [sesiId]);

  // Hitung mundur dan bilah sisa waktu.
  useEffect(() => {
    const detak = window.setInterval(() => setSekarang(Date.now()), 250);
    return () => window.clearInterval(detak);
  }, []);

  const sisaMs = data ? Math.max(0, data.changes_at - (sekarang + selisih)) : 0;
  return {
    data,
    gambar,
    galat,
    sisaDetik: Math.ceil(sisaMs / 1000),
    sisaPersen: data ? Math.min(100, (sisaMs / (data.period * 1000)) * 100) : 0,
    /** Jam server kira-kira, untuk "12 s ago". */
    kini: sekarang + selisih,
  };
}
