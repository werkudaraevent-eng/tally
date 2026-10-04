/**
 * Rupa badge kertas: tipe, nilai bawaan, dan geometri lembar cetaknya.
 *
 * TANPA zod, sama seperti `label/layout.ts`: berkas ini ikut ke bundel peramban
 * (penyunting dan halaman cetak), sedangkan validasinya duduk di `schema.ts`
 * dan hanya dipakai route handler.
 *
 * ---- Satuannya milimeter ---------------------------------------------------
 *
 * Label NIIMBOT memakai piksel karena yang dikirim ke printer termal memang
 * gambar berpiksel. Badge kertas dicetak lewat dialog cetak peramban dari HTML
 * berukuran persis (`@page`), jadi satuan yang jujur adalah milimeter: yang
 * dipegang panitia penggaris dan kertas A4, bukan kanvas. Pratinjau di layar
 * dan lembar yang dicetak memakai komponen yang SAMA (`BadgeSisi`), hanya
 * diskalakan, supaya yang dilihat admin persis yang keluar dari printer.
 */

/** Isi teks yang diambil dari data peserta atau acara. `static` diketik admin. */
export const BADGE_TEXT_FIELDS = ["name", "company", "title", "qr_code", "event_name", "static"] as const;
export type BadgeTextField = (typeof BADGE_TEXT_FIELDS)[number];

export const BADGE_TEXT_LABELS: Record<BadgeTextField, string> = {
	name: "Nama peserta",
	company: "Instansi",
	title: "Jabatan",
	qr_code: "Kode peserta",
	event_name: "Nama acara",
	static: "Teks bebas",
};

export type BadgeTextElement = {
	type: "text";
	field: BadgeTextField;
	text?: string;
	/** Posisi dan lebar kotak dalam mm dari sudut kiri atas sisi badge. */
	x: number;
	y: number;
	w: number;
	/** Ukuran huruf dalam pt. Teks yang terlalu lebar DIKECILKAN, bukan dipotong. */
	size: number;
	weight: "normal" | "bold";
	align: "left" | "center" | "right";
	uppercase?: boolean;
	color: string;
};

/**
 * Kode QR. `size` adalah sisi PELAT putihnya, bukan sisi kodenya.
 *
 * Pelat itu adalah zona tenang: kode digambar di tengahnya dengan tepi empat
 * modul (ISO/IEC 18004). Menyimpan ukuran pelat, bukan ukuran kode, membuat
 * zona tenang mustahil dihapus dari penyunting: tidak ada setelan yang
 * memperkecilnya, dan isi lain yang diletakkan di atasnya terlihat jelas
 * menutupi kotak putih.
 */
export type BadgeQrElement = {
	type: "qr";
	/** `qr_code` untuk kode peserta; `rundown_url` untuk tautan rundown terbaru. */
	field: "qr_code" | "rundown_url";
	x: number;
	y: number;
	size: number;
};

/** Bidang warna polos, untuk pita kategori dan pita judul tanpa desain unggahan. */
export type BadgeRectElement = {
	type: "rect";
	x: number;
	y: number;
	w: number;
	h: number;
	color: string;
	radius: number;
};

export type BadgeImageElement = {
	type: "image";
	url: string | null;
	x: number;
	y: number;
	w: number;
	h: number;
};

/**
 * Rundown yang diisi dari menu Rundown acara.
 *
 * `day`: id bagian rundown, `"semua"` untuk semua hari ringkas, atau `"hari_ini"`
 * untuk bagian yang tanggalnya sama dengan hari pencetakan (badge walk-in).
 */
export type BadgeRundownElement = {
	type: "rundown";
	x: number;
	y: number;
	w: number;
	h: number;
	day: string;
	/** Baris berjam sama digabung menjadi satu baris. */
	merge_parallel: boolean;
	/** Ukuran huruf awal (pt). Turun sampai 8 pt bila tidak muat, tidak lebih kecil. */
	size: number;
	color: string;
	accent: string;
};

export type BadgeElement = BadgeTextElement | BadgeQrElement | BadgeRectElement | BadgeImageElement | BadgeRundownElement;

