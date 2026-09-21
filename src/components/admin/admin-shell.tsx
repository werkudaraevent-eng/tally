"use client";

import { ArrowSquareOut, List, SidebarSimple, Storefront, X } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconButton, TopAppBar } from "@/components/m3";
import { EventMenu, type EventPilihan } from "@/components/admin/event-menu";
import { cariHalaman, grupDari, navigation } from "@/components/admin/nav-config";
import { AdminHeaderScrollProvider, AdminPageProvider } from "@/components/admin/page-context";
import { CommandPalette, QuickSearchButton } from "@/components/admin/quick-search";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { useOpenGroups, usePinnedSidebar, useRecents } from "@/components/admin/sidebar-store";
import { UserMenu } from "@/components/admin/user-menu";

/**
 * Rangka ruang kerja: rel navigasi, bilah atas, dan konteks halaman.
 *
 * Definisi menunya TIDAK di sini — ia tinggal di `nav-config.ts`, karena dipakai
 * empat tempat sekaligus (daftar menu, palet perintah, judul halaman, dan
 * riwayat). Yang tersisa di berkas ini adalah perakitan dan keadaan yang hanya
 * dimengerti rangka: laci ponsel, sematan rel, dan judul yang berpindah ke bilah
 * saat digulir.
 *
 * ---- Dua keadaan untuk satu rel -------------------------------------------
 *
 * `pinned` dan `peeking` sengaja dipisah, dan pemisahan itulah seluruh fiturnya:
 *
 *   * `pinned` PERSISTEN, disimpan di cookie, dan ia SATU-SATUNYA yang
 *     menentukan lebar kolom konten. Selama nilainya tidak berubah, tidak ada
 *     satu piksel pun di halaman yang bergeser.
 *   * `peeking` SEMENTARA, lahir dari kursor atau fokus papan ketik, dan hanya
 *     mengubah lebar rel itu sendiri. Rel melebar DI ATAS konten, seperti panel
 *     melayang.
 *
 * Kalau keduanya digabung jadi satu "collapsed", setiap kali kursor menyerempet
 * tepi kiri layar seluruh halaman melompat 196px dan mengalir ulang. Itu persis
 * yang membuat sidebar yang "membantu" menjadi sidebar yang dihindari.
 */

/** Lebar rel. Dipakai dua kali di berkas ini dan sekali di CSS, lewat `--rail-w`. */
const LEBAR_PENUH = "260px";
const LEBAR_REL = "64px";

/** Kursor yang sekadar lewat ke tepi layar tidak boleh membuka apa pun. */
const JEDA_BUKA = 150;
/** Cukup panjang untuk sempat kembali setelah keluar sedikit, cukup pendek untuk tidak menggantung. */
const JEDA_TUTUP = 280;

function langganMedia(kueri: string) {
  return (onChange: () => void) => {
    const mq = window.matchMedia(kueri);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  };
}

/**
 * Snapshot server untuk keduanya `true`, dan itu tebakan yang disengaja.
 *
 * Server tidak tahu lebar layar maupun apakah ada tetikus. Menebak "desktop
 * dengan tetikus" aman karena kedua konsekuensinya tidak terlihat: di ponsel
 * lacinya tetap tergeser keluar layar pada cat pertama, dan peek hanya bisa
 * dipicu oleh peristiwa yang memang tidak pernah datang di layar sentuh.
 */
const langganLebar = langganMedia("(min-width: 1024px)");
const bacaLebar = () => window.matchMedia("(min-width: 1024px)").matches;
const langganHover = langganMedia("(hover: hover)");
const bacaHover = () => window.matchMedia("(hover: hover)").matches;

