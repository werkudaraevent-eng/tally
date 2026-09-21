"use client";

import { ArrowRight, ArrowSquareOut, CalendarDots, CalendarPlus, CopySimple, DotsThree, MagnifyingGlass, Plus, Storefront, Trash, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button, CONTAINER_PADDING, Dialog, EmptyState, IconButton, PageContainer, PageHeader, Popover, POPOVER_ITEM, POPOVER_ITEM_DANGER, SegmentedButton, SelectField, SelectMenu, Switch, TextArea, TextField, usePopoverAnchor } from "@/components/m3";
import { EventStatusBadge, URUTAN_STATUS } from "@/components/admin/event-status";
import { UserMenu } from "@/components/admin/user-menu";
import { EVENT_STATUS_LABEL, type EventRow, type EventStatus, type ParticipantSource, type UserRole } from "@/lib/domain";
import { daysUntil } from "@/lib/event-datetime";
import { cx } from "@/lib/m3/cx";
import { useQueryState } from "@/lib/url-state";
import { EN_DASH, SEPARATOR, gabungMeta } from "@/lib/typography";
import { alasanTidakBisaBuka, roleHome } from "@/lib/role-home";

/**
 * Pemilih acara.
 *
 * ---- Baris, bukan kartu ---------------------------------------------------
 *
 * Sebelumnya tiap acara adalah kartu 580×360px berisi empat fakta dan lima
 * tombol admin. Dua acara memenuhi satu layar; sepuluh acara berarti lima layar
 * gulir untuk memilih satu nama. Baris setinggi ±72px memuat fakta yang sama
 * dalam satu tatapan, dan delapan acara muat sekaligus di laptop.
 *
 * ---- Satu klik ke tempat kerja --------------------------------------------
 *
 * "Buka" langsung menuju rumah peran: admin ke dashboard, booth ke layar
 * booth, kasir ke kasir, pemindai ke pemindai. Halaman perantara "pilih Admin
 * atau Booth" dihapus — jawabannya sudah ditentukan peran akun.
 *
 * ---- Aksi langka di menu --------------------------------------------------
 *
 * Mengubah status, menduplikasi, mengatur akses, dan menghapus terjadi sekali
 * seumur acara. Menampilkannya sebagai lima tombol permanen membuat aksi yang
 * ditekan setiap hari (Buka) lebih lemah daripada aksi yang ditekan sekali.
 * Semuanya pindah ke menu ⋯ per baris, hanya untuk super_admin.
 *
 * ---- Dikelompokkan menurut status -----------------------------------------
 *
 * Aktif di atas, lalu Draft, lalu Selesai. Arsip disembunyikan di balik satu
 * tombol: acara yang sudah diarsipkan bukan sesuatu yang dicari setiap hari.
 */

type Action = "activate" | "deactivate" | "complete" | "archive";

/**
 * Aksi yang tersedia per status. Menyembunyikan aksi yang tidak berlaku lebih
 * baik daripada menampilkannya lalu menolak: tombol yang selalu gagal terbaca
 * sebagai sistem rusak, bukan sebagai aturan.
 */
const ACTIONS: Record<EventStatus, Array<{ action: Action; label: string; danger?: boolean }>> = {
  draft: [{ action: "activate", label: "Aktifkan" }],
  active: [
    { action: "deactivate", label: "Kembalikan ke draft" },
    { action: "complete", label: "Tandai selesai" },
  ],
  completed: [
    { action: "activate", label: "Aktifkan lagi" },
    { action: "archive", label: "Arsipkan", danger: true },
  ],
  // Event arsip sengaja hanya bisa dikembalikan ke draft, bukan langsung aktif.
  // Konfigurasinya sudah lama tidak disentuh; melewati draft berarti tidak ada
  // kesempatan memeriksanya sebelum ia jadi kandidat di jalur publik.
  archived: [{ action: "deactivate", label: "Kembalikan ke draft" }],
};

/**
 * Status yang boleh dihapus. Cerminan penjaga di `delete_event`; kalau keduanya
 * berbeda pendapat yang menang adalah database, dan tombolnya di sini hanya
 * berhenti muncul untuk aksi yang pasti ditolak.
 */
const DELETABLE: EventStatus[] = ["draft", "archived"];

/** Nama tabel dari `delete_event` -> kata yang bisa dibaca panitia. */
const LABEL_HITUNGAN: Record<string, string> = {
  participants: "peserta",
  booths: "booth",
  special_offers: "item spesial",
  registrations: "pendaftaran",
  undian_prizes: "hadiah undian",
  rundown_items: "baris rundown",
  seat_map_sessions: "sesi denah",
  audit_logs: "baris audit",
};

/** Aksi yang mengubah apa yang tampil di layar publik butuh konfirmasi. */
const CONFIRM_TEXT: Partial<Record<Action, string>> = {
  activate: "Event aktif ikut jadi kandidat untuk tautan publik tanpa slug (/display, /denah, /rundown). Bila ada lebih dari satu event aktif, tautan lama akan meminta pengguna memilih.",
  deactivate: "Event kembali ke draft. Layar publiknya berhenti melayani tautan tanpa slug, tetapi seluruh data dan konfigurasi tetap utuh.",
  complete: "Event ditandai selesai. Transaksi baru tidak lagi diharapkan, tetapi seluruh laporan dan riwayat tetap bisa dibuka.",
  archive: "Event diarsipkan dan hilang dari daftar utama. Datanya tidak dihapus dan masih bisa dikembalikan ke draft.",
};

