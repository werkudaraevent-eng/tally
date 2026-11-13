"use client";

import { BagianEn, BlockEditorEn } from "../editor-en";
import { LANDING_SECTION_ADMIN_LABELS, LANDING_BLOCK_LABELS, landingBlockMemberOnly, isLandingBlockId, landingBlockHasContent, normalizeLandingSections, isPortalEntry, type LandingSectionId } from "@/lib/domain";
import { Eye, EyeSlash, Plus, Trash } from "@phosphor-icons/react";
import { ForumSusunan } from "../forum-editor";
import { Banner, Button, FilterChip, PaneBody, Pane, SegmentedButton, Tabs } from "@/components/m3";
import { BlockEditor, ringkasanBlok, TambahBlokDialog } from "../blocks";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { MenuBlok } from "../menu-blok";
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { tulisLokal } from "@/lib/local-store";
import { Bagian, PANEL_MAX, PANEL_MIN, TAJUK_KELOMPOK, gulirKeBaris, jepitPanel, tampilkanKolom } from "./editor-bantu";
import type { useLandingCmsPage0 } from "./editor-0";
import type { useLandingCmsPage1 } from "./editor-1";
import type { useLandingCmsPage2 } from "./editor-2";
import type { useLandingCmsPage3 } from "./editor-3";
import type { useLandingCmsPage4 } from "./editor-4";

