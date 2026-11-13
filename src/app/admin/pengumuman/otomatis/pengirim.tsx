"use client";

import { Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import Link from "@/components/event-link";
import { Banner, Button, Dialog, Switch, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";
import type { Pengirim } from "./bersama";

/**
 * Email tracking acara ini: tersimpan langsung (seperti Pengirim), lepas dari
 * Simpan templat. Hanya email pengumuman dan blast; konfirmasi pendaftaran
 * dan tautan masuk tidak pernah dilacak.
 */
export function SakelarJejak() {
  const toast = useToast();
  const [nilai, setNilai] = useState<{ siap: boolean; email_tracking: boolean } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let batal = false;
    void fetch("/api/admin/email-jejak", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((body) => {
        if (!batal && body) setNilai(body as { siap: boolean; email_tracking: boolean });
      });
    return () => {
      batal = true;
    };
  }, []);

  async function ubah(baru: boolean) {
    setSibuk(true);
    const response = await fetch("/api/admin/email-jejak", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_tracking: baru }),
    }).catch(() => null);
    setSibuk(false);
    if (!response?.ok) {
      toast.error("Email tracking not changed", "Try again.");
      return;
    }
    setNilai((await response.json()) as { siap: boolean; email_tracking: boolean });
    toast.success(baru ? "Email tracking on" : "Email tracking off", "Applies to emails sent from now on.");
  }

  if (!nilai) return <p className="pt-2 text-body-medium text-on-surface-variant">Loading…</p>;
  return (
    <>
      <Switch
        label="Record opens and clicks"
        description={
          nilai.siap
            ? "Announcement emails: opens and button clicks. Blasts: opens (their sign-in link already shows who signed in). Clicked is reliable. Opened is an estimate: Apple Mail opens every email by itself (counted separately) and Outlook blocks images. The email footer tells recipients."
            : "Available after the database update for email tracking has been run."
        }
        checked={nilai.email_tracking}
        simpan
        kunci={!nilai.siap}
        disabled={sibuk}
        onChange={(baru) => void ubah(baru)}
      />
      <p className="text-body-small text-on-surface-variant">Saved straight away. Applies to emails sent after you turn it on.</p>
    </>
  );
}

export function Baris({ judul, children, id }: { judul: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 border-b border-outline-variant px-5 py-5 @xl:grid-cols-[132px_minmax(0,1fr)]">
      <h2 id={id} className="pt-2 text-title-small font-semibold text-on-surface">
        {judul}
      </h2>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

/** Pilihan radio berkartu, sama dengan Pengaturan. */
export function PilihanRadio({ name, checked, onSelect, label, description }: { name: string; checked: boolean; onSelect: () => void; label: string; description: string | null }) {
  return (
    <label className={cx("flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5", checked ? "border-primary" : "border-outline-variant hover:bg-primary-soft")}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
      <span className="min-w-0">
        <span className="block text-body-medium font-medium text-on-surface">{label}</span>
        {description ? <span className="mt-0.5 block text-body-small text-on-surface-variant">{description}</span> : null}
      </span>
    </label>
  );
}

export function RingkasanPengirim({ pengirim }: { pengirim: Pengirim | null }) {
  if (!pengirim) return <p className="pt-2 text-body-medium text-on-surface-variant">Loading…</p>;
  const bawaan = pengirim.email_default;
  if (!bawaan) return <p className="pt-2 text-body-medium text-on-surface-variant">Email sending isn&apos;t set up on the server, so the sender name isn&apos;t used yet.</p>;
  const nama = pengirim.email_sender_name?.trim() || bawaan.name;
  const balasan = pengirim.email_reply_to?.trim() || bawaan.reply_to;
  return (
    <div className="pt-2 text-body-medium">
      <p className="break-words text-on-surface">
        {nama ? (
          <>
            {nama} <span className="text-on-surface-variant">&lt;{bawaan.address}&gt;</span>
          </>
        ) : (
          bawaan.address
        )}
      </p>
      <p className="mt-1 text-body-small text-on-surface-variant">
        {balasan ? `Replies go to ${balasan}.` : "Replies go to the sender address."} Also used for blasts, invitations and sign-in links.
      </p>
    </div>
  );
}

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Nama pengirim dan alamat balasan. Tersimpan sendiri (PATCH ke Pengaturan), lepas dari Simpan templat. */
export function DialogPengirim({ open, pengirim, onClose, onTersimpan }: { open: boolean; pengirim: Pengirim | null; onClose: () => void; onTersimpan: (baru: Pengirim) => void }) {
  const toast = useToast();
  const [nama, setNama] = useState("");
  const [balasan, setBalasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [dicoba, setDicoba] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !pengirim) return;
    // Isi ulang dari yang tersimpan setiap kali dialog dibuka.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNama(pengirim.email_sender_name ?? "");
    setBalasan(pengirim.email_reply_to ?? "");
    setDicoba(false);
    setGalat(null);
  }, [open, pengirim]);

  const bawaan = pengirim?.email_default ?? null;
  const galatNama = /[<>"\r\n]/.test(nama) ? "Don't use < > or quotation marks." : undefined;
  const galatBalasan = balasan.trim() && !POLA_EMAIL.test(balasan.trim()) ? "Enter a valid email address." : undefined;
  const namaTampil = nama.trim() || bawaan?.name || "";

  async function simpan() {
    setDicoba(true);
    if (galatNama || galatBalasan || !pengirim) return;
    setSibuk(true);
    setGalat(null);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_sender_name: nama.trim() || null, email_reply_to: balasan.trim() || null }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as Partial<Pengirim> | null;
    setSibuk(false);
    if (!response?.ok || !body) {
      setGalat("Sender not saved. Check the fields and your connection, then try again.");
      return;
    }
    toast.success("Sender saved", "Every email sent from now on uses it.");
    onTersimpan({ email_sender_name: body.email_sender_name ?? null, email_reply_to: body.email_reply_to ?? null, email_default: body.email_default ?? pengirim.email_default });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!sibuk}
      title="Email sender"
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={sibuk}>
            Cancel
          </Button>
          <Button onClick={() => void simpan()} loading={sibuk}>
            Save
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-4">
        <TextField
          label="Sender name"
          value={nama}
          maxLength={80}
          placeholder={bawaan?.name ?? "Organiser name"}
          onChange={(e) => setNama(e.target.value)}
          error={dicoba ? galatNama : undefined}
          hint={
            bawaan
              ? `Participants see: ${namaTampil ? `${namaTampil} <${bawaan.address}>` : bawaan.address}. Leave empty to use the site default${bawaan.name ? ` (${bawaan.name})` : ""}.`
              : "Leave empty to use the site default."
          }
        />
        <TextField
          label="Reply-to address"
          optional
          type="email"
          value={balasan}
          maxLength={254}
          placeholder={bawaan?.reply_to ?? "name@organiser.com"}
          onChange={(e) => setBalasan(e.target.value)}
          error={dicoba ? galatBalasan : undefined}
          hint="Where participant replies go."
        />
        {galat ? (
          <Banner tone="error" icon={<Warning size={18} />}>
            {galat}
          </Banner>
        ) : null}
        <p className="text-body-small text-on-surface-variant">
          Applies to every email sent after you save, including scheduled blasts. Also in{" "}
          <Link href="/admin/settings" className="font-semibold text-primary underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </div>
    </Dialog>
  );
}