/**
 * Format kertas. Semua dicetak SATU sisi; sisi belakang didapat dari lipatan.
 *
 * - `a4_lipat4`: A4 tegak dilipat empat jadi A6. Bisa di printer apa pun.
 * - `a5_lipat2`: A5 mendatar dilipat sekali jadi A6. Untuk kertas tebal.
 * - `a4_isi2`: A4 tegak berisi dua lembar A5 mendatar. Potong, lalu lipat sekali.
 * - `a4_lipat2`: A4 mendatar dilipat sekali jadi badge A5.
 * - `tunggal`: satu sisi tanpa lipatan, ditata beberapa per lembar di kertas printer.
 * - `khusus`: ukuran badge diketik sendiri, dengan atau tanpa lipatan, ditata di kertas printer.
 */
export const BADGE_FORMATS = ["a4_lipat4", "a5_lipat2", "a4_isi2", "a4_lipat2", "tunggal", "khusus"] as const;
export type BadgeFormatKind = (typeof BADGE_FORMATS)[number];

export type BadgeFold = "none" | "side" | "top";

export type BadgeFormat = {
	kind: BadgeFormatKind;
	/** Ukuran badge jadi, dipakai `tunggal` dan `khusus`. */
	w_mm: number;
	h_mm: number;
	/** Hanya untuk `khusus`. */
	fold: BadgeFold;
};

export type BadgeBackground = {
	mode: "polos" | "kv" | "unggah";
	color: string;
	front_url: string | null;
	back_url: string | null;
};

export type BadgeLayout = {
	v: 1;
	format: BadgeFormat;
	background: BadgeBackground;
	front: BadgeElement[];
	back: BadgeElement[];
};

export type BadgeSide = "front" | "back";

/** Batas ukuran badge khusus. Di bawah 50 mm nama tidak terbaca dari satu meter. */
export const UKURAN_KHUSUS = { min: 50, max: 297 } as const;

/** Data yang dicetak. Sengaja bukan tipe peserta penuh. */
export type BadgeData = {
	name: string;
	company: string | null;
	title: string | null;
	qr_code: string;
};

export type BadgeEventData = {
	name: string;
	rundown_url: string;
	kv_url: string | null;
};

export const BADGE_PREVIEW_DATA: BadgeData = {
	name: "Hanung Sastriya",
	company: "Werkudara Group",
	title: "Direktur Operasional",
	qr_code: "REG159425",
};

/** Batas isi per sisi. Lebih dari ini tidak muat di A6 dan hanya memperlambat cetak 300 lembar. */
export const MAX_ELEMEN_PER_SISI = 24;

// ---- Ukuran sisi badge per format -------------------------------------------

export type Mm = { w: number; h: number };

export const KERTAS = {
	A4: { w: 210, h: 297 },
	A5: { w: 148, h: 210 },
	A6: { w: 105, h: 148 },
} as const;

/** Ukuran SATU sisi badge jadi, dalam mm. */
export function ukuranSisi(format: BadgeFormat): Mm {
	switch (format.kind) {
		case "a4_lipat4":
			return { w: 105, h: 148.5 };
		case "a5_lipat2":
		case "a4_isi2":
			return { w: 105, h: 148 };
		case "a4_lipat2":
			return { w: 148.5, h: 210 };
		case "tunggal":
		case "khusus":
			return { w: format.w_mm, h: format.h_mm };
	}
}

/** Apakah format ini punya sisi belakang. */
export function punyaBelakang(format: BadgeFormat): boolean {
	if (format.kind === "tunggal") return false;
	if (format.kind === "khusus") return format.fold !== "none";
	return true;
}

// ---- Lembar cetak -------------------------------------------------------------

export type Panel = {
	side: BadgeSide;
	/** Sudut kiri atas di lembar, mm. */
	x: number;
	y: number;
	w: number;
	h: number;
	/** 180 bila sisi ini dicetak terbalik supaya tegak setelah dilipat. */
	rotate: 0 | 180;
	/** Indeks badge di lembar (format `a4_isi2` memuat dua). */
	slot: number;
};

export type Garis = { x1: number; y1: number; x2: number; y2: number };

export type Lembar = {
	/** Ukuran kertas yang dimasukkan ke printer. */
	kertas: Mm;
	/** Nama kertas untuk keterangan, mis. "A4 tegak". */
	namaKertas: string;
	panels: Panel[];
	lipatan: Garis[];
	potongan: Garis[];
	/** Tanda potong pendek di sudut tiap badge, untuk badge yang ditata beberapa per lembar. */
	tanda: Garis[];
	/** Kuadran tersembunyi tempat petunjuk lipat dicetak (hanya A4 lipat empat). */
	petunjuk: { x: number; y: number; w: number; h: number } | null;
	badgePerLembar: number;
	/** Diisi bila ukuran khusus tidak muat di kertas mana pun. */
	tidakMuat: string | null;
};

