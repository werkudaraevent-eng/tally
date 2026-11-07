import { susunAlur, type Kenangan, type TanyaAlur } from "./alur.ts";
import { lolosFakta, syaratJawabanSaja, type FaktaPeserta } from "./logika.ts";
import type { KunciKartu, Pertanyaan } from "./setelan.ts";

/**
 * Daftar layar untuk satu peserta, siap dikirim ke HP. Fungsi murni: dipakai
 * halaman peserta di server, dan oleh pratinjau langsung di Admin > Feedback
 * (kilas-client.tsx) yang menyusun ulang layar dari draf yang belum disimpan.
 *
 * Pertanyaan yang syarat data acaranya tidak cocok, atau pertanyaan pilihan
 * tanpa satu pun pilihan untuk peserta ini (semua dari baris Agenda kelompok
 * lain), dilewati di sini, sama dengan periksaJawaban. Syarat jawaban, recall,
 * dan carry forward dinilai di HP (alur.ts, alurAktif).
 */

export type TanyaLayar = TanyaAlur & { required: boolean };
export type LayarSiap = { jenis: "buka" } | { jenis: "kartu"; kartu: KunciKartu } | { jenis: "tanya"; q: TanyaLayar } | { jenis: "tutup" };

/** Pilihan yang ditampilkan ke peserta ini untuk satu pertanyaan pilihan (tanpa carry forward). */
export function pilihanPeserta(q: Pertanyaan, semuaJudulAgenda: ReadonlySet<string>, milikPeserta: ReadonlySet<string>): string[] {
  const opsi = q.options ?? [];
  if (!q.from_agenda) return opsi;
  return opsi.filter((o) => !semuaJudulAgenda.has(o) || milikPeserta.has(o));
}

export function bangunLayar(a: {
  questions: Pertanyaan[];
  cards: Record<KunciKartu, boolean>;
  kenangan: Kenangan;
  /** Bahasa halaman ini dan bahasa utama acara: judul bahasa kedua bila berbeda. */
  lang: "id" | "en";
  utama: "id" | "en";
  semua: ReadonlySet<string>;
  milik: ReadonlySet<string>;
  /** Null: tidak ada syarat data acara. */
  fakta: FaktaPeserta | null;
}): LayarSiap[] {
  const judulDi = (q: Pertanyaan) => (a.lang !== a.utama && q.title_alt?.trim() ? q.title_alt.trim() : q.title);
  return susunAlur(a.questions, a.cards, a.kenangan).flatMap((l): LayarSiap[] => {
    if (l.jenis !== "tanya") return [l];
    if (a.fakta && !lolosFakta(l.q.show_if, a.fakta)) return [];
    const dariLain = l.q.type === "choice" && Boolean(l.q.options_from);
    const options = l.q.type === "choice" && !dariLain ? pilihanPeserta(l.q, a.semua, a.milik) : [];
    if (l.q.type === "choice" && !dariLain && options.length === 0) return [];
    const syarat = syaratJawabanSaja(l.q.show_if);
    return [{
      jenis: "tanya",
      q: {
        key: l.q.key, type: l.q.type, title: judulDi(l.q), required: l.q.required, max: l.q.max ?? 1, options,
        ...(syarat.length ? { show_if: syarat } : {}),
        ...(dariLain ? { options_from: l.q.options_from } : {}),
      },
    }];
  });
}
