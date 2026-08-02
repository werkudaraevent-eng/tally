"use client";

import { ArrowLeft, CheckCircle, Plus, ShieldCheck, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";

type Role = "booth" | "cashier" | "admin" | "super_admin";
type User = { id: string; username: string; role: Role; booth_id: number | null; is_active: boolean };
type Booth = { id: number; code: string; name: string };
type Draft = { id: string | null; username: string; pin: string; role: Role; booth_id: number | null; is_active: boolean };

const blank: Draft = { id: null, username: "", pin: "", role: "booth", booth_id: null, is_active: true };
const roleLabel: Record<Role, string> = { booth: "Admin Booth", cashier: "Kasir", admin: "Panitia / Admin", super_admin: "Super Admin" };
const rolePermissions: Record<Role, string[]> = {
  booth: ["Scan peserta & buat order", "Serahkan barang di booth", "Lihat riwayat booth sendiri"],
  cashier: ["Lihat antrean pembayaran", "Tandai lunas", "Void order"],
  admin: ["Kelola booth & item spesial", "Kelola metode pembayaran", "Semua laporan & settings", "Void order apa pun", "Reset PIN operator booth & kasir"],
  super_admin: ["Semua izin Panitia / Admin", "Kelola user & role", "Kosongkan data pencatatan"],
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Klien (`admin`) hanya boleh melihat daftar akun dan mereset PIN operator.
  // Nilainya datang dari server, bukan ditebak dari role di klien.
  const [canManage, setCanManage] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    const [usersResponse, boothsResponse] = await Promise.all([fetch("/api/admin/users", { cache: "no-store" }), fetch("/api/admin/booths", { cache: "no-store" })]);
    if (usersResponse.ok) {
      const data = await usersResponse.json();
      setUsers(data.users ?? []);
      setCanManage(Boolean(data.can_manage));
    } else setError((await usersResponse.json()).error?.message ?? "User gagal dimuat.");
    if (boothsResponse.ok) setBooths((await boothsResponse.json()).booths ?? []);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  // Klien hanya boleh menyentuh PIN operator booth/kasir. Akun admin dan
  // super_admin tidak dapat diedit sama sekali olehnya.
  function canEdit(user: User) {
    return canManage || user.role === "booth" || user.role === "cashier";
  }

  function editUser(user: User) {
    setDraft({ id: user.id, username: user.username, pin: "", role: user.role, booth_id: user.booth_id, is_active: user.is_active });
    setMessage(""); setError("");
  }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    const isNew = !draft.id;
    if (isNew && !/^\d{6}$/.test(draft.pin)) { setSaving(false); setError("PIN wajib 6 digit untuk user baru."); toast.error("PIN belum valid", "PIN wajib 6 digit angka untuk user baru."); return; }
    // Tanpa izin kelola user, kirim HANYA pin. Server menolak PATCH yang
    // menyertakan field lain, jadi mengirim username/role/is_active seperti
    // biasa akan membuat reset PIN gagal dengan 403.
    const payload: Record<string, unknown> = canManage
      ? { username: draft.username, role: draft.role, booth_id: draft.role === "booth" ? draft.booth_id : null, is_active: draft.is_active }
      : {};
    if (draft.id) payload.id = draft.id;
    if (draft.pin) payload.pin = draft.pin;
    const response = await fetch("/api/admin/users", { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "User gagal disimpan.";
      setError(failure);
      toast.error("User gagal disimpan", failure);
      return;
    }
    setMessage(`${data.user.username} berhasil disimpan.`);
    toast.success(`${data.user.username} tersimpan`, isNew ? "User baru dapat langsung login." : "Perubahan user diterapkan.");
    setDraft(blank);
    void load();
  }

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">User & role management</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">{canManage ? "Kelola panitia." : "Daftar panitia."}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">{canManage
            ? "Tambah, edit, dan nonaktifkan akun panitia. Role menentukan izin di server."
            : "Anda dapat melihat daftar akun dan mereset PIN operator booth & kasir. Menambah, mengubah role, atau menonaktifkan akun hanya dapat dilakukan super admin."}</p>
        </div>
        {canManage && <button onClick={() => { setDraft(blank); setMessage(""); setError(""); }} className="flex min-h-12 items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-semibold text-white"><Plus size={19} /> User baru</button>}
      </div>

      {error && <div role="alert" className="mt-6 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}
      {message && <div role="status" className="mt-6 flex items-center gap-2 border border-[#B9DCC5] bg-[#EEF8F0] p-4 text-sm text-[var(--brand-strong)]"><CheckCircle size={20} />{message}</div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
        <section className="border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-semibold">Panitia terdaftar</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">{users.length} akun</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <th className="px-5 py-3 font-semibold">Username</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Booth</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-[var(--line)]">
                {users.map((user) => <tr key={user.id} className="hover:bg-[var(--surface-muted)]">
                  <td className="px-5 py-3 font-semibold">{user.username}</td>
                  <td className="px-5 py-3">{roleLabel[user.role]}</td>
                  {/* Kode booth WAJIB dibaca dari data booth, bukan dibentuk dari
                      `B` + booth_id. Kode booth bebas huruf/angka (mis. PH), jadi
                      menyusunnya dari id menampilkan booth PH sebagai "B8" dan
                      membuat admin ragu apakah user tersambung ke booth yang benar.
                      Kebetulan cocok untuk B1..B7 karena id-nya sama dengan angka
                      di kodenya, sehingga salahnya baru terlihat pada booth non-numerik. */}
                  <td className="px-5 py-3">{user.booth_id
                    ? booths.find((item) => item.id === user.booth_id)?.code ?? `#${user.booth_id}`
                    : "—"}</td>
                  <td className="px-5 py-3">{user.is_active ? <span className="inline-flex rounded-sm bg-[#EEF8F0] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-strong)]">Aktif</span> : <span className="inline-flex rounded-sm bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">Nonaktif</span>}</td>
                  <td className="px-5 py-3 text-right">{canEdit(user)
                    ? <button onClick={() => editUser(user)} className="min-h-11 px-2 text-sm font-semibold text-[var(--brand)]">{canManage ? "Edit" : "Reset PIN"}</button>
                    : <span className="text-xs text-[var(--ink-muted)]">—</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-6">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-[var(--brand)]" /><h2 className="font-semibold">{!canManage ? "Reset PIN operator" : draft.id ? "Edit user" : "User baru"}</h2></div>
            {/* Tanpa izin kelola user, hanya field PIN yang ditampilkan. Menampilkan
                username/role/status akan menyesatkan: server menolak perubahannya. */}
            {canManage ? <label className="mt-5 block text-sm font-semibold">Username
              <input value={draft.username} onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value.toLowerCase() }))} placeholder="mis. ratna.booth3" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
            </label> : <p className="mt-5 text-sm">{draft.id ? <>Akun <span className="font-semibold">{draft.username}</span> ({roleLabel[draft.role]})</> : "Pilih Reset PIN pada akun operator di tabel."}</p>}
            <label className="mt-4 block text-sm font-semibold">PIN 6 digit {draft.id && <span className="font-normal text-[var(--ink-muted)]">(kosongkan bila tidak diubah)</span>}
              <input value={draft.pin} inputMode="numeric" maxLength={6} onChange={(event) => setDraft((current) => ({ ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="••••••" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-lg tracking-[0.3em] outline-none focus:border-[var(--brand)]" />
            </label>
            {canManage && <label className="mt-4 block text-sm font-semibold">Role
              <select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as Draft["role"] }))} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]">
                <option value="booth">Admin Booth</option>
                <option value="cashier">Kasir</option>
                <option value="admin">Panitia / Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </label>}
            {canManage && draft.role === "booth" && <label className="mt-4 block text-sm font-semibold">Booth
              <select value={draft.booth_id ?? ""} onChange={(event) => setDraft((current) => ({ ...current, booth_id: event.target.value ? Number(event.target.value) : null }))} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]">
                <option value="">Pilih booth</option>
                {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
              </select>
            </label>}
            {canManage && <label className="mt-4 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} className="size-5 accent-[var(--brand)]" /> Akun aktif</label>}
            {/* Mode reset PIN wajib mengisi PIN: PATCH tanpa perubahan apa pun tidak
                ada gunanya dan akan ditolak server sebagai VALIDATION_ERROR. */}
            <button onClick={save} disabled={saving || (canManage ? !draft.username : !draft.id || draft.pin.length !== 6)} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">{saving ? "Menyimpan..." : canManage ? (draft.id ? "Simpan perubahan" : "Buat user") : "Reset PIN"}</button>
          </div>

          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Izin role: {roleLabel[draft.role]}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {rolePermissions[draft.role].map((perm) => <li key={perm} className="flex items-start gap-2"><CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--brand)]" />{perm}</li>)}
            </ul>
          </div>
        </section>
      </div>
    </div>
  </main>;
}
