import { ImageResponse } from "next/og";
import { HalamanHarianView, LEBAR, TINGGI } from "@/components/laporan/harian/halaman";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { fotoLaporanSah } from "@/lib/laporan/harian/foto";
import { hurufGambar } from "@/lib/laporan/harian/huruf";
import { temaAcara } from "@/lib/laporan/warna";
import { muatLaporan } from "@/lib/laporan/server";

/**
 * GET ?tanggal=YYYY-MM-DD&n=1  PNG 1080×1920 satu halaman highlight harian.
 * Hanya dari salinan yang dikunci: gambar yang dikirim ke klien selalu sama
 * dengan angka yang dikunci panitia, dan server tidak menghitung ulang data
 * acara untuk tiap gambar.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const q = new URL(request.url).searchParams;
  const tanggal = q.get("tanggal") ?? "";
  const n = Number(q.get("n"));
  const laporan = await muatLaporan(auth.scope.event.id).catch(() => null);
  if (!laporan) return apiError("INTERNAL_ERROR", 500);
  const hari = laporan.siap ? laporan.config.harian[tanggal]?.kunci?.hari : null;
  if (!hari) return new Response(null, { status: 404 });
  const asli = Number.isInteger(n) ? hari.halaman[n - 1] : undefined;
  if (!asli) return new Response(null, { status: 404 });
  // Server mengambil foto ini sendiri: hanya foto laporan acara ini atau foto hero acara saat ini.
  const hero = temaAcara(auth.scope.event.landing_config).foto;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const fotoBoleh = (u: string | null) => (u && (u === hero || fotoLaporanSah(u, supabaseUrl)) ? u : null);
  const p = { ...asli, foto: fotoBoleh(asli.foto) };

  const fonts = await hurufGambar(hari.huruf.judul, hari.huruf.isi);
  const ada = new Set(fonts.map((f) => f.name));
  // Huruf yang gagal diambil jatuh ke huruf bawaan next/og.
  const huruf = { judul: ada.has(hari.huruf.judul) ? hari.huruf.judul : "sans-serif", isi: ada.has(hari.huruf.isi) ? hari.huruf.isi : "sans-serif" };
  return new ImageResponse(<HalamanHarianView hari={hari} p={p} nomor={n} total={hari.halaman.length} huruf={huruf} />, {
    width: LEBAR,
    height: TINGGI,
    // Daftar kosong membuat next/og gagal ("No fonts are loaded"); tanpa `fonts` ia memakai huruf bawaannya.
    ...(fonts.length ? { fonts } : {}),
    headers: { "Cache-Control": "private, no-store" },
  });
}
