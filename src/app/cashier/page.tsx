"use client";

import { ArrowRight, CheckCircle, CreditCard, MagnifyingGlass, Money, Receipt, Scan, UserCircle, UsersThree, WarningCircle, XCircle } from "@phosphor-icons/react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { HelpPanel } from "@/components/help-panel";
import { SearchResultsSkeleton, Spinner } from "@/components/search-loading";
import { useToast } from "@/components/toast";
import { Button, Card, IconButton, StatusChip, TextArea, useScrolledPastTop } from "@/components/m3";
import { terbilangRupiah } from "@/lib/terbilang";
import { useOnline } from "@/lib/use-online";

type Order = { id: string; code: string; booth_id: number; has_discount_item: boolean; regular_amount: number; total_amount: number; status: string; pickup_mode: string };
type Participant = { id: string; name: string; company: string | null; title: string | null };
type PendingEntry = { qr_code: string; name: string; company: string | null; orders_count: number; total: number; oldest_created_at: string };
type SearchHit = { id: string; qr_code: string; name: string; company: string | null; title: string | null; pending_count: number; pending_total: number };
type PaymentMethodOption = { code: string; label: string; requires_reference: boolean; reference_label: string | null; reference_digits: number | null };
const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;

export default function CashierPage() {
  const [qr, setQr] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  // Daftar metode datang dari admin (tabel payment_methods), bukan hardcode.
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [method, setMethod] = useState("");
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

  // Muat ulang berkala: admin bisa mematikan metode di tengah acara, dan kasir
  // tidak boleh terus menampilkan tombol yang sudah ditolak server.
  const loadMethods = useCallback(async () => {
    const response = await fetch("/api/admin/payment-methods", { cache: "no-store" });
    if (!response.ok) return;
    const list = ((await response.json()).payment_methods ?? []) as PaymentMethodOption[];
    setMethods(list);
    // Jaga pilihan kasir tetap valid kalau metode terpilih baru saja dimatikan.
    setMethod((current) => (list.some((item) => item.code === current) ? current : list[0]?.code ?? ""));
  }, []);

  useEffect(() => { const initial = window.setTimeout(() => { void loadMethods(); }, 0); const timer = window.setInterval(() => { void loadMethods(); }, 30000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [loadMethods]);

  const activeMethod = useMemo(() => methods.find((item) => item.code === method) ?? null, [methods, method]);
  const referenceDigits = activeMethod?.requires_reference ? activeMethod.reference_digits ?? 6 : 0;
  const referenceReady = !activeMethod?.requires_reference || approval.length === referenceDigits;

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
    // Hasil kata kunci sebelumnya dikosongkan lebih dulu agar kasir tidak menekan
    // nama yang sudah tidak sesuai dengan yang sedang ia cari.
    setSearchHits([]);
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
    const response = await fetch("/api/orders/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_ids: selected, payment_method: method, approval_code: activeMethod?.requires_reference ? approval : null }) });
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

  const { sentinel: barSentinel, scrolled: barScrolled } = useScrolledPastTop();

  return (
    <main className="min-h-dvh bg-surface text-on-surface">
      {/* Bilah atas M3: sewarna kanvas saat halaman di posisi teratas, naik ke
          `surface-container` begitu ada yang tergulir di bawahnya. Blok berwarna
          dengan garis bawah yang menetap adalah pola Material 2. */}
      <div ref={barSentinel} aria-hidden className="h-px" />
      <header className={`sticky top-0 z-20 px-4 py-3 transition-colors duration-200 ease-standard sm:px-8 sm:py-4 ${barScrolled ? "bg-surface-container" : "bg-surface"}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
              <CreditCard size={23} weight="duotone" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-title-medium font-semibold">Kasir Utama</p>
              <p className="text-label-medium uppercase tracking-[0.16em] text-on-surface-variant">Payment desk</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusChip tone="neutral" className="min-h-11 tabular-nums" icon={<UsersThree size={18} className="shrink-0 text-primary" />}>
              {queue.length}<span className="hidden sm:inline"> menunggu</span>
            </StatusChip>
            <HelpPanel role="cashier" />
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="mb-5 space-y-2">
          <div className="flex gap-2">
            <input
              value={qr}
              onChange={(event) => setQr(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") lookup(); }}
              placeholder="Kode QR peserta"
              className="h-12 min-w-0 flex-1 rounded-md border border-outline bg-surface-container-lowest px-4 text-body-large text-on-surface outline-none transition-colors focus:border-primary"
              aria-label="Kode QR peserta"
            />
            <Button variant="tonal" disabled={!online || loading} onClick={() => lookup()}>Cari</Button>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" size="md" onClick={() => { setScanning(true); setError(""); }} disabled={!online} icon={<Scan size={19} weight="bold" />}>
              Scan QR
            </Button>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void searchParticipants(); }}
              placeholder="Cari nama / perusahaan"
              className="h-12 min-w-0 flex-1 rounded-md border border-outline bg-surface-container-lowest px-4 text-body-large text-on-surface outline-none transition-colors focus:border-primary"
              aria-label="Cari nama atau perusahaan peserta"
            />
            <IconButton
              variant="outlined"
              label="Cari peserta"
              onClick={() => void searchParticipants()}
              disabled={!online || searching || !searchTerm.trim()}
            >
              {searching ? <Spinner size={19} /> : <MagnifyingGlass size={19} />}
            </IconButton>
          </div>

          {/* Kerangka hasil selama menunggu. Kartu kasir berada di atas antrean
              pembayaran, jadi tinggi yang melompat saat hasil tiba menggeser
              daftar tagihan tepat ketika kasir hendak menekannya. */}
          {searching && <SearchResultsSkeleton rows={3} className="overflow-hidden rounded-lg bg-surface-container" />}
          <p aria-live="polite" className="sr-only">{searching ? "Mencari peserta" : searchHits.length > 0 ? `${searchHits.length} peserta ditemukan` : ""}</p>

          {!searching && searchHits.length > 0 && (
            <div className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
              {searchHits.map((hit) => (
                <button key={hit.id} onClick={() => lookup(hit.qr_code)} disabled={loading} className="m3-state flex w-full items-center gap-3 p-3 text-left disabled:opacity-50">
                  <UserCircle size={30} weight="duotone" className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-medium font-semibold">{hit.name}</span>
                    <span className="block truncate text-body-small text-on-surface-variant">{hit.company ?? "Instansi tidak diisi"}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    {hit.pending_count > 0 ? (
                      <>
                        <span className="block text-body-medium font-semibold tabular-nums">{formatRupiah(hit.pending_total)}</span>
                        <span className="block text-label-small text-on-surface-variant">{hit.pending_count} pending</span>
                      </>
                    ) : (
                      <span className="text-label-small text-on-surface-variant">Tidak ada tagihan</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {searchTerm && !searching && searchHits.length === 0 && <p className="text-body-small text-on-surface-variant">Tekan cari untuk mencari peserta.</p>}
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-3 rounded-lg bg-error-container p-4 text-body-medium text-on-error-container">
            <XCircle size={20} weight="fill" className="shrink-0" />{error}
          </div>
        )}

        {success.length > 0 && (
          <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-lg bg-success-container p-4 text-body-medium text-on-success-container">
            <span className="flex items-center gap-2"><CheckCircle size={20} weight="fill" /> Lunas: {success.join(" · ")}</span>
            <Button variant="text" size="sm" className="text-current" onClick={() => setSuccess([])}>Tutup</Button>
          </div>
        )}

        <Card className="mb-6 overflow-hidden" padded={false}>
          <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
            <div className="flex items-center gap-2">
              <UsersThree size={20} className="text-primary" />
              <h2 className="text-title-medium font-semibold">Antrean pembayaran</h2>
            </div>
            <span className="text-label-large font-semibold tabular-nums text-on-surface-variant">{queue.length} peserta menunggu</span>
          </div>
          {queue.length === 0 ? (
            <p className="p-6 text-center text-body-medium text-on-surface-variant">Belum ada order pending.</p>
          ) : (
            <div className="divide-y divide-outline-variant">
              {queue.map((entry) => (
                <button key={entry.qr_code} onClick={() => lookup(entry.qr_code)} disabled={!online || loading} className="m3-state flex w-full items-center gap-4 px-5 py-4 text-left disabled:opacity-50">
                  <UserCircle size={34} weight="duotone" className="text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-large font-semibold">{entry.name}</p>
                    <p className="truncate text-body-small text-on-surface-variant">{entry.company ?? "Instansi tidak diisi"} · {entry.orders_count} order</p>
                  </div>
                  <span className="text-body-medium font-semibold tabular-nums">{formatRupiah(entry.total)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <Card className="overflow-hidden" padded={false}>
            <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-5">
              {participant ? (
                <>
                  <UserCircle size={38} weight="duotone" className="text-primary" />
                  <div>
                    <h2 className="text-title-medium font-semibold">{participant.name}</h2>
                    <p className="mt-1 text-body-small text-on-surface-variant">{participant.company} · {participant.title}</p>
                  </div>
                </>
              ) : (
                <p className="text-body-medium text-on-surface-variant">Cari peserta dari QR badge.</p>
              )}
            </div>

            {orders.length === 0 ? (
              <div className="p-10 text-center text-body-medium text-on-surface-variant">
                <Receipt size={42} className="mx-auto mb-3 opacity-40" />Tidak ada order pending.
              </div>
            ) : (
              <div className="divide-y divide-outline-variant">
                {orders.map((order) => (
                  <div key={order.id} className="flex items-center gap-4 px-5 py-5">
                    <input
                      type="checkbox"
                      checked={selected.includes(order.id)}
                      onChange={() => setSelected((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])}
                      className="size-5 accent-[var(--md-sys-color-primary)]"
                      aria-label={`Pilih order ${order.code}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-body-large font-semibold">{order.code} <span className="font-normal text-on-surface-variant">· Booth {order.booth_id}</span></p>
                      <p className="mt-1 text-body-small text-on-surface-variant">{order.has_discount_item ? "Item diskon" : "Reguler"} — {order.pickup_mode === "immediate" ? "Serahkan langsung" : "Ambil setelah lunas"}</p>
                    </div>
                    <p className="text-body-large font-semibold tabular-nums">{formatRupiah(order.total_amount)}</p>
                    <Button variant="text" size="sm" className="text-error" onClick={() => { setVoidTarget(order); setVoidReason(""); setError(""); }}>Void</Button>
                  </div>
                ))}
              </div>
            )}

            {/* Total memakai warna terbalik supaya tetap jadi hal paling menonjol di
                layar, bahkan ketika kasir sedang menatap kolom nomor referensi.
                `inverse-surface` adalah cara M3 menyatakan itu — dan ia ikut
                berbalik sendiri di mode gelap, tidak seperti hitam mati. */}
            <div className="rounded-lg bg-inverse-surface px-5 py-6 text-inverse-on-surface">
              <div className="flex items-end justify-between gap-4">
                <span className="text-label-large uppercase tracking-[0.18em] opacity-70">Total</span>
                <span className="text-display-small font-semibold tabular-nums tracking-[-0.04em]">{formatRupiah(total)}</span>
              </div>
              {total > 0 && <p className="mt-2 text-right text-body-small leading-5 opacity-70">{terbilangRupiah(total)}</p>}
            </div>
          </Card>

          <Card className="sm:p-7">
            <div className="flex items-center gap-3">
              <Receipt size={23} className="text-primary" />
              <h2 className="text-title-medium font-semibold">Konfirmasi pembayaran</h2>
            </div>

            {methods.length === 0 ? (
              <div className="mt-7 flex gap-3 rounded-lg bg-warning-container p-4 text-body-medium text-on-warning-container">
                <WarningCircle size={20} weight="fill" className="shrink-0" /> Belum ada metode pembayaran aktif. Hubungi admin.
              </div>
            ) : (
              <div className={`mt-7 grid gap-2 ${methods.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
                {methods.map((option) => {
                  const active = method === option.code;
                  return (
                    <button
                      key={option.code}
                      onClick={() => { setMethod(option.code); setApproval(""); }}
                      aria-pressed={active}
                      className={`m3-state min-h-16 px-2 text-label-large font-semibold transition-[border-radius,background-color,color] duration-200 ease-emphasized ${active ? "rounded-lg bg-primary text-on-primary" : "rounded-2xl border border-outline text-on-surface-variant"}`}
                    >
                      {option.requires_reference ? <CreditCard size={19} className="mx-auto mb-1" /> : <Money size={19} className="mx-auto mb-1" />}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}

            {activeMethod?.requires_reference ? (
              <div className="mt-7">
                <label htmlFor="approval" className="text-label-large font-semibold">{activeMethod.reference_label ?? "Nomor referensi"}</label>
                <input
                  id="approval"
                  inputMode="numeric"
                  maxLength={referenceDigits}
                  value={approval}
                  onChange={(event) => setApproval(event.target.value.replace(/\D/g, ""))}
                  className="mt-2 h-16 w-full rounded-md border border-outline bg-surface-container-lowest px-4 text-headline-small tracking-[0.28em] tabular-nums text-on-surface outline-none transition-colors focus:border-primary"
                  placeholder={`${referenceDigits} digit`}
                />
              </div>
            ) : activeMethod && (
              <div className="mt-7 flex gap-3 rounded-lg bg-success-container p-4 text-body-medium text-on-success-container">
                <CheckCircle size={20} weight="fill" className="shrink-0" /> Nomor referensi tidak diperlukan untuk {activeMethod.label}.
              </div>
            )}

            <Button
              className="mt-8"
              size="xl"
              block
              loading={loading}
              disabled={!online || selected.length === 0 || !activeMethod || !referenceReady}
              onClick={settle}
              trailingIcon={loading ? undefined : <ArrowRight size={20} weight="bold" />}
            >
              {loading ? "Memproses..." : "Tandai lunas"}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-2 text-center text-body-small text-on-surface-variant">
              <WarningCircle size={16} /> Untuk membatalkan, tekan Void pada order di daftar tagihan.
            </p>
          </Card>
        </div>

        {scanning && (
          /* Overlay scanner selalu gelap, tidak ikut tema — sama seperti di App Booth. */
          <div className="fixed inset-0 z-40 flex flex-col bg-[var(--display-bg)] text-[var(--display-ink)]">
            <header className="flex items-center justify-between p-5">
              <div>
                <p className="text-label-medium uppercase tracking-[0.2em] opacity-70">Kasir</p>
                <p className="mt-1 text-title-medium font-semibold">Scanner QR</p>
              </div>
              <Button variant="outlined" className="border-current text-current" onClick={() => setScanning(false)}>Tutup</Button>
            </header>
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl border border-current/50">
                <video ref={videoRef} className="size-full object-cover" autoPlay muted playsInline aria-label="Pratinjau kamera scanner QR" />
                <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-warning" />
                {!online && <div className="absolute inset-0 flex items-center justify-center bg-scrim/80 p-6 text-center text-body-medium font-semibold">Offline — kamera scanner dinonaktifkan.</div>}
              </div>
              <p className="mt-8 text-title-medium font-semibold">Arahkan kamera ke QR badge</p>
              <p className="mt-2 text-body-medium opacity-70">Scanner membaca otomatis. Pastikan QR terlihat utuh.</p>
            </div>
          </div>
        )}

        {voidTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-5">
            <div className="w-full max-w-md rounded-2xl bg-surface-container-high p-6 shadow-level3">
              <div className="flex items-center gap-2">
                <WarningCircle size={22} weight="fill" className="text-error" />
                <h2 className="text-title-large font-semibold">Void order {voidTarget.code}</h2>
              </div>
              <p className="mt-3 text-body-medium text-on-surface-variant">Order dibatalkan dan tidak bisa dibayar. Kuota item diskon peserta kembali tersedia. Alasan wajib diisi.</p>
              <TextArea
                className="mt-5"
                label="Alasan void"
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                rows={3}
                placeholder="Contoh: EDC gagal, salah input nominal"
              />
              <div className="mt-6 flex gap-3">
                <Button variant="outlined" className="flex-1" onClick={() => { setVoidTarget(null); setVoidReason(""); }}>Batal</Button>
                <Button variant="danger" className="flex-1" loading={loading} disabled={!online || !voidReason.trim()} onClick={confirmVoid}>
                  {loading ? "Memproses..." : "Void order"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
