import { z } from "zod";
import { BADGE_FORMATS, BADGE_TEXT_FIELDS, MAX_ELEMEN_PER_SISI, UKURAN_KHUSUS } from "./layout";

/**
 * Validasi susunan badge — sisi server saja (lihat catatan di `layout.ts`).
 *
 * Batas koordinat 300 mm: lebih lebar dari A4 mendatar, jadi tidak ada susunan
 * sah yang tertolak, dan satu baris rusak tidak bisa membuat halaman cetak
 * menggambar kotak sepanjang satu kilometer.
 */

const mm = z.number().min(0).max(300);
const warna = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const urlGambar = z.string().url().max(1000).refine((nilai) => nilai.startsWith("https://"), "Harus https").nullable();

const textSchema = z.object({
	type: z.literal("text"),
	field: z.enum(BADGE_TEXT_FIELDS),
	text: z.string().max(160).optional(),
	x: mm, y: mm, w: z.number().min(4).max(300),
	size: z.number().min(5).max(96),
	weight: z.enum(["normal", "bold"]),
	align: z.enum(["left", "center", "right"]),
	uppercase: z.boolean().optional(),
	color: warna,
});

const qrSchema = z.object({
	type: z.literal("qr"),
	field: z.enum(["qr_code", "rundown_url"]),
	x: mm, y: mm,
	// Di bawah 14 mm pelatnya, kode tautan rundown jatuh di bawah 0,5 mm per modul.
	size: z.number().min(14).max(200),
});

const rectSchema = z.object({
	type: z.literal("rect"),
	x: mm, y: mm, w: z.number().min(1).max(300), h: z.number().min(1).max(300),
	color: warna,
	radius: z.number().min(0).max(20),
});

const imageSchema = z.object({
	type: z.literal("image"),
	url: urlGambar,
	x: mm, y: mm, w: z.number().min(4).max(300), h: z.number().min(4).max(300),
});

const rundownSchema = z.object({
	type: z.literal("rundown"),
	x: mm, y: mm, w: z.number().min(30).max(300), h: z.number().min(20).max(300),
	day: z.string().max(40),
	merge_parallel: z.boolean(),
	size: z.number().min(8).max(14),
	color: warna,
	accent: warna,
});

const elementSchema = z.discriminatedUnion("type", [textSchema, qrSchema, rectSchema, imageSchema, rundownSchema]);

export const badgeLayoutSchema = z.object({
	v: z.literal(1),
	format: z.object({
		kind: z.enum(BADGE_FORMATS),
		w_mm: z.number().min(UKURAN_KHUSUS.min).max(UKURAN_KHUSUS.max),
		h_mm: z.number().min(UKURAN_KHUSUS.min).max(UKURAN_KHUSUS.max),
		fold: z.enum(["none", "side", "top"]),
	}),
	background: z.object({
		mode: z.enum(["polos", "kv", "unggah"]),
		color: warna,
		front_url: urlGambar,
		back_url: urlGambar,
	}),
	front: z.array(elementSchema).max(MAX_ELEMEN_PER_SISI),
	back: z.array(elementSchema).max(MAX_ELEMEN_PER_SISI),
});
