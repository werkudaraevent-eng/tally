"use client";

import { motion } from "framer-motion";
import { useMemo, type CSSProperties } from "react";

/**
 * Lapisan efek layar panggung undian: suasana di belakang, ledakan saat
 * pemenang tampil. Terpisah dari varian animasinya karena keduanya berlaku
 * untuk SEMUA varian — roda, slot, kartu, digit, panah — dan untuk keadaan
 * menunggu sekalipun.
 *
 * Semua gerak abadi di sini adalah CSS `transform`/`opacity` (lihat globals.css,
 * bagian "Efek layar panggung undian"). Framer Motion hanya dipakai untuk gerak
 * yang dipicu sekali: ledakan.
 */

/** Acak yang dapat diulang. Server dan browser harus menggambar titik yang sama. */
function scatter(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Suasana panggung: dua sapuan warna yang hanyut, kerlip, dan vignette.
 *
 * Sapuan memakai warna aksen dan warna teks acara pada opasitas rendah, jadi
 * ia menyatu dengan latar apa pun yang dipilih admin — polos maupun gambar.
 * Vignette meredupkan tepi supaya nama di tengah menjadi hal paling terang di
 * layar, apa pun gambar latarnya.
 *
 * Dipasang dengan `-z-10` di dalam wadah `isolate`: ia selalu di bawah isi.
 */
export function AmbientStage({ accent, text }: { accent: string; text: string }) {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => ({
        left: 4 + scatter(index, 11) * 92,
        top: 6 + scatter(index, 12) * 88,
        size: 0.45 + scatter(index, 13) * 0.9,
        duration: 1.8 + scatter(index, 14) * 2.6,
        delay: scatter(index, 15) * 3,
      })),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="aurora-drift absolute -left-[20%] -top-[30%] h-[90vmax] w-[90vmax] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${accent}38, transparent 70%)` }}
      />
      <div
        className="aurora-drift-2 absolute -bottom-[35%] -right-[15%] h-[80vmax] w-[80vmax] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${text}16, transparent 70%)` }}
      />
      {sparkles.map((sparkle, index) => (
        <span
          key={index}
          className="twinkle absolute rounded-full"
          style={{
            left: `${sparkle.left.toFixed(2)}%`,
            top: `${sparkle.top.toFixed(2)}%`,
            width: `${sparkle.size.toFixed(2)}vmin`,
            height: `${sparkle.size.toFixed(2)}vmin`,
            background: "#ffffff",
            boxShadow: `0 0 ${(sparkle.size * 2.5).toFixed(2)}vmin ${accent}`,
            "--twinkle-duration": `${sparkle.duration.toFixed(2)}s`,
            "--twinkle-delay": `${sparkle.delay.toFixed(2)}s`,
          } as CSSProperties}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.32) 100%)" }}
      />
    </div>
  );
}

/**
 * Teks dengan kilau emas yang menyapu.
 *
 * Dua lapis teks identik: dasar berwarna aksen, salinan putih di atasnya yang
 * hanya terlihat lewat pita mask yang bergerak (`.shine-band`). Keduanya
 * mewarisi font dan ukuran dari pembungkus, jadi tata letaknya persis sama —
 * termasuk pembungkusan baris pada nama hadiah yang panjang.
 *
 * Dipakai untuk elemen yang boleh menyala terus: nama hadiah dan nama pemenang.
 */
export function ShineText({ children, color, className, style }: { children: string; color: string; className?: string; style?: CSSProperties }) {
  return (
    <span className={`relative inline-block ${className ?? ""}`} style={{ color, ...style }}>
      <span>{children}</span>
      <span aria-hidden className="shine-band pointer-events-none absolute inset-0" style={{ color: "#ffffff" }}>
        {children}
      </span>
    </span>
  );
}

/**
 * Ledakan saat pemenang tampil: kilatan warna aksen memenuhi layar lalu padam,
 * dua cincin mengembang dari tengah. Berjalan sekali per undian — `trigger`
 * naik satu setiap pemenang datang, dan `key` memutar ulang seluruhnya.
 *
 * Pasangan visual dari fanfare dan confetti yang sudah ada: suara memberi
 * tahu ruangan, kilatan memberi tahu mata yang sedang menatap ponsel.
 */
export function RevealBurst({ trigger, accent }: { trigger: number; accent: string }) {
  if (trigger === 0) return null;
  return (
    <div key={trigger} aria-hidden className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <motion.div
        className="absolute inset-0"
        style={{ background: accent }}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      {[0, 0.14].map((delay) => (
        <motion.div
          key={delay}
          className="absolute rounded-full"
          style={{ width: "28vmin", height: "28vmin", border: `0.7vh solid ${accent}` }}
          initial={{ scale: 0.2, opacity: 0.9 }}
          animate={{ scale: 5, opacity: 0 }}
          transition={{ duration: 1.2, ease: [0.05, 0.7, 0.1, 1], delay }}
        />
      ))}
    </div>
  );
}
