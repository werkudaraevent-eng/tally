"use client";

import { useState } from "react";
import { Button, Dialog, TextField } from "@/components/m3";
import type { EventRow, EventStatus } from "@/lib/domain";

/**
 * Aksi acara yang dipakai DUA tempat: menu ⋯ di daftar acara dan menu ⋯ di
 * kepala dashboard. Satu sumber, supaya label, urutan, dan kalimat konfirmasinya
 * tidak bisa berbeda antara kedua tempat itu.
 */

export type Action = "activate" | "deactivate" | "complete" | "archive";

/**
 * Aksi yang tersedia per status. Menyembunyikan aksi yang tidak berlaku lebih
 * baik daripada menampilkannya lalu menolak: tombol yang selalu gagal terbaca
 * sebagai sistem rusak, bukan sebagai aturan.
 */
export const ACTIONS: Record<EventStatus, Array<{ action: Action; label: string; danger?: boolean }>> = {
  draft: [{ action: "activate", label: "Activate" }],
  active: [
    { action: "deactivate", label: "Move back to draft" },
    { action: "complete", label: "Mark as completed" },
  ],
  completed: [
    { action: "activate", label: "Activate again" },
    { action: "archive", label: "Archive", danger: true },
  ],
  // Event arsip sengaja hanya bisa dikembalikan ke draft, bukan langsung aktif.
  // Konfigurasinya sudah lama tidak disentuh; melewati draft berarti tidak ada
  // kesempatan memeriksanya sebelum ia jadi kandidat di jalur publik.
  archived: [{ action: "deactivate", label: "Move back to draft" }],
};

/** Aksi yang mengubah apa yang tampil di layar publik butuh konfirmasi. */
export const CONFIRM_TEXT: Partial<Record<Action, string>> = {
  activate: "Booth staff, cashiers and scanner staff can open their screens for it. The event page and registration already work while it is a draft. Old links without a slug (/display, /denah, /rundown) only work while exactly one event is active.",
  deactivate: "The event goes back to draft. Its public screens stop serving links without a slug, but all data and settings stay intact.",
  complete: "The event is marked as completed. No new orders are expected, but every report and history stays available.",
  archive: "The event is archived and leaves the main list. Its data is not deleted and it can be moved back to draft.",
};

/** Duplikasi acara. Hanya super_admin (endpoint-nya memakai requireUser(["super_admin"])). */
export function DuplicateEventDialog({
  event,
  onClose,
  onDone,
}: {
  event: Pick<EventRow, "id" | "name"> | null;
  onClose: () => void;
  onDone: (salinan: EventRow) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function duplicate(form: FormData) {
    if (!event) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/events/${event.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        event_date: form.get("event_date") || null,
        scanner_api_event_slug: form.get("scanner_api_event_slug") || null,
      }),
    }).catch(() => null);
    setPending(false);
    if (!response) { setError("Connection failed. Check the list before trying again; the copy may already exist."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.details?.message ?? body.error?.message ?? "Could not duplicate the event.");
      return;
    }
    onDone(body.event as EventRow);
  }

  return (
    <Dialog
      open={event !== null}
      onClose={() => { setError(""); onClose(); }}
      dismissible={!pending}
      size="lg"
      scrollBody
      fullScreenOnMobile
      title={`Copy of “${event?.name ?? ""}”`}
      description="The copy starts as a draft with no participants."
      actions={
        <>
          <Button variant="outlined" disabled={pending} onClick={onClose} className="max-sm:hidden">Cancel</Button>
          <Button type="submit" form="duplikat-event" loading={pending}>Create copy as draft</Button>
        </>
      }
    >
      <form id="duplikat-event" onSubmit={(e) => { e.preventDefault(); void duplicate(new FormData(e.currentTarget)); }}>
        {/* Apa yang ikut dan apa yang tidak ditulis DI DEPAN, bukan setelah
            tombol ditekan. Salinan yang ternyata membawa 247 peserta acara lain
            baru ketahuan setelah ada yang memeriksa daftar peserta. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-container p-4"><p className="text-label-medium font-semibold ed-label">Copied</p><p className="mt-2 text-body-medium text-on-surface-variant">Booths, special items, settings, display settings, agenda, seating plan, lucky-draw prizes &amp; rules, organisation-name exclusions.</p></div>
          <div className="rounded-lg bg-surface-container p-4"><p className="text-label-medium font-semibold ed-label">Not copied</p><p className="mt-2 text-body-medium text-on-surface-variant">Participants, orders, lucky-draw winners, user access, and all history.</p></div>
        </div>

        {/* `key`: nilai bawaan nama mengikuti event yang sedang disalin. Tanpa
            key, React memakai ulang kolom dari salinan sebelumnya. */}
        <TextField key={event?.id} className="mt-5" label="New event name" name="name" required minLength={3} maxLength={120} defaultValue={`${event?.name ?? ""} (copy)`} />
        <TextField className="mt-4" label="Date" name="event_date" type="date" optional />
        <TextField
          className="mt-4"
          label="Scanner API slug"
          name="scanner_api_event_slug"
          optional
          placeholder="Leave empty if there is none yet"
          hint="Not copied on purpose. With the old slug, the copy would pull the previous event's participants every 5 minutes. Left empty, sync stays off; turn it on later in Event settings, Integrations."
        />
        {error ? <p role="alert" className="mt-3 rounded-lg border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
      </form>
    </Dialog>
  );
}
