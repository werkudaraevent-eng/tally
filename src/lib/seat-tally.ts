import { computeSeatMapGeometry, normalizeSeatLabel } from "@/lib/seat-map";
import { loadSeatMapConfig } from "@/lib/seat-map-data";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { isTallySeatSource, TALLY_SEAT_SOURCE_PREFIX, tallySeatSource } from "@/lib/seat-tally-source";

export { isTallySeatSource, tallySeatSource };

// Kursi yang diisi panitia di Tally, untuk acara yang pesertanya tidak datang
// dari scanner API (pendaftaran, impor, tambah manual).
//
// Disimpan di kolom yang sama dengan kursi scanner, `participants.seats`, dengan
// `subEventId` berbentuk `tally:<id sesi>`. Sesi denah yang sumber kursinya
// "Set in Tally" menyimpan nilai yang sama di `sub_event_id`, jadi seluruh jalur
// baca (denah publik, LED, laporan admin, dashboard peserta) bekerja tanpa
// perubahan dan tanpa SQL baru.
//
// Dua sumber tidak pernah bercampur di satu baris:
// - Sync scanner (`upsert_external_participants`) hanya menulis baris yang
//   punya `source_participant_id` dan menimpa seluruh `seats`-nya. Karena itu
//   kursi Tally hanya boleh ditulis ke baris TANPA `source_participant_id`;
//   baris dari scanner ditolak di sini, sehingga sync tidak pernah menghapus
//   kursi Tally dan Tally tidak pernah menimpa data sync.
// - `save_participant` dan `import_participants` tidak menyentuh `seats`.

export type StoredSeat = { subEventId: string; subEventName: string; label: string };

export type TallySeatSession = { id: number; name: string; source: string };

export type SeatTaken = { participantId: string; name: string; label: string };

export type SeatOptions = {
  sessions: TallySeatSession[];
  /** Label kursi yang ada di denah, urut seperti denah. */
  labels: string[];
  /** Per id sesi: label ternormalisasi → pemegang kursi sekarang. */
  taken: Record<number, Record<string, SeatTaken>>;
};

export type SeatInput = { session_id: number; label: string | null };

export class SeatInputError extends Error {}

export async function loadTallySeatSessions(eventId: string): Promise<TallySeatSession[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from("seat_map_sessions")
    .select("id,name,sub_event_id,sort_order")
    .eq("event_id", eventId)
    .like("sub_event_id", `${TALLY_SEAT_SOURCE_PREFIX}%`)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: number; name: string; sub_event_id: string }>)
    // Hanya sesi yang menunjuk dirinya sendiri. Nilai `tally:` milik sesi lain
    // tidak bisa disimpan lewat API, tetapi dijaga juga di sini.
    .filter((row) => row.sub_event_id === tallySeatSource(row.id))
    .map((row) => ({ id: row.id, name: row.name, source: row.sub_event_id }));
}

export async function loadSeatLabels(eventId: string) {
  const geometry = computeSeatMapGeometry(await loadSeatMapConfig(eventId));
  const labels = new Map<string, string>();
  for (const table of geometry.tables) {
    for (const seat of table.seats) {
      const kunci = normalizeSeatLabel(seat.label);
      if (!labels.has(kunci)) labels.set(kunci, seat.label);
    }
  }
  return labels;
}

type SeatRow = { id: string; name: string; seats: StoredSeat[] | null };

/**
 * Semua peserta aktif yang memegang kursi Tally, dibaca per 1000 (batas
 * PostgREST) berurutan menurut id supaya tidak ada baris terlewat.
 */
async function loadTallySeatHolders(eventId: string): Promise<SeatRow[]> {
  const client = getSupabaseServiceClient();
  const semua: SeatRow[] = [];
  let terakhir: string | null = null;
  for (;;) {
    let kueri = client
      .from("participants")
      .select("id,name,seats")
      .eq("event_id", eventId)
      .is("source_participant_id", null)
      .is("source_removed_at", null)
      .not("seats", "is", null);
    if (terakhir !== null) kueri = kueri.gt("id", terakhir);
    const { data, error } = await kueri.order("id", { ascending: true }).limit(1000);
    if (error) throw new Error(error.message);
    const baris = (data ?? []) as unknown as SeatRow[];
    for (const row of baris) {
      if (Array.isArray(row.seats) && row.seats.some((seat) => isTallySeatSource(seat?.subEventId))) semua.push(row);
    }
    if (baris.length < 1000) return semua;
    terakhir = baris[baris.length - 1].id;
  }
}

