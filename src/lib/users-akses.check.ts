import assert from "node:assert/strict";
import { acaraTerlihat, aksesPerUser, type AcaraRingkas, type BarisAkses } from "./users-akses.ts";

const acara: AcaraRingkas[] = [
  { id: "a", slug: "acara-a", name: "Acara A" },
  { id: "b", slug: "acara-b-rahasia", name: "Acara B" },
];
const akses: BarisAkses[] = [
  { user_id: "admin-a", event_id: "a", role: "admin" },
  { user_id: "admin-b", event_id: "b", role: "admin" },
  { user_id: "kasir", event_id: "a", role: "cashier" },
  { user_id: "kasir", event_id: "b", role: "cashier" },
];

// Admin acara A tidak melihat acara B sama sekali: tidak slug-nya, tidak panitianya.
const dilihatA = aksesPerUser({ id: "admin-a", role: "admin" }, akses, acara);
assert.deepEqual([...dilihatA.keys()].sort(), ["admin-a", "kasir"]);
assert.deepEqual(dilihatA.get("kasir")?.map((e) => e.id), ["a"]);
assert.equal(JSON.stringify([...dilihatA.values()]).includes("acara-b-rahasia"), false);

// Admin tanpa acara tidak melihat akses siapa pun.
assert.equal(aksesPerUser({ id: "baru", role: "admin" }, akses, acara).size, 0);

// Super admin melihat semuanya, terurut per nama acara.
const dilihatSuper = aksesPerUser({ id: "pemilik", role: "super_admin" }, akses, acara);
assert.deepEqual(dilihatSuper.get("kasir")?.map((e) => `${e.name}:${e.role}`), ["Acara A:cashier", "Acara B:cashier"]);
assert.equal(acaraTerlihat({ id: "pemilik", role: "super_admin" }, []), "semua");

// Baris yang acaranya tidak ada di daftar (terhapus) dilewati.
assert.equal(aksesPerUser({ id: "x", role: "super_admin" }, [{ user_id: "u", event_id: "hilang", role: "admin" }], acara).size, 0);

console.log("users-akses: ok");
