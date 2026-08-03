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

// Lebar blok QR, dipakai bersama oleh kode QR dan daftar langkah di bawahnya.
//
// Satu blok, bukan dua lebar terpisah, supaya tepi kiri langkah SELALU sejajar
// dengan tepi kiri QR. Versi sebelumnya memberi panduan lebarnya sendiri, jadi
// panduan menjorok lebih kiri daripada QR dan ikut rata dengan teks ajakan.
//
// Porsi portrait `min(80vw, 26vh)` sengaja tanpa media query tambahan: batas `vh`
// otomatis mengambil alih pada layar sangat tinggi. Satu rumus ini melayani TV
// portrait biasa maupun LED 256x768 yang rasionya 1:3 — pada 1080x1920 hasilnya
// ~499px, pada 256x768 ~200px (78% lebar), cukup besar untuk dipindai.
const QR_BLOCK = "portrait:w-[min(80vw,26vh)] landscape:w-[min(34vmin,30vw,46vh)]";

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
        //
        // Sisi atas diberi porsi lebih besar daripada sisi lain. Dengan padding
        // seragam 2.6vmin, judul hanya berjarak 28px dari tepi atas pada TV
        // portrait 1080x1920 dan terlihat mepit, sementara ruang di tengah layar
        // justru berlimpah.
        padding: "clamp(20px, 4.6vmin, 76px) clamp(14px, 2.6vmin, 56px) clamp(14px, 2.6vmin, 56px)",
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

      {/* Inti layar. Portrait: QR di atas denah. Landscape: berdampingan.

          Portrait memakai `justify-evenly`. Karena denah tidak dapat mengisi tinggi
          yang tersisa, selalu ada ruang lebih di portrait; `justify-evenly` membagi
          ruang itu rata sehingga terbaca sebagai jarak yang disengaja, bukan dua
          lubang kosong seperti saat ruangnya menumpuk di satu tempat. */}
      <div
        className="flex w-full min-h-0 flex-1 justify-center portrait:flex-col portrait:items-center portrait:justify-evenly landscape:flex-row landscape:items-center"
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

          {/* QR dan panduan dibungkus satu blok berlebar sama, sehingga rata kiri
              keduanya terjamin tanpa perlu menyelaraskan dua rumus lebar terpisah. */}
          <div className={`flex flex-col ${QR_BLOCK}`}>
            <div
              className="w-full"
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
                tambahan, jadi tidak boleh tampil lebih pudar dari isi lainnya.

                `marginTop` jauh lebih besar daripada jeda antar-langkah maupun jeda
                ajakan ke QR. Ajakan dan QR adalah satu kesatuan ("pindai ini"),
                sedangkan panduan adalah babak berikutnya; jarak yang seragam membuat
                ketiganya terbaca sebagai satu tumpukan tanpa hierarki. */}
            <ol
              className="flex flex-col"
              style={{
                marginTop: "clamp(16px, 3.4vmin, 48px)",
                gap: "clamp(4px, 0.9vmin, 14px)",
                fontSize: "clamp(12px, max(1.9vmin, 0.9vw), 32px)",
              }}
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
        </div>

        {/* Denah sebagai orientasi ruangan, bukan sebagai daftar penghuni. Nomor
            meja saja sudah cukup menerjemahkan "meja 25" jadi "di sebelah sana". */}
        {/* 64%, menyeimbangkan kolom QR yang dipersempit ke 36%. Kalau dibiarkan
            58% ada 6% lebar yang tidak dipakai siapa pun, dan denah tampil lebih
            kecil dari ruang yang sebenarnya tersedia untuknya. */}
        {/* Sengaja TIDAK memakai `flex-1` di portrait. Denah dibatasi lebar, bukan
            tinggi, jadi memberinya sisa tinggi tidak membuatnya lebih besar — hanya
            memindahkan ruang kosong ke atas dan bawahnya. Membiarkan tingginya
            sesuai isi membuat `justify-evenly` di induk yang mengatur jaraknya. */}
        <div className="flex w-full min-w-0 items-center justify-center portrait:min-h-0 landscape:max-h-[74vh] landscape:w-[64%]">
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
            //
            // Portrait dinaikkan 34vh -> 52vh. Angka lama menyisakan ruang kosong
            // yang tidak dipakai siapa pun; denah adalah isi terpadat di layar ini,
            // jadi ruang itu lebih berguna untuknya. Batas tetap ada supaya denah
            // tidak pernah mendorong QR keluar dari pandangan.
            className="mx-auto portrait:max-h-[52vh] landscape:max-h-[68vh]"
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
