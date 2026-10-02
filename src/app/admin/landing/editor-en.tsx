"use client";

import type { ReactNode } from "react";
import { TextArea, TextField } from "@/components/m3";
import {
  LANDING_BLOCK_LABELS,
  LANDING_NAV_LABEL_MAX,
  LANDING_SECTION_LABELS,
  landingBlockLimits,
  type EventLandingConfig,
  type LandingBlock,
  type LandingBlockEn,
  type LandingBlockItem,
  type LandingConfigEn,
  type LandingSectionId,
  type LandingTextLimit,
} from "@/lib/domain";

/**
 * Mode English editor Halaman acara (spesifikasi: landing-v2/dwibahasa/spesifikasi.md).
 *
 * Setiap kolom teks menyunting kunci `en` di samping teks Indonesianya; teks
 * Indonesia tampil di bawah kolom sebagai sumber terjemahan. Hanya kolom yang
 * berisi di versi Indonesia yang tampil: kolom Indonesia yang kosong tidak
 * tampil di halaman mana pun, jadi tidak ada yang perlu diterjemahkan.
 *
 * Gambar, latar, tata letak, urutan, dan tampil/sembunyi tidak ada di sini:
 * sama untuk kedua bahasa, diubah di mode ID.
 */

/** Muat di kolom satu baris panel 440; artinya: kosong jatuh ke teks Indonesia. */
const KOSONG = "Belum diisi. Tampil teks Indonesia.";

const ada = (teks: string | null | undefined): teks is string => Boolean(teks?.trim());

/** Satu kolom English dengan teks Indonesianya di bawah. */
function KolomEn({
  label,
  sumber,
  value,
  onChange,
  max,
  ideal,
  area = false,
  rows,
}: {
  label: string;
  sumber: string;
  value: string | undefined;
  onChange: (value: string) => void;
  max?: number;
  ideal?: number;
  area?: boolean;
  rows?: number;
}) {
  // Kolom panjang menampilkan sampai empat baris sumber: menerjemahkan paragraf
  // dari satu baris terpotong tidak mungkin. Teks utuhnya di `title`.
  const hint: ReactNode = (
    <span title={sumber} className={area ? "line-clamp-4 whitespace-pre-line" : "block truncate"}>
      <span className="font-medium">ID:</span> {sumber}
    </span>
  );
  const umum = {
    // Placeholder penuh on-surface-variant (5,33:1), bukan /70 bawaan: di sini ia
    // satu-satunya penjelasan bahwa kolom kosong jatuh ke teks Indonesia.
    className: "[&_input::placeholder]:text-on-surface-variant [&_textarea::placeholder]:text-on-surface-variant",
    label,
    hint,
    placeholder: KOSONG,
    maxLength: max,
    counter: max ? (ideal ? { ideal } : true) : false,
    value: value ?? "",
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  } as const;
  return area ? <TextArea {...umum} rows={rows ?? Math.min(6, Math.max(2, Math.ceil(sumber.length / 60)))} /> : <TextField {...umum} />;
}

/** Di dalam baris yang terbuka, bukan di atas daftar: tidak memakan satu baris daftar. */
const CATATAN = <p key="catatan" className="text-body-small text-on-surface-variant">Gambar dan tata letak diubah di mode ID.</p>;

function Kosong({ children }: { children: ReactNode }) {
  return <p className="text-body-medium text-on-surface-variant">{children}</p>;
}

function Kartu({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
      <p className="text-body-medium font-medium text-on-surface">{judul}</p>
      {children}
    </div>
  );
}

// ---- Blok tambahan ---------------------------------------------------------------

const LABEL_BLOK: Record<keyof LandingBlockEn, string> = {
  eyebrow: "Label kecil",
  heading: "Judul",
  body: "Isi",
  link_label: "Teks tombol utama",
  link2_label: "Teks tombol kedua",
  fact_title: "Kartu fakta",
  fact_body: "Keterangan kartu fakta",
  source: "Sumber",
  quote: "Kutipan",
  name: "Nama",
  role: "Jabatan dan lembaga",
  nav_label: "Label di menu atas",
};
const AREA_BLOK = new Set<keyof LandingBlockEn>(["body", "source", "quote"]);
/** Urutan kolom sama dengan editor ID. */
const URUT_BLOK: (keyof LandingBlockEn)[] = ["eyebrow", "heading", "body", "quote", "name", "role", "fact_title", "fact_body", "link_label", "link2_label", "source", "nav_label"];

const LABEL_BUTIR: Record<"label" | "title" | "body" | "value", string> = { label: "Label", title: "Judul", body: "Isi", value: "Angka" };

