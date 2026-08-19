"use client";

import { ArrowLeft, ArrowSquareOut, Check, Eye, EyeSlash, Lock, LockOpen, Monitor, Palette, Plus, Trash, UploadSimple, X, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { ImagePreview } from "@/components/admin/image-preview";
import { useToast } from "@/components/toast";
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from "@/lib/branding";
import {
  TYPES_WITH_OPTIONS, VOTER_MODES, VOTE_STATUS_LABEL, VOTE_TYPES, votePercentages,
  type VotePoll, type VoteType, type VoterMode,
} from "@/lib/vote";

// CMS + kontrol voting dalam SATU halaman.
//
// Berbeda dari undian, yang kontrolnya sengaja dipisah ke halaman sendiri.
// Alasannya bukan konsistensi melainkan bentuk pekerjaannya: layar kontrol
// undian harus dapat dioperasikan tanpa memandang layar terlalu lama karena
// operatornya berdiri di samping MC, sementara voting dijalankan sambil duduk
// dan tombolnya cuma empat. Memisahkannya hanya menambah satu halaman yang
// harus dibuka bergantian dengan tempat pertanyaannya disusun.

const POLL_MS = 3000;

type Draft = {
  id: number | null;
  question: string;
  description: string;
  type: VoteType;
  voter_mode: VoterMode;
  max_choices: number;
  options: Array<{ id: number | null; label: string; image_url: string | null }>;
  rating_max: number;
  rating_min_label: string;
  rating_max_label: string;
  moderation: boolean;
  max_words: number;
};

function emptyDraft(): Draft {
  return {
    id: null, question: "", description: "", type: "single", voter_mode: "anonymous",
    max_choices: 1, options: [{ id: null, label: "", image_url: null }, { id: null, label: "", image_url: null }],
    rating_max: 5, rating_min_label: "", rating_max_label: "", moderation: true, max_words: 3,
  };
}

function toDraft(poll: VotePoll): Draft {
  return {
    id: poll.id,
    question: poll.question,
    description: poll.description ?? "",
    type: poll.type,
    voter_mode: poll.voter_mode,
    max_choices: poll.max_choices,
    options: poll.options.length > 0
      ? poll.options.map((option) => ({ id: option.id, label: option.label, image_url: option.image_url }))
      : [{ id: null, label: "", image_url: null }, { id: null, label: "", image_url: null }],
    rating_max: poll.rating_max,
    rating_min_label: poll.rating_min_label ?? "",
    rating_max_label: poll.rating_max_label ?? "",
    moderation: poll.moderation,
    max_words: poll.max_words,
  };
}

type DisplaySettings = {
  page_title: string;
  page_subtitle: string;
  background_color: string | null;
  text_color: string | null;
  accent_color: string | null;
  panel_color: string | null;
  background_image_url: string | null;
} & Branding;

/** Warna yang ditampilkan <input type="color"> saat kolomnya masih null. Bukan
 *  nilai yang disimpan: kolomnya tetap null sampai panitia benar-benar memilih. */
const COLOR_FALLBACK = { background_color: "#0B1020", text_color: "#FFFFFF", accent_color: "#F5C451", panel_color: "#141A33" } as const;

function emptySettings(): DisplaySettings {
  return {
    page_title: "Voting", page_subtitle: "",
    background_color: null, text_color: null, accent_color: null, panel_color: null, background_image_url: null,
    ...DEFAULT_BRANDING,
  };
}

const inputClass = "mt-1.5 h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]";
const labelClass = "text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]";

export default function VoteAdminPage() {
  const [polls, setPolls] = useState<VotePoll[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VotePoll | null>(null);
  // Antrean moderasi hanya dimuat untuk pertanyaan yang panelnya dibuka:
  // memuat seluruh antrean untuk setiap pertanyaan di tiap polling tiga detik
  // membaca tabel suara berulang tanpa ada yang melihatnya.
  const [moderating, setModerating] = useState<number | null>(null);
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [pending, setPending] = useState<Array<{ id: number; text_value: string; display_name: string | null }>>([]);
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/vote/polls", { cache: "no-store" }).catch(() => null);
    setLoading(false);
    if (!response?.ok) { setError("Daftar voting gagal dimuat."); return; }
    const data = await response.json();
    setPolls(data.polls ?? []);
    setActiveId(data.active_poll_id ?? null);
  }, []);

  // Polling ringan: angka suara berubah terus selama voting berjalan, dan
  // operator memutuskan kapan menutup berdasarkan angka itu.
  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  async function control(action: string, pollId: number | null) {
    setBusy(`${action}-${pollId ?? "none"}`); setError("");
    const response = await fetch("/api/admin/vote/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, poll_id: pollId }),
    }).catch(() => null);
    setBusy(null);
    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      const message = body?.error?.details?.message ?? body?.error?.message ?? "Aksi gagal.";
      setError(message); toast.error("Kontrol voting gagal", message);
      return;
    }
    void load();
  }

  async function save() {
    if (!draft) return;
    setSaving(true); setError("");
    const payload = {
      question: draft.question,
      description: draft.description || null,
      type: draft.type,
      voter_mode: draft.voter_mode,
      // Pada pilihan tunggal nilainya dipaksa 1, apa pun isi kolomnya: kombinasi
      // "pilihan tunggal, maksimal 3" tidak punya arti dan hanya menunggu
      // ditafsirkan berbeda oleh dua tempat.
      max_choices: draft.type === "single" ? 1 : draft.max_choices,
      // Opsi hanya dikirim untuk tipe yang memakainya. Dikirim juga pada rating
      // atau word cloud, RPC akan menyimpannya sebagai opsi yatim yang tidak
      // pernah tampil di mana pun.
      options: TYPES_WITH_OPTIONS.includes(draft.type)
        ? draft.options.filter((option) => option.label.trim())
            .map((option) => ({ id: option.id ?? undefined, label: option.label.trim(), image_url: option.image_url }))
        : [],
      rating_max: draft.rating_max,
      rating_min_label: draft.rating_min_label || null,
      rating_max_label: draft.rating_max_label || null,
      moderation: draft.moderation,
      max_words: draft.max_words,
    };
    const response = await fetch(draft.id ? `/api/admin/vote/polls/${draft.id}` : "/api/admin/vote/polls", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      const message = body?.error?.details?.message ?? body?.error?.message ?? "Pertanyaan gagal disimpan.";
      setError(message); toast.error("Gagal menyimpan", message);
      return;
    }
    setDraft(null);
    toast.success("Pertanyaan tersimpan");
    void load();
  }

  const loadSettings = useCallback(async () => {
    const response = await fetch("/api/admin/vote/settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json();
    const raw = data.settings as Record<string, unknown> | null;
    setSettings(raw
      ? {
          page_title: (raw.page_title as string) || "Voting",
          page_subtitle: (raw.page_subtitle as string | null) ?? "",
          background_color: (raw.background_color as string | null) ?? null,
          text_color: (raw.text_color as string | null) ?? null,
          accent_color: (raw.accent_color as string | null) ?? null,
          panel_color: (raw.panel_color as string | null) ?? null,
          background_image_url: (raw.background_image_url as string | null) ?? null,
          // Dinormalisasi ulang di klien: kolom skala bertipe `numeric` dan tiba
          // sebagai string lewat PostgREST.
          ...normalizeBranding(raw),
        }
      : emptySettings());
  }, []);

  const loadJoinCode = useCallback(async () => {
    const response = await fetch("/api/admin/vote/join-code", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json();
    setJoinCode(data.join_code ?? null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSettings(); void loadJoinCode(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings, loadJoinCode]);

  async function rotateJoinCode() {
    setRotating(true); setError("");
    const response = await fetch("/api/admin/vote/join-code", { method: "POST" }).catch(() => null);
    setRotating(false);
    if (!response?.ok) { setError("Kode gagal diganti."); return; }
    const data = await response.json();
    setJoinCode(data.join_code ?? null);
    toast.success("Kode baru diterbitkan", "Kode lama tidak lagi berlaku.");
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true); setError("");
    const response = await fetch("/api/admin/vote/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, page_subtitle: settings.page_subtitle || null }),
    }).catch(() => null);
    setSavingSettings(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      const message = body?.error?.details?.message ?? body?.error?.message ?? "Setelan gagal disimpan.";
      setError(message); toast.error("Gagal menyimpan tampilan", message);
      return;
    }
    toast.success("Tampilan tersimpan");
    void loadSettings();
  }

  /**
   * Unggah gambar, dipakai latar layar maupun gambar opsi.
   *
   * Endpoint yang sama dengan layar lain (`/api/display/background`); yang
   * membedakan hanya folder tujuan lewat `kind`. Endpoint terpisah hanya akan
   * menggandakan aturan format dan ukuran yang sudah ada di sana.
   */
  async function upload(file: File, slot: string): Promise<string | null> {
    setUploading(slot); setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("kind", "vote");
    const response = await fetch("/api/display/background", { method: "POST", body: form }).catch(() => null);
    setUploading(null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) {
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Upload gambar gagal.";
      setError(failure); toast.error("Upload gambar gagal", failure);
      return null;
    }
    return data.url as string;
  }

  const loadPending = useCallback(async (pollId: number) => {
    const response = await fetch(`/api/admin/vote/moderation?poll_id=${pollId}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json();
    setPending(data.pending ?? []);
  }, []);

  useEffect(() => {
    if (moderating === null) return;
    const first = window.setTimeout(() => { void loadPending(moderating); }, 0);
    const timer = window.setInterval(() => { void loadPending(moderating); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [moderating, loadPending]);

  async function moderate(ballotId: number, approve: boolean) {
    // Baris dibuang dari daftar secara optimis. Antrean ini bergerak cepat saat
    // kata mengalir, dan menunggu permintaan selesai sebelum menghilangkan
    // barisnya membuat operator menekan tombol yang sama dua kali.
    setPending((current) => current.filter((row) => row.id !== ballotId));
    const response = await fetch("/api/admin/vote/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ballot_id: ballotId, approve }),
    }).catch(() => null);
    if (!response?.ok) { setError("Moderasi gagal. Muat ulang daftar."); }
    if (moderating !== null) void loadPending(moderating);
    void load();
  }

  async function remove(poll: VotePoll) {
    setBusy(`delete-${poll.id}`);
    const response = await fetch(`/api/admin/vote/polls/${poll.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null); setConfirmDelete(null);
    if (!response?.ok) { setError("Pertanyaan gagal dihapus."); return; }
    toast.success("Pertanyaan dihapus");
    void load();
  }

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1200px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Voting langsung</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Vote.</h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--ink-muted)]">
            Susun pertanyaan, tayangkan ke layar, buka voting, lalu perlihatkan hasilnya saat MC siap.
            Peserta memilih dari HP lewat QR yang muncul di layar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSettingsOpen((open) => !open)} className="flex min-h-12 items-center gap-2 border border-[var(--line)] px-5 text-sm font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
            <Palette size={18} /> {settingsOpen ? "Tutup tampilan" : "Tampilan layar"}
          </button>
          <Link href="/vote/layar" target="_blank" className="flex min-h-12 items-center gap-2 border border-[var(--line)] px-5 text-sm font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
            <ArrowSquareOut size={18} /> Layar panggung
          </Link>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 flex items-start gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</p>}

      {settingsOpen && settings && <section className="mt-6 border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Tampilan layar panggung</h2>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          Berlaku untuk <span className="font-mono">/vote/layar</span>. Judul di sini adalah judul ACARA yang menetap; pertanyaannya sendiri berganti mengikuti apa yang sedang ditayangkan.
        </p>

        {/* Kode gabung berdiri di paling atas panel: inilah satu-satunya bagian
            yang dibacakan MC dari panggung, dan yang paling sering dicari
            operator saat peserta bertanya "caranya ikut bagaimana". */}
        <div className="mt-5 flex flex-wrap items-center gap-4 border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <div>
            <p className={labelClass}>Kode gabung acara</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums tracking-[0.14em]">
              {joinCode ? `${joinCode.slice(0, 3)} ${joinCode.slice(3)}` : "—"}
            </p>
          </div>
          <p className="min-w-48 flex-1 text-xs leading-relaxed text-[var(--ink-muted)]">
            Peserta membuka <span className="font-mono">/join</span> lalu mengetik angka ini. Berlaku untuk seluruh acara, bukan per pertanyaan — cukup sekali di awal sesi.
          </p>
          <button type="button" onClick={() => void rotateJoinCode()} disabled={rotating} className="min-h-11 border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-50">
            {rotating ? "Menerbitkan…" : "Ganti kode"}
          </button>
          {/* Peringatan ditulis di sebelah tombolnya, bukan di dialog konfirmasi:
              satu kalimat yang terbaca sebelum menekan lebih berguna daripada
              dialog yang ditekan "ya" tanpa dibaca. */}
          <p className="w-full text-[11px] text-[var(--ink-muted)]">
            Mengganti kode memutus peserta yang sudah memegang kode lama — mereka akan mengetik angka yang tidak menemukan apa pun.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Judul layar
            <input value={settings.page_title} onChange={(event) => setSettings({ ...settings, page_title: event.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold">Sub judul
            <input value={settings.page_subtitle} onChange={(event) => setSettings({ ...settings, page_subtitle: event.target.value })} className={inputClass} placeholder="Opsional" />
          </label>
        </div>

        <p className={`mt-5 ${labelClass}`}>Warna</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["background_color", "Latar"],
            ["text_color", "Teks"],
            ["accent_color", "Aksen"],
            ["panel_color", "Panel hasil"],
          ] as const).map(([key, label]) => <div key={key}>
            <label className="block text-sm font-semibold">{label}
              <span className="mt-1.5 flex items-center gap-2">
                <input
                  type="color"
                  value={settings[key] ?? COLOR_FALLBACK[key]}
                  onChange={(event) => setSettings({ ...settings, [key]: event.target.value })}
                  className="h-11 w-16 border border-[var(--line)] bg-[var(--background)]"
                />
                {/* Tombol ini mengembalikan kolomnya ke NULL, bukan mengetik warna
                    bawaan: keduanya terlihat sama di layar, tetapi hanya NULL yang
                    ikut berubah bila bawaannya kelak diubah. */}
                <button type="button" onClick={() => setSettings({ ...settings, [key]: null })} disabled={settings[key] === null} className="min-h-11 border border-[var(--line)] px-2 text-xs font-semibold disabled:opacity-40">
                  {settings[key] === null ? "Bawaan" : "Pakai bawaan"}
                </button>
              </span>
            </label>
          </div>)}
        </div>
        {/* Panel diberi keterangan sendiri: ia satu-satunya warna yang punya
            perhitungan otomatis, dan tanpa kalimat ini "Bawaan" terbaca seperti
            warna tetap. */}
        <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
          Panel hasil adalah bidang di belakang daftar suara. Dibiarkan bawaan, ia menjadi lapisan gelap tembus pandang sehingga selalu serasi dengan gambar latar apa pun — isi warna hanya bila Anda ingin bidang solid.
        </p>

        <p className={`mt-5 ${labelClass}`}>Gambar latar</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
            <UploadSimple size={15} /> {uploading === "background" ? "Mengunggah…" : settings.background_image_url ? "Ganti" : "Unggah"}
            <input type="file" accept="image/*" className="hidden" onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const url = await upload(file, "background");
              if (url) setSettings((current) => current && { ...current, background_image_url: url });
            }} />
          </label>
          {settings.background_image_url && <>
            <ImagePreview url={settings.background_image_url} alt="Pratinjau latar" className="h-16 w-28" />
            <button type="button" onClick={() => setSettings({ ...settings, background_image_url: null })} className="min-h-11 border border-[var(--line)] px-3 text-xs font-semibold text-[var(--danger)]">Hapus</button>
          </>}
        </div>

        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <BrandingEditor
            value={settings}
            onChange={(changes) => setSettings((current) => current && { ...current, ...changes })}
            idPrefix="vote"
            baseTextColor={settings.text_color ?? COLOR_FALLBACK.text_color}
            baseBackgroundColor={settings.background_color ?? COLOR_FALLBACK.background_color}
            baseAccentColor={settings.accent_color ?? COLOR_FALLBACK.accent_color}
          />
        </div>

        <button type="button" onClick={() => void saveSettings()} disabled={savingSettings} className="mt-6 min-h-12 bg-[var(--brand)] px-5 font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">
          {savingSettings ? "Menyimpan…" : "Simpan tampilan"}
        </button>
      </section>}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Pertanyaan</h2>
        <button type="button" onClick={() => setDraft(emptyDraft())} className="inline-flex min-h-11 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]">
          <Plus size={16} /> Pertanyaan baru
        </button>
      </div>

      {loading ? <p className="mt-6 text-sm text-[var(--ink-muted)]">Memuat…</p>
        : polls.length === 0 ? <p className="mt-6 border border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--ink-muted)]">
            Belum ada pertanyaan. Tekan <span className="font-semibold">Pertanyaan baru</span> untuk membuat yang pertama.
          </p>
        : <ul className="mt-4 space-y-4">
            {polls.map((poll) => {
              const counts = poll.options.map((option) => option.vote_count);
              const percentages = votePercentages(counts);
              const onScreen = activeId === poll.id;
              return <li key={poll.id} className="border border-[var(--line)] bg-[var(--surface)]">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] p-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{poll.question}</span>
                      {onScreen && <span className="inline-flex items-center gap-1 bg-[#E8ECFB] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-strong)]"><Monitor size={12} /> Di layar</span>}
                      <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${poll.status === "open" ? "bg-[#EEF8F0] text-[var(--brand-strong)]" : poll.status === "closed" ? "bg-[var(--surface-muted)] text-[var(--ink-muted)]" : "bg-[#FDF6E7] text-[var(--warning)]"}`}>
                        {VOTE_STATUS_LABEL[poll.status]}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      {VOTE_TYPES.find((item) => item.value === poll.type)?.label}
                      {poll.type === "multi" ? ` · maks ${poll.max_choices}` : ""}
                      {" · "}{VOTER_MODES.find((item) => item.value === poll.voter_mode)?.label}
                      {" · "}<span className="font-semibold text-[var(--ink)]">{poll.ballots}</span> orang memilih
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setDraft(toDraft(poll))} className="min-h-10 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">Sunting</button>
                    <button type="button" onClick={() => setConfirmDelete(poll)} className="inline-flex min-h-10 items-center border border-[var(--line)] px-2 text-xs font-semibold text-[var(--ink-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]" aria-label="Hapus"><Trash size={14} /></button>
                  </div>
                </div>

                <div className="space-y-2 p-5">
                  {poll.type === "rating" && <p className="text-sm text-[var(--ink-muted)]">
                    Skala 1–{poll.rating_max}. Rata-rata dan sebaran tampil di layar panggung saat hasil diperlihatkan.
                  </p>}
                  {poll.type === "wordcloud" && <div className="text-sm">
                    <p className="text-[var(--ink-muted)]">
                      Maksimal {poll.max_words} kata per peserta. Moderasi {poll.moderation ? "menyala" : "mati"}.
                    </p>
                    {poll.moderation && <button
                      type="button"
                      onClick={() => setModerating(moderating === poll.id ? null : poll.id)}
                      className={`mt-2 inline-flex min-h-10 items-center gap-2 border px-3 text-xs font-semibold ${poll.pending_words > 0 ? "border-[var(--warning)] bg-[#FDF6E7] text-[var(--warning)]" : "border-[var(--line)]"}`}
                    >
                      {poll.pending_words > 0 ? `${poll.pending_words} kata menunggu persetujuan` : "Antrean moderasi kosong"}
                    </button>}
                    {moderating === poll.id && <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto border border-[var(--line)] p-2">
                      {pending.length === 0 ? <li className="p-2 text-xs text-[var(--ink-muted)]">Tidak ada kata menunggu.</li>
                        : pending.map((row) => <li key={row.id} className="flex items-center gap-2 border-b border-[var(--line)] p-2 last:border-b-0">
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.text_value}</span>
                          {row.display_name && <span className="shrink-0 text-[10px] text-[var(--ink-muted)]">{row.display_name}</span>}
                          <button type="button" onClick={() => void moderate(row.id, true)} className="min-h-9 shrink-0 border border-[var(--line)] px-2 text-xs font-semibold text-[var(--brand-strong)] hover:border-[var(--brand)]">Setujui</button>
                          <button type="button" onClick={() => void moderate(row.id, false)} className="min-h-9 shrink-0 border border-[var(--line)] px-2 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)]">Tolak</button>
                        </li>)}
                    </ul>}
                  </div>}
                  {poll.options.map((option, index) => <div key={option.id} className="relative overflow-hidden border border-[var(--line)]">
                    <div className="absolute inset-y-0 left-0 bg-[#E8ECFB]" style={{ width: `${percentages[index]}%` }} />
                    <div className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className="shrink-0 tabular-nums text-[var(--ink-muted)]">{percentages[index]}% · {option.vote_count}</span>
                    </div>
                  </div>)}
                </div>

                {/* Empat tombol, urutannya urutan pemakaian di panggung. */}
                <div className="flex flex-wrap gap-2 border-t border-[var(--line)] p-4">
                  <button type="button" disabled={busy !== null} onClick={() => void control(onScreen ? "hide" : "show", poll.id)} className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] px-3 text-sm font-semibold disabled:opacity-50">
                    <Monitor size={16} /> {onScreen ? "Turunkan dari layar" : "Tayangkan"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void control(poll.status === "open" ? "close" : "open", poll.id)} className={`inline-flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-white disabled:opacity-50 ${poll.status === "open" ? "bg-[var(--danger)]" : "bg-[var(--brand)]"}`}>
                    {poll.status === "open" ? <><Lock size={16} /> Tutup voting</> : <><LockOpen size={16} /> Buka voting</>}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void control(poll.results_visible ? "hide_results" : "reveal_results", poll.id)} className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] px-3 text-sm font-semibold disabled:opacity-50">
                    {poll.results_visible ? <><EyeSlash size={16} /> Sembunyikan hasil</> : <><Eye size={16} /> Perlihatkan hasil</>}
                  </button>
                  {/* Hitung ulang jarang dipakai, dan memang harus terlihat
                      begitu: ia hanya berguna bila angkanya diragukan. */}
                  <button type="button" disabled={busy !== null} onClick={() => void control("recount", poll.id)} className="ml-auto min-h-11 px-2 text-xs font-semibold text-[var(--ink-muted)] underline disabled:opacity-50">
                    Hitung ulang
                  </button>
                </div>
              </li>;
            })}
          </ul>}
    </div>

    {/* Editor pertanyaan */}
    {draft && <div role="dialog" aria-modal="true" aria-label="Editor pertanyaan" className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDraft(null); }}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold">{draft.id ? "Sunting pertanyaan" : "Pertanyaan baru"}</h2>
          <button type="button" onClick={() => setDraft(null)} disabled={saving} className="min-h-11 px-2 disabled:opacity-40" aria-label="Tutup"><X size={18} /></button>
        </div>

        <label className="mt-6 block text-sm font-semibold">Pertanyaan
          <input value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} className={inputClass} placeholder="Siapa karyawan terbaik tahun ini?" required />
        </label>
        <label className="mt-4 block text-sm font-semibold">Keterangan
          <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={inputClass} placeholder="Opsional, tampil di bawah pertanyaan" />
        </label>

        <p className={`mt-5 ${labelClass}`}>Tipe</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {VOTE_TYPES.map((item) => <button key={item.value} type="button" onClick={() => setDraft({ ...draft, type: item.value })} className={`border p-3 text-left ${draft.type === item.value ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)] hover:border-[var(--brand)]"}`}>
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[var(--ink-muted)]">{item.hint}</span>
          </button>)}
        </div>

        {draft.type === "rating" && <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-semibold">Nilai tertinggi
            <input type="number" min={2} max={10} value={draft.rating_max} onChange={(event) => setDraft({ ...draft, rating_max: Math.min(10, Math.max(2, Number(event.target.value) || 5)) })} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold">Label nilai 1
            <input value={draft.rating_min_label} onChange={(event) => setDraft({ ...draft, rating_min_label: event.target.value })} className={inputClass} placeholder="Sangat kurang" />
          </label>
          <label className="block text-sm font-semibold">Label nilai tertinggi
            <input value={draft.rating_max_label} onChange={(event) => setDraft({ ...draft, rating_max_label: event.target.value })} className={inputClass} placeholder="Sangat baik" />
          </label>
        </div>}

        {draft.type === "wordcloud" && <div className="mt-4 space-y-3">
          <label className="block text-sm font-semibold">Maksimal kata per peserta
            <input type="number" min={1} max={5} value={draft.max_words} onChange={(event) => setDraft({ ...draft, max_words: Math.min(5, Math.max(1, Number(event.target.value) || 3)) })} className={inputClass} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={draft.moderation} onChange={(event) => setDraft({ ...draft, moderation: event.target.checked })} className="mt-1 size-4" />
            <span>
              <span className="font-semibold">Tahan kata sampai disetujui</span>
              {/* Bawaan MENYALA. Penyaring kata di database hanya menangkap yang
                  sudah terdaftar; nama orang dan sindiran tidak akan pernah ada
                  di daftar mana pun, dan yang tampil di layar besar di depan
                  klien tidak bisa ditarik kembali. */}
              <span className="mt-1 block text-[11px] leading-relaxed text-[var(--ink-muted)]">
                Sangat disarankan. Kata baru masuk antrean dan baru tampil di layar setelah Anda setujui. Dimatikan, apa pun yang diketik peserta langsung terpampang.
              </span>
            </span>
          </label>
        </div>}

        {draft.type === "multi" && <label className="mt-4 block text-sm font-semibold">Maksimal pilihan
          <input type="number" min={2} max={20} value={draft.max_choices} onChange={(event) => setDraft({ ...draft, max_choices: Math.max(2, Number(event.target.value) || 2) })} className={inputClass} />
        </label>}

        <p className={`mt-5 ${labelClass}`}>Siapa yang boleh memilih</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {VOTER_MODES.map((item) => <button key={item.value} type="button" onClick={() => setDraft({ ...draft, voter_mode: item.value })} className={`border p-3 text-left ${draft.voter_mode === item.value ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)] hover:border-[var(--brand)]"}`}>
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[var(--ink-muted)]">{item.hint}</span>
          </button>)}
        </div>
        {/* Peringatan kekuatan mode ditampilkan DI SEBELAH pilihannya, bukan di
            dokumentasi: panitia yang memilih anonim untuk voting berhadiah perlu
            membacanya sebelum acara, bukan sesudah. */}
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
          {VOTER_MODES.find((item) => item.value === draft.voter_mode)?.warning}
        </p>

        {TYPES_WITH_OPTIONS.includes(draft.type) && <>
        <p className={`mt-5 ${labelClass}`}>Opsi jawaban</p>
        <ul className="mt-2 space-y-2">
          {draft.options.map((option, index) => <li key={index} className="flex gap-2">
            {/* Gambar opsi. Opsional dan berdampingan dengan labelnya: voting
                "pilih desain" butuh gambar, sebagian besar pertanyaan tidak. */}
            <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden border border-[var(--line)] hover:border-[var(--brand)]" title={option.image_url ? "Ganti gambar opsi" : "Unggah gambar opsi"}>
              {option.image_url
                ? <ImagePreview url={option.image_url} alt={`Gambar opsi ${index + 1}`} className="size-11" />
                : <UploadSimple size={16} className={uploading === `option-${index}` ? "animate-pulse" : "text-[var(--ink-muted)]"} />}
              <input type="file" accept="image/*" className="hidden" onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const url = await upload(file, `option-${index}`);
                if (url) setDraft((current) => current && { ...current, options: current.options.map((item, position) => position === index ? { ...item, image_url: url } : item) });
              }} />
            </label>
            <input
              value={option.label}
              onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? { ...item, label: event.target.value } : item) })}
              className="h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]"
              placeholder={`Opsi ${index + 1}`}
            />
            {option.image_url && <button
              type="button"
              onClick={() => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? { ...item, image_url: null } : item) })}
              className="min-h-11 shrink-0 border border-[var(--line)] px-2 text-[10px] font-semibold text-[var(--ink-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >Hapus gambar</button>}
            <button
              type="button"
              onClick={() => setDraft({ ...draft, options: draft.options.filter((_, position) => position !== index) })}
              disabled={draft.options.length <= 2}
              className="min-h-11 shrink-0 border border-[var(--line)] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-30"
              aria-label={`Hapus opsi ${index + 1}`}
            ><Trash size={14} /></button>
          </li>)}
        </ul>
        <button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, { id: null, label: "", image_url: null }] })} disabled={draft.options.length >= 30} className="mt-2 inline-flex min-h-10 items-center gap-1.5 border border-[var(--line)] px-3 text-xs font-semibold disabled:opacity-40">
          <Plus size={14} /> Tambah opsi
        </button>
        </>}

        <div className="mt-8 flex flex-wrap gap-2">
          <button type="submit" disabled={saving || !draft.question.trim() || (TYPES_WITH_OPTIONS.includes(draft.type) && draft.options.filter((option) => option.label.trim()).length < 2)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 bg-[var(--brand)] px-4 font-semibold text-white disabled:opacity-40">
            <Check size={18} /> {saving ? "Menyimpan…" : "Simpan"}
          </button>
          <button type="button" onClick={() => setDraft(null)} disabled={saving} className="min-h-12 border border-[var(--line)] px-4 font-semibold disabled:opacity-40">Batal</button>
        </div>
      </form>
    </div>}

    {/* Konfirmasi hapus. Menyebut jumlah suara yang ikut hilang, karena itulah
        yang sebenarnya dipertaruhkan — bukan pertanyaannya, yang bisa diketik
        ulang dalam sepuluh detik. */}
    {confirmDelete && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(null); }}>
      <div className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold text-[var(--danger)]">Hapus pertanyaan</h2>
        <p className="mt-3 text-sm leading-6">
          &ldquo;{confirmDelete.question}&rdquo; akan dihapus{confirmDelete.ballots > 0 ? <> beserta <span className="font-semibold">{confirmDelete.ballots} suara</span> yang sudah masuk</> : ""}. Tidak dapat dikembalikan.
        </p>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => void remove(confirmDelete)} disabled={busy !== null} className="min-h-12 flex-1 bg-[var(--danger)] px-4 font-semibold text-white disabled:opacity-50">Hapus</button>
          <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-12 border border-[var(--line)] px-4 font-semibold">Batal</button>
        </div>
      </div>
    </div>}
  </main>;
}
