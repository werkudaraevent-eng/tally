// Kelas bersama tata letak Modern: halaman acara dan blok dari pustaka blok.
// Satu sumber, supaya blok baru tidak punya grid, judul, atau tombol yang sedikit
// berbeda dari bagian bawaan di sebelahnya.

/** Grid halaman: 1440, pinggir 80px di layar lebar seperti rancangan. */
export const SHELL = "mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-10 xl:px-20";
export const MUTED = "text-[var(--reg-on-surface-variant)]";
export const HEAD = "[font-family:var(--landing-heading)]";
/** Judul bagian: 48px di layar lebar, 32px di ponsel. */
export const JUDUL = `${HEAD} text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[48px] sm:leading-[1.25]`;
export const SECTION = "scroll-mt-24 py-16 sm:py-24";

/**
 * Tombol. Tinggi 52px dan `rounded-md`, sama dengan tombol hero Editorial
 * (DESIGN.md). Pil hanya untuk chip fakta, supaya tidak semua elemen berbentuk
 * pil (antislop R-11).
 */
export const PIL = "m3-state inline-flex min-h-[52px] items-center gap-2 rounded-md px-5 text-title-medium";
export const PIL_PENUH = `${PIL} bg-[var(--reg-primary)] font-semibold text-[var(--reg-on-primary)]`;
export const PIL_GARIS = `${PIL} border border-[var(--reg-on-surface)] font-medium text-[var(--reg-on-surface)]`;
