"use client";

import { Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Dialog, Switch } from "@/components/m3";
import { REGISTRATION_FIELD_TYPE_LABELS } from "@/lib/domain";
import type { StatusPertanyaan } from "@/lib/live/kolom-klien";

/**
 * Admin memilih jawaban form tambahan yang ikut tampil di layar klien.
 *
 * Tempatnya di Client view, bukan di penyunting form: pertanyaannya "apa yang
 * dilihat klien", dan di layar inilah admin melihat jawabannya langsung
 * setelah menyimpan. Bawaannya tidak satu pun, jadi acara yang sudah berjalan
 * tidak berubah sampai admin memilih.
 *
 * Pertanyaan yang judul atau jenisnya berubah sejak disetujui sudah tertutup
 * bagi klien (src/lib/live/kolom-klien.ts). Di sini ia tampil mati dengan
 * keterangan, supaya admin memutuskan ulang alih-alih tidak tahu apa-apa.
 */
export function KolomKlienDialog({ open, onClose, slug, pertanyaan, onSaved }: {
  open: boolean;
  onClose: () => void;
  slug: string;
  pertanyaan: StatusPertanyaan[];
  onSaved: (keys: string[]) => void;
}) {
  const [pilihan, setPilihan] = useState<Set<string>>(() => new Set(pertanyaan.filter((p) => p.status === "shared").map((p) => p.key)));
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const kosong = pertanyaan.length === 0;

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
    if (!response?.ok) {
      const isi = (await response?.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      // 409: acara baru saja disimpan di tempat lain. Pesannya dari server dan
      // menyuruh mencoba lagi; galat lain cukup kalimat umum.
      setGalat(isi?.error?.code === "CONFLICT" && isi.error.message ? isi.error.message : "Couldn't save. Try again.");
      return;
    }
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
      description={kosong
        ? "This event's form has no extra questions to share. File uploads are never shared with the client."
        : "Answers to the questions you switch on appear as extra columns on this page and in the client's download, after the standard columns."}
      actions={kosong ? (
        <Button onClick={onClose}>Close</Button>
      ) : (
        <>
          <Button variant="outlined" disabled={menyimpan} onClick={onClose}>Cancel</Button>
          <Button loading={menyimpan} onClick={() => void simpan()}>Save</Button>
        </>
      )}
    >
      {kosong ? null : (
        <>
          <div className="mt-4 flex gap-3 rounded-lg border border-warning-soft-outline bg-warning-soft px-4 py-3 text-body-medium text-warning">
            <Warning size={18} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
            <span>Only share what the client needs. ID numbers, dietary or medical details and other personal answers become visible to everyone with a Viewer account for this event.</span>
          </div>
          <ul className="mt-2 divide-y divide-outline-variant">
            {pertanyaan.map((p) => (
              <li key={p.key} className="py-3">
                <Switch
                  checked={pilihan.has(p.key)}
                  onChange={(nyala) => setPilihan((lama) => { const baru = new Set(lama); if (nyala) baru.add(p.key); else baru.delete(p.key); return baru; })}
                  label={p.label}
                  description={REGISTRATION_FIELD_TYPE_LABELS[p.type]}
                  note={p.status === "changed" && !pilihan.has(p.key) ? (
                    <span className="flex items-start gap-1.5 text-body-small text-warning">
                      <Warning size={14} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
                      <span>
                        {p.approvedLabel === p.label ? "This question's type changed" : <>Changed since you shared it as &ldquo;{p.approvedLabel}&rdquo;</>}. The client no longer sees it. Switch it on to share it again.
                      </span>
                    </span>
                  ) : undefined}
                />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-body-small text-on-surface-variant">File uploads are never shared with the client.</p>
        </>
      )}
      {galat ? <p role="alert" className="mt-3 text-body-medium text-error">{galat}</p> : null}
    </Dialog>
  );
}
