/**
 * `niimbot-web-bluetooth` tidak mengirimkan tipe, dan tidak punya paket
 * `@types` — ia berkas skrip tunggal bergaya lawas yang memasang dirinya di
 * `window.Niimbot` dan tidak mengekspor apa pun.
 *
 * Karena itu deklarasi ini sengaja kosong isinya: impornya HANYA untuk efek
 * samping, dan bentuk API yang sebenarnya dipakai dideklarasikan sebagai tipe
 * `NiimbotDriver` di src/lib/label/printer.ts — di sebelah kode yang
 * memanggilnya, tempat ketidakcocokan dengan versi baru akan terbaca.
 */
declare module "niimbot-web-bluetooth";
