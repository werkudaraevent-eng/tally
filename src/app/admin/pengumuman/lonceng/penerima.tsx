"use client";

import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button, FilterChip, IconButton, SelectMenu, TextField } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import type { KolomSasaran } from "@/lib/sasaran-bagian";
import { KOLOM_HOTEL, samaJawaban } from "@/lib/sasaran-blok";
import { KOLOM_ORGANISASI, PILIH_MAX, SYARAT_PENGUMUMAN_MAX, type AudiensPengumuman } from "@/lib/sasaran-pengumuman";

/**
 * Messages > Announcements > Send to. Empat pilihan: semua akun, peserta yang
 * disetujui, peserta yang cocok dengan syarat (aturan Agenda > Who sees it,
 * ditambah Organisasi), atau peserta tertentu. Aturan dan bentuknya di
 * src/lib/sasaran-pengumuman.ts; disimpan bersama pengumumannya.
 *
 * Penyunting syarat sengaja mirip KelompokSiapaMelihat di Agenda (pilih kolom,
 * centang jawaban, DAN antarsyarat), supaya panitia mengenalinya, tapi tanpa
 * label halaman acara yang hanya berlaku untuk baris Agenda.
 */

/** Dari GET /api/admin/pengumuman/sasaran. */
export type InfoPenerima = {
  available: boolean;
  fields: KolomSasaran[];
  hotels: Array<{ id: number; name: string }>;
  hotels_failed: boolean;
  /** Akun peran kustom: hotel tidak dikirim, jadi syarat Hotel tersimpan tidak dinilai mati. */
  hotels_hidden?: boolean;
  rooms_shown: boolean;
  companies: Array<{ company: string; count: number }>;
  companies_failed: boolean;
};

export type DrafSyarat = Array<{ field: string; values: string[] }>;
export type Orang = { id: string; name: string; company: string | null };
export type DrafPenerima = { audience: AudiensPengumuman; audience_rules: DrafSyarat | null; audience_ids: string[] };

export type HasilHitung = { matches: number; total: number; accounts: number; people?: Orang[] };

type Kolom = { key: string; label: string; menu: string; options: Array<{ value: string; label: string }> };

function daftarKolom(info: InfoPenerima): Kolom[] {
  return [
    ...(info.companies.length ? [{ key: KOLOM_ORGANISASI, label: "organisation", menu: "Organisation", options: info.companies.map((c) => ({ value: c.company, label: c.company })) }] : []),
    ...(info.hotels.length ? [{ key: KOLOM_HOTEL, label: "hotel", menu: "Hotel (from Logistics)", options: info.hotels.map((h) => ({ value: String(h.id), label: h.name })) }] : []),
    ...info.fields.map((isi) => ({ key: isi.key, label: isi.label, menu: isi.staff ? `${isi.label} (staff only)` : isi.label, options: isi.options.map((o) => ({ value: o, label: o })) })),
  ];
}

const lengkap = (draf: DrafPenerima) =>
  draf.audience === "syarat"
    ? Boolean(draf.audience_rules?.length) && draf.audience_rules!.every((isi) => isi.field && isi.values.length > 0)
    : draf.audience === "pilih"
      ? draf.audience_ids.length > 0
      : true;

/** Penerima ini siap disimpan? Syarat lengkap, atau setidaknya satu peserta. */
export const penerimaLengkap = lengkap;

/** Bentuk yang dikirim ke API. */
export function kirimanPenerima(draf: DrafPenerima) {
  return {
    audience: draf.audience,
    audience_rules: draf.audience === "syarat" ? draf.audience_rules : null,
    audience_ids: draf.audience === "pilih" ? draf.audience_ids : null,
  };
}

/**
 * Syarat tersimpan yang tidak bisa cocok lagi: kolom atau semua jawabannya
 * sudah dihapus dari formulir, atau hotelnya dari Logistics. Pengumuman itu
 * tidak tampil ke siapa pun. Organisasi tidak pernah dianggap mati: nama yang
 * belum dipakai peserta mana pun bisa cocok begitu datanya diisi. Hotel yang
 * gagal dimuat tidak dihitung mati.
 */
