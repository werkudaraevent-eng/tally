"use client";

import { useEffect, useState } from "react";
import { CaretRight, DownloadSimple } from "@phosphor-icons/react";
import { buatGambarQr, simpanGambarKode } from "@/components/registration-code-card";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Baris "Simpan QR ke galeri" di Beranda Horizon menjelang keberangkatan
 * (U-02): satu ketukan memanggil Unduh kode yang sama dengan layar QR, jadi
 * QR tetap bisa ditunjukkan dari galeri tanpa sinyal. Gambar QR dibuat saat
 * baris tampil, supaya lembar berbagi terbuka langsung dari ketukan itu.
 */
export function SimpanQrGaleri({
  kode,
  acara,
  nama,
  jadwal,
  lang,
  teks,
}: {
  kode: string;
  acara: string;
  nama: string;
  jadwal: string | null;
  lang: LandingLang;
  teks: { eyebrow: string; title: string; note: string; failed: string };
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState(false);

  useEffect(() => {
    let batal = false;
    buatGambarQr(kode)
      .then((src) => {
        if (!batal) setQr(src);
      })
      .catch(() => {});
    return () => {
      batal = true;
    };
  }, [kode]);

  async function simpan() {
    if (sibuk) return;
    setSibuk(true);
    setGalat(false);
    try {
      await simpanGambarKode({ qr: qr ?? (await buatGambarQr(kode)), code: kode, eventName: acara, personName: nama, schedule: jadwal, lang });
    } catch {
      setGalat(true);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void simpan()}
        aria-busy={sibuk}
        className="m3-state flex min-h-[72px] w-full items-center gap-4 rounded-[20px] bg-white px-5 ring-1 ring-[rgb(16_30_56/0.12)] py-4 text-left text-[#101E38] md:rounded-[24px] md:px-6 md:py-5"
      >
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF1F6]">
          <DownloadSimple size={22} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#274FC0]">{teks.eyebrow}</span>
          <span className="text-[16px] font-semibold leading-6">{teks.title}</span>
          <span className="text-[14px] leading-5 text-[#526078]">{teks.note}</span>
        </span>
        <CaretRight size={20} aria-hidden className="shrink-0 text-[#4D5D77]" />
      </button>
      {galat ? (
        <p role="alert" className="px-1 text-[14px] font-medium text-[#B42318]">
          {teks.failed}
        </p>
      ) : null}
    </div>
  );
}
