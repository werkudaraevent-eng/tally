/**
 * Label bawaan tata letak Forum dalam dua bahasa. Rancangan Figma berbahasa
 * Inggris (acara IFC); acara di Indonesia memakai bahasa Indonesia. Hanya label
 * bawaan yang diterjemahkan: isi dari CMS tampil seperti yang ditulis admin.
 */
export type ForumLabels = Record<
  | "beranda" | "program" | "info" | "masuk" | "areaPeserta" | "daftar" | "tentang" | "tentangSingkat" | "selengkapnya"
  | "lihatSelengkapnya" | "susunan" | "waktu" | "sesi" | "pembicara" | "lokasi" | "buatPeta" | "galeri"
  | "dresscode" | "bukaGoogleMaps" | "menu" | "subjudulProgram" | "remah",
  string
>;

export const FORUM_LABELS: Record<"id" | "en", ForumLabels> = {
  id: {
    beranda: "Beranda",
    program: "Program acara",
    info: "Informasi praktis",
    masuk: "Masuk",
    areaPeserta: "Area peserta",
    daftar: "Daftar di sini",
    tentang: "Tentang acara",
    tentangSingkat: "Tentang kami",
    selengkapnya: "Selengkapnya",
    lihatSelengkapnya: "Lihat selengkapnya",
    susunan: "Susunan acara",
    waktu: "Waktu",
    sesi: "Program",
    pembicara: "Pembicara",
    lokasi: "Lokasi",
    buatPeta: "Buka peta",
    bukaGoogleMaps: "Buka di Google Maps",
    galeri: "Galeri tempat",
    dresscode: "Dress code",
    menu: "Menu",
    subjudulProgram: "Informasi umum tentang acara, susunan acara, dan program.",
    remah: "Navigasi remah roti",
  },
  en: {
    beranda: "Home",
    program: "Event Program",
    info: "Practical Information",
    masuk: "Login",
    areaPeserta: "My account",
    daftar: "Register Here",
    tentang: "About The Event",
    tentangSingkat: "About us",
    selengkapnya: "Learn more",
    lihatSelengkapnya: "See More",
    susunan: "Event Rundown",
    waktu: "Time",
    sesi: "Program",
    pembicara: "Speakers",
    lokasi: "Location",
    buatPeta: "Open map",
    bukaGoogleMaps: "Open in Google Maps",
    galeri: "Venue Gallery",
    dresscode: "Dress Code",
    menu: "Menu",
    subjudulProgram: "General information about the event, agenda, and program.",
    remah: "Breadcrumb",
  },
};
