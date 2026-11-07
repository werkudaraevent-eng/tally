// ===========================================================================
// Cahaya HP (animasi undian "Phone lights"), logika murni.
//
// Peserta yang membuka Area peserta di HP ikut menjadi lampu ruangan. Panggung
// menekan Undi, semua HP menyala dan memutar pertunjukan warna yang sama pada
// detik yang sama, lalu beberapa gelombang gelap mematikan HP yang belum
// beruntung sampai tinggal HP pemenang yang menyala emas.
//
// File ini dipakai server (control, state, hp, peserta/undian-hp), layar
// panggung, dan HP. Tanpa impor: *.check.ts menjalankannya langsung dengan
// node --experimental-strip-types.
//
// KERAHASIAAN. Pemenang dipilih server lebih dulu seperti animasi lain. Tiap HP
// mengambil SATU kali, saat undian mulai, daftar hasilnya per gelombang yang
// terkunci (AES-GCM). Kunci gelombang j baru dikirim server setelah jam server
// melewati waktu gelombang itu, sama untuk semua HP. Jadi HP hanya tahu hasilnya
// sendiri, dan baru tahu saat gelombangnya tiba. Daftar pemenang tidak pernah
// sampai ke HP.
// ===========================================================================

/** Hasil disembunyikan dulu sepanjang ini setelah kunci gelombang terbit, supaya semua HP sempat mengambil kunci sebelum gelombangnya tampil. */
export const CAHAYA_LAG_MS = 1200;
/** Undian Cahaya HP paling pendek: lampu menyala, pertunjukan, dua gelombang. Server memanjangkan Duration yang lebih pendek. */
export const CAHAYA_MIN_MS = 12000;
/** Lampu menyala satu per satu dalam rentang ini sejak Undi ditekan. */
export const CAHAYA_NYALA_MS = 1500;
/** HP yang gugur padam dalam rentang ini setelah gelombangnya tampil (acak per HP: ruangan berkelip padam, bukan serentak seperti saklar). Tetap di bawah 0,5 detik supaya gelombang terasa satu. */
export const CAHAYA_SEBAR_MS = 500;
/** Merah sebentar lalu padam. */
export const CAHAYA_PADAM_MS = 650;
/** Panjang teks hasil sebelum dikunci. Semua hasil dipad sama panjang supaya panjang sandi tidak membocorkan apa pun. */
export const CAHAYA_PAD = 16;

export type CahayaGelombang = {
  /** Jam server (ms) saat kunci gelombang ini terbit. Tampil di layar pada at + CAHAYA_LAG_MS. */
  at: number;
  /** Berapa yang masih menyala sesudah gelombang ini. */
  left: number;
};

