import assert from "node:assert/strict";
import { answerChoices, answerText, describeConditions, matchesConditions, normalizeConditions, usesAttendance, type ParticipantPoolRow } from "./undian.ts";

// Syarat dari jawaban pertanyaan tambahan form registrasi.

function row(answers: Record<string, string> | undefined): ParticipantPoolRow {
  return {
    participant_id: "p1", name: "Ani", company: null, title: null, qr_code: "Q1",
    participant_type: null, rsvp_status: null, checked_in: false, attended_sessions: [],
    scan_count: 0, seat_label: null, allow_name_display: true, total_spend: 0, booth_count: 0,
    already_won: 0, manually_excluded: false, exclusion_reason: null, answers,
  };
}

// Teks jawaban sama dengan sel Participant list.
assert.equal(answerText("checkbox", "true"), "Yes");
assert.equal(answerText("checkbox", undefined), "No");
assert.equal(answerText("select", " IT "), "IT");
assert.equal(answerText("number", 12), "12");
assert.equal(answerText("text", null), "");
assert.deepEqual(answerChoices({ type: "checkbox", options: [] }), ["Yes", "No"]);
assert.deepEqual(answerChoices({ type: "radio", options: ["S", "M"] }), ["S", "M"]);

const divisi = normalizeConditions({ op: "and", children: [{ var: "answer", key: "divisi", cmp: "in", values: ["IT", " Keuangan "] }] });
const bukanIt = normalizeConditions({ op: "and", children: [{ var: "answer", key: "divisi", cmp: "not_in", values: ["IT"] }] });
const nik = normalizeConditions({ op: "and", children: [{ var: "answer", key: "nik", cmp: "starts_with", text: "34" }] });
const nikKosong = normalizeConditions({ op: "and", children: [{ var: "answer", key: "nik", cmp: "is_empty" }] });

assert.deepEqual(divisi.children[0], { var: "answer", key: "divisi", cmp: "in", values: ["IT", "Keuangan"] });
// Bentuk rusak = syarat rusak.
for (const bad of [
  { var: "answer", key: "Divisi!", cmp: "in", values: ["IT"] },
  { var: "answer", key: "divisi", cmp: "in", values: [] },
  { var: "answer", key: "nik", cmp: "contains", text: " " },
  { var: "answer", key: "nik", cmp: "gte", text: "1" },
]) assert.deepEqual(normalizeConditions({ op: "and", children: [bad] }).children[0], { var: "__invalid" });

assert.equal(usesAttendance(divisi), true);

const it = row({ divisi: "IT", nik: "3401" });
const ops = row({ divisi: "Operasi", nik: "" });
assert.equal(matchesConditions(it, divisi), true);
assert.equal(matchesConditions(ops, divisi), false);
assert.equal(matchesConditions(ops, bukanIt), true);
assert.equal(matchesConditions(it, nik), true);
assert.equal(matchesConditions(ops, nikKosong), true);
// Pertanyaan yang sudah dihapus (tidak ada di baris) atau kolam tanpa jawaban:
// selalu salah, termasuk "bukan salah satu" dan "kosong".
assert.equal(matchesConditions(row({ nik: "" }), bukanIt), false);
assert.equal(matchesConditions(row(undefined), nikKosong), false);

assert.equal(describeConditions(divisi, {}, { divisi: "Divisi" }), "Divisi IT/Keuangan");
assert.equal(describeConditions(bukanIt, {}, { divisi: "Divisi" }), "Divisi not IT");
assert.equal(describeConditions(nik), 'nik starts with "34"');
assert.equal(describeConditions(nik, {}, {}), "FORM QUESTION DELETED, choose again");

console.log("undian-jawaban.check: ok");
