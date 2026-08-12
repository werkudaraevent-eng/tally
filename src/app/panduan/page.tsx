import { getPublicPageEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { boothSteps, cashierSteps, stepImages, type GuideStep } from "@/lib/panduan-steps";

// Panduan versi cetak, satu halaman per peran.
//
// Kenapa perlu meski panel bantuan sudah ada: kertas di meja booth tetap terbaca
// saat HP sedang dipakai melayani peserta, dan berguna untuk briefing sebelum
// acara. Panel untuk saat butuh cepat, kertas untuk saat belajar.
//
// Tanpa autentikasi dengan sengaja: panduan ini tidak memuat data peserta,
// nominal, maupun kredensial, dan harus bisa dibuka lalu dicetak oleh panitia
// tanpa login lebih dulu.

export const metadata = { title: "Panduan Operator — Tally" };

// WAJIB dynamic. Tanpa ini Next.js memprerender halaman ini saat build (terlihat
// sebagai `○ /panduan` di output build), sehingga isinya terkunci pada nilai
// event_settings saat build dan TIDAK ikut berubah ketika admin mengganti
// pickup_mode atau cashier_confirmation_required. Itu menghapus sifat adaptif yang
// justru jadi alasan halaman ini membaca setting.
export const dynamic = "force-dynamic";

async function loadSettings(eventId: string) {
  const { data } = await getSupabaseServiceClient()
    .from("event_settings")
    .select("pickup_mode,cashier_confirmation_required,pending_auto_void_minutes")
    .eq("event_id", eventId)
    .single() as { data: { pickup_mode: string; cashier_confirmation_required: boolean; pending_auto_void_minutes: number } | null };
  return data;
}

// Satu langkah di kertas. Gambar ditampilkan kecil dan di bawah teksnya, bukan
// selebar kolom seperti di panel aplikasi: panduan satu halaman bisa membengkak
// menjadi belasan halaman dan boros tinta kalau setiap gambar dicetak besar.
//
// `break-inside-avoid` menjaga gambar tidak terpisah dari instruksinya saat
// halaman terpotong — gambar tanpa kalimatnya tidak ada gunanya di kertas.
function PrintStep({ step, number }: { step: GuideStep; number: number }) {
  const images = stepImages(step.id);
  return <li className="flex gap-3 break-inside-avoid text-sm leading-6">
    <span className="w-5 shrink-0 text-right font-bold">{number}.</span>
    <div className="min-w-0">
      <span>{step.printText ?? step.text}</span>
      {/* next/image mewajibkan dimensi tepat per gambar, sedangkan screenshot
          panduan ditambahkan belakangan dengan ukuran berbeda-beda; angka yang
          salah membuat gambar tampak gepeng. Halaman ini juga dicetak, bukan
          disusuri, jadi optimasi pemuatan tidak relevan di sini. */}
      {images ? <span className="mt-1.5 flex flex-wrap gap-2">
        {images.map((image) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.src}
            src={image.src}
            alt={image.alt}
            className="h-auto w-full max-w-[240px] border border-[#d9ddd7]"
          />
        ))}
      </span> : null}
    </div>
  </li>;
}

