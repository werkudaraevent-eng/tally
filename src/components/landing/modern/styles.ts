// Kelas bersama tata letak Modern: halaman acara dan blok dari pustaka blok.
// Satu sumber, supaya blok baru tidak punya grid, judul, atau tombol yang sedikit
// berbeda dari bagian bawaan di sebelahnya.

/** Grid halaman: 1440, pinggir 80px di layar lebar seperti rancangan. */
export const SHELL = "mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-10 xl:px-20";
export const MUTED = "text-[var(--reg-on-surface-variant)]";
export const HEAD = "[font-family:var(--landing-heading)]";
/** Judul bagian: 48px di layar lebar, 32px di ponsel. */
export const JUDUL = `${HEAD} text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[48px] sm:leading-[1.25]`;
/** Jarak antarbagian 144px di layar lebar (dulu ~200px): bagian terbaca berkelompok, bukan satu lembar panjang. */
/**
 * Judul butir: pertanyaan FAQ dan nama pembicara. 18/24 di layar lebar, 16/24
 * di ponsel. Satu langkah di atas paragraf 16, jauh di bawah judul bagian 48.
 */
export const JUDUL_BUTIR = "text-title-medium font-semibold sm:text-[18px] sm:leading-6";
/** Lebar paragraf isi: 35rem teks, 60-75 karakter per baris. */
export const LEBAR_BACA = "max-w-[35rem]";
/**
 * Label bagian di atas judul: kapital 13/16 600, jarak huruf 0,08em, warna
 * aksen dari pemakainya. Sengaja terbaca sebagai label, bukan teks kecil
 * yang nyasar. Hanya dipasang bila menambah konteks yang tidak ada di judul.
 */
export const LABEL_BAGIAN = "text-[13px] font-semibold uppercase leading-4 tracking-[0.08em]";
export const SECTION = "scroll-mt-[var(--nav-h)] py-12 sm:py-16 lg:py-[72px]";

/**
 * Tombol. Tinggi 52px dan `rounded-md`, sama dengan tombol hero Editorial
 * (DESIGN.md). Pil hanya untuk chip fakta, supaya tidak semua elemen berbentuk
 * pil (antislop R-11).
 */
export const PIL = "m3-state inline-flex min-h-[52px] items-center gap-2 rounded-md px-5 text-title-medium";
export const PIL_PENUH = `${PIL} bg-[var(--reg-primary)] font-semibold text-[var(--reg-on-primary)]`;
export const PIL_GARIS = `${PIL} border border-[var(--reg-on-surface)] font-medium text-[var(--reg-on-surface)]`;
