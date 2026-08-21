import Link from "next/link";
import { ArrowSquareOut, Printer } from "@phosphor-icons/react/dist/ssr";
import { getPublicPageEvent } from "@/lib/auth/request-event";

/**
 * Panduan sistem — seluruh modul, bukan hanya operator booth.
 *
 * `/panduan` yang sudah ada adalah kartu cetak untuk staf booth dan kasir:
 * sepuluh langkah, dirancang untuk diletakkan di meja dan dibaca sambil melayani
 * antrean. Halaman ini menjawab pertanyaan yang berbeda — "modul ini untuk apa,
 * dan kapan saya membukanya" — dan pembacanya panitia yang sedang menyiapkan
 * acara, bukan yang sedang melayani orang.
 *
 * Susunannya SENGAJA mengikuti urutan kerja, bukan urutan menu di sidebar.
 * Panduan yang disusun mengikuti menu memaksa pembacanya melompat-lompat: menu
 * disusun menurut jenis pekerjaan, sedangkan orang yang baru pertama menyiapkan
 * acara butuh tahu apa yang dikerjakan lebih dulu.
 *
 * Tanpa autentikasi, sama seperti /panduan: isinya tidak memuat data peserta,
 * nominal, maupun kredensial — hanya penjelasan cara pakai — dan panitia harus
 * bisa membukanya di ponselnya sendiri tanpa login.
 */

export const metadata = { title: "Panduan Sistem — Tally" };

export const dynamic = "force-dynamic";

type Bagian = {
  id: string;
  judul: string;
  ringkas: string;
  isi: { judul: string; poin: string[] }[];
};

