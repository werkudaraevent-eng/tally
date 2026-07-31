"use client";

import { MagnifyingGlass, Users, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SeatMapView, type SeatState } from "@/components/seat-map-view";
import { computeSeatMapGeometry, normalizeSeatLabel, type SeatMapConfig } from "@/lib/seat-map";

// Denah tempat duduk publik. Tanpa login, dibuka tamu dari ponsel di lokasi.
//
// Alurnya sengaja pencarian dulu, bukan denah penuh berisi nama: satu-satunya
// pertanyaan tamu adalah "saya duduk di mana", dan itu terjawab tanpa halaman
// ini perlu memajang daftar tamu ke internet.

type SeatInfo = { occupied: boolean; checkedIn: boolean; occupants: string[] };
type SessionInfo = {
  slug: string;
  name: string;
  title: string;
  subtitle: string | null;
  background_color: string;
  text_color: string;
  accent_color: string;
  has_assignments: boolean;
};
type Summary = {
  total_tables: number;
  total_seats: number;
  occupied_seats: number;
  checked_in_seats: number;
  unmatched_labels: number;
};
type MapPayload = {
  published: boolean;
  sessions: { slug: string; name: string }[];
  session: SessionInfo | null;
  config: SeatMapConfig | null;
  seats: Record<string, SeatInfo>;
  summary: Summary | null;
};
type SearchResult = { name: string; seat_labels: string[]; normalized_labels: string[] };

const MIN_QUERY_LENGTH = 3;

