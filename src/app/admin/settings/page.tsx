"use client";

import { ClipboardText, GearSix, ShieldCheck } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { SegmentedButton } from "@/components/m3";
import { AuditPanel } from "@/components/admin/audit-panel";
import { SettingsPanel } from "@/components/admin/settings-panel";
import { UsersPanel } from "@/components/admin/users-panel";

/**
 * Pengaturan sistem: preferensi acara, akun, dan riwayat perubahannya.
 *
 * Ketiganya dulu menu tersendiri di sidebar. Ketiganya juga dibuka pada momen
 * yang sama — saat menyiapkan sistem sebelum acara, atau saat memeriksa siapa
 * mengubah apa — bukan sebagai tujuan yang dicari terpisah di tengah hari-H.
 * Menyatukannya mengosongkan tiga baris dari daftar menu yang dipakai panitia
 * sepanjang acara, dan menempatkan riwayat tepat di sebelah hal yang diubahnya.
 *
 * Pola yang sama dipakai Stripe dan Shopify: "Settings" satu entri, isinya punya
 * navigasi sendiri.
 */

type Tab = "settings" | "users" | "audit";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("settings");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    // Tab audit hanya ada untuk pemilik sistem. Servernya tetap menolak lewat
    // requireUser(["super_admin"]) — ini semata agar klien tidak menekan tab yang
    // pasti membalas galat.
    const timer = window.setTimeout(() => {
      void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
        if (response.ok) setIsOwner((await response.json()).user?.role === "super_admin");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Tab yang tidak berhak dibuka dipulangkan ke Pengaturan. Terjadi bila status
  // pemilik baru diketahui setelah tab audit sempat dipilih.
  const aktif: Tab = tab === "audit" && !isOwner ? "settings" : tab;

  return (
    <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
      <div className="mx-auto max-w-[1440px]">
        <SegmentedButton<Tab>
          className="mb-6"
          label="Bagian pengaturan"
          value={aktif}
          onChange={setTab}
          options={[
            { value: "settings", label: "Acara", icon: <GearSix size={18} /> },
            { value: "users", label: "User & role", icon: <ShieldCheck size={18} /> },
            ...(isOwner ? [{ value: "audit" as const, label: "Audit trail", icon: <ClipboardText size={18} /> }] : []),
          ]}
        />

        {/* Panel yang tidak aktif DILEPAS, bukan disembunyikan dengan CSS.
            Masing-masing memuat datanya sendiri saat dipasang; membiarkan yang
            tersembunyi tetap hidup berarti daftar akun dimuat ulang setiap kali
            settings disimpan, tanpa ada yang melihatnya. */}
        {aktif === "settings" ? <SettingsPanel /> : aktif === "users" ? <UsersPanel /> : <AuditPanel />}
      </div>
    </main>
  );
}
