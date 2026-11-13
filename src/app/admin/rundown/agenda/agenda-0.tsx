"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DEFAULT_HEADER, type RundownHeader, type RundownSection } from "@/lib/rundown";
import { type DrafBaru, type FormAgenda, type Panel } from "@/lib/agenda-simpan-aman";
import type { LandingSpeaker } from "@/lib/domain";
import { type OutfitEntry } from "@/lib/outfit";
import { type DrafDresscode } from "../editor-dresscode";
import { bacaSasaran, type SasaranBagian } from "@/lib/sasaran-bagian";
import { type DrafSyarat, type InfoSiapaMelihat } from "../siapa-melihat";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import { useToast } from "@/components/toast";
import { eventApiPath } from "@/lib/event-url";
import { bacaOutfitSetiapHari } from "@/lib/outfit-setiap-hari";
import { bacaSyaratBaris } from "@/lib/sasaran-baris";
import { bandingkanBagian, bandingkanBaris, kunciSlot, urutBagianMenurutTanggal } from "@/lib/rundown-urutan";
import { normalizeBranding } from "@/lib/branding";
import { EMPTY_DRAFT, IsiBagian, IsiBaris, ItemAgenda, OutfitInfo, PUTUS, Payload, SasaranInfo, Tunda } from "./agenda-bantu";

