"use client";

import { Banner, Button, ButtonLink, Dialog, MetaSeparator, PageLoading, SupportingPane, Tabs, TextField, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { plural } from "@/lib/plural";
import { ArrowSquareOut, Monitor, Plus, Warning } from "@phosphor-icons/react";
import { cx } from "@/lib/m3/cx";
import { FieldMessages } from "@/components/m3/text-field";
import { kalimatHapus } from "@/lib/logistik/trip-agenda";
import { judulBuang, keteranganBuang } from "@/lib/agenda-simpan-aman";
import { diLuarAcara, namaDariTanggal, rentangAcara } from "./agenda/agenda-bantu";
import { useRundownAdminPage0 } from "./agenda/agenda-0";
import { useRundownAdminPage1 } from "./agenda/agenda-1";
import { useRundownAdminPage2 } from "./agenda/agenda-2";
import { useRundownAdminPage3 } from "./agenda/agenda-3";
import { useRundownAdminPage4 } from "./agenda/agenda-4";


export default function RundownAdminPage() {
  const h0 = useRundownAdminPage0();
  const h1 = useRundownAdminPage1({ ...h0 });
  const h2 = useRundownAdminPage2({ ...h0, ...h1 });
  const h3 = useRundownAdminPage3({ ...h0, ...h1 });
  const h4 = useRundownAdminPage4({ ...h0, ...h1, ...h2, ...h3 });
  const { loaded, sections, items, error, layarEditor, activeId, sectionsUrut, eventDates, active, addSectionOpen, creatingSection, newSectionName, newSectionDate, setNewSectionDate, namaDiketik, setNewSectionName, bahasaAcara, setNamaDiketik, savingSection, idGalat, confirmItem, setConfirmItem, deletingItem, confirmSection, setConfirmSection, deletingSection, activeItems, tertunda, setTertunda } = h0;
  const { publishedCount, pindah, pilihBagian, bukaTambahHari, tutupTambahHari, createSection, panelAktif, galatKaki, dcHapus, deleteItem, jumlahDcBagian, tripBagian, deleteSection, tetapSunting, namaForm, buangForm } = h1;
  const { jadwal } = h2;
  const { tabDc, isiBagian } = h3;
  const { tampilSamping, samping, kaki } = h4;


  return (
    <WorkspacePage fill>
      <div lang="en" className="contents">
      <WorkspaceHeader
        meta={loaded ? (
          <>
            <span>
              {publishedCount === 0
                ? "No days are published yet, so the public page still shows a holding message"
                : `${publishedCount} of ${plural(sections.length, "day")} published`}
            </span>
            {/* Baris meta memuat fakta (DESIGN.md), bukan kalimat bantuan. */}
            <MetaSeparator />
            <span className="tabular-nums">{plural(items.length, "item")}</span>
          </>
        ) : null}
        actions={
          <>
            <Button variant="outlined" icon={<Monitor size={16} />} onClick={() => pindah({ panel: "header" })}>Screen header</Button>
            <ButtonLink href="/rundown" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open agenda screen</ButtonLink>
          </>
        }
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {!loaded ? (error ? null : <PageLoading />) : (
        <>
          <div className={cx("flex shrink-0 items-end gap-2 border-b border-outline-variant", layarEditor && "max-lg:hidden")}>
            {sections.length > 0 ? (
              // Tabs membawa shrink-0; pembungkus ini yang menyempit agar tombol + Bagian tetap di layar.
              <div className="min-w-0">
                <Tabs
                  label="Agenda days"
                  idPrefix="bagian"
                  value={String(activeId ?? "")}
                  onChange={(value) => pilihBagian(Number(value))}
                  className="border-b-0"
                  // Draft mengikuti is_published yang tersimpan, bukan sakelar yang belum disimpan.
                  options={sectionsUrut.map((section) => ({
                    value: String(section.id),
                    label: section.name,
                    badge: !sections.some((row) => row.id === section.id && row.is_published) ? "Draft"
                      : diLuarAcara(sections.find((row) => row.id === section.id)?.event_date, eventDates) ? "Check date" : undefined,
                  }))}
                />
              </div>
            ) :<span className="py-2.5 text-body-medium text-on-surface-variant">No days yet</span>}
            <Button variant="text" size="sm" icon={<Plus size={16} />} className="mb-1 shrink-0 text-primary" onClick={bukaTambahHari}>Day</Button>
          </div>
          <div
            role={active ? "tabpanel" : undefined}
            id={active ? `bagian-panel-${active.id}` : undefined}
            aria-labelledby={active ? `bagian-tab-${active.id}` : undefined}
            className="flex min-h-0 flex-1 flex-col"
          >
            {tampilSamping ? (
              <SupportingPane main={jadwal} pane={samping} paneWidth={420} />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col *:flex-1">{jadwal}</div>
            )}
          </div>
        </>
      )}

      <Dialog
        open={addSectionOpen}
        onClose={tutupTambahHari}
        dismissible={!creatingSection}
        size="sm"
        title="Add day"
        description="A new day starts as a draft, so it is not on the public page yet. Each day is a tab."
        actions={
          <>
            <Button variant="outlined" disabled={creatingSection} onClick={tutupTambahHari}>Cancel</Button>
            <Button simpan type="submit" form="form-bagian" loading={creatingSection} disabled={!newSectionName.trim() || !newSectionDate}>Add day</Button>
          </>
        }
      >
        <form id="form-bagian" className="mt-4 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void createSection(); }}>
          <TextField
            label="Date"
            type="date"
            autoFocus
            value={newSectionDate}
            hint={newSectionDate && diLuarAcara(newSectionDate, eventDates) && eventDates ? `Outside the event (${rentangAcara(eventDates)}).` : undefined}
            onChange={(event) => {
              setNewSectionDate(event.target.value);
              if (!namaDiketik) setNewSectionName(namaDariTanggal(event.target.value, bahasaAcara));
            }}
          />
          <TextField
            label="Name on the tab"
            hint="Follows the date, in the event's language. Add a short name only for a second programme on the same date, such as “(Batch 2)”."
            value={newSectionName}
            onChange={(event) => { setNewSectionName(event.target.value); setNamaDiketik(true); }}
          />
        </form>
      </Dialog>

      {/* Day settings (audit A2): setelan satu hari, dialog untuk tugas pendek. Tutup
          lewat pindah(), jadi perubahan yang belum disimpan ditanyakan dulu. */}
      <Dialog
        open={panelAktif === "bagian" && Boolean(active)}
        onClose={() => pindah({ panel: "baris" })}
        dismissible={!savingSection}
        scrollBody
        title={`Day settings · ${(tabDc?.name ?? active?.name ?? "").trim()}`}
        actions={
          <>
            {galatKaki ? <div className="mr-auto [&>p]:mt-0"><FieldMessages id={idGalat} error={galatKaki} /></div> : null}
            <Button variant="outlined" disabled={savingSection} onClick={() => pindah({ panel: "baris" })}>Cancel</Button>
            {kaki.bagian.aksi}
          </>
        }
      >
        <div className="mt-4">{isiBagian}</div>
      </Dialog>

      <Dialog
        open={confirmItem !== null}
        onClose={() => setConfirmItem(null)}
        dismissible={deletingItem === null}
        tone="danger"
        title={`Delete ${confirmItem?.title.trim() || "this item"}?`}
        // Trip bus yang tertaut tetap ada dengan jam terakhirnya; tautannya
        // dikosongkan database (FK on delete set null). Dress code yang menaut
        // ke baris ini ikut dihapus server, jadi keduanya disebut.
        description={[
          "This item is removed from the agenda and the public page.",
          dcHapus ? `Its dress code (${dcHapus}) is deleted too.` : "",
          kalimatHapus((confirmItem?.bus_trips ?? []).map((trip) => trip.name)),
          "A copy is kept in the audit log.",
        ].filter(Boolean).join(" ")}
        actions={
          <>
            <Button variant="outlined" disabled={deletingItem !== null} onClick={() => setConfirmItem(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={deletingItem !== null} onClick={() => { if (confirmItem) void deleteItem(confirmItem); }}>Delete item</Button>
          </>
        }
      />

      <Dialog
        open={confirmSection !== null}
        onClose={() => setConfirmSection(null)}
        dismissible={!deletingSection}
        tone="danger"
        title={`Delete ${confirmSection?.name ?? "this day"}?`}
        description={`${confirmSection?.is_published ? "This day is published now. " : ""}${activeItems.length === 0 ? "" : activeItems.length === 1 ? "Its 1 agenda item is deleted too. " : `All ${plural(activeItems.length, "agenda item")} on this day are deleted too. `}${jumlahDcBagian === 0 ? "" : jumlahDcBagian === 1 ? "Its dress code is deleted too. " : "Its dress codes are deleted too. "}${tripBagian ? `${tripBagian} ` : ""}A copy is kept in the audit log.`}
        actions={
          <>
            <Button variant="outlined" disabled={deletingSection} onClick={() => setConfirmSection(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={deletingSection} onClick={() => { if (confirmSection) void deleteSection(confirmSection); }}>Delete day</Button>
          </>
        }
      />

      {/* Pola Speakers: Escape dan klik di luar berarti Keep editing. Discard
          mengembalikan formulir ke nilai tersimpan, lalu menjalankan aksinya. */}
      <Dialog
        open={tertunda !== null}
        onClose={tetapSunting}
        title={tertunda ? judulBuang(tertunda.form, namaForm(tertunda.form)) : ""}
        description={tertunda ? keteranganBuang(tertunda.form) : undefined}
        actions={
          <>
            <Button variant="outlined" onClick={tetapSunting}>Keep editing</Button>
            <Button
              variant="danger"
              onClick={() => {
                const tunda = tertunda;
                setTertunda(null);
                if (!tunda) return;
                buangForm(tunda.form);
                tunda.aksi();
              }}
            >
              Discard
            </Button>
          </>
        }
      />
      </div>
    </WorkspacePage>
  );
}
