import { z } from "zod";
import { LABEL_FIELDS } from "./layout";

/**
 * Validasi setelan label — sisi server saja.
 *
 * Terpisah dari `layout.ts` supaya zod tidak ikut ke bundel layar pemindai,
 * yang mengimpor tipe dan penggambar dari sana tetapi tidak pernah memvalidasi
 * apa pun: yang menyimpan setelan adalah admin, lewat route handler.
 */

const textElementSchema = z.object({
	type: z.literal("text"),
	field: z.enum(LABEL_FIELDS),
	text: z.string().max(120).optional(),
	x: z.number().int().min(0).max(2000),
	y: z.number().int().min(0).max(2000),
	w: z.number().int().min(8).max(2000),
	size: z.number().int().min(6).max(200),
	weight: z.enum(["normal", "bold"]),
	align: z.enum(["left", "center", "right"]),
	uppercase: z.boolean().optional(),
});

const qrElementSchema = z.object({
	type: z.literal("qr"),
	field: z.literal("qr_code"),
	x: z.number().int().min(0).max(2000),
	y: z.number().int().min(0).max(2000),
	size: z.number().int().min(24).max(1000),
});

export const labelLayoutSchema = z.object({
	v: z.literal(1),
	// Dua belas sudah lebih banyak daripada yang muat di label 50×30 mm. Batasnya
	// ada supaya satu baris yang rusak tidak bisa membuat penggambar berputar
	// ribuan kali di dalam dialog yang sedang ditunggu petugas.
	elements: z.array(z.discriminatedUnion("type", [textElementSchema, qrElementSchema])).max(12),
});

export const labelSettingsSchema = z.object({
	enabled: z.boolean(),
	// Satu awalan kosong akan cocok dengan SEMUA perangkat BLE di ruangan, jadi
	// yang kosong dibuang di route handler sebelum disimpan.
	name_prefixes: z.array(z.string().trim().min(1).max(30)).max(6),
	task: z.enum(["b1", "v4"]),
	dpi: z.number().int().min(100).max(600),
	density: z.number().int().min(1).max(5),
	label_type: z.number().int().min(1).max(5),
	speed: z.number().int().min(1).max(5),
	width_px: z.number().int().min(32).max(1200),
	height_px: z.number().int().min(32).max(2000),
	offset_y_px: z.number().int().min(-200).max(200),
	head_px: z.number().int().min(32).max(1200),
	width_mm: z.number().min(1).max(300),
	height_mm: z.number().min(1).max(300),
	layout: labelLayoutSchema,
});
