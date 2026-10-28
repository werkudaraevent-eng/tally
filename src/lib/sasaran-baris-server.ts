import { z } from "zod";
import { kolomSasaran, SASARAN_NILAI_MAX, SASARAN_NILAI_PANJANG } from "@/lib/sasaran-bagian";
import { bacaSyaratBaris, SYARAT_MAX, type SyaratBaris } from "@/lib/sasaran-baris";
import { KOLOM_HOTEL } from "@/lib/sasaran-blok";
import { semuaBaris } from "@/lib/logistik/server";
import { tanggalStay } from "@/lib/logistik/stay";
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

export type StayPeserta = Map<string, Array<{ hotel_id: number; masuk: string | null; keluar: string | null }>>;

/**
 * Stay hotel tiap peserta untuk syarat Hotel: dari penempatan, termasuk tamu
 * yang nomor kamarnya menyusul, dengan tanggal efektifnya (stay, lalu hotel).
 * Null bila gagal dibaca. Dipakai hitungan Who sees it di editor Agenda dan
 * angka "diharapkan" per checkpoint di Dashboard, supaya keduanya sama.
 */
export async function muatStayPeserta(eventId: string): Promise<StayPeserta | null> {
  const db = getSupabaseServiceClient();
  const [tempat, hotels] = await Promise.all([
    semuaBaris<{ participant_id: string; hotel_id: number; check_in_at: string | null; check_out_at: string | null }>(() =>
      db.from("lodging_assignments").select("participant_id,hotel_id,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
    db.from("lodging_hotels").select("id,check_in_at,check_out_at").eq("event_id", eventId),
  ]);
  if (!tempat || hotels.error) return null;
  const hotelById = new Map(((hotels.data ?? []) as Array<{ id: number; check_in_at: string | null; check_out_at: string | null }>).map((h) => [Number(h.id), h]));
  const hasil: StayPeserta = new Map();
  for (const isi of tempat) {
    const t = tanggalStay({ hotel_id: Number(isi.hotel_id), check_in_at: isi.check_in_at, check_out_at: isi.check_out_at }, hotelById.get(Number(isi.hotel_id)));
    hasil.set(isi.participant_id, [...(hasil.get(isi.participant_id) ?? []), { hotel_id: Number(isi.hotel_id), masuk: t.masuk, keluar: t.keluar }]);
  }
  return hasil;
}
