"use client";

import { ArrowDown, ArrowSquareOut, ArrowUp, DotsSixVertical, Info, Plus, Stack, Trash, UploadSimple, Warning } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { useToast } from "@/components/toast";
import { normalizeBranding } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
import { DEFAULT_HEADER, formatClock, formatEventDate, type RundownHeader, type RundownItem, type RundownSection } from "@/lib/rundown";
import { bandingkanBaris, geserDalamSlot, kunciSlot, pindahDalamSlot, susunUlangSlot } from "@/lib/rundown-urutan";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, ListRow, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, StatusChip, SupportingPane, Switch, Tabs, TextArea, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { Kelompok } from "@/components/admin/compact-form";

// CMS rundown acara. Supporting pane: jadwal bagian aktif di panel utama,
// penyunting di panel kanan (baris terpilih, setelan bagian, header publik).
//
// Bentuknya daftar, bukan kanvas: rundown adalah urutan waktu, dan satu-satunya
// tata letak yang benar adalah dari jam paling awal ke paling akhir. Karena itu
// tidak ada drag-and-drop bebas di sini: urutan dihitung dari jam mulai, sehingga
// admin yang mengetik jam yang benar tidak perlu lagi menyusun ulang barisnya.
// Pengecualiannya baris berjam mulai sama (sesi paralel): urutan di dalam slot
// itu disimpan di `sort_order` dan diatur admin lewat pegangan geser atau tombol
// Move up/Move down. Baris berjam unik tidak punya pegangan, karena menggesernya
// ke luar slot jamnya akan membuat jadwal berbohong.

type Payload = { sections: RundownSection[]; items: RundownItem[] };

/** Baris baru yang sedang diisi, per bagian. */
type Draft = { start_time: string; end_time: string; title: string; subtitle: string; is_break: boolean };

type Panel = "baris" | "bagian" | "header";

const EMPTY_DRAFT: Draft = { start_time: "", end_time: "", title: "", subtitle: "", is_break: false };

const CONTOH_KETERANGAN = "Panelists:\nSantoso, Chairman - ASPI\nModerator:\nAbraham J. Adriaansz, President Director - PT Rintis Sejahtera";

// Nilai yang ditampilkan <input type="color"> ketika kolomnya masih null.
//
// Bukan nilai yang disimpan: kolomnya tetap null sampai admin benar-benar memilih
// warna. `<input type="color">` tidak bisa berkeadaan kosong, jadi ia harus diberi
// sesuatu, dan yang paling tidak mengejutkan adalah warna yang memang sedang
// tampil di halaman publik.
const BRANDING_FALLBACK = {
  background_color: "#ffffff",
  text_color: "#1a1a1a",
  accent_color: "#2649d0",
} as const;

function fokusJudulBaru() {
  window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-draft-title]")?.focus(), 0);
}

