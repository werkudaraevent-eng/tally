"use client";

import { ArrowsClockwise, Info, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Banner, Button, Dialog, KeyValue, Pane, PaneBody, PaneFooter, PaneHeader, SelectMenu, StatusDot, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";
import { bacaLokal, langgananLokal, tulisLokal } from "@/lib/local-store";
import { plural } from "@/lib/plural";

/**
 * Integrasi Scanner API: setelan, status, dan sinkronisasi manual.
 *
 * ---- Kenapa pindah dari halaman Daftar peserta ----------------------------
 *
 * Panel ini dulu berdiri di puncak layar yang paling sering dibuka sepanjang
 * acara, dan memakan sekitar sepertiga tinggi layar untuk lima nilai yang diisi
 * SEKALI saat acara disiapkan: base URL, slug, kunci, interval, dan tombol
 * setelannya. Yang di bawahnya — tabel peserta — dibaca terus-menerus.
 *
 * Tempat barunya tab "Integrasi" di dalam Pengaturan, bukan halaman sidebar
 * baru. Sidebar disisakan untuk tujuan yang ditekan panitia sepanjang hari, dan
 * Pengaturan sudah menjadi rumah bagi hal-hal yang disiapkan sekali lalu
 * ditinggalkan: preferensi acara, metode pembayaran, jejak audit.
 *
 * ---- Yang TIDAK ikut pindah ----------------------------------------------
 *
 * Pewaktu sinkronisasi otomatis. Ia interval di peramban, jadi ia hanya berjalan
 * selama tabnya terbuka — dan tidak ada yang duduk di halaman Pengaturan selama
 * acara. Intervalnya sekarang berjalan di halaman Daftar peserta, yang memang
 * terbuka sepanjang hari, sementara PILIHANNYA tetap di sini. Nilainya disimpan
 * di localStorage; sebelumnya ia state komponen yang hilang setiap kali orang
 * berpindah menu, sehingga "Tiap 5 menit" praktis tidak pernah benar-benar
 * berjalan lima menit.
 */

export type ScannerConfig = {
  base_url: string | null;
  event_slug: string | null;
  key_masked: string | null;
  key_set: boolean;
  participant_source: string;
  env_fallback: { base_url: boolean; key: boolean; event_slug: boolean };
};

const KUNCI_AUTO = "tally:scanner-auto-minutes";

const OPSI_AUTO = [
  { value: "0", label: "Off" },
  { value: "5", label: "Every 5 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every 60 minutes" },
];

/** Nilai kosong yang referensinya tetap. Lihat catatan di `lib/local-store`. */
const NOL = 0;

/**
 * Interval sinkronisasi otomatis, dibaca dua tempat: pemilihnya di panel ini,
 * pewaktunya di halaman Daftar peserta. Satu sumber, bukan dua salinan.
 */
export function useAutoSync() {
  const menit = useSyncExternalStore(
    langgananLokal,
    () => bacaLokal<number>(KUNCI_AUTO, NOL),
    () => NOL,
  );
  const setMenit = useCallback((nilai: number) => tulisLokal(KUNCI_AUTO, nilai), []);
  return { menit, setMenit };
}

/** Nama sumber peserta dalam bahasa panitia. Nilai kolomnya tetap ditampilkan kecil. */
const LABEL_SUMBER: Record<string, string> = {
  public_form: "Public form",
  scanner_api: "Scanner API",
  manual: "Manual",
  hybrid: "Combined",
};

export function useScannerConfig() {
  const [config, setConfig] = useState<ScannerConfig | null>(null);
  // Tambahan untuk panel Integrasi: tanpa ini, gagal memuat terlihat sama
  // dengan "masih memuat" selamanya. Pemakai lama cukup membaca `config`.
  const [galat, setGalat] = useState(false);

  const muat = useCallback(async () => {
    setGalat(false);
    const response = await fetch("/api/admin/participants/scanner-config", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setGalat(true); return; }
    setConfig((await response.json()) as ScannerConfig);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void muat(); }, 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  return { config, muat, galat };
}

/**
 * Sinkronisasi manual. Dipakai panel ini DAN tautan ringkas di kepala halaman
 * Daftar peserta, jadi penanganan galat dan toast-nya ditulis sekali.
 */
export function useScannerSync(onSynced?: () => void) {
  const [syncing, setSyncing] = useState(false);
  const [gagal, setGagal] = useState("");
  const toast = useToast();

  const sync = useCallback(async () => {
    setSyncing(true);
    setGagal("");
    try {
      const response = await fetch("/api/admin/participants/sync", { method: "POST", signal: AbortSignal.timeout(90000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const pesan = data.error?.message ?? `Participant sync failed (HTTP ${response.status}).`;
        setGagal(pesan);
        toast.error("Participant sync failed", pesan);
        return;
      }
      toast.success(`${plural(Number(data.synced) || 0, "participant")} synced`, `Total at source: ${data.source_total}.`);
      onSynced?.();
    } catch (error) {
      const pesan = error instanceof DOMException && error.name === "TimeoutError"
        ? "Sync took too long. Check the API client connection and try again."
        : "Sync failed because the connection was lost. Try again.";
      setGagal(pesan);
      toast.error("Participant sync failed", pesan);
    } finally {
      setSyncing(false);
    }
  }, [toast, onSynced]);

  return { syncing, sync, gagal };
}

/** Nilai yang belum diisi. "Belum diatur", bukan garis: garis berarti "tidak berlaku". */
function BelumDiatur() {
  return <span className="text-on-surface-variant">Not set</span>;
}

function DariEnv() {
  return <span className="text-on-surface-variant">From environment variable</span>;
}

export function ScannerPanel() {
  const { config, muat, galat: galatMuat } = useScannerConfig();
  const { menit, setMenit } = useAutoSync();
  const { syncing, sync } = useScannerSync();
  const toast = useToast();

  const [ubah, setUbah] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);

  function bukaUbah() {
    setBaseUrl(config?.base_url ?? "");
    setEventSlug(config?.event_slug ?? "");
    setApiKey("");
    setGalat("");
    setUbah(true);
  }

  async function simpan() {
    setMenyimpan(true);
    setGalat("");
    const response = await fetch("/api/admin/participants/scanner-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_url: baseUrl.trim() || null,
        event_slug: eventSlug.trim() || null,
        // Kolom kunci yang dibiarkan kosong berarti "jangan sentuh", bukan
        // "hapus". Menyamakan keduanya membuat setiap penyimpanan slug diam-diam
        // mematikan sinkronisasi.
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      }),
    }).catch(() => null);
    setMenyimpan(false);
    if (!response) { setGalat("Connection lost. Settings not saved."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const pesan = body.error?.details?.message ?? body.error?.message ?? "Couldn't save settings.";
      setGalat(pesan);
      toast.error("Couldn't save Scanner API settings", pesan);
      return;
    }
    setApiKey("");
    setUbah(false);
    toast.success("Scanner API settings saved");
    void muat();
  }

  async function hapusKunci() {
    setMenyimpan(true);
    const response = await fetch("/api/admin/participants/scanner-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_url: baseUrl.trim() || null, event_slug: eventSlug.trim() || null, api_key: null }),
    }).catch(() => null);
    setMenyimpan(false);
    setKonfirmasiHapus(false);
    if (!response?.ok) { setGalat("Couldn't delete the key."); return; }
    toast.success("API key deleted", "Sync will fall back to the environment variable if one is set.");
    void muat();
  }

  const sumber = config?.participant_source ?? "";
  const dipakai = ["scanner_api", "hybrid"].includes(sumber);

  return (
    <>
      <Pane aria-label="Scanner API">
        <PaneHeader className="px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-body-medium font-semibold text-on-surface">Scanner API</h2>
            <p className="mt-0.5 text-body-medium text-on-surface-variant">
              Pulls the participant list from an external scanner system. Credentials are stored per event.
            </p>
          </div>
        </PaneHeader>

        <PaneBody>
          {!config && galatMuat ? (
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />Scanner API settings could not be loaded.</p>
              <Button variant="outlined" size="sm" onClick={() => void muat()}>Try again</Button>
            </div>
          ) : !config ? (
            <div aria-label="Loading Scanner API settings">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-outline-variant px-5 py-4">
                  <div className="h-3 w-28 animate-pulse rounded bg-surface-container-high" />
                  <div className="h-3 w-48 animate-pulse rounded bg-surface-container-high" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Keterangan, bukan peringatan: warnanya sendiri dulu membuat orang
                  mengira ada yang rusak. */}
              {!dipakai ? (
                <div className="px-5 pt-4">
                  <Banner tone="info" icon={<Info size={16} />}>
                    The participant source for this event is {LABEL_SUMBER[sumber] ?? sumber}, so scheduled sync skips it. The settings below are still saved if you fill them in.
                  </Banner>
                </div>
              ) : null}

              <dl className="flex flex-col gap-3 px-5 py-4">
                <KeyValue label="Sync status">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={dipakai ? "success" : "neutral"} />
                    {dipakai ? "Active" : <span className="text-on-surface-variant">Not used by this event</span>}
                  </span>
                </KeyValue>
                <KeyValue label="Base URL">{config.base_url ?? (config.env_fallback.base_url ? <DariEnv /> : <BelumDiatur />)}</KeyValue>
                <KeyValue label="Event slug">{config.event_slug ?? (config.env_fallback.event_slug ? <DariEnv /> : <BelumDiatur />)}</KeyValue>
                <KeyValue label="API key">{config.key_masked ?? (config.env_fallback.key ? <DariEnv /> : <BelumDiatur />)}</KeyValue>
              </dl>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant px-5 py-4">
                <div className="min-w-0">
                  <p className="text-body-medium font-medium text-on-surface">Auto sync</p>
                  <p className="mt-0.5 text-body-medium text-on-surface-variant">Runs while the Participant list page is open.</p>
                </div>
                <SelectMenu
                  label="Auto sync interval"
                  value={String(menit)}
                  onChange={(nilai) => setMenit(Number(nilai))}
                  options={OPSI_AUTO}
                  width="12.5rem"
                />
              </div>

              {ubah ? (
                <div className="flex flex-col gap-4 border-t border-outline-variant px-5 py-4">
                  <TextField label="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://scanner.example.com/api/v1" />
                  <TextField label="Event slug in Scanner API" value={eventSlug} onChange={(event) => setEventSlug(event.target.value)} placeholder="event-name-2026" />
                  <TextField
                    label="API key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={config.key_set ? "Leave empty to keep the current key" : "Paste the key here"}
                    // Kunci yang sudah tersimpan tidak pernah dikirim balik ke layar ini,
                    // jadi kolomnya SELALU mulai kosong. Kalimat ini yang mencegahnya
                    // terbaca sebagai setelan yang hilang.
                    hint="A saved key is never shown again; only its last four characters are visible."
                  />
                  {galat ? <Banner tone="error" icon={<XCircle size={16} />}>{galat}</Banner> : null}
                </div>
              ) : null}
            </>
          )}
        </PaneBody>

        {config ? (
          <PaneFooter
            note={ubah && config.key_set ? (
              <button type="button" onClick={() => setKonfirmasiHapus(true)} disabled={menyimpan} className="rounded-sm font-medium text-error hover:underline disabled:opacity-50">
                Delete saved key
              </button>
            ) : null}
          >
            {ubah ? (
              <>
                <Button variant="outlined" size="sm" onClick={() => setUbah(false)} disabled={menyimpan}>Cancel</Button>
                <Button simpan size="sm" onClick={() => void simpan()} loading={menyimpan}>Save settings</Button>
              </>
            ) : (
              <>
                <Button simpan variant="outlined" size="sm" onClick={() => void sync()} loading={syncing} icon={<ArrowsClockwise size={16} />}>Sync now</Button>
                <Button variant="outlined" size="sm" onClick={bukaUbah}>Edit settings</Button>
              </>
            )}
          </PaneFooter>
        ) : null}
      </Pane>

      <Dialog
        open={konfirmasiHapus}
        onClose={() => setKonfirmasiHapus(false)}
        dismissible={!menyimpan}
        tone="danger"
        title="Delete saved API key?"
        description="This event's Scanner API key is deleted from the database. Sync then uses the key from the environment variable if there is one; without it, sync can't run until a new key is saved."
        actions={
          <>
            <Button variant="outlined" disabled={menyimpan} onClick={() => setKonfirmasiHapus(false)}>Cancel</Button>
            <Button simpan variant="danger" loading={menyimpan} onClick={() => void hapusKunci()}>Delete key</Button>
          </>
        }
      />
    </>
  );
}
