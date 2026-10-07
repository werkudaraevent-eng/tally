"use client";

import { Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Dialog, Switch } from "@/components/m3";
import { REGISTRATION_FIELD_TYPE_LABELS, type RegistrationFieldType } from "@/lib/domain";

export type PertanyaanKlien = { key: string; label: string; type: RegistrationFieldType };

/**
 * Admin memilih jawaban form tambahan yang ikut tampil di layar klien.
 *
 * Tempatnya di Client view, bukan di penyunting form: pertanyaannya "apa yang
 * dilihat klien", dan di layar inilah admin melihat jawabannya langsung
 * setelah menyimpan. Bawaannya tidak satu pun, jadi acara yang sudah berjalan
 * tidak berubah sampai admin memilih.
 */
export function KolomKlienDialog({ open, onClose, slug, pertanyaan, dipilih, onSaved }: {
  open: boolean;
  onClose: () => void;
  slug: string;
  pertanyaan: PertanyaanKlien[];
  dipilih: string[];
  onSaved: (keys: string[]) => void;
}) {
  const [pilihan, setPilihan] = useState<Set<string>>(() => new Set(dipilih));
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    setMenyimpan(true);
    setGalat(null);
    const keys = pertanyaan.map((p) => p.key).filter((key) => pilihan.has(key));
    const response = await fetch(`/e/${encodeURIComponent(slug)}/api/live/columns`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    }).catch(() => null);
    setMenyimpan(false);
    if (!response?.ok) { setGalat("Couldn't save. Try again."); return; }
    onSaved(keys);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!menyimpan}
      size="lg"
      scrollBody
      fullScreenOnMobile
      title="Form answers the client sees"
      description="Answers to the questions you switch on appear as extra columns on this page and in the client's download, after the standard columns."
      actions={
        <>
          <Button variant="outlined" disabled={menyimpan} onClick={onClose}>Cancel</Button>
          <Button loading={menyimpan} onClick={() => void simpan()}>Save</Button>
        </>
      }
    >
      <div className="mt-4 flex gap-3 rounded-lg border border-warning-soft-outline bg-warning-soft px-4 py-3 text-body-medium text-warning">
        <Warning size={18} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
        <span>Only share what the client needs. ID numbers, dietary or medical details and other personal answers become visible to everyone with a Viewer account for this event.</span>
      </div>
      {pertanyaan.length === 0 ? (
        <p className="mt-4 text-body-medium text-on-surface-variant">This event&apos;s form has no extra questions. File uploads are never shared with the client.</p>
      ) : (
        <ul className="mt-2 divide-y divide-outline-variant">
          {pertanyaan.map((p) => (
            <li key={p.key} className="py-3">
              <Switch
                checked={pilihan.has(p.key)}
                onChange={(nyala) => setPilihan((lama) => { const baru = new Set(lama); if (nyala) baru.add(p.key); else baru.delete(p.key); return baru; })}
                label={p.label}
                description={REGISTRATION_FIELD_TYPE_LABELS[p.type]}
              />
            </li>
          ))}
        </ul>
      )}
      {pertanyaan.length > 0 ? <p className="mt-1 text-body-small text-on-surface-variant">File uploads are never shared with the client.</p> : null}
      {galat ? <p role="alert" className="mt-3 text-body-medium text-error">{galat}</p> : null}
    </Dialog>
  );
}
