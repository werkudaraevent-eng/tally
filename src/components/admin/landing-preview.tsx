"use client";

import { ArrowClockwise, DeviceMobile, Monitor } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
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
 * Konsekuensinya jujur dan disebutkan di layar: yang tampil adalah versi
 * TERSIMPAN. Menampilkan perubahan yang belum disimpan berarti mengirim seluruh
 * draf ke halaman publik lewat URL dan membuat halaman itu mau merendernya,
 * jalur yang sama persis dengan yang dipakai penyerang untuk menyuntikkan isi ke
 * halaman orang lain.
 *
 * Iframe dirender pada lebar perangkat sungguhan (390 atau 1440) lalu
 * DIPERKECIL dengan transform. Menyempitkan iframe-nya sendiri akan memicu
 * breakpoint ponsel di layar desktop, jadi yang terlihat bukan tata letak yang
 * akan dilihat tamu.
 */

type Device = "mobile" | "desktop";

const UKURAN: Record<Device, { width: number; height: number }> = {
  // 390×844: iPhone 14/15, ukuran yang paling banyak dipakai tamu.
  mobile: { width: 390, height: 844 },
  // 1440: sama dengan lebar grid halaman publik, jadi pratinjau desktop
  // menunjukkan tata letak pada lebar penuhnya, bukan versi yang terpotong.
  desktop: { width: 1440, height: 900 },
};

/** Jarak bidang pratinjau ke tepi panel, kiri + kanan. Sama dengan `p-4`. */
const TEPI = 32;

export function LandingPreview({ slug, reloadKey }: { slug: string; reloadKey: number }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [wadahUkuran, setWadahUkuran] = useState({ lebar: 0, tinggi: 0 });
  const [nonce, setNonce] = useState(0);
  const wadah = useRef<HTMLDivElement | null>(null);
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
        <p className="min-w-0 flex-1 text-body-medium text-on-surface-variant">Pratinjau versi tersimpan</p>
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
            src={`/e/${slug}`}
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