const BAGIAN: Bagian[] = [
  {
    id: "peta",
    judul: "1. Peta sistem",
    ringkas: "Apa saja yang ada di dalam Tally, dan siapa yang melihat apa.",
    isi: [
      {
        judul: "Tiga jenis layar",
        poin: [
          "Ruang kerja panitia — alamatnya /e/<slug>/admin/…, butuh login. Semua modul di sidebar ada di sini.",
          "Halaman publik — dibuka tamu di ponselnya sendiri tanpa login: halaman acara, formulir pendaftaran, rundown, denah kursi, dan halaman kode peserta.",
          "Layar panggung — ditayangkan ke proyektor: papan peringkat, undian, dan layar voting.",
        ],
      },
      {
        judul: "Satu acara, satu ruang kerja",
        poin: [
          "Setiap acara punya ruang kerjanya sendiri; data booth, peserta, dan transaksi tidak pernah bercampur antar acara.",
          "Berpindah acara lewat nama acara di bilah atas — ia menu, dan memilih acara lain membawa Anda ke halaman yang sama di acara itu.",
          "Alamat publik acara memakai slug: /e/<slug>. Alamat itulah yang dicetak di undangan dan QR.",
        ],
      },
    ],
  },
  {
    id: "persiapan",
    judul: "2. Persiapan, urut dari awal",
    ringkas: "Urutan ini bukan selera: langkah berikutnya membutuhkan hasil langkah sebelumnya.",
    isi: [
      {
        judul: "a. Pengaturan → tab Acara",
        poin: [
          "Zona waktu dipilih PALING AWAL. Ia menentukan arti setiap angka jam di seluruh sistem — order, audit, rundown, papan peringkat. Mengubahnya setelah ada transaksi membuat jam yang sudah tercatat terbaca berbeda.",
          "Mode penyerahan barang: langsung di booth, atau setelah pembayaran dikonfirmasi kasir. Pilihan ini mengubah langkah kerja staf booth dan isi panduan cetak mereka.",
          "Konfirmasi kasir: nyala berarti order menunggu kasir menandai lunas; mati berarti order langsung lunas di booth.",
        ],
      },
      {
        judul: "b. Pengaturan → tab User & role",
        poin: [
          "Buat akun untuk tiap peran: Admin Booth (melayani di booth), Kasir, Panitia/Admin, Super Admin.",
          "Satu akun booth per booth fisik, bukan satu akun dipakai bergantian — riwayat transaksi mengikuti akun yang login.",
          "PIN bisa direset kapan saja oleh admin; PIN lama tidak pernah ditampilkan lagi setelah dibuat.",
        ],
      },
      {
        judul: "c. Booth & item",
        poin: [
          "Tab Booth: kode booth (dicetak dan ditempel di booth), nama, status aktif, dan apakah booth ini menerima transaksi.",
          "Tab Item spesial: barang dengan harga khusus, kuota per peserta, syarat minimum belanja, dan apakah nilainya ikut dihitung ke papan peringkat.",
          "Booth baru otomatis mendapat satu item diskon bawaan; detailnya diatur di tab Item spesial.",
        ],
      },
      {
        judul: "d. Peserta",
        poin: [
          "Daftar peserta: tarik dari Event Scanner API, impor berkas, atau isi manual — tergantung sumber peserta yang dipilih di konfigurasi acara.",
          "Pendaftaran publik: nyalakan bila tamu mendaftar sendiri lewat formulir. Susun pertanyaannya di tab yang sama, lalu moderasi pendaftar yang masuk.",
          "Kode peserta terbit otomatis pada acara yang menyetujui pendaftaran secara otomatis; pada acara bermoderasi, kode terbit setelah panitia menekan Setujui.",
        ],
      },
    ],
  },
  {
    id: "publik",
    judul: "3. Halaman publik",
    ringkas: "Yang dilihat tamu sebelum hari-H, dari ponselnya sendiri.",
    isi: [
      {
        judul: "Halaman acara",
        poin: [
          "Isi halaman /e/<slug>: banner, tanggal, lokasi, deskripsi, angka penting, agenda, FAQ, sponsor, dan kontak panitia.",
          "Bagian yang dinyalakan tetapi belum ada isinya TIDAK muncul di halaman publik — tidak ada judul menggantung di atas ruang kosong.",
          "Warna merek diatur di sini, dan halaman pendaftaran mengikutinya. Ada saklar bila formulir memang harus berbeda warna.",
          "Pratinjau di layar CMS memuat halaman publik yang sungguhan; ia menampilkan versi TERSIMPAN, jadi tekan Simpan lebih dulu.",
        ],
      },
      {
        judul: "Rundown acara",
        poin: [
          "Susunan acara per sesi. Dipakai bersama oleh tiga tempat: halaman acara, layar rundown publik, dan penanda “sedang berlangsung”.",
          "Diisi sekali di sini, tidak perlu diketik ulang di halaman acara.",
        ],
      },
      {
        judul: "Denah kursi",
        poin: [
          "Peta meja dan kursi yang dibuka tamu lewat /denah untuk mencari tempat duduknya.",
          "Sumber penempatan bisa diambil dari sub-event di Scanner API, atau diatur manual.",
        ],
      },
    ],
  },
  {
    id: "panggung",
    judul: "4. Layar panggung",
    ringkas: "Tiga layar yang hidup saat MC memegang mikrofon. Buka di jendela terpisah, lalu lempar ke proyektor.",
    isi: [
      {
        judul: "Papan peringkat",
        poin: [
          "Menampilkan peringkat transaksi peserta di proyektor. Judul, warna, logo, dan tata letaknya diatur di modul ini.",
          "Reveal bertahap: peringkat dibuka satu per satu mengikuti aba-aba MC, bukan tampil sekaligus. Kontrolnya di halaman terpisah dalam modul yang sama.",
          "Pengecualian peserta: mengeluarkan nama tertentu dari papan — mis. panitia yang ikut bertransaksi.",
          "Nominal bisa disembunyikan; angkanya lalu tidak dikirim ke layar sama sekali, bukan sekadar ditutup di tampilan.",
        ],
      },
      {
        judul: "Undian",
        poin: [
          "Daftar hadiah, aturan kelayakan peserta, judul layar, efek panggung, dan warna latar.",
          "Panel operator dipakai saat acara: pilih hadiah, jalankan, lalu KONFIRMASI pemenang. Undian tidak selesai sendiri — tanpa konfirmasi, hasilnya tidak tercatat.",
          "Kesiapan undian di bagian atas modul memberi tahu apa yang masih kurang sebelum undian bisa dijalankan.",
        ],
      },
      {
        judul: "Voting langsung",
        poin: [
          "Pertanyaan beserta pilihannya, dibuka dan ditutup panitia saat acara berjalan.",
          "Layar panggung menampilkan hasil yang bergerak mengikuti suara masuk; hasilnya bisa diekspor per pertanyaan.",
          "Suara bisa dikosongkan bila sesi uji coba terlanjur tercatat.",
        ],
      },
    ],
  },
  {
    id: "hari-h",
    judul: "5. Hari-H",
    ringkas: "Urutan yang biasanya dipakai, dari tamu datang sampai acara selesai.",
    isi: [
      {
        judul: "Meja registrasi",
        poin: [
          "Tamu menunjukkan kode peserta (angka atau QR) dari email, halaman kodenya, atau gambar yang ia simpan.",
          "Kode juga selalu terlihat panitia di modul Pendaftaran publik, jadi tamu yang kehilangan kodenya tetap bisa dilayani.",
        ],
      },
      {
        judul: "Booth",
        poin: [
          "Staf booth memakai layar /booth: scan QR peserta, pilih item, isi nominal, simpan.",
          "Langkah lengkapnya ada di panduan cetak operator — cetak dan letakkan di meja booth.",
        ],
      },
      {
        judul: "Panggung",
        poin: [
          "Buka layar panggung di jendela terpisah sebelum acara dimulai, jangan saat MC sudah bicara.",
          "Papan peringkat menyesuaikan diri dalam beberapa detik setiap kali pengaturannya disimpan; tidak perlu memuat ulang layar proyektor.",
        ],
      },
    ],
  },
  {
    id: "sesudah",
    judul: "6. Setelah acara",
    ringkas: "Menutup pembukuan dan menyimpan jejaknya.",
    isi: [
      {
        judul: "Transaksi & Laporan",
        poin: [
          "Transaksi: seluruh order dengan filter status, booth, dan pencarian nomor stiker.",
          "Laporan: ringkasan pendapatan, per booth, dan angka rekonsiliasi untuk dicocokkan dengan uang fisik.",
        ],
      },
      {
        judul: "Audit trail",
        poin: [
          "Ada di Pengaturan → tab Audit trail, hanya untuk Super Admin.",
          "Mencatat siapa mengubah apa dan kapan: pengaturan, item spesial, booth, akun, dan pengosongan data.",
        ],
      },
    ],
  },
  {
    id: "masalah",
    judul: "7. Masalah yang sering muncul",
    ringkas: "",
    isi: [
      {
        judul: "Menu yang dinyalakan tidak muncul di halaman publik",
        poin: ["Bagian tanpa isi memang tidak dirender. Isi dulu kontennya, lalu tekan Simpan."],
      },
      {
        judul: "Peserta tidak menerima email kode",
        poin: [
          "Pengiriman email butuh kunci penyedia email disetel di server. Bila belum, layar moderasi menyebutkannya secara terbuka, bukan menampilkan “gagal kirim”.",
          "Kode tetap bisa dibacakan panitia dari modul Pendaftaran publik, dan tamu punya tautan halaman kode yang bisa dibuka kapan saja.",
        ],
      },
      {
        judul: "Jam di layar berbeda dengan jam di ruangan",
        poin: ["Periksa zona waktu di Pengaturan → Acara. Seluruh sistem memakai zona itu, bukan zona laptop panitia."],
      },
      {
        judul: "Angka di papan peringkat tidak sesuai",
        poin: [
          "Periksa item spesial mana yang dihitung ke papan peringkat — ada saklar per item.",
          "Periksa daftar pengecualian peserta di modul Papan peringkat.",
        ],
      },
    ],
  },
];

