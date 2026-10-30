/**
 * Siapa yang melihat sebuah pengumuman (Messages > Announcements > Send to,
 * migrasi 202610300004).
 *
 *   semua      semua akun area peserta, termasuk yang belum disetujui
 *   disetujui  akun yang sudah tertaut ke peserta
 *   syarat     peserta yang cocok dengan SEMUA syarat (1-3), aturan yang sama
 *              dengan Agenda > Who sees it (sasaran-baris.ts), ditambah
 *              Organisasi (`KOLOM_ORGANISASI`, kolom Company peserta)
 *   pilih      peserta tertentu, 1-500 id
 *
 * Syarat dicek saat peserta membuka portal, bukan dibekukan saat terbit:
 * pengumuman tinggal di lonceng berhari-hari, dan peserta yang pindah batch
 * harus ikut melihatnya (audiens dinamis, pola Mailchimp dan Intercom).
 *
 * `syarat` dan `pilih` hanya untuk akun yang tertaut ke peserta. Bentuk yang
 * rusak atau penerima yang tidak dikenal tidak tampil ke siapa pun: gagal
 * tertutup, sama dengan Who sees it.
 *
 * Murni, tanpa impor runtime selain sasaran-blok, supaya bisa diuji langsung
 * oleh Node (sasaran-pengumuman.check.ts).
 */
import { bacaSasaranBlok, blokUntukPeserta, samaJawaban, type DataSasaranPeserta, type SasaranBlok } from "./sasaran-blok.ts";

export type AudiensPengumuman = "semua" | "disetujui" | "syarat" | "pilih";

/** Kunci syarat Organisasi. Tidak bisa bentrok dengan kunci pertanyaan, yang hanya a-z, 0-9 dan _. */
export const KOLOM_ORGANISASI = "@company";

/** Sama dengan CHECK di migrasi 202610300004. */
export const SYARAT_PENGUMUMAN_MAX = 3;
export const PILIH_MAX = 500;
/** Organisasi terpilih per syarat, dan panjang namanya. */
export const ORGANISASI_MAX = 100;
export const ORGANISASI_PANJANG = 200;

/**
 * sessionStorage: Participant list > centang > Announce menitipkan id peserta
 * terpilih di sini, lalu Announcements membuka pengumuman baru untuk mereka.
 * Satu kali pakai; id terlalu banyak untuk URL.
 */
export const KUNCI_UMUMKAN = "tally:umumkan-ke";

const RUSAK: SasaranBlok = { field: "", values: [] };

/** Satu syarat Organisasi: nama organisasi apa adanya, tanpa kembar. */
function bacaOrganisasi(nilai: Record<string, unknown>): SasaranBlok {
  const values: string[] = [];
  for (const isi of Array.isArray(nilai.values) ? nilai.values : []) {
    const teks = typeof isi === "string" ? isi.trim().slice(0, ORGANISASI_PANJANG) : "";
    if (teks && !values.some((ada) => samaJawaban(ada, teks))) values.push(teks);
  }
  return values.length ? { field: KOLOM_ORGANISASI, values: values.slice(0, ORGANISASI_MAX) } : RUSAK;
}

/**
 * Syarat tersimpan. Kosong, bukan larik, lebih dari tiga, atau salah satunya
 * rusak: satu syarat yang tidak cocok dengan siapa pun.
 */
export function bacaSyaratPengumuman(nilai: unknown): SasaranBlok[] {
  if (!Array.isArray(nilai) || nilai.length === 0 || nilai.length > SYARAT_PENGUMUMAN_MAX) return [RUSAK];
  return nilai.map((isi) => {
    if (!isi || typeof isi !== "object" || Array.isArray(isi)) return RUSAK;
    const baris = isi as Record<string, unknown>;
    if (baris.field === KOLOM_ORGANISASI) return bacaOrganisasi(baris);
    const sasaran = bacaSasaranBlok(baris);
    return sasaran && sasaran.field && sasaran.values.length ? sasaran : RUSAK;
  });
}

export type PengumumanBersasaran = { audience: string; audience_rules?: unknown; audience_ids?: unknown };

export type PenontonPengumuman = {
  /** Akun sudah tertaut ke peserta (status approved di getMemberSession). */
  disetujui: boolean;
  participantId: string | null;
  company: string | null;
  /** Jawaban dan hotel peserta; null bila tidak dimuat (tanpa syarat kolom). */
  data: DataSasaranPeserta | null;
};

/** Peserta ini melihat pengumumannya? */
export function pengumumanUntuk(item: PengumumanBersasaran, penonton: PenontonPengumuman): boolean {
  if (item.audience === "semua") return true;
  if (!penonton.disetujui) return false;
  if (item.audience === "disetujui") return true;
  if (!penonton.participantId) return false;
  if (item.audience === "pilih") {
    return Array.isArray(item.audience_ids) && item.audience_ids.length <= PILIH_MAX && item.audience_ids.includes(penonton.participantId);
  }
  if (item.audience !== "syarat") return false;
  return syaratCocok(bacaSyaratPengumuman(item.audience_rules), penonton.company, penonton.data);
}

/**
 * Semua syarat cocok. Organisasi dibandingkan tanpa beda huruf besar dan spasi
 * tepi, seperti saringan Organisation di Participant list; tanpa organisasi
 * tidak cocok. Hotel cocok dengan hotel mana pun yang pernah ditinggali
 * peserta (pengumuman tidak bertanggal).
 */
export function syaratCocok(syarat: SasaranBlok[], company: string | null, data: DataSasaranPeserta | null): boolean {
  return syarat.every((isi) => {
    if (!isi.field || isi.values.length === 0) return false;
    if (isi.field === KOLOM_ORGANISASI) {
      const nama = company?.trim() ?? "";
      return nama !== "" && isi.values.some((nilai) => samaJawaban(nilai, nama));
    }
    return blokUntukPeserta(isi, data, null);
  });
}

/** Kolom syarat yang perlu jawaban atau hotel peserta (semua selain Organisasi). */
export function syaratKolom(items: PengumumanBersasaran[]): SasaranBlok[] {
  return items
    .filter((item) => item.audience === "syarat")
    .flatMap((item) => bacaSyaratPengumuman(item.audience_rules))
    .filter((isi) => isi.field && isi.field !== KOLOM_ORGANISASI);
}
