/**
 * Isi notifikasi HP peserta (Web Push). Fungsi murni (pesan.check.ts), dipakai
 * server (lib/push/kirim.ts) dan dicerminkan service worker portal
 * (app/peserta-sw.js), yang membaca bentuk yang sama.
 *
 * Bentuknya Declarative Web Push (WebKit, iOS/iPadOS 18.4+): `web_push: 8030`
 * dan `notification` di tingkat atas. Safari menampilkannya sendiri tanpa
 * menjalankan skrip, jadi notifikasi tetap muncul walau service worker gagal.
 * Chrome, Firefox, dan Safari lama menyerahkannya ke handler `push` di service
 * worker, yang membaca kolom yang sama.
 * https://webkit.org/blog/16535/meet-declarative-web-push/
 */

export const JUDUL_MAX = 80;
export const ISI_MAX = 180;

export type PesanPush = {
  web_push: 8030;
  notification: {
    title: string;
    body: string;
    /** Alamat absolut yang dibuka saat notifikasi diketuk. */
    navigate: string;
    lang: "id" | "en";
    /** Pengumuman yang sama menimpa notifikasinya sendiri, bukan menumpuk. */
    tag?: string;
    silent?: false;
  };
};

/** Satu baris: spasi berderet dan baris baru dirapatkan. */
function rapat(teks: string): string {
  return teks.replace(/\s+/g, " ").trim();
}

/** Dipotong di batas kata bila bisa, diberi elipsis. */
export function potong(teks: string, maks: number): string {
  const bersih = rapat(teks);
  if (bersih.length <= maks) return bersih;
  const awal = bersih.slice(0, maks - 1);
  const spasi = awal.lastIndexOf(" ");
  return `${(spasi > maks * 0.6 ? awal.slice(0, spasi) : awal).trimEnd()}…`;
}

export function buatPesan(input: { judul: string; isi: string; buka: string; lang: "id" | "en"; tag?: string }): PesanPush {
  const judul = potong(input.judul, JUDUL_MAX);
  return {
    web_push: 8030,
    notification: {
      title: judul || (input.lang === "en" ? "New announcement" : "Pengumuman baru"),
      body: potong(input.isi, ISI_MAX),
      navigate: input.buka,
      lang: input.lang,
      ...(input.tag ? { tag: input.tag } : {}),
    },
  };
}

export type Platform = "ios" | "android" | "desktop";

/** Untuk ringkasan di CMS saja, dari user agent perangkat yang mendaftar. */
export function platformDari(ua: string | null | undefined): Platform {
  const teks = ua ?? "";
  if (/iPhone|iPad|iPod/i.test(teks)) return "ios";
  if (/Android/i.test(teks)) return "android";
  return "desktop";
}