export default async function PanduanSistemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Slug dipakai HANYA untuk menautkan kembali ke ruang kerja acara yang sedang
  // dibuka. Isi panduannya sendiri sama untuk semua acara — ia menjelaskan cara
  // kerja sistem, bukan data acara.
  const event = await getPublicPageEvent(searchParams);
  const prefix = event ? `/e/${event.slug}` : "";

  return (
    <main className="min-h-dvh bg-surface px-5 pb-16 pt-8 text-on-surface sm:px-8">
      <div className="mx-auto max-w-[900px]">
        <p className="text-label-large font-semibold uppercase tracking-[0.18em] text-primary">Panduan sistem</p>
        <h1 className="mt-3 text-display-small font-semibold tracking-[-0.03em]">Cara memakai Tally</h1>
        <p className="mt-4 max-w-[68ch] text-body-large leading-8 text-on-surface-variant">
          Seluruh modul, disusun mengikuti urutan kerja: apa yang disiapkan lebih dulu, apa yang dipakai saat
          acara berjalan, dan apa yang dibereskan sesudahnya.
          {event ? <> Anda sedang membuka panduan dari ruang kerja <span className="font-semibold text-on-surface">{event.name}</span>.</> : null}
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`${prefix}/admin`}
            className="m3-state inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-label-large font-semibold text-on-primary"
          >
            Kembali ke aplikasi
          </Link>
          {/* Panduan cetak operator TIDAK digabung ke halaman ini. Ia dirancang
              untuk dicetak dan diletakkan di meja booth; menyatukannya berarti
              staf booth mencetak tujuh bagian yang tidak ia butuhkan saat sedang
              melayani antrean. */}
          <Link
            href={`${prefix}/panduan`}
            className="m3-state inline-flex min-h-12 items-center gap-2 rounded-full border border-outline px-6 text-label-large font-semibold"
          >
            <Printer size={18} />
            Panduan cetak operator booth &amp; kasir
            <ArrowSquareOut size={14} className="opacity-70" />
          </Link>
        </div>

        {/* Daftar isi. Panduan sepanjang ini dibuka untuk mencari satu jawaban,
            bukan dibaca dari atas ke bawah. */}
        <nav aria-label="Daftar isi" className="mt-10 rounded-[20px] border border-outline-variant bg-panel p-5">
          <p className="text-label-medium font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Daftar isi</p>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {BAGIAN.map((bagian) => (
              <li key={bagian.id}>
                <a href={`#${bagian.id}`} className="text-body-medium font-semibold text-primary hover:underline">
                  {bagian.judul}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {BAGIAN.map((bagian) => (
          <section key={bagian.id} id={bagian.id} className="scroll-mt-8 border-t border-outline-variant pt-8 first-of-type:mt-12">
            <h2 className="text-headline-small font-semibold tracking-tight">{bagian.judul}</h2>
            {bagian.ringkas ? (
              <p className="mt-2 max-w-[68ch] text-body-large leading-7 text-on-surface-variant">{bagian.ringkas}</p>
            ) : null}

            <div className="mt-6 space-y-6 pb-8">
              {bagian.isi.map((blok) => (
                <div key={blok.judul} className="rounded-[20px] border border-outline-variant bg-panel p-5">
                  <h3 className="text-title-medium font-semibold">{blok.judul}</h3>
                  <ul className="mt-3 space-y-2">
                    {blok.poin.map((poin) => (
                      <li key={poin} className="flex gap-3 text-body-medium leading-6 text-on-surface-variant">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{poin}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="border-t border-outline-variant pt-8 text-body-small text-on-surface-variant">
          Tally v{process.env.NEXT_PUBLIC_APP_VERSION ?? "—"} · Panduan ini menjelaskan cara kerja sistem, bukan data
          acara. Aman dibagikan ke seluruh panitia.
        </p>
      </div>
    </main>
  );
}
