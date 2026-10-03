import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { idDariQuery, klien } from "@/lib/logistik/server";

/**
 * Data induk logistik: hotel, kamar, bus, agenda bus, dan barang.
 *
 * Kelimanya tabel biasa tanpa aturan lintas baris, jadi satu route melayani
 * semuanya lewat tabel konfigurasi di bawah. Penempatan orang (siapa di kamar
 * mana, siapa di bus mana) TIDAK lewat sini: itu RPC di /penghuni dan
 * /penumpang, karena kapasitas dan jenis kelamin harus diperiksa dalam satu
 * transaksi dengan penulisannya.
 */

/** Teks opsional: kosong disimpan sebagai null, bukan string kosong. */
const teks = (maks: number) => z.string().trim().max(maks).nullish().transform((nilai) => (nilai ? nilai : null));
const waktu = z.string().datetime({ offset: true }).nullish().transform((nilai) => nilai ?? null);
const urutan = z.number().int().min(0).max(9999).optional();

type Jenis = {
  tabel: string;
  kolom: string;
  skema: z.ZodObject<z.ZodRawShape>;
  /** Kalimat saat indeks unik menolak (23505). */
  ganda?: string;
  /** Kalimat saat FK komposit menolak (23503): induknya milik acara lain atau sudah dihapus. */
  indukHilang?: string;
  /**
   * Alasan menolak penghapusan, atau null bila boleh. Dijalankan sebelum
   * menghapus: semua tabel ini `on delete cascade`, dan penghapusan yang ikut
   * membuang penempatan orang tidak bisa dikembalikan dari layar mana pun.
   */
  tahanHapus?: (eventId: string, id: number) => Promise<string | null>;
};

const JENIS: Record<string, Jenis> = {
  hotel: {
    tabel: "lodging_hotels",
    kolom: "id,name,address,map_url,check_in_at,check_out_at,sort_order",
    skema: z.object({
      name: z.string().trim().min(1).max(120),
      address: teks(300),
      map_url: z.string().trim().url("Tautan peta harus berupa alamat lengkap, mis. https://maps.app.goo.gl/...").max(500).nullish()
        .or(z.literal("")).transform((nilai) => (nilai ? nilai : null)),
      check_in_at: waktu,
      check_out_at: waktu,
      sort_order: urutan,
    }),
    tahanHapus: async (eventId, id) => {
      const { data } = await klien().from("lodging_rooms").select("id").eq("event_id", eventId).eq("hotel_id", id);
      const kamar = ((data ?? []) as Array<{ id: number }>).map((baris) => baris.id);
      if (kamar.length === 0) return null;
      const { count } = await klien().from("lodging_assignments").select("id", { head: true, count: "exact" })
        .eq("event_id", eventId).in("room_id", kamar);
      return (count ?? 0) > 0
        ? `Hotel ini masih punya ${count} penghuni. Pindahkan atau keluarkan mereka dulu, lalu hapus hotelnya.`
        : null;
    },
  },
  kamar: {
    tabel: "lodging_rooms",
    kolom: "id,hotel_id,room_number,room_type,capacity,floor,notes",
    skema: z.object({
      hotel_id: z.number().int().positive(),
      room_number: z.string().trim().min(1).max(40),
      room_type: teks(60),
      capacity: z.number().int().min(1).max(20),
      floor: teks(20),
      notes: teks(500),
    }),
    ganda: "Nomor kamar ini sudah ada di hotel yang sama.",
    indukHilang: "Hotelnya tidak ditemukan. Muat ulang halaman.",
    tahanHapus: async (eventId, id) => {
      const { count } = await klien().from("lodging_assignments").select("id", { head: true, count: "exact" })
        .eq("event_id", eventId).eq("room_id", id);
      return (count ?? 0) > 0 ? `Kamar ini masih punya ${count} penghuni. Keluarkan mereka dulu, lalu hapus kamarnya.` : null;
    },
  },
  bus: {
    tabel: "transport_vehicles",
    kolom: "id,code,capacity,plate_number,crew_contact,sort_order",
    skema: z.object({
      code: z.string().trim().min(1).max(40),
      capacity: z.number().int().min(1).max(200).nullable(),
      plate_number: teks(20),
      crew_contact: teks(200),
      sort_order: urutan,
    }),
    ganda: "Nama bus ini sudah dipakai. Beri nama lain, mis. Bus 4.",
    tahanHapus: async (eventId, id) => {
      const { count } = await klien().from("transport_assignments").select("id", { head: true, count: "exact" })
        .eq("event_id", eventId).eq("vehicle_id", id);
      return (count ?? 0) > 0
        ? `Bus ini masih dipakai ${count} penempatan (bus bawaan atau pengganti di agenda). Pindahkan penumpangnya dulu, lalu hapus busnya.`
        : null;
    },
  },
  agenda: {
    tabel: "transport_trips",
    kolom: "id,name,depart_at,origin,destination,meeting_point,follows_default,sort_order",
    skema: z.object({
      name: z.string().trim().min(1).max(120),
      depart_at: waktu,
      origin: teks(120),
      destination: teks(120),
      meeting_point: teks(200),
      follows_default: z.boolean(),
      sort_order: urutan,
    }),
    // Agenda boleh dihapus walau punya pengganti: penggantinya memang hanya
    // berarti untuk agenda itu, dan bus bawaan peserta tidak tersentuh.
  },
  barang: {
    tabel: "pickup_items",
    kolom: "id,name,size_field_key,pickup_note,sort_order",
    skema: z.object({
      name: z.string().trim().min(1).max(80),
      size_field_key: teks(40),
      pickup_note: teks(200),
      sort_order: urutan,
    }),
    ganda: "Nama barang ini sudah ada.",
    tahanHapus: async (eventId, id) => {
      const { count } = await klien().from("item_pickups").select("id", { head: true, count: "exact" })
        .eq("event_id", eventId).eq("item_id", id);
      return (count ?? 0) > 0
        ? `Barang ini sudah diserahkan ke ${count} peserta. Catatan penyerahannya ikut terhapus, jadi barang ini tidak bisa dihapus.`
        : null;
    },
  },
};

