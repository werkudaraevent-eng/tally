"use client";

import { WorkspacePage } from "@/components/m3";
import { UsersPanel } from "@/components/admin/users-panel";

/**
 * User & role: halaman list-detail sendiri, tidak lagi tab di Pengaturan.
 *
 * Akses halaman dijaga layout admin (hanya role admin dan super admin), dan
 * kewenangan di dalamnya dijaga /api/admin/users: klien `admin` hanya melihat
 * daftar dan mereset PIN operator booth & kasir.
 */
export default function UsersPage() {
  return (
    <WorkspacePage fill>
      <UsersPanel />
    </WorkspacePage>
  );
}
