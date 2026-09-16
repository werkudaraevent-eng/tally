"use client";

import { ArrowsClockwise, CheckCircle, DownloadSimple, FileArrowUp, Plus, X, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useRef, useState } from "react";
import { ParticipantList, type ParticipantListHandle } from "@/components/admin/participant-list";
import { ExportMenu } from "@/components/admin/export-menu";
import { useAutoSync, useScannerConfig, useScannerSync } from "@/components/admin/scanner-panel";
import { useToast } from "@/components/toast";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import { Banner, Button, PageHeader, PageShell } from "@/components/m3";

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
  /** Pegangan ke daftar peserta, supaya tombol di kepala halaman bisa membuka
   *  dialog tambah yang keadaannya tinggal di dalam daftar itu. */
  const daftar = useRef<ParticipantListHandle>(null);
  const toast = useToast();
  const { zone, abbr } = useEventTimeZone();

  /**
   * Yang tersisa dari Scanner API di halaman ini: STATUS, bukan setelan.
   *
   * Panelnya pindah ke Pengaturan -> Integrasi. Yang tetap di sini hanya satu
   * baris di bawah judul, karena panitia memang perlu tahu apakah daftar yang
   * sedang dibacanya masih diperbarui — dan itu satu-satunya pertanyaan tentang
   * sinkronisasi yang ditanyakan sambil menatap tabel.
   */
  const { config } = useScannerConfig();
  const { menit } = useAutoSync();
  const { syncing, sync, gagal } = useScannerSync(() => setReloadKey((key) => key + 1));

  /**
   * Pewaktu sinkronisasi otomatis berjalan DI SINI, bukan di panel setelannya.
   *
   * Ia interval peramban: ia hanya hidup selama tabnya terbuka, dan halaman yang
   * terbuka sepanjang acara adalah halaman ini. Memasangnya di layar setelan
   * berarti "Tiap 5 menit" hanya berjalan selama seseorang menatap layar setelan.
   */
  const usesScanner = config ? ["scanner_api", "hybrid"].includes(config.participant_source) : false;
  useEffect(() => {
    if (menit <= 0 || !usesScanner) return;
    const interval = window.setInterval(() => { void sync(); }, menit * 60000);
    return () => window.clearInterval(interval);
  }, [menit, usesScanner, sync]);

  // Impor
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  function closeImport() { setImportOpen(false); setImportFile(null); setPreview(null); }

  /**
   * Unggah berkas dua kali: sekali untuk pratinjau, sekali untuk menerapkan.
   *
   * Bukan menyimpan hasil urai di server antara dua langkah. Tidak ada tempat
   * menyimpannya yang bertahan antar-permintaan tanpa menambah tabel atau
   * penyimpanan sesi, dan berkas peserta berukuran puluhan kilobita -- mengurai
   * ulang jauh lebih murah daripada infrastruktur untuk mengingatnya.
   */
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

  return <PageShell>
    <>
      {/* Aksi halaman: sekunder dulu, primer paling kanan, dan HANYA SATU yang
          primer. Sebelumnya empat tombol berjajar dengan bobot yang sama —
          "Impor", "Ekspor XLSX", "CSV", "Tambah peserta" — dan dua di antaranya
          adalah satu keputusan yang sama (format ekspor) yang dipecah jadi dua
          tombol. Yang kedua sekarang menu di dalam satu tombol. */}
      <PageHeader
        // Satu baris, bukan satu panel. Titik warnanya menjawab "apakah daftar
        // ini masih diperbarui"; sisanya — base URL, slug, kunci — ada di balik
        // "Kelola", tempat yang memang dibuka sekali per acara.
        meta={config ? (
          usesScanner ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className={`size-1.5 rounded-full ${gagal ? "bg-error" : menit > 0 ? "bg-success" : "bg-outline"}`} />
                {gagal ? "Sync terakhir gagal" : menit > 0 ? `Sync otomatis tiap ${menit} menit` : "Sync otomatis nonaktif"}
              </span>
              <span aria-hidden>&middot;</span>
              <button type="button" onClick={() => void sync()} disabled={syncing} className="rounded-sm font-medium text-primary hover:underline disabled:opacity-50">
                {syncing ? "Menyinkron..." : "Sync sekarang"}
              </button>
              <span aria-hidden>&middot;</span>
              <Link href="/admin/settings" className="rounded-sm font-medium text-primary hover:underline">Kelola</Link>
            </>
          ) : null
        ) : null}
        actions={<>
          <Button variant="outlined" onClick={() => setImportOpen(true)} icon={<FileArrowUp size={16} />}>Impor</Button>
          <ExportMenu endpoint="/api/admin/participants/export" label="Ekspor" />
          <Button onClick={() => daftar.current?.tambah()} icon={<Plus size={16} weight="bold" />}>Tambah peserta</Button>
        </>}
      />

      {gagal && <Banner tone="warning" className="mb-4" icon={<ArrowsClockwise size={16} />}>{gagal}</Banner>}
      {error && <Banner tone="error" className="mb-4" icon={<XCircle size={18} />}>{error}</Banner>}
      {message && <Banner tone="success" className="mb-4" icon={<CheckCircle size={18} />}>{message}</Banner>}

      {/* Zona diteruskan sebagai prop, bukan dibaca ulang di dalam ParticipantList:
          keduanya menampilkan jam sync yang sama, dan dua permintaan terpisah bisa
          sesaat menunjukkan zona berbeda di satu halaman. */}
      <ParticipantList
        ref={daftar}
        reloadKey={reloadKey}
        timeZone={zone}
        timeZoneAbbr={abbr}
        onChanged={() => setReloadKey((key) => key + 1)}
      />
    </>

    {/* Modal impor. Sebelumnya kartu di kolom kanan, dan pratinjaunya -- daftar
        baris bermasalah yang bisa puluhan -- tidak muat di sana. */}
    {importOpen && <div
      role="dialog"
      aria-modal="true"
      aria-label="Impor peserta"
      className="fixed inset-0 z-50 grid place-items-center bg-scrim/50 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !importing) closeImport(); }}
    >
      <div className="rounded-lg max-h-[90dvh] w-full max-w-2xl overflow-y-auto border border-outline-variant bg-panel p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-body-small font-semibold ed-label text-primary">Impor peserta</p>
            <h2 className="mt-2 text-headline-small font-semibold">Unggah CSV atau XLSX</h2>
          </div>
          <button type="button" onClick={closeImport} disabled={importing} className="min-h-11 px-2 text-body-medium font-semibold disabled:opacity-40" aria-label="Tutup"><X size={18} /></button>
        </div>

        <div className="rounded-lg mt-6 border border-outline-variant bg-panel-high p-4 text-body-medium leading-6">
          <p className="font-semibold">Belum punya berkasnya?</p>
          <p className="mt-1 text-body-small text-on-surface-variant">Template berisi kolom bawaan, satu kolom untuk tiap pertanyaan tambahan di formulir pendaftaran, dan dua baris contoh. Hapus baris contoh sebelum mengunggah.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/admin/participants/export?template=1&format=xlsx" className="m3-btn inline-flex min-h-12 items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-label-large font-medium text-on-surface hover:bg-primary-soft" data-size="md"><DownloadSimple size={16} /> Template XLSX</a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/admin/participants/export?template=1&format=csv" className="m3-btn inline-flex min-h-12 items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-label-large font-medium text-on-surface hover:bg-primary-soft" data-size="md"><DownloadSimple size={16} /> Template CSV</a>
          </div>
        </div>

        <p className="mt-5 text-body-small leading-5 text-on-surface-variant">
          Kolom dicocokkan lewat baris pertama, dan nama Indonesia ikut dikenali (<span className="font-mono">nama</span>, <span className="font-mono">perusahaan</span>, <span className="font-mono">jabatan</span>, <span className="font-mono">no_hp</span>). Pertanyaan tambahan formulir dikenali lewat kuncinya maupun labelnya persis seperti di formulir. Hanya <span className="font-mono">qr_code</span> dan <span className="font-mono">name</span> yang wajib. Baris dicocokkan dengan peserta lama lewat <span className="font-mono">qr_code</span>: yang sudah ada diperbarui, yang belum ditambahkan. Jawaban yang sudah ada tidak dihapus oleh kolom kosong. Peserta dari Scanner API hanya diperbarui email, telepon, dan jawabannya.
        </p>

        <label className="mt-5 block text-body-medium font-semibold">Berkas
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setPreview(null); }}
            className="rounded-lg mt-2 block w-full border border-outline-variant bg-surface p-2.5 text-body-medium file:mr-3 file:border-0 file:bg-panel-high file:px-3 file:py-1.5 file:text-body-small file:font-semibold"
          />
        </label>

        {preview && <div className="rounded-lg mt-5 border border-outline-variant bg-panel-high p-4 text-body-medium leading-6">
          <p className="font-semibold">{preview.file_name} · {preview.rows} baris terbaca</p>
          <ul className="mt-2 space-y-0.5 text-body-small">
            <li><span className="font-semibold text-primary-dim">{preview.inserted}</span> peserta baru ditambahkan</li>
            <li><span className="font-semibold">{preview.updated}</span> peserta manual diperbarui</li>
            <li><span className="font-semibold">{preview.source_locked}</span> peserta Scanner API — hanya email &amp; telepon</li>
            <li><span className="font-semibold text-error">{preview.rejected}</span> baris ditolak</li>
          </ul>
          <p className="mt-2 text-body-small text-on-surface-variant">Kolom dikenali: {preview.recognized_columns.join(", ") || "-"}</p>
          {preview.issues.length > 0 && <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-outline-variant pt-2 text-body-small text-on-surface-variant">
            {preview.issues.map((issue) => <li key={`${issue.row}-${issue.qr_code ?? ""}`}>Baris {issue.row}{issue.qr_code ? ` (${issue.qr_code})` : ""}: {issue.reason}</li>)}
            {preview.issues_truncated && <li className="italic">Daftar dipotong pada 50 baris pertama.</li>}
          </ul>}
        </div>}

        <div className="mt-6 flex flex-wrap gap-2">
          {/* Terapkan baru muncul SETELAH pratinjau. Impor tanpa melihat
              hitungannya lebih dulu adalah cara paling cepat menimpa ratusan
              nama dengan berkas yang kolomnya tergeser satu. */}
          {preview
            ? <button type="button" onClick={() => void runImport(false)} disabled={importing || preview.inserted + preview.updated + preview.source_locked === 0} className="rounded-md min-h-12 flex-1 bg-primary px-4 font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-40">{importing ? "Menerapkan..." : `Terapkan ke ${preview.inserted + preview.updated + preview.source_locked} baris`}</button>
            : <button type="button" onClick={() => void runImport(true)} disabled={!importFile || importing} className="rounded-md min-h-12 flex-1 bg-primary px-4 font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-40">{importing ? "Membaca berkas..." : "Pratinjau impor"}</button>}
          <button type="button" onClick={closeImport} disabled={importing} className="rounded-md min-h-12 border border-outline-variant px-4 font-semibold disabled:opacity-40">Batal</button>
        </div>
      </div>
    </div>}
  </PageShell>;
}
