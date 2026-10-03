/**
 * Format teks email yang ditulis panitia di TextArea biasa.
 *
 * Sintaksnya kecil dan dimasukkan oleh tombol toolbar, sama seperti Sisipkan
 * memasukkan `{nama}`:
 *   **tebal**   _miring_   [teks tautan](https://...)   "- " di awal baris = daftar
 * Satu baris kosong memisahkan paragraf.
 *
 * Yang dihasilkan hanya p, strong, em, ul/li, br, dan a dengan href https:,
 * http:, atau mailto:. Semua teks lain di-escape, jadi tag yang diketik panitia
 * (atau nama peserta yang berisi tag) tampil sebagai teks, tidak pernah
 * menjadi HTML. Tanpa impor server: dipakai pratinjau di peramban dan pengirim.
 *
 * Kiriman Pesan peserta bisa memakainya kelak, supaya hanya ada satu cara
 * menulis teks email di aplikasi ini.
 */

export type FormatOptions = {
  /** Mengisi `{kolom}` di potongan TEKS (tidak di alamat tautan). */
  fill?: (text: string) => string;
  linkColor: string;
  color: string;
  size?: number;
  /** Jarak atas paragraf pertama. Bawaan sama dengan paragraf lain. */
  firstMargin?: number;
};

type Node = { kind: "text"; text: string } | { kind: "b" | "i"; children: Node[] } | { kind: "a"; href: string; children: Node[] };

const INLINE = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|\*\*([^*\n]+?)\*\*|(?<![\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}_])/u;

function parseInline(source: string): Node[] {
  const out: Node[] = [];
  let rest = source;
  while (rest) {
    const cocok = INLINE.exec(rest);
    if (!cocok) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (cocok.index > 0) out.push({ kind: "text", text: rest.slice(0, cocok.index) });
    if (cocok[1] !== undefined) out.push({ kind: "a", href: cocok[2], children: parseInline(cocok[1]) });
    else if (cocok[3] !== undefined) out.push({ kind: "b", children: parseInline(cocok[3]) });
    else out.push({ kind: "i", children: parseInline(cocok[4]) });
    rest = rest.slice(cocok.index + cocok[0].length);
  }
  return out;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nodesHtml(nodes: Node[], options: FormatOptions): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return escapeHtml(options.fill ? options.fill(node.text) : node.text);
      if (node.kind === "b") return `<strong>${nodesHtml(node.children, options)}</strong>`;
      if (node.kind === "i") return `<em>${nodesHtml(node.children, options)}</em>`;
      if (node.kind !== "a") return "";
      // Garis bawah selalu: warna saja tidak cukup untuk menandai tautan (WCAG 1.4.1).
      return `<a href="${escapeHtml(node.href)}" style="color:${options.linkColor};text-decoration:underline;">${nodesHtml(node.children, options)}</a>`;
    })
    .join("");
}

function nodesText(nodes: Node[], fill?: (text: string) => string): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return fill ? fill(node.text) : node.text;
      if (node.kind === "a") return `${nodesText(node.children, fill)} (${node.href})`;
      return nodesText(node.children, fill);
    })
    .join("");
}

type Bagian = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] };

function blocks(source: string): Bagian[] {
  const out: Bagian[] = [];
  for (const paragraf of source.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = paragraf.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim());
    let teks: string[] = [];
    let daftar: string[] = [];
    const tutup = () => {
      if (teks.length) out.push({ kind: "p", lines: teks });
      if (daftar.length) out.push({ kind: "ul", items: daftar });
      teks = [];
      daftar = [];
    };
    for (const line of lines) {
      const butir = /^\s*[-•*]\s+(.*)$/.exec(line);
      if (butir) {
        if (teks.length) {
          out.push({ kind: "p", lines: teks });
          teks = [];
        }
        daftar.push(butir[1]);
      } else {
        if (daftar.length) {
          out.push({ kind: "ul", items: daftar });
          daftar = [];
        }
        teks.push(line.trim());
      }
    }
    tutup();
  }
  return out;
}

export function formatHtml(source: string, options: FormatOptions): string {
  const size = options.size ?? 16;
  const leading = size + 8;
  return blocks(source)
    .map((bagian, index) => {
      const margin = index === 0 && options.firstMargin !== undefined ? options.firstMargin : 12;
      if (bagian.kind === "p") {
        const isi = bagian.lines.map((line) => nodesHtml(parseInline(line), options)).join("<br>");
        return `<p style="margin:${margin}px 0 0;font-size:${size}px;line-height:${leading}px;color:${options.color};">${isi}</p>`;
      }
      // Margin dan padding ditulis inline: Outlook Windows mengabaikan margin li dan menggeser poin bila dibiarkan bawaan.
      const items = bagian.items
        .map((item) => `<li style="margin:0 0 4px;font-size:${size}px;line-height:${leading}px;color:${options.color};">${nodesHtml(parseInline(item), options)}</li>`)
        .join("");
      return `<ul style="margin:${margin}px 0 0 24px;padding:0;">${items}</ul>`;
    })
    .join("");
}

export function formatText(source: string, fill?: (text: string) => string): string {
  return blocks(source)
    .map((bagian) =>
      bagian.kind === "p"
        ? bagian.lines.map((line) => nodesText(parseInline(line), fill)).join("\n")
        : bagian.items.map((item) => `- ${nodesText(parseInline(item), fill)}`).join("\n"),
    )
    .join("\n\n");
}

export function isBlank(source: string) {
  return !source.replace(/[\s*_\-•]/g, "");
}
