"use client";

import { CaretDown, DownloadSimple, Printer, ShareNetwork } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTerkunci } from "@/components/admin/page-context";
import { GayaLaporan, Panggung } from "@/components/laporan/panggung";
import { SlideLaporan } from "@/components/laporan/slide";
import {
  Banner, Button, Dialog, PageLoading, Popover, POPOVER_ITEM, StatusChip, usePopoverAnchor, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { withEventPrefix } from "@/lib/event-path";
import { geser, type ConfigLaporan } from "@/lib/laporan/config";
import { cx } from "@/lib/m3/cx";
import { DaftarSlide } from "./daftar-slide";
import { EditorSlide } from "./editor-slide";
import type { DataLaporan, Draf } from "./jenis";

/**
 * Admin > Event report: deck 16:9 untuk manajemen, dihitung ulang dari data
 * setiap kali halaman dibuka. Kiri daftar slide, tengah pratinjau, kanan
 * pengaturan slide terpilih. Export: PowerPoint (grafik asli) atau cetak PDF.
 * Share with client mengunci angka saat itu ke tab Laporan di tampilan klien.
 */

const waktu = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function HalamanLaporan() {
  const toast = useToast();
  const pathname = usePathname();
  const terkunci = useTerkunci(true);
  const [data, setData] = useState<DataLaporan | null>(null);
  const [status, setStatus] = useState<"muat" | "siap" | "belum" | "gagal">("muat");
  const [pilih, setPilih] = useState("ringkas");
  const [terbuka, setTerbuka] = useState(false);
  const [draf, setDraf] = useState<Draf>({});
  const [bagikan, setBagikan] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  /** Naik setiap data dimuat ulang (mis. sesudah 409), supaya kolom editor ikut diisi ulang. */
  const [muatKe, setMuatKe] = useState(0);
  const versi = useRef<string | null>(null);
  const configRef = useRef<ConfigLaporan | null>(null);
  const antre = useRef<Promise<unknown>>(Promise.resolve());
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();

  const muat = useCallback(async () => {
    const res = await fetch("/api/admin/laporan", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? ((await res.json()) as DataLaporan | { siap: false }) : null;
    if (!json) return setStatus("gagal");
    if (!json.siap) return setStatus("belum");
    versi.current = json.updated_at;
    configRef.current = json.config;
    setMuatKe((n) => n + 1);
    setData(json);
    setStatus("siap");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat]);

  /**
   * Simpan berurutan: config berubah seketika di layar, PUT antre satu per satu
   * dan setiap PUT membawa updated_at hasil PUT sebelumnya (compare-and-swap).
   */
  const simpan = useCallback((ubah: (c: ConfigLaporan) => ConfigLaporan) => {
    if (!configRef.current) return;
    const config = ubah(configRef.current);
    configRef.current = config;
    setData((lama) => (lama ? { ...lama, config } : lama));
    antre.current = antre.current.then(async () => {
      const res = await fetch("/api/admin/laporan", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ config, updated_at: versi.current }) }).catch(() => null);
      if (res?.status === 409) {
        toast.warning("This report was changed in another tab", "The latest version is loaded. Make your change again.");
        return muat();
      }
      const json = res?.ok ? ((await res.json()) as Partial<DataLaporan> & { updated_at: string }) : null;
      if (!json) return toast.error("Couldn't save the report", "Check the connection and try again.");
      versi.current = json.updated_at;
      setData((lama) => (lama ? { ...lama, updated_at: json.updated_at, ...(json.deck ? { deck: json.deck, daftar: json.daftar!, absen: json.absen!, semua: json.semua! } : {}) } : lama));
      setDraf({});
    });
  }, [muat, toast]);

  const pilihSlide = (kunci: string) => { setPilih(kunci); setDraf({}); setTerbuka(true); };

  const tambah = (jenis: "pertanyaan" | "teks") => {
    if (!data) return;
    const id = `t-${Math.random().toString(36).slice(2, 10)}`;
    const q = data.pilihan.pertanyaan[0];
    simpan((c) => ({ ...c, tambahan: [...c.tambahan, jenis === "teks" ? { id, jenis, judul: "", poin: [] } : { id, jenis, sumber: q.sumber, kunci: q.kunci }] }));
    pilihSlide(id);
  };

  const kirimBagikan = async (aksi: "bagikan" | "tarik") => {
    setSibuk(true);
    await antre.current;
    const res = await fetch("/api/admin/laporan/bagikan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aksi, updated_at: versi.current }) }).catch(() => null);
    setSibuk(false);
    if (res?.status === 409) { toast.warning("This report was changed in another tab", "The latest version is loaded. Try again."); return muat(); }
    const json = res?.ok ? ((await res.json()) as { updated_at: string; shared_at: string | null }) : null;
    if (!json) return toast.error("Couldn't update sharing", "Check the connection and try again.");
    versi.current = json.updated_at;
    setData((lama) => (lama ? { ...lama, updated_at: json.updated_at, shared_at: json.shared_at } : lama));
    setBagikan(false);
    toast.success(aksi === "bagikan" ? "Shared with the client" : "No longer shared with the client");
  };

  if (status === "belum") {
    return (
      <WorkspacePage width="form">
        <WorkspaceHeader title="Event report" />
        <Banner tone="info">Event report isn&apos;t active yet: database migration 202611080060 has not been run.</Banner>
      </WorkspacePage>
    );
  }
  if (status === "gagal") {
    return (
      <WorkspacePage width="form">
        <WorkspaceHeader title="Event report" />
        <Banner tone="error" actions={<Button variant="text" onClick={() => void muat()}>Try again</Button>}>The report couldn&apos;t be loaded.</Banner>
      </WorkspacePage>
    );
  }
  if (!data) return <PageLoading />;

  const dasar = data.semua[pilih] ?? data.semua.sampul;
  const kunci = data.semua[pilih] ? pilih : "sampul";
  const slide = dasar.jenis === "isi" ? { ...dasar, judul: draf.judul?.trim() || dasar.judul, catatan: draf.catatan !== undefined ? draf.catatan.trim() || null : dasar.catatan } : dasar;
  const nomorDeck = data.deck.slide.findIndex((s) => s.kunci === kunci);
  const nomor = nomorDeck >= 0 ? nomorDeck + 1 : null;
  const total = data.deck.slide.length;

  return (
    <WorkspacePage fill>
      <GayaLaporan />
      <WorkspaceHeader
        title="Event report"
        meta={
          <>
            {data.shared_at ? <StatusChip tone="success">Shared {waktu(data.shared_at)}</StatusChip> : <StatusChip tone="neutral">Draft</StatusChip>}
            <span>Figures as of {waktu(data.deck.dibuat)}. They update each time you open this page.</span>
          </>
        }
        actions={
          <>
            <span ref={setPemicu} className="inline-flex">
              <Button variant="outlined" trailingIcon={<CaretDown size={16} aria-hidden />} aria-haspopup="menu" aria-expanded={menu.open} aria-controls={menu.open ? menuId : undefined} onClick={menu.toggle}>Export</Button>
            </span>
            <Button icon={<ShareNetwork size={18} aria-hidden />} disabled={terkunci} onClick={() => setBagikan(true)}>{data.shared_at ? "Sharing" : "Share with client"}</Button>
          </>
        }
      />
      {menu.open ? (
        <Popover anchor={menu} id={menuId} label="Export" width={260}>
          <a role="menuitem" className={POPOVER_ITEM} href="/api/admin/laporan/pptx" download onClick={() => menu.tutup()}>
            <DownloadSimple size={18} aria-hidden /> PowerPoint (.pptx)
          </a>
          <a role="menuitem" className={POPOVER_ITEM} href={withEventPrefix("/cetak-laporan", pathname)} target="_blank" rel="noopener" onClick={() => menu.tutup()}>
            <Printer size={18} aria-hidden /> Print or save as PDF
          </a>
        </Popover>
      ) : null}

      {/* Tiga kolom hanya di layar lebar (≥ 1536). Di 1024–1535 pratinjau di atas editor,
          supaya slide tidak menyusut ke 20–240 px di samping sidebar. */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <div className={cx("flex min-h-0 min-w-0 flex-col *:flex-1", terbuka && "max-lg:hidden")}>
          <DaftarSlide data={data} pilih={kunci} onPilih={pilihSlide} onTampil={(k, v) => simpan((c) => ({ ...c, sembunyi: v ? c.sembunyi.filter((x) => x !== k) : [...c.sembunyi, k] }))} onTambah={tambah} terkunci={terkunci} />
        </div>
        <div className={cx("flex min-h-0 min-w-0 flex-col gap-4 max-2xl:overflow-y-auto 2xl:contents", !terbuka && "max-lg:hidden")}>
        <section aria-label="Preview" className="flex min-w-0 shrink-0 flex-col gap-3 rounded-lg bg-surface-container p-4 2xl:min-h-0 2xl:shrink 2xl:overflow-auto">
          <div className="flex items-center justify-between text-body-small text-on-surface-variant">
            <span>{nomor ? `Slide ${nomor} of ${total}` : "Hidden from the report"}</span>
            <span>16:9</span>
          </div>
          <Panggung>
            <SlideLaporan slide={slide} deck={data.deck} nomor={nomor ?? 0} total={total} petunjuk={kunci === "usulan" ? "Add rows in the slide editor. This slide stays out of exports until it has one." : "Add points in the slide editor."} />
          </Panggung>
          <p className="text-body-small text-on-surface-variant">Hidden and empty slides stay out of every export and the client view.</p>
        </section>
        <div className="flex min-w-0 shrink-0 flex-col *:flex-1 2xl:min-h-0 2xl:shrink">
          <EditorSlide
            key={`${kunci}:${muatKe}`}
            data={data}
            kunci={kunci}
            nomor={nomor}
            terkunci={terkunci}
            onSimpan={simpan}
            onDraf={(d) => setDraf((x) => ({ ...x, ...d }))}
            onGeser={(arah) => simpan((c) => geser(c, kunci, arah))}
            onTutup={() => setTerbuka(false)}
          />
        </div>
        </div>
      </div>

      <Dialog
        open={bagikan}
        onClose={() => setBagikan(false)}
        title={data.shared_at ? "Shared with the client" : "Share with the client?"}
        description={
          data.shared_at
            ? `The client has seen the figures as of ${waktu(data.shared_at)} since then. Update it to show today's figures and edits, or stop sharing.`
            : "The client's view gets a Report tab with these slides. The figures are locked as of now and don't move until you share again."
        }
        actions={
          data.shared_at ? (
            <>
              <Button variant="text" disabled={sibuk} onClick={() => void kirimBagikan("tarik")}>Stop sharing</Button>
              <Button loading={sibuk} onClick={() => void kirimBagikan("bagikan")}>Update shared copy</Button>
            </>
          ) : (
            <>
              <Button variant="text" onClick={() => setBagikan(false)}>Cancel</Button>
              <Button loading={sibuk} onClick={() => void kirimBagikan("bagikan")}>Share</Button>
            </>
          )
        }
      />
    </WorkspacePage>
  );
}
