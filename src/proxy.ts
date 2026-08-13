import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
    const destination = request.nextUrl.clone();
    destination.pathname = rest;
    destination.searchParams.set("eventSlug", slug);
    return destination;
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const destination = eventRewrite(request);

  let response = destination
    ? NextResponse.rewrite(destination, { request })
    : NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response = destination
            ? NextResponse.rewrite(destination, { request })
            : NextResponse.next({ request });
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
