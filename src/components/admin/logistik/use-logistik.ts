"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import type { LogistikData } from "@/lib/logistik/types";
import type { Kirim } from "./bersama";

/**
 * Penanda muat terakhir. Fungsinya dipanggil di awal setiap muat dan memberi
 * pemeriksa yang tetap true selama belum ada muat lain yang dimulai sesudahnya.
 *
 * Hook sendiri, bukan ref langsung di `muat`: `kirim` memanggil `muat` dan ikut
 * di `tabProps` yang dibaca saat render, dan React Compiler menolak ref yang
 * terbawa sampai ke sana.
 */
function useMuatTerakhir() {
  const terakhir = useRef(0);
  return useCallback(() => {
    const nomor = ++terakhir.current;
    return () => nomor === terakhir.current;
  }, []);
}

/**
 * Satu muatan data Logistik dan cara menulisnya, dipakai halaman Logistics dan
 * dialog Logistik yang dibuka dari Daftar peserta. Satu tempat, supaya kedua
 * pintu membaca dan menulis dengan cara yang sama (pesan galat, muat ulang
 * sebelum tombol hidup lagi).
 */
export function useLogistik() {
  const [data, setData] = useState<LogistikData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Hanya jawaban muat yang terakhir dimulai yang dipakai. Muat ulang karena
  // fokus jendela bisa masih berjalan saat simpanan memuat ulang sesudah
  // menulis, dan jawaban lamanya tidak boleh menimpa yang baru.
  const mulaiMuat = useMuatTerakhir();
  const muat = useCallback(async () => {
    const masihTerakhir = mulaiMuat();
    const response = await fetch(eventApiPath("/api/admin/logistik"), { cache: "no-store" }).catch(() => null);
    const isi = response?.ok ? ((await response.json().catch(() => null)) as LogistikData | null) : null;
    if (!masihTerakhir()) return;
    if (!isi) {
      setError("Logistics data could not be loaded. Check your connection, then reload the page.");
      return;
    }
    setData(isi);
    setError("");
  }, [mulaiMuat]);

  const kirim: Kirim = useCallback(async (path, method, body) => {
    setBusy(true);
    const response = await fetch(eventApiPath(path), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    if (!response) {
      setBusy(false);
      toast.error("Connection failed", "Reload the page to see the current state.");
      return null;
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      toast.error("Could not save", pesanGalatApi(json) ?? "Try again.");
      return null;
    }
    // Dimuat ulang sebelum tombolnya hidup lagi: angka isi kamar dan bus yang
    // tertinggal satu langkah mengundang klik kedua ke kamar yang sudah penuh.
    await muat();
    setBusy(false);
    return json;
  }, [muat, toast]);

  return { data, error, busy, muat, kirim };
}
