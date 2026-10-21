import assert from "node:assert/strict";
import { FOTO_OUTFIT_SALAH, FOTO_OUTFIT_TERIMA, fotoOutfitSah, pesanGagalFotoOutfit, unggahFotoOutfit } from "./outfit-foto.ts";

const MB = 1024 * 1024;

// Diperiksa sebelum diunggah: PNG, JPG atau WebP, 1 byte sampai 5 MB.
for (const type of FOTO_OUTFIT_TERIMA.split(",")) assert.equal(fotoOutfitSah({ type, size: 300_000 }), true, type);
assert.equal(fotoOutfitSah({ type: "image/png", size: 5 * MB }), true);
assert.equal(fotoOutfitSah({ type: "image/png", size: 5 * MB + 1 }), false);
assert.equal(fotoOutfitSah({ type: "image/png", size: 0 }), false);
assert.equal(fotoOutfitSah({ type: "image/gif", size: 1000 }), false);
assert.equal(fotoOutfitSah({ type: "image/heic", size: 1000 }), false);

// Kalimat gagal untuk admin: English, juga untuk 422 berbahasa Indonesia.
assert.equal(pesanGagalFotoOutfit(null, null), "Check your connection and try again.");
assert.equal(pesanGagalFotoOutfit(422, { error: { code: "VALIDATION_ERROR", details: { file: "Ukuran gambar maksimal 5 MB." } } }), FOTO_OUTFIT_SALAH);
assert.equal(pesanGagalFotoOutfit(422, { error: { details: { file: "Isi berkas bukan gambar PNG, JPG, atau WebP." } } }), FOTO_OUTFIT_SALAH);
assert.equal(pesanGagalFotoOutfit(422, null), FOTO_OUTFIT_SALAH);
// Batas piksel sudah English dan lebih tepat: diteruskan.
const piksel = "Images can be at most 4000×4000 px. This one is 6000×4000.";
assert.equal(pesanGagalFotoOutfit(422, { error: { details: { file: piksel } } }), piksel);
// Galat lain: rincian server, lalu pesannya, lalu kalimat umum.
assert.equal(pesanGagalFotoOutfit(500, { error: { message: "Something went wrong on the server. Try again.", details: { message: "Storage is full." } } }), "Storage is full.");
assert.equal(pesanGagalFotoOutfit(401, { error: { message: "You are signed out. Sign in again." } }), "You are signed out. Sign in again.");
assert.equal(pesanGagalFotoOutfit(500, { error: { message: " " } }), "The photo was not uploaded. Try again.");
assert.equal(pesanGagalFotoOutfit(502, "<html>"), "The photo was not uploaded. Try again.");

// Unggah dengan fetch tiruan: satu endpoint, alamat publik atau kalimat gagal.
const asli = globalThis.fetch;
const panggilan: string[] = [];
const tiru = (jawab: () => Promise<Response>) => {
  globalThis.fetch = (async (alamat: string | URL | Request, init?: RequestInit) => {
    panggilan.push(`${init?.method ?? "GET"} ${String(alamat)} ${init?.body instanceof FormData ? "form" : "?"}`);
    return jawab();
  }) as typeof fetch;
};
const foto = new File([new Uint8Array(2048)], "kaos.jpg", { type: "image/jpeg" });
try {
  tiru(async () => Response.json({ url: "https://x.supabase.co/storage/v1/object/public/k.jpg" }));
  assert.deepEqual(await unggahFotoOutfit(foto), { url: "https://x.supabase.co/storage/v1/object/public/k.jpg" });
  assert.deepEqual(panggilan, ["POST /api/display/background form"]);

  tiru(async () => Response.json({ error: { code: "VALIDATION_ERROR", details: { file: "Format harus PNG, JPG, atau WebP." } } }, { status: 422 }));
  assert.deepEqual(await unggahFotoOutfit(foto), { galat: FOTO_OUTFIT_SALAH });

  tiru(async () => new Response("Bad gateway", { status: 502 }));
  assert.deepEqual(await unggahFotoOutfit(foto), { galat: "The photo was not uploaded. Try again." });

  tiru(async () => Response.json({}));
  assert.deepEqual(await unggahFotoOutfit(foto), { galat: "The photo was not uploaded. Try again." });

  tiru(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(await unggahFotoOutfit(foto), { galat: "Check your connection and try again." });

  // Berkas yang salah tidak dikirim sama sekali.
  panggilan.length = 0;
  assert.deepEqual(await unggahFotoOutfit(new File(["GIF89a"], "a.gif", { type: "image/gif" })), { galat: FOTO_OUTFIT_SALAH });
  assert.deepEqual(panggilan, []);
} finally {
  globalThis.fetch = asli;
}

console.log("outfit-foto: ok");
