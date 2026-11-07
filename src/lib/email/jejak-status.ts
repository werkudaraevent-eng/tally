/**
 * Status Email tracking satu penerima untuk laporan (aman untuk peramban;
 * token ada di jejak.ts). Dari yang paling kuat:
 *
 *   diklik           menekan tombol di email (dapat dipercaya)
 *   dibuka           gambar 1x1 dimuat oleh aplikasi email penerima
 *   dibuka_otomatis  hanya dimuat proxy Apple Mail (Mail Privacy Protection),
 *                    yang memuat semua email sendiri: belum tentu dibaca
 *   terkirim         belum ada tanda apa pun (Outlook memblokir gambar)
 */
export type StatusEmail = "diklik" | "dibuka" | "dibuka_otomatis" | "terkirim";

export type JejakBaris = { clicked_at?: string | null; opened_at?: string | null; opened_auto_at?: string | null };

export function statusEmail(baris: JejakBaris): StatusEmail {
  if (baris.clicked_at) return "diklik";
  if (baris.opened_at) return "dibuka";
  if (baris.opened_auto_at) return "dibuka_otomatis";
  return "terkirim";
}

/** Ringkasan untuk laporan. `dibuka` sudah memuat yang diklik; Apple dipisah. */
export type RingkasEmail = { terkirim: number; dibuka: number; dibuka_otomatis: number; diklik: number };

export function ringkasEmail(status: StatusEmail[]): RingkasEmail {
  const hasil: RingkasEmail = { terkirim: status.length, dibuka: 0, dibuka_otomatis: 0, diklik: 0 };
  for (const isi of status) {
    if (isi === "diklik") {
      hasil.diklik += 1;
      hasil.dibuka += 1;
    } else if (isi === "dibuka") hasil.dibuka += 1;
    else if (isi === "dibuka_otomatis") hasil.dibuka_otomatis += 1;
  }
  return hasil;
}

const URUTAN: Record<StatusEmail, number> = { terkirim: 0, dibuka_otomatis: 1, dibuka: 2, diklik: 3 };

/** Status terkuat dari beberapa email ke orang yang sama (mis. dua kali Send by email). */
export function statusTerkuat(a: StatusEmail | null, b: StatusEmail): StatusEmail {
  return a && URUTAN[a] >= URUTAN[b] ? a : b;
}