export function BlockEditorEn({ block, onChange }: { block: LandingBlock; onChange: (next: LandingBlock) => void }) {
  const batas = landingBlockLimits(block);
  const en = block.en ?? {};
  const ubah = (key: keyof LandingBlockEn, value: string) => onChange({ ...block, en: { ...en, [key]: value } });
  const items = block.items ?? [];
  const ubahItem = (index: number, key: keyof NonNullable<LandingBlockItem["en"]>, value: string) =>
    onChange({ ...block, items: items.map((item, posisi) => (posisi === index ? { ...item, en: { ...item.en, [key]: value } } : item)) });

  const kolom = URUT_BLOK.filter((key) => ada(block[key])).map((key) => {
    const limit: LandingTextLimit | undefined = key === "nav_label" ? undefined : batas[key as keyof typeof batas] as LandingTextLimit | undefined;
    return (
      <KolomEn
        key={key}
        label={LABEL_BLOK[key]}
        sumber={block[key] ?? ""}
        value={en[key]}
        onChange={(value) => ubah(key, value)}
        max={key === "nav_label" ? LANDING_NAV_LABEL_MAX : limit?.max}
        ideal={limit?.ideal}
        area={AREA_BLOK.has(key)}
      />
    );
  });
  const butir = items
    .map((item, index) => {
      const isian = (["label", "title", "value", "body"] as const).filter((key) => ada(item[key]));
      if (isian.length === 0) return null;
      return (
        <Kartu key={index} judul={`${block.type === "multicolumn" ? "Kolom" : "Butir"} ${index + 1}`}>
          {isian.map((key) => {
            const limit = batas.item?.[key];
            return (
              <KolomEn
                key={key}
                label={key === "label" && block.type === "logos" ? "Nama lembaga" : key === "label" && block.type === "multicolumn" ? "Teks tautan" : LABEL_BUTIR[key]}
                sumber={item[key] ?? ""}
                value={item.en?.[key]}
                onChange={(value) => ubahItem(index, key, value)}
                max={limit?.max}
                ideal={limit?.ideal}
                area={key === "body" || (block.type === "stats" && key === "label")}
              />
            );
          })}
        </Kartu>
      );
    })
    .filter(Boolean);

  if (kolom.length === 0 && butir.length === 0) {
    return <Kosong>{LANDING_BLOCK_LABELS[block.type]} ini belum punya teks Indonesia untuk diterjemahkan.</Kosong>;
  }
  return (
    <div className="flex flex-col gap-4">
      {CATATAN}
      {kolom}
      {butir}
    </div>
  );
}

// ---- Pembuka, bagian bawaan, kaki ------------------------------------------------

/** Kolom `events` yang versi English-nya disimpan di `landing_config.en`. */
export type FaktaEn = { tagline: string | null; description: string | null; venue_name: string | null; venue_address: string | null };

type KunciEn = Exclude<keyof LandingConfigEn, "program_notes">;

/**
 * Isi mode English untuk satu baris Susunan halaman selain blok tambahan:
 * "pembuka", "kaki", atau id bagian bawaan.
 */
