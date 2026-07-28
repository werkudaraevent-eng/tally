"use client";

import { ArrowRight, CheckCircle, CreditCard, MagnifyingGlass, Money, Receipt, Scan, UserCircle, UsersThree, WarningCircle, XCircle } from "@phosphor-icons/react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { useToast } from "@/components/toast";
import { terbilangRupiah } from "@/lib/terbilang";
import { useOnline } from "@/lib/use-online";

type Order = { id: string; code: string; booth_id: number; has_discount_item: boolean; regular_amount: number; total_amount: number; status: string; pickup_mode: string };
type Participant = { id: string; name: string; company: string | null; title: string | null };
type PendingEntry = { qr_code: string; name: string; company: string | null; orders_count: number; total: number; oldest_created_at: string };
type SearchHit = { id: string; qr_code: string; name: string; company: string | null; title: string | null; pending_count: number; pending_total: number };
const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;

export default function CashierPage() {
  const [qr, setQr] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<"edc" | "cash">("edc");
  const [approval, setApproval] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string[]>([]);
  const [queue, setQueue] = useState<PendingEntry[]>([]);
  const [voidTarget, setVoidTarget] = useState<Order | null>(null);
  const [voidReason, setVoidReason] = useState("");
  // Kasir dapat mencari peserta lewat nama/perusahaan, bukan hanya kode QR
  // persis — berguna saat badge rusak atau peserta tidak ingat kodenya.
  const [searchTerm, setSearchTerm] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const online = useOnline();
  const toast = useToast();
  const total = useMemo(() => orders.filter((order) => selected.includes(order.id)).reduce((sum, order) => sum + order.total_amount, 0), [orders, selected]);

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/cashier/pending", { cache: "no-store" });
    if (response.ok) setQueue((await response.json()).participants ?? []);
  }, []);

  useEffect(() => { const initial = window.setTimeout(() => { void loadQueue(); }, 0); const timer = window.setInterval(() => { void loadQueue(); }, 15000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [loadQueue]);

  const lookup = useCallback(async (code?: string) => {
    const target = (code ?? qr).trim();
    if (!target) { setError("Masukkan atau pilih peserta terlebih dahulu."); return; }
    if (!online) { setError("Offline — lookup membutuhkan koneksi."); return; }
    setQr(target);
    setLoading(true); setError("");
    const response = await fetch(`/api/cashier/participant?qr=${encodeURIComponent(target)}`);
    const data = await response.json();
    setLoading(false);
    if (!response.ok) { setParticipant(null); setOrders([]); setSelected([]); setError(data.error?.message ?? "Peserta tidak ditemukan."); return; }
    setParticipant(data.participant); setOrders(data.orders); setSelected(data.orders.map((order: Order) => order.id));
    setSearchHits([]); setSearchTerm(""); setScanning(false);
  }, [online, qr]);

  const searchParticipants = useCallback(async () => {
    if (!searchTerm.trim()) return;
    if (!online) { setError("Offline — pencarian membutuhkan koneksi."); return; }
    setSearching(true); setError("");
    const response = await fetch(`/api/cashier/search?q=${encodeURIComponent(searchTerm.trim())}`, { cache: "no-store" });
    const data = await response.json();
    setSearching(false);
    if (!response.ok) { setError(data.error?.message ?? "Pencarian gagal."); return; }
    setSearchHits(data.participants ?? []);
  }, [online, searchTerm]);

  // Scanner hanya aktif setelah kasir membuka overlay kamera, agar izin kamera
  // tetap eksplisit (pola sama dengan App Booth).
  useEffect(() => {
    if (!scanning || !online || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    void reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, videoRef.current, (result, decodeError) => {
      if (stopped) return;
      if (result) {
        const value = result.getText().trim();
        if (value) {
          stopped = true;
          if (navigator.vibrate) navigator.vibrate(100);
          void lookup(value);
        }
      } else if (decodeError && decodeError.name !== "NotFoundException") {
        setError("Kamera tidak dapat membaca QR. Pastikan izin kamera aktif.");
      }
    }).then((value) => { controls = value; if (stopped) controls.stop(); }).catch(() => setError("Kamera tidak tersedia atau izin kamera ditolak."));
    return () => { stopped = true; controls?.stop(); };
  }, [scanning, online, lookup]);

  async function settle() {
    if (!online) { setError("Offline — pembayaran tidak boleh diproses."); return; }
    setLoading(true); setError("");
    const response = await fetch("/api/orders/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_ids: selected, payment_method: method, approval_code: method === "edc" ? approval : null }) });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Pembayaran gagal.";
      setError(failure);
      toast.error("Pembayaran gagal", failure);
      return;
    }
    const codes = data.settled_orders.map((order: Order) => order.code);
    setSuccess(codes);
    toast.success(`${codes.length} order lunas`, `${codes.join(" · ")} — ${formatRupiah(data.total ?? total)}`);
    setOrders((current) => current.filter((order) => !selected.includes(order.id)));
    setSelected([]); setApproval("");
    void loadQueue();
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    if (!online) { setError("Offline — void tidak boleh diproses."); return; }
    if (!voidReason.trim()) { setError("Alasan void wajib diisi."); return; }
    setLoading(true); setError("");
    const response = await fetch(`/api/orders/${voidTarget.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: voidReason.trim() }) });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Void gagal.";
      setError(failure);
      toast.error("Void gagal", failure);
      return;
    }
    toast.warning(`Order ${voidTarget.code} dibatalkan`, "Kuota item diskon peserta kembali tersedia.");
    setOrders((current) => current.filter((order) => order.id !== voidTarget.id));
    setSelected((current) => current.filter((id) => id !== voidTarget.id));
    setVoidTarget(null); setVoidReason("");
    void loadQueue();
  }

  return <main className="min-h-dvh bg-[var(--background)] text-[var(--ink)]"><header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:px-8 sm:py-4"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center bg-[var(--ink)] text-white"><CreditCard size={23} weight="duotone" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">Kasir Utama</p><p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Payment desk</p></div></div><div className="flex shrink-0 items-center gap-2"><span className="flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-xs font-semibold tabular-nums"><UsersThree size={18} className="shrink-0 text-[var(--brand)]" /> {queue.length}<span className="hidden sm:inline"> menunggu</span></span><LogoutButton /></div></div></header><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12"><div className="mb-5 space-y-2"><div className="flex gap-2"><input value={qr} onChange={(event) => setQr(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") lookup(); }} placeholder="Kode QR peserta" className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm outline-none focus:border-[var(--brand)]" aria-label="Kode QR peserta" /><button disabled={!online || loading} onClick={() => lookup()} className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Cari</button></div><div className="flex gap-2"><button onClick={() => { setScanning(true); setError(""); }} disabled={!online} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white disabled:opacity-50"><Scan size={19} weight="bold" /> Scan QR</button><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchParticipants(); }} placeholder="Cari nama / perusahaan" className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm outline-none focus:border-[var(--brand)]" aria-label="Cari nama atau perusahaan peserta" /><button onClick={() => void searchParticipants()} disabled={!online || searching || !searchTerm.trim()} className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold disabled:opacity-50" aria-label="Cari peserta"><MagnifyingGlass size={19} /></button></div>{searchHits.length > 0 && <div className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">{searchHits.map((hit) => <button key={hit.id} onClick={() => lookup(hit.qr_code)} disabled={loading} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[var(--surface-muted)] disabled:opacity-50"><UserCircle size={30} weight="duotone" className="shrink-0 text-[var(--brand)]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{hit.name}</span><span className="block truncate text-xs text-[var(--ink-muted)]">{hit.company ?? "Instansi tidak diisi"}</span></span><span className="shrink-0 text-right">{hit.pending_count > 0 ? <><span className="block text-sm font-semibold tabular-nums">{formatRupiah(hit.pending_total)}</span><span className="block text-[11px] text-[var(--ink-muted)]">{hit.pending_count} pending</span></> : <span className="text-[11px] text-[var(--ink-muted)]">Tidak ada tagihan</span>}</span></button>)}</div>}{searchTerm && !searching && searchHits.length === 0 && <p className="text-xs text-[var(--ink-muted)]">Tekan cari untuk mencari peserta.</p>}</div>{error && <div role="alert" className="mb-5 flex items-center gap-3 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}{success.length > 0 && <div role="status" className="mb-5 flex items-center justify-between border border-[#B9DCC5] bg-[#EEF8F0] p-4 text-sm text-[var(--brand-strong)]"><span className="flex items-center gap-2"><CheckCircle size={20} weight="fill" /> Lunas: {success.join(" · ")}</span><button onClick={() => setSuccess([])} className="font-semibold">Tutup</button></div>}<section className="mb-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div className="flex items-center gap-2"><UsersThree size={20} className="text-[var(--brand)]" /><h2 className="font-semibold">Antrean pembayaran</h2></div><span className="text-xs font-semibold tabular-nums text-[var(--ink-muted)]">{queue.length} peserta menunggu</span></div>{queue.length === 0 ? <p className="p-6 text-center text-sm text-[var(--ink-muted)]">Belum ada order pending.</p> : <div className="divide-y divide-[var(--line)]">{queue.map((entry) => <button key={entry.qr_code} onClick={() => lookup(entry.qr_code)} disabled={!online || loading} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-[var(--surface-muted)] disabled:opacity-50"><UserCircle size={34} weight="duotone" className="text-[var(--brand)]" /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{entry.name}</p><p className="truncate text-xs text-[var(--ink-muted)]">{entry.company ?? "Instansi tidak diisi"} · {entry.orders_count} order</p></div><span className="text-sm font-semibold tabular-nums">{formatRupiah(entry.total)}</span></button>)}</div>}</section><div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start"><section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm"><div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-5">{participant ? <><UserCircle size={38} weight="duotone" className="text-[var(--brand)]" /><div><h2 className="font-semibold">{participant.name}</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">{participant.company} · {participant.title}</p></div></> : <p className="text-sm text-[var(--ink-muted)]">Cari peserta dari QR badge.</p>}</div>{orders.length === 0 ? <div className="p-10 text-center text-sm text-[var(--ink-muted)]"><Receipt size={42} className="mx-auto mb-3 opacity-40" />Tidak ada order pending.</div> : <div className="divide-y divide-[var(--line)]">{orders.map((order) => <div key={order.id} className="flex items-center gap-4 px-5 py-5 hover:bg-[var(--surface-muted)]"><input type="checkbox" checked={selected.includes(order.id)} onChange={() => setSelected((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} className="size-5 accent-[var(--brand)]" aria-label={`Pilih order ${order.code}`} /><div className="min-w-0 flex-1"><p className="font-semibold">{order.code} <span className="font-normal text-[var(--ink-muted)]">· Booth {order.booth_id}</span></p><p className="mt-1 text-sm text-[var(--ink-muted)]">{order.has_discount_item ? "Item diskon" : "Reguler"} - {order.pickup_mode === "immediate" ? "Serahkan langsung" : "Ambil setelah lunas"}</p></div><p className="font-semibold tabular-nums">{formatRupiah(order.total_amount)}</p><button onClick={() => { setVoidTarget(order); setVoidReason(""); setError(""); }} className="text-xs font-semibold text-[var(--danger)] hover:underline">Void</button></div>)}</div>}<div className="border-t border-[var(--ink)] bg-[var(--ink)] px-5 py-6 text-white"><div className="flex items-end justify-between gap-4"><span className="text-sm uppercase tracking-[0.18em] text-white/60">Total</span><span className="text-4xl font-semibold tabular-nums tracking-[-0.06em]">{formatRupiah(total)}</span></div>{total > 0 && <p className="mt-2 text-right text-xs leading-5 text-white/60">{terbilangRupiah(total)}</p>}</div></section><section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm sm:p-7"><div className="flex items-center gap-3"><Receipt size={23} className="text-[var(--brand)]" /><h2 className="font-semibold">Konfirmasi pembayaran</h2></div><div className="mt-7 grid grid-cols-2 gap-2"><button onClick={() => setMethod("edc")} className={`min-h-14 border text-sm font-semibold ${method === "edc" ? "border-[var(--brand)] bg-[#E8ECFB] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}><CreditCard size={19} className="mx-auto mb-1" />EDC</button><button onClick={() => setMethod("cash")} className={`min-h-14 border text-sm font-semibold ${method === "cash" ? "border-[var(--brand)] bg-[#E8ECFB] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}><Money size={19} className="mx-auto mb-1" />Tunai</button></div>{method === "edc" && <div className="mt-7"><label htmlFor="approval" className="text-sm font-semibold">Approval code EDC</label><input id="approval" inputMode="numeric" maxLength={6} value={approval} onChange={(event) => setApproval(event.target.value.replace(/\D/g, ""))} className="mt-2 h-14 w-full border border-[var(--line)] bg-[var(--background)] px-4 text-xl tracking-[0.28em] outline-none focus:border-[var(--brand)]" placeholder="6 digit terakhir" /></div>}{method === "cash" && <div className="mt-7 flex gap-3 border border-[#D5E9DB] bg-[#EEF8F0] p-4 text-sm text-[var(--brand-strong)]"><CheckCircle size={20} weight="fill" /> Approval code tidak diperlukan untuk tunai.</div>}<button disabled={!online || loading || selected.length === 0 || (method === "edc" && approval.length !== 6)} onClick={settle} className="mt-8 flex min-h-16 w-full items-center justify-center gap-2 bg-[var(--brand)] text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-muted)]">{loading ? "Memproses..." : "Tandai lunas"} {!loading && <ArrowRight size={19} />}</button><p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-[var(--ink-muted)]"><WarningCircle size={16} /> Untuk membatalkan, tekan Void pada order di daftar tagihan.</p></section></div>{scanning && <div className="fixed inset-0 z-40 flex flex-col bg-[var(--ink)] text-white"><header className="flex items-center justify-between p-5"><div><p className="text-xs uppercase tracking-[0.2em] text-white/55">Kasir</p><p className="mt-1 font-semibold">Scanner QR</p></div><button onClick={() => setScanning(false)} className="min-h-12 border border-white/20 px-4 text-sm font-semibold">Tutup</button></header><div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="relative aspect-square w-full max-w-sm overflow-hidden border border-white/50"><video ref={videoRef} className="size-full object-cover" autoPlay muted playsInline aria-label="Pratinjau kamera scanner QR" /><div className="pointer-events-none absolute inset-8 border-2 border-[var(--warning)]" />{!online && <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center text-sm font-semibold">Offline - kamera scanner dinonaktifkan.</div>}</div><p className="mt-8 text-lg font-semibold">Arahkan kamera ke QR badge</p><p className="mt-2 text-sm text-white/55">Scanner membaca otomatis. Pastikan QR terlihat utuh.</p></div></div>}{voidTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"><div className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] p-6"><div className="flex items-center gap-2"><WarningCircle size={22} className="text-[var(--danger)]" /><h2 className="text-lg font-semibold">Void order {voidTarget.code}</h2></div><p className="mt-3 text-sm text-[var(--ink-muted)]">Order dibatalkan dan tidak bisa dibayar. Kuota item diskon peserta kembali tersedia. Alasan wajib diisi.</p><label className="mt-5 block text-sm font-semibold">Alasan void<textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={3} className="mt-2 w-full border border-[var(--line)] bg-[var(--background)] p-3 text-sm outline-none focus:border-[var(--brand)]" placeholder="Contoh: EDC gagal, salah input nominal" /></label><div className="mt-6 flex gap-3"><button onClick={() => { setVoidTarget(null); setVoidReason(""); }} className="min-h-12 flex-1 border border-[var(--line)] text-sm font-semibold">Batal</button><button onClick={confirmVoid} disabled={loading || !online || !voidReason.trim()} className="min-h-12 flex-1 bg-[var(--danger)] text-sm font-semibold text-white disabled:opacity-50">{loading ? "Memproses..." : "Void order"}</button></div></div></div>}</div></main>;
}
