/**
 * Piksel terang sebuah KV, diukur di peramban saat diunggah (hero_bg_terang).
 *
 * kvGathering menakar bayangan di atas KV dari piksel ini: KV gelap seperti
 * ornamen navy-emas KSO tidak perlu dibayangi, KV terang dibayangi secukupnya
 * supaya teks putih tetap terbaca (QA #111 H1). Terang dikali alfa, supaya
 * bagian transparan tidak dihitung putih, lalu diratakan 3×3 dan diambil
 * persentil 99,9: kilau dan bintik kecil ikut terhitung (QA #111 R2-M2),
 * satu-dua piksel derau tidak. Hasil #rrggbbaa; null bila gambarnya tidak bisa
 * dibaca peramban (kvGathering lalu menganggapnya putih).
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
  const terang = new Float32Array(jumlah);
  for (let i = 0; i < jumlah; i += 1) {
    const o = i * 4;
    terang[i] = ((0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) * data[o + 3]) / 255;
  }
  // Rata-rata 3×3: piksel tunggal yang menyala tidak menentukan hasilnya.
  const rata = new Float32Array(jumlah);
  for (let y = 0; y < tinggi; y += 1) {
    for (let x = 0; x < lebar; x += 1) {
      let total = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= tinggi || xx < 0 || xx >= lebar) continue;
          total += terang[yy * lebar + xx];
          n += 1;
        }
      }
      rata[y * lebar + x] = total / n;
    }
  }
  const urut = Array.from(rata.keys()).sort((a, b) => rata[a] - rata[b]);
  const o = urut[Math.min(jumlah - 1, Math.floor(jumlah * 0.999))] * 4;
  return `#${[data[o], data[o + 1], data[o + 2], data[o + 3]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
