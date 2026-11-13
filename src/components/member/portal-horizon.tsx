/**
 * Portal peserta Gathering Horizon: rancangan pen.dev V5 Hanung (2026-10-13),
 * frame f13sV (desktop), pgOAT (ponsel), dan eY05h (QR kehadiran). Dibangun
 * ulang setia dari properti node, ukuran ditulis apa adanya.
 *
 * Isi dari data yang sudah ada: nama sesi, rundown, member_logistics (bus,
 * kamar, teman sekamar), kode peserta. Yang datanya tidak ada tidak
 * ditampilkan; tidak ada data contoh. Dipakai oleh DashboardGathering bila
 * `gathering_variant === "horizon"`; acara Gathering lain tidak berubah.
 */

export * from "./horizon/gaya";
export * from "./horizon/kepala";
export * from "./horizon/kartu";
export * from "./horizon/info";
export * from "./horizon/profil";
