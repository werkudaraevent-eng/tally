"use client";

import { Button, EmptyState, ListRow, Pane, PaneBody, PaneHeader, SelectMenu, StatusChip, Switch, TextField } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { ArrowDown, ArrowUp, CopySimple, DotsSixVertical, GearSix, Plus, Stack, Trash, UsersThree } from "@phosphor-icons/react";
import { BarisDresscode, CatatanDresscodeBaris, ringkasDresscode } from "../editor-dresscode";
import { setiapHariDiTab } from "@/lib/outfit-setiap-hari";
import { teksPolos } from "@/lib/landing-teks-kaya";
import { kunciSlot, pindahDalamSlot } from "@/lib/rundown-urutan";
import { KelompokPembicara, pembicaraBaris } from "../pembicara-baris";
import { formatClock } from "@/lib/rundown";
import { KelompokSiapaMelihat, ringkasSyarat, syaratMati } from "../siapa-melihat";
import { MenuBlok } from "@/app/admin/landing/menu-blok";
import { Kelompok } from "@/components/admin/compact-form";
import { RichDetailsField } from "@/components/admin/rich-details-field";
import { OUTFIT_MAX } from "@/lib/outfit";
import { CONTOH_KETERANGAN, CatatanBus, HINT_KETERANGAN } from "./agenda-bantu";
import type { useRundownAdminPage0 } from "./agenda-0";
import type { useRundownAdminPage1 } from "./agenda-1";

