/**
 * Tagline gaya gathering boleh menandai kata dengan bintang
 * (`Liburan bareng, *tumbuh* bareng.`): hero mewarnainya dengan aksen. Admin
 * tidak mengetik bintangnya sendiri; kolom Highlight di CMS yang menulisnya.
 *
 * Aturan baca, satu untuk semua tempat (hero, kolom CMS, teks polos):
 * - `*` pembuka harus diikuti huruf bukan spasi, `*` penutup harus didahului
 *   huruf bukan spasi. Jadi bintang biasa seperti `Hotel 5* dan resort 4*`
 *   tetap bintang (QA #109 M3).
 * - `\*` adalah bintang biasa dan `\\` garis miring biasa. Kolom Highlight
 *   menulis bintang yang diketik admin dengan cara ini, supaya tanda kata
 *   tidak bergeser setelah dimuat ulang (QA #109 H1).
 *
 * Di tempat teks polos (judul tab, pratinjau tautan, berkas kalender, subjudul
 * portal) tandanya dibuang (QA #103 M2).
 */

export type PotonganJudul = { teks: string; sorot: boolean };

type Token = { teks: string; bintang: boolean };

function token(teks: string): Token[] {
  const hasil: Token[] = [];
  let polos = "";
  for (let i = 0; i < teks.length; i += 1) {
    const huruf = teks[i];
    if (huruf === "\\" && (teks[i + 1] === "*" || teks[i + 1] === "\\")) {
      polos += teks[i + 1];
      i += 1;
    } else if (huruf === "*") {
      if (polos) hasil.push({ teks: polos, bintang: false });
      polos = "";
      hasil.push({ teks: "*", bintang: true });
    } else {
      polos += huruf;
    }
  }
  if (polos) hasil.push({ teks: polos, bintang: false });
  return hasil;
}

export function pecahJudul(teks: string): PotonganJudul[] {
  const daftar = token(teks);
  const hasil: PotonganJudul[] = [];
  const tambah = (isi: string, sorot: boolean) => {
    if (!isi) return;
    const akhir = hasil[hasil.length - 1];
    if (akhir && akhir.sorot === sorot) akhir.teks += isi;
    else hasil.push({ teks: isi, sorot });
  };
  for (let i = 0; i < daftar.length; i += 1) {
    const sekarang = daftar[i];
    const isi = daftar[i + 1];
    const tutup = daftar[i + 2];
    const pasangan =
      sekarang.bintang &&
      isi &&
      !isi.bintang &&
      tutup?.bintang &&
      !/\n/.test(isi.teks) &&
      /^\S/.test(isi.teks) &&
      /\S$/.test(isi.teks);
    if (pasangan) {
      tambah(isi.teks, true);
      i += 2;
    } else {
      tambah(sekarang.teks, false);
    }
  }
  return hasil;
}

export function tanpaBintang(teks: string): string {
  return pecahJudul(teks)
    .map((potongan) => potongan.teks)
    .join("");
}

/** Bintang dan garis miring yang diketik admin, ditulis supaya terbaca apa adanya. */
export function lindungiBintang(teks: string): string {
  return teks.replace(/[\\*]/g, (huruf) => `\\${huruf}`);
}

/** Kebalikan pecahJudul untuk kolom Highlight: potongan menjadi teks tersimpan. */
export function susunJudul(potongan: PotonganJudul[]): string {
  return potongan.map((bagian) => (bagian.sorot ? `*${lindungiBintang(bagian.teks)}*` : lindungiBintang(bagian.teks))).join("");
}
