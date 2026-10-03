"use client";

import { LinkTabs } from "@/components/m3";

/**
 * Tab menu Pesan peserta. Satu baris menu untuk keduanya, supaya sidebar
 * tidak bertambah dan lipatan layar 1280x588 tidak bergeser:
 *
 *   Kiriman      email (dan nanti WhatsApp) ke kotak masuk peserta
 *   Pengumuman   kabar di lonceng halaman acara dan Dashboard saya (#52)
 *   Email otomatis  email Konfirmasi pendaftaran (nanti juga pengingat H-1)
 *
 * Alamat menu tetap /admin/pengumuman, jadi Terakhir dibuka dan Ctrl K yang
 * menyimpan alamat lama tetap sampai.
 */
export function PesanTabs() {
  return (
    <LinkTabs
      label="Pesan peserta"
      tabs={[
        { href: "/admin/pengumuman", label: "Kiriman" },
        { href: "/admin/pengumuman/lonceng", label: "Pengumuman" },
        { href: "/admin/pengumuman/otomatis", label: "Email otomatis" },
      ]}
    />
  );
}
