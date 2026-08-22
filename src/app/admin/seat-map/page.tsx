"use client";

import { ArrowSquareOut, CheckCircle, Eye, EyeSlash, Monitor, Plus, Trash, UploadSimple, Warning, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useMemo, useState } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { SeatMapView } from "@/components/seat-map-view";
import { useToast } from "@/components/toast";
import { normalizeBranding, type Branding } from "@/lib/branding";
import { computeSeatMapGeometry, duplicateTableLabels, MAX_TABLE_LABEL_LENGTH, normalizeSeatLabel, resolveSeatColors, tableLabelFor, type PublicViewMode, type SeatColors, type SeatMapConfig, type SeatMapLayout, type SeatMapLayoutParams, type SeatRule, LAYOUT_INFO, layoutDefaults, SEAT_MAP_LAYOUTS } from "@/lib/seat-map";

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
  /** True berarti kanvas denah tembus pandang di atas gambar latar. */
  map_panel_transparent: boolean;
  is_published: boolean;
  sort_order: number;
} & Branding & SeatColors;

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

  /** Mengubah satu parameter tata ruang tanpa menyentuh yang lain. */
  function updateParam<K extends keyof SeatMapLayoutParams>(key: K, value: SeatMapLayoutParams[K]) {
    setConfig((current) => current && { ...current, layout_params: { ...current.layout_params, [key]: value } });
  }

  function updateSession(id: number, changes: Partial<Session>) {
    setSessions((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  /**
   * Unggah gambar latar agenda.
   *
   * Memakai endpoint yang sama dengan Papan peringkat (`/api/display/background`).
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
        table_labels: config.table_labels,
        layout_type: config.layout_type,
        layout_params: config.layout_params,
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
        map_panel_transparent: session.map_panel_transparent,
        is_published: session.is_published,
        sort_order: session.sort_order,
        // Warna kursi. Dikirim satu per satu, bukan lewat spread, supaya null
        // benar-benar terkirim: itulah cara admin mengembalikan satu warna ke
        // bawaan, dan field yang hilang berarti "tidak diubah", bukan "kosongkan".
        seat_available_color: session.seat_available_color,
        seat_occupied_color: session.seat_occupied_color,
        seat_checked_in_color: session.seat_checked_in_color,
        seat_outline_color: session.seat_outline_color,
        // Branding header dan footer. Dikirim lewat `normalizeBranding` supaya
        // hanya kolom yang memang milik branding yang ikut, dan skalanya sudah
        // berupa angka. Menyalin field satu per satu di sini berarti setiap
        // penambahan kolom kelak harus diingat di dua tempat.
        ...normalizeBranding(session as unknown as Record<string, unknown>),
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

  // Label meja yang bentrok. Dihitung dari konfigurasi yang sedang diedit, bukan
  // dari yang tersimpan, supaya admin melihatnya sebelum menekan Simpan. Server
  // tetap menolaknya juga: peringatan di layar dapat dilewati, penolakan tidak.
  const labelConflicts = config ? duplicateTableLabels(config) : [];

  // Meja yang sudah diberi label menyimpang. Hanya ini yang ditampilkan sebagai
  // baris, bukan seluruh 32 meja: daftar 32 kolom isian membuat admin harus
  // menggulir jauh untuk mengubah satu meja, dan kolom kosong berjejer 31 baris
  // terbaca seperti pekerjaan yang belum selesai padahal justru itu keadaan yang
  // benar.
  const labeledTables = Object.keys(config?.table_labels ?? {})
    .map(Number)
    .filter((position) => Number.isFinite(position) && position >= 1 && position <= totalTablesFromRows)
    .sort((a, b) => a - b);

  /** Menyetel label satu meja. String kosong berarti kembali ke nomor posisinya. */
  function setTableLabel(position: number, label: string) {
    if (!config) return;
    const next = { ...config.table_labels };
    if (label.trim()) next[String(position)] = label;
    else delete next[String(position)];
    updateConfig("table_labels", next);
  }

  // Keterisian CONTOH untuk pratinjau.
  //
  // Tanpa ini seluruh kursi di pratinjau tampak kosong, sehingga admin memilih
  // warna "kursi terisi" dan "sudah check-in" tanpa pernah melihat hasilnya —
  // pertama kali warna itu terlihat adalah di layar tamu. Datanya dibuat, bukan
  // diambil dari peserta sungguhan: CMS tidak perlu memuat 194 penempatan hanya
  // untuk menunjukkan sebuah warna, dan pratinjau harus tetap bermakna pada
  // agenda yang penempatannya memang belum ada.
  //
  // Meja 1 terisi + sudah check-in, meja 2 terisi tanpa check-in, sisanya kosong.
  // Ketiga keadaan tampil berdampingan sehingga bisa dibandingkan sekaligus.
  const previewSeatStates = useMemo(() => {
    if (!config) return {};
    const states: Record<string, { occupied: boolean; checkedIn: boolean }> = {};
    for (const table of computeSeatMapGeometry(config).tables.slice(0, 2)) {
      for (const seat of table.seats) {
        states[normalizeSeatLabel(seat.label)] = { occupied: true, checkedIn: table.number === 1 };
      }
    }
    return states;
  }, [config]);

  return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="max-w-2xl text-body-medium text-on-surface-variant">
            Tata letak ruangan diatur di sini. Penempatan peserta datang dari scanner API dan tidak diubah dari halaman ini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/denah" target="_blank" rel="noreferrer" className="rounded-md inline-flex min-h-11 items-center gap-2 border border-outline-variant px-4 text-body-medium font-semibold">
            <ArrowSquareOut size={18} /> Halaman publik
          </Link>
          {/* Tautan langsung ke mode LED. Panitia yang memasang layar cukup
              menyalin alamat ini, tanpa perlu mengubah setelan bawaan. */}
          <Link href="/denah?mode=qr" target="_blank" rel="noreferrer" className="rounded-md inline-flex min-h-11 items-center gap-2 border border-outline-variant px-4 text-body-medium font-semibold">
            <Monitor size={18} /> Pratinjau LED
          </Link>
        </div>
      </header>

      {error ? <p className="rounded-lg mt-4 border border-error bg-error-soft p-3 text-body-medium text-error">{error}</p> : null}

      {!config ? <p className="mt-8 text-body-medium text-on-surface-variant">Memuat…</p> : <>
        {/* Pratinjau selebar halaman, kartu setelan di bawahnya.
            Sebelumnya pratinjau berbagi baris dengan kolom setelan selebar 420px,
            sehingga denah 32 meja harus digulir mendatar DI DALAM kartunya
            sendiri — dan menggulir mendatar di dalam halaman yang juga digulir
            menegak membuat orang kehilangan tempatnya. Denah adalah gambar yang
            dinilai secara keseluruhan; memotongnya menghapus satu-satunya hal
            yang membuat pratinjau berguna. */}
        <section className="mt-6">
          <div className="rounded-lg border border-outline-variant bg-panel p-5">
            <h2 className="text-body-large font-bold">Pratinjau</h2>
            <p className="mt-1 text-body-medium text-on-surface-variant">
              Persis seperti yang dilihat tamu. {payload?.geometry.total_tables ?? 0} meja, {payload?.geometry.total_seats ?? 0} kursi.
            </p>
            {sessions.length > 1 ? <div className="mt-3 flex flex-wrap gap-2">
              {sessions.map((item) => <button key={item.id} type="button" onClick={() => setPreviewSlug(item.slug)} aria-pressed={item.slug === previewSession?.slug}
                className={`rounded-md min-h-11 border px-3 text-body-medium font-semibold ${item.slug === previewSession?.slug ? "border-primary bg-primary-soft" : "border-outline-variant"}`}>{item.name}</button>)}
            </div> : null}
            {/* Gambar latar dipasang di pembungkus, bukan diteruskan ke SeatMapView.
                Komponen itu dipakai bersama halaman publik dan hanya mengenal warna;
                menambah properti gambar ke sana berarti mengubah kontraknya hanya
                untuk kebutuhan pratinjau.

                Transparansi kanvas diatur lewat `canvasColor`, BUKAN dengan
                mengoper "transparent" sebagai `backgroundColor`. Warna itu juga
                dipakai sebagai warna teks nomor meja dan label panggung, jadi
                "transparent" membuat nomor mejanya ikut hilang. */}
            <div
              className="mt-4 overflow-x-auto rounded-lg bg-cover bg-center bg-no-repeat"
              style={{
                backgroundColor: previewSession?.background_color ?? "#111a63",
                backgroundImage: previewSession?.background_image_url
                  ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${previewSession.background_image_url})`
                  : undefined,
              }}
            >
              <SeatMapView
                config={config}
                seatStates={previewSeatStates}
                showAttendance
                backgroundColor={previewSession?.background_color ?? "#111a63"}
                canvasColor={previewSession?.map_panel_transparent && previewSession.background_image_url ? "transparent" : undefined}
                textColor={previewSession?.text_color ?? "#ffffff"}
                accentColor={previewSession?.accent_color ?? "#f2c14e"}
                seatColors={previewSession}
                // Tinggi pratinjau DIBATASI, lebarnya yang mengikuti kanvas.
                //
                // Kanvas tiap tata ruang punya rasio sendiri: banquet lebar dan
                // pendek, U-shape sempit dan menjulang. Tanpa batas tinggi, denah
                // sempit yang dilebarkan ke lebar penuh halaman ikut memanjang ke
                // bawah sampai layar penuh — pratinjau yang harus digulir berhenti
                // menjadi pratinjau, karena tidak bisa dinilai sekali lihat.
                //
                // SVG ber-viewBox menyusut sendiri saat tingginya dibatasi
                // (preserveAspectRatio bawaan), jadi yang terjadi bukan pemotongan
                // melainkan penskalaan — seluruh denah tetap terlihat utuh.
                maxHeight="clamp(320px, 58vh, 620px)"
                className="min-w-[560px]"
              />
            </div>
          </div>

        </section>

        {/* Kolom CSS, bukan grid.
            Grid memaksa setiap baris setinggi kartu tertingginya, sehingga kartu
            pendek meninggalkan bidang kosong di sebelahnya — persis lubang yang
            terlihat di kanan bawah sebelum ini. Kolom mengisi ke bawah lalu
            pindah kolom, jadi kartu setinggi apa pun tersusun rapat.

            `break-inside-avoid` di tiap kartu wajib: tanpa itu satu kartu bisa
            terpotong di tengah dan separuhnya pindah ke kolom berikutnya. */}
        <section className="mt-5 gap-5 lg:columns-2 xl:columns-3 [&>*]:mb-5">
          {/* Tata ruang berdiri sebagai kartu SENDIRI, paling atas di kolom
              setelan. Ia keputusan yang menentukan arti seluruh setelan lain di
              bawahnya — jumlah meja per baris hanya berlaku untuk denah bermeja
              bundar, jumlah baris hanya berlaku untuk theater — dan sebelumnya ia
              terkubur di bawah dua bagian lain sehingga tidak terlihat sama
              sekali tanpa menggulir. */}
          <div className="break-inside-avoid rounded-lg border border-outline-variant bg-panel p-5">
            <h2 className="text-body-large font-bold">Tata letak ruangan</h2>

            {/* Pemilih tata ruang berdiri PALING ATAS di kartu ini karena ia
                menentukan setelan mana yang berlaku di bawahnya: jumlah meja per
                baris hanya berarti untuk denah bermeja bundar, sedangkan jumlah
                baris dan kursi per baris hanya berarti untuk theater. */}
            <label className="mt-4 block text-body-medium font-semibold" htmlFor="layout-type">Jenis tata ruang</label>
            <select
              id="layout-type"
              value={config.layout_type}
              onChange={(event) => {
                const layout = event.target.value as SeatMapLayout;
                // Parameter DIKEMBALIKAN ke bawaan layout yang dipilih, bukan
                // dipertahankan dari layout sebelumnya.
                //
                // Sebelumnya nilai lama menimpa bawaan, dan akibatnya terukur:
                // berpindah dari Banquet ke Cabaret tidak mengubah apa pun di
                // pratinjau, karena busur 300 derajat milik Banquet ikut terbawa
                // dan menimpa bawaan Cabaret yang 190. Pilihan yang tidak
                // mengubah apa pun terbaca sebagai fitur yang rusak.
                setConfig((current) => current && {
                  ...current,
                  layout_type: layout,
                  layout_params: layoutDefaults(layout),
                });
              }}
              className="rounded-md mt-1 min-h-11 w-full border border-outline-variant bg-surface px-3 text-body-medium"
            >
              {SEAT_MAP_LAYOUTS.map((layout) => (
                <option key={layout} value={layout}>{LAYOUT_INFO[layout].name}</option>
              ))}
            </select>
            <p className="mt-2 text-body-small leading-5 text-on-surface-variant">
              {LAYOUT_INFO[config.layout_type].desc} {LAYOUT_INFO[config.layout_type].labelHint}.
            </p>
            <p className="mt-2 text-body-small leading-5 text-warning">
              Tata ruang tidak dapat diganti setelah ada peserta yang punya nomor kursi: bentuk label
              kursinya ikut berubah, dan seluruh penempatan yang sudah masuk akan gugur.
            </p>

            {/* Setelan yang hanya berlaku untuk sebagian layout DISEMBUNYIKAN,
                bukan dinonaktifkan: kolom mati yang tetap terlihat membuat admin
                mengira ada yang rusak. */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {config.layout_type === "banquet_round" || config.layout_type === "cabaret" || config.layout_type === "head_table" ? (
                <label className="block text-body-medium font-semibold">
                  Busur kursi (derajat)
                  <input type="number" min={60} max={340} value={config.layout_params.arc_sweep}
                    onChange={(event) => updateParam("arc_sweep", Number(event.target.value))}
                    className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium font-normal" />
                  <span className="mt-1 block text-body-small font-normal text-on-surface-variant">
                    300 = kursi hampir mengelilingi meja. 190 = cabaret, tidak ada yang membelakangi panggung.
                  </span>
                </label>
              ) : null}

              {config.layout_type === "theater" || config.layout_type === "classroom" ? (
                <>
                  <label className="block text-body-medium font-semibold">
                    Jumlah baris
                    <input type="number" min={1} max={40} value={config.layout_params.rows}
                      onChange={(event) => updateParam("rows", Number(event.target.value))}
                      className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium font-normal" />
                  </label>
                  <label className="block text-body-medium font-semibold">
                    {config.layout_type === "theater" ? "Kursi per baris" : "Meja per baris"}
                    <input type="number" min={1} max={40} value={config.layout_params.per_row}
                      onChange={(event) => updateParam("per_row", Number(event.target.value))}
                      className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium font-normal" />
                  </label>
                </>
              ) : null}

              {config.layout_type === "classroom" ? (
                <label className="block text-body-medium font-semibold">
                  Kursi per meja
                  <input type="number" min={1} max={12} value={config.layout_params.seats_per_table}
                    onChange={(event) => updateParam("seats_per_table", Number(event.target.value))}
                    className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium font-normal" />
                </label>
              ) : null}

              {config.layout_type === "theater" ? (
                <label className="block text-body-medium font-semibold">
                  Lorong setelah kursi ke-
                  <input
                    value={config.layout_params.aisles.join(", ")}
                    onChange={(event) => updateParam(
                      "aisles",
                      event.target.value.split(",").map((bagian) => Number(bagian.trim())).filter((angka) => Number.isFinite(angka) && angka > 0),
                    )}
                    placeholder="mis. 5, 10"
                    className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium font-normal" />
                  <span className="mt-1 block text-body-small font-normal text-on-surface-variant">
                    Pisahkan dengan koma. Kosongkan bila tanpa lorong.
                  </span>
                </label>
              ) : null}

              {config.layout_type === "u_shape" || config.layout_type === "hollow_square" || config.layout_type === "boardroom" ? (
                <>
                  <label className="block text-body-medium font-semibold">
                    Kursi per sisi panjang
                    <input type="number" min={1} max={40} value={config.layout_params.seats_per_side}
                      onChange={(event) => updateParam("seats_per_side", Number(event.target.value))}
                      className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium font-normal" />
                  </label>
                  <label className="block text-body-medium font-semibold">
                    {config.layout_type === "boardroom" ? "Kursi di ujung meja" : "Kursi di sisi kepala"}
                    <input type="number" min={0} max={20} value={config.layout_params.seats_head}
                      onChange={(event) => updateParam("seats_head", Number(event.target.value))}
                      className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium font-normal" />
                  </label>
                </>
              ) : null}

              {config.layout_type === "head_table" ? (
                <label className="block text-body-medium font-semibold">
                  Kursi meja utama
                  <input type="number" min={1} max={26} value={config.layout_params.head_seats}
                    onChange={(event) => updateParam("head_seats", Number(event.target.value))}
                    className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium font-normal" />
                </label>
              ) : null}
            </div>
          </div>

          <div className="break-inside-avoid rounded-lg border border-outline-variant bg-panel p-5">
            {/* Pemilih agenda yang tampil di layar publik. Ini yang memindahkan
                seluruh LED dari sesi pagi ke sesi malam tanpa menyentuh
                perangkatnya, yang saat acara berjalan bisa sulit dijangkau.

                Hanya agenda terpublikasi yang bisa dipilih: agenda draf yang
                disetel sebagai bawaan akan membuat layar diam-diam jatuh ke
                agenda lain, sehingga admin merasa pilihannya tidak tersimpan. */}
            <h2 className="text-body-large font-bold">Agenda yang tampil</h2>
            <p className="mt-1 text-body-medium text-on-surface-variant">Menentukan agenda mana yang muncul di layar publik dan LED.</p>

            <label className="mt-3 block text-body-medium font-semibold" htmlFor="default-session">Agenda aktif</label>
            <select id="default-session" value={config.default_session_id ?? ""}
              onChange={(event) => updateConfig("default_session_id", event.target.value ? Number(event.target.value) : null)}
              className="rounded-lg mt-1 min-h-11 w-full border border-outline-variant bg-panel px-3 text-body-medium">
              <option value="">Agenda publik pertama (otomatis)</option>
              {sessions.filter((item) => item.is_published).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>

            {sessions.filter((item) => item.is_published).length === 0
              ? <p className="mt-1 text-body-small text-warning">Belum ada agenda yang dipublikasikan. Publikasikan salah satu agenda di bawah lebih dulu.</p>
              : null}

            {config.default_session_id
              ? <p className="mt-2 text-body-small text-on-surface-variant">
                  Semua layar yang membuka <code>/denah</code> tanpa menyebut agenda akan menampilkan agenda ini.
                </p>
              : <p className="mt-2 text-body-small text-on-surface-variant">
                  Saat otomatis, layar mengikuti agenda publik yang urutannya paling awal.
                </p>}

            <p className="mt-2 text-body-small text-on-surface-variant">
              Untuk menjalankan dua layar dengan agenda berbeda sekaligus, sebut agendanya di alamat masing-masing, misalnya <code>/denah?sesi={sessions[0]?.slug ?? "slug-agenda"}</code>. Alamat selalu menang atas setelan ini.
            </p>

          </div>

          <div className="break-inside-avoid rounded-lg border border-outline-variant bg-panel p-5">
            <h2 className="text-body-large font-bold">Mode tampilan publik</h2>
            <p className="mt-1 text-body-medium text-on-surface-variant">Pilih sesuai jenis layar yang dipakai.</p>
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">Mode tampilan halaman publik</legend>
              {VIEW_MODES.map((mode) => <label key={mode.value}
                className={`rounded-lg flex cursor-pointer gap-3 border p-3 text-body-medium ${config.public_view_mode === mode.value ? "border-primary bg-primary-soft" : "border-outline-variant"}`}>
                <input type="radio" name="public-view-mode" value={mode.value} checked={config.public_view_mode === mode.value}
                  onChange={() => updateConfig("public_view_mode", mode.value)} className="mt-0.5 size-4 shrink-0 accent-primary" />
                <span>
                  <span className="font-semibold">{mode.label}</span>
                  <span className="mt-0.5 block text-body-small text-on-surface-variant">{mode.detail}</span>
                </span>
              </label>)}
            </fieldset>
            <p className="mt-2 text-body-small text-on-surface-variant">
              Ini setelan bawaan semua layar. Satu layar bisa dipaksa ke mode tertentu lewat <code>/denah?mode=qr</code> atau <code>?mode=search</code>, berguna bila LED dan layar sentuh dipakai bersamaan.
            </p>

          </div>

          <div className="break-inside-avoid rounded-lg border border-outline-variant bg-panel p-5">
            <h2 className="text-body-large font-bold">Ukuran ruangan</h2>

            <label className="mt-4 block text-body-medium font-semibold" htmlFor="map-name">Nama denah</label>
            <input id="map-name" value={config.name} onChange={(event) => updateConfig("name", event.target.value)}
              className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium" />

            <label className="mt-4 block text-body-medium font-semibold" htmlFor="stage-label">Label panggung</label>
            <input id="stage-label" value={config.stage_label} onChange={(event) => updateConfig("stage_label", event.target.value)}
              className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium" />
            <p className="mt-1 text-body-small text-on-surface-variant">Acuan arah tamu saat membaca denah.</p>

            {/* Baris meja hanya berlaku untuk denah bermeja bundar. Pada theater,
                classroom, dan rapat, jumlah mejanya ditentukan parameter di atas. */}
            <fieldset className={`mt-5 ${["banquet_round", "cabaret", "head_table"].includes(config.layout_type) ? "" : "hidden"}`}>
              <legend className="text-body-medium font-semibold">Jumlah meja per baris</legend>
              <p className="mt-1 text-body-small text-on-surface-variant">Baris pertama paling dekat panggung. Nomor meja berjalan menerus.</p>
              <div className="mt-2 space-y-2">
                {config.row_table_counts.map((count, index) => <div key={index} className="flex items-center gap-2">
                  <span className="w-16 text-body-medium text-on-surface-variant">Baris {index + 1}</span>
                  <input type="number" min={1} max={40} value={count} aria-label={`Jumlah meja baris ${index + 1}`}
                    onChange={(event) => {
                      const next = [...config.row_table_counts];
                      next[index] = Math.max(1, Number(event.target.value) || 1);
                      updateConfig("row_table_counts", next);
                    }}
                    className="rounded-md min-h-11 w-24 border border-outline-variant px-3 text-body-medium" />
                  <button type="button" onClick={() => updateConfig("row_table_counts", config.row_table_counts.filter((_, i) => i !== index))}
                    disabled={config.row_table_counts.length <= 1}
                    className="min-h-11 px-2 text-body-medium font-semibold text-error disabled:opacity-40">Hapus</button>
                </div>)}
              </div>
              <button type="button" onClick={() => updateConfig("row_table_counts", [...config.row_table_counts, 8])}
                className="rounded-md mt-2 min-h-11 border border-outline-variant px-3 text-body-medium font-semibold">Tambah baris</button>
              <p className="mt-2 text-body-small text-on-surface-variant">Total {totalTablesFromRows} meja.</p>
            </fieldset>

            {/* Label meja yang menyimpang dari nomornya.
                Ditaruh tepat di bawah "Jumlah meja per baris" karena di situlah
                nomor meja terbentuk; menaruhnya di kartu lain akan membuat admin
                mencari-cari hubungan antara "meja ke-4" dan angka yang diubahnya. */}
            <fieldset className="mt-5">
              <legend className="text-body-medium font-semibold">Label meja khusus</legend>
              <p className="mt-1 text-body-small text-on-surface-variant">
                Untuk meja yang tulisannya berbeda dari nomor urutnya, misalnya meja ke-4 ditulis <strong>3A</strong> karena
                nomor 4 dihindari. Posisi meja TIDAK bergeser: meja ke-5 tetap bernomor 5.
              </p>

              {labeledTables.length > 0 ? <div className="mt-3 space-y-2">
                {/* Nama posisi di kiri, kolom isian dan Hapus didorong ke kanan.
                    Kalimat "Meja ke-4 ditulis" ditambah kolom dan tombol melewati
                    lebar kolom kartu, dan pada `flex-wrap` ia terbelah sehingga
                    kolom isiannya turun sendirian ke baris berikutnya. */}
                {labeledTables.map((position) => <div key={position} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 shrink text-body-medium text-on-surface-variant">Meja ke-{position}</span>
                  <input value={config.table_labels[String(position)] ?? ""} maxLength={MAX_TABLE_LABEL_LENGTH}
                    aria-label={`Label untuk meja ke-${position}`}
                    onChange={(event) => setTableLabel(position, event.target.value)}
                    className="rounded-md min-h-11 w-24 border border-outline-variant px-3 font-mono text-body-medium" />
                  <button type="button" onClick={() => setTableLabel(position, "")}
                    className="min-h-11 px-2 text-body-medium font-semibold text-error">Hapus</button>
                </div>)}
              </div> : <p className="mt-3 text-body-small text-on-surface-variant">Belum ada label khusus. Semua meja memakai nomor urutnya.</p>}

              {/* Pemilih posisi, bukan kolom nomor bebas: mengetik "40" pada denah
                  32 meja menyimpan label untuk meja yang tidak ada, dan admin akan
                  menunggu perubahan yang tidak pernah muncul di pratinjau. */}
              <div className="mt-3">
                <label className="block text-body-medium text-on-surface-variant" htmlFor="add-table-label">Tambah label untuk meja ke-</label>
                <select id="add-table-label" value="" onChange={(event) => {
                  const position = Number(event.target.value);
                  if (!position) return;
                  // Nilai awal = nomornya sendiri supaya kolomnya tidak pernah
                  // kosong; label kosong berarti meja tanpa tulisan di layar.
                  setTableLabel(position, String(position));
                }}
                  className="rounded-md mt-1 min-h-11 w-full border border-outline-variant bg-surface px-3 text-body-medium">
                  <option value="">Pilih meja</option>
                  {Array.from({ length: totalTablesFromRows }, (_, index) => index + 1)
                    .filter((position) => !(String(position) in config.table_labels))
                    .map((position) => <option key={position} value={position}>Meja ke-{position} (sekarang {tableLabelFor(position, config.table_labels)})</option>)}
                </select>
              </div>

              {labelConflicts.length > 0 ? <p className="rounded-lg mt-3 flex items-start gap-2 border border-error bg-error-soft p-3 text-body-small text-error">
                <Warning size={16} className="mt-0.5 shrink-0" />
                <span>Label <strong>{labelConflicts.join(", ")}</strong> dipakai lebih dari satu meja. Dua meja bernama sama membuat satu label kursi ada di dua tempat, sehingga tamu diarahkan ke meja yang salah. Denah tidak dapat disimpan sebelum ini dibetulkan.</span>
              </p> : null}

              <p className="mt-3 text-body-small text-on-surface-variant">
                Label ini ikut menyusun label kursi lewat pola di bawah, jadi meja <strong>3A</strong> memberi kursi <strong>A3A</strong>,
                <strong> B3A</strong>, dan seterusnya. Penulisannya harus sama dengan yang dipakai scanner API, kalau tidak peserta di meja
                itu tidak akan muncul di denah.
              </p>
            </fieldset>

            {/* Aturan kursi per rentang meja hanya dibaca oleh tata ruang bermeja
                bundar. Pada classroom, jumlah kursinya seragam per meja dan diatur
                di kartu Tata letak ruangan; pada theater dan rapat, kursinya bukan
                milik meja sama sekali.

                Disembunyikan, bukan dibiarkan tampil: sebelumnya ada DUA setelan
                bernama "Kursi per meja" di dua kartu berbeda saat classroom
                dipilih, dan yang satu tidak berpengaruh apa pun. Dua kolom dengan
                nama sama yang berbeda akibatnya adalah cara tercepat membuat admin
                berhenti memercayai layar ini. */}
            <fieldset className={`mt-5 ${["banquet_round", "cabaret", "head_table"].includes(config.layout_type) ? "" : "hidden"}`}>
              <legend className="text-body-medium font-semibold">Kursi per meja bundar</legend>
              <p className="mt-1 text-body-small text-on-surface-variant">Diatur per rentang nomor meja. Aturan paling bawah menang bila bertumpuk.</p>
              {/* Satu aturan = satu baris kisi berkolom tetap, bukan deretan
                  kontrol yang dibiarkan membungkus.

                  Sebelumnya baris ini `flex flex-wrap` berisi tujuh elemen:
                  "Meja", dua kotak angka, "=", satu kotak angka, "kursi", dan
                  tombol Hapus. Di kolom selebar 400px ia terbelah di tempat yang
                  berbeda-beda — "Meja [1] [25] =" di baris pertama, "[6] kursi
                  Hapus" di baris kedua — sehingga angka dan satuannya terpisah
                  dan tidak ada dua aturan yang sejajar.

                  Kisi tiga kolom membuat setiap kotak angka punya judulnya
                  sendiri di atasnya, dan kolomnya tetap sejajar antar aturan
                  berapa pun lebar kartunya. */}
              <div className="mt-3 space-y-3">
                {config.seat_rules.map((rule, index) => <div key={index} className="rounded-lg border border-outline-variant p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-small font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                      Aturan {index + 1}
                    </span>
                    <button type="button" onClick={() => updateConfig("seat_rules", config.seat_rules.filter((_, i) => i !== index))}
                      className="m3-state min-h-9 rounded-full px-3 text-body-small font-semibold text-error">Hapus</button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([
                      { field: "from" as const, label: "Meja dari", min: 1, max: 999 },
                      { field: "to" as const, label: "sampai", min: 1, max: 999 },
                      { field: "seats" as const, label: "kursi", min: 0, max: 26 },
                    ]).map(({ field, label, min, max }) => (
                      <label key={field} className="block text-body-small text-on-surface-variant">
                        {label}
                        <input type="number" min={min} max={max} value={rule[field]}
                          onChange={(event) => {
                            const angka = Math.max(min, Number(event.target.value) || min);
                            const next: SeatRule[] = [...config.seat_rules];
                            next[index] = { ...rule, [field]: angka };
                            updateConfig("seat_rules", next);
                          }}
                          className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-2 text-body-medium text-on-surface" />
                      </label>
                    ))}
                  </div>
                </div>)}
              </div>
              <button type="button" onClick={() => updateConfig("seat_rules", [...config.seat_rules, { from: 1, to: 1, seats: 6 }])}
                className="rounded-md mt-2 min-h-11 border border-outline-variant px-3 text-body-medium font-semibold">Tambah aturan</button>
            </fieldset>

            <label className="mt-5 block text-body-medium font-semibold" htmlFor="label-pattern">Pola label kursi</label>
            <input id="label-pattern" value={config.seat_label_pattern} onChange={(event) => updateConfig("seat_label_pattern", event.target.value)}
              className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 font-mono text-body-medium" />
            <p className="mt-1 text-body-small text-on-surface-variant">
              Wajib memuat <code>{"{table}"}</code> dan <code>{"{seat}"}</code>. Harus sama dengan penulisan label di scanner API, kalau tidak kursi tidak akan cocok.
            </p>

          </div>
        </section>

        {/* Simpan berdiri di luar kartu-kartu setelan, bukan di dalam salah
            satunya. Ia menyimpan SELURUH tata letak — jenis tata ruang, ukuran
            ruangan, mode tampilan, label meja — dan tombol yang duduk di dalam
            satu kartu terbaca seolah hanya menyimpan kartu itu. */}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => void saveConfig()} disabled={savingConfig || labelConflicts.length > 0}
            className="rounded-md min-h-12 w-full bg-primary px-6 text-body-medium font-semibold text-on-primary disabled:opacity-60 sm:w-auto">
            {savingConfig ? "Menyimpan…" : labelConflicts.length > 0 ? "Betulkan label ganda dulu" : "Simpan tata letak"}
          </button>
        </div>

        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-body-large font-bold">Agenda</h2>
              <p className="mt-1 max-w-2xl text-body-medium text-on-surface-variant">
                Jumlah agenda tidak dibatasi. Tata letak dipakai bersama semua agenda; yang berbeda hanya tampilan dan penempatan pesertanya.
              </p>
            </div>
            <p className="text-body-medium text-on-surface-variant">{sessions.length} agenda</p>
          </div>

          {/* Form tambah. Hanya meminta nama: sisanya bisa diisi setelah kartunya
              muncul, sehingga menambah agenda tidak terasa seperti mengisi borang. */}
          <div className="rounded-lg mt-4 border border-outline-variant bg-panel p-5">
            <label className="block text-body-medium font-semibold" htmlFor="new-agenda">Tambah agenda</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input id="new-agenda" value={newAgendaName} maxLength={120}
                onChange={(event) => setNewAgendaName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && newAgendaName.trim() && !creating) { event.preventDefault(); void createAgenda(); } }}
                placeholder="Misalnya: Coffee Break Siang"
                className="rounded-md min-h-11 flex-1 border border-outline-variant px-3 text-body-medium sm:min-w-72" />
              <button type="button" onClick={() => void createAgenda()} disabled={creating || !newAgendaName.trim()}
                className="rounded-md inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-body-medium font-semibold text-on-primary disabled:opacity-50">
                <Plus size={18} /> {creating ? "Menambahkan…" : "Tambah"}
              </button>
            </div>
            <p className="mt-2 text-body-small text-on-surface-variant">Agenda baru selalu dibuat sebagai draf, jadi tidak langsung tampil ke tamu.</p>
          </div>

          {sessions.length === 0
            ? <p className="rounded-lg mt-4 border border-dashed border-outline-variant bg-panel-high p-6 text-center text-body-medium text-on-surface-variant">
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
              return <article key={session.id} className="rounded-lg border border-outline-variant bg-panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-body-medium font-bold">{session.name}</h3>
                  <span className={`rounded-sm inline-flex items-center gap-1 border px-2 py-1 text-body-small font-semibold ${session.is_published ? "border-success text-success" : "border-outline-variant text-on-surface-variant"}`}>
                    {session.is_published ? <><Eye size={14} /> Publik</> : <><EyeSlash size={14} /> Draf</>}
                  </span>
                </div>
                <p className="mt-1 text-body-small text-on-surface-variant">URL publik: /denah?sesi={session.slug}</p>

                <label className="mt-4 block text-body-medium font-semibold" htmlFor={`name-${session.id}`}>Nama agenda</label>
                <input id={`name-${session.id}`} value={session.name} maxLength={120} onChange={(event) => updateSession(session.id, { name: event.target.value })}
                  className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium" />
                <p className="mt-1 text-body-small text-on-surface-variant">Dipakai di tombol pemilih agenda, bukan di judul besar.</p>

                <label className="mt-3 block text-body-medium font-semibold" htmlFor={`title-${session.id}`}>Judul di halaman publik</label>
                <input id={`title-${session.id}`} value={session.title} onChange={(event) => updateSession(session.id, { title: event.target.value })}
                  className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium" />

                <label className="mt-3 block text-body-medium font-semibold" htmlFor={`subtitle-${session.id}`}>Sub judul</label>
                <input id={`subtitle-${session.id}`} value={session.subtitle ?? ""} onChange={(event) => updateSession(session.id, { subtitle: event.target.value })}
                  className="rounded-md mt-1 min-h-11 w-full border border-outline-variant px-3 text-body-medium" />

                <label className="mt-3 block text-body-medium font-semibold" htmlFor={`subevent-${session.id}`}>Sumber penempatan (sub-event scanner API)</label>
                <select id={`subevent-${session.id}`} value={session.sub_event_id ?? ""} onChange={(event) => updateSession(session.id, { sub_event_id: event.target.value || null })}
                  className="rounded-lg mt-1 min-h-11 w-full border border-outline-variant bg-panel px-3 text-body-medium">
                  <option value="">— Belum dipilih —</option>
                  {payload?.available_sub_events.map((item) => <option key={item.subEventId} value={item.subEventId}>{item.subEventName} ({item.seatCount} kursi)</option>)}
                  {/* Pilihan tersimpan yang sudah tidak ada di data tetap ditampilkan,
                      supaya tidak berubah diam-diam menjadi "belum dipilih". */}
                  {orphanSubEvent && session.sub_event_id
                    ? <option value={session.sub_event_id}>{session.sub_event_id} (tidak ada di data terbaru)</option>
                    : null}
                </select>
                {payload?.available_sub_events.length === 0
                  ? <p className="mt-1 text-body-small text-warning">Scanner API belum mengirim data kursi. Pilihan akan muncul setelah panitia mengisinya.</p>
                  : null}
                {/* Perangkap yang paling mudah terjadi: sesi sudah dipublikasikan
                    tapi penempatannya tidak dapat dipetakan. Denahnya tampil rapi dan
                    seolah benar, padahal semua kursi kosong, sehingga terlihat
                    seperti data peserta yang tidak terbaca. Dua penyebabnya dibedakan
                    karena tindakan pemulihannya berbeda: yang satu perlu dipilih di
                    sini, yang satu perlu diisi panitia di sisi scanner API. */}
                {session.is_published && (!session.sub_event_id || orphanSubEvent)
                  ? <p className="mt-2 flex gap-2 rounded-md border border-warning bg-warning-soft p-2 text-body-small text-warning">
                      <Warning size={16} className="mt-0.5 shrink-0" />
                      <span>{session.sub_event_id
                        ? <>Sesi ini sudah publik tapi <strong>sumber penempatannya tidak ada lagi di data scanner API</strong>, jadi semua kursi tampak kosong. Pilihan tetap disimpan. Kursi akan muncul kembali setelah panitia mengisi data kursi untuk sub-event ini di sisi klien.</>
                        : <>Sesi ini sudah publik tapi <strong>sumber penempatan belum dipilih</strong>, jadi semua kursi tampak kosong. Pilih sub-event di atas lalu simpan.</>}</span>
                    </p>
                  : null}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([["background_color", "Latar"], ["text_color", "Teks"], ["accent_color", "Aksen"]] as const).map(([key, label]) => <div key={key}>
                    <label className="block text-body-small font-semibold" htmlFor={`${key}-${session.id}`}>{label}</label>
                    <input id={`${key}-${session.id}`} type="color" value={session[key]} onChange={(event) => updateSession(session.id, { [key]: event.target.value })}
                      className="rounded-md mt-1 h-11 w-full border border-outline-variant" />
                  </div>)}
                </div>

                {/* Warna kursi.
                    Terpisah dari tiga warna dasar di atas karena maknanya berbeda:
                    yang di atas adalah warna LAYAR, yang di sini adalah KEADAAN
                    kursi. Sebelum ada kolom ini kursi meminjam warna layar — kursi
                    terisi memakai warna teks — sehingga warna kursi tidak dapat
                    diubah tanpa ikut mengubah nomor meja dan judul. */}
                <fieldset className="rounded-lg mt-4 border border-outline-variant p-3">
                  <legend className="px-1 text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Warna kursi</legend>
                  <p className="text-body-small text-on-surface-variant">
                    Kosongkan (tombol Bawaan) untuk mengikuti warna layar seperti sebelumnya.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {([
                      ["seat_available_color", "Kursi kosong", "Bawaan: warna Latar"],
                      ["seat_occupied_color", "Kursi terisi", "Bawaan: warna Teks"],
                      ["seat_checked_in_color", "Sudah check-in", "Bawaan: hijau"],
                      ["seat_outline_color", "Garis tepi kursi", "Bawaan: warna Teks"],
                    ] as const).map(([key, label, hint]) => {
                      // Warna EFEKTIF, yaitu yang benar-benar tampil di denah.
                      // `<input type="color">` tidak bisa kosong, jadi tanpa ini
                      // kolom yang belum disetel akan menampilkan hitam dan admin
                      // mengira kursinya memang hitam.
                      const effective = resolveSeatColors(session, {
                        backgroundColor: session.background_color,
                        textColor: session.text_color,
                      });
                      const shown = session[key] ?? (
                        key === "seat_available_color" ? effective.available
                          : key === "seat_occupied_color" ? effective.occupied
                            : key === "seat_checked_in_color" ? effective.checkedIn
                              : effective.outline
                      );
                      return <div key={key}>
                        <label className="block text-body-small font-semibold" htmlFor={`${key}-${session.id}`}>{label}</label>
                        <div className="mt-1 flex items-center gap-2">
                          <input id={`${key}-${session.id}`} type="color" value={shown}
                            onChange={(event) => updateSession(session.id, { [key]: event.target.value })}
                            className="rounded-md h-11 w-full border border-outline-variant" />
                          {/* Tombol reset wajib ada: `<input type="color">` tidak
                              punya keadaan kosong, jadi tanpa tombol ini sebuah
                              warna tidak akan pernah bisa dikembalikan ke bawaan
                              setelah sekali disentuh. Idiom yang sama dipakai
                              BrandingEditor. */}
                          <button type="button" onClick={() => updateSession(session.id, { [key]: null })}
                            disabled={session[key] === null}
                            className="rounded-md min-h-11 shrink-0 border border-outline-variant px-2 text-body-small font-semibold disabled:opacity-40">Bawaan</button>
                        </div>
                        <p className="mt-1 text-[11px] text-on-surface-variant">{session[key] ? session[key]?.toUpperCase() : hint}</p>
                      </div>;
                    })}
                  </div>
                  <p className="mt-3 text-[11px] text-on-surface-variant">
                    Warna &quot;Sudah check-in&quot; hanya tampil pada layar yang menyalakan tampilan kehadiran.
                    Huruf kursi otomatis memakai hitam atau putih mengikuti terang-gelapnya warna yang dipilih.
                  </p>
                </fieldset>

                {/* Gambar latar bersifat opsional dan berdiri di atas warna, bukan
                    menggantikannya. Warna latar tetap dipakai di belakang gambar
                    supaya teks tidak hilang bila gambar gagal dimuat di LED.
                    Keterangan itu ditulis di layar, bukan hanya di komentar kode,
                    karena admin tidak dapat menebaknya dari tampilan form. */}
                <div className="mt-4">
                  <p className="text-body-medium font-semibold">Gambar latar <span className="font-normal text-on-surface-variant">(opsional)</span></p>
                  <p className="mt-1 text-body-small leading-5 text-on-surface-variant">
                    Kosongkan untuk memakai warna latar saja. Gambar diberi lapisan gelap otomatis agar nomor meja dan QR tetap terbaca. PNG, JPG, atau WebP, maksimal 5 MB.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className={`rounded-md inline-flex min-h-11 cursor-pointer items-center gap-2 border border-outline-variant bg-surface px-3 text-body-medium font-semibold hover:border-primary ${uploadingBackground === session.id ? "pointer-events-none opacity-60" : ""}`}>
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
                          className="rounded-lg inline-flex min-h-11 items-center gap-2 border border-outline-variant bg-panel px-3 text-body-medium font-semibold text-error hover:border-error">
                          <XCircle size={17} weight="bold" /> Hapus gambar
                        </button>
                      : null}
                  </div>
                  {session.background_image_url
                    ? <div className="mt-2 flex items-center gap-2">
                        <span className="rounded-md h-12 w-20 shrink-0 border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${session.background_image_url})` }} />
                        <span className="break-all text-[11px] leading-4 text-on-surface-variant">{session.background_image_url}</span>
                      </div>
                    : null}

                  {/* Tanpa pilihan ini, denah selalu digambar sebagai kotak warna
                      solid di tengah halaman, sehingga gambar latar hanya terlihat
                      di pinggirnya. Itu bagian layar yang paling luas, jadi gambar
                      terasa tidak terpakai.

                      Hanya muncul saat ada gambar latar. Kanvas tembus pandang tanpa
                      gambar di belakangnya menampilkan warna yang sama persis, jadi
                      pilihan yang selalu tampil akan terlihat seperti setelan rusak.

                      Warna latar TIDAK diganti menjadi "transparan" untuk tujuan ini.
                      Warna itu juga menjadi warna teks nomor meja dan label panggung,
                      jadi menembuskannya akan menghilangkan nomor mejanya. */}
                  {session.background_image_url
                    ? <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-body-medium">
                        <input type="checkbox" checked={session.map_panel_transparent}
                          onChange={(event) => updateSession(session.id, { map_panel_transparent: event.target.checked })}
                          className="mt-1 size-4 shrink-0 accent-primary" />
                        <span>
                          <span className="font-semibold">Denah tembus pandang</span>
                          <span className="mt-0.5 block text-body-small leading-5 text-on-surface-variant">
                            Menghilangkan kotak warna di belakang meja supaya gambar latar terlihat penuh. Nomor meja tetap memakai warna latar agar terbaca.
                          </span>
                        </span>
                      </label>
                    : null}
                </div>

                {/* Header dan footer branding. Memakai editor yang sama dengan
                    /admin/display supaya field di kedua CMS tidak pernah berbeda.

                    `idPrefix` memakai id agenda: setiap agenda punya kartunya
                    sendiri di halaman ini, dan tanpa pembeda seluruh label akan
                    menunjuk ke input pada kartu pertama. */}
                <div className="mt-5 border-t border-outline-variant pt-5">
                  <p className="text-body-medium font-bold">Header &amp; footer</p>
                  <div className="mt-3">
                    <BrandingEditor
                      idPrefix={`session-${session.id}`}
                      value={normalizeBranding(session as unknown as Record<string, unknown>)}
                      onChange={(changes) => updateSession(session.id, changes)}
                      baseTextColor={session.text_color}
                      baseBackgroundColor={session.background_color}
                      baseAccentColor={session.accent_color}
                    />
                  </div>
                </div>

                <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 border-t border-outline-variant pt-5 text-body-medium font-semibold">
                  <input type="checkbox" checked={session.is_published} onChange={(event) => updateSession(session.id, { is_published: event.target.checked })}
                    className="size-4 accent-primary" />
                  Tampilkan di halaman publik
                </label>

                {report ? <div className="rounded-lg mt-4 border border-outline-variant bg-panel-high p-3 text-body-medium">
                  <p className="font-semibold">Pencocokan data</p>
                  <ul className="mt-1 space-y-1 text-on-surface-variant">
                    <li>{report.matched_seats} kursi terisi, {report.empty_seats} kosong.</li>
                    <li>{report.participants_without_seat} dari {report.total_active_participants} peserta aktif belum punya kursi di sesi ini.</li>
                  </ul>
                  {report.unmatched_count > 0
                    ? <p className="mt-2 flex gap-2 rounded-md border border-error bg-error-soft p-2 text-body-small text-error">
                        <Warning size={16} className="mt-0.5 shrink-0" />
                        <span>
                          <strong>{report.unmatched_count} label tidak ada di denah</strong>, jadi peserta tersebut tidak muncul di mana pun.
                          Contoh: <code>{report.unmatched_labels.slice(0, 6).join(", ")}</code>. Sesuaikan pola label kursi di atas.
                        </span>
                      </p>
                    : report.total_assignments > 0
                      ? <p className="mt-2 flex items-center gap-2 text-body-small text-success"><CheckCircle size={16} /> Semua label cocok dengan denah.</p>
                      : null}
                </div> : null}

                <button type="button" onClick={() => void saveSession(session)} disabled={savingSession === session.id}
                  className="rounded-md mt-4 min-h-12 w-full bg-primary px-4 text-body-medium font-semibold text-on-primary disabled:opacity-60">
                  {savingSession === session.id ? "Menyimpan…" : "Simpan agenda"}
                </button>

                {/* Hapus dipisah di bawah garis dan butuh satu langkah konfirmasi.
                    Agenda yang dipublikasikan disebut khusus karena menghapusnya
                    langsung mengubah apa yang dilihat tamu saat itu. */}
                <div className="mt-4 border-t border-outline-variant pt-4">
                  {confirmDelete === session.id
                    ? <div className="rounded-lg border border-error bg-error-soft p-3">
                        <p className="text-body-small text-error">
                          Hapus <strong>{session.name}</strong>?{session.is_published ? " Agenda ini sedang tampil ke tamu." : ""} Tampilan dan pilihan sumbernya hilang; data peserta tidak terpengaruh karena penempatan tersimpan di scanner API.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => void deleteAgenda(session)} disabled={deleting === session.id}
                            className="rounded-md min-h-11 flex-1 bg-error px-3 text-body-medium font-semibold text-on-error disabled:opacity-60">
                            {deleting === session.id ? "Menghapus…" : "Ya, hapus"}
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)}
                            className="rounded-lg min-h-11 flex-1 border border-outline-variant bg-panel px-3 text-body-medium font-semibold">
                            Batal
                          </button>
                        </div>
                      </div>
                    : <button type="button" onClick={() => setConfirmDelete(session.id)}
                        className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold text-error">
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
