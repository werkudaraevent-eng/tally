// Penanda sumber kursi "Set in Tally". Dipisah dari `seat-tally.ts` (server-only)
// supaya halaman admin bisa memakainya tanpa ikut membawa klien service.

export const TALLY_SEAT_SOURCE_PREFIX = "tally:";

export function tallySeatSource(sessionId: number) {
  return `${TALLY_SEAT_SOURCE_PREFIX}${sessionId}`;
}

export function isTallySeatSource(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(TALLY_SEAT_SOURCE_PREFIX);
}