export function syaratMatiPengumuman(syarat: DrafSyarat | null, info: InfoPenerima | null): boolean {
  if (!syarat || !info) return false;
  const kolom = daftarKolom(info);
  return syarat.some((isi) => {
    if (!isi.field || isi.field === KOLOM_ORGANISASI) return false;
    if (isi.field === KOLOM_HOTEL && (info.hotels_failed || info.hotels_hidden)) return false;
    const k = kolom.find((x) => x.key === isi.field);
    return !k || (isi.values.length > 0 && !isi.values.some((v) => k.options.some((o) => samaJawaban(o.value, v))));
  });
}

/** "Batch 2 · RAY", "12 people": isi kolom Send to di daftar. */
export function ringkasPenerima(draf: Pick<DrafPenerima, "audience" | "audience_rules" | "audience_ids">, info: InfoPenerima | null): string {
  if (draf.audience === "semua") return "All accounts";
  if (draf.audience === "disetujui") return "Approved";
  if (draf.audience === "pilih") return plural(draf.audience_ids.length, "person", "people");
  if (syaratMatiPengumuman(draf.audience_rules, info)) return "Nobody (field removed)";
  const kolom = info ? daftarKolom(info) : [];
  const teks = (draf.audience_rules ?? [])
    .map((isi) => {
      const k = kolom.find((x) => x.key === isi.field);
      return isi.values.map((v) => k?.options.find((o) => samaJawaban(o.value, v))?.label ?? (isi.field === KOLOM_HOTEL ? "Hotel" : v)).join(" or ");
    })
    .join(" · ");
  return teks || "Some participants";
}

/**
 * Hitungan penerima dari server, dengan aturan yang sama dengan portal. Hanya
 * untuk syarat dan peserta tertentu; semua dan disetujui memakai hitungan akun
 * dari daftar.
 */
export function useHitungPenerima(draf: DrafPenerima | null, aktif: boolean) {
  const kunci = aktif && draf && draf.audience !== "semua" && draf.audience !== "disetujui" && lengkap(draf) ? JSON.stringify(kirimanPenerima(draf)) : null;
  const [hasil, setHasil] = useState<{ kunci: string; data: HasilHitung | null; galat?: string } | null>(null);
  useEffect(() => {
    if (!kunci) return;
    const pengendali = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/admin/pengumuman/sasaran", { method: "POST", headers: { "Content-Type": "application/json" }, body: kunci, signal: pengendali.signal })
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          if (!r.ok) throw new Error(body?.error?.message ?? "Couldn’t count participants.");
          return body as HasilHitung;
        })
        .then((data) => setHasil({ kunci, data }))
        .catch((galat: Error) => { if (!pengendali.signal.aborted) setHasil({ kunci, data: null, galat: galat.message }); });
    }, 400);
    return () => { window.clearTimeout(timer); pengendali.abort(); };
  }, [kunci]);
  if (!kunci) return null;
  return hasil && hasil.kunci === kunci ? hasil : { kunci, data: null, memuat: true as const };
}

const PILIHAN: Array<{ value: AudiensPengumuman; title: string }> = [
  { value: "semua", title: "All participant accounts" },
  { value: "disetujui", title: "Approved participants" },
  { value: "syarat", title: "Participants who match" },
  { value: "pilih", title: "Specific participants" },
];

