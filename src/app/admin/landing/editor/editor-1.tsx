"use client";

import { Kelompok } from "@/components/admin/compact-form";
import { Button, SegmentedButton, Switch, TextArea, TextField } from "@/components/m3";
import { HighlightField } from "@/components/admin/highlight-field";
import { BilahAtasEditor } from "@/components/admin/landing-nav-editor";
import { LANDING_BANNER_STYLE_LABELS, LANDING_HEADING_SIZE, LANDING_HERO_HEIGHT_PX, LANDING_SECTION_LABELS, LANDING_SECTION_TEXT_MAX, HORIZON_TEXT_MAX, type LandingHeadedSection, type LandingHeroAlign, type LandingHeroPosition } from "@/lib/domain";
import { LANDING_UI, landingEyebrowShown } from "@/lib/landing-i18n";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { ukurTerangKv } from "@/lib/kv-terang";
import { HERO_KV_KUAT } from "@/lib/landing-tokens";
import { type ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cx } from "@/lib/m3/cx";
import { formatEventDate } from "@/lib/event-datetime";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import { jumlahLembaga } from "@/lib/landing-speaker-tabs";
import { AngkaPx, HERO_PRESET_PX, JUDUL_PRESET_PX, PilihWarna, formatTanggal, jamInput } from "./editor-bantu";
import type { useLandingCmsPage0 } from "./editor-0";

