"use client";

import { MagnifyingGlass, Users, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SeatMapLedView } from "@/components/seat-map-led-view";
import { SeatMapView, type SeatState } from "@/components/seat-map-view";
import { computeSeatMapGeometry, normalizePublicViewMode, normalizeSeatLabel, type PublicViewMode, type SeatMapConfig } from "@/lib/seat-map";
import { formatWibTimeWithSeconds } from "@/lib/datetime";

// Denah tempat duduk publik. Tanpa login, dibuka tamu dari ponsel di lokasi.
//
// Ada dua mode dengan alasan yang berbeda:
//
//   * `search` — layar sentuh atau HP tamu. Pencarian lebih dulu, bukan denah
//     penuh berisi nama: pertanyaan tamu hanya "saya duduk di mana", dan itu
//     terjawab tanpa memajang daftar tamu ke internet.
//   * `qr` — LED publik tanpa sentuh. Tidak ada yang bisa mengetik, jadi layar
//     menampilkan QR dan pencarian pindah ke HP tamu.
//
// Mode diambil dari CMS, dan bisa ditimpa per layar lewat `?mode=`. Penimpa itu
// yang memungkinkan satu acara menjalankan LED dan layar sentuh berdampingan
// tanpa keduanya berebut satu setelan.

type SeatInfo = { occupied: boolean; checkedIn: boolean; occupants: string[] };
type SessionInfo = {
  slug: string;
  name: string;
  title: string;
  subtitle: string | null;
  background_color: string;
  text_color: string;
  accent_color: string;
  background_image_url: string | null;
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
  public_view_mode?: PublicViewMode;
};
type SearchResult = { name: string; seat_labels: string[]; normalized_labels: string[] };

const MIN_QUERY_LENGTH = 3;

