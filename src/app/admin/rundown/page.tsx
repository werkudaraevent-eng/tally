"use client";

import { ArrowDown, ArrowSquareOut, ArrowUp, DotsSixVertical, Info, Plus, Stack, Trash, UploadSimple, Warning } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { useToast } from "@/components/toast";
import { normalizeBranding } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
import { DEFAULT_HEADER, formatClock, type RundownHeader, type RundownItem, type RundownSection } from "@/lib/rundown";
import { bandingkanBaris, geserDalamSlot, kunciSlot, pindahDalamSlot, susunUlangSlot } from "@/lib/rundown-urutan";
import { plural } from "@/lib/plural";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, ListRow, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, StatusChip, SupportingPane, Switch, Tabs, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { Kelompok } from "@/components/admin/compact-form";
import { teksPolos } from "@/lib/landing-teks-kaya";
import { RichDetailsField } from "@/components/admin/rich-details-field";

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

// Petunjuk satu kalimat per aturan: baris per pembicara, label, format.
const HINT_KETERANGAN = "One line per speaker. A line ending in a colon becomes a label (e.g. Moderator:). Bold, italic, theme colour and lists show on the event page.";
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

/** "Monday, 24 August 2026" untuk keterangan staf. formatEventDate di lib/rundown dipakai halaman publik, jadi tetap id-ID. */
function formatStaffDate(eventDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return eventDate;
  const date = new Date(`${eventDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return eventDate;
  return date.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

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
  const { abbr } = useEventTimeZone();
  const toast = useToast();

  async function load() {
    // Bagian dan header dimuat bersamaan: keduanya dibutuhkan sebelum halaman ini
    // berguna, dan memuatnya berurutan hanya menambah satu perjalanan jaringan.
    const hasil = await Promise.all([
      fetch("/api/admin/rundown/sections", { cache: "no-store" }),
      fetch("/api/admin/rundown/header", { cache: "no-store" }),
    ]).catch(() => null);
    if (!hasil) { setError("Connection lost. The agenda could not be loaded."); return; }
    const [sectionResponse, headerResponse] = hasil;
    if (!sectionResponse.ok) { setError("The agenda could not be loaded."); return; }
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
    // Baris yang jam mulainya diubah tetapi belum disimpan ditaruh di akhir slot
    // jam barunya, sama dengan tempat server menaruhnya saat disimpan. Tanpa ini
    // ia tampil menurut sort_order lamanya lalu melompat begitu disimpan.
    return items
      .filter((item) => item.section_id === activeId)
      .map((item) => {
        const tersimpan = savedStart.get(item.id);
        return tersimpan !== undefined && kunciSlot(tersimpan) !== kunciSlot(item.start_time) ? { ...item, sort_order: Number.MAX_SAFE_INTEGER } : item;
      })
      .sort(bandingkanBaris);
  }, [items, activeId, savedStart]);

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
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Image upload failed.";
      setError(failure);
      toast.error("Image upload failed", failure);
      return;
    }
    updateHeader({ background_image_url: data.url });
    toast.info("Image uploaded", "Select Save header to apply it to the public page.");
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
      const failure = failureMessage(data, "Header not saved.");
      setError(failure); toast.error("Header not saved", failure);
      return;
    }
    setHeader(data as RundownHeader);
    toast.success("Header saved", "Applies to every tab on the public page.");
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
      const failure = failureMessage(data, "Section not added.");
      setError(failure); toast.error("Section not added", failure);
      return;
    }
    setNewSectionName("");
    setAddSectionOpen(false);
    pilihBagian((data as RundownSection).id);
    setPanel("bagian");
    toast.success("Section added", "It is still a draft. Set the date, add the schedule, then publish it.");
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
      const failure = failureMessage(data, "Section not saved.");
      setError(failure); toast.error("Section not saved", failure);
      return;
    }
    toast.success("Section saved", section.is_published ? "This section is shown on the public page." : "This section is not public yet.");
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
      const failure = failureMessage(data, "Section not deleted.");
      setError(failure); toast.error("Section not deleted", failure);
      return;
    }
    setActiveId(null);
    setSelectedItemId(null);
    toast.success("Section deleted", "All of its agenda items were deleted too.");
    await load();
  }

  async function addItem() {
    if (activeId === null) return;
    const title = draft.title.trim();
    if (!title || !draft.start_time) {
      setError("Start time and title are required.");
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
      const failure = failureMessage(data, "Agenda item not added.");
      setError(failure); toast.error("Agenda item not added", failure);
      return;
    }
    // Jam mulai baris berikutnya diisi jam selesai baris ini. Rundown disusun
    // berurutan dan bersambung, jadi ini menghilangkan pengetikan yang berulang
    // sekaligus mengurangi celah waktu yang tidak disengaja.
    setDrafts((current) => ({ ...current, [activeId]: { ...EMPTY_DRAFT, start_time: draft.end_time || "" } }));
    toast.success("Agenda item added");
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
      const failure = failureMessage(data, "Agenda item not saved.");
      setError(failure); toast.error("Agenda item not saved", failure);
      return;
    }
    toast.success("Agenda item saved");
    await load();
  }

  async function deleteItem(item: RundownItem) {
    setDeletingItem(item.id); setError("");
    const response = await fetch(`/api/admin/rundown/items?id=${item.id}`, { method: "DELETE" });
    setDeletingItem(null);
    setConfirmItem(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const failure = failureMessage(data, "Agenda item not deleted.");
      setError(failure); toast.error("Agenda item not deleted", failure);
      return;
    }
    setSelectedItemId((current) => (current === item.id ? null : current));
    toast.success("Agenda item deleted");
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
      const failure = (data as { error?: { details?: { message?: string } } }).error?.details?.message
        ?? (response ? "Something went wrong. Try again." : "Check your connection and try again.");
      setError(failure); toast.error("Order not saved", failure);
      const fresh = await fetch("/api/admin/rundown/sections", { cache: "no-store" }).catch(() => null);
      if (fresh?.ok) apply(((await fresh.json()) as Payload).items);
      return;
    }
    apply((data as { items?: RundownItem[] }).items ?? []);
    const moved = sectionItems.find((item) => item.id === movedId);
    setReorderNote(`${moved?.title.trim() || "Item"} moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}.`);
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
    <Pane aria-label={`${active.name} schedule`}>
      <PaneHeader>
        <h2 className="text-body-medium font-semibold text-on-surface">Schedule</h2>
        <span className="tabular-nums text-body-medium text-on-surface-variant">{plural(activeItems.length, "item")}</span>
        <span className="min-w-0 flex-1 truncate text-body-medium text-on-surface-variant max-sm:hidden">
          {adaSlotParalel ? "Drag to reorder same-time items" : "Sorted by start time automatically"}
        </span>
        <Button variant="outlined" size="sm" className="ml-auto" icon={<Plus size={16} />} onClick={mulaiTambahBaris}>Add item</Button>
      </PaneHeader>
      <PaneBody>
        {activeItems.length === 0 ? (
          <EmptyState
            plain
            title="No agenda items yet"
            description="Fill in the New item form in the side panel. Items are sorted by start time, so there is nothing to reorder."
          />
        ) : (
          <div>
            {activeItems.map((item) => {
              const keterangan = teksPolos(item.subtitle).split("\n").map((line) => line.trim()).filter(Boolean).join(" · ");
              const kunci = kunciSlot(item.start_time);
              const slotIds = slots.get(kunci) ?? [];
              const paralel = slotIds.length > 1;
              const posisi = slotIds.indexOf(item.id);
              const judul = item.title.trim() || "Untitled";
              const garis = dropTarget?.id === item.id && dragId !== null && dragId !== item.id ? (dropTarget.after ? "bottom" : "top") : null;
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
                          {item.is_break ? <StatusChip>Break</StatusChip> : null}
                          {item.is_published ? null : <StatusChip tone="warning">Hidden</StatusChip>}
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
            <span id="rundown-reorder-hint" hidden>Use the up and down arrow keys to move this item among items with the same start time.</span>
          </div>
        )}
      </PaneBody>
    </Pane>
  ) : (
    <Pane aria-label="Schedule">
      <EmptyState
        plain
        title="No agenda sections yet"
        description="Each section is a tab on the public page, usually one per day or per event. New sections start as drafts."
        action={<Button size="sm" icon={<Plus size={16} />} onClick={() => setAddSectionOpen(true)}>Add section</Button>}
      />
    </Pane>
  );

  // ---- Panel samping: baris --------------------------------------------------------
  const isiBaris = selectedItem ? (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Edit item</h3>
        <Button variant="text" size="sm" onClick={() => setSelectedItemId(null)}>Close</Button>
      </div>
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
      {/* textarea, bukan input satu baris: satu butir acara bisa memuat beberapa
          pembicara, dan tiap baris tampil sebagai butir terpisah di halaman publik. */}
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
      <Switch
        checked={selectedItem.is_published}
        onChange={(checked) => updateItem(selectedItem.id, { is_published: checked })}
        label="Show on public page"
      />
    </div>
  ) : active ? (
    <div className="flex flex-col gap-4">
      <h3 className="text-body-medium font-semibold text-on-surface">New item</h3>
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
      <p className="text-body-medium text-on-surface-variant">Leave the end time empty to mark a single moment. Select an item in the schedule to edit it.</p>
    </div>
  ) : null;

  // ---- Panel samping: bagian -------------------------------------------------------
  const isiBagian = active ? (
    <div className="flex flex-col gap-5">
      <Kelompok title="This section" first>
        <TextField
          label="Tab label"
          hint="Keep it short so several tabs fit on a phone screen."
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
        <Switch
          checked={active.is_published}
          onChange={(checked) => updateSection(active.id, { is_published: checked })}
          label="Show on public page"
          description={`/rundown?sesi=${active.slug}`}
        />
      </Kelompok>
      <section className="flex items-center gap-3 border-t border-outline-variant pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-body-medium font-medium text-on-surface">Delete section</p>
          <p className="text-body-medium text-on-surface-variant">All of its agenda items are deleted too.</p>
        </div>
        <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmSection(active)}>Delete</Button>
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
        Applies to every tab. The appearance fields are optional; left empty, the header uses the default theme.
      </p>
      <Kelompok title="Title" first>
        <TextField
          label="Event title"
          hint="Shown the same on every tab."
          placeholder="e.g. PRIMA EXECUTIVE GATHERING"
          value={header.event_title}
          onChange={(event) => updateHeader({ event_title: event.target.value })}
        />
        <TextField
          label="Event subtitle"
          optional
          hint="Up to two lines on the public page."
          placeholder="e.g. Beyond Tomorrow: Securing Progress"
          value={header.event_subtitle ?? ""}
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
              value={header[key] ?? BRANDING_FALLBACK[key]}
              onChange={(event) => updateHeader({ [key]: event.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent"
            />
            <label htmlFor={`header-${key}`} className="min-w-0 flex-1">
              <span className="block text-body-medium font-medium text-on-surface">{label}</span>
              <span className="block text-body-medium text-on-surface-variant">{header[key] ? header[key]?.toUpperCase() : "Uses the default theme"}</span>
            </label>
            <Button variant="outlined" size="sm" disabled={!header[key]} onClick={() => updateHeader({ [key]: null })} aria-label={`Reset ${label.toLowerCase()} to default`}>
              Default
            </Button>
          </div>
        ))}
      </Kelompok>

      {/* Gambar latar berdiri DI ATAS warna, bukan menggantikannya. Warna tetap
          dipakai di belakangnya supaya teks tidak hilang bila gambar gagal dimuat. */}
      <Kelompok title="Background image" note="A dark overlay is added automatically and the text turns white so it stays readable. PNG, JPG or WebP, up to 5 MB.">
        <div className="flex flex-wrap items-center gap-2">
          {header.background_image_url ? (
            <span className="h-12 w-20 shrink-0 rounded-md border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${header.background_image_url})` }} />
          ) : null}
          <label className={cx(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-medium font-medium text-on-surface hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
            uploadingBackground && "pointer-events-none opacity-60",
          )}>
            <UploadSimple size={16} aria-hidden />
            {uploadingBackground ? "Uploading…" : header.background_image_url ? "Replace image" : "Upload image"}
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
            <Button variant="text" size="sm" className="text-error" onClick={() => updateHeader({ background_image_url: null })}>Remove image</Button>
          ) : null}
        </div>
      </Kelompok>

      {/* Editor logo, jenis huruf, ukuran, dan warna per elemen. Komponen yang sama
          dipakai /admin/seat-map dan /admin/display. */}
      <Kelompok title="Logo and type">
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
            <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmItem(selectedItem)}>Delete</Button>
            <Button simpan size="sm" onClick={() => void saveItem(selectedItem)} loading={savingItem === selectedItem.id}>Save item</Button>
          </>
        ),
      }
      : {
        note: draftLengkap ? null : "Start time and title are required",
        aksi: active ? <Button simpan size="sm" icon={<Plus size={16} />} onClick={() => void addItem()} loading={addingItem} disabled={!draftLengkap}>Add item</Button> : null,
      },
    bagian: {
      note: "This section only",
      aksi: active ? <Button simpan size="sm" onClick={() => void saveSection(active)} loading={savingSection}>Save section</Button> : null,
    },
    header: {
      note: "Applies to every tab",
      aksi: <Button simpan size="sm" onClick={() => void saveHeader()} loading={savingHeader}>Save header</Button>,
    },
  };

  const samping = (
    <Pane as="aside" aria-label="Agenda editor">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<Panel>
          label="Editing"
          value={panelAktif}
          onChange={setPanel}
          className="w-full"
          options={[
            { value: "baris", label: "Item", disabled: !active },
            { value: "bagian", label: "Section", disabled: !active },
            { value: "header", label: "Page header" },
          ]}
        />
      </div>
      <PaneBody className="px-4 py-4">{panelAktif === "baris" ? isiBaris : panelAktif === "bagian" ? isiBagian : isiHeader}</PaneBody>
      <PaneFooter note={kaki[panelAktif].note}>{kaki[panelAktif].aksi}</PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <div lang="en" className="contents">
      <WorkspaceHeader
        meta={loaded ? (
          <>
            <span>
              {publishedCount === 0
                ? "No sections are public yet, so the public page still shows a holding message"
                : `${publishedCount} of ${plural(sections.length, "section")} public`}
            </span>
            <MetaSeparator />
            <span>The current-item highlight uses the section date and item times</span>
          </>
        ) : null}
        actions={<ButtonLink href="/rundown" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open public page</ButtonLink>}
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {!loaded ? (error ? null : <PageLoading />) : (
        <>
          <div className="flex shrink-0 items-end gap-2 border-b border-outline-variant">
            {sections.length > 0 ? (
              // Tabs membawa shrink-0; pembungkus ini yang menyempit agar tombol + Bagian tetap di layar.
              <div className="min-w-0">
                <Tabs
                  label="Agenda sections"
                  idPrefix="bagian"
                  value={String(activeId ?? "")}
                  onChange={(value) => pilihBagian(Number(value))}
                  className="border-b-0"
                  options={sections.map((section) => ({ value: String(section.id), label: section.name, badge: section.is_published ? undefined : "Draft" }))}
                />
              </div>
            ) :<span className="py-2.5 text-body-medium text-on-surface-variant">No sections yet</span>}
            <button type="button" onClick={() => setAddSectionOpen(true)} className="mb-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-body-medium font-medium text-primary hover:bg-primary-soft">
              <Plus size={14} aria-hidden />Section
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
        title="Add section"
        description="New sections start as drafts, so they are not on the public page yet."
        actions={
          <>
            <Button variant="outlined" disabled={creatingSection} onClick={() => { setAddSectionOpen(false); setNewSectionName(""); }}>Cancel</Button>
            <Button simpan type="submit" form="form-bagian" loading={creatingSection} disabled={!newSectionName.trim()}>Add section</Button>
          </>
        }
      >
        <form id="form-bagian" className="mt-4" onSubmit={(event) => { event.preventDefault(); void createSection(); }}>
          <TextField label="Section name" autoFocus placeholder="e.g. Prima Awards" value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} />
        </form>
      </Dialog>

      <Dialog
        open={confirmItem !== null}
        onClose={() => setConfirmItem(null)}
        dismissible={deletingItem === null}
        tone="danger"
        title={`Delete ${confirmItem?.title.trim() || "this item"}?`}
        description="This item is removed from the agenda and the public page. A copy is kept in the audit log."
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
        title={`Delete section ${confirmSection?.name ?? ""}?`}
        description={`${confirmSection?.is_published ? "This section is on the public page now. " : ""}${activeItems.length === 0 ? "" : activeItems.length === 1 ? "Its 1 agenda item is deleted too. " : `All ${plural(activeItems.length, "agenda item")} in this section are deleted too. `}A copy is kept in the audit log.`}
        actions={
          <>
            <Button variant="outlined" disabled={deletingSection} onClick={() => setConfirmSection(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={deletingSection} onClick={() => { if (confirmSection) void deleteSection(confirmSection); }}>Delete section</Button>
          </>
        }
      />
      </div>
    </WorkspacePage>
  );
}
