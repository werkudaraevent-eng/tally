import { z } from "zod";
import { bacaSetelanPanitia } from "@/lib/member/akses-panitia";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { adaKolomTujuan, bacaTujuan, kolomTujuanBelumAda, rapiTujuan, rewardEnBaru, TUJUAN_POIN_MAX, TUJUAN_TEKS_MAX, type TujuanPoin } from "@/lib/checkpoint/tujuan";
import { bacaPenyelesaian, type Penyelesaian } from "@/lib/checkpoint/server";
import { landingEnAvailable } from "@/lib/landing-i18n";
import { bacaTautanAgenda, TAUTAN_AGENDA_MAX } from "@/lib/sasaran-blok";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * CMS Check-in > Checkpoints (migrasi 202610140002, tujuan poin 202610170001,
 * When dari Agenda 202610220001).
 *
 * GET   setelan (termasuk tujuan poin), daftar checkpoint, pilihan sesi dan
 *       barang, dan angkanya.
 * POST  checkpoint baru (di akhir daftar).
 * PATCH `{ id, ... }` mengubah satu checkpoint, `{ id, move }` memindahkannya
 *       satu langkah, `{ settings }` menyalakan fitur atau poin, atau
 *       `{ settings: { goal } }` mengisi (objek) atau menghapus (null) tujuan poin.
 * DELETE ?id= menghapus satu checkpoint. Catatan scan dan barangnya tidak
 *       tersentuh: checkpoint hanya menunjuk bukti itu.
 */

const teks = (max: number) => z.string().trim().max(max).nullish().transform((nilai) => nilai || null);

const rapi = rapiTujuan;

const tujuanSchema = z.object({
  points: z.number().int().min(1).max(TUJUAN_POIN_MAX),
  // Bahasa Indonesia, seperti teks dasar acara lain.
  reward: z.string().transform(rapi).pipe(z.string().min(1).max(TUJUAN_TEKS_MAX)),
  // Tidak dikirim: teks English tersimpan dipertahankan selama teks Indonesianya
  // sama (rewardEnBaru). Kosong atau null: dihapus.
  reward_en: z.string().transform(rapi).pipe(z.string().max(TUJUAN_TEKS_MAX)).nullable().optional(),
});

/** Isi audit yang terbaca per kolom di Jejak audit (lihat FIELD_LABEL di audit-panel.tsx). */
function auditSetelan(setelan: { enabled: boolean; points_enabled: boolean }, goal: TujuanPoin | null) {
  return {
    checkpoints_enabled: setelan.enabled,
    checkpoint_points_enabled: setelan.points_enabled,
    points_goal: goal?.points ?? null,
    points_reward: goal?.reward ?? null,
    points_reward_en: goal?.reward_en ?? null,
  };
}

const setelanSchema = z.object({
  settings: z.object({ enabled: z.boolean().optional(), points_enabled: z.boolean().optional(), goal: tujuanSchema.nullable().optional() }),
});

const isiSchema = z.object({
  title: z.string().trim().min(1).max(80),
  title_en: teks(80),
  place: teks(120),
  place_en: teks(120),
  session_id: z.number().int().positive().nullish(),
  item_id: z.number().int().positive().nullish(),
  points: z.number().int().min(0).max(10000).nullish(),
  // Siapa yang memindai (migrasi 202610180001). Tidak dikirim: tidak diubah
  // (checkpoint baru: staff).
  completion: z.enum(["staff", "self", "both"]).optional(),
  // Baris Agenda yang memberi tanggal dan jam (migrasi 202610220001). Tidak
  // dikirim: tidak diubah. Kosong atau null: tanpa tanggal.
  agenda_item_ids: z.array(z.number().int().positive()).max(TAUTAN_AGENDA_MAX).nullish(),
});

const patchSchema = z.union([
  setelanSchema,
  z.object({ id: z.number().int().positive(), move: z.enum(["up", "down"]) }),
  isiSchema.extend({ id: z.number().int().positive() }),
]);

// select *: kolom `completion` baru ada setelah migrasi 202610180001.
const PILIH = "*";

/** Baris checkpoint untuk CMS: `completion` selalu ada (kolom belum ada = staff), `agenda_item_ids` selalu larik. */
function rapiBaris(baris: Record<string, unknown>) {
  return { ...baris, completion: bacaPenyelesaian(baris.completion), agenda_item_ids: bacaTautanAgenda(baris.agenda_item_ids) };
}

