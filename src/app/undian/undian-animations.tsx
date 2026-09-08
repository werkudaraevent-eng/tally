"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useMotionValue } from "framer-motion";
import { easing, expressive } from "@/lib/m3/motion";
import { mixHex, readableOn } from "@/lib/color";
import { ShineText } from "./undian-stage-fx";

// Lapisan animasi layar undian.
//
// Semua varian menerima kontrak yang sama:
//
//   roster   nama-nama yang berputar. Diacak di server; TIDAK memuat petunjuk
//            apa pun tentang siapa pemenangnya.
//   winners  kosong selama animasi, terisi setelah waktu reveal lewat.
//   endsAt   epoch milidetik saat animasi harus berhenti (dari jam SERVER).
//
// Inti rancangannya: komponen ini TIDAK PERNAH tahu pemenang lebih dulu. Ia
// menganimasikan nama acak sampai `winners` datang, lalu berhenti pada nama itu.
// Karena itu tidak ada satu pun jalur kode di sini yang bisa membocorkan hasil,
// bahkan bila seseorang membaca sumber halaman.

export type AnimationProps = {
  roster: { name: string; seat: string | null; code: string | null }[];
  winners: { name: string; company: string | null; seat: string | null; is_backup: boolean; slot_order: number }[];
  endsAt: number | null;
  accent: string;
  text: string;
  fontFamily: string;
  /** Naik satu setiap undian baru; dipakai untuk mengulang animasi dari awal. */
  round: number;
  /**
   * Berapa nama yang AKAN keluar pada undian ini.
   *
   * Datang dari konfigurasi hadiah, bukan dari hasil undian, jadi ia sudah
   * diketahui selama animasi berjalan dan tidak membocorkan apa pun tentang siapa
   * pemenangnya.
   *
   * Dipakai varian kartu untuk menggambar jumlah kartu yang tepat sejak awal.
   * Tanpa ini, grid berganti ukuran tepat pada detik pemenang muncul — dan
   * lompatan itu terjadi persis ketika semua mata tertuju ke layar.
   */
  pendingCount?: number;
};

/** Nama cadangan saat kolam belum termuat, supaya animasi tidak kosong. */
const PLACEHOLDER = ["• • •", "• • • •", "• • •"];

/**
 * Kurva perlambatan roda: cepat di awal, lalu merayap lama sebelum berhenti.
 *
 * Bukan pegas M3 — pegas melewati sasaran lalu kembali, dan roda yang mundur
 * sedikit setelah berhenti terbaca sebagai hasil yang dikoreksi. Bukan pula
 * `easeOut` bawaan yang berhenti terlalu cepat; ekor panjang di kurva inilah
 * yang membuat detik terakhir terasa menegangkan.
 */
const SPIN_DOWN_EASE = [0.12, 0.8, 0.2, 1] as const;

function useRosterNames(roster: AnimationProps["roster"]): string[] {
  return useMemo(() => (roster.length > 0 ? roster.map((item) => item.name) : PLACEHOLDER), [roster]);
}

/**
 * Denyut acak selama animasi berlangsung.
 *
 * Kecepatannya menurun mendekati akhir, meniru benda berputar yang kehilangan
 * momentum. Interval tetap membuat perhentiannya terasa seperti animasi yang
 * dipotong, bukan diperlambat.
 */
function useTicker(names: string[], endsAt: number | null, active: boolean, round: number) {
  const [index, setIndex] = useState(0);
  // Penyetelan state saat prop berubah dilakukan SAAT RENDER, bukan di dalam
  // effect. React Compiler menolak setState sinkron di badan effect karena memicu
  // render berantai; pola resmi untuk "sesuaikan state ketika prop berubah" adalah
  // membandingkan nilai sebelumnya di sini.
  const [seenRound, setSeenRound] = useState(round);
  if (seenRound !== round) {
    setSeenRound(round);
    setIndex(0);
  }
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!active || names.length === 0) return;

    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      setIndex((current) => (current + 1) % names.length);
      const remaining = endsAt ? Math.max(0, endsAt - Date.now()) : 3000;
      // 60ms saat masih jauh, melebar sampai ~420ms di detik terakhir.
      const delay = remaining > 2500 ? 60 : 60 + (1 - remaining / 2500) ** 2 * 360;
      timer.current = window.setTimeout(step, delay);
    };
    step();

    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [names.length, endsAt, active, round]);

  return names[index % names.length] ?? "";
}

// ===========================================================================
// Slot machine
// ===========================================================================
export function SlotAnimation({ roster, winners, endsAt, accent, text, fontFamily, round, pendingCount }: AnimationProps) {
  const names = useRosterNames(roster);
  const drawing = winners.length === 0;

  /**
   * SATU GULUNGAN PER PEMENANG, berhenti satu per satu dari kiri.
   *
   * Sebelumnya komponen ini hanya punya satu gulungan lalu berpindah ke daftar
   * pemenang. Pada hadiah berpemenang tiga, penonton melihat satu nama bergulir
   * lalu tiba-tiba tiga nama muncul — tidak ada hubungan yang terbaca antara
   * animasinya dan hasilnya.
   *
   * Mesin slot justru metafora yang paling cocok untuk pemenang banyak: mesin
   * sungguhan memang punya beberapa gulungan yang berhenti berurutan. Tidak ada
   * yang perlu dibatasi di sisi konfigurasi.
   */
  const main = useMemo(() => winners.filter((winner) => !winner.is_backup), [winners]);
  const winnerCount = main.length;
  // Dari konfigurasi hadiah, bukan dari hasil: jumlah gulungan harus sudah benar
  // sejak animasi mulai, kalau tidak tata letak melompat saat pemenang datang.
  const reels = Math.max(1, drawing ? (pendingCount ?? 1) : winnerCount);

  const [settled, setSettled] = useState(0);
  const [seenRound, setSeenRound] = useState(round);
  if (seenRound !== round) {
    setSeenRound(round);
    setSettled(0);
  }

  // Dependency angka, bukan array: halaman menyegarkan tiap dua detik dan
  // membangun ulang array pemenang, sehingga dependency array akan membatalkan
  // timer lalu mengulang penghentian dari gulungan pertama tanpa henti.
  useEffect(() => {
    if (winnerCount === 0) return;
    const step = Math.max(320, Math.min(900, Math.round(2400 / winnerCount)));
    const timers = Array.from({ length: winnerCount }, (_, index) => window.setTimeout(
      // Hanya boleh maju: gulungan yang sudah berhenti lalu berputar lagi
      // terbaca sebagai hasil yang ditarik ulang.
      () => setSettled((current) => Math.max(current, index + 1)),
      index * step,
    ));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [winnerCount, round]);

  const stopping = winnerCount > 0 && settled < winnerCount;
  const spinning = drawing || stopping;
  const current = useTicker(names, drawing ? endsAt : null, spinning, round);

  const size = reels === 1
    ? { height: "26vh", font: "clamp(28px, 7vw, 110px)" }
    : reels <= 3
      ? { height: "18vh", font: "clamp(16px, 3.2vw, 54px)" }
      : { height: "12vh", font: "clamp(12px, 2vw, 32px)" };

  const backups = useMemo(() => winners.filter((winner) => winner.is_backup), [winners]);

  // Gulungan TETAP menjadi tampilan akhir; tidak berpindah ke WinnerList.
  //
  // Sebelumnya, begitu gulungan terakhir berhenti, layar berganti ke daftar
  // pemenang yang menumpuk nama secara vertikal — tiga nama besar bertumpuk
  // meluber melewati tepi bawah panggung, dan bentuk mesin slot yang baru saja
  // dibangun animasinya hilang tepat pada saat hasilnya diumumkan. Nama yang
  // berhenti di gulungannya sendiri sudah merupakan pengumuman yang utuh.
  return <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-[2vh] overflow-hidden">
    <div className="flex w-full flex-wrap items-center justify-center gap-[1.5vh] px-[3vw]">
      {Array.from({ length: reels }).map((_, index) => {
        const done = index < settled;
        const winner = main[index];
        // Offset per gulungan supaya ketiganya tidak menampilkan nama yang sama
        // persis pada tiap denyut — tiga gulungan yang seirama terlihat seperti
        // satu gulungan yang digandakan.
        const rolling = names[(names.indexOf(current) + index * 3 + names.length) % names.length] ?? current;
        return <motion.div
          key={index}
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden border-y-2 px-[1.5vw]"
          style={{
            borderColor: accent,
            height: size.height,
            // Lebar minimum menjaga tiga gulungan tetap sebaris di layar lebar,
            // dan membiarkannya membungkus di layar sempit.
            minWidth: reels > 1 ? "26%" : undefined,
          }}
          // Gulungan yang berhenti "mengunci": membesar sekejap, latarnya
          // menyala penuh, dan bercahaya. Dari kursi belakang inilah yang
          // terbaca sebagai "yang ini sudah", sebelum namanya sempat dibaca.
          animate={done
            ? { scale: [1, 1.05, 1], backgroundColor: accent, boxShadow: `0 0 6vh ${accent}99` }
            : { scale: 1, backgroundColor: `${accent}14`, boxShadow: `0 0 0vh ${accent}00` }}
          transition={done ? { duration: 0.45, ease: easing.emphasizedDecelerate } : { duration: 0 }}
        >
          {/* Bayangan tepi atas-bawah: gulungan terbaca sebagai silinder yang
              berputar di balik jendela, bukan teks yang sekadar berganti. */}
          {!done && <>
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[30%]" style={{ background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.42), transparent)" }} />
            <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[30%]" style={{ background: "linear-gradient(to top, rgba(0, 0, 0, 0.42), transparent)" }} />
          </>}
          {/* `key` berganti tiap denyut, jadi tiap nama baru meluncur masuk
              dari bawah (`reel-in`) — bukan bertukar di tempat. */}
          <span
            key={done ? "final" : rolling}
            className={`w-full truncate text-center font-bold uppercase tracking-[-0.02em] ${done ? "" : "reel-in"}`}
            style={{ fontFamily, fontSize: size.font, color: done ? readableOn(accent) : text }}
          >
            {done ? winner?.name : rolling}
          </span>
          {/* Perusahaan ikut DI DALAM gulungan, bukan di baris terpisah di bawah:
              dengan tiga gulungan, satu daftar perusahaan di bawah tidak lagi
              jelas milik nama yang mana. */}
          {done && winner?.company && <span
            className="w-full truncate text-center"
            style={{ fontFamily, fontSize: reels === 1 ? "clamp(12px, 2vw, 30px)" : "clamp(9px, 1.2vw, 18px)", color: readableOn(accent), opacity: 0.75 }}
          >
            {winner.company}
          </span>}
        </motion.div>;
      })}
    </div>

    {!spinning && backups.length > 0 && <p className="px-[3vw] text-center" style={{ fontFamily, fontSize: "clamp(10px, 1.4vw, 20px)", color: text, opacity: 0.7 }}>
      Cadangan: {backups.map((winner) => winner.name).join(" · ")}
    </p>}
  </div>;
}