export default function RundownAdminPage() {
  const [sections, setSections] = useState<RundownSection[]>([]);
  const [items, setItems] = useState<RundownItem[]>([]);
  // Jam mulai yang terakhir tersimpan, per id. Suntingan jam yang belum disimpan
  // hidup di `items`; susun ulang dikunci selama ada yang berbeda dari sini,
  // karena server menilai slot dari jam yang tersimpan.
  const [savedStart, setSavedStart] = useState<Map<number, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>("baris");
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);
  const [savingSection, setSavingSection] = useState(false);
  const [deletingSection, setDeletingSection] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  // Header berdiri sendiri dari bagian: satu setelan untuk seluruh acara, dengan
  // tombol Simpan sendiri. Digabung ke tombol Simpan bagian, admin yang hanya ingin
  // mengubah warna header terpaksa ikut menyimpan setelan tab yang tidak dia sentuh.
  const [header, setHeader] = useState<RundownHeader>(DEFAULT_HEADER);
  const [savingHeader, setSavingHeader] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  // Penanda simpan dan hapus dilacak PER baris, bukan satu penanda global: satu
  // penanda akan menonaktifkan seluruh tombol di halaman padahal hanya satu baris
  // yang sedang bekerja.
  const [savingItem, setSavingItem] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<number | null>(null);
  // Konfirmasi hapus lewat dialog: satu klik tak sengaja tidak boleh langsung
  // membuang data.
  const [confirmItem, setConfirmItem] = useState<RundownItem | null>(null);
  const [confirmSection, setConfirmSection] = useState<RundownSection | null>(null);
  // Susun ulang sesi paralel. Satu permintaan pada satu waktu: dua geseran yang
  // berbalapan bisa saling menimpa nomor urut.
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; after: boolean } | null>(null);
  const [reorderNote, setReorderNote] = useState("");
  const [error, setError] = useState("");
  // Zona acara dipakai supaya tanggal yang diecho di bawah kolom tanggal dihitung
  // dengan zona yang sama dengan halaman publik. Kalau tidak, admin bisa membaca
  // "Kamis" di CMS sementara tamu membaca "Rabu".
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();

  async function load() {
    // Bagian dan header dimuat bersamaan: keduanya dibutuhkan sebelum halaman ini
    // berguna, dan memuatnya berurutan hanya menambah satu perjalanan jaringan.
    const hasil = await Promise.all([
      fetch("/api/admin/rundown/sections", { cache: "no-store" }),
      fetch("/api/admin/rundown/header", { cache: "no-store" }),
    ]).catch(() => null);
    if (!hasil) { setError("Koneksi terputus. Data rundown tidak bisa dimuat."); return; }
    const [sectionResponse, headerResponse] = hasil;
    if (!sectionResponse.ok) { setError("Data rundown gagal dimuat."); return; }
    const data = (await sectionResponse.json()) as Payload;
    setSections(data.sections);
    setItems(data.items);
    setSavedStart(new Map(data.items.map((item) => [item.id, item.start_time])));
    setActiveId((current) => (current && data.sections.some((row) => row.id === current) ? current : data.sections[0]?.id ?? null));
    // Header yang gagal dimuat tidak menggagalkan seluruh halaman: jadwalnya tetap
    // bisa disusun, dan nilai bawaan tetap aman disimpan.
    if (headerResponse.ok) setHeader((await headerResponse.json()) as RundownHeader);
    setLoaded(true);
  }

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const active = sections.find((row) => row.id === activeId) ?? null;
  const draft = (activeId !== null ? drafts[activeId] : null) ?? EMPTY_DRAFT;

  // Urut jam, lalu sort_order untuk butir berjam sama. Urutan yang sama dipakai
  // halaman publik, supaya yang dilihat admin sama dengan yang dilihat tamu.
  const activeItems = useMemo(() => {
    if (activeId === null) return [];
    return items.filter((item) => item.section_id === activeId).sort(bandingkanBaris);
  }, [items, activeId]);

  // Ada jam mulai yang diubah tetapi belum disimpan di bagian ini.
  const jamBelumDisimpan = activeItems.some((item) => kunciSlot(item.start_time) !== kunciSlot(savedStart.get(item.id) ?? item.start_time));

  // Id baris per slot jam, dalam urutan tampil. Slot berisi satu baris tidak
  // bisa disusun ulang. Kosong selama ada jam yang belum disimpan: slot dari jam
  // lokal bisa berbeda dari slot di server, dan susunannya akan ditolak.
  const slots = useMemo(() => {
    const peta = new Map<string, number[]>();
    if (jamBelumDisimpan) return peta;
    for (const item of activeItems) {
      const kunci = kunciSlot(item.start_time);
      peta.set(kunci, [...(peta.get(kunci) ?? []), item.id]);
    }
    return peta;
  }, [activeItems, jamBelumDisimpan]);
  const adaSlotParalel = [...slots.values()].some((ids) => ids.length > 1);

  const selectedItem = activeItems.find((item) => item.id === selectedItemId) ?? null;
  const selectedSlot = selectedItem ? slots.get(kunciSlot(selectedItem.start_time)) ?? [] : [];
  // Baris lain yang berjam mulai sama dengan baris terpilih menurut jam lokal.
  // Dipakai untuk menjelaskan kenapa susun ulang terkunci.
  const selectedSlotLokal = selectedItem ? activeItems.filter((item) => kunciSlot(item.start_time) === kunciSlot(selectedItem.start_time)).length : 0;

  // Branding dinormalisasi sebelum diserahkan ke <BrandingEditor>.
  //
  // Kolom skala bertipe `numeric` dan datang dari driver sebagai string; editor
  // memakainya sebagai angka pada penggeser. Tanpa langkah ini penggesernya lompat
  // ke nilai bawaan pada render pertama, dan admin yang menyimpan tanpa menyentuh
  // apa pun justru menimpa skala yang sudah dia setel sebelumnya.
  const headerBranding = useMemo(
    () => normalizeBranding(header as unknown as Record<string, unknown>),
    [header],
  );

  function updateSection(id: number, changes: Partial<RundownSection>) {
    setSections((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function updateHeader(changes: Partial<RundownHeader>) {
    setHeader((current) => ({ ...current, ...changes }));
  }

  function pilihBagian(id: number) {
    setActiveId(id);
    setSelectedItemId(null);
  }

  function mulaiTambahBaris() {
    setSelectedItemId(null);
    setPanel("baris");
    fokusJudulBaru();
  }

  /**
   * Unggah gambar latar header.
   *
   * Memakai endpoint yang sama dengan Papan peringkat dan denah
   * (`/api/display/background`). Endpoint itu sudah generik: menerima berkas,
   * memvalidasi jenis dan ukuran, lalu mengembalikan URL publik. Membuat endpoint
   * ketiga hanya menyalin aturan yang sama, dan salinan selalu berakhir berbeda.
   *
   * Hasilnya hanya masuk state; admin tetap harus menekan Simpan header, sama
   * seperti perubahan warna dan judul.
   */
  async function uploadHeaderBackground(file: File) {
    setUploadingBackground(true); setError("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/display/background", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    setUploadingBackground(false);
    if (!response.ok) {
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Upload gambar gagal.";
      setError(failure);
      toast.error("Upload gambar gagal", failure);
      return;
    }
    updateHeader({ background_image_url: data.url });
    toast.info("Gambar terunggah", "Klik Simpan header untuk menerapkannya ke halaman publik.");
  }

  async function saveHeader() {
    setSavingHeader(true); setError("");
    const response = await fetch("/api/admin/rundown/header", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(header),
    });
    const data = await response.json().catch(() => ({}));
    setSavingHeader(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Header gagal disimpan.");
      setError(failure); toast.error("Header gagal disimpan", failure);
      return;
    }
    setHeader(data as RundownHeader);
    toast.success("Header tersimpan", "Berlaku untuk semua tab di halaman publik.");
  }

  function updateItem(id: number, changes: Partial<RundownItem>) {
    setItems((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function updateDraft(changes: Partial<Draft>) {
    if (activeId === null) return;
    setDrafts((current) => ({ ...current, [activeId]: { ...(current[activeId] ?? EMPTY_DRAFT), ...changes } }));
  }

  /** Pesan gagal dari API. `details.message` lebih spesifik dari pesan generiknya. */
  function failureMessage(data: { error?: { message?: string; details?: { message?: string } } }, fallback: string) {
    return data.error?.details?.message ?? data.error?.message ?? fallback;
  }

  async function createSection() {
    const name = newSectionName.trim();
    if (!name) return;
    setCreatingSection(true); setError("");
    const response = await fetch("/api/admin/rundown/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    setCreatingSection(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Bagian gagal ditambahkan.");
      setError(failure); toast.error("Bagian gagal ditambahkan", failure);
      return;
    }
    setNewSectionName("");
    setAddSectionOpen(false);
    pilihBagian((data as RundownSection).id);
    setPanel("bagian");
    toast.success("Bagian ditambahkan", "Masih draf. Isi tanggal dan jadwalnya lalu publikasikan.");
    await load();
  }

  async function saveSection(section: RundownSection) {
    setSavingSection(true); setError("");
    const response = await fetch("/api/admin/rundown/sections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: section.id,
        name: section.name,
        title: section.title,
        subtitle: section.subtitle,
        event_date: section.event_date,
        highlight_current: section.highlight_current,
        is_published: section.is_published,
        sort_order: section.sort_order,
        // Branding TIDAK dikirim dari sini. Ia setelan global dengan tombol Simpan
        // sendiri di panel Header publik, karena header adalah identitas acara.
      }),
    });
    const data = await response.json();
    setSavingSection(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Bagian gagal disimpan.");
      setError(failure); toast.error("Bagian gagal disimpan", failure);
      return;
    }
    toast.success("Bagian tersimpan", section.is_published ? "Bagian ini tampil di halaman publik." : "Bagian ini belum tampil di publik.");
    await load();
  }

  async function deleteSection(section: RundownSection) {
    setError("");
    setDeletingSection(true);
    const response = await fetch(`/api/admin/rundown/sections?id=${section.id}`, { method: "DELETE" });
    setDeletingSection(false);
    setConfirmSection(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const failure = failureMessage(data, "Bagian gagal dihapus.");
      setError(failure); toast.error("Bagian gagal dihapus", failure);
      return;
    }
    setActiveId(null);
    setSelectedItemId(null);
    toast.success("Bagian dihapus", "Seluruh baris jadwalnya ikut terhapus.");
    await load();
  }

  async function addItem() {
    if (activeId === null) return;
    const title = draft.title.trim();
    if (!title || !draft.start_time) {
      setError("Jam mulai dan nama acara wajib diisi.");
      return;
    }
    setAddingItem(true); setError("");
    const response = await fetch("/api/admin/rundown/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: activeId,
        start_time: draft.start_time,
        // String kosong berarti butir tanpa durasi, bukan jam kosong yang akan
        // ditolak validasi.
        end_time: draft.end_time || null,
        title,
        subtitle: draft.subtitle.trim() || null,
        is_break: draft.is_break,
      }),
    });
    const data = await response.json();
    setAddingItem(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Baris gagal ditambahkan.");
      setError(failure); toast.error("Baris gagal ditambahkan", failure);
      return;
    }
    // Jam mulai baris berikutnya diisi jam selesai baris ini. Rundown disusun
    // berurutan dan bersambung, jadi ini menghilangkan pengetikan yang berulang
    // sekaligus mengurangi celah waktu yang tidak disengaja.
    setDrafts((current) => ({ ...current, [activeId]: { ...EMPTY_DRAFT, start_time: draft.end_time || "" } }));
    toast.success("Baris ditambahkan");
    await load();
  }

  async function saveItem(item: RundownItem) {
    setSavingItem(item.id); setError("");
    const response = await fetch("/api/admin/rundown/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        start_time: formatClock(item.start_time),
        end_time: item.end_time ? formatClock(item.end_time) : null,
        title: item.title,
        subtitle: item.subtitle,
        is_break: item.is_break,
        is_published: item.is_published,
      }),
    });
    const data = await response.json();
    setSavingItem(null);
    if (!response.ok) {
      const failure = failureMessage(data, "Baris gagal disimpan.");
      setError(failure); toast.error("Baris gagal disimpan", failure);
      return;
    }
    toast.success("Baris tersimpan");
    await load();
  }

  async function deleteItem(item: RundownItem) {
    setDeletingItem(item.id); setError("");
    const response = await fetch(`/api/admin/rundown/items?id=${item.id}`, { method: "DELETE" });
    setDeletingItem(null);
    setConfirmItem(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const failure = failureMessage(data, "Baris gagal dihapus.");
      setError(failure); toast.error("Baris gagal dihapus", failure);
      return;
    }
    setSelectedItemId((current) => (current === item.id ? null : current));
    toast.success("Baris dihapus");
    await load();
  }

  async function reorderSlot(ids: number[], movedId: number) {
    if (activeId === null || reordering) return;
    const sectionItems = items.filter((item) => item.section_id === activeId);
    const changes = susunUlangSlot(sectionItems, ids);
    if (!changes) return;
    // Optimistis: hanya sort_order yang diubah, supaya suntingan baris yang belum
    // disimpan tidak ikut hilang.
    const before = items;
    const apply = (list: Array<{ id: number; sort_order: number }>) =>
      setItems((current) => current.map((row) => {
        const found = list.find((change) => change.id === row.id);
        return found ? { ...row, sort_order: found.sort_order } : row;
      }));
    apply(changes);
    setReordering(true); setError("");
    const response = await fetch("/api/admin/rundown/items/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: activeId, ids }),
    }).catch(() => null);
    setReordering(false);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      // Kembali ke susunan sebelumnya, lalu baca ulang sort_order saja: server
      // menulis baris satu per satu, jadi kegagalan di tengah bisa meninggalkan
      // sebagian perubahan. Kolom lain tidak disentuh supaya suntingan yang belum
      // disimpan tetap ada.
      setItems(before);
      const failure = (data as { error?: { details?: { message?: string } } }).error?.details?.message ?? "Check your connection and try again.";
      setError(failure); toast.error("Order not saved", failure);
      const fresh = await fetch("/api/admin/rundown/sections", { cache: "no-store" }).catch(() => null);
      if (fresh?.ok) apply(((await fresh.json()) as Payload).items);
      return;
    }
    apply((data as { items?: RundownItem[] }).items ?? []);
    const moved = sectionItems.find((item) => item.id === movedId);
    setReorderNote(`${moved?.title.trim() || "Row"} moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}.`);
  }

  function moveInSlot(item: RundownItem, direction: -1 | 1, fromPanel = false) {
    const ids = slots.get(kunciSlot(item.start_time)) ?? [];
    const next = geserDalamSlot(ids, item.id, direction);
    if (!next) return;
    void reorderSlot(next, item.id);
    // Baris sampai di ujung slot: tombol yang baru dipakai jadi mati, jadi fokus
    // dipindah ke tombol arah sebaliknya supaya pengguna keyboard tidak tersesat.
    if (fromPanel) {
      const posisi = next.indexOf(item.id);
      const tujuan = posisi === 0 ? "down" : posisi === next.length - 1 ? "up" : null;
      if (tujuan) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-move="${tujuan}"]`)?.focus());
    }
  }

  const publishedCount = sections.filter((row) => row.is_published).length;
  // Tanpa bagian, hanya header yang bisa disunting.
  const panelAktif: Panel = active ? panel : "header";

  // ---- Panel utama: jadwal bagian aktif -------------------------------------------
  const jadwal = active ? (
    <Pane aria-label={`Jadwal ${active.name}`}>
      <PaneHeader>
        <h2 className="text-body-medium font-semibold text-on-surface">Jadwal</h2>
        <span className="tabular-nums text-body-medium text-on-surface-variant">{activeItems.length} baris</span>
        <span className="min-w-0 flex-1 truncate text-body-medium text-on-surface-variant max-sm:hidden">
          {adaSlotParalel ? "Drag to reorder same-time rows" : "Urut otomatis menurut jam mulai"}
        </span>
        <Button variant="outlined" size="sm" className="ml-auto" icon={<Plus size={16} />} onClick={mulaiTambahBaris}>Tambah baris</Button>
      </PaneHeader>
      <PaneBody>
        {activeItems.length === 0 ? (
          <EmptyState
            plain
            title="Belum ada baris jadwal"
            description="Isi formulir Baris baru di panel samping. Urutan mengikuti jam mulai, jadi tidak perlu disusun ulang."
          />
        ) : (
          <div>
            {activeItems.map((item) => {
              const keterangan = (item.subtitle ?? "").split("\n").map((line) => line.trim()).filter(Boolean).join(" · ");
              const kunci = kunciSlot(item.start_time);
              const slotIds = slots.get(kunci) ?? [];
              const paralel = slotIds.length > 1;
              const posisi = slotIds.indexOf(item.id);
              const judul = item.title.trim() || "Tanpa nama";
              const garis = dropTarget?.id === item.id && dragId !== null && dragId !== item.id ? (dropTarget.after ? "bottom" : "top") : null;
              return (
                <div key={item.id}>
                  {paralel && posisi === 0 ? (
                    <div className="flex items-center gap-2 border-b border-outline-variant py-2 pr-4 pl-4 text-body-small pointer-fine:pl-10 text-on-surface-variant">
                      <Stack size={16} aria-hidden />
                      {slotIds.length} rows start at {formatClock(item.start_time)}
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
                      onSelect={() => { setSelectedItemId(item.id); setPanel("baris"); }}
                      className={cx("items-start py-3", adaSlotParalel && "pointer-fine:pl-10!")}
                    >
                      <span className="w-28 shrink-0 tabular-nums text-on-surface">
                        {formatClock(item.start_time)}{item.end_time ? `–${formatClock(item.end_time)}` : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cx("min-w-0 truncate", item.is_break ? "text-on-surface-variant" : "font-medium text-on-surface")}>
                            {judul}
                          </span>
                          {item.is_break ? <StatusChip>Jeda</StatusChip> : null}
                          {item.is_published ? null : <StatusChip tone="warning">Tidak tampil</StatusChip>}
                        </span>
                        {keterangan ? <span className="mt-0.5 block truncate text-on-surface-variant">{keterangan}</span> : null}
                      </span>
                    </ListRow>
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
            <span id="rundown-reorder-hint" hidden>Use the up and down arrow keys to move this row among rows with the same start time.</span>
          </div>
        )}
      </PaneBody>
    </Pane>
  ) : (
    <Pane aria-label="Jadwal">
      <EmptyState
        plain
        title="Belum ada bagian rundown"
        description="Bagian adalah tab di halaman publik, biasanya satu per hari atau per acara. Bagian baru dibuat sebagai draf."
        action={<Button size="sm" icon={<Plus size={16} />} onClick={() => setAddSectionOpen(true)}>Tambah bagian</Button>}
      />
    </Pane>
  );

  // ---- Panel samping: baris --------------------------------------------------------
  const isiBaris = selectedItem ? (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Sunting baris</h3>
        <Button variant="text" size="sm" onClick={() => setSelectedItemId(null)}>Tutup</Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Mulai"
          type="time"
          inputClassName="tabular-nums"
          value={formatClock(selectedItem.start_time)}
          onChange={(event) => updateItem(selectedItem.id, { start_time: event.target.value })}
        />
        <TextField
          label="Selesai"
          optional
          type="time"
          inputClassName="tabular-nums"
          value={selectedItem.end_time ? formatClock(selectedItem.end_time) : ""}
          onChange={(event) => updateItem(selectedItem.id, { end_time: event.target.value || null })}
        />
      </div>
      <TextField label="Nama acara" value={selectedItem.title} onChange={(event) => updateItem(selectedItem.id, { title: event.target.value })} />
      {jamBelumDisimpan && selectedSlotLokal > 1 ? (
        <p className="border-t border-outline-variant pt-4 text-body-small text-on-surface-variant">
          Save the time change first to reorder rows that start at {kunciSlot(selectedItem.start_time).slice(0, 5)}.
        </p>
      ) : null}
      {selectedSlot.length > 1 ? (
        <div className="flex flex-col gap-2 border-t border-outline-variant pt-4">
          <div>
            <p className="text-body-medium font-medium text-on-surface">Order at {formatClock(selectedItem.start_time)}</p>
            <p className="text-body-small text-on-surface-variant">
              {selectedSlot.indexOf(selectedItem.id) + 1} of {selectedSlot.length} rows that start at {formatClock(selectedItem.start_time)}
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
      {/* textarea, bukan input satu baris: satu butir acara bisa memuat beberapa
          pembicara, dan tiap baris tampil sebagai butir terpisah di halaman publik. */}
      <TextArea
        label="Keterangan"
        optional
        rows={5}
        placeholder={CONTOH_KETERANGAN}
        hint="Satu baris per pembicara. Baris berakhiran titik dua jadi judul kelompok (mis. Moderator:) dan tidak diberi bulet."
        value={selectedItem.subtitle ?? ""}
        onChange={(event) => updateItem(selectedItem.id, { subtitle: event.target.value })}
      />
      <Switch
        checked={selectedItem.is_break}
        onChange={(checked) => updateItem(selectedItem.id, { is_break: checked })}
        label="Jeda"
        description="Tampil lebih redup di halaman publik."
      />
      <Switch
        checked={selectedItem.is_published}
        onChange={(checked) => updateItem(selectedItem.id, { is_published: checked })}
        label="Tampil di publik"
      />
    </div>
  ) : active ? (
    <div className="flex flex-col gap-4">
      <h3 className="text-body-medium font-semibold text-on-surface">Baris baru</h3>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Mulai" type="time" inputClassName="tabular-nums" value={draft.start_time} onChange={(event) => updateDraft({ start_time: event.target.value })} />
        <TextField label="Selesai" optional type="time" inputClassName="tabular-nums" value={draft.end_time} onChange={(event) => updateDraft({ end_time: event.target.value })} />
      </div>
      <TextField
        label="Nama acara"
        placeholder="Mis. Opening Keynote Speech"
        data-draft-title=""
        value={draft.title}
        onChange={(event) => updateDraft({ title: event.target.value })}
      />
      <TextArea
        label="Keterangan"
        optional
        rows={5}
        placeholder={CONTOH_KETERANGAN}
        hint="Satu baris per pembicara. Baris berakhiran titik dua jadi judul kelompok."
        value={draft.subtitle}
        onChange={(event) => updateDraft({ subtitle: event.target.value })}
      />
      <Switch checked={draft.is_break} onChange={(checked) => updateDraft({ is_break: checked })} label="Jeda" description="Tampil lebih redup di halaman publik." />
      <p className="text-body-medium text-on-surface-variant">Jam selesai boleh dikosongkan untuk penanda momen. Pilih baris di jadwal untuk menyuntingnya.</p>
    </div>
  ) : null;

  // ---- Panel samping: bagian -------------------------------------------------------
  const isiBagian = active ? (
    <div className="flex flex-col gap-5">
      <Kelompok title="Bagian ini" first>
        <TextField
          label="Label tab"
          hint="Pendek, agar beberapa tab muat di layar ponsel."
          value={active.name}
          onChange={(event) => updateSection(active.id, { name: event.target.value })}
        />
        <TextField
          label="Tanggal acara"
          type="date"
          hint={`Dipakai penanda sedang berlangsung. ${formatEventDate(active.event_date, zone)} (${abbr})`}
          value={active.event_date}
          onChange={(event) => updateSection(active.id, { event_date: event.target.value })}
        />
        {/* Kolom "Judul di halaman publik" dan "Sub judul" per bagian sengaja
            tidak ada: judul header kini satu untuk seluruh acara (panel Header
            publik). Kolomnya tetap ada di database supaya data lama tidak rusak. */}
      </Kelompok>
      <Kelompok title="Di halaman publik">
        {/* Sakelar penanda ditaruh bersama tanggal karena keduanya satu urusan:
            penanda hanya benar bila tanggalnya benar. */}
        <Switch
          checked={active.highlight_current}
          onChange={(checked) => updateSection(active.id, { highlight_current: checked })}
          label="Tandai acara yang sedang berlangsung"
          description={active.highlight_current
            ? "Halaman publik menyorot acara berjalan, menandai acara berikutnya, meredupkan yang sudah selesai, dan menggulir otomatis ke baris tersebut. Butuh tanggal di atas benar."
            : "Jadwal tampil sebagai daftar biasa tanpa sorotan dan tanpa gulir otomatis. Pakai ini bila tanggal acara belum tiba."}
        />
        <Switch
          checked={active.is_published}
          onChange={(checked) => updateSection(active.id, { is_published: checked })}
          label="Tampilkan di halaman publik"
          description={`/rundown?sesi=${active.slug}`}
        />
      </Kelompok>
      <section className="flex items-center gap-3 border-t border-outline-variant pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-body-medium font-medium text-on-surface">Hapus bagian</p>
          <p className="text-body-medium text-on-surface-variant">Seluruh baris jadwalnya ikut terhapus.</p>
        </div>
        <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmSection(active)}>Hapus</Button>
      </section>
    </div>
  ) : null;

  // ---- Panel samping: header publik -------------------------------------------------
  // Header ditaruh di segmen tersendiri, bukan di dalam setelan bagian: posisinya
  // harus mencerminkan cakupannya. Di dalam setelan bagian, admin wajar
  // menyimpulkan isinya hanya berlaku untuk tab yang sedang dipilih.
  const isiHeader = (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Berlaku untuk semua tab. Isian tampilan opsional; bila dikosongkan, header memakai tema bawaan.
      </p>
      <Kelompok title="Judul" first>
        <TextField
          label="Judul acara"
          hint="Tampil sama di semua tab."
          placeholder="Mis. PRIMA EXECUTIVE GATHERING"
          value={header.event_title}
          onChange={(event) => updateHeader({ event_title: event.target.value })}
        />
        <TextField
          label="Sub judul acara"
          optional
          hint="Maksimal dua baris di halaman publik."
          placeholder="Mis. Beyond Tomorrow: Securing Progress"
          value={header.event_subtitle ?? ""}
          onChange={(event) => updateHeader({ event_subtitle: event.target.value })}
        />
      </Kelompok>

      {/* Warna boleh dikosongkan, dan itu tidak bisa dilakukan <input type="color">
          yang selalu punya nilai. Jadi tiap warna dipasangkan tombol kembali ke
          bawaan (null). */}
      <Kelompok title="Warna">
        {([
          ["background_color", "Latar header"],
          ["text_color", "Warna tulisan"],
          ["accent_color", "Aksen (garis tab)"],
        ] as const).map(([key, label]) => (
          <div key={key} className="flex items-center gap-3">
            <input
              id={`header-${key}`}
              type="color"
              value={header[key] ?? BRANDING_FALLBACK[key]}
              onChange={(event) => updateHeader({ [key]: event.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent"
            />
            <label htmlFor={`header-${key}`} className="min-w-0 flex-1">
              <span className="block text-body-medium font-medium text-on-surface">{label}</span>
              <span className="block text-body-medium text-on-surface-variant">{header[key] ? header[key]?.toUpperCase() : "Ikut tema bawaan"}</span>
            </label>
            <Button variant="outlined" size="sm" disabled={!header[key]} onClick={() => updateHeader({ [key]: null })} aria-label={`Kembalikan ${label} ke bawaan`}>
              Bawaan
            </Button>
          </div>
        ))}
      </Kelompok>

      {/* Gambar latar berdiri DI ATAS warna, bukan menggantikannya. Warna tetap
          dipakai di belakangnya supaya teks tidak hilang bila gambar gagal dimuat. */}
      <Kelompok title="Gambar latar" note="Diberi lapisan gelap otomatis dan tulisan dipaksa putih agar tetap terbaca. PNG, JPG, atau WebP, maks 5 MB.">
        <div className="flex flex-wrap items-center gap-2">
          {header.background_image_url ? (
            <span className="h-12 w-20 shrink-0 rounded-md border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${header.background_image_url})` }} />
          ) : null}
          <label className={cx(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-medium font-medium text-on-surface hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
            uploadingBackground && "pointer-events-none opacity-60",
          )}>
            <UploadSimple size={16} aria-hidden />
            {uploadingBackground ? "Mengunggah..." : header.background_image_url ? "Ganti gambar" : "Unggah gambar"}
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
          {header.background_image_url ? (
            <Button variant="text" size="sm" className="text-error" onClick={() => updateHeader({ background_image_url: null })}>Hapus gambar</Button>
          ) : null}
        </div>
      </Kelompok>

      {/* Editor logo, jenis huruf, ukuran, dan warna per elemen. Komponen yang sama
          dipakai /admin/seat-map dan /admin/display. */}
      <Kelompok title="Logo dan huruf">
        <BrandingEditor
          value={headerBranding}
          onChange={(changes) => updateHeader(changes)}
          idPrefix="rundown-header"
          baseTextColor={header.text_color ?? "#1a1a1a"}
          baseBackgroundColor={header.background_color ?? "#ffffff"}
          baseAccentColor={header.accent_color ?? "#2649d0"}
        />
      </Kelompok>
    </div>
  );

  const draftLengkap = Boolean(draft.title.trim() && draft.start_time);
  const kaki: Record<Panel, { note: ReactNode; aksi: ReactNode }> = {
    baris: selectedItem
      ? {
        note: null,
        aksi: (
          <>
            <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmItem(selectedItem)}>Hapus</Button>
            <Button simpan size="sm" onClick={() => void saveItem(selectedItem)} loading={savingItem === selectedItem.id}>Simpan baris</Button>
          </>
        ),
      }
      : {
        note: draftLengkap ? null : "Jam mulai dan nama acara wajib",
        aksi: active ? <Button simpan size="sm" icon={<Plus size={16} />} onClick={() => void addItem()} loading={addingItem} disabled={!draftLengkap}>Tambah baris</Button> : null,
      },
    bagian: {
      note: "Hanya bagian ini",
      aksi: active ? <Button simpan size="sm" onClick={() => void saveSection(active)} loading={savingSection}>Simpan bagian</Button> : null,
    },
    header: {
      note: "Berlaku untuk semua tab",
      aksi: <Button simpan size="sm" onClick={() => void saveHeader()} loading={savingHeader}>Simpan header</Button>,
    },
  };

  const samping = (
    <Pane as="aside" aria-label="Penyunting rundown">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<Panel>
          label="Yang disunting"
          value={panelAktif}
          onChange={setPanel}
          className="w-full"
          options={[
            { value: "baris", label: "Baris", disabled: !active },
            { value: "bagian", label: "Bagian", disabled: !active },
            { value: "header", label: "Header publik" },
          ]}
        />
      </div>
      <PaneBody className="px-4 py-4">{panelAktif === "baris" ? isiBaris : panelAktif === "bagian" ? isiBagian : isiHeader}</PaneBody>
      <PaneFooter note={kaki[panelAktif].note}>{kaki[panelAktif].aksi}</PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={loaded ? (
          <>
            <span>
              {publishedCount === 0
                ? "Belum ada bagian yang tampil, jadi halaman publik masih menampilkan pesan tunggu"
                : `${publishedCount} dari ${sections.length} bagian tampil di publik`}
            </span>
            <MetaSeparator />
            <span>Penanda sedang berlangsung memakai tanggal bagian dan jam baris</span>
          </>
        ) : null}
        actions={<ButtonLink href="/rundown" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Buka halaman publik</ButtonLink>}
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {!loaded ? (error ? null : <PageLoading />) : (
        <>
          <div className="flex shrink-0 items-end gap-2 border-b border-outline-variant">
            {sections.length > 0 ? (
              // Tabs membawa shrink-0; pembungkus ini yang menyempit agar tombol + Bagian tetap di layar.
              <div className="min-w-0">
                <Tabs
                  label="Bagian rundown"
                  idPrefix="bagian"
                  value={String(activeId ?? "")}
                  onChange={(value) => pilihBagian(Number(value))}
                  className="border-b-0"
                  options={sections.map((section) => ({ value: String(section.id), label: section.name, badge: section.is_published ? undefined : "Draf" }))}
                />
              </div>
            ) :<span className="py-2.5 text-body-medium text-on-surface-variant">Belum ada bagian</span>}
            <button type="button" onClick={() => setAddSectionOpen(true)} className="mb-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-body-medium font-medium text-primary hover:bg-primary-soft">
              <Plus size={14} aria-hidden />Bagian
            </button>
          </div>
          <div
            role={active ? "tabpanel" : undefined}
            id={active ? `bagian-panel-${active.id}` : undefined}
            aria-labelledby={active ? `bagian-tab-${active.id}` : undefined}
            className="flex min-h-0 flex-1 flex-col"
          >
            <SupportingPane main={jadwal} pane={samping} paneWidth={420} />
          </div>
        </>
      )}

      <Dialog
        open={addSectionOpen}
        onClose={() => { setAddSectionOpen(false); setNewSectionName(""); }}
        dismissible={!creatingSection}
        size="sm"
        title="Tambah bagian"
        description="Bagian baru dibuat sebagai draf, jadi belum tampil di halaman publik."
        actions={
          <>
            <Button variant="outlined" disabled={creatingSection} onClick={() => { setAddSectionOpen(false); setNewSectionName(""); }}>Batal</Button>
            <Button simpan type="submit" form="form-bagian" loading={creatingSection} disabled={!newSectionName.trim()}>Tambah bagian</Button>
          </>
        }
      >
        <form id="form-bagian" className="mt-4" onSubmit={(event) => { event.preventDefault(); void createSection(); }}>
          <TextField label="Nama bagian" autoFocus placeholder="Mis. Prima Awards" value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} />
        </form>
      </Dialog>

      <Dialog
        open={confirmItem !== null}
        onClose={() => setConfirmItem(null)}
        dismissible={deletingItem === null}
        tone="danger"
        title={`Hapus baris ${confirmItem?.title.trim() || ""}?`}
        description="Baris ini hilang dari rundown dan halaman publik. Salinannya dicatat di jejak audit."
        actions={
          <>
            <Button variant="outlined" disabled={deletingItem !== null} onClick={() => setConfirmItem(null)}>Batal</Button>
            <Button simpan variant="danger" loading={deletingItem !== null} onClick={() => { if (confirmItem) void deleteItem(confirmItem); }}>Hapus baris</Button>
          </>
        }
      />

      <Dialog
        open={confirmSection !== null}
        onClose={() => setConfirmSection(null)}
        dismissible={!deletingSection}
        tone="danger"
        title={`Hapus bagian ${confirmSection?.name ?? ""}?`}
        description={`${confirmSection?.is_published ? "Bagian ini sedang tampil di publik. " : ""}Seluruh ${activeItems.length} baris jadwal di bagian ini ikut terhapus. Salinannya dicatat di jejak audit.`}
        actions={
          <>
            <Button variant="outlined" disabled={deletingSection} onClick={() => setConfirmSection(null)}>Batal</Button>
            <Button simpan variant="danger" loading={deletingSection} onClick={() => { if (confirmSection) void deleteSection(confirmSection); }}>Hapus bagian</Button>
          </>
        }
      />
    </WorkspacePage>
  );
}
