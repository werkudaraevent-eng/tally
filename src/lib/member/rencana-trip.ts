import type { LogistikKamar, LogistikKereta } from "../logistik/peserta.ts";

/**
 * "Rencana perjalananmu" tema Gathering Trip (keputusan Mas 28 Okt 2026): satu
 * daftar urut waktu dari tiket kereta dan hotel peserta, seperti itinerary
 * Trip.com. Hanya dari data yang sudah ada; langkah tanpa tanggal dilewati.
 */
export type LangkahTrip = {
  jenis: "kereta" | "checkin" | "pindah" | "checkout";
  /** Kunci urut "YYYY-MM-DD HH:MM" di zona acara. */
  kunci: string;
  tanggal: string;
  jam: string | null;
  teks: string;
};

type Teks = {
  trainLeg: (dari: string, ke: string) => string;
  checkInAt: (hotel: string) => string;
  moveTo: (hotel: string) => string;
  checkOutAt: (hotel: string) => string;
};

/** Tanggal dan jam (HH:MM) sebuah waktu ISO di zona acara. */
export function waktuDiZona(iso: string, zona: string): { tanggal: string; jam: string } {
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { tanggal: `${bagian.year}-${bagian.month}-${bagian.day}`, jam: `${bagian.hour}:${bagian.minute}` };
}

export function rencanaTrip(stays: LogistikKamar[], trains: LogistikKereta[], zona: string, teks: Teks): LangkahTrip[] {
  const langkah: LangkahTrip[] = [];
  for (const tiket of trains) {
    if (!tiket.depart_date) continue;
    const dari = tiket.origin?.trim();
    const ke = tiket.destination?.trim();
    langkah.push({
      jenis: "kereta",
      kunci: `${tiket.depart_date} ${tiket.depart_time ?? "00:00"}`,
      tanggal: tiket.depart_date,
      jam: tiket.depart_time,
      teks: dari && ke ? teks.trainLeg(dari, ke) : tiket.train_name,
    });
  }
  const urutStay = [...stays].filter((stay) => stay.check_in_at).sort((a, b) => a.check_in_at!.localeCompare(b.check_in_at!));
  urutStay.forEach((stay, urut) => {
    const nama = stay.hotel.name.trim();
    const masuk = waktuDiZona(stay.check_in_at!, zona);
    langkah.push({ jenis: urut === 0 ? "checkin" : "pindah", kunci: `${masuk.tanggal} ${masuk.jam}`, tanggal: masuk.tanggal, jam: masuk.jam, teks: urut === 0 ? teks.checkInAt(nama) : teks.moveTo(nama) });
  });
  const terakhir = urutStay.at(-1);
  if (terakhir?.check_out_at) {
    const keluar = waktuDiZona(terakhir.check_out_at, zona);
    langkah.push({ jenis: "checkout", kunci: `${keluar.tanggal} ${keluar.jam}`, tanggal: keluar.tanggal, jam: keluar.jam, teks: teks.checkOutAt(terakhir.hotel.name.trim()) });
  }
  return langkah.sort((a, b) => a.kunci.localeCompare(b.kunci));
}

/** Menit antara jam berangkat dan tiba ("06:30", "12:10"); lewat tengah malam dihitung hari berikutnya. */
export function lamaPerjalanan(berangkat: string | null, tiba: string | null): number | null {
  const menit = (jam: string | null) => {
    const cocok = jam?.match(/^(\d{1,2})[:.](\d{2})$/);
    return cocok ? Number(cocok[1]) * 60 + Number(cocok[2]) : null;
  };
  const a = menit(berangkat);
  const b = menit(tiba);
  if (a === null || b === null || a === b) return null;
  return b > a ? b - a : b + 1440 - a;
}
