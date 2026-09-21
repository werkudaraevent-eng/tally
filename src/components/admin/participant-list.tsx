"use client";

import { ArrowDown, ArrowUp, CaretUpDown, Check, LockSimple, MagnifyingGlass, Paperclip, PencilSimple, Prohibit, Trash, UsersThree, WarningCircle, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useImperativeHandle, useState } from "react";
import {
  Banner, Button, Dialog, EmptyCell, EMPTY_VALUE, EmptyState, IconButton, Pagination, PageToolbar,
  SelectMenu, StatusChip, TableCard, TableSkeleton, type SelectOption,
} from "@/components/m3";
import { formatEventDateTime } from "@/lib/datetime";
import { gabungMeta } from "@/lib/typography";
import type { RegistrationField } from "@/lib/domain";
import { FILE_FIELD_TYPES } from "@/lib/registration-fields";
import { DEFAULT_TIME_ZONE, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

type ParticipantSeat = { subEventId: string; subEventName: string; label: string };
type Participant = {
  id: string;
  qr_code: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  rsvp_status: string | null;
  /** Jawaban pertanyaan tambahan form pendaftaran, dikunci oleh `field.key`. */
  extra: Record<string, string> | null;
  // Penentu tunggal apakah baris ini milik panitia atau milik Scanner API.
  source_participant_id: string | null;
  source_checked_in: boolean;
  source_total_scans: number;
  source_synced_at: string | null;
  source_removed_at: string | null;
  /** Diisi hanya oleh pendaftaran walk-in di /scan. Null = terdaftar sebelum hari-H. */
  walk_in_at: string | null;
  /** Asal baris, dihitung server. Empat nilai yang saling meniadakan. */
  source: AsalPeserta;
  /** Kehadiran menurut catatan aplikasi ini, dikunci id sesi. */
  attendance: Record<string, { count: number; first: string }>;
  seats: ParticipantSeat[] | null;
};

type AsalPeserta = "walkin" | "scanner" | "registration" | "manual";

type SesiKehadiran = { id: number; name: string; is_active: boolean };

/**
 * Lencana asal baris.
 *
 * Berdiri sebagai KOLOM sendiri, bukan lencana yang menempel di sebelah nama.
 * Sebagai lencana ia tidak bisa dibandingkan antar baris: mata harus melompat
 * ke posisi yang berbeda-beda karena panjang nama berbeda-beda. Sebagai kolom,
 * seluruh jawabannya berbaris lurus dan "berapa banyak yang walk-in" terjawab
 * dengan melirik, bukan menghitung.
 */
const ASAL: Record<AsalPeserta, { label: string; kelas: string; judul: string }> = {
  walkin: {
    label: "Walk-in",
    kelas: "bg-primary-soft text-on-primary-soft",
    judul: "Didaftarkan petugas di meja registrasi pada hari-H",
  },
  registration: {
    label: "Daftar sendiri",
    kelas: "bg-success-soft text-on-success-soft",
    judul: "Mengisi formulir pendaftaran publik",
  },
  manual: {
    label: "Manual",
    kelas: "bg-panel-high text-on-surface-variant",
    judul: "Diketik atau diimpor panitia lewat CMS",
  },
  scanner: {
    label: "Scanner API",
    kelas: "border border-outline-variant text-on-surface-variant",
    judul: "Ditarik dari Scanner API. Sebagian kolomnya dikelola di sana",
  },
};

/** Bawaan. Bisa diganti 25/50/100 lewat pengendali halaman; batas server 200. */
const PAGE_SIZE = 25;

/**
 * Pilihan penyaring. Label diawali "Semua ..." supaya kotaknya sendiri yang
 * memberi tahu ia penyaring apa — itu yang membuat kata "Filter" di depan
 * deretannya tidak lagi dibutuhkan.
 */
const OPSI_ASAL: SelectOption<string>[] = [
  { value: "", label: "Semua asal" },
  { value: "walkin", label: "Walk-in" },
  { value: "registration", label: "Daftar sendiri" },
  { value: "manual", label: "Manual" },
];

/** RSVP dalam bahasa panitia, dengan titik warna yang menandai artinya. */
const LABEL_RSVP: Record<string, string> = {
  confirmed: "Konfirmasi",
  invited: "Menunggu",
  declined: "Tidak hadir",
};

const RSVP_TONE: Record<string, "success" | "warning" | "error"> = {
  confirmed: "success",
  invited: "warning",
  declined: "error",
};

const OPSI_RSVP: SelectOption<string>[] = [
  { value: "", label: "Semua RSVP" },
  { value: "confirmed", label: "RSVP: confirmed" },
  { value: "invited", label: "RSVP: invited" },
  { value: "none", label: "RSVP: belum diisi" },
];

// Harus cocok dengan whitelist SORTABLE di /api/admin/participants.
type SortKey =
  | "name"
  | "company"
  | "title"
  | "qr_code"
  | "participant_type"
  | "rsvp_status"
  | "source_checked_in"
  | "source_total_scans";

/**
 * Satu kolom, satu nilai.
 *
 * Versi sebelumnya menumpuk nama di atas instansi dan jabatan di dalam satu sel
 * "Peserta". Itu terbaca rapi pada satu baris dan berhenti berguna pada dua
 * puluh lima: nilai yang ditumpuk tidak bisa dibandingkan antar baris, tidak
 * bisa diurutkan, dan tidak bisa disalin ke spreadsheet tanpa ikut membawa
 * tetangganya. Tabel adalah alat pembanding, dan sel bertingkat membuangnya.
 */
const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "name", label: "Nama" },
  { key: "company", label: "Instansi" },
  { key: "title", label: "Jabatan" },
  { key: "qr_code", label: "QR code" },
  { key: "participant_type", label: "Tipe" },
  { key: "rsvp_status", label: "RSVP" },
  { key: "source_checked_in", label: "Check-in" },
  { key: "source_total_scans", label: "Scan", align: "right" },
];

