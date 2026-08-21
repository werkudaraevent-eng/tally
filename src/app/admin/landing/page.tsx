"use client";

import { ArrowDown, ArrowSquareOut, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, IconButton, SegmentedButton, StatusChip, Switch, TextArea, TextField } from "@/components/m3";
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

/** "09:00:00" → "09:00". Kolom <input type="time"> menolak bentuk berdetik. */
const jamInput = (value: string | null) => (value ? value.slice(0, 5) : "");

export default function LandingCmsPage() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [landing, setLanding] = useState<EventLandingConfig>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Dinaikkan setiap kali penyimpanan BERHASIL. Pratinjau memuat halaman publik
  // yang sungguhan, jadi ia hanya boleh disegarkan ketika ada yang benar-benar
  // berubah di sana — menyegarkannya di setiap ketikan berarti memuat ulang satu
  // halaman penuh berkali-kali per detik.
  const [previewKey, setPreviewKey] = useState(0);
  // Warna formulir disimpan di kolom lain (`registration_form_config.theme`),
  // jadi ia punya keadaan sendiri di layar ini alih-alih ikut `landing`.
  const [formInherit, setFormInherit] = useState(true);
  const [formSeed, setFormSeed] = useState(DEFAULT_REGISTRATION_SEED);
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
    setFacts(found);
    setLanding(found.landing_config ?? {});
    // `inherit` yang belum pernah disimpan berarti konfigurasi dibuat sebelum
    // saklar ini ada. Acara yang sudah punya warna formulir sendiri dianggap
    // memang memilihnya — ia tidak boleh berganti warna karena sebuah pembaruan.
    const formTheme = found.registration_form_config?.theme;
    setFormInherit(formTheme?.inherit ?? !formTheme?.seed);
    setFormSeed(formTheme?.seed ?? found.landing_config?.theme?.seed ?? DEFAULT_REGISTRATION_SEED);
    setError("");
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const sections: LandingSection[] = landing.sections?.length ? landing.sections : DEFAULT_LANDING_SECTIONS;

  function patchFacts(patch: Partial<Facts>) {
    setFacts((current) => (current ? { ...current, ...patch } : current));
  }

  /**
   * Apakah bagian ini punya isi.
   *
   * Aturannya HARUS sama dengan yang dipakai halaman publik — di sana bagian
   * tanpa isi tidak dirender sama sekali. Tanpa penanda ini, saklar menjadi
   * tombol yang berbohong: admin menyalakannya, halaman publik tidak berubah,
   * dan tidak ada apa pun yang menjelaskan kenapa.
   *
   * `agenda` tidak bisa dijawab dari sini — isinya ada di tabel rundown, dan
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
    setPreviewKey((current) => current + 1);
    toast.success("Tersimpan", "Halaman acara publik langsung memakai isi baru.");
  }

  if (error) {
    return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8"><p role="alert" className="rounded-lg bg-error-soft p-4 text-body-medium text-on-error-soft">{error}</p></main>;
  }
  if (!facts) {
    return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8"><p className="text-body-medium text-on-surface-variant">Memuat…</p></main>;
  }

  return (
    <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <p className="max-w-2xl text-body-medium leading-6 text-on-surface-variant">
            Halaman publik acara di <code className="select-all">/e/{facts.slug}</code> — alamat yang dicetak di
            undangan dan QR. Susunan acara ditarik otomatis dari Rundown, jadi tidak perlu diketik ulang di sini.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`/e/${facts.slug}`}
              target="_blank"
              rel="noreferrer"
              className="m3-state inline-flex min-h-12 items-center gap-2 rounded-md border border-outline px-4 text-label-large font-semibold text-primary"
            >
              <ArrowSquareOut size={18} /> Lihat halaman
            </a>
            <Button onClick={() => void save()} loading={busy}>Simpan</Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:items-start">
          {/* ---- Pratinjau --------------------------------------------------- */}
          <Card className="lg:col-span-2">
            <LandingPreview slug={facts.slug} reloadKey={previewKey} />
          </Card>

          {/* ---- Fakta acara ------------------------------------------------ */}
          <Card>
            <h2 className="text-title-medium font-semibold">Waktu &amp; tempat</h2>
            <p className="mt-1 text-body-small text-on-surface-variant">
              Dipakai juga oleh berkas kalender dan email — bukan hanya oleh halaman ini.
            </p>

            <TextField
              className="mt-5"
              label="Tagline"
              optional
              hint="Satu kalimat di bawah nama acara. Bukan deskripsi."
              value={facts.tagline ?? ""}
              onChange={(event) => patchFacts({ tagline: event.target.value })}
            />

            {/* Sebelumnya kolom ini HANYA ada di form pembuatan acara, jadi
                bagian "Tentang acara" di halaman publik mustahil diisi setelah
                acaranya dibuat. */}
            <TextArea
              className="mt-4"
              label="Deskripsi acara"
              optional
              rows={6}
              hint="Mengisi bagian “Tentang acara”. Pisahkan paragraf dengan enter — jedanya ikut tampil di halaman publik."
              value={facts.description ?? ""}
              onChange={(event) => patchFacts({ description: event.target.value })}
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              className="mt-4"
              label="Tanggal selesai"
              optional
              type="date"
              hint={`Isi hanya bila acara lebih dari satu hari. Tanggal mulai (${facts.event_date ?? "belum diisi"}) diatur di Settings.`}
              value={facts.end_date ?? ""}
              onChange={(event) => patchFacts({ end_date: event.target.value || null })}
            />

            <TextField
              className="mt-4"
              label="Nama tempat"
              optional
              placeholder="mis. Grand Ballroom, Hotel Mulia"
              value={facts.venue_name ?? ""}
              onChange={(event) => patchFacts({ venue_name: event.target.value })}
            />
            <TextArea
              className="mt-4"
              label="Alamat"
              optional
              rows={3}
              value={facts.venue_address ?? ""}
              onChange={(event) => patchFacts({ venue_address: event.target.value })}
            />
            <TextField
              className="mt-4"
              label="Tautan peta"
              optional
              type="url"
              hint="Google Maps atau sejenisnya. Dibuka sebagai tautan, tidak disematkan — penyemat peta memuat skrip pihak ketiga ke halaman tamu."
              placeholder="https://maps.app.goo.gl/…"
              value={facts.venue_map_url ?? ""}
              onChange={(event) => patchFacts({ venue_map_url: event.target.value })}
            />
          </Card>

          {/* ---- Tampilan --------------------------------------------------- */}
          <Card>
            <h2 className="text-title-medium font-semibold">Tampilan halaman</h2>

            <div className="mt-5">
              <ImageUploadField
                label="Gambar banner"
                kind="landing"
                fit="cover"
                previewClassName="h-24 w-44"
                hint="Rasio 16:9, minimal 1920×1080. Dipasang di belakang judul acara. PNG, JPG, atau WebP maksimal 5 MB."
                value={landing.banner_url ?? null}
                onChange={(url) => setLanding({ ...landing, banner_url: url })}
                disabled={busy}
              />
            </div>

            {/* Pilihan ini hanya muncul saat bannernya ada. Tanpa gambar, kedua
                opsi menghasilkan halaman yang sama persis, dan kontrol yang tidak
                mengubah apa pun adalah kontrol yang membuat admin ragu apakah
                dirinya salah pakai. */}
            {landing.banner_url ? (
              <div className="mt-5">
                <p className="text-label-large font-semibold">Tampilan banner</p>
                <SegmentedButton
                  className="mt-2 w-full"
                  label="Tampilan banner"
                  value={landing.banner_style ?? "theme"}
                  onChange={(value) => setLanding({ ...landing, banner_style: value })}
                  options={[
                    { value: "theme", label: LANDING_BANNER_STYLE_LABELS.theme },
                    { value: "photo", label: LANDING_BANNER_STYLE_LABELS.photo },
                  ]}
                />
                <p className="mt-2 text-body-small leading-5 text-on-surface-variant">
                  {(landing.banner_style ?? "theme") === "theme"
                    ? "Warna banner dilebur ke warna halaman. Senada, tetapi gambar berwarna pekat menjadi pucat."
                    : "Warna gambar tampil apa adanya. Sudut tempat judul berdiri tetap diberi bayangan gelap dan teks hero menjadi putih — tanpa itu, nama acara bisa jatuh di bagian gambar yang terang."}
                </p>
              </div>
            ) : null}

            <div className="mt-5">
              <p className="text-label-large font-semibold">Tinggi hero</p>
              <SegmentedButton
                className="mt-2 w-full"
                label="Tinggi hero"
                value={landing.hero_height ?? "standard"}
                onChange={(value) => setLanding({ ...landing, hero_height: value })}
                options={[
                  { value: "compact", label: LANDING_HERO_HEIGHT_LABELS.compact },
                  { value: "standard", label: LANDING_HERO_HEIGHT_LABELS.standard },
                  { value: "tall", label: LANDING_HERO_HEIGHT_LABELS.tall },
                ]}
              />
              <p className="mt-2 text-body-small leading-5 text-on-surface-variant">
                Tinggi minimum bidang judul di layar lebar: ringkas 400px, standar 540px, tinggi 680px.
                Di ponsel ketiganya lebih pendek dan tetap ikut isi bila teksnya panjang. Makin tinggi,
                makin banyak banner yang terlihat — dan makin jauh isi halaman didorong ke bawah lipatan.
              </p>
            </div>

            <TextField
              className="mt-4"
              label="Teks tombol daftar"
              optional
              placeholder="Daftar sekarang"
              value={landing.cta_label ?? ""}
              onChange={(event) => setLanding({ ...landing, cta_label: event.target.value })}
            />

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-3">
                <input
                  type="color"
                  value={landing.theme?.seed ?? DEFAULT_REGISTRATION_SEED}
                  onChange={(event) => setLanding({ ...landing, theme: { seed: event.target.value } })}
                  className="size-14 cursor-pointer rounded-lg border border-outline bg-transparent"
                  aria-label="Warna merek halaman"
                />
                <span>
                  <span className="block text-label-large font-semibold">Warna merek</span>
                  <span className="mt-0.5 block font-mono text-body-small text-on-surface-variant">
                    {landing.theme?.seed ?? DEFAULT_REGISTRATION_SEED}
                  </span>
                </span>
              </label>
            </div>
            <p className="mt-2 text-body-small leading-5 text-on-surface-variant">
              Satu warna; sisanya diturunkan otomatis, jadi teksnya dijamin tetap terbaca di layar mana pun.
              Warna ini juga dipakai halaman pendaftaran.
            </p>

            {/* Saklar warna formulir tinggal DI SINI, bukan di CMS Registrasi.
                Warna acara punya satu sumber; kontrol yang tersebar di dua layar
                akan berbeda isinya dan tidak ada yang tahu mana yang menang. */}
            <div className="mt-6 border-t border-outline-variant pt-5">
              <Switch
                checked={!formInherit}
                onChange={(value) => setFormInherit(!value)}
                label="Formulir pendaftaran pakai warna berbeda"
              />
              <p className="mt-2 pl-16 text-body-small leading-5 text-on-surface-variant">
                {formInherit
                  ? "Halaman pendaftaran memakai warna di atas. Tamu yang menekan “Daftar sekarang” tidak berpindah identitas visual."
                  : "Halaman pendaftaran memakai warnanya sendiri. Pakai ini hanya bila memang disengaja — dua warna dalam dua ketukan berurutan terbaca seperti pindah ke situs lain."}
              </p>

              {!formInherit ? (
                <label className="mt-4 flex items-center gap-3 pl-16">
                  <input
                    type="color"
                    value={formSeed}
                    onChange={(event) => setFormSeed(event.target.value)}
                    className="size-14 cursor-pointer rounded-lg border border-outline bg-transparent"
                    aria-label="Warna merek formulir pendaftaran"
                  />
                  <span>
                    <span className="block text-label-large font-semibold">Warna formulir</span>
                    <span className="mt-0.5 block font-mono text-body-small text-on-surface-variant">{formSeed}</span>
                  </span>
                </label>
              ) : null}
            </div>
          </Card>

          {/* ---- Bagian ----------------------------------------------------- */}
          <Card>
            <h2 className="text-title-medium font-semibold">Bagian halaman</h2>
            <p className="mt-1 text-body-small text-on-surface-variant">
              Bagian yang dinyalakan tapi belum ada isinya tetap tidak muncul di halaman publik —
              tidak ada judul yang menggantung di atas ruang kosong.
            </p>
            <ol className="mt-5 space-y-2">
              {sections.map((section, index) => {
                const sumber = LANDING_SECTION_SOURCES[section.id];
                const berisi = sectionHasContent(section.id);
                return (
                  <li key={section.id} className="rounded-lg bg-panel-high p-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <Switch
                          checked={section.enabled}
                          onChange={(value) => {
                            const next = sections.map((item, position) => (position === index ? { ...item, enabled: value } : item));
                            setLanding({ ...landing, sections: next });
                          }}
                          label={LANDING_SECTION_LABELS[section.id]}
                        />
                      </span>
                      {/* Lencana hanya muncul saat saklarnya menyala TAPI isinya
                          kosong — satu-satunya keadaan yang membingungkan.
                          Bagian yang dimatikan memang tidak seharusnya tampil,
                          dan lencana di sana hanya menambah bising. */}
                      {section.enabled && berisi === false ? (
                        <StatusChip tone="warning" className="shrink-0">Belum ada isinya</StatusChip>
                      ) : null}
                      <IconButton size="sm" label="Naikkan" onClick={() => moveSection(index, -1)} disabled={index === 0}>
                        <ArrowUp size={16} weight="bold" />
                      </IconButton>
                      <IconButton size="sm" label="Turunkan" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1}>
                        <ArrowDown size={16} weight="bold" />
                      </IconButton>
                    </div>

                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-16 text-body-small text-on-surface-variant">
                      <span>{sumber.text}.</span>
                      {sumber.href ? (
                        <a
                          href={`/e/${facts.slug}${sumber.href}`}
                          className="inline-flex items-center gap-1 font-semibold text-primary"
                        >
                          {sumber.linkLabel}
                          <ArrowSquareOut size={14} />
                        </a>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ol>
          </Card>

          {/* ---- Angka penting & FAQ ---------------------------------------- */}
          <Card>
            <h2 className="text-title-medium font-semibold">Angka penting</h2>
            <div className="mt-4 space-y-2">
              {(landing.highlights ?? []).map((item, index) => (
                <div key={index} className="flex items-end gap-2">
                  <TextField
                    className="flex-1"
                    label="Keterangan"
                    value={item.label}
                    onChange={(event) => {
                      const next = [...(landing.highlights ?? [])];
                      next[index] = { ...next[index], label: event.target.value };
                      setLanding({ ...landing, highlights: next });
                    }}
                  />
                  <TextField
                    className="w-32"
                    label="Angka"
                    value={item.value}
                    onChange={(event) => {
                      const next = [...(landing.highlights ?? [])];
                      next[index] = { ...next[index], value: event.target.value };
                      setLanding({ ...landing, highlights: next });
                    }}
                  />
                  <IconButton
                    label="Hapus"
                    className="mb-1 text-error"
                    onClick={() => setLanding({ ...landing, highlights: (landing.highlights ?? []).filter((_, position) => position !== index) })}
                  >
                    <Trash size={18} />
                  </IconButton>
                </div>
              ))}
            </div>
            <Button
              variant="tonal"
              className="mt-4"
              icon={<Plus size={18} weight="bold" />}
              onClick={() => setLanding({ ...landing, highlights: [...(landing.highlights ?? []), { label: "Peserta", value: "300+" }] })}
            >
              Tambah angka
            </Button>

            <h2 className="mt-8 border-t border-outline-variant pt-6 text-title-medium font-semibold">Pertanyaan umum</h2>
            <div className="mt-4 space-y-4">
              {(landing.faq ?? []).map((item, index) => (
                <div key={index} className="rounded-lg bg-panel-high p-4">
                  <div className="flex items-start gap-2">
                    <TextField
                      className="flex-1"
                      label="Pertanyaan"
                      value={item.q}
                      onChange={(event) => {
                        const next = [...(landing.faq ?? [])];
                        next[index] = { ...next[index], q: event.target.value };
                        setLanding({ ...landing, faq: next });
                      }}
                    />
                    <IconButton
                      label="Hapus"
                      className="mt-8 text-error"
                      onClick={() => setLanding({ ...landing, faq: (landing.faq ?? []).filter((_, position) => position !== index) })}
                    >
                      <Trash size={18} />
                    </IconButton>
                  </div>
                  <TextArea
                    className="mt-3"
                    label="Jawaban"
                    rows={3}
                    value={item.a}
                    onChange={(event) => {
                      const next = [...(landing.faq ?? [])];
                      next[index] = { ...next[index], a: event.target.value };
                      setLanding({ ...landing, faq: next });
                    }}
                  />
                </div>
              ))}
            </div>
            <Button
              variant="tonal"
              className="mt-4"
              icon={<Plus size={18} weight="bold" />}
              onClick={() => setLanding({ ...landing, faq: [...(landing.faq ?? []), { q: "", a: "" }] })}
            >
              Tambah pertanyaan
            </Button>

            <h2 className="mt-8 border-t border-outline-variant pt-6 text-title-medium font-semibold">Sponsor &amp; mitra</h2>
            <p className="mt-1 text-body-small text-on-surface-variant">
              Ditampilkan sebagai kisi berukuran sama. Ukuran logo yang berbeda-beda adalah janji tentang
              nilai kontrak, dan itu bukan keputusan yang boleh diambil oleh urutan unggah.
            </p>
            <div className="mt-4 space-y-4">
              {(landing.sponsors ?? []).map((sponsor, index) => (
                <div key={index} className="rounded-lg bg-panel-high p-4">
                  <ImageUploadField
                    label={`Logo ${index + 1}`}
                    kind="landing"
                    fit="contain"
                    previewClassName="h-16 w-28"
                    value={sponsor.logo_url || null}
                    disabled={busy}
                    onChange={(url) => {
                      const next = [...(landing.sponsors ?? [])];
                      if (!url) {
                        setLanding({ ...landing, sponsors: next.filter((_, position) => position !== index) });
                        return;
                      }
                      next[index] = { ...next[index], logo_url: url };
                      setLanding({ ...landing, sponsors: next });
                    }}
                  />
                  <TextField
                    className="mt-3"
                    label="Nama"
                    optional
                    hint="Dipakai sebagai teks alternatif gambar, tidak ditampilkan."
                    value={sponsor.name ?? ""}
                    onChange={(event) => {
                      const next = [...(landing.sponsors ?? [])];
                      next[index] = { ...next[index], name: event.target.value };
                      setLanding({ ...landing, sponsors: next });
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Baris baru ditambahkan tanpa logo, lalu logonya diunggah di baris
                itu. Membuka pemilih berkas lebih dulu berarti baris kosong akan
                tertinggal setiap kali admin membatalkan pemilihan. */}
            <Button
              variant="tonal"
              className="mt-4"
              icon={<Plus size={18} weight="bold" />}
              onClick={() => setLanding({ ...landing, sponsors: [...(landing.sponsors ?? []), { logo_url: "" }] })}
            >
              Tambah sponsor
            </Button>

            <h2 className="mt-8 border-t border-outline-variant pt-6 text-title-medium font-semibold">Kontak panitia</h2>
            <TextField
              className="mt-4"
              label="Nama"
              optional
              value={landing.contact_name ?? ""}
              onChange={(event) => setLanding({ ...landing, contact_name: event.target.value })}
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField
                label="Telepon"
                optional
                value={landing.contact_phone ?? ""}
                onChange={(event) => setLanding({ ...landing, contact_phone: event.target.value })}
              />
              <TextField
                label="Email"
                optional
                type="email"
                value={landing.contact_email ?? ""}
                onChange={(event) => setLanding({ ...landing, contact_email: event.target.value })}
              />
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
