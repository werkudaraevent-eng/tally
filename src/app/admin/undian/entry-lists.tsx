"use client";

import { DownloadSimple, ListBullets, Plus, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { useState } from "react";
import {
  Button, ButtonLink, Dialog, EmptyState, IconButton, ListDetail, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
} from "@/components/m3";
import { Field, INPUT, PaneError } from "./form";
import type { EntryGroup } from "./types";

/**
 * Tab daftar import: daftar tersimpan di kiri, formulir daftar baru di kanan
 * saat dibuka. Daftar tersimpan tidak punya halaman detail (isinya tidak bisa
 * disunting di sini), jadi barisnya tidak bisa dipilih; hanya bisa dihapus.
 */
export function EntryLists({
  groups, loaded, loadFailed, open, onOpen, onClose,
  importName, importText, importFile, importing, error,
  onImportName, onImportText, onImportFile, onImport, onDeleteGroup,
}: {
  groups: EntryGroup[]; loaded: boolean; loadFailed: boolean;
  open: boolean; onOpen: () => void; onClose: () => void;
  importName: string; importText: string; importFile: File | null; importing: boolean; error: string;
  onImportName: (value: string) => void; onImportText: (value: string) => void;
  onImportFile: (file: File | null) => void;
  onImport: () => void; onDeleteGroup: (id: number) => Promise<void>;
}) {
  const [hapus, setHapus] = useState<EntryGroup | null>(null);
  const [menghapus, setMenghapus] = useState(false);

  const templat = (
    // `native`: ini unduhan berkas dari /api, bukan navigasi halaman. Navigasi
    // sisi klien tidak pernah menyimpan berkasnya.
    <ButtonLink native variant="outlined" size="sm" href="/api/admin/undian/entries/template" icon={<DownloadSimple size={16} />}>Download template</ButtonLink>
  );

  const list = (
    <Pane aria-label="Entry lists">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Entry lists</h2>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={open} onClick={onOpen}>New entry list</Button>
      </PaneHeader>
      <PaneBody>
        {loadFailed ? (
          <div className="p-4"><PaneError>Could not load entry lists. Reload the page.</PaneError></div>
        ) : !loaded ? (
          <PageLoading />
        ) : groups.length === 0 ? (
          <EmptyState
            plain
            icon={<ListBullets size={40} />}
            title="No entry lists yet"
            description="For entries not registered as participants: paper coupons, sponsor lists or seat numbers. Prizes can be drawn from these lists instead of event participants."
            action={open ? undefined : <Button size="sm" icon={<Plus size={16} />} onClick={onOpen}>Create entry list</Button>}
          />
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.id} className="flex items-center gap-3 border-b border-outline-variant px-4 py-2.5 text-body-medium">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{group.name}</p>
                  <p className="tabular-nums text-on-surface-variant">{group.entry_count} {group.entry_count === 1 ? "row" : "rows"}</p>
                </div>
                <IconButton simpan size="sm" label={`Delete entry list ${group.name}`} onClick={() => setHapus(group)}><Trash size={16} /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </PaneBody>
    </Pane>
  );

  const detail = open ? (
    <Pane as="aside" aria-label="New entry list">
      <PaneHeader className="px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-title-medium font-semibold">New entry list</h2>
          <p className="text-body-medium text-on-surface-variant">From a file or pasted text.</p>
        </div>
        <IconButton size="sm" label="Close new entry list" onClick={onClose} disabled={importing}><X size={16} /></IconButton>
      </PaneHeader>
      <PaneBody>
        <form id="form-daftar" onSubmit={(event) => { event.preventDefault(); onImport(); }} className="flex flex-col gap-4 px-5 py-4">
          {error ? <PaneError>{error}</PaneError> : null}
          {/* Templat di ATAS formulir: panitia yang belum punya berkas harus
              menemukannya sebelum mulai menyusun format sendiri. */}
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-container-high p-3 text-body-medium">
            <span className="min-w-0 flex-1 text-on-surface-variant">Need a file? The XLSX template includes recognised columns and two example rows.</span>
            {templat}
          </div>
          <Field label="Entry list name" htmlFor="import-name">
            <input id="import-name" value={importName} onChange={(event) => onImportName(event.target.value)} className={INPUT} placeholder="Afternoon session coupons" />
          </Field>

          <div>
            <p className="text-body-medium font-medium">Upload file</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-outline px-3 text-body-medium font-medium hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary">
                <UploadSimple size={16} className="shrink-0" aria-hidden />
                <span className="truncate">{importFile ? importFile.name : "Choose an .xlsx, .csv or .txt file"}</span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.csv,.txt,.tsv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    // Nilai input dikosongkan supaya memilih berkas yang sama
                    // dua kali berturut-turut tetap memicu onChange.
                    event.target.value = "";
                    onImportFile(file);
                  }}
                />
              </label>
              {importFile ? <Button variant="text" size="sm" className="text-error" onClick={() => onImportFile(null)}>Remove file</Button> : null}
            </div>
            {importFile ? <p className="mt-1 text-body-medium text-on-surface-variant">The file is read on the server when you submit. The text box below is ignored.</p> : null}
          </div>

          <div className="flex items-center gap-3 text-body-medium text-on-surface-variant">
            <span className="h-px flex-1 bg-outline-variant" />
            or paste
            <span className="h-px flex-1 bg-outline-variant" />
          </div>

          <Field label="Entry list contents" htmlFor="import-text" hint="Paste directly from Excel, or enter one name per line. Recognised columns: name, company, code, weight. Only name is required.">
            <textarea
              id="import-text"
              value={importText}
              onChange={(event) => onImportText(event.target.value)}
              rows={7}
              disabled={importFile !== null}
              className="mt-1.5 w-full resize-y rounded-md border border-outline bg-surface-container-lowest p-3 text-body-medium leading-6 outline-none focus:border-primary disabled:opacity-50"
              placeholder={"Name,Company,Code,Weight\nBudi Santoso,PT Maju,K-001,1\nSiti Rahayu,PT Jaya,K-002,3"}
            />
          </Field>
        </form>
      </PaneBody>
      <PaneFooter>
        <Button simpan type="submit" form="form-daftar" size="sm" loading={importing} icon={<Plus size={16} />}>Create entry list</Button>
      </PaneFooter>
    </Pane>
  ) : null;

  return (
    <>
      <ListDetail list={list} detail={detail} detailWidth={480} />
      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!menghapus}
        tone="danger"
        title={`Delete entry list ${hapus?.name ?? ""}?`}
        description={`${hapus?.entry_count ?? 0} ${(hapus?.entry_count ?? 0) === 1 ? "row" : "rows"} will also be deleted. Prizes using this list remain, but cannot be drawn until assigned another list. Previous winners from this list stay on record.`}
        actions={
          <>
            <Button variant="outlined" disabled={menghapus} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan
              variant="danger"
              loading={menghapus}
              onClick={async () => {
                if (!hapus) return;
                setMenghapus(true);
                await onDeleteGroup(hapus.id);
                setMenghapus(false);
                setHapus(null);
              }}
            >
              Delete entry list
            </Button>
          </>
        }
      />
    </>
  );
}
