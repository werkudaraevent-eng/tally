// Ikon kartu Tentang acara gaya gathering (Halaman acara > About > Cards).
// Disimpan sebagai nama komponen Phosphor (pustaka ikon yang sudah dipakai
// aplikasi), mis. "Users", di landing_config.about_cards[].icon. Semua ikon
// Phosphor boleh dipilih; daftar di bawah hanya yang ditawarkan lebih dulu di
// CMS, dengan kata kunci cari termasuk padanan Indonesia.

export type SaranIkon = { nama: string; label: string; cari: string };

export const LANDING_CARD_ICON_SARAN: readonly SaranIkon[] = [
  { nama: "Users", label: "People", cari: "users group team together kebersamaan orang tim keluarga" },
  { nama: "UsersThree", label: "Group", cari: "users group team community komunitas rombongan" },
  { nama: "Handshake", label: "Handshake", cari: "partner deal network kerja sama relasi" },
  { nama: "Heart", label: "Heart", cari: "love care family cinta peduli keluarga" },
  { nama: "HandHeart", label: "Care", cari: "charity give csr berbagi sosial" },
  { nama: "HandsClapping", label: "Applause", cari: "appreciation award tepuk tangan apresiasi" },
  { nama: "Smiley", label: "Smile", cari: "fun happy senang seru" },
  { nama: "Confetti", label: "Celebration", cari: "party fun festive pesta perayaan seru" },
  { nama: "Champagne", label: "Toast", cari: "gala dinner party cheers malam" },
  { nama: "Balloon", label: "Balloon", cari: "party birthday ulang tahun pesta" },
  { nama: "MapPin", label: "Location", cari: "place pin explore jelajah tempat lokasi" },
  { nama: "MapTrifold", label: "Map", cari: "explore tour route jelajah peta rute" },
  { nama: "Compass", label: "Compass", cari: "explore adventure direction jelajah petualangan" },
  { nama: "GlobeHemisphereEast", label: "Globe", cari: "world international dunia global" },
  { nama: "Binoculars", label: "Sightseeing", cari: "explore discover wisata jelajah" },
  { nama: "Mountains", label: "Mountains", cari: "nature adventure gunung alam" },
  { nama: "TreePalm", label: "Beach", cari: "holiday tropical island pantai liburan" },
  { nama: "Tree", label: "Tree", cari: "nature park outdoor alam taman" },
  { nama: "Leaf", label: "Leaf", cari: "green nature eco hijau alam" },
  { nama: "Flower", label: "Flower", cari: "garden spring bunga taman" },
  { nama: "Sun", label: "Sun", cari: "outdoor weather day matahari cuaca" },
  { nama: "Moon", label: "Moon", cari: "night evening malam" },
  { nama: "Waves", label: "Sea", cari: "beach water ocean laut pantai" },
  { nama: "Campfire", label: "Campfire", cari: "outbound camp api unggun" },
  { nama: "Tent", label: "Camping", cari: "outbound camp kemah" },
  { nama: "Airplane", label: "Flight", cari: "plane travel trip fly pesawat terbang perjalanan" },
  { nama: "Train", label: "Train", cari: "rail travel kereta" },
  { nama: "Bus", label: "Bus", cari: "transport shuttle travel transportasi" },
  { nama: "Van", label: "Van", cari: "shuttle transport mobil antar jemput" },
  { nama: "Car", label: "Car", cari: "transport drive mobil" },
  { nama: "Boat", label: "Boat", cari: "ship cruise kapal perahu" },
  { nama: "Suitcase", label: "Suitcase", cari: "travel trip luggage koper perjalanan" },
  { nama: "Backpack", label: "Backpack", cari: "travel trip tas ransel" },
  { nama: "Bed", label: "Hotel", cari: "room stay rest kamar hotel istirahat" },
  { nama: "Buildings", label: "City", cari: "venue building kota gedung" },
  { nama: "Mosque", label: "Mosque", cari: "prayer masjid ibadah" },
  { nama: "ForkKnife", label: "Dining", cari: "food meal eat makan kuliner" },
  { nama: "Coffee", label: "Coffee", cari: "break drink kopi rehat" },
  { nama: "Hamburger", label: "Snack", cari: "food burger makanan" },
  { nama: "Cake", label: "Cake", cari: "dessert birthday kue" },
  { nama: "IceCream", label: "Ice cream", cari: "dessert sweet es krim" },
  { nama: "MusicNotes", label: "Music", cari: "concert band song musik konser" },
  { nama: "Guitar", label: "Guitar", cari: "music band live musik" },
  { nama: "Microphone", label: "Microphone", cari: "talk speaker karaoke stage pembicara" },
  { nama: "Camera", label: "Photo", cari: "photo picture memory foto kenangan" },
  { nama: "FilmSlate", label: "Film", cari: "movie video film" },
  { nama: "Palette", label: "Art", cari: "creative culture seni budaya" },
  { nama: "GameController", label: "Games", cari: "play fun game permainan" },
  { nama: "PuzzlePiece", label: "Puzzle", cari: "team building game permainan" },
  { nama: "SoccerBall", label: "Sport", cari: "football sport olahraga sepak bola" },
  { nama: "PersonSimpleRun", label: "Run", cari: "fun run sport activity lari olahraga aktivitas" },
  { nama: "Bicycle", label: "Cycling", cari: "bike sport sepeda" },
  { nama: "SwimmingPool", label: "Pool", cari: "swim water kolam renang" },
  { nama: "Lightning", label: "Energy", cari: "power energy spirit energi semangat" },
  { nama: "Fire", label: "Fire", cari: "hot spirit passion semangat" },
  { nama: "Rocket", label: "Rocket", cari: "launch growth boost meluncur" },
  { nama: "Sparkle", label: "Sparkle", cari: "new magic special baru spesial" },
  { nama: "Star", label: "Star", cari: "favourite highlight bintang unggulan" },
  { nama: "Trophy", label: "Trophy", cari: "award winner prize piala juara penghargaan" },
  { nama: "Medal", label: "Medal", cari: "award achievement medali prestasi" },
  { nama: "Crown", label: "Crown", cari: "vip king mahkota" },
  { nama: "Target", label: "Target", cari: "goal objective tujuan sasaran" },
  { nama: "Lightbulb", label: "Idea", cari: "insight learn ide inspirasi" },
  { nama: "ChatsCircle", label: "Chat", cari: "talk discussion sharing diskusi ngobrol" },
  { nama: "Megaphone", label: "Announcement", cari: "news info pengumuman" },
  { nama: "BookOpen", label: "Learning", cari: "book study learn belajar buku" },
  { nama: "GraduationCap", label: "Education", cari: "school training pelatihan pendidikan" },
  { nama: "Briefcase", label: "Work", cari: "business office kerja bisnis" },
  { nama: "ChartLineUp", label: "Growth", cari: "chart result kinerja pertumbuhan" },
  { nama: "Gift", label: "Gift", cari: "present doorprize hadiah oleh-oleh" },
  { nama: "ShoppingBag", label: "Shopping", cari: "souvenir belanja oleh-oleh" },
  { nama: "Ticket", label: "Ticket", cari: "pass entry tiket" },
  { nama: "CalendarCheck", label: "Schedule", cari: "agenda date jadwal" },
  { nama: "Clock", label: "Time", cari: "schedule hour waktu jam" },
  { nama: "Flag", label: "Flag", cari: "milestone start bendera" },
  { nama: "ShieldCheck", label: "Safety", cari: "secure safe aman keamanan" },
  { nama: "Info", label: "Information", cari: "info help informasi" },];

