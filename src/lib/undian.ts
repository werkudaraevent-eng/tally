// Bentuk data dan aturan undian.
//
// Dipakai bersama oleh route handler, halaman CMS, halaman kontrol operator, dan
// layar panggung, jadi modul ini WAJIB bebas dari impor server-only (mis. service
// client Supabase): ia ikut terbawa ke bundel browser.
//
// Dua hal sengaja diletakkan di sini, bukan di dalam Postgres:
//
//   1. EVALUATOR SYARAT. Halaman CMS harus bisa menjawab "berapa peserta yang
//      lolos syarat ini" seketika sambil syaratnya diedit. Kalau evaluator ada di
//      SQL dan CMS memakai tiruannya, dua angka itu bisa menyimpang tanpa ada yang
//      tahu — sampai malam acara, ketika kolam ternyata bukan yang disetujui.
//      Satu evaluator, satu jawaban.
//
//   2. PEMILIHAN PEMENANG. Dijalankan di server (route handler), bukan browser,
//      tapi diletakkan di modul ini supaya CMS dapat memakai fungsi bobot yang
//      sama untuk memperlihatkan pratinjau distribusi tiket sebelum acara.

// ---------------------------------------------------------------------------
// Syarat kelayakan
// ---------------------------------------------------------------------------

export type UndianCmp = "gte" | "gt" | "lte" | "lt" | "eq";

/**
 * Pembanding teks.
 *
 * `eq`/`neq` bekerja pada teks utuh setelah dipangkas dan diseragamkan huruf
 * besar-kecilnya; sisanya cocok sebagian. Perbandingan SELALU mengabaikan besar
 * kecil huruf, dan itu keputusan sadar: data perusahaan datang dari pendaftaran
 * mandiri, sehingga "PT Prima", "PT PRIMA", dan "pt prima" adalah perusahaan yang
 * sama bagi manusia. Aturan yang membedakannya akan meloloskan orang yang justru
 * ingin dikecualikan, dan penyebabnya tidak terlihat di layar mana pun.
 *
 * `is_empty` ada karena "peserta tanpa perusahaan" tidak dapat dinyatakan lewat
 * pembanding lain: `eq ''` gagal untuk kolom yang berisi NULL, dan `contains ''`
 * cocok dengan semua orang.
 */
export type UndianTextCmp = "eq" | "neq" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty";

/** Kolom teks yang bisa dijadikan aturan. */
export type UndianTextVar = "name" | "company" | "job_title" | "qr_code" | "seat_label";

export const TEXT_VAR_LABEL: Record<UndianTextVar, string> = {
  name: "Nama peserta",
  company: "Perusahaan",
  job_title: "Jabatan",
  qr_code: "Kode QR / badge",
  seat_label: "Nomor kursi",
};

export const TEXT_CMP_LABEL: Record<UndianTextCmp, string> = {
  eq: "sama dengan",
  neq: "tidak sama dengan",
  contains: "mengandung",
  not_contains: "tidak mengandung",
  starts_with: "dimulai dengan",
  ends_with: "diakhiri dengan",
  is_empty: "kosong",
  is_not_empty: "tidak kosong",
};

/** Pembanding yang tidak butuh nilai pembanding. */
export const TEXT_CMP_WITHOUT_VALUE: UndianTextCmp[] = ["is_empty", "is_not_empty"];

/**
 * Daun syarat.
 *
 * Bentuk pohonnya sama dengan `special_offers.conditions` supaya idiomnya
 * familiar, tapi daftar variabelnya berbeda dan itu disengaja. Penawaran spesial
 * dievaluasi DI DALAM konteks sebuah booth, sehingga punya cakupan "booth ini".
 * Undian tidak punya konteks booth sama sekali — mengizinkan "di booth ini" di
 * sini akan menghasilkan syarat yang tidak punya arti dan diam-diam meloloskan
 * atau menggugurkan semua orang.
 *
 * Pohon yang sama dipakai dua arah: pada `undian_prizes.conditions` memenuhi
 * berarti BOLEH ikut, pada `undian_exclusion_rules.conditions` memenuhi berarti
 * DIKECUALIKAN. Yang membedakan hanyalah tabel penyimpannya, bukan bentuk datanya.
 */
