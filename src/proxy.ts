import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Client pages lama memanggil `/api/...` absolut. Saat halamannya dibuka lewat
  // `/e/<slug>/...`, browser mengirim Referer yang memuat slug. Teruskan slug
  // sebagai query agar 88 fetch lama tidak perlu diubah satu per satu.
  //
  // Ini BUKAN otorisasi: Referer bisa dipalsukan. Handler tetap wajib memanggil
  // requireRequestEvent(), yang mengambil event dari DB dan memeriksa akses user.
  const referer = request.headers.get("referer");
  const eventMatch = referer ? new URL(referer).pathname.match(/^\/e\/([^/]+)/) : null;
  const shouldCarryEvent = request.nextUrl.pathname.startsWith("/api/") && eventMatch && !request.nextUrl.searchParams.has("eventSlug");
  const destination = request.nextUrl.clone();
  if (shouldCarryEvent) destination.searchParams.set("eventSlug", decodeURIComponent(eventMatch[1]));

  let response = shouldCarryEvent
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
          response = shouldCarryEvent
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
