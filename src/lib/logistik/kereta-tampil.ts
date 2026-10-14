import type { LogistikKereta } from "@/lib/logistik/peserta";

/**
 * Tulisan tiket kereta untuk peserta, dipakai kartu Horizon dan kartu
 * Gathering/Modern. Tanggal dan jam ditulis seperti di tiket (jam stasiun),
 * jadi tidak dikonversi ke zona acara.
 */

type Bahasa = "id" | "en";

/** "Jum, 6 Nov" atau "Fri, 6 Nov". */
export function tanggalLeg(iso: string | null, lang: Bahasa): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(/\.(?=\s|$)/g, "");
}

/** "08.20–15.10" (id) atau "08:20–15:10" (en). Satu jam saja bila yang lain kosong. */
export function jamLeg(tiket: Pick<LogistikKereta, "depart_time" | "arrive_time">, lang: Bahasa): string | null {
  const tulis = (jam: string | null) => (jam ? (lang === "en" ? jam : jam.replace(":", ".")) : null);
  return [tulis(tiket.depart_time), tulis(tiket.arrive_time)].filter(Boolean).join("–") || null;
}

/** "Gambir → Yogyakarta", atau null bila keduanya kosong. */
export function ruteLeg(tiket: Pick<LogistikKereta, "origin" | "destination">): string | null {
  const bagian = [tiket.origin?.trim(), tiket.destination?.trim()].filter(Boolean);
  return bagian.length > 0 ? bagian.join(" → ") : null;
}
