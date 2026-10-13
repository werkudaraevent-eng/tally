import assert from "node:assert/strict";
import { SEAT_RADIUS, computeSeatMapGeometry, duplicateSeatLabels, normalizeLayoutParams, sectionPrefixError, type SeatMapConfig } from "./seat-map.ts";

/**
 * Pemeriksaan geometri denah untuk setiap tata ruang.
 *
 * Bukan sekadar "tidak melempar". Yang diperiksa adalah hal-hal yang kalau salah
 * baru ketahuan di hari-H, saat tamu berdiri di depan denah yang tidak cocok
 * dengan ruangan:
 *
 *   * jumlah kursi = jumlah yang dijanjikan setelan,
 *   * label kursi UNIK — label kembar berarti dua tamu diarahkan ke kursi yang
 *     sama, dan tidak ada satu pun galat yang muncul saat itu terjadi,
 *   * pola label per layout benar (theater "A12", meja bundar "12A"),
 *   * semua kursi berada DI DALAM kanvas; kursi di luar viewBox tidak tergambar
 *     sama sekali dan hilangnya tidak terlihat sampai ada yang mencarinya.
 *
 * Dijalankan lewat `npm run check`.
 */

const dasar: SeatMapConfig = {
  stage_label: "LED SCREEN",
  row_table_counts: [4, 4],
  seat_rules: [{ from: 1, to: 99, seats: 6 }],
  seat_label_pattern: "{table}{seat}",
  table_overrides: {},
  table_labels: {},
  layout_type: "banquet_round",
  layout_params: normalizeLayoutParams("banquet_round", {}),
};

function buat(layout: SeatMapConfig["layout_type"], params: Record<string, unknown> = {}) {
  return computeSeatMapGeometry({
    ...dasar,
    layout_type: layout,
    layout_params: normalizeLayoutParams(layout, params),
  });
}

// ---- Setiap layout menghasilkan kursi, dan labelnya unik --------------------
const layouts = [
  "banquet_round",
  "cabaret",
  "theater",
  "classroom",
  "u_shape",
  "hollow_square",
  "boardroom",
  "head_table",
] as const;

for (const layout of layouts) {
  const geometry = buat(layout);
  const seats = geometry.tables.flatMap((table) => table.seats);

  assert.ok(seats.length > 0, `${layout}: tidak menghasilkan satu kursi pun`);
  assert.equal(geometry.totalSeats, seats.length, `${layout}: totalSeats tidak cocok dengan jumlah kursi`);

  const label = new Set(seats.map((seat) => seat.label));
  assert.equal(label.size, seats.length, `${layout}: ada label kursi kembar`);

  const nomor = new Set(geometry.tables.map((table) => table.number));
  assert.equal(nomor.size, geometry.tables.length, `${layout}: nomor meja kembar`);

  for (const seat of seats) {
    assert.ok(seat.x > 0 && seat.x < geometry.width, `${layout}: kursi ${seat.label} keluar kanvas secara mendatar`);
    assert.ok(seat.y > 0 && seat.y < geometry.height, `${layout}: kursi ${seat.label} keluar kanvas secara menegak`);
  }
}

// ---- Meja bundar: perilaku lama tidak berubah ------------------------------
const banquet = buat("banquet_round");
assert.equal(banquet.totalTables, 8, "banquet: 4+4 meja");
assert.equal(banquet.totalSeats, 48, "banquet: 8 meja x 6 kursi");
assert.equal(banquet.tables[0].seats[0].label, "1A", "banquet: label kursi pertama");
assert.equal(banquet.tables[0].shape, "round");

// ---- Cabaret: busur lebih sempit, kursi tidak ada yang di sisi panggung -----
const cabaret = buat("cabaret");
const mejaCabaret = cabaret.tables[0];
// "Tidak membelakangi panggung" diukur sebagai: tidak ada kursi yang duduk
// jelas di sisi panggung. Dua kursi ujung memang sedikit melewati garis tengah
// meja — busur 190 derajat membuatnya menghadap serong, bukan menghadap ke
// belakang — jadi ambangnya seperempat jari-jari orbit, bukan nol.
const ambang = mejaCabaret.y - 12;
assert.equal(
  mejaCabaret.seats.filter((seat) => seat.y < ambang).length,
  0,
  "cabaret: tidak boleh ada kursi di sisi panggung",
);
assert.ok(
  banquet.tables[0].seats.filter((seat) => seat.y < banquet.tables[0].y - 12).length > 0,
  "banquet: justru punya kursi di sisi panggung",
);

