/**
 * Highlight harian di server: daftar hari, susun satu hari dari data terbaru,
 * simpan setelan panitia, kunci dan buka kunci. Semua disimpan di
 * `event_reports.config.harian` lewat compare-and-swap yang sama dengan deck.
 */
import type { EventRow } from "@/lib/domain";
import { LANDING_HEADING_FONTS } from "@/lib/domain";
import { landingTokens } from "@/lib/landing-tokens";
import { muatBahanLaporan } from "../bahan-server";
import type { ConfigLaporan } from "../config";
import { tanggalLokal } from "../teks";
import { SETELAN_KOSONG, type SetelanHari } from "./config";
import { hariAcara, susunHari } from "./hitung";
import type { HalamanAbsen, HariHighlight, KunciHalaman } from "./jenis";

export type StatusHari = "terkunci" | "siap" | "hari_ini" | "nanti";
export type BarisHari = { tanggal: string; status: StatusHari; kunci_at: string | null };
export type DataHarian = { hari: BarisHari[]; tanggal: string | null; setelan: SetelanHari; highlight: HariHighlight | null; absen: HalamanAbsen[]; ada: KunciHalaman[] };

export function hurufAcara(event: EventRow): HariHighlight["huruf"] {
  const t = landingTokens(event.landing_config as Parameters<typeof landingTokens>[0]);
  return { judul: LANDING_HEADING_FONTS[t.headingFont]?.label ?? "Inter", isi: LANDING_HEADING_FONTS[t.bodyFont]?.label ?? "Inter" };
}

/** Hari acara dengan statusnya, dan highlight hari yang dipilih (terkunci = salinan, bukan hitung ulang). */
export async function muatHarian(event: EventRow, config: ConfigLaporan, pilih: string | null): Promise<DataHarian | null> {
  const bahan = await muatBahanLaporan(event, config);
  if (!bahan) return null;
  const hariIni = tanggalLokal(bahan.sekarang, bahan.acara.offset);
  const hari: BarisHari[] = hariAcara(bahan).map((t) => {
    const kunci = config.harian[t]?.kunci ?? null;
    return { tanggal: t, kunci_at: kunci?.at ?? null, status: kunci ? "terkunci" : t < hariIni ? "siap" : t === hariIni ? "hari_ini" : "nanti" };
  });
  // Bawaan: hari terakhir yang sudah berjalan, atau hari pertama.
  const tanggal = hari.find((h) => h.tanggal === pilih)?.tanggal ?? [...hari].reverse().find((h) => h.status !== "nanti")?.tanggal ?? hari[0]?.tanggal ?? null;
  if (!tanggal) return { hari, tanggal: null, setelan: { ...SETELAN_KOSONG }, highlight: null, absen: [], ada: [] };
  const setelan = config.harian[tanggal] ?? { ...SETELAN_KOSONG };
  const hidup = susunHari(bahan, tanggal, setelan, hurufAcara(event));
  return { hari, tanggal, setelan, highlight: setelan.kunci?.hari ?? hidup.hari, absen: hidup.absen, ada: hidup.ada };
}
