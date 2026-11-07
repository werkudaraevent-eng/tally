import { createCipheriv, randomBytes } from "node:crypto";
import { bagiGelombang, hasilGelombang, jadwalCahaya, padHasil, type CahayaJadwal, type CahayaKode } from "@/lib/undian-cahaya";

/**
 * Bagian Cahaya HP di undian_state.pending. Seluruhnya server-only: `keys` dan
 * `map` tidak pernah dikirim apa adanya. Yang publik hanya `jadwal`
 * (waktu + jumlah sisa, tanpa siapa pun) dan kunci yang waktunya sudah lewat.
 */
export type CahayaPending = {
  jadwal: CahayaJadwal;
  /** Satu kunci AES-128 (base64) per gelombang. */
  keys: string[];
  /** uuid peserta -> kode (lib/undian-cahaya.ts CahayaKode). Entri tanpa peserta tidak dicatat: mereka tidak punya HP di portal. */
  map: Record<string, CahayaKode>;
};

export function siapkanCahaya(
  pool: { kind: "participant" | "entry"; ref: string }[],
  winners: { kind: "participant" | "entry"; ref: string; is_backup: boolean; slot_order: number }[],
  start: number,
  end: number,
): CahayaPending {
  const jadwal = jadwalCahaya(pool.length, winners.length, start, end);
  // Kunci rujukan dibuat unik per jenis: id entri ("12") tidak boleh bertabrakan dengan uuid.
  const key = (item: { kind: string; ref: string }) => `${item.kind}:${item.ref}`;
  const semua = bagiGelombang(pool.map(key), winners.map((winner) => ({ ...winner, ref: key(winner) })), jadwal);
  const map: Record<string, CahayaKode> = {};
  for (const item of pool) if (item.kind === "participant") map[item.ref] = semua[key(item)];
  return { jadwal, keys: jadwal.waves.map(() => randomBytes(16).toString("base64")), map };
}

/** Kotak terkunci per gelombang untuk satu kode: base64(iv) dan base64(sandi||tag), cocok dengan WebCrypto AES-GCM. */
export function segelHasil(kode: CahayaKode, keys: string[]): { iv: string; ct: string }[] {
  return keys.map((key, index) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-128-gcm", Buffer.from(key, "base64"), iv);
    const body = Buffer.concat([cipher.update(padHasil(hasilGelombang(kode, index + 1, keys.length)), "utf8"), cipher.final(), cipher.getAuthTag()]);
    return { iv: iv.toString("base64"), ct: body.toString("base64") };
  });
}
