import { rencanaBatal, jejakStay, labelSementara, staysPerOrang, KOLOM_BUAT, KOLOM_UBAH, type KamarJejak, type Sebelum, type Sesudah, type StayJejak } from "@/lib/logistik/batal-impor";
import { klien, pesanRpc, semuaBaris, tabelBelumAda } from "@/lib/logistik/server";

/**
 * Jejak impor Hotel stays (`logistics_imports`) dan undo-nya. Logika
 * pemilihannya ada di batal-impor.ts; berkas ini hanya membaca dan menulis.
 *
 * Sebelum migrasi 202611090010 tabelnya belum ada: impor tetap tersimpan
 * tanpa jejak, dan tidak ada yang bisa di-undo.
 */

/** Impor yang bisa di-undo: yang terakhir, belum dibatalkan, paling lama 7 hari. */
export const UMUR_UNDO_MS = 7 * 24 * 60 * 60 * 1000;

type Lodging = { participant_id: string; hotel_id: number; room_id: number | null; check_in_at?: string | null; check_out_at?: string | null };

export async function bacaKamarDanStay(eventId: string): Promise<{ rooms: KamarJejak[]; lodging: Lodging[] } | null> {
  const db = klien();
  const [rooms, lodging] = await Promise.all([
    semuaBaris<KamarJejak>(() => db.from("lodging_rooms").select("*").eq("event_id", eventId).order("id")),
    semuaBaris<Lodging>(() => db.from("lodging_assignments").select("participant_id,hotel_id,room_id,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
  ]);
  return rooms && lodging ? { rooms, lodging } : null;
}

const potongKamar = (k: KamarJejak): KamarJejak => {
  const hasil: Record<string, unknown> = { id: Number(k.id) };
  for (const kolom of KOLOM_BUAT) hasil[kolom] = (k as Record<string, unknown>)[kolom] ?? null;
  return hasil as KamarJejak;
};

/** `before` dari keadaan yang dibaca untuk rencana impor (sebelum ditulis). */
export function jejakSebelum(roomIds: number[], orangIds: string[], rooms: KamarJejak[], lodging: Lodging[]): Sebelum {
  const ids = new Set(roomIds.map(Number));
  return { rooms: rooms.filter((k) => ids.has(Number(k.id))).map(potongKamar), stays: staysPerOrang(orangIds, lodging) };
}

/**
 * Menyimpan jejak sesudah impor ditulis. Mengembalikan id jejak, atau null
 * bila tabelnya belum ada atau penulisannya gagal (impornya sendiri sudah
 * tersimpan; hanya undo-nya yang tidak tersedia).
 */
export async function catatImpor(input: {
  eventId: string;
  userId: string;
  fileName: string;
  aiRunId: number | null;
  sebelum: Sebelum;
  roomIds: number[];
  orangIds: string[];
  roomsCreated: number[];
  hotelsCreated: number[];
}): Promise<number | null> {
  const kini = await bacaKamarDanStay(input.eventId);
  if (!kini) return null;
  const ada = new Set(kini.rooms.map((k) => Number(k.id)));
  const ids = new Set(input.roomIds.map(Number));
  const sesudah: Sesudah = {
    rooms: kini.rooms.filter((k) => ids.has(Number(k.id))).map(potongKamar),
    stays: staysPerOrang(input.orangIds, kini.lodging),
    rooms_created: input.roomsCreated,
    hotels_created: input.hotelsCreated,
    rooms_deleted: input.roomIds.filter((id) => !ada.has(Number(id))),
  };
  const { data, error } = await klien().from("logistics_imports").insert({
    event_id: input.eventId,
    user_id: input.userId,
    kind: "stays",
    file_name: input.fileName.slice(0, 200) || null,
    ai_run_id: input.aiRunId,
    before: input.sebelum,
    after: sesudah,
  } as never).select("id").single();
  if (error || !data) {
    if (!tabelBelumAda(error)) console.error("logistics_imports insert failed", error?.code);
    return null;
  }
  return Number((data as { id: number }).id);
}

export type ImporTerakhir = {
  id: number;
  file_name: string | null;
  created_at: string;
  user_name: string | null;
  ai: boolean;
};

type BarisJejak = { id: number; event_id: string; user_id: string | null; created_at: string; file_name: string | null; ai_run_id: number | null; before: Sebelum; after: Sesudah; undone_at: string | null };

/** Jejak terakhir acara ini (yang terbaru, apa pun statusnya). "belum" = tabel belum ada. */
async function jejakTerakhir(eventId: string): Promise<BarisJejak | null | "belum" | "galat"> {
  const { data, error } = await klien().from("logistics_imports")
    .select("id,event_id,user_id,created_at,file_name,ai_run_id,before,after,undone_at")
    .eq("event_id", eventId).eq("kind", "stays")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  if (error) return tabelBelumAda(error) ? "belum" : "galat";
  return ((data ?? [])[0] as BarisJejak | undefined) ?? null;
}

const bisaDiundo = (baris: BarisJejak) => !baris.undone_at && Date.now() - Date.parse(baris.created_at) < UMUR_UNDO_MS;

/** Impor yang bisa di-undo sekarang, untuk baris "Last import" di dialog. */
export async function imporTerakhirBisaUndo(eventId: string): Promise<ImporTerakhir | null> {
  const baris = await jejakTerakhir(eventId);
  if (!baris || typeof baris === "string" || !bisaDiundo(baris)) return null;
  let nama: string | null = null;
  if (baris.user_id) {
    const { data } = await klien().from("users").select("username").eq("id", baris.user_id).maybeSingle();
    nama = (data as { username?: string | null } | null)?.username ?? null;
  }
  return { id: baris.id, file_name: baris.file_name, created_at: baris.created_at, user_name: nama, ai: baris.ai_run_id !== null };
}

export type HasilBatal = {
  /** Orang yang stay-nya kembali seperti sebelum impor. */
  orang: number;
  /** Kamar yang nomor/labelnya kembali, atau dibuat lagi. */
  kamar: number;
  /** Kamar dan hotel buatan impor yang dihapus karena kosong (pratinjau: yang akan dihapus bila kosong). */
  dihapus: number;
  hotelDihapus: number;
  /** Dibiarkan karena berubah sesudah impor, atau tertolak saat ditulis. */
  dilewati: Array<{ nama: string; alasan: string }>;
};

/**
 * Pratinjau (`terapkan` false) atau undo impor `id`. Hanya jejak terakhir
 * yang belum dibatalkan yang diterima; yang lebih lama ditolak "STALE".
 */
export async function batalkanImpor(eventId: string, actor: string, id: number, terapkan: boolean): Promise<HasilBatal | "STALE" | "galat"> {
  const baris = await jejakTerakhir(eventId);
  if (baris === "galat" || baris === "belum") return "galat";
  if (!baris || baris.id !== id || !bisaDiundo(baris)) return "STALE";
  const kini = await bacaKamarDanStay(eventId);
  if (!kini) return "galat";
  const db = klien();

  const orangIds = Object.keys(baris.before.stays ?? {});
  const sekarang = { rooms: kini.rooms, stays: staysPerOrang(orangIds, kini.lodging) };
  const rencana = rencanaBatal(baris.before, baris.after, sekarang);

  // Nama untuk daftar yang dilewati.
  const perluNama = [...rencana.orangDilewati];
  const nama = new Map<string, string>();
  for (let i = 0; i < perluNama.length; i += 200) {
    const { data } = await db.from("participants").select("id,name").eq("event_id", eventId).in("id", perluNama.slice(i, i + 200));
    for (const p of (data ?? []) as Array<{ id: string; name: string }>) nama.set(p.id, p.name);
  }
  const kamarNama = new Map([...baris.before.rooms, ...kini.rooms].map((k) => [Number(k.id), k.room_number ?? k.label ?? `#${k.id}`]));
  const dilewati: HasilBatal["dilewati"] = [
    ...rencana.orangDilewati.map((o) => ({ nama: nama.get(o) ?? "Participant", alasan: "Their stays changed after the import." })),
    ...rencana.kamarDilewati.map((k) => ({ nama: `Room ${kamarNama.get(k) ?? k}`, alasan: "Its number or label changed after the import." })),
  ];

  if (!terapkan) {
    return { orang: rencana.stays.length, kamar: rencana.kamarKembali.length + rencana.kamarBuatLagi.length, dihapus: rencana.kamarHapus.length, hotelDihapus: rencana.hotelHapus.length, dilewati };
  }

  // Diklaim dulu, supaya dua admin yang menekan Undo bersamaan tidak
  // menjalankannya dua kali.
  const klaim = await db.from("logistics_imports").update({ undone_at: new Date().toISOString(), undone_by: actor } as never)
    .eq("id", id).eq("event_id", eventId).is("undone_at", null).select("id");
  if (klaim.error) return "galat";
  if (!Array.isArray(klaim.data) || klaim.data.length === 0) return "STALE";

  const sekarangIso = () => new Date().toISOString();
  let kamar = 0;
  const kini_ = new Map(kini.rooms.map((k) => [Number(k.id), k]));

  // 1. Kamar yang nilai lamanya sedang dipakai kamar lain di rencana ini dilepas dulu.
  const dilepas = new Set<number>();
  for (const rid of rencana.duaTahap) {
    const { error } = await db.from("lodging_rooms").update({ room_number: null, label: labelSementara(rid), updated_at: sekarangIso() } as never).eq("id", rid).eq("event_id", eventId);
    if (!error) dilepas.add(rid);
  }

  // 2. Kamar yang dihapus impor dibuat lagi; id barunya dipetakan dari id lama.
  const idBaru = new Map<number, number>();
  for (const k of rencana.kamarBuatLagi) {
    const isi: Record<string, unknown> = { event_id: eventId };
    for (const kolom of KOLOM_BUAT) isi[kolom] = (k as Record<string, unknown>)[kolom] ?? null;
    if (isi.capacity === null) delete isi.capacity;
    const { data, error } = await db.from("lodging_rooms").insert(isi as never).select("id").single();
    if (error || !data) dilewati.push({ nama: `Room ${k.room_number ?? k.label ?? k.id}`, alasan: "Could not be created again." });
    else { idBaru.set(Number(k.id), Number((data as { id: number }).id)); kamar += 1; }
  }

  // 3. Stay dikembalikan, room_id kamar yang dibuat lagi diganti id barunya.
  const dibuatLagi = new Set(rencana.kamarBuatLagi.map((k) => Number(k.id)));
  const items: Array<{ participant_id: string; stays: StayJejak[] }> = [];
  for (const item of rencana.stays) {
    const hilang = item.stays.some((s) => s.room_id !== null && dibuatLagi.has(Number(s.room_id)) && !idBaru.has(Number(s.room_id)));
    if (hilang) { dilewati.push({ nama: item.participant_id, alasan: "Their old room could not be created again." }); continue; }
    items.push({ participant_id: item.participant_id, stays: item.stays.map((s) => ({ ...jejakStay(s), room_id: s.room_id === null ? null : idBaru.get(Number(s.room_id)) ?? Number(s.room_id) })) });
  }
  const tulis = (daftar: typeof items) => db.rpc("replace_stays" as never, { p_event_id: eventId, p_items: daftar, p_actor: actor } as never);
  let orang = 0;
  const gagalOrang: Array<{ id: string; alasan: string }> = [];
  if (items.length > 0) {
    const { error } = await tulis(items);
    if (!error) orang = items.length;
    else {
      // Seperti impor: per orang, lalu sekali lagi yang tertolak penuh atau jenis kelamin.
      const bisaUlang = (e: { message?: string }) => /ROOM_FULL|ROOM_GENDER_MISMATCH/.test(String(e.message ?? ""));
      let sisa = items;
      for (let putaran = 0; putaran < 2 && sisa.length > 0; putaran++) {
        const ulang: Array<{ item: (typeof items)[number]; error: { message?: string; details?: string | null } }> = [];
        for (const item of sisa) {
          const { error: e } = await tulis([item]);
          if (!e) orang += 1;
          else ulang.push({ item, error: e });
        }
        const lagi = putaran === 0 && ulang.length < sisa.length ? ulang.filter((u) => bisaUlang(u.error)) : [];
        for (const u of ulang) if (!lagi.includes(u)) gagalOrang.push({ id: u.item.participant_id, alasan: pesanRpc(u.error) ?? "Could not be put back." });
        sisa = lagi.map((u) => u.item);
      }
    }
  }

  // 4. Kamar buatan impor yang kini kosong dihapus; yang masih berpenghuni tetap.
  let dihapus = 0;
  for (const rid of rencana.kamarHapus) {
    const { count, error } = await db.from("lodging_assignments").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("room_id", rid);
    if (error || count !== 0) continue;
    const hapus = await db.from("lodging_rooms").delete().eq("id", rid).eq("event_id", eventId).select("id");
    if (!hapus.error && Array.isArray(hapus.data) && hapus.data.length > 0) dihapus += 1;
  }

  // 5. Kolom kamar lama. Bila tertolak, kamar yang sempat dilepas kembali ke isinya sesudah impor.
  for (const k of rencana.kamarKembali) {
    const isi: Record<string, unknown> = { updated_at: sekarangIso() };
    for (const kolom of KOLOM_UBAH) isi[kolom] = (k as Record<string, unknown>)[kolom] ?? null;
    const { error } = await db.from("lodging_rooms").update(isi as never).eq("id", k.id).eq("event_id", eventId);
    if (!error) { kamar += 1; continue; }
    dilewati.push({ nama: `Room ${k.room_number ?? k.label ?? k.id}`, alasan: error.code === "23505" ? "Another room now has its old number or label." : "Could not be put back." });
    const asal = kini_.get(Number(k.id));
    if (dilepas.has(Number(k.id)) && asal) {
      const balik: Record<string, unknown> = { updated_at: sekarangIso() };
      for (const kolom of KOLOM_UBAH) balik[kolom] = (asal as Record<string, unknown>)[kolom] ?? null;
      await db.from("lodging_rooms").update(balik as never).eq("id", k.id).eq("event_id", eventId);
    }
  }

  // 6. Hotel buatan impor yang tidak lagi punya kamar atau stay.
  let hotelDihapus = 0;
  for (const hid of rencana.hotelHapus) {
    const [r, s] = await Promise.all([
      db.from("lodging_rooms").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("hotel_id", hid),
      db.from("lodging_assignments").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("hotel_id", hid),
    ]);
    if (r.error || s.error || r.count !== 0 || s.count !== 0) continue;
    const hapus = await db.from("lodging_hotels").delete().eq("id", hid).eq("event_id", eventId).select("id");
    if (!hapus.error && Array.isArray(hapus.data) && hapus.data.length > 0) hotelDihapus += 1;
  }

  if (gagalOrang.length > 0) {
    const ids = gagalOrang.map((g) => g.id);
    const { data } = await db.from("participants").select("id,name").eq("event_id", eventId).in("id", ids.slice(0, 200));
    for (const p of (data ?? []) as Array<{ id: string; name: string }>) nama.set(p.id, p.name);
    for (const g of gagalOrang) dilewati.push({ nama: nama.get(g.id) ?? "Participant", alasan: g.alasan });
  }
  for (const d of dilewati) if (/^[0-9a-f-]{36}$/.test(d.nama)) d.nama = nama.get(d.nama) ?? "Participant";

  const hasil: HasilBatal = { orang, kamar, dihapus, hotelDihapus, dilewati };
  await db.from("logistics_imports").update({ undo_result: { orang, kamar, dihapus, hotelDihapus, dilewati: dilewati.length } } as never).eq("id", id).eq("event_id", eventId);
  if (baris.ai_run_id !== null) {
    await db.from("ai_runs").update({ status: "undone" } as never).eq("id", baris.ai_run_id).eq("event_id", eventId);
  }
  return hasil;
}