/** Kertas yang dimasukkan ke printer. Diambil dari profil printer aktif, bawaannya A4. */
export type KertasPrinter = "A4" | "A5";

/**
 * Susunan lembar untuk sebuah format.
 *
 * Seluruh pengetahuan tentang "di mana depan, di mana belakang, dan ke mana
 * melipat" ada di sini, dipakai penyunting (untuk garis aman) dan halaman cetak
 * (untuk meletakkan sisi). Dua tempat yang menghitung sendiri akan berbeda
 * pada format pertama yang ditambah belakangan.
 */
export function susunLembar(format: BadgeFormat, kertasPrinter: KertasPrinter = "A4"): Lembar {
	const kosong = { potongan: [], tanda: [], petunjuk: null, tidakMuat: null };
	switch (format.kind) {
		case "a4_lipat4":
			// Depan kiri atas. Belakang kiri bawah, terbalik: lipatan kedua (bawah ke
			// belakang) memutarnya 180° sehingga terbaca tegak di punggung badge.
			// Kanan atas tertutup di dalam, dan di situ petunjuk lipat dicetak.
			return {
				...kosong,
				kertas: KERTAS.A4,
				namaKertas: "A4 tegak",
				panels: [
					{ side: "front", x: 0, y: 0, w: 105, h: 148.5, rotate: 0, slot: 0 },
					{ side: "back", x: 0, y: 148.5, w: 105, h: 148.5, rotate: 180, slot: 0 },
				],
				lipatan: [{ x1: 105, y1: 0, x2: 105, y2: 297 }, { x1: 0, y1: 148.5, x2: 210, y2: 148.5 }],
				petunjuk: { x: 105, y: 0, w: 105, h: 148.5 },
				badgePerLembar: 1,
			};
		case "a5_lipat2":
			// Lipatan tunggal di sumbu tegak: belakang tegak, tanpa putaran.
			return {
				...kosong,
				kertas: { w: 210, h: 148 },
				namaKertas: "A5 mendatar",
				panels: [
					{ side: "front", x: 0, y: 0, w: 105, h: 148, rotate: 0, slot: 0 },
					{ side: "back", x: 105, y: 0, w: 105, h: 148, rotate: 0, slot: 0 },
				],
				lipatan: [{ x1: 105, y1: 0, x2: 105, y2: 148 }],
				badgePerLembar: 1,
			};
		case "a4_isi2":
			return {
				...kosong,
				kertas: KERTAS.A4,
				namaKertas: "A4 tegak",
				panels: [0, 1].flatMap((slot) => [
					{ side: "front" as const, x: 0, y: slot * 148.5, w: 105, h: 148, rotate: 0 as const, slot },
					{ side: "back" as const, x: 105, y: slot * 148.5, w: 105, h: 148, rotate: 0 as const, slot },
				]),
				lipatan: [{ x1: 105, y1: 0, x2: 105, y2: 148 }, { x1: 105, y1: 148.5, x2: 105, y2: 296.5 }],
				potongan: [{ x1: 0, y1: 148.25, x2: 210, y2: 148.25 }],
				badgePerLembar: 2,
			};
		case "a4_lipat2":
			return {
				...kosong,
				kertas: { w: 297, h: 210 },
				namaKertas: "A4 mendatar",
				panels: [
					{ side: "front", x: 0, y: 0, w: 148.5, h: 210, rotate: 0, slot: 0 },
					{ side: "back", x: 148.5, y: 0, w: 148.5, h: 210, rotate: 0, slot: 0 },
				],
				lipatan: [{ x1: 148.5, y1: 0, x2: 148.5, y2: 210 }],
				badgePerLembar: 1,
			};
		case "tunggal":
			return tataDiKertas({ ...format, fold: "none" }, kertasPrinter);
		case "khusus":
			return tataDiKertas(format, kertasPrinter);
	}
}

/** Tepi kertas yang tidak dicetak printer kantor, dan jarak antarbadge tempat tanda potong. */
const TEPI_TATA = 6;
const JARAK_TATA = 6;

/**
 * Satu sisi dan ukuran khusus: ditata di kertas yang ADA di printer.
 *
 * Halaman seukuran badge (105 × 148 mm) dikirim ke printer berisi A4 membuat
 * driver mengecilkan atau menggesernya, dan ukurannya tidak lagi tepat. Jadi
 * lembarnya selalu kertas printer, dan badge disusun sebanyak yang muat dengan
 * tanda potong di sudut.
 *
 * Satu unit adalah badge beserta pasangannya: lipat samping dua sisi
 * berdampingan, lipat atas dua sisi bertumpuk dengan belakang TERBALIK, sebab
 * lipatan mendatar memutar sisi belakang 180°.
 */
