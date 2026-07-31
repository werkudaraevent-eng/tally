import { z } from "zod";
import QRCode from "qrcode";
import { apiError } from "@/lib/api";

// QR untuk layar LED. Publik, tanpa login.
//
// Endpoint ini sengaja TIDAK menerima teks bebas. Kalau isi QR bisa ditentukan
// pemanggil, halaman kita berubah menjadi generator QR gratis yang bisa dipakai
// mengarahkan orang ke situs penipuan sambil memakai domain acara ini sebagai
// pembungkusnya. Yang bisa diatur hanya slug sesi; tujuannya selalu /denah pada
// origin yang sama.

const querySchema = z.object({
  sesi: z.string().trim().regex(/^[a-z0-9-]{2,40}$/).optional(),
  // Ukuran dibatasi: nilai raksasa hanya membakar CPU server tanpa menambah
  // ketajaman, karena QR digambar sebagai vektor.
  size: z.coerce.number().int().min(120).max(1400).default(640),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  // Tujuan dibangun dari origin permintaan, bukan dari nilai kiriman, sehingga
  // QR selalu menunjuk ke aplikasi ini di alamat mana pun ia dijalankan.
  const target = new URL("/denah", url.origin);
  if (parsed.data.sesi) target.searchParams.set("sesi", parsed.data.sesi);
  // Layar LED memakai mode qr; HP yang memindai harus mendapat mode pencarian,
  // bukan ikut menampilkan QR lagi.
  target.searchParams.set("mode", "search");

  try {
    const svg = await QRCode.toString(target.toString(), {
      type: "svg",
      // Tingkat koreksi tinggi: QR di LED dipindai dari jarak beberapa meter,
      // kadang sambil bergerak dan dengan pantulan cahaya panggung.
      errorCorrectionLevel: "H",
      margin: 1,
      width: parsed.data.size,
      color: { dark: "#000000", light: "#ffffff" },
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        // Isinya hanya bergantung pada origin dan slug, jadi aman disimpan lama.
        // Ini juga menjaga LED tetap menampilkan QR saat jaringan tersendat.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