/** Bagian 1 dari 5 badan RundownAdminPage, dipindah apa adanya (audit platform, Fase 3). */
export function useRundownAdminPage0() {
  // Hanya yang tersimpan di server. Suntingan formulir yang terbuka hidup di
  // lapisan sunting* (kolom yang diubah saja), jadi load() sesudah simpanan atau
  // aksi lain tidak pernah menimpanya. Jam dan tanggal tersimpan juga dibaca
  // dari sini: server menilai slot dari jam tersimpan, dan selisih trip bus
  // dijaga pemicu database terhadap nilai tersimpan.
  const [sections, setSections] = useState<RundownSection[]>([]);
  const [items, setItems] = useState<ItemAgenda[]>([]);
  const [suntingBagian, setSuntingBagian] = useState<{ id: number; isi: Partial<IsiBagian> } | null>(null);
  const [suntingBaris, setSuntingBaris] = useState<{ id: number; isi: Partial<IsiBaris> } | null>(null);
  // Baris dari tautan ?section=&item= ("Edit in Agenda" di Logistics), digulir
  // ke dalam layar sekali sesudah dimuat.
  const barisTautan = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>("baris");
  // Di bawah 1024px panel editor berada di bawah seluruh jadwal, jadi memilih
  // baris tampak tidak berbuat apa-apa. Selama ini true, editor menggantikan
  // jadwal (pola list-detail M3 di DESIGN.md) dengan tombol kembali.
  const [layarEditor, setLayarEditor] = useState(false);
  // Panel kanan hanya tampil saat ada yang disunting (audit A2): baris
  // terpilih, Add item, Dress code atau Screen header. Tanpa itu jadwal selebar penuh.
  const [panelTerbuka, setPanelTerbuka] = useState(false);
  // View as (audit A5): "semua", "publik" (sebelum masuk) atau kunci opsiLihatSebagai.
  const [lihatSebagai, setLihatSebagai] = useState("semua");
  // Speakers (audit A3) dan English (A7) dari /api/admin/speakers.
  const [pembicara, setPembicara] = useState<LandingSpeaker[] | null>(null);
  const [pembicaraGagal, setPembicaraGagal] = useState(false);
  const [menyimpanPembicara, setMenyimpanPembicara] = useState(false);
  const [enAktif, setEnAktif] = useState(false);
  const [bahasaAcara, setBahasaAcara] = useState<"id" | "en">("id");
  // Add day: tanggal dulu, nama mengikuti tanggal sampai panitia mengetiknya sendiri.
  const [newSectionDate, setNewSectionDate] = useState("");
  const [namaDiketik, setNamaDiketik] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, DrafBaru>>({});
  // Jam mulai New item yang diisikan dari jam selesai baris yang baru
  // ditambahkan, per bagian. Isian awal ini bukan suntingan.
  const [jamAwal, setJamAwal] = useState<Record<number, string>>({});
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);
  const [savingSection, setSavingSection] = useState(false);
  const [deletingSection, setDeletingSection] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  // Logo atau gambar sponsor yang sedang diunggah di BrandingEditor.
  const [uploadingBranding, setUploadingBranding] = useState(false);
  // Header berdiri sendiri dari bagian: satu setelan untuk seluruh acara, dengan
  // tombol Simpan sendiri. Digabung ke tombol Simpan bagian, admin yang hanya ingin
  // mengubah warna header terpaksa ikut menyimpan setelan tab yang tidak dia sentuh.
  const [header, setHeader] = useState<RundownHeader>(DEFAULT_HEADER);
  const [suntingHeader, setSuntingHeader] = useState<Partial<RundownHeader> | null>(null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  // Penanda simpan dan hapus dilacak PER baris, bukan satu penanda global: satu
  // penanda akan menonaktifkan seluruh tombol di halaman padahal hanya satu baris
  // yang sedang bekerja.
  const [savingItem, setSavingItem] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<number | null>(null);
  // Konfirmasi hapus lewat dialog: satu klik tak sengaja tidak boleh langsung
  // membuang data.
  const [confirmItem, setConfirmItem] = useState<ItemAgenda | null>(null);
  const [confirmSection, setConfirmSection] = useState<RundownSection | null>(null);
  // Susun ulang sesi paralel. Satu permintaan pada satu waktu: dua geseran yang
  // berbalapan bisa saling menimpa nomor urut.
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; after: boolean } | null>(null);
  const [reorderNote, setReorderNote] = useState("");
  const [error, setError] = useState("");
  // Galat aksi panel kanan tampil di kaki panel, dekat tombolnya, bukan di
  // Banner atas halaman. `kunci`: formulir tempat galat itu terjadi.
  const [galatPanel, setGalatPanel] = useState<{ kunci: string; pesan: string } | null>(null);
  // Aksi yang menunggu jawaban dialog "Discard changes to …?".
  const [tertunda, setTertunda] = useState<(Tunda & { form: FormAgenda }) | null>(null);
  // Aksi yang diminta selagi formulir terbuka disimpan. Discard tidak
  // ditawarkan selama permintaannya berjalan, karena permintaan itu tetap
  // mendarat: aksinya menunggu jawaban server, lalu lewat lindungi() lagi.
  const [sesudahSimpan, setSesudahSimpan] = useState<Tunda | null>(null);
  // Sesi formulir terbuka, naik tiap kali formulir ditinggalkan atau dibuang.
  // Unggahan mencatat sesinya saat mulai, dan hasil yang tiba sesudah sesinya
  // berganti dibuang: formulirnya sudah ditinggalkan. `sesi` salinannya untuk
  // render (callback BrandingEditor).
  const sesiForm = useRef(0);
  const [sesi, setSesi] = useState(0);
  // Tanggal mulai dan selesai acara (Event page), untuk peringatan tanggal bagian.
  const [eventDates, setEventDates] = useState<{ start: string | null; end: string | null } | null>(null);
  // Dress code per bagian: dimuat sekali saat halaman dibuka, terpisah dari
  // load() yang dipanggil ulang tiap simpan. Kartu yang belum disimpan ada di
  // outfitDrafts; outfitSaved yang tersimpan, yang dibaca peserta.
  const [outfitInfo, setOutfitInfo] = useState<OutfitInfo | null>(null);
  const [outfitMuat, setOutfitMuat] = useState<"memuat" | "gagal" | "siap">("memuat");
  const [outfitSaved, setOutfitSaved] = useState<Record<number, OutfitEntry[]>>({});
  const [outfitDrafts, setOutfitDrafts] = useState<Record<number, DrafDresscode[]>>({});
  const [savingOutfit, setSavingOutfit] = useState<number | null>(null);
  // Bagian yang Save dress code-nya pernah ditekan: kolom wajib yang kosong baru ditandai sesudahnya.
  const [percobaanDc, setPercobaanDc] = useState<number | null>(null);
  // Foto dress code yang sedang diunggah: bagian dan kunci kartunya. Kunci,
  // bukan nomor: Whole day selalu di depan, jadi nomor kartu bisa bergeser.
  const [uploadingOutfit, setUploadingOutfit] = useState<{ bagian: number; kunci: string } | null>(null);
  // Untuk siapa bagian ini: dimuat dan disimpan seperti outfit. Draf null =
  // untuk semua peserta; tidak ada di peta = belum disentuh.
  const [sasaranInfo, setSasaranInfo] = useState<SasaranInfo | null>(null);
  const [sasaranSaved, setSasaranSaved] = useState<Record<number, SasaranBagian | null>>({});
  const [sasaranDrafts, setSasaranDrafts] = useState<Record<number, SasaranBagian | null>>({});
  // Show before sign-in per bagian, pola yang sama: tidak ada di peta draf =
  // belum disentuh. null = migrasinya belum ada (sakelar tidak tampil).
  const [publikAda, setPublikAda] = useState<boolean | null>(null);
  const [publikSaved, setPublikSaved] = useState<Record<number, boolean>>({});
  const [publikDrafts, setPublikDrafts] = useState<Record<number, boolean>>({});
  // Siapa yang melihat tiap baris (Edit item > Who sees it), pola yang sama:
  // null = semua; tidak ada di peta draf = belum disentuh. Hanya baris bersyarat yang tersimpan di peta.
  const [syaratInfo, setSyaratInfo] = useState<InfoSiapaMelihat | null>(null);
  const [syaratSaved, setSyaratSaved] = useState<Record<number, DrafSyarat>>({});
  const [syaratDrafts, setSyaratDrafts] = useState<Record<number, DrafSyarat | null>>({});
  // Who sees it di New item, per bagian. Ikut dikirim bersama barisnya.
  const [syaratBaru, setSyaratBaru] = useState<Record<number, DrafSyarat | null>>({});
  // Zona acara dipakai supaya tanggal yang diecho di bawah kolom tanggal dihitung
  // dengan zona yang sama dengan halaman publik. Kalau tidak, admin bisa membaca
  // "Kamis" di CMS sementara tamu membaca "Rabu". Jam trip bus juga dibaca di
  // zona ini.
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();
  const idGalat = useId();
  const idJudulDc = useId();

  /** true bila bagian dan baris berhasil dimuat. */
  async function load(): Promise<boolean> {
    // Bagian dan header dimuat bersamaan: keduanya dibutuhkan sebelum halaman ini
    // berguna, dan memuatnya berurutan hanya menambah satu perjalanan jaringan.
    const hasil = await Promise.all([
      fetch("/api/admin/rundown/sections", { cache: "no-store" }),
      fetch("/api/admin/rundown/header", { cache: "no-store" }),
    ]).catch(() => null);
    if (!hasil) { setError("Connection lost. The agenda could not be loaded."); return false; }
    const [sectionResponse, headerResponse] = hasil;
    if (!sectionResponse.ok) { setError("The agenda could not be loaded."); return false; }
    const data = (await sectionResponse.json()) as Payload;
    setSections(data.sections);
    setItems(data.items);
    setEventDates(data.event_dates ?? null);
    setActiveId((current) => (current && data.sections.some((row) => row.id === current) ? current : data.sections[0]?.id ?? null));
    // Header yang gagal dimuat tidak menggagalkan seluruh halaman: jadwalnya tetap
    // bisa disusun, dan nilai bawaan tetap aman disimpan.
    if (headerResponse.ok) setHeader((await headerResponse.json()) as RundownHeader);
    setLoaded(true);
    return true;
  }

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  async function loadOutfit() {
    // Gagal dimuat: baris Dress code menyebutnya dengan Try again; sisa halaman tetap berjalan.
    setOutfitMuat("memuat");
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/outfit"), { cache: "no-store" }).catch(() => null);
    const data = response?.ok
      ? ((await response.json().catch(() => null)) as (Omit<OutfitInfo, "every_day"> & { every_day?: unknown; sections: Array<{ id: number; outfit: OutfitEntry[] }> }) | null)
      : null;
    if (!data) {
      setOutfitMuat("gagal");
      return;
    }
    setOutfitInfo({ available: data.available, horizon: data.horizon, label: data.label, every_day: bacaOutfitSetiapHari(data.every_day) });
    setOutfitSaved(Object.fromEntries(data.sections.map((row) => [row.id, row.outfit])));
    setOutfitMuat("siap");
  }

  async function loadSasaran() {
    // Gagal dimuat = kelompok Who it's for tidak tampil; sisa halaman tetap berjalan.
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/sasaran"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as SasaranInfo & { sections: Array<{ id: number; audience: unknown }> };
    setSasaranInfo({ available: data.available, horizon: data.horizon, fields: data.fields });
    setSasaranSaved(Object.fromEntries(data.sections.map((row) => [row.id, bacaSasaran(row.audience)])));
  }

  async function loadPublik() {
    // Gagal dimuat = sakelar Show before sign-in tidak tampil; sisa halaman tetap berjalan.
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/publik"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as { available: boolean; sections: Array<{ id: number; show_before_sign_in: boolean }> };
    setPublikAda(data.available);
    setPublikSaved(Object.fromEntries(data.sections.map((row) => [row.id, row.show_before_sign_in])));
  }

  async function loadPembicara() {
    const response = await fetch(eventApiPath("/api/admin/speakers"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setPembicaraGagal(true); return; }
    const data = (await response.json().catch(() => null)) as { speakers?: LandingSpeaker[]; en_enabled?: boolean; default_lang?: "id" | "en" } | null;
    if (!data) { setPembicaraGagal(true); return; }
    setPembicara(data.speakers ?? []);
    setEnAktif(Boolean(data.en_enabled));
    setBahasaAcara(data.default_lang === "en" ? "en" : "id");
  }

  /** Simpan daftar pembicara (tautan baris). Daftar berubah di tempat lain: pasang ulang perubahan ini di atasnya sekali. */
  async function simpanPembicara(next: LandingSpeaker[], pesan: string) {
    if (!pembicara) return;
    setMenyimpanPembicara(true);
    const kirim = async (base: LandingSpeaker[], speakers: LandingSpeaker[]) => fetch(eventApiPath("/api/admin/speakers"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base, speakers }),
    }).catch(() => null);
    let respon = await kirim(pembicara, next);
    let isi = respon ? await respon.json().catch(() => null) : null;
    if (respon?.status === 409 && Array.isArray(isi?.error?.details?.speakers)) {
      // Ulangi hanya pembicara yang tadi ditambah atau dilepas di baris ini, di atas daftar
      // terbaru. Tautan orang lain ke baris ini (dari tab lain) tetap seperti di server.
      const terbaru = isi.error.details.speakers as LandingSpeaker[];
      const id = selectedItemId;
      const punya = (orang: LandingSpeaker | undefined) => !!orang?.session_refs?.some((r) => r.id === id);
      const diubah = new Map(next.flatMap((orang, i) => (punya(orang) !== punya(pembicara[i]) ? [[orang.name, orang.session_refs?.find((r) => r.id === id) ?? null] as const] : [])));
      const pasang = terbaru.map((orang) => {
        if (id === null || !diubah.has(orang.name)) return orang;
        const mau = diubah.get(orang.name);
        const lain = (orang.session_refs ?? []).filter((r) => r.id !== id);
        return { ...orang, session_refs: mau ? [...lain, mau] : lain };
      });
      respon = await kirim(terbaru, pasang);
      isi = respon ? await respon.json().catch(() => null) : null;
      if (!respon?.ok) setPembicara(terbaru);
    }
    setMenyimpanPembicara(false);
    if (!respon?.ok) { toast.error("Speakers not saved", respon ? "Someone else changed the speaker list. The latest list is shown; try again." : PUTUS); return; }
    setPembicara((isi?.speakers ?? next) as LandingSpeaker[]);
    toast.success(pesan);
  }

  async function loadSyarat() {
    // Gagal dimuat = kelompok Who sees it tidak tampil; sisa halaman tetap berjalan.
    const response = await fetch(eventApiPath("/api/admin/rundown/items/sasaran"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as InfoSiapaMelihat & { items: Array<{ id: number; audience: unknown }> };
    setSyaratInfo({ available: data.available, fields: data.fields, hotels: data.hotels, hotels_failed: data.hotels_failed, rooms_shown: data.rooms_shown });
    setSyaratSaved(Object.fromEntries(data.items.flatMap((row) => {
      const syarat = bacaSyaratBaris(row.audience);
      return syarat ? [[row.id, syarat]] : [];
    })));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // ?section=<id>&item=<id> dari "Edit in Agenda" di Logistics: tab baris
      // itu, dengan barisnya terbuka di Edit item. load() mempertahankan tab
      // ini selama masih ada.
      const query = new URLSearchParams(window.location.search);
      const bagian = Number(query.get("section"));
      const baris = Number(query.get("item"));
      if (Number.isInteger(bagian) && bagian > 0) {
        setActiveId(bagian);
        if (Number.isInteger(baris) && baris > 0) {
          setSelectedItemId(baris);
          setPanel("baris");
          barisTautan.current = baris;
        }
      }
      void load();
      void loadOutfit();
      void loadSasaran();
      void loadPublik();
      void loadSyarat();
      void loadPembicara();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Strip tab di 1280 px bergulir, dan jadwalnya bisa panjang: tab dan baris
  // dari tautan digulir ke dalam layar.
  useEffect(() => {
    const baris = barisTautan.current;
    if (!loaded || baris === null) return;
    barisTautan.current = null;
    window.requestAnimationFrame(() => {
      document.getElementById(`bagian-tab-${activeId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      document.querySelector(`[data-rundown-row="${baris}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }, [loaded, activeId]);

  // Tersimpan ditambah suntingan formulir yang terbuka: daftar, tab dan formulir
  // menampilkan ini. Lencana Draft dan hitungan bagian publik membaca yang
  // tersimpan, karena sakelar yang belum disimpan belum mengubah halaman publik.
  const sectionsTampil = useMemo(
    () => (suntingBagian ? sections.map((row) => (row.id === suntingBagian.id ? { ...row, ...suntingBagian.isi } : row)) : sections),
    [sections, suntingBagian],
  );
  const itemsTampil = useMemo(
    () => (suntingBaris ? items.map((row) => (row.id === suntingBaris.id ? { ...row, ...suntingBaris.isi } : row)) : items),
    [items, suntingBaris],
  );
  const headerTampil = useMemo(() => ({ ...header, ...suntingHeader }), [header, suntingHeader]);
  const barisTersimpan = useMemo(() => new Map(items.map((row) => [row.id, row])), [items]);

  const active = sectionsTampil.find((row) => row.id === activeId) ?? null;
  // Tab tampil menurut sort_order lalu id, sama dengan halaman publik.
  const sectionsUrut = useMemo(() => [...sectionsTampil].sort(bandingkanBagian), [sectionsTampil]);
  const idBagian = sectionsUrut.map((row) => row.id);
  const idMenurutTanggal = urutBagianMenurutTanggal(sectionsTampil);
  const sudahUrutTanggal = idMenurutTanggal.every((id, index) => id === idBagian[index]);
  const draftAwal = activeId !== null && jamAwal[activeId] ? { ...EMPTY_DRAFT, start_time: jamAwal[activeId] } : EMPTY_DRAFT;
  const draft = (activeId !== null ? drafts[activeId] : undefined) ?? draftAwal;

  // Urut jam, lalu sort_order untuk butir berjam sama. Urutan yang sama dipakai
  // halaman publik, supaya yang dilihat admin sama dengan yang dilihat tamu.
  const activeItems = useMemo(() => {
    if (activeId === null) return [];
    // Baris yang jam mulainya diubah tetapi belum disimpan ditaruh di akhir slot
    // jam barunya, sama dengan tempat server menaruhnya saat disimpan. Tanpa ini
    // ia tampil menurut sort_order lamanya lalu melompat begitu disimpan.
    return itemsTampil
      .filter((item) => item.section_id === activeId)
      .map((item) => {
        const tersimpan = barisTersimpan.get(item.id)?.start_time;
        return tersimpan !== undefined && kunciSlot(tersimpan) !== kunciSlot(item.start_time) ? { ...item, sort_order: Number.MAX_SAFE_INTEGER } : item;
      })
      .sort(bandingkanBaris);
  }, [itemsTampil, activeId, barisTersimpan]);

  // Ada jam mulai yang diubah tetapi belum disimpan di bagian ini.
  const jamBelumDisimpan = activeItems.some((item) => kunciSlot(item.start_time) !== kunciSlot(barisTersimpan.get(item.id)?.start_time ?? item.start_time));

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
    () => normalizeBranding(headerTampil as unknown as Record<string, unknown>),
    [headerTampil],
  );
  return { sections, setSections, items, setItems, suntingBagian, setSuntingBagian, suntingBaris, setSuntingBaris, barisTautan, loaded, setLoaded, activeId, setActiveId, selectedItemId, setSelectedItemId, panel, setPanel, layarEditor, setLayarEditor, panelTerbuka, setPanelTerbuka, lihatSebagai, setLihatSebagai, pembicara, setPembicara, pembicaraGagal, setPembicaraGagal, menyimpanPembicara, setMenyimpanPembicara, enAktif, setEnAktif, bahasaAcara, setBahasaAcara, newSectionDate, setNewSectionDate, namaDiketik, setNamaDiketik, duplicating, setDuplicating, drafts, setDrafts, jamAwal, setJamAwal, addSectionOpen, setAddSectionOpen, newSectionName, setNewSectionName, creatingSection, setCreatingSection, savingSection, setSavingSection, deletingSection, setDeletingSection, uploadingBackground, setUploadingBackground, uploadingBranding, setUploadingBranding, header, setHeader, suntingHeader, setSuntingHeader, savingHeader, setSavingHeader, addingItem, setAddingItem, savingItem, setSavingItem, deletingItem, setDeletingItem, confirmItem, setConfirmItem, confirmSection, setConfirmSection, reordering, setReordering, dragId, setDragId, dropTarget, setDropTarget, reorderNote, setReorderNote, error, setError, galatPanel, setGalatPanel, tertunda, setTertunda, sesudahSimpan, setSesudahSimpan, sesiForm, sesi, setSesi, eventDates, setEventDates, outfitInfo, setOutfitInfo, outfitMuat, setOutfitMuat, outfitSaved, setOutfitSaved, outfitDrafts, setOutfitDrafts, savingOutfit, setSavingOutfit, percobaanDc, setPercobaanDc, uploadingOutfit, setUploadingOutfit, sasaranInfo, setSasaranInfo, sasaranSaved, setSasaranSaved, sasaranDrafts, setSasaranDrafts, publikAda, setPublikAda, publikSaved, setPublikSaved, publikDrafts, setPublikDrafts, syaratInfo, setSyaratInfo, syaratSaved, setSyaratSaved, syaratDrafts, setSyaratDrafts, syaratBaru, setSyaratBaru, zone, abbr, toast, idGalat, idJudulDc, load, loadOutfit, loadSasaran, loadPublik, loadPembicara, simpanPembicara, loadSyarat, sectionsTampil, itemsTampil, headerTampil, barisTersimpan, active, sectionsUrut, idBagian, idMenurutTanggal, sudahUrutTanggal, draftAwal, draft, activeItems, jamBelumDisimpan, slots, adaSlotParalel, selectedItem, selectedSlot, selectedSlotLokal, headerBranding };
}
