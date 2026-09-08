"use client";

import { Check, X } from "@phosphor-icons/react";
import { useId, type ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

export type SwitchProps = {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: ReactNode;
	description?: ReactNode;
	disabled?: boolean;
	className?: string;
};

/**
 * Sakelar M3, dengan ikon di dalam kenopnya.
 *
 * Ikon centang/silang bukan hiasan. Sakelar yang hanya bergeser dan berganti
 * warna tidak bisa dibaca oleh siapa pun yang tidak yakin ke arah mana "menyala"
 * berada — dan di layar admin, salah membaca `leaderboard_enabled` berarti layar
 * panggung menampilkan hal yang salah di depan tamu.
 *
 * Kenopnya membesar saat menyala, sesuai spesifikasi: perubahan ukuran terbaca
 * bahkan lewat sudut mata.
 */
export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
	const id = useId();
	return (
		<div className={cx("flex items-start gap-4", className)}>
			<button
				type="button"
				role="switch"
				id={id}
				aria-checked={checked}
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={cx(
					"relative mt-0.5 inline-flex h-8 w-13 shrink-0 items-center rounded-full border-2 transition-colors duration-200 ease-emphasized",
					"disabled:pointer-events-none disabled:opacity-40",
					checked ? "border-primary bg-primary" : "border-outline bg-surface-container-highest",
				)}
			>
				{/* Kenop selalu 24px; keadaan mati MENYUSUTKANNYA lewat `scale`, bukan
				    mengganti `size`. Lebar dan tinggi yang dianimasikan memaksa
				    perhitungan tata letak tiap frame — aturan DESIGN.md — sedangkan
				    `scale` dan `translate` dikerjakan kompositor. Posisinya pun lewat
				    `translate`, bukan `margin-left: auto` yang tidak bisa dianimasikan. */}
				<span
					className={cx(
						"m3-state absolute left-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full transition-[translate,scale,background-color,color] duration-200 ease-emphasized",
						checked
							? "translate-x-5 bg-on-primary text-primary"
							: "-translate-x-1 scale-[0.667] bg-outline text-surface-container-highest",
					)}
				>
					{checked ? <Check size={14} weight="bold" aria-hidden /> : <X size={14} weight="bold" aria-hidden />}
				</span>
			</button>
			<label htmlFor={id} className={cx("cursor-pointer select-none", disabled && "opacity-40")}>
				<span className="block text-body-large font-semibold text-on-surface">{label}</span>
				{description ? <span className="mt-0.5 block text-body-small text-on-surface-variant">{description}</span> : null}
			</label>
		</div>
	);
}
