import type { SeatAssignment } from "@/lib/seat-map-data";

// Penyamaran nama untuk halaman denah publik.
//
// Halaman ini terbuka tanpa login. Menampilkan 199 nama lengkap beserta jabatan
// dan perusahaan peserta setingkat direksi sama dengan menerbitkan daftar tamu
// ke siapa saja yang tahu URL-nya. Karena itu denah publik tidak pernah
// mengirim nama lengkap; tamu mencari namanya sendiri, lalu kursinya disorot.
//
// Ada dua kehendak yang harus dihormati sekaligus:
//   * `event_settings.name_display_mode` — kebijakan acara, disetel admin.
//   * `participants.allow_name_display` — kehendak orang per orang.
// Yang paling membatasi selalu menang.

export type NameDisplayMode = "full" | "initials" | "company_only" | "hidden";

/** Mengambil inisial: "Budi Santoso" -> "B. S." */
function toInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}.`)
    .join(" ");
  return initials || "—";
}

/**
 * Label aman untuk ditampilkan di halaman publik.
 *
 * Selalu diturunkan minimal satu tingkat dari `full`, bahkan ketika admin
 * menyetel mode `full`: mode itu ditujukan untuk Papan peringkat yang diproyeksikan
 * di ruangan tertutup berisi peserta acara, bukan untuk halaman yang bisa
 * dibuka siapa saja dari internet.
 */
export function publicSeatOccupantLabel(
  assignment: Pick<SeatAssignment, "name" | "company" | "allowNameDisplay">,
  mode: NameDisplayMode,
) {
  if (mode === "hidden" || !assignment.allowNameDisplay) return "Peserta";
  if (mode === "company_only") return assignment.company?.trim() || "Peserta";
  const initials = toInitials(assignment.name);
  const company = assignment.company?.trim();
  return company ? `${initials} — ${company}` : initials;
}

/**
 * Nama untuk mengonfirmasi hasil pencarian tamu.
 *
 * Tamu perlu yakin bahwa kursi yang disorot memang miliknya, bukan milik orang
 * lain dengan nama mirip. Karena itu bagian yang dia ketik sendiri ditampilkan
 * apa adanya, sedangkan sisanya disamarkan. Tamu mengenali dirinya tanpa
 * halaman ini pernah membocorkan nama utuh orang lain.
 */
export function searchConfirmationLabel(fullName: string, query: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const needle = query.trim().toLowerCase();
  if (!needle) return toInitials(fullName);

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower.includes(needle) || needle.includes(lower)) return word;
      return `${word[0]?.toUpperCase() ?? ""}.`;
    })
    .join(" ");
}
