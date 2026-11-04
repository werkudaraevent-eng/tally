/**
 * Kabar kamar: email pribadi "kamar kamu sudah siap" dari Logistics >
 * Assignments (tombol Email room numbers, migrasi 202611040003).
 *
 * Kapan seorang peserta perlu dikabari, diturunkan dari data kamar saja:
 * kunci = daftar "hotel_id:nomor kamar" stay yang SUDAH bernomor, urut. Kunci
 * yang tidak kosong dan berbeda dari kunci yang terakhir dikirim
 * (`room_notices.sent_key`) berarti nomor baru atau nomor yang berganti.
 * Label kamar tanpa nomor ("Kamar 01") dan "nomor menyusul" tidak dihitung,
 * dan dikeluarkan dari kamar tidak memicu apa pun.
 *
 * Murni, supaya diuji langsung oleh Node (kabar-kamar.check.ts).
 */

export type BahasaKabar = "id" | "en";

export type StayKabar = {
  hotel_id: number;
  hotel: string;
  alamat: string | null;
  /** Null = nomor kamar menyusul. */
  room: string | null;
  /** ISO; null = belum ada tanggal. */
  masuk: string | null;
  keluar: string | null;
  /** Nama penghuni lain di kamar yang sama. */
  teman: string[];
};

const PISAH = "|";

/** Kunci kamar bernomor seorang peserta; null bila belum ada satu pun nomor. */
export function kunciKabar(stays: Array<Pick<StayKabar, "hotel_id" | "room">>): string | null {
  const bagian = stays
    .map((s) => ({ hotel: s.hotel_id, nomor: s.room?.trim().replace(/\s+/g, " ") ?? "" }))
    .filter((s) => s.nomor !== "")
    .map((s) => `${s.hotel}:${s.nomor}`);
  if (bagian.length === 0) return null;
  return [...new Set(bagian)].sort().join(PISAH).slice(0, 2000);
}

/** Perlu dikabari: sudah ada nomor, dan belum pernah dikirim atau berbeda dari yang dikirim. */
export function perluKabar(kunci: string | null, terkirim: string | null | undefined): boolean {
  return kunci !== null && kunci !== (terkirim ?? null);
}

/**
 * "berubah" hanya bila hotel yang sudah pernah dikabari kini bernomor lain.
 * Hotel kedua yang baru dapat nomor (pindah hotel) tetap kabar "baru".
 */
export function kabarBerubah(kunci: string, terkirim: string | null | undefined): boolean {
  if (!terkirim) return false;
  const perHotel = (k: string) => {
    const peta = new Map<string, string[]>();
    for (const bagian of k.split(PISAH)) {
      const titik = bagian.indexOf(":");
      if (titik < 1) continue;
      const hotel = bagian.slice(0, titik);
      peta.set(hotel, [...(peta.get(hotel) ?? []), bagian.slice(titik + 1)].sort());
    }
    return peta;
  };
  const sekarang = perHotel(kunci);
  for (const [hotel, nomor] of perHotel(terkirim)) {
    const baru = sekarang.get(hotel);
    if (baru && baru.join(PISAH) !== nomor.join(PISAH)) return true;
  }
  return false;
}

const TEKS = {
  id: {
    eyebrow: "Info hotel",
    judulBaru: "Kamar kamu sudah siap",
    judulUbah: "Nomor kamar kamu berubah",
    subjekBaru: (kamar: string) => `Kamar ${kamar} sudah siap`,
    subjekUbah: (kamar: string) => `Nomor kamar kamu sekarang ${kamar}`,
    sapa: (nama: string) => `Halo ${nama}, nomor kamarmu sudah ada.`,
    sapaUbah: (nama: string) => `Halo ${nama}, nomor kamarmu berubah. Pakai yang di bawah ini.`,
    hotel: "Hotel",
    kamar: "Kamar",
    menyusul: "Menyusul",
    teman: "Teman sekamar",
    masuk: "Check-in",
    keluar: "Check-out",
    tombol: "Buka Perjalanan saya",
    kaki: "Kalau nomor kamar berubah, kami kirim kabar baru. Yang berlaku selalu yang tampil di portal peserta.",
    locale: "id-ID",
  },
  en: {
    eyebrow: "Hotel info",
    judulBaru: "Your room is ready",
    judulUbah: "Your room number has changed",
    subjekBaru: (kamar: string) => `Room ${kamar} is ready`,
    subjekUbah: (kamar: string) => `Your room is now ${kamar}`,
    sapa: (nama: string) => `Hi ${nama}, your room number is in.`,
    sapaUbah: (nama: string) => `Hi ${nama}, your room number has changed. Use the one below.`,
    hotel: "Hotel",
    kamar: "Room",
    menyusul: "To follow",
    teman: "Roommate",
    masuk: "Check-in",
    keluar: "Check-out",
    tombol: "Open my trip",
    kaki: "If your room number changes, we will send a new message. The participant area always shows the current one.",
    locale: "en-GB",
  },
} as const;