/** Kolom `agenda_item_ids` belum ada di database ini (migrasi 202610220001 belum dijalankan). */
function kolomWaktuBelumAda(error: { code?: string; message?: string }) {
  const kode = String(error.code ?? "");
  return (kode === "42703" || kode === "PGRST204") && String(error.message ?? "").includes("agenda_item_ids");
}

/**
 * Kolom When yang akan ditulis: tidak dikirim = tidak diubah, kosong = null.
 * Hanya baris Agenda acara ini: id acara lain atau yang sudah dihapus ditolak,
 * supaya yang tersimpan sama dengan yang dipilih admin.
 */
async function periksaWaktu(db: ReturnType<typeof getSupabaseServiceClient>, eventId: string, ids: number[] | null | undefined) {
  if (ids === undefined) return { kolom: {} };
  const unik = bacaTautanAgenda(ids ?? []);
  if (unik.length === 0) return { kolom: { agenda_item_ids: null } };
  const { data, error } = await db.from("rundown_items").select("id").eq("event_id", eventId).in("id", unik);
  if (error) return { galat: apiError("INTERNAL_ERROR", 500) };
  const ada = new Set(((data ?? []) as { id: number }[]).map((baris) => baris.id));
  if (!unik.every((id) => ada.has(id))) return { galat: apiError("VALIDATION_ERROR", 422, { message: "That agenda row is no longer in the Agenda. Reload the page." }) };
  return { kolom: { agenda_item_ids: unik } };
}

/** Peserta hanya bisa memindai checkpoint sesi: barang harus diserahkan orang. */
function penyelesaianSah(isi: { session_id?: number | null; completion?: string }) {
  return !isi.completion || isi.completion === "staff" || Boolean(isi.session_id);
}

const PESAN_BARANG = "Kit items are handed over by staff, so staff scan them. Choose a scan session to let participants scan.";

/** Kolom `completion` belum ada di database ini (migrasi 202610180001 belum dijalankan). */
function kolomPenyelesaianBelumAda(error: { code?: string; message?: string }) {
  const kode = String(error.code ?? "");
  return (kode === "42703" || kode === "PGRST204") && String(error.message ?? "").includes("completion");
}

/** Galat database menjadi kalimat yang bisa ditindaklanjuti admin. */
function galat(error: { code?: string; message?: string }) {
  const kode = String(error.code ?? "");
  if (kode === "23503") return apiError("VALIDATION_ERROR", 422, { message: "That session or kit item no longer exists. Reload the page." });
  if (kode === "23514") return apiError("VALIDATION_ERROR", 422, { message: "Pick exactly one: a scan session or a kit item." });
  // Tabel belum ada: migrasi belum dijalankan di database ini.
  if (kode === "42P01" || kode === "PGRST205") return apiError("VALIDATION_ERROR", 503, { message: "Checkpoints are not set up in the database yet." });
  return apiError("INTERNAL_ERROR", 500);
}

/** Tepat satu bukti: sesi scan ATAU barang. */
const LABEL_SELESAI: Record<Penyelesaian, string> = { staff: "Staff scan the participant's QR", self: "Participants scan the checkpoint QR", both: "Both" };

/**
 * Kemajuan dihitung per sesi, jadi semua checkpoint di satu sesi selesai dengan
 * cara yang sama: kalau tidak, scan mandiri ikut menyelesaikan checkpoint Staff.
 * Jawaban 422 bila checkpoint lain di sesi itu memakai pilihan lain.
 */
async function bentrokSesi(db: ReturnType<typeof getSupabaseServiceClient>, eventId: string, sessionId: number | null, completion: Penyelesaian | undefined, kecuali: number | null) {
  if (!sessionId || !completion) return null;
  // Meja bagasi (Check-in > Sessions > Record luggage) selalu dipindai panitia:
  // jumlah dan foto bagasinya diisi petugas, bukan peserta.
  if (completion !== "staff") {
    const { data: sesi } = await db.from("attendance_sessions").select("*").eq("event_id", eventId).eq("id", sessionId).maybeSingle();
    const meja = sesi as { records_luggage?: boolean; luggage_pickup?: boolean } | null;
    if (meja?.records_luggage === true || meja?.luggage_pickup === true) {
      return apiError("VALIDATION_ERROR", 422, {
        message: "This scan session takes in or hands back luggage, so staff scan the participant there. Choose \"Staff scan the participant's QR\".",
      });
    }
  }
  const { data, error } = await db.from("checkpoints").select(PILIH).eq("event_id", eventId).eq("session_id", sessionId);
  if (error) return galat(error);
  const lain = ((data ?? []) as { id: number; title: string; completion?: unknown }[])
    .map((cp) => ({ ...cp, completion: bacaPenyelesaian(cp.completion) }))
    .find((cp) => cp.id !== kecuali && cp.completion !== completion);
  if (!lain) return null;
  return apiError("VALIDATION_ERROR", 422, {
    message: `"${lain.title}" uses this scan session with "${LABEL_SELESAI[lain.completion]}". Checkpoints on one session get done the same way: pick that, or another session.`,
  });
}