const KOLOM = "mt-4";

/**
 * Hitung mundur sebagai kalimat. "H-12" tidak berarti apa-apa bagi panitia yang
 * baru bergabung; "12 hari lagi" langsung terbaca.
 */
function hitungMundur(eventDate: string | null, now: Date | null): string | null {
  if (!now) return null;
  const selisih = daysUntil(eventDate, now);
  if (selisih === null) return null;
  if (selisih > 1) return `${selisih} hari lagi`;
  if (selisih === 1) return "Besok";
  if (selisih === 0) return "Hari ini";
  return `${Math.abs(selisih)} hari lalu`;
}

/**
 * Blok tanggal di tepi kiri baris: angka hari besar, bulan dan tahun kecil.
 * Tanggal adalah hal pertama yang dipindai mata saat mencari acara, jadi ia
 * mendapat bentuk yang bisa ditemukan tanpa dibaca dulu.
 */
function BlokTanggal({ event }: { event: EventRow }) {
  const bingkai = "flex h-[52px] w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-outline-variant";
  if (!event.event_date) {
    return (
      <div className={cx(bingkai, "border-dashed text-on-surface-variant")} aria-hidden>
        <CalendarDots size={20} />
      </div>
    );
  }
  const tanggal = new Date(`${event.event_date}T12:00:00Z`);
  const hari = new Intl.DateTimeFormat("id-ID", { day: "numeric", timeZone: event.time_zone }).format(tanggal);
  // Bulan SAJA, tanpa tahun. "AGU 26" terbaca sebagai tanggal 26 Agustus oleh
  // siapa pun yang tidak diberi tahu bahwa 26 adalah tahunnya — dua angka di
  // satu tile, keduanya bisa jadi tanggal. Tahunnya tetap ada, satu baris di
  // sebelah kanan, di dalam tanggal lengkap yang tidak bisa disalahbaca.
  const bulan = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: event.time_zone }).format(tanggal);
  return (
    <time
      dateTime={event.event_date}
      className={cx(bingkai, event.status === "completed" ? "bg-surface" : "bg-surface-container-lowest", "text-on-surface")}
    >
      <span className="text-label-small uppercase leading-none text-on-surface-variant">{bulan}</span>
      <span className="mt-1 text-title-medium font-semibold leading-none tabular-nums">{hari}</span>
    </time>
  );
}

/** Tanggal lengkap di baris kedua: hari, tanggal, bulan, TAHUN. */
function tanggalPanjang(event: EventRow): string | null {
  if (!event.event_date) return null;
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: event.time_zone,
  }).format(new Date(`${event.event_date}T12:00:00Z`));
}

/** Urutan yang bisa dipilih di toolbar. Semuanya dikerjakan di klien: daftar acara puluhan baris, bukan ribuan. */
const OPSI_URUT = [
  { value: "terdekat", label: "Tanggal acara terdekat" },
  { value: "terbaru", label: "Tanggal terbaru" },
  { value: "nama", label: `Nama A${EN_DASH}Z` },
  { value: "diperbarui", label: "Terakhir diperbarui" },
];