export type UndianConditionLeaf =
  | { var: "total_spend"; cmp: UndianCmp; value: number }
  | { var: "booth_count"; cmp: UndianCmp; value: number }
  | { var: "scan_count"; cmp: UndianCmp; value: number }
  | { var: "participant_type"; cmp: "in" | "not_in"; values: string[] }
  | { var: "rsvp_status"; cmp: "in" | "not_in"; values: string[] }
  | { var: "checked_in"; is: boolean }
  | { var: "has_seat"; is: boolean }
  | UndianTextLeaf
  | UndianInvalidLeaf;

export type UndianTextLeaf = { var: UndianTextVar; cmp: UndianTextCmp; text: string };

/**
 * Daun penanda syarat yang tidak dapat dibaca. SELALU bernilai salah.
 *
 * Ada karena dua keputusan yang masing-masing benar ternyata berbahaya bila
 * digabung:
 *
 *   1. Syarat rusak tidak boleh melempar error. Satu baris salah bentuk tidak
 *      boleh mematikan tombol undi di atas panggung.
 *   2. Grup KOSONG harus bernilai benar. Hadiah tanpa syarat memang terbuka untuk
 *      semua peserta.
 *
 * Kalau syarat rusak DIJATUHKAN, pohon yang seluruh isinya rusak berubah menjadi
 * grup kosong, lalu aturan (2) membuatnya bernilai benar untuk semua orang. Pada
 * syarat hadiah itu diam-diam membuka undian untuk seluruh ruangan; pada aturan
 * pengecualian — di mana benar berarti TERSINGKIR — itu menggugurkan semua orang
 * dan kolamnya menjadi nol tanpa satu pun petunjuk di layar.
 *
 * Karena itu syarat rusak DIGANTI, bukan dijatuhkan. Pohonnya tetap berisi
 * sesuatu, sehingga "tidak ada syarat" tetap dapat dibedakan dari "syaratnya tidak
 * terbaca", dan keduanya berperilaku sesuai maksudnya masing-masing.
 */
export type UndianInvalidLeaf = { var: "__invalid" };

export const INVALID_LEAF: UndianInvalidLeaf = { var: "__invalid" };

export type UndianConditionGroup = { op: "and" | "or"; children: UndianConditionNode[] };
export type UndianConditionNode = UndianConditionLeaf | UndianConditionGroup;

export const EMPTY_CONDITIONS: UndianConditionGroup = { op: "and", children: [] };

export function isConditionGroup(node: UndianConditionNode): node is UndianConditionGroup {
  return "op" in node;
}

const TEXT_VARS: UndianTextVar[] = ["name", "company", "job_title", "qr_code", "seat_label"];

export function isTextVar(value: unknown): value is UndianTextVar {
  return TEXT_VARS.includes(value as UndianTextVar);
}

/**
 * Penyempit untuk NODE, bukan untuk nilai `var`-nya.
 *
 * `isTextVar(node.var)` menyempitkan properti saja, sehingga TypeScript tetap
 * menganggap `node` bisa berupa daun angka dan menolak akses ke `node.text`.
 * Penyempit pada objeknya yang membuat seluruh cabang teks aman diakses.
 */
export function isTextLeaf(node: UndianConditionLeaf): node is UndianTextLeaf {
  return isTextVar(node.var);
}

/** Apakah pohon memuat syarat yang tidak terbaca. Dipakai layar untuk memperingatkan. */
export function hasInvalidLeaf(node: UndianConditionNode): boolean {
  if (isConditionGroup(node)) return node.children.some(hasInvalidLeaf);
  return node.var === "__invalid";
}

/** Apakah pohon benar-benar tanpa syarat, bukan berisi syarat yang rusak. */
export function isTrulyEmpty(node: UndianConditionGroup): boolean {
  return node.children.length === 0;
}

/**
 * Bentuk syarat datang dari kolom jsonb, jadi tipenya tidak dijamin apa pun.
 *
 * Node yang rusak DIGANTI dengan penanda yang selalu bernilai salah, tidak
 * dijatuhkan. Lihat komentar pada `UndianInvalidLeaf` untuk alasannya — singkatnya,
 * menjatuhkannya mengubah pohon rusak menjadi pohon kosong, dan pohon kosong
 * bernilai benar untuk semua orang.
 */
