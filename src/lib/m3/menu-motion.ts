import { easing } from "@/lib/m3/motion";

/**
 * Gerak buka-tutup menu M3, dipakai bersama pemilih event dan menu akun.
 *
 * Menu tumbuh dari sudut tempat tombolnya berada (`origin-*` disetel pemanggil),
 * 120ms masuk dan lebih cepat keluar. Bukan pegas: menu adalah kontrol yang
 * dibuka berkali-kali sehari di layar kerja, dan pantulan yang menyenangkan
 * sekali menjadi gangguan pada kali kelima puluh.
 *
 * Skala hanya di sumbu Y — menu yang membesar dari titik terbaca sebagai
 * muncul entah dari mana; yang membentang ke bawah terbaca sebagai membuka.
 */
export const MENU_MOTION = {
	initial: { opacity: 0, scaleY: 0.92, y: -4 },
	animate: { opacity: 1, scaleY: 1, y: 0 },
	exit: { opacity: 0, scaleY: 0.96, y: -2, transition: { duration: 0.08, ease: easing.standardAccelerate } },
	transition: { duration: 0.12, ease: easing.standardDecelerate },
} as const;
