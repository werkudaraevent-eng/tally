/**
 * Check-in per checkpoint untuk Dashboard: berapa yang sudah dari berapa yang
 * seharusnya, per titik.
 *
 * Satu baris per checkpoint (sesi Check-in atau barang), lalu satu baris per
 * sesi Check-in yang tidak dipakai checkpoint mana pun. "Seharusnya" diturunkan
 * dari data yang sudah diisi panitia, tanpa daftar per acara: checkpoint yang
 * ditautkan ke baris Agenda (When) diharapkan dari peserta yang melihat baris
 * itu (Who sees it, aturan yang sama dengan portal); tanpa tautan, semua
 * peserta aktif. Pola Cvent OnArrival dan Eventbrite Organizer: hadir dibanding
 * total per sesi atau jenis tiket, dengan "jenis tiket" diganti Who sees it.
 *
 * "Sudah" menghitung ORANG: pemindaian berulang di sesi yang sama satu orang.
 * Yang dipindai di luar kelompok yang diharapkan (Batch 2 di titik kumpul
 * Batch 1) tidak menaikkan persentase, tetapi dihitung terpisah sebagai
 * `lainnya` supaya angkanya tidak hilang diam-diam.
 *
 * Murni, tanpa impor runtime selain sasaran-baris, supaya bisa diuji langsung
 * oleh Node (pantau-checkin.check.ts).
 */
import { barisUntukPeserta, type SyaratBaris } from "./sasaran-baris.ts";
import type { DataSasaranPeserta } from "./sasaran-blok.ts";

export type SesiPantau = { id: number; name: string; is_active: boolean; sort_order: number };
export type CheckpointPantau = { id: number; title: string; place: string | null; session_id: number | null; item_id: number | null; agenda_item_ids: number[] };
/** Baris Agenda yang ditautkan checkpoint: tanggal bagiannya, jam mulai, dan Who sees it. */
export type AgendaPantau = { id: number; tanggal: string | null; jam: string | null; syarat: SyaratBaris | null };
export type PesertaPantau = { id: string; data: DataSasaranPeserta };
export type CatatanPantau = { kunci: number; participant_id: string; at: string };

export type BarisPantau = {
  /** "cp-12" untuk checkpoint, "sesi-4" untuk sesi tanpa checkpoint. */
  key: string;
  jenis: "sesi" | "barang";
  nama: string;
  tempat: string | null;
  /** Hari dan jam baris Agenda paling awal yang ditautkan; null bila tanpa tautan. */
  tanggal: string | null;
  jam: string | null;
  /** Ada Who sees it yang mempersempit, atau semua peserta aktif. */
  menurut_agenda: boolean;
  diharapkan: number;
  sudah: number;
  /** Orang yang tercatat di titik ini tetapi tidak termasuk yang diharapkan. */
  lainnya: number;
  terakhir: string | null;
  /** Orang baru dalam 15 menit terakhir (pencatatan PERTAMA mereka di titik ini). */
  baru_15: number;
  /** Sesi ditutup di Check-in. Barang selalu terbuka. */
  aktif: boolean;
};

const LIMA_BELAS_MENIT = 15 * 60 * 1000;

/** Pencatatan pertama tiap orang per kunci (sesi atau barang), dan yang terakhir per kunci. */
function ringkasCatatan(catatan: readonly CatatanPantau[]) {
  const pertama = new Map<number, Map<string, string>>();
  const terakhir = new Map<number, string>();
  for (const isi of catatan) {
    let orang = pertama.get(isi.kunci);
    if (!orang) pertama.set(isi.kunci, (orang = new Map()));
    const lama = orang.get(isi.participant_id);
    if (!lama || isi.at < lama) orang.set(isi.participant_id, isi.at);
    const akhir = terakhir.get(isi.kunci);
    if (!akhir || isi.at > akhir) terakhir.set(isi.kunci, isi.at);
  }
  return { pertama, terakhir };
}

export type BahanPantau = {
  sesi: readonly SesiPantau[];
  checkpoints: readonly CheckpointPantau[];
  agenda: ReadonlyMap<number, AgendaPantau>;
  peserta: readonly PesertaPantau[];
  scans: readonly CatatanPantau[];
  pickups: readonly CatatanPantau[];
  /** Nama barang per id, untuk checkpoint barang. */
  barang: ReadonlyMap<number, string>;
  sekarang: Date;
  /** Offset zona acara ("+07:00"), untuk tanggal pencatatan di titik yang dipecah per hari. */
  offset?: string;
};