type Konteks = { params: Promise<{ jenis: string }> };

async function jenisDari(context: Konteks) {
  const { jenis } = await context.params;
  return Object.hasOwn(JENIS, jenis) ? JENIS[jenis] : null;
}

function galatTulis(jenis: Jenis, error: { code?: string | number }) {
  if (String(error.code) === "23505" && jenis.ganda) return apiError("VALIDATION_ERROR", 422, { message: jenis.ganda });
  if (String(error.code) === "23503" && jenis.indukHilang) return apiError("VALIDATION_ERROR", 422, { message: jenis.indukHilang });
  // Pelanggaran check constraint (kapasitas di luar rentang) sudah ditahan Zod;
  // yang lolos ke sini memang galat sistem.
  return apiError("INTERNAL_ERROR", 500);
}

export async function POST(request: Request, context: Konteks) {
  const jenis = await jenisDari(context);
  if (!jenis) return apiError("VALIDATION_ERROR", 404);
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = jenis.skema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await klien()
    .from(jenis.tabel)
    .insert({ ...parsed.data, event_id: auth.scope.event.id } as never)
    .select(jenis.kolom)
    .single();
  if (error) return galatTulis(jenis, error);
  return Response.json(data);
}

export async function PATCH(request: Request, context: Konteks) {
  const jenis = await jenisDari(context);
  if (!jenis) return apiError("VALIDATION_ERROR", 404);
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = jenis.skema.partial().extend({ id: z.number().int().positive() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, ...patch } = parsed.data as { id: number } & Record<string, unknown>;
  if (Object.keys(patch).length === 0) return apiError("VALIDATION_ERROR", 422);

  const { data, error } = await klien()
    .from(jenis.tabel)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    // event_id ikut disaring: id milik acara lain tidak boleh bisa diubah hanya
    // karena nomornya ditempelkan ke permintaan ini.
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .select(jenis.kolom)
    .maybeSingle();
  if (error) return galatTulis(jenis, error);
  if (!data) return apiError("VALIDATION_ERROR", 404, { message: "Data ini sudah tidak ada. Muat ulang halaman." });
  return Response.json(data);
}

export async function DELETE(request: Request, context: Konteks) {
  const jenis = await jenisDari(context);
  if (!jenis) return apiError("VALIDATION_ERROR", 404);
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const id = idDariQuery(request);
  if (!id) return apiError("VALIDATION_ERROR", 422);

  const alasan = await jenis.tahanHapus?.(auth.scope.event.id, id);
  if (alasan) return apiError("VALIDATION_ERROR", 422, { message: alasan });

  const { error } = await klien().from(jenis.tabel).delete().eq("id", id).eq("event_id", auth.scope.event.id);
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ ok: true });
}
