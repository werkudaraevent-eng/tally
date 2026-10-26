"use client";

import { ArrowSquareOut, Plus, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Kelompok } from "@/components/admin/compact-form";
import Link from "@/components/event-link";
import { Button, FilterChip, IconButton, SegmentedButton, SelectMenu, Switch } from "@/components/m3";
import { eventApiPath } from "@/lib/event-url";
import type { KolomSasaran } from "@/lib/sasaran-bagian";
import { labelAgendaPublik, SYARAT_MAX } from "@/lib/sasaran-baris";
import { KOLOM_HOTEL, samaJawaban } from "@/lib/sasaran-blok";

/**
 * Agenda > Edit item > Who sees it. Everyone (bawaan) atau sebagian peserta:
 * satu sampai tiga syarat, semuanya harus cocok. Satu syarat = satu kolom
 * pilihan peserta atau Hotel dari Logistics, dengan satu atau beberapa jawaban.
 * Aturan dan bentuknya di src/lib/sasaran-baris.ts. Disimpan lewat Save item.
 */

/** Dari /api/admin/rundown/items/sasaran. `available` false: migrasi 202610210001 belum dijalankan. */
export type InfoSiapaMelihat = {
  available: boolean;
  fields: KolomSasaran[];
  hotels: Array<{ id: number; name: string }>;
  hotels_failed: boolean;
  rooms_shown: boolean;
};

/** Syarat yang sedang disunting: kolom boleh belum dipilih, jawaban boleh kosong. */
export type DrafSyarat = Array<{ field: string; values: string[] }>;

export const syaratLengkap = (draf: DrafSyarat | null) => !draf || draf.every((isi) => isi.field && isi.values.length > 0);

const TAUTAN = "inline-flex items-center gap-1 self-start rounded-sm text-body-medium font-medium text-primary hover:underline";

type Kolom = { key: string; label: string; menu: string; options: Array<{ value: string; label: string }> };

function daftarKolom(info: InfoSiapaMelihat): Kolom[] {
  return [
    ...(info.hotels.length ? [{ key: KOLOM_HOTEL, label: "hotel", menu: "Hotel (from Logistics)", options: info.hotels.map((h) => ({ value: String(h.id), label: h.name })) }] : []),
    ...info.fields.map((isi) => ({ key: isi.key, label: isi.label, menu: isi.staff ? `${isi.label} (staff only)` : isi.label, options: isi.options.map((o) => ({ value: o, label: o })) })),
  ];
}

/**
 * Syarat tersimpan yang tidak bisa cocok lagi: kolom atau jawabannya sudah
 * dihapus, atau bentuknya rusak (kolom kosong). Baris itu tersembunyi dari
 * semua. Hotel yang gagal dimuat tidak dihitung mati.
 */
export function syaratMati(syarat: DrafSyarat | null, info: InfoSiapaMelihat | null): boolean {
  if (!syarat || !info) return false;
  const kolom = daftarKolom(info);
  return syarat.some((isi) => {
    if (!isi.field || isi.values.length === 0) return true;
    if (isi.field === KOLOM_HOTEL && info.hotels_failed) return false;
    const k = kolom.find((x) => x.key === isi.field);
    return !k || !isi.values.every((v) => k.options.some((o) => samaJawaban(o.value, v)));
  });
}

/** "Batch 2 · Gramm Hotel": ringkasan untuk chip baris di daftar jadwal. */
export function ringkasSyarat(syarat: DrafSyarat, info: InfoSiapaMelihat | null): string {
  const kolom = info ? daftarKolom(info) : [];
  return syarat
    .map((isi) => {
      const k = kolom.find((x) => x.key === isi.field);
      return isi.values.map((v) => k?.options.find((o) => samaJawaban(o.value, v))?.label ?? (isi.field === KOLOM_HOTEL ? "Hotel" : v)).join(" or ");
    })
    .join(" · ");
}

/**
 * `tersimpan`: syarat yang tersimpan untuk baris ini. Selama nilainya belum
 * disentuh, syarat rusak tersimpan (kolom kosong) dibaca mati, bukan draf yang
 * belum lengkap. `tombol`: tombol yang menyimpannya (Save item atau Add item).
 */
