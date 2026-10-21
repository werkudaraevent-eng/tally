"use client";

import { DeviceMobile, Plus } from "@phosphor-icons/react";
import { useId, useRef, useState, type ReactNode } from "react";
import { FotoDresscode } from "@/components/admin/foto-dresscode";
import { Button, TextField } from "@/components/m3";
import { FieldMessages } from "@/components/m3/text-field";
import type { LandingMemberConfig } from "@/lib/domain";
import { OUTFIT_BATAS } from "@/lib/outfit";
import { FOTO_OUTFIT_TERIMA } from "@/lib/outfit-foto";
import { isianSetiapHari, lihatSetiapHari, petunjukApaSetiapHari, type IsianSetiapHari } from "@/lib/outfit-setiap-hari";

/**
 * Participant area > Dress code page > Every day (keputusan Mas 21 Okt): satu
 * baris untuk seluruh acara, di depan baris tiap hari di portal Horizon, juga
 * tanpa tab Agenda. Satu-satunya tempat menyuntingnya; Agenda > Dress code
 * hanya menampilkannya. Disimpan dengan Save changes, jadi drafnya ada di
 * `member` halaman ini dan ikut pratinjau seperti setelan lain.
 *
 * Add note dan Add photo baru muncul sesudah What to wear diisi: tanpa What to
 * wear tidak ada yang tersimpan, jadi catatan atau foto yang diisi lebih dulu
 * akan hilang diam-diam saat disimpan. What to wear yang dikosongkan sesudahnya
 * memperingatkan di kolomnya bahwa catatan dan fotonya ikut terhapus.
 */
export function KelompokSetiapHari({ nilai, onUbah, labelHalaman, tautanAgenda, unggah, menyimpan, galat, onUnggah }: {
  /** Draf `member.outfit_every_day`. */
  nilai: LandingMemberConfig["outfit_every_day"];
  onUbah: (ubah: Partial<IsianSetiapHari>) => void;
  /** Nama halaman Dress code peserta (Page name di bawahnya, termasuk yang belum disimpan). */
  labelHalaman: string;
  /** Tautan Agenda › Dress code lewat penjaga halaman ini. */
  tautanAgenda: ReactNode;
  /** Foto sedang diunggah. */
  unggah: boolean;
  menyimpan: boolean;
  /** Galat unggah atau 422 Save changes untuk Every day. */
  galat: string | null;
  onUnggah: (file: File) => void;
}) {
  const isian = isianSetiapHari(nilai);
  const [catatanBuka, setCatatanBuka] = useState(false);
  const berkas = useRef<HTMLInputElement | null>(null);
  const idJudul = useId();
  const idGalat = useId();
  const catatanTampil = catatanBuka || isian.note !== "";
  const adaApa = isian.what.trim() !== "";
  const lihat = lihatSetiapHari(nilai);

  return (
    <fieldset aria-labelledby={idJudul} className="flex min-w-0 flex-col gap-3 rounded-lg border border-outline-variant p-3">
      <div>
        <p id={idJudul} className="text-body-medium font-semibold text-on-surface">Every day</p>
        <p className="mt-0.5 text-body-small text-on-surface-variant">
          Shown on every day of the event, with or without an agenda. For one day or one agenda item, use {tautanAgenda}.
        </p>
      </div>
      <TextField
        label="What to wear"
        optional
        maxLength={OUTFIT_BATAS.what}
        counter
        {...petunjukApaSetiapHari(nilai)}
        value={isian.what}
        onChange={(event) => onUbah({ what: event.target.value })}
        data-setiap-apa=""
      />
      {catatanTampil ? (
        <TextField
          label="Note"
          optional
          maxLength={OUTFIT_BATAS.note}
          counter
          hint={`Shown only on the ${labelHalaman} page`}
          value={isian.note}
          onChange={(event) => onUbah({ note: event.target.value })}
          data-setiap-catatan=""
        />
      ) : null}
      {/* Unggahan lewat endpoint yang sama dengan foto Agenda; fotonya masuk draf sampai Save changes. */}
      <input
        ref={berkas}
        type="file"
        accept={FOTO_OUTFIT_TERIMA}
        hidden
        disabled={unggah || menyimpan}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUnggah(file);
          // Direset supaya memilih berkas yang sama dua kali tetap memicu onChange.
          event.target.value = "";
        }}
      />
      {isian.photo_url ? (
        <FotoDresscode url={isian.photo_url} unggah={unggah} mati={unggah || menyimpan} onGanti={() => berkas.current?.click()} onHapus={() => onUbah({ photo_url: null })} />
      ) : null}
      {adaApa && (!catatanTampil || !isian.photo_url) ? (
        <div className="-my-1 -ml-3 flex flex-wrap items-center gap-1">
          {!catatanTampil ? (
            <Button
              variant="text"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => {
                setCatatanBuka(true);
                window.setTimeout(() => document.querySelector<HTMLElement>("[data-setiap-catatan]")?.focus(), 0);
              }}
            >
              Add note
            </Button>
          ) : null}
          {!isian.photo_url ? (
            <Button variant="text" size="sm" icon={<Plus size={16} />} loading={unggah} disabled={unggah || menyimpan} onClick={() => berkas.current?.click()}>
              Add photo
            </Button>
          ) : null}
        </div>
      ) : null}
      {galat ? (
        <div className="[&>p]:mt-0">
          <FieldMessages id={idGalat} error={galat} />
        </div>
      ) : null}
      {lihat ? (
        <p className="flex items-start gap-2 rounded-md bg-surface-container-high px-3 py-2 text-body-small text-on-surface-variant">
          <DeviceMobile size={16} className="mt-px shrink-0" aria-hidden />
          <span className="min-w-0">
            Participants see <span className="font-medium text-on-surface">{lihat}</span> on every day
          </span>
        </p>
      ) : null}
    </fieldset>
  );
}
