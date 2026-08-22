import assert from "node:assert/strict";
import { computeSeatMapGeometry, normalizeLayoutParams, type SeatMapConfig } from "./seat-map.ts";

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

console.log("seat-map-layouts: semua pemeriksaan lolos");
