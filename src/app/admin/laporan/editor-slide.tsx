"use client";

import { ArrowDown, ArrowUp, Plus, Trash, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, DetailSection, IconButton, Pane, PaneBody, PaneHeader, SelectField, TextArea, TextField } from "@/components/m3";
import { BATAS, type BarisUsulan, type ConfigLaporan, type SlideTambahan } from "@/lib/laporan/config";
import type { Draf, DataLaporan } from "./jenis";

/** Slide yang punya pilihan "Group participants by": keduanya memecah angka per kelompok. */
const PAKAI_KELOMPOK = new Set(["kelompok", "kepuasan"]);

/**
 * Panel kanan: pengaturan satu slide. Teks disimpan saat kolom ditinggalkan
 * (blur), pilihan disimpan langsung. Judul yang diketik ikut tampil di
 * pratinjau lewat `onDraf` sebelum disimpan. Pemanggil memberi `key` per
 * slide, jadi isi kolom diambil ulang dari config setiap ganti slide.
 */
export function EditorSlide({ data, kunci, nomor, onSimpan, onDraf, onGeser, terkunci, onTutup }: {
  data: DataLaporan;
  kunci: string;
  nomor: number | null;
  onSimpan: (ubah: (c: ConfigLaporan) => ConfigLaporan) => void;
  onDraf: (d: Draf) => void;
  onGeser: (arah: -1 | 1) => void;
  terkunci: boolean;
  onTutup?: () => void;
}) {
  const baris = data.daftar.find((d) => d.kunci === kunci);
  const slide = data.semua[kunci];
  const tambahan = data.config.tambahan.find((t) => t.id === kunci);
  const [judul, setJudul] = useState(data.config.judul[kunci] ?? "");
  const [catatan, setCatatan] = useState(data.config.catatan[kunci] ?? "");
  if (!baris || !slide) return null;

  const saran = baris.saran;
  const urut = data.daftar.map((d) => d.kunci);
  const posisi = urut.indexOf(kunci);
  const simpanPeta = (field: "judul" | "catatan", nilai: string) =>
    onSimpan((c) => {
      const peta = { ...c[field] };
      const bersih = nilai.replace(/\s+/g, " ").trim();
      if (!bersih || (field === "judul" && bersih === saran)) delete peta[kunci];
      else peta[kunci] = bersih;
      return { ...c, [field]: peta };
    });
  const ubahTambahan = (ubah: (t: SlideTambahan) => SlideTambahan) => onSimpan((c) => ({ ...c, tambahan: c.tambahan.map((t) => (t.id === kunci ? ubah(t) : t)) }));
  const judulPanel = `${nomor ? `Slide ${nomor}, ` : ""}${baris.nama.charAt(0).toLowerCase()}${baris.nama.slice(1)}`;

  return (
    <Pane aria-label="Slide settings">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 truncate text-title-small font-semibold">{nomor ? judulPanel : `${baris.nama} (hidden)`}</h2>
        {onTutup ? <span className="lg:hidden"><IconButton size="sm" label="Back to slides" onClick={onTutup}><X size={18} /></IconButton></span> : null}
      </PaneHeader>
      <PaneBody>
        {kunci === "sampul" ? (
          <DetailSection>
            <p className="text-body-medium text-on-surface-variant">The cover uses the event name, venue, dates and logo from Event page and Event settings. Change them there.</p>
          </DetailSection>
        ) : null}

        {PAKAI_KELOMPOK.has(kunci) ? (
          <DetailSection>
            <SelectField
              label="Group participants by"
              value={data.config.kelompok ?? ""}
              disabled={terkunci}
              onChange={(e) => onSimpan((c) => ({ ...c, kelompok: e.target.value || null }))}
              hint='Organisation or any choice question on the registration form. Groups under 10 people join "Other".'
            >
              <option value="">Don&apos;t group</option>
              {data.pilihan.kelompok.map((k) => <option key={k.kunci} value={k.kunci}>{k.label}</option>)}
            </SelectField>
          </DetailSection>
        ) : null}

        {tambahan?.jenis === "pertanyaan" ? (
          <DetailSection>
            <SelectField
              label="Question"
              value={`${tambahan.sumber}:${tambahan.kunci}`}
              disabled={terkunci}
              onChange={(e) => {
                const [sumber, ...rest] = e.target.value.split(":");
                ubahTambahan((t) => ({ ...t, sumber: sumber as "daftar" | "feedback", kunci: rest.join(":") }));
              }}
              hint="Only choice questions. Answers are counted; names are never shown."
            >
              {data.pilihan.pertanyaan.map((q) => (
                <option key={`${q.sumber}:${q.kunci}`} value={`${q.sumber}:${q.kunci}`}>{q.label} ({q.sumber === "daftar" ? "Registration" : "Feedback"})</option>
              ))}
            </SelectField>
          </DetailSection>
        ) : null}

        {kunci !== "sampul" && tambahan?.jenis !== "teks" ? (
          <DetailSection>
            <TextArea
              label="Title"
              rows={2}
              maxLength={BATAS.judul}
              value={judul || saran}
              disabled={terkunci}
              onChange={(e) => { setJudul(e.target.value); onDraf({ judul: e.target.value }); }}
              onBlur={() => simpanPeta("judul", judul)}
              hint={judul && judul !== saran ? `Suggested from the figures: "${saran}"` : "Suggested from the figures. Edit it if the committee words it differently."}
            />
            {judul && judul !== saran ? (
              <Button variant="text" size="sm" className="self-start" disabled={terkunci} onClick={() => { setJudul(""); onDraf({ judul: undefined }); simpanPeta("judul", ""); }}>
                Use suggested title
              </Button>
            ) : null}
          </DetailSection>
        ) : null}

        {tambahan?.jenis === "teks" ? <EditorTeks tambahan={tambahan} terkunci={terkunci} onUbah={ubahTambahan} onDraf={onDraf} /> : null}
        {kunci === "usulan" ? <EditorUsulan usulan={data.config.usulan} terkunci={terkunci} onSimpan={(u) => onSimpan((c) => ({ ...c, usulan: u }))} /> : null}

        {kunci !== "sampul" && kunci !== "usulan" && !tambahan ? (
          <DetailSection>
            <TextArea
              label="Committee note"
              optional
              rows={3}
              maxLength={BATAS.catatan}
              counter
              value={catatan}
              disabled={terkunci}
              onChange={(e) => { setCatatan(e.target.value); onDraf({ catatan: e.target.value }); }}
              onBlur={() => simpanPeta("catatan", catatan)}
              hint="Shown under the finding, for context the figures can't give."
            />
          </DetailSection>
        ) : null}

        {kunci !== "sampul" ? (
          <DetailSection title="Position">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outlined" size="sm" icon={<ArrowUp size={16} aria-hidden />} disabled={terkunci || posisi <= 1} onClick={() => onGeser(-1)}>Move up</Button>
              <Button variant="outlined" size="sm" icon={<ArrowDown size={16} aria-hidden />} disabled={terkunci || posisi >= urut.length - 1} onClick={() => onGeser(1)}>Move down</Button>
              {tambahan ? (
                <Button variant="text" size="sm" className="ml-auto !text-error" icon={<Trash size={16} aria-hidden />} disabled={terkunci} onClick={() => onSimpan((c) => ({ ...c, tambahan: c.tambahan.filter((t) => t.id !== kunci), urutan: c.urutan.filter((k) => k !== kunci), sembunyi: c.sembunyi.filter((k) => k !== kunci) }))}>
                  Delete slide
                </Button>
              ) : null}
            </div>
          </DetailSection>
        ) : null}
      </PaneBody>
    </Pane>
  );
}

