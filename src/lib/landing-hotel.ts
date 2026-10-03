import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Hotel acara untuk bagian "Tempat menginap" (gaya gathering), dari hotel yang
 * sama yang dipakai Logistik dan kartu Kamar di Dashboard saya: satu sumber,
 * jadi alamat di halaman publik tidak bisa berbeda dengan alamat di tiket.
 *
 * Hanya hal yang memang untuk umum: nama, alamat, peta, jam check-in/out, dan
 * aturan kamar ("Berdua, sesama jenis kelamin"). Siapa di kamar mana tidak
 * pernah dibaca di sini. Tidak melempar: galat atau acara tanpa hotel = [].
 */

export type LandingHotel = {
  id: number;
  name: string;
  address: string | null;
  map_url: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  /** Kapasitas kamar yang paling umum di hotel ini, null bila belum ada kamar. */
  room_capacity: number | null;
};

export type LandingLodging = { hotels: LandingHotel[]; same_gender: boolean };

export async function loadLandingLodging(eventId: string): Promise<LandingLodging> {
  try {
    const db = getSupabaseServiceClient();
    const [hotels, rooms, settings] = await Promise.all([
      db.from("lodging_hotels" as never).select("id,name,address,map_url,check_in_at,check_out_at")
        .eq("event_id", eventId).order("sort_order").order("id"),
      db.from("lodging_rooms" as never).select("hotel_id,capacity").eq("event_id", eventId).limit(5000),
      db.from("lodging_settings" as never).select("enforce_same_gender").eq("event_id", eventId).maybeSingle(),
    ]);
    if (hotels.error || !hotels.data) return { hotels: [], same_gender: false };
    const perHotel = new Map<number, Map<number, number>>();
    for (const room of (rooms.error ? [] : rooms.data ?? []) as Array<{ hotel_id: number; capacity: number }>) {
      const hitung = perHotel.get(room.hotel_id) ?? new Map<number, number>();
      hitung.set(room.capacity, (hitung.get(room.capacity) ?? 0) + 1);
      perHotel.set(room.hotel_id, hitung);
    }
    const terbanyak = (id: number) => {
      const hitung = perHotel.get(id);
      if (!hitung) return null;
      return [...hitung.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    };
    const setelan = settings.error ? null : (settings.data as { enforce_same_gender?: boolean } | null);
    return {
      hotels: (hotels.data as Array<Omit<LandingHotel, "room_capacity">>)
        .filter((hotel) => hotel.name?.trim())
        .map((hotel) => ({ ...hotel, room_capacity: terbanyak(hotel.id) })),
      // Tanpa baris setelan, assign_room memakai aturan sesama jenis kelamin.
      same_gender: setelan?.enforce_same_gender ?? true,
    };
  } catch {
    return { hotels: [], same_gender: false };
  }
}
