"use client";

import { formatClock, type RundownHeader, type RundownItem, type RundownSection } from "@/lib/rundown";
import { adaBeda, drafBaruBerubah, formTerbuka, kunciForm, lapisanSisa, sisaSunting, type DrafBaru, type FormAgenda, type Panel } from "@/lib/agenda-simpan-aman";
import { bandingkanBagian, bandingkanBaris, geserBagian, geserDalamSlot, kunciSlot, susunUlangBagian, susunUlangSlot } from "@/lib/rundown-urutan";
import { plural } from "@/lib/plural";
import { dilihatKelompok, opsiLihatSebagai, syaratLengkap, syaratMati } from "../siapa-melihat";
import { bacaSyaratBaris } from "@/lib/sasaran-baris";
import { alasanDaftarOutfit, cekDaftarOutfit, tabTerlihatOutfit, type OutfitEntry } from "@/lib/outfit";
import { drafKurang, kartuBaru, keDraf, keKiriman, keteranganTersimpan, samaDraf, urutDraf, type BarisDc, type DrafDresscode } from "../editor-dresscode";
import { eventApiPath } from "@/lib/event-url";
import { FOTO_OUTFIT_SALAH, fotoOutfitSah, unggahFotoOutfit } from "@/lib/outfit-foto";
import { bacaSasaran, type SasaranBagian } from "@/lib/sasaran-bagian";
import { kalimatHapus } from "@/lib/logistik/trip-agenda";
import { useEffect } from "react";
import { useJagaNavigasi } from "@/lib/jaga-navigasi";
import { CEK_KONEKSI, IsiBagian, IsiBaris, ItemAgenda, PUTUS, Payload, besoknya, fokusJudulBaru, fokusSekarang, namaDariTanggal, tanpa } from "./agenda-bantu";
import type { useRundownAdminPage0 } from "./agenda-0";

