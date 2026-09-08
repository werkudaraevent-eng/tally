import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { DEFAULT_LABEL_SETTINGS, type LabelSettings } from "./layout";
import { labelLayoutSchema } from "./schema";

/**
 * Setelan label sebuah acara, selalu lengkap.
 *
 * Acara yang belum pernah membuka layar setelan tidak punya barisnya, dan itu
 * dijawab dengan nilai bawaan — bukan dengan null yang harus diperiksa di
 * setiap pemanggil. Tanpa baris berarti "belum disetel", dan `enabled: false`
 * pada nilai bawaan sudah menyatakan persis itu.
 *
 * Susunan yang tersimpan diperiksa ulang di sini. `layout` adalah jsonb, jadi
 * bentuknya tidak dijamin database, dan satu baris rusak — sisa migrasi
 * setengah jalan, suntingan langsung di dashboard — tidak boleh menjatuhkan
 * layar pemindai di hari-H. Yang rusak diganti bawaan, dan labelnya tetap
 * tercetak walau susunannya bukan yang terakhir disimpan.
 */
export async function loadLabelSettings(eventId: string): Promise<LabelSettings> {
	const { data } = await getSupabaseServiceClient()
		.from("label_settings")
		.select("enabled,name_prefixes,task,dpi,density,label_type,speed,width_px,height_px,offset_y_px,head_px,width_mm,height_mm,layout")
		.eq("event_id", eventId)
		.maybeSingle();

	if (!data) return DEFAULT_LABEL_SETTINGS;

	const baris = data as Record<string, unknown>;
	const layout = labelLayoutSchema.safeParse(baris.layout);

	return {
		enabled: Boolean(baris.enabled),
		name_prefixes: Array.isArray(baris.name_prefixes) ? (baris.name_prefixes as string[]) : DEFAULT_LABEL_SETTINGS.name_prefixes,
		task: baris.task === "v4" ? "v4" : "b1",
		dpi: Number(baris.dpi),
		density: Number(baris.density),
		label_type: Number(baris.label_type),
		speed: Number(baris.speed),
		width_px: Number(baris.width_px),
		height_px: Number(baris.height_px),
		offset_y_px: Number(baris.offset_y_px),
		head_px: Number(baris.head_px),
		// numeric(6,2) datang sebagai angka dari PostgREST, tetapi Number() tetap
		// dipasang: kolom numeric yang melewati batas presisi JSON dikirim sebagai
		// string, dan lebar label yang berupa string membuat kanvas berukuran NaN.
		width_mm: Number(baris.width_mm),
		height_mm: Number(baris.height_mm),
		layout: layout.success ? layout.data : DEFAULT_LABEL_SETTINGS.layout,
	};
}
