// Ukuran tata letak Forum, diturunkan dari Figma IFC yang digambar di bingkai
// 1920px. Ukuran huruf dan jarak mengecil sebanding lebar layar (vw) sampai
// batas bawah yang masih nyaman di ponsel, jadi layar 1920 persis Figma dan
// layar laptop 1440 tetap memakai perbandingan yang sama.

/** Wadah isi: 1520 dari 1920 di Figma, pinggir 200px yang ikut menyempit. */
export const WADAH = "mx-auto w-[min(1520px,calc(100%-2*clamp(16px,10.4vw,200px)))]";

/** Judul hero, 96px di Figma. */
export const H_HERO = "text-[clamp(40px,5vw,96px)] font-bold leading-[1.2] tracking-[-0.02em]";
/** Judul bagian besar ("Event Program", "Location"), 64px. */
export const H_BAGIAN = "text-[clamp(32px,3.34vw,64px)] font-bold leading-[1.3] tracking-[-0.02em]";
/** Judul panel ("About The Event", "Event Rundown"), 40px. */
export const H_PANEL = "text-[clamp(26px,2.09vw,40px)] font-bold leading-[1.2]";
/** Judul kartu (Dress code, pembicara), 32px. */
export const H_KARTU = "text-[clamp(21px,1.67vw,32px)] font-bold leading-[1.25]";
/** Isi panjang, 24/36. */
export const TEKS_BESAR = "text-[clamp(16px,1.25vw,24px)] leading-[1.5]";
/** Teks menu dan tabel, 20px medium. */
export const TEKS_MENU = "text-[clamp(15px,1.04vw,20px)] font-medium leading-[1.4] tracking-[-0.02em]";

/** Jarak antarbagian, sekitar 120px di Figma. */
export const JARAK = "mt-[clamp(56px,6.25vw,120px)]";

/** Bayangan foto kartu (Dress code, galeri pembicara). */
export const BAYANGAN_KARTU = "shadow-[0_12px_20px_rgba(0,0,0,0.25)]";

/** Tombol persegi seperti Figma (tanpa sudut membulat). */
export const TOMBOL = "inline-flex items-center justify-center whitespace-nowrap transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
