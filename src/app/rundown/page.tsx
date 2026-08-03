"use client";

import { CalendarBlank, Clock, Coffee, DotOutline } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-header-footer";
import { fontStack, normalizeBranding, scaleClamp } from "@/lib/branding";
import { activeItemId, DEFAULT_HEADER, formatClock, formatEventDate, groupSubtitleLines, itemStatus, subtitleLines, type RundownHeader, type RundownItem, type RundownSection } from "@/lib/rundown";
import { normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

// Rundown acara publik. Tanpa login, dibuka tamu dari ponsel di lokasi dan bisa
// ikut ditayangkan di layar besar.
//
// Tiga hal yang menentukan bentuk halaman ini:
//
//   * Penanda "sedang berlangsung" dihitung di BROWSER, bukan di server. Tamu
//     membuka halaman ini lalu membiarkannya terbuka di saku; kalau penandanya
//     dirender sekali di server, ia akan menunjuk sesi yang sudah lewat sampai
//     halaman disegarkan manual — tepat pada saat tamu memakainya untuk tahu
//     acara apa yang sedang jalan.
//   * Auto-scroll hanya SEKALI per bagian. Menggulirkan ulang setiap kali jam
//     berganti akan menarik halaman kembali ke atas persis ketika tamu sedang
//     membaca acara sore.
//   * Data disegarkan berkala karena panitia mengubah rundown saat acara
//     berjalan, dan tamu tidak akan menyegarkan sendiri.

type SectionTab = { slug: string; name: string };
type Payload = {
  published: boolean;
  sections: SectionTab[];
  section: RundownSection | null;
  items: RundownItem[];
  // Ikut payload rundown, bukan dari /api/settings: halaman ini publik dan
  // endpoint setelan butuh login. Jam item disimpan sebagai jam dinding, jadi
  // zona inilah yang menentukan kapan sebuah acara dianggap sedang berjalan.
  time_zone?: string;
  // Judul, sub judul, dan branding header. SATU untuk seluruh acara, jadi tidak
  // ikut berubah saat tamu berpindah tab.
  header?: RundownHeader;
};

// Rundown berubah jauh lebih jarang daripada keterisian kursi, jadi lima menit
// cukup. Yang membuat penanda bergerak adalah jam di bawah, bukan pemuatan ini.
const DATA_REFRESH_MS = 300000;

// Penanda dihitung ulang tiap 30 detik. Cukup halus untuk terasa hidup pada
// rundown yang butirannya berdurasi menit, dan tidak membuat ponsel bekerja
// sia-sia sepanjang acara.
const TICK_MS = 30000;

export default function RundownPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Bagian yang dipatok lewat URL, dibaca sekali saat mount. Tanpa ini QR yang
  // dicetak untuk sesi malam akan selalu membuka bagian pertama.
  const [slugFromUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("sesi")?.trim();
    return raw && /^[a-z0-9-]{2,40}$/.test(raw) ? raw : null;
  });

  const listRef = useRef<HTMLOListElement | null>(null);
  // Bagian yang auto-scroll-nya sudah dijalankan. Menahan gulir kedua yang akan
  // merebut posisi baca tamu.
  const scrolledFor = useRef<string | null>(null);

  const load = useCallback(async (slug: string | null, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const query = slug ? `?sesi=${encodeURIComponent(slug)}` : "";
      const response = await fetch(`/api/rundown${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("gagal");
      const data = (await response.json()) as Payload;
      setPayload(data);
      setActiveSlug(data.section?.slug ?? null);
      setFailed(false);
    } catch {
      // Kegagalan pada penyegaran diam tidak boleh mengosongkan halaman yang
      // sudah terisi: tamu lebih terbantu oleh rundown lima menit lalu daripada
      // oleh layar kosong.
      if (!options?.silent) setFailed(true);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(slugFromUrl); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, slugFromUrl]);

  // Jam berjalan. Dipisah dari pemuatan data supaya penanda tetap bergerak walau
  // jaringan di lokasi sedang buruk.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const refresh = window.setInterval(() => {
      void load(activeSlug, { silent: true });
    }, DATA_REFRESH_MS);
    return () => window.clearInterval(refresh);
  }, [load, activeSlug]);

  const section = payload?.section ?? null;
  const zone: EventTimeZone = normalizeTimeZone(payload?.time_zone);
  // Dibungkus useMemo supaya identitas array tidak berubah setiap render. Tanpa
  // itu perhitungan penanda di bawah dijalankan ulang terus-menerus, dan effect
  // auto-scroll ikut terpicu setiap render.
  const items = useMemo(() => payload?.items ?? [], [payload]);

  // Penanda dimatikan lewat CMS per bagian. Ketika mati, `activeId` tetap null
   // sehingga satu sakelar ini sekaligus mematikan sorotan, label, dan auto-scroll
  // — tidak ada jalur kedua yang bisa lupa dimatikan.
  const highlightEnabled = section?.highlight_current ?? false;

  const activeId = useMemo(
    () => (section && highlightEnabled ? activeItemId(section.event_date, items, now, zone) : null),
    [section, highlightEnabled, items, now, zone],
  );

  // Auto-scroll ke butir yang sedang berlangsung, sekali per bagian.
  //
  // `block: "center"` dipilih agar butir sebelum dan sesudahnya ikut terlihat:
  // yang dicari tamu bukan hanya "sekarang apa", tapi juga "habis ini apa".
  //
  // Jarak amannya datang dari scroll-margin yang disetel dari tinggi header
  // terukur (lihat --rundown-head di bawah), bukan dari perhitungan di sini:
  // dengan begitu gulir manual tamu ke sebuah baris pun tidak tertutup header.
  useEffect(() => {
    if (!section || activeId === null) return;
    if (scrolledFor.current === section.slug) return;
    const target = listRef.current?.querySelector<HTMLElement>(`[data-item-id="${activeId}"]`);
    if (!target) return;
    scrolledFor.current = section.slug;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [section, activeId]);

  function selectSection(slug: string) {
    if (slug === activeSlug) return;
    // Auto-scroll dibuka kembali untuk bagian yang baru dipilih.
    scrolledFor.current = null;
    setActiveSlug(slug);
    // URL diperbarui tanpa memuat ulang, supaya tautan yang dibagikan tamu
    // membuka bagian yang sama dengan yang ia lihat.
    window.history.replaceState(null, "", `/rundown?sesi=${encodeURIComponent(slug)}`);
    void load(slug);
  }

  const tabs = payload?.sections ?? [];
  const hasSchedule = Boolean(payload?.published) && items.length > 0;

  // Header GLOBAL, bukan per tab.
  //
  // Judul dan branding datang dari `payload.header`, bukan dari `section`. Itu
  // perbedaan yang menentukan: dengan sumber per section, berpindah tab mengubah
  // judul, warna, dan logo sekaligus, sehingga satu halaman terasa berganti
  // menjadi situs lain di tengah pemakaian.
  const header = payload?.header ?? DEFAULT_HEADER;

  // Branding dinormalisasi di sisi klien meski API sudah menormalkannya.
  //
  // Bukan pekerjaan ganda yang sia-sia: normalisasi ini juga menjadi jaring
  // pengaman saat `payload` masih null (sebelum data pertama tiba) dan saat
  // responsnya datang dari versi API yang belum mengenal kolom branding. Keduanya
  // menghasilkan nilai bawaan kosong, yang berarti halaman tampil seperti sebelum
  // fitur ini ada — bukan gagal render di depan tamu.
  //
  // Pola dan alasan yang sama dipakai /denah; lihat komentar di sana.
  const branding = useMemo(
    () => normalizeBranding(header as unknown as Record<string, unknown>),
    [header],
  );

  const headingFont = fontStack(branding.heading_font);

  // Warna tinta header.
  //
  // Ketika admin memasang gambar latar tanpa menyetel warna teks, teksnya harus
  // putih: tirai gelap di atas gambar membuat tinta gelap bawaan tidak terbaca.
  // Tanpa gambar dan tanpa warna pilihan, nilainya jatuh ke token tema sehingga
  // header tampil seperti sebelumnya.
  const headerInk = header.text_color ?? (header.background_image_url ? "#ffffff" : "var(--ink)");
  const headerAccent = header.accent_color ?? "var(--brand)";

  // Tata letak app-shell: layar dibagi dua, header mati dan daftar bergulir.
  //
  // `h-dvh` + flex kolom membuat HALAMAN tidak bergulir sama sekali; yang bergulir
  // hanya kotak jadwal di bawah. Ini berbeda dari sticky yang dipakai sebelumnya:
  // pada sticky, halamannya tetap bergulir dan header hanya "ikut menempel",
  // sehingga masih ada perubahan posisi dan tinggi saat digulir. Dengan header
  // berada DI LUAR wadah yang bergulir, tidak ada lagi yang bisa berubah.
  //
  // `overflow-hidden` di main mencegah gulir bounce di iOS menggeser seluruh
  // layar, yang membuat header tampak bergetar walau posisinya tetap.
  //
  // Konsekuensi yang disengaja: header dibuat seringkas mungkin. Karena ia
  // memotong tinggi layar secara permanen, setiap piksel di sini adalah piksel
  // yang hilang dari jadwal. Kelir "RUNDOWN ACARA", judul 4xl, dan tombol denah
  // setinggi 48px dilepas — bertiga memakan lebih dari separuh layar ponsel dan
  // hanya menyisakan dua baris jadwal.
  return <main className="flex h-dvh flex-col overflow-hidden bg-[var(--background)] text-[var(--ink)]">
    {/* Header berbranding, SATU untuk seluruh acara.
        Judul, warna, dan logo datang dari setelan global, bukan dari tab yang
        sedang aktif. Semuanya boleh kosong, dan ketika kosong nilainya jatuh ke
        token tema — header tampil persis seperti sebelum fitur branding ada. Ini
        janji yang sama dengan branding /denah dan /display. */}
    <header
      className="relative isolate shrink-0 overflow-hidden border-b border-[var(--line)]"
      style={{
        background: header.background_color ?? "var(--surface)",
        color: headerInk,
      }}
    >
      {/* Gambar latar sebagai lapisan terpisah, bukan `background-image` di header.
          Dengan begitu tirai gelap di atasnya bisa disetel sendiri tanpa memengaruhi
          warna dasar, dan teks tetap terbaca di atas foto seterang apa pun. */}
      {header.background_image_url ? <>
        <span
          aria-hidden
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: `url("${header.background_image_url}")` }}
        />
        <span aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
      </> : null}

      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <div className="pb-3.5 pt-4">
          <div className="min-w-0">
            <BrandLogo branding={branding} variant="compact" centered={false} />

            <h1
              className="truncate font-bold"
              style={{
                fontFamily: headingFont,
                // Ukuran dasar lebih kecil daripada BrandHeader /denah, dan itu
                // disengaja: header ini memotong tinggi layar secara permanen,
                // sedangkan header /denah bergulir bebas.
                fontSize: scaleClamp("clamp(17px, 3.4vw, 22px)", branding.title_scale),
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
                color: branding.title_color ?? headerInk,
                marginTop: branding.logo_url ? "0.5rem" : undefined,
              }}
            >
              {header.event_title}
            </h1>

            {/* Sub judul DI BAWAH judul dengan format yang sama, hanya lebih kecil.
                Urutan dan gaya ini disamakan dengan BrandHeader supaya /rundown dan
                /denah tidak terlihat berasal dari sistem berbeda. Huruf besar paksa
                dan jarak antar huruf dilepas: keduanya milik gaya kelir, dan pada
                tagline acara yang panjang jarak selebar itu membuat kata sulit
                dikenali sebagai satu kesatuan. */}
            {header.event_subtitle ? <p
              // Boleh membungkus sampai DUA baris, lalu dipotong.
              //
              // Satu baris memotong tagline acara di tengah kalimat, dan tagline
              // yang terpotong lebih buruk daripada header yang tumbuh 18px. Batas
              // dua baris tetap dipasang karena header memotong tinggi layar
              // permanen: tanpa batas, satu kalimat panjang bisa menambah tiga baris
              // dan memakan ruang jadwal.
              className="[display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
              style={{
                fontFamily: headingFont,
                fontSize: scaleClamp("clamp(12px, 2.4vw, 14px)", branding.subtitle_scale),
                lineHeight: 1.4,
                marginTop: "0.125rem",
                color: branding.subtitle_color ?? headerInk,
                opacity: branding.subtitle_color ? 1 : 0.75,
              }}
            >
              {header.event_subtitle}
            </p> : null}

            {/* Tanggal, jumlah acara, dan zona digabung jadi SATU baris kecil.
                Sebelumnya ketiganya berdiri sendiri-sendiri dan menghabiskan tiga
                baris untuk keterangan yang dibaca sekali saja. */}
            <p
              className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs"
              style={{ color: headerInk, opacity: 0.75 }}
            >
              <CalendarBlank size={14} className="shrink-0" />
              {section ? formatEventDate(section.event_date, zone) : "Rundown acara"}
              {hasSchedule ? <span>&middot; {items.length} acara</span> : null}
              <span>&middot; {timeZoneAbbr(zone)}</span>
            </p>
          </div>

        </div>

        {tabs.length > 1 ? <div
          role="tablist"
          aria-label="Pilih bagian acara"
          className="-mb-px flex gap-1"
        >
          {/* Tab bergaya garis bawah, bukan kotak terisi. Di header yang memotong
              tinggi layar, tab kotak setinggi 48px berarti 48px jadwal yang hilang
              selamanya. Garis bawah memberi penanda terpilih yang sama jelasnya,
              dan tetap dipasangkan bobot huruf serta warna teks agar tidak
              bergantung pada warna saja.
              Warna aksen dipakai untuk garis tab terpilih supaya penanda ini ikut
              berubah saat panitia menyetel warna acara. */}
          {tabs.map((tab) => {
            const isActive = tab.slug === activeSlug;
            return <button
              key={tab.slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectSection(tab.slug)}
              className={`min-h-11 min-w-0 flex-1 border-b-2 px-2 pb-2 text-sm leading-5 transition-colors sm:flex-none sm:px-4 ${isActive ? "font-semibold" : "font-medium"}`}
              style={{
                borderColor: isActive ? headerAccent : "transparent",
                color: isActive ? headerAccent : headerInk,
                opacity: isActive ? 1 : 0.65,
              }}
            >
              <span className="block truncate">{tab.name}</span>
            </button>;
          })}
        </div> : null}
      </div>
    </header>

    {/* Satu-satunya wadah yang bergulir.
        `min-h-0` wajib: tanpa itu anak flex menolak menyusut di bawah tinggi
        isinya, wadah ini melampaui layar, dan halamannya kembali bergulir — header
        pun ikut terangkat. Inilah kesalahan yang membuat pendekatan sticky tadi
        terasa "tidak tepat".
        `overscroll-contain` menahan gulir berlebih agar tidak diteruskan ke
        browser sebagai pull-to-refresh saat tamu menggulir cepat di ponsel. */}
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 sm:px-6">
        {loading ? <p role="status" className="border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
          Memuat rundown…
        </p> : failed ? <p role="alert" className="border border-[var(--danger)] bg-[var(--surface)] px-4 py-10 text-center text-sm text-[var(--danger)]">
          Rundown gagal dimuat. Periksa koneksi lalu muat ulang halaman ini.
        </p> : !payload?.published ? <p role="status" className="border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
          Rundown acara belum dipublikasikan. Silakan cek kembali sebentar lagi.
        </p> : items.length === 0 ? <p role="status" className="border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
          Belum ada susunan acara untuk bagian ini.
        </p> : <>
          {/* Garis pemisah antar baris muncul dari gap-px di atas latar --line,
              sesuai DESIGN.md: batas dan jarak lebih dulu, bukan bayangan. */}
          <ol ref={listRef} className="space-y-px border border-[var(--line)] bg-[var(--line)]">
            {items.map((item) => <RundownRow
              key={item.id}
              item={item}
              eventDate={highlightEnabled ? section?.event_date ?? "" : ""}
              now={now}
              zone={zone}
              isActive={item.id === activeId}
            />)}
          </ol>

          {highlightEnabled ? <p className="mt-3 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
            <Clock size={14} className="shrink-0" />
            Penanda acara berjalan diperbarui otomatis.
          </p> : null}
        </>}
      </div>
    </div>
  </main>;
}

function RundownRow({ item, eventDate, now, zone, isActive }: {
  item: RundownItem;
  eventDate: string;
  now: number;
  zone: EventTimeZone;
  isActive: boolean;
}) {
  // `eventDate` kosong ketika penanda dimatikan lewat CMS, dan itu membuat status
  // jatuh ke "unknown". Sengaja: semua tanda yang berasal dari waktu — sorotan,
  // label, peredupan, dan "Selesai" — ikut mati dari satu tempat, sehingga jadwal
  // tampil sebagai daftar biasa tanpa ada sisa penanda yang lupa dimatikan.
  const status = eventDate ? itemStatus(eventDate, item, now, zone) : "unknown";
  // `isActive` menandai satu butir yang disorot: yang sedang berjalan, atau —
  // ketika sedang di celah antar sesi — yang akan mulai berikutnya. Labelnya
  // dibedakan lewat `status` supaya tamu tidak membaca "sedang berlangsung" pada
  // acara yang sebenarnya belum dimulai.
  const highlighted = isActive && (status === "current" || status === "upcoming");
  // Acara yang sudah lewat diredupkan, bukan disembunyikan: tamu yang datang
  // terlambat tetap perlu tahu apa yang sudah berlangsung.
  const dimmed = status === "past" || item.is_break;
  const lines = subtitleLines(item.subtitle);

  return <li
    data-item-id={item.id}
    aria-current={highlighted ? "true" : undefined}
    // Tidak perlu scroll-margin lagi.
    //
    // Sebelumnya baris ini butuh jarak aman karena header menempel DI ATAS wadah
    // yang bergulir, sehingga baris teratas bisa berhenti di belakangnya. Sekarang
    // header berada di luar wadah gulir dan tidak menutupi apa pun, jadi tepi atas
    // wadah ini sudah menjadi batas yang benar.
    className="relative bg-[var(--surface)] px-4 py-4 sm:px-5"
  >
    {/* Batang penanda di tepi kiri. Dipasangkan label teks di bawah, bukan hanya
        warna: DESIGN.md melarang menandai keadaan dengan warna saja, dan tamu
        dengan buta warna tetap harus bisa menemukan acara yang sedang jalan. */}
    {highlighted ? <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${status === "current" ? "bg-[var(--brand)]" : "bg-[var(--line)]"}`} /> : null}

    <div className="grid gap-1.5 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-4">
      <p className={`font-mono text-sm tabular-nums ${status === "current" ? "font-semibold text-[var(--brand)]" : dimmed ? "text-[var(--ink-muted)]" : "text-[var(--brand)]"}`}>
        {formatClock(item.start_time)}
        {item.end_time ? <span className="text-[var(--ink-muted)]"> – {formatClock(item.end_time)}</span> : null}
      </p>

      <div className="min-w-0 space-y-1">
        <p className={`text-base font-semibold leading-6 ${dimmed && status !== "current" ? "text-[var(--ink-muted)]" : "text-[var(--ink)]"}`}>
          {item.title}
        </p>
        {/* Satu baris keterangan tetap dirender sebagai paragraf, bukan daftar
            berbutir: butir tunggal terlihat seperti daftar yang isinya hilang. */}
        {lines.length === 1 && lines[0].kind === "item"
          ? <p className="text-sm leading-6 text-[var(--ink-muted)]">{lines[0].text}</p>
          : null}

        {/* Baris judul ("Panelists:", "Moderator:") TIDAK diberi bulet: ia label
            yang mengelompokkan baris di bawahnya, bukan salah satu isinya. Diberi
            bulet, tamu membacanya sebagai nama orang keenam.

            Judul juga tidak dibungkus <li> agar susunannya jujur secara semantik:
            pembaca layar mengumumkan jumlah butir per daftar, dan judul yang
            terhitung sebagai butir membuat jumlahnya salah. */}
        {lines.length > 1 || (lines.length === 1 && lines[0].kind === "heading")
          ? <div className="space-y-1 text-sm leading-6 text-[var(--ink-muted)]">
            {groupSubtitleLines(lines).map((group, groupIndex) => <div key={groupIndex} className={group.heading && groupIndex > 0 ? "pt-1" : undefined}>
              {group.heading ? <p className="font-semibold text-[var(--ink)]">{group.heading}</p> : null}
              {group.items.length > 0 ? <ul className={group.heading ? "mt-0.5 space-y-0.5" : "space-y-0.5"}>
                {group.items.map((text, index) => <li key={`${text}-${index}`} className="flex gap-2">
                  <span aria-hidden className="select-none text-[var(--line)]">&bull;</span>
                  <span className="min-w-0">{text}</span>
                </li>)}
              </ul> : null}
            </div>)}
          </div>
          : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          {highlighted ? <span className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${status === "current" ? "text-[var(--brand)]" : "text-[var(--ink-muted)]"}`}>
            <DotOutline size={18} weight="fill" className="-ml-1 shrink-0" />
            {status === "current" ? "Sedang berlangsung" : "Berikutnya"}
          </span> : null}
          {item.is_break ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <Coffee size={14} className="shrink-0" />Jeda
          </span> : null}
          {status === "past" ? <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Selesai
          </span> : null}
        </div>
      </div>
    </div>
  </li>;
}
