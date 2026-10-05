"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Dialog, SelectField, TextField } from "@/components/m3";
import { EVENT_VENUE_MAX, type EventRow } from "@/lib/domain";

/**
 * Data dasar acara: nama, tanggal, zona waktu, tempat.
 *
 * Sebelumnya keempatnya hanya bisa diisi saat acara dibuat. Salah ketik tanggal
 * berarti menduplikasi acara lalu menghapus yang lama -- dan kehilangan akses
 * staf serta slug-nya. Dialog ini dibuka dari menu ⋯ di daftar acara dan dari
 * kepala dashboard, dua tempat orang mencari "ubah acara ini".
 *
 * Kolomnya sama dengan dialog Create event, supaya yang diisi di awal dan yang
 * diubah kemudian tidak pernah terbaca sebagai dua hal berbeda.
 */

export type EventDetails = Pick<EventRow, "id" | "slug" | "name" | "event_date" | "time_zone" | "venue_name">;

type Info = { agenda_days: number; public_name: string | null };

export type GalatKolom = Partial<Record<"name" | "event_date" | "time_zone" | "venue_name", string>>;

const PESAN_KOLOM: Required<GalatKolom> = {
  name: "Use 3 to 120 characters.",
  event_date: "Enter a valid date.",
  time_zone: "Choose a time zone.",
  venue_name: `Use at most ${EVENT_VENUE_MAX} characters.`,
};

/**
 * Galat 422 per kolom dari `details.fieldErrors` (zod flatten). Pesan umum
 * "Some of the data sent is not valid." tidak menyebut kolom mana, jadi orang
 * tidak tahu apa yang harus diperbaiki. Dipakai Create event dan Edit details.
 */
export function galatKolomDari(body: unknown): GalatKolom {
  const kolom = (body as { error?: { details?: { fieldErrors?: Record<string, unknown> } } })?.error?.details?.fieldErrors ?? {};
  const hasil: GalatKolom = {};
  for (const kunci of Object.keys(PESAN_KOLOM) as Array<keyof GalatKolom>) {
    if (kolom[kunci]) hasil[kunci] = PESAN_KOLOM[kunci];
  }
  return hasil;
}

export function EventDetailsDialog({
  event,
  onClose,
  onSaved,
}: {
  event: EventDetails | null;
  onClose: () => void;
  onSaved: (event: EventRow) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [galat, setGalat] = useState<GalatKolom>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!event) return;
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    setGalat({});
    const response = await fetch(`/api/admin/event-details?eventSlug=${encodeURIComponent(event.slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        event_date: form.get("event_date") || null,
        time_zone: form.get("time_zone"),
        venue_name: form.get("venue_name") || null,
        // Kotak centang hanya ada saat tanggal berubah dan agenda punya hari;
        // tanpa kotak, tidak ada yang perlu digeser.
        shift_agenda: form.get("shift_agenda") === "on",
      }),
    }).catch(() => null);
    setPending(false);
    if (!response) { setError("Connection failed. The changes may not have been saved."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const perKolom = galatKolomDari(body);
      setGalat(perKolom);
      setError(Object.keys(perKolom).length > 0 ? "" : body.error?.message ?? "Could not save the changes.");
      return;
    }
    onSaved(body.event as EventRow);
  }

  return (
    <Dialog
      open={event !== null}
      onClose={() => { setError(""); setGalat({}); onClose(); }}
      dismissible={!pending}
      size="lg"
      scrollBody
      fullScreenOnMobile
      title="Edit details"
      description="The event link stays the same. Emails already sent keep the old details."
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={onClose} className="max-sm:hidden">Cancel</Button>
          <Button type="submit" form="ubah-detail-acara" loading={pending}>Save changes</Button>
        </>
      }
    >
      {/* `key`: isi formulir lahir ulang untuk setiap acara yang dibuka, jadi
          nilai awalnya selalu milik acara itu. */}
      {event ? <Formulir key={event.id} event={event} onSubmit={submit} error={error} galat={galat} /> : null}
    </Dialog>
  );
}

function Formulir({ event, onSubmit, error, galat }: { event: EventDetails; onSubmit: (e: FormEvent<HTMLFormElement>) => void; error: string; galat: GalatKolom }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [tanggal, setTanggal] = useState(event.event_date ?? "");
  const [zona, setZona] = useState<string>(event.time_zone ?? "Asia/Jakarta");

  useEffect(() => {
    let batal = false;
    void fetch(`/api/admin/event-details?eventSlug=${encodeURIComponent(event.slug)}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Info) : null))
      .then((hasil) => { if (!batal) setInfo(hasil); })
      .catch(() => {});
    return () => { batal = true; };
  }, [event.slug]);

  const tanggalBerubah = Boolean(event.event_date && tanggal && tanggal !== event.event_date);
  const zonaBerubah = zona !== event.time_zone;
  const hariAgenda = info?.agenda_days ?? 0;

  return (
    <form id="ubah-detail-acara" onSubmit={onSubmit}>
      <TextField
        className="mt-5"
        label="Event name"
        name="name"
        required
        minLength={3}
        maxLength={120}
        defaultValue={event.name}
        error={galat.name}
        hint={info?.public_name ? `The event page and emails show the public name “${info.public_name}”. Change it in Event page.` : undefined}
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_160px]">
        <TextField label="Date" name="event_date" type="date" optional value={tanggal} onChange={(e) => setTanggal(e.target.value)} error={galat.event_date} />
        <SelectField label="Time zone" name="time_zone" error={galat.time_zone} value={zona} onChange={(e) => setZona(e.target.value)}>
          <option value="Asia/Jakarta">WIB</option>
          <option value="Asia/Makassar">WITA</option>
          <option value="Asia/Jayapura">WIT</option>
        </SelectField>
      </div>
      {/* Hari agenda menyimpan tanggalnya sendiri (strip agenda, badge,
          rundown publik). Tanpa digeser, acara pindah tanggal sementara
          agendanya tetap di tanggal lama. */}
      {tanggalBerubah && hariAgenda > 0 ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-body-medium">
          <input type="checkbox" name="shift_agenda" defaultChecked className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
          <span>Move {hariAgenda === 1 ? "the agenda day" : `${hariAgenda} agenda days`} by the same amount</span>
        </label>
      ) : null}
      {zonaBerubah ? (
        <p className="mt-3 text-body-small text-on-surface-variant">Times stay as written: 09:00 stays 09:00, now in {zona === "Asia/Makassar" ? "WITA" : zona === "Asia/Jayapura" ? "WIT" : "WIB"}.</p>
      ) : null}
      <TextField className="mt-4" label="Venue" name="venue_name" optional maxLength={EVENT_VENUE_MAX} defaultValue={event.venue_name ?? ""} error={galat.venue_name} />
      {error ? <p role="alert" className="mt-3 rounded-lg border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
    </form>
  );
}
