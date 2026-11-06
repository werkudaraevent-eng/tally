import assert from "node:assert/strict";
import { pathMusik, awalanMusik, jenisMusik, laguSekarang, musikSah, namaAman, namaMusik } from "./undian-musik.ts";

const SB = "https://contoh.supabase.co";
const EV = "6f1c2a7e-0000-4000-8000-000000000001";
const ok = `${SB}/storage/v1/object/public/undian-music/${EV}/drawing_1730000000000_ab12cd_drum-roll.mp3`;

assert.equal(awalanMusik(`${SB}/`), `${SB}/storage/v1/object/public/undian-music/`);
assert.equal(awalanMusik(""), null);
assert.equal(musikSah(ok, SB), true);
assert.equal(musikSah(`${SB}/storage/v1/object/public/undian-music/${EV}/../x.mp3`, SB), false);
assert.equal(musikSah(`${SB}/storage/v1/object/public/undian-music/a.mp3`, SB), false, "harus di folder event");
assert.equal(musikSah(`${SB}/storage/v1/object/public/undian-music/${EV}/a.html`, SB), false);
assert.equal(musikSah(`${SB}/storage/v1/object/public/display-assets/${EV}/a.mp3`, SB), false);
assert.equal(musikSah(`https://lain.com/a.mp3`, SB), false);
assert.equal(musikSah(`${ok}?x=1`, SB), false);

assert.equal(jenisMusik("audio/mpeg", "a.mp3"), "audio/mpeg");
assert.equal(jenisMusik("audio/mp3", "a.mp3"), "audio/mpeg");
assert.equal(jenisMusik("", "Lagu.M4A"), "audio/mp4");
assert.equal(jenisMusik("application/octet-stream", "a.wav"), "audio/wav");
assert.equal(jenisMusik("video/mp4", "a.mp4"), null);
assert.equal(jenisMusik("", "a.flac"), null);

assert.equal(namaMusik(ok), "drum-roll.mp3");
assert.equal(namaAman("Drum Roll (final) é.mp3", "mp3"), "Drum-Roll-final-e.mp3");
assert.equal(pathMusik(EV, "winner", 5, "ab-12-zz", "Tada!.mp3", "mp3"), `${EV}/winner_5_ab12_Tada.mp3`);
assert.equal(musikSah(`${awalanMusik(SB)}${pathMusik(EV, "winner", 5, "ab12", "Tada!.mp3", "mp3")}`, SB), true);
assert.equal(namaAman("....mp3", "mp3"), "music.mp3");

const semua = { enabled: true, waiting: "w", drawing: "d", winner: "v" };
assert.equal(laguSekarang(semua, "idle", false), "waiting");
assert.equal(laguSekarang(semua, "spinning", false), "drawing");
assert.equal(laguSekarang(semua, "revealed", false), "drawing", "animasi masih jalan sebelum nama tampil");
assert.equal(laguSekarang(semua, "revealed", true), "winner");
assert.equal(laguSekarang({ ...semua, enabled: false }, "idle", false), null);
assert.equal(laguSekarang({ ...semua, waiting: null }, "idle", false), null);

console.log("undian-musik ok");
