"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { expressive } from "@/lib/m3/motion";
import { BrandFooter, BrandHeader } from "@/components/brand-header-footer";
import { fontStack, type Branding } from "@/lib/branding";
import { readableOn } from "@/lib/color";
import { votePercentages, type PublicVoteState } from "@/lib/vote";

// Layar panggung voting. Bar bergerak mengikuti suara yang masuk.
//
// Polling, bukan websocket — konsisten dengan seluruh layar publik aplikasi ini,
// dan endpoint yang dibacanya sengaja dapat di-cache CDN sehingga ratusan HP
// peserta yang membaca alamat yang sama tidak membebani origin.

const POLL_MS = 2000;

export default function VoteScreenClient({ voteUrl, joinHost, joinCode, title, subtitle, accent, text, background, backgroundImage, panelColor, branding }: {
  /** Alamat yang dipindai peserta. Dirender jadi QR di sudut layar. */
  voteUrl: string;
  /** Host tanpa skema, untuk dibaca dan diketik peserta: "acara.com/join". */
  joinHost: string;
  /** Tujuh angka. Null bila acara tidak membuka jalur kode. */
  joinCode: string | null;
  title: string;
  subtitle: string | null;
  accent: string;
  text: string;
  background: string;
  backgroundImage: string | null;
  /** Warna bidang di belakang daftar hasil. Null = dihitung dari latar. */
  panelColor: string | null;
  branding: Branding;
}) {
  const [state, setState] = useState<PublicVoteState>({ poll: null });
  const [qr, setQr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/vote/state", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    setState((await response.json()) as PublicVoteState);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  /*
    Layar ini tidak pernah menggulir, jadi dokumennya tidak boleh menyisakan
    jalur scrollbar.

    `globals.css` memasang `scrollbar-gutter: stable` pada <html> secara global,
    dan itu keputusan yang benar untuk halaman aplikasi: tanpa jalur permanen,
    lebar viewport berubah begitu halaman cukup panjang untuk memunculkan
    scrollbar, dan seluruh isi bergeser ke kiri. Tetapi di layar proyektor
    jalur itu tampil sebagai pita putih di tepi kanan — persis yang terlihat —
    padahal tidak ada yang pernah digulirkan di sana.

    Dimatikan lewat gaya inline pada elemen, bukan lewat kelas di CSS global:
    aturan ini hanya berlaku selama layar ini terbuka, dan dikembalikan saat
    ditinggalkan supaya halaman admin berikutnya tetap mendapat jalurnya.
  */
  useEffect(() => {
    const root = document.documentElement;
    const gutterSebelumnya = root.style.scrollbarGutter;
    const overflowSebelumnya = root.style.overflow;
    root.style.scrollbarGutter = "auto";
    root.style.overflow = "hidden";
    return () => {
      root.style.scrollbarGutter = gutterSebelumnya;
      root.style.overflow = overflowSebelumnya;
    };
  }, []);

  // QR dibuat sekali di klien. Paket `qrcode` sudah menjadi dependensi aplikasi
  // dan diimpor dinamis supaya tidak ikut membebani muatan awal layar.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(voteUrl, { margin: 1, width: 480 });
      if (!cancelled) setQr(url);
    })();
    return () => { cancelled = true; };
  }, [voteUrl]);

  const poll = state.poll;
  const counts = poll?.options.map((option) => option.vote_count ?? 0) ?? [];
  const percentages = votePercentages(counts);
  const leading = counts.length > 0 ? Math.max(...counts) : 0;

  const headingFont = fontStack(branding.heading_font);
  /*
    PANEL BAWAAN ADALAH LAPISAN TEMBUS PANDANG, bukan warna yang dihitung.

    Versi sebelumnya menurunkan warna panel dari `background_color`. Itu keliru
    sejak awal: yang benar-benar terlihat penonton adalah GAMBAR latar yang
    diunggah panitia, sementara `background_color` hanya warna cadangan di
    belakangnya. Dua sumber yang berbeda, jadi hasilnya tidak akan pernah cocok
    — panel abu kecoklatan di atas gradien biru, persis seperti yang terjadi.

    Menebak warna dominan gambar juga bukan jawabannya: membacanya di browser
    butuh kanvas yang tidak boleh ternoda lintas-domain, dan menghitungnya di
    server butuh pustaka pengolah gambar yang belum ada di proyek ini.

    Lapisan gelap tembus pandang menyelesaikannya tanpa perlu tahu apa pun
    tentang gambarnya: panel SELALU serasi karena ia memang gambar itu sendiri,
    yang diredupkan. Garis tepi tipis menjaga batasnya tetap terlihat bahkan di
    atas latar yang sudah pekat, tempat gelap-di-atas-gelap kehilangan bentuk.
  */
  const customPanel = panelColor !== null;
  const panelStyle = customPanel
    ? { background: panelColor, color: readableOn(panelColor) }
    : {
        background: "rgba(0, 0, 0, 0.34)",
        color: text,
        border: "0.15vh solid rgba(255, 255, 255, 0.14)",
        // Buram membuat gambar latar yang ramai tidak bersaing dengan angka di
        // atasnya. Peramban yang tidak mendukungnya tetap mendapat lapisan
        // gelapnya — tidak ada yang rusak, hanya kurang halus.
        backdropFilter: "blur(6px)",
      };

  /*
    Baris opsi menyusut mengikuti jumlahnya.

    Layar panggung tidak bisa digulir oleh siapa pun yang menontonnya, jadi
    menggulir adalah jalan terakhir, bukan jalan utama. Delapan opsi berukuran
    sama dengan tiga opsi pasti melewati tepi bawah; mengecilkannya lebih dulu
    membuat sebagian besar pertanyaan muat utuh tanpa satu pun gulungan.
  */
  const rows = Math.max(1, poll?.options.length ?? 1);
  /*
    Angka pembaginya adalah JATAH TINGGI NYATA, bukan angka bulat yang enak
    dibaca. Versi pertama memakai `min(3.4vh, 46/rows vh)`, dan itu tidak pernah
    menyusut untuk delapan opsi: 46/8 = 5,75vh masih lebih besar daripada batas
    3,4vh, sehingga `min()` selalu memilih batasnya. Penyusutan baru terjadi di
    empat belas opsi — jauh setelah layarnya sudah penuh.

    Sisa ruang untuk daftar sekitar 62vh (100 dikurangi header dan footer), dan
    tiap baris memakan tinggi huruf + dua padding + jarak. Pembagi di bawah
    diturunkan dari angka itu, jadi delapan opsi benar-benar mengecil.
  */
  const rowFont = `min(3.2vh, ${(26 / rows).toFixed(2)}vh)`;
  const rowGap = `min(2vh, ${(15 / rows).toFixed(2)}vh)`;

  return <main
    // `h-dvh` + `overflow-hidden`, BUKAN `min-h-dvh`. Dengan min-height, isi yang
    // lebih tinggi dari layar memperbesar halamannya sendiri dan seluruh layar
    // ikut menggulir — QR dan kode gabung terdorong keluar pandangan, padahal
    // keduanya justru yang harus selalu terlihat.
    className="flex h-dvh flex-col overflow-hidden bg-cover bg-center px-[3vw] py-[3vh]"
    style={{
      // Gambar latar ditumpuk DI ATAS warna, bukan menggantikannya: gambar yang
      // gagal dimuat menyisakan warna acara, bukan layar putih.
      background,
      backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
      color: text,
      fontFamily: headingFont,
    }}
  >
    {/* Judul acara berdiri di atas pertanyaan, sejajar dengan layar publik lain.
        Pertanyaannya sendiri berganti-ganti sepanjang sesi; judul acara tidak. */}
    <BrandHeader branding={branding} title={title} subtitle={subtitle} textColor={text} accentColor={accent} variant="led" className="shrink-0" />

    {/* DUA KOLOM: cara gabung di kiri, hasil di kanan.
        Sebelumnya QR dan kode ditaruh di bawah daftar, dan di sanalah keduanya
        paling mudah terdorong keluar layar begitu opsinya bertambah — padahal
        justru itu yang harus terlihat sepanjang voting berjalan. Kolom kiri
        lebarnya tetap, jadi panjang daftar tidak pernah menggesernya. */}
    <div className="mt-[2vh] flex min-h-0 flex-1 flex-col gap-[2vw] lg:flex-row">
      {/*
        Isi kolom ini diukur terhadap LEBAR KOLOMNYA, bukan terhadap viewport.

        Versi sebelumnya memakai `min(20vh, 18vw)` untuk QR. Pada layar lebar,
        18vw jauh lebih besar daripada kolomnya sendiri, sehingga QR membengkak
        sampai memenuhi kolom sementara sisanya menjadi ruang kosong — persis
        yang terlihat: kotak raksasa mengambang di tengah.

        Sekarang QR mengisi 78% lebar kolom dan berhenti di 30vh, jadi ia tetap
        proporsional pada lebar layar berapa pun. `max-w` pada kolom menjaga
        angkanya tidak ikut membesar tanpa batas di layar ultrawide.
      */}
      <aside className="flex w-full shrink-0 flex-col items-center justify-center gap-[1.2vh] lg:w-[23%] lg:max-w-[430px]">
        {poll?.status === "open" && qr && <div className="w-[78%] max-w-[30vh] rounded-[1.2vh] bg-white p-[3%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR menuju halaman voting" className="block w-full rounded-[0.4vh]" style={{ height: "auto" }} />
        </div>}
        <div className="w-full text-center">
          <p style={{ fontSize: "clamp(10px, 1.6vh, 20px)", opacity: 0.65 }}>
            {poll?.status === "closed" ? "Voting ditutup" : poll?.status === "open" ? "Pindai, atau buka" : "Voting belum dibuka"}
          </p>
          {poll?.status === "open" && <>
            <p className="truncate font-semibold" style={{ fontSize: "clamp(12px, 1.9vh, 26px)" }}>{joinHost}/join</p>
            {joinCode && <p className="mt-[0.4vh] font-bold tabular-nums leading-none" style={{ fontSize: "clamp(22px, 4.6vh, 62px)", color: accent, letterSpacing: "0.04em" }}>
              {/* Dikelompokkan 3-4 seperti nomor telepon. Tujuh angka beruntun
                  sulit dibaca sekali lihat dan lebih sulit lagi dibacakan MC. */}
              {joinCode.slice(0, 3)} {joinCode.slice(3)}
            </p>}
          </>}
          {poll?.results_visible && poll.total_ballots !== null && <p className="mt-[1.2vh] font-semibold tabular-nums" style={{ fontSize: "clamp(11px, 1.7vh, 22px)", opacity: 0.7 }}>
            {poll.total_ballots} orang sudah memilih
          </p>}
        </div>
      </aside>

      {/* `rounded-[1.6vh]`: sudut siku membuat panel terbaca sebagai potongan
          yang ditempel, bukan bagian dari layar. Radiusnya dalam vh supaya ikut
          berskala di proyektor beresolusi berapa pun. */}
      <section
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.6vh] p-[2.4vh]"
        style={panelStyle}
      >
    {!poll ? <div className="flex flex-1 items-center justify-center">
      <p style={{ fontSize: "clamp(18px, 3.4vh, 44px)", opacity: 0.55 }}>Menunggu voting dimulai…</p>
    </div> : <>
      <header className="shrink-0 text-center">
        <h1 className="font-bold tracking-[-0.03em]" style={{ fontSize: "clamp(24px, 5vh, 68px)" }}>{poll.question}</h1>
        {poll.description && <p className="mt-[1vh]" style={{ fontSize: "clamp(12px, 2.2vh, 30px)", opacity: 0.7 }}>{poll.description}</p>}
      </header>

      {/* ---- Rating: rata-rata besar + sebaran per nilai ---- */}
      {poll.type === "rating" ? <div className="mt-[2.5vh] flex min-h-0 flex-1 flex-col items-center justify-center gap-[3vh] overflow-y-auto">
        {!poll.results_visible ? <p style={{ fontSize: "clamp(16px, 3vh, 40px)", opacity: 0.5 }}>Hasil masih disembunyikan</p> : <>
          <div className="text-center">
            <p className="font-bold tabular-nums leading-none" style={{ fontSize: "clamp(48px, 18vh, 220px)", color: accent }}>
              {poll.rating?.average?.toFixed(2) ?? "—"}
            </p>
            <p style={{ fontSize: "clamp(12px, 2.2vh, 30px)", opacity: 0.6 }}>rata-rata dari {poll.rating_max}</p>
          </div>
          {/* Sebaran digambar sebagai kolom, bukan bar mendatar: skala 1..10
              punya urutan alami dari kiri ke kanan, dan kolom membuat urutan itu
              terbaca tanpa membaca angkanya satu per satu. */}
          <div className="flex w-full items-end justify-center gap-[1.2vw]" style={{ height: "26vh" }}>
            {(poll.rating?.distribution ?? []).map((bucket) => {
              const top = Math.max(...(poll.rating?.distribution ?? []).map((item) => item.count), 1);
              return <div key={bucket.value} className="flex h-full flex-1 flex-col items-center justify-end gap-[0.8vh]" style={{ maxWidth: "9vw" }}>
                <span className="tabular-nums" style={{ fontSize: "clamp(10px, 1.8vh, 24px)", opacity: 0.65 }}>{bucket.count}</span>
                <motion.div
                  className="w-full"
                  style={{ background: accent }}
                  initial={{ height: 0 }}
                  animate={{ height: `${(bucket.count / top) * 100}%` }}
                  transition={expressive.spatial.slow}
                />
                <span className="font-bold tabular-nums" style={{ fontSize: "clamp(12px, 2.2vh, 30px)" }}>{bucket.value}</span>
              </div>;
            })}
          </div>
          {(poll.rating_min_label || poll.rating_max_label) && <div className="flex w-full justify-between px-[6vw]" style={{ fontSize: "clamp(10px, 1.8vh, 24px)", opacity: 0.6 }}>
            <span>{poll.rating_min_label}</span><span>{poll.rating_max_label}</span>
          </div>}
        </>}
      </div>

      /* ---- Word cloud ---- */
      : poll.type === "wordcloud" ? <div className="mt-[2.5vh] flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-x-[2.5vw] gap-y-[1.5vh] overflow-y-auto">
        {!poll.results_visible ? <p style={{ fontSize: "clamp(16px, 3vh, 40px)", opacity: 0.5 }}>Hasil masih disembunyikan</p>
          : (poll.words ?? []).length === 0 ? <p style={{ fontSize: "clamp(16px, 3vh, 40px)", opacity: 0.5 }}>Belum ada kata yang masuk</p>
          : (poll.words ?? []).map((entry) => {
              const top = Math.max(...(poll.words ?? []).map((item) => item.count), 1);
              // Ukuran huruf mengikuti AKAR dari frekuensi, bukan frekuensinya
              // langsung. Skala linear membuat satu kata yang disebut 40 kali
              // sepuluh kali lebih besar daripada yang disebut 4 kali, dan kata
              // besar itu menelan seluruh layar sementara sisanya tak terbaca.
              const scale = Math.sqrt(entry.count / top);
              return <motion.span
                key={entry.word}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={expressive.effects.default}
                className="font-bold uppercase leading-none"
                style={{
                  fontSize: `calc(1.6vh + ${(scale * 9).toFixed(2)}vh)`,
                  color: accent,
                  opacity: 0.45 + scale * 0.55,
                }}
                title={`${entry.count}x`}
              >
                {entry.word}
              </motion.span>;
            })}
      </div>

      /* ---- Pilihan tunggal & ganda ---- */
      /* Pemusatan ada di pembungkus DALAM, bukan di wadah yang menggulir.
         `justify-center` pada wadah ber-overflow memotong isi di KEDUA ujung dan
         bagian atasnya tidak bisa dijangkau gulungan — cacat flexbox yang sudah
         lama dikenal. `min-h-full` membuat pembungkus dalam setinggi wadah saat
         opsinya sedikit (sehingga tetap terpusat), dan tumbuh melewatinya saat
         banyak (sehingga menggulir dari atas). */
      /* `pr` menyediakan jalur untuk scrollbar. Tanpa itu, batang gulung
         digambar DI ATAS kolom persentase dan angka paling kanan terpotong. */
      : <div className="mt-[2vh] min-h-0 flex-1 overflow-y-auto pr-[1.2vw]">
        <div className="flex min-h-full flex-col justify-center" style={{ gap: rowGap }}>
        {poll.options.map((option, index) => {
          const count = option.vote_count ?? 0;
          const percent = poll.results_visible ? percentages[index] : 0;
          // Pemuncak ditandai lebih pekat, bukan diberi lencana "unggul": pada
          // suara yang masih mengalir, lencana itu berganti-ganti tiap dua detik
          // dan justru mengalihkan perhatian dari bar-nya sendiri.
          const isLeading = poll.results_visible && count > 0 && count === leading;
          /*
            TIGA KOLOM, bukan satu kotak berisi segalanya.

            Versi sebelumnya menaruh foto, nama, dan angka DI DALAM satu bar
            berbingkai persegi, dan bar itu sekaligus menjadi indikator
            persentase. Akibatnya foto ikut tertimpa warna isian saat suara
            bertambah, dan setiap baris terbaca sebagai kotak kaku berjajar.

            Sekarang tiap peran punya tempatnya sendiri: foto di kiri sebagai
            lingkaran, nama dan bar di tengah, angka di kanan. Bar berdiri
            sendiri sebagai jalur membulat sehingga panjangnya yang berbicara,
            bukan latar sebuah kotak.
          */
          return <div key={option.id} className="flex items-center" style={{ gap: `calc(${rowFont} * 0.8)` }}>
            {/* `<img>`, bukan next/image: URL-nya datang dari storage Supabase
                dan bisa berubah kapan saja lewat CMS, sedangkan next/image butuh
                host yang didaftarkan lebih dulu di konfigurasi. Pola yang sama
                dipakai layar undian. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {option.image_url && <img
              src={option.image_url}
              alt=""
              aria-hidden="true"
              className="shrink-0 rounded-full object-cover"
              // Cincin tipis memisahkan foto dari latar acara yang warnanya bisa
              // apa saja; tanpa itu foto berlatar gelap menyatu dengan layar.
              style={{ height: `calc(${rowFont} * 2.6)`, width: `calc(${rowFont} * 2.6)`, boxShadow: `0 0 0 0.25vh ${accent}66` }}
            />}

            <div className="min-w-0 flex-1">
              {/* `leading-normal` eksplisit: dengan jarak yang mengecil, tinggi
                  baris bawaan yang rapat memotong ekor huruf y, g, dan j. */}
              <p className="truncate font-semibold leading-normal" style={{ fontSize: rowFont }}>{option.label}</p>
              <div
                className="mt-[0.4vh] w-full overflow-hidden rounded-full"
                style={{ height: `calc(${rowFont} * 0.62)`, background: `${accent}26` }}
              >
                <motion.div
                  className="h-full rounded-full"
                  // Pemuncak dipekatkan, yang lain diredupkan. Bukan lencana
                  // "unggul": pada suara yang masih mengalir, lencana itu
                  // berpindah tiap dua detik dan mengalihkan perhatian dari
                  // bar-nya sendiri.
                  style={{ background: isLeading ? accent : `${accent}99` }}
                  initial={{ width: 0 }}
                  // Lebar minimum saat sudah ada suara: nilai 1% pada jalur
                  // membulat menghasilkan noktah yang terpotong radiusnya sendiri
                  // dan terbaca sebagai nol.
                  animate={{ width: percent > 0 ? `max(${percent}%, ${rowFont})` : "0%" }}
                  // Cukup lambat untuk terbaca sebagai gerakan, cukup cepat untuk
                  // selesai sebelum polling berikutnya datang.
                  transition={expressive.spatial.slow}
                />
              </div>
            </div>

            {poll.results_visible
              ? <div className="shrink-0 text-right" style={{ minWidth: `calc(${rowFont} * 4)` }}>
                  <span className="font-bold tabular-nums leading-none" style={{ fontSize: `calc(${rowFont} * 1.15)`, color: isLeading ? accent : undefined }}>{percent}%</span>
                  <span className="block tabular-nums leading-none" style={{ fontSize: `calc(${rowFont} * 0.5)`, opacity: 0.55 }}>{count} suara</span>
                </div>
              : <span className="shrink-0" style={{ fontSize: `calc(${rowFont} * 0.55)`, opacity: 0.45 }}>tersembunyi</span>}
          </div>;
        })}
        </div>
      </div>}

    </>}
      </section>
    </div>

    <BrandFooter branding={branding} textColor={text} variant="led" className="mt-[2vh] shrink-0">{null}</BrandFooter>
  </main>;
}
