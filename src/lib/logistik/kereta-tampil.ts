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

/** Selisih zona terhadap UTC (menit) pada saat `utcMs`, mis. 420 untuk WIB. */
function selisihZona(zona: string, utcMs: number): number {
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const lokal = Date.UTC(Number(bagian.year), Number(bagian.month) - 1, Number(bagian.day), Number(bagian.hour), Number(bagian.minute));
  return Math.round((lokal - utcMs) / 60000);
}

/**
 * Leg ini sudah tiba (halaman Perjalanan melipatnya jadi satu baris). Jam di
 * tiket adalah jam stasiun, dibaca di zona acara. Tiba lebih awal dari
 * berangkat berarti tiba keesokan harinya. Tanpa jam tiba, jam berangkat yang
 * dipakai; tanpa tanggal, tidak pernah dianggap selesai.
 */
export function legSelesai(
  tiket: Pick<LogistikKereta, "depart_date" | "depart_time" | "arrive_time">,
  zona: string,
  sekarang: Date,
): boolean {
  const [y, m, d] = (tiket.depart_date ?? "").split("-").map(Number);
  const jam = tiket.arrive_time ?? tiket.depart_time;
  if (!y || !m || !d || !jam) return false;
  const [hh, mm] = jam.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  let lokal = Date.UTC(y, m - 1, d, hh, mm);
  if (tiket.arrive_time && tiket.depart_time && tiket.arrive_time < tiket.depart_time) lokal += 86_400_000;
  const utc = lokal - selisihZona(zona, lokal) * 60_000;
  return sekarang.getTime() >= utc;
}
