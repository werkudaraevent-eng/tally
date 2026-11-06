/**
 * Musik layar panggung undian (Lucky draw > Stage display > Music).
 *
 * Tiga lagu opsional per event, diunggah panitia:
 *   * waiting: diputar berulang di layar tunggu, sebelum dan di antara undian;
 *   * drawing: diputar berulang sejak operator menekan Draw sampai nama tampil;
 *   * winner:  diputar sekali saat nama pemenang tampil (menggantikan chime).
 *
 * Berkasnya ada di bucket public-read `undian-music`, satu folder per event
 * (migrasi 202611060003_undian_musik). Berkas diunggah langsung dari browser ke
 * storage lewat signed upload URL, karena lagu bisa jauh di atas batas body
 * fungsi Vercel. Server hanya menerima URL dari bucket itu: kolom ini tidak
 * boleh menjadi jalan memutar berkas dari situs lain di layar acara. Folder
 * event lain tetap diterima, karena Duplicate event menyalin setelan ini apa
 * adanya dan berkas di bucket kita sendiri tidak berbahaya.
 *
 * Murni (tanpa impor) supaya bisa diuji dengan node --experimental-strip-types.
 */

export const BUCKET_MUSIK = "undian-music";
export const MUSIK_MAKS_BYTE = 15 * 1024 * 1024;
export const URL_MUSIK_MAX = 1000;

export const SLOT_MUSIK = ["waiting", "drawing", "winner"] as const;
export type SlotMusik = (typeof SLOT_MUSIK)[number];

/** Jenis berkas yang diterima, dengan ekstensi simpanannya. Sama dengan allowed_mime_types bucket. */
export const JENIS_MUSIK: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

const EKSTENSI_KE_JENIS: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
};

/**
 * Jenis MIME berkas dari `File.type`, atau dari ekstensinya bila browser tidak
 * mengisi type (Windows sering memberi "" untuk .m4a). Null = tidak diterima.
 */
export function jenisMusik(type: string, namaBerkas: string): string | null {
  const t = type.trim().toLowerCase();
  if (t && JENIS_MUSIK[t]) return t === "audio/mp3" ? "audio/mpeg" : t;
  if (t && t !== "application/octet-stream") return null;
  const ext = namaBerkas.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return EKSTENSI_KE_JENIS[ext] ?? null;
}

/** Awalan URL publik bucket musik. */
export function awalanMusik(supabaseUrl: string | undefined | null): string | null {
  const dasar = supabaseUrl?.trim().replace(/\/+$/, "");
  if (!dasar) return null;
  return `${dasar}/storage/v1/object/public/${BUCKET_MUSIK}/`;
}

/** true bila `url` adalah musik yang diunggah lewat Tally: `<awalan><folder event>/<berkas>`. */
export function musikSah(url: string, supabaseUrl: string | undefined | null): boolean {
  const awalan = awalanMusik(supabaseUrl);
  if (!awalan || url.length > URL_MUSIK_MAX || !url.startsWith(awalan)) return false;
  const sisa = url.slice(awalan.length);
  return /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\.(mp3|m4a|aac|ogg|wav)$/i.test(sisa) && !sisa.includes("..");
}

/** Path simpanan: `<event>/<slot>_<waktu>_<acak>_<nama asli aman>`. Garis bawah memisahkan, karena nama aman tidak memuatnya. */
export function pathMusik(eventId: string, slot: SlotMusik, waktu: number, acak: string, namaBerkas: string, ext: string): string {
  return `${eventId}/${slot}_${waktu}_${acak.replace(/[^a-f0-9]/gi, "").slice(0, 12)}_${namaAman(namaBerkas, ext)}`;
}

/** Nama berkas asli dari URL simpanan: ".../drawing_1730000000000_ab12cd_Drum-roll.mp3" -> "Drum-roll.mp3". */
export function namaMusik(url: string): string {
  const berkas = decodeURIComponent(url.split("/").pop() ?? "");
  const cocok = berkas.match(/^[a-z]+_\d+_[A-Za-z0-9]*_(.+)$/);
  return cocok ? cocok[1] : berkas;
}

/** Nama berkas aman untuk path storage: huruf, angka, titik, minus; maksimal 60 karakter sebelum ekstensi. */
export function namaAman(namaBerkas: string, ext: string): string {
  const dasar = namaBerkas.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${dasar || "music"}.${ext}`;
}

/**
 * Lagu yang semestinya terdengar sekarang.
 *
 * `namaTampil` = nama pemenang sudah tampil di layar (setelah animasi berhenti
 * dan jeda sebelum nama, sama dengan saat chime berbunyi). Slot tanpa berkas
 * berarti hening untuk bagian itu.
 */
export function laguSekarang(
  musik: { enabled: boolean; waiting: string | null; drawing: string | null; winner: string | null },
  fase: "idle" | "spinning" | "revealed",
  namaTampil: boolean,
): SlotMusik | null {
  if (!musik.enabled) return null;
  const slot: SlotMusik = fase === "idle" ? "waiting" : fase === "spinning" || !namaTampil ? "drawing" : "winner";
  return musik[slot] ? slot : null;
}
