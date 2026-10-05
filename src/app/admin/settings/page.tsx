"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminPage } from "@/components/admin/page-context";
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
 * Akun panitia bukan tab di sini. Ia halaman tingkat workspace di /users
 * (list-detail), karena akunnya berlaku untuk semua acara. Kepala halaman ini
 * menautkannya, dan untuk pemilik juga halaman akses acara ini.
 */

type Tab = "acara" | "pembayaran" | "integrasi" | "audit" | "bahaya";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("acara");
  const [isOwner, setIsOwner] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const eventSlug = useAdminPage()?.eventSlug ?? null;

  // Halaman akses per acara memakai id, bukan slug, dan API-nya khusus pemilik.
  // Admin tidak perlu id ini: tautannya memang tidak ditampilkan untuknya.
  useEffect(() => {
    if (!isOwner || !eventSlug) return;
    let batal = false;
    void fetch("/api/events", { cache: "no-store" }).then(async (response) => {
      if (!response.ok || batal) return;
      const daftar = ((await response.json()).events ?? []) as { id: string; slug: string }[];
      if (!batal) setEventId(daftar.find((event) => event.slug === eventSlug)?.id ?? null);
    }).catch(() => {});
    return () => { batal = true; };
  }, [isOwner, eventSlug]);

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
            {/* Akses acara ini hanya untuk pemilik: API-nya khusus super admin. */}
            {isOwner && eventId ? (
              <>
                <Link href={`/events/${eventId}/access`} className="rounded-sm font-medium text-primary hover:underline">Event access</Link>
                <MetaSeparator />
              </>
            ) : null}
            <Link href="/users" className="rounded-sm font-medium text-primary hover:underline">Users &amp; roles</Link>
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
