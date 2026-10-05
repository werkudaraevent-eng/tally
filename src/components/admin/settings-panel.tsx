"use client";

import { Trash, Warning, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { Banner, Button, Dialog, Pane, PaneBody, PaneFooter, TextField } from "@/components/m3";
import { formatEventDateTime } from "@/lib/datetime";
import { cx } from "@/lib/m3/cx";
import { DEFAULT_TIME_ZONE, EVENT_TIME_ZONES, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

const RESET_PHRASE = "HAPUS SEMUA DATA";

type Settings = {
  pickup_mode: "after_payment" | "immediate";
  name_display_mode: "full" | "initials" | "company_only" | "hidden";
  leaderboard_enabled: boolean;
  pending_auto_void_minutes: number;
  cashier_confirmation_required: boolean;
  time_zone: EventTimeZone;
  email_sender_name: string | null;
  email_reply_to: string | null;
  /** Pengirim dari env (hanya dibaca). Null bila email belum disetel. */
  email_default?: { name: string | null; address: string; reply_to: string | null } | null;
  updated_at?: string;
};

/** Field yang dikirim PATCH. Hanya ini yang dihitung sebagai perubahan belum tersimpan. */
const FIELD_DISIMPAN = ["time_zone", "pickup_mode", "cashier_confirmation_required", "pending_auto_void_minutes", "email_sender_name", "email_reply_to"] as const;

const kelasInput = "h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium text-on-surface outline-none focus:border-primary";

/** Satu baris setelan: judul dan penjelasan di kiri, kontrolnya di kanan. */
export function SettingRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-outline-variant px-5 py-5 last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
      <div className="min-w-0">
        <h3 className="text-body-medium font-semibold text-on-surface">{title}</h3>
        {description ? <p className="mt-1 text-body-medium text-on-surface-variant">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function PilihanRadio({ name, checked, onSelect, label, description }: { name: string; checked: boolean; onSelect: () => void; label: string; description: string }) {
  return (
    <label className={cx("flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5", checked ? "border-primary" : "border-outline-variant hover:bg-primary-soft")}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
      <span className="min-w-0">
        <span className="block text-body-medium font-medium text-on-surface">{label}</span>
        <span className="mt-0.5 block text-body-medium text-on-surface-variant">{description}</span>
      </span>
    </label>
  );
}

function Peringatan({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
      <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-warning" />
      <span>{children}</span>
    </p>
  );
}

/** Teks kosong dan null sama-sama berarti "pakai bawaan". */
function samaNilai(a: unknown, b: unknown) {
  return typeof a === "string" || typeof b === "string" ? String(a ?? "").trim() === String(b ?? "").trim() : a === b;
}

/** Tab "Acara": zona waktu, penyerahan barang, konfirmasi kasir, auto-void. */
export function SettingsPanel() {
  // `saved` = yang terakhir dibaca/disimpan server, `settings` = draf di layar.
  // Selisih keduanya yang menyalakan tombol Simpan.
  const [saved, setSaved] = useState<Settings | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    setLoadError("");
    const response = await fetch("/api/settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setLoadError("Pengaturan gagal dimuat."); return; }
    const data = (await response.json()) as Settings;
    setSaved(data);
    setSettings(data);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function save() {
    if (!settings) return;
    setSaving(true); setError("");
    // Hanya kolom yang diubah di layar ini. Nama pengirim juga bisa diubah di
    // Email otomatis; mengirim semua kolom membuat tab Pengaturan yang dibuka
    // lebih dulu diam-diam mengembalikan nama lama saat disimpan.
    const semua = {
      pickup_mode: settings.pickup_mode,
      pending_auto_void_minutes: settings.pending_auto_void_minutes,
      cashier_confirmation_required: settings.cashier_confirmation_required,
      time_zone: settings.time_zone,
      email_sender_name: settings.email_sender_name?.trim() || null,
      email_reply_to: settings.email_reply_to?.trim() || null,
    };
    const ubah = Object.fromEntries(Object.entries(semua).filter(([key]) => saved && !samaNilai(settings[key as keyof Settings], saved[key as keyof Settings])));
    if (!Object.keys(ubah).length) { setSaving(false); return; }
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ubah) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Pengaturan gagal disimpan.";
      setError(failure);
      toast.error("Pengaturan gagal disimpan", failure);
      return;
    }
    setSettings(data); setSaved(data);
    // Mematikan konfirmasi kasir ikut melunasi antrean yang menggantung; jumlahnya
    // harus terlihat agar admin tahu ada order yang berubah status.
    if (data.auto_settled_orders > 0) {
      toast.warning("Pengaturan tersimpan", `${data.auto_settled_orders} order pending di antrean kasir ikut ditandai lunas.`);
    } else {
      toast.success("Pengaturan tersimpan", "Perubahan berlaku di semua perangkat dalam 30 detik.");
    }
  }

  if (loadError) {
    return (
      <Banner tone="error" icon={<XCircle size={18} />} actions={<Button variant="outlined" size="sm" onClick={() => void load()}>Coba lagi</Button>}>
        {loadError}
      </Banner>
    );
  }

  if (!settings || !saved) {
    return (
      <Pane aria-label="Memuat pengaturan">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid gap-3 border-b border-outline-variant px-5 py-6 last:border-b-0 md:grid-cols-[2fr_3fr] md:gap-8">
            <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
            <div className="h-9 w-full animate-pulse rounded-md bg-surface-container-high" />
          </div>
        ))}
      </Pane>
    );
  }

  const jumlahUbah = FIELD_DISIMPAN.filter((key) => !samaNilai(settings[key], saved[key])).length;
  const zonaTersimpan = saved.time_zone ?? DEFAULT_TIME_ZONE;
  const waktuUbah = saved.updated_at ? `${formatEventDateTime(saved.updated_at, zonaTersimpan)} ${timeZoneAbbr(zonaTersimpan)}` : "";
  const zonaDipilih = EVENT_TIME_ZONES.find((option) => option.id === settings.time_zone);
  const bawaan = saved.email_default ?? null;
  const namaTampil = settings.email_sender_name?.trim() || bawaan?.name || "";
  const balasanTampil = settings.email_reply_to?.trim() || bawaan?.reply_to || null;
  const set = (patch: Partial<Settings>) => setSettings((current) => current && { ...current, ...patch });

  return (
    <div className="flex flex-col gap-4">
      {error ? <Banner tone="error" icon={<XCircle size={18} />}>{error}</Banner> : null}
      <Pane aria-label="Pengaturan acara">
        <PaneBody>
          {/* Zona waktu paling atas karena ia menentukan arti setiap angka jam di
              halaman lain: order, audit, Papan peringkat, denah, dan penanda
              "sedang berlangsung" di rundown. Setelan yang salah di sini membuat
              semua jam tampak wajar tapi geser serentak. */}
          <SettingRow title="Zona waktu acara" description="Ikuti zona lokasi acara, bukan zona kantor atau laptop panitia. Semua jam di aplikasi memakai zona ini.">
            <label className="sr-only" htmlFor="zona-waktu">Zona waktu acara</label>
            <select
              id="zona-waktu"
              value={settings.time_zone}
              onChange={(event) => set({ time_zone: event.target.value as EventTimeZone })}
              className={kelasInput}
            >
              {EVENT_TIME_ZONES.map((option) => <option key={option.id} value={option.id}>{option.label.replace(" — ", ": ")}</option>)}
            </select>
            {zonaDipilih ? <p className="mt-1.5 text-body-medium text-on-surface-variant">{zonaDipilih.hint}</p> : null}
            {settings.time_zone !== saved.time_zone ? (
              <Peringatan>
                Jam order yang sudah tercatat ikut bergeser saat ditampilkan, karena yang tersimpan adalah waktu absolut. Setel sekali sebelum acara mulai. Jam di rundown adalah jam dinding yang diketik panitia, jadi angkanya tetap; yang menyesuaikan hanya penanda &ldquo;sedang berlangsung&rdquo;.
              </Peringatan>
            ) : null}
          </SettingRow>

          {/* Pengirim email: nama yang tampil di kotak masuk peserta, per acara.
              Alamatnya tetap dari EMAIL_FROM (domain terverifikasi di Resend),
              jadi ditampilkan sebagai teks, bukan kolom. */}
          <SettingRow title="Pengirim email" description="Nama yang dilihat peserta di kotak masuk, dan ke mana balasan mereka dikirim. Berlaku untuk konfirmasi pendaftaran, tautan masuk, dan Pesan peserta.">
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-body-medium font-medium text-on-surface" htmlFor="nama-pengirim">Nama pengirim</label>
                <input
                  id="nama-pengirim"
                  type="text"
                  maxLength={80}
                  value={settings.email_sender_name ?? ""}
                  placeholder={bawaan?.name ?? "Nama penyelenggara"}
                  onChange={(event) => set({ email_sender_name: event.target.value })}
                  className={kelasInput}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-body-medium font-medium text-on-surface" htmlFor="balasan-ke">Balasan ke</label>
                <input
                  id="balasan-ke"
                  type="email"
                  maxLength={254}
                  value={settings.email_reply_to ?? ""}
                  placeholder={bawaan?.reply_to ?? "email@penyelenggara.com"}
                  onChange={(event) => set({ email_reply_to: event.target.value })}
                  className={kelasInput}
                />
              </div>
              <p className="text-body-medium text-on-surface-variant">
                {bawaan ? (
                  <>
                    Peserta melihat: <span className="font-medium text-on-surface">{namaTampil ? `${namaTampil} <${bawaan.address}>` : bawaan.address}</span>
                    {balasanTampil ? <>. Balasan masuk ke <span className="font-medium text-on-surface">{balasanTampil}</span>.</> : ". Balasan masuk ke alamat pengirim."}
                    {" "}Kosongkan untuk memakai bawaan situs.
                  </>
                ) : "Pengiriman email belum disetel di server, jadi nama ini belum dipakai."}
              </p>
            </div>
          </SettingRow>

          <SettingRow title="Penyerahan barang" description="Kapan booth menyerahkan barang ke peserta.">
            <div className="flex flex-col gap-2">
              {([["after_payment", "Ambil setelah lunas", "Barang disimpan di booth. Peserta kembali setelah membayar di kasir."], ["immediate", "Serahkan langsung di booth", "Barang diberikan saat order dibuat."]] as const).map(([value, label, desc]) => (
                <PilihanRadio key={value} name="pickup" checked={settings.pickup_mode === value} onSelect={() => set({ pickup_mode: value })} label={label} description={desc} />
              ))}
            </div>
          </SettingRow>

          <SettingRow title="Konfirmasi kasir" description="Tentukan sebelum pintu dibuka, bukan di tengah acara.">
            <div className="flex flex-col gap-2">
              {([[true, "Lewat kasir", "Order booth masuk antrean kasir. Kasir menandai lunas dan memilih metode pembayaran. Nilai masuk top spender setelah lunas."], [false, "Tanpa kasir", "Order booth langsung tercatat lunas dan nilainya langsung masuk top spender. Antrean kasir tidak dipakai, metode pembayaran tidak dicatat."]] as const).map(([value, label, desc]) => (
                <PilihanRadio key={String(value)} name="cashier-confirmation" checked={settings.cashier_confirmation_required === value} onSelect={() => set({ cashier_confirmation_required: value })} label={label} description={desc} />
              ))}
            </div>
            {!settings.cashier_confirmation_required ? (
              <Peringatan>
                Tanpa kasir, tidak ada pihak kedua yang memverifikasi pembayaran. Order langsung final saat dibuat dan <span className="font-medium">metode pembayaran tidak tercatat</span>, sehingga rekonsiliasi EDC tidak bisa dipakai. Order pending yang masih di antrean kasir ikut ditandai lunas saat disimpan. Booth dapat mem-void order buatannya sendiri dengan alasan wajib.
              </Peringatan>
            ) : null}
          </SettingRow>

          <SettingRow title="Auto-void order pending" description="Order yang belum dibayar dibatalkan otomatis setelah waktu ini.">
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="auto-void">Auto-void order pending setelah (menit)</label>
              <input
                id="auto-void"
                type="number"
                min={5}
                max={1440}
                value={settings.pending_auto_void_minutes}
                onChange={(event) => set({ pending_auto_void_minutes: Math.max(5, Math.min(1440, Number(event.target.value) || 5)) })}
                className={cx(kelasInput, "w-28 tabular-nums")}
              />
              <span className="text-body-medium text-on-surface-variant">menit</span>
            </div>
            <p className="mt-1.5 text-body-medium text-on-surface-variant">Antara 5 dan 1.440 menit.</p>
          </SettingRow>

          <SettingRow title="Diatur di halaman lain">
            <ul className="flex flex-col gap-1.5 text-body-medium text-on-surface-variant">
              <li>Item diskon diatur per booth (aktif, batas per peserta, stok) di <Link href="/admin/booths" className="rounded-sm font-medium text-primary hover:underline">Booth &amp; item</Link>.</li>
              <li>Leaderboard dan privasi nama diatur di <Link href="/admin/display" className="rounded-sm font-medium text-primary hover:underline">Papan peringkat</Link>.</li>
            </ul>
          </SettingRow>
        </PaneBody>
        <PaneFooter
          note={jumlahUbah > 0
            ? `${jumlahUbah} perubahan belum disimpan${waktuUbah ? ` · terakhir diubah ${waktuUbah}` : ""}`
            : waktuUbah ? `Terakhir diubah ${waktuUbah}` : null}
        >
          {jumlahUbah > 0 ? <Button variant="outlined" size="sm" disabled={saving} onClick={() => { setSettings(saved); setError(""); }}>Batalkan</Button> : null}
          <Button simpan size="sm" loading={saving} disabled={jumlahUbah === 0} onClick={() => void save()}>Simpan perubahan</Button>
        </PaneFooter>
      </Pane>
    </div>
  );
}

