/**
 * Gambar email yang disiapkan di peramban sebelum diunggah.
 *
 * KV acara bisa berukuran megabita (KV ILO 2,4 MB PNG), terlalu berat untuk
 * email. Semua gambar email dibuat ulang di canvas: dikecilkan, diratakan ke
 * latar putih (tidak ada transparansi yang berubah gelap di mode gelap), lalu
 * disimpan sebagai JPEG. Diunggah lewat endpoint gambar yang sudah ada, folder
 * "email".
 */

function muat(url: string): Promise<HTMLImageElement> {
  return new Promise((selesai, gagal) => {
    const img = new Image();
    // Storage Supabase publik mengizinkan CORS (*); tanpa ini canvas "tercemar" dan tidak bisa diekspor.
    img.crossOrigin = "anonymous";
    img.onload = () => selesai(img);
    img.onerror = () => gagal(new Error(`Couldn't load image: ${url}`));
    img.src = url;
  });
}

function blob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((selesai, gagal) => canvas.toBlob((hasil) => (hasil ? selesai(hasil) : gagal(new Error("Couldn't export the canvas."))), type, quality));
}

export async function unggah(berkas: Blob, nama: string): Promise<string> {
  const form = new FormData();
  form.append("file", new File([berkas], nama, { type: berkas.type }));
  form.append("kind", "email");
  const response = await fetch("/api/display/background", { method: "POST", body: form });
  if (!response.ok) throw new Error("Image upload failed.");
  return ((await response.json()) as { url: string }).url;
}

/** Apakah logo punya transparansi; logo tanpa alfa tidak bisa diputihkan (jadi kotak putih). */
function punyaAlfa(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 16) if (data[i] < 250) return true;
  return false;
}

/** Logo putih di atas transparan, atau null bila logonya tidak punya alfa. */
async function logoPutih(url: string, tinggi: number): Promise<HTMLCanvasElement | null> {
  const logo = await muat(url);
  const lebar = Math.round((logo.naturalWidth * tinggi) / logo.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = lebar;
  canvas.height = tinggi;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(logo, 0, 0, lebar, tinggi);
  if (!punyaAlfa(ctx, lebar, tinggi)) return null;
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, lebar, tinggi);
  return canvas;
}

/**
 * Kepala Banner KV: potongan tengah KV 1200x400 dengan logo putih di kiri.
 * Satu gambar utuh, bukan gambar latar + teks: Outlook desktop mengabaikan
 * gambar latar. `logoTerang` (Forum logo_light_url) dipakai apa adanya.
 */
export async function buatKepala(kvUrl: string, logo: { url: string; terang: boolean } | null): Promise<Blob> {
  const kv = await muat(kvUrl);
  const W = 1200;
  const H = 400;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const skala = Math.max(W / kv.naturalWidth, H / kv.naturalHeight);
  const w = kv.naturalWidth * skala;
  const h = kv.naturalHeight * skala;
  ctx.drawImage(kv, (W - w) / 2, (H - h) / 2, w, h);
  if (logo) {
    const tinggi = 120;
    const gambar = logo.terang ? await muat(logo.url) : await logoPutih(logo.url, tinggi);
    if (gambar) {
      const lebarAsli = gambar instanceof HTMLImageElement ? (gambar.naturalWidth * tinggi) / gambar.naturalHeight : gambar.width;
      const lebar = Math.min(lebarAsli, W - 144);
      ctx.drawImage(gambar, 72, (H - tinggi) / 2, lebar, (tinggi * lebar) / lebarAsli);
    }
  }
  return blob(canvas, "image/jpeg", 0.82);
}

/** Logo putih (PNG transparan, tinggi 72 = 2x ukuran tampil) untuk Pita warna. */
export async function buatLogoPutih(url: string): Promise<Blob | null> {
  const canvas = await logoPutih(url, 72);
  return canvas ? blob(canvas, "image/png") : null;
}

/** Gambar unggahan panitia: lebar paling banyak 1200, diratakan ke putih, JPEG. */
export async function siapkanGambar(berkas: File): Promise<{ blob: Blob; lebar: number; tinggi: number }> {
  const url = URL.createObjectURL(berkas);
  try {
    const img = await muat(url);
    const lebar = Math.min(1200, img.naturalWidth);
    const tinggi = Math.round((img.naturalHeight * lebar) / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = lebar;
    canvas.height = tinggi;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, lebar, tinggi);
    ctx.drawImage(img, 0, 0, lebar, tinggi);
    return { blob: await blob(canvas, "image/jpeg", 0.85), lebar, tinggi };
  } finally {
    URL.revokeObjectURL(url);
  }
}