export function normalizeConditions(value: unknown): UndianConditionGroup {
  if (typeof value !== "object" || value === null) return EMPTY_CONDITIONS;
  const raw = value as Record<string, unknown>;
  const op = raw.op === "or" ? "or" : "and";
  if (!Array.isArray(raw.children)) return { op, children: [] };
  return { op, children: raw.children.map(normalizeNode) };
}

function normalizeNode(value: unknown): UndianConditionNode {
  if (typeof value !== "object" || value === null) return INVALID_LEAF;
  const raw = value as Record<string, unknown>;
  if (raw.op === "and" || raw.op === "or") return normalizeConditions(raw);

  const cmp = raw.cmp;

  if (isTextVar(raw.var)) {
    if (!isTextCmp(cmp)) return INVALID_LEAF;
    const text = typeof raw.text === "string" ? raw.text : "";
    // Pembanding yang butuh nilai tapi nilainya kosong ditandai rusak, bukan
    // dibiarkan lewat. `contains ""` cocok dengan semua orang — dan pada aturan
    // pengecualian itu berarti seluruh ruangan gugur karena satu kolom yang
    // belum diisi.
    if (!TEXT_CMP_WITHOUT_VALUE.includes(cmp) && text.trim() === "") return INVALID_LEAF;
    return { var: raw.var, cmp, text: text.trim() };
  }

  switch (raw.var) {
    case "total_spend":
    case "booth_count":
    case "scan_count": {
      if (!isCmp(cmp)) return INVALID_LEAF;
      const numeric = Number(raw.value);
      if (!Number.isFinite(numeric)) return INVALID_LEAF;
      return { var: raw.var, cmp, value: numeric };
    }
    case "participant_type":
    case "rsvp_status": {
      if (cmp !== "in" && cmp !== "not_in") return INVALID_LEAF;
      if (!Array.isArray(raw.values)) return INVALID_LEAF;
      const values = raw.values.filter((item): item is string => typeof item === "string" && item.trim() !== "");
      // Daftar kosong pada `not_in` akan cocok dengan SEMUA orang, dan pada `in`
      // dengan tidak seorang pun. Keduanya bukan maksud siapa pun; ini adalah
      // syarat yang baru ditambahkan dan belum dipilih nilainya.
      if (values.length === 0) return INVALID_LEAF;
      return { var: raw.var, cmp, values };
    }
    case "checked_in":
    case "has_seat":
      return { var: raw.var, is: raw.is !== false };
    default:
      return INVALID_LEAF;
  }
}

function isCmp(value: unknown): value is UndianCmp {
  return value === "gte" || value === "gt" || value === "lte" || value === "lt" || value === "eq";
}

function isTextCmp(value: unknown): value is UndianTextCmp {
  return typeof value === "string" && value in TEXT_CMP_LABEL;
}

function compare(actual: number, cmp: UndianCmp, expected: number): boolean {
  switch (cmp) {
    case "gte": return actual >= expected;
    case "gt": return actual > expected;
    case "lte": return actual <= expected;
    case "lt": return actual < expected;
    case "eq": return actual === expected;
  }
}

/**
 * Bandingkan teks, mengabaikan besar kecil huruf dan spasi di ujung.
 *
 * Nilai NULL diperlakukan sebagai string kosong, bukan sebagai "gagal semua
 * pembanding". Dengan begitu `neq "PT PRIMA"` tetap bernilai benar untuk peserta
 * yang perusahaannya belum terisi — yang memang benar, ia bukan dari PT PRIMA.
 * Kalau NULL menggagalkan semua pembanding, aturan negatif akan bocor tepat pada
 * baris yang datanya paling tidak lengkap.
 */
function compareText(actual: string | null, cmp: UndianTextCmp, expected: string): boolean {
  const a = (actual ?? "").trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  switch (cmp) {
    case "eq": return a === b;
    case "neq": return a !== b;
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    case "is_empty": return a === "";
    case "is_not_empty": return a !== "";
  }
}

// ---------------------------------------------------------------------------
// Kolam peserta
// ---------------------------------------------------------------------------

