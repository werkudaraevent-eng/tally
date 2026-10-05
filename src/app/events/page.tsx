"use client";

import { ArrowRight, ArrowSquareOut, CalendarDots, CalendarPlus, CopySimple, DotsThree, MagnifyingGlass, Plus, ShieldCheck, Storefront, Trash, UsersThree } from "@phosphor-icons/react";
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
import { plural } from "@/lib/plural";
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
  draft: [{ action: "activate", label: "Activate" }],
  active: [
    { action: "deactivate", label: "Move back to draft" },
    { action: "complete", label: "Mark as completed" },
  ],
  completed: [
    { action: "activate", label: "Activate again" },
    { action: "archive", label: "Archive", danger: true },
  ],
  // Event arsip sengaja hanya bisa dikembalikan ke draft, bukan langsung aktif.
  // Konfigurasinya sudah lama tidak disentuh; melewati draft berarti tidak ada
  // kesempatan memeriksanya sebelum ia jadi kandidat di jalur publik.
  archived: [{ action: "deactivate", label: "Move back to draft" }],
};

/**
 * Status yang boleh dihapus. Cerminan penjaga di `delete_event`; kalau keduanya
 * berbeda pendapat yang menang adalah database, dan tombolnya di sini hanya
 * berhenti muncul untuk aksi yang pasti ditolak.
 */
const DELETABLE: EventStatus[] = ["draft", "archived"];

/** Nama tabel dari `delete_event` -> kata yang bisa dibaca panitia. */
const LABEL_HITUNGAN: Record<string, string> = {
  participants: "participants",
  booths: "booths",
  special_offers: "special items",
  registrations: "registrations",
  undian_prizes: "lucky-draw prizes",
  rundown_items: "agenda rows",
  seat_map_sessions: "seating plan sessions",
  audit_logs: "audit rows",
};

/** Aksi yang mengubah apa yang tampil di layar publik butuh konfirmasi. */
const CONFIRM_TEXT: Partial<Record<Action, string>> = {
  activate: "An active event becomes a candidate for public links without a slug (/display, /denah, /rundown). If more than one event is active, those old links ask the visitor to choose.",
  deactivate: "The event goes back to draft. Its public screens stop serving links without a slug, but all data and settings stay intact.",
  complete: "The event is marked as completed. No new orders are expected, but every report and history stays available.",
  archive: "The event is archived and leaves the main list. Its data is not deleted and it can be moved back to draft.",
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
  if (selisih > 1) return `In ${plural(selisih, "day")}`;
  if (selisih === 1) return "Tomorrow";
  if (selisih === 0) return "Today";
  if (selisih === -1) return "Yesterday";
  return `${plural(Math.abs(selisih), "day")} ago`;
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
  const hari = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: event.time_zone }).format(tanggal);
  // Bulan SAJA, tanpa tahun. "AGU 26" terbaca sebagai tanggal 26 Agustus oleh
  // siapa pun yang tidak diberi tahu bahwa 26 adalah tahunnya — dua angka di
  // satu tile, keduanya bisa jadi tanggal. Tahunnya tetap ada, satu baris di
  // sebelah kanan, di dalam tanggal lengkap yang tidak bisa disalahbaca.
  const bulan = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: event.time_zone }).format(tanggal);
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
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: event.time_zone,
  }).format(new Date(`${event.event_date}T12:00:00Z`));
}

