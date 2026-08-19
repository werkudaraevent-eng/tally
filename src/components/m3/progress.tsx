"use client";

import { cx } from "@/lib/m3/cx";

/**
 * Progres linear M3.
 *
 * Ada celah antara batang indikator dan jalurnya, dan ada titik henti di ujung
 * kanan — dua detail spesifikasi yang mudah dianggap dekoratif. Bukan: celah
 * membuat batas indikator terbaca tanpa mengandalkan perbedaan warna saja, dan
 * titik henti memberi tahu di mana ujung skala berada ketika progresnya masih
 * kecil dan batangnya nyaris tak terlihat.
 */
export function LinearProgress({ value, label, className }: { value?: number; label: string; className?: string }) {
	const determinate = typeof value === "number";
	const clamped = determinate ? Math.min(100, Math.max(0, value)) : 0;

	return (
		<div
			role="progressbar"
			aria-label={label}
			aria-valuenow={determinate ? Math.round(clamped) : undefined}
			aria-valuemin={determinate ? 0 : undefined}
			aria-valuemax={determinate ? 100 : undefined}
			className={cx("flex h-1 w-full items-center gap-1 overflow-hidden", className)}
		>
			{determinate ? (
				<>
					<span className="h-1 rounded-full bg-primary transition-[width] duration-300 ease-standard" style={{ width: `${clamped}%` }} />
					<span className="h-1 flex-1 rounded-full bg-primary-container" />
					<span className="size-1 shrink-0 rounded-full bg-primary" />
				</>
			) : (
				<span className="relative h-1 w-full overflow-hidden rounded-full bg-primary-container">
					<span className="m3-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-primary" />
				</span>
			)}
		</div>
	);
}

/**
 * Pemintal bundar. Dipakai di dalam tombol dan di samping teks.
 *
 * Digambar dengan SVG, bukan border yang diputar: border yang diputar selalu
 * menghasilkan ujung persegi dan tebalnya berubah mengikuti sudut. Perbedaannya
 * kecil pada 16px dan mencolok pada 48px.
 */
export function CircularProgress({ size = 24, label, className }: { size?: number; label: string; className?: string }) {
	const stroke = Math.max(2, Math.round(size / 10));
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;

	return (
		<svg
			role="progressbar"
			aria-label={label}
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className={cx("m3-spin shrink-0", className)}
		>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth={stroke}
				strokeLinecap="round"
				// Busur 3/4 lingkaran. Lingkaran penuh yang berputar tidak terlihat
				// berputar sama sekali.
				strokeDasharray={`${circumference * 0.75} ${circumference}`}
			/>
		</svg>
	);
}

/**
 * Indikator pemuatan ekspresif: satu bentuk yang berubah-ubah sambil berputar.
 *
 * Hanya untuk layar panggung, undian, dan voting — tempat menunggu adalah bagian
 * dari acara dan boleh terasa hidup. Layar booth dan kasir memakai
 * `CircularProgress`; di sana menunggu adalah gangguan, bukan pertunjukan.
 */
export function LoadingIndicator({ size = 48, label, className }: { size?: number; label: string; className?: string }) {
	return (
		<div
			role="progressbar"
			aria-label={label}
			className={cx("m3-morph bg-primary", className)}
			style={{ width: size, height: size }}
		/>
	);
}
