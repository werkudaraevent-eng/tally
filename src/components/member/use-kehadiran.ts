"use client";

import { useEffect, useState } from "react";
import type { BarisKehadiran, OrangKehadiran } from "@/lib/member/panitia-i18n";
import type { LandingLang } from "@/lib/landing-i18n";

export type DataKehadiran = {
  rows?: BarisKehadiran[];
  row?: BarisKehadiran;
  belum?: OrangKehadiran[];
  sudah?: OrangKehadiran[];
  time_zone: string;
  updated_at: string;
};

const JEDA = 30_000;

/**
 * Kehadiran dari /api/peserta/panitia, diperbarui tiap 30 detik selama tab
 * terlihat (sama dengan kartu Check-ins by checkpoint di Dashboard admin) dan
 * langsung saat tab kembali terlihat. Data lama tetap tampil bila pembaruan
 * gagal; `galat` hanya berarti belum pernah berhasil.
 */
export function useKehadiran(slug: string, lang: LandingLang, titik: string | null) {
  const [data, setData] = useState<DataKehadiran | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    let pewaktu: ReturnType<typeof setTimeout> | null = null;
    const kueri = new URLSearchParams({ ...(titik ? { titik } : {}), ...(lang === "en" ? { lang } : {}) }).toString();
    const muat = async () => {
      if (pewaktu) clearTimeout(pewaktu);
      pewaktu = null;
      if (document.visibilityState !== "visible") return;
      try {
        const respons = await fetch(`/e/${encodeURIComponent(slug)}/api/peserta/panitia${kueri ? `?${kueri}` : ""}`, { cache: "no-store" });
        const isi = (await respons.json().catch(() => null)) as (DataKehadiran & { error?: { message?: string } }) | null;
        if (batal) return;
        if (respons.ok && isi) {
          setData(isi);
          setGalat(null);
        } else {
          setGalat(isi?.error?.message ?? "");
        }
      } catch {
        if (!batal) setGalat("");
      }
      if (!batal) pewaktu = setTimeout(muat, JEDA);
    };
    const saatTerlihat = () => {
      if (document.visibilityState === "visible") void muat();
    };
    void muat();
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => {
      batal = true;
      if (pewaktu) clearTimeout(pewaktu);
      document.removeEventListener("visibilitychange", saatTerlihat);
    };
  }, [slug, lang, titik]);

  return { data, galat };
}
