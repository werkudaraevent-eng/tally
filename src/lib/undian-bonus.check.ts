import assert from "node:assert/strict";
import { auditPrize, invalidateBonusSessions, matchingBonusRules, normalizeBonusRules, normalizePrize, ticketsFor, type BonusRule, type ParticipantPoolRow, type WeightConfig } from "./undian.ts";
import { matchBonusRows, rowsToBonusKeys } from "./undian-bonus-list.ts";

// Tiket tambahan undian: 1 tiket dasar + aturan yang cocok, dijepit ke maksimum;
// dan pencocokan berkas panitia lewat QR atau email.

function row(over: Partial<ParticipantPoolRow> = {}): ParticipantPoolRow {
  return {
    participant_id: "p1", name: "Ani", company: null, title: null, qr_code: "Q1",
    participant_type: null, rsvp_status: null, checked_in: false, attended_sessions: [],
    scan_count: 0, seat_label: null, allow_name_display: true, total_spend: 0, booth_count: 0,
    already_won: 0, manually_excluded: false, exclusion_reason: null, ...over,
  };
}

const vip: BonusRule = { name: "VIP", tickets: 4, source: "list", participant_ids: ["p1", "p2"], file_name: "vip.xlsx", uploaded_at: null };
const gala: BonusRule = { name: "Gala", tickets: 1, source: "conditions", conditions: { op: "and", children: [{ var: "checked_in", is: true, session_id: 7 }] } };
const empty: BonusRule = { name: "Kosong", tickets: 9, source: "conditions", conditions: { op: "and", children: [] } };
const config = (rules: BonusRule[], max = 10): WeightConfig => ({ weight_mode: "bonus", weight_var: "total_spend", weight_divisor: 1, weight_base: 1, weight_max: max, bonus_rules: rules });

const vipAtGala = row({ participant_id: "p1", attended_sessions: [7] });
const vipOnly = row({ participant_id: "p2" });
const galaOnly = row({ participant_id: "p3", attended_sessions: [7] });
const plain = row({ participant_id: "p4" });

// Tiket dijumlahkan: 1 + 4 + 1.
assert.equal(ticketsFor(vipAtGala, config([vip, gala])), 6);
assert.equal(ticketsFor(vipOnly, config([vip, gala])), 5);
assert.equal(ticketsFor(galaOnly, config([vip, gala])), 2);
assert.equal(ticketsFor(plain, config([vip, gala])), 1);
assert.deepEqual(matchingBonusRules(vipAtGala, [vip, gala]), [0, 1]);
// Maksimum menjepit jumlahnya.
assert.equal(ticketsFor(vipAtGala, config([vip, gala], 3)), 3);
// Aturan syarat kosong tidak memberi siapa pun tiket.
assert.equal(ticketsFor(plain, config([empty])), 1);
// Mode lain tidak tersentuh aturan tiket tambahan.
assert.equal(ticketsFor(vipAtGala, { ...config([vip, gala]), weight_mode: "equal" }), 1);
assert.equal(ticketsFor(row({ total_spend: 1_000_000 }), { weight_mode: "formula", weight_var: "total_spend", weight_divisor: 500000, weight_base: 1, weight_max: 10 }), 3);

// Sesi yang dihapus membuat aturan syarat tidak cocok dengan siapa pun.
const [, galaGone] = invalidateBonusSessions([vip, gala], new Set([3]));
assert.equal(ticketsFor(galaOnly, config([galaGone])), 1);

// Hadiah lama tanpa kolom bonus_rules dibaca sebagai [] dan mode lamanya tetap.
const oldPrize = normalizePrize({ id: 1, name: "TV", weight_mode: "formula", conditions: { op: "and", children: [] } });
assert.equal(oldPrize.weight_mode, "formula");
assert.deepEqual(oldPrize.bonus_rules, []);
assert.equal(normalizePrize({ id: 2, name: "HP", weight_mode: "bonus" }).weight_mode, "bonus");
// Baris rusak dibuang, tiket dijepit 1..100.
assert.deepEqual(normalizeBonusRules([{ source: "x" }, null, { name: "A", tickets: 500, source: "list", participant_ids: ["a", 3] }]), [
  { name: "A", tickets: 100, source: "list", participant_ids: ["a"], file_name: null, uploaded_at: null },
]);
// Audit tidak memuat daftar id, hanya jumlahnya.
const audited = auditPrize({ ...oldPrize, bonus_rules: [vip] }).bonus_rules[0] as Record<string, unknown>;
assert.equal(audited.participant_count, 2);
assert.equal("participant_ids" in audited, false);

// --- Pencocokan berkas ---
const people = [
  { id: "a", name: "Andi", company: "KSO", qr_code: "KSO-0142", email: "andi@kso.co.id" },
  { id: "b", name: "Siti", company: null, qr_code: "KSO-0200", email: "Siti.Rahma@KSO.co.id" },
];
const keys = rowsToBonusKeys([
  { row: 1, cells: ["QR peserta", "Email", "Nama (untuk dicek)"] },
  { row: 2, cells: ["kso-0142", "", "Andi"] },
  { row: 3, cells: ["", "siti.rahma@kso.co.id ", "Siti"] },
  { row: 4, cells: ["KSO-0142", "", "Andi lagi"] },
  { row: 5, cells: ["", "rina@ptx.co", ""] },
  { row: 6, cells: ["KSO-9921", "", ""] },
  { row: 7, cells: ["", "", "Budi S."] },
  { row: 9, cells: ["", "", ""] },
]);
const result = matchBonusRows(keys, people);
assert.deepEqual(result.matched.map((item) => item.participant_id), ["a", "b"]);
assert.equal(result.duplicates, 1);
assert.deepEqual(result.missing, [
  { row: 5, value: "rina@ptx.co", reason: "Email tidak terdaftar di acara ini" },
  { row: 6, value: "KSO-9921", reason: "QR tidak ada di acara ini" },
  { row: 7, value: "Budi S.", reason: "QR dan email kosong" },
]);
assert.equal(result.rows_read, 6);
// QR didahulukan; email cadangan bila QR tidak dikenal.
assert.deepEqual(matchBonusRows([{ row: 2, qr: "X-1", email: "andi@kso.co.id", name: "" }], people).matched.map((item) => item.participant_id), ["a"]);
// Tanpa judul: sel ber-@ dibaca sebagai email, yang lain sebagai QR.
assert.deepEqual(rowsToBonusKeys([{ row: 1, cells: ["andi@kso.co.id"] }, { row: 2, cells: ["KSO-0200"] }]), [
  { row: 1, qr: "", email: "andi@kso.co.id", name: "" },
  { row: 2, qr: "KSO-0200", email: "", name: "" },
]);

console.log("undian-bonus ok");
