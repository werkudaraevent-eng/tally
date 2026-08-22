"use client";

import { ArmchairIcon, ArrowSquareOut, BookOpen, Browsers, QrCode, CalendarDots, ChartBar, ChartBarHorizontal, GearSix, Gift, HandWaving, List, ListChecks, MonitorPlay, Receipt, ShieldCheck, Storefront, UserPlus, UsersThree, X } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconButton, ThemeToggle, TopAppBar } from "@/components/m3";
import { EventMenu, type EventPilihan } from "@/components/admin/event-menu";
import { UserMenu } from "@/components/admin/user-menu";

/**
 * Menu admin, dikelompokkan menurut PEKERJAAN yang sedang dilakukan.
 *
 * Sebelumnya enam belas item berdiri datar dalam satu daftar, dan urutannya
 * mencampur tiga dunia yang tidak pernah dikerjakan bersamaan: jualan di booth,
 * data peserta, dan layar panggung. Akibatnya terukur di hari-H — papan
 * peringkat, undian, dan voting adalah tiga menu yang dibuka berurutan saat MC
 * memegang mikrofon, dan ketiganya terpencar di posisi 10, 13, dan 14.
 *
 * Pembagiannya menurut SIAPA YANG MENATAP hasilnya:
 *
 *   * Halaman publik — dibuka tamu di ponselnya sendiri, sebelum hari-H.
 *   * Layar panggung — ditonton seruangan dari proyektor, saat acara berjalan.
 *
 * Itu sebabnya Denah kursi masuk ke kelompok pertama meski terasa "peserta":
 * yang membukanya adalah tamu yang mencari mejanya, lewat /denah.
 *
 * Kelompok pertama sengaja tanpa judul. Satu item di bawah judul "Ringkasan"
 * menambah baris tanpa menambah keterangan apa pun.
 */
const navigation = [
  {
    section: null,
    items: [{ href: "/admin", label: "Dashboard", icon: ChartBar, ownerOnly: false }],
  },
  {
    section: "Penjualan",
    items: [
      { href: "/admin/orders", label: "Transaksi", icon: ListChecks, ownerOnly: false },
      // Item spesial dulu menu tersendiri. Ia katalog barang yang dijual booth
      // yang sama, dan dua menu untuk satu katalog membuat admin mencari harga
      // di tempat yang salah lebih dulu. Sekarang tab di dalam Booth & item.
      { href: "/admin/booths", label: "Booth & item", icon: Storefront, ownerOnly: false },
      { href: "/admin/reports", label: "Laporan", icon: Receipt, ownerOnly: false },
    ],
  },
  {
    section: "Peserta",
    items: [
      { href: "/admin/participants", label: "Daftar peserta", icon: UsersThree, ownerOnly: false },
      { href: "/admin/registrasi", label: "Pendaftaran publik", icon: UserPlus, ownerOnly: false },
      // Kehadiran duduk di kelompok Peserta, bukan Layar panggung: yang dikelola
      // di sini adalah orang dan catatan hadirnya, bukan sesuatu yang ditonton
      // seruangan dari proyektor.
      { href: "/admin/attendance", label: "Kehadiran", icon: QrCode, ownerOnly: false },
    ],
  },
  {
    section: "Halaman publik",
    items: [
      { href: "/admin/landing", label: "Halaman acara", icon: Browsers, ownerOnly: false },
      { href: "/admin/rundown", label: "Rundown acara", icon: CalendarDots, ownerOnly: false },
      { href: "/admin/seat-map", label: "Denah kursi", icon: ArmchairIcon, ownerOnly: false },
    ],
  },
  {
    section: "Layar panggung",
    items: [
      // Dulu "Live Display". Namanya menjanjikan seluruh layar acara, isinya
      // papan peringkat transaksi beserta reveal bertahapnya — dan panitia yang
      // mencari "di mana atur ranking" tidak punya alasan menekan menu itu.
      { href: "/admin/display", label: "Papan peringkat", icon: MonitorPlay, ownerOnly: false },
      // Layar sapa duduk di Layar panggung, bukan di Peserta bersama Kehadiran.
      // Yang dikelola di sini adalah sesuatu yang DITONTON seruangan; catatan
      // hadirnya sendiri tetap diurus di menu Kehadiran.
      { href: "/admin/sapa", label: "Layar sapa", icon: HandWaving, ownerOnly: false },
      // Cocok dengan startsWith, jadi /admin/undian/kontrol ikut menyorot entri ini.
      { href: "/admin/undian", label: "Undian", icon: Gift, ownerOnly: false },
      { href: "/admin/vote", label: "Voting langsung", icon: ChartBarHorizontal, ownerOnly: false },
    ],
  },
];

