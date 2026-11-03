import type { RegistrationField } from "./domain.ts";
import { jamZona, stayPadaTanggal, tanggalZona } from "./logistik/stay.ts";

/**
 * Info yang tampil di bawah nama pada lembar hasil pemindai petugas
 * (Check-in > Sessions > Shown after scan).
 *
 * Diatur PER SESI, bukan per acara: meja registrasi butuh hotel, meja naik bus
 * butuh nomor bus, meja titip bagasi butuh hotel untuk memilah truk. Cvent
 * OnArrival dan Eventbrite Organizer mengatur info check-in per daftar
 * check-in dengan alasan yang sama.
 *
 * Pilihannya tidak diketik dan tidak ditulis di kode: dibangun dari data acara
 * itu sendiri (kolom peserta, pertanyaan registrasi, Logistik), jadi pertanyaan
 * baru langsung bisa dipilih. Disimpan sebagai daftar kunci teks di
 * `attendance_sessions.scan_fields`:
 *
 *   base:company   base:title   base:participant_type
 *   extra:<kunci pertanyaan>
 *   logistik:hotel   logistik:vehicle   logistik:train
 *
 * Null = belum diatur: lembar tetap menampilkan "Company · Title" seperti
 * sebelum fitur ini ada, jadi acara lama berubah 0 px.
 *
 * Kunci berawalan `*` (`*extra:nomor_luggage`) = "Big": tampil sebagai kotak
 * besar di atas baris lain, untuk info yang harus dibaca atau ditulis petugas
 * (nomor bagasi, hotel untuk memilah truk). Paling banyak BATAS_BESAR per sesi;
 * tanpa `*` tampilannya sama seperti sebelum fitur ini ada.
 *
 * Email, telepon, dan unggahan berkas sengaja tidak bisa dipilih: layar
 * petugas terlihat antrean, dan UU PDP meminta data seminimal tujuannya.
 *
 * Murni, tanpa server, supaya diuji langsung (info-scan.check.ts).
 */

/** Batas info per sesi. Lebih dari ini menenggelamkan nama dan mendorong Scan next keluar layar 390 px. */
export const BATAS_INFO_SCAN = 4;
/** Batas info "Big" per sesi: kalau semua besar, tidak ada yang menonjol lagi. */
export const BATAS_BESAR = 2;

const TANDA_BESAR = "*";
/** Kunci tanpa tanda Big. */
export const kunciInti = (kunci: string) => (kunci.startsWith(TANDA_BESAR) ? kunci.slice(1) : kunci);
export const kunciBesar = (kunci: string) => kunci.startsWith(TANDA_BESAR);
/** Kunci tersimpan untuk satu info dengan atau tanpa tanda Big. */
export const kunciSimpan = (kunci: string, besar: boolean) => (besar ? TANDA_BESAR : "") + kunciInti(kunci);

export const INFO_BAWAAN = ["base:company", "base:title", "base:participant_type"] as const;
export const INFO_LOGISTIK = ["logistik:hotel", "logistik:vehicle", "logistik:train"] as const;

const LABEL_TETAP: Record<string, string> = {
  "base:company": "Company",
  "base:title": "Job title",
  "base:participant_type": "Participant type",
  "logistik:hotel": "Hotel",
  "logistik:vehicle": "Vehicle",
  "logistik:train": "Train",
};

/** Keterangan di admin: dari mana nilainya datang. */
const ASAL_TETAP: Record<string, string> = {
  "base:company": "Participant",
  "base:title": "Participant",
  "base:participant_type": "Participant",
  "logistik:hotel": "Logistics · hotel and room on the scan date",
  "logistik:vehicle": "Logistics · vehicle on the trip before this session's Agenda time, or on the scan date",
  "logistik:train": "Logistics · train ticket on the scan date",
};

const POLA_KUNCI = /^\*?(base|extra|logistik):[a-z0-9_]{1,64}$/;

/** Pertanyaan yang boleh tampil di layar petugas. */
export function pertanyaanBolehTampil(field: Pick<RegistrationField, "type">): boolean {
  return field.type !== "file" && field.type !== "email" && field.type !== "tel";
}

