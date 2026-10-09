/**
 * Sama atau tidak dua nilai JSON, tanpa peduli urutan kunci objek dan kunci
 * bernilai undefined. Dipakai PATCH /api/admin/speakers untuk memeriksa bahwa
 * daftar pembicara yang tersimpan masih sama dengan yang dilihat layar
 * pengirim: jsonb Postgres menyusun ulang kunci objek, jadi perbandingan
 * JSON.stringify biasa akan salah menyebut "berubah".
 */
export function samaJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((nilai, i) => samaJson(nilai, b[i]));
  const isiA = Object.entries(a as Record<string, unknown>).filter(([, nilai]) => nilai !== undefined);
  const isiB = new Map(Object.entries(b as Record<string, unknown>).filter(([, nilai]) => nilai !== undefined));
  return isiA.length === isiB.size && isiA.every(([kunci, nilai]) => isiB.has(kunci) && samaJson(nilai, isiB.get(kunci)));
}