// ===========================================================================
// Roda putar
// ===========================================================================
export function WheelAnimation({ roster, winners, endsAt, accent, text, fontFamily, round, pendingCount }: AnimationProps) {
  const names = useRosterNames(roster);
  const drawing = winners.length === 0;

  /**
   * Roda punya SATU penunjuk, jadi satu putaran berarti satu nama.
   *
   * Hadiah berpemenang banyak karena itu tidak ditolak, melainkan diungkap
   * BERURUTAN: roda terus berputar dan berhenti pada satu nama, lalu berputar
   * lagi untuk nama berikutnya, sampai semuanya keluar. Ini yang dilakukan orang
   * dengan roda fisik, dan yang dilakukan platform undian yang memakai metafora
   * roda — bukan menampilkan dua nama sekaligus dari satu penunjuk.
   *
   * Seluruhnya di sisi tampilan. Pemenang sudah ditentukan server sejak `draw`
   * dan datang lengkap dalam satu payload; komponen ini hanya mengatur kapan
   * masing-masing terlihat. Tidak ada undian tambahan, dan urutannya adalah
   * `slot_order` dari server, bukan urutan yang dikarang di sini.
   */
  const main = useMemo(() => winners.filter((winner) => !winner.is_backup), [winners]);
  const winnerCount = main.length;

  const [shown, setShown] = useState(0);
  const [frozen, setFrozen] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [seenRound, setSeenRound] = useState(round);
  if (seenRound !== round) {
    setSeenRound(round);
    setShown(0);
    setFrozen(null);
    setFinished(false);
  }

  /**
   * Garis waktu per pemenang: roda MELAMBAT dulu, baru namanya sah.
   *
   *   t0                    frozen = i    loop linear berhenti; roda meluncur
   *                                       turun ke segmen pemenang selama
   *                                       `spinDown`.
   *   t0 + spinDown         shown = i+1   roda diam; nama tampil di poros dan
   *                                       di baris bawah.
   *   t0 + spinDown + hold  frozen = null roda berputar lagi untuk nama
   *                                       berikutnya, bila masih ada.
   *
   * Sebelumnya roda berputar linear lalu langsung berganti ke daftar pemenang,
   * tanpa perlambatan — momen yang paling ditonton justru terpotong. Untuk satu
   * pemenang bahkan tidak pernah terlihat berhenti: `shown` dinaikkan pada t=0
   * dan roda hilang seketika.
   *
   * Durasi menyusut mengikuti jumlah pemenang supaya sepuluh nama tidak memakan
   * hampir satu menit; roda sungguhan pun diputar lebih pendek kalau daftarnya
   * panjang.
   *
   * Dependency berupa ANGKA, bukan array `main`: halaman menyegarkan data setiap
   * dua detik dan membangun ulang array pemenang tiap kali, sehingga effect
   * dengan dependency array akan membatalkan seluruh timer dan mengulang
   * pengungkapan dari nama pertama — selamanya.
   */
  const spinDown = Math.max(1400, Math.min(3200, Math.round(9000 / Math.max(1, winnerCount))));
  const hold = Math.round(spinDown * 0.45);
  useEffect(() => {
    if (winnerCount === 0) return;
    const step = spinDown + hold;
    const timers: number[] = [];
    for (let index = 0; index < winnerCount; index += 1) {
      const t0 = index * step;
      timers.push(window.setTimeout(() => setFrozen(index), t0));
      // Hanya boleh maju: nama yang sudah dipanggil tidak boleh hilang lagi
      // dari layar bila effect ini sempat berjalan ulang.
      timers.push(window.setTimeout(() => setShown((current) => Math.max(current, index + 1)), t0 + spinDown));
      if (index < winnerCount - 1) {
        timers.push(window.setTimeout(() => setFrozen(null), t0 + step));
      }
    }
    // Daftar pemenang penuh baru menggantikan roda setelah nama terakhir sempat
    // dibaca di porosnya.
    timers.push(window.setTimeout(() => setFinished(true), winnerCount * step + hold));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [winnerCount, round, spinDown, hold]);

  const revealing = winnerCount > 0 && !finished;
  // Roda tetap tampil selama masih ada nama yang belum dipanggil.
  const spinning = drawing || revealing;
  const current = useTicker(names, drawing ? endsAt : null, spinning, round);
  // Poros menampilkan pemenang HANYA setelah roda berhenti. Selama meluncur
  // turun, nama-nama masih berkedip — itulah ketegangannya.
  const settled = frozen !== null && shown > frozen;
  const hubName = settled ? (main[frozen]?.name ?? current) : current;

  /**
   * Ukuran roda menyusut bila hadiah ini berpemenang banyak.
   *
   * Panggung animasi punya tinggi tetap dan `overflow-hidden`; roda 52vh
   * ditambah barisan nama yang sudah dipanggil melebihi ruang itu, dan yang
   * terpotong justru barisan namanya — bagian yang paling perlu dibaca.
   *
   * Diambil dari `pendingCount` (konfigurasi hadiah), bukan dari jumlah pemenang
   * yang sudah datang, supaya rodanya tidak mengecil mendadak tepat pada detik
   * nama pertama muncul. Alasan yang sama dipakai varian kartu.
   */
  const expected = Math.max(winnerCount, pendingCount ?? 1);
  const multi = expected > 1;
  // Roda mengambil ruang yang DIBERIKAN kartu hadiah: selama undian berjalan,
  // kartu hadiah di atasnya menyusut (lihat undian-client), jadi roda boleh
  // jauh lebih besar daripada sebelumnya tanpa mendorong apa pun keluar layar.
  const wheelSize = multi ? "min(52vh, 80vw)" : "min(60vh, 90vw)";

  // Roda hanya menggambar sebagian kolam.
  //
  // Di atas 24 segmen, tulisannya tidak terbaca dari kursi belakang dan roda
  // berubah menjadi cakram berwarna. Yang tampil karena itu sebuah jendela yang
  // ikut bergerak — ia terasa penuh, tetap terbaca, dan yang penting: pemilihan
  // tetap dari SELURUH kolam, jadi peluang setiap orang tidak berubah sedikit pun.
  //
  // Jumlahnya dijaga GENAP. Segmen berselang-seling dua warna; pada jumlah
  // ganjil, segmen pertama dan terakhir bersentuhan dengan warna yang sama dan
  // batas di antara keduanya lenyap.
  const segments = Math.max(2, Math.min(names.length, 16) - (Math.min(names.length, 16) % 2));

  /**
   * Jendela nama DIKUNCI selama roda meluncur turun.
   *
   * Jendela biasa mengikuti `current` dari ticker, jadi labelnya bergeser tiap
   * denyut — benar saat berputar cepat (roda memang buram), salah saat
   * melambat: tulisan yang berganti di roda yang hampir berhenti terbaca
   * sebagai roda yang diganti isinya. Saat `frozen` disetel, jangkar jendela
   * dibekukan dan nama pemenang ditanam di satu segmen; roda lalu diarahkan
   * berhenti tepat di segmen itu. Pemenangnya sudah ditentukan server — ini
   * hanya mengatur di mana ia mendarat.
   *
   * Penyesuaian saat prop berubah dilakukan SAAT RENDER, pola yang sama dengan
   * `seenRound` di atas.
   */
  const winnerName = frozen !== null ? (main[frozen]?.name ?? null) : null;
  const [lock, setLock] = useState<{ frozen: number | null; anchor: string; slot: number }>({ frozen: null, anchor: "", slot: 0 });
  if (lock.frozen !== frozen) {
    setLock({ frozen, anchor: current, slot: frozen === null ? 0 : frozen * 5 + 3 });
  }
  const { visible, landing } = useMemo(() => {
    const anchor = frozen !== null ? lock.anchor : current;
    let ring: string[];
    if (names.length <= segments) {
      ring = [...names];
    } else {
      const start = names.indexOf(anchor);
      const from = start < 0 ? 0 : start;
      ring = Array.from({ length: segments }, (_, i) => names[(from + i) % names.length]);
    }
    if (frozen === null || !winnerName) return { visible: ring, landing: 0 };
    const existing = ring.indexOf(winnerName);
    if (existing >= 0) return { visible: ring, landing: existing };
    const slot = lock.slot % ring.length;
    ring[slot] = winnerName;
    return { visible: ring, landing: slot };
  }, [names, segments, current, frozen, lock, winnerName]);

  // Irisan pai sungguhan, bukan cincin kosong berisi tulisan.
  //
  // Versi sebelumnya menggambar nama langsung di atas apa pun yang ada di
  // belakang roda, memakai warna teks dari setelan. Dengan gambar latar terang
  // dan `text` bawaan putih, seluruh nama tidak terlihat dan yang tersisa hanya
  // cincin — roda yang tampak kosong. Sekarang setiap segmen punya bidang
  // warnanya sendiri, dan warna tulisannya dihitung dari bidang itu, sehingga
  // keterbacaan tidak lagi bergantung pada gambar latar.
  const slice = 360 / visible.length;
  const segmentA = accent;
  const segmentB = mixHex(accent, "#000000", 0.42);
  const rim = mixHex(accent, "#000000", 0.6);
  const hub = mixHex(accent, "#FFFFFF", 0.88);
  const pie = useMemo(() => {
    const stops = Array.from({ length: visible.length }, (_, index) => {
      const color = index % 2 === 0 ? segmentA : segmentB;
      return `${color} ${(index * slice).toFixed(3)}deg ${((index + 1) * slice).toFixed(3)}deg`;
    });
    // `from -slice/2` menggeser awal gradien setengah irisan, sehingga segmen ke-i
    // BERPUSAT tepat pada sudut jari-jari label ke-i, bukan dimulai di sana.
    return `conic-gradient(from ${(-slice / 2).toFixed(3)}deg, ${stops.join(", ")})`;
  }, [visible.length, slice, segmentA, segmentB]);

  /**
   * Sudut roda sebagai motion value, bukan prop `animate`.
   *
   * Dua gerak bergantian pada elemen yang sama: putaran linear tanpa akhir
   * selama mengundi, lalu luncuran melambat ke segmen pemenang. Keduanya harus
   * berangkat dari sudut yang sedang tampil — pegangan langsung ke nilainya
   * membuat peralihan mulus, sementara prop `animate` selalu memulai dari nilai
   * yang ditulis di markup.
   */
  const rotate = useMotionValue(0);
  useEffect(() => {
    if (!spinning) return;
    if (frozen === null) {
      const from = rotate.get() % 360;
      const controls = animate(rotate, [from, from + 360], { duration: 1.1, ease: "linear", repeat: Infinity });
      return () => controls.stop();
    }
    // Pusat segmen ke-i berada di slice·i searah jarum jam dari penunjuk, jadi
    // roda harus berhenti pada -slice·i (mod 360). Ditambah beberapa putaran
    // penuh supaya perlambatannya terasa, bukan sekadar bergeser sedikit —
    // lebih sedikit bila durasinya pendek karena pemenangnya banyak.
    const rest = ((-(slice * landing) % 360) + 360) % 360;
    const from = rotate.get();
    const turns = spinDown >= 2500 ? 4 : 2;
    const target = rest + Math.ceil((from + turns * 360 - rest) / 360) * 360;
    const controls = animate(rotate, target, { duration: spinDown / 1000, ease: SPIN_DOWN_EASE });
    return () => controls.stop();
  }, [spinning, frozen, landing, slice, spinDown, rotate]);

  return <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-[1.5vh] overflow-hidden">
    {spinning ? <div className="relative flex shrink-0 items-center justify-center" style={{ width: wheelSize, height: wheelSize }}>
      {/* Penunjuk. Bergetar sekali saat roda berhenti — penanda kedua di
          samping nama yang berganti di poros, terbaca dari kursi belakang. */}
      {/* Cahaya di balik penunjuk saat roda berhenti: mengembang lalu
          mengendap. Penunjuk kecil di atas roda besar butuh pengumuman
          sendiri. */}
      <motion.span
        aria-hidden
        className="absolute left-1/2 top-0 z-10 rounded-full"
        style={{ width: "6vh", height: "6vh", background: accent, filter: "blur(1.4vh)", translateX: "-50%", translateY: "-50%" }}
        animate={settled ? { opacity: [0, 1, 0.55], scale: [0.5, 1.8, 1.2] } : { opacity: 0, scale: 0.5 }}
        transition={{ duration: 0.8, ease: easing.emphasizedDecelerate }}
      />
      <motion.div
        key={settled ? `hit-${round}-${frozen}` : "pointer"}
        className="absolute left-1/2 top-0 z-20 -translate-x-1/2"
        style={{ borderLeft: "1.4vh solid transparent", borderRight: "1.4vh solid transparent", borderTop: `2.4vh solid ${rim}`, transformOrigin: "50% 0%" }}
        animate={settled ? { rotate: [0, -16, 9, -4, 0] } : { rotate: 0 }}
        transition={{ duration: 0.5, ease: easing.standardDecelerate }}
      />
      <motion.div
        className="relative h-full w-full overflow-hidden rounded-full"
        style={{ border: `0.5vh solid ${rim}`, background: pie, rotate, boxShadow: `0 0 8vh rgba(0, 0, 0, 0.35), inset 0 0 4vh rgba(0, 0, 0, 0.25)` }}
      >
        {/* Irisan pemenang menyala saat roda berhenti. Berada DI DALAM roda
            yang berputar, jadi ia ikut mendarat tepat di bawah penunjuk. */}
        {settled ? (
          <motion.div
            key={`wedge-${round}-${frozen}`}
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: `conic-gradient(from ${(slice * landing - slice / 2).toFixed(3)}deg, rgba(255, 255, 255, 0.6) 0deg ${slice.toFixed(3)}deg, transparent ${slice.toFixed(3)}deg)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.55] }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        ) : null}
        {/* Paku pembatas segmen di tepi roda. Bersama kilatan cahaya yang
            melewatinya saat berputar cepat, inilah yang membuat roda terbaca
            sebagai benda, bukan cakram warna. */}
        {visible.map((_, index) => (
          <span
            key={`tick-${index}`}
            aria-hidden
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: "1.1vh",
              height: "1.1vh",
              marginLeft: "-0.55vh",
              marginTop: "-0.55vh",
              background: hub,
              boxShadow: "0 0 0.6vh rgba(0, 0, 0, 0.35)",
              transform: `rotate(${(slice * index - slice / 2).toFixed(3)}deg) translateY(calc(${wheelSize} / -2 + 1.6vh))`,
            }}
          />
        ))}
        {visible.map((name, index) => {
          // -90 menyelaraskan jari-jari dengan gradien: rotate(0) menunjuk pukul
          // tiga, sedangkan sudut conic-gradient dihitung dari pukul dua belas.
          const angle = slice * index - 90;
          return <div
            key={`${name}-${index}`}
            className="absolute left-1/2 top-1/2 origin-left"
            style={{ transform: `rotate(${angle}deg)`, width: "50%" }}
          >
            {/* Padding kiri harus MELEWATI poros DAN cahayanya. Poros lebarnya
                38% dari diameter, artinya 38% dari panjang jari-jari ini; nama
                mulai di 48% supaya ada jarak dari tepi poros dan dari cahaya
                yang menyala saat roda berhenti. Nilai lama 50% dengan poros 46%
                menaruh huruf pertama tepat di bawah cahaya itu. */}
            <span
              className="block truncate pl-[48%] pr-[7%] font-bold uppercase"
              style={{
                fontFamily,
                fontSize: "clamp(10px, 2.1vh, 28px)",
                color: readableOn(index % 2 === 0 ? segmentA : segmentB),
              }}
            >
              {name}
            </span>
          </div>;
        })}
      </motion.div>
      {/* Nama yang sedang lewat, di poros roda: dari kursi belakang inilah yang
          terbaca, bukan tulisan pada segmennya. Porosnya bulat dan berwarna
          terang supaya menonjol di atas irisan, dan tidak ikut berputar. */}
      <motion.div
        className="absolute z-10 flex aspect-square items-center justify-center rounded-full px-[2vh]"
        style={{ width: "38%", background: hub, border: `0.4vh solid ${rim}` }}
        // Poros bercahaya saat nama pemenang mendarat di dalamnya.
        animate={{ boxShadow: settled ? `0 0 7vh ${accent}, 0 0 2vh ${accent}` : `0 0 0vh ${accent}00, 0 0 0vh ${accent}00` }}
        transition={{ duration: 0.6, ease: easing.emphasizedDecelerate }}
      >
        {/* Nama pemenang membesar sekejap saat roda berhenti. Selama berkedip
            tidak ada gerak tambahan: nama yang berganti 16 kali per detik sudah
            cukup ramai. */}
        <motion.span
          key={settled ? `settled-${round}-${frozen}` : "ticking"}
          className="truncate text-center font-bold uppercase"
          style={{ fontFamily, fontSize: "clamp(16px, 3vh, 48px)", color: readableOn(hub) }}
          animate={settled ? { scale: [0.88, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.45, ease: easing.emphasizedDecelerate }}
        >
          {hubName}
        </motion.span>
      </motion.div>
    </div> : <WinnerList winners={winners} accent={accent} text={text} fontFamily={fontFamily} />}

    {/* Nama yang sudah dipanggil tetap terpampang selama roda memanggil sisanya.
        Tanpa ini, penonton yang baru melihat layar pada nama ketiga tidak punya
        cara tahu siapa dua yang sebelumnya, dan MC harus mengulang. */}
    {/* Ruangnya disediakan sejak awal lewat `multi`, bukan saat nama pertama
        muncul: baris yang tiba-tiba ada akan mendorong roda ke atas persis pada
        detik semua mata tertuju ke layar. */}
    {multi && spinning && <div className="flex min-h-[6vh] shrink-0 flex-wrap items-center justify-center gap-[1vh] px-[4vw]">
      {revealing && shown > 0 && main.slice(0, shown).map((winner, index) => <span
        key={`${winner.name}-${winner.slot_order}`}
        className="truncate px-[1.6vh] py-[0.6vh] font-bold uppercase"
        style={{
          fontFamily,
          fontSize: "clamp(12px, 2vh, 30px)",
          background: index === frozen && settled ? accent : `${accent}22`,
          color: index === frozen && settled ? readableOn(accent) : text,
          border: `0.25vh solid ${accent}`,
        }}
      >
        {winner.name}
      </span>)}
      {revealing && shown > 0 && <span style={{ fontFamily, fontSize: "clamp(10px, 1.6vh, 22px)", color: text, opacity: 0.7 }}>
        {shown} dari {winnerCount}
      </span>}
    </div>}
  </div>;
}

// ===========================================================================
// Kartu terbalik
// ===========================================================================
export function CardsAnimation({ roster, winners, endsAt, accent, text, fontFamily, round, pendingCount }: AnimationProps) {
  const names = useRosterNames(roster);
  const spinning = winners.length === 0;
  const current = useTicker(names, endsAt, spinning, round);

  // Berapa kartu yang digambar.
  //
  // Saat berputar jumlahnya HARUS SAMA dengan jumlah pemenang yang akan keluar,
  // bukan angka tetap. Versi sebelumnya menggambar enam kartu lalu tiba-tiba
  // berganti menjadi sepuluh saat pemenang datang — seluruh grid melompat dan
  // berubah ukuran tepat pada detik yang paling diperhatikan penonton.
  //
  // `pendingCount` datang dari hadiah, jadi jumlahnya sudah diketahui sebelum
  // nama-namanya diketahui. Ia tidak membocorkan apa pun.
  const slots = spinning ? Math.max(1, pendingCount ?? 1) : winners.length;

  // Tata letak grid dihitung dari jumlah kartu, bukan dipatok tiga kolom.
  //
  // Sepuluh pemenang pada tiga kolom menghasilkan empat baris; dengan tinggi
  // minimum 18vh per baris, isinya menjadi 78vh dan mendorong dirinya keluar
  // layar — persis bug yang terlihat di panggung. Kolom karena itu dipilih agar
  // jumlah BARIS tetap kecil, lalu tinggi kartu dihitung dari sisa ruang yang
  // benar-benar tersedia.
  const columns = slots <= 2 ? slots : slots <= 4 ? 2 : slots <= 9 ? 3 : slots <= 12 ? 4 : 5;
  const rows = Math.ceil(slots / columns);
  // Tinggi dibagi rata ke seluruh baris, dikurangi jarak antar baris. Dijepit
  // 7vh agar kartu tidak pernah mengecil sampai namanya tak terbaca.
  const cardHeight = `max(7vh, calc((100% - ${(rows - 1) * 1.5}vh) / ${rows}))`;

  // Ukuran huruf mengikuti kepadatan grid. Satu pemenang boleh sangat besar;
  // dua belas pemenang harus mengecil atau namanya terpotong.
  const nameSize = rows === 1 ? "clamp(18px, 4.4vh, 60px)"
    : rows === 2 ? "clamp(14px, 3vh, 40px)"
    : "clamp(11px, 2.1vh, 26px)";
  const subSize = rows <= 2 ? "clamp(9px, 1.4vh, 18px)" : "clamp(8px, 1.1vh, 14px)";

  // Kartu dibuka satu per satu, bukan serentak.
  //
  // Membuka serentak membuat penonton membaca nama terakhir lebih dulu dan
  // melewatkan yang pertama.
  //
  // Jedanya MENGECIL seiring banyaknya pemenang. Sepuluh kartu dengan jeda 700ms
  // memakan tujuh detik — MC sudah selesai bicara jauh sebelum kartu terakhir
  // terbuka. Totalnya dijaga sekitar tiga detik.
  const [revealed, setRevealed] = useState(0);
  const [seenRound, setSeenRound] = useState(round);
  if (seenRound !== round) {
    setSeenRound(round);
    setRevealed(0);
  }

  // Dependency-nya JUMLAH pemenang, bukan array pemenangnya.
  //
  // Halaman ini menyegarkan data setiap dua detik, dan setiap penyegaran
  // membangun ulang array `winners` dengan `.filter().map()`. Isinya sama, tapi
  // identitasnya baru — jadi effect dengan dependency `[winners]` dianggap usang,
  // cleanup-nya membatalkan seluruh timer, lalu semuanya dipasang ulang dari
  // kartu pertama. Akibatnya kartu terbuka sampai ketujuh, lalu kembali ke awal,
  // berulang selamanya dan tidak pernah selesai.
  //
  // `winnerCount` dan `round` keduanya angka, jadi effect ini hanya berjalan
  // ketika pemenang benar-benar datang atau undian benar-benar berganti.
  const winnerCount = winners.length;
  useEffect(() => {
    if (winnerCount === 0) return;
    const step = Math.max(180, Math.min(700, Math.round(3000 / winnerCount)));
    const timers = Array.from({ length: winnerCount }, (_, index) => window.setTimeout(
      // Hanya boleh maju, tidak pernah mundur. Bila effect ini toh berjalan lagi
      // (operator membatalkan satu pemenang sehingga jumlahnya berubah), kartu
      // yang sudah terbuka tetap terbuka. Kartu yang menutup kembali di panggung
      // terlihat seperti hasil undian yang ditarik ulang.
      () => setRevealed((current) => Math.max(current, index + 1)),
      index * step,
    ));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [winnerCount, round]);

  // Muka kartu dibagi dua elemen yang sama-sama mengisi kartunya: depan
  // (nama berkedip) dan belakang (pemenang), yang terakhir sudah diputar 180°
  // sejak awal sehingga baru menghadap penonton setelah kartunya berbalik.
  // `min-w-0` dan `overflow-hidden` wajib: tanpa keduanya nama panjang
  // memperlebar kolomnya sendiri dan mendorong kartu lain keluar layar.
  const face = "absolute inset-0 flex min-w-0 items-center justify-center overflow-hidden border-2 px-[1.5vh] text-center";
  const onAccent = readableOn(accent);

  return <div
    className="grid h-full w-full gap-[1.5vh] overflow-hidden"
    // `perspective` di WADAH, bukan di kartu. Tanpa titik pandang, rotateY
    // hanya menyempitkan kartu — terbaca sebagai kartu yang diremas, bukan yang
    // dibalik. Nilainya dalam vh supaya kedalamannya ikut ukuran layar.
    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: cardHeight, perspective: "160vh" }}
  >
    {Array.from({ length: slots }).map((_, index) => {
      const winner = winners[index];
      const open = !spinning && index < revealed;
      return <motion.div
        key={index}
        className="relative min-w-0"
        style={{ transformStyle: "preserve-3d" }}
        // Pegas ekspresif: kartu sedikit melewati 180° lalu kembali, seperti
        // kartu sungguhan yang dibalik dengan satu jentikan. Selama menunggu,
        // kartu bernapas pelan bergantian — tanda hidup tanpa satu pun kata.
        // Transisi per-properti: `scale` memakai tween karena tiga keyframe,
        // dan pegas hanya menerima dua.
        animate={{ rotateY: open ? 180 : 0, scale: open ? 1 : [1, 0.975, 1] }}
        transition={{
          rotateY: expressive.spatial.default,
          scale: open ? { duration: 0.3 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: index * 0.15 },
        }}
      >
        <div className={face} style={{ borderColor: accent, background: `${accent}14`, backfaceVisibility: "hidden" }}>
          {spinning ? <span aria-hidden className="shine-sweep pointer-events-none absolute inset-0" /> : null}
          <span className="relative truncate font-semibold uppercase" style={{ fontFamily, fontSize: nameSize, color: text, opacity: 0.5 }}>
            {spinning ? current : "..."}
          </span>
        </div>
        <div className={face} style={{ borderColor: accent, background: accent, backfaceVisibility: "hidden", transform: "rotateY(180deg)", boxShadow: open ? `0 0 5vh ${accent}99` : undefined }}>
          {winner ? <div className="min-w-0">
            <p className="truncate font-bold uppercase" style={{ fontFamily, fontSize: nameSize, color: onAccent }}>{winner.name}</p>
            {winner.company && <p className="truncate" style={{ fontFamily, fontSize: subSize, color: onAccent, opacity: 0.75 }}>{winner.company}</p>}
          </div> : null}
        </div>
      </motion.div>;
    })}
  </div>;
}

// ===========================================================================
// Angka per digit
// ===========================================================================
export function DigitsAnimation({ roster, winners, accent, text, fontFamily, round, pendingCount }: AnimationProps) {
  const spinning = winners.length === 0;

  // SATU DERET PER PEMENANG.
  //
  // Sebelumnya seluruh komponen ini membaca `winners[0]`, jadi hadiah dengan
  // "pemenang per undi" dua atau lebih hanya menampilkan orang pertama. Nama
  // kedua tetap terundi dan tetap tersimpan di `undian_winners` — ia hanya tidak
  // pernah muncul di layar, dan itu ketahuan pada saat MC memanggil nama yang
  // tidak ada di proyektor.
  const main = useMemo(() => winners.filter((winner) => !winner.is_backup), [winners]);
  const backups = useMemo(() => winners.filter((winner) => winner.is_backup), [winners]);

  // Selama berputar, jumlah deret diambil dari konfigurasi hadiah — alasan yang
  // sama seperti varian kartu: tanpa itu, jumlah deret berubah tepat pada detik
  // pemenang muncul, dan lompatan tata letak terjadi persis saat semua mata
  // tertuju ke layar.
  const strips = spinning ? Math.max(1, pendingCount ?? 1) : Math.max(1, main.length);

  const codeOf = (index: number) => main[index]?.seat ?? main[index]?.name ?? "";

  const sampleLength = useMemo(() => {
    const codes = roster.map((item) => item.code ?? item.seat ?? item.name).filter(Boolean);
    if (codes.length === 0) return 5;
    return Math.min(10, Math.round(codes.reduce((sum, code) => sum + code.length, 0) / codes.length));
  }, [roster]);

  /**
   * Panjang tiap deret sebagai STRING, bukan array.
   *
   * Dependency effect di bawah tidak boleh berupa `main`: halaman menyegarkan
   * data setiap dua detik dan membangun ulang array pemenang setiap kali, jadi
   * identitasnya selalu baru meski isinya sama. Effect akan dianggap usang,
   * seluruh timer dibatalkan, dan penguncian digit mengulang dari awal —
   * selamanya. Cacat yang sama pernah terjadi pada varian kartu dan dicatat di
   * sana; string ini menghindarinya karena nilainya yang dibandingkan, bukan
   * rujukannya.
   */
  const lengthsKey = main.map((_, index) => codeOf(index).length).join("-");

  const [locked, setLocked] = useState<number[]>([]);
  const [seen, setSeen] = useState({ round, spinning });
  if (seen.round !== round || seen.spinning !== spinning) {
    setSeen({ round, spinning });
    setLocked([]);
  }

  useEffect(() => {
    if (spinning || !lengthsKey) return;
    const lengths = lengthsKey.split("-").map(Number);
    const total = lengths.reduce((sum, value) => sum + value, 0);
    // Seluruh penguncian dijaga di sekitar 2,6 detik berapa pun jumlah digitnya.
    // Dengan jeda tetap 450ms, dua pemenang berkode enam huruf butuh 5,4 detik —
    // MC sudah selesai bicara sebelum kotak terakhir berhenti.
    const step = Math.max(90, Math.min(450, Math.round(2600 / Math.max(1, total))));
    const timers: number[] = [];
    let order = 0;
    lengths.forEach((length, strip) => {
      for (let digit = 0; digit < length; digit += 1) {
        timers.push(window.setTimeout(() => setLocked((current) => {
          const next = [...current];
          // Hanya boleh maju. Sama seperti kartu: kotak yang sudah berhenti lalu
          // berputar lagi terlihat seperti hasil undian yang ditarik ulang.
          next[strip] = Math.max(next[strip] ?? 0, digit + 1);
          return next;
        }), order * step));
        order += 1;
      }
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [spinning, lengthsKey, round]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 70);
    return () => window.clearInterval(interval);
  }, []);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  // Di atas enam deret, satu kolom menjadi terlalu tinggi meski kotaknya sudah
  // dikecilkan. Dua kolom memotong tingginya setengah — pola yang sama dipakai
  // WinnerList untuk alasan yang sama.
  const columns = strips <= 6 ? 1 : 2;

  /**
   * Ukuran kotak DIHITUNG dari ruang yang tersisa, bukan dari daftar nilai tetap.
   *
   * Versi sebelumnya memakai `clamp(... , 4.6vh, 62px)` per tingkat jumlah
   * pemenang. Batas atas dalam piksel itulah masalahnya: di layar proyektor yang
   * tinggi, kotak berhenti tumbuh pada 62px dan lima deret berkumpul kecil-kecil
   * di tengah dengan ruang kosong lebar di atas dan di bawahnya.
   *
   * Sekarang dua batas dihitung dan CSS `min()` memilih yang lebih ketat:
   *   - batas TINGGI  — jatah vertikal tiap baris deret, dibagi jumlah baris.
   *   - batas LEBAR   — jatah horizontal dibagi jumlah huruf deret terpanjang,
   *                     sehingga nama sepanjang apa pun tetap muat sebaris.
   *
   * Hasilnya kotak sebesar mungkin yang masih muat: besar untuk satu pemenang,
   * mengecil sendiri saat pemenangnya banyak, tanpa ambang yang ditebak.
   */
  const rows = Math.ceil(strips / columns);
  const lengths = Array.from({ length: strips }, (_, index) => {
    const code = codeOf(index);
    return code.length > 0 ? code.length : sampleLength;
  });
  // `sampleLength` ikut dihitung supaya kotak tidak menyusut mendadak saat nama
  // pemenang ternyata lebih panjang dari rata-rata kolam.
  const maxLength = Math.max(3, sampleLength, ...lengths);
  const perRow = 54 / rows;
  const widthBudget = columns === 1 ? 74 : 35;
  const byWidth = widthBudget / maxLength;

  const box = {
    width: `min(${(perRow * 0.45).toFixed(2)}vh, ${byWidth.toFixed(2)}vw)`,
    height: `min(${(perRow * 0.62).toFixed(2)}vh, ${(byWidth / 0.72).toFixed(2)}vw)`,
    font: `min(${(perRow * 0.36).toFixed(2)}vh, ${(byWidth * 0.62).toFixed(2)}vw)`,
    name: `min(${(perRow * 0.15).toFixed(2)}vh, ${(byWidth * 0.3).toFixed(2)}vw)`,
    gap: `min(${(perRow * 0.06).toFixed(2)}vh, ${(byWidth * 0.1).toFixed(2)}vw)`,
  };

  return <div
    className="grid h-full min-h-0 w-full place-content-center justify-items-center overflow-hidden px-[3vw]"
    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, auto))`, gap: `1.4vh 3vw` }}
  >
    {Array.from({ length: strips }).map((_, strip) => {
      const target = codeOf(strip);
      const length = target.length > 0 ? target.length : sampleLength;
      const lockedHere = locked[strip] ?? 0;
      const settledAll = !spinning && lockedHere >= length;

      // Nama di bawah deret hanya ditulis bila digitnya BUKAN nama itu sendiri.
      //
      // Deret mengeja nomor kursi bila peserta punya, dan namanya bila tidak.
      // Pada kasus kedua, menambahkan nama di bawahnya berarti menulis kata yang
      // sama dua kali berturut-turut. Pada kasus pertama ia justru wajib: tanpa
      // itu penonton hanya melihat kode kursi dan tidak tahu siapa yang menang.
      const spellsName = target.length > 0 && target === (main[strip]?.name ?? "");

      return <div key={strip} className="flex flex-col items-center" style={{ gap: box.gap }}>
        <div className="flex flex-wrap justify-center" style={{ gap: box.gap }}>
          {Array.from({ length }).map((_, index) => {
            const settled = !spinning && index < lockedHere;
            // Offset `strip * 13` membuat deret kedua tidak menampilkan huruf
            // acak yang persis sama dengan deret pertama pada tiap denyut.
            const char = settled ? target[index] : alphabet[(tick + index * 7 + strip * 13) % alphabet.length];
            // Kotak yang terkunci membesar sekejap lalu kembali, seperti tuas
            // yang jatuh ke tempatnya. Tanpa itu penguncian hanya pergantian
            // huruf, dan dari kursi belakang tidak terlihat bedanya dengan huruf
            // acak yang kebetulan sama.
            return <motion.div
              key={index}
              className="flex items-center justify-center border-2"
              style={{ borderColor: accent, width: box.width, height: box.height }}
              animate={settled ? { scale: [1, 1.16, 1], backgroundColor: accent } : { scale: 1, backgroundColor: `${accent}00` }}
              transition={settled ? { duration: 0.32, ease: easing.emphasizedDecelerate } : { duration: 0 }}
            >
              {/* Huruf acak meluncur masuk dari bawah tiap denyut, seperti
                  gulungan mekanik; huruf yang terkunci diam di tempatnya. */}
              <span key={settled ? "final" : char} className={`font-bold tabular-nums ${settled ? "" : "reel-in"}`} style={{ fontFamily, fontSize: box.font, color: settled ? readableOn(accent) : text }}>
                {char}
              </span>
            </motion.div>;
          })}
        </div>

        {settledAll && (!spellsName || main[strip]?.company) && <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-[70vw] text-center">
            {!spellsName && <p className="truncate font-bold uppercase" style={{ fontFamily, fontSize: box.name, color: accent }}>{main[strip]?.name}</p>}
            {main[strip]?.company && <p className="truncate" style={{ fontFamily, fontSize: box.name, color: text, opacity: 0.7 }}>{main[strip].company}</p>}
          </motion.div>
        </AnimatePresence>}
      </div>;
    })}

    {/* Cadangan tidak mendapat deret digitnya sendiri: ia bukan yang dipanggil ke
        panggung, dan memberinya kotak sebesar pemenang membuat penonton mengira
        pemenangnya ada empat. */}
    {/* `gridColumn: 1 / -1` supaya baris cadangan tetap melintang penuh saat
        deretnya disusun dua kolom, bukan terjepit di satu sel. */}
    {!spinning && backups.length > 0 && <p className="text-center" style={{ gridColumn: "1 / -1", fontFamily, fontSize: "clamp(10px, 1.6vh, 22px)", color: text, opacity: 0.7 }}>
      Cadangan: {backups.map((winner) => winner.name).join(" · ")}
    </p>}
  </div>;
}

// ===========================================================================
// Panah tancap
// ===========================================================================

/**
 * Acak yang DAPAT DIULANG, diturunkan dari indeks.
 *
 * `Math.random()` tidak boleh dipakai untuk posisi kertas: server dan browser
 * akan menghasilkan angka berbeda pada render pertama, dan React membuang
 * seluruh pohonnya karena tidak cocok. Fungsi ini memberi sebaran yang terlihat
 * acak tetapi sama di kedua sisi.
 *
 * TIDAK menyentuh apa pun yang menyangkut hasil undian — pemenang datang dari
 * server. Ini murni tata letak.
 */
function scatter(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Kertas undian melayang, lalu SELURUH panah dilepas bersamaan.
 *
 * Panah serentak, bukan bergiliran. Undian lima pemenang adalah satu lemparan
 * yang menghasilkan lima nama, bukan lima undian berturut-turut — versi
 * bergiliran membuat panah kedua terasa seperti undian ulang. Jeda antar panah
 * hanya 70ms, cukup untuk terbaca sebagai lontaran beruntun, bukan antrean.
 *
 * Kertas dan panahnya berkas SVG di `public/undian/`, bukan bentukan CSS. SVG
 * dan bukan PNG karena kartu ikut membesar mengikuti jumlah pemenang: raster
 * akan pecah persis pada ukuran yang paling terlihat dari kursi belakang.
 */
export function DartAnimation({ roster, winners, accent, text, fontFamily, pendingCount }: AnimationProps) {
  const names = useRosterNames(roster);
  const drawing = winners.length === 0;
  const main = useMemo(() => winners.filter((winner) => !winner.is_backup), [winners]);
  const backups = useMemo(() => winners.filter((winner) => winner.is_backup), [winners]);
  const winnerCount = main.length;

  // Jumlah kartu sudah benar sejak animasi mulai, diambil dari konfigurasi
  // hadiah. Tanpa itu tata letak melompat tepat pada detik pemenang muncul.
  const slots = Math.max(1, drawing ? (pendingCount ?? 1) : winnerCount);

  /**
   * Ukuran kartu dihitung dari ruang tersisa, bukan dari daftar nilai tetap.
   *
   * Dua batas, CSS `min()` memilih yang lebih ketat: jatah lebar dibagi jumlah
   * kolom, dan jatah tinggi dibagi jumlah baris. Kertasnya beraspek 1,4 : 1
   * mengikuti berkas SVG-nya.
   */
  const columns = slots <= 2 ? slots : slots <= 6 ? 3 : 4;
  const rows = Math.ceil(slots / columns);

  /**
   * Panah butuh RUANGNYA SENDIRI di kiri tiap kartu.
   *
   * Batang yang menjulur keluar kartu ikut dihitung dalam pembagian lebar,
   * kalau tidak ia menimpa kartu di sebelah kirinya — dan dengan tiga kartu
   * berjajar, tiga batang hitam melintang di atas tiga nama sekaligus.
   *
   *   lebar total  = kolom x kartu + (kolom-1) x (julur + sela)
   *   julur        = PROTRUDE x lebar kartu
   */
  const PROTRUDE = 0.34;
  const GAP_VW = 1.5;
  const widthVw = (86 - (columns - 1) * GAP_VW) / (columns + (columns - 1) * PROTRUDE);
  const heightVw = (56 / rows) * 1.4;
  const cardWidth = `min(${widthVw.toFixed(2)}vw, ${heightVw.toFixed(2)}vh)`;
  const nameSize = `min(${(widthVw * 0.12).toFixed(2)}vw, ${(heightVw * 0.12).toFixed(2)}vh)`;
  const subSize = `min(${(widthVw * 0.052).toFixed(2)}vw, ${(heightVw * 0.052).toFixed(2)}vh)`;
  // Sela kolom memuat julur batang. Dihitung dari cabang vw; bila batas tinggi
  // yang menang, kartunya lebih kecil dan selanya sekadar sedikit berlebih.
  const columnGap = `${(widthVw * PROTRUDE + GAP_VW).toFixed(2)}vw`;

  // Kertas latar dibatasi 16: di atas itu layar penuh, tiap kertas terlalu kecil
  // untuk terbaca, dan beban animasi di komputer panggung naik terus.
  const papers = useMemo(() => names.slice(0, 16), [names]);

  return <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden">
    {/* Lapisan kertas melayang. `pointer-events-none` supaya tidak pernah
        menangkap sentuhan di layar sentuh yang dipakai operator. */}
    <div className="pointer-events-none absolute inset-0">
      {papers.map((name, index) => <motion.div
        key={`${name}-${index}`}
        className="absolute flex items-center justify-center"
        style={{
          left: `${(3 + scatter(index, 1) * 84).toFixed(2)}%`,
          top: `${(4 + scatter(index, 2) * 82).toFixed(2)}%`,
          width: `min(15vw, 17vh)`,
          aspectRatio: "1.4",
          backgroundImage: "url(/undian/paper.svg)",
          backgroundSize: "100% 100%",
          // Kertas latar diredupkan begitu pemenang muncul supaya kartu yang
          // tertancap panah menjadi satu-satunya yang menarik mata.
          opacity: drawing ? 0.9 : 0.25,
        }}
        // Amplitudo dalam vh, bukan belasan piksel. Sebelumnya kertas hanya
        // naik-turun 12–28px dalam 4–6 detik: di proyektor 1080p itu tidak
        // terbaca sebagai gerak, dan operator mengira animasinya belum dimulai
        // — lalu mencari tombol "mulai" yang tidak ada. Selama membidik
        // (`drawing`) kertas melayang lebar dan lebih cepat; setelah pemenang
        // tampil ia mereda supaya tidak bersaing dengan kartu yang tertancap.
        animate={drawing ? {
          y: [`0vh`, `${(-(5 + scatter(index, 3) * 6)).toFixed(1)}vh`, `0vh`],
          x: [`0vw`, `${((scatter(index, 7) - 0.5) * 5).toFixed(1)}vw`, `0vw`],
          rotate: [-9 + scatter(index, 4) * 18, 7 - scatter(index, 5) * 16, -9 + scatter(index, 4) * 18],
        } : {
          y: [`0vh`, `${(-(1 + scatter(index, 3) * 1.5)).toFixed(1)}vh`, `0vh`],
          x: `0vw`,
          rotate: -9 + scatter(index, 4) * 18,
        }}
        transition={{ duration: (drawing ? 2.4 : 4.2) + scatter(index, 6) * 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="max-w-[86%] truncate font-semibold uppercase" style={{ fontFamily, fontSize: "clamp(9px, 1.4vh, 18px)", color: "#6B5B3A" }}>
          {name}
        </span>
      </motion.div>)}
    </div>

    {/* Panah yang MEMBIDIK selama menunggu aba-aba: melayang di tepi kiri,
        naik-turun mencari sasaran, ujungnya menghadap kertas. Inilah yang
        memberi tahu ruangan bahwa undian sudah berjalan dan tinggal menunggu
        lemparan — tanpa itu, kertas yang melayang terbaca sebagai layar diam.
        Saat pemenang tiba, panah pembidik ini hilang dan panah sungguhan
        terbang dari posisi yang sama menuju kartu. */}
    {drawing ? (
      <motion.img
        src="/undian/dart.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-[4vw] top-1/2 z-10"
        style={{ width: "min(22vw, 26vh)", translateY: "-50%" }}
        initial={{ x: "-40vw", opacity: 0 }}
        animate={{ x: 0, opacity: 1, y: ["-9vh", "9vh", "-9vh"], rotate: [-5, 5, -5] }}
        transition={{
          x: { ...expressive.spatial.slow },
          opacity: { duration: 0.4 },
          y: { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
          rotate: { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
        }}
      />
    ) : null}

    {/* Kartu pemenang. Muncul serentak bersama panahnya. */}
    <div className="relative z-10 flex flex-wrap items-center justify-center px-[3vw]" style={{ columnGap, rowGap: "2.5vh" }}>
      {drawing
        // Pil gelap tembus pandang di belakang teks, bukan teks telanjang
        // beropasitas 60%. Warna teks acara bisa putih di atas latar krem
        // (persis setelan Marugame), dan teks putih 60% di atas krem plus
        // kertas yang melayang di belakangnya tidak terbaca dari kursi mana pun.
        ? <p
            className="rounded-full px-[2.4vw] py-[1vh] font-semibold"
            style={{ fontFamily, fontSize: "clamp(16px, 3.4vh, 46px)", color: "#FFFFFF", background: "rgba(0, 0, 0, 0.45)", backdropFilter: "blur(6px)" }}
          >
            {slots > 1 ? `Membidik ${slots} nama` : "Membidik"}
            {/* Titik-titik yang berdenyut bergantian: penanda "sedang berjalan"
                yang terbaca bahkan ketika kertas di belakangnya tidak dilihat. */}
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                aria-hidden
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.2, ease: "easeInOut" }}
              >
                .
              </motion.span>
            ))}
          </p>
        : main.map((winner, index) => <motion.div
            key={`${winner.name}-${winner.slot_order}`}
            className="relative flex flex-col items-center justify-center"
            style={{
              width: cardWidth,
              aspectRatio: "1.4",
              backgroundImage: "url(/undian/paper.svg)",
              backgroundSize: "100% 100%",
              // Satu-satunya sentuhan warna branding pada kartu. Kertasnya
              // sengaja dibiarkan berwarna kertas: mewarnai seluruh lembar
              // dengan accent menghapus alasan memakai gambar kertas.
              boxShadow: `0 0 0 0.35vh ${accent}`,
            }}
            // Sentakan saat panah mendarat: kertas terdorong lalu diam.
            //
            // DUA keyframe, bukan tiga. Pegas Framer Motion hanya menerima dua
            // (dari → ke); tiga nilai seperti [0.9, 1.05, 1] melempar galat
            // "Only two keyframes currently supported with spring" dan
            // merobohkan seluruh layar undian tepat saat pemenang tiba.
            // Lewatannya tidak perlu ditulis tangan: pegas `spatial` yang
            // teredam 0,8 memang melewati sasaran sedikit lalu kembali — itulah
            // sentakannya. Opasitas memakai pegas `effects` yang teredam kritis
            // supaya tidak berkedip.
            initial={{ scale: 0.9, opacity: 0, rotate: index % 2 === 0 ? -2.5 : 2.5 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ ...expressive.spatial.default, opacity: expressive.effects.default, delay: index * 0.07 + 0.28 }}
          >
            {/* Isi digeser ke kanan sejauh mata panah masuk, supaya batangnya
                tidak pernah melintang di atas huruf. */}
            <p className="max-w-[70%] truncate pl-[16%] font-bold uppercase tracking-[-0.02em]" style={{ fontFamily, fontSize: nameSize, color: "#2A2010" }}>
              {winner.name}
            </p>
            {winner.company && <p className="mt-[0.4vh] max-w-[70%] truncate pl-[16%]" style={{ fontFamily, fontSize: subSize, color: "#2A2010", opacity: 0.65 }}>
              {winner.company}
            </p>}

            {/* Panah menancap dari kiri. Lebarnya relatif terhadap kartu, jadi
                proporsinya tetap sama di jumlah pemenang berapa pun. Julurnya
                (34%) ikut diperhitungkan saat membagi lebar layar di atas. */}
            <motion.img
              src="/undian/dart.svg"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{ width: "48%", left: "-34%", top: "50%", translateY: "-50%" }}
              initial={{ x: "-120vw", opacity: 0, rotate: -6 }}
              animate={{ x: 0, opacity: 1, rotate: 0 }}
              // Semua panah berangkat hampir bersamaan; 70ms hanya memberi kesan
              // lontaran beruntun, bukan antrean.
              // Pegas M3 skema ekspresif, bukan angka yang ditebak. Nama pemenang
              // memang boleh melewati sasaran sedikit lalu kembali — di layar
              // panggung, itulah yang membuat pengumuman terasa hidup.
              transition={{ ...expressive.spatial.default, delay: index * 0.07 }}
            />

            {/* Gelombang benturan di titik mata panah masuk: satu cincin yang
                mengembang lalu lenyap, dijadwalkan tepat setelah panah tiba.
                Tanpa ini panah "muncul" di kartu; dengan ini ia MENANCAP. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{ left: "8%", top: "50%", width: "22%", aspectRatio: "1", border: `0.5vh solid ${accent}`, translateX: "-50%", translateY: "-50%" }}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: [0.2, 3.2], opacity: [0.9, 0] }}
              transition={{ duration: 0.75, ease: "easeOut", delay: index * 0.07 + 0.34 }}
            />
          </motion.div>)}
    </div>

    {/* Jumlah kertas TIDAK menyatakan besarnya kolam — kolam bisa ratusan.
        Keterangan ini mencegah penonton menyimpulkan pesertanya cuma enam belas. */}
    {drawing && <p className="relative z-10 mt-[2vh]" style={{ fontFamily, fontSize: "clamp(10px, 1.6vh, 22px)", color: text, opacity: 0.55 }}>
      {roster.length > papers.length ? `${roster.length} nama di kolam` : ""}
    </p>}

    {!drawing && backups.length > 0 && <p className="relative z-10 mt-[2vh] px-[3vw] text-center" style={{ fontFamily, fontSize: "clamp(10px, 1.6vh, 22px)", color: text, opacity: 0.7 }}>
      Cadangan: {backups.map((winner) => winner.name).join(" · ")}
    </p>}
  </div>;
}

// ===========================================================================
// Daftar pemenang, dipakai bersama beberapa varian
// ===========================================================================
export function WinnerList({
  winners, accent, text, fontFamily,
}: {
  winners: AnimationProps["winners"]; accent: string; text: string; fontFamily: string;
}) {
  const main = winners.filter((winner) => !winner.is_backup);
  const backups = winners.filter((winner) => winner.is_backup);

  // Satu pemenang mendapat ukuran penuh; banyak pemenang mengecil supaya semuanya
  // muat tanpa menggulir. Layar proyektor tidak bisa digulir oleh siapa pun, jadi
  // apa pun yang melewati tepi bawah hilang sepenuhnya dari acara.
  const size = main.length === 1 ? "clamp(32px, 8vw, 132px)"
    : main.length <= 3 ? "clamp(24px, 4.6vw, 76px)"
    : main.length <= 6 ? "clamp(18px, 3vw, 48px)"
    : "clamp(13px, 2vw, 30px)";
  const subSize = main.length <= 3 ? "clamp(12px, 2vw, 30px)" : "clamp(9px, 1.2vw, 16px)";

  // Di atas enam nama, daftar bertumpuk menjadi terlalu tinggi dan tetap meluber
  // meski hurufnya sudah dikecilkan. Dua kolom memotong tingginya setengah.
  const twoColumns = main.length > 6;

  return <div className="flex h-full w-full min-h-0 flex-col items-center justify-center gap-[1.5vh] overflow-hidden">
    <div className={`w-full min-h-0 flex-1 overflow-hidden ${twoColumns ? "grid grid-cols-2 content-center gap-x-[3vw] gap-y-[0.6vh]" : "flex flex-col items-center justify-center gap-[1.2vh]"}`}>
      <AnimatePresence>
        {main.map((winner, index) => <motion.div
          key={`${winner.name}-${winner.slot_order}`}
          initial={{ opacity: 0, scale: 0.86, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          // Jeda antar nama dijaga agar totalnya tidak melebihi ~2 detik. Dengan
          // 0.35s tetap, sepuluh nama butuh 3,5 detik dan yang terakhir muncul
          // setelah MC selesai menyebutkan semuanya.
          transition={{ ...expressive.spatial.default, delay: Math.min(index * 0.35, index * (2 / Math.max(1, main.length))) }}
          className="min-w-0 text-center"
        >
          {/* Kilau emas menyapu nama pemenang. Nama yang diam berwarna aksen
              sudah benar; nama yang berkilau adalah nama yang baru saja menang. */}
          <p className="truncate font-bold uppercase tracking-[-0.03em]" style={{ fontFamily, fontSize: size, lineHeight: 1.1 }}>
            <ShineText color={accent}>{winner.name}</ShineText>
          </p>
          {(winner.company || winner.seat) && <p className="truncate" style={{ fontFamily, fontSize: subSize, color: text, opacity: 0.75 }}>
            {[winner.company, winner.seat && `Kursi ${winner.seat}`].filter(Boolean).join(" · ")}
          </p>}
        </motion.div>)}
      </AnimatePresence>
    </div>

    {backups.length > 0 && <div className="w-full shrink-0 border-t pt-[1vh] text-center" style={{ borderColor: `${text}33` }}>
      <p className="font-semibold uppercase tracking-[0.2em]" style={{ fontFamily, fontSize: "clamp(9px, 1.1vw, 15px)", color: text, opacity: 0.5 }}>Cadangan</p>
      <p className="mt-[0.4vh] line-clamp-2" style={{ fontFamily, fontSize: "clamp(11px, 1.6vw, 24px)", color: text, opacity: 0.8 }}>
        {backups.map((winner) => winner.name).join(" · ")}
      </p>
    </div>}
  </div>;
}

// ===========================================================================
// Confetti
// ===========================================================================
/**
 * Confetti canvas, ditulis tangan.
 *
 * Tanpa dependency baru. Yang dibutuhkan hanya kertas jatuh selama tiga detik,
 * dan pustaka confetti mana pun membawa mesin fisika lengkap untuk itu — di
 * halaman yang berjalan pada komputer panggung yang tidak kita kenal spesifikasinya.
 *
 * Membersihkan dirinya sendiri setelah selesai: canvas yang tertinggal dengan
 * requestAnimationFrame yang masih hidup akan terus memakan CPU sepanjang acara.
 */
export function ConfettiBurst({ trigger, accent, text }: { trigger: number; accent: string; text: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Warna diterima sebagai dua string, BUKAN sebagai array palet.
  //
  // Array yang dibangun di JSX pemanggil punya identitas baru setiap render, dan
  // halaman ini render setiap dua detik karena polling. Effect di bawah karena itu
  // berjalan ulang terus-menerus dan confetti-nya tidak pernah berhenti — penanda
  // `confettiTrigger` di pemanggil tidak menolong, karena yang memicu ulang bukan
  // trigger-nya melainkan dependency palet.
  //
  // Dengan prop berupa string, tidak ada cara bagi pemanggil untuk mengirim nilai
  // yang tidak stabil.
  useEffect(() => {
    if (trigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const palette = [accent, text, "#FFFFFF", "#FF6B6B", "#4ECDC4"];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 12,
      vy: 2.2 + Math.random() * 3.4,
      vx: -1.4 + Math.random() * 2.8,
      rotation: Math.random() * Math.PI,
      spin: -0.14 + Math.random() * 0.28,
      color: palette[Math.floor(Math.random() * palette.length)],
    }));

    let frame = 0;
    let raf = 0;
    const draw = () => {
      frame += 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const piece of pieces) {
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.spin;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        context.restore();
      }
      if (frame < 220) raf = requestAnimationFrame(draw);
      else context.clearRect(0, 0, canvas.width, canvas.height);
    };
    draw();

    return () => cancelAnimationFrame(raf);
  }, [trigger, accent, text]);

  if (trigger === 0) return null;
  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" aria-hidden="true" />;
}
