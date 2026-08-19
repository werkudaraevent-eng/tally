/**
 * Sistem gerak M3 Expressive untuk Framer Motion.
 *
 * M3 Expressive mengganti pasangan easing+durasi dengan pegas. Pegas tidak bisa
 * dinyatakan sebagai cubic-bezier, jadi ia tidak bisa hidup di CSS bersama token
 * lain — di sini tempatnya. Token easing/durasi klasik tetap ada di globals.css
 * untuk transisi CSS biasa yang tidak perlu pegas.
 *
 * Dua sumbu, sesuai spesifikasi:
 *
 * - `spatial` — apa pun yang bergerak atau berubah ukuran (posisi, skala, tata
 *   letak). Sengaja sedikit memantul; itulah yang membuat gerakan terbaca hidup.
 * - `effects` — apa pun yang tidak bergerak (opasitas, warna). Selalu teredam
 *   kritis. Warna yang memantul terbaca sebagai kedipan, bukan sebagai gerak.
 *
 * Masing-masing punya tiga kecepatan: fast, default, slow.
 */

/** Nilai spesifikasi: rasio redaman dan kekakuan, sebelum dikonversi. */
type SpringSpec = { dampingRatio: number; stiffness: number };

/** Bentuk yang dimengerti Framer Motion. */
export type M3Spring = {
	type: "spring";
	stiffness: number;
	damping: number;
	mass: number;
};

/**
 * Framer Motion meminta koefisien redaman, sedangkan M3 menyebut rasio redaman.
 * Keduanya bukan hal yang sama: c = ζ · 2√(k·m). Memasukkan 0.9 apa adanya ke
 * `damping` akan menghasilkan pegas yang berayun berkali-kali.
 */
function toFramerSpring({ dampingRatio, stiffness }: SpringSpec, mass = 1): M3Spring {
	return {
		type: "spring",
		stiffness,
		damping: dampingRatio * 2 * Math.sqrt(stiffness * mass),
		mass,
	};
}

/**
 * Skema "expressive" — skema yang direkomendasikan Material untuk sebagian besar
 * produk. Redamannya lebih rendah dan kekakuannya lebih kecil daripada standard,
 * jadi gerakannya melambat di ujung dan sedikit melewati sasaran.
 */
const EXPRESSIVE: Record<string, SpringSpec> = {
	spatialFast: { dampingRatio: 0.6, stiffness: 800 },
	spatialDefault: { dampingRatio: 0.8, stiffness: 380 },
	spatialSlow: { dampingRatio: 0.8, stiffness: 200 },
	effectsFast: { dampingRatio: 1, stiffness: 3800 },
	effectsDefault: { dampingRatio: 1, stiffness: 1600 },
	effectsSlow: { dampingRatio: 1, stiffness: 800 },
};

/**
 * Skema "standard" — teredam kritis pada sumbu spatial, tanpa pantulan sama
 * sekali. Dipakai di layar transaksi (booth, kasir) di mana gerakan tidak boleh
 * menarik perhatian dari angka yang sedang dibaca, dan di layar padat data.
 */
const STANDARD: Record<string, SpringSpec> = {
	spatialFast: { dampingRatio: 0.9, stiffness: 1400 },
	spatialDefault: { dampingRatio: 0.9, stiffness: 700 },
	spatialSlow: { dampingRatio: 0.9, stiffness: 300 },
	effectsFast: { dampingRatio: 1, stiffness: 3800 },
	effectsDefault: { dampingRatio: 1, stiffness: 1600 },
	effectsSlow: { dampingRatio: 1, stiffness: 800 },
};

function schemeToSprings(scheme: Record<string, SpringSpec>) {
	return {
		spatial: {
			fast: toFramerSpring(scheme.spatialFast),
			default: toFramerSpring(scheme.spatialDefault),
			slow: toFramerSpring(scheme.spatialSlow),
		},
		effects: {
			fast: toFramerSpring(scheme.effectsFast),
			default: toFramerSpring(scheme.effectsDefault),
			slow: toFramerSpring(scheme.effectsSlow),
		},
	};
}

/**
 * Skema ekspresif. Untuk layar yang memang boleh menarik perhatian: undian,
 * layar panggung, voting, hasil.
 */
export const expressive = schemeToSprings(EXPRESSIVE);

/**
 * Skema tenang. Untuk layar kerja: booth, kasir, admin.
 *
 * Ini bukan penyimpangan dari M3 — spesifikasinya memang menyediakan dua skema
 * dan membolehkan produk menukarnya untuk menegaskan momen tertentu. Yang
 * dihindari adalah sebaliknya: memakai gerak ekspresif di layar tempat orang
 * sedang menghitung uang sambil antre menunggu.
 */
export const standard = schemeToSprings(STANDARD);

/**
 * Durasi token M3 dalam milidetik, untuk animasi yang memang berbasis waktu
 * (kilau pemuatan, penghitung mundur, jeda toast) di mana pegas tidak berlaku.
 */
export const duration = {
	short1: 50,
	short2: 100,
	short3: 150,
	short4: 200,
	medium1: 250,
	medium2: 300,
	medium3: 350,
	medium4: 400,
	long1: 450,
	long2: 500,
	long3: 550,
	long4: 600,
	extraLong1: 700,
	extraLong2: 800,
	extraLong3: 900,
	extraLong4: 1000,
} as const;

/** Easing M3 sebagai larik bezier, bentuk yang diterima Framer Motion. */
export const easing = {
	standard: [0.2, 0, 0, 1],
	standardAccelerate: [0.3, 0, 1, 1],
	standardDecelerate: [0, 0, 0, 1],
	emphasized: [0.2, 0, 0, 1],
	emphasizedAccelerate: [0.3, 0, 0.8, 0.15],
	emphasizedDecelerate: [0.05, 0.7, 0.1, 1],
} as const;