export default function SeatMapPage() {
  const [payload, setPayload] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchNote, setSearchNote] = useState("");
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  // Ref, bukan state: dipakai hanya untuk membatalkan permintaan lama dan tidak
  // perlu memicu render.
  const searchAbort = useRef<AbortController | null>(null);

  const loadMap = useCallback(async (slug: string | null) => {
    setLoading(true);
    setFailed(false);
    try {
      const url = slug ? `/api/seat-map?sesi=${encodeURIComponent(slug)}` : "/api/seat-map";
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("gagal");
      const data = (await response.json()) as MapPayload;
      setPayload(data);
      if (data.session) setActiveSlug(data.session.slug);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pemuatan awal ditunda satu tick: memanggil setState langsung di dalam efek
  // memicu render berantai, dan React Compiler menolaknya.
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMap(null); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMap]);

  // Pencarian ditunda sejenak setelah tamu berhenti mengetik. Tanpa ini, setiap
  // huruf memicu satu permintaan dan ratusan tamu mengetik bersamaan saat acara.
  useEffect(() => {
    const trimmed = query.trim();

    // Seluruh perubahan state dijalankan di dalam timer, termasuk pengosongan
    // hasil. Kalau cabang "kata kunci terlalu pendek" mengubah state langsung di
    // badan efek, React Compiler menolaknya sebagai render berantai.
    const timer = window.setTimeout(() => {
      if (trimmed.length < MIN_QUERY_LENGTH) {
        searchAbort.current?.abort();
        setResults(null);
        setSearchNote("");
        setHighlighted([]);
        setSearching(false);
        return;
      }

      searchAbort.current?.abort();
      const controller = new AbortController();
      searchAbort.current = controller;
      setSearching(true);

      const url = `/api/seat-map/search?q=${encodeURIComponent(trimmed)}${activeSlug ? `&sesi=${encodeURIComponent(activeSlug)}` : ""}`;
      void fetch(url, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) {
            setResults([]);
            setSearchNote(data.error?.message ?? "Pencarian gagal.");
            setHighlighted([]);
            return;
          }
          if (data.truncated) {
            setResults([]);
            setSearchNote(data.message ?? "Ketik nama lebih lengkap.");
            setHighlighted([]);
            return;
          }
          const found = (data.results ?? []) as SearchResult[];
          setResults(found);
          setSearchNote(found.length === 0 ? "Nama tidak ditemukan pada sesi ini." : "");
          // Satu hasil langsung disorot supaya tamu tidak perlu menekan apa pun.
          setHighlighted(found.length === 1 ? found[0].normalized_labels : []);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults([]);
          setSearchNote("Pencarian gagal. Coba lagi.");
        })
        .finally(() => setSearching(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query, activeSlug]);

  const seatStates = useMemo(() => {
    const states: Record<string, SeatState> = {};
    for (const [label, info] of Object.entries(payload?.seats ?? {})) {
      states[label] = { occupied: info.occupied, checkedIn: info.checkedIn };
    }
    return states;
  }, [payload?.seats]);

  const session = payload?.session ?? null;
  const background = session?.background_color ?? "#111a63";
  const ink = session?.text_color ?? "#ffffff";
  const accent = session?.accent_color ?? "#f2c14e";

  function switchSession(slug: string) {
    setSelectedTable(null);
    setHighlighted([]);
    setResults(null);
    setSearchNote("");
    setQuery("");
    void loadMap(slug);
  }

  const selectedTableSeats = useMemo(() => {
    const mapConfig = payload?.config;
    const seatInfo = payload?.seats;
    if (selectedTable === null || !mapConfig || !seatInfo) return [];
    // Kursi meja diambil dari geometri, bukan dengan mencocokkan awalan label.
    // Awalan menipu: label "12A" juga berawalan "1", sehingga meja 1 akan
    // menampilkan penghuni meja 12, 13, sampai 17.
    const table = computeSeatMapGeometry(mapConfig).tables.find((item) => item.number === selectedTable);
    if (!table) return [];
    return table.seats.map((seat) => ({
      label: seat.label,
      info: seatInfo[normalizeSeatLabel(seat.label)] ?? null,
    }));
  }, [selectedTable, payload]);

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-6" style={{ background, color: ink }}>
      <div className="mx-auto max-w-[1180px]">
        <header className="text-center">
          {session?.subtitle ? (
            <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-70">{session.subtitle}</p>
          ) : null}
          <h1 className="mt-2 text-balance text-2xl font-bold uppercase leading-tight tracking-wide sm:text-3xl">
            {session?.title ?? "Denah Tempat Duduk"}
          </h1>
        </header>

        {(payload?.sessions.length ?? 0) > 1 ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="Pilih sesi acara">
            {payload?.sessions.map((item) => {
              const active = item.slug === activeSlug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => switchSession(item.slug)}
                  aria-pressed={active}
                  className="min-h-11 border px-4 text-sm font-semibold transition-opacity"
                  style={{
                    borderColor: active ? accent : `${ink}55`,
                    background: active ? accent : "transparent",
                    color: active ? background : ink,
                  }}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {loading ? (
          <p className="mt-10 text-center text-sm opacity-80">Memuat denah…</p>
        ) : failed ? (
          <div className="mt-10 text-center">
            <p className="text-sm opacity-80">Denah gagal dimuat.</p>
            <button
              type="button"
              onClick={() => void loadMap(activeSlug)}
              className="mt-3 min-h-11 border px-5 text-sm font-semibold"
              style={{ borderColor: accent, color: ink }}
            >
              Coba lagi
            </button>
          </div>
        ) : !payload?.published ? (
          <p className="mx-auto mt-10 max-w-md border p-5 text-center text-sm opacity-90" style={{ borderColor: `${ink}44` }}>
            Denah tempat duduk belum dipublikasikan. Silakan cek kembali nanti.
          </p>
        ) : (
          <>
            <div className="mx-auto mt-6 max-w-xl">
              <label htmlFor="seat-search" className="block text-sm font-semibold">
                Cari nama Anda untuk melihat tempat duduk
              </label>
              <div className="relative mt-2">
                <MagnifyingGlass
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: background }}
                />
                <input
                  id="seat-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ketik minimal 3 huruf nama Anda"
                  autoComplete="off"
                  enterKeyHint="search"
                  className="min-h-12 w-full border-0 pl-10 pr-4 text-base outline-none"
                  style={{ background: ink, color: background }}
                  aria-describedby="seat-search-status"
                />
              </div>

              <p id="seat-search-status" aria-live="polite" className="mt-2 min-h-5 text-sm opacity-85">
                {searching ? "Mencari…" : searchNote}
              </p>

              {results && results.length > 0 ? (
                <ul className="space-y-2">
                  {results.map((result) => (
                    <li key={`${result.name}-${result.seat_labels.join()}`}>
                      <button
                        type="button"
                        onClick={() => setHighlighted(result.normalized_labels)}
                        className="flex min-h-12 w-full items-center justify-between gap-3 border px-4 text-left text-sm"
                        style={{ borderColor: `${ink}55` }}
                      >
                        <span className="font-semibold">{result.name}</span>
                        <span className="font-bold" style={{ color: accent }}>
                          {result.seat_labels.join(", ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {highlighted.length > 0 ? (
                <button
                  type="button"
                  onClick={() => { setHighlighted([]); setQuery(""); }}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline"
                  style={{ color: accent }}
                >
                  <X size={16} /> Hapus sorotan
                </button>
              ) : null}
            </div>

            {!session?.has_assignments ? (
              <p className="mx-auto mt-6 max-w-xl border p-4 text-center text-sm opacity-90" style={{ borderColor: `${ink}44` }}>
                Penempatan peserta untuk sesi ini belum tersedia. Denah di bawah menunjukkan tata letak ruangan.
              </p>
            ) : null}

            <div className="mt-6 overflow-x-auto">
              <SeatMapView
                config={payload.config}
                seatStates={seatStates}
                highlightedSeatLabels={highlighted}
                backgroundColor={background}
                textColor={ink}
                accentColor={accent}
                onTableClick={(tableNumber) => setSelectedTable((current) => (current === tableNumber ? null : tableNumber))}
                className="min-w-[820px]"
              />
            </div>

            {payload.summary ? (
              <p className="mt-5 text-center text-sm font-semibold">
                {payload.summary.total_tables} Meja, {payload.summary.total_seats} Kursi
                {session?.has_assignments ? ` · ${payload.summary.occupied_seats} terisi` : ""}
              </p>
            ) : null}

            {selectedTable !== null ? (
              <div className="mx-auto mt-5 max-w-xl border p-4" style={{ borderColor: `${ink}44` }}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-base font-bold">
                    <Users size={18} /> Meja {selectedTable}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSelectedTable(null)}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"
                    style={{ color: accent }}
                  >
                    <X size={16} /> Tutup
                  </button>
                </div>
                {selectedTableSeats.length === 0 ? (
                  <p className="mt-2 text-sm opacity-85">Meja ini tidak ada di denah.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {selectedTableSeats.map(({ label, info }) => (
                      <li key={label} className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{label}</span>
                        <span className="text-right opacity-85">
                          {info ? info.occupants.join(", ") : "Kosong"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </>
        )}

        <p className="mt-8 text-center text-xs opacity-60">
          Nama peserta ditampilkan sebagian untuk menjaga privasi. Cari nama Anda untuk melihat kursi Anda.
        </p>
      </div>
    </main>
  );
}