// ---- Theater: label baris-huruf + nomor, dan lorong menggeser kursi ---------
const theater = buat("theater", { rows: 3, per_row: 10 });
assert.equal(theater.totalTables, 3, "theater: satu 'meja' per baris");
assert.equal(theater.totalSeats, 30, "theater: 3 baris x 10 kursi");
assert.equal(theater.tables[0].label, "A", "theater: baris pertama berhuruf A");
assert.equal(theater.tables[1].label, "B", "theater: baris kedua berhuruf B");
assert.equal(theater.tables[0].seats[0].label, "A1", "theater: kursi pertama baris A");
assert.equal(theater.tables[2].seats[9].label, "C10", "theater: kursi terakhir baris C");
assert.equal(theater.tables[0].shape, "none", "theater: baris tidak menggambar meja");

const denganLorong = buat("theater", { rows: 1, per_row: 10, aisles: [5] });
const tanpaLorong = buat("theater", { rows: 1, per_row: 10, aisles: [] });
assert.ok(
  denganLorong.width > tanpaLorong.width,
  "theater: lorong harus melebarkan kanvas, bukan menumpuk kursi",
);
const jarakSetelahLorong =
  denganLorong.tables[0].seats[5].x - denganLorong.tables[0].seats[4].x;
const jarakBiasa = denganLorong.tables[0].seats[1].x - denganLorong.tables[0].seats[0].x;
assert.ok(jarakSetelahLorong > jarakBiasa * 1.5, "theater: celah lorong harus terlihat");

// Dua lorong (denah Thamrin: blok 8 | 8 | 8). Lorong hanya menggeser posisi;
// label kursi harus sama persis dengan tanpa lorong agar penempatan lama cocok.
const duaLorong = buat("theater", { rows: 8, per_row: 24, aisles: [8, 16] });
const satuLorong = buat("theater", { rows: 8, per_row: 24, aisles: [8] });
const tanpaLorong24 = buat("theater", { rows: 8, per_row: 24, aisles: [] });
const labelSemua = (hasil: typeof tanpaLorong24) => hasil.tables.flatMap((t) => t.seats.map((s) => s.label));
assert.deepEqual(labelSemua(duaLorong), labelSemua(tanpaLorong24), "theater: lorong tidak boleh mengubah label kursi");
assert.deepEqual(labelSemua(satuLorong), labelSemua(tanpaLorong24), "theater: satu lorong juga sama labelnya");
assert.equal(duaLorong.totalSeats, 192, "theater: 8 x 24 kursi");
const baris = duaLorong.tables[0].seats;
const pitch = baris[1].x - baris[0].x;
assert.ok(baris[8].x - baris[7].x > pitch * 1.5, "theater: celah setelah kursi 8");
assert.ok(baris[16].x - baris[15].x > pitch * 1.5, "theater: celah setelah kursi 16");
assert.ok(duaLorong.width > satuLorong.width, "theater: lorong kedua melebarkan kanvas");

// ---- Classroom: kursi duduk di sisi yang menjauhi panggung ------------------
const classroom = buat("classroom", { rows: 2, per_row: 3, seats_per_table: 3 });
assert.equal(classroom.totalTables, 6, "classroom: 2 baris x 3 meja");
assert.equal(classroom.totalSeats, 18, "classroom: 6 meja x 3 kursi");
for (const table of classroom.tables) {
  for (const seat of table.seats) {
    assert.ok(seat.y > table.y, "classroom: kursi harus di belakang meja, menghadap panggung");
  }
}

// ---- Boardroom: satu meja, kursi mengelilingi ------------------------------
const boardroom = buat("boardroom", { seats_per_side: 5, seats_head: 2 });
assert.equal(boardroom.totalTables, 1, "boardroom: satu meja");
assert.equal(boardroom.totalSeats, 14, "boardroom: 5 + 2 + 5 + 2");
assert.equal(boardroom.tables[0].shape, "rect");

// ---- U-shape vs hollow square: sisi keempat ---------------------------------
const u = buat("u_shape", { seats_per_side: 4, seats_head: 3 });
const kotak = buat("hollow_square", { seats_per_side: 4, seats_head: 3 });
assert.equal(u.totalTables, 3, "u_shape: kepala + dua sisi");
assert.equal(kotak.totalTables, 4, "hollow_square: sisi keempat ikut dipasang");
assert.equal(kotak.totalSeats, u.totalSeats + 3, "hollow_square: menambah kursi sebanyak sisi kepala");

