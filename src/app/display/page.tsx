"use client";

import { Broadcast, ChartLineUp, Crown, DotsSix, EyeSlash, Storefront, Trophy } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

type Entry = { display_name: string; company: string | null; total_spent: number; booth_count: number };
type DisplayConfig = {
  event_title: string;
  headline: string;
  tagline: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  background_image_url: string | null;
  leaderboard_limit: number;
  show_company: boolean;
  show_booth_progress: boolean;
  show_ticker: boolean;
  ticker_text: string | null;
  refresh_seconds: number;
};

const DEFAULT_CONFIG: DisplayConfig = {
  event_title: "Tally Event Transaction Hub",
  headline: "Top spender live",
  tagline: "The room's leaders.",
  background_color: "#101613",
  text_color: "#f7f5ed",
  accent_color: "#a66616",
  background_image_url: null,
  leaderboard_limit: 10,
  show_company: true,
  show_booth_progress: true,
  show_ticker: true,
  ticker_text: null,
  refresh_seconds: 30,
};

const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;

export default function DisplayPage() {
  const [tick, setTick] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [serverEnabled, setServerEnabled] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [config, setConfig] = useState<DisplayConfig>(DEFAULT_CONFIG);

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
      <header className="flex items-center justify-between border-b border-white/15 px-8 py-6 xl:px-14">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center text-black" style={{ backgroundColor: config.accent_color }}><Trophy size={27} weight="fill" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ opacity: 0.5 }}>{config.event_title}</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{config.headline}</h1></div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block"><p className="text-xs uppercase tracking-[0.15em]" style={{ opacity: 0.45 }}>Refresh {tick}</p><p className="mt-1 font-mono text-sm">{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString("id-ID")}` : "Connecting"}</p></div>
          <button onClick={() => setEnabled((value) => !value)} className="flex min-h-12 items-center gap-2 border border-white/20 px-4 text-sm font-semibold hover:bg-white/10">{leaderboardVisible ? <EyeSlash size={20} /> : <Broadcast size={20} />} {leaderboardVisible ? "Hide leaderboard" : "Show leaderboard"}</button>
        </div>
      </header>

      {leaderboardVisible ? <div className={`grid gap-10 px-8 py-10 xl:px-14 xl:py-14 ${config.show_booth_progress ? "xl:grid-cols-[1.4fr_0.6fr]" : ""}`}>
        <section>
          <div className="mb-8 flex items-end justify-between">
            <div><p className="text-xs uppercase tracking-[0.22em]" style={{ color: config.accent_color }}>01 / Leaderboard</p><h2 className="mt-3 text-4xl font-semibold tracking-[-0.06em] xl:text-6xl">{config.tagline}</h2></div>
            <ChartLineUp size={42} weight="duotone" style={{ opacity: 0.35 }} />
          </div>
          <div className="divide-y divide-white/15 border-y border-white/15">
            {entries.map((entry, index) => <div key={`${entry.display_name}-${index}`} className={`grid items-center gap-5 py-6 ${config.show_booth_progress ? "grid-cols-[56px_1fr_auto] xl:grid-cols-[76px_1fr_180px_100px]" : "grid-cols-[56px_1fr_auto] xl:grid-cols-[76px_1fr_200px]"}`}>
              <span className="font-mono text-3xl font-semibold" style={{ color: index === 0 ? config.accent_color : undefined, opacity: index === 0 ? 1 : 0.35 }}>{String(index + 1).padStart(2, "0")}</span>
              <div><p className="text-xl font-semibold xl:text-2xl">{entry.display_name}</p>{config.show_company && entry.company && <p className="mt-1 text-sm" style={{ opacity: 0.5 }}>{entry.company}</p>}</div>
              <p className="hidden text-right font-mono text-lg font-semibold xl:block">{formatRupiah(entry.total_spent)}</p>
              {config.show_booth_progress && <div className="flex items-center justify-end gap-1" aria-label={`${entry.booth_count} booth dikunjungi`}>{Array.from({ length: 6 }).map((_, dot) => <span key={dot} className="size-2.5 rounded-full" style={{ backgroundColor: dot < entry.booth_count ? config.accent_color : "rgba(255,255,255,0.15)" }} />)}</div>}
            </div>)}
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
            <div className="p-5" style={{ backgroundColor: config.background_color }}><p className="font-mono text-4xl font-semibold">{entries.length}</p><p className="mt-2 text-xs uppercase tracking-[0.14em]" style={{ opacity: 0.45 }}>Spender</p></div>
            <div className="p-5" style={{ backgroundColor: config.background_color }}><p className="font-mono text-4xl font-semibold">{entries.reduce((sum, entry) => sum + entry.booth_count, 0)}</p><p className="mt-2 text-xs uppercase tracking-[0.14em]" style={{ opacity: 0.45 }}>Booth visits</p></div>
          </section>
        </aside>}
      </div> : <div className="flex min-h-[70dvh] items-center justify-center px-8 text-center"><div><DotsSix size={64} className="mx-auto" style={{ opacity: 0.2 }} /><h2 className="mt-6 text-4xl font-semibold">Leaderboard sedang disembunyikan.</h2><p className="mt-3" style={{ opacity: 0.45 }}>Sesi presentasi dapat dimulai kembali oleh Admin.</p></div></div>}

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
