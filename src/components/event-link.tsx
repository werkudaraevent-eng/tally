"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { withEventPrefix } from "@/lib/event-path";

/**
 * `next/link` yang mempertahankan `/e/<slug>` di URL.
 *
 * Halaman admin ditulis sebelum multi-event dan tautannya absolut (`/admin`,
 * `/admin/booths`, `/display`). Halaman-halaman itu kini dipakai ulang lewat
 * rewrite `/e/<slug>/...`, jadi setiap tautan absolut MENJATUHKAN slug: klik
 * "Kembali ke Dashboard" dari `/e/prima-.../admin/settings` mendarat di `/admin`
 * tanpa scope event. DIUKUR: URL berubah ke `http://localhost:3000/admin`, label
 * event di sidebar berubah jadi "Semua event", dan satu permintaan gagal 400.
 *
 * Diperbaiki di sini, bukan dengan menyunting ~37 href satu per satu: suntingan
 * seragam sebanyak itu pasti ada yang terlewat, dan tautan admin BERIKUTNYA akan
 * mengulang bug yang sama. Menukar import membuat halaman yang benar secara
 * default.
 *
 * Yang TIDAK diprefiks: URL eksternal, jangkar, dan href yang sudah membawa
 * `/e/`. Href relatif dibiarkan apa adanya — ia sudah mengikuti path saat ini.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const pathname = usePathname();
  return <NextLink href={typeof href === "string" ? withEventPrefix(href, pathname) : href} {...props} />;
}
