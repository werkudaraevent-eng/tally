"use client";

import dynamic from "next/dynamic";

/**
 * Hitung mundur dimuat terpisah: halaman acara tanpa blok ini tidak ikut
 * mengunduh kodenya. SSR tetap jalan, jadi tidak ada pergeseran tata letak.
 */
export const HitungMundurIsi = dynamic(() => import("./hitung-mundur").then((m) => m.HitungMundurIsi));
