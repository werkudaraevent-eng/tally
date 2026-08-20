import { apiError, mapDatabaseError } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { FIELD_KEY_PATTERN } from "@/lib/registration-fields";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";

/**
 * Unggahan berkas dari form pendaftaran publik.
 *
 * Endpoint kedua di aplikasi ini yang menerima tulisan TANPA login, dan yang
 * paling berisiko dari keduanya: yang satu menulis baris, yang ini menulis
 * berkas. Empat penjaga, dan tidak satu pun boleh dilepas:
 *
 *   1. Bucket PRIVAT. `display-assets` yang dipakai admin bersifat public-read
 *      karena isinya logo dan latar layar. Di sini isinya milik pendaftar dan
 *      bisa berupa kartu identitas — URL permanen yang bisa dibuka siapa saja
 *      adalah kebocoran data pribadi, bukan sekadar kelemahan teknis. Yang
 *      dikembalikan ke klien adalah id baris, bukan URL.
 *   2. Field-nya harus benar-benar ada di konfigurasi event DAN bertipe `file`.
 *      Tanpa itu endpoint ini menjadi penyimpanan berkas gratis untuk siapa pun
 *      yang tahu URL-nya.
 *   3. SVG DITOLAK walau ia gambar. Berkas SVG dapat memuat <script>, dan
 *      sekali dibuka dari domain yang sama ia berjalan sebagai skrip halaman.
 *   4. Pembatasan laju per IP, memakai tabel unggahan itu sendiri sebagai
 *      penghitung.
 */

const MAX_BYTES = 5 * 1024 * 1024;

// Daftar tertutup, bukan pemeriksaan "diawali image/". Awalan itu meloloskan
// image/svg+xml, dan itu justru satu-satunya tipe gambar yang berbahaya di sini.
const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
]);

const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 20;

function clientIp(request: Request): string | null {
  const chain = request.headers.get("x-forwarded-for");
  if (chain) return chain.split(",")[0].trim() || null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return apiError("VALIDATION_ERROR", 404, { message: "Acara tidak ditemukan." });
  if (!event.registration_enabled) return apiError("REGISTRATION_CLOSED", 422);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const fieldKeyRaw = form?.get("field_key");

  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", 422, { file: "Berkas tidak ditemukan." });
  if (typeof fieldKeyRaw !== "string" || !FIELD_KEY_PATTERN.test(fieldKeyRaw)) {
    return apiError("VALIDATION_ERROR", 422, { field_key: "Field tidak dikenali." });
  }

  // Field harus ada di konfigurasi DAN bertipe file. Memeriksa keberadaannya
  // saja tidak cukup: tanpa pemeriksaan tipe, berkas bisa dititipkan pada kunci
  // field teks mana pun.
  const config = (event.registration_form_config ?? {}) as RegistrationFormConfig;
  const field = ((config.fields ?? []) as RegistrationField[]).find((item) => item.key === fieldKeyRaw);
  if (!field || field.type !== "file") {
    return apiError("VALIDATION_ERROR", 422, { field_key: "Field tidak menerima unggahan berkas." });
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) return apiError("VALIDATION_ERROR", 422, { file: "Format harus PNG, JPG, WebP, atau PDF." });
  if (file.size === 0 || file.size > MAX_BYTES) {
    return apiError("VALIDATION_ERROR", 422, { file: "Ukuran berkas maksimal 5 MB." });
  }

  const client = getSupabaseServiceClient();
  const ip = clientIp(request);

  if (ip) {
    const sejak = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await client
      .from("registration_uploads")
      .select("id", { head: true, count: "exact" })
      .eq("event_id", event.id)
      .eq("submitted_ip", ip)
      .gte("created_at", sejak);
    if ((count ?? 0) >= RATE_LIMIT) {
      return apiError("VALIDATION_ERROR", 429, {
        message: "Terlalu banyak unggahan dari perangkat ini. Tunggu 10 menit, lalu coba lagi.",
      });
    }
  }

  // Nama berkas dibuang, tidak dipakai sebagai path. Nama dari pengguna dapat
  // memuat karakter path, dan dua orang yang mengunggah "ktp.jpg" akan saling
  // menimpa. Nama aslinya tetap disimpan di baris database, hanya untuk
  // ditampilkan ke admin.
  const path = `${event.id}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await client.storage
    .from("registration-uploads")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadError) return apiError("INTERNAL_ERROR", 500);

  const { data, error } = await client.rpc("record_registration_upload" as never, {
    p_event_id: event.id,
    p_field_key: fieldKeyRaw,
    p_storage_path: path,
    p_original_name: file.name.slice(0, 200),
    p_mime_type: file.type,
    p_size_bytes: file.size,
    p_ip: ip,
  } as never);

  if (error) {
    // Baris gagal ditulis berarti berkasnya yatim sejak detik pertama dan tidak
    // akan pernah punya pemilik. Dihapus sekarang, bukan diserahkan ke
    // pembersih berkala: pembersih itu mencari baris, dan baris inilah yang
    // gagal dibuat.
    await client.storage.from("registration-uploads").remove([path]);
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }

  // Id baris, BUKAN URL. Klien menyimpannya sebagai jawaban field, dan hanya
  // server yang bisa menukarnya menjadi tautan yang bisa dibuka.
  return Response.json({ id: data as unknown as string, name: file.name, size: file.size });
}
