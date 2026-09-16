"use client";

import { CheckCircle, Plus, ShieldCheck, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  SelectField,
  StatusChip,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextField,
} from "@/components/m3";
import { useToast } from "@/components/toast";

type Role = "booth" | "cashier" | "admin" | "super_admin" | "scanner";
type User = { id: string; username: string; role: Role; booth_id: number | null; is_active: boolean };
type Booth = { id: number; code: string; name: string };
type Draft = { id: string | null; username: string; pin: string; role: Role; booth_id: number | null; is_active: boolean };

const blank: Draft = { id: null, username: "", pin: "", role: "booth", booth_id: null, is_active: true };
const roleLabel: Record<Role, string> = { booth: "Admin Booth", cashier: "Kasir", admin: "Panitia / Admin", super_admin: "Super Admin", scanner: "Petugas scan" };
const rolePermissions: Record<Role, string[]> = {
  booth: ["Scan peserta & buat order", "Serahkan barang di booth", "Lihat riwayat booth sendiri"],
  cashier: ["Lihat antrean pembayaran", "Tandai lunas", "Void order"],
  admin: ["Kelola booth & item spesial", "Kelola metode pembayaran", "Semua laporan & settings", "Void order apa pun", "Reset PIN operator booth & kasir"],
  super_admin: ["Semua izin Panitia / Admin", "Kelola user & role", "Kosongkan data pencatatan"],
  // Sengaja sesempit ini. Akun ini dipegang bergantian di pintu masuk, sering di
  // ponsel yang tidak terkunci; apa pun di luar memindai kehadiran adalah
  // kewenangan yang tidak dibutuhkan di sana.
  scanner: ["Buka layar pemindai kehadiran", "Catat kehadiran peserta per sesi"],
};

