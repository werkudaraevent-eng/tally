"use client";

import { ArrowDown, ArrowSquareOut, ArrowUp, CaretDown, Info, Plus, Trash, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "@/components/event-link";
import {
  Banner, Button, ButtonLink, IconButton, MetaSeparator, PageLoading, PaneBody, PaneFooter, Pane, SegmentedButton,
  StatusChip, SupportingPane, Switch, TextArea, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { LandingPreview } from "@/components/admin/landing-preview";
import {
  DEFAULT_LANDING_SECTIONS,
  LANDING_BANNER_STYLE_LABELS,
  LANDING_HERO_HEIGHT_LABELS,
  LANDING_SECTION_LABELS,
  LANDING_SECTION_SOURCES,
  type EventLandingConfig,
  type LandingSection,
  type LandingSectionId,
  type RegistrationFormConfig,
} from "@/lib/domain";
import { DEFAULT_REGISTRATION_SEED } from "@/lib/registration-theme";
import { eventApiPath } from "@/lib/event-url";
import { Kelompok } from "@/components/admin/compact-form";

// Supporting pane: halaman publik yang sungguhan di panel utama, setelannya di
// panel kanan. Pratinjau hanya menampilkan versi tersimpan (lihat LandingPreview),
// jadi kaki panel menyebut kapan ada perubahan yang belum terlihat di sana.

type Facts = {
  slug: string;
  name: string;
  description: string | null;
  event_date: string | null;
  tagline: string | null;
  start_time: string | null;
  end_time: string | null;
  end_date: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_map_url: string | null;
};

type Bagian = "isi" | "tampilan" | "bagian";

/** "09:00:00" → "09:00". Kolom <input type="time"> menolak bentuk berdetik. */
const jamInput = (value: string | null) => (value ? value.slice(0, 5) : "");

function PilihWarna({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent"
        aria-label={label}
      />
      <span className="min-w-0">
        <span className="block text-body-medium font-medium text-on-surface">{label}</span>
        <span className="block text-body-medium text-on-surface-variant">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}

export default function LandingCmsPage() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [landing, setLanding] = useState<EventLandingConfig>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bagian, setBagian] = useState<Bagian>("isi");
  // Dinaikkan setiap kali penyimpanan BERHASIL. Pratinjau memuat halaman publik
  // yang sungguhan, jadi ia hanya boleh disegarkan ketika ada yang benar-benar
  // berubah di sana. Menyegarkannya di setiap ketikan berarti memuat ulang satu
  // halaman penuh berkali-kali per detik.
  const [previewKey, setPreviewKey] = useState(0);
  // Warna formulir disimpan di kolom lain (`registration_form_config.theme`),
  // jadi ia punya keadaan sendiri di layar ini alih-alih ikut `landing`.
  const [formInherit, setFormInherit] = useState(true);
  const [formSeed, setFormSeed] = useState(DEFAULT_REGISTRATION_SEED);
  // Potret keadaan terakhir yang tersimpan, untuk memberi tahu bahwa pratinjau
  // belum memuat perubahan yang sedang diketik.
  const [tersimpan, setTersimpan] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/events"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setError("Data acara gagal dimuat."); return; }
    const body = await response.json().catch(() => null);
    // /api/events mengembalikan daftar; slug dari URL yang menentukan mana.
    const slug = window.location.pathname.match(/^\/e\/([^/]+)/)?.[1];
    const list = (body?.events ?? []) as (Facts & {
      landing_config?: EventLandingConfig;
      registration_form_config?: RegistrationFormConfig;
    })[];
    const found = slug ? list.find((item) => item.slug === slug) : list[0];
    if (!found) { setError("Acara tidak ditemukan."); return; }
    const nextLanding = found.landing_config ?? {};
    // `inherit` yang belum pernah disimpan berarti konfigurasi dibuat sebelum
    // saklar ini ada. Acara yang sudah punya warna formulir sendiri dianggap
    // memang memilihnya: ia tidak boleh berganti warna karena sebuah pembaruan.
    const formTheme = found.registration_form_config?.theme;
    const nextInherit = formTheme?.inherit ?? !formTheme?.seed;
    const nextSeed = formTheme?.seed ?? found.landing_config?.theme?.seed ?? DEFAULT_REGISTRATION_SEED;
    setFacts(found);
    setLanding(nextLanding);
    setFormInherit(nextInherit);
    setFormSeed(nextSeed);
    setTersimpan(JSON.stringify({ facts: found, landing: nextLanding, formInherit: nextInherit, formSeed: nextSeed }));
    setError("");
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const sections: LandingSection[] = landing.sections?.length ? landing.sections : DEFAULT_LANDING_SECTIONS;
  const cuplikan = facts ? JSON.stringify({ facts, landing, formInherit, formSeed }) : null;
  const berubah = tersimpan !== null && cuplikan !== tersimpan;

  function patchFacts(patch: Partial<Facts>) {
    setFacts((current) => (current ? { ...current, ...patch } : current));
  }

  /**
   * Apakah bagian ini punya isi.
   *
   * Aturannya HARUS sama dengan yang dipakai halaman publik: di sana bagian
   * tanpa isi tidak dirender sama sekali. Tanpa penanda ini, saklar menjadi
   * tombol yang berbohong: admin menyalakannya, halaman publik tidak berubah,
   * dan tidak ada apa pun yang menjelaskan kenapa.
   *
   * `agenda` tidak bisa dijawab dari sini: isinya ada di tabel rundown, dan
   * memuatnya hanya untuk lencana berarti satu kueri tambahan setiap kali
   * halaman ini dibuka. Ia dibiarkan `null`: "tidak diketahui", bukan "kosong".
   */
  function sectionHasContent(id: LandingSectionId): boolean | null {
    switch (id) {
      case "about": return Boolean(facts?.description?.trim());
      case "highlights": return (landing.highlights ?? []).length > 0;
      case "venue": return Boolean(facts?.venue_name?.trim() || facts?.venue_address?.trim());
      case "faq": return (landing.faq ?? []).length > 0;
      case "sponsors": return (landing.sponsors ?? []).length > 0;
      case "contact": return Boolean(landing.contact_name || landing.contact_phone || landing.contact_email);
      default: return null;
    }
  }

  function moveSection(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setLanding({ ...landing, sections: next });
  }

  async function save() {
    if (!facts) return;
    const kirim = cuplikan;
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/landing"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: facts.description?.trim() || null,
        tagline: facts.tagline?.trim() || null,
        start_time: facts.start_time || null,
        end_time: facts.end_time || null,
        end_date: facts.end_date || null,
        venue_name: facts.venue_name?.trim() || null,
        venue_address: facts.venue_address?.trim() || null,
        venue_map_url: facts.venue_map_url?.trim() || null,
        landing: {
          ...landing,
          sections,
          theme: { seed: landing.theme?.seed ?? DEFAULT_REGISTRATION_SEED },
        },
        form_theme: { inherit: formInherit, seed: formSeed },
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat keadaan sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rincian = body.error?.details as Record<string, string | string[]> | undefined;
      const pesan = rincian ? String(Object.values(rincian)[0]) : undefined;
      toast.error("Gagal disimpan", pesan ?? "Coba lagi.");
      return;
    }
    setTersimpan(kirim);
    setPreviewKey((current) => current + 1);
    toast.success("Tersimpan", "Halaman acara publik langsung memakai isi baru.");
  }

  // ---- Isi: fakta acara --------------------------------------------------------
  const isiFakta = facts ? (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Waktu dan tempat juga dipakai berkas kalender dan email, bukan hanya halaman ini.
      </p>
      <TextField
        label="Tagline"
        optional
        hint="Satu kalimat di bawah nama acara."
        value={facts.tagline ?? ""}
        onChange={(event) => patchFacts({ tagline: event.target.value })}
      />
      <TextArea
        label="Deskripsi acara"
        optional
        rows={5}
        hint="Mengisi bagian Tentang acara. Pisahkan paragraf dengan enter; jedanya ikut tampil."
        value={facts.description ?? ""}
        onChange={(event) => patchFacts({ description: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Jam mulai"
          optional
          type="time"
          value={jamInput(facts.start_time)}
          onChange={(event) => patchFacts({ start_time: event.target.value || null })}
        />
        <TextField
          label="Jam selesai"
          optional
          type="time"
          value={jamInput(facts.end_time)}
          onChange={(event) => patchFacts({ end_time: event.target.value || null })}
        />
      </div>
      <TextField
        label="Tanggal selesai"
        optional
        type="date"
        hint={`Isi hanya bila acara lebih dari satu hari. Tanggal mulai (${facts.event_date ?? "belum diisi"}) diatur di Pengaturan.`}
        value={facts.end_date ?? ""}
        onChange={(event) => patchFacts({ end_date: event.target.value || null })}
      />
      <TextField
        label="Nama tempat"
        optional
        placeholder="mis. Grand Ballroom, Hotel Mulia"
        value={facts.venue_name ?? ""}
        onChange={(event) => patchFacts({ venue_name: event.target.value })}
      />
      <TextArea
        label="Alamat"
        optional
        rows={3}
        value={facts.venue_address ?? ""}
        onChange={(event) => patchFacts({ venue_address: event.target.value })}
      />
      <TextField
        label="Tautan peta"
        optional
        type="url"
        hint="Google Maps atau sejenisnya. Dibuka sebagai tautan, tidak disematkan, supaya halaman tamu tidak memuat skrip pihak ketiga."
        placeholder="https://maps.app.goo.gl/..."
        value={facts.venue_map_url ?? ""}
        onChange={(event) => patchFacts({ venue_map_url: event.target.value })}
      />
    </div>
  ) : null;

  // ---- Tampilan ------------------------------------------------------------------
  const gayaBanner = landing.banner_style ?? "theme";
  const isiTampilan = (
    <div className="flex flex-col gap-5">
      <Kelompok title="Hero" first>
        <ImageUploadField
          label="Gambar banner"
          kind="landing"
          fit="cover"
          previewClassName="h-20 w-36"
          hint="Rasio 16:9, minimal 1920×1080. Dipasang di belakang judul acara. PNG, JPG, atau WebP, maks 5 MB."
          value={landing.banner_url ?? null}
          onChange={(url) => setLanding({ ...landing, banner_url: url })}
          disabled={busy}
        />
        {/* Pilihan ini hanya muncul saat bannernya ada. Tanpa gambar, kedua
            opsi menghasilkan halaman yang sama persis, dan kontrol yang tidak
            mengubah apa pun membuat admin ragu apakah dirinya salah pakai. */}
        {landing.banner_url ? (
          <div>
            <p className="text-body-medium font-medium text-on-surface">Tampilan banner</p>
            <SegmentedButton
              className="mt-1.5 w-full"
              label="Tampilan banner"
              value={gayaBanner}
              onChange={(value) => setLanding({ ...landing, banner_style: value })}
              options={[
                { value: "theme", label: LANDING_BANNER_STYLE_LABELS.theme },
                { value: "photo", label: LANDING_BANNER_STYLE_LABELS.photo },
              ]}
            />
            <p className="mt-1.5 text-body-medium text-on-surface-variant">
              {gayaBanner === "theme"
                ? "Warna banner dilebur ke warna halaman. Senada, tapi gambar berwarna pekat jadi pucat."
                : "Warna gambar tampil apa adanya. Sudut tempat judul diberi bayangan gelap dan teks hero jadi putih agar tetap terbaca."}
            </p>
          </div>
        ) : null}
        <div>
          <p className="text-body-medium font-medium text-on-surface">Tinggi hero</p>
          <SegmentedButton
            className="mt-1.5 w-full"
            label="Tinggi hero"
            value={landing.hero_height ?? "standard"}
            onChange={(value) => setLanding({ ...landing, hero_height: value })}
            options={[
              { value: "compact", label: LANDING_HERO_HEIGHT_LABELS.compact },
              { value: "standard", label: LANDING_HERO_HEIGHT_LABELS.standard },
              { value: "tall", label: LANDING_HERO_HEIGHT_LABELS.tall },
            ]}
          />
          <p className="mt-1.5 text-body-medium text-on-surface-variant">
            Tinggi minimum bidang judul di layar lebar: ringkas 400px, standar 540px, tinggi 680px. Di ponsel ketiganya lebih pendek. Makin tinggi, makin jauh isi halaman terdorong ke bawah.
          </p>
        </div>
        <TextField
          label="Teks tombol daftar"
          optional
          placeholder="Daftar sekarang"
          value={landing.cta_label ?? ""}
          onChange={(event) => setLanding({ ...landing, cta_label: event.target.value })}
        />
      </Kelompok>

      <Kelompok title="Warna" note="Satu warna; sisanya diturunkan otomatis supaya teks tetap terbaca.">
        <PilihWarna
          label="Warna merek"
          value={landing.theme?.seed ?? DEFAULT_REGISTRATION_SEED}
          onChange={(value) => setLanding({ ...landing, theme: { seed: value } })}
        />
        {/* Saklar warna formulir tinggal DI SINI, bukan di CMS Registrasi.
            Warna acara punya satu sumber; kontrol yang tersebar di dua layar
            akan berbeda isinya dan tidak ada yang tahu mana yang menang. */}
        <Switch
          checked={!formInherit}
          onChange={(value) => setFormInherit(!value)}
          label="Formulir pendaftaran pakai warna berbeda"
          description={formInherit
            ? "Halaman pendaftaran memakai warna merek di atas, jadi tamu tidak berpindah identitas visual."
            : "Halaman pendaftaran memakai warnanya sendiri. Dua warna dalam dua ketukan berurutan terbaca seperti pindah ke situs lain."}
        />
        {!formInherit ? <PilihWarna label="Warna formulir" value={formSeed} onChange={setFormSeed} /> : null}
      </Kelompok>
    </div>
  );

  // ---- Bagian --------------------------------------------------------------------
  function editorBagian(id: LandingSectionId): ReactNode {
    switch (id) {
      case "highlights": {
        const list = landing.highlights ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, highlights: next });
        return (
          <div className="flex flex-col gap-3">
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada angka.</p> : null}
            {list.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <TextField
                  className="min-w-0 flex-1"
                  label="Keterangan"
                  placeholder="mis. Peserta"
                  value={item.label}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], label: event.target.value }; setList(next); }}
                />
                <TextField
                  className="w-24"
                  label="Angka"
                  value={item.value}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], value: event.target.value }; setList(next); }}
                />
                <IconButton size="sm" label={`Hapus angka ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                  <Trash size={16} />
                </IconButton>
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { label: "", value: "" }])}>Tambah angka</Button>
            </div>
          </div>
        );
      }
      case "faq": {
        const list = landing.faq ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, faq: next });
        return (
          <div className="flex flex-col gap-3">
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada pertanyaan.</p> : null}
            {list.map((item, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
                <div className="flex items-end gap-2">
                  <TextField
                    className="min-w-0 flex-1"
                    label="Pertanyaan"
                    value={item.q}
                    onChange={(event) => { const next = [...list]; next[index] = { ...next[index], q: event.target.value }; setList(next); }}
                  />
                  <IconButton size="sm" label={`Hapus pertanyaan ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                    <Trash size={16} />
                  </IconButton>
                </div>
                <TextArea
                  label="Jawaban"
                  rows={3}
                  value={item.a}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], a: event.target.value }; setList(next); }}
                />
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { q: "", a: "" }])}>Tambah pertanyaan</Button>
            </div>
          </div>
        );
      }
      case "sponsors": {
        const list = landing.sponsors ?? [];
        return (
          <div className="flex flex-col gap-3">
            <p className="text-body-medium text-on-surface-variant">Ditampilkan sebagai kisi berukuran sama, apa pun urutan unggahnya.</p>
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada sponsor.</p> : null}
            {list.map((sponsor, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
                <ImageUploadField
                  label={`Logo ${index + 1}`}
                  kind="landing"
                  fit="contain"
                  previewClassName="h-14 w-24"
                  value={sponsor.logo_url || null}
                  disabled={busy}
                  onChange={(url) => {
                    const next = [...list];
                    if (!url) {
                      setLanding({ ...landing, sponsors: next.filter((_, position) => position !== index) });
                      return;
                    }
                    next[index] = { ...next[index], logo_url: url };
                    setLanding({ ...landing, sponsors: next });
                  }}
                />
                <TextField
                  label="Nama"
                  optional
                  hint="Teks alternatif gambar, tidak ditampilkan."
                  value={sponsor.name ?? ""}
                  onChange={(event) => {
                    const next = [...list];
                    next[index] = { ...next[index], name: event.target.value };
                    setLanding({ ...landing, sponsors: next });
                  }}
                />
              </div>
            ))}
            {/* Baris baru ditambahkan tanpa logo, lalu logonya diunggah di baris
                itu. Membuka pemilih berkas lebih dulu berarti baris kosong akan
                tertinggal setiap kali admin membatalkan pemilihan. */}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setLanding({ ...landing, sponsors: [...list, { logo_url: "" }] })}>Tambah sponsor</Button>
            </div>
          </div>
        );
      }
      case "contact":
        return (
          <div className="flex flex-col gap-3">
            <TextField label="Nama" optional value={landing.contact_name ?? ""} onChange={(event) => setLanding({ ...landing, contact_name: event.target.value })} />
            <TextField label="Telepon" optional value={landing.contact_phone ?? ""} onChange={(event) => setLanding({ ...landing, contact_phone: event.target.value })} />
            <TextField label="Email" optional type="email" value={landing.contact_email ?? ""} onChange={(event) => setLanding({ ...landing, contact_email: event.target.value })} />
          </div>
        );
      default:
        return null;
    }
  }

  const JUMLAH: Partial<Record<LandingSectionId, number>> = {
    highlights: (landing.highlights ?? []).length,
    faq: (landing.faq ?? []).length,
    sponsors: (landing.sponsors ?? []).length,
  };

  const isiBagian = facts ? (
    <div className="flex flex-col gap-3">
      <p className="text-body-medium text-on-surface-variant">
        Urutan di sini adalah urutan di halaman publik. Bagian yang menyala tapi belum ada isinya tetap tidak muncul.
      </p>
      <ol className="flex flex-col">
        {sections.map((section, index) => {
          const berisi = sectionHasContent(section.id);
          const sumber = LANDING_SECTION_SOURCES[section.id];
          const editor = editorBagian(section.id);
          const dariIsi = section.id === "about" || section.id === "venue";
          const keterangan = section.id === "about"
            ? "Dari deskripsi acara di tab Isi."
            : section.id === "venue"
              ? "Nama, alamat, dan peta dari tab Isi. Tombol denah menuju Denah kursi."
              : section.id === "agenda"
                ? "Ditarik otomatis dari Rundown acara."
                : null;
          return (
            <li key={section.id} className="flex flex-col gap-2 border-t border-outline-variant py-3">
              <div className="flex items-start gap-1">
                <Switch
                  className="min-w-0 flex-1"
                  checked={section.enabled}
                  onChange={(value) => {
                    const next = sections.map((item, position) => (position === index ? { ...item, enabled: value } : item));
                    setLanding({ ...landing, sections: next });
                  }}
                  label={LANDING_SECTION_LABELS[section.id]}
                  description={keterangan ?? undefined}
                />
                <IconButton size="sm" label={`Naikkan ${LANDING_SECTION_LABELS[section.id]}`} onClick={() => moveSection(index, -1)} disabled={index === 0}>
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton size="sm" label={`Turunkan ${LANDING_SECTION_LABELS[section.id]}`} onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1}>
                  <ArrowDown size={16} />
                </IconButton>
              </div>

              {/* Lencana hanya muncul saat saklarnya menyala TAPI isinya kosong,
                  satu-satunya keadaan yang membingungkan. */}
              {(section.enabled && berisi === false) || dariIsi || sumber.href ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {section.enabled && berisi === false ? <StatusChip tone="warning">Belum ada isinya</StatusChip> : null}
                  {dariIsi ? (
                    <button type="button" onClick={() => setBagian("isi")} className="rounded-sm text-body-medium font-medium text-primary hover:underline">
                      Sunting di Isi
                    </button>
                  ) : null}
                  {sumber.href ? (
                    <Link href={`/e/${facts.slug}${sumber.href}`} className="inline-flex items-center gap-1 rounded-sm text-body-medium font-medium text-primary hover:underline">
                      {sumber.linkLabel}
                      <ArrowSquareOut size={14} aria-hidden />
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {editor ? (
                <details className="group rounded-md border border-outline-variant">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-body-medium font-medium text-on-surface hover:bg-primary-soft [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      Sunting isi
                      {JUMLAH[section.id] != null ? <span className="ml-1.5 font-normal tabular-nums text-on-surface-variant">{JUMLAH[section.id]}</span> : null}
                    </span>
                    <CaretDown size={16} aria-hidden className="shrink-0 text-on-surface-variant transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-outline-variant p-3">{editor}</div>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  ) : null;

  const panel = (
    <Pane as="aside" aria-label="Setelan halaman acara">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<Bagian>
          label="Bagian setelan"
          value={bagian}
          onChange={setBagian}
          className="w-full"
          options={[{ value: "isi", label: "Isi" }, { value: "tampilan", label: "Tampilan" }, { value: "bagian", label: "Bagian" }]}
        />
      </div>
      <PaneBody className="px-4 py-4">{bagian === "isi" ? isiFakta : bagian === "tampilan" ? isiTampilan : isiBagian}</PaneBody>
      <PaneFooter note={berubah ? "Ada perubahan yang belum disimpan" : "Semua perubahan tersimpan"}>
        <Button size="sm" onClick={() => void save()} loading={busy}>Simpan</Button>
      </PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={facts ? (
          <>
            <span>/e/{facts.slug}</span>
            <MetaSeparator />
            <span>Alamat yang dicetak di undangan dan QR</span>
          </>
        ) : null}
        actions={facts ? (
          <ButtonLink href={`/e/${facts.slug}`} target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>
            Lihat halaman
          </ButtonLink>
        ) : null}
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {facts ? (
        <SupportingPane main={<LandingPreview slug={facts.slug} reloadKey={previewKey} />} pane={panel} paneWidth={420} />
      ) : error ? null : <PageLoading />}
    </WorkspacePage>
  );
}