function occupancy(holders: SeatRow[]) {
  const taken: Record<number, Record<string, SeatTaken>> = {};
  for (const row of holders) {
    for (const seat of row.seats ?? []) {
      if (!isTallySeatSource(seat?.subEventId) || typeof seat.label !== "string") continue;
      const sessionId = Number(seat.subEventId.slice(TALLY_SEAT_SOURCE_PREFIX.length));
      (taken[sessionId] ??= {})[normalizeSeatLabel(seat.label)] = { participantId: row.id, name: row.name, label: seat.label };
    }
  }
  return taken;
}

/** Data untuk field Seat di modal sunting: sesi Tally, label sah, kursi terisi. */
export async function loadSeatOptions(eventId: string): Promise<SeatOptions> {
  const sessions = await loadTallySeatSessions(eventId);
  if (sessions.length === 0) return { sessions, labels: [], taken: {} };
  const [labels, holders] = await Promise.all([loadSeatLabels(eventId), loadTallySeatHolders(eventId)]);
  return { sessions, labels: [...labels.values()], taken: occupancy(holders) };
}

type PreparedSeat = { session: TallySeatSession; label: string | null };

/**
 * Memeriksa permintaan kursi SEBELUM peserta disimpan, supaya label yang salah
 * ketik ditolak tanpa setengah perubahan sudah tertulis.
 */
export async function prepareTallySeats(eventId: string, participantId: string | null, inputs: SeatInput[]): Promise<PreparedSeat[]> {
  if (inputs.length === 0) return [];
  if (participantId) {
    const { data } = await getSupabaseServiceClient()
      .from("participants")
      .select("source_participant_id")
      .eq("event_id", eventId)
      .eq("id", participantId)
      .maybeSingle();
    if ((data as { source_participant_id: string | null } | null)?.source_participant_id) {
      throw new SeatInputError("This participant's seat comes from the scanner API and can't be changed here.");
    }
  }
  const sessions = new Map((await loadTallySeatSessions(eventId)).map((session) => [session.id, session]));
  const labels = await loadSeatLabels(eventId);
  const hasil: PreparedSeat[] = [];
  const dilihat = new Set<number>();
  for (const input of inputs) {
    const session = sessions.get(input.session_id);
    if (!session) throw new SeatInputError("This seating session no longer takes seats from Tally. Reload the page.");
    if (dilihat.has(session.id)) continue;
    dilihat.add(session.id);
    const ketik = input.label?.trim() ?? "";
    if (!ketik) {
      hasil.push({ session, label: null });
      continue;
    }
    const label = labels.get(normalizeSeatLabel(ketik));
    if (!label) throw new SeatInputError(`Seat ${ketik} isn't on the Seating plan.`);
    hasil.push({ session, label });
  }
  return hasil;
}

/**
 * Menulis kursi Tally satu peserta. Kursi yang sedang dipegang peserta lain di
 * sesi yang sama dilepas dari mereka (pemeriksaan di server saat simpan, bukan
 * di browser), dan setiap perubahan dicatat di audit log.
 *
 * Dua admin yang menyimpan kursi yang sama pada detik yang sama masih bisa
 * sama-sama lolos; kursinya lalu tampil berisi dua nama di laporan denah.
 * Untuk tim panitia sekecil ini itu diterima ketimbang menambah kunci di SQL.
 */
export async function applyTallySeats(eventId: string, participantId: string, prepared: PreparedSeat[], actor: string) {
  if (prepared.length === 0) return { freed: [] as SeatTaken[] };
  const client = getSupabaseServiceClient();
  const holders = await loadTallySeatHolders(eventId);
  const taken = occupancy(holders);
  const freed: SeatTaken[] = [];
  const lepasDari = new Map<string, Set<string>>();

  for (const { session, label } of prepared) {
    if (!label) continue;
    const pemegang = taken[session.id]?.[normalizeSeatLabel(label)];
    if (pemegang && pemegang.participantId !== participantId) {
      freed.push(pemegang);
      (lepasDari.get(pemegang.participantId) ?? lepasDari.set(pemegang.participantId, new Set()).get(pemegang.participantId)!).add(session.source);
    }
  }

  for (const [id, sources] of lepasDari) {
    const row = holders.find((item) => item.id === id);
    const sisa = (row?.seats ?? []).filter((seat) => !sources.has(seat.subEventId));
    const { error } = await client.from("participants").update({ seats: sisa } as never).eq("event_id", eventId).eq("id", id).is("source_participant_id", null);
    if (error) throw new Error(error.message);
  }

  const { data: current, error: bacaGagal } = await client
    .from("participants")
    .select("seats,source_participant_id")
    .eq("event_id", eventId)
    .eq("id", participantId)
    .maybeSingle();
  if (bacaGagal) throw new Error(bacaGagal.message);
  const lama = ((current as { seats: StoredSeat[] | null } | null)?.seats ?? []).filter(Boolean);
  const disentuh = new Set(prepared.map((item) => item.session.source));
  const baru: StoredSeat[] = [
    ...lama.filter((seat) => !disentuh.has(seat.subEventId)),
    ...prepared.filter((item) => item.label).map((item) => ({ subEventId: item.session.source, subEventName: item.session.name, label: item.label! })),
  ];
  const { error } = await client.from("participants").update({ seats: baru } as never).eq("event_id", eventId).eq("id", participantId).is("source_participant_id", null);
  if (error) throw new Error(error.message);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: actor,
    action: "participant_seat_update",
    payload: { participant_id: participantId, old: lama, new: baru, freed },
  } as never);
  return { freed };
}

