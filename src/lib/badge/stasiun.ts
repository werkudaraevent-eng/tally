/**
 * Stasiun cetak: bentuk data bersama HP pemindai, laptop stasiun (/stasiun),
 * dan API. Tanpa impor server; separuh server ada di stasiun-server.ts.
 *
 * Stasiun adalah satu laptop di meja registrasi yang tersambung ke printer.
 * HP dan tablet memindai; server mengantrekan badge ke stasiun yang dipilih HP;
 * laptop menarik antrean dan mencetak satu per satu lewat Chrome
 * `--kiosk-printing`. Chrome tidak pernah memberi tahu halaman apakah kertasnya
 * keluar, jadi keadaan terakhir adalah "terkirim", bukan "tercetak".
 */

export type StatusAntrean = "antre" | "diambil" | "terkirim" | "gagal" | "kedaluwarsa";
export type JenisCetak = "otomatis" | "ulang" | "uji";

/** Kapan HP meminta badge tanpa ketukan. Tiga nilai yang sama dengan printer label. */
export type ModeCetakMeja = "off" | "walkin" | "semua";

export type StasiunRingkas = {
	id: number;
	nama: string;
	/** Laptopnya menarik antrean dalam lease 15 detik terakhir. */
	online: boolean;
	dijeda: boolean;
	/** Tarikan terakhir, untuk "terputus sejak 10.44". */
	terakhir: string | null;
};

export type PekerjaanCetak = {
	id: number;
	jenis: JenisCetak;
	/** Dibaca setelah badge_cetak_sapu: antre yang melewati batas acara sudah `kedaluwarsa`. */
	status: StatusAntrean;
	galat: string | null;
	participant_id: string | null;
	created_at: string;
	selesai_at: string | null;
	stasiun: StasiunRingkas;
};

/** Yang dikembalikan route scan dan walk-in di samping hasil kehadiran. */
export type HasilCetakMeja = {
	pekerjaan: PekerjaanCetak | null;
	/** False: peserta ini sudah punya badge otomatis, dan inilah pekerjaan itu. */
	baru?: boolean;
	/** Gagal diantrekan. Kehadirannya tetap tersimpan. */
	galat?: string;
};

export const KEDALUWARSA_PILIHAN = [5, 10, 30] as const;

/** Masih menunggu printer. */
export function masihJalan(status: StatusAntrean) {
	return status === "antre" || status === "diambil";
}
