import { LABEL_MODA, type ArahKereta, type ModaTiket } from "../types.ts";
import { ALIAS, BATAS_BARIS, bacaJudul, buatPencocok, kosong, kunci, rapi, type BarisRencana, type KeadaanAcara, type Rencana, type TiketImpor } from "./dasar.ts";

/* ----------------------------------------------------------------- Kereta */

const ARAH: Record<string, ArahKereta> = {
  outbound: "outbound", berangkat: "outbound", pergi: "outbound", go: "outbound", departure: "outbound",
  return: "return", pulang: "return", kembali: "return", back: "return",
};

export const LABEL_ARAH: Record<ArahKereta, string> = { outbound: "Outbound", return: "Return" };

/** Isi kolom Mode (Inggris atau Indonesia) ke moda tiket. */
const MODA: Record<string, ModaTiket> = {
  train: "train", kereta: "train", "kereta api": "train", ka: "train", rail: "train",
  flight: "flight", pesawat: "flight", "pesawat terbang": "flight", plane: "flight", air: "flight", penerbangan: "flight",
  ship: "ship", kapal: "ship", "kapal laut": "ship", ferry: "ship", boat: "ship", feri: "ship",
};
const SEGMEN_MAKS = 6;

/**
 * Tanggal tiket ke YYYY-MM-DD. Menerima hasil sel tanggal Excel (2026-11-06)
 * dan tulisan Indonesia/Inggris hari dulu (06/11/2026, 6-11-26, 6.11.2026).
 * Kosong = null; tidak dikenal = undefined.
 */
export function bacaTanggal(teks: string): string | null | undefined {
  const t = rapi(teks);
  if (!t) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])];
  else return undefined;
  const tanggal = new Date(Date.UTC(y, m - 1, d));
  if (tanggal.getUTCFullYear() !== y || tanggal.getUTCMonth() !== m - 1 || tanggal.getUTCDate() !== d || y < 2000 || y > 2100) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Jam tiket ke HH:MM (8:20, 08.20, 08:20:00). Kosong = null; tidak dikenal = undefined. */
export function bacaJam(teks: string): string | null | undefined {
  const t = rapi(teks);
  if (!t) return null;
  const cocok = /^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?$/.exec(t);
  if (!cocok) return undefined;
  const [jam, menit] = [Number(cocok[1]), Number(cocok[2])];
  if (jam > 23 || menit > 59) return undefined;
  return `${String(jam).padStart(2, "0")}:${cocok[2]}`;
}

const BIDANG_KERETA = ["mode", "train_name", "travel_class", "origin", "destination", "depart_date", "depart_time", "arrive_time", "carriage", "seat", "booking_code"] as const;

/** Batas panjang kolom tiket kereta, sama dengan check di tabel train_tickets. */
const BATAS_KERETA: [keyof typeof ALIAS, string, number][] = [
  ["kereta", "Train / flight", 80],
  ["kelas", "Class", 40],
  ["dari", "From", 80],
  ["ke", "To", 80],
  ["gerbong", "Carriage", 20],
  ["kursi", "Seat", 20],
  ["booking", "Booking code", 40],
];

/**
 * Impor tiket (kereta, pesawat, kapal): satu baris = satu orang satu arah
 * (Outbound atau Return) satu segmen (kosong = 1; transit = 2 dan seterusnya).
 * Tiket yang sudah ada untuk orang, arah, dan segmen yang sama diperbarui.
 * Mode kosong = moda tiket lama, atau kereta untuk tiket baru.
 * Kolom yang tidak ada di berkas tidak menyentuh nilai lama; kolom yang ada
 * tetapi selnya kosong mengosongkannya, karena itulah isi berkas terbaru.
 */
