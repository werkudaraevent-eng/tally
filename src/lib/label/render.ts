import { labelText, type LabelData, type LabelSettings } from "./layout";

/**
 * Menggambar satu label ke kanvas.
 *
 * Hanya jalan di peramban: ia memakai kanvas DOM, dan hasilnya dipakai dua kali
 * oleh kode yang sama — pratinjau di layar admin dan gambar yang dikirim ke
 * printer. Itu bukan penghematan, melainkan syarat: label yang keluar berbeda
 * dari yang dilihat admin membuat setiap pembetulan susunan menjadi tebakan
 * yang harus dibayar dengan satu lembar label per percobaan.
 *
 * ---- Kenapa hitam putih keras ---------------------------------------------
 *
 * Printer termal tidak punya abu-abu: driver mengambang setiap piksel pada
 * luminansi 128. Warna apa pun yang lebih terang dari itu hilang sama sekali.
 * Karena itu latar dilukis putih penuh dan seluruh isi hitam penuh — bukan
 * pilihan gaya, melainkan satu-satunya dua nilai yang bisa dicetak.
 */

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/**
 * Kode peserta digambar berhuruf monospace.
 *
 * Ia dibaca dan diketik ulang orang — di layar booth, di layar voting — dan
 * huruf berlebar sama adalah yang membuat 0 tidak tertukar dengan O dan 1 tidak
 * tertukar dengan l pada cetakan 203 dpi yang tepinya sudah kasar.
 */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

/**
 * Ukuran huruf terbesar yang masih muat di lebar yang disediakan.
 *
 * Mengecilkan, bukan memotong. Nama Indonesia panjang ("Muhammad Rizky
 * Pratama Nugroho") adalah keadaan yang lazim, bukan pengecualian, dan label
 * bertuliskan "Muhammad Rizky Prata…" tidak berguna bagi siapa pun di ruangan.
 * Batas bawah 8 px: di bawah itu 203 dpi tidak menghasilkan huruf yang terbaca,
 * dan lebih baik satu label yang meluber daripada satu label yang penuh bercak.
 */
function muatkan(ctx: CanvasRenderingContext2D, teks: string, lebar: number, size: number, tebal: string, mono: boolean) {
	let ukuran = size;
	for (; ukuran > 8; ukuran -= 1) {
		ctx.font = `${tebal} ${ukuran}px ${mono ? MONO : SANS}`;
		if (ctx.measureText(teks).width <= lebar) break;
	}
	ctx.font = `${tebal} ${ukuran}px ${mono ? MONO : SANS}`;
	return ukuran;
}

export async function renderLabelToCanvas(
	canvas: HTMLCanvasElement,
	settings: LabelSettings,
	data: LabelData,
): Promise<void> {
	canvas.width = settings.width_px;
	canvas.height = settings.height_px;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Kanvas tidak tersedia di peramban ini.");

	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#000000";
	ctx.textBaseline = "top";

	for (const element of settings.layout.elements) {
		if (element.type === "qr") {
			// Diimpor dinamis: paket `qrcode` sudah menjadi dependensi (lampiran
			// email dan layar vote memakainya), dan ~20 KB itu hanya perlu diunduh
			// oleh perangkat yang benar-benar mencetak.
			const QRCode = (await import("qrcode")).default;
			const kotak = document.createElement("canvas");
			await QRCode.toCanvas(kotak, data.qr_code, {
				// Tingkat M, bukan H. Ini dicetak di atas kertas yang tidak melipat
				// dan tidak berminyak seperti layar ponsel, dan koreksi yang lebih
				// tinggi memadatkan modulnya — pada 203 dpi, modul yang lebih kecil
				// justru yang membuatnya gagal terbaca.
				errorCorrectionLevel: "M",
				margin: 0,
				width: element.size,
				color: { dark: "#000000", light: "#ffffff" },
			});
			ctx.drawImage(kotak, element.x, element.y, element.size, element.size);
			continue;
		}

		const teks = labelText(element, data);
		// Kolom kosong DILEWATI. Peserta tanpa instansi tidak boleh menghasilkan
		// label bertuliskan apa pun di barisnya.
		if (!teks) continue;

		const mono = element.field === "qr_code";
		const tebal = element.weight === "bold" ? "700" : "400";
		muatkan(ctx, teks, element.w, element.size, tebal, mono);
		ctx.textAlign = element.align;
		const x = element.align === "center" ? element.x + element.w / 2 : element.align === "right" ? element.x + element.w : element.x;
		ctx.fillText(teks, x, element.y);
	}
}

/** Label sebagai data URL PNG — bentuk yang diterima driver printer. */
export async function renderLabelDataUrl(settings: LabelSettings, data: LabelData): Promise<string> {
	const canvas = document.createElement("canvas");
	await renderLabelToCanvas(canvas, settings, data);
	return canvas.toDataURL("image/png");
}
