"use client";

import { useEffect, useState } from "react";
import { SeatMapView, type SeatState } from "@/components/seat-map-view";
import type { SeatMapConfig } from "@/lib/seat-map";

// Tampilan untuk LED publik tanpa layar sentuh.
//
// Tidak ada yang bisa mengetik di layar ini, jadi pencarian dipindahkan ke HP
// tamu lewat QR. Konsekuensi pentingnya: nama peserta tidak pernah tampil di
// sini. Memajang ratusan nama di ruang terbuka adalah harga yang tidak sebanding
// dengan kemudahannya, sementara QR memberi hasil yang sama tanpa biaya itu.
//
// Ukuran seluruhnya relatif terhadap layar. LED punya banyak resolusi dan sering
// baru diketahui saat pemasangan, jadi tidak ada satu pun ukuran piksel tetap:
// semua memakai `vmin`, `vh`, dan `clamp()` sehingga tata letaknya menyesuaikan
// diri tanpa perlu disetel ulang.
//
// Arah layar ditangani dengan varian `portrait:` dan `landscape:`, bukan lebar
// layar. Yang menentukan bentuk tata letak di sini adalah orientasinya: portrait
// menumpuk QR di atas denah, landscape menaruh keduanya berdampingan. Menumpuk
// pada layar landscape menyisakan ruang kosong di samping sementara isinya
// justru melimpah ke bawah sampai denah terdorong keluar pandangan.

// Lebar blok QR dipakai bersama oleh kode QR dan daftar langkah di bawahnya.
// Sebelumnya panduan memakai lebar penuh kolom sementara QR jauh lebih sempit,
// sehingga keduanya terbaca sebagai dua elemen lepas alih-alih satu ajakan.
const QR_BLOCK_WIDTH = "portrait:w-[min(42vmin,54vw,30vh)] landscape:w-[min(34vmin,30vw,46vh)]";

// Panduan dipecah menjadi langkah bernomor, bukan satu kalimat panjang.
//
// Tamu membaca layar ini sambil berjalan dan sering dari beberapa meter. Satu
// kalimat mengalir menuntut dibaca utuh sebelum berguna, sedangkan tiga langkah
// pendek dapat ditangkap sekilas dan langsung diikuti.
const SCAN_STEPS = ["Buka kamera ponsel", "Arahkan ke kode QR di atas", "Ketik nama Anda"] as const;

type Summary = {
  total_tables: number;
  total_seats: number;
  occupied_seats: number;
};

export type SeatMapLedViewProps = {
  config: Partial<SeatMapConfig> | null | undefined;
  seatStates: Record<string, SeatState>;
  summary: Summary | null;
  sessionSlug: string | null;
  title: string;
  subtitle: string | null;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  /** Waktu data terakhir berhasil dimuat; kosong berarti belum pernah berhasil. */
  lastLoadedAt: string | null;
};