// Kolom kursi tidak bisa diurutkan, jadi berdiri di luar COLUMNS: header yang
// bisa diklik tapi tidak mengubah apa pun hanya membingungkan. Kontak dan
// jawaban formulir menyusul dengan alasan yang sama -- mengurutkan menurut
// nomor telepon tidak menjawab pertanyaan siapa pun.
const SEAT_COLUMN_LABEL = "Kursi";

/** Bentuk satu baris saat sedang disunting. Semua string supaya terikat langsung
 *  ke input tanpa konversi bolak-balik yang bisa kehilangan nilai kosong. */
type Draft = {
  qr_code: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  participant_type: string;
  rsvp_status: string;
  extra: Record<string, string>;
};

const EMPTY_DRAFT: Draft = { qr_code: "", name: "", company: "", title: "", email: "", phone: "", participant_type: "", rsvp_status: "", extra: {} };

function toDraft(participant: Participant): Draft {
  return {
    qr_code: participant.qr_code,
    name: participant.name,
    company: participant.company ?? "",
    title: participant.title ?? "",
    email: participant.email ?? "",
    phone: participant.phone ?? "",
    participant_type: participant.participant_type ?? "",
    rsvp_status: participant.rsvp_status ?? "",
    extra: { ...(participant.extra ?? {}) },
  };
}

const inputClass = "mt-1.5 h-11 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium outline-none transition-colors focus:border-primary";
const lockedClass = "mt-1.5 flex min-h-11 items-center rounded-md border border-dashed border-outline-variant bg-surface-container px-3 text-body-medium text-on-surface-variant";

/**
 * Jawaban tambahan sebagai teks sel. Kotak centang "Ya"/"-", berkas ditangani
 * pemanggil karena butuh tombol, sisanya apa adanya.
 */
function teksJawaban(field: RegistrationField, value: string | undefined): string {
  if (!value) return "-";
  if (field.type === "checkbox") return value === "true" ? "Ya" : "-";
  return value;
}

/**
 * Yang bisa diperintahkan halaman kepada daftar ini.
 *
 * Ada satu-satunya karena tombol "+ Tambah peserta" duduk di KEPALA HALAMAN,
 * sementara keadaan penyuntingannya (draft, baris yang sedang dibuka, galat per
 * kolom) tinggal di dalam komponen ini. Mengangkat seluruh keadaan itu ke
 * halaman hanya demi satu tombol berarti memindahkan sembilan potong state untuk
 * memindahkan satu ketukan.
 */
export type ParticipantListHandle = { tambah: () => void };