type ImporKursi = { qr_code: string; label: string };
type BarisPeserta = { id: string; name: string; qr_code: string; source_participant_id: string | null; seats: StoredSeat[] | null };

/**
 * Kursi dari kolom "seat" berkas impor, untuk SATU sesi "Set in Tally".
 *
 * Dijalankan sesudah `import_participants`, sehingga peserta baru dari berkas
 * yang sama sudah punya baris. Pada pratinjau (`dryRun`) tidak ada yang ditulis
 * dan peserta yang belum ada dihitung sebagai kursi yang akan diisi.
 *
 * Sel kosong berarti "biarkan", bukan "kosongkan": berkas lama yang tidak tahu
 * soal kursi tidak boleh menghapus kursi yang sudah diatur di modal.
 */
export async function applyImportSeats(
  eventId: string,
  session: TallySeatSession,
  items: ImporKursi[],
  options: { dryRun: boolean; actor: string },
) {
  const client = getSupabaseServiceClient();
  const byQr = new Map<string, BarisPeserta>();
  const kode = [...new Set(items.map((item) => item.qr_code))];
  for (let i = 0; i < kode.length; i += 200) {
    const { data, error } = await client
      .from("participants")
      .select("id,name,qr_code,source_participant_id,seats")
      .eq("event_id", eventId)
      .in("qr_code", kode.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as BarisPeserta[]) byQr.set(row.qr_code, row);
  }

  const holders = await loadTallySeatHolders(eventId);
  const baris = new Map<string, { name: string; seats: StoredSeat[] }>();
  for (const row of holders) baris.set(row.id, { name: row.name, seats: row.seats ?? [] });
  for (const row of byQr.values()) if (!baris.has(row.id)) baris.set(row.id, { name: row.name, seats: row.seats ?? [] });

  const kursiSesi = (seats: StoredSeat[]) => seats.find((seat) => seat?.subEventId === session.source)?.label ?? null;
  const target = new Map<string, string>();
  let scanner = 0;
  let baru = 0;
  for (const item of items) {
    const row = byQr.get(item.qr_code);
    if (!row) { baru += 1; continue; }
    if (row.source_participant_id) { scanner += 1; continue; }
    target.set(row.id, item.label);
  }

  const pemilikBaru = new Map<string, string>();
  for (const [id, label] of target) pemilikBaru.set(normalizeSeatLabel(label), id);

  const ubah: Array<{ id: string; old: string | null; new: string | null }> = [];
  for (const [id, data] of baris) {
    const lama = kursiSesi(data.seats);
    let akhir = lama;
    if (target.has(id)) akhir = target.get(id)!;
    else if (lama && pemilikBaru.has(normalizeSeatLabel(lama))) akhir = null;
    if ((lama ?? "") !== (akhir ?? "")) ubah.push({ id, old: lama, new: akhir });
  }
  const freed = ubah.filter((item) => item.new === null).length;
  const set = ubah.filter((item) => item.new !== null).length + (options.dryRun ? baru : 0);
  if (options.dryRun || ubah.length === 0) return { set, freed, scanner };

  for (let i = 0; i < ubah.length; i += 10) {
    const hasil = await Promise.all(ubah.slice(i, i + 10).map((item) => {
      const sisa = (baris.get(item.id)?.seats ?? []).filter((seat) => seat?.subEventId !== session.source);
      const seats = item.new ? [...sisa, { subEventId: session.source, subEventName: session.name, label: item.new }] : sisa;
      return client.from("participants").update({ seats } as never).eq("event_id", eventId).eq("id", item.id).is("source_participant_id", null);
    }));
    const galat = hasil.find((item) => item.error)?.error;
    if (galat) throw new Error(galat.message);
  }
  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: options.actor,
    action: "participant_seat_import",
    payload: { session_id: session.id, changes: ubah },
  } as never);
  return { set, freed, scanner };
}
