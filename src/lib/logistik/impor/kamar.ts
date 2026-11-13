import { judulKamar, namaKamar } from "../nama-kamar.ts";
import { puncakHuni, stayPerPeserta, tanggalStay, tanggalZona } from "../stay.ts";
import { ALIAS, BATAS_BARIS, BULAN_PENDEK, bacaJudul, buatPencocok, judulStay, kosong, kunci, rapi, rentangTanggal, type BarisRencana, type KamarBaru, type KamarUbah, type KeadaanAcara, type Kolom, type Malam, type RefKamar, type Rencana, type StayAkhir } from "./dasar.ts";
import { bacaTanggal } from "./kereta.ts";

/* ------------------------------------------------------------------ Kamar */

const JUDUL_PANJANG = ["Hotel", "Room", "Type", "Capacity", "Check-in", "Check-out", "Label", "Bed", "QR code", "Name"];
const ISIAN_SLOT = ["hotel", "kamar", "tipe", "kapasitas", "masuk", "keluar", "label", "kasur"] as const;

/**
 * Berkas lebar (satu baris per orang: Hotel 1, Room 1, Check-in 1, ...,
 * Hotel 2, ...) diubah ke bentuk panjang (satu baris per hotel) yang dibaca
 * `rencanaKamar`, dengan nomor baris Excel aslinya. Null bila judulnya tidak
 * bernomor: berkas itu sudah bentuk panjang.
 */
function lebarKePanjang(sel: string[][]): { sel: string[][]; nomorAsli: number[] } | null {
  for (let i = 0; i < Math.min(5, sel.length); i += 1) {
    const slot = new Map<number, Partial<Record<(typeof ISIAN_SLOT)[number], number>>>();
    const biasa: Kolom = {};
    sel[i].forEach((isi, indeks) => {
      const teks = kunci(isi);
      const bernomor = /^(.*?)\s*(\d{1,2})$/.exec(teks);
      const dasar = bernomor ? bernomor[1].trim() : teks;
      for (const nama of ISIAN_SLOT) {
        if (!(ALIAS[nama] as readonly string[]).includes(dasar)) continue;
        if (bernomor) slot.set(Number(bernomor[2]), { ...slot.get(Number(bernomor[2])), [nama]: indeks });
        return;
      }
      if ((ALIAS.kode as readonly string[]).includes(teks)) biasa.kode = indeks;
      else if ((ALIAS.nama as readonly string[]).includes(teks)) biasa.nama = indeks;
    });
    if (![...slot.values()].some((k) => k.hotel !== undefined)) continue;
    const urut = [...slot.entries()].sort((a, b) => a[0] - b[0]).map(([, k]) => k);
    const ambil = (baris: string[], indeks: number | undefined) => (indeks === undefined ? "" : rapi(baris[indeks]));
    const hasil: string[][] = [JUDUL_PANJANG];
    const nomorAsli: number[] = [];
    sel.slice(i + 1).forEach((baris, j) => {
      const kode = ambil(baris, biasa.kode);
      const nama = ambil(baris, biasa.nama);
      for (const k of urut) {
        const isi = ISIAN_SLOT.map((nama1) => ambil(baris, k[nama1]));
        // Slot kosong dilewati: Hotel 2 hanya diisi untuk yang pindah hotel.
        if (isi.every((t) => !t)) continue;
        hasil.push([...isi, kode, nama]);
        nomorAsli.push(i + j + 2);
      }
    });
    return { sel: hasil, nomorAsli };
  }
  return null;
}

/** Nama isian impor kamar, untuk "Columns read" di pratinjau. Urutan = urutan tampil. */
const NAMA_ISIAN_KAMAR: Array<[keyof typeof ALIAS, string]> = [
  ["hotel", "Hotel"], ["label", "Room label"], ["kamar", "Room number"], ["kasur", "Bed"], ["tipe", "Room type"],
  ["kapasitas", "Capacity"], ["masuk", "Check-in"], ["keluar", "Check-out"], ["kode", "QR code"], ["nama", "Name"],
];

/** Kolom berkas yang dibaca impor kamar, seperti ditulis di berkasnya. */
function kolomKamarDibaca(judul: string[], kolom: Kolom): Array<{ judul: string; jadi: string }> {
  return NAMA_ISIAN_KAMAR.filter(([nama]) => kolom[nama] !== undefined).map(([nama, jadi]) => ({ judul: rapi(judul[kolom[nama]!]), jadi }));
}

/** "To follow" (ekspor Daftar peserta), "room later", "-": belum ada nomor kamar. */
const KAMAR_MENYUSUL = new Set(["to follow", "room to follow", "room later", "later", "menyusul", "-", "–", "—"]);

/**
 * Satu label untuk kelompok orang berbeda di malam yang tidak bersambung
 * (GH20: dua orang 5–6 Nov, dua orang lain 6–8 Nov). Rooming list panitia
 * memakai label untuk satu pasangan, jadi ini hampir selalu kode yang dipakai
 * ulang. Tanpa dipisah, nomor kamar yang diisi untuk satu periode ikut sampai
 * ke kelompok lainnya.
 */
export type LabelDipecah = {
  hotel: string;
  label: string;
  /**
   * Per periode, urut tanggal. `label`: label yang dipakai bila dipisah.
   * `tetap`: periode yang memakai kamar berlabel itu (dan nomornya bila sudah
   * ada); periode lain mendapat kamar baru. `nomor`: nomor kamar periode itu
   * setelah impor (dari berkas, atau nomor kamar lama untuk yang tetap).
   */
  periode: Array<{ label: string; malam: Malam | null; nama: string[]; tetap: boolean; nomor: string | null }>;
};

export type OpsiKamar = {
  /** "Same room": label yang dipakai ulang tetap satu kamar (perilaku lama). */
  labelSatuKamar?: boolean;
  /**
   * "Use the numbers in this file": nomor yang dipegang kamar berlabel lain
   * pindah ke label di berkas; kamar lain itu menjadi nomor menyusul (kecuali
   * berkas memberinya nomor sendiri). Tanpa ini barisnya ditolak.
   */
  nomorIkutBerkas?: boolean;
};

/** Nomor kamar di berkas yang sekarang dipegang kamar berlabel lain. */
export type NomorBentrok = { hotel: string; nomor: string; labelBerkas: string; labelSekarang: string };

/**
 * Periode tiap label di berkas: baris dengan label sama di hotel sama,
 * dikumpulkan per malam yang bertabrakan. Label dipecah bila periodenya diisi
 * orang yang berbeda; kelompok yang sama kembali di periode lain (A,B 5–6 Nov
 * lalu A,B 7–8 Nov) tetap satu kamar. Tidak dipecah bila setiap periode diberi
 * nomor kamar yang sama (hotel memang memberi satu kamar fisik, atau "Download
 * current stays" menulis nomor kamar lama di setiap baris).
 * Yang memakai label aslinya: periode yang barisnya memberi nomor kamar lama,
 * lalu periode yang paling banyak berisi penghuni kamar itu sekarang (impor
 * ulang tidak memindahkan siapa pun), lalu periode pertama. Periode lain
 * mendapat label "GH20 · 6 Nov".
 * Baris tanpa malam yang diketahui (tanpa tanggal, hotel tanpa tanggal)
 * bertabrakan dengan semuanya, jadi labelnya tidak dipecah.
 */
