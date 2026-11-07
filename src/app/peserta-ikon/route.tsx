import { ImageResponse } from "next/og";
import { publicEventName } from "@/lib/domain";
import { inisialAcara } from "@/lib/push/ikon";
import { acaraManifest, warnaIkon } from "@/lib/push/manifest";

/**
 * Ikon portal di Layar Utama dan di notifikasi, `/e/<slug>/peserta-ikon?ukuran=192`.
 * Singkatan nama acara di atas warna merek acara (lib/push/ikon.ts). `maskable`
 * memberi ruang aman 20% supaya Android yang memotong ikon jadi lingkaran
 * tidak memotong hurufnya.
 */
export async function GET(request: Request) {
  const event = await acaraManifest(request);
  if (!event) return new Response("Not found", { status: 404 });
  const kueri = new URL(request.url).searchParams;
  const ukuran = [180, 192, 512].includes(Number(kueri.get("ukuran"))) ? Number(kueri.get("ukuran")) : 192;
  const maskable = kueri.get("maskable") === "1";
  const inisial = inisialAcara(publicEventName(event));
  const { latar, teks } = warnaIkon(event);
  const huruf = Math.round(ukuran * (maskable ? 0.26 : inisial.length >= 3 ? 0.32 : 0.4));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: latar, color: teks, fontSize: huruf, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {inisial}
      </div>
    ),
    { width: ukuran, height: ukuran, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
