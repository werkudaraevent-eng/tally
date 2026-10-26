/**
 * Logistik satu peserta untuk Daftar peserta dan ekspornya: stay, bus, tiket
 * kereta, dan barang kit yang sudah diambil. Murni, supaya kolomnya diuji
 * langsung dengan Node (`ringkas.check.ts`).
 *
 * Satu fakta satu kolom (permintaan Hanung 2026-10-23): peserta yang pindah
 * hotel mendapat Hotel 1, Room 1, ..., lalu Hotel 2, Room 2; tiket kereta
 * dipecah per isian; satu kolom per barang kit. Kolom yang sama dipakai tabel
 * dan berkas ekspor, jadi keduanya tidak bisa berbeda isi.
 */

import { labelTanggal, tanggalZona } from "./stay.ts";
import type { ArahKereta, TiketKereta } from "./types";

export type StayRingkas = {
  hotel: string;
  /** Null = nomor kamar menyusul. */
  room: string | null;
  /** Tanggal efektif (stay, lalu hotel); null = belum ada. */
  check_in_at: string | null;
  check_out_at: string | null;
};

export type TiketRingkas = Omit<TiketKereta, "id" | "participant_id">;

export type LogistikRingkas = {
  /** Semua stay sebagai satu teks, hotel lebih dulu: kunci urut dan saring kolom Hotel. */
  kamar: string | null;
  bus: string | null;
  /** Urut tanggal, sama dengan portal. */
  stays: StayRingkas[];
  kereta?: Partial<Record<ArahKereta, TiketRingkas>>;
  /** Barang yang sudah diambil, per id barang; nilainya ukuran (boleh null). */
  kit?: Record<string, string | null>;
};

/** Bentuk kolom logistik acara: berapa slot stay, barang kit apa, ada tiket kereta atau tidak. */
export type BentukLogistik = { stays: number; kit: Array<{ id: number; name: string }>; kereta: boolean };

/** "Royal Ambarrukmo · 1208", "Royal Ambarrukmo · room to follow"; semua stay dengan " → ". */
export function labelStay(stays: Array<Pick<StayRingkas, "hotel" | "room">>): string | null {
  return stays.length ? stays.map((s) => `${s.hotel} · ${s.room ?? "room to follow"}`).join(" → ") : null;
}

/** "layar": tanggal untuk tabel ("Thu 5 Nov"); "berkas": untuk Excel, sama dengan templat impor (05/11/2026). */
export type Bentuk = "layar" | "berkas";

/** "2026-11-05" sebagai "Thu 5 Nov" (layar) atau "05/11/2026" (berkas). */
function teksTanggal(t: string, bentuk: Bentuk): string {
  return bentuk === "layar" ? labelTanggal(t) : `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
}

function tanggal(iso: string | null, offset: string, bentuk: Bentuk): string {
  return iso ? teksTanggal(tanggalZona(iso, offset), bentuk) : "";
}

export type KolomLogistik = {
  key: string;
  label: string;
  nilai: (r: LogistikRingkas | null | undefined, offset: string, bentuk: Bentuk) => string;
};

const ISIAN_TIKET: Array<[keyof TiketRingkas, string]> = [
  ["train_name", "train"],
  ["travel_class", "class"],
  ["origin", "from"],
  ["destination", "to"],
  ["depart_date", "date"],
  ["depart_time", "departs"],
  ["arrive_time", "arrives"],
  ["carriage", "carriage"],
  ["seat", "seat"],
  ["booking_code", "booking code"],
];

const LABEL_ARAH: Record<ArahKereta, string> = { outbound: "Outbound", return: "Return" };

/**
 * Kolom logistik acara, urut: Hotel/Room/check-in/check-out per slot, Bus,
 * tiket per arah per isian, lalu satu kolom per barang kit. Slot hanya
 * diberi nomor bila acaranya punya peserta dengan lebih dari satu stay, jadi
 * acara biasa tetap "Hotel" dan "Room".
 *
 * Kunci "kamar" (Hotel slot pertama) dan "bus" sama dengan kolom lama, supaya
 * pilihan Columns yang tersimpan, urutan dan saringan tetap berlaku.
 */
export function kolomLogistik(bentuk: BentukLogistik): KolomLogistik[] {
  const slot = Math.max(1, bentuk.stays);
  const kolom: KolomLogistik[] = [];
  for (let i = 0; i < slot; i += 1) {
    const n = slot > 1 ? ` ${i + 1}` : "";
    const stay = (r: LogistikRingkas | null | undefined) => r?.stays[i];
    kolom.push(
      { key: i === 0 ? "kamar" : `stay:hotel:${i + 1}`, label: `Hotel${n}`, nilai: (r) => stay(r)?.hotel ?? "" },
      { key: `stay:room:${i + 1}`, label: `Room${n}`, nilai: (r) => { const s = stay(r); return s ? s.room ?? "To follow" : ""; } },
      { key: `stay:in:${i + 1}`, label: `Hotel check-in${n}`, nilai: (r, offset, b) => tanggal(stay(r)?.check_in_at ?? null, offset, b) },
      { key: `stay:out:${i + 1}`, label: `Hotel check-out${n}`, nilai: (r, offset, b) => tanggal(stay(r)?.check_out_at ?? null, offset, b) },
    );
  }
  kolom.push({ key: "bus", label: "Vehicle", nilai: (r) => r?.bus ?? "" });
  if (bentuk.kereta) {
    for (const arah of ["outbound", "return"] as const) {
      for (const [isian, label] of ISIAN_TIKET) {
        kolom.push({
          key: `kereta:${arah}:${isian}`,
          label: `${LABEL_ARAH[arah]} ${label}`,
          nilai: (r, _offset, b) => {
            const v = r?.kereta?.[arah]?.[isian];
            if (typeof v !== "string" || !v) return "";
            if (isian === "depart_date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return teksTanggal(v, b);
            return isian.endsWith("_time") ? v.slice(0, 5) : v;
          },
        });
      }
    }
  }
  // Dua barang bernama sama tetap dua kolom yang bisa dibedakan, di tabel maupun header berkas.
  const nama = (n: string) => n.trim().toLowerCase();
  const kembar = new Set(bentuk.kit.map((b) => nama(b.name)).filter((n, i, semua) => semua.indexOf(n) !== i));
  for (const barang of bentuk.kit) {
    kolom.push({
      key: `kit:${barang.id}`,
      label: kembar.has(nama(barang.name)) ? `Kit: ${barang.name.trim()} (${barang.id})` : `Kit: ${barang.name}`,
      nilai: (r) => {
        if (!r?.kit || !(String(barang.id) in r.kit)) return "";
        return r.kit[String(barang.id)] || "Collected";
      },
    });
  }
  return kolom;
}
