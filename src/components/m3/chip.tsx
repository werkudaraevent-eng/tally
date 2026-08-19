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
const TONE: Record<ChipTone, string> = {
	neutral: "bg-surface-container-high text-on-surface-variant",
	primary: "bg-primary-container text-on-primary-container",
	success: "bg-success-container text-on-success-container",
	warning: "bg-warning-container text-on-warning-container",
	error: "bg-error-container text-on-error-container",
};

export function StatusChip({ tone = "neutral", icon, children, className }: { tone?: ChipTone; icon?: ReactNode; children: ReactNode; className?: string }) {
	return (
		<span className={cx("inline-flex min-h-8 items-center gap-1.5 rounded-sm px-3 text-label-large font-semibold", TONE[tone], className)}>
			{icon}
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
				"m3-state inline-flex min-h-10 items-center gap-1.5 px-4 text-label-large font-semibold",
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
