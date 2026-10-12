import { loadSeatMapConfig, loadSessions } from "@/lib/seat-map-data";
import { computeSeatMapGeometry, normalizeSeatLabel, type SeatColors, type SeatMapConfig } from "@/lib/seat-map";

// Kursi peserta untuk kartu tiket di dashboard.
//
// Yang dibaca hanya dua hal yang memang publik: tata ruang denah (tanpa satu pun
// nama peserta) dan sesi yang sudah dipublikasikan. Kursi orangnya sendiri
// datang dari baris pesertanya, jadi tidak ada kursi peserta lain yang ikut
// terbaca di sini.

type KursiMentah = { subEventId?: string | number | null; subEventName?: string | null; label?: string | null };

export type KursiPeserta = {
  label: string;
  sesiNama: string | null;
  /** "row" untuk theater (A8 = baris A kursi 8), "table" untuk meja (5C). Null bila label tidak ada di denah. */
  jenis: "row" | "table" | "section" | null;
  kelompok: string | null;
  nomor: string | null;
  /** Null bila sesinya tidak dipublikasikan: denah mini dan tautan disembunyikan. */
  denah: {
    sesiSlug: string;
    warna: { background: string; text: string; accent: string } & Partial<SeatColors>;
  } | null;
};

export type DenahPeserta = { config: SeatMapConfig; kursi: KursiPeserta[] };

/**
 * Tulisan kursi: "Baris A · Kursi 8", "Meja 5 · Kursi C", atau "VIP · Kursi 7"
 * untuk sofa di ruangan gabungan. Label apa adanya bila kursinya tidak ada di
 * denah. Dipakai kartu tiket peserta dan lembar hasil pemindai, supaya keduanya
 * menyebut kursi yang sama dengan kata yang sama.
 */
export function tulisKursi(seat: Pick<KursiPeserta, "label" | "jenis" | "kelompok" | "nomor">, kata: { seat: string; seatRow: string; seatTable: string }): string {
  if (!seat.jenis || !seat.kelompok || !seat.nomor) return seat.label;
  if (seat.jenis === "section") return `${seat.kelompok} · ${kata.seat} ${seat.nomor}`;
  return `${seat.jenis === "row" ? kata.seatRow : kata.seatTable} ${seat.kelompok} · ${kata.seat} ${seat.nomor}`;
}

export async function loadKursiPeserta(eventId: string, seats: KursiMentah[]): Promise<DenahPeserta | null> {
  if (seats.length === 0) return null;
  const [config, sessions] = await Promise.all([
    loadSeatMapConfig(eventId),
    loadSessions(eventId, { publishedOnly: true }),
  ]);
  const geometry = computeSeatMapGeometry(config);
  const kursiDenah = new Map<string, { table: (typeof geometry.tables)[number]; code: string }>();
  for (const table of geometry.tables) {
    for (const seat of table.seats) kursiDenah.set(normalizeSeatLabel(seat.label), { table, code: seat.code });
  }

  const kursi = seats.map((seat): KursiPeserta => {
    const sesi = seat.subEventId != null ? sessions.find((item) => item.sub_event_id === String(seat.subEventId)) : undefined;
    const label = (seat.label ?? "").trim();
    const posisi = kursiDenah.get(normalizeSeatLabel(label));
    return {
      label,
      sesiNama: seat.subEventName?.trim() || null,
      // Sofa di ruangan gabungan tidak punya baris atau meja yang perlu disebut:
      // kartunya cukup "VIP · Seat 7".
      jenis: posisi ? (posisi.table.shape === "sofa" ? "section" : posisi.table.shape === "none" ? "row" : "table") : null,
      kelompok: posisi ? (posisi.table.shape === "sofa" ? posisi.table.section || posisi.table.label : posisi.table.label) : null,
      nomor: posisi?.code ?? null,
      denah: sesi && posisi
        ? {
            sesiSlug: sesi.slug,
            warna: {
              background: sesi.background_color,
              text: sesi.text_color,
              accent: sesi.accent_color,
              seat_available_color: sesi.seat_available_color,
              seat_occupied_color: sesi.seat_occupied_color,
              seat_checked_in_color: sesi.seat_checked_in_color,
              seat_outline_color: sesi.seat_outline_color,
            },
          }
        : null,
    };
  });

  return { config, kursi };
}
