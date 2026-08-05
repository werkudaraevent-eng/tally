"use client";

import { ArrowLeft, CheckCircle, MagnifyingGlass, Package, Prohibit, Scan, Storefront, UserCircle, XCircle } from "@phosphor-icons/react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { HelpPanel } from "@/components/help-panel";
import { SearchResultsSkeleton, Spinner } from "@/components/search-loading";
import { useToast } from "@/components/toast";
import { formatEventDateTime, formatEventTime } from "@/lib/datetime";
import { MAX_ORDER_AMOUNT } from "@/lib/domain";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, type EventTimeZone } from "@/lib/timezone";
import { useOnline } from "@/lib/use-online";

type BoothParticipant = { id: string; name: string; company: string | null; title: string | null; qr_code: string; discount_available?: boolean; source_removed_at?: string | null };
type OfferOption = {
  id: number;
  code: string;
  name: string;
  price: number;
  scope: "per_booth" | "global";
  stock: number | null;
  max_per_participant: number;
  counts_toward_leaderboard: boolean;
  is_builtin: boolean;
  claimed: number;
  // Hasil evaluasi syarat dari server, lengkap dengan syarat mana yang gagal.
  // Dihitung di server supaya layar booth tidak menduplikasi aturannya.
  condition_result?: { passed: boolean; failed: Array<{ var: string; scope?: string | null; cmp?: string; value?: number; values?: string[]; actual?: number | string | null; reason?: string }> };
  blocked_reason: "QUOTA_REACHED" | "OUT_OF_STOCK" | "CONDITIONS_NOT_MET" | null;
};
type BoothOrder = { id: string; code: string; booth_id: number; has_discount_item: boolean; total_amount: number; status: string; pickup_mode: string; auto_settled?: boolean; created_at: string; participants: { qr_code: string; name: string; company: string | null } | null };
type ExistingOrder = { id: string; code: string; status: string; has_discount_item: boolean; pickup_mode: string; total_amount: number; handed_over_at: string | null; paid_at: string | null };
const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
// Membaca body respons tanpa pernah melempar.
//
// `await response.json()` polos adalah jebakan di layar ini. Setiap pemanggilnya
// memakai pola `setPending(true) -> fetch -> setPending(false)`, dan kalau parsing
// melempar, baris `setPending(false)` TIDAK PERNAH dijalankan: seluruh tombol aksi
// halaman ini terkunci permanen dan staf harus memuat ulang halaman untuk bisa
// bekerja lagi. Pemicunya tidak jarang di Wi-Fi venue — proxy captive portal,
// 502 dari hosting, atau halaman error HTML dari Next.js semuanya mengembalikan
// body yang bukan JSON.
//
// Objek kosong dikembalikan, bukan null, supaya pemanggil tetap dapat menulis
// `data.error?.message` tanpa penjagaan tambahan di tujuh tempat.
async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
// Pesan cadangan ketika body respons tidak terbaca. Status HTTP disebutkan karena
// tanpa isi JSON, itulah satu-satunya keterangan yang tersisa untuk dilaporkan
// staf booth ke panitia pusat.
function errorMessage(data: Record<string, unknown>, response: Response, fallback: string) {
  const error = data.error as { message?: string } | undefined;
  return error?.message ?? `${fallback} (kode ${response.status})`;
}
// Input rupiah tampil dengan pemisah ribuan (mis. "250.000") agar admin booth
// tidak salah baca nominal besar. Nilai asli tetap disimpan sebagai digit.
const groupDigits = (digits: string) => (digits ? new Intl.NumberFormat("id-ID").format(Number(digits)) : "");

// Kolom nominal menerima penjumlahan, mis. "12000+5000+3000".
//
// Alasannya satu: staf booth adalah pelaku UMKM yang menjual beberapa barang
// sekaligus. Sebelum ini mereka menjumlahkan di kalkulator HP lalu memindahkan
// hasilnya ke sini, dan setiap pemindahan angka antar aplikasi adalah kesempatan
// salah ketik yang tidak dapat dideteksi siapa pun sesudahnya — laporan hanya
// memuat hasil akhirnya.
//
// Rincian sukunya TIDAK disimpan. Yang dikirim ke server tetap satu angka pada
// `regular_amount`, persis seperti sebelumnya: tidak ada kolom, tabel, atau RPC
// yang berubah. Ini alat bantu hitung, bukan pencatatan per barang.
//
// Sanitizer: hanya digit dan '+'. Titik dan koma DIBUANG, tidak diterjemahkan
// sebagai pemisah ribuan atau desimal. Rupiah di acara ini tidak pernah memakai
// sen, dan menebak maksud "1.500" (seribu lima ratus? satu koma lima?) berarti
// menebak nominal uang orang.
const sanitizeAmountInput = (raw: string) =>
  raw
    .replace(/[^\d+]/g, "")
    // '+' berurutan diciutkan jadi satu. Ketukan ganda pada keypad HP sering
    // terjadi, dan "12000++5000" yang gagal dihitung membuat kolomnya tampak
    // rusak padahal maksud staf sudah jelas.
    .replace(/\+{2,}/g, "+")
    // '+' di awal dibuang: tidak ada suku sebelumnya untuk dijumlahkan.
    .replace(/^\+/, "");

// Suku-suku yang sudah lengkap. Suku kosong dilewati supaya "12000+" yang sedang
// diketik tetap terhitung 12000, bukan dianggap tidak sah — memblokir keadaan
// setengah ketik berarti tombol mati tepat saat staf menekan '+'.
const amountParts = (value: string) => value.split("+").filter((part) => part !== "").map(Number);

// Nilai yang dikirim ke server.
//
// WAJIB dipakai di SEMUA tempat yang dulu menulis `Number(regularAmount) || 0`.
// `Number("12000+5000")` adalah NaN dan `NaN || 0` adalah 0, jadi satu tempat yang
// terlewat tidak akan gagal build maupun melempar error — ia hanya diam-diam
// membaca nol. Pada `emptyOrder` itu berarti tombol "Buat order" mati sendiri saat
// staf memasukkan penjumlahan, dan pada body kiriman berarti order tersimpan
// dengan nominal Rp 0.
const amountTotal = (value: string) => amountParts(value).reduce((sum, part) => sum + part, 0);

