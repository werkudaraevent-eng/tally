"use client";

import { ArrowLeft, ClipboardText, Funnel, Warning, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEventDateTime } from "@/lib/datetime";
import { useEventTimeZone } from "@/lib/use-event-timezone";

type Entry = {
  id: number;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
  order_id: string | null;
  actor_username: string;
  actor_role: string | null;
};

type Actor = { id: string; username: string; role: string };

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "config", label: "Perubahan konfigurasi" },
  { value: "settings", label: "Settings & Live Display" },
  { value: "offers", label: "Item spesial" },
  { value: "booths", label: "Booth" },
  { value: "payment_methods", label: "Metode pembayaran" },
  { value: "rundown", label: "Rundown acara" },
  { value: "users", label: "User & role" },
  { value: "danger", label: "Danger zone" },
  { value: "orders", label: "Transaksi" },
  { value: "sync", label: "Sync peserta" },
  { value: "all", label: "Semua aktivitas" },
];

const ACTION_LABEL: Record<string, string> = {
  settings_update: "Mengubah settings acara",
  display_settings_update: "Mengubah Live Display",
  display_background_upload: "Mengganti latar Live Display",
  leaderboard_reveal_config: "Mengatur reveal bertahap",
  leaderboard_reveal_start: "Memulai reveal bertahap",
  leaderboard_reveal_reset: "Mengakhiri reveal bertahap",
  special_offer_create: "Menambah item spesial",
  special_offer_update: "Mengubah item spesial",
  special_offer_delete: "Menghapus item spesial",
  booth_create: "Menambah booth",
  booth_update: "Mengubah booth",
  payment_method_create: "Menambah metode pembayaran",
  payment_method_update: "Mengubah metode pembayaran",
  payment_method_delete: "Menghapus metode pembayaran",
  rundown_header_update: "Mengubah header rundown",
  rundown_section_create: "Menambah bagian rundown",
  rundown_section_update: "Mengubah bagian rundown",
  rundown_section_delete: "Menghapus bagian rundown",
  rundown_item_create: "Menambah baris rundown",
  rundown_item_update: "Mengubah baris rundown",
  rundown_item_delete: "Menghapus baris rundown",
  user_create: "Membuat akun",
  user_update: "Mengubah akun",
  admin_reset_records: "Mengosongkan data pencatatan",
  participant_sync: "Sync peserta dari Scanner API",
  participant_qr_archived: "Mengarsipkan kode badge peserta",
  create: "Membuat order",
  pay: "Menandai lunas",
  void: "Void order",
  hand_over: "Menyerahkan barang",
  booth_order_created: "Order dibuat di booth",
  participant_scan: "Scan peserta",
};

// Label field dalam bahasa manusia. Tanpa ini, diff menampilkan nama kolom
// database yang tidak berarti bagi pembaca laporan audit.
const FIELD_LABEL: Record<string, string> = {
  pickup_mode: "Mode penyerahan barang",
  name_display_mode: "Tampilan nama di Live Display",
  leaderboard_enabled: "Leaderboard",
  mode: "Mode reveal",
  stage: "Tahap reveal",
  stages: "Daftar tahap",
  freeze_on_start: "Bekukan angka saat mulai",
  snapshot: "Snapshot papan",
  frozen_at: "Waktu pembekuan",
  pending_auto_void_minutes: "Auto-void (menit)",
  cashier_confirmation_required: "Konfirmasi kasir",
  name: "Nama",
  price: "Harga",
  stock: "Stok",
  scope: "Cakupan",
  booth_id: "Booth",
  is_active: "Status aktif",
  max_per_participant: "Maks per peserta",
  counts_toward_leaderboard: "Masuk top spender",
  conditions: "Syarat penawaran",
  sort_order: "Urutan",
  username: "Username",
  role: "Role",
  discount_item_name: "Nama item diskon",
  discount_item_price: "Harga item diskon",
  discount_item_stock: "Stok item diskon",
  discount_enabled: "Item diskon aktif",
  discount_limit_per_participant: "Maks item diskon per peserta",
  code: "Kode",
  label: "Label",
  requires_reference: "Butuh nomor referensi",
  reference_digits: "Jumlah digit referensi",
};

// Field yang tidak berarti bagi pembaca audit, atau selalu berubah tanpa makna.
const HIDDEN_FIELDS = new Set(["id", "updated_at", "updated_by", "created_at", "created_by", "pin_hash", "is_builtin"]);

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "kosong";
  if (typeof value === "boolean") return value ? "aktif" : "tidak";
  if (typeof value === "number") return new Intl.NumberFormat("id-ID").format(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Hanya field yang BENAR-BENAR berubah. Payload settings_update dan
// special_offer_update membawa objek old & new utuh; menampilkannya mentah berarti
// pembaca harus membandingkan belasan field sendiri untuk menemukan satu yang berubah.
function diffFields(payload: Record<string, unknown> | null): Array<{ field: string; from: string; to: string }> {
  if (!payload) return [];
  const old = payload.old as Record<string, unknown> | undefined;
  const next = payload.new as Record<string, unknown> | undefined;
  if (!old || !next) return [];

  const changes: Array<{ field: string; from: string; to: string }> = [];
  for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const before = JSON.stringify(old[key] ?? null);
    const after = JSON.stringify(next[key] ?? null);
    if (before !== after) changes.push({ field: FIELD_LABEL[key] ?? key, from: formatValue(old[key]), to: formatValue(next[key]) });
  }
  return changes;
}

