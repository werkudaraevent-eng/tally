import type { BahanLaporan } from "../bahan.ts";
import { angka, dari, pilih, type HasilSlide } from "../teks.ts";

/** Angka logistik: kamar, kendaraan, bagasi. Hanya yang dipakai acara. */
export function slideOperasional(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const l = b.logistik;
  if (!l || (l.kamar === 0 && l.kendaraan === 0 && l.tas === 0)) return { ada: false, nama: "Operations", alasan: "Logistics is empty" };

  const isi = [];
  if (l.kamar > 0) {
    isi.push({
      label: pilih(bh, { id: "Kamar", en: "Rooms" }),
      nilai: angka(l.kamar, bh),
      ket: pilih(bh, { id: `di ${angka(l.hotel, bh)} hotel`, en: `in ${angka(l.hotel, bh)} hotel${l.hotel === 1 ? "" : "s"}` }),
    });
  }
  if (l.kendaraan > 0) {
    isi.push({
      label: pilih(bh, { id: "Kendaraan", en: "Vehicles" }),
      nilai: angka(l.kendaraan, bh),
      ket: l.trip > 0 ? pilih(bh, { id: `untuk ${angka(l.trip, bh)} perjalanan`, en: `for ${angka(l.trip, bh)} trips` }) : "",
    });
  }
  if (l.tas > 0) {
    isi.push({
      label: pilih(bh, { id: "Tas bagasi", en: "Bags" }),
      nilai: angka(l.tas, bh),
      ket: l.tasKembali !== null ? pilih(bh, { id: `${dari(l.tasKembali, l.tas, bh)} kembali ke pemiliknya`, en: `${dari(l.tasKembali, l.tas, bh)} returned to their owners` }) : "",
      masalah: l.tasKembali !== null && l.tasKembali < l.tas,
    });
  }

  const bagian = [
    l.kamar > 0 ? pilih(bh, { id: `${angka(l.kamar, bh)} kamar`, en: `${angka(l.kamar, bh)} rooms` }) : null,
    l.kendaraan > 0 ? pilih(bh, { id: `${angka(l.kendaraan, bh)} kendaraan`, en: `${angka(l.kendaraan, bh)} vehicles` }) : null,
    l.tas > 0 ? pilih(bh, { id: `${angka(l.tas, bh)} tas bagasi`, en: `${angka(l.tas, bh)} bags` }) : null,
  ].filter((x): x is string => x !== null);
  const gabung = bagian.length > 1 ? `${bagian.slice(0, -1).join(", ")} ${pilih(bh, { id: "dan", en: "and" })} ${bagian[bagian.length - 1]}` : bagian[0];

  return {
    ada: true,
    bobot: 0,
    temuan: null,
    slide: {
      kunci: "operasional",
      jenis: "isi",
      saran: pilih(bh, { id: `Panitia mengurus ${gabung}`, en: `The committee handled ${gabung}` }),
      tata: "penuh",
      blok: [{ jenis: "angka", isi }],
      kaki: pilih(bh, { id: "Dari Logistik dan meja bagasi di Tally.", en: "From Logistics and the luggage desk in Tally." }),
    },
  };
}
