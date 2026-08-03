import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const BUCKET = "display-assets";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

// Folder tujuan, dipilih dari daftar tertutup lewat field `kind`.
//
// Endpoint ini kini melayani tiga jenis gambar: latar layar, logo header, dan
// blok sponsor footer. Semuanya memakai aturan format dan ukuran yang sama, jadi
// membuat endpoint terpisah hanya akan menggandakan aturan itu — dan begitu salah
// satu diubah, ketiganya akan berbeda tanpa ada yang sadar.
//
// Yang dipisah hanya foldernya, supaya isi bucket masih bisa ditelusuri panitia
// saat mencari berkas yang salah unggah. Daftar tertutup, bukan nilai bebas dari
// klien: tanpa itu `kind` menjadi jalan untuk menulis ke path mana pun di bucket.
const FOLDERS = new Set(["backgrounds", "logos", "footers"]);

// Admin uploads a Live Display background image; stored in a public-read bucket
// and returned as a public URL to be saved into display_settings.
export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", 422, { file: "File tidak ditemukan." });

  const ext = ALLOWED.get(file.type);
  if (!ext) return apiError("VALIDATION_ERROR", 422, { file: "Format harus PNG, JPG, atau WebP." });
  if (file.size === 0 || file.size > MAX_BYTES) return apiError("VALIDATION_ERROR", 422, { file: "Ukuran gambar maksimal 5 MB." });

  // Nilai tak dikenal jatuh ke `backgrounds`, bukan ditolak: pemakai lama endpoint
  // ini tidak mengirim `kind` sama sekali dan harus tetap bekerja seperti dulu.
  const kindRaw = form?.get("kind");
  const kind = typeof kindRaw === "string" && FOLDERS.has(kindRaw) ? kindRaw : "backgrounds";

  const client = getSupabaseServiceClient();
  const path = `${kind}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return apiError("INTERNAL_ERROR", 500);

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "display_background_upload", payload: { path, url: data.publicUrl } } as never);
  return Response.json({ url: data.publicUrl });
}