/** Bagian 2 dari 6 badan LandingCmsPage, dipindah apa adanya (audit platform, Fase 3). */
export function useLandingCmsPage1(c: Awaited<ReturnType<typeof useLandingCmsPage0>>) {
  const { busy, emasHorizon, facts, gathering, gayaBanner, horizon, judulTerbuka, landing, modern, panelPratinjauPortal, patchFacts, setJudulTerbuka, setLanding, tokensHero } = c;
  const isiPembuka = facts ? (
    <div className="flex flex-col gap-5">
      <Kelompok title="Content" first>
        <TextField
          label="Event name on the public page"
          data-kolom="public_name"
          optional
          hint={
            gathering
              ? "Shown in the top bar, the label above the title, the form and link preview. In the gathering layout the Title below is the large heading, or this name when Title is empty. Leave empty to use the event name from admin."
              : "The large title in the hero, top bar, form and link preview. Leave empty to use the event name from admin."
          }
          maxLength={120}
          value={landing.public_name ?? ""}
          onChange={(event) => setLanding({ ...landing, public_name: event.target.value })}
        />
        {gathering ? (
          <HighlightField
            label="Title"
            data-kolom="tagline"
            optional
            hint={horizon ? "The large title in the hero. Select a word and press Highlight to show it in gold." : "The large title in the hero. Select a word and press Highlight to show it in the accent colour."}
            accent={horizon ? emasHorizon : tokensHero.accent ?? "#d4a72c"}
            maxLength={200}
            value={facts.tagline ?? ""}
            onChange={(tagline) => patchFacts({ tagline })}
          />
        ) : (
          <TextArea
            label="Tagline"
            data-kolom="tagline"
            optional
            rows={2}
            hint="One sentence below the event name."
            value={facts.tagline ?? ""}
            onChange={(event) => patchFacts({ tagline: event.target.value })}
          />
        )}
      </Kelompok>

      {/* Bilah atas hanya ada di tata letak Modern; Editorial punya nav sendiri. */}
      {modern ? (
        <div data-kolom="nav">
        <BilahAtasEditor
          value={landing.nav ?? {}}
          onChange={(nav) => setLanding({ ...landing, nav })}
          eventName={landing.public_name?.trim() || facts.name || "Nama acara"}
          disabled={busy}
          gathering={gathering}
          horizon={horizon}
          // Horizon memakai logo hero di bilah saat logo bilah kosong: tampilkan di sini, hapus keduanya.
          logoCadangan={horizon ? landing.hero_logo_url?.trim() || null : null}
          navyHorizon={tokensHero.brand}
          onLogo={(url) => setLanding({ ...landing, nav: { ...(landing.nav ?? {}), logo_url: url }, hero_logo_url: url ? landing.hero_logo_url : null })}
        />
        </div>
      ) : null}

      {/* Hero gathering punya ukuran dan susunan sendiri: kontrol yang tidak
          mengubah apa pun tidak ditampilkan (QA #103 L4). */}
      {gathering ? null : (
      <Kelompok title="Size" note="In px, for wide screens. Scales down automatically on phones.">
        <AngkaPx
          label="Event name size"
          rentang={LANDING_HEADING_SIZE}
          value={landing.heading_size ?? JUDUL_PRESET_PX[landing.heading_scale ?? "lg"]}
          onChange={(value) => setLanding({ ...landing, heading_size: value })}
          hint="Long names look tidier at 48 to 64. On phones about 60% of this value."
        />
        <AngkaPx
          label="Hero height"
          rentang={LANDING_HERO_HEIGHT_PX}
          value={landing.hero_min_height ?? HERO_PRESET_PX[landing.hero_height ?? "standard"]}
          onChange={(value) => setLanding({ ...landing, hero_min_height: value })}
          hint="Never taller than the visitor's screen, so the register button stays visible. On phones 75% of this value."
        />
      </Kelompok>
      )}

      {/* Setelan bagian, bukan tema global (Shopify: Image banner). Kiri/Tengah
          saja: rata kanan di teks Latin membuat mata mencari awal baris, dan di
          ponsel harus jatuh ke kiri juga. Editorial hanya Kiri, karena kolom
          fakta acara berdiri di kanan judul. */}
      {gathering ? null : modern ? (
        <Kelompok title="Text placement" note={landing.banner_url ? "Bottom keeps the KV visible above the title." : undefined}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <p id="label-hero-rata" className="text-body-medium font-medium text-on-surface">Alignment</p>
              <SegmentedButton<LandingHeroAlign>
                className="w-full"
                label="Alignment"
                labelledBy="label-hero-rata"
                value={tokensHero.heroAlign}
                onChange={(hero_align) => setLanding({ ...landing, hero_align })}
                options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }]}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <p id="label-hero-posisi" className="text-body-medium font-medium text-on-surface">Position</p>
              <SegmentedButton<LandingHeroPosition>
                className="w-full"
                label="Position"
                labelledBy="label-hero-posisi"
                value={tokensHero.heroPosition}
                onChange={(hero_position) => setLanding({ ...landing, hero_position })}
                options={[{ value: "bottom", label: "Bottom" }, { value: "middle", label: "Middle" }]}
              />
            </div>
          </div>
        </Kelompok>
      ) : (
        <Kelompok title="Text placement" note="Editorial keeps the title on the left, because the event facts sit in the column to its right. Modern can centre it.">
          <div className="flex flex-col gap-2">
            <p id="label-hero-rata" className="text-body-medium font-medium text-on-surface">Alignment</p>
            <SegmentedButton<LandingHeroAlign>
              className="w-full"
              label="Alignment"
              labelledBy="label-hero-rata"
              value="left"
              onChange={() => undefined}
              options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre", disabled: true }]}
            />
          </div>
        </Kelompok>
      )}

      {gathering ? (
        <Kelompok title="Hero text" note={horizon ? "A label, the title, a line below it, and the button. The hero image sits below them." : "The gathering hero: a label, the tagline as the title, and a line below it."}>
          <TextField
            label="Label above the title"
            data-kolom="hero_eyebrow"
            optional
            maxLength={60}
            hint={horizon && landing.horizon_style === "trip" ? "Empty shows no label: Gathering Trip already shows the dates and venue below the title." : horizon ? "Empty shows the venue and dates, like \"Yogyakarta / 6–8 November 2026\"." : 'Empty shows "You\'re invited · event name" while the page is invite only.'}
            value={landing.hero_eyebrow ?? ""}
            onChange={(event) => setLanding({ ...landing, hero_eyebrow: event.target.value })}
          />
          <TextArea
            label="Line below the title"
            data-kolom="hero_note"
            optional
            rows={3}
            maxLength={240}
            counter
            hint="One or two sentences on what the trip is. Press Enter to start a new line."
            value={landing.hero_note ?? ""}
            onChange={(event) => setLanding({ ...landing, hero_note: event.target.value })}
          />
          {horizon ? (
            <>
              <TextField
                label="Button text"
                data-kolom="hero_button_label"
                optional
                placeholder={LANDING_UI.id.horizon.start}
                hint="The gold button under the title. It scrolls to the next section."
                maxLength={HORIZON_TEXT_MAX.hero_button_label}
                counter
                value={landing.hero_button_label ?? ""}
                onChange={(event) => setLanding({ ...landing, hero_button_label: event.target.value })}
              />
              <TextField
                label="Corner label"
                data-kolom="hero_index"
                optional
                placeholder={LANDING_UI.id.horizon.index}
                hint="Small text at the bottom left of the hero image and on the About photo, on wide screens."
                maxLength={HORIZON_TEXT_MAX.hero_index}
                value={landing.hero_index ?? ""}
                onChange={(event) => setLanding({ ...landing, hero_index: event.target.value })}
              />
            </>
          ) : null}
          {/* Logo hero dari gaya sebelumnya: tidak lagi digambar, jadi admin
              melihatnya dan bisa menghapusnya (QA #103 L5). Horizon memakainya
              di bilah atas selama Top bar belum punya logo. */}
          {landing.hero_logo_url && !horizon ? (
            <div className="flex items-center gap-3 rounded-md border border-outline-variant p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={landing.hero_logo_url} alt="" className="h-10 w-16 shrink-0 object-contain" />
              <p className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
                This hero logo is not shown in the gathering layout. Put it in Top bar, Event logo instead, or remove it.
              </p>
              <Button variant="outlined" size="sm" disabled={busy} onClick={() => setLanding({ ...landing, hero_logo_url: null })}>
                Remove
              </Button>
            </div>
          ) : null}
        </Kelompok>
      ) : null}

      {/* KV gathering: tekstur 20% di atas gradasi navy hero dan kepala portal
          (Figma Hanung 2026-10-08). Kosong = gradasi saja seperti sebelumnya. */}
      {gathering ? (
        <div data-kolom="hero_bg_url">
          <Kelompok
            title={horizon ? "Hero image (KV)" : "Background image"}
            note={
              horizon
                ? "Shown in full under the title, across the page, and on the journey pass card. The top edge fades into the navy."
                : "Two layers behind the hero and at the top of the participant portal: the image, faded, on top of a colour layer."
            }
          >
            <ImageUploadField
              label={horizon ? "Hero image" : "Hero background image"}
              kind="landing"
              fit="cover"
              previewClassName="h-20 w-36"
              perkecil={{ lebar: 1920, mutu: 0.75 }}
              hint={
                horizon
                  ? "Use an artwork without text, such as the event ornaments. Shown at its own proportions, about 1440×506 in the design. Most browsers save wider images at 1920 px wide. PNG, JPG or WebP, up to 5 MB and 8000 px."
                  : "Use an artwork without text, such as the event ornaments. It is cropped to fill the area, so keep the important parts near the middle. Landscape, at least 1440×480. Most browsers save wider images at 1920 px wide. PNG, JPG or WebP, up to 5 MB and 8000 px."
              }
              value={landing.hero_bg_url ?? null}
              onChange={(url, berkas) => {
                setLanding({ ...landing, hero_bg_url: url, hero_bg_on: url ? true : landing.hero_bg_on, hero_bg_terang: undefined, hero_bg_terang_src: undefined });
                // Terangnya diukur dari berkas yang diunggah, bersama URL-nya
                // (kvGathering menakar bayangan darinya).
                if (url && berkas)
                  void ukurTerangKv(berkas).then(
                    (terang) => terang && setLanding((kini) => (kini.hero_bg_url === url ? { ...kini, hero_bg_terang: terang, hero_bg_terang_src: url } : kini)),
                  );
              }}
              disabled={busy}
            />
            <Switch
              checked={Boolean(landing.hero_bg_url) && landing.hero_bg_on !== false}
              onChange={(value) => setLanding({ ...landing, hero_bg_on: value })}
              label="Show the image"
              description={landing.hero_bg_url ? "Off keeps the image saved and shows the hero as it was without it." : "Upload an image first."}
              disabled={busy || !landing.hero_bg_url}
            />
            {/* Horizon menampilkan gambarnya utuh: kekuatan dan lapisan warna tidak berlaku. */}
            {landing.hero_bg_url && landing.hero_bg_on !== false && !horizon ? (
              <AngkaPx
                label="Image strength"
                satuan="%"
                rentang={HERO_KV_KUAT}
                value={landing.hero_bg_opacity ?? HERO_KV_KUAT.bawaan}
                onChange={(value) => setLanding({ ...landing, hero_bg_opacity: value })}
                hint="How much of the image shows through. 20 matches the design. Higher values add a dark shade over the image where needed, so the text stays readable."
              />
            ) : null}
            {landing.hero_bg_url && landing.hero_bg_on !== false && !horizon ? (
            <div className="flex flex-col gap-2">
              <p id="label-lapisan-warna" className="text-body-medium font-medium text-on-surface">Colour layer</p>
              <SegmentedButton<"merek" | "sendiri">
                className="w-full"
                label="Colour layer"
                labelledBy="label-lapisan-warna"
                value={landing.hero_bg_color ? "sendiri" : "merek"}
                onChange={(value) => setLanding({ ...landing, hero_bg_color: value === "sendiri" ? (landing.hero_bg_color ?? tokensHero.brand ?? "#1B2D57") : undefined })}
                options={[
                  { value: "merek", label: "Brand colour" },
                  { value: "sendiri", label: "Custom colour" },
                ]}
              />
              {landing.hero_bg_color ? (
                <PilihWarna label="Layer colour" value={landing.hero_bg_color} onChange={(value) => setLanding({ ...landing, hero_bg_color: value })} />
              ) : null}
              <p className="text-body-medium text-on-surface-variant">
                {landing.hero_bg_color
                  ? "Shown as a gradient. A light colour is darkened so the text stays readable; the text and button colours follow it."
                  : "The navy gradient from Theme, the same as without an image."}
              </p>
            </div>
            ) : null}
          </Kelompok>
        </div>
      ) : null}

      {/* Horizon tidak punya kotak HP di hero: ajakannya di bagian Portal peserta. */}
      {gathering && !horizon ? <div data-kolom="portal">{panelPratinjauPortal}</div> : null}

      {/* Gathering tidak memakai KV di hero: kolomnya pindah ke tab Theme,
          grup Page, dengan nama sesuai gunanya (QA #110, Mas Hanung 8 Okt). */}
      {gathering ? null : (
      <Kelompok title="Background image (KV)">
        <ImageUploadField
          label="Hero image (KV)"
          kind="landing"
          fit="cover"
          previewClassName="h-20 w-36"
          hint="16:9 ratio, at least 1920×1080. Keep the important part of the image at the top or right: the title sits bottom left. PNG, JPG or WebP, up to 5 MB."
          value={landing.banner_url ?? null}
          onChange={(url) => setLanding({ ...landing, banner_url: url })}
          disabled={busy}
        />
        {/* Pilihan ini hanya muncul saat bannernya ada. Tanpa gambar, kedua
            opsi menghasilkan halaman yang sama persis, dan kontrol yang tidak
            mengubah apa pun membuat admin ragu apakah dirinya salah pakai. */}
        {landing.banner_url && !gathering ? (
          <div>
            <p className="text-body-medium font-medium text-on-surface">KV style</p>
            <SegmentedButton
              className="mt-1.5 w-full"
              label="KV style"
              value={gayaBanner}
              onChange={(value) => setLanding({ ...landing, banner_style: value })}
              options={[
                { value: "theme", label: LANDING_BANNER_STYLE_LABELS.theme },
                { value: "photo", label: LANDING_BANNER_STYLE_LABELS.photo },
              ]}
            />
            <p className="mt-1.5 text-body-medium text-on-surface-variant">
              {gayaBanner === "theme"
                ? "The image is blended into the page colour. It matches, but strongly coloured images turn pale."
                : "The image keeps its original colours. The bottom gets a dark shade and the hero text turns white so it stays readable."}
            </p>
          </div>
        ) : null}
      </Kelompok>
      )}

      <Kelompok title="Button">
        <TextField
          label="Register button text"
          optional
          hint={horizon ? "In the top bar and on the gold closing band while registration is open." : undefined}
          placeholder="Daftar sekarang"
          maxLength={40}
          counter
          value={landing.cta_label ?? ""}
          onChange={(event) => setLanding({ ...landing, cta_label: event.target.value })}
        />
        {/* Pindah dari tab Participants (yang hanya memuat saklar ini): yang
            diubahnya adalah tombol hero saat pendaftaran tutup, jadi tempatnya
            di sini dan pratinjaunya langsung terlihat. */}
        {modern ? (
          <Switch
            checked={landing.invite_only === true}
            onChange={(value) => setLanding({ ...landing, invite_only: value })}
            disabled={busy}
            label="Invite only"
            description="While registration is closed, the page asks invited guests to sign in instead of saying registration is closed. The sign-in banner above the footer uses standard text. Works only while the participant area is open."
            note={landing.member?.enabled === true ? undefined : <span className="text-body-medium text-on-surface-variant">The participant area is closed, so this has no effect now.</span>}
          />
        ) : null}
      </Kelompok>

      <Kelompok
        title="Time"
        note={
          horizon
            ? "Gathering Horizon shows the dates above the title and on the journey pass, not the times. The times are used in calendar files and emails."
            : gathering
            ? "The gathering hero shows the dates and the trip length (like 3 days 2 nights), counted from the start and end date. It does not show the times; they are used in calendar files and emails."
            : "Also used in calendar files and emails, not only on this page."
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Start time"
            optional
            type="time"
            value={jamInput(facts.start_time)}
            onChange={(event) => patchFacts({ start_time: event.target.value || null })}
          />
          <TextField
            label="End time"
            optional
            type="time"
            value={jamInput(facts.end_time)}
            onChange={(event) => patchFacts({ end_time: event.target.value || null })}
          />
        </div>
        <TextField
          label="End date"
          optional
          type="date"
          hint={`Fill in only if the event runs over more than one day. The start date (${facts.event_date ? formatTanggal(facts.event_date) : "not set yet"}) is set in Edit details on the dashboard.`}
          value={facts.end_date ?? ""}
          onChange={(event) => patchFacts({ end_date: event.target.value || null })}
        />
      </Kelompok>
    </div>
  ) : null;

  // ---- Judul bagian (Modern) ----------------------------------------------------
  // Label kecil dan judul bagian bawaan, terlipat di bawah isi bagian supaya
  // daftar pertanyaan dan rundown tetap terlihat. Kolom mulai kosong: teks
  // abu-abunya adalah yang tampil bila dibiarkan kosong, jadi judul otomatis
  // (tanggal, nama tempat, jumlah pembicara) tetap ikut data acara.
  function judulBagian(id: LandingHeadedSection, otomatis: { judul: string; jenis: string; hint: string }, tambahan?: ReactNode): ReactNode {
    if (!modern) return null;
    // Rundown gathering selalu memakai label kecil ("Rundown" bila kosong) dan
    // tidak membaca sakelarnya: panel menampilkan yang benar-benar tampil (CMS mudah, butir 6).
    const selalu = gathering && !horizon && id === "agenda";
    // Rundown Horizon hanya punya judul besar ("Tiga hari. Satu cerita kita."), tanpa label kecil.
    const tanpaLabel = horizon && id === "agenda";
    const nyala = !tanpaLabel && (selalu || landingEyebrowShown(landing, id));
    const alisBawaan = selalu ? "Rundown" : LANDING_SECTION_LABELS[id];
    const alis = landing[`${id}_eyebrow`] ?? "";
    const kunciJudul = id === "about" ? "about_heading" : (`${id}_heading` as const);
    const judul = landing[kunciJudul] ?? "";
    const buka = judulTerbuka === id;
    const catatan = id === "agenda" && landing.agenda_note?.trim() ? " · Note filled in" : "";
    const ringkasan = `${tanpaLabel ? "" : `Label: ${nyala ? alis.trim() || alisBawaan : "hidden"} · `}Heading: ${judul.trim() || otomatis.jenis}${catatan}`;
    return (
      <div className="flex flex-col gap-4 border-t border-outline-variant pt-2">
        <button
          type="button"
          aria-expanded={buka}
          onClick={() => setJudulTerbuka(buka ? null : id)}
          className="m3-state -mx-2 flex min-h-12 items-center gap-2 rounded-sm px-2 text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-medium font-semibold text-on-surface">Section heading</span>
            <span className="truncate text-body-small text-on-surface-variant">{ringkasan}</span>
          </span>
          <CaretDown size={14} aria-hidden className={cx("shrink-0 text-on-surface-variant transition-transform", buka && "rotate-180")} />
        </button>
        {buka ? (
          <>
            {selalu || tanpaLabel ? null : (
              <Switch
                checked={nyala}
                onChange={(value) => setLanding({ ...landing, eyebrow_shown: { ...landing.eyebrow_shown, [id]: value } })}
                label="Small label above the heading"
              />
            )}
            {/* Dimatikan: kolomnya disembunyikan, isinya tetap tersimpan (kecuali
                terlalu panjang: Simpan menolaknya, jadi harus terlihat). */}
            {(nyala || alis.trim().length > LANDING_SECTION_TEXT_MAX.eyebrow) && !tanpaLabel ? (
              <TextField
                data-kolom={`${id}_eyebrow`}
                className={TEKS_BAWAAN}
                label="Small label"
                optional
                placeholder={alisBawaan}
                hint={selalu ? "One to three words above the heading. The gathering layout always shows this label." : "One to three words above the heading."}
                maxLength={LANDING_SECTION_TEXT_MAX.eyebrow}
                counter
                value={alis}
                onChange={(event) => setLanding({ ...landing, [`${id}_eyebrow`]: event.target.value })}
              />
            ) : null}
            <TextField
              data-kolom={kunciJudul}
              className={TEKS_BAWAAN}
              label="Heading"
              placeholder={otomatis.judul}
              hint={otomatis.hint}
              maxLength={LANDING_SECTION_TEXT_MAX.heading}
              counter={{ ideal: LANDING_SECTION_TEXT_MAX.headingIdeal }}
              value={judul}
              onChange={(event) => setLanding({ ...landing, [kunciJudul]: event.target.value })}
            />
            {tambahan}
          </>
        ) : null}
      </div>
    );
  }
  // Jumlah hari acara untuk judul Rundown Horizon yang otomatis (halaman menghitung bagian rundown; ini perkiraannya dari tanggal).
  const barisHari = facts?.event_date ? Math.max(1, Math.round((Date.parse(facts.end_date ?? facts.event_date) - Date.parse(facts.event_date)) / 86_400_000) + 1) : 3;
  const tanggalAcara = facts ? formatEventDate({ ...facts, time_zone: DEFAULT_TIME_ZONE }) : null;
  const pembicaraIsi = (landing.speakers ?? []).filter((speaker) => speaker.name?.trim());
  const lembaga = jumlahLembaga(pembicaraIsi);
  const KOSONG_BAWAAN = "Leave empty for the default text.";
  // Placeholder judul bagian adalah teks yang benar-benar tampil bila kolom
  // kosong, jadi warnanya penuh on-surface-variant (5,33:1), bukan /70 contoh.
  const TEKS_BAWAAN = "[&_input::placeholder]:text-on-surface-variant [&_textarea::placeholder]:text-on-surface-variant";

  // Gambar di samping deskripsi (Modern). Otomatis = perilaku sebelum pilihan
  // ini ada, jadi acara lama tidak berubah sampai admin memilih.
  const mediaTentang = landing.about_media ?? "auto";
  return { isiPembuka, judulBagian, barisHari, tanggalAcara, pembicaraIsi, lembaga, KOSONG_BAWAAN, TEKS_BAWAAN, mediaTentang };
}
