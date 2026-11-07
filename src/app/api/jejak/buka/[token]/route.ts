import { bacaJejak, catatBuka } from "@/lib/email/jejak-server";
import { GIF_KOSONG } from "@/lib/email/jejak";

/**
 * Gambar 1x1 di email Messages (sakelar Email tracking per acara). Selalu
 * membalas gambar yang sama, juga untuk token rusak, supaya email tidak
 * menampilkan gambar pecah dan token tidak bisa ditebak dari jawabannya.
 * Tanpa cache: setiap pembukaan sampai ke server (yang pertama saja dicatat).
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const jejak = bacaJejak(token.replace(/\.gif$/, ""));
  if (jejak) await catatBuka(jejak, request.headers.get("user-agent")).catch(() => null);
  return new Response(new Uint8Array(GIF_KOSONG), {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF_KOSONG.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Referrer-Policy": "no-referrer",
    },
  });
}
