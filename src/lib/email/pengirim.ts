/**
 * Header From untuk pengirim per acara. Murni (tanpa import) supaya bisa diuji
 * dengan `node --experimental-strip-types`.
 */

/** Bagian alamat dari `Nama <alamat@domain>` atau `alamat@domain`. */
export function senderAddress(from: string): string {
  const cocok = /<([^>]+)>\s*$/.exec(from);
  return (cocok ? cocok[1] : from).trim();
}

/**
 * `"Nama" <alamat>`. Nama SELALU dikutip (RFC 5322 quoted-string): tanpa kutip,
 * nama seperti "PT Nusa, Tbk (Panitia)" dibaca sebagai dua alamat plus komentar
 * dan Resend menolak SETIAP email acara itu. Tanda kutip sendiri sudah ditolak
 * zod dan check DB; dibuang lagi di sini untuk baris lama, backslash di-escape.
 */
export function fromWithName(name: string | null | undefined, from: string): string {
  const nama = name?.replace(/[<>"\r\n]/g, "").trim();
  if (!nama) return from;
  return `"${nama.replace(/\\/g, "\\\\")}" <${senderAddress(from)}>`;
}