// LED biasanya dipasang dan ditinggal, jadi datanya disegarkan sendiri. Satu
// menit cukup: yang berubah hanya keterisian kursi, bukan tata letaknya.
const LED_REFRESH_MS = 60000;

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
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  // Penimpa mode per layar, dibaca sekali saat mount. Dipakai untuk menyetel
  // satu LED ke mode qr tanpa mengubah setelan layar lain.
  const [modeOverride] = useState<PublicViewMode | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("mode");
    return raw === "qr" || raw === "search" ? raw : null;
  });

  // Agenda yang dipatok lewat URL, juga dibaca sekali saat mount.
  //
  // Tanpa ini halaman selalu jatuh ke agenda pertama, sehingga LED yang dipasang
  // untuk sesi malam tetap menampilkan judul dan warna sesi pagi. Layar yang
  // sudah terpasang di dinding tidak bisa diklik untuk berpindah agenda, jadi
  // alamatnya harus bisa menentukan agenda mana yang tampil.
  const [slugFromUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("sesi")?.trim();
    return raw && /^[a-z0-9-]{2,40}$/.test(raw) ? raw : null;
  });

  // Ref, bukan state: dipakai hanya untuk membatalkan permintaan lama dan tidak
  // perlu memicu render.
  const searchAbort = useRef<AbortController | null>(null);

  const loadMap = useCallback(async (slug: string | null, options?: { silent?: boolean }) => {
    // Penyegaran berkala di LED berjalan diam-diam. Menyalakan status memuat
    // setiap menit akan membuat layar berkedip sepanjang acara.
    if (!options?.silent) setLoading(true);
    try {
      const url = slug ? `/api/seat-map?sesi=${encodeURIComponent(slug)}` : "/api/seat-map";
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("gagal");
      const data = (await response.json()) as MapPayload;
      setPayload(data);
      setLastLoadedAt(formatWibTimeWithSeconds(new Date().toISOString()));
      setFailed(false);
      if (data.session) setActiveSlug(data.session.slug);
    } catch {
      // Kegagalan pada penyegaran diam tidak boleh mengosongkan layar. LED tidak
      // punya siapa pun yang bisa menekan "Coba lagi", jadi data terakhir yang
      // berhasil dimuat tetap ditampilkan sampai jaringan pulih.
      if (!options?.silent) setFailed(true);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  // Pemuatan awal ditunda satu tick: memanggil setState langsung di dalam efek
  // memicu render berantai, dan React Compiler menolaknya.
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMap(slugFromUrl); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMap, slugFromUrl]);

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
  // Null berarti admin memilih warna solid. `background_color` tetap dipasang di
  // belakang gambar, bukan digantikan olehnya: gambar bisa gagal dimuat di LED
  // yang jaringannya buruk, dan latar putih polos akan membuat teks putih hilang.
  const backgroundImage = session?.background_image_url ?? null;
  // Overlay gelap di atas gambar. Tanpa ini teks dan nomor meja bertabrakan dengan
  // bagian gambar yang terang. Nilainya sama dengan Live Display supaya kedua layar
  // di ruangan yang sama tidak terlihat memakai aturan berbeda.
  const imageOverlay = backgroundImage ? "rgba(0,0,0,0.55)" : "transparent";

  // Penimpa lewat URL menang atas setelan CMS. Layar yang sudah dipasang di
  // dinding tidak bisa diubah dari jauh, jadi alamatnya harus bisa memaksa mode.
  const effectiveMode: PublicViewMode = modeOverride ?? normalizePublicViewMode(payload?.public_view_mode);

  // LED dipasang lalu ditinggal, jadi ia menyegarkan datanya sendiri. Hanya di
  // mode qr: di mode pencarian, memuat ulang saat tamu sedang mengetik akan
  // menghapus sorotan yang baru dia temukan.
  useEffect(() => {
    if (effectiveMode !== "qr") return;
    const interval = window.setInterval(() => {
      void loadMap(activeSlug, { silent: true });
    }, LED_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [effectiveMode, activeSlug, loadMap]);

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

  // Mode LED punya tata letak sendiri, bukan variasi dari halaman pencarian.
  // Dipisah lebih awal supaya tidak ada elemen interaktif yang ikut terbawa ke
  // layar yang tidak bisa disentuh.
  //
  // Ditahan sampai data pertama berhasil dimuat: LED yang menampilkan denah
  // kosong sesaat lalu berubah akan terlihat seperti alat yang rusak.
  if (effectiveMode === "qr") {
    if (!payload?.published || !session) {
      return (
        <main className="flex min-h-dvh items-center justify-center px-6 text-center" style={{ background, color: ink }}>
          <p style={{ fontSize: "clamp(16px, 2.6vmin, 44px)", opacity: 0.85 }}>
            {loading || !payload ? "Menyiapkan denah…" : "Denah tempat duduk belum dipublikasikan."}
          </p>
        </main>
      );
    }
    return (
      <SeatMapLedView
        config={payload.config}
        seatStates={seatStates}
        summary={payload.summary}
        sessionSlug={session.slug}
        title={session.title}
        subtitle={session.subtitle}
        backgroundColor={background}
        backgroundImageUrl={backgroundImage}
        textColor={ink}
        accentColor={accent}
        lastLoadedAt={lastLoadedAt}
      />
    );
  }

  return (
    <main
      className="min-h-dvh bg-cover bg-center bg-no-repeat px-4 py-6 sm:px-6"
      style={{
        backgroundColor: background,
        color: ink,
        // Overlay ditumpuk sebagai gradient di ATAS gambar dalam satu properti
        // `backgroundImage`. Cara ini dipilih daripada menambah elemen pembungkus
        // baru: menyisipkan wrapper di sini berarti mengubah struktur seluruh
        // halaman pencarian hanya untuk menggelapkan latar.
        backgroundImage: backgroundImage
          ? `linear-gradient(${imageOverlay}, ${imageOverlay}), url(${backgroundImage})`
          : undefined,
      }}
    >
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
