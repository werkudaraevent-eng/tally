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
      if (!response.ok) { setLoadError(data.error?.message ?? "Payment methods could not be loaded."); return; }
      setMethods(data.payment_methods ?? []);
    } catch { setLoadError("Connection lost. Try again."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const activeCount = methods.filter((method) => method.is_active).length;

  async function toggle(method: PaymentMethod) {
    setBusyCode(method.code); setError("");
    const response = await fetch("/api/admin/payment-methods", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: method.code, is_active: !method.is_active }) });
    const data = await response.json();
    setBusyCode("");
    if (!response.ok) {
      const failure = data.error?.message ?? "The change could not be saved.";
      setError(failure); toast.error("Method not changed", failure);
      return;
    }
    setMethods((current) => current.map((item) => (item.code === method.code ? data : item)));
    toast.success(data.is_active ? `${data.label} turned on` : `${data.label} turned off`, data.is_active ? "Cashiers can use this method." : "This method no longer shows at the cashier.");
  }

  async function remove(method: PaymentMethod) {
    setBusyCode(method.code); setError("");
    const response = await fetch(`/api/admin/payment-methods?code=${encodeURIComponent(method.code)}`, { method: "DELETE" });
    const data = await response.json();
    setBusyCode("");
    setConfirmDelete(null);
    if (!response.ok) {
      const failure = data.error?.message ?? "The method could not be deleted.";
      setError(failure); toast.error("Method not deleted", failure);
      return;
    }
    setMethods((current) => current.filter((item) => item.code !== method.code));
    toast.warning(`${method.label} deleted`, "The method is no longer available at the cashier.");
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
        reference_label: form.requires_reference ? form.reference_label.trim() || "Reference number" : null,
        reference_digits: form.requires_reference ? form.reference_digits : null,
        sort_order: 100,
      }),
    });
    const data = await response.json();
    setCreating(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "The method could not be created.";
      setFormError(failure); toast.error("Method not added", failure);
      return;
    }
    setMethods((current) => [...current, data].sort((a, b) => a.sort_order - b.sort_order));
    closeForm();
    toast.success(`${data.label} added`, "The method is available at the cashier straight away.");
  }

  return (
    <>
      <Pane aria-label="Payment methods">
        <PaneHeader className="px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-body-medium font-semibold text-on-surface">Payment methods</h2>
            <p className="mt-0.5 text-body-medium text-on-surface-variant">Turn on or off the methods shown at the cashier. At least one method must stay active.</p>
          </div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => { setFormOpen(true); setFormError(""); }}>Add method</Button>
        </PaneHeader>

        <PaneBody>
          {error ? <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p> : null}
          {loadError ? (
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{loadError}</p>
              <Button variant="outlined" size="sm" onClick={() => void load()}>Try again</Button>
            </div>
          ) : loading ? (
            <div aria-label="Loading payment methods">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-outline-variant px-5 py-4 last:border-b-0">
                  <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
                  <div className="ml-auto h-5 w-9 animate-pulse rounded-full bg-surface-container-high" />
                </div>
              ))}
            </div>
          ) : methods.length === 0 ? (
            <EmptyState plain icon={<CreditCard size={40} />} title="No payment methods yet" description="Add a method so cashiers can mark orders paid." />
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
                    <Switch simpan
                      className="min-w-0 flex-1"
                      checked={method.is_active}
                      disabled={busy || lastActive}
                      onChange={() => void toggle(method)}
                      label={
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {method.label}
                          {method.is_builtin ? <StatusChip>Built-in</StatusChip> : null}
                        </span>
                      }
                      description={
                        <>
                          Code {method.code}.{" "}
                          {method.requires_reference ? `Needs a ${method.reference_digits}-digit ${method.reference_label ?? "reference number"}.` : "No reference number."}
                          {lastActive ? " The only active method, so it cannot be turned off." : ""}
                        </>
                      }
                    />
                    {!method.is_builtin ? (
                      <IconButton size="sm" label={`Delete ${method.label}`} disabled={busy} onClick={() => setConfirmDelete(method)}>
                        <Trash size={16} className="text-error" />
                      </IconButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </PaneBody>

        <PaneFooter note="A method already used by an order cannot be deleted, only turned off, so reports stay complete. The cashier reloads the method list every 30 seconds." />
      </Pane>

      <Dialog
        open={formOpen}
        onClose={closeForm}
        dismissible={!creating}
        title="Add payment method"
        description="A new method is active straight away and shows on the cashier screen."
        actions={
          <>
            <Button variant="outlined" disabled={creating} onClick={closeForm}>Cancel</Button>
            <Button simpan loading={creating} disabled={!form.code.trim() || !form.label.trim()} onClick={() => void create()}>Add method</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-body-medium">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Display name" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="QRIS" />
            <TextField
              label="System code"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
              placeholder="qris"
            />
          </div>
          <p className="text-on-surface-variant">The code is used in the database and reports and cannot be changed later. Lowercase letters, digits and underscores only.</p>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={form.requires_reference} onChange={(event) => setForm((current) => ({ ...current, requires_reference: event.target.checked }))} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
            <span>
              <span className="block font-medium">Needs a reference number</span>
              <span className="mt-0.5 block text-on-surface-variant">The cashier must enter a reference number before marking the order paid, such as an EDC approval code.</span>
            </span>
          </label>
          {form.requires_reference ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Reference label" value={form.reference_label} onChange={(event) => setForm((current) => ({ ...current, reference_label: event.target.value }))} placeholder="QRIS reference number" />
              <TextField
                label="Number of digits"
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
        title={`Delete ${confirmDelete?.label ?? "method"}?`}
        description="The method disappears from the cashier screen and the deletion is recorded in the audit trail. If an order already used this method, the server refuses; turn its switch off instead."
        actions={
          <>
            <Button variant="outlined" disabled={busyCode !== ""} onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busyCode !== "" && busyCode === confirmDelete?.code} onClick={() => { if (confirmDelete) void remove(confirmDelete); }}>Delete method</Button>
          </>
        }
      />
    </>
  );
}