/**
 * Tab "Zona bahaya": mengosongkan data pencatatan. Hanya dirender untuk pemilik
 * sistem; servernya tetap menolak lewat requireRequestEvent(["super_admin"]).
 */
export function DangerZonePanel() {
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetParticipants, setResetParticipants] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const toast = useToast();

  function tutup() { setResetOpen(false); setResetPhrase(""); setResetParticipants(false); setResetError(""); }

  async function resetRecords() {
    setResetting(true); setResetError(""); setResetMessage("");
    const response = await fetch("/api/admin/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: resetPhrase, include_participants: resetParticipants }) });
    const data = await response.json();
    setResetting(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Reset data gagal.";
      setResetError(failure);
      toast.error("Reset data gagal", failure);
      return;
    }
    const summary = `${data.deleted_orders} order${data.deleted_participants ? `, ${data.deleted_participants} peserta` : ""} terhapus.`;
    setResetMessage(`Data terhapus: ${summary}`);
    toast.warning("Data pencatatan dikosongkan", summary);
    setResetPhrase(""); setResetParticipants(false); setResetOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {resetMessage ? <Banner tone="success">{resetMessage}</Banner> : null}
      <Pane aria-label="Zona bahaya">
        <SettingRow
          title="Kosongkan data pencatatan"
          description="Untuk memulai ulang dari nol, misalnya setelah gladi. Konfigurasi booth, item, akun, dan tampilan tetap."
        >
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body-medium text-on-surface-variant">
            <li>Semua order acara ini dan klaim item spesialnya. Stok item yang terklaim dikembalikan.</li>
            <li>Catatan audit yang menempel pada order. Catatan perubahan konfigurasi tetap disimpan.</li>
            <li>Daftar peserta hanya bila Anda memilihnya di langkah berikut.</li>
          </ul>
          <Button simpan variant="outlined" size="sm" className="mt-4 text-error" icon={<Trash size={16} />} onClick={() => { setResetOpen(true); setResetMessage(""); setResetError(""); }}>
            Kosongkan data pencatatan
          </Button>
        </SettingRow>
      </Pane>

      <Dialog
        open={resetOpen}
        onClose={tutup}
        dismissible={!resetting}
        tone="danger"
        icon={<Warning size={20} weight="fill" />}
        title="Kosongkan data pencatatan?"
        description={<>Semua order acara ini, klaim item spesialnya, dan catatan audit order dihapus{resetParticipants ? ", begitu juga seluruh peserta acara ini" : ""}. Tindakan ini tidak dapat dibatalkan.</>}
        actions={
          <>
            <Button variant="outlined" disabled={resetting} onClick={tutup}>Batal</Button>
            <Button variant="danger" loading={resetting} disabled={resetPhrase !== RESET_PHRASE} icon={<Trash size={16} />} onClick={() => void resetRecords()}>Hapus permanen</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-body-medium">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={resetParticipants} onChange={(event) => setResetParticipants(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-error" />
            <span>
              <span className="block font-medium">Hapus juga daftar peserta</span>
              <span className="mt-0.5 block text-on-surface-variant">Seluruh peserta acara ini ikut terhapus, apa pun sumbernya. Biarkan kosong untuk mempertahankan peserta.</span>
            </span>
          </label>
          <TextField
            label={<>Ketik <span className="text-error">{RESET_PHRASE}</span> untuk konfirmasi</>}
            value={resetPhrase}
            onChange={(event) => setResetPhrase(event.target.value)}
            placeholder={RESET_PHRASE}
            autoComplete="off"
          />
          {resetError ? <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{resetError}</p> : null}
        </div>
      </Dialog>
    </div>
  );
}