export function pecahLabel(
  baris: Array<{ i: number; hotel: string; label: string; orang: string; nama: string; malam: Malam | null; nomor?: string }>,
  kamarLabel: (hotel: string, label: string) => { penghuni: Set<string>; nomor: string | null },
): { labelBaris: Map<number, string>; dipecah: LabelDipecah[] } {
  const perLabel = new Map<string, typeof baris>();
  for (const b of baris) {
    if (!b.label) continue;
    const k = `${kunci(b.hotel)}\u0000${kunci(b.label)}`;
    perLabel.set(k, [...(perLabel.get(k) ?? []), b]);
  }
  const labelBaris = new Map<number, string>();
  const dipecah: LabelDipecah[] = [];
  for (const isi of perLabel.values()) {
    if (isi.length < 2 || isi.some((b) => !b.malam)) continue;
    const urut = [...isi].sort((a, b) => a.malam!.masuk.localeCompare(b.malam!.masuk));
    const periode: Array<{ masuk: string; keluar: string; baris: typeof baris }> = [];
    for (const b of urut) {
      const akhir = periode.at(-1);
      if (akhir && b.malam!.masuk < akhir.keluar) {
        akhir.baris.push(b);
        if (b.malam!.keluar > akhir.keluar) akhir.keluar = b.malam!.keluar;
      } else periode.push({ masuk: b.malam!.masuk, keluar: b.malam!.keluar, baris: [b] });
    }
    if (periode.length < 2) continue;
    const kunciOrang = (p: (typeof periode)[number]) => [...new Set(p.baris.map((b) => b.orang))].sort().join("\u0000");
    if (new Set(periode.map(kunciOrang)).size < 2) continue;
    const nomorBerkas = new Set(isi.map((b) => kunci(b.nomor ?? "")).filter(Boolean));
    if (nomorBerkas.size === 1 && periode.every((p) => p.baris.some((b) => kunci(b.nomor ?? "")))) continue;
    const { hotel, label } = isi[0];
    const lama = kamarLabel(hotel, label);
    const nomorLama = lama.nomor ? kunci(lama.nomor) : null;
    const memberiNomorLama = periode.findIndex((p) => nomorLama !== null && p.baris.some((b) => kunci(b.nomor ?? "") === nomorLama));
    const skor = periode.map((p) => p.baris.filter((b) => lama.penghuni.has(b.orang)).length);
    const tetap = memberiNomorLama >= 0 ? memberiNomorLama : Math.max(...skor) > 0 ? skor.indexOf(Math.max(...skor)) : 0;
    // Kelompok yang sama di dua periode memakai label yang sama.
    const labelPerOrang = new Map<string, string>();
    const hasil: LabelDipecah["periode"] = [];
    periode.forEach((p, j) => {
      const k = kunciOrang(p);
      const akhiran = ` · ${hariBulan(p.masuk)}`;
      // Label panjang dipotong di depan akhiran, supaya tanggalnya tetap ada.
      const baru = j === tetap ? label : labelPerOrang.get(k) ?? `${label.slice(0, 40 - akhiran.length).trimEnd()}${akhiran}`;
      if (!labelPerOrang.has(k) || j === tetap) labelPerOrang.set(k, baru);
      for (const b of p.baris) labelBaris.set(b.i, baru);
      const nomor = p.baris.map((b) => b.nomor?.trim() ?? "").find(Boolean) ?? null;
      hasil.push({
        label: baru, malam: { masuk: p.masuk, keluar: p.keluar }, nama: [...new Set(p.baris.map((b) => b.nama))],
        tetap: baru === label, nomor: nomor ?? (baru === label ? lama.nomor : null),
      });
    });
    dipecah.push({ hotel, label, periode: hasil });
  }
  return { labelBaris, dipecah };
}

const hariBulan = (tanggal: string) => `${Number(tanggal.slice(8, 10))} ${BULAN_PENDEK[Number(tanggal.slice(5, 7)) - 1]}`;

