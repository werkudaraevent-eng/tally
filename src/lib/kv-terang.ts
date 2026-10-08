/**
 * Piksel terang sebuah KV, diukur di peramban saat diunggah (hero_bg_terang).
 *
 * kvGathering menakar bayangan di atas KV dari piksel ini: KV gelap seperti
 * ornamen navy-emas KSO tidak perlu dibayangi, KV terang dibayangi secukupnya
 * supaya teks putih tetap terbaca (QA #111 H1). Persentil 98 menurut terang
 * yang sudah dikali alfa, supaya bintik kecil tidak menggelapkan seluruh hero
 * dan bagian transparan tidak dihitung putih. Hasil #rrggbbaa; null bila
 * gambarnya tidak bisa dibaca peramban (kvGathering lalu menganggapnya putih).
 */
export async function ukurTerangKv(berkas: Blob): Promise<string | null> {
  const gambar = await createImageBitmap(berkas).catch(() => null);
  if (!gambar) return null;
  const lebar = Math.min(640, gambar.width);
  const tinggi = Math.max(1, Math.round((gambar.height * lebar) / gambar.width));
  const kanvas = document.createElement("canvas");
  kanvas.width = lebar;
  kanvas.height = tinggi;
  const konteks = kanvas.getContext("2d", { willReadFrequently: true });
  if (!konteks) {
    gambar.close();
    return null;
  }
  konteks.drawImage(gambar, 0, 0, lebar, tinggi);
  gambar.close();
  const { data } = konteks.getImageData(0, 0, lebar, tinggi);
  const jumlah = lebar * tinggi;
  const nilai = new Float32Array(jumlah);
  for (let i = 0; i < jumlah; i += 1) {
    const o = i * 4;
    nilai[i] = ((0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) * data[o + 3]) / 255;
  }
  const urut = Array.from(nilai.keys()).sort((a, b) => nilai[a] - nilai[b]);
  const o = urut[Math.min(jumlah - 1, Math.floor(jumlah * 0.98))] * 4;
  return `#${[data[o], data[o + 1], data[o + 2], data[o + 3]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