export function AdminShell({
  children,
  pinAwal = true,
}: Readonly<{
  children: React.ReactNode;
  /** Dibaca dari cookie oleh komponen server, supaya HTML pertama sudah selebar yang benar. */
  pinAwal?: boolean;
}>) {
  const pathname = usePathname();
  const eventPrefix = pathname.match(/^\/e\/[^/]+/)?.[0] ?? "";
  const logicalPathname = eventPrefix ? pathname.slice(eventPrefix.length) || "/" : pathname;
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletTerbuka, setPaletTerbuka] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [akun, setAkun] = useState<{ username: string; role: string } | null>(null);
  const [events, setEvents] = useState<EventPilihan[]>([]);

  const desktop = useSyncExternalStore(langganLebar, bacaLebar, () => true);
  const bisaHover = useSyncExternalStore(langganHover, bacaHover, () => true);
  const { pinned, toggle: togglePin } = usePinnedSidebar(pinAwal);

  /* ---- Peek ------------------------------------------------------------- */

  const [peeking, setPeeking] = useState(false);
  const aside = useRef<HTMLElement | null>(null);
  const timerBuka = useRef<number | null>(null);
  const timerTutup = useRef<number | null>(null);
  /** Popover pemilih acara sedang terbuka. Ia lebih lebar daripada rel, jadi kursor ada di luar. */
  const [popoverTerbuka, setPopoverTerbuka] = useState(false);
  const kursorDiRel = useRef(false);
  /**
   * Menahan peek tepat setelah sematan dilepas.
   *
   * Tombol sematan ada DI DALAM rel, jadi melepas sematan meninggalkan kursor di
   * atas rel yang barusan menyempit — dan tanpa penahan ini ia langsung melebar
   * lagi 150ms kemudian. Yang terlihat: menekan "lepas sematan" tidak melakukan
   * apa-apa. Penahannya dilepas begitu kursor benar-benar keluar.
   */
  const blokirPeek = useRef(false);

  const batalTimer = useCallback(() => {
    if (timerBuka.current !== null) window.clearTimeout(timerBuka.current);
    if (timerTutup.current !== null) window.clearTimeout(timerTutup.current);
    timerBuka.current = null;
    timerTutup.current = null;
  }, []);

  const jadwalTutup = useCallback(() => {
    batalTimer();
    timerTutup.current = window.setTimeout(() => setPeeking(false), JEDA_TUTUP);
  }, [batalTimer]);

  const tutupPeek = useCallback(() => {
    batalTimer();
    setPeeking(false);
  }, [batalTimer]);

  useEffect(() => () => batalTimer(), [batalTimer]);

  /** Rel boleh mengintip: hanya di desktop, dan hanya kalau sematannya dilepas. */
  const relMenerimaPeek = desktop && !pinned;

  function onPointerEnter() {
    kursorDiRel.current = true;
    if (!relMenerimaPeek || !bisaHover || blokirPeek.current) return;
    batalTimer();
    timerBuka.current = window.setTimeout(() => setPeeking(true), JEDA_BUKA);
  }

  function onPointerLeave() {
    kursorDiRel.current = false;
    blokirPeek.current = false;
    if (!relMenerimaPeek) return;
    // Panel pemilih acara berada di luar kotak rel, jadi kursor yang pindah ke
    // sana terbaca sebagai "keluar". Menutup rel di bawah panel yang sedang
    // dipakai adalah cara tercepat membuat fiturnya terasa rusak.
    if (popoverTerbuka) { batalTimer(); return; }
    jadwalTutup();
  }

  function onFocusCapture() {
    if (!relMenerimaPeek) return;
    // Fokus papan ketik MEMBUKA peek, bukan sekadar menahannya. Tanpa ini, Tab
    // dari bilah atas masuk ke lima belas tombol tak berlabel yang tidak
    // terlihat, tanpa satu pun isyarat bahwa fokus sudah pindah ke sana.
    batalTimer();
    setPeeking(true);
  }

  function onBlurCapture(peristiwa: React.FocusEvent) {
    if (!relMenerimaPeek) return;
    const berikutnya = peristiwa.relatedTarget as Node | null;
    if (berikutnya && aside.current?.contains(berikutnya)) return;
    if (kursorDiRel.current || popoverTerbuka) return;
    jadwalTutup();
  }

  function onPopoverChange(terbuka: boolean) {
    setPopoverTerbuka(terbuka);
    if (terbuka) { batalTimer(); return; }
    if (!relMenerimaPeek) return;
    if (kursorDiRel.current || aside.current?.contains(document.activeElement)) return;
    jadwalTutup();
  }

  /**
   * Layar sentuh yang cukup lebar untuk punya rel: ketukan PERTAMA membuka rel,
   * bukan membuka menunya.
   *
   * Tanpa ini, rel ikon di tablet adalah lima belas tombol tanpa label yang
   * langsung memindahkan halaman begitu tersenggol. `onClickCapture` mencegat
   * sebelum tautannya sempat bekerja; setelah rel terbuka, ketukan berikutnya
   * lewat seperti biasa.
   */
  function onClickCapture(peristiwa: React.MouseEvent) {
    if (bisaHover || !relMenerimaPeek || peeking) return;
    // Tombol sematan dikecualikan. Ia satu-satunya kontrol di rel yang tugasnya
    // memang mengubah rel itu sendiri, dan mencegatnya berarti tablet tidak
    // punya cara menyematkan kembali sidebarnya.
    if ((peristiwa.target as Element).closest?.("[data-peek-skip]")) return;
    peristiwa.preventDefault();
    peristiwa.stopPropagation();
    setPeeking(true);
  }

  // Ketukan di luar rel menutup peek. HANYA di perangkat tanpa hover: di tempat
  // lain `pointerleave` sudah mengerjakannya, dan pendengar dokumen tambahan
  // cuma menambah satu jalan lagi untuk menutup rel yang sedang dipakai.
  useEffect(() => {
    if (!peeking || bisaHover) return;
    const onPointerDown = (peristiwa: PointerEvent) => {
      if (aside.current?.contains(peristiwa.target as Node)) return;
      setPeeking(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [peeking, bisaHover]);

  // Esc menutup peek. Pendengarnya di dokumen, jadi ia TIDAK berjalan ketika
  // popover pemilih acara menangani Esc-nya sendiri: penanganan di sana memanggil
  // `stopPropagation`, yang menghentikan peristiwa nativenya sebelum sampai ke
  // dokumen. Esc pertama menutup panel, Esc kedua menutup rel.
  useEffect(() => {
    if (!peeking) return;
    const onKey = (peristiwa: KeyboardEvent) => { if (peristiwa.key === "Escape") tutupPeek(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [peeking, tutupPeek]);

  /* ---- Data ------------------------------------------------------------- */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) return;
        const user = (await response.json()).user as { username: string; role: string } | null;
        setAkun(user ?? null);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const isOwner = akun?.role === "super_admin";

  /**
   * Nama acara di kepala sidebar. Sebelumnya teks mati "Event Transaction Hub",
   * yang berbahaya justru karena terlihat benar: admin dengan akses beberapa
   * acara tidak punya cara membedakan workspace mana yang sedang dibuka.
   */
  const eventSlug = eventPrefix.slice(3);
  useEffect(() => {
    let batal = false;
    void fetch("/api/events", { cache: "no-store" }).then(async (response) => {
      if (!response.ok || batal) return;
      const daftar = ((await response.json()).events ?? []) as EventPilihan[];
      if (!batal) setEvents(daftar);
    });
    return () => { batal = true; };
  }, []);

  /**
   * Acara yang sedang dibuka. Tanpa prefiks slug di URL dipakai aturan yang SAMA
   * dengan getPublicRequestEvent: hanya aman bila tepat satu acara aktif, selain
   * itu dibiarkan kosong daripada menebak dan menampilkan nama acara yang salah.
   */
  const eventAktif = eventSlug
    ? events.find((event) => event.slug === eventSlug)
    : events.filter((event) => event.status === "active").length === 1
      ? events.find((event) => event.status === "active")
      : undefined;
  const eventName = eventAktif?.name ?? null;

  /**
   * Laci hanya ada di bawah lg. DITURUNKAN dari lebar layar, bukan ditutup oleh
   * efek yang mengamatinya: keadaan "terbuka" yang tertinggal saat ponsel diputar
   * ke lanskap mengunci gulir halaman padahal tidak ada menu yang terlihat.
   */
  const laciTerbuka = mobileOpen && !desktop;

  /**
   * Kunci gulir halaman selama laci ponsel terbuka.
   *
   * `position: fixed` pada body TIDAK dipakai walau lebih sering dijumpai: ia
   * mengembalikan halaman ke atas saat laci ditutup, sehingga admin yang membuka
   * menu di tengah daftar order kehilangan posisi bacanya.
   */
  useEffect(() => {
    if (!laciTerbuka) return;
    const { body } = document;
    const sebelumnya = body.style.overflow;
    body.style.overflow = "hidden";
    return () => { body.style.overflow = sebelumnya; };
  }, [laciTerbuka]);

  /* ---- Palet ------------------------------------------------------------ */

  /**
   * Elemen yang membuka palet, supaya fokus bisa dikembalikan ke sana.
   *
   * Tanpa ini, menutup palet dengan Esc membuang fokus ke `<body>`, dan Tab
   * berikutnya memulai lagi dari awal dokumen — di layar admin itu berarti
   * menyusuri seluruh rel sebelum kembali ke tempat orang tadi berada.
   */
  const pembukaPalet = useRef<HTMLElement | null>(null);

  // Fungsi biasa, bukan `useCallback`. Keduanya menulis DAN membaca ref yang
  // sama, dan React Compiler menolak mengompilasi komponen ini selama memoisasi
  // seperti itu masih ada ("Existing memoization could not be preserved").
  // Tidak ada yang hilang: keduanya hanya dipakai sebagai prop dan di dalam efek
  // di bawah, yang menerima keduanya lewat daftar dependensi.
  function bukaPalet() {
    pembukaPalet.current = document.activeElement as HTMLElement | null;
    setPaletTerbuka(true);
    // Palet menutupi rel, jadi rel yang sedang mengintip tidak punya alasan
    // tetap terbuka di belakangnya.
    tutupPeek();
  }

  function tutupPalet() {
    setPaletTerbuka(false);
    // Fokus dikembalikan ke yang membukanya. Tanpa ini, Esc membuang fokus ke
    // `<body>` dan Tab berikutnya memulai lagi dari awal dokumen.
    pembukaPalet.current?.focus();
  }

  /**
   * Ctrl/Cmd+K, satu-satunya pintasan yang tetap hidup saat kursor ada di kolom
   * isian. Itu memang perjanjiannya di mana-mana, dan orang yang menekannya di
   * tengah mengetik memang sedang mencari halaman lain.
   *
   * Isinya ditulis ulang di sini, bukan memanggil kedua fungsi di atas: fungsi
   * biasa lahir baru pada setiap render, jadi memasukkannya ke daftar dependensi
   * berarti memasang ulang pendengar papan ketik setiap kali apa pun berubah di
   * rangka ini.
   */
  useEffect(() => {
    const onKey = (peristiwa: KeyboardEvent) => {
      if (peristiwa.key.toLowerCase() !== "k" || !(peristiwa.metaKey || peristiwa.ctrlKey)) return;
      peristiwa.preventDefault();
      if (paletTerbuka) {
        setPaletTerbuka(false);
        pembukaPalet.current?.focus();
        return;
      }
      pembukaPalet.current = document.activeElement as HTMLElement | null;
      setPaletTerbuka(true);
      tutupPeek();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletTerbuka, tutupPeek]);

  /* ---- Halaman ---------------------------------------------------------- */

  /**
   * Halaman yang sedang dibuka. Satu pencarian, empat pemakai: judul di kepala
   * halaman, deskripsi di bawahnya, judul ringkas di bilah saat digulir, dan
   * entri "terakhir dibuka".
   */
  const currentPage = cariHalaman(logicalPathname);

  // Kelompok yang berisi halaman aktif dibuka sendiri. Dihitung dari tabel menu,
  // bukan disimpan: kalau sub-halaman pindah induk, ini ikut tanpa disentuh.
  const indukAktif = navigation
    .flatMap((group) => group.items)
    .find((item) => item.children?.some((anak) => logicalPathname.startsWith(anak.href)))?.href ?? null;

  const { terbuka: grupTerbuka, toggle: toggleGrup } = useOpenGroups(indukAktif);
  const [recentsTerbuka, setRecentsTerbuka] = useState(false);
  const { recents, togglePin: togglePinRecent } = useRecents({
    username: akun?.username ?? null,
    path: logicalPathname,
    label: currentPage?.label,
    konteks: grupDari.get(currentPage?.href ?? "") ?? eventName ?? "Ruang kerja",
  });

  // Judul halaman berpindah ke bilah atas begitu kepala halaman tergulir lewat.
  //
  // Observer dipasang lewat ref callback, bukan lewat `useRef` + efek: elemen
  // yang diamati datang dari komponen LAIN (`PageHeader`, di dalam konten) dan
  // berganti setiap kali rute berganti.
  const [judulTerlewat, setJudulTerlewat] = useState(false);
  const amatiJudul = useCallback((el: HTMLElement | null) => {
    setJudulTerlewat(false);
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setJudulTerlewat(!entry.isIntersecting),
      // Ambang atas -56px: judul dianggap lewat tepat saat ia masuk ke BAWAH
      // bilah, bukan saat ia meninggalkan layar.
      { rootMargin: "-56px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function onNavigate() {
    setMobileOpen(false);
    tutupPeek();
  }

  function onTogglePin() {
    // Saat sematan DILEPAS, kursor masih di atas tombolnya. Peek diblokir sampai
    // kursor benar-benar keluar, supaya rel tidak melebar lagi 150ms kemudian
    // dan membuat tombolnya terlihat tidak berfungsi.
    if (pinned) {
      blokirPeek.current = true;
      tutupPeek();
    }
    togglePin();
  }

  const versi = process.env.NEXT_PUBLIC_APP_VERSION ?? "—";

  /** Lebar VISUAL rel. Peek ikut melebarkannya; lebar kolom konten tidak. */
  const rail = desktop && !pinned && !peeking;

  return (
    // `press` dipasang di SATU tempat, dan dari sini seluruh layar admin ikut.
    //
    // `--rail-w` hanya membaca `pinned`. Itulah yang membuat peek terasa seperti
    // panel melayang dan bukan seperti tata letak yang berdenyut: kolom konten
    // tidak pernah tahu rel sedang melebar.
    <div
      className="press admin-shell min-h-dvh bg-surface text-on-surface"
      style={{ "--rail-w": pinned ? LEBAR_PENUH : LEBAR_REL } as React.CSSProperties}
    >
      {/* Latar gelap saat laci ponsel terbuka. Bukan hiasan: tanpa itu, sentuhan
          yang meleset sedikit dari sidebar langsung menggulir konten di belakangnya. */}
      <button
        type="button"
        onClick={() => setMobileOpen(false)}
        aria-label="Tutup menu admin"
        tabIndex={laciTerbuka ? 0 : -1}
        className={`fixed inset-0 z-peek bg-scrim/50 transition-opacity duration-200 ease-standard lg:hidden ${laciTerbuka ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      {/* `h-dvh`, bukan `inset-y-0`: di peramban ponsel bilah alamat menyusut dan
          memuai, dan dvh mengikutinya sehingga tepi bawah sidebar tidak pernah
          tertutup bilah navigasi.

          TETAP tanpa `overflow-x-hidden` juga, dan ini yang paling mudah salah:
          selama transisi lebar, isi rel memang lebih lebar daripada wadahnya, dan
          memotongnya di sini terasa seperti perbaikan yang benar. Bukan — panel
          pemilih acara BERLABUH di dalam <aside> dan lebih lebar daripada rel,
          jadi pemotongan di sini menghabisinya. Jebakan yang sama sudah tercatat
          dua kali di berkas ini. Pemotongannya dipasang di <nav> dan di pembungkus
          kolom cari, dua tempat yang tidak berlabuh apa pun. */}
      <aside
        ref={aside}
        data-rail={rail ? "1" : "0"}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
        onClickCapture={onClickCapture}
        className={`fixed left-0 top-0 z-sidebar flex h-dvh w-[260px] flex-col border-r border-outline-variant bg-surface transition-[transform,width,box-shadow] duration-200 ease-out lg:translate-x-0 ${
          laciTerbuka ? "translate-x-0" : "-translate-x-full"
        } ${pinned ? "lg:w-[260px]" : peeking ? "lg:w-[260px] lg:shadow-level3" : "lg:w-16"}`}
      >
        {/* Kepala: logo terpisah di kiri, pengalih acara di kanannya, dan tinggi
            yang dikunci ke tinggi baris bilah atas (`m3-drawer-head`, 56px) supaya
            garis bawah keduanya menyambung menjadi satu garis lurus.

            Blok merek statis "Tally" yang dulu di sini dilepas: nama produk tidak
            berubah dan tidak bisa ditindak, jadi ia memakan 56px teratas sidebar
            untuk memberi tahu sesuatu yang sudah diketahui. */}
        <div className="m3-drawer-head flex shrink-0 items-center gap-2 border-b border-outline-variant px-3">
          <div className="flex size-6 shrink-0 items-center justify-center text-on-surface-variant">
            <Storefront size={18} weight="regular" />
          </div>
          <div className="m3-rail-hide flex min-w-0 flex-1">
            <EventMenu
              events={events}
              activeSlug={eventAktif?.slug ?? null}
              isOwner={isOwner}
              onOpenChange={onPopoverChange}
            />
          </div>
        </div>

        <div className="m3-quick-wrap shrink-0 overflow-hidden px-3 pt-3">
          <QuickSearchButton onOpen={bukaPalet} collapsed={rail} />
        </div>

        {/* `min-h-0` WAJIB. Tanpa itu anak flex menolak menyusut di bawah tinggi
            kontennya, <nav> memanjang melewati sidebar, dan penggulirannya tidak
            pernah aktif — persis kegagalan yang sama seperti pada app-shell /rundown. */}
        <nav
          className="m3-nav-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain py-3 pl-3 pr-2 short:py-2"
          aria-label="Navigasi admin"
        >
          <SidebarNav
            eventPrefix={eventPrefix}
            path={logicalPathname}
            isOwner={isOwner}
            onNavigate={onNavigate}
            grupTerbuka={grupTerbuka}
            onToggleGrup={toggleGrup}
            recentsTerbuka={recentsTerbuka}
            onToggleRecents={() => setRecentsTerbuka((terbuka) => !terbuka)}
            recents={recents}
            onTogglePin={togglePinRecent}
          />
        </nav>

        {/* Kaki. Satu baris, tanpa pembungkus baris kedua.
            Sebelumnya tautan panduan berdiri sendiri di atas nomor versi, dan
            pada rel 260px "Panduan sistem" pecah jadi dua baris tepat di belakang
            lencana peralatan pengembang. `whitespace-nowrap` menutup itu. */}
        <div className="m3-drawer-foot flex shrink-0 items-center gap-1 border-t border-outline-variant px-2">
          <button
            type="button"
            onClick={onTogglePin}
            data-peek-skip
            // Ia tombol SEMATAN, bukan tombol lipat, dan labelnya harus
            // mengatakan itu: yang dilepas bukan lebarnya, melainkan haknya untuk
            // tetap lebar tanpa diminta.
            aria-label={pinned ? "Lepas sematan sidebar (Ctrl B)" : "Sematkan sidebar (Ctrl B)"}
            title={pinned ? "Lepas sematan sidebar (Ctrl B)" : "Sematkan sidebar (Ctrl B)"}
            aria-pressed={pinned}
            className={`hidden size-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 hover:bg-[var(--press-hover)] lg:flex ${
              pinned ? "text-on-surface" : "text-on-surface-variant"
            }`}
          >
            <SidebarSimple size={18} weight={pinned ? "fill" : "regular"} />
          </button>

          <a
            href={`${eventPrefix}/panduan/sistem`}
            target="_blank"
            rel="noreferrer"
            // Dibuka di tab baru: panitia yang membacanya sedang berdiri di meja
            // registrasi dengan halaman kerja yang belum selesai di tab sebelah.
            className="m3-rail-hide flex min-w-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-1 text-label-medium text-on-surface-variant hover:bg-[var(--press-hover)]"
          >
            Panduan sistem
            <ArrowSquareOut size={12} className="shrink-0" />
          </a>
          {/* Versinya ada karena ia pertanyaan pertama saat panitia melaporkan
              masalah lewat WhatsApp, dan sebelumnya tidak ada satu pun tempat di
              layar yang bisa menjawabnya. */}
          <p className="m3-rail-hide ml-auto shrink truncate whitespace-nowrap pr-1 text-label-medium text-[var(--press-ink-faint)]">
            Tally v{versi}
          </p>
        </div>
      </aside>

      {/* Panel konten. Dipisahkan dari rel oleh GARIS TEGAK, bukan oleh takik
          sudut membulat: dasbor yang jadi acuan memisahkan keduanya dengan satu
          garis lurus, dan garis itu sudah terpasang di tepi kanan rel. */}
      <div className="admin-pane min-h-dvh bg-surface">
        <TopAppBar
          // Bilah atas TIDAK membawa judul halaman. Judulnya ada di dalam konten,
          // besar, dengan ikon dan deskripsi. Judul ringkas muncul hanya setelah
          // kepala halaman tergulir lewat, dan sebagai `<p>` — `<h1>` halaman
          // sudah ada di konten, dan ini salinannya untuk orientasi.
          title={
            judulTerlewat ? (
              <span className="flex min-w-0 items-center gap-2">
                {currentPage?.icon ? <currentPage.icon size={18} /> : null}
                <span className="truncate">{currentPage?.label}</span>
              </span>
            ) : undefined
          }
          titleAs="p"
          subtitle={eventName ?? undefined}
          subtitleClassName="lg:hidden"
          actions={
            <>
              <UserMenu
                username={akun?.username ?? null}
                role={akun?.role ?? null}
                settingsHref={`${eventPrefix}/admin/settings`}
                onLogout={() => void logout()}
                loggingOut={loggingOut}
              />
            </>
          }
          leading={
            <IconButton
              label={laciTerbuka ? "Tutup menu admin" : "Buka menu admin"}
              onClick={() => setMobileOpen((open) => !open)}
              className="-ml-2 lg:hidden"
            >
              {laciTerbuka ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
            </IconButton>
          }
        />

        {/* `key` berisi slug acara, dan itu WAJIB.
         *
         * Proxy menulis ulang `/e/<slug>/admin/seat-map` menjadi
         * `/admin/seat-map?eventSlug=<slug>`, jadi berpindah acara tidak
         * mengganti komponen halamannya — React memakai ulang instance yang sama
         * dan `useEffect` pengambil data tidak berjalan lagi.
         */}
        <AdminPageProvider
          value={{
            label: currentPage?.label ?? "Ruang kerja",
            icon: currentPage?.icon,
            description: currentPage?.description,
          }}
        >
          <AdminHeaderScrollProvider value={{ terlewat: judulTerlewat, amati: amatiJudul }}>
            <div key={eventSlug || "event-tunggal"}>{children}</div>
          </AdminHeaderScrollProvider>
        </AdminPageProvider>
      </div>

      {/* Dipasang hanya saat terbuka. Membiarkannya terpasang lalu mengosongkan
          kuerinya lewat efek menghasilkan satu render tambahan pada setiap
          pembukaan, dan React 19 menandai `setState` di badan efek sebagai
          kesalahan. Melepasnya mengerjakan hal yang sama dengan lebih sedikit. */}
      {paletTerbuka ? (
        <CommandPalette
          onClose={tutupPalet}
          eventPrefix={eventPrefix}
          events={events}
          recents={recents}
        />
      ) : null}
    </div>
  );
}
