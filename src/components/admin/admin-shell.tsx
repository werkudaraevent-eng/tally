"use client";

import { ArmchairIcon, Browsers, CalendarDots, CaretLeft, ChartBar, ChartBarHorizontal, ClipboardText, GearSix, Gift, List, ListChecks, MonitorPlay, Receipt, ShieldCheck, SignOut, Storefront, Tag, UserPlus, UsersThree, X } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconButton, ThemeToggle, TopAppBar } from "@/components/m3";

const navigation = [
  { href: "/admin", label: "Dashboard", icon: ChartBar, ownerOnly: false },
  { href: "/admin/orders", label: "Orders", icon: ListChecks, ownerOnly: false },
  { href: "/admin/reports", label: "Reports", icon: Receipt, ownerOnly: false },
  { href: "/admin/participants", label: "Peserta", icon: UsersThree, ownerOnly: false },
  { href: "/admin/registrasi", label: "Registrasi publik", icon: UserPlus, ownerOnly: false },
  { href: "/admin/landing", label: "Halaman acara", icon: Browsers, ownerOnly: false },
  { href: "/admin/booths", label: "Booth & item", icon: Storefront, ownerOnly: false },
  { href: "/admin/offers", label: "Item spesial", icon: Tag, ownerOnly: false },
  { href: "/admin/users", label: "User & role", icon: ShieldCheck, ownerOnly: false },
  { href: "/admin/display", label: "Live Display", icon: MonitorPlay, ownerOnly: false },
  { href: "/admin/seat-map", label: "Denah kursi", icon: ArmchairIcon, ownerOnly: false },
  { href: "/admin/rundown", label: "Rundown acara", icon: CalendarDots, ownerOnly: false },
  // Cocok dengan startsWith, jadi /admin/undian/kontrol ikut menyorot entri ini.
  { href: "/admin/undian", label: "Undian", icon: Gift, ownerOnly: false },
  { href: "/admin/vote", label: "Voting langsung", icon: ChartBarHorizontal, ownerOnly: false },
  // Audit trail merekam tindakan klien, jadi hanya pemilik sistem yang melihatnya.
  // Server juga menolak lewat requireUser(["super_admin"]); menyembunyikan link
  // agar klien tidak menemui halaman yang pasti gagal.
  { href: "/admin/audit", label: "Audit trail", icon: ClipboardText, ownerOnly: true },
  { href: "/admin/settings", label: "Settings", icon: GearSix, ownerOnly: false },
];

export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const eventPrefix = pathname.match(/^\/e\/[^/]+/)?.[0] ?? "";
  const logicalPathname = eventPrefix ? pathname.slice(eventPrefix.length) || "/" : pathname;
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [eventName, setEventName] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
        if (response.ok) setIsOwner((await response.json()).user?.role === "super_admin");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
      const events = ((await response.json()).events ?? []) as Array<{ slug: string; name: string; status: string }>;
      const cocok = eventSlug
        ? events.find((event) => event.slug === eventSlug)
        : events.filter((event) => event.status === "active").length === 1
          ? events.find((event) => event.status === "active")
          : undefined;
      if (!batal) setEventName(cocok?.name ?? null);
    });
    return () => { batal = true; };
  }, [eventSlug]);

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

  const visibleNavigation = navigation.filter((item) => !item.ownerOnly || isOwner);

  /**
   * Judul top app bar. Diambil dari tabel `navigation` yang sama dengan
   * penyorot menu aktif — daftar judul kedua akan menyimpang pada perubahan
   * pertama, dan judul yang tidak cocok dengan menu yang tersorot membuat orang
   * mengira ia salah halaman.
   *
   * Padanan terpanjang menang: /admin/undian/kontrol harus menjadi "Undian",
   * bukan "Dashboard" hanya karena /admin cocok lebih dulu.
   */
  const currentPage = navigation
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

        {/* Satu-satunya jalan keluar ke pemilih event. Login mendorong SEMUA role ke
            /events, jadi tautan ini tidak dibatasi super_admin; /events sendiri yang
            menyaring event mana yang boleh dilihat.

            Naik ke `surface-container-high` karena drawer-nya sendiri sekarang
            `surface-container` — pada tier yang sama kartunya lenyap. */}
        <Link href="/events" className="m3-state mx-3 flex shrink-0 items-center gap-3 rounded-2xl bg-surface-container-high px-4 py-3">
          <CaretLeft size={16} className="shrink-0 text-on-surface-variant" />
          <span className="min-w-0">
            <span className="block truncate text-body-medium font-semibold">{eventName ?? "Semua event"}</span>
            <span className="mt-0.5 block truncate text-body-small text-on-surface-variant">Ganti event</span>
          </span>
        </Link>

        {/* `min-h-0` WAJIB. Tanpa itu anak flex menolak menyusut di bawah tinggi
            kontennya, <nav> memanjang melewati sidebar, dan penggulirannya tidak
            pernah aktif — persis kegagalan yang sama seperti pada app-shell /rundown.

            `pr-2`, bukan `px-3`: batang gulir menempel di tepi kanan, dan tanpa
            celah ia menempel rapat pada pil item sehingga terbaca sebagai garis
            vertikal kedua di samping tepi drawer. */}
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain py-3 pl-3 pr-2" aria-label="Admin navigation">
          {visibleNavigation.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? logicalPathname === "/admin" : logicalPathname.startsWith(href);
            return (
              <Link
                key={href}
                href={`${eventPrefix}${href}`}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                // Item aktif memakai bentuk pil penuh — itu cara M3 menandai
                // tujuan saat ini di navigasi, dan bentuknya tetap terbaca
                // ketika latar terang membuat perbedaan warnanya menipis.
                // 56px, tinggi item drawer menurut spesifikasi. Sebelumnya 52px —
                // selisih kecil, tetapi dikalikan lima belas item ia menggeser
                // seluruh daftar keluar dari irama vertikal yang sama dengan konten.
                className={`m3-state flex min-h-14 items-center gap-3 px-4 text-label-large font-semibold transition-[border-radius,background-color,color] duration-200 ease-emphasized ${active ? "rounded-full bg-secondary-container text-on-secondary-container" : "rounded-full text-on-surface-variant"}`}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-1 p-3">
          <ThemeToggle compact className="w-full bg-surface-container-high" />
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="m3-state flex min-h-14 w-full items-center gap-3 rounded-full px-4 text-label-large font-semibold text-on-surface-variant disabled:opacity-50"
          >
            <SignOut size={22} />
            {loggingOut ? "Keluar..." : "Logout"}
          </button>
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
          title={currentPage?.label ?? "Admin"}
          // Nama event hanya di layar sempit. Di lg ke atas drawer sudah
          // menampilkannya sebagai kartu besar tepat di sebelah kiri bilah, jadi
          // menuliskannya lagi di sini berarti teks yang sama muncul dua kali
          // bersebelahan.
          subtitle={eventName ?? undefined}
          subtitleClassName="lg:hidden"
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

        {children}
      </div>
    </div>
  );
}
