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

export function hitungPantau(input: {
  sesi: readonly SesiPantau[];
  checkpoints: readonly CheckpointPantau[];
  agenda: ReadonlyMap<number, AgendaPantau>;
  peserta: readonly PesertaPantau[];
  scans: readonly CatatanPantau[];
  pickups: readonly CatatanPantau[];
  /** Nama barang per id, untuk checkpoint barang. */
  barang: ReadonlyMap<number, string>;
  sekarang: Date;
}): BarisPantau[] {
  const aktif = new Set(input.peserta.map((orang) => orang.id));
  const sesiById = new Map(input.sesi.map((s) => [s.id, s]));
  const scan = ringkasCatatan(input.scans.filter((isi) => aktif.has(isi.participant_id)));
  const ambil = ringkasCatatan(input.pickups.filter((isi) => aktif.has(isi.participant_id)));
  const batas = new Date(input.sekarang.getTime() - LIMA_BELAS_MENIT).toISOString();

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

  const waktu = (ids: readonly number[]) => {
    const baris = ids.map((id) => input.agenda.get(id)).filter((isi): isi is AgendaPantau => Boolean(isi && isi.tanggal));
    baris.sort((a, b) => `${a.tanggal} ${a.jam ?? ""}`.localeCompare(`${b.tanggal} ${b.jam ?? ""}`));
    return baris[0] ? { tanggal: baris[0].tanggal, jam: baris[0].jam } : { tanggal: null, jam: null };
  };

  const susun = (dasar: Pick<BarisPantau, "key" | "jenis" | "nama" | "tempat" | "aktif">, ids: readonly number[], ringkas: ReturnType<typeof ringkasCatatan>, kunci: number): BarisPantau => {
    const harap = diharapkan(ids);
    const orang = ringkas.pertama.get(kunci) ?? new Map<string, string>();
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
      diharapkan: harap ? harap.size : aktif.size,
      sudah,
      lainnya,
      terakhir: ringkas.terakhir.get(kunci) ?? null,
      baru_15: baru,
    };
  };

  const baris: BarisPantau[] = [];
  const dipakai = new Set<number>();
  for (const cp of input.checkpoints) {
    if (cp.session_id !== null) {
      const sesi = sesiById.get(cp.session_id);
      if (!sesi) continue;
      dipakai.add(sesi.id);
      baris.push(susun({ key: `cp-${cp.id}`, jenis: "sesi", nama: cp.title, tempat: cp.place, aktif: sesi.is_active }, cp.agenda_item_ids, scan, sesi.id));
    } else if (cp.item_id !== null) {
      baris.push(susun({ key: `cp-${cp.id}`, jenis: "barang", nama: cp.title, tempat: cp.place ?? input.barang.get(cp.item_id) ?? null, aktif: true }, cp.agenda_item_ids, ambil, cp.item_id));
    }
  }
  for (const sesi of input.sesi) {
    if (dipakai.has(sesi.id)) continue;
    baris.push(susun({ key: `sesi-${sesi.id}`, jenis: "sesi", nama: sesi.name, tempat: null, aktif: sesi.is_active }, [], scan, sesi.id));
  }

  // Urut jam Agenda; yang tanpa tautan di belakang, dengan urutan aslinya.
  return baris
    .map((isi, urutan) => ({ isi, urutan }))
    .sort((a, b) => {
      const ka = a.isi.tanggal ? `${a.isi.tanggal} ${a.isi.jam ?? ""}` : "￿";
      const kb = b.isi.tanggal ? `${b.isi.tanggal} ${b.isi.jam ?? ""}` : "￿";
      return ka === kb ? a.urutan - b.urutan : ka.localeCompare(kb);
    })
    .map(({ isi }) => isi);
}
