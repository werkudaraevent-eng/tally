import type { UserRole } from "./roles";
import { getEventBySlugPublic, listActiveEvents, requireEventScope } from "./event-scope";
import { eventSlugFromRequest } from "./event-slug";
import { isWriteBlocked } from "./event-writable";

export { eventSlugFromRequest };

type RequestEventOptions = {
  /**
   * Tandai route yang MEMBACA tetapi terpaksa memakai POST karena badan
   * permintaannya (mis. pohon syarat undian) terlalu besar untuk query string.
   *
   * Sengaja dideklarasikan di route-nya sendiri, bukan sebagai daftar path
   * terpusat: daftar terpusat pasti ketinggalan saat route baca-saja berikutnya
   * ditambahkan, dan ketinggalannya baru ketahuan di hari acara.
   */
  readOnly?: boolean;
};

export async function requireRequestEvent(
  request: Request,
  roles?: UserRole[],
  options?: RequestEventOptions,
) {
  let slug = eventSlugFromRequest(request);
  if (!slug) {
    // Kompatibilitas link lama: hanya aman kalau tepat satu event aktif. Dengan
    // dua event aktif, memilih "yang terbaru" dapat menyimpan order ke event
    // salah tanpa galat; kondisi ambigu harus meminta pemilihan eksplisit.
    const active = await listActiveEvents();
    slug = active.length === 1 ? active[0].slug : undefined;
  }

  const resolved = await requireEventScope(slug, roles);
  if (resolved.response) return resolved;

  // Penjaga tulis ditempatkan DI SINI, bukan di tiap route. Pendahulunya
  // (ensureEventWritable) dibiarkan dipanggil masing-masing route dan hasilnya:
  // nol pemanggil dari 55 route: setiap POST ke event selesai tetap tersimpan.
  // Satu titik yang dilewati semua route tidak bisa "lupa dipasang".
  if (
    isWriteBlocked({
      method: request.method,
      status: resolved.scope.event.status,
      role: resolved.user.role,
      readOnly: options?.readOnly,
    })
  ) {
    return {
      scope: null,
      user: null,
      response: Response.json(
        {
          error: {
            code: "EVENT_NOT_WRITABLE",
            message: `Event ini berstatus ${resolved.scope.event.status === "archived" ? "arsip" : "selesai"} dan tidak menerima perubahan data.`,
          },
        },
        { status: 409 },
      ),
    } as const;
  }

  return resolved;
}

export async function getPublicRequestEvent(request: Request) {
  const slug = eventSlugFromRequest(request);
  if (slug) return getEventBySlugPublic(slug);
  const active = await listActiveEvents();
  return active.length === 1 ? active[0] : null;
}

/**
 * Versi untuk SERVER COMPONENT (halaman), bukan route handler.
 *
 * Halaman tidak menerima `Request`; ia menerima `searchParams`. Slug sampai ke
 * sana karena `src/proxy.ts` me-rewrite `/e/<slug>/display` menjadi
 * `/display?eventSlug=<slug>`.
 *
 * Aturan fallback-nya SAMA dengan getPublicRequestEvent: tanpa slug hanya aman
 * bila tepat satu event aktif. Dengan dua event aktif, menebak berarti
 * menayangkan data event yang salah di proyektor.
 */
export async function getPublicPageEvent(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
) {
  const params = searchParams ? await searchParams : undefined;
  const raw = params?.eventSlug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (slug) return getEventBySlugPublic(slug);
  const active = await listActiveEvents();
  return active.length === 1 ? active[0] : null;
}