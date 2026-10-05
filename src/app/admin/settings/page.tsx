"use client";

import Link from "@/components/event-link";
import { useEffect, useState } from "react";
import { MetaSeparator, Tabs, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { AuditPanel } from "@/components/admin/audit-panel";
import { PaymentMethodManager } from "@/components/admin/payment-method-manager";
import { ScannerPanel } from "@/components/admin/scanner-panel";
import { DangerZonePanel, SettingsPanel } from "@/components/admin/settings-panel";
import { DomainPanel } from "@/components/admin/domain-panel";

/**
 * Pengaturan sistem, satu panel bertab. Isinya hal-hal yang disiapkan sekali
 * sebelum acara lalu nyaris tidak disentuh: preferensi acara, metode
 * pembayaran, integrasi, dan riwayat perubahannya.
 *
 * Akun panitia sudah bukan tab di sini. Ia halaman sendiri di /admin/users
 * (list-detail), karena yang dikerjakan di sana memilih satu akun dari daftar,
 * bukan mengisi formulir setelan.
 */

type Tab = "acara" | "pembayaran" | "integrasi" | "audit" | "bahaya";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("acara");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    // Jejak audit dan Zona bahaya hanya untuk pemilik sistem. Servernya tetap
    // menolak lewat requireRequestEvent(["super_admin"]); ini semata agar klien
    // tidak menekan tab yang pasti membalas galat.
    const timer = window.setTimeout(() => {
      // `?tab=integrasi` dari menu Sinkron di Daftar peserta: langsung ke panel
      // yang dituju, bukan ke Acara lalu mencari tabnya sendiri.
      const dariUrl = new URLSearchParams(window.location.search).get("tab");
      if (dariUrl === "integrasi" || dariUrl === "pembayaran") setTab(dariUrl);
      void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
        if (response.ok) setIsOwner((await response.json()).user?.role === "super_admin");
      }).catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Tab yang tidak berhak dibuka dipulangkan ke Acara. Terjadi bila status
  // pemilik baru diketahui setelah tab khusus pemilik sempat dipilih.
  const aktif: Tab = (tab === "audit" || tab === "bahaya") && !isOwner ? "acara" : tab;

  return (
    <WorkspacePage width="form">
      <WorkspaceHeader
        meta={
          <>
            <span>Berlaku di semua perangkat dalam 30 detik</span>
            <MetaSeparator />
            <span>Setiap perubahan tercatat di jejak audit</span>
            <MetaSeparator />
            <span>Staff access: <Link href="/events" className="rounded-sm font-medium text-primary hover:underline">This event</Link>, <Link href="/users" className="rounded-sm font-medium text-primary hover:underline">Users &amp; roles</Link></span>
          </>
        }
      />

      <Tabs<Tab>
        label="Bagian pengaturan"
        idPrefix="pengaturan"
        value={aktif}
        onChange={setTab}
        options={[
          { value: "acara", label: "Acara" },
          { value: "pembayaran", label: "Pembayaran" },
          // Integrasi duduk di sini, bukan sebagai menu sidebar sendiri: ia diisi
          // sekali saat acara disiapkan, sama seperti tab di sebelahnya.
          { value: "integrasi", label: "Integrasi" },
          ...(isOwner ? [{ value: "audit" as const, label: "Jejak audit" }, { value: "bahaya" as const, label: "Zona bahaya" }] : []),
        ]}
      />

      {/* Panel yang tidak aktif DILEPAS, bukan disembunyikan dengan CSS.
          Masing-masing memuat datanya sendiri saat dipasang. */}
      <div role="tabpanel" id={`pengaturan-panel-${aktif}`} aria-labelledby={`pengaturan-tab-${aktif}`} className="flex flex-col gap-4">
        {aktif === "acara" ? <><SettingsPanel /><DomainPanel /></>
          : aktif === "pembayaran" ? <PaymentMethodManager />
          : aktif === "integrasi" ? <ScannerPanel />
          : aktif === "audit" ? <AuditPanel />
          : <DangerZonePanel />}
      </div>
    </WorkspacePage>
  );
}
