"use client";

import { Copy, Key, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Dialog, Pane, PaneBody, PaneHeader, SelectField, StatusChip, Switch, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";

/**
 * Event settings > Integrations > API keys.
 *
 * Untuk bot dan otomasi panitia (mis. agen Telegram yang mengisi nomor kamar
 * dari foto kunci). Bentuknya mengikuti Stripe restricted keys dan GitHub
 * fine-grained tokens: nama, izin satu per satu, masa berlaku, kunci tampil
 * SEKALI, daftar dengan "Last used", dan Revoke.
 *
 * Izin baru ditambahkan di lib/api-keys.ts (IZIN) DAN check constraint
 * migrasi 202611050020; daftarnya di sini mengikuti IZIN lewat salinan kecil
 * di bawah karena lib itu memakai node:crypto (server saja).
 */

const IZIN_LAYAR = [
  { key: "room_numbers", label: "Room numbers", description: "Set the room number of a room a participant already has, or, after you confirm, move a room's guests into the numbered room they use on other nights. Can't create or delete rooms, send messages or read QR codes and emails." },
] as const;

const OPSI_MASA = [
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "never", label: "No expiry" },
];

type ApiKey = {
  id: string;
  name: string;
  scopes: string[];
  key_prefix: string;
  created_at: string;
  created_by_name: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};

const waktu = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const tampilWaktu = (iso: string) => waktu.format(new Date(iso));

function statusKunci(kunci: ApiKey): { label: string; tone: "success" | "neutral" | "error" } {
  if (kunci.revoked_at) return { label: "Revoked", tone: "neutral" };
  if (kunci.expires_at && new Date(kunci.expires_at).getTime() <= Date.now()) return { label: "Expired", tone: "error" };
  return { label: "Active", tone: "success" };
}

function pesanGalat(data: unknown, cadangan: string) {
  const isi = data as { error?: { message?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } } };
  const rinci = isi.error?.details;
  return rinci?.formErrors?.[0] ?? Object.values(rinci?.fieldErrors ?? {})[0]?.[0] ?? isi.error?.message ?? cadangan;
}

