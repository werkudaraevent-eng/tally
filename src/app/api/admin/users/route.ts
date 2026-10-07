import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
// Biaya hash diimpor, tidak diulang sebagai angka di sini. Dua tempat yang
// menuliskan cost sendiri adalah dua tempat yang bisa menyimpang, dan ketidaksamaan
// itu tidak akan memunculkan kesalahan apa pun — hanya PIN yang lebih lambat
// diverifikasi daripada yang diperkirakan.
import { PIN_HASH_ROUNDS } from "@/lib/auth/login";
import { canManageUsers, canResetOperatorPin } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/domain";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { aksesPerUser, akunTerlihat, bolehResetPin, periksaAkses, type AcaraRingkas, type AksesMasuk, type BarisAkses } from "@/lib/users-akses";

// `super_admin` harus ikut diterima: dropdown role di UI menawarkannya dan
// kolom enum di database sudah memilikinya sejak migrasi 202607300001. Tanpa ini
// setiap penyimpanan akun super admin (termasuk sekadar ganti PIN, karena PATCH
// dari UI selalu menyertakan role) ditolak sebagai VALIDATION_ERROR.
const roleSchema = z.enum(["booth", "cashier", "admin", "super_admin", "scanner", "viewer"]);

const aksesSchema = z.array(z.object({
  event_id: z.string().uuid(),
  booth_id: z.number().int().positive().nullable(),
})).max(500);

const createSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-z0-9._-]+$/i, "Use letters, numbers, dots, dashes and underscores."),
  pin: z.string().regex(/^\d{6}$/, "The PIN must be 6 digits."),
  role: roleSchema,
  is_active: z.boolean().optional(),
  events: aksesSchema,
});

const updateSchema = z.object({
  id: z.string().uuid(),
  username: z.string().trim().min(3).max(50).regex(/^[a-z0-9._-]+$/i).optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
  role: roleSchema.optional(),
  booth_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
  // Bila ada: pengganti SELURUH daftar acara akun ini.
  events: aksesSchema.optional(),
});

type UserRow = { id: string; username: string; role: string; booth_id: number | null; is_active: boolean };

/**
 * Membaca semua baris, per halaman 1000. PostgREST memotong setiap respons di
 * max-rows (1000) tanpa galat, jadi satu kueri tanpa halaman bisa diam-diam
 * kehilangan akses panitia begitu tabelnya tumbuh.
 */
