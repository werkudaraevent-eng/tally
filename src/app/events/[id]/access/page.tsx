"use client";

import { ArrowLeft, ShieldCheck, Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Role = "booth" | "cashier" | "admin";
type AccessRow = { user_id: string; role: Role; booth_id: number | null; granted_at: string };
type UserRow = { id: string; username: string; role: string; is_active: boolean };
type BoothRow = { id: number; code: string; name: string };
type EventInfo = { id: string; name: string; slug: string; status: string };

const roleLabel: Record<Role, string> = { booth: "Admin Booth", cashier: "Kasir", admin: "Panitia / Admin" };

export default function EventAccessPage() {
  const eventId = String(useParams().id ?? "");
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [booths, setBooths] = useState<BoothRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<Role>("cashier");

  const load = useCallback(async () => {
    const response = await fetch(`/api/events/${eventId}/access`, { cache: "no-store" }).catch(() => null);
    if (!response) { setError("Koneksi gagal. Muat ulang halaman."); setLoading(false); return; }
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.details?.message ?? body.error?.message ?? "Daftar akses gagal dimuat.");
    else { setEvent(body.event); setAccess(body.access ?? []); setUsers(body.users ?? []); setBooths(body.booths ?? []); }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function grant(form: FormData) {
    setPending(true); setError(""); setNotice("");
    const nextRole = String(form.get("role")) as Role;
    const boothValue = String(form.get("booth_id") ?? "");
    const response = await fetch(`/api/events/${eventId}/access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: form.get("user_id"),
        role: nextRole,
        booth_id: nextRole === "booth" && boothValue ? Number(boothValue) : null,
      }),
    }).catch(() => null);
    setPending(false);
    if (!response) { setError("Koneksi gagal. Muat ulang untuk melihat status sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.details?.message ?? body.error?.message ?? "Akses gagal disimpan."); return; }
    setAccess((rows) => [...rows.filter((row) => row.user_id !== body.access.user_id), body.access]);
    setNotice("Akses tersimpan.");
  }

  async function revoke(row: AccessRow, username: string) {
    setPending(true); setError(""); setNotice("");
    const response = await fetch(`/api/events/${eventId}/access`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: row.user_id }),
    }).catch(() => null);
    setPending(false);
    if (!response) { setError("Koneksi gagal. Muat ulang untuk melihat status sebenarnya."); return; }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error?.details?.message ?? body.error?.message ?? "Akses gagal dicabut.");
      return;
    }
    setAccess((rows) => rows.filter((entry) => entry.user_id !== row.user_id));
    setNotice(`Akses "${username}" dicabut. Sesi yang sedang terbuka akan ditolak pada permintaan berikutnya.`);
  }

  const named = (id: string) => users.find((user) => user.id === id)?.username ?? id;
  const boothLabel = (id: number | null) => {
    if (id === null) return "—";
    const booth = booths.find((entry) => entry.id === id);
    return booth ? `${booth.code} · ${booth.name}` : `#${id}`;
  };
  // super_admin sengaja tidak muncul: sudah punya akses semua event tanpa baris.
  const grantable = users.filter((user) => user.role !== "super_admin" && user.is_active);

  return <main className="min-h-dvh bg-surface px-5 py-6 text-on-surface sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1100px]">
      <Link href="/events" className="inline-flex items-center gap-2 text-body-medium font-semibold text-on-surface-variant"><ArrowLeft size={16} /> Daftar event</Link>
      <header className="mt-4 border-b border-outline-variant pb-6">
        <p className="text-body-small font-semibold uppercase tracking-[0.18em] text-primary">Hak akses event</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{event?.name ?? "Memuat…"}</h1>
        <p className="mt-2 text-body-medium text-on-surface-variant">Tanpa baris di sini, hanya super admin yang bisa membuka event ini. Peran disimpan per event — seseorang bisa jadi kasir di sini dan admin booth di event lain.</p>
      </header>

      {error && <p role="alert" className="rounded-lg mt-5 border border-error/30 bg-error/5 p-4 text-body-medium font-medium text-error">{error}</p>}
      {notice && <p role="status" className="rounded-lg mt-5 border border-outline-variant bg-panel-high p-4 text-body-medium font-medium">{notice}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <h2 className="text-body-medium font-semibold uppercase tracking-wider">Punya akses ({access.length})</h2>
          {loading ? <p className="py-10 text-body-medium text-on-surface-variant">Memuat…</p>
            : access.length === 0 ? <p className="rounded-lg mt-4 border border-outline-variant bg-panel-high p-6 text-body-medium text-on-surface-variant">Belum ada. Operator booth dan kasir tidak akan bisa login ke event ini sampai didaftarkan.</p>
            : <ul className="mt-4 grid gap-3">
              {access.map((row) => <li key={row.user_id} className="rounded-lg flex flex-wrap items-center justify-between gap-3 bg-panel p-4">
                <div>
                  <p className="font-semibold">{named(row.user_id)}</p>
                  <p className="mt-1 text-body-medium text-on-surface-variant">{roleLabel[row.role]}{row.role === "booth" && ` · ${boothLabel(row.booth_id)}`}</p>
                </div>
                <button type="button" disabled={pending} onClick={() => void revoke(row, named(row.user_id))} className="rounded-md flex min-h-11 items-center gap-2 border border-error/40 px-3 text-body-medium font-semibold text-error disabled:opacity-50"><Trash size={16} /> Cabut</button>
              </li>)}
            </ul>}
        </section>

        <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void grant(new FormData(e.currentTarget)); }} className="rounded-lg h-fit border border-outline-variant bg-panel p-6">
          <h2 className="flex items-center gap-2 text-body-medium font-semibold uppercase tracking-wider"><ShieldCheck size={18} className="text-primary" /> Beri akses</h2>
          <label className="mt-5 block text-body-medium font-semibold">User<select required name="user_id" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3">
            <option value="">Pilih user…</option>
            {grantable.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
          </select></label>
          <label className="mt-4 block text-body-medium font-semibold">Peran di event ini<select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3">
            <option value="booth">Admin Booth</option>
            <option value="cashier">Kasir</option>
            <option value="admin">Panitia / Admin</option>
          </select></label>
          {role === "booth" && <label className="mt-4 block text-body-medium font-semibold">Booth
            <select required name="booth_id" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3">
              <option value="">Pilih booth…</option>
              {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
            </select>
            {booths.length === 0 && <span className="mt-2 block text-body-medium font-normal text-error">Event ini belum punya booth. Tambahkan booth dulu di workspace event.</span>}
          </label>}
          <p className="rounded-lg mt-4 border border-outline-variant bg-panel-high p-3 text-body-medium text-on-surface-variant">Memberi akses ke user yang sudah terdaftar akan menimpa peran lamanya di event ini.</p>
          <button disabled={pending} className="rounded-md mt-5 min-h-12 w-full bg-primary px-4 font-semibold text-on-primary disabled:opacity-50">{pending ? "Menyimpan…" : "Simpan akses"}</button>
          <p className="mt-4 text-body-medium text-on-surface-variant">Super admin tidak muncul di daftar — mereka sudah punya akses ke semua event tanpa perlu didaftarkan.</p>
        </form>
      </div>
    </div>
  </main>;
}