/**
 * Halaman yang TIDAK ada di sidebar, tetapi tetap butuh judul di bilah atas.
 *
 * Pengaturan dicapai lewat menu akun di pojok kanan, dan User & role serta Audit
 * trail adalah tab di dalamnya. Ketiganya bukan tujuan yang dicari dari daftar
 * menu — mereka dibuka sekali saat menyiapkan sistem, lalu nyaris tidak disentuh
 * lagi selama acara berjalan. Sidebar disisakan untuk tujuan yang benar-benar
 * ditekan panitia sepanjang hari.
 */
const halamanSistem = [
  { href: "/admin/settings", label: "Pengaturan", icon: GearSix, ownerOnly: false },
  { href: "/admin/users", label: "User & role", icon: ShieldCheck, ownerOnly: false },
];

/** Daftar rata untuk pencarian judul halaman. Sumbernya tetap satu. */
const semuaMenu = [...navigation.flatMap((group) => group.items), ...halamanSistem];

/**
 * Satu tujuan di drawer.
 *
 * Tinggi 48px, bukan 56px seperti spesifikasi drawer M3. Angka 56 disusun untuk
 * aplikasi konsumen dengan lima sampai tujuh tujuan; layar ini punya dua belas
 * ditambah kaki drawer, dan pada 56px daftarnya melewati tinggi layar laptop
 * sebelum sampai ke kelompok terakhir. Target sentuhnya tetap di atas 48px yang
 * dituntut pedoman aksesibilitas.
 */
function ItemMenu({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; weight?: "fill" | "regular" }>;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      // Item aktif memakai bentuk pil penuh — itu cara M3 menandai tujuan saat
      // ini di navigasi, dan bentuknya tetap terbaca ketika latar terang membuat
      // perbedaan warnanya menipis.
      className={`m3-state flex min-h-12 items-center gap-3 rounded-full px-4 text-label-large font-semibold transition-[background-color,color] duration-200 ease-emphasized ${active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant"}`}
    >
      <Icon size={22} weight={active ? "fill" : "regular"} />
      {label}
    </Link>
  );
}