export function SeatMapLedView({
  config,
  seatStates,
  summary,
  sessionSlug,
  title,
  subtitle,
  backgroundColor,
  textColor,
  accentColor,
  lastLoadedAt,
}: SeatMapLedViewProps) {
  // Panel LED bisa meninggalkan bekas bila menampilkan gambar yang sama
  // berjam-jam. Seluruh isi digeser beberapa piksel secara berkala supaya tidak
  // ada tepi yang menetap di posisi yang sama sepanjang acara.
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setShift((current) => (current + 1) % 4), 90000);
    return () => window.clearInterval(interval);
  }, []);
  const nudge = [0, 3, 0, -3][shift];

  const qrSource = `/api/seat-map/qr?size=900${sessionSlug ? `&sesi=${encodeURIComponent(sessionSlug)}` : ""}`;

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-between overflow-hidden"
      style={{
        background: backgroundColor,
        color: textColor,
        // Padding ikut ukuran layar, bukan angka tetap, agar proporsinya tetap
        // terjaga dari monitor 24 inci sampai LED beberapa meter.
        padding: "clamp(14px, 2.6vmin, 56px)",
        gap: "clamp(8px, 1.6vmin, 28px)",
        transform: `translateY(${nudge}px)`,
        transition: "transform 3s ease-in-out",
      }}
    >
      <header className="w-full shrink-0 text-center">
        {subtitle ? (
          <p
            className="font-semibold uppercase opacity-75"
            style={{ fontSize: "clamp(11px, 1.5vmin, 28px)", letterSpacing: "0.3em" }}
          >
            {subtitle}
          </p>
        ) : null}
        <h1
          className="text-balance font-bold uppercase"
          style={{
            fontSize: "clamp(20px, 3.9vmin, 76px)",
            lineHeight: 1.1,
            letterSpacing: "0.02em",
            marginTop: "clamp(2px, 0.8vmin, 14px)",
          }}
        >
          {title}
        </h1>
      </header>

      {/* Inti layar. Portrait: QR di atas denah. Landscape: berdampingan. */}
      <div
        className="flex w-full min-h-0 flex-1 items-center justify-center portrait:flex-col landscape:flex-row"
        style={{ gap: "clamp(10px, 2.4vmin, 44px)" }}
      >
        {/* Kolom dipersempit dari 42%: QR tidak pernah selebar itu, jadi sisanya
            hanya menjadi ruang kosong yang membuat blok QR tampak mengapung. */}
        <div
          className="flex shrink-0 flex-col items-center landscape:w-[36%]"
          style={{ gap: "clamp(6px, 1.4vmin, 24px)" }}
        >
          {/* Ajakan bertindak ditaruh sebelum QR: orang membaca dari atas, jadi
              ia perlu tahu untuk apa QR itu sebelum mengeluarkan ponsel. */}
          <p
            className="text-center font-semibold"
            style={{ fontSize: "clamp(15px, 2.6vmin, 48px)", lineHeight: 1.25, color: accentColor }}
          >
            Pindai untuk melihat tempat duduk Anda
          </p>

          {/* Sisi QR dibatasi lebar maupun tinggi. Tanpa batas tinggi, pada layar
              yang sangat panjang QR akan mendorong denah keluar dari pandangan. */}
          <div
            className={QR_BLOCK_WIDTH}
            style={{
              background: "#ffffff",
              padding: "clamp(6px, 1.2vmin, 20px)",
              aspectRatio: "1 / 1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Dilayani sebagai SVG dari server: tajam pada resolusi berapa pun,
                dan tidak bergantung pada JavaScript yang berjalan di layar ini. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSource}
              alt="Kode QR menuju halaman denah tempat duduk"
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          </div>

          {/* Ukuran huruf memakai `max(vmin, vw)`, bukan `vmin` saja.
              Pada layar lebar tetapi pendek, `vmin` terikat pada TINGGI, sehingga
              panduan menyusut menjadi belasan piksel meski ruang mendatarnya luas.
              Itulah sebab utama panduan lama nyaris tak terbaca dari jauh.

              Opasitas juga dilepas: panduan ini instruksi utama, bukan keterangan
              tambahan, jadi tidak boleh tampil lebih pudar dari isi lainnya. */}
          <ol
            className={`flex flex-col ${QR_BLOCK_WIDTH}`}
            style={{ gap: "clamp(4px, 0.9vmin, 14px)", fontSize: "clamp(12px, max(1.9vmin, 0.9vw), 32px)" }}
          >
            {SCAN_STEPS.map((step, index) => (
              <li key={step} className="flex items-center" style={{ gap: "clamp(6px, 1.1vmin, 16px)" }}>
                <span
                  className="flex shrink-0 items-center justify-center rounded-full font-bold"
                  style={{
                    background: accentColor,
                    color: backgroundColor,
                    width: "clamp(17px, 2.6vmin, 42px)",
                    height: "clamp(17px, 2.6vmin, 42px)",
                    fontSize: "clamp(10px, 1.5vmin, 24px)",
                    lineHeight: 1,
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ lineHeight: 1.3 }}>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Denah sebagai orientasi ruangan, bukan sebagai daftar penghuni. Nomor
            meja saja sudah cukup menerjemahkan "meja 25" jadi "di sebelah sana". */}
        {/* 64%, menyeimbangkan kolom QR yang dipersempit ke 36%. Kalau dibiarkan
            58% ada 6% lebar yang tidak dipakai siapa pun, dan denah tampil lebih
            kecil dari ruang yang sebenarnya tersedia untuknya. */}
        <div className="flex w-full min-w-0 items-center justify-center portrait:max-h-[36vh] landscape:max-h-[74vh] landscape:w-[64%]">
          <SeatMapView
            config={config}
            seatStates={seatStates}
            backgroundColor={backgroundColor}
            textColor={textColor}
            accentColor={accentColor}
            showSeatCodes={false}
            // Batas tinggi dipasang lewat kelas bersatuan viewport, bukan
            // `maxHeight: 100%`. Persentase butuh induk dengan tinggi pasti;
            // di dalam flex hal itu tidak terjamin, sehingga pada layar sangat
            // lebar denah melewati batas dan terpotong.
            className="mx-auto portrait:max-h-[34vh] landscape:max-h-[68vh]"
          />
        </div>
      </div>

      <footer className="w-full shrink-0 text-center">
        {summary ? (
          <p className="font-semibold" style={{ fontSize: "clamp(11px, 1.8vmin, 32px)" }}>
            {summary.total_tables} Meja · {summary.total_seats} Kursi
          </p>
        ) : null}
        <p
          className="opacity-55"
          style={{ fontSize: "clamp(9px, 1.2vmin, 20px)", marginTop: "clamp(2px, 0.5vmin, 8px)" }}
        >
          {/* Penanda halus bahwa layar masih hidup. Kalau jaringan terputus,
              angka ini berhenti bergerak sementara denah tetap tampil, sehingga
              panitia bisa menyadarinya tanpa pesan error yang menutupi layar. */}
          {lastLoadedAt ? `Diperbarui ${lastLoadedAt}` : "Menyiapkan data…"}
        </p>
      </footer>
    </div>
  );
}
