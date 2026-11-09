/**
 * Ambil semua PNG hari ini dari server lalu bagikan sekaligus (lembar berbagi
 * ponsel: WhatsApp, simpan ke Galeri), atau unduh satu per satu di laptop.
 */
export async function bagikanGambar(tanggal: string, jumlah: number): Promise<"bagikan" | "batal" | "unduh"> {
  const berkas = await Promise.all(
    Array.from({ length: jumlah }, async (_, i) => {
      const res = await fetch(`/api/admin/laporan/harian/gambar?tanggal=${tanggal}&n=${i + 1}`, { cache: "no-store" });
      if (!res.ok) throw new Error("gambar");
      return new File([await res.blob()], `highlight-${tanggal}-${i + 1}.png`, { type: "image/png" });
    }),
  );
  if (navigator.canShare?.({ files: berkas })) {
    try {
      await navigator.share({ files: berkas });
      return "bagikan";
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return "batal";
      throw error;
    }
  }
  for (const f of berkas) {
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await new Promise((r) => setTimeout(r, 250));
  }
  return "unduh";
}

/**
 * Download PDF: PNG yang sama dengan Share images, digambar ulang jadi JPEG
 * lalu dirangkai jadi satu PDF tegak 9:16 (seukuran layar ponsel), satu
 * gambar per halaman.
 */
export async function unduhPdf(tanggal: string, jumlah: number, nama: string): Promise<void> {
  const { pdfDariJpeg, ukuranJpeg } = await import("@/lib/laporan/pdf");
  const halaman = [];
  for (let i = 0; i < jumlah; i++) {
    const res = await fetch(`/api/admin/laporan/harian/gambar?tanggal=${tanggal}&n=${i + 1}`, { cache: "no-store" });
    if (!res.ok) throw new Error("gambar");
    const gambar = await createImageBitmap(await res.blob());
    const kanvas = document.createElement("canvas");
    kanvas.width = gambar.width;
    kanvas.height = gambar.height;
    kanvas.getContext("2d")!.drawImage(gambar, 0, 0);
    gambar.close();
    const blob = await new Promise<Blob | null>((r) => kanvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) throw new Error("jpeg");
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const u = ukuranJpeg(jpeg);
    if (!u) throw new Error("jpeg");
    halaman.push({ jpeg, lebarPx: u.lebar, tinggiPx: u.tinggi });
  }
  // 1080×1920 px jadi 405×720 pt: tegak 9:16, kira-kira ukuran layar ponsel besar.
  const pdf = pdfDariJpeg(halaman, { lebar: 405, tinggi: 720 });
  const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nama}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
