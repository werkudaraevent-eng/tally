"use client";

import {
  ArrowLeft, ArrowSquareOut, ClockCounterClockwise, Confetti, DownloadSimple, FloppyDisk, Gift, Plus, Prohibit,
  SlidersHorizontal, SpeakerHigh, Trash, UploadSimple, Users, Warning,
} from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useMemo, useState } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { ImagePreview } from "@/components/admin/image-preview";
import { UndianConditionBuilder } from "@/components/admin/undian-condition-builder";
import { ExclusionRuleManager } from "@/components/admin/undian-exclusion-rules";
import { SessionHistory } from "@/components/admin/undian-session-history";
import { useToast } from "@/components/toast";
import { normalizeBranding, type Branding } from "@/lib/branding";
import {
  ANIMATIONS, EMPTY_CONDITIONS, EXCLUDE_SCOPE_LABEL, WEIGHT_VAR_LABEL,
  describeConditions, normalizePrize,
  type ExcludeScope, type PoolBreakdown, type UndianAnimation, type UndianPrize, type WeightVar,
} from "@/lib/undian";

// CMS Undian.
//
// Halaman ini mengurus KONFIGURASI. Menjalankan undian di atas panggung ada di
// /admin/undian/kontrol, dan pemisahan itu disengaja: halaman ini padat oleh form
// dan mudah tergeser saat digulir, sementara halaman kontrol harus bisa dioperasikan
// tanpa melihat layar terlalu lama karena operatornya sedang berdiri di samping MC.

type PoolStat = { eligible: number; candidates: number; tickets: number };
type EntryGroup = { id: number; name: string; note: string | null; entry_count: number };
type Exclusion = { participant_id: string; name: string; company: string | null; reason: string | null };
type Preview = {
  total_participants: number; eligible: number; available: number;
  total_tickets: number; max_tickets: number; top_share: number;
  breakdown: PoolBreakdown;
  sample: { name: string; company: string | null; checked_in: boolean; total_spend: number; tickets: number }[];
  participant_types: string[]; rsvp_statuses: string[]; companies: string[];
};

type Settings = {
  page_title: string; page_subtitle: string | null;
  name_display: "full" | "follow_event";
  show_company: boolean; show_seat: boolean;
  sound_enabled: boolean; confetti_enabled: boolean;
  reveal_delay_seconds: number;
  background_color: string | null; text_color: string | null; accent_color: string | null;
  background_image_url: string | null;
} & Branding;

// Nilai yang ditampilkan <input type="color"> ketika kolomnya masih null. Bukan
// nilai yang disimpan: kolomnya tetap null sampai admin benar-benar memilih warna.
const FALLBACK = { background_color: "#0B1020", text_color: "#FFFFFF", accent_color: "#F5C451" } as const;

const rupiah = (value: number) => new Intl.NumberFormat("id-ID").format(value);
const digitsOnly = (value: string) => value.replace(/\D/g, "");

function newPrizeDraft(): Omit<UndianPrize, "id"> {
  return {
    name: "", description: null, image_url: null, sponsor_name: null,
    winners_per_draw: 1, winner_quota: 1, backup_per_draw: 0,
    animation: "wheel", spin_seconds: 6,
    source: "participants", entry_group_id: null,
    conditions: EMPTY_CONDITIONS, exclude_scope: "all_prizes",
    weight_mode: "equal", weight_var: "total_spend", weight_divisor: 500000, weight_base: 1, weight_max: 10,
    sort_order: 0, is_active: true,
  };
}

