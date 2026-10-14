// Pencocokan daftar tiket tambahan dari panitia ke peserta acara.
//
// Murni (tanpa database) supaya bisa diuji: route mengambil peserta acara, lalu
// menyerahkan baris berkas dan daftar peserta ke sini.
//
// Yang dicocokkan hanya QR dan email. Nama tidak pernah dipakai: nama sering
// ganda ("Budi Santoso" ada tiga) atau beda ejaan, dan salah cocok berarti
// tiket tambahan jatuh ke orang yang tidak dipilih panitia tanpa ada yang tahu.

export const BONUS_TEMPLATE_HEADERS = ["QR peserta", "Email", "Nama (untuk dicek)"] as const;

const ALIASES = {
  qr: ["qr peserta", "qr", "qr code", "kode qr", "kode", "code", "participant code", "id peserta"],
  email: ["email", "e-mail", "surel", "alamat email"],
  name: ["nama (untuk dicek)", "nama", "name", "nama peserta", "full name"],
} as const;

export type BonusListRow = { row: number; qr: string; email: string; name: string };
export type BonusParticipant = { id: string; name: string; company: string | null; qr_code: string | null; email: string | null };
export type BonusMissing = { row: number; value: string; reason: string };
export type BonusMatch = {
  rows_read: number;
  matched: { participant_id: string; name: string; company: string | null }[];
  duplicates: number;
  missing: BonusMissing[];
  missing_total: number;
};

/** Batas baris "tidak ditemukan" yang dikirim balik; jumlahnya tetap dihitung penuh. */
const MISSING_LIMIT = 200;

/**
 * Baris berkas menjadi kunci QR/email.
 *
 * Baris judul dikenali dari namanya. Berkas tanpa judul tetap terbaca: sel yang
 * memuat "@" dianggap email, sel pertama yang lain dianggap QR. Panitia sering
 * menempelkan satu kolom email dari sistem lain tanpa judul apa pun.
 *
 * null bila berkas punya baris judul tetapi tidak ada kolom QR atau Email.
 */
export function rowsToBonusKeys(rows: { row: number; cells: string[] }[]): BonusListRow[] | null {
  const nonEmpty = rows.filter((item) => item.cells.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return [];

  const header = nonEmpty[0].cells.map((cell) => cell.trim().toLowerCase());
  const find = (names: readonly string[]) => header.findIndex((cell) => names.includes(cell));
  const qrAt = find(ALIASES.qr);
  const emailAt = find(ALIASES.email);
  const nameAt = find(ALIASES.name);

  // Ada baris judul (mis. "No, NIK, Nama") tapi tanpa kolom QR maupun Email:
  // tidak ada yang bisa dicocokkan, dan membacanya sebagai berkas tanpa judul
  // hanya menghasilkan daftar "tidak ditemukan" yang membingungkan.
  if (qrAt < 0 && emailAt < 0 && nameAt >= 0) return null;

  if (qrAt >= 0 || emailAt >= 0) {
    const cell = (cells: string[], at: number) => (at >= 0 ? (cells[at] ?? "").trim() : "");
    return nonEmpty.slice(1).map(({ row, cells }) => ({ row, qr: cell(cells, qrAt), email: cell(cells, emailAt), name: cell(cells, nameAt) }));
  }

  return nonEmpty.map(({ row, cells }) => {
    const values = cells.map((cell) => cell.trim()).filter(Boolean);
    const email = values.find((value) => value.includes("@")) ?? "";
    const qr = values.find((value) => !value.includes("@")) ?? "";
    return { row, qr, email, name: "" };
  });
}

/** Cocokkan setiap baris ke satu peserta. QR didahulukan bila keduanya diisi. */
export function matchBonusRows(rows: BonusListRow[], participants: BonusParticipant[]): BonusMatch {
  const byQr = new Map<string, BonusParticipant>();
  const byEmail = new Map<string, BonusParticipant>();
  // Email tidak unik per acara (satu email kantor bisa dipakai beberapa
  // peserta), QR unik. Email yang dipakai lebih dari satu peserta tidak
  // dicocokkan ke siapa pun: memilih salah satunya berarti tiket tambahan jatuh
  // ke orang yang tidak dipilih panitia tanpa ada yang tahu.
  const emailUsers = new Map<string, number>();
  for (const person of participants) {
    if (person.qr_code) byQr.set(person.qr_code.trim().toLowerCase(), person);
    if (person.email) {
      const key = person.email.trim().toLowerCase();
      byEmail.set(key, person);
      emailUsers.set(key, (emailUsers.get(key) ?? 0) + 1);
    }
  }

  const seen = new Set<string>();
  const matched: BonusMatch["matched"] = [];
  const missing: BonusMissing[] = [];
  let missingTotal = 0;
  let duplicates = 0;

  const miss = (item: BonusMissing) => {
    missingTotal += 1;
    if (missing.length < MISSING_LIMIT) missing.push(item);
  };

  for (const item of rows) {
    const qr = item.qr.toLowerCase();
    const email = item.email.toLowerCase();
    if (!qr && !email) {
      // Baris yang hanya berisi nama tetap dilaporkan: itu tanda panitia
      // mengisi kolom yang salah, bukan baris kosong.
      if (item.name) miss({ row: item.row, value: item.name, reason: "QR dan email kosong" });
      continue;
    }
    const byQrCode = qr ? byQr.get(qr) : undefined;
    const sharedBy = !byQrCode && email ? (emailUsers.get(email) ?? 0) : 0;
    if (sharedBy > 1) {
      miss({ row: item.row, value: item.email, reason: `Email dipakai ${sharedBy} peserta, isi QR-nya` });
      continue;
    }
    const person = byQrCode ?? (email ? byEmail.get(email) : undefined);
    if (!person) {
      miss({
        row: item.row,
        value: item.qr || item.email,
        reason: qr && email ? "QR dan email tidak ada di acara ini" : qr ? "QR tidak ada di acara ini" : "Email tidak terdaftar di acara ini",
      });
      continue;
    }
    if (seen.has(person.id)) { duplicates += 1; continue; }
    seen.add(person.id);
    matched.push({ participant_id: person.id, name: person.name, company: person.company });
  }

  // Dihitung dari hasilnya, supaya cocok + ganda + tidak ditemukan selalu sama
  // dengan angka "baris dibaca" di layar.
  return { rows_read: matched.length + duplicates + missingTotal, matched, duplicates, missing, missing_total: missingTotal };
}
