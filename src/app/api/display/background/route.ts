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
// `undian` dan `vote` menyusul: gambar hadiah undian sudah lama mengirim
// kind="undian" tetapi belum terdaftar di sini, sehingga selama ini jatuh ke
// folder backgrounds — bekerja, tetapi menaruh gambar hadiah bercampur dengan
// latar layar dan mempersulit penelusuran saat panitia mencari berkas salah unggah.
// `badge`: latar depan dan belakang badge kertas yang dirancang di luar Tally.
const FOLDERS = new Set(["backgrounds", "logos", "footers", "undian", "vote", "landing", "email", "badge"]);

/**
 * Jenis gambar dari isi berkasnya, bukan dari `file.type`.
 *
 * `file.type` ditulis klien. Berkas teks yang dikirim dengan label image/png
 * lolos pemeriksaan lama dan tersimpan di bucket publik sebagai .png. Tiga
 * tanda tangan di bawah adalah satu-satunya format yang diterima di sini.
 */
function jenisDariIsi(awal: Uint8Array): string | null {
  const cocok = (offset: number, bytes: number[]) => bytes.every((b, i) => awal[offset + i] === b);
  if (cocok(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (cocok(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (cocok(0, [0x52, 0x49, 0x46, 0x46]) && cocok(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

// Admin uploads a Papan peringkat background image; stored in a public-read bucket
// and returned as a public URL to be saved into display_settings.
export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", 422, { file: "File tidak ditemukan." });

  if (!ALLOWED.has(file.type)) return apiError("VALIDATION_ERROR", 422, { file: "Format harus PNG, JPG, atau WebP." });
  if (file.size === 0 || file.size > MAX_BYTES) return apiError("VALIDATION_ERROR", 422, { file: "Ukuran gambar maksimal 5 MB." });

  // Nilai tak dikenal jatuh ke `backgrounds`, bukan ditolak: pemakai lama endpoint
  // ini tidak mengirim `kind` sama sekali dan harus tetap bekerja seperti dulu.
  const kindRaw = form?.get("kind");
  const kind = typeof kindRaw === "string" && FOLDERS.has(kindRaw) ? kindRaw : "backgrounds";

  const buffer = Buffer.from(await file.arrayBuffer());
  const jenis = jenisDariIsi(buffer.subarray(0, 12));
  if (!jenis) return apiError("VALIDATION_ERROR", 422, { file: "Isi berkas bukan gambar PNG, JPG, atau WebP." });

  const client = getSupabaseServiceClient();
  const path = `${kind}/${Date.now()}-${crypto.randomUUID()}.${ALLOWED.get(jenis)}`;
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, { contentType: jenis, upsert: false });
  if (error) return apiError("INTERNAL_ERROR", 500);

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "display_background_upload", payload: { path, url: data.publicUrl } } as never);
  return Response.json({ url: data.publicUrl });
}
