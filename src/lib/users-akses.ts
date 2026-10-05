/**
 * Akses per acara yang boleh dilihat pemanggil di Users & roles.
 *
 * Super admin melihat semuanya. Admin hanya melihat acara yang ia sendiri pegang
 * (aturan yang sama dengan GET /api/events): tanpa saringan ini, admin acara A
 * bisa membaca nama, slug, dan panitia acara B yang tidak pernah dibagikan
 * kepadanya. Saringannya di server, bukan di tabel klien: yang tidak boleh
 * dilihat tidak boleh ikut terkirim.
 *
 * Fungsi murni, supaya aturannya diperiksa oleh users-akses.check.ts tanpa
 * database.
 */
export type BarisAkses = { user_id: string; event_id: string; role: string };
export type AcaraRingkas = { id: string; slug: string; name: string };
export type AksesTampil = AcaraRingkas & { role: string };

export function acaraTerlihat(pemanggil: { id: string; role: string }, akses: BarisAkses[]): Set<string> | "semua" {
  if (pemanggil.role === "super_admin") return "semua";
  return new Set(akses.filter((baris) => baris.user_id === pemanggil.id).map((baris) => baris.event_id));
}

export function aksesPerUser(
  pemanggil: { id: string; role: string },
  akses: BarisAkses[],
  acara: AcaraRingkas[],
): Map<string, AksesTampil[]> {
  const boleh = acaraTerlihat(pemanggil, akses);
  const acaraById = new Map(acara.map((event) => [event.id, event]));
  const hasil = new Map<string, AksesTampil[]>();
  for (const baris of akses) {
    if (boleh !== "semua" && !boleh.has(baris.event_id)) continue;
    const event = acaraById.get(baris.event_id);
    if (!event) continue;
    const daftar = hasil.get(baris.user_id) ?? [];
    daftar.push({ id: event.id, slug: event.slug, name: event.name, role: baris.role });
    hasil.set(baris.user_id, daftar);
  }
  for (const daftar of hasil.values()) daftar.sort((a, b) => a.name.localeCompare(b.name));
  return hasil;
}

/**
 * Akun yang boleh dilihat pemanggil di Users & roles.
 *
 * Super admin melihat semua akun. Admin hanya melihat akun yang punya akses ke
 * salah satu acaranya, dan TIDAK PERNAH melihat super admin: tanpa saringan ini
 * admin klien A bisa membaca username admin dan operator klien B, termasuk
 * jumlahnya lewat angka di tab peran.
 */
export function akunTerlihat<T extends { id: string; role: string }>(
  pemanggil: { id: string; role: string },
  akses: BarisAkses[],
  akun: T[],
): T[] {
  const boleh = acaraTerlihat(pemanggil, akses);
  if (boleh === "semua") return akun;
  const berbagi = new Set(akses.filter((baris) => boleh.has(baris.event_id)).map((baris) => baris.user_id));
  return akun.filter((user) => user.role !== "super_admin" && berbagi.has(user.id));
}

/**
 * Bolehkah admin mereset PIN akun `target`.
 *
 * Hanya bila target punya akses ke acara tempat pemanggil berperan ADMIN. Peran
 * global saja tidak cukup: admin klien A tidak boleh mengambil alih akun booth
 * klien B hanya karena mengetahui id-nya. Super admin tidak melewati fungsi ini.
 */
export function bolehResetPin(pemanggilId: string, targetId: string, akses: BarisAkses[]): boolean {
  const acaraAdmin = new Set(
    akses.filter((baris) => baris.user_id === pemanggilId && baris.role === "admin").map((baris) => baris.event_id),
  );
  return akses.some((baris) => baris.user_id === targetId && acaraAdmin.has(baris.event_id));
}

/** Satu baris akses yang dikirim layar Users & roles: acara, dan booth bila Booth staff. */
export type AksesMasuk = { event_id: string; booth_id: number | null };

/**
 * Aturan akses akun, ditegakkan di server (layar hanya meniru):
 * - selain Super admin, akun wajib punya minimal satu acara;
 * - satu acara satu baris;
 * - Booth staff wajib memilih booth di setiap acara.
 * Super admin tidak boleh punya baris sama sekali: "tanpa baris = semua acara".
 * Mengembalikan pesan galat dalam bahasa Inggris, atau null bila sah.
 */
export function periksaAkses(role: string, baris: AksesMasuk[]): string | null {
  if (role === "super_admin") return baris.length > 0 ? "Super admins open every event and can't be limited to some." : null;
  if (baris.length === 0) return "Add at least one event.";
  if (new Set(baris.map((b) => b.event_id)).size !== baris.length) return "Each event can only be added once.";
  if (role === "booth" && baris.some((b) => !b.booth_id)) return "Choose a booth for each event.";
  return null;
}