/** Bagian 6 dari 6 badan LandingCmsPage, dipindah apa adanya (audit platform, Fase 3). */
export function useLandingCmsPage5(c: Awaited<ReturnType<typeof useLandingCmsPage0>> & Awaited<ReturnType<typeof useLandingCmsPage1>> & Awaited<ReturnType<typeof useLandingCmsPage2>> & Awaited<ReturnType<typeof useLandingCmsPage3>> & Awaited<ReturnType<typeof useLandingCmsPage4>>) {
  const { agendaAktif, bagian, bahasa, barisKurangEn, barisSusunan, belumDiterjemahkan, bilahPratinjau, blokById, blokTersembunyi, busy, editorBagian, facts, forum, gathering, gulirTerakhir, hanyaFormulir, horizon, idSesiDipakai, isiBawaan, isiKaki, isiPembuka, isiPortal, isiTema, jumlahTersembunyi, konfirmasiHapus, kunciPanel, landing, lebarPanel, lencanaRundown, menuBaris, modeEn, modern, patchFacts, pilihBahasa, presetDilihat, rundownEn, rundownKosong, sectionHasContent, sections, sesiPerluDipilih, setBagian, setKonfirmasiHapus, setLanding, setLebarSeret, setPratinjauPreset, setSisipSesudah, setSorot, setTambahTerbuka, setTampil, setTampilTersembunyi, setTerbuka, setUrungan, sisipSesudah, subBawaan, tambahBlok, tambahTerbuka, tampilTersembunyi, tempatTetap, terapkanPratinjau, terbuka, tokensHero, ubahBlok, ubahRundown, ubinRute, urungan, warnaHalaman } = c;
  // Mode EN: baris yang sama dalam urutan yang sama, tetapi hanya yang tampil di
  // halaman, tanpa seret, mata, dan menu; isinya kolom English (editor-en.tsx).
  const isiSusunanEn = facts ? (
    <div className="flex flex-col">
      <ol className="flex flex-col">
        {barisSusunan({ id: "pembuka", nomor: 1, judul: "Hero", sub: gathering ? "Event name, title, buttons" : "Event name, tagline, register button", titik: barisKurangEn.has("pembuka"), isi: <BagianEn id="pembuka" landing={landing} facts={facts} setLanding={setLanding} /> })}
        {sections.map((section, index) => {
          // Bagian tersembunyi tidak perlu diterjemahkan, kecuali yang sedang
          // dibuka: Simpan membukanya bila teks English-nya melewati batas
          // (hanya bisa terjadi lewat Impor).
          if (!section.enabled && terbuka !== section.id) return null;
          // Portal peserta juga tampil di /en; teksnya tetap dan sudah berbahasa Inggris (QA #109 L5).
          // Horizon: teks yang diubah di versi Indonesia ditanya terjemahannya.
          if (isPortalEntry(section)) {
            if (landing.member?.enabled !== true || landing.portal_section === false) return null;
            const teksPortalDiubah = horizon && [landing.portal_eyebrow, landing.portal_heading, landing.portal_note, landing.portal_button_label].some((teks) => teks?.trim());
            return barisSusunan({
              id: "portal",
              nomor: index + 2,
              judul: "Portal peserta",
              sub: teksPortalDiubah ? "Your text" : "Automatic · fixed English text",
              titik: barisKurangEn.has("portal"),
              isi: teksPortalDiubah ? <BagianEn id="portal" landing={landing} facts={facts} setLanding={setLanding} /> : <p className="text-body-medium text-on-surface-variant">This section has fixed text in both languages, so there is nothing to translate.</p>,
            });
          }
          if (isLandingBlockId(section.id)) {
            const blok = blokById.get(section.id);
            if (!blok) return null;
            const jenis = LANDING_BLOCK_LABELS[blok.type];
            return barisSusunan({
              id: section.id,
              nomor: index + 2,
              judul: blok.heading?.trim() || blok.name?.trim() || jenis,
              sub: jenis,
              titik: barisKurangEn.has(section.id),
              isi: <BlockEditorEn block={blok} onChange={ubahBlok} />,
            });
          }
          const id: LandingSectionId = section.id;
          return barisSusunan({
            id,
            nomor: index + 2,
            judul: LANDING_SECTION_ADMIN_LABELS[id],
            sub: subBawaan(id),
            titik: barisKurangEn.has(id),
            isi: <BagianEn id={id} landing={landing} facts={facts} setLanding={setLanding} rundown={rundownEn} ubahRundown={ubahRundown} sesiRundown={agendaAktif ? [] : (rundownEn ?? []).filter((baris) => idSesiDipakai.has(baris.id))} />,
          });
        })}
        {barisSusunan({ id: "kaki", nomor: sections.length + 2, judul: "Footer", sub: horizon ? "Organiser line, closing band" : "Organiser line, call-to-action banner", titik: barisKurangEn.has("kaki"), isi: <BagianEn id="kaki" landing={landing} facts={facts} setLanding={setLanding} /> })}
      </ol>
    </div>
  ) : null;

  function barisTetap(id: LandingSectionId, tempat: "kaki" | "tentang") {
    if (tempatTetap(id) !== tempat) return null;
    const index = sections.findIndex((section) => section.id === id);
    if (index < 0) return null;
    const section = sections[index];
    if (!section.enabled && !tampilTersembunyi && terbuka !== id) return null;
    const judul = LANDING_SECTION_ADMIN_LABELS[id];
    const berisi = sectionHasContent(id);
    return barisSusunan({
      id,
      nomor: index + 2,
      judul,
      sub: subBawaan(id),
      lencana: section.enabled && berisi === false ? "No content yet" : null,
      saklar: { checked: section.enabled, onChange: (value: boolean) => setTampil(index, value) },
      menu: [{ label: section.enabled ? "Hide" : "Show", icon: section.enabled ? <EyeSlash size={18} /> : <Eye size={18} />, onSelect: () => setTampil(index, !section.enabled) }],
      isi: isiBawaan(id),
    });
  }

  const isiSusunan = facts && forum ? (
    <ForumSusunan
      landing={landing}
      setLanding={setLanding}
      facts={facts}
      patchFacts={patchFacts}
      busy={busy}
      baris={barisSusunan}
      isiPembicara={editorBagian("speakers")}
      rundownKosong={rundownKosong}
      lencanaRundown={lencanaRundown}
      tampilTersembunyi={tampilTersembunyi}
    />
  ) : facts ? (
    <div className="flex flex-col">
      {!modern ? (
        <div className="px-4 py-2">
          <Banner tone="info">Extra blocks show only in the Modern layout. Choose Modern in the Theme tab to use them.</Banner>
        </div>
      ) : null}
      <ol className="flex flex-col">
        {/* Tajuk kelompok: menjelaskan kenapa Hero dan Footer tidak bisa diseret.
            aria-hidden: pembaca layar mendengar daftarnya, bukan tajuknya. */}
        {terbuka === null ? <li aria-hidden className={TAJUK_KELOMPOK}>Top of page</li> : null}
        {barisSusunan({ id: "pembuka", nomor: 1, judul: "Hero", sub: horizon ? "Top bar, title, button, hero image" : gathering ? "Top bar, title, portal preview, buttons" : modern ? "Top bar, event name, tagline, KV, register button" : "Event name, tagline, KV, register button", isi: isiPembuka })}
        {terbuka === null ? <li aria-hidden className={TAJUK_KELOMPOK}>Page content</li> : null}
        {sections.map((section, index) => {
          // Blok khusus peserta tidak tampil di halaman ini; matanya ada di
          // Participant area > Participant home, jadi tidak ikut disaring di sini.
          const blokPeserta = isLandingBlockId(section.id) && blokById.get(section.id);
          const khususPeserta = Boolean(blokPeserta && landingBlockMemberOnly(blokPeserta));
          // Baris yang sedang terbuka tetap ada walau Show on-nya baru diganti.
          if (!section.enabled && !tampilTersembunyi && !khususPeserta && terbuka !== section.id) return null;
          const saklar = { checked: section.enabled, onChange: (value: boolean) => setTampil(index, value) };

          // Bagian otomatis gaya gathering: isinya tetap, tempatnya bisa digeser,
          // dan tetap terdaftar saat Participant area tutup supaya bisa ditemukan.
          if (isPortalEntry(section)) {
            const tampilPortal = landing.portal_section !== false;
            if (!tampilPortal && !tampilTersembunyi) return null;
            return barisSusunan({
              id: "portal",
              nomor: index + 2,
              judul: "Portal peserta",
              sub: "Automatic · what guests find after signing in",
              lencana: tampilPortal && landing.member?.enabled !== true ? "Participant area closed" : null,
              saklar: { checked: tampilPortal, onChange: (value: boolean) => setTampil(index, value) },
              indeks: index,
              menu: menuBaris(index, "Portal peserta"),
              isi: isiPortal,
            });
          }

          if (isLandingBlockId(section.id)) {
            const blok = blokById.get(section.id);
            if (!blok) return null;
            const jenis = LANDING_BLOCK_LABELS[blok.type];
            const ringkas = ringkasanBlok(blok);
            const judul = blok.heading?.trim() || blok.name?.trim() || jenis;
            return barisSusunan({
              id: section.id,
              nomor: index + 2,
              judul,
              sub: [jenis, ringkas && ringkas !== judul ? ringkas : null, khususPeserta ? "Participant page only" : null].filter(Boolean).join(" · "),
              lencana: (section.enabled || khususPeserta) && !landingBlockHasContent(blok) ? "No content yet" : null,
              saklar: khususPeserta ? undefined : saklar,
              indeks: index,
              menu: menuBaris(index, judul, blok),
              isi: <BlockEditor block={blok} onChange={ubahBlok} semuaBlok={landing.blocks ?? []} warnaHalaman={warnaHalaman} warnaTema={{ brand: tokensHero.brand, accent: tokensHero.accent ?? null }} ubinRute={ubinRute} />,
            });
          }

          const id: LandingSectionId = section.id;
          // Bagian yang di layout ini tidak mengikuti urutan halaman tidak ikut
          // diseret di Page content: ia tampil di tempat tetapnya (lihat tempatTetap).
          if (tempatTetap(id)) return null;
          const berisi = sectionHasContent(id);
          const kosong = section.enabled && (berisi === false || (id === "agenda" && rundownKosong));
          const baris = barisSusunan({
            id,
            nomor: index + 2,
            judul: LANDING_SECTION_ADMIN_LABELS[id],
            sub: subBawaan(id),
            lencana: kosong ? (id === "agenda" ? lencanaRundown : "No content yet") : null,
            titik: id === "speakers" && sesiPerluDipilih > 0 ? "Some speaker sessions need to be chosen again." : false,
            // Isinya disunting di modul lain (CLAUDE.md: "Edit in Agenda ↗"); tab baru, supaya draf di sini tidak hilang.
            sumber: id === "agenda" ? { label: "Agenda", href: `/e/${facts.slug}/admin/rundown` } : id === "speakers" ? { label: "Speakers", href: `/e/${facts.slug}/admin/speakers` } : undefined,
            saklar,
            indeks: index,
            menu: menuBaris(index, LANDING_SECTION_ADMIN_LABELS[id]),
            isi: isiBawaan(id),
          });
          // Angka kunci Modern tampil di dalam About: barisnya tepat di bawah About.
          return id === "about" ? [baris, barisTetap("highlights", "tentang")] : baris;
        })}
        {terbuka === null ? <li aria-hidden className={TAJUK_KELOMPOK}>Bottom of page</li> : null}
        {barisSusunan({
          id: "kaki",
          nomor: sections.length + 2,
          judul: "Footer",
          sub: horizon ? "Organiser line, closing band" : modern ? "Organiser line, call-to-action banner" : "Organiser line",
          isi: isiKaki,
        })}
        {barisTetap("sponsors", "kaki")}
        {barisTetap("contact", "kaki")}
      </ol>
      {terbuka === null ? (
        // Menempel di kaki panel: menambah blok tidak perlu menggulir melewati semua baris.
        // -bottom-40: bidang gulir Sections punya pb-40 (ruang toast galat), dan
        // sticky dihitung dari dalam padding itu; tanpanya bilah melayang 160 px di atas kaki.
        <div className="sticky -bottom-40 z-10 flex items-center gap-3 border-t border-outline-variant bg-surface-container-lowest px-4 py-3">
          <Button variant="outlined" icon={<Plus size={18} />} onClick={() => { setSisipSesudah(null); setTambahTerbuka(true); }} disabled={(landing.blocks ?? []).length >= 30}>
            Add block
          </Button>
          <span className="min-w-0 truncate text-body-small text-on-surface-variant max-sm:hidden">or ⋯ › Add block below on any row</span>
        </div>
      ) : null}
      <TambahBlokDialog open={tambahTerbuka} onClose={() => { setTambahTerbuka(false); setSisipSesudah(null); }} onPick={(type) => { const id = tambahBlok(type); gulirKeBaris(id); }} tujuan={sisipSesudah?.judul ?? null} />
    </div>
  ) : null;

  // Satu baris di atas daftar: petunjuk singkat, lalu penyaring tersembunyi bila
  // memang ada yang tersembunyi. Tidak bergulir, supaya penyaringnya selalu terjangkau.
  // Modern: pilihan ID | EN di depan. Mode EN tidak punya penyaring tersembunyi
  // (hanya bagian yang tampil yang perlu diterjemahkan); gantinya jumlah teks
  // yang belum diterjemahkan.
  const pilihanBahasa = modern ? (
    <SegmentedButton<"id" | "en">
      label="Language being edited"
      value={bahasa}
      onChange={pilihBahasa}
      className="w-24 shrink-0"
      options={[{ value: "id", label: "ID" }, { value: "en", label: "EN" }]}
    />
  ) : null;
  const saringan = bagian !== "susunan" ? null : modeEn ? (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-outline-variant pl-3 pr-2">
      {pilihanBahasa}
      <p role="status" className={cx("min-w-0 flex-1 truncate text-body-small", belumDiterjemahkan > 0 ? "font-medium text-on-warning-soft" : "text-on-surface-variant")}>
        {belumDiterjemahkan > 0 ? `${plural(belumDiterjemahkan, "text")} not translated yet` : "All text translated"}
      </p>
    </div>
  ) : (
    <div className={cx("flex h-12 shrink-0 items-center gap-1 border-b border-outline-variant pr-2", pilihanBahasa ? "pl-3" : "pl-4")}>
      {pilihanBahasa}
      {/* Dengan pilihan ID | EN, petunjuknya tidak muat di panel 440: ia
          disembunyikan, dan ruangnya hanya mendorong penyaring ke kanan. */}
      <p
        className={cx("min-w-0 flex-1 truncate text-body-small text-on-surface-variant max-sm:hidden", pilihanBahasa && "invisible")}
        title={
          forum
            ? "The Forum layout has a fixed section order. Click a row to edit it; the preview moves to the page with that section. The eye button hides a section without deleting its content."
            : "The order here matches the page, top to bottom. Click a row to edit it; the preview jumps to that section. Drag the handle on the left of a row to move it."
        }
      >
        Click a row to edit
      </p>
      {jumlahTersembunyi > 0 ? (
        <>
          <FilterChip selected={tampilTersembunyi} onClick={() => setTampilTersembunyi((nilai) => !nilai)} className="shrink-0">
            Show {jumlahTersembunyi} hidden
          </FilterChip>
          {/* Forum tidak punya blok tambahan, jadi tidak ada yang bisa dihapus massal. */}
          {forum ? null : <MenuBlok
            label="Hidden blocks menu"
            width={272}
            items={[{
              label: blokTersembunyi.length > 0 ? `Delete ${plural(blokTersembunyi.length, "hidden block")}…` : "No blocks to delete",
              icon: <Trash size={18} />,
              bahaya: true,
              disabled: blokTersembunyi.length === 0,
              onSelect: () => setKonfirmasiHapus({ ids: blokTersembunyi, judul: "" }),
            }]}
          />}
        </>
      ) : null}
    </div>
  );

  const panel = (
    // overflow-visible di bawah lg: `overflow-hidden` bawaan Pane memutus
    // sticky bilah pratinjau dari gulir halaman.
    <Pane as="aside" id="panel-setelan" aria-label="Event page settings" className="max-lg:overflow-visible">
      {/* Tabs, bukan SegmentedButton: isinya berganti (DESIGN.md "Primitif"). */}
      <Tabs<Bagian>
        label="Settings tabs"
        idPrefix="isi-setelan"
        value={bagian}
        onChange={setBagian}
        className="px-3"
        options={[
          ...(hanyaFormulir ? [] : [{ value: "susunan" as const, label: "Sections" }]),
          { value: "tema", label: "Theme" },
        ]}
      />
      {/* Satu tabpanel memuat baris saringan dan isinya, supaya Tab sesudah
          daftar tab langsung masuk ke panel yang dipilih (pola tabs WAI-ARIA). */}
      <div id={`isi-setelan-panel-${bagian}`} role="tabpanel" aria-labelledby={`isi-setelan-tab-${bagian}`} className="flex min-h-0 flex-1 flex-col">
        {saringan}
        {/* Bilah konteks pratinjau preset berdiri di luar bidang gulir, tepat di
            bawah tab: tidak ada celah dari padding bidang gulir dan tidak ada isi
            yang terlihat di atasnya. Di bawah lg halamannya yang bergulir, jadi
            bilah menempel di bawah bilah atas aplikasi agar Cancel dan Apply
            tetap terjangkau saat kartu preset digulir. */}
        {presetDilihat ? (
          <div ref={bilahPratinjau} className="z-10 flex shrink-0 items-center gap-2 border-b border-outline-variant bg-primary-soft px-4 py-2 max-lg:sticky max-lg:top-(--topbar-height)" role="status">
            <p className="min-w-0 flex-1 truncate text-body-medium text-on-surface" title="Not applied yet">
              Previewing <b className="font-semibold">{presetDilihat.label}</b>
            </p>
            <Button variant="text" size="sm" onClick={() => setPratinjauPreset(null)}>Cancel</Button>
            <Button size="sm" onClick={terapkanPratinjau}>Apply</Button>
          </div>
        ) : null}
        {/* scroll-pt: field yang difokus dengan Tab tidak boleh tertutup kepala baris yang menempel (72px).
            Tema dan Peserta bisa dimulai dengan teks biasa, jadi bidang gulirnya sendiri
            ikut menerima fokus agar bisa digulir dengan papan ketik. */}
        <PaneBody
          key={`${bagian}-${modeEn ? "en" : "id"}`}
          tabIndex={bagian === "susunan" ? undefined : 0}
          role={bagian === "susunan" ? undefined : "group"}
          aria-labelledby={bagian === "susunan" ? undefined : `isi-setelan-tab-${bagian}`}
          // eslint-disable-next-line react-hooks/immutability -- ref dari useRef di bagian sebelumnya, dioper lewat argumen hook
          onScroll={(event) => { gulirTerakhir.current = event.currentTarget.scrollTop; }}
          // `!`: aturan :focus-visible global tidak berlapis, jadi mengalahkan utilitas biasa.
          // pb-40 di Susunan: kolom terbawah tetap bisa digulir ke atas toast galat.
          // max-lg: di bawah lg halaman yang menggulir, bukan panel ini; tanpa
          // overflow-visible bilah drill-in tidak bisa menempel (QA #358 M2).
          className={bagian === "susunan" ? "scroll-pt-22 pb-40 max-lg:overflow-visible!" : "px-4 py-4 focus-visible:shadow-none! focus-visible:-outline-offset-2!"}>
          {bagian === "susunan" ? (modeEn ? isiSusunanEn : isiSusunan) : isiTema}
        </PaneBody>
      </div>
    </Pane>
  );

  /* ---- Pembatas panel ---------------------------------------------------- */
  // Diseret dengan penunjuk atau digeser dengan panah. Nilainya lebar PANEL
  // setelan, jadi panah kiri (pembatas bergerak ke kiri) melebarkannya.
  const awalSeret = useRef<{ x: number; lebar: number } | null>(null);

  function simpanLebar(lebar: number) {
    const nilai = jepitPanel(lebar);
    if (kunciPanel) {
      tulisLokal(kunciPanel, nilai);
      setLebarSeret(null);
    } else {
      setLebarSeret(nilai);
    }
  }

  function mulaiSeretPanel(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    awalSeret.current = { x: event.clientX, lebar: lebarPanel };
  }

  function seretPanel(event: PointerEvent<HTMLDivElement>) {
    const awal = awalSeret.current;
    if (!awal) return;
    setLebarSeret(jepitPanel(awal.lebar + (awal.x - event.clientX)));
  }

  function lepasPanel() {
    if (!awalSeret.current) return;
    awalSeret.current = null;
    simpanLebar(lebarPanel);
  }

  function tombolPanel(event: KeyboardEvent<HTMLDivElement>) {
    const langkah = event.shiftKey ? 64 : 16;
    const target =
      event.key === "ArrowLeft" ? lebarPanel + langkah
        : event.key === "ArrowRight" ? lebarPanel - langkah
          : event.key === "Home" ? PANEL_MIN
            : event.key === "End" ? PANEL_MAX
              : null;
    if (target === null) return;
    event.preventDefault();
    simpanLebar(target);
  }

  // Snackbar "Urungkan" hilang sendiri. 8 detik: cukup untuk membaca dan menekan,
  // tidak cukup lama untuk menutupi baris terbawah panel sepanjang sesi.
  useEffect(() => {
    if (!urungan) return;
    const timer = window.setTimeout(() => setUrungan(null), 8000);
    return () => window.clearTimeout(timer);
  }, [urungan, setUrungan]);

  // Klik di pratinjau memilih baris Susunan halaman (pilih-bagian.ts). Nama
  // baris sama dengan di daftar; kolom `bagian:kolom` sama dengan data-sunting
  // di halaman publik. Forum punya editor dan nama bagian sendiri: belum ikut.
  // Editorial belum menandai bagiannya (QA #108 L3): hanya Modern dan Gathering.
  const kunciLabel = !modern || hanyaFormulir || bagian !== "susunan"
    ? ""
    : JSON.stringify([
        ["pembuka", "Hero"],
        ...normalizeLandingSections(sections, landing.blocks).filter((section) => section.enabled).map((section) => [
          section.id,
          isLandingBlockId(section.id)
            ? (() => {
                const blok = blokById.get(section.id);
                return blok ? blok.heading?.trim() || blok.name?.trim() || LANDING_BLOCK_LABELS[blok.type] : "Block";
              })()
            : LANDING_SECTION_ADMIN_LABELS[section.id],
        ]),
        ["kaki", "Footer"],
        ["pembuka:nav", "Top bar"],
        ["pembuka:public_name", "Event name"],
        ["pembuka:tagline", gathering ? "Title" : "Tagline"],
        ["pembuka:portal", "Portal preview"],
        ["portal", "Portal peserta"],
        ["pembuka:hero_eyebrow", "Label above the title"],
        ["pembuka:hero_note", "Line below the title"],
        ["pembuka:hero_bg_url", horizon ? "Hero image" : "Background image"],
        ["pembuka:hero_button_label", "Button text"],
        ["pembuka:hero_index", "Corner label"],
        ["about:program_heading", "Opening line"],
        ["portal:portal_eyebrow", "Portal small label"],
        ["portal:portal_heading", "Portal heading"],
        ["portal:portal_note", "Portal text"],
        ["portal:portal_button_label", "Sign-in button text"],
        ["kaki:cta_heading", horizon ? "Closing band" : "Call-to-action banner"],
      ]);
  const labelPilih = useMemo<Record<string, string> | null>(() => (kunciLabel ? Object.fromEntries(JSON.parse(kunciLabel)) : null), [kunciLabel]);

  const pilihDariPratinjau = useCallback((id: string, kolom: string | null) => {
    if (terbuka !== id) {
      setTerbuka(id);
      setSorot((current) => ({ id, n: (current?.n ?? 0) + 1, diam: true }));
      gulirKeBaris(id);
    }
    if (kolom) tampilkanKolom(id, kolom);
  }, [terbuka, setSorot, setTerbuka]);

  const jumlahHapus = konfirmasiHapus?.ids.length ?? 0;
  return { isiSusunanEn, barisTetap, isiSusunan, pilihanBahasa, saringan, panel, awalSeret, simpanLebar, mulaiSeretPanel, seretPanel, lepasPanel, tombolPanel, kunciLabel, labelPilih, pilihDariPratinjau, jumlahHapus };
}