export function KelompokSiapaMelihat({ info, value, tersimpan = null, tombol = "Save item", tanggal = null, onChange, onUbahLabel }: {
  info: InfoSiapaMelihat;
  value: DrafSyarat | null;
  tersimpan?: DrafSyarat | null;
  tombol?: string;
  /** Tanggal bagian baris ini: Hotel dihitung dari stay yang berlaku hari itu. */
  tanggal?: string | null;
  onChange: (next: DrafSyarat | null) => void;
  /** "Show <question> answers on the event page": langsung disimpan, berlaku untuk semua baris. */
  onUbahLabel?: (field: string, on: boolean) => Promise<boolean>;
}) {
  const kolom = daftarKolom(info);
  const lengkap = syaratLengkap(value);
  // Kolom atau jawaban tersimpan yang sudah dihapus: baris tersembunyi dari semua.
  // Syarat yang sedang diisi (kolom belum dipilih) belum lengkap, bukan mati.
  const belumDisentuh = tersimpan !== null && JSON.stringify(value) === JSON.stringify(tersimpan);
  const hilang = syaratMati(belumDisentuh ? value : value?.filter((isi) => isi.field) ?? null, info);
  const pakaiHotel = Boolean(value?.some((isi) => isi.field === KOLOM_HOTEL));

  // Hitungan peserta yang cocok, dari server dengan aturan yang sama dengan portal.
  const tanggalSah = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : null;
  const kunciHitung = value && lengkap && !hilang ? JSON.stringify({ audience: value, date: tanggalSah }) : null;
  const [hitung, setHitung] = useState<{ kunci: string; matches: number; total: number } | { kunci: string; gagal: true } | null>(null);
  useEffect(() => {
    if (!kunciHitung) return;
    const pengendali = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(eventApiPath("/api/admin/rundown/items/sasaran"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kunciHitung,
        signal: pengendali.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("hitung"))))
        .then((data: { matches: number; total: number }) => setHitung({ kunci: kunciHitung, matches: data.matches, total: data.total }))
        .catch(() => { if (!pengendali.signal.aborted) setHitung({ kunci: kunciHitung, gagal: true }); });
    }, 400);
    return () => { window.clearTimeout(timer); pengendali.abort(); };
  }, [kunciHitung]);
  const hasil = hitung && hitung.kunci === kunciHitung ? hitung : null;

  const ubahSyarat = (indeks: number, isi: { field: string; values: string[] }) => onChange((value ?? []).map((lama, i) => (i === indeks ? isi : lama)));
  const dipakai = new Set((value ?? []).map((isi) => isi.field).filter(Boolean));
  const sisaKolom = kolom.filter((k) => !dipakai.has(k.key));

  const kalimat = (value ?? [])
    .map((isi) => {
      const k = kolom.find((x) => x.key === isi.field);
      if (!k || isi.values.length === 0) return null;
      const jawaban = k.options.filter((o) => isi.values.some((v) => samaJawaban(o.value, v))).map((o) => o.label).join(" or ");
      return isi.field === KOLOM_HOTEL ? `hotel is ${jawaban}` : `${k.label} is ${jawaban}`;
    })
    .filter(Boolean)
    .join(", and ");

  return (
    <Kelompok
      title="Who sees it"
      note={info.available && kolom.length > 0 ? `Limit this row to some participants after they sign in. Other participants and badges don't get it. Before sign-in, the event page and /rundown show every row of a day that has Show before sign-in on. Saved with ${tombol}.` : undefined}
    >
      {!info.available ? (
        <p className="text-body-medium text-on-surface-variant">Who sees it needs a database update first (migration 202610210001).</p>
      ) : kolom.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-medium text-on-surface-variant">Add a hotel in Logistics, or a dropdown or single-choice participant field such as Batch. It can be staff only.</p>
          <Link href="/admin/registrasi" target="_blank" rel="noreferrer" className={TAUTAN}>
            Edit in Registration <ArrowSquareOut size={14} aria-hidden /><span className="sr-only">(new tab)</span>
          </Link>
        </div>
      ) : (
        <>
          <SegmentedButton<"semua" | "sebagian">
            label="Who sees it"
            value={value ? "sebagian" : "semua"}
            onChange={(next) => onChange(next === "semua" ? null : value ?? [{ field: "", values: [] }])}
            options={[{ value: "semua", label: "Everyone" }, { value: "sebagian", label: "Some participants" }]}
          />
          {value ? (
            <div className="flex flex-col gap-2">
              {value.map((isi, indeks) => {
                const k = kolom.find((x) => x.key === isi.field) ?? null;
                const pilihan = [...(k ? [k] : []), ...sisaKolom];
                return (
                  <div key={indeks} className="flex flex-col gap-2">
                    {indeks > 0 ? <p className="text-label-medium font-semibold tracking-wide text-on-surface-variant" aria-hidden>AND</p> : null}
                    <div role="group" aria-label={`Condition ${indeks + 1}`} className="flex flex-col gap-2 rounded-md border border-outline-variant p-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <SelectMenu<string>
                            label={`Condition ${indeks + 1} field`}
                            width="100%"
                            value={k ? isi.field : ""}
                            onChange={(field) => { if (field && field !== isi.field) ubahSyarat(indeks, { field, values: [] }); }}
                            options={[...(k ? [] : [{ value: "", label: "Choose a field" }]), ...pilihan.map((x) => ({ value: x.key, label: x.menu }))]}
                          />
                        </div>
                        <IconButton
                          label={`Remove condition ${indeks + 1}`}
                          size="sm"
                          onClick={() => { const sisa = value.filter((_, i) => i !== indeks); onChange(sisa.length ? sisa : null); }}
                        >
                          <X size={18} aria-hidden />
                        </IconButton>
                      </div>
                      {k ? (
                        <div role="group" aria-label={k.key === KOLOM_HOTEL ? "Guests of" : `${k.label} answers`} className="flex flex-wrap gap-2">
                          {k.options.map((opsi) => {
                            const aktif = isi.values.some((v) => samaJawaban(v, opsi.value));
                            return (
                              <FilterChip
                                key={opsi.value}
                                selected={aktif}
                                onClick={() => ubahSyarat(indeks, { field: isi.field, values: aktif ? isi.values.filter((v) => !samaJawaban(v, opsi.value)) : [...isi.values, opsi.value] })}
                              >
                                {opsi.label}
                              </FilterChip>
                            );
                          })}
                        </div>
                      ) : null}
                      {k && isi.values.length === 0 ? <p className="text-body-small text-on-surface-variant">Choose at least one answer. Any of them matches.</p> : null}
                    </div>
                  </div>
                );
              })}
              {value.length < SYARAT_MAX && sisaKolom.length > 0 ? (
                <Button variant="text" icon={<Plus size={16} />} className="self-start" onClick={() => onChange([...value, { field: "", values: [] }])}>
                  Add condition
                </Button>
              ) : null}
              <p className="text-body-small text-on-surface-variant">Participants must match every condition. Up to {SYARAT_MAX}.</p>
            </div>
          ) : null}
          {value ? (
            <p role="status" className={`rounded-md px-3 py-2 text-body-medium ${hilang ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface"}`}>
              {hilang ? (
                "Nobody sees this row: a chosen field or answer no longer exists. Choose again or pick Everyone."
              ) : !lengkap ? (
                "Choose a field and at least one answer for each condition."
              ) : (
                <>
                  <span className="font-semibold">
                    {hasil === null ? "Counting participants…" : "gagal" in hasil ? "Couldn’t count participants." : `Matches ${hasil.matches.toLocaleString("en-GB")} of ${hasil.total.toLocaleString("en-GB")} participants.`}
                  </span>{" "}
                  Shown only to participants where {kalimat}.
                  {pakaiHotel && !info.rooms_shown ? " Rooms aren’t shown to participants in Participant area yet, so nobody matches the hotel condition until they are." : ""}
                </>
              )}
            </p>
          ) : null}
          {value && lengkap && !hilang ? <LabelHalamanAcara syarat={value} info={info} onUbahLabel={onUbahLabel} /> : null}
        </>
      )}
    </Kelompok>
  );
}

