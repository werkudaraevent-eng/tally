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
