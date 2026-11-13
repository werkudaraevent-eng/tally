"use client";

import { plural } from "@/lib/plural";
import { LANDING_SECTION_ADMIN_LABELS, LANDING_SECTION_SOURCES, LANDING_BLOCK_MEMBER_TYPES, landingBlockMemberOnly, isLandingBlockId, isPortalEntry, type LandingBlock, type LandingBlockShowOn, type LandingBlockType, type LandingSectionId } from "@/lib/domain";
import { buatBlok } from "../blocks";
import { useEffect, useRef, type DragEvent, type ReactNode } from "react";
import { halamanBagianForum } from "../forum-editor";
import { MenuBlok, type ItemMenuBlok } from "../menu-blok";
import { IKON_BAGIAN, IKON_BLOK } from "../ikon-bagian";
import { ButtonLink, IconButton, StatusChip } from "@/components/m3";
import { ArrowDown, ArrowSquareOut, ArrowUp, ArrowUpRight, CaretLeft, CopySimple, DotsSixVertical, Eye, EyeSlash, Plus, Trash } from "@phosphor-icons/react";
import { cx } from "@/lib/m3/cx";
import Link from "@/components/event-link";
import { LANDING_SECTION_TONE_IDS, latarBagian } from "@/lib/landing-section-tone";
import { PilihLatar } from "../pilih-latar";
import { gulirKeBaris } from "./editor-bantu";
import type { useLandingCmsPage0 } from "./editor-0";
import type { useLandingCmsPage2 } from "./editor-2";
import type { useLandingCmsPage3 } from "./editor-3";

