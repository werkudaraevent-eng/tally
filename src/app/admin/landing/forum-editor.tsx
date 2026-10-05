"use client";

import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button, IconButton, SegmentedButton, SelectField, TextArea, TextField } from "@/components/m3";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { Kelompok } from "@/components/admin/compact-form";
import { plural } from "@/lib/plural";
import {
  LANDING_FORUM_ICONS,
  type EventLandingConfig,
  type LandingForumConfig,
  type LandingForumIcon,
  type LandingForumLink,
  type LandingForumPage,
  type LandingForumPart,
} from "@/lib/domain";

// Isian CMS untuk tata letak Forum (Figma "IFC Website"). Susunannya tetap,
// jadi daftar di sini tidak bisa diseret: admin mengisi dan menyalakan atau
// mematikan bagian. Urutan baris = urutan bagian di Beranda, lalu bagian yang
// hanya ada di halaman Program acara.
//
// Dipisah dari page.tsx supaya pekerjaan lain di editor v2 (bilah atas tata
// letak Modern) tidak bertabrakan dengan isian Forum.

/** Fakta acara yang ikut disunting di sini; bagian dari `Facts` di page.tsx. */
type FaktaForum = {
  name: string;
  tagline: string | null;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_map_url: string | null;
};

/** Satu baris Susunan halaman; dirender oleh page.tsx supaya tampilannya sama. */
export type BarisForum = (opsi: {
  id: string;
  nomor: number;
  judul: string;
  sub?: string | null;
  lencana?: string | null;
  saklar?: { checked: boolean; onChange: (value: boolean) => void };
  isi: ReactNode;
}) => ReactNode;

/**
 * Halaman pratinjau yang dibuka saat sebuah baris dipilih. Bagian yang tampil
 * di lebih dari satu halaman (Tentang, Program, Pembicara) tidak memindah
 * pratinjau bila halaman sekarang sudah memuatnya.
 */
export function halamanBagianForum(id: string, sekarang: LandingForumPage): LandingForumPage {
  switch (id) {
    case "pembuka":
    case "tanggal":
    case "sorotan":
      return "beranda";
    case "venue":
    case "galeri":
    case "dresscode":
      return "program";
    case "info":
      return "info";
    case "about":
    case "program":
    case "speakers":
      return sekarang === "info" ? "beranda" : sekarang;
    default:
      return sekarang;
  }
}

const LANGIT = "#00aeef";
const KUNING = "#ffc72c";

function idInfoBaru() {
  return `info-${Math.random().toString(36).slice(2, 8)}`;
}

/** Ubah satu butir daftar. */
function ganti<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, position) => (position === index ? { ...item, ...patch } : item));
}

function tukar<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Naik, turun, hapus untuk satu butir daftar. */
function KendaliButir({ nama, index, jumlah, onPindah, onHapus }: { nama: string; index: number; jumlah: number; onPindah: (delta: number) => void; onHapus: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <IconButton size="sm" label={`Move ${nama} up`} disabled={index === 0} onClick={() => onPindah(-1)}>
        <ArrowUp size={16} />
      </IconButton>
      <IconButton size="sm" label={`Move ${nama} down`} disabled={index === jumlah - 1} onClick={() => onPindah(1)}>
        <ArrowDown size={16} />
      </IconButton>
      <IconButton size="sm" label={`Delete ${nama}`} className="text-error" onClick={onHapus}>
        <Trash size={16} />
      </IconButton>
    </div>
  );
}

function Kartu({ judul, kendali, children }: { judul: string; kendali: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-medium font-semibold text-on-surface">{judul}</p>
        {kendali}
      </div>
      {children}
    </div>
  );
}

