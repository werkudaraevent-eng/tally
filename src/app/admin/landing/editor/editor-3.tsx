"use client";

import { Kelompok } from "@/components/admin/compact-form";
import { Button, ButtonLink, IconButton, SegmentedButton, Switch, TextArea, TextField } from "@/components/m3";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { plural } from "@/lib/plural";
import { TabTema } from "../theme-tab";
import { LANDING_SECTION_LABELS, LANDING_SECTION_TEXT_MAX, type LandingSectionId, LANDING_SPEAKER_FRAMES, LANDING_SPEAKER_FRAME_LABELS, type LandingSpeakerFrame, LANDING_FAQ_LAYOUTS, LANDING_FAQ_LAYOUT_LABELS, FAQ_GROUP_MAX, type LandingFaqLayout } from "@/lib/domain";
import { type ReactNode } from "react";
import { ArrowSquareOut, Plus, Trash } from "@phosphor-icons/react";
import { namaKelompokFaq } from "@/lib/landing-faq";
import { LANDING_UI } from "@/lib/landing-i18n";
import { BentukBingkai } from "../urutan-pembicara";
import { PilihWarna } from "./editor-bantu";
import type { useLandingCmsPage0 } from "./editor-0";
import type { useLandingCmsPage1 } from "./editor-1";

