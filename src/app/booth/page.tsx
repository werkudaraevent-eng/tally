"use client";

import { CheckCircle, MagnifyingGlass, Package, Scan, Storefront, UserCircle, XCircle } from "@phosphor-icons/react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { formatWibDateTime, formatWibTime } from "@/lib/datetime";
import { useOnline } from "@/lib/use-online";

type BoothParticipant = { id: string; name: string; company: string | null; title: string | null; qr_code: string; discount_available?: boolean };
type BoothOrder = { id: string; code: string; booth_id: number; has_discount_item: boolean; total_amount: number; status: string; pickup_mode: string; created_at: string; participants: { qr_code: string; name: string; company: string | null } | null };
type ExistingOrder = { id: string; code: string; status: string; has_discount_item: boolean; pickup_mode: string; total_amount: number; handed_over_at: string | null; paid_at: string | null };
const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
// Input rupiah tampil dengan pemisah ribuan (mis. "250.000") agar admin booth
// tidak salah baca nominal besar. Nilai asli tetap disimpan sebagai digit.
const groupDigits = (digits: string) => (digits ? new Intl.NumberFormat("id-ID").format(Number(digits)) : "");
const orderStatusBadge = (status: string): { label: string; className: string } => {
  switch (status) {
    case "paid": return { label: "Lunas - siap diserahkan", className: "bg-[#EEF8F0] text-[var(--brand-strong)]" };
    case "handed_over": return { label: "Sudah diserahkan", className: "bg-[var(--surface-muted)] text-[var(--ink-muted)]" };
    case "void": return { label: "Void", className: "bg-[#FFF2F0] text-[var(--danger)]" };
    default: return { label: "Menunggu kasir", className: "bg-[#FFF7E6] text-[#9A6B00]" };
  }
};

