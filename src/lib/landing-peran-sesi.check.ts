import assert from "node:assert/strict";
import { aturUrutanSesi, gabungEntriSesi, isiPeranSesiEn, kunciPeran, pembicaraDiSesi, pembicaraSesiLama, peranSesiUntukEn, saranPeran, ubahPeranEntri } from "./landing-peran-sesi.ts";
import type { LandingSpeaker } from "./domain.ts";

// Kunci: huruf besar-kecil, spasi ganda, dan spasi di ujung tidak membedakan peran.
assert.equal(kunciPeran(" Moderator  "), "moderator");
assert.equal(kunciPeran("Opening   Remarks"), "opening remarks");
assert.equal(kunciPeran(undefined), "");

const andini: LandingSpeaker = { name: "Andini", role: "Moderator" };
const ilo: LandingSpeaker = { name: "ILO", role: "Speaker", session_refs: [{ id: 2, label: "Session 2" }, { id: 5, label: "Breakout Session 1", role: "Moderator", en: { role: "Moderator" } }] };
const nancy: LandingSpeaker = { name: "Nancy", role: "Speaker", session_refs: [{ id: 5, label: "Breakout Session 1" }] };

// Tanpa peran sesi: objek yang sama, urutan sama (data lama tampil persis seperti sebelumnya).
const sesi2 = pembicaraDiSesi([nancy, ilo], 2);
assert.equal(sesi2[0], nancy);
assert.equal(sesi2[1], ilo);

// Dengan peran sesi: salinan berperan Moderator, dan moderator lebih dulu.
const breakout = pembicaraDiSesi([nancy, ilo], 5);
assert.deepEqual(breakout.map((s) => [s.name, s.role]), [["ILO", "Moderator"], ["Nancy", "Speaker"]]);
assert.equal(ilo.role, "Speaker", "aslinya tidak diubah");

// Moderator dari peran utama juga lebih dulu; urutan editor tetap di dalam kelompok.
assert.deepEqual(pembicaraDiSesi([nancy, andini, ilo], 9).map((s) => s.name), ["Andini", "Nancy", "ILO"]);

// Peran sesi "Speaker" pada moderator utama: tidak lagi moderator di sesi itu.
const mc: LandingSpeaker = { name: "MC", role: "Moderator", session_refs: [{ id: 7, label: "Panel", role: "Speaker" }] };
assert.deepEqual(pembicaraDiSesi([nancy, mc], 7).map((s) => [s.name, s.role]), [["Nancy", "Speaker"], ["MC", "Speaker"]]);

// Saran: dari peran utama dan peran sesi, digabung per kunci, paling banyak dipakai dulu.
const saran = saranPeran([andini, ilo, nancy, { name: "Budi", role: "moderator " }]);
assert.deepEqual(saran.map((s) => [s.teks, s.pembicara]), [["Moderator", 3], ["Speaker", 2]]);
assert.equal(saran[0].en, "Moderator", "versi English dibawa untuk diisikan saat dipilih");
// Nama hanya bila satu orang.
assert.equal(saranPeran([{ name: "Sari", role: "Penanggap" }])[0].nama, "Sari");
// Nilai kolom sendiri tidak disarankan, juga bila beda huruf.
assert.deepEqual(saranPeran([andini, nancy], "MODERATOR").map((s) => s.teks), ["Speaker"]);
// Acara tanpa peran: kosong.
assert.deepEqual(saranPeran([{ name: "X" }]), []);
// Ejaan terbanyak menang; seri dimenangkan yang pertama.
assert.equal(saranPeran([{ name: "A", role: "mc" }, { name: "B", role: "MC" }, { name: "C", role: "MC" }])[0].teks, "MC");
assert.equal(saranPeran([{ name: "A", role: "mc" }, { name: "B", role: "MC" }])[0].teks, "mc");

// Tab EN: satu kolom per peran sesi berbeda; nilai hanya bila semua entri sepakat.
const dua: LandingSpeaker = { name: "Dua", session_refs: [{ id: 6, label: "Breakout Session 2", role: "moderator" }] };
assert.deepEqual(peranSesiUntukEn([ilo, nancy, dua]), [{ kunci: "moderator", teks: "Moderator", en: undefined, sesi: ["Breakout Session 1", "Breakout Session 2"] }]);
const terisi = isiPeranSesiEn([ilo, nancy, dua], "moderator", "Moderator");
assert.equal(peranSesiUntukEn(terisi)[0].en, "Moderator");
assert.equal(terisi[1], nancy, "pembicara tanpa peran itu tidak disalin");
assert.equal(terisi[0].session_refs![0], ilo.session_refs![0], "entri lain tidak disentuh");