// Ringkasan untuk payload yang tidak berbentuk old/new (create, delete, reset).
function summarise(entry: Entry): string {
  const payload = entry.payload ?? {};
  const subject = (payload.user ?? payload.booth ?? payload.new ?? payload.old) as Record<string, unknown> | undefined;
  if (entry.action === "admin_reset_records") {
    return `${payload.deleted_orders ?? 0} order, ${payload.deleted_claims ?? 0} klaim item, ${payload.deleted_participants ?? 0} peserta terhapus`;
  }
  if (entry.action === "participant_sync") {
    const synced = payload.synced as Record<string, unknown> | undefined;
    return `${payload.fetched ?? 0} peserta diterima · ${synced?.inserted ?? 0} baru · ${synced?.newly_removed ?? 0} ditandai hilang`;
  }
  if (entry.action === "participant_qr_archived") {
    return `${payload.old_qr_code ?? "?"} → ${payload.new_qr_code ?? "?"}`;
  }
  if (subject) {
    const name = subject.username ?? subject.name ?? subject.label ?? subject.code;
    return name ? String(name) : "";
  }
  return "";
}

export default function AuditTrailPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("config");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { zone, abbr } = useEventTimeZone();

  const PAGE_SIZE = 50;

  const load = useCallback(async (nextCategory: string, nextActor: string, pageIndex: number) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ category: nextCategory, limit: String(PAGE_SIZE), offset: String(pageIndex * PAGE_SIZE) });
      if (nextActor) params.set("actor", nextActor);
      const response = await fetch(`/api/admin/audit?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Audit trail gagal dimuat."); return; }
      setEntries(data.entries ?? []);
      setActors(data.actors ?? []);
      setTotal(data.total ?? 0);
    } catch { setError("Koneksi terputus. Coba lagi."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(category, actor, page); }, 0); return () => window.clearTimeout(timer); }, [load, category, actor, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Audit trail</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Jejak perubahan.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--ink-muted)]">Siapa mengubah apa dan kapan. Tercatat otomatis untuk settings, item spesial, booth, metode pembayaran, akun, dan pengosongan data. Halaman ini hanya dapat dibuka super admin.</p>
      </div>

      {error && <div role="alert" className="mt-6 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}

      <div className="mt-8 flex flex-wrap items-end gap-4 border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]"><Funnel size={16} /> Filter</div>
        <label className="block text-sm font-semibold">Kategori
          <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)] sm:w-64">
            {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Pelaku
          <select value={actor} onChange={(event) => { setActor(event.target.value); setPage(0); }} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)] sm:w-56">
            <option value="">Semua pelaku</option>
            {actors.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
          </select>
        </label>
        <p className="ml-auto text-xs text-[var(--ink-muted)]">{total} catatan</p>
      </div>

      {loading ? <p className="mt-8 text-sm text-[var(--ink-muted)]">Memuat audit trail...</p> : entries.length === 0 ? <div className="mt-8 flex min-h-48 flex-col items-center justify-center gap-3 border border-[var(--line)] bg-[var(--surface)] text-center text-sm text-[var(--ink-muted)]"><ClipboardText size={40} className="opacity-40" />Belum ada catatan untuk filter ini.</div> : <>
        <div className="mt-6 space-y-2">
          {entries.map((entry) => {
            const changes = diffFields(entry.payload);
            const summary = summarise(entry);
            const isDanger = entry.action === "admin_reset_records";
            const open = expanded === entry.id;
            return <section key={entry.id} className={`border bg-[var(--surface)] ${isDanger ? "border-[#E9C7C4]" : "border-[var(--line)]"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {isDanger && <Warning size={16} weight="fill" className="shrink-0 text-[var(--danger)]" />}
                    {ACTION_LABEL[entry.action] ?? entry.action}
                    {summary && <span className="font-normal text-[var(--ink-muted)]">· {summary}</span>}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    <span className="font-semibold text-[var(--ink)]">{entry.actor_username}</span>
                    {entry.actor_role && <span> ({entry.actor_role})</span>}
                    {" · "}{formatEventDateTime(entry.created_at, zone)} {abbr}
                  </p>

                  {/* Hanya field yang berubah, bukan seluruh payload. */}
                  {changes.length > 0 && <ul className="mt-3 space-y-1 border-t border-[var(--line)] pt-3 text-xs">
                    {changes.map((change) => <li key={change.field} className="flex flex-wrap items-baseline gap-1.5">
                      <span className="font-semibold">{change.field}:</span>
                      <span className="text-[var(--ink-muted)] line-through">{change.from}</span>
                      <span aria-hidden="true">→</span>
                      <span className="font-semibold text-[var(--brand-strong)]">{change.to}</span>
                    </li>)}
                  </ul>}
                </div>
                {entry.payload && <button type="button" onClick={() => setExpanded(open ? null : entry.id)} className="min-h-11 shrink-0 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">{open ? "Tutup detail" : "Detail"}</button>}
              </div>
              {open && <pre className="overflow-x-auto border-t border-[var(--line)] bg-[var(--surface-muted)] p-4 text-[11px] leading-5">{JSON.stringify(entry.payload, null, 2)}</pre>}
            </section>;
          })}
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row">
          <p className="text-xs text-[var(--ink-muted)]">Halaman {page + 1} dari {totalPages}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || loading} className="min-h-11 border border-[var(--line)] px-3 text-sm font-semibold disabled:opacity-40">Sebelumnya</button>
            <button onClick={() => setPage((current) => (current + 1 < totalPages ? current + 1 : current))} disabled={page + 1 >= totalPages || loading} className="min-h-11 border border-[var(--line)] px-3 text-sm font-semibold disabled:opacity-40">Berikutnya</button>
          </div>
        </div>
      </>}
    </div>
  </main>;
}
