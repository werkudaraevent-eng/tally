"use client";

import { ArrowClockwise, CheckCircle, Circle, MagnifyingGlass, Prohibit, Receipt, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExportMenu } from "@/components/admin/export-menu";
import {
  Banner, Button, ChipMenu, DetailSection, Dialog, EmptyCell, EmptyState, IconButton, KeyValue, ListDetail, MetaSeparator,
  Pane, PaneBody, PaneFooter, PaneHeader, StatusChip, TextField, WorkspaceHeader, WorkspacePage, type ChipTone,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { cx } from "@/lib/m3/cx";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import { Skeleton } from "@/components/m3/skeleton";

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
  order_special_items?: Array<{ price_at_claim: number; special_offers: { code: string; name: string } | null }>;
};
type Booth = { id: number; code: string; name: string };
/**
 * Ringkasan hasil filter, DIHITUNG DI SERVER atas seluruh baris yang cocok.
 *
 * Sengaja tidak dijumlahkan dari `orders` di layar ini: halaman mengambil 100
 * baris sekaligus sementara ordernya sudah 195, sehingga penjumlahan sisi klien
 * pernah terukur meleset Rp 26,8 juta tanpa satu pun tanda bahwa angkanya salah.
 */
type Summary = {
  order_count: number;
  total_amount: number;
  regular_amount: number;
  special_amount: number;
  discount_item_count: number;
  void_count: number;
  void_amount: number;
};

