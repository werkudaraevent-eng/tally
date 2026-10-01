import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Kamar, bus, dan barang milik satu peserta, dari RPC `member_logistics`
 * (migrasi 202609300005).
 *
 * Bentuknya mengikuti RPC apa adanya. Yang tidak boleh dilihat peserta (catatan
 * kamar, kontak kru, pelat nomor, teman sekamar bila disembunyikan panitia)
 * sudah dibuang di database, jadi di sini tidak ada penyaringan kedua yang bisa
 * lupa dijalankan.
 */

export type MemberRoommate = { name: string; company: string | null };

export type MemberLodging = {
  hotel: { name: string | null; address: string | null; map_url: string | null };
  room_number: string | null;
  room_type: string | null;
  floor: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  /** Null bila panitia menyembunyikan teman sekamar. Array kosong = sendiri. */
  roommates: MemberRoommate[] | null;
};

export type MemberTrip = {
  name: string;
  depart_at: string | null;
  origin: string | null;
  destination: string | null;
  meeting_point: string | null;
  bus: string | null;
  differs_from_default: boolean;
};

export type MemberTransport = { default_bus: string | null; trips: MemberTrip[] };

export type MemberItem = {
  name: string;
  size: string | null;
  pickup_note: string | null;
  picked_up_at: string | null;
};

export type MemberLogistics = {
  lodging: MemberLodging | null;
  transport: MemberTransport | null;
  items: MemberItem[];
};

const KOSONG: MemberLogistics = { lodging: null, transport: null, items: [] };

/**
 * Selalu mengembalikan objek. Bila RPC belum ada di database (migrasinya belum
 * diterapkan) atau gagal, hasilnya kosong dan kartu logistik tampil sebagai
 * "belum diatur panitia": area peserta tidak boleh ikut mati karena satu
 * modul yang belum dinyalakan.
 */
export async function loadMemberLogistics(eventId: string, participantId: string): Promise<MemberLogistics> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "member_logistics" as never,
    { p_event_id: eventId, p_participant_id: participantId } as never,
  );
  if (error || !data) return KOSONG;
  const hasil = data as Partial<MemberLogistics>;
  return {
    lodging: hasil.lodging ?? null,
    transport: hasil.transport ?? null,
    items: Array.isArray(hasil.items) ? hasil.items : [],
  };
}