export default function UndianAdminPage() {
  const [tab, setTab] = useState<"prizes" | "display" | "data" | "history">("prizes");
  const [prizes, setPrizes] = useState<UndianPrize[]>([]);
  const [winnerCounts, setWinnerCounts] = useState<Record<number, number>>({});
  const [pools, setPools] = useState<Record<number, PoolStat>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [groups, setGroups] = useState<EntryGroup[]>([]);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Omit<UndianPrize, "id">>(newPrizeDraft);
  const [savingPrize, setSavingPrize] = useState(false);
  const [confirmPrize, setConfirmPrize] = useState<number | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [uploadingPrizeImage, setUploadingPrizeImage] = useState(false);
  const [importName, setImportName] = useState("");
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  // Sesi aktif dan jumlah hasil yang belum bersesi.
  //
  // Dipakai tab hadiah untuk menjelaskan label kuota. Tanpa itu, "kuota penuh"
  // pada hadiah yang ingin diundi lagi di sesi baru terbaca sebagai buntu, dan
  // tidak ada apa pun di layar yang memberi tahu bahwa jawabannya adalah menutup
  // sesi — bukan membuat hadiah baru.
  const [activeSession, setActiveSession] = useState<{ id: number; name: string } | null>(null);
  const [orphanWinners, setOrphanWinners] = useState(0);
  // Hapus permanen hanya untuk pemilik sistem. Server juga menolaknya lewat
  // requireUser(["super_admin"]); menyembunyikan tombolnya agar klien tidak
  // menemui aksi yang pasti gagal. Pola yang sama dipakai <AdminShell>.
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function load() {
    const [prizeResponse, settingsResponse, groupResponse, exclusionResponse, sessionResponse] = await Promise.all([
      fetch("/api/admin/undian/prizes?pool=1", { cache: "no-store" }),
      fetch("/api/admin/undian/settings", { cache: "no-store" }),
      fetch("/api/admin/undian/entries", { cache: "no-store" }),
      fetch("/api/admin/undian/exclusions", { cache: "no-store" }),
      fetch("/api/admin/undian/sessions", { cache: "no-store" }),
    ]);
    if (!prizeResponse.ok) { setError("Data undian gagal dimuat."); return; }
    const data = await prizeResponse.json();
    setPrizes((data.prizes as Record<string, unknown>[]).map(normalizePrize));
    setWinnerCounts(data.winner_counts ?? {});
    setPools(data.pools ?? {});
    // Kegagalan pada bagian pendukung tidak menggagalkan seluruh halaman: daftar
    // hadiah tetap dapat disusun tanpa daftar entri dan daftar pengecualian.
    if (settingsResponse.ok) {
      const raw = (await settingsResponse.json()) as Record<string, unknown>;
      setSettings({ ...(raw as unknown as Settings), ...normalizeBranding(raw), reveal_delay_seconds: Number(raw.reveal_delay_seconds ?? 0) });
    }
    if (groupResponse.ok) setGroups((await groupResponse.json()).groups ?? []);
    if (exclusionResponse.ok) setExclusions((await exclusionResponse.json()).exclusions ?? []);
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      setActiveSession(sessionData.active ? { id: sessionData.active.id, name: sessionData.active.name } : null);
      setOrphanWinners(sessionData.orphan_winners ?? 0);
    }
  }

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
        if (response.ok) setIsOwner((await response.json()).user?.role === "super_admin");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Pratinjau kolam dihitung ulang saat syarat atau bobot berubah, dengan jeda.
  //
  // Jedanya wajib: tanpa itu setiap ketikan di kolom nominal memicu satu query
  // agregat lintas seluruh tabel order. Mengetik "500000" berarti enam query yang
  // lima di antaranya sudah tidak relevan sebelum jawabannya tiba.
  useEffect(() => {
    if (editingId === null || draft.source !== "participants") return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch("/api/admin/undian/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conditions: draft.conditions, weight_mode: draft.weight_mode, weight_var: draft.weight_var,
            weight_divisor: draft.weight_divisor, weight_base: draft.weight_base, weight_max: draft.weight_max,
            // Aturan pengecualian bisa berlaku khusus untuk satu hadiah, jadi
            // pratinjaunya harus tahu hadiah mana yang sedang diedit. Tanpa ini,
            // angka di layar mengabaikan aturan khusus dan menjanjikan kolam yang
            // lebih besar daripada yang benar-benar akan diundi.
            prize_id: editingId === "new" ? null : editingId,
          }),
        });
        if (response.ok) setPreview((await response.json()) as Preview);
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [editingId, draft.conditions, draft.source, draft.weight_mode, draft.weight_var, draft.weight_divisor, draft.weight_base, draft.weight_max]);

  const branding = useMemo(
    () => (settings ? normalizeBranding(settings as unknown as Record<string, unknown>) : null),
    [settings],
  );

  function updateDraft(changes: Partial<Omit<UndianPrize, "id">>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function updateSettings(changes: Partial<Settings>) {
    setSettings((current) => current && { ...current, ...changes });
  }

  function openEditor(prize: UndianPrize | null) {
    setEditingId(prize ? prize.id : "new");
    setDraft(prize ? { ...prize } : newPrizeDraft());
    setPreview(null);
    setError("");
  }

  function failureMessage(data: { error?: { message?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } } }, fallback: string) {
    const field = data.error?.details?.fieldErrors;
    const first = field ? Object.values(field).flat()[0] : undefined;
    return first ?? data.error?.details?.formErrors?.[0] ?? data.error?.message ?? fallback;
  }

  async function savePrize() {
    if (!draft.name.trim()) { setError("Nama hadiah wajib diisi."); return; }
    setSavingPrize(true); setError("");
    const isNew = editingId === "new";
    const response = await fetch(isNew ? "/api/admin/undian/prizes" : `/api/admin/undian/prizes/${editingId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json().catch(() => ({}));
    setSavingPrize(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Hadiah gagal disimpan.");
      setError(failure); toast.error("Hadiah gagal disimpan", failure); return;
    }
    setEditingId(null);
    await load();
    toast.success("Hadiah tersimpan", isNew ? "Hadiah baru siap diundi." : "Perubahan berlaku pada undian berikutnya.");
  }

  async function deletePrize(id: number) {
    const response = await fetch(`/api/admin/undian/prizes/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setConfirmPrize(null);
    if (!response.ok) {
      const failure = failureMessage(data, "Hadiah gagal dihapus.");
      setError(failure); toast.error("Hadiah gagal dihapus", failure); return;
    }
    await load();
    toast.success("Hadiah dihapus");
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true); setError("");
    const response = await fetch("/api/admin/undian/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_title: settings.page_title,
        page_subtitle: settings.page_subtitle,
        name_display: settings.name_display,
        show_company: settings.show_company,
        show_seat: settings.show_seat,
        sound_enabled: settings.sound_enabled,
        confetti_enabled: settings.confetti_enabled,
        reveal_delay_seconds: settings.reveal_delay_seconds,
        background_color: settings.background_color,
        text_color: settings.text_color,
        accent_color: settings.accent_color,
        background_image_url: settings.background_image_url,
        ...normalizeBranding(settings as unknown as Record<string, unknown>),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSavingSettings(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Setelan gagal disimpan.");
      setError(failure); toast.error("Setelan gagal disimpan", failure); return;
    }
    const raw = data as Record<string, unknown>;
    setSettings({ ...(raw as unknown as Settings), ...normalizeBranding(raw), reveal_delay_seconds: Number(raw.reveal_delay_seconds ?? 0) });
    toast.success("Setelan tersimpan", "Layar undian menyesuaikan dalam beberapa detik.");
  }

  async function uploadImage(file: File, target: "background" | "prize") {
    const setter = target === "background" ? setUploadingBackground : setUploadingPrizeImage;
    setter(true); setError("");
    const form = new FormData();
    form.append("file", file);
    if (target === "prize") form.append("kind", "undian");
    const response = await fetch("/api/display/background", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    setter(false);
    if (!response.ok) {
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Upload gambar gagal.";
      setError(failure); toast.error("Upload gambar gagal", failure); return;
    }
    if (target === "background") updateSettings({ background_image_url: data.url });
    else updateDraft({ image_url: data.url });
    toast.info("Gambar terunggah", "Klik Simpan untuk menerapkannya.");
  }

  /**
   * Import daftar entri, dari berkas atau dari teks tempelan.
   *
   * Berkas didahulukan bila ada: operator yang sudah memilih berkas jelas
   * bermaksud memakainya, dan teks contoh yang tertinggal di kotak tidak boleh
   * diam-diam ikut terkirim.
   *
   * Berkas dikirim apa adanya sebagai FormData, TIDAK dibaca di browser lebih
   * dulu. Semua parsing terjadi di server supaya hasilnya tidak bergantung pada
   * peramban yang dipakai operator.
   */
  async function importEntries() {
    if (!importName.trim()) { setError("Nama daftar wajib diisi."); return; }
    if (!importFile && !importText.trim()) { setError("Pilih berkas atau tempel daftarnya."); return; }

    setImporting(true); setError("");

    let response: Response;
    if (importFile) {
      const form = new FormData();
      form.append("name", importName);
      form.append("file", importFile);
      response = await fetch("/api/admin/undian/entries", { method: "POST", body: form });
    } else {
      response = await fetch("/api/admin/undian/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: importName, text: importText }),
      });
    }

    const data = await response.json().catch(() => ({}));
    setImporting(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Import gagal.");
      setError(failure); toast.error("Import gagal", failure); return;
    }
    setImportName(""); setImportText(""); setImportFile(null);
    await load();
    toast.success("Daftar terimpor", `${data.entry_count} baris terbaca.`);
  }

  async function deleteGroup(id: number) {
    const response = await fetch(`/api/admin/undian/entries/${id}`, { method: "DELETE" });
    if (!response.ok) { toast.error("Daftar gagal dihapus"); return; }
    await load();
    toast.success("Daftar dihapus");
  }

  async function removeExclusion(participantId: string) {
    const response = await fetch(`/api/admin/undian/exclusions?participant_id=${participantId}`, { method: "DELETE" });
    if (!response.ok) { toast.error("Gagal mengembalikan peserta"); return; }
    await load();
    toast.success("Peserta kembali ikut undian");
  }

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]">
        <ArrowLeft size={18} /> Kembali ke Dashboard
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Undian CMS</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Undian berhadiah.</h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--ink-muted)]">
            Atur hadiah, siapa yang berhak diundi, dan bagaimana namanya tampil di panggung.
            Menjalankan undiannya ada di halaman kontrol.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/undian/kontrol" className="flex min-h-12 items-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-5 text-sm font-semibold text-white">
            <SlidersHorizontal size={18} /> Buka kontrol undian
          </Link>
          <Link href="/undian" target="_blank" className="flex min-h-12 items-center gap-2 border border-[var(--line)] px-5 text-sm font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
            <ArrowSquareOut size={18} /> Layar panggung
          </Link>
        </div>
      </div>

      {error && <p className="mt-5 flex items-start gap-2 border border-[var(--danger)] bg-[#FDECEC] p-4 text-sm text-[var(--danger)]">
        <Warning size={18} className="mt-0.5 shrink-0" /> {error}
      </p>}

      <div className="mt-8 flex flex-wrap gap-px border border-[var(--line)] bg-[var(--line)]">
        {([
          { key: "prizes", label: "Hadiah & syarat", icon: Gift },
          { key: "display", label: "Tampilan panggung", icon: Confetti },
          { key: "data", label: "Sumber data", icon: Users },
          { key: "history", label: "Hasil & riwayat", icon: ClockCounterClockwise },
        ] as const).map((item) => <button
          key={item.key}
          type="button"
          onClick={() => setTab(item.key)}
          className={`flex min-h-12 flex-1 items-center justify-center gap-2 px-5 text-sm font-semibold ${tab === item.key ? "bg-[var(--brand)] text-white" : "bg-[var(--surface)] hover:text-[var(--brand)]"}`}
        >
          <item.icon size={18} /> {item.label}
        </button>)}
      </div>

      {tab === "prizes" && <PrizesTab
        prizes={prizes} pools={pools} winnerCounts={winnerCounts} groups={groups} preview={preview}
        activeSession={activeSession} orphanWinners={orphanWinners}
        editingId={editingId} draft={draft} savingPrize={savingPrize} confirmPrize={confirmPrize}
        uploadingPrizeImage={uploadingPrizeImage}
        onOpen={openEditor} onClose={() => setEditingId(null)} onDraft={updateDraft}
        onSave={savePrize} onDelete={deletePrize} onConfirm={setConfirmPrize}
        onUpload={(file) => uploadImage(file, "prize")}
        onGoToHistory={() => setTab("history")}
      />}

      {tab === "display" && settings && branding && <DisplayTab
        settings={settings} branding={branding} saving={savingSettings} uploading={uploadingBackground}
        onChange={updateSettings} onSave={saveSettings} onUpload={(file) => uploadImage(file, "background")}
      />}

      {tab === "data" && <DataTab
        groups={groups} exclusions={exclusions} prizes={prizes}
        importName={importName} importText={importText} importFile={importFile} importing={importing}
        onImportName={setImportName} onImportText={setImportText} onImportFile={setImportFile}
        onImport={importEntries} onDeleteGroup={deleteGroup} onRemoveExclusion={removeExclusion}
        onRulesChanged={() => { void load(); }}
      />}

      {/* Kuota hadiah dihitung per sesi aktif, jadi daftar hadiah harus dimuat
          ulang setiap kali sesi dibuka atau ditutup — kalau tidak, label "kuota
          penuh" tertinggal pada keadaan sesi sebelumnya. */}
      {tab === "history" && <SessionHistory isOwner={isOwner} onChanged={() => { void load(); }} />}
    </div>
  </main>;
}

