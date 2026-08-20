import { CHOICE_FIELD_TYPES, type RegistrationField, type RegistrationFieldType } from "./domain";

/**
 * Validasi jawaban field tambahan terhadap konfigurasi form.
 *
 * Kenapa ada sama sekali: `extra` dikirim dari endpoint PUBLIK tanpa login.
 * Skema Zod di route handler hanya menahan bentuk luarnya — maksimal 20 kunci,
 * masing-masing berupa string ≤2000 karakter. Tanpa berkas ini, seluruh isinya
 * lolos apa adanya: field wajib bisa dikosongkan, dropdown bisa diisi nilai yang
 * tidak ada di daftarnya, dan kunci yang tidak pernah didefinisikan admin ikut
 * tersimpan permanen ke `participants.extra`.
 *
 * Dipakai bersama oleh server dan penyunting admin, jadi aturan "kapan sebuah
 * field sah" hanya ditulis satu kali.
 */

/** Kunci field: huruf kecil, angka, garis bawah. Dipakai sebagai kunci JSON. */
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

export const MAX_CUSTOM_FIELDS = 20;
export const MAX_ANSWER_LENGTH = 2000;

/** Jenis yang jawabannya berupa acuan berkas, bukan teks yang diketik. */
export const FILE_FIELD_TYPES: RegistrationFieldType[] = ["file"];

export type FieldIssue = { key: string; message: string };

function normalizeOptions(field: RegistrationField): string[] {
	return (field.options ?? []).map((option) => option.trim()).filter(Boolean);
}

/**
 * Memeriksa definisi field itu sendiri — dipakai saat admin menyimpan.
 *
 * Field yang tidak sah tidak boleh sampai ke database: form publik merendernya
 * apa adanya, dan dropdown tanpa pilihan menjadi kolom yang mustahil diisi
 * sementara tombol kirim menolak terus tanpa menyebut sebabnya.
 */
export function validateFieldDefinitions(fields: RegistrationField[]): FieldIssue[] {
	const issues: FieldIssue[] = [];
	const seen = new Set<string>();

	if (fields.length > MAX_CUSTOM_FIELDS) {
		issues.push({ key: "", message: `Maksimal ${MAX_CUSTOM_FIELDS} field tambahan.` });
	}

	for (const field of fields) {
		const key = field.key?.trim() ?? "";
		if (!FIELD_KEY_PATTERN.test(key)) {
			issues.push({ key, message: "Kunci harus diawali huruf kecil, isinya huruf kecil, angka, atau garis bawah." });
			continue;
		}
		if (seen.has(key)) {
			issues.push({ key, message: "Kunci sudah dipakai field lain." });
			continue;
		}
		seen.add(key);

		if (!field.label?.trim()) {
			issues.push({ key, message: "Label wajib diisi." });
		}
		if (CHOICE_FIELD_TYPES.includes(field.type) && normalizeOptions(field).length < 2) {
			issues.push({ key, message: "Perlu minimal dua pilihan." });
		}
		if (field.type === "number" && field.min !== undefined && field.max !== undefined && field.min > field.max) {
			issues.push({ key, message: "Nilai minimum melebihi maksimum." });
		}
	}

	return issues;
}

/**
 * Memeriksa jawaban terhadap definisinya, lalu mengembalikan jawaban yang sudah
 * dibersihkan.
 *
 * Kunci yang tidak ada di konfigurasi DIBUANG, bukan ditolak. Menolaknya berarti
 * seorang pendaftar yang membuka halaman tepat sebelum admin menghapus sebuah
 * field akan gagal mengirim tanpa tahu apa yang salah — dan kolom penyebabnya
 * sudah tidak ada di layarnya.
 */
export function validateAnswers(
	fields: RegistrationField[],
	answers: Record<string, string>,
): { issues: FieldIssue[]; clean: Record<string, string> } {
	const issues: FieldIssue[] = [];
	const clean: Record<string, string> = {};

	for (const field of fields) {
		const raw = (answers[field.key] ?? "").trim();

		if (!raw) {
			// Kotak centang wajib berarti persetujuan: kosong sama dengan menolak,
			// dan itu memang harus menghentikan pengiriman.
			if (field.required) {
				issues.push({
					key: field.key,
					message: field.type === "checkbox" ? `${field.label} harus dicentang.` : `${field.label} wajib diisi.`,
				});
			}
			continue;
		}

		if (raw.length > MAX_ANSWER_LENGTH) {
			issues.push({ key: field.key, message: `${field.label} terlalu panjang.` });
			continue;
		}

		switch (field.type) {
			case "select":
			case "radio": {
				const options = normalizeOptions(field);
				if (!options.includes(raw)) {
					issues.push({ key: field.key, message: `${field.label} berisi pilihan yang tidak tersedia.` });
					continue;
				}
				break;
			}
			case "checkbox": {
				// Satu-satunya nilai yang berarti "dicentang". Nilai lain berarti
				// klien mengarang bentuk data sendiri.
				if (raw !== "true") {
					issues.push({ key: field.key, message: `${field.label} tidak sah.` });
					continue;
				}
				break;
			}
			case "number": {
				const value = Number(raw);
				if (!Number.isFinite(value)) {
					issues.push({ key: field.key, message: `${field.label} harus berupa angka.` });
					continue;
				}
				if (field.min !== undefined && value < field.min) {
					issues.push({ key: field.key, message: `${field.label} minimal ${field.min}.` });
					continue;
				}
				if (field.max !== undefined && value > field.max) {
					issues.push({ key: field.key, message: `${field.label} maksimal ${field.max}.` });
					continue;
				}
				break;
			}
			case "date": {
				// Bentuk ISO saja, tanpa mengurai ke objek tanggal: zona waktu peramban
				// pendaftar tidak sama dengan zona acara, dan mengubahnya ke Date lalu
				// kembali ke string dapat menggeser tanggalnya satu hari.
				if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
					issues.push({ key: field.key, message: `${field.label} bukan tanggal yang sah.` });
					continue;
				}
				break;
			}
			case "email": {
				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
					issues.push({ key: field.key, message: `${field.label} bukan alamat email yang sah.` });
					continue;
				}
				break;
			}
			case "tel": {
				if (!/^[0-9+()\-\s]{6,30}$/.test(raw)) {
					issues.push({ key: field.key, message: `${field.label} bukan nomor telepon yang sah.` });
					continue;
				}
				break;
			}
			case "file": {
				// Nilainya id baris registration_uploads, bukan URL. Keberadaan dan
				// kepemilikan barisnya diperiksa di route handler yang punya akses
				// database; di sini hanya bentuknya.
				if (!/^[0-9a-f-]{36}$/i.test(raw)) {
					issues.push({ key: field.key, message: `${field.label} gagal diunggah. Coba unggah ulang.` });
					continue;
				}
				break;
			}
			default:
				break;
		}

		clean[field.key] = raw;
	}

	return { issues, clean };
}
