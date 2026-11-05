import { z } from "zod";
import { kunciDariRequest } from "@/lib/api-keys";
import { kunciKamar } from "@/lib/logistik/cari-kamar";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";
import { klien, semuaBaris } from "@/lib/logistik/server";
import {
  cariPeserta, pilihKamar, rapikanNomor,
  type HotelBot, type KamarBot, type PesertaBot, type StayBot,
} from "@/lib/logistik/bot-nomor-kamar";

/**
 * Bot nomor kamar: satu agen (mis. bot Telegram panitia) mengisi nomor kamar
 * dari foto kunci kamar di hari H, tanpa akun dan tanpa layar admin.
 *
 * Kewenangannya sengaja sesempit mungkin (pola restricted key Stripe dan
 * fine-grained token GitHub):
 * - satu kunci untuk SATU acara dengan izin "Room numbers", dibuat panitia
 *   di Event settings > Integrations > API keys (lib/api-keys.ts). Dicabut
 *   atau kedaluwarsa = langsung 401;
 * - hanya menulis `lodging_rooms.room_number` untuk kamar yang sudah ada dan
 *   sudah ditempati peserta yang disebut. Tidak membuat kamar, tidak memindah
 *   orang, tidak mengirim pemberitahuan, tidak membaca QR/email/telepon;
 * - setiap keraguan ditolak dengan pilihan (lib/logistik/bot-nomor-kamar.ts);
 * - setiap penulisan tercatat di audit_logs (`room_number_set_by_bot`) dengan
 *   nilai lama dan nama bot.
 * - nama kunci (mis. "Hermes") menjadi pelaku di Audit trail.
 */

export const dynamic = "force-dynamic";

type Galat = { code: string; message: string; [kunci: string]: unknown };

function tolak(status: number, galat: Galat) {
  return Response.json({ ok: false, error: galat }, { status, headers: { "cache-control": "no-store" } });
}

const skema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  participant_id: z.string().uuid().optional(),
  room_number: z.string().max(80).transform(rapikanNomor).pipe(z.string().min(1).max(40)),
  hotel: z.string().trim().max(120).optional(),
  room_id: z.number().int().positive().optional(),
  /** Malam kunci itu dipakai, "2026-11-06" (zona acara). Memilih kamar bila peserta pindah kamar. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must look like 2026-11-06.").optional(),
  /** Ganti nomor yang sudah ada. Tanpa ini, kamar bernomor lain ditolak. */
  replace: z.boolean().optional(),
  /** Periksa saja, jangan tulis. */
  dry_run: z.boolean().optional(),
}).strict().refine((isi) => Boolean(isi.name || isi.participant_id), { message: "Send name or participant_id." });