export function ApiKeysPanel() {
  const toast = useToast();
  const [kunci, setKunci] = useState<ApiKey[] | null>(null);
  const [belumSiap, setBelumSiap] = useState(false);
  const [galatMuat, setGalatMuat] = useState(false);

  const [buka, setBuka] = useState(false);
  const [nama, setNama] = useState("");
  const [izin, setIzin] = useState<string[]>(["room_numbers"]);
  const [masa, setMasa] = useState("7");
  const [galat, setGalat] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  const [rahasia, setRahasia] = useState<{ nama: string; kunci: string } | null>(null);
  const [cabut, setCabut] = useState<ApiKey | null>(null);
  const [mencabut, setMencabut] = useState(false);

  const muat = useCallback(async () => {
    setGalatMuat(false);
    try {
      const response = await fetch("/api/admin/api-keys", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setKunci(data.keys ?? []);
      setBelumSiap(Boolean(data.not_ready));
    } catch {
      setGalatMuat(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  function bukaBuat() {
    setNama("");
    setIzin(["room_numbers"]);
    setMasa("7");
    setGalat("");
    setBuka(true);
  }

  async function buat() {
    setMenyimpan(true);
    setGalat("");
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nama, scopes: izin, expires_in_days: masa === "never" ? null : Number(masa) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setGalat(pesanGalat(data, "The key could not be created. Try again."));
        return;
      }
      setBuka(false);
      setRahasia({ nama: data.key.name, kunci: data.secret });
      setKunci((lama) => [data.key as ApiKey, ...(lama ?? [])]);
    } catch {
      setGalat("The connection was lost. Try again.");
    } finally {
      setMenyimpan(false);
    }
  }

  async function salin() {
    if (!rahasia) return;
    try {
      await navigator.clipboard.writeText(rahasia.kunci);
      toast.success("Key copied");
    } catch {
      toast.error("Could not copy", "Select the key and copy it by hand.");
    }
  }

  async function cabutKunci() {
    if (!cabut) return;
    setMencabut(true);
    try {
      const response = await fetch(`/api/admin/api-keys?id=${encodeURIComponent(cabut.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error("Could not revoke", pesanGalat(data, "Try again."));
        return;
      }
      toast.success(`${cabut.name} revoked`, "Requests with this key are refused from now on.");
      setCabut(null);
      void muat();
    } catch {
      toast.error("Could not revoke", "The connection was lost. Try again.");
    } finally {
      setMencabut(false);
    }
  }

  return (
    <div lang="en" className="contents">
      <Pane aria-label="API keys">
        <PaneHeader className="px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-body-medium font-semibold text-on-surface">API keys</h2>
            <p className="mt-0.5 text-body-medium text-on-surface-variant">
              For bots and automations that update this event, such as a Telegram bot that fills in room numbers. Each key only does what its permissions allow.
            </p>
          </div>
          {kunci && !belumSiap ? <Button size="sm" icon={<Key size={16} />} onClick={bukaBuat}>Create key</Button> : null}
        </PaneHeader>

        <PaneBody>
          {galatMuat && !kunci ? (
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />API keys could not be loaded.</p>
              <Button variant="outlined" size="sm" onClick={() => void muat()}>Try again</Button>
            </div>
          ) : !kunci ? (
            <div aria-label="Loading API keys" className="px-5 py-4">
              <div className="h-3 w-48 animate-pulse rounded bg-surface-container-high" />
            </div>
          ) : belumSiap ? (
            <p className="px-5 py-4 text-body-medium text-on-surface-variant">API keys are not set up on this server yet.</p>
          ) : kunci.length === 0 ? (
            <p className="px-5 py-4 text-body-medium text-on-surface-variant">No keys yet. Create one, copy it into your bot, and revoke it when the event is over.</p>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {kunci.map((item) => {
                const status = statusKunci(item);
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-body-medium font-medium text-on-surface">
                        <span className="truncate">{item.name}</span>
                        <StatusChip tone={status.tone} dot>{status.label}</StatusChip>
                      </p>
                      <p className="mt-0.5 text-body-medium text-on-surface-variant">
                        <span className="font-mono">{item.key_prefix}…</span>
                        {" · "}{item.scopes.map((s) => IZIN_LAYAR.find((i) => i.key === s)?.label ?? s).join(", ")}
                        {" · "}{item.last_used_at ? `Last used ${tampilWaktu(item.last_used_at)}` : "Never used"}
                        {" · "}{item.revoked_at ? `Revoked ${tampilWaktu(item.revoked_at)}` : item.expires_at ? `Expires ${tampilWaktu(item.expires_at)}` : "No expiry"}
                      </p>
                    </div>
                    {!item.revoked_at ? (
                      <Button variant="outlined" size="sm" onClick={() => setCabut(item)}>Revoke</Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </PaneBody>
      </Pane>

      <Dialog
        open={buka}
        onClose={() => setBuka(false)}
        dismissible={!menyimpan}
        size="md"
        title="Create API key"
        description="The key is shown once, right after you create it. Paste it into your bot straight away."
        actions={
          <>
            <Button variant="outlined" disabled={menyimpan} onClick={() => setBuka(false)}>Cancel</Button>
            <Button simpan loading={menyimpan} disabled={!nama.trim() || izin.length === 0} onClick={() => void buat()}>Create key</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Name" value={nama} maxLength={40} onChange={(event) => setNama(event.target.value)} placeholder="Hermes" hint="Shown in the Audit trail as who made each change." />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-body-medium font-medium text-on-surface">Permissions</legend>
            {IZIN_LAYAR.map((item) => (
              <Switch
                key={item.key}
                checked={izin.includes(item.key)}
                onChange={(nyala) => setIzin((lama) => (nyala ? [...new Set([...lama, item.key])] : lama.filter((k) => k !== item.key)))}
                label={item.label}
                description={item.description}
              />
            ))}
          </fieldset>
          <SelectField label="Expires after" value={masa} onChange={(event) => setMasa(event.target.value)}>
            {OPSI_MASA.map((opsi) => <option key={opsi.value} value={opsi.value}>{opsi.label}</option>)}
          </SelectField>
          {galat ? <Banner tone="error" icon={<XCircle size={16} />}>{galat}</Banner> : null}
        </div>
      </Dialog>

      <Dialog
        open={rahasia !== null}
        onClose={() => setRahasia(null)}
        size="md"
        title={`Copy the key for ${rahasia?.nama ?? ""}`}
        description="This is the only time the key is shown. If you lose it, revoke it and create a new one."
        actions={<><Button variant="outlined" onClick={() => setRahasia(null)}>Done</Button><Button icon={<Copy size={16} />} onClick={() => void salin()}>Copy key</Button></>}
      >
        <p className="select-all break-all rounded-md border border-outline bg-surface-container px-3 py-2 font-mono text-body-medium text-on-surface">{rahasia?.kunci}</p>
        <p className="mt-3 text-body-medium text-on-surface-variant">
          Your bot sends it as <span className="font-mono">Authorization: Bearer &lt;key&gt;</span>. Anyone with the key can do what its permissions allow, so don&apos;t post it in a group chat.
        </p>
      </Dialog>

      <Dialog
        open={cabut !== null}
        onClose={() => setCabut(null)}
        dismissible={!mencabut}
        tone="danger"
        title={`Revoke ${cabut?.name ?? "key"}?`}
        description="Requests with this key are refused straight away. Changes it already made stay. This can't be undone; create a new key if you need one again."
        actions={
          <>
            <Button variant="outlined" disabled={mencabut} onClick={() => setCabut(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={mencabut} onClick={() => void cabutKunci()}>Revoke key</Button>
          </>
        }
      />
    </div>
  );
}
