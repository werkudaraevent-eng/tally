// ===========================================================================
// Mesin Kartu (Card machine): aturan murni, tanpa three.js atau database.
// ===========================================================================
//
// Dipakai tiga tempat yang harus sepakat:
//   - /api/undian/control: isi bungkus dan urutan undi untuk mode "semua hadiah";
//   - app/undian/undian-kartu.tsx: urutan kartu dan jadwal animasi;
//   - app/undian/undian-animations.tsx: revealSettleMs, kapan pertunjukan selesai.
//
// Diminta Hanung 7 Nov 2026: satu bungkus berisi banyak kartu, dibuka satu per
// satu; opsi CMS satu jenis hadiah per bungkus atau semua hadiah dalam satu
// bungkus (dari yang paling umum ke paling langka, kartu terakhir Grand Prize).
// Desainnya orisinal: hanya mekanik "buka bungkus kartu", tanpa merek kartu mana pun.

/** Isi bungkus: satu hadiah per bungkus, atau semua hadiah yang tersisa di sesi. */
export type PackContents = "one" | "all";
/** Warna kartu: biru (doorprize), ungu (hadiah besar), emas (Grand Prize). */
export type CardTier = "common" | "rare" | "grand";
export type TierNumber = 1 | 2 | 3;

export const PACK_MAX_CARDS = 30;

/** Warna tiap tingkat kartu: adegan 3D dan Card reveal (cadangan tanpa WebGL) memakai yang sama. */
export const TIER_HEX: Record<TierNumber, string> = { 1: "#5aa9ff", 2: "#c27bff", 3: "#ffc94a" };

export const CARD_TIERS: { value: CardTier; label: string; hint: string }[] = [
  { value: "common", label: "Blue", hint: "Doorprize" },
  { value: "rare", label: "Purple", hint: "Big prize" },
  { value: "grand", label: "Gold", hint: "Grand prize" },
];

export function normalizePackContents(value: unknown): PackContents {
  return value === "all" ? "all" : "one";
}
export function normalizeCardTier(value: unknown): CardTier {
  return value === "rare" || value === "grand" ? value : "common";
}
export function tierNumber(tier: CardTier): TierNumber {
  return tier === "grand" ? 3 : tier === "rare" ? 2 : 1;
}

/** Satu kelompok kartu di bungkus: satu hadiah, `count` kartu berurutan. */
export type PackGroup = { prize_id: number; prize: string; tier: TierNumber; count: number };
/** Rencana bungkus. Bukan rahasia: hanya hadiah dan jumlah kartunya, tanpa nama. */
export type PackPlan = { mode: PackContents; groups: PackGroup[] };

export type PackCandidatePrize = { id: number; name: string; tier: CardTier; sort_order: number; count: number };

/**
 * Isi bungkus "semua hadiah".
 *
 * - Hadiah pemegang pengaturan (`holder`) selalu kartu terakhir dan selalu emas.
 * - Paling banyak PACK_MAX_CARDS kartu. Kursi dibagi dari yang paling langka
 *   dulu (warna lalu urutan undi dari belakang), jadi yang terpotong selalu
 *   hadiah paling umum; sisanya bisa diundi lagi dengan animasinya sendiri.
 * - Tampil dari yang paling umum: warna naik, lalu urutan undi.
 * - `drawOrder`: pemenang diundi dari yang paling langka dulu, supaya aturan
 *   "tidak boleh menang dua kali" tidak membuat hadiah besar kehilangan
 *   peluang hanya karena doorprize keluar lebih dulu di layar.
 */
export function packAllPlan(holder: PackCandidatePrize, others: PackCandidatePrize[]): { groups: PackGroup[]; drawOrder: number[] } {
  const rank = (prize: PackCandidatePrize) => tierNumber(prize.tier);
  const holderCount = Math.min(Math.max(0, holder.count), PACK_MAX_CARDS);
  let budget = PACK_MAX_CARDS - holderCount;
  const rarestFirst = others
    .filter((prize) => prize.id !== holder.id && prize.count > 0)
    .slice()
    .sort((a, b) => rank(b) - rank(a) || b.sort_order - a.sort_order || b.id - a.id);
  const given = new Map<number, number>();
  for (const prize of rarestFirst) {
    const take = Math.min(prize.count, budget);
    if (take <= 0) continue;
    given.set(prize.id, take);
    budget -= take;
  }
  const display = rarestFirst
    .filter((prize) => given.has(prize.id))
    .sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order || a.id - b.id)
    .map((prize): PackGroup => ({ prize_id: prize.id, prize: prize.name, tier: tierNumber(prize.tier), count: given.get(prize.id)! }));
  const groups = holderCount > 0 ? [...display, { prize_id: holder.id, prize: holder.name, tier: 3 as TierNumber, count: holderCount }] : display;
  const drawOrder = [holder.id, ...rarestFirst.filter((prize) => given.has(prize.id)).map((prize) => prize.id)].filter((id) => groups.some((group) => group.prize_id === id));
  return { groups, drawOrder };
}

