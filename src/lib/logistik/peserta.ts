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

/** Tiket kereta peserta (tabel `train_tickets`), berangkat dulu lalu pulang. */
export type LogistikKereta = {
  direction: "outbound" | "return";
  train_name: string;
  travel_class: string | null;
  origin: string | null;
  destination: string | null;
  /** YYYY-MM-DD dan HH:MM seperti di tiket, tanpa zona. */
  depart_date: string | null;
  depart_time: string | null;
  arrive_time: string | null;
  carriage: string | null;
  seat: string | null;
  booking_code: string | null;
};

/**
 * Plat nomor dan kontak kru bus yang dinaiki peserta. Hanya bila panitia
 * menyalakannya (Logistics > Buses > What participants see); yang mati selalu
 * null di sini, jadi tidak pernah sampai ke HTML peserta.
 */
export type LogistikDetailBus = { code: string; plate: string | null; crew: string | null };

export type LogistikPeserta = {
  lodging: LogistikKamar | null;
  transport: { default_bus: string | null; trips: LogistikAgenda[] } | null;
  items: LogistikBarang[];
  trains: LogistikKereta[];
  /** Kosong bila kedua sakelar mati: kartu Bus tampil seperti sebelumnya. */
  buses: LogistikDetailBus[];
};

export async function loadMemberLogistics(
  eventId: string,
  participantId: string,
  tampil: boolean,
  bus: { plate: boolean; crew: boolean } = { plate: false, crew: false },
): Promise<LogistikPeserta | null> {
  if (!tampil) return null;
  try {
    const db = getSupabaseServiceClient();
    const [{ data, error }, trains] = await Promise.all([
      db.rpc("member_logistics" as never, { p_event_id: eventId, p_participant_id: participantId } as never),
      loadTrainTickets(eventId, participantId),
    ]);
    if (error || !data || typeof data !== "object") return null;
    const hasil = data as Partial<LogistikPeserta>;
    const transport = hasil.transport ?? null;
    const buses = await loadBusDetails(eventId, transport, bus);
    return { lodging: hasil.lodging ?? null, transport, items: hasil.items ?? [], trains, buses };
  } catch {
    return null;
  }
}

/**
 * Detail bus yang memang dinaiki peserta ini (bus bawaan dan bus per agenda
 * dari member_logistics), dicari dengan kode bus yang unik per acara. Galat
 * menjadi daftar kosong: kartu Bus tetap tampil dengan nama busnya saja.
 */
async function loadBusDetails(
  eventId: string,
  transport: LogistikPeserta["transport"],
  tampil: { plate: boolean; crew: boolean },
): Promise<LogistikDetailBus[]> {
  if (!transport || (!tampil.plate && !tampil.crew)) return [];
  const kode = [...new Set([transport.default_bus, ...transport.trips.map((trip) => trip.bus)].filter((nama): nama is string => Boolean(nama)))];
  if (kode.length === 0) return [];
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from("transport_vehicles")
      .select("code,plate_number,crew_contact")
      .eq("event_id", eventId)
      .in("code", kode);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<{ code: string; plate_number: string | null; crew_contact: string | null }>)
      .map((baris) => ({
        code: baris.code,
        plate: tampil.plate ? baris.plate_number?.trim() || null : null,
        crew: tampil.crew ? baris.crew_contact?.trim() || null : null,
      }))
      .filter((baris) => baris.plate || baris.crew)
      .sort((a, b) => kode.indexOf(a.code) - kode.indexOf(b.code));
  } catch {
    return [];
  }
}

/**
 * Tiket kereta satu peserta. Galat (termasuk tabel yang belum dibuat di
 * database lama) menjadi daftar kosong: kartunya tidak tampil, sisanya tetap.
 * Tiket dibaca lewat service role dan selalu disaring ke peserta yang masuk.
 */
async function loadTrainTickets(eventId: string, participantId: string): Promise<LogistikKereta[]> {
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from("train_tickets")
      .select("direction,train_name,travel_class,origin,destination,depart_date,depart_time,arrive_time,carriage,seat,booking_code")
      .eq("event_id", eventId)
      .eq("participant_id", participantId);
    if (error || !Array.isArray(data)) return [];
    return (data as LogistikKereta[]).sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "outbound" ? -1 : 1));
  } catch {
    return [];
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
