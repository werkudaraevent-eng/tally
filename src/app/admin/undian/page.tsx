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
    bonus_rules: [],
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
  const [sessionNames, setSessionNames] = useState<Record<number, string> | null>({});
  // Judul pertanyaan form untuk ringkasan syarat jawaban; tanpa daftar, kuncinya yang disebut.
  const [answerLabels, setAnswerLabels] = useState<Record<string, string> | undefined>(undefined);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
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
        setLoadFailed(true); setError(body?.error?.message ?? "Could not load lucky draw data.");
        return;
      }
      setLoadFailed(false);
      const data = await prizeResponse.json();
      setPrizes((data.prizes as Record<string, unknown>[]).map(normalizePrize));
      setWinnerCounts(data.winner_counts ?? {});
      setPools(data.pools ?? {});
      setAnswerLabels(Array.isArray(data.answer_fields) ? Object.fromEntries((data.answer_fields as { key: string; label: string }[]).map((item) => [item.key, item.label])) : undefined);
      setSessionNames(data.attendance_sessions === null ? null : Object.fromEntries(((data.attendance_sessions ?? []) as { id: number; name: string }[]).map((item) => [item.id, item.name])));
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
      setLoadFailed(true); setError("Connection lost. Could not load lucky draw data.");
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
            bonus_rules: draft.bonus_rules,
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
  }, [editingId, draft.conditions, draft.source, draft.weight_mode, draft.weight_var, draft.weight_divisor, draft.weight_base, draft.weight_max, draft.bonus_rules, previewRetry]);

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
    if (!draft.name.trim()) { setError("Enter a prize name."); return; }
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
      const failure = failureMessage(data, "Could not save prize.");
      setError(failure); toast.error("Could not save prize", failure); return;
    }
    setEditingId(null);
    await load();
    toast.success("Prize saved", isNew ? "The new prize is ready to draw." : "Changes apply to the next draw.");
  }

  async function deletePrize(id: number) {
    setDeletingPrize(true);
    const response = await fetch(`/api/admin/undian/prizes/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setDeletingPrize(false);
    setConfirmPrize(null);
    if (!response.ok) {
      const failure = failureMessage(data, "Could not delete prize.");
      setError(failure); toast.error("Could not delete prize", failure); return;
    }
    if (editingId === id) setEditingId(null);
    await load();
    toast.success("Prize deleted");
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
      const failure = failureMessage(data, "Could not save settings.");
      setError(failure); toast.error("Could not save settings", failure); return;
    }
    const raw = data as Record<string, unknown>;
    setSettings({ ...(raw as unknown as Settings), ...normalizeBranding(raw), reveal_delay_seconds: Number(raw.reveal_delay_seconds ?? 0) });
    toast.success("Settings saved", "The draw screen will update in a few seconds.");
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
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Could not upload image.";
      setError(failure); toast.error("Could not upload image", failure); return;
    }
    if (target === "background") updateSettings({ background_image_url: data.url });
    else updateDraft({ image_url: data.url });
    toast.info("Image uploaded", "Click Save to apply it.");
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
    if (!importName.trim()) { setError("Enter an entry list name."); return; }
    if (!importFile && !importText.trim()) { setError("Choose a file or paste the list."); return; }

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
      const failure = failureMessage(data, "Import failed.");
      setError(failure); toast.error("Import failed", failure); return;
    }
    setImportName(""); setImportText(""); setImportFile(null); setImportOpen(false);
    await load();
    toast.success("Entry list imported", `${data.entry_count} ${data.entry_count === 1 ? "row" : "rows"} read.`);
  }

  async function deleteGroup(id: number) {
    const response = await fetch(`/api/admin/undian/entries/${id}`, { method: "DELETE" });
    if (!response.ok) { toast.error("Could not delete entry list"); return; }
    await load();
    toast.success("Entry list deleted");
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
    if (!response.ok) { toast.error("Could not restore participant"); return; }
    await load();
    toast.success("Participant restored to the draw");
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
    <Pane aria-label="Prize list">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Prizes</h2>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={editingId === "new"} onClick={() => openEditor(null)}>New prize</Button>
      </PaneHeader>
      <PaneBody>
        {!loaded ? <PageLoading /> : loadFailed ? (
          <EmptyState
            plain
            icon={<Warning size={40} />}
            title="Could not load lucky draw data"
            description={error || "Check your connection, then try again."}
            action={<Button variant="outlined" size="sm" onClick={() => void load()}>Try again</Button>}
          />
        ) : prizes.length === 0 ? (
          <EmptyState
            plain
            icon={<Gift size={40} />}
            title="No prizes yet"
            description="Add your first prize, then choose who is eligible for its draw."
            action={editingId === "new" ? undefined : <Button size="sm" icon={<Plus size={16} />} onClick={() => openEditor(null)}>New prize</Button>}
          />
        ) : prizes.map((prize) => {
          const pool = pools[prize.id];
          const won = winnerCounts[prize.id] ?? 0;
          const full = won >= prize.winner_quota;
          const selected = editingId === prize.id;
          const syarat = prize.source === "entries"
            ? `entry list "${groups.find((group) => group.id === prize.entry_group_id)?.name ?? "not selected"}"`
            : describeConditions(prize.conditions, sessionNames, answerLabels);
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
                <span className={cx("block truncate font-medium", !prize.is_active && "text-on-surface-variant")}>{prize.name || "Unnamed"}</span>
                <span className="block truncate text-on-surface-variant">
                  {[
                    prize.sponsor_name,
                    ANIMATIONS.find((item) => item.value === prize.animation)?.label,
                    `${prize.winners_per_draw} per draw${prize.backup_per_draw > 0 ? ` + ${prize.backup_per_draw} ${prize.backup_per_draw === 1 ? "backup" : "backups"}` : ""}`,
                  ].filter(Boolean).join(" · ")}
                </span>
                <span className="block truncate text-on-surface-variant" title={`Conditions: ${syarat}`}>Conditions: {syarat}</span>
                {/* Kesalahan konfigurasi yang paling mudah terlewat: pemenang per
                    undi lebih besar dari kuotanya. Sistem menjepitnya saat mengundi,
                    tapi tanpa peringatan panitia mengira akan keluar sepuluh nama
                    dan hanya satu yang muncul di panggung. */}
                {prize.winners_per_draw > prize.winner_quota ? (
                  <span className="mt-0.5 flex items-start gap-1 font-medium text-warning">
                    <Warning size={14} className="mt-1 shrink-0" aria-hidden />
                    {prize.winners_per_draw} per draw exceeds the quota of {prize.winner_quota}. Only {prize.winner_quota} {prize.winner_quota === 1 ? "name" : "names"} will be drawn.
                  </span>
                ) : null}
              </span>
              <span className="hidden w-32 shrink-0 text-right tabular-nums sm:block">
                <span className="block">{won} / {prize.winner_quota}</span>
                <span
                  className="block text-on-surface-variant"
                  title={pool && pool.eligible !== pool.candidates ? `${pool.eligible - pool.candidates} already won in an active session` : undefined}
                >
                  {pool?.broken_rules?.length ? "Fix exclusion rules" : pool ? `${pool.candidates} ${pool.candidates === 1 ? "name" : "names"} ready` : "Pool not calculated"}
                </span>
              </span>
              <span className="flex shrink-0 justify-end sm:w-36">
                {!prize.is_active ? <StatusChip>Inactive</StatusChip>
                  // "Penuh di sesi ini", bukan "Kuota penuh". Tanpa keterangan
                  // sesi, label ini terbaca sebagai hadiah yang habis selamanya,
                  // lalu panitia membuat hadiah duplikat padahal cukup menutup sesi.
                  : full ? <StatusChip dot>{activeSession ? "Full in this session" : "Quota full"}</StatusChip>
                    : pool?.broken_rules?.length ? <StatusChip dot tone="error">Blocked</StatusChip>
                    : pool && pool.candidates === 0 ? <StatusChip dot tone="error">Empty pool</StatusChip>
                      : pool ? <StatusChip dot tone="success">Ready</StatusChip> : null}
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
              {activeSession ? <>Quota applies to session {activeSession.name}</> : "No active session; results are ungrouped"}{" "}
              <button type="button" onClick={() => goTo("history")} className="rounded-sm font-medium text-primary hover:underline">
                {activeSession ? "Manage session" : "Start session"}
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
      // Rumus lama hanya ditawarkan untuk hadiah yang sudah tersimpan dengannya.
      legacyFormula={editingId !== "new" && prizes.find((item) => item.id === editingId)?.weight_mode === "formula"}
      groups={groups}
      preview={preview}
      previewFailed={previewFailed}
      onRetrySessions={() => setPreviewRetry((current) => current + 1)}
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
    { value: "prizes", label: "Prizes", badge: loaded && !loadFailed ? prizes.length : undefined },
    { value: "rules", label: "Exclusion rules" },
    { value: "data", label: "Entry lists", badge: loaded && !loadFailed ? groups.length : undefined },
    { value: "display", label: "Stage display" },
    { value: "history", label: "Sessions & results" },
  ];

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={loadFailed ? <span>Draw status unknown</span> : loaded ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={canRun ? "success" : "error"} />
              {canRun ? "Ready to run" : "Not ready to run"}
            </span>
            <MetaSeparator />
            <span>{activeSession ? `Active session: ${activeSession.name}` : "No active session"}</span>
          </>
        ) : <span>Loading lucky draw</span>}
        actions={
          <>
            <ButtonLink href="/undian" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Stage screen</ButtonLink>
            {/* Tombol mati, bukan tautan yang dinonaktifkan lewat CSS: <a> tetap
                bisa diklik dan dibuka lewat papan ketik, dan panel operator yang
                terbuka pada undian tanpa kandidat justru gagal di layar yang paling
                tidak boleh gagal. Alasannya tertulis di baris kesiapan. */}
            {canRun
              ? <ButtonLink href="/admin/undian/kontrol" icon={<SlidersHorizontal size={16} />}>Open operator panel</ButtonLink>
              : <Button disabled icon={<LockSimple size={16} />}>Open operator panel</Button>}
          </>
        }
      />

      {loaded && !loadFailed ? <ReadinessBar steps={readiness} canRun={canRun} onGo={goTo} /> : null}

      {error && !errorInPane && !loadFailed ? (
        <Banner tone="error" icon={<Warning size={18} />} className="shrink-0" actions={<IconButton size="sm" label="Dismiss message" onClick={() => setError("")}><X size={16} /></IconButton>}>{error}</Banner>
      ) : null}

      <Tabs<Tab> label="Lucky draw sections" idPrefix="undian" value={tab} onChange={goTo} options={tabs} />

      <div role="tabpanel" id={`undian-panel-${tab}`} aria-labelledby={`undian-tab-${tab}`} className="flex min-h-0 flex-1 flex-col gap-4">
        {tab === "prizes" ? (
          <>
            {/* Hasil yang belum bersesi tidak akan pernah lepas dari kolam: tidak
                ada sesi yang bisa ditutup untuk membebaskannya. */}
            {orphanWinners > 0 ? (
              <Banner tone="warning" icon={<Warning size={18} />} className="shrink-0" actions={<Button variant="outlined" size="sm" onClick={() => goTo("history")}>Open Sessions & results</Button>}>
                <span className="font-medium">{orphanWinners} previous {orphanWinners === 1 ? "winner has" : "winners have"}</span> no session, so closing a session cannot restore their eligibility. Archive them in the Sessions & results tab.
              </Banner>
            ) : null}
            {/* Petunjuk hanya muncul ketika keadaannya benar-benar terjadi.
                Menampilkannya terus-menerus membuatnya jadi latar yang tidak
                dibaca siapa pun. */}
            {anyQuotaFull ? (
              <Banner tone="info" className="shrink-0">
                To draw a prize with a full quota in the next session, <span className="font-medium">close the current session, then start a new one</span>. Reuse the same prize; quotas and winner lists are calculated separately for each session.
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
              title="Could not load screen settings"
              description="Check your connection, then try again."
              action={<Button variant="outlined" size="sm" onClick={() => void load()}>Try again</Button>}
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
        title={`Delete prize ${confirmPrize?.name || ""}?`}
        description="Prizes with confirmed or pending winners cannot be deleted. Cancelled winner records for this prize will also be deleted. The deletion is recorded in the audit trail."
        actions={
          <>
            <Button variant="outlined" disabled={deletingPrize} onClick={() => setConfirmPrize(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={deletingPrize} onClick={() => { if (confirmPrize) void deletePrize(confirmPrize.id); }}>Delete prize</Button>
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
    <section aria-label="Draw readiness" className="shrink-0 rounded-lg border border-outline-variant bg-surface-container-lowest">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-body-medium">
        {canRun
          ? <CheckCircle size={18} className="shrink-0 text-success" aria-hidden />
          : <LockSimple size={18} className="shrink-0 text-error" aria-hidden />}
        <span className="font-medium tabular-nums">Readiness {steps.length - pending.length} of {steps.length}</span>
        <span className="min-w-0 flex-1 truncate text-on-surface-variant">
          {pertama ? `${pertama.blocking ? "Required" : "Optional"}: ${pertama.label.charAt(0).toLowerCase()}${pertama.label.slice(1)}` : "All checks complete"}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="daftar-kesiapan"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline"
        >
          {open ? "Hide" : "View checklist"}
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
                {step.done ? <CheckCircle size={14} aria-label="Complete" /> : index + 1}
              </span>
              <div className="min-w-52 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {step.label}
                  {/* Label wajib/opsional ditulis pada butirnya sendiri, bukan hanya
                      tersirat dari warna: pembaca yang tidak membedakan merah dan
                      kuning tetap harus bisa tahu mana yang mengunci. */}
                  {!step.done ? <StatusChip tone={step.blocking ? "error" : "warning"}>{step.blocking ? "Required" : "Optional"}</StatusChip> : null}
                </p>
                {step.detail ? <p className="text-on-surface-variant">{step.detail}</p> : null}
              </div>
              {!step.done ? <Button variant="outlined" size="sm" onClick={() => { onGo(step.tab); setOpen(false); }}>Resolve</Button> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
