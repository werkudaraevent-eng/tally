"use client";

import { ArrowLeft, CheckCircle, PencilSimple, Plus, Storefront, Tag, Trash, TrendUp, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";

type Offer = {
  id: number;
  code: string;
  name: string;
  price: number;
  stock: number | null;
  scope: "per_booth" | "global";
  booth_id: number | null;
  max_per_participant: number;
  min_accumulated_amount: number | null;
  counts_toward_leaderboard: boolean;
  is_active: boolean;
  sort_order: number;
  is_builtin: boolean;
  claim_count: number;
};

type BoothOption = { id: number; code: string; name: string };

const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
const digitsOnly = (value: string) => value.replace(/\D/g, "");
const grouped = (digits: string) => (digits ? new Intl.NumberFormat("id-ID").format(Number(digits)) : "");

const EMPTY_FORM = {
  code: "",
  name: "",
  price: "50000",
  stock: "",
  scope: "global" as "global" | "per_booth",
  booth_id: 0,
  max_per_participant: "1",
  min_accumulated_amount: "500000",
  counts_toward_leaderboard: true,
};

export default function OfferManagementPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [booths, setBooths] = useState<BoothOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(0);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  // Penawaran yang sedang diedit. `code` dan `scope` tidak dapat diubah karena
  // keduanya dirujuk klaim historis, jadi keduanya tampil sebagai teks saja.
  const [editing, setEditing] = useState<Offer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", stock: "", max_per_participant: "", min_accumulated_amount: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const toast = useToast();

  function openEdit(offer: Offer) {
    setEditing(offer);
    setEditForm({
      name: offer.name,
      price: String(offer.price),
      stock: offer.stock === null ? "" : String(offer.stock),
      max_per_participant: String(offer.max_per_participant),
      min_accumulated_amount: offer.min_accumulated_amount === null ? "" : String(offer.min_accumulated_amount),
    });
    setError("");
  }

  async function saveEdit() {
    if (!editing) return;
    setSavingEdit(true); setError("");
    const response = await fetch("/api/admin/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: editForm.name.trim(),
        price: Number(editForm.price) || 0,
        stock: editForm.stock === "" ? null : Number(editForm.stock),
        max_per_participant: Number(editForm.max_per_participant) || 0,
        min_accumulated_amount: editForm.min_accumulated_amount === "" ? null : Number(editForm.min_accumulated_amount),
      }),
    });
    const data = await response.json();
    setSavingEdit(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Perubahan gagal disimpan.";
      setError(failure); toast.error("Gagal menyimpan", failure);
      return;
    }
    setEditing(null);
    toast.success(`${data.name} diperbarui`, editing.claim_count > 0 ? `${editing.claim_count} klaim lama tetap memakai harga saat diklaim.` : "Berlaku untuk klaim berikutnya.");
    void load();
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [offerResponse, boothResponse] = await Promise.all([
        fetch("/api/admin/offers", { cache: "no-store" }),
        fetch("/api/admin/booths", { cache: "no-store" }),
      ]);
      const offerData = await offerResponse.json();
      if (!offerResponse.ok) { setError(offerData.error?.message ?? "Penawaran gagal dimuat."); return; }
      setOffers(offerData.offers ?? []);
      if (boothResponse.ok) setBooths(((await boothResponse.json()).booths ?? []) as BoothOption[]);
    } catch { setError("Koneksi terputus. Coba lagi."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function patch(offer: Offer, changes: Partial<Offer>, successMessage: string) {
    setBusyId(offer.id); setError("");
    const response = await fetch("/api/admin/offers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: offer.id, ...changes }) });
    const data = await response.json();
    setBusyId(0);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Perubahan gagal disimpan.";
      setError(failure); toast.error("Gagal menyimpan", failure);
      return;
    }
    setOffers((current) => current.map((item) => (item.id === offer.id ? { ...item, ...data } : item)));
    toast.success(successMessage, `${offer.name} diperbarui.`);
  }

  async function remove(offer: Offer) {
    setBusyId(offer.id); setError("");
    const response = await fetch(`/api/admin/offers?id=${offer.id}`, { method: "DELETE" });
    const data = await response.json();
    setBusyId(0);
    if (!response.ok) {
      const failure = data.error?.message ?? "Penawaran gagal dihapus.";
      setError(failure); toast.error("Gagal menghapus", failure);
      return;
    }
    setOffers((current) => current.filter((item) => item.id !== offer.id));
    toast.warning(`${offer.name} dihapus`, "Penawaran tidak lagi tersedia di booth.");
  }

  async function create() {
    setCreating(true); setError("");
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
        min_accumulated_amount: form.min_accumulated_amount === "" ? null : Number(form.min_accumulated_amount),
        counts_toward_leaderboard: form.counts_toward_leaderboard,
        sort_order: 900,
      }),
    });
    const data = await response.json();
    setCreating(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "Penawaran gagal dibuat.";
      setError(failure); toast.error("Gagal menambah penawaran", failure);
      return;
    }
    setForm(EMPTY_FORM); setFormOpen(false);
    toast.success(`${data.name} ditambahkan`, "Penawaran langsung tersedia di booth.");
    void load();
  }

  const boothLabel = (id: number | null) => booths.find((booth) => booth.id === id)?.code ?? `Booth ${id}`;

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-5xl">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Special offers</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Item spesial.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Atur item diskon per booth dan penawaran bersyarat seperti tebus murah. Setiap penawaran punya harga, kuota per peserta, syarat minimum total transaksi, dan kontrol apakah nilainya masuk hitungan top spender.</p>
        </div>
        {!formOpen && <button type="button" onClick={() => { setFormOpen(true); setError(""); }} className="flex min-h-12 shrink-0 items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-semibold text-white"><Plus size={19} /> Penawaran baru</button>}
      </div>

      {error && <div role="alert" className="mt-6 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}

      {formOpen && <section className="mt-8 border border-[var(--line)] bg-[var(--surface)] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Penawaran baru</h2>
          <button type="button" onClick={() => { setFormOpen(false); setForm(EMPTY_FORM); setError(""); }} className="flex min-h-10 items-center px-2 text-[var(--ink-muted)] hover:text-[var(--ink)]" aria-label="Tutup form"><X size={18} /></button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Nama item
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Tebus Murah" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
          </label>
          <label className="block text-sm font-semibold">Kode sistem
            <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} placeholder="tebus_murah" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 font-mono text-sm outline-none focus:border-[var(--brand)]" />
          </label>
          <label className="block text-sm font-semibold">Harga (Rp)
            <input value={grouped(form.price)} onChange={(event) => setForm((current) => ({ ...current, price: digitsOnly(event.target.value) }))} inputMode="numeric" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
          </label>
          <label className="block text-sm font-semibold">Stok <span className="font-normal text-[var(--ink-muted)]">(kosong = tak terbatas)</span>
            <input value={grouped(form.stock)} onChange={(event) => setForm((current) => ({ ...current, stock: digitsOnly(event.target.value) }))} inputMode="numeric" placeholder="Tak terbatas" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
          </label>
        </div>

        <p className="mt-2 text-xs text-[var(--ink-muted)]">Kode dipakai di database dan laporan, tidak dapat diubah setelah dibuat.</p>

        <div className="mt-5">
          <p className="text-sm font-semibold">Berlaku di</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {([["global", "Semua booth", "Satu kuota untuk seluruh acara. Peserta dapat menebus di booth mana saja."], ["per_booth", "Booth tertentu", "Hanya berlaku di satu booth yang dipilih."]] as const).map(([value, label, desc]) => <label key={value} className={`flex cursor-pointer gap-3 border p-4 ${form.scope === value ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)]"}`}>
              <input type="radio" name="scope" checked={form.scope === value} onChange={() => setForm((current) => ({ ...current, scope: value }))} className="mt-1 size-4 accent-[var(--brand)]" />
              <span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-[var(--ink-muted)]">{desc}</span></span>
            </label>)}
          </div>
          {form.scope === "per_booth" && <label className="mt-3 block text-sm font-semibold">Booth
            <select value={form.booth_id} onChange={(event) => setForm((current) => ({ ...current, booth_id: Number(event.target.value) }))} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]">
              <option value={0}>Pilih booth</option>
              {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} — {booth.name}</option>)}
            </select>
          </label>}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Maksimal per peserta
            <input value={form.max_per_participant} onChange={(event) => setForm((current) => ({ ...current, max_per_participant: digitsOnly(event.target.value) }))} inputMode="numeric" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
          </label>
          <label className="block text-sm font-semibold">Syarat total transaksi (Rp) <span className="font-normal text-[var(--ink-muted)]">(kosong = tanpa syarat)</span>
            <input value={grouped(form.min_accumulated_amount)} onChange={(event) => setForm((current) => ({ ...current, min_accumulated_amount: digitsOnly(event.target.value) }))} inputMode="numeric" placeholder="Tanpa syarat" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
          </label>
        </div>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">Syarat dihitung dari akumulasi transaksi peserta di semua booth, hanya order yang sudah lunas.</p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={form.counts_toward_leaderboard} onChange={(event) => setForm((current) => ({ ...current, counts_toward_leaderboard: event.target.checked }))} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
          <span><span className="block font-semibold">Masuk hitungan top spender</span><span className="mt-0.5 block text-xs text-[var(--ink-muted)]">Harga item ini ditambahkan ke total belanja peserta di Live Display. Nilai ini dicatat per klaim, jadi mengubahnya nanti tidak mengubah angka yang sudah tampil.</span></span>
        </label>

        <button type="button" onClick={() => void create()} disabled={creating || !form.code.trim() || !form.name.trim() || (form.scope === "per_booth" && !form.booth_id)} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-muted)]">
          <Plus size={18} weight="bold" />{creating ? "Menyimpan..." : "Tambah penawaran"}
        </button>
      </section>}

      {loading ? <p className="mt-8 text-sm text-[var(--ink-muted)]">Memuat penawaran...</p> : <div className="mt-8 space-y-3">
        {offers.map((offer) => <section key={offer.id} className={`border bg-[var(--surface)] p-5 ${offer.is_active ? "border-[var(--line)]" : "border-dashed border-[var(--line)] opacity-70"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {offer.scope === "global" ? <Tag size={18} className="shrink-0 text-[var(--brand)]" /> : <Storefront size={18} className="shrink-0 text-[var(--brand)]" />}
                {offer.name}
                <span className="font-mono text-[11px] font-normal text-[var(--ink-muted)]">{offer.code}</span>
                {offer.is_builtin && <span className="rounded-sm bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Bawaan booth</span>}
                {offer.counts_toward_leaderboard && <span className="inline-flex items-center gap-1 rounded-sm bg-[#E8ECFB] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-strong)]"><TrendUp size={11} weight="bold" />Top spender</span>}
              </p>
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--ink-muted)]">
                <div><dt className="inline">Harga </dt><dd className="inline font-semibold tabular-nums text-[var(--ink)]">{formatRupiah(offer.price)}</dd></div>
                <div><dt className="inline">Berlaku </dt><dd className="inline font-semibold text-[var(--ink)]">{offer.scope === "global" ? "semua booth" : boothLabel(offer.booth_id)}</dd></div>
                <div><dt className="inline">Maks/peserta </dt><dd className="inline font-semibold tabular-nums text-[var(--ink)]">{offer.max_per_participant}</dd></div>
                <div><dt className="inline">Stok </dt><dd className="inline font-semibold tabular-nums text-[var(--ink)]">{offer.stock === null ? "tak terbatas" : offer.stock}</dd></div>
                <div><dt className="inline">Syarat </dt><dd className="inline font-semibold tabular-nums text-[var(--ink)]">{offer.min_accumulated_amount === null ? "tanpa syarat" : `min ${formatRupiah(offer.min_accumulated_amount)}`}</dd></div>
                <div><dt className="inline">Diklaim </dt><dd className="inline font-semibold tabular-nums text-[var(--ink)]">{offer.claim_count}x</dd></div>
              </dl>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => (editing?.id === offer.id ? setEditing(null) : openEdit(offer))} disabled={busyId === offer.id} className="flex min-h-12 items-center gap-1.5 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-45" aria-label={`Edit ${offer.name}`}><PencilSimple size={15} />{editing?.id === offer.id ? "Tutup" : "Edit"}</button>
              <button type="button" onClick={() => void patch(offer, { is_active: !offer.is_active }, offer.is_active ? "Penawaran dimatikan" : "Penawaran dinyalakan")} disabled={busyId === offer.id} className={`flex min-h-12 items-center gap-2 border px-3 text-xs font-semibold disabled:opacity-45 ${offer.is_active ? "border-[var(--brand)] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}>
                {offer.is_active ? <><CheckCircle size={15} weight="fill" /> Aktif</> : "Nonaktif"}
              </button>
              {/* Penawaran bawaan terikat config booth; yang sudah diklaim harus tetap ada
                  agar laporan tidak kehilangan referensi harga. */}
              {!offer.is_builtin && offer.claim_count === 0 && <button type="button" onClick={() => void remove(offer)} disabled={busyId === offer.id} className="flex min-h-12 items-center border border-[var(--line)] px-3 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-45" aria-label={`Hapus ${offer.name}`}><Trash size={15} /></button>}
            </div>
          </div>

          {editing?.id === offer.id && <div className="mt-4 border-t border-[var(--line)] pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Nama item
                <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
              </label>
              <label className="block text-sm font-semibold">Harga (Rp)
                <input value={grouped(editForm.price)} onChange={(event) => setEditForm((current) => ({ ...current, price: digitsOnly(event.target.value) }))} inputMode="numeric" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
              </label>
              <label className="block text-sm font-semibold">Stok <span className="font-normal text-[var(--ink-muted)]">(kosong = tak terbatas)</span>
                <input value={grouped(editForm.stock)} onChange={(event) => setEditForm((current) => ({ ...current, stock: digitsOnly(event.target.value) }))} inputMode="numeric" placeholder="Tak terbatas" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
              </label>
              <label className="block text-sm font-semibold">Maksimal per peserta
                <input value={editForm.max_per_participant} onChange={(event) => setEditForm((current) => ({ ...current, max_per_participant: digitsOnly(event.target.value) }))} inputMode="numeric" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
              </label>
              <label className="block text-sm font-semibold sm:col-span-2">Syarat total transaksi (Rp) <span className="font-normal text-[var(--ink-muted)]">(kosong = tanpa syarat)</span>
                <input value={grouped(editForm.min_accumulated_amount)} onChange={(event) => setEditForm((current) => ({ ...current, min_accumulated_amount: digitsOnly(event.target.value) }))} inputMode="numeric" placeholder="Tanpa syarat" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums outline-none focus:border-[var(--brand)]" />
              </label>
            </div>
            {/* Kode & cakupan tidak dapat diubah: keduanya dirujuk klaim historis,
                mengubahnya akan memutus referensi laporan. */}
            <p className="mt-3 text-xs text-[var(--ink-muted)]">Kode <span className="font-mono">{offer.code}</span> dan cakupan <span className="font-semibold">{offer.scope === "global" ? "semua booth" : boothLabel(offer.booth_id)}</span> tidak dapat diubah karena sudah dirujuk klaim dan laporan. Buat penawaran baru bila perlu berbeda.{offer.claim_count > 0 && ` ${offer.claim_count} klaim yang sudah ada tetap memakai harga saat diklaim.`}</p>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="min-h-12 flex-1 border border-[var(--line)] text-sm font-semibold">Batal</button>
              <button type="button" onClick={() => void saveEdit()} disabled={savingEdit || !editForm.name.trim()} className="min-h-12 flex-1 bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">{savingEdit ? "Menyimpan..." : "Simpan perubahan"}</button>
            </div>
          </div>}

          <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-[var(--line)] pt-4 text-sm">
            <input type="checkbox" checked={offer.counts_toward_leaderboard} onChange={() => void patch(offer, { counts_toward_leaderboard: !offer.counts_toward_leaderboard }, "Pengaturan top spender diperbarui")} disabled={busyId === offer.id} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
            <span><span className="block font-semibold">Masuk hitungan top spender</span><span className="mt-0.5 block text-xs text-[var(--ink-muted)]">Berlaku untuk klaim berikutnya. {offer.claim_count > 0 ? `${offer.claim_count} klaim yang sudah ada tetap memakai pengaturan saat diklaim, sehingga angka di Live Display tidak berubah mendadak.` : "Belum ada klaim."}</span></span>
          </label>
        </section>)}
      </div>}

      <p className="mt-8 flex items-start gap-2 text-xs text-[var(--ink-muted)]"><WarningCircle size={15} className="mt-0.5 shrink-0" /> Penawaran bawaan booth mencerminkan pengaturan di halaman Booth &amp; item; mengubahnya di sini ikut memperbarui halaman tersebut. Penawaran yang sudah diklaim tidak dapat dihapus, hanya dimatikan.</p>
    </div>
  </main>;
}
