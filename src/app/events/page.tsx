"use client";

import { CalendarDots, CopySimple, Plus, SignOut, Storefront, Trash, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { EventRow, ParticipantSource } from "@/lib/domain";

const statusLabel = { draft: "Draft", active: "Aktif", completed: "Selesai", archived: "Arsip" } as const;

type Action = "activate" | "deactivate" | "complete" | "archive";

/**
 * Aksi yang tersedia per status. Menyembunyikan aksi yang tidak berlaku lebih
 * baik daripada menampilkannya lalu menolak: tombol yang selalu gagal terbaca
 * sebagai sistem rusak, bukan sebagai aturan.
 */
const ACTIONS: Record<EventRow["status"], Array<{ action: Action; label: string; danger?: boolean }>> = {
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
const DELETABLE: EventRow["status"][] = ["draft", "archived"];

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

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  // Membuat, mengubah status, menduplikasi, dan mengatur hak akses event adalah
  // kewenangan super_admin saja -- keempat endpoint-nya memakai
  // requireUser(["super_admin"]). Halaman ini dulu menampilkannya ke semua role,
  // padahal login mendorong booth dan kasir ke sini juga: mereka melihat empat
  // tombol yang pasti membalas 403. Tombol yang selalu gagal terbaca sebagai
  // sistem rusak, bukan sebagai batas kewenangan.
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<EventRow | null>(null);
  const [confirming, setConfirming] = useState<{ event: EventRow; action: Action; label: string } | null>(null);
  // Dipisahkan dari `confirming`: penghapusan tidak dapat dibatalkan, jadi
  // dialognya menuntut slug diketik ulang dan tidak boleh ikut memakai dialog
  // konfirmasi biasa yang cukup satu klik.
  const [deleting, setDeleting] = useState<EventRow | null>(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [pending, setPending] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  async function load() {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => { if (r.ok) setIsOwner((await r.json()).user?.role === "super_admin"); })
      .catch(() => null);
    const response = await fetch("/api/events").catch(() => null);
    if (!response) { setError("Koneksi gagal. Muat ulang halaman."); setLoading(false); return; }
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.message ?? "Daftar event gagal dimuat.");
    else setEvents(body.events ?? []);
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
    setNotice(`"${event.name}" sekarang berstatus ${statusLabel[body.event.status as EventRow["status"]]}.`);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const participantSource = String(form.get("participant_source")) as ParticipantSource;
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

  return <main className="min-h-dvh bg-surface px-5 py-6 text-on-surface sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1200px]">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-outline-variant pb-6">
        <div><p className="text-body-small font-semibold uppercase tracking-[0.18em] text-primary">Tally workspace</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">Pilih event.</h1><p className="mt-2 text-body-medium text-on-surface-variant">Setiap event punya transaksi, peserta, booth, display, dan konfigurasi terpisah.</p></div>
        <div className="flex gap-2">{isOwner && <button onClick={() => setCreating(true)} className="rounded-md flex min-h-11 items-center gap-2 bg-primary px-4 text-body-medium font-semibold text-on-primary"><Plus size={18} weight="bold" /> Buat event</button>}<button type="button" onClick={() => void logout()} className="rounded-md flex min-h-11 items-center gap-2 border border-outline-variant px-4 text-body-medium font-semibold"><SignOut size={18} /> Keluar</button></div>
      </header>

      {error && <p role="alert" className="rounded-lg mt-5 border border-error/30 bg-error/5 p-4 text-body-medium font-medium text-error">{error}</p>}
      {notice && <p role="status" className="rounded-lg mt-5 border border-outline-variant bg-panel-high p-4 text-body-medium font-medium">{notice}</p>}
      {loading ? <p className="py-16 text-body-medium text-on-surface-variant">Memuat event…</p> : events.length === 0 ? <section className="py-20 text-center"><CalendarDots size={48} className="mx-auto text-on-surface-variant" /><h2 className="mt-4 text-xl font-semibold">Belum ada event</h2><p className="mt-2 text-body-medium text-on-surface-variant">Buat event pertama untuk mulai menyiapkan workspace.</p></section> : <section className="mt-8 grid gap-4 md:grid-cols-2">
        {events.map((item) => <article key={item.id} className="rounded-lg flex flex-col bg-panel p-6">
          <div className="flex items-start justify-between gap-4"><span className="rounded-sm border border-outline-variant px-2 py-1 text-[11px] font-semibold uppercase tracking-wider">{statusLabel[item.status]}</span><Storefront size={22} className="text-primary" /></div>
          <h2 className="mt-8 text-xl font-semibold tracking-[-0.03em]">{item.name}</h2>
          <p className="mt-2 text-body-medium text-on-surface-variant">{item.event_date ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: item.time_zone }).format(new Date(`${item.event_date}T12:00:00Z`)) : "Tanggal belum ditentukan"}</p>
          <Link href={`/e/${item.slug}`} className="mt-5 text-body-small font-semibold uppercase tracking-[0.14em] text-primary">Buka workspace →</Link>

          {isOwner && <div className="mt-6 flex flex-wrap gap-2 border-t border-outline-variant pt-4">
            {ACTIONS[item.status].map((entry) => <button
              key={entry.action}
              type="button"
              disabled={pending}
              onClick={() => setConfirming({ event: item, action: entry.action, label: entry.label })}
              className={`rounded-md min-h-11 border px-3 text-body-medium font-semibold disabled:opacity-50 ${entry.danger ? "border-error/40 text-error" : "border-outline-variant"}`}
            >{entry.label}</button>)}
            <button
              type="button"
              disabled={pending}
              onClick={() => { setDuplicating(item); setError(""); setNotice(""); }}
              className="rounded-md flex min-h-11 items-center gap-2 border border-outline-variant px-3 text-body-medium font-semibold disabled:opacity-50"
            ><CopySimple size={16} /> Duplikat</button>
            <Link href={`/events/${item.id}/access`} className="rounded-md flex min-h-11 items-center gap-2 border border-outline-variant px-3 text-body-medium font-semibold"><UsersThree size={16} /> Hak akses</Link>
            {/* Hanya muncul untuk status yang memang bisa dihapus. Menampilkannya
                selalu lalu menolak dengan 422 membuat aturannya terbaca sebagai
                kerusakan, bukan sebagai batas yang disengaja. */}
            {DELETABLE.includes(item.status) && <button
              type="button"
              disabled={pending}
              onClick={() => { setDeleting(item); setConfirmSlug(""); setError(""); setNotice(""); }}
              className="rounded-md flex min-h-11 items-center gap-2 border border-error/40 px-3 text-body-medium font-semibold text-error disabled:opacity-50"
            ><Trash size={16} /> Hapus permanen</button>}
          </div>}
        </article>)}
      </section>}
    </div>

    {confirming && <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirming(null); }}><div className="rounded-lg w-full max-w-md border border-outline-variant bg-panel p-6">
      <h2 className="text-xl font-semibold">{confirming.label}</h2>
      <p className="mt-2 text-body-medium text-on-surface-variant">{confirming.event.name}</p>
      {/* Isi dialog menulis AKIBATnya, bukan sekadar "yakin?". */}
      <p className="rounded-lg mt-4 border border-outline-variant bg-panel-high p-4 text-body-medium">{CONFIRM_TEXT[confirming.action]}</p>
      <div className="mt-6 flex gap-2">
        <button type="button" disabled={pending} onClick={() => void runAction(confirming.event, confirming.action)} className="rounded-md min-h-12 flex-1 bg-primary px-4 font-semibold text-on-primary disabled:opacity-50">{pending ? "Memproses…" : confirming.label}</button>
        <button type="button" onClick={() => setConfirming(null)} className="rounded-md min-h-12 border border-outline-variant px-4 font-semibold">Batal</button>
      </div>
    </div></div>}

    {deleting && <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleting(null); }}><form onSubmit={(e) => { e.preventDefault(); void remove(); }} className="rounded-lg w-full max-w-md border border-outline-variant bg-panel p-6">
      <h2 className="text-xl font-semibold text-error">Hapus permanen</h2>
      <p className="mt-2 text-body-medium text-on-surface-variant">{deleting.name}</p>
      {/* Yang ditulis adalah APA yang hilang dan APA gantinya, bukan "tindakan
          ini tidak dapat dibatalkan" -- kalimat itu ada di setiap dialog hapus
          di dunia dan sudah berhenti dibaca. Arsipkan disebut sebagai jalan
          keluar karena itulah yang sebenarnya dibutuhkan sebagian besar orang
          yang sampai ke dialog ini. */}
      <p className="rounded-lg mt-4 border border-error/30 bg-error/5 p-4 text-body-medium leading-6">
        Booth, peserta, item spesial, pendaftaran, rundown, denah, hadiah undian, dan riwayat audit event ini dihapus dari database dan tidak dapat dikembalikan. Tidak ada cadangan di dalam aplikasi.
        <span className="mt-2 block font-semibold">Kalau yang Anda inginkan hanya menyembunyikannya dari daftar, batalkan lalu pakai Arsipkan.</span>
      </p>
      <label className="mt-5 block text-body-medium font-semibold">Ketik slug event untuk melanjutkan
        <code className="rounded-lg mt-2 block select-all bg-panel-high px-3 py-2 font-mono text-body-medium">{deleting.slug}</code>
        <input
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4 font-mono"
        />
      </label>
      <div className="mt-6 flex gap-2">
        <button
          disabled={pending || confirmSlug.trim() !== deleting.slug}
          className="rounded-md min-h-12 flex-1 bg-error px-4 font-semibold text-on-error disabled:opacity-40"
        >{pending ? "Menghapus…" : "Hapus permanen"}</button>
        <button type="button" onClick={() => setDeleting(null)} className="rounded-md min-h-12 border border-outline-variant px-4 font-semibold">Batal</button>
      </div>
    </form></div>}

    {duplicating && <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDuplicating(null); }}><form onSubmit={(e) => { e.preventDefault(); void duplicate(new FormData(e.currentTarget)); }} className="rounded-lg max-h-[90dvh] w-full max-w-xl overflow-y-auto border border-outline-variant bg-panel p-6 sm:p-8">
      <div className="flex justify-between gap-4"><div><p className="text-body-small font-semibold uppercase tracking-[0.16em] text-primary">Duplikat event</p><h2 className="mt-2 text-headline-small font-semibold">Salin dari &ldquo;{duplicating.name}&rdquo;</h2></div><button type="button" onClick={() => setDuplicating(null)} className="min-h-11 px-3 text-body-medium font-semibold">Tutup</button></div>

      {/* Apa yang ikut dan apa yang tidak ditulis DI DEPAN, bukan setelah
          tombol ditekan. Salinan yang ternyata membawa 247 peserta acara lain
          baru ketahuan setelah ada yang memeriksa daftar peserta. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-panel-high p-4"><p className="text-body-small font-semibold uppercase tracking-wider">Ikut disalin</p><p className="mt-2 text-body-medium text-on-surface-variant">Booth, item spesial, pengaturan, tampilan display, rundown, denah, hadiah &amp; aturan undian, diskualifikasi berbasis nama perusahaan.</p></div>
        <div className="rounded-lg bg-panel-high p-4"><p className="text-body-small font-semibold uppercase tracking-wider">Tidak disalin</p><p className="mt-2 text-body-medium text-on-surface-variant">Peserta, transaksi, pemenang undian, hak akses pengguna, dan seluruh riwayat. Salinan mulai kosong sebagai draft.</p></div>
      </div>

      <label className="mt-6 block text-body-medium font-semibold">Nama event baru<input required minLength={3} maxLength={120} name="name" defaultValue={`${duplicating.name} (salinan)`} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4" /></label>
      <label className="mt-4 block text-body-medium font-semibold">Tanggal<input type="date" name="event_date" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4" /></label>
      <label className="mt-4 block text-body-medium font-semibold">Slug Scanner API
        <input name="scanner_api_event_slug" placeholder="Kosongkan bila belum ada" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4" />
        <span className="mt-2 block text-body-medium font-normal text-on-surface-variant">Sengaja tidak diwarisi. Diisi dengan slug lama, salinan akan menarik peserta acara sebelumnya setiap 5 menit. Dikosongkan, sumber peserta turun ke manual dan bisa diubah kapan saja.</span>
      </label>
      <button disabled={pending} className="rounded-md mt-6 min-h-12 w-full bg-primary px-5 font-semibold text-on-primary disabled:opacity-50">{pending ? "Menyalin…" : "Buat salinan sebagai draft"}</button>
    </form></div>}

    {creating && <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}><form onSubmit={submit} className="rounded-lg max-h-[90dvh] w-full max-w-xl overflow-y-auto border border-outline-variant bg-panel p-6 sm:p-8">
      <div className="flex justify-between gap-4"><div><p className="text-body-small font-semibold uppercase tracking-[0.16em] text-primary">Event baru</p><h2 className="mt-2 text-headline-small font-semibold">Buat workspace draft</h2></div><button type="button" onClick={() => setCreating(false)} className="min-h-11 px-3 text-body-medium font-semibold">Tutup</button></div>
      <label className="mt-6 block text-body-medium font-semibold">Nama event<input required minLength={3} maxLength={120} name="name" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4" /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-body-medium font-semibold">Tanggal<input type="date" name="event_date" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4" /></label><label className="text-body-medium font-semibold">Zona waktu<select name="time_zone" defaultValue="Asia/Jakarta" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4"><option value="Asia/Jakarta">WIB</option><option value="Asia/Makassar">WITA</option><option value="Asia/Jayapura">WIT</option></select></label></div>
      <label className="mt-4 block text-body-medium font-semibold">Sumber peserta<select name="participant_source" defaultValue="manual" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4"><option value="manual">Manual / impor</option><option value="scanner_api">Scanner API</option><option value="public_form">Form registrasi publik</option><option value="hybrid">Gabungan</option></select></label>
      <label className="mt-4 block text-body-medium font-semibold">Slug Scanner API <span className="font-normal text-on-surface-variant">(wajib untuk API/hybrid)</span><input name="scanner_api_event_slug" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4" /></label>
      <label className="mt-4 block text-body-medium font-semibold">Deskripsi<textarea name="description" maxLength={500} rows={3} className="rounded-lg mt-2 w-full border border-outline-variant bg-surface p-4" /></label>
      <button disabled={pending} className="rounded-md mt-6 min-h-12 w-full bg-primary px-5 font-semibold text-on-primary disabled:opacity-50">{pending ? "Membuat…" : "Buat event draft"}</button>
    </form></div>}
  </main>;
}