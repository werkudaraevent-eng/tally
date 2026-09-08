"use client";

import { LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Fitur `domMax` dimuat malas, bukan diimpor statis.
 *
 * Komponen `m.*` (dipakai halaman publik yang ringan) hanya membawa mesin
 * animasi begitu berkasnya tiba, jadi bundel awal halaman acara tidak ikut
 * memikul seluruh Framer Motion hanya untuk satu pil navigasi yang meluncur.
 * Layar panggung tetap memakai `motion.*` yang membawa fiturnya sendiri.
 */
const loadFeatures = () => import("framer-motion").then((mod) => mod.domMax);

/**
 * Pengaturan gerak untuk seluruh aplikasi.
 *
 * `reducedMotion="user"`: begitu sistem operasi meminta gerak dikurangi,
 * Framer Motion mematikan animasi transform dan layout tetapi tetap memudarkan
 * opasitas. Aturan `prefers-reduced-motion` di globals.css hanya menjangkau
 * animasi CSS; tanpa provider ini, baris papan peringkat, roda undian, dan
 * batang voting tetap bergerak penuh bagi orang yang sudah memintanya berhenti.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
	return (
		<MotionConfig reducedMotion="user">
			<LazyMotion features={loadFeatures}>{children}</LazyMotion>
		</MotionConfig>
	);
}