function esc(teks: string): string {
  return teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** "Jumat, 6 November, 14.00" di zona acara. */
export function waktuKabar(iso: string | null, zona: string, bahasa: BahasaKabar): string | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return new Intl.DateTimeFormat(TEKS[bahasa].locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zona,
  }).format(new Date(iso));
}

export function emailKabarKamar(input: {
  bahasa: BahasaKabar;
  eventName: string;
  nama: string;
  stays: StayKabar[];
  /** Sudah pernah dikabari dengan nomor lain. */
  berubah: boolean;
  portalUrl: string;
  zona: string;
}) {
  const t = TEKS[input.bahasa];
  const bernomor = input.stays.filter((s) => s.room?.trim());
  const kamarSubjek = bernomor.map((s) => s.room!.trim()).join(", ");
  const subject = `${input.berubah ? t.subjekUbah(kamarSubjek) : t.subjekBaru(kamarSubjek)} · ${input.eventName}`;
  const judul = input.berubah ? t.judulUbah : t.judulBaru;
  const sapa = input.berubah ? t.sapaUbah(input.nama) : t.sapa(input.nama);

  const baris = (label: string, nilai: string, tebal = false) =>
    `<tr><td style="width:110px;padding:4px 16px 4px 0;color:#66736C;vertical-align:top;white-space:nowrap;">${esc(label)}</td><td style="padding:4px 0;vertical-align:top;${tebal ? "font-weight:600;font-size:17px;" : ""}">${esc(nilai)}</td></tr>`;

  const kotak = input.stays.map((s) => {
    const masuk = waktuKabar(s.masuk, input.zona, input.bahasa);
    const keluar = waktuKabar(s.keluar, input.zona, input.bahasa);
    return `<table role="presentation" style="margin:16px 0 0;width:100%;border:1px solid #D9DDD7;border-collapse:separate;padding:12px 14px;font-size:14px;line-height:1.5;">
      ${baris(t.hotel, s.hotel, true)}
      ${s.alamat ? baris("", s.alamat) : ""}
      ${baris(t.kamar, s.room?.trim() || t.menyusul, Boolean(s.room?.trim()))}
      ${s.teman.length ? baris(t.teman, s.teman.join(", ")) : ""}
      ${masuk ? baris(t.masuk, masuk) : ""}
      ${keluar ? baris(t.keluar, keluar) : ""}
    </table>`;
  }).join("");

  const html = `<!doctype html>
<html lang="${input.bahasa}"><body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D9DDD7;padding:32px;">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2649D0;font-weight:600;">${esc(t.eyebrow)} · ${esc(input.eventName)}</p>
    <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;font-weight:600;">${esc(judul)}</h1>
    <p style="margin:16px 0 0;font-size:15px;line-height:1.6;">${esc(sapa)}</p>
    ${kotak}
    <p style="margin:28px 0 0;"><a href="${esc(input.portalUrl)}" style="display:inline-block;padding:14px 28px;background:#2649D0;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${esc(t.tombol)}</a></p>
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #D9DDD7;font-size:13px;line-height:1.6;color:#66736C;">${esc(t.kaki)}</p>
  </div>
</body></html>`;

  const text = [
    `${t.eyebrow} · ${input.eventName}`,
    "",
    judul,
    "",
    sapa,
    ...input.stays.flatMap((s) => {
      const masuk = waktuKabar(s.masuk, input.zona, input.bahasa);
      const keluar = waktuKabar(s.keluar, input.zona, input.bahasa);
      return [
        "",
        `${t.hotel}: ${s.hotel}`,
        ...(s.alamat ? [s.alamat] : []),
        `${t.kamar}: ${s.room?.trim() || t.menyusul}`,
        ...(s.teman.length ? [`${t.teman}: ${s.teman.join(", ")}`] : []),
        ...(masuk ? [`${t.masuk}: ${masuk}`] : []),
        ...(keluar ? [`${t.keluar}: ${keluar}`] : []),
      ];
    }),
    "",
    `${t.tombol}: ${input.portalUrl}`,
    "",
    t.kaki,
  ].join("\n");

  return { subject, html, text };
}