function tataDiKertas(format: BadgeFormat, kertasPrinter: KertasPrinter): Lembar {
	const { w_mm: w, h_mm: h, fold } = format;
	const unit: Mm = fold === "side" ? { w: w * 2, h } : fold === "top" ? { w, h: h * 2 } : { w, h };
	const dasar = KERTAS[kertasPrinter];
	const pilihan: Array<{ kertas: Mm; nama: string }> = [
		{ kertas: { w: dasar.w, h: dasar.h }, nama: `${kertasPrinter} tegak` },
		{ kertas: { w: dasar.h, h: dasar.w }, nama: `${kertasPrinter} mendatar` },
	];
	const muat = (panjang: number, ukuran: number, tepi: number, jarak: number) =>
		Math.max(0, Math.floor((panjang - 2 * tepi + jarak + 0.01) / (ukuran + jarak)));

	let terbaik: { kertas: Mm; nama: string; kolom: number; baris: number; jarak: number } | null = null;
	for (const p of pilihan) {
		const kolom = muat(p.kertas.w, unit.w, TEPI_TATA, JARAK_TATA);
		const baris = muat(p.kertas.h, unit.h, TEPI_TATA, JARAK_TATA);
		if (kolom * baris > (terbaik ? terbaik.kolom * terbaik.baris : 0)) terbaik = { ...p, kolom, baris, jarak: JARAK_TATA };
	}
	// Badge selebar kertas: satu per lembar tanpa tepi, dipotong di garis tepi.
	if (!terbaik) {
		const pas = pilihan.find((p) => unit.w <= p.kertas.w + 0.01 && unit.h <= p.kertas.h + 0.01);
		if (pas) terbaik = { ...pas, kolom: 1, baris: 1, jarak: 0 };
	}
	if (!terbaik) {
		return {
			kertas: dasar,
			namaKertas: `${kertasPrinter} tegak`,
			panels: [{ side: "front", x: 0, y: 0, w, h, rotate: 0, slot: 0 }],
			lipatan: [],
			potongan: [],
			tanda: [],
			petunjuk: null,
			badgePerLembar: 1,
			tidakMuat: `Lembar ${Math.round(unit.w)} × ${Math.round(unit.h)} mm lebih besar dari kertas ${kertasPrinter}. Perkecil badge, atau pilih lipatan lain.`,
		};
	}

	const { kertas, kolom, baris, jarak } = terbaik;
	const lebarSemua = kolom * unit.w + (kolom - 1) * jarak;
	const tinggiSemua = baris * unit.h + (baris - 1) * jarak;
	const x0 = (kertas.w - lebarSemua) / 2;
	const y0 = (kertas.h - tinggiSemua) / 2;
	const panels: Panel[] = [];
	const lipatan: Garis[] = [];
	const tanda: Garis[] = [];
	let slot = 0;
	for (let r = 0; r < baris; r++) {
		for (let c = 0; c < kolom; c++, slot++) {
			const ox = x0 + c * (unit.w + jarak);
			const oy = y0 + r * (unit.h + jarak);
			panels.push({ side: "front", x: ox, y: oy, w, h, rotate: 0, slot });
			if (fold === "side") {
				panels.push({ side: "back", x: ox + w, y: oy, w, h, rotate: 0, slot });
				lipatan.push({ x1: ox + w, y1: oy, x2: ox + w, y2: oy + h });
			} else if (fold === "top") {
				panels.push({ side: "back", x: ox, y: oy + h, w, h, rotate: 180, slot });
				lipatan.push({ x1: ox, y1: oy + h, x2: ox + w, y2: oy + h });
			}
			// Tanda potong: 3 mm, mulai 1 mm di luar sudut, tidak pernah masuk badge.
			for (const [x, y, dx, dy] of [[ox, oy, -1, -1], [ox + unit.w, oy, 1, -1], [ox, oy + unit.h, -1, 1], [ox + unit.w, oy + unit.h, 1, 1]] as const) {
				tanda.push({ x1: x + dx, y1: y, x2: x + dx * 4, y2: y }, { x1: x, y1: y + dy, x2: x, y2: y + dy * 4 });
			}
		}
	}
	return {
		kertas,
		namaKertas: terbaik.nama,
		panels,
		lipatan,
		potongan: [],
		tanda: jarak > 0 ? tanda : [],
		petunjuk: null,
		badgePerLembar: kolom * baris,
		tidakMuat: null,
	};
}

