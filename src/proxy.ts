import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { HOST_SLUG_HEADER } from "@/lib/auth/event-slug";
import { decideClientHost, redirectToClient } from "@/lib/domain-klien/rute";
import { domainMap, eventIdForHost, PENANDA_PATH } from "@/lib/domain-klien/simpan";
import { productionSiteOrigin } from "@/lib/domain-klien/situs";
import { messagingAllowlist } from "@/lib/pesan/alamat";

/**
 * Menentukan tujuan rewrite untuk permintaan ber-scope event, atau null bila
 * permintaan ini tidak perlu disentuh.
 *
 * Dua sumber slug, keduanya diperlukan:
 *
 * 1. PATH `/e/<slug>/api/...` -- dipakai pemanggil yang memang tahu event mana.
 *    Awalnya ini ditangani `rewrites()` di next.config.ts, tetapi DIUKUR gagal:
 *    `/e/<slug-ngawur>/api/leaderboard` tetap membalas 200 sementara
 *    `?eventSlug=<ngawur>` langsung membalas 404. Artinya parameter query pada
 *    destination rewrite tidak pernah sampai ke handler, sehingga handler jatuh
 *    ke event aktif tunggal dan slug di URL diabaikan sama sekali. Dua percobaan
 *    memperbaikinya di lapisan config (`:path+`, lalu destination `:path*`) tidak
 *    mengubah hasil, jadi pekerjaannya dipindah ke sini -- proxy berjalan lebih
 *    dulu dan tujuannya bisa dipastikan.
 *
 * Referer TIDAK ditangani di sini. Dulu ada cabangnya, tetapi ia menempuh jalur
 * yang sama persis (menyisipkan `?eventSlug=` saat rewrite) sehingga ikut gagal:
 * Referer berisi slug ngawur tetap dilayani event aktif tunggal. Pembacaan
 * Referer kini ada di eventSlugFromRequest() (src/lib/auth/request-event.ts),
 * tempat handler benar-benar bisa melihatnya.
 *
 * Ini BUKAN otorisasi. Slug dapat dipalsukan; handler tetap wajib memanggil
 * requireRequestEvent(), yang membaca event dari database dan memeriksa
 * user_event_access.
 */
function eventRewrite(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Slug eksplisit di query selalu menang: pemanggil sudah menyebutkannya.
  if (searchParams.has("eventSlug")) return null;

  const fromPath = pathname.match(/^\/e\/([^/]+)(\/.*)?$/);
  if (fromPath) {
    const slug = decodeURIComponent(fromPath[1]);
    const rest = fromPath[2] ?? "/";
    // `/e/<slug>` tanpa sisa path TIDAK di-rewrite: itu halaman workspace event
    // (src/app/e/[slug]/page.tsx). Sebelumnya pola catch-all ikut menelannya dan
    // URL tersebut merender halaman landing.
    if (rest === "/") return null;
    // `/e/<slug>/en` dan `/e/<slug>/id` juga halaman acara (versi bahasa
    // lain, src/app/e/[slug]/en dan /id), bukan rute lama lewat rewrite.
    if (/^\/(en|id)\/?$/.test(rest)) return null;
    const destination = request.nextUrl.clone();
    // Formulir pendaftaran dalam bahasa lain: `/e/<slug>/en/daftar` ->
    // `/daftar?eventSlug=<slug>&bahasa=en`. Halamannya memeriksa sendiri apakah
    // bahasa itu berlaku untuk acara ini.
    const daftarBahasa = rest.match(/^\/(en|id)\/daftar\/?$/);
    destination.pathname = daftarBahasa ? "/daftar" : rest;
    destination.searchParams.set("eventSlug", slug);
    if (daftarBahasa) destination.searchParams.set("bahasa", daftarBahasa[1]);
    return destination;
  }

  return null;
}

/**
 * Host permintaan tanpa port. x-forwarded-host lebih dulu: di Vercel itulah host
 * yang diketik pengunjung.
 */
