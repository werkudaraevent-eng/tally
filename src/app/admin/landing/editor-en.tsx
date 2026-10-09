"use client";

import { HighlightField } from "@/components/admin/highlight-field";
import { tanpaBintang } from "@/lib/landing-tagline";
import { landingTokens } from "@/lib/landing-tokens";
import type { ReactNode } from "react";
import { TextArea, TextField } from "@/components/m3";
import { landingSectionHeading } from "@/lib/landing-i18n";
import {
  LANDING_BLOCK_LABELS,
  LANDING_ABOUT_CARDS,
  LANDING_IMAGE_ALT_MAX,
  LANDING_NAV_LABEL_MAX,
  LANDING_SECTION_ADMIN_LABELS,
  LANDING_SECTION_TEXT_MAX,
  landingBlockLimits,
  type EventLandingConfig,
  type LandingBlock,
  type LandingBlockEn,
  type LandingBlockItem,
  type LandingConfigEn,
  type LandingHeadedSection,
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
const KOSONG = "Not filled. Shows the Indonesian text.";

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
  kunci,
  kosong = KOSONG,
}: {
  label: string;
  sumber: string;
  value: string | undefined;
  onChange: (value: string) => void;
  max?: number;
  ideal?: number;
  area?: boolean;
  rows?: number;
  /** `data-kolom`: dipakai Simpan untuk membawa kolom yang salah ke layar. */
  kunci?: string;
  /** Placeholder kolom kosong; bawaan KOSONG. */
  kosong?: string;
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
    "data-kolom": kunci,
    label,
    hint,
    placeholder: kosong,
    maxLength: max,
    counter: max ? (ideal ? { ideal } : true) : false,
    value: value ?? "",
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  } as const;
  return area ? <TextArea {...umum} rows={rows ?? Math.min(6, Math.max(2, Math.ceil(sumber.length / 60)))} /> : <TextField {...umum} />;
}

/** Di dalam baris yang terbuka, bukan di atas daftar: tidak memakan satu baris daftar. */
const CATATAN = <p key="catatan" className="text-body-small text-on-surface-variant">Images and layout are changed in ID mode.</p>;

function Kosong({ children }: { children: ReactNode }) {
  return <p className="text-body-medium text-on-surface-variant">{children}</p>;
}

function Kartu({ judul, id, children }: { judul: string; id?: string; children: ReactNode }) {
  // Grup berlabel: pembaca layar mendengar "Sesi 08.00, Judul", bukan tujuh "Judul" yang sama.
  return (
    <div id={id} role="group" aria-label={judul} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
      <p className="text-body-medium font-medium text-on-surface">{judul}</p>
      {children}
    </div>
  );
}

// ---- Blok tambahan ---------------------------------------------------------------

const LABEL_BLOK: Record<keyof LandingBlockEn, string> = {
  eyebrow: "Small label",
  heading: "Heading",
  body: "Body",
  link_label: "Main button text",
  link2_label: "Second button text",
  fact_title: "Fact card",
  fact_body: "Fact card description",
  source: "Source",
  quote: "Quote",
  name: "Name",
  role: "Position and organisation",
  nav_label: "Top menu label",
};
const AREA_BLOK = new Set<keyof LandingBlockEn>(["body", "source", "quote"]);
/** Urutan kolom sama dengan editor ID. */
const URUT_BLOK: (keyof LandingBlockEn)[] = ["eyebrow", "heading", "body", "quote", "name", "role", "fact_title", "fact_body", "link_label", "link2_label", "source", "nav_label"];

const LABEL_BUTIR: Record<"label" | "title" | "body" | "value", string> = { label: "Label", title: "Title", body: "Text", value: "Figure" };

/** Label kolom blok di editor English, untuk galat Simpan yang menyebut kolomnya. */
export function labelKolomBlokEn(key: string): string {
  return LABEL_BLOK[key as keyof LandingBlockEn] ?? key;
}

export function labelIsianButirEn(block: LandingBlock, key: "label" | "title" | "body" | "value"): string {
  return key === "label" && block.type === "logos" ? "Organisation name" : key === "label" && block.type === "multicolumn" ? "Link text" : LABEL_BUTIR[key];
}

