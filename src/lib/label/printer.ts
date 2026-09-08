import type { LabelSettings } from "./layout";

/**
 * Sambungan ke printer label NIIMBOT lewat Web Bluetooth.
 *
 * ---- Kenapa pustaka pihak ketiga, dan yang mana ---------------------------
 *
 * NIIMBOT tidak pernah menerbitkan protokolnya. `niimbot-web-bluetooth` (MIT,
 * TANPA dependensi) adalah hasil pembongkaran ulang yang diuji di tujuh model
 * sungguhan dan mendokumentasikan setiap angkanya beserta cara mengukurnya.
 * Alternatifnya, `@mmote/niimbluelib`, menarik Capacitor, `serialport`, dan
 * `noble` — modul native yang menuntut kompilator terpasang — untuk sebuah
 * halaman yang berjalan di peramban.
 *
 * ---- Yang belum pasti, dan bagaimana ia ditangani -------------------------
 *
 * B21 BUKAN salah satu dari tujuh yang diuji. Dokumentasi protokolnya
 * menempatkannya sekeluarga dengan B1 — perintah "b1", 203 dpi — tetapi tidak
 * ada yang membuktikannya.
 *
 * Yang membuat itu bisa dijalani: bila printer menjawab dengan id model yang
 * tidak dikenal drivernya, ia TIDAK menolak mencetak. Ia memakai parameter yang
 * kita berikan, dan memilih penulisan ber-pacing yang aman untuk keluarga "b1".
 * Jadi seluruh parameter itu datang dari setelan acara, bukan dari berkas ini —
 * dan ketika label pertama keluar salah, yang membetulkannya adalah panitia di
 * layar CMS, bukan rilis berikutnya.
 *
 * ---- Batas yang tidak bisa dilewati ---------------------------------------
 *
 * Web Bluetooth tidak ada di iOS mana pun (termasuk Chrome di iPhone, yang
 * memakai mesin Safari) dan tidak ada di Firefox. Di sana `isSupported()`
 * menjawab false dan pemanggil menawarkan unduh PNG — bukan tombol cetak yang
 * gagal saat ditekan.
 */

export type PrinterInfo = {
	modelId: number | null;
	protocolVersion: number | null;
	deviceName: string | null;
	label: string;
	task: string | null;
	dpi: number | null;
};

type NiimbotModel = {
	name_prefixes: string[];
	task: string;
	density: number;
	label_type: number;
	speed: number;
};

type NiimbotSize = { w_px: number; h_px: number; offset_y_px: number; dpi: number };

type NiimbotDriver = {
	isSupported: () => boolean;
	readonly printer: PrinterInfo | null;
	identify: (model: NiimbotModel) => Promise<PrinterInfo>;
	connect: (model: NiimbotModel) => Promise<void>;
	disconnect: () => Promise<void>;
	printImage: (
		url: string,
		options: { model: NiimbotModel; size: NiimbotSize; copies?: number; density?: number; onProgress?: (state: unknown) => void },
	) => Promise<unknown>;
	probe: (cmd: number, data: number[], timeoutMs?: number) => Promise<{ cmd: number; data: number[] } | null>;
};

/**
 * Apakah perangkat ini bisa bicara dengan printer sama sekali.
 *
 * Diperiksa lewat keberadaan `navigator.bluetooth`, bukan lewat user agent:
 * daftar peramban selalu tertinggal dari kenyataan, dan tebakan yang meleset
 * menampilkan tombol yang gagal justru di depan antrean.
 */
export function printerSupported(): boolean {
	return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Memuat driver, sekali saja.
 *
 * Impor dinamis, dan itu penting: berkas drivernya ~160 KB dan hanya berguna di
 * perangkat yang memang memegang printer. Ponsel petugas di empat meja lain
 * tidak boleh mengunduhnya untuk kemudian tidak memakainya.
 *
 * Modulnya bergaya skrip lawas — ia memasang dirinya di `window.Niimbot` dan
 * tidak mengekspor apa pun — jadi impornya untuk efek samping, lalu nilainya
 * diambil dari window.
 */
let pemuatan: Promise<NiimbotDriver> | null = null;

export function loadPrinterDriver(): Promise<NiimbotDriver> {
	if (!pemuatan) {
		pemuatan = import("niimbot-web-bluetooth")
			.then(() => {
				const driver = (window as unknown as { Niimbot?: NiimbotDriver }).Niimbot;
				if (!driver) throw new Error("Driver printer gagal dimuat.");
				return driver;
			})
			.catch((error) => {
				// Percobaan berikutnya harus benar-benar mencoba lagi. Promise gagal
				// yang tersimpan membuat tombol "Sambungkan" mati permanen setelah
				// satu kegagalan jaringan sesaat.
				pemuatan = null;
				throw error;
			});
	}
	return pemuatan;
}

/** Bentuk yang diterima driver, diturunkan dari setelan acara. */
export function printerModel(settings: LabelSettings): NiimbotModel {
	return {
		name_prefixes: settings.name_prefixes,
		task: settings.task,
		density: settings.density,
		label_type: settings.label_type,
		speed: settings.speed,
	};
}

export function printerSize(settings: LabelSettings): NiimbotSize {
	return {
		w_px: settings.width_px,
		h_px: settings.height_px,
		offset_y_px: settings.offset_y_px,
		dpi: settings.dpi,
	};
}

/**
 * Menyambung dan mengenali printer. Dialog pemilih perangkat milik peramban
 * muncul di sini, jadi ia HARUS dipanggil dari dalam penanganan klik — Web
 * Bluetooth menolak permintaan yang tidak berasal dari tindakan pengguna.
 */
export async function identifyPrinter(settings: LabelSettings): Promise<PrinterInfo> {
	const driver = await loadPrinterDriver();
	return driver.identify(printerModel(settings));
}

export async function disconnectPrinter(): Promise<void> {
	const driver = await loadPrinterDriver();
	await driver.disconnect();
}

/**
 * Lebar kepala cetak yang DILAPORKAN printer, dalam piksel.
 *
 * Jawaban 0xDE membawanya di medan 16-bit ketiga. Ini satu-satunya cara
 * mengetahui lebar sebenarnya tanpa menghabiskan label untuk mencobanya: label
 * 50 mm pada 203 dpi adalah 400 px di atas kertas, tetapi sebagian model punya
 * kepala yang lebih sempit — dan kolom di luar kepala dibuang tanpa galat,
 * sehingga tepi kanan setiap label hilang tanpa ada yang tahu sebabnya.
 *
 * Mengembalikan null bila printer tidak menjawabnya; itu bukan kegagalan, hanya
 * berarti angkanya harus ditentukan dari cetakan percobaan.
 */
export async function readPrintHeadWidth(): Promise<number | null> {
	const driver = await loadPrinterDriver();
	const jawaban = await driver.probe(0xdc, [0x03], 1000);
	if (!jawaban || jawaban.data.length < 6) return null;
	const lebar = (jawaban.data[4] << 8) | jawaban.data[5];
	return lebar > 0 && lebar <= 2000 ? lebar : null;
}

export async function printLabel(
	dataUrl: string,
	settings: LabelSettings,
	options: { copies?: number } = {},
): Promise<void> {
	const driver = await loadPrinterDriver();
	await driver.printImage(dataUrl, {
		model: printerModel(settings),
		size: printerSize(settings),
		copies: options.copies ?? 1,
		density: settings.density,
	});
}
