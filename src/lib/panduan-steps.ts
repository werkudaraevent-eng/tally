// Langkah panduan operator, dipakai bersama panel bantuan dalam aplikasi dan
// halaman versi cetak.
//
// Kenapa satu modul: sebelumnya kedua tempat menyimpan daftar langkahnya sendiri
// dengan kalimat yang sudah mulai berbeda. Begitu gambar ditambahkan, dua salinan
// berarti gambar bisa berpasangan dengan kalimat yang tidak sama di panel dan di
// kertas, dan tidak ada yang menyadarinya sampai staf membandingkan keduanya.
//
// Setiap langkah punya `id` yang tetap, dan gambar diikat ke `id` itu, BUKAN ke
// nomor urutnya. Alasannya penting: isi panduan berubah mengikuti event_settings.
// Dengan `pickup_mode` berbeda, langkah kelima bisa berarti "nomor order sudah
// otomatis" atau "isi nomor stiker fisik" — dua layar yang sama sekali berbeda.
// Kalau gambar diikat ke posisi, mengubah satu setting akan memasangkan gambar
// dengan instruksi yang salah, dan itu lebih berbahaya daripada tidak ada gambar
// karena orang lebih percaya pada gambar daripada tulisan.

export type EventFlags = {
  /** `cashier_confirmation_required` — pembayaran lewat kasir. */
  viaCashier: boolean;
  /** `pickup_mode === "immediate"` — barang diserahkan langsung di booth. */
  handOverNow: boolean;
};

export type GuideStep = {
  /** Identitas tetap; jadi kunci pemasangan gambar. */
  id: string;
  /** Kalimat untuk panel dalam aplikasi. */
  text: string;
  /** Kalimat versi cetak bila perlu lebih ringkas; jatuh ke `text` bila kosong. */
  printText?: string;
};

/**
 * Gambar yang tersedia di `public/panduan/`.
 *
 * Daftar ini yang menentukan gambar mana yang dirender. Browser tidak bisa
 * menanyakan apakah sebuah berkas ada, jadi tanpa daftar ini setiap langkah yang
 * gambarnya belum disiapkan akan menampilkan ikon gambar rusak di layar staf —
 * terlihat seperti aplikasi yang bermasalah.
 *
 * Cara menambah gambar: taruh berkasnya di `public/panduan/`, lalu daftarkan di
 * sini dengan `alt` yang menjelaskan isinya. Lihat `public/panduan/README.md`
 * untuk daftar berkas yang dibutuhkan.
 */
export const STEP_IMAGES: Record<string, { src: string; alt: string }[]> = {
  // Satu langkah boleh punya lebih dari satu gambar. Langkah scan memang butuh
  // dua: tombolnya dulu, lalu layar pemindainya. Memaksa satu gambar per
  // langkah akan membuat salah satu dari keduanya hilang.
  //
  // Nama berkas tidak boleh diawali titik: berkas titik di folder public tidak
  // dilayani, sehingga gambarnya gagal dimuat tanpa pesan apa pun.
  "scan-qr": [
    { src: "/panduan/booth-01-scan-qr.png", alt: "Tombol SCAN QR di layar booth" },
    { src: "/panduan/booth-02-scanner-aktif.png", alt: "Layar pemindai QR sedang aktif, kamera diarahkan ke QR badge" },
  ],
  "periksa-nama": [
    { src: "/panduan/booth-03-periksa-nama.png", alt: "Kartu nama peserta setelah QR terbaca" },
  ],
  "item-spesial": [
    { src: "/panduan/booth-04-item-spesial.png", alt: "Item spesial yang tidak bisa dicentang beserta alasannya, kolom nominal, dan angka TOTAL" },
  ],
  // Hanya berlaku saat barang diserahkan langsung. Pada mode ambil setelah
  // lunas, langkah yang tampil adalah `nomor-stiker` dan belum ada gambarnya.
  "nomor-order-otomatis": [
    { src: "/panduan/booth-06-nomor-order.png", alt: "Kolom nomor order yang sudah terisi otomatis" },
  ],
  "selesai-lunas-serah-langsung": [
    { src: "/panduan/booth-08-selesai.png", alt: "Layar order berhasil dibuat dan tercatat lunas" },
  ],
};

export function stepImages(id: string) {
  return STEP_IMAGES[id];
}

