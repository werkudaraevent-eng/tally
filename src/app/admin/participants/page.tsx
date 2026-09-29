"use client";

import { ArrowsClockwise, CheckCircle, DownloadSimple, FileArrowUp, Plus, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useRef, useState } from "react";
import { ParticipantList, type ParticipantListHandle, type ParticipantStats } from "@/components/admin/participant-list";
import { ExportMenu } from "@/components/admin/export-menu";
import { useAutoSync, useScannerConfig, useScannerSync } from "@/components/admin/scanner-panel";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import { Banner, Button, ButtonLink, Dialog, MetaSeparator, StatusDot, WorkspaceHeader, WorkspacePage } from "@/components/m3";

type ImportPreview = {
  dry_run: boolean;
  rows: number;
  inserted: number;
  updated: number;
  source_locked: number;
  rejected: number;
  issues: Array<{ row: number; qr_code: string | null; reason: string }>;
  issues_truncated: boolean;
  recognized_columns: string[];
  file_name: string;
};

export default function ParticipantsAdminPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const daftar = useRef<ParticipantListHandle>(null);
  const toast = useToast();
  const { zone, abbr } = useEventTimeZone();
  const [stats, setStats] = useState<ParticipantStats | null>(null);

  const { config } = useScannerConfig();
  const { menit } = useAutoSync();
  const { syncing, sync, gagal } = useScannerSync(() => setReloadKey((key) => key + 1));

  // Pewaktu sync berjalan di halaman ini karena halaman inilah yang terbuka sepanjang acara.
  const usesScanner = config ? ["scanner_api", "hybrid"].includes(config.participant_source) : false;
  useEffect(() => {
    if (menit <= 0 || !usesScanner) return;
    const interval = window.setInterval(() => { void sync(); }, menit * 60000);
    return () => window.clearInterval(interval);
  }, [menit, usesScanner, sync]);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  function closeImport() { setImportOpen(false); setImportFile(null); setPreview(null); setError(""); }

  async function runImport(dryRun: boolean) {
    if (!importFile) return;
    setImporting(true); setError(""); setMessage("");
    const form = new FormData();
    form.append("file", importFile);
    form.append("dry_run", dryRun ? "true" : "false");
    const response = await fetch("/api/admin/participants/import", { method: "POST", body: form, signal: AbortSignal.timeout(120000) }).catch(() => null);
    setImporting(false);
    if (!response) { setError("Koneksi terputus saat mengunggah berkas."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = body.error?.details?.message ?? body.error?.message ?? "Impor gagal.";
      setError(failure); toast.error("Impor peserta gagal", failure);
      return;
    }
    if (dryRun) { setPreview(body as ImportPreview); return; }
    closeImport();
    toast.success("Impor selesai", `${body.inserted} ditambah, ${body.updated} diperbarui, ${body.rejected} ditolak.`);
    setMessage(`Impor selesai: ${body.inserted} peserta ditambah, ${body.updated} diperbarui, ${body.source_locked} hanya kontaknya, ${body.rejected} ditolak.`);
    setReloadKey((key) => key + 1);
  }

  const barisDiterapkan = preview ? preview.inserted + preview.updated + preview.source_locked : 0;

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={
          <>
            <span>{stats ? `${stats.activeTotal} peserta aktif` : "Memuat peserta"}</span>
            {stats && stats.removedCount > 0 ? (
              <>
                <MetaSeparator />
                {/* Dulu banner penuh; di layar pendek ia memakan ruang tabel. Penjelasan lengkapnya ada di panel detail peserta yang terhapus. */}
                <span className="inline-flex items-center gap-1.5" title="Tetap disimpan untuk audit, tapi tidak muncul di pencarian booth dan kasir serta tidak dihitung di laporan.">
                  <StatusDot tone="warning" />
                  {stats.removedCount} dihapus di sumber, tidak dihitung
                </span>
              </>
            ) : null}
            {config && usesScanner ? (
              <>
                <MetaSeparator />
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot tone={gagal ? "error" : menit > 0 ? "success" : "neutral"} />
                  {gagal ? "Sync terakhir gagal" : menit > 0 ? `Sync otomatis tiap ${menit} menit` : "Sync otomatis mati"}
                  {stats?.lastSyncedAt ? `, terakhir ${formatEventDateTime(stats.lastSyncedAt, zone)} ${abbr}` : ""}
                </span>
                <button type="button" onClick={() => void sync()} disabled={syncing} className="rounded-sm font-medium text-primary hover:underline disabled:opacity-50">
                  {syncing ? "Menyinkron..." : "Sync sekarang"}
                </button>
                <Link href="/admin/settings" className="rounded-sm font-medium text-primary hover:underline">Kelola</Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <Button variant="outlined" onClick={() => setImportOpen(true)} icon={<FileArrowUp size={16} />}>Impor</Button>
            <ExportMenu endpoint="/api/admin/participants/export" label="Ekspor" />
            <Button onClick={() => daftar.current?.tambah()} icon={<Plus size={16} weight="bold" />}>Tambah peserta</Button>
          </>
        }
      />

      {gagal ? <Banner tone="warning" icon={<ArrowsClockwise size={16} />}>{gagal}</Banner> : null}
      {message ? <Banner tone="success" icon={<CheckCircle size={18} />}>{message}</Banner> : null}

      <ParticipantList
        ref={daftar}
        reloadKey={reloadKey}
        timeZone={zone}
        onStats={setStats}
        onChanged={() => setReloadKey((key) => key + 1)}
      />

      <Dialog
        open={importOpen}
        onClose={closeImport}
        dismissible={!importing}
        size="lg"
        title="Impor peserta dari CSV atau XLSX"
        description="Baris dicocokkan lewat kode QR: yang sudah ada diperbarui, yang belum ditambahkan. Peserta dari Scanner API hanya diperbarui email, telepon, dan jawabannya."
        actions={
          <>
            <Button variant="outlined" disabled={importing} onClick={closeImport}>Batal</Button>
            {preview
              ? <Button loading={importing} disabled={barisDiterapkan === 0} onClick={() => void runImport(false)}>Terapkan ke {barisDiterapkan} baris</Button>
              : <Button loading={importing} disabled={!importFile} onClick={() => void runImport(true)}>Pratinjau impor</Button>}
          </>
        }
      >
        <div className="flex flex-col gap-4 text-body-medium">
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-container-high p-3">
            <span className="min-w-0 flex-1 text-on-surface-variant">Belum punya berkasnya? Templat berisi kolom bawaan, pertanyaan tambahan formulir, dan dua baris contoh.</span>
            <ButtonLink native variant="outlined" size="sm" href="/api/admin/participants/export?template=1&format=xlsx" icon={<DownloadSimple size={16} />}>Templat XLSX</ButtonLink>
            <ButtonLink native variant="outlined" size="sm" href="/api/admin/participants/export?template=1&format=csv" icon={<DownloadSimple size={16} />}>Templat CSV</ButtonLink>
          </div>
          <p className="text-on-surface-variant">
            Kolom dikenali lewat baris pertama, termasuk nama Indonesia (nama, perusahaan, jabatan, no_hp). Hanya <span className="font-medium text-on-surface">qr_code</span> dan <span className="font-medium text-on-surface">name</span> yang wajib. Kolom kosong tidak menghapus jawaban yang sudah ada.
          </p>
          <label className="block font-medium">
            Berkas
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setPreview(null); }}
              className="mt-1.5 block w-full rounded-md border border-outline bg-surface-container-lowest p-2 text-body-medium file:mr-3 file:rounded file:border-0 file:bg-surface-container-high file:px-3 file:py-1 file:text-body-medium file:font-medium"
            />
          </label>
          {error ? <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p> : null}
          {preview ? (
            <div className="rounded-md border border-outline-variant p-3">
              <p className="font-medium">{preview.file_name}, {preview.rows} baris terbaca</p>
              <ul className="mt-2 space-y-0.5">
                <li><span className="font-medium">{preview.inserted}</span> peserta baru ditambahkan</li>
                <li><span className="font-medium">{preview.updated}</span> peserta manual diperbarui</li>
                <li><span className="font-medium">{preview.source_locked}</span> peserta Scanner API, hanya email dan telepon</li>
                <li><span className="font-medium text-error">{preview.rejected}</span> baris ditolak</li>
              </ul>
              <p className="mt-2 text-on-surface-variant">Kolom dikenali: {preview.recognized_columns.join(", ") || "tidak ada"}</p>
              {preview.issues.length > 0 ? (
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-outline-variant pt-2 text-on-surface-variant">
                  {preview.issues.map((issue) => <li key={`${issue.row}-${issue.qr_code ?? ""}`}>Baris {issue.row}{issue.qr_code ? ` (${issue.qr_code})` : ""}: {issue.reason}</li>)}
                  {preview.issues_truncated ? <li className="italic">Daftar dipotong pada 50 baris pertama.</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Dialog>
    </WorkspacePage>
  );
}
