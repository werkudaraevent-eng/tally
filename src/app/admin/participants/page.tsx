"use client";

import { ArrowsClockwise, CheckCircle, DownloadSimple, FileArrowUp, Plus, XCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ParticipantList, type ParticipantListHandle, type ParticipantStats } from "@/components/admin/participant-list";
import { ExportMenu } from "@/components/admin/export-menu";
import { SyncMenu } from "@/components/admin/sync-menu";
import { useAutoSync, useScannerConfig, useScannerSync } from "@/components/admin/scanner-panel";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import { Banner, Button, ButtonLink, Dialog, MetaSeparator, WorkspaceHeader, WorkspacePage } from "@/components/m3";

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
  // Layar Viewer selalu ber-slug (/e/<slug>/live). Di alamat lama tanpa slug
  // tautannya tidak ditampilkan: /live tanpa slug hanya memantul ke /events.
  const [tautanKlien, setTautanKlien] = useState<string | null>(null);
  useEffect(() => {
    const slug = window.location.pathname.match(/^\/e\/([^/]+)/)?.[1];
    const pewaktu = window.setTimeout(() => setTautanKlien(slug ? `/e/${slug}/live` : null), 0);
    return () => window.clearTimeout(pewaktu);
  }, []);

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
    if (!response) { setError("Connection lost while uploading the file."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = body.error?.details?.message ?? body.error?.message ?? "Import failed.";
      setError(failure); toast.error("Participant import failed", failure);
      return;
    }
    if (dryRun) { setPreview(body as ImportPreview); return; }
    closeImport();
    toast.success("Import complete", `${body.inserted} added, ${body.updated} updated, ${body.rejected} rejected.`);
    setMessage(`Import complete: ${plural(body.inserted, "participant")} added, ${body.updated} updated, ${body.source_locked} with contact details only, ${body.rejected} rejected.`);
    setReloadKey((key) => key + 1);
  }

  const barisDiterapkan = preview ? preview.inserted + preview.updated + preview.source_locked : 0;

  return (
    <div lang="en" className="contents">
    <WorkspacePage fill>
      <WorkspaceHeader
        // Satu baris meta, satu fakta. Peserta yang dihapus di sumber dijelaskan
        // di kaki tabel dan di barisnya; status sinkron ada di menu Sinkron.
        meta={<>
          <span>{stats ? plural(stats.activeTotal, "active participant") : "Loading participants"}</span>
          {/* Layar akun Viewer: admin bisa memeriksa persis apa yang dilihat klien. */}
          {tautanKlien ? (
            <>
              <MetaSeparator />
              <a href={tautanKlien} className="text-primary hover:underline">Client view</a>
            </>
          ) : null}
        </>}
        actions={
          <>
            {config && usesScanner ? (
              <SyncMenu
                menit={menit}
                gagal={gagal}
                terakhir={stats?.lastSyncedAt ? `${formatEventDateTime(stats.lastSyncedAt, zone)} ${abbr}` : null}
                syncing={syncing}
                onSync={() => void sync()}
              />
            ) : null}
            <Button simpan variant="outlined" onClick={() => setImportOpen(true)} icon={<FileArrowUp size={16} />}>Import</Button>
            <ExportMenu endpoint="/api/admin/participants/export" label="Export" />
            <Button onClick={() => daftar.current?.tambah()} icon={<Plus size={16} weight="bold" />}>Add participant</Button>
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
        title="Import participants from CSV or XLSX"
        description="Rows are matched by QR code: existing participants are updated and new ones are added. Participants from Scanner API only get their email, phone and answers updated."
        actions={
          <>
            <Button variant="outlined" disabled={importing} onClick={closeImport}>Cancel</Button>
            {preview
              ? <Button simpan loading={importing} disabled={barisDiterapkan === 0} onClick={() => void runImport(false)}>Apply to {plural(barisDiterapkan, "row")}</Button>
              : <Button loading={importing} disabled={!importFile} onClick={() => void runImport(true)}>Preview import</Button>}
          </>
        }
      >
        <div className="flex flex-col gap-4 text-body-medium">
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-container-high p-3">
            <span className="min-w-0 flex-1 text-on-surface-variant">No file yet? The template has the built-in columns, the extra registration form questions and two sample rows.</span>
            <ButtonLink native variant="outlined" size="sm" href="/api/admin/participants/export?template=1&format=xlsx" icon={<DownloadSimple size={16} />}>XLSX template</ButtonLink>
            <ButtonLink native variant="outlined" size="sm" href="/api/admin/participants/export?template=1&format=csv" icon={<DownloadSimple size={16} />}>CSV template</ButtonLink>
          </div>
          <p className="text-on-surface-variant">
            Columns are recognised from the first row, in English or Indonesian (for example organisation or perusahaan, phone or no_hp). Only <span className="font-medium text-on-surface">qr_code</span> and <span className="font-medium text-on-surface">name</span> are required. Empty cells do not delete existing answers.
          </p>
          <label className="block font-medium">
            File
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
              <p className="font-medium">{preview.file_name}, {plural(preview.rows, "row")} read</p>
              <ul className="mt-2 space-y-0.5">
                <li><span className="font-medium">{preview.inserted}</span> {preview.inserted === 1 ? "new participant" : "new participants"} added</li>
                <li><span className="font-medium">{preview.updated}</span> {preview.updated === 1 ? "manual participant" : "manual participants"} updated</li>
                <li><span className="font-medium">{preview.source_locked}</span> Scanner API {preview.source_locked === 1 ? "participant" : "participants"}, email and phone only</li>
                <li><span className="font-medium text-error">{preview.rejected}</span> {preview.rejected === 1 ? "row" : "rows"} rejected</li>
              </ul>
              <p className="mt-2 text-on-surface-variant">Recognised columns: {preview.recognized_columns.join(", ") || "none"}</p>
              {preview.issues.length > 0 ? (
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-outline-variant pt-2 text-on-surface-variant">
                  {preview.issues.map((issue) => <li key={`${issue.row}-${issue.qr_code ?? ""}`}>Row {issue.row}{issue.qr_code ? ` (${issue.qr_code})` : ""}: {issue.reason}</li>)}
                  {preview.issues_truncated ? <li className="italic">List cut off at the first 50 rows.</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Dialog>
    </WorkspacePage>
    </div>
  );
}
