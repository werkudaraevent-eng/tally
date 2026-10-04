/**
 * Rencana impor Logistik dari Excel: rooming list hotel dan daftar bus.
 *
 * Fungsi di sini murni: menerima sel berkas dan keadaan acara saat ini, lalu
 * mengembalikan apa yang AKAN terjadi per baris. Route memakai rencana yang
 * sama dua kali: sekali untuk pratinjau, sekali lagi (dari berkas yang sama)
 * saat panitia menekan Simpan. Karena itu tidak ada yang tersimpan diam-diam:
 * yang ditulis persis yang tadi dilihat, kecuali keadaan acara berubah di
 * antaranya, dan database tetap memeriksa ulang kapasitas serta jenis kelamin.
 *
 * Tidak mengimpor apa pun supaya bisa diuji langsung dengan Node
 * (`impor.check.ts`).
 */

export type JenisImpor = "kamar" | "bus";

export type StatusBaris = "masuk" | "pindah" | "tetap" | "tolak";

export type BarisRencana = {
  /** Nomor baris di Excel, dihitung dari 1 termasuk baris judul. */
  baris: number;
  nama: string;
  kode: string | null;
  /** "1208" atau "1208 · Mulia" untuk kamar, "Bus 3" untuk bus. */
  tujuan: string;
  status: StatusBaris;
  alasan: string | null;
  participant_id: string | null;
};

export type KamarBaru = { hotel: string; nomor: string; tipe: string | null; kapasitas: number };

export type Rencana = {
  jenis: JenisImpor;
  /** Masalah yang menolak seluruh berkas, mis. kolom wajib tidak ada. */
  galat: string | null;
  baris: BarisRencana[];
  hotelBaru: string[];
  kamarBaru: KamarBaru[];
  busBaru: string[];
  /**
   * Yang akan ditulis, dikelompokkan per tujuan. Kunci kamar memakai nama
   * hotel dan nomor, bukan id, karena kamar baru belum punya id.
   */
  penempatan: Array<{ hotel: string | null; tujuan: string; participant_ids: string[] }>;
};

export type KeadaanAcara = {
  peserta: Array<{ id: string; name: string; qr_code: string; gender: string | null }>;
  hotels: Array<{ id: number; name: string }>;
  rooms: Array<{ id: number; hotel_id: number; room_number: string; capacity: number }>;
  lodging: Array<{ participant_id: string; room_id: number }>;
  settings: { gender_field_key: string | null; enforce_same_gender: boolean };
  vehicles: Array<{ id: number; code: string; capacity: number | null }>;
  /** Bus bawaan saja (trip_id null, vehicle_id terisi). */
  busBawaan: Array<{ participant_id: string; vehicle_id: number }>;
};

export const BATAS_BARIS = 3000;

const ALIAS = {
  hotel: ["hotel", "nama hotel", "hotel name"],
  kamar: ["kamar", "nomor kamar", "no kamar", "no. kamar", "room", "room number", "room no", "room no."],
  tipe: ["tipe", "tipe kamar", "jenis kamar", "type", "room type"],
  kapasitas: ["kapasitas", "capacity", "jumlah tempat", "pax"],
  kode: ["kode qr", "qr", "qr code", "kode", "kode peserta", "participant code", "code"],
  nama: ["nama", "nama peserta", "nama tamu", "name", "guest", "guest name", "peserta", "tamu", "participant", "participant name", "full name"],
  bus: ["bus", "nama bus", "kendaraan", "armada", "bus name", "vehicle"],
} as const;

export const TEMPLAT: Record<JenisImpor, { judul: string[]; contoh: string[][] }> = {
  kamar: {
    judul: ["Hotel", "Kamar", "Tipe", "Kapasitas", "Kode QR", "Nama"],
    contoh: [
      ["Hotel Contoh", "1208", "Twin", "2", "", "Budi Santoso"],
      ["Hotel Contoh", "1208", "Twin", "2", "", "Andi Pratama"],
      ["Hotel Contoh", "1209", "Triple", "3", "", "Siti Rahayu"],
    ],
  },
  bus: {
    judul: ["Kode QR", "Nama", "Bus"],
    contoh: [
      ["", "Budi Santoso", "Bus 1"],
      ["", "Siti Rahayu", "Bus 2"],
    ],
  },
};

const rapi = (nilai: string | undefined) => (nilai ?? "").replace(/\s+/g, " ").trim();
const kunci = (nilai: string | null | undefined) => rapi(nilai ?? "").toLowerCase();

type Kolom = Partial<Record<keyof typeof ALIAS, number>>;

function bacaJudul(sel: string[][]): { kolom: Kolom; mulai: number } | null {
  // Judul boleh tidak di baris pertama: rooming list dari hotel sering diawali
  // nama acara atau tanggal. Lima baris pertama diperiksa.
  for (let i = 0; i < Math.min(5, sel.length); i += 1) {
    const judul = sel[i].map((isi) => kunci(isi));
    const kolom: Kolom = {};
    for (const [nama, alias] of Object.entries(ALIAS) as Array<[keyof typeof ALIAS, readonly string[]]>) {
      const indeks = judul.findIndex((isi) => alias.includes(isi));
      if (indeks >= 0) kolom[nama] = indeks;
    }
    if (kolom.kamar !== undefined || kolom.bus !== undefined || kolom.nama !== undefined) return { kolom, mulai: i + 1 };
  }
  return null;
}

type Pencocok = (kode: string, nama: string) => { id: string } | { alasan: string };

function buatPencocok(peserta: KeadaanAcara["peserta"]): Pencocok {
  const perKode = new Map(peserta.map((orang) => [kunci(orang.qr_code), orang]));
  const perNama = new Map<string, KeadaanAcara["peserta"]>();
  for (const orang of peserta) perNama.set(kunci(orang.name), [...(perNama.get(kunci(orang.name)) ?? []), orang]);
  return (kode, nama) => {
    // Kode QR didahulukan: nama bisa kembar dan sering ditulis berbeda oleh
    // hotel ("Budi S." dan "Budi Santoso"), kode tidak.
    if (kode) {
      const orang = perKode.get(kunci(kode));
      return orang ? { id: orang.id } : { alasan: "Kode QR tidak ditemukan" };
    }
    const cocok = perNama.get(kunci(nama)) ?? [];
    if (cocok.length === 1) return { id: cocok[0].id };
    if (cocok.length > 1) return { alasan: `Ada ${cocok.length} peserta bernama ini; isi kolom Kode QR` };
    return { alasan: "Nama tidak ditemukan di Daftar peserta" };
  };
}

function kosong(jenis: JenisImpor, galat: string): Rencana {
  return { jenis, galat, baris: [], hotelBaru: [], kamarBaru: [], busBaru: [], penempatan: [] };
}

/* ------------------------------------------------------------------ Kamar */

export function rencanaKamar(sel: string[][], acara: KeadaanAcara): Rencana {
  const judul = bacaJudul(sel);
  if (!judul || judul.kolom.kamar === undefined) {
    return kosong("kamar", "Kolom Kamar tidak ditemukan. Baris judul harus memuat Kamar, lalu Nama atau Kode QR. Unduh templat untuk contohnya.");
  }
  const { kolom, mulai } = judul;
  const isi = sel.slice(mulai);
  if (isi.length > BATAS_BARIS) return kosong("kamar", `Paling banyak ${BATAS_BARIS} baris sekali impor.`);

  const { gender_field_key: fieldGender, enforce_same_gender: wajibSama } = acara.settings;
  if (wajibSama && !fieldGender) {
    return kosong("kamar", "Aturan kamar belum lengkap. Pilih field jenis kelamin di tab Kamar, atau izinkan kamar campuran, lalu impor lagi.");
  }

  // Tanpa kolom Hotel, berkas hanya jelas bila acaranya punya tepat satu hotel.
  let hotelTetap: string | null = null;
  if (kolom.hotel === undefined) {
    if (acara.hotels.length === 1) hotelTetap = acara.hotels[0].name;
    else return kosong("kamar", acara.hotels.length === 0
      ? "Tambahkan kolom Hotel. Acara ini belum punya hotel, jadi namanya harus ada di berkas."
      : "Acara ini punya lebih dari satu hotel. Tambahkan kolom Hotel supaya tiap kamar jelas miliknya.");
  }

  const hotelPerNama = new Map(acara.hotels.map((hotel) => [kunci(hotel.name), hotel]));
  const kamarPerKunci = new Map(acara.rooms.map((kamar) => [`${kamar.hotel_id}\u0000${kunci(kamar.room_number)}`, kamar]));
  const kamarById = new Map(acara.rooms.map((kamar) => [kamar.id, kamar]));
  const hotelById = new Map(acara.hotels.map((hotel) => [hotel.id, hotel]));
  const orangById = new Map(acara.peserta.map((orang) => [orang.id, orang]));
  const kamarSekarang = new Map(acara.lodging.filter((b) => orangById.has(b.participant_id)).map((b) => [b.participant_id, b.room_id]));
  const cocokkan = buatPencocok(acara.peserta);

  type Kelompok = { hotel: string; nomor: string; tipe: string | null; kapasitas: number | null; ada: { id: number; capacity: number } | null; orang: BarisRencana[] };
  const kelompok = new Map<string, Kelompok>();
  const baris: BarisRencana[] = [];
  const sudah = new Map<string, number>();
  const banyakHotel = kolom.hotel !== undefined && new Set(isi.map((b) => kunci(b[kolom.hotel!])).filter(Boolean)).size > 1;

  isi.forEach((sel1, i) => {
    const nomorBaris = mulai + i + 1;
    const hotel = hotelTetap ?? rapi(sel1[kolom.hotel!]);
    const nomor = rapi(sel1[kolom.kamar!]).slice(0, 40);
    const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
    const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
    if (!hotel && !nomor && !kode && !nama) return;
    const adaOrang = Boolean(kode || nama);
    const tujuan = nomor ? (banyakHotel ? `${nomor} · ${hotel}` : nomor) : "";
    const tolak = (alasan: string) => { if (adaOrang) baris.push({ baris: nomorBaris, nama, kode: kode || null, tujuan, status: "tolak", alasan, participant_id: null }); };
    if (!nomor) return tolak("Nomor kamar kosong");
    if (!hotel) return tolak("Nama hotel kosong");

    const hotelAda = hotelPerNama.get(kunci(hotel));
    const kunciKamar = `${kunci(hotel)}\u0000${kunci(nomor)}`;
    let grup = kelompok.get(kunciKamar);
    if (!grup) {
      const ada = hotelAda ? kamarPerKunci.get(`${hotelAda.id}\u0000${kunci(nomor)}`) ?? null : null;
      const kapasitasTeks = kolom.kapasitas !== undefined ? rapi(sel1[kolom.kapasitas]) : "";
      const kapasitas = /^\d+$/.test(kapasitasTeks) && Number(kapasitasTeks) >= 1 && Number(kapasitasTeks) <= 20 ? Number(kapasitasTeks) : null;
      const tipe = kolom.tipe !== undefined ? rapi(sel1[kolom.tipe]).slice(0, 60) || null : null;
      grup = { hotel: hotelAda?.name ?? hotel, nomor: ada?.room_number ?? nomor, tipe, kapasitas, ada, orang: [] };
      kelompok.set(kunciKamar, grup);
    }
    if (!adaOrang) return;

    const hasil = cocokkan(kode, nama);
    if ("alasan" in hasil) return tolak(hasil.alasan);
    const pertama = sudah.get(hasil.id);
    if (pertama !== undefined) return tolak(`Orang yang sama sudah ada di baris ${pertama}`);
    sudah.set(hasil.id, nomorBaris);

    const orang = orangById.get(hasil.id)!;
    const lama = kamarSekarang.get(hasil.id);
    const kamarLama = lama !== undefined ? kamarById.get(lama) : undefined;
    const tetap = grup.ada !== null && lama === grup.ada.id;
    const baru: BarisRencana = {
      baris: nomorBaris,
      nama: orang.name,
      kode: kode || null,
      tujuan,
      status: tetap ? "tetap" : kamarLama ? "pindah" : "masuk",
      alasan: tetap ? "Sudah di kamar ini" : kamarLama ? `Pindah dari ${kamarLama.room_number}${banyakHotel ? ` · ${hotelById.get(kamarLama.hotel_id)?.name ?? ""}` : ""}` : null,
      participant_id: hasil.id,
    };
    baris.push(baru);
    grup.orang.push(baru);
  });

  // Isi akhir tiap kamar yang SUDAH ada: penghuni yang tidak disebut di berkas
  // tetap tinggal, kecuali berkas memindahkannya ke kamar lain.
  const pindahKeLain = new Set(baris.filter((b) => b.participant_id && b.status !== "tolak").map((b) => b.participant_id!));
  const penghuniTinggal = new Map<number, string[]>();
  for (const [pid, roomId] of kamarSekarang) {
    if (pindahKeLain.has(pid)) continue;
    penghuniTinggal.set(roomId, [...(penghuniTinggal.get(roomId) ?? []), pid]);
  }
  const genderDari = (pid: string) => kunci(orangById.get(pid)?.gender);

  const hotelBaru = new Set<string>();
  const kamarBaru: KamarBaru[] = [];
  const penempatan: Rencana["penempatan"] = [];
  for (const grup of kelompok.values()) {
    const tinggal = grup.ada ? penghuniTinggal.get(grup.ada.id) ?? [] : [];
    const tetap = grup.orang.filter((b) => b.status === "tetap");
    const datang = grup.orang.filter((b) => b.status !== "tetap");
    // Kamar baru tanpa kolom Kapasitas mendapat kapasitas sebanyak orang yang
    // disebut di berkas, paling sedikit 2 (kamar twin, yang paling umum).
    const kapasitas = grup.ada ? grup.ada.capacity : grup.kapasitas ?? Math.max(2, grup.orang.length);
    let terisi = tinggal.length + tetap.length;

    // Jenis kelamin kamar ditentukan penghuni yang tinggal, lalu orang pertama
    // di berkas untuk kamar ini.
    let genderKamar = wajibSama ? [...tinggal, ...tetap.map((b) => b.participant_id!)].map(genderDari).find(Boolean) ?? null : null;
    const masuk: string[] = [];
    for (const b of datang) {
      if (wajibSama) {
        const g = genderDari(b.participant_id!);
        if (!g) { b.status = "tolak"; b.alasan = "Jenis kelamin belum diisi di Daftar peserta"; continue; }
        if (genderKamar && g !== genderKamar) { b.status = "tolak"; b.alasan = "Jenis kelamin berbeda dengan penghuni kamar ini"; continue; }
        genderKamar ??= g;
      }
      if (terisi >= kapasitas) { b.status = "tolak"; b.alasan = `Kamar penuh (kapasitas ${kapasitas})`; continue; }
      terisi += 1;
      masuk.push(b.participant_id!);
    }

    if (!grup.ada) {
      if (!hotelPerNama.has(kunci(grup.hotel))) hotelBaru.add(grup.hotel);
      kamarBaru.push({ hotel: grup.hotel, nomor: grup.nomor, tipe: grup.tipe, kapasitas });
    }
    if (masuk.length > 0) penempatan.push({ hotel: grup.hotel, tujuan: grup.nomor, participant_ids: masuk });
  }

  baris.sort((a, b) => a.baris - b.baris);
  return { jenis: "kamar", galat: null, baris, hotelBaru: [...hotelBaru], kamarBaru, busBaru: [], penempatan };
}