// Mencentang sesi lain tidak menghapus peran sesi yang sudah ada.
const lama = ilo.session_refs!;
const baru = gabungEntriSesi([{ id: 2, label: "Session 2" }, { id: 4, label: "Session 3" }, { id: 5, label: "Breakout Session 1" }], lama);
assert.deepEqual(baru[2], { id: 5, label: "Breakout Session 1", role: "Moderator", en: { role: "Moderator" } });
assert.deepEqual(baru[1], { id: 4, label: "Session 3" });
// Label terbaru dari rundown menang atas label tersimpan.
assert.equal(gabungEntriSesi([{ id: 5, label: "Breakout 1" }], lama)[0].label, "Breakout 1");

// /en: urutan moderator dari peran Indonesia (role_id), bukan teks English.
const en1: LandingSpeaker = { name: "A", role: "Speaker", role_id: "Pembicara" };
const en2: LandingSpeaker = { name: "B", role: "Speaker", role_id: "Pembicara", session_refs: [{ id: 5, label: "B", role: "Facilitator", role_id: "Moderator" }] };
assert.deepEqual(pembicaraDiSesi([en1, en2], 5).map((s) => [s.name, s.role]), [["B", "Facilitator"], ["A", "Speaker"]]);
const en3: LandingSpeaker = { name: "C", role: "Moderator", role_id: "Pemandu" };
assert.deepEqual(pembicaraDiSesi([en1, en3], 5).map((s) => s.name), ["A", "C"], "English 'Moderator' tidak menggeser urutan");

// Tab sesi teks lama: moderator juga lebih dulu.
assert.deepEqual(pembicaraSesiLama([nancy, andini]).map((s) => s.name), ["Andini", "Nancy"]);

// Mengetik peran lain membuang English lama; mengubah huruf saja tidak.
const entri = { id: 5, label: "B", role: "Moderator", en: { role: "Moderator" } };
assert.deepEqual(ubahPeranEntri(entri, "Panelis"), { id: 5, label: "B", role: "Panelis", en: {} });
assert.deepEqual(ubahPeranEntri(entri, "moderator"), { id: 5, label: "B", role: "moderator", en: { role: "Moderator" } });
// Saran yang dipilih membawa English-nya; English yang masih cocok tidak ditimpa.
assert.deepEqual(ubahPeranEntri({ id: 1, label: "A" }, "Moderator", "Moderator (EN)"), { id: 1, label: "A", role: "Moderator", en: { role: "Moderator (EN)" } });
assert.equal(ubahPeranEntri({ id: 1, label: "A", role: "Moderator", en: { role: "Chair" } }, "Moderator", "Moderator (EN)").en?.role, "Chair");
assert.equal(ubahPeranEntri({ id: 1, label: "A", role: "Panelis", en: { role: "Panellist" } }, "Moderator", "Moderator (EN)").en?.role, "Moderator (EN)");
// Tanpa English sama sekali: tidak menambah objek en.
assert.deepEqual(ubahPeranEntri({ id: 1, label: "A" }, "MC"), { id: 1, label: "A", role: "MC" });

// Urutan yang diatur admin (pos) mengalahkan urutan editor dan moderator lebih dulu.
const u1: LandingSpeaker = { name: "U1", role: "Moderator", session_refs: [{ id: 3, label: "S" }, { id: 4, label: "T" }] };
const u2: LandingSpeaker = { name: "U2", session_refs: [{ id: 3, label: "S" }, { id: 4, label: "T" }] };
const u3: LandingSpeaker = { name: "U3", session_refs: [{ id: 3, label: "S" }] };
assert.deepEqual(pembicaraDiSesi([u2, u3, u1], 3).map((s) => s.name), ["U1", "U2", "U3"], "tanpa pos: moderator lebih dulu");
const diatur = aturUrutanSesi([u1, u2, u3], 3, [u3, u2, u1]);
assert.deepEqual(pembicaraDiSesi(diatur, 3).map((s) => s.name), ["U3", "U2", "U1"]);
// Sesi lain tidak berubah.
assert.deepEqual(pembicaraDiSesi(diatur.slice(0, 2), 4).map((s) => s.name), ["U1", "U2"]);
assert.equal(diatur[0]!.session_refs!.find((ref) => ref.id === 4)!.pos, undefined);
// Pembicara baru di sesi itu (tanpa pos) menyusul di kanan.
const u4: LandingSpeaker = { name: "U4", session_refs: [{ id: 3, label: "S" }] };
assert.deepEqual(pembicaraDiSesi([u4, ...diatur], 3).map((s) => s.name), ["U3", "U2", "U1", "U4"]);
// Peran sesi tetap ditulis pada salinan yang diurutkan.
const berperan = aturUrutanSesi([{ ...u2, session_refs: [{ id: 3, label: "S", role: "Panelis" }] }, u3], 3, []);
assert.deepEqual(pembicaraDiSesi(berperan, 3).map((s) => s.role), ["Panelis", undefined]);

console.log("landing-peran-sesi: ok");
