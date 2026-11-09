/**
 * Ask AI di Quick search (Ctrl K): pertanyaan "di mana / bagaimana" tentang
 * Tally dijawab dari panduan fitur (docs/PRODUCT.md). Murni: dibaca route dan
 * berkas cek.
 *
 * AI hanya membaca panduan dan daftar halaman. Ia tidak melihat data peserta
 * dan tidak mengubah apa pun. Tautan di jawaban hanya boleh menunjuk halaman
 * yang ada di menu; yang lain dibuang di sini, jadi AI tidak bisa mengarang
 * alamat.
 */

export const FITUR_TANYA = "ask_ai";
export const BATAS_PERTANYAAN = 300;

export type HalamanTanya = { href: string; label: string; konteks: string; uraian: string };

export type JawabanTanya = {
  jawaban: string;
  langkah: string[];
  tautan: Array<{ href: string; label: string }>;
};

export const SKEMA_TANYA = {
  type: "object",
  additionalProperties: false,
  required: ["jawaban", "langkah", "tautan"],
  properties: {
    jawaban: { type: "string", description: "One to three short sentences. Use **bold** only for menu names." },
    langkah: { type: "array", items: { type: "string" }, description: "Zero to five short steps, in order. Empty when the answer is a single sentence." },
    tautan: {
      type: "array",
      description: "Zero to two pages to open, most useful first. href must be one of the listed pages, exactly.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["href", "label"],
        properties: { href: { type: "string" }, label: { type: "string" } },
      },
    },
  },
} as const;

/**
 * Bagian sistem yang sama untuk semua pertanyaan (disimpan di cache prompt):
 * aturan, daftar halaman, lalu panduan fitur.
 */
export function promptPanduan(panduan: string, halaman: HalamanTanya[]): string {
  const daftar = halaman.map((h) => `- ${h.href} | ${h.konteks} › ${h.label} | ${h.uraian}`).join("\n");
  return [
    "You answer questions from event organisers about Tally, an event platform. Most questions are \"where do I change X\" or \"how do I do Y\".",
    "Rules:",
    "- Answer only from the feature guide and the page list below. If the guide does not cover it, say so in one sentence and point to the closest page, or none. Never invent menus, buttons or settings.",
    "- Reply in the language of the question (Bahasa Indonesia or English). Keep menu, tab and button names exactly as written in the guide, in English.",
    "- Be short: one to three sentences, then up to five steps. No greetings, no closing lines.",
    "- Links: only hrefs from the page list, copied exactly. The label is \"Open <page name>\" in the question's language, e.g. \"Buka Logistics\".",
    "- You cannot see participants, registrations or any event data, and you change nothing. If asked about specific people or numbers, say where in Tally they can look it up.",
    "- The guide mentions internal notes (SQL, PRs, code paths). Never mention those; describe only what the organiser sees on screen.",
    "",
    "Pages (href | menu path | what it is for):",
    daftar,
    "",
    "Feature guide:",
    panduan,
  ].join("\n");
}

/** Bagian per pertanyaan: acara yang sedang dibuka dan peran penanya. */
export function promptKonteks(acara: { nama: string; status: string } | null, peran: string): string {
  return [
    acara ? `The organiser has the event "${acara.nama}" open (status ${acara.status}).` : "No event is open.",
    peran === "custom" ? "They have a custom role: some pages may be hidden from them; if a page is not available to them, they should ask an event admin." : `Their role is ${peran}.`,
  ].join(" ");
}

/** Hanya halaman yang ada di daftar; paling banyak dua; label dirapikan. */
export function saringJawaban(mentah: JawabanTanya, halaman: HalamanTanya[]): JawabanTanya {
  const ada = new Map(halaman.map((h) => [h.href, h]));
  const tautan: JawabanTanya["tautan"] = [];
  for (const t of mentah.tautan ?? []) {
    const href = String(t.href ?? "").trim().replace(/\/+$/, "") || "/";
    const h = ada.get(href);
    if (!h || tautan.some((x) => x.href === href)) continue;
    const label = String(t.label ?? "").trim().slice(0, 60) || `Open ${h.label}`;
    tautan.push({ href, label });
    if (tautan.length === 2) break;
  }
  return {
    jawaban: String(mentah.jawaban ?? "").trim().slice(0, 800),
    langkah: (mentah.langkah ?? []).map((l) => String(l).trim()).filter(Boolean).slice(0, 5).map((l) => l.slice(0, 240)),
    tautan,
  };
}

/** Teks dengan **tebal** menjadi potongan, untuk dirender tanpa HTML mentah. */
export function potongTebal(teks: string): Array<{ tebal: boolean; teks: string }> {
  const hasil: Array<{ tebal: boolean; teks: string }> = [];
  const pola = /\*\*([^*]+)\*\*/g;
  let akhir = 0;
  for (let m = pola.exec(teks); m; m = pola.exec(teks)) {
    if (m.index > akhir) hasil.push({ tebal: false, teks: teks.slice(akhir, m.index) });
    hasil.push({ tebal: true, teks: m[1] });
    akhir = m.index + m[0].length;
  }
  if (akhir < teks.length) hasil.push({ tebal: false, teks: teks.slice(akhir) });
  return hasil;
}

/**
 * Token masuk yang dibebankan, dalam satuan harga token masuk biasa: baca
 * cache 0,1 kali, tulis cache 1,25 kali (harga API Anthropic).
 */
export function tokenMasukSetara(usage: { input_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  return Math.round(usage.input_tokens + (usage.cache_read_input_tokens ?? 0) * 0.1 + (usage.cache_creation_input_tokens ?? 0) * 1.25);
}