export function rencanaKamar(selBerkas: string[][], acara: KeadaanAcara, opsi: OpsiKamar = {}): Rencana {
  const lebar = lebarKePanjang(selBerkas);
  const sel = lebar?.sel ?? selBerkas;
  const judul = bacaJudul(sel);
  // Room boleh tidak ada atau kosong: baris tanpa nomor kamar menempatkan
  // orangnya di hotel saja, dan rooming list yang datang belakangan mengisi
  // kamarnya. Tanpa Room dan tanpa Hotel, berkas tidak menyebut tempat apa pun.
  if (!judul || (judul.kolom.kamar === undefined && judul.kolom.hotel === undefined && judul.kolom.label === undefined)) {
    return kosong("kamar", "Hotel or Room column not found. The header row must include Hotel and/or Room, then Name or QR code. Download the template for an example.");
  }
  const { kolom, mulai } = judul;
  const isi = sel.slice(mulai);
  if (isi.length > BATAS_BARIS) return kosong("kamar", `You can import at most ${BATAS_BARIS.toLocaleString("en-GB")} rows at a time.`);

  const { gender_field_key: fieldGender, enforce_same_gender: wajibSama } = acara.settings;
  // Aturan kamar hanya menolak berkas yang memang menyebut nomor kamar.
  const nomorKamar = (b: string[]) => {
    const t = kolom.kamar !== undefined ? rapi(b[kolom.kamar]).slice(0, 40) : "";
    return KAMAR_MENYUSUL.has(kunci(t)) ? "" : t;
  };
  const labelKamar = (b: string[]) => (kolom.label !== undefined ? rapi(b[kolom.label]).slice(0, 40) : "");
  // Rooming list hotel biasanya huruf besar semua ("DELUXE", "TWIN"); peserta
  // membacanya sebagai "Deluxe · Twin". Singkatan pendek (VIP) dibiarkan.
  const hurufWajar = (teks: string) => (teks.length > 3 && /\p{L}/u.test(teks) && teks === teks.toLocaleUpperCase("id")
    ? teks.toLocaleLowerCase("id").replace(/(^|[\s/-])(\p{L})/gu, (_, awal: string, huruf: string) => awal + huruf.toLocaleUpperCase("id"))
    : teks);
  const isian = (b: string[], nama: "tipe" | "kasur", maks: number) => (kolom[nama] !== undefined ? hurufWajar(rapi(b[kolom[nama]!]).slice(0, maks)) || null : null);
  const adaNomorKamar = isi.some((b) => nomorKamar(b) || labelKamar(b));
  if (wajibSama && !fieldGender && adaNomorKamar) {
    return kosong("kamar", "Room rules are incomplete. Choose a gender field on the Rooms tab, or allow mixed rooms, then import again. Rows without a room number or room label can still be imported on their own.");
  }

  // Tanpa kolom Hotel, berkas hanya jelas bila acaranya punya tepat satu hotel.
  let hotelTetap: string | null = null;
  if (kolom.hotel === undefined) {
    if (acara.hotels.length === 1) hotelTetap = acara.hotels[0].name;
    else return kosong("kamar", acara.hotels.length === 0
      ? "Add a Hotel column. This event has no hotels yet, so the file must name them."
      : "This event has more than one hotel. Add a Hotel column so each room's hotel is clear.");
  }

  const offset = acara.offset;
  const hotelPerNama = new Map(acara.hotels.map((hotel) => [kunci(hotel.name), hotel]));
  const kamarPerKunci = new Map(acara.rooms.filter((kamar) => kamar.room_number !== null).map((kamar) => [`${kamar.hotel_id}\u0000${kunci(kamar.room_number)}`, kamar]));
  const kamarPerLabel = new Map(acara.rooms.filter((kamar) => kamar.label).map((kamar) => [`${kamar.hotel_id}\u0000${kunci(kamar.label)}`, kamar]));
  const kamarById = new Map(acara.rooms.map((kamar) => [kamar.id, kamar]));
  const hotelById = new Map(acara.hotels.map((hotel) => [hotel.id, hotel]));
  const orangById = new Map(acara.peserta.map((orang) => [orang.id, orang]));
  // Stay sekarang per orang, dengan malam efektifnya (stay, lalu hotel) sebagai tanggal.
  type StayLama = { hotel_id: number; room_id: number | null; malam: Malam | null; check_in_at: string | null; check_out_at: string | null };
  const staySekarang = new Map<string, StayLama[]>();
  for (const b of acara.lodging) {
    if (!orangById.has(b.participant_id)) continue;
    const hotel = hotelById.get(b.hotel_id);
    const masuk = b.check_in_at ?? hotel?.check_in_at ?? null;
    const keluar = b.check_out_at ?? hotel?.check_out_at ?? null;
    const malam = masuk && keluar ? { masuk: tanggalZona(masuk, offset), keluar: tanggalZona(keluar, offset) } : null;
    staySekarang.set(b.participant_id, [...(staySekarang.get(b.participant_id) ?? []), { hotel_id: b.hotel_id, room_id: b.room_id, malam, check_in_at: b.check_in_at ?? null, check_out_at: b.check_out_at ?? null }]);
  }
  const cocokkan = buatPencocok(acara.peserta);
  const namaHotel = (id: number) => hotelById.get(id)?.name ?? "another hotel";
  // Malam hotel sebagai tanggal, untuk baris tanpa tanggal (ikut hotel).
  const malamHotel = (hotel: { check_in_at?: string | null; check_out_at?: string | null } | undefined): Malam | null =>
    hotel?.check_in_at && hotel.check_out_at ? { masuk: tanggalZona(hotel.check_in_at, offset), keluar: tanggalZona(hotel.check_out_at, offset) } : null;
  const tabrakMalam = (a: Malam | null, b: Malam | null) => !a || !b || (a.masuk < b.keluar && b.masuk < a.keluar);

  /**
   * Satu kamar di berkas, dikenali lewat labelnya bila kolom Label ada dan
   * terisi, selain itu lewat nomornya. `nomor`: nomor dari berkas (null =
   * menyusul); `galat`: kamar ini tidak bisa dipakai, semua barisnya ditolak.
   */
  type Kelompok = {
    kunci: string; hotel: string; label: string | null; nomor: string | null; baris: number; tipe: string | null; kasur: string | null; kapasitas: number | null;
    ada: KeadaanAcara["rooms"][number] | null; galat: string | null; orang: BarisRencana[];
    /**
     * Kamar label lama yang labelnya diserahkan ke kamar bernomor tanpa label
     * (dibuat dialog Stays): diberi akhiran " (old)" dulu, dihapus bila kosong.
     */
    lepasLabel?: KeadaanAcara["rooms"][number];
    /** Kamar berlabel lain yang melepas nomornya ke kelompok ini (`nomorIkutBerkas`). */
    ambilDari?: KeadaanAcara["rooms"][number];
    /** Satu kamar fisik dengan kelompok lain (label lain, nomor sama, malam lain): orangnya masuk kamar itu. */
    gabungKe?: Kelompok;
    /** Kelompok yang masuk kamar ini, dan malam baris-barisnya: malam yang bertabrakan ditolak. */
    tamu?: Kelompok[];
    malamBaris?: Malam[];
  };
  // Nomor kamar yang sudah diklaim sebuah label di berkas ini: hotel + nomor > kelompok.
  const nomorDiklaim = new Map<string, Kelompok>();
  const nomorBentrok: NomorBentrok[] = [];
  const kelompok = new Map<string, Kelompok>();
  // Hotel saja: nama hotel (seperti di berkas, atau nama yang sudah ada) > baris.
  const hotelSaja = new Map<string, { hotel: string; orang: BarisRencana[] }>();
  // Malam per baris yang diterima; null = tanpa tanggal (ikut hotel).
  const malamBaris = new Map<BarisRencana, Malam | null>();
  // Baris yang diterima per orang: hotel, kamar, malam, dan stay tersimpan
  // yang dipadankan dengannya (hotel sama, malam bertabrakan).
  type BarisOrang = { baris: BarisRencana; hotelKunci: string; hotelId: number | null; hotel: string; grup: Kelompok | null; malam: Malam | null; kamar: boolean; diSini: StayLama | undefined };
  const barisOrang = new Map<string, BarisOrang[]>();
  // Orang yang salah satu barisnya ditolak sesudah dikenali.
  const orangDitolak = new Set<string>();
  const baris: BarisRencana[] = [];
  const banyakHotel = kolom.hotel !== undefined && new Set(isi.map((b) => kunci(b[kolom.hotel!])).filter(Boolean)).size > 1;

  // Label yang dipakai ulang untuk orang berbeda di malam lain dipecah dulu,
  // sebelum baris dikelompokkan per kamar (lihat `pecahLabel`).
  const pecahan = kolom.label === undefined ? null : pecahLabel(
    isi.flatMap((sel1, i) => {
      const hotel = hotelTetap ?? rapi(sel1[kolom.hotel!]);
      const label = labelKamar(sel1);
      const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
      const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
      if (!hotel || !label || (!kode && !nama)) return [];
      const masuk = bacaTanggal(kolom.masuk !== undefined ? rapi(sel1[kolom.masuk]) : "");
      const keluar = bacaTanggal(kolom.keluar !== undefined ? rapi(sel1[kolom.keluar]) : "");
      const malam = masuk && keluar ? { masuk, keluar } : masuk === null && keluar === null ? malamHotel(hotelPerNama.get(kunci(hotel))) : null;
      // Orang yang tidak dikenali ditolak di barisnya: tidak ikut membentuk periode,
      // supaya salah ketik nama tidak memecah label dan membuat kamar kosong.
      const cocok = cocokkan(kode, nama);
      if (!("id" in cocok)) return [];
      return [{ i, hotel, label, orang: cocok.id, nama: nama || kode, malam, nomor: nomorKamar(sel1) }];
    }),
    (hotel, label) => {
      const hotelAda = hotelPerNama.get(kunci(hotel));
      const kamar = hotelAda ? kamarPerLabel.get(`${hotelAda.id}\u0000${kunci(label)}`) : undefined;
      return {
        penghuni: new Set(kamar ? acara.lodging.filter((b) => b.room_id === kamar.id).map((b) => b.participant_id) : []),
        nomor: kamar?.room_number ?? null,
      };
    },
  );
  const labelDipecah = pecahan?.dipecah ?? [];

  const labelBaris = (sel1: string[], i: number) => (opsi.labelSatuKamar ? undefined : pecahan?.labelBaris.get(i)) ?? labelKamar(sel1);
  // Label yang di berkas tetap memakai nomornya sekarang dibaca lebih dulu:
  // pemegang nomor menang atas label lain yang menyebut nomor itu (salah ketik
  // atau malam lain), di baris mana pun ia berada.
  const pemegangTetap = new Set<string>();
  isi.forEach((sel1, i) => {
    const hotel = hotelTetap ?? rapi(sel1[kolom.hotel!]);
    const label = labelBaris(sel1, i);
    const nomor = nomorKamar(sel1);
    const hotelAda = hotel ? hotelPerNama.get(kunci(hotel)) : undefined;
    if (!hotelAda || !label || !nomor) return;
    const kamar = kamarPerLabel.get(`${hotelAda.id}\u0000${kunci(label)}`);
    if (kamar?.room_number && kunci(kamar.room_number) === kunci(nomor)) pemegangTetap.add(`${kunci(hotel)}\u0000L${kunci(label)}`);
  });
  const urutan = isi.map((sel1, i) => i);
  if (pemegangTetap.size > 0) {
    const dulu = (i: number) => {
      const hotel = hotelTetap ?? rapi(isi[i][kolom.hotel!]);
      const label = labelBaris(isi[i], i);
      return label && pemegangTetap.has(`${kunci(hotel)}\u0000L${kunci(label)}`) ? 0 : 1;
    };
    urutan.sort((a, b) => dulu(a) - dulu(b) || a - b);
  }

  urutan.forEach((i) => {
    const sel1 = isi[i];
    const nomorBaris = lebar ? lebar.nomorAsli[i] : mulai + i + 1;
    const hotel = hotelTetap ?? rapi(sel1[kolom.hotel!]);
    const nomor = nomorKamar(sel1);
    const label = labelBaris(sel1, i);
    // Baris berkamar: punya nomor, atau label panitia (nomornya menyusul).
    const adaKamar = Boolean(nomor || label);
    const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
    const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
    const teksMasuk = kolom.masuk !== undefined ? rapi(sel1[kolom.masuk]) : "";
    const teksKeluar = kolom.keluar !== undefined ? rapi(sel1[kolom.keluar]) : "";
    if (!hotel && !adaKamar && !kode && !nama) return;
    const adaOrang = Boolean(kode || nama);
    const masuk = bacaTanggal(teksMasuk);
    const keluar = bacaTanggal(teksKeluar);
    const malam = masuk && keluar ? { masuk, keluar } : null;
    const labelMalam = malam ? ` · ${rentangTanggal(malam)}` : "";
    const namaTujuan = label ? `${label} · ${nomor || "number to follow"}` : nomor;
    const tujuan = (adaKamar ? (banyakHotel ? `${namaTujuan} · ${hotel}` : namaTujuan) : hotel ? `${hotel} · room to follow` : "") + labelMalam;
    const tolak = (alasan: string) => { if (adaOrang) baris.push({ baris: nomorBaris, nama, kode: kode || null, tujuan, status: "tolak", alasan, participant_id: null }); };
    if (!hotel) return tolak(adaKamar ? "Hotel name is empty" : "Hotel and room are empty");
    if (masuk === undefined || keluar === undefined) return tolak(`${masuk === undefined ? "Check-in" : "Check-out"} date not recognised. Use DD/MM/YYYY`);
    if ((masuk === null) !== (keluar === null)) return tolak("Fill in both Check-in and Check-out, or leave both empty");
    if (malam && malam.keluar <= malam.masuk) return tolak("Check-out must be after check-in");

    const hotelAda = hotelPerNama.get(kunci(hotel));
    // Label didahulukan: rooming list panitia mengenal kamarnya lewat label
    // jauh sebelum hotel membagi nomor. Berkas yang sama diimpor ulang dengan
    // nomor terisi menemukan kamar yang sama, jadi tidak ada yang pindah.
    const kunciKamar = `${kunci(hotel)}\u0000${label ? `L${kunci(label)}` : `N${kunci(nomor)}`}`;
    let grup = adaKamar ? kelompok.get(kunciKamar) : undefined;
    if (adaKamar && !grup) {
      const perLabel = label && hotelAda ? kamarPerLabel.get(`${hotelAda.id}\u0000${kunci(label)}`) ?? null : null;
      const perNomor = nomor && hotelAda ? kamarPerKunci.get(`${hotelAda.id}\u0000${kunci(nomor)}`) ?? null : null;
      // Kamar bernomor tanpa label (dibuat sebelum ada label) diberi labelnya.
      const ada = label ? perLabel ?? (perNomor && !perNomor.label ? perNomor : null) : perNomor;
      const kapasitasTeks = kolom.kapasitas !== undefined ? rapi(sel1[kolom.kapasitas]) : "";
      const kapasitas = /^\d+$/.test(kapasitasTeks) && Number(kapasitasTeks) >= 1 && Number(kapasitasTeks) <= 20 ? Number(kapasitasTeks) : null;
      grup = {
        kunci: kunciKamar, hotel: hotelAda?.name ?? hotel, label: ada?.label ?? (label || null), nomor: null, baris: nomorBaris,
        tipe: isian(sel1, "tipe", 60), kasur: isian(sel1, "kasur", 40), kapasitas, ada, galat: null, orang: [],
      };
      kelompok.set(kunciKamar, grup);
    }
    if (grup && nomor && grup.nomor === null && !grup.galat) {
      // Nomor pertama yang disebut untuk kamar ini (sel gabung: sama di semua barisnya).
      const kunciNomor = `${kunci(hotel)}\u0000${kunci(nomor)}`;
      const lain = nomorDiklaim.get(kunciNomor);
      const perNomor = hotelAda ? kamarPerKunci.get(`${hotelAda.id}\u0000${kunci(nomor)}`) ?? null : null;
      // Nomor = kamar fisik (Hanung 2026-11-06). Dua label di berkas dengan
      // nomor yang sama dan malam berbeda (5–6 lalu 6–8 Nov) = satu kamar. Kamar
      // bernomor tanpa label (dialog Stays) memakai label dari berkas. Nomor milik
      // kamar berlabel lain tetap ditolak: berkas bisa saja menomori ulang kamar itu.
      if (lain && lain !== grup) {
        // Hanya baris bertanggal: tanpa tanggal tidak bisa dibedakan dari salah ketik.
        if (malam && grup.label && lain.label && kunci(grup.label) !== kunci(lain.label) && grup.orang.length === 0) {
          grup.gabungKe = lain; grup.nomor = lain.nomor; lain.tamu = [...(lain.tamu ?? []), grup];
        } else grup.galat = `Room number ${nomor} is also given to ${lain.label ?? lain.nomor} on row ${lain.baris}`;
      } else if (perNomor && grup.ada && grup.ada.id !== perNomor.id && grup.label && !perNomor.label && grup.orang.length === 0) {
        // Kamar bernomor tanpa label = kamar fisik label ini: ia memakai labelnya,
        // penghuninya yang tidak ada di berkas tetap di sana.
        grup.lepasLabel = grup.ada;
        grup.ada = perNomor;
        grup.nomor = perNomor.room_number;
        nomorDiklaim.set(kunciNomor, grup);
      } else if (perNomor && grup.ada?.id !== perNomor.id && grup.label && perNomor.label) {
        nomorBentrok.push({ hotel: grup.hotel, nomor: perNomor.room_number ?? nomor, labelBerkas: grup.label, labelSekarang: perNomor.label });
        if (opsi.nomorIkutBerkas) {
          grup.ambilDari = perNomor;
          grup.nomor = nomor;
          nomorDiklaim.set(kunciNomor, grup);
        } else grup.galat = `Room ${nomor} is now ${perNomor.label}. Choose "Use the numbers in this file" above to move it to ${grup.label}`;
      } else if (perNomor && grup.ada?.id !== perNomor.id) grup.galat = `Room ${nomor} already exists${perNomor.label ? ` as ${perNomor.label}` : ""}. Use another number, or change that room first`;
      else {
        grup.nomor = grup.ada?.room_number && kunci(grup.ada.room_number) === kunci(nomor) ? grup.ada.room_number : nomor;
        nomorDiklaim.set(kunciNomor, grup);
      }
    } else if (grup && nomor && grup.nomor !== null && kunci(grup.nomor) !== kunci(nomor) && !grup.gabungKe) {
      return tolak(`${grup.label ?? "This room"} already has room number ${grup.nomor} on another row`);
    }
    if (grup?.galat) return tolak(grup.galat);
    if (grup && malam && grup.label) {
      // Satu kamar fisik untuk beberapa label: malamnya tidak boleh bertabrakan.
      const induk = grup.gabungKe ?? grup;
      const sekamar = [induk, ...(induk.tamu ?? [])].filter((g) => g !== grup);
      const tabrak = sekamar.find((g) => (g.malamBaris ?? []).some((m) => m.masuk < malam.keluar && malam.masuk < m.keluar));
      if (tabrak) return tolak(`Room ${induk.nomor} is also given to ${tabrak.label} on the same nights`);
    }
    if (!adaOrang) return;

    const hasil = cocokkan(kode, nama);
    if ("alasan" in hasil) return tolak(hasil.alasan);
    // Satu orang boleh beberapa baris untuk pindah hotel atau pindah kamar:
    // setiap barisnya bertanggal dan malamnya tidak bertabrakan. Hotel yang
    // sama boleh muncul lagi (check-out lalu check-in di kamar lain).
    const sebelumnya = barisOrang.get(hasil.id) ?? [];
    if (sebelumnya.length > 0) {
      const pertama = sebelumnya[0].baris.baris;
      if (!malam || sebelumnya.some((b) => !b.malam)) {
        // Berkas lebar: satu baris = seluruh rencana orang itu. Berkas panjang:
        // baris ganda tanpa tanggal salah ketik, baris pertamanya tetap.
        if (lebar) orangDitolak.add(hasil.id);
        return tolak(pertama === nomorBaris
          ? "Fill in Check-in and Check-out for each stay of someone who moves hotels or rooms"
          : `Same person already on row ${pertama}. To move them between hotels or rooms, fill in Check-in and Check-out on each of their rows`);
      }
      const tabrak = sebelumnya.find((b) => b.malam && b.malam.masuk < malam.keluar && malam.masuk < b.malam.keluar);
      if (tabrak) orangDitolak.add(hasil.id);
      if (tabrak) return tolak(tabrak.baris.baris === nomorBaris ? "Nights of the stays in this row overlap" : `Nights overlap row ${tabrak.baris.baris}`);
    }

    const stays = staySekarang.get(hasil.id) ?? [];
    // Stay tersimpan yang dipadankan dengan baris ini: di hotel yang sama dan
    // malamnya bertabrakan, belum dipakai baris lain orang ini. Tanpa tanggal:
    // yang belum berkamar lebih dulu, seperti `assign_room`.
    const terpakai = new Set(sebelumnya.map((b) => b.diSini).filter(Boolean));
    const calon = hotelAda ? stays.filter((s) => s.hotel_id === hotelAda.id && !terpakai.has(s)) : [];
    const diSini = malam
      ? calon.find((s) => s.malam && s.malam.masuk === malam.masuk && s.malam.keluar === malam.keluar) ?? calon.find((s) => tabrakMalam(s.malam, malam))
      : calon.find((s) => s.room_id === null) ?? calon[0];
    const kamarLama = diSini?.room_id != null ? kamarById.get(diSini.room_id) : undefined;
    const malamSama = !malam || Boolean(diSini?.malam && diSini.malam.masuk === malam.masuk && diSini.malam.keluar === malam.keluar);
    const lainnya = stays.filter((s) => s !== diSini);
    const pindahDari = lainnya.length > 0
      ? `Moving from ${lainnya.map((s) => `${s.room_id !== null ? `${namaKamar(kamarById.get(s.room_id) ?? { room_number: null })} · ` : ""}${namaHotel(s.hotel_id)}`).join(", ")}`
      : null;
    const gantiMalam = diSini && !malamSama && malam ? `Nights change to ${rentangTanggal(malam)}` : null;

    const baru: BarisRencana = { baris: nomorBaris, nama: orangById.get(hasil.id)!.name, kode: kode || null, tujuan, status: "masuk", alasan: null, participant_id: hasil.id };
    if (!grup) {
      // Hotel saja, nomor kamar menyusul. Sudah di hotel ini dengan malam yang
      // sama: tidak diubah. Berkas tanpa nomor kamar tidak pernah mengosongkan
      // kamar yang sudah diatur.
      baru.status = diSini ? (malamSama ? "tetap" : "pindah") : malam || !pindahDari ? "masuk" : "pindah";
      baru.alasan = diSini
        ? gantiMalam ?? (kamarLama ? `Already in ${judulKamar(kamarLama, "room")} at this hotel` : "Already at this hotel")
        : malam ? null : pindahDari;
      const kunciHotel = kunci(hotel);
      const saja = hotelSaja.get(kunciHotel) ?? { hotel: hotelAda?.name ?? hotel, orang: [] };
      saja.orang.push(baru);
      hotelSaja.set(kunciHotel, saja);
    } else {
      const tujuanAda = grup.gabungKe ? grup.gabungKe.ada : grup.ada;
      const tetap = tujuanAda !== null && kamarLama?.id === tujuanAda.id && malamSama;
      baru.status = tetap ? "tetap" : kamarLama || (!diSini && pindahDari && !malam) || gantiMalam ? "pindah" : "masuk";
      baru.alasan = tetap ? "Already in this room"
        : kamarLama && kamarLama.id !== tujuanAda?.id ? `Moving from ${namaKamar(kamarLama)}${banyakHotel ? ` · ${namaHotel(kamarLama.hotel_id)}` : ""}`
        : gantiMalam ?? (diSini ? "Was waiting for a room" : malam ? null : pindahDari);
      grup.orang.push(baru);
      if (malam) grup.malamBaris = [...(grup.malamBaris ?? []), malam];
    }
    baris.push(baru);
    malamBaris.set(baru, malam);
    barisOrang.set(hasil.id, [...sebelumnya, { baris: baru, hotelKunci: kunci(hotel), hotelId: hotelAda?.id ?? null, hotel: hotelAda?.name ?? hotel, grup: grup ?? null, malam, kamar: Boolean(grup), diSini }]);
  });
  // Kembali ke urutan berkas untuk pratinjau (stabil: satu baris Excel bisa jadi dua).
  if (pemegangTetap.size > 0) {
    baris.sort((a, b) => a.baris - b.baris);
    for (const daftar of barisOrang.values()) daftar.sort((a, b) => a.baris.baris - b.baris.baris);
  }

  // Orang dengan beberapa baris (pindah hotel atau kamar): bila satu barisnya
  // ditolak, juga karena kamarnya penuh atau jenis kelaminnya berbeda, semua
  // barisnya ditolak: orangnya tidak tersimpan setengah dan stay lamanya tidak
  // dilepas. Penolakan kamar baru diketahui sesudah isi kamar dihitung, jadi
  // hitungannya diulang tanpa orang itu (tempat yang tidak jadi diambilnya
  // bisa memuat orang lain).
  // Kamar yang ternyata tidak bisa dipakai (nomornya bentrok, disebut baris
  // berikutnya): baris yang sudah masuk ke kamar itu ikut ditolak.
  for (const grup of kelompok.values()) {
    if (!grup.galat) continue;
    for (const b of grup.orang) { b.status = "tolak"; b.alasan = grup.galat; }
    grup.orang = [];
  }
  const asal = new Map(baris.map((b) => [b, { status: b.status, alasan: b.alasan }]));
  const tolakOrang = new Set<string>();
  const alasanSendiri = new Map<BarisRencana, string | null>();
  {
    const ditolak = new Set(baris.filter((b) => b.status === "tolak").map((b) => b.baris));
    for (const [pid, daftar] of barisOrang) if (orangDitolak.has(pid) || (daftar.length > 1 && daftar.some((b) => ditolak.has(b.baris.baris)))) tolakOrang.add(pid);
  }
  const ikut = (orang: BarisRencana[]) => orang.filter((b) => !tolakOrang.has(b.participant_id!));
  // Malam efektif baris untuk isi kamar: dari berkas, lalu stay yang
  // dipadankan, lalu hotelnya. Null = tanpa batas.
  const malamEfektif = new Map<BarisRencana, Malam | null>();
  for (const daftar of barisOrang.values()) {
    for (const b of daftar) malamEfektif.set(b.baris, b.malam ?? b.diSini?.malam ?? malamHotel(b.hotelId !== null ? hotelById.get(b.hotelId) : undefined));
  }
  const rentang = (m: Malam | null): [number, number] => (m ? [Date.parse(m.masuk), Date.parse(m.keluar)] : [-Infinity, Infinity]);

  const hitung = (aktif: Map<string, BarisOrang[]>) => {
    // Orang dengan baris bertanggal: berkas menyebut SEMUA stay-nya. Stay yang
    // tidak dipadankan dengan barisnya dilepas, dan disebut di baris
    // pertamanya. Tanpa tanggal: perilaku lama (kamar di hotel yang sudah ada
    // stay-nya diisi, hotel lain = pindah seluruhnya), jadi rooming list dari
    // satu hotel tidak menghapus malam di hotel lain.
    const lepas: Rencana["lepas"] = [];
    // Stay tersimpan yang dikosongkan rencana ini, untuk isi akhir kamar.
    const stayLepas = new Set<StayLama>();
    for (const [pid, daftar] of aktif) {
      const stays = staySekarang.get(pid) ?? [];
      const bertanggal = daftar.every((b) => b.malam);
      const dipadankan = new Set(daftar.map((b) => b.diSini).filter(Boolean));
      for (const s of stays) {
        const baris1 = daftar.find((b) => b.diSini === s);
        if (!baris1) {
          // Stay yang tidak disebut: dilepas (bertanggal) atau ikut terganti
          // karena orangnya pindah ke hotel lain (tanpa tanggal).
          if (bertanggal || dipadankan.size === 0) {
            stayLepas.add(s);
            if (bertanggal) lepas.push({ participant_id: pid, hotel_id: s.hotel_id });
          }
        } else if (baris1.kamar) {
          stayLepas.add(s);
        }
      }
      if (bertanggal) {
        const dilepas = stays.filter((s) => !dipadankan.has(s)).map((s) => `${s.room_id !== null ? `${namaKamar(kamarById.get(s.room_id) ?? { room_number: null })} · ` : ""}${namaHotel(s.hotel_id)}`);
        const pertama = daftar[0].baris;
        if (dilepas.length > 0) {
          pertama.alasan = [pertama.alasan, `Removes their stay at ${dilepas.join(", ")}`].filter(Boolean).join(". ");
          if (pertama.status === "tetap") pertama.status = "pindah";
        }
      }
    }

    // Isi akhir tiap kamar yang SUDAH ada, per malam: penghuni yang tidak
    // disebut di berkas tetap tinggal, kecuali berkas memindahkannya.
    // Penghuni "tetap" juga tinggal.
    const penghuniTinggal = new Map<number, Array<{ pid: string; r: [number, number] }>>();
    for (const [pid, stays] of staySekarang) {
      for (const s of stays) {
        if (s.room_id === null) continue;
        const tetapDiKamar = (aktif.get(pid) ?? []).some((b) => b.baris.status === "tetap" && b.kamar && b.diSini === s);
        if (stayLepas.has(s) && !tetapDiKamar) continue;
        penghuniTinggal.set(s.room_id, [...(penghuniTinggal.get(s.room_id) ?? []), { pid, r: rentang(s.malam) }]);
      }
    }
    const genderDari = (pid: string) => kunci(orangById.get(pid)?.gender);

    // Per kunci nama: "GRAMM" dan "Gramm" di dua baris adalah satu hotel baru.
    const hotelBaru = new Map<string, string>();
    const kamarBaru: KamarBaru[] = [];
    const penempatan: Rencana["penempatan"] = [];
    /** Satu penempatan per tujuan dan malam. */
    const tambah = (hotel: string, tujuan: string | null, orang: BarisRencana[]) => {
      const perMalam = new Map<string, { malam: Malam | null; ids: string[] }>();
      for (const b of orang) {
        const malam = malamBaris.get(b) ?? null;
        const k = malam ? `${malam.masuk}/${malam.keluar}` : "";
        const grup = perMalam.get(k) ?? { malam, ids: [] };
        grup.ids.push(b.participant_id!);
        perMalam.set(k, grup);
      }
      for (const { malam, ids } of perMalam.values()) penempatan.push({ hotel, tujuan, malam, participant_ids: ids });
    };
    for (const grup of hotelSaja.values()) {
      const orang = ikut(grup.orang);
      if (!hotelPerNama.has(kunci(grup.hotel)) && !hotelBaru.has(kunci(grup.hotel))) hotelBaru.set(kunci(grup.hotel), grup.hotel);
      tambah(grup.hotel, null, orang.filter((b) => b.status !== "tetap"));
    }
    for (const grup of kelompok.values()) {
      if (grup.galat) continue;
      if (grup.gabungKe) {
        // Masuk kamar kelompok lain: kamarnya dibuat atau diubah oleh kelompok itu.
        const t = grup.gabungKe;
        tambah(t.hotel, t.nomor ?? t.ada?.room_number ?? t.label, ikut(grup.orang).filter((b) => b.status !== "tetap"));
        continue;
      }
      const orang = ikut(grup.orang);
      const datang = orang.filter((b) => b.status !== "tetap");
      // Penghuni per malam: yang tinggal, lalu yang datang dan diterima. Kamar
      // yang dikosongkan seseorang 6 Nov boleh diisi orang lain mulai 6 Nov.
      const huni = [...(grup.ada ? penghuniTinggal.get(grup.ada.id) ?? [] : [])];
      // Kamar baru tanpa kolom Kapasitas mendapat kapasitas sebanyak orang yang
      // disebut di berkas pada malam yang sama, paling sedikit 2 (kamar twin).
      const kapasitas = grup.ada ? grup.ada.capacity : grup.kapasitas
        ?? Math.max(2, ...orang.map((b) => 1 + puncakHuni(orang.filter((x) => x !== b).map((x) => rentang(malamEfektif.get(x) ?? null)), rentang(malamEfektif.get(b) ?? null))));

      const masuk: BarisRencana[] = [];
      for (const b of datang) {
        const pid = b.participant_id!;
        const r = rentang(malamEfektif.get(b) ?? null);
        // Malam lama orang ini di kamar ini diganti malam barunya.
        const lain = huni.filter((h) => h.pid !== pid);
        const sekamar = lain.filter((h) => h.r[0] < r[1] && r[0] < h.r[1]);
        if (wajibSama) {
          const g = genderDari(pid);
          if (!g) { b.status = "tolak"; b.alasan = "Gender not filled in on the Participant list"; continue; }
          if (sekamar.some((h) => genderDari(h.pid) && genderDari(h.pid) !== g)) { b.status = "tolak"; b.alasan = "Gender differs from the occupants of this room"; continue; }
        }
        if (puncakHuni(lain.map((h) => h.r), r) + 1 > kapasitas) { b.status = "tolak"; b.alasan = `Room full (capacity ${kapasitas})`; continue; }
        huni.splice(0, huni.length, ...lain, { pid, r });
        masuk.push(b);
      }

      if (!grup.ada) {
        if (!hotelPerNama.has(kunci(grup.hotel)) && !hotelBaru.has(kunci(grup.hotel))) hotelBaru.set(kunci(grup.hotel), grup.hotel);
        kamarBaru.push({ kunci: grup.kunci, hotel: grup.hotel, nomor: grup.nomor, label: grup.label, tipe: grup.tipe, kasur: grup.kasur, kapasitas });
      }
      tambah(grup.hotel, grup.nomor ?? grup.ada?.room_number ?? grup.label, masuk);
    }

    return { lepas, hotelBaru, kamarBaru, penempatan };
  };

  let hasil: ReturnType<typeof hitung>;
  for (;;) {
    for (const [b, a] of asal) { b.status = a.status; b.alasan = a.alasan; }
    for (const pid of tolakOrang) {
      for (const { baris: b } of barisOrang.get(pid)!) {
        b.status = "tolak";
        b.alasan = alasanSendiri.has(b) ? alasanSendiri.get(b)! : lebar ? "Another stay in this row was rejected" : "Another row for this person was rejected";
      }
    }
    hasil = hitung(new Map([...barisOrang].filter(([pid]) => !tolakOrang.has(pid))));
    const baru = [...barisOrang].filter(([pid, daftar]) => !tolakOrang.has(pid) && daftar.length > 1 && daftar.some((b) => b.baris.status === "tolak"));
    if (baru.length === 0) break;
    for (const [pid, daftar] of baru) {
      tolakOrang.add(pid);
      for (const { baris: b } of daftar) if (b.status === "tolak") alasanSendiri.set(b, b.alasan);
    }
  }

  // Stay akhir per orang yang berubah, untuk `replace_stays`.
  const akhir: Rencana["akhir"] = [];
  const refLama = (s: StayLama): RefKamar | null => (s.room_id !== null ? { id: s.room_id } : null);
  const refGrup = (g0: Kelompok | null): RefKamar | null => { const g = g0?.gabungKe ?? g0; return g ? (g.ada ? { id: g.ada.id } : { baru: g.kunci }) : null; };
  const tetapLama = (s: StayLama): StayAkhir => ({ hotel: namaHotel(s.hotel_id), kamar: refLama(s), malam: null, asli: { check_in_at: s.check_in_at, check_out_at: s.check_out_at } });
  for (const [pid, daftar] of barisOrang) {
    if (tolakOrang.has(pid)) continue;
    const diterima = daftar.filter((b) => b.baris.status !== "tolak");
    if (diterima.length === 0 || diterima.every((b) => b.baris.status === "tetap")) continue;
    const stays = staySekarang.get(pid) ?? [];
    if (diterima.every((b) => b.malam)) {
      // Bertanggal: berkas = semua stay-nya. Baris tanpa nomor kamar memakai
      // kamar stay yang dipadankan (tidak pernah mengosongkan kamar).
      akhir.push({ participant_id: pid, stays: diterima.map((b) => ({ hotel: b.hotel, kamar: refGrup(b.grup) ?? (b.diSini ? refLama(b.diSini) : null), malam: b.malam, asli: null })) });
      continue;
    }
    // Tanpa tanggal: satu baris.
    const b = diterima[0];
    if (b.diSini) {
      // Sudah di hotel ini: kamarnya diisi, stay lain dan tanggal tetap.
      akhir.push({ participant_id: pid, stays: stays.map((s) => (s === b.diSini ? { ...tetapLama(s), kamar: refGrup(b.grup) ?? refLama(s) } : tetapLama(s))) });
    } else {
      akhir.push({ participant_id: pid, stays: [{ hotel: b.hotel, kamar: refGrup(b.grup), malam: null, asli: null }] });
    }
  }

  // Kamar yang sudah ada dan isiannya diubah berkas: nomor yang baru datang,
  // label untuk kamar bernomor, kasur, jenis kamar. Isian kosong tidak
  // menghapus apa pun.
  const kamarUbah: KamarUbah[] = [];
  // "GH118 · 718": label dan nomor sekarang, supaya kamar yang nomornya ditukar tetap dikenali.
  const namaUbah = (k: KeadaanAcara["rooms"][number]) => [k.label, k.room_number].filter(Boolean).join(" · ") || namaKamar(k);
  // Label lama dilepas dulu (label unik per hotel), baru dipasang di kamar
  // bernomornya. Kamar lama yang kosong sesudah impor dihapus.
  const kamarHapus: number[] = [];
  // Nomor yang pindah ke label lain dilepas paling awal (nomor unik per hotel);
  // bila berkas memberi kamar itu nomor baru, nomor barunya ditulis sesudahnya.
  for (const grup of kelompok.values()) {
    if (grup.galat || !grup.ambilDari) continue;
    kamarUbah.push({ id: grup.ambilDari.id, nama: namaUbah(grup.ambilDari), hotel: grup.hotel, room_number: null });
  }
  for (const grup of kelompok.values()) {
    if (grup.galat || !grup.lepasLabel || !grup.label) continue;
    kamarUbah.push({ id: grup.lepasLabel.id, nama: namaUbah(grup.lepasLabel), hotel: grup.hotel, label: `${grup.label} (old)` });
    kamarHapus.push(grup.lepasLabel.id);
  }
  for (const grup of kelompok.values()) {
    const ada = grup.ada;
    if (!ada || grup.galat || grup.gabungKe) continue;
    const ubah: KamarUbah = { id: ada.id, nama: namaUbah(ada), hotel: grup.hotel };
    const dilepas = [...kelompok.values()].some((g) => !g.galat && g.ambilDari?.id === ada.id);
    if (grup.nomor !== null && (grup.nomor !== ada.room_number || dilepas)) ubah.room_number = grup.nomor;
    if (ubah.room_number && ada.room_number && ada.room_number !== ubah.room_number && !dilepas) ubah.nomor_lama = ada.room_number;
    if (grup.label && grup.label !== ada.label) ubah.label = grup.label;
    // Beda huruf besar saja (TWIN dan Twin) bukan perubahan.
    if (grup.tipe && kunci(grup.tipe) !== kunci(ada.room_type)) ubah.room_type = grup.tipe;
    if (grup.kasur && kunci(grup.kasur) !== kunci(ada.bed_type)) ubah.bed_type = grup.kasur;
    if (Object.keys(ubah).filter((k) => k !== "nomor_lama").length > 3) kamarUbah.push(ubah);
  }

  baris.sort((a, b) => a.baris - b.baris);
  return { jenis: "kamar", galat: null, baris, labelDipecah, hotelBaru: [...hasil.hotelBaru.values()], kamarBaru: hasil.kamarBaru, kamarUbah, kamarHapus, nomorBentrok, kolomDibaca: lebar ? undefined : kolomKamarDibaca(sel[mulai - 1] ?? [], kolom), busBaru: [], penempatan: hasil.penempatan, lepas: hasil.lepas, akhir, tiket: [], dilewati: 0, busTrip: [] };
}

/** Data untuk "Download current stays". */
export type StaySekarang = {
  peserta: Array<{ id: string; name: string; qr_code: string }>;
  hotels: Array<{ id: number; name: string; sort_order: number; check_in_at: string | null; check_out_at: string | null }>;
  rooms: Array<{ id: number; room_number: string | null; label?: string | null; room_type: string | null; capacity: number }>;
  lodging: Array<{ id: number; participant_id: string; hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null }>;
  offset: string;
};

/**
 * Stay yang sekarang tersimpan, dalam bentuk templat kamar (satu baris per
 * orang, baris pertama judul), supaya panitia bisa mengunduh, mengubah di
 * Excel, lalu mengimpor kembali. Tanggal ditulis bila orang itu punya lebih
 * dari satu stay (impor mewajibkannya) atau stay-nya punya tanggal sendiri;
 * selain itu kosong = ikut tanggal hotel. Orang tanpa stay tidak ditulis.
 * Urut hotel pertama, kamar, lalu nama.
 */
export function barisStaySekarang(data: StaySekarang): string[][] {
  const hotelById = new Map(data.hotels.map((hotel) => [hotel.id, hotel]));
  const kamarById = new Map(data.rooms.map((kamar) => [kamar.id, kamar]));
  const orangById = new Map(data.peserta.map((orang) => [orang.id, orang]));
  const tulis = (iso: string | null) => {
    if (!iso) return "";
    const t = tanggalZona(iso, data.offset);
    return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
  };
  const hasil: Array<{ urut: [number, string, string]; sel: string[] }> = [];
  // Label kamar ikut ditulis bila ada, supaya berkas yang diisi nomor kamarnya
  // lalu diimpor lagi menemukan kamar yang sama.
  const denganLabel = data.rooms.some((kamar) => kamar.label);
  let slot = 2;
  for (const [pid, semua] of stayPerPeserta(data.lodging, hotelById)) {
    const orang = orangById.get(pid);
    const stays = semua.filter((stay) => hotelById.has(stay.hotel_id));
    if (!orang || stays.length === 0) continue;
    slot = Math.max(slot, stays.length);
    const sel = [orang.qr_code, orang.name];
    for (const stay of stays) {
      const hotel = hotelById.get(stay.hotel_id)!;
      const kamar = stay.room_id !== null ? kamarById.get(stay.room_id) : undefined;
      const tanggal = stays.length > 1 || stay.check_in_at || stay.check_out_at ? tanggalStay(stay, hotel) : { masuk: null, keluar: null };
      sel.push(hotel.name, kamar?.room_number ?? "", tulis(tanggal.masuk), tulis(tanggal.keluar));
      if (denganLabel) sel.push(kamar?.label ?? "");
    }
    const pertama = stays[0];
    const kamarPertama = pertama.room_id !== null ? kamarById.get(pertama.room_id) : undefined;
    hasil.push({ urut: [hotelById.get(pertama.hotel_id)!.sort_order, kamarPertama ? kamarPertama.label ?? kamarPertama.room_number ?? "\uffff" : "\uffff", orang.name], sel });
  }
  const banding = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  hasil.sort((a, b) => a.urut[0] - b.urut[0] || banding.compare(a.urut[1], b.urut[1]) || banding.compare(a.urut[2], b.urut[2]));
  const lebar = 2 + slot * (denganLabel ? 5 : 4);
  return [judulStay(slot, denganLabel), ...hasil.map((h) => [...h.sel, ...Array(lebar - h.sel.length).fill("")])];
}
