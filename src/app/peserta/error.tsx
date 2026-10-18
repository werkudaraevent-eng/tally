"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Galat area peserta (U-10): pesan tenang dengan Coba lagi dan jalan ke QR
 * dan Beranda, bukan halaman galat bawaan. Batas galat tidak tahu tema
 * acaranya, jadi warnanya netral. Saat sinyal hilang yang tampil adalah
 * halaman QR luring dari service worker portal, bukan halaman ini.
 */
export default function GalatAreaPeserta({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const alamat = usePathname() ?? "";
  const en = /\/en\/peserta(\/|$)/.test(alamat);
  const portal = alamat.replace(/\/peserta(\/.*)?$/, "/peserta") || "/peserta";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main lang={en ? "en" : "id"} className="flex min-h-dvh items-center bg-[#FAF8F2] px-6 py-16 text-[#101E38]">
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4">
        <h1 className="text-balance text-[28px] font-extrabold leading-[1.2]">{en ? "This page didn't load" : "Halaman ini gagal dimuat"}</h1>
        <p className="text-[16px] leading-6 text-[#526078]">
          {en ? "Check your signal, then try again. Your attendance QR can still be opened." : "Periksa sinyal, lalu coba lagi. QR kehadiranmu tetap bisa dibuka."}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" onClick={() => unstable_retry()} className="m3-state inline-flex min-h-12 items-center rounded-full bg-[#101E38] px-6 text-[15px] font-bold text-white [--m3-state-color:#ffffff]">
            {en ? "Try again" : "Coba lagi"}
          </button>
          <a href={`${portal}?tab=qr`} className="m3-state inline-flex min-h-12 items-center rounded-full border border-[#C9D1DE] px-6 text-[15px] font-bold text-[#274FC0]">
            {en ? "Show QR" : "Tampilkan QR"}
          </a>
          <a href={portal} className="m3-state inline-flex min-h-12 items-center rounded-full px-4 text-[15px] font-bold text-[#274FC0]">
            {en ? "Home" : "Beranda"}
          </a>
        </div>
      </div>
    </main>
  );
}