/** "Kolom 2", "Butir 3": judul kartu butir di editor English. */
export function namaButirBlokEn(block: LandingBlock, index: number): string {
  return `${block.type === "multicolumn" ? "Column" : "Item"} ${index + 1}`;
}

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
        <Kartu key={index} judul={namaButirBlokEn(block, index)}>
          {isian.map((key) => {
            const limit = batas.item?.[key];
            return (
              <KolomEn
                key={key}
                label={labelIsianButirEn(block, key)}
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
    return <Kosong>This {LANDING_BLOCK_LABELS[block.type]} block has no Indonesian text to translate yet.</Kosong>;
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
export type FaktaEn = {
  tagline: string | null;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  /** Untuk judul otomatis Susunan acara: label yang sama dengan tanggal tidak tampil. */
  event_date: string | null;
  end_date: string | null;
};

/**
 * Satu baris Rundown yang tampil di Susunan acara, dengan teks English-nya.
 * Disimpan ke tabel rundown (bukan ke landing_config) saat Simpan.
 */
/** `bagian` hanya diisi bila rundown punya lebih dari satu bagian (hari), supaya judul kartu tidak kembar. */
export type BarisRundownEn = { id: number; jam: string; bagian: string | null; title: string; subtitle: string | null; title_en: string; subtitle_en: string };

/** Id kartu terjemahan satu baris rundown, untuk menggulir ke baris yang gagal disimpan. */
export const kartuRundownId = (id: number) => `rundown-en-${id}`;

/** Baris rundown yang tampil di halaman Indonesia tetapi belum punya teks English. */
export function rundownBelumDiterjemahkan(baris: BarisRundownEn[]): number {
  return baris.reduce((jumlah, item) => jumlah + (ada(item.title) && !ada(item.title_en) ? 1 : 0) + (ada(item.subtitle) && !ada(item.subtitle_en) ? 1 : 0), 0);
}

type KunciEn = Exclude<keyof LandingConfigEn, "program_notes" | "about_cards">;

/**
 * Isi mode English untuk satu baris Susunan halaman selain blok tambahan:
 * "pembuka", "kaki", atau id bagian bawaan.
 */
export function BagianEn({
  id,
  landing,
  facts,
  setLanding,
  rundown = [],
  ubahRundown,
  sesiRundown = [],
}: {
  id: LandingSectionId | "pembuka" | "kaki";
  landing: EventLandingConfig;
  facts: FaktaEn;
  setLanding: (next: EventLandingConfig) => void;
  /** Baris Rundown untuk bagian Susunan acara. */
  /** null: rundown gagal dimuat. */
  rundown?: BarisRundownEn[] | null;
  ubahRundown?: (id: number, patch: Partial<Pick<BarisRundownEn, "title_en" | "subtitle_en">>) => void;
  /**
   * Bagian Pembicara: baris rundown yang dipegang pembicara, bila Susunan acara
   * disembunyikan. Judulnya menjadi label tab sesi English, dan tanpa Susunan
   * acara tidak ada tempat lain untuk menerjemahkannya.
   */
  sesiRundown?: BarisRundownEn[];
}) {
  const en = landing.en ?? {};
  const ubahEn = (patch: LandingConfigEn) => setLanding({ ...landing, en: { ...en, ...patch } });
  const kolom = (key: KunciEn, label: string, sumber: string | null | undefined, max: number, area = false, ideal?: number) =>
    ada(sumber) ? <KolomEn key={key} kunci={key} label={label} sumber={sumber} value={en[key]} onChange={(value) => ubahEn({ [key]: value })} max={max} ideal={ideal} area={area} /> : null;

  // Judul bagian bawaan: hanya yang diubah di versi Indonesia; yang kosong
  // memakai teks bawaan English. Label kecil yang tidak tampil di halaman
  // Indonesia (dimatikan, atau sama dengan judulnya) tidak ditanya.
  const judulBagian = (bagian: LandingHeadedSection, pengantar = false) => {
    const isian = [
      // Label yang dimatikan tetap ditampilkan bila terlalu panjang: Simpan menolaknya.
      landingSectionHeading(facts, landing, "id", bagian).alis !== null || (en[`${bagian}_eyebrow`]?.trim().length ?? 0) > LANDING_SECTION_TEXT_MAX.eyebrow ? kolom(`${bagian}_eyebrow`, "Small label", landing[`${bagian}_eyebrow`], LANDING_SECTION_TEXT_MAX.eyebrow) : null,
      bagian === "about"
        ? kolom("about_heading", "Heading", landing.about_heading, LANDING_SECTION_TEXT_MAX.heading, false, LANDING_SECTION_TEXT_MAX.headingIdeal)
        : kolom(`${bagian}_heading`, "Heading", landing[`${bagian}_heading`], LANDING_SECTION_TEXT_MAX.heading, false, LANDING_SECTION_TEXT_MAX.headingIdeal),
      pengantar ? kolom("faq_intro", "Intro", landing.faq_intro, LANDING_SECTION_TEXT_MAX.intro, true) : null,
    ].filter(Boolean);
    return isian.length ? <Kartu key="judul-bagian" judul="Section heading">{isian}</Kartu> : null;
  };

  const hasil = ((): ReactNode[] => {
    switch (id) {
      case "pembuka":
        return [
          kolom("public_name", "Event name on the public page", landing.public_name, 120),
          // Judul gathering: kolom Highlight yang sama dengan mode ID, tanpa bintang (QA #109 M5).
          // Selalu kolom Highlight di gathering, juga saat judul ID kosong (QA #109 N5).
          landing.gathering ? (
            <HighlightField
              key="tagline"
              data-kolom="tagline"
              label="Title"
              hint={ada(facts.tagline) ? `ID: ${tanpaBintang(facts.tagline ?? "")} · Empty uses the Indonesian title.` : "Shows on the English page once the Indonesian title is filled."}
              accent={landingTokens(landing).accent ?? "#d4a72c"}
              maxLength={200}
              value={en.tagline ?? ""}
              onChange={(tagline) => ubahEn({ tagline })}
            />
          ) : (
            kolom("tagline", "Tagline", facts.tagline, 200, true)
          ),
          ...(landing.gathering
            ? [kolom("hero_eyebrow", "Label above the title", landing.hero_eyebrow, 60, true), kolom("hero_note", "Line below the title", landing.hero_note, 240, true)]
            : []),
          kolom("cta_label", "Register button text", landing.cta_label, 40),
        ];
      case "kaki":
        return [
          kolom("footer_note", "Organiser line", landing.footer_note, 180, true),
          kolom("cta_heading", "Banner heading", landing.cta_heading, 120),
          kolom("cta_note", "Banner text", landing.cta_note, 300, true),
        ];
      case "about":
        return [
          kolom("description", "Event description", facts.description, 5000, true),
          // Hanya saat gambar sendiri benar-benar tampil di halaman Modern.
          landing.layout === "modern" && landing.about_media === "image" && ada(landing.about_image_url)
            ? kolom("about_image_alt", "Image description", landing.about_image_alt, LANDING_IMAGE_ALT_MAX)
            : null,
          judulBagian("about"),
          // Kartu Tentang acara (gaya gathering): satu kartu terjemahan per
          // kartu Indonesia, urut sama; kolom kosong memakai teks Indonesia.
          ...(landing.gathering
            ? (landing.about_cards ?? []).map((kartu, index) => {
                if (!ada(kartu.title) && !ada(kartu.body)) return null;
                const ubahKartu = (patch: { title?: string; body?: string }) => {
                  const next = (landing.about_cards ?? []).map((_, posisi) => ({ ...en.about_cards?.[posisi] }));
                  next[index] = { ...next[index], ...patch };
                  ubahEn({ about_cards: next });
                };
                return (
                  <Kartu key={`kartu-tentang-${index}`} judul={`Card ${index + 1}`}>
                    {ada(kartu.title) ? (
                      <KolomEn label="Title" sumber={kartu.title} value={en.about_cards?.[index]?.title} onChange={(value) => ubahKartu({ title: value })} max={LANDING_ABOUT_CARDS.title} />
                    ) : null}
                    {ada(kartu.body) ? (
                      <KolomEn label="Text" sumber={kartu.body} value={en.about_cards?.[index]?.body} onChange={(value) => ubahKartu({ body: value })} max={LANDING_ABOUT_CARDS.body} area />
                    ) : null}
                  </Kartu>
                );
              })
            : []),
        ];
      case "venue":
        return [kolom("venue_name", "Venue name", facts.venue_name, 200), kolom("venue_address", "Address", facts.venue_address, 600, true), judulBagian("venue")];
      case "agenda": {
        const catatan = landing.program_notes ?? [];
        // Syarat yang sama dengan landingUntranslated, supaya lencana menghitung kolom yang tampil (QA #110 L4).
        const gayaGathering = landing.layout === "modern" && landing.gathering === true;
        return [
          judulBagian("agenda"),
          kolom("agenda_note", "Agenda note", landing.agenda_note, 140),
          // Gathering tidak punya kartu Program: judul dan pengantarnya tidak
          // tampil, jadi tidak perlu diterjemahkan (CMS mudah, butir 14).
          gayaGathering ? null : kolom("program_heading", "Programme section heading", landing.program_heading, 120),
          gayaGathering ? null : kolom("program_intro", "Programme intro", landing.program_intro, 400, true),
          ...catatan.map((teks, index) =>
            ada(teks) ? (
              <KolomEn
                key={`catatan-${index}`}
                label={`Programme note ${index + 1}`}
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
          ...(rundown === null
            ? [<Kosong key="rundown">The agenda could not be loaded. Reload the page to translate its sessions.</Kosong>]
            : rundown.length === 0
            ? [<Kosong key="rundown">No agenda items yet.</Kosong>]
            : [
                ...rundown.map((baris) => (
                <Kartu key={`rundown-${baris.id}`} id={kartuRundownId(baris.id)} judul={baris.bagian ? `${baris.bagian} · ${baris.jam}` : `Session ${baris.jam}`}>
                  <KolomEn label="Title" sumber={baris.title} value={baris.title_en} onChange={(value) => ubahRundown?.(baris.id, { title_en: value })} max={200} />
                  {ada(baris.subtitle) ? (
                    <KolomEn label="Description" sumber={baris.subtitle} value={baris.subtitle_en} onChange={(value) => ubahRundown?.(baris.id, { subtitle_en: value })} max={800} area />
                  ) : null}
                </Kartu>
                )),
                <p key="rundown-catatan" className="text-body-small text-on-surface-variant">The preview shows the English session text after you save.</p>,
              ]),
        ];
      }
      case "contact":
        return [kolom("contact_name", "Name", landing.contact_name, 120)];
      case "speakers": {
        // Jabatan, instansi, dan peran pembicara diterjemahkan di halaman
        // Speakers (pilihan English di panel sunting), tempat orangnya disunting.
        // Judul sesi tetap di sini: itu judul rundown, bukan data pembicara.
        const kartuSesiRundown = sesiRundown.length ? (
          <Kartu key="sesi-rundown" judul="Session titles from the agenda">
            {sesiRundown.map((baris) => (
              <KolomEn key={baris.id} label={`Session ${baris.jam}`} sumber={baris.title} value={baris.title_en} onChange={(value) => ubahRundown?.(baris.id, { title_en: value })} max={200} />
            ))}
          </Kartu>
        ) : null;
        return [
          <p key="pembicara-catatan" className="text-body-small text-on-surface-variant">
            Job titles, organisations and roles are translated on the Speakers page: open a speaker, then choose English.
          </p>,
          kartuSesiRundown,
          judulBagian("speakers"),
        ];
      }
      case "faq": {
        const daftar = landing.faq ?? [];
        return [...daftar.map((item, index) => {
          const ubah = (key: "q" | "a", value: string) =>
            setLanding({ ...landing, faq: daftar.map((f, posisi) => (posisi === index ? { ...f, en: { ...f.en, [key]: value } } : f)) });
          return (
            <Kartu key={index} judul={`Question ${index + 1}`}>
              <KolomEn label="Question" sumber={item.q} value={item.en?.q} onChange={(value) => ubah("q", value)} max={200} />
              <KolomEn label="Answer" sumber={item.a} value={item.en?.a} onChange={(value) => ubah("a", value)} max={2000} area />
            </Kartu>
          );
        }), judulBagian("faq", true)];
      }
      case "highlights": {
        const daftar = landing.highlights ?? [];
        return daftar.map((item, index) => {
          const ubah = (key: "label" | "value", value: string) =>
            setLanding({ ...landing, highlights: daftar.map((h, posisi) => (posisi === index ? { ...h, en: { ...h.en, [key]: value } } : h)) });
          return (
            <Kartu key={index} judul={`Figure ${index + 1}`}>
              <KolomEn label="Figure" sumber={item.value} value={item.en?.value} onChange={(value) => ubah("value", value)} max={30} />
              <KolomEn label="Description" sumber={item.label} value={item.en?.label} onChange={(value) => ubah("label", value)} max={60} />
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
              label={`Partner name ${index + 1}`}
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
    const nama = id === "pembuka" ? "Hero" : id === "kaki" ? "Footer" : LANDING_SECTION_ADMIN_LABELS[id];
    return <Kosong>{nama} has no Indonesian text to translate yet.</Kosong>;
  }
  return (
    <div className="flex flex-col gap-4">
      {CATATAN}
      {hasil}
    </div>
  );
}
