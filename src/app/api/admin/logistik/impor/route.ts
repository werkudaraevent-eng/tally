import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { barisPesertaBus, barisPesertaKereta, barisStaySekarang, LABEL_ARAH, rencanaBus, rencanaKamar, rencanaKereta, TEMPLAT, type JenisImpor, type TripImpor, type KeadaanAcara, IKUT, type Rencana } from "@/lib/logistik/impor";
import { bacaTiketKereta, klien, pesanRpc, semuaBaris } from "@/lib/logistik/server";
import { plural } from "@/lib/plural";
import { kolomSasaran } from "@/lib/sasaran-bagian";
import { malamIso } from "@/lib/logistik/stay";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";
import { textToCells, xlsxToCells } from "@/lib/undian-import";

/**
 * Impor Excel Logistik: rooming list dari hotel, daftar bus, dan tiket kereta.
 *
 * POST dengan `simpan` kosong hanya mengembalikan rencana (pratinjau). POST
 * dengan `simpan=1` dan berkas yang sama menyusun rencana ulang dari keadaan
 * terbaru lalu menuliskannya. Penempatan tetap lewat `assign_room` dan
 * `assign_bus`, jadi kapasitas dan jenis kelamin diperiksa database di
 * transaksi yang sama dengan penulisannya; rencana hanya menyaring yang pasti
 * ditolak supaya panitia melihatnya sebelum menekan Simpan.
 *
 * Tiket kereta tidak lewat RPC: tidak ada aturan lintas baris selain satu
 * tiket per orang per arah, yang dijaga indeks unik dan upsert.
 *
 * GET `?jenis=kamar|bus|kereta` mengunduh templatnya. `?jenis=kamar&isi=sekarang`
 * mengunduh stay yang sekarang tersimpan dalam bentuk templat yang sama, untuk
 * diubah di Excel lalu diimpor kembali. `?jenis=bus|kereta&isi=peserta`
 * mengunduh semua peserta aktif dalam bentuk templatnya (kereta dua baris per
 * orang), kendaraan atau tiket yang tersimpan sudah terisi, ditambah kolom
 * pilihan peserta sebagai "(info)" untuk filter di Excel. Berisi QR code:
 * admin saja, seperti route ini seluruhnya.
 */

const BATAS_BERKAS = 10 * 1024 * 1024;

