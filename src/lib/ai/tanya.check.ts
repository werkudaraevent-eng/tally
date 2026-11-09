import assert from "node:assert/strict";
import { potongTebal, promptKonteks, promptPanduan, saringJawaban, tokenMasukSetara, type HalamanTanya } from "./tanya.ts";

const halaman: HalamanTanya[] = [
  { href: "/admin/logistik", label: "Logistics", konteks: "Participants", uraian: "Hotels, rooms, vehicles." },
  { href: "/admin/agenda", label: "Agenda", konteks: "Setup", uraian: "Rundown." },
  { href: "/users", label: "Users & roles", konteks: "System", uraian: "Staff accounts." },
];

// Tautan: hanya halaman yang ada, tanpa garis miring akhir, tanpa dobel, paling banyak dua.
{
  const j = saringJawaban({
    jawaban: "  Ubah di **Logistics**.  ",
    langkah: ["Buka Logistics", "", "Edit room", "a", "b", "c", "d"],
    tautan: [
      { href: "https://contoh.test/admin", label: "Phishing" },
      { href: "/admin/logistik/", label: "Buka Logistics" },
      { href: "/admin/logistik", label: "Dobel" },
      { href: "/admin/rahasia", label: "Karangan" },
      { href: "/admin/agenda", label: "" },
      { href: "/users", label: "Buka Users" },
    ],
  }, halaman);
  assert.equal(j.jawaban, "Ubah di **Logistics**.");
  assert.deepEqual(j.langkah, ["Buka Logistics", "Edit room", "a", "b", "c"]);
  assert.deepEqual(j.tautan, [{ href: "/admin/logistik", label: "Buka Logistics" }, { href: "/admin/agenda", label: "Open Agenda" }]);
}

// Teks tebal dipotong tanpa HTML.
assert.deepEqual(potongTebal("Di **Logistics › Rooms**, lalu <b>x</b>"), [
  { tebal: false, teks: "Di " }, { tebal: true, teks: "Logistics › Rooms" }, { tebal: false, teks: ", lalu <b>x</b>" },
]);
assert.deepEqual(potongTebal("tanpa tebal"), [{ tebal: false, teks: "tanpa tebal" }]);

// Prompt: daftar halaman dan panduan masuk; konteks peran kustom disebut.
const p = promptPanduan("# Guide\nRooms are edited in Logistics.", halaman);
assert.ok(p.includes("- /admin/logistik | Participants › Logistics | Hotels, rooms, vehicles."));
assert.ok(p.endsWith("Rooms are edited in Logistics."));
assert.ok(promptKonteks({ nama: "QA", status: "draft" }, "custom").includes("custom role"));
assert.ok(promptKonteks(null, "admin").startsWith("No event is open."));

// Biaya: baca cache 0,1x, tulis cache 1,25x.
assert.equal(tokenMasukSetara({ input_tokens: 100, cache_read_input_tokens: 20000, cache_creation_input_tokens: 0 }), 2100);
assert.equal(tokenMasukSetara({ input_tokens: 100, cache_creation_input_tokens: 20000 }), 25100);

console.log("tanya ok");