export function UsersPanel() {
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

  return <div>
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-body-medium leading-6 text-on-surface-variant">{canManage
            ? "Tambah, edit, dan nonaktifkan akun panitia. Role menentukan izin di server."
            : "Anda dapat melihat daftar akun dan mereset PIN operator booth & kasir. Menambah, mengubah role, atau menonaktifkan akun hanya dapat dilakukan super admin."}</p>
        </div>
        {canManage && <button onClick={() => { setDraft(blank); setMessage(""); setError(""); }} className="rounded-md flex min-h-12 items-center justify-center gap-2 bg-on-surface px-4 text-body-medium font-semibold text-surface"><Plus size={19} /> User baru</button>}
      </div>

      {error && <div role="alert" className="rounded-lg mt-6 flex items-center gap-2 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error"><XCircle size={20} />{error}</div>}
      {message && <div role="status" className="rounded-lg mt-6 flex items-center gap-2 border border-success-soft-outline bg-success-soft p-4 text-body-medium text-primary-dim"><CheckCircle size={20} />{message}</div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
        <section className="rounded-lg border border-outline-variant bg-panel">
          <div className="border-b border-outline-variant px-5 py-4"><h2 className="font-semibold">Panitia terdaftar</h2><p className="mt-1 text-body-small text-on-surface-variant">{users.length} akun</p></div>
          <Table density="compact" minWidth="640px">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Username</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Booth</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell><span className="sr-only">Aksi</span></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => <TableRow key={user.id} interactive>
                <TableCell strong>{user.username}</TableCell>
                <TableCell>{roleLabel[user.role]}</TableCell>
                {/* Kode booth WAJIB dibaca dari data booth, bukan dibentuk dari
                    `B` + booth_id. Kode booth bebas huruf/angka (mis. PH), jadi
                    menyusunnya dari id menampilkan booth PH sebagai "B8" dan
                    membuat admin ragu apakah user tersambung ke booth yang benar.
                    Kebetulan cocok untuk B1..B7 karena id-nya sama dengan angka
                    di kodenya, sehingga salahnya baru terlihat pada booth non-numerik. */}
                <TableCell>{user.booth_id
                  ? booths.find((item) => item.id === user.booth_id)?.code ?? `#${user.booth_id}`
                  : "—"}</TableCell>
                <TableCell>{user.is_active
                  ? <StatusChip tone="success">Aktif</StatusChip>
                  : <StatusChip tone="neutral">Nonaktif</StatusChip>}</TableCell>
                <TableCell align="end">{canEdit(user)
                  ? <Button variant="text" size="sm" onClick={() => editUser(user)}>{canManage ? "Edit" : "Reset PIN"}</Button>
                  : <span className="text-body-small text-on-surface-variant">—</span>}</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </section>

        <section className="space-y-6">
          <div className="rounded-lg border border-outline-variant bg-panel p-5">
            <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-primary" /><h2 className="font-semibold">{!canManage ? "Reset PIN operator" : draft.id ? "Edit user" : "User baru"}</h2></div>
            {/* Tanpa izin kelola user, hanya field PIN yang ditampilkan. Menampilkan
                username/role/status akan menyesatkan: server menolak perubahannya. */}
            {canManage ? (
              <TextField
                className="mt-5"
                label="Username"
                value={draft.username}
                onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value.toLowerCase() }))}
                placeholder="mis. ratna.booth3"
              />
            ) : <p className="mt-5 text-body-medium">{draft.id ? <>Akun <span className="font-semibold">{draft.username}</span> ({roleLabel[draft.role]})</> : "Pilih Reset PIN pada akun operator di tabel."}</p>}
            <TextField
              className="mt-4"
              label="PIN 6 digit"
              hint={draft.id ? "Kosongkan bila tidak diubah." : undefined}
              value={draft.pin}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setDraft((current) => ({ ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))}
              placeholder="••••••"
              inputClassName="ed-tracked"
            />
            {canManage && (
              <SelectField
                className="mt-4"
                label="Role"
                value={draft.role}
                onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as Draft["role"] }))}
              >
                <option value="booth">Admin Booth</option>
                <option value="cashier">Kasir</option>
                <option value="scanner">Petugas scan</option>
                <option value="admin">Panitia / Admin</option>
                <option value="super_admin">Super Admin</option>
              </SelectField>
            )}
            {canManage && draft.role === "booth" && (
              <SelectField
                className="mt-4"
                label="Booth"
                value={draft.booth_id ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, booth_id: event.target.value ? Number(event.target.value) : null }))}
              >
                <option value="">Pilih booth</option>
                {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
              </SelectField>
            )}
            {/* Sakelar, bukan kotak centang. Keduanya menyatakan hal yang sama,
                tetapi sakelar M3 membawa ikon centang/silang di kenopnya — dan
                salah membaca "akun aktif" berarti panitia mengira operator sudah
                bisa login padahal belum. */}
            {canManage && <Switch className="mt-4" checked={draft.is_active} onChange={(is_active) => setDraft((current) => ({ ...current, is_active }))} label="Akun aktif" />}
            {/* Mode reset PIN wajib mengisi PIN: PATCH tanpa perubahan apa pun tidak
                ada gunanya dan akan ditolak server sebagai VALIDATION_ERROR. */}
            <Button
              className="mt-6"
              block
              loading={saving}
              onClick={save}
              disabled={canManage ? !draft.username : !draft.id || draft.pin.length !== 6}
            >
              {canManage ? (draft.id ? "Simpan perubahan" : "Buat user") : "Reset PIN"}
            </Button>
          </div>

          <div className="rounded-lg border border-outline-variant bg-panel p-5">
            <h2 className="text-body-medium font-semibold ed-label text-on-surface-variant">Izin role: {roleLabel[draft.role]}</h2>
            <ul className="mt-4 space-y-2 text-body-medium">
              {rolePermissions[draft.role].map((perm) => <li key={perm} className="flex items-start gap-2"><CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-primary" />{perm}</li>)}
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>;
}
