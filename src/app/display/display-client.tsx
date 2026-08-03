"use client";

import { Broadcast, ChartLineUp, Crown, DotsSix, EyeSlash, Medal, Storefront, TrendUp, Trophy } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { formatWibTimeWithSeconds } from "@/lib/datetime";
import { DEFAULT_CONFIG, type DisplayConfig } from "@/lib/display-config";

// Peringkat 1-3 mendapat medali; sisanya nomor urut biasa.
const MEDALS = ["#F2C14E", "#C7CDD4", "#C98B5E"] as const;

type Entry = { display_name: string; company: string | null; total_spent: number; booth_count: number };

const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
// Semua jam dipaksa WIB agar tidak ikut timezone device panitia.
const formatWibTime = formatWibTimeWithSeconds;

/**
 * Layar Live Display.
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
  const [config, setConfig] = useState<DisplayConfig>(initialConfig);
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

  const refresh = useCallback(async (limit: number) => {
    const [leaderboardResponse, configResponse] = await Promise.all([
      fetch(`/api/leaderboard?limit=${limit}`, { cache: "no-store" }),
      fetch("/api/display/settings", { cache: "no-store" }),
    ]);
    if (leaderboardResponse.ok) {
      const data = await leaderboardResponse.json();
      setEntries(data.entries ?? []);
      setServerEnabled(data.leaderboard_enabled !== false);
      setLastUpdated(data.updated_at ?? new Date().toISOString());
    }
    if (configResponse.ok) setConfig({ ...DEFAULT_CONFIG, ...(await configResponse.json()) });
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let disposed = false;
    const run = () => { if (!disposed) void refresh(config.leaderboard_limit); };
    run();
    const timer = window.setInterval(run, Math.max(5, config.refresh_seconds) * 1000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [refresh, config.refresh_seconds, config.leaderboard_limit]);

  const leaderboardVisible = enabled && serverEnabled;
  const topEntry = entries[0];
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
          Kelas Tailwind seperti `text-xl` bernilai sama di layar selebar apa pun, dan
          breakpoint terkecil pun tidak menurunkannya lebih jauh. Pada LED portrait
          256x768 akibatnya terukur: judul pecah menjadi 5 baris, header memakan 30%
          tinggi layar, dan isi header melimpah 88px ke samping.

          Label tombol disembunyikan pada layar sempit (ikonnya tetap ada) karena
          tombol itulah penyumbang terbesar limpahan mendatar tersebut. */}
      <header className="flex items-center justify-between gap-x-3 border-b border-white/15 px-4 py-3 sm:px-8 xl:px-14 xl:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div
            className="flex shrink-0 items-center justify-center text-black"
            style={{ backgroundColor: config.accent_color, width: "clamp(26px, 6vw, 40px)", height: "clamp(26px, 6vw, 40px)" }}
          ><Trophy size={22} weight="fill" /></div>
          <div className="min-w-0">
            <p className="font-semibold uppercase" style={{ opacity: 0.5, fontSize: "clamp(8px, 1.7vw, 11px)", letterSpacing: "0.22em" }}>{config.event_title}</p>
            <h1 className="text-balance font-semibold tracking-[-0.04em]" style={{ fontSize: "clamp(13px, 3.2vw, 24px)", lineHeight: 1.15 }}>{config.headline}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden text-right sm:block"><p className="text-xs uppercase tracking-[0.15em]" style={{ opacity: 0.45 }}>Refresh {tick}</p><p className="mt-1 font-mono text-sm">{lastUpdated ? `Update ${formatWibTime(lastUpdated)} WIB` : "Menghubungkan"}</p></div>
          {!chromeHidden && <button onClick={() => setEnabled((value) => !value)} className="flex min-h-12 shrink-0 items-center gap-2 border border-white/20 px-3 text-sm font-semibold hover:bg-white/10 sm:px-4">{leaderboardVisible ? <EyeSlash size={20} /> : <Broadcast size={20} />} <span className="hidden sm:inline">{leaderboardVisible ? "Sembunyikan" : "Tampilkan"}</span></button>}
        </div>
      </header>

      {/* Satu halaman adaptif: side-panel hanya di landscape lebar. Di layar
          portrait panel turun ke bawah agar leaderboard dapat lebar penuh. */}
      {leaderboardVisible ? <div className={`grid gap-6 px-4 py-5 sm:px-8 xl:px-14 xl:py-6 ${config.show_booth_progress ? "xl:landscape:grid-cols-[1.4fr_0.6fr]" : ""}`}>
        <section>
          {/* Tagline hanya dirender jika benar-benar berisi. Skema mewajibkan
              minimal 1 karakter, jadi admin yang ingin menyembunyikannya
              biasanya mengisi "." atau "-" — jangan sisakan ruang untuk itu. */}
          {config.tagline.trim().length > 1 && <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-[-0.05em] xl:text-4xl">{config.tagline}</h2>
            <ChartLineUp size={34} weight="duotone" className="shrink-0" style={{ opacity: 0.3 }} />
          </div>}
          <div className="divide-y divide-white/15 border-y border-white/15">
            <AnimatePresence initial={false}>
              {entries.map((entry, index) => {
                const medal = MEDALS[index];
                return <motion.div
                  key={entry.display_name}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  className={`grid items-center gap-x-2 gap-y-1 sm:gap-x-4 ${index === 0 ? "py-3.5" : "py-3"} grid-cols-[34px_1fr] sm:grid-cols-[52px_1fr] lg:grid-cols-[64px_1fr_auto]`}
                  style={index === 0 ? { background: `linear-gradient(90deg, ${config.accent_color}1f, transparent 65%)` } : undefined}
                >
                  <span className="row-span-2 flex items-center justify-center lg:row-span-1">
                    {medal ? <span className="flex size-10 items-center justify-center rounded-full xl:size-11" style={{ backgroundColor: `${medal}26`, border: `2px solid ${medal}` }}>
                      <Medal size={index === 0 ? 24 : 21} weight="fill" style={{ color: medal }} />
                    </span> : <span className="font-mono text-2xl font-semibold" style={{ opacity: 0.35 }}>{String(index + 1).padStart(2, "0")}</span>}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold" style={{ fontSize: index === 0 ? "clamp(14px, 3.4vw, 30px)" : "clamp(13px, 3vw, 24px)" }}>{entry.display_name}</p>
                    {config.show_company && entry.company && <p className="truncate text-sm" style={{ opacity: 0.5 }}>{entry.company}</p>}
                  </div>
                  {/* Nominal & progress selalu terlihat, termasuk di layar portrait. */}
                  <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end lg:gap-1">
                    <p className="font-mono font-semibold tabular-nums" style={{ fontSize: index === 0 ? "clamp(14px, 3.4vw, 30px)" : "clamp(13px, 3vw, 24px)", ...(index === 0 ? { color: config.accent_color } : {}) }}>{formatRupiah(entry.total_spent)}</p>
                    {config.show_booth_progress && <div className="flex shrink-0 items-center gap-1.5" aria-label={`${entry.booth_count} dari 6 booth dikunjungi`}>
                      {Array.from({ length: 6 }).map((_, dot) => <span key={dot} className="size-2.5 rounded-full transition-colors xl:size-3" style={{ backgroundColor: dot < entry.booth_count ? config.accent_color : "rgba(255,255,255,0.15)" }} />)}
                      {entry.booth_count >= 6 && <Crown size={18} weight="fill" className="ml-1" style={{ color: config.accent_color }} />}
                    </div>}
                  </div>
                </motion.div>;
              })}
            </AnimatePresence>
          </div>
          {entries.length === 0 && <p className="py-16 text-center" style={{ opacity: 0.5 }}>Belum ada transaksi lunas.</p>}
        </section>

        {config.show_booth_progress && <aside className="space-y-8">
          <section className="border border-white/15 p-6">
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: config.accent_color }}>02 / Booth explorer</p>
            <div className="mt-7 flex items-start justify-between">
              <div><p className="text-6xl font-semibold tracking-[-0.08em]">{topEntry?.booth_count ?? 0}<span className="text-2xl" style={{ opacity: 0.35 }}>/6</span></p><p className="mt-2 text-sm" style={{ opacity: 0.55 }}>{topEntry?.display_name ?? "Belum ada peserta"}<br />booth terbanyak</p></div>
              <Crown size={32} weight="duotone" style={{ color: config.accent_color }} />
            </div>
            <div className="mt-6 grid grid-cols-6 gap-2">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex aspect-square items-center justify-center text-xs font-bold text-black" style={{ backgroundColor: index < (topEntry?.booth_count ?? 0) ? config.accent_color : "rgba(255,255,255,0.15)" }}>B{index + 1}</div>)}</div>
          </section>
          <section className="grid grid-cols-2 gap-px bg-white/15">
            <div className="p-5" style={{ backgroundColor: config.background_color }}><TrendUp size={22} weight="duotone" style={{ color: config.accent_color }} /><p className="mt-3 font-mono text-4xl font-semibold">{entries.length}</p><p className="mt-2 text-xs uppercase tracking-[0.14em]" style={{ opacity: 0.45 }}>Spender</p></div>
            <div className="p-5" style={{ backgroundColor: config.background_color }}><Storefront size={22} weight="duotone" style={{ color: config.accent_color }} /><p className="mt-3 font-mono text-4xl font-semibold">{entries.reduce((sum, entry) => sum + entry.booth_count, 0)}</p><p className="mt-2 text-xs uppercase tracking-[0.14em]" style={{ opacity: 0.45 }}>Booth visits</p></div>
          </section>
        </aside>}
      </div> : (
        /* Ukuran memakai `clamp(..., vw, ...)`, sama seperti bagian lain halaman ini.
           Sebelumnya blok ini satu-satunya yang masih memakai ukuran tetap
           (`text-4xl`, `px-8`, ikon 64px). Nilai tetap itu tidak pernah menyusut,
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

      {config.show_ticker && <footer className="fixed inset-x-0 bottom-0 border-t border-white/15 px-8 py-4 xl:px-14" style={{ backgroundColor: config.background_color }}>
        <div className="flex items-center gap-3 text-sm">
          <Broadcast size={18} style={{ color: config.accent_color }} />
          <span style={{ opacity: 0.55 }}>Live database</span>
          <span className="font-semibold">{config.ticker_text?.trim() || "Leaderboard ter-update dari transaksi live"}</span>
          <span className="ml-auto hidden text-xs sm:block" style={{ opacity: 0.35 }}>Refresh {tick} · <Storefront className="inline" size={14} /> Live</span>
        </div>
      </footer>}
    </div>
  </main>;
}
