import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { rencanaBus, rencanaKamar, TEMPLAT, type JenisImpor, type KeadaanAcara, type Rencana } from "@/lib/logistik/impor";
import { klien, pesanRpc, semuaBaris } from "@/lib/logistik/server";
import { textToCells, xlsxToCells } from "@/lib/undian-import";

/**
 * Impor Excel Logistik: rooming list dari hotel, dan daftar bus.
 *
 * POST dengan `simpan` kosong hanya mengembalikan rencana (pratinjau). POST
 * dengan `simpan=1` dan berkas yang sama menyusun rencana ulang dari keadaan
 * terbaru lalu menuliskannya. Penempatan tetap lewat `assign_room` dan
 * `assign_bus`, jadi kapasitas dan jenis kelamin diperiksa database di
 * transaksi yang sama dengan penulisannya; rencana hanya menyaring yang pasti
 * ditolak supaya panitia melihatnya sebelum menekan Simpan.
 *
 * GET `?jenis=kamar|bus` mengunduh templatnya.
 */

const BATAS_BERKAS = 10 * 1024 * 1024;

/** Sama dengan pembanding di impor.ts: spasi dirapikan, huruf kecil. */
const kunci = (nilai: string | null) => (nilai ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const jenisDari = (nilai: unknown): JenisImpor | null => (nilai === "kamar" || nilai === "bus" ? nilai : null);

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const jenis = jenisDari(new URL(request.url).searchParams.get("jenis"));
  if (!jenis) return apiError("VALIDATION_ERROR", 422);

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(jenis === "kamar" ? "Rooming list" : "Bus");
  sheet.addRow(TEMPLAT[jenis].judul);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const baris of TEMPLAT[jenis].contoh) sheet.addRow(baris);
  sheet.columns.forEach((kolom) => { kolom.width = 18; });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="templat-${jenis === "kamar" ? "kamar" : "bus"}.xlsx"`,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const form = await request.formData().catch(() => null);
  const jenis = jenisDari(form?.get("jenis"));
  const file = form?.get("file");
  if (!form || !jenis) return apiError("VALIDATION_ERROR", 422, { message: "Pilih jenis impor: kamar atau bus." });
  if (!(file instanceof File) || file.size === 0) return apiError("VALIDATION_ERROR", 422, { message: "Pilih berkas Excel atau CSV dulu." });
  if (file.size > BATAS_BERKAS) return apiError("VALIDATION_ERROR", 422, { message: "Ukuran berkas maksimal 10 MB." });

  // Jenis berkas dari ekstensi, bukan MIME: lihat readFileRequest di impor undian.
  const namaBerkas = file.name.toLowerCase();
  if (namaBerkas.endsWith(".xls")) return apiError("VALIDATION_ERROR", 422, { message: "Format .xls lama tidak didukung. Buka di Excel lalu Save As .xlsx." });
  const xlsx = namaBerkas.endsWith(".xlsx") || namaBerkas.endsWith(".xlsm");
  if (!xlsx && !/\.(csv|txt|tsv)$/.test(namaBerkas)) return apiError("VALIDATION_ERROR", 422, { message: "Format harus .xlsx atau .csv." });
  const sel = xlsx ? await xlsxToCells(await file.arrayBuffer()) : textToCells(await file.text());
  if (!sel) return apiError("VALIDATION_ERROR", 422, { message: "Berkas Excel tidak terbaca. Pastikan tidak rusak atau terkunci kata sandi." });

  const acara = await muatKeadaan(eventId);
  if (!acara) return apiError("INTERNAL_ERROR", 500);
  const rencana = jenis === "kamar" ? rencanaKamar(sel, acara) : rencanaBus(sel, acara);
  if (rencana.galat) return apiError("VALIDATION_ERROR", 422, { message: rencana.galat });

  if (form.get("simpan") !== "1") return Response.json({ rencana });

  const hasil = jenis === "kamar" ? await simpanKamar(eventId, auth.user.id, rencana, acara) : await simpanBus(eventId, auth.user.id, rencana, acara);
  if ("galat" in hasil) return apiError("VALIDATION_ERROR", 422, { message: hasil.galat });
  return Response.json({ rencana, hasil });
}

async function muatKeadaan(eventId: string): Promise<KeadaanAcara | null> {
  const db = klien();
  const setelan = await db.from("lodging_settings").select("gender_field_key,enforce_same_gender").eq("event_id", eventId).maybeSingle();
  if (setelan.error) return null;
  const settings = (setelan.data as KeadaanAcara["settings"] | null) ?? { gender_field_key: null, enforce_same_gender: true };
  const [peserta, hotels, rooms, lodging, vehicles, transport] = await Promise.all([
    semuaBaris<{ id: string; name: string; qr_code: string; extra: Record<string, unknown> | null }>(() =>
      db.from("participants").select("id,name,qr_code,extra").eq("event_id", eventId).is("source_removed_at", null).order("id")),
    semuaBaris<KeadaanAcara["hotels"][number]>(() => db.from("lodging_hotels").select("id,name").eq("event_id", eventId).order("id")),
    semuaBaris<KeadaanAcara["rooms"][number]>(() => db.from("lodging_rooms").select("id,hotel_id,room_number,capacity").eq("event_id", eventId).order("id")),
    semuaBaris<KeadaanAcara["lodging"][number]>(() => db.from("lodging_assignments").select("participant_id,room_id").eq("event_id", eventId).order("id")),
    semuaBaris<KeadaanAcara["vehicles"][number]>(() => db.from("transport_vehicles").select("id,code,capacity").eq("event_id", eventId).order("id")),
    semuaBaris<{ participant_id: string; vehicle_id: number | null }>(() =>
      db.from("transport_assignments").select("participant_id,vehicle_id").eq("event_id", eventId).is("trip_id", null).order("id")),
  ]);
  if (!peserta || !hotels || !rooms || !lodging || !vehicles || !transport) return null;
  const kunci = settings.gender_field_key;
  return {
    peserta: peserta.map((orang) => {
      const nilai = kunci ? orang.extra?.[kunci] : null;
      return { id: orang.id, name: orang.name, qr_code: orang.qr_code, gender: typeof nilai === "string" && nilai.trim() ? nilai.trim() : null };
    }),
    hotels,
    rooms,
    lodging,
    settings,
    vehicles,
    busBawaan: transport.filter((b): b is { participant_id: string; vehicle_id: number } => b.vehicle_id !== null),
  };
}

type Hasil = { masuk: number; gagal: Array<{ nama: string; alasan: string }>; dibuat: string[] } | { galat: string };

async function simpanKamar(eventId: string, actor: string, rencana: Rencana, acara: KeadaanAcara): Promise<Hasil> {
  const db = klien();
  const dibuat: string[] = [];
  const hotelId = new Map(acara.hotels.map((hotel) => [kunci(hotel.name), hotel.id]));

  if (rencana.hotelBaru.length > 0) {
    const { data, error } = await db.from("lodging_hotels")
      .insert(rencana.hotelBaru.map((name, i) => ({ event_id: eventId, name, sort_order: acara.hotels.length + i })) as never)
      .select("id,name");
    if (error) return { galat: "Hotel baru gagal dibuat. Muat ulang halaman, lalu impor lagi." };
    for (const hotel of (data ?? []) as Array<{ id: number; name: string }>) hotelId.set(kunci(hotel.name), hotel.id);
    dibuat.push(`${rencana.hotelBaru.length} hotel`);
  }

  const kamarId = new Map(acara.rooms.map((kamar) => [`${kamar.hotel_id}\u0000${kunci(kamar.room_number)}`, kamar.id]));
  if (rencana.kamarBaru.length > 0) {
    const { data, error } = await db.from("lodging_rooms")
      .insert(rencana.kamarBaru.map((kamar) => ({
        event_id: eventId,
        hotel_id: hotelId.get(kunci(kamar.hotel)),
        room_number: kamar.nomor,
        room_type: kamar.tipe,
        capacity: kamar.kapasitas,
      })) as never)
      .select("id,hotel_id,room_number");
    if (error) {
      return { galat: error.code === "23505" ? "Ada kamar di berkas yang baru saja dibuat orang lain. Muat ulang halaman, lalu impor lagi." : "Kamar baru gagal dibuat." };
    }
    for (const kamar of (data ?? []) as Array<{ id: number; hotel_id: number; room_number: string }>) {
      kamarId.set(`${kamar.hotel_id}\u0000${kunci(kamar.room_number)}`, kamar.id);
    }
    dibuat.push(`${rencana.kamarBaru.length} kamar`);
  }

  const nama = new Map(acara.peserta.map((orang) => [orang.id, orang.name]));
  const antre: Antre[] = [];
  for (const kelompok of rencana.penempatan) {
    const room = kamarId.get(`${hotelId.get(kunci(kelompok.hotel))}\u0000${kunci(kelompok.tujuan)}`);
    if (room === undefined) continue;
    for (const pid of kelompok.participant_ids) antre.push({ pid, room });
  }

  let masuk = 0;
  const coba = async (daftar: Antre[]) => {
    const gagal: Array<Antre & { error: { message?: string; details?: string | null } }> = [];
    for (const { pid, room } of daftar) {
      const { error } = await db.rpc("assign_room" as never, { p_event_id: eventId, p_room_id: room, p_participant_id: pid, p_actor: actor } as never);
      if (error) gagal.push({ pid, room, error });
      else masuk += 1;
    }
    return gagal;
  };
  // Orang yang bertukar kamar di berkas yang sama bisa ditolak "penuh" atau
  // "jenis kelamin berbeda" hanya karena penghuni lamanya belum sempat keluar.
  // Yang begitu dicoba sekali lagi setelah putaran pertama selesai.
  const bisaUlang = (error: { message?: string }) => /ROOM_FULL|ROOM_GENDER_MISMATCH/.test(String(error.message ?? ""));
  let gagal = await coba(antre);
  if (gagal.length < antre.length && gagal.some((g) => bisaUlang(g.error))) {
    gagal = gagal.filter((g) => !bisaUlang(g.error)).concat(await coba(gagal.filter((g) => bisaUlang(g.error))));
  }
  return { masuk, dibuat, gagal: gagal.map((g) => ({ nama: nama.get(g.pid) ?? g.pid, alasan: pesanRpc(g.error) ?? "Gagal disimpan." })) };
}

type Antre = { pid: string; room: number };

async function simpanBus(eventId: string, actor: string, rencana: Rencana, acara: KeadaanAcara): Promise<Hasil> {
  const db = klien();
  const dibuat: string[] = [];
  const busId = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus.id]));
  if (rencana.busBaru.length > 0) {
    const { data, error } = await db.from("transport_vehicles")
      .insert(rencana.busBaru.map((code, i) => ({ event_id: eventId, code, sort_order: acara.vehicles.length + i })) as never)
      .select("id,code");
    if (error) return { galat: error.code === "23505" ? "Ada bus di berkas yang baru saja dibuat orang lain. Muat ulang halaman, lalu impor lagi." : "Bus baru gagal dibuat." };
    for (const bus of (data ?? []) as Array<{ id: number; code: string }>) busId.set(kunci(bus.code), bus.id);
    dibuat.push(`${rencana.busBaru.length} bus`);
  }

  const nama = new Map(acara.peserta.map((orang) => [orang.id, orang.name]));
  let masuk = 0;
  const gagal: Array<{ nama: string; alasan: string }> = [];
  for (const kelompok of rencana.penempatan) {
    const vehicle = busId.get(kunci(kelompok.tujuan));
    if (vehicle === undefined) continue;
    const panggil = (ids: string[]) => db.rpc("assign_bus" as never, { p_event_id: eventId, p_trip_id: null, p_vehicle_id: vehicle, p_participant_ids: ids, p_actor: actor } as never);
    const { error } = await panggil(kelompok.participant_ids);
    if (!error) { masuk += kelompok.participant_ids.length; continue; }
    // `assign_bus` menulis satu bus sekaligus. Bila ditolak (biasanya agenda
    // yang sudah penuh), sisanya dicoba satu per satu supaya yang muat tetap masuk.
    for (const pid of kelompok.participant_ids) {
      const satu = await panggil([pid]);
      if (satu.error) gagal.push({ nama: nama.get(pid) ?? pid, alasan: pesanRpc(satu.error) ?? "Gagal disimpan." });
      else masuk += 1;
    }
  }
  return { masuk, dibuat, gagal };
}
