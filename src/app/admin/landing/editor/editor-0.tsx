"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { LANDING_NAV_HEIGHT_MAX, LANDING_NAV_HEIGHT_MIN, LANDING_SECTION_ADMIN_LABELS, HORIZON_TEXT_MAX, LANDING_BLOCK_LABELS, isLandingBlockId, type EventLandingConfig, type LandingForumPage, type LandingLayout, type LandingHeadedSection, type LandingSectionEntry, type LandingSectionId, type RegistrationFormConfig } from "@/lib/domain";
import { kartuRundownId, rundownBelumDiterjemahkan, type BarisRundownEn } from "../editor-en";
import { barisSesiDariAdmin, sesiHilang, type BarisSesi } from "../pilih-sesi";
import { DEFAULT_REGISTRATION_SEED } from "@/lib/registration-theme";
import { useAdminPage } from "@/components/admin/page-context";
import { bacaLokal, langgananLokal, tulisLokal } from "@/lib/local-store";
import { useToast } from "@/components/toast";
import { eventApiPath } from "@/lib/event-url";
import { LANDING_THEME_PRESETS } from "@/lib/landing-theme-presets";
import { pakaiPreset } from "../theme-presets";
import { emasHorizon as hitungEmasHorizon, landingTokens, sorotHorizon } from "@/lib/landing-tokens";
import { butirBerlebih, tautanBlokSalah } from "../blocks";
import { plural } from "@/lib/plural";
import { forumTautanSalah } from "../forum-editor";
import { pesanGalatApi } from "@/lib/api-message";
import { LANDING_UI, landingUntranslated } from "@/lib/landing-i18n";
import { cocokSesi, sesiDariRundown } from "@/lib/landing-speaker-tabs";
import Link from "@/components/event-link";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { Kelompok } from "@/components/admin/compact-form";
import { StatusChip, Switch, TextArea, TextField } from "@/components/m3";
import { adaLogistikTampil, bagianTampil } from "@/lib/logistik/bagian-tampil";
import { BERKAS_FORMAT, Bagian, BerkasIsi, Facts, KOLOM_FAKTA, KUNCI_BAHASA, KUNCI_PANEL, PANEL_BAWAAN, Urungan, barisRundownEnDariAdmin, fokusKolomLewat, gulirKeBaris, jepitPanel, judulBagianKepanjangan, kolomKepanjangan, simpanSusunan, statusRundown, susunanHalaman, tanpaEnYatim, tanpaTersembunyiKepanjangan } from "./editor-bantu";

