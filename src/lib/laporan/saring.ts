/**
 * What's counted (Event report): siapa dan sumber apa yang tidak dihitung.
 * Fungsi murni, dipakai bahan-server.ts dan diuji di laporan.check.ts.
 */
import type { Kecuali, Sumber } from "./config.ts";
import { angka, pilih } from "./teks.ts";

/** Id peserta yang dikeluarkan: dipilih satu per satu, atau Type-nya dikeluarkan. */
export function pesertaKeluar(kecuali: Kecuali, tipe: ReadonlyMap<string, string>): Set<string> {
  const keluar = new Set(kecuali.peserta);
  if (kecuali.tipe.length) {
    const tipeKeluar = new Set(kecuali.tipe.map((t) => t.toLowerCase()));
    for (const [id, t] of tipe) if (tipeKeluar.has(t.trim().toLowerCase())) keluar.add(id);
  }
  return keluar;
}

/** Type peserta yang ada, urut terbanyak, dengan jumlah orang (peserta aktif saja). */
export function daftarTipe(tipe: ReadonlyMap<string, string>, aktif: ReadonlySet<string>): Array<{ nama: string; jumlah: number }> {
  const hitung = new Map<string, { nama: string; jumlah: number }>();
  for (const [id, t] of tipe) {
    const nama = t.trim();
    if (!nama || !aktif.has(id)) continue;
    const k = nama.toLowerCase();
    const isi = hitung.get(k) ?? { nama, jumlah: 0 };
    isi.jumlah += 1;
    hitung.set(k, isi);
  }
  return [...hitung.values()].sort((a, c) => c.jumlah - a.jumlah || a.nama.localeCompare(c.nama)).slice(0, 30);
}

const NAMA_SUMBER: Record<Sumber, { id: string; en: string }> = {
  daftar: { id: "pendaftaran online", en: "online registration" },
  feedback: { id: "jawaban Feedback", en: "Feedback answers" },
  portal: { id: "kunjungan area peserta", en: "participant area visits" },
  pengumuman: { id: "pengumuman", en: "announcements" },
  undian: { id: "undian dan voting", en: "lucky draw and voting" },
  logistik: { id: "logistik", en: "logistics" },
};

/**
 * Catatan kaki slide: "Tidak dihitung: 1 peserta, pendaftaran online dan
 * jawaban Feedback." Hanya sumber yang memang berisi data yang disebut.
 */
export function catatanSaring(bh: "id" | "en", jumlahPeserta: number, sumber: readonly Sumber[]): string | null {
  const bagian = [
    ...(jumlahPeserta > 0 ? [pilih(bh, { id: `${angka(jumlahPeserta, bh)} peserta`, en: `${angka(jumlahPeserta, bh)} participant${jumlahPeserta === 1 ? "" : "s"}` })] : []),
    ...sumber.map((k) => pilih(bh, NAMA_SUMBER[k])),
  ];
  if (!bagian.length) return null;
  const sambung = pilih(bh, { id: " dan ", en: " and " });
  const teks = bagian.length === 1 ? bagian[0] : `${bagian.slice(0, -1).join(", ")}${sambung}${bagian[bagian.length - 1]}`;
  return pilih(bh, { id: `Tidak dihitung: ${teks}.`, en: `Not counted: ${teks}.` });
}
