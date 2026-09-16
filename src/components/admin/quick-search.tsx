"use client";

import { ArrowRight, ClockCounterClockwise, MagnifyingGlass, Storefront } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { grupDari, halamanSistem, navigation, type NavIcon } from "@/components/admin/nav-config";
import type { EventPilihan } from "@/components/admin/event-menu";
import type { Recent } from "@/components/admin/sidebar-store";

/**
 * Pencarian cepat: tombol di sidebar, dan palet perintah yang dibukanya.
 *
 * ---- Kenapa tombolnya berbentuk kolom isian -------------------------------
 *
 * Ia memang bukan kolom isian, dan biasanya bentuk yang berbohong soal apa yang
 * bisa dilakukan adalah cacat. Di sini kebohongannya sepele dan hasilnya benar:
 * ditekan atau diketik, keduanya berakhir di palet dengan kursor sudah berkedip
 * di kolom yang sama. Yang dijanjikan bentuknya tetap ditepati.
 *
 * Alternatifnya, kolom isian sungguhan di dalam sidebar, jauh lebih buruk: ia
 * harus merender hasil di kolom selebar 232px, atau memindahkan fokus ke tempat
 * lain di tengah orang mengetik.
 */

/* ---- Pencocokan ---------------------------------------------------------- */

/**
 * Cocok bila seluruh huruf kueri muncul BERURUTAN di dalam teks, tidak harus
 * berdempet. "dpst" menemukan "Daftar peserta"; "peserta" juga.
 *
 * Nilainya dipakai mengurutkan, dan tiga bonusnya menjawab tiga kekeliruan yang
 * benar-benar terasa: padanan di awal kata ("lab" untuk "Label") harus menang
 * atas padanan di tengah ("Layar sapa"), padanan berdempet harus menang atas
 * yang tersebar, dan judul pendek harus menang atas judul panjang yang kebetulan
 * memuat huruf yang sama.
 */
function nilaiCocok(teks: string, kueri: string): number | null {
  if (!kueri) return 0;
  const sumber = teks.toLowerCase();
  const cari = kueri.toLowerCase();
  let posisi = 0;
  let nilai = 0;
  let sebelumnya = -2;
  for (const huruf of cari) {
    const ketemu = sumber.indexOf(huruf, posisi);
    if (ketemu === -1) return null;
    if (ketemu === sebelumnya + 1) nilai += 6;
    if (ketemu === 0 || sumber[ketemu - 1] === " ") nilai += 4;
    sebelumnya = ketemu;
    posisi = ketemu + 1;
  }
  return nilai - sumber.length * 0.05;
}

/* ---- Tombol di sidebar --------------------------------------------------- */

/**
 * Mac menulis pintasannya dengan lambang, dan "Ctrl K" di sana salah begitu saja.
 *
 * Dibaca lewat `useSyncExternalStore` dengan langganan kosong: kemampuan
 * perangkat tidak berubah selama halaman terbuka, jadi tidak ada yang perlu
 * dilangganani. Yang dibutuhkan hanyalah snapshot server yang berbeda dari
 * snapshot klien, tanpa `setState` di dalam efek. Snapshot server-nya "Ctrl K",
 * sama dengan mayoritas panitia yang memakai laptop Windows.
 */
const langgananKosong = () => () => {};
const bacaPintasan = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");

function usePintasanMac() {
  return useSyncExternalStore(langgananKosong, bacaPintasan, () => "Ctrl K");
}

