"use client";

import {
  ArrowSquareOut, CheckCircle, DotsThree, DownloadSimple, Plus, Trash, UploadSimple, Warning, X, XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { ImagePreview } from "@/components/admin/image-preview";
import { useToast } from "@/components/toast";
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
import {
  TYPES_WITH_OPTIONS, VOTER_MODES, VOTE_STATUS_LABEL, VOTE_TYPES, votePercentages,
  type VotePoll, type VoteType, type VoterMode,
} from "@/lib/vote";
import {
  Banner, Button, ButtonLink, DetailSection, Dialog, EmptyState, IconButton, ListDetail, ListRow, MetaSeparator,
  Pane, PaneBody, PaneFooter, PaneHeader, POPOVER_ITEM, POPOVER_ITEM_DANGER, PageLoading, Popover, StatusChip,
  Switch, Tabs, TextField, usePopoverAnchor, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { Kelompok } from "@/components/admin/compact-form";

// CMS + kontrol voting dalam SATU halaman.
//
// Berbeda dari undian, yang kontrolnya sengaja dipisah ke halaman sendiri.
// Alasannya bukan konsistensi melainkan bentuk pekerjaannya: layar kontrol
// undian harus dapat dioperasikan tanpa memandang layar terlalu lama karena
// operatornya berdiri di samping MC, sementara voting dijalankan sambil duduk
// dan tombolnya cuma empat. Memisahkannya hanya menambah satu halaman yang
// harus dibuka bergantian dengan tempat pertanyaannya disusun.
//
// Tata letaknya list-detail: yang dikerjakan saat acara adalah mengendalikan
// SATU pertanyaan. Panel detail menaruh empat langkah panggung berurutan, dan
// langkah berikutnya selalu menjadi satu tombol utama di kaki panel.

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

const INPUT = "h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary";

type Tab = "pertanyaan" | "tampilan";

/* --------------------------------------------------------- Langkah panggung */

type Langkah = "show" | "open" | "close" | "reveal";

/** Aksi `/api/admin/vote/control` yang menjalankan tiap langkah. */
const AKSI_LANGKAH: Record<Langkah, string> = { show: "show", open: "open", close: "close", reveal: "reveal_results" };
const TOMBOL_LANGKAH: Record<Langkah, string> = { show: "Tayangkan", open: "Buka voting", close: "Tutup voting", reveal: "Perlihatkan hasil" };

type BarisLangkah = {
  key: Langkah;
  judul: string;
  ket: string;
  selesai: boolean;
  /** Aksi di luar urutan, untuk langkah yang bukan langkah berikutnya. */
  lain?: { label: string; action: string };
};

/**
 * Empat langkah dalam urutan pemakaian di panggung. "Selesai" dibaca dari
 * keadaan pertanyaannya sendiri, bukan dari riwayat klik, jadi urutannya tetap
 * benar meski operator melompati satu langkah atau membukanya dari perangkat lain.
 */
function langkahPanggung(poll: VotePoll, onScreen: boolean): { daftar: BarisLangkah[]; berikut: Langkah | null } {
  const daftar: BarisLangkah[] = [
    {
      key: "show",
      judul: "Tayangkan pertanyaan",
      ket: onScreen ? "Sedang tampil di layar panggung" : "Belum tampil di layar panggung",
      selesai: onScreen,
    },
    {
      key: "open",
      judul: "Buka voting",
      ket: poll.status === "draft" ? "Peserta belum bisa memilih" : `${poll.ballots} orang sudah memilih`,
      selesai: poll.status !== "draft",
    },
    {
      key: "close",
      judul: "Tutup voting",
      ket: poll.status === "closed" ? "Ditutup, suara tidak lagi diterima" : "Suara berhenti diterima",
      selesai: poll.status === "closed",
    },
    {
      key: "reveal",
      judul: "Perlihatkan hasil",
      ket: poll.results_visible ? "Hasil diperlihatkan" : "Saat MC siap",
      selesai: poll.results_visible,
    },
  ];
  const berikut = daftar.find((baris) => !baris.selesai)?.key ?? null;

  for (const baris of daftar) {
    if (baris.key === berikut) continue;
    if (baris.key === "open" && !baris.selesai) baris.lain = { label: "Buka sekarang", action: "open" };
    if (baris.key === "close") {
      if (poll.status === "closed") baris.lain = { label: "Buka lagi", action: "open" };
      else if (poll.status === "open") baris.lain = { label: "Tutup sekarang", action: "close" };
    }
    if (baris.key === "reveal") {
      baris.lain = poll.results_visible
        ? { label: "Sembunyikan", action: "hide_results" }
        : { label: "Perlihatkan sekarang", action: "reveal_results" };
    }
  }
  return { daftar, berikut };
}

const NADA_STATUS = { draft: "warning", open: "success", closed: "neutral" } as const;

function ringkasTipe(poll: VotePoll) {
  const bagian = [VOTE_TYPES.find((item) => item.value === poll.type)?.label ?? poll.type];
  if (poll.type === "multi") bagian.push(`maks ${poll.max_choices}`);
  if (poll.type === "rating") bagian[0] = `Skala 1–${poll.rating_max}`;
  if (poll.type === "wordcloud") bagian.push(`maks ${poll.max_words} kata`);
  bagian.push(VOTER_MODES.find((item) => item.value === poll.voter_mode)?.label ?? poll.voter_mode);
  return bagian.join(" · ");
}

/** Menu aksi jarang dipakai untuk satu pertanyaan. */
function MenuPertanyaan({ poll, disabled, onEdit, onRecount, onReset, onDelete }: {
  poll: VotePoll;
  disabled: boolean;
  onEdit: () => void;
  onRecount: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const anchor = usePopoverAnchor(pemicu);
  const jalankan = (aksi: () => void) => () => { anchor.tutup(); aksi(); };
  return (
    <>
      <IconButton ref={setPemicu} size="sm" label="Aksi lain" aria-haspopup="menu" aria-expanded={anchor.open} onClick={anchor.toggle}>
        <DotsThree size={18} weight="bold" />
      </IconButton>
      <Popover anchor={anchor} label="Aksi pertanyaan" align="end" width={248}>
        <button type="button" role="menuitem" className={POPOVER_ITEM} onClick={jalankan(onEdit)}>Sunting pertanyaan</button>
        {/* `<a>` biasa, bukan tautan router: alamatnya route handler yang membalas
            Content-Disposition attachment. Ekspor selalu tersedia, termasuk saat
            voting masih dibuka: panitia sering mengambil angka sementara. */}
        <a role="menuitem" className={POPOVER_ITEM} href={`/api/admin/vote/polls/${poll.id}/export?format=xlsx`} onClick={() => anchor.tutup()}>
          <DownloadSimple size={16} className="text-on-surface-variant" />Unduh XLSX, per pemilih
        </a>
        <a role="menuitem" className={POPOVER_ITEM} href={`/api/admin/vote/polls/${poll.id}/export?format=csv`} onClick={() => anchor.tutup()}>
          <DownloadSimple size={16} className="text-on-surface-variant" />Unduh CSV, rekap saja
        </a>
        {/* Hitung ulang hanya berguna bila angkanya diragukan. */}
        <button type="button" role="menuitem" disabled={disabled} className={cx(POPOVER_ITEM, "disabled:opacity-40")} onClick={jalankan(onRecount)}>Hitung ulang suara</button>
        <div className="my-1 border-t border-outline-variant" role="separator" />
        {/* Kosongkan hanya muncul bila memang ada yang bisa dikosongkan. */}
        {poll.ballots > 0 ? (
          <button type="button" role="menuitem" disabled={disabled} className={cx(POPOVER_ITEM_DANGER, "disabled:opacity-40")} onClick={jalankan(onReset)}>Kosongkan suara</button>
        ) : null}
        <button type="button" role="menuitem" disabled={disabled} className={cx(POPOVER_ITEM_DANGER, "disabled:opacity-40")} onClick={jalankan(onDelete)}>
          <Trash size={16} />Hapus pertanyaan
        </button>
      </Popover>
    </>
  );
}

export default function VoteAdminPage() {
  const [polls, setPolls] = useState<VotePoll[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [gagalMuat, setGagalMuat] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("pertanyaan");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VotePoll | null>(null);
  const [confirmReset, setConfirmReset] = useState<VotePoll | null>(null);
  // Antrean moderasi hanya dimuat untuk pertanyaan yang antreannya dibuka:
  // memuat seluruh antrean untuk setiap pertanyaan di tiap polling tiga detik
  // membaca tabel suara berulang tanpa ada yang melihatnya.
  const [moderating, setModerating] = useState<number | null>(null);
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [settingsGagal, setSettingsGagal] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [pending, setPending] = useState<Array<{ id: number; text_value: string; display_name: string | null }>>([]);
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/vote/polls", { cache: "no-store" }).catch(() => null);
    setLoading(false);
    if (!response?.ok) { setGagalMuat(true); setError("Daftar voting gagal dimuat."); return; }
    const data = await response.json();
    setGagalMuat(false);
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
    if (!response?.ok) { setSettingsGagal(true); return; }
    const data = await response.json();
    const raw = data.settings as Record<string, unknown> | null;
    setSettingsGagal(false);
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
    setConfirmRotate(false);
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

  async function reset(poll: VotePoll) {
    setBusy(`reset-${poll.id}`); setError("");
    const response = await fetch(`/api/admin/vote/polls/${poll.id}/reset`, { method: "POST" }).catch(() => null);
    setBusy(null); setConfirmReset(null);
    if (!response?.ok) { setError("Suara gagal dikosongkan."); return; }
    const body = await response.json().catch(() => ({}));
    toast.success("Suara dikosongkan", `${body.ballots_deleted ?? 0} suara dihapus. Opsi dan setelan pertanyaan tetap utuh.`);
    void load();
  }

  async function remove(poll: VotePoll) {
    setBusy(`delete-${poll.id}`);
    const response = await fetch(`/api/admin/vote/polls/${poll.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null); setConfirmDelete(null);
    if (!response?.ok) { setError("Pertanyaan gagal dihapus."); return; }
    toast.success("Pertanyaan dihapus");
    setSelectedId((current) => (current === poll.id ? null : current));
    void load();
  }

  function pilih(poll: VotePoll) {
    if (draft) return;
    setModerating(null);
    setSelectedId((current) => (current === poll.id ? null : poll.id));
  }

  const terpilih = selectedId != null ? polls.find((poll) => poll.id === selectedId) ?? null : null;
  const kode = joinCode ? `${joinCode.slice(0, 3)} ${joinCode.slice(3)}` : null;

  // ---- Panel daftar ------------------------------------------------------------
  const daftar = (
    <Pane aria-label="Daftar pertanyaan">
      <PaneBody>
        {loading ? (
          <div aria-label="Memuat pertanyaan" className="flex flex-col">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-4">
                <div className="h-3 w-56 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : polls.length === 0 && gagalMuat ? (
          <EmptyState
            plain
            icon={<XCircle size={40} />}
            title="Daftar voting gagal dimuat"
            description="Halaman mencoba lagi tiap 3 detik. Periksa koneksi bila tidak kunjung muncul."
          />
        ) : polls.length === 0 ? (
          <EmptyState
            plain
            title="Belum ada pertanyaan"
            description="Susun pertanyaan, tayangkan ke layar, buka voting, lalu perlihatkan hasilnya saat MC siap. Peserta memilih dari HP."
            action={<Button size="sm" icon={<Plus size={16} />} onClick={() => setDraft(emptyDraft())}>Pertanyaan baru</Button>}
          />
        ) : (
          <div role="list">
            {polls.map((poll) => {
              const onScreen = activeId === poll.id;
              return (
                <div role="listitem" key={poll.id}>
                  <ListRow selected={selectedId === poll.id} onSelect={() => pilih(poll)}>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-medium text-on-surface">{poll.question}</span>
                      <span className="truncate text-on-surface-variant">
                        {ringkasTipe(poll)}
                        {poll.type === "wordcloud" && poll.moderation && poll.pending_words > 0 ? ` · ${poll.pending_words} menunggu moderasi` : ""}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1.5">
                        {onScreen ? <StatusChip dot tone="primary">Di layar</StatusChip> : null}
                        <StatusChip dot tone={NADA_STATUS[poll.status]}>{VOTE_STATUS_LABEL[poll.status]}</StatusChip>
                        {poll.results_visible ? <StatusChip>Hasil diperlihatkan</StatusChip> : null}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-on-surface-variant">{poll.ballots} pemilih</span>
                  </ListRow>
                </div>
              );
            })}
          </div>
        )}
      </PaneBody>
    </Pane>
  );

  // ---- Panel detail: kendali satu pertanyaan -----------------------------------
  const kendali = terpilih && !draft ? (() => {
    const poll = terpilih;
    const onScreen = activeId === poll.id;
    const percentages = votePercentages(poll.options.map((option) => option.vote_count));
    const { daftar: langkah, berikut } = langkahPanggung(poll, onScreen);
    const nomorBerikut = berikut ? langkah.findIndex((baris) => baris.key === berikut) + 1 : null;
    return (
      <Pane as="aside" aria-label={`Kendali ${poll.question}`}>
        <div className="flex shrink-0 flex-col gap-1 border-b border-outline-variant px-5 py-4">
          <div className="flex items-start gap-1">
            <h2 className="min-w-0 flex-1 pt-2 text-title-medium font-semibold leading-6">{poll.question}</h2>
            <MenuPertanyaan
              poll={poll}
              disabled={busy !== null}
              onEdit={() => setDraft(toDraft(poll))}
              onRecount={() => void control("recount", poll.id)}
              onReset={() => setConfirmReset(poll)}
              onDelete={() => setConfirmDelete(poll)}
            />
            <IconButton size="sm" label="Tutup detail" onClick={() => setSelectedId(null)}><X size={16} /></IconButton>
          </div>
          <p className="text-body-medium text-on-surface-variant">{ringkasTipe(poll)} · <span className="tabular-nums">{poll.ballots}</span> orang memilih</p>
          {poll.description ? <p className="text-body-medium text-on-surface-variant">{poll.description}</p> : null}
        </div>

        <PaneBody>
          <DetailSection
            title="Hasil langsung"
            action={<span className="text-body-medium text-on-surface-variant">{poll.results_visible ? "Diperlihatkan di layar" : "Belum diperlihatkan"}</span>}
          >
            {poll.type === "rating" ? (
              <p className="text-body-medium text-on-surface-variant">
                Skala 1–{poll.rating_max}. Rata-rata dan sebaran tampil di layar panggung saat hasil diperlihatkan.
              </p>
            ) : null}
            {poll.type === "wordcloud" ? (
              <div className="flex flex-col gap-2 text-body-medium">
                <p className="text-on-surface-variant">Maksimal {poll.max_words} kata per peserta. Moderasi {poll.moderation ? "menyala" : "mati"}.</p>
                {poll.moderation ? (
                  <div>
                    <Button
                      variant="outlined"
                      size="sm"
                      aria-expanded={moderating === poll.id}
                      className={poll.pending_words > 0 ? "text-warning" : undefined}
                      onClick={() => setModerating(moderating === poll.id ? null : poll.id)}
                    >
                      {poll.pending_words > 0 ? `${poll.pending_words} kata menunggu persetujuan` : "Antrean moderasi kosong"}
                    </Button>
                  </div>
                ) : null}
                {moderating === poll.id ? (
                  <ul className="max-h-64 overflow-y-auto rounded-md border border-outline-variant">
                    {pending.length === 0 ? <li className="px-3 py-2.5 text-on-surface-variant">Tidak ada kata menunggu.</li>
                      : pending.map((row) => (
                        <li key={row.id} className="flex items-center gap-2 border-b border-outline-variant px-3 py-1.5 last:border-b-0">
                          <span className="min-w-0 flex-1 truncate text-on-surface">{row.text_value}</span>
                          {row.display_name ? <span className="shrink-0 text-on-surface-variant">{row.display_name}</span> : null}
                          <Button variant="text" size="sm" onClick={() => void moderate(row.id, true)}>Setujui</Button>
                          <Button variant="text" size="sm" className="text-error" onClick={() => void moderate(row.id, false)}>Tolak</Button>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {poll.options.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {poll.options.map((option, index) => (
                  <li key={option.id} className="flex flex-col gap-1.5 text-body-medium">
                    <span className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-on-surface">{option.label}</span>
                      <span className="shrink-0 tabular-nums text-on-surface-variant">{percentages[index]}% · {option.vote_count}</span>
                    </span>
                    <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${percentages[index]}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </DetailSection>

          <DetailSection title="Langkah di panggung">
            <ol className="flex flex-col gap-3">
              {langkah.map((baris, index) => {
                const sekarang = baris.key === berikut;
                const lain = baris.lain;
                return (
                  <li key={baris.key} aria-current={sekarang ? "step" : undefined} className="flex items-start gap-3 text-body-medium">
                    {baris.selesai ? (
                      <CheckCircle size={22} aria-label="Selesai" className="mt-px shrink-0 text-success" />
                    ) : (
                      <span
                        aria-hidden
                        className={cx(
                          "mt-px grid size-[22px] shrink-0 place-items-center rounded-full text-label-medium font-medium tabular-nums",
                          sekarang ? "bg-primary text-on-primary" : "border border-outline text-on-surface-variant",
                        )}
                      >
                        {index + 1}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cx("block", sekarang ? "font-semibold text-on-surface" : baris.selesai ? "text-on-surface" : "text-on-surface-variant")}>{baris.judul}</span>
                      <span className="block text-on-surface-variant">{baris.ket}</span>
                    </span>
                    {lain ? (
                      <Button
                        variant="text"
                        size="sm"
                        disabled={busy !== null}
                        loading={busy === `${lain.action}-${poll.id}`}
                        onClick={() => void control(lain.action, poll.id)}
                      >
                        {lain.label}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </DetailSection>
        </PaneBody>

        <PaneFooter note={nomorBerikut ? `Langkah ${nomorBerikut} dari 4` : "Semua langkah selesai"}>
          {onScreen ? (
            <Button variant="outlined" size="sm" disabled={busy !== null} loading={busy === `hide-${poll.id}`} onClick={() => void control("hide", poll.id)}>
              Turunkan dari layar
            </Button>
          ) : null}
          {berikut ? (
            <Button
              size="sm"
              variant={berikut === "close" ? "danger" : "filled"}
              disabled={busy !== null}
              loading={busy === `${AKSI_LANGKAH[berikut]}-${poll.id}`}
              onClick={() => void control(AKSI_LANGKAH[berikut], poll.id)}
            >
              {TOMBOL_LANGKAH[berikut]}
            </Button>
          ) : null}
        </PaneFooter>
      </Pane>
    );
  })() : null;

  // ---- Panel detail: penyunting pertanyaan -------------------------------------
  const opsiValid = draft ? draft.options.filter((option) => option.label.trim()).length >= 2 : false;
  const bisaSimpan = draft ? Boolean(draft.question.trim()) && (!TYPES_WITH_OPTIONS.includes(draft.type) || opsiValid) : false;

  const penyunting = draft ? (
    <Pane as="aside" aria-label={draft.id ? "Sunting pertanyaan" : "Pertanyaan baru"}>
      <PaneHeader className="px-5 py-4">
        <h2 className="min-w-0 flex-1 truncate text-title-medium font-semibold">{draft.id ? "Sunting pertanyaan" : "Pertanyaan baru"}</h2>
        <IconButton size="sm" label="Batal" disabled={saving} onClick={() => setDraft(null)}><X size={16} /></IconButton>
      </PaneHeader>
      <PaneBody>
        <form id="form-pertanyaan" onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex flex-col gap-5 px-5 py-4">
          <TextField
            label="Pertanyaan"
            value={draft.question}
            onChange={(event) => setDraft({ ...draft, question: event.target.value })}
            placeholder="Siapa karyawan terbaik tahun ini?"
            required
          />
          <TextField
            label="Keterangan"
            optional
            hint="Tampil di bawah pertanyaan."
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body-medium font-semibold text-on-surface">Tipe</legend>
            {VOTE_TYPES.map((item) => {
              const on = draft.type === item.value;
              return (
                <label key={item.value} className={cx("flex cursor-pointer gap-3 rounded-lg border p-3 text-body-medium", on ? "border-primary bg-accent-soft" : "border-outline-variant hover:bg-primary-soft")}>
                  <input type="radio" name="vote-type" value={item.value} checked={on} onChange={() => setDraft({ ...draft, type: item.value })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                  <span>
                    <span className="block font-medium text-on-surface">{item.label}</span>
                    <span className="block text-on-surface-variant">{item.hint}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {draft.type === "rating" ? (
            <div className="flex flex-col gap-4">
              <TextField
                label="Nilai tertinggi"
                type="number"
                min={2}
                max={10}
                value={draft.rating_max}
                onChange={(event) => setDraft({ ...draft, rating_max: Math.min(10, Math.max(2, Number(event.target.value) || 5)) })}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Label nilai 1" value={draft.rating_min_label} onChange={(event) => setDraft({ ...draft, rating_min_label: event.target.value })} placeholder="Sangat kurang" />
                <TextField label="Label nilai tertinggi" value={draft.rating_max_label} onChange={(event) => setDraft({ ...draft, rating_max_label: event.target.value })} placeholder="Sangat baik" />
              </div>
            </div>
          ) : null}

          {draft.type === "wordcloud" ? (
            <div className="flex flex-col gap-4">
              <TextField
                label="Maksimal kata per peserta"
                type="number"
                min={1}
                max={5}
                value={draft.max_words}
                onChange={(event) => setDraft({ ...draft, max_words: Math.min(5, Math.max(1, Number(event.target.value) || 3)) })}
              />
              {/* Bawaan MENYALA. Penyaring kata di database hanya menangkap yang
                  sudah terdaftar; nama orang dan sindiran tidak akan pernah ada
                  di daftar mana pun, dan yang tampil di layar besar di depan
                  klien tidak bisa ditarik kembali. */}
              <Switch
                checked={draft.moderation}
                onChange={(checked) => setDraft({ ...draft, moderation: checked })}
                label="Tahan kata sampai disetujui"
                description="Sangat disarankan. Kata baru masuk antrean dan baru tampil di layar setelah Anda setujui. Dimatikan, apa pun yang diketik peserta langsung terpampang."
              />
            </div>
          ) : null}

          {draft.type === "multi" ? (
            <TextField
              label="Maksimal pilihan"
              type="number"
              min={2}
              max={20}
              value={draft.max_choices}
              onChange={(event) => setDraft({ ...draft, max_choices: Math.max(2, Number(event.target.value) || 2) })}
            />
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body-medium font-semibold text-on-surface">Siapa yang boleh memilih</legend>
            {VOTER_MODES.map((item) => {
              const on = draft.voter_mode === item.value;
              return (
                <label key={item.value} className={cx("flex cursor-pointer gap-3 rounded-lg border p-3 text-body-medium", on ? "border-primary bg-accent-soft" : "border-outline-variant hover:bg-primary-soft")}>
                  <input type="radio" name="voter-mode" value={item.value} checked={on} onChange={() => setDraft({ ...draft, voter_mode: item.value })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                  <span>
                    <span className="block font-medium text-on-surface">{item.label}</span>
                    <span className="block text-on-surface-variant">{item.hint}</span>
                  </span>
                </label>
              );
            })}
            {/* Peringatan kekuatan mode ditampilkan DI SEBELAH pilihannya: panitia
                yang memilih anonim untuk voting berhadiah perlu membacanya
                sebelum acara, bukan sesudah. */}
            {VOTER_MODES.find((item) => item.value === draft.voter_mode)?.warning ? (
              <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
                <Warning size={16} className="mt-0.5 shrink-0 text-warning" />
                {VOTER_MODES.find((item) => item.value === draft.voter_mode)?.warning}
              </p>
            ) : null}
          </fieldset>

          {TYPES_WITH_OPTIONS.includes(draft.type) ? (
            <div className="flex flex-col gap-2">
              <p className="text-body-medium font-semibold text-on-surface">Opsi jawaban</p>
              <ul className="flex flex-col gap-2">
                {draft.options.map((option, index) => (
                  <li key={index} className="flex items-center gap-2">
                    {/* Gambar opsi. Opsional dan berdampingan dengan labelnya: voting
                        "pilih desain" butuh gambar, sebagian besar pertanyaan tidak. */}
                    <label
                      className="flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-outline hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary"
                      title={option.image_url ? "Ganti gambar opsi" : "Unggah gambar opsi"}
                    >
                      <span className="sr-only">{option.image_url ? `Ganti gambar opsi ${index + 1}` : `Unggah gambar opsi ${index + 1}`}</span>
                      {option.image_url
                        ? <ImagePreview url={option.image_url} alt={`Gambar opsi ${index + 1}`} className="size-9" />
                        : <UploadSimple size={16} className={uploading === `option-${index}` ? "animate-pulse text-primary" : "text-on-surface-variant"} />}
                      <input type="file" accept="image/*" className="sr-only" onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        const url = await upload(file, `option-${index}`);
                        if (url) setDraft((current) => current && { ...current, options: current.options.map((item, position) => position === index ? { ...item, image_url: url } : item) });
                      }} />
                    </label>
                    <input
                      value={option.label}
                      aria-label={`Opsi ${index + 1}`}
                      onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? { ...item, label: event.target.value } : item) })}
                      className={INPUT}
                      placeholder={`Opsi ${index + 1}`}
                    />
                    {option.image_url ? (
                      <Button
                        variant="text"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? { ...item, image_url: null } : item) })}
                      >
                        Hapus gambar
                      </Button>
                    ) : null}
                    <IconButton
                      size="sm"
                      label={`Hapus opsi ${index + 1}`}
                      disabled={draft.options.length <= 2}
                      onClick={() => setDraft({ ...draft, options: draft.options.filter((_, position) => position !== index) })}
                    >
                      <Trash size={16} />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <div>
                <Button
                  variant="outlined"
                  size="sm"
                  icon={<Plus size={16} />}
                  disabled={draft.options.length >= 30}
                  onClick={() => setDraft({ ...draft, options: [...draft.options, { id: null, label: "", image_url: null }] })}
                >
                  Tambah opsi
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </PaneBody>
      <PaneFooter note={TYPES_WITH_OPTIONS.includes(draft.type) && !opsiValid ? "Isi minimal dua opsi" : null}>
        <Button variant="outlined" size="sm" disabled={saving} onClick={() => setDraft(null)}>Batal</Button>
        <Button type="submit" form="form-pertanyaan" size="sm" loading={saving} disabled={!bisaSimpan}>
          {draft.id ? "Simpan perubahan" : "Simpan pertanyaan"}
        </Button>
      </PaneFooter>
    </Pane>
  ) : null;

  // ---- Tab tampilan layar ------------------------------------------------------
  const tampilan = settings ? (
    <Pane aria-label="Tampilan layar panggung">
      <PaneBody>
        <div className="flex max-w-[720px] flex-col gap-5 px-5 py-5">
          <p className="text-body-medium text-on-surface-variant">
            Berlaku untuk /vote/layar. Judul di sini adalah judul acara yang menetap; pertanyaannya sendiri berganti
            mengikuti apa yang sedang ditayangkan.
          </p>

          {/* Kode gabung paling atas: inilah yang dibacakan MC dari panggung, dan
              yang paling sering dicari operator saat peserta bertanya caranya ikut. */}
          <Kelompok title="Kode gabung acara" first>
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-[1.5rem] font-semibold leading-8 tabular-nums text-on-surface">{kode ?? "Belum ada kode"}</p>
              <p className="min-w-48 flex-1 text-body-medium text-on-surface-variant">
                Peserta membuka /join lalu mengetik angka ini. Berlaku untuk seluruh acara, bukan per pertanyaan, jadi
                cukup diumumkan sekali di awal sesi.
              </p>
              <Button variant="outlined" size="sm" loading={rotating} onClick={() => setConfirmRotate(true)}>
                {joinCode ? "Ganti kode" : "Terbitkan kode"}
              </Button>
            </div>
          </Kelompok>

          <Kelompok title="Judul">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Judul layar" value={settings.page_title} onChange={(event) => setSettings({ ...settings, page_title: event.target.value })} />
              <TextField label="Sub judul" optional value={settings.page_subtitle} onChange={(event) => setSettings({ ...settings, page_subtitle: event.target.value })} />
            </div>
          </Kelompok>

          <Kelompok title="Warna">
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["background_color", "Latar"],
                ["text_color", "Teks"],
                ["accent_color", "Aksen"],
                ["panel_color", "Panel hasil"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`vote-${key}`} className="block text-body-medium font-medium text-on-surface">{label}</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id={`vote-${key}`}
                      type="color"
                      value={settings[key] ?? COLOR_FALLBACK[key]}
                      onChange={(event) => setSettings({ ...settings, [key]: event.target.value })}
                      className="h-9 w-16 rounded-md border border-outline bg-surface-container-lowest"
                    />
                    {/* Tombol ini mengembalikan kolomnya ke NULL, bukan mengetik warna
                        bawaan: keduanya terlihat sama di layar, tetapi hanya NULL yang
                        ikut berubah bila bawaannya kelak diubah. */}
                    <Button variant="outlined" size="sm" disabled={settings[key] === null} onClick={() => setSettings({ ...settings, [key]: null })}>
                      {settings[key] === null ? "Bawaan" : "Pakai bawaan"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {/* Panel diberi keterangan sendiri: ia satu-satunya warna yang punya
                perhitungan otomatis, dan tanpa kalimat ini "Bawaan" terbaca seperti
                warna tetap. */}
            <p className="text-body-medium text-on-surface-variant">
              Panel hasil adalah bidang di belakang daftar suara. Dibiarkan bawaan, ia menjadi lapisan gelap tembus pandang
              sehingga serasi dengan gambar latar apa pun. Isi warna hanya bila ingin bidang solid.
            </p>
          </Kelompok>

          <Kelompok title="Gambar latar">
            <div className="flex flex-wrap items-center gap-2">
              <label className={cx("inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium font-medium hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary", uploading === "background" && "pointer-events-none opacity-60")}>
                <UploadSimple size={16} />
                {uploading === "background" ? "Mengunggah..." : settings.background_image_url ? "Ganti gambar" : "Unggah gambar"}
                <input type="file" accept="image/*" className="sr-only" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const url = await upload(file, "background");
                  if (url) setSettings((current) => current && { ...current, background_image_url: url });
                }} />
              </label>
              {settings.background_image_url ? (
                <Button variant="text" size="sm" className="text-error" onClick={() => setSettings({ ...settings, background_image_url: null })}>Hapus gambar</Button>
              ) : null}
            </div>
            {settings.background_image_url ? <ImagePreview url={settings.background_image_url} alt="Pratinjau latar" className="h-16 w-28" /> : null}
          </Kelompok>

          <Kelompok title="Header & footer">
            <BrandingEditor
              value={settings}
              onChange={(changes) => setSettings((current) => current && { ...current, ...changes })}
              idPrefix="vote"
              baseTextColor={settings.text_color ?? COLOR_FALLBACK.text_color}
              baseBackgroundColor={settings.background_color ?? COLOR_FALLBACK.background_color}
              baseAccentColor={settings.accent_color ?? COLOR_FALLBACK.accent_color}
            />
          </Kelompok>
        </div>
      </PaneBody>
      <PaneFooter note="Berlaku untuk semua layar yang membuka /vote/layar">
        <Button size="sm" loading={savingSettings} onClick={() => void saveSettings()}>Simpan tampilan</Button>
      </PaneFooter>
    </Pane>
  ) : settingsGagal ? (
    <EmptyState
      icon={<XCircle size={40} />}
      title="Setelan tampilan gagal dimuat"
      description="Periksa koneksi lalu coba lagi."
      action={<Button variant="outlined" size="sm" onClick={() => void loadSettings()}>Coba lagi</Button>}
    />
  ) : <PageLoading />;

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={
          <>
            {kode ? (
              <span>Kode gabung <span className="font-semibold tabular-nums text-on-surface">{kode}</span></span>
            ) : <span>Belum ada kode gabung</span>}
            <MetaSeparator />
            <span>Peserta membuka /join lalu mengetik kode ini</span>
            <MetaSeparator />
            <span>Diperbarui tiap 3 detik</span>
          </>
        }
        actions={
          <>
            <ButtonLink href="/vote/layar" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Layar panggung</ButtonLink>
            <Button
              variant="outlined"
              icon={<Plus size={16} />}
              disabled={draft !== null}
              onClick={() => { setTab("pertanyaan"); setDraft(emptyDraft()); }}
            >
              Pertanyaan baru
            </Button>
          </>
        }
      />

      {error ? (
        <Banner
          tone="error"
          icon={<XCircle size={18} />}
          actions={<IconButton size="sm" label="Tutup pesan" onClick={() => setError("")}><X size={16} /></IconButton>}
        >
          {error}
        </Banner>
      ) : null}

      <Tabs<Tab>
        label="Bagian voting"
        idPrefix="voting"
        value={tab}
        onChange={setTab}
        options={[
          { value: "pertanyaan", label: "Pertanyaan", badge: loading || (gagalMuat && polls.length === 0) ? undefined : polls.length },
          { value: "tampilan", label: "Tampilan layar" },
        ]}
      />

      <div role="tabpanel" id={`voting-panel-${tab}`} aria-labelledby={`voting-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === "pertanyaan" ? <ListDetail list={daftar} detail={penyunting ?? kendali} detailWidth={460} /> : tampilan}
      </div>

      {/* Konfirmasi kosongkan. Dipisah dari dialog hapus karena akibatnya berbeda:
          yang ini membuang SUARA dan menyisakan pertanyaannya, yang itu membuang
          keduanya. */}
      <Dialog
        open={confirmReset !== null}
        onClose={() => setConfirmReset(null)}
        dismissible={busy === null}
        tone="danger"
        title="Kosongkan suara?"
        description={confirmReset ? `${confirmReset.ballots} suara pada "${confirmReset.question}" dihapus permanen dan penghitungnya kembali ke nol.` : undefined}
        actions={
          <>
            <Button variant="outlined" disabled={busy !== null} onClick={() => setConfirmReset(null)}>Batal</Button>
            <Button variant="danger" loading={busy === `reset-${confirmReset?.id}`} disabled={busy !== null} onClick={() => { if (confirmReset) void reset(confirmReset); }}>Kosongkan suara</Button>
          </>
        }
      >
        <p className="mt-3 text-body-medium leading-6 text-on-surface-variant">
          Pertanyaan, opsi, gambar, dan setelannya tetap utuh, begitu juga status buka/tutup dan tampil/sembunyi.
          Unduh hasilnya lebih dulu bila masih dibutuhkan.
        </p>
      </Dialog>

      {/* Konfirmasi hapus. Menyebut jumlah suara yang ikut hilang, karena itulah
          yang sebenarnya dipertaruhkan. */}
      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        dismissible={busy === null}
        tone="danger"
        title="Hapus pertanyaan?"
        description={confirmDelete
          ? `"${confirmDelete.question}" akan dihapus${confirmDelete.ballots > 0 ? ` beserta ${confirmDelete.ballots} suara yang sudah masuk` : ""}. Tidak dapat dikembalikan.`
          : undefined}
        actions={
          <>
            <Button variant="outlined" disabled={busy !== null} onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="danger" loading={busy === `delete-${confirmDelete?.id}`} disabled={busy !== null} onClick={() => { if (confirmDelete) void remove(confirmDelete); }}>Hapus pertanyaan</Button>
          </>
        }
      />

      <Dialog
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        dismissible={!rotating}
        tone={joinCode ? "danger" : "neutral"}
        title={joinCode ? "Ganti kode gabung?" : "Terbitkan kode gabung?"}
        description={joinCode
          ? "Kode lama langsung tidak berlaku. Peserta yang masih memegangnya akan mengetik angka yang tidak menemukan apa pun, jadi umumkan kode baru dari panggung."
          : "Kode dibuat otomatis dan berlaku untuk seluruh acara."}
        actions={
          <>
            <Button variant="outlined" disabled={rotating} onClick={() => setConfirmRotate(false)}>Batal</Button>
            <Button variant={joinCode ? "danger" : "filled"} loading={rotating} onClick={() => void rotateJoinCode()}>
              {joinCode ? "Ganti kode" : "Terbitkan kode"}
            </Button>
          </>
        }
      />
    </WorkspacePage>
  );
}
