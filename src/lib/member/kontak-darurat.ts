import { nomorKru, PONSEL } from "../logistik/kontak-kru.ts";

/**
 * Kontak darurat portal Horizon (E-03), diisi di Participant area >
 * Emergency and help dengan isian yang jelas (nama atau peran, nomor,
 * catatan, tautan peta), bukan lagi lewat blok Columns di Event page.
 * Disimpan di `landing_config.member.help`.
 */
export type KontakDarurat = { name: string; phone?: string | null; note?: string | null; map_url?: string | null };
export type BantuanDarurat = { title?: string | null; note?: string | null; contacts?: KontakDarurat[] };

export const KONTAK_DARURAT_MAX = 8;
// Nama dan judul sama dengan judul butir dan judul blok Columns (60); catatan
// cukup untuk teks butir terpanjang (360) ditambah tautannya.
export const KONTAK_DARURAT_BATAS = { title: 60, name: 60, phone: 40, note: 1000, map_url: 600, catatan: 280 } as const;

/** Baris kartu darurat yang siap digambar: tombol hanya untuk nomor dan tautan yang terbaca. */
export type BarisKontakDarurat = {
  judul: string;
  nomor: string | null;
  isi: string | null;
  tel: string | null;
  wa: string | null;
  peta: string | null;
};

// Jam (08.00, 8:30) dan tanggal (2026-11-06, 06/11) bukan nomor telepon.
const JAM_ATAU_TANGGAL = /\b\d{1,2}[.:]\d{2}\b|\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
// Nomor darurat pendek Indonesia (110, 112, 113, 115, 118, 119, 129).
const NOMOR_PENDEK = /^1\d{2}$/;
// Nomor kantor: (0274) 514 845, 0274-514845, 021 5000 800, +62 274 514845.
const KANTOR = /(?:\(0\d{1,3}\)|(?<![\d+])0[1-79]\d{1,3}|\+62[ \t.-]?[1-79]\d{1,3})(?:[ \t-]?\d{3,4}){1,2}(?!\d)/;

/**
 * Nomor untuk tombol Telepon. Ponsel Indonesia jadi +62 (dan WhatsApp).
 * Nomor lain hanya bila isiannya satu nomor saja: angka, spasi, tanda hubung,
 * titik, kurung, dan + di depan; 7 sampai 15 digit, atau nomor darurat 1xx.
 * Jam, tanggal, dan teks lain tidak jadi tombol, agar tidak salah sambung.
 */
export function nomorTelepon(teks: string | null | undefined): { tel: string; wa: string | null } | null {
  const isi = (teks ?? "").trim();
  if (!isi || JAM_ATAU_TANGGAL.test(isi) || !/^\+?[\d\s().-]+$/.test(isi)) return null;
  const ponsel = nomorKru(isi);
  if (ponsel) return { tel: ponsel.tel, wa: ponsel.wa };
  const angka = isi.replace(/\D/g, "");
  if (NOMOR_PENDEK.test(angka) && angka.length === isi.length) return { tel: angka, wa: null };
  if (angka.length < 7 || angka.length > 15) return null;
  // 62 di depan tanpa + (62 21 5000800) tetap kode negara Indonesia.
  return { tel: `${isi.startsWith("+") || angka.startsWith("62") ? "+" : ""}${angka}`, wa: null };
}

