"use client";

import { Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Dialog, Switch } from "@/components/m3";
import { REGISTRATION_FIELD_TYPE_LABELS } from "@/lib/domain";
import type { StatusPertanyaan } from "@/lib/live/kolom-klien";

/** Check-in point untuk dialog admin: dari attendance_sessions acara ini. */
export type CheckpointAdmin = { id: number; name: string; active: boolean; scanned: number; shared: boolean };

/**
 * Admin memilih kolom tambahan yang ikut tampil di layar klien: check-in point
 * (waktu pindaian pertama) dan jawaban form tambahan. Satu dialog untuk satu
 * pertanyaan, "apa yang dilihat klien" (pola shared view Airtable/Google
 * Sheets: pemilik memilih kolom yang dibagikan).
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
export function KolomKlienDialog({ open, onClose, slug, pertanyaan, checkpoint, onSaved }: {
  open: boolean;
  onClose: () => void;
  slug: string;
  pertanyaan: StatusPertanyaan[];
  checkpoint: CheckpointAdmin[];
  onSaved: (keys: string[], checkpoints: number[]) => void;
}) {
  const [pilihan, setPilihan] = useState<Set<string>>(() => new Set(pertanyaan.filter((p) => p.status === "shared").map((p) => p.key)));
  const [pilihanCp, setPilihanCp] = useState<Set<number>>(() => new Set(checkpoint.filter((c) => c.shared).map((c) => c.id)));
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const kosong = pertanyaan.length === 0 && checkpoint.length === 0;

  async function simpan() {
    setMenyimpan(true);
    setGalat(null);
    const keys = pertanyaan.map((p) => p.key).filter((key) => pilihan.has(key));
    const checkpoints = checkpoint.map((c) => c.id).filter((id) => pilihanCp.has(id));
    const response = await fetch(`/e/${encodeURIComponent(slug)}/api/live/columns`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys, checkpoints }),
    }).catch(() => null);
    setMenyimpan(false);
    if (!response?.ok) {
      const isi = (await response?.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: { message?: string } } } | null;
      // 409: acara baru saja disimpan di tempat lain; 422: check-in point yang
      // dipilih sudah dihapus. Pesannya dari server; galat lain cukup kalimat umum.
      const pesan = isi?.error?.code === "CONFLICT" ? isi.error.message : isi?.error?.code === "VALIDATION_ERROR" ? isi.error.details?.message : undefined;
      setGalat(pesan || "Couldn't save. Try again.");
      return;
    }
    onSaved(keys, checkpoints);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!menyimpan}
      size="lg"
      scrollBody
      fullScreenOnMobile
      title="What the client sees"
      description={kosong
        ? "This event has no check-in points and no extra form questions to share yet. File uploads are never shared with the client."
        : "Each item you switch on appears as an extra column on this page and in the client's download, after the standard columns."}
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
          <section aria-labelledby="klien-cp-judul" className="mt-4">
            <h3 id="klien-cp-judul" className="text-title-small font-semibold text-on-surface">Check-in points</h3>
            <p className="mt-1 text-body-medium text-on-surface-variant">
              {checkpoint.length ? "Shows the time each person was first scanned there, or Not yet." : <>This event has no check-in points yet. Add them in <a href={`/e/${encodeURIComponent(slug)}/admin/attendance`} className="font-medium text-primary underline">Check-in</a>.</>}
            </p>
            {checkpoint.length ? (
              <ul className="mt-2 divide-y divide-outline-variant">
                {checkpoint.map((c) => (
                  <li key={c.id} className="py-3">
                    <Switch
                      checked={pilihanCp.has(c.id)}
                      onChange={(nyala) => setPilihanCp((lama) => { const baru = new Set(lama); if (nyala) baru.add(c.id); else baru.delete(c.id); return baru; })}
                      label={c.name}
                      description={[c.scanned > 0 ? `${c.scanned.toLocaleString("en-GB")} scanned` : "No scans yet", c.active ? null : "Closed"].filter(Boolean).join(" · ")}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <section aria-labelledby="klien-jawaban-judul" className="mt-6">
            <h3 id="klien-jawaban-judul" className="text-title-small font-semibold text-on-surface">Form answers</h3>
            <p className="mt-1 text-body-medium text-on-surface-variant">
              {pertanyaan.length ? "Answers to the questions you switch on." : "This event's form has no extra questions to share."}
            </p>
            {pertanyaan.length ? (
              <>
                <div className="mt-3 flex gap-3 rounded-lg border border-warning-soft-outline bg-warning-soft px-4 py-3 text-body-medium text-warning">
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
              </>
            ) : null}
            <p className="mt-1 text-body-small text-on-surface-variant">File uploads are never shared with the client.</p>
          </section>
        </>
      )}
      {galat ? <p role="alert" className="mt-3 text-body-medium text-error">{galat}</p> : null}
    </Dialog>
  );
}
