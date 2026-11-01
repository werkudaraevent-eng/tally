/**
 * Pembaca CSV.
 *
 * Ditulis sendiri, bukan memakai `split(",")`: nama perusahaan Indonesia
 * lazim memuat koma ("PT Maju, Tbk") dan pemisah naif memecahnya jadi dua
 * kolom, menggeser SELURUH kolom di kanannya tanpa galat apa pun.
 */
export function parseCsv(text: string) {
  // BOM dari Excel harus dibuang sebelum header dicocokkan, kalau tidak kolom
  // pertama terbaca "﻿qr_code" dan tidak pernah dikenali.
  const input = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(input);

  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        // Dua petik berurutan di dalam sel = satu petik harfiah.
        if (input[index + 1] === '"') { cell += '"'; index += 1; } else { quoted = false; }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { row.push(cell); cell = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(cell); matrix.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); matrix.push(row); }

  return matrix;
}

/**
 * Excel berbahasa Indonesia menyimpan CSV dengan titik koma, bukan koma, karena
 * koma dipakai sebagai pemisah desimal. Berkas seperti itu terbaca sebagai satu
 * kolom raksasa bila pemisahnya dipatok koma.
 *
 * Ditentukan dari BARIS PERTAMA saja: itu baris header, isinya tidak pernah
 * memuat koma desimal, jadi hitungannya tidak tertipu oleh data.
 */
function detectDelimiter(input: string) {
  const firstLine = input.slice(0, input.indexOf("\n") === -1 ? input.length : input.indexOf("\n"));
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons > commas ? ";" : ",";
}
