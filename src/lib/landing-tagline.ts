/**
 * Tagline gaya gathering boleh menandai satu kata dengan bintang
 * (`Liburan bareng, *tumbuh* bareng.`): hero mewarnainya dengan aksen.
 * Di tempat teks polos (judul tab, pratinjau tautan, berkas kalender, subjudul
 * portal) bintangnya dibuang (QA #103 M2).
 */
export function tanpaBintang(teks: string): string {
  return teks.replace(/\*([^*\n]+)\*/g, "$1");
}
