import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { klien } from "@/lib/logistik/server";

/**
 * Aturan kamar: field mana yang berisi jenis kelamin, dan apakah kamar wajib
 * sesama jenis kelamin.
 *
 * Satu baris per acara, dibuat saat pertama kali disimpan. Tanpa barisnya,
 * `assign_room` memakai bawaan: aturan menyala, field belum dipilih, sehingga
 * penempatan ditolak sampai field dipilih. Itu disengaja: kamar campuran yang
 * lolos karena setelan belum disentuh baru ketahuan saat tamu check-in.
 */
const schema = z.object({
  gender_field_key: z.string().trim().max(40).nullable().optional(),
  enforce_same_gender: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await klien()
    .from("lodging_settings")
    .upsert({
      event_id: auth.scope.event.id,
      ...parsed.data,
      gender_field_key: parsed.data.gender_field_key === undefined ? undefined : parsed.data.gender_field_key || null,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never, { onConflict: "event_id" })
    .select("gender_field_key,enforce_same_gender")
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json(data);
}
