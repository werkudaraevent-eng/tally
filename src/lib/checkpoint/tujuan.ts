/**
 * Tujuan poin checkpoint (E-08, migrasi 202610170001): bila poin checkpoint
 * ditukar dengan sesuatu, kartu checkpoint peserta menulis satu baris di bawah
 * bilah kemajuan, mis. "20 poin lagi untuk masuk undian malam puncak.".
 *
 * Modul murni (tanpa server dan tanpa alias @/), dipakai pembaca setelan,
 * kartu peserta, route admin, dan pratinjau di editor admin.
 */

export const TUJUAN_POIN_MAX = 1_000_000;
/** Panjang "untuk apa": baris tetap dua sampai tiga baris di ponsel 390. */
export const TUJUAN_TEKS_MAX = 60;

export type Bahasa = "id" | "en";

/**
 * Tujuan yang disimpan di checkpoint_settings. Bahasanya mengikuti aturan
 * teks acara lain (landing-i18n.ts): teks dasar berbahasa Indonesia, teks
 * English opsional untuk halaman English. "Main language" acara hanya memilih
 * alamat, jadi tidak ikut menentukan bahasa teks ini.
 */
export type TujuanPoin = {
  points: number;
  /** Bahasa Indonesia; melanjutkan "... poin lagi untuk". */
  reward: string;
  /** Halaman peserta English; melanjutkan "... more points to". Kosong: kalimat Indonesia. */
  reward_en: string | null;
};

/** Spasi di awal, akhir, dan yang berderet dirapikan, seperti teks lain di kartu peserta. */
export function rapiTujuan(nilai: string): string {
  return nilai.trim().replace(/\s+/g, " ");
}

/** Angka tujuan dari kolom isian admin: bilangan bulat 1..1.000.000, atau null. */
export function angkaTujuan(teks: string): number | null {
  const isi = teks.trim();
  if (!/^\d+$/.test(isi)) return null;
  const angka = Number(isi);
  return angka >= 1 && angka <= TUJUAN_POIN_MAX ? angka : null;
}

/** Kolom tujuan belum ada di database: migrasi 202610170001 belum dijalankan. */
export function kolomTujuanBelumAda(error: { code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204";
}

/** Baris checkpoint_settings (dibaca dengan select *) sudah punya kolom tujuan. */
export function adaKolomTujuan(baris: Record<string, unknown> | null | undefined): boolean {
  return Boolean(baris) && Object.hasOwn(baris as object, "points_goal");
}

/**
 * Tujuan dari baris checkpoint_settings. Kolom yang belum ada, kosong, atau
 * tidak sah berarti tanpa tujuan, jadi pembaca tidak pernah gagal.
 */
export function bacaTujuan(baris: Record<string, unknown> | null | undefined): TujuanPoin | null {
  if (!baris) return null;
  const points = baris.points_goal;
  const reward = typeof baris.points_reward === "string" ? baris.points_reward.trim() : "";
  if (typeof points !== "number" || !Number.isInteger(points) || points < 1 || points > TUJUAN_POIN_MAX || !reward) return null;
  const en = typeof baris.points_reward_en === "string" ? baris.points_reward_en.trim() : "";
  return { points, reward, reward_en: en || null };
}

/** Baris tujuan yang dilihat satu peserta. */
export type TujuanPeserta = {
  /** Poin yang masih kurang; 0 berarti tujuannya sudah tercapai. */
  sisa: number;
  reward: string;
  /** Bahasa kalimatnya. Bisa berbeda dari bahasa halaman: lihat tujuanPeserta. */
  lang: Bahasa;
};

/**
 * Null (kartu tanpa baris tujuan) bila poin mati, tujuan belum diisi, atau
 * tujuannya lebih besar dari semua poin yang ditawarkan: tidak bisa dicapai,
 * jadi tidak dijanjikan ke peserta (admin melihat peringatannya).
 *
 * Halaman English tanpa teks English: kalimatnya tampil utuh dalam bahasa
 * Indonesia, tidak dicampur ("20 more points to masuk undian"), seperti judul
 * checkpoint tanpa title_en.
 */
export function tujuanPeserta(
  setelan: { points_enabled: boolean; goal: TujuanPoin | null },
  poin: { earned: number; total: number },
  lang: Bahasa,
): TujuanPeserta | null {
  const goal = setelan.goal;
  if (!setelan.points_enabled || !goal || goal.points > poin.total) return null;
  const sisa = Math.max(0, goal.points - poin.earned);
  if (lang === "en" && goal.reward_en) return { sisa, reward: goal.reward_en, lang: "en" };
  return { sisa, reward: goal.reward, lang: "id" };
}

/**
 * Teks English lama hanya dipertahankan bila teks Indonesianya tidak berubah:
 * terjemahan yang tertinggal menjanjikan hadiah lain di halaman English.
 * `dikirim` undefined = isian English tidak dikirim; null atau "" = dihapus.
 */
export function rewardEnBaru(lama: TujuanPoin | null, reward: string, dikirim: string | null | undefined): string | null {
  if (dikirim !== undefined) return dikirim?.trim() || null;
  return lama && lama.reward === reward ? lama.reward_en : null;
}

/**
 * Kalimat tujuan: bagian tebal lalu sisanya, dalam bahasa `tujuan.lang`.
 * Angka ditulis apa adanya, sama seperti "20/40 poin" di kepala kartu.
 * "untuk"/"to" yang sudah diketik admin di depan tidak digandakan, dan titik
 * ditambahkan kecuali teksnya sudah diakhiri tanda baca.
 */
export function kalimatTujuan(tujuan: Pick<TujuanPeserta, "sisa" | "reward" | "lang">): { tebal: string; sisa: string } {
  const reward = tujuan.reward.trim().replace(tujuan.lang === "en" ? /^to\s+/i : /^untuk\s+/i, "");
  const akhir = /[.!?…]$/.test(reward) ? reward : `${reward}.`;
  if (tujuan.lang === "en") {
    if (tujuan.sisa <= 0) return { tebal: "You have enough points", sisa: `to ${akhir}` };
    return { tebal: `${tujuan.sisa} more ${tujuan.sisa === 1 ? "point" : "points"}`, sisa: `to ${akhir}` };
  }
  if (tujuan.sisa <= 0) return { tebal: "Poin sudah cukup", sisa: `untuk ${akhir}` };
  return { tebal: `${tujuan.sisa} poin lagi`, sisa: `untuk ${akhir}` };
}
