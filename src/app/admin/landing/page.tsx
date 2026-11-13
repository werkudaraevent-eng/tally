"use client";

import { AdminBarPortal } from "@/components/admin/page-context";
import { Banner, Button, ButtonLink, Dialog, PageLoading } from "@/components/m3";
import { ArrowSquareOut, DownloadSimple, Trash, UploadSimple, Warning } from "@phosphor-icons/react";
import { cx } from "@/lib/m3/cx";
import { LandingPreview } from "@/components/admin/landing-preview";
import { plural } from "@/lib/plural";
import { PANEL_BAWAAN, PANEL_MAX, PANEL_MIN } from "./editor/editor-bantu";
import { useLandingCmsPage0 } from "./editor/editor-0";
import { useLandingCmsPage1 } from "./editor/editor-1";
import { useLandingCmsPage2 } from "./editor/editor-2";
import { useLandingCmsPage3 } from "./editor/editor-3";
import { useLandingCmsPage4 } from "./editor/editor-4";
import { useLandingCmsPage5 } from "./editor/editor-5";


export default function LandingCmsPage() {
  const h0 = useLandingCmsPage0();
  const h1 = useLandingCmsPage1({ ...h0 });
  const h2 = useLandingCmsPage2({ ...h1, ...h0 });
  const h3 = useLandingCmsPage3({ ...h1, ...h0 });
  const h4 = useLandingCmsPage4({ ...h3, ...h0, ...h2 });
  const h5 = useLandingCmsPage5({ ...h0, ...h4, ...h3, ...h2, ...h1 });
  const { facts, ekspor, pilihBerkas, impor, berubah, save, busy, error, previewKey, sorot, drafPratinjau, forum, halamanPratinjau, setHalamanPratinjau, modeEn, bagian, pilihBahasa, hanyaFormulir, lebarPanel, konfirmasiHapus, setKonfirmasiHapus, urungan } = h0;
  const { hapusBlok, urungkan } = h4;
  const { labelPilih, pilihDariPratinjau, mulaiSeretPanel, seretPanel, lepasPanel, tombolPanel, simpanLebar, panel, jumlahHapus } = h5;


  return (
    // Tidak memakai `WorkspacePage fill`: pada layar pendek (laptop berskala
    // 150%) `fill` melepas kunci tinggi dan halaman bergulir. Editor ini selalu
    // setinggi layar; pratinjau dan panel setelan masing-masing bergulir sendiri.
    // Judul, aksi, dan Simpan ada di bilah atas, jadi tidak ada kepala halaman
    // yang memakan tinggi di sini.
    <main lang="en" className="flex w-full flex-col gap-4 bg-surface p-4 text-on-surface lg:h-[calc(100dvh-var(--workspace-top,58px))] lg:overflow-hidden">
      <AdminBarPortal
        judul={
          <div className="flex min-w-0 shrink items-baseline gap-3">
            <h1 className="truncate text-title-medium font-semibold text-on-surface">Event page</h1>
            {facts ? (
              <span className="hidden truncate text-body-small text-on-surface-variant xl:inline" title="The address printed on invitations and QR codes">
                /e/{facts.slug}
              </span>
            ) : null}
          </div>
        }
        aksi={facts ? (
          <>
            {/* Di ponsel bilahnya hanya muat judul dan Simpan; Ekspor/Impor jarang dipakai di sana. */}
            <span className="hidden md:contents">
              <Button variant="text" size="sm" icon={<DownloadSimple size={16} />} onClick={ekspor}>
                Export
              </Button>
              <Button variant="text" size="sm" icon={<UploadSimple size={16} />} onClick={() => pilihBerkas.current?.click()}>
                Import
              </Button>
              <input ref={pilihBerkas} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void impor(event)} />
              <ButtonLink href={`/e/${facts.slug}`} target="_blank" rel="noreferrer" variant="outlined" size="sm" icon={<ArrowSquareOut size={16} />}>
                View page
              </ButtonLink>
            </span>
            <span aria-hidden className="mx-1 hidden h-7 w-px bg-outline-variant md:block" />
            <span role="status" className="hidden min-w-[7.5rem] items-center justify-end gap-1.5 whitespace-nowrap text-body-small text-on-surface-variant md:inline-flex">
              <span aria-hidden className={cx("size-2 rounded-full", berubah ? "bg-warning" : "bg-success")} />
              {berubah ? "Unsaved changes" : "Saved"}
            </span>
            <Button simpan size="sm" onClick={() => void save()} loading={busy}>Save</Button>
          </>
        ) : null}
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {facts ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-0">
          <div id="pratinjau-acara" className="flex min-h-[70vh] min-w-0 flex-1 scroll-mt-4 flex-col *:flex-1 lg:min-h-0">
            <LandingPreview
              slug={facts.slug}
              reloadKey={previewKey}
              sorot={sorot}
              draf={drafPratinjau}
              halaman={forum ? halamanPratinjau : null}
              onHalaman={setHalamanPratinjau}
              bahasa={modeEn && bagian === "susunan" ? "en" : "id"}
              onBahasa={pilihBahasa}
              formulir={hanyaFormulir}
              labelPilih={labelPilih}
              onPilih={pilihDariPratinjau}
            />
          </div>
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Settings panel width"
            aria-controls="panel-setelan"
            aria-valuemin={PANEL_MIN}
            aria-valuemax={PANEL_MAX}
            aria-valuenow={lebarPanel}
            onPointerDown={mulaiSeretPanel}
            onPointerMove={seretPanel}
            onPointerUp={lepasPanel}
            onPointerCancel={lepasPanel}
            onKeyDown={tombolPanel}
            onDoubleClick={() => simpanLebar(PANEL_BAWAAN)}
            title="Drag to resize the panel. Double-click for the default width."
            className="group hidden w-4 shrink-0 cursor-col-resize touch-none items-center justify-center rounded-sm outline-none lg:flex"
          >
            <span className="h-10 w-1 rounded-full bg-outline transition-colors group-hover:bg-on-surface-variant group-focus-visible:h-16 group-focus-visible:bg-primary group-active:bg-primary" />
          </div>
          <div
            className="flex min-h-[70vh] w-full flex-col *:flex-1 lg:min-h-0 lg:w-[var(--panel-w)] lg:shrink-0"
            style={{ "--panel-w": `${lebarPanel}px` } as React.CSSProperties}
          >
            {panel}
          </div>
        </div>
      ) : error ? null : <PageLoading />}

      <Dialog
        open={konfirmasiHapus !== null}
        onClose={() => setKonfirmasiHapus(null)}
        tone="danger"
        icon={<Trash size={20} />}
        title={jumlahHapus > 1 ? `Delete ${plural(jumlahHapus, "hidden block")}?` : `Delete “${konfirmasiHapus?.judul || "this block"}”?`}
        description={
          jumlahHapus > 1
            ? `The content of these ${jumlahHapus} blocks is deleted too. Hidden built-in sections stay. Takes effect when you save, and you can undo it until then.`
            : "The content of this block is deleted too. Takes effect when you save, and you can undo it until then."
        }
        actions={
          <>
            <Button variant="text" onClick={() => setKonfirmasiHapus(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (konfirmasiHapus) hapusBlok(konfirmasiHapus.ids);
                setKonfirmasiHapus(null);
              }}
            >
              {jumlahHapus > 1 ? `Delete ${plural(jumlahHapus, "block")}` : "Delete block"}
            </Button>
          </>
        }
      />

      {urungan ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-popover flex -translate-x-1/2 items-center gap-2 rounded-sm bg-inverse-surface py-1.5 pl-4 pr-1.5 text-body-medium text-inverse-on-surface shadow-level3">
          <span>{urungan.pesan}</span>
          <button type="button" onClick={urungkan} className="h-9 rounded-sm px-3 font-medium text-inverse-primary hover:bg-white/10">
            Undo
          </button>
        </div>
      ) : null}
    </main>
  );
}
