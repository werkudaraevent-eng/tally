import assert from "node:assert/strict";
import { describeConditions, matchesConditions, normalizeConditions, usesAttendance, type ParticipantPoolRow } from "./undian.ts";
import { checkpointState } from "./undian-checkpoint.ts";

// Syarat checkpoint undian: poin, tujuan poin, dan semua checkpoint selesai.

const checkpoints = [
  { session_id: 3, item_id: null, points: 10 },
  { session_id: 7, item_id: null, points: 20 },
  { session_id: null, item_id: 5, points: 30 },
];
const on = { points_enabled: true, goal: { points: 30 } };

// Sesi dari pemindaian, barang dari penyerahan.
assert.deepEqual(checkpointState(on, checkpoints, [3, 7], undefined), { checkpoint_points: 30, checkpoint_goal_met: true, checkpoints_all_done: false });
assert.deepEqual(checkpointState(on, checkpoints, [3, 7, 9], new Set([5])), { checkpoint_points: 60, checkpoint_goal_met: true, checkpoints_all_done: true });
assert.deepEqual(checkpointState(on, checkpoints, [3], new Set([8])), { checkpoint_points: 10, checkpoint_goal_met: false, checkpoints_all_done: false });
// Points mati: 0 poin dan tujuan tidak tercapai, tetapi "selesai" tetap dihitung.
assert.deepEqual(checkpointState({ points_enabled: false, goal: { points: 30 } }, checkpoints, [3, 7], new Set([5])), { checkpoint_points: 0, checkpoint_goal_met: false, checkpoints_all_done: true });
// Tanpa tujuan: tidak ada yang mencapainya.
assert.equal(checkpointState({ points_enabled: true, goal: null }, checkpoints, [3, 7], new Set([5])).checkpoint_goal_met, false);
// Tanpa checkpoint: tidak ada yang menyelesaikan semuanya.
assert.equal(checkpointState(on, [], [3], undefined).checkpoints_all_done, false);
// Poin kosong dibaca 0.
assert.equal(checkpointState(on, [{ session_id: 3, item_id: null, points: null }], [3], undefined).checkpoint_points, 0);

function row(over: Partial<ParticipantPoolRow> = {}): ParticipantPoolRow {
  return {
    participant_id: "p1", name: "Ani", company: null, title: null, qr_code: "Q1",
    participant_type: null, rsvp_status: null, checked_in: false, attended_sessions: [],
    scan_count: 0, seat_label: null, allow_name_display: true, total_spend: 0, booth_count: 0,
    already_won: 0, manually_excluded: false, exclusion_reason: null, ...over,
  };
}

const points = normalizeConditions({ op: "and", children: [{ var: "checkpoint_points", cmp: "gte", value: 20 }] });
const goal = normalizeConditions({ op: "and", children: [{ var: "checkpoint_goal", is: true }] });
const notGoal = normalizeConditions({ op: "and", children: [{ var: "checkpoint_goal", is: false }] });
const all = normalizeConditions({ op: "and", children: [{ var: "checkpoints_all", is: true }] });

assert.deepEqual(points.children[0], { var: "checkpoint_points", cmp: "gte", value: 20 });
assert.deepEqual(goal.children[0], { var: "checkpoint_goal", is: true });
// Angka rusak = syarat rusak, bukan 0.
assert.deepEqual(normalizeConditions({ op: "and", children: [{ var: "checkpoint_points", cmp: "gte", value: "x" }] }).children[0], { var: "__invalid" });

// Ketiganya membuat kolam membaca pemindaian dan checkpoint.
assert.equal(usesAttendance(points), true);
assert.equal(usesAttendance(goal), true);
assert.equal(usesAttendance(all), true);

const done = row({ checkpoint_points: 60, checkpoint_goal_met: true, checkpoints_all_done: true });
const half = row({ checkpoint_points: 10, checkpoint_goal_met: false, checkpoints_all_done: false });
// Baris tanpa data checkpoint dibaca 0 poin dan belum selesai.
const blank = row();

assert.equal(matchesConditions(done, points), true);
assert.equal(matchesConditions(half, points), false);
assert.equal(matchesConditions(blank, points), false);
assert.equal(matchesConditions(done, goal), true);
assert.equal(matchesConditions(half, goal), false);
assert.equal(matchesConditions(blank, notGoal), true);
assert.equal(matchesConditions(done, all), true);
assert.equal(matchesConditions(half, all), false);

assert.equal(describeConditions(points), "poin checkpoint minimal 20");
assert.equal(describeConditions(goal), "tujuan poin checkpoint tercapai");
assert.equal(describeConditions(all), "semua checkpoint selesai");

console.log("undian-checkpoint.check: ok");