export function PilihPenerima({ draf, onChange, info, infoGagal, siap, akun, hitung, nama, onNama }: {
  draf: DrafPenerima;
  onChange: (next: DrafPenerima) => void;
  info: InfoPenerima | null;
  infoGagal: boolean;
  /** Migrasi 202610300004 sudah dijalankan. */
  siap: boolean;
  /** Jumlah akun untuk semua dan disetujui, dari daftar. */
  akun: { semua: number; disetujui: number };
  hitung: ReturnType<typeof useHitungPenerima>;
  nama: Map<string, Orang>;
  onNama: (orang: Orang[]) => void;
}) {
  const deskripsi: Record<AudiensPengumuman, string> = {
    semua: `${plural(akun.semua, "account")}, including registrants not yet approved.`,
    disetujui: `${plural(akun.disetujui, "account")} already approved as participants.`,
    syarat: "Same rules as Agenda › Who sees it. Checked when they open the portal, so someone who later moves to the matching batch or hotel sees it too.",
    pilih: `Search by name and pick up to ${PILIH_MAX}.`,
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-body-medium font-medium text-on-surface">Send to</legend>
      {PILIHAN.map((pilihan) => {
        const aktif = draf.audience === pilihan.value;
        const butuhMigrasi = !siap && (pilihan.value === "syarat" || pilihan.value === "pilih");
        return (
          <div key={pilihan.value} className={cx("flex flex-col gap-3 rounded-md border p-3 text-body-medium", aktif ? "border-2 border-primary bg-primary-soft p-[11px]" : "border-outline-variant")}>
            <label className={cx("flex items-start gap-3", butuhMigrasi ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
              <input
                type="radio"
                name="pengumuman-penerima"
                value={pilihan.value}
                checked={aktif}
                disabled={butuhMigrasi}
                onChange={() =>
                  onChange({
                    audience: pilihan.value,
                    audience_rules: pilihan.value === "syarat" ? draf.audience_rules ?? [{ field: "", values: [] }] : draf.audience_rules,
                    audience_ids: draf.audience_ids,
                  })
                }
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-on-surface">{pilihan.title}</span>
                <span className="block text-on-surface-variant">{butuhMigrasi ? "Needs a database update first (migration 202610300004)." : deskripsi[pilihan.value]}</span>
              </span>
            </label>
            {aktif && pilihan.value === "syarat" ? (
              info ? <PenyuntingSyarat info={info} value={draf.audience_rules ?? []} onChange={(audience_rules) => onChange({ ...draf, audience_rules })} />
                : <p className="text-body-small text-on-surface-variant">{infoGagal ? "Couldn’t load participant fields. Reload the page." : "Loading participant fields…"}</p>
            ) : null}
            {aktif && pilihan.value === "pilih" ? (
              <PemilihPeserta ids={draf.audience_ids} nama={nama} onNama={onNama} onChange={(audience_ids) => onChange({ ...draf, audience_ids })} />
            ) : null}
            {aktif && (pilihan.value === "syarat" || pilihan.value === "pilih") ? <KalimatHitung draf={draf} hitung={hitung} info={info} /> : null}
          </div>
        );
      })}
    </fieldset>
  );
}

function KalimatHitung({ draf, hitung, info }: { draf: DrafPenerima; hitung: ReturnType<typeof useHitungPenerima>; info: InfoPenerima | null }) {
  if (draf.audience === "syarat" && syaratMatiPengumuman(draf.audience_rules, info)) {
    return (
      <p role="status" className="rounded-md bg-error-container px-3 py-2 text-body-medium text-on-error-container">
        Nobody sees this announcement: a chosen field or answer no longer exists. Choose again or pick another Send to.
      </p>
    );
  }
  if (!lengkap(draf)) {
    return (
      <p role="status" className="rounded-md bg-surface-container px-3 py-2 text-body-medium text-on-surface">
        {draf.audience === "pilih" ? "Choose at least one participant." : "Choose a field and at least one answer for each condition."}
      </p>
    );
  }
  const pakaiHotel = draf.audience === "syarat" && Boolean(draf.audience_rules?.some((isi) => isi.field === KOLOM_HOTEL));
  const data = hitung && "data" in hitung ? hitung.data : null;
  const galat = hitung && "galat" in hitung ? hitung.galat : undefined;
  return (
    <p role="status" className={cx("rounded-md px-3 py-2 text-body-medium", galat ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface")}>
      {galat ? (
        galat
      ) : !data ? (
        "Counting participants…"
      ) : (
        <>
          <span className="font-semibold">
            {draf.audience === "pilih" ? `${plural(data.matches, "participant")} chosen.` : `Matches ${data.matches.toLocaleString("en-GB")} of ${data.total.toLocaleString("en-GB")} participants.`}
          </span>{" "}
          {data.matches - data.accounts > 0
            ? `${data.accounts.toLocaleString("en-GB")} can see it now; the other ${(data.matches - data.accounts).toLocaleString("en-GB")} ${data.matches - data.accounts === 1 ? "sees" : "see"} it when they first sign in.`
            : "All of them can see it now."}
          {pakaiHotel && info && !info.rooms_shown ? " Rooms aren’t shown to participants in Participant area yet, so nobody matches the hotel condition until they are." : ""}
        </>
      )}
    </p>
  );
}

/** Organisasi bisa ratusan: pilihan disaring dengan kotak cari, yang terpilih selalu tampil. */
const ORGANISASI_TAMPIL = 24;

function PenyuntingSyarat({ info, value, onChange }: { info: InfoPenerima; value: DrafSyarat; onChange: (next: DrafSyarat) => void }) {
  const kolom = daftarKolom(info);
  const [cariOrg, setCariOrg] = useState("");
  if (kolom.length === 0) {
    return <p className="text-body-small text-on-surface-variant">Add a dropdown or single-choice participant field such as Batch, a hotel in Logistics, or organisations to participants first.</p>;
  }
  const ubah = (indeks: number, isi: { field: string; values: string[] }) => onChange(value.map((lama, i) => (i === indeks ? isi : lama)));
  const dipakai = new Set(value.map((isi) => isi.field).filter(Boolean));
  const sisa = kolom.filter((k) => !dipakai.has(k.key));
  return (
    <div className="flex flex-col gap-2">
      {value.map((isi, indeks) => {
        const k = kolom.find((x) => x.key === isi.field) ?? null;
        const pilihan = [...(k ? [k] : []), ...sisa];
        const org = k?.key === KOLOM_ORGANISASI;
        const kata = cariOrg.trim().toLocaleLowerCase("id");
        const opsi = !k ? [] : org
          ? [
              ...k.options.filter((o) => isi.values.some((v) => samaJawaban(v, o.value))),
              ...k.options.filter((o) => !isi.values.some((v) => samaJawaban(v, o.value)) && (!kata || o.label.toLocaleLowerCase("id").includes(kata))).slice(0, ORGANISASI_TAMPIL),
            ]
          : k.options;
        // Jawaban tersimpan yang sudah tidak ada di pilihan: tetap tampil supaya bisa dilepas.
        const yatim = k ? isi.values.filter((v) => !k.options.some((o) => samaJawaban(o.value, v))) : [];
        return (
          <div key={indeks} className="flex flex-col gap-2">
            {indeks > 0 ? <p className="text-label-medium font-semibold tracking-wide text-on-surface-variant" aria-hidden>AND</p> : null}
            <div role="group" aria-label={`Condition ${indeks + 1}`} className="flex flex-col gap-2 rounded-md border border-outline-variant bg-surface-container-lowest p-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <SelectMenu<string>
                    label={`Condition ${indeks + 1} field`}
                    width="100%"
                    value={k ? isi.field : ""}
                    onChange={(field) => { if (field && field !== isi.field) ubah(indeks, { field, values: [] }); }}
                    options={[...(k ? [] : [{ value: "", label: "Choose a field" }]), ...pilihan.map((x) => ({ value: x.key, label: x.menu }))]}
                  />
                </div>
                <IconButton label={`Remove condition ${indeks + 1}`} size="sm" onClick={() => onChange(value.filter((_, i) => i !== indeks))}>
                  <X size={18} aria-hidden />
                </IconButton>
              </div>
              {org && k.options.length > ORGANISASI_TAMPIL ? (
                <TextField label="Find organisation" value={cariOrg} onChange={(event) => setCariOrg(event.target.value)} leading={<MagnifyingGlass size={16} />} placeholder="Type part of the name" />
              ) : null}
              {k ? (
                <div role="group" aria-label={`${k.label} answers`} className="flex flex-wrap gap-2">
                  {opsi.map((o) => {
                    const aktif = isi.values.some((v) => samaJawaban(v, o.value));
                    return (
                      <FilterChip key={o.value} selected={aktif} onClick={() => ubah(indeks, { field: isi.field, values: aktif ? isi.values.filter((v) => !samaJawaban(v, o.value)) : [...isi.values, o.value] })}>
                        {o.label}
                      </FilterChip>
                    );
                  })}
                  {yatim.map((v) => (
                    <FilterChip key={`hilang-${v}`} selected onClick={() => ubah(indeks, { field: isi.field, values: isi.values.filter((x) => x !== v) })}>
                      {k.key === KOLOM_HOTEL ? "Removed hotel" : v} (removed)
                    </FilterChip>
                  ))}
                </div>
              ) : null}
              {k && isi.values.length === 0 ? <p className="text-body-small text-on-surface-variant">Choose at least one answer. Any of them matches.</p> : null}
            </div>
          </div>
        );
      })}
      {value.length < SYARAT_PENGUMUMAN_MAX && sisa.length > 0 ? (
        <Button variant="text" icon={<Plus size={16} />} className="self-start" onClick={() => onChange([...value, { field: "", values: [] }])}>
          Add condition
        </Button>
      ) : null}
      <p className="text-body-small text-on-surface-variant">Participants must match every condition. Up to {SYARAT_PENGUMUMAN_MAX}.</p>
    </div>
  );
}

function PemilihPeserta({ ids, nama, onNama, onChange }: { ids: string[]; nama: Map<string, Orang>; onNama: (orang: Orang[]) => void; onChange: (ids: string[]) => void }) {
  const [cari, setCari] = useState("");
  const [hasil, setHasil] = useState<{ kata: string; orang: Orang[] } | null>(null);
  const kata = cari.trim();
  useEffect(() => {
    if (kata.length < 2) return;
    const pengendali = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: kata, limit: "8", meta: "0" });
      void fetch(`/api/admin/participants?${params.toString()}`, { cache: "no-store", signal: pengendali.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("cari"))))
        .then((body: { participants?: Array<{ id: string; name: string; company?: string | null }> }) =>
          setHasil({ kata, orang: (body.participants ?? []).map((p) => ({ id: p.id, name: p.name, company: p.company ?? null })) }))
        .catch(() => { if (!pengendali.signal.aborted) setHasil({ kata, orang: [] }); });
    }, 300);
    return () => { window.clearTimeout(timer); pengendali.abort(); };
  }, [kata]);
  const daftar = hasil && hasil.kata === kata && kata.length >= 2 ? hasil.orang : null;
  const penuh = ids.length >= PILIH_MAX;

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Find a participant"
        value={cari}
        onChange={(event) => setCari(event.target.value)}
        leading={<MagnifyingGlass size={16} />}
        placeholder="Name, organisation or email"
        hint={penuh ? `You can pick up to ${PILIH_MAX}. Use Participants who match for larger groups.` : undefined}
      />
      {kata.length >= 2 ? (
        <ul aria-label="Search results" className="flex flex-col overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest">
          {daftar === null ? (
            <li className="px-3 py-2 text-body-medium text-on-surface-variant">Searching…</li>
          ) : daftar.length === 0 ? (
            <li className="px-3 py-2 text-body-medium text-on-surface-variant">No participant matches “{kata}”.</li>
          ) : (
            daftar.map((orang) => {
              const sudah = ids.includes(orang.id);
              return (
                <li key={orang.id} className="border-t border-outline-variant first:border-t-0">
                  <button
                    type="button"
                    disabled={sudah || penuh}
                    onClick={() => { onNama([orang]); onChange([...ids, orang.id]); }}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-body-medium hover:bg-primary-soft disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-on-surface">{orang.name}</span>
                      {orang.company ? <span className="block truncate text-body-small text-on-surface-variant">{orang.company}</span> : null}
                    </span>
                    <span className="shrink-0 text-body-small text-on-surface-variant">{sudah ? "Added" : "Add"}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
      {ids.length ? (
        <div role="group" aria-label="Chosen participants" className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <FilterChip key={id} selected showCheck={false} onClick={() => onChange(ids.filter((x) => x !== id))} aria-label={`Remove ${nama.get(id)?.name ?? "participant"}`}>
              {nama.get(id)?.name ?? "Loading…"} <X size={14} aria-hidden />
            </FilterChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