export default function BoothPage() {
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState(false);
  const [participant, setParticipant] = useState<BoothParticipant | null>(null);
  const [discount, setDiscount] = useState(false);
  const [discountAvailable, setDiscountAvailable] = useState<boolean | null>(null);
  const [existingOrders, setExistingOrders] = useState<ExistingOrder[]>([]);
  // Spec 7.1: "Progress peserta -- 3 dari 6 booth".
  const [progress, setProgress] = useState<{ visited: number; total: number } | null>(null);
  const [pickupMode, setPickupMode] = useState<"after_payment" | "immediate">("after_payment");
  const [booth, setBooth] = useState<{ id: number; code: string; name: string } | null>(null);
  const [operator, setOperator] = useState<string>("");
  const [regularAmount, setRegularAmount] = useState("250000");
  const [orderCode, setOrderCode] = useState("014");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<BoothParticipant[]>([]);
  const [history, setHistory] = useState<BoothOrder[]>([]);
  // Riwayat order selalu terlihat (tidak dilipat) karena ini antrean kerja
  // admin booth. Yang dibatasi hanya jumlahnya: 5 terakhir, sisanya dibuka
  // lewat "Lihat semua".
  const [showAllHistory, setShowAllHistory] = useState(false);
  const online = useOnline();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Order lunas yang barangnya masih ditahan di booth = butuh aksi sekarang.
  // Order 'immediate' tidak masuk sini karena barangnya sudah diserahkan.
  const readyToHandOver = history.filter((item) => item.status === "paid" && item.pickup_mode === "after_payment");
  const visibleHistory = showAllHistory ? history : history.slice(0, 5);

  const lookupParticipant = useCallback(async (qr = "") => {
    if (!online) { setMessage("Offline — sambungkan internet sebelum scan."); return; }
    if (!booth) { setMessage("Booth belum termuat. Muat ulang halaman."); return; }
    setPending(true); setMessage("");
    const response = await fetch(`/api/participants/by-qr?qr=${encodeURIComponent(qr)}&boothId=${booth.id}`);
    const data = await response.json();
    setPending(false);
    if (!response.ok) { setMessage(data.error?.message ?? "Peserta tidak ditemukan."); return; }
    setParticipant(data.participant);
    setDiscountAvailable(Boolean(data.discount_available));
    setExistingOrders(data.existing_orders_at_this_booth ?? []);
    setProgress(data.progress ?? null);
    setDiscount(false);
    setScanning(false);
  }, [online, booth]);

  // Scanner starts only after user opens camera overlay. Browser permission stays explicit.
  useEffect(() => {
    if (!scanning || !online || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    void reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, videoRef.current, (result, error) => {
      if (stopped) return;
      if (result) {
        const value = result.getText().trim();
        if (value) {
          stopped = true;
          if (navigator.vibrate) navigator.vibrate(100);
          void lookupParticipant(value);
        }
      } else if (error && error.name !== "NotFoundException") {
        setMessage("Kamera tidak dapat membaca QR. Pastikan izin kamera aktif.");
      }
    }).then((value) => { controls = value; if (stopped) controls.stop(); }).catch(() => setMessage("Kamera tidak tersedia atau izin kamera ditolak."));
    return () => { stopped = true; controls?.stop(); };
  }, [lookupParticipant, online, scanning]);

  async function searchParticipants() {
    if (!online || !searchTerm.trim() || !booth) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/booth/participants?q=${encodeURIComponent(searchTerm)}&boothId=${booth.id}`);
    const data = await response.json();
    setPending(false);
    if (!response.ok) { setMessage(data.error?.message ?? "Pencarian gagal."); return; }
    setResults(data.participants ?? []);
  }

  // Log scan pasif dihapus: admin booth tidak bisa melakukan aksi apa pun
  // terhadapnya. Yang ditampilkan hanya order yang benar-benar diproses.
  async function loadHistory() {
    const ordersResponse = await fetch("/api/booth/orders?limit=50", { cache: "no-store" });
    if (ordersResponse.ok) setHistory((await ordersResponse.json()).orders ?? []);
  }

  async function loadSettings() {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (response.ok) { const data = await response.json(); setPickupMode(data.pickup_mode === "immediate" ? "immediate" : "after_payment"); }
  }

  async function loadContext() {
    const response = await fetch("/api/booth/context", { cache: "no-store" });
    if (response.ok) { const data = await response.json(); setBooth(data.booth ?? null); setOperator(data.operator?.username ?? ""); if (data.next_sticker) setOrderCode(data.next_sticker); }
  }

  useEffect(() => { const initial = window.setTimeout(() => { void loadContext(); void loadHistory(); void loadSettings(); }, 0); const historyTimer = window.setInterval(() => { void loadHistory(); }, 15000); const settingsTimer = window.setInterval(() => { void loadSettings(); }, 30000); return () => { window.clearTimeout(initial); window.clearInterval(historyTimer); window.clearInterval(settingsTimer); }; }, []);

  async function createOrder() {
    if (!participant || !online) { setMessage("Offline — order tidak boleh dibuat."); return; }
    if (!booth) { setMessage("Booth belum termuat. Muat ulang halaman."); return; }
    setPending(true); setMessage("");
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_code: `${booth.code}-${orderCode.padStart(3, "0")}`, participant_id: participant.id, booth_id: booth.id, has_discount_item: discount, regular_amount: Number(regularAmount) || 0 }) });
    const data = await response.json();
    setPending(false);
    if (!response.ok) { setMessage(data.error?.code === "DISCOUNT_ALREADY_TAKEN" ? "Item diskon peserta sudah pernah diambil di booth ini." : data.error?.message ?? "Order gagal dibuat."); return; }
    setSuccess(data.order.code);
    setParticipant(null);
    setOrderCode(String(Number.parseInt(orderCode, 10) + 1).padStart(3, "0"));
    void loadHistory();
  }

  async function handOverOrder(orderId: string) {
    if (!online) { setMessage("Offline — penyerahan barang tidak boleh diproses."); return; }
    setPending(true); setMessage("");
    const response = await fetch(`/api/orders/${orderId}/hand-over`, { method: "POST" });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      // Kegagalan biasanya berarti layar memegang status usang (mis. order
      // sudah di-void atau belum benar-benar lunas). Selalu muat ulang data
      // agar kartu menampilkan kondisi sebenarnya, bukan hanya pesan error.
      setMessage(data.error?.message ?? "Penyerahan barang gagal.");
      if (participant) void lookupParticipant(participant.qr_code);
      void loadHistory();
      return;
    }
    if (participant) void lookupParticipant(participant.qr_code);
    void loadHistory();
  }

  function backToParticipantSearch() {
    setParticipant(null);
    setDiscount(false);
    setDiscountAvailable(null);
    setExistingOrders([]);
    setProgress(null);
    setMessage("");
    setResults([]);
    setSearch(true);
  }

  return <main className="min-h-dvh bg-[var(--background)] text-[var(--ink)]"><header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:px-8 sm:py-4"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2"><div className="flex min-w-0 items-center gap-3"><div className="flex size-12 shrink-0 flex-col items-center justify-center bg-[var(--brand)] leading-none text-white" aria-hidden="true"><Storefront size={16} weight="duotone" /><span className="mt-0.5 text-sm font-bold tracking-tight">{booth?.code ?? "--"}</span></div><div className="min-w-0"><p className="truncate text-base font-semibold leading-tight">{booth?.name ?? "Memuat booth..."}</p><p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]"><span className="font-semibold uppercase tracking-[0.12em]">Admin Booth</span>{operator ? ` · ${operator}` : ""}</p></div></div><div className="flex shrink-0 items-center gap-2"><span className="flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-xs font-semibold"><Package size={18} className="shrink-0 text-[var(--brand)]" /> <span className="hidden sm:inline">{pickupMode === "immediate" ? "Serahkan langsung" : "Barang disimpan di rak booth"}</span><span className="sm:hidden">{pickupMode === "immediate" ? "Langsung" : "Disimpan"}</span></span><LogoutButton /></div></div></header><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">{message && <div role="alert" className="mb-5 flex items-center gap-3 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{message}</div>}{success ? <section className="flex min-h-[65dvh] items-center justify-center bg-[var(--success)] p-8 text-center text-white"><div><CheckCircle size={80} weight="fill" className="mx-auto" /><p className="mt-6 text-xs uppercase tracking-[0.2em] text-white/70">Order berhasil dibuat</p><h1 className="mt-3 text-7xl font-semibold tracking-[-0.08em]">{success}</h1><p className="mt-5 max-w-md text-lg text-white/80">{pickupMode === "immediate" ? "Serahkan barang sekarang. Arahkan peserta ke kasir untuk membayar." : "Tempel stiker pada barang, simpan di rak. Arahkan peserta ke kasir."}</p><button onClick={() => { setSuccess(""); setParticipant(null); setSearch(true); }} className="mt-10 min-h-14 border border-white/30 px-6 font-semibold hover:bg-white/10">Kembali ke pencarian peserta</button></div></section> : <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start"><section>{participant ? <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm"><button onClick={backToParticipantSearch} className="flex min-h-12 items-center gap-2 border-b border-[var(--line)] px-5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--surface-muted)]">Kembali ke pencarian peserta</button><div className="flex items-center gap-4 border-b border-[var(--line)] p-5"><UserCircle size={52} weight="duotone" className="shrink-0 text-[var(--brand)]" /><div className="min-w-0"><h2 className="text-xl font-semibold">{participant.name}</h2><p className="mt-1 text-sm text-[var(--ink-muted)]">{participant.company}  -  {participant.title}</p></div></div>{progress && <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Progress peserta</span><span className="flex items-center gap-3"><span className="flex items-center gap-1.5" aria-hidden="true">{Array.from({ length: progress.total }).map((_, dot) => <span key={dot} className="size-3 rounded-full" style={{ backgroundColor: dot < progress.visited ? "var(--brand)" : "var(--line)" }} />)}</span><span className="text-sm font-semibold tabular-nums">{progress.visited} dari {progress.total} booth</span></span></div>}{existingOrders.filter((order) => order.pickup_mode === "after_payment" && order.status !== "void" && order.status !== "handed_over").map((order) => <div key={order.id} className={`m-5 border p-5 ${order.status === "paid" ? "border-[#B9DCC5] bg-[#EEF8F0] text-[var(--brand-strong)]" : "border-[#E9C7C4] bg-[#FFF2F0] text-[var(--danger)]"}`}><p className="flex items-center gap-2 font-semibold"><Package size={22} weight="fill" /> BARANG SIAP DIAMBIL</p><p className="mt-2 text-sm">{order.code} · {order.has_discount_item ? "Item diskon" : "Reguler"} · {formatRupiah(order.total_amount)}</p>{order.status === "paid" ? <><p className="mt-1 flex items-center gap-1 text-sm font-semibold"><CheckCircle size={16} weight="fill" /> LUNAS{order.paid_at ? ` ${formatWibTime(order.paid_at)}` : ""}</p><button onClick={() => handOverOrder(order.id)} disabled={pending || !online} className="mt-4 min-h-12 w-full bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50">Serahkan barang</button></> : <p className="mt-2 text-sm font-semibold">BELUM LUNAS — arahkan peserta ke kasir</p>}</div>)}<div className={`m-5 border p-5 ${discountAvailable === false ? "border-[#E9C7C4] bg-[#FFF2F0] text-[var(--danger)]" : discount ? "border-[#B9DCC5] bg-[#EEF8F0] text-[var(--brand-strong)]" : "border-[var(--line)] bg-[var(--surface-muted)] text-[var(--ink)]"}`}><p className="flex items-center gap-2 font-semibold">{discountAvailable === false ? <XCircle size={22} weight="fill" /> : discount ? <CheckCircle size={22} weight="fill" /> : <span className="size-[22px] border-2 border-current" />}{discountAvailable === false ? "ITEM DISKON SUDAH DIAMBIL / TIDAK TERSEDIA" : discount ? "ITEM DISKON DIPILIH" : "ITEM DISKON TERSEDIA - BELUM DIPILIH"}</p><p className="mt-2 text-sm">Item khusus peserta - Rp 1</p>{discountAvailable === false ? <p className="mt-2 text-xs">Item tidak dapat dimasukkan ke order ini.</p> : <p className="mt-2 text-xs text-[var(--ink-muted)]">Centang untuk memasukkan item diskon ke order.</p>}<label className={`mt-4 flex min-h-12 items-center gap-3 border border-current px-4 text-sm font-semibold ${discountAvailable === false ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}><input type="checkbox" checked={discount} disabled={discountAvailable === false} onChange={(event) => setDiscount(event.target.checked)} className="size-5 accent-[var(--brand)]" />{discountAvailable === false ? "Tidak tersedia" : "Ambil item diskon"}</label></div><div className="grid gap-4 p-5 pt-0 sm:grid-cols-2"><label className="text-sm font-semibold">Item reguler (Rp)<input value={groupDigits(regularAmount)} onChange={(event) => setRegularAmount(event.target.value.replace(/\D/g, ""))} className="mt-2 h-14 w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 text-xl font-semibold outline-none focus:border-[var(--brand)]" inputMode="numeric" /></label><label className="text-sm font-semibold">Nomor stiker {booth?.code ?? "booth"} <span className="font-normal text-[var(--ink-muted)]">(otomatis lanjut)</span><input value={orderCode} onChange={(event) => setOrderCode(event.target.value.replace(/\D/g, "").slice(0, 3))} className="mt-2 h-14 w-full border border-[var(--line)] bg-[var(--background)] px-4 text-xl outline-none focus:border-[var(--brand)]" inputMode="numeric" /></label></div><div className="flex items-center justify-between border-t border-[var(--line)] p-5"><span className="text-sm font-semibold">TOTAL</span><span className="text-3xl font-semibold tabular-nums">{formatRupiah((Number(regularAmount) || 0) + (discount ? 1 : 0))}</span></div><button disabled={pending || !orderCode || !participant} onClick={createOrder} className="m-5 mt-0 flex min-h-16 w-[calc(100%-2.5rem)] items-center justify-center gap-2 bg-[var(--brand)] text-base font-semibold text-white disabled:cursor-wait disabled:opacity-50">{pending ? "Menyimpan..." : "Buat order"}</button></div> : <><button onClick={() => setScanning(true)} className="flex min-h-32 w-full items-center justify-between rounded-2xl bg-[var(--brand)] px-6 text-left text-white shadow-sm transition-colors hover:bg-[var(--brand-strong)] sm:min-h-36 sm:px-8"><span className="block text-3xl font-semibold sm:text-4xl">SCAN QR</span><Scan size={52} weight="duotone" /></button><button onClick={() => setSearch(!search)} className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-sm font-semibold"><MagnifyingGlass size={20} /> Cari peserta manual</button>{search && <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><label htmlFor="manual-search" className="text-sm font-semibold">Nama atau instansi peserta</label><div className="mt-2 flex gap-2"><input id="manual-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchParticipants(); }} placeholder="Contoh: Ratna atau nama perusahaan" className="h-12 min-w-0 flex-1 border border-[var(--line)] bg-[var(--background)] px-3 outline-none focus:border-[var(--brand)]" /><button onClick={() => void searchParticipants()} disabled={pending || !online} className="min-h-12 bg-[var(--ink)] px-4 text-sm font-semibold text-white disabled:opacity-50">Cari</button></div>{results.length > 0 && <div className="mt-3 divide-y divide-[var(--line)] border border-[var(--line)]">{results.map((item) => <button key={item.id} onClick={() => { setParticipant(item); setDiscountAvailable(Boolean(item.discount_available)); setDiscount(false); setResults([]); setSearch(false); }} className="block w-full p-3 text-left hover:bg-[var(--surface-muted)]"><span className="block font-semibold">{item.name}</span><span className="text-xs text-[var(--ink-muted)]">{item.company ?? "Instansi tidak diisi"} - {item.title ?? ""}</span></button>)}</div>}{searchTerm && !pending && results.length === 0 && <p className="mt-3 text-sm text-[var(--ink-muted)]">Peserta tidak ditemukan.</p>}</div>}</>}</section><section className="space-y-4">{readyToHandOver.length > 0 && <div className="rounded-2xl border border-[#B9DCC5] bg-[#EEF8F0] p-4 shadow-sm"><p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--brand-strong)]"><Package size={19} weight="fill" />Siap diserahkan ({readyToHandOver.length})</p><div className="mt-3 space-y-2">{readyToHandOver.map((item) => <div key={item.id} className="rounded-xl bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.participants?.name ?? "Peserta"}</p><p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">{item.code} · {formatRupiah(item.total_amount)}</p></div><span className="shrink-0 rounded-full bg-[#EEF8F0] px-2 py-1 text-[11px] font-semibold text-[var(--brand-strong)]">Lunas</span></div><button onClick={() => handOverOrder(item.id)} disabled={pending || !online} className="mt-3 min-h-12 w-full rounded-xl bg-[var(--brand)] text-sm font-semibold text-white disabled:opacity-50">Serahkan barang</button></div>)}</div></div>}<div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Order booth ini</p>{history.length > 5 && <button type="button" onClick={() => setShowAllHistory((open) => !open)} className="text-xs font-semibold text-[var(--brand)]">{showAllHistory ? "Tampilkan 5 terakhir" : `Lihat semua (${history.length})`}</button>}</div><div className="mt-3 divide-y divide-[var(--line)]">{history.length === 0 ? <p className="py-4 text-sm text-[var(--ink-muted)]">Belum ada order.</p> : visibleHistory.map((item) => { const badge = orderStatusBadge(item.status); return <button key={item.id} onClick={() => { if (item.participants?.qr_code) void lookupParticipant(item.participants.qr_code); }} disabled={!online || !item.participants?.qr_code} className="flex w-full items-start gap-3 py-3 text-left disabled:cursor-not-allowed"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.participants?.name ?? "Peserta"}</p><p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">{item.code} · {formatWibDateTime(item.created_at)}</p><span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span></div><span className="shrink-0 text-sm font-semibold tabular-nums">{formatRupiah(item.total_amount)}</span></button>; })}</div></div></section></div>}{scanning && <div className="fixed inset-0 z-30 flex flex-col bg-[var(--ink)] text-white"><header className="flex items-center justify-between p-5"><div><p className="text-xs uppercase tracking-[0.2em] text-white/55">{booth?.name ?? "Booth"}</p><p className="mt-1 font-semibold">Scanner QR</p></div><button onClick={() => setScanning(false)} className="min-h-12 border border-white/20 px-4 text-sm font-semibold">Tutup</button></header><div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="relative aspect-square w-full max-w-sm overflow-hidden border border-white/50"><video ref={videoRef} className="size-full object-cover" autoPlay muted playsInline aria-label="Pratinjau kamera scanner QR" /><div className="pointer-events-none absolute inset-8 border-2 border-[var(--warning)]" />{!online && <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center text-sm font-semibold">Offline - kamera scanner dinonaktifkan.</div>}</div><p className="mt-8 text-lg font-semibold">Arahkan kamera ke QR badge</p><p className="mt-2 text-sm text-white/55">Scanner membaca otomatis. Pastikan QR terlihat utuh.</p></div></div>}</div></main>;
}
