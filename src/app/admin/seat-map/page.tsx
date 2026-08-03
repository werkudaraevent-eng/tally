"use client";

import { ArrowLeft, ArrowSquareOut, CheckCircle, Eye, EyeSlash, Monitor, Plus, Trash, UploadSimple, Warning, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SeatMapView } from "@/components/seat-map-view";
import { useToast } from "@/components/toast";
import type { PublicViewMode, SeatMapConfig, SeatRule } from "@/lib/seat-map";

// CMS denah tempat duduk.
//
// Editornya mengisi konfigurasi, bukan menggambar bebas. Denah acara ini sangat
// teratur, jadi kanvas drag-and-drop hanya menambah cara untuk membuat denah
// rusak (meja tumpang tindih, keluar kanvas) tanpa memberi kemampuan yang
// benar-benar dibutuhkan. Pratinjau memakai renderer yang sama dengan halaman
// publik, sehingga yang ditata admin persis yang dilihat tamu.

type Session = {
  id: number;
  slug: string;
  name: string;
  sub_event_id: string | null;
  title: string;
  subtitle: string | null;
  background_color: string;
  text_color: string;
  accent_color: string;
  /** Null berarti agenda ini memakai warna solid. */
  background_image_url: string | null;
  is_published: boolean;
  sort_order: number;
};

type SubEvent = { subEventId: string; subEventName: string; seatCount: number };

type MatchReport = {
  session_id: number;
  slug: string;
  total_assignments: number;
  matched_seats: number;
  unmatched_labels: string[];
  unmatched_count: number;
  empty_seats: number;
  participants_without_seat: number;
  total_active_participants: number;
};

// Penjelasan tiap mode ditaruh berdampingan supaya admin memilih berdasarkan
// jenis layarnya, bukan menebak dari nama modenya.
const VIEW_MODES: { value: PublicViewMode; label: string; detail: string }[] = [
  { value: "search", label: "Pencarian nama", detail: "Untuk HP tamu dan layar sentuh. Tamu mengetik namanya, kursinya disorot." },
  { value: "qr", label: "QR untuk LED", detail: "Untuk LED tanpa sentuh. Layar menampilkan QR besar; nama peserta tidak ditampilkan." },
];

type ConfigState = SeatMapConfig & { name: string; public_view_mode: PublicViewMode; default_session_id: number | null };

type Payload = {
  config: ConfigState;
  sessions: Session[];
  available_sub_events: SubEvent[];
  geometry: { total_tables: number; total_seats: number };
  reports: MatchReport[];
};