function satuBukti(isi: { session_id?: number | null; item_id?: number | null }) {
  return Boolean(isi.session_id) !== Boolean(isi.item_id);
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const db = getSupabaseServiceClient();

  const [setelan, daftar, sesi, barang, angka] = await Promise.all([
    // select *: kolom tujuan poin baru ada setelah migrasi 202610170001.
    db.from("checkpoint_settings").select("*").eq("event_id", eventId).maybeSingle(),
    db.from("checkpoints").select(PILIH).eq("event_id", eventId).order("sort_order").order("id"),
    db.from("attendance_sessions").select("id,name,is_active").eq("event_id", eventId).order("sort_order").order("id"),
    db.from("pickup_items").select("id,name").eq("event_id", eventId).order("sort_order").order("id"),
    db.rpc("checkpoint_progress" as never, { p_event_id: eventId } as never),
  ]);
  if (setelan.error || daftar.error) return galat(setelan.error ?? daftar.error!);
  if (sesi.error || barang.error) return apiError("INTERNAL_ERROR", 500);
  const barisCp = (daftar.data ?? []) as Record<string, unknown>[];

  const s = setelan.data as Record<string, unknown> | null;
  const progres = (angka.error ? null : angka.data) as { done?: Record<string, number>; finished_all?: number; participants?: number } | null;
  const landing = auth.scope.event.landing_config;
  return Response.json({
    settings: { enabled: s?.enabled === true, points_enabled: s?.points_enabled === true, goal: bacaTujuan(s) },
    // Kolom tujuan sudah ada (migrasi 202610170001). Tanpa baris setelan belum
    // bisa diketahui: dianggap siap, dan simpan yang gagal dijawab 409.
    goal_ready: s ? adaKolomTujuan(s) : true,
    // Halaman peserta English menyala: teks English tujuan dipakai di sana.
    en_available: landingEnAvailable(landing),
    // Check-in > Checkpoints > Committee access: Tipe yang tersimpan, untuk label tombolnya.
    committee_types: bacaSetelanPanitia(landing?.member?.committee)?.types ?? [],
    checkpoints: barisCp.map((cp) => ({ ...rapiBaris(cp), done: progres?.done?.[String(cp.id)] ?? 0 })),
    // Kolom scan mandiri sudah ada (migrasi 202610180001). Tanpa checkpoint
    // belum bisa diketahui: dianggap siap, dan simpan yang gagal dijawab 409.
    self_scan_ready: barisCp.length === 0 || Object.hasOwn(barisCp[0], "completion"),
    // Kolom When sudah ada (migrasi 202610220001), dengan cara yang sama.
    when_ready: barisCp.length === 0 || Object.hasOwn(barisCp[0], "agenda_item_ids"),
    sessions: sesi.data ?? [],
    items: barang.data ?? [],
    finished_all: progres?.finished_all ?? null,
    participants: progres?.participants ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = isiSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (!satuBukti(parsed.data)) return apiError("VALIDATION_ERROR", 422, { message: "Pick exactly one: a scan session or a kit item." });
  if (!penyelesaianSah(parsed.data)) return apiError("VALIDATION_ERROR", 422, { message: PESAN_BARANG });
  const eventId = auth.scope.event.id;
  const db = getSupabaseServiceClient();

  const bentrok = await bentrokSesi(db, eventId, parsed.data.session_id ?? null, parsed.data.completion ?? "staff", null);
  if (bentrok) return bentrok;
  const { data: akhir } = await db.from("checkpoints").select("sort_order").eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { completion, agenda_item_ids, ...isi } = parsed.data;
  const waktu = await periksaWaktu(db, eventId, agenda_item_ids);
  if ("galat" in waktu) return waktu.galat;
  // When hanya ditulis bila terisi: menambah checkpoint tanpa tanggal tetap
  // jalan sebelum migrasi 202610220001.
  const kolomWaktu = waktu.kolom.agenda_item_ids ? waktu.kolom : {};
  const baris = { ...isi, ...kolomWaktu, session_id: isi.session_id ?? null, item_id: isi.item_id ?? null, event_id: eventId, sort_order: ((akhir as { sort_order: number } | null)?.sort_order ?? -1) + 1 };
  // Staff adalah bawaan database, jadi kolomnya hanya ditulis untuk pilihan
  // lain: menambah checkpoint tetap jalan sebelum migrasi 202610180001.
  const { data, error } = await db
    .from("checkpoints")
    .insert((completion && completion !== "staff" ? { ...baris, completion } : baris) as never)
    .select(PILIH)
    .single();
  if (error) {
    if (kolomPenyelesaianBelumAda(error)) return apiError("CHECKPOINT_SELF_SCAN_NOT_READY", 409);
    if (kolomWaktuBelumAda(error)) return apiError("CHECKPOINT_WHEN_NOT_READY", 409);
    return galat(error);
  }
  return Response.json(rapiBaris(data as Record<string, unknown>));
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    // Union zod hanya menjawab "Invalid input": tujuan poin diberi kalimatnya sendiri.
    if ((body as { settings?: { goal?: unknown } } | null)?.settings?.goal !== undefined) {
      return apiError("VALIDATION_ERROR", 422, { message: `The points goal is not valid. Use a whole number from 1 to ${TUJUAN_POIN_MAX.toLocaleString("en-GB")} and up to ${TUJUAN_TEKS_MAX} characters.` });
    }
    return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  }
  const eventId = auth.scope.event.id;
  const db = getSupabaseServiceClient();
  const sekarang = new Date().toISOString();

  if ("settings" in parsed.data) {
    const { goal, ...sakelar } = parsed.data.settings;
    const { data: lama, error: galatBaca } = await db.from("checkpoint_settings").select("*").eq("event_id", eventId).maybeSingle();
    if (galatBaca) return galat(galatBaca);
    const barisLama = lama as Record<string, unknown> | null;
    const awal = { enabled: barisLama?.enabled === true, points_enabled: barisLama?.points_enabled === true };
    const tujuanLama = bacaTujuan(barisLama);
    const baru = { ...awal, ...sakelar };
    const tujuanBaru: TujuanPoin | null =
      goal === undefined
        ? tujuanLama
        : goal === null
          ? null
          : { points: goal.points, reward: goal.reward, reward_en: rewardEnBaru(tujuanLama, goal.reward, goal.reward_en) };
    // Kolom tujuan hanya ditulis bila tujuannya dikirim, jadi menyalakan atau
    // mematikan sakelar tetap berjalan di database sebelum migrasi 202610170001.
    const kolomTujuan =
      goal === undefined ? {} : { points_goal: tujuanBaru?.points ?? null, points_reward: tujuanBaru?.reward ?? null, points_reward_en: tujuanBaru?.reward_en ?? null };
    // Hanya kunci yang dikirim yang ditulis: simpan tujuan tidak menimpa sakelar
    // yang baru saja diubah admin lain. Baris baru mendapat bawaan false dari database.
    const { error } = await db
      .from("checkpoint_settings")
      .upsert({ event_id: eventId, ...sakelar, ...kolomTujuan, updated_at: sekarang } as never, { onConflict: "event_id" });
    if (error) {
      if (goal !== undefined && kolomTujuanBelumAda(error)) return apiError("CHECKPOINT_GOAL_NOT_READY", 409);
      if (goal !== undefined && String(error.code ?? "") === "23514") return apiError("VALIDATION_ERROR", 422, { message: "The points goal is not valid." });
      return galat(error);
    }
    // Tujuan menjanjikan sesuatu ke peserta: siapa yang mengubahnya harus bisa dilacak.
    const auditLama = auditSetelan(awal, tujuanLama);
    const auditBaru = auditSetelan(baru, tujuanBaru);
    if (JSON.stringify(auditLama) !== JSON.stringify(auditBaru)) {
      await db.from("audit_logs").insert({
        event_id: eventId,
        user_id: auth.user.id,
        action: "checkpoint_settings_update",
        payload: { old: auditLama, new: auditBaru },
      } as never);
    }
    return Response.json({ settings: { ...baru, goal: tujuanBaru } });
  }

  if ("move" in parsed.data) {
    // Seluruh urutan ditulis ulang 0..n-1 dari urutan yang tampil, jadi nilai
    // sort_order yang kembar atau berlubang ikut rapi.
    const { data: semua, error: galatBaca } = await db.from("checkpoints").select("id").eq("event_id", eventId).order("sort_order").order("id");
    if (galatBaca) return galat(galatBaca);
    const ids = ((semua ?? []) as { id: number }[]).map((cp) => cp.id);
    const dari = ids.indexOf(parsed.data.id);
    const ke = dari + (parsed.data.move === "up" ? -1 : 1);
    if (dari < 0) return apiError("VALIDATION_ERROR", 404, { message: "This checkpoint no longer exists. Reload the page." });
    if (ke < 0 || ke >= ids.length) return Response.json({ ok: true });
    [ids[dari], ids[ke]] = [ids[ke], ids[dari]];
    const hasil = await Promise.all(
      ids.map((id, urutan) => db.from("checkpoints").update({ sort_order: urutan, updated_at: sekarang } as never).eq("id", id).eq("event_id", eventId)),
    );
    if (hasil.some((h) => h.error)) return apiError("INTERNAL_ERROR", 500);
    return Response.json({ ok: true });
  }

  const { id, completion, agenda_item_ids, ...isi } = parsed.data;
  if (!satuBukti(isi)) return apiError("VALIDATION_ERROR", 422, { message: "Pick exactly one: a scan session or a kit item." });
  // Sama dengan POST: barang dengan pilihan selain Staff ditolak. Pindah ke
  // barang tanpa menyebut pilihannya: checkpoint itu kembali dipindai panitia.
  if (!penyelesaianSah({ ...isi, completion })) return apiError("VALIDATION_ERROR", 422, { message: PESAN_BARANG });
  const penyelesaian = isi.item_id ? "staff" : completion;
  // Pindah sesi tanpa menyebut pilihannya: yang dibandingkan pilihan tersimpan.
  let caraSekarang = penyelesaian;
  let sesiSekarang = isi.session_id ?? null;
  if ((caraSekarang === undefined && isi.session_id) || (caraSekarang && caraSekarang !== "staff" && isi.session_id === undefined)) {
    const { data: lama } = await db.from("checkpoints").select(PILIH).eq("id", id).eq("event_id", eventId).maybeSingle();
    if (lama && caraSekarang === undefined) caraSekarang = bacaPenyelesaian((lama as { completion?: unknown }).completion);
    // Ganti cara tanpa menyebut sesinya: sesi tersimpan yang diperiksa (meja bagasi).
    if (lama && isi.session_id === undefined) sesiSekarang = (lama as { session_id?: number | null }).session_id ?? null;
  }
  const bentrok = await bentrokSesi(db, eventId, sesiSekarang, caraSekarang, id);
  if (bentrok) return bentrok;
  const waktu = await periksaWaktu(db, eventId, agenda_item_ids);
  if ("galat" in waktu) return waktu.galat;
  let ubah: Record<string, unknown> = { ...isi, ...waktu.kolom, session_id: isi.session_id ?? null, item_id: isi.item_id ?? null, updated_at: sekarang };
  const simpan = (dengan: boolean) =>
    db
      .from("checkpoints")
      .update((dengan ? { ...ubah, completion: penyelesaian } : ubah) as never)
      // event_id ikut disaring: id checkpoint acara lain tidak bisa diubah dari sini.
      .eq("id", id)
      .eq("event_id", eventId)
      .select(PILIH)
      .maybeSingle();
  let { data, error } = await simpan(penyelesaian !== undefined);
  // Sebelum migrasi 202610180001: Staff (atau pindah ke barang) tetap tersimpan
  // tanpa kolomnya; pilihan lain dijawab 409.
  if (error && kolomPenyelesaianBelumAda(error) && penyelesaian === "staff") ({ data, error } = await simpan(false));
  // Sebelum migrasi 202610220001: checkpoint tanpa tanggal tetap tersimpan
  // tanpa kolomnya; When yang terisi dijawab 409.
  if (error && kolomWaktuBelumAda(error) && waktu.kolom.agenda_item_ids === null) {
    ubah = Object.fromEntries(Object.entries(ubah).filter(([kunci]) => kunci !== "agenda_item_ids"));
    ({ data, error } = await simpan(penyelesaian !== undefined));
    if (error && kolomPenyelesaianBelumAda(error) && penyelesaian === "staff") ({ data, error } = await simpan(false));
  }
  if (error) {
    if (kolomPenyelesaianBelumAda(error)) return apiError("CHECKPOINT_SELF_SCAN_NOT_READY", 409);
    if (kolomWaktuBelumAda(error)) return apiError("CHECKPOINT_WHEN_NOT_READY", 409);
    return galat(error);
  }
  if (!data) return apiError("VALIDATION_ERROR", 404, { message: "This checkpoint no longer exists. Reload the page." });
  return Response.json(rapiBaris(data as Record<string, unknown>));
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);
  const { error } = await getSupabaseServiceClient().from("checkpoints").delete().eq("id", id).eq("event_id", auth.scope.event.id);
  if (error) return galat(error);
  return Response.json({ ok: true });
}
