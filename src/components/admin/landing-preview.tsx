"use client";

import { ArrowClockwise, ArrowsIn, ArrowsOut, DeviceMobile, Monitor } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton, Pane, SegmentedButton } from "@/components/m3";
import type { LandingForumPage } from "@/lib/domain";

/**
 * Pratinjau halaman acara di dalam CMS.
 *
 * Memuat halaman publiknya yang SUNGGUHAN di dalam iframe, bukan menyusun ulang
 * tampilannya dengan komponen tiruan. Tiruan akan menyimpang dari halaman asli
 * pada perubahan pertama yang lupa disalin ke dalamnya, dan pratinjau yang
 * berbohong lebih buruk daripada tidak ada pratinjau: admin akan menekan Simpan
 * dengan yakin, lalu tamu melihat halaman yang lain.
 *
 * Yang dimuat adalah `/e/<slug>/pratinjau`: halaman yang sama, tetapi hanya
 * untuk admin, dan menerima draf yang belum disimpan dari layar ini lewat
 * postMessage (bukan lewat URL), lalu merendernya ulang di server dengan
 * komponen halaman publik yang sama. Halaman publik `/e/<slug>` sendiri tetap
 * hanya membaca isi tersimpan.
 *
 * Iframe dirender pada lebar perangkat sungguhan (390 atau 1280) lalu
 * DIPERKECIL dengan transform. Menyempitkan iframe-nya sendiri akan memicu
 * breakpoint ponsel di layar desktop, jadi yang terlihat bukan tata letak yang
 * akan dilihat tamu.
 */

type Device = "mobile" | "desktop";

const UKURAN: Record<Device, { width: number; height: number }> = {
  // 390×844: iPhone 14/15, ukuran yang paling banyak dipakai tamu.
  mobile: { width: 390, height: 844 },
  // 1280: lebar kontainer halaman publik dan lebar laptop yang paling banyak
  // dipakai. Pada 1440 pratinjaunya diperkecil sampai ~0,47 di panel 680px dan
  // teks isinya tidak lagi terbaca; 1280 memberi ~0,53 tanpa mengubah tata letak.
  desktop: { width: 1280, height: 800 },
};

/** Jarak bidang pratinjau ke tepi panel, kiri + kanan. Sama dengan `p-4`. */
const TEPI = 32;

/** Tinggi bilah atas halaman publik, supaya bagian yang disorot tidak tertutup. */
const BILAH_ATAS = 72;

/**
 * Cari bagian di halaman pratinjau: `data-bagian` untuk Pembuka, Kaki, dan
 * bagian bawaan; id elemen untuk blok (`blk_...`) dan bagian tata letak Editorial.
 */