/** Bagian 1 dari 6 badan LandingCmsPage, dipindah apa adanya (audit platform, Fase 3). */
export function useLandingCmsPage0() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [landing, setLanding] = useState<EventLandingConfig>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bagianDipilih, setBagian] = useState<Bagian>("susunan");
  // Hanya formulir: tidak ada halaman acara, jadi Susunan halaman tidak tampil
  // dan bagian yang terbuka jatuh ke Tema (juga saat sebuah tindakan meminta
  // Susunan halaman, mis. klik bagian di pratinjau).
  const hanyaFormulir = landing.tayang === "formulir";
  const bagian: Bagian = hanyaFormulir && bagianDipilih === "susunan" ? "tema" : bagianDipilih;
  // Baris Susunan halaman yang sedang terbuka ("pembuka", id bagian, atau "kaki").
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const gulirDaftar = useRef<number | null>(null);
  // `?bagian=tema|peserta`: tautan "Ubah di Tema" dan "Atur di Peserta" dari
  // Atur formulir membuka langsung tab yang dimaksud.
  // Dibaca setelah hidrasi (bukan di penginisialisasi useState): server tidak
  // tahu kueri ini, dan render pertama klien harus sama dengan markup server.
  useEffect(() => {
    const diminta = new URLSearchParams(window.location.search).get("bagian");
    if (diminta !== "tema" && diminta !== "peserta") return;
    // "peserta": tab Participants sudah tidak ada; saklarnya (Invite only) kini di baris Hero.
    const timer = window.setTimeout(() => {
      if (diminta === "tema") setBagian("tema");
      else { setBagian("susunan"); setTerbuka("pembuka"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  // Drill-in: bagian terbuka yang tidak lagi ada di daftar (layout diganti,
  // blok dihapus, mode bahasa berganti) mengembalikan panel ke daftar, bukan
  // menyisakan panel kosong.
  useEffect(() => {
    if (terbuka === null || bagian !== "susunan") return;
    if (document.getElementById(`baris-${terbuka}`)) return;
    const timer = window.setTimeout(() => setTerbuka(null), 0);
    return () => window.clearTimeout(timer);
  });
  // Fokus drill-in: membuka atau menutup bagian melepas tombol yang sedang
  // difokus dari DOM, jadi fokus jatuh ke body (QA #358 M1). Bila itu terjadi,
  // fokus pindah ke judul bagian yang dibuka, atau kembali ke tombol barisnya
  // saat kembali ke daftar. Fokus yang sudah dipindah ke tempat lain (mis.
  // field yang galat) dibiarkan.
  const terbukaSebelumnya = useRef<string | null>(null);
  useEffect(() => {
    const sebelumnya = terbukaSebelumnya.current;
    terbukaSebelumnya.current = terbuka;
    if (sebelumnya === terbuka) return;
    const aktif = document.activeElement;
    if (aktif && aktif !== document.body) return;
    const sasaran = terbuka !== null
      ? document.querySelector<HTMLElement>(`#baris-${CSS.escape(terbuka)} h2`)
      : sebelumnya !== null
        ? document.querySelector<HTMLElement>(`#baris-${CSS.escape(sebelumnya)} button[aria-expanded]`)
        : null;
    sasaran?.focus({ preventScroll: true });
  }, [terbuka]);
  // Lipatan "Judul bagian" yang terbuka (satu bagian), awalnya tertutup.
  const [judulTerbuka, setJudulTerbuka] = useState<LandingHeadedSection | null>(null);
  // Bagian yang disorot di pratinjau; `n` naik di setiap klik supaya klik ulang
  // pada baris yang sama tetap menggulir pratinjau ke sana.
  const [sorot, setSorot] = useState<{ id: string; n: number; diam?: boolean } | null>(null);
  // Halaman tata letak Forum yang sedang dipratinjau (Beranda, Program, Info).
  const [halamanPratinjau, setHalamanPratinjau] = useState<LandingForumPage>("beranda");
  // null = belum diketahui (gagal dimuat); lencana hanya muncul bila pasti kosong.
  /**
   * Isi rundown untuk lencana Susunan acara: "ada" bila paling tidak satu
   * sesi berjudul tampil di halaman acara, "belum-terbit" bila ada sesi tetapi
   * belum satu pun diterbitkan (bagian dan barisnya), "kosong" bila tidak ada
   * sesi sama sekali. null selama belum diketahui.
   */
  const [isiRundown, setIsiRundown] = useState<"ada" | "belum-terbit" | "kosong" | null>(null);
  const rundownKosong = isiRundown === null ? null : isiRundown !== "ada";
  const lencanaRundown = isiRundown === "belum-terbit" ? "Not published yet" : "No agenda items yet";
  // Teks English baris Rundown. Disimpan ke tabel rundown, bukan landing_config,
  // jadi keadaan tersimpannya dicatat terpisah.
  // null: rundown gagal dimuat, beda dengan rundown tanpa sesi.
  const [rundownEn, setRundownEn] = useState<BarisRundownEn[] | null>([]);
  const [rundownEnTersimpan, setRundownEnTersimpan] = useState<BarisRundownEn[]>([]);
  // Baris rundown sesi pembicara. null = belum ada atau gagal dimuat.
  const [barisSesi, setBarisSesi] = useState<BarisSesi[] | null>(null);
  /** Rundown gagal dimuat saat editor dibuka: terjemahan rundown menunggu muat ulang yang berhasil. */
  const rundownTertunda = useRef(false);
  const terkini = useRef<{ facts: Facts | null; landing: EventLandingConfig; formInherit: boolean; formSeed: string; tersimpan: string | null }>({
    facts: null, landing: {}, formInherit: true, formSeed: DEFAULT_REGISTRATION_SEED, tersimpan: null,
  });
  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  // Add block below: blok baru disisipkan sesudah baris ini (indeks di `sections`). Kosong = di akhir isi.
  const [sisipSesudah, setSisipSesudah] = useState<{ indeks: number; judul: string } | null>(null);
  // Baris tersembunyi tetap di tempatnya; penyaring ini hanya menyembunyikannya dari daftar.
  const [tampilTersembunyi, setTampilTersembunyi] = useState(true);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<{ ids: string[]; judul: string } | null>(null);
  const [urungan, setUrungan] = useState<Urungan | null>(null);
  const akun = useAdminPage()?.username ?? null;
  const kunciPanel = akun ? `${KUNCI_PANEL}:${akun}` : null;
  // Mode bahasa Susunan halaman: ID menyunting halaman, EN hanya teks English-nya.
  // Disimpan per akun seperti lebar panel: penerjemah yang memuat ulang halaman
  // kembali ke mode EN, bukan ke ID lalu mencari pilihannya lagi.
  const kunciBahasa = akun ? `${KUNCI_BAHASA}:${akun}` : null;
  const bahasaTersimpan = useSyncExternalStore(
    langgananLokal,
    () => (kunciBahasa ? bacaLokal<"id" | "en">(kunciBahasa, "id") : "id"),
    () => "id" as const,
  );
  const [bahasaSesi, setBahasaSesi] = useState<"id" | "en" | null>(null);
  const bahasa: "id" | "en" = (bahasaSesi ?? bahasaTersimpan) === "en" ? "en" : "id";
  const setBahasa = useCallback((pilihan: "id" | "en") => {
    setBahasaSesi(pilihan);
    if (kunciBahasa) tulisLokal(kunciBahasa, pilihan);
  }, [kunciBahasa]);
  const lebarTersimpan = useSyncExternalStore(
    langgananLokal,
    () => (kunciPanel ? bacaLokal(kunciPanel, PANEL_BAWAAN) : PANEL_BAWAAN),
    () => PANEL_BAWAAN,
  );
  // Selama diseret lebarnya hidup di state; baru ditulis ke penyimpanan saat dilepas.
  const [lebarSeret, setLebarSeret] = useState<number | null>(null);
  const lebarPanel = jepitPanel(lebarSeret ?? lebarTersimpan);
  const [seret, setSeret] = useState<number | null>(null);
  const [sasaran, setSasaran] = useState<number | null>(null);
  // Dinaikkan setiap kali penyimpanan BERHASIL. Pratinjau memuat halaman publik
  // yang sungguhan, jadi ia hanya boleh disegarkan ketika ada yang benar-benar
  // berubah di sana. Menyegarkannya di setiap ketikan berarti memuat ulang satu
  // halaman penuh berkali-kali per detik.
  const [previewKey, setPreviewKey] = useState(0);
  // Potret terakhir rundown admin, `landing_config.member`, dan
  // `landing_config.speakers` (halaman Speakers); null = belum ada.
  const jejakLuar = useRef<{ rundown: string | null; member: string | null; speakers: string | null }>({ rundown: null, member: null, speakers: null });
  // Warna formulir disimpan di kolom lain (`registration_form_config.theme`),
  // jadi ia punya keadaan sendiri di layar ini alih-alih ikut `landing`.
  const [formInherit, setFormInherit] = useState(true);
  const [formSeed, setFormSeed] = useState(DEFAULT_REGISTRATION_SEED);
  // Preset yang sedang dipratinjau di tab Theme. Hanya pratinjau yang memakainya;
  // `landing` (dan status Saved) baru berubah saat Apply.
  const [pratinjauPreset, setPratinjauPreset] = useState<string | null>(null);
  // Potret keadaan terakhir yang tersimpan, untuk memberi tahu bahwa pratinjau
  // belum memuat perubahan yang sedang diketik.
  const [tersimpan, setTersimpan] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/events"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setError("Couldn't load the event."); return; }
    const body = await response.json().catch(() => null);
    // /api/events mengembalikan daftar; slug dari URL yang menentukan mana.
    const slug = window.location.pathname.match(/^\/e\/([^/]+)/)?.[1];
    const list = (body?.events ?? []) as (Facts & {
      landing_config?: EventLandingConfig;
      registration_form_config?: RegistrationFormConfig;
    })[];
    const found = slug ? list.find((item) => item.slug === slug) : list[0];
    // /api/events hanya memuat acara yang boleh dibuka akun ini, jadi "tidak ada
    // di daftar" bisa berarti acaranya tidak ada ATAU aksesnya belum diberikan.
    if (!found) { setError("This event isn't in the list of events you can open. Ask a super admin for access."); return; }
    const nextLanding = found.landing_config ?? {};
    // `inherit` yang belum pernah disimpan berarti konfigurasi dibuat sebelum
    // saklar ini ada. Acara yang sudah punya warna formulir sendiri dianggap
    // memang memilihnya: ia tidak boleh berganti warna karena sebuah pembaruan.
    const formTheme = found.registration_form_config?.theme;
    const nextInherit = formTheme?.inherit ?? !formTheme?.seed;
    const nextSeed = formTheme?.seed ?? found.landing_config?.theme?.seed ?? DEFAULT_REGISTRATION_SEED;
    setFacts(found);
    setLanding(nextLanding);
    setFormInherit(nextInherit);
    setFormSeed(nextSeed);
    setTersimpan(JSON.stringify({ facts: found, landing: nextLanding, formInherit: nextInherit, formSeed: nextSeed }));
    setError("");
    jejakLuar.current = { rundown: null, member: JSON.stringify(nextLanding.member ?? null), speakers: JSON.stringify(nextLanding.speakers ?? null) };
    // Baris yang sama dengan yang dibaca halaman acara (loadAgendaPreview):
    // baris berjudul yang bagian dan barisnya diterbitkan, urut bagian lalu
    // urutan baris.
    const admin = await fetch(eventApiPath("/api/admin/rundown/sections"), { cache: "no-store" }).catch(() => null);
    const isiAdmin = admin?.ok ? await admin.json().catch(() => null) : null;
    if (isiAdmin) {
      setIsiRundown(statusRundown(isiAdmin));
      jejakLuar.current.rundown = JSON.stringify(isiAdmin);
    } else {
      // Tanpa data admin, rundown publik hanya bisa bilang ada atau tidak.
      const rundown = await fetch(eventApiPath("/api/rundown"), { cache: "no-store" }).catch(() => null);
      const publik = rundown?.ok ? await rundown.json().catch(() => null) : null;
      setIsiRundown(publik ? (publik.published ? "ada" : "kosong") : null);
    }
    if (!isiAdmin) {
      setRundownEn(null);
      setRundownEnTersimpan([]);
      setBarisSesi(null);
      rundownTertunda.current = true;
    } else {
      const baris = barisRundownEnDariAdmin(isiAdmin);
      setRundownEn(baris);
      setRundownEnTersimpan(baris);
      setBarisSesi(barisSesiDariAdmin(isiAdmin));
    }
  }, []);

  const segarkanPratinjau = useCallback(async (rundown: string) => {
    const response = await fetch(eventApiPath("/api/events"), { cache: "no-store" }).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) : null;
    const slug = window.location.pathname.match(/^\/e\/([^/]+)/)?.[1];
    const found = ((body?.events ?? []) as { slug: string; landing_config?: EventLandingConfig }[]).find((item) => item.slug === slug);
    const jejak = jejakLuar.current;
    const memberBaru = found ? JSON.stringify(found.landing_config?.member ?? null) : jejak.member;
    const speakersBaru = found ? JSON.stringify(found.landing_config?.speakers ?? null) : jejak.speakers;
    const berganti =
      (jejak.rundown !== null && jejak.rundown !== rundown) ||
      (jejak.member !== null && jejak.member !== memberBaru) ||
      (jejak.speakers !== null && jejak.speakers !== speakersBaru);
    jejakLuar.current = { rundown, member: memberBaru, speakers: speakersBaru };
    // Disimpan di /admin/area-peserta dan /admin/speakers, bukan dari editor ini
    // (Save memakai salinan server), jadi ikut dicatat tersimpan: bukan suntingan.
    const luar: Partial<EventLandingConfig> = {};
    if (found && memberBaru !== jejak.member) luar.member = found.landing_config?.member;
    if (found && speakersBaru !== jejak.speakers) luar.speakers = found.landing_config?.speakers;
    if (Object.keys(luar).length) {
      setLanding((prev) => ({ ...prev, ...luar }));
      const kini = terkini.current;
      if (kini.tersimpan) {
        const lama = JSON.parse(kini.tersimpan) as { landing: EventLandingConfig };
        lama.landing = { ...lama.landing, ...luar };
        setTersimpan(JSON.stringify(lama));
      }
    }
    if (berganti) setPreviewKey((k) => k + 1);
  }, []);
  // Baris sesi dimuat ulang saat tab ini kembali difokus: "Atur rundown" membuka
  // Rundown di tab baru, dan baris yang baru ditambahkan harus bisa dipilih.
  const muatBarisSesi = useCallback(async () => {
    const admin = await fetch(eventApiPath("/api/admin/rundown/sections"), { cache: "no-store" }).catch(() => null);
    const isiAdmin = admin?.ok ? await admin.json().catch(() => null) : null;
    // Gagal memuat ulang tidak menghapus daftar yang sudah ada.
    if (!isiAdmin) return;
    const sesi = barisSesiDariAdmin(isiAdmin);
    setBarisSesi(sesi);
    // Kotak bertitik di pratinjau (PR D) menunjuk Agenda dan Participant area di
    // tab baru. Saat kembali, status rundown dan setelan area peserta dibaca
    // ulang, dan pratinjau dimuat ulang bila salah satunya berubah.
    setIsiRundown(statusRundown(isiAdmin));
    await segarkanPratinjau(JSON.stringify(isiAdmin));
    // Rundown gagal dimuat saat editor dibuka: terjemahannya dimuat sekarang, sekali.
    if (!rundownTertunda.current) return;
    rundownTertunda.current = false;
    // Hanya di sini, sekali: muat ulang karena fokus jendela tidak boleh
    // menimpa terjemahan rundown yang sedang disunting.
    const en = barisRundownEnDariAdmin(isiAdmin);
    setRundownEn(en);
    setRundownEnTersimpan(en);
    setIsiRundown(statusRundown(isiAdmin));
  }, [segarkanPratinjau]);
  useEffect(() => {
    // Fokus bisa datang beruntun (pindah jendela bolak-balik): ditunggu sebentar,
    // dan hanya satu muat ulang berjalan; fokus selama itu memicu satu putaran
    // lagi sesudahnya, jadi jawaban lama tidak menimpa yang baru (QA #116 L2).
    let timer: number | undefined;
    let jalan = false;
    let lagi = false;
    let lepas = false;
    const muat = async () => {
      if (jalan) { lagi = true; return; }
      jalan = true;
      try {
        do { lagi = false; await muatBarisSesi(); } while (lagi && !lepas);
      } finally {
        jalan = false;
      }
    };
    const onFocus = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void muat(), 300);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      lepas = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [muatBarisSesi]);

  // Isi dari server dimuat sekali per kunjungan. Efek bisa dijalankan ulang tanpa
  // halaman dipasang ulang (mis. bagian editor yang ditangguhkan Suspense lalu
  // tampil lagi); muat ulang di saat itu menimpa suntingan yang belum disimpan.
  const sudahDimuat = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (sudahDimuat.current) return;
      sudahDimuat.current = true;
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // `?blok=<id>`: tautan Edit dari Participant area > Participant home membuka
  // blok itu di Susunan halaman, sekali, setelah isinya dimuat.
  const blokDariTautan = useRef(false);
  useEffect(() => {
    if (blokDariTautan.current || !facts) return;
    blokDariTautan.current = true;
    const id = new URLSearchParams(window.location.search).get("blok");
    if (!id || !(landing.blocks ?? []).some((block) => block.id === id)) return;
    const timer = window.setTimeout(() => {
      setBagian("susunan");
      setTerbuka(id);
      setSorot((current) => ({ id, n: (current?.n ?? 0) + 1 }));
      gulirKeBaris(id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [facts, landing.blocks]);

  // Gaya gathering: Portal peserta ikut di susunan sebagai baris yang bisa
  // digeser (lihat susunanDenganPortal); gaya lain tidak punya portal.
  const sections: LandingSectionEntry[] = susunanHalaman(landing);
  const cuplikan = facts ? JSON.stringify({ facts, landing, formInherit, formSeed }) : null;
  // Nilai terbaru untuk muatBarisSesi, yang juga dipanggil dari pendengar fokus jendela.
  useEffect(() => {
    terkini.current = { facts, landing, formInherit, formSeed, tersimpan };
  });
  // Dibandingkan setelah trim: spasi saja tidak dihitung perubahan, sama dengan yang dikirim.
  const rundownBerubah = (rundownEn ?? []).filter(
    (baris, index) => baris.title_en.trim() !== (rundownEnTersimpan[index]?.title_en ?? "").trim() || baris.subtitle_en.trim() !== (rundownEnTersimpan[index]?.subtitle_en ?? "").trim(),
  );
  const berubah = tersimpan !== null && (cuplikan !== tersimpan || rundownBerubah.length > 0);
  const ubahRundown = (id: number, patch: Partial<Pick<BarisRundownEn, "title_en" | "subtitle_en">>) =>
    setRundownEn((current) => current && current.map((baris) => (baris.id === id ? { ...baris, ...patch } : baris)));
  // Draf untuk pratinjau langsung. Dibuat ulang hanya saat isinya berubah,
  // supaya pratinjau tidak dirender ulang di setiap render CMS.
  // Pratinjau preset hanya berlaku selama tab Theme terbuka: pindah tab berarti
  // pratinjau besar kembali menunjukkan isi CMS yang sebenarnya.
  const presetDilihat = bagian === "tema" ? LANDING_THEME_PRESETS.find((preset) => preset.key === pratinjauPreset) ?? null : null;
  const drafPratinjau = useMemo(
    () => (cuplikan && facts ? isiKirim(facts, presetDilihat ? pakaiPreset(presetDilihat, landing) : landing) : null),
    [cuplikan, presetDilihat], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Bilah pratinjau muncul di atas bidang gulir panel dan mendorong isinya
  // turun setinggi bilah. Di desktop bidang gulir itu sendiri yang digeser
  // sebesar selisihnya, supaya kartu yang baru diketuk tetap di tempatnya.
  const bilahPratinjau = useRef<HTMLDivElement>(null);
  // Posisi gulir terakhir dicatat dari event scroll: saat bilah hilang, browser
  // sudah menjepit scrollTop ke batas yang baru sebelum efek ini berjalan.
  const tinggiBilah = useRef(0);
  const gulirTerakhir = useRef(0);
  const bagianTerakhir = useRef(bagian);
  useLayoutEffect(() => {
    const tinggi = bilahPratinjau.current?.offsetHeight ?? 0;
    const selisih = tinggi - tinggiBilah.current;
    tinggiBilah.current = tinggi;
    // Bidang gulir dibuat ulang per tab (key) dan mulai dari 0. Bilah yang sudah
    // ada saat kembali ke Theme hanya dicatat sebagai titik awal, bukan digeser.
    if (bagianTerakhir.current !== bagian) {
      bagianTerakhir.current = bagian;
      gulirTerakhir.current = 0;
      return;
    }
    const gulir = document.querySelector<HTMLElement>("#isi-setelan > .overflow-y-auto");
    if (!selisih || !gulir || gulir.scrollHeight <= gulir.clientHeight) return;
    gulir.scrollTop = gulirTerakhir.current + selisih;
    gulirTerakhir.current = gulir.scrollTop;
  }, [presetDilihat, bagian]);
  function terapkanPratinjau() {
    if (presetDilihat) setLanding(pakaiPreset(presetDilihat, landing));
    setPratinjauPreset(null);
  }

  // Pilihan ID | EN yang diklik di pratinjau memindah mode editor.
  // Baris yang terbuka tetap terbuka di mode lain; daftarnya dirender ulang,
  // jadi panel digulir kembali ke baris itu.
  const pilihBahasa = useCallback((pilihan: "id" | "en") => {
    setBagian("susunan");
    setBahasa(pilihan);
    if (terbuka) gulirKeBaris(terbuka);
  }, [terbuka, setBahasa]);

  function patchFacts(patch: Partial<Facts>) {
    setFacts((current) => (current ? { ...current, ...patch } : current));
  }

  // ---- Ekspor/Impor isi ----------------------------------------------------------
  // Ekspor mengambil isi yang sedang tampil di layar (termasuk yang belum
  // disimpan). Impor hanya mengisi layar: tidak ada yang berubah di halaman
  // publik sampai admin menekan Simpan, jadi isi lama masih bisa dikembalikan
  // dengan memuat ulang halaman.
  const pilihBerkas = useRef<HTMLInputElement>(null);
  const kartuTentangRef = useRef<HTMLDivElement>(null);

  function ekspor() {
    if (!facts) return;
    const berkas: BerkasIsi = {
      format: BERKAS_FORMAT,
      version: 1,
      facts: Object.fromEntries(KOLOM_FAKTA.map((kolom) => [kolom, facts[kolom]])),
      landing: { ...landing, sections },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(berkas, null, 2)], { type: "application/json" }));
    const tautan = document.createElement("a");
    tautan.href = url;
    tautan.download = `event-page-${facts.slug}-${new Date().toISOString().slice(0, 10)}.json`;
    tautan.click();
    URL.revokeObjectURL(url);
  }

  async function impor(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const isi = await file.text().then((teks) => JSON.parse(teks) as Partial<BerkasIsi>).catch(() => null);
    if (!isi || isi.format !== BERKAS_FORMAT || typeof isi.landing !== "object" || isi.landing === null) {
      toast.error("File not recognised", "Choose a .json file exported from this page.");
      return;
    }
    const fakta = Object.fromEntries(
      KOLOM_FAKTA.filter((kolom) => isi.facts && kolom in isi.facts).map((kolom) => [kolom, isi.facts?.[kolom] ?? null]),
    ) as Partial<Facts>;
    patchFacts(fakta);
    // Kunci yang tidak ada di berkas (gambar sampul, warna, dsb.) tetap memakai
    // isi yang sekarang, jadi berkas tanpa gambar tidak menghapus gambar yang ada.
    // Pembicara tidak ikut: disimpan di halaman Speakers, bukan dengan Simpan di sini.
    const { speakers: _pembicara, ...isiLanding } = isi.landing ?? {};
    void _pembicara;
    setLanding((current) => ({ ...current, ...isiLanding }));
    setBagian("susunan");
    const adaPembicara = Array.isArray(_pembicara) && _pembicara.length > 0;
    toast.success(
      "Content imported",
      `Check the content, then select Save. Reload the page to discard it.${adaPembicara ? " Speakers in the file were not imported: they are edited on the Speakers page." : ""}`,
    );
  }

  /**
   * Apakah bagian ini punya isi.
   *
   * Aturannya HARUS sama dengan yang dipakai halaman publik: di sana bagian
   * tanpa isi tidak dirender sama sekali. Tanpa penanda ini, saklar menjadi
   * tombol yang berbohong: admin menyalakannya, halaman publik tidak berubah,
   * dan tidak ada apa pun yang menjelaskan kenapa.
   *
   * `agenda` tidak bisa dijawab dari sini: isinya ada di tabel rundown, dan
   * memuatnya hanya untuk lencana berarti satu kueri tambahan setiap kali
   * halaman ini dibuka. Ia dibiarkan `null`: "tidak diketahui", bukan "kosong".
   */
  function sectionHasContent(id: LandingSectionId): boolean | null {
    switch (id) {
      case "about": return Boolean(facts?.description?.trim()) || Boolean(landing.gathering === true && (landing.about_cards ?? []).some((kartu) => kartu.title.trim()));
      case "highlights": return (landing.highlights ?? []).length > 0;
      case "speakers": return (landing.speakers ?? []).some((speaker) => speaker.name.trim());
      case "venue": return Boolean(facts?.venue_name?.trim() || facts?.venue_address?.trim());
      case "faq": return (landing.faq ?? []).length > 0;
      case "sponsors": return (landing.sponsors ?? []).length > 0;
      case "contact": return kontakPanitiaAdmin.length > 0;
      default: return null;
    }
  }

  /** Indeks baris tujuan Naik/Turun: baris bertempat tetap (tempatTetap) dilompati,
   *  supaya satu klik selalu terlihat memindahkan baris (QA #362 M1). -1 = tidak ada. */
  function tujuanGeser(index: number, delta: number) {
    for (let target = index + delta; target >= 0 && target < sections.length; target += delta) {
      if (!tempatTetap(sections[target].id as LandingSectionId)) return target;
    }
    return -1;
  }

  function moveSection(index: number, delta: number) {
    const target = tujuanGeser(index, delta);
    if (target < 0) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setLanding({ ...landing, sections: next });
  }

  /** Isi yang dikirim saat Simpan, dan yang dirender pratinjau langsung. */
  function isiKirim(facts: Facts, isi: EventLandingConfig = landing) {
    // `isi` = landing, kecuali pratinjau preset (yang belum diterapkan).
    const susunan = simpanSusunan(isi === landing ? sections : susunanHalaman(isi));
    return {
      description: facts.description?.trim() || null,
      tagline: facts.tagline?.trim() || null,
      start_time: facts.start_time || null,
      end_time: facts.end_time || null,
      end_date: facts.end_date || null,
      venue_name: facts.venue_name?.trim() || null,
      venue_address: facts.venue_address?.trim() || null,
      venue_map_url: facts.venue_map_url?.trim() || null,
      landing: {
        ...tanpaEnYatim(isi),
        blocks: tanpaTersembunyiKepanjangan(isi.blocks),
        sections: susunan,
        // Warna merek yang berlaku, satu sumber dengan pemilih warna dan
        // pratinjau: Forum tanpa seed tersimpan sebagai navy, bukan biru formulir.
        theme: { seed: landingTokens(isi).brand },
        // Hanya untuk pratinjau (tombol Masuk). Server mengabaikannya: area
        // peserta disimpan di /admin/area-peserta.
        member: isi.member,
      },
      form_theme: { inherit: formInherit, seed: formSeed },
    };
  }

  async function save() {
    if (!facts) return;
    // Diperiksa di sini, bukan diserahkan ke server: server menolak baris kosong
    // (min 1) tetapi galatnya hanya menyebut "landing", tanpa bagian dan baris mana.
    const angkaKosong = (landing.highlights ?? []).findIndex((item) => !item.label.trim() || !item.value.trim());
    if (angkaKosong >= 0) {
      toast.error("Key figures incomplete", `Row ${angkaKosong + 1}: fill in the label and the figure, or delete the row.`);
      return;
    }
    const tanyaKosong = (landing.faq ?? []).findIndex((item) => !item.q.trim() || !item.a.trim());
    if (tanyaKosong >= 0) {
      toast.error("FAQ incomplete", `Question ${tanyaKosong + 1}: fill in the question and the answer, or delete the question.`);
      return;
    }
    // Toast menyebut nama blok, bukan nomor: daftar tidak lagi bernomor (QA #358 L1).
    const namaBlokDi = (index: number) => {
      const blok = (landing.blocks ?? []).find((item) => item.id === sections[index]?.id);
      return blok ? `“${blok.heading?.trim() || blok.name?.trim() || LANDING_BLOCK_LABELS[blok.type]}”` : `Section ${index + 1}`;
    };
    const blokSalah = sections.findIndex((section) => {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      return blok ? tautanBlokSalah(blok) : false;
    });
    if (blokSalah >= 0) {
      toast.error("Invalid link in a block", `${namaBlokDi(blokSalah)}: enter a full address starting with https://, # for a section on this page, or leave it empty.`);
      return;
    }
    const blokPenuh = sections.findIndex((section) => {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      return blok ? butirBerlebih(blok) > 0 : false;
    });
    if (blokPenuh >= 0) {
      toast.error("Too many items in a block", `${namaBlokDi(blokPenuh)}: the chosen layout holds fewer items. Delete the extra items or choose another layout.`);
      return;
    }
    // Batas karakter juga diperiksa server, tetapi galatnya hanya "Maximum 24
    // characters" tanpa menyebut blok mana. Di sini blok itu dibuka dan disebut.
    for (const [index, section] of sections.entries()) {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      const lewat = blok ? kolomKepanjangan(blok) : null;
      if (blok && lewat) {
        setBagian("susunan");
        setBahasa(lewat.bahasa);
        setTerbuka(blok.id);
        setSorot((current) => ({ id: blok.id, n: (current?.n ?? 0) + 1 }));
        gulirKeBaris(blok.id);
        // Toast langsung; fokus menyusul setelah baris terbuka. Bila kolomnya
        // ternyata tidak ada, toast kedua menyusul (toast tidak bisa diganti).
        const pesan = (akhir: string) => `${namaBlokDi(index)}, ${lewat.kolom}${lewat.bahasa === "en" ? " (English)" : ""}: up to ${plural(lewat.max, "character")}. ${akhir}`;
        toast.error("Text too long", pesan("The field is now shown."));
        fokusKolomLewat(blok.id, undefined, (ketemu) => {
          if (!ketemu) toast.error("Text too long", pesan("The section is now open."));
        });
        return;
      }
    }
    const judulLewat = modern ? judulBagianKepanjangan(landing) : null;
    if (judulLewat) {
      setBagian("susunan");
      setBahasa(judulLewat.bahasa);
      setTerbuka(judulLewat.id);
      if (judulLewat.bahasa === "id") setJudulTerbuka(judulLewat.id);
      gulirKeBaris(judulLewat.id);
      // Kolomnya bisa jauh di bawah baris (mis. judul FAQ di bawah semua pertanyaan).
      const pesan = (akhir: string) =>
        `${LANDING_SECTION_ADMIN_LABELS[judulLewat.id]}, ${judulLewat.kolom}${judulLewat.bahasa === "en" ? " (English)" : ""}: up to ${plural(judulLewat.max, "character")}. ${akhir}`;
      toast.error("Text too long", pesan("The field is now shown."));
      fokusKolomLewat(judulLewat.id, judulLewat.kunci, (ketemu) => {
        if (!ketemu) toast.error("Text too long", pesan("The section is now open."));
      });
      return;
    }
    const forumSalah = landing.layout === "forum" ? forumTautanSalah(landing.forum) : null;
    if (forumSalah) {
      setBagian("susunan");
      setTerbuka(forumSalah.baris);
      gulirKeBaris(forumSalah.baris);
      toast.error("Invalid link", `${forumSalah.pesan} The section is now open.`);
      return;
    }
    const tinggiBilah = landing.nav?.height;
    if (tinggiBilah != null && (tinggiBilah < LANDING_NAV_HEIGHT_MIN || tinggiBilah > LANDING_NAV_HEIGHT_MAX)) {
      setBagian("susunan");
      setBahasa("id");
      setTerbuka("pembuka");
      gulirKeBaris("pembuka");
      toast.error("Top bar height out of range", `Hero, Top bar: enter ${LANDING_NAV_HEIGHT_MIN} to ${LANDING_NAV_HEIGHT_MAX} px. The section is now open.`);
      return;
    }
    const kirim = cuplikan;
    setBusy(true);
    // Teks English Rundown lebih dulu: bila gagal, isi halaman belum disimpan dan
    // admin bisa mencoba lagi dengan satu tombol yang sama.
    let rundownTerkirim = 0;
    for (const baris of rundownBerubah) {
      const hasil = await fetch(eventApiPath("/api/admin/rundown/items"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: baris.id, title_en: baris.title_en.trim() || null, subtitle_en: baris.subtitle_en.trim() || null }),
      }).catch(() => null);
      if (!hasil?.ok) {
        setBusy(false);
        if (rundownTerkirim > 0) setPreviewKey((current) => current + 1);
        // Buka dan tunjukkan kartunya, sama dengan galat Simpan lainnya.
        setBagian("susunan");
        setBahasa("en");
        setTerbuka("agenda");
        gulirKeBaris("agenda");
        window.setTimeout(() => {
          const kartu = document.getElementById(kartuRundownId(baris.id));
          const wadah = kartu?.closest<HTMLElement>(".overflow-y-auto");
          if (kartu && wadah) {
            const atas = kartu.getBoundingClientRect().top - wadah.getBoundingClientRect().top + wadah.scrollTop;
            wadah.scrollTo({ top: Math.max(0, atas - 96), behavior: "smooth" });
          }
          kartu?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
        }, 300);
        const sudah = rundownTerkirim > 0 ? ` ${plural(rundownTerkirim, "earlier session")} already live.` : "";
        toast.error("Couldn't save", `Agenda, session ${baris.jam} (English): ${(hasil && pesanGalatApi(await hasil.json().catch(() => ({})))) ?? "try again."}${sudah} The card is now open.`);
        return;
      }
      rundownTerkirim += 1;
      setRundownEnTersimpan((current) => current.map((lama) => (lama.id === baris.id ? baris : lama)));
    }
    // Pratinjau membaca rundown dari database: muat ulang begitu teks English
    // sesi tersimpan, juga bila isi halaman di bawah ini gagal disimpan.
    if (rundownTerkirim > 0) setPreviewKey((current) => current + 1);
    const response = await fetch(eventApiPath("/api/admin/landing"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // `member` hanya untuk pratinjau; area peserta disimpan di halamannya sendiri.
      body: JSON.stringify(isiKirim(facts), (kunci, nilai) => (kunci === "member" ? undefined : nilai)),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Connection failed", "Reload to see what was saved."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Couldn't save", pesanGalatApi(body) ?? "Try again.");
      return;
    }
    setTersimpan(kirim);
    setPreviewKey((current) => current + 1);
    toast.success("Saved", "The public event page now shows the new content.");
  }

  // ---- Isian per bagian ------------------------------------------------------------
  // Setiap bagian halaman punya isiannya sendiri, dibuka di bawah barisnya di
  // Susunan halaman. Kolom yang dulu tersebar di tab Isi dan Tampilan pindah ke
  // bagian tempat ia tampil, supaya admin mencari isian di tempat ia melihatnya.
  const gayaBanner = landing.banner_style ?? "theme";
  const tataLetak: LandingLayout = landing.layout ?? "editorial";
  const modern = tataLetak === "modern";
  const forum = tataLetak === "forum";
  // Gaya gathering (preset Gathering) hanya dibaca tata letak Modern.
  const gathering = modern && landing.gathering === true;
  // Gathering Horizon: susunan dan teksnya sendiri. Kolom yang tidak dibacanya
  // disembunyikan (isinya tetap tersimpan untuk Gathering biasa).
  const horizon = gathering && landing.gathering_variant === "horizon";
  // Ringkasan Kontak panitia (Event settings): satu baris per kontak yang terisi.
  const kontakPanitiaAdmin = [
    { name: landing.contact_name, role: landing.contact_role, email: landing.contact_email, phone: landing.contact_phone },
    ...(landing.contact_more ?? []),
  ]
    .map((item) => [item.name, item.role, item.phone, item.email].map((nilai) => nilai?.trim()).filter(Boolean).join(" · "))
    .filter(Boolean);
  // Teks yang tampil di halaman Indonesia tetapi belum punya versi English.
  const kurangEn = landingUntranslated({
    landing_config: { ...landing, sections },
    event_date: facts?.event_date,
    end_date: facts?.end_date,
    venue_name: facts?.venue_name,
    tagline: facts?.tagline,
    description: facts?.description,
    venue_address: facts?.venue_address,
  });
  // Baris Rundown dihitung hanya bila Susunan acara tampil, sama dengan teks lain.
  const agendaAktif = sections.some((section) => section.id === "agenda" && section.enabled);
  const rundownKurangEn = agendaAktif ? rundownBelumDiterjemahkan(rundownEn ?? []) : 0;
  // Judul rundown juga menjadi label tab sesi Pembicara. Tanpa Susunan acara,
  // baris yang dipegang pembicara tetap dihitung, supaya tab English tidak diam-diam
  // berbahasa Indonesia. Dengan Susunan acara, barisnya sudah terhitung di atas.
  const idSesiDipakai = new Set((landing.speakers ?? []).flatMap((speaker) => (speaker.name?.trim() ? speaker.session_refs ?? [] : []).map((item) => item.id)));
  const sesiKurangEn = !agendaAktif && sections.some((section) => section.id === "speakers" && section.enabled)
    ? (rundownEn ?? []).filter((baris) => idSesiDipakai.has(baris.id) && baris.title.trim() && !baris.title_en.trim()).length
    : 0;
  const belumDiterjemahkan = kurangEn.length + rundownKurangEn + sesiKurangEn;
  const barisKurangEn = new Set(kurangEn.map((teks) => teks.section));
  // Rundown gagal dimuat: jumlahnya tidak diketahui, jadi barisnya tetap ditandai.
  if (rundownKurangEn > 0 || (agendaAktif && rundownEn === null)) barisKurangEn.add("agenda");
  if (sesiKurangEn > 0) barisKurangEn.add("speakers");
  const modeEn = modern && bahasa === "en";
  // Pembicara yang sesinya hilang dari rundown atau masih teks lama yang belum
  // terhubung: ditandai titik di baris Pembicara. Selama rundown belum dimuat
  // (atau gagal) teks lama tidak dihitung: cocok tidaknya belum diketahui.
  const sesiLamaBelumTerhubung =
    barisSesi === null
      ? 0
      // Teks lama yang cocok dengan tepat satu baris sudah tampil dengan foto dan jamnya.
      : (landing.speakers ?? []).filter((speaker) => {
          const label = speaker.name?.trim() && !sesiDariRundown(speaker) ? speaker.session?.trim() : undefined;
          return !!label && barisSesi.filter((item) => cocokSesi(label, item.title)).length !== 1;
        }).length;
  const sesiPerluDipilih =
    (landing.speakers ?? []).filter((speaker) => speaker.name?.trim() && sesiHilang(speaker, barisSesi).length > 0).length + sesiLamaBelumTerhubung;
  const catatanProgram = landing.program_notes ?? [];
  const setCatatanProgram = (next: string[]) => setLanding({ ...landing, program_notes: next });
  // Terjemahannya ikut terhapus, supaya terjemahan keterangan berikutnya tidak
  // bergeser ke kartu yang salah (en.program_notes diurutkan sama).
  const hapusCatatanProgram = (index: number) => {
    const buang = (daftar: string[]) => daftar.filter((_, position) => position !== index);
    setLanding({
      ...landing,
      program_notes: buang(catatanProgram),
      en: landing.en?.program_notes ? { ...landing.en, program_notes: buang(landing.en.program_notes) } : landing.en,
    });
  };

  const tokensHero = landingTokens(landing);
  // Saran Background › Custom: warna acara ini sendiri, lalu latar sendiri yang sudah dipakai.
  const warnaHalaman = [
    tokensHero.brand,
    tokensHero.accent,
    ...Object.values(landing.section_bg_color ?? {}),
    ...(landing.blocks ?? []).map((blok) => blok.bg_color),
  ].filter((warna): warna is string => Boolean(warna));
  // Kotak HP di kanan hero gathering. Isinya otomatis dari layar lain, jadi
  // panel ini menyebut sumber tiap bagiannya dan memberi jalan ke sana (CMS
  // mudah, butir 1): sebelumnya kotak ini tidak punya baris di editor sama sekali.
  const portalAktif = landing.member?.enabled === true;
  const sesiPertama = barisSesi?.[0] ?? null;
  const tautanSumberPortal = (href: string, label: string) =>
    facts ? (
      // Tab baru, sesuai ikonnya: editor ini tidak menahan perubahan yang belum disimpan (QA #109 M6).
      <Link href={`/e/${facts.slug}${href}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-sm text-body-medium font-medium text-primary hover:underline">
        {label}
        <ArrowSquareOut size={14} aria-hidden />
      </Link>
    ) : null;
  const panelPratinjauPortal = (
    <Kelompok
      title={
        <>
          Portal preview
          <StatusChip tone="neutral">Automatic</StatusChip>
        </>
      }
      note="The phone on the right of the hero. It shows while the Participant area is open, and fills itself from the Agenda and the Participant area. Hidden on phones."
    >
      <Switch
        checked={landing.portal_preview !== false}
        onChange={(value) => setLanding({ ...landing, portal_preview: value })}
        label="Show the portal preview"
        disabled={busy || !portalAktif}
        description={portalAktif ? undefined : "The Participant area is closed, so the preview is not shown."}
      />
      {portalAktif ? (
        <dl className="flex flex-col divide-y divide-outline-variant rounded-md border border-outline-variant">
          <div className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <dt className="text-body-medium font-semibold text-on-surface">First up</dt>
              <dd className="mt-0.5 text-body-medium text-on-surface-variant">
                {sesiPertama ? `The next session from the Agenda. Before the event: ${sesiPertama.jam} ${sesiPertama.title}.` : "The next session from the Agenda. No published session yet, so this card is empty."}
              </dd>
            </div>
            {tautanSumberPortal("/admin/rundown", "Agenda")}
          </div>
          <div className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <dt className="text-body-medium font-semibold text-on-surface">Tiles</dt>
              <dd className="mt-0.5 text-body-medium text-on-surface-variant">
                {bagianTampil(landing.member, "rooms") && bagianTampil(landing.member, "vehicles") ? "Vehicle and Room, because both are shown under Logistics in the Participant area." : "Entry ticket and Announcements. Show Room and Vehicle under Logistics in the Participant area to show Vehicle and Room instead."}
              </dd>
            </div>
            {tautanSumberPortal("/admin/area-peserta", "Participant area")}
          </div>
          <div className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <dt className="text-body-medium font-semibold text-on-surface">Card title</dt>
              <dd className="mt-0.5 text-body-medium text-on-surface-variant">Fixed text: &ldquo;Info perjalanan&rdquo;, or &ldquo;Your trip&rdquo; on the English page.</dd>
            </div>
          </div>
        </dl>
      ) : (
        <div>{tautanSumberPortal("/admin/area-peserta", "Open Participant area")}</div>
      )}
    </Kelompok>
  );
  const isiPortal = (
    <>
      <p className="text-body-medium text-on-surface-variant">
        This section appears automatically while the Participant area is open. Drag its row to choose where it sits; by default it is just above the footer. {horizon ? "" : "Its text is fixed, "}
        {horizon
          ? "Its text can be changed below, and the journey pass card beside it uses the From and To fields, the event dates, and the hero image."
          : "and its tiles follow the Participant area: entry ticket, room and vehicle, and announcements."}{" "}
        The top bar gets a link to it, &ldquo;Perjalanan&rdquo; (&ldquo;Your trip&rdquo; in English).
      </p>
      {tautanSumberPortal("/admin/area-peserta", "Open Participant area")}
      {horizon ? (
        <Kelompok title="Section text" note="Leave a field empty to use the standard text, which also has an English version.">
          <TextField
            label="Small label"
            data-kolom="portal_eyebrow"
            optional
            placeholder={LANDING_UI.id.horizon.inviteEyebrow}
            hint="Above the heading, on wide screens. Empty shows a signed-in version to participants who are signed in."
            maxLength={HORIZON_TEXT_MAX.portal_eyebrow}
            value={landing.portal_eyebrow ?? ""}
            onChange={(event) => setLanding({ ...landing, portal_eyebrow: event.target.value })}
          />
          <TextArea
            label="Heading"
            data-kolom="portal_heading"
            optional
            rows={2}
            placeholder={LANDING_UI.id.horizon.inviteHeading}
            hint="Press Enter to start a new line."
            maxLength={HORIZON_TEXT_MAX.portal_heading}
            value={landing.portal_heading ?? ""}
            onChange={(event) => setLanding({ ...landing, portal_heading: event.target.value })}
          />
          <TextArea
            label="Text"
            data-kolom="portal_note"
            optional
            rows={3}
            placeholder={LANDING_UI.id.horizon.inviteNote(adaLogistikTampil(landing.member))}
            maxLength={HORIZON_TEXT_MAX.portal_note}
            counter
            value={landing.portal_note ?? ""}
            onChange={(event) => setLanding({ ...landing, portal_note: event.target.value })}
          />
          <TextField
            label="Sign-in button text"
            data-kolom="portal_button_label"
            optional
            placeholder={LANDING_UI.id.horizon.inviteCta}
            hint="For guests who are not signed in. Also used on the gold closing band while the page is invite only."
            maxLength={HORIZON_TEXT_MAX.portal_button_label}
            counter
            value={landing.portal_button_label ?? ""}
            onChange={(event) => setLanding({ ...landing, portal_button_label: event.target.value })}
          />
        </Kelompok>
      ) : null}
      {horizon ? (
        <Kelompok title="Journey pass" note="The card beside this section on wide screens.">
          <TextField
            label="From"
            data-kolom="pass_from"
            optional
            hint="Where the trip starts, for example a station or city. Leave empty to show only the destination."
            maxLength={40}
            value={landing.pass_from ?? ""}
            onChange={(event) => setLanding({ ...landing, pass_from: event.target.value })}
          />
          <TextField
            label="To"
            data-kolom="pass_to"
            optional
            hint="Leave empty to use the venue name."
            maxLength={40}
            value={landing.pass_to ?? ""}
            onChange={(event) => setLanding({ ...landing, pass_to: event.target.value })}
          />
        </Kelompok>
      ) : null}
    </>
  );
  // Warna sorotan judul sama dengan halaman (emas yang terbaca di atas navy hero).
  const emasHorizon = sorotHorizon(hitungEmasHorizon(landing.button_color, tokensHero.accent), tokensHero.accent, tokensHero.brand);

  /**
   * Bagian bawaan yang di Modern TIDAK mengikuti urutan halaman, jadi menyeretnya
   * tidak mengubah apa pun: logo mitra dan kontak (selain Horizon) selalu di kaki,
   * angka kunci menempel pada About, dan gaya gathering tidak menampilkan angka
   * kunci sama sekali. Barisnya tampil di tempat itu, tanpa pegangan seret.
   * Datanya tetap di `sections`; hanya daftarnya yang jujur soal letaknya.
   */
  function tempatTetap(id: LandingSectionId): "kaki" | "tentang" | "tidak" | null {
    if (!modern || forum) return null;
    if (id === "sponsors") return "kaki";
    if (id === "contact" && !horizon) return "kaki";
    if (id === "highlights") return gathering ? "tidak" : "tentang";
    return null;
  }
  return { facts, setFacts, landing, setLanding, busy, setBusy, error, setError, bagianDipilih, setBagian, hanyaFormulir, bagian, terbuka, setTerbuka, gulirDaftar, terbukaSebelumnya, judulTerbuka, setJudulTerbuka, sorot, setSorot, halamanPratinjau, setHalamanPratinjau, isiRundown, setIsiRundown, rundownKosong, lencanaRundown, rundownEn, setRundownEn, rundownEnTersimpan, setRundownEnTersimpan, barisSesi, setBarisSesi, rundownTertunda, terkini, tambahTerbuka, setTambahTerbuka, sisipSesudah, setSisipSesudah, tampilTersembunyi, setTampilTersembunyi, konfirmasiHapus, setKonfirmasiHapus, urungan, setUrungan, akun, kunciPanel, kunciBahasa, bahasaTersimpan, bahasaSesi, setBahasaSesi, bahasa, setBahasa, lebarTersimpan, lebarSeret, setLebarSeret, lebarPanel, seret, setSeret, sasaran, setSasaran, previewKey, setPreviewKey, jejakLuar, formInherit, setFormInherit, formSeed, setFormSeed, pratinjauPreset, setPratinjauPreset, tersimpan, setTersimpan, toast, load, segarkanPratinjau, muatBarisSesi, sudahDimuat, blokDariTautan, sections, cuplikan, rundownBerubah, berubah, ubahRundown, presetDilihat, drafPratinjau, bilahPratinjau, tinggiBilah, gulirTerakhir, bagianTerakhir, terapkanPratinjau, pilihBahasa, patchFacts, pilihBerkas, kartuTentangRef, ekspor, impor, sectionHasContent, tujuanGeser, moveSection, isiKirim, save, gayaBanner, tataLetak, modern, forum, gathering, horizon, kontakPanitiaAdmin, kurangEn, agendaAktif, rundownKurangEn, idSesiDipakai, sesiKurangEn, belumDiterjemahkan, barisKurangEn, modeEn, sesiLamaBelumTerhubung, sesiPerluDipilih, catatanProgram, setCatatanProgram, hapusCatatanProgram, tokensHero, warnaHalaman, portalAktif, sesiPertama, tautanSumberPortal, panelPratinjauPortal, isiPortal, emasHorizon, tempatTetap };
}
