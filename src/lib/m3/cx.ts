/**
 * Penggabung nama kelas. Menerima nilai palsu supaya kelas bersyarat bisa
 * ditulis sebaris tanpa ternary yang menghasilkan string kosong.
 *
 * Tidak memakai clsx: satu-satunya hal yang dibutuhkan komponen di sini adalah
 * membuang nilai palsu dan menggabung sisanya, dan itu tidak layak menambah
 * dependensi yang harus ikut terunduh ke ponsel panitia.
 */
export function cx(...values: (string | false | null | undefined)[]) {
	return values.filter(Boolean).join(" ");
}
