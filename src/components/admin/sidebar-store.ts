"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { bacaLokal, langgananLokal, tulisLokal } from "@/lib/local-store";

/**
 * Keadaan sidebar yang harus selamat dari reload: rel terlipat, kelompok mana
 * yang terbuka, dan halaman yang terakhir dibuka.
 *
 * Ketiganya dikumpulkan di satu berkas karena ketiganya punya jebakan yang sama,
 * dan jebakan itu mahal kalau dipecahkan tiga kali dengan tiga cara berbeda:
 * nilainya hanya ada di peramban, sementara render pertama terjadi di server.
 *
 * Dua yang di bawah dibaca lewat `useSyncExternalStore` (lihat `lib/local-store`),
 * jadi tidak ada salinan di dalam state yang bisa menyimpang. Rel terlipat
 * berbeda, dan itulah kenapa ia pakai COOKIE: ia mengubah LEBAR tata letak,
 * bukan isi sebuah daftar. Kalau ia baru terbaca setelah hidrasi, setiap
 * pemuatan halaman dimulai dengan rel lebar yang lalu menciut dan seluruh
 * konten melompat 196px ke kiri, tepat ketika orang mulai membaca. Cookie
 * terbaca di komponen server, jadi HTML pertama sudah membawa lebar yang benar.
 */

const COOKIE_PIN = "tally_pin";
const KUNCI_GRUP = "tally:nav-groups:v1";
const KUNCI_RECENTS = "tally:recents:v1";

/** Recents ditampilkan lima. Yang dipin tidak ikut terdesak keluar. */
const BATAS_RECENTS = 5;

/**
 * Nilai kosong yang referensinya TETAP.
 *
 * `useSyncExternalStore` membandingkan snapshot dengan `Object.is`. Cadangan
 * yang ditulis `[]` di dalam pembacanya adalah array baru pada setiap render,
 * jadi setiap render terlihat seperti perubahan dan komponennya merender lagi
 * tanpa henti. Konstanta di tingkat modul menutup itu.
 */
const GRUP_KOSONG: string[] = [];
const RECENTS_KOSONG: Recent[] = [];

/* ---- Sematan rel --------------------------------------------------------- */

/**
 * Apakah rel DISEMATKAN, bukan apakah ia terlipat.
 *
 * Bedanya penting dan bukan soal penamaan. "Terlipat" adalah satu keadaan
 * visual; "disematkan" adalah keputusan tentang TATA LETAK, dan yang kedua
 * itulah yang bertahan. Rel yang tidak disematkan masih bisa melebar kapan saja
 * karena kursor lewat di atasnya, tetapi lebar kolom konten tidak ikut berubah.
 * Hanya nilai ini yang menentukan pergeseran konten, dan hanya nilai ini yang
 * disimpan.
 */