/**
 * Kunci titik tanpa akhiran hari: "cp-12-20261105" menjadi "cp-12". Pengaturan
 * (titik yang disembunyikan) memakai kunci dasar ini.
 */
export function kunciDasar(key: string): string {
  return /^((?:cp|sesi)-\d+)-\d{8}$/.exec(key)?.[1] ?? key;
}

/** Tanggal (zona acara) sebuah waktu ISO, mis. "2026-11-05". */
function tanggalPada(at: string, offset: string): string {
  const cocok = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  const menit = cocok ? (cocok[1] === "-" ? -1 : 1) * (Number(cocok[2]) * 60 + Number(cocok[3])) : 0;
  return new Date(Date.parse(at) + menit * 60_000).toISOString().slice(0, 10);
}

/** Satu titik sebelum diringkas: siapa yang diharapkan dan pencatatan pertama tiap orang. */
type TitikPantau = {
  dasar: Pick<BarisPantau, "key" | "jenis" | "nama" | "tempat" | "aktif">;
  ids: readonly number[];
  /** null = tanpa Who sees it: semua peserta aktif. */
  harap: Set<string> | null;
  orang: Map<string, string>;
  terakhir: string | null;
};

function titikPantau(input: BahanPantau): TitikPantau[] {
  const aktif = new Set(input.peserta.map((orang) => orang.id));
  const sesiById = new Map(input.sesi.map((s) => [s.id, s]));
  const scan = ringkasCatatan(input.scans.filter((isi) => aktif.has(isi.participant_id)));
  const ambil = ringkasCatatan(input.pickups.filter((isi) => aktif.has(isi.participant_id)));

  // Siapa yang diharapkan untuk satu set baris Agenda: yang melihat SALAH SATU
  // baris (KSO menautkan satu baris per Batch ke satu checkpoint).
  const cacheHarap = new Map<string, Set<string> | null>();
  const diharapkan = (ids: readonly number[]): Set<string> | null => {
    const baris = ids.map((id) => input.agenda.get(id)).filter((isi): isi is AgendaPantau => Boolean(isi));
    if (baris.length === 0 || baris.some((isi) => !isi.syarat)) return null;
    const kunci = baris.map((isi) => isi.id).sort((a, b) => a - b).join(",");
    if (cacheHarap.has(kunci)) return cacheHarap.get(kunci) ?? null;
    const hasil = new Set(input.peserta.filter((orang) => baris.some((isi) => barisUntukPeserta(isi.syarat, orang.data, isi.tanggal))).map((orang) => orang.id));
    cacheHarap.set(kunci, hasil);
    return hasil;
  };

  const titik = (dasar: TitikPantau["dasar"], ids: readonly number[], ringkas: ReturnType<typeof ringkasCatatan>, kunci: number): TitikPantau => ({
    dasar,
    ids,
    harap: diharapkan(ids),
    orang: ringkas.pertama.get(kunci) ?? new Map<string, string>(),
    terakhir: ringkas.terakhir.get(kunci) ?? null,
  });

  // Checkpoint yang ditautkan ke baris Agenda di beberapa hari (titik kumpul
  // Batch 0 tanggal 5, Batch 1-4 tanggal 6) dipecah satu titik per hari:
  // yang diharapkan dari baris hari itu, dan hanya pencatatan pada hari itu
  // (zona acara). Digabung, angkanya menjadi semua batch di hari pertama.
  const offset = input.offset ?? "+00:00";
  const perHari = (dasar: TitikPantau["dasar"], ids: readonly number[], catatan: readonly CatatanPantau[], semua: ReturnType<typeof ringkasCatatan>, kunci: number): TitikPantau[] => {
    const hari = new Map<string, number[]>();
    for (const id of ids) {
      const tanggal = input.agenda.get(id)?.tanggal;
      if (!tanggal) continue;
      hari.set(tanggal, [...(hari.get(tanggal) ?? []), id]);
    }
    if (hari.size < 2) return [titik(dasar, ids, semua, kunci)];
    return [...hari].map(([tanggal, idHari]) => {
      const ringkas = ringkasCatatan(catatan.filter((isi) => isi.kunci === kunci && aktif.has(isi.participant_id) && tanggalPada(isi.at, offset) === tanggal));
      return titik({ ...dasar, key: `${dasar.key}-${tanggal.replaceAll("-", "")}` }, idHari, ringkas, kunci);
    });
  };

  const hasil: TitikPantau[] = [];
  const dipakai = new Set<number>();
  for (const cp of input.checkpoints) {
    if (cp.session_id !== null) {
      const sesi = sesiById.get(cp.session_id);
      if (!sesi) continue;
      dipakai.add(sesi.id);
      hasil.push(...perHari({ key: `cp-${cp.id}`, jenis: "sesi", nama: cp.title, tempat: cp.place, aktif: sesi.is_active }, cp.agenda_item_ids, input.scans, scan, sesi.id));
    } else if (cp.item_id !== null) {
      hasil.push(...perHari({ key: `cp-${cp.id}`, jenis: "barang", nama: cp.title, tempat: cp.place ?? input.barang.get(cp.item_id) ?? null, aktif: true }, cp.agenda_item_ids, input.pickups, ambil, cp.item_id));
    }
  }
  for (const sesi of input.sesi) {
    if (dipakai.has(sesi.id)) continue;
    hasil.push(titik({ key: `sesi-${sesi.id}`, jenis: "sesi", nama: sesi.name, tempat: null, aktif: sesi.is_active }, [], scan, sesi.id));
  }
  return hasil;
}

