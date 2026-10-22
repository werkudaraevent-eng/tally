import { z } from "zod";
import { kolomSasaran, SASARAN_NILAI_MAX, SASARAN_NILAI_PANJANG } from "@/lib/sasaran-bagian";
import { bacaSyaratBaris, SYARAT_MAX, type SyaratBaris } from "@/lib/sasaran-baris";
import { KOLOM_HOTEL } from "@/lib/sasaran-blok";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Pemeriksaan kiriman Who sees it baris Agenda, dipakai bersama oleh
// /api/admin/rundown/items (New item menyimpan syaratnya dalam INSERT yang
// sama) dan /api/admin/rundown/items/sasaran (Edit item).

export const syaratSchema = z
  .array(
    z.object({
      field: z.string().regex(/^([a-z0-9_]{1,64}|@hotel)$/),
      values: z.array(z.string().trim().min(1).max(SASARAN_NILAI_PANJANG)).min(1).max(SASARAN_NILAI_MAX),
    }),
  )
  .min(1)
  .max(SYARAT_MAX)
  .nullable();

export type Hotel = { id: number; name: string };

export async function muatHotel(eventId: string): Promise<Hotel[] | null> {
  const { data, error } = await getSupabaseServiceClient().from("lodging_hotels").select("id,name,sort_order").eq("event_id", eventId).order("sort_order").order("id");
  return error ? null : ((data ?? []) as unknown as Hotel[]).map(({ id, name }) => ({ id, name }));
}

/**
 * Syarat kiriman yang sah untuk acara ini: hanya kolom pilihan acara ini dan
 * pilihannya, atau hotel acara ini, dan satu syarat per kolom. Kolom lain bisa
 * menampilkan jawaban kolom staf yang tidak dimaksudkan, jadi ditolak. Hotel
 * dimuat hanya bila dipakai; gagal memuatnya = `galat` null (galat server).
 */
export async function periksaSyarat(
  audience: z.infer<typeof syaratSchema>,
  event: { id: string; registration_form_config: unknown },
): Promise<{ syarat: SyaratBaris | null } | { galat: string | null }> {
  if (!audience) return { syarat: null };
  const hotels = audience.some((isi) => isi.field === KOLOM_HOTEL) ? await muatHotel(event.id) : [];
  if (hotels === null) return { galat: null };
  const kolom = kolomSasaran(event.registration_form_config);
  const dipakai = new Set<string>();
  for (const isi of audience) {
    if (dipakai.has(isi.field)) return { galat: "Each field can be used in one condition only." };
    dipakai.add(isi.field);
    if (isi.field === KOLOM_HOTEL) {
      if (!isi.values.every((nilai) => hotels.some((hotel) => String(hotel.id) === nilai))) return { galat: "That hotel is no longer in Logistics. Reload the page." };
      continue;
    }
    const pilihan = kolom.find((k) => k.key === isi.field);
    if (!pilihan) return { galat: "That participant field no longer exists. Reload the page." };
    if (!isi.values.every((nilai) => pilihan.options.includes(nilai))) return { galat: "That answer is no longer in the participant field. Reload the page." };
  }
  return { syarat: bacaSyaratBaris(audience) };
}
