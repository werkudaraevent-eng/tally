"use client";

import { ArrowLeft, ArrowsClockwise, CheckCircle, DownloadSimple, FileArrowUp, Gear, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { ParticipantList } from "@/components/admin/participant-list";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { useEventTimeZone } from "@/lib/use-event-timezone";

const AUTO_OPTIONS = [
  { label: "Sync otomatis: mati", value: 0 },
  { label: "Tiap 5 menit", value: 5 },
  { label: "Tiap 15 menit", value: 15 },
  { label: "Tiap 30 menit", value: 30 },
  { label: "Tiap 60 menit", value: 60 },
];

type ScannerConfig = {
  base_url: string | null;
  event_slug: string | null;
  key_masked: string | null;
  key_set: boolean;
  participant_source: string;
  env_fallback: { base_url: boolean; key: boolean; event_slug: boolean };
};

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
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [autoMinutes, setAutoMinutes] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();

  // Setelan Scanner API. Tertutup secara default: ketiga nilainya diisi sekali
  // saat event disiapkan, lalu tidak disentuh lagi sepanjang acara -- sementara
  // tabel peserta di bawahnya dibaca terus-menerus. Yang jarang dipakai tidak
  // berhak atas ruang permanen di atas lipatan.
  const [config, setConfig] = useState<ScannerConfig | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Impor
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const loadConfig = useCallback(async () => {
    const response = await fetch("/api/admin/participants/scanner-config", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as ScannerConfig;
    setConfig(data);
    setBaseUrl(data.base_url ?? "");
    setEventSlug(data.event_slug ?? "");
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void loadConfig(); }, 0); return () => window.clearTimeout(timer); }, [loadConfig]);

  const sync = useCallback(async () => {
    setSyncing(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/participants/sync", { method: "POST", signal: AbortSignal.timeout(90000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = data.error?.message ?? `Sync peserta gagal (HTTP ${response.status}).`;
        setError(failure);
        toast.error("Sync peserta gagal", failure);
        return;
      }
      setMessage(`${data.synced} peserta tersinkron dari API client. Total sumber: ${data.source_total}.`);
      toast.success(`${data.synced} peserta tersinkron`, `Total di sumber: ${data.source_total}.`);
      setLastSyncedAt(new Date().toISOString());
      setReloadKey((key) => key + 1);
    } catch (syncError) {
      const failure = syncError instanceof DOMException && syncError.name === "TimeoutError" ? "Sync terlalu lama. Periksa koneksi API client lalu coba lagi." : "Sync gagal karena koneksi terputus. Coba lagi.";
      setError(failure);
      toast.error("Sync peserta gagal", failure);
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (autoMinutes <= 0) return;
    const interval = window.setInterval(() => { void sync(); }, autoMinutes * 60000);
    return () => window.clearInterval(interval);
  }, [autoMinutes, sync]);

  async function saveConfig() {
    setSavingConfig(true); setError(""); setMessage("");
    const response = await fetch("/api/admin/participants/scanner-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_url: baseUrl.trim() || null,
        event_slug: eventSlug.trim() || null,
        // Kolom kunci yang dibiarkan kosong berarti "jangan sentuh", bukan
        // "hapus". Menyamakan keduanya membuat setiap penyimpanan slug diam-diam
        // mematikan sinkronisasi.
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      }),
    }).catch(() => null);
    setSavingConfig(false);
    if (!response) { setError("Koneksi terputus. Setelan belum tersimpan."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = body.error?.details?.message ?? body.error?.message ?? "Setelan gagal disimpan.";
      setError(failure); toast.error("Setelan Scanner API gagal disimpan", failure);
      return;
    }
    setApiKey("");
    toast.success("Setelan Scanner API tersimpan");
    void loadConfig();
  }

  async function clearKey() {
    setSavingConfig(true);
    const response = await fetch("/api/admin/participants/scanner-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_url: baseUrl.trim() || null, event_slug: eventSlug.trim() || null, api_key: null }),
    }).catch(() => null);
    setSavingConfig(false);
    if (!response?.ok) { setError("Kunci gagal dihapus."); return; }
    toast.success("Kunci API dihapus", "Sinkronisasi akan memakai env sebagai cadangan bila tersedia.");
    void loadConfig();
  }

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

  const usesScanner = config ? ["scanner_api", "hybrid"].includes(config.participant_source) : true;
  const buttonClass = "inline-flex min-h-11 items-center gap-2 border border-outline-variant px-3 text-body-medium font-semibold hover:border-primary hover:text-primary";

  return <main className="bg-surface px-5 py-6 text-on-surface sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold text-primary"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8">
        <p className="text-body-small font-semibold uppercase tracking-[0.2em] text-primary">Participant directory</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Peserta.</h1>
        <p className="mt-3 max-w-2xl text-body-medium leading-6 text-on-surface-variant">Tarik peserta dari Event Scanner API, atau kelola sendiri lewat impor berkas dan penyuntingan per baris.</p>
      </div>

      {/* Baris status: satu baris, bukan tiga kartu. Ia menjawab tiga pertanyaan
          yang memang ditanyakan berulang -- kapan sync terakhir, apakah otomatis
          menyala, dan apakah setelannya lengkap -- lalu menyerahkan sisa layar
          ke tabel peserta. */}
      <section className="rounded-lg mt-8 flex flex-col gap-3 border border-outline-variant bg-panel p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-small text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5 text-body-medium font-semibold text-on-surface">Scanner API</span>
          <span>Sync terakhir: <span className="font-semibold text-on-surface">{lastSyncedAt ? `${formatEventDateTime(lastSyncedAt, zone)} ${abbr}` : "belum ada"}</span>{syncing ? " · berjalan..." : ""}</span>
          <span>Base URL <span className="font-mono">{config?.base_url ?? (config?.env_fallback.base_url ? "dari env" : "—")}</span></span>
          <span>Slug <span className="font-mono">{config?.event_slug ?? (config?.env_fallback.event_slug ? "dari env" : "—")}</span></span>
          <span>Kunci <span className="font-mono">{config?.key_masked ?? (config?.env_fallback.key ? "dari env" : "—")}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={autoMinutes} onChange={(event) => setAutoMinutes(Number(event.target.value))} className="rounded-md h-11 border border-outline-variant bg-surface px-2 text-body-medium outline-none focus:border-primary" aria-label="Interval sync otomatis">
            {AUTO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" onClick={() => setConfigOpen((open) => !open)} className={buttonClass} aria-expanded={configOpen}><Gear size={16} />{configOpen ? "Tutup setelan" : "Setelan"}</button>
          <button type="button" onClick={() => void sync()} disabled={syncing} className="rounded-md inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-body-medium font-semibold text-on-primary hover:bg-primary-dim disabled:cursor-wait disabled:opacity-60"><ArrowsClockwise size={16} />{syncing ? "Menyinkron..." : "Sync sekarang"}</button>
        </div>
      </section>

      {!usesScanner && <p className="rounded-lg mt-3 flex items-start gap-2 border border-warning-soft-outline bg-warning-soft p-3 text-body-small text-warning"><WarningCircle size={16} className="mt-0.5 shrink-0" />Sumber peserta event ini <span className="font-semibold">{config?.participant_source}</span>, jadi sinkronisasi terjadwal melewatinya. Setelan Scanner API tetap tersimpan bila diisi.</p>}

      {configOpen && <section className="rounded-lg mt-3 border border-outline-variant bg-panel p-6">
        <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Setelan Scanner API</h2>
        <p className="mt-2 text-body-small text-on-surface-variant">Kredensial disimpan per event. Bila kolom dikosongkan, sinkronisasi memakai variabel lingkungan sebagai cadangan.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="block text-body-medium font-semibold">Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://scanner.contoh.com/api/v1" className="rounded-md mt-1.5 h-11 w-full border border-outline-variant bg-surface px-3 font-mono text-body-small outline-none focus:border-primary" />
          </label>
          <label className="block text-body-medium font-semibold">Slug event di Scanner API
            <input value={eventSlug} onChange={(event) => setEventSlug(event.target.value)} placeholder="nama-acara-2026" className="rounded-md mt-1.5 h-11 w-full border border-outline-variant bg-surface px-3 font-mono text-body-small outline-none focus:border-primary" />
          </label>
          <label className="block text-body-medium font-semibold">Kunci API
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" placeholder={config?.key_set ? "Kosongkan untuk mempertahankan kunci sekarang" : "Tempel kunci di sini"} className="rounded-md mt-1.5 h-11 w-full border border-outline-variant bg-surface px-3 font-mono text-body-small outline-none focus:border-primary" />
          </label>
        </div>
        {/* Kunci yang sudah tersimpan tidak pernah dikirim balik ke layar ini,
            jadi kolomnya SELALU mulai kosong. Kalimat ini yang mencegahnya
            terbaca sebagai setelan yang hilang. */}
        <p className="mt-3 text-body-small text-on-surface-variant">Kunci tersimpan tidak pernah ditampilkan ulang — yang terlihat hanya empat karakter terakhirnya.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveConfig()} disabled={savingConfig} className="rounded-md min-h-11 bg-primary px-4 text-body-medium font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-50">{savingConfig ? "Menyimpan..." : "Simpan setelan"}</button>
          {config?.key_set && <button type="button" onClick={() => void clearKey()} disabled={savingConfig} className="rounded-md min-h-11 border border-outline-variant px-4 text-body-medium font-semibold text-error hover:border-error disabled:opacity-50">Hapus kunci</button>}
        </div>
      </section>}

      {error && <div role="alert" className="rounded-lg mt-3 flex items-start gap-3 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error"><XCircle size={20} className="mt-0.5 shrink-0" />{error}</div>}
      {message && <div role="status" className="rounded-lg mt-3 flex items-start gap-3 border border-success-soft-outline bg-success-soft p-4 text-body-medium text-primary-dim"><CheckCircle size={20} className="mt-0.5 shrink-0" />{message}</div>}

      {/* Zona diteruskan sebagai prop, bukan dibaca ulang di dalam ParticipantList:
          keduanya menampilkan jam sync yang sama, dan dua permintaan terpisah bisa
          sesaat menunjukkan zona berbeda di satu halaman. */}
      <ParticipantList
        reloadKey={reloadKey}
        timeZone={zone}
        timeZoneAbbr={abbr}
        onChanged={() => setReloadKey((key) => key + 1)}
        toolbar={<>
          <button type="button" onClick={() => setImportOpen(true)} className={buttonClass}><FileArrowUp size={16} /> Impor</button>
          {/* `<a>` biasa, bukan `<Link>`: alamatnya route handler yang membalas
              Content-Disposition attachment, dan navigasi klien Next akan mencoba
              me-render balasannya sebagai halaman alih-alih mengunduhnya. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/admin/participants/export?format=xlsx" className={buttonClass}><DownloadSimple size={16} /> Ekspor XLSX</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/admin/participants/export?format=csv" className={buttonClass} title="Ekspor CSV">CSV</a>
        </>}
      />
    </div>

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
            <p className="text-body-small font-semibold uppercase tracking-[0.16em] text-primary">Impor peserta</p>
            <h2 className="mt-2 text-headline-small font-semibold">Unggah CSV atau XLSX</h2>
          </div>
          <button type="button" onClick={closeImport} disabled={importing} className="min-h-11 px-2 text-body-medium font-semibold disabled:opacity-40" aria-label="Tutup"><X size={18} /></button>
        </div>

        <div className="rounded-lg mt-6 border border-outline-variant bg-panel-high p-4 text-body-medium leading-6">
          <p className="font-semibold">Belum punya berkasnya?</p>
          <p className="mt-1 text-body-small text-on-surface-variant">Template berisi kedelapan kolom yang dibaca importir dan dua baris contoh. Hapus baris contoh sebelum mengunggah.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/admin/participants/export?template=1&format=xlsx" className={buttonClass}><DownloadSimple size={16} /> Template XLSX</a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/admin/participants/export?template=1&format=csv" className={buttonClass}><DownloadSimple size={16} /> Template CSV</a>
          </div>
        </div>

        <p className="mt-5 text-body-small leading-5 text-on-surface-variant">
          Kolom dicocokkan lewat baris pertama, dan nama Indonesia ikut dikenali (<span className="font-mono">nama</span>, <span className="font-mono">perusahaan</span>, <span className="font-mono">jabatan</span>, <span className="font-mono">no_hp</span>). Hanya <span className="font-mono">qr_code</span> dan <span className="font-mono">name</span> yang wajib. Baris dicocokkan dengan peserta lama lewat <span className="font-mono">qr_code</span>: yang sudah ada diperbarui, yang belum ditambahkan. Peserta dari Scanner API hanya diperbarui email dan teleponnya.
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
  </main>;
}