/** Urutan yang bisa dipilih di toolbar. Semuanya dikerjakan di klien: daftar acara puluhan baris, bukan ribuan. */
const OPSI_URUT = [
  { value: "terdekat", label: "Nearest event date" },
  { value: "terbaru", label: "Latest date" },
  { value: "nama", label: `Name A${EN_DASH}Z` },
  { value: "diperbarui", label: "Last updated" },
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
        label={`Actions for ${event.name}`}
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
          <Popover anchor={menu} id={menuId} label={`Actions for ${event.name}`} width={240}>
            {/* Tujuan yang sama dengan klik baris, diulang di sini karena menu
                yang tidak memuat aksi utamanya memaksa orang menutupnya dulu
                sebelum bisa melakukan hal yang paling sering dilakukan. */}
            {tujuan ? (
              <Link href={tujuan} role="menuitem" className={item} onClick={() => setOpen(false)}>
                <ArrowRight size={16} className="text-on-surface-variant" /> Open dashboard
              </Link>
            ) : null}
            <a href={`/e/${event.slug}`} target="_blank" rel="noreferrer" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <ArrowSquareOut size={16} className="text-on-surface-variant" /> View public page
            </a>
            {/* Hanya saat pendaftaran memang terbuka. Menyalin tautan ke formulir
                yang tertutup berarti mengirim tamu ke halaman yang menolaknya. */}
            {event.registration_enabled ? (
              <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onSalinTautan(); }}>
                <CopySimple size={16} className="text-on-surface-variant" /> Copy registration link
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
              <CopySimple size={16} className="text-on-surface-variant" /> Duplicate event
            </button>
            <Link href={`/events/${event.id}/access`} role="menuitem" className={item} onClick={() => setOpen(false)}>
              <UsersThree size={16} className="text-on-surface-variant" /> Access
            </Link>
            {/* Hanya muncul untuk status yang memang bisa dihapus. Menampilkannya
                selalu lalu menolak dengan 422 membuat aturannya terbaca sebagai
                kerusakan, bukan sebagai batas yang disengaja. */}
            {DELETABLE.includes(event.status) ? (
              <>
                <div className="my-1.5 border-t border-outline-variant" />
                <button type="button" role="menuitem" className={POPOVER_ITEM_DANGER} onClick={() => { setOpen(false); onDelete(); }}>
                  <Trash size={16} /> Delete permanently
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
    if (!response) { setError("Connection failed. Reload the page."); setLoading(false); return; }
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.message ?? "Could not load the event list.");
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
      setError("Connection failed. Reload the page to see the actual status.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.details?.message ?? body.error?.message ?? `Action failed (${response.status}).`);
      return;
    }
    setConfirming(null);
    setEvents((current) => current.map((row) => (row.id === event.id ? body.event : row)));
    setNotice(`"${event.name}" is now ${EVENT_STATUS_LABEL[body.event.status as EventStatus]}.`);
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
    if (!response) { setError("Connection failed. Check the list before trying again; the copy may already exist."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.details?.message ?? body.error?.message ?? "Could not duplicate the event.");
      return;
    }
    setDuplicating(null);
    setEvents((current) => [body.event, ...current]);
    setNotice(`Copy "${body.event.name}" created as a draft. Participants, orders and lucky-draw winners were NOT copied.`);
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
      setError("Connection lost. Reload the page to see whether the event was deleted.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.details?.message ?? body.error?.message ?? "Could not delete the event.");
      return;
    }
    const hapus = (body.deleted ?? {}) as Record<string, number>;
    const rincian = Object.entries(hapus).filter(([, jumlah]) => jumlah > 0).map(([nama, jumlah]) => `${jumlah} ${LABEL_HITUNGAN[nama] ?? nama}`);
    setDeleting(null);
    setConfirmSlug("");
    setEvents((current) => current.filter((row) => row.id !== deleting.id));
    setNotice(`"${body.name}" deleted permanently${rincian.length > 0 ? `, with ${rincian.join(", ")}` : ", with no related data"}.`);
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
    if (!response) { setError("Connection failed. The event may not have been saved."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.message ?? "Could not create the event."); return; }
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
    setNotice(`Registration link for ${item.name} copied.`);
  }

  const baris = "group relative flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-surface";

  return <div lang="en" className="press min-h-dvh bg-surface text-on-surface">
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
        <nav aria-label="Workspace" className="ml-4 flex items-center gap-1">
          <Link href="/events" aria-current="page" className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--press-active)] px-2.5 text-body-medium font-medium text-on-surface">
            <CalendarDots size={16} /> Events
          </Link>
          <Link href="/users" className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-body-medium text-on-surface-variant hover:bg-[var(--press-hover)]">
            <ShieldCheck size={16} /> Users &amp; roles
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Search events (Ctrl K)" size="sm" onClick={() => kolomCari.current?.focus()}>
            <MagnifyingGlass size={18} />
          </IconButton>
          <UserMenu
            username={username}
            role={role}
            version={process.env.NEXT_PUBLIC_APP_VERSION}
            onLogout={() => void logout()}
            loggingOut={pending}
          />
        </div>
      </div>
    </header>

    <PageContainer center>
      <PageHeader
        title="Events"
        description="Manage every event and open its dashboard."
        actions={isOwner ? <Button onClick={bukaBuatEvent} icon={<Plus size={16} weight="bold" />} className="max-sm:w-full">Create event</Button> : undefined}
      />

      {error && !dialogTerbuka && <p role="alert" className="rounded-lg mb-4 border border-error-soft-outline bg-error-soft p-4 text-body-medium font-medium text-on-error-soft">{error}</p>}
      {notice && <p key={notice} role="status" className="rise-in-fast rounded-lg mb-4 border border-outline-variant bg-surface-container-lowest p-3 text-body-medium">{notice}</p>}

      {/* Toolbar: tab di kiri, cari dan urutan di kanan. Di layar sempit tab
          bergulir mendatar dan dua kontrol kanan turun ke baris kedua. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="m3-nav-scroll -mx-1 max-w-full overflow-x-auto px-1">
          <SegmentedButton<string>
            label="Filter by event status"
            value={tab}
            onChange={(nilai) => setQuery({ tab: nilai === "semua" ? null : nilai })}
            options={[
              { value: "semua", label: "All", badge: hitung.semua },
              { value: "active", label: "Active", badge: hitung.active },
              { value: "draft", label: "Draft", badge: hitung.draft },
              { value: "completed", label: "Completed", badge: hitung.completed },
              ...(hitung.archived > 0 ? [{ value: "archived", label: "Archived", badge: hitung.archived }] : []),
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
              placeholder="Search events…"
              aria-label="Search events"
              title="Searches event names and venues"
              className="h-9 w-full rounded-lg border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none transition-[border-color] duration-150 placeholder:text-on-surface-variant focus:border-primary"
            />
          </div>
          <SelectMenu
            kind="sort"
            label="Sort events"
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
        <div className="overflow-hidden rounded-[10px] border border-outline-variant bg-surface-container-lowest" aria-busy="true" aria-label="Loading events">
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
          title="No events yet"
          description={isOwner
            ? "Create your first event to start managing participants."
            : "There are no events you can open yet. Ask the system owner for access."}
          action={isOwner ? <Button onClick={bukaBuatEvent} icon={<Plus size={16} weight="bold" />}>Create event</Button> : undefined}
        />
      ) : terlihat.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass size={40} />}
          title={cari ? `No events match "${cari}"` : "No events in this tab"}
          description="Try another word, or choose a different tab."
          action={<Button variant="outlined" size="sm" onClick={() => setQuery({ q: null, tab: null })}>Reset search</Button>}
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
                  item.status === "active" ? (item.registration_enabled ? "Registration open" : "Registration closed") : null,
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
          <Button variant="outlined" disabled={pending} onClick={() => setConfirming(null)}>Cancel</Button>
          <Button loading={pending} onClick={() => { if (confirming) void runAction(confirming.event, confirming.action); }}>
            {confirming?.label ?? "Continue"}
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
      title="Delete permanently"
      description={deleting?.name}
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={() => setDeleting(null)}>Cancel</Button>
          <Button
            variant="danger"
            type="submit"
            form="hapus-event"
            loading={pending}
            disabled={deleting === null || confirmSlug.trim() !== deleting.slug}
          >Delete permanently</Button>
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
          This event&rsquo;s booths, participants, special items, registrations, agenda, seating plan, lucky-draw prizes and audit history are deleted from the database and cannot be restored. There is no backup inside the app.
          <span className="mt-2 block font-semibold">If you only want to hide it from the list, cancel and use Archive instead.</span>
        </p>
        <p className="mt-5 text-label-large font-semibold">Type the event slug to continue</p>
        <code className="rounded-lg mt-2 block select-all bg-surface-container px-3 py-2 font-mono text-body-medium">{deleting?.slug}</code>
        <TextField
          className="mt-3"
          label="Event slug"
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
      title={`Copy of “${duplicating?.name ?? ""}”`}
      description="The copy starts as a draft with no participants."
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={() => setDuplicating(null)}>Close</Button>
          <Button type="submit" form="duplikat-event" loading={pending}>Create copy as draft</Button>
        </>
      }
    >
      <form id="duplikat-event" onSubmit={(e) => { e.preventDefault(); void duplicate(new FormData(e.currentTarget)); }}>
        {/* Apa yang ikut dan apa yang tidak ditulis DI DEPAN, bukan setelah
            tombol ditekan. Salinan yang ternyata membawa 247 peserta acara lain
            baru ketahuan setelah ada yang memeriksa daftar peserta. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-container p-4"><p className="text-label-medium font-semibold ed-label">Copied</p><p className="mt-2 text-body-medium text-on-surface-variant">Booths, special items, settings, display settings, agenda, seating plan, lucky-draw prizes &amp; rules, organisation-name exclusions.</p></div>
          <div className="rounded-lg bg-surface-container p-4"><p className="text-label-medium font-semibold ed-label">Not copied</p><p className="mt-2 text-body-medium text-on-surface-variant">Participants, orders, lucky-draw winners, user access, and all history.</p></div>
        </div>

        {/* `key`: nilai bawaan nama mengikuti event yang sedang disalin. Tanpa
            key, React memakai ulang kolom dari salinan sebelumnya. */}
        <TextField key={duplicating?.id} className="mt-5" label="New event name" name="name" required minLength={3} maxLength={120} defaultValue={`${duplicating?.name ?? ""} (copy)`} />
        <TextField className={KOLOM} label="Date" name="event_date" type="date" optional />
        <TextField
          className={KOLOM}
          label="Scanner API slug"
          name="scanner_api_event_slug"
          optional
          placeholder="Leave empty if there is none yet"
          hint="Not copied on purpose. With the old slug, the copy would pull the previous event's participants every 5 minutes. Left empty, the participant source falls back to manual and can be changed any time."
        />
        {error ? <p role="alert" className="rounded-lg mt-3 border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
      </form>
    </Dialog>

    <Dialog
      open={creating}
      onClose={() => setCreating(false)}
      dismissible={!pending}
      size="lg"
      title="Create a draft event"
      description="A new event starts as a draft. Activate it once its settings and users are ready."
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={() => setCreating(false)}>Close</Button>
          <Button type="submit" form="buat-event" loading={pending}>Create draft event</Button>
        </>
      }
    >
      <form id="buat-event" onSubmit={submit}>
        <TextField className="mt-5" label="Event name" name="name" required minLength={3} maxLength={120} autoFocus />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label="Date" name="event_date" type="date" optional />
          <SelectField label="Time zone" name="time_zone" defaultValue="Asia/Jakarta">
            <option value="Asia/Jakarta">WIB</option>
            <option value="Asia/Makassar">WITA</option>
            <option value="Asia/Jayapura">WIT</option>
          </SelectField>
        </div>
        <fieldset className={KOLOM}>
          <legend className="text-label-large font-semibold">Where participants come from</legend>
          <p className="mt-1 text-body-small text-on-surface-variant">
            Adding participants one by one and importing from a spreadsheet are <strong>always available</strong>,
            whatever you choose below. Turn on only what you will use.
          </p>

          <div className="mt-4 space-y-4">
            <Switch
              checked={pakaiFormPublik}
              onChange={setPakaiFormPublik}
              label="Public registration"
              description="People fill in the form themselves on the event page, and their participant code is issued automatically."
            />
            <Switch
              checked={pakaiScanner}
              onChange={setPakaiScanner}
              label="Pull from Scanner API"
              description="The participant list syncs every 5 minutes from an outside system. Names, organisations and QR codes are managed there, not here."
            />
          </div>
        </fieldset>

        {/* Kolom slug lahir bersama sakelarnya. Selalu tampil, ia kolom yang
            tidak berarti apa-apa untuk mayoritas acara, dan wajib diisi untuk
            sebagian kecil, tanpa satu pun tanda mana yang sedang berlaku. */}
        {pakaiScanner ? (
          <TextField
            className={KOLOM}
            label="Scanner API slug"
            name="scanner_api_event_slug"
            required
            hint="This event's name in the Scanner API system. Without it, the sync does not know which participants to pull."
          />
        ) : null}
        <TextArea className={KOLOM} label="Description" name="description" maxLength={500} rows={3} optional />
        {error ? <p role="alert" className="rounded-lg mt-3 border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
      </form>
    </Dialog>
  </div>;
}