/** Langkah membuat order di booth. */
export function boothSteps({ viaCashier, handOverNow }: EventFlags): GuideStep[] {
  return [
    {
      id: "scan-qr",
      text: "Tekan SCAN QR, arahkan kamera ke badge peserta. Kalau QR tidak terbaca, pakai Cari peserta manual.",
      printText: "Tekan SCAN QR. Arahkan kamera ke QR pada badge peserta.",
    },
    {
      id: "cari-manual",
      text: "Kalau QR tetap tidak terbaca, tekan Cari peserta manual lalu cari pakai nama atau instansi.",
    },
    {
      id: "periksa-nama",
      text: "Periksa nama peserta yang muncul sudah benar.",
    },
    {
      id: "item-spesial",
      text: "Centang item spesial bila peserta mengambilnya. Kalau tidak bisa dicentang, alasannya tertulis di bawah nama item.",
    },
    {
      id: "nominal",
      // Contoh penjumlahan disebut di kalimatnya, bukan sebagai langkah terpisah.
      // Kolomnya memang satu dan tetap boleh diisi satu angka; menjadikannya langkah
      // sendiri akan terbaca sebagai kewajiban baru untuk setiap order.
      text: "Isi nominal item reguler. Kalau peserta beli beberapa barang, boleh langsung dijumlahkan di kolomnya, contoh 12000+5000+3000 — hasilnya muncul di bawah kolom. Cek angka TOTAL sebelum lanjut.",
      printText: "Isi nominal item reguler. Beberapa barang boleh dijumlahkan langsung, contoh 12000+5000+3000. Cek angka TOTAL sebelum lanjut.",
    },
    // Dua id berbeda, bukan satu id dengan dua kalimat: layarnya memang berbeda,
    // jadi gambarnya pun harus berbeda dan tidak boleh saling menggantikan.
    handOverNow
      ? {
        id: "nomor-order-otomatis",
        text: "Nomor order sudah terisi otomatis. Biarkan apa adanya, lanjut ke langkah berikutnya.",
      }
      : {
        id: "nomor-stiker",
        text: "Isi nomor stiker sesuai stiker fisik yang ditempel. Nomor lanjut otomatis, ubah bila tidak sesuai.",
      },
    {
      id: "buat-order",
      text: "Tekan Buat order.",
    },
    viaCashier
      ? (handOverNow
        ? { id: "selesai-kasir-serah-langsung", text: "Serahkan barang sekarang, lalu arahkan peserta ke kasir untuk membayar." }
        : { id: "selesai-kasir-rak", text: "Tempel stiker pada barang, simpan di rak booth, arahkan peserta ke kasir. Barang diserahkan setelah lunas." })
      : (handOverNow
        ? { id: "selesai-lunas-serah-langsung", text: "Order langsung tercatat lunas. Serahkan barang sekarang. Peserta TIDAK perlu ke kasir." }
        : { id: "selesai-lunas-rak", text: "Order langsung tercatat lunas. Tempel stiker, simpan di rak, serahkan saat peserta kembali." }),
  ];
}

/** Langkah menerima pembayaran di kasir. */
export function cashierSteps({ viaCashier }: EventFlags): GuideStep[] {
  if (!viaCashier) {
    return [
      {
        id: "kasir-dimatikan",
        text: "Konfirmasi kasir sedang DIMATIKAN admin. Order booth langsung tercatat lunas dan tidak masuk antrean kasir.",
      },
      {
        id: "kasir-tanpa-tindakan",
        text: "Tidak ada tindakan yang perlu dilakukan di layar ini sampai admin mengaktifkan kembali konfirmasi kasir.",
      },
    ];
  }
  return [
    { id: "kasir-pilih-peserta", text: "Pilih peserta dari antrean pembayaran, atau scan QR badge, atau cari nama." },
    { id: "kasir-centang-order", text: "Centang order yang akan dibayar. Peserta boleh membayar sebagian dulu." },
    { id: "kasir-cek-total", text: "Cek angka TOTAL bersama peserta sebelum menagih." },
    { id: "kasir-metode", text: "Pilih metode pembayaran." },
    { id: "kasir-referensi", text: "Bila metode meminta nomor referensi, isi sesuai struk. Tombol Tandai lunas mati sampai nomor lengkap." },
    { id: "kasir-tandai-lunas", text: "Tekan Tandai lunas. Sebutkan nomor order yang muncul ke peserta." },
  ];
}