export async function POST(request: Request) {
  const kunci = await kunciDariRequest(request, "room_numbers");
  if (!kunci) return tolak(401, { code: "UNAUTHENTICATED", message: "Wrong, revoked or expired API key, or the key has no Room numbers permission." });
  const namaBot = kunci.name;

  let mentah: unknown;
  try {
    mentah = await request.json();
  } catch {
    return tolak(422, { code: "VALIDATION_ERROR", message: "Send JSON: {\"name\": \"...\", \"room_number\": \"...\"}." });
  }
  const parsed = skema.safeParse(mentah);
  if (!parsed.success) return tolak(422, { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join(" ") });
  const isi = parsed.data;

  const db = klien();
  const { data: acara } = await db.from("events").select("id,status,time_zone").eq("id", kunci.event_id).maybeSingle();
  const event = acara as { id: string; status: string; time_zone: string | null } | null;
  if (!event) return tolak(404, { code: "EVENT_NOT_FOUND", message: "The key's event was not found." });
  if (event.status === "completed" || event.status === "archived") {
    return tolak(409, { code: "EVENT_CLOSED", message: "This event is closed. Room numbers can no longer be changed by the bot." });
  }

  // Peserta: hanya nama dan perusahaan, tidak pernah QR, email, atau telepon.
  let peserta: PesertaBot;
  if (isi.participant_id) {
    const { data } = await db.from("participants").select("id,name,company").eq("event_id", event.id)
      .eq("id", isi.participant_id).is("source_removed_at", null).maybeSingle();
    if (!data) return tolak(404, { code: "PARTICIPANT_NOT_FOUND", message: "No participant with this id in the event." });
    peserta = data as PesertaBot;
  } else {
    const semua = await semuaBaris<PesertaBot>(() => db.from("participants").select("id,name,company")
      .eq("event_id", event.id).is("source_removed_at", null).order("id"));
    if (!semua) return tolak(500, { code: "INTERNAL_ERROR", message: "Could not read participants. Try again." });
    const hasil = cariPeserta(isi.name ?? "", semua);
    if (hasil.jenis === "kembar") {
      return tolak(409, { code: "NAME_AMBIGUOUS", message: "More than one participant has this name. Ask which one, then send participant_id.", choices: hasil.pilihan });
    }
    if (hasil.jenis === "tidak_ada") {
      return tolak(404, {
        code: "NAME_NOT_FOUND",
        message: hasil.pilihan.length ? "No exact match. Ask which one, then send participant_id." : "No participant matches this name. Ask for the full name as registered.",
        choices: hasil.pilihan,
      });
    }
    peserta = hasil.peserta;
  }

  const [stayHasil, kamarHasil, hotelHasil] = await Promise.all([
    db.from("lodging_assignments").select("room_id,hotel_id,check_in_at,check_out_at").eq("event_id", event.id).eq("participant_id", peserta.id),
    semuaBaris<KamarBot>(() => db.from("lodging_rooms").select("id,hotel_id,room_number,label,check_in_at,check_out_at").eq("event_id", event.id).order("id")),
    db.from("lodging_hotels").select("id,name,check_in_at,check_out_at").eq("event_id", event.id),
  ]);
  if (stayHasil.error || !kamarHasil || hotelHasil.error) return tolak(500, { code: "INTERNAL_ERROR", message: "Could not read rooms. Try again." });
  const semuaKamar = kamarHasil;
  const hotel = (hotelHasil.data ?? []) as HotelBot[];

  const pilihan = pilihKamar({ stays: (stayHasil.data ?? []) as StayBot[], kamar: semuaKamar, hotel, roomId: isi.room_id, namaHotel: isi.hotel,
    tanggal: isi.date, offset: timeZoneOffset(normalizeTimeZone(event.time_zone)) });
  const siapa = { participant_id: peserta.id, name: peserta.name, company: peserta.company };
  if (pilihan.jenis === "tanpa_stay") {
    return tolak(409, { code: "NO_HOTEL", message: `${peserta.name} has no hotel${isi.hotel ? " matching that name" : ""} in Logistics. An organiser must add the stay first.`, participant: siapa });
  }
  if (pilihan.jenis === "tanpa_kamar") {
    return tolak(409, { code: "NO_ROOM", message: `${peserta.name} has a hotel (${pilihan.hotel.join(", ")}) but no room or room label yet. An organiser must place them in a room first.`, participant: siapa });
  }
  if (pilihan.jenis === "tanggal_lain") {
    return tolak(409, { code: "NO_ROOM_ON_DATE", message: `${peserta.name} has no room for the night of ${isi.date}. Check the date, or ask which room, then send room_id.`, participant: siapa, choices: pilihan.pilihan });
  }
  if (pilihan.jenis === "banyak") {
    return tolak(409, { code: "MANY_ROOMS", message: `${peserta.name} has more than one room. Send date (the night the key is for), or ask which one and send room_id.`, participant: siapa, choices: pilihan.pilihan });
  }

  const kamar = pilihan.kamar;
  const namaHotel = hotel.find((h) => h.id === kamar.hotel_id)?.name ?? "Hotel";
  const nomor = isi.room_number;

  const { data: penghuni } = await db.from("lodging_assignments").select("participant_id").eq("event_id", event.id).eq("room_id", kamar.id);
  const idPenghuni = [...new Set(((penghuni ?? []) as Array<{ participant_id: string }>).map((p) => p.participant_id))];
  const { data: namaPenghuni } = idPenghuni.length
    ? await db.from("participants").select("id,name").eq("event_id", event.id).is("source_removed_at", null).in("id", idPenghuni)
    : { data: [] };
  const occupants = ((namaPenghuni ?? []) as Array<{ name: string }>).map((p) => p.name).sort();
  const ringkas = { participant: siapa, room: { room_id: kamar.id, hotel: namaHotel, label: kamar.label, room_number: kamar.room_number, ...pilihan.malam }, occupants };

  if (kamar.room_number !== null && kunciKamar(kamar.room_number) === kunciKamar(nomor)) return Response.json({ ok: true, changed: false, message: `Room already has number ${nomor}.`, ...ringkas });
  if (kamar.room_number && !isi.replace) {
    return tolak(409, { code: "ROOM_HAS_NUMBER", message: `This room already has number ${kamar.room_number}. Send replace: true only if the organiser confirms the change to ${nomor}.`, ...ringkas });
  }
  const bentrok = semuaKamar.find((k) => k.id !== kamar.id && k.hotel_id === kamar.hotel_id && k.room_number !== null && kunciKamar(k.room_number) === kunciKamar(nomor));
  if (bentrok) {
    return tolak(409, { code: "NUMBER_TAKEN", message: `Number ${nomor} is already used by another room at ${namaHotel}${bentrok.label ? ` (label ${bentrok.label})` : ""}. Check the photo.`, ...ringkas });
  }
  if (isi.dry_run) return Response.json({ ok: true, changed: false, dry_run: true, message: `Would set number ${nomor}.`, ...ringkas });

  // Ditulis hanya bila nomornya masih yang tadi dibaca: panitia yang
  // menyunting kamar yang sama pada detik yang sama tidak tertimpa diam-diam.
  let kueri = db.from("lodging_rooms").update({ room_number: nomor } as never).eq("event_id", event.id).eq("id", kamar.id);
  kueri = kamar.room_number === null ? kueri.is("room_number", null) : kueri.eq("room_number", kamar.room_number);
  const { data: tertulis, error } = await kueri.select("id");
  if (error) {
    if (String((error as { code?: string }).code) === "23505") {
      return tolak(409, { code: "NUMBER_TAKEN", message: `Number ${nomor} is already used by another room at ${namaHotel}. Check the photo.`, ...ringkas });
    }
    return tolak(500, { code: "INTERNAL_ERROR", message: "Could not save. Try again." });
  }
  if (!tertulis?.length) return tolak(409, { code: "ROOM_CHANGED", message: "This room changed a moment ago. Send the request again." });

  const { error: galatAudit } = await db.from("audit_logs").insert({
    event_id: event.id,
    user_id: null,
    action: "room_number_set_by_bot",
    payload: { bot: namaBot, api_key_id: kunci.id, participant_id: peserta.id, participant_name: peserta.name, room_id: kamar.id, hotel: namaHotel, label: kamar.label, old_number: kamar.room_number, new_number: nomor },
  } as never);
  // Nomornya sudah tersimpan; tanpa baris audit, jejaknya tetap ada di log server.
  if (galatAudit) console.error("room_number_set_by_bot audit insert failed", { room_id: kamar.id, code: (galatAudit as { code?: string }).code });

  return Response.json({
    ok: true,
    changed: true,
    message: `Room ${kamar.label ?? ""} at ${namaHotel} now has number ${nomor}.`.replace("Room  at", "Room at"),
    ...ringkas,
    room: { ...ringkas.room, room_number: nomor },
  });
}