/** Pilihan khusus Forum di tab Tema: bahasa label dan dua warna pendamping. */
export function ForumTema({
  landing,
  setLanding,
  PilihWarna,
}: {
  landing: EventLandingConfig;
  setLanding: (next: EventLandingConfig) => void;
  PilihWarna: (props: { label: string; value: string; onChange: (value: string) => void }) => ReactNode;
}) {
  const forum = landing.forum ?? {};
  const ubah = (patch: Partial<LandingForumConfig>) => setLanding({ ...landing, forum: { ...forum, ...patch } });
  return (
    <>
      <Kelompok title="Supporting colours" note="The brand colour above is used for the bar, main buttons, panels and footer.">
        <PilihWarna label="Accent colour" value={forum.accent ?? KUNING} onChange={(value) => ubah({ accent: value })} />
        <p className="-mt-2 text-body-medium text-on-surface-variant">The registration button in the hero, the badge line and the read-more button.</p>
        <PilihWarna label="Secondary colour" value={forum.secondary ?? LANGIT} onChange={(value) => ubah({ secondary: value })} />
        <p className="-mt-2 text-body-medium text-on-surface-variant">
          The sign-in button while registration is closed, and the agenda panel background (lightened). Text colour on top is picked automatically so it stays readable.
        </p>
      </Kelompok>
      <Kelompok title="Label language" note="For the menu, section headings and default buttons. Content you write is shown as typed.">
        <SegmentedButton<"id" | "en">
          className="w-full"
          label="Label language"
          value={forum.language ?? "id"}
          onChange={(value) => ubah({ language: value })}
          options={[
            { value: "id", label: "Indonesian" },
            { value: "en", label: "English" },
          ]}
        />
      </Kelompok>
    </>
  );
}