/** Bagian 4 dari 6 badan LandingCmsPage, dipindah apa adanya (audit platform, Fase 3). */
export function useLandingCmsPage3(c: Awaited<ReturnType<typeof useLandingCmsPage0>> & Awaited<ReturnType<typeof useLandingCmsPage1>>) {
  const { KOSONG_BAWAAN, TEKS_BAWAAN, belumDiterjemahkan, busy, facts, formInherit, formSeed, forum, gathering, hanyaFormulir, judulBagian, kontakPanitiaAdmin, landing, lembaga, modern, pembicaraIsi, pilihBahasa, pratinjauPreset, sesiPerluDipilih, setBagian, setFormInherit, setFormSeed, setLanding, setPratinjauPreset } = c;
  // ---- Tema ----------------------------------------------------------------------
  // Grup Page di tab Theme. "What /e/… shows" tinggal di Theme, bukan Page
  // sections: Hanya formulir menyembunyikan tab Page sections, dan kontrol yang
  // menyembunyikan tabnya sendiri tidak bisa dibatalkan dari sana.
  const isiHalamanTema = (
    <>
      <Kelompok title={`What /e/${facts?.slug ?? "slug"} shows`} first>
        <SegmentedButton<"halaman" | "formulir">
          className="w-full"
          label={`What /e/${facts?.slug ?? "slug"} shows`}
          value={hanyaFormulir ? "formulir" : "halaman"}
          onChange={(value) => {
            setLanding({ ...landing, tayang: value === "formulir" ? "formulir" : undefined });
            // Tab yang dipilih memang Tema, bukan hanya jatuh ke sana: kembali ke
            // Halaman acara tidak boleh melempar admin ke Susunan halaman dan
            // menghilangkan kontrol yang baru ia klik.
            setBagian("tema");
          }}
          options={[
            { value: "halaman", label: "Event page" },
            { value: "formulir", label: "Form only" },
          ]}
        />
        <p className="text-body-medium text-on-surface-variant">
          {hanyaFormulir
            ? "No event page: this address opens the registration form directly. The logo, main image, colours and fonts below still apply to the form and the participant sign-in page."
            : "An event page with a register button that leads to the form. Arrange its content in Page sections."}
        </p>
      </Kelompok>

      {/* Gathering: KV tidak tampil di halaman, tetapi tetap dipakai di luar
          halaman. Disebut menurut gunanya, bukan "Hero image". */}
      {gathering ? (
        <Kelompok title="Sharing image">
          <ImageUploadField
            label="Link preview image"
            kind="landing"
            fit="cover"
            previewClassName="h-20 w-36"
            hint="The picture WhatsApp, LinkedIn and others show when the event link is shared. Also used at the top of the registration form, as the header of the confirmation email while it has no saved template, and as the badge background when a badge uses the KV. Not shown on the gathering page itself. Landscape, at least 1200×630. PNG, JPG or WebP, up to 5 MB."
            value={landing.banner_url ?? null}
            onChange={(url) => setLanding({ ...landing, banner_url: url })}
            disabled={busy}
          />
        </Kelompok>
      ) : null}

      {/* Versi English. Teks English-nya diisi per kolom; sampai mode EN di
          editor ada, lewat Ekspor/Impor (kunci `en`, lihat landing-i18n.ts). */}
      <Kelompok title="Language">
        <Switch
          // Di luar Modern tampil mati walau tersimpan menyala: halaman tata
          // letak lain memang tidak punya versi English (landingEnAvailable).
          checked={modern && Boolean(landing.en_enabled)}
          onChange={(value) => setLanding({ ...landing, en_enabled: value })}
          disabled={!modern}
          label="English version"
          description={
            !modern
              ? landing.en_enabled
                ? `Modern layout only. The English version is kept and comes back when Modern is chosen again${landing.default_lang === "en" ? ", including English as the main language" : ""}.`
                : "Modern layout only."
              : landing.en_enabled
                ? "An ID | EN switch shows in the page's top bar."
                : "While off, the page is in Indonesian only and the /en address doesn't open."
          }
        />
        {modern && landing.en_enabled ? (
          <div className="flex flex-col gap-2">
            <p id="label-bahasa-utama" className="text-body-medium font-medium text-on-surface">Main language</p>
            <SegmentedButton<"id" | "en">
              className="w-full"
              label="Main language"
              labelledBy="label-bahasa-utama"
              value={landing.default_lang ?? "id"}
              onChange={(value) => setLanding({ ...landing, default_lang: value })}
              options={[
                { value: "id", label: "Indonesian" },
                { value: "en", label: "English" },
              ]}
            />
            <p className="text-body-medium text-on-surface-variant">
              {(landing.default_lang ?? "id") === "en"
                ? `/e/${facts?.slug ?? "slug"} shows in English. The Indonesian version is at /e/${facts?.slug ?? "slug"}/id.`
                : `/e/${facts?.slug ?? "slug"} shows in Indonesian. The English version is at /e/${facts?.slug ?? "slug"}/en.`}{" "}
              The address on invitations and QR codes stays the same.
              {(landing.default_lang ?? "id") === "en"
                ? " Visitors who scan the QR code or open an invitation link see the English version first. /en links already shared redirect to the main address."
                : null}
            </p>
          </div>
        ) : null}
        {modern && belumDiterjemahkan > 0 ? (
          <p className="text-body-medium text-on-surface-variant">
            {plural(belumDiterjemahkan, "text")} not translated yet. The English page shows the Indonesian text instead.{" "}
            <button type="button" onClick={() => pilihBahasa("en")} className="rounded-sm font-medium text-primary hover:underline">
              Translate in Page sections
            </button>
          </p>
        ) : null}
      </Kelompok>

      {forum ? (
        <Kelompok title="Label language" note="For the menu, section headings and default buttons. Content you write is shown as typed.">
          <SegmentedButton<"id" | "en">
            className="w-full"
            label="Label language"
            value={landing.forum?.language ?? "id"}
            onChange={(language) => setLanding({ ...landing, forum: { ...landing.forum, language } })}
            options={[
              { value: "id", label: "Indonesian" },
              { value: "en", label: "English" },
            ]}
          />
        </Kelompok>
      ) : null}
    </>
  );

  const isiTema = (
    <TabTema
      landing={landing}
      setLanding={setLanding}
      nama={landing.public_name?.trim() || facts?.name || "Nama acara"}
      contohIsi={facts?.tagline?.trim() || "Join us for two days of talks and conversations."}
      pratinjau={pratinjauPreset}
      onPratinjau={(key) => {
        setPratinjauPreset(key);
        // Di bawah lg pratinjau berdiri di atas panel, di luar layar: bawa ke sana
        // supaya perubahan preset terlihat (QA #90 L5).
        if (key && !window.matchMedia("(min-width: 1024px)").matches) {
          document.getElementById("pratinjau-acara")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }}
      formInherit={formInherit}
      setFormInherit={setFormInherit}
      formSeed={formSeed}
      setFormSeed={setFormSeed}
      PilihWarna={PilihWarna}
      halaman={isiHalamanTema}
      ringkasHalaman={[hanyaFormulir ? "Form only" : "Event page", modern && landing.en_enabled ? "ID + EN" : forum && landing.forum?.language === "en" ? "EN labels" : null, gathering ? (landing.banner_url ? "Link preview image" : "No link preview image") : null].filter(Boolean).join(" · ")}
    />
  );

  // ---- Bagian --------------------------------------------------------------------
  function editorBagian(id: LandingSectionId): ReactNode {
    switch (id) {
      case "highlights": {
        const list = landing.highlights ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, highlights: next });
        return (
          <div className="flex flex-col gap-3">
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">No key figures yet.</p> : null}
            {list.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <TextField
                  className="min-w-0 flex-1"
                  label="Label"
                  placeholder="e.g. Peserta"
                  value={item.label}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], label: event.target.value }; setList(next); }}
                />
                <TextField
                  className="w-24"
                  label="Figure"
                  value={item.value}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], value: event.target.value }; setList(next); }}
                />
                <IconButton size="sm" label={`Delete figure ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                  <Trash size={16} />
                </IconButton>
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { label: "", value: "" }])}>Add figure</Button>
            </div>
          </div>
        );
      }
      case "faq": {
        const list = landing.faq ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, faq: next });
        // Tampilan dan Topik hanya dirender tata letak Modern; Daftar baru memakai Topik.
        const tampilanFaq: LandingFaqLayout = modern ? landing.faq_layout ?? "cards" : "cards";
        const pakaiTopik = tampilanFaq === "list";
        const namaTopik = namaKelompokFaq(list);
        return (
          <div className="flex flex-col gap-3">
            {modern ? (
              <div className="flex flex-col gap-2">
                <p id="label-tampilan-faq" className="text-body-medium font-medium text-on-surface">Layout</p>
                <SegmentedButton<LandingFaqLayout>
                  className="w-full"
                  label="FAQ layout"
                  labelledBy="label-tampilan-faq"
                  value={tampilanFaq}
                  onChange={(faq_layout) => setLanding({ ...landing, faq_layout: faq_layout === "cards" ? undefined : faq_layout })}
                  options={LANDING_FAQ_LAYOUTS.map((value) => ({ value, label: LANDING_FAQ_LAYOUT_LABELS[value] }))}
                />
                <p className="text-body-small text-on-surface-variant">
                  {pakaiTopik
                    ? "Rows with dividers, all closed. Give questions a topic to group them under a heading; with two topics or more, wide screens also list the topics beside the questions."
                    : "Each question on its own card, the first one open. Suits up to about five questions; for more, choose List."}
                </p>
              </div>
            ) : null}
            {pakaiTopik && namaTopik.length ? <datalist id="faq-topik-saran">{namaTopik.map((nama) => <option key={nama} value={nama} />)}</datalist> : null}
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">No questions yet.</p> : null}
            {list.map((item, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
                {pakaiTopik ? (
                  <TextField
                    label="Topic"
                    optional
                    list="faq-topik-saran"
                    maxLength={FAQ_GROUP_MAX}
                    placeholder="e.g. Travel & hotel"
                    hint={index === 0 ? "Questions with the same topic show together, in the order of their first question. Leave empty for no heading." : undefined}
                    value={item.group ?? ""}
                    onChange={(event) => { const next = [...list]; next[index] = { ...next[index], group: event.target.value || undefined }; setList(next); }}
                  />
                ) : null}
                <div className="flex items-end gap-2">
                  <TextField
                    className="min-w-0 flex-1"
                    label="Question"
                    value={item.q}
                    onChange={(event) => { const next = [...list]; next[index] = { ...next[index], q: event.target.value }; setList(next); }}
                  />
                  <IconButton size="sm" label={`Delete question ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                    <Trash size={16} />
                  </IconButton>
                </div>
                <TextArea
                  label="Answer"
                  rows={3}
                  value={item.a}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], a: event.target.value }; setList(next); }}
                />
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { q: "", a: "" }])}>Add question</Button>
            </div>
            {judulBagian(
              "faq",
              { judul: LANDING_UI.id.faqHeading, jenis: "default", hint: KOSONG_BAWAAN },
              <TextArea
                data-kolom="faq_intro"
                className={TEKS_BAWAAN}
                label="Intro"
                optional
                rows={2}
                placeholder={LANDING_UI.id.faqIntro}
                hint="If the Contact section is shown, the sentence “Hubungi panitia…” is added after it."
                maxLength={LANDING_SECTION_TEXT_MAX.intro}
                counter
                value={landing.faq_intro ?? ""}
                onChange={(event) => setLanding({ ...landing, faq_intro: event.target.value })}
              />,
            )}
          </div>
        );
      }
      case "speakers": {
        // Orangnya (foto, jabatan, sesi, urutan per tab) disunting di halaman
        // Speakers: 24 kartu bertumpuk tidak muat di panel ini. Di sini tinggal
        // setelan tampilan bagian ini.
        const list = landing.speakers ?? [];
        return (
          <div className="flex flex-col gap-3">
            <p className="text-body-medium text-on-surface-variant">
              {pembicaraIsi.length
                ? `${plural(pembicaraIsi.length, "speaker")}${sesiPerluDipilih > 0 ? `, ${sesiPerluDipilih} with a session to choose again` : ""}. People, photos, sessions and their order per tab are edited on the Speakers page. The preview updates when you come back to this tab.`
                : "No speakers yet. Add them on the Speakers page. The preview updates when you come back to this tab."}
            </p>
            <div>
              {facts ? (
                <ButtonLink href={`/e/${facts.slug}/admin/speakers`} target="_blank" rel="noreferrer" variant="outlined" size="sm" icon={<ArrowSquareOut size={16} />}>
                  {pembicaraIsi.length ? `Manage speakers (${pembicaraIsi.length})` : "Add speakers"}
                </ButtonLink>
              ) : null}
            </div>
            {list.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p id="label-bingkai-foto" className="text-body-medium font-medium text-on-surface">Photo frame</p>
                <SegmentedButton<LandingSpeakerFrame>
                  className="w-full"
                  label="Photo frame"
                  labelledBy="label-bingkai-foto"
                  value={modern ? landing.speaker_frame ?? "portrait" : "portrait"}
                  onChange={(speaker_frame) => setLanding({ ...landing, speaker_frame: speaker_frame === "portrait" ? undefined : speaker_frame })}
                  options={LANDING_SPEAKER_FRAMES.map((value) => ({ value, label: LANDING_SPEAKER_FRAME_LABELS[value], icon: <BentukBingkai bentuk={value} />, disabled: !modern }))}
                />
                <p className="text-body-small text-on-surface-variant">
                  {modern
                    ? "For the speaker cards. Portrait and Arch follow Theme › Corners; Circle doesn't. Agenda photos stay round."
                    : forum
                      ? "Forum keeps the photo shape of its own design. Switch to the Modern layout to choose a frame."
                      : "Editorial shows small round photos. Switch to the Modern layout to choose a frame."}
                </p>
              </div>
            ) : null}
            {judulBagian(
              "speakers",
              lembaga >= 3
                ? { judul: LANDING_UI.id.speakersFrom(pembicaraIsi.length, lembaga), jenis: "automatic (count)", hint: "Leave empty to use the number of speakers and organisations." }
                : { judul: LANDING_SECTION_LABELS.speakers, jenis: "default", hint: "Leave empty for the default text. From three organisations on, the speaker count is used." },
            )}
          </div>
        );
      }
      case "sponsors": {
        const list = landing.sponsors ?? [];
        return (
          <div className="flex flex-col gap-3">
            <p className="text-body-medium text-on-surface-variant">Shown as an even grid, whatever the upload order.</p>
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">No sponsors yet.</p> : null}
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
                  label="Name"
                  optional
                  hint="Alt text for the image, not shown on the page."
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
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setLanding({ ...landing, sponsors: [...list, { logo_url: "" }] })}>Add sponsor</Button>
            </div>
          </div>
        );
      }
      case "contact":
        return (
          // Kontak panitia diisi sekali di Event settings dan dipakai juga di
          // halaman daftar, undangan, dan dashboard peserta. Di sini hanya
          // ringkasannya; bagian ini tetap dinyalakan/dimatikan di daftar bagian.
          <div className="flex flex-col gap-2 text-body-medium">
            <p className="text-on-surface-variant">Filled in once under Event settings, up to five contacts. The first one also shows on the registration, invitation and participant pages.</p>
            {kontakPanitiaAdmin.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-on-surface">
                {kontakPanitiaAdmin.map((baris, i) => <li key={i} className="[overflow-wrap:anywhere]">{baris}</li>)}
              </ul>
            ) : (
              <p className="text-on-surface-variant">No organiser contact yet.</p>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  const JUMLAH: Partial<Record<LandingSectionId, number>> = {
    highlights: (landing.highlights ?? []).length,
    speakers: (landing.speakers ?? []).length,
    faq: (landing.faq ?? []).length,
    sponsors: (landing.sponsors ?? []).length,
  };
  return { isiHalamanTema, isiTema, editorBagian, JUMLAH };
}