/** Daftar tersimpan dibaca aman: bukan array = belum diatur (null). */
export function bacaInfoScan(nilai: unknown): string[] | null {
  if (!Array.isArray(nilai)) return null;
  const hasil: string[] = [];
  let besar = 0;
  for (const isi of nilai) {
    if (typeof isi !== "string" || !POLA_KUNCI.test(isi) || hasil.some((k) => kunciInti(k) === kunciInti(isi))) continue;
    // Tanda Big ke-3 dan seterusnya diabaikan, infonya tetap tampil biasa.
    const jadiBesar = kunciBesar(isi) && besar < BATAS_BESAR;
    if (jadiBesar) besar += 1;
    hasil.push(kunciSimpan(isi, jadiBesar));
  }
  return hasil.slice(0, BATAS_INFO_SCAN);
}

export type PilihanInfo = { kunci: string; label: string; asal: string; grup: "Participant" | "Logistics" | "Registration questions"; khususPanitia?: boolean; besar?: boolean };

/**
 * Semua info yang bisa dipilih untuk acara ini. Grup Logistik hanya bila
 * acaranya punya data itu, supaya acara tanpa hotel tidak ditawari "Hotel".
 */
export function pilihanInfo(
  fields: Array<Pick<RegistrationField, "key" | "label" | "type" | "on_form" | "participant_update">>,
  logistik: { hotel: boolean; vehicle: boolean; train: boolean },
): PilihanInfo[] {
  const hasil: PilihanInfo[] = INFO_BAWAAN.map((kunci) => ({ kunci, label: LABEL_TETAP[kunci], asal: ASAL_TETAP[kunci], grup: "Participant" }));
  for (const kunci of INFO_LOGISTIK) {
    const jenis = kunci.slice("logistik:".length) as keyof typeof logistik;
    if (logistik[jenis]) hasil.push({ kunci, label: LABEL_TETAP[kunci], asal: ASAL_TETAP[kunci], grup: "Logistics" });
  }
  for (const field of fields) {
    if (!pertanyaanBolehTampil(field) || !/^[a-z0-9_]{1,64}$/.test(field.key)) continue;
    const khusus = field.on_form === false && field.participant_update !== true;
    hasil.push({ kunci: `extra:${field.key}`, label: field.label.trim() || field.key, asal: khusus ? "Registration question · staff only" : "Registration question", grup: "Registration questions", ...(khusus ? { khususPanitia: true } : {}) });
  }
  return hasil;
}

/**
 * Pilihan tersimpan yang masih ada di acara ini, urut seperti disimpan.
 * Pertanyaan yang dihapus dari form hilang sendiri, tanpa galat di layar petugas.
 */
export function infoBerlaku(tersimpan: readonly string[], pilihan: readonly PilihanInfo[]): PilihanInfo[] {
  const peta = new Map(pilihan.map((p) => [p.kunci, p]));
  return tersimpan.flatMap((kunci) => {
    const p = peta.get(kunciInti(kunci));
    return p ? [kunciBesar(kunci) ? { ...p, besar: true } : p] : [];
  });
}

/* ------------------------------------------------------- Nilai per peserta */

export type StayInfo = { hotel: { name: string }; room_number: string | null; check_in_at: string | null; check_out_at: string | null };
export type TripInfo = { name: string; depart_at: string | null; bus: string | null };
export type TiketInfo = { direction: string; train_name: string; depart_date: string | null; depart_time: string | null; carriage: string | null; seat: string | null };

export type DataPesertaInfo = {
  company: string | null;
  title: string | null;
  participant_type: string | null;
  extra: Record<string, unknown> | null;
  stays: StayInfo[];
  transport: { default_bus: string | null; trips: TripInfo[] } | null;
  trains: TiketInfo[];
};

/**
 * Satu baris di lembar hasil. `nilai` null = datanya belum ada ("Not set").
 * `besar` = kotak besar; `keterangan` = bagian kecil di bawah nilai kotak itu
 * (kamar di bawah nama hotel), supaya yang dibesarkan hanya yang dicari mata.
 */
export type BarisInfo = { label: string; nilai: string | null; besar?: boolean; keterangan?: string };

const teks = (nilai: unknown): string | null => {
  if (typeof nilai === "string") return nilai.trim() || null;
  if (typeof nilai === "number" && Number.isFinite(nilai)) return String(nilai);
  if (typeof nilai === "boolean") return nilai ? "Yes" : "No";
  if (Array.isArray(nilai)) return nilai.map(teks).filter(Boolean).join(", ") || null;
  return null;
};