/** Nama komponen Phosphor: huruf besar di depan, tanpa akhiran "Icon". */
export const LANDING_CARD_ICON_POLA = /^[A-Z][A-Za-z0-9]{1,47}$/;

/** Warna ubin ikon: tiga warna tema gathering (Theme > Button/Brand/Accent colour). */
export const LANDING_CARD_TONES = ["button", "brand", "accent"] as const;
export type LandingCardTone = (typeof LANDING_CARD_TONES)[number];
export const LANDING_CARD_TONE_LABELS: Record<LandingCardTone, string> = { button: "Button", brand: "Brand", accent: "Accent" };

/** Bawaan per urutan, sama dengan sebelum ikon bisa dipilih (#107). */
const IKON_BAWAAN = ["Users", "MapPin", "Lightning", "Heart"] as const;

/** Nama ikon tersimpan, atau bawaan urutannya. Nama yang tidak dikenal ditangani perendernya. */
export function ikonKartu(kartu: { icon?: string | null }, index: number): string {
  return kartu.icon && LANDING_CARD_ICON_POLA.test(kartu.icon) ? kartu.icon : IKON_BAWAAN[index % IKON_BAWAAN.length];
}

export function ikonBawaan(index: number): string {
  return IKON_BAWAAN[index % IKON_BAWAAN.length];
}

export function nadaKartu(kartu: { tone?: string | null }, index: number): LandingCardTone {
  return (LANDING_CARD_TONES as readonly string[]).includes(kartu.tone ?? "") ? (kartu.tone as LandingCardTone) : LANDING_CARD_TONES[index % LANDING_CARD_TONES.length];
}

/** "MapPin" -> "Map pin": nama yang terbaca untuk ikon di luar daftar saran. */
export function labelIkon(nama: string): string {
  const saran = LANDING_CARD_ICON_SARAN.find((item) => item.nama === nama);
  if (saran) return saran.label;
  const kata = nama.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return kata.charAt(0).toUpperCase() + kata.slice(1);
}
