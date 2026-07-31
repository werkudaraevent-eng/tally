"use client";

import { ArrowLeft, FunnelSimple, ListChecks, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExportMenu } from "@/components/admin/export-menu";
import { formatWibDateTime } from "@/lib/datetime";

type OrderRow = {
  id: string;
  code: string;
  booth_id: number;
  has_discount_item: boolean;
  regular_amount: number;
  total_amount: number;
  status: string;
  pickup_mode: string;
  payment_method: string | null;
  approval_code: string | null;
  created_at: string;
  paid_at: string | null;
  handed_over_at: string | null;
  void_reason: string | null;
  participants: { name: string; company: string | null; qr_code: string } | null;
};
type Booth = { id: number; code: string; name: string };

const money = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(value)}`;
const dateTime = (value: string | null) => formatWibDateTime(value);
const statusBadge = (status: string): { label: string; className: string } => {
  switch (status) {
    case "paid": return { label: "Lunas", className: "bg-[#EEF8F0] text-[var(--brand-strong)]" };
    case "handed_over": return { label: "Diserahkan", className: "bg-[var(--surface-muted)] text-[var(--ink-muted)]" };
    case "void": return { label: "Void", className: "bg-[#FFF2F0] text-[var(--danger)]" };
    default: return { label: "Pending", className: "bg-[#FFF7E6] text-[#9A6B00]" };
  }
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [boothId, setBoothId] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    if (boothId) params.set("booth_id", boothId);
    if (q.trim()) params.set("q", q.trim());
    const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) { setError(data.error?.message ?? "Order gagal dimuat."); return; }
    setOrders(data.orders ?? []);
    setTotal(data.total ?? 0);
  }, [status, boothId, q]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => { void fetch("/api/admin/booths", { cache: "no-store" }).then(async (r) => { if (r.ok) setBooths((await r.json()).booths ?? []); }); }, 0); return () => window.clearTimeout(timer); }, []);

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Order management</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Semua order.</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">Pantau seluruh transaksi dengan filter status, booth, dan pencarian nomor stiker.</p>
        </div>
        <ExportMenu />
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-3 border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]"><FunnelSimple size={18} /> Filter</div>
        <label className="text-sm">Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 block h-11 w-44 border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]">
            <option value="">Semua status</option>
            <option value="pending">Pending</option>
            <option value="paid">Lunas</option>
            <option value="handed_over">Diserahkan</option>
            <option value="void">Void</option>
          </select>
        </label>
        <label className="text-sm">Booth
          <select value={boothId} onChange={(event) => setBoothId(event.target.value)} className="mt-1 block h-11 w-44 border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]">
            <option value="">Semua booth</option>
            {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Nomor stiker
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Contoh: B3-014" className="mt-1 block h-11 w-48 border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
        </label>
        <button onClick={() => void load()} disabled={loading} className="min-h-11 bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">{loading ? "Memuat..." : "Terapkan"}</button>
        <span className="ml-auto text-sm text-[var(--ink-muted)]">{total} order</span>
      </div>

      {error && <div role="alert" className="mt-5 flex items-center gap-3 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}

      <section className="mt-6 border border-[var(--line)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead><tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Peserta</th>
              <th className="px-4 py-3 font-semibold">Booth</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Dibuat</th>
              <th className="px-4 py-3 font-semibold">Lunas</th>
              <th className="px-4 py-3 font-semibold">Bayar</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--line)]">
              {orders.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-[var(--ink-muted)]"><ListChecks size={38} className="mx-auto mb-3 opacity-40" />Tidak ada order cocok.</td></tr> : orders.map((order) => {
                const badge = statusBadge(order.status);
                return <tr key={order.id} className="align-top hover:bg-[var(--surface-muted)]">
                  <td className="px-4 py-3"><p className="font-semibold">{order.code}</p><p className="text-xs text-[var(--ink-muted)]">{order.has_discount_item ? "Item diskon" : "Reguler"}</p></td>
                  <td className="px-4 py-3"><p className="font-medium">{order.participants?.name ?? "—"}</p><p className="text-xs text-[var(--ink-muted)]">{order.participants?.company ?? ""}</p></td>
                  <td className="px-4 py-3 tabular-nums">B{order.booth_id}</td>
                  <td className="px-4 py-3">{order.status === "void" && order.void_reason ? <span title={order.void_reason} className={`inline-flex rounded-sm px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span> : <span className={`inline-flex rounded-sm px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(order.total_amount)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-[var(--ink-muted)]">{dateTime(order.created_at)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-[var(--ink-muted)]">{dateTime(order.paid_at)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--ink-muted)]">{order.payment_method ? order.payment_method.toUpperCase() : "—"}{order.approval_code ? ` · ${order.approval_code}` : ""}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>;
}
