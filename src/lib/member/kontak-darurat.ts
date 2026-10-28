import { nomorKru, PONSEL } from "../logistik/kontak-kru.ts";

/**
 * Kontak darurat portal Horizon (E-03), diisi di Participant area >
 * Emergency and help dengan isian yang jelas (nama atau peran, nomor,
 * catatan, tautan peta), bukan lagi lewat blok Columns di Event page.
 * Disimpan di `landing_config.member.help`.
 */
export type TeksKontakEn = { name?: string | null; note?: string | null };
/**
 * Jenis kontak darurat (keputusan Mas 28 Okt): dipilih panitia per kontak dan
 * tampil sebagai ikon di depan nama, seperti daftar nomor darurat aplikasi
 * perjalanan. Kosong = tanpa ikon, tampilan lama.
 */
export const JENIS_DARURAT = ["hospital", "police", "fire", "ambulance", "hotel", "other"] as const;
export type JenisDarurat = (typeof JENIS_DARURAT)[number];
export const LABEL_JENIS_DARURAT: Record<JenisDarurat, string> = {
  hospital: "Hospital or clinic",
  police: "Police",
  fire: "Fire brigade",
  ambulance: "Ambulance",
  hotel: "Hotel",
  other: "Other",
};
export type KontakDarurat = { name: string; kind?: JenisDarurat | null; phone?: string | null; note?: string | null; map_url?: string | null; en?: TeksKontakEn | null };
export type BantuanDarurat = { title?: string | null; note?: string | null; contacts?: KontakDarurat[]; en?: { title?: string | null; note?: string | null } | null };

/** Mas 28 Okt: 8 terlalu sedikit untuk acara lintas kota. */
export const KONTAK_DARURAT_MAX = 12;
// Nama dan judul sama dengan judul butir dan judul blok Columns (60); catatan
// cukup untuk teks butir terpanjang (360) ditambah tautannya.
export const KONTAK_DARURAT_BATAS = { title: 60, name: 60, phone: 40, note: 1000, map_url: 600, catatan: 280 } as const;

