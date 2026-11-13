"use client";

import { ArrowLeft, Info, Plus, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { Kelompok } from "@/components/admin/compact-form";
import { Button, Pane, PaneBody, PaneFooter, IconButton, TextField } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { type Panel } from "@/lib/agenda-simpan-aman";
import { type ReactNode } from "react";
import { FieldMessages } from "@/components/m3/text-field";
import { BRANDING_FALLBACK } from "./agenda-bantu";
import type { useRundownAdminPage0 } from "./agenda-0";
import type { useRundownAdminPage1 } from "./agenda-1";
import type { useRundownAdminPage2 } from "./agenda-2";
import type { useRundownAdminPage3 } from "./agenda-3";

/** Bagian 5 dari 5 badan RundownAdminPage, dipindah apa adanya (audit platform, Fase 3). */
export function useRundownAdminPage4(c: Awaited<ReturnType<typeof useRundownAdminPage0>> & Awaited<ReturnType<typeof useRundownAdminPage1>> & Awaited<ReturnType<typeof useRundownAdminPage2>> & Awaited<ReturnType<typeof useRundownAdminPage3>>) {
  const { active, activeItems, addItem, addingItem, barisTersimpan, berubah, dcBerubah, draft, galatKaki, headerBranding, headerTampil, idGalat, isiBaris, isiDresscode, layarEditor, panelAktif, panelTerbuka, saveDresscode, saveHeader, saveItem, saveSection, savingHeader, savingItem, savingOutfit, savingSection, sections, selectedItem, sesi, sesiForm, setConfirmItem, setUploadingBranding, tabDc, tutupLayarEditor, tutupPanel, updateHeader, uploadHeaderBackground, uploadingBackground, uploadingOutfit } = c;
  // ---- Panel samping: header publik -------------------------------------------------
  // Header ditaruh di segmen tersendiri, bukan di dalam setelan bagian: posisinya
  // harus mencerminkan cakupannya. Di dalam setelan bagian, admin wajar
  // menyimpulkan isinya hanya berlaku untuk tab yang sedang dipilih.
  const isiHeader = (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Applies to every tab. The appearance fields are optional; left empty, the header uses the default theme.
      </p>
      <Kelompok title="Title" first>
        <TextField
          label="Event title"
          hint="Shown the same on every tab."
          placeholder="e.g. PRIMA EXECUTIVE GATHERING"
          value={headerTampil.event_title}
          onChange={(event) => updateHeader({ event_title: event.target.value })}
        />
        <TextField
          label="Event subtitle"
          optional
          hint="Up to two lines on the public page."
          placeholder="e.g. Beyond Tomorrow: Securing Progress"
          value={headerTampil.event_subtitle ?? ""}
          onChange={(event) => updateHeader({ event_subtitle: event.target.value })}
        />
      </Kelompok>

      {/* Warna boleh dikosongkan, dan itu tidak bisa dilakukan <input type="color">
          yang selalu punya nilai. Jadi tiap warna dipasangkan tombol kembali ke
          bawaan (null). */}
      <Kelompok title="Colours">
        {([
          ["background_color", "Header background"],
          ["text_color", "Text colour"],
          ["accent_color", "Accent (tab underline)"],
        ] as const).map(([key, label]) => (
          <div key={key} className="flex items-center gap-3">
            <input
              id={`header-${key}`}
              type="color"
              value={headerTampil[key] ?? BRANDING_FALLBACK[key]}
              onChange={(event) => updateHeader({ [key]: event.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent"
            />
            <label htmlFor={`header-${key}`} className="min-w-0 flex-1">
              <span className="block text-body-medium font-medium text-on-surface">{label}</span>
              <span className="block text-body-medium text-on-surface-variant">{headerTampil[key] ? headerTampil[key]?.toUpperCase() : "Uses the default theme"}</span>
            </label>
            <Button variant="outlined" size="sm" disabled={!headerTampil[key]} onClick={() => updateHeader({ [key]: null })} aria-label={`Reset ${label.toLowerCase()} to default`}>
              Default
            </Button>
          </div>
        ))}
      </Kelompok>

      {/* Gambar latar berdiri DI ATAS warna, bukan menggantikannya. Warna tetap
          dipakai di belakangnya supaya teks tidak hilang bila gambar gagal dimuat. */}
      <Kelompok title="Background image" note="A dark overlay is added automatically and the text turns white so it stays readable. PNG, JPG or WebP, up to 5 MB.">
        <div className="flex flex-wrap items-center gap-2">
          {headerTampil.background_image_url ? (
            <span className="h-12 w-20 shrink-0 rounded-md border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${headerTampil.background_image_url})` }} />
          ) : null}
          <label className={cx(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-medium font-medium text-on-surface hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
            uploadingBackground && "pointer-events-none opacity-60",
          )}>
            <UploadSimple size={16} aria-hidden />
            {uploadingBackground ? "Uploading…" : headerTampil.background_image_url ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={uploadingBackground}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadHeaderBackground(file);
                // Direset supaya memilih berkas yang sama dua kali tetap memicu onChange.
                event.target.value = "";
              }}
            />
          </label>
          {headerTampil.background_image_url ? (
            <Button variant="text" size="sm" className="text-error" onClick={() => updateHeader({ background_image_url: null })}>Remove image</Button>
          ) : null}
        </div>
      </Kelompok>

      {/* Editor logo, jenis huruf, ukuran, dan warna per elemen. Komponen yang sama
          dipakai /admin/seat-map dan /admin/display. */}
      <Kelompok title="Logo and type">
        {/* Unggahan logo atau gambar sponsor ikut penjaga suntingan header. Hasil
            yang tiba sesudah header dibuang ditolak: sesinya sudah berganti, dan
            `key` memasang editor baru tanpa "Uploading…" yang tertinggal. */}
        <BrandingEditor
          key={sesi}
          value={headerBranding}
          onChange={(changes) => {
            if (sesi !== sesiForm.current) return false;
            updateHeader(changes);
          }}
          onUploadingChange={(uploading) => {
            if (sesi === sesiForm.current) setUploadingBranding(uploading);
          }}
          idPrefix="rundown-header"
          baseTextColor={headerTampil.text_color ?? "#1a1a1a"}
          baseBackgroundColor={headerTampil.background_color ?? "#ffffff"}
          baseAccentColor={headerTampil.accent_color ?? "#2649d0"}
        />
      </Kelompok>
    </div>
  );

  const draftLengkap = Boolean(draft.title.trim() && draft.start_time);
  // Catatan kaki mengatakan yang benar: "Unsaved changes" selama formulir ini
  // punya suntingan yang belum disimpan.
  const belumDisimpan = berubah ? "Unsaved changes" : null;
  const kaki: Record<Panel, { note: ReactNode; aksi: ReactNode }> = {
    baris: selectedItem
      ? {
        note: belumDisimpan,
        aksi: (
          <>
            <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmItem(barisTersimpan.get(selectedItem.id) ?? selectedItem)}>Delete</Button>
            <Button simpan size="sm" onClick={() => void saveItem(selectedItem)} loading={savingItem === selectedItem.id}>Save item</Button>
          </>
        ),
      }
      : {
        note: draftLengkap ? belumDisimpan : "Start time and title are required",
        aksi: active ? <Button simpan size="sm" icon={<Plus size={16} />} onClick={() => void addItem()} loading={addingItem} disabled={!draftLengkap}>Add item</Button> : null,
      },
    bagian: {
      note: belumDisimpan ?? "This section only",
      aksi: active ? <Button simpan size="sm" onClick={() => void saveSection(active)} loading={savingSection}>Save day</Button> : null,
    },
    dresscode: {
      note: belumDisimpan ?? "This tab only",
      // Menunggu foto selesai diunggah: tersimpan bersama, bukan sesudahnya sebagai suntingan baru.
      aksi: active ? (
        <Button simpan size="sm" onClick={() => void saveDresscode(active)} loading={savingOutfit === active.id} disabled={!dcBerubah(active.id) || uploadingOutfit?.bagian === active.id}>
          Save dress code
        </Button>
      ) : null,
    },
    header: {
      note: belumDisimpan ?? "Applies to every tab",
      aksi: <Button simpan size="sm" onClick={() => void saveHeader()} loading={savingHeader}>Save header</Button>,
    },
  };

  // Day settings adalah dialog: selama terbuka panel kanan tetap menampilkan item.
  const panelSamping: Exclude<Panel, "bagian"> = panelAktif === "bagian" ? "baris" : panelAktif;
  const tampilSamping = panelSamping === "dresscode" || panelSamping === "header" || (panelSamping === "baris" && Boolean(active) && (selectedItem !== null || panelTerbuka));
  const judulSamping = panelSamping === "header" ? "Agenda screen header"
    : panelSamping === "dresscode" ? `Dress code · ${(tabDc?.name ?? "").trim()}`
      : selectedItem ? "Edit item" : "New item";
  const samping = (
    <Pane as="aside" aria-label="Agenda editor" className="max-lg:overflow-clip">
      {layarEditor && active ? (
        <div data-agenda-editor className="sticky top-14 z-10 flex min-h-12 shrink-0 scroll-mt-14 items-stretch gap-2 border-b border-outline-variant bg-surface-container-lowest px-2 lg:hidden">
          <Button data-agenda-kembali variant="text" size="sm" icon={<ArrowLeft size={16} />} onClick={tutupLayarEditor}>
            {(sections.find((row) => row.id === active.id)?.name ?? active.name).trim() || "Schedule"}
          </Button>
          {selectedItem && activeItems.some((row) => row.id === selectedItem.id) ? (
            <span className="ml-auto self-center pr-2 tabular-nums text-body-small text-on-surface-variant">
              {activeItems.findIndex((row) => row.id === selectedItem.id) + 1} of {activeItems.length}
            </span>
          ) : null}
        </div>
      ) : <span data-agenda-editor aria-hidden className="scroll-mt-20 lg:hidden" />}
      {/* Satu cakupan per panel (audit A2): judulnya menyebut apa yang disunting. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant py-2 pr-2 pl-4">
        <h2 className="min-w-0 flex-1 truncate text-body-medium font-semibold text-on-surface">{judulSamping}</h2>
        <IconButton size="sm" label="Close panel" onClick={tutupPanel}><X size={18} /></IconButton>
      </div>
      <PaneBody className="px-4 py-4">
        {panelSamping === "baris" ? isiBaris : panelSamping === "dresscode" ? isiDresscode : isiHeader}
      </PaneBody>
      <PaneFooter
        note={galatKaki && panelAktif !== "bagian" ? (
          // Galat simpan di samping tombolnya, dengan bentuk galat TextField.
          <div className="[&>p]:mt-0"><FieldMessages id={idGalat} error={galatKaki} /></div>
        ) : kaki[panelSamping].note}
      >
        {kaki[panelSamping].aksi}
      </PaneFooter>
    </Pane>
  );
  return { isiHeader, draftLengkap, belumDisimpan, kaki, panelSamping, tampilSamping, judulSamping, samping };
}
