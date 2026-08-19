import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Terima satu suara dari HP peserta. Tanpa login.
 *
 * TIDAK di-cache dan tidak boleh: ini satu-satunya jalur menulis di sisi publik.
 */

const bodySchema = z.object({
  poll_id: z.number().int().positive(),
  /** Pilihan tunggal & ganda. */
  option_ids: z.array(z.number().int().positive()).max(20).default([]),
  /** Rating. */
  rating: z.number().int().min(1).max(10).nullish(),
  /** Word cloud. */
  words: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
  /** Mode `participant_code`. */
  code: z.string().trim().max(100).nullish(),
  /** Mode `participant_pick`. */
  participant_id: z.string().uuid().nullish(),
  /** Mode `name_text`. */
  name: z.string().trim().max(120).nullish(),
});

/**
 * Nama cookie penanda perangkat.
 *
 * `httpOnly` supaya tidak bisa dibaca atau ditulis skrip halaman, `sameSite
 * lax` supaya ikut terkirim saat peserta membuka tautan dari QR, dan umur 12
 * jam — cukup untuk satu hari acara, tidak menetap di HP orang berbulan-bulan
 * setelahnya.
 *
 * Ini bukan pengaman kuat, dan tidak berpura-pura begitu: cookie yang dihapus
 * memberi suara kedua. Karena itu mode yang memakainya diberi peringatan di
 * CMS, dan mode kode peserta ada untuk voting yang hasilnya menentukan sesuatu.
 */
const DEVICE_COOKIE = "vote_device";
const DEVICE_MAX_AGE = 60 * 60 * 12;

export async function POST(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return apiError("VALIDATION_ERROR", 404, { message: "Acara tidak ditemukan." });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const client = getSupabaseServiceClient();

  // Mode dan tipe dibaca dari DATABASE, bukan dari badan permintaan. Klien yang
  // menentukan modenya sendiri akan selalu memilih yang paling longgar.
  const { data: poll } = await client
    .from("vote_polls").select("id,voter_mode,type,status")
    .eq("id", body.data.poll_id).eq("event_id", event.id).maybeSingle();
  if (!poll) return apiError("VOTE_POLL_NOT_FOUND", 404);

  const row = poll as { id: number; voter_mode: string; type: string; status: string };

  let voterKey: string;
  let participantId: string | null = null;
  let displayName: string | null = null;
  let issueCookie: string | null = null;

  /** Kunci perangkat, dibuat di SERVER. Nilai kiriman klien dapat dikarang
   *  sendiri, sehingga satu orang bisa membuat kunci baru tiap kali memilih. */
  async function deviceKey() {
    const jar = await cookies();
    const existing = jar.get(DEVICE_COOKIE)?.value;
    const device = existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : randomUUID();
    if (device !== existing) issueCookie = device;
    return `dev:${device}`;
  }

  if (row.voter_mode === "participant_code") {
    const code = body.data.code?.trim();
    if (!code) return apiError("VOTE_INVALID_REQUEST", 422, { message: "Isi kode peserta di badge Anda." });
    const { data: participant } = await client
      .from("participants").select("id,name,source_removed_at")
      .eq("event_id", event.id).eq("qr_code", code).maybeSingle();
    const found = participant as { id: string; name: string; source_removed_at: string | null } | null;
    // Peserta yang sudah ditandai terhapus di sumber ikut ditolak: ia tidak lagi
    // hadir di acara, dan barisnya hanya disimpan untuk audit.
    if (!found || found.source_removed_at) return apiError("VOTE_CODE_NOT_FOUND", 404);
    voterKey = `pt:${found.id}`;
    participantId = found.id;
    displayName = found.name;

  } else if (row.voter_mode === "participant_pick") {
    if (!body.data.participant_id) return apiError("VOTE_INVALID_REQUEST", 422, { message: "Pilih nama Anda dari daftar." });
    // Id yang dikirim tetap DIPERIKSA milik event ini. Tanpa itu, id peserta
    // acara lain yang bocor dari mana pun dapat dipakai memberi suara di sini.
    const { data: participant } = await client
      .from("participants").select("id,name,source_removed_at")
      .eq("event_id", event.id).eq("id", body.data.participant_id).maybeSingle();
    const found = participant as { id: string; name: string; source_removed_at: string | null } | null;
    if (!found || found.source_removed_at) return apiError("VOTE_CODE_NOT_FOUND", 404);
    voterKey = `pt:${found.id}`;
    participantId = found.id;
    displayName = found.name;

  } else if (row.voter_mode === "name_text") {
    const name = body.data.name?.trim();
    if (!name) return apiError("VOTE_INVALID_REQUEST", 422, { message: "Isi nama Anda lebih dulu." });
    // Kuncinya PERANGKAT, bukan namanya. Nama yang diketik bebas tidak dapat
    // dijadikan kunci: dua orang bernama sama akan saling menghalangi, dan satu
    // orang bisa memilih berkali-kali hanya dengan mengubah satu huruf.
    voterKey = await deviceKey();
    displayName = name;

  } else {
    voterKey = await deviceKey();
  }

  const { data, error } = await client.rpc("cast_vote" as never, {
    p_event_id: event.id,
    p_poll_id: row.id,
    p_voter_key: voterKey,
    p_option_ids: body.data.option_ids,
    p_participant_id: participantId,
    p_display_name: displayName,
    p_rating: body.data.rating ?? null,
    p_words: body.data.words,
  } as never);

  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : code === "VOTE_ALREADY_CAST" ? 409 : 422);
  }

  const response = Response.json({ ...(data as Record<string, unknown>), voter: displayName });
  if (issueCookie) {
    // Cookie disetel pada balasan SUKSES saja. Disetel lebih awal, permintaan
    // yang gagal karena alasan lain tetap meninggalkan penanda perangkat baru,
    // dan percobaan kedua dari orang yang sama akan dianggap perangkat lain.
    response.headers.append(
      "Set-Cookie",
      `${DEVICE_COOKIE}=${issueCookie}; Path=/; Max-Age=${DEVICE_MAX_AGE}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
  }
  return response;
}
