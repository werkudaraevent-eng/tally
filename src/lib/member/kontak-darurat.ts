import { nomorKru } from "../logistik/kontak-kru.ts";

/**
 * Kontak darurat portal Horizon (E-03), diisi di Participant area >
 * Emergency and help dengan isian yang jelas (nama atau peran, nomor,
 * catatan, tautan peta), bukan lagi lewat blok Columns di Event page.
 * Disimpan di `landing_config.member.help`.
 */
export type KontakDarurat = { name: string; phone?: string | null; note?: string | null; map_url?: string | null };
export type BantuanDarurat = { note?: string | null; contacts?: KontakDarurat[] };

export const KONTAK_DARURAT_MAX = 8;
export const KONTAK_DARURAT_BATAS = { name: 60, phone: 40, note: 160, map_url: 600, catatan: 280 } as const;

/** Baris kartu darurat yang siap digambar: tombol hanya untuk nomor dan tautan yang terbaca. */
export type BarisKontakDarurat = {
  judul: string;
  nomor: string | null;
  isi: string | null;
  tel: string | null;
  wa: string | null;
  peta: string | null;
};

/**
 * Nomor untuk tombol Telepon. Ponsel Indonesia jadi +62 (dan WhatsApp);
 * nomor lain (kantor, 112, hotel) dipakai apa adanya bila hanya berisi angka,
 * spasi, tanda hubung, titik, kurung, dan + di depan, 3 sampai 15 digit.
 * Teks lain ("ext. 12", dua nomor) tidak jadi tombol, agar tidak salah sambung.
 */
export function nomorTelepon(teks: string | null | undefined): { tel: string; wa: string | null } | null {
  const isi = (teks ?? "").trim();
  if (!isi) return null;
  const ponsel = nomorKru(isi);
  if (ponsel && isi.replace(/[\s().-]/g, "").replace(/^\+/, "").length <= 15) return { tel: ponsel.tel, wa: ponsel.wa };
  if (!/^\+?[\d\s().-]+$/.test(isi)) return null;
  const angka = isi.replace(/\D/g, "");
  if (angka.length < 3 || angka.length > 15) return null;
  return { tel: `${isi.startsWith("+") ? "+" : ""}${angka}`, wa: null };
}

/** Tautan peta hanya http(s). */
export function tautanPeta(teks: string | null | undefined): string | null {
  const isi = (teks ?? "").trim();
  return /^https?:\/\/[^\s"'<>\\]+$/i.test(isi) ? isi : null;
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

/** Blok Columns lama (judul, teks, tautan per butir) menjadi isian kontak, untuk tombol "Copy from block". */
export function kontakDariBlok(items: Array<{ title?: string | null; body?: string | null; href?: string | null }>): KontakDarurat[] {
  return items
    .filter((item) => item.title?.trim() || item.body?.trim())
    .slice(0, KONTAK_DARURAT_MAX)
    .map((item) => {
      const judul = item.title?.trim() || "";
      const teks = item.body?.trim() || "";
      const sumber = [judul, teks].join(" ");
      const ponsel = sumber.match(/(?:\+|00)?62[\d\s.-]{8,}|0\d[\d\s.-]{6,}/);
      const nomor = ponsel ? ponsel[0].trim().replace(/[\s.-]+$/, "") : null;
      const sisa = nomor ? teks.replace(nomor, "").replace(/^[\s:,-]+|[\s:,-]+$/g, "") : teks;
      const href = item.href?.trim() || "";
      return {
        name: (judul || sisa || nomor || "").slice(0, KONTAK_DARURAT_BATAS.name),
        phone: nomor,
        note: judul && sisa ? sisa.slice(0, KONTAK_DARURAT_BATAS.note) : null,
        map_url: tautanPeta(href),
      };
    });
}

/**
 * Sebelum disimpan: kontak yang semua isiannya kosong dibuang, teks dipangkas.
 * `tanpaNama`: urutan kontak pertama yang berisi tetapi belum punya nama atau
 * peran, supaya layar admin bisa menunjuknya. Tanpa catatan dan kontak = null.
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
  const note = isi(help?.note);
  return { help: note || contacts.length ? { note, contacts } : null, tanpaNama };
}