/** Warna tiap kartu, urut seperti dibuka. */
export function packTiers(plan: PackPlan): TierNumber[] {
  return plan.groups.flatMap((group) => Array.from({ length: group.count }, () => group.tier));
}

// ---------------------------------------------------------------------------
// Jadwal animasi (milidetik). Komponen dan revealSettleMs memakai angka yang sama.
// ---------------------------------------------------------------------------

/**
 * Pembukaan sebelum bungkus siap disobek: kode slot diketik, spiral berputar,
 * bungkus jatuh dan diangkat ke depan kamera. Berjalan selama mengundi, jadi
 * server memanjangkan Duration yang lebih pendek dari ini (seperti Cahaya HP).
 */
export const PACK_INTRO_MS = 8000;

/** Kartu terakhir dapat babak Grand Prize sendiri (gelap, retak emas, konfeti). */
export function isLegendCard(tiers: TierNumber[], index: number): boolean {
  const k = tiers.length;
  return index === k - 1 && tiers[index] === 3 && (k === 1 || tiers[0] !== 3);
}

/** Kartu yang dibuka besar di depan layar; sisanya dibalik cepat di tempat. */
export function isBigCard(tiers: TierNumber[], index: number): boolean {
  const k = tiers.length;
  const tier = tiers[index];
  return k === 1 || index < 3 || index === k - 1 || tier > 1 || (index > 0 && tiers[index - 1] !== tier);
}

export const PACK_TIMING = {
  tense: (top: TierNumber) => (top === 3 ? 1600 : top === 2 ? 1100 : 700),
  tear: (top: TierNumber) => (top === 3 ? 1900 : 1400),
  strip: 500,
  pull: 1100,
  drop: 700,
  legend: { blackout: 700, float: 1500, crack: 650, cracks: 3, flip: 650, hold: 3200, toGrid: 900 },
  big: {
    tease: (tier: TierNumber, index: number) => (tier === 3 ? 1100 : tier === 2 ? 900 : index === 0 ? 600 : 350),
    fly: (tier: TierNumber) => (tier === 1 ? 650 : 850),
    hold: (tier: TierNumber, single: boolean) => (single ? 2500 : tier > 1 ? 1700 : 1200),
    toGrid: 600,
  },
  quick: { flip: 320, hold: 380, toGrid: 380 },
} as const;

/** Lama satu kartu dibuka, dari mulai sampai kartu duduk di grid. */
export function cardMs(tiers: TierNumber[], index: number): number {
  const k = tiers.length;
  const tier = tiers[index];
  const t = PACK_TIMING;
  if (isLegendCard(tiers, index)) {
    const l = t.legend;
    return l.blackout + l.float + l.crack * l.cracks + l.flip + l.hold + (k > 1 ? l.toGrid : 0);
  }
  if (isBigCard(tiers, index)) {
    const b = t.big;
    return b.tease(tier, index) + b.fly(tier) + b.hold(tier, k === 1) + (k === 1 ? 0 : b.toGrid);
  }
  return t.quick.flip + t.quick.hold + t.quick.toGrid;
}

/** Sejak pemenang datang (bungkus sudah siap) sampai kartu pertama mulai dibuka. */
export function packOpenMs(tiers: TierNumber[]): number {
  if (tiers.length === 0) return 0;
  const top = Math.max(...tiers) as TierNumber;
  return PACK_TIMING.tense(top) + PACK_TIMING.tear(top) + PACK_TIMING.strip + PACK_TIMING.pull + PACK_TIMING.drop;
}

/** Sejak pemenang datang sampai kartu terakhir duduk. */
export function packRevealMs(tiers: TierNumber[]): number {
  let total = packOpenMs(tiers);
  for (let i = 0; i < tiers.length; i += 1) total += cardMs(tiers, i);
  return total;
}

/** Saat kartu pertama terbalik (nama pertama terbaca), sejak pemenang datang. */
export function packFirstNameMs(tiers: TierNumber[]): number {
  if (tiers.length === 0) return 0;
  const t = PACK_TIMING;
  const tier = tiers[0];
  if (isLegendCard(tiers, 0)) return packOpenMs(tiers) + t.legend.blackout + t.legend.float + t.legend.crack * t.legend.cracks + t.legend.flip * 0.6;
  if (isBigCard(tiers, 0)) return packOpenMs(tiers) + t.big.tease(tier, 0) + t.big.fly(tier) * 0.7;
  return packOpenMs(tiers) + t.quick.flip * 0.6;
}