export default function SeatMapAdminPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingSession, setSavingSession] = useState<number | null>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [newAgendaName, setNewAgendaName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  // Konfirmasi hapus ditahan di dalam kartunya sendiri, bukan lewat dialog
  // browser: satu klik tak sengaja tidak boleh langsung membuang agenda.
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  // Unggahan dilacak per agenda, bukan satu penanda global: tiap kartu punya
  // tombolnya sendiri, dan penanda global akan menonaktifkan semua tombol
  // sekaligus padahal hanya satu yang sedang bekerja.
  const [uploadingBackground, setUploadingBackground] = useState<number | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  async function load() {
    const response = await fetch("/api/admin/seat-map", { cache: "no-store" });
    if (!response.ok) { setError("Data denah gagal dimuat."); return; }
    const data = (await response.json()) as Payload;
    setPayload(data);
    setConfig(data.config);
    setSessions(data.sessions);
    setPreviewSlug((current) => current ?? data.sessions[0]?.slug ?? null);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updateConfig<K extends keyof ConfigState>(key: K, value: ConfigState[K]) {
    setConfig((current) => current && { ...current, [key]: value });
  }

  function updateSession(id: number, changes: Partial<Session>) {
    setSessions((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  /**
   * Unggah gambar latar agenda.
   *
   * Memakai endpoint yang sama dengan Live Display (`/api/display/background`).
   * Endpoint itu sudah generik: ia menerima berkas, memvalidasi jenis dan ukuran,
   * lalu mengembalikan URL publik. Membuat endpoint kedua hanya akan menduplikasi
   * aturan ukuran dan format, dan begitu salah satu diubah keduanya akan berbeda.
   *
   * Hasil unggahan hanya masuk ke state, BELUM tersimpan. Admin tetap harus
   * menekan Simpan, sama seperti perubahan warna dan judul di kartu ini.
   */
  async function uploadSessionBackground(session: Session, file: File) {
    setUploadingBackground(session.id); setError("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/display/background", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    setUploadingBackground(null);
    if (!response.ok) {
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Upload gambar gagal.";
      setError(failure);
      toast.error("Upload gambar gagal", failure);
      return;
    }
    updateSession(session.id, { background_image_url: data.url });
    toast.info("Gambar terunggah", "Klik Simpan agenda untuk menerapkannya ke halaman denah.");
  }

  async function saveConfig() {
    if (!config) return;
    setSavingConfig(true); setError("");
    const response = await fetch("/api/admin/seat-map", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: config.name,
        stage_label: config.stage_label,
        row_table_counts: config.row_table_counts,
        seat_rules: config.seat_rules,
        seat_label_pattern: config.seat_label_pattern,
        table_overrides: config.table_overrides,
        public_view_mode: config.public_view_mode,
        default_session_id: config.default_session_id,
      }),
    });
    const data = await response.json();
    setSavingConfig(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Denah gagal disimpan.";
      setError(failure);
      toast.error("Denah gagal disimpan", failure);
      return;
    }
    toast.success("Denah tersimpan", "Tata letak diperbarui untuk semua sesi.");
    await load();
  }

  async function createAgenda() {
    const name = newAgendaName.trim();
    if (!name) return;
    setCreating(true); setError("");
    const response = await fetch("/api/admin/seat-map/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    setCreating(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Agenda gagal ditambahkan.";
      setError(failure);
      toast.error("Agenda gagal ditambahkan", failure);
      return;
    }
    setNewAgendaName("");
    toast.success("Agenda ditambahkan", "Masih draf. Pilih sumber penempatan lalu publikasikan.");
    await load();
  }

  async function deleteAgenda(session: Session) {
    setDeleting(session.id); setError("");
    const response = await fetch(`/api/admin/seat-map/sessions?id=${session.id}`, { method: "DELETE" });
    setDeleting(null);
    setConfirmDelete(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const failure = data.error?.message ?? "Agenda gagal dihapus.";
      setError(failure);
      toast.error("Agenda gagal dihapus", failure);
      return;
    }
    // Pratinjau bisa sedang menunjuk agenda yang baru dihapus; dikosongkan agar
    // jatuh ke agenda pertama yang masih ada.
    setPreviewSlug((current) => (current === session.slug ? null : current));
    toast.success("Agenda dihapus", "Data peserta tidak terpengaruh karena penempatan tersimpan di scanner API.");
    await load();
  }

  async function saveSession(session: Session) {
    setSavingSession(session.id); setError("");
    const response = await fetch("/api/admin/seat-map/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: session.id,
        name: session.name,
        sub_event_id: session.sub_event_id,
        title: session.title,
        subtitle: session.subtitle,
        background_color: session.background_color,
        text_color: session.text_color,
        accent_color: session.accent_color,
        background_image_url: session.background_image_url,
        is_published: session.is_published,
        sort_order: session.sort_order,
      }),
    });
    const data = await response.json();
    setSavingSession(null);
    if (!response.ok) {
      const failure = data.error?.message ?? "Sesi gagal disimpan.";
      setError(failure);
      toast.error("Sesi gagal disimpan", failure);
      return;
    }
    toast.success("Sesi tersimpan", session.is_published ? "Sesi ini tampil di halaman publik." : "Sesi ini belum tampil di publik.");
    await load();
  }

  const previewSession = sessions.find((item) => item.slug === previewSlug) ?? sessions[0] ?? null;
  const totalTablesFromRows = (config?.row_table_counts ?? []).reduce((sum, count) => sum + count, 0);

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Denah tempat duduk</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
            Tata letak ruangan diatur di sini. Penempatan peserta datang dari scanner API dan tidak diubah dari halaman ini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/denah" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold">
            <ArrowSquareOut size={18} /> Halaman publik
          </a>
          {/* Tautan langsung ke mode LED. Panitia yang memasang layar cukup
              menyalin alamat ini, tanpa perlu mengubah setelan bawaan. */}
          <a href="/denah?mode=qr" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold">
            <Monitor size={18} /> Pratinjau LED
          </a>
        </div>
      </header>

      {error ? <p className="mt-4 border border-[var(--danger)] bg-[#fdf1f0] p-3 text-sm text-[var(--danger)]">{error}</p> : null}

      {!config ? <p className="mt-8 text-sm text-[var(--ink-muted)]">Memuat…</p> : <>
        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="text-base font-bold">Pratinjau</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Persis seperti yang dilihat tamu. {payload?.geometry.total_tables ?? 0} meja, {payload?.geometry.total_seats ?? 0} kursi.
            </p>
            {sessions.length > 1 ? <div className="mt-3 flex flex-wrap gap-2">
              {sessions.map((item) => <button key={item.id} type="button" onClick={() => setPreviewSlug(item.slug)} aria-pressed={item.slug === previewSession?.slug}
                className={`min-h-11 border px-3 text-sm font-semibold ${item.slug === previewSession?.slug ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)]"}`}>{item.name}</button>)}
            </div> : null}
            {/* Gambar latar dipasang di pembungkus, bukan diteruskan ke SeatMapView.
                Komponen itu dipakai bersama halaman publik dan hanya mengenal warna;
                menambah properti gambar ke sana berarti mengubah kontraknya hanya
                untuk kebutuhan pratinjau. Denahnya sendiri dibuat transparan supaya
                gambar di belakangnya terlihat. */}
            <div
              className="mt-4 overflow-x-auto bg-cover bg-center bg-no-repeat"
              style={{
                backgroundColor: previewSession?.background_color ?? "#111a63",
                backgroundImage: previewSession?.background_image_url
                  ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${previewSession.background_image_url})`
                  : undefined,
              }}
            >
              <SeatMapView
                config={config}
                backgroundColor={previewSession?.background_image_url ? "transparent" : (previewSession?.background_color ?? "#111a63")}
                textColor={previewSession?.text_color ?? "#ffffff"}
                accentColor={previewSession?.accent_color ?? "#f2c14e"}
                className="min-w-[760px]"
              />
            </div>
          </div>

          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            {/* Pemilih agenda yang tampil di layar publik. Ini yang memindahkan
                seluruh LED dari sesi pagi ke sesi malam tanpa menyentuh
                perangkatnya, yang saat acara berjalan bisa sulit dijangkau.

                Hanya agenda terpublikasi yang bisa dipilih: agenda draf yang
                disetel sebagai bawaan akan membuat layar diam-diam jatuh ke
                agenda lain, sehingga admin merasa pilihannya tidak tersimpan. */}
            <h2 className="text-base font-bold">Agenda yang tampil</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Menentukan agenda mana yang muncul di layar publik dan LED.</p>

            <label className="mt-3 block text-sm font-semibold" htmlFor="default-session">Agenda aktif</label>
            <select id="default-session" value={config.default_session_id ?? ""}
              onChange={(event) => updateConfig("default_session_id", event.target.value ? Number(event.target.value) : null)}
              className="mt-1 min-h-11 w-full border border-[var(--line)] bg-[var(--surface)] px-3 text-sm">
              <option value="">Agenda publik pertama (otomatis)</option>
              {sessions.filter((item) => item.is_published).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>

            {sessions.filter((item) => item.is_published).length === 0
              ? <p className="mt-1 text-xs text-[var(--warning)]">Belum ada agenda yang dipublikasikan. Publikasikan salah satu agenda di bawah lebih dulu.</p>
              : null}

            {config.default_session_id
              ? <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  Semua layar yang membuka <code>/denah</code> tanpa menyebut agenda akan menampilkan agenda ini.
                </p>
              : <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  Saat otomatis, layar mengikuti agenda publik yang urutannya paling awal.
                </p>}

            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Untuk menjalankan dua layar dengan agenda berbeda sekaligus, sebut agendanya di alamat masing-masing, misalnya <code>/denah?sesi={sessions[0]?.slug ?? "slug-agenda"}</code>. Alamat selalu menang atas setelan ini.
            </p>

            <h2 className="mt-6 border-t border-[var(--line)] pt-5 text-base font-bold">Mode tampilan publik</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Pilih sesuai jenis layar yang dipakai.</p>
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">Mode tampilan halaman publik</legend>
              {VIEW_MODES.map((mode) => <label key={mode.value}
                className={`flex cursor-pointer gap-3 border p-3 text-sm ${config.public_view_mode === mode.value ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)]"}`}>
                <input type="radio" name="public-view-mode" value={mode.value} checked={config.public_view_mode === mode.value}
                  onChange={() => updateConfig("public_view_mode", mode.value)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
                <span>
                  <span className="font-semibold">{mode.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{mode.detail}</span>
                </span>
              </label>)}
            </fieldset>
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Ini setelan bawaan semua layar. Satu layar bisa dipaksa ke mode tertentu lewat <code>/denah?mode=qr</code> atau <code>?mode=search</code>, berguna bila LED dan layar sentuh dipakai bersamaan.
            </p>

            <h2 className="mt-6 border-t border-[var(--line)] pt-5 text-base font-bold">Tata letak</h2>

            <label className="mt-4 block text-sm font-semibold" htmlFor="map-name">Nama denah</label>
            <input id="map-name" value={config.name} onChange={(event) => updateConfig("name", event.target.value)}
              className="mt-1 min-h-11 w-full border border-[var(--line)] px-3 text-sm" />

            <label className="mt-4 block text-sm font-semibold" htmlFor="stage-label">Label panggung</label>
            <input id="stage-label" value={config.stage_label} onChange={(event) => updateConfig("stage_label", event.target.value)}
              className="mt-1 min-h-11 w-full border border-[var(--line)] px-3 text-sm" />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Acuan arah tamu saat membaca denah.</p>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">Jumlah meja per baris</legend>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">Baris pertama paling dekat panggung. Nomor meja berjalan menerus.</p>
              <div className="mt-2 space-y-2">
                {config.row_table_counts.map((count, index) => <div key={index} className="flex items-center gap-2">
                  <span className="w-16 text-sm text-[var(--ink-muted)]">Baris {index + 1}</span>
                  <input type="number" min={1} max={40} value={count} aria-label={`Jumlah meja baris ${index + 1}`}
                    onChange={(event) => {
                      const next = [...config.row_table_counts];
                      next[index] = Math.max(1, Number(event.target.value) || 1);
                      updateConfig("row_table_counts", next);
                    }}
                    className="min-h-11 w-24 border border-[var(--line)] px-3 text-sm" />
                  <button type="button" onClick={() => updateConfig("row_table_counts", config.row_table_counts.filter((_, i) => i !== index))}
                    disabled={config.row_table_counts.length <= 1}
                    className="min-h-11 px-2 text-sm font-semibold text-[var(--danger)] disabled:opacity-40">Hapus</button>
                </div>)}
              </div>
              <button type="button" onClick={() => updateConfig("row_table_counts", [...config.row_table_counts, 8])}
                className="mt-2 min-h-11 border border-[var(--line)] px-3 text-sm font-semibold">Tambah baris</button>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">Total {totalTablesFromRows} meja.</p>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">Kursi per meja</legend>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">Diatur per rentang nomor meja. Aturan paling bawah menang bila bertumpuk.</p>
              <div className="mt-2 space-y-2">
                {config.seat_rules.map((rule, index) => <div key={index} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-[var(--ink-muted)]">Meja</span>
                  {(["from", "to"] as const).map((field) => <input key={field} type="number" min={1} max={999} value={rule[field]}
                    aria-label={field === "from" ? `Nomor meja awal aturan ${index + 1}` : `Nomor meja akhir aturan ${index + 1}`}
                    onChange={(event) => {
                      const next: SeatRule[] = [...config.seat_rules];
                      next[index] = { ...rule, [field]: Math.max(1, Number(event.target.value) || 1) };
                      updateConfig("seat_rules", next);
                    }}
                    className="min-h-11 w-20 border border-[var(--line)] px-2 text-sm" />)}
                  <span className="text-sm text-[var(--ink-muted)]">=</span>
                  <input type="number" min={0} max={26} value={rule.seats} aria-label={`Jumlah kursi aturan ${index + 1}`}
                    onChange={(event) => {
                      const next: SeatRule[] = [...config.seat_rules];
                      next[index] = { ...rule, seats: Math.max(0, Number(event.target.value) || 0) };
                      updateConfig("seat_rules", next);
                    }}
                    className="min-h-11 w-20 border border-[var(--line)] px-2 text-sm" />
                  <span className="text-sm text-[var(--ink-muted)]">kursi</span>
                  <button type="button" onClick={() => updateConfig("seat_rules", config.seat_rules.filter((_, i) => i !== index))}
                    className="min-h-11 px-2 text-sm font-semibold text-[var(--danger)]">Hapus</button>
                </div>)}
              </div>
              <button type="button" onClick={() => updateConfig("seat_rules", [...config.seat_rules, { from: 1, to: 1, seats: 6 }])}
                className="mt-2 min-h-11 border border-[var(--line)] px-3 text-sm font-semibold">Tambah aturan</button>
            </fieldset>

            <label className="mt-5 block text-sm font-semibold" htmlFor="label-pattern">Pola label kursi</label>
            <input id="label-pattern" value={config.seat_label_pattern} onChange={(event) => updateConfig("seat_label_pattern", event.target.value)}
              className="mt-1 min-h-11 w-full border border-[var(--line)] px-3 font-mono text-sm" />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Wajib memuat <code>{"{table}"}</code> dan <code>{"{seat}"}</code>. Harus sama dengan penulisan label di scanner API, kalau tidak kursi tidak akan cocok.
            </p>

            <button type="button" onClick={() => void saveConfig()} disabled={savingConfig}
              className="mt-5 min-h-12 w-full bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingConfig ? "Menyimpan…" : "Simpan tata letak"}
            </button>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-bold">Agenda</h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
                Jumlah agenda tidak dibatasi. Tata letak dipakai bersama semua agenda; yang berbeda hanya tampilan dan penempatan pesertanya.
              </p>
            </div>
            <p className="text-sm text-[var(--ink-muted)]">{sessions.length} agenda</p>
          </div>

          {/* Form tambah. Hanya meminta nama: sisanya bisa diisi setelah kartunya
              muncul, sehingga menambah agenda tidak terasa seperti mengisi borang. */}
          <div className="mt-4 border border-[var(--line)] bg-[var(--surface)] p-5">
            <label className="block text-sm font-semibold" htmlFor="new-agenda">Tambah agenda</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input id="new-agenda" value={newAgendaName} maxLength={120}
                onChange={(event) => setNewAgendaName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && newAgendaName.trim() && !creating) { event.preventDefault(); void createAgenda(); } }}
                placeholder="Misalnya: Coffee Break Siang"
                className="min-h-11 flex-1 border border-[var(--line)] px-3 text-sm sm:min-w-72" />
              <button type="button" onClick={() => void createAgenda()} disabled={creating || !newAgendaName.trim()}
                className="inline-flex min-h-11 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50">
                <Plus size={18} /> {creating ? "Menambahkan…" : "Tambah"}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--ink-muted)]">Agenda baru selalu dibuat sebagai draf, jadi tidak langsung tampil ke tamu.</p>
          </div>

          {sessions.length === 0
            ? <p className="mt-4 border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-6 text-center text-sm text-[var(--ink-muted)]">
                Belum ada agenda. Tambahkan satu di atas untuk mulai memakai halaman denah.
              </p>
            : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {sessions.map((session) => {
              const report = payload?.reports.find((item) => item.session_id === session.id);
              // Pilihan tersimpan yang sudah tidak ada lagi di data scanner API.
              // Dampaknya sama dengan belum memilih sama sekali (semua kursi kosong),
              // tapi dropdown tampak terisi sehingga mudah disalahartikan sebagai beres.
              // `payload !== null` menahan flag ini selama data belum termuat, supaya
              // peringatan tidak berkedip saat halaman pertama kali dibuka.
              const orphanSubEvent = session.sub_event_id !== null && payload !== null
                && !payload.available_sub_events.some((item) => item.subEventId === session.sub_event_id);
              return <article key={session.id} className="border border-[var(--line)] bg-[var(--surface)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{session.name}</h3>
                  <span className={`inline-flex items-center gap-1 border px-2 py-1 text-xs font-semibold ${session.is_published ? "border-[var(--success)] text-[var(--success)]" : "border-[var(--line)] text-[var(--ink-muted)]"}`}>
                    {session.is_published ? <><Eye size={14} /> Publik</> : <><EyeSlash size={14} /> Draf</>}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">URL publik: /denah?sesi={session.slug}</p>

                <label className="mt-4 block text-sm font-semibold" htmlFor={`name-${session.id}`}>Nama agenda</label>
                <input id={`name-${session.id}`} value={session.name} maxLength={120} onChange={(event) => updateSession(session.id, { name: event.target.value })}
                  className="mt-1 min-h-11 w-full border border-[var(--line)] px-3 text-sm" />
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Dipakai di tombol pemilih agenda, bukan di judul besar.</p>

                <label className="mt-3 block text-sm font-semibold" htmlFor={`title-${session.id}`}>Judul di halaman publik</label>
                <input id={`title-${session.id}`} value={session.title} onChange={(event) => updateSession(session.id, { title: event.target.value })}
                  className="mt-1 min-h-11 w-full border border-[var(--line)] px-3 text-sm" />

                <label className="mt-3 block text-sm font-semibold" htmlFor={`subtitle-${session.id}`}>Sub judul</label>
                <input id={`subtitle-${session.id}`} value={session.subtitle ?? ""} onChange={(event) => updateSession(session.id, { subtitle: event.target.value })}
                  className="mt-1 min-h-11 w-full border border-[var(--line)] px-3 text-sm" />

                <label className="mt-3 block text-sm font-semibold" htmlFor={`subevent-${session.id}`}>Sumber penempatan (sub-event scanner API)</label>
                <select id={`subevent-${session.id}`} value={session.sub_event_id ?? ""} onChange={(event) => updateSession(session.id, { sub_event_id: event.target.value || null })}
                  className="mt-1 min-h-11 w-full border border-[var(--line)] bg-[var(--surface)] px-3 text-sm">
                  <option value="">— Belum dipilih —</option>
                  {payload?.available_sub_events.map((item) => <option key={item.subEventId} value={item.subEventId}>{item.subEventName} ({item.seatCount} kursi)</option>)}
                  {/* Pilihan tersimpan yang sudah tidak ada di data tetap ditampilkan,
                      supaya tidak berubah diam-diam menjadi "belum dipilih". */}
                  {orphanSubEvent && session.sub_event_id
                    ? <option value={session.sub_event_id}>{session.sub_event_id} (tidak ada di data terbaru)</option>
                    : null}
                </select>
                {payload?.available_sub_events.length === 0
                  ? <p className="mt-1 text-xs text-[var(--warning)]">Scanner API belum mengirim data kursi. Pilihan akan muncul setelah panitia mengisinya.</p>
                  : null}
                {/* Perangkap yang paling mudah terjadi: sesi sudah dipublikasikan
                    tapi penempatannya tidak dapat dipetakan. Denahnya tampil rapi dan
                    seolah benar, padahal semua kursi kosong, sehingga terlihat
                    seperti data peserta yang tidak terbaca. Dua penyebabnya dibedakan
                    karena tindakan pemulihannya berbeda: yang satu perlu dipilih di
                    sini, yang satu perlu diisi panitia di sisi scanner API. */}
                {session.is_published && (!session.sub_event_id || orphanSubEvent)
                  ? <p className="mt-2 flex gap-2 border border-[var(--warning)] bg-[#FDF6E7] p-2 text-xs text-[var(--warning)]">
                      <Warning size={16} className="mt-0.5 shrink-0" />
                      <span>{session.sub_event_id
                        ? <>Sesi ini sudah publik tapi <strong>sumber penempatannya tidak ada lagi di data scanner API</strong>, jadi semua kursi tampak kosong. Pilihan tetap disimpan. Kursi akan muncul kembali setelah panitia mengisi data kursi untuk sub-event ini di sisi klien.</>
                        : <>Sesi ini sudah publik tapi <strong>sumber penempatan belum dipilih</strong>, jadi semua kursi tampak kosong. Pilih sub-event di atas lalu simpan.</>}</span>
                    </p>
                  : null}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([["background_color", "Latar"], ["text_color", "Teks"], ["accent_color", "Aksen"]] as const).map(([key, label]) => <div key={key}>
                    <label className="block text-xs font-semibold" htmlFor={`${key}-${session.id}`}>{label}</label>
                    <input id={`${key}-${session.id}`} type="color" value={session[key]} onChange={(event) => updateSession(session.id, { [key]: event.target.value })}
                      className="mt-1 h-11 w-full border border-[var(--line)]" />
                  </div>)}
                </div>

                {/* Gambar latar bersifat opsional dan berdiri di atas warna, bukan
                    menggantikannya. Warna latar tetap dipakai di belakang gambar
                    supaya teks tidak hilang bila gambar gagal dimuat di LED.
                    Keterangan itu ditulis di layar, bukan hanya di komentar kode,
                    karena admin tidak dapat menebaknya dari tampilan form. */}
                <div className="mt-4">
                  <p className="text-sm font-semibold">Gambar latar <span className="font-normal text-[var(--ink-muted)]">(opsional)</span></p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
                    Kosongkan untuk memakai warna latar saja. Gambar diberi lapisan gelap otomatis agar nomor meja dan QR tetap terbaca. PNG, JPG, atau WebP, maksimal 5 MB.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 border border-[var(--line)] bg-[var(--background)] px-3 text-sm font-semibold hover:border-[var(--brand)] ${uploadingBackground === session.id ? "pointer-events-none opacity-60" : ""}`}>
                      <UploadSimple size={17} weight="bold" />
                      {uploadingBackground === session.id ? "Mengunggah…" : "Upload gambar"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                        disabled={uploadingBackground === session.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadSessionBackground(session, file);
                          // Direset supaya memilih berkas yang sama dua kali tetap
                          // memicu onChange.
                          event.target.value = "";
                        }} />
                    </label>
                    {session.background_image_url
                      ? <button type="button" onClick={() => updateSession(session.id, { background_image_url: null })}
                          className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--danger)] hover:border-[var(--danger)]">
                          <XCircle size={17} weight="bold" /> Hapus gambar
                        </button>
                      : null}
                  </div>
                  {session.background_image_url
                    ? <div className="mt-2 flex items-center gap-2">
                        <span className="h-12 w-20 shrink-0 border border-[var(--line)] bg-cover bg-center" style={{ backgroundImage: `url(${session.background_image_url})` }} />
                        <span className="break-all text-[11px] leading-4 text-[var(--ink-muted)]">{session.background_image_url}</span>
                      </div>
                    : null}
                </div>

                <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
                  <input type="checkbox" checked={session.is_published} onChange={(event) => updateSession(session.id, { is_published: event.target.checked })}
                    className="size-4 accent-[var(--brand)]" />
                  Tampilkan di halaman publik
                </label>

                {report ? <div className="mt-4 border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm">
                  <p className="font-semibold">Pencocokan data</p>
                  <ul className="mt-1 space-y-1 text-[var(--ink-muted)]">
                    <li>{report.matched_seats} kursi terisi, {report.empty_seats} kosong.</li>
                    <li>{report.participants_without_seat} dari {report.total_active_participants} peserta aktif belum punya kursi di sesi ini.</li>
                  </ul>
                  {report.unmatched_count > 0
                    ? <p className="mt-2 flex gap-2 border border-[var(--danger)] bg-[#fdf1f0] p-2 text-xs text-[var(--danger)]">
                        <Warning size={16} className="mt-0.5 shrink-0" />
                        <span>
                          <strong>{report.unmatched_count} label tidak ada di denah</strong>, jadi peserta tersebut tidak muncul di mana pun.
                          Contoh: <code>{report.unmatched_labels.slice(0, 6).join(", ")}</code>. Sesuaikan pola label kursi di atas.
                        </span>
                      </p>
                    : report.total_assignments > 0
                      ? <p className="mt-2 flex items-center gap-2 text-xs text-[var(--success)]"><CheckCircle size={16} /> Semua label cocok dengan denah.</p>
                      : null}
                </div> : null}

                <button type="button" onClick={() => void saveSession(session)} disabled={savingSession === session.id}
                  className="mt-4 min-h-12 w-full bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-60">
                  {savingSession === session.id ? "Menyimpan…" : "Simpan agenda"}
                </button>

                {/* Hapus dipisah di bawah garis dan butuh satu langkah konfirmasi.
                    Agenda yang dipublikasikan disebut khusus karena menghapusnya
                    langsung mengubah apa yang dilihat tamu saat itu. */}
                <div className="mt-4 border-t border-[var(--line)] pt-4">
                  {confirmDelete === session.id
                    ? <div className="border border-[var(--danger)] bg-[#fdf1f0] p-3">
                        <p className="text-xs text-[var(--danger)]">
                          Hapus <strong>{session.name}</strong>?{session.is_published ? " Agenda ini sedang tampil ke tamu." : ""} Tampilan dan pilihan sumbernya hilang; data peserta tidak terpengaruh karena penempatan tersimpan di scanner API.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => void deleteAgenda(session)} disabled={deleting === session.id}
                            className="min-h-11 flex-1 bg-[var(--danger)] px-3 text-sm font-semibold text-white disabled:opacity-60">
                            {deleting === session.id ? "Menghapus…" : "Ya, hapus"}
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)}
                            className="min-h-11 flex-1 border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold">
                            Batal
                          </button>
                        </div>
                      </div>
                    : <button type="button" onClick={() => setConfirmDelete(session.id)}
                        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--danger)]">
                        <Trash size={16} /> Hapus agenda
                      </button>}
                </div>
              </article>;
            })}
          </div>
        </section>
      </>}
    </div>
  </main>;
}