export function ForumSusunan({
  landing,
  setLanding,
  facts,
  patchFacts,
  busy,
  baris,
  isiPembicara,
  rundownKosong,
  lencanaRundown = "No agenda items yet",
  tampilTersembunyi,
}: {
  landing: EventLandingConfig;
  setLanding: (next: EventLandingConfig) => void;
  facts: FaktaForum;
  patchFacts: (patch: Partial<FaktaForum>) => void;
  busy: boolean;
  baris: BarisForum;
  /** Isian pembicara yang sama dengan tata letak lain. */
  isiPembicara: ReactNode;
  rundownKosong: boolean | null;
  /** "Rundown kosong" atau "Belum diterbitkan". */
  lencanaRundown?: string;
  /** Penyaring "Tampilkan N tersembunyi" di atas daftar. */
  tampilTersembunyi: boolean;
}) {
  const forum: LandingForumConfig = landing.forum ?? {};
  const ubah = (patch: Partial<LandingForumConfig>) => setLanding({ ...landing, forum: { ...forum, ...patch } });
  const hidden = new Set<LandingForumPart>(forum.hidden ?? []);
  const saklar = (part: LandingForumPart) => ({
    checked: !hidden.has(part),
    onChange: (value: boolean) => {
      const next = new Set(hidden);
      if (value) next.delete(part);
      else next.add(part);
      ubah({ hidden: [...next] });
    },
  });
  const gambar = (label: string, hint: string, value: string | null | undefined, onChange: (url: string | null) => void, previewClassName = "h-20 w-36") => (
    <ImageUploadField label={label} kind="landing" fit="cover" previewClassName={previewClassName} hint={hint} value={value ?? null} onChange={onChange} disabled={busy} />
  );

  const sorotan = forum.highlights ?? [];
  const info = forum.info ?? [];
  const galeri = forum.gallery ?? [];
  const dresscode = forum.dresscode ?? [];
  const sosmed = forum.socials ?? {};
  const tautanKaki = forum.footer_links ?? [];
  const speakers = (landing.speakers ?? []).filter((item) => item.name.trim());

  // Lencana "Belum ada isinya": aturannya sama dengan halaman publik, bagian
  // tanpa isi tidak dirender walau saklarnya menyala.
  const kosong = (part: LandingForumPart, berisi: boolean) => (!hidden.has(part) && !berisi ? "No content yet" : null);

  // ---- 1. Pembuka -------------------------------------------------------------
  const isiPembuka = (
    <div className="flex flex-col gap-5">
      <Kelompok title="Logo" first note="Empty = the event name is written at the top left.">
        {gambar(
          "Event logo",
          "Colour logo for the white bar on the Programme and Information pages. The same logo as the top bar in the Modern layout, so upload it once. Transparent PNG, at least 120 px tall.",
          landing.nav?.logo_url,
          (url) => setLanding({ ...landing, nav: { ...landing.nav, logo_url: url } }),
          "h-14 w-36",
        )}
        {gambar("White logo", "For the bar over the Home KV. Empty = the colour logo is used there too.", forum.logo_light_url, (url) => ubah({ logo_light_url: url }), "h-14 w-36 bg-neutral-800")}
      </Kelompok>
      <Kelompok title="Hero content">
        <TextField
          label="Badge"
          optional
          placeholder="e.g. Sesi Utama"
          hint="A short label with an accent line above the event name."
          maxLength={60}
          counter
          value={forum.hero_badge ?? ""}
          onChange={(event) => ubah({ hero_badge: event.target.value })}
        />
        <TextField
          label="Event name on the public page"
          optional
          hint="Leave empty to use the event name from admin."
          maxLength={120}
          counter
          value={landing.public_name ?? ""}
          onChange={(event) => setLanding({ ...landing, public_name: event.target.value })}
        />
        <TextArea
          label="Tagline"
          optional
          rows={2}
          hint="One sentence below the event name."
          value={facts.tagline ?? ""}
          onChange={(event) => patchFacts({ tagline: event.target.value })}
        />
        <TextField
          label="Registration button text"
          optional
          placeholder={forum.language === "en" ? "Register Here" : "Daftar di sini"}
          hint="The button shows while registration is open."
          maxLength={40}
          counter
          value={landing.cta_label ?? ""}
          onChange={(event) => setLanding({ ...landing, cta_label: event.target.value })}
        />
      </Kelompok>
      <Kelompok title="Background image (KV)">
        {gambar(
          "Hero image (KV)",
          "Ratio 16:9, at least 1920×1080. The text sits on the left, so keep the important part of the image on the right. Empty = brand colour background.",
          landing.banner_url,
          (url) => setLanding({ ...landing, banner_url: url }),
        )}
      </Kelompok>
    </div>
  );

  // ---- 2. Pita tanggal ----------------------------------------------------------
  const isiTanggal = (
    <div className="flex flex-col gap-4">
      <TextField
        label="Strip text"
        optional
        placeholder="e.g. Bali, Indonesia, 12 sampai 14 Februari 2026"
        hint="Empty = venue name and event date. Shown on Home and Practical information."
        maxLength={90}
        counter
        value={forum.date_banner_text ?? ""}
        onChange={(event) => ubah({ date_banner_text: event.target.value })}
      />
      {gambar("Strip background image", "Wide, ratio about 4:1. A dark shade is added so the white text stays readable. Empty = brand colour.", forum.date_banner_url, (url) => ubah({ date_banner_url: url }))}
    </div>
  );

  // ---- 3. Tentang --------------------------------------------------------------
  const isiTentang = (
    <div className="flex flex-col gap-4">
      <TextField
        label="Section heading"
        optional
        placeholder={forum.language === "en" ? "About us" : "Tentang kami"}
        maxLength={160}
        value={landing.about_heading ?? ""}
        onChange={(event) => setLanding({ ...landing, about_heading: event.target.value })}
      />
      <TextArea
        label="Event description"
        optional
        rows={8}
        hint="Home shows the opening paragraphs (about 600 characters) with a read-more button; the Programme page shows all of it. Separate paragraphs with a blank line; lines starting with a hyphen become bullet points."
        value={facts.description ?? ""}
        onChange={(event) => patchFacts({ description: event.target.value })}
      />
      {gambar("Photo beside the text", "Ratio 4:3, at least 1200×900. Home only; the text box overlaps its right side.", forum.about_image_url, (url) => ubah({ about_image_url: url }))}
    </div>
  );

  // ---- 4. Program dan susunan acara -----------------------------------------------
  const isiProgram = (
    <div className="flex flex-col gap-5">
      <Kelompok first>
        <p className="text-body-medium text-on-surface-variant">
          The agenda table comes from the Agenda, one panel per agenda section. Panels are collapsed on Home and expanded on the Programme page.
        </p>
        <TextArea
          label="Programme intro"
          optional
          rows={3}
          hint="Text below the programme heading."
          maxLength={400}
          counter
          value={landing.program_intro ?? ""}
          onChange={(event) => setLanding({ ...landing, program_intro: event.target.value })}
        />
        <TextField
          label="Agenda note"
          optional
          placeholder="Susunan acara dan pembicara masih dapat berubah."
          hint="Below the agenda heading, on Home and the Programme page."
          maxLength={140}
          counter
          value={landing.agenda_note ?? ""}
          onChange={(event) => setLanding({ ...landing, agenda_note: event.target.value })}
        />
      </Kelompok>
      <Kelompok title="Programme page banner">
        <TextField
          label="Banner text"
          optional
          placeholder={forum.language === "en" ? "General information about the event, agenda, and program." : "Informasi umum tentang acara, susunan acara, dan program."}
          maxLength={160}
          counter
          value={forum.program_subtitle ?? ""}
          onChange={(event) => ubah({ program_subtitle: event.target.value })}
        />
        {gambar("Banner image", "Ratio 3:2, at least 1000×700. Empty = the KV image.", forum.program_banner_url, (url) => ubah({ program_banner_url: url }))}
      </Kelompok>
    </div>
  );

  // ---- 6. Sorotan ----------------------------------------------------------------
  const setSorotan = (next: typeof sorotan) => ubah({ highlights: next });
  const isiSorotan = (
    <div className="flex flex-col gap-3">
      <p className="text-body-medium text-on-surface-variant">
        Alternating rows of text and photo on Home, for things you want to feature. 4 at most.
      </p>
      {sorotan.map((item, index) => (
        <Kartu
          key={index}
          judul={`Highlight ${index + 1}`}
          kendali={<KendaliButir nama={`highlight ${index + 1}`} index={index} jumlah={sorotan.length} onPindah={(delta) => setSorotan(tukar(sorotan, index, delta))} onHapus={() => setSorotan(sorotan.filter((_, position) => position !== index))} />}
        >
          <TextField label="Title" maxLength={60} counter value={item.title} onChange={(event) => setSorotan(ganti(sorotan, index, { title: event.target.value }))} />
          <TextArea label="Text" optional rows={4} maxLength={1500} counter value={item.body ?? ""} onChange={(event) => setSorotan(ganti(sorotan, index, { body: event.target.value }))} />
          {gambar(`Highlight photo ${index + 1}`, "Almost square (760×800). Alternates between right and left.", item.image_url, (url) => setSorotan(ganti(sorotan, index, { image_url: url })))}
          <SelectField
            label="Link"
            value={item.link ?? ""}
            onChange={(event) => setSorotan(ganti(sorotan, index, { link: (event.target.value || undefined) as LandingForumLink | undefined }))}
          >
            <option value="">No link</option>
            <option value="program">Programme page</option>
            <option value="info">Practical information page</option>
            <option value="daftar">Registration form</option>
            <option value="url">Other address</option>
          </SelectField>
          {item.link === "url" ? (
            <TextField label="Link address" type="url" placeholder="https://" value={item.link_url ?? ""} onChange={(event) => setSorotan(ganti(sorotan, index, { link_url: event.target.value }))} />
          ) : null}
          {item.link ? (
            <TextField
              label="Link text"
              optional
              placeholder={forum.language === "en" ? "See More" : "Lihat selengkapnya"}
              maxLength={40}
              counter
              value={item.link_label ?? ""}
              onChange={(event) => setSorotan(ganti(sorotan, index, { link_label: event.target.value }))}
            />
          ) : null}
        </Kartu>
      ))}
      <div>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={sorotan.length >= 4} onClick={() => setSorotan([...sorotan, { title: "" }])}>
          Add highlight
        </Button>
      </div>
    </div>
  );

  // ---- 7. Informasi praktis --------------------------------------------------------
  const setInfo = (next: typeof info) => ubah({ info: next });
  const isiInfo = (
    <div className="flex flex-col gap-5">
      <Kelompok first note="Home shows one picture tile per group; the Practical information page shows their content. The Practical information menu appears once there is a group.">
        <TextField
          label="Heading"
          optional
          placeholder={forum.language === "en" ? "Practical Information" : "Informasi praktis"}
          maxLength={60}
          counter
          value={forum.info_title ?? ""}
          onChange={(event) => ubah({ info_title: event.target.value })}
        />
        <TextArea label="Intro" optional rows={2} maxLength={400} counter value={forum.info_intro ?? ""} onChange={(event) => ubah({ info_intro: event.target.value })} />
      </Kelompok>
      <Kelompok title="Information groups" note="e.g. Visa, Flights, Health. 9 at most.">
        {info.map((kelompok, index) => {
          const butir = kelompok.items;
          const setButir = (next: typeof butir) => setInfo(ganti(info, index, { items: next }));
          return (
            <Kartu
              key={kelompok.id}
              judul={kelompok.title.trim() || `Group ${index + 1}`}
              kendali={<KendaliButir nama={`group ${index + 1}`} index={index} jumlah={info.length} onPindah={(delta) => setInfo(tukar(info, index, delta))} onHapus={() => setInfo(info.filter((_, position) => position !== index))} />}
            >
              <TextField label="Group title" maxLength={40} counter value={kelompok.title} onChange={(event) => setInfo(ganti(info, index, { title: event.target.value }))} />
              <SelectField label="Tile icon" value={kelompok.icon ?? "info"} onChange={(event) => setInfo(ganti(info, index, { icon: event.target.value as LandingForumIcon }))}>
                {(Object.keys(LANDING_FORUM_ICONS) as LandingForumIcon[]).map((key) => (
                  <option key={key} value={key}>{LANDING_FORUM_ICONS[key]}</option>
                ))}
              </SelectField>
              {gambar(`Tile photo ${index + 1}`, "Ratio 3:2. A dark shade is added so the white icon and title stay readable. Empty = brand colour.", kelompok.image_url, (url) => setInfo(ganti(info, index, { image_url: url })))}
              <div className="flex flex-col gap-3 border-t border-outline-variant pt-3">
                {butir.map((item, nomor) => (
                  <div key={nomor} className="flex flex-col gap-2">
                    <div className="flex items-end gap-2">
                      <TextField
                        className="min-w-0 flex-1"
                        label={`Subheading ${nomor + 1}`}
                        optional
                        maxLength={120}
                        value={item.heading ?? ""}
                        onChange={(event) => setButir(ganti(butir, nomor, { heading: event.target.value }))}
                      />
                      <KendaliButir nama={`entry ${nomor + 1}`} index={nomor} jumlah={butir.length} onPindah={(delta) => setButir(tukar(butir, nomor, delta))} onHapus={() => setButir(butir.filter((_, position) => position !== nomor))} />
                    </div>
                    <TextArea
                      label={`Text ${nomor + 1}`}
                      rows={4}
                      hint="Separate paragraphs with a blank line; lines starting with a hyphen become bullet points."
                      maxLength={2000}
                      counter
                      value={item.body}
                      onChange={(event) => setButir(ganti(butir, nomor, { body: event.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <Button variant="text" size="sm" icon={<Plus size={16} />} disabled={butir.length >= 20} onClick={() => setButir([...butir, { body: "" }])}>
                    Add entry
                  </Button>
                </div>
              </div>
            </Kartu>
          );
        })}
        <div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={info.length >= 9} onClick={() => setInfo([...info, { id: idInfoBaru(), title: "", icon: "info", items: [{ body: "" }] }])}>
            Add group
          </Button>
        </div>
      </Kelompok>
    </div>
  );

  // ---- 8. Lokasi ---------------------------------------------------------------
  const isiLokasi = (
    <div className="flex flex-col gap-4">
      <TextField label="Venue name" optional placeholder="e.g. Grand Ballroom, Hotel Mulia" hint="Also used in the calendar file and emails." value={facts.venue_name ?? ""} onChange={(event) => patchFacts({ venue_name: event.target.value })} />
      <TextArea label="Address" optional rows={3} value={facts.venue_address ?? ""} onChange={(event) => patchFacts({ venue_address: event.target.value })} />
      <TextField label="Map link" optional type="url" placeholder="https://maps.app.goo.gl/..." value={facts.venue_map_url ?? ""} onChange={(event) => patchFacts({ venue_map_url: event.target.value })} />
      <TextArea
        label="Venue description"
        optional
        rows={5}
        hint="A paragraph about the venue, above its name and address."
        maxLength={1200}
        counter
        value={forum.venue_note ?? ""}
        onChange={(event) => ubah({ venue_note: event.target.value })}
      />
      {gambar("Venue photo", "Ratio 4:3, at least 1200×900.", forum.venue_image_url, (url) => ubah({ venue_image_url: url }))}
    </div>
  );

  // ---- 9. Galeri ------------------------------------------------------------------
  const isiGaleri = (
    <div className="flex flex-col gap-3">
      <p className="text-body-medium text-on-surface-variant">Photos of the venue, three per row. Ratio 5:3, 6 at most.</p>
      {galeri.map((src, index) => (
        <div key={`${src}-${index}`} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {gambar(`Gallery photo ${index + 1}`, "", src, (url) => ubah({ gallery: url ? galeri.map((item, position) => (position === index ? url : item)) : galeri.filter((_, position) => position !== index) }))}
          </div>
          <KendaliButir nama={`photo ${index + 1}`} index={index} jumlah={galeri.length} onPindah={(delta) => ubah({ gallery: tukar(galeri, index, delta) })} onHapus={() => ubah({ gallery: galeri.filter((_, position) => position !== index) })} />
        </div>
      ))}
      {galeri.length < 6
        ? gambar("Add photo", "PNG, JPG or WebP, 5 MB max.", null, (url) => { if (url) ubah({ gallery: [...galeri, url] }); })
        : null}
    </div>
  );

  // ---- 10. Dress code ---------------------------------------------------------------
  const setDresscode = (next: typeof dresscode) => ubah({ dresscode: next });
  const isiDresscode = (
    <div className="flex flex-col gap-3">
      <TextArea label="Intro" optional rows={2} maxLength={400} counter value={forum.dresscode_intro ?? ""} onChange={(event) => ubah({ dresscode_intro: event.target.value })} />
      {dresscode.map((item, index) => (
        <Kartu
          key={index}
          judul={item.title.trim() || `Card ${index + 1}`}
          kendali={<KendaliButir nama={`card ${index + 1}`} index={index} jumlah={dresscode.length} onPindah={(delta) => setDresscode(tukar(dresscode, index, delta))} onHapus={() => setDresscode(dresscode.filter((_, position) => position !== index))} />}
        >
          <TextField label="Title" placeholder="e.g. Sesi siang" maxLength={40} counter value={item.title} onChange={(event) => setDresscode(ganti(dresscode, index, { title: event.target.value }))} />
          <TextArea label="Description" optional rows={3} maxLength={400} counter value={item.body ?? ""} onChange={(event) => setDresscode(ganti(dresscode, index, { body: event.target.value }))} />
          {gambar(`Card photo ${index + 1}`, "Ratio 9:8, at least 960×850.", item.image_url, (url) => setDresscode(ganti(dresscode, index, { image_url: url })))}
        </Kartu>
      ))}
      <div>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={dresscode.length >= 6} onClick={() => setDresscode([...dresscode, { title: "" }])}>
          Add card
        </Button>
      </div>
    </div>
  );

  // ---- 11. Kaki halaman --------------------------------------------------------------
  const SOSMED: { key: keyof NonNullable<LandingForumConfig["socials"]>; label: string }[] = [
    { key: "facebook", label: "Facebook" },
    { key: "x", label: "X" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "instagram", label: "Instagram" },
    { key: "youtube", label: "YouTube" },
    { key: "whatsapp", label: "WhatsApp" },
  ];
  const setTautanKaki = (next: typeof tautanKaki) => ubah({ footer_links: next });
  const isiKaki = (
    <div className="flex flex-col gap-5">
      <Kelompok first>
        {gambar("Footer logo", "A white or light version, since the background is the brand colour. Empty = event name.", forum.footer_logo_url, (url) => ubah({ footer_logo_url: url }), "h-14 w-36 bg-neutral-800")}
        <TextArea
          label="Organiser line"
          optional
          rows={2}
          placeholder="Diselenggarakan oleh ..."
          maxLength={180}
          counter
          value={landing.footer_note ?? ""}
          onChange={(event) => setLanding({ ...landing, footer_note: event.target.value })}
        />
      </Kelompok>
      <Kelompok title="Social media" note="Icons only show for filled-in fields.">
        {SOSMED.map(({ key, label }) => (
          <TextField
            key={key}
            label={label}
            optional
            type="url"
            placeholder="https://"
            value={sosmed[key] ?? ""}
            onChange={(event) => ubah({ socials: { ...sosmed, [key]: event.target.value } })}
          />
        ))}
      </Kelompok>
      <Kelompok title="Links below the line" note="e.g. Privacy policy, Contact the organisers. 8 at most.">
        {tautanKaki.map((item, index) => (
          <div key={index} className="flex items-end gap-2">
            <TextField className="w-32 shrink-0" label="Text" maxLength={40} value={item.label} onChange={(event) => setTautanKaki(ganti(tautanKaki, index, { label: event.target.value }))} />
            <TextField className="min-w-0 flex-1" label="Address" type="url" placeholder="https://" value={item.url} onChange={(event) => setTautanKaki(ganti(tautanKaki, index, { url: event.target.value }))} />
            <IconButton size="sm" label={`Delete link ${index + 1}`} className="mb-2 text-error" onClick={() => setTautanKaki(tautanKaki.filter((_, position) => position !== index))}>
              <Trash size={16} />
            </IconButton>
          </div>
        ))}
        <div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={tautanKaki.length >= 8} onClick={() => setTautanKaki([...tautanKaki, { label: "", url: "" }])}>
            Add link
          </Button>
        </div>
      </Kelompok>
    </div>
  );

  const venueAda = Boolean(facts.venue_name?.trim() || facts.venue_address?.trim() || forum.venue_note?.trim());
  const programAda = rundownKosong === false || Boolean(landing.program_intro?.trim());
  const baris1 = [
    { id: "pembuka", judul: "Hero", sub: "Home · logo, KV, event name, registration button", isi: isiPembuka },
    { id: "tanggal", part: "tanggal", judul: "Venue and date strip", sub: "Home, Practical information", isi: isiTanggal, berisi: true },
    { id: "about", part: "about", judul: "About the event", sub: "Home (short), Programme (full)", isi: isiTentang, berisi: Boolean(facts.description?.trim()) },
    {
      id: "program",
      part: "program",
      judul: "Programme and agenda",
      sub: "Home, Programme · from the Agenda",
      isi: isiProgram,
      berisi: programAda,
      lencana: !hidden.has("program") && rundownKosong && !landing.program_intro?.trim() ? lencanaRundown : undefined,
    },
    { id: "speakers", part: "speakers", judul: "Speakers", sub: `Home, Programme · ${plural(speakers.length, "speaker")}`, isi: isiPembicara, berisi: speakers.length > 0 },
    { id: "sorotan", part: "sorotan", judul: "Highlights", sub: `Home · ${plural(sorotan.length, "row")}`, isi: isiSorotan, berisi: sorotan.some((item) => item.title.trim()) },
    { id: "info", part: "info", judul: "Practical information", sub: `Home (tiles), own page · ${plural(info.length, "group")}`, isi: isiInfo, berisi: info.some((item) => item.title.trim()) },
    { id: "venue", part: "venue", judul: "Venue", sub: "Programme · venue, address, map", isi: isiLokasi, berisi: venueAda },
    { id: "galeri", part: "galeri", judul: "Venue gallery", sub: `Programme · ${plural(galeri.length, "photo")}`, isi: isiGaleri, berisi: galeri.length > 0 },
    { id: "dresscode", part: "dresscode", judul: "Dress code", sub: `Programme · ${plural(dresscode.length, "card")}`, isi: isiDresscode, berisi: dresscode.some((item) => item.title.trim()) },
    { id: "kaki", judul: "Footer", sub: "All pages · logo, social media, links", isi: isiKaki },
  ] as { id: string; part?: LandingForumPart; judul: string; sub: string; isi: ReactNode; berisi?: boolean; lencana?: string }[];

  return (
    <ol className="flex flex-col">
      {baris1.map((item, index) =>
        item.part && hidden.has(item.part) && !tampilTersembunyi ? null : baris({
          id: item.id,
          nomor: index + 1,
          judul: item.judul,
          sub: item.sub,
          isi: item.isi,
          lencana: item.part ? (item.lencana ?? kosong(item.part, item.berisi ?? true)) : null,
          saklar: item.part ? saklar(item.part) : undefined,
        }),
      )}
    </ol>
  );
}

const TAUTAN_PENUH = /^https?:\/\/\S+\.\S+/;

/**
 * Tautan Forum yang belum valid, dengan baris yang harus dibuka. Server juga
 * menolaknya, tetapi galatnya tidak menyebut kolom mana.
 */
export function forumTautanSalah(forum: LandingForumConfig | undefined): { baris: string; pesan: string } | null {
  if (!forum) return null;
  const salah = (value: string | undefined) => Boolean(value?.trim()) && !TAUTAN_PENUH.test(value!.trim());
  for (const [index, item] of (forum.highlights ?? []).entries()) {
    if (item.link === "url" && salah(item.link_url)) return { baris: "sorotan", pesan: `Highlight ${index + 1}: the link address must start with https://.` };
  }
  for (const [key, value] of Object.entries(forum.socials ?? {})) {
    if (salah(value)) return { baris: "kaki", pesan: `Social media ${key}: enter the full address starting with https://, or leave it empty.` };
  }
  for (const [index, item] of (forum.footer_links ?? []).entries()) {
    if (salah(item.url) || (item.label.trim() && !item.url.trim())) return { baris: "kaki", pesan: `Footer link ${index + 1}: enter the full address starting with https://.` };
  }
  return null;
}
