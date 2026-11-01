import type { LandingSpeaker } from "./domain";

/**
 * Impor daftar pembicara dari CSV (atau sel yang ditempel dari Excel/Sheets).
 *
 * Murni data: halaman Speakers membaca berkasnya, memanggil ini untuk
 * pratinjau, lalu menyimpan `hasil` lewat PATCH yang sama dengan Save speaker.
 *
 * Aturan:
 * - Baris dicocokkan ke pembicara yang ada lewat nama (huruf besar/kecil dan
 *   spasi diabaikan). Cocok: hanya sel yang berisi menimpa; sel kosong tidak
 *   menghapus apa pun. Tidak cocok: pembicara baru di akhir daftar.
 * - Sesi ditautkan ke baris Agenda bila namanya sama dengan label pendek
 *   ("Sesi 1"), judul utuh, atau awal judul, dan hanya bila tepat satu baris
 *   cocok. Tautan lama tidak dilepas.
 * - Sel yang tidak sah (foto/tautan bukan https, sesi tidak ditemukan)
 *   dilewati dan disebut di pratinjau; barisnya tetap masuk.
 */

export type KolomImporPembicara = "name" | "title" | "company" | "role" | "photo_url" | "bio" | "link" | "session" | "featured";

const ALIAS: Record<KolomImporPembicara, string[]> = {
  name: ["name", "nama", "speaker", "pembicara", "full name", "nama lengkap"],
  title: ["job title", "title", "jabatan", "posisi", "position"],
  company: ["organisation", "organization", "company", "instansi", "lembaga", "perusahaan", "organisasi"],
  role: ["role", "main role", "peran"],
  photo_url: ["photo", "photo url", "foto", "url foto", "image", "gambar"],
  bio: ["bio", "biography", "profile", "profil", "biografi"],
  link: ["profile link", "link", "linkedin", "url", "website", "tautan"],
  session: ["session", "sessions", "sesi", "agenda", "agenda item"],
  featured: ["highlights", "highlight", "featured", "sorotan", "keynote"],
};

const normal = (teks: string) => teks.trim().toLowerCase().replace(/[_\s]+/g, " ");

/** Kolom dikenali per indeks header; header lain dilaporkan, tidak dibaca. */
export function petaHeader(header: string[]): { peta: Map<number, KolomImporPembicara>; takDikenal: string[] } {
  const peta = new Map<number, KolomImporPembicara>();
  const takDikenal: string[] = [];
  const terpakai = new Set<KolomImporPembicara>();
  header.forEach((judul, indeks) => {
    const kunci = normal(judul);
    if (!kunci) return;
    const kolom = (Object.keys(ALIAS) as KolomImporPembicara[]).find((nama) => ALIAS[nama].includes(kunci));
    if (kolom && !terpakai.has(kolom)) {
      peta.set(indeks, kolom);
      terpakai.add(kolom);
    } else takDikenal.push(judul.trim());
  });
  return { peta, takDikenal };
}

