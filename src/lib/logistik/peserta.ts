import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Logistik yang boleh dilihat satu peserta di Dashboard saya: kamar, bus, dan
 * barang (fungsi `member_logistics`, migrasi 202609300005).
 *
 * Hanya dibaca bila panitia menyalakan "Kamar dan bus" di Area peserta
 * (`landing_config.member.show_logistics`, bawaan mati). Fungsi ini tidak
 * melempar: sakelar mati, galat, atau acara tanpa logistik menghasilkan null,
 * dan dashboard tampil seperti biasa tanpa satu piksel pun berubah.
 */

export type LogistikKamar = {
  hotel: { name: string; address: string | null; map_url: string | null };
  room_number: string;
  room_type: string | null;
  floor: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  /** null = panitia menyembunyikan teman sekamar (show_roommates). */
  roommates: { name: string; company: string | null }[] | null;
};

export type LogistikAgenda = {
  name: string;
  depart_at: string | null;
  origin: string | null;
  destination: string | null;
  meeting_point: string | null;
  /** null = peserta tidak naik bus di agenda ini. */
  bus: string | null;
  differs_from_default: boolean;
};

export type LogistikBarang = { name: string; size: string | null; pickup_note: string | null; picked_up_at: string | null };

export type LogistikPeserta = {
  lodging: LogistikKamar | null;
  transport: { default_bus: string | null; trips: LogistikAgenda[] } | null;
  items: LogistikBarang[];
};

export async function loadMemberLogistics(eventId: string, participantId: string, tampil: boolean): Promise<LogistikPeserta | null> {
  if (!tampil) return null;
  try {
    const { data, error } = await getSupabaseServiceClient().rpc(
      "member_logistics" as never,
      { p_event_id: eventId, p_participant_id: participantId } as never,
    );
    if (error || !data || typeof data !== "object") return null;
    const hasil = data as Partial<LogistikPeserta>;
    return { lodging: hasil.lodging ?? null, transport: hasil.transport ?? null, items: hasil.items ?? [] };
  } catch {
    return null;
  }
}

/** Agenda bus terdekat yang belum berangkat, untuk kartu "Berikutnya". */
export function agendaBerikutnya(logistik: LogistikPeserta, now: Date): LogistikAgenda | null {
  const trips = logistik.transport?.trips ?? [];
  return (
    trips
      .filter((trip) => trip.bus && trip.depart_at && new Date(trip.depart_at).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.depart_at!).getTime() - new Date(b.depart_at!).getTime())[0] ?? null
  );
}
