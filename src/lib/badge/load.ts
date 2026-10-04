import { formatClock } from "@/lib/rundown";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { DEFAULT_BADGE_LAYOUT, type BadgeLayout } from "./layout";
import type { BadgeRundownHari } from "./rundown";
import { badgeLayoutSchema } from "./schema";

/**
 * Susunan badge sebuah acara, selalu lengkap.
 *
 * `migrasi: false` berarti tabel `badge_settings` belum ada di database ini.
 * Itu bukan galat: penyunting tetap terbuka dengan susunan bawaan dan Simpan
 * menjelaskan kenapa belum bisa menyimpan, sama seperti kebiasaan layar lain
 * yang kolomnya menunggu migrasi.
 *
 * Susunan tersimpan diperiksa ulang: `layout` jsonb, bentuknya tidak dijamin
 * database, dan satu baris rusak tidak boleh menjatuhkan halaman cetak.
 */
/** Tabel `badge_settings` belum dibuat: migrasi 202610040001 belum dijalankan. */
export function tabelBadgeBelumAda(error: { code?: string; message?: string } | null): boolean {
	if (!error) return false;
	return error.code === "42P01" || error.code === "PGRST205" || /badge_settings/.test(error.message ?? "");
}

export async function loadBadgeLayout(eventId: string): Promise<{ layout: BadgeLayout; migrasi: boolean }> {
	const { data, error } = await getSupabaseServiceClient()
		.from("badge_settings")
		.select("layout")
		.eq("event_id", eventId)
		.maybeSingle();
	if (error) return { layout: DEFAULT_BADGE_LAYOUT, migrasi: !tabelBadgeBelumAda(error) };
	if (!data) return { layout: DEFAULT_BADGE_LAYOUT, migrasi: true };
	const parsed = badgeLayoutSchema.safeParse((data as { layout: unknown }).layout);
	return { layout: parsed.success ? (parsed.data as BadgeLayout) : DEFAULT_BADGE_LAYOUT, migrasi: true };
}

/**
 * Rundown untuk badge: bagian dan baris yang DITERBITKAN saja.
 *
 * Aturan yang sama dengan halaman acara dan layar `/rundown`: yang disembunyikan
 * panitia di Rundown tidak boleh muncul di badge, sebab badge dibagikan ke
 * semua tamu dan tidak bisa ditarik kembali.
 */
export async function loadBadgeRundown(eventId: string): Promise<BadgeRundownHari[]> {
	const client = getSupabaseServiceClient();
	const { data: sections } = await client
		.from("rundown_sections")
		.select("id,name,title,event_date,sort_order")
		.eq("event_id", eventId)
		.eq("is_published", true)
		.order("sort_order", { ascending: true });
	const daftar = (sections ?? []) as unknown as Array<{ id: number; name: string | null; title: string | null; event_date: string | null }>;
	if (daftar.length === 0) return [];

	const { data: items } = await client
		.from("rundown_items")
		.select("section_id,title,start_time,is_break,sort_order")
		.in("section_id", daftar.map((section) => section.id))
		.eq("is_published", true)
		.order("sort_order", { ascending: true });
	const baris = (items ?? []) as unknown as Array<{ section_id: number; title: string | null; start_time: string | null; is_break: boolean | null }>;

	return daftar.map((section) => ({
		id: String(section.id),
		nama: section.name?.trim() || section.title?.trim() || "Rundown",
		tanggal: section.event_date,
		items: baris
			.filter((item) => item.section_id === section.id && (item.title ?? "").trim().length > 0)
			.slice(0, 60)
			.map((item) => ({ jam: formatClock(item.start_time).replace(":", "."), judul: (item.title ?? "").trim(), jeda: Boolean(item.is_break) })),
	}));
}

/** URL KV halaman acara, bila ada dan aman dipakai sebagai gambar. */
export function kvUrlDari(landingConfig: unknown): string | null {
	const url = (landingConfig as { banner_url?: unknown } | null)?.banner_url;
	return typeof url === "string" && url.startsWith("https://") ? url : null;
}
