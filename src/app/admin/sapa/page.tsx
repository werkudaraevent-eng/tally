"use client";

import { pesanGalatApi } from "@/lib/api-message";
import { ArrowClockwise, ArrowSquareOut, Info, UploadSimple, Warning, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { ImagePreview } from "@/components/admin/image-preview";
import {
  Banner, Button, ButtonLink, DetailSection, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, SelectField, StatusChip, StatusDot, SupportingPane, Switch, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { fontStack } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
import { eventApiPath } from "@/lib/event-url";
import { DEFAULT_GREETING, type GreetingConfig, type GreetingOrientation } from "@/lib/greeting-config";

/**
 * CMS Layar sapa. Supporting pane: pratinjau TV dan daftar layar terhubung di
 * panel utama (yang dipantau saat acara), setelan di panel kanan.
 *
 * Layar sapa dipasang di TV dekat pintu masuk dan menampilkan nama tamu begitu
 * QR-nya dipindai di /scan. Pratinjaunya sengaja di halaman ini: warna dan huruf
 * yang salah baru ketahuan di TV lobi, saat yang bisa memperbaikinya sedang
 * berdiri di ruangan lain.
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

type Bagian = "isi" | "tampilan";

const diamnya = (menit: number) => {
  if (menit < 1) return "barusan";
  if (menit < 60) return `${menit} menit lalu`;
  return `${Math.floor(menit / 60)} jam lalu`;
};

/** Nama contoh untuk pratinjau. Bukan nama peserta sungguhan. */
const CONTOH = { name: "Hanung Sastriya", company: "Werkudara Group" };

function WarnaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-body-medium font-medium text-on-surface">
      {label}
      <span className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label}, pemilih warna`}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline bg-surface-container-lowest"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label}, kode warna`}
          className="h-9 w-full min-w-0 rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium tabular-nums text-on-surface outline-none focus:border-primary"
        />
      </span>
    </label>
  );
}

/**
 * Pratinjau proporsi dan warna. Ukuran huruf mengikuti lebar pratinjau (`cqw`),
 * jadi perbandingannya tetap sama di panel lebar maupun sempit.
 */
