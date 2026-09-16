/**
 * `localStorage` sebagai external store, bukan sebagai state yang disalin.
 *
 * ---- Kenapa bukan `useState` + `useEffect` --------------------------------
 *
 * Pola yang paling mudah ditulis adalah membaca localStorage di dalam efek lalu
 * menyalinnya ke state. Ia salah dua kali. Pertama, itu membuat dua sumber
 * kebenaran untuk satu nilai, dan dua komponen yang membaca kunci yang sama
 * akan menyimpan salinannya masing-masing: satu memperbarui, yang lain tidak
 * tahu. Kedua, React 19 menolaknya secara eksplisit — `setState` di badan efek
 * memicu render berjenjang, dan lint proyek ini menggagalkan build karenanya.
 *
 * `useSyncExternalStore` adalah jawaban yang disediakan React untuk persis
 * bentuk ini: nilainya hidup di luar React, dibaca saat render, dan siapa pun
 * yang menulis memberi tahu semua pembacanya sekaligus.
 *
 * ---- Kenapa snapshot-nya di-cache ----------------------------------------
 *
 * `useSyncExternalStore` memanggil pembacanya pada SETIAP render dan
 * membandingkan hasilnya dengan `Object.is`. `JSON.parse` menghasilkan objek
 * baru setiap kali, jadi tanpa cache setiap render terlihat seperti perubahan
 * dan React merender lagi, selamanya. Cache-nya dikunci pada teks mentahnya:
 * selama teks di localStorage tidak berubah, referensi yang sama dikembalikan.
 */

type Entri = { raw: string | null; nilai: unknown };

const cache = new Map<string, Entri>();
const pendengar = new Set<() => void>();

function beritahu() {
  for (const dengar of pendengar) dengar();
}

export function langgananLokal(onChange: () => void) {
  pendengar.add(onChange);
  // Peristiwa `storage` datang dari TAB LAIN, bukan dari tab ini. Panitia
  // membuka ruang kerja di dua tab sepanjang hari (satu daftar peserta, satu
  // kehadiran), dan tanpa ini riwayat "terakhir dibuka" di tab kiri membeku pada
  // keadaan satu jam lalu.
  window.addEventListener("storage", onChange);
  return () => {
    pendengar.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function bacaLokal<T>(kunci: string, cadangan: T): T {
  let mentah: string | null = null;
  try {
    mentah = window.localStorage.getItem(kunci);
  } catch {
    // Mode penyamaran dan situs yang datanya diblokir melempar di sini.
    // Preferensi yang tidak bisa dibaca bukan alasan navigasi gagal tampil.
    return cadangan;
  }

  const tersimpan = cache.get(kunci);
  if (tersimpan && tersimpan.raw === mentah) return tersimpan.nilai as T;

  let nilai = cadangan;
  if (mentah !== null) {
    try {
      nilai = JSON.parse(mentah) as T;
    } catch {
      // JSON rusak dari versi sebelumnya. Dipakai cadangannya, dan entrinya akan
      // tertimpa pada penulisan berikutnya.
      nilai = cadangan;
    }
  }
  cache.set(kunci, { raw: mentah, nilai });
  return nilai;
}

export function tulisLokal(kunci: string, nilai: unknown) {
  const mentah = JSON.stringify(nilai);
  // Cache diisi SEBELUM menulis, dengan objek yang sama persis yang diberikan
  // pemanggil. Kalau ia diisi dari hasil `JSON.parse` nanti, pembacaan
  // berikutnya mengembalikan objek yang berbeda walau isinya identik.
  cache.set(kunci, { raw: mentah, nilai });
  try {
    window.localStorage.setItem(kunci, mentah);
  } catch {
    // Kuota penuh atau penyimpanan diblokir. Nilainya tetap benar untuk sesi
    // ini karena cache sudah diisi; yang hilang hanya keawetannya.
  }
  beritahu();
}