const YA = /^(ya|yes|y|1|true|x|✓)$/i;
const HTTPS = /^https:\/\/[^\s"'<>\\]+\.[^\s"'<>\\]+$/i;
const FOTO = /^https?:\/\/[^\s"'<>\\]+$/i;
const kunciNama = (nama: string) => nama.trim().replace(/\s+/g, " ").toLowerCase();

export type CatatanImpor = { baris: number; teks: string };

export type HasilImporPembicara = {
  hasil: LandingSpeaker[];
  baru: number;
  diperbarui: number;
  /** Baris yang tidak masuk sama sekali (tanpa nama, melewati batas). */
  dilewati: CatatanImpor[];
  /** Sel yang tidak dipakai, barisnya tetap masuk. */
  peringatan: CatatanImpor[];
  kolom: KolomImporPembicara[];
  takDikenal: string[];
};

export function imporPembicara(
  matrix: string[][],
  daftar: LandingSpeaker[],
  agenda: { id: number; title: string }[],
  opsi: { maks: number; sorotanMaks: number; labelSesi: (judul: string) => string },
): HasilImporPembicara | { galat: string } {
  const isi = matrix.filter((row) => row.some((sel) => sel.trim()));
  if (isi.length < 2) return { galat: "The file needs a header row and at least one speaker." };
  const { peta, takDikenal } = petaHeader(isi[0]!);
  if (![...peta.values()].includes("name")) return { galat: "No Name column found. The first row must hold column names, e.g. Name, Job title, Organisation." };

  const hasil = daftar.map((speaker) => ({ ...speaker }));
  const indeksNama = new Map<string, number>();
  hasil.forEach((speaker, i) => {
    const kunci = kunciNama(speaker.name ?? "");
    if (kunci && !indeksNama.has(kunci)) indeksNama.set(kunci, i);
  });
  const diubah = new Set<number>();
  const dibuat = new Set<number>();
  const dilewati: CatatanImpor[] = [];
  const peringatan: CatatanImpor[] = [];
  let sorotan = hasil.filter((speaker) => speaker.featured).length;

  const cariSesi = (nama: string) => {
    const kunci = normal(nama);
    const cocok = agenda.filter((item) => {
      const judul = normal(item.title);
      return normal(opsi.labelSesi(item.title)) === kunci || judul === kunci || judul.startsWith(`${kunci}.`) || judul.startsWith(`${kunci}:`);
    });
    return cocok.length === 1 ? cocok[0]! : null;
  };

  isi.slice(1).forEach((row, urut) => {
    const nomor = urut + 2;
    const sel = new Map<KolomImporPembicara, string>();
    peta.forEach((kolom, indeks) => {
      const nilai = (row[indeks] ?? "").trim();
      if (nilai) sel.set(kolom, nilai);
    });
    const nama = sel.get("name")?.replace(/\s+/g, " ").slice(0, 120);
    if (!nama) {
      dilewati.push({ baris: nomor, teks: "No name" });
      return;
    }
    let posisi = indeksNama.get(kunciNama(nama));
    if (posisi === undefined) {
      if (hasil.length >= opsi.maks) {
        dilewati.push({ baris: nomor, teks: `${nama}: the event already has ${opsi.maks} speakers` });
        return;
      }
      hasil.push({ name: nama });
      posisi = hasil.length - 1;
      indeksNama.set(kunciNama(nama), posisi);
      dibuat.add(posisi);
    }
    const orang = hasil[posisi]!;
    const sebelum = JSON.stringify(orang);
    const teks = (kolom: KolomImporPembicara, maks: number) => {
      const nilai = sel.get(kolom);
      if (!nilai) return;
      if (nilai.length > maks) peringatan.push({ baris: nomor, teks: `${nama}: ${kolom === "bio" ? "bio" : kolom} cut to ${maks} characters` });
      (orang as Record<string, unknown>)[kolom] = nilai.slice(0, maks);
    };
    teks("title", 200);
    teks("company", 120);
    teks("role", 60);
    const bio = sel.get("bio");
    if (bio) {
      // Sel Excel memakai baris baru biasa; baris kosong tetap pemisah paragraf.
      if (bio.length > 1200) peringatan.push({ baris: nomor, teks: `${nama}: bio cut to 1,200 characters` });
      orang.bio = bio.replace(/\r/g, "").slice(0, 1200);
    }
    const foto = sel.get("photo_url");
    if (foto) {
      if (FOTO.test(foto) && foto.length <= 600) orang.photo_url = foto;
      else peringatan.push({ baris: nomor, teks: `${nama}: photo is not an http(s) address, skipped` });
    }
    const tautan = sel.get("link");
    if (tautan) {
      if (HTTPS.test(tautan) && tautan.length <= 600) orang.link = tautan;
      else peringatan.push({ baris: nomor, teks: `${nama}: profile link must start with https://, skipped` });
    }
    const sorot = sel.get("featured");
    if (sorot && YA.test(sorot) && !orang.featured) {
      if (sorotan >= opsi.sorotanMaks) peringatan.push({ baris: nomor, teks: `${nama}: Highlights already has ${opsi.sorotanMaks} speakers, not added` });
      else {
        orang.featured = true;
        sorotan += 1;
      }
    }
    const sesi = sel.get("session");
    if (sesi) {
      const refs = [...(orang.session_refs ?? [])];
      for (const bagian of sesi.split(/[|;\n]/).map((item) => item.trim()).filter(Boolean)) {
        const item = cariSesi(bagian);
        if (!item) {
          peringatan.push({ baris: nomor, teks: `${nama}: session "${bagian}" not found in Agenda` });
          continue;
        }
        if (!refs.some((ref) => ref.id === item.id)) refs.push({ id: item.id, label: opsi.labelSesi(item.title) });
      }
      if (refs.length !== (orang.session_refs ?? []).length) orang.session_refs = refs.slice(0, 40);
    }
    if (!dibuat.has(posisi) && JSON.stringify(orang) !== sebelum) diubah.add(posisi);
  });

  return {
    hasil,
    baru: dibuat.size,
    diperbarui: diubah.size,
    dilewati,
    peringatan,
    kolom: [...peta.values()],
    takDikenal,
  };
}