// ===========================================================================
// Tab hadiah
// ===========================================================================

function PrizesTab({
  prizes, pools, winnerCounts, groups, preview, activeSession, orphanWinners,
  editingId, draft, savingPrize, confirmPrize,
  uploadingPrizeImage, onOpen, onClose, onDraft, onSave, onDelete, onConfirm, onUpload, onGoToHistory,
}: {
  prizes: UndianPrize[]; pools: Record<number, PoolStat>; winnerCounts: Record<number, number>;
  groups: EntryGroup[]; preview: Preview | null;
  activeSession: { id: number; name: string } | null; orphanWinners: number;
  editingId: number | "new" | null; draft: Omit<UndianPrize, "id">; savingPrize: boolean; confirmPrize: number | null;
  uploadingPrizeImage: boolean;
  onOpen: (prize: UndianPrize | null) => void; onClose: () => void;
  onDraft: (changes: Partial<Omit<UndianPrize, "id">>) => void;
  onSave: () => void; onDelete: (id: number) => void; onConfirm: (id: number | null) => void;
  onUpload: (file: File) => void;
  onGoToHistory: () => void;
}) {
  const anyQuotaFull = prizes.some((prize) => (winnerCounts[prize.id] ?? 0) >= prize.winner_quota);

  return <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
    <section>
      {/* Konteks sesi. Angka pemenang selalu dihitung dalam lingkup sesi yang
          sedang berjalan, dan tanpa keterangan ini "kuota penuh" terbaca sebagai
          buntu permanen — padahal jalan keluarnya adalah menutup sesi, bukan
          membuat hadiah baru. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs">
        {activeSession
          ? <><span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-[var(--brand)]" />
            <span>Menghitung untuk sesi <span className="font-semibold">{activeSession.name}</span></span></>
          : <><Warning size={14} className="shrink-0 text-[var(--ink-muted)]" />
            <span className="text-[var(--ink-muted)]">Belum ada sesi berjalan. Undian tetap bisa dijalankan, hasilnya saja yang tidak terkelompok.</span></>}
        <button type="button" onClick={onGoToHistory} className="ml-auto min-h-8 font-semibold text-[var(--brand)] underline">
          {activeSession ? "Kelola sesi" : "Mulai sesi"}
        </button>
      </div>

      {/* Hasil yang belum bersesi tidak akan pernah lepas dari kolam: tidak ada
          sesi yang bisa ditutup untuk membebaskannya. Keadaan ini mustahil
          ditemukan sendiri oleh panitia — yang terlihat hanya hadiah yang terus
          menolak diundi. */}
      {orphanWinners > 0 && <p className="mb-3 flex items-start gap-2 border border-[#E6D3AE] bg-[#FDF6E7] p-3 text-xs leading-relaxed text-[#7A5B00]">
        <Warning size={15} className="mt-0.5 shrink-0" />
        <span>
          Ada <span className="font-semibold">{orphanWinners} pemenang lama</span> yang belum masuk sesi mana pun, jadi mereka
          tidak bisa dibebaskan lewat tutup sesi. Arsipkan di tab{" "}
          <button type="button" onClick={onGoToHistory} className="font-semibold underline">Hasil &amp; riwayat</button>.
        </span>
      </p>}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Daftar hadiah</h2>
        <button type="button" onClick={() => onOpen(null)} className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
          <Plus size={15} /> Tambah hadiah
        </button>
      </div>

      {/* Petunjuk hanya muncul ketika keadaannya benar-benar terjadi. Menampilkannya
          terus-menerus membuatnya jadi latar yang tidak dibaca siapa pun. */}
      {anyQuotaFull && <p className="mb-3 border border-[var(--brand)]/40 bg-[#E8ECFB] p-3 text-xs leading-relaxed text-[var(--brand-strong)]">
        Untuk mengundi hadiah yang kuotanya penuh pada sesi berikutnya,
        <span className="font-semibold"> tutup sesi sekarang lalu mulai sesi baru</span> — hadiah yang sama dipakai lagi, tidak perlu dibuat ulang.
        Kuota dan daftar pemenang dihitung ulang per sesi.
      </p>}

      {prizes.length === 0 ? <p className="border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--ink-muted)]">
        Belum ada hadiah. Tambahkan hadiah pertama untuk mulai.
      </p> : <div className="space-y-px border border-[var(--line)] bg-[var(--line)]">
        {prizes.map((prize) => {
          const pool = pools[prize.id];
          const won = winnerCounts[prize.id] ?? 0;
          return <div key={prize.id} className={`bg-[var(--surface)] p-4 ${editingId === prize.id ? "ring-2 ring-inset ring-[var(--brand)]" : ""}`}>
            <div className="flex items-start gap-3">
              {prize.image_url
                ? <ImagePreview url={prize.image_url} alt="" className="h-14 w-14" />
                : <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-dashed border-[var(--line)] text-[var(--ink-muted)]"><Gift size={20} /></div>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{prize.name || "(tanpa nama)"}</span>
                  {!prize.is_active && <span className="border border-[var(--line)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--ink-muted)]">Nonaktif</span>}
                  {/* "Penuh di sesi ini", bukan "Kuota penuh".
                      Tanpa keterangan sesi, label ini terbaca sebagai hadiah yang
                      habis selamanya — dan panitia lalu membuat hadiah duplikat
                      untuk sesi berikutnya, padahal cukup menutup sesi. */}
                  {won >= prize.winner_quota && <span className="border border-[var(--brand)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--brand)]">
                    {activeSession ? "Penuh di sesi ini" : "Kuota penuh"}
                  </span>}
                </div>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  {ANIMATIONS.find((item) => item.value === prize.animation)?.label}
                  {" · "}{prize.winners_per_draw} pemenang/undi
                  {prize.backup_per_draw > 0 && ` + ${prize.backup_per_draw} cadangan`}
                  {" · kuota "}{won}/{prize.winner_quota}
                </p>
                {/* Kesalahan konfigurasi yang paling mudah terlewat: pemenang per
                    undi lebih besar dari kuotanya. Sistem menjepitnya saat mengundi,
                    tapi tanpa peringatan panitia mengira akan keluar sepuluh nama
                    dan hanya satu yang muncul di panggung. */}
                {prize.winners_per_draw > prize.winner_quota && <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-[var(--warning)]">
                  <Warning size={13} className="mt-0.5 shrink-0" />
                  {prize.winners_per_draw} pemenang/undi melebihi kuota {prize.winner_quota}. Hanya {prize.winner_quota} nama yang akan keluar.
                </p>}
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Syarat: {prize.source === "entries"
                    ? `daftar "${groups.find((group) => group.id === prize.entry_group_id)?.name ?? "?"}"`
                    : describeConditions(prize.conditions)}
                </p>
                {pool && <p className="mt-1 text-xs tabular-nums text-[var(--brand)]">
                  {pool.candidates} nama siap diundi
                  {pool.eligible !== pool.candidates && ` (${pool.eligible - pool.candidates} sudah menang di sesi yang masih terbuka)`}
                </p>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpen(prize)} className="min-h-10 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">Ubah</button>
              {confirmPrize === prize.id
                ? <>
                  <button type="button" onClick={() => onDelete(prize.id)} className="min-h-10 border border-[var(--danger)] bg-[var(--danger)] px-3 text-xs font-semibold text-white">Ya, hapus</button>
                  <button type="button" onClick={() => onConfirm(null)} className="min-h-10 border border-[var(--line)] px-3 text-xs font-semibold">Batal</button>
                </>
                : <button type="button" onClick={() => onConfirm(prize.id)} className="flex min-h-10 items-center gap-1.5 border border-[var(--line)] px-3 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)]"><Trash size={14} /> Hapus</button>}
            </div>
          </div>;
        })}
      </div>}
    </section>

    {editingId !== null && <PrizeEditor
      draft={draft} groups={groups} preview={preview} saving={savingPrize} uploading={uploadingPrizeImage}
      onChange={onDraft} onSave={onSave} onClose={onClose} onUpload={onUpload}
    />}
  </div>;
}

function PrizeEditor({
  draft, groups, preview, saving, uploading, onChange, onSave, onClose, onUpload,
}: {
  draft: Omit<UndianPrize, "id">; groups: EntryGroup[]; preview: Preview | null;
  saving: boolean; uploading: boolean;
  onChange: (changes: Partial<Omit<UndianPrize, "id">>) => void;
  onSave: () => void; onClose: () => void; onUpload: (file: File) => void;
}) {
  const inputClass = "h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]";
  const labelClass = "text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]";

  return <section className="space-y-px self-start border border-[var(--line)] bg-[var(--line)] lg:sticky lg:top-6">
    <div className="bg-[var(--surface)] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Detail hadiah</h2>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="prize-name" className={labelClass}>Nama hadiah</label>
          <input id="prize-name" value={draft.name} onChange={(event) => onChange({ name: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Sepeda Listrik" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="prize-sponsor" className={labelClass}>Sponsor</label>
            <input id="prize-sponsor" value={draft.sponsor_name ?? ""} onChange={(event) => onChange({ sponsor_name: event.target.value || null })} className={`${inputClass} mt-1.5`} placeholder="Opsional" />
          </div>
          <div>
            <label htmlFor="prize-image" className={labelClass}>Gambar hadiah</label>
            <div className="mt-1.5 flex items-center gap-2">
              <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
                <UploadSimple size={15} /> {uploading ? "Mengunggah..." : draft.image_url ? "Ganti" : "Unggah"}
                <input id="prize-image" type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Nilai input dikosongkan supaya memilih berkas yang sama dua
                  // kali berturut-turut tetap memicu onChange.
                  event.target.value = "";
                  if (file) onUpload(file);
                }} />
              </label>
              {draft.image_url && <button type="button" onClick={() => onChange({ image_url: null })} className="min-h-11 border border-[var(--line)] px-3 text-xs font-semibold text-[var(--danger)]">Hapus</button>}
            </div>
            {/* Pratinjau, bukan sekadar tombol yang berubah menjadi "Ganti".
                Tombol memberi tahu bahwa ADA gambar, bukan gambar YANG MANA. */}
            {draft.image_url && <div className="mt-2">
              <ImagePreview url={draft.image_url} alt="Pratinjau gambar hadiah" className="h-20 w-20" />
            </div>}
          </div>
        </div>

        <div>
          <label htmlFor="prize-description" className={labelClass}>Keterangan</label>
          <input id="prize-description" value={draft.description ?? ""} onChange={(event) => onChange({ description: event.target.value || null })} className={`${inputClass} mt-1.5`} placeholder="Tampil di bawah nama hadiah" />
        </div>
      </div>
    </div>

    {/* --- Cara mengundi --- */}
    <div className="bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Cara mengundi</h3>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {ANIMATIONS.map((item) => <button
          key={item.value}
          type="button"
          onClick={() => onChange({ animation: item.value as UndianAnimation })}
          className={`border p-3 text-left ${draft.animation === item.value ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)] hover:border-[var(--brand)]"}`}
        >
          <span className="block text-sm font-semibold">{item.label}</span>
          <span className="mt-1 block text-[11px] leading-snug text-[var(--ink-muted)]">{item.hint}</span>
        </button>)}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <NumberField id="winners-per-draw" label="Pemenang per undi" value={draft.winners_per_draw} min={1} max={50} onChange={(value) => onChange({ winners_per_draw: value })} />
        <NumberField id="winner-quota" label="Total kuota" value={draft.winner_quota} min={1} max={500} onChange={(value) => onChange({ winner_quota: value })} />
        <NumberField id="backup-per-draw" label="Cadangan per undi" value={draft.backup_per_draw} min={0} max={20} onChange={(value) => onChange({ backup_per_draw: value })} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
        Kuota lebih besar dari pemenang per undi berarti hadiah ini diundi beberapa kali.
        Cadangan ikut diundi bersamaan, dipakai bila pemenang utama tidak ada di tempat.
      </p>

      {draft.animation !== "instant" && <div className="mt-4">
        <label htmlFor="spin-seconds" className={labelClass}>Durasi animasi: {draft.spin_seconds.toFixed(1)} detik</label>
        <input id="spin-seconds" type="range" min={1} max={30} step={0.5} value={draft.spin_seconds} onChange={(event) => onChange({ spin_seconds: Number.parseFloat(event.target.value) })} className="mt-2 w-full accent-[var(--brand)]" />
      </div>}
    </div>

    {/* --- Sumber & syarat --- */}
    <div className="bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Siapa yang diundi</h3>

      <div className="mt-4 flex gap-2">
        {([["participants", "Ikut tab Peserta"], ["entries", "Daftar import"]] as const).map(([key, label]) => <button
          key={key}
          type="button"
          onClick={() => onChange({ source: key })}
          className={`min-h-11 flex-1 border px-3 text-xs font-semibold ${draft.source === key ? "border-[var(--brand)] bg-[#E8ECFB] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}
        >{label}</button>)}
      </div>

      {draft.source === "entries" ? <div className="mt-4">
        <label htmlFor="entry-group" className={labelClass}>Daftar yang diundi</label>
        <select id="entry-group" value={draft.entry_group_id ?? 0} onChange={(event) => onChange({ entry_group_id: Number(event.target.value) || null })} className={`${inputClass} mt-1.5`}>
          <option value={0}>Pilih daftar</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.entry_count} baris)</option>)}
        </select>
        {groups.length === 0 && <p className="mt-2 text-xs text-[var(--ink-muted)]">Belum ada daftar. Buat di tab &ldquo;Sumber data&rdquo;.</p>}
      </div> : <>
        <div className="mt-4">
          <p className={labelClass}>Syarat kelayakan</p>
          <div className="mt-2">
            <UndianConditionBuilder
              value={draft.conditions}
              participantTypes={preview?.participant_types ?? []}
              rsvpStatuses={preview?.rsvp_statuses ?? []}
              companies={preview?.companies ?? []}
              onChange={(next) => onChange({ conditions: next })}
            />
          </div>
        </div>

        {preview && <div className="mt-4 border border-[var(--brand)]/40 bg-[#E8ECFB] p-3">
          <p className="text-sm font-semibold tabular-nums text-[var(--brand-strong)]">
            {preview.available} nama siap diundi
          </p>
          {/* Rincian penyusutan kolam. Satu angka akhir tidak dapat diperiksa
              siapa pun; selisih yang terurai bisa — dan kalau salah satunya
              mengejutkan, panitia tahu persis di mana harus melihat. */}
          <ul className="mt-2 space-y-0.5 text-xs tabular-nums text-[var(--brand-strong)]/80">
            <li>{preview.total_participants} peserta aktif</li>
            {preview.breakdown.failed_conditions > 0 && <li>− {preview.breakdown.failed_conditions} tidak memenuhi syarat</li>}
            {preview.breakdown.by_rules > 0 && <li>
              − {preview.breakdown.by_rules} kena aturan pengecualian
              {preview.breakdown.rule_hits.length > 0 && <span className="text-[var(--brand-strong)]/60">
                {" "}({preview.breakdown.rule_hits.map((hit) => `${hit.rule_name}: ${hit.count}`).join(", ")})
              </span>}
            </li>}
            {preview.breakdown.by_manual > 0 && <li>− {preview.breakdown.by_manual} dikecualikan per orang</li>}
            {preview.breakdown.by_previous_wins > 0 && <li>− {preview.breakdown.by_previous_wins} sudah pernah menang</li>}
          </ul>
          {preview.max_tickets > 1 && <p className="mt-2 text-xs tabular-nums text-[var(--brand-strong)]/80">
            {preview.total_tickets} total tiket · peluang tertinggi {(preview.top_share * 100).toFixed(1)}%
          </p>}
          {preview.available === 0 && <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-[var(--danger)]">
            <Warning size={14} className="mt-0.5 shrink-0" /> Kolam kosong. Tombol undi akan ditolak.
          </p>}
          {preview.sample.length > 0 && <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--brand-strong)]">Lihat contoh nama</summary>
            <ul className="mt-2 space-y-1 text-xs text-[var(--brand-strong)]/80">
              {preview.sample.map((row, index) => <li key={index} className="tabular-nums">
                {row.name}{row.company ? ` — ${row.company}` : ""}
                {row.tickets > 1 && ` (${row.tickets} tiket)`}
              </li>)}
            </ul>
          </details>}
        </div>}
      </>}

      <div className="mt-4">
        <label htmlFor="exclude-scope" className={labelClass}>Boleh menang lagi?</label>
        <select id="exclude-scope" value={draft.exclude_scope} onChange={(event) => onChange({ exclude_scope: event.target.value as ExcludeScope })} className={`${inputClass} mt-1.5`}>
          {Object.entries(EXCLUDE_SCOPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
    </div>

    {/* --- Bobot --- */}
    {draft.source === "participants" && <div className="bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Peluang menang</h3>

      <div className="mt-4 flex gap-2">
        {([["equal", "Semua sama rata"], ["formula", "Berbobot"]] as const).map(([key, label]) => <button
          key={key}
          type="button"
          onClick={() => onChange({ weight_mode: key })}
          className={`min-h-11 flex-1 border px-3 text-xs font-semibold ${draft.weight_mode === key ? "border-[var(--brand)] bg-[#E8ECFB] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}
        >{label}</button>)}
      </div>

      {draft.weight_mode === "formula" && <>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="weight-var" className={labelClass}>Dasar bobot</label>
            <select id="weight-var" value={draft.weight_var} onChange={(event) => onChange({ weight_var: event.target.value as WeightVar })} className={`${inputClass} mt-1.5`}>
              {Object.entries(WEIGHT_VAR_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="weight-divisor" className={labelClass}>Setiap berapa dapat 1 tiket tambahan</label>
            <input
              id="weight-divisor"
              value={rupiah(draft.weight_divisor)}
              onChange={(event) => onChange({ weight_divisor: Number(digitsOnly(event.target.value)) || 1 })}
              inputMode="numeric"
              className={`${inputClass} mt-1.5 tabular-nums`}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField id="weight-base" label="Tiket dasar" value={draft.weight_base} min={0} max={100} onChange={(value) => onChange({ weight_base: value })} />
            <NumberField id="weight-max" label="Tiket maksimum" value={draft.weight_max} min={1} max={1000} onChange={(value) => onChange({ weight_max: value })} />
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-muted)]">
          Tiket = {draft.weight_base} + ({WEIGHT_VAR_LABEL[draft.weight_var].toLowerCase()} ÷ {rupiah(draft.weight_divisor)}), maksimal {draft.weight_max}.
          Batas maksimum menjaga satu peserta dengan angka ekstrem tidak menguasai kolam.
        </p>
      </>}
    </div>}

    <div className="flex flex-wrap gap-2 bg-[var(--surface)] p-5">
      <button type="button" onClick={onSave} disabled={saving} className="flex min-h-12 flex-1 items-center justify-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-60">
        <FloppyDisk size={18} /> {saving ? "Menyimpan..." : "Simpan hadiah"}
      </button>
      <button type="button" onClick={onClose} className="min-h-12 border border-[var(--line)] px-5 text-sm font-semibold">Tutup</button>
      <label className="flex min-h-12 cursor-pointer items-center gap-2 border border-[var(--line)] px-4 text-sm">
        <input type="checkbox" checked={draft.is_active} onChange={(event) => onChange({ is_active: event.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
        Aktif
      </label>
    </div>
  </section>;
}

function NumberField({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div>
    <label htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">{label}</label>
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        onChange(Number.isFinite(next) ? Math.max(min, Math.min(max, next)) : min);
      }}
      className="mt-1.5 h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]"
    />
  </div>;
}

// ===========================================================================
// Tab tampilan
// ===========================================================================

function DisplayTab({
  settings, branding, saving, uploading, onChange, onSave, onUpload,
}: {
  settings: Settings; branding: Branding; saving: boolean; uploading: boolean;
  onChange: (changes: Partial<Settings>) => void; onSave: () => void; onUpload: (file: File) => void;
}) {
  const inputClass = "h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]";
  const labelClass = "text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]";

  return <div className="mt-6 space-y-px border border-[var(--line)] bg-[var(--line)]">
    <section className="bg-[var(--surface)] p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Judul layar</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="page-title" className={labelClass}>Judul</label>
          <input id="page-title" value={settings.page_title} onChange={(event) => onChange({ page_title: event.target.value })} className={`${inputClass} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="page-subtitle" className={labelClass}>Sub judul</label>
          <input id="page-subtitle" value={settings.page_subtitle ?? ""} onChange={(event) => onChange({ page_subtitle: event.target.value || null })} className={`${inputClass} mt-1.5`} placeholder="Opsional" />
        </div>
      </div>
    </section>

    <section className="bg-[var(--surface)] p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Nama pemenang</h2>

      <div className="mt-4 flex gap-2">
        {([["full", "Selalu nama lengkap"], ["follow_event", "Ikut aturan privasi acara"]] as const).map(([key, label]) => <button
          key={key}
          type="button"
          onClick={() => onChange({ name_display: key })}
          className={`min-h-11 flex-1 border px-3 text-xs font-semibold ${settings.name_display === key ? "border-[var(--brand)] bg-[#E8ECFB] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}
        >{label}</button>)}
      </div>

      {settings.name_display === "follow_event" && <p className="mt-3 flex items-start gap-2 border border-[#D9A400] bg-[#FFF8E6] p-3 text-xs leading-relaxed text-[#7A5B00]">
        <Warning size={16} className="mt-0.5 shrink-0" />
        Aturan privasi acara dapat menyamarkan nama menjadi inisial atau nama perusahaan saja.
        Untuk undian, MC biasanya perlu memanggil nama lengkap ke atas panggung — pastikan ini memang yang diinginkan.
      </p>}

      <div className="mt-4 flex flex-wrap gap-4">
        {([
          ["show_company", "Tampilkan perusahaan"],
          ["show_seat", "Tampilkan nomor kursi"],
        ] as const).map(([key, label]) => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={settings[key]} onChange={(event) => onChange({ [key]: event.target.checked } as Partial<Settings>)} className="h-4 w-4 accent-[var(--brand)]" />
          {label}
        </label>)}
      </div>
    </section>

    <section className="bg-[var(--surface)] p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Efek panggung</h2>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.sound_enabled} onChange={(event) => onChange({ sound_enabled: event.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
          <SpeakerHigh size={16} /> Suara
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.confetti_enabled} onChange={(event) => onChange({ confetti_enabled: event.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
          <Confetti size={16} /> Confetti
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
        Matikan suara bila sound system venue sudah memutar musik sendiri, dan confetti bila mengganggu kamera live streaming.
      </p>

      <div className="mt-4">
        <label htmlFor="reveal-delay" className={labelClass}>Jeda sebelum nama terbaca: {settings.reveal_delay_seconds.toFixed(1)} detik</label>
        <input id="reveal-delay" type="range" min={0} max={5} step={0.5} value={settings.reveal_delay_seconds} onChange={(event) => onChange({ reveal_delay_seconds: Number.parseFloat(event.target.value) })} className="mt-2 w-full accent-[var(--brand)]" />
        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">Waktu tambahan setelah animasi berhenti, memberi MC kesempatan menarik napas.</p>
      </div>
    </section>

    <section className="bg-[var(--surface)] p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Warna & latar</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {([
          ["background_color", "Latar", FALLBACK.background_color],
          ["text_color", "Teks", FALLBACK.text_color],
          ["accent_color", "Aksen", FALLBACK.accent_color],
        ] as const).map(([key, label, fallback]) => <div key={key}>
          <div className="flex items-center justify-between">
            <label htmlFor={`color-${key}`} className={labelClass}>{label}</label>
            {settings[key] && <button type="button" onClick={() => onChange({ [key]: null } as Partial<Settings>)} className="min-h-8 text-[11px] font-semibold text-[var(--brand)]">Reset</button>}
          </div>
          <input id={`color-${key}`} type="color" value={settings[key] ?? fallback} onChange={(event) => onChange({ [key]: event.target.value } as Partial<Settings>)} className="mt-1.5 h-11 w-full cursor-pointer border border-[var(--line)] bg-[var(--background)] px-1" />
        </div>)}
      </div>

      <div className="mt-4">
        <p className={labelClass}>Gambar latar</p>
        <div className="mt-1.5 flex items-center gap-2">
          <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
            <UploadSimple size={15} /> {uploading ? "Mengunggah..." : settings.background_image_url ? "Ganti gambar" : "Unggah gambar"}
            <input type="file" accept="image/*" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file);
            }} />
          </label>
          {settings.background_image_url && <button type="button" onClick={() => onChange({ background_image_url: null })} className="min-h-11 border border-[var(--line)] px-3 text-xs font-semibold text-[var(--danger)]">Hapus</button>}
        </div>

        {/* Pratinjau latar dibuat lebar dan memakai `cover`, meniru cara gambar
            ini benar-benar dipakai di layar panggung. Kotak kecil `contain` akan
            menyembunyikan bagian yang justru akan terpotong di proyektor. */}
        {settings.background_image_url && <div className="mt-3">
          <ImagePreview
            url={settings.background_image_url}
            alt="Pratinjau gambar latar"
            fit="cover"
            className="aspect-video h-auto w-full max-w-md"
            showUrl
          />
        </div>}
      </div>
    </section>

    <section className="bg-[var(--surface)] p-6">
      <BrandingEditor
        value={branding}
        onChange={(changes) => onChange(changes as Partial<Settings>)}
        idPrefix="undian"
        baseTextColor={settings.text_color ?? FALLBACK.text_color}
        baseBackgroundColor={settings.background_color ?? FALLBACK.background_color}
        baseAccentColor={settings.accent_color ?? FALLBACK.accent_color}
      />
    </section>

    <div className="bg-[var(--surface)] p-6">
      <button type="button" onClick={onSave} disabled={saving} className="flex min-h-12 items-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-6 text-sm font-semibold text-white disabled:opacity-60">
        <FloppyDisk size={18} /> {saving ? "Menyimpan..." : "Simpan tampilan"}
      </button>
    </div>
  </div>;
}