export default async function PanduanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Slug diteruskan proxy sebagai `?eventSlug=`. Tanpa event yang bisa
  // ditentukan, panduan tetap tercetak memakai nilai bawaan di bawah -- kertas
  // panduan yang gagal dibuka lebih merugikan daripada yang memakai default.
  const event = await getPublicPageEvent(searchParams);
  const settings = event ? await loadSettings(event.id) : null;
  // Isi menyesuaikan setting aktif. Panduan cetak yang bertentangan dengan alur
  // sebenarnya lebih berbahaya daripada tidak ada panduan, karena kertas tidak
  // bisa diperbarui setelah dibagikan.
  const viaCashier = settings?.cashier_confirmation_required !== false;
  const handOverNow = settings?.pickup_mode === "immediate";
  const autoVoid = settings?.pending_auto_void_minutes ?? 45;

  // Langkah diambil dari modul bersama dengan panel bantuan dalam aplikasi.
  // Sebelumnya kertas dan panel menyimpan kalimatnya masing-masing, dan begitu
  // gambar ditambahkan, gambar yang sama bisa berpasangan dengan kalimat berbeda
  // di kedua tempat tanpa ada yang menyadarinya.
  const boothFlow = boothSteps({ viaCashier, handOverNow });
  const cashierFlow = cashierSteps({ viaCashier, handOverNow });

  const masalah: Array<{ q: string; a: string[] }> = [
    { q: "QR tidak terbaca kamera", a: ["Badge jangan terlipat atau tertutup plastik yang memantul.", "Jauhkan sedikit dari kamera, jangan terlalu dekat.", "Hindari lampu menyorot langsung ke badge.", "Tetap gagal? Pakai Cari peserta manual."] },
    { q: "Peserta tidak ditemukan", a: ["Coba potongan nama saja, bukan nama lengkap.", "Coba nama instansi.", "Peserta baru bisa belum tersinkron; sistem menarik data tiap 15 menit.", "Tetap tidak ada? Lapor admin. Jangan pakai peserta lain."] },
    { q: "Item spesial tidak bisa dipilih", a: ["Baca alasan di bawah nama item, sistem selalu menyebutkannya.", "Sudah diambil = kuota peserta habis.", "Stok habis = jatah booth habis.", "Syarat belum terpenuhi = total belanja peserta belum cukup; angka kurangnya tertulis.", "Bukan kerusakan. Order tetap bisa dibuat tanpa item spesial."] },
    { q: "Salah input nominal atau salah peserta", a: [
      viaCashier ? "Jangan buat order baru sebagai pengganti. Minta kasir mem-void order yang salah." : "Tekan Void pada baris order di daftar Order booth ini.",
      viaCashier ? "Sebutkan nomor order yang salah ke kasir." : "Isi alasan void, misal salah input nominal. Alasan wajib dan tercatat.",
      "Setelah di-void, buat order baru dengan data benar.",
      handOverNow
        ? "Nomor order lama tidak bisa dipakai lagi. Naikkan nomornya satu angka."
        : "Nomor stiker lama tidak bisa dipakai lagi. Gunakan stiker berikutnya.",
    ] },
    // Tanpa stiker fisik, dua HP di satu booth bisa mendapat nomor otomatis yang
    // sama karena nomor dihitung saat layar dimuat. Langkah pemulihannya wajib
    // tertulis supaya staf tidak menebak atau mengira aplikasinya rusak.
    handOverNow
      ? { q: "Muncul pesan nomor order sudah terpakai", a: ["Terjadi kalau satu booth memakai lebih dari satu HP dan keduanya dapat nomor sama.", "Naikkan angka nomor order satu angka, lalu tekan Buat order lagi.", "Ulangi kalau masih tertolak. Order tidak akan tercatat dua kali."] }
      : { q: "Nomor stiker sudah terpakai", a: ["Satu nomor stiker hanya sekali pakai, termasuk yang sudah di-void.", "Ambil stiker fisik berikutnya.", "Jangan menebak nomor. Isi sesuai stiker yang ditempel."] },
    { q: "Muncul banner merah OFFLINE", a: ["JANGAN buat order. Order tidak akan tersimpan.", "Tunggu banner hilang sendiri.", "Lama tidak hilang? Pindah area sinyal atau ganti jaringan.", "Order yang sudah tersimpan tetap aman."] },
  ];

  if (viaCashier) {
    masalah.splice(4, 0, { q: `Order hilang setelah ${autoVoid} menit`, a: [`Order belum dibayar lebih dari ${autoVoid} menit otomatis dibatalkan sistem.`, "Normal, bukan kerusakan. Kuota item spesial peserta kembali.", "Peserta datang terlambat? Buat order baru."] });
  }

  return <main className="mx-auto max-w-3xl bg-white px-8 py-10 text-[#17211d] print:px-0 print:py-0">
    <div className="print:hidden mb-8 flex flex-wrap items-center justify-between gap-3 border border-[#d9ddd7] bg-[#f5f4f0] p-4">
      <p className="text-sm">Tekan <span className="font-semibold">Ctrl + P</span> untuk mencetak. Letakkan di meja booth.</p>
      <a href="/booth" className="min-h-11 border border-[#d9ddd7] bg-white px-4 text-sm font-semibold leading-[2.75rem]">Kembali ke aplikasi</a>
    </div>

    <header className="border-b-2 border-[#17211d] pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#66736c]">Panduan Operator</p>
      <h1 className="mt-1 text-3xl font-bold">Tally — Event Transaction Hub</h1>
      <p className="mt-2 text-sm text-[#66736c]">
        Alur aktif: {viaCashier ? "pembayaran lewat kasir" : "tanpa kasir, order langsung lunas"} ·{" "}
        {handOverNow ? "barang diserahkan langsung di booth" : "barang diambil setelah lunas"}
      </p>
    </header>

    <section className="mt-8 break-inside-avoid">
      <h2 className="text-lg font-bold">A. Admin Booth</h2>
      <ol className="mt-3 space-y-2">{boothFlow.map((step, index) => <PrintStep key={step.id} step={step} number={index + 1} />)}</ol>

      <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.1em]">Arti status order</h3>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          {[
            ["Menunggu kasir", "Belum dibayar. Jangan serahkan barang."],
            ["Lunas, siap diserahkan", "Sudah dibayar. Serahkan barang, lalu tekan Serahkan barang."],
            ["Sudah diserahkan", "Selesai. Tidak ada tindakan lagi."],
            ["Void", "Dibatalkan. Tidak dihitung, kuota item spesial peserta kembali."],
          ].map(([status, arti]) => <tr key={status} className="border-b border-[#d9ddd7]">
            <td className="w-56 py-2 pr-3 align-top font-semibold">{status}</td>
            <td className="py-2 align-top">{arti}</td>
          </tr>)}
        </tbody>
      </table>
    </section>

    <section className="mt-8 break-inside-avoid">
      <h2 className="text-lg font-bold">B. Kasir</h2>
      <ol className="mt-3 space-y-2">{cashierFlow.map((step, index) => <PrintStep key={step.id} step={step} number={index + 1} />)}</ol>
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-bold">C. Kalau ada masalah</h2>
      <div className="mt-3 space-y-4">{masalah.map((item) => <div key={item.q} className="break-inside-avoid">
        <p className="text-sm font-bold">{item.q}</p>
        <ul className="mt-1 space-y-0.5">{item.a.map((line, index) => <li key={index} className="flex gap-2 text-sm leading-6">
          <span aria-hidden="true">–</span><span>{line}</span>
        </li>)}</ul>
      </div>)}</div>
    </section>

    <footer className="mt-10 border-t border-[#d9ddd7] pt-4 text-xs text-[#66736c]">
      <p className="font-semibold">Aturan penting</p>
      <p className="mt-1">Jangan pernah membuat order saat banner merah OFFLINE muncul{handOverNow ? "" : " · Nomor stiker harus sama dengan stiker fisik di barang"} · Periksa nama peserta dan angka TOTAL sebelum menekan Buat order · Setiap void wajib diberi alasan dan tercatat.</p>
    </footer>
  </main>;
}
