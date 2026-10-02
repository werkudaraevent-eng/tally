"use client";

import { ArrowClockwise, DeviceMobile, Monitor } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton, Pane, SegmentedButton } from "@/components/m3";

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
  draf,
}: {
  slug: string;
  reloadKey: number;
  /** Bagian yang dipilih di Susunan halaman: digulir ke sana dan diberi garis. */
  sorot?: { id: string; n: number } | null;
  /** Isi CMS yang belum disimpan; dirender di pratinjau sambil mengetik. */
  draf?: object | null;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [wadahUkuran, setWadahUkuran] = useState({ lebar: 0, tinggi: 0 });
  const [nonce, setNonce] = useState(0);
  const wadah = useRef<HTMLDivElement | null>(null);
  const bingkai = useRef<HTMLIFrameElement | null>(null);
  const tersorot = useRef<HTMLElement | null>(null);
  // null = pratinjau sejalan dengan draf; teks = alasan pratinjau tertinggal.
  const [tertinggal, setTertinggal] = useState<string | null>(null);

  const kirimDraf = useCallback(() => {
    if (!draf) return;
    bingkai.current?.contentWindow?.postMessage({ jenis: "tally-pratinjau-draf", draf }, window.location.origin);
  }, [draf]);

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
    // scrollTo pada jendela iframe, bukan scrollIntoView: yang terakhir ikut
    // menggulir halaman CMS di luarnya.
    if (!gulir) return;
    const atas = sorot.id === "pembuka" ? 0 : elemen.getBoundingClientRect().top + jendela.scrollY - BILAH_ATAS;
    jendela.scrollTo({ top: Math.max(0, atas), behavior: "smooth" });
  }, [sorot]);

  useEffect(() => { terapkanSorot(); }, [terapkanSorot]);

  useEffect(() => { kirimDraf(); }, [kirimDraf]);

  // Pesan dari halaman di dalam iframe: siap menerima draf (setelah dimuat),
  // dan hasil render tiap draf.
  useEffect(() => {
    function terima(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== bingkai.current?.contentWindow) return;
      if (event.data?.jenis === "tally-pratinjau-siap") kirimDraf();
      if (event.data?.jenis === "tally-pratinjau-hasil") {
        setTertinggal(event.data.pesan ? String(event.data.pesan) : event.data.ok ? null : "Pratinjau belum diperbarui.");
        // Halaman dirender ulang: pasang lagi garis sorot tanpa menggulir.
        if (event.data.ok) window.requestAnimationFrame(() => terapkanSorot(false));
      }
    }
    window.addEventListener("message", terima);
    return () => window.removeEventListener("message", terima);
  }, [kirimDraf, terapkanSorot]);
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
    <Pane aria-label="Pratinjau halaman acara">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-2.5">
        <p className={`line-clamp-2 min-w-0 flex-1 ${tertinggal ? "text-body-small text-error" : "text-body-medium text-on-surface-variant"}`} role="status" title={tertinggal ?? undefined}>
          {tertinggal ?? `Pratinjau langsung · ${width} px`}
        </p>
        <SegmentedButton<Device>
          label="Ukuran layar pratinjau"
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: "Desktop", icon: <Monitor size={16} /> },
            { value: "mobile", label: "Ponsel", icon: <DeviceMobile size={16} /> },
          ]}
        />
        <IconButton size="sm" label="Muat ulang pratinjau" onClick={() => setNonce((current) => current + 1)}>
          <ArrowClockwise size={16} />
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
            key={`${reloadKey}-${nonce}`}
            ref={bingkai}
            onLoad={() => terapkanSorot()}
            src={`/e/${slug}/pratinjau`}
            title="Pratinjau halaman acara"
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
  );
}
