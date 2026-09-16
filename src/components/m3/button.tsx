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

/**
 * Gaya tombol, ditulis dengan PERAN warna, bukan hex.
 *
 * Itu yang membuat satu tabel ini melayani dua dunia sekaligus. Di ruang kerja
 * (`.press`) `primary-soft` adalah #F2F2F2 dan `secondary-container` #EDEDED,
 * jadi `tonal` menjadi tombol abu bertingkat seperti di dasbor acuan. Di layar
 * booth dan kasir peran yang sama masih membawa nada birunya, dan tombol di sana
 * tetap terbaca dari jarak satu meter. Menulis #F2F2F2 langsung akan memaksa
 * ruang kerja dan layar operasional bertukar tempat.
 *
 * `filled` bergaris tepi sewarna latarnya. Terdengar percuma, tetapi ia yang
 * membuat tombol biru duduk pada garis dasar yang sama dengan tombol bergaris di
 * sebelahnya: tanpa border, tingginya berbeda satu piksel di atas dan di bawah.
 */
const VARIANT: Record<ButtonVariant, string> = {
	filled: "border border-primary bg-primary text-on-primary hover:bg-primary-dim",
	tonal: "border border-transparent bg-primary-soft text-on-primary-soft hover:bg-secondary-container",
	elevated: "border border-outline-variant bg-surface-container-lowest text-on-surface shadow-level1 hover:bg-primary-soft",
	outlined: "border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-primary-soft",
	text: "border border-transparent text-on-surface hover:bg-primary-soft",
	danger: "border border-error bg-error text-on-error",
};

const SIZE: Record<ButtonSize, string> = {
	sm: "min-h-10 gap-1.5 px-3 text-label-large",
	md: "min-h-12 gap-1.5 px-4 text-label-large",
	lg: "min-h-14 gap-2 px-5 text-title-medium",
	xl: "min-h-16 gap-2.5 px-6 text-title-medium",
};

/** Ikon menyusut mengikuti tombol supaya optiknya tetap seimbang dengan teks. */
const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 16, lg: 18, xl: 20 };

type Shape = "round" | "square" | "pill";

const SHAPE: Record<Shape, string> = {
	round: "rounded-lg",
	square: "rounded-xs",
	pill: "rounded-full",
};

/** Bentuk saat ditekan — shape morph M3 Expressive. */
const SHAPE_PRESSED: Record<Shape, string> = {
	round: "active:rounded-md",
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
		// `m3-btn` kait untuk profil permukaan, bukan gaya. Dipasangkan dengan
		// atribut `data-size` di elemennya, `.press` memangkas tinggi tiap ukuran
		// ke kepadatan desktop — lihat globals.css. Layar operasional tidak
		// ber-`.press`, jadi target sentuh besarnya utuh.
		"m3-btn m3-state inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
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
			data-size={size}
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
		<Link {...rest} href={href} data-size={size} className={baseClass({ variant, size, shape, block, className })}>
			{content({ icon, trailingIcon, children, size })}
		</Link>
	);
}