/** Baris kartu darurat yang siap digambar: tombol hanya untuk nomor dan tautan yang terbaca. */
export type BarisKontakDarurat = {
  judul: string;
  jenis: JenisDarurat | null;
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
 * Nomor lain hanya bila isiannya satu nomor saja (angka, spasi, tanda hubung,
 * titik, kurung, + di depan) dengan bentuk nomor sungguhan: diawali 0 (9
 * sampai 13 digit, kode wilayah ikut), diawali + atau 62 (9 sampai 15 digit),
 * atau nomor darurat 1xx. Jam, tanggal, dan rentang ("0900-1700",
 * "0812-0813") tidak jadi tombol, agar tidak salah sambung.
 */
export function nomorTelepon(teks: string | null | undefined): { tel: string; wa: string | null } | null {
  const isi = (teks ?? "").trim();
  if (!isi || JAM_ATAU_TANGGAL.test(isi) || !/^\+?[\d\s().-]+$/.test(isi)) return null;
  const ponsel = nomorKru(isi);
  if (ponsel) return { tel: ponsel.tel, wa: ponsel.wa };
  const angka = isi.replace(/\D/g, "");
  if (NOMOR_PENDEK.test(angka) && angka.length === isi.length) return { tel: angka, wa: null };
  // 62 di depan tanpa + (62 21 5000800) tetap kode negara Indonesia.
  const negara = isi.startsWith("+") || angka.startsWith("62");
  if (negara ? angka.length < 9 || angka.length > 15 : !angka.startsWith("0") || angka.length < 9 || angka.length > 13) return null;
  return { tel: `${negara ? "+" : ""}${angka}`, wa: null };
}

// Kode wilayah dua digit: Jakarta, Bandung, Semarang, Surabaya, Medan.
const WILAYAH_DUA = /^(?:21|22|24|31|61)/;

/**
 * Nomor seperti yang ditampilkan di kartu: nomor Indonesia yang terbaca
 * selalu +62 dengan tanda hubung (ponsel 3-4-sisa: "+62 811-2546-014",
 * kantor kode wilayah lalu nomor: "+62 274-555-0101"), apa pun cara panitia
 * mengetiknya. Nomor pendek (119) dan nomor yang tidak terbaca tetap apa adanya.
 */
export function nomorTampil(nomor: string | null | undefined, tel: string | null | undefined): string | null {
  const isi = (nomor ?? "").trim();
  if (!isi) return null;
  const nasional = tel?.startsWith("+62") ? tel.slice(3) : tel?.startsWith("0") ? tel.slice(1) : null;
  if (!nasional || !/^\d{7,12}$/.test(nasional)) return isi;
  if (nasional.startsWith("8")) return `+62 ${nasional.slice(0, 3)}-${nasional.slice(3, 7)}-${nasional.slice(7)}`;
  const kode = nasional.slice(0, WILAYAH_DUA.test(nasional) ? 2 : 3);
  const sisa = nasional.slice(kode.length);
  const kelompok = sisa.length <= 6 ? [sisa.slice(0, 3), sisa.slice(3)] : [sisa.slice(0, -4), sisa.slice(-4)];
  return `+62 ${kode}-${kelompok.filter(Boolean).join("-")}`;
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
    // google.com, google.co.id, google.com.sg, google.de: bukan google.evil.com.
    return /^google\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(host) && pathname.startsWith("/maps");
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
      const jenis = item.kind && (JENIS_DARURAT as readonly string[]).includes(item.kind) ? item.kind : null;
      return { judul: item.name.trim(), jenis, nomor: nomorTampil(nomor, sambung?.tel), isi: item.note?.trim() || null, tel: sambung?.tel ?? null, wa: sambung?.wa ?? null, peta: tautanPeta(item.map_url) };
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
export function kontakDariBlok(
  items: Array<{ title?: string | null; body?: string | null; href?: string | null; en?: { title?: string | null; body?: string | null } | null }>,
): KontakDarurat[] {
  return items
    .filter((item) => item.title?.trim() || item.body?.trim())
    .slice(0, KONTAK_DARURAT_MAX)
    .map((item) => {
      const judul = item.title?.trim() || "";
      const teks = item.body?.trim() || "";
      const nomorTeks = cariNomor(teks);
      const nomorJudul = nomorTeks ? null : cariNomor(judul);
      const nomor = nomorTeks ?? nomorJudul;
      const href = item.href?.trim() || "";
      const peta = href && alamatPeta(href) ? href : null;
      const tautan = href && !peta ? href : "";
      const catatan = gabungCatatan(tanpaNomor(teks, nomorTeks), tautan);
      // Teks English butir lama ikut (judul dan teks, tanpa nomor yang sama).
      const judulEn = item.en?.title?.trim() || "";
      const teksEn = item.en?.body?.trim() || "";
      const en = {
        name: judulEn && judul ? tanpaNomor(judulEn, nomorJudul).slice(0, KONTAK_DARURAT_BATAS.name) || null : null,
        note: teksEn && catatan ? gabungCatatan(tanpaNomor(teksEn, nomor), tautan).slice(0, KONTAK_DARURAT_BATAS.note) || null : null,
      };
      return {
        name: tanpaNomor(judul, nomorJudul).slice(0, KONTAK_DARURAT_BATAS.name),
        phone: nomor,
        note: catatan.slice(0, KONTAK_DARURAT_BATAS.note) || null,
        map_url: peta,
        ...(en.name || en.note ? { en } : {}),
      };
    });
}

/** Nomor pertama di teks yang benar-benar bisa ditelepon (ponsel, atau nomor kantor yang lolos nomorTelepon). */
function cariNomor(teks: string): string | null {
  for (const pola of [PONSEL, KANTOR]) {
    for (const cocok of teks.matchAll(new RegExp(pola.source, "g"))) {
      const calon = cocok[0].trim();
      if (nomorTelepon(calon)) return calon;
    }
  }
  return null;
}

/** Teks tanpa nomornya, dengan tanda baca sisa dirapikan ("Buka , lantai 2" jadi "Buka, lantai 2"). */
function tanpaNomor(teks: string, nomor: string | null): string {
  const sisa = nomor ? teks.replace(nomor, "") : teks;
  return sisa
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[\s:,;-]+|[\s:,;-]+$/g, "");
}

function gabungCatatan(teks: string, tautan: string): string {
  return [teks, tautan].filter(Boolean).join("\n");
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
    const en = { name: isi(item.en?.name), note: isi(item.en?.note) };
    const kind = item.kind && (JENIS_DARURAT as readonly string[]).includes(item.kind) ? item.kind : null;
    const rapi = { name: item.name?.trim() ?? "", ...(kind ? { kind } : {}), phone: isi(item.phone), note: isi(item.note), map_url: isi(item.map_url), ...(en.name || en.note ? { en } : {}) };
    if (!rapi.name && !rapi.phone && !rapi.note && !rapi.map_url) return;
    if (!rapi.name && tanpaNama === null) tanpaNama = index;
    contacts.push(rapi);
  });
  const title = isi(help?.title);
  const note = isi(help?.note);
  const en = { title: isi(help?.en?.title), note: isi(help?.en?.note) };
  return { help: title || note || contacts.length ? { title, note, contacts, ...(en.title || en.note ? { en } : {}) } : null, tanpaNama };
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

/**
 * Kontak darurat dalam satu bahasa, aturan yang sama dengan halaman acara
 * (landing-i18n tumpuk): teks English menggantikan teks Indonesia hanya bila
 * keduanya terisi. Nomor dan peta sama di kedua bahasa.
 */
export function bantuanBahasa(help: BantuanDarurat | null | undefined, lang: "id" | "en"): BantuanDarurat | null {
  if (!help || lang === "id") return help ?? null;
  const pilih = (asli: string | null | undefined, en: string | null | undefined) => (asli?.trim() && en?.trim() ? en.trim() : asli);
  return {
    ...help,
    title: pilih(help.title, help.en?.title),
    note: pilih(help.note, help.en?.note),
    contacts: help.contacts?.map((item) => ({ ...item, name: pilih(item.name, item.en?.name) ?? item.name, note: pilih(item.note, item.en?.note) })),
  };
}