const money = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(value)}`;

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  pending: { label: "Pending", tone: "warning" },
  paid: { label: "Lunas", tone: "success" },
  handed_over: { label: "Diserahkan", tone: "neutral" },
  void: { label: "Void", tone: "error" },
};
const statusOf = (status: string) => STATUS[status] ?? STATUS.pending;

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Lunas" },
  { value: "handed_over", label: "Diserahkan" },
  { value: "void", label: "Void" },
];

/** Satu sel strip ringkasan. Garis antarsel berasal dari `gap-px` di wadahnya. */
function Angka({ label, value, note, tone }: { label: string; value: ReactNode; note: ReactNode; tone?: "error" | "muted" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-surface-container-lowest px-5 py-4">
      <span className="text-body-medium text-on-surface-variant">{label}</span>
      <span className={cx("text-headline-small font-semibold tabular-nums", tone === "error" && "text-error", tone === "muted" && "text-on-surface-variant")}>{value}</span>
      <span className="text-body-medium text-on-surface-variant">{note}</span>
    </div>
  );
}

/** Satu langkah riwayat order: selesai (centang) atau belum (lingkaran kosong). */
function Langkah({ done, title, detail }: { done: boolean; title: string; detail?: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-body-medium">
      {done
        ? <CheckCircle size={16} className="mt-0.5 shrink-0 text-success" aria-label="Selesai" />
        : <Circle size={16} className="mt-0.5 shrink-0 text-on-surface-variant" aria-label="Belum" />}
      <span className="min-w-0">
        <span className="block font-medium text-on-surface">{title}</span>
        {detail ? <span className="block text-on-surface-variant">{detail}</span> : null}
      </span>
    </li>
  );
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [total, setTotal] = useState(0);
  // undefined = belum dimuat, null = gagal dihitung. Dibedakan supaya layar
  // tidak memajang Rp 0 untuk keadaan "tidak diketahui".
  const [summary, setSummary] = useState<Summary | null | undefined>(undefined);
  const [status, setStatus] = useState("");
  const [boothId, setBoothId] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Void hanya untuk super_admin. Server juga menolak lewat
  // requireUser(["super_admin"]); tombolnya disembunyikan supaya admin biasa
  // tidak menemui aksi yang pasti gagal.
  const [isOwner, setIsOwner] = useState(false);
  const [voidTarget, setVoidTarget] = useState<OrderRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voiding, setVoiding] = useState(false);
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();
  const dateTime = (value: string | null) => `${formatEventDateTime(value, zone)} ${abbr}`;

  // Kata cari ditunda sebentar: dulu daftar dimuat ulang pada setiap ketukan.
  useEffect(() => {
    const timer = window.setTimeout(() => { setQ(qInput); }, 250);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  // Hanya respons dari permintaan terakhir yang boleh mengisi layar. Chip saring
  // bisa berganti lebih cepat daripada server menjawab.
  const urutanMuat = useRef(0);
  const load = useCallback(async () => {
    const nomor = ++urutanMuat.current;
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    if (boothId) params.set("booth_id", boothId);
    if (q.trim()) params.set("q", q.trim());
    const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (nomor !== urutanMuat.current) return;
    setLoading(false);
    setLoaded(true);
    if (!response || !response.ok) {
      /**
       * Hasil lama DIBUANG, bukan dibiarkan di layar bersama pita galat.
       *
       * Yang ada di `orders` adalah hasil penyaring SEBELUMNYA, sedangkan chip
       * di atas daftar sudah memajang penyaring yang baru, termasuk strip
       * ringkasan dengan angka rupiah. Membiarkannya berarti menampilkan total
       * belanja satu booth di bawah label booth yang lain.
       *
       * `summary` ke null, bukan undefined: null berarti "gagal dihitung" dan
       * layar memajang keterangan, sedangkan undefined berarti "belum dimuat"
       * dan memajang kerangka yang tidak akan pernah terisi.
       */
      setOrders([]);
      setTotal(0);
      setSummary(null);
      setError(response ? (data.error?.message ?? "Order gagal dimuat.") : "Koneksi terputus. Daftar order tidak bisa dimuat.");
      return;
    }
    setOrders(data.orders ?? []);
    setTotal(data.total ?? 0);
    setSummary(data.summary ?? null);
  }, [status, boothId, q]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => { void fetch("/api/admin/booths", { cache: "no-store" }).then(async (r) => { if (r.ok) setBooths((await r.json()).booths ?? []); }); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void fetch("/api/auth/me", { cache: "no-store" }).then(async (r) => { if (r.ok) setIsOwner((await r.json()).user?.role === "super_admin"); }); }, 0); return () => window.clearTimeout(timer); }, []);

  function closeVoid() { setVoidTarget(null); setVoidReason(""); setVoidError(""); }

  async function confirmVoid() {
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (reason.length < 3) { setVoidError("Alasan void minimal 3 huruf."); return; }
    setVoiding(true); setVoidError("");
    const response = await fetch(`/api/admin/orders/${voidTarget.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
    setVoiding(false);
    // `fetch` yang gagal berarti permintaannya mungkin SUDAH sampai ke server.
    // Menyuruh "coba lagi" tanpa syarat bisa membuat order yang sudah batal
    // di-void dua kali; yang benar adalah memuat ulang daftarnya dulu.
    if (!response) { setVoidError("Koneksi terputus. Muat ulang daftar untuk memastikan statusnya sebelum mencoba lagi."); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = data.error?.details?.reason?.[0] ?? data.error?.message ?? `Void gagal (${response.status}).`;
      setVoidError(failure);
      toast.error("Void gagal", failure);
      return;
    }
    const code = voidTarget.code;
    closeVoid();
    toast.warning(`Order ${code} dibatalkan`, "Kuota item diskon peserta kembali tersedia dan nilainya keluar dari leaderboard.");
    await load();
  }

  const boothOf = (id: number) => booths.find((item) => item.id === id);
  // Kode booth dibaca dari data booth, BUKAN dibentuk dari `B` + booth_id: kode
  // booth bebas huruf (mis. PH), dan menyusunnya dari id menampilkan PH sebagai "B8".
  const boothCode = (id: number) => boothOf(id)?.code ?? `#${id}`;

  const adaSaringan = Boolean(status || boothId || q.trim());
  const hapusSaringan = () => { setStatus(""); setBoothId(""); setQInput(""); setQ(""); };
  const terpilih = selectedId ? orders.find((order) => order.id === selectedId) ?? null : null;

  // ---- Panel daftar --------------------------------------------------------
  const list = (
    <Pane aria-label="Daftar order">
      <PaneHeader className="flex-wrap gap-2 px-3 py-3">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Cari nomor stiker</span>
          <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
            placeholder="Nomor stiker, mis. B3-014"
            className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none placeholder:text-on-surface-variant focus:border-primary"
          />
        </label>
        <ChipMenu label="Status" options={STATUS_OPTIONS} selected={status ? [status] : []} onChange={(next) => setStatus(next[0] ?? "")} />
        <ChipMenu
          label="Booth"
          searchable={booths.length > 8}
          options={booths.map((booth) => ({ value: String(booth.id), label: `${booth.code} · ${booth.name}` }))}
          selected={boothId ? [boothId] : []}
          onChange={(next) => setBoothId(next[0] ?? "")}
          summary={(pilihan) => `Booth: ${boothCode(Number(pilihan[0]?.value))}`}
        />
        <IconButton size="sm" variant="outlined" label="Muat ulang daftar" disabled={loading} onClick={() => void load()}><ArrowClockwise size={16} /></IconButton>
      </PaneHeader>

      <PaneBody>
        {error ? (
          <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</p>
        ) : !loaded ? (
          <div aria-label="Memuat order" className="flex flex-col">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-6 border-b border-outline-variant px-4 py-4">
                <Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-40" /><Skeleton className="ml-auto h-3 w-24" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            plain
            icon={<Receipt size={40} />}
            title={adaSaringan ? "Tidak ada order yang cocok" : "Belum ada order"}
            description={adaSaringan ? "Longgarkan salah satu saringan atau ubah nomor stiker." : "Order muncul di sini begitu booth mencatat transaksi pertama."}
            action={adaSaringan ? <Button variant="outlined" size="sm" onClick={hapusSaringan}>Hapus semua saringan</Button> : undefined}
          />
        ) : (
          <table className={cx("w-full min-w-[560px] border-separate border-spacing-0 text-left text-body-medium", loading && "opacity-60")}>
            <thead className="sticky top-0 z-10 bg-surface-container-high text-on-surface-variant">
              <tr>
                <th scope="col" className="border-b border-outline-variant px-4 py-2.5 font-medium">Order</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Peserta</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="border-b border-outline-variant px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const aktif = order.id === selectedId;
                const badge = statusOf(order.status);
                return (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedId(aktif ? null : order.id)}
                    className={cx("cursor-pointer", aktif ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft")}
                  >
                    <td className="border-b border-outline-variant px-4 py-2.5">
                      <button
                        type="button"
                        aria-pressed={aktif}
                        onClick={(event) => { event.stopPropagation(); setSelectedId(aktif ? null : order.id); }}
                        className="block rounded-sm text-left"
                      >
                        <span className="block font-medium tabular-nums text-on-surface">{order.code}</span>
                        <span className="block text-on-surface-variant">{order.has_discount_item ? "Item diskon" : "Reguler"}</span>
                      </button>
                    </td>
                    <td className="max-w-0 border-b border-outline-variant px-3 py-2.5">
                      <span className="block truncate text-on-surface">{order.participants?.name ?? <EmptyCell />}</span>
                      <span className="block truncate text-on-surface-variant">{order.participants?.company ?? " "}</span>
                    </td>
                    <td className="border-b border-outline-variant px-3 py-2.5"><StatusChip dot tone={badge.tone}>{badge.label}</StatusChip></td>
                    <td className={cx("border-b border-outline-variant px-4 py-2.5 text-right font-medium tabular-nums", order.status === "void" && "font-normal text-on-surface-variant")}>{money(order.total_amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PaneBody>

      {/* Tanpa halaman berikutnya: daftar ini memang hanya memuat 100 order
          terbaru. Keterangannya ditulis supaya tidak dikira sudah semuanya. */}
      <PaneFooter
        className="bg-surface-container-lowest py-2.5"
        note={
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="tabular-nums">{error ? "Daftar tidak dimuat" : total > orders.length ? `${orders.length} order terbaru dari ${total}` : `${total} order`}</span>
            {!error && total > orders.length ? <span>Persempit saringan untuk melihat sisanya.</span> : null}
            {adaSaringan ? <button type="button" onClick={hapusSaringan} className="rounded-sm font-medium text-primary hover:underline">Hapus semua saringan</button> : null}
          </span>
        }
      />
    </Pane>
  );

  // ---- Panel detail --------------------------------------------------------
  const detail = terpilih ? (() => {
    const order = terpilih;
    const badge = statusOf(order.status);
    const booth = boothOf(order.booth_id);
    const items = order.order_special_items ?? [];
    const subjudul = [order.participants?.name, order.participants?.company, booth ? `Booth ${booth.code} ${booth.name}` : `Booth ${boothCode(order.booth_id)}`].filter(Boolean).join(" · ");
    const bisaVoid = isOwner && order.status !== "void";
    return (
      <Pane as="aside" aria-label={`Detail order ${order.code}`}>
        <div className="flex shrink-0 flex-col gap-1 border-b border-outline-variant px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-title-medium font-semibold tabular-nums">{order.code}</h2>
            <StatusChip dot tone={badge.tone}>{badge.label}</StatusChip>
            <IconButton size="sm" label="Tutup detail" className="ml-auto" onClick={() => setSelectedId(null)}><X size={16} /></IconButton>
          </div>
          <p className={cx("text-headline-small font-semibold tabular-nums", order.status === "void" && "text-on-surface-variant")}>{money(order.total_amount)}</p>
          <p className="text-body-medium text-on-surface-variant">{subjudul}</p>
        </div>
        <PaneBody>
          <dl>
            {order.status === "void" ? (
              <DetailSection title="Alasan void">
                <p className="text-body-medium">{order.void_reason ?? <EmptyCell />}</p>
              </DetailSection>
            ) : null}
            {/* Nominal reguler ikut dirinci: tanpa itu order tanpa item spesial
                terlihat kosong, padahal isinya belanja reguler. */}
            <DetailSection title="Item">
              {order.regular_amount > 0 ? <KeyValue label="Item reguler"><span className="block text-right tabular-nums">{money(order.regular_amount)}</span></KeyValue> : null}
              {items.map((item, index) => (
                <KeyValue key={`${item.special_offers?.code ?? "item"}-${index}`} label={item.special_offers?.name ?? "Item dihapus"}>
                  <span className="block text-right tabular-nums">{money(item.price_at_claim)}</span>
                </KeyValue>
              ))}
              {order.regular_amount === 0 && items.length === 0 ? <p className="text-body-medium text-on-surface-variant">Tidak ada item tercatat.</p> : null}
            </DetailSection>
            <DetailSection title="Pembayaran">
              <KeyValue label="Metode">{order.payment_method ? `${order.payment_method.toUpperCase()}${order.approval_code ? ` · approval ${order.approval_code}` : ""}` : <EmptyCell />}</KeyValue>
              <KeyValue label="Pengambilan">{order.pickup_mode === "immediate" ? "Serahkan langsung di booth" : "Ambil setelah lunas"}</KeyValue>
              <KeyValue label="Kode QR peserta"><span className="tabular-nums">{order.participants?.qr_code ?? <EmptyCell />}</span></KeyValue>
            </DetailSection>
            <DetailSection title="Riwayat">
              <ol className="flex flex-col gap-3">
                <Langkah done title={`Dibuat di booth ${boothCode(order.booth_id)}`} detail={dateTime(order.created_at)} />
                {order.paid_at
                  ? <Langkah done title="Lunas di kasir" detail={dateTime(order.paid_at)} />
                  : order.status !== "void" ? <Langkah done={false} title="Belum lunas" /> : null}
                {order.handed_over_at
                  ? <Langkah done title="Diserahkan" detail={dateTime(order.handed_over_at)} />
                  : order.status === "paid" && order.pickup_mode === "after_payment" ? <Langkah done={false} title="Belum diserahkan" detail="Ambil setelah lunas" /> : null}
                {order.status === "void" ? <Langkah done title="Dibatalkan (void)" /> : null}
              </ol>
            </DetailSection>
          </dl>
        </PaneBody>
        <PaneFooter note={order.status === "void" ? "Order ini sudah void" : isOwner ? "Void mengeluarkan nilainya dari hitungan" : "Void hanya untuk super admin"}>
          {bisaVoid ? (
            <Button variant="outlined" size="sm" className="text-error" icon={<Prohibit size={16} />} onClick={() => { setVoidTarget(order); setVoidReason(""); setVoidError(""); }}>
              Void order
            </Button>
          ) : null}
        </PaneFooter>
      </Pane>
    );
  })() : null;

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={
          <>
            <span className="tabular-nums">{!loaded ? "Memuat order" : error ? "Jumlah order tidak diketahui" : `${total} order`}</span>
            <MetaSeparator />
            <span>Ringkasan mengikuti saringan, dihitung dari semua order yang cocok</span>
          </>
        }
        actions={<ExportMenu />}
      />

      {/* Ringkasan hasil filter, di ANTARA judul dan daftar supaya terbaca sebagai
          akibat dari saringan di bawahnya. */}
      {summary === null ? (
        <Banner tone="warning" icon={<XCircle size={18} />}>Ringkasan gagal dihitung. Angka sengaja tidak ditampilkan daripada menampilkan nilai yang belum tentu benar.</Banner>
      ) : (
        <section aria-label="Ringkasan hasil saringan" className="grid shrink-0 gap-px overflow-hidden rounded-lg border border-outline-variant bg-outline-variant sm:grid-cols-2 xl:grid-cols-4">
          {summary === undefined ? [0, 1, 2, 3].map((index) => (
            <div key={index} aria-hidden className="flex flex-col gap-2 bg-surface-container-lowest px-5 py-4"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-7 w-36" /><Skeleton className="h-3.5 w-32" /></div>
          )) : (
            <>
              <Angka label="Nilai transaksi" value={money(summary.total_amount)} note={`${summary.order_count} order dihitung, di luar void`} />
              <Angka label="Belanja reguler" value={money(summary.regular_amount)} note="Tanpa nilai item spesial" />
              <Angka label="Item spesial" value={money(summary.special_amount)} note={`${summary.discount_item_count} order pakai item diskon`} />
              {/* Void dipisah, TIDAK dicampur ke total, supaya angka di sini cocok
                  dengan Laporan dan leaderboard yang hanya menghitung lunas. */}
              <Angka
                label="Void"
                value={`${summary.void_count} order`}
                tone={summary.void_count > 0 ? "error" : "muted"}
                note={summary.void_count > 0 ? `Senilai ${money(summary.void_amount)}, tidak dihitung` : "Tidak ada order dibatalkan"}
              />
            </>
          )}
        </section>
      )}

      <ListDetail list={list} detail={detail} detailWidth={420} />

      {/* Konfirmasi void. Dialog, bukan window.confirm: ia harus memuat kolom
          alasan yang wajib diisi. */}
      <Dialog
        open={voidTarget !== null}
        onClose={closeVoid}
        dismissible={!voiding}
        size="md"
        tone="danger"
        icon={<Prohibit size={22} />}
        title={`Void order ${voidTarget?.code ?? ""}?`}
        actions={
          <>
            <Button variant="outlined" disabled={voiding} onClick={closeVoid}>Batal</Button>
            <Button variant="danger" icon={<Prohibit size={18} />} loading={voiding} disabled={voidReason.trim().length < 3} onClick={() => void confirmVoid()}>
              Void order ini
            </Button>
          </>
        }
      >
        {voidTarget ? (
          <>
            {/* Ringkasan order. Nomor stiker saja tidak cukup untuk memastikan
                baris yang benar: yang dibatalkan adalah transaksi orang sungguhan. */}
            <div className="mt-4 flex flex-col gap-0.5 rounded-md bg-surface-container-high p-4 text-body-medium">
              <p className="font-medium">{voidTarget.participants?.name ?? <EmptyCell />}</p>
              {voidTarget.participants?.company ? <p className="text-on-surface-variant">{voidTarget.participants.company}</p> : null}
              <p className="pt-1 tabular-nums">{money(voidTarget.total_amount)} · Booth {boothCode(voidTarget.booth_id)} · {statusOf(voidTarget.status).label}</p>
            </div>

            {/* Akibatnya ditulis sesuai RPC void_order_transaction, bukan
                diringkas jadi "yakin?". */}
            <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-body-medium text-on-surface-variant">
              <li>Nilainya keluar dari leaderboard top spender dan dari Laporan.</li>
              <li>Kuota item diskon peserta kembali tersedia, dan stok item spesial yang terbatas bertambah lagi.</li>
              <li>Barisnya tetap ada dengan status Void. Riwayat dan nomor stikernya tidak hilang.</li>
              {voidTarget.status === "handed_over" ? <li className="font-medium text-warning">Barang sudah diserahkan ke peserta. Void tidak menariknya kembali, hanya mencatat pembatalannya.</li> : null}
            </ul>
          </>
        ) : null}

        <TextField
          className="mt-4"
          label="Alasan void"
          value={voidReason}
          onChange={(event) => setVoidReason(event.target.value)}
          maxLength={500}
          autoFocus
          placeholder="mis. salah input nominal"
          hint="Tersimpan permanen di audit trail bersama nama Anda. Ini satu-satunya keterangan kenapa nomor stiker ini tidak terhitung."
          error={voidError || undefined}
        />
      </Dialog>
    </WorkspacePage>
  );
}