function hostOf(request: NextRequest) {
  return (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
}

/**
 * Pengalihan antara host Tally dan host klien: 307 tanpa cache (temuan QA M1).
 * Arahnya berubah setiap kali status domain berubah (Aktif, Bermasalah,
 * Dilepas), jadi 308 yang disimpan browser bisa memantul di antara kedua host.
 */
function alihkan(ke: string) {
  const response = NextResponse.redirect(ke, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * User & role pindah dari ruang kerja acara ke tingkat workspace (`/users`):
 * akunnya berlaku untuk semua acara, jadi URL-nya tidak boleh mengaku milik satu
 * acara. Alamat lama dan varian ber-slug dialihkan permanen, hanya di host
 * Tally: di domain klien jalur /admin tetap ditolak `decideClientHost`.
 */
const USERS_LAMA = /^\/(?:e\/[^/]+\/)?(?:admin\/)?users\/?$/;

export async function proxy(request: NextRequest) {
  // Penanda dibaca langsung dari tabel, tanpa peta: pemeriksaan "Aktif" tepat
  // setelah Hubungkan berjalan di instans lain yang petanya belum tahu host ini.
  if (request.nextUrl.pathname === PENANDA_PATH) {
    const eventId = await eventIdForHost(hostOf(request)).catch(() => null);
    return eventId
      ? Response.json({ event_id: eventId }, { headers: { "Cache-Control": "no-store" } })
      : new NextResponse("Halaman tidak ditemukan.", { status: 404 });
  }

  // Domain klien (Pengaturan > Acara > Alamat halaman acara). Peta host diambil
  // dari event_domains dan disimpan sebentar (src/lib/domain-klien/simpan.ts);
  // tanpa domain klien semuanya berjalan seperti sebelum fitur ini ada.
  const peta = await domainMap().catch(() => null);
  const klien = peta?.byHost.get(hostOf(request));
  let slugHost: string | null = null;
  let destination: URL | null = null;

  if (klien) {
    const keputusan = decideClientHost({
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.searchParams,
      slug: klien.slug,
      status: klien.status,
      tallyOrigin: productionSiteOrigin(),
    });
    if (keputusan.kind === "penanda") return Response.json({ event_id: klien.eventId }, { headers: { "Cache-Control": "no-store" } });
    if (keputusan.kind === "tolak") return new NextResponse("Halaman tidak ditemukan.", { status: 404 });
    if (keputusan.kind === "alihkan") return alihkan(keputusan.to);
    slugHost = klien.slug;
    const tujuan = request.nextUrl.clone();
    tujuan.pathname = keputusan.pathname;
    if (keputusan.addSlugQuery) tujuan.searchParams.set("eventSlug", klien.slug);
    destination = eventRewrite(new NextRequest(tujuan)) ?? (tujuan.pathname !== request.nextUrl.pathname || keputusan.addSlugQuery ? tujuan : null);
  } else {
    // Host Tally: halaman peserta acara yang sudah berdomain klien AKTIF
    // diarahkan ke sana (path dan query ikut). Produksi saja: preview memakai
    // database produksi dan tidak boleh melempar penguji ke domain klien.
    if (peta && messagingAllowlist().mode === "off") {
      const ke = redirectToClient({
        pathname: request.nextUrl.pathname,
        search: request.nextUrl.search,
        method: request.method,
        fetchDest: request.headers.get("sec-fetch-dest"),
        domainFor: (slug) => peta.bySlug.get(slug),
      });
      if (ke) return alihkan(ke);
    }
    if (USERS_LAMA.test(request.nextUrl.pathname) && (request.nextUrl.pathname !== "/users" || request.nextUrl.searchParams.has("eventSlug"))) {
      const ke = request.nextUrl.clone();
      ke.pathname = "/users";
      ke.search = "";
      return NextResponse.redirect(ke, 308);
    }
    destination = eventRewrite(request);
  }

  // Header slug domain klien hanya boleh berasal dari sini: salinan yang
  // dikirim browser selalu dibuang (src/lib/auth/event-slug.ts mempercayainya).
  // Dibangun ulang setiap kali karena setAll di bawah mengubah cookie permintaan.
  const teruskan = () => {
    const headers = new Headers(request.headers);
    headers.delete(HOST_SLUG_HEADER);
    if (slugHost) headers.set(HOST_SLUG_HEADER, slugHost);
    return destination
      ? NextResponse.rewrite(destination, { request: { headers } })
      : NextResponse.next({ request: { headers } });
  };

  let response = teruskan();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response = teruskan();
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
