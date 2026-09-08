"use client";

import { ArrowRight, CalendarDots, CopySimple, DotsThreeVertical, Plus, SignOut, Trash, UsersThree } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, ButtonLink, Dialog, EmptyState, IconButton, SelectField, Switch, TextArea, TextField } from "@/components/m3";
import { EVENT_STATUS_LABEL, type EventRow, type EventStatus, type ParticipantSource, type UserRole } from "@/lib/domain";
import { daysUntil } from "@/lib/event-datetime";
import { cx } from "@/lib/m3/cx";
import { MENU_MOTION } from "@/lib/m3/menu-motion";
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

/** Urutan kelompok di layar. Arsip terakhir dan tersembunyi secara bawaan. */
const URUTAN_STATUS: EventStatus[] = ["active", "draft", "completed", "archived"];

/** Warna teks status di baris meta. Selalu berpasangan dengan labelnya. */
const WARNA_STATUS: Record<EventStatus, string> = {
  active: "text-success",
  draft: "text-on-surface-variant",
  completed: "text-primary",
  archived: "text-on-surface-variant",
};

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
  if (!event.event_date) {
    return (
      <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-outline-variant text-on-surface-variant" aria-hidden>
        <CalendarDots size={22} />
      </div>
    );
  }
  const tanggal = new Date(`${event.event_date}T12:00:00Z`);
  const hari = new Intl.DateTimeFormat("id-ID", { day: "numeric", timeZone: event.time_zone }).format(tanggal);
  const bulan = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: event.time_zone }).format(tanggal);
  return (
    <time
      dateTime={event.event_date}
      className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-container-high text-on-surface"
    >
      <span className="text-title-large font-semibold leading-none tabular-nums">{hari}</span>
      <span className="mt-1 text-label-small uppercase leading-none tracking-[0.08em] text-on-surface-variant">{bulan}</span>
    </time>
  );
}

