"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

// Zona waktu acara untuk halaman admin yang belum memuat setelan apa pun.
//
// Dibuat sebagai hook, bukan disalin ke tiap halaman: tiga halaman admin (audit,
// orders, participants) hanya butuh zona dan tidak punya alasan lain memuat
// setelan. Menyalin blok fetch ke masing-masingnya berarti tiga tempat yang bisa
// menyimpang ketika endpoint-nya berubah.
//
// Halaman yang SUDAH memuat /api/settings (booth, admin/settings, admin/display)
// sengaja tidak memakai hook ini; menambah permintaan kedua di sana hanya
// menduplikasi data yang sudah ada di tangan.
//
// Halaman publik juga tidak boleh memakainya: /api/settings butuh login, jadi
// /denah, /display, dan /rundown menerima zona dari payload-nya masing-masing.

export function useEventTimeZone(): { zone: EventTimeZone; abbr: string } {
  const [zone, setZone] = useState<EventTimeZone>(DEFAULT_TIME_ZONE);

  // setState langsung di badan effect ditolak React Compiler, jadi ditunda satu
  // tick. Pola yang sama dipakai di seluruh halaman admin.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/settings", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          setZone(normalizeTimeZone(data?.time_zone));
        })
        // Gagal memuat zona tidak boleh mengosongkan halaman: nilai awal WIB
        // tetap terpakai, sama seperti perilaku sebelum setelan ini ada.
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return { zone, abbr: timeZoneAbbr(zone) };
}
