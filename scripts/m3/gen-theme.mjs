/**
 * Membangkitkan token warna Material 3 dari satu warna sumber.
 *
 * Keluaran: src/app/m3-theme.css (JANGAN diedit tangan).
 * Jalankan: npm run theme
 *
 * Kenapa dibangkitkan, bukan ditulis tangan: peran warna M3 bukan daftar hex
 * pilihan, melainkan hasil pemetaan nada (tone) di ruang warna HCT dengan
 * jaminan rasio kontras antara tiap pasangan `x` dan `on-x`. Menulis 100+ hex
 * secara manual berarti jaminan itu hilang pada perubahan pertama.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
	Blend,
	DynamicScheme,
	Hct,
	MaterialDynamicColors,
	TonalPalette,
	Variant,
	argbFromHex,
	hexFromArgb,
} from "@material/material-color-utilities";

/** Biru royal identitas event. Ubah di sini untuk mengubah seluruh tema. */
const SOURCE_HEX = "#2649D0";

/**
 * Vibrant, bukan Variant.EXPRESSIVE dan bukan TonalSpot.
 *
 * "M3 Expressive" (bahasa desain 2025) dan `Variant.EXPRESSIVE` (gaya palet
 * Material You) adalah dua hal berbeda. Variant expressive sengaja memutar hue
 * menjauh dari warna sumber untuk variasi personal — itu membuang biru brand.
 *
 * TonalSpot juga tidak dipakai: pada spesifikasi 2025 ia memangkas kroma habis
 * dan menghasilkan primary #535c8c, biru abu yang tidak dikenali sebagai warna
 * PRIMA. Vibrant mempertahankan kroma tinggi, dan surface-nya ikut berwarna
 * tipis — inilah tampilan ekspresif yang diminta.
 */
const VARIANT = Variant.VIBRANT;

/** Spesifikasi warna era Expressive (tier surface container, primary-dim, dll). */
const SPEC_VERSION = "2025";

/** Nada palet yang diekspor mentah, untuk kasus yang tak tercakup peran baku. */
const REF_TONES = [0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100];

const REF_PALETTES = ["primary", "secondary", "tertiary", "neutral", "neutralVariant", "error"];

/**
 * Peran semantik yang tidak ada di M3 baku tetapi wajib ada di aplikasi ini.
 *
 * M3 hanya menyediakan `error`. Layar booth dan kasir perlu membedakan tiga hal
 * sekaligus — lunas, menunggu, gagal — dan memakai `tertiary` untuk "lunas"
 * akan menabrak pemakaian tertiary sebagai aksen ekspresif.
 *
 * Warna dasarnya diselaraskan (harmonize) ke warna sumber lebih dulu: hue-nya
 * digeser sedikit ke arah biru brand supaya hijau dan ambernya terasa sekeluarga
 * dengan tema, bukan seperti warna sistem yang ditempel.
 */
const CUSTOM_COLORS = {
	success: "#237A52",
	warning: "#A66616",
};

/** Pemetaan nada baku M3 untuk warna kustom. */
const CUSTOM_TONES = {
	light: { base: 40, on: 100, container: 90, onContainer: 10 },
	dark: { base: 80, on: 20, container: 30, onContainer: 90 },
};

/**
 * Peran "soft": latar bertanda yang sangat pucat, dengan tepi dan warna teksnya.
 *
 * Spesifikasi 2025 membuat peran `*-container` jauh lebih pekat daripada M3
 * generasi sebelumnya — `error-container` di tema terang adalah #f74b6d, bukan
 * merah muda samar. Itu tepat untuk kartu status yang harus merebut perhatian,
 * tetapi salah untuk panel peringatan setinggi setengah layar: seluruh panel
 * menjadi bidang merah menyala, dan mata kehilangan tempat beristirahat.
 *
 * Kedua-duanya tersedia. Pakai `*-container` untuk penanda kecil, `*-soft` untuk
 * bidang lebar. Nada 95/80/20 di terang meniru tint yang selama ini ditulis
 * sebagai hex mati di seluruh basis kode — bedanya, yang ini punya pasangan
 * gelapnya.
 */
const SOFT_TONES = {
	light: { surface: 95, outline: 80, on: 25 },
	dark: { surface: 20, outline: 35, on: 90 },
};

const mdc = new MaterialDynamicColors();

/** Semua peran warna yang diekspos MaterialDynamicColors, sebagai daftar nama. */
function colorRoleNames() {
	const skip = new Set(["highestSurface", "constructor"]);
	return Object.getOwnPropertyNames(MaterialDynamicColors.prototype)
		.filter((name) => !skip.has(name) && !name.endsWith("PaletteKeyColor"))
		.filter((name) => typeof mdc[name] === "function")
		.sort();
}

