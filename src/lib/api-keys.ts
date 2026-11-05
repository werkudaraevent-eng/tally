import { createHash, randomBytes } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * API keys per acara (Event settings > Integrations > API keys).
 *
 * Pola Stripe restricted keys / GitHub fine-grained tokens: satu kunci untuk
 * satu acara, izin yang disebut satu per satu, tampil SEKALI saat dibuat,
 * bisa dicabut, punya masa berlaku, dan "terakhir dipakai". Yang disimpan
 * hanya sha256-nya (migrasi 202611050020), jadi bocornya database tidak
 * membocorkan kunci yang bisa dipakai.
 *
 * Kunci acak 32 byte (256 bit), jadi sha256 tanpa garam sudah cukup: tidak
 * ada kamus yang bisa ditebak, berbeda dengan PIN 6 digit.
 */

export const IZIN = [
  { key: "room_numbers", label: "Room numbers", description: "Set the room number of a room a participant already has. Nothing else." },
] as const;

export type Izin = (typeof IZIN)[number]["key"];

export const AWALAN = "tly_";

/** Kunci baru: awalan + 43 karakter base64url. */
export function buatKunci() {
  const kunci = `${AWALAN}${randomBytes(32).toString("base64url")}`;
  return { kunci, hash: hashKunci(kunci), awalan: kunci.slice(0, AWALAN.length + 4) };
}

export function hashKunci(kunci: string) {
  return createHash("sha256").update(kunci).digest("hex");
}

export type KunciAktif = { id: string; event_id: string; name: string; scopes: string[] };

/**
 * Kunci dari header `Authorization: Bearer ...` yang masih berlaku dan punya
 * `izin`. Null untuk apa pun yang lain; pemanggil menjawab 401 tanpa
 * menjelaskan sebabnya (dicabut, kedaluwarsa, salah) agar tidak membantu
 * orang yang menebak.
 */
export async function kunciDariRequest(request: Request, izin: Izin): Promise<KunciAktif | null> {
  const diberikan = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!diberikan.startsWith(AWALAN) || diberikan.length > 100) return null;
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from("api_keys")
    .select("id,event_id,name,scopes,expires_at,revoked_at")
    .eq("key_hash", hashKunci(diberikan))
    .maybeSingle();
  if (error || !data) return null;
  const baris = data as { id: string; event_id: string; name: string; scopes: string[]; expires_at: string | null; revoked_at: string | null };
  if (baris.revoked_at) return null;
  if (baris.expires_at && new Date(baris.expires_at).getTime() <= Date.now()) return null;
  if (!baris.scopes.includes(izin)) return null;
  // Ditunggu: di serverless, janji yang tidak ditunggu bisa terputus saat fungsi selesai.
  // Gagalnya tidak menolak permintaan; "terakhir dipakai" hanya keterangan.
  await db.from("api_keys").update({ last_used_at: new Date().toISOString() } as never).eq("id", baris.id);
  return { id: baris.id, event_id: baris.event_id, name: baris.name, scopes: baris.scopes };
}
