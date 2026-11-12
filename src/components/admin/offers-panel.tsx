"use client";

import { Check, LockSimple, Plus, Tag, Trash, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useImperativeHandle, useState } from "react";
import {
  Button, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, Pane, PaneBody, PaneFooter, StatusChip, Switch,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { ConditionBuilder, describeConditions } from "@/components/admin/condition-builder";
import { cx } from "@/lib/m3/cx";
import type { OfferConditionGroup } from "@/lib/domain";
import { INPUT, Field } from "@/components/admin/compact-form";

type Offer = {
  id: number;
  code: string;
  name: string;
  price: number;
  stock: number | null;
  scope: "per_booth" | "global";
  booth_id: number | null;
  max_per_participant: number;
  conditions: OfferConditionGroup;
  counts_toward_leaderboard: boolean;
  is_active: boolean;
  sort_order: number;
  is_builtin: boolean;
  claim_count: number;
};

type BoothOption = { id: number; code: string; name: string };

export type OffersPanelHandle = { tambah: () => void };
export type OfferStats = { total: number; aktif: number };

const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
const digitsOnly = (value: string) => value.replace(/\D/g, "");
const grouped = (digits: string) => (digits ? new Intl.NumberFormat("id-ID").format(Number(digits)) : "");


const EMPTY_CONDITIONS: OfferConditionGroup = {
  op: "and",
  children: [{ var: "total_spend", scope: "all_booths", cmp: "gte", value: 500000 }],
};

const EMPTY_FORM = {
  code: "",
  name: "",
  price: "50000",
  stock: "",
  scope: "global" as "global" | "per_booth",
  booth_id: 0,
  max_per_participant: "1",
  conditions: EMPTY_CONDITIONS,
  counts_toward_leaderboard: true,
};

type EditForm = { name: string; price: string; stock: string; max_per_participant: string; scope: "global" | "per_booth"; booth_id: number; conditions: OfferConditionGroup };

/** Pilihan cakupan: dua kartu radio bernama, dipakai form baru dan form sunting. */
function PilihCakupan({ name, value, onChange, booths, boothId, onBooth, detail }: {
  name: string;
  value: "global" | "per_booth";
  onChange: (value: "global" | "per_booth") => void;
  booths: BoothOption[];
  boothId: number;
  onBooth: (id: number) => void;
  detail: Record<"global" | "per_booth", string>;
}) {
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Applies at</legend>
        {([["global", "All booths"], ["per_booth", "One booth"]] as const).map(([option, label]) => {
          const on = value === option;
          return (
            <label key={option} className={cx("flex cursor-pointer gap-3 rounded-lg border p-3 text-body-medium", on ? "border-2 border-primary" : "border-outline")}>
              <input type="radio" name={name} checked={on} onChange={() => onChange(option)} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-on-surface-variant">{detail[option]}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {value === "per_booth" ? (
        <Field className="min-w-0" label="Booth" htmlFor={`${name}-booth`}>
          <select id={`${name}-booth`} value={boothId} onChange={(event) => onBooth(Number(event.target.value))} className={INPUT}>
            <option value={0}>Pick a booth</option>
            {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
          </select>
        </Field>
      ) : null}
    </>
  );
}

export function OffersPanel({ onStats, ref }: { onStats?: (stats: OfferStats) => void; ref?: React.Ref<OffersPanelHandle> }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [booths, setBooths] = useState<BoothOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(0);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  // Penawaran yang sedang disunting. `code` tidak dapat diubah karena dirujuk
  // klaim historis, jadi tampil sebagai teks saja.
  const [editing, setEditing] = useState<Offer | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", price: "", stock: "", max_per_participant: "", scope: "global", booth_id: 0, conditions: { op: "and", children: [] } });
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Offer | null>(null);
  const toast = useToast();

  // Cakupan hanya boleh diubah selama penawaran belum pernah diklaim dan bukan
  // bawaan booth. Bawaan booth terikat booth-nya (partial unique index + trigger
  // sinkronisasi), dan klaim yang sudah ada dicatat terhadap cakupan saat itu.
  function canEditScope(offer: Offer | null): boolean {
    return Boolean(offer) && !offer!.is_builtin && offer!.claim_count === 0;
  }

  function openEdit(offer: Offer) {
    setFormOpen(false);
    setEditing(offer);
    setEditForm({
      name: offer.name,
      price: String(offer.price),
      stock: offer.stock === null ? "" : String(offer.stock),
      max_per_participant: String(offer.max_per_participant),
      scope: offer.scope,
      booth_id: offer.booth_id ?? 0,
      conditions: offer.conditions ?? { op: "and", children: [] },
    });
    setFormError("");
  }

  function tambah() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  }
  useImperativeHandle(ref, () => ({ tambah }));

  function tutup() { setEditing(null); setFormOpen(false); setForm(EMPTY_FORM); setFormError(""); }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [offerResponse, boothResponse] = await Promise.all([
        fetch("/api/admin/offers", { cache: "no-store" }),
        fetch("/api/admin/booths", { cache: "no-store" }),
      ]);
      const offerData = await offerResponse.json();
      if (!offerResponse.ok) { setError(offerData.error?.message ?? "Could not load offers."); return; }
      const rows = (offerData.offers ?? []) as Offer[];
      setOffers(rows);
      onStats?.({ total: rows.length, aktif: rows.filter((offer) => offer.is_active).length });
      if (boothResponse.ok) setBooths(((await boothResponse.json()).booths ?? []) as BoothOption[]);
    } catch { setError("Connection lost. Try again."); } finally { setLoading(false); }
  }, [onStats]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function saveEdit() {
    if (!editing) return;
    setSavingEdit(true); setFormError("");
    const response = await fetch("/api/admin/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: editForm.name.trim(),
        price: Number(editForm.price) || 0,
        stock: editForm.stock === "" ? null : Number(editForm.stock),
        max_per_participant: Number(editForm.max_per_participant) || 0,
        conditions: editForm.conditions,
        // Hanya dikirim bila memang boleh diubah, agar penawaran bawaan atau yang
        // sudah diklaim tidak ditolak server hanya karena field ikut terkirim.
        ...(canEditScope(editing) ? { scope: editForm.scope, booth_id: editForm.scope === "per_booth" ? editForm.booth_id : null } : {}),
      }),
    }).catch(() => null);
    setSavingEdit(false);
    if (!response) { setFormError("Connection lost. Changes may not be saved; reload to check."); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Could not save changes.";
      setFormError(failure); toast.error("Could not save", failure);
      return;
    }
    toast.success(`${data.name} diperbarui`, editing.claim_count > 0 ? `${editing.claim_count} earlier claims keep the price at the time of claim.` : "Applies to the next claims.");
    setEditing({ ...editing, ...data });
    void load();
  }

  async function patch(offer: Offer, changes: Partial<Offer>, successMessage: string) {
    setBusyId(offer.id); setFormError("");
    const response = await fetch("/api/admin/offers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: offer.id, ...changes }) }).catch(() => null);
    setBusyId(0);
    if (!response) { setFormError("Connection lost. Changes may not be saved."); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Could not save changes.";
      setFormError(failure); toast.error("Could not save", failure);
      return;
    }
    const next = offers.map((item) => (item.id === offer.id ? { ...item, ...data } : item));
    setOffers(next);
    onStats?.({ total: next.length, aktif: next.filter((item) => item.is_active).length });
    toast.success(successMessage, `${offer.name} diperbarui.`);
  }

  async function remove(offer: Offer) {
    setBusyId(offer.id); setFormError("");
    const response = await fetch(`/api/admin/offers?id=${offer.id}`, { method: "DELETE" }).catch(() => null);
    setBusyId(0);
    setConfirmDelete(null);
    if (!response) { setFormError("Connection lost. Reload to see whether the item was deleted."); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = data.error?.message ?? "Could not delete the offer.";
      setFormError(failure); toast.error("Could not delete", failure);
      return;
    }
    const next = offers.filter((item) => item.id !== offer.id);
    setOffers(next);
    onStats?.({ total: next.length, aktif: next.filter((item) => item.is_active).length });
    if (editing?.id === offer.id) setEditing(null);
    toast.warning(`${offer.name} deleted`, "The offer is no longer available at booths.");
  }

  async function create() {
    setCreating(true); setFormError("");
    const response = await fetch("/api/admin/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code.trim().toLowerCase(),
        name: form.name.trim(),
        price: Number(form.price) || 0,
        stock: form.stock === "" ? null : Number(form.stock),
        scope: form.scope,
        booth_id: form.scope === "per_booth" ? form.booth_id || null : null,
        max_per_participant: Number(form.max_per_participant) || 1,
        conditions: form.conditions,
        counts_toward_leaderboard: form.counts_toward_leaderboard,
        sort_order: 900,
      }),
    }).catch(() => null);
    setCreating(false);
    if (!response) { setFormError("Connection lost. The item may not be saved; reload to check."); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Could not create the offer.";
      setFormError(failure); toast.error("Could not add the offer", failure);
      return;
    }
    setForm(EMPTY_FORM); setFormOpen(false);
    toast.success(`${data.name} ditambahkan`, "The offer is available at booths right away.");
    void load();
  }

  const boothLabel = (id: number | null) => booths.find((booth) => booth.id === id)?.code ?? `Booth ${id}`;
  const terpilih = editing ? offers.find((offer) => offer.id === editing.id) ?? editing : null;

  // ---- Panel daftar --------------------------------------------------------
  const list = (
    <Pane aria-label="Special items">
      <PaneBody>
        {error ? (
          <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</p>
        ) : loading && offers.length === 0 ? (
          <div aria-label="Loading special items" className="flex flex-col">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-6 border-b border-outline-variant px-4 py-4">
                <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
                <div className="ml-auto h-3 w-24 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : offers.length === 0 ? (
          <EmptyState
            plain
            icon={<Tag size={40} />}
            title="No special items yet"
            description="The default discount item appears once a booth is created. Add conditional offers here, such as a low-price add-on."
            action={<Button variant="outlined" size="sm" onClick={tambah}>Add item</Button>}
          />
        ) : (
          <table className={cx("w-full min-w-[620px] border-separate border-spacing-0 text-left text-body-medium", loading && "opacity-60")}>
            <thead className="sticky top-0 z-10 bg-surface-container-high text-on-surface-variant">
              <tr>
                <th scope="col" className="border-b border-outline-variant px-4 py-2.5 font-medium">Item</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Applies at</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 text-right font-medium">Price</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 text-right font-medium">Claimed</th>
                <th scope="col" className="border-b border-outline-variant px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => {
                const aktif = editing?.id === offer.id;
                const pilih = () => (aktif ? tutup() : openEdit(offer));
                return (
                  <tr key={offer.id} onClick={pilih} className={cx("cursor-pointer", aktif ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft")}>
                    <td className="border-b border-outline-variant px-4 py-2.5">
                      <button type="button" aria-pressed={aktif} onClick={(event) => { event.stopPropagation(); pilih(); }} className="block rounded-sm text-left">
                        <span className="block font-medium text-on-surface">{offer.name}</span>
                        <span className="block text-on-surface-variant">{offer.code}{offer.is_builtin ? " · booth default" : ""}</span>
                      </button>
                    </td>
                    <td className="border-b border-outline-variant px-3 py-2.5">{offer.scope === "global" ? "All booths" : boothLabel(offer.booth_id)}</td>
                    <td className="border-b border-outline-variant px-3 py-2.5 text-right tabular-nums">{formatRupiah(offer.price)}</td>
                    <td className="border-b border-outline-variant px-3 py-2.5 text-right tabular-nums">{offer.claim_count}</td>
                    <td className="border-b border-outline-variant px-4 py-2.5">
                      <StatusChip dot tone={offer.is_active ? "success" : "neutral"}>{offer.is_active ? "On" : "Off"}</StatusChip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PaneBody>
      <PaneFooter
        className="bg-surface-container-lowest py-2.5"
        note="Booth default items follow their booth's settings. Items that have been claimed cannot be deleted, only turned off."
      />
    </Pane>
  );

  const galat = formError ? (
    <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{formError}</p>
  ) : null;

  // ---- Panel item baru -----------------------------------------------------
  const pembuat = formOpen ? (
    <Pane as="aside" aria-label="New special item">
      <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-title-medium font-semibold">New special item</h2>
          <p className="text-body-medium text-on-surface-variant">Available at booths as soon as it is added.</p>
        </div>
        <IconButton size="sm" label="Close" onClick={tutup} disabled={creating}><X size={16} /></IconButton>
      </div>
      <PaneBody>
        <form id="form-item-baru" onSubmit={(event) => { event.preventDefault(); void create(); }}>
          {galat}
          <DetailSection>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field className="min-w-0" label="Item name" htmlFor="offer-new-name">
                <input id="offer-new-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Tebus Murah" className={INPUT} />
              </Field>
              <Field className="min-w-0" label="System code" htmlFor="offer-new-code">
                <input id="offer-new-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} placeholder="tebus_murah" className={INPUT} />
              </Field>
              <Field className="min-w-0" label="Price (Rp)" htmlFor="offer-new-price">
                <input id="offer-new-price" value={grouped(form.price)} onChange={(event) => setForm((current) => ({ ...current, price: digitsOnly(event.target.value) }))} inputMode="numeric" className={cx(INPUT, "tabular-nums")} />
              </Field>
              <Field className="min-w-0" label="Stock" htmlFor="offer-new-stock">
                <input id="offer-new-stock" value={grouped(form.stock)} onChange={(event) => setForm((current) => ({ ...current, stock: digitsOnly(event.target.value) }))} inputMode="numeric" placeholder="Unlimited" className={cx(INPUT, "tabular-nums")} />
              </Field>
              <Field className="min-w-0" label="Maximum per participant" htmlFor="offer-new-max">
                <input id="offer-new-max" value={form.max_per_participant} onChange={(event) => setForm((current) => ({ ...current, max_per_participant: digitsOnly(event.target.value) }))} inputMode="numeric" className={cx(INPUT, "tabular-nums")} />
              </Field>
            </div>
            <p className="text-body-medium text-on-surface-variant">The code is used in the database and reports and cannot be changed after creation. Empty stock means unlimited.</p>
          </DetailSection>
          <DetailSection title="Applies at">
            <PilihCakupan
              name="offer-new-scope"
              value={form.scope}
              onChange={(scope) => setForm((current) => ({ ...current, scope }))}
              booths={booths}
              boothId={form.booth_id}
              onBooth={(id) => setForm((current) => ({ ...current, booth_id: id }))}
              detail={{ global: "One quota for the whole event. Participants can redeem it at any booth.", per_booth: "Only applies at the chosen booth." }}
            />
          </DetailSection>
          <DetailSection title="Offer conditions">
            <p className="text-body-medium text-on-surface-variant">Counted from paid orders only. Leave empty to open the offer to every participant.</p>
            <ConditionBuilder value={form.conditions} booths={booths} onChange={(next) => setForm((current) => ({ ...current, conditions: next }))} />
          </DetailSection>
          <DetailSection>
            <Switch
              checked={form.counts_toward_leaderboard}
              onChange={(checked) => setForm((current) => ({ ...current, counts_toward_leaderboard: checked }))}
              label="Counts towards top spender"
              description="This item's price is added to the participant's total spending on the Leaderboard. The value is stored per claim, so changing it later does not change figures already shown."
            />
          </DetailSection>
        </form>
      </PaneBody>
      <PaneFooter>
        <Button type="button" variant="outlined" size="sm" disabled={creating} onClick={tutup}>Cancel</Button>
        <Button type="submit" form="form-item-baru" size="sm" loading={creating} disabled={!form.code.trim() || !form.name.trim() || (form.scope === "per_booth" && !form.booth_id)} icon={<Plus size={16} weight="bold" />}>
          Add item
        </Button>
      </PaneFooter>
    </Pane>
  ) : null;

  // ---- Panel sunting -------------------------------------------------------
  const penyunting = terpilih ? (() => {
    const offer = terpilih;
    const sibuk = busyId === offer.id;
    return (
      <Pane as="aside" aria-label={`Edit ${offer.name}`}>
        <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-title-medium font-semibold">{offer.name}</h2>
              <StatusChip dot tone={offer.is_active ? "success" : "neutral"}>{offer.is_active ? "On" : "Off"}</StatusChip>
              {offer.is_builtin ? <StatusChip>Booth default</StatusChip> : null}
            </div>
            <p className="text-body-medium text-on-surface-variant">{offer.code} · diklaim {offer.claim_count}x · {describeConditions(offer.conditions ?? { op: "and", children: [] }, booths)}</p>
          </div>
          <IconButton size="sm" label="Close" onClick={tutup} disabled={savingEdit}><X size={16} /></IconButton>
        </div>
        <PaneBody>
          {galat}
          {/* Dua sakelar ini langsung tersimpan saat diubah, seperti sebelumnya.
              Dipisah dari form di bawah yang baru tersimpan lewat tombol Simpan. */}
          <DetailSection title="Saves right away">
            <Switch simpan
              checked={offer.is_active}
              disabled={sibuk}
              onChange={() => void patch(offer, { is_active: !offer.is_active }, offer.is_active ? "Offer turned off" : "Offer turned on")}
              label="Available at booths"
              description="Turned-off items cannot be claimed until they are turned on again."
            />
            <Switch simpan
              checked={offer.counts_toward_leaderboard}
              disabled={sibuk}
              onChange={() => void patch(offer, { counts_toward_leaderboard: !offer.counts_toward_leaderboard }, "Top spender setting updated")}
              label="Counts towards top spender"
              description={`Applies to the next claims. ${offer.claim_count > 0 ? `${offer.claim_count} existing claims keep the setting from when they were claimed, so Leaderboard figures do not jump.` : "No claims yet."}`}
            />
          </DetailSection>
          <form id="form-item-sunting" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
            <DetailSection title="Detail">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field className="min-w-0" label="Item name" htmlFor="offer-edit-name">
                  <input id="offer-edit-name" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className={INPUT} />
                </Field>
                <Field className="min-w-0" label="Price (Rp)" htmlFor="offer-edit-price">
                  <input id="offer-edit-price" value={grouped(editForm.price)} onChange={(event) => setEditForm((current) => ({ ...current, price: digitsOnly(event.target.value) }))} inputMode="numeric" className={cx(INPUT, "tabular-nums")} />
                </Field>
                <Field className="min-w-0" label="Stock" htmlFor="offer-edit-stock">
                  <input id="offer-edit-stock" value={grouped(editForm.stock)} onChange={(event) => setEditForm((current) => ({ ...current, stock: digitsOnly(event.target.value) }))} inputMode="numeric" placeholder="Unlimited" className={cx(INPUT, "tabular-nums")} />
                </Field>
                <Field className="min-w-0" label="Maximum per participant" htmlFor="offer-edit-max">
                  <input id="offer-edit-max" value={editForm.max_per_participant} onChange={(event) => setEditForm((current) => ({ ...current, max_per_participant: digitsOnly(event.target.value) }))} inputMode="numeric" className={cx(INPUT, "tabular-nums")} />
                </Field>
              </div>
              <p className="text-body-medium text-on-surface-variant">Empty stock means unlimited.</p>
            </DetailSection>
            <DetailSection title="Applies at">
              {canEditScope(offer) ? (
                <PilihCakupan
                  name={`offer-edit-scope-${offer.id}`}
                  value={editForm.scope}
                  onChange={(scope) => setEditForm((current) => ({ ...current, scope }))}
                  booths={booths}
                  boothId={editForm.booth_id}
                  onBooth={(id) => setEditForm((current) => ({ ...current, booth_id: id }))}
                  detail={{ global: "One quota for the whole event.", per_booth: "Only applies at one booth." }}
                />
              ) : (
                <dl>
                  <KeyValue label="Scope">
                    <span className="inline-flex items-center gap-1.5"><LockSimple size={14} aria-hidden className="shrink-0 text-on-surface-variant" />{offer.scope === "global" ? "All booths" : boothLabel(offer.booth_id)}</span>
                  </KeyValue>
                </dl>
              )}
            </DetailSection>
            <DetailSection title="Offer conditions">
              <p className="text-body-medium text-on-surface-variant">Counted from paid orders only. Changes apply to the next claims.</p>
              <ConditionBuilder value={editForm.conditions} booths={booths} onChange={(next) => setEditForm((current) => ({ ...current, conditions: next }))} />
            </DetailSection>
            {/* Kode & cakupan tidak dapat diubah: keduanya dirujuk klaim historis,
                mengubahnya akan memutus referensi laporan. */}
            <DetailSection>
              <p className="text-body-medium text-on-surface-variant">
                Kode {offer.code} tidak dapat diubah karena dipakai di database dan laporan.
                {offer.is_builtin
                  ? " A default item's scope is always tied to its booth; create a new item if you need another scope. Changing it here also updates the booth's settings."
                  : offer.claim_count > 0
                    ? ` The scope is locked because ${offer.claim_count} claims are already recorded against it. Those claims also keep the price at the time of claim.`
                    : " The scope can still be changed because this item has never been claimed."}
              </p>
            </DetailSection>
          </form>
          {/* Item bawaan terikat pengaturan booth; yang sudah diklaim harus tetap
              ada agar laporan tidak kehilangan referensi harga. */}
          {!offer.is_builtin && offer.claim_count === 0 ? (
            <DetailSection>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 text-body-medium">
                  <p className="font-medium">Delete item</p>
                  <p className="text-on-surface-variant">Possible because it has never been claimed.</p>
                </div>
                <Button variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} disabled={sibuk} onClick={() => setConfirmDelete(offer)}>Delete</Button>
              </div>
            </DetailSection>
          ) : null}
        </PaneBody>
        <PaneFooter note={offer.claim_count > 0 ? "Earlier claims keep the price at the time of claim" : "Applies to the next claims"}>
          <Button type="button" variant="outlined" size="sm" disabled={savingEdit} onClick={tutup}>Close</Button>
          <Button simpan type="submit" form="form-item-sunting" size="sm" loading={savingEdit} disabled={!editForm.name.trim()} icon={<Check size={16} weight="bold" />}>
            Save changes
          </Button>
        </PaneFooter>
      </Pane>
    );
  })() : null;

  return (
    <>
      <ListDetail list={list} detail={pembuat ?? penyunting} detailWidth={480} />
      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        dismissible={busyId === 0}
        tone="danger"
        title={`Delete ${confirmDelete?.name ?? "item"}?`}
        description="The item is deleted permanently and is no longer available at booths. The deletion is recorded in the audit trail."
        actions={
          <>
            <Button variant="outlined" disabled={busyId !== 0} onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={confirmDelete !== null && busyId === confirmDelete.id} onClick={() => { if (confirmDelete) void remove(confirmDelete); }}>Delete item</Button>
          </>
        }
      />
    </>
  );
}
