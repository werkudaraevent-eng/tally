/**
 * Baca dan tulis `event_reports` (migrasi 202611080060). Service role saja:
 * tabelnya tertutup untuk anon dan authenticated. Sebelum migrasi dijalankan,
 * `muatLaporan` memberi `{ siap: false }` dan layar admin menampilkan "belum siap".
 */
import type { EventRow } from "@/lib/domain";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { muatBahanLaporan } from "./bahan-server";
import { timingSafeEqual } from "node:crypto";
import { bacaConfig, TOKEN_TAUTAN, type ConfigLaporan } from "./config";
import type { HariHighlight } from "./harian/jenis";
import type { Deck } from "./jenis";
import { susunDeck, type HasilSusun } from "./susun";

const tabelBelumAda = (galat: { code?: string } | null | undefined) => galat?.code === "42P01" || galat?.code === "PGRST205";
const tabel = () => getSupabaseServiceClient().from("event_reports" as never);

export type BarisLaporan = { config: ConfigLaporan; updated_at: string | null; shared_at: string | null; shared_snapshot: Deck | null };

export async function muatLaporan(eventId: string): Promise<{ siap: false } | ({ siap: true } & BarisLaporan)> {
  const { data, error } = await tabel().select("config,updated_at,shared_at,shared_snapshot").eq("event_id", eventId).maybeSingle();
  if (error) {
    if (tabelBelumAda(error as { code?: string })) return { siap: false };
    throw new Error("event_reports read failed");
  }
  const baris = data as { config: unknown; updated_at: string; shared_at: string | null; shared_snapshot: Deck | null } | null;
  return { siap: true, config: bacaConfig(baris?.config), updated_at: baris?.updated_at ?? null, shared_at: baris?.shared_at ?? null, shared_snapshot: baris?.shared_snapshot ?? null };
}

export type PilihanEditor = {
  /** Kolom untuk "Group by": Organisation lalu pertanyaan pilihan formulir. */
  kelompok: Array<{ kunci: string; label: string }>;
  /** Pertanyaan untuk "Chart from a question". */
  pertanyaan: Array<{ sumber: "daftar" | "feedback"; kunci: string; label: string }>;
};

/** Deck dan daftar dari data terbaru, plus pilihan editor. Null bila bahan tidak terbaca. */
export async function hitungLaporan(event: EventRow, config: ConfigLaporan): Promise<(HasilSusun & { pilihan: PilihanEditor }) | null> {
  const bahan = await muatBahanLaporan(event, config);
  if (!bahan) return null;
  const pilihan: PilihanEditor = {
    kelompok: [{ kunci: "company", label: "Organisation" }, ...bahan.pilihanDaftar.map((p) => ({ kunci: `extra.${p.kunci}`, label: p.label }))],
    pertanyaan: [
      ...bahan.pilihanDaftar.map((p) => ({ sumber: "daftar" as const, kunci: p.kunci, label: p.label })),
      ...(bahan.feedback?.pertanyaan ?? []).filter((q) => q.type === "choice").map((q) => ({ sumber: "feedback" as const, kunci: q.key, label: q.title })),
    ],
  };
  return { ...susunDeck(bahan, config), pilihan };
}

type HasilTulis = { ok: true; updated_at: string } | { ok: false; alasan: "belum_siap" | "basi" | "galat" };

/**
 * Tulis satu baris dengan compare-and-swap pada `updated_at` yang DIMUAT klien:
 * tab lama tidak menimpa suntingan yang lebih baru. `dimuat` null = baris belum
 * ada; dua tab yang sama-sama membuat baris pertama, satu kalah dengan 23505.
 */
async function tulis(eventId: string, isi: Record<string, unknown>, dimuat: string | null, userId: string): Promise<HasilTulis> {
  const updated_at = new Date().toISOString();
  const baris = { ...isi, updated_at, updated_by: userId };
  const { data, error } =
    dimuat === null
      ? await tabel().insert({ event_id: eventId, config: {}, ...baris } as never).select("event_id")
      : await tabel().update(baris as never).eq("event_id", eventId).eq("updated_at", dimuat).select("event_id");
  if (error) {
    if (tabelBelumAda(error as { code?: string })) return { ok: false, alasan: "belum_siap" };
    return { ok: false, alasan: (error as { code?: string }).code === "23505" ? "basi" : "galat" };
  }
  return (data as unknown[] | null)?.length ? { ok: true, updated_at } : { ok: false, alasan: "basi" };
}

export const simpanConfig = (eventId: string, config: ConfigLaporan, dimuat: string | null, userId: string) => tulis(eventId, { config }, dimuat, userId);

/** Bagikan ke klien: kunci deck saat ini sebagai snapshot. `deck` null = tarik kembali. */
export const simpanBagikan = (eventId: string, deck: Deck | null, dimuat: string | null, userId: string) =>
  tulis(eventId, { shared_snapshot: deck, shared_at: deck ? new Date().toISOString() : null, shared_by: deck ? userId : null }, dimuat, userId);

/**
 * Yang dilihat klien di tab Report: deck yang dibagikan (Share with client) dan
 * highlight harian yang sudah dikunci panitia, urut tanggal. Hanya salinan
 * terkunci yang keluar; setelan dan catatan editor lain tetap di server.
 * Null bila keduanya kosong atau tabel belum ada.
 */
export async function snapshotKlien(eventId: string): Promise<{ deck: Deck | null; shared_at: string | null; harian: HariHighlight[] } | null> {
  const { data, error } = await tabel().select("shared_snapshot,shared_at,config").eq("event_id", eventId).maybeSingle();
  if (error || !data) return null;
  const baris = data as { shared_snapshot: Deck | null; shared_at: string | null; config: unknown };
  const deck = baris.shared_snapshot && baris.shared_at ? baris.shared_snapshot : null;
  const harian = Object.values(bacaConfig(baris.config).harian)
    .map((s) => s.kunci?.hari)
    .filter((h): h is HariHighlight => !!h && h.halaman.length > 0);
  return deck || harian.length ? { deck, shared_at: deck ? baris.shared_at : null, harian } : null;
}

/**
 * Hari yang dikunci untuk link highlight tanpa login. Null bila token salah,
 * link dimatikan, atau tabel belum ada; daftar kosong bila belum ada hari yang
 * dikunci. Token dibandingkan dengan waktu tetap.
 */
export async function highlightLewatTautan(eventId: string, token: string): Promise<HariHighlight[] | null> {
  if (!TOKEN_TAUTAN.test(token)) return null;
  const { data, error } = await tabel().select("config").eq("event_id", eventId).maybeSingle();
  if (error || !data) return null;
  const config = bacaConfig((data as { config: unknown }).config);
  const simpan = config.tautan?.token;
  if (!simpan || simpan.length !== token.length || !timingSafeEqual(Buffer.from(simpan), Buffer.from(token))) return null;
  return Object.values(config.harian)
    .map((s) => s.kunci?.hari)
    .filter((h): h is HariHighlight => !!h && h.halaman.length > 0)
    .sort((x, y) => x.tanggal.localeCompare(y.tanggal));
}
