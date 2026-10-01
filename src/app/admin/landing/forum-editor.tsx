"use client";

import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button, IconButton, SegmentedButton, SelectField, TextArea, TextField } from "@/components/m3";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { Kelompok } from "@/components/admin/compact-form";
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
  redup?: boolean;
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
      <IconButton size="sm" label={`Naikkan ${nama}`} disabled={index === 0} onClick={() => onPindah(-1)}>
        <ArrowUp size={16} />
      </IconButton>
      <IconButton size="sm" label={`Turunkan ${nama}`} disabled={index === jumlah - 1} onClick={() => onPindah(1)}>
        <ArrowDown size={16} />
      </IconButton>
      <IconButton size="sm" label={`Hapus ${nama}`} className="text-error" onClick={onHapus}>
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
      <Kelompok title="Warna pendamping" note="Warna merek di atas dipakai untuk bilah, tombol utama, panel, dan kaki halaman.">
        <PilihWarna label="Warna aksen" value={forum.accent ?? KUNING} onChange={(value) => ubah({ accent: value })} />
        <p className="-mt-2 text-body-medium text-on-surface-variant">Lencana di hero dan tombol Selengkapnya.</p>
        <PilihWarna label="Warna sekunder" value={forum.secondary ?? LANGIT} onChange={(value) => ubah({ secondary: value })} />
        <p className="-mt-2 text-body-medium text-on-surface-variant">
          Tombol Masuk dan latar panel Susunan acara (diencerkan). Warna teks di atasnya dipilih otomatis supaya terbaca.
        </p>
      </Kelompok>
      <Kelompok title="Bahasa label" note="Untuk menu, judul bagian, dan tombol bawaan. Isi yang Anda tulis tampil apa adanya.">
        <SegmentedButton<"id" | "en">
          className="w-full"
          label="Bahasa label"
          value={forum.language ?? "id"}
          onChange={(value) => ubah({ language: value })}
          options={[
            { value: "id", label: "Indonesia" },
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
  const kosong = (part: LandingForumPart, berisi: boolean) => (!hidden.has(part) && !berisi ? "Belum ada isinya" : null);

  // ---- 1. Pembuka -------------------------------------------------------------
  const isiPembuka = (
    <div className="flex flex-col gap-5">
      <Kelompok title="Logo" first note="Kosong = nama acara ditulis di kiri atas.">
        {gambar("Logo berwarna", "Untuk bilah putih di halaman Program dan Informasi. PNG transparan, tinggi minimal 120 px.", forum.logo_url, (url) => ubah({ logo_url: url }), "h-14 w-36")}
        {gambar("Logo putih", "Untuk bilah di atas KV Beranda. Kosong = logo berwarna dipakai juga di sana.", forum.logo_light_url, (url) => ubah({ logo_light_url: url }), "h-14 w-36 bg-neutral-800")}
      </Kelompok>
      <Kelompok title="Isi hero">
        <TextField
          label="Lencana"
          optional
          placeholder="mis. Sesi Utama"
          hint="Kotak kecil berwarna aksen di atas nama acara."
          maxLength={60}
          counter
          value={forum.hero_badge ?? ""}
          onChange={(event) => ubah({ hero_badge: event.target.value })}
        />
        <TextField
          label="Nama acara di halaman publik"
          optional
          hint="Kosongkan untuk memakai nama acara di admin."
          maxLength={120}
          counter
          value={landing.public_name ?? ""}
          onChange={(event) => setLanding({ ...landing, public_name: event.target.value })}
        />
        <TextArea
          label="Tagline"
          optional
          rows={2}
          hint="Satu kalimat di bawah nama acara."
          value={facts.tagline ?? ""}
          onChange={(event) => patchFacts({ tagline: event.target.value })}
        />
        <TextField
          label="Teks tombol daftar"
          optional
          placeholder={forum.language === "en" ? "Register Here" : "Daftar di sini"}
          hint="Tombol tampil selama pendaftaran dibuka."
          maxLength={40}
          counter
          value={landing.cta_label ?? ""}
          onChange={(event) => setLanding({ ...landing, cta_label: event.target.value })}
        />
      </Kelompok>
      <Kelompok title="Gambar latar (KV)">
        {gambar(
          "Gambar hero (KV)",
          "Rasio 16:9, minimal 1920×1080. Teks berdiri di kiri, jadi bagian penting gambar sebaiknya di kanan. Kosong = latar warna merek.",
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
        label="Kalimat pita"
        optional
        placeholder="mis. Bali, Indonesia, 12 sampai 14 Februari 2026"
        hint="Kosong = nama tempat dan tanggal acara. Tampil di Beranda dan Informasi praktis."
        maxLength={90}
        counter
        value={forum.date_banner_text ?? ""}
        onChange={(event) => ubah({ date_banner_text: event.target.value })}
      />
      {gambar("Gambar latar pita", "Lebar, rasio sekitar 4:1. Diberi bayangan gelap agar teks putih terbaca. Kosong = warna merek.", forum.date_banner_url, (url) => ubah({ date_banner_url: url }))}
    </div>
  );

  // ---- 3. Tentang --------------------------------------------------------------
  const isiTentang = (
    <div className="flex flex-col gap-4">
      <TextField
        label="Judul bagian"
        optional
        placeholder={forum.language === "en" ? "About us" : "Tentang kami"}
        maxLength={160}
        value={landing.about_heading ?? ""}
        onChange={(event) => setLanding({ ...landing, about_heading: event.target.value })}
      />
      <TextArea
        label="Deskripsi acara"
        optional
        rows={8}
        hint="Beranda menampilkan paragraf awal (sekitar 600 karakter) dengan tombol Selengkapnya; halaman Program menampilkan semuanya. Pisahkan paragraf dengan baris kosong; baris yang diawali tanda minus jadi butir."
        value={facts.description ?? ""}
        onChange={(event) => patchFacts({ description: event.target.value })}
      />
      {gambar("Foto di samping teks", "Rasio 4:3, minimal 1200×900. Hanya di Beranda; kotak teks menumpang di sisi kanannya.", forum.about_image_url, (url) => ubah({ about_image_url: url }))}
    </div>
  );

  // ---- 4. Program dan susunan acara -----------------------------------------------
  const isiProgram = (
    <div className="flex flex-col gap-5">
      <Kelompok first>
        <p className="text-body-medium text-on-surface-variant">
          Tabel Susunan acara diambil dari Rundown acara, satu panel per bagian Rundown. Di Beranda panelnya tertutup, di halaman Program terbuka.
        </p>
        <TextArea
          label="Pengantar program"
          optional
          rows={3}
          hint="Teks di bawah judul Program acara."
          maxLength={400}
          counter
          value={landing.program_intro ?? ""}
          onChange={(event) => setLanding({ ...landing, program_intro: event.target.value })}
        />
      </Kelompok>
      <Kelompok title="Banner halaman Program">
        <TextField
          label="Kalimat banner"
          optional
          placeholder={forum.language === "en" ? "General information about the event, agenda, and program." : "Informasi umum tentang acara, susunan acara, dan program."}
          maxLength={160}
          counter
          value={forum.program_subtitle ?? ""}
          onChange={(event) => ubah({ program_subtitle: event.target.value })}
        />
        {gambar("Gambar banner", "Rasio 3:2, minimal 1000×700. Kosong = gambar KV.", forum.program_banner_url, (url) => ubah({ program_banner_url: url }))}
      </Kelompok>
    </div>
  );

  // ---- 6. Sorotan ----------------------------------------------------------------
  const setSorotan = (next: typeof sorotan) => ubah({ highlights: next });
  const isiSorotan = (
    <div className="flex flex-col gap-3">
      <p className="text-body-medium text-on-surface-variant">
        Baris teks dan foto bergantian di Beranda, untuk hal yang ingin ditonjolkan. Maksimal 4.
      </p>
      {sorotan.map((item, index) => (
        <Kartu
          key={index}
          judul={`Sorotan ${index + 1}`}
          kendali={<KendaliButir nama={`sorotan ${index + 1}`} index={index} jumlah={sorotan.length} onPindah={(delta) => setSorotan(tukar(sorotan, index, delta))} onHapus={() => setSorotan(sorotan.filter((_, position) => position !== index))} />}
        >
          <TextField label="Judul" maxLength={60} counter value={item.title} onChange={(event) => setSorotan(ganti(sorotan, index, { title: event.target.value }))} />
          <TextArea label="Isi" optional rows={4} maxLength={1500} counter value={item.body ?? ""} onChange={(event) => setSorotan(ganti(sorotan, index, { body: event.target.value }))} />
          {gambar(`Foto sorotan ${index + 1}`, "Hampir persegi (760×800). Posisinya bergantian kanan dan kiri.", item.image_url, (url) => setSorotan(ganti(sorotan, index, { image_url: url })))}
          <SelectField
            label="Tautan"
            value={item.link ?? ""}
            onChange={(event) => setSorotan(ganti(sorotan, index, { link: (event.target.value || undefined) as LandingForumLink | undefined }))}
          >
            <option value="">Tanpa tautan</option>
            <option value="program">Halaman Program acara</option>
            <option value="info">Halaman Informasi praktis</option>
            <option value="daftar">Formulir pendaftaran</option>
            <option value="url">Alamat lain</option>
          </SelectField>
          {item.link === "url" ? (
            <TextField label="Alamat tautan" type="url" placeholder="https://" value={item.link_url ?? ""} onChange={(event) => setSorotan(ganti(sorotan, index, { link_url: event.target.value }))} />
          ) : null}
          {item.link ? (
            <TextField
              label="Teks tautan"
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
          Tambah sorotan
        </Button>
      </div>
    </div>
  );

  // ---- 7. Informasi praktis --------------------------------------------------------
  const setInfo = (next: typeof info) => ubah({ info: next });
  const isiInfo = (
    <div className="flex flex-col gap-5">
      <Kelompok first note="Beranda menampilkan ubin bergambar per kelompok; halaman Informasi praktis menampilkan isinya. Menu Informasi praktis muncul bila ada kelompok.">
        <TextField
          label="Judul"
          optional
          placeholder={forum.language === "en" ? "Practical Information" : "Informasi praktis"}
          maxLength={60}
          counter
          value={forum.info_title ?? ""}
          onChange={(event) => ubah({ info_title: event.target.value })}
        />
        <TextArea label="Pengantar" optional rows={2} maxLength={400} counter value={forum.info_intro ?? ""} onChange={(event) => ubah({ info_intro: event.target.value })} />
      </Kelompok>
      <Kelompok title="Kelompok informasi" note="Mis. Visa, Penerbangan, Kesehatan. Maksimal 9.">
        {info.map((kelompok, index) => {
          const butir = kelompok.items;
          const setButir = (next: typeof butir) => setInfo(ganti(info, index, { items: next }));
          return (
            <Kartu
              key={kelompok.id}
              judul={kelompok.title.trim() || `Kelompok ${index + 1}`}
              kendali={<KendaliButir nama={`kelompok ${index + 1}`} index={index} jumlah={info.length} onPindah={(delta) => setInfo(tukar(info, index, delta))} onHapus={() => setInfo(info.filter((_, position) => position !== index))} />}
            >
              <TextField label="Judul kelompok" maxLength={40} counter value={kelompok.title} onChange={(event) => setInfo(ganti(info, index, { title: event.target.value }))} />
              <SelectField label="Ikon ubin" value={kelompok.icon ?? "info"} onChange={(event) => setInfo(ganti(info, index, { icon: event.target.value as LandingForumIcon }))}>
                {(Object.keys(LANDING_FORUM_ICONS) as LandingForumIcon[]).map((key) => (
                  <option key={key} value={key}>{LANDING_FORUM_ICONS[key]}</option>
                ))}
              </SelectField>
              {gambar(`Foto ubin ${index + 1}`, "Rasio 3:2. Diberi bayangan gelap supaya ikon dan judul putih terbaca. Kosong = warna merek.", kelompok.image_url, (url) => setInfo(ganti(info, index, { image_url: url })))}
              <div className="flex flex-col gap-3 border-t border-outline-variant pt-3">
                {butir.map((item, nomor) => (
                  <div key={nomor} className="flex flex-col gap-2">
                    <div className="flex items-end gap-2">
                      <TextField
                        className="min-w-0 flex-1"
                        label={`Subjudul ${nomor + 1}`}
                        optional
                        maxLength={120}
                        value={item.heading ?? ""}
                        onChange={(event) => setButir(ganti(butir, nomor, { heading: event.target.value }))}
                      />
                      <KendaliButir nama={`butir ${nomor + 1}`} index={nomor} jumlah={butir.length} onPindah={(delta) => setButir(tukar(butir, nomor, delta))} onHapus={() => setButir(butir.filter((_, position) => position !== nomor))} />
                    </div>
                    <TextArea
                      label={`Isi ${nomor + 1}`}
                      rows={4}
                      hint="Pisahkan paragraf dengan baris kosong; baris yang diawali tanda minus jadi butir."
                      maxLength={2000}
                      counter
                      value={item.body}
                      onChange={(event) => setButir(ganti(butir, nomor, { body: event.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <Button variant="text" size="sm" icon={<Plus size={16} />} disabled={butir.length >= 20} onClick={() => setButir([...butir, { body: "" }])}>
                    Tambah isi
                  </Button>
                </div>
              </div>
            </Kartu>
          );
        })}
        <div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={info.length >= 9} onClick={() => setInfo([...info, { id: idInfoBaru(), title: "", icon: "info", items: [{ body: "" }] }])}>
            Tambah kelompok
          </Button>
        </div>
      </Kelompok>
    </div>
  );

  // ---- 8. Lokasi ---------------------------------------------------------------
  const isiLokasi = (
    <div className="flex flex-col gap-4">
      <TextField label="Nama tempat" optional placeholder="mis. Grand Ballroom, Hotel Mulia" hint="Juga dipakai berkas kalender dan email." value={facts.venue_name ?? ""} onChange={(event) => patchFacts({ venue_name: event.target.value })} />
      <TextArea label="Alamat" optional rows={3} value={facts.venue_address ?? ""} onChange={(event) => patchFacts({ venue_address: event.target.value })} />
      <TextField label="Tautan peta" optional type="url" placeholder="https://maps.app.goo.gl/..." value={facts.venue_map_url ?? ""} onChange={(event) => patchFacts({ venue_map_url: event.target.value })} />
      <TextArea
        label="Keterangan tempat"
        optional
        rows={5}
        hint="Paragraf tentang tempat acara, di atas nama dan alamat."
        maxLength={1200}
        counter
        value={forum.venue_note ?? ""}
        onChange={(event) => ubah({ venue_note: event.target.value })}
      />
      {gambar("Foto tempat", "Rasio 4:3, minimal 1200×900.", forum.venue_image_url, (url) => ubah({ venue_image_url: url }))}
    </div>
  );

  // ---- 9. Galeri ------------------------------------------------------------------
  const isiGaleri = (
    <div className="flex flex-col gap-3">
      <p className="text-body-medium text-on-surface-variant">Foto tempat acara, tiga per baris. Rasio 5:3, maksimal 6.</p>
      {galeri.map((src, index) => (
        <div key={`${src}-${index}`} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {gambar(`Foto galeri ${index + 1}`, "", src, (url) => ubah({ gallery: url ? galeri.map((item, position) => (position === index ? url : item)) : galeri.filter((_, position) => position !== index) }))}
          </div>
          <KendaliButir nama={`foto ${index + 1}`} index={index} jumlah={galeri.length} onPindah={(delta) => ubah({ gallery: tukar(galeri, index, delta) })} onHapus={() => ubah({ gallery: galeri.filter((_, position) => position !== index) })} />
        </div>
      ))}
      {galeri.length < 6
        ? gambar("Tambah foto", "PNG, JPG, atau WebP, maks 5 MB.", null, (url) => { if (url) ubah({ gallery: [...galeri, url] }); })
        : null}
    </div>
  );

  // ---- 10. Dress code ---------------------------------------------------------------
  const setDresscode = (next: typeof dresscode) => ubah({ dresscode: next });
  const isiDresscode = (
    <div className="flex flex-col gap-3">
      <TextArea label="Pengantar" optional rows={2} maxLength={400} counter value={forum.dresscode_intro ?? ""} onChange={(event) => ubah({ dresscode_intro: event.target.value })} />
      {dresscode.map((item, index) => (
        <Kartu
          key={index}
          judul={item.title.trim() || `Kartu ${index + 1}`}
          kendali={<KendaliButir nama={`kartu ${index + 1}`} index={index} jumlah={dresscode.length} onPindah={(delta) => setDresscode(tukar(dresscode, index, delta))} onHapus={() => setDresscode(dresscode.filter((_, position) => position !== index))} />}
        >
          <TextField label="Judul" placeholder="mis. Sesi siang" maxLength={40} counter value={item.title} onChange={(event) => setDresscode(ganti(dresscode, index, { title: event.target.value }))} />
          <TextArea label="Keterangan" optional rows={3} maxLength={400} counter value={item.body ?? ""} onChange={(event) => setDresscode(ganti(dresscode, index, { body: event.target.value }))} />
          {gambar(`Foto kartu ${index + 1}`, "Rasio 9:8, minimal 960×850.", item.image_url, (url) => setDresscode(ganti(dresscode, index, { image_url: url })))}
        </Kartu>
      ))}
      <div>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={dresscode.length >= 6} onClick={() => setDresscode([...dresscode, { title: "" }])}>
          Tambah kartu
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
        {gambar("Logo kaki halaman", "Versi putih atau terang, karena latarnya warna merek. Kosong = nama acara.", forum.footer_logo_url, (url) => ubah({ footer_logo_url: url }), "h-14 w-36 bg-neutral-800")}
        <TextArea
          label="Kalimat penyelenggara"
          optional
          rows={2}
          placeholder="Diselenggarakan oleh ..."
          maxLength={180}
          counter
          value={landing.footer_note ?? ""}
          onChange={(event) => setLanding({ ...landing, footer_note: event.target.value })}
        />
      </Kelompok>
      <Kelompok title="Media sosial" note="Ikon hanya tampil untuk kolom yang diisi.">
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
      <Kelompok title="Tautan di bawah garis" note="Mis. Kebijakan privasi, Kontak panitia. Maksimal 8.">
        {tautanKaki.map((item, index) => (
          <div key={index} className="flex items-end gap-2">
            <TextField className="w-32 shrink-0" label="Teks" maxLength={40} value={item.label} onChange={(event) => setTautanKaki(ganti(tautanKaki, index, { label: event.target.value }))} />
            <TextField className="min-w-0 flex-1" label="Alamat" type="url" placeholder="https://" value={item.url} onChange={(event) => setTautanKaki(ganti(tautanKaki, index, { url: event.target.value }))} />
            <IconButton size="sm" label={`Hapus tautan ${index + 1}`} className="mb-2 text-error" onClick={() => setTautanKaki(tautanKaki.filter((_, position) => position !== index))}>
              <Trash size={16} />
            </IconButton>
          </div>
        ))}
        <div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={tautanKaki.length >= 8} onClick={() => setTautanKaki([...tautanKaki, { label: "", url: "" }])}>
            Tambah tautan
          </Button>
        </div>
      </Kelompok>
    </div>
  );

  const venueAda = Boolean(facts.venue_name?.trim() || facts.venue_address?.trim() || forum.venue_note?.trim());
  const programAda = rundownKosong === false || Boolean(landing.program_intro?.trim());
  const baris1 = [
    { id: "pembuka", judul: "Pembuka", sub: "Beranda · logo, KV, nama acara, tombol daftar", isi: isiPembuka },
    { id: "tanggal", part: "tanggal", judul: "Pita tempat dan tanggal", sub: "Beranda, Informasi praktis", isi: isiTanggal, berisi: true },
    { id: "about", part: "about", judul: "Tentang acara", sub: "Beranda (ringkas), Program (lengkap)", isi: isiTentang, berisi: Boolean(facts.description?.trim()) },
    {
      id: "program",
      part: "program",
      judul: "Program dan susunan acara",
      sub: "Beranda, Program · dari Rundown acara",
      isi: isiProgram,
      berisi: programAda,
      lencana: !hidden.has("program") && rundownKosong && !landing.program_intro?.trim() ? "Rundown kosong" : undefined,
    },
    { id: "speakers", part: "speakers", judul: "Pembicara", sub: `Beranda, Program · ${speakers.length} pembicara`, isi: isiPembicara, berisi: speakers.length > 0 },
    { id: "sorotan", part: "sorotan", judul: "Sorotan", sub: `Beranda · ${sorotan.length} baris`, isi: isiSorotan, berisi: sorotan.some((item) => item.title.trim()) },
    { id: "info", part: "info", judul: "Informasi praktis", sub: `Beranda (ubin), halaman sendiri · ${info.length} kelompok`, isi: isiInfo, berisi: info.some((item) => item.title.trim()) },
    { id: "venue", part: "venue", judul: "Lokasi", sub: "Program · tempat, alamat, peta", isi: isiLokasi, berisi: venueAda },
    { id: "galeri", part: "galeri", judul: "Galeri tempat", sub: `Program · ${galeri.length} foto`, isi: isiGaleri, berisi: galeri.length > 0 },
    { id: "dresscode", part: "dresscode", judul: "Dress code", sub: `Program · ${dresscode.length} kartu`, isi: isiDresscode, berisi: dresscode.some((item) => item.title.trim()) },
    { id: "kaki", judul: "Kaki halaman", sub: "Semua halaman · logo, media sosial, tautan", isi: isiKaki },
  ] as { id: string; part?: LandingForumPart; judul: string; sub: string; isi: ReactNode; berisi?: boolean; lencana?: string }[];

  return (
    <ol className="flex flex-col gap-2">
      {baris1.map((item, index) =>
        baris({
          id: item.id,
          nomor: index + 1,
          judul: item.judul,
          sub: item.sub,
          isi: item.isi,
          lencana: item.part ? (item.lencana ?? kosong(item.part, item.berisi ?? true)) : null,
          saklar: item.part ? saklar(item.part) : undefined,
          redup: item.part ? hidden.has(item.part) : false,
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
    if (item.link === "url" && salah(item.link_url)) return { baris: "sorotan", pesan: `Sorotan ${index + 1}: alamat tautan harus diawali https://.` };
  }
  for (const [key, value] of Object.entries(forum.socials ?? {})) {
    if (salah(value)) return { baris: "kaki", pesan: `Media sosial ${key}: tulis alamat lengkap yang diawali https://, atau kosongkan.` };
  }
  for (const [index, item] of (forum.footer_links ?? []).entries()) {
    if (salah(item.url) || (item.label.trim() && !item.url.trim())) return { baris: "kaki", pesan: `Tautan kaki halaman ${index + 1}: tulis alamat lengkap yang diawali https://.` };
  }
  return null;
}
