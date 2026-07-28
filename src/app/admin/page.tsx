"use client";

import { ArrowUpRight, ChartBar, GearSix, ListChecks, Package, Receipt, ShieldCheck, Storefront, UsersThree, Warning, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Stats = {
  total_revenue: number;
  total_orders: number;
  pending_count: number;
  orders_per_booth: Array<{ id: number; code?: string; name: string; orders: number; discount_item_stock: number | null; is_active: boolean }>;
  discount_items_claimed_per_booth: Array<{ booth_id: number; claimed: number }>;
};
const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;

const shortcuts = [
  { href: "/admin/orders", label: "Orders", desc: "Tabel semua order dengan filter & timestamp.", icon: ListChecks },
  { href: "/admin/reports", label: "Reports", desc: "Rekonsiliasi revenue & settlement kasir.", icon: Receipt },
  { href: "/admin/participants", label: "Peserta", desc: "Sync & cari peserta dari Event Scanner.", icon: UsersThree },
  { href: "/admin/booths", label: "Booth & item", desc: "Kelola booth, item diskon, dan stok.", icon: Storefront },
  { href: "/admin/users", label: "User & role", desc: "Kelola akun panitia dan izin role.", icon: ShieldCheck },
  { href: "/admin/settings", label: "Settings", desc: "Mode penyerahan, leaderboard, kuota diskon.", icon: GearSix },
];

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/stats", { cache: "no-store" });
    if (response.ok) setStats(await response.json());
    else setError("Statistik gagal dimuat.");
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); const poll = window.setInterval(() => { void refresh(); }, 30000); return () => { window.clearTimeout(timer); window.clearInterval(poll); }; }, [refresh]);

  const claimed = (boothId: number) => stats?.discount_items_claimed_per_booth.find((item) => item.booth_id === boothId)?.claimed ?? 0;
  const metrics = stats ? [
    { label: "Total revenue", value: formatRupiah(stats.total_revenue), note: "Order lunas", icon: Receipt, tone: "text-[var(--brand)]" },
    { label: "Total orders", value: String(stats.total_orders), note: "Semua status", icon: ChartBar, tone: "text-[var(--warning)]" },
    { label: "Pending", value: String(stats.pending_count).padStart(2, "0"), note: "Menunggu pembayaran", icon: Warning, tone: "text-[var(--danger)]" },
  ] : [];

  return <main className="min-h-dvh bg-[var(--background)] text-[var(--ink)]">
    <header className="border-b border-[var(--line)] bg-[var(--surface)] px-5 py-4 sm:px-8">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center bg-[var(--brand)] text-white"><ShieldCheck size={23} weight="duotone" /></div>
          <div><p className="text-sm font-semibold">Tally Control Room</p><p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Admin dashboard</p></div>
        </div>
        <button onClick={refresh} className="flex min-h-11 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold" aria-label="Refresh">Refresh</button>
      </div>
    </header>

    <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:py-12">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Event overview</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">Control room.</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">Pantau data aktual, kelola operasional, dan rekonsiliasi.</p>
        </div>
        <a href="/api/admin/export.csv" className="flex min-h-12 items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-semibold text-white"><Package size={19} /> Export CSV</a>
      </div>

      {error && <div role="alert" className="mt-5 flex items-center gap-3 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}

      <div className="mt-10 grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">
        {metrics.length ? metrics.map(({ label, value, note, icon: Icon, tone }) => <div key={label} className="bg-[var(--surface)] p-6">
          <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">{label}</p><Icon size={22} weight="duotone" className={tone} /></div>
          <p className="mt-4 text-3xl font-semibold tabular-nums tracking-[-0.04em]">{value}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">{note}</p>
        </div>) : [0, 1, 2].map((index) => <div key={index} className="bg-[var(--surface)] p-6"><p className="text-sm text-[var(--ink-muted)]">Memuat...</p></div>)}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-start">
        <section className="border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div><h2 className="font-semibold">Orders per booth</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">Data aktual</p></div>
            <Link href="/admin/booths" className="text-sm font-semibold text-[var(--brand)]">Kelola</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <th className="px-5 py-3 font-semibold">Booth</th>
                <th className="px-5 py-3 font-semibold">Orders</th>
                <th className="px-5 py-3 font-semibold">Diskon</th>
                <th className="px-5 py-3 text-right font-semibold">Stok</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--line)]">
                {stats?.orders_per_booth.map((booth) => <tr key={booth.id} className={booth.is_active ? "" : "opacity-50"}>
                  <td className="px-5 py-4 font-semibold">{booth.name}</td>
                  <td className="px-5 py-4 tabular-nums">{booth.orders}</td>
                  <td className="px-5 py-4 tabular-nums text-[var(--brand)]">{claimed(booth.id)}</td>
                  <td className="px-5 py-4 text-right tabular-nums">{booth.discount_item_stock ?? "∞"}</td>
                </tr>)}
                {!stats && <tr><td colSpan={4} className="px-5 py-8 text-center text-[var(--ink-muted)]">Memuat data booth...</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Kelola</h2>
          <div className="mt-4 grid gap-px border border-[var(--line)] bg-[var(--line)]">
            {shortcuts.map(({ href, label, desc, icon: Icon }) => <Link key={href} href={href} className="group flex items-start gap-3 bg-[var(--surface)] p-5 transition-colors hover:bg-[var(--surface-muted)]">
              <Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span className="flex-1"><span className="flex items-center gap-1 font-semibold">{label}<ArrowUpRight size={15} className="opacity-0 transition-opacity group-hover:opacity-100" /></span><span className="mt-1 block text-xs text-[var(--ink-muted)]">{desc}</span></span>
            </Link>)}
          </div>
        </section>
      </div>
    </div>
  </main>;
}