// ---- Head table: meja utama nomor 1, kursinya menghadap tamu ----------------
const head = buat("head_table", { head_seats: 4 });
assert.equal(head.tables[0].number, 1, "head_table: meja utama bernomor 1");
assert.equal(head.tables[0].shape, "rect");
assert.equal(head.tables[1].shape, "round", "head_table: meja berikutnya bundar");
for (const seat of head.tables[0].seats) {
  assert.ok(seat.y < head.tables[0].y, "head_table: kursi meja utama menghadap tamu");
}

// ---- Geseran manual tetap berlaku di layout apa pun -------------------------
const digeser = computeSeatMapGeometry({
  ...dasar,
  layout_type: "classroom",
  layout_params: normalizeLayoutParams("classroom", { rows: 1, per_row: 2, seats_per_table: 2 }),
  table_overrides: { "2": { dx: 25, dy: -10 } },
});
const polos = buat("classroom", { rows: 1, per_row: 2, seats_per_table: 2 });
assert.equal(digeser.tables[1].x - polos.tables[1].x, 25, "override: meja ikut bergeser mendatar");
assert.equal(digeser.tables[1].seats[0].y - polos.tables[1].seats[0].y, -10, "override: kursinya ikut bergeser");

// Ruangan gabungan: sofa VIP di depan, theater di belakang.
const gabungan_config = {
  layout_type: "theater",
  layout_params: {
    ...normalizeLayoutParams("theater", {}),
    sections: [
      { kind: "sofa", name: "VIP", prefix: "vip", rows: 2, per_row: 10, seats_per_sofa: 2, aisles: [5] },
      { kind: "theater", name: "", prefix: "", rows: 8, per_row: 26, seats_per_sofa: 1, aisles: [7, 13, 19] },
    ],
  },
} as Partial<SeatMapConfig>;
const gabungan = computeSeatMapGeometry(gabungan_config);
const labelGabungan = gabungan.tables.flatMap((t) => t.seats.map((s) => s.label));
assert.equal(labelGabungan.length, 40 + 208, "gabungan: 40 kursi sofa + 208 theater");
assert.equal(new Set(labelGabungan).size, labelGabungan.length, "gabungan: label kursi unik");
assert.equal(labelGabungan[0], "VIP1", "gabungan: awalan dibuat huruf besar, sofa bernomor menerus");
assert.ok(labelGabungan.includes("VIP40") && labelGabungan.includes("A1") && labelGabungan.includes("H26"), "gabungan: theater tetap A1..H26");
const sofaTerakhir = gabungan.tables.filter((t) => t.shape === "sofa").at(-1)!;
const barisPertama = gabungan.tables.find((t) => t.shape === "none")!;
assert.ok(sofaTerakhir.y < barisPertama.y, "gabungan: sofa di depan theater");
assert.equal(gabungan.zones.length, 1, "gabungan: hanya bagian bernama yang dibingkai");
assert.equal(computeSeatMapGeometry({ layout_type: "theater" }).zones.length, 0, "tanpa sections: tidak ada bingkai");
assert.equal(normalizeLayoutParams("theater", { sections: [] }).sections, undefined, "sections kosong dibuang");

const dobel = { layout_type: "theater", layout_params: { ...normalizeLayoutParams("theater", {}), sections: [
  { kind: "theater", name: "", prefix: "", rows: 2, per_row: 4, seats_per_sofa: 1, aisles: [] },
  { kind: "theater", name: "", prefix: "", rows: 2, per_row: 4, seats_per_sofa: 1, aisles: [] },
] } } as Partial<SeatMapConfig>;
assert.equal(duplicateSeatLabels(dobel).length, 8, "gabungan: dua theater tanpa awalan terdeteksi bentrok");
assert.equal(duplicateSeatLabels(gabungan_config).length, 0, "gabungan: sofa + theater tidak bentrok");
const zona = gabungan.zones[0];
const sofaPertama = gabungan.tables.find((t) => t.shape === "sofa")!;
assert.ok(sofaPertama.y - (sofaPertama.h ?? 0) / 2 >= zona.y + 30, "gabungan: nama bagian tidak menimpa sofa");
assert.ok(zona.y + zona.height - (sofaTerakhir.y + (sofaTerakhir.h ?? 0) / 2) <= 14, "gabungan: bingkai pas di bawah sofa");