export function usePinnedSidebar(awal: boolean) {
  // Cookie tidak punya mekanisme langganan, dan tidak membutuhkannya: yang bisa
  // mengubahnya hanya tombol sematan. Nilai awalnya datang dari server.
  const [pinned, setPinned] = useState(awal);

  const toggle = useCallback(() => {
    setPinned((sebelumnya) => {
      const berikutnya = !sebelumnya;
      // `max-age` setahun, bukan cookie sesi: orang yang melepas sematan
      // melakukannya karena layarnya sempit, dan layarnya tidak melebar besok pagi.
      document.cookie = `${COOKIE_PIN}=${berikutnya ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return berikutnya;
    });
  }, []);

  /**
   * Ctrl/Cmd+B, pintasan yang sama dengan yang dipakai editor dan dasbor lain
   * untuk hal yang persis sama.
   *
   * MATI saat kursor ada di kolom isian. Ctrl+B adalah "tebalkan" di setiap
   * kotak teks yang pernah ada, dan admin yang sedang menulis deskripsi acara
   * lalu melihat kolom kontennya bergeser tidak akan menghubungkannya dengan
   * tombol yang barusan ia tekan. Hanya Ctrl/Cmd+K yang menembus kolom isian,
   * karena di sana perjanjiannya memang begitu di mana-mana.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || !(event.metaKey || event.ctrlKey)) return;
      const fokus = document.activeElement as HTMLElement | null;
      if (fokus?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(fokus?.tagName ?? "")) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return { pinned, toggle };
}

/** Dibaca komponen server di `src/app/admin/layout.tsx`. Namanya hidup di satu tempat saja. */
export const NAMA_COOKIE_PIN = COOKIE_PIN;

/**
 * Tanpa cookie, rel DISEMATKAN.
 *
 * Bawaannya harus yang tidak perlu dipelajari: rel lebar berlabel bekerja tanpa
 * seorang pun menemukan bahwa mengarahkan kursor ke tepi kiri akan
 * memunculkannya. Rel ikon adalah pilihan yang diambil, bukan yang diwarisi.
 */
export const PIN_BAWAAN = true;

/* ---- Kelompok menu yang terbuka ------------------------------------------ */

export function useOpenGroups(hrefIndukAktif: string | null) {
  const tersimpan = useSyncExternalStore(
    langgananLokal,
    () => bacaLokal(KUNCI_GRUP, GRUP_KOSONG),
    () => GRUP_KOSONG,
  );

  const terbuka = useMemo(() => {
    const kumpulan = new Set(tersimpan);
    // Kelompok yang berisi halaman aktif SELALU terbuka, apa pun yang tersimpan.
    // Menutupnya berarti menyembunyikan satu-satunya item yang sedang tersorot,
    // dan penyorot yang tidak terlihat sama saja dengan tidak ada penyorot.
    if (hrefIndukAktif) kumpulan.add(hrefIndukAktif);
    return kumpulan;
  }, [tersimpan, hrefIndukAktif]);

  const toggle = useCallback((href: string) => {
    const kumpulan = new Set(bacaLokal(KUNCI_GRUP, GRUP_KOSONG));
    if (kumpulan.has(href)) kumpulan.delete(href);
    else kumpulan.add(href);
    tulisLokal(KUNCI_GRUP, [...kumpulan]);
  }, []);

  return { terbuka, toggle };
}

/* ---- Terakhir dibuka ----------------------------------------------------- */

export type Recent = {
  path: string;
  label: string;
  /** Kelompok induk, atau nama acara bila halaman ini tidak punya induk. */
  konteks: string;
  at: number;
  pinned?: boolean;
};

type ArgRecents = {
  /** Kunci penyimpanan dibedakan per user: satu laptop panitia dipakai bergantian. */
  username: string | null;
  path: string;
  label: string | undefined;
  konteks: string;
};

export function useRecents({ username, path, label, konteks }: ArgRecents) {
  const kunci = username ? `${KUNCI_RECENTS}:${username}` : null;

  const recents = useSyncExternalStore(
    langgananLokal,
    () => (kunci ? bacaLokal(kunci, RECENTS_KOSONG) : RECENTS_KOSONG),
    () => RECENTS_KOSONG,
  );

  /**
   * Pencatatan kunjungan. Efek yang menulis ke sistem di luar React, bukan efek
   * yang menyalin sesuatu ke dalam state — itulah bentuk yang memang jadi tugas
   * `useEffect`.
   *
   * Menunggu `username`: kuncinya dibedakan per user, dan menulis sebelum tahu
   * siapa yang login berarti riwayat orang pertama menempel pada orang kedua.
   */
  useEffect(() => {
    if (!kunci || !label) return;
    const lama = bacaLokal(kunci, RECENTS_KOSONG);
    const sudahAda = lama.find((item) => item.path === path);
    // Yang dipin tidak diurutkan ulang saat dikunjungi. Pin adalah permintaan
    // "biarkan ini di tempatnya", dan daftar yang tetap bergeser setiap kali
    // halamannya dibuka adalah pin yang tidak menepati janjinya.
    if (sudahAda?.pinned) return;
    if (lama[0]?.path === path) return;

    const baru: Recent = { path, label, konteks, at: Date.now(), pinned: false };
    const sisanya = lama.filter((item) => item.path !== path);
    const dipin = sisanya.filter((item) => item.pinned);
    const bebas = [baru, ...sisanya.filter((item) => !item.pinned)].slice(0, BATAS_RECENTS);
    tulisLokal(kunci, [...dipin, ...bebas]);
  }, [kunci, path, label, konteks]);

  const togglePin = useCallback((target: string) => {
    if (!kunci) return;
    const lama = bacaLokal(kunci, RECENTS_KOSONG);
    const diubah = lama.map((item) => (item.path === target ? { ...item, pinned: !item.pinned } : item));
    tulisLokal(kunci, [...diubah.filter((item) => item.pinned), ...diubah.filter((item) => !item.pinned)]);
  }, [kunci]);

  return { recents, togglePin };
}
