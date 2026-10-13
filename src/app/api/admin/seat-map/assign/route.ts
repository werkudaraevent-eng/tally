import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { normalizeSeatLabel } from "@/lib/seat-map";
import { applyTallySeats, loadSeatOptions, prepareTallySeats, SeatInputError, type StoredSeat } from "@/lib/seat-tally";
import { tallySeatSource } from "@/lib/seat-tally-source";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Mengisi kursi langsung dari denah admin (Seating plan › Assign seats).
//
// Memakai jalur tulis yang sama dengan field Seat di modal peserta
// (`prepareTallySeats` + `applyTallySeats`), jadi validasi label, larangan
// menyentuh baris scanner, pelepasan pemegang lama, dan audit log ikut sama.

const MAX_HASIL = 20;

const cariSchema = z.object({
  session_id: z.coerce.number().int().positive(),
  q: z.string().trim().max(80).optional(),
});

type BarisCari = { id: string; name: string; company: string | null; email: string | null; seats: StoredSeat[] | null };

/** Peserta untuk dipilih di kursi: yang belum punya kursi di sesi ini lebih dulu. */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = cariSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const sumber = tallySeatSource(parsed.data.session_id);
  // Hanya huruf, angka, spasi dan tanda yang lazim di nama atau email; sisanya
  // dibuang supaya kata kunci tidak bisa mengubah filter `or` PostgREST.
  const kata = (parsed.data.q ?? "").replace(/[^\p{L}\p{N} @._'-]/gu, " ").trim();
  let kueri = getSupabaseServiceClient()
    .from("participants")
    .select("id,name,company,email,seats")
    .eq("event_id", auth.scope.event.id)
    .is("source_participant_id", null)
    .is("source_removed_at", null);
  if (kata) kueri = kueri.or(["name", "company", "email"].map((kolom) => `${kolom}.ilike.*${kata}*`).join(","));
  // Tanpa kata kunci: yang belum duduk di sesi ini saja, supaya tidak tenggelam di urutan abjad.
  // `seats` kosong (NULL) juga dihitung belum duduk; `not cs` saja membuangnya.
  else kueri = kueri.or(`seats.is.null,seats.not.cs.${JSON.stringify([{ subEventId: sumber }])}`);
  const { data, error } = await kueri.order("name", { ascending: true }).limit(200);
  if (error) return apiError("INTERNAL_ERROR", 500);

  const hasil = ((data ?? []) as unknown as BarisCari[]).map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    seat: (row.seats ?? []).find((seat) => seat?.subEventId === sumber)?.label ?? null,
  }));
  hasil.sort((a, b) => Number(a.seat !== null) - Number(b.seat !== null));
  return Response.json({ results: hasil.slice(0, MAX_HASIL) });
}

const tulisSchema = z.object({
  session_id: z.number().int().positive(),
  label: z.string().trim().min(1).max(40),
  /** Peserta yang didudukkan di kursi ini; null untuk mengosongkan kursi. */
  participant_id: z.string().uuid().nullable(),
  /** Pemegang kursi yang dilihat admin saat membuka kursi, untuk menolak data basi. */
  current_participant_id: z.string().uuid().nullable(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = tulisSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());
  const eventId = auth.scope.event.id;
  const { session_id, label, participant_id, current_participant_id } = body.data;

  // Kursi yang sudah berubah sejak admin membukanya tidak ditimpa diam-diam.
  const { taken } = await loadSeatOptions(eventId);
  const pemegang = taken[session_id]?.[normalizeSeatLabel(label)] ?? null;
  if ((pemegang?.participantId ?? null) !== current_participant_id) {
    return apiError("CONFLICT", 409, { seat: "Someone else changed this seat. The map has been refreshed." });
  }

  const target = participant_id ?? current_participant_id;
  if (!target) return Response.json({ ok: true, freed: [] });

  // Peserta harus milik acara ini, aktif, dan bukan baris scanner. Diperiksa
  // sebelum menulis apa pun supaya pemegang lama tidak terlepas tanpa pengganti.
  const client = getSupabaseServiceClient();
  const ids = [...new Set([participant_id, current_participant_id].filter((id): id is string => Boolean(id)))];
  const { data: baris, error: bacaGagal } = await client
    .from("participants")
    .select("id,name,seats")
    .eq("event_id", eventId)
    .is("source_participant_id", null)
    .is("source_removed_at", null)
    .in("id", ids);
  if (bacaGagal) return apiError("INTERNAL_ERROR", 500);
  const peserta = new Map(((baris ?? []) as unknown as Array<{ id: string; name: string; seats: StoredSeat[] | null }>).map((row) => [row.id, row]));
  if (ids.some((id) => !peserta.has(id))) return apiError("PARTICIPANT_NOT_FOUND", 404, { seat: "That participant isn't in this event's list any more. Reload the page." });

  try {
    const kursi = await prepareTallySeats(eventId, target, [{ session_id, label: participant_id ? label : null }]);
    const sebelum = peserta.get(target)?.seats ?? [];
    const { freed } = await applyTallySeats(eventId, target, kursi, auth.user.id);

    // Dua admin yang mengisi kursi kosong yang sama pada saat bersamaan sama-sama
    // lolos pemeriksaan di atas. Sesudah menulis, pemegang kursi dibaca ulang;
    // bila ada orang lain juga di situ, tulisan ini dibatalkan. Keduanya bisa
    // gagal dan harus mencoba lagi, tetapi kursi ganda tidak pernah tersisa.
    // (Kunci di SQL lewat RPC menyusul di jalur migrasi.)
    const labelSah = kursi[0]?.label;
    if (participant_id && labelSah) {
      const sumber = tallySeatSource(session_id);
      const { data: pemegangBaru } = await client
        .from("participants")
        .select("id")
        .eq("event_id", eventId)
        .is("source_removed_at", null)
        .contains("seats", JSON.stringify([{ subEventId: sumber, label: labelSah }]))
        .limit(5);
      const lain = ((pemegangBaru ?? []) as Array<{ id: string }>).filter((row) => row.id !== participant_id);
      if (lain.length > 0) {
        await client.from("participants").update({ seats: sebelum } as never).eq("event_id", eventId).eq("id", participant_id).is("source_participant_id", null);
        return apiError("CONFLICT", 409, { seat: "Seat was just taken. Try again." });
      }
    }
    return Response.json({ ok: true, freed });
  } catch (galat) {
    if (galat instanceof SeatInputError) return apiError("VALIDATION_ERROR", 422, { seat: galat.message });
    return apiError("INTERNAL_ERROR", 500);
  }
}
