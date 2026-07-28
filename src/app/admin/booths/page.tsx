"use client";

import { ArrowLeft, CheckCircle, FloppyDisk, Plus, Storefront, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";

type Booth = { id: number; code: string; name: string; discount_item_name: string; discount_item_stock: number | null; is_active: boolean; discount_enabled: boolean; discount_limit_per_participant: number };
const blank: Booth = { id: 0, code: "B7", name: "Booth baru", discount_item_name: "Item diskon", discount_item_stock: null, is_active: true, discount_enabled: true, discount_limit_per_participant: 1 };

export default function BoothManagementPage() {
  const [booths, setBooths] = useState<Booth[]>([]);
  const [selected, setSelected] = useState<Booth>(blank);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    const response = await fetch("/api/admin/booths", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setBooths(data.booths ?? []);
    else setError(data.error?.message ?? "Booth gagal dimuat.");
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function save() {
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/admin/booths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...selected, id: selected.id || null }) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Booth gagal disimpan.";
      setError(failure);
      toast.error("Booth gagal disimpan", failure);
      return;
    }
    setMessage(`${data.booth.code} berhasil disimpan.`);
    toast.success(`${data.booth.code} tersimpan`, `${data.booth.name} diperbarui.`);
    setSelected(data.booth);
    void load();
  }

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-6xl">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Booth configuration</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Atur booth.</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">Edit nama, kode, item diskon, stok, dan status. Histori order tetap aman.</p>
        </div>
        <button onClick={() => setSelected({ ...blank, id: 0, code: `B${Math.max(6, ...booths.map((booth) => booth.id)) + 1}` })} className="flex min-h-12 items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-semibold text-white"><Plus size={19} /> Booth baru</button>
      </div>

      {error && <div role="alert" className="mt-6 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}
      {message && <div role="status" className="mt-6 flex items-center gap-2 border border-[#B9DCC5] bg-[#EEF8F0] p-4 text-sm text-[var(--brand-strong)]"><CheckCircle size={20} />{message}</div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <section className="border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] p-5"><h2 className="font-semibold">Booth terdaftar</h2></div>
          <div className="divide-y divide-[var(--line)]">
            {booths.map((booth) => <button key={booth.id} onClick={() => setSelected(booth)} className={`flex w-full items-center gap-3 p-5 text-left hover:bg-[var(--surface-muted)] ${selected.id === booth.id ? "bg-[#E8ECFB]" : ""}`}>
              <Storefront size={23} className={booth.is_active ? "text-[var(--brand)]" : "text-[var(--ink-muted)]"} />
              <span className="flex-1">
                <span className="block font-semibold">{booth.code} - {booth.name}</span>
                <span className="mt-1 block text-xs text-[var(--ink-muted)]">{booth.discount_enabled && booth.discount_limit_per_participant > 0 ? `Diskon: ${booth.discount_limit_per_participant}x/peserta - stok ${booth.discount_item_stock ?? "tak terbatas"}` : "Tanpa item diskon"}</span>
              </span>
              <span className={`text-xs font-semibold ${booth.is_active ? "text-[var(--success)]" : "text-[var(--ink-muted)]"}`}>{booth.is_active ? "Aktif" : "Nonaktif"}</span>
            </button>)}
            {booths.length === 0 && <p className="p-6 text-sm text-[var(--ink-muted)]">Memuat booth...</p>}
          </div>
        </section>

        <section className="border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          <h2 className="text-xl font-semibold">{selected.id ? `Kustomisasi ${selected.code}` : "Booth baru"}</h2>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold">Kode booth
              <input value={selected.code} onChange={(event) => setSelected({ ...selected, code: event.target.value.toUpperCase() })} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 outline-none focus:border-[var(--brand)]" />
            </label>
            <label className="text-sm font-semibold">Nama booth
              <input value={selected.name} onChange={(event) => setSelected({ ...selected, name: event.target.value })} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 outline-none focus:border-[var(--brand)]" />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">Nama item diskon
              <input value={selected.discount_item_name} onChange={(event) => setSelected({ ...selected, discount_item_name: event.target.value })} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 outline-none focus:border-[var(--brand)]" />
            </label>
            <label className="flex items-end gap-3 pb-3 text-sm font-semibold"><input type="checkbox" checked={selected.is_active} onChange={(event) => setSelected({ ...selected, is_active: event.target.checked })} className="size-5 accent-[var(--brand)]" /> Booth aktif</label>
          </div>

          <div className="mt-6 border border-[var(--line)] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Item diskon booth ini</h3>
            <label className="mt-4 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={selected.discount_enabled} onChange={(event) => setSelected({ ...selected, discount_enabled: event.target.checked })} className="size-5 accent-[var(--brand)]" /> Booth ini menyediakan item diskon</label>
            {selected.discount_enabled ? <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold">Maks. item diskon per peserta di booth ini
                <input value={selected.discount_limit_per_participant} onChange={(event) => setSelected({ ...selected, discount_limit_per_participant: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} type="number" min="1" max="20" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-lg tabular-nums outline-none focus:border-[var(--brand)]" />
              </label>
              <label className="text-sm font-semibold">Stok item diskon (total)
                <input value={selected.discount_item_stock ?? ""} onChange={(event) => setSelected({ ...selected, discount_item_stock: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })} type="number" min="0" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 outline-none focus:border-[var(--brand)]" placeholder="Kosong = tak terbatas" />
              </label>
              <p className="text-xs leading-5 text-[var(--ink-muted)] sm:col-span-2">Contoh: isi <span className="font-semibold">1</span> agar tiap peserta hanya boleh 1 item diskon di booth ini; isi <span className="font-semibold">2</span> bila boleh 2. Harga item diskon selalu Rp 1. Kosongkan stok untuk tak terbatas.</p>
            </div> : <p className="mt-4 text-xs leading-5 text-[var(--ink-muted)]">Booth ini tidak menawarkan item diskon. Peserta hanya bisa membeli item reguler di sini.</p>}
          </div>
          <button onClick={save} disabled={saving || !selected.code || !selected.name} className="mt-8 flex min-h-14 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"><FloppyDisk size={19} />{saving ? "Menyimpan..." : "Simpan booth"}</button>
        </section>
      </div>
    </div>
  </main>;
}
