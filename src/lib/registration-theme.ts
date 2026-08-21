import { Blend, DynamicScheme, Hct, MaterialDynamicColors, TonalPalette, Variant, argbFromHex, hexFromArgb } from "@material/material-color-utilities";

/**
 * Peran warna form registrasi publik.
 *
 * Admin memilih SATU warna. Seluruh peran di bawah ini diturunkan darinya lewat
 * ruang warna HCT, persis seperti tema aplikasi dibangkitkan oleh
 * scripts/m3/gen-theme.mjs.
 *
 * Kenapa bukan pemilih warna bebas untuk latar dan teks, seperti BrandingEditor
 * di layar panggung: layar panggung dikendalikan panitia, dilihat dari jauh,
 * teksnya raksasa, dan kalau kontrasnya salah ada orang di ruangan yang bisa
 * memperbaikinya saat itu juga. Form pendaftaran diisi orang asing di ponselnya
 * sendiri, sering di luar ruangan, tanpa siapa pun yang bisa membantu. Kombinasi
 * "abu muda di atas putih" tidak akan ketahuan sampai hari-H.
 *
 * Dengan menurunkan semuanya dari satu warna, kontras setiap pasangan
 * teks-di-atas-latar dijamin oleh konstruksi, bukan oleh kedisiplinan admin.
 */
export type RegistrationThemeRoles = {
	surface: string;
	on_surface: string;
	on_surface_variant: string;
	surface_container: string;
	surface_container_high: string;
	outline: string;
	outline_variant: string;
	primary: string;
	on_primary: string;
	primary_container: string;
	on_primary_container: string;
	error: string;
	on_error: string;
	error_soft: string;
	on_error_soft: string;
};

export type RegistrationFormTheme = {
	/** Warna brand pilihan admin. Satu-satunya nilai yang diisi manusia. */
	seed: string;
	/**
	 * Formulir mengikuti warna halaman acara, mengabaikan `seed` di atas.
	 *
	 * Warna acara punya SATU sumber: pengaturan di CMS halaman acara. Formulir
	 * pendaftaran adalah ketukan berikutnya setelah tombol "Daftar sekarang", dan
	 * dua warna berbeda dalam dua ketukan berurutan terbaca sebagai berpindah ke
	 * situs lain — pada halaman yang meminta nama, email, dan nomor telepon.
	 *
	 * `undefined` berarti konfigurasi yang dibuat SEBELUM saklar ini ada.
	 * Diperlakukan sebagai `false`, yaitu warna formulirnya dipertahankan: acara
	 * yang sedang berjalan tidak boleh berganti warna karena sebuah pembaruan.
	 * Acara baru menyimpan `true`.
	 */
	inherit?: boolean;
	/** Ikut mode gelap perangkat pendaftar, atau kunci ke terang. */
	dark_mode?: "auto" | "light";
	/**
	 * Peran turunan. Dihitung server saat disimpan lalu disimpan sebagai hex.
	 *
	 * Sengaja TIDAK dihitung di browser pendaftar: pustaka warnanya ~40KB dan
	 * halaman ini dibuka sekali oleh orang yang sedang antre dengan sinyal buruk.
	 * Menghitungnya sekali saat admin menekan Simpan menukar biaya itu dengan nol.
	 */
	roles?: RegistrationThemeRoles;
	roles_dark?: RegistrationThemeRoles;
};

export const DEFAULT_REGISTRATION_SEED = "#2649D0";

function scheme(seed: string, isDark: boolean) {
	const sourceColorHct = Hct.fromInt(argbFromHex(seed));
	return new DynamicScheme({
		sourceColorHct,
		variant: Variant.VIBRANT,
		contrastLevel: 0,
		isDark,
		specVersion: "2025",
		platform: "phone",
		// Palet primary dikunci ke HCT warna yang dipilih admin, sama seperti tema
		// aplikasi. Tanpa itu varian vibrant menggeser hue-nya dan warna yang
		// muncul di layar bukan warna yang dipilih di pemilih warna — keluhan yang
		// mustahil didiagnosis dari luar.
		primaryPalette: TonalPalette.fromHct(sourceColorHct),
	});
}

/**
 * Nada "soft": latar galat yang sangat pucat. Sama dengan peran `*-soft` di tema
 * aplikasi — peran `error-container` pada spesifikasi 2025 terlalu pekat untuk
 * dipakai sebagai bidang lebar di bawah kolom isian.
 */
function softError(seed: string, isDark: boolean) {
	const palette = TonalPalette.fromInt(
		Blend.harmonize(argbFromHex("#B3261E"), argbFromHex(seed)),
	);
	return {
		error_soft: hexFromArgb(palette.tone(isDark ? 20 : 95)),
		on_error_soft: hexFromArgb(palette.tone(isDark ? 90 : 25)),
	};
}

export function buildRegistrationThemeRoles(seed: string, isDark: boolean): RegistrationThemeRoles {
	const target = scheme(seed, isDark);
	const mdc = new MaterialDynamicColors();
	const hex = (color: { getArgb: (s: DynamicScheme) => number }) => hexFromArgb(color.getArgb(target));

	return {
		surface: hex(mdc.surface()),
		on_surface: hex(mdc.onSurface()),
		on_surface_variant: hex(mdc.onSurfaceVariant()),
		surface_container: hex(mdc.surfaceContainer()),
		surface_container_high: hex(mdc.surfaceContainerHigh()),
		outline: hex(mdc.outline()),
		outline_variant: hex(mdc.outlineVariant()),
		primary: hex(mdc.primary()),
		on_primary: hex(mdc.onPrimary()),
		primary_container: hex(mdc.primaryContainer()),
		on_primary_container: hex(mdc.onPrimaryContainer()),
		error: hex(mdc.error()),
		on_error: hex(mdc.onError()),
		...softError(seed, isDark),
	};
}

/** Warna heksadesimal enam digit. Nilai lain ditolak sebelum menyentuh generator. */
export function isHexColor(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Melengkapi tema dengan peran turunannya. Dipanggil di server tepat sebelum
 * konfigurasi disimpan, jadi yang tersimpan di database selalu sudah lengkap dan
 * halaman publik tidak pernah perlu menghitung apa pun.
 */
export function withDerivedRoles(theme: RegistrationFormTheme): RegistrationFormTheme {
	const seed = isHexColor(theme.seed) ? theme.seed : DEFAULT_REGISTRATION_SEED;
	return {
		...theme,
		seed,
		roles: buildRegistrationThemeRoles(seed, false),
		roles_dark: buildRegistrationThemeRoles(seed, true),
	};
}
