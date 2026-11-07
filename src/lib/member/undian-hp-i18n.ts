import type { LandingLang } from "@/lib/landing-i18n";

/** Teks layar Cahaya HP di Area peserta (components/member/undian-hp.tsx), mengikuti bahasa acara. */
export type UndianHpText = {
  dialog: string;
  kicker: string;
  readyTitle: string;
  readyBody: string;
  join: string;
  joined: string;
  joinedBody: string;
  close: string;
  raise: string;
  lit: (n: string) => string;
  outTitle: string;
  outBody: string;
  winTitle: string;
  winBody: string;
  backupTitle: (n: number) => string;
  backupBody: string;
  notInTitle: string;
  notInBody: string;
  unknownTitle: string;
  unknownBody: string;
  rehearsal: string;
  sponsor: (name: string) => string;
};

export const UNDIAN_HP_UI: Record<LandingLang, UndianHpText> = {
  id: {
    dialog: "Undian",
    kicker: "Undian Cahaya HP",
    readyTitle: "Sebentar lagi HP kamu ikut menyala",
    readyBody: "Saat MC menekan Undi, layar ini menyala bersama seisi ruangan. Naikkan kecerahan layar dan biarkan halaman ini terbuka.",
    join: "Siap ikut",
    joined: "Kamu siap",
    joinedBody: "Angkat HP kamu saat undian dimulai. Layar tidak akan mati selama halaman ini terbuka.",
    close: "Tutup undian",
    raise: "Angkat HP kamu!",
    lit: (n) => `${n} masih menyala`,
    outTitle: "Belum beruntung",
    outBody: "Terima kasih sudah ikut. Biarkan halaman ini terbuka untuk undian berikutnya.",
    winTitle: "KAMU MENANG!",
    winBody: "Tunggu MC memanggil nama kamu, lalu tunjukkan layar ini ke panitia.",
    backupTitle: (n) => `Kamu cadangan nomor ${n}`,
    backupBody: "Kalau pemenang tidak hadir, MC akan memanggil nama kamu.",
    notInTitle: "Kamu tidak termasuk undian hadiah ini",
    notInBody: "Tonton layar panggung. Masih ada hadiah lain.",
    unknownTitle: "Lihat layar panggung",
    unknownBody: "Hasil undian ini belum sampai ke HP kamu. Nama pemenang tampil di layar panggung.",
    rehearsal: "LATIHAN · hasil tidak dicatat",
    sponsor: (name) => `Dari ${name}`,
  },
  en: {
    dialog: "Lucky draw",
    kicker: "Phone lights draw",
    readyTitle: "Your phone will light up soon",
    readyBody: "When the host presses Draw, this screen lights up with the whole room. Turn your screen brightness up and keep this page open.",
    join: "I'm in",
    joined: "You're in",
    joinedBody: "Hold your phone up when the draw starts. The screen stays on while this page is open.",
    close: "Close the draw",
    raise: "Hold your phone up!",
    lit: (n) => `${n} still lit`,
    outTitle: "Not this time",
    outBody: "Thanks for taking part. Keep this page open for the next draw.",
    winTitle: "YOU WON!",
    winBody: "Wait for the host to call your name, then show this screen to the organisers.",
    backupTitle: (n) => `You're backup number ${n}`,
    backupBody: "If a winner isn't here, the host will call your name.",
    notInTitle: "You're not in this prize's draw",
    notInBody: "Watch the stage screen. There are more prizes to come.",
    unknownTitle: "Watch the stage screen",
    unknownBody: "This draw's result didn't reach your phone. The winners' names are on the stage screen.",
    rehearsal: "REHEARSAL · results not recorded",
    sponsor: (name) => `From ${name}`,
  },
};
