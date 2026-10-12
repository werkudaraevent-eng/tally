import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Hotel acara untuk bagian "Tempat menginap" (gaya gathering), dari hotel yang
 * sama yang dipakai Logistik dan kartu Kamar di Dashboard saya: satu sumber,
 * jadi alamat di halaman publik tidak bisa berbeda dengan alamat di tiket.
 *
 * Hanya hal yang memang untuk umum: nama, alamat, peta, dan jam check-in/out.
 * Kamar dan siapa di kamar mana tidak pernah dibaca di sini. Tidak melempar:
 * galat atau acara tanpa hotel = [].
 */

export type LandingHotel = {
  id: number;
  name: string;
  address: string | null;
  map_url: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
};

export type LandingLodging = { hotels: LandingHotel[] };

export async function loadLandingLodging(eventId: string): Promise<LandingLodging> {
  try {
    const db = getSupabaseServiceClient();
    const hotels = await db.from("lodging_hotels" as never).select("id,name,address,map_url,check_in_at,check_out_at")
      .eq("event_id", eventId).order("sort_order").order("id");
    if (hotels.error || !hotels.data) return { hotels: [] };
    return { hotels: (hotels.data as LandingHotel[]).filter((hotel) => hotel.name?.trim()) };
  } catch {
    return { hotels: [] };
  }
}
