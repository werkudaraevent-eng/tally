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
