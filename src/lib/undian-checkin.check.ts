import assert from "node:assert/strict";
import { describeConditions, hasInvalidLeaf, invalidateUnknownSessions, matchesConditions, normalizeConditions, usesAttendance, type ParticipantPoolRow } from "./undian.ts";

// Syarat check-in undian: gabungan pemindaian /scan dan salinan scanner API,
// dengan pilihan satu sesi.

function row(over: Partial<ParticipantPoolRow> = {}): ParticipantPoolRow {
  return {
    participant_id: "p1", name: "Ani", company: null, title: null, qr_code: "Q1",
    participant_type: null, rsvp_status: null, checked_in: false, attended_sessions: [],
    scan_count: 0, seat_label: null, allow_name_display: true, total_spend: 0, booth_count: 0,
    already_won: 0, manually_excluded: false, exclusion_reason: null, ...over,
  };
}

const anySession = normalizeConditions({ op: "and", children: [{ var: "checked_in", is: true }] });
const gala = normalizeConditions({ op: "and", children: [{ var: "checked_in", is: true, session_id: 7 }] });
const notGala = normalizeConditions({ op: "and", children: [{ var: "checked_in", is: false, session_id: 7 }] });

// Syarat lama tanpa sesi tetap berbentuk sama setelah dibaca ulang.
assert.deepEqual(anySession.children[0], { var: "checked_in", is: true });
assert.deepEqual(gala.children[0], { var: "checked_in", is: true, session_id: 7 });
// session_id yang rusak dibaca sebagai "sesi mana pun", bukan syarat rusak.
assert.deepEqual(normalizeConditions({ op: "and", children: [{ var: "checked_in", is: true, session_id: "x" }] }).children[0], { var: "checked_in", is: true });

const scannedAtRegistration = row({ checked_in: true, attended_sessions: [3] });
const scannedAtGala = row({ checked_in: true, attended_sessions: [3, 7] });
const sourceOnly = row({ checked_in: true, attended_sessions: [] });
const absent = row();

assert.equal(matchesConditions(scannedAtRegistration, anySession), true);
assert.equal(matchesConditions(sourceOnly, anySession), true);
assert.equal(matchesConditions(absent, anySession), false);

assert.equal(matchesConditions(scannedAtGala, gala), true);
assert.equal(matchesConditions(scannedAtRegistration, gala), false);
// Salinan scanner API tidak punya sesi, jadi tidak memenuhi syarat sesi tertentu.
assert.equal(matchesConditions(sourceOnly, gala), false);

assert.equal(matchesConditions(scannedAtRegistration, notGala), true);
assert.equal(matchesConditions(scannedAtGala, notGala), false);

assert.equal(usesAttendance(gala), true);
assert.equal(usesAttendance(normalizeConditions({ op: "and", children: [{ op: "or", children: [{ var: "checked_in", is: true }] }] })), true);
assert.equal(usesAttendance(normalizeConditions({ op: "and", children: [{ var: "has_seat", is: true }] })), false);
// Jumlah scan juga butuh pemindaian /scan (nilai gabungannya disusun di server).
assert.equal(usesAttendance(normalizeConditions({ op: "and", children: [{ var: "scan_count", cmp: "gte", value: 2 }] })), true);

assert.equal(describeConditions(anySession), "checked in");
assert.equal(describeConditions(gala, { 7: "Gala Dinner" }), "checked in at Gala Dinner");
assert.equal(describeConditions(notGala, {}), "CHECK-IN SESSION DELETED, choose again");
// Daftar sesi gagal dimuat: jangan sebut terhapus.
assert.equal(describeConditions(gala, null), "checked in at a particular session");

// Sesi yang sudah dihapus: syaratnya rusak, tidak ada yang lolos, termasuk
// "Belum check-in" yang tanpa ini meloloskan semua orang.
const gone = invalidateUnknownSessions(notGala, new Set([3]));
assert.equal(hasInvalidLeaf(gone), true);
assert.equal(matchesConditions(absent, gone), false);
assert.equal(hasInvalidLeaf(invalidateUnknownSessions(notGala, new Set([7]))), false);
assert.equal(hasInvalidLeaf(invalidateUnknownSessions(anySession, new Set())), false);

console.log("undian-checkin ok");