/** Apakah lembar format ini sama dengan kertas di printer, tegak atau mendatar. */
export function kertasCocok(lembar: Lembar, kertasPrinter: KertasPrinter): boolean {
	const k = KERTAS[kertasPrinter];
	const sama = (a: number, b: number) => Math.abs(a - b) < 1;
	return (sama(lembar.kertas.w, k.w) && sama(lembar.kertas.h, k.h)) || (sama(lembar.kertas.w, k.h) && sama(lembar.kertas.h, k.w));
}

// ---- Area aman ---------------------------------------------------------------

/** Jarak aman dari tepi kertas: printer kantor tidak mencetak 3-5 mm terluar. */
export const AMAN_TEPI = 6;
/** Jarak aman dari lipatan dan garis potong: lipatan tangan meleset 1-2 mm. */
export const AMAN_LIPAT = 3;

export type Inset = { top: number; right: number; bottom: number; left: number };

/**
 * Area aman satu sisi, dalam koordinat sisi itu sendiri (sesudah diputar).
 *
 * Tiap tepi panel diperiksa: menempel tepi kertas berarti 6 mm, selain itu
 * (lipatan atau garis potong) 3 mm. Sisi yang dicetak terbalik menukar atas
 * dengan bawah dan kiri dengan kanan, karena yang dilihat orang adalah sisi
 * yang sudah tegak.
 */
export function areaAman(format: BadgeFormat, side: BadgeSide, kertasPrinter: KertasPrinter = "A4"): Inset {
	const lembar = susunLembar(format, kertasPrinter);
	const daftar = lembar.panels.filter((p) => p.side === side);
	const dekat = (a: number, b: number) => Math.abs(a - b) < 0.6;
	// Badge kedua di lembar bisa punya tepi kertas di sisi yang berbeda dari
	// badge pertama; susunannya satu untuk semua, jadi yang terbesar yang berlaku.
	const hasil: Inset = { top: AMAN_LIPAT, right: AMAN_LIPAT, bottom: AMAN_LIPAT, left: AMAN_LIPAT };
	for (const panel of daftar.length > 0 ? daftar : lembar.panels.slice(0, 1)) {
		const tepi = {
			top: dekat(panel.y, 0) ? AMAN_TEPI : AMAN_LIPAT,
			left: dekat(panel.x, 0) ? AMAN_TEPI : AMAN_LIPAT,
			bottom: dekat(panel.y + panel.h, lembar.kertas.h) ? AMAN_TEPI : AMAN_LIPAT,
			right: dekat(panel.x + panel.w, lembar.kertas.w) ? AMAN_TEPI : AMAN_LIPAT,
		};
		const tegak = panel.rotate === 180 ? { top: tepi.bottom, right: tepi.left, bottom: tepi.top, left: tepi.right } : tepi;
		hasil.top = Math.max(hasil.top, tegak.top);
		hasil.right = Math.max(hasil.right, tegak.right);
		hasil.bottom = Math.max(hasil.bottom, tegak.bottom);
		hasil.left = Math.max(hasil.left, tegak.left);
	}
	return hasil;
}

// ---- Nilai bawaan -----------------------------------------------------------

const TINTA = "#1b1b1f";
const AKSEN = "#14306b";

/** Susunan awal A6. Dipakai juga sebagai dasar format lain, diskalakan. */
export const DEFAULT_BADGE_LAYOUT: BadgeLayout = {
	v: 1,
	format: { kind: "a4_lipat4", w_mm: 105, h_mm: 148, fold: "side" },
	background: { mode: "polos", color: "#ffffff", front_url: null, back_url: null },
	front: [
		{ type: "rect", x: 0, y: 0, w: 105, h: 34, color: AKSEN, radius: 0 },
		{ type: "text", field: "event_name", x: 9, y: 11, w: 87, size: 13, weight: "bold", align: "left", color: "#ffffff" },
		{ type: "text", field: "name", x: 7, y: 42, w: 91, size: 24, weight: "bold", align: "center", color: TINTA },
		{ type: "text", field: "company", x: 7, y: 54, w: 91, size: 12, weight: "bold", align: "center", color: "#333333" },
		{ type: "text", field: "title", x: 7, y: 60.5, w: 91, size: 9.5, weight: "normal", align: "center", color: "#555555" },
		{ type: "qr", field: "qr_code", x: 31.5, y: 70, size: 42 },
		{ type: "text", field: "qr_code", x: 7, y: 114, w: 91, size: 10, weight: "bold", align: "center", color: TINTA },
		{ type: "text", field: "static", text: "PESERTA", x: 7, y: 132, w: 91, size: 14, weight: "bold", align: "center", uppercase: true, color: TINTA },
	],
	back: [
		{ type: "text", field: "static", text: "Rundown", x: 9, y: 9, w: 87, size: 8, weight: "bold", align: "left", uppercase: true, color: AKSEN },
		{ type: "rundown", x: 9, y: 16, w: 87, h: 96, day: "auto", merge_parallel: true, size: 9, color: TINTA, accent: AKSEN },
		{ type: "qr", field: "rundown_url", x: 9, y: 116, size: 26 },
		{ type: "text", field: "static", text: "Rundown terbaru dan denah kursi: pindai kode ini.", x: 38, y: 121, w: 58, size: 8, weight: "normal", align: "left", color: TINTA },
	],
};

