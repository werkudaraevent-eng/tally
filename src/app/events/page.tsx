"use client";

import { CalendarDots, Plus, SignOut, Storefront } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { EventRow, ParticipantSource } from "@/lib/domain";

const statusLabel = { draft: "Draft", active: "Aktif", completed: "Selesai", archived: "Arsip" } as const;

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  async function load() {
    const response = await fetch("/api/events").catch(() => null);
    if (!response) { setError("Koneksi gagal. Muat ulang halaman."); setLoading(false); return; }
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.message ?? "Daftar event gagal dimuat.");
    else setEvents(body.events ?? []);
    setLoading(false);
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

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1200px]">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--line)] pb-6">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Tally workspace</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">Pilih event.</h1><p className="mt-2 text-sm text-[var(--ink-muted)]">Setiap event punya transaksi, peserta, booth, display, dan konfigurasi terpisah.</p></div>
        <div className="flex gap-2"><button onClick={() => setCreating(true)} className="flex min-h-11 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-semibold text-white"><Plus size={18} weight="bold" /> Buat event</button><button type="button" onClick={() => void logout()} className="flex min-h-11 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold"><SignOut size={18} /> Keluar</button></div>
      </header>

      {error && <p role="alert" className="mt-5 border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm font-medium text-[var(--danger)]">{error}</p>}
      {loading ? <p className="py-16 text-sm text-[var(--ink-muted)]">Memuat event…</p> : events.length === 0 ? <section className="py-20 text-center"><CalendarDots size={48} className="mx-auto text-[var(--ink-muted)]" /><h2 className="mt-4 text-xl font-semibold">Belum ada event</h2><p className="mt-2 text-sm text-[var(--ink-muted)]">Buat event pertama untuk mulai menyiapkan workspace.</p></section> : <section className="mt-8 grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-2">
        {events.map((item) => <Link key={item.id} href={`/e/${item.slug}`} className="group bg-[var(--surface)] p-6 transition-colors hover:bg-[var(--surface-muted)]">
          <div className="flex items-start justify-between gap-4"><span className="border border-[var(--line)] px-2 py-1 text-[11px] font-semibold uppercase tracking-wider">{statusLabel[item.status]}</span><Storefront size={22} className="text-[var(--brand)]" /></div>
          <h2 className="mt-8 text-xl font-semibold tracking-[-0.03em]">{item.name}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{item.event_date ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: item.time_zone }).format(new Date(`${item.event_date}T12:00:00Z`)) : "Tanggal belum ditentukan"}</p>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">Buka workspace →</p>
        </Link>)}
      </section>}
    </div>

    {creating && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}><form onSubmit={submit} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
      <div className="flex justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Event baru</p><h2 className="mt-2 text-2xl font-semibold">Buat workspace draft</h2></div><button type="button" onClick={() => setCreating(false)} className="min-h-11 px-3 text-sm font-semibold">Tutup</button></div>
      <label className="mt-6 block text-sm font-semibold">Nama event<input required minLength={3} maxLength={120} name="name" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-4" /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Tanggal<input type="date" name="event_date" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-4" /></label><label className="text-sm font-semibold">Zona waktu<select name="time_zone" defaultValue="Asia/Jakarta" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-4"><option value="Asia/Jakarta">WIB</option><option value="Asia/Makassar">WITA</option><option value="Asia/Jayapura">WIT</option></select></label></div>
      <label className="mt-4 block text-sm font-semibold">Sumber peserta<select name="participant_source" defaultValue="manual" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-4"><option value="manual">Manual / impor</option><option value="scanner_api">Scanner API</option><option value="public_form">Form registrasi publik</option><option value="hybrid">Gabungan</option></select></label>
      <label className="mt-4 block text-sm font-semibold">Slug Scanner API <span className="font-normal text-[var(--ink-muted)]">(wajib untuk API/hybrid)</span><input name="scanner_api_event_slug" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-4" /></label>
      <label className="mt-4 block text-sm font-semibold">Deskripsi<textarea name="description" maxLength={500} rows={3} className="mt-2 w-full border border-[var(--line)] bg-[var(--background)] p-4" /></label>
      <button disabled={pending} className="mt-6 min-h-12 w-full bg-[var(--brand)] px-5 font-semibold text-white disabled:opacity-50">{pending ? "Membuat…" : "Buat event draft"}</button>
    </form></div>}
  </main>;
}