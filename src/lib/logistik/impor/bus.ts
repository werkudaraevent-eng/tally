import { jamZona, tanggalZona } from "../stay.ts";
import { BATAS_BARIS, bacaJudul, buatPencocok, kosong, kunci, rapi, type BarisRencana, type KeadaanAcara, type Rencana, type TripImpor } from "./dasar.ts";

/* -------------------------------------------------------------------- Bus */

const BULAN_TRIP = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Judul kolom satu trip: "Trip: Jeep Merapi (7 Nov 05:00)", jam di zona
 * acara. Tanpa jam berangkat: "Trip: Jeep Merapi". Judul inilah yang dicari
 * impor, jadi dua trip bernama sama tetap terbedakan oleh jamnya.
 */
export function judulTrip(trip: TripImpor, offset: string): string {
  if (!trip.depart_at) return `Trip: ${trip.name}`;
  const t = tanggalZona(trip.depart_at, offset);
  return `Trip: ${trip.name} (${Number(t.slice(8, 10))} ${BULAN_TRIP[Number(t.slice(5, 7)) - 1]} ${jamZona(trip.depart_at, offset)})`;
}

/** Trip urut jam berangkat (tanpa jam di belakang), lalu nama. */
export function urutTrip(trips: TripImpor[]): TripImpor[] {
  return [...trips].sort((a, b) => (a.depart_at ?? "\uffff").localeCompare(b.depart_at ?? "\uffff") || a.name.localeCompare(b.name) || a.id - b.id);
}

/** Isi sel trip yang berarti "tidak naik kendaraan di trip ini". */
const TANPA_KENDARAAN = new Set(["no vehicle", "none", "-", "tidak ada", "tanpa kendaraan", "tidak naik"]);
export const LABEL_TANPA_KENDARAAN = "No vehicle";
/** Isi sel trip yang berarti "hapus pengecualian, ikut kendaraan utama lagi". */
const IKUT_UTAMA = new Set(["default", "main vehicle", "kendaraan utama", "ikut utama"]);
export const LABEL_IKUT_UTAMA = "Default";
/**
 * Penanda `tujuan` di `Rencana.busTrip` untuk "kembali ke kendaraan utama"
 * (`reset_bus_override`). Diawali NUL supaya tidak pernah sama dengan kode kendaraan.
 */
export const IKUT = "\u0000default";

/**
 * Kolom "Trip: …" di judul, dipasangkan ke trip acara. Judul persis dulu;
 * bila tidak ada, nama saja asal hanya satu trip bernama itu (jam trip
 * berubah sesudah berkas diunduh). Kolom yang tidak cocok = galat berkas:
 * diabaikan diam-diam berarti pengecualian satu hari hilang tanpa terlihat.
 */
function kolomTrip(judul: string[], acara: KeadaanAcara): { kolom: Array<{ indeks: number; trip: TripImpor }> } | { galat: string } {
  const perJudul = new Map(acara.trips.map((trip) => [kunci(judulTrip(trip, acara.offset)), trip]));
  const hasil: Array<{ indeks: number; trip: TripImpor }> = [];
  for (const [indeks, isi] of judul.entries()) {
    const k = kunci(isi);
    if (!k.startsWith("trip:") || k.endsWith("(info)")) continue;
    let trip = perJudul.get(k);
    if (!trip) {
      const nama = k.slice(5).replace(/\s*\([^)]*\)\s*$/, "").trim();
      const sama = acara.trips.filter((t) => kunci(t.name) === nama);
      if (sama.length === 1) trip = sama[0];
    }
    if (!trip) return { galat: `Column "${rapi(isi)}" does not match a Trip in Logistics. Download the participant list again, or fix the column name.` };
    if (hasil.some((h) => h.trip.id === trip!.id)) return { galat: `Two columns are for the same Trip (${trip.name}). Keep one.` };
    hasil.push({ indeks, trip });
  }
  return { kolom: hasil };
}

