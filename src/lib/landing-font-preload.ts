import { preload } from "react-dom";
import { landingFontUrls } from "@/lib/landing-tokens";

/**
 * Preload huruf pilihan acara ini saja. Dipanggil saat render; React menaruh
 * <link rel="preload"> di <head> dan membuang duplikatnya. Tanpa ini huruf judul
 * baru diminta setelah CSS diurai dan elemennya ditata, jadi judul hero tampil
 * dengan fallback lebih lama. crossOrigin wajib untuk huruf, walau satu origin;
 * tanpanya peramban mengunduh berkasnya dua kali.
 */
export function preloadLandingFonts(tokens: Parameters<typeof landingFontUrls>[0]): void {
  for (const href of landingFontUrls(tokens)) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
}