/** Tautan peta hanya http(s). */
export function tautanPeta(teks: string | null | undefined): string | null {
  const isi = (teks ?? "").trim();
  return /^https?:\/\/[^\s"'<>\\]+$/i.test(isi) ? isi : null;
}

/** Hanya alamat Google Maps dan Apple Maps yang menjadi tombol Peta saat menyalin blok. */
function alamatPeta(href: string): boolean {
  if (!tautanPeta(href)) return false;
  try {
    const { hostname, pathname } = new URL(href);
    const host = hostname.toLowerCase().replace(/^www\./, "");
    if (host === "maps.app.goo.gl" || host === "maps.apple.com" || host === "maps.google.com") return true;
    if (host === "goo.gl") return pathname.startsWith("/maps");
    return /^google\.[a-z.]+$/.test(host) && pathname.startsWith("/maps");
  } catch {
    return false;
  }
}

export function barisKontakDarurat(kontak: KontakDarurat[] | null | undefined): BarisKontakDarurat[] {
  return (kontak ?? [])
    .filter((item) => item.name?.trim())
    .slice(0, KONTAK_DARURAT_MAX)
    .map((item) => {
      const nomor = item.phone?.trim() || null;
      const sambung = nomorTelepon(nomor);
      return { judul: item.name.trim(), nomor, isi: item.note?.trim() || null, tel: sambung?.tel ?? null, wa: sambung?.wa ?? null, peta: tautanPeta(item.map_url) };
    });
}

/**
 * Blok Columns lama menjadi isian kontak, untuk "Copy into contacts". Tidak
 * ada teks yang hilang: judul butir jadi nama, teksnya jadi catatan, dan
 * nomornya hanya diambil bila jelas (ponsel, atau nomor kantor yang bukan jam
 * atau tanggal); selain itu nomor dibiarkan kosong untuk diisi panitia.
 * Butir tanpa judul mendapat nama kosong, jadi Save menunjuknya untuk diberi
 * nama. Tautan selain peta (grup WhatsApp, formulir) tetap di catatan.
 */
export function kontakDariBlok(items: Array<{ title?: string | null; body?: string | null; href?: string | null }>): KontakDarurat[] {
  return items
    .filter((item) => item.title?.trim() || item.body?.trim())
    .slice(0, KONTAK_DARURAT_MAX)
    .map((item) => {
      const judul = item.title?.trim() || "";
      const teks = item.body?.trim() || "";
      const cari = (sumber: string) => sumber.match(PONSEL)?.[0] ?? (JAM_ATAU_TANGGAL.test(sumber.match(KANTOR)?.[0] ?? "") ? null : (sumber.match(KANTOR)?.[0] ?? null));
      const nomorTeks = cari(teks);
      const nomorJudul = nomorTeks ? null : cari(judul);
      const nomor = (nomorTeks ?? nomorJudul)?.trim() || null;
      const sisa = nomorTeks ? teks.replace(nomorTeks, "").replace(/^[\s:,-]+|[\s:,-]+$/g, "").replace(/\s{2,}/g, " ") : teks;
      const nama = nomorJudul ? judul.replace(nomorJudul, "").replace(/^[\s:,-]+|[\s:,-]+$/g, "") : judul;
      const href = item.href?.trim() || "";
      const peta = href && alamatPeta(href) ? href : null;
      const catatan = [sisa, href && !peta ? href : ""].filter(Boolean).join("\n");
      return {
        name: nama.slice(0, KONTAK_DARURAT_BATAS.name),
        phone: nomor,
        note: catatan.slice(0, KONTAK_DARURAT_BATAS.note) || null,
        map_url: peta,
      };
    });
}

/**
 * Sebelum disimpan: kontak yang semua isiannya kosong dibuang, teks dipangkas.
 * `tanpaNama`: urutan kontak pertama yang berisi tetapi belum punya nama atau
 * peran, supaya layar admin bisa menunjuknya. Tanpa judul, catatan, dan kontak = null.
 */
export function rapikanBantuan(help: BantuanDarurat | null | undefined): { help: BantuanDarurat | null; tanpaNama: number | null } {
  const isi = (nilai: string | null | undefined) => nilai?.trim() || null;
  let tanpaNama: number | null = null;
  const contacts: KontakDarurat[] = [];
  (help?.contacts ?? []).forEach((item, index) => {
    const rapi = { name: item.name?.trim() ?? "", phone: isi(item.phone), note: isi(item.note), map_url: isi(item.map_url) };
    if (!rapi.name && !rapi.phone && !rapi.note && !rapi.map_url) return;
    if (!rapi.name && tanpaNama === null) tanpaNama = index;
    contacts.push(rapi);
  });
  const title = isi(help?.title);
  const note = isi(help?.note);
  return { help: title || note || contacts.length ? { title, note, contacts } : null, tanpaNama };
}

/**
 * Draf untuk pratinjau: kontak yang belum bernama dan tautan peta yang belum
 * sah dilewati, supaya pratinjau tetap jalan selama panitia mengetik.
 */
export function bantuanPratinjau(help: BantuanDarurat | null | undefined): BantuanDarurat | null {
  const { help: rapi } = rapikanBantuan(help);
  if (!rapi) return null;
  return { ...rapi, contacts: (rapi.contacts ?? []).filter((item) => item.name).map((item) => ({ ...item, map_url: tautanPeta(item.map_url) })) };
}
