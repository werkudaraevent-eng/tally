/**
 * Slug event dari sebuah permintaan. Fungsi murni, tanpa akses database.
 *
 * Dipisah dari request-event.ts supaya bisa diuji langsung dengan Node tanpa
 * ikut menarik klien Supabase.
 *
 * TIGA sumber, berurutan. Semuanya diperlukan, dan urutannya hasil pengukuran:
 *
 * 1. QUERY `?eventSlug=` -- pemanggil yang menyebut event secara eksplisit.
 *
 * 2. PATH `/e/<slug>/api/...`. `src/proxy.ts` me-rewrite ini menjadi
 *    `/api/...?eventSlug=<slug>`, dan rewrite-nya MEMANG terjadi (diverifikasi
 *    lewat header penanda). Tetapi `request.url` yang diterima route handler
 *    tetap URL ASLI berikut prefiks `/e/<slug>`, sehingga `eventSlug` yang
 *    DITAMBAHKAN proxy tidak pernah terbaca -- sementara query yang ditulis
 *    pemanggil sendiri (`?limit=999`) sampai utuh. Karena itu path dibaca
 *    langsung di sini.
 *
 * 3. REFERER. Halaman lama memanggil `/api/...` absolut di 129 tempat; slug-nya
 *    hanya ada di Referer. Proxy dulu mencoba memindahkannya ke query saat
 *    rewrite dan gagal dengan cara yang sama: Referer berisi slug ngawur tetap
 *    membalas 422 (jatuh ke event aktif tunggal), padahal `?eventSlug=<ngawur>`
 *    membalas 404. Membacanya di sini menggantikan 129 penyuntingan pemanggil.
 *
 * Referer sengaja jadi prioritas TERAKHIR: pemanggil yang menyebut slug secara
 * eksplisit tidak boleh dikalahkan oleh halaman asal. Referer juga hanya dipakai
 * untuk `/api/...`; halaman menerima slug lewat rewrite proxy, dan membaca
 * Referer di sana berarti navigasi dari halaman event bisa membajak halaman yang
 * seharusnya netral.
 *
 * Ini BUKAN otorisasi. Ketiganya dapat dipalsukan; pemanggil tetap wajib
 * meneruskan hasilnya ke requireEventScope(), yang memeriksa user_event_access.
 */
/** Header slug yang dipasang src/proxy.ts untuk permintaan di domain klien. */
export const HOST_SLUG_HEADER = "x-tally-host-slug";

/** Slug dan bahasa halaman bertab query, dipasang src/proxy.ts lewat slugKeHeader(). */
export const PAGE_SLUG_HEADER = "x-tally-page-slug";
export const PAGE_LANG_HEADER = "x-tally-page-lang";

/**
 * Halaman yang tabnya hanya berbeda query (`/peserta?tab=perjalanan`). Tab yang
 * diketuk sebelum prefetch-nya selesai dirutekan Next 16 dengan menebak dari
 * entri halaman yang sudah ada (segment-cache/cache.js: optimisticRenderedSearch
 * memakai query entri itu bila tidak kosong). Rewrite yang menambahkan
 * `?eventSlug=` membuat query Beranda tidak pernah kosong, jadi tebakannya
 * memakai query Beranda dan tabnya tidak pernah dimuat: Beranda tetap tampil.
 * Karena itu slug dan bahasa halaman ini dibawa header, bukan query.
 */
const HALAMAN_TAB_QUERY = new Set(["/peserta"]);

/** Pindahkan `eventSlug` dan `bahasa` dari tujuan rewrite ke header (mengubah `tujuan`). */
export function slugKeHeader(tujuan: URL): { slug: string | null; lang: string | null } {
  if (!HALAMAN_TAB_QUERY.has(tujuan.pathname)) return { slug: null, lang: null };
  const slug = tujuan.searchParams.get("eventSlug");
  const lang = tujuan.searchParams.get("bahasa");
  tujuan.searchParams.delete("eventSlug");
  tujuan.searchParams.delete("bahasa");
  return { slug, lang };
}

export function eventSlugFromRequest(request: Request) {
  // 0. Host domain klien: proxy memasang header ini dari peta domain dan
  //    MEMBUANG salinan yang dikirim browser, jadi nilainya tepercaya. Ia
  //    menang atas semuanya: di event.klien.com hanya ada satu acara, dan
  //    Referer di sana (`https://event.klien.com/`) tidak memuat slug.
  const dariHost = request.headers.get(HOST_SLUG_HEADER);
  if (dariHost) return dariHost;

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("eventSlug");
  if (fromQuery) return fromQuery;

  const fromPath = url.pathname.match(/^\/e\/([^/]+)\//);
  if (fromPath) return decodeURIComponent(fromPath[1]);

  if (!url.pathname.startsWith("/api/")) return undefined;
  const referer = request.headers.get("referer");
  if (!referer) return undefined;
  let refPath: string;
  try {
    refPath = new URL(referer).pathname;
  } catch {
    return undefined;
  }
  const fromReferer = refPath.match(/^\/e\/([^/]+)/);
  return fromReferer ? decodeURIComponent(fromReferer[1]) : undefined;
}
