"use client";

import { Broadcast, ChartLineUp, Crown, DotsSix, EyeSlash, Medal, Storefront, Trophy } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { standard } from "@/lib/m3/motion";
import { useCallback, useEffect, useState } from "react";
import { BrandFooter, BrandLogo } from "@/components/brand-header-footer";
import { fontStack, normalizeBranding, scaleClamp } from "@/lib/branding";
import { formatEventTimeWithSeconds } from "@/lib/datetime";
import { DEFAULT_CONFIG, type DisplayConfig } from "@/lib/display-config";
import type { PublicLeaderboardEntry, StageLayout } from "@/lib/reveal";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

// Peringkat 1-3 mendapat medali; sisanya nomor urut biasa.
const MEDALS = ["#F2C14E", "#C7CDD4", "#C98B5E"] as const;

// Reveal dipoll jauh lebih cepat daripada konfigurasi tampilan.
//
// Konfigurasi (warna, judul) berubah sesekali, jadi `refresh_seconds` bawaan 30
// detik memadai. Tahap reveal ditekan operator tepat saat MC berbicara: menunggu
// sampai 30 detik akan membuat panitia menekan tombolnya berulang karena mengira
// tidak berfungsi. Payload endpoint reveal sengaja dibuat kecil (hanya peringkat
// yang sedang tampil) supaya interval sependek ini tetap murah.
const REVEAL_POLL_MS = 2000;

type Entry = PublicLeaderboardEntry;

const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;

/**
 * Layar Papan peringkat.
 *
 * `initialConfig` datang dari server (lihat `page.tsx`) dan WAJIB dipakai sebagai
 * nilai awal state, bukan `DEFAULT_CONFIG`. Sebelumnya layar selalu mulai dari
 * nilai bawaan lalu memanggil `/api/display/settings` setelah halaman hidup,
 * sehingga penonton melihat judul dan warna bawaan berkelip lebih dulu sebelum
 * berganti ke tampilan yang disetel panitia. Pada layar proyektor kelipan itu
 * sangat kentara.
 *
 * State tetap dipertahankan karena konfigurasi bisa diubah admin saat acara
 * berjalan; `refresh` akan menimpanya pada siklus berikutnya.
 */
