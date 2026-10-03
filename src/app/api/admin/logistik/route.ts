import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationFormConfig } from "@/lib/domain";
import { klien, semuaBaris } from "@/lib/logistik/server";
import type { LogistikData, LogistikField } from "@/lib/logistik/types";

/**
 * Seluruh logistik acara dalam satu jawaban: kamar, bus, agenda, barang, dan
 * peserta yang bisa ditempatkan.
 *
 * Peserta yang dihapus di sumber tidak ikut. Mereka juga tidak dihitung
 * penghuni oleh `assign_room` dan tidak dihitung penumpang oleh
 * `transport_effective`, jadi menampilkannya di sini hanya membuat angka di
 * layar berbeda dengan angka yang dijaga database.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const db = klien();

  const [settings, hotels, rooms, vehicles, trips, items, overview, recap, sesiBarang] = await Promise.all([
    db.from("lodging_settings").select("gender_field_key,enforce_same_gender").eq("event_id", eventId).maybeSingle(),
    db.from("lodging_hotels").select("id,name,address,map_url,check_in_at,check_out_at,sort_order").eq("event_id", eventId)
      .order("sort_order").order("id"),
    db.from("lodging_rooms").select("id,hotel_id,room_number,room_type,capacity,floor,notes").eq("event_id", eventId)
      .order("hotel_id").order("room_number"),
    db.from("transport_vehicles").select("id,code,capacity,plate_number,crew_contact,sort_order").eq("event_id", eventId)
      .order("sort_order").order("id"),
    db.from("transport_trips").select("id,name,depart_at,origin,destination,meeting_point,follows_default,sort_order")
      .eq("event_id", eventId).order("sort_order").order("depart_at", { nullsFirst: false }).order("id"),
    db.from("pickup_items").select("id,name,size_field_key,pickup_note,sort_order").eq("event_id", eventId)
      .order("sort_order").order("id"),
    db.rpc("transport_overview" as never, { p_event_id: eventId } as never),
    db.rpc("pickup_item_recap" as never, { p_event_id: eventId } as never),
    db.from("attendance_session_items").select("item_id,session_id,attendance_sessions(name)").eq("event_id", eventId),
  ]);

  const [peserta, lodging, transport] = await Promise.all([
    semuaBaris<{ id: string; name: string; company: string | null; qr_code: string; extra: Record<string, unknown> | null }>(() =>
      db.from("participants").select("id,name,company,qr_code,extra").eq("event_id", eventId)
        .is("source_removed_at", null).order("name").order("id")),
    semuaBaris<{ participant_id: string; room_id: number }>(() =>
      db.from("lodging_assignments").select("participant_id,room_id").eq("event_id", eventId).order("id")),
    semuaBaris<{ trip_id: number | null; vehicle_id: number | null; participant_id: string }>(() =>
      db.from("transport_assignments").select("trip_id,vehicle_id,participant_id").eq("event_id", eventId).order("id")),
  ]);

  const gagal = [settings, hotels, rooms, vehicles, trips, items, overview, recap, sesiBarang].some((hasil) => hasil.error);
  if (gagal || !peserta || !lodging || !transport) return apiError("INTERNAL_ERROR", 500);

  const setelan = (settings.data as LogistikData["settings"] | null) ?? { gender_field_key: null, enforce_same_gender: true };
  const kunciGender = setelan.gender_field_key;

  // Field yang bisa dipilih sebagai "jenis kelamin" atau "ukuran kaos": field
  // formulir pendaftaran, ditambah kunci yang hanya datang dari impor. Yang
  // kedua ada karena acara dengan data dari Excel sering tidak punya formulir
  // sama sekali, dan tanpa itu dropdownnya kosong.
  const terisi = new Map<string, number>();
  for (const orang of peserta) {
    for (const [kunci, nilai] of Object.entries(orang.extra ?? {})) {
      if (typeof nilai === "string" && nilai.trim()) terisi.set(kunci, (terisi.get(kunci) ?? 0) + 1);
    }
  }
  const formulir = ((auth.scope.event.registration_form_config as RegistrationFormConfig | null)?.fields ?? [])
    .filter((field) => field.type !== "file");
  const fields: LogistikField[] = [
    ...formulir.map((field) => ({ key: field.key, label: field.label, source: "form" as const, filled: terisi.get(field.key) ?? 0 })),
    ...[...terisi.entries()]
      .filter(([kunci]) => !formulir.some((field) => field.key === kunci))
      .map(([kunci, jumlah]) => ({ key: kunci, label: kunci, source: "data" as const, filled: jumlah })),
  ];

  const body: LogistikData = {
    settings: setelan,
    fields,
    participants: peserta.map((orang) => {
      const nilai = kunciGender ? orang.extra?.[kunciGender] : null;
      return {
        id: orang.id,
        name: orang.name,
        company: orang.company,
        qr_code: orang.qr_code,
        gender: typeof nilai === "string" && nilai.trim() ? nilai.trim() : null,
      };
    }),
    hotels: (hotels.data ?? []) as LogistikData["hotels"],
    rooms: (rooms.data ?? []) as LogistikData["rooms"],
    lodging,
    vehicles: (vehicles.data ?? []) as LogistikData["vehicles"],
    trips: (trips.data ?? []) as LogistikData["trips"],
    transport,
    // bigint dari RPC bisa tiba sebagai string; dirapikan di sini supaya
    // halaman tidak menjumlahkan "3" + "2" menjadi "32".
    overview: ((overview.data ?? []) as Array<{ trip_id: number; vehicle_id: number; load: number | string; over_capacity: boolean }>)
      .map((baris) => ({ trip_id: Number(baris.trip_id), vehicle_id: Number(baris.vehicle_id), load: Number(baris.load), over_capacity: baris.over_capacity })),
    items: (items.data ?? []) as LogistikData["items"],
    recap: ((recap.data ?? []) as Array<{ item_id: number; size: string | null; participants: number | string; picked_up: number | string }>)
      .map((baris) => ({ item_id: Number(baris.item_id), size: baris.size, participants: Number(baris.participants), picked_up: Number(baris.picked_up) })),
    item_sessions: ((sesiBarang.data ?? []) as unknown as Array<{ item_id: number; session_id: number; attendance_sessions: { name: string } | null }>)
      .map((baris) => ({ item_id: baris.item_id, session_id: baris.session_id, session_name: baris.attendance_sessions?.name ?? "" })),
  };
  return Response.json(body);
}
