"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

export type SegmentedOption<T extends string> = {
	value: T;
	label: string;
	icon?: ReactNode;
	/**
	 * Angka di belakang label: "Semua 3", "Draft 1".
	 *
	 * Slot tersendiri, bukan disambung ke `label`, karena ia diberi warna yang
	 * lebih redup. Angka setebal labelnya terbaca sebagai bagian dari nama tab,
	 * dan "Selesai 1" jadi terlihat seperti nama tab yang bernomor.
	 */
	badge?: ReactNode;
	disabled?: boolean;
};

export type SegmentedButtonProps<T extends string> = {
	options: SegmentedOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** Nama grup untuk pembaca layar. Wajib — grup tanpa nama tidak punya konteks. */
	label: string;
	/**
	 * Id label yang terlihat di atas grup. Bila ada, grup dinamai lewat label itu
	 * (aria-labelledby), bukan `label`, supaya namanya tidak dibacakan dua kali.
	 */
	labelledBy?: string;
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
 * Memakai `radiogroup`, bukan sekumpulan tombol: pembaca layar mengumumkan
 * "1 dari 3". Papan ketik mengikuti pola radio group WAI-ARIA: satu perhentian
 * Tab (opsi terpilih, roving tabindex); panah kiri/atas dan kanan/bawah
 * berpindah sekaligus memilih, memutar di ujung; Home dan End ke opsi pertama
 * dan terakhir. Opsi yang nonaktif dilewati.
 */
export function SegmentedButton<T extends string>({ options, value, onChange, label, labelledBy, compact, className }: SegmentedButtonProps<T>) {
	const aktif = options.filter((option) => !option.disabled);
	// Perhentian Tab: opsi terpilih, atau opsi aktif pertama bila tidak ada yang terpilih.
	const perhentian = aktif.some((option) => option.value === value) ? value : aktif[0]?.value;

	function tekan(event: KeyboardEvent<HTMLDivElement>) {
		if (aktif.length === 0) return;
		const sekarang = aktif.findIndex((option) => option.value === value);
		const langkah: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
		let tujuan: number;
		if (event.key in langkah) tujuan = (Math.max(sekarang, 0) + langkah[event.key] + aktif.length) % aktif.length;
		else if (event.key === "Home") tujuan = 0;
		else if (event.key === "End") tujuan = aktif.length - 1;
		else return;
		event.preventDefault();
		const pilihan = aktif[tujuan].value;
		onChange(pilihan);
		event.currentTarget.querySelector<HTMLButtonElement>(`[data-nilai="${CSS.escape(pilihan)}"]`)?.focus();
	}

	return (
		<div role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} onKeyDown={tekan} className={cx("m3-segment-group inline-flex items-center gap-0.5 rounded-lg bg-primary-soft p-[3px]", className)}>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						data-nilai={option.value}
						tabIndex={option.value === perhentian ? 0 : -1}
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
						{option.badge != null ? (
							<span className={cx("tabular-nums", selected ? "text-on-surface-variant" : "text-outline")}>{option.badge}</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