/** Bagian 3 dari 5 badan RundownAdminPage, dipindah apa adanya (audit platform, Fase 3). */
export function useRundownAdminPage2(c: Awaited<ReturnType<typeof useRundownAdminPage0>> & Awaited<ReturnType<typeof useRundownAdminPage1>>) {
  const { active, activeItems, adaSlotParalel, barisDcTampil, barisTersimpan, bukaDresscode, bukaLayarEditor, bukaTambahHari, daftarHari, dcBerubah, draft, dragId, dresscodeAda, dresscodeBaris, dropTarget, duplicating, duplikatBaris, enAktif, hariPublik, hitungLihat, jamBelumDisimpan, layarEditor, lihatBaris, lihatSebagai, loadOutfit, menyimpanPembicara, modeLihat, moveInSlot, mulaiTambahBaris, namaLihat, opsiMenuLihat, outfitInfo, outfitMuat, outfitSaved, panelAktif, pembicara, pembicaraGagal, pindah, reorderNote, reorderSlot, reordering, sections, selectedItem, selectedItemId, selectedSlot, selectedSlotLokal, setConfirmItem, setDragId, setDropTarget, setLihatSebagai, setSyaratBaru, setSyaratDrafts, simpanPembicara, slots, syaratBaru, syaratDrafts, syaratInfo, syaratSaved, ubahLabel, updateDraft, updateItem, uploadingOutfit, zone } = c;
  // ---- Panel utama: jadwal bagian aktif -------------------------------------------
  const jadwal = active ? (
    <Pane aria-label={`${active.name} schedule`} className={cx(layarEditor && "max-lg:hidden")}>
      <PaneHeader className="flex-wrap">
        <h2 className="min-w-0 flex-1 truncate max-sm:basis-full text-body-medium font-semibold text-on-surface" title={adaSlotParalel ? "Drag to reorder same-time items" : "Sorted by start time automatically"}>
          <span className="tabular-nums">{hitungLihat === null ? plural(activeItems.length, "item") : `${namaLihat} sees ${hitungLihat} of ${plural(activeItems.length, "item")}`}</span>
        </h2>
        {opsiMenuLihat.length > 1 ? (
          <SelectMenu
            label="View as"
            value={modeLihat === "semua" ? "semua" : lihatSebagai}
            onChange={(next) => setLihatSebagai(next)}
            options={opsiMenuLihat}
            width="11rem"
          />
        ) : null}
        <Button variant="outlined" size="sm" icon={<GearSix size={16} />} onClick={() => pindah({ panel: "bagian" })}>Day settings</Button>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={mulaiTambahBaris}>Add item</Button>
      </PaneHeader>
      {modeLihat === "publik" && !hariPublik ? (
        <p className="shrink-0 border-b border-outline-variant bg-surface-container-high px-4 py-2 text-body-medium text-on-surface-variant">
          Visitors who have not signed in don&apos;t see this day. Turn on Published and Show before sign-in in Day settings.
        </p>
      ) : null}
      {barisDcTampil ? (
        // Di antara kepala panel dan daftar yang bergulir: tidak pernah tergulir hilang.
        <BarisDresscode
          keadaan={outfitMuat}
          baris={ringkasDresscode(outfitSaved[active.id] ?? [], (id) => {
            const row = barisTersimpan.get(id);
            return row && row.section_id === active.id ? row : null;
          })}
          // Every day tampil seperti dibaca peserta: tidak, bila tab punya Whole day tersimpan sendiri.
          setiap={setiapHariDiTab(outfitSaved[active.id] ?? [], outfitInfo?.every_day)?.what ?? null}
          labelTab={(sections.find((row) => row.id === active.id)?.name ?? active.name).trim()}
          dipilih={panelAktif === "dresscode"}
          belum={dcBerubah(active.id) || uploadingOutfit?.bagian === active.id}
          onBuka={bukaDresscode}
          onCobaLagi={() => void loadOutfit()}
        />
      ) : null}
      <PaneBody>
        {activeItems.length === 0 ? (
          <EmptyState
            plain
            title="No agenda items yet"
            description="Add the first item. Items are sorted by start time, so there is nothing to reorder."
            action={<Button size="sm" icon={<Plus size={16} />} onClick={mulaiTambahBaris}>Add item</Button>}
          />
        ) : (
          <div>
            {activeItems.map((item) => {
              // Ringkasan satu baris: titik daftar "• " dibuang, pemisahnya sudah " · ".
              const keterangan = teksPolos(item.subtitle).split("\n").map((line) => line.trim().replace(/^•\s*/, "")).filter(Boolean).join(" · ");
              const kunci = kunciSlot(item.start_time);
              const slotIds = slots.get(kunci) ?? [];
              const paralel = slotIds.length > 1;
              const posisi = slotIds.indexOf(item.id);
              const judul = item.title.trim() || "Untitled";
              const garis = dropTarget?.id === item.id && dragId !== null && dragId !== item.id ? (dropTarget.after ? "bottom" : "top") : null;
              const lihat = lihatBaris(item);
              const namaPembicara = pembicara ? pembicaraBaris(pembicara, item.id).map((x) => x.orang.name) : [];
              return (
                <div key={item.id}>
                  {paralel && posisi === 0 ? (
                    <div className="flex items-center gap-2 border-b border-outline-variant py-2 pr-4 pl-4 text-body-small pointer-fine:pl-10 text-on-surface-variant">
                      <Stack size={16} aria-hidden />
                      {slotIds.length} items start at {formatClock(item.start_time)}
                    </div>
                  ) : null}
                  <div
                    data-rundown-row={item.id}
                    className={cx("relative", dragId === item.id && "opacity-50")}
                    onDragOver={paralel && dragId !== null && slotIds.includes(dragId) ? (event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const kotak = event.currentTarget.getBoundingClientRect();
                      const after = event.clientY > kotak.top + kotak.height / 2;
                      if (dropTarget?.id !== item.id || dropTarget.after !== after) setDropTarget({ id: item.id, after });
                    } : undefined}
                    onDrop={paralel && dragId !== null && slotIds.includes(dragId) ? (event) => {
                      event.preventDefault();
                      const tanpa = slotIds.filter((id) => id !== dragId);
                      const ke = tanpa.indexOf(item.id) + (dropTarget?.after ? 1 : 0);
                      const next = dragId === item.id ? null : pindahDalamSlot(slotIds, dragId, ke);
                      const moved = dragId;
                      setDragId(null); setDropTarget(null);
                      if (next) void reorderSlot(next, moved);
                    } : undefined}
                  >
                    <ListRow
                      selected={item.id === selectedItemId}
                      onSelect={() => pindah({ baris: item.id, panel: "baris" }, bukaLayarEditor)}
                      className={cx("items-start py-3 pr-14", adaSlotParalel && "pointer-fine:pl-10!", lihat === "tidak" && "opacity-40")}
                    >
                      <span className="w-28 shrink-0 tabular-nums text-on-surface">
                        {formatClock(item.start_time)}{item.end_time ? `–${formatClock(item.end_time)}` : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cx("min-w-0 truncate", item.is_break ? "text-on-surface-variant" : "font-medium text-on-surface")}>
                            {judul}
                          </span>
                          {item.is_break ? <StatusChip>Break</StatusChip> : null}
                          {item.is_published ? null : <StatusChip tone="warning">Hidden</StatusChip>}
                          {item.bus_trips?.length ? (
                            <StatusChip title={item.bus_trips.length === 1 ? "Vehicle trip linked in Logistics" : `${item.bus_trips.length} vehicle trips linked in Logistics`}>Vehicle</StatusChip>
                          ) : null}
                        </span>
                        {namaPembicara.length ? <span className="mt-0.5 block truncate text-on-surface-variant">{namaPembicara.join(" · ")}</span> : null}
                        {keterangan ? <span className="mt-0.5 block truncate text-on-surface-variant">{keterangan}</span> : null}
                        {/* Baris sendiri, supaya judul tidak terpotong di layar sempit. */}
                        {syaratSaved[item.id] ? (
                          <span className="mt-1 flex min-w-0">
                            {syaratMati(syaratSaved[item.id], syaratInfo) ? (
                              <StatusChip tone="error" icon={<UsersThree size={14} aria-hidden />} title="Who sees it: a chosen field or answer no longer exists, so nobody sees this row">
                                <span className="truncate">Nobody sees this{ringkasSyarat(syaratSaved[item.id], syaratInfo) ? ` · ${ringkasSyarat(syaratSaved[item.id], syaratInfo)}` : ""}</span>
                              </StatusChip>
                            ) : (
                              <StatusChip tone="primary" icon={<UsersThree size={14} aria-hidden />} title="Who sees it: only participants who match every condition">
                                <span className="truncate">{ringkasSyarat(syaratSaved[item.id], syaratInfo)}</span>
                              </StatusChip>
                            )}
                          </span>
                        ) : null}
                        {modeLihat !== "semua" && lihat !== "ya" ? (
                          <span className="mt-1 block text-body-small text-on-surface-variant">
                            {lihat === "sebagian" ? `Only part of ${namaLihat} sees this` : !(barisTersimpan.get(item.id) ?? item).is_published ? "Not published" : `${namaLihat} doesn't see this`}
                          </span>
                        ) : null}
                      </span>
                    </ListRow>
                    <div className="absolute top-1.5 right-2">
                      <MenuBlok
                        label={`Actions for ${judul}`}
                        width={260}
                        items={[
                          { label: "Duplicate", icon: <CopySimple size={18} />, onSelect: () => void duplikatBaris(item, active.id), disabled: duplicating },
                          ...daftarHari.filter((row) => row.id !== active.id).map((row) => ({
                            label: `Duplicate to ${row.name.trim() || "Untitled day"}`,
                            icon: <CopySimple size={18} />,
                            onSelect: () => void duplikatBaris(item, row.id),
                            disabled: duplicating,
                          })),
                          { label: "Delete", icon: <Trash size={18} />, bahaya: true, onSelect: () => setConfirmItem(barisTersimpan.get(item.id) ?? item) },
                        ]}
                      />
                    </div>
                    {/* Pegangan berada di luar <ListRow> karena ListRow sendiri sebuah
                        <button>; tombol di dalam tombol tidak sah. Panah atas/bawah
                        pada pegangan menggeser baris tanpa tetikus. */}
                    {paralel ? (
                      <button
                        type="button"
                        // aria-disabled, bukan disabled: tombol yang dinonaktifkan
                        // kehilangan fokus, sehingga pengguna keyboard terlempar
                        // keluar setiap kali satu langkah sedang disimpan.
                        draggable={!reordering}
                        aria-disabled={reordering || undefined}
                        aria-label={`Reorder ${judul}, position ${posisi + 1} of ${slotIds.length} at ${formatClock(item.start_time)}`}
                        title="Drag to reorder, or use the arrow keys"
                        aria-describedby="rundown-reorder-hint"
                        className="absolute top-3 left-2 flex pointer-coarse:hidden size-6 cursor-grab items-center justify-center rounded-md text-on-surface-variant hover:bg-primary-soft hover:text-on-surface active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-40"
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                          event.preventDefault();
                          moveInSlot(item, event.key === "ArrowUp" ? -1 : 1);
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", String(item.id));
                          const baris = event.currentTarget.closest("[data-rundown-row]");
                          if (baris instanceof HTMLElement) event.dataTransfer.setDragImage(baris, 24, 20);
                          setDragId(item.id);
                        }}
                        onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                      >
                        <DotsSixVertical size={18} weight="bold" aria-hidden />
                      </button>
                    ) : null}
                    {garis ? (
                      <span aria-hidden className={cx("pointer-events-none absolute right-4 left-10 h-0.5 rounded-full bg-primary", garis === "top" ? "-top-px" : "-bottom-px")} />
                    ) : null}
                  </div>
                </div>
              );
            })}
            <p role="status" className="sr-only">{reorderNote}</p>
            <span id="rundown-reorder-hint" hidden>Use the up and down arrow keys to move this item among items with the same start time.</span>
          </div>
        )}
      </PaneBody>
    </Pane>
  ) : (
    <Pane aria-label="Schedule">
      <EmptyState
        plain
        title="No agenda days yet"
        description="Each day is a tab on the public page. New days start as drafts."
        action={<Button size="sm" icon={<Plus size={16} />} onClick={bukaTambahHari}>Add day</Button>}
      />
    </Pane>
  );

  // ---- Panel samping: baris --------------------------------------------------------
  // Dress code tersimpan tab baris terpilih, untuk catatan di bawah Title.
  const dcBaris = selectedItem && dresscodeAda ? outfitSaved[selectedItem.section_id] ?? [] : null;
  // Edit item dalam tiga kelompok tetap (audit A10): isi, siapa yang melihat,
  // lalu yang tertaut dari modul lain. Fitur berikutnya yang menempel ke baris
  // cukup menambah satu kartu di Linked.
  const adaTautan = Boolean(selectedItem && (selectedItem.bus_trips?.length || dcBaris));
  const isiBaris = selectedItem ? (
    <div className="flex flex-col gap-5">
      <Kelompok first>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Start"
          type="time"
          inputClassName="tabular-nums"
          value={formatClock(selectedItem.start_time)}
          onChange={(event) => updateItem(selectedItem.id, { start_time: event.target.value })}
        />
        <TextField
          label="End"
          optional
          type="time"
          inputClassName="tabular-nums"
          value={selectedItem.end_time ? formatClock(selectedItem.end_time) : ""}
          onChange={(event) => updateItem(selectedItem.id, { end_time: event.target.value || null })}
        />
      </div>
      <TextField label="Title" value={selectedItem.title} onChange={(event) => updateItem(selectedItem.id, { title: event.target.value })} />
      {enAktif ? (
        <TextField
          label="Title in English"
          optional
          hint="Shown when a visitor switches the event page to English. Left empty, the title above is shown."
          value={selectedItem.title_en ?? ""}
          onChange={(event) => updateItem(selectedItem.id, { title_en: event.target.value })}
        />
      ) : null}
      {jamBelumDisimpan && selectedSlotLokal > 1 ? (
        <p className="border-t border-outline-variant pt-4 text-body-small text-on-surface-variant">
          Save the time change first to reorder items that start at {kunciSlot(selectedItem.start_time).slice(0, 5)}.
        </p>
      ) : null}
      {selectedSlot.length > 1 ? (
        <div className="flex flex-col gap-2 border-t border-outline-variant pt-4">
          <div>
            <p className="text-body-medium font-medium text-on-surface">Order at {formatClock(selectedItem.start_time)}</p>
            <p className="text-body-small text-on-surface-variant">
              {selectedSlot.indexOf(selectedItem.id) + 1} of {selectedSlot.length} items that start at {formatClock(selectedItem.start_time)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outlined"
              size="sm"
              icon={<ArrowUp size={16} />}
              data-move="up"
              // aria-disabled, bukan disabled: tombol yang dinonaktifkan melepas
              // fokus ke <body>. Klik saat tidak berlaku diabaikan di sini.
              aria-disabled={reordering || selectedSlot[0] === selectedItem.id || undefined}
              className="aria-disabled:cursor-default aria-disabled:opacity-40"
              onClick={() => { if (!reordering && selectedSlot[0] !== selectedItem.id) moveInSlot(selectedItem, -1, true); }}
            >
              Move up
            </Button>
            <Button
              variant="outlined"
              size="sm"
              icon={<ArrowDown size={16} />}
              data-move="down"
              aria-disabled={reordering || selectedSlot[selectedSlot.length - 1] === selectedItem.id || undefined}
              className="aria-disabled:cursor-default aria-disabled:opacity-40"
              onClick={() => { if (!reordering && selectedSlot[selectedSlot.length - 1] !== selectedItem.id) moveInSlot(selectedItem, 1, true); }}
            >
              Move down
            </Button>
          </div>
        </div>
      ) : null}
      {pembicara || pembicaraGagal ? (
        <KelompokPembicara
          daftar={pembicara}
          gagal={pembicaraGagal}
          itemId={selectedItem.id}
          judul={(barisTersimpan.get(selectedItem.id)?.title ?? selectedItem.title).trim()}
          menyimpan={menyimpanPembicara}
          onUbah={(next, pesan) => void simpanPembicara(next, pesan)}
        />
      ) : null}
      {/* textarea, bukan input satu baris: satu butir acara bisa memuat beberapa
          baris, dan tiap baris tampil sebagai butir terpisah di halaman publik. */}
      <RichDetailsField
        key={selectedItem.id}
        label="Details"
        optional
        placeholder={CONTOH_KETERANGAN}
        hint={HINT_KETERANGAN}
        value={selectedItem.subtitle ?? ""}
        onChange={(value) => updateItem(selectedItem.id, { subtitle: value })}
      />
      <Switch
        checked={selectedItem.is_break}
        onChange={(checked) => updateItem(selectedItem.id, { is_break: checked })}
        label="Break"
        description="Shown dimmed on the public page."
      />
      </Kelompok>
      <Kelompok title="Visibility">
      <Switch
        checked={selectedItem.is_published}
        onChange={(checked) => updateItem(selectedItem.id, { is_published: checked })}
        label="Published"
        description="Off hides this row everywhere, participant pages and its dress code line included."
      />
      </Kelompok>
      {syaratInfo ? (
        <KelompokSiapaMelihat
          info={syaratInfo}
          value={selectedItem.id in syaratDrafts ? syaratDrafts[selectedItem.id] : syaratSaved[selectedItem.id] ?? null}
          tersimpan={syaratSaved[selectedItem.id] ?? null}
          tanggal={sections.find((row) => row.id === selectedItem.section_id)?.event_date ?? null}
          onChange={(next) => setSyaratDrafts((kini) => ({ ...kini, [selectedItem.id]: next }))}
          onUbahLabel={ubahLabel}
        />
      ) : null}
      {adaTautan ? (
        <Kelompok title="Linked">
          {selectedItem.bus_trips?.length ? (
            <CatatanBus
              item={selectedItem}
              trips={selectedItem.bus_trips}
              jamTersimpan={barisTersimpan.get(selectedItem.id)?.start_time ?? selectedItem.start_time}
              tanggalTersimpan={sections.find((row) => row.id === selectedItem.section_id)?.event_date ?? active?.event_date ?? ""}
              zone={zone}
            />
          ) : null}
          {dcBaris ? (
            <CatatanDresscodeBaris
              apa={dcBaris.find((isian) => isian.item_id === selectedItem.id)?.what ?? null}
              penuh={dcBaris.length >= OUTFIT_MAX}
              tersembunyi={!barisTersimpan.get(selectedItem.id)?.is_published}
              onBuka={() => (dcBaris.some((isian) => isian.item_id === selectedItem.id) ? dresscodeBaris(selectedItem, false) : bukaDresscode())}
              onTambah={() => dresscodeBaris(selectedItem, true)}
            />
          ) : null}
        </Kelompok>
      ) : null}
    </div>
  ) : active ? (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Start" type="time" inputClassName="tabular-nums" value={draft.start_time} onChange={(event) => updateDraft({ start_time: event.target.value })} />
        <TextField label="End" optional type="time" inputClassName="tabular-nums" value={draft.end_time} onChange={(event) => updateDraft({ end_time: event.target.value })} />
      </div>
      <TextField
        label="Title"
        placeholder="e.g. Opening Keynote Speech"
        data-draft-title=""
        value={draft.title}
        onChange={(event) => updateDraft({ title: event.target.value })}
      />
      <RichDetailsField
        label="Details"
        optional
        placeholder={CONTOH_KETERANGAN}
        hint={HINT_KETERANGAN}
        value={draft.subtitle}
        onChange={(value) => updateDraft({ subtitle: value })}
      />
      <Switch checked={draft.is_break} onChange={(checked) => updateDraft({ is_break: checked })} label="Break" description="Shown dimmed on the public page." />
      {syaratInfo ? (
        <KelompokSiapaMelihat
          info={syaratInfo}
          tombol="Add item"
          tanggal={active.event_date ?? null}
          value={syaratBaru[active.id] ?? null}
          onChange={(next) => setSyaratBaru((kini) => ({ ...kini, [active.id]: next }))}
          onUbahLabel={ubahLabel}
        />
      ) : null}
      <p className="text-body-medium text-on-surface-variant">Leave the end time empty to mark a single moment.{pembicara?.length || enAktif ? " Speakers and the English title can be added once the item is added." : ""}</p>
    </div>
  ) : null;
  return { jadwal, dcBaris, adaTautan, isiBaris };
}
