import assert from "node:assert/strict";
import { adaLogistikTampil, bagianTampil, bagianTersembunyi, bedaBagian, saringBagian, terapkanBagian } from "./bagian-tampil.ts";

// Acara lama: tanpa hide_logistics, semua bagian mengikuti sakelar induk.
assert.equal(bagianTampil({ show_logistics: true }, "vehicles"), true);
assert.equal(bagianTampil({ show_logistics: false }, "vehicles"), false);
assert.equal(bagianTampil(undefined, "rooms"), false);
assert.equal(bagianTampil({ show_logistics: true, hide_logistics: ["vehicles"] }, "vehicles"), false);
assert.equal(bagianTampil({ show_logistics: true, hide_logistics: ["vehicles"] }, "rooms"), true);

assert.deepEqual([...bagianTersembunyi({ show_logistics: true, hide_logistics: ["trains", "x", "items"] })], ["trains", "items"]);
assert.deepEqual([...bagianTersembunyi({ hide_logistics: null })], []);

assert.equal(adaLogistikTampil({ show_logistics: true, hide_logistics: ["rooms", "vehicles", "trains"] }), true);
assert.equal(adaLogistikTampil({ show_logistics: true, hide_logistics: ["rooms", "vehicles", "trains", "items"] }), false);
assert.equal(adaLogistikTampil({ show_logistics: false }), false);

const data = { lodging: { a: 1 }, stays: [1], transport: { trips: [] }, items: [1], trains: [1], buses: [1] };
assert.equal(saringBagian(data, new Set()), data);
assert.deepEqual(saringBagian(data, new Set(["vehicles"] as const)), { ...data, transport: null, buses: [] });
assert.deepEqual(saringBagian(data, new Set(["rooms", "trains", "items"] as const)), { ...data, lodging: null, stays: [], trains: [], items: [] });

// QA #331 M1: tab basi hanya mengirim bagian yang diubahnya.
assert.deepEqual(terapkanBagian(["vehicles", "trains"], { vehicles: true }), ["trains"]);
assert.deepEqual(terapkanBagian(["vehicles"], { trains: false }), ["vehicles", "trains"]);
assert.deepEqual(terapkanBagian(undefined, { rooms: false, items: true }), ["rooms"]);
assert.deepEqual(terapkanBagian(["items", "rooms"], {}), ["rooms", "items"]);
assert.deepEqual(bedaBagian(["vehicles"], ["vehicles", "trains"]), { trains: false });
assert.deepEqual(bedaBagian(["vehicles"], []), { vehicles: true });
assert.deepEqual(bedaBagian(undefined, undefined), {});

console.log("bagian-tampil ok");