/* -------------------------------------------------------------------- Bus */

export function rencanaBus(sel: string[][], acara: KeadaanAcara): Rencana {
  const judul = bacaJudul(sel);
  if (!judul || judul.kolom.bus === undefined || (judul.kolom.nama === undefined && judul.kolom.kode === undefined)) {
    return kosong("bus", "Kolom Bus dan Nama (atau Kode QR) tidak ditemukan di baris judul. Unduh templat untuk contohnya.");
  }
  const { kolom, mulai } = judul;
  const isi = sel.slice(mulai);
  if (isi.length > BATAS_BARIS) return kosong("bus", `Paling banyak ${BATAS_BARIS} baris sekali impor.`);

  const busPerKode = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus]));
  const orangById = new Map(acara.peserta.map((orang) => [orang.id, orang]));
  const busSekarang = new Map(acara.busBawaan.filter((b) => orangById.has(b.participant_id)).map((b) => [b.participant_id, b.vehicle_id]));
  const kodeBusById = new Map(acara.vehicles.map((bus) => [bus.id, bus.code]));
  const cocokkan = buatPencocok(acara.peserta);

  const baris: BarisRencana[] = [];
  const sudah = new Map<string, number>();
  const perBus = new Map<string, { kode: string; ada: KeadaanAcara["vehicles"][number] | null; orang: BarisRencana[] }>();

  isi.forEach((sel1, i) => {
    const nomorBaris = mulai + i + 1;
    const bus = rapi(sel1[kolom.bus!]).slice(0, 40);
    const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
    const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
    if (!bus && !kode && !nama) return;
    const tolak = (alasan: string) => { baris.push({ baris: nomorBaris, nama, kode: kode || null, tujuan: bus, status: "tolak", alasan, participant_id: null }); };
    if (!kode && !nama) return tolak("Nama dan Kode QR kosong");
    if (!bus) return tolak("Nama bus kosong");
    const hasil = cocokkan(kode, nama);
    if ("alasan" in hasil) return tolak(hasil.alasan);
    const pertama = sudah.get(hasil.id);
    if (pertama !== undefined) return tolak(`Orang yang sama sudah ada di baris ${pertama}`);
    sudah.set(hasil.id, nomorBaris);

    const ada = busPerKode.get(kunci(bus)) ?? null;
    const grup = perBus.get(kunci(bus)) ?? { kode: ada?.code ?? bus, ada, orang: [] };
    perBus.set(kunci(bus), grup);
    const lama = busSekarang.get(hasil.id);
    const tetap = ada !== null && lama === ada.id;
    const b: BarisRencana = {
      baris: nomorBaris,
      nama: orangById.get(hasil.id)!.name,
      kode: kode || null,
      tujuan: grup.kode,
      status: tetap ? "tetap" : lama !== undefined ? "pindah" : "masuk",
      alasan: tetap ? "Sudah di bus ini" : lama !== undefined ? `Pindah dari ${kodeBusById.get(lama) ?? "bus lain"}` : null,
      participant_id: hasil.id,
    };
    baris.push(b);
    grup.orang.push(b);
  });

  const pindah = new Set(baris.filter((b) => b.participant_id && b.status !== "tolak").map((b) => b.participant_id!));
  const busBaru: string[] = [];
  const penempatan: Rencana["penempatan"] = [];
  for (const grup of perBus.values()) {
    if (!grup.ada) busBaru.push(grup.kode);
    const kapasitas = grup.ada?.capacity ?? null;
    let terisi = grup.ada ? [...busSekarang].filter(([pid, vid]) => vid === grup.ada!.id && !pindah.has(pid)).length : 0;
    terisi += grup.orang.filter((b) => b.status === "tetap").length;
    const masuk: string[] = [];
    for (const b of grup.orang) {
      if (b.status === "tetap") continue;
      if (kapasitas !== null && terisi >= kapasitas) { b.status = "tolak"; b.alasan = `Bus penuh (kapasitas ${kapasitas})`; continue; }
      terisi += 1;
      masuk.push(b.participant_id!);
    }
    if (masuk.length > 0) penempatan.push({ hotel: null, tujuan: grup.kode, participant_ids: masuk });
  }

  baris.sort((a, b) => a.baris - b.baris);
  return { jenis: "bus", galat: null, baris, hotelBaru: [], kamarBaru: [], busBaru, penempatan };
}