export function ParticipantList({ reloadKey = 0, timeZone = DEFAULT_TIME_ZONE, timeZoneAbbr: abbr, onChanged, toolbar, ref }: {
  reloadKey?: number;
  timeZone?: EventTimeZone;
  timeZoneAbbr?: string;
  /** Dipanggil setelah tabel berhasil menulis, supaya halaman induk bisa
   *  menyegarkan angka yang ia tampilkan sendiri. */
  onChanged?: () => void;
  /**
   * Tombol milik halaman induk (impor, ekspor) yang ditempatkan di header tabel.
   *
   * Diterima sebagai node dan bukan dibangun di sini karena keadaannya --
   * berkas terpilih, hasil pratinjau -- milik halaman, dan menariknya ke dalam
   * komponen ini berarti tabel peserta ikut memikirkan urusan unggah berkas.
   */
  toolbar?: React.ReactNode;
  ref?: React.Ref<ParticipantListHandle>;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [participants, setParticipants] = useState<Participant[]>([]);
  // Susunan pertanyaan tambahan form pendaftaran. Datang bersama daftar
  // peserta dari endpoint yang sama, jadi kolom dan isinya selalu sepasang.
  const [fields, setFields] = useState<RegistrationField[]>([]);
  // Sesi kehadiran acara ini, satu kolom untuk masing-masing. Datang bersama
  // daftar pesertanya, jadi kolom dan isinya tidak pernah bisa berbeda versi.
  const [sessions, setSessions] = useState<SesiKehadiran[]>([]);
  /**
   * Apakah dua kolom milik Scanner API ditampilkan.
   *
   * Di acara yang tidak menariknya, keduanya berisi "Belum" dan 0 selamanya,
   * berdampingan dengan kolom kehadiran yang benar-benar terisi. Itulah yang
   * dilaporkan sebagai "daftar peserta tidak update".
   */
  const [scannerColumns, setScannerColumns] = useState(false);
  // ---- Penyaring ----------------------------------------------------------
  // Ketiganya dikerjakan di database, bukan di sini. Menyaring dua puluh lima
  // baris yang kebetulan sedang tampil akan menjawab pertanyaan yang salah:
  // "siapa yang belum hadir" harus melihat seluruh peserta acara, bukan halaman
  // yang sedang dibuka.
  const [filterAsal, setFilterAsal] = useState("");
  /** Satu nilai berisi sesi DAN keadaannya, mis. `3:no`. Lihat komentar di JSX. */
  const [filterHadir, setFilterHadir] = useState("");
  const [filterRsvp, setFilterRsvp] = useState("");
  const [total, setTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Peserta yang dikecualikan dari undian. Dimuat sekali, lalu diperbarui secara
  // optimis: daftarnya berisi belasan orang, tidak sepadan memuat ulang seluruh
  // tabel peserta hanya untuk mengubah satu tanda.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [togglingExclusion, setTogglingExclusion] = useState<string | null>(null);
  // `"new"` menandai peserta baru; selain itu berisi id peserta yang sedang
  // disunting. Satu state karena hanya satu modal yang boleh terbuka.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Baris yang sedang disunting disimpan utuh, bukan hanya id-nya: modal perlu
  // tahu apakah barisnya milik Scanner API, dan mencarinya ulang di `participants`
  // gagal begitu tabel dimuat ulang di belakang modal yang masih terbuka.
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const [editingRow, setEditingRow] = useState<Participant | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (search: string, pageIndex: number, sortKey: SortKey, sortDir: "asc" | "desc", perPage: number) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({
        q: search,
        limit: String(perPage),
        offset: String(pageIndex * perPage),
        sort: sortKey,
        dir: sortDir,
      });
      if (filterAsal) params.set("source", filterAsal);
      if (filterRsvp) params.set("rsvp", filterRsvp);
      if (filterHadir) {
        const [sesiId, keadaan] = filterHadir.split(":");
        params.set("session", sesiId);
        params.set("attended", keadaan);
      }
      const response = await fetch(`/api/admin/participants?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Daftar peserta gagal dimuat."); return; }
      setParticipants(data.participants ?? []); setTotal(data.total ?? 0);
      setFields((data.fields ?? []) as RegistrationField[]);
      setSessions((data.sessions ?? []) as SesiKehadiran[]);
      setScannerColumns(Boolean(data.scanner_columns));
      setActiveTotal(data.active_total ?? data.total ?? 0);
      setRemovedCount(data.removed_count ?? 0); setLastSyncedAt(data.last_synced_at ?? null);
    } catch { setError("Koneksi terputus. Coba lagi."); } finally { setLoading(false); }
    // Penyaring masuk dependensi, bukan parameter. Efek pemuatan sudah bergantung
    // pada `load`, jadi mengubah penyaring memuat ulang tabelnya sendiri tanpa
    // ada satu pun pemanggil yang perlu tahu penyaring itu ada.
  }, [filterAsal, filterHadir, filterRsvp]);

  // Debounce search input and reset to first page when the query changes.
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Daftar pengecualian undian dimuat sekali. Kegagalannya tidak menggagalkan
  // tabel peserta: tandanya sekadar tidak muncul, dan fungsi utama halaman tetap
  // berjalan.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch("/api/admin/undian/exclusions", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        setExcluded(new Set((data.exclusions ?? []).map((row: { participant_id: string }) => row.participant_id)));
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadKey]);

  async function toggleExclusion(participant: Participant) {
    const isExcluded = excluded.has(participant.id);
    setTogglingExclusion(participant.id);
    const response = isExcluded
      ? await fetch(`/api/admin/undian/exclusions?participant_id=${participant.id}`, { method: "DELETE" })
      : await fetch("/api/admin/undian/exclusions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participant_id: participant.id }),
        });
    setTogglingExclusion(null);
    if (!response.ok) { setError("Status undian gagal diubah."); return; }
    setExcluded((current) => {
      const next = new Set(current);
      if (isExcluded) next.delete(participant.id); else next.add(participant.id);
      return next;
    });
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(debouncedQuery, page, sort, dir, perPage); }, 0); return () => window.clearTimeout(timer); }, [load, debouncedQuery, page, sort, dir, perPage, reloadKey]);

  // Klik kolom yang sama membalik arah; kolom baru mulai dari asc. Selalu balik
  // ke halaman 1 karena urutan baru membuat posisi halaman lama tidak relevan.
  function toggleSort(key: SortKey) {
    if (key === sort) { setDir((current) => (current === "asc" ? "desc" : "asc")); } else { setSort(key); setDir("asc"); }
    setPage(0);
  }

  function startAdd() {
    // Tidak melakukan apa-apa kalau sudah ada yang disunting. Sebelumnya tombolnya
    // yang dinonaktifkan; sejak ia pindah ke kepala halaman, penjaganya harus ada
    // di sini — halaman tidak tahu apa pun tentang draft yang sedang terbuka.
    if (editingId !== null) return;
    setEditingId("new"); setEditingRow(null); setDraft(EMPTY_DRAFT); setError(""); setNotice("");
  }

  useImperativeHandle(ref, () => ({ tambah: startAdd }));

  function startEdit(participant: Participant) {
    setEditingId(participant.id); setEditingRow(participant); setDraft(toDraft(participant)); setError(""); setNotice("");
  }

  function cancelEdit() { setEditingId(null); setEditingRow(null); setDraft(EMPTY_DRAFT); }

  async function save() {
    if (!editingId) return;
    setSaving(true); setError(""); setNotice("");
    const isNew = editingId === "new";
    const response = await fetch(isNew ? "/api/admin/participants" : `/api/admin/participants/${editingId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    setSaving(false);
    if (!response) { setError("Koneksi terputus. Peserta belum tersimpan."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Galat per-jawaban datang sebagai peta `extra.<kunci>`; yang pertama
      // sudah cukup untuk memberi tahu kolom mana yang salah.
      const rincian = body.error?.details && typeof body.error.details === "object" ? Object.values(body.error.details as Record<string, unknown>).find((value) => typeof value === "string") : undefined;
      setError((typeof rincian === "string" ? rincian : undefined) ?? body.error?.message ?? "Peserta gagal disimpan.");
      return;
    }
    cancelEdit();
    setNotice(isNew ? `${draft.name} ditambahkan.` : `${draft.name} diperbarui.`);
    void load(debouncedQuery, page, sort, dir, perPage);
    onChanged?.();
  }

  async function remove(participant: Participant) {
    setSaving(true); setError(""); setNotice("");
    const response = await fetch(`/api/admin/participants/${participant.id}`, { method: "DELETE" }).catch(() => null);
    setSaving(false);
    if (!response) { setError("Koneksi terputus. Muat ulang untuk melihat apakah peserta terhapus."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.details?.message ?? body.error?.message ?? "Peserta gagal dihapus."); return; }
    setNotice(`${participant.name} dihapus.`);
    void load(debouncedQuery, page, sort, dir, perPage);
    onChanged?.();
  }

  /**
   * Berkas unggahan pendaftar ada di bucket privat: tautannya diminta ke server
   * saat ditekan dan berlaku lima menit. Pola yang sama dengan layar moderasi.
   */
  async function bukaBerkas(id: string) {
    const response = await fetch(`/api/admin/registrasi/upload?id=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !body?.url) { setError("Berkas tidak bisa dibuka. Coba lagi."); return; }
    window.open(body.url, "_blank", "noopener");
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const adaFilter = Boolean(filterAsal || filterHadir || filterRsvp);

  /**
   * Satu field di modal.
   *
   * Kolom milik Scanner API ditampilkan sebagai teks di dalam kotak putus-putus,
   * BUKAN sebagai input yang dinonaktifkan. Input abu-abu tetap mengundang klik
   * dan terbaca seperti kerusakan; kotak putus-putus dengan gembok terbaca
   * sebagai keputusan.
   */
  function field(label: string, node: React.ReactNode, hint?: string) {
    return <label className="block text-label-large font-semibold">{label}{node}
      {hint && <span className="mt-1 block text-body-small font-normal text-on-surface-variant">{hint}</span>}
    </label>;
  }

  function textField(label: string, key: Exclude<keyof Draft, "extra">, options?: { locked?: boolean; value?: string; placeholder?: string; type?: string; mono?: boolean }) {
    if (options?.locked) {
      return field(label, <p className={`${lockedClass} ${options.mono ? "font-mono" : ""}`}><LockSimple size={14} className="mr-2 shrink-0" />{options.value || "-"}</p>);
    }
    return field(label, <input
      value={draft[key]}
      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      className={`${inputClass} ${options?.mono ? "font-mono" : ""}`}
      placeholder={options?.placeholder}
      type={options?.type ?? "text"}
    />);
  }

  /**
   * Satu pertanyaan tambahan di modal, dirender menurut jenisnya — kontrol yang
   * sama dengan yang dilihat pendaftar di formulir publik, supaya jawaban yang
   * diketik panitia berbentuk sama dengan jawaban yang diketik pendaftar.
   *
   * Pilihan (dropdown maupun radio) sama-sama menjadi dropdown di sini: modal
   * ini sempit dan berisi belasan kolom, dan tujuh tombol radio untuk satu
   * pertanyaan memakan ruang yang tidak ada.
   */
  function jawabanField(item: RegistrationField) {
    const value = draft.extra[item.key] ?? "";
    const set = (next: string) => setDraft({ ...draft, extra: { ...draft.extra, [item.key]: next } });
    const label = item.required ? item.label : `${item.label} (opsional)`;

    if (FILE_FIELD_TYPES.includes(item.type)) {
      return field(label, value
        ? <p className={lockedClass}><Paperclip size={14} className="mr-2 shrink-0" />Berkas terlampir · <button type="button" onClick={() => void bukaBerkas(value)} className="ml-1 font-semibold text-primary underline">buka</button></p>
        : <p className={lockedClass}><LockSimple size={14} className="mr-2 shrink-0" />Hanya bisa diunggah pendaftar sendiri.</p>);
    }
    if (item.type === "checkbox") {
      return <label className="flex cursor-pointer items-start gap-3 pt-1">
        <input type="checkbox" checked={value === "true"} onChange={(event) => set(event.target.checked ? "true" : "")} className="mt-1 size-5 shrink-0 accent-[var(--md-sys-color-primary)]" />
        <span>
          <span className="block text-label-large font-semibold">{label}</span>
          {item.help_text ? <span className="mt-0.5 block text-body-small text-on-surface-variant">{item.help_text}</span> : null}
        </span>
      </label>;
    }
    if (item.type === "select" || item.type === "radio") {
      return field(label, <select value={value} onChange={(event) => set(event.target.value)} className={inputClass}>
        <option value="">Tidak diisi</option>
        {(item.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>, item.help_text);
    }
    if (item.type === "textarea") {
      return field(label, <textarea value={value} onChange={(event) => set(event.target.value)} rows={3} maxLength={2000} placeholder={item.placeholder} className={`${inputClass} h-auto resize-y py-2 leading-6`} />, item.help_text);
    }
    return field(label, <input
      value={value}
      onChange={(event) => set(event.target.value)}
      type={item.type === "tel" ? "tel" : item.type === "email" ? "email" : item.type === "number" ? "number" : item.type === "date" ? "date" : "text"}
      min={item.type === "number" ? item.min : undefined}
      max={item.type === "number" ? item.max : undefined}
      placeholder={item.placeholder}
      className={inputClass}
    />, item.help_text);
  }

  const editingLocked = editingRow?.source_participant_id != null;
  const headerButton = (column: { key: SortKey; label: string }) => {
    const active = sort === column.key;
    // Ikon urut SELALU tergambar, bukan hanya saat kolomnya aktif. Ikon yang
    // baru muncul saat disentuh tidak pernah memberi tahu kolom mana yang bisa
    // diurutkan sebelum kursor kebetulan lewat di atasnya. Yang tidak aktif
    // memakai caret ganda tipis; yang aktif memakai panah berarah warna utama.
    return <button type="button" onClick={() => toggleSort(column.key)} className={`inline-flex w-full min-h-6 items-center gap-1 whitespace-nowrap transition-colors hover:text-on-surface ${active ? "font-medium text-on-surface" : ""}`} title={`Urutkan menurut ${column.label}`}>
      <span className="truncate">{column.label}</span>
      {active
        ? (dir === "asc" ? <ArrowUp size={14} className="shrink-0" /> : <ArrowDown size={14} className="shrink-0" />)
        : <CaretUpDown size={14} className="shrink-0 text-outline" />}
    </button>;
  };

  /**
   * Kolom cari dan penyaring berdiri DI LUAR kartu tabel.
   *
   * Sebelumnya judul, pencarian, tiga penyaring, dan tabelnya berbagi satu kartu
   * bergaris, dipisah dua garis mendatar. Akibatnya bukan sekadar padat: kartu
   * itu ikut melebar mengikuti tabel dua belas kolom di dalamnya, sehingga yang
   * bergulir menyamping adalah seluruh isi halaman — termasuk kotak pencarian
   * yang sedang diketik. Sekarang hanya isi kartu tabel yang bergulir.
   */
  return <>
    <PageToolbar
      search={
        <div className="relative">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          {/* Placeholder dipendekkan jadi "Cari peserta...". Yang panjang
              ("Cari nama, perusahaan, QR") tidak pernah muat di kolom 240px dan
              selalu berakhir terpotong di tengah kata — keterangan cakupan yang
              justru tidak pernah terbaca. Cakupannya pindah ke `title`. */}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            title="Mencari nama, instansi, dan kode QR"
            aria-label="Cari peserta"
            className="h-9 w-full rounded-lg border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none transition-[border-color] duration-150 placeholder:text-on-surface-variant focus:border-primary"
            placeholder="Cari peserta..."
          />
        </div>
      }
      count={gabungMeta([
        `${activeTotal} peserta aktif`,
        removedCount > 0 && `${removedCount} sudah dihapus di sumber`,
        lastSyncedAt && `sinkron ${formatEventDateTime(lastSyncedAt, timeZone)} ${abbr ?? timeZoneAbbr(timeZone)}`,
      ])}
      onReset={adaFilter ? () => { setFilterAsal(""); setFilterHadir(""); setFilterRsvp(""); setPage(0); } : undefined}
    >
      {/* Ketiganya selebar 200px, dan itu disengaja. Lebar yang mengikuti isi
          membuat "Semua kehadiran" dua kali lebih lebar daripada tetangganya, dan
          tiga kotak berlebar berbeda yang berjajar terbaca sebagai tiga jenis
          kontrol yang berbeda. */}
      <SelectMenu
        label="Saring menurut asal peserta"
        value={filterAsal}
        onChange={(nilai) => { setFilterAsal(nilai); setPage(0); }}
        options={scannerColumns ? [...OPSI_ASAL, { value: "scanner", label: "Scanner API" }] : OPSI_ASAL}
      />

      {/* Sesi DAN keadaannya dalam satu pilihan, bukan dua kotak berpasangan.
          Dua kotak menuntut yang kedua dinonaktifkan sampai yang pertama diisi,
          dan kotak mati yang menunggu kotak lain adalah cara paling cepat
          membuat orang mengira penyaringnya rusak. */}
      {sessions.length > 0 ? (
        <SelectMenu
          label="Saring menurut kehadiran"
          value={filterHadir}
          onChange={(nilai) => { setFilterHadir(nilai); setPage(0); }}
          options={[
            { value: "", label: "Semua kehadiran" },
            ...sessions.map((sesi) => ({ value: `${sesi.id}:yes`, label: `Sudah hadir: ${sesi.name}` })),
            ...sessions.map((sesi) => ({ value: `${sesi.id}:no`, label: `Belum hadir: ${sesi.name}` })),
          ]}
        />
      ) : null}

      <SelectMenu
        label="Saring menurut RSVP"
        value={filterRsvp}
        onChange={(nilai) => { setFilterRsvp(nilai); setPage(0); }}
        options={OPSI_RSVP}
      />

      {toolbar}
    </PageToolbar>

    {error && editingId === null && <div role="alert" className="rounded-lg mb-4 flex items-start gap-2 border border-error-soft-outline bg-error-soft p-3 text-body-medium text-error"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
    {notice && <div key={notice} role="status" className="rise-in-fast rounded-lg mb-4 flex items-center gap-2 border border-success-soft-outline bg-success-soft p-3 text-body-medium text-on-success-soft"><Check size={18} />{notice}</div>}
    {removedCount > 0 && <Banner tone="warning" className="mb-4" icon={<WarningCircle size={18} />}><span><span className="font-semibold">{removedCount} peserta sudah dihapus di sumber data.</span> Barisnya tetap disimpan di sini untuk audit, tapi tidak muncul lagi di pencarian booth dan kasir serta tidak dihitung di laporan. Karena itu total {total} di sini lebih besar dari angka aktif {activeTotal}.</span></Banner>}
    {/* Rangka baris, bukan kalimat "Memuat peserta...". Kalimat setinggi satu
        baris membuat kartu menciut lalu meregang lagi begitu dua puluh lima baris
        datang, dan seluruh isi halaman di bawahnya ikut melompat. */}
    {loading ? <TableCard><TableSkeleton rows={5} cols={5} /></TableCard>
      : participants.length === 0 ? (
        <TableCard>
          <EmptyState
            plain
            icon={<UsersThree size={40} />}
            title={adaFilter ? "Tidak ada peserta yang cocok" : "Belum ada peserta"}
            description={adaFilter
              ? "Longgarkan salah satu penyaring, atau kosongkan semuanya."
              : "Tambahkan peserta satu per satu, atau impor dari berkas CSV atau XLSX."}
            action={adaFilter
              ? <Button variant="outlined" size="sm" onClick={() => { setFilterAsal(""); setFilterHadir(""); setFilterRsvp(""); setPage(0); }}>Reset filter</Button>
              : <Button size="sm" onClick={startAdd}>Tambah peserta</Button>}
          />
        </TableCard>
      ) : <>
      <TableCard>
      <div className="w-full overflow-x-auto">
        {/* `table-fixed`: lebar kolom ditentukan KONFIGURASI, bukan isi terpanjang.
            Dengan layout otomatis, satu nama instansi 60 huruf menarik seluruh
            ruang kosong ke kolom Nama dan memepetkan sembilan kolom lain sampai
            berdempetan — persis yang terlihat sebelumnya. Kolom dinamis (sesi
            kehadiran, pertanyaan tambahan) berbagi sisa ruang secara merata. */}
        <table className="w-full table-fixed text-left text-body-medium">
          <thead className="whitespace-nowrap border-b border-outline-variant text-title-small font-medium text-on-surface-variant [&_th]:h-12"><tr>
            {/* Identitas dulu (nama, instansi, jabatan), lalu ASAL barisnya.
                Itu urutan pertanyaan yang dibawa admin ke tabel ini: siapa ini,
                dari mana dia, lalu dari mana barisnya. */}
            {/* Nama MENEMPEL di kiri saat tabel digulir mendatar. Tabel ini punya
                dua belas kolom sebelum pertanyaan tambahan dihitung, dan begitu
                digulir ke kanan setiap baris kehilangan satu-satunya kolom yang
                memberi tahu baris itu milik siapa. */}
            <th scope="col" aria-sort={sort === "name" ? (dir === "asc" ? "ascending" : "descending") : "none"} className="sticky left-0 z-10 w-[20rem] bg-surface-container-lowest px-4 shadow-[1px_0_0_var(--md-sys-color-outline-variant)]">{headerButton(COLUMNS[0])}</th>
            <th scope="col" aria-sort={sort === "title" ? (dir === "asc" ? "ascending" : "descending") : "none"} className="w-[11rem] px-4">{headerButton(COLUMNS[2])}</th>
            <th scope="col" className="w-[7rem] px-4 font-medium">Asal</th>
            {COLUMNS.slice(3, 6).map((column) => <th key={column.key} scope="col" aria-sort={sort === column.key ? (dir === "asc" ? "ascending" : "descending") : "none"} className="w-[8.5rem] px-4">{headerButton(column)}</th>)}
            {/* Satu kolom per sesi kehadiran, berisi catatan APLIKASI INI.
                Sesi yang sudah ditutup tetap punya kolom: kehadiran yang tercatat
                pagi tadi tidak hilang artinya sore ini. */}
            {sessions.map((sesi) => (
              // Nama sesi datang dari data acara dan bisa sepanjang "Walk in
              // Registration". Kolomnya ditetapkan 8,5rem dan labelnya dipotong
              // elipsis dengan nama lengkap di `title`; membiarkannya melipat
              // menaikkan tinggi SELURUH kepala tabel.
              <th key={sesi.id} scope="col" title={sesi.name} className="w-[8.5rem] truncate px-4 font-medium ed-plain">
                {sesi.name}
                {!sesi.is_active ? <span className="ml-1 font-normal opacity-70">(ditutup)</span> : null}
              </th>
            ))}
            <th scope="col" className="w-[13rem] px-4 font-medium">Email</th>
            <th scope="col" className="w-[9rem] px-4 font-medium">Telepon</th>
            {/* Satu kolom per pertanyaan tambahan, berlabel seperti di formulir.
                Kolomnya lahir dan hilang mengikuti CMS pendaftaran — tidak ada
                daftar kolom kedua yang harus diperbarui tangan. */}
            {fields.map((item) => <th key={item.key} scope="col" title={item.label} className="w-[10rem] truncate px-4 font-medium ed-plain">{item.label}</th>)}
            {/* Status hanya ada untuk baris Scanner API: penanda "dihapus di
                sumber" ditulis oleh sinkronisasi, jadi baris manual, walk-in,
                dan pendaftaran publik tidak akan pernah punya nilainya. */}
            {scannerColumns ? <th scope="col" className="px-4 font-medium">Status</th> : null}
            {scannerColumns ? COLUMNS.slice(6).map((column) => <th key={column.key} scope="col" aria-sort={sort === column.key ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 ${column.align === "right" ? "text-right" : ""}`}>{headerButton(column)}</th>) : null}
            <th scope="col" className="w-[8rem] px-4 font-medium">{SEAT_COLUMN_LABEL}</th>
            <th scope="col" className="w-[9rem] px-4 text-right font-medium">Undian</th>
            <th scope="col" className="w-[6.5rem] px-4 text-right font-medium">Aksi</th>
          </tr></thead>
          <tbody className="divide-y divide-outline-variant">
            {participants.map((participant) => {
              const fromSource = participant.source_participant_id != null;
              // Latar baris ditulis EKSPLISIT, dan sel sticky mewarisinya
              // (`bg-inherit`). Tanpa latar di barisnya, sel yang menempel di kiri
              // hanya punya dua pilihan: latar tetap putih — sehingga ia tidak
              // ikut menyala saat barisnya disentuh, persis yang terlihat di baris
              // pertama — atau tembus pandang, sehingga kolom yang lewat di
              // bawahnya terbaca menembusnya.
              return <tr key={participant.id} className="bg-surface-container-lowest transition-colors duration-150 hover:bg-surface">
                {/* Nama di atas, instansi di bawahnya, dalam SATU sel.
                    Berkas ini pernah menolak sel bertingkat, dan alasannya benar
                    untuk nilai yang dibandingkan antar baris. Instansi bukan
                    nilai seperti itu: ia keterangan tentang orangnya, dan sebagai
                    kolom sendiri ia yang paling sering melipat jadi enam baris
                    ("National Chamber of Commerce and Industry Brunei
                    Darussalam") sehingga SELURUH baris setinggi 140px. Harganya
                    dicatat: mengurutkan menurut instansi hilang bersamanya. */}
                <td className="sticky left-0 z-10 bg-inherit px-4 py-3.5 shadow-[1px_0_0_var(--md-sys-color-outline-variant)]">
                  <span className="block truncate text-[0.9375rem] font-medium leading-5" title={participant.name}>{participant.name}</span>
                  <span className="block truncate text-body-small text-on-surface-variant" title={participant.company ?? undefined}>
                    {participant.company ?? EMPTY_VALUE}
                  </span>
                </td>
                <td className="max-w-[14rem] px-4 py-3 text-body-small">
                  <span className="block truncate" title={participant.title ?? undefined}>{participant.title ?? <EmptyCell />}</span>
                </td>
                <td className="px-4 py-3">
                  {/* Stempel waktu walk-in TIDAK ikut di sel ini. Ia sudah
                      terjawab kolom sesi di sebelah kanan, karena peserta
                      walk-in dibuat dan dicatat hadir pada detik yang sama. */}
                  <span
                    title={ASAL[participant.source].judul}
                    className={`inline-flex whitespace-nowrap rounded-full border border-outline-variant px-2 py-0.5 text-label-medium font-medium ${ASAL[participant.source].kelas}`}
                  >
                    {ASAL[participant.source].label}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-body-small">{participant.qr_code}</td>
                {/* Tipe dan RSVP jadi pil bergaris, bukan teks abu polos. Teks abu
                    di tengah kolom teks lain tidak terbaca sebagai nilai berhingga
                    yang bisa dibandingkan; pil mengatakan "ini salah satu dari
                    beberapa keadaan". Nilai kosong tetap em-dash, bukan pil
                    kosong. */}
                <td className="px-4 py-3">
                  {participant.participant_type
                    ? <StatusChip>{participant.participant_type}</StatusChip>
                    : <EmptyCell />}
                </td>
                <td className="px-4 py-3">
                  {participant.rsvp_status
                    ? <StatusChip dot tone={RSVP_TONE[participant.rsvp_status] ?? "neutral"}>{LABEL_RSVP[participant.rsvp_status] ?? participant.rsvp_status}</StatusChip>
                    : <EmptyCell />}
                </td>
                {/* Kehadiran per sesi. Jam kedatangan, bukan tanda centang: yang
                    ditanyakan panitia setelah acara hampir selalu "jam berapa dia
                    masuk", dan centang tidak pernah bisa menjawabnya. */}
                {sessions.map((sesi) => {
                  const catatan = participant.attendance?.[String(sesi.id)];
                  return (
                    <td key={sesi.id} className="px-4 py-3 text-body-small">
                      {catatan ? (
                        // Jam masuk saja. Jumlah pemindaian ulang pindah ke
                        // tooltip: ia pertanyaan yang berbeda dari "jam berapa
                        // dia datang", dan dua jawaban berbeda di dalam satu sel
                        // membuat keduanya lebih lambat dibaca daripada satu.
                        <StatusChip
                          dot
                          tone="success"
                          className="tabular-nums"
                          title={catatan.count > 1 ? `Dipindai ${catatan.count} kali di sesi ini` : "Dipindai sekali"}
                        >
                          {new Date(catatan.first).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone })}
                        </StatusChip>
                      ) : (
                        <StatusChip dot tone="neutral" className="text-on-surface-variant">Belum</StatusChip>
                      )}
                    </td>
                  );
                })}
                <td className="max-w-0 px-4 py-3 text-body-small"><span className="block truncate" title={participant.email ?? undefined}>{participant.email ?? <EmptyCell />}</span></td>
                <td className="px-4 py-3 text-body-small">{participant.phone ?? <EmptyCell />}</td>
                {fields.map((item) => {
                  const value = participant.extra?.[item.key];
                  return <td key={item.key} className="max-w-[20rem] px-4 py-3 text-body-small">
                    {FILE_FIELD_TYPES.includes(item.type)
                      ? (value
                          ? <button type="button" onClick={() => void bukaBerkas(value)} className="inline-flex items-center gap-1 font-semibold text-primary underline"><Paperclip size={14} />Buka</button>
                          : <span className="text-on-surface-variant">-</span>)
                      : <span className={`block truncate ${value ? "" : "text-on-surface-variant"}`} title={value}>{teksJawaban(item, value)}</span>}
                  </td>;
                })}
                {scannerColumns ? (
                  <>
                    <td className="px-4 py-3 text-body-small">
                      {participant.source_removed_at
                        ? <span className="inline-flex whitespace-nowrap rounded-sm bg-warning-soft px-2 py-0.5 text-label-small font-semibold ed-label text-warning">Dihapus di sumber</span>
                        : <span className="text-on-surface-variant">Aktif</span>}
                    </td>
                    {/* Nilai boolean digambar ikon, bukan dua kata yang panjangnya
                        berbeda. Kolom berisi dua puluh lima "Sudah"/"Belum" adalah
                        kolom teks yang harus dibaca; satu centang dipindai sekilas. */}
                    <td className="px-4 py-3 text-body-small">{participant.source_checked_in ? <Check size={16} className="text-success" aria-label="Sudah check-in" /> : <EmptyCell />}</td>
                    <td className="px-4 py-3 text-right text-body-small tabular-nums">{participant.source_total_scans}</td>
                  </>
                ) : null}
                {/* Datang dari scanner API dan hanya ditampilkan. Nama sesi ikut
                    ditulis karena satu peserta bisa punya kursi berbeda di sesi
                    pagi dan malam; label saja akan ambigu. */}
                <td className="px-4 py-3 text-body-small">
                  {participant.seats && participant.seats.length > 0
                    ? <span className="flex flex-wrap gap-1">{participant.seats.map((seat) => <span key={`${seat.subEventId}-${seat.label}`} title={seat.subEventName} className="inline-flex rounded-sm bg-primary-soft px-2 py-0.5 font-mono font-semibold text-on-primary-soft">{seat.label}</span>)}</span>
                    : <span className="text-on-surface-variant">Belum ada</span>}
                </td>
                {/* Pengecualian undian: panitia, MC, dan perwakilan sponsor lazimnya
                    tidak boleh menang meski terdaftar dan memenuhi syarat. */}
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void toggleExclusion(participant)}
                    disabled={togglingExclusion === participant.id}
                    title={excluded.has(participant.id) ? "Ikutkan lagi ke undian" : "Kecualikan dari semua undian"}
                    className={`rounded-sm inline-flex min-h-9 items-center gap-1.5 border px-2.5 text-body-small font-semibold disabled:opacity-50 ${excluded.has(participant.id) ? "border-warning bg-warning-soft text-warning" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}
                  >
                    <Prohibit size={14} />{excluded.has(participant.id) ? "Dikecualikan" : "Ikut"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton size="sm" variant="outlined" label={fromSource ? "Sunting kontak dan jawaban" : "Sunting peserta"} onClick={() => startEdit(participant)} disabled={editingId !== null || saving}><PencilSimple size={16} /></IconButton>
                    {/* Tombol hapus hanya untuk baris manual. Untuk baris scanner ia
                        tidak ditampilkan sama sekali: menampilkannya lalu menolak
                        dengan galat membuat aturan yang disengaja terbaca sebagai
                        kerusakan. */}
                    {!fromSource && <IconButton size="sm" variant="outlined" label="Hapus peserta manual" onClick={() => void remove(participant)} disabled={editingId !== null || saving} className="hover:text-error"><Trash size={16} /></IconButton>}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      </TableCard>
      {/* Pengendali halaman DI BAWAH kartu, bukan di dalamnya: ia bukan bagian
          dari data, ia alat untuk berpindah di antaranya. */}
      <Pagination
        page={page + 1}
        pageCount={totalPages}
        total={total}
        pageSize={perPage}
        onChange={(nomor) => setPage(nomor - 1)}
        // Mengubah jumlah per halaman memulangkan ke halaman pertama. Tanpa itu,
        // yang sedang di halaman 4 dari 25-per-halaman mendarat di halaman 4 dari
        // 100-per-halaman, yaitu baris ke-301 yang bisa saja tidak ada.
        onPageSizeChange={(ukuran) => { setPerPage(ukuran); setPage(0); }}
      />
      {adaFilter ? (
        // Saat menyaring, DUA angka disebut. Satu angka saja membuat admin
        // mengira peserta acaranya berkurang, dan itu kabar yang menakutkan di
        // hari-H.
        <p className="mt-1 text-body-small text-on-surface-variant">{activeTotal} peserta aktif seluruhnya.</p>
      ) : null}
    </>}

    {/* Modal tambah/sunting. Menggantikan penyuntingan di dalam baris: tabel ini
        punya belasan kolom dan menggulir horizontal, sehingga sel yang sedang
        disunting rutin berada di luar layar bersama tombol simpannya. */}
    <Dialog
      open={editingId !== null}
      onClose={cancelEdit}
      dismissible={!saving}
      size="lg"
      title={editingId === "new" ? "Tambah peserta manual" : (editingRow?.name ?? "Sunting peserta")}
      description={editingId === "new" ? "Peserta yang ditambah di sini tidak disentuh sinkronisasi Scanner API." : undefined}
      actions={
        <>
          <Button variant="outlined" disabled={saving} onClick={cancelEdit}>Batal</Button>
          <Button type="submit" form="form-peserta" loading={saving} disabled={!draft.name.trim() || !draft.qr_code.trim()} icon={<Check size={18} weight="bold" />}>
            {editingId === "new" ? "Tambah peserta" : "Simpan perubahan"}
          </Button>
        </>
      }
    >
      <form id="form-peserta" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {editingLocked && <p className="rounded-lg mt-5 flex items-start gap-2 border border-warning-soft-outline bg-warning-soft p-4 text-body-medium leading-6 text-on-warning-soft">
          <LockSimple size={18} className="mt-0.5 shrink-0" />
          <span>Peserta ini ditarik dari Scanner API. Nama, perusahaan, jabatan, kode QR, tipe, dan RSVP dikelola di sana dan akan ditimpa pada sync berikutnya — karena itu tidak dapat diubah dari sini. <span className="font-semibold">Email, telepon, dan jawaban formulir tetap bisa diisi</span>, karena Scanner API tidak mengirimnya.</span>
        </p>}

        {error && <p role="alert" className="rounded-lg mt-5 flex items-start gap-2 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-on-error-soft"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</p>}

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">{textField("Nama lengkap", "name", { locked: editingLocked, value: editingRow?.name, placeholder: "Nama peserta" })}</div>
          {textField("Perusahaan", "company", { locked: editingLocked, value: editingRow?.company ?? "", placeholder: "Opsional" })}
          {textField("Jabatan", "title", { locked: editingLocked, value: editingRow?.title ?? "", placeholder: "Opsional" })}
          {/* Kode QR dipisah barisnya sendiri secara visual lewat hint: ia satu-
              satunya kolom yang bentrokannya menolak penyimpanan, dan panitia perlu
              tahu itu sebelum mengetik, bukan sesudah galat muncul. */}
          {editingLocked
            ? field("Kode QR", <p className={`${lockedClass} font-mono`}><LockSimple size={14} className="mr-2 shrink-0" />{editingRow?.qr_code}</p>)
            : field("Kode QR", <input value={draft.qr_code} onChange={(event) => setDraft({ ...draft, qr_code: event.target.value })} className={`${inputClass} font-mono`} placeholder="REG000000" required />, "Harus unik di event ini. Kode inilah yang dipindai booth dan kasir.")}
          {textField("Tipe peserta", "participant_type", { locked: editingLocked, value: editingRow?.participant_type ?? "", placeholder: "mis. VIP, reguler" })}
          {editingLocked
            ? field("RSVP", <p className={lockedClass}><LockSimple size={14} className="mr-2 shrink-0" />{editingRow?.rsvp_status ?? "-"}</p>)
            : field("RSVP", <select value={draft.rsvp_status} onChange={(event) => setDraft({ ...draft, rsvp_status: event.target.value })} className={inputClass}>
                <option value="">Tidak diisi</option>
                <option value="invited">invited</option>
                <option value="confirmed">confirmed</option>
              </select>)}
          {/* Email dan telepon tidak pernah dikunci: Scanner API tidak mengirim
              kedua kolom ini, jadi sinkronisasi tidak punya nilai untuk menimpanya. */}
          {textField("Email", "email", { placeholder: "nama@contoh.com", type: "email" })}
          {textField("Telepon", "phone", { placeholder: "08xx / +62xx" })}
        </div>

        {/* Pertanyaan tambahan dari CMS pendaftaran, kontrol yang sama dengan
            formulir publik. Tanpa bagian ini, peserta yang ditambah panitia
            adalah warga kelas dua: ada di daftar, tapi tanpa jawaban yang
            dipunyai setiap pendaftar daring. Field wajib boleh dikosongkan
            panitia — mereka mendaftarkan tamu undangan yang jawabannya belum
            tentu diketahui. */}
        {fields.length > 0 ? (
          <div className="mt-8 border-t border-outline-variant pt-6">
            <p className="text-label-medium font-semibold ed-label text-on-surface-variant">Jawaban formulir pendaftaran</p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {fields.map((item) => <div key={item.key} className={item.type === "textarea" ? "sm:col-span-2" : undefined}>{jawabanField(item)}</div>)}
            </div>
          </div>
        ) : null}
      </form>
    </Dialog>
  </>;
}
