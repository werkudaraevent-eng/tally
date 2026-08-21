"use client";

import { FunnelSimple, ListChecks, Prohibit, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { ExportMenu } from "@/components/admin/export-menu";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { useEventTimeZone } from "@/lib/use-event-timezone";

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
const statusBadge = (status: string): { label: string; className: string } => {
  switch (status) {
    case "paid": return { label: "Lunas", className: "bg-success-soft text-primary-dim" };
    case "handed_over": return { label: "Diserahkan", className: "bg-panel-high text-on-surface-variant" };
    case "void": return { label: "Void", className: "bg-error-soft text-error" };
    default: return { label: "Pending", className: "bg-warning-soft text-on-warning-soft" };
  }
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [total, setTotal] = useState(0);
  // undefined = belum dimuat, null = gagal dihitung. Dibedakan supaya layar
  // tidak memajang Rp 0 untuk keadaan "tidak diketahui".
  const [summary, setSummary] = useState<Summary | null | undefined>(undefined);
  const [status, setStatus] = useState("");
  const [boothId, setBoothId] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Void hanya untuk super_admin. Server juga menolak lewat
  // requireUser(["super_admin"]); tombolnya disembunyikan supaya admin biasa
  // tidak menemui aksi yang pasti gagal. Pola sama dengan link Audit trail di
  // admin-shell dan tombol hapus sesi undian.
  const [isOwner, setIsOwner] = useState(false);
  const [voidTarget, setVoidTarget] = useState<OrderRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();
  // Dipindah ke dalam komponen karena kini bergantung pada zona acara. Sebagai
  // fungsi modul ia tidak punya akses ke setelan.
  const dateTime = (value: string | null) => formatEventDateTime(value, zone);

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
    setSummary(data.summary ?? null);
  }, [status, boothId, q]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => { void fetch("/api/admin/booths", { cache: "no-store" }).then(async (r) => { if (r.ok) setBooths((await r.json()).booths ?? []); }); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void fetch("/api/auth/me", { cache: "no-store" }).then(async (r) => { if (r.ok) setIsOwner((await r.json()).user?.role === "super_admin"); }); }, 0); return () => window.clearTimeout(timer); }, []);

  async function confirmVoid() {
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (reason.length < 3) { setError("Alasan void minimal 3 huruf."); return; }
    setVoiding(true); setError("");
    const response = await fetch(`/api/admin/orders/${voidTarget.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
    setVoiding(false);
    // `fetch` yang gagal berarti permintaannya mungkin SUDAH sampai ke server.
    // Menyuruh "coba lagi" tanpa syarat bisa membuat order yang sudah batal
    // di-void dua kali; yang benar adalah memuat ulang daftarnya dulu.
    if (!response) { setError("Koneksi terputus. Muat ulang daftar untuk memastikan statusnya sebelum mencoba lagi."); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = data.error?.details?.reason?.[0] ?? data.error?.message ?? `Void gagal (${response.status}).`;
      setError(failure);
      toast.error("Void gagal", failure);
      return;
    }
    const code = voidTarget.code;
    setVoidTarget(null); setVoidReason("");
    toast.warning(`Order ${code} dibatalkan`, "Kuota item diskon peserta kembali tersedia dan nilainya keluar dari leaderboard.");
    await load();
  }

  return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-body-medium leading-6 text-on-surface-variant">Pantau seluruh transaksi dengan filter status, booth, dan pencarian nomor stiker.</p>
        </div>
        <ExportMenu />
      </div>

      <div className="rounded-lg mt-8 flex flex-wrap items-end gap-3 border border-outline-variant bg-panel p-4">
        <div className="flex items-center gap-2 text-body-small font-semibold uppercase tracking-[0.14em] text-on-surface-variant"><FunnelSimple size={18} /> Filter</div>
        <label className="text-body-medium">Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md mt-1 block h-11 w-44 border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary">
            <option value="">Semua status</option>
            <option value="pending">Pending</option>
            <option value="paid">Lunas</option>
            <option value="handed_over">Diserahkan</option>
            <option value="void">Void</option>
          </select>
        </label>
        <label className="text-body-medium">Booth
          <select value={boothId} onChange={(event) => setBoothId(event.target.value)} className="rounded-md mt-1 block h-11 w-44 border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary">
            <option value="">Semua booth</option>
            {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
          </select>
        </label>
        <label className="text-body-medium">Nomor stiker
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Contoh: B3-014" className="rounded-md mt-1 block h-11 w-48 border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary" />
        </label>
        <button onClick={() => void load()} disabled={loading} className="rounded-md min-h-11 bg-primary px-4 text-body-medium font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-50">{loading ? "Memuat..." : "Terapkan"}</button>
        <span className="ml-auto text-body-medium text-on-surface-variant">{total} order</span>
      </div>

      {error && <div role="alert" className="rounded-lg mt-5 flex items-center gap-3 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error"><XCircle size={20} />{error}</div>}

      {/* Ringkasan hasil filter.
          Ditaruh DI ANTARA filter dan tabel supaya terbaca sebagai akibat dari
          filter di atasnya. Di bawah tabel ia akan terlewat, karena dengan 100
          baris tidak ada yang menggulir sampai dasar untuk memeriksa total. */}
      {summary === null
        ? <p className="rounded-lg mt-6 border border-outline-variant bg-panel-high p-4 text-body-medium text-on-surface-variant">Ringkasan gagal dihitung. Angka sengaja tidak ditampilkan daripada menampilkan nilai yang belum tentu benar.</p>
        : summary && <section className="mt-6" aria-label="Ringkasan hasil filter">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Nilai transaksi lebih dulu dan paling besar: itu satu-satunya
                angka yang dicari saat merekonsiliasi uang. */}
            <div className="rounded-lg bg-panel p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-on-surface-variant">Nilai transaksi</p>
              <p className="mt-1 text-headline-small font-semibold tabular-nums">{money(summary.total_amount)}</p>
              <p className="mt-1 text-body-small text-on-surface-variant">{summary.order_count} order dihitung</p>
            </div>
            <div className="rounded-lg bg-panel p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-on-surface-variant">Belanja reguler</p>
              <p className="mt-1 text-headline-small font-semibold tabular-nums">{money(summary.regular_amount)}</p>
              <p className="mt-1 text-body-small text-on-surface-variant">Angka inilah yang masuk leaderboard</p>
            </div>
            <div className="rounded-lg bg-panel p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-on-surface-variant">Item spesial</p>
              <p className="mt-1 text-headline-small font-semibold tabular-nums">{money(summary.special_amount)}</p>
              <p className="mt-1 text-body-small text-on-surface-variant">{summary.discount_item_count} order pakai item diskon</p>
            </div>
            {/* Void dipisah, TIDAK dicampur ke total. Mencampurnya membuat angka
                di sini tidak cocok dengan Reports dan leaderboard, yang keduanya
                hanya menghitung paid/handed_over — dan satu angka yang tidak bisa
                dijelaskan asalnya menghentikan seluruh rekonsiliasi. */}
            <div className="rounded-lg bg-panel p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-on-surface-variant">Void (tidak dihitung)</p>
              <p className={`mt-1 text-headline-small font-semibold tabular-nums ${summary.void_count > 0 ? "text-error" : "text-on-surface-variant"}`}>{summary.void_count}</p>
              <p className="mt-1 text-body-small text-on-surface-variant">{summary.void_count > 0 ? `Senilai ${money(summary.void_amount)}` : "Tidak ada order dibatalkan"}</p>
            </div>
          </div>
          {/* Cakupan ditulis eksplisit. Tabel hanya memuat 100 baris pertama,
              jadi tanpa keterangan ini orang wajar menyangka totalnya berasal
              dari yang terlihat saja. */}
          <p className="mt-2 text-body-small text-on-surface-variant">
            Dihitung dari seluruh {total} order yang cocok dengan filter, bukan hanya {orders.length} baris yang tampil di tabel.
          </p>
        </section>}

      <section className="rounded-lg mt-6 border border-outline-variant bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-body-medium">
            <thead><tr className="border-b border-outline-variant text-left text-body-small uppercase tracking-[0.12em] text-on-surface-variant">
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Peserta</th>
              <th className="px-4 py-3 font-semibold">Booth</th>
              {/* Kolom terpisah, bukan disisipkan ke kolom Order: isi keranjang adalah
                  pertanyaan pertama saat merekonsiliasi serah terima barang, jadi harus
                  dapat dibaca sekolom dari atas ke bawah. */}
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              {/* Zona ditulis di judul kolom, bukan diulang di tiap sel: jam yang
                  dipakai rekonsiliasi harus jelas zonanya, tapi mengulangnya 100
                  kali per halaman hanya menambah lebar tabel. */}
              <th className="px-4 py-3 font-semibold">Dibuat ({abbr})</th>
              <th className="px-4 py-3 font-semibold">Lunas ({abbr})</th>
              <th className="px-4 py-3 font-semibold">Bayar</th>
              {/* Kolom aksi hanya ada untuk super_admin, jadi lebar tabel tidak
                  bertambah bagi admin biasa yang tidak punya tombol apa pun. */}
              {isOwner && <th className="px-4 py-3 text-right font-semibold">Aksi</th>}
            </tr></thead>
            <tbody className="divide-y divide-outline-variant">
              {orders.length === 0 ? <tr><td colSpan={isOwner ? 10 : 9} className="px-4 py-12 text-center text-on-surface-variant"><ListChecks size={38} className="mx-auto mb-3 opacity-40" />Tidak ada order cocok.</td></tr> : orders.map((order) => {
                const badge = statusBadge(order.status);
                const items = order.order_special_items ?? [];
                return <tr key={order.id} className="align-top hover:bg-panel-high">
                  <td className="px-4 py-3"><p className="font-semibold">{order.code}</p><p className="text-body-small text-on-surface-variant">{order.has_discount_item ? "Item diskon" : "Reguler"}</p></td>
                  <td className="px-4 py-3"><p className="font-medium">{order.participants?.name ?? "—"}</p><p className="text-body-small text-on-surface-variant">{order.participants?.company ?? ""}</p></td>
                  {/* Kode booth dibaca dari data booth, BUKAN dibentuk dari `B` + booth_id.
                      Kode booth bebas huruf (mis. PH), jadi menyusunnya dari id menampilkan
                      booth PH sebagai "B8". Kebetulan cocok untuk B1..B7 karena id-nya sama
                      dengan angka di kodenya, sehingga salahnya baru terlihat pada booth
                      berkode non-numerik. Bug yang sama pernah terjadi di daftar user. */}
                  <td className="px-4 py-3">{booths.find((item) => item.id === order.booth_id)?.code ?? `#${order.booth_id}`}</td>
                  {/* Nominal reguler ikut dirinci: tanpa itu order Rp 75.000 tanpa item spesial
                      terlihat kosong, padahal isinya belanja reguler. */}
                  <td className="px-4 py-3 text-body-small">
                    {order.regular_amount > 0
                      ? <p>Item reguler <span className="tabular-nums text-on-surface-variant">{money(order.regular_amount)}</span></p>
                      : null}
                    {items.map((item, index) => <p key={`${item.special_offers?.code ?? "item"}-${index}`}>
                      {item.special_offers?.name ?? "Item dihapus"} <span className="tabular-nums text-on-surface-variant">{money(item.price_at_claim)}</span>
                    </p>)}
                    {order.regular_amount === 0 && items.length === 0
                      ? <span className="text-on-surface-variant">—</span>
                      : null}
                  </td>
                  <td className="px-4 py-3">{order.status === "void" && order.void_reason ? <span title={order.void_reason} className={`inline-flex rounded-sm px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span> : <span className={`inline-flex rounded-sm px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(order.total_amount)}</td>
                  <td className="px-4 py-3 text-body-small tabular-nums text-on-surface-variant">{dateTime(order.created_at)}</td>
                  <td className="px-4 py-3 text-body-small tabular-nums text-on-surface-variant">{dateTime(order.paid_at)}</td>
                  <td className="px-4 py-3 text-body-small text-on-surface-variant">{order.payment_method ? order.payment_method.toUpperCase() : "—"}{order.approval_code ? ` · ${order.approval_code}` : ""}</td>
                  {/* Order yang sudah void tidak punya tombol: mem-void ulang
                      tidak melakukan apa-apa, dan tombol yang selalu gagal
                      membuat staf mengira sistemnya rusak. */}
                  {isOwner && <td className="px-4 py-3 text-right">
                    {order.status === "void"
                      ? <span className="text-body-small text-on-surface-variant">—</span>
                      : <button type="button" onClick={() => { setVoidTarget(order); setVoidReason(""); setError(""); }} className="rounded-sm inline-flex min-h-9 items-center gap-1.5 border border-outline-variant px-2.5 text-body-small font-semibold text-error hover:border-error"><Prohibit size={15} /> Void</button>}
                  </td>}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Konfirmasi void.
          Dialog, bukan konfirmasi inline seperti di kartu lain: barisnya berada
          di tabel selebar 1040px yang digulir mendatar, sehingga kotak
          konfirmasi di dalam baris bisa berada di luar layar saat tombolnya
          ditekan. window.confirm juga tidak dipakai — ia tidak bisa memuat
          kolom alasan yang wajib diisi. */}
      {voidTarget && <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="void-title">
        <div className="rounded-lg w-full max-w-lg border border-outline-variant bg-panel p-6">
          <p id="void-title" className="flex items-center gap-2 text-title-large font-semibold"><Prohibit size={22} className="shrink-0 text-error" /> Void order {voidTarget.code}?</p>

          {/* Ringkasan order. Nomor stiker saja tidak cukup untuk memastikan
              baris yang benar — dua booth bisa punya nomor berdekatan, dan yang
              dibatalkan adalah transaksi milik orang sungguhan. */}
          <div className="rounded-lg mt-4 space-y-1 border border-outline-variant bg-panel-high p-4 text-body-medium">
            <p className="font-semibold">{voidTarget.participants?.name ?? "—"}</p>
            {voidTarget.participants?.company && <p className="text-body-small text-on-surface-variant">{voidTarget.participants.company}</p>}
            <p className="pt-1 tabular-nums">{money(voidTarget.total_amount)} · {booths.find((item) => item.id === voidTarget.booth_id)?.code ?? `#${voidTarget.booth_id}`} · {statusBadge(voidTarget.status).label}</p>
          </div>

          {/* Akibatnya ditulis, bukan diringkas jadi "yakin?". Void mengubah
              angka yang sedang tampil di proyektor, dan itu tidak jelas dari
              nama tombolnya. */}
          <ul className="mt-4 space-y-1.5 text-body-small leading-5 text-on-surface-variant">
            <li>· Nilainya keluar dari leaderboard top spender dan dari Reports.</li>
            <li>· Kuota item diskon peserta kembali tersedia.</li>
            <li>· Barisnya TETAP ada dengan status Void — riwayat dan nomor stikernya tidak hilang.</li>
            {voidTarget.status === "handed_over" && <li className="font-semibold text-warning">· Barang sudah diserahkan ke peserta. Void tidak menariknya kembali, hanya mencatat pembatalannya.</li>}
          </ul>

          <label htmlFor="void-reason" className="mt-4 block text-body-medium font-semibold">Alasan void <span className="font-normal text-on-surface-variant">(wajib)</span></label>
          <input id="void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} maxLength={500} autoFocus placeholder="mis. salah input nominal" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary" />
          <p className="mt-2 text-body-small text-on-surface-variant">Tersimpan permanen di audit trail bersama nama Anda. Ini satu-satunya keterangan kenapa nomor stiker ini tidak terhitung.</p>

          {error && <p role="alert" className="rounded-lg mt-3 border border-error-soft-outline bg-error-soft p-3 text-body-small text-error">{error}</p>}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <button type="button" onClick={() => void confirmVoid()} disabled={voiding || voidReason.trim().length < 3} className="rounded-md flex min-h-12 items-center justify-center gap-2 bg-error px-5 text-body-medium font-semibold text-on-error disabled:opacity-40"><Prohibit size={18} /> {voiding ? "Membatalkan..." : "Ya, void order ini"}</button>
            <button type="button" onClick={() => { setVoidTarget(null); setVoidReason(""); setError(""); }} disabled={voiding} className="rounded-md flex min-h-12 items-center justify-center border border-outline-variant px-5 text-body-medium font-semibold disabled:opacity-40">Batal</button>
          </div>
        </div>
      </div>}
    </div>
  </main>;
}
