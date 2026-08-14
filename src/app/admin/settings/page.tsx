"use client";

import { ArrowLeft, CheckCircle, GearSix, Trash, Warning, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { PaymentMethodManager } from "@/components/admin/payment-method-manager";
import { formatEventDateTime } from "@/lib/datetime";
import { DEFAULT_TIME_ZONE, EVENT_TIME_ZONES, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

const RESET_PHRASE = "HAPUS SEMUA DATA";

type Settings = {
  pickup_mode: "after_payment" | "immediate";
  name_display_mode: "full" | "initials" | "company_only" | "hidden";
  leaderboard_enabled: boolean;
  pending_auto_void_minutes: number;
  cashier_confirmation_required: boolean;
  time_zone: EventTimeZone;
  updated_at?: string;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Danger zone hanya untuk pemilik sistem. Server sudah menolak lewat
  // requireUser(["super_admin"]); ini agar klien tidak melihat tombol yang pasti
  // gagal, sekaligus tidak tergoda menekannya.
  const [isOwner, setIsOwner] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetParticipants, setResetParticipants] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const toast = useToast();

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

  useEffect(() => { const timer = window.setTimeout(() => { void fetch("/api/settings", { cache: "no-store" }).then(async (response) => { if (response.ok) setSettings(await response.json()); else setError("Settings gagal dimuat."); }); }, 0); return () => window.clearTimeout(timer); }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => { if (response.ok) { const data = await response.json(); setIsOwner(data.user?.role === "super_admin"); } }); }, 0); return () => window.clearTimeout(timer); }, []);

  async function save() {
    if (!settings) return;
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      pickup_mode: settings.pickup_mode,
      pending_auto_void_minutes: settings.pending_auto_void_minutes,
      cashier_confirmation_required: settings.cashier_confirmation_required,
      time_zone: settings.time_zone,
    }) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Settings gagal disimpan.";
      setError(failure);
      toast.error("Settings gagal disimpan", failure);
      return;
    }
    setSettings(data); setMessage("Settings tersimpan.");
    // Mematikan konfirmasi kasir ikut melunasi antrean yang menggantung; jumlahnya
    // harus terlihat agar admin tahu ada order yang berubah status.
    if (data.auto_settled_orders > 0) {
      toast.warning("Settings tersimpan", `${data.auto_settled_orders} order pending di antrean kasir ikut ditandai lunas.`);
    } else {
      toast.success("Settings tersimpan", "Perubahan berlaku di semua device dalam 30 detik.");
    }
  }

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-3xl">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Event settings</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Pengaturan acara.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">Perubahan berlaku di semua device dalam 30 detik. Setiap perubahan tercatat di audit log.</p>
      </div>

      {error && <div role="alert" className="mt-6 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}
      {message && <div role="status" className="mt-6 flex items-center gap-2 border border-[#B9DCC5] bg-[#EEF8F0] p-4 text-sm text-[var(--brand-strong)]"><CheckCircle size={20} />{message}</div>}

      {!settings ? <p className="mt-8 text-sm text-[var(--ink-muted)]">Memuat settings...</p> : <div className="mt-8 space-y-px border border-[var(--line)] bg-[var(--line)]">
        {/* Zona waktu ditaruh paling atas karena ia menentukan arti setiap angka jam
            di halaman lain: order, audit, Live Display, denah, dan penanda "sedang
            berlangsung" di rundown. Setelan yang salah di sini membuat semua jam
            tampak wajar tapi geser serentak. */}
        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Zona waktu acara</h2>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">Ikuti zona <span className="font-semibold text-[var(--ink)]">lokasi acara</span>, bukan zona kantor atau laptop panitia. Semua jam di app dipaksa ke zona ini agar tidak berbeda antar device.</p>
          <div className="mt-4 space-y-2">
            {EVENT_TIME_ZONES.map((option) => <label key={option.id} className={`flex cursor-pointer gap-3 border p-4 ${settings.time_zone === option.id ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)]"}`}>
              <input type="radio" name="time-zone" checked={settings.time_zone === option.id} onChange={() => setSettings((current) => current && { ...current, time_zone: option.id })} className="mt-1 size-4 accent-[var(--brand)]" />
              <span><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs text-[var(--ink-muted)]">{option.hint}</span></span>
            </label>)}
          </div>
          <div className="mt-4 flex items-start gap-2 border border-[#E6D3AE] bg-[#FDF6E7] p-4 text-sm text-[var(--warning)]">
            <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
            <span>Mengubah zona ikut menggeser <span className="font-semibold">jam order yang sudah tercatat</span> saat ditampilkan, karena yang tersimpan adalah waktu absolut. Setel sekali sebelum acara mulai, lalu jangan diubah lagi di tengah acara agar laporan tidak dibaca dengan dua zona berbeda. Jam pada rundown adalah jam dinding yang diketik panitia, jadi angkanya tidak berubah &mdash; yang menyesuaikan hanya penanda &ldquo;sedang berlangsung&rdquo;.</span>
          </div>
        </section>

        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Penyerahan barang</h2>
          <div className="mt-4 space-y-2">
            {([["after_payment", "Ambil setelah lunas", "Barang disimpan di booth. Peserta kembali setelah membayar di kasir."], ["immediate", "Serahkan langsung di booth", "Barang diberikan saat order dibuat."]] as const).map(([value, label, desc]) => <label key={value} className={`flex cursor-pointer gap-3 border p-4 ${settings.pickup_mode === value ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)]"}`}>
              <input type="radio" name="pickup" checked={settings.pickup_mode === value} onChange={() => setSettings((current) => current && { ...current, pickup_mode: value })} className="mt-1 size-4 accent-[var(--brand)]" />
              <span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-[var(--ink-muted)]">{desc}</span></span>
            </label>)}
          </div>
        </section>

        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Item diskon</h2>
          <p className="mt-4 text-sm text-[var(--ink-muted)]">Aturan item diskon kini diatur <span className="font-semibold text-[var(--ink)]">per booth</span> (aktif/tidak, batas per peserta, dan stok). Atur di halaman <Link href="/admin/booths" className="font-semibold text-[var(--brand)]">Booth &amp; item</Link>.</p>
        </section>

        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Konfirmasi kasir</h2>
          <div className="mt-4 space-y-2">
            {([[true, "Lewat kasir", "Order booth masuk antrean kasir. Kasir menandai lunas dan memilih metode pembayaran. Nilai masuk top spender setelah lunas."], [false, "Tanpa kasir", "Order booth langsung tercatat lunas dan nilainya langsung masuk top spender. Antrean kasir tidak dipakai, metode pembayaran tidak dicatat."]] as const).map(([value, label, desc]) => <label key={String(value)} className={`flex cursor-pointer gap-3 border p-4 ${settings.cashier_confirmation_required === value ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)]"}`}>
              <input type="radio" name="cashier-confirmation" checked={settings.cashier_confirmation_required === value} onChange={() => setSettings((current) => current && { ...current, cashier_confirmation_required: value })} className="mt-1 size-4 accent-[var(--brand)]" />
              <span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-[var(--ink-muted)]">{desc}</span></span>
            </label>)}
          </div>
          {!settings.cashier_confirmation_required && <div className="mt-4 flex items-start gap-2 border border-[#E6D3AE] bg-[#FDF6E7] p-4 text-sm text-[var(--warning)]">
            <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
            <span>Tanpa kasir, tidak ada pihak kedua yang memverifikasi pembayaran. Order langsung final saat dibuat, dan <span className="font-semibold">metode pembayaran tidak tercatat</span> sehingga rekonsiliasi EDC tidak bisa dipakai. Order pending yang masih di antrean kasir akan ikut ditandai lunas saat disimpan. Booth dapat mem-void order buatannya sendiri dengan alasan wajib.</span>
          </div>}
        </section>

        <PaymentMethodManager />

        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Auto-void</h2>
          <label className="mt-4 block text-sm font-semibold">Auto-void order pending setelah (menit)
            <input type="number" min={5} max={1440} value={settings.pending_auto_void_minutes} onChange={(event) => setSettings((current) => current && { ...current, pending_auto_void_minutes: Math.max(5, Math.min(1440, Number(event.target.value) || 5)) })} className="mt-2 h-12 w-32 border border-[var(--line)] bg-[var(--background)] px-3 text-lg tabular-nums outline-none focus:border-[var(--brand)]" />
          </label>
          <p className="mt-3 text-xs text-[var(--ink-muted)]">Pengaturan leaderboard (tampil/sembunyi & privasi nama) kini ada di halaman <Link href="/admin/display" className="font-semibold text-[var(--brand)]">Live Display</Link>.</p>
        </section>

        <section className="bg-[var(--surface)] p-6">
          <button onClick={save} disabled={saving} className="flex min-h-14 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"><GearSix size={19} />{saving ? "Menyimpan..." : "Simpan perubahan"}</button>
          {settings.updated_at && <p className="mt-3 text-center text-xs text-[var(--ink-muted)]">Terakhir diubah {formatEventDateTime(settings.updated_at, settings.time_zone ?? DEFAULT_TIME_ZONE)} {timeZoneAbbr(settings.time_zone ?? DEFAULT_TIME_ZONE)}</p>}
        </section>
      </div>}

      {isOwner && <div className="mt-10 border border-[#E9C7C4] bg-[#FFF7F6]">
        <div className="border-b border-[#E9C7C4] px-6 py-4">
          <div className="flex items-center gap-2 text-[var(--danger)]"><Warning size={20} weight="fill" /><h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Danger zone</h2></div>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">Kosongkan data pencatatan untuk memulai ulang dari nol. Berguna saat masa trial. Konfigurasi booth, user, dan tampilan tetap aman.</p>
        </div>

        {resetError && <div role="alert" className="mx-6 mt-4 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-3 text-sm text-[var(--danger)]"><XCircle size={18} />{resetError}</div>}
        {resetMessage && <div role="status" className="mx-6 mt-4 flex items-center gap-2 border border-[#B9DCC5] bg-[#EEF8F0] p-3 text-sm text-[var(--brand-strong)]"><CheckCircle size={18} />{resetMessage}</div>}

        <div className="p-6">
          {!resetOpen ? <button type="button" onClick={() => { setResetOpen(true); setResetMessage(""); setResetError(""); }} className="flex min-h-12 items-center gap-2 border border-[var(--danger)] px-4 text-sm font-semibold text-[var(--danger)] hover:bg-[#FFF2F0]"><Trash size={18} weight="bold" /> Kosongkan data pencatatan</button> : <div className="space-y-4">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={resetParticipants} onChange={(event) => setResetParticipants(event.target.checked)} className="mt-1 size-5 accent-[var(--danger)]" /><span><span className="block font-semibold">Hapus juga daftar peserta</span><span className="mt-1 block text-xs text-[var(--ink-muted)]">Jika dicentang, seluruh peserta hasil sync ikut terhapus. Biarkan kosong untuk mempertahankan peserta.</span></span></label>
            <div>
              <p className="text-sm">Yang akan dihapus: <span className="font-semibold">semua order</span>, riwayat scan, dan audit transaksi{resetParticipants ? ", serta seluruh peserta" : ""}. Tindakan ini tidak dapat dibatalkan.</p>
              <label className="mt-3 block text-sm font-semibold">Ketik <span className="font-mono text-[var(--danger)]">{RESET_PHRASE}</span> untuk konfirmasi
                <input value={resetPhrase} onChange={(event) => setResetPhrase(event.target.value)} placeholder={RESET_PHRASE} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--danger)]" />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={resetRecords} disabled={resetting || resetPhrase !== RESET_PHRASE} className="flex min-h-12 items-center gap-2 bg-[var(--danger)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"><Trash size={18} weight="bold" />{resetting ? "Menghapus..." : "Hapus permanen"}</button>
              <button type="button" onClick={() => { setResetOpen(false); setResetPhrase(""); setResetParticipants(false); setResetError(""); }} disabled={resetting} className="flex min-h-12 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold hover:bg-[var(--surface-muted)]">Batal</button>
            </div>
          </div>}
        </div>
      </div>}
    </div>
  </main>;
}