export function rencanaBus(sel: string[][], acara: KeadaanAcara): Rencana {
  const judul = bacaJudul(sel);
  if (!judul || judul.kolom.bus === undefined || (judul.kolom.nama === undefined && judul.kolom.kode === undefined)) {
    return kosong("bus", "Vehicle and Name (or QR code) columns not found in the header row. Download the template for an example.");
  }
  const { kolom, mulai } = judul;
  const trips = kolomTrip(sel[mulai - 1], acara);
  if ("galat" in trips) return kosong("bus", trips.galat);
  const isi = sel.slice(mulai);
  if (isi.length > BATAS_BARIS) return kosong("bus", `You can import at most ${BATAS_BARIS.toLocaleString("en-GB")} rows at a time.`);

  const busPerKode = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus]));
  const orangById = new Map(acara.peserta.map((orang) => [orang.id, orang]));
  const kodeBusById = new Map(acara.vehicles.map((bus) => [bus.id, bus.code]));
  const busSekarang = new Map(acara.busBawaan.filter((b) => orangById.has(b.participant_id)).map((b) => [b.participant_id, b.vehicle_id]));
  const tripSekarang = new Map(acara.busTrip.filter((b) => orangById.has(b.participant_id)).map((b) => [`${b.trip_id}\u0000${b.participant_id}`, b.vehicle_id]));
  const cocokkan = buatPencocok(acara.peserta);
  // Kendaraan disebut dengan kunci kodenya; ejaan pertama di berkas dipakai untuk yang baru.
  const ejaan = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus.code]));
  const kunciBus = (kode: string) => { const k = kunci(kode); if (!ejaan.has(k)) ejaan.set(k, kode); return k; };

  const baris: BarisRencana[] = [];
  let dilewati = 0;
  const sudah = new Map<string, number>();
  const niat: Niat[] = [];

  isi.forEach((sel1, i) => {
    const nomorBaris = mulai + i + 1;
    const bus = rapi(sel1[kolom.bus!]).slice(0, 40);
    const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
    const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
    const isiTrip = trips.kolom.map(({ indeks, trip }) => ({ trip, isi: rapi(sel1[indeks]).slice(0, 40) })).filter((t) => t.isi);
    if (!bus && !kode && !nama && isiTrip.length === 0) return;
    const ringkasTrip = isiTrip.map((t) => `${t.trip.name}: ${TANPA_KENDARAAN.has(kunci(t.isi)) ? LABEL_TANPA_KENDARAAN : IKUT_UTAMA.has(kunci(t.isi)) ? LABEL_IKUT_UTAMA : t.isi}`);
    const tolak = (alasan: string) => { baris.push({ baris: nomorBaris, nama, kode: kode || null, tujuan: [bus, ...ringkasTrip].filter(Boolean).join(" · "), status: "tolak", alasan, participant_id: null }); };
    if (!kode && !nama) return tolak("Name and QR code are empty");
    // Orang tanpa kendaraan: baris Download participant list yang belum diisi.
    if (!bus && isiTrip.length === 0) { dilewati += 1; return; }
    const hasil = cocokkan(kode, nama);
    if ("alasan" in hasil) return tolak(hasil.alasan);
    const pertama = sudah.get(hasil.id);
    if (pertama !== undefined) return tolak(`Same person already on row ${pertama}`);
    sudah.set(hasil.id, nomorBaris);

    // Pengecualian per trip. Sel kosong = tidak berubah; "No vehicle" = tidak
    // naik di trip itu; "Default" = kembali ke kendaraan utama.
    const ubahTrip: Niat["trips"] = [];
    for (const { trip, isi } of isiTrip) {
      const lama = tripSekarang.get(`${trip.id}\u0000${hasil.id}`);
      if (IKUT_UTAMA.has(kunci(isi))) {
        if (lama !== undefined) ubahTrip.push({ trip_id: trip.id, ke: IKUT });
        continue;
      }
      const ke = TANPA_KENDARAAN.has(kunci(isi)) ? null : kunciBus(isi);
      const kunciLama = lama === undefined ? undefined : lama === null ? null : kunci(kodeBusById.get(lama) ?? "");
      if (kunciLama !== undefined && kunciLama === ke) continue;
      ubahTrip.push({ trip_id: trip.id, ke });
    }
    const tripBerubah = ubahTrip.length > 0;

    let ubahBus: string | undefined;
    let status: BarisRencana["status"] = tripBerubah ? "pindah" : "tetap";
    let alasan: string | null = tripBerubah ? "Trip vehicles change" : bus ? "Already on this vehicle" : "Already on these vehicles";
    if (bus) {
      const ke = kunciBus(bus);
      const lama = busSekarang.get(hasil.id);
      const kunciLama = lama === undefined ? undefined : kunci(kodeBusById.get(lama) ?? "");
      if (kunciLama !== ke) {
        ubahBus = ke;
        status = lama !== undefined ? "pindah" : "masuk";
        alasan = lama !== undefined ? `Moving from ${kodeBusById.get(lama) ?? "another vehicle"}` : null;
      }
    }
    const b: BarisRencana = {
      baris: nomorBaris,
      nama: orangById.get(hasil.id)!.name,
      kode: kode || null,
      tujuan: [bus ? ejaan.get(kunci(bus))! : "", ...ringkasTrip].filter(Boolean).join(" · "),
      status, alasan,
      participant_id: hasil.id,
    };
    baris.push(b);
    if (ubahBus !== undefined || tripBerubah) niat.push({ b, pid: hasil.id, bus: ubahBus, trips: ubahTrip });
  });

  // Kapasitas dinilai pada hasil akhir, persis seperti `assign_bus` menilainya
  // (`transport_effective`): kendaraan utama dihitung sendiri, lalu tiap trip
  // dengan pengecualian lebih dulu, kendaraan utama bila trip mengikutinya.
  // Selama ada kendaraan yang melebihi kapasitas, baris terakhir di berkas yang
  // menambah isinya ditolak (seluruh barisnya), lalu dihitung ulang.
  const kapasitas = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus.capacity]));
  const aktif = new Set(niat);
  for (;;) {
    const utama = new Map([...busSekarang].map(([pid, vid]) => [pid, kunci(kodeBusById.get(vid) ?? "")]));
    const pengecualian = new Map<string, string | null>();
    for (const [k, vid] of tripSekarang) pengecualian.set(k, vid === null ? null : kunci(kodeBusById.get(vid) ?? ""));
    for (const n of aktif) {
      if (n.bus !== undefined) utama.set(n.pid, n.bus);
      for (const t of n.trips) {
        const k = `${t.trip_id}\u0000${n.pid}`;
        if (t.ke === IKUT) pengecualian.delete(k); else pengecualian.set(k, t.ke);
      }
    }
    const lebih: Array<{ bus: string; trip: TripImpor | null }> = [];
    const isiUtama = new Map<string, number>();
    for (const k of utama.values()) isiUtama.set(k, (isiUtama.get(k) ?? 0) + 1);
    for (const [k, n] of isiUtama) { const c = kapasitas.get(k); if (c != null && n > c) lebih.push({ bus: k, trip: null }); }
    for (const trip of acara.trips) {
      const isiTrip = new Map<string, number>();
      for (const pid of orangById.keys()) {
        const kp = `${trip.id}\u0000${pid}`;
        const k = pengecualian.has(kp) ? pengecualian.get(kp) : trip.follows_default ? utama.get(pid) : undefined;
        if (k) isiTrip.set(k, (isiTrip.get(k) ?? 0) + 1);
      }
      for (const [k, n] of isiTrip) { const c = kapasitas.get(k); if (c != null && n > c) lebih.push({ bus: k, trip }); }
    }
    let korban: { n: Niat; bus: string; trip: TripImpor | null } | null = null;
    for (const n of aktif) {
      for (const l of lebih) {
        const tambah = l.trip === null
          ? n.bus === l.bus
          : n.trips.some((t) => t.trip_id === l.trip!.id && t.ke === l.bus)
            || (n.bus === l.bus && l.trip.follows_default && !pengecualian.has(`${l.trip.id}\u0000${n.pid}`));
        if (tambah && (!korban || n.b.baris > korban.n.b.baris)) korban = { n, bus: l.bus, trip: l.trip };
      }
    }
    if (!korban) break;
    aktif.delete(korban.n);
    korban.n.b.status = "tolak";
    const c = kapasitas.get(korban.bus);
    korban.n.b.alasan = korban.trip
      ? `${ejaan.get(korban.bus)} full on ${korban.trip.name} (capacity ${c})`
      : `Vehicle full (capacity ${c})`;
  }

  const penempatan: Rencana["penempatan"] = [];
  const perTrip = new Map<string, Rencana["busTrip"][number]>();
  const dipakai = new Set<string>();
  for (const n of niat) {
    if (!aktif.has(n)) continue;
    if (n.bus !== undefined) {
      dipakai.add(n.bus);
      const tujuan = ejaan.get(n.bus)!;
      const grup = penempatan.find((p) => p.tujuan === tujuan);
      if (grup) grup.participant_ids.push(n.pid);
      else penempatan.push({ hotel: null, tujuan, malam: null, participant_ids: [n.pid] });
    }
    for (const t of n.trips) {
      if (t.ke) dipakai.add(t.ke);
      const tujuan = t.ke === IKUT ? IKUT : t.ke === null ? null : ejaan.get(t.ke)!;
      const k = `${t.trip_id}\u0000${tujuan ?? ""}`;
      const grup = perTrip.get(k) ?? { trip_id: t.trip_id, tujuan, participant_ids: [] };
      perTrip.set(k, grup);
      grup.participant_ids.push(n.pid);
    }
  }
  const busBaru = [...dipakai].filter((k) => k !== IKUT && !busPerKode.has(k)).map((k) => ejaan.get(k)!);

  baris.sort((a, b) => a.baris - b.baris);
  return { jenis: "bus", galat: null, baris, hotelBaru: [], kamarBaru: [], busBaru, penempatan, lepas: [], akhir: [], tiket: [], dilewati, busTrip: [...perTrip.values()] };
}

/** Perubahan satu baris impor kendaraan, untuk menilai kapasitas di hasil akhir. */
type Niat = {
  b: BarisRencana;
  pid: string;
  /** Kunci kendaraan utama baru; undefined = tidak berubah. */
  bus: string | undefined;
  /** `ke`: kunci kendaraan, null = No vehicle, IKUT = kembali ke kendaraan utama. */
  trips: Array<{ trip_id: number; ke: string | null }>;
};