// ===========================================================================
// Tab sumber data
// ===========================================================================

function DataTab({
  groups, exclusions, prizes, importName, importText, importFile, importing,
  onImportName, onImportText, onImportFile, onImport, onDeleteGroup, onRemoveExclusion, onRulesChanged,
}: {
  groups: EntryGroup[]; exclusions: Exclusion[]; prizes: UndianPrize[];
  importName: string; importText: string; importFile: File | null; importing: boolean;
  onImportName: (value: string) => void; onImportText: (value: string) => void;
  onImportFile: (file: File | null) => void;
  onImport: () => void; onDeleteGroup: (id: number) => void; onRemoveExclusion: (id: string) => void;
  onRulesChanged: () => void;
}) {
  const inputClass = "h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]";

  return <div className="mt-6 space-y-6">
    {/* Aturan diletakkan paling atas dan selebar halaman.
        Ia menyaring puluhan orang sekaligus, sementara dua kartu di bawahnya
        menangani kasus satuan. Menaruhnya berdampingan dalam dua kolom membuat
        keduanya terbaca setara, padahal yang satu berdampak jauh lebih luas. */}
    <ExclusionRuleManager
      prizes={prizes.map((prize) => ({ id: prize.id, name: prize.name }))}
      onChanged={onRulesChanged}
    />

    <div className="grid gap-6 lg:grid-cols-2">
    <section className="space-y-px self-start border border-[var(--line)] bg-[var(--line)]">
      <div className="bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Import daftar</h2>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--ink-muted)]">
              Untuk yang tidak terdaftar sebagai peserta: kupon fisik, daftar sponsor, atau nomor kursi.
            </p>
          </div>
          {/* Templat ditaruh di ATAS form, bukan di bawah.
              Panitia yang belum punya berkas harus menemukannya sebelum mulai
              mengetik, bukan setelah selesai menyusun format sendiri.

              `<a download>` biasa, bukan next/link: ini unduhan berkas, bukan
              navigasi halaman. next/link akan melakukan navigasi sisi klien dan
              berkasnya tidak pernah tersimpan. */}
          <a
            href="/api/admin/undian/entries/template"
            download
            className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            <DownloadSimple size={15} /> Unduh templat
          </a>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="import-name" className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Nama daftar</label>
            <input id="import-name" value={importName} onChange={(event) => onImportName(event.target.value)} className={`${inputClass} mt-1.5`} placeholder="Kupon Sesi Siang" />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Unggah berkas</p>
            <div className="mt-1.5 flex items-center gap-2">
              <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 border border-dashed border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
                <UploadSimple size={15} />
                {importFile ? importFile.name : "Pilih berkas .xlsx, .csv, atau .txt"}
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.csv,.txt,.tsv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    // Nilai input dikosongkan supaya memilih berkas yang sama dua
                    // kali berturut-turut tetap memicu onChange.
                    event.target.value = "";
                    onImportFile(file);
                  }}
                />
              </label>
              {importFile && <button type="button" onClick={() => onImportFile(null)} className="min-h-11 border border-[var(--line)] px-3 text-xs font-semibold text-[var(--danger)]">Hapus</button>}
            </div>
            {importFile && <p className="mt-1.5 text-[11px] text-[var(--ink-muted)]">
              Berkas dibaca di server saat tombol ditekan. Kotak teks di bawah diabaikan.
            </p>}
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--line)]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">atau tempel</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <div>
            <label htmlFor="import-text" className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Isi daftar</label>
            <textarea
              id="import-text"
              value={importText}
              onChange={(event) => onImportText(event.target.value)}
              rows={6}
              disabled={importFile !== null}
              className="mt-1.5 w-full border border-[var(--line)] bg-[var(--background)] p-3 font-mono text-xs outline-none focus:border-[var(--brand)] disabled:opacity-45"
              placeholder={"Nama,Perusahaan,Kode,Bobot\nBudi Santoso,PT Maju,K-001,1\nSiti Rahayu,PT Jaya,K-002,3"}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-muted)]">
              Tempel langsung dari Excel, atau satu nama per baris. Kolom yang dikenali: nama, perusahaan, kode, bobot.
              Hanya kolom nama yang wajib.
            </p>
          </div>

          <button type="button" onClick={onImport} disabled={importing} className="flex min-h-12 items-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-60">
            <Plus size={18} /> {importing ? "Mengimpor..." : "Buat daftar"}
          </button>
        </div>
      </div>

      {groups.length > 0 && <div className="bg-[var(--surface)] p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Daftar tersimpan</h3>
        <ul className="mt-3 space-y-2">
          {groups.map((group) => <li key={group.id} className="flex items-center justify-between gap-3 border border-[var(--line)] p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{group.name}</p>
              <p className="text-xs tabular-nums text-[var(--ink-muted)]">{group.entry_count} baris</p>
            </div>
            <button type="button" onClick={() => onDeleteGroup(group.id)} className="flex min-h-10 shrink-0 items-center gap-1.5 border border-[var(--line)] px-3 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)]">
              <Trash size={14} /> Hapus
            </button>
          </li>)}
        </ul>
      </div>}
    </section>

    <section className="space-y-px self-start border border-[var(--line)] bg-[var(--line)]">
      <div className="bg-[var(--surface)] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
          <Prohibit size={16} /> Pengecualian per orang
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--ink-muted)]">
          Untuk kasus yang tidak punya pola — mis. satu orang yang kebetulan jadi MC malam ini.
          Yang punya pola sebaiknya dibuat sebagai aturan di atas, supaya peserta baru hasil sinkronisasi ikut tersaring.
          Tambahkan lewat tombol di halaman <Link href="/admin/participants" className="font-semibold text-[var(--brand)] underline">Peserta</Link>.
        </p>

        {exclusions.length === 0 ? <p className="mt-4 border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-muted)]">
          Belum ada peserta yang dikecualikan satu per satu.
        </p> : <ul className="mt-4 space-y-2">
          {exclusions.map((item) => <li key={item.participant_id} className="flex items-center justify-between gap-3 border border-[var(--line)] p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="truncate text-xs text-[var(--ink-muted)]">{item.company ?? "—"}{item.reason ? ` · ${item.reason}` : ""}</p>
            </div>
            <button type="button" onClick={() => onRemoveExclusion(item.participant_id)} className="min-h-10 shrink-0 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
              Ikutkan lagi
            </button>
          </li>)}
        </ul>}
      </div>
    </section>
    </div>
  </div>;
}