const satuStay = (stay: StayInfo) => `${stay.hotel.name} · ${stay.room_number?.trim() ? `Room ${stay.room_number.trim()}` : "room to follow"}`;

/**
 * Hotel pada tanggal scan (zona acara). Hari pindah hotel berlaku untuk kedua
 * hotel ("GRAMM Hotel · Room 301 → The Ray · Room 1208"): meja bagasi di hotel
 * lama justru perlu tahu hotel baru. Tanpa stay hari itu: stay berikutnya,
 * lalu yang terakhir.
 */
export function hotelPadaTanggal(stays: StayInfo[], sekarang: Date, offset: string): string | null {
  if (stays.length === 0) return null;
  const tanggal = tanggalZona(sekarang.toISOString(), offset);
  const hariIni = stays.filter((stay) => stayPadaTanggal(stay.check_in_at, stay.check_out_at, tanggal, offset));
  if (hariIni.length > 0) return hariIni.map(satuStay).join(" → ");
  const nanti = stays.find((stay) => stay.check_in_at && tanggalZona(stay.check_in_at, offset) > tanggal);
  return satuStay(nanti ?? stays[stays.length - 1]);
}

/**
 * Kendaraan pada tanggal scan: trip hari itu yang paling dekat (yang belum
 * berangkat, atau yang terakhir berangkat), dengan nama tripnya. Tanpa trip
 * hari itu: kendaraan bawaan peserta, lalu trip berikutnya (seperti Hotel
 * yang melompat ke menginap berikutnya), supaya gladi sebelum hari-H tidak
 * selalu "Not set".
 */
export function kendaraanPadaTanggal(transport: DataPesertaInfo["transport"], sekarang: Date, offset: string): string | null {
  if (!transport) return null;
  const tanggal = tanggalZona(sekarang.toISOString(), offset);
  const naik = transport.trips
    .filter((trip) => trip.bus && trip.depart_at)
    .sort((a, b) => Date.parse(a.depart_at!) - Date.parse(b.depart_at!));
  const hariIni = naik.filter((trip) => tanggalZona(trip.depart_at!, offset) === tanggal);
  // Masih dihitung "trip ini" sampai 30 menit sesudah jam berangkat: bus sering terlambat.
  const batas = sekarang.getTime() - 30 * 60000;
  const trip = hariIni.find((t) => Date.parse(t.depart_at!) >= batas) ?? hariIni[hariIni.length - 1];
  if (trip) return `${trip.bus} · ${trip.name}`;
  const bawaan = transport.default_bus?.trim();
  if (bawaan) return bawaan;
  const nanti = naik.find((t) => tanggalZona(t.depart_at!, offset) > tanggal);
  return nanti ? `${nanti.bus} · ${nanti.name}` : null;
}

/**
 * Jam baris Agenda yang ditautkan ke checkpoint sesi ini (Check-in >
 * Checkpoints > When). `date` "YYYY-MM-DD" dari bagian Agenda, `start` jam
 * mulai seperti tersimpan ("09:00:00", "09:00" atau "09.00").
 */
export type AcuanAgenda = { date: string; start: string };

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const menitJam = (jam: string): number | null => {
  const cocok = /^(\d{1,2})[:.](\d{2})/.exec(jam.trim());
  return cocok ? Number(cocok[1]) * 60 + Number(cocok[2]) : null;
};

/**
 * Kendaraan untuk sesi yang tertaut ke Agenda: dari trip yang peserta ini
 * naiki, yang berangkat paling akhir sebelum (atau tepat pada) jam baris
 * Agenda itu di hari yang sama; tanpa itu, trip pertama sesudahnya di hari
 * itu. Contoh KSO: checkpoint Jeep tertaut ke baris 09:00, trip-nya tertaut
 * ke baris "Perjalanan ke ..." 08:00, jadi dicocokkan dengan jam, bukan
 * dengan id baris yang sama.
 *
 * Beberapa baris (satu per batch): dipilih yang paling dekat. Trip yang
 * dibaca hanya milik peserta ini, jadi batch-nya terpilih dengan sendirinya.
 * Null = tidak ada trip di hari baris itu; barisInfo lalu memakai kendaraan
 * bawaan, atau Not set.
 * Tidak bergantung pada hari scan, jadi gladi menampilkan hasil yang sama
 * dengan hari-H.
 */
