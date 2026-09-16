"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

export type SegmentedOption<T extends string> = {
	value: T;
	label: string;
	icon?: ReactNode;
	disabled?: boolean;
};

export type SegmentedButtonProps<T extends string> = {
	options: SegmentedOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** Nama grup untuk pembaca layar. Wajib — grup tanpa nama tidak punya konteks. */
	label: string;
	/** Sembunyikan teks di layar sempit, sisakan ikon. Butuh `icon` di tiap opsi. */
	compact?: boolean;
	className?: string;
};

/**
 * Pilihan tunggal yang seluruh opsinya terlihat sekaligus.
 *
 * Dipakai menggantikan dropdown ketika opsinya dua sampai empat dan pilihannya
 * sering diubah. Dropdown menyembunyikan opsi di balik satu ketukan tambahan dan
 * tidak pernah memberi tahu apa saja yang tersedia — mahal di layar yang
 * dioperasikan sambil berdiri.
 *
 * Memakai `radiogroup`, bukan sekumpulan tombol: panah kiri/kanan berpindah
 * antar opsi, dan pembaca layar mengumumkan "1 dari 3".
 */
export function SegmentedButton<T extends string>({ options, value, onChange, label, compact, className }: SegmentedButtonProps<T>) {
	return (
		<div role="radiogroup" aria-label={label} className={cx("m3-segment-group inline-flex items-center gap-0.5 rounded-lg bg-primary-soft p-[3px]", className)}>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						disabled={option.disabled}
						onClick={() => onChange(option.value)}
						title={compact ? option.label : undefined}
						className={cx(
							// `whitespace-nowrap`: labelnya dua kata seperti "User & role" dan
							// "Audit trail". Tanpa ini flexbox menyusutkan tombolnya sampai
							// selebar kata terpanjang lalu memecah labelnya jadi dua baris —
							// grup tombol setinggi dua baris di tengah ruang yang masih lapang.
							"m3-segmented m3-state flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-label-large",
							"transition-[background-color,color,box-shadow] duration-150 ease-standard",
							"disabled:pointer-events-none disabled:opacity-40",
							// Tab terpilih adalah kepingan PUTIH yang terangkat dari alas abu,
							// bukan bidang biru. Biru di sini bersaing dengan satu-satunya
							// tombol biru yang boleh ada per layar, dan tab bukan aksi — ia
							// penanda tempat.
							selected
								? "border border-outline-variant bg-surface-container-lowest font-medium text-on-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
								: "border border-transparent text-on-surface-variant hover:text-on-surface",
						)}
					>
						{option.icon}
						<span className={cx(compact && "sr-only sm:not-sr-only")}>{option.label}</span>
					</button>
				);
			})}
		</div>
	);
}
