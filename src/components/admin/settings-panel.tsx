"use client";

import { Plus, Trash, Warning, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { Banner, Button, Dialog, IconButton, Pane, PaneBody, PaneFooter, TextField } from "@/components/m3";
import { KONTAK_PANITIA_MAX, KONTAK_PERAN_MAX } from "@/lib/kontak-panitia";
import { formatEventDateTime } from "@/lib/datetime";
import { cx } from "@/lib/m3/cx";
import { DEFAULT_TIME_ZONE, EVENT_TIME_ZONES, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

const RESET_PHRASE = "DELETE ALL DATA";

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

type KontakTambahan = { name: string; role: string; email: string; phone: string };
type Kontak = { contact_name: string; contact_role: string; contact_email: string; contact_phone: string; contact_more: KontakTambahan[] };
const KUNCI_KONTAK = ["contact_name", "contact_role", "contact_email", "contact_phone"] as const;

/** Kontak kedua dan ketiga sebagai teks pembanding; baris kosong tidak dihitung. */
const tambahanTeks = (kontak: Kontak) =>
  JSON.stringify((kontak.contact_more ?? []).map((item) => [item.name.trim(), item.role.trim(), item.email.trim(), item.phone.trim()]).filter((baris) => baris.some(Boolean)));

/** Jumlah isian kontak yang berbeda dari yang tersimpan (kontak tambahan dihitung satu). */
const ubahKontak = (kontak: Kontak | null, tersimpan: Kontak | null) =>
  kontak && tersimpan
    ? KUNCI_KONTAK.filter((kunci) => !samaNilai(kontak[kunci], tersimpan[kunci])).length + (tambahanTeks(kontak) !== tambahanTeks(tersimpan) ? 1 : 0)
    : 0;

const kelasInput = "h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium text-on-surface outline-none focus:border-primary";

/** Satu baris setelan: judul dan penjelasan di kiri, kontrolnya di kanan. */
/** `stacked`: judul di atas isinya, untuk panel setelan yang sempit (di samping pratinjau). */
export function SettingRow({ title, description, children, stacked = false }: { title: ReactNode; description?: ReactNode; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={cx("grid gap-3 border-b border-outline-variant px-5 py-5 last:border-b-0", !stacked && "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8")}>
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

/** Jawaban /api/admin/kontak, dengan `contact_more` selalu berupa daftar. */
function kontakBaca(data: unknown): Kontak | null {
  if (!data || typeof data !== "object") return null;
  const isi = data as Partial<Kontak>;
  return {
    contact_name: isi.contact_name ?? "",
    contact_role: isi.contact_role ?? "",
    contact_email: isi.contact_email ?? "",
    contact_phone: isi.contact_phone ?? "",
    contact_more: (isi.contact_more ?? []).map((item) => ({ name: item?.name ?? "", role: item?.role ?? "", email: item?.email ?? "", phone: item?.phone ?? "" })),
  };
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
  // Kontak panitia: endpoint sendiri (/api/admin/kontak), hanya Admin. Null =
  // tidak bisa dibaca, barisnya disembunyikan.
  const [kontakSaved, setKontakSaved] = useState<Kontak | null>(null);
  const [kontak, setKontak] = useState<Kontak | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoadError("");
    const [response, jawabKontak] = await Promise.all([
      fetch("/api/settings", { cache: "no-store" }).catch(() => null),
      fetch("/api/admin/kontak", { cache: "no-store" }).catch(() => null),
    ]);
    if (!response?.ok) { setLoadError("Settings could not be loaded."); return; }
    const data = (await response.json()) as Settings;
    setSaved(data);
    setSettings(data);
    const dataKontak = jawabKontak?.ok ? kontakBaca(await jawabKontak.json().catch(() => null)) : null;
    setKontakSaved(dataKontak);
    setKontak(dataKontak);
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
    const kontakUbah = ubahKontak(kontak, kontakSaved) > 0;
    if (kontakUbah && kontak && kontakSaved) {
      // Kontak tambahan tanpa nomor maupun email tidak bisa dihubungi: tunjuk
      // kontaknya di sini, bukan pesan validasi umum dari server.
      const tanpaSambung = kontak.contact_more.findIndex((item) => (item.name.trim() || item.role.trim() || item.email.trim() || item.phone.trim()) && !item.email.trim() && !item.phone.trim());
      const adaTambahan = kontak.contact_more.some((item) => item.name.trim() || item.role.trim() || item.email.trim() || item.phone.trim());
      if (adaTambahan && !kontak.contact_email.trim() && !kontak.contact_phone.trim()) {
        setSaving(false);
        const failure = "Fill in a phone number or email for contact 1 first. Contact 1 is used on the registration page, invitations and the participant area.";
        setError(failure);
        toast.error("Organiser contacts not saved", failure);
        return;
      }
      if (tanpaSambung >= 0) {
        setSaving(false);
        const failure = `Contact ${tanpaSambung + 2} needs a phone number or email.`;
        setError(failure);
        toast.error("Organiser contacts not saved", failure);
        return;
      }
      const jawab = await fetch("/api/admin/kontak", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base: kontakSaved, contact: kontak }),
      }).catch(() => null);
      const body = await jawab?.json().catch(() => null);
      if (!jawab?.ok) {
        setSaving(false);
        // Diubah di tab lain: tampilkan yang terbaru, admin mengulang perubahannya.
        if (body?.error?.code === "CONTACT_CHANGED" && body.error.details) { const terbaru = kontakBaca(body.error.details); setKontakSaved(terbaru); setKontak(terbaru); }
        const failure = body?.error?.message ?? "Organiser contacts could not be saved.";
        setError(failure);
        toast.error("Organiser contacts not saved", failure);
        return;
      }
      const tersimpan = kontakBaca(body); setKontakSaved(tersimpan); setKontak(tersimpan);
    }
    if (!Object.keys(ubah).length) {
      setSaving(false);
      if (kontakUbah) toast.success("Organiser contacts saved", "Shown on the event page and in the participant area.");
      return;
    }
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ubah) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Settings could not be saved.";
      setError(failure);
      toast.error("Settings not saved", failure);
      return;
    }
    setSettings(data); setSaved(data);
    // Mematikan konfirmasi kasir ikut melunasi antrean yang menggantung; jumlahnya
    // harus terlihat agar admin tahu ada order yang berubah status.
    if (data.auto_settled_orders > 0) {
      toast.warning("Settings saved", `${data.auto_settled_orders} unpaid ${data.auto_settled_orders === 1 ? "order" : "orders"} in the cashier queue were also marked paid.`);
    } else {
      toast.success("Settings saved", "Changes reach every device within 30 seconds.");
    }
  }

  if (loadError) {
    return (
      <Banner tone="error" icon={<XCircle size={18} />} actions={<Button variant="outlined" size="sm" onClick={() => void load()}>Try again</Button>}>
        {loadError}
      </Banner>
    );
  }

  if (!settings || !saved) {
    return (
      <Pane aria-label="Loading settings">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid gap-3 border-b border-outline-variant px-5 py-6 last:border-b-0 md:grid-cols-[2fr_3fr] md:gap-8">
            <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
            <div className="h-9 w-full animate-pulse rounded-md bg-surface-container-high" />
          </div>
        ))}
      </Pane>
    );
  }

  const jumlahUbah =
    FIELD_DISIMPAN.filter((key) => !samaNilai(settings[key], saved[key])).length +
    ubahKontak(kontak, kontakSaved);
  const zonaTersimpan = saved.time_zone ?? DEFAULT_TIME_ZONE;
  const waktuUbah = saved.updated_at ? `${formatEventDateTime(saved.updated_at, zonaTersimpan)} ${timeZoneAbbr(zonaTersimpan)}` : "";
  const zonaDipilih = EVENT_TIME_ZONES.find((option) => option.id === settings.time_zone);
  const bawaan = saved.email_default ?? null;
  const namaTampil = settings.email_sender_name?.trim() || bawaan?.name || "";
  const balasanTampil = settings.email_reply_to?.trim() || bawaan?.reply_to || null;
  // Halaman peserta jatuh ke Balasan ke milik acara ini, bukan bawaan situs.
  const balasanAcara = saved.email_reply_to?.trim() || null;
  const set = (patch: Partial<Settings>) => setSettings((current) => current && { ...current, ...patch });

  return (
    <div className="flex flex-col gap-4">
      {error ? <Banner tone="error" icon={<XCircle size={18} />}>{error}</Banner> : null}
      <Pane aria-label="Event settings">
        <PaneBody>
          {/* Zona waktu paling atas karena ia menentukan arti setiap angka jam di
              halaman lain: order, audit, Papan peringkat, denah, dan penanda
              "sedang berlangsung" di rundown. Setelan yang salah di sini membuat
              semua jam tampak wajar tapi geser serentak. */}
          <SettingRow title="Event time zone" description="Use the venue's time zone, not the office's or a staff laptop's. Every time in the app uses this zone.">
            <label className="sr-only" htmlFor="zona-waktu">Event time zone</label>
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
                Times of orders already recorded shift when shown, because they are stored as absolute times. Set this once before the event starts. Agenda times are the clock times staff typed, so they stay the same; only the &ldquo;happening now&rdquo; marker adjusts.
              </Peringatan>
            ) : null}
          </SettingRow>

          {/* Pengirim email: nama yang tampil di kotak masuk peserta, per acara.
              Alamatnya tetap dari EMAIL_FROM (domain terverifikasi di Resend),
              jadi ditampilkan sebagai teks, bukan kolom. */}
          <SettingRow title="Email sender" description="The name participants see in their inbox, and where their replies go. Used for registration confirmations, sign-in links and Messages.">
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-body-medium font-medium text-on-surface" htmlFor="nama-pengirim">Sender name</label>
                <input
                  id="nama-pengirim"
                  type="text"
                  maxLength={80}
                  value={settings.email_sender_name ?? ""}
                  placeholder={bawaan?.name ?? "Organiser name"}
                  onChange={(event) => set({ email_sender_name: event.target.value })}
                  className={kelasInput}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-body-medium font-medium text-on-surface" htmlFor="balasan-ke">Reply-to</label>
                <input
                  id="balasan-ke"
                  type="email"
                  maxLength={254}
                  value={settings.email_reply_to ?? ""}
                  placeholder={bawaan?.reply_to ?? "email@organiser.com"}
                  onChange={(event) => set({ email_reply_to: event.target.value })}
                  className={kelasInput}
                />
              </div>
              <p className="text-body-medium text-on-surface-variant">
                {bawaan ? (
                  <>
                    Participants see: <span className="font-medium text-on-surface">{namaTampil ? `${namaTampil} <${bawaan.address}>` : bawaan.address}</span>
                    {balasanTampil ? <>. Replies go to <span className="font-medium text-on-surface">{balasanTampil}</span>.</> : ". Replies go to the sender address."}
                    {" "}Leave empty to use the site default.
                  </>
                ) : "Email sending is not set up on the server, so this name is not used yet."}
              </p>
            </div>
          </SettingRow>

          {/* Kontak panitia: satu sumber untuk halaman acara (bagian Kontak),
              halaman daftar saat ditutup, halaman undangan, dan dashboard
              peserta. Disimpan di landing_config lewat /api/admin/kontak. */}
          {kontak ? (
            <SettingRow
              title="Organiser contacts"
              description={`Up to ${KONTAK_PANITIA_MAX} contacts for participants. All of them show in the organiser contacts section of the event page. The first contact also shows on the registration page when it is closed, on invitations and in the participant area.`}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  {kontak.contact_more.length > 0 ? <p className="text-body-medium font-semibold text-on-surface">Contact 1 (main)</p> : null}
                  {([
                    ["contact_name", "Name", "text", 120, "Event team", true],
                    ["contact_role", "Role", "text", KONTAK_PERAN_MAX, "Head of organising committee", true],
                    ["contact_email", "Email", "email", 160, balasanAcara ?? "team@organiser.com", false],
                    ["contact_phone", "Phone / WhatsApp", "tel", 40, "+62 812-3456-7890", false],
                  ] as const).map(([kunci, label, jenis, maks, contoh, opsional]) => (
                    <div key={kunci}>
                      <label className="mb-1.5 block text-body-medium font-medium text-on-surface" htmlFor={`kontak-${kunci}`}>
                        {label}{opsional ? <span className="font-normal text-on-surface-variant"> (optional)</span> : null}
                      </label>
                      <input
                        id={`kontak-${kunci}`}
                        type={jenis}
                        maxLength={maks}
                        autoComplete="off"
                        value={kontak[kunci]}
                        placeholder={contoh}
                        onChange={(event) => setKontak((sekarang) => sekarang && { ...sekarang, [kunci]: event.target.value })}
                        className={kelasInput}
                      />
                    </div>
                  ))}
                  <p className="text-body-medium text-on-surface-variant">
                    {balasanAcara
                      ? <>Empty email: the Reply-to address is used (<span className="font-medium text-on-surface">{balasanAcara}</span>).</>
                      : "Empty email: the Reply-to address is used if filled in."}
                  </p>
                </div>

                {/* Kontak kedua dan ketiga: hanya di bagian Kontak panitia halaman
                    acara. Halaman yang butuh satu kontak tetap memakai yang utama. */}
                {kontak.contact_more.map((tambahan, urutan) => {
                  const ubahTambahan = (patch: Partial<KontakTambahan>) =>
                    setKontak((sekarang) => sekarang && { ...sekarang, contact_more: sekarang.contact_more.map((item, i) => (i === urutan ? { ...item, ...patch } : item)) });
                  return (
                    <div key={urutan} className="flex flex-col gap-3 border-t border-outline-variant pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-body-medium font-semibold text-on-surface">Contact {urutan + 2}</p>
                        <IconButton
                          size="sm"
                          label={`Delete contact ${urutan + 2}`}
                          onClick={() => setKontak((sekarang) => sekarang && { ...sekarang, contact_more: sekarang.contact_more.filter((_, i) => i !== urutan) })}
                        >
                          <Trash size={16} />
                        </IconButton>
                      </div>
                      {([
                        ["name", "Name", "text", 120, "Budi Santoso", true],
                        ["role", "Role", "text", KONTAK_PERAN_MAX, "Transport", true],
                        ["email", "Email", "email", 160, "team@organiser.com", false],
                        ["phone", "Phone / WhatsApp", "tel", 40, "+62 813-0000-0000", false],
                      ] as const).map(([kunci, label, jenis, maks, contoh, opsional]) => (
                        <div key={kunci}>
                          <label className="mb-1.5 block text-body-medium font-medium text-on-surface" htmlFor={`kontak-${urutan + 2}-${kunci}`}>
                            {label}{opsional ? <span className="font-normal text-on-surface-variant"> (optional)</span> : null}
                          </label>
                          <input
                            id={`kontak-${urutan + 2}-${kunci}`}
                            type={jenis}
                            maxLength={maks}
                            autoComplete="off"
                            value={tambahan[kunci]}
                            placeholder={contoh}
                            onChange={(event) => ubahTambahan({ [kunci]: event.target.value })}
                            className={kelasInput}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {kontak.contact_more.length < KONTAK_PANITIA_MAX - 1 ? (
                    <Button
                      variant="outlined"
                      size="sm"
                      icon={<Plus size={16} />}
                      onClick={() => setKontak((sekarang) => sekarang && { ...sekarang, contact_more: [...sekarang.contact_more, { name: "", role: "", email: "", phone: "" }] })}
                    >
                      Add contact
                    </Button>
                  ) : null}
                  <p className="text-body-medium text-on-surface-variant">
                    The organiser contacts section is turned on and ordered in <Link href="/admin/landing" className="rounded-sm font-medium text-primary hover:underline">Event page</Link>.
                  </p>
                </div>
              </div>
            </SettingRow>
          ) : null}

          <SettingRow title="Hand-over" description="When a booth hands goods to the participant.">
            <div className="flex flex-col gap-2">
              {([["after_payment", "Collect after payment", "Goods stay at the booth. The participant comes back after paying at the cashier."], ["immediate", "Hand over at the booth", "Goods are given when the order is made."]] as const).map(([value, label, desc]) => (
                <PilihanRadio key={value} name="pickup" checked={settings.pickup_mode === value} onSelect={() => set({ pickup_mode: value })} label={label} description={desc} />
              ))}
            </div>
          </SettingRow>

          <SettingRow title="Cashier confirmation" description="Decide before the doors open, not during the event.">
            <div className="flex flex-col gap-2">
              {([[true, "Through the cashier", "Booth orders join the cashier queue. The cashier marks them paid and picks the payment method. The amount counts towards top spender once paid."], [false, "No cashier", "Booth orders are recorded as paid straight away and count towards top spender at once. The cashier queue is not used and no payment method is recorded."]] as const).map(([value, label, desc]) => (
                <PilihanRadio key={String(value)} name="cashier-confirmation" checked={settings.cashier_confirmation_required === value} onSelect={() => set({ cashier_confirmation_required: value })} label={label} description={desc} />
              ))}
            </div>
            {!settings.cashier_confirmation_required ? (
              <Peringatan>
                Without a cashier, nobody else checks the payment. Orders are final when made and <span className="font-medium">no payment method is recorded</span>, so EDC reconciliation cannot be used. Unpaid orders still in the cashier queue are marked paid when you save. A booth can void its own orders with a required reason.
              </Peringatan>
            ) : null}
          </SettingRow>

          <SettingRow title="Auto-void unpaid orders" description="Orders not paid by then are cancelled automatically.">
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="auto-void">Auto-void unpaid orders after (minutes)</label>
              <input
                id="auto-void"
                type="number"
                min={5}
                max={1440}
                value={settings.pending_auto_void_minutes}
                onChange={(event) => set({ pending_auto_void_minutes: Math.max(5, Math.min(1440, Number(event.target.value) || 5)) })}
                className={cx(kelasInput, "w-28 tabular-nums")}
              />
              <span className="text-body-medium text-on-surface-variant">minutes</span>
            </div>
            <p className="mt-1.5 text-body-medium text-on-surface-variant">Between 5 and 1,440 minutes.</p>
          </SettingRow>

          <SettingRow title="Set on other pages">
            <ul className="flex flex-col gap-1.5 text-body-medium text-on-surface-variant">
              <li>Discount items are set per booth (active, limit per participant, stock) in <Link href="/admin/booths" className="rounded-sm font-medium text-primary hover:underline">Booths &amp; items</Link>.</li>
              <li>The leaderboard and name privacy are set in <Link href="/admin/display" className="rounded-sm font-medium text-primary hover:underline">Leaderboard</Link>.</li>
            </ul>
          </SettingRow>
        </PaneBody>
        <PaneFooter
          note={jumlahUbah > 0
            ? `${jumlahUbah} unsaved ${jumlahUbah === 1 ? "change" : "changes"}${waktuUbah ? ` · last changed ${waktuUbah}` : ""}`
            : waktuUbah ? `Last changed ${waktuUbah}` : null}
        >
          {jumlahUbah > 0 ? <Button variant="outlined" size="sm" disabled={saving} onClick={() => { setSettings(saved); setKontak(kontakSaved); setError(""); }}>Cancel</Button> : null}
          <Button simpan size="sm" loading={saving} disabled={jumlahUbah === 0} onClick={() => void save()}>Save changes</Button>
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
      const failure = data.error?.message ?? "Data could not be cleared.";
      setResetError(failure);
      toast.error("Data not cleared", failure);
      return;
    }
    const summary = `${data.deleted_orders} ${data.deleted_orders === 1 ? "order" : "orders"}${data.deleted_participants ? `, ${data.deleted_participants} ${data.deleted_participants === 1 ? "participant" : "participants"}` : ""} deleted.`;
    setResetMessage(`Data deleted: ${summary}`);
    toast.warning("Records cleared", summary);
    setResetPhrase(""); setResetParticipants(false); setResetOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {resetMessage ? <Banner tone="success">{resetMessage}</Banner> : null}
      <Pane aria-label="Danger zone">
        <SettingRow
          title="Clear records"
          description="To start again from zero, for example after a rehearsal. Booth, item, account and display settings stay."
        >
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body-medium text-on-surface-variant">
            <li>Every order of this event and its special item claims. Stock of claimed items is returned.</li>
            <li>Audit entries attached to orders. Entries for setting changes are kept.</li>
            <li>The participant list, only if you choose it in the next step.</li>
          </ul>
          <Button simpan variant="outlined" size="sm" className="mt-4 text-error" icon={<Trash size={16} />} onClick={() => { setResetOpen(true); setResetMessage(""); setResetError(""); }}>
            Clear records
          </Button>
        </SettingRow>
      </Pane>

      <Dialog
        open={resetOpen}
        onClose={tutup}
        dismissible={!resetting}
        tone="danger"
        icon={<Warning size={20} weight="fill" />}
        title="Clear records?"
        description={<>Every order of this event, its special item claims and the order audit entries are deleted{resetParticipants ? ", along with every participant of this event" : ""}. This cannot be undone.</>}
        actions={
          <>
            <Button variant="outlined" disabled={resetting} onClick={tutup}>Cancel</Button>
            <Button variant="danger" loading={resetting} disabled={resetPhrase !== RESET_PHRASE} icon={<Trash size={16} />} onClick={() => void resetRecords()}>Delete permanently</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-body-medium">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={resetParticipants} onChange={(event) => setResetParticipants(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-error" />
            <span>
              <span className="block font-medium">Also delete the participant list</span>
              <span className="mt-0.5 block text-on-surface-variant">Every participant of this event is deleted too, whatever the source. Leave unticked to keep participants.</span>
            </span>
          </label>
          <TextField
            label={<>Type <span className="text-error">{RESET_PHRASE}</span> to confirm</>}
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