function cariBagian(doc: Document, id: string): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[data-bagian="${CSS.escape(id)}"]`) ?? doc.getElementById(id);
}

export function LandingPreview({
  slug,
  reloadKey,
  sorot,
  tabPembicara = null,
  draf,
  halaman = null,
  onHalaman,
  bahasa = "id",
  onBahasa,
  formulir = false,
  labelPilih = null,
  onPilih,
}: {
  slug: string;
  reloadKey: number;
  /** Bagian yang dipilih di Susunan halaman: digulir ke sana dan diberi garis. */
  sorot?: { id: string; n: number; diam?: boolean } | null;
  /** Tab bagian Pembicara yang sedang diurutkan di editor (`SpeakerTab.key`): dibuka juga di pratinjau. */
  tabPembicara?: string | null;
  /** Isi CMS yang belum disimpan; dirender di pratinjau sambil mengetik. */
  draf?: object | null;
  /** Halaman tata letak Forum yang dipratinjau; null = tata letak satu halaman. */
  halaman?: LandingForumPage | null;
  /** Tautan antarhalaman diklik di dalam pratinjau. */
  onHalaman?: (halaman: LandingForumPage) => void;
  /** Bahasa draf yang dirender: mengikuti mode ID | EN editor. */
  bahasa?: "id" | "en";
  /** Pilihan ID | EN diklik di dalam pratinjau. */
  onBahasa?: (bahasa: "id" | "en") => void;
  /**
   * Acara tanpa halaman acara (Tema > Yang tayang: Hanya formulir): yang
   * dipratinjau formulir pendaftaran, dengan Tema dari draf yang sama.
   */
  formulir?: boolean;
  /**
   * Nama baris Susunan halaman per id bagian (dan per `bagian:kolom`). Diisi =
   * klik di pratinjau memilih baris itu; lihat src/app/pratinjau/pilih-bagian.ts.
   */
  labelPilih?: Record<string, string> | null;
  /** Bagian (dan kolom) yang diklik di pratinjau. */
  onPilih?: (bagian: string, kolom: string | null) => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [wadahUkuran, setWadahUkuran] = useState({ lebar: 0, tinggi: 0 });
  const [nonce, setNonce] = useState(0);
  const wadah = useRef<HTMLDivElement | null>(null);
  const bingkai = useRef<HTMLIFrameElement | null>(null);
  const tersorot = useRef<HTMLElement | null>(null);
  // null = pratinjau sejalan dengan draf; teks = alasan pratinjau tertinggal.
  const [tertinggal, setTertinggal] = useState<string | null>(null);
  // Diperbesar menutupi layar CMS. Pohon elemennya sama, hanya kelas pembungkus
  // yang berganti, jadi iframe tidak dimuat ulang dan posisi gulirnya tetap.
  const [besar, setBesar] = useState(false);
  // Pratinjau sedang menampilkan kotak bertitik (bagian kosong): bilah bawah menyebutnya.
  const [adaKosong, setAdaKosong] = useState(false);

  const kotakBesar = useRef<HTMLDivElement | null>(null);
  const tombolBesar = useRef<HTMLButtonElement | null>(null);
  // Esc menutup dari halaman CMS dan dari DALAM pratinjau: setelah klik di
  // pratinjau fokusnya di iframe, dan keydown-nya tidak sampai ke jendela induk.
  // Halaman di iframe asal-yang-sama, jadi pendengarnya dipasang di sana juga,
  // dan dipasang ulang setiap kali iframe memuat halaman baru. `kunciBingkai`
  // ikut di deps: Reload, Save, atau pindah halaman membuat iframe BARU selagi
  // diperbesar, dan pendengar di iframe lama ikut hilang bersamanya.
  const kunciBingkai = `${reloadKey}-${nonce}-${halaman ?? ""}-${formulir ? "formulir" : "halaman"}`;
  useEffect(() => {
    if (!besar) return;
    function tutup(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setBesar(false);
      tombolBesar.current?.focus();
    }
    const iframe = bingkai.current;
    let jendelaDalam: Window | null = null;
    function pasangDalam() {
      jendelaDalam?.removeEventListener("keydown", tutup);
      jendelaDalam = iframe?.contentWindow ?? null;
      jendelaDalam?.addEventListener("keydown", tutup);
    }
    pasangDalam();
    iframe?.addEventListener("load", pasangDalam);
    window.addEventListener("keydown", tutup);
    return () => {
      window.removeEventListener("keydown", tutup);
      iframe?.removeEventListener("load", pasangDalam);
      jendelaDalam?.removeEventListener("keydown", tutup);
    };
  }, [besar, kunciBingkai]);

  /** Penjaga fokus: Tab dari ujung kotak kembali ke ujung lainnya (pola dialog modal). */
  function jagaFokus(ke: "awal" | "akhir") {
    const isi = kotakBesar.current?.querySelectorAll<HTMLElement>('button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]):not([data-penjaga])');
    if (!isi?.length) return;
    (ke === "awal" ? isi[0] : isi[isi.length - 1]).focus();
  }

  const kirimDraf = useCallback(() => {
    if (!draf) return;
    bingkai.current?.contentWindow?.postMessage(
      formulir ? { jenis: "tally-pratinjau-formulir", landing: draf } : { jenis: "tally-pratinjau-draf", draf, bahasa },
      window.location.origin,
    );
  }, [draf, bahasa, formulir]);

  // Skala dihitung di bawah; ref supaya pengirim label tidak bergantung urutan.
  const skalaRef = useRef(0.5);
  const kirimLabel = useCallback(() => {
    if (formulir) return;
    bingkai.current?.contentWindow?.postMessage(
      { jenis: "tally-pratinjau-label", label: onPilih ? labelPilih : null, skala: skalaRef.current },
      window.location.origin,
    );
  }, [labelPilih, onPilih, formulir]);

  useEffect(() => { kirimLabel(); }, [kirimLabel]);

  // Menyentuh DOM halaman di dalam iframe, bukan keadaan React: halaman itu
  // asal-yang-sama, dan garisnya hanya ada di pratinjau ini, tidak tersimpan.
  const terapkanSorot = useCallback((gulir = true) => {
    const jendela = bingkai.current?.contentWindow;
    const doc = bingkai.current?.contentDocument;
    if (!jendela || !doc || !sorot) return;
    tersorot.current?.style.removeProperty("outline");
    tersorot.current?.style.removeProperty("outline-offset");
    const elemen = cariBagian(doc, sorot.id);
    tersorot.current = elemen;
    if (!elemen) return;
    elemen.style.outline = "3px dashed #2563eb";
    elemen.style.outlineOffset = "-3px";
    // Dipilih dengan klik di pratinjau: bagiannya sudah di depan mata, jadi
    // pratinjau tidak ikut melompat ke awal bagian.
    if (sorot.diam) return;
    // scrollTo pada jendela iframe, bukan scrollIntoView: yang terakhir ikut
    // menggulir halaman CMS di luarnya.
    if (!gulir) return;
    const atas = sorot.id === "pembuka" ? 0 : elemen.getBoundingClientRect().top + jendela.scrollY - BILAH_ATAS;
    jendela.scrollTo({ top: Math.max(0, atas), behavior: "smooth" });
  }, [sorot]);

  useEffect(() => { terapkanSorot(); }, [terapkanSorot]);

  // Membuka tab Pembicara yang sedang diurutkan dengan mengklik tabnya di
  // halaman pratinjau (asal-yang-sama), lalu menggulir ke bagian itu.
  const bukaTab = useCallback((gulir = true) => {
    const jendela = bingkai.current?.contentWindow;
    const doc = bingkai.current?.contentDocument;
    if (!jendela || !doc || !tabPembicara) return;
    const tombol = doc.querySelector<HTMLElement>(`[data-bagian="speakers"] [role="tab"][data-tab="${CSS.escape(tabPembicara)}"]`);
    if (!tombol) return;
    if (tombol.getAttribute("aria-selected") !== "true") tombol.click();
    if (!gulir) return;
    const atas = tombol.getBoundingClientRect().top + jendela.scrollY - BILAH_ATAS - 96;
    jendela.scrollTo({ top: Math.max(0, atas), behavior: "smooth" });
  }, [tabPembicara]);

  useEffect(() => { bukaTab(); }, [bukaTab]);

  useEffect(() => { kirimDraf(); }, [kirimDraf]);

  // Pesan dari halaman di dalam iframe: siap menerima draf (setelah dimuat),
  // dan hasil render tiap draf.
  useEffect(() => {
    function terima(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== bingkai.current?.contentWindow) return;
      // Garis sorot dipasang setelah halaman di dalamnya selesai hidrasi
      // (pesan "siap"), bukan saat onLoad: gaya yang ditempel sebelum hidrasi
      // membuat React melaporkan atribut yang tidak cocok.
      if (event.data?.jenis === "tally-pratinjau-siap") {
        kirimDraf();
        kirimLabel();
        terapkanSorot();
        bukaTab();
      }
      if (event.data?.jenis === "tally-pratinjau-halaman" && ["beranda", "program", "info"].includes(event.data.halaman)) {
        onHalaman?.(event.data.halaman);
      }
      if (event.data?.jenis === "tally-pratinjau-pilih" && typeof event.data.bagian === "string") {
        // Panel setelan ada di balik pratinjau yang diperbesar: tutup dulu,
        // supaya kolom yang difokus terlihat dan ketikan tidak masuk diam-diam (QA #108 M3).
        setBesar(false);
        onPilih?.(event.data.bagian, typeof event.data.kolom === "string" ? event.data.kolom : null);
      }
      // Tombol di kotak bertitik: halaman admin acara ini saja, di tab baru.
      // Editor memuat ulang pratinjau saat admin kembali ke tab ini.
      if (event.data?.jenis === "tally-pratinjau-admin" && typeof event.data.href === "string") {
        // Jalur yang sudah dinormalkan (`..`, `%2e`) yang diperiksa, dan hanya
        // asal yang sama (QA #116 I1).
        let tujuan: URL | null = null;
        try { tujuan = new URL(event.data.href, window.location.origin); } catch { tujuan = null; }
        if (tujuan && tujuan.origin === window.location.origin && tujuan.pathname.startsWith(`/e/${slug}/admin/`)) {
          window.open(tujuan.pathname + tujuan.search, "_blank", "noreferrer");
        }
      }
      if (event.data?.jenis === "tally-pratinjau-kosong") setAdaKosong(event.data.ada === true);
      if (event.data?.jenis === "tally-pratinjau-bahasa") onBahasa?.(event.data.bahasa === "en" ? "en" : "id");
      if (event.data?.jenis === "tally-pratinjau-hasil") {
        setTertinggal(event.data.pesan ? String(event.data.pesan) : event.data.ok ? null : "The preview hasn't updated yet.");
        // Halaman dirender ulang: pasang lagi garis sorot tanpa menggulir.
        if (event.data.ok) window.requestAnimationFrame(() => { terapkanSorot(false); bukaTab(false); });
      }
    }
    window.addEventListener("message", terima);
    return () => window.removeEventListener("message", terima);
  }, [kirimDraf, kirimLabel, terapkanSorot, bukaTab, onHalaman, onBahasa, onPilih, slug]);
  const { width, height: tinggiPerangkat } = UKURAN[device];
  // Diukur dari panel, bukan jendela: panel utama menyempit saat panel setelan
  // di sebelahnya muncul, tanpa jendelanya berubah ukuran.
  const ruangLebar = Math.max(0, wadahUkuran.lebar - TEPI);
  const ruangTinggi = Math.max(0, wadahUkuran.tinggi - TEPI);
  // Desktop memenuhi lebar panel, lalu iframe dibuat setinggi sisa panel supaya
  // tidak ada ruang kosong di bawahnya. Ponsel memenuhi tinggi panel, tetap
  // dengan perbandingan layar ponsel sungguhan.
  const skala =
    ruangLebar === 0
      ? 0.5
      : device === "desktop"
        ? Math.min(1, Math.max(0.1, ruangLebar / width))
        : Math.max(0.1, Math.min(1, ruangLebar / width, ruangTinggi / tinggiPerangkat));
  useEffect(() => {
    if (skalaRef.current === skala) return;
    skalaRef.current = skala;
    kirimLabel();
  }, [skala, kirimLabel]);
  const height = device === "desktop" && ruangTinggi > 0 ? Math.max(tinggiPerangkat * 0.5, ruangTinggi / skala) : tinggiPerangkat;

  useEffect(() => {
    const element = wadah.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      // contentRect tidak memuat padding; TEPI ditambahkan kembali di perhitungan.
      setWadahUkuran({ lebar: entry.contentRect.width + TEPI, tinggi: entry.contentRect.height + TEPI }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      lang="en"
      ref={kotakBesar}
      className={besar ? "fixed inset-0 z-50 flex flex-col bg-scrim/40 p-4 *:flex-1" : "flex min-h-0 flex-col *:flex-1"}
      {...(besar ? { role: "dialog", "aria-modal": true, "aria-label": "Enlarged preview" } : null)}
    >
    {/* Penjaga di kedua ujung hanya saat diperbesar; elemennya tetap ada supaya
        pohon (dan iframe) tidak dibuat ulang saat berganti mode. */}
    <span data-penjaga tabIndex={besar ? 0 : -1} aria-hidden className="flex-none!" onFocus={() => jagaFokus("akhir")} />
    <Pane aria-label="Event page preview">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-2.5">
        <p className={`line-clamp-2 min-w-0 flex-1 ${tertinggal ? "text-body-small text-error" : "text-body-medium text-on-surface-variant"}`} role="status" title={tertinggal ?? undefined}>
          {/* Forum: pilihan halaman ikut di baris ini, jadi labelnya dipendekkan
              supaya tidak terlipat di layar 1440. */}
          {tertinggal ??
            (onPilih && labelPilih && !formulir
              ? adaKosong
                ? `Click to edit · Guests don't see dashed boxes${bahasa === "en" ? " · English" : ""}`
                : `Click the page to edit · ${width} px${bahasa === "en" ? " · English" : ""}`
              : `${halaman && onHalaman ? "Preview" : "Live preview"} · ${width} px${bahasa === "en" ? " · English" : ""}`)}
        </p>
        {halaman && onHalaman ? (
          <SegmentedButton<LandingForumPage>
            label="Page to preview"
            value={halaman}
            onChange={onHalaman}
            options={[
              { value: "beranda", label: "Home" },
              { value: "program", label: "Programme" },
              { value: "info", label: "Info" },
            ]}
          />
        ) : null}
        <SegmentedButton<Device>
          label="Preview screen size"
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: "Desktop", icon: <Monitor size={16} /> },
            { value: "mobile", label: "Phone", icon: <DeviceMobile size={16} /> },
          ]}
        />
        <IconButton size="sm" label="Reload preview" onClick={() => setNonce((current) => current + 1)}>
          <ArrowClockwise size={16} />
        </IconButton>
        <IconButton ref={tombolBesar} size="sm" label={besar ? "Exit enlarged preview" : "Enlarge preview"} onClick={() => setBesar((current) => !current)}>
          {besar ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}
        </IconButton>
      </div>

      <div ref={wadah} className="min-h-0 flex-1 overflow-hidden bg-surface-container-high p-4">
        <div
          className="mx-auto overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest"
          style={{ width: width * skala, height: height * skala }}
        >
          <iframe
            // `key` memaksa iframe dibuat ulang saat konfigurasi tersimpan.
            // Mengganti `src` saja tidak cukup: browser memperlakukan navigasi
            // di dalam iframe sebagai riwayat, dan tombol Back halaman CMS lalu
            // menelusuri riwayat pratinjau alih-alih meninggalkan layar ini.
            key={kunciBingkai}
            ref={bingkai}
            src={formulir ? `/e/${slug}/daftar/pratinjau` : `/e/${slug}/pratinjau${halaman && halaman !== "beranda" ? `?halaman=${halaman}` : ""}`}
            title={formulir ? "Registration form preview" : "Event page preview"}
            // Pratinjau tidak boleh ikut merekam riwayat maupun mengambil alih
            // halaman induk. Sandbox tetap mengizinkan skrip dan asal-yang-sama,
            // karena halaman publiknya memang butuh keduanya untuk berjalan
            // seperti yang dilihat tamu.
            sandbox="allow-scripts allow-same-origin allow-popups"
            style={{
              width,
              height,
              border: 0,
              transform: `scale(${skala})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </Pane>
    <span data-penjaga tabIndex={besar ? 0 : -1} aria-hidden className="flex-none!" onFocus={() => jagaFokus("awal")} />
    </div>
  );
}
