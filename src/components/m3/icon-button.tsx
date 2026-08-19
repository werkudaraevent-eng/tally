"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

export type IconButtonVariant = "standard" | "filled" | "tonal" | "outlined";
export type IconButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<IconButtonVariant, string> = {
	standard: "text-on-surface-variant",
	filled: "bg-primary text-on-primary",
	tonal: "bg-secondary-container text-on-secondary-container",
	outlined: "border border-outline text-on-surface-variant",
};

/**
 * Ukuran terkecil tetap 40px, bukan 32px seperti spesifikasi ponsel.
 *
 * Layar ini dipakai sambil berdiri, sering dengan satu tangan memegang alat
 * pemindai. Target 32px berarti meleset, dan meleset di layar kasir berarti
 * mengulang transaksi.
 */
const SIZE: Record<IconButtonSize, string> = {
	sm: "size-10",
	md: "size-12",
	lg: "size-14",
};

export const ICON_BUTTON_ICON_SIZE: Record<IconButtonSize, number> = { sm: 18, md: 22, lg: 26 };

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
	/** Wajib. Tombol ikon tanpa nama tidak terbaca sama sekali oleh pembaca layar. */
	label: string;
	children: ReactNode;
	variant?: IconButtonVariant;
	size?: IconButtonSize;
	/**
	 * Tombol dua keadaan. Saat aktif, bentuknya berubah dari lingkaran menjadi
	 * kotak membulat — penanda kedua di samping warna, supaya keadaannya tetap
	 * terbaca di layar dengan kontras buruk.
	 */
	selected?: boolean;
	className?: string;
};

export function IconButton({ label, children, variant = "standard", size = "md", selected, className, ...rest }: IconButtonProps) {
	return (
		<button
			{...rest}
			aria-label={label}
			title={label}
			aria-pressed={selected === undefined ? undefined : selected}
			className={cx(
				"m3-state inline-flex shrink-0 items-center justify-center",
				"transition-[border-radius,background-color,color] duration-150 ease-standard",
				"disabled:pointer-events-none disabled:opacity-40",
				SIZE[size],
				selected ? "rounded-lg bg-primary text-on-primary" : cx(VARIANT[variant], "rounded-full active:rounded-lg"),
				className,
			)}
		>
			{children}
		</button>
	);
}
