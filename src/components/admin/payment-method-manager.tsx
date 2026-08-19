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

  return <section className="rounded-lg bg-panel p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Metode pembayaran</h2>
        <p className="mt-2 text-body-medium text-on-surface-variant">Nyalakan atau matikan metode yang muncul di kasir. Minimal satu metode harus tetap aktif.</p>
      </div>
      {!formOpen && <button type="button" onClick={() => { setFormOpen(true); setError(""); }} className="rounded-md flex min-h-11 shrink-0 items-center gap-2 border border-outline-variant px-4 text-body-medium font-semibold hover:border-primary hover:text-primary"><Plus size={16} weight="bold" /> Tambah metode</button>}
    </div>

    {error && <div role="alert" className="rounded-lg mt-4 flex items-center gap-2 border border-error-soft-outline bg-error-soft p-3 text-body-medium text-error"><XCircle size={18} />{error}</div>}

    {loading ? <p className="mt-4 text-body-medium text-on-surface-variant">Memuat metode pembayaran...</p> : <ul className="mt-4 space-y-2">
      {methods.map((method) => {
        const lastActive = method.is_active && activeCount <= 1;
        return <li key={method.code} className={`rounded-lg flex flex-wrap items-center gap-3 border p-4 ${method.is_active ? "border-primary bg-primary-soft" : "border-outline-variant"}`}>
          {method.requires_reference ? <CreditCard size={20} className="shrink-0 text-primary" /> : <Money size={20} className="shrink-0 text-primary" />}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-body-medium font-semibold">
              {method.label}
              <span className="font-mono text-[11px] font-normal text-on-surface-variant">{method.code}</span>
              {method.is_builtin && <span className="rounded-sm bg-panel-high px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">Bawaan</span>}
            </p>
            <p className="mt-1 text-body-small text-on-surface-variant">
              {method.requires_reference ? `Butuh ${method.reference_label ?? "nomor referensi"} ${method.reference_digits} digit.` : "Tanpa nomor referensi."}
              {" "}
              {method.is_active ? "Aktif di kasir." : "Tidak muncul di kasir."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Tombol dimatikan saat ini satu-satunya metode aktif: kasir tidak boleh
                kehabisan opsi pembayaran di tengah acara. */}
            <button type="button" onClick={() => void toggle(method)} disabled={busyCode === method.code || lastActive} title={lastActive ? "Minimal satu metode harus aktif." : undefined} className={`rounded-md flex min-h-11 items-center gap-2 border px-3 text-body-small font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${method.is_active ? "border-primary text-primary-dim" : "border-outline-variant"}`}>
              {method.is_active ? <><CheckCircle size={15} weight="fill" /> Aktif</> : <>Nonaktif</>}
            </button>
            {!method.is_builtin && <button type="button" onClick={() => void remove(method)} disabled={busyCode === method.code} className="rounded-md flex min-h-11 items-center border border-outline-variant px-3 text-body-small font-semibold text-error hover:border-error disabled:opacity-45" aria-label={`Hapus ${method.label}`}><Trash size={15} /></button>}
          </div>
        </li>;
      })}
    </ul>}

    {formOpen && <div className="rounded-lg mt-4 border border-outline-variant bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-body-medium font-semibold">Metode baru</p>
        <button type="button" onClick={() => { setFormOpen(false); setForm(EMPTY_FORM); setError(""); }} className="flex min-h-9 items-center px-2 text-on-surface-variant hover:text-on-surface" aria-label="Tutup form"><X size={16} /></button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-body-small font-semibold">Nama tampilan
          <input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="QRIS" className="rounded-lg mt-1 h-12 w-full border border-outline-variant bg-panel px-3 text-body-medium outline-none focus:border-primary" />
        </label>
        <label className="block text-body-small font-semibold">Kode sistem
          <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} placeholder="qris" className="rounded-lg mt-1 h-12 w-full border border-outline-variant bg-panel px-3 font-mono text-body-medium outline-none focus:border-primary" />
        </label>
      </div>
      <p className="mt-2 text-body-small text-on-surface-variant">Kode dipakai di database dan laporan, tidak bisa diubah setelah dibuat. Huruf kecil, angka, dan underscore saja.</p>

      <label className="mt-4 flex cursor-pointer items-start gap-3 text-body-medium">
        <input type="checkbox" checked={form.requires_reference} onChange={(event) => setForm((current) => ({ ...current, requires_reference: event.target.checked }))} className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span><span className="block font-semibold">Butuh nomor referensi</span><span className="mt-0.5 block text-body-small text-on-surface-variant">Kasir wajib mengisi nomor referensi sebelum menandai lunas, seperti approval code EDC.</span></span>
      </label>

      {form.requires_reference && <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-body-small font-semibold">Label referensi
          <input value={form.reference_label} onChange={(event) => setForm((current) => ({ ...current, reference_label: event.target.value }))} placeholder="Nomor referensi QRIS" className="rounded-lg mt-1 h-12 w-full border border-outline-variant bg-panel px-3 text-body-medium outline-none focus:border-primary" />
        </label>
        <label className="block text-body-small font-semibold">Jumlah digit
          <input type="number" min={4} max={32} value={form.reference_digits} onChange={(event) => setForm((current) => ({ ...current, reference_digits: Math.max(4, Math.min(32, Number(event.target.value) || 4)) }))} className="rounded-lg mt-1 h-12 w-full border border-outline-variant bg-panel px-3 text-body-medium tabular-nums outline-none focus:border-primary" />
        </label>
      </div>}

      <button type="button" onClick={() => void create()} disabled={creating || !form.code.trim() || !form.label.trim()} className="rounded-md mt-4 flex min-h-12 w-full items-center justify-center gap-2 bg-primary text-body-medium font-semibold text-on-primary hover:bg-primary-dim disabled:cursor-not-allowed disabled:bg-panel-high disabled:text-on-surface-variant">
        <Plus size={16} weight="bold" />{creating ? "Menyimpan..." : "Tambah metode"}
      </button>
    </div>}

    <p className="mt-4 flex items-start gap-2 text-body-small text-on-surface-variant"><WarningCircle size={15} className="mt-0.5 shrink-0" /> Metode yang sudah dipakai order tidak dapat dihapus, hanya dimatikan, agar laporan tetap utuh. Kasir memuat ulang daftar metode tiap 30 detik.</p>
  </section>;
}
