import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { petaSlugLama, type PetaSlugLama } from "./slug-lama";

/**
 * Peta slug lama -> slug sekarang untuk proxy (lihat src/lib/slug-lama.ts).
 * Disimpan sebentar di memori seperti peta domain klien: tabelnya hampir tidak
 * pernah berubah, dan proxy hanya membacanya untuk alamat ber-slug.
 */

/** Umur peta per instans: batas atas jeda setelah slug diganti. */
const UMUR_PETA_MS = 30_000;
const BATAS_BACA_MS = 1_500;
const JEDA_GAGAL_MS = 5_000;
let peta: { nilai: PetaSlugLama; sampai: number } | null = null;
let memuat: Promise<PetaSlugLama> | null = null;
let terakhirBaik: PetaSlugLama | null = null;

const TABEL_BELUM_ADA = new Set(["42P01", "PGRST205"]);

async function muat(): Promise<PetaSlugLama | null> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_slug_redirects")
    .select("old_slug,events(slug)")
    .abortSignal(AbortSignal.timeout(BATAS_BACA_MS));
  if (error) {
    // Tabel belum ada (SQL-nya belum dijalankan) berarti belum ada slug lama.
    return TABEL_BELUM_ADA.has((error as { code?: string }).code ?? "") ? new Map() : null;
  }
  const baris = ((data ?? []) as unknown as { old_slug: string; events: { slug: string } | null }[]).map((b) => ({ old_slug: b.old_slug, slug: b.events?.slug ?? null }));
  if (baris.length === 0) return new Map();
  const { data: hidup, error: galatHidup } = await client
    .from("events")
    .select("slug")
    .in("slug", baris.map((b) => b.old_slug))
    .abortSignal(AbortSignal.timeout(BATAS_BACA_MS));
  if (galatHidup) return null;
  return petaSlugLama(baris, new Set(((hidup ?? []) as { slug: string }[]).map((b) => b.slug)));
}

/** Baca gagal memakai peta terakhir yang berhasil, lalu dicoba lagi sebentar kemudian. */
export async function slugLamaMap(): Promise<PetaSlugLama> {
  if (peta && peta.sampai > Date.now()) return peta.nilai;
  memuat ??= muat()
    .catch(() => null)
    .then((nilai) => {
      if (nilai) {
        terakhirBaik = nilai;
        peta = { nilai, sampai: Date.now() + UMUR_PETA_MS };
        return nilai;
      }
      const cadangan = terakhirBaik ?? new Map<string, string>();
      peta = { nilai: cadangan, sampai: Date.now() + JEDA_GAGAL_MS };
      return cadangan;
    })
    .finally(() => { memuat = null; });
  return memuat;
}

/** Slug yang pernah dipakai acara mana pun: acara baru tidak boleh mengambilnya. */
export async function oldSlugsLike(prefix: string): Promise<string[]> {
  const { data, error } = await getSupabaseServiceClient().from("event_slug_redirects").select("old_slug").like("old_slug", `${prefix}%`);
  if (error) {
    if (TABEL_BELUM_ADA.has((error as { code?: string }).code ?? "")) return [];
    throw new Error(`Gagal memeriksa slug lama: ${error.message}`);
  }
  return ((data ?? []) as { old_slug: string }[]).map((b) => b.old_slug);
}
