"use client";

import { useEffect, type ReactNode } from "react";
import { CACHE_QR_LURING, kunciQrLuring } from "@/lib/member/halaman-qr-luring";

/** Hapus salinan QR luring dan service worker portal acara ini (dipanggil sebelum Keluar). */
export async function hapusSalinanQr(lingkup: string[]) {
  const kerja = (async () => {
    try {
      const cache = await caches.open(CACHE_QR_LURING);
      await Promise.all(lingkup.map((path) => cache.delete(kunciQrLuring(location.origin, path))));
    } catch {
      // Penyimpanan diblokir: tidak ada yang tersimpan.
    }
    try {
      for (const path of lingkup) {
        const daftar = await navigator.serviceWorker?.getRegistration(path);
        if (daftar && new URL(daftar.scope).pathname === path) await daftar.unregister();
      }
    } catch {
      // Tanpa service worker: tidak ada yang dilepas.
    }
  })();
  // Keluar tidak boleh tertahan oleh penyimpanan yang lambat.
  await Promise.race([kerja, new Promise((ok) => setTimeout(ok, 800))]);
}

/**
 * Hapus salinan QR saat halaman dibuka dengan sinyal oleh akun yang tidak
 * punya QR (masih menunggu persetujuan, atau kode disembunyikan). Tanpa ini,
 * ponsel yang dipakai bergantian masih menyajikan QR orang sebelumnya saat
 * tanpa sinyal. Akun yang punya QR tidak perlu ini: lapisan QR menimpa
 * salinannya dengan QR akun itu setiap kali portal dibuka.
 */
export function HapusSalinanQr({ lingkup }: { lingkup: string[] }) {
  const kunci = lingkup.join("|");
  useEffect(() => {
    if (navigator.onLine) void hapusSalinanQr(kunci.split("|"));
  }, [kunci]);
  return null;
}

/** Formulir Keluar yang menghapus salinan QR di ponsel ini lebih dulu. */
export function FormKeluar({ action, lingkup, children }: { action: string; lingkup: string[]; children: ReactNode }) {
  return (
    <form
      method="post"
      action={action}
      onSubmit={(event) => {
        const form = event.currentTarget;
        if (form.dataset.siap === "1") return;
        event.preventDefault();
        void hapusSalinanQr(lingkup).finally(() => {
          form.dataset.siap = "1";
          form.submit();
        });
      }}
    >
      {children}
    </form>
  );
}
