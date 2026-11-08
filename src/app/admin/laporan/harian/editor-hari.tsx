"use client";

import { ImageUploadField } from "@/components/admin/image-upload-field";
import { DetailSection, Pane, PaneBody, Switch, TextArea } from "@/components/m3";
import { BATAS_HARIAN, type SetelanHari } from "@/lib/laporan/harian/config";
import { FOLDER_FOTO_LAPORAN } from "@/lib/laporan/harian/foto";
import type { HalamanAbsen, KunciHalaman } from "@/lib/laporan/harian/jenis";

export const NAMA_HALAMAN: Record<KunciHalaman, string> = {
  sampul: "Cover",
  hadir: "Who came",
  jam: "Busiest hour",
  menit: "Busiest minute",
  agenda: "Today's agenda",
  rekap: "Each day",
  puas: "Satisfaction (NPS)",
  layar: "Behind the scenes",
  penutup: "Note and tomorrow",
};
/** Nama halaman di Seluruh acara, bila berbeda dari hari biasa. */
const NAMA_SEMUA: Partial<Record<KunciHalaman, string>> = { hadir: "Who came", menit: "Busiest hour", agenda: "Every session", penutup: "Thank you" };
const FOTO = ["Cover photo", "Busiest hour photo", "Closing photo"] as const;
const KET_FOTO = ["Without one, the event page hero is used.", "Shown above the chart.", "Shown above the note."] as const;

export type UbahHari = Omit<SetelanHari, "kunci">;

/** Pengaturan satu hari: foto, gambar yang ikut, catatan panitia. Terkunci = hanya baca. */
export function EditorHari({ setelan, absen, ada, kunci, terkunci, semua = false, onUbah }: {
  setelan: SetelanHari;
  /** Story Seluruh acara: nama halaman lain, tanpa foto halaman jam. */
  semua?: boolean;
  absen: HalamanAbsen[];
  /** Halaman yang punya data hari ini (tampil atau disembunyikan). */
  ada: KunciHalaman[];
  /** Angka hari ini sudah dikunci. */
  kunci: boolean;
  /** Acara ditutup (useTerkunci). */
  terkunci: boolean;
  onUbah: (s: UbahHari) => void;
}) {
  const mati = kunci || terkunci;
  const ubah = (sebagian: Partial<UbahHari>) => onUbah({ sembunyi: setelan.sembunyi, catatan: setelan.catatan, foto: setelan.foto, ...sebagian });
  const alasan = new Map(absen.map((a) => [a.kunci, a.alasan]));
  const daftar = (Object.keys(NAMA_HALAMAN) as KunciHalaman[]).filter((k) => k !== "sampul" && (ada.includes(k) || alasan.has(k)));
  return (
    <Pane aria-label="Day settings">
      <PaneBody className="flex flex-col gap-6 p-4">
        {kunci ? <p className="text-body-small text-on-surface-variant">Figures are locked and this day plays on the client view. Unlock to change photos, images or the note (it leaves the client view until you lock again).</p> : null}
        <DetailSection title="Images">
          <div className="flex flex-col">
            {daftar.map((k) => (
              <Switch
                key={k}
                label={(semua && NAMA_SEMUA[k]) || NAMA_HALAMAN[k]}
                description={alasan.get(k)}
                checked={!alasan.has(k) && !setelan.sembunyi.includes(k)}
                disabled={mati || alasan.has(k)}
                onChange={(v) => ubah({ sembunyi: v ? setelan.sembunyi.filter((x) => x !== k) : [...setelan.sembunyi, k] })}
              />
            ))}
          </div>
        </DetailSection>
        <DetailSection title="Committee note">
          <TextArea
            key={`${setelan.catatan}`}
            label="Note"
            rows={3}
            maxLength={BATAS_HARIAN.catatan}
            disabled={mati}
            defaultValue={setelan.catatan}
            hint="Shown on the last image, in the event's language."
            onBlur={(e) => { if (e.currentTarget.value.trim() !== setelan.catatan) ubah({ catatan: e.currentTarget.value }); }}
          />
        </DetailSection>
        <DetailSection title="Photos">
          <div className="flex flex-col gap-3">
            {FOTO.map((label, i) => semua && i === 1 ? null : (
              <ImageUploadField
                key={label}
                label={label}
                hint={KET_FOTO[i]}
                kind={FOLDER_FOTO_LAPORAN}
                perkecil={{ lebar: 1600, mutu: 0.85 }}
                disabled={mati}
                value={setelan.foto[i] || null}
                onChange={(url) => {
                  const foto = Array.from({ length: BATAS_HARIAN.foto }, (_, j) => setelan.foto[j] ?? "");
                  foto[i] = url ?? "";
                  ubah({ foto });
                }}
              />
            ))}
          </div>
        </DetailSection>
      </PaneBody>
    </Pane>
  );
}
