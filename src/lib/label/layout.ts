/**
 * Rupa label peserta dan profil printernya — tipe, nilai bawaan, dan aturan
 * "apa yang tergambar di elemen ini".
 *
 * TANPA zod, dan itu disengaja. Berkas ini ikut ke bundel peramban lewat
 * penggambar kanvas di layar pemindai; skema validasinya duduk terpisah di
 * `schema.ts` dan hanya dipakai route handler. Digabung, setiap petugas di
 * pintu masuk ikut mengunduh pustaka validasi yang tidak pernah dijalankan di
 * ponselnya.
 */

/**
 * Isi yang bisa dicetak pada sebuah elemen.
 *
 * `static` adalah teks tetap yang diketik admin — nama acara, "TAMU", tahun.
 * Sisanya diambil dari peserta yang barusan didaftarkan.
 */
export const LABEL_FIELDS = ["name", "company", "title", "qr_code", "static"] as const;
export type LabelField = (typeof LABEL_FIELDS)[number];

export const LABEL_FIELD_LABELS: Record<LabelField, string> = {
	name: "Nama peserta",
	company: "Instansi",
	title: "Jabatan",
	qr_code: "Kode peserta",
	static: "Teks tetap",
};

export type LabelTextElement = {
	type: "text";
	field: LabelField;
	/** Diisi hanya untuk `field: "static"`. */
	text?: string;
	x: number;
	y: number;
	/** Lebar kotak teks. Teks yang lebih lebar DIKECILKAN, bukan dipotong. */
	w: number;
	size: number;
	weight: "normal" | "bold";
	align: "left" | "center" | "right";
	uppercase?: boolean;
};

export type LabelQrElement = {
	type: "qr";
	/** Selalu kode peserta. Ada sebagai kolom supaya bentuknya sejajar dengan teks. */
	field: "qr_code";
	x: number;
	y: number;
	size: number;
};

export type LabelElement = LabelTextElement | LabelQrElement;

export type LabelLayout = {
	v: 1;
	elements: LabelElement[];
};

/**
 * Profil printer, dikirim hampir apa adanya ke driver.
 *
 * `task` dan `dpi` adalah dua nilai yang menentukan segalanya: keduanya memilih
 * urutan perintah dan resolusi. B21 termasuk keluarga "b1" 203 dpi menurut
 * dokumentasi protokolnya, tetapi belum pernah diuji di hardware oleh siapa pun
 * yang menerbitkan pustakanya — karena itu keduanya bisa diubah dari CMS.
 */
export type LabelSettings = {
	enabled: boolean;
	name_prefixes: string[];
	task: "b1" | "v4";
	dpi: number;
	density: number;
	label_type: number;
	speed: number;
	/**
	 * Lebar cetak sebenarnya. Selalu hasil `lebarCetak()`, bukan angka yang
	 * diketik: ia nilai terkecil di antara lebar label dan lebar kepala cetak.
	 */
	width_px: number;
	height_px: number;
	offset_y_px: number;
	/** Lebar kepala cetak printer. Sifat printer, bukan sifat labelnya. */
	head_px: number;
	width_mm: number;
	height_mm: number;
	layout: LabelLayout;
};

/** Milimeter ke piksel pada dpi tertentu. 1 inci = 25,4 mm. */
export function mmKePx(mm: number, dpi: number): number {
	return Math.max(1, Math.round((mm * dpi) / 25.4));
}

/**
 * Lebar yang benar-benar tercetak.
 *
 * Kepala cetak yang lebih sempit daripada label membuang kolom di luarnya tanpa
 * galat, jadi mengirim lebar label apa adanya hanya menghasilkan tepi kanan yang
 * hilang diam-diam. Yang dikirim harus yang paling kecil di antara keduanya.
 */
export function lebarCetak(widthMm: number, dpi: number, headPx: number): number {
	return Math.min(mmKePx(widthMm, dpi), headPx);
}

export const DEFAULT_LABEL_LAYOUT: LabelLayout = {
	v: 1,
	elements: [
		{ type: "text", field: "name", x: 8, y: 12, w: 368, size: 34, weight: "bold", align: "center" },
		{ type: "text", field: "company", x: 8, y: 58, w: 368, size: 20, weight: "normal", align: "center" },
		{ type: "qr", field: "qr_code", x: 142, y: 86, size: 100 },
		{ type: "text", field: "qr_code", x: 8, y: 194, w: 368, size: 26, weight: "bold", align: "center" },
	],
};

/**
 * Nilai bawaan untuk acara yang belum pernah membuka layar setelan.
 *
 * Angka-angka ini adalah geometri B1 50×30 mm pada 203 dpi (384×240 px, geser
 * +4). B21 memakai kepala cetak 203 dpi yang sama, jadi ini titik awal yang
 * masuk akal — bukan kebenaran yang sudah diukur. Yang mengukurnya adalah label
 * pertama yang keluar dari printer, dan setelahnya angkanya dibetulkan di CMS.
 */
export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
	enabled: false,
	name_prefixes: ["B21", "B1"],
	task: "b1",
	dpi: 203,
	density: 3,
	label_type: 1,
	speed: 1,
	width_px: 384,
	height_px: 240,
	offset_y_px: 4,
	head_px: 384,
	width_mm: 50,
	height_mm: 30,
	layout: DEFAULT_LABEL_LAYOUT,
};

/**
 * Ukuran gulungan yang dijual untuk B21 dan sekelasnya.
 *
 * Panitia memilih dari daftar ini, bukan mengetik piksel: yang ada di tangan
 * mereka adalah kotak gulungan bertuliskan milimeter. Pikselnya dihitung dari
 * dpi printer, jadi daftar ini tidak perlu tahu apa pun tentang model printer.
 */
export const UKURAN_LABEL = [
	{ w: 50, h: 30, label: "50 x 30 mm", catatan: "Paling umum untuk badge" },
	{ w: 40, h: 30, label: "40 x 30 mm", catatan: null },
	{ w: 50, h: 40, label: "50 x 40 mm", catatan: "Muat jabatan" },
	{ w: 40, h: 60, label: "40 x 60 mm", catatan: "Tegak, muat logo" },
	{ w: 30, h: 20, label: "30 x 20 mm", catatan: "Kecil, kode saja" },
] as const;

/** Data peserta yang dicetak. Sengaja bukan tipe peserta penuh: label hanya butuh empat kolom. */
export type LabelData = {
	name: string;
	company: string | null;
	title: string | null;
	qr_code: string;
};

/**
 * Teks yang benar-benar tergambar untuk sebuah elemen.
 *
 * Kolom kosong menghasilkan string kosong, dan penggambar melewatinya — peserta
 * tanpa instansi tidak boleh menghasilkan label bertuliskan "null" atau baris
 * kosong yang menggeser sisanya.
 */
export function labelText(element: LabelElement, data: LabelData): string {
	if (element.type !== "text") return "";
	const mentah =
		element.field === "static"
			? (element.text ?? "")
			: element.field === "name"
				? data.name
				: element.field === "company"
					? (data.company ?? "")
					: element.field === "title"
						? (data.title ?? "")
						: data.qr_code;
	const bersih = mentah.trim();
	return element.uppercase ? bersih.toUpperCase() : bersih;
}

/** Contoh untuk pratinjau CMS. Bukan peserta sungguhan. */
export const LABEL_PREVIEW_DATA: LabelData = {
	name: "Hanung Sastriya",
	company: "Werkudara Group",
	title: "Direktur Operasional",
	qr_code: "REG159425",
};
