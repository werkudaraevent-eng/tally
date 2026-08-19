export const THEME_STORAGE_KEY = "prima-theme";
export const CONTRAST_STORAGE_KEY = "prima-contrast";

export type ThemePreference = "light" | "dark" | "system";
export type ContrastPreference = "standard" | "high";

/**
 * Skrip yang dijalankan sebelum halaman digambar.
 *
 * Harus disisipkan sinkron di <head>, bukan di komponen React. Kalau preferensi
 * baru dipasang setelah hidrasi, halaman sempat tampil terang selama satu frame
 * lalu berkedip menjadi gelap. Di layar operasional yang dibuka-tutup puluhan
 * kali semalam, kedipan itu terbaca sebagai aplikasi yang gagal memuat.
 *
 * Sengaja tidak memakai data-theme untuk pilihan "system": tanpa atribut,
 * aturan prefers-color-scheme di m3-theme.css yang berlaku, dan tema ikut
 * berubah saat pengguna mengganti setelan perangkat tanpa memuat ulang halaman.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}
var c=localStorage.getItem(${JSON.stringify(CONTRAST_STORAGE_KEY)});
if(c==="high"){document.documentElement.dataset.contrast="high"}
}catch(e){}})()`;

export function applyTheme(preference: ThemePreference) {
	const root = document.documentElement;
	if (preference === "system") {
		delete root.dataset.theme;
	} else {
		root.dataset.theme = preference;
	}
	try {
		localStorage.setItem(THEME_STORAGE_KEY, preference);
	} catch {
		// Mode penyamaran atau penyimpanan penuh. Temanya tetap berlaku untuk sesi
		// ini; yang hilang hanya ingatannya. Tidak layak menggagalkan aksi.
	}
}

export function applyContrast(preference: ContrastPreference) {
	const root = document.documentElement;
	if (preference === "high") {
		root.dataset.contrast = "high";
	} else {
		delete root.dataset.contrast;
	}
	try {
		localStorage.setItem(CONTRAST_STORAGE_KEY, preference);
	} catch {
		// Lihat catatan di applyTheme.
	}
}

export function readTheme(): ThemePreference {
	if (typeof document === "undefined") return "system";
	const value = document.documentElement.dataset.theme;
	return value === "light" || value === "dark" ? value : "system";
}

export function readContrast(): ContrastPreference {
	if (typeof document === "undefined") return "standard";
	return document.documentElement.dataset.contrast === "high" ? "high" : "standard";
}

/** Tema yang benar-benar tampil, setelah "system" diselesaikan. */
export function resolveTheme(preference: ThemePreference): "light" | "dark" {
	if (preference !== "system") return preference;
	if (typeof window === "undefined") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
