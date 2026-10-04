/**
 * Baris rundown yang dicetak di badge. Murni, dipakai peramban dan server.
 */

export type BadgeRundownItem = { jam: string; judul: string; jeda: boolean };
export type BadgeRundownHari = { id: string; nama: string; tanggal: string | null; items: BadgeRundownItem[] };

export type BarisRundown = { jam: string; judul: string; hari?: string };

/** "2026-10-15" menjadi "Kamis, 15 Oktober 2026". */
export function tanggalPanjang(tanggal: string | null): string | null {
	if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
	return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Baris berjam sama digabung: "Sesi paralel" tiga baris menjadi satu.
 *
 * Badge A6 muat ±12 baris. Tiga sesi paralel yang masing-masing satu baris
 * memakan seperempatnya, padahal tamu hanya menghadiri satu.
 */
function gabungParalel(items: BadgeRundownItem[]): BarisRundown[] {
	const hasil: BarisRundown[] = [];
	for (const item of items) {
		const akhir = hasil[hasil.length - 1];
		if (akhir && item.jam && akhir.jam === item.jam) {
			akhir.judul = `${akhir.judul} · ${item.judul}`;
			continue;
		}
		hasil.push({ jam: item.jam, judul: item.judul });
	}
	return hasil;
}

/** Hari mana yang dicetak. `auto` = bagian pertama; `hari_ini` jatuh ke bagian pertama bila tidak ada yang cocok. */
export function pilihHari(hari: BadgeRundownHari[], day: string, hariIni: string): BadgeRundownHari[] {
	if (hari.length === 0) return [];
	if (day === "semua") return hari;
	if (day === "hari_ini") return [hari.find((h) => h.tanggal === hariIni) ?? hari[0]];
	if (day === "auto") return [hari[0]];
	return [hari.find((h) => h.id === day) ?? hari[0]];
}

export function judulRundown(hari: BadgeRundownHari[], day: string, hariIni: string): string {
	const dipilih = pilihHari(hari, day, hariIni);
	if (dipilih.length === 0) return "";
	if (dipilih.length > 1) return "Semua hari";
	return tanggalPanjang(dipilih[0].tanggal) ?? dipilih[0].nama;
}

export function barisRundown(hari: BadgeRundownHari[], day: string, mergeParalel: boolean, hariIni: string): BarisRundown[] {
	const dipilih = pilihHari(hari, day, hariIni);
	return dipilih.flatMap((h) => {
		const baris = mergeParalel ? gabungParalel(h.items) : h.items.map((item) => ({ jam: item.jam, judul: item.judul }));
		// Semua hari: nama hari menempel di baris pertamanya, bukan baris judul
		// sendiri yang memakan tempat.
		return dipilih.length > 1 ? baris.map((b, i) => (i === 0 ? { ...b, hari: h.nama } : b)) : baris;
	});
}

/** Contoh untuk acara yang belum punya rundown terbit, supaya penyunting tidak kosong. */
export const RUNDOWN_CONTOH: BadgeRundownHari[] = [
	{
		id: "contoh",
		nama: "Hari 1",
		tanggal: null,
		items: [
			{ jam: "08.00", judul: "Registrasi", jeda: false },
			{ jam: "09.00", judul: "Pembukaan", jeda: false },
			{ jam: "10.00", judul: "Sesi 1", jeda: false },
			{ jam: "12.00", judul: "Makan siang", jeda: true },
			{ jam: "13.00", judul: "Sesi 2", jeda: false },
			{ jam: "15.30", judul: "Penutupan", jeda: false },
		],
	},
];
