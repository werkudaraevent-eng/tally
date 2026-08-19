"use client";

import { CircleNotch } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cx } from "@/lib/m3/cx";

/**
 * Lima gaya tombol M3, diurutkan dari yang paling menuntut perhatian.
 *
 * Satu layar hanya boleh punya satu `filled`. Kalau ada dua, tidak ada yang
 * menonjol dan operator harus membaca teksnya untuk tahu mana yang dituju —
 * persis yang tidak sempat dilakukan sambil berdiri.
 */
export type ButtonVariant = "filled" | "tonal" | "elevated" | "outlined" | "text" | "danger";

/**
 * Tinggi, bukan padding. Target sentuh adalah ukuran yang berarti di layar yang
 * dipakai dengan ibu jari; padding hanya cara mencapainya.
 *
 * `xl` memenuhi tinggi minimal 64px untuk aksi utama layar operasional.
 */
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<ButtonVariant, string> = {
	filled: "bg-primary text-on-primary",
	tonal: "bg-secondary-container text-on-secondary-container",
	elevated: "bg-surface-container-low text-primary shadow-level1 hover:shadow-level2",
	outlined: "border border-outline text-primary",
	text: "text-primary",
	danger: "bg-error text-on-error",
};

const SIZE: Record<ButtonSize, string> = {
	sm: "min-h-10 gap-1.5 px-4 text-label-large",
	md: "min-h-12 gap-2 px-5 text-label-large",
	lg: "min-h-14 gap-2.5 px-6 text-title-medium",
	xl: "min-h-16 gap-3 px-7 text-title-medium",
};

/** Ikon menyusut mengikuti tombol supaya optiknya tetap seimbang dengan teks. */
const ICON_SIZE: Record<ButtonSize, number> = { sm: 18, md: 20, lg: 22, xl: 24 };

type Shape = "round" | "square" | "pill";

const SHAPE: Record<Shape, string> = {
	round: "rounded-md",
	square: "rounded-xs",
	pill: "rounded-full",
};

/** Bentuk saat ditekan — shape morph M3 Expressive. */
const SHAPE_PRESSED: Record<Shape, string> = {
	round: "active:rounded-xs",
	square: "active:rounded-md",
	pill: "active:rounded-md",
};

type CommonProps = {
	variant?: ButtonVariant;
	size?: ButtonSize;
	shape?: Shape;
	/** Isi selebar induknya. Aksi utama layar operasional hampir selalu begini. */
	block?: boolean;
	icon?: ReactNode;
	trailingIcon?: ReactNode;
	children?: ReactNode;
	className?: string;
};

function baseClass({ variant = "filled", size = "md", shape = "round", block, className }: CommonProps) {
	return cx(
		"m3-state inline-flex select-none items-center justify-center font-semibold",
		// Transisi menyertakan border-radius supaya shape morph ikut bergerak,
		// bukan melompat. Durasi pendek: ini umpan balik sentuhan, bukan animasi.
		"transition-[border-radius,background-color,box-shadow,color] duration-150 ease-standard",
		"disabled:pointer-events-none disabled:opacity-40",
		VARIANT[variant],
		SIZE[size],
		SHAPE[shape],
		SHAPE_PRESSED[shape],
		block && "w-full",
		className,
	);
}

function content({ icon, trailingIcon, children, size = "md", loading }: CommonProps & { loading?: boolean }) {
	return (
		<>
			{loading ? (
				<CircleNotch size={ICON_SIZE[size]} weight="bold" className="animate-spin" aria-hidden />
			) : (
				icon
			)}
			{children}
			{trailingIcon}
		</>
	);
}

export type ButtonProps = CommonProps &
	Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
		/**
		 * Menonaktifkan tombol DAN menukar ikon depan dengan pemintal. Teksnya
		 * sengaja tidak ikut diganti: label yang berubah menjadi "Memproses..."
		 * membuat lebar tombol melompat dan menghapus satu-satunya petunjuk
		 * tentang apa yang sedang terjadi.
		 */
		loading?: boolean;
	};

export function Button({ variant, size = "md", shape, block, icon, trailingIcon, className, loading, children, disabled, ...rest }: ButtonProps) {
	return (
		<button
			{...rest}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={baseClass({ variant, size, shape, block, className })}
		>
			{content({ icon, trailingIcon, children, size, loading })}
		</button>
	);
}

export type ButtonLinkProps = CommonProps & {
	href: string;
	prefetch?: boolean;
	target?: string;
	rel?: string;
	onClick?: () => void;
	"aria-label"?: string;
};

/**
 * Versi tautan. Terpisah dari `Button`, bukan prop `as`: pindah halaman dan
 * menjalankan aksi adalah dua hal berbeda bagi pembaca layar dan bagi orang yang
 * menekan Ctrl+klik, dan menyamarkannya di balik satu komponen membuat perbedaan
 * itu mudah hilang.
 */
export function ButtonLink({ href, variant, size = "md", shape, block, icon, trailingIcon, className, children, ...rest }: ButtonLinkProps) {
	return (
		<Link {...rest} href={href} className={baseClass({ variant, size, shape, block, className })}>
			{content({ icon, trailingIcon, children, size })}
		</Link>
	);
}
