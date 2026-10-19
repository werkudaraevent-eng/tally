import { participantUpdatableFields, type EventRow, type RegistrationField, type RegistrationFormConfig } from "@/lib/domain";
import { validateAnswers, type FieldIssue } from "@/lib/registration-fields";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { hashToken } from "./account";

/**
 * Lengkapi data: peserta mengisi atau mengubah jawaban pertanyaan yang ditandai
 * "Participants can update this" (participant_update), di /e/<slug>/lengkapi.
 *
 * Dua jalan masuk ke halaman yang sama:
 *   - tautan pribadi dari kiriman "Update details link" (`?t=`, tujuan `data`
 *     di participant_account_tokens), tanpa kata sandi. Berlaku 14 hari dan
 *     boleh dibuka berkali-kali sampai kedaluwarsa, supaya salah ketik bisa
 *     dibetulkan dari email yang sama. Kiriman yang lebih baru mencabut tautan
 *     lama orang itu (cabutTautanLama di mesin.ts).
 *   - sesi area peserta, dari kartu "Lengkapi data" di dashboard.
 */

/** Masa berlaku tautan Lengkapi data, dihitung dari saat kiriman berangkat. */
export const MASA_DATA_MS = 14 * 24 * 60 * 60 * 1000;

export type PesertaLengkapi = {
  id: string;
  name: string;
  email: string | null;
  extra: Record<string, string>;
};

export function updatableFields(event: Pick<EventRow, "registration_form_config">): RegistrationField[] {
  return participantUpdatableFields(event.registration_form_config as RegistrationFormConfig | null);
}

/** Pertanyaan yang masih kosong untuk peserta ini, untuk kartu dashboard dan penerima "Not answered yet". */
export function missingFields(fields: RegistrationField[], extra: Record<string, unknown> | null | undefined): RegistrationField[] {
  return fields.filter((field) => {
    const nilai = extra?.[field.key];
    return typeof nilai !== "string" || !nilai.trim();
  });
}

/** Tautan `?t=` yang masih berlaku: peserta sasarannya dan masa berlakunya. Tidak memakai tautannya. */
export async function readDataToken(eventId: string, token: string): Promise<{ participantId: string; expiresAt: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data } = await getSupabaseServiceClient()
    .from("participant_account_tokens")
    .select("participant_id,expires_at")
    .eq("token_hash", hashToken(token))
    .eq("event_id", eventId)
    .eq("purpose", "data")
    .maybeSingle();
  const baris = data as { participant_id: string | null; expires_at: string } | null;
  if (!baris?.participant_id || new Date(baris.expires_at).getTime() < Date.now()) return null;
  return { participantId: baris.participant_id, expiresAt: baris.expires_at };
}

export async function loadPesertaLengkapi(eventId: string, participantId: string): Promise<PesertaLengkapi | null> {
  const { data } = await getSupabaseServiceClient()
    .from("participants")
    .select("id,name,email,extra")
    .eq("id", participantId)
    .eq("event_id", eventId)
    .is("source_removed_at", null)
    .maybeSingle();
  const baris = data as { id: string; name: string; email: string | null; extra: Record<string, unknown> | null } | null;
  if (!baris) return null;
  const extra: Record<string, string> = {};
  for (const [kunci, nilai] of Object.entries(baris.extra ?? {})) if (typeof nilai === "string") extra[kunci] = nilai;
  return { id: baris.id, name: baris.name, email: baris.email, extra };
}

export type SaveOutcome = { status: "ok" } | { status: "invalid"; issues: FieldIssue[] } | { status: "not_found" } | { status: "no_fields" };

/**
 * Simpan jawaban pertanyaan participant_update yang ADA di `answers` saja;
 * kunci lain diabaikan, dan pertanyaan yang tidak dikirim tidak disentuh
 * (mis. pertanyaan yang baru ditandai setelah halamannya dibuka). Pertanyaan
 * yang dikirim kosong dikosongkan.
 */
export async function saveAnswers(
  event: Pick<EventRow, "id" | "registration_form_config">,
  participantId: string,
  answers: Record<string, string>,
): Promise<SaveOutcome> {
  const semua = updatableFields(event);
  if (semua.length === 0) return { status: "no_fields" };
  const fields = semua.filter((field) => Object.hasOwn(answers, field.key));
  if (fields.length === 0) return { status: "ok" };
  const { issues, clean } = validateAnswers(fields, answers, { enforceRequired: true });
  if (issues.length > 0) return { status: "invalid", issues };
  const kosong = fields.map((field) => field.key).filter((kunci) => !(kunci in clean));
  const { data, error } = await getSupabaseServiceClient().rpc("update_participant_answers" as never, {
    p_event_id: event.id,
    p_participant_id: participantId,
    p_answers: clean,
    p_clear: kosong,
  } as never);
  if (error) throw new Error(error.message);
  return data === true ? { status: "ok" } : { status: "not_found" };
}

/**
 * Pertanyaan yang masih kosong untuk peserta yang sedang masuk, untuk kartu
 * "Lengkapi data" di dashboard. Kosong (kartu tidak tampil) bila acara
 * tidak punya pertanyaan participant_update, akun belum punya baris peserta,
 * atau semuanya sudah terisi. Acara tanpa pertanyaan itu tidak membaca apa pun.
 */
export async function kartuLengkapi(event: Pick<EventRow, "id" | "registration_form_config">, participantId: string | null | undefined): Promise<RegistrationField[]> {
  const fields = updatableFields(event);
  if (fields.length === 0 || !participantId) return [];
  const peserta = await loadPesertaLengkapi(event.id, participantId);
  return peserta ? missingFields(fields, peserta.extra) : [];
}