export function kendaraanUntukAgenda(transport: DataPesertaInfo["transport"], acuan: readonly AcuanAgenda[], offset: string): string | null {
  if (!transport || acuan.length === 0) return null;
  let pilih: { trip: TripInfo; sebelum: boolean; jarak: number } | null = null;
  for (const baris of acuan) {
    const jamBaris = menitJam(baris.start);
    if (!POLA_TANGGAL.test(baris.date) || jamBaris === null) continue;
    for (const trip of transport.trips) {
      if (!trip.bus || !trip.depart_at || Number.isNaN(Date.parse(trip.depart_at))) continue;
      if (tanggalZona(trip.depart_at, offset) !== baris.date) continue;
      const jamTrip = menitJam(jamZona(trip.depart_at, offset))!;
      const sebelum = jamTrip <= jamBaris;
      const jarak = Math.abs(jamBaris - jamTrip);
      if (!pilih || (sebelum && !pilih.sebelum) || (sebelum === pilih.sebelum && jarak < pilih.jarak)) pilih = { trip, sebelum, jarak };
    }
  }
  return pilih ? `${pilih.trip.bus} · ${pilih.trip.name}` : null;
}

/** Tiket kereta pada tanggal scan, lalu yang berikutnya. "Taksaka · Car 3 · Seat 12A". */
export function keretaPadaTanggal(trains: TiketInfo[], sekarang: Date, offset: string): string | null {
  if (trains.length === 0) return null;
  const tanggal = tanggalZona(sekarang.toISOString(), offset);
  const tiket = trains.find((t) => t.depart_date === tanggal) ?? trains.find((t) => (t.depart_date ?? "") > tanggal) ?? null;
  if (!tiket) return null;
  return [tiket.train_name, tiket.carriage ? `Car ${tiket.carriage}` : null, tiket.seat ? `Seat ${tiket.seat}` : null].filter(Boolean).join(" · ");
}

/** Baris lembar hasil untuk satu peserta, urut seperti diatur panitia. */
export function barisInfo(info: readonly PilihanInfo[], data: DataPesertaInfo, sekarang: Date, offset: string, acuan: readonly AcuanAgenda[] = []): BarisInfo[] {
  return info.map((p) => {
    const [sumber, kunci] = [p.kunci.slice(0, p.kunci.indexOf(":")), p.kunci.slice(p.kunci.indexOf(":") + 1)];
    let nilai: string | null = null;
    if (sumber === "base") nilai = teks(data[kunci as "company" | "title" | "participant_type"]);
    else if (sumber === "extra") nilai = teks(data.extra?.[kunci]);
    else if (kunci === "hotel") nilai = hotelPadaTanggal(data.stays, sekarang, offset);
    else if (kunci === "vehicle") {
      // Sesi tertaut ke Agenda: tanpa trip di hari itu, peserta memang tidak
      // naik kendaraan pada jadwal ini; jangan lompat ke trip hari lain.
      nilai = acuan.length > 0
        ? kendaraanUntukAgenda(data.transport, acuan, offset) ?? (data.transport?.default_bus?.trim() || null)
        : kendaraanPadaTanggal(data.transport, sekarang, offset);
    }
    else if (kunci === "train") nilai = keretaPadaTanggal(data.trains, sekarang, offset);
    if (!p.besar) return { label: p.label, nilai };
    // Hotel di kotak besar: nama hotel besar, kamar kecil di bawahnya. Hari
    // pindah hotel: "GRAMM → The Ray" besar, "Room 301 → room to follow" kecil.
    if (kunci === "hotel" && sumber === "logistik" && nilai) {
      const bagian = nilai.split(" → ").map((stay) => {
        const pisah = stay.lastIndexOf(" · ");
        return pisah > 0 ? [stay.slice(0, pisah), stay.slice(pisah + 3)] : [stay, ""];
      });
      if (bagian.every(([, kamar]) => kamar)) {
        return { label: p.label, nilai: bagian.map(([hotel]) => hotel).join(" → "), besar: true, keterangan: bagian.map(([, kamar]) => kamar).join(" → ") };
      }
    }
    return { label: p.label, nilai, besar: true };
  });
}

/** Butuh data Logistik peserta? Pemindaian tanpa info logistik tidak memanggil RPC-nya. */
export function butuhLogistik(info: readonly PilihanInfo[]): boolean {
  return info.some((p) => p.kunci.startsWith("logistik:"));
}