function EditorTeks({ tambahan, terkunci, onUbah, onDraf }: { tambahan: Extract<SlideTambahan, { jenis: "teks" }>; terkunci: boolean; onUbah: (u: (t: SlideTambahan) => SlideTambahan) => void; onDraf: (d: Draf) => void }) {
  const [judul, setJudul] = useState(tambahan.judul);
  const [poin, setPoin] = useState(tambahan.poin.length ? tambahan.poin : [""]);
  const simpan = (p = poin) => onUbah((t) => ({ ...t, poin: p.map((x) => x.trim()).filter(Boolean) }));
  return (
    <DetailSection>
      <TextField label="Title" maxLength={BATAS.judul} value={judul} disabled={terkunci} onChange={(e) => { setJudul(e.target.value); onDraf({ judul: e.target.value }); }} onBlur={() => onUbah((t) => ({ ...t, judul: judul.trim() }))} />
      {poin.map((p, i) => (
        <div key={i} className="flex items-end gap-1">
          <TextField className="flex-1" label={`Point ${i + 1}`} maxLength={BATAS.teksPoin} value={p} disabled={terkunci} onChange={(e) => setPoin(poin.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => simpan()} />
          <IconButton size="sm" label={`Remove point ${i + 1}`} disabled={terkunci || poin.length === 1} onClick={() => { const baru = poin.filter((_, j) => j !== i); setPoin(baru); simpan(baru); }}><X size={18} /></IconButton>
        </div>
      ))}
      {poin.length < BATAS.poin ? (
        <Button variant="text" size="sm" className="self-start" icon={<Plus size={16} aria-hidden />} disabled={terkunci} onClick={() => setPoin([...poin, ""])}>Add point</Button>
      ) : null}
    </DetailSection>
  );
}

const KOSONG: BarisUsulan = { terjadi: "", data: "", usulan: "" };

function EditorUsulan({ usulan, terkunci, onSimpan }: { usulan: BarisUsulan[]; terkunci: boolean; onSimpan: (u: BarisUsulan[]) => void }) {
  const [baris, setBaris] = useState<BarisUsulan[]>(usulan.length ? usulan : [KOSONG]);
  const simpan = (b = baris) => onSimpan(b.filter((x) => x.terjadi.trim() || x.data.trim() || x.usulan.trim()));
  const ubah = (i: number, field: keyof BarisUsulan, nilai: string) => setBaris(baris.map((x, j) => (j === i ? { ...x, [field]: nilai } : x)));
  return (
    <DetailSection>
      <p className="text-body-medium text-on-surface-variant">One row per change. This slide stays out of exports until it has a row.</p>
      {baris.map((b, i) => (
        <fieldset key={i} className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3">
          <legend className="px-1 text-body-small text-on-surface-variant">Row {i + 1}</legend>
          <TextField label="What happened" maxLength={BATAS.teksUsulan} value={b.terjadi} disabled={terkunci} onChange={(e) => ubah(i, "terjadi", e.target.value)} onBlur={() => simpan()} />
          <TextField label="The data" maxLength={BATAS.teksUsulan} value={b.data} disabled={terkunci} onChange={(e) => ubah(i, "data", e.target.value)} onBlur={() => simpan()} />
          <TextField label="Committee proposal" maxLength={BATAS.teksUsulan} value={b.usulan} disabled={terkunci} onChange={(e) => ubah(i, "usulan", e.target.value)} onBlur={() => simpan()} />
          <Button variant="text" size="sm" className="self-start" disabled={terkunci} onClick={() => { const sisa = baris.filter((_, j) => j !== i); setBaris(sisa.length ? sisa : [KOSONG]); simpan(sisa); }}>Remove row</Button>
        </fieldset>
      ))}
      {baris.length < BATAS.usulan ? (
        <Button variant="text" size="sm" className="self-start" icon={<Plus size={16} aria-hidden />} disabled={terkunci} onClick={() => setBaris([...baris, KOSONG])}>Add row</Button>
      ) : null}
    </DetailSection>
  );
}