/** Satu baris keluaran RPC `undian_participant_pool`. */
export type ParticipantPoolRow = {
  participant_id: string;
  name: string;
  company: string | null;
  title: string | null;
  qr_code: string;
  participant_type: string | null;
  rsvp_status: string | null;
  checked_in: boolean;
  scan_count: number;
  seat_label: string | null;
  allow_name_display: boolean;
  total_spend: number;
  booth_count: number;
  /** Berapa kali peserta ini sudah menang (status rejected tidak dihitung). */
  already_won: number;
  /** Ada di daftar pengecualian per orang. */
  manually_excluded: boolean;
  /** Alasan yang ditulis panitia saat mengecualikan. */
  exclusion_reason: string | null;
};

/**
 * Apakah satu peserta memenuhi pohon syarat.
 *
 * Grup kosong LOLOS. Hadiah tanpa syarat harus terbuka untuk semua; kalau grup
 * kosong dianggap gagal, hadiah yang baru dibuat akan punya kolam nol dan
 * penyebabnya tidak terlihat di mana pun.
 *
 * Perhatikan bahwa fungsi ini tidak tahu arah pemakaiannya. Pada syarat hadiah
 * `true` berarti boleh ikut; pada aturan pengecualian `true` berarti tersingkir.
 * Karena itu grup kosong pada aturan pengecualian akan mengecualikan semua orang —
 * dan justru itu sebabnya CHECK constraint di database menolak aturan tanpa syarat,
 * bukan fungsi ini yang menebak maksudnya.
 *
 * Variabel yang tidak dikenal GAGAL, bukan lolos. Salah tulis konfigurasi harus
 * mempersempit kolam sehingga langsung terlihat di angka pratinjau, bukan diam-diam
 * membuka undian untuk seluruh ruangan.
 */
