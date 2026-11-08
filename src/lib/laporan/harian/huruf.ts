/**
 * Huruf untuk gambar PNG (next/og). next/og hanya membaca TTF/OTF/WOFF,
 * sedangkan huruf di public/fonts/v1 berbentuk WOFF2. Jadi berkas TTF per
 * bobot diambil dari Google Fonts saat gambar pertama dibuat, lalu disimpan
 * di memori server. Gagal mengambil = gambar tetap jadi dengan huruf bawaan
 * next/og, bukan galat.
 */
type Font = { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: "normal" };

const simpanan = new Map<string, Promise<Font[]>>();

async function ambil(nama: string, bobot: Array<500 | 700 | 800>): Promise<Font[]> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(nama).replace(/%20/g, "+")}:wght@${bobot.join(";")}`;
  const css = await fetch(url, { signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.text() : ""));
  const hasil: Font[] = [];
  for (const blok of css.split("@font-face").slice(1)) {
    const w = Number(/font-weight:\s*(\d+)/.exec(blok)?.[1]);
    const src = /src:\s*url\(([^)]+\.ttf)\)/.exec(blok)?.[1];
    if (!src || !bobot.includes(w as 500)) continue;
    const data = await fetch(src, { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.arrayBuffer() : null));
    if (data) hasil.push({ name: nama, data, weight: w as 500 | 700 | 800, style: "normal" });
  }
  return hasil;
}

export function hurufGambar(judul: string, isi: string): Promise<Font[]> {
  const kunci = `${judul}|${isi}`;
  let janji = simpanan.get(kunci);
  if (!janji) {
    const semua = judul === isi ? [ambil(judul, [500, 700, 800])] : [ambil(judul, [800]), ambil(isi, [500, 700, 800])];
    janji = Promise.all(semua).then((f) => f.flat()).catch(() => []);
    // Gagal tidak disimpan, supaya permintaan berikutnya mencoba lagi.
    void janji.then((f) => { if (!f.length) simpanan.delete(kunci); });
    simpanan.set(kunci, janji);
  }
  return janji;
}
