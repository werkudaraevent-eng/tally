"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrandFooter, BrandHeader } from "@/components/brand-header-footer";
import { fontStack, type Branding } from "@/lib/branding";
import { votePercentages, type PublicVoteState } from "@/lib/vote";

// Layar panggung voting. Bar bergerak mengikuti suara yang masuk.
//
// Polling, bukan websocket — konsisten dengan seluruh layar publik aplikasi ini,
// dan endpoint yang dibacanya sengaja dapat di-cache CDN sehingga ratusan HP
// peserta yang membaca alamat yang sama tidak membebani origin.

const POLL_MS = 2000;

export default function VoteScreenClient({ voteUrl, joinHost, joinCode, title, subtitle, accent, text, background, backgroundImage, branding }: {
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
  const rowPadding = `min(1.8vh, ${(13 / rows).toFixed(2)}vh)`;
  const rowGap = `min(1.2vh, ${(9 / rows).toFixed(2)}vh)`;

  return <main
    // `h-dvh` + `overflow-hidden`, BUKAN `min-h-dvh`. Dengan min-height, isi yang
    // lebih tinggi dari layar memperbesar halamannya sendiri dan seluruh layar
    // ikut menggulir — QR dan kode gabung terdorong keluar pandangan, padahal
    // keduanya justru yang harus selalu terlihat.
    className="flex h-dvh flex-col overflow-hidden bg-cover bg-center px-[4vw] py-[3vh]"
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

    {!poll ? <div className="flex flex-1 items-center justify-center">
      <p style={{ fontSize: "clamp(18px, 3.4vh, 44px)", opacity: 0.55 }}>Menunggu voting dimulai…</p>
    </div> : <>
      <header className="mt-[1.5vh] shrink-0 text-center">
        <h1 className="font-bold tracking-[-0.03em]" style={{ fontSize: "clamp(24px, 5.4vh, 76px)" }}>{poll.question}</h1>
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
                  transition={{ duration: 0.8, ease: "easeOut" }}
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
                transition={{ duration: 0.4 }}
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
      : <div className="mt-[2vh] min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-center" style={{ gap: rowGap }}>
        {poll.options.map((option, index) => {
          const count = option.vote_count ?? 0;
          const percent = poll.results_visible ? percentages[index] : 0;
          // Pemuncak ditandai lebih pekat, bukan diberi lencana "unggul": pada
          // suara yang masih mengalir, lencana itu berganti-ganti tiap dua detik
          // dan justru mengalihkan perhatian dari bar-nya sendiri.
          const isLeading = poll.results_visible && count > 0 && count === leading;
          return <div key={option.id} className="relative overflow-hidden" style={{ background: `${accent}1A`, border: `0.25vh solid ${accent}55` }}>
            <motion.div
              className="absolute inset-y-0 left-0"
              style={{ background: isLeading ? accent : `${accent}77` }}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              // Cukup lambat untuk terbaca sebagai gerakan, cukup cepat untuk
              // selesai sebelum polling berikutnya datang.
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
            <div className="relative flex items-center justify-between gap-[2vw] px-[2.5vw]" style={{ paddingTop: rowPadding, paddingBottom: rowPadding }}>
              {/* Gambar opsi, bila ada. Tinggi dikunci ke tinggi baris supaya
                  gambar berukuran apa pun tidak mengubah tinggi bar-nya. */}
              {/* `<img>`, bukan next/image: URL-nya datang dari storage Supabase
                  dan bisa berubah kapan saja lewat CMS, sedangkan next/image butuh
                  host yang didaftarkan lebih dulu di konfigurasi. Pola yang sama
                  dipakai layar undian. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {option.image_url && <img src={option.image_url} alt="" aria-hidden="true" className="shrink-0 object-cover" style={{ height: `calc(${rowFont} * 2)`, width: `calc(${rowFont} * 2)` }} />}
              {/* `leading-normal` eksplisit: dengan padding yang mengecil, tinggi
                  baris bawaan yang rapat memotong ekor huruf y, g, dan j. */}
              <span className="min-w-0 flex-1 truncate font-semibold leading-normal" style={{ fontSize: rowFont }}>{option.label}</span>
              {poll.results_visible
                ? <span className="shrink-0 font-bold tabular-nums" style={{ fontSize: rowFont }}>
                    {percent}% <span style={{ opacity: 0.6, fontSize: "0.62em" }}>({count})</span>
                  </span>
                : <span className="shrink-0" style={{ fontSize: "clamp(11px, 1.8vh, 22px)", opacity: 0.5 }}>tersembunyi</span>}
            </div>
          </div>;
        })}
        </div>
      </div>}

      <footer className="mt-[2vh] flex shrink-0 items-end justify-between gap-[3vw]">
        <div className="min-w-0">
          <p style={{ fontSize: "clamp(12px, 2vh, 26px)", opacity: 0.7 }}>
            {poll.status === "open" ? "Pindai QR, atau buka" : poll.status === "closed" ? "Voting ditutup" : "Voting belum dibuka"}
          </p>
          {/* Jalur kode, sejajar dengan QR dan bukan di bawahnya. Yang duduk di
              belakang tidak bisa memindai apa pun; bagi mereka angka inilah
              satu-satunya jalan masuk, jadi ia harus seukuran yang bisa dibaca
              dari kursi terjauh. */}
          {poll.status === "open" && joinCode && <div className="mt-[0.6vh]">
            <p className="font-semibold" style={{ fontSize: "clamp(14px, 2.6vh, 34px)" }}>{joinHost}/join</p>
            <p className="font-bold tabular-nums leading-none" style={{ fontSize: "clamp(24px, 5.5vh, 76px)", color: accent, letterSpacing: "0.06em" }}>
              {/* Dikelompokkan 3-4 seperti nomor telepon. Tujuh angka beruntun
                  sulit dibaca sekali lihat dan lebih sulit lagi dibacakan MC. */}
              {joinCode.slice(0, 3)} {joinCode.slice(3)}
            </p>
          </div>}
          {poll.results_visible && poll.total_ballots !== null && <p className="mt-[0.5vh] font-semibold tabular-nums" style={{ fontSize: "clamp(14px, 2.6vh, 34px)" }}>
            {poll.total_ballots} orang sudah memilih
          </p>}
        </div>
        {/* QR hanya berguna selama voting dibuka. Dibiarkan tampil setelah
            ditutup, orang di kursi belakang tetap memindainya dan mendapat
            halaman yang menolak — pengalaman yang terbaca seperti kerusakan. */}
        {poll.status === "open" && qr && <div className="shrink-0 bg-white p-[1vh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR menuju halaman voting" style={{ width: "min(13vh, 18vw)", height: "auto", display: "block" }} />
        </div>}
      </footer>
    </>}

    <BrandFooter branding={branding} textColor={text} variant="led" className="mt-[2vh] shrink-0">{null}</BrandFooter>
  </main>;
}