export function matchesConditions(row: ParticipantPoolRow, node: UndianConditionNode): boolean {
  if (isConditionGroup(node)) {
    if (node.children.length === 0) return true;
    return node.op === "and"
      ? node.children.every((child) => matchesConditions(row, child))
      : node.children.some((child) => matchesConditions(row, child));
  }

  switch (node.var) {
    // Syarat yang tidak terbaca SELALU salah. Kalau ia lolos, salah tulis
    // konfigurasi akan diam-diam membuka undian untuk seluruh ruangan pada syarat
    // hadiah, atau menggugurkan semua orang pada aturan pengecualian.
    case "__invalid": return false;
    case "total_spend": return compare(row.total_spend, node.cmp, node.value);
    case "booth_count": return compare(row.booth_count, node.cmp, node.value);
    case "scan_count": return compare(row.scan_count, node.cmp, node.value);
    case "participant_type": {
      const inList = node.values.includes(row.participant_type ?? "");
      return node.cmp === "in" ? inList : !inList;
    }
    case "rsvp_status": {
      const inList = node.values.includes(row.rsvp_status ?? "");
      return node.cmp === "in" ? inList : !inList;
    }
    case "checked_in": return row.checked_in === node.is;
    case "has_seat": return Boolean(row.seat_label) === node.is;
    // `job_title` dipetakan ke kolom `title`. Namanya dibedakan di sisi aturan
    // karena "title" sendirian ambigu — di layar admin ia mudah terbaca sebagai
    // judul, bukan jabatan.
    case "name": return compareText(row.name, node.cmp, node.text);
    case "company": return compareText(row.company, node.cmp, node.text);
    case "job_title": return compareText(row.title, node.cmp, node.text);
    case "qr_code": return compareText(row.qr_code, node.cmp, node.text);
    case "seat_label": return compareText(row.seat_label, node.cmp, node.text);
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// Bobot
// ---------------------------------------------------------------------------

export type WeightMode = "equal" | "formula";
export type WeightVar = "total_spend" | "booth_count" | "scan_count";

export type WeightConfig = {
  weight_mode: WeightMode;
  weight_var: WeightVar;
  weight_divisor: number;
  weight_base: number;
  weight_max: number;
};

export const WEIGHT_VAR_LABEL: Record<WeightVar, string> = {
  total_spend: "Total transaksi",
  booth_count: "Jumlah booth dikunjungi",
  scan_count: "Jumlah scan",
};

/**
 * Jumlah tiket seorang peserta.
 *
 * tiket = base + floor(nilai / pembagi), lalu dijepit ke [1, max].
 *
 * Batas bawahnya 1, bukan 0, walau base boleh 0. Peserta yang sudah lolos SYARAT
 * tapi berakhir dengan nol tiket adalah keadaan yang mustahil dijelaskan: ia ada
 * di daftar, namanya ikut berputar di roda, tetapi peluangnya nol. Kalau seseorang
 * memang tidak boleh menang, tempatnya di syarat atau di daftar pengecualian, bukan
 * di bobot.
 *
 * Batas atasnya wajib. Tanpa itu, satu peserta dengan belanja jauh di atas
 * rata-rata memegang mayoritas tiket dan undian berhenti terasa seperti undian
 * bagi semua orang lain di ruangan.
 */
export function ticketsFor(row: ParticipantPoolRow, config: WeightConfig): number {
  if (config.weight_mode === "equal") return 1;
  const source = config.weight_var === "total_spend" ? row.total_spend
    : config.weight_var === "booth_count" ? row.booth_count
    : row.scan_count;
  const divisor = config.weight_divisor > 0 ? config.weight_divisor : 1;
  const tickets = config.weight_base + Math.floor(source / divisor);
  return Math.max(1, Math.min(config.weight_max, tickets));
}

// ---------------------------------------------------------------------------
// Kandidat dan pemilihan
// ---------------------------------------------------------------------------

/**
 * Satu nama di kolam, sudah bebas dari asal-usulnya.
 *
 * Peserta terdaftar dan entri hasil import dinormalkan ke bentuk yang sama supaya
 * mesin pemilihan, layar panggung, dan pencatatan pemenang tidak perlu tahu
 * datanya berasal dari mana.
 */
export type Candidate = {
  kind: "participant" | "entry";
  /** uuid peserta, atau id baris entri sebagai string. */
  ref: string;
  name: string;
  company: string | null;
  seat: string | null;
  code: string | null;
  tickets: number;
};

export function participantToCandidate(row: ParticipantPoolRow, config: WeightConfig): Candidate {
  return {
    kind: "participant",
    ref: row.participant_id,
    name: row.name,
    company: row.company,
    seat: row.seat_label,
    code: row.qr_code,
    tickets: ticketsFor(row, config),
  };
}

/**
 * Bilangan bulat acak 0..max-1 dengan penolakan (rejection sampling).
 *
 * Memakai crypto, bukan Math.random(). Bukan karena Math.random() dapat ditebak
 * dalam praktik di sisi server, melainkan karena hasil undian ini menentukan siapa
 * membawa pulang hadiah dan pertanyaannya pasti muncul. "Memakai generator acak
 * kriptografis" adalah jawaban yang bisa diperiksa; "cukup acak" bukan.
 *
 * Sisa pembagian sederhana (% max) ditolak karena membuat nilai-nilai awal
 * sedikit lebih sering muncul. Biasnya kecil, tetapi tidak ada alasan menerimanya
 * ketika menghindarinya hanya butuh satu putaran pengulangan.
 */
function randomBelow(max: number): number {
  if (max <= 1) return 0;
  const limit = Math.floor(0xffffffff / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

/**
 * Ambil `count` pemenang TANPA pengembalian, dengan menghormati bobot.
 *
 * Tanpa pengembalian selalu, tidak dapat disetel. Satu orang yang memenangkan
 * hadiah yang sama dua kali dalam satu putaran adalah hasil yang benar secara
 * matematis dan mustahil dipertahankan di atas panggung.
 *
 * Memakai jumlah kumulatif, bukan larik tiket yang direntang. Dengan 250 peserta
 * dan batas 1000 tiket, versi rentang dapat membuat larik 250.000 elemen untuk
 * mengambil satu nama.
 *
 * Bila diminta lebih banyak daripada isi kolam, yang dikembalikan adalah seluruh
 * kolam. Pemanggil bertanggung jawab memutuskan apakah itu masalah — di panggung,
 * lima pemenang dari kolam berisi tiga orang lebih baik daripada nol pemenang
 * disertai pesan galat.
 */
export function drawWinners(pool: Candidate[], count: number): Candidate[] {
  const remaining = [...pool];
  const winners: Candidate[] = [];
  const target = Math.min(count, remaining.length);

  for (let picked = 0; picked < target; picked += 1) {
    const total = remaining.reduce((sum, candidate) => sum + Math.max(1, candidate.tickets), 0);
    let cursor = randomBelow(total);
    let index = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      cursor -= Math.max(1, remaining[i].tickets);
      if (cursor < 0) { index = i; break; }
      index = i;
    }
    winners.push(remaining[index]);
    remaining.splice(index, 1);
  }

  return winners;
}

/** Fisher-Yates, dipakai layar panggung untuk mengacak urutan nama yang berputar. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hadiah dan state
// ---------------------------------------------------------------------------

export type UndianAnimation = "wheel" | "slot" | "cards" | "digits" | "instant";

export const ANIMATIONS: { value: UndianAnimation; label: string; hint: string }[] = [
  { value: "wheel", label: "Roda putar", hint: "Paling dikenali penonton. Nyaman sampai sekitar 200 nama." },
  { value: "slot", label: "Slot machine", hint: "Nama bergulir cepat lalu berhenti. Kuat untuk ratusan sampai ribuan nama." },
  { value: "cards", label: "Kartu terbalik", hint: "Kartu dibuka satu per satu. Terbaik untuk beberapa pemenang sekaligus." },
  { value: "digits", label: "Angka per digit", hint: "Nomor kursi atau kode muncul digit demi digit. Paling menegangkan." },
  { value: "instant", label: "Langsung tampil", hint: "Tanpa animasi. Cadangan bila waktu acara mepet." },
];

export type PrizeSource = "participants" | "entries";
export type ExcludeScope = "none" | "this_prize" | "all_prizes";

export const EXCLUDE_SCOPE_LABEL: Record<ExcludeScope, string> = {
  none: "Boleh menang berkali-kali",
  this_prize: "Tidak boleh menang dua kali di hadiah ini",
  all_prizes: "Sekali menang, gugur dari semua hadiah",
};

export type UndianPrize = {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  sponsor_name: string | null;
  winners_per_draw: number;
  winner_quota: number;
  backup_per_draw: number;
  animation: UndianAnimation;
  spin_seconds: number;
  source: PrizeSource;
  entry_group_id: number | null;
  conditions: UndianConditionGroup;
  exclude_scope: ExcludeScope;
  weight_mode: WeightMode;
  weight_var: WeightVar;
  weight_divisor: number;
  weight_base: number;
  weight_max: number;
  sort_order: number;
  is_active: boolean;
};

/**
 * `numeric` di Postgres diserialkan menjadi string oleh driver supaya presisinya
 * tidak hilang, jadi angka mentahnya tidak bisa langsung dipakai berhitung. Kalau
 * normalisasi ini terlewat, slider durasi putaran akan melompat ke nilai bawaan
 * pada render pertama — persis masalah yang sama dengan skala branding.
 */
export function normalizePrize(raw: Record<string, unknown>): UndianPrize {
  const numeric = (value: unknown, fallback: number) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    description: (raw.description as string | null) ?? null,
    image_url: (raw.image_url as string | null) ?? null,
    sponsor_name: (raw.sponsor_name as string | null) ?? null,
    winners_per_draw: numeric(raw.winners_per_draw, 1),
    winner_quota: numeric(raw.winner_quota, 1),
    backup_per_draw: numeric(raw.backup_per_draw, 0),
    animation: (ANIMATIONS.some((item) => item.value === raw.animation) ? raw.animation : "wheel") as UndianAnimation,
    spin_seconds: numeric(raw.spin_seconds, 6),
    source: raw.source === "entries" ? "entries" : "participants",
    entry_group_id: raw.entry_group_id == null ? null : Number(raw.entry_group_id),
    conditions: normalizeConditions(raw.conditions),
    exclude_scope: (raw.exclude_scope === "none" || raw.exclude_scope === "this_prize" ? raw.exclude_scope : "all_prizes") as ExcludeScope,
    weight_mode: raw.weight_mode === "formula" ? "formula" : "equal",
    weight_var: (raw.weight_var === "booth_count" || raw.weight_var === "scan_count" ? raw.weight_var : "total_spend") as WeightVar,
    weight_divisor: numeric(raw.weight_divisor, 500000),
    weight_base: numeric(raw.weight_base, 1),
    weight_max: numeric(raw.weight_max, 10),
    sort_order: numeric(raw.sort_order, 0),
    is_active: raw.is_active !== false,
  };
}

export type UndianPhase = "idle" | "spinning" | "revealed";
export type UndianMode = "off" | "live";

/** Satu pemenang seperti yang dikirim ke layar. */
export type UndianWinner = {
  id?: number;
  ref: string;
  kind: "participant" | "entry";
  name: string;
  company: string | null;
  seat: string | null;
  is_backup: boolean;
  slot_order: number;
  status?: "pending" | "confirmed" | "rejected";
};

/**
 * Bentuk response GET /api/undian/state.
 *
 * `winners` HANYA terisi setelah waktu reveal lewat. Selama fase spinning ia
 * kosong, dan itu bukan penyederhanaan melainkan syarat kerahasiaan: lihat
 * komentar pada kolom `pending` di migrasi.
 */
export type UndianState = {
  mode: UndianMode;
  phase: UndianPhase;
  draw_round: number;
  prize: {
    id: number;
    name: string;
    description: string | null;
    image_url: string | null;
    sponsor_name: string | null;
    animation: UndianAnimation;
    spin_seconds: number;
    winners_per_draw: number;
    winner_quota: number;
  } | null;
  /** Nama-nama untuk animasi. Aman: berisi SELURUH kolam, tidak menunjukkan siapa pemenangnya. */
  roster: { name: string; seat: string | null; code: string | null }[];
  pool_size: number;
  spin_started_at: string | null;
  reveal_at: string | null;
  winners: UndianWinner[];
  /** Pemenang yang sudah dikonfirmasi untuk hadiah aktif, untuk papan rekap. */
  confirmed: UndianWinner[];
  settings: UndianDisplaySettings;
  updated_at: string;
};

export type UndianDisplaySettings = {
  page_title: string;
  page_subtitle: string | null;
  show_company: boolean;
  show_seat: boolean;
  sound_enabled: boolean;
  confetti_enabled: boolean;
  background_color: string | null;
  text_color: string | null;
  accent_color: string | null;
  background_image_url: string | null;
};

// ---------------------------------------------------------------------------
// Ringkasan syarat untuk daftar hadiah
// ---------------------------------------------------------------------------

const CMP_TEXT: Record<UndianCmp, string> = {
  gte: "minimal", gt: "lebih dari", lte: "maksimal", lt: "kurang dari", eq: "tepat",
};

const rupiah = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(value)}`;

/** Satu baris ringkas, supaya admin tidak perlu membuka form hanya untuk tahu syaratnya. */
export function describeConditions(node: UndianConditionGroup): string {
  if (node.children.length === 0) return "semua peserta aktif";

  const parts = node.children.map((child) => {
    if (isConditionGroup(child)) return `(${describeConditions(child)})`;
    if (isTextLeaf(child)) {
      const label = TEXT_VAR_LABEL[child.var].toLowerCase();
      if (TEXT_CMP_WITHOUT_VALUE.includes(child.cmp)) return `${label} ${TEXT_CMP_LABEL[child.cmp]}`;
      return `${label} ${TEXT_CMP_LABEL[child.cmp]} "${child.text}"`;
    }
    switch (child.var) {
      // Disebut apa adanya, tidak disembunyikan. Syarat yang tidak terbaca membuat
      // seluruh aturan tidak pernah terpenuhi, dan panitia harus melihatnya di
      // daftar tanpa perlu membuka form.
      case "__invalid": return "SYARAT TIDAK TERBACA";
      case "total_spend": return `belanja ${CMP_TEXT[child.cmp]} ${rupiah(child.value)}`;
      case "booth_count": return `${CMP_TEXT[child.cmp]} ${child.value} booth`;
      case "scan_count": return `${CMP_TEXT[child.cmp]} ${child.value} scan`;
      case "participant_type": return `tipe ${child.cmp === "in" ? "" : "bukan "}${child.values.join("/")}`;
      case "rsvp_status": return `RSVP ${child.cmp === "in" ? "" : "bukan "}${child.values.join("/")}`;
      case "checked_in": return child.is ? "sudah check-in" : "belum check-in";
      case "has_seat": return child.is ? "punya kursi" : "tanpa kursi";
      default: return "syarat tidak dikenal";
    }
  });

  return parts.join(node.op === "and" ? " dan " : " atau ");
}

// ---------------------------------------------------------------------------
// Aturan pengecualian
// ---------------------------------------------------------------------------

/**
 * Satu aturan pengecualian.
 *
 * Peserta yang MEMENUHI `conditions` justru dikecualikan. Arahnya berlawanan
 * dengan `UndianPrize.conditions`, dan itu sebabnya keduanya disimpan di tabel
 * berbeda meski bentuk pohonnya sama.
 */
export type UndianExclusionRule = {
  id: number;
  name: string;
  note: string | null;
  conditions: UndianConditionGroup;
  /** null = berlaku untuk semua hadiah. */
  prize_id: number | null;
  is_active: boolean;
};

export function normalizeExclusionRule(raw: Record<string, unknown>): UndianExclusionRule {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    note: (raw.note as string | null) ?? null,
    conditions: normalizeConditions(raw.conditions),
    prize_id: raw.prize_id == null ? null : Number(raw.prize_id),
    is_active: raw.is_active !== false,
  };
}

/**
 * Rincian mengapa kolam menyusut.
 *
 * Satu angka akhir ("229 nama siap diundi") tidak dapat diperiksa siapa pun.
 * Yang bisa diperiksa adalah selisihnya: 249 peserta, 12 kena aturan, 3
 * dikecualikan manual, 5 tidak memenuhi syarat hadiah, 4 sudah pernah menang.
 * Kalau salah satu angka itu mengejutkan, panitia tahu di mana harus melihat —
 * sebelum acara, bukan sesudah nama yang salah keluar.
 */
export type PoolBreakdown = {
  total: number;
  /** Tidak memenuhi syarat hadiah. */
  failed_conditions: number;
  /** Kena salah satu aturan pengecualian. */
  by_rules: number;
  /** Ada di daftar pengecualian per orang. */
  by_manual: number;
  /** Sudah pernah menang, sesuai cakupan exclude_scope hadiah. */
  by_previous_wins: number;
  /** Nama per aturan yang benar-benar menyingkirkan seseorang. */
  rule_hits: { rule_id: number; rule_name: string; count: number }[];
};

// ---------------------------------------------------------------------------
// Sesi
// ---------------------------------------------------------------------------

export type UndianSessionStatus = "active" | "closed";

/**
 * Satu sesi undian.
 *
 * Hanya SATU sesi boleh berstatus `active` pada satu waktu; aturan itu ditegakkan
 * oleh unique index parsial di database, bukan hanya oleh route handler.
 */
export type UndianSession = {
  id: number;
  name: string;
  note: string | null;
  status: UndianSessionStatus;
  started_at: string;
  closed_at: string | null;
};

/** Baris keluaran RPC `undian_session_summary`. */
export type UndianSessionSummary = UndianSession & {
  closed_by_username: string | null;
  prize_count: number;
  draw_count: number;
  winner_total: number;
  winner_confirmed: number;
  winner_pending: number;
  winner_rejected: number;
  first_draw_at: string | null;
  last_draw_at: string | null;
};

/**
 * `count(...)` di Postgres bertipe `bigint` dan diserialkan sebagai STRING oleh
 * driver, sama seperti kolom `numeric`. Tanpa normalisasi ini, "10" + 1 di sisi
 * klien menghasilkan "101".
 */
export function normalizeSessionSummary(raw: Record<string, unknown>): UndianSessionSummary {
  const num = (value: unknown) => {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    id: Number(raw.session_id ?? raw.id),
    name: String(raw.name ?? ""),
    note: (raw.note as string | null) ?? null,
    status: raw.status === "closed" ? "closed" : "active",
    started_at: String(raw.started_at ?? ""),
    closed_at: (raw.closed_at as string | null) ?? null,
    closed_by_username: (raw.closed_by_username as string | null) ?? null,
    prize_count: num(raw.prize_count),
    draw_count: num(raw.draw_count),
    winner_total: num(raw.winner_total),
    winner_confirmed: num(raw.winner_confirmed),
    winner_pending: num(raw.winner_pending),
    winner_rejected: num(raw.winner_rejected),
    first_draw_at: (raw.first_draw_at as string | null) ?? null,
    last_draw_at: (raw.last_draw_at as string | null) ?? null,
  };
}

export const WINNER_STATUS_LABEL: Record<"pending" | "confirmed" | "rejected", string> = {
  pending: "Belum dikonfirmasi",
  confirmed: "Sah",
  rejected: "Dibatalkan",
};
