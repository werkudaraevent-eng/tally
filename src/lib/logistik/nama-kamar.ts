/**
 * Kamar dikenali lewat nomornya, atau lewat label panitia ("Kamar 01")
 * selama nomornya menyusul (migrasi 202610290001). Label hanya untuk admin.
 */
type KamarBernama = { room_number: string | null; label?: string | null };

/** "1208", atau "Kamar 01" bila nomornya belum ada. */
export const namaKamar = (kamar: KamarBernama) => kamar.room_number ?? kamar.label ?? "";

/** "Room 1208", atau "Kamar 01" bila nomornya belum ada (labelnya sudah menyebut dirinya). */
export const judulKamar = (kamar: KamarBernama, awal = "Room") => (kamar.room_number !== null ? `${awal} ${kamar.room_number}` : kamar.label ?? awal);

const banding = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

/** Urut label panitia bila ada (Kamar 01, Kamar 02, ...), selain itu nomor. */
export const urutKamar = (a: KamarBernama, b: KamarBernama) => banding.compare(a.label ?? a.room_number ?? "", b.label ?? b.room_number ?? "");

/** Jenis kamar dan kasur untuk peserta: "Deluxe · Twin". Null bila keduanya kosong. */
export const jenisKamar = (kamar: { room_type: string | null; bed_type?: string | null }) =>
  [kamar.room_type, kamar.bed_type].filter(Boolean).join(" · ") || null;
