"use client";

import { CheckCircle, CreditCard, Money, Plus, Trash, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";

type PaymentMethod = {
  code: string;
  label: string;
  requires_reference: boolean;
  reference_label: string | null;
  reference_digits: number | null;
  is_active: boolean;
  sort_order: number;
  is_builtin: boolean;
};

const EMPTY_FORM = { code: "", label: "", requires_reference: false, reference_label: "", reference_digits: 6 };

export function PaymentMethodManager() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState("");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/payment-methods", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Metode pembayaran gagal dimuat."); return; }
      setMethods(data.payment_methods ?? []);
    } catch { setError("Koneksi terputus. Coba lagi."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const activeCount = methods.filter((method) => method.is_active).length;

  async function toggle(method: PaymentMethod) {
    setBusyCode(method.code); setError("");
    const response = await fetch("/api/admin/payment-methods", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: method.code, is_active: !method.is_active }) });
    const data = await response.json();
    setBusyCode("");
    if (!response.ok) {
      const failure = data.error?.message ?? "Perubahan gagal disimpan.";
      setError(failure); toast.error("Gagal mengubah metode", failure);
      return;
    }
    setMethods((current) => current.map((item) => (item.code === method.code ? data : item)));
    toast.success(data.is_active ? `${data.label} dinyalakan` : `${data.label} dimatikan`, data.is_active ? "Kasir dapat memakai metode ini." : "Metode ini tidak lagi muncul di kasir.");
  }

  async function remove(method: PaymentMethod) {
    setBusyCode(method.code); setError("");
    const response = await fetch(`/api/admin/payment-methods?code=${encodeURIComponent(method.code)}`, { method: "DELETE" });
    const data = await response.json();
    setBusyCode("");
    if (!response.ok) {
      const failure = data.error?.message ?? "Metode gagal dihapus.";
      setError(failure); toast.error("Gagal menghapus metode", failure);
      return;
    }
    setMethods((current) => current.filter((item) => item.code !== method.code));
    toast.warning(`${method.label} dihapus`, "Metode tidak lagi tersedia di kasir.");
  }

  async function create() {
    setCreating(true); setError("");
    const response = await fetch("/api/admin/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code.trim().toLowerCase(),
        label: form.label.trim(),
        requires_reference: form.requires_reference,
        reference_label: form.requires_reference ? form.reference_label.trim() || "Nomor referensi" : null,
        reference_digits: form.requires_reference ? form.reference_digits : null,
        sort_order: 100,
      }),
    });
    const data = await response.json();
    setCreating(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Metode gagal dibuat.";
      setError(failure); toast.error("Gagal menambah metode", failure);
      return;
    }
    setMethods((current) => [...current, data].sort((a, b) => a.sort_order - b.sort_order));
    setForm(EMPTY_FORM); setFormOpen(false);
    toast.success(`${data.label} ditambahkan`, "Metode langsung tersedia di kasir.");
  }

  return <section className="bg-[var(--surface)] p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Metode pembayaran</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">Nyalakan atau matikan metode yang muncul di kasir. Minimal satu metode harus tetap aktif.</p>
      </div>
      {!formOpen && <button type="button" onClick={() => { setFormOpen(true); setError(""); }} className="flex min-h-11 shrink-0 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]"><Plus size={16} weight="bold" /> Tambah metode</button>}
    </div>

    {error && <div role="alert" className="mt-4 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-3 text-sm text-[var(--danger)]"><XCircle size={18} />{error}</div>}

    {loading ? <p className="mt-4 text-sm text-[var(--ink-muted)]">Memuat metode pembayaran...</p> : <ul className="mt-4 space-y-2">
      {methods.map((method) => {
        const lastActive = method.is_active && activeCount <= 1;
        return <li key={method.code} className={`flex flex-wrap items-center gap-3 border p-4 ${method.is_active ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)]"}`}>
          {method.requires_reference ? <CreditCard size={20} className="shrink-0 text-[var(--brand)]" /> : <Money size={20} className="shrink-0 text-[var(--brand)]" />}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {method.label}
              <span className="font-mono text-[11px] font-normal text-[var(--ink-muted)]">{method.code}</span>
              {method.is_builtin && <span className="rounded-sm bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Bawaan</span>}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              {method.requires_reference ? `Butuh ${method.reference_label ?? "nomor referensi"} ${method.reference_digits} digit.` : "Tanpa nomor referensi."}
              {" "}
              {method.is_active ? "Aktif di kasir." : "Tidak muncul di kasir."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Tombol dimatikan saat ini satu-satunya metode aktif: kasir tidak boleh
                kehabisan opsi pembayaran di tengah acara. */}
            <button type="button" onClick={() => void toggle(method)} disabled={busyCode === method.code || lastActive} title={lastActive ? "Minimal satu metode harus aktif." : undefined} className={`flex min-h-11 items-center gap-2 border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${method.is_active ? "border-[var(--brand)] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}>
              {method.is_active ? <><CheckCircle size={15} weight="fill" /> Aktif</> : <>Nonaktif</>}
            </button>
            {!method.is_builtin && <button type="button" onClick={() => void remove(method)} disabled={busyCode === method.code} className="flex min-h-11 items-center border border-[var(--line)] px-3 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-45" aria-label={`Hapus ${method.label}`}><Trash size={15} /></button>}
          </div>
        </li>;
      })}
    </ul>}

    {formOpen && <div className="mt-4 border border-[var(--line)] bg-[var(--background)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Metode baru</p>
        <button type="button" onClick={() => { setFormOpen(false); setForm(EMPTY_FORM); setError(""); }} className="flex min-h-9 items-center px-2 text-[var(--ink-muted)] hover:text-[var(--ink)]" aria-label="Tutup form"><X size={16} /></button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold">Nama tampilan
          <input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="QRIS" className="mt-1 h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
        </label>
        <label className="block text-xs font-semibold">Kode sistem
          <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} placeholder="qris" className="mt-1 h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-3 font-mono text-sm outline-none focus:border-[var(--brand)]" />
        </label>
      </div>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">Kode dipakai di database dan laporan, tidak bisa diubah setelah dibuat. Huruf kecil, angka, dan underscore saja.</p>

      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={form.requires_reference} onChange={(event) => setForm((current) => ({ ...current, requires_reference: event.target.checked }))} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
        <span><span className="block font-semibold">Butuh nomor referensi</span><span className="mt-0.5 block text-xs text-[var(--ink-muted)]">Kasir wajib mengisi nomor referensi sebelum menandai lunas, seperti approval code EDC.</span></span>
      </label>

      {form.requires_reference && <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold">Label referensi
          <input value={form.reference_label} onChange={(event) => setForm((current) => ({ ...current, reference_label: event.target.value }))} placeholder="Nomor referensi QRIS" className="mt-1 h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
        </label>
        <label className="block text-xs font-semibold">Jumlah digit
          <input type="number" min={4} max={32} value={form.reference_digits} onChange={(event) => setForm((current) => ({ ...current, reference_digits: Math.max(4, Math.min(32, Number(event.target.value) || 4)) }))} className="mt-1 h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
        </label>
      </div>}

      <button type="button" onClick={() => void create()} disabled={creating || !form.code.trim() || !form.label.trim()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-muted)]">
        <Plus size={16} weight="bold" />{creating ? "Menyimpan..." : "Tambah metode"}
      </button>
    </div>}

    <p className="mt-4 flex items-start gap-2 text-xs text-[var(--ink-muted)]"><WarningCircle size={15} className="mt-0.5 shrink-0" /> Metode yang sudah dipakai order tidak dapat dihapus, hanya dimatikan, agar laporan tetap utuh. Kasir memuat ulang daftar metode tiap 30 detik.</p>
  </section>;
}
