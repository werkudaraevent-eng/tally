"use client";

import { useState, type FormEvent } from "react";
import { Button, Dialog, SelectField, TextField } from "@/components/m3";
import type { EventRow } from "@/lib/domain";

/**
 * Data dasar acara: nama, tanggal, zona waktu, tempat.
 *
 * Sebelumnya keempatnya hanya bisa diisi saat acara dibuat. Salah ketik tanggal
 * berarti menduplikasi acara lalu menghapus yang lama -- dan kehilangan akses
 * staf serta slug-nya. Dialog ini dibuka dari menu ⋯ di daftar acara dan dari
 * kepala dashboard, dua tempat orang mencari "ubah acara ini".
 *
 * Kolomnya sama persis dengan dialog Create event, supaya yang diisi di awal
 * dan yang diubah kemudian tidak pernah terbaca sebagai dua hal berbeda.
 */

export type EventDetails = Pick<EventRow, "id" | "name" | "event_date" | "time_zone" | "venue_name">;

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

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!event) return;
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    const response = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        name: form.get("name"),
        event_date: form.get("event_date") || null,
        time_zone: form.get("time_zone"),
        venue_name: form.get("venue_name") || null,
      }),
    }).catch(() => null);
    setPending(false);
    if (!response) { setError("Connection failed. The changes may not have been saved."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.message ?? "Could not save the changes."); return; }
    onSaved(body.event as EventRow);
  }

  return (
    <Dialog
      open={event !== null}
      onClose={() => { setError(""); onClose(); }}
      dismissible={!pending}
      size="lg"
      fullScreenOnMobile
      title="Edit details"
      description="Changes show on the event page, emails and badges straight away."
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={onClose} className="max-sm:hidden">Cancel</Button>
          <Button type="submit" form="ubah-detail-acara" loading={pending}>Save</Button>
        </>
      }
    >
      {/* `key`: nilai bawaan mengikuti acara yang sedang dibuka. */}
      <form key={event?.id} id="ubah-detail-acara" onSubmit={submit}>
        <TextField className="mt-5" label="Event name" name="name" required minLength={3} maxLength={120} defaultValue={event?.name ?? ""} />
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_160px]">
          <TextField label="Date" name="event_date" type="date" optional defaultValue={event?.event_date ?? ""} />
          <SelectField label="Time zone" name="time_zone" defaultValue={event?.time_zone ?? "Asia/Jakarta"}>
            <option value="Asia/Jakarta">WIB</option>
            <option value="Asia/Makassar">WITA</option>
            <option value="Asia/Jayapura">WIT</option>
          </SelectField>
        </div>
        <TextField className="mt-4" label="Venue" name="venue_name" optional maxLength={160} defaultValue={event?.venue_name ?? ""} />
        {error ? <p role="alert" className="mt-3 rounded-lg border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
      </form>
    </Dialog>
  );
}
