/**
 * Pilihan panitia untuk Event report, disimpan di `event_reports.config`.
 * Dibaca dengan aman: nilai yang rusak atau dari versi lama dibuang, bukan
 * menggagalkan halaman. Batas panjang di sini sama dengan editor.
 */

export const SLIDE_BAWAAN = [
  "sampul",
  "ringkas",
  "corong",
  "kelompok",
  "sesi",
  "portal",
  "kepuasan",
  "kedatangan",
  "pengumuman",
  "undian",
  "operasional",
  "usulan",
] as const;
export type KunciBawaan = (typeof SLIDE_BAWAAN)[number];

export const BATAS = { judul: 140, catatan: 200, poin: 5, teksPoin: 160, tambahan: 10, usulan: 5, teksUsulan: 120 } as const;

export type SlideTambahan =
  | { id: string; jenis: "pertanyaan"; sumber: "daftar" | "feedback"; kunci: string }
  | { id: string; jenis: "teks"; judul: string; poin: string[] };

export type BarisUsulan = { terjadi: string; data: string; usulan: string };

export type ConfigLaporan = {
  sembunyi: string[];
  /** Urutan kunci slide; kunci yang tidak disebut ikut urutan bawaan di belakang. */
  urutan: string[];
  judul: Record<string, string>;
  catatan: Record<string, string>;
  /** "company" atau "extra.<kunci pertanyaan pilihan>"; null = tanpa pengelompokan. */
  kelompok: string | null;
  tambahan: SlideTambahan[];
  usulan: BarisUsulan[];
};

export const CONFIG_KOSONG: ConfigLaporan = { sembunyi: [], urutan: [], judul: {}, catatan: {}, kelompok: null, tambahan: [], usulan: [] };

const KUNCI = /^[a-z0-9_.-]{1,80}$/;
const teks = (nilai: unknown, maks: number): string | null => {
  if (typeof nilai !== "string") return null;
  const bersih = nilai.replace(/\s+/g, " ").trim();
  return bersih ? bersih.slice(0, maks) : null;
};
const daftarKunci = (nilai: unknown): string[] =>
  Array.isArray(nilai) ? [...new Set(nilai.filter((isi): isi is string => typeof isi === "string" && KUNCI.test(isi)))].slice(0, 40) : [];
const peta = (nilai: unknown, maks: number): Record<string, string> => {
  if (!nilai || typeof nilai !== "object" || Array.isArray(nilai)) return {};
  const hasil: Record<string, string> = {};
  for (const [kunci, isi] of Object.entries(nilai).slice(0, 40)) {
    const bersih = teks(isi, maks);
    if (KUNCI.test(kunci) && bersih) hasil[kunci] = bersih;
  }
  return hasil;
};

function bacaTambahan(nilai: unknown): SlideTambahan[] {
  if (!Array.isArray(nilai)) return [];
  const hasil: SlideTambahan[] = [];
  const terpakai = new Set<string>();
  for (const isi of nilai) {
    if (!isi || typeof isi !== "object") continue;
    const baris = isi as Record<string, unknown>;
    const id = typeof baris.id === "string" && /^t-[a-z0-9]{1,24}$/.test(baris.id) ? baris.id : null;
    if (!id || terpakai.has(id)) continue;
    if (baris.jenis === "pertanyaan" && (baris.sumber === "daftar" || baris.sumber === "feedback") && typeof baris.kunci === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(baris.kunci)) {
      hasil.push({ id, jenis: "pertanyaan", sumber: baris.sumber, kunci: baris.kunci });
    } else if (baris.jenis === "teks") {
      const poin = Array.isArray(baris.poin) ? baris.poin.map((p) => teks(p, BATAS.teksPoin)).filter((p): p is string => p !== null).slice(0, BATAS.poin) : [];
      hasil.push({ id, jenis: "teks", judul: teks(baris.judul, BATAS.judul) ?? "", poin });
    } else continue;
    terpakai.add(id);
    if (hasil.length >= BATAS.tambahan) break;
  }
  return hasil;
}

function bacaUsulan(nilai: unknown): BarisUsulan[] {
  if (!Array.isArray(nilai)) return [];
  return nilai
    .map((isi) => {
      const baris = (isi && typeof isi === "object" ? isi : {}) as Record<string, unknown>;
      return { terjadi: teks(baris.terjadi, BATAS.teksUsulan) ?? "", data: teks(baris.data, BATAS.teksUsulan) ?? "", usulan: teks(baris.usulan, BATAS.teksUsulan) ?? "" };
    })
    .filter((baris) => baris.terjadi || baris.data || baris.usulan)
    .slice(0, BATAS.usulan);
}

export function bacaConfig(nilai: unknown): ConfigLaporan {
  if (!nilai || typeof nilai !== "object" || Array.isArray(nilai)) return { ...CONFIG_KOSONG };
  const isi = nilai as Record<string, unknown>;
  const kelompok = typeof isi.kelompok === "string" && /^(company|extra\.[A-Za-z0-9_-]{1,64})$/.test(isi.kelompok) ? isi.kelompok : null;
  return {
    sembunyi: daftarKunci(isi.sembunyi),
    urutan: daftarKunci(isi.urutan),
    judul: peta(isi.judul, BATAS.judul),
    catatan: peta(isi.catatan, BATAS.catatan),
    kelompok,
    tambahan: bacaTambahan(isi.tambahan),
    usulan: bacaUsulan(isi.usulan),
  };
}

/** Urutan akhir: yang disebut panitia dulu, sisanya bawaan lalu tambahan, tanpa kunci yang tidak ada. */
export function urutkan(config: Pick<ConfigLaporan, "urutan" | "tambahan">): string[] {
  const ada = [...SLIDE_BAWAAN, ...config.tambahan.map((t) => t.id)] as string[];
  const tersedia = new Set(ada);
  const depan = config.urutan.filter((kunci) => tersedia.has(kunci));
  const sudah = new Set(depan);
  // Sampul selalu pertama.
  return ["sampul", ...[...depan, ...ada.filter((kunci) => !sudah.has(kunci))].filter((kunci) => kunci !== "sampul")];
}

/** Geser satu slide naik (-1) atau turun (+1) dalam urutan akhir. Sampul tidak bergeser. */
export function geser(config: ConfigLaporan, kunci: string, arah: -1 | 1): ConfigLaporan {
  const urutan = urutkan(config);
  const i = urutan.indexOf(kunci);
  const j = i + arah;
  if (i <= 0 || j <= 0 || j >= urutan.length) return config;
  [urutan[i], urutan[j]] = [urutan[j], urutan[i]];
  return { ...config, urutan };
}