export function QuickSearchButton({ onOpen, collapsed }: { onOpen: () => void; collapsed: boolean }) {
  const pintasan = usePintasanMac();

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Cari cepat (${pintasan})`}
      // SATU elemen untuk dua lebar, bukan dua tombol yang saling menggantikan.
      // Rel yang melebar saat disentuh tidak boleh memasang ulang isinya; lihat
      // catatan "Rel: satu pohon, dua lebar" di globals.css.
      className={`flex items-center gap-2 rounded-lg text-left text-body-medium text-on-surface-variant transition-colors duration-150 ${
        collapsed
          // 40x40, tinggi yang sama dengan item menu di rel. Kotak cari setinggi
          // 36px di antara tombol 40px membuat satu baris terlihat melorot.
          ? "mx-auto size-10 justify-center hover:bg-[var(--press-hover)]"
          : "h-9 w-full border border-outline-variant bg-surface-container-lowest px-2.5 hover:border-outline"
      }`}
    >
      <MagnifyingGlass size={16} className="shrink-0" />
      <span className="m3-nav-label min-w-0 flex-1 truncate">Cari cepat...</span>
      <span className="m3-rail-hide shrink-0 text-label-medium tabular-nums">{pintasan}</span>
    </button>
  );
}

/* ---- Palet --------------------------------------------------------------- */

type Grup = "Terakhir dibuka" | "Halaman" | "Event";

type Hasil = {
  kunci: string;
  label: string;
  konteks: string;
  icon: NavIcon;
  href: string;
  /** Alamat logis tanpa prefiks acara. Dipakai membuang riwayat yang sudah ada di daftar halaman. */
  path: string;
  grup: Grup;
};

/** Recents ditampilkan lima. Lebih dari itu, ia bukan lagi "terakhir". */
const BATAS_RECENTS = 5;

export function CommandPalette({
  onClose,
  eventPrefix,
  events,
  recents,
}: {
  onClose: () => void;
  /** `/e/<slug>` atau string kosong. Hasil "Halaman" tetap di acara yang sedang dibuka. */
  eventPrefix: string;
  events: EventPilihan[];
  recents: Recent[];
}) {
  const [kueri, setKueri] = useState("");
  const [sorot, setSorot] = useState(0);
  const kolom = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  // Tidak ada yang direset di sini: AdminShell memasang palet ini HANYA saat
  // terbuka, jadi kueri dan sorotnya lahir kosong setiap kali.
  useEffect(() => {
    const fokus = requestAnimationFrame(() => kolom.current?.focus());
    return () => cancelAnimationFrame(fokus);
  }, []);

  const semua = useMemo<Hasil[]>(() => {
    // Href kembar disaring: induk "Papan peringkat" dan anak pertamanya "Setelan
    // tampilan" menunjuk alamat yang sama, dan dua baris menuju satu tempat
    // hanya membuat orang menimbang mana yang benar.
    const terlihat = new Set<string>();
    const halaman: Hasil[] = [];
    const tambah = (item: { href: string; label: string; icon: NavIcon }, konteks: string) => {
      if (terlihat.has(item.href)) return;
      terlihat.add(item.href);
      halaman.push({
        kunci: `h:${item.href}`,
        label: item.label,
        konteks,
        icon: item.icon,
        href: `${eventPrefix}${item.href}`,
        path: item.href,
        grup: "Halaman",
      });
    };

    for (const group of navigation) {
      for (const item of group.items) {
        for (const kandidat of [item, ...(item.children ?? [])]) {
          tambah(kandidat, grupDari.get(kandidat.href) ?? "Ruang kerja");
        }
      }
    }
    for (const item of halamanSistem) tambah(item, "Sistem");

    const acara: Hasil[] = events.map((event) => ({
      kunci: `e:${event.slug}`,
      label: event.name,
      konteks: event.status === "active" ? "Event" : `Event, ${event.status}`,
      icon: Storefront,
      href: `/e/${event.slug}/admin`,
      path: `/e/${event.slug}/admin`,
      grup: "Event",
    }));

    const terakhir: Hasil[] = recents.slice(0, BATAS_RECENTS).map((item) => ({
      kunci: `r:${item.path}`,
      label: item.label,
      konteks: item.konteks,
      icon: ClockCounterClockwise,
      href: `${eventPrefix}${item.path}`,
      path: item.path,
      grup: "Terakhir dibuka",
    }));

    return [...terakhir, ...halaman, ...acara];
  }, [eventPrefix, events, recents]);

  const hasil = useMemo(() => {
    const cari = kueri.trim();
    if (!cari) {
      // Tanpa kueri: riwayat lalu seluruh halaman. Palet kosong yang menunggu
      // diketik membuang satu-satunya kesempatan memberi tahu isinya apa saja.
      return semua.filter((item) => item.grup !== "Event");
    }

    // Saat mengetik, riwayat DIBUANG kalau halamannya juga muncul di daftar
    // "Halaman". Dua baris identik dengan ikon berbeda terbaca sebagai dua
    // tujuan berbeda, dan orang berhenti untuk memilih di antara keduanya.
    const adaDiHalaman = new Set(semua.filter((item) => item.grup === "Halaman").map((item) => item.path));

    return semua
      .filter((item) => !(item.grup === "Terakhir dibuka" && adaDiHalaman.has(item.path)))
      .map((item) => ({
        item,
        nilai: Math.max(nilaiCocok(item.label, cari) ?? -Infinity, (nilaiCocok(item.konteks, cari) ?? -Infinity) - 3),
      }))
      .filter(({ nilai }) => nilai > -Infinity)
      .sort((a, b) => b.nilai - a.nilai)
      .map(({ item }) => item);
  }, [semua, kueri]);

  /**
   * Hasil dalam URUTAN YANG TERLIHAT.
   *
   * `hasil` diurutkan menurut nilai kecocokan, lalu dirender dikelompokkan, dan
   * dua urutan itu TIDAK sama. Panah dan Enter harus mengikuti yang dilihat mata,
   * jadi indeks sorot dihitung di sini sekali dan dipakai oleh keduanya.
   */
  const urutanGrup = [...new Set(hasil.map((item) => item.grup))];
  const tampil = urutanGrup.flatMap((grup) => hasil.filter((item) => item.grup === grup));

  // Sorot dijaga tetap terlihat. Tanpa ini, menekan panah bawah dua belas kali
  // memindahkan sorot ke luar area yang tergulir dan daftarnya diam saja.
  const daftar = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    daftar.current?.querySelector<HTMLElement>('[data-sorot="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sorot, hasil]);

  function buka(item: Hasil) {
    onClose();
    router.push(item.href);
  }

  function onKeyDown(peristiwa: React.KeyboardEvent) {
    if (peristiwa.key === "Escape") { onClose(); return; }
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      if (tampil.length === 0) return;
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((indeks) => (indeks + arah + tampil.length) % tampil.length);
      return;
    }
    if (peristiwa.key === "Enter" && tampil[sorot]) {
      peristiwa.preventDefault();
      buka(tampil[sorot]);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        // Latar MEMUDARKAN halaman, tidak menggelapkannya. Palet ini dibuka untuk
        // pergi ke tempat lain, bukan untuk menuntut keputusan, dan halaman di
        // belakangnya masih dipakai mata sebagai konteks. Aturannya di globals.css.
        className="m3-palette-scrim fixed inset-0 z-50 flex justify-center p-4 pt-[12vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        onPointerDown={(peristiwa) => { if (peristiwa.target === peristiwa.currentTarget) onClose(); }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Cari cepat"
          onKeyDown={onKeyDown}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.14 }}
          className="flex max-h-[76vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level3"
        >
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-outline-variant px-4">
            <MagnifyingGlass size={18} className="shrink-0 text-on-surface-variant" />
            <input
              ref={kolom}
              value={kueri}
              onChange={(peristiwa) => { setKueri(peristiwa.target.value); setSorot(0); }}
              placeholder="Cari halaman, event, dan fitur..."
              aria-label="Cari halaman, event, dan fitur"
              // `m3-search-field` melepas cincin fokus global. Kolom ini menerima
              // fokus otomatis saat palet dibuka, jadi cincinnya hanya melingkari
              // satu-satunya hal yang sudah pasti aktif. Lihat globals.css.
              className="m3-search-field ed-plain min-w-0 flex-1 border-0 bg-transparent text-[0.9375rem] shadow-none outline-none placeholder:text-on-surface-variant"
            />
            {/* Lencana Esc BISA ditekan, bukan sekadar keterangan. Yang membuka
                palet dengan tetikus tidak selalu tahu Esc menutupnya, dan lencana
                yang terlihat seperti tombol tetapi tidak bisa ditekan adalah janji
                yang dilanggar pada percobaan pertama. */}
            <button type="button" onClick={onClose} aria-label="Tutup pencarian" className="m3-kbd shrink-0">
              Esc
            </button>
          </div>

          <div ref={daftar} className="m3-thin-scroll max-h-[400px] min-h-0 flex-1 overflow-y-auto p-2">
            {tampil.length === 0 ? (
              <p className="px-2 py-8 text-center text-body-medium text-on-surface-variant">
                Tidak ada hasil untuk &ldquo;{kueri.trim()}&rdquo;
              </p>
            ) : (
              urutanGrup.map((grup) => (
                <div key={grup} className="mb-1">
                  <p className="px-2 pb-1 pt-2 text-label-medium font-medium text-[var(--press-ink-faint)]">{grup}</p>
                  {hasil.filter((item) => item.grup === grup).map((item) => {
                    const indeks = tampil.indexOf(item);
                    const aktif = indeks === sorot;
                    const Icon = item.icon;
                    return (
                      <button
                        key={`${grup}:${item.kunci}`}
                        type="button"
                        data-sorot={aktif}
                        onClick={() => buka(item)}
                        onPointerMove={() => setSorot(indeks)}
                        // SATU baris, bukan judul di atas keterangan. Dua baris per
                        // hasil memuat setengah jumlah tujuan pada tinggi yang sama,
                        // dan daftar yang harus digulir lebih lambat daripada
                        // mengetik dua huruf lagi.
                        className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left ${aktif ? "bg-[var(--press-hover)]" : ""}`}
                      >
                        <Icon size={16} className="shrink-0 text-on-surface-variant" />
                        <span className="min-w-0 shrink-[2] truncate text-body-medium text-on-surface">{item.label}</span>
                        {/* Pemisahnya titik tengah, bukan tanda pisah panjang.
                            Aturan penyuntingan proyek melarang tanda pisah panjang
                            di seluruh teks antarmuka; titik tengah mengerjakan
                            pemisahan yang sama tanpa melanggarnya. */}
                        <span className="shrink-0 text-on-surface-variant" aria-hidden>&middot;</span>
                        <span className="min-w-0 flex-1 truncate text-body-medium text-on-surface-variant">{item.konteks}</span>
                        {aktif ? <ArrowRight size={16} className="ml-auto shrink-0 text-on-surface-variant" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="m3-palette-foot flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-outline-variant px-4 py-2.5 text-label-medium text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <kbd className="m3-kbd">&uarr;</kbd>
              <kbd className="m3-kbd">&darr;</kbd>
              untuk navigasi
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="m3-kbd">&crarr;</kbd>
              untuk memilih
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="m3-kbd">Esc</kbd>
              untuk menutup
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
