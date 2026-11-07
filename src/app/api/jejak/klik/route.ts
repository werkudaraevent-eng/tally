import { bacaJejak, catatKlik } from "@/lib/email/jejak-server";

/**
 * Klik dari email: dipanggil oleh halaman baca pengumuman setelah halaman itu
 * berjalan di peramban (components/member/catat-klik.tsx). Pemindai tautan
 * kantor (Safe Links dan sejenisnya) hanya mengambil HTML-nya, jadi tidak
 * terhitung. Jawabannya selalu 204: tidak membocorkan apakah token sah.
 */

export async function POST(request: Request) {
  const isi = (await request.json().catch(() => null)) as { t?: unknown } | null;
  const jejak = bacaJejak(typeof isi?.t === "string" ? isi.t : null);
  if (jejak) await catatKlik(jejak).catch(() => null);
  return new Response(null, { status: 204 });
}
