import { z } from "zod";
import { kunciDariRequest } from "@/lib/api-keys";
import { kunciKamar } from "@/lib/logistik/cari-kamar";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";
import { klien, pesanRpc, semuaBaris } from "@/lib/logistik/server";
import {
  bolehGabung, cariPeserta, pasanganSekamar, pilihKamar, rapikanNomor, rentangStay,
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
  participant_id: z.string().guid().optional(),
  room_number: z.string().max(80).transform(rapikanNomor).pipe(z.string().min(1).max(40)),
  hotel: z.string().trim().max(120).optional(),
  room_id: z.number().int().positive().optional(),
  /** Malam kunci itu dipakai, "2026-11-06" (zona acara). Memilih kamar bila peserta pindah kamar. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must look like 2026-11-06.").optional(),
  /** Ganti nomor yang sudah ada. Tanpa ini, kamar bernomor lain ditolak. */
  replace: z.boolean().optional(),
  /**
   * Nama lain di kunci kamar yang sama ("Muhammad hafdiz"). Bila nama utama
   * tidak persis, Tally mencari kandidat yang SEKAMAR dengan kandidat nama
   * ini: tepat satu pasangan = disarankan (CONFIRM_MATCH), tidak ditulis
   * sampai panitia mengirim ulang dengan participant_id dan room_id.
   */
  roommates: z.array(z.string().trim().min(1).max(200)).max(3).optional(),
  /**
   * Nomor ini milik kamar lain di malam yang tidak bertabrakan (CAN_JOIN_ROOM):
   * pindahkan semua penghuni kamar ini ke kamar bernomor itu. Hanya setelah
   * panitia memastikan itu kamar fisik yang sama.
   */
  join_room: z.boolean().optional(),
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
    if (hasil.jenis === "satu") {
      peserta = hasil.peserta;
      // Nama persis, tapi teman sekamar yang disebut tidak sekamar dengannya:
      // tanda kuat kamar tertukar, jadi ditanyakan, tidak ditulis.
      for (const nama of isi.roommates ?? []) {
        const orangTeman = cariPeserta(nama, semua).kandidat.filter((o) => o.id !== peserta.id);
        const calon = orangTeman.map((o) => o.id);
        const sekamar = calon.length ? await pasanganTeman(db, event.id, [peserta.id], [calon]) : null;
        if (sekamar === "galat") return tolak(500, { code: "INTERNAL_ERROR", message: "Could not read rooms. Try again." });
        if (!sekamar) {
          const [orang, ...teman] = await denganKamar(db, event.id, [peserta, ...orangTeman.slice(0, 5)]);
          return tolak(409, {
            code: "ROOMMATE_MISMATCH",
            message: `${peserta.name} is not in a room with anyone named "${nama}". The rooms may have been swapped: ask the organiser, then send participant_id and room_id.`,
            participant: orang,
            choices: teman,
          });
        }
      }
    } else {
      const teman = (isi.roommates ?? []).map((nama) => cariPeserta(nama, semua).kandidat.map((o) => o.id));
      const cocok = teman.length && hasil.kandidat.length ? await pasanganTeman(db, event.id, hasil.kandidat.map((o) => o.id), teman) : null;
      if (cocok === "galat") return tolak(500, { code: "INTERNAL_ERROR", message: "Could not read rooms. Try again." });
      const choices = await denganKamar(db, event.id, cocok
        ? [hasil.kandidat.find((o) => o.id === cocok.participant_id)!, ...hasil.pilihan.filter((o) => o.id !== cocok.participant_id)].slice(0, 5)
        : hasil.pilihan);
      if (cocok) {
        // Nama teman sekamar hanya MENYARANKAN, tidak pernah menulis sendiri:
        // pada nama mirip di kamar bertukar, tebakan ini bisa salah orang.
        const saran = choices[0];
        const kamarSaran = await kamarSingkat(db, event.id, cocok.room_id);
        return tolak(409, {
          code: "CONFIRM_MATCH",
          message: `Likely ${saran.name}${kamarSaran ? `, room ${kamarSaran.label ?? kamarSaran.room_number ?? ""} at ${kamarSaran.hotel}` : ""}, based on the roommate name. Ask the organiser to confirm, then send participant_id and room_id.`,
          suggestion: { participant_id: saran.id, name: saran.name, company: saran.company, room_id: cocok.room_id, ...(kamarSaran ?? {}), occupants: await namaPenghuni(db, event.id, cocok.room_id) },
          choices,
        });
      }
      if (hasil.jenis === "kembar") {
        return tolak(409, { code: "NAME_AMBIGUOUS", message: "More than one participant has this name. Ask which one, then send participant_id.", choices });
      }
      return tolak(404, {
        code: "NAME_NOT_FOUND",
        message: hasil.pilihan.length
          ? `No exact match${teman.length ? ", and the roommate names did not point to one room" : ""}. Ask which one, then send participant_id.`
          : "No participant matches this name. Ask for the full name as registered.",
        choices,
      });
    }
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

  const occupants = await namaPenghuni(db, event.id, kamar.id);
  const ringkas = { participant: siapa, room: { room_id: kamar.id, hotel: namaHotel, label: kamar.label, room_number: kamar.room_number, ...pilihan.malam }, occupants };

  if (kamar.room_number !== null && kunciKamar(kamar.room_number) === kunciKamar(nomor)) return Response.json({ ok: true, changed: false, message: `Room already has number ${nomor}.`, ...ringkas });
  if (kamar.room_number && !isi.replace) {
    return tolak(409, { code: "ROOM_HAS_NUMBER", message: `This room already has number ${kamar.room_number}. Send replace: true only if the organiser confirms the change to ${nomor}.`, ...ringkas });
  }
  const bentrok = semuaKamar.find((k) => k.id !== kamar.id && k.hotel_id === kamar.hotel_id && k.room_number !== null && kunciKamar(k.room_number) === kunciKamar(nomor));
  if (bentrok) {
    const gabung = await cekGabung(db, event.id, kamar, bentrok, semuaKamar, hotel);
    if (gabung === "galat") return tolak(500, { code: "INTERNAL_ERROR", message: "Could not read rooms. Try again." });
    const tujuan = { room_id: bentrok.id, hotel: namaHotel, label: bentrok.label, room_number: bentrok.room_number, occupants: gabung.namaTujuan };
    if (!gabung.boleh) {
      const sebab = gabung.alasan === "tanggal" ? ", and the nights are not set for both rooms. Ask the organiser to change it in Logistics"
        : ", with guests on the same nights. Check the photo";
      return tolak(409, { code: "NUMBER_TAKEN", message: `Number ${nomor} is already used by another room at ${namaHotel}${bentrok.label ? ` (label ${bentrok.label})` : ""}${sebab}.`, ...ringkas, taken_by: tujuan });
    }
    const sebutan = `${bentrok.label ?? "room"} (${bentrok.room_number})`;
    if (!isi.join_room) {
      return tolak(409, {
        code: "CAN_JOIN_ROOM",
        message: `Number ${nomor} belongs to ${sebutan} at ${namaHotel}, used on other nights. If it is the same physical room, ask the organiser, then resend with join_room: true to move everyone in ${kamar.label ?? "this room"} into it.`,
        ...ringkas,
        taken_by: tujuan,
      });
    }
    if (isi.dry_run) return Response.json({ ok: true, changed: false, dry_run: true, message: `Would move ${gabung.pindah.length} people into ${sebutan}.`, ...ringkas, taken_by: tujuan });
    const { error: galatGabung } = await db.rpc("replace_stays" as never, { p_event_id: event.id, p_items: gabung.items, p_actor: null } as never);
    if (galatGabung) {
      return tolak(409, { code: "JOIN_REJECTED", message: pesanRpc(galatGabung) ?? "Could not move them into that room. Ask the organiser to do it in Logistics.", ...ringkas, taken_by: tujuan });
    }
    const { error: galatAudit } = await db.from("audit_logs").insert({
      event_id: event.id,
      user_id: null,
      action: "room_joined_by_bot",
      payload: { bot: namaBot, api_key_id: kunci.id, participant_id: peserta.id, participant_name: peserta.name, from_room_id: kamar.id, from_label: kamar.label, room_id: bentrok.id, hotel: namaHotel, label: bentrok.label, new_number: bentrok.room_number, moved: gabung.pindah },
    } as never);
    if (galatAudit) console.error("room_joined_by_bot audit insert failed", { room_id: bentrok.id, code: (galatAudit as { code?: string }).code });
    return Response.json({
      ok: true,
      changed: true,
      message: `Moved ${gabung.pindah.length} people from ${kamar.label ?? "their room"} into ${sebutan} at ${namaHotel}. ${kamar.label ?? "The old room"} is now empty.`,
      participant: siapa,
      room: { room_id: bentrok.id, hotel: namaHotel, label: bentrok.label, room_number: bentrok.room_number, ...pilihan.malam },
      occupants: await namaPenghuni(db, event.id, bentrok.id),
    });
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
    payload: { bot: namaBot, api_key_id: kunci.id, matched_by: isi.participant_id ? "participant_id" : "name", sent_name: isi.name ?? null, sent_roommates: isi.roommates ?? [], participant_id: peserta.id, participant_name: peserta.name, room_id: kamar.id, hotel: namaHotel, label: kamar.label, old_number: kamar.room_number, new_number: nomor },
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

type Db = ReturnType<typeof klien>;

/**
 * Satu pasangan (kandidat nama utama, kamar) yang juga ditempati kandidat
 * SETIAP nama teman. Null bila tidak ada atau lebih dari satu.
 */
async function pasanganTeman(db: Db, eventId: string, kandidat: string[], teman: string[][]) {
  const semuaId = [...new Set([...kandidat, ...teman.flat()])];
  const { data, error } = await db.from("lodging_assignments").select("participant_id,room_id")
    .eq("event_id", eventId).in("participant_id", semuaId);
  if (error) return "galat" as const;
  const penghuni = (data ?? []) as Array<{ participant_id: string; room_id: number | null }>;
  let hasil: Array<{ participant_id: string; room_id: number }> | null = null;
  for (const daftar of teman) {
    const pasangan = pasanganSekamar(kandidat, daftar, penghuni);
    hasil = hasil === null ? pasangan : hasil.filter((a) => pasangan.some((b) => b.participant_id === a.participant_id && b.room_id === a.room_id));
  }
  return hasil?.length === 1 ? hasil[0] : null;
}

/** Pilihan nama membawa kamar masing-masing, supaya panitia bisa menunjuk yang benar. */
async function denganKamar(db: Db, eventId: string, pilihan: PesertaBot[]) {
  if (!pilihan.length) return [];
  const { data } = await db.from("lodging_assignments").select("participant_id,room_id,hotel_id")
    .eq("event_id", eventId).in("participant_id", pilihan.map((o) => o.id));
  const stays = (data ?? []) as Array<{ participant_id: string; room_id: number | null; hotel_id: number | null }>;
  const idKamar = [...new Set(stays.map((s) => s.room_id).filter((id): id is number => id !== null))];
  const idHotel = [...new Set(stays.map((s) => s.hotel_id).filter((id): id is number => id !== null))];
  const [kamar, hotel] = await Promise.all([
    idKamar.length ? db.from("lodging_rooms").select("id,label,room_number").eq("event_id", eventId).in("id", idKamar) : { data: [] },
    idHotel.length ? db.from("lodging_hotels").select("id,name").eq("event_id", eventId).in("id", idHotel) : { data: [] },
  ]);
  const petaKamar = new Map(((kamar.data ?? []) as Array<{ id: number; label: string | null; room_number: string | null }>).map((k) => [k.id, k]));
  const petaHotel = new Map(((hotel.data ?? []) as Array<{ id: number; name: string }>).map((h) => [h.id, h.name]));
  return pilihan.map((orang) => ({
    ...orang,
    rooms: stays.filter((s) => s.participant_id === orang.id).map((s) => {
      const k = s.room_id !== null ? petaKamar.get(s.room_id) : undefined;
      return { room_id: s.room_id, hotel: s.hotel_id !== null ? petaHotel.get(s.hotel_id) ?? null : null, label: k?.label ?? null, room_number: k?.room_number ?? null };
    }),
  }));
}

async function kamarSingkat(db: Db, eventId: string, roomId: number) {
  const { data } = await db.from("lodging_rooms").select("label,room_number,hotel_id").eq("event_id", eventId).eq("id", roomId).maybeSingle();
  const k = data as { label: string | null; room_number: string | null; hotel_id: number } | null;
  if (!k) return null;
  const { data: h } = await db.from("lodging_hotels").select("name").eq("event_id", eventId).eq("id", k.hotel_id).maybeSingle();
  return { hotel: (h as { name: string } | null)?.name ?? "Hotel", label: k.label, room_number: k.room_number };
}

/** Nama penghuni kamar (tanpa peserta yang sudah dihapus dari sumber). */
async function namaPenghuni(db: Db, eventId: string, roomId: number) {
  const { data: penghuni } = await db.from("lodging_assignments").select("participant_id").eq("event_id", eventId).eq("room_id", roomId);
  const id = [...new Set(((penghuni ?? []) as Array<{ participant_id: string }>).map((p) => p.participant_id))];
  if (!id.length) return [];
  const { data } = await db.from("participants").select("id,name").eq("event_id", eventId).is("source_removed_at", null).in("id", id);
  return ((data ?? []) as Array<{ name: string }>).map((p) => p.name).sort();
}

type StayPenuh = { participant_id: string; hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null };

/**
 * Apakah penghuni `asal` boleh dipindah ke `tujuan` (kamar bernomor yang
 * sama): semua malam diketahui dan tidak ada yang bertabrakan. Mengembalikan
 * juga isi replace_stays: semua stay tiap orang yang pindah, hanya stay di
 * `asal` yang berganti kamar.
 */
async function cekGabung(db: Db, eventId: string, asal: KamarBot, tujuan: KamarBot, semuaKamar: KamarBot[], hotel: HotelBot[]) {
  const { data, error } = await db.from("lodging_assignments").select("participant_id,hotel_id,room_id,check_in_at,check_out_at")
    .eq("event_id", eventId).in("room_id", [asal.id, tujuan.id]);
  if (error) return "galat" as const;
  const baris = (data ?? []) as StayPenuh[];
  const peta = new Map(semuaKamar.map((k) => [k.id, k]));
  const h = hotel.find((x) => x.id === asal.hotel_id);
  const rentang = (st: StayPenuh) => rentangStay(st, peta.get(st.room_id ?? -1), h);
  const diAsal = baris.filter((b) => b.room_id === asal.id);
  const diTujuan = baris.filter((b) => b.room_id === tujuan.id);
  const pindah = [...new Set(diAsal.map((b) => b.participant_id))];
  const namaTujuan = await namaPenghuni(db, eventId, tujuan.id);
  // Tamu yang sudah di kamar tujuan pada malam lain (05-06 di 303, lalu
  // 06-08 di label baru) boleh: hasilnya dua stay di kamar yang sama, malam
  // tidak bertabrakan. Tabrakan tetap ditolak lewat bolehGabung.
  const rAsal = diAsal.map(rentang);
  const rTujuan = diTujuan.map(rentang);
  const boleh = bolehGabung(rAsal, rTujuan);
  if (!boleh) {
    const alasan = [...rAsal, ...rTujuan].some((r) => !r) ? "tanggal" : "bentrok";
    return { boleh, alasan, namaTujuan, pindah, items: [] };
  }
  const { data: semuaStay, error: galat } = await db.from("lodging_assignments").select("participant_id,hotel_id,room_id,check_in_at,check_out_at")
    .eq("event_id", eventId).in("participant_id", pindah);
  if (galat) return "galat" as const;
  const items = pindah.map((id) => ({
    participant_id: id,
    stays: ((semuaStay ?? []) as StayPenuh[]).filter((b) => b.participant_id === id).map((b) => ({
      hotel_id: b.hotel_id,
      room_id: b.room_id === asal.id ? tujuan.id : b.room_id,
      check_in_at: b.check_in_at,
      check_out_at: b.check_out_at,
    })),
  }));
  return { boleh, alasan: null, namaTujuan, pindah, items };
}