function Pratinjau({ config }: { config: GreetingConfig }) {
  const potret = config.orientation === "portrait";
  const judul = config.title_color ?? config.text_color;
  const deretan = Math.min(config.recent_limit, potret ? 3 : 4);
  return (
    <div
      className={cx(
        "@container flex flex-col overflow-hidden rounded-lg border border-outline-variant",
        potret ? "aspect-[9/16] w-[min(100%,300px)]" : "aspect-video w-full max-w-[720px]",
      )}
      style={{
        background: config.background_color,
        color: config.text_color,
        fontFamily: fontStack(config.heading_font),
        backgroundImage: config.background_image_url ? `url(${config.background_image_url})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-[6cqw] text-center">
        <p className="font-semibold opacity-70" style={{ color: judul, fontSize: potret ? "4.5cqw" : "2.2cqw" }}>{config.headline}</p>
        <p className="mt-[1.5cqw] font-semibold leading-tight" style={{ color: judul, fontSize: potret ? "10cqw" : "6cqw" }}>{CONTOH.name}</p>
        <span className="mt-[2cqw] block h-[0.6cqw] w-[12cqw] rounded-full" style={{ background: config.accent_color }} />
        {config.show_company ? (
          <p className="mt-[2cqw] opacity-80" style={{ color: config.subtitle_color ?? config.text_color, fontSize: potret ? "5cqw" : "2.6cqw" }}>{CONTOH.company}</p>
        ) : null}
      </div>
      {config.show_recent ? (
        <div className="shrink-0 px-[4cqw] pb-[3cqw]">
          <p className="mb-[1.2cqw] font-semibold opacity-50" style={{ fontSize: potret ? "3.4cqw" : "1.6cqw" }}>Baru saja masuk</p>
          <div className={cx("flex gap-[1.2cqw]", potret ? "flex-col" : "flex-wrap justify-center")}>
            {Array.from({ length: deretan }, (_, index) => (
              <span
                key={index}
                className="rounded-full px-[2cqw] py-[0.8cqw] font-semibold"
                style={{ fontSize: potret ? "3.6cqw" : "1.8cqw", background: `color-mix(in srgb, ${config.text_color} 12%, transparent)` }}
              >
                Tamu {index + 1}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SapaAdminPage() {
  const [config, setConfig] = useState<GreetingConfig>(DEFAULT_GREETING);
  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [screens, setScreens] = useState<Layar[]>([]);
  const [url, setUrl] = useState("/sapa");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [kotor, setKotor] = useState(false);
  // Setelan belum terbaca = tidak ada yang boleh disimpan. Tanpa penanda ini,
  // kegagalan memuat meninggalkan nilai bawaan di form, dan Simpan akan
  // menimpa setelan asli dengan bawaan itu.
  const [muat, setMuat] = useState<"memuat" | "siap" | "galat">("memuat");
  // Status aktif yang SUDAH tersimpan, untuk baris meta. Sakelar di kepala
  // halaman adalah draf sampai Simpan ditekan.
  const [aktifTersimpan, setAktifTersimpan] = useState(false);
  const [bagian, setBagian] = useState<Bagian>("isi");
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/sapa"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setMuat("galat"); toast.error("Setelan gagal dimuat", "Muat ulang halaman."); return; }
    const body = await response.json();
    const nextConfig = body.config as GreetingConfig;
    setConfig(nextConfig);
    setAktifTersimpan(nextConfig.is_enabled);
    setSessions((body.sessions ?? []) as Sesi[]);
    setScreens((body.screens ?? []) as Layar[]);
    setUrl(body.url ?? "/sapa");
    setKotor(false);
    setMuat("siap");
  }, [toast]);

  /**
   * Menyegarkan HANYA daftar layar, tanpa menimpa setelan yang sedang disunting.
   * `load()` penuh akan membuang perubahan yang belum disimpan tepat ketika
   * admin sedang memilih warna dan daftarnya kebetulan menyegarkan diri.
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
      toast.error("Gagal disimpan", pesanGalatApi(body) ?? "Coba lagi.");
      return;
    }
    setKotor(false);
    setAktifTersimpan(config.is_enabled);
    toast.success("Tersimpan", "Layar yang sedang menyala ikut berubah dalam beberapa detik.");
  }

  /** Endpoint unggah yang sama dengan latar papan peringkat; aturan format dan ukurannya sudah ada di sana. */
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
  const menyala = screens.filter((layar) => layar.alive).length;

  // ---- Panel utama: pratinjau TV dan layar terhubung --------------------------
  const utama = (
    <Pane aria-label="Pratinjau dan layar terhubung">
      <PaneHeader className="flex-wrap">
        <span className="min-w-0 flex-1 text-body-medium text-on-surface-variant">Pratinjau · proporsi dan warna</span>
        {/* SegmentedButton, bukan Tabs: yang berubah adalah SETELAN orientasi,
            dan pratinjaunya ikut. */}
        <SegmentedButton<GreetingOrientation>
          label="Orientasi layar sapa"
          value={config.orientation}
          onChange={(value) => update({ orientation: value })}
          options={[
            { value: "landscape", label: "Melintang 16:9" },
            { value: "portrait", label: "Berdiri 9:16" },
          ]}
        />
      </PaneHeader>
      <PaneBody>
        <div className="flex flex-col items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-6 sm:px-6">
          <Pratinjau config={config} />
          <p className="max-w-[720px] text-center text-body-medium text-on-surface-variant">
            Ukuran huruf di TV berbeda. Panel yang dipasang berdiri sering tetap melaporkan 1920×1080, jadi orientasi
            dipilih di sini, bukan ditebak. Untuk mengintip orientasi lain tanpa mengubah setelan, buka{" "}
            <span className="break-all text-on-surface">{url}?orientasi={potret ? "landscape" : "portrait"}</span>.
          </p>
        </div>

        <section aria-labelledby="layar-terhubung">
          <div className="flex items-center gap-2 px-4 pb-2 pt-4">
            <h2 id="layar-terhubung" className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Layar terhubung</h2>
            <span className="text-body-medium tabular-nums text-on-surface-variant">{screens.length} TV</span>
          </div>
          {screens.length === 0 ? (
            <p className="px-4 pb-5 text-body-medium text-on-surface-variant">
              Belum ada TV yang membuka layar sapa. Buka alamatnya di TV dan layar langsung menyapa. Kode enam angka
              baru diminta kalau acara ini punya lebih dari satu jalur, supaya TV tahu melayani meja yang mana.
            </p>
          ) : (
            <ul>
              {screens.map((layar) => (
                <li key={layar.id} className="flex items-center gap-3 border-t border-outline-variant px-4 py-2 text-body-medium">
                  {/* Keadaan dibawa titik DAN teks, bukan warna saja. */}
                  <StatusDot tone={layar.alive ? "success" : "neutral"} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-on-surface">{layar.lane?.name ?? "Belum dipasang ke jalur"}</span>
                    <span className="ml-2 text-on-surface-variant">{layar.alive ? "menyala" : `terakhir ${diamnya(layar.idle_minutes)}`}</span>
                  </span>
                  <Button variant="text" size="sm" aria-label={`Lepas ${layar.lane?.name ?? "layar tanpa jalur"}`} onClick={() => void lepasLayar(layar)}>
                    Lepas
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PaneBody>
    </Pane>
  );

  // ---- Panel pendukung: setelan -------------------------------------------------
  const isi = (
    <>
      <DetailSection title="Teks">
        <div className="flex flex-col gap-4">
          <TextField label="Judul layar" value={config.headline} maxLength={80} onChange={(event) => update({ headline: event.target.value })} />
          <TextField
            label="Pesan saat sepi"
            hint="Tampil di antara kedatangan. Layar kosong terbaca sebagai layar rusak."
            value={config.idle_message}
            maxLength={160}
            onChange={(event) => update({ idle_message: event.target.value })}
          />
        </div>
      </DetailSection>
      <DetailSection title="Penyapaan">
        <div className="flex flex-col gap-4">
          <SelectField
            label="Sesi yang disapa"
            hint="Biasanya Registrasi. Sesi lain seperti makan siang jarang perlu disambut."
            value={config.session_id ?? ""}
            onChange={(event) => update({ session_id: Number(event.target.value) || null })}
          >
            <option value="">Semua sesi</option>
            {sessions.map((sesi) => (
              <option key={sesi.id} value={sesi.id}>{sesi.name}{sesi.is_active ? "" : " (ditutup)"}</option>
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
            className="max-w-[160px]"
            inputClassName="tabular-nums"
          />
          <Switch checked={config.show_company} onChange={(value) => update({ show_company: value })} label="Tampilkan instansi" description="Di bawah nama tamu." />
          <Switch
            checked={config.greet_duplicates}
            onChange={(value) => update({ greet_duplicates: value })}
            label="Sapa pemindaian ulang"
            description="Bawaannya mati. Panitia yang keluar-masuk ruangan tidak ikut menyapu nama tamu dari layar."
          />
          <Switch
            checked={config.show_recent}
            onChange={(value) => update({ show_recent: value })}
            label="Deretan “baru saja masuk”"
            description="Nama-nama terakhir di bagian bawah layar."
          />
          {config.show_recent ? (
            <TextField
              label="Berapa nama di deretan"
              type="number"
              min={1}
              max={12}
              value={config.recent_limit}
              onChange={(event) => update({ recent_limit: Number(event.target.value) || 6 })}
              className="max-w-[160px]"
              inputClassName="tabular-nums"
            />
          ) : null}
        </div>
      </DetailSection>
      <DetailSection>
        <p className="flex items-start gap-2 text-body-medium text-on-surface-variant">
          <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
          Peserta yang mematikan izin tampil di layar tetap disapa, tetapi dengan inisial.
        </p>
      </DetailSection>
    </>
  );

  const tampilan = (
    <>
      <DetailSection title="Warna">
        <div className="flex flex-col gap-3">
          {([
            ["background_color", "Latar"],
            ["text_color", "Teks"],
            ["accent_color", "Aksen"],
          ] as const).map(([key, label]) => (
            <WarnaField key={key} label={label} value={config[key]} onChange={(value) => update({ [key]: value } as Partial<GreetingConfig>)} />
          ))}
        </div>
      </DetailSection>
      <DetailSection title="Gambar latar">
        <div className="flex flex-wrap items-center gap-3">
          <label className={cx(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium font-medium text-on-surface hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
            uploading && "pointer-events-none opacity-60",
          )}>
            <UploadSimple size={16} aria-hidden />
            {uploading ? "Mengunggah..." : "Pilih gambar"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void unggahLatar(file);
                event.target.value = "";
              }}
            />
          </label>
          {config.background_image_url ? (
            <Button variant="text" size="sm" icon={<XCircle size={16} />} onClick={() => update({ background_image_url: null })}>Hapus gambar</Button>
          ) : null}
        </div>
        {config.background_image_url ? (
          <ImagePreview url={config.background_image_url} alt="Latar layar sapa" fit="cover" className="h-16 w-28" />
        ) : (
          <p className="text-body-medium text-on-surface-variant">Opsional. Tanpa gambar, layar memakai warna latar.</p>
        )}
      </DetailSection>
      <DetailSection title="Header & footer">
        <BrandingEditor
          value={config}
          onChange={(changes) => update(changes)}
          idPrefix="sapa"
          baseTextColor={config.text_color}
          baseBackgroundColor={config.background_color}
          baseAccentColor={config.accent_color}
        />
      </DetailSection>
    </>
  );

  const panel = (
    <Pane as="aside" aria-label="Setelan layar sapa">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<Bagian>
          label="Bagian setelan"
          value={bagian}
          onChange={setBagian}
          className="w-full"
          options={[{ value: "isi", label: "Isi" }, { value: "tampilan", label: "Tampilan" }]}
        />
      </div>
      <PaneBody>{bagian === "isi" ? isi : tampilan}</PaneBody>
      <PaneFooter note={kotor ? "Ada perubahan yang belum disimpan" : "Layar yang menyala ikut berubah"}>
        <Button size="sm" loading={busy} disabled={!kotor} onClick={() => void simpan()}>Simpan</Button>
      </PaneFooter>
    </Pane>
  );

  let meta: ReactNode = null;
  if (muat === "siap") {
    meta = (
      <>
        <StatusChip dot tone={aktifTersimpan ? "success" : "neutral"}>{aktifTersimpan ? "Aktif" : "Nonaktif"}</StatusChip>
        <span className="tabular-nums">{screens.length === 0 ? "Belum ada TV terhubung" : `${menyala} dari ${screens.length} TV menyala`}</span>
        <MetaSeparator />
        {/* Alamat layar tidak meminta login, sama seperti papan peringkat dan
            denah LED. Yang memutuskan boleh-tidaknya memajang nama tamu adalah
            panitia, jadi peringatannya berdiri di kepala halaman. */}
        <span>Alamat publik tanpa login, bagikan seperlunya</span>
      </>
    );
  }

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={meta}
        actions={
          <>
            {muat === "siap" ? (
              <Switch
                checked={config.is_enabled}
                onChange={(value) => update({ is_enabled: value })}
                label="Layar sapa aktif"
              />
            ) : null}
            <ButtonLink href="/sapa" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Buka layar sapa</ButtonLink>
          </>
        }
      />

      {muat === "memuat" ? <PageLoading /> : null}

      {muat === "galat" ? (
        <Banner
          tone="error"
          icon={<Warning size={18} />}
          actions={<Button variant="outlined" size="sm" icon={<ArrowClockwise size={16} />} onClick={() => { setMuat("memuat"); void load(); }}>Muat ulang</Button>}
        >
          Setelan layar sapa gagal dimuat. Form disembunyikan supaya setelan asli tidak tertimpa nilai bawaan.
        </Banner>
      ) : null}

      {muat === "siap" ? (
        <>
          {!config.is_enabled ? (
            <Banner tone="warning" icon={<Info size={18} />}>
              Layar sapa {kotor && aktifTersimpan ? "akan dinonaktifkan setelah disimpan" : "nonaktif"}. TV tetap menampilkan judul dan pesan sepi,
              tanpa nama tamu. Alamatnya tidak berubah, jadi TV di lobi tidak perlu disentuh.
            </Banner>
          ) : null}
          <SupportingPane main={utama} pane={panel} />
        </>
      ) : null}
    </WorkspacePage>
  );
}
