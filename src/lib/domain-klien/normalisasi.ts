/**
 * Aturan nama domain klien. Fungsi murni, tanpa jaringan, supaya bisa diuji
 * langsung dengan Node (normalisasi.check.ts).
 */

export type HasilNormalisasi =
  | { ok: true; domain: string; apex: boolean }
  | { ok: false; code: "DOMAIN_INVALID" | "DOMAIN_RESERVED"; message: string };

/**
 * Akhiran yang tidak boleh dipakai sebagai domain klien: milik Tally sendiri
 * atau milik Vercel. Domain di bawah sofish.tech akan bertabrakan dengan alamat
 * utama, dan *.vercel.app tidak bisa dipasang ke proyek lewat API.
 */
const AKHIRAN_TERLARANG = ["sofish.tech", "vercel.app", "vercel.com", "vercel-dns.com", "werkudara.group"];

/**
 * Akhiran dua tingkat yang umum dipakai di Indonesia dan sekitarnya. Dipakai
 * hanya untuk MENEBAK apakah domain itu domain utama klien (apex) supaya kami
 * bisa memberi peringatan; salah tebak tidak memblokir apa pun.
 */
const AKHIRAN_GANDA = new Set(["co.id", "or.id", "ac.id", "go.id", "web.id", "my.id", "biz.id", "sch.id", "net.id", "co.uk", "org.uk", "com.au", "com.sg", "com.my"]);

export function normalizeDomain(masukan: string, hostTally: string[] = []): HasilNormalisasi {
  let teks = masukan.trim().toLowerCase();
  teks = teks.replace(/^[a-z]+:\/\//, "");
  teks = teks.split(/[/?#]/)[0] ?? "";
  teks = teks.replace(/:\d+$/, "").replace(/\.+$/, "");
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const bagian = teks.split(".");
  if (teks.length === 0 || teks.length > 253 || bagian.length < 2 || !bagian.every((b) => label.test(b)) || !/^[a-z]{2,}$/.test(bagian.at(-1) ?? "")) {
    return { ok: false, code: "DOMAIN_INVALID", message: "Tulis domainnya saja, misalnya event.namaklien.com." };
  }
  const terlarang = [...AKHIRAN_TERLARANG, ...hostTally.map((h) => h.toLowerCase())];
  if (terlarang.some((akhiran) => teks === akhiran || teks.endsWith(`.${akhiran}`))) {
    return { ok: false, code: "DOMAIN_RESERVED", message: "Domain ini milik Tally atau Vercel. Pakai domain milik klien." };
  }
  return { ok: true, domain: teks, apex: isApex(teks) };
}

/** Domain utama (tanpa subdomain), misalnya klien.com atau klien.co.id. */
export function isApex(domain: string) {
  const bagian = domain.split(".");
  if (bagian.length === 2) return true;
  return bagian.length === 3 && AKHIRAN_GANDA.has(bagian.slice(1).join("."));
}

/**
 * Isi kolom "Nama" di panel DNS: bagian domain di depan domain utamanya.
 * `event.klien.co.id` -> `event`, `forum.event.klien.com` -> `forum.event`,
 * domain utama -> `@`.
 */
export function dnsRecordName(domain: string) {
  if (isApex(domain)) return "@";
  const bagian = domain.split(".");
  const panjangApex = AKHIRAN_GANDA.has(bagian.slice(-2).join(".")) ? 3 : 2;
  return bagian.slice(0, bagian.length - panjangApex).join(".");
}

/** Nama record verifikasi relatif terhadap domain utama (`_vercel`, `_vercel.event`). */
export function relativeName(fqdn: string, domain: string) {
  const bagian = domain.split(".");
  const panjangApex = isApex(domain) ? bagian.length : AKHIRAN_GANDA.has(bagian.slice(-2).join(".")) ? 3 : 2;
  const apex = bagian.slice(bagian.length - panjangApex).join(".");
  const bersih = fqdn.replace(/\.+$/, "").toLowerCase();
  if (bersih === apex) return "@";
  return bersih.endsWith(`.${apex}`) ? bersih.slice(0, -(apex.length + 1)) : bersih;
}