export function BagianEn({
  id,
  landing,
  facts,
  setLanding,
}: {
  id: LandingSectionId | "pembuka" | "kaki";
  landing: EventLandingConfig;
  facts: FaktaEn;
  setLanding: (next: EventLandingConfig) => void;
}) {
  const en = landing.en ?? {};
  const ubahEn = (patch: LandingConfigEn) => setLanding({ ...landing, en: { ...en, ...patch } });
  const kolom = (key: KunciEn, label: string, sumber: string | null | undefined, max: number, area = false) =>
    ada(sumber) ? <KolomEn key={key} label={label} sumber={sumber} value={en[key]} onChange={(value) => ubahEn({ [key]: value })} max={max} area={area} /> : null;

  const hasil = ((): ReactNode[] => {
    switch (id) {
      case "pembuka":
        return [
          kolom("public_name", "Nama acara di halaman publik", landing.public_name, 120),
          kolom("tagline", "Tagline", facts.tagline, 200, true),
          kolom("cta_label", "Teks tombol daftar", landing.cta_label, 40),
        ];
      case "kaki":
        return [
          kolom("footer_note", "Kalimat penyelenggara", landing.footer_note, 180, true),
          kolom("cta_heading", "Judul banner", landing.cta_heading, 120),
          kolom("cta_note", "Kalimat banner", landing.cta_note, 300, true),
        ];
      case "about":
        return [kolom("about_heading", "Judul bagian", landing.about_heading, 160), kolom("description", "Deskripsi acara", facts.description, 5000, true)];
      case "venue":
        return [kolom("venue_name", "Nama tempat", facts.venue_name, 200), kolom("venue_address", "Alamat", facts.venue_address, 600, true)];
      case "agenda": {
        const catatan = landing.program_notes ?? [];
        return [
          kolom("agenda_note", "Catatan Susunan acara", landing.agenda_note, 140),
          kolom("program_heading", "Judul bagian Program", landing.program_heading, 120),
          kolom("program_intro", "Pengantar Program", landing.program_intro, 400, true),
          ...catatan.map((teks, index) =>
            ada(teks) ? (
              <KolomEn
                key={`catatan-${index}`}
                label={`Keterangan program ${index + 1}`}
                sumber={teks}
                value={en.program_notes?.[index]}
                onChange={(value) => {
                  const next = catatan.map((_, posisi) => en.program_notes?.[posisi] ?? "");
                  next[index] = value;
                  ubahEn({ program_notes: next });
                }}
                max={600}
                area
              />
            ) : null,
          ),
          <Kosong key="rundown">Judul sesi diambil dari Rundown acara dan diterjemahkan di sana pada tahap berikutnya.</Kosong>,
        ];
      }
      case "contact":
        return [kolom("contact_name", "Nama", landing.contact_name, 120)];
      case "speakers": {
        const daftar = landing.speakers ?? [];
        // Sesi diterjemahkan sekali per nama sesi, bukan per pembicara: satu
        // sesi dipakai beberapa pembicara, dan terjemahan yang berbeda-beda
        // akan memecah tab sesinya di halaman English.
        const sesi = [...new Set(daftar.map((s) => s.session?.trim()).filter(ada))];
        const ubahSesi = (nama: string, value: string) =>
          setLanding({ ...landing, speakers: daftar.map((s) => (s.session?.trim() === nama ? { ...s, en: { ...s.en, session: value } } : s)) });
        const kartuSesi = sesi.length ? (
          <Kartu key="sesi" judul="Sesi">
            {sesi.map((nama) => (
              <KolomEn
                key={nama}
                label={`Sesi "${nama}"`}
                sumber={nama}
                value={daftar.find((s) => s.session?.trim() === nama && ada(s.en?.session))?.en?.session}
                onChange={(value) => ubahSesi(nama, value)}
                max={40}
              />
            ))}
          </Kartu>
        ) : null;
        return [kartuSesi, ...daftar.map((speaker, index) => {
          const ubah = (key: "title" | "company" | "role", value: string) =>
            setLanding({ ...landing, speakers: daftar.map((s, posisi) => (posisi === index ? { ...s, en: { ...s.en, [key]: value } } : s)) });
          const isian = ([["title", "Jabatan", 200], ["company", "Instansi", 120], ["role", "Peran", 60]] as const).filter(([key]) => ada(speaker[key]));
          if (isian.length === 0) return null;
          return (
            <Kartu key={index} judul={speaker.name || `Pembicara ${index + 1}`}>
              {isian.map(([key, label, max]) => (
                <KolomEn key={key} label={label} sumber={speaker[key] ?? ""} value={speaker.en?.[key]} onChange={(value) => ubah(key, value)} max={max} />
              ))}
            </Kartu>
          );
        })];
      }
      case "faq": {
        const daftar = landing.faq ?? [];
        return daftar.map((item, index) => {
          const ubah = (key: "q" | "a", value: string) =>
            setLanding({ ...landing, faq: daftar.map((f, posisi) => (posisi === index ? { ...f, en: { ...f.en, [key]: value } } : f)) });
          return (
            <Kartu key={index} judul={`Pertanyaan ${index + 1}`}>
              <KolomEn label="Pertanyaan" sumber={item.q} value={item.en?.q} onChange={(value) => ubah("q", value)} max={200} />
              <KolomEn label="Jawaban" sumber={item.a} value={item.en?.a} onChange={(value) => ubah("a", value)} max={2000} area />
            </Kartu>
          );
        });
      }
      case "highlights": {
        const daftar = landing.highlights ?? [];
        return daftar.map((item, index) => {
          const ubah = (key: "label" | "value", value: string) =>
            setLanding({ ...landing, highlights: daftar.map((h, posisi) => (posisi === index ? { ...h, en: { ...h.en, [key]: value } } : h)) });
          return (
            <Kartu key={index} judul={`Angka ${index + 1}`}>
              <KolomEn label="Angka" sumber={item.value} value={item.en?.value} onChange={(value) => ubah("value", value)} max={30} />
              <KolomEn label="Keterangan" sumber={item.label} value={item.en?.label} onChange={(value) => ubah("label", value)} max={60} />
            </Kartu>
          );
        });
      }
      case "sponsors": {
        const daftar = landing.sponsors ?? [];
        return daftar.map((item, index) =>
          ada(item.name) ? (
            <KolomEn
              key={index}
              label={`Nama mitra ${index + 1}`}
              sumber={item.name}
              value={item.en?.name}
              onChange={(value) => setLanding({ ...landing, sponsors: daftar.map((s, posisi) => (posisi === index ? { ...s, en: { ...s.en, name: value } } : s)) })}
              max={120}
            />
          ) : null,
        );
      }
    }
  })().filter(Boolean);

  if (hasil.length === 0) {
    const nama = id === "pembuka" ? "Pembuka" : id === "kaki" ? "Kaki halaman" : LANDING_SECTION_LABELS[id];
    return <Kosong>{nama} belum punya teks Indonesia untuk diterjemahkan.</Kosong>;
  }
  return (
    <div className="flex flex-col gap-4">
      {CATATAN}
      {hasil}
    </div>
  );
}
