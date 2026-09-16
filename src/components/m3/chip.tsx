"use client";

import { Check } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

export type ChipTone = "neutral" | "primary" | "success" | "warning" | "error";

/**
 * Chip status. Tidak bisa ditekan — ini penanda, bukan kontrol.
 *
 * Selalu berpasangan warna + teks, dan menerima ikon. M3 tidak melarang chip
 * berwarna polos, tetapi status di layar ini dibaca sekilas oleh orang yang
 * sedang melakukan hal lain; warna saja gagal untuk siapa pun yang tidak
 * membedakan merah dan hijau, dan gagal untuk semua orang di bawah lampu panggung.
 */
/**
 * Nada netral BERGARIS, bukan berbidang abu.
 *
 * Di dalam baris tabel, bidang abu penuh membuat setiap chip terbaca sebagai
 * tombol — dan kolom Tipe yang berisi dua puluh lima tombol palsu adalah kolom
 * yang mengundang klik yang tidak akan terjadi. Garis tipis mengatakan hal yang
 * sama (ini salah satu dari beberapa keadaan) tanpa menjanjikan apa pun.
 *
 * Warna disimpan untuk status yang MEMANG berarti: hadir, menunggu, gagal.
 * Kalau semua status berwarna, tidak ada yang berwarna.
 */
const TONE: Record<ChipTone, string> = {
	neutral: "border border-outline-variant text-on-surface-variant",
	primary: "bg-primary-container text-on-primary-container",
	success: "bg-success-container text-on-success-container",
	warning: "bg-warning-container text-on-warning-container",
	error: "bg-error-container text-on-error-container",
};

/** Warna titik per nada. Dipakai varian `dot`, dan hanya di sana. */
const DOT: Record<ChipTone, string> = {
	neutral: "bg-outline",
	primary: "bg-primary",
	success: "bg-success",
	warning: "bg-warning",
	error: "bg-error",
};

export function StatusChip({ tone = "neutral", icon, dot, children, className, title }: {
	tone?: ChipTone;
	icon?: ReactNode;
	/**
	 * Titik warna di kiri, teks tetap warna utama.
	 *
	 * Bentuk ini dipakai untuk status yang harus dibandingkan ANTAR BARIS:
	 * hadir/belum, konfirmasi/menunggu. Chip berbidang warna penuh memenangkan
	 * seluruh kolom begitu ada dua puluh lima baris berwarna; titik 6px menandai
	 * artinya tanpa mengubah berat kolomnya. Teksnya tetap membawa arti, jadi
	 * yang tidak membedakan warna tidak kehilangan apa pun.
	 */
	dot?: boolean;
	children: ReactNode;
	className?: string;
	/** Keterangan lengkap saat teksnya sudah dipotong, atau angka di baliknya. */
	title?: string;
}) {
	return (
		<span
			title={title}
			className={cx(
				"m3-status-chip inline-flex min-h-8 max-w-[14rem] items-center gap-1.5 truncate whitespace-nowrap rounded-full px-2 text-label-medium font-medium",
				dot ? "border border-outline-variant text-on-surface" : TONE[tone],
				className,
			)}
		>
			{dot ? <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", DOT[tone])} /> : icon}
			{children}
		</span>
	);
}

export type FilterChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
	selected: boolean;
	children: ReactNode;
	/** Sembunyikan centang saat ruang sangat sempit. Bentuk tetap menandai status. */
	showCheck?: boolean;
	className?: string;
};

/**
 * Chip penyaring. Terpilih ditandai tiga kali: warna, centang, dan bentuk yang
 * berubah dari pil menjadi kotak membulat — shape morph M3 Expressive.
 */
export function FilterChip({ selected, children, showCheck = true, className, ...rest }: FilterChipProps) {
	return (
		<button
			{...rest}
			type="button"
			aria-pressed={selected}
			className={cx(
				"m3-filter-chip m3-state inline-flex min-h-10 items-center gap-1.5 px-4 text-label-large font-semibold",
				"transition-[border-radius,background-color,color,border-color] duration-200 ease-emphasized",
				"disabled:pointer-events-none disabled:opacity-40",
				selected
					? "rounded-sm bg-secondary-container text-on-secondary-container"
					: "rounded-full border border-outline text-on-surface-variant",
				className,
			)}
		>
			{selected && showCheck ? <Check size={18} weight="bold" aria-hidden /> : null}
			{children}
		</button>
	);
}