export function hitungPantau(input: BahanPantau): BarisPantau[] {
  const jumlahAktif = input.peserta.length;
  const batas = new Date(input.sekarang.getTime() - LIMA_BELAS_MENIT).toISOString();

  const waktu = (ids: readonly number[]) => {
    const baris = ids.map((id) => input.agenda.get(id)).filter((isi): isi is AgendaPantau => Boolean(isi && isi.tanggal));
    baris.sort((a, b) => `${a.tanggal} ${a.jam ?? ""}`.localeCompare(`${b.tanggal} ${b.jam ?? ""}`));
    return baris[0] ? { tanggal: baris[0].tanggal, jam: baris[0].jam } : { tanggal: null, jam: null };
  };

  const susun = ({ dasar, ids, harap, orang, terakhir }: TitikPantau): BarisPantau => {
    let sudah = 0;
    let lainnya = 0;
    let baru = 0;
    for (const [id, at] of orang) {
      if (harap && !harap.has(id)) lainnya += 1;
      else sudah += 1;
      if (at >= batas) baru += 1;
    }
    return {
      ...dasar,
      ...waktu(ids),
      menurut_agenda: harap !== null,
      diharapkan: harap ? harap.size : jumlahAktif,
      sudah,
      lainnya,
      terakhir,
      baru_15: baru,
    };
  };

  const baris = titikPantau(input).map(susun);

  // Urut jam Agenda; yang tanpa tautan di belakang, dengan urutan aslinya.
  return baris
    .map((isi, urutan) => ({ isi, urutan }))
    .sort((a, b) => {
      const ka = a.isi.tanggal ? `${a.isi.tanggal} ${a.isi.jam ?? ""}` : "\uffff";
      const kb = b.isi.tanggal ? `${b.isi.tanggal} ${b.isi.jam ?? ""}` : "\uffff";
      return ka === kb ? a.urutan - b.urutan : ka.localeCompare(kb);
    })
    .map(({ isi }) => isi);
}

/**
 * Orang di satu titik, untuk halaman Kehadiran panitia di portal: yang sudah
 * (jam pencatatan pertama di titik itu) dan yang belum dari yang diharapkan.
 * "Sudah" memakai aturan yang sama dengan angka di atas: orang di luar yang
 * diharapkan masuk `lainnya`, tidak ikut "sudah". Null bila kuncinya tidak ada.
 */
export function rincianPantau(input: BahanPantau, key: string): { sudah: { id: string; at: string }[]; belum: string[]; lainnya: { id: string; at: string }[] } | null {
  const titik = titikPantau(input).find((isi) => isi.dasar.key === key);
  if (!titik) return null;
  const sudah: { id: string; at: string }[] = [];
  const lainnya: { id: string; at: string }[] = [];
  for (const [id, at] of titik.orang) (titik.harap && !titik.harap.has(id) ? lainnya : sudah).push({ id, at });
  const diharap = titik.harap ? [...titik.harap] : input.peserta.map((orang) => orang.id);
  const belum = diharap.filter((id) => !titik.orang.has(id));
  return { sudah, belum, lainnya };
}
