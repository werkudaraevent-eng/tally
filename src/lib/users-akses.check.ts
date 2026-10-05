import assert from "node:assert/strict";
import { acaraTerlihat, aksesPerUser, akunTerlihat, bolehResetPin, periksaAkses, type AcaraRingkas, type BarisAkses } from "./users-akses.ts";

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

// Daftar akun: admin A hanya melihat akun yang berbagi acara dengannya, tanpa
// super admin dan tanpa admin klien lain.
const akun = [
  { id: "admin-a", role: "admin" },
  { id: "admin-b", role: "admin" },
  { id: "kasir", role: "cashier" },
  { id: "booth-b", role: "booth" },
  { id: "pemilik", role: "super_admin" },
];
const aksesAkun: BarisAkses[] = [...akses, { user_id: "booth-b", event_id: "b", role: "booth" }, { user_id: "pemilik", event_id: "a", role: "admin" }];
assert.deepEqual(akunTerlihat({ id: "admin-a", role: "admin" }, aksesAkun, akun).map((u) => u.id), ["admin-a", "kasir"]);
assert.deepEqual(akunTerlihat({ id: "baru", role: "admin" }, aksesAkun, akun), []);
assert.equal(akunTerlihat({ id: "pemilik", role: "super_admin" }, aksesAkun, akun).length, akun.length);

// Reset PIN: hanya akun di acara tempat pemanggil berperan admin.
assert.equal(bolehResetPin("admin-a", "kasir", aksesAkun), true);
assert.equal(bolehResetPin("admin-a", "booth-b", aksesAkun), false);
assert.equal(bolehResetPin("kasir", "admin-a", aksesAkun), false);

// Aturan akses akun.
assert.equal(periksaAkses("super_admin", []), null);
assert.notEqual(periksaAkses("super_admin", [{ event_id: "a", booth_id: null }]), null);
assert.equal(periksaAkses("cashier", []), "Add at least one event.");
assert.equal(periksaAkses("cashier", [{ event_id: "a", booth_id: null }]), null);
assert.notEqual(periksaAkses("admin", [{ event_id: "a", booth_id: null }, { event_id: "a", booth_id: null }]), null);
assert.equal(periksaAkses("booth", [{ event_id: "a", booth_id: 3 }, { event_id: "b", booth_id: null }]), "Choose a booth for each event.");
assert.equal(periksaAkses("booth", [{ event_id: "a", booth_id: 3 }]), null);


// Booth dan tanda arsip ikut diteruskan ke layar.
const denganBooth = aksesPerUser({ id: "x", role: "super_admin" }, [{ user_id: "b", event_id: "a", role: "booth", booth_id: 3 }], [{ ...acara[0], archived: true }]);
assert.deepEqual(denganBooth.get("b")?.map((e) => [e.booth_id, e.archived]), [[3, true]]);

console.log("users-akses: ok");