/** Elemen baru dari menu "Tambah isi". Diletakkan di tengah area aman sisi itu. */
export function elemenBaru(jenis: "text" | "qr" | "rect" | "image" | "rundown", field: BadgeTextField | "qr_code" | "rundown_url", sisi: Mm): BadgeElement {
	const tengahX = (lebar: number) => Math.round(((sisi.w - lebar) / 2) * 2) / 2;
	const y = Math.round(sisi.h / 3);
	switch (jenis) {
		case "qr":
			return { type: "qr", field: field === "rundown_url" ? "rundown_url" : "qr_code", x: tengahX(30), y, size: 30 };
		case "rect":
			return { type: "rect", x: 0, y, w: sisi.w, h: 14, color: "#e8a33d", radius: 0 };
		case "image":
			return { type: "image", url: null, x: tengahX(40), y: 10, w: 40, h: 16 };
		case "rundown":
			return { type: "rundown", x: 9, y: 16, w: sisi.w - 18, h: Math.max(30, sisi.h - 52), day: "auto", merge_parallel: true, size: 9, color: TINTA, accent: AKSEN };
		default: {
			const f = field as BadgeTextField;
			return {
				type: "text", field: f, text: f === "static" ? "Teks" : undefined,
				x: 7, y, w: sisi.w - 14, size: f === "name" ? 22 : 11, weight: f === "name" ? "bold" : "normal", align: "center", color: TINTA,
			};
		}
	}
}

/** Kotak elemen dalam mm, untuk seret, batas, dan sorotan. */
export function kotakElemen(element: BadgeElement): { x: number; y: number; w: number; h: number } {
	switch (element.type) {
		case "qr":
			return { x: element.x, y: element.y, w: element.size, h: element.size };
		case "text":
			// 1 pt = 0,3528 mm; tinggi baris 1,2.
			return { x: element.x, y: element.y, w: element.w, h: element.size * 0.3528 * 1.2 };
		default:
			return { x: element.x, y: element.y, w: element.w, h: element.h };
	}
}

/** Teks yang tergambar untuk elemen teks. Kolom kosong menghasilkan string kosong. */
export function badgeText(element: BadgeTextElement, data: BadgeData, event: Pick<BadgeEventData, "name">): string {
	const mentah =
		element.field === "static" ? element.text ?? ""
			: element.field === "name" ? data.name
				: element.field === "company" ? data.company ?? ""
					: element.field === "title" ? data.title ?? ""
						: element.field === "event_name" ? event.name
							: data.qr_code;
	const bersih = mentah.trim();
	return element.uppercase ? bersih.toUpperCase() : bersih;
}

/** Menyesuaikan susunan bila ukuran sisi berubah: elemen dijepit ke dalam sisi baru. */
export function jepitKeSisi(elements: BadgeElement[], sisi: Mm): BadgeElement[] {
	return elements.map((element) => {
		const kotak = kotakElemen(element);
		const w = Math.min(kotak.w, sisi.w);
		const x = Math.min(Math.max(0, element.x), Math.max(0, sisi.w - w));
		const y = Math.min(Math.max(0, element.y), Math.max(0, sisi.h - Math.min(kotak.h, sisi.h)));
		if (element.type === "qr") return { ...element, x, y, size: Math.min(element.size, sisi.w, sisi.h) };
		if (element.type === "text") return { ...element, x, y, w };
		return { ...element, x, y, w, h: Math.min(element.h, sisi.h) };
	});
}