/** Menu ⋯ per baris. Hanya super_admin yang melihatnya. */
function MenuAcara({
  event,
  disabled,
  tujuan,
  onAction,
  onDuplicate,
  onDelete,
  onSalinTautan,
}: {
  event: EventRow;
  disabled: boolean;
  /** Tujuan "Buka dashboard". Null kalau peran ini tidak boleh masuk. */
  tujuan: string | null;
  onAction: (action: Action, label: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSalinTautan: () => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();
  const item = POPOVER_ITEM;
  const setOpen = (nilai: boolean) => (nilai ? menu.buka() : menu.tutup());

  return (
    <>
      <IconButton
        ref={setPemicu}
        label={`Aksi untuk ${event.name}`}
        size="sm"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
        onClick={menu.toggle}
      >
        <DotsThree size={20} weight="bold" />
      </IconButton>

      {menu.open ? (
          <Popover anchor={menu} id={menuId} label={`Aksi untuk ${event.name}`} width={240}>
            {/* Tujuan yang sama dengan klik baris, diulang di sini karena menu
                yang tidak memuat aksi utamanya memaksa orang menutupnya dulu
                sebelum bisa melakukan hal yang paling sering dilakukan. */}
            {tujuan ? (
              <Link href={tujuan} role="menuitem" className={item} onClick={() => setOpen(false)}>
                <ArrowRight size={16} className="text-on-surface-variant" /> Buka dashboard
              </Link>
            ) : null}
            <a href={`/e/${event.slug}`} target="_blank" rel="noreferrer" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <ArrowSquareOut size={16} className="text-on-surface-variant" /> Lihat halaman publik
            </a>
            {/* Hanya saat pendaftaran memang terbuka. Menyalin tautan ke formulir
                yang tertutup berarti mengirim tamu ke halaman yang menolaknya. */}
            {event.registration_enabled ? (
              <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onSalinTautan(); }}>
                <CopySimple size={16} className="text-on-surface-variant" /> Salin tautan pendaftaran
              </button>
            ) : null}
            <div className="my-1.5 border-t border-outline-variant" />
            {ACTIONS[event.status].map((entry) => (
              <button
                key={entry.action}
                type="button"
                role="menuitem"
                className={entry.danger ? POPOVER_ITEM_DANGER : item}
                onClick={() => { setOpen(false); onAction(entry.action, entry.label); }}
              >
                {entry.label}
              </button>
            ))}
            <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onDuplicate(); }}>
              <CopySimple size={16} className="text-on-surface-variant" /> Duplikat acara
            </button>
            <Link href={`/events/${event.id}/access`} role="menuitem" className={item} onClick={() => setOpen(false)}>
              <UsersThree size={16} className="text-on-surface-variant" /> Hak akses
            </Link>
            {/* Hanya muncul untuk status yang memang bisa dihapus. Menampilkannya
                selalu lalu menolak dengan 422 membuat aturannya terbaca sebagai
                kerusakan, bukan sebagai batas yang disengaja. */}
            {DELETABLE.includes(event.status) ? (
              <>
                <div className="my-1.5 border-t border-outline-variant" />
                <button type="button" role="menuitem" className={POPOVER_ITEM_DANGER} onClick={() => { setOpen(false); onDelete(); }}>
                  <Trash size={16} /> Hapus permanen
                </button>
              </>
            ) : null}
          </Popover>
      ) : null}
    </>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  // Peran dibaca sekali: menentukan tujuan tombol Buka dan apakah menu ⋯
  // tampil. Membuat, mengubah status, menduplikasi, dan mengatur hak akses
  // adalah kewenangan super_admin saja — endpoint-nya memakai
  // requireUser(["super_admin"]), jadi tombolnya pun hanya untuk mereka.
  const [role, setRole] = useState<UserRole | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  /** Tab, kata cari, dan urutan hidup di URL. Lihat `lib/url-state`. */
  const { params, set: setQuery } = useQueryState();
  const kolomCari = useRef<HTMLInputElement | null>(null);

  /**
   * Ctrl/Cmd+K memfokuskan kolom cari, bukan membuka palet perintah.
   *
   * Palet di ruang kerja berisi lima belas tujuan yang semuanya menuntut acara
   * sudah dipilih; membukanya di halaman SEBELUM memilih acara berarti menawarkan
   * lima belas tautan yang belum punya tujuan. Yang dicari orang di sini cuma
   * satu hal, dan kolomnya sudah ada di layar. Labelnya menjanjikan Ctrl K, jadi
   * pintasannya harus benar-benar ada.
   */
  useEffect(() => {
    const onKey = (peristiwa: KeyboardEvent) => {
      if (peristiwa.key.toLowerCase() !== "k" || !(peristiwa.metaKey || peristiwa.ctrlKey)) return;
      peristiwa.preventDefault();
      kolomCari.current?.focus();
      kolomCari.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  /**
   * Dua sumber peserta yang bisa DINYALAKAN, bukan empat pilihan yang saling
   * meniadakan.
   *
   * Pemilih lamanya menawarkan "Manual / impor", "Scanner API", "Form registrasi
   * publik", dan "Gabungan". Dua di antaranya menyesatkan sekaligus:
   *
   *   * "Manual / impor" terbaca sebagai pilihan yang mengunci yang lain,
   *     padahal menambah peserta satu per satu dan mengimpor spreadsheet selalu
   *     tersedia di setiap acara, apa pun isi kolom ini.
   *   * "Gabungan" tidak menyebut apa yang digabung. Yang dimaksud kode adalah
   *     Scanner API DAN form publik, jadi memilihnya untuk menggabung impor
   *     manual dengan form publik berakhir pada galat "slug Scanner API wajib
   *     diisi" yang tidak menjelaskan apa pun.
   *
   * Dua sakelar menghapus keduanya. Nilai enum yang dikirim ke server tetap
   * sama persis; yang berubah hanya pertanyaan yang diajukan ke admin.
   */
  const [pakaiScanner, setPakaiScanner] = useState(false);
  const [pakaiFormPublik, setPakaiFormPublik] = useState(false);
  const [duplicating, setDuplicating] = useState<EventRow | null>(null);
  const [confirming, setConfirming] = useState<{ event: EventRow; action: Action; label: string } | null>(null);
  // Dipisahkan dari `confirming`: penghapusan tidak dapat dibatalkan, jadi
  // dialognya menuntut slug diketik ulang dan tidak boleh ikut memakai dialog
  // konfirmasi biasa yang cukup satu klik.
  const [deleting, setDeleting] = useState<EventRow | null>(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [pending, setPending] = useState(false);
  // Tanggal dibaca saat data tiba, bukan pada setiap render: `new Date()` di
  // badan komponen membuat markup server dan klien berbeda saat tengah malam
  // terlewati di antara keduanya.
  const [sekarang, setSekarang] = useState<Date | null>(null);

  const isOwner = role === "super_admin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  async function load() {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const akun = (await r.json()).user as { username?: string; role?: UserRole } | null;
        setRole(akun?.role ?? null);
        setUsername(akun?.username ?? null);
      })
      .catch(() => null);
    const response = await fetch("/api/events").catch(() => null);
    if (!response) { setError("Koneksi gagal. Muat ulang halaman."); setLoading(false); return; }
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.message ?? "Daftar event gagal dimuat.");
    else setEvents(body.events ?? []);
    setSekarang(new Date());
    setLoading(false);
  }

  async function runAction(event: EventRow, action: Action) {
    setPending(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setPending(false);
    if (!response) {
      // POST yang gagal mungkin sudah sampai server. "Coba lagi" bisa berarti
      // menjalankan aksi yang sama dua kali.
      setError("Koneksi gagal. Muat ulang halaman untuk melihat status sebenarnya.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.details?.message ?? body.error?.message ?? `Aksi gagal (${response.status}).`);
      return;
    }
    setConfirming(null);
    setEvents((current) => current.map((row) => (row.id === event.id ? body.event : row)));
    setNotice(`"${event.name}" sekarang berstatus ${EVENT_STATUS_LABEL[body.event.status as EventStatus]}.`);
  }

  async function duplicate(form: FormData) {
    if (!duplicating) return;
    setPending(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/events/${duplicating.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        event_date: form.get("event_date") || null,
        scanner_api_event_slug: form.get("scanner_api_event_slug") || null,
      }),
    }).catch(() => null);
    setPending(false);
    if (!response) { setError("Koneksi gagal. Periksa daftar sebelum mengulang — salinan mungkin sudah dibuat."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.details?.message ?? body.error?.message ?? "Duplikasi gagal.");
      return;
    }
    setDuplicating(null);
    setEvents((current) => [body.event, ...current]);
    setNotice(`Salinan "${body.event.name}" dibuat sebagai draft. Peserta, transaksi, dan pemenang undian TIDAK ikut disalin.`);
  }

  async function remove() {
    if (!deleting) return;
    setPending(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/events/${deleting.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_slug: confirmSlug.trim() }),
    }).catch(() => null);
    setPending(false);
    if (!response) {
      // Penghapusan berjalan dalam satu transaksi di database, jadi keadaan
      // setengah jadi tidak mungkin -- tetapi permintaan yang tidak berbalas
      // bisa saja SUDAH selesai. Daftarnya yang harus menjawab, bukan tebakan.
      setError("Koneksi terputus. Muat ulang halaman untuk melihat apakah event sudah terhapus.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.details?.message ?? body.error?.message ?? "Penghapusan gagal.");
      return;
    }
    const hapus = (body.deleted ?? {}) as Record<string, number>;
    const rincian = Object.entries(hapus).filter(([, jumlah]) => jumlah > 0).map(([nama, jumlah]) => `${jumlah} ${LABEL_HITUNGAN[nama] ?? nama}`);
    setDeleting(null);
    setConfirmSlug("");
    setEvents((current) => current.filter((row) => row.id !== deleting.id));
    setNotice(`"${body.name}" dihapus permanen${rincian.length > 0 ? `, beserta ${rincian.join(", ")}` : ", tanpa data anak"}.`);
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  /**
   * `?buat=1` membuka langsung dialog buat event.
   *
   * Ada karena pengalih acara di sidebar ruang kerja menawarkan "Buat event
   * baru", dan tanpa ini tawaran itu hanya bisa mendaratkan orang di halaman ini
   * lalu menyuruhnya mencari tombolnya sendiri — aksi yang setengah menepati
   * janjinya lebih buruk daripada aksi yang tidak ada.
   *
   * Dibaca dari `window.location`, bukan `useSearchParams`: hook itu memaksa
   * seluruh halaman ini masuk ke batas Suspense demi satu parameter yang hanya
   * dipakai sekali saat dipasang.
   */
  useEffect(() => {
    if (!isOwner) return;
    if (new URLSearchParams(window.location.search).get("buat") !== "1") return;
    bukaBuatEvent();
    // Parameternya dibuang dari URL supaya menyegarkan halaman tidak membuka
    // dialognya lagi setelah acara tadi selesai dibuat.
    window.history.replaceState(null, "", window.location.pathname);
  }, [isOwner]);

  /** Dialog dibuka bersih. Sakelar yang tertinggal menyala dari percobaan
   *  sebelumnya akan membuat event berikutnya lahir dengan sumber yang salah. */
  function bukaBuatEvent() {
    setPakaiScanner(false);
    setPakaiFormPublik(false);
    setError("");
    setCreating(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const participantSource: ParticipantSource =
      pakaiScanner && pakaiFormPublik ? "hybrid" : pakaiScanner ? "scanner_api" : pakaiFormPublik ? "public_form" : "manual";
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"), event_date: form.get("event_date") || null,
        description: form.get("description") || null, time_zone: form.get("time_zone"),
        participant_source: participantSource,
        scanner_api_event_slug: form.get("scanner_api_event_slug") || null,
      }),
    }).catch(() => null);
    setPending(false);
    if (!response) { setError("Koneksi gagal. Event mungkin belum tersimpan."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.message ?? "Event gagal dibuat."); return; }
    setCreating(false);
    setEvents((current) => [body.event, ...current]);
  }

  // Galat yang lahir dari dialog ditampilkan DI DALAM dialognya. Galat di
  // halaman belakang tidak terlihat oleh orang yang sedang menatap dialog.
  const dialogTerbuka = confirming !== null || deleting !== null || duplicating !== null || creating;


  const tab = params.get("tab") ?? "semua";
  const cari = params.get("q") ?? "";
  const urut = params.get("sort") ?? "terdekat";

  /**
   * Penyaringan dan pengurutan dikerjakan di KLIEN, dan itu keputusan yang sadar.
   *
   * Daftar acara adalah puluhan baris, bukan ribuan, dan `/api/events` sudah
   * mengirim seluruhnya dalam satu permintaan. Memindahkannya ke server berarti
   * satu perjalanan jaringan per huruf yang diketik, untuk menyaring data yang
   * sudah ada di memori tab ini.
   */
  const terlihat = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    const cocok = events.filter((item) => {
      if (tab !== "semua" && item.status !== tab) return false;
      // Arsip tidak pernah ikut di "Semua": ia disingkirkan dengan sengaja, dan
      // memunculkannya kembali di daftar utama membatalkan arti mengarsipkan.
      if (tab === "semua" && item.status === "archived") return false;
      if (!kata) return true;
      return item.name.toLowerCase().includes(kata) || (item.venue_name ?? "").toLowerCase().includes(kata);
    });

    const waktu = (item: EventRow) => (item.event_date ? new Date(item.event_date).getTime() : null);
    return [...cocok].sort((a, b) => {
      if (urut === "nama") return a.name.localeCompare(b.name, "id");
      if (urut === "diperbarui") return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
      const wa = waktu(a);
      const wb = waktu(b);
      // Acara tanpa tanggal selalu di bawah, apa pun arah urutannya. Ia tidak
      // punya posisi di garis waktu, dan menempatkannya di puncak membuat daftar
      // terbaca seperti salah urut.
      if (wa === null && wb === null) return a.name.localeCompare(b.name, "id");
      if (wa === null) return 1;
      if (wb === null) return -1;
      return urut === "terbaru" ? wb - wa : wa - wb;
    });
  }, [events, tab, cari, urut]);

  /** Jumlah per tab dihitung dari SELURUH acara, bukan dari yang sedang tersaring. */
  const hitung = useMemo(() => {
    const tanpaArsip = events.filter((item) => item.status !== "archived");
    return {
      semua: tanpaArsip.length,
      active: events.filter((item) => item.status === "active").length,
      draft: events.filter((item) => item.status === "draft").length,
      completed: events.filter((item) => item.status === "completed").length,
      archived: events.filter((item) => item.status === "archived").length,
    };
  }, [events]);

  /**
   * Di tab "Semua", baris dikelompokkan menurut status. Di tab lain tidak: judul
   * kelompok yang isinya sama dengan nama tabnya hanya mengulang.
   */
  const kelompokTampil = tab === "semua"
    ? URUTAN_STATUS.filter((status) => status !== "archived")
        .map((status) => ({ status, daftar: terlihat.filter((item) => item.status === status) }))
        .filter((grup) => grup.daftar.length > 0)
    : [{ status: null, daftar: terlihat }];

  async function salinTautan(item: EventRow) {
    await navigator.clipboard.writeText(`${window.location.origin}/e/${item.slug}/daftar`).catch(() => null);
    setNotice(`Tautan pendaftaran ${item.name} disalin.`);
  }

  const baris = "group relative flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-surface";

  return <div className="press min-h-dvh bg-surface text-on-surface">
    {/* Bilah atas milik halaman di LUAR acara: tidak ada rel navigasi di sini,
        karena belum ada acara yang dipilih untuk dinavigasi. Yang tersisa hanya
        identitas produk dan menu akun.

        "Keluar" turun ke menu avatar. Sebelumnya ia tombol bergaris sejajar
        dengan "Buat event" di kepala halaman — dua aksi dengan bobot visual yang
        sama padahal satu dipakai tiap hari dan satu dipakai untuk pergi. */}
    <header className={`sticky top-0 z-topbar border-b border-outline-variant bg-surface ${CONTAINER_PADDING}`}>
      {/* Lebar dan padding yang sama persis dengan konten di bawahnya, jadi logo
          "Tally" sejajar dengan judul "Acara" dan avatar sejajar dengan tepi
          kanan kartu daftar. Tingginya 56px, sama dengan bilah atas ruang kerja
          (`m3-topbar-row`), supaya berpindah antar keduanya tidak menggeser apa
          pun secara vertikal. */}
      <div className="m3-topbar-row mx-auto flex min-h-14 w-full max-w-[1280px] items-center gap-2">
        <Storefront size={18} className="shrink-0 text-on-surface-variant" />
        <span className="text-body-medium font-medium">Tally</span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Cari acara (Ctrl K)" size="sm" onClick={() => kolomCari.current?.focus()}>
            <MagnifyingGlass size={18} />
          </IconButton>
          <UserMenu
            username={username}
            role={role}
            settingsHref="/admin/settings"
            onLogout={() => void logout()}
            loggingOut={pending}
          />
        </div>
      </div>
    </header>

    <PageContainer center>
      <PageHeader
        title="Acara"
        description="Kelola semua acara dan buka dashboard masing-masing."
        actions={isOwner ? <Button onClick={bukaBuatEvent} icon={<Plus size={16} weight="bold" />} className="max-sm:w-full">Buat event</Button> : undefined}
      />

      {error && !dialogTerbuka && <p role="alert" className="rounded-lg mb-4 border border-error-soft-outline bg-error-soft p-4 text-body-medium font-medium text-on-error-soft">{error}</p>}
      {notice && <p key={notice} role="status" className="rise-in-fast rounded-lg mb-4 border border-outline-variant bg-surface-container-lowest p-3 text-body-medium">{notice}</p>}

      {/* Toolbar: tab di kiri, cari dan urutan di kanan. Di layar sempit tab
          bergulir mendatar dan dua kontrol kanan turun ke baris kedua. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="m3-nav-scroll -mx-1 max-w-full overflow-x-auto px-1">
          <SegmentedButton<string>
            label="Saring menurut status acara"
            value={tab}
            onChange={(nilai) => setQuery({ tab: nilai === "semua" ? null : nilai })}
            options={[
              { value: "semua", label: "Semua", badge: hitung.semua },
              { value: "active", label: "Aktif", badge: hitung.active },
              { value: "draft", label: "Draft", badge: hitung.draft },
              { value: "completed", label: "Selesai", badge: hitung.completed },
              ...(hitung.archived > 0 ? [{ value: "archived", label: "Arsip", badge: hitung.archived }] : []),
            ]}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[17.5rem]">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              ref={kolomCari}
              value={cari}
              onChange={(peristiwa) => setQuery({ q: peristiwa.target.value })}
              placeholder="Cari acara..."
              aria-label="Cari acara"
              title="Mencari nama acara dan lokasinya"
              className="h-9 w-full rounded-lg border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none transition-[border-color] duration-150 placeholder:text-on-surface-variant focus:border-primary"
            />
          </div>
          <SelectMenu
            kind="sort"
            label="Urutkan acara"
            value={urut}
            onChange={(nilai) => setQuery({ sort: nilai === "terdekat" ? null : nilai })}
            options={OPSI_URUT}
            width="14rem"
          />
        </div>
      </div>

      {loading ? (
        // Kerangka seukuran baris sungguhan, bukan teks "Memuat...": daftar tidak
        // melompat tingginya saat data tiba.
        <div className="overflow-hidden rounded-[10px] border border-outline-variant bg-surface-container-lowest" aria-busy="true" aria-label="Memuat acara">
          {[0, 1, 2].map((index) => <div key={index} aria-hidden className="flex items-center gap-4 border-b border-outline-variant px-5 py-4 last:border-b-0">
            <span className="h-[52px] w-12 shrink-0 rounded-lg bg-primary-soft shimmer" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="block h-4 w-2/5 rounded-xs bg-primary-soft shimmer" />
              <span className="block h-3 w-3/5 rounded-xs bg-primary-soft shimmer" />
            </span>
          </div>)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus size={40} />}
          title="Belum ada acara"
          description={isOwner
            ? "Buat acara pertama untuk mulai mengelola peserta."
            : "Belum ada acara yang bisa Anda buka. Minta pemilik sistem memberi hak akses."}
          action={isOwner ? <Button onClick={bukaBuatEvent} icon={<Plus size={16} weight="bold" />}>Buat event</Button> : undefined}
        />
      ) : terlihat.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass size={40} />}
          title={cari ? `Tidak ada acara yang cocok dengan "${cari}"` : "Tidak ada acara di tab ini"}
          description="Coba kata lain, atau pilih tab yang berbeda."
          action={<Button variant="outlined" size="sm" onClick={() => setQuery({ q: null, tab: null })}>Reset pencarian</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-outline-variant bg-surface-container-lowest">
          {kelompokTampil.map(({ status, daftar }) => (
            <div key={status ?? "semua"}>
              {/* Judul kelompok DI DALAM kartu, bukan melayang di atasnya.
                  Sebelumnya tiap kelompok punya kartunya sendiri dengan judul di
                  luar, dan hasilnya tiga kartu terpisah yang membuat daftar
                  terbaca sebagai tiga daftar. */}
              {status ? (
                <p className="border-b border-outline-variant bg-surface px-5 py-2 text-label-medium font-medium text-on-surface-variant">
                  {EVENT_STATUS_LABEL[status]} {SEPARATOR} {daftar.length}
                </p>
              ) : null}
              {daftar.map((item) => {
                const alasan = role ? alasanTidakBisaBuka(role, item.status) : null;
                const bisaBuka = role !== null && alasan === null;
                const tujuan = bisaBuka && role ? roleHome(role, item.slug) : null;
                const mundur = item.status === "active" ? hitungMundur(item.event_date, sekarang) : null;
                const keterangan = [
                  tanggalPanjang(item),
                  item.venue_name,
                  mundur,
                  item.status === "active" ? (item.registration_enabled ? "Pendaftaran dibuka" : "Pendaftaran ditutup") : null,
                  alasan,
                ];
                return (
                  <div key={item.id} className={cx(baris, "border-b border-outline-variant last:border-b-0")}>
                    <BlokTanggal event={item} />

                    <div className="min-w-0 flex-1">
                      {/* Seluruh BARIS adalah tautan, lewat `after:absolute` yang
                          meregang ke tepi. `<Link>`, bukan `onClick`: Ctrl+klik
                          harus membuka tab baru, dan itu satu-satunya cara
                          membandingkan dua acara. */}
                      {tujuan ? (
                        <Link
                          href={tujuan}
                          title={item.name}
                          className="block truncate text-[0.9375rem] font-medium text-on-surface after:absolute after:inset-0 after:content-['']"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <p title={item.name} className="truncate text-[0.9375rem] font-medium text-on-surface">{item.name}</p>
                      )}
                      <p className="mt-0.5 truncate text-body-small text-on-surface-variant">
                        {gabungMeta(keterangan)}
                      </p>
                    </div>

                    {/* Status di kolomnya sendiri, bukan disisipkan ke baris
                        keterangan. Kolom tetap membuat empat status berbaris pada
                        satu sumbu tegak dan bisa dipindai tanpa dibaca. */}
                    <div className="hidden w-[7.5rem] shrink-0 sm:block">
                      <EventStatusBadge status={item.status} />
                    </div>

                    <div className="relative z-10 flex shrink-0 items-center gap-1">
                      {/* Panah muncul saat baris disentuh: isyarat bahwa seluruh
                          baris bisa ditekan, tanpa tombol "Buka" permanen yang
                          diulang di setiap baris. */}
                      <ArrowRight size={16} aria-hidden className="text-on-surface-variant opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                      {isOwner ? (
                        <MenuAcara
                          event={item}
                          disabled={pending}
                          tujuan={tujuan}
                          onAction={(action, label) => setConfirming({ event: item, action, label })}
                          onDuplicate={() => { setDuplicating(item); setError(""); setNotice(""); }}
                          onDelete={() => { setDeleting(item); setConfirmSlug(""); setError(""); setNotice(""); }}
                          onSalinTautan={() => void salinTautan(item)}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </PageContainer>

    <Dialog
      open={confirming !== null}
      onClose={() => setConfirming(null)}
      dismissible={!pending}
      title={confirming?.label ?? ""}
      description={confirming?.event.name}
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={() => setConfirming(null)}>Batal</Button>
          <Button loading={pending} onClick={() => { if (confirming) void runAction(confirming.event, confirming.action); }}>
            {confirming?.label ?? "Lanjutkan"}
          </Button>
        </>
      }
    >
      {/* Isi dialog menulis AKIBATnya, bukan sekadar "yakin?". */}
      {confirming ? <p className="rounded-lg mt-4 bg-surface-container p-4 text-body-medium leading-6">{CONFIRM_TEXT[confirming.action]}</p> : null}
      {error ? <p role="alert" className="rounded-lg mt-3 border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
    </Dialog>

    <Dialog
      open={deleting !== null}
      onClose={() => setDeleting(null)}
      dismissible={!pending}
      tone="danger"
      icon={<Trash size={22} weight="fill" />}
      title="Hapus permanen"
      description={deleting?.name}
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={() => setDeleting(null)}>Batal</Button>
          <Button
            variant="danger"
            type="submit"
            form="hapus-event"
            loading={pending}
            disabled={deleting === null || confirmSlug.trim() !== deleting.slug}
          >Hapus permanen</Button>
        </>
      }
    >
      <form id="hapus-event" onSubmit={(e) => { e.preventDefault(); void remove(); }}>
        {/* Yang ditulis adalah APA yang hilang dan APA gantinya, bukan "tindakan
            ini tidak dapat dibatalkan" -- kalimat itu ada di setiap dialog hapus
            di dunia dan sudah berhenti dibaca. Arsipkan disebut sebagai jalan
            keluar karena itulah yang sebenarnya dibutuhkan sebagian besar orang
            yang sampai ke dialog ini. */}
        <p className="rounded-lg mt-4 border border-error-soft-outline bg-error-soft p-4 text-body-medium leading-6 text-on-error-soft">
          Booth, peserta, item spesial, pendaftaran, rundown, denah, hadiah undian, dan riwayat audit event ini dihapus dari database dan tidak dapat dikembalikan. Tidak ada cadangan di dalam aplikasi.
          <span className="mt-2 block font-semibold">Kalau yang Anda inginkan hanya menyembunyikannya dari daftar, batalkan lalu pakai Arsipkan.</span>
        </p>
        <p className="mt-5 text-label-large font-semibold">Ketik slug event untuk melanjutkan</p>
        <code className="rounded-lg mt-2 block select-all bg-surface-container px-3 py-2 font-mono text-body-medium">{deleting?.slug}</code>
        <TextField
          className="mt-3"
          label="Slug event"
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
        />
        {error ? <p role="alert" className="rounded-lg mt-3 border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
      </form>
    </Dialog>

    <Dialog
      open={duplicating !== null}
      onClose={() => setDuplicating(null)}
      dismissible={!pending}
      size="lg"
      title={`Salin dari “${duplicating?.name ?? ""}”`}
      description="Salinan mulai kosong sebagai draft."
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={() => setDuplicating(null)}>Tutup</Button>
          <Button type="submit" form="duplikat-event" loading={pending}>Buat salinan sebagai draft</Button>
        </>
      }
    >
      <form id="duplikat-event" onSubmit={(e) => { e.preventDefault(); void duplicate(new FormData(e.currentTarget)); }}>
        {/* Apa yang ikut dan apa yang tidak ditulis DI DEPAN, bukan setelah
            tombol ditekan. Salinan yang ternyata membawa 247 peserta acara lain
            baru ketahuan setelah ada yang memeriksa daftar peserta. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-container p-4"><p className="text-label-medium font-semibold ed-label">Ikut disalin</p><p className="mt-2 text-body-medium text-on-surface-variant">Booth, item spesial, pengaturan, tampilan display, rundown, denah, hadiah &amp; aturan undian, diskualifikasi berbasis nama perusahaan.</p></div>
          <div className="rounded-lg bg-surface-container p-4"><p className="text-label-medium font-semibold ed-label">Tidak disalin</p><p className="mt-2 text-body-medium text-on-surface-variant">Peserta, transaksi, pemenang undian, hak akses pengguna, dan seluruh riwayat.</p></div>
        </div>

        {/* `key`: nilai bawaan nama mengikuti event yang sedang disalin. Tanpa
            key, React memakai ulang kolom dari salinan sebelumnya. */}
        <TextField key={duplicating?.id} className="mt-5" label="Nama event baru" name="name" required minLength={3} maxLength={120} defaultValue={`${duplicating?.name ?? ""} (salinan)`} />
        <TextField className={KOLOM} label="Tanggal" name="event_date" type="date" optional />
        <TextField
          className={KOLOM}
          label="Slug Scanner API"
          name="scanner_api_event_slug"
          optional
          placeholder="Kosongkan bila belum ada"
          hint="Sengaja tidak diwarisi. Diisi dengan slug lama, salinan akan menarik peserta acara sebelumnya setiap 5 menit. Dikosongkan, sumber peserta turun ke manual dan bisa diubah kapan saja."
        />
        {error ? <p role="alert" className="rounded-lg mt-3 border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
      </form>
    </Dialog>

    <Dialog
      open={creating}
      onClose={() => setCreating(false)}
      dismissible={!pending}
      size="lg"
      title="Buat workspace draft"
      description="Event baru lahir sebagai draft. Aktifkan setelah konfigurasi dan user-nya siap."
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={() => setCreating(false)}>Tutup</Button>
          <Button type="submit" form="buat-event" loading={pending}>Buat event draft</Button>
        </>
      }
    >
      <form id="buat-event" onSubmit={submit}>
        <TextField className="mt-5" label="Nama event" name="name" required minLength={3} maxLength={120} autoFocus />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label="Tanggal" name="event_date" type="date" optional />
          <SelectField label="Zona waktu" name="time_zone" defaultValue="Asia/Jakarta">
            <option value="Asia/Jakarta">WIB</option>
            <option value="Asia/Makassar">WITA</option>
            <option value="Asia/Jayapura">WIT</option>
          </SelectField>
        </div>
        <fieldset className={KOLOM}>
          <legend className="text-label-large font-semibold">Dari mana pesertanya datang</legend>
          <p className="mt-1 text-body-small text-on-surface-variant">
            Menambah peserta satu per satu dan mengimpor dari spreadsheet <strong>selalu tersedia</strong>, apa pun
            pilihan di bawah. Nyalakan hanya yang benar-benar dipakai.
          </p>

          <div className="mt-4 space-y-4">
            <Switch
              checked={pakaiFormPublik}
              onChange={setPakaiFormPublik}
              label="Buka pendaftaran publik"
              description="Tamu mengisi formulir sendiri lewat halaman acara, dan kode pesertanya terbit otomatis."
            />
            <Switch
              checked={pakaiScanner}
              onChange={setPakaiScanner}
              label="Tarik dari Scanner API"
              description="Daftar peserta disinkronkan tiap 5 menit dari sistem luar. Nama, instansi, dan kode QR-nya dikelola di sana, bukan di sini."
            />
          </div>
        </fieldset>

        {/* Kolom slug lahir bersama sakelarnya. Selalu tampil, ia kolom yang
            tidak berarti apa-apa untuk mayoritas acara, dan wajib diisi untuk
            sebagian kecil, tanpa satu pun tanda mana yang sedang berlaku. */}
        {pakaiScanner ? (
          <TextField
            className={KOLOM}
            label="Slug Scanner API"
            name="scanner_api_event_slug"
            required
            hint="Nama acara ini di sistem Scanner API. Tanpa ini, sinkronisasinya tidak tahu peserta siapa yang harus ditarik."
          />
        ) : null}
        <TextArea className={KOLOM} label="Deskripsi" name="description" maxLength={500} rows={3} optional />
        {error ? <p role="alert" className="rounded-lg mt-3 border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
      </form>
    </Dialog>
  </div>;
}
