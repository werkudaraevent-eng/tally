"use client";

import { Button, IconButton, SegmentedButton, Switch, TextArea, TextField } from "@/components/m3";
import { LANDING_ABOUT_CARDS, LANDING_ABOUT_MEDIA_LABELS, LANDING_IMAGE_ALT_MAX, LANDING_SECTION_LABELS, LANDING_SECTION_TEXT_MAX, landingBlockHasContent, LANDING_AGENDA_SPEAKERS, LANDING_AGENDA_SPEAKERS_LABELS, type LandingAgendaSpeakers } from "@/lib/domain";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { gatheringColors } from "@/lib/registration-theme-css";
import { PilihIkonKartu, type WarnaUbin } from "../pilih-ikon";
import { DEFAULT_REGISTRATION_SEED, buildRegistrationThemeRoles } from "@/lib/registration-theme";
import { ikonKartu, nadaKartu } from "@/lib/landing-card-icons";
import { Plus, Trash } from "@phosphor-icons/react";
import { LANDING_UI } from "@/lib/landing-i18n";
import { Kelompok } from "@/components/admin/compact-form";
import type { useLandingCmsPage0 } from "./editor-0";
import type { useLandingCmsPage1 } from "./editor-1";

/** Bagian 3 dari 6 badan LandingCmsPage, dipindah apa adanya (audit platform, Fase 3). */
export function useLandingCmsPage2(c: Awaited<ReturnType<typeof useLandingCmsPage0>> & Awaited<ReturnType<typeof useLandingCmsPage1>>) {
  const { barisHari, busy, catatanProgram, facts, gathering, hapusCatatanProgram, horizon, judulBagian, kartuTentangRef, landing, mediaTentang, modern, patchFacts, sections, setCatatanProgram, setLanding, tanggalAcara, tokensHero } = c;
  const gambarTentang = (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body-medium font-medium text-on-surface">Image</p>
        <SegmentedButton<keyof typeof LANDING_ABOUT_MEDIA_LABELS>
          className="mt-1.5 w-full"
          label="Image"
          value={mediaTentang}
          onChange={(about_media) => setLanding({ ...landing, about_media })}
          options={(["auto", "image", "none"] as const).map((value) => ({ value, label: LANDING_ABOUT_MEDIA_LABELS[value] }))}
        />
        <p className="mt-1.5 text-body-medium text-on-surface-variant">
          {mediaTentang === "auto" && horizon
            ? "No photo: the heading and description stand alone. Choose Image to show one."
            : mediaTentang === "auto" && gathering
            ? "No image in the gathering style: the heading and cards stand alone. Choose Image to show one."
            : mediaTentang === "auto"
            ? landing.banner_url
              ? "The hero image (KV) with a figure on top: the first figure in Key figures, or the number of agenda sessions. Breaks such as registration and lunch are not counted."
              : "A panel in the page colour with a figure: the first figure in Key figures, or the number of agenda sessions. Breaks such as registration and lunch are not counted."
            : mediaTentang === "image"
              ? "Shown as uploaded, without a figure on top."
              : "The description stands alone, without an image."}
        </p>
      </div>
      {mediaTentang === "image" ? (
        <>
          <ImageUploadField
            label="About image"
            kind="landing"
            fit="cover"
            previewClassName="h-24 w-28"
            hint={
              horizon
                ? "Landscape (13:9), at least 1300×900. Wide screens round the top right corner; phones show a wide strip under the hero. PNG, JPG or WebP, up to 5 MB."
                : gathering
                ? "Landscape (4:3), at least 1250×940. PNG, JPG or WebP, up to 5 MB. Until an image is uploaded, no image shows."
                : "Close to square (8:7), at least 1250×1100. PNG, JPG or WebP, up to 5 MB. Until an image is uploaded, the automatic panel shows."
            }
            value={landing.about_image_url ?? null}
            onChange={(url) => setLanding({ ...landing, about_image_url: url })}
            disabled={busy}
          />
          {landing.about_image_url ? (
            <TextField
              label="Image description"
              optional
              maxLength={LANDING_IMAGE_ALT_MAX}
              counter
              placeholder="e.g. Participants at last year's forum"
              hint="Read aloud by screen readers. Leave empty if the image is only decoration."
              value={landing.about_image_alt ?? ""}
              onChange={(event) => setLanding({ ...landing, about_image_alt: event.target.value })}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );

  // Gaya gathering: kartu berikon di bawah judul Tentang acara (rancangan pen.dev).
  const kartuTentang = landing.about_cards ?? [];
  const setKartuTentang = (next: typeof kartuTentang) => setLanding({ ...landing, about_cards: next });
  // Fokus setelah Add card dan Delete (QA #107 L2): ke judul kartu yang dituju,
  // atau ke Add card bila tidak ada kartu lagi. Tanpa ini fokus jatuh ke <body>.
  const fokusKartu = (index: number) =>
    requestAnimationFrame(() => {
      const wadah = kartuTentangRef.current;
      const judul = wadah?.querySelectorAll<HTMLInputElement>("[data-kartu-tentang] input");
      const tujuan = judul && judul.length > 0 ? judul[Math.min(index, judul.length - 1)] : wadah?.querySelector<HTMLButtonElement>("[data-tambah-kartu] button");
      tujuan?.focus();
    });
  const hapusKartu = (index: number) => {
    // Terjemahan English ikut bergeser supaya tetap sepasang dengan kartunya.
    const en = landing.en?.about_cards ? { ...landing.en, about_cards: landing.en.about_cards.filter((_, position) => position !== index) } : landing.en;
    setLanding({ ...landing, about_cards: kartuTentang.filter((_, position) => position !== index), ...(en ? { en } : {}) });
    fokusKartu(index);
  };
  // Ikon dan warna ubin per kartu. Bawaannya mengikuti urutan kartu berjudul,
  // sama seperti halaman publik (ikonKartu/nadaKartu).
  const warnaGathering = gathering ? gatheringColors(tokensHero.accent ?? undefined, tokensHero.brand, false, landing.button_color) : null;
  const warnaUbin: WarnaUbin | null = warnaGathering
    ? { button: warnaGathering.chipAksi, brand: warnaGathering.chipMerek, accent: warnaGathering.chipAksen }
    : null;
  // Ubin ikon blok Rute: warna tema yang sama dengan halaman publik. Di luar
  // Gathering ketiga nada jatuh ke primary-container yang sama (KartuRute), jadi
  // editornya memakai warna itu dan tidak menawarkan pilihan warna ubin.
  const ubinRute: { warna: WarnaUbin; tanpaWarna: boolean } = (() => {
    if (warnaUbin) return { warna: warnaUbin, tanpaWarna: false };
    const roles = landing.theme?.roles ?? buildRegistrationThemeRoles(landing.theme?.seed ?? DEFAULT_REGISTRATION_SEED, false);
    const satu = { latar: roles.primary_container ?? roles.primary, teks: roles.on_primary_container ?? roles.on_primary };
    return { warna: { button: satu, brand: satu, accent: satu }, tanpaWarna: true };
  })();
  const urutanBerjudul = (index: number) => kartuTentang.slice(0, index).filter((kartu) => kartu.title.trim()).length;
  const editorKartuTentang = (
    <div ref={kartuTentangRef} className="flex flex-col gap-3">
      <div>
        <p className="text-body-medium font-medium text-on-surface">Cards</p>
        <p className="mt-0.5 text-body-medium text-on-surface-variant">
          Up to {LANDING_ABOUT_CARDS.max} cards with an icon under the heading. Cards without a title are not shown.
        </p>
      </div>
      {kartuTentang.map((kartu, index) => (
        <div key={index} data-kartu-tentang className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
          <div className="flex items-end gap-2">
            {warnaUbin && kartu.title.trim() ? (
              <PilihIkonKartu
                nomor={index + 1}
                ikon={ikonKartu(kartu, urutanBerjudul(index))}
                nada={nadaKartu(kartu, urutanBerjudul(index))}
                bawaan={!kartu.icon && !kartu.tone && !kartu.icon_url}
                warna={warnaUbin}
                gambar={kartu.icon_url?.trim() || null}
                onChange={(ubah) => {
                  const next = [...kartuTentang];
                  if (ubah === null) {
                    next[index] = { title: next[index].title, body: next[index].body };
                  } else {
                    next[index] = { ...next[index], ...ubah };
                  }
                  setKartuTentang(next);
                }}
              />
            ) : null}
            <TextField
              data-kolom={`kartu-${index}`}
              className="min-w-0 flex-1"
              label={`Card ${index + 1} title`}
              maxLength={LANDING_ABOUT_CARDS.title}
              value={kartu.title}
              onChange={(event) => { const next = [...kartuTentang]; next[index] = { ...next[index], title: event.target.value }; setKartuTentang(next); }}
            />
            <IconButton size="sm" label={`Delete card ${index + 1}`} className="text-error" onClick={() => hapusKartu(index)}>
              <Trash size={16} />
            </IconButton>
          </div>
          <TextArea
            label="Text"
            optional
            rows={2}
            maxLength={LANDING_ABOUT_CARDS.body}
            counter
            value={kartu.body}
            onChange={(event) => { const next = [...kartuTentang]; next[index] = { ...next[index], body: event.target.value }; setKartuTentang(next); }}
          />
        </div>
      ))}
      {kartuTentang.length < LANDING_ABOUT_CARDS.max ? (
        <div data-tambah-kartu>
          <Button
            variant="outlined"
            size="sm"
            icon={<Plus size={16} />}
            onClick={() => {
              setKartuTentang([...kartuTentang, { title: "", body: "" }]);
              fokusKartu(kartuTentang.length);
            }}
          >
            Add card
          </Button>
        </div>
      ) : null}
    </div>
  );

  // Horizon: urutan editor mengikuti halaman (kalimat pembuka, foto, judul, deskripsi).
  const garisPembukaHorizon = (
    <TextArea
      label="Opening line"
      data-kolom="program_heading"
      optional
      rows={2}
      hint="Optional large line above the photo, beside the day count (01–03), with a link that scrolls to the agenda. Empty: no opening line, so the section heading below is the only heading. Press Enter to start a new line."
      maxLength={120}
      value={landing.program_heading ?? ""}
      onChange={(event) => setLanding({ ...landing, program_heading: event.target.value })}
    />
  );
  const deskripsiTentang = facts ? (
    <TextArea
      label="Event description"
      optional
      rows={6}
      hint="Separate paragraphs with Enter; the breaks show on the page."
      value={facts.description ?? ""}
      onChange={(event) => patchFacts({ description: event.target.value })}
    />
  ) : null;
  const isiTentang = facts ? (
    <div className="flex flex-col gap-4">
      {horizon ? garisPembukaHorizon : deskripsiTentang}
      {modern ? gambarTentang : null}
      {judulBagian("about", { judul: LANDING_SECTION_LABELS.about, jenis: "default", hint: horizon ? "The large sentence above the description, beside the photo." : gathering ? "The large sentence above the cards." : "The large sentence next to the event description." })}
      {/* Horizon tidak menampilkan kartu: editornya disembunyikan, kartunya tetap tersimpan. */}
      {gathering && !horizon ? editorKartuTentang : null}
      {horizon ? deskripsiTentang : null}
    </div>
  ) : null;

  const isiLokasi = facts ? (
    <div className="flex flex-col gap-4">
      <TextField
        label="Venue name"
        optional
        placeholder="e.g. Grand Ballroom, Hotel Mulia"
        hint="Also used in calendar files and emails."
        value={facts.venue_name ?? ""}
        onChange={(event) => patchFacts({ venue_name: event.target.value })}
      />
      <TextArea
        label="Address"
        optional
        rows={3}
        value={facts.venue_address ?? ""}
        onChange={(event) => patchFacts({ venue_address: event.target.value })}
      />
      <TextField
        label="Map link"
        optional
        type="url"
        hint={
          gathering
            ? "Google Maps or similar, for the \"Buka peta\" or \"Buka di Google Maps\" button. Not used while Logistics has a hotel, because the page shows the hotel instead. Empty = the button searches the venue name and address."
            : modern
            ? "Google Maps or similar, for the \"Buka peta\" or \"Buka di Google Maps\" button. The map on the page is drawn from the venue name and address, so check those match. Empty = the button searches them."
            : "Google Maps or similar. Opens as a link instead of being embedded, so the page loads no third-party scripts for visitors."
        }
        placeholder="https://maps.app.goo.gl/..."
        value={facts.venue_map_url ?? ""}
        onChange={(event) => patchFacts({ venue_map_url: event.target.value })}
      />
      {judulBagian(
        "venue",
        facts.venue_name?.trim()
          ? { judul: facts.venue_name.trim(), jenis: "automatic (venue name)", hint: "Leave empty to use the venue name." }
          : { judul: LANDING_SECTION_LABELS.venue, jenis: "default", hint: "Leave empty to use the venue name once it is filled in." },
      )}
    </div>
  ) : null;

  // Keterangan per bagian rundown: kartu Program, atau cerita kartu hari pada gaya gathering.
  const daftarCatatan = (
    <div className="flex flex-col gap-3">
      <p className="text-body-medium font-medium text-on-surface">{gathering ? "Day card stories" : "Programme card descriptions"}</p>
      <p className="text-body-medium text-on-surface-variant">
        {gathering
          ? "One or two sentences per day, in the order of the published agenda sections: story 1 goes with Day 1, and so on. The date, title and key times come from the agenda."
          : "In the order of the published agenda sections: description 1 goes with the first section shown, and so on. Times and session counts are filled in automatically."}
      </p>
      {catatanProgram.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <TextArea
            className="min-w-0 flex-1"
            label={gathering ? `Day ${index + 1} story` : `Programme description ${index + 1}`}
            rows={2}
            value={item}
            onChange={(event) => { const next = [...catatanProgram]; next[index] = event.target.value; setCatatanProgram(next); }}
          />
          <IconButton size="sm" label={gathering ? `Delete Day ${index + 1} story` : `Delete description ${index + 1}`} className="mt-6 text-error" onClick={() => hapusCatatanProgram(index)}>
            <Trash size={16} />
          </IconButton>
        </div>
      ))}
      <div>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={catatanProgram.length >= 10} onClick={() => setCatatanProgram([...catatanProgram, ""])}>{gathering ? "Add day story" : "Add description"}</Button>
      </div>
    </div>
  );

  const isiAgenda = modern ? (
    <div className="flex flex-col gap-5">
      {judulBagian(
        "agenda",
        horizon
          ? { judul: LANDING_UI.id.horizon.days(barisHari).replace("\n", " "), jenis: "automatic (day count)", hint: "Leave empty to count the agenda days, like \"Tiga hari. Satu cerita kita.\"" }
          : tanggalAcara
          ? { judul: tanggalAcara, jenis: "automatic (date)", hint: "Leave empty to use the event date." }
          : { judul: LANDING_SECTION_LABELS.agenda, jenis: "default", hint: "Leave empty to use the event date once it is set." },
        <TextField
          data-kolom="agenda_note"
          label="Note"
          optional
          placeholder="Registrasi dibuka pukul 08.00 WIB."
          hint="Below the heading, above the list of sessions."
          maxLength={LANDING_SECTION_TEXT_MAX.intro}
          counter
          value={landing.agenda_note ?? ""}
          onChange={(event) => setLanding({ ...landing, agenda_note: event.target.value })}
        />,
      )}
      <Kelompok title="Speakers in sessions" note="Names come from the speakers linked to each session, even when the Speakers section is off. Lines in Details that name a linked speaker are left out so nobody shows twice.">
        <SegmentedButton<LandingAgendaSpeakers>
          className="w-full"
          label="Speakers in sessions"
          value={landing.agenda_speakers ?? "text"}
          onChange={(agenda_speakers) => setLanding({ ...landing, agenda_speakers: agenda_speakers === "text" ? undefined : agenda_speakers })}
          options={LANDING_AGENDA_SPEAKERS.map((value) => ({ value, label: LANDING_AGENDA_SPEAKERS_LABELS[value] }))}
        />
        <p className="text-body-small text-on-surface-variant">
          {(landing.agenda_speakers ?? "text") === "text"
            ? "Details shows as typed. Speaker photos sit to the right of each session while the Speakers section is on."
            : "Each linked speaker gets a line under the session title, grouped by their role in that session. Link speakers to sessions on the Speakers page."}
        </p>
      </Kelompok>
      {gathering ? (
        <Kelompok
          title={horizon ? "Days" : "Day cards"}
          note={
            horizon
              ? "One row per agenda section, with its date, title, story and up to three times (the first two and the last; breaks are skipped). \"Jadwal lengkap\" folds out below when some sessions are hidden."
              : "One card per agenda section. A day with more than three sessions shows the first two and the last, plus how many more; breaks are skipped. The full schedule folds out below the cards."
          }
        >
          {daftarCatatan}
        </Kelompok>
      ) : (
        <Kelompok title="Programme cards" note="Large cards made from the agenda sections, shown below About.">
          <Switch
            checked={!landing.program_hidden}
            onChange={(value) => setLanding({ ...landing, program_hidden: !value })}
            label="Show programme cards"
            description="Turn off if the main sessions are already in an image card block, so they don't show twice."
          />
          {!landing.program_hidden ? (
            <>
              <TextField
                label="Programme section heading"
                optional
                placeholder="Program"
                hint="The Programme section shows when the agenda has two or more sections."
                value={landing.program_heading ?? ""}
                onChange={(event) => setLanding({ ...landing, program_heading: event.target.value })}
              />
              <TextArea
                label="Programme intro"
                optional
                rows={2}
                value={landing.program_intro ?? ""}
                onChange={(event) => setLanding({ ...landing, program_intro: event.target.value })}
              />
              {daftarCatatan}
            </>
          ) : null}
        </Kelompok>
      )}
    </div>
  ) : null;

  const isiKaki = (
    <div className="flex flex-col gap-5">
      <Kelompok first>
        <TextArea
          label="Organiser line"
          optional
          rows={2}
          placeholder="Diselenggarakan oleh ..."
          hint={
            horizon
              ? "The small line on the right of the navy footer. Empty = no line."
              : gathering
              ? "The gold line on the right of the footer. Empty = no line."
              : modern
                ? "Below the event name in the footer. Empty = event date and venue name."
                : "Shown in the Modern layout."
          }
          maxLength={180}
          counter
          value={landing.footer_note ?? ""}
          onChange={(event) => setLanding({ ...landing, footer_note: event.target.value })}
        />
      </Kelompok>
      {modern ? (
        <Kelompok
          title={horizon ? "Closing band" : "Call-to-action banner"}
          note={
            horizon
              ? "The gold band above the footer: a heading and one button. While registration is open the button registers; on an invite-only page it signs guests in. Hidden for signed-in participants."
              :
            // Isinya mengikuti keadaan, bukan selalu "masuk" (CMS mudah, butir 12).
            (landing.blocks ?? []).some((blok) => blok.type === "cta" && landingBlockHasContent(blok) && sections.some((section) => section.enabled && section.id === blok.id))
              ? "Hidden now, because the page has a call-to-action strip block. Hide or delete that block to show this banner above the footer."
              : "Above the footer. While registration is open it asks guests to register. On an invite-only page with registration closed it asks them to sign in, using standard text: the heading and text below are not used there. Otherwise it is hidden."
          }
        >
          <TextField
            label={horizon ? "Heading" : "Banner heading"}
            data-kolom="cta_heading"
            optional
            placeholder={horizon ? LANDING_UI.id.horizon.closing.replace("\n", " ") : "Amankan tempat Anda"}
            value={landing.cta_heading ?? ""}
            onChange={(event) => setLanding({ ...landing, cta_heading: event.target.value })}
          />
          {horizon ? null : (
          <TextArea
            label="Banner text"
            optional
            rows={2}
            placeholder="e.g. Pendaftaran perlu persetujuan panitia. Kode QR dikirim setelah disetujui."
            value={landing.cta_note ?? ""}
            onChange={(event) => setLanding({ ...landing, cta_note: event.target.value })}
          />
          )}
        </Kelompok>
      ) : null}
    </div>
  );
  return { gambarTentang, kartuTentang, setKartuTentang, fokusKartu, hapusKartu, warnaGathering, warnaUbin, ubinRute, urutanBerjudul, editorKartuTentang, garisPembukaHorizon, deskripsiTentang, isiTentang, isiLokasi, daftarCatatan, isiAgenda, isiKaki };
}