/** Bagian 2 dari 5 badan RundownAdminPage, dipindah apa adanya (audit platform, Fase 3). */
export function useRundownAdminPage1(c: Awaited<ReturnType<typeof useRundownAdminPage0>>) {
  const { active, activeId, activeItems, addingItem, bahasaAcara, barisTersimpan, confirmItem, confirmSection, draft, draftAwal, drafts, duplicating, eventDates, galatPanel, header, headerTampil, idBagian, idJudulDc, items, itemsTampil, jamAwal, lihatSebagai, load, loadSyarat, newSectionDate, newSectionName, outfitDrafts, outfitInfo, outfitMuat, outfitSaved, panel, publikAda, publikDrafts, publikSaved, reordering, sasaranDrafts, sasaranInfo, sasaranSaved, savingHeader, savingItem, savingOutfit, savingSection, sections, selectedItem, selectedItemId, sesiForm, sesudahSimpan, setActiveId, setAddSectionOpen, setAddingItem, setConfirmItem, setConfirmSection, setCreatingSection, setDeletingItem, setDeletingSection, setDrafts, setDuplicating, setError, setGalatPanel, setHeader, setItems, setJamAwal, setLayarEditor, setNamaDiketik, setNewSectionDate, setNewSectionName, setOutfitDrafts, setOutfitInfo, setOutfitSaved, setPanel, setPanelTerbuka, setPercobaanDc, setPublikAda, setPublikDrafts, setPublikSaved, setReorderNote, setReordering, setSasaranDrafts, setSasaranInfo, setSasaranSaved, setSavingHeader, setSavingItem, setSavingOutfit, setSavingSection, setSections, setSelectedItemId, setSesi, setSesudahSimpan, setSuntingBagian, setSuntingBaris, setSuntingHeader, setSyaratBaru, setSyaratDrafts, setSyaratInfo, setSyaratSaved, setTertunda, setUploadingBackground, setUploadingBranding, setUploadingOutfit, slots, suntingBagian, suntingBaris, suntingHeader, syaratBaru, syaratDrafts, syaratInfo, syaratSaved, tertunda, toast, uploadingBackground, uploadingBranding, uploadingOutfit } = c;
  function updateSection(id: number, changes: Partial<IsiBagian>) {
    setSuntingBagian((kini) => ({ id, isi: { ...(kini?.id === id ? kini.isi : {}), ...changes } }));
  }

  function updateHeader(changes: Partial<RundownHeader>) {
    setSuntingHeader((kini) => ({ ...kini, ...changes }));
  }

  function pilihBagian(id: number) {
    pindah({ bagian: id, baris: null });
  }

  function mulaiTambahBaris() {
    pindah({ baris: null, panel: "baris" }, () => { setPanelTerbuka(true); bukaLayarEditor(); fokusJudulBaru(); });
  }

  /** Tutup panel kanan: kembali ke jadwal selebar penuh. */
  function tutupPanel() {
    pindah({ baris: null, panel: "baris" }, () => { setPanelTerbuka(false); setLayarEditor(false); });
  }

  /** Layar sempit: editor menggantikan jadwal dan digulir ke atas layar. */
  function bukaLayarEditor() {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    setLayarEditor(true);
    window.setTimeout(() => {
      document.querySelector("[data-agenda-editor]")?.scrollIntoView({ block: "start" });
      // Baris yang diketuk ikut tersembunyi: fokus pindah ke tombol kembali, bukan ke body.
      document.querySelector<HTMLElement>("[data-agenda-kembali]")?.focus({ preventScroll: true });
    }, 0);
  }

  /** Kembali ke jadwal, ke baris yang tadi dibuka. Suntingan tidak dibuang: formulirnya tetap terbuka. */
  function tutupLayarEditor() {
    const baris = selectedItemId;
    setLayarEditor(false);
    window.setTimeout(() => {
      const el = baris === null ? null : document.querySelector<HTMLElement>(`[data-rundown-row="${baris}"]`);
      if (el) el.scrollIntoView({ block: "center" });
      else window.scrollTo({ top: 0 });
      el?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    }, 0);
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
    const sesiAwal = sesiForm.current;
    setUploadingBackground(true); setError(""); setGalatPanel(null);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/display/background", { method: "POST", body: form }).catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    // Header dibuang (Discard) selama unggahan berjalan: hasilnya ikut dibuang.
    if (sesiAwal !== sesiForm.current) return;
    setUploadingBackground(false);
    if (!response?.ok) {
      gagalPanel("Image upload failed", response ? data?.error?.details?.file ?? data?.error?.message ?? "Image upload failed." : PUTUS);
      return;
    }
    updateHeader({ background_image_url: data.url });
    toast.info("Image uploaded", "Select Save header to apply it to the public page.");
  }

  async function saveHeader() {
    // Kolom yang dikirim: sesudah berhasil, hanya itu yang dibuang dari lapisan.
    const dikirim = suntingHeader;
    setSavingHeader(true); setError(""); setGalatPanel(null);
    const response = await fetch("/api/admin/rundown/header", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(headerTampil),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setSavingHeader(false);
    if (!response?.ok) {
      gagalPanel("Header not saved", response ? failureMessage(data, "Header not saved.") : PUTUS);
      return;
    }
    setHeader(data as RundownHeader);
    if (dikirim) setSuntingHeader((kini) => (kini ? sisaSunting(kini, dikirim) : kini));
    toast.success("Header saved", "Applies to every tab on the public page.");
  }

  function updateItem(id: number, changes: Partial<IsiBaris>) {
    setSuntingBaris((kini) => ({ id, isi: { ...(kini?.id === id ? kini.isi : {}), ...changes } }));
  }

  function updateDraft(changes: Partial<DrafBaru>) {
    if (activeId === null) return;
    setDrafts((current) => ({ ...current, [activeId]: { ...(current[activeId] ?? draftAwal), ...changes } }));
  }

  /** Pesan gagal dari API. `details.message` lebih spesifik dari pesan generiknya. */
  function failureMessage(data: { error?: { message?: string; details?: { message?: string } } }, fallback: string) {
    return data.error?.details?.message ?? data.error?.message ?? fallback;
  }

  /** Add day: tanggal bawaan sehari sesudah hari terakhir (atau mulai acara), nama dari tanggal. */
  function bukaTambahHari() {
    lindungi(() => {
      const terakhir = [...sections].map((row) => row.event_date).filter(Boolean).sort().pop();
      const tanggal = terakhir ? (eventDates?.end && terakhir >= eventDates.end ? terakhir : besoknya(terakhir)) : eventDates?.start ?? "";
      setNewSectionDate(tanggal);
      setNewSectionName(namaDariTanggal(tanggal, bahasaAcara));
      setNamaDiketik(false);
      setAddSectionOpen(true);
    });
  }

  function tutupTambahHari() {
    setAddSectionOpen(false);
    setNewSectionName("");
    setNewSectionDate("");
  }

  async function createSection() {
    const name = newSectionName.trim();
    if (!name) return;
    setCreatingSection(true); setError("");
    const response = await fetch("/api/admin/rundown/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...(newSectionDate ? { event_date: newSectionDate } : {}) }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setCreatingSection(false);
    if (!response?.ok) {
      const failure = response ? failureMessage(data, "Day not added.") : PUTUS;
      setError(failure); toast.error("Day not added", failure);
      return;
    }
    tutupTambahHari();
    // Suntingan yang terbuka sudah ditanyakan saat + Day ditekan.
    pindah({ bagian: (data as RundownSection).id, baris: null, panel: "baris" });
    toast.success("Day added", "It is still a draft. Add the schedule, then publish it in Day settings.");
    await load();
  }

  /** Salin satu baris tersimpan ke bagian `ke`: jam, judul, Details, Break, English, Published dan Who sees it. */
  async function salinBaris(item: ItemAgenda, ke: number): Promise<{ id: number } | { galat: string }> {
    const syarat = syaratInfo?.available ? syaratSaved[item.id] ?? null : null;
    // Satu INSERT membawa semuanya (draf, teks English): salinan draf tidak pernah sesaat tampil.
    const response = await fetch("/api/admin/rundown/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: ke,
        start_time: formatClock(item.start_time),
        end_time: item.end_time ? formatClock(item.end_time) : null,
        title: item.title,
        subtitle: item.subtitle,
        is_break: item.is_break,
        is_published: item.is_published,
        ...(item.title_en ? { title_en: item.title_en } : {}),
        ...(item.subtitle_en ? { subtitle_en: item.subtitle_en } : {}),
        ...(syarat ? { audience: syarat } : {}),
      }),
    }).catch(() => null);
    if (!response) return { galat: PUTUS };
    const data = (await response.json().catch(() => null)) as { id?: number; error?: { details?: { message?: string } } } | null;
    if (response.ok && typeof data?.id === "number") return { id: data.id };
    if (response.status === 422) return { galat: data?.error?.details?.message ?? "Its Who sees it condition is no longer valid. Fix it on the original item, then duplicate again." };
    return { galat: "The server did not save the copy. Try again." };
  }

  /** Row menu > Duplicate (same day or another day). Opens the copy in Edit item. */
  async function duplikatBaris(item: ItemAgenda, ke: number) {
    if (duplicating) return;
    const asli = barisTersimpan.get(item.id) ?? item;
    setDuplicating(true);
    const hasil = await salinBaris(asli, ke);
    setDuplicating(false);
    if ("galat" in hasil) { toast.error("Item not duplicated", hasil.galat); return; }
    const id = hasil.id;
    await load();
    await loadSyarat();
    const hari = sections.find((row) => row.id === ke)?.name ?? "";
    toast.success("Item duplicated", ke === asli.section_id ? "The copy is open for editing." : `Copied to ${hari}. The copy is open for editing.`);
    pindah({ bagian: ke, baris: id, panel: "baris" }, () => { setPanelTerbuka(true); bukaLayarEditor(); });
  }

  /** Day settings > Duplicate day: a draft copy with every item. Dress code and day settings stay behind. */
  async function duplikatHari(section: RundownSection) {
    if (duplicating) return;
    setDuplicating(true);
    const response = await fetch("/api/admin/rundown/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${section.name} (copy)`.slice(0, 120), event_date: section.event_date }),
    }).catch(() => null);
    const data = response?.ok ? ((await response.json().catch(() => null)) as RundownSection | null) : null;
    if (!data) {
      setDuplicating(false);
      toast.error("Day not duplicated", "Check your connection and try again.");
      return;
    }
    const sumber = items.filter((row) => row.section_id === section.id).sort(bandingkanBaris);
    let gagal = 0;
    for (const row of sumber) if ("galat" in (await salinBaris(row, data.id))) gagal += 1;
    setDuplicating(false);
    setPanel("baris");
    setActiveId(data.id);
    setSelectedItemId(null);
    await load();
    await loadSyarat();
    if (gagal) toast.error("Day partly duplicated", `${plural(gagal, "item")} could not be copied. Add them by hand.`);
    else toast.success("Day duplicated", "The copy is a draft. Rename it in Day settings, adjust times, then publish it. Dress code, Show before sign-in and Show first for are not copied.");
  }

  async function saveSection(section: RundownSection) {
    // Dress code punya segmen dan tombol simpannya sendiri, jadi isiannya yang
    // belum lengkap tidak lagi memblokir Save section. Who it's for tetap di sini.
    const simpanSasaran = sasaranBerubah(section.id);
    if (simpanSasaran && !sasaranLengkap(section.id)) return;
    const simpanPublik = publikBerubah(section.id);
    // Menyempit dulu (pola Who sees it baris): Show before sign-in yang dimatikan
    // disimpan SEBELUM bagian diterbitkan, jadi hari itu tidak sempat publik
    // walau satu permintaan gagal. Menyalakannya disimpan sesudahnya.
    const publikDulu = simpanPublik && publikDrafts[section.id] === false;
    const dikirim = suntingBagian?.id === section.id ? suntingBagian.isi : null;
    setSavingSection(true); setError(""); setGalatPanel(null);
    if (publikDulu && !(await savePublik(section))) { setSavingSection(false); return; }
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
        // sort_order sengaja tidak dikirim: urutan tab hanya lewat
        // /sections/order, supaya simpanan dari halaman basi tidak memindahkan
        // tab kembali ke tempat lamanya.
        // Branding TIDAK dikirim dari sini. Ia setelan global dengan tombol Simpan
        // sendiri di panel Header publik, karena header adalah identitas acara.
      }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      setSavingSection(false);
      gagalPanel("Day not saved", response ? failureMessage(data, "Day not saved.") : PUTUS);
      return;
    }
    // Gagal menyimpan Who it's for sudah menampilkan pesannya sendiri; drafnya tetap ada.
    const sasaranOk = simpanSasaran ? await saveSasaran(section) : true;
    const publikOk = simpanPublik && !publikDulu ? await savePublik(section) : true;
    // Muat ulang dulu, baru lapisan suntingan dibuang: tanggal bagian menggeser
    // jam bus lewat pemicu, dan catatan bus membaca tanggal tersimpan bersama
    // trip yang dimuat. Gagal memuat = bagian ini saja diperbarui. Kolom yang
    // diketik selama permintaan berjalan tetap di lapisan.
    if (!(await load())) setSections((kini) => kini.map((row) => (row.id === section.id ? { ...row, ...(data as RundownSection) } : row)));
    if (dikirim) setSuntingBagian((kini) => (kini?.id === section.id ? lapisanSisa(kini, dikirim) : kini));
    setSavingSection(false);
    if (sasaranOk && publikOk) {
      const sebelumMasuk = publikAktif(section.id);
      toast.success("Day saved", !section.is_published ? "This day is a draft. Nobody sees it yet." : sebelumMasuk ? "Shown on the event page and in the participant portal." : "Shown only to participants who have signed in.");
      // Day settings adalah dialog: tersimpan = ditutup.
      setPanel((kini) => (kini === "bagian" ? "baris" : kini));
    }
  }

  async function deleteSection(section: RundownSection) {
    setError(""); setGalatPanel(null);
    setDeletingSection(true);
    const response = await fetch(`/api/admin/rundown/sections?id=${section.id}`, { method: "DELETE" }).catch(() => null);
    setDeletingSection(false);
    setConfirmSection(null);
    if (!response?.ok) {
      const data = response ? await response.json().catch(() => ({})) : {};
      gagalPanel("Day not deleted", response ? failureMessage(data, "Day not deleted.") : PUTUS);
      return;
    }
    // Suntingan bagian ini ikut terhapus bersama bagiannya (sudah dikonfirmasi),
    // termasuk kartu Dress code-nya: dress code tersimpan di baris bagian itu.
    setGalatPanel(null);
    sesiBaru();
    buangBagian(section.id);
    buangDresscode(section.id);
    setDrafts((kini) => tanpa(kini, section.id));
    setSyaratBaru((kini) => tanpa(kini, section.id));
    setActiveId(null);
    setSelectedItemId(null);
    setPanel("baris");
    toast.success("Day deleted", "All of its agenda items were deleted too.");
    await load();
  }

  async function addItem() {
    if (activeId === null) return;
    const title = draft.title.trim();
    if (!title || !draft.start_time) {
      setGalatPanel({ kunci: kunciForm(terbuka), pesan: "Start time and title are required." });
      return;
    }
    const bagian = activeId;
    const syarat = syaratInfo?.available ? syaratBaru[bagian] ?? null : null;
    if (!syaratLengkap(syarat)) {
      setGalatPanel({ kunci: kunciForm(terbuka), pesan: "Choose a field and at least one answer for each condition under Who sees it, or select Everyone." });
      return;
    }
    setAddingItem(true); setError(""); setGalatPanel(null);
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
        ...(syarat ? { audience: syarat } : {}),
      }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setAddingItem(false);
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "AUDIENCE_NOT_READY") {
        setSyaratInfo((kini) => kini && { ...kini, available: false });
      }
      gagalPanel("Agenda item not added", response ? failureMessage(data, "Agenda item not added.") : PUTUS);
      return;
    }
    const baru = data as { id?: number; audience?: unknown };
    const tersimpan = bacaSyaratBaris(baru.audience);
    if (typeof baru.id === "number" && tersimpan) setSyaratSaved((kini) => ({ ...kini, [baru.id as number]: tersimpan }));
    setSyaratBaru((kini) => tanpa(kini, bagian));
    // Jam mulai baris berikutnya diisi jam selesai baris ini. Rundown disusun
    // berurutan dan bersambung, jadi ini menghilangkan pengetikan yang berulang
    // sekaligus mengurangi celah waktu yang tidak disengaja.
    setJamAwal((kini) => ({ ...kini, [bagian]: draft.end_time || "" }));
    setDrafts((kini) => tanpa(kini, bagian));
    toast.success("Agenda item added");
    await load();
  }

  async function saveItem(item: RundownItem) {
    // Kolom yang dikirim: sesudah berhasil, hanya itu yang dibuang dari lapisan.
    const dikirim = suntingBaris?.id === item.id ? suntingBaris.isi : null;
    const simpanSyarat = syaratBerubah(item.id);
    if (simpanSyarat && !syaratLengkap(syaratDrafts[item.id] ?? null)) {
      gagalPanel("Agenda item not saved", "Choose a field and at least one answer for each condition under Who sees it, or select Everyone.");
      return;
    }
    setSavingItem(item.id); setError(""); setGalatPanel(null);
    // Urutan dua permintaan dipilih supaya gagal di tengah tidak pernah membuka
    // baris ke lebih banyak peserta: syarat yang mempersempit disimpan DULU
    // (baru sesudahnya Published), Everyone disimpan TERAKHIR (sesudah
    // baris mungkin disembunyikan). Gagal = berhenti, sisanya tetap draf.
    const keSemua = simpanSyarat && !syaratDrafts[item.id];
    if (simpanSyarat && !keSemua && !(await saveSyarat(item.id))) {
      setSavingItem(null);
      return;
    }
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
        // English hanya bila disunting di sini: Event page › English menulis kolom yang sama.
        ...(dikirim && "title_en" in dikirim ? { title_en: item.title_en?.trim() || null } : {}),
      }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      setSavingItem(null);
      gagalPanel("Agenda item not saved", response ? failureMessage(data, "Agenda item not saved.") : PUTUS);
      return;
    }
    // Muat ulang dulu, baru lapisan suntingan dibuang: pemicu menggeser jam bus
    // yang tertaut, dan catatan bus menghitung selisihnya dari jam tersimpan yang
    // dimuat bersama trip itu. Gagal memuat = baris ini saja diperbarui (bus_trips
    // tetap). Kolom yang diketik selama permintaan berjalan tetap di lapisan.
    if (!(await load())) setItems((kini) => kini.map((row) => (row.id === item.id ? { ...row, ...(data as RundownItem) } : row)));
    if (dikirim) setSuntingBaris((kini) => (kini?.id === item.id ? lapisanSisa(kini, dikirim) : kini));
    // Gagal menyimpan Who sees it sudah menampilkan pesannya sendiri; drafnya tetap ada.
    const syaratOk = keSemua ? await saveSyarat(item.id) : true;
    setSavingItem(null);
    if (syaratOk) toast.success("Agenda item saved");
  }

  async function deleteItem(item: RundownItem) {
    setDeletingItem(item.id); setError(""); setGalatPanel(null);
    const response = await fetch(`/api/admin/rundown/items?id=${item.id}`, { method: "DELETE" }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setDeletingItem(null);
    setConfirmItem(null);
    if (!response?.ok) {
      gagalPanel("Agenda item not deleted", response ? failureMessage(data, "Agenda item not deleted.") : PUTUS);
      return;
    }
    // Dress code yang menaut ke baris ini dihapus server sesudah barisnya. Tanpa
    // `outfit` (tulisan kedua gagal) yang tersimpan tetap: "Item not found".
    const dresscode = (data as { outfit?: { section_id: number; entries: OutfitEntry[] } }).outfit;
    if (dresscode) setOutfitSaved((kini) => ({ ...kini, [dresscode.section_id]: dresscode.entries }));
    // Suntingan baris ini ikut terhapus bersama barisnya (sudah dikonfirmasi).
    setSuntingBaris((kini) => (kini?.id === item.id ? null : kini));
    setSelectedItemId((current) => (current === item.id ? null : current));
    setLayarEditor(false);
    setPanelTerbuka(false);
    toast.success("Agenda item deleted");
    await load();
  }

  /** `dariPanel`: Move up/down di Edit item, jadi galatnya tampil di kaki panel. */
  async function reorderSlot(ids: number[], movedId: number, dariPanel = false) {
    if (activeId === null || reordering) return;
    const sectionItems = items.filter((item) => item.section_id === activeId);
    const changes = susunUlangSlot(sectionItems, ids);
    if (!changes) return;
    // Optimistis: hanya sort_order yang diubah. Suntingan yang belum disimpan
    // ada di lapisan suntingBaris dan tidak tersentuh.
    const before = sectionItems.filter((row) => changes.some((change) => change.id === row.id)).map(({ id, sort_order }) => ({ id, sort_order }));
    const apply = (list: Array<{ id: number; sort_order: number }>) =>
      setItems((current) => current.map((row) => {
        const found = list.find((change) => change.id === row.id);
        return found ? { ...row, sort_order: found.sort_order } : row;
      }));
    apply(changes);
    setReordering(true); setError("");
    if (dariPanel) setGalatPanel(null);
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
      // sebagian perubahan. Yang dikembalikan hanya sort_order yang digeser
      // tadi: simpanan atau baris baru yang dimuat selama permintaan berjalan
      // tetap, dan suntingan yang belum disimpan ada di lapisannya sendiri.
      apply(before);
      const failure = response ? failureMessage(data, "Something went wrong. Try again.") : PUTUS;
      if (dariPanel) gagalPanel("Order not saved", failure);
      else { setError(failure); toast.error("Order not saved", failure); }
      const fresh = await fetch("/api/admin/rundown/sections", { cache: "no-store" }).catch(() => null);
      if (fresh?.ok) apply(((await fresh.json()) as Payload).items);
      return;
    }
    apply((data as { items?: RundownItem[] }).items ?? []);
    const moved = sectionItems.find((item) => item.id === movedId);
    setReorderNote(`${moved?.title.trim() || "Item"} moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}.`);
  }

  async function reorderSections(ids: number[], note: string) {
    if (reordering) return;
    const changes = susunUlangBagian(sections, ids);
    if (!changes || changes.length === 0) return;
    // Optimistis dan hanya sort_order. Suntingan bagian yang belum disimpan ada
    // di lapisan suntingBagian dan tidak tersentuh. Gagal = sort_order yang
    // digeser saja yang kembali, sama dengan reorderSlot.
    const before = sections.filter((row) => changes.some((change) => change.id === row.id)).map(({ id, sort_order }) => ({ id, sort_order }));
    const apply = (list: Array<{ id: number; sort_order: number }>) =>
      setSections((current) => current.map((row) => {
        const found = list.find((change) => change.id === row.id);
        return found ? { ...row, sort_order: found.sort_order } : row;
      }));
    apply(changes);
    setReordering(true); setError(""); setGalatPanel(null);
    const response = await fetch("/api/admin/rundown/sections/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, expected: idBagian }),
    }).catch(() => null);
    setReordering(false);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      apply(before);
      gagalPanel("Tab order not saved", response ? failureMessage(data, "Something went wrong. Try again.") : PUTUS);
      const fresh = await fetch("/api/admin/rundown/sections", { cache: "no-store" }).catch(() => null);
      if (fresh?.ok) apply(((await fresh.json()) as Payload).sections);
      return;
    }
    apply((data as { sections?: RundownSection[] }).sections ?? []);
    setReorderNote(note);
  }

  function moveSection(section: RundownSection, direction: -1 | 1) {
    const next = geserBagian(idBagian, section.id, direction);
    if (!next) return;
    void reorderSections(next, `${section.name} moved to tab ${next.indexOf(section.id) + 1} of ${next.length}.`);
    // Sampai di ujung: tombol yang baru dipakai jadi mati, fokus pindah ke arah sebaliknya.
    const posisi = next.indexOf(section.id);
    const tujuan = posisi === 0 ? "right" : posisi === next.length - 1 ? "left" : null;
    if (tujuan) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-move-tab="${tujuan}"]`)?.focus());
  }

  function moveInSlot(item: RundownItem, direction: -1 | 1, fromPanel = false) {
    const ids = slots.get(kunciSlot(item.start_time)) ?? [];
    const next = geserDalamSlot(ids, item.id, direction);
    if (!next) return;
    void reorderSlot(next, item.id, fromPanel);
    // Baris sampai di ujung slot: tombol yang baru dipakai jadi mati, jadi fokus
    // dipindah ke tombol arah sebaliknya supaya pengguna keyboard tidak tersesat.
    if (fromPanel) {
      const posisi = next.indexOf(item.id);
      const tujuan = posisi === 0 ? "down" : posisi === next.length - 1 ? "up" : null;
      if (tujuan) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-move="${tujuan}"]`)?.focus());
    }
  }

  // ---- Dress code bagian aktif ------------------------------------------------------
  // Hanya Gathering Horizon dengan kolom outfit (migrasi 202610160001).
  const dresscodeAda = outfitMuat === "siap" && Boolean(outfitInfo?.horizon && outfitInfo.available);
  // Baris Dress code tampil juga saat memuat atau gagal, bila Who it's for sudah
  // memastikan acaranya Horizon. Acara lain tidak bergeser satu piksel pun.
  const barisDcTampil = outfitMuat === "siap" ? dresscodeAda : Boolean(sasaranInfo?.horizon);
  const drafDc = (id: number): DrafDresscode[] => outfitDrafts[id] ?? keDraf(outfitSaved[id] ?? []);

  /** Kartu Dress code bagian ini berbeda dari yang tersimpan. */
  function dcBerubah(id: number) {
    const draf = outfitDrafts[id];
    return draf !== undefined && !samaDraf(draf, keDraf(outfitSaved[id] ?? []));
  }

  /** Baris tersimpan satu bagian, urut jadwal: server dan peserta membaca yang tersimpan. */
  function barisTab(id: number): BarisDc[] {
    return items.filter((row) => row.section_id === id).sort(bandingkanBaris);
  }

  // Tab yang dibuka portal: terbit dan punya butir publik berjudul
  // (loadAgendaPreview). Banner, toast dan label batch memakai aturan yang
  // sama dengan server, jadi "Participants see" sama dengan teks tersimpan.
  const tabTerlihat = tabTerlihatOutfit(sections, items);
  function terlihat(id: number) {
    return tabTerlihat.has(id);
  }

  /**
   * Dress code tersimpan satu bagian dibaca ulang, misalnya sesudah 422
   * karena barisnya dihapus di tempat lain. Bukan loadOutfit(): keadaan
   * "memuat" menutup segmen Dress code dan memasang ulang editornya. Kartu
   * yang belum disimpan tetap di outfitDrafts.
   */
  async function muatUlangDresscode(id: number) {
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/outfit"), { cache: "no-store" }).catch(() => null);
    const data = response?.ok ? ((await response.json().catch(() => null)) as { sections?: Array<{ id: number; outfit: OutfitEntry[] }> } | null) : null;
    const baris = data?.sections?.find((row) => row.id === id);
    if (baris) setOutfitSaved((kini) => ({ ...kini, [id]: baris.outfit }));
  }

  /**
   * Foto contoh lewat endpoint unggah yang sama dengan latar header (lib/outfit-foto.ts,
   * juga dipakai Every day di Participant area); masuk draf sampai Save dress code.
   */
  async function uploadFotoDresscode(kunci: string, file: File) {
    if (!active) return;
    const id = active.id;
    // Diperiksa di sini dulu: berkas yang salah tidak perlu diunggah untuk ditolak.
    if (!fotoOutfitSah(file)) {
      gagalPanel("Photo not uploaded", FOTO_OUTFIT_SALAH);
      return;
    }
    const sesiAwal = sesiForm.current;
    setUploadingOutfit({ bagian: id, kunci }); setError(""); setGalatPanel(null);
    const hasil = await unggahFotoOutfit(file);
    // Dress code ini dibuang (Discard) atau bagiannya dihapus selama unggahan berjalan: hasilnya ikut dibuang.
    if (sesiAwal !== sesiForm.current) return;
    setUploadingOutfit(null);
    if ("galat" in hasil) {
      gagalPanel("Photo not uploaded", hasil.galat);
      return;
    }
    // Hanya foto kartu ini, di draf terkini: yang diketik selama unggahan tetap
    // ada. outfitSaved dari render ini masih berlaku karena unggahan berjalan
    // satu per satu (Add photo mati di semua kartu) dan Save dress code
    // menunggunya selesai.
    const url = hasil.url;
    // `kunci` "kartu/pilihan": foto satu pilihan gaya (kunciFotoPilihan).
    const [kartu, pilihan] = kunci.split("/");
    setOutfitDrafts((kini) => ({
      ...kini,
      [id]: (kini[id] ?? keDraf(outfitSaved[id] ?? [])).map((isi) => {
        if (isi.kunci !== kartu) return isi;
        if (!pilihan) return { ...isi, photo_url: url };
        return { ...isi, options: isi.options.map((opsi) => (opsi.kunci === pilihan ? { ...opsi, photo_url: url } : opsi)) };
      }),
    }));
    toast.info("Photo uploaded", "Select Save dress code to show it to participants.");
  }

  /**
   * Save dress code: hanya dress code tab ini, bukan setelan bagiannya. Server
   * memeriksa tautan baris dan menulis teks waktunya.
   */
  async function saveDresscode(section: RundownSection) {
    const id = section.id;
    const daftar = drafDc(id);
    const dikirim = outfitDrafts[id];
    setPercobaanDc(id);
    // Isian yang belum lengkap ditolak sebelum dikirim; kolom pertamanya difokus.
    const kurang = urutDraf(daftar).find((isi) => drafKurang(isi) !== null);
    if (kurang) {
      gagalPanel("Dress code not saved", "Fill in the missing fields, or remove those lines.");
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-dresscode-kartu="${kurang.kunci}"] [data-dresscode-${drafKurang(kurang)}]`)?.focus(), 0);
      return;
    }
    // Aturan daftar yang sama dengan server, sebelum dikirim: isian lama tanpa
    // When terbaca sebagai beberapa Whole day. For kartu kedua difokus.
    const masalah = cekDaftarOutfit(keKiriman(daftar));
    if (masalah) {
      const ganda = urutDraf(daftar).filter((isi) => (masalah.jenis === "barisGanda" ? isi.jenis === "baris" && isi.item_id === masalah.item_id : isi.jenis === "seharian"))[1];
      gagalPanel("Dress code not saved", alasanDaftarOutfit(masalah, (itemId) => barisTersimpan.get(itemId)?.title.trim() || "That item"));
      if (ganda) window.setTimeout(() => document.querySelector<HTMLElement>(`[data-dresscode-kartu="${ganda.kunci}"] [data-dresscode-untuk]`)?.focus(), 0);
      return;
    }
    setSavingOutfit(id); setError(""); setGalatPanel(null);
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/outfit"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, outfit: keKiriman(daftar) }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setSavingOutfit(null);
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "OUTFIT_NOT_READY") {
        setOutfitInfo((current) => current && { ...current, available: false });
      }
      gagalPanel("Dress code not saved", response ? failureMessage(data, "Dress code not saved.") : CEK_KONEKSI);
      // Baris yang dihapus di tab atau oleh admin lain: agenda dan dress code
      // tersimpan dimuat ulang, jadi baris Dress code dan kartunya menyebut
      // yang benar-benar dibaca peserta.
      if (response?.status === 422) {
        void load();
        void muatUlangDresscode(id);
      }
      return;
    }
    const simpanan = (data as { outfit?: OutfitEntry[] }).outfit ?? [];
    setOutfitSaved((kini) => ({ ...kini, [id]: simpanan }));
    // Draf yang diganti selama permintaan berjalan belum tersimpan: tetap ada.
    setOutfitDrafts((kini) => (kini[id] === dikirim ? tanpa(kini, id) : kini));
    setPercobaanDc(null);
    const tersimpan = sections.find((row) => row.id === id);
    toast.success("Dress code saved", keteranganTersimpan({
      jumlah: simpanan.length,
      terbit: Boolean(tersimpan?.is_published),
      terlihat: terlihat(id),
      siapa: sasaranSaved[id]?.values ?? [],
      tanggal: tersimpan?.event_date ?? section.event_date,
      setiapHari: Boolean(outfitInfo?.every_day),
    }));
  }

  // ---- Untuk siapa bagian aktif ---------------------------------------------------
  const sasaranAktif: SasaranBagian | null = active ? (active.id in sasaranDrafts ? sasaranDrafts[active.id] : sasaranSaved[active.id] ?? null) : null;

  function setSasaranAktif(next: SasaranBagian | null) {
    if (!active) return;
    setSasaranDrafts((current) => ({ ...current, [active.id]: next }));
  }

  // ---- Siapa yang melihat baris terpilih ------------------------------------------
  function syaratBerubah(itemId: number) {
    if (!syaratInfo?.available || !(itemId in syaratDrafts)) return false;
    return JSON.stringify(syaratDrafts[itemId]) !== JSON.stringify(syaratSaved[itemId] ?? null);
  }

  /** "Show <question> answers on the event page": satu tanda per pertanyaan, langsung disimpan. */
  async function ubahLabel(field: string, on: boolean): Promise<boolean> {
    const response = await fetch(eventApiPath("/api/admin/rundown/items/label"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, on }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      gagalPanel("Event page setting not saved", response ? failureMessage(data, "Event page setting not saved.") : PUTUS);
      return false;
    }
    setSyaratInfo((kini) => kini && { ...kini, fields: kini.fields.map((k) => (k.key === field ? { ...k, label_agenda: on } : k)) });
    const nama = syaratInfo?.fields.find((k) => k.key === field)?.label ?? "These";
    toast.success(on ? `${nama} answers now show on the event page` : `${nama} answers hidden from the event page`);
    return true;
  }

  async function saveSyarat(itemId: number): Promise<boolean> {
    const dikirim = syaratDrafts[itemId];
    const response = await fetch(eventApiPath("/api/admin/rundown/items/sasaran"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, audience: dikirim ?? null }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "AUDIENCE_NOT_READY") {
        setSyaratInfo((kini) => kini && { ...kini, available: false });
      }
      gagalPanel("Who sees it not saved", response ? failureMessage(data, "Who sees it not saved.") : PUTUS);
      return false;
    }
    const tersimpan = bacaSyaratBaris((data as { audience?: unknown }).audience);
    setSyaratSaved((kini) => {
      const next = tanpa(kini, itemId);
      return tersimpan ? { ...next, [itemId]: tersimpan } : next;
    });
    // Draf yang diubah lagi selama permintaan berjalan tetap ada.
    setSyaratDrafts((kini) => (JSON.stringify(kini[itemId]) === JSON.stringify(dikirim) ? tanpa(kini, itemId) : kini));
    return true;
  }

  function sasaranBerubah(sectionId: number) {
    if (!sasaranInfo?.available || !(sectionId in sasaranDrafts)) return false;
    return JSON.stringify(sasaranDrafts[sectionId]) !== JSON.stringify(sasaranSaved[sectionId] ?? null);
  }

  /** "One group" tanpa jawaban terpilih tidak disimpan setengah jadi. */
  function sasaranLengkap(sectionId: number) {
    const draf = sasaranDrafts[sectionId];
    if (!draf || draf.values.length > 0) return true;
    gagalPanel("Section not saved", "Choose a participant field and at least one answer under Show first for, or select Everyone.");
    return false;
  }

  async function saveSasaran(section: RundownSection): Promise<boolean> {
    const dikirim = sasaranDrafts[section.id];
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/sasaran"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: section.id, audience: sasaranDrafts[section.id] ?? null }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "AUDIENCE_NOT_READY") {
        setSasaranInfo((current) => current && { ...current, available: false });
      }
      gagalPanel("Show first for not saved", response ? failureMessage(data, "Show first for not saved.") : PUTUS);
      return false;
    }
    setSasaranSaved((current) => ({ ...current, [section.id]: bacaSasaran((data as { audience?: unknown }).audience) }));
    // Draf yang diganti selama permintaan berjalan belum tersimpan: tetap ada.
    setSasaranDrafts((current) => (current[section.id] === dikirim ? tanpa(current, section.id) : current));
    return true;
  }

  // ---- Show before sign-in ---------------------------------------------------------
  /** Nilai draf bila ada, lalu yang tersimpan. Bagian baru = tampil (bawaan kolom). */
  function publikAktif(sectionId: number): boolean {
    return sectionId in publikDrafts ? publikDrafts[sectionId] : publikSaved[sectionId] ?? true;
  }

  function publikBerubah(sectionId: number) {
    if (!publikAda || !(sectionId in publikDrafts)) return false;
    return publikDrafts[sectionId] !== (publikSaved[sectionId] ?? true);
  }

  async function savePublik(section: RundownSection): Promise<boolean> {
    const dikirim = publikDrafts[section.id];
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/publik"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: section.id, show_before_sign_in: dikirim }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "PUBLIC_DAY_NOT_READY") setPublikAda(false);
      gagalPanel("Show before sign-in not saved", response ? failureMessage(data, "Show before sign-in not saved.") : PUTUS);
      return false;
    }
    setPublikSaved((current) => ({ ...current, [section.id]: (data as { show_before_sign_in?: boolean }).show_before_sign_in !== false }));
    // Draf yang diganti selama permintaan berjalan belum tersimpan: tetap ada.
    setPublikDrafts((current) => (current[section.id] === dikirim ? tanpa(current, section.id) : current));
    return true;
  }

  // Dari `sections` yang tersimpan: sakelar yang belum disimpan belum mengubah halaman publik.
  const publishedCount = sections.filter((row) => row.is_published).length;
  // Menghapus bagian ikut menghapus barisnya: trip bus yang tertaut ke baris
  // itu disebut di dialog hapus, sama dengan dialog hapus satu baris.
  const tripBagian = kalimatHapus(activeItems.flatMap((item) => item.bus_trips ?? []).map((trip) => trip.name));
  // Dress code tersimpan yang ikut terhapus: yang menaut ke baris itu, atau seluruh isian bagian itu.
  const dcHapus = confirmItem ? (outfitSaved[confirmItem.section_id] ?? []).find((isian) => isian.item_id === confirmItem.id)?.what ?? null : null;
  const jumlahDcBagian = confirmSection ? (outfitSaved[confirmSection.id] ?? []).length : 0;

  // ---- Penjaga suntingan --------------------------------------------------------
  // Panel kanan membuka satu formulir, dan hanya formulir itu yang boleh punya
  // suntingan belum disimpan. Pindah tab, segmen atau baris, Close, Add item,
  // + Section dan meninggalkan halaman ditanyakan dulu (pola Speakers). Susun
  // ulang, urutan tab dan simpanan tidak menyentuh lapisan suntingan.
  // Tanpa bagian, hanya header yang bisa disunting. Dress code yang ternyata
  // belum bisa dipakai (kolomnya belum ada) kembali ke Section.
  const panelAktif: Panel = !active ? "header" : panel === "dresscode" && !dresscodeAda ? "bagian" : panel;
  const terbuka = formTerbuka(panelAktif, active?.id ?? null, selectedItem?.id ?? null);

  // Unggahan yang masih berjalan dihitung suntingan: hasilnya milik formulir
  // ini, jadi meninggalkannya ditanyakan dulu.
  function formBerubah(form: FormAgenda): boolean {
    if (form.jenis === "baris") {
      const asli = barisTersimpan.get(form.id);
      return Boolean(asli && suntingBaris?.id === form.id && adaBeda(asli, suntingBaris.isi)) || syaratBerubah(form.id);
    }
    if (form.jenis === "baru") {
      const draf = drafts[form.bagian];
      return (draf !== undefined && drafBaruBerubah(draf, jamAwal[form.bagian] ?? "")) || Boolean(syaratBaru[form.bagian]);
    }
    if (form.jenis === "bagian") {
      const asli = sections.find((row) => row.id === form.id);
      return Boolean(asli && suntingBagian?.id === form.id && adaBeda(asli, suntingBagian.isi)) || sasaranBerubah(form.id) || publikBerubah(form.id);
    }
    if (form.jenis === "dresscode") return dcBerubah(form.bagian) || uploadingOutfit?.bagian === form.bagian;
    return Boolean(suntingHeader && adaBeda(header, suntingHeader)) || uploadingBackground || uploadingBranding;
  }
  const berubah = formBerubah(terbuka);
  // Formulir terbuka sedang disimpan, atau New item-nya sedang ditambahkan.
  const menyimpan = terbuka.jenis === "baris" ? savingItem === terbuka.id
    : terbuka.jenis === "baru" ? addingItem
      : terbuka.jenis === "bagian" ? savingSection
        : terbuka.jenis === "dresscode" ? savingOutfit === terbuka.bagian
          : savingHeader;

  /** Unggahan yang masih berjalan untuk formulir yang ditinggalkan tidak lagi mendarat. */
  function sesiBaru() {
    // eslint-disable-next-line react-hooks/immutability -- ref dari useRef di bagian sebelumnya, dioper lewat argumen hook
    sesiForm.current += 1;
    setSesi(sesiForm.current);
  }

  /** Lapisan formulir Section satu bagian: kolomnya dan Who it's for. */
  function buangBagian(id: number) {
    setSuntingBagian((kini) => (kini?.id === id ? null : kini));
    setSasaranDrafts((kini) => tanpa(kini, id));
    setPublikDrafts((kini) => tanpa(kini, id));
  }

  /** Kartu Dress code satu bagian dan foto yang sedang diunggah untuknya. */
  function buangDresscode(id: number) {
    setOutfitDrafts((kini) => tanpa(kini, id));
    setUploadingOutfit((kini) => (kini?.bagian === id ? null : kini));
    setPercobaanDc((kini) => (kini === id ? null : kini));
  }

  /** Formulir kembali ke nilai tersimpan: lapisan suntingannya dibuang. */
  function buangForm(form: FormAgenda) {
    setGalatPanel(null);
    sesiBaru();
    if (form.jenis === "baris") {
      const id = form.id;
      setSuntingBaris((kini) => (kini?.id === id ? null : kini));
      setSyaratDrafts((kini) => tanpa(kini, id));
    } else if (form.jenis === "baru") {
      const bagian = form.bagian;
      setDrafts((kini) => tanpa(kini, bagian));
      setSyaratBaru((kini) => tanpa(kini, bagian));
    } else if (form.jenis === "bagian") {
      buangBagian(form.id);
    } else if (form.jenis === "dresscode") {
      buangDresscode(form.bagian);
    } else {
      setSuntingHeader(null);
      setUploadingBackground(false);
      setUploadingBranding(false);
    }
  }

  /**
   * Jalankan `aksi` yang meninggalkan formulir terbuka (`ke`: formulir sesudah
   * aksi; tanpa `ke` selalu meninggalkan). Yang bersih dikosongkan, supaya
   * lapisannya tidak basi saat dibuka lagi. Yang bersuntingan ditanyakan dulu,
   * atau menunggu selama formulirnya disimpan. `fokus`: elemen yang terfokus
   * sebelum strip tab atau segmen memindahkan fokus ke tujuannya (sesudah
   * onChange), untuk Keep editing.
   */
  function lindungi(aksi: () => void, ke?: FormAgenda, fokus = fokusSekarang()) {
    if (ke && kunciForm(ke) === kunciForm(terbuka)) {
      aksi();
    } else if (!berubah) {
      buangForm(terbuka);
      aksi();
    } else if (menyimpan) {
      setSesudahSimpan({ aksi, ke, fokus });
    } else {
      setTertunda({ form: terbuka, aksi, fokus });
    }
  }

  // Simpanan selesai: aksi yang menunggu lewat lindungi() lagi. Berhasil dan
  // bersih = langsung jalan; gagal, atau ada ketikan baru selama permintaan
  // berjalan = ditanyakan.
  useEffect(() => {
    if (!sesudahSimpan || menyimpan) return;
    const timer = window.setTimeout(() => {
      setSesudahSimpan(null);
      lindungi(sesudahSimpan.aksi, sesudahSimpan.ke, sesudahSimpan.fokus);
    }, 0);
    return () => window.clearTimeout(timer);
  });

  /** Keep editing atau Esc: tetap di formulir. */
  function tetapSunting() {
    const fokus = tertunda?.fokus;
    setTertunda(null);
    // Sesudah Dialog mengembalikan fokusnya sendiri: ke tab atau segmen yang
    // masih terpilih, bukan ke tujuan yang batal dipilih.
    if (fokus) window.requestAnimationFrame(() => fokus.focus());
  }

  /** Pindah tab, baris terpilih atau segmen panel lewat lindungi(). */
  function pindah(tujuan: { bagian?: number; baris?: number | null; panel?: Panel }, lalu?: () => void) {
    const bagian = tujuan.bagian ?? activeId;
    const baris = tujuan.baris !== undefined ? tujuan.baris : bagian === activeId ? selectedItemId : null;
    const adaBaris = baris !== null && itemsTampil.some((row) => row.id === baris && row.section_id === bagian);
    lindungi(() => {
      if (tujuan.bagian !== undefined) setActiveId(tujuan.bagian);
      setSelectedItemId(baris);
      if (tujuan.panel) setPanel(tujuan.panel);
      lalu?.();
    }, formTerbuka(tujuan.panel ?? panel, bagian, adaBaris ? baris : null));
  }

  /** Galat aksi panel kanan: di kaki panel, dekat tombolnya, dan di toast. */
  function gagalPanel(judul: string, pesan: string) {
    setGalatPanel({ kunci: kunciForm(terbuka), pesan });
    toast.error(judul, pesan);
  }

  /** Nama tersimpan untuk judul dialog: judul baris atau label tab. */
  function namaForm(form: FormAgenda): string | null {
    if (form.jenis === "baris") return barisTersimpan.get(form.id)?.title ?? null;
    if (form.jenis === "bagian") return sections.find((row) => row.id === form.id)?.name ?? null;
    if (form.jenis === "dresscode") return sections.find((row) => row.id === form.bagian)?.name ?? null;
    return null;
  }

  /**
   * Segmen Dress code lewat penjaga. Di bawah 1024px panelnya di bawah jadwal,
   * jadi judulnya digulir ke layar dan difokus; tanpa itu klik di baris Dress
   * code tampak tidak berbuat apa-apa.
   */
  function bukaDresscode() {
    pindah({ panel: "dresscode" }, () => window.setTimeout(() => {
      if (window.matchMedia("(min-width: 1024px)").matches) return;
      setLayarEditor(true);
      const judul = document.getElementById(idJudulDc);
      judul?.scrollIntoView({ block: "start" });
      judul?.focus({ preventScroll: true });
    }, 0));
  }

  /** Dari Edit item: segmen Dress code, lalu What to wear di kartu baris itu, atau kartu baru untuknya. */
  function dresscodeBaris(item: RundownItem, baru: boolean) {
    const bagian = item.section_id;
    pindah({ panel: "dresscode" }, () => {
      const kartu = baru ? kartuBaru("baris", item.id) : null;
      if (kartu) setOutfitDrafts((kini) => ({ ...kini, [bagian]: [...(kini[bagian] ?? keDraf(outfitSaved[bagian] ?? [])), kartu] }));
      const pilih = kartu ? `[data-dresscode-kartu="${kartu.kunci}"]` : `[data-dresscode-baris="${item.id}"]`;
      window.setTimeout(() => document.querySelector<HTMLElement>(`${pilih} [data-dresscode-apa]`)?.focus(), 0);
    });
  }

  // Menutup atau memuat ulang tab, rel navigasi dan palet perintah juga
  // ditanyakan selama formulir terbuka punya suntingan.
  useJagaNavigasi(berubah, (lanjut) => lindungi(lanjut, undefined, null));
  const galatKaki = galatPanel?.kunci === kunciForm(terbuka) ? galatPanel.pesan : null;

  // ---- View as (audit A5) --------------------------------------------------------
  const opsiLihat = opsiLihatSebagai(syaratInfo);
  const pilihLihat = opsiLihat.find((o) => o.kunci === lihatSebagai) ?? null;
  const modeLihat: "semua" | "publik" | "kelompok" = lihatSebagai === "publik" && publikAda ? "publik" : pilihLihat ? "kelompok" : "semua";
  // Hari ini tampil sebelum masuk: diterbitkan dan Show before sign-in tersimpan.
  const hariPublik = active ? Boolean(sections.find((row) => row.id === active.id)?.is_published) && (publikSaved[active.id] ?? true) : false;
  /** Siapa yang melihat baris tersimpan ini menurut View as. */
  function lihatBaris(item: ItemAgenda): "ya" | "sebagian" | "tidak" {
    const asli = barisTersimpan.get(item.id) ?? item;
    if (!asli.is_published) return "tidak";
    const syarat = syaratSaved[item.id] ?? null;
    if (modeLihat === "publik") return hariPublik && !syaratMati(syarat, syaratInfo) ? "ya" : "tidak";
    if (modeLihat === "kelompok" && pilihLihat) return dilihatKelompok(syarat, pilihLihat, syaratInfo);
    return "ya";
  }
  const namaLihat = modeLihat === "publik" ? "Visitors before sign-in" : pilihLihat?.label ?? "";
  const hitungLihat = modeLihat === "semua" ? null : activeItems.filter((item) => lihatBaris(item) !== "tidak").length;
  const opsiMenuLihat = [
    { value: "semua", label: "View as everyone" },
    ...(publikAda ? [{ value: "publik", label: "Before sign-in" }] : []),
    ...opsiLihat.map((o) => ({ value: o.kunci, label: o.label })),
  ];
  const daftarHari = [...sections].sort(bandingkanBagian);
  return { updateSection, updateHeader, pilihBagian, mulaiTambahBaris, tutupPanel, bukaLayarEditor, tutupLayarEditor, uploadHeaderBackground, saveHeader, updateItem, updateDraft, failureMessage, bukaTambahHari, tutupTambahHari, createSection, salinBaris, duplikatBaris, duplikatHari, saveSection, deleteSection, addItem, saveItem, deleteItem, reorderSlot, reorderSections, moveSection, moveInSlot, dresscodeAda, barisDcTampil, drafDc, dcBerubah, barisTab, tabTerlihat, terlihat, muatUlangDresscode, uploadFotoDresscode, saveDresscode, sasaranAktif, setSasaranAktif, syaratBerubah, ubahLabel, saveSyarat, sasaranBerubah, sasaranLengkap, saveSasaran, publikAktif, publikBerubah, savePublik, publishedCount, tripBagian, dcHapus, jumlahDcBagian, panelAktif, terbuka, formBerubah, berubah, menyimpan, sesiBaru, buangBagian, buangDresscode, buangForm, lindungi, tetapSunting, pindah, gagalPanel, namaForm, bukaDresscode, dresscodeBaris, galatKaki, opsiLihat, pilihLihat, modeLihat, hariPublik, lihatBaris, namaLihat, hitungLihat, opsiMenuLihat, daftarHari };
}