// Tampilan pengingat di bawah kolom, mis. "12.000 + 5.000 + 3.000".
const formatAmountParts = (value: string) => amountParts(value).map((part) => new Intl.NumberFormat("id-ID").format(part)).join(" + ");

// Kolom menampilkan tiap suku dengan pemisah ribuan, tetapi '+' TIDAK boleh
// hilang saat sedang diketik. Suku kosong di ujung dipertahankan sebagai string
// kosong supaya "12.000+" tetap terlihat begitu, bukan menyusut jadi "12.000"
// dan membuat '+' yang baru ditekan seolah tidak masuk.
const groupAmountInput = (value: string) => value.split("+").map((part) => groupDigits(part)).join("+");
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
  // Penawaran spesial yang berlaku untuk peserta ini di booth ini, beserta alasan
  // kalau belum memenuhi syarat. Dihitung server, bukan ditebak di klien.
  // Menggantikan flag `discountAvailable` lama yang hanya bisa mewakili satu item.
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [accumulated, setAccumulated] = useState(0);
  const [existingOrders, setExistingOrders] = useState<ExistingOrder[]>([]);
  // Spec 7.1: "Progress peserta -- 3 dari 6 booth".
  const [progress, setProgress] = useState<{ visited: number; total: number } | null>(null);
  const [pickupMode, setPickupMode] = useState<"after_payment" | "immediate">("after_payment");
  // Saat false, order langsung lunas tanpa kasir. Mengubah instruksi yang
  // ditampilkan ke staf booth dan mengizinkan void sendiri.
  const [cashierRequired, setCashierRequired] = useState(true);
  // Ikut polling setelan 30 detik di bawah, jadi zona yang diubah admin saat acara
  // berjalan menyusul sendiri tanpa staf booth perlu memuat ulang halaman.
  const [timeZone, setTimeZone] = useState<EventTimeZone>(DEFAULT_TIME_ZONE);
  const [voidTarget, setVoidTarget] = useState<BoothOrder | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [booth, setBooth] = useState<{ id: number; code: string; name: string; transactions_enabled?: boolean } | null>(null);
  const [operator, setOperator] = useState<string>("");
  // Sengaja kosong, bukan angka contoh. Nilai awal 250.000 membuat booth yang
  // tidak menjual apa pun (mis. booth serah terima tas) ikut mencatat nominal itu
  // kalau operator lupa menghapusnya, dan angka salah sudah masuk laporan sebelum
  // ada yang sadar. Kosong = operator harus mengisi sendiri, dan 0 tetap sah.
  const [regularAmount, setRegularAmount] = useState("");
  const [orderCode, setOrderCode] = useState("014");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Pencarian memakai penanda tunggunya SENDIRI, bukan `pending`.
  //
  // `pending` dipakai bersama oleh buat order, void, dan serahkan barang. Kalau
  // pencarian ikut menaikkannya, seluruh tombol aksi di halaman ini nonaktif
  // selama pencarian berjalan — dan sebaliknya, kerangka pemuatan hasil pencarian
  // akan muncul saat admin booth sedang menyimpan order, padahal ia tidak sedang
  // mencari apa pun.
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BoothParticipant[]>([]);
  const [history, setHistory] = useState<BoothOrder[]>([]);
  // Riwayat order selalu terlihat (tidak dilipat) karena ini antrean kerja
  // admin booth. Yang dibatasi hanya jumlahnya: 5 terakhir, sisanya dibuka
  // lewat "Lihat semua".
  const [showAllHistory, setShowAllHistory] = useState(false);
  const online = useOnline();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Order lunas yang barangnya masih ditahan di booth = butuh aksi sekarang.
  // Order 'immediate' tidak masuk sini karena barangnya sudah diserahkan.
  const readyToHandOver = history.filter((item) => item.status === "paid" && item.pickup_mode === "after_payment");
  const visibleHistory = showAllHistory ? history : history.slice(0, 5);

  const lookupParticipant = useCallback(async (qr = "") => {
    if (!online) { setMessage("Offline — sambungkan internet sebelum scan."); return; }
    if (!booth) { setMessage("Booth belum termuat. Muat ulang halaman."); return; }
    setPending(true); setMessage("");
    const response = await fetch(`/api/participants/by-qr?qr=${encodeURIComponent(qr)}&boothId=${booth.id}`).catch(() => null);
    if (!response) { setPending(false); setMessage("Gagal menghubungi server. Cek koneksi, lalu scan ulang."); return; }
    const data = await readJson(response);
    setPending(false);
    if (!response.ok) { setMessage(errorMessage(data, response, "Peserta tidak ditemukan.")); return; }
    setParticipant(data.participant as BoothParticipant);
    setExistingOrders((data.existing_orders_at_this_booth ?? []) as ExistingOrder[]);
    setProgress((data.progress ?? null) as { visited: number; total: number } | null);
    setOffers(((data.special_offers as { offers?: OfferOption[] } | undefined)?.offers ?? []) as OfferOption[]);
    setAccumulated((data.special_offers as { accumulated_amount?: number } | undefined)?.accumulated_amount ?? 0);
    setSelectedOffers([]);
    setDiscount(false);
    // Peserta yang sudah dihapus panitia pusat: peringatan muncul SEKARANG, bukan
    // setelah staf mengisi nominal dan ditolak server. Panelnya tetap ditampilkan
    // dengan nama peserta supaya staf bisa menyebutkan nama itu ke meja registrasi.
    if ((data.participant_removed ?? false) === true) {
      setMessage("Peserta ini sudah dihapus panitia pusat, jadi order tidak dapat dibuat. Arahkan peserta ke meja registrasi.");
    }
    // Nominal WAJIB kembali kosong setiap kali peserta berganti. Tanpa ini,
    // peserta berikutnya mewarisi angka peserta sebelumnya dan tombol tetap aktif
    // karena kolomnya tidak kosong — kelolosan yang lebih berbahaya daripada lupa
    // mengisi, sebab angkanya tampak masuk akal. Sejalan dengan `selectedOffers`
    // dan `discount` di atas yang juga direset di sini.
    setRegularAmount("");
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
    // Hasil lama dikosongkan lebih dulu. Kalau dibiarkan, daftar peserta dari kata
    // kunci SEBELUMNYA tetap terpampang selama pencarian baru berjalan, dan admin
    // booth bisa menekan nama yang sudah tidak relevan dengan yang ia ketik.
    setResults([]);
    setSearching(true); setMessage("");
    const response = await fetch(`/api/booth/participants?q=${encodeURIComponent(searchTerm)}&boothId=${booth.id}`).catch(() => null);
    if (!response) { setSearching(false); setMessage("Gagal menghubungi server. Cek koneksi, lalu cari ulang."); return; }
    const data = await readJson(response);
    setSearching(false);
    if (!response.ok) { setMessage(errorMessage(data, response, "Pencarian gagal.")); return; }
    setResults((data.participants ?? []) as BoothParticipant[]);
  }

  // Log scan pasif dihapus: admin booth tidak bisa melakukan aksi apa pun
  // terhadapnya. Yang ditampilkan hanya order yang benar-benar diproses.
  //
  // Ketiga pemuat berkala di bawah GAGAL DALAM DIAM dengan sengaja. Semuanya
  // berjalan dari timer, jadi menampilkan pesan kesalahan dari sini akan menimpa
  // pesan yang sedang dibaca staf tentang order yang baru saja ia proses. Data
  // lama tetap terpampang sampai pemanggilan berikutnya berhasil.
  async function loadHistory() {
    const ordersResponse = await fetch("/api/booth/orders?limit=50", { cache: "no-store" }).catch(() => null);
    if (!ordersResponse?.ok) return;
    const data = await readJson(ordersResponse);
    setHistory((data.orders ?? []) as BoothOrder[]);
  }

  async function loadSettings() {
    const response = await fetch("/api/settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = await readJson(response);
    setPickupMode(data.pickup_mode === "immediate" ? "immediate" : "after_payment");
    setCashierRequired(data.cashier_confirmation_required !== false);
    setTimeZone(normalizeTimeZone(data.time_zone as string | null | undefined));
  }

  async function loadContext() {
    const response = await fetch("/api/booth/context", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = await readJson(response);
    setBooth((data.booth ?? null) as { id: number; code: string; name: string; transactions_enabled?: boolean } | null);
    setOperator((data.operator as { username?: string } | undefined)?.username ?? "");
    if (data.next_sticker) setOrderCode(String(data.next_sticker));
  }

  useEffect(() => { const initial = window.setTimeout(() => { void loadContext(); void loadHistory(); void loadSettings(); }, 0); const historyTimer = window.setInterval(() => { void loadHistory(); }, 15000); const settingsTimer = window.setInterval(() => { void loadSettings(); }, 30000); return () => { window.clearTimeout(initial); window.clearInterval(historyTimer); window.clearInterval(settingsTimer); }; }, []);

  async function createOrder() {
    if (!participant || !online) { setMessage("Offline — order tidak boleh dibuat."); return; }
    if (!booth) { setMessage("Booth belum termuat. Muat ulang halaman."); return; }
    setPending(true); setMessage("");
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_code: `${booth.code}-${orderCode.padStart(3, "0")}`, participant_id: participant.id, booth_id: booth.id, has_discount_item: discount, regular_amount: booth.transactions_enabled === false ? 0 : amountTotal(regularAmount), offer_codes: selectedOffers }) }).catch(() => null);
    // Jaringan putus di tengah kiriman adalah satu-satunya kegagalan yang TIDAK
    // boleh menyarankan "coba lagi" tanpa syarat: server mungkin sudah menyimpan
    // ordernya sementara responsnya tidak pernah sampai. Riwayat dimuat ulang agar
    // staf dapat memastikan sendiri sebelum mengulang.
    if (!response) {
      setPending(false);
      const failure = "Kiriman terputus. Periksa daftar Order booth ini di sebelah — bila order sudah muncul di sana, JANGAN dibuat ulang.";
      setMessage(failure);
      toast.error("Order gagal dibuat", failure);
      void loadHistory();
      return;
    }
    const data = await readJson(response);
    setPending(false);
    if (!response.ok) {
      const code = (data.error as { code?: string } | undefined)?.code;
      const failure = code === "DISCOUNT_ALREADY_TAKEN" ? "Item diskon peserta sudah pernah diambil di booth ini." : errorMessage(data, response, "Order gagal dibuat.");
      setMessage(failure);
      toast.error("Order gagal dibuat", failure);
      // Nomor dinaikkan sendiri saat bentrok, bukan diserahkan ke staf.
      //
      // BR-19c: nomor dihitung `max + 1` saat layar dimuat, jadi dua perangkat di
      // satu booth memperoleh angka sama dan yang menekan belakangan ditolak. Booth
      // B1 dan PH masing-masing memang punya dua akun operator, jadi ini terjadi.
      //
      // Panduan sudah memuat langkah "naikkan satu angka", tapi menyuruh staf
      // mengedit kolom sendiri di depan peserta yang menunggu adalah langkah yang
      // dapat dihapus tanpa mengubah BR-09: nomornya tetap diketik manusia, hanya
      // saja usulan berikutnya disiapkan. Hanya untuk ORDER_CODE_USED — kegagalan
      // lain tidak ada hubungannya dengan nomor dan menaikkannya akan membuat
      // deretan nomor berlubang tanpa alasan.
      if (code === "ORDER_CODE_USED") {
        setOrderCode((current) => String(Number.parseInt(current, 10) + 1).padStart(3, "0"));
      }
      return;
    }
    // Tanpa kasir, order sudah final: jangan suruh peserta ke kasir.
    const instruction = !cashierRequired
      ? (pickupMode === "immediate" ? "Order tercatat lunas. Serahkan barang sekarang." : "Order tercatat lunas. Tempel stiker dan simpan di rak.")
      : (pickupMode === "immediate" ? "Serahkan barang sekarang, arahkan peserta ke kasir." : "Tempel stiker, simpan di rak, arahkan peserta ke kasir.");
    // Kode diambil dari respons bila ada, kalau tidak disusun kembali dari kolom
    // yang baru dikirim. Status 201 berarti order SUDAH tersimpan, jadi layar tidak
    // boleh menampilkan "undefined" hanya karena body-nya gagal terbaca — nomor itu
    // yang disebutkan staf ke peserta.
    const savedCode = (data.order as { code?: string } | undefined)?.code ?? `${booth.code}-${orderCode.padStart(3, "0")}`;
    toast.success(`Order ${savedCode} dibuat`, instruction);
    setSuccess(savedCode);
    setParticipant(null);
    setRegularAmount("");
    setOrderCode(String(Number.parseInt(orderCode, 10) + 1).padStart(3, "0"));
    void loadHistory();
  }

  async function handOverOrder(orderId: string) {
    if (!online) { setMessage("Offline — penyerahan barang tidak boleh diproses."); return; }
    setPending(true); setMessage("");
    const response = await fetch(`/api/orders/${orderId}/hand-over`, { method: "POST" }).catch(() => null);
    if (!response) {
      setPending(false);
      setMessage("Kiriman terputus. Data diperbarui — periksa status order sebelum mengulang.");
      toast.error("Penyerahan barang gagal", "Kiriman terputus. Periksa status order.");
      void loadHistory();
      return;
    }
    const data = await readJson(response);
    setPending(false);
    if (!response.ok) {
      // Kegagalan biasanya berarti layar memegang status usang (mis. order
      // sudah di-void atau belum benar-benar lunas). Selalu muat ulang data
      // agar kartu menampilkan kondisi sebenarnya, bukan hanya pesan error.
      const failure = errorMessage(data, response, "Penyerahan barang gagal.");
      setMessage(failure);
      toast.error("Penyerahan barang gagal", `${failure} Data diperbarui.`);
      if (participant) void lookupParticipant(participant.qr_code);
      void loadHistory();
      return;
    }
    toast.success("Barang diserahkan", `Order ${(data.order as { code?: string } | undefined)?.code ?? ""} selesai.`.trim());
    if (participant) void lookupParticipant(participant.qr_code);
    void loadHistory();
  }

  // Hanya tersedia untuk order auto-settled milik booth ini; RPC menolak sisanya.
  // Ini satu-satunya jalan koreksi salah input saat kasir tidak dipakai.
  async function confirmVoid() {
    if (!voidTarget) return;
    if (!online) { setMessage("Offline — void tidak boleh diproses."); return; }
    setPending(true); setMessage("");
    const response = await fetch(`/api/orders/${voidTarget.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: voidReason.trim() }) }).catch(() => null);
    if (!response) {
      setPending(false);
      setMessage("Kiriman terputus. Data diperbarui — periksa apakah order sudah berstatus Void sebelum mengulang.");
      toast.error("Void gagal", "Kiriman terputus. Periksa status order.");
      void loadHistory();
      return;
    }
    const data = await readJson(response);
    setPending(false);
    if (!response.ok) {
      const failure = errorMessage(data, response, "Void gagal.");
      setMessage(failure);
      toast.error("Void gagal", failure);
      void loadHistory();
      return;
    }
    toast.warning(`Order ${voidTarget.code} dibatalkan`, "Kuota item diskon peserta kembali tersedia.");
    setVoidTarget(null); setVoidReason("");
    if (participant) void lookupParticipant(participant.qr_code);
    void loadHistory();
  }

  function backToParticipantSearch() {
    setParticipant(null);
    setDiscount(false);
    setExistingOrders([]);
    setProgress(null);
    setOffers([]);
    setSelectedOffers([]);
    setAccumulated(0);
    setRegularAmount("");
    setMessage("");
    setResults([]);
    setSearch(true);
  }

  // Total dihitung di klien hanya untuk pratinjau; RPC tetap menghitung ulang dari
  // harga penawaran di database supaya angka tidak bisa dimanipulasi dari browser.
  const selectedOfferTotal = offers
    .filter((offer) => selectedOffers.includes(offer.code))
    .reduce((sum, offer) => sum + offer.price, 0);
  // Sifat booth ditetapkan admin; layar hanya mengikuti. Perbandingan `!== false`
  // dipakai dengan sengaja, bukan truthiness: selama konteks booth belum termuat,
  // booth dianggap berjualan supaya kolom nominal tidak sempat tampil lalu hilang.
  // Penolakan nominal yang sebenarnya ada di `create_order_transaction`.
  const transactionsEnabled = booth?.transactions_enabled !== false;
  // `amountTotal`, bukan `Number(regularAmount)`: kolomnya dapat memuat
  // penjumlahan ("12000+5000"), dan `Number()` atas string itu adalah NaN yang
  // lalu diciutkan menjadi 0 oleh `|| 0` tanpa error apa pun.
  const regularTotal = transactionsEnabled ? amountTotal(regularAmount) : 0;
  const previewTotal = regularTotal + selectedOfferTotal;
  // Penjumlahan di kolom dapat melampaui batas kolom int Postgres walau setiap
  // sukunya wajar. Ditahan di layar karena penolakannya di server muncul sebagai
  // SQLSTATE 22003 — kegagalan yang tidak menyebutkan kolom mana yang salah.
  const amountTooLarge = transactionsEnabled && regularTotal > MAX_ORDER_AMOUNT;
  // Kosong dan nol WAJIB dibedakan. Keduanya sama-sama menghasilkan Rp 0, jadi
  // "lupa mengisi" dan "peserta memang tidak beli" tidak dapat dipisahkan setelah
  // order tersimpan, baik di layar maupun di laporan. Order hanya boleh dibuat
  // setelah operator menyatakan nominalnya, termasuk menyatakan nol secara sadar.
  const amountMissing = transactionsEnabled && regularAmount === "";
  // Order WAJIB memuat sesuatu: nominal item reguler atau minimal satu item spesial.
  //
  // `amountMissing` saja tidak cukup. Booth tanpa transaksi tidak menampilkan kolom
  // nominal, jadi pemeriksaan itu selalu lolos di sana dan order hampa (total Rp 0,
  // nol item) tetap dapat dibuat. Order seperti itu memakai nomor order, muncul di
  // riwayat, dan ikut terhitung sebagai kunjungan booth pada progress peserta.
  //
  // Penegakan sebenarnya ada di `create_order_transaction` (EMPTY_ORDER); ini hanya
  // mencegah operator menekan tombol yang sudah pasti ditolak.
  const emptyOrder = regularTotal === 0 && selectedOffers.length === 0;
  // Peserta yang sudah dihapus panitia pusat. Perbandingan terhadap null dan
  // undefined sekaligus: peserta yang dipilih dari HASIL PENCARIAN tidak melewati
  // kolom ini sama sekali, dan `undefined` di sana berarti "belum diperiksa", bukan
  // "sudah dihapus" — pencarian sendiri sudah memfilter baris bertanda, jadi
  // menganggapnya terhapus akan mematikan tombol untuk peserta yang sah.
  const participantRemoved = Boolean(participant?.source_removed_at);

  function toggleOffer(offer: OfferOption) {
    if (offer.blocked_reason) return;
    setSelectedOffers((current) => (current.includes(offer.code) ? current.filter((code) => code !== offer.code) : [...current, offer.code]));
    // Penawaran bawaan booth tetap memakai state `discount` agar teks & badge lama
    // di layar ini tidak berubah perilakunya.
    if (offer.is_builtin) setDiscount((current) => !current);
  }

  // Alasan ditulis per syarat yang gagal, bukan satu pesan generik: staf booth
  // harus bisa menyebutkan angka yang kurang ke peserta di tempat.
  function offerBlockedLabel(offer: OfferOption): string {
    switch (offer.blocked_reason) {
      case "QUOTA_REACHED": return offer.scope === "global" ? "Sudah pernah diambil peserta ini" : "Sudah diambil di booth ini";
      case "OUT_OF_STOCK": return "Stok habis";
      case "CONDITIONS_NOT_MET": {
        const failed = offer.condition_result?.failed ?? [];
        if (failed.length === 0) return "Syarat penawaran belum terpenuhi";
        // Subjek WAJIB eksplisit ("belanja peserta ..."). Versi lama memakai
        // "— baru Rp 0" tanpa subjek, dan itu terbaca sebagai harga itemnya yang
        // Rp 0, padahal angka itu total belanja peserta.
        return failed.map((item) => {
          if (item.var === "total_spend") {
            const scope = item.scope === "this_booth" ? "di booth ini" : item.scope === "booth" ? "di booth tertentu" : "di semua booth";
            return `Syarat: belanja peserta ${scope} minimal ${formatRupiah(item.value ?? 0)}. Belanja peserta saat ini ${formatRupiah(Number(item.actual ?? 0))}.`;
          }
          if (item.var === "booth_count") return `Syarat: peserta sudah belanja di minimal ${item.value} booth. Peserta ini baru ${item.actual} booth.`;
          if (item.var === "participant_type") return `Syarat: khusus tipe ${(item.values ?? []).join("/")}. Peserta ini tipe ${item.actual ?? "-"}.`;
          return "Syarat penawaran belum terpenuhi";
        }).join(" · ");
      }
      default: return "";
    }
  }

  return <main className="min-h-dvh bg-[var(--background)] text-[var(--ink)]"><header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:px-8 sm:py-4"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2"><div className="flex min-w-0 items-center gap-3"><div className="flex size-12 shrink-0 flex-col items-center justify-center bg-[var(--brand)] leading-none text-white" aria-hidden="true"><Storefront size={16} weight="duotone" /><span className="mt-0.5 text-sm font-bold tracking-tight">{booth?.code ?? "--"}</span></div><div className="min-w-0"><p className="truncate text-base font-semibold leading-tight">{booth?.name ?? "Memuat booth..."}</p><p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]"><span className="font-semibold uppercase tracking-[0.12em]">Admin Booth</span>{operator ? ` · ${operator}` : ""}</p></div></div><div className="flex shrink-0 items-center gap-2"><span className="flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-xs font-semibold"><Package size={18} className="shrink-0 text-[var(--brand)]" /> <span className="hidden sm:inline">{pickupMode === "immediate" ? "Serahkan langsung" : "Barang disimpan di rak booth"}</span><span className="sm:hidden">{pickupMode === "immediate" ? "Langsung" : "Disimpan"}</span></span><HelpPanel role="booth" /><LogoutButton /></div></div></header><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">{message && <div role="alert" className="mb-5 flex items-center gap-3 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{message}</div>}{success ? <section className="flex min-h-[65dvh] items-center justify-center bg-[var(--success)] p-8 text-center text-white"><div><CheckCircle size={80} weight="fill" className="mx-auto" /><p className="mt-6 text-xs uppercase tracking-[0.2em] text-white/70">Order berhasil dibuat</p><h1 className="mt-3 text-7xl font-semibold tracking-[-0.08em]">{success}</h1><p className="mt-5 max-w-md text-lg text-white/80">{!cashierRequired ? (pickupMode === "immediate" ? "Order tercatat lunas. Serahkan barang sekarang. Peserta tidak perlu ke kasir." : "Order tercatat lunas. Tempel stiker pada barang, simpan di rak. Peserta tidak perlu ke kasir.") : (pickupMode === "immediate" ? "Serahkan barang sekarang. Arahkan peserta ke kasir untuk membayar." : "Tempel stiker pada barang, simpan di rak. Arahkan peserta ke kasir.")}</p><button onClick={() => { setSuccess(""); setParticipant(null); setSearch(true); }} className="mt-10 min-h-14 border border-white/30 px-6 font-semibold hover:bg-white/10">Kembali ke pencarian peserta</button></div></section> : <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">{/* `min-w-0` WAJIB pada kedua kolom grid.
              Grid item punya `min-width: auto`, jadi tidak boleh menyusut di bawah lebar
              min-content-nya. Baris hasil pencarian memakai `truncate`, dan `truncate`
              berarti `white-space: nowrap`, sehingga min-content-nya = lebar teks penuh
              tanpa pemotongan. Akibatnya kolom melebar mengikuti nama instansi terpanjang
              dan SELURUH halaman ikut melebar, bukan hanya panelnya.
              `min-w-0` di dalam baris tidak cukup: pembatasan harus ada di setiap tingkat
              rantai, dan tingkat grid inilah yang terlewat. */}
              <section className="min-w-0">{participant ? <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">{/* Sebelumnya hanya teks biru tanpa border/background/ikon, jadi tidak terbaca
                  sebagai tombol. Staf booth adalah pelaku UMKM, bukan pengguna teknis:
                  aksi navigasi harus terlihat jelas dapat ditekan. */}
              <div className="border-b border-[var(--line)] bg-[var(--surface-muted)] p-4"><button type="button" onClick={backToParticipantSearch} className="flex min-h-14 w-full items-center justify-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--brand)] transition-colors hover:border-[var(--brand)] hover:bg-[#E8ECFB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"><ArrowLeft size={19} weight="bold" /> Ganti peserta lain</button></div><div className="flex items-center gap-4 border-b border-[var(--line)] p-5"><UserCircle size={52} weight="duotone" className="shrink-0 text-[var(--brand)]" /><div className="min-w-0"><h2 className="text-xl font-semibold">{participant.name}</h2><p className="mt-1 text-sm text-[var(--ink-muted)]">{participant.company}  -  {participant.title}</p></div></div>{/* Peserta yang sudah dihapus panitia pusat. Ditempatkan tepat di bawah nama,
                  di atas segala kolom isian, karena inilah satu-satunya keadaan di mana
                  staf harus BERHENTI mengisi order dan bukan sekadar menyesuaikan angka.
                  Namanya tetap tampil supaya staf dapat menyebutkannya ke meja registrasi. */}
              {participantRemoved && <div role="alert" className="m-5 border border-[#E9C7C4] bg-[#FFF2F0] p-5 text-[var(--danger)]"><p className="flex items-center gap-2 font-semibold"><Prohibit size={22} weight="fill" /> PESERTA SUDAH DIHAPUS PANITIA</p><p className="mt-2 text-sm">Order tidak dapat dibuat untuk peserta ini. Arahkan peserta ke meja registrasi lebih dulu.</p></div>}{progress && <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Progress peserta</span><span className="flex items-center gap-3"><span className="flex items-center gap-1.5" aria-hidden="true">{Array.from({ length: progress.total }).map((_, dot) => <span key={dot} className="size-3 rounded-full" style={{ backgroundColor: dot < progress.visited ? "var(--brand)" : "var(--line)" }} />)}</span><span className="text-sm font-semibold tabular-nums">{progress.visited} dari {progress.total} booth</span></span></div>}{existingOrders.filter((order) => order.pickup_mode === "after_payment" && order.status !== "void" && order.status !== "handed_over").map((order) => <div key={order.id} className={`m-5 border p-5 ${order.status === "paid" ? "border-[#B9DCC5] bg-[#EEF8F0] text-[var(--brand-strong)]" : "border-[#E9C7C4] bg-[#FFF2F0] text-[var(--danger)]"}`}><p className="flex items-center gap-2 font-semibold"><Package size={22} weight="fill" /> BARANG SIAP DIAMBIL</p><p className="mt-2 text-sm">{order.code} · {order.has_discount_item ? "Item diskon" : "Reguler"} · {formatRupiah(order.total_amount)}</p>{order.status === "paid" ? <><p className="mt-1 flex items-center gap-1 text-sm font-semibold"><CheckCircle size={16} weight="fill" /> LUNAS{order.paid_at ? ` ${formatEventTime(order.paid_at, timeZone)}` : ""}</p><button onClick={() => handOverOrder(order.id)} disabled={pending || !online} className="mt-4 min-h-12 w-full bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50">Serahkan barang</button></> : <p className="mt-2 text-sm font-semibold">{cashierRequired ? "BELUM LUNAS — arahkan peserta ke kasir" : "BELUM LUNAS — order lama sebelum kasir dimatikan. Hubungi admin."}</p>}</div>)}<div className="m-5 space-y-3">{offers.length === 0 ? <div className="border border-[var(--line)] bg-[var(--surface-muted)] p-5 text-sm text-[var(--ink-muted)]">Tidak ada item spesial di booth ini.</div> : <><div className="flex items-baseline justify-between"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Item spesial</p><p className="text-xs text-[var(--ink-muted)]">Total belanja peserta ini di semua booth <span className="font-semibold tabular-nums text-[var(--ink)]">{formatRupiah(accumulated)}</span></p></div>{offers.map((offer) => { const chosen = selectedOffers.includes(offer.code); const blocked = Boolean(offer.blocked_reason); return <div key={offer.code} className={`border p-5 ${blocked ? "border-[#E9C7C4] bg-[#FFF2F0] text-[var(--danger)]" : chosen ? "border-[#B9DCC5] bg-[#EEF8F0] text-[var(--brand-strong)]" : "border-[var(--line)] bg-[var(--surface-muted)] text-[var(--ink)]"}`}><p className="flex items-start gap-2 font-semibold">{blocked ? <XCircle size={22} weight="fill" className="shrink-0" /> : chosen ? <CheckCircle size={22} weight="fill" className="shrink-0" /> : <span className="mt-0.5 size-[22px] shrink-0 border-2 border-current" />}<span className="min-w-0">{offer.name.toUpperCase()}{offer.scope === "global" && <span className="ml-2 rounded-sm bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Semua booth</span>}</span></p><p className="mt-2 text-sm tabular-nums">{formatRupiah(offer.price)}</p>{/* Alasan spesifik, bukan sekadar "tidak tersedia": staf booth harus bisa
                    menjelaskan ke peserta kenapa item tidak bisa diambil. */}<p className="mt-2 text-xs">{blocked ? offerBlockedLabel(offer) : "Ketuk untuk memasukkan item ini ke order."}</p><label className={`mt-4 flex min-h-12 items-center gap-3 border border-current px-4 text-sm font-semibold ${blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}><input type="checkbox" checked={chosen} disabled={blocked} onChange={() => toggleOffer(offer)} className="size-5 accent-[var(--brand)]" />{blocked ? "Tidak tersedia" : chosen ? "Dipilih" : `Ambil ${offer.name}`}</label></div>; })}</>}</div><div className={`grid gap-4 p-5 pt-0 ${transactionsEnabled ? "sm:grid-cols-2" : ""}`}>{transactionsEnabled ? <label className="text-sm font-semibold">Item reguler (Rp)<input value={groupAmountInput(regularAmount)} placeholder="Wajib diisi" aria-describedby="regular-amount-help" aria-invalid={amountMissing || amountTooLarge} onChange={(event) => setRegularAmount(sanitizeAmountInput(event.target.value))} className={`mt-2 h-14 w-full rounded-xl border bg-[var(--background)] px-4 text-xl font-semibold outline-none focus:border-[var(--brand)] ${amountMissing || amountTooLarge ? "border-[var(--warning)]" : "border-[var(--line)]"}`} inputMode="numeric" />{/* Hasil penjumlahan ditampilkan SEKARANG, bukan hanya di baris TOTAL.
                  Baris TOTAL ada di bawah dan sudah memuat harga item spesial, jadi angkanya
                  berbeda dari isi kolom ini dan tidak dapat dipakai untuk memeriksa
                  penjumlahan yang baru diketik. Rincian sukunya ikut ditulis ulang dengan
                  pemisah ribuan supaya suku yang salah ketik terlihat sebelum disimpan. */}
                {amountParts(regularAmount).length > 1 ? <span className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-normal leading-5 text-[var(--ink-muted)]"><span className="tabular-nums">{formatAmountParts(regularAmount)}</span><span className="font-semibold text-[var(--ink)]">= {formatRupiah(regularTotal)}</span><span>({amountParts(regularAmount).length} item)</span></span> : null}{/* Hanya keterangan, tanpa tombol aksi. Menambah tombol di sini berarti
                  menambah langkah yang tidak ada di panduan cetak untuk staf booth, dan
                  panduan yang tidak cocok dengan layar lebih merugikan daripada satu
                  ketukan yang dihemat. Nol dinyatakan dengan mengetik 0.

                  Sebab itu pula penjumlahan diterima di kolomnya sendiri, bukan lewat
                  tombol "tambah item": keypad numerik HP sudah memuat '+', jadi tidak ada
                  ketukan tambahan dan tidak ada langkah baru yang harus dicetak ulang. */}
                {amountTooLarge
                  ? <span id="regular-amount-help" className="mt-2 block text-xs font-normal leading-5 text-[var(--warning)]">Jumlahnya terlalu besar. Batas satu order {formatRupiah(MAX_ORDER_AMOUNT)}. Periksa apakah ada suku yang kelebihan angka nol.</span>
                  : amountMissing
                    ? <span id="regular-amount-help" className="mt-2 block text-xs font-normal leading-5 text-[var(--warning)]">Wajib diisi. Kalau peserta tidak beli item reguler, tulis 0.</span>
                    : <span id="regular-amount-help" className="mt-2 block text-xs font-normal leading-5 text-[var(--ink-muted)]">Nominal item reguler yang dibeli peserta di booth ini. Beberapa barang boleh dijumlahkan langsung di sini, contoh 12000+5000+3000.</span>}</label> : null}<label className="text-sm font-semibold">{pickupMode === "immediate" ? "Nomor order" : "Nomor stiker"} {booth?.code ?? "booth"} <span className="font-normal text-[var(--ink-muted)]">(otomatis lanjut)</span><input value={orderCode} onChange={(event) => setOrderCode(event.target.value.replace(/\D/g, "").slice(0, 3))} className="mt-2 h-14 w-full border border-[var(--line)] bg-[var(--background)] px-4 text-xl outline-none focus:border-[var(--brand)]" inputMode="numeric" /></label></div><div className="border-t border-[var(--line)] p-5">{selectedOfferTotal > 0 && <div className="mb-3 space-y-1 text-xs text-[var(--ink-muted)]">{transactionsEnabled ? <div className="flex items-center justify-between"><span>Item reguler{amountParts(regularAmount).length > 1 ? ` (${formatAmountParts(regularAmount)})` : ""}</span><span className="tabular-nums">{formatRupiah(regularTotal)}</span></div> : null}{offers.filter((offer) => selectedOffers.includes(offer.code)).map((offer) => <div key={offer.code} className="flex items-center justify-between"><span className="truncate pr-2">{offer.name}</span><span className="shrink-0 tabular-nums">{formatRupiah(offer.price)}</span></div>)}</div>}<div className="flex items-center justify-between"><span className="text-sm font-semibold">TOTAL</span><span className="text-3xl font-semibold tabular-nums">{formatRupiah(previewTotal)}</span></div></div><button disabled={pending || !orderCode || !participant || amountMissing || amountTooLarge || emptyOrder || participantRemoved} onClick={createOrder} className="m-5 mt-0 flex min-h-16 w-[calc(100%-2.5rem)] items-center justify-center gap-2 bg-[var(--brand)] text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Menyimpan..." : participantRemoved ? "Peserta sudah dihapus panitia" : amountMissing ? "Isi nominal dulu" : amountTooLarge ? "Nominal terlalu besar" : emptyOrder ? (transactionsEnabled ? "Isi nominal atau pilih item" : "Pilih item dulu") : transactionsEnabled ? "Buat order" : "Catat serah terima"}</button></div> : <><button onClick={() => setScanning(true)} className="flex min-h-32 w-full items-center justify-between rounded-2xl bg-[var(--brand)] px-6 text-left text-white shadow-sm transition-colors hover:bg-[var(--brand-strong)] sm:min-h-36 sm:px-8"><span className="block text-3xl font-semibold sm:text-4xl">SCAN QR</span><Scan size={52} weight="duotone" /></button><button onClick={() => setSearch(!search)} className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-sm font-semibold"><MagnifyingGlass size={20} /> Cari peserta manual</button>{search && <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"><label htmlFor="manual-search" className="text-sm font-semibold">Nama atau instansi peserta</label><div className="mt-2 flex gap-2"><input id="manual-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchParticipants(); }} placeholder="Contoh: Ratna atau nama perusahaan" className="h-12 min-w-0 flex-1 border border-[var(--line)] bg-[var(--background)] px-3 outline-none focus:border-[var(--brand)]" /><button onClick={() => void searchParticipants()} disabled={searching || pending || !online || !searchTerm.trim()} className="flex min-h-12 shrink-0 items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-semibold text-white disabled:opacity-50">{searching ? <><Spinner size={17} /> Mencari</> : "Cari"}</button></div>{/* Kerangka hasil, bukan sekadar teks "Mencari...".
                  Tingginya sama dengan daftar hasil sungguhan, jadi kartu tidak
                  melompat saat data tiba dan tombol di bawahnya tidak bergeser
                  tepat ketika admin booth hendak menekannya. */}
              {searching && <SearchResultsSkeleton className="mt-3" />}
              {/* Status diumumkan sekali lewat teks live, karena kerangka di atas
                  sengaja disembunyikan dari pembaca layar. */}
              <p aria-live="polite" className="sr-only">{searching ? "Mencari peserta" : results.length > 0 ? `${results.length} peserta ditemukan` : ""}</p>
              {!searching && results.length > 0 && <div className="mt-3 divide-y divide-[var(--line)] border border-[var(--line)]">{/* Lewat lookupParticipant, bukan setParticipant langsung: hasil pencarian tidak
                membawa daftar penawaran spesial, jadi memilih dari sini tanpa lookup akan
                menampilkan panel item spesial kosong. */}
              {/* Baris hasil pencarian sebelumnya hanya berubah warna saat hover, jadi
                  di perangkat sentuh tidak ada petunjuk sama sekali bahwa ini dapat
                  ditekan. Ikon + label "Pilih" membuatnya eksplisit. */}
              {results.map((item) => <button key={item.id} type="button" onClick={() => { void lookupParticipant(item.qr_code); setResults([]); setSearch(false); }} className="flex min-h-16 w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[#E8ECFB]"><UserCircle size={34} weight="duotone" className="shrink-0 text-[var(--brand)]" /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.name}</span><span className="block truncate text-xs text-[var(--ink-muted)]">{item.company ?? "Instansi tidak diisi"}{item.title ? ` · ${item.title}` : ""}</span></span><span className="shrink-0 text-xs font-semibold text-[var(--brand)]">Pilih</span></button>)}</div>}{searchTerm && !searching && results.length === 0 && <p className="mt-3 text-sm text-[var(--ink-muted)]">Peserta tidak ditemukan.</p>}</div>}</>}</section><section className="min-w-0 space-y-4">{readyToHandOver.length > 0 && <div className="rounded-2xl border border-[#B9DCC5] bg-[#EEF8F0] p-4 shadow-sm"><p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--brand-strong)]"><Package size={19} weight="fill" />Siap diserahkan ({readyToHandOver.length})</p><div className="mt-3 space-y-2">{readyToHandOver.map((item) => <div key={item.id} className="rounded-xl bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.participants?.name ?? "Peserta"}</p><p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">{item.code} · {formatRupiah(item.total_amount)}</p></div><span className="shrink-0 rounded-full bg-[#EEF8F0] px-2 py-1 text-[11px] font-semibold text-[var(--brand-strong)]">Lunas</span></div><button onClick={() => handOverOrder(item.id)} disabled={pending || !online} className="mt-3 min-h-12 w-full rounded-xl bg-[var(--brand)] text-sm font-semibold text-white disabled:opacity-50">Serahkan barang</button></div>)}</div></div>}<div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Order booth ini</p><p className="mt-0.5 text-xs text-[var(--ink-muted)]">Ketuk nama untuk buat order lagi.</p></div>{history.length > 5 && <button type="button" onClick={() => setShowAllHistory((open) => !open)} className="shrink-0 text-xs font-semibold text-[var(--brand)]">{showAllHistory ? "Tampilkan 5 terakhir" : `Lihat semua (${history.length})`}</button>}</div><div className="mt-3 divide-y divide-[var(--line)]">{history.length === 0 ? <p className="py-4 text-sm text-[var(--ink-muted)]">Belum ada order.</p> : visibleHistory.map((item) => { const badge = orderStatusBadge(item.status); const canVoid = Boolean(item.auto_settled) && item.status !== "void"; return <div key={item.id} className="flex items-start gap-3 py-3"><button type="button" onClick={() => { if (item.participants?.qr_code) void lookupParticipant(item.participants.qr_code); }} disabled={!online || !item.participants?.qr_code} title={item.participants?.name ? `Buat order baru untuk ${item.participants.name}` : undefined} className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:hover:bg-transparent"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.participants?.name ?? "Peserta"}</p><p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">{item.code} · {formatEventDateTime(item.created_at, timeZone)}</p><span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span></div></button><div className="flex shrink-0 flex-col items-end gap-2"><span className="text-sm font-semibold tabular-nums">{formatRupiah(item.total_amount)}</span>{/* Tombol berbatas dengan target 48px (DESIGN.md): teks kecil tanpa border
                  sebelumnya tidak terbaca sebagai elemen yang bisa ditekan, dan terlalu
                  kecil untuk mobile portrait. Aksi destruktif tetap menempel pada order
                  yang dipengaruhinya, bukan dipindah ke slot tombol utama. */}{canVoid && <button type="button" onClick={() => { setVoidTarget(item); setVoidReason(""); setMessage(""); }} disabled={!online} className="flex min-h-12 items-center gap-1.5 border border-[#E9C7C4] bg-[#FFF7F6] px-3 text-xs font-semibold text-[var(--danger)] transition-colors hover:border-[var(--danger)] hover:bg-[#FFF2F0] disabled:opacity-40" aria-label={`Void order ${item.code}`}><Prohibit size={15} weight="bold" />Void</button>}</div></div>; })}</div></div></section></div>}{voidTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"><div className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] p-6"><div className="flex items-center gap-2"><XCircle size={22} className="text-[var(--danger)]" /><h2 className="text-lg font-semibold">Void order {voidTarget.code}</h2></div><p className="mt-3 text-sm text-[var(--ink-muted)]">Order dibatalkan dan nilainya keluar dari hitungan top spender. Kuota item diskon peserta kembali tersedia. Alasan wajib diisi dan tercatat di audit log.</p><label className="mt-5 block text-sm font-semibold">Alasan void<textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={3} className="mt-2 w-full border border-[var(--line)] bg-[var(--background)] p-3 text-sm outline-none focus:border-[var(--brand)]" placeholder="Contoh: salah input nominal, peserta batal" /></label><div className="mt-6 flex gap-3"><button onClick={() => { setVoidTarget(null); setVoidReason(""); }} className="min-h-12 flex-1 border border-[var(--line)] text-sm font-semibold">Batal</button><button onClick={confirmVoid} disabled={pending || !online || !voidReason.trim()} className="min-h-12 flex-1 bg-[var(--danger)] text-sm font-semibold text-white disabled:opacity-50">{pending ? "Memproses..." : "Void order"}</button></div></div></div>}{scanning && <div className="fixed inset-0 z-30 flex flex-col bg-[var(--ink)] text-white"><header className="flex items-center justify-between p-5"><div><p className="text-xs uppercase tracking-[0.2em] text-white/55">{booth?.name ?? "Booth"}</p><p className="mt-1 font-semibold">Scanner QR</p></div><button onClick={() => setScanning(false)} className="min-h-12 border border-white/20 px-4 text-sm font-semibold">Tutup</button></header><div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="relative aspect-square w-full max-w-sm overflow-hidden border border-white/50"><video ref={videoRef} className="size-full object-cover" autoPlay muted playsInline aria-label="Pratinjau kamera scanner QR" /><div className="pointer-events-none absolute inset-8 border-2 border-[var(--warning)]" />{!online && <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center text-sm font-semibold">Offline - kamera scanner dinonaktifkan.</div>}</div><p className="mt-8 text-lg font-semibold">Arahkan kamera ke QR badge</p><p className="mt-2 text-sm text-white/55">Scanner membaca otomatis. Pastikan QR terlihat utuh.</p></div></div>}</div></main>;
}