function kebab(name) {
	return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function scheme({ isDark, contrastLevel }) {
	const sourceColorHct = Hct.fromInt(argbFromHex(SOURCE_HEX));
	return new DynamicScheme({
		sourceColorHct,
		variant: VARIANT,
		contrastLevel,
		isDark,
		specVersion: SPEC_VERSION,
		platform: "phone",
		// Vibrant sendiri masih menggeser hue primary sedikit (#1b48e5). Mengunci
		// palet primary ke HCT warna sumber persis membuat peran `primary`
		// mendarat di #2b4dd4 — mata tidak bisa membedakannya dari #2649D0.
		// Palet lain dibiarkan diturunkan algoritma supaya secondary/tertiary
		// tetap harmonis, bukan tebakan.
		primaryPalette: TonalPalette.fromHct(sourceColorHct),
	});
}

function roleBlock(target) {
	const lines = [];
	for (const name of colorRoleNames()) {
		const color = mdc[name]();
		// Sebagian peran hanya ada di satu spesifikasi (mis. primaryDim di 2025),
		// dan mengembalikan undefined di luar itu.
		if (!color) continue;
		lines.push(`\t--md-sys-color-${kebab(name)}: ${hexFromArgb(color.getArgb(target))};`);
	}
	return lines.join("\n");
}

function customColorBlock(isDark) {
	const tones = isDark ? CUSTOM_TONES.dark : CUSTOM_TONES.light;
	const source = argbFromHex(SOURCE_HEX);
	const lines = [];
	for (const [name, hex] of Object.entries(CUSTOM_COLORS)) {
		const palette = TonalPalette.fromInt(Blend.harmonize(argbFromHex(hex), source));
		lines.push(`\t--md-sys-color-${name}: ${hexFromArgb(palette.tone(tones.base))};`);
		lines.push(`\t--md-sys-color-on-${name}: ${hexFromArgb(palette.tone(tones.on))};`);
		lines.push(`\t--md-sys-color-${name}-container: ${hexFromArgb(palette.tone(tones.container))};`);
		lines.push(`\t--md-sys-color-on-${name}-container: ${hexFromArgb(palette.tone(tones.onContainer))};`);
	}
	return lines.join("\n");
}

function softBlock(target, isDark) {
	const tones = isDark ? SOFT_TONES.dark : SOFT_TONES.light;
	const source = argbFromHex(SOURCE_HEX);
	const palettes = {
		primary: target.primaryPalette,
		error: target.errorPalette,
	};
	for (const [name, hex] of Object.entries(CUSTOM_COLORS)) {
		palettes[name] = TonalPalette.fromInt(Blend.harmonize(argbFromHex(hex), source));
	}

	const lines = [];
	for (const [name, palette] of Object.entries(palettes)) {
		lines.push(`\t--md-sys-color-${name}-soft: ${hexFromArgb(palette.tone(tones.surface))};`);
		lines.push(`\t--md-sys-color-${name}-soft-outline: ${hexFromArgb(palette.tone(tones.outline))};`);
		lines.push(`\t--md-sys-color-on-${name}-soft: ${hexFromArgb(palette.tone(tones.on))};`);
	}
	return lines.join("\n");
}

function refPaletteBlock(target) {
	const lines = [];
	for (const palette of REF_PALETTES) {
		const tonal = target[`${palette}Palette`];
		for (const tone of REF_TONES) {
			lines.push(`\t--md-ref-palette-${kebab(palette)}-${tone}: ${hexFromArgb(tonal.tone(tone))};`);
		}
	}
	return lines.join("\n");
}

const light = scheme({ isDark: false, contrastLevel: 0 });
const dark = scheme({ isDark: true, contrastLevel: 0 });
const lightHc = scheme({ isDark: false, contrastLevel: 1 });
const darkHc = scheme({ isDark: true, contrastLevel: 1 });

const css = `/* DIBANGKITKAN OLEH scripts/m3/gen-theme.mjs — JANGAN DIEDIT MANUAL.
 *
 * Sumber: ${SOURCE_HEX} · varian: vibrant · spesifikasi warna: ${SPEC_VERSION}
 * Bangkitkan ulang: npm run theme
 *
 * Urutan aturan penting. \`[data-theme]\` punya kekhususan yang sama dengan
 * \`:root\`, jadi ia hanya menang karena ditulis belakangan — pilihan eksplisit
 * pengguna mengalahkan preferensi sistem. Blok prefers-color-scheme tetap ada
 * supaya halaman sudah benar sebelum JavaScript sempat jalan.
 */

:root {
	color-scheme: light;
${roleBlock(light)}
${customColorBlock(false)}
${softBlock(light, false)}
${refPaletteBlock(light)}
}

@media (prefers-color-scheme: dark) {
	:root {
		color-scheme: dark;
${roleBlock(dark).replace(/^/gm, "\t")}
${customColorBlock(true).replace(/^/gm, "\t")}
${refPaletteBlock(dark).replace(/^/gm, "\t")}
	}
}

[data-theme="light"] {
	color-scheme: light;
${roleBlock(light)}
${customColorBlock(false)}
${softBlock(light, false)}
${refPaletteBlock(light)}
}

[data-theme="dark"] {
	color-scheme: dark;
${roleBlock(dark)}
${customColorBlock(true)}
${softBlock(dark, true)}
${refPaletteBlock(dark)}
}

/* Kontras tinggi. Venue sering terang berlebih dan layar dipakai sambil berdiri;
 * ini jalan keluar tanpa mengganti tema. Diaktifkan lewat data-contrast="high"
 * atau preferensi sistem. */
@media (prefers-contrast: more) {
	:root {
${roleBlock(lightHc).replace(/^/gm, "\t")}
	}
}

[data-contrast="high"] {
${roleBlock(lightHc)}
}

[data-contrast="high"][data-theme="dark"],
[data-theme="dark"] [data-contrast="high"] {
${roleBlock(darkHc)}
}
`;

const outputPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "app", "m3-theme.css");
writeFileSync(outputPath, css, "utf8");
console.log(`Tema M3 ditulis: ${outputPath}`);
console.log(`Sumber ${SOURCE_HEX} · ${colorRoleNames().length} peran · ${REF_PALETTES.length} palet × ${REF_TONES.length} nada`);