/** Sama dengan pembanding di impor.ts: spasi dirapikan, huruf kecil. */
const kunci = (nilai: string | null) => (nilai ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const jenisDari = (nilai: unknown): JenisImpor | null => (nilai === "kamar" || nilai === "bus" || nilai === "kereta" ? nilai : null);

const NAMA_TEMPLAT: Record<JenisImpor, { sheet: string; berkas: string }> = {
  kamar: { sheet: "Rooming list", berkas: "room" },
  bus: { sheet: "Vehicle", berkas: "bus" },
  kereta: { sheet: "Trains", berkas: "train" },
};

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const jenis = jenisDari(new URL(request.url).searchParams.get("jenis"));
  if (!jenis) return apiError("VALIDATION_ERROR", 422);

  const minta = new URL(request.url).searchParams.get("isi");
  const sekarang = jenis === "kamar" && minta === "sekarang";
  const denganPeserta = jenis !== "kamar" && minta === "peserta";
  const isi = sekarang
    ? await muatStaySekarang(auth.scope.event.id, timeZoneOffset(normalizeTimeZone(auth.scope.event.time_zone)))
    : denganPeserta ? await muatPesertaUnduh(auth.scope.event, jenis) : TEMPLAT[jenis].contoh;
  if (isi === "belum") return apiError("VALIDATION_ERROR", 422, { message: "Train tickets need a database update first. Ask your Tally administrator to run the train tickets migration." });
  if (!isi) return apiError("INTERNAL_ERROR", 500);

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(NAMA_TEMPLAT[jenis].sheet);
  // Stay sekarang membawa judulnya sendiri: jumlah kolom Hotel N mengikuti orang
  // dengan stay terbanyak. Daftar peserta juga: kolom (info) mengikuti acara.
  const [judul, ...badan] = sekarang || denganPeserta ? isi : [TEMPLAT[jenis].judul, ...isi];
  sheet.addRow(judul);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  // Teks, bukan sel tanggal/angka: Excel tidak mengubah 05/11/2026 menjadi
  // tanggal Amerika dan QR code berawalan nol tetap utuh.
  for (const baris of badan) sheet.addRow(baris).eachCell((sel) => { sel.numFmt = "@"; });
  sheet.columns.forEach((kolom) => { kolom.width = 18; });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sekarang ? "current-stays" : `${NAMA_TEMPLAT[jenis].berkas}-${denganPeserta ? "participants" : "template"}`}.xlsx"`,
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
  if (!form || !jenis) return apiError("VALIDATION_ERROR", 422, { message: "Choose what to import: rooms, vehicles or trains." });
  if (!(file instanceof File) || file.size === 0) return apiError("VALIDATION_ERROR", 422, { message: "Choose an Excel or CSV file first." });
  if (file.size > BATAS_BERKAS) return apiError("VALIDATION_ERROR", 422, { message: "The file can be at most 10 MB." });

  // Jenis berkas dari ekstensi, bukan MIME: lihat readFileRequest di impor undian.
  const namaBerkas = file.name.toLowerCase();
  if (namaBerkas.endsWith(".xls")) return apiError("VALIDATION_ERROR", 422, { message: "The old .xls format is not supported. Open the file in Excel, then Save As .xlsx." });
  const xlsx = namaBerkas.endsWith(".xlsx") || namaBerkas.endsWith(".xlsm");
  if (!xlsx && !/\.(csv|txt|tsv)$/.test(namaBerkas)) return apiError("VALIDATION_ERROR", 422, { message: "The file must be .xlsx or .csv." });
  const sel = xlsx ? await xlsxToCells(await file.arrayBuffer()) : textToCells(await file.text());
  if (!sel) return apiError("VALIDATION_ERROR", 422, { message: "The Excel file could not be read. Check that it is not damaged or password-protected." });

  const acara = await muatKeadaan(eventId, jenis === "kereta", timeZoneOffset(normalizeTimeZone(auth.scope.event.time_zone)));
  if (acara === "belum") return apiError("VALIDATION_ERROR", 422, { message: "Train tickets need a database update first. Ask your Tally administrator to run the train tickets migration." });
  if (!acara) return apiError("INTERNAL_ERROR", 500);
  const rencana = jenis === "kamar" ? rencanaKamar(sel, acara) : jenis === "bus" ? rencanaBus(sel, acara) : rencanaKereta(sel, acara);
  if (rencana.galat) return apiError("VALIDATION_ERROR", 422, { message: rencana.galat });

  if (form.get("simpan") !== "1") return Response.json({ rencana });

  const hasil = jenis === "kamar"
    ? await simpanKamar(eventId, auth.user.id, rencana, acara)
    : jenis === "bus" ? await simpanBus(eventId, auth.user.id, rencana, acara) : await simpanKereta(eventId, auth.user.id, rencana, acara);
  if ("galat" in hasil) return apiError("VALIDATION_ERROR", 422, { message: hasil.galat });
  return Response.json({ rencana, hasil });
}

