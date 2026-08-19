import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

/**
 * Tiga jenis kartu M3, berbeda dalam cara memisahkan diri dari kanvas.
 *
 * `filled` memakai elevasi tonal — permukaannya naik satu tingkat, tanpa
 * bayangan. Itu bawaan yang dipakai hampir di mana-mana: bayangan di layar padat
 * data hanya menambah kabur tanpa menambah arti.
 *
 * `elevated` menyimpan bayangan untuk hal yang benar-benar melayang.
 * `outlined` untuk kartu yang harus punya tepi tegas, mis. di dalam kartu lain.
 */
export type CardVariant = "filled" | "elevated" | "outlined";

const VARIANT: Record<CardVariant, string> = {
	filled: "bg-surface-container",
	elevated: "bg-surface-container-low shadow-level1",
	outlined: "border border-outline-variant bg-surface-container-lowest",
};

export type CardProps = HTMLAttributes<HTMLDivElement> & {
	variant?: CardVariant;
	/** Padding bawaan. Matikan untuk kartu yang isinya harus menyentuh tepi (tabel, gambar). */
	padded?: boolean;
	children: ReactNode;
};

export function Card({ variant = "filled", padded = true, className, children, ...rest }: CardProps) {
	return (
		<div {...rest} className={cx("rounded-lg", VARIANT[variant], padded && "p-5", className)}>
			{children}
		</div>
	);
}

export type CardHeaderProps = {
	title: ReactNode;
	subtitle?: ReactNode;
	/** Ikon, chip status, atau tombol. Diletakkan di kanan, sejajar judul. */
	trailing?: ReactNode;
	className?: string;
};

export function CardHeader({ title, subtitle, trailing, className }: CardHeaderProps) {
	return (
		<div className={cx("flex items-start justify-between gap-4", className)}>
			<div className="min-w-0">
				<h2 className="text-title-medium font-semibold text-on-surface">{title}</h2>
				{subtitle ? <p className="mt-1 text-body-medium text-on-surface-variant">{subtitle}</p> : null}
			</div>
			{trailing ? <div className="shrink-0">{trailing}</div> : null}
		</div>
	);
}
