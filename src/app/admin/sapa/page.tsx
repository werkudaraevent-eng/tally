"use client";

import { ArrowSquareOut, FloppyDisk, Monitor, UploadSimple, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/event-link";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { ImagePreview } from "@/components/admin/image-preview";
import { Button, Card, CardHeader, SegmentedButton, SelectField, Switch, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";
import { fontStack } from "@/lib/branding";
import { eventApiPath } from "@/lib/event-url";
import { DEFAULT_GREETING, type GreetingConfig, type GreetingOrientation } from "@/lib/greeting-config";

/**
 * CMS Layar sapa.
 *
 * Layar sapa dipasang di TV dekat pintu masuk dan menampilkan nama tamu begitu
 * QR-nya dipindai di /scan. Halaman ini yang menentukan rupanya.
 *
 * Pratinjaunya sengaja di halaman ini, bukan hanya berupa tautan "buka layar".
 * Warna latar, warna teks, dan huruf dipilih di sini tetapi baru terlihat
 * benar-benar salah setelah ditayangkan di TV besar di lobi — dan pada saat itu
 * yang bisa memperbaikinya sedang berdiri di ruangan lain.
 */

type Sesi = { id: number; name: string; is_active: boolean };

/**
 * Satu TV yang pernah mendaftarkan dirinya ke acara ini.
 *
 * `alive` dan `idle_minutes` datang dari server, bukan dihitung di sini:
 * keduanya membaca jam sekarang, dan membaca jam saat menggambar membuat
 * komponen menghasilkan keluaran berbeda pada render yang sama.
 */
type Layar = {
  id: number;
  lane: { id: number | null; name: string; slug: string } | null;
  claimed_at: string | null;
  last_seen_at: string;
  alive: boolean;
  idle_minutes: number;
};

const diamnya = (menit: number) => {
  if (menit < 1) return "barusan";
  if (menit < 60) return `${menit} menit lalu`;
  return `${Math.floor(menit / 60)} jam lalu`;
};

/** Nama contoh untuk pratinjau. Bukan nama peserta sungguhan. */
const CONTOH = { name: "Hanung Sastriya", company: "Werkudara Group" };

export default function SapaAdminPage() {
  const [config, setConfig] = useState<GreetingConfig>(DEFAULT_GREETING);
  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [screens, setScreens] = useState<Layar[]>([]);
  const [url, setUrl] = useState("/sapa");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [kotor, setKotor] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/sapa"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { toast.error("Setelan gagal dimuat", "Muat ulang halaman."); return; }
    const body = await response.json();
    setConfig(body.config as GreetingConfig);
    setSessions((body.sessions ?? []) as Sesi[]);
    setScreens((body.screens ?? []) as Layar[]);
    setUrl(body.url ?? "/sapa");
    setKotor(false);
  }, [toast]);

  /**
   * Menyegarkan HANYA daftar layar, tanpa menimpa setelan yang sedang disunting.
   *
   * `load()` penuh akan menarik konfigurasi dari server dan membuang perubahan
   * yang belum disimpan — tepat ketika admin sedang memilih warna dan daftar di
   * sebelahnya kebetulan menyegarkan diri.
   */
  const muatLayar = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/sapa"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => null);
    if (body?.screens) setScreens(body.screens as Layar[]);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    // 15 detik: panitia membuka halaman ini persis saat memasang TV di lobi, dan
    // yang ditunggunya adalah baris baru muncul setelah kode diketik di ponsel.
    const poll = window.setInterval(() => void muatLayar(), 15_000);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); };
  }, [load, muatLayar]);

  async function lepasLayar(layar: Layar) {
    const response = await fetch(eventApiPath(`/api/admin/sapa?screen=${layar.id}`), { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { toast.error("Gagal dilepas", "Coba lagi."); return; }
    toast.success("Layar dilepas", "TV itu akan menampilkan kode baru dalam beberapa detik.");
    void muatLayar();
  }

  function update(changes: Partial<GreetingConfig>) {
    setConfig((current) => ({ ...current, ...changes }));
    setKotor(true);
  }

  async function simpan() {
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/sapa"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      const rincian = body?.error?.details as Record<string, unknown> | undefined;
      toast.error("Gagal disimpan", rincian ? String(Object.values(rincian)[0]) : "Coba lagi.");
      return;
    }
    setKotor(false);
    toast.success("Tersimpan", "Layar yang sedang menyala ikut berubah dalam beberapa detik.");
  }

  /** Endpoint unggah yang sama dengan latar papan peringkat — aturan format dan ukurannya sudah ada di sana. */
  async function unggahLatar(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", "backgrounds");
    const response = await fetch("/api/display/background", { method: "POST", body: form }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setUploading(false);
    if (!response?.ok) {
      toast.error("Upload gagal", body?.error?.details?.file ?? "Coba gambar lain.");
      return;
    }
    update({ background_image_url: body.url as string });
  }

  const potret = config.orientation === "portrait";

  return (
    <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <p className="max-w-2xl text-body-medium leading-6 text-on-surface-variant">
            Layar di dekat pintu masuk yang menyapa tamu dengan namanya begitu QR-nya dipindai di{" "}
            <code>/scan</code>. Nama muncul beberapa detik, lalu digantikan tamu berikutnya.
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/sapa"
              target="_blank"
              rel="noreferrer"
              className="m3-state inline-flex min-h-12 items-center gap-2 rounded-full border border-outline px-5 text-label-large"
            >
              <Monitor size={18} />
              Buka layar sapa
              <ArrowSquareOut size={14} className="opacity-70" />
            </Link>
          </div>
        </div>

        {/* Peringatan privasi berdiri di dekat tombol yang membuka layarnya,
            bukan terkubur di bawah setelan warna. Alamat ini tidak meminta login
            — sama seperti papan peringkat dan denah LED — dan yang memutuskan
            boleh-tidaknya memajang nama tamu adalah panitia, bukan kode ini. */}
        <p className="mt-5 rounded-lg bg-warning-soft p-4 text-body-medium text-on-warning-soft">
          Alamat <code>{url}</code> terbuka tanpa login, sama seperti layar acara lainnya. Ia menampilkan nama tamu
          yang baru masuk, jadi perlakukan alamatnya seperti kabel HDMI di ruangan: bagikan seperlunya. Peserta yang
          mematikan &ldquo;boleh tampil di layar&rdquo; tetap disapa, tetapi dengan inisial.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader title="Isi layar" subtitle="Kalimat yang tampil di atas nama, dan pesan saat belum ada yang masuk." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Judul layar"
                  value={config.headline}
                  maxLength={80}
                  onChange={(event) => update({ headline: event.target.value })}
                />
                <TextField
                  label="Pesan saat sepi"
                  hint="Tampil di antara kedatangan. Layar kosong terbaca sebagai layar rusak."
                  value={config.idle_message}
                  maxLength={160}
                  onChange={(event) => update({ idle_message: event.target.value })}
                />
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Sesi yang disapa"
                  hint="Biasanya Registrasi. Sesi lain seperti makan siang jarang perlu disambut."
                  value={config.session_id ?? ""}
                  onChange={(event) => update({ session_id: Number(event.target.value) || null })}
                >
                  <option value="">Semua sesi</option>
                  {sessions.map((sesi) => (
                    <option key={sesi.id} value={sesi.id}>
                      {sesi.name}{sesi.is_active ? "" : " (ditutup)"}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Nama bertahan (detik)"
                  type="number"
                  min={3}
                  max={60}
                  value={config.hold_seconds}
                  hint="3–60. Terlalu lama berarti antrean sapaan menumpuk di jam sibuk."
                  onChange={(event) => update({ hold_seconds: Number(event.target.value) || 8 })}
                />
              </div>

              <div className="mt-5 space-y-4 border-t border-outline-variant pt-5">
                <Switch
                  checked={config.show_company}
                  onChange={(value) => update({ show_company: value })}
                  label="Tampilkan instansi di bawah nama"
                />
                <Switch
                  checked={config.greet_duplicates}
                  onChange={(value) => update({ greet_duplicates: value })}
                  label="Sapa juga pemindaian ulang"
                />
                <p className="text-body-small text-on-surface-variant">
                  Bawaannya mati. Panitia yang keluar-masuk ruangan akan menyapu nama tamu dari layar setiap kali
                  lewat.
                </p>
                <Switch
                  checked={config.show_recent}
                  onChange={(value) => update({ show_recent: value })}
                  label="Tampilkan deretan “baru saja masuk”"
                />
                {config.show_recent ? (
                  <TextField
                    label="Berapa nama di deretan"
                    type="number"
                    min={1}
                    max={12}
                    value={config.recent_limit}
                    onChange={(event) => update({ recent_limit: Number(event.target.value) || 6 })}
                    className="max-w-[220px]"
                  />
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader title="Orientasi" subtitle="Ditentukan di sini, bukan ditebak dari ukuran layar." />
              {/* SegmentedButton, bukan Tabs: yang berubah adalah SETELAN, bukan
                  tampilan halaman ini. */}
              <SegmentedButton<GreetingOrientation>
                className="mt-4"
                label="Orientasi layar sapa"
                value={config.orientation}
                onChange={(value) => update({ orientation: value })}
                options={[
                  { value: "landscape", label: "Melintang (16:9)" },
                  { value: "portrait", label: "Berdiri (9:16)" },
                ]}
              />
              <p className="mt-3 text-body-small text-on-surface-variant">
                Panel yang dipasang berdiri sering tetap melaporkan 1920×1080 ke browser dan memutar gambarnya
                sendiri, jadi menebaknya dari lebar layar akan salah. Untuk mengintip yang satunya tanpa mengubah
                setelan, buka <code>{url}?orientasi={potret ? "landscape" : "portrait"}</code>.
              </p>
            </Card>

            <Card>
              <CardHeader title="Warna dan latar" />
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {([
                  ["background_color", "Latar"],
                  ["text_color", "Teks"],
                  ["accent_color", "Aksen"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block text-label-large font-semibold">
                    {label}
                    <span className="mt-2 flex items-center gap-2">
                      <input
                        type="color"
                        value={config[key]}
                        onChange={(event) => update({ [key]: event.target.value } as Partial<GreetingConfig>)}
                        className="h-12 w-14 cursor-pointer rounded-md border border-outline bg-surface"
                      />
                      <input
                        value={config[key]}
                        onChange={(event) => update({ [key]: event.target.value } as Partial<GreetingConfig>)}
                        className="h-12 w-full rounded-md border border-outline bg-surface-container-lowest px-3 font-mono text-body-medium uppercase outline-none focus:border-primary"
                      />
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-5">
                <p className="text-label-large font-semibold">
                  Gambar latar <span className="font-normal text-on-surface-variant">opsional</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="m3-state inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-5 text-label-large">
                    <UploadSimple size={18} />
                    {uploading ? "Mengunggah…" : "Pilih gambar"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void unggahLatar(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {config.background_image_url ? (
                    <>
                      <ImagePreview url={config.background_image_url} alt="Latar layar sapa" fit="cover" />
                      <Button
                        variant="text"
                        size="sm"
                        icon={<XCircle size={18} />}
                        onClick={() => update({ background_image_url: null })}
                      >
                        Hapus
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 border-t border-outline-variant pt-5">
                <BrandingEditor
                  value={config}
                  onChange={(changes) => update(changes)}
                  idPrefix="sapa"
                  baseTextColor={config.text_color}
                  baseBackgroundColor={config.background_color}
                  baseAccentColor={config.accent_color}
                />
              </div>
            </Card>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-[88px]">
            <Card>
              <CardHeader title="Status" />
              <div className="mt-4">
                <Switch
                  checked={config.is_enabled}
                  onChange={(value) => update({ is_enabled: value })}
                  label="Layar sapa aktif"
                />
              </div>
              <p className="mt-3 text-body-small text-on-surface-variant">
                Saat dimatikan, layar tetap menyala dengan judul dan pesan sepi — tidak ada nama yang dikirim ke sana.
                Alamatnya tidak berubah, jadi TV di lobi tidak perlu disentuh.
              </p>

              <Button
                className="mt-5"
                block
                size="lg"
                loading={busy}
                disabled={!kotor}
                icon={<FloppyDisk size={20} weight="bold" />}
                onClick={() => void simpan()}
              >
                {kotor ? "Simpan perubahan" : "Tersimpan"}
              </Button>
            </Card>

            <Card>
              <CardHeader
                title="Layar terhubung"
                subtitle="Satu baris per TV yang pernah membuka alamat ini."
                trailing={
                  <span className="text-label-large tabular-nums text-on-surface-variant">{screens.length}</span>
                }
              />
              {screens.length === 0 ? (
                <p className="mt-3 text-body-small text-on-surface-variant">
                  Belum ada TV yang membuka layar sapa. Buka alamatnya di TV dan ia langsung menyapa. Kode enam angka
                  baru diminta kalau acara ini punya <strong>lebih dari satu</strong> jalur — di situ TV perlu diberi
                  tahu melayani meja yang mana.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-outline-variant">
                  {screens.map((layar) => (
                    <li key={layar.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-body-medium font-semibold">
                          {layar.lane?.name ?? "Belum dipasang ke jalur"}
                        </p>
                        {/* Keadaan dibawa ikon DAN teks, bukan warna saja. */}
                        <p className="mt-0.5 flex items-center gap-1.5 text-body-small text-on-surface-variant">
                          {layar.alive ? <Monitor size={14} weight="fill" /> : <XCircle size={14} weight="fill" />}
                          {layar.alive ? "menyala" : `terakhir ${diamnya(layar.idle_minutes)}`}
                        </p>
                      </div>
                      <Button variant="text" size="sm" onClick={() => void lepasLayar(layar)}>
                        Lepas
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Pratinjau" subtitle="Proporsi dan warnanya, bukan ukuran hurufnya di TV." />
              <div
                className={`mt-4 flex w-full flex-col items-center justify-center overflow-hidden rounded-lg p-4 text-center ${
                  potret ? "aspect-[9/16]" : "aspect-video"
                }`}
                style={{
                  background: config.background_color,
                  color: config.text_color,
                  fontFamily: fontStack(config.heading_font),
                  backgroundImage: config.background_image_url ? `url(${config.background_image_url})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <p className="text-label-small font-semibold uppercase opacity-70" style={{ color: config.title_color ?? config.text_color }}>
                  {config.headline}
                </p>
                <p className="mt-2 text-title-large font-bold leading-tight" style={{ color: config.title_color ?? config.text_color }}>
                  {CONTOH.name}
                </p>
                <span className="mt-2 block h-1 w-12 rounded-full" style={{ background: config.accent_color }} />
                {config.show_company ? (
                  <p className="mt-2 text-body-small opacity-80" style={{ color: config.subtitle_color ?? config.text_color }}>
                    {CONTOH.company}
                  </p>
                ) : null}
                {config.show_recent ? (
                  <p className="mt-4 text-label-small opacity-50">baru saja masuk · {config.recent_limit} nama</p>
                ) : null}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