/** "belum" = impor kereta di database yang belum punya tabel `train_tickets`. */
async function muatKeadaan(eventId: string, denganKereta: boolean, offset: string): Promise<KeadaanAcara | null | "belum"> {
  const db = klien();
  const setelan = await db.from("lodging_settings").select("gender_field_key,enforce_same_gender").eq("event_id", eventId).maybeSingle();
  if (setelan.error) return null;
  const settings = (setelan.data as KeadaanAcara["settings"] | null) ?? { gender_field_key: null, enforce_same_gender: true };
  const [peserta, hotels, rooms, lodging, vehicles, transport, trips] = await Promise.all([
    semuaBaris<{ id: string; name: string; qr_code: string; extra: Record<string, unknown> | null }>(() =>
      db.from("participants").select("id,name,qr_code,extra").eq("event_id", eventId).is("source_removed_at", null).order("id")),
    semuaBaris<KeadaanAcara["hotels"][number]>(() => db.from("lodging_hotels").select("id,name,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
    semuaBaris<KeadaanAcara["rooms"][number]>(() => db.from("lodging_rooms").select("id,hotel_id,room_number,capacity").eq("event_id", eventId).order("id")),
    semuaBaris<KeadaanAcara["lodging"][number]>(() => db.from("lodging_assignments").select("id,participant_id,hotel_id,room_id,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
    semuaBaris<KeadaanAcara["vehicles"][number]>(() => db.from("transport_vehicles").select("id,code,capacity").eq("event_id", eventId).order("id")),
    semuaBaris<{ trip_id: number | null; participant_id: string; vehicle_id: number | null }>(() =>
      db.from("transport_assignments").select("trip_id,participant_id,vehicle_id").eq("event_id", eventId).order("id")),
    semuaBaris<TripImpor>(() => db.from("transport_trips").select("id,name,depart_at,follows_default").eq("event_id", eventId).order("id")),
  ]);
  if (!peserta || !hotels || !rooms || !lodging || !vehicles || !transport || !trips) return null;
  const kereta = denganKereta ? await bacaTiketKereta(eventId) : [];
  if (kereta === null) return "belum";
  if (kereta === "galat") return null;
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
    busBawaan: transport.filter((b): b is { trip_id: null; participant_id: string; vehicle_id: number } => b.trip_id === null && b.vehicle_id !== null),
    trips,
    busTrip: transport.filter((b): b is { trip_id: number; participant_id: string; vehicle_id: number | null } => b.trip_id !== null),
    kereta,
    offset,
  };
}

async function muatStaySekarang(eventId: string, offset: string): Promise<string[][] | null> {
  const db = klien();
  const [peserta, hotels, rooms, lodging] = await Promise.all([
    semuaBaris<{ id: string; name: string; qr_code: string }>(() =>
      db.from("participants").select("id,name,qr_code").eq("event_id", eventId).is("source_removed_at", null).order("id")),
    semuaBaris<{ id: number; name: string; sort_order: number; check_in_at: string | null; check_out_at: string | null }>(() =>
      db.from("lodging_hotels").select("id,name,sort_order,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
    semuaBaris<{ id: number; room_number: string; room_type: string | null; capacity: number }>(() =>
      db.from("lodging_rooms").select("id,room_number,room_type,capacity").eq("event_id", eventId).order("id")),
    semuaBaris<{ id: number; participant_id: string; hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null }>(() =>
      db.from("lodging_assignments").select("id,participant_id,hotel_id,room_id,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
  ]);
  if (!peserta || !hotels || !rooms || !lodging) return null;
  return barisStaySekarang({ peserta, hotels, rooms, lodging, offset });
}

/**
 * Peserta aktif untuk Download participant list. Dibaca per 1000 dengan
 * keyset (id > id terakhir), bukan offset: daftar ini dipakai untuk mengisi
 * tiket semua orang, jadi tidak boleh ada yang terlewat atau terulang.
 */
async function muatPesertaUnduh(event: { id: string; registration_form_config: unknown; time_zone: string | null }, jenis: "bus" | "kereta"): Promise<string[][] | null | "belum"> {
  const db = klien();
  const peserta: Array<{ id: string; name: string; qr_code: string; extra: Record<string, unknown> | null }> = [];
  for (let terakhir: string | null = null; ;) {
    let kueri = db.from("participants").select("id,name,qr_code,extra").eq("event_id", event.id).is("source_removed_at", null).order("id").limit(1000);
    if (terakhir) kueri = kueri.gt("id", terakhir);
    const { data, error } = await kueri;
    if (error || !Array.isArray(data)) return null;
    peserta.push(...(data as typeof peserta));
    if (data.length < 1000) break;
    terakhir = (data[data.length - 1] as { id: string }).id;
  }
  const info = kolomSasaran(event.registration_form_config).map(({ key, label }) => ({ key, label }));
  if (jenis === "kereta") {
    const kereta = await bacaTiketKereta(event.id);
    if (kereta === null) return "belum";
    if (kereta === "galat") return null;
    return barisPesertaKereta({ peserta, info, vehicles: [], busBawaan: [], trips: [], busTrip: [], offset: "+00:00", kereta });
  }
  const [vehicles, transport, trips] = await Promise.all([
    semuaBaris<{ id: number; code: string }>(() => db.from("transport_vehicles").select("id,code").eq("event_id", event.id).order("id")),
    semuaBaris<{ trip_id: number | null; participant_id: string; vehicle_id: number | null }>(() =>
      db.from("transport_assignments").select("trip_id,participant_id,vehicle_id").eq("event_id", event.id).order("id")),
    semuaBaris<TripImpor>(() => db.from("transport_trips").select("id,name,depart_at,follows_default").eq("event_id", event.id).order("id")),
  ]);
  if (!vehicles || !transport || !trips) return null;
  const busBawaan = transport.filter((b): b is { trip_id: null; participant_id: string; vehicle_id: number } => b.trip_id === null && b.vehicle_id !== null);
  const busTrip = transport.filter((b): b is { trip_id: number; participant_id: string; vehicle_id: number | null } => b.trip_id !== null);
  const offset = timeZoneOffset(normalizeTimeZone(event.time_zone));
  return barisPesertaBus({ peserta, info, vehicles, busBawaan, trips, busTrip, offset, kereta: [] });
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
    if (error) return { galat: "New hotels could not be created. Reload the page, then import again." };
    for (const hotel of (data ?? []) as Array<{ id: number; name: string }>) hotelId.set(kunci(hotel.name), hotel.id);
    dibuat.push(plural(rencana.hotelBaru.length, "hotel"));
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
      return { galat: error.code === "23505" ? "Someone else has just created a room from this file. Reload the page, then import again." : "New rooms could not be created." };
    }
    for (const kamar of (data ?? []) as Array<{ id: number; hotel_id: number; room_number: string }>) {
      kamarId.set(`${kamar.hotel_id}\u0000${kunci(kamar.room_number)}`, kamar.id);
    }
    dibuat.push(plural(rencana.kamarBaru.length, "room"));
  }

  // Semua stay akhir tiap orang ditulis dengan satu `replace_stays`: stay lama
  // diganti seluruhnya dan isi kamar diperiksa sesudah semuanya tertulis,
  // jadi orang yang bertukar kamar di berkas yang sama tidak tertolak "penuh".
  const nama = new Map(acara.peserta.map((orang) => [orang.id, orang.name]));
  const hotelById = new Map(acara.hotels.map((hotel) => [hotel.id, hotel]));
  const gagal: Array<{ nama: string; alasan: string }> = [];
  const items: Array<{ participant_id: string; stays: Array<{ hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null }> }> = [];
  for (const orang of rencana.akhir) {
    const stays = [];
    for (const stay of orang.stays) {
      const hotel = hotelId.get(kunci(stay.hotel));
      const room = stay.kamar === null ? null : kamarId.get(`${hotel}\u0000${kunci(stay.kamar)}`);
      if (hotel === undefined || room === undefined) break;
      const malam = stay.asli ?? (stay.malam ? malamIso(hotelById.get(hotel), stay.malam.masuk, stay.malam.keluar, acara.offset) : null);
      stays.push({ hotel_id: hotel, room_id: room, check_in_at: malam?.check_in_at ?? null, check_out_at: malam?.check_out_at ?? null });
    }
    if (stays.length !== orang.stays.length) gagal.push({ nama: nama.get(orang.participant_id) ?? orang.participant_id, alasan: "Hotel or room not found. Reload the page, then import again." });
    else items.push({ participant_id: orang.participant_id, stays });
  }

  const tulis = (daftar: typeof items) => db.rpc("replace_stays" as never, { p_event_id: eventId, p_items: daftar, p_actor: actor } as never);
  let masuk = 0;
  if (items.length > 0) {
    const { error } = await tulis(items);
    if (!error) masuk = items.length;
    else {
      // Satu orang yang tidak muat membatalkan seluruh panggilan. Tulis per
      // orang, lalu coba lagi yang tertolak penuh atau jenis kelamin: tempatnya
      // bisa jadi baru kosong setelah orang lain pindah.
      const bisaUlang = (e: { message?: string }) => /ROOM_FULL|ROOM_GENDER_MISMATCH/.test(String(e.message ?? ""));
      let sisa = items;
      for (let putaran = 0; putaran < 2 && sisa.length > 0; putaran++) {
        const ulang: Array<{ item: (typeof items)[number]; error: { message?: string; details?: string | null } }> = [];
        for (const item of sisa) {
          const { error: e } = await tulis([item]);
          if (!e) masuk += 1;
          else ulang.push({ item, error: e });
        }
        const lagi = putaran === 0 && ulang.length < sisa.length ? ulang.filter((u) => bisaUlang(u.error)) : [];
        for (const u of ulang) if (!lagi.includes(u)) gagal.push({ nama: nama.get(u.item.participant_id) ?? u.item.participant_id, alasan: pesanRpc(u.error) ?? "Could not save." });
        sisa = lagi.map((u) => u.item);
      }
    }
  }
  return { masuk, dibuat, gagal };
}

async function simpanBus(eventId: string, actor: string, rencana: Rencana, acara: KeadaanAcara): Promise<Hasil> {
  const db = klien();
  const dibuat: string[] = [];
  const busId = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus.id]));
  if (rencana.busBaru.length > 0) {
    const { data, error } = await db.from("transport_vehicles")
      .insert(rencana.busBaru.map((code, i) => ({ event_id: eventId, code, sort_order: acara.vehicles.length + i })) as never)
      .select("id,code");
    if (error) return { galat: error.code === "23505" ? "Someone else has just created a vehicle from this file. Reload the page, then import again." : "New vehicles could not be created." };
    for (const bus of (data ?? []) as Array<{ id: number; code: string }>) busId.set(kunci(bus.code), bus.id);
    dibuat.push(plural(rencana.busBaru.length, "vehicle"));
  }

  // Setiap penulisan (kendaraan utama, pengecualian trip, kembali ke utama)
  // menjadi satu langkah. `assign_bus` memeriksa kapasitas sesudah tiap
  // panggilan, jadi urutan berpengaruh: tempat yang dikosongkan baris lain di
  // berkas yang sama baru tersedia setelah baris itu ditulis. Langkah yang
  // ditolak karena penuh dicoba lagi selama putaran sebelumnya masih ada yang
  // masuk, seperti impor kamar.
  type Langkah = { trip: number | null; vehicle: number | null | typeof IKUT; ids: string[] };
  const langkah: Langkah[] = [];
  for (const kelompok of rencana.busTrip) {
    const vehicle = kelompok.tujuan === null || kelompok.tujuan === IKUT ? kelompok.tujuan : busId.get(kunci(kelompok.tujuan));
    if (vehicle !== undefined) langkah.push({ trip: kelompok.trip_id, vehicle, ids: kelompok.participant_ids });
  }
  for (const kelompok of rencana.penempatan) {
    const vehicle = busId.get(kunci(kelompok.tujuan));
    if (vehicle !== undefined) langkah.push({ trip: null, vehicle, ids: kelompok.participant_ids });
  }
  const panggil = (l: Langkah, ids: string[]) => l.vehicle === IKUT
    ? db.rpc("reset_bus_override" as never, { p_event_id: eventId, p_trip_id: l.trip, p_participant_ids: ids, p_actor: actor } as never)
    : db.rpc("assign_bus" as never, { p_event_id: eventId, p_trip_id: l.trip, p_vehicle_id: l.vehicle, p_participant_ids: ids, p_actor: actor } as never);
  const penuh = (error: { message?: string }) => /VEHICLE_FULL/.test(String(error.message ?? ""));

  const nama = new Map(acara.peserta.map((orang) => [orang.id, orang.name]));
  let masuk = 0;
  let antre = langkah;
  const gagal: Array<{ pid: string; error: { message?: string } }> = [];
  for (;;) {
    const ulang: Array<Langkah & { error: { message?: string } }> = [];
    let maju = false;
    for (const l of antre) {
      const { error } = await panggil(l, l.ids);
      if (!error) { masuk += l.ids.length; maju = true; continue; }
      // Satu panggilan menulis satu kelompok sekaligus. Bila ditolak, sisanya
      // dicoba satu per satu supaya yang muat tetap masuk.
      for (const pid of l.ids) {
        const satu = await panggil(l, [pid]);
        if (!satu.error) { masuk += 1; maju = true; continue; }
        if (penuh(satu.error)) ulang.push({ ...l, ids: [pid], error: satu.error });
        else gagal.push({ pid, error: satu.error });
      }
    }
    if (!maju || ulang.length === 0) {
      gagal.push(...ulang.map((l) => ({ pid: l.ids[0], error: l.error })));
      break;
    }
    antre = ulang;
  }
  return { masuk, dibuat, gagal: gagal.map((g) => ({ nama: nama.get(g.pid) ?? g.pid, alasan: pesanRpc(g.error) ?? "Could not save." })) };
}

/** Tiket per upsert. Jauh di bawah batas ukuran permintaan PostgREST. */
const POTONG_TIKET = 500;

async function simpanKereta(eventId: string, actor: string, rencana: Rencana, acara: KeadaanAcara): Promise<Hasil> {
  const db = klien();
  const nama = new Map(acara.peserta.map((orang) => [orang.id, orang.name]));
  const sekarang = new Date().toISOString();
  const baris = rencana.tiket.map((tiket) => ({ ...tiket, event_id: eventId, created_by: actor, updated_at: sekarang }));
  const tulis = (potong: typeof baris) =>
    db.from("train_tickets").upsert(potong as never, { onConflict: "event_id,participant_id,direction" });
  let masuk = 0;
  const gagal: Array<{ nama: string; alasan: string }> = [];
  for (let i = 0; i < baris.length; i += POTONG_TIKET) {
    const potong = baris.slice(i, i + POTONG_TIKET);
    const { error } = await tulis(potong);
    if (!error) { masuk += potong.length; continue; }
    // Satu peserta yang baru dihapus (FK) menolak seluruh potongan. Sisanya
    // dicoba satu per satu supaya yang sah tetap tersimpan.
    for (const satu of potong) {
      const hasil = await tulis([satu]);
      if (!hasil.error) { masuk += 1; continue; }
      gagal.push({
        nama: `${nama.get(satu.participant_id) ?? satu.participant_id} (${LABEL_ARAH[satu.direction]})`,
        alasan: String(hasil.error.code) === "23503" ? "This participant was deleted. Reload the page." : "Could not save.",
      });
    }
  }
  return { masuk, dibuat: [], gagal };
}
