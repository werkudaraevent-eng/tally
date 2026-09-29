"use client";

import {
  ArrowSquareOut, CaretDown, CheckCircle, Gift, LockSimple, Plus, SlidersHorizontal, Warning, X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { ImagePreview } from "@/components/admin/image-preview";
import { ExclusionRuleManager } from "@/components/admin/undian-exclusion-rules";
import { SessionHistory } from "@/components/admin/undian-session-history";
import { useToast } from "@/components/toast";
import { normalizeBranding } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
import { ANIMATIONS, EMPTY_CONDITIONS, describeConditions, normalizePrize, type UndianPrize } from "@/lib/undian";
import { undianCanRun, undianReadiness, type ReadinessStep, type ReadinessTab } from "@/lib/undian-readiness";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, IconButton, ListDetail, ListRow, MetaSeparator, PageLoading, Pane, PaneBody,
  PaneFooter, PaneHeader, StatusChip, StatusDot, Tabs, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { DisplaySettings } from "./display-settings";
import { EntryLists } from "./entry-lists";
import { PrizeEditor } from "./prize-editor";
import type { EntryGroup, Exclusion, PoolStat, Preview, Settings } from "./types";

// CMS Undian.
//
// Halaman ini mengurus KONFIGURASI. Menjalankan undian di atas panggung ada di
// /admin/undian/kontrol, dan pemisahan itu disengaja: halaman ini padat oleh form
// dan mudah tergeser saat digulir, sementara halaman kontrol harus bisa dioperasikan
// tanpa melihat layar terlalu lama karena operatornya sedang berdiri di samping MC.
//
// Susunan: kepala halaman dengan satu aksi utama (buka panel operator), baris
// kesiapan yang terlipat, lalu tab untuk lima kumpulan konten yang setara. Tab
// hadiah, aturan, daftar import, dan sesi memakai list-detail: daftar selebar
// halaman, panel detail muncul di kanan hanya saat satu baris dibuka.

/** Tab halaman. Empat di antaranya sama dengan tab yang ditunjuk daftar kesiapan. */
type Tab = ReadinessTab | "rules";

function newPrizeDraft(): Omit<UndianPrize, "id"> {
  return {
    name: "", description: null, image_url: null, sponsor_name: null,
    winners_per_draw: 1, winner_quota: 1, backup_per_draw: 0,
    animation: "wheel", spin_mode: "timed", spin_seconds: 6,
    source: "participants", entry_group_id: null,
    conditions: EMPTY_CONDITIONS, exclude_scope: "all_prizes",
    weight_mode: "equal", weight_var: "total_spend", weight_divisor: 500000, weight_base: 1, weight_max: 10,
    sort_order: 0, is_active: true,
  };
}

export default function UndianAdminPage() {
  const [tab, setTab] = useState<Tab>("prizes");
  const [prizes, setPrizes] = useState<UndianPrize[]>([]);
  const [winnerCounts, setWinnerCounts] = useState<Record<number, number>>({});
  const [pools, setPools] = useState<Record<number, PoolStat>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [groups, setGroups] = useState<EntryGroup[]>([]);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Omit<UndianPrize, "id">>(newPrizeDraft);
  const [savingPrize, setSavingPrize] = useState(false);
  const [confirmPrize, setConfirmPrize] = useState<UndianPrize | null>(null);
  const [deletingPrize, setDeletingPrize] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [uploadingPrizeImage, setUploadingPrizeImage] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  // Sesi aktif dan jumlah hasil yang belum bersesi.
  //
  // Dipakai tab hadiah untuk menjelaskan label kuota. Tanpa itu, "kuota penuh"
  // pada hadiah yang ingin diundi lagi di sesi baru terbaca sebagai buntu, dan
  // tidak ada apa pun di layar yang memberi tahu bahwa jawabannya adalah menutup
  // sesi, bukan membuat hadiah baru.
  const [activeSession, setActiveSession] = useState<{ id: number; name: string } | null>(null);
  const [orphanWinners, setOrphanWinners] = useState(0);
  // Hapus permanen hanya untuk pemilik sistem. Server juga menolaknya lewat
  // requireUser(["super_admin"]); menyembunyikan tombolnya agar klien tidak
  // menemui aksi yang pasti gagal. Pola yang sama dipakai <AdminShell>.
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function load() {
    try {
      const [prizeResponse, settingsResponse, groupResponse, exclusionResponse, sessionResponse] = await Promise.all([
        fetch("/api/admin/undian/prizes?pool=1", { cache: "no-store" }),
        fetch("/api/admin/undian/settings", { cache: "no-store" }),
        fetch("/api/admin/undian/entries", { cache: "no-store" }),
        fetch("/api/admin/undian/exclusions", { cache: "no-store" }),
        fetch("/api/admin/undian/sessions", { cache: "no-store" }),
      ]);
      if (!prizeResponse.ok) {
        // Pesan server dibawa apa adanya: 403 "tidak punya akses" bukan masalah
        // koneksi, dan menyuruh memeriksa koneksi membuat orang mencari di tempat salah.
        const body = await prizeResponse.json().catch(() => null);
        setLoadFailed(true); setError(body?.error?.message ?? "Data undian gagal dimuat.");
        return;
      }
      setLoadFailed(false);
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
    } catch {
      setLoadFailed(true); setError("Koneksi terputus. Data undian gagal dimuat.");
    } finally {
      setLoaded(true);
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
        }).catch(() => null);
        if (response?.ok) { setPreview((await response.json()) as Preview); setPreviewFailed(false); }
        else setPreviewFailed(true);
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
    setPreviewFailed(false);
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
    setDeletingPrize(true);
    const response = await fetch(`/api/admin/undian/prizes/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setDeletingPrize(false);
    setConfirmPrize(null);
    if (!response.ok) {
      const failure = failureMessage(data, "Hadiah gagal dihapus.");
      setError(failure); toast.error("Hadiah gagal dihapus", failure); return;
    }
    if (editingId === id) setEditingId(null);
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
    setImportName(""); setImportText(""); setImportFile(null); setImportOpen(false);
    await load();
    toast.success("Daftar terimpor", `${data.entry_count} baris terbaca.`);
  }

  async function deleteGroup(id: number) {
    const response = await fetch(`/api/admin/undian/entries/${id}`, { method: "DELETE" });
    if (!response.ok) { toast.error("Daftar gagal dihapus"); return; }
    await load();
    toast.success("Daftar dihapus");
  }

  // Dihitung dari data yang SUDAH dimuat halaman ini, tanpa permintaan tambahan.
  // `pools` datang dari /prizes?pool=1 dan sudah memuat jumlah kandidat per hadiah.
  const readiness = useMemo(() => undianReadiness({
    prizes: prizes.map((prize) => ({
      id: prize.id, name: prize.name, is_active: prize.is_active,
      winner_quota: prize.winner_quota, source: prize.source, entry_group_id: prize.entry_group_id,
    })),
    pools, groups, activeSession, pageTitle: settings?.page_title ?? null,
  }), [prizes, pools, groups, activeSession, settings?.page_title]);
  const canRun = loaded && !loadFailed && undianCanRun(readiness);

  async function removeExclusion(participantId: string) {
    const response = await fetch(`/api/admin/undian/exclusions?participant_id=${participantId}`, { method: "DELETE" });
    if (!response.ok) { toast.error("Gagal mengembalikan peserta"); return; }
    await load();
    toast.success("Peserta kembali ikut undian");
  }

  function goTo(next: Tab) {
    setTab(next);
    setError("");
  }

  // Galat formulir tampil di dalam panel yang sedang terbuka, bukan di pita
  // halaman yang jauh dari tombol yang baru ditekan.
  const errorInPane = (tab === "prizes" && editingId !== null) || (tab === "data" && importOpen);

  const anyQuotaFull = prizes.some((prize) => (winnerCounts[prize.id] ?? 0) >= prize.winner_quota);

  // ---- Tab hadiah -----------------------------------------------------------
  const prizeList = (
    <Pane aria-label="Daftar hadiah">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Hadiah</h2>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={editingId === "new"} onClick={() => openEditor(null)}>Hadiah baru</Button>
      </PaneHeader>
      <PaneBody>
        {!loaded ? <PageLoading /> : loadFailed ? (
          <EmptyState
            plain
            icon={<Warning size={40} />}
            title="Data undian gagal dimuat"
            description={error || "Periksa koneksi, lalu coba lagi."}
            action={<Button variant="outlined" size="sm" onClick={() => void load()}>Coba lagi</Button>}
          />
        ) : prizes.length === 0 ? (
          <EmptyState
            plain
            icon={<Gift size={40} />}
            title="Belum ada hadiah"
            description="Tambahkan hadiah pertama, lalu atur siapa yang berhak diundi untuknya."
            action={editingId === "new" ? undefined : <Button size="sm" icon={<Plus size={16} />} onClick={() => openEditor(null)}>Hadiah baru</Button>}
          />
        ) : prizes.map((prize) => {
          const pool = pools[prize.id];
          const won = winnerCounts[prize.id] ?? 0;
          const full = won >= prize.winner_quota;
          const selected = editingId === prize.id;
          const syarat = prize.source === "entries"
            ? `daftar "${groups.find((group) => group.id === prize.entry_group_id)?.name ?? "belum dipilih"}"`
            : describeConditions(prize.conditions);
          return (
            <ListRow
              key={prize.id}
              selected={selected}
              onSelect={() => { if (selected) setEditingId(null); else openEditor(prize); }}
              className="items-start"
            >
              {prize.image_url
                ? <ImagePreview url={prize.image_url} alt="" className="h-10 w-10 shrink-0" />
                : <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-container-high text-on-surface-variant"><Gift size={18} /></span>}
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate font-medium", !prize.is_active && "text-on-surface-variant")}>{prize.name || "Tanpa nama"}</span>
                <span className="block truncate text-on-surface-variant">
                  {[
                    prize.sponsor_name,
                    ANIMATIONS.find((item) => item.value === prize.animation)?.label,
                    `${prize.winners_per_draw} per undi${prize.backup_per_draw > 0 ? ` + ${prize.backup_per_draw} cadangan` : ""}`,
                  ].filter(Boolean).join(" · ")}
                </span>
                <span className="block truncate text-on-surface-variant" title={`Syarat: ${syarat}`}>Syarat: {syarat}</span>
                {/* Kesalahan konfigurasi yang paling mudah terlewat: pemenang per
                    undi lebih besar dari kuotanya. Sistem menjepitnya saat mengundi,
                    tapi tanpa peringatan panitia mengira akan keluar sepuluh nama
                    dan hanya satu yang muncul di panggung. */}
                {prize.winners_per_draw > prize.winner_quota ? (
                  <span className="mt-0.5 flex items-start gap-1 font-medium text-warning">
                    <Warning size={14} className="mt-1 shrink-0" aria-hidden />
                    {prize.winners_per_draw} per undi melebihi kuota {prize.winner_quota}. Hanya {prize.winner_quota} nama yang akan keluar.
                  </span>
                ) : null}
              </span>
              <span className="hidden w-32 shrink-0 text-right tabular-nums sm:block">
                <span className="block">{won} / {prize.winner_quota}</span>
                <span
                  className="block text-on-surface-variant"
                  title={pool && pool.eligible !== pool.candidates ? `${pool.eligible - pool.candidates} sudah menang di sesi yang masih terbuka` : undefined}
                >
                  {pool ? `${pool.candidates} nama siap` : "Kolam belum dihitung"}
                </span>
              </span>
              <span className="flex shrink-0 justify-end sm:w-36">
                {!prize.is_active ? <StatusChip>Nonaktif</StatusChip>
                  // "Penuh di sesi ini", bukan "Kuota penuh". Tanpa keterangan
                  // sesi, label ini terbaca sebagai hadiah yang habis selamanya,
                  // lalu panitia membuat hadiah duplikat padahal cukup menutup sesi.
                  : full ? <StatusChip dot>{activeSession ? "Penuh di sesi ini" : "Kuota penuh"}</StatusChip>
                    : pool && pool.candidates === 0 ? <StatusChip dot tone="error">Kolam kosong</StatusChip>
                      : pool ? <StatusChip dot tone="success">Siap</StatusChip> : null}
              </span>
            </ListRow>
          );
        })}
      </PaneBody>
      {/* Konteks sesi. Angka pemenang selalu dihitung dalam lingkup sesi yang
          sedang berjalan, dan tanpa keterangan ini "kuota penuh" terbaca sebagai
          buntu permanen, padahal jalan keluarnya adalah menutup sesi. */}
      {/* Saat data gagal dimuat, status sesi tidak diketahui: jangan klaim "belum ada sesi". */}
      {loadFailed ? null : <PaneFooter
        className="bg-surface-container-lowest py-2"
        note={
          // Titik di kolomnya sendiri, teks dan tautan mengalir di sebelahnya: dengan
          // flex-wrap, di layar sempit titiknya tertinggal sendirian di baris atas.
          <span className="flex items-baseline gap-2">
            <span className="flex h-[1lh] items-center"><StatusDot tone={activeSession ? "success" : "neutral"} /></span>
            <span className="min-w-0">
              {activeSession ? <>Kuota dihitung untuk sesi {activeSession.name}</> : "Belum ada sesi berjalan; hasil tidak terkelompok"}{" "}
              <button type="button" onClick={() => goTo("history")} className="rounded-sm font-medium text-primary hover:underline">
                {activeSession ? "Kelola sesi" : "Mulai sesi"}
              </button>
            </span>
          </span>
        }
      />}
    </Pane>
  );

  const prizeDetail = editingId !== null ? (
    <PrizeEditor
      draft={draft}
      isNew={editingId === "new"}
      groups={groups}
      preview={preview}
      previewFailed={previewFailed}
      saving={savingPrize}
      uploading={uploadingPrizeImage}
      error={errorInPane ? error : ""}
      onChange={updateDraft}
      onSave={() => void savePrize()}
      onClose={() => { setEditingId(null); setError(""); }}
      onUpload={(file) => void uploadImage(file, "prize")}
      onDelete={typeof editingId === "number" ? () => setConfirmPrize(prizes.find((prize) => prize.id === editingId) ?? null) : undefined}
    />
  ) : null;

  const tabs: { value: Tab; label: string; badge?: number }[] = [
    { value: "prizes", label: "Hadiah", badge: loaded && !loadFailed ? prizes.length : undefined },
    { value: "rules", label: "Aturan pengecualian" },
    { value: "data", label: "Daftar import", badge: loaded && !loadFailed ? groups.length : undefined },
    { value: "display", label: "Tampilan panggung" },
    { value: "history", label: "Sesi & hasil" },
  ];

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={loadFailed ? <span>Status undian tidak diketahui</span> : loaded ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={canRun ? "success" : "error"} />
              {canRun ? "Siap dijalankan" : "Belum bisa dijalankan"}
            </span>
            <MetaSeparator />
            <span>{activeSession ? `Sesi berjalan: ${activeSession.name}` : "Belum ada sesi berjalan"}</span>
          </>
        ) : <span>Memuat undian</span>}
        actions={
          <>
            <ButtonLink href="/undian" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Layar panggung</ButtonLink>
            {/* Tombol mati, bukan tautan yang dinonaktifkan lewat CSS: <a> tetap
                bisa diklik dan dibuka lewat papan ketik, dan panel operator yang
                terbuka pada undian tanpa kandidat justru gagal di layar yang paling
                tidak boleh gagal. Alasannya tertulis di baris kesiapan. */}
            {canRun
              ? <ButtonLink href="/admin/undian/kontrol" icon={<SlidersHorizontal size={16} />}>Buka panel operator</ButtonLink>
              : <Button disabled icon={<LockSimple size={16} />}>Buka panel operator</Button>}
          </>
        }
      />

      {loaded && !loadFailed ? <ReadinessBar steps={readiness} canRun={canRun} onGo={goTo} /> : null}

      {error && !errorInPane && !loadFailed ? (
        <Banner tone="error" icon={<Warning size={18} />} className="shrink-0" actions={<IconButton size="sm" label="Tutup pesan" onClick={() => setError("")}><X size={16} /></IconButton>}>{error}</Banner>
      ) : null}

      <Tabs<Tab> label="Bagian undian" idPrefix="undian" value={tab} onChange={goTo} options={tabs} />

      <div role="tabpanel" id={`undian-panel-${tab}`} aria-labelledby={`undian-tab-${tab}`} className="flex min-h-0 flex-1 flex-col gap-4">
        {tab === "prizes" ? (
          <>
            {/* Hasil yang belum bersesi tidak akan pernah lepas dari kolam: tidak
                ada sesi yang bisa ditutup untuk membebaskannya. */}
            {orphanWinners > 0 ? (
              <Banner tone="warning" icon={<Warning size={18} />} className="shrink-0" actions={<Button variant="outlined" size="sm" onClick={() => goTo("history")}>Buka Sesi & hasil</Button>}>
                Ada <span className="font-medium">{orphanWinners} pemenang lama</span> yang belum masuk sesi mana pun, jadi mereka tidak bisa dibebaskan lewat tutup sesi. Arsipkan di tab Sesi & hasil.
              </Banner>
            ) : null}
            {/* Petunjuk hanya muncul ketika keadaannya benar-benar terjadi.
                Menampilkannya terus-menerus membuatnya jadi latar yang tidak
                dibaca siapa pun. */}
            {anyQuotaFull ? (
              <Banner tone="info" className="shrink-0">
                Untuk mengundi hadiah yang kuotanya penuh pada sesi berikutnya, <span className="font-medium">tutup sesi sekarang lalu mulai sesi baru</span>. Hadiah yang sama dipakai lagi, tidak perlu dibuat ulang; kuota dan daftar pemenang dihitung ulang per sesi.
              </Banner>
            ) : null}
            <ListDetail list={prizeList} detail={prizeDetail} detailWidth={560} />
          </>
        ) : null}

        {tab === "rules" ? (
          <ExclusionRuleManager
            prizes={prizes.map((prize) => ({ id: prize.id, name: prize.name }))}
            exclusions={exclusions}
            onRemoveExclusion={removeExclusion}
            onChanged={() => { void load(); }}
          />
        ) : null}

        {tab === "data" ? (
          <EntryLists
            groups={groups} loaded={loaded} loadFailed={loadFailed}
            open={importOpen} onOpen={() => { setImportOpen(true); setError(""); }} onClose={() => { setImportOpen(false); setError(""); }}
            importName={importName} importText={importText} importFile={importFile} importing={importing} error={errorInPane ? error : ""}
            onImportName={setImportName} onImportText={setImportText} onImportFile={setImportFile}
            onImport={() => void importEntries()} onDeleteGroup={deleteGroup}
          />
        ) : null}

        {tab === "display" ? (
          settings && branding ? (
            <DisplaySettings
              settings={settings} branding={branding} saving={savingSettings} uploading={uploadingBackground}
              onChange={updateSettings} onSave={() => void saveSettings()} onUpload={(file) => void uploadImage(file, "background")}
            />
          ) : !loaded ? <PageLoading /> : (
            <EmptyState
              icon={<Warning size={40} />}
              title="Setelan layar gagal dimuat"
              description="Periksa koneksi, lalu coba lagi."
              action={<Button variant="outlined" size="sm" onClick={() => void load()}>Coba lagi</Button>}
            />
          )
        ) : null}

        {/* Kuota hadiah dihitung per sesi aktif, jadi daftar hadiah harus dimuat
            ulang setiap kali sesi dibuka atau ditutup. Kalau tidak, label "kuota
            penuh" tertinggal pada keadaan sesi sebelumnya. */}
        {tab === "history" ? <SessionHistory isOwner={isOwner} onChanged={() => { void load(); }} /> : null}
      </div>

      <Dialog
        open={confirmPrize !== null}
        onClose={() => setConfirmPrize(null)}
        dismissible={!deletingPrize}
        tone="danger"
        title={`Hapus hadiah ${confirmPrize?.name || ""}?`}
        description="Hadiah yang masih punya pemenang (sah atau belum dikonfirmasi) tidak bisa dihapus. Catatan pemenang yang sudah dibatalkan untuk hadiah ini ikut terhapus. Penghapusan tercatat di jejak audit."
        actions={
          <>
            <Button variant="outlined" disabled={deletingPrize} onClick={() => setConfirmPrize(null)}>Batal</Button>
            <Button variant="danger" loading={deletingPrize} onClick={() => { if (confirmPrize) void deletePrize(confirmPrize.id); }}>Hapus hadiah</Button>
          </>
        }
      />
    </WorkspacePage>
  );
}

// ===========================================================================
// Baris kesiapan
// ===========================================================================

/**
 * Daftar periksa sebelum mengundi, terlipat menjadi satu baris.
 *
 * Dipilih ketimbang wizard bertahap. Wizard membantu sekali, pada penyiapan
 * pertama; sesudah itu ia menghalangi. Baris ini memberi urutan yang sama tanpa
 * memenjarakan kunjungan berikutnya, dan memaksa hanya di satu titik yang
 * benar-benar penting: pintu ke panel operator.
 *
 * Satu baris yang menyebut butir pertama yang belum beres cukup untuk kunjungan
 * sehari-hari; daftar lengkapnya dibuka bila perlu.
 */
function ReadinessBar({ steps, canRun, onGo }: {
  steps: ReadinessStep[];
  canRun: boolean;
  onGo: (tab: ReadinessTab) => void;
}) {
  const [open, setOpen] = useState(false);
  const pending = steps.filter((step) => !step.done);
  // Butir yang mengunci didahulukan: itulah yang membuat tombol panel operator mati.
  const pertama = pending.find((step) => step.blocking) ?? pending[0];

  return (
    <section aria-label="Kesiapan undian" className="shrink-0 rounded-lg border border-outline-variant bg-surface-container-lowest">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-body-medium">
        {canRun
          ? <CheckCircle size={18} className="shrink-0 text-success" aria-hidden />
          : <LockSimple size={18} className="shrink-0 text-error" aria-hidden />}
        <span className="font-medium tabular-nums">Kesiapan {steps.length - pending.length} dari {steps.length}</span>
        <span className="min-w-0 flex-1 truncate text-on-surface-variant">
          {pertama ? `${pertama.blocking ? "Wajib" : "Opsional"}: ${pertama.label.charAt(0).toLowerCase()}${pertama.label.slice(1)}` : "Semua butir beres"}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="daftar-kesiapan"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline"
        >
          {open ? "Sembunyikan" : "Lihat daftar"}
          <CaretDown size={14} aria-hidden className={cx(open && "rotate-180")} />
        </button>
      </div>

      {open ? (
        <ol id="daftar-kesiapan" className="max-h-72 overflow-y-auto border-t border-outline-variant">
          {steps.map((step, index) => (
            <li key={step.id} className="flex flex-wrap items-start gap-3 border-b border-outline-variant px-4 py-2.5 text-body-medium last:border-b-0">
              <span className={cx(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-label-medium font-medium tabular-nums",
                step.done ? "bg-success-soft text-on-success-container" : step.blocking ? "bg-error-soft text-error" : "bg-warning-soft text-warning",
              )}>
                {step.done ? <CheckCircle size={14} aria-label="Beres" /> : index + 1}
              </span>
              <div className="min-w-52 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {step.label}
                  {/* Label wajib/opsional ditulis pada butirnya sendiri, bukan hanya
                      tersirat dari warna: pembaca yang tidak membedakan merah dan
                      kuning tetap harus bisa tahu mana yang mengunci. */}
                  {!step.done ? <StatusChip tone={step.blocking ? "error" : "warning"}>{step.blocking ? "Wajib" : "Opsional"}</StatusChip> : null}
                </p>
                {step.detail ? <p className="text-on-surface-variant">{step.detail}</p> : null}
              </div>
              {!step.done ? <Button variant="outlined" size="sm" onClick={() => { onGo(step.tab); setOpen(false); }}>Bereskan</Button> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
