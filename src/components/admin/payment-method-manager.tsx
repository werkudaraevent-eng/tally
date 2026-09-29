"use client";

import { CreditCard, Money, Plus, Trash, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button, Dialog, EmptyState, IconButton, Pane, PaneBody, PaneFooter, PaneHeader, StatusChip, Switch, TextField } from "@/components/m3";

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

/** Tab "Pembayaran" di Pengaturan: metode yang muncul di layar kasir. */
export function PaymentMethodManager() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyCode, setBusyCode] = useState("");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PaymentMethod | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/admin/payment-methods", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setLoadError(data.error?.message ?? "Metode pembayaran gagal dimuat."); return; }
      setMethods(data.payment_methods ?? []);
    } catch { setLoadError("Koneksi terputus. Coba lagi."); } finally { setLoading(false); }
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
    setConfirmDelete(null);
    if (!response.ok) {
      const failure = data.error?.message ?? "Metode gagal dihapus.";
      setError(failure); toast.error("Gagal menghapus metode", failure);
      return;
    }
    setMethods((current) => current.filter((item) => item.code !== method.code));
    toast.warning(`${method.label} dihapus`, "Metode tidak lagi tersedia di kasir.");
  }

  function closeForm() { setFormOpen(false); setForm(EMPTY_FORM); setFormError(""); }

  async function create() {
    setCreating(true); setFormError("");
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
      setFormError(failure); toast.error("Gagal menambah metode", failure);
      return;
    }
    setMethods((current) => [...current, data].sort((a, b) => a.sort_order - b.sort_order));
    closeForm();
    toast.success(`${data.label} ditambahkan`, "Metode langsung tersedia di kasir.");
  }

  return (
    <>
      <Pane aria-label="Metode pembayaran">
        <PaneHeader className="px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-body-medium font-semibold text-on-surface">Metode pembayaran</h2>
            <p className="mt-0.5 text-body-medium text-on-surface-variant">Nyalakan atau matikan metode yang muncul di kasir. Minimal satu metode harus tetap aktif.</p>
          </div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => { setFormOpen(true); setFormError(""); }}>Tambah metode</Button>
        </PaneHeader>

        <PaneBody>
          {error ? <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p> : null}
          {loadError ? (
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{loadError}</p>
              <Button variant="outlined" size="sm" onClick={() => void load()}>Coba lagi</Button>
            </div>
          ) : loading ? (
            <div aria-label="Memuat metode pembayaran">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-outline-variant px-5 py-4 last:border-b-0">
                  <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
                  <div className="ml-auto h-5 w-9 animate-pulse rounded-full bg-surface-container-high" />
                </div>
              ))}
            </div>
          ) : methods.length === 0 ? (
            <EmptyState plain icon={<CreditCard size={40} />} title="Belum ada metode pembayaran" description="Tambahkan metode agar kasir bisa menandai order lunas." />
          ) : (
            <ul>
              {methods.map((method) => {
                const lastActive = method.is_active && activeCount <= 1;
                const busy = busyCode === method.code;
                return (
                  <li key={method.code} className="flex items-start gap-3 border-b border-outline-variant px-5 py-3.5 last:border-b-0">
                    {method.requires_reference
                      ? <CreditCard size={20} aria-hidden className="mt-0.5 shrink-0 text-on-surface-variant" />
                      : <Money size={20} aria-hidden className="mt-0.5 shrink-0 text-on-surface-variant" />}
                    {/* Sakelar dimatikan saat ini satu-satunya metode aktif: kasir
                        tidak boleh kehabisan opsi pembayaran di tengah acara. */}
                    <Switch
                      className="min-w-0 flex-1"
                      checked={method.is_active}
                      disabled={busy || lastActive}
                      onChange={() => void toggle(method)}
                      label={
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {method.label}
                          {method.is_builtin ? <StatusChip>Bawaan</StatusChip> : null}
                        </span>
                      }
                      description={
                        <>
                          Kode {method.code}.{" "}
                          {method.requires_reference ? `Butuh ${method.reference_label ?? "nomor referensi"} ${method.reference_digits} digit.` : "Tanpa nomor referensi."}
                          {lastActive ? " Satu-satunya metode aktif, jadi tidak bisa dimatikan." : ""}
                        </>
                      }
                    />
                    {!method.is_builtin ? (
                      <IconButton size="sm" label={`Hapus ${method.label}`} disabled={busy} onClick={() => setConfirmDelete(method)}>
                        <Trash size={16} className="text-error" />
                      </IconButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </PaneBody>

        <PaneFooter note="Metode yang sudah dipakai order tidak dapat dihapus, hanya dimatikan, agar laporan tetap utuh. Kasir memuat ulang daftar metode tiap 30 detik." />
      </Pane>

      <Dialog
        open={formOpen}
        onClose={closeForm}
        dismissible={!creating}
        title="Tambah metode pembayaran"
        description="Metode baru langsung aktif dan muncul di layar kasir."
        actions={
          <>
            <Button variant="outlined" disabled={creating} onClick={closeForm}>Batal</Button>
            <Button loading={creating} disabled={!form.code.trim() || !form.label.trim()} onClick={() => void create()}>Tambah metode</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-body-medium">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nama tampilan" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="QRIS" />
            <TextField
              label="Kode sistem"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
              placeholder="qris"
            />
          </div>
          <p className="text-on-surface-variant">Kode dipakai di database dan laporan, tidak bisa diubah setelah dibuat. Huruf kecil, angka, dan garis bawah saja.</p>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={form.requires_reference} onChange={(event) => setForm((current) => ({ ...current, requires_reference: event.target.checked }))} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
            <span>
              <span className="block font-medium">Butuh nomor referensi</span>
              <span className="mt-0.5 block text-on-surface-variant">Kasir wajib mengisi nomor referensi sebelum menandai lunas, seperti approval code EDC.</span>
            </span>
          </label>
          {form.requires_reference ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Label referensi" value={form.reference_label} onChange={(event) => setForm((current) => ({ ...current, reference_label: event.target.value }))} placeholder="Nomor referensi QRIS" />
              <TextField
                label="Jumlah digit"
                type="number"
                min={4}
                max={32}
                value={form.reference_digits}
                onChange={(event) => setForm((current) => ({ ...current, reference_digits: Math.max(4, Math.min(32, Number(event.target.value) || 4)) }))}
                inputClassName="tabular-nums"
              />
            </div>
          ) : null}
          {formError ? <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{formError}</p> : null}
        </div>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        dismissible={busyCode === ""}
        tone="danger"
        title={`Hapus ${confirmDelete?.label ?? "metode"}?`}
        description="Metode hilang dari layar kasir dan penghapusannya tercatat di jejak audit. Bila metode ini sudah dipakai order, server menolak penghapusan; matikan saja sakelarnya."
        actions={
          <>
            <Button variant="outlined" disabled={busyCode !== ""} onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="danger" loading={busyCode !== "" && busyCode === confirmDelete?.code} onClick={() => { if (confirmDelete) void remove(confirmDelete); }}>Hapus metode</Button>
          </>
        }
      />
    </>
  );
}