export default function DisplayClient({ initialConfig }: { initialConfig: DisplayConfig }) {
  const [tick, setTick] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [serverEnabled, setServerEnabled] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  // Keadaan reveal. `staged` false berarti perilaku lama: seluruh top N tampil
  // live tanpa tahap, dan seluruh cabang render di bawah ini dilewati.
  const [staged, setStaged] = useState(false);
  const [stage, setStage] = useState(0);
  const [stageLabel, setStageLabel] = useState<string | null>(null);
  const [layout, setLayout] = useState<StageLayout>("list");
  const [config, setConfig] = useState<DisplayConfig>(initialConfig);
  // Zona acara datang bersama /api/display/settings yang sudah disegarkan berkala,
  // jadi zona yang diubah admin saat acara berjalan ikut terpakai tanpa ada yang
  // perlu memuat ulang layar di panggung.
  const [timeZone, setTimeZone] = useState<EventTimeZone>(DEFAULT_TIME_ZONE);
  // Spec 7.3: mode fullscreen lewat ?fullscreen=1 — sembunyikan kontrol operator
  // agar layar proyektor bersih. Dibaca sekali saat mount (lazy initializer)
  // supaya tidak memanggil setState di dalam effect.
  const [chromeHidden] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fullscreen") === "1");

  // Browser hanya mengizinkan fullscreen setelah gesture pengguna.
  useEffect(() => {
    if (!chromeHidden) return;
    const request = () => { void document.documentElement.requestFullscreen?.().catch(() => undefined); document.removeEventListener("click", request); };
    document.addEventListener("click", request);
    return () => document.removeEventListener("click", request);
  }, [chromeHidden]);

  /**
   * Muat papan dan keadaan tahap.
   *
   * Layar TIDAK lagi memanggil `/api/leaderboard`, melainkan
   * `/api/display/reveal` — endpoint itu sudah mengembalikan seluruh top N ketika
   * mode reveal mati, jadi perilaku lama tetap utuh dengan satu jalur data saja.
   *
   * Alasannya bukan kerapian: kalau papan penuh diambil di sini lalu dipotong di
   * browser, seluruh peringkat sudah ada di tab Network sebelum MC menyebutnya.
   * Panitia yang membuka /display di laptopnya sendiri akan melihat pemenang
   * lebih dulu. Pemotongan karena itu wajib dikerjakan server.
   *
   * `leaderboard_limit` juga tidak lagi dikirim sebagai query: server membacanya
   * langsung dari `display_settings`, sehingga tidak ada lagi timer yang perlu
   * di-restart hanya karena admin mengubah kedalaman papan.
   */
  const refreshBoard = useCallback(async () => {
    const response = await fetch("/api/display/reveal", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setEntries(data.entries ?? []);
    setStaged(data.mode === "staged");
    setStage(Number(data.stage) || 0);
    setStageLabel(data.stage_label ?? null);
    setLayout(data.layout === "spotlight" ? "spotlight" : "list");
    setServerEnabled(data.leaderboard_enabled !== false);
    setLastUpdated(data.updated_at ?? new Date().toISOString());
    setTick((value) => value + 1);
  }, []);

  const refreshConfig = useCallback(async () => {
    const response = await fetch("/api/display/settings", { cache: "no-store" });
    if (!response.ok) return;
    const raw = (await response.json()) as Record<string, unknown>;
    // Branding dinormalisasi ulang di sini, bukan hanya di server.
    //
    // Konfigurasi awal datang dari `page.tsx` yang sudah menormalkannya, tapi
    // penyegaran berkala ini mengambil langsung dari endpoint. Kolom skala
    // bertipe `numeric` dan dikirim sebagai string demi menjaga presisi; tanpa
    // langkah ini layar tampil benar saat dibuka lalu rusak pada siklus refresh
    // pertama — persis ketika tidak ada yang sedang menonton monitornya.
    setConfig({ ...DEFAULT_CONFIG, ...(raw as Partial<DisplayConfig>), ...normalizeBranding(raw) });
    setTimeZone(normalizeTimeZone(raw.time_zone));
  }, []);

  // Dua timer terpisah, bukan satu.
  //
  // Papan dan tahap harus mengejar tombol operator (2 detik), sedangkan
  // konfigurasi tampilan tidak perlu sesering itu. Menyatukannya berarti memilih
  // salah satu: 30 detik membuat tombol reveal terasa rusak, sementara 2 detik
  // untuk keduanya melipatgandakan permintaan setting tanpa alasan.
  useEffect(() => {
    let disposed = false;
    const run = () => { if (!disposed) void refreshBoard(); };
    run();
    const timer = window.setInterval(run, REVEAL_POLL_MS);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [refreshBoard]);

  useEffect(() => {
    let disposed = false;
    const run = () => { if (!disposed) void refreshConfig(); };
    run();
    const timer = window.setInterval(run, Math.max(5, config.refresh_seconds) * 1000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [refreshConfig, config.refresh_seconds]);

  const leaderboardVisible = enabled && serverEnabled;
  // Tahap 0 berarti reveal sudah aktif tapi belum ada peringkat yang dibuka:
  // header dan tagline tetap tampil, area daftar diganti penanda.
  const awaitingFirstStage = staged && stage === 0;
  const spotlight = staged && layout === "spotlight";
  // Penyebut progress booth. Dulu ditulis mati sebagai 6 di empat tempat, jadi
  // saat panitia menambah booth ketujuh papan tetap menggambar enam titik dan
  // peserta yang sudah keliling sembilan booth terlihat baru enam.
  const boothCodes = config.active_booth_codes;
  const boothTotal = boothCodes.length;
  // Nol berarti daftarnya gagal dimuat, bukan "acara tanpa booth" (acara tanpa
  // booth tidak punya leaderboard sama sekali). Panel disembunyikan daripada
  // menampilkan "2/0" atau barisan titik kosong.
  const boothProgressVisible = config.show_booth_progress && boothTotal > 0;
  // Panel samping ikut mati selama reveal karena angkanya dihitung dari papan
  // yang saat itu hanya sebagian (alasan lengkap di dekat tempat render-nya).
  const asideVisible = boothProgressVisible && !staged;
  // Ukuran spotlight jauh lebih besar, tapi tetap lewat clamp() berbasis vw dan
  // BUKAN kelas ukuran tetap seperti `text-6xl`. Kelas Tailwind bernilai sama di
  // layar selebar apa pun, dan LED portrait 256px di lokasi akan membuat satu
  // nama pemenang melimpah keluar layar — kesalahan yang justru paling terlihat
  // pada momen paling penting.
  const nameSize = (lead: boolean) => spotlight
    ? "clamp(18px, 5.6vw, 58px)"
    : lead ? "clamp(14px, 3.4vw, 30px)" : "clamp(13px, 3vw, 24px)";
  const medalBox = spotlight ? "clamp(38px, 8vw, 68px)" : "clamp(40px, 4vw, 44px)";
  // Titik progress menyusut mengikuti JUMLAH booth, bukan ukuran tetap.
  //
  // Dengan 6 booth ukuran tetap masih muat di LED portrait 256px, dengan 9 tidak:
  // sembilan titik memakan 138px dan bersama nominal (84px) melebihi lebar layar,
  // sehingga halaman melebar dan tidak ada yang bisa menggeser proyektor.
  // Pembaginya `boothTotal` supaya ruang yang dipakai kira-kira tetap berapa pun
  // booth yang ditambahkan panitia. Batas bawah 6px menjaga titik tetap terlihat.
  const dotSize = boothTotal > 0
    ? `clamp(6px, ${(spotlight ? 9 : 6.5) / boothTotal}vw, ${spotlight ? 16 : 12}px)`
    : "0px";
  /**
   * Peserta dengan booth TERBANYAK. Bukan `entries[0]`.
   *
   * `entries[0]` adalah peringkat 1 menurut BELANJA — itu urutan `get_leaderboard`.
   * Panel ini berlabel "booth terbanyak", jadi memakai entri pertama membuat
   * labelnya berbohong setiap kali peserta terboros bukan yang paling rajin
   * keliling. Saat ini keduanya kebetulan orang yang sama, sehingga kesalahannya
   * tidak terlihat sampai ada peserta lain yang menyusul jumlah boothnya — persis
   * di tengah acara, di depan penonton.
   *
   * Seri diputus oleh urutan papan (belanja tertinggi menang) karena `reduce`
   * hanya menggantikan pada `>`, bukan `>=`. Itu aturan yang bisa dijelaskan.
   */
  const topBoothEntry = entries.reduce<Entry | undefined>(
    (best, entry) => (best === undefined || entry.booth_count > best.booth_count ? entry : best),
    undefined,
  );
  /**
   * Jumlah kolom kotak booth: pembagian paling rata yang barisnya tidak menggantung.
   *
   * Membatasi pada 6 kolom saja membuat 9 booth menjadi 6+3, dan tiga kotak yatim
   * di bawah baris penuh terbaca sebagai tata letak yang belum selesai. Mencari
   * pembagi yang habis lebih dulu memberi 3x3 untuk 9, 4x2 untuk 8, 5x2 untuk 10.
   *
   * Batas 3..6: di bawah 3 kotaknya terlalu lebar untuk panel samping, di atas 6
   * terlalu sempit untuk kode tiga huruf seperti DSP.
   */
  const boothColumns = (() => {
    if (boothTotal <= 6) return Math.max(boothTotal, 1);
    for (const columns of [6, 5, 4, 3]) if (boothTotal % columns === 0) return columns;
    return 5;
  })();
  const mainStyle = {
    backgroundColor: config.background_color,
    color: config.text_color,
    backgroundImage: config.background_image_url ? `url(${config.background_image_url})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as const;

  return <main className="min-h-dvh" style={mainStyle}>
    <div className="min-h-dvh" style={{ background: config.background_image_url ? "rgba(0,0,0,0.55)" : "transparent" }}>
      {/* Ukuran huruf dan padding memakai `clamp(..., vw, ...)`, bukan ukuran tetap.
          Kelas Tailwind seperti `text-title-large` bernilai sama di layar selebar apa pun, dan
          breakpoint terkecil pun tidak menurunkannya lebih jauh. Pada LED portrait
          256x768 akibatnya terukur: judul pecah menjadi 5 baris, header memakan 30%
          tinggi layar, dan isi header melimpah 88px ke samping.

          Label tombol disembunyikan pada layar sempit (ikonnya tetap ada) karena
          tombol itulah penyumbang terbesar limpahan mendatar tersebut. */}
      <header className="flex items-center justify-between gap-x-3 border-b border-white/15 px-4 py-3 sm:px-8 xl:px-14 xl:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {/* Logo MENGGANTIKAN lencana trofi, bukan berdiri di sampingnya.
              Keduanya menempati peran yang sama (penanda visual paling kiri), dan
              menampilkan dua-duanya membuat header padat serta mendorong judul
              makin sempit di layar kecil. Tanpa logo, lencana trofi tetap tampil
              seperti sebelumnya. */}
          {config.logo_url
            ? <BrandLogo branding={config} variant="compact" centered={false} />
            : <div
                className="flex shrink-0 items-center justify-center text-black"
                style={{ backgroundColor: config.accent_color, width: "clamp(26px, 6vw, 40px)", height: "clamp(26px, 6vw, 40px)" }}
              ><Trophy size={22} weight="fill" /></div>}
          <div className="min-w-0">
            {/* Ukuran dan warna mengikuti setelan CMS. Skala 1 dan warna null
                menghasilkan nilai yang identik dengan kode sebelumnya, jadi layar
                yang belum ditata tampil sama persis. */}
            <p
              className="font-semibold uppercase"
              style={{
                fontFamily: fontStack(config.heading_font),
                opacity: config.subtitle_color ? 1 : 0.5,
                color: config.subtitle_color ?? undefined,
                fontSize: scaleClamp("clamp(8px, 1.7vw, 11px)", config.subtitle_scale),
                letterSpacing: "0.22em",
              }}
            >{config.event_title}</p>
            <h1
              className="text-balance font-semibold tracking-[-0.04em]"
              style={{
                fontFamily: fontStack(config.heading_font),
                fontSize: scaleClamp("clamp(13px, 3.2vw, 24px)", config.title_scale),
                lineHeight: 1.15,
                color: config.title_color ?? undefined,
              }}
            >{config.headline}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden text-right sm:block"><p className="text-body-small uppercase tracking-[0.15em]" style={{ opacity: 0.45 }}>Refresh {tick}</p><p className="mt-1 font-mono text-body-medium">{lastUpdated ? `Update ${formatEventTimeWithSeconds(lastUpdated, timeZone)} ${timeZoneAbbr(timeZone)}` : "Menghubungkan"}</p></div>
          {!chromeHidden && <button onClick={() => setEnabled((value) => !value)} className="rounded-md flex min-h-12 shrink-0 items-center gap-2 border border-white/20 px-3 text-body-medium font-semibold hover:bg-white/10 sm:px-4">{leaderboardVisible ? <EyeSlash size={20} /> : <Broadcast size={20} />} <span className="hidden sm:inline">{leaderboardVisible ? "Sembunyikan" : "Tampilkan"}</span></button>}
        </div>
      </header>

      {/* Satu halaman adaptif: side-panel hanya di landscape lebar. Di layar
          portrait panel turun ke bawah agar leaderboard dapat lebar penuh.

          Panel booth explorer DIMATIKAN selama reveal bertahap. Isinya dihitung
          dari `entries` yang saat itu hanya memuat sebagian papan, sehingga
          "booth terbanyak" akan menunjuk peserta teratas dari potongan yang
          sedang tampil — pada tahap "4-10" itu berarti peringkat 4 diberi label
          juara booth, dan jumlah "Spender" menampilkan 7 alih-alih total
          sebenarnya. Angka yang salah di layar proyektor lebih buruk daripada
          panel yang absen, dan absennya justru memberi papan lebar penuh untuk
          ceremony. */}
      {leaderboardVisible ? <div className={`grid gap-6 px-4 py-5 sm:px-8 xl:px-14 xl:py-6 ${asideVisible ? "xl:landscape:grid-cols-[1.4fr_0.6fr]" : ""}`}>
        <section>
          {/* Tagline hanya dirender jika benar-benar berisi. Skema mewajibkan
              minimal 1 karakter, jadi admin yang ingin menyembunyikannya
              biasanya mengisi "." atau "-" — jangan sisakan ruang untuk itu. */}
          {(config.tagline.trim().length > 1 || (staged && stageLabel)) && <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="text-headline-small font-semibold tracking-[-0.05em] xl:text-display-small">{config.tagline.trim().length > 1 ? config.tagline : stageLabel}</h2>
            {/* Label tahap ikut tampil agar penonton tahu potongan mana yang
                sedang dibuka — pada tahap "4-10" papan dimulai dari nomor 4 dan
                tanpa keterangan itu terlihat seperti tiga besar yang hilang. */}
            {staged && stageLabel && config.tagline.trim().length > 1
              ? <span className="rounded-sm shrink-0 border px-3 py-1 text-body-medium font-semibold uppercase tracking-[0.14em]" style={{ borderColor: config.accent_color, color: config.accent_color }}>{stageLabel}</span>
              : <ChartLineUp size={34} weight="duotone" className="shrink-0" style={{ opacity: 0.3 }} />}
          </div>}

          {awaitingFirstStage ? (
            /* Tahap 0: reveal sudah aktif tapi belum ada peringkat yang dibuka.
               Ukuran memakai clamp() berbasis viewport seperti sisa halaman ini,
               supaya pesan tetap muat di LED portrait sempit. */
            <div className="flex items-center justify-center border-y border-white/15" style={{ minHeight: "clamp(160px, 42dvh, 520px)", padding: "0 clamp(12px, 4vw, 32px)" }}>
              <div className="max-w-[30ch] text-center">
                <Trophy className="mx-auto" weight="duotone" style={{ color: config.accent_color, opacity: 0.6, width: "clamp(32px, 10vw, 72px)", height: "clamp(32px, 10vw, 72px)" }} />
                <p className="text-balance font-semibold" style={{ marginTop: "clamp(10px, 2.5vw, 20px)", fontSize: "clamp(15px, 4.4vw, 34px)", lineHeight: 1.2 }}>Pengumuman top spender segera dimulai.</p>
              </div>
            </div>
          ) : <div className="divide-y divide-white/15 border-y border-white/15">
            <AnimatePresence initial={false}>
              {entries.map((entry) => {
                // Medali dan penyorotan mengikuti PERINGKAT ASLI, bukan posisi
                // dalam array. Pada tahap "4-10" baris pertama berindeks 0, dan
                // memakai indeks akan memberi medali emas kepada peringkat 4 —
                // tepat di depan penonton yang baru melihat juara sebenarnya.
                const rank = Number(entry.rank);
                const medal = MEDALS[rank - 1];
                const lead = rank === 1;
                // Keberadaan nilainya, bukan setelan CMS-nya. Alasan lengkap ada di
                // dekat blok yang memakainya.
                const amountVisible = entry.total_spent !== undefined;
                return <motion.div
                  key={`${entry.display_name}__${rank}`}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  // Skema tenang, bukan ekspresif: baris ini berpindah setiap kali ada
                  // order masuk, sepanjang acara. Pantulan yang menyenangkan sekali
                  // menjadi gangguan pada kali kelima puluh.
                  transition={standard.spatial.default}
                  className="grid items-center gap-x-2 gap-y-1 sm:gap-x-4 grid-cols-[34px_1fr] sm:grid-cols-[52px_1fr] lg:grid-cols-[64px_1fr_auto]"
                  style={{
                    paddingBlock: spotlight ? "clamp(14px, 3.4vw, 40px)" : lead ? "14px" : "12px",
                    ...(lead ? { background: `linear-gradient(90deg, ${config.accent_color}1f, transparent 65%)` } : {}),
                  }}
                >
                  <span className="row-span-2 flex items-center justify-center lg:row-span-1">
                    {medal ? <span className="flex items-center justify-center rounded-full" style={{ backgroundColor: `${medal}26`, border: `2px solid ${medal}`, width: medalBox, height: medalBox }}>
                      <Medal size={spotlight ? 34 : lead ? 24 : 21} weight="fill" style={{ color: medal }} />
                    </span> : <span className="font-mono font-semibold" style={{ opacity: 0.35, fontSize: spotlight ? "clamp(20px, 5vw, 44px)" : "clamp(18px, 3vw, 24px)" }}>{String(rank).padStart(2, "0")}</span>}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold" style={{ fontSize: nameSize(lead) }}>{entry.display_name}</p>
                    {config.show_company && entry.company && <p className="truncate" style={{ opacity: 0.5, fontSize: spotlight ? "clamp(11px, 2.4vw, 22px)" : "clamp(11px, 1.6vw, 14px)" }}>{entry.company}</p>}
                  </div>
                  {/* Nominal & progress selalu terlihat, termasuk di layar portrait.

                      Wrapper-nya TIDAK dirender bila kedua isinya mati. Di lg kolom
                      `auto` memang menyusut sendiri, tapi di portrait div ini turun ke
                      baris kedua grid dan menyisakan `gap-y-1` untuk baris yang tidak
                      berisi apa pun — celah yang tampak seperti bug tata letak, bukan
                      seperti kolom yang sengaja dimatikan.

                      `amountVisible` memeriksa `total_spent !== undefined`, bukan
                      `config.show_amount`. Nominal memang DIHAPUS dari response saat
                      toggle mati (lihat /api/display/reveal), jadi keberadaan nilainya
                      adalah sumber yang benar. Membaca config di sini akan salah tampil
                      selama satu putaran polling setelah admin mengubah toggle: kedua
                      nilai datang dari dua permintaan berbeda dengan selang berbeda
                      (2 detik untuk reveal, 30 detik untuk settings), sehingga config
                      masih bilang "tampilkan" sementara angkanya sudah tidak ada —
                      dan yang tampil di proyektor adalah "Rp NaN". */}
                  {(amountVisible || boothProgressVisible) && <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end lg:gap-1">
                    {amountVisible && <p className="font-mono font-semibold tabular-nums" style={{ fontSize: nameSize(lead), ...(lead ? { color: config.accent_color } : {}) }}>{formatRupiah(entry.total_spent ?? 0)}</p>}
                    {boothProgressVisible && <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5" aria-label={`${entry.booth_count} dari ${boothTotal} booth dikunjungi`}>
                      {boothCodes.map((code, dot) => <span key={code} className="shrink-0 rounded-full transition-colors" style={{ width: dotSize, height: dotSize, backgroundColor: dot < entry.booth_count ? config.accent_color : "rgba(255,255,255,0.15)" }} />)}
                      {entry.booth_count >= boothTotal && <Crown size={spotlight ? 26 : 18} weight="fill" className="ml-1 shrink-0" style={{ color: config.accent_color }} />}
                    </div>}
                  </div>}
                </motion.div>;
              })}
            </AnimatePresence>
          </div>}
          {!awaitingFirstStage && entries.length === 0 && <p className="py-16 text-center" style={{ opacity: 0.5 }}>Belum ada transaksi lunas.</p>}
        </section>

        {asideVisible && <aside>
          <section className="rounded-lg border border-white/15 p-6">
            <p className="text-body-small uppercase tracking-[0.2em]" style={{ color: config.accent_color }}>02 / Booth explorer</p>
            {/* `items-baseline`, bukan dua ukuran font yang ditumpuk begitu saja.
                Sebelumnya "2" (text-display-large) dan "/9" (text-headline-small) berada di flow yang
                sama tanpa penyelarasan, sehingga penyebutnya duduk di tengah
                tinggi angka besar dan terbaca seperti pecahan miring, bukan
                "2 dari 9". */}
            <div className="mt-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-baseline gap-1 font-semibold leading-none tracking-[-0.06em]">
                  <span className="text-display-large">{topBoothEntry?.booth_count ?? 0}</span>
                  <span className="text-headline-small" style={{ opacity: 0.4 }}>/ {boothTotal}</span>
                </p>
                <p className="mt-3 truncate text-body-medium font-semibold">{topBoothEntry?.display_name ?? "Belum ada peserta"}</p>
                <p className="mt-0.5 text-body-small uppercase tracking-[0.14em]" style={{ opacity: 0.45 }}>Booth terbanyak</p>
              </div>
              <Crown size={32} weight="duotone" className="shrink-0" style={{ color: config.accent_color }} />
            </div>
            {/* Kolom dipilih supaya baris terakhir tidak menggantung. Dengan 6
                kolom, sembilan booth menjadi 6+3 dan tiga kotak yatim di bawah
                baris penuh terlihat seperti tata letak yang belum selesai.
                `boothColumns` mencari pembagian paling rata (9 -> 3x3).

                Tinggi tetap, BUKAN aspect-square. Kotak persegi memaksa lebar
                kolom menentukan tingginya, jadi menambah booth membuat kotak
                mengecil ke dua arah sekaligus dan kode tiga huruf seperti DSP
                tidak lagi terbaca dari jarak proyektor. */}
            <div className="mt-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${boothColumns}, minmax(0, 1fr))` }}>{boothCodes.map((code, index) => {
              const visited = index < (topBoothEntry?.booth_count ?? 0);
              return <div key={code} className="flex h-10 items-center justify-center truncate px-1 text-body-small font-bold tracking-[0.04em]" style={{ backgroundColor: visited ? config.accent_color : "rgba(255,255,255,0.1)", color: visited ? "#000" : "rgba(255,255,255,0.55)" }}>{code}</div>;
            })}</div>
          </section>
          {/* Panel statistik "Spender" dan "Booth visits" DIHAPUS, bukan
              dipindahkan.

              Keduanya dihitung dari `entries`, yang isinya hanya sedalam
              `leaderboard_limit`. Jadi "Spender" tidak pernah menampilkan jumlah
              peserta yang bertransaksi melainkan panjang papan — 9 di layar
              padahal ratusan orang sudah belanja — dan "Booth visits" hanya
              menjumlahkan kunjungan sepuluh besar, bukan kunjungan seluruh acara.
              Angka yang salah di proyektor lebih buruk daripada angka yang absen,
              dan tidak ada yang bisa menjelaskannya kalau ada yang bertanya.

              Memperbaikinya butuh agregat sendiri di server. Itu fitur baru,
              bukan penataan ulang tampilan, jadi tidak dikerjakan di sini. */}
        </aside>}
      </div> : (
        /* Ukuran memakai `clamp(..., vw, ...)`, sama seperti bagian lain halaman ini.
           Sebelumnya blok ini satu-satunya yang masih memakai ukuran tetap
           (`text-display-small`, `px-8`, ikon 64px). Nilai tetap itu tidak pernah menyusut,
           jadi pada LED portrait 256px kata "disembunyikan" lebih lebar dari ruang
           yang tersedia dan terpotong di kedua sisi.

           `break-words` dipasang sebagai jaring pengaman: "disembunyikan" adalah satu
           kata panjang yang tidak punya titik potong alami, jadi pada lebar ekstrem
           ia tetap harus boleh dipatah daripada melimpah keluar layar. */
        <div className="flex min-h-[70dvh] items-center justify-center text-center" style={{ padding: "0 clamp(12px, 4vw, 32px)" }}>
          {/* 34ch kira-kira sepanjang kalimatnya sendiri, jadi pada layar lebar ia
              tetap satu baris seperti sebelumnya. Batas yang lebih ketat akan
              memaksa pesan ini pecah dua baris di LED landscape besar, padahal di
              sana ruangnya justru berlimpah. */}
          <div className="max-w-[34ch]">
            <DotsSix className="mx-auto" style={{ opacity: 0.2, width: "clamp(28px, 9vw, 64px)", height: "clamp(28px, 9vw, 64px)" }} />
            <h2
              className="text-balance break-words font-semibold"
              style={{ marginTop: "clamp(12px, 3vw, 24px)", fontSize: "clamp(15px, 5vw, 36px)", lineHeight: 1.2 }}
            >Leaderboard sedang disembunyikan.</h2>
            <p style={{ opacity: 0.45, marginTop: "clamp(6px, 1.6vw, 12px)", fontSize: "clamp(11px, 2.6vw, 16px)", lineHeight: 1.4 }}>
              Sesi presentasi dapat dimulai kembali oleh Admin.
            </p>
          </div>
        </div>
      )}

      {/* Footer tampil bila ticker menyala ATAU ada blok sponsor.
          Sebelumnya syaratnya hanya `show_ticker`; kalau dibiarkan begitu, panitia
          yang mematikan ticker akan kehilangan blok sponsornya tanpa penjelasan,
          padahal keduanya setelan yang tidak berhubungan. */}
      {(config.show_ticker || config.footer_image_url || config.footer_text) && <footer className="fixed inset-x-0 bottom-0 border-t border-white/15 px-8 py-4 xl:px-14" style={{ backgroundColor: config.background_color }}>
        {/* Blok sponsor di ATAS baris ticker: sponsor adalah isi yang dilihat
            penonton, sedangkan baris ticker lebih dekat ke penanda status sistem. */}
        <BrandFooter branding={config} textColor={config.text_color} variant="compact" className={config.show_ticker ? "mb-3" : ""} />
        {config.show_ticker && <div className="flex items-center gap-3 text-body-medium">
          <Broadcast size={18} style={{ color: config.accent_color }} />
          <span style={{ opacity: 0.55 }}>Live database</span>
          <span className="font-semibold">{config.ticker_text?.trim() || "Leaderboard ter-update dari transaksi live"}</span>
          <span className="ml-auto hidden text-body-small sm:block" style={{ opacity: 0.35 }}>Refresh {tick} · <Storefront className="inline" size={14} /> Live</span>
        </div>}
      </footer>}
    </div>
  </main>;
}
