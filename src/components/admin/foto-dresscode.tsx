"use client";

import { Button } from "@/components/m3";

/**
 * Foto contoh dress code yang sudah diunggah: gambar kecil, Replace photo dan
 * Remove photo. Dipakai kartu Agenda > Dress code dan Every day di Participant
 * area; kolom berkas dan tombol Add photo milik pemakainya.
 */
export function FotoDresscode({ url, unggah, mati, onGanti, onHapus }: {
  url: string;
  /** Foto ini sedang diunggah ulang. */
  unggah: boolean;
  /** Unggahan lain berjalan, atau sedang disimpan: Replace photo tidak bisa dipakai. */
  mati: boolean;
  onGanti: () => void;
  onHapus: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden className="h-15 w-12 shrink-0 rounded-md border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${url})` }} />
      <Button variant="outlined" size="sm" loading={unggah} disabled={mati} onClick={onGanti}>Replace photo</Button>
      <Button variant="text" size="sm" className="text-error" disabled={unggah} onClick={onHapus}>Remove photo</Button>
    </div>
  );
}
