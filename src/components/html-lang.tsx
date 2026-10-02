"use client";

import { useEffect } from "react";

/**
 * Membetulkan `<html lang>` untuk halaman berbahasa lain. Tata letak akar
 * menulis `lang="id"`; halaman English (halaman acara, formulir pendaftaran)
 * menggantinya selama tampil, lalu mengembalikannya saat pindah halaman.
 */
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    const akar = document.documentElement;
    const semula = akar.lang;
    akar.lang = lang;
    return () => {
      akar.lang = semula;
    };
  }, [lang]);
  return null;
}