/** Bagian 5 dari 6 badan LandingCmsPage, dipindah apa adanya (audit platform, Fase 3). */
export function useLandingCmsPage4(c: Awaited<ReturnType<typeof useLandingCmsPage0>> & Awaited<ReturnType<typeof useLandingCmsPage2>> & Awaited<ReturnType<typeof useLandingCmsPage3>>) {
  const { JUMLAH, editorBagian, facts, forum, gathering, gulirDaftar, horizon, isiAgenda, isiLokasi, isiTentang, kontakPanitiaAdmin, landing, modeEn, modern, moveSection, sasaran, sections, seret, setBagian, setHalamanPratinjau, setKonfirmasiHapus, setLanding, setSasaran, setSeret, setSisipSesudah, setSorot, setTambahTerbuka, setTerbuka, setUrungan, sisipSesudah, terbuka, toast, tujuanGeser, urungan, warnaHalaman } = c;
  // ---- Peserta (area peserta) -------------------------------------------------
  // Setelannya pindah ke halaman sendiri, di samping Daftar peserta dan
  // Pengumuman. Tab ini tinggal penunjuk bagi yang terbiasa mencarinya di sini.

  /**
   * Menghapus blok dari DRAF. Belum ada yang hilang dari server sampai Simpan,
   * dan sampai saat itu "Urungkan" mengembalikan blok di posisi semula.
   */
  function hapusBlok(ids: string[]) {
    const buang = new Set(ids);
    setUrungan({
      pesan: `${ids.length === 1 ? "Block" : plural(ids.length, "block")} deleted. Takes effect when you save.`,
      sections,
      blocks: landing.blocks ?? [],
    });
    setLanding({
      ...landing,
      sections: sections.filter((item) => !buang.has(item.id)),
      blocks: (landing.blocks ?? []).filter((item) => !buang.has(item.id)),
    });
    if (terbuka && buang.has(terbuka)) setTerbuka(null);
  }

  function urungkan() {
    if (!urungan) return;
    setLanding({ ...landing, sections: urungan.sections, blocks: urungan.blocks });
    setUrungan(null);
  }

  /** Salinan tepat di bawah aslinya, dengan id baru. */
  function duplikatBlok(index: number, blok: LandingBlock) {
    const salinan: LandingBlock = { ...structuredClone(blok), id: buatBlok(blok.type).id };
    const next = [...sections];
    next.splice(index + 1, 0, { id: salinan.id, enabled: sections[index].enabled });
    setLanding({ ...landing, sections: next, blocks: [...(landing.blocks ?? []), salinan] });
  }

  function setTampil(index: number, value: boolean) {
    // Tampil atau tidaknya portal disimpan di portal_section, bukan di susunan.
    if (isPortalEntry(sections[index])) { setLanding({ ...landing, portal_section: value }); return; }
    setLanding({ ...landing, sections: sections.map((item, position) => (position === index ? { ...item, enabled: value } : item)) });
  }

  function ubahBlok(next: LandingBlock) {
    setLanding({ ...landing, blocks: (landing.blocks ?? []).map((item) => (item.id === next.id ? next : item)) });
  }

  function tambahBlok(type: LandingBlockType, showOn?: LandingBlockShowOn) {
    const blok: LandingBlock = { ...buatBlok(type), ...(showOn ? { show_on: showOn } : {}) };
    // Blok baru masuk di akhir isi, tetap di atas Portal peserta yang ada di ujung,
    // atau tepat di bawah baris yang dipilih lewat "Add block below".
    const ujungPortal = sections.length > 0 && isPortalEntry(sections[sections.length - 1]);
    const sisip = sisipSesudah && sisipSesudah.indeks < sections.length ? sisipSesudah.indeks + 1 : null;
    const next = sisip !== null
      ? [...sections.slice(0, sisip), { id: blok.id, enabled: true }, ...sections.slice(sisip)]
      : ujungPortal ? [...sections.slice(0, -1), { id: blok.id, enabled: true }, sections[sections.length - 1]] : [...sections, { id: blok.id, enabled: true }];
    setSisipSesudah(null);
    setLanding({ ...landing, sections: next, blocks: [...(landing.blocks ?? []), blok] });
    setTambahTerbuka(false);
    setBagian("susunan");
    setTerbuka(blok.id);
    return blok.id;
  }

  // `?tambah=<jenis>&untuk=peserta`: Add block dari Participant area >
  // Participant home. Bloknya dibuat di sini, khusus peserta, dan terbuka
  // untuk diisi; tersimpan lewat Save seperti blok lain. Parameternya dihapus
  // dari alamat supaya muat ulang tidak menambah blok kedua.
  const tambahDariTautan = useRef(false);
  useEffect(() => {
    if (tambahDariTautan.current || !facts) return;
    tambahDariTautan.current = true;
    const alamat = new URL(window.location.href);
    const jenis = alamat.searchParams.get("tambah");
    if (!jenis) return;
    alamat.searchParams.delete("tambah");
    alamat.searchParams.delete("untuk");
    window.history.replaceState(window.history.state, "", alamat.pathname + alamat.search + alamat.hash);
    if (!LANDING_BLOCK_MEMBER_TYPES.includes(jenis as LandingBlockType)) { toast.error("Block not added", "That block type doesn't exist. Use Add block in Participant area."); return; }
    if ((landing.blocks ?? []).length >= 30) { toast.error("Block not added", "This event already has 30 blocks, the most allowed. Delete one first."); return; }
    const timer = window.setTimeout(() => {
      gulirKeBaris(tambahBlok(jenis as LandingBlockType, "member"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [facts]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Seret-lepas di daftar susunan. Tombol panah tetap ada untuk papan ketik. */
  function lepas(target: number) {
    if (seret === null || seret === target) { setSeret(null); setSasaran(null); return; }
    const next = [...sections];
    const [pindah] = next.splice(seret, 1);
    next.splice(target, 0, pindah);
    setLanding({ ...landing, sections: next });
    setSeret(null);
    setSasaran(null);
  }


  // ---- Susunan halaman -----------------------------------------------------------
  // Satu daftar dengan urutan yang sama dengan halaman publik: Pembuka di atas,
  // bagian dan blok di tengah (bisa diseret), Kaki di bawah. Hanya satu bagian
  // terbuka sekaligus, supaya daftarnya tetap terbaca sebagai peta halaman.
  function bukaTutup(id: string) {
    const buka = terbuka !== id;
    const wadah = document.getElementById(`baris-${id}`)?.closest<HTMLElement>(".overflow-y-auto");
    // Drill-in: posisi gulir daftar disimpan saat masuk, dan dipulihkan saat
    // kembali, supaya orang kembali ke tempat ia meninggalkan daftar.
    // eslint-disable-next-line react-hooks/immutability -- ref dari useRef di bagian sebelumnya, dioper lewat argumen hook
    if (buka && terbuka === null && wadah) gulirDaftar.current = wadah.scrollTop;
    setTerbuka(buka ? id : null);
    if (!buka) {
      const posisi = gulirDaftar.current;
      window.requestAnimationFrame(() => {
        const daftar = document.getElementById(`baris-${id}`)?.closest<HTMLElement>(".overflow-y-auto");
        if (daftar && posisi !== null) daftar.scrollTop = posisi;
        gulirKeBaris(id, true);
      });
      return;
    }
    if (forum) setHalamanPratinjau((current) => halamanBagianForum(id, current));
    setSorot((current) => ({ id, n: (current?.n ?? 0) + 1 }));
    gulirKeBaris(id);
  }

  function barisSusunan({
    id,
    nomor,
    judul,
    sub,
    lencana,
    saklar,
    indeks,
    isi,
    menu,
    titik = false,
    sumber,
  }: {
    id: string;
    /** Angka urutan, atau ikon untuk baris otomatis yang tidak punya tempat di `sections`. */
    nomor: ReactNode;
    judul: string;
    sub?: string | null;
    lencana?: string | null;
    saklar?: { checked: boolean; onChange: (value: boolean) => void };
    /** Posisi di `sections`; kosong untuk Pembuka dan Kaki yang tidak bisa dipindah. */
    indeks?: number;
    isi: ReactNode;
    menu?: ItemMenuBlok[];
    /**
     * Titik jingga: baris ini perlu dilihat. `true` = mode EN, ada teks yang
     * belum diterjemahkan; teks = alasan lain, dibacakan apa adanya.
     */
    titik?: boolean | string;
    /** Bagian yang isinya disunting di modul lain: tautan "Agenda ↗" di baris. */
    sumber?: { label: string; href: string };
  }) {
    const buka = terbuka === id;
    const tersembunyi = saklar ? !saklar.checked : false;
    const blokIni = isLandingBlockId(id) ? blokById.get(id) : undefined;
    const Ikon = blokIni ? IKON_BLOK[blokIni.type] : forum ? undefined : IKON_BAGIAN[id as keyof typeof IKON_BAGIAN];
    const alasanTitik = typeof titik === "string" ? titik : "Some text isn't translated yet.";
    // Yang bisa diseret hanya pegangannya: kalau seluruh baris draggable,
    // memblok teks di kolom isian ikut memulai seretan. Pegangannya selebar
    // seluruh tinggi baris (24x48), bukan ikon 16px.
    const bisaSeret = indeks !== undefined;
    // Drill-in (pola editor tema Shopify, panel properti Webflow): bagian yang
    // dibuka MENGGANTIKAN daftar, dengan jejak "‹ Sections / nama" di atasnya.
    // Baris lain tidak dirender sampai kembali ke daftar.
    if (terbuka !== null && !buka) return null;
    if (buka) {
      return (
        <li key={id} id={`baris-${id}`} className="flex flex-col">
          <div className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-outline-variant bg-surface-container-lowest pl-1 pr-2 max-lg:top-(--topbar-height)">
            <IconButton size="sm" className="size-10!" label="Back to sections" onClick={() => bukaTutup(id)}>
              <CaretLeft size={18} />
            </IconButton>
            <button type="button" onClick={() => bukaTutup(id)} className="shrink-0 rounded-sm px-1 text-body-medium text-on-surface-variant hover:text-on-surface">
              {modeEn ? "Translate" : "Sections"}
            </button>
            <span aria-hidden className="shrink-0 text-body-medium text-on-surface-variant">/</span>
            <h2 tabIndex={-1} className="min-w-0 flex-1 truncate px-1 text-body-medium font-medium text-on-surface" title={judul}>{judul}</h2>
            {lencana ? <StatusChip tone="warning" className="shrink-0 max-sm:hidden">{lencana}</StatusChip> : null}
            {saklar ? (
              <IconButton size="sm" className="size-10!" label={saklar.checked ? `Hide ${judul}` : `Show ${judul}`} onClick={() => saklar.onChange(!saklar.checked)}>
                {saklar.checked ? <Eye size={20} /> : <EyeSlash size={20} />}
              </IconButton>
            ) : null}
            {menu ? <MenuBlok label={`Menu: ${judul}`} items={menu} /> : null}
          </div>
          <div id={`isi-${id}`} className="flex flex-col gap-4 px-4 pb-4 pt-3">
            {sub || sumber ? (
              <div className="flex min-h-8 items-center gap-2">
                {Ikon ? <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-sm bg-surface-container-high text-on-surface-variant"><Ikon size={16} /></span> : null}
                <p className="min-w-0 flex-1 text-body-small text-on-surface-variant">{tersembunyi && sub ? `${sub} · hidden` : sub}</p>
                {sumber ? (
                  <ButtonLink href={sumber.href} target="_blank" rel="noreferrer" variant="outlined" size="sm" trailingIcon={<ArrowUpRight size={14} />} className="shrink-0" aria-label={`Edit in ${sumber.label}, opens in a new tab`}>
                    {sumber.label}
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
            {titik ? <p className="text-body-small font-medium text-on-warning-soft">{alasanTitik}</p> : null}
            {isi}
          </div>
        </li>
      );
    }
    return (
      <li
        key={id}
        id={`baris-${id}`}
        className={cx(
          "border-b border-outline-variant",
          bisaSeret && seret === indeks && "opacity-50",
          bisaSeret && sasaran === indeks && seret !== null && seret !== indeks && (seret < indeks ? "border-b-2 border-b-primary" : "border-t-2 border-t-primary"),
        )}
        onDragOver={bisaSeret ? (event: DragEvent<HTMLLIElement>) => { if (seret === null) return; event.preventDefault(); setSasaran(indeks); } : undefined}
        onDrop={bisaSeret ? (event: DragEvent<HTMLLIElement>) => { event.preventDefault(); lepas(indeks); } : undefined}
      >
        <div
          className={cx(
            "flex items-center gap-2 pr-2",
            // Terbuka: kepala menempel di atas panel, supaya blok yang panjang
            // bisa ditutup tanpa menggulir balik ke atas.
            buka ? "sticky top-0 z-10 min-h-12 bg-primary-soft py-2 shadow-[inset_3px_0_0_var(--color-primary)]" : "h-12",
          )}
        >
          {bisaSeret ? (
            <span
              draggable
              onDragStart={(event) => { setSeret(indeks); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", judul); }}
              onDragEnd={() => { setSeret(null); setSasaran(null); }}
              className="flex h-12 w-6 shrink-0 cursor-grab items-center justify-center self-stretch text-on-surface-variant opacity-80 hover:opacity-100"
              title="Drag to move"
            >
              <DotsSixVertical size={16} aria-hidden />
            </span>
          ) : <span className="w-6 shrink-0" aria-hidden />}
          <span
            className={cx(
              "grid size-7 shrink-0 place-items-center rounded-sm text-body-small font-medium tabular-nums",
              buka
                ? "bg-primary text-on-primary"
                : tersembunyi
                  ? "border border-dashed border-outline-variant text-on-surface-variant"
                  : "bg-surface-container-high text-on-surface-variant",
            )}
            aria-hidden
          >
            {/* Ikon jenis, bukan nomor urut: urutan sudah terbaca dari posisi
                barisnya. Nomor tinggal untuk baris tanpa ikon (Forum). */}
            {Ikon ? <Ikon size={16} /> : nomor}
          </span>
          <button
            type="button"
            aria-expanded={buka}
            aria-controls={buka ? `isi-${id}` : undefined}
            onClick={() => bukaTutup(id)}
            className="min-w-0 flex-1 self-stretch rounded-sm text-left"
          >
            {/* Terbuka: judul utuh, karena di situlah orang membaca apa yang
                sedang ia sunting. Tertutup: satu baris, judul utuh di `title`. */}
            <span
              title={buka ? undefined : judul}
              className={cx(
                "block text-body-medium",
                buka ? "font-medium text-on-surface" : "truncate",
                !buka && (tersembunyi ? "text-on-surface-variant" : "font-medium text-on-surface"),
              )}
            >
              {judul}
            </span>
            {titik ? <span className="sr-only">{alasanTitik}</span> : null}
            {sub ? (
              <span title={sub} className={cx("block truncate text-body-small text-on-surface-variant", lencana && "max-sm:hidden")}>
                {tersembunyi ? `${sub} · hidden` : sub}
              </span>
            ) : null}
            {/* Ponsel: lencana di baris kedua, supaya judul tidak terpotong menjadi "P…" (QA #114 L1). */}
            {lencana ? <span className="block truncate text-body-small font-medium text-warning sm:hidden">{lencana}</span> : null}
          </button>
          {titik ? (
            <span className="mr-2 size-2 shrink-0 rounded-full bg-warning" title={alasanTitik} aria-hidden />
          ) : null}
          {lencana ? <StatusChip tone="warning" className="shrink-0 max-sm:hidden">{lencana}</StatusChip> : null}
          {/* Saat lencana tampil, tombol sumber disembunyikan supaya judul tidak terpotong
              ("Spea…", QA #355 M1); tombol yang sama ada di dalam bagian saat dibuka. */}
          {sumber && !buka && !lencana ? (
            <ButtonLink href={sumber.href} target="_blank" rel="noreferrer" variant="outlined" size="sm" trailingIcon={<ArrowUpRight size={14} />} className="shrink-0 max-sm:hidden" aria-label={`Edit in ${sumber.label}, opens in a new tab`}>
              {sumber.label}
            </ButtonLink>
          ) : null}
          {saklar ? (
            <IconButton
              size="sm"
              className="size-10!"
              label={saklar.checked ? `Hide ${judul}` : `Show ${judul}`}
              onClick={() => saklar.onChange(!saklar.checked)}
            >
              {saklar.checked ? <Eye size={20} /> : <EyeSlash size={20} />}
            </IconButton>
          ) : null}
          {menu ? (
            <MenuBlok label={`Menu: ${judul}`} items={menu} />
          ) : null}
        </div>
        {buka ? (
          <div id={`isi-${id}`} className="flex flex-col gap-4 bg-primary-soft/40 px-4 pb-4 pt-2">
            {isi}
          </div>
        ) : null}
      </li>
    );
  }

  /** Isi menu ⋯ sebuah baris. Naik/turun juga jalan papan ketik pengganti seret. */
  function menuBaris(index: number, judul: string, blok?: LandingBlock): ItemMenuBlok[] {
    const tampil = isPortalEntry(sections[index]) ? landing.portal_section !== false : sections[index].enabled;
    const items: ItemMenuBlok[] = [
      { label: "Move up", icon: <ArrowUp size={18} />, disabled: tujuanGeser(index, -1) < 0, onSelect: () => moveSection(index, -1) },
      { label: "Move down", icon: <ArrowDown size={18} />, disabled: tujuanGeser(index, 1) < 0, onSelect: () => moveSection(index, 1) },
    ];
    if (!forum && modern) {
      items.push({ label: "Add block below", icon: <Plus size={18} />, disabled: (landing.blocks ?? []).length >= 30, onSelect: () => { setSisipSesudah({ indeks: index, judul }); setTambahTerbuka(true); } });
    }
    if (blok) {
      items.push({ label: "Duplicate", icon: <CopySimple size={18} />, disabled: (landing.blocks ?? []).length >= 30, onSelect: () => duplikatBlok(index, blok) });
    }
    // Blok khusus peserta disembunyikan di Participant home, tempat ia tampil.
    if (!blok || !landingBlockMemberOnly(blok)) {
      items.push({
        label: tampil ? "Hide" : "Show",
        icon: tampil ? <EyeSlash size={18} /> : <Eye size={18} />,
        onSelect: () => setTampil(index, !tampil),
      });
    }
    if (blok) {
      items.push({ label: "Delete block…", icon: <Trash size={18} />, bahaya: true, onSelect: () => setKonfirmasiHapus({ ids: [blok.id], judul }) });
    }
    return items;
  }

  const blokById = new Map((landing.blocks ?? []).map((block) => [block.id, block]));

  function subBawaan(id: LandingSectionId): string {
    switch (id) {
      case "about": return horizon ? "Opening line, photo, heading and description" : gathering ? "Heading, cards and description" : "From the event description";
      case "agenda": return "Built-in · from the Agenda";
      // Gathering menampilkan hotel dari Logistik di tempat Venue (CMS mudah, butir 5).
      case "venue": return gathering ? "Your hotel from Logistics, else the venue" : "Venue name, address, map";
      case "speakers": return `Built-in · ${plural(JUMLAH.speakers ?? 0, "speaker")}`;
      case "faq": return `Built-in · ${plural(JUMLAH.faq ?? 0, "question")}`;
      // Modern tidak memberi tiga bagian ini tempat sendiri: subjudulnya
      // menyebut di mana isinya tampil, karena posisinya di daftar tidak
      // berpengaruh (CMS mudah, butir 4).
      case "highlights":
        return gathering
          ? "Not shown in the gathering layout"
          : modern
            ? `First figure beside About (automatic picture) · ${plural(JUMLAH.highlights ?? 0, "figure")}`
            : `Built-in · ${plural(JUMLAH.highlights ?? 0, "figure")}`;
      case "sponsors": return modern ? `Logo strip above the footer · ${plural(JUMLAH.sponsors ?? 0, "logo")}` : `Built-in · ${plural(JUMLAH.sponsors ?? 0, "logo")}`;
      // Horizon tidak punya kontak di kaki: bagiannya tampil di urutan daftar ini.
      case "contact": return horizon ? `Own section · ${plural(kontakPanitiaAdmin.length, "contact")}` : modern ? "Shown in the footer · name, phone, email" : "Name, phone, email";
    }
  }

  function isiBawaan(id: LandingSectionId): ReactNode {
    const sumber = LANDING_SECTION_SOURCES[id];
    const tautanSumber = sumber.href && facts ? (
      <Link href={`/e/${facts.slug}${sumber.href}`} className="inline-flex items-center gap-1 self-start rounded-sm text-body-medium font-medium text-primary hover:underline">
        {sumber.linkLabel}
        <ArrowSquareOut size={14} aria-hidden />
      </Link>
    ) : null;
    const isi = id === "about" ? isiTentang : id === "venue" ? isiLokasi : id === "agenda" ? isiAgenda : editorBagian(id);
    return (
      <>
        {id === "agenda" ? <p className="text-body-medium text-on-surface-variant">Sessions come from the Agenda automatically. Only published agenda sections and sessions show; this section stays hidden until something is published.</p> : null}
        {id === "venue" && gathering && facts ? (
          <>
            <p className="text-body-medium text-on-surface-variant">
              In the gathering layout this section shows the hotel from Logistics, with check-in and check-out times, and the menu calls it Hotel. The venue fields below show only while Logistics has no hotel.
            </p>
            <Link href={`/e/${facts.slug}/admin/logistik`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-start rounded-sm text-body-medium font-medium text-primary hover:underline">
              Open Logistics
              <ArrowSquareOut size={14} aria-hidden />
            </Link>
          </>
        ) : null}
        {tautanSumber}
        {isi}
        {/* Horizon memakai warna rancangannya sendiri untuk Tentang (krem) dan Rundown (navy). */}
        {gathering && (LANDING_SECTION_TONE_IDS as readonly string[]).includes(id) && !(horizon && (id === "about" || id === "agenda")) ? (
          // Pilihan yang sama dengan latar blok; bawaannya latar bagian sebelum ada pilihan.
          <div data-kolom="latar">
            <PilihLatar
              label={`${LANDING_SECTION_ADMIN_LABELS[id]} background`}
              tone={latarBagian(id, landing.section_tone)}
              warna={landing.section_bg_color?.[id]}
              saran={warnaHalaman}
              onTone={(tone) => {
                const warnaLain = { ...landing.section_bg_color };
                delete warnaLain[id];
                setLanding({ ...landing, section_tone: { ...landing.section_tone, [id]: tone }, section_bg_color: warnaLain });
              }}
              onWarna={(hex) => setLanding({ ...landing, section_bg_color: { ...landing.section_bg_color, [id]: hex } })}
            />
          </div>
        ) : null}
      </>
    );
  }

  // Blok tambahan yang tersembunyi: satu-satunya yang bisa dihapus massal.
  // Bagian bawaan (Pembicara, FAQ, ...) hanya bisa disembunyikan.
  // Blok khusus peserta tidak dihitung: saklarnya di Participant home, bukan di sini.
  const tersembunyi = sections.filter((section) => {
    const blok = isLandingBlockId(section.id) ? blokById.get(section.id) : undefined;
    return !section.enabled && !(blok && landingBlockMemberOnly(blok));
  });
  const blokTersembunyi = tersembunyi.filter((section) => isLandingBlockId(section.id) && blokById.has(section.id)).map((section) => section.id);
  // Forum menyimpan bagian tersembunyinya sendiri (forum.hidden), urutannya tetap.
  // Bagian Portal peserta otomatis (gathering) ikut dihitung: tanpa itu,
  // portal yang disembunyikan tidak bisa ditemukan lagi di daftar.
  const barisPortal = gathering;
  const jumlahTersembunyi = forum ? (landing.forum?.hidden ?? []).length : tersembunyi.length + (barisPortal && landing.portal_section === false ? 1 : 0);
  return { hapusBlok, urungkan, duplikatBlok, setTampil, ubahBlok, tambahBlok, tambahDariTautan, lepas, bukaTutup, barisSusunan, menuBaris, blokById, subBawaan, isiBawaan, tersembunyi, blokTersembunyi, barisPortal, jumlahTersembunyi };
}