export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const eventPrefix = pathname.match(/^\/e\/[^/]+/)?.[0] ?? "";
  const logicalPathname = eventPrefix ? pathname.slice(eventPrefix.length) || "/" : pathname;
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [akun, setAkun] = useState<{ username: string; role: string } | null>(null);
  const [events, setEvents] = useState<EventPilihan[]>([]);

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
   * Nama event di kepala sidebar. Sebelumnya teks mati "Event Transaction Hub",
   * yang berbahaya justru karena terlihat benar: admin dengan akses beberapa
   * event tidak punya cara membedakan workspace mana yang sedang dibuka.
   *
   * Memakai /api/events yang sudah ada, bukan endpoint baru: daftarnya kecil dan
   * sudah difilter hak akses di server. Slug diambil dari prefiks URL; tanpa
   * prefiks (link lama) dipakai aturan yang SAMA dengan getPublicRequestEvent —
   * hanya aman bila tepat satu event aktif, selain itu label dibiarkan kosong
   * daripada menebak dan menampilkan nama event yang salah.
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
   * Event yang sedang dibuka. Tanpa prefiks slug di URL dipakai aturan yang SAMA
   * dengan getPublicRequestEvent — hanya aman bila tepat satu event aktif, selain
   * itu dibiarkan kosong daripada menebak dan menampilkan nama event yang salah.
   */
  const eventAktif = eventSlug
    ? events.find((event) => event.slug === eventSlug)
    : events.filter((event) => event.status === "active").length === 1
      ? events.find((event) => event.status === "active")
      : undefined;
  const eventName = eventAktif?.name ?? null;

  /**
   * Kunci gulir halaman selama menu mobile terbuka.
   *
   * Ini penyebab utama menu bawah tidak bisa dijangkau di ponsel, dan sempat
   * terlihat seperti masalah `overflow` pada sidebar-nya. Bukan: sidebar sudah
   * `overflow-y-auto` dan DIUKUR memang bisa digulir 302px.
   *
   * Masalahnya halaman DI BELAKANGNYA bisa digulir 1483px. Angka itu jauh lebih
   * besar, jadi gerakan jari hampir selalu diambil oleh body — sidebar ikut
   * bergerak sedikit lalu berhenti, sementara halaman di belakang terus jalan.
   * Yang terasa oleh pengguna: "menunya tidak bisa di-scroll".
   *
   * `position: fixed` pada body TIDAK dipakai walau lebih sering dijumpai: ia
   * mengembalikan halaman ke atas saat menu ditutup, sehingga admin yang membuka
   * menu di tengah daftar order kehilangan posisi bacanya. `overflow: hidden`
   * menahan gulir tanpa memindahkan apa pun.
   *
   * Nilai lama dikembalikan saat menutup, bukan diset ke "" — halaman lain bisa
   * saja sudah mengatur overflow untuk keperluannya sendiri.
   */
  useEffect(() => {
    if (!mobileOpen) return;
    const { body } = document;
    const sebelumnya = body.style.overflow;
    body.style.overflow = "hidden";
    return () => { body.style.overflow = sebelumnya; };
  }, [mobileOpen]);

  // Tutup menu saat layar melebar ke lg: di sana sidebar selalu tampil, dan
  // status "terbuka" yang tertinggal akan mengunci gulir halaman padahal tidak
  // ada menu mengambang yang terlihat. Terjadi saat ponsel diputar ke lanskap.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => { if (mq.matches) setMobileOpen(false); };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Kelompok yang seluruh isinya tersembunyi ikut dibuang. Tanpa itu, judulnya
  // menggantung di atas ruang kosong bagi admin yang bukan pemilik sistem.
  const visibleNavigation = navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.ownerOnly || isOwner) }))
    .filter((group) => group.items.length > 0);

  const aktif = (href: string) =>
    href === "/admin" ? logicalPathname === "/admin" : logicalPathname.startsWith(href);

  /**
   * Judul top app bar. Diambil dari tabel `navigation` yang sama dengan
   * penyorot menu aktif — daftar judul kedua akan menyimpang pada perubahan
   * pertama, dan judul yang tidak cocok dengan menu yang tersorot membuat orang
   * mengira ia salah halaman.
   *
   * Padanan terpanjang menang: /admin/undian/kontrol harus menjadi "Undian",
   * bukan "Dashboard" hanya karena /admin cocok lebih dulu.
   */
  const currentPage = semuaMenu
    .filter(({ href }) => (href === "/admin" ? logicalPathname === "/admin" : logicalPathname.startsWith(href)))
    .sort((a, b) => b.href.length - a.href.length)[0];

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    // Latar shell = tone rel navigasi. Ia yang mengintip di takik sudut panel
    // konten; tanpa itu sudut membulatnya tidak punya apa pun untuk
    // memperlihatkan lengkungannya.
    <div className="admin-shell min-h-dvh bg-surface-container text-on-surface">
      {/* Latar gelap saat menu terbuka.

          Bukan sekadar hiasan: sebelumnya tidak ada apa pun di antara menu dan
          halaman, sehingga sentuhan yang meleset sedikit dari sidebar langsung
          menggulir konten di belakangnya. Lapisan ini menangkap sentuhan itu dan
          menutup menu — perilaku yang sudah diharapkan orang dari drawer.

          Hanya di bawah lg: pada layar besar sidebar bagian dari tata letak, dan
          menggelapkan halaman di sana justru menghalangi pekerjaan. */}
      <button
        type="button"
        onClick={() => setMobileOpen(false)}
        aria-label="Tutup menu admin"
        tabIndex={mobileOpen ? 0 : -1}
        className={`fixed inset-0 z-30 bg-scrim/50 transition-opacity duration-200 ease-standard lg:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      {/* `h-dvh`, bukan `inset-y-0`: di browser ponsel bilah alamat menyusut dan
          memuai, dan dvh mengikutinya sehingga tepi bawah sidebar tidak pernah
          tertutup bilah navigasi. `overflow-hidden` di sini memaksa penggulirannya
          terjadi di <nav>, satu-satunya bagian yang memang panjang; kepala dan
          tombol logout tetap di tempatnya. */}
      {/* Tone drawer disamakan dengan tone bilah-yang-tergulir (`surface-container`),
          bukan satu tingkat di bawahnya.

          Sebelumnya drawer `surface-container-low` sementara bilah naik ke
          `surface-container` begitu halaman digulir. Keduanya bertemu di satu
          sudut, jadi terbentuk huruf L dari dua warna yang tidak pernah menyatu —
          itulah yang membuat kiri dan atas terbaca sebagai dua rancangan berbeda.
          Sekarang keduanya satu bidang yang sama. */}
      <aside className={`fixed left-0 top-0 z-40 flex h-dvh w-[272px] flex-col overflow-hidden bg-surface-container transition-transform duration-300 ease-emphasized lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Tinggi dikunci ke tinggi bilah atas (64px) supaya nama produk di sini
            duduk pada garis dasar yang SAMA dengan judul halaman di sebelahnya.
            Baris "ADMIN WORKSPACE" dibuang: bilah sudah membawa pasangan
            judul+subjudul, dan dua pasang yang sejajar dengan ukuran berbeda
            terbaca sebagai dua header yang bersaing, bukan satu. */}
        <div className="flex h-16 shrink-0 items-center gap-3 px-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Storefront size={20} weight="duotone" />
          </div>
          <p className="truncate text-title-medium font-semibold tracking-tight">Tally Control Room</p>
        </div>

        {/* `min-h-0` WAJIB. Tanpa itu anak flex menolak menyusut di bawah tinggi
            kontennya, <nav> memanjang melewati sidebar, dan penggulirannya tidak
            pernah aktif — persis kegagalan yang sama seperti pada app-shell /rundown.

            `pr-2`, bukan `px-3`: batang gulir menempel di tepi kanan, dan tanpa
            celah ia menempel rapat pada pil item sehingga terbaca sebagai garis
            vertikal kedua di samping tepi drawer. */}
        {/* Kelompok dibungkus <ul> ber-`aria-labelledby` ke judulnya, bukan
            sekadar teks di antara tautan. Pembaca layar mengumumkan "Layar
            panggung, daftar, 3 item" — informasi yang sama dengan yang dilihat
            mata dari jarak judul dan indentasi. */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 pl-3 pr-2" aria-label="Navigasi admin">
          {visibleNavigation.map((group, index) => {
            const judulId = group.section ? `nav-${group.section.replace(/\s+/g, "-").toLowerCase()}` : undefined;
            return (
              // Garis pemisah, BUKAN sekadar jarak yang lebih lebar.
              //
              // Sebelumnya judul kelompok hanya teks kecil ber-warna
              // `on-surface-variant` — warna yang sama persis dengan label item
              // yang tidak aktif. Mata membacanya sebagai "menu berhuruf kecil",
              // bukan sebagai kepala kelompok. Garis mengerjakan pemisahan itu
              // dengan satu piksel, sehingga judulnya boleh tetap redup dan tidak
              // bersaing dengan tujuan yang bisa ditekan.
              <div
                key={group.section ?? "utama"}
                className={index === 0 ? "" : "mt-3 border-t border-outline-variant pt-3"}
              >
                {group.section ? (
                  <h2
                    id={judulId}
                    className="px-4 pb-2 text-label-small font-semibold uppercase tracking-[0.16em] text-on-surface-variant"
                  >
                    {group.section}
                  </h2>
                ) : null}
                <ul className="space-y-1" aria-labelledby={judulId}>
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <ItemMenu
                        href={`${eventPrefix}${item.href}`}
                        label={item.label}
                        icon={item.icon}
                        active={aktif(item.href)}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Kaki drawer. Isinya bukan navigasi harian: satu tautan bantuan dan
            nomor versi.
            
            Versinya ada karena ia pertanyaan pertama yang ditanyakan saat panitia
            melaporkan masalah lewat WhatsApp, dan sebelumnya tidak ada satu pun
            tempat di layar yang bisa menjawabnya. Panduan dibuka di tab baru:
            panitia yang membacanya sedang berdiri di meja registrasi dengan
            halaman kerja yang belum selesai di tab sebelah. */}
        <div className="shrink-0 border-t border-outline-variant p-3">
          <a
            href={`${eventPrefix}/panduan/sistem`}
            target="_blank"
            rel="noreferrer"
            className="m3-state flex min-h-11 items-center gap-3 rounded-full px-4 text-label-large font-semibold text-on-surface-variant"
          >
            <BookOpen size={20} />
            Panduan sistem
            <ArrowSquareOut size={14} className="ml-auto shrink-0 opacity-70" />
          </a>
          <p className="px-4 pt-2 text-body-small text-on-surface-variant">
            Tally v{process.env.NEXT_PUBLIC_APP_VERSION ?? "—"}
          </p>
        </div>
      </aside>

      {/* Panel konten, bukan sekadar sisa ruang di kanan rel.

          Sudut kiri-atasnya dibulatkan 28px sehingga rel navigasi dan panel
          terbaca sebagai bingkai dan isi, bukan dua persegi yang ditempelkan.
          Ini pola pane pada layout adaptif M3, dan ia satu-satunya sudut di
          seluruh layar admin yang tadinya masih siku 90° padahal semua wadah di
          dalamnya sudah membulat.

          Bilah atas ikut dibulatkan di sudut yang sama: ia elemen teratas di
          dalam panel, jadi sudut siku miliknya akan menonjol menutupi lengkungan
          panel. Membulatkan keduanya lebih murah daripada `overflow: hidden`,
          yang akan mematahkan `position: sticky` pada bilah. */}
      <div className="admin-pane min-h-dvh bg-surface lg:rounded-tl-2xl">
        <TopAppBar
          className="lg:rounded-tl-2xl"
          // Judul bilah adalah remah roti: <event> / <halaman>.
          //
          // Pemilih event pindah ke sini dari kartu besar di kepala drawer —
          // pola yang sama dipakai Vercel dan Stripe, dan alasannya bukan gaya:
          // kartu itu memakan 76px tetap dari ruang yang sama dengan daftar menu,
          // padahal berpindah event terjadi beberapa kali sehari, bukan beberapa
          // kali semenit.
          //
          // Di layar sempit remahnya dilipat: nama event turun menjadi subjudul
          // (lihat `subtitle`), dan bilah hanya membawa judul halaman. Tiga
          // elemen teks berjajar di 375px akan terpotong semuanya.
          title={currentPage?.label ?? "Admin"}
          // Pemilih event masuk lewat slot `breadcrumb`, BUKAN sebagai bagian
          // dari `title`. Judul dibungkus `truncate` (overflow: hidden), dan panel
          // menu yang dirender di dalamnya terpotong habis — tombolnya bisa
          // ditekan, menunya tidak pernah terlihat.
          // Disembunyikan di bawah `sm` BESERTA garis miringnya: pada 375px,
          // remah roti tiga bagian membuat ketiganya terpotong. Nama event tetap
          // terbaca di sana lewat subjudul.
          breadcrumb={
            <span className="hidden min-w-0 items-center gap-2 sm:flex">
              <EventMenu events={events} activeSlug={eventAktif?.slug ?? null} />
              <span aria-hidden className="shrink-0 text-title-large text-on-surface-variant">/</span>
            </span>
          }
          subtitle={eventName ?? undefined}
          subtitleClassName="sm:hidden"
          // Pemilih tema dan menu akun duduk di bilah atas, bukan di kaki drawer.
          //
          // Di drawer keduanya memakan ~170px dari ruang yang sama dengan daftar
          // menu, dan pada jendela pendek itu selisih antara tiga baris menu
          // terlihat dan enam. Keduanya juga bukan tujuan navigasi: satu
          // preferensi tampilan, satu tentang akun — dan ujung akhir top app bar
          // adalah tempat yang disediakan M3 untuk keduanya.
          actions={
            <>
              <ThemeToggle compact className="bg-surface-container-high" />
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
              label={mobileOpen ? "Tutup menu admin" : "Buka menu admin"}
              onClick={() => setMobileOpen((open) => !open)}
              className="-ml-2 lg:hidden"
            >
              {mobileOpen ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
            </IconButton>
          }
        />

        {/* `key` berisi slug event, dan itu WAJIB.
         *
         * Proxy menulis ulang `/e/<slug>/admin/seat-map` menjadi
         * `/admin/seat-map?eventSlug=<slug>`, jadi berpindah event tidak
         * mengganti komponen halamannya — React memakai ulang instance yang sama
         * dan `useEffect` pengambil data tidak berjalan lagi. Terukur: memilih
         * event lain dari menu di bilah atas mengganti judul dan remah rotinya,
         * tetapi isi halaman tetap milik event sebelumnya sampai ditekan reload.
         *
         * Mengganti `key` memaksa seluruh subtree dipasang ulang, sehingga setiap
         * pengambilan data di halaman ikut berjalan lagi. Dipilih daripada
         * memaksa navigasi keras (`<a href>`) di menunya: navigasi keras memuat
         * ulang seluruh dokumen — bundel, tema, dan sesi — untuk pekerjaan yang
         * cukup diselesaikan dengan memasang ulang satu subtree.
         */}
        <div key={eventSlug || "event-tunggal"}>{children}</div>
      </div>
    </div>
  );
}
