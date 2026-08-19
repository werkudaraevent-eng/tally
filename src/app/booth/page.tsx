"use client";

import { ArrowLeft, CheckCircle, MagnifyingGlass, Package, Prohibit, Scan, Storefront, UserCircle, XCircle } from "@phosphor-icons/react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { HelpPanel } from "@/components/help-panel";
import { SearchResultsSkeleton, Spinner } from "@/components/search-loading";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, StatusChip, TextArea, useScrolledPastTop, type ChipTone } from "@/components/m3";
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
// Nada peran M3, bukan kelas warna. Dulu fungsi ini memuat hex mentah
// (`#EEF8F0`, `#FFF7E6`) yang hanya benar di tema terang; sebagai nada, ia ikut
// berganti sendiri di mode gelap dan di mode kontras tinggi.
const orderStatusBadge = (status: string): { label: string; tone: ChipTone } => {
  switch (status) {
    case "paid": return { label: "Lunas — siap diserahkan", tone: "success" };
    case "handed_over": return { label: "Sudah diserahkan", tone: "neutral" };
    case "void": return { label: "Void", tone: "error" };
    default: return { label: "Menunggu kasir", tone: "warning" };
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
  // Hanya terisi untuk admin/super_admin: booth yang boleh ia wakili. Operator
  // booth menerima array kosong karena booth-nya melekat pada akun dan tidak
  // boleh dipindah dari layar.
  const [booths, setBooths] = useState<Array<{ id: number; code: string; name: string }>>([]);
  // Booth pilihan admin dibaca oleh pemuat berkala (riwayat tiap 15 detik) yang
  // ditutup atas array dependensi kosong. Tanpa ref, timer itu selamanya melihat
  // `booth` bernilai null dari render pertama dan meminta riwayat tanpa penyaring
  // booth — persis kekeliruan yang sedang diperbaiki.
  const boothIdRef = useRef<number | null>(null);
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
    // `boothId` dikirim juga oleh operator booth; server mengabaikannya dan tetap
    // memakai booth dari sesi, jadi tidak ada jalan memata-matai booth lain.
    const scope = boothIdRef.current ? `&boothId=${boothIdRef.current}` : "";
    const ordersResponse = await fetch(`/api/booth/orders?limit=50${scope}`, { cache: "no-store" }).catch(() => null);
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

  async function loadContext(boothId?: number) {
    const scope = boothId ? `?boothId=${boothId}` : "";
    const response = await fetch(`/api/booth/context${scope}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = await readJson(response);
    const loaded = (data.booth ?? null) as { id: number; code: string; name: string; transactions_enabled?: boolean } | null;
    boothIdRef.current = loaded?.id ?? null;
    setBooth(loaded);
    setBooths((data.booths ?? []) as Array<{ id: number; code: string; name: string }>);
    setOperator((data.operator as { username?: string } | undefined)?.username ?? "");
    if (data.next_sticker) setOrderCode(String(data.next_sticker));
  }

  // Berpindah booth WAJIB membuang peserta, penawaran, dan nominal yang sedang
  // terbuka. Panel peserta dihitung untuk booth sebelumnya — penawarannya, batas
  // diskonnya, dan riwayat order di booth itu — jadi meneruskannya berarti admin
  // menekan "Buat order" atas dasar keterangan booth yang salah.
  async function selectBooth(boothId: number) {
    setParticipant(null); setResults([]); setSearch(false); setOffers([]); setSelectedOffers([]);
    setExistingOrders([]); setProgress(null); setDiscount(false); setRegularAmount("");
    setMessage(""); setHistory([]);
    await loadContext(boothId);
    void loadHistory();
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

  const { sentinel: barSentinel, scrolled: barScrolled } = useScrolledPastTop();

  return (
    <main className="min-h-dvh bg-surface text-on-surface">
      {/* Bilah atas M3: sewarna kanvas saat halaman di posisi teratas, naik ke
          `surface-container` begitu ada yang tergulir di bawahnya. Blok berwarna
          dengan garis bawah yang menetap adalah pola Material 2. */}
      <div ref={barSentinel} aria-hidden className="h-px" />
      <header className={`sticky top-0 z-20 px-4 py-3 transition-colors duration-200 ease-standard sm:px-8 sm:py-4 ${barScrolled ? "bg-surface-container" : "bg-surface"}`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary leading-none text-on-primary" aria-hidden="true">
              <Storefront size={16} weight="duotone" />
              <span className="mt-0.5 text-label-large font-bold tracking-tight">{booth?.code ?? "--"}</span>
            </div>
            <div className="min-w-0">
              {booths.length > 0
                // Pemilih booth hanya untuk panitia. `select` bawaan dipakai dengan sengaja:
                // di HP ia membuka daftar layar penuh milik sistem, dapat dicari, dan tetap
                // bekerja tanpa JavaScript pihak ketiga di Wi-Fi venue yang lambat.
                ? (
                  <>
                    <label htmlFor="booth-selector" className="sr-only">Pilih booth yang sedang Anda tangani</label>
                    <select
                      id="booth-selector"
                      value={booth?.id ?? ""}
                      onChange={(event) => { const value = Number(event.target.value); if (value) void selectBooth(value); }}
                      className="w-full max-w-[16rem] truncate rounded-sm border border-outline bg-surface-container px-2 py-1 text-body-large font-semibold leading-tight text-on-surface"
                    >
                      <option value="" disabled>Pilih booth...</option>
                      {booths.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                    </select>
                  </>
                )
                : <p className="truncate text-title-medium font-semibold leading-tight">{booth?.name ?? "Memuat booth..."}</p>}
              <p className="mt-0.5 truncate text-body-small text-on-surface-variant">
                <span className="font-semibold uppercase tracking-[0.12em]">{booths.length > 0 ? "Panitia" : "Admin Booth"}</span>
                {operator ? ` · ${operator}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusChip tone="neutral" className="min-h-11" icon={<Package size={18} className="shrink-0 text-primary" />}>
              <span className="hidden sm:inline">{pickupMode === "immediate" ? "Serahkan langsung" : "Barang disimpan di rak booth"}</span>
              <span className="sm:hidden">{pickupMode === "immediate" ? "Langsung" : "Disimpan"}</span>
            </StatusChip>
            <HelpPanel role="booth" />
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
        {message && (
          <div role="alert" className="mb-5 flex items-center gap-3 rounded-lg bg-error-container p-4 text-body-medium text-on-error-container">
            <XCircle size={20} weight="fill" className="shrink-0" />
            {message}
          </div>
        )}

        {success ? (
          <section className="flex min-h-[65dvh] items-center justify-center rounded-2xl bg-success-container p-8 text-center text-on-success-container">
            <div>
              <CheckCircle size={80} weight="fill" className="mx-auto" />
              <p className="mt-6 text-label-large font-semibold uppercase tracking-[0.2em] opacity-80">Order berhasil dibuat</p>
              {/* Kode order adalah satu-satunya hal yang disebutkan staf ke peserta.
                  Skala display-large M3 dipakai apa adanya: dibaca dari jarak satu
                  meja, sambil berdiri, di ruangan yang berisik. */}
              <h1 className="mt-3 text-display-large font-semibold tracking-[-0.04em]">{success}</h1>
              <p className="mt-5 max-w-md text-body-large opacity-90">
                {!cashierRequired
                  ? (pickupMode === "immediate" ? "Order tercatat lunas. Serahkan barang sekarang. Peserta tidak perlu ke kasir." : "Order tercatat lunas. Tempel stiker pada barang, simpan di rak. Peserta tidak perlu ke kasir.")
                  : (pickupMode === "immediate" ? "Serahkan barang sekarang. Arahkan peserta ke kasir untuk membayar." : "Tempel stiker pada barang, simpan di rak. Arahkan peserta ke kasir.")}
              </p>
              <Button
                variant="outlined"
                size="lg"
                className="mt-10 border-current"
                onClick={() => { setSuccess(""); setParticipant(null); setSearch(true); }}
              >
                Kembali ke pencarian peserta
              </Button>
            </div>
          </section>
        ) : (
          /* `min-w-0` WAJIB pada kedua kolom grid.
             Grid item punya `min-width: auto`, jadi tidak boleh menyusut di bawah lebar
             min-content-nya. Baris hasil pencarian memakai `truncate`, dan `truncate`
             berarti `white-space: nowrap`, sehingga min-content-nya = lebar teks penuh
             tanpa pemotongan. Akibatnya kolom melebar mengikuti nama instansi terpanjang
             dan SELURUH halaman ikut melebar, bukan hanya panelnya.
             `min-w-0` di dalam baris tidak cukup: pembatasan harus ada di setiap tingkat
             rantai, dan tingkat grid inilah yang terlewat. */
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <section className="min-w-0">
              {participant ? (
                <div className="overflow-hidden rounded-2xl bg-surface-container">
                  {/* Sebelumnya hanya teks biru tanpa border/background/ikon, jadi tidak terbaca
                      sebagai tombol. Staf booth adalah pelaku UMKM, bukan pengguna teknis:
                      aksi navigasi harus terlihat jelas dapat ditekan. */}
                  <div className="border-b border-outline-variant p-4">
                    <Button variant="tonal" size="lg" block onClick={backToParticipantSearch} icon={<ArrowLeft size={20} weight="bold" />}>
                      Ganti peserta lain
                    </Button>
                  </div>

                  <div className="flex items-center gap-4 border-b border-outline-variant p-5">
                    <UserCircle size={52} weight="duotone" className="shrink-0 text-primary" />
                    <div className="min-w-0">
                      <h2 className="text-headline-small font-semibold">{participant.name}</h2>
                      <p className="mt-1 text-body-medium text-on-surface-variant">{participant.company} — {participant.title}</p>
                    </div>
                  </div>

                  {/* Peserta yang sudah dihapus panitia pusat. Ditempatkan tepat di bawah nama,
                      di atas segala kolom isian, karena inilah satu-satunya keadaan di mana
                      staf harus BERHENTI mengisi order dan bukan sekadar menyesuaikan angka.
                      Namanya tetap tampil supaya staf dapat menyebutkannya ke meja registrasi. */}
                  {participantRemoved && (
                    <div role="alert" className="m-5 rounded-lg bg-error-container p-5 text-on-error-container">
                      <p className="flex items-center gap-2 text-title-medium font-semibold"><Prohibit size={22} weight="fill" /> PESERTA SUDAH DIHAPUS PANITIA</p>
                      <p className="mt-2 text-body-medium">Order tidak dapat dibuat untuk peserta ini. Arahkan peserta ke meja registrasi lebih dulu.</p>
                    </div>
                  )}

                  {progress && (
                    <div className="flex items-center justify-between gap-4 border-b border-outline-variant px-5 py-4">
                      <span className="text-label-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Progress peserta</span>
                      <span className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5" aria-hidden="true">
                          {Array.from({ length: progress.total }).map((_, dot) => (
                            <span
                              key={dot}
                              className={dot < progress.visited ? "size-3 rounded-full bg-primary" : "size-3 rounded-full bg-outline-variant"}
                            />
                          ))}
                        </span>
                        <span className="text-body-medium font-semibold tabular-nums">{progress.visited} dari {progress.total} booth</span>
                      </span>
                    </div>
                  )}

                  {existingOrders
                    .filter((order) => order.pickup_mode === "after_payment" && order.status !== "void" && order.status !== "handed_over")
                    .map((order) => (
                      <div
                        key={order.id}
                        className={`m-5 rounded-lg p-5 ${order.status === "paid" ? "bg-success-container text-on-success-container" : "bg-error-container text-on-error-container"}`}
                      >
                        <p className="flex items-center gap-2 text-title-medium font-semibold"><Package size={22} weight="fill" /> BARANG SIAP DIAMBIL</p>
                        <p className="mt-2 text-body-medium">{order.code} · {order.has_discount_item ? "Item diskon" : "Reguler"} · {formatRupiah(order.total_amount)}</p>
                        {order.status === "paid" ? (
                          <>
                            <p className="mt-1 flex items-center gap-1 text-body-medium font-semibold">
                              <CheckCircle size={16} weight="fill" /> LUNAS{order.paid_at ? ` ${formatEventTime(order.paid_at, timeZone)}` : ""}
                            </p>
                            <Button className="mt-4" block onClick={() => handOverOrder(order.id)} disabled={pending || !online}>
                              Serahkan barang
                            </Button>
                          </>
                        ) : (
                          <p className="mt-2 text-body-medium font-semibold">
                            {cashierRequired ? "BELUM LUNAS — arahkan peserta ke kasir" : "BELUM LUNAS — order lama sebelum kasir dimatikan. Hubungi admin."}
                          </p>
                        )}
                      </div>
                    ))}

                  <div className="m-5 space-y-3">
                    {offers.length === 0 ? (
                      <p className="rounded-lg bg-surface-container-high p-5 text-body-medium text-on-surface-variant">Tidak ada item spesial di booth ini.</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-label-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Item spesial</p>
                          <p className="text-body-small text-on-surface-variant">
                            Total belanja peserta ini di semua booth <span className="font-semibold tabular-nums text-on-surface">{formatRupiah(accumulated)}</span>
                          </p>
                        </div>
                        {offers.map((offer) => {
                          const chosen = selectedOffers.includes(offer.code);
                          const blocked = Boolean(offer.blocked_reason);
                          return (
                            <div
                              key={offer.code}
                              className={`rounded-lg p-5 ${blocked ? "bg-error-container text-on-error-container" : chosen ? "bg-success-container text-on-success-container" : "bg-surface-container-high text-on-surface"}`}
                            >
                              <p className="flex items-start gap-2 text-title-medium font-semibold">
                                {blocked ? <XCircle size={22} weight="fill" className="shrink-0" /> : chosen ? <CheckCircle size={22} weight="fill" className="shrink-0" /> : <span className="mt-0.5 size-[22px] shrink-0 rounded-xs border-2 border-current" />}
                                <span className="min-w-0">
                                  {offer.name.toUpperCase()}
                                  {offer.scope === "global" && <span className="ml-2 rounded-xs bg-surface-container-lowest px-2 py-0.5 text-label-small font-semibold uppercase tracking-[0.08em] text-on-surface-variant">Semua booth</span>}
                                </span>
                              </p>
                              <p className="mt-2 text-body-medium tabular-nums">{formatRupiah(offer.price)}</p>
                              {/* Alasan spesifik, bukan sekadar "tidak tersedia": staf booth harus bisa
                                  menjelaskan ke peserta kenapa item tidak bisa diambil. */}
                              <p className="mt-2 text-body-small">{blocked ? offerBlockedLabel(offer) : "Ketuk untuk memasukkan item ini ke order."}</p>
                              <label className={`m3-state mt-4 flex min-h-12 items-center gap-3 rounded-sm border border-current px-4 text-label-large font-semibold ${blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                                <input type="checkbox" checked={chosen} disabled={blocked} onChange={() => toggleOffer(offer)} className="size-5 accent-[var(--md-sys-color-primary)]" />
                                {blocked ? "Tidak tersedia" : chosen ? "Dipilih" : `Ambil ${offer.name}`}
                              </label>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>

                  <div className={`grid gap-4 p-5 pt-0 ${transactionsEnabled ? "sm:grid-cols-2" : ""}`}>
                    {transactionsEnabled ? (
                      <label className="text-label-large font-semibold">
                        Item reguler (Rp)
                        <input
                          value={groupAmountInput(regularAmount)}
                          placeholder="Wajib diisi"
                          aria-describedby="regular-amount-help"
                          aria-invalid={amountMissing || amountTooLarge}
                          onChange={(event) => setRegularAmount(sanitizeAmountInput(event.target.value))}
                          className={`mt-2 h-16 w-full rounded-md border bg-surface-container-lowest px-4 text-headline-small font-semibold tabular-nums text-on-surface outline-none transition-colors focus:border-primary ${amountMissing || amountTooLarge ? "border-warning" : "border-outline"}`}
                          inputMode="numeric"
                        />
                        {/* Hasil penjumlahan ditampilkan SEKARANG, bukan hanya di baris TOTAL.
                            Baris TOTAL ada di bawah dan sudah memuat harga item spesial, jadi angkanya
                            berbeda dari isi kolom ini dan tidak dapat dipakai untuk memeriksa
                            penjumlahan yang baru diketik. Rincian sukunya ikut ditulis ulang dengan
                            pemisah ribuan supaya suku yang salah ketik terlihat sebelum disimpan. */}
                        {amountParts(regularAmount).length > 1 ? (
                          <span className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-small font-normal text-on-surface-variant">
                            <span className="tabular-nums">{formatAmountParts(regularAmount)}</span>
                            <span className="font-semibold text-on-surface">= {formatRupiah(regularTotal)}</span>
                            <span>({amountParts(regularAmount).length} item)</span>
                          </span>
                        ) : null}
                        {/* Hanya keterangan, tanpa tombol aksi. Menambah tombol di sini berarti
                            menambah langkah yang tidak ada di panduan cetak untuk staf booth, dan
                            panduan yang tidak cocok dengan layar lebih merugikan daripada satu
                            ketukan yang dihemat. Nol dinyatakan dengan mengetik 0.

                            Sebab itu pula penjumlahan diterima di kolomnya sendiri, bukan lewat
                            tombol "tambah item": keypad numerik HP sudah memuat '+', jadi tidak ada
                            ketukan tambahan dan tidak ada langkah baru yang harus dicetak ulang. */}
                        {amountTooLarge
                          ? <span id="regular-amount-help" className="mt-2 block text-body-small font-normal text-warning">Jumlahnya terlalu besar. Batas satu order {formatRupiah(MAX_ORDER_AMOUNT)}. Periksa apakah ada suku yang kelebihan angka nol.</span>
                          : amountMissing
                            ? <span id="regular-amount-help" className="mt-2 block text-body-small font-normal text-warning">Wajib diisi. Kalau peserta tidak beli item reguler, tulis 0.</span>
                            : <span id="regular-amount-help" className="mt-2 block text-body-small font-normal text-on-surface-variant">Nominal item reguler yang dibeli peserta di booth ini. Beberapa barang boleh dijumlahkan langsung di sini, contoh 12000+5000+3000.</span>}
                      </label>
                    ) : null}
                    <label className="text-label-large font-semibold">
                      {pickupMode === "immediate" ? "Nomor order" : "Nomor stiker"} {booth?.code ?? "booth"} <span className="font-normal text-on-surface-variant">(otomatis lanjut)</span>
                      <input
                        value={orderCode}
                        onChange={(event) => setOrderCode(event.target.value.replace(/\D/g, "").slice(0, 3))}
                        className="mt-2 h-16 w-full rounded-md border border-outline bg-surface-container-lowest px-4 text-headline-small tabular-nums text-on-surface outline-none transition-colors focus:border-primary"
                        inputMode="numeric"
                      />
                    </label>
                  </div>

                  <div className="border-t border-outline-variant p-5">
                    {selectedOfferTotal > 0 && (
                      <div className="mb-3 space-y-1 text-body-small text-on-surface-variant">
                        {transactionsEnabled ? (
                          <div className="flex items-center justify-between">
                            <span>Item reguler{amountParts(regularAmount).length > 1 ? ` (${formatAmountParts(regularAmount)})` : ""}</span>
                            <span className="tabular-nums">{formatRupiah(regularTotal)}</span>
                          </div>
                        ) : null}
                        {offers.filter((offer) => selectedOffers.includes(offer.code)).map((offer) => (
                          <div key={offer.code} className="flex items-center justify-between">
                            <span className="truncate pr-2">{offer.name}</span>
                            <span className="shrink-0 tabular-nums">{formatRupiah(offer.price)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-label-large font-semibold">TOTAL</span>
                      <span className="text-headline-medium font-semibold tabular-nums">{formatRupiah(previewTotal)}</span>
                    </div>
                  </div>

                  <div className="p-5 pt-0">
                    <Button
                      size="xl"
                      block
                      loading={pending}
                      disabled={!orderCode || !participant || amountMissing || amountTooLarge || emptyOrder || participantRemoved}
                      onClick={createOrder}
                    >
                      {pending ? "Menyimpan..." : participantRemoved ? "Peserta sudah dihapus panitia" : amountMissing ? "Isi nominal dulu" : amountTooLarge ? "Nominal terlalu besar" : emptyOrder ? (transactionsEnabled ? "Isi nominal atau pilih item" : "Pilih item dulu") : transactionsEnabled ? "Buat order" : "Catat serah terima"}
                    </Button>
                  </div>
                </div>
              ) : !booth ? (
                <EmptyState
                  icon={<Storefront size={40} weight="duotone" className="text-primary" />}
                  title={booths.length > 0 ? "Pilih booth dulu" : "Memuat booth..."}
                  description={booths.length > 0
                    ? "Akun panitia tidak terikat pada satu booth. Pilih booth yang sedang Anda tangani di bagian atas layar — order yang Anda buat akan tercatat atas nama booth itu."
                    : "Jika pesan ini bertahan, muat ulang halaman."}
                />
              ) : (
                <>
                  {/* Tombol scan adalah target terbesar di layar dengan alasan: ia ditekan
                      lebih sering daripada seluruh kontrol lain digabung, sering sambil
                      memegang HP dengan satu tangan. */}
                  <button
                    onClick={() => setScanning(true)}
                    className="m3-state flex min-h-32 w-full items-center justify-between rounded-3xl bg-primary px-6 text-left text-on-primary transition-[border-radius] duration-200 ease-emphasized active:rounded-lg sm:min-h-36 sm:px-8"
                  >
                    <span className="block text-display-small font-semibold">SCAN QR</span>
                    <Scan size={52} weight="duotone" />
                  </button>

                  <Button variant="outlined" size="lg" block className="mt-3" onClick={() => setSearch(!search)} icon={<MagnifyingGlass size={20} />}>
                    Cari peserta manual
                  </Button>

                  {search && (
                    <Card className="mt-3" padded={false}>
                      <div className="p-4">
                        <label htmlFor="manual-search" className="text-label-large font-semibold">Nama atau instansi peserta</label>
                        <div className="mt-2 flex gap-2">
                          <input
                            id="manual-search"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Enter") void searchParticipants(); }}
                            placeholder="Contoh: Ratna atau nama perusahaan"
                            className="h-12 min-w-0 flex-1 rounded-md border border-outline bg-surface-container-lowest px-3 text-body-large text-on-surface outline-none transition-colors focus:border-primary"
                          />
                          <Button
                            onClick={() => void searchParticipants()}
                            disabled={searching || pending || !online || !searchTerm.trim()}
                            icon={searching ? <Spinner size={17} /> : undefined}
                          >
                            {searching ? "Mencari" : "Cari"}
                          </Button>
                        </div>

                        {/* Kerangka hasil, bukan sekadar teks "Mencari...".
                            Tingginya sama dengan daftar hasil sungguhan, jadi kartu tidak
                            melompat saat data tiba dan tombol di bawahnya tidak bergeser
                            tepat ketika admin booth hendak menekannya. */}
                        {searching && <SearchResultsSkeleton className="mt-3" />}

                        {/* Status diumumkan sekali lewat teks live, karena kerangka di atas
                            sengaja disembunyikan dari pembaca layar. */}
                        <p aria-live="polite" className="sr-only">{searching ? "Mencari peserta" : results.length > 0 ? `${results.length} peserta ditemukan` : ""}</p>

                        {!searching && results.length > 0 && (
                          <div className="mt-3 divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant">
                            {/* Lewat lookupParticipant, bukan setParticipant langsung: hasil pencarian tidak
                                membawa daftar penawaran spesial, jadi memilih dari sini tanpa lookup akan
                                menampilkan panel item spesial kosong. */}
                            {/* Baris hasil pencarian sebelumnya hanya berubah warna saat hover, jadi
                                di perangkat sentuh tidak ada petunjuk sama sekali bahwa ini dapat
                                ditekan. Ikon + label "Pilih" membuatnya eksplisit. */}
                            {results.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => { void lookupParticipant(item.qr_code); setResults([]); setSearch(false); }}
                                className="m3-state flex min-h-16 w-full items-center gap-3 p-3 text-left"
                              >
                                <UserCircle size={34} weight="duotone" className="shrink-0 text-primary" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-body-large font-semibold">{item.name}</span>
                                  <span className="block truncate text-body-small text-on-surface-variant">{item.company ?? "Instansi tidak diisi"}{item.title ? ` · ${item.title}` : ""}</span>
                                </span>
                                <span className="shrink-0 text-label-large font-semibold text-primary">Pilih</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {searchTerm && !searching && results.length === 0 && <p className="mt-3 text-body-medium text-on-surface-variant">Peserta tidak ditemukan.</p>}
                      </div>
                    </Card>
                  )}
                </>
              )}
            </section>

            <section className="min-w-0 space-y-4">
              {readyToHandOver.length > 0 && (
                <div className="rounded-2xl bg-success-container p-4 text-on-success-container">
                  <p className="flex items-center gap-2 text-label-large font-semibold uppercase tracking-[0.12em]">
                    <Package size={19} weight="fill" />Siap diserahkan ({readyToHandOver.length})
                  </p>
                  <div className="mt-3 space-y-2">
                    {readyToHandOver.map((item) => (
                      <div key={item.id} className="rounded-lg bg-surface-container-lowest p-3 text-on-surface">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-body-large font-semibold">{item.participants?.name ?? "Peserta"}</p>
                            <p className="mt-0.5 truncate text-body-small text-on-surface-variant">{item.code} · {formatRupiah(item.total_amount)}</p>
                          </div>
                          <StatusChip tone="success">Lunas</StatusChip>
                        </div>
                        <Button className="mt-3" block onClick={() => handOverOrder(item.id)} disabled={pending || !online}>
                          Serahkan barang
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Card padded={false}>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-title-medium font-semibold">Order booth {booth?.code ?? "ini"}</p>
                      <p className="mt-0.5 text-body-small text-on-surface-variant">Ketuk nama untuk buat order lagi.</p>
                    </div>
                    {history.length > 5 && (
                      <Button variant="text" size="sm" onClick={() => setShowAllHistory((open) => !open)}>
                        {showAllHistory ? "Tampilkan 5 terakhir" : `Lihat semua (${history.length})`}
                      </Button>
                    )}
                  </div>

                  <div className="mt-3 divide-y divide-outline-variant">
                    {history.length === 0 ? (
                      <p className="py-4 text-body-medium text-on-surface-variant">Belum ada order.</p>
                    ) : visibleHistory.map((item) => {
                      const badge = orderStatusBadge(item.status);
                      const canVoid = Boolean(item.auto_settled) && item.status !== "void";
                      return (
                        <div key={item.id} className="flex items-start gap-3 py-3">
                          <button
                            type="button"
                            onClick={() => { if (item.participants?.qr_code) void lookupParticipant(item.participants.qr_code); }}
                            disabled={!online || !item.participants?.qr_code}
                            title={item.participants?.name ? `Buat order baru untuk ${item.participants.name}` : undefined}
                            className="m3-state flex min-w-0 flex-1 items-start gap-3 rounded-sm px-2 py-1 text-left disabled:cursor-not-allowed"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-body-medium font-semibold">{item.participants?.name ?? "Peserta"}</p>
                              <p className="mt-0.5 truncate text-body-small text-on-surface-variant">{item.code} · {formatEventDateTime(item.created_at, timeZone)}</p>
                              <StatusChip tone={badge.tone} className="mt-1.5 min-h-7 text-label-medium">{badge.label}</StatusChip>
                            </div>
                          </button>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span className="text-body-medium font-semibold tabular-nums">{formatRupiah(item.total_amount)}</span>
                            {/* Tombol berbatas dengan target 48px (DESIGN.md): teks kecil tanpa border
                                sebelumnya tidak terbaca sebagai elemen yang bisa ditekan, dan terlalu
                                kecil untuk mobile portrait. Aksi destruktif tetap menempel pada order
                                yang dipengaruhinya, bukan dipindah ke slot tombol utama. */}
                            {canVoid && (
                              <Button
                                variant="outlined"
                                size="sm"
                                className="border-error text-error"
                                onClick={() => { setVoidTarget(item); setVoidReason(""); setMessage(""); }}
                                disabled={!online}
                                aria-label={`Void order ${item.code}`}
                                icon={<Prohibit size={15} weight="bold" />}
                              >
                                Void
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </section>
          </div>
        )}

        {voidTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-5">
            <div className="w-full max-w-md rounded-2xl bg-surface-container-high p-6 shadow-level3">
              <div className="flex items-center gap-2">
                <XCircle size={22} weight="fill" className="text-error" />
                <h2 className="text-title-large font-semibold">Void order {voidTarget.code}</h2>
              </div>
              <p className="mt-3 text-body-medium text-on-surface-variant">
                Order dibatalkan dan nilainya keluar dari hitungan top spender. Kuota item diskon peserta kembali tersedia. Alasan wajib diisi dan tercatat di audit log.
              </p>
              <TextArea
                className="mt-5"
                label="Alasan void"
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                rows={3}
                placeholder="Contoh: salah input nominal, peserta batal"
              />
              <div className="mt-6 flex gap-3">
                <Button variant="outlined" className="flex-1" onClick={() => { setVoidTarget(null); setVoidReason(""); }}>Batal</Button>
                <Button variant="danger" className="flex-1" loading={pending} disabled={!online || !voidReason.trim()} onClick={confirmVoid}>
                  {pending ? "Memproses..." : "Void order"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {scanning && (
          /* Overlay scanner selalu gelap, tidak ikut tema. Pratinjau kamera dibaca
             lebih baik di atas latar gelap, dan mata yang baru menatap layar terang
             butuh waktu menyesuaikan — waktu yang tidak ada saat antrean mengular. */
          <div className="fixed inset-0 z-30 flex flex-col bg-[var(--display-bg)] text-[var(--display-ink)]">
            <header className="flex items-center justify-between p-5">
              <div>
                <p className="text-label-medium uppercase tracking-[0.2em] opacity-70">{booth?.name ?? "Booth"}</p>
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
      </div>
    </main>
  );
}
