/**
 * Alamat tujuan Pesan peserta: normalisasi nomor WhatsApp dan daftar uji.
 */

/**
 * Nomor Indonesia ke format internasional tanpa tanda plus, seperti yang
 * diminta WhatsApp Cloud API: "0812-3456-789" dan "+62 812 3456 789" sama-sama
 * menjadi "628123456789". Null bila jelas bukan nomor ponsel.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let angka = raw.replace(/[^\d+]/g, "");
  if (angka.startsWith("+")) angka = angka.slice(1);
  else if (angka.startsWith("00")) angka = angka.slice(2);
  else if (angka.startsWith("0")) angka = `62${angka.slice(1)}`;
  else if (angka.startsWith("8")) angka = `62${angka}`;
  if (!/^\d{9,15}$/.test(angka)) return null;
  return angka;
}

export function normalizeAddress(email: string | null | undefined): string | null {
  const bersih = email?.trim().toLowerCase();
  return bersih && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bersih) ? bersih : null;
}

/**
 * Daftar uji. `MESSAGING_ALLOWLIST` berisi email dan nomor dipisah koma.
 *
 * Bila terisi, mesin hanya mengirim ke alamat di daftar itu dan menandai semua
 * penerima lain sebagai dilewati. Di luar produksi (preview Vercel, lokal)
 * daftar ini WAJIB: preview memakai database produksi, jadi tanpa daftar uji
 * semua kiriman di preview ditolak. Gagal tertutup, bukan terbuka.
 */
export function messagingAllowlist(): { mode: "off" } | { mode: "list"; entries: Set<string> } | { mode: "blocked" } {
  const isi = process.env.MESSAGING_ALLOWLIST?.trim();
  if (isi) {
    const entries = new Set(
      isi
        .split(",")
        .map((bagian) => bagian.trim())
        .filter(Boolean)
        .map((bagian) => (bagian.includes("@") ? bagian.toLowerCase() : normalizePhone(bagian) ?? bagian)),
    );
    return { mode: "list", entries };
  }
  const produksi = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production";
  return produksi ? { mode: "off" } : { mode: "blocked" };
}

export function allowedByList(address: string, list = messagingAllowlist()): boolean {
  if (list.mode === "off") return true;
  if (list.mode === "blocked") return false;
  return list.entries.has(address);
}