export function rencanaKereta(sel: string[][], acara: KeadaanAcara): Rencana {
  const judul = bacaJudul(sel);
  if (!judul || judul.kolom.kereta === undefined || judul.kolom.arah === undefined || (judul.kolom.nama === undefined && judul.kolom.kode === undefined)) {
    return kosong("kereta", "Train / flight, Direction and Name (or QR code) columns not found in the header row. Download the template for an example.");
  }
  const { kolom, mulai } = judul;
  const isi = sel.slice(mulai);
  if (isi.length > BATAS_BARIS) return kosong("kereta", `You can import at most ${BATAS_BARIS.toLocaleString("en-GB")} rows at a time.`);

  const orangById = new Map(acara.peserta.map((orang) => [orang.id, orang]));
  const lama = new Map(acara.kereta.map((t) => [`${t.participant_id}\u0000${t.direction}\u0000${t.segment}`, t]));
  const cocokkan = buatPencocok(acara.peserta);
  const baris: BarisRencana[] = [];
  const tiket: TiketImpor[] = [];
  let dilewati = 0;
  const sudah = new Map<string, number>();
  const ambil = (sel1: string[], nama: keyof typeof ALIAS) => (kolom[nama] !== undefined ? rapi(sel1[kolom[nama]!]) : undefined);

  isi.forEach((sel1, i) => {
    const nomorBaris = mulai + i + 1;
    const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
    const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
    const kereta = ambil(sel1, "kereta") ?? "";
    const arahTeks = kunci(sel1[kolom.arah!]);
    if (!kode && !nama && !kereta && !arahTeks) return;
    const segmenTeks = ambil(sel1, "segmen") ?? "";
    const modaTeks = kunci(ambil(sel1, "moda") ?? "");
    const tujuanSementara = [arahTeks ? LABEL_ARAH[ARAH[arahTeks]] ?? arahTeks : "", kereta].filter(Boolean).join(" · ");
    const tolak = (alasan: string) => { baris.push({ baris: nomorBaris, nama, kode: kode || null, tujuan: tujuanSementara, status: "tolak", alasan, participant_id: null }); };
    if (!kode && !nama) return tolak("Name and QR code are empty");
    // Hanya orang dan arahnya, kolom tiket kosong semua: baris Download
    // participant list yang belum diisi. Dilewati, tiket tersimpan tetap.
    if (BATAS_KERETA.every(([nama]) => !ambil(sel1, nama)) && (["tanggal", "berangkat", "tiba"] as const).every((nama) => !ambil(sel1, nama))) {
      dilewati += 1;
      return;
    }
    const arah = ARAH[arahTeks];
    if (!arah) return tolak("Direction must be Outbound or Return (Berangkat or Pulang)");
    if (!kereta) return tolak("Train / flight is empty");
    const segmen = segmenTeks ? Number(segmenTeks) : 1;
    if (!Number.isInteger(segmen) || segmen < 1 || segmen > SEGMEN_MAKS) return tolak(`Segment must be a number from 1 to ${SEGMEN_MAKS}`);
    const moda = modaTeks ? MODA[modaTeks] : undefined;
    if (modaTeks && !moda) return tolak("Mode must be Train, Flight or Ship (Kereta, Pesawat or Kapal)");
    // Ditolak, bukan dipotong diam-diam: kode booking atau kursi yang terpotong menyesatkan peserta.
    const terlalu = BATAS_KERETA.find(([nama, , maks]) => (ambil(sel1, nama)?.length ?? 0) > maks);
    if (terlalu) return tolak(`${terlalu[1]} is longer than ${terlalu[2]} characters`);
    const tanggal = kolom.tanggal !== undefined ? bacaTanggal(sel1[kolom.tanggal]) : null;
    if (tanggal === undefined) return tolak("Date not recognised. Use DD/MM/YYYY, such as 06/11/2026");
    const berangkat = kolom.berangkat !== undefined ? bacaJam(sel1[kolom.berangkat]) : null;
    const tiba = kolom.tiba !== undefined ? bacaJam(sel1[kolom.tiba]) : null;
    if (berangkat === undefined || tiba === undefined) return tolak("Time not recognised. Use HH:MM, such as 08:20");
    const hasil = cocokkan(kode, nama);
    if ("alasan" in hasil) return tolak(hasil.alasan);
    const kunciTiket = `${hasil.id}\u0000${arah}\u0000${segmen}`;
    const pertama = sudah.get(kunciTiket);
    if (pertama !== undefined) return tolak(`Same person, direction and segment already on row ${pertama}. A transit needs Segment 2`);
    sudah.set(kunciTiket, nomorBaris);

    const ada = lama.get(kunciTiket) ?? null;
    const dariBerkas = {
      // Mode kosong atau kolomnya tidak ada: moda tiket lama; tiket baru = kereta.
      mode: moda ?? (ada ? undefined : "train"),
      train_name: kereta,
      travel_class: ambil(sel1, "kelas"),
      origin: ambil(sel1, "dari"),
      destination: ambil(sel1, "ke"),
      depart_date: kolom.tanggal !== undefined ? tanggal : undefined,
      depart_time: kolom.berangkat !== undefined ? berangkat : undefined,
      arrive_time: kolom.tiba !== undefined ? tiba : undefined,
      carriage: ambil(sel1, "gerbong"),
      seat: ambil(sel1, "kursi"),
      booking_code: ambil(sel1, "booking"),
    };
    const baru: TiketImpor = { participant_id: hasil.id, direction: arah, segment: segmen, ...Object.fromEntries(BIDANG_KERETA.map((bidang) => {
      const nilai = dariBerkas[bidang];
      // undefined = kolomnya tidak ada di berkas: nilai lama dipertahankan.
      return [bidang, nilai === undefined ? ada?.[bidang] ?? null : nilai || null];
    })) } as TiketImpor;
    // Gerbong hanya untuk kereta, sama dengan form Edit (QA #405 L1).
    if (baru.mode !== "train") baru.carriage = null;
    const sama = ada !== null && BIDANG_KERETA.every((bidang) => (ada[bidang] ?? null) === baru[bidang]);
    const kursi = [baru.carriage, baru.seat].filter(Boolean).join(" / ");
    baris.push({
      baris: nomorBaris,
      nama: orangById.get(hasil.id)!.name,
      kode: kode || null,
      tujuan: [segmen > 1 ? `${LABEL_ARAH[arah]} ${segmen}` : LABEL_ARAH[arah], baru.mode === "train" ? "" : LABEL_MODA[baru.mode], baru.train_name, kursi].filter(Boolean).join(" · "),
      status: sama ? "tetap" : ada ? "pindah" : "masuk",
      alasan: sama ? "Already saved" : ada ? "Updates the saved ticket" : segmen > 1 ? "New transit segment" : null,
      participant_id: hasil.id,
    });
    if (!sama) tiket.push(baru);
  });

  baris.sort((a, b) => a.baris - b.baris);
  return { jenis: "kereta", galat: null, baris, hotelBaru: [], kamarBaru: [], busBaru: [], penempatan: [], lepas: [], akhir: [], tiket, dilewati, busTrip: [] };
}
