"use client";

import { Kelompok } from "@/components/admin/compact-form";
import { Banner, Button, Switch, TextField } from "@/components/m3";
import { ArrowLeft, ArrowRight, CopySimple, Trash, Warning } from "@phosphor-icons/react";
import { EditorDresscode, bannerDresscode } from "../editor-dresscode";
import { labelOutfit, labelTabOutfit } from "@/lib/outfit";
import { bandingkanBagian } from "@/lib/rundown-urutan";
import { KelompokSasaran, diLuarAcara, formatStaffDate, rentangAcara } from "./agenda-bantu";
import type { useRundownAdminPage0 } from "./agenda-0";
import type { useRundownAdminPage1 } from "./agenda-1";

/** Bagian 4 dari 5 badan RundownAdminPage, dipindah apa adanya (audit platform, Fase 3). */
export function useRundownAdminPage3(c: Awaited<ReturnType<typeof useRundownAdminPage0>> & Awaited<ReturnType<typeof useRundownAdminPage1>>) {
  const { abbr, active, barisTab, berubah, drafDc, dresscodeAda, duplicating, duplikatHari, eventDates, idBagian, idJudulDc, idMenurutTanggal, moveSection, outfitInfo, outfitSaved, percobaanDc, pindah, publikAda, publikAktif, reorderSections, reordering, sasaranAktif, sasaranInfo, sasaranSaved, savingOutfit, sections, sectionsUrut, sesi, setConfirmSection, setOutfitDrafts, setPublikDrafts, setSasaranAktif, sudahUrutTanggal, tabTerlihat, terlihat, updateSection, uploadFotoDresscode, uploadingOutfit } = c;
  // ---- Panel samping: bagian -------------------------------------------------------
  const isiBagian = active ? (
    <div className="flex flex-col gap-5">
      <Kelompok first>
        <TextField
          label="Name on the tab"
          hint="Usually the date. Add a short name only for a second programme on the same date, such as “(Batch 2)”."
          value={active.name}
          onChange={(event) => updateSection(active.id, { name: event.target.value })}
        />
        <TextField
          label="Date"
          type="date"
          hint={`Used to highlight what is happening now. ${formatStaffDate(active.event_date)} (${abbr})`}
          value={active.event_date}
          onChange={(event) => updateSection(active.id, { event_date: event.target.value })}
        />
        {diLuarAcara(active.event_date, eventDates) ? (
          // U-09: bagian bertanggal di luar acara membuat hitungan hari dan
          // penanda "sekarang" salah, dan biasanya tanda tanggal yang tertinggal.
          <Banner tone="warning" icon={<Warning size={18} />}>
            This date is outside the event ({rentangAcara(eventDates!)}). Check it, or change the event dates on the Event page.
          </Banner>
        ) : null}
        {sectionsUrut.length > 1 ? (
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-body-medium font-medium text-on-surface">Tab order</p>
              <p className="text-body-small text-on-surface-variant">
                Tab {idBagian.indexOf(active.id) + 1} of {idBagian.length}. Saved straight away; the event page uses the same order.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outlined"
                size="md"
                icon={<ArrowLeft size={16} />}
                data-move-tab="left"
                aria-disabled={reordering || idBagian[0] === active.id || undefined}
                className="aria-disabled:cursor-default aria-disabled:opacity-40"
                onClick={() => { if (!reordering && idBagian[0] !== active.id) moveSection(active, -1); }}
              >
                Move left
              </Button>
              <Button
                variant="outlined"
                size="md"
                icon={<ArrowRight size={16} />}
                data-move-tab="right"
                aria-disabled={reordering || idBagian[idBagian.length - 1] === active.id || undefined}
                className="aria-disabled:cursor-default aria-disabled:opacity-40"
                onClick={() => { if (!reordering && idBagian[idBagian.length - 1] !== active.id) moveSection(active, 1); }}
              >
                Move right
              </Button>
              <Button
                variant="text"
                size="md"
                aria-disabled={reordering || sudahUrutTanggal || undefined}
                className="aria-disabled:cursor-default aria-disabled:opacity-40"
                onClick={() => { if (!reordering && !sudahUrutTanggal) void reorderSections(idMenurutTanggal, "Tabs sorted by date."); }}
              >
                Sort all by date
              </Button>
            </div>
          </div>
        ) : null}
        {/* Kolom "Judul di halaman publik" dan "Sub judul" per bagian sengaja
            tidak ada: judul header kini satu untuk seluruh acara (panel Header
            publik). Kolomnya tetap ada di database supaya data lama tidak rusak. */}
      </Kelompok>
      <Kelompok title="On the public page">
        {/* Sakelar penanda ditaruh bersama tanggal karena keduanya satu urusan:
            penanda hanya benar bila tanggalnya benar. */}
        <Switch
          checked={active.highlight_current}
          onChange={(checked) => updateSection(active.id, { highlight_current: checked })}
          label="Highlight the current item"
          description={active.highlight_current
            ? "The public page highlights the current item, marks the next one, dims finished items and scrolls to the current item automatically. The date above must be correct."
            : "The schedule shows as a plain list, with no highlight and no automatic scrolling. Use this until the event date arrives."}
        />
      </Kelompok>
      <Kelompok title="Visibility">
        {/* is_published menyembunyikan bagian di mana pun, portal peserta juga:
            namanya dulu "Show on public page" dan tertukar dengan sakelar di bawahnya. */}
        <Switch
          checked={active.is_published}
          onChange={(checked) => updateSection(active.id, { is_published: checked })}
          label="Published"
          description="Participants see this day. Off hides it everywhere."
        />
        {publikAda ? (
          <Switch
            checked={publikAktif(active.id)}
            onChange={(checked) => setPublikDrafts((current) => ({ ...current, [active.id]: checked }))}
            label="Show before sign-in"
            description={!active.is_published
              ? "Applies once Published is on."
              : publikAktif(active.id)
                ? `Visitors who have not signed in see this day on the event page and at /rundown?sesi=${active.slug}.`
                : "Only participants who have signed in see this day. The event page and /rundown leave it out."}
          />
        ) : null}
      </Kelompok>
      {sasaranInfo?.horizon ? <KelompokSasaran info={sasaranInfo} value={sasaranAktif} onChange={setSasaranAktif} /> : null}
      <section className="flex items-center gap-3 border-t border-outline-variant pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-body-medium font-medium text-on-surface">Duplicate day</p>
          <p className="text-body-medium text-on-surface-variant">{berubah ? "Save or discard your changes first." : "A draft copy with every item, for another batch or a similar day. Dress code and these settings are not copied."}</p>
        </div>
        <Button simpan variant="outlined" size="sm" icon={<CopySimple size={16} />} loading={duplicating} disabled={berubah} onClick={() => { const asli = sections.find((row) => row.id === active.id); if (asli) void duplikatHari(asli); }}>Duplicate</Button>
      </section>
      <section className="flex items-center gap-3 border-t border-outline-variant pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-body-medium font-medium text-on-surface">Delete day</p>
          <p className="text-body-medium text-on-surface-variant">All of its agenda items are deleted too.</p>
        </div>
        <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmSection(sections.find((row) => row.id === active.id) ?? active)}>Delete</Button>
      </section>
    </div>
  ) : null;

  // ---- Panel samping: dress code ---------------------------------------------------
  // Segmen sendiri, bukan kelompok di Section: dress code disimpan sendiri, jadi
  // isian yang belum lengkap tidak memblokir Save section. `key` dengan sesi:
  // Discard memasang kartu baru tanpa catatan yang tadi dibuka.
  const tabDc = active ? sections.find((row) => row.id === active.id) ?? null : null;
  const isiDresscode = active && tabDc && dresscodeAda ? (
    <EditorDresscode
      key={`${active.id}-${sesi}`}
      idJudul={idJudulDc}
      tab={{ id: active.id, name: tabDc.name }}
      labelHalaman={labelOutfit(outfitInfo?.label)}
      labelBatch={labelTabOutfit(sections, active.id, tabTerlihat)}
      setiapHari={outfitInfo?.every_day ?? null}
      daftar={drafDc(active.id)}
      onUbah={(next) => setOutfitDrafts((kini) => ({ ...kini, [active.id]: next }))}
      baris={barisTab(active.id)}
      tautanTersimpan={new Set((outfitSaved[active.id] ?? []).flatMap((isian) => (isian.item_id ? [isian.item_id] : [])))}
      banner={bannerDresscode({
        tab: tabDc,
        tabs: sections,
        terlihat,
        bersasaran: sasaranInfo ? (id) => Boolean(sasaranSaved[id]) : null,
        jumlahIsian: (id) => (id === active.id ? drafDc(id).length : (outfitSaved[id] ?? []).length),
      })}
      tabLain={[...sections]
        .sort(bandingkanBagian)
        .filter((row) => row.id !== active.id && row.event_date === tabDc.event_date && (outfitSaved[row.id] ?? []).length === 0)
        .map((row) => ({ id: row.id, name: row.name }))}
      coba={percobaanDc === active.id}
      unggah={uploadingOutfit?.bagian === active.id ? uploadingOutfit.kunci : null}
      menyimpan={savingOutfit === active.id}
      onUnggah={(kunci, file) => void uploadFotoDresscode(kunci, file)}
      onBukaBagian={() => pindah({ panel: "bagian" })}
      onBukaTab={(id) => pindah({ bagian: id, panel: "dresscode" })}
    />
  ) : null;
  return { isiBagian, tabDc, isiDresscode };
}
