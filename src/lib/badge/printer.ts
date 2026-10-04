/**
 * Profil printer badge, disimpan di PERANGKAT yang mencetak.
 *
 * Halaman web tidak bisa melihat printer yang tersambung ke laptop: tidak ada
 * API peramban untuk itu, dan memilih printer adalah tugas dialog cetak sistem
 * operasi. Yang bisa dan perlu diingat Tally hanya dua hal yang berbeda per
 * printer: kertas apa yang dimasukkan (dan seberapa tebal yang sanggup ia
 * tarik), serta koreksi geser hasil kalibrasi.
 *
 * Disimpan di localStorage, bukan database: koreksi geser milik pasangan laptop
 * dan printer tertentu, bukan milik acara, dan berlaku untuk semua acara yang
 * dicetak dari meja itu.
 */

export type JenisPrinter = "laser" | "inkjet";

export type ProfilPrinter = {
	id: string;
	nama: string;
	model: string;
	jenis: JenisPrinter;
	/** Gramatur kertas terberat yang sanggup ditarik, dari manual printer. */
	gsm_maks: number;
	/** Kertas yang dimasukkan, mis. "A4" atau "A5". */
	kertas: "A4" | "A5";
	/** Koreksi hasil kalibrasi, mm. Positif ke kanan dan ke bawah. */
	geser_x: number;
	geser_y: number;
	dikalibrasi: boolean;
};

const KUNCI = "tally.badge.printer.v1";
const KUNCI_AKTIF = "tally.badge.printer.aktif";

export function bacaPrinter(): ProfilPrinter[] {
	try {
		const mentah = JSON.parse(window.localStorage.getItem(KUNCI) ?? "[]");
		return Array.isArray(mentah) ? (mentah as ProfilPrinter[]).filter((p) => p && typeof p.id === "string") : [];
	} catch {
		return [];
	}
}

export function simpanPrinter(daftar: ProfilPrinter[]) {
	try {
		window.localStorage.setItem(KUNCI, JSON.stringify(daftar));
	} catch {
		// Mode privat atau penyimpanan penuh: profil hanya hidup selama halaman terbuka.
	}
}

export function bacaPrinterAktif(): string | null {
	try {
		return window.localStorage.getItem(KUNCI_AKTIF);
	} catch {
		return null;
	}
}

export function simpanPrinterAktif(id: string | null) {
	try {
		if (id) window.localStorage.setItem(KUNCI_AKTIF, id);
		else window.localStorage.removeItem(KUNCI_AKTIF);
	} catch {
		// Lihat simpanPrinter.
	}
}

export function printerBaru(): ProfilPrinter {
	return {
		id: `p${Date.now().toString(36)}`,
		nama: "",
		model: "",
		jenis: "laser",
		gsm_maks: 163,
		kertas: "A4",
		geser_x: 0,
		geser_y: 0,
		dikalibrasi: false,
	};
}

/** Koreksi geser dibatasi: lebih dari 10 mm bukan meleset, tetapi kertas yang salah. */
export const GESER_MAKS = 10;

/** Draf susunan di localStorage: "Cetak contoh" mencetak yang sedang dilihat, belum disimpan pun. */
export const KUNCI_DRAF = "tally.badge.draf";