// Awalan boleh memuat - . / _ dan spasi; "VIP1-" tidak boleh menjadi "VIP1".
const berstrip = computeSeatMapGeometry({ layout_type: "theater", layout_params: { ...normalizeLayoutParams("theater", {}), sections: [
  { kind: "sofa", name: "VIP", prefix: "vip1-", rows: 1, per_row: 2, seats_per_sofa: 2, aisles: [] },
] } } as Partial<SeatMapConfig>);
assert.deepEqual(berstrip.tables.flatMap((t) => t.seats.map((s) => s.label)), ["VIP1-1", "VIP1-2", "VIP1-3", "VIP1-4"], "awalan: tanda hubung dipertahankan");
assert.equal(sectionPrefixError("VIP1-"), null, "awalan: tanda hubung sah");
assert.equal(sectionPrefixError("A.B/C_D"), null, "awalan: titik, garis miring, garis bawah sah");
assert.ok(sectionPrefixError("VIP#"), "awalan: karakter lain ditolak");
assert.ok(sectionPrefixError("ABCDEFGHI"), "awalan: lebih dari 8 karakter ditolak");

// Ruangan gabungan: tepi luar bagian yang lebih sempit sejajar dengan bagian terlebar.
const tepi = (g: ReturnType<typeof computeSeatMapGeometry>, pilih: (t: (typeof g.tables)[number]) => boolean) => {
  const xs = g.tables.filter(pilih).flatMap((t) => (t.shape === "sofa" ? [t.x - (t.w ?? 0) / 2, t.x + (t.w ?? 0) / 2] : t.seats.flatMap((k) => [k.x - SEAT_RADIUS, k.x + SEAT_RADIUS])));
  return [Math.min(...xs), Math.max(...xs)];
};
const sejajar = computeSeatMapGeometry({ layout_type: "theater", layout_params: { ...normalizeLayoutParams("theater", {}), sections: [
  { kind: "sofa", name: "VIP", prefix: "VIP", rows: 1, per_row: 21, seats_per_sofa: 1, aisles: [] },
  { kind: "theater", name: "", prefix: "", rows: 8, per_row: 24, seats_per_sofa: 1, aisles: [6, 12, 18] },
] } } as Partial<SeatMapConfig>);
const [sofaKiri, sofaKanan] = tepi(sejajar, (t) => t.shape === "sofa");
const [teaterKiri, teaterKanan] = tepi(sejajar, (t) => t.shape === "none");
assert.ok(Math.abs(sofaKiri - teaterKiri) < 0.01 && Math.abs(sofaKanan - teaterKanan) < 0.01, "gabungan: tepi sofa dan theater sejajar");
const kursiA = sejajar.tables.find((t) => t.shape === "none")!.seats;
assert.equal(kursiA[0].x + SEAT_RADIUS < kursiA[1].x - SEAT_RADIUS, true, "gabungan: kursi tidak bertumpuk");
// Peregangan dibatasi: baris yang jauh lebih pendek tetap di tengah, tidak direntang.
const pendek = computeSeatMapGeometry({ layout_type: "theater", layout_params: { ...normalizeLayoutParams("theater", {}), sections: [
  { kind: "sofa", name: "VIP", prefix: "VIP", rows: 1, per_row: 3, seats_per_sofa: 2, aisles: [] },
  { kind: "theater", name: "", prefix: "", rows: 2, per_row: 30, seats_per_sofa: 1, aisles: [] },
] } } as Partial<SeatMapConfig>);
const sofaPendek = pendek.tables.filter((t) => t.shape === "sofa");
assert.ok(sofaPendek[1].x - sofaPendek[0].x <= (sofaPendek[0].w ?? 0) + 16 * 1.8 + 0.01, "gabungan: jarak sofa paling 1.8x");
const [pk, pn] = tepi(pendek, (t) => t.shape === "sofa");
assert.ok(Math.abs((pk + pn) / 2 - pendek.width / 2) < 0.01, "gabungan: bagian pendek tetap di tengah");

// Cari per organisasi: hanya true yang disimpan; bawaan tidak ada.
assert.equal(normalizeLayoutParams("theater", { search_company: true }).search_company, true, "search_company: true disimpan");
assert.equal("search_company" in normalizeLayoutParams("theater", { search_company: "ya" }), false, "search_company: selain true dibuang");
assert.equal("search_company" in normalizeLayoutParams("theater", {}), false, "search_company: bawaan mati");

// Bentuk kursi: hanya square/cinema disimpan; bulat = tidak ada kunci (acara lama 0 px).
assert.equal(normalizeLayoutParams("theater", { seat_shape: "cinema" }).seat_shape, "cinema", "seat_shape: cinema disimpan");
assert.equal("seat_shape" in normalizeLayoutParams("theater", { seat_shape: "circle" }), false, "seat_shape: circle = bawaan");
assert.equal("seat_shape" in normalizeLayoutParams("theater", { seat_shape: "<svg>" }), false, "seat_shape: nilai lain dibuang");

console.log("seat-map-layouts: semua pemeriksaan lolos");