/** Menu ⋯ per baris. Hanya super_admin yang melihatnya. */
function MenuAcara({
  event,
  disabled,
  onAction,
  onDuplicate,
  onDelete,
}: {
  event: EventRow;
  disabled: boolean;
  onAction: (action: Action, label: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wadah = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      wadah.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!wadah.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const item = "m3-state flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-label-large font-semibold";

  return (
    <div ref={wadah} className="relative">
      <IconButton
        label={`Aksi untuk ${event.name}`}
        size="sm"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <DotsThreeVertical size={20} weight="bold" />
      </IconButton>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={`Aksi untuk ${event.name}`}
            className="absolute right-0 top-[calc(100%+4px)] z-50 w-60 origin-top-right rounded-2xl border border-outline-variant bg-surface-container-high p-2 shadow-level2"
            {...MENU_MOTION}
          >
            {ACTIONS[event.status].map((entry) => (
              <button
                key={entry.action}
                type="button"
                role="menuitem"
                className={cx(item, entry.danger && "text-error")}
                onClick={() => { setOpen(false); onAction(entry.action, entry.label); }}
              >
                {entry.label}
              </button>
            ))}
            <div className="my-2 border-t border-outline-variant" />
            <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onDuplicate(); }}>
              <CopySimple size={18} /> Duplikat
            </button>
            <Link href={`/events/${event.id}/access`} role="menuitem" className={item} onClick={() => setOpen(false)}>
              <UsersThree size={18} /> Hak akses
            </Link>
            {/* Hanya muncul untuk status yang memang bisa dihapus. Menampilkannya
                selalu lalu menolak dengan 422 membuat aturannya terbaca sebagai
                kerusakan, bukan sebagai batas yang disengaja. */}
            {DELETABLE.includes(event.status) ? (
              <>
                <div className="my-2 border-t border-outline-variant" />
                <button type="button" role="menuitem" className={cx(item, "text-error")} onClick={() => { setOpen(false); onDelete(); }}>
                  <Trash size={18} /> Hapus permanen
                </button>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  // Peran dibaca sekali: menentukan tujuan tombol Buka dan apakah menu ⋯
  // tampil. Membuat, mengubah status, menduplikasi, dan mengatur hak akses
  // adalah kewenangan super_admin saja — endpoint-nya memakai
  // requireUser(["super_admin"]), jadi tombolnya pun hanya untuk mereka.
  const [role, setRole] = useState<UserRole | null>(null);
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
  const [tampilArsip, setTampilArsip] = useState(false);
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
      .then(async (r) => { if (r.ok) setRole(((await r.json()).user?.role as UserRole | undefined) ?? null); })
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

  const kelompok = URUTAN_STATUS.map((status) => ({ status, daftar: events.filter((item) => item.status === status) }));
  const jumlahArsip = kelompok.find((grup) => grup.status === "archived")?.daftar.length ?? 0;

  return <main className="min-h-dvh bg-surface px-5 py-6 text-on-surface sm:px-8 lg:py-8">
    <div className="mx-auto max-w-[1200px]">
      {/* Satu judul, satu baris. Eyebrow dan kalimat penjelasan dihapus: ini
          halaman yang dibuka setiap hari, dan penjelasannya pindah ke keadaan
          kosong — satu-satunya saat orang butuh dijelaskan. */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant pb-5">
        <h1 className="text-headline-medium font-semibold tracking-tight">Acara</h1>
        <div className="flex gap-2">
          {isOwner && <Button onClick={bukaBuatEvent} icon={<Plus size={18} weight="bold" />}>Buat event</Button>}
          <Button variant="outlined" onClick={() => void logout()} icon={<SignOut size={18} />}>Keluar</Button>
        </div>
      </header>

      {error && !dialogTerbuka && <p role="alert" className="rounded-lg mt-5 border border-error-soft-outline bg-error-soft p-4 text-body-medium font-medium text-on-error-soft">{error}</p>}
      {notice && <p key={notice} role="status" className="rise-in-fast rounded-lg mt-5 bg-surface-container p-4 text-body-medium font-medium">{notice}</p>}

      {loading ? (
        // Kerangka seukuran baris sungguhan, bukan teks "Memuat…": daftar
        // tidak melompat tingginya saat data tiba.
        <ul className="mt-6 divide-y divide-outline-variant rounded-lg bg-panel" aria-busy="true" aria-label="Memuat acara">
          {[0, 1, 2].map((index) => <li key={index} aria-hidden className="flex items-center gap-4 p-4">
            <span className="size-14 shrink-0 rounded-lg bg-surface-container-highest shimmer" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="block h-4 w-2/5 rounded-xs bg-surface-container-highest shimmer" />
              <span className="block h-3 w-3/5 rounded-xs bg-surface-container-highest shimmer" />
            </span>
            <span className="h-10 w-20 shrink-0 rounded-md bg-surface-container-highest shimmer" />
          </li>)}
        </ul>
      ) : events.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CalendarDots size={48} />}
          title="Belum ada acara"
          description={isOwner
            ? "Setiap acara punya peserta, halaman acara, layar panggung, transaksi booth, dan konfigurasi terpisah. Buat acara pertama untuk mulai menyiapkannya."
            : "Belum ada acara yang bisa Anda buka. Minta pemilik sistem memberi hak akses."}
          action={isOwner ? <Button onClick={bukaBuatEvent} icon={<Plus size={18} weight="bold" />}>Buat event</Button> : undefined}
        />
      ) : (
        <>
          {kelompok.map(({ status, daftar }) => {
            if (daftar.length === 0) return null;
            if (status === "archived" && !tampilArsip) return null;
            const judulId = `grup-${status}`;
            return (
              <section key={status} className="mt-6" aria-labelledby={judulId}>
                <h2 id={judulId} className="px-1 text-label-medium font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
                  {EVENT_STATUS_LABEL[status]} · {daftar.length}
                </h2>
                {/* Tanpa `overflow-hidden` pada <ul>: menu ⋯ tiap baris
                    menjulur keluar barisnya, dan pembungkus yang memotong
                    akan menyembunyikan menunya. Sudut membulat baris pertama
                    dan terakhir diatur lewat selektor anak. */}
                <ul className="mt-2 divide-y divide-outline-variant rounded-lg bg-panel [&>li:first-child]:rounded-t-lg [&>li:last-child]:rounded-b-lg">
                  {daftar.map((item) => {
                    const alasan = role ? alasanTidakBisaBuka(role, item.status) : null;
                    const bisaBuka = role !== null && alasan === null;
                    const tujuan = role ? roleHome(role, item.slug) : "#";
                    const mundur = item.status === "active" ? hitungMundur(item.event_date, sekarang) : null;
                    return (
                      <li key={item.id} className="relative flex items-center gap-4 p-4 transition-colors duration-150 ease-standard hover:bg-panel-high sm:px-5">
                        <BlokTanggal event={item} />

                        <div className="min-w-0 flex-1">
                          {/* Nama adalah tautan yang DIREGANGKAN menutupi seluruh
                              baris (`after:absolute after:inset-0`), jadi klik di
                              mana pun membuka acaranya. Tombol di kanan duduk di
                              atasnya lewat `z-10`. Tanpa peran, atau bila peran
                              lapangan tidak boleh masuk, nama tetap teks. */}
                          {bisaBuka ? (
                            <Link
                              href={tujuan}
                              className="text-title-medium font-semibold text-on-surface after:absolute after:inset-0 after:rounded-lg after:content-['']"
                            >
                              {item.name}
                            </Link>
                          ) : (
                            <p className="text-title-medium font-semibold text-on-surface">{item.name}</p>
                          )}
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-small text-on-surface-variant">
                            <span className={cx("inline-flex items-center gap-1.5 font-semibold", WARNA_STATUS[item.status])}>
                              <span aria-hidden className="size-1.5 rounded-full bg-current" />
                              {EVENT_STATUS_LABEL[item.status]}
                            </span>
                            {mundur ? <span>· {mundur}</span> : null}
                            {item.venue_name ? <span className="truncate">· {item.venue_name}</span> : null}
                            {item.status === "active" ? <span>· {item.registration_enabled ? "Pendaftaran dibuka" : "Pendaftaran ditutup"}</span> : null}
                          </p>
                        </div>

                        <div className="relative z-10 flex shrink-0 items-center gap-1">
                          {bisaBuka ? (
                            <ButtonLink
                              href={tujuan}
                              variant={item.status === "active" ? "tonal" : "outlined"}
                              size="sm"
                              trailingIcon={<ArrowRight size={16} weight="bold" />}
                            >
                              Buka
                            </ButtonLink>
                          ) : alasan ? (
                            <span className="px-2 text-label-large font-semibold text-on-surface-variant">{alasan}</span>
                          ) : null}
                          {isOwner ? (
                            <MenuAcara
                              event={item}
                              disabled={pending}
                              onAction={(action, label) => setConfirming({ event: item, action, label })}
                              onDuplicate={() => { setDuplicating(item); setError(""); setNotice(""); }}
                              onDelete={() => { setDeleting(item); setConfirmSlug(""); setError(""); setNotice(""); }}
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {jumlahArsip > 0 ? (
            <div className="mt-6">
              <Button variant="text" size="sm" onClick={() => setTampilArsip((current) => !current)}>
                {tampilArsip ? "Sembunyikan arsip" : `Tampilkan arsip (${jumlahArsip})`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>

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
          <div className="rounded-lg bg-surface-container p-4"><p className="text-label-medium font-semibold uppercase tracking-[0.14em]">Ikut disalin</p><p className="mt-2 text-body-medium text-on-surface-variant">Booth, item spesial, pengaturan, tampilan display, rundown, denah, hadiah &amp; aturan undian, diskualifikasi berbasis nama perusahaan.</p></div>
          <div className="rounded-lg bg-surface-container p-4"><p className="text-label-medium font-semibold uppercase tracking-[0.14em]">Tidak disalin</p><p className="mt-2 text-body-medium text-on-surface-variant">Peserta, transaksi, pemenang undian, hak akses pengguna, dan seluruh riwayat.</p></div>
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
  </main>;
}
