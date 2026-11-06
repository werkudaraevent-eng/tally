import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BUCKET_MUSIK, JENIS_MUSIK, MUSIK_MAKS_BYTE, SLOT_MUSIK, jenisMusik, pathMusik } from "@/lib/undian-musik";

// Signed upload URL untuk satu lagu undian (Stage display > Music).
//
// Lagu biasanya 3-10 MB, di atas batas body fungsi Vercel, jadi berkasnya tidak
// lewat server: server memeriksa jenis dan ukuran yang dinyatakan, membuat path
// di folder event ini, lalu browser mengunggah langsung ke storage. Bucket
// sendiri menolak jenis di luar daftar dan berkas di atas 15 MB, jadi klien yang
// berbohong tentang ukuran atau jenis tetap tertahan di sana.
//
// URL publik yang dikembalikan baru berlaku setelah disimpan lewat PATCH
// settings, yang hanya menerima URL dari bucket ini (musikSah).

const bodySchema = z.object({
  slot: z.enum(SLOT_MUSIK),
  name: z.string().trim().min(1).max(200),
  type: z.string().max(100),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { slot, name, type, size } = parsed.data;

  const jenis = jenisMusik(type, name);
  if (!jenis) return apiError("VALIDATION_ERROR", 422, { file: "Use an MP3, M4A, AAC, OGG or WAV file." });
  if (size > MUSIK_MAKS_BYTE) return apiError("VALIDATION_ERROR", 422, { file: "Music files can be at most 15 MB." });

  const acak = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const path = pathMusik(eventId, slot, Date.now(), acak, name, JENIS_MUSIK[jenis]);

  const client = getSupabaseServiceClient();
  const { data, error } = await client.storage.from(BUCKET_MUSIK).createSignedUploadUrl(path);
  if (error || !data) return apiError("INTERNAL_ERROR", 500);
  const { data: publik } = client.storage.from(BUCKET_MUSIK).getPublicUrl(path);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_music_upload",
    payload: { slot, path, size },
  } as never);
  return Response.json({ path: data.path, token: data.token, content_type: jenis, url: publik.publicUrl });
}