/**
 * Halaman acara sebelum masuk: Who sees it tidak menyaring di sana, jadi
 * jawaban pertanyaan yang dipakai syarat bisa tampil sebagai label baris dan
 * sebagai pilihan "Semua · Batch 1 · …" di atas jadwal (labelAgendaPublik,
 * agenda-kelompok.ts). Satu sakelar per pertanyaan, di tempat syaratnya diatur;
 * nama pertanyaannya diambil dari formulir, bukan dari kode.
 */
function LabelHalamanAcara({ syarat, info, onUbahLabel }: { syarat: DrafSyarat; info: InfoSiapaMelihat; onUbahLabel?: (field: string, on: boolean) => Promise<boolean> }) {
  const [menyimpan, setMenyimpan] = useState<string | null>(null);
  const dipakai = info.fields.filter((k) => syarat.some((isi) => isi.field === k.key));
  const hotel = syarat.some((isi) => isi.field === KOLOM_HOTEL);
  const label = labelAgendaPublik(syarat, info.fields);
  return (
    <div className="flex flex-col gap-3 border-t border-outline-variant pt-3">
      {dipakai.map((k) => (
        <Switch
          key={k.key}
          checked={k.label_agenda}
          disabled={!onUbahLabel || menyimpan !== null}
          onChange={async (on) => {
            if (!onUbahLabel) return;
            setMenyimpan(k.key);
            await onUbahLabel(k.key, on);
            setMenyimpan(null);
          }}
          label={`Show ${k.label} answers on the event page`}
          description={`Before sign-in, visitors see the answer (for example “${k.options[0] ?? k.label}”) on each row and can pick theirs above the schedule. Applies to every Agenda row that uses ${k.label}. Saved right away.`}
        />
      ))}
      <p className="text-body-small text-on-surface-variant">
        {label ? (
          <>Before sign-in, the event page labels this row <span className="font-semibold text-on-surface">{label}</span>.</>
        ) : hotel ? (
          "Before sign-in, the event page shows this row without a label: Hotel conditions never show there."
        ) : (
          "Before sign-in, the event page shows this row without a label."
        )}
      </p>
    </div>
  );
}