async function semuaHalaman<T>(
  ambil: (dari: number, sampai: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const UKURAN = 1000;
  const semua: T[] = [];
  for (let dari = 0; ; dari += UKURAN) {
    const { data, error } = await ambil(dari, dari + UKURAN - 1);
    if (error) return { data: [], error };
    const halaman = (data ?? []) as T[];
    semua.push(...halaman);
    if (halaman.length < UKURAN) return { data: semua, error: null };
  }
}

type Klien = ReturnType<typeof getSupabaseServiceClient>;

/**
 * Memeriksa bahwa setiap acara ada dan setiap booth milik acaranya. FK komposit
 * di database menolak booth acara lain juga, tetapi sebagai 500 tanpa pesan.
 */
async function periksaAcaraBooth(client: Klien, baris: AksesMasuk[]): Promise<string | null> {
  if (baris.length === 0) return null;
  const ids = baris.map((b) => b.event_id);
  const { data: acara, error } = await client.from("events").select("id").in("id", ids);
  if (error) return "Events could not be checked. Try again.";
  if ((acara ?? []).length !== new Set(ids).size) return "One of the events no longer exists. Reload and try again.";
  const denganBooth = baris.filter((b) => b.booth_id !== null);
  if (denganBooth.length > 0) {
    const { data: booths, error: galatBooth } = await client.from("booths").select("id,event_id").in("id", denganBooth.map((b) => b.booth_id as number));
    if (galatBooth) return "Booths could not be checked. Try again.";
    const ada = new Set(((booths ?? []) as { id: number; event_id: string }[]).map((b) => `${b.event_id}:${b.id}`));
    if (denganBooth.some((b) => !ada.has(`${b.event_id}:${b.booth_id}`))) return "A booth doesn't belong to its event. Reload and try again.";
  }
  return null;
}

/**
 * Menyamakan baris user_event_access akun dengan `baris`: yang tidak ada lagi
 * dihapus, sisanya ditulis dengan peran akun (satu peran per akun, berlaku di
 * semua acaranya). Super admin: semua barisnya dihapus.
 */
async function tulisAkses(client: Klien, userId: string, role: UserRole, baris: AksesMasuk[], oleh: string): Promise<boolean> {
  const tetap = role === "super_admin" ? [] : baris;
  // Baris acara TERARSIP tidak ikut diganti: layar tidak menawarkan acara
  // terarsip, jadi daftar dari layar tidak pernah memuatnya, dan menggantinya
  // berarti menghapus akses lama setiap kali akun disimpan. Super admin
  // pengecualian: tanpa baris berarti semua acara, jadi semuanya dihapus.
  const ada = await client.from("user_event_access").select("event_id").eq("user_id", userId);
  if (ada.error) return false;
  const idAda = ((ada.data ?? []) as { event_id: string }[]).map((b) => b.event_id);
  let arsip = new Set<string>();
  if (role !== "super_admin" && idAda.length > 0) {
    const terarsip = await client.from("events").select("id").in("id", idAda).not("archived_at", "is", null);
    if (terarsip.error) return false;
    arsip = new Set(((terarsip.data ?? []) as { id: string }[]).map((e) => e.id));
  }
  const simpan = new Set(tetap.map((b) => b.event_id));
  const hapusIds = idAda.filter((id) => !simpan.has(id) && !arsip.has(id));
  if (hapusIds.length > 0) {
    const { error: galatHapus } = await client.from("user_event_access").delete().eq("user_id", userId).in("event_id", hapusIds);
    if (galatHapus) return false;
  }
  if (tetap.length === 0) return true;
  const { error } = await client.from("user_event_access").upsert(
    tetap.map((b) => ({ user_id: userId, event_id: b.event_id, role, booth_id: role === "booth" ? b.booth_id : null, granted_by: oleh })) as never,
    { onConflict: "user_id,event_id" },
  );
  return !error;
}

/** Acara terarsip yang masih dipegang akun: tetap tersimpan, jadi ikut dihitung sebagai acaranya. */
async function acaraArsip(client: Klien, userId: string): Promise<string[] | null> {
  const ada = await client.from("user_event_access").select("event_id").eq("user_id", userId);
  if (ada.error) return null;
  const ids = ((ada.data ?? []) as { event_id: string }[]).map((b) => b.event_id);
  if (ids.length === 0) return [];
  const { data, error } = await client.from("events").select("id").in("id", ids).not("archived_at", "is", null);
  if (error) return null;
  return ((data ?? []) as { id: string }[]).map((e) => e.id);
}

/** users.booth_id lama masih wajib untuk Booth staff (cek booth_user_requires_booth): booth acara pertama. */
function boothLama(role: string, baris: AksesMasuk[]): number | null {
  return role === "booth" ? baris[0]?.booth_id ?? null : null;
}

export async function GET() {
  // Klien (`admin`) boleh MELIHAT daftar operator, tapi tidak mengubahnya.
  // `can_manage` dikirim agar UI tahu harus menampilkan mode baca saja.
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const client = getSupabaseServiceClient();
  const akun = await client
    .from("users")
    .select("id,username,role,booth_id,is_active")
    .order("role", { ascending: true })
    .order("username", { ascending: true });
  if (akun.error) return apiError("INTERNAL_ERROR", 500);

  // Akses per acara (user_event_access) ditampilkan di samping peran global,
  // supaya dua sistem peran itu terbaca di satu tempat. Admin hanya menerima
  // acara yang ia pegang sendiri (src/lib/users-akses.ts); super admin semuanya.
  // Kueri dibatasi ke acara itu, bukan seluruh tabel, supaya batas 1000 baris
  // PostgREST tidak memotong daftar diam-diam.
  let ids: string[] | null = null;
  if (auth.user.role !== "super_admin") {
    const milik = await client.from("user_event_access").select("event_id").eq("user_id", auth.user.id);
    if (milik.error) return apiError("INTERNAL_ERROR", 500);
    ids = [...new Set(((milik.data ?? []) as { event_id: string }[]).map((baris) => baris.event_id))];
  }
  let akses: BarisAkses[] = [];
  let acara: AcaraRingkas[] = [];
  if (ids === null || ids.length > 0) {
    const [hasilAkses, hasilAcara] = await Promise.all([
      semuaHalaman((dari, sampai) => {
        const kueri = client.from("user_event_access").select("user_id,event_id,role,booth_id").order("user_id").order("event_id");
        return (ids ? kueri.in("event_id", ids) : kueri).range(dari, sampai);
      }),
      semuaHalaman((dari, sampai) => {
        // Acara terarsip ikut dibaca supaya layar bisa menampilkannya sebagai chip
        // terkunci; ia tidak dihitung sebagai "berbagi acara" di bawah.
        const kueri = client.from("events").select("id,slug,name,archived_at").order("id");
        return (ids ? kueri.in("id", ids) : kueri).range(dari, sampai);
      }),
    ]);
    if (hasilAkses.error || hasilAcara.error) return apiError("INTERNAL_ERROR", 500);
    akses = hasilAkses.data as BarisAkses[];
    acara = (hasilAcara.data as (AcaraRingkas & { archived_at: string | null })[]).map(({ archived_at, ...event }) => ({ ...event, archived: archived_at !== null }));
  }
  // Kode booth untuk chip "Acara · B3".
  const idBooth = [...new Set(akses.map((baris) => baris.booth_id).filter((id): id is number => typeof id === "number"))];
  const kodeBooth = new Map<number, string>();
  for (let i = 0; i < idBooth.length; i += 200) {
    const { data, error } = await client.from("booths").select("id,code").in("id", idBooth.slice(i, i + 200));
    if (error) return apiError("INTERNAL_ERROR", 500);
    for (const booth of (data ?? []) as { id: number; code: string }[]) kodeBooth.set(booth.id, booth.code);
  }
  const perUser = aksesPerUser(auth.user, akses, acara);
  // Akun disaring di server dengan aturan yang sama: admin hanya menerima akun
  // yang berbagi acara dengannya, tanpa super admin. Angka di tab peran dihitung
  // dari daftar ini, jadi ikut tersaring.
  // Acara terarsip tidak dihitung sebagai "berbagi acara".
  const aktif = new Set(acara.filter((event) => !event.archived).map((event) => event.id));
  const users = akunTerlihat(auth.user, akses.filter((baris) => aktif.has(baris.event_id)), (akun.data ?? []) as UserRow[]).map((user) => ({
    ...user,
    events: (perUser.get(user.id) ?? []).map((event) => ({ ...event, booth_code: event.booth_id ? kodeBooth.get(event.booth_id) ?? null : null })),
  }));
  return Response.json({
    users,
    can_manage: canManageUsers(auth.user),
    can_reset_operator_pin: auth.user.role === "admin" || canManageUsers(auth.user),
  });
}

export async function POST(request: Request) {
  // super_admin saja: membuat akun berarti bisa membuat admin baru, dan itu jalan
  // memutar untuk memperoleh kewenangan penuh.
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const aturan = periksaAkses(parsed.data.role, parsed.data.events);
  if (aturan) return apiError("VALIDATION_ERROR", 422, { message: aturan });

  const client = getSupabaseServiceClient();
  const galatAcara = await periksaAcaraBooth(client, parsed.data.events);
  if (galatAcara) return apiError("VALIDATION_ERROR", 422, { message: galatAcara });

  // Username yang sudah dipakai ditolak, KECUALI sisa pembuatan yang gagal di
  // tengah jalan: akun nonaktif, tanpa acara, tanpa catatan user_create (baru
  // ditulis setelah semuanya berhasil), DAN ada catatan user_create_started
  // untuk username ini dalam 15 menit terakhir. Syarat terakhir itu yang
  // membedakan sisa gagal dari akun nonaktif sungguhan yang memang belum punya
  // acara; tanpanya akun seperti itu ikut terhapus.
  const { data: existing } = await client.from("users").select("id,is_active").eq("username", parsed.data.username).maybeSingle() as { data: { id: string; is_active: boolean } | null };
  if (existing) {
    const [akses, jejak, mulai] = await Promise.all([
      client.from("user_event_access").select("event_id", { count: "exact", head: true }).eq("user_id", existing.id),
      client.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "user_create").eq("payload->user->>id", existing.id),
      client.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "user_create_started").eq("payload->>username", parsed.data.username)
        .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString()),
    ]);
    const sisaGagal = !existing.is_active && !akses.error && !jejak.error && !mulai.error
      && (akses.count ?? 0) === 0 && (jejak.count ?? 0) === 0 && (mulai.count ?? 0) > 0;
    if (!sisaGagal) return apiError("USERNAME_TAKEN", 409, { field: "username", message: "This username is taken. Choose another." });
    const { error: galatSisa } = await client.from("users").delete().eq("id", existing.id).eq("is_active", false);
    if (galatSisa) return apiError("INTERNAL_ERROR", 500);
  }

  // Urutan sengaja: akun dibuat NONAKTIF, acara ditulis, baru diaktifkan. Bila
  // langkah di tengah gagal, yang tertinggal hanyalah akun yang tidak bisa
  // masuk, bukan akun aktif dengan PIN yang sudah dibagikan tetapi tanpa acara.
  const pinHash = await bcrypt.hash(parsed.data.pin, PIN_HASH_ROUNDS);
  // Penanda awal untuk pemulihan sisa gagal di atas. Ditulis sebelum akun ada;
  // bila penanda ini gagal ditulis, akun tidak dibuat sama sekali.
  const { error: galatMulai } = await client.from("audit_logs").insert({ user_id: auth.user.id, action: "user_create_started", payload: { username: parsed.data.username } } as never);
  if (galatMulai) return apiError("INTERNAL_ERROR", 500);
  const { data: dibuat, error } = await client
    .from("users")
    .insert({ username: parsed.data.username, pin_hash: pinHash, role: parsed.data.role, booth_id: boothLama(parsed.data.role, parsed.data.events), is_active: false } as never)
    .select("id")
    .single();
  if (error || !dibuat) return apiError("INTERNAL_ERROR", 500);
  const id = (dibuat as { id: string }).id;

  if (!(await tulisAkses(client, id, parsed.data.role, parsed.data.events, auth.user.id))) {
    await client.from("users").delete().eq("id", id);
    return apiError("INTERNAL_ERROR", 500, { message: "Event access could not be saved, so the account was not created. Try again." });
  }

  const { data, error: galatAktif } = await client
    .from("users")
    .update({ is_active: parsed.data.is_active ?? true } as never)
    .eq("id", id)
    .select("id,username,role,booth_id,is_active")
    .single();
  if (galatAktif) return apiError("INTERNAL_ERROR", 500, { message: "The account was created but could not be activated. Open it and turn Active on." });
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "user_create", payload: { user: data, events: parsed.data.events } } as never);
  return Response.json({ user: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const client = getSupabaseServiceClient();

  const { data: current } = await client.from("users").select("id,username,role,booth_id,is_active").eq("id", parsed.data.id).maybeSingle() as { data: UserRow | null };
  // Bagi yang bukan pengelola akun, id tak dikenal dijawab sama dengan id di luar
  // cakupannya (403), supaya tanggapannya tidak membocorkan id mana yang ada.
  if (!current) return canManageUsers(auth.user) ? apiError("USER_NOT_FOUND", 404) : apiError("FORBIDDEN", 403);

  // Klien hanya boleh mereset PIN operator booth/kasir supaya tidak perlu
  // menghubungi pemilik saat ada yang lupa PIN di hari-H. Selain itu, seluruh
  // perubahan akun milik super_admin.
  if (!canManageUsers(auth.user)) {
    const onlyPinChange = parsed.data.pin !== undefined
      && parsed.data.username === undefined
      && parsed.data.role === undefined
      && parsed.data.booth_id === undefined
      && parsed.data.is_active === undefined
      && parsed.data.events === undefined;
    if (!onlyPinChange) return apiError("FORBIDDEN", 403);
    if (!canResetOperatorPin(auth.user, current.role as UserRole)) return apiError("FORBIDDEN", 403);
    // Peran global saja tidak cukup: target harus ada di acara tempat pemanggil
    // berperan admin. Tanpa ini admin klien A bisa mereset PIN akun booth klien
    // B lewat id-nya dan mengambil alih akun itu.
    const aksesTerkait = await semuaHalaman<BarisAkses>((dari, sampai) =>
      client.from("user_event_access").select("user_id,event_id,role").in("user_id", [auth.user.id, current.id]).order("user_id").order("event_id").range(dari, sampai));
    if (aksesTerkait.error) return apiError("INTERNAL_ERROR", 500);
    // Acara terarsip tidak lagi memberi wewenang atas akun di dalamnya.
    const idAcara = [...new Set(aksesTerkait.data.map((baris) => baris.event_id))];
    const terarsip = idAcara.length === 0 ? { data: [], error: null } : await client.from("events").select("id").in("id", idAcara).not("archived_at", "is", null);
    if (terarsip.error) return apiError("INTERNAL_ERROR", 500);
    const arsip = new Set(((terarsip.data ?? []) as { id: string }[]).map((event) => event.id));
    if (!bolehResetPin(auth.user.id, current.id, aksesTerkait.data.filter((baris) => !arsip.has(baris.event_id)))) return apiError("FORBIDDEN", 403);

    // Reset PIN menulis PIN SAJA. Menulis ulang peran dan booth di sini membuat
    // akun booth lama tanpa users.booth_id gagal direset.
    const pinHash = await bcrypt.hash(parsed.data.pin as string, PIN_HASH_ROUNDS);
    const { data, error } = await client.from("users").update({ pin_hash: pinHash } as never).eq("id", current.id).select("id,username,role,booth_id,is_active").single();
    if (error) return apiError("INTERNAL_ERROR", 500);
    await client.from("audit_logs").insert({ user_id: auth.user.id, action: "user_pin_reset", payload: { user: { id: current.id, username: current.username } } } as never);
    return Response.json({ user: data });
  }

  const nextRole = (parsed.data.role ?? current.role) as UserRole;
  if (parsed.data.events) {
    // Akun yang acaranya tinggal acara terarsip tetap punya acara (baris arsip
    // tidak ikut diganti), jadi daftar kosong dari layar tidak boleh ditolak
    // karena "minimal satu acara": tanpa ini akun itu tidak bisa di-reset PIN-nya
    // atau dinonaktifkan dari layar.
    const arsip = nextRole === "super_admin" || parsed.data.events.length > 0 ? [] : await acaraArsip(client, current.id);
    if (arsip === null) return apiError("INTERNAL_ERROR", 500);
    const aturan = arsip.length > 0 ? null : periksaAkses(nextRole, nextRole === "super_admin" ? [] : parsed.data.events);
    if (aturan) return apiError("VALIDATION_ERROR", 422, { message: aturan });
    const galatAcara = await periksaAcaraBooth(client, nextRole === "super_admin" ? [] : parsed.data.events);
    if (galatAcara) return apiError("VALIDATION_ERROR", 422, { message: galatAcara });
  }
  // Peran yang berubah ke Booth staff, atau keluar dari Super admin, butuh daftar
  // acaranya sekalian: baris booth wajib ber-booth, dan akun non-super tanpa
  // acara tidak bisa membuka apa pun.
  const perluDaftar = nextRole !== current.role && (nextRole === "booth" || current.role === "super_admin");
  if (perluDaftar && !parsed.data.events) return apiError("VALIDATION_ERROR", 422, { message: "Add the events for this role." });
  // Menjadi Booth staff tanpa acara aktif: baris arsip tanpa booth akan dihapus
  // dan tidak ada acara yang bisa diberi booth, jadi akunnya tertinggal tanpa
  // acara. Pesan "pilih booth" di bawah tidak bisa dipenuhi dari layar.
  if (nextRole === "booth" && current.role !== "booth" && parsed.data.events?.length === 0) {
    return apiError("VALIDATION_ERROR", 422, { message: "Add an active event first." });
  }
  const nextBoothId = nextRole !== "booth" ? null
    : (parsed.data.events ? boothLama(nextRole, parsed.data.events) : null) ?? parsed.data.booth_id ?? current.booth_id;
  if (nextRole === "booth" && !nextBoothId) return apiError("VALIDATION_ERROR", 422, { message: "Choose a booth for each event." });

  // Jaga super_admin terakhir. Guard lama hanya menjaga `admin`, yang setelah
  // pemisahan role tidak lagi cukup: menurunkan super_admin terakhir menjadi admin
  // akan menghapus akses reset data dan kelola user dari seluruh sistem, tanpa
  // jalan pulih dari dalam aplikasi. Trigger database menjaga hal yang sama;
  // pemeriksaan di sini hanya agar pesannya jelas.
  const losingSuperAdmin = current.role === "super_admin" && (nextRole !== "super_admin" || parsed.data.is_active === false);
  if (losingSuperAdmin) {
    const { count } = await client.from("users").select("id", { count: "exact", head: true }).eq("role", "super_admin").eq("is_active", true);
    if ((count ?? 0) <= 1) return apiError("VALIDATION_ERROR", 422, { message: "At least one active super admin must remain." });
  }

  if (parsed.data.username && parsed.data.username !== current.username) {
    const { data: taken } = await client.from("users").select("id").eq("username", parsed.data.username).neq("id", parsed.data.id).maybeSingle() as { data: { id: string } | null };
    if (taken) return apiError("USERNAME_TAKEN", 409, { field: "username", message: "This username is taken. Choose another." });
  }

  const update: Record<string, unknown> = {
    role: nextRole,
    booth_id: nextBoothId,
  };
  if (parsed.data.username) update.username = parsed.data.username;
  if (typeof parsed.data.is_active === "boolean") update.is_active = parsed.data.is_active;
  if (parsed.data.pin) update.pin_hash = await bcrypt.hash(parsed.data.pin, PIN_HASH_ROUNDS);

  // Akun ditulis dulu, lalu barisnya. Bila baris gagal, akun DAN barisnya
  // dikembalikan ke keadaan sebelumnya (kecuali PIN baru, yang tetap berlaku),
  // dari salinan yang diambil di sini.
  const salinan = await client.from("user_event_access").select("user_id,event_id,role,booth_id,granted_at,granted_by").eq("user_id", current.id);
  if (salinan.error) return apiError("INTERNAL_ERROR", 500);
  const barisAwal = (salinan.data ?? []) as { event_id: string; booth_id: number | null }[];
  const { data, error } = await client.from("users").update(update as never).eq("id", parsed.data.id).select("id,username,role,booth_id,is_active").single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  let barisOk = true;
  let dihapusArsip: string[] = [];
  if (parsed.data.events || nextRole === "super_admin") {
    // Naik ke Super admin menghapus semua baris (tanpa baris = semua acara).
    barisOk = await tulisAkses(client, current.id, nextRole, parsed.data.events ?? [], auth.user.id);
  }
  if (barisOk && nextRole !== current.role && nextRole !== "super_admin") {
    // Ganti peran menyamakan peran di SEMUA baris akun, termasuk baris acara
    // terarsip yang tidak ikut diganti di atas; tanpa ini Admin yang diturunkan
    // tetap Admin di acara terarsipnya. Booth dilepas bila peran baru bukan
    // Booth staff. Menjadi Booth staff: baris tanpa booth (hanya mungkin baris
    // arsip, baris aktif sudah ber-booth) tidak sah untuk peran itu dan dihapus.
    if (nextRole === "booth") {
      const { data: terhapus, error: galatTanpaBooth } = await client.from("user_event_access").delete().eq("user_id", current.id).is("booth_id", null).select("event_id");
      barisOk = !galatTanpaBooth;
      dihapusArsip = ((terhapus ?? []) as { event_id: string }[]).map((b) => b.event_id);
    }
    if (barisOk) {
      const ubah: Record<string, unknown> = { role: nextRole };
      if (nextRole !== "booth") ubah.booth_id = null;
      const { error: galatPeran } = await client.from("user_event_access").update(ubah as never).eq("user_id", current.id);
      barisOk = !galatPeran;
    }
  }
  if (!barisOk) {
    await client.from("users").update({ role: current.role, booth_id: current.booth_id, username: current.username, is_active: current.is_active } as never).eq("id", current.id);
    const { error: galatKosong } = await client.from("user_event_access").delete().eq("user_id", current.id);
    const { error: galatPulih } = galatKosong || salinan.data?.length === 0 ? { error: galatKosong } : await client.from("user_event_access").insert(salinan.data as never);
    if (galatKosong || galatPulih) {
      await client.from("audit_logs").insert({ user_id: auth.user.id, action: "user_update_restore_failed", payload: { user: { id: current.id, username: current.username }, rows: salinan.data } } as never);
      return apiError("INTERNAL_ERROR", 500, { message: "Event access could not be saved, and the previous access could not be fully restored. Check this account's events." });
    }
    return apiError("INTERNAL_ERROR", 500, { message: "Event access could not be saved, so the account was left as it was. Try again." });
  }

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "user_update",
    payload: { old: current, new: data, events: parsed.data.events, old_events: barisAwal.map((b) => ({ event_id: b.event_id, booth_id: b.booth_id })), removed_archived: dihapusArsip },
  } as never);
  return Response.json({ user: data });
}