export type CahayaJadwal = {
  /** Jam server (ms) saat Undi ditekan. */
  start: number;
  /** Jam server (ms) gelombang terakhir = reveal_at. */
  end: number;
  /** Ukuran kolam (atau skala pengganti bila jumlahnya disembunyikan). */
  total: number;
  /** Yang menyala sampai akhir: pemenang utama + cadangan. */
  final: number;
  waves: CahayaGelombang[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Jadwal gelombang. Pertunjukan warna mengisi 30% awal (3 sampai 6 detik),
 * lalu 1 sampai 5 gelombang berjarak sama sampai `end`. Tiap gelombang
 * memadamkan sebagian yang sama secara geometris (500 -> 180 -> 60 -> 10),
 * dan selalu memadamkan paling tidak satu.
 */
export function jadwalCahaya(total: number, final: number, start: number, end: number): CahayaJadwal {
  const n = Math.max(0, Math.floor(total));
  const m = clamp(Math.floor(final), 0, n);
  const span = Math.max(1, end - start);
  const intro = clamp(span * 0.3, 3000, 6000);
  const gugur = n - m;
  let k = gugur <= 0 ? 1 : clamp(Math.round(Math.log(n / Math.max(1, m)) / Math.log(2.3)), 2, 5);
  k = Math.max(1, Math.min(k, gugur));
  const step = (span - Math.min(intro, span * 0.6)) / k;
  const waves: CahayaGelombang[] = [];
  let prev = n;
  for (let j = 1; j <= k; j += 1) {
    const at = j === k ? end : Math.round(start + Math.min(intro, span * 0.6) + j * step);
    let left = j === k ? m : Math.round(n * Math.pow(Math.max(1, m) / Math.max(1, n), j / k));
    // Sisa minimal satu per gelombang yang masih tersisa, dan selalu turun.
    left = clamp(left, m + (k - j), Math.max(m + (k - j), prev - 1));
    waves.push({ at, left });
    prev = left;
  }
  return { start, end, total: n, final: m, waves };
}

/**
 * Kode hasil per orang di kolam. 0 = pemenang utama, -n = cadangan nomor n,
 * j >= 1 = padam pada gelombang j. Disimpan server di undian_state.pending.
 */
export type CahayaKode = number;

/**
 * Bagi kolam ke gelombang sesuai jadwal. `random` dari server (Math.random);
 * pemenang sudah dipilih drawWinners, di sini hanya urutan padamnya yang
 * gugur. Jumlah per gelombang tepat sama dengan `left` di jadwal.
 */
export function bagiGelombang(
  refs: string[],
  winners: { ref: string; is_backup: boolean; slot_order: number }[],
  jadwal: Pick<CahayaJadwal, "waves">,
  random: () => number = Math.random,
): Record<string, CahayaKode> {
  const map: Record<string, CahayaKode> = {};
  const menang = new Set<string>();
  for (const winner of winners) {
    map[winner.ref] = winner.is_backup ? -Math.max(1, winner.slot_order) : 0;
    menang.add(winner.ref);
  }
  const gugur = refs.filter((ref) => !menang.has(ref));
  for (let i = gugur.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [gugur[i], gugur[j]] = [gugur[j], gugur[i]];
  }
  let index = 0;
  let prev = refs.length;
  jadwal.waves.forEach((wave, w) => {
    const last = w === jadwal.waves.length - 1;
    const count = last ? gugur.length - index : Math.max(0, prev - wave.left);
    for (let c = 0; c < count && index < gugur.length; c += 1) map[gugur[index++]] = w + 1;
    prev = wave.left;
  });
  return map;
}

export type CahayaHasil = "stay" | "out" | "win" | `backup:${number}`;

/** Isi kotak terkunci gelombang ke-j (1-based) untuk satu kode. */
export function hasilGelombang(kode: CahayaKode, j: number, k: number): CahayaHasil {
  if (kode === 0) return j < k ? "stay" : "win";
  if (kode < 0) return j < k ? "stay" : `backup:${-kode}`;
  return j < kode ? "stay" : "out";
}

export function padHasil(hasil: CahayaHasil): string {
  return hasil.padEnd(CAHAYA_PAD, " ");
}

export function bacaHasil(text: string): CahayaHasil | null {
  const value = text.trim();
  if (value === "stay" || value === "out" || value === "win") return value;
  const match = /^backup:(\d{1,3})$/.exec(value);
  return match ? (`backup:${Number(match[1])}` as CahayaHasil) : null;
}

/** Gelombang yang kuncinya sudah boleh terbit: waktunya lewat, atau operator menekan Reveal (reveal_at dimajukan). */
export function gelombangTerbit(waves: Pick<CahayaGelombang, "at">[], now: number, revealAt: number | null): number {
  if (revealAt !== null && now >= revealAt) return waves.length;
  let count = 0;
  for (const wave of waves) if (now >= wave.at) count += 1;
  return count;
}

/** Saat gelombang j tampil di layar (jam server). Bila Reveal ditekan lebih awal, semuanya tampil pada reveal_at + lag. */
export function waktuTampil(wave: Pick<CahayaGelombang, "at">, revealAt: number | null): number {
  const at = revealAt !== null ? Math.min(wave.at, revealAt) : wave.at;
  return at + CAHAYA_LAG_MS;
}

/** Angka acak 0..1 yang tetap untuk satu teks (FNV-1a). Jeda padam per HP dan per titik panggung. */
export function acakTetap(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

/** Berapa yang masih menyala pada jam server `now` (untuk penghitung panggung dan HP). */
export function sisaMenyala(jadwal: CahayaJadwal, now: number, revealAt: number | null): number {
  let left = jadwal.total;
  for (const wave of jadwal.waves) {
    const tampil = waktuTampil(wave, revealAt);
    if (now >= tampil + CAHAYA_SEBAR_MS) left = wave.left;
    else if (now >= tampil) {
      const f = (now - tampil) / CAHAYA_SEBAR_MS;
      left = Math.round(left - (left - wave.left) * f);
      break;
    } else break;
  }
  return left;
}

export type Rgb = [number, number, number];

function hsl(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Warna pertunjukan pada jam server `now`, SAMA untuk seluruh HP dan titik
 * panggung (`phase` 0..1 hanya menggeser sedikit waktu menyala). Ruangan
 * berganti warna serentak seperti gelang lampu konser.
 *
 * Keamanan kejang (WCAG 2.3.1): denyut paling cepat 2 kali per detik, tanpa
 * kilat merah jenuh selain transisi padam yang sekali. Dengan `tenang`
 * (prefers-reduced-motion) warnanya bergeser pelan tanpa denyut.
 */
export function warnaPertunjukan(jadwal: Pick<CahayaJadwal, "start" | "end" | "waves">, now: number, phase: number, tenang: boolean): Rgb {
  const t = now - jadwal.start;
  const nyala = clamp((t - phase * CAHAYA_NYALA_MS) / 400, 0, 1);
  if (nyala <= 0) return [10, 11, 16];
  // Lampu pertama: putih hangat.
  if (t < CAHAYA_NYALA_MS + 600) return campur([10, 11, 16], [236, 240, 255], nyala);
  // Merah (warna padam) dan kuning-emas (warna pemenang) tidak dipakai di pertunjukan: hijau, biru, ungu, magenta saja.
  // Reduced motion: tanpa denyut, dan rona berputar pelan (satu putaran 16 detik).
  const hue = 0.22 + 0.68 * (((t / (tenang ? 16000 : 3200)) % 1 + 1) % 1);
  if (tenang) return hsl(hue, 0.8, 0.56);
  // Ketukan 120 bpm: 2 denyut per detik.
  const beat = Math.pow(Math.max(0, Math.sin((Math.PI * t) / 500)), 6);
  const terakhir = jadwal.waves.length ? jadwal.waves[jadwal.waves.length - 1].at + CAHAYA_LAG_MS : jadwal.end;
  // 3 detik sebelum gelombang terakhir: putih berdenyut, tegang.
  if (now > terakhir - 3000) return campur([150, 160, 190], [255, 255, 255], beat);
  return campur(hsl(hue, 0.85, 0.5), hsl(hue, 0.9, 0.68), beat);
}

export function campur(a: Rgb, b: Rgb, f: number): Rgb {
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

/** Jumlah di layar bila "Show the number in the draw" mati: dinding berskala 240 titik, pemenang tetap tepat. */
export const CAHAYA_SKALA_TERSEMBUNYI = 240;

/** Jadwal untuk publik. Bila jumlah kolam disembunyikan, angka diganti skala 240 titik dengan proporsi yang sama (kolam besar maupun kecil). */
export function jadwalPublik(jadwal: CahayaJadwal, tampilJumlah: boolean): CahayaJadwal {
  // Kolam kecil juga diskalakan: `total` asli tidak boleh terbaca dari JSON atau dihitung dari titik panggung.
  if (tampilJumlah || jadwal.total === CAHAYA_SKALA_TERSEMBUNYI) return jadwal;
  const scale = CAHAYA_SKALA_TERSEMBUNYI / jadwal.total;
  const k = jadwal.waves.length;
  let prev = CAHAYA_SKALA_TERSEMBUNYI;
  const waves = jadwal.waves.map((wave, index) => {
    const sisa = k - index - 1;
    const left = index === k - 1 ? jadwal.final : clamp(Math.round(wave.left * scale), jadwal.final + sisa, Math.max(jadwal.final + sisa, prev - 1));
    prev = left;
    return { at: wave.at, left };
  });
  return { ...jadwal, total: CAHAYA_SKALA_TERSEMBUNYI, waves };
}

/** Selisih jam server dari beberapa sampel: ambil sampel dengan perjalanan tersingkat. */
export function selisihJam(samples: { sent: number; received: number; server: number }[]): number {
  let best: { rtt: number; offset: number } | null = null;
  for (const sample of samples) {
    const rtt = sample.received - sample.sent;
    if (!(rtt >= 0)) continue;
    const offset = sample.server - (sample.sent + sample.received) / 2;
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  return best ? best.offset : 0;
}

/** Ember waktu untuk URL /api/undian/hp: semua HP pada ember yang sama memakai satu respons CDN. */
export function emberHp(serverNow: number, ms: number): number {
  return Math.floor(serverNow / ms);
}
