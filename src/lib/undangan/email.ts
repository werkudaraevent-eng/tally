/**
 * Penormal email tamu undangan. SATU fungsi untuk impor, pencocokan
 * pendaftaran, dan pemeriksaan saat kirim, supaya ketiganya tidak berbeda
 * pendapat tentang apakah dua alamat itu sama.
 *
 * Yang dibersihkan: huruf besar, spasi dan karakter tak terlihat (termasuk
 * zero-width dan NBSP dari Excel), awalan `mailto:`, bentuk `Nama <a@b>`, dan
 * tanda kutip pembungkus. Titik dan tanda `+` di Gmail TIDAK digabung: itu
 * alamat yang berbeda menurut standar, dan menggabungkannya bisa mencocokkan
 * dua orang yang berbeda.
 *
 * Berkas ini tidak mengimpor apa pun, supaya bisa diuji dengan node langsung.
 */

export type HasilEmail =
  | { ok: true; email: string | null }
  | { ok: false; reason: "dua_alamat" | "tidak_sah" };

const TAK_TERLIHAT = new RegExp("[\\u0000-\\u001f\\u007f\\u00a0\\u00ad\\u180e\\u2000-\\u200f\\u2028\\u2029\\u202f\\u205f\\u2060\\u3000\\ufeff]", "g");
const POLA = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

export function normalizeInviteEmail(raw: string | null | undefined): HasilEmail {
  let s = (raw ?? "").replace(TAK_TERLIHAT, " ").trim();
  if (!s) return { ok: true, email: null };
  // Dua alamat dalam satu sel: "a@b.id; c@d.id", "a@b.id, c@d.id", "a@b.id c@d.id".
  if ((s.match(/@/g) ?? []).length > 1) return { ok: false, reason: "dua_alamat" };
  const kurung = /<([^<>]+)>\s*$/.exec(s);
  if (kurung) s = kurung[1];
  s = s.replace(/^mailto:/i, "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, "").toLowerCase();
  if (s.length > 160 || !POLA.test(s)) return { ok: false, reason: "tidak_sah" };
  return { ok: true, email: s };
}

/**
 * Email tersamar untuk formulir dari undangan: huruf pertama, selalu tiga
 * titik, lalu domain utuh. Panjangnya tetap apa pun panjang alamatnya, supaya
 * orang yang menerima tautan terusan tidak bisa menebak alamatnya dari
 * panjangnya.
 */
export function maskEmail(email: string): string {
  const [lokal, domain] = email.split("@");
  if (!lokal || !domain) return "•••";
  return `${lokal[0]}•••@${domain}`;
}
