/**
 * Penyelesai impor untuk @material/material-color-utilities.
 *
 * Paket itu diterbitkan sebagai ESM tetapi sebagian file hasil kompilasinya
 * mengimpor tetangganya tanpa akhiran `.js` (mis. `../dynamiccolor/dynamic_color`).
 * Node ESM menuntut penentu berkas yang lengkap, jadi impor itu gagal dengan
 * ERR_MODULE_NOT_FOUND dan seluruh paket tidak bisa dipakai apa adanya.
 *
 * Hook ini hanya menambahkan `.js` ketika penentu relatif gagal diselesaikan.
 * Sengaja tidak memakai `--experimental-specifier-resolution=node`: bendera itu
 * sudah dihapus di Node 20+, dan melonggarkan resolusi untuk SELURUH grafik
 * modul, bukan hanya paket yang bermasalah.
 */
export async function resolve(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context);
	} catch (error) {
		const relative = specifier.startsWith("./") || specifier.startsWith("../");
		if (relative && !specifier.endsWith(".js")) {
			return nextResolve(`${specifier}.js`, context);
		}
		throw error;
	}
}
