"use client";

import { useRef, type ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

export type TabOption<T extends string> = {
	value: T;
	label: string;
	icon?: ReactNode;
	/** Angka kecil di samping label. Untuk jumlah hasil, bukan untuk status. */
	badge?: ReactNode;
	disabled?: boolean;
};

export type TabsProps<T extends string> = {
	options: TabOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** Nama grup untuk pembaca layar. Wajib. */
	label: string;
	/**
	 * Awalan id untuk menyambungkan tab dengan panelnya.
	 *
	 * Pemanggil membungkus isinya dengan
	 * `role="tabpanel" id={`${idPrefix}-panel-${value}`} aria-labelledby={`${idPrefix}-tab-${value}`}`.
	 * Tanpa sambungan itu pembaca layar mengumumkan tabnya lalu berhenti — isinya
	 * tidak pernah dikenali sebagai milik tab yang barusan dipilih.
	 */
	idPrefix: string;
	className?: string;
};

/**
 * Primary tabs M3.
 *
 * ---- Kenapa ini BUKAN segmented button --------------------------------------
 *
 * Spesifikasi M3 membedakan keduanya menurut apa yang berubah saat ditekan.
 * Segmented button MENYARING atau MEMILIH sesuatu di dalam tampilan yang sedang
 * dilihat — "Rp" atau "%", "Semua" atau "Belum lunas". Tab MENGGANTI tampilannya.
 *
 * Perbedaannya bukan selera, karena keduanya mengumumkan diri secara berbeda:
 * segmented button adalah `radiogroup` dan terbaca "1 dari 3 terpilih", tab
 * adalah `tablist` dan terbaca "tab 1 dari 3" beserta panel yang dikendalikannya.
 * Memakai yang salah membuat pembaca layar menjanjikan sesuatu yang tidak terjadi.
 *
 * ---- Indikator, bukan pil terisi -------------------------------------------
 *
 * Tab aktif ditandai garis 3px di tepi bawah dengan sudut membulat di ATAS saja,
 * plus warna label yang berubah ke `primary` — persis bentuk indikator M3. Pil
 * berlatar penuh adalah bahasa segmented button dan chip; dipakai di sini ia
 * membuat dua kontrol yang berbeda arti tampil dengan bentuk yang sama.
 *
 * Garis pemisah setipis 1px membentang di seluruh lebar barisan tab. Itu yang
 * membuat indikator terbaca sebagai penanda posisi pada sebuah rel, bukan sebagai
 * garis bawah yang menggantung.
 */
export function Tabs<T extends string>({ options, value, onChange, label, idPrefix, className }: TabsProps<T>) {
	const stripRef = useRef<HTMLDivElement>(null);

	/**
	 * Panah kiri/kanan berpindah tab, Home/End melompat ke ujung.
	 *
	 * Aktivasi otomatis (tab berganti begitu fokus pindah), bukan manual yang
	 * menuntut Enter. Panduan APG membolehkan keduanya dan menganjurkan otomatis
	 * ketika berpindah panel tidak mahal — di sini panelnya sudah ada di memori,
	 * jadi menuntut ketukan kedua hanya menambah kerja tanpa menambah kendali.
	 */
	const pindah = (arah: 1 | -1 | "awal" | "akhir") => {
		const bisa = options.filter((option) => !option.disabled);
		if (bisa.length === 0) return;
		const sekarang = bisa.findIndex((option) => option.value === value);
		const berikutnya =
			arah === "awal" ? 0
				: arah === "akhir" ? bisa.length - 1
					: (sekarang + arah + bisa.length) % bisa.length;
		const target = bisa[berikutnya];
		onChange(target.value);
		// Fokus ikut berpindah, bukan hanya pilihannya. Tanpa ini panah berikutnya
		// dihitung dari tab lama karena fokusnya tidak pernah beranjak.
		stripRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${idPrefix}-tab-${target.value}`)}`)?.focus();
	};

	return (
		<div ref={stripRef} role="tablist" aria-label={label} className={cx("flex border-b border-outline-variant", className)}>
			{options.map((option) => {
				const aktif = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="tab"
						id={`${idPrefix}-tab-${option.value}`}
						aria-selected={aktif}
						aria-controls={`${idPrefix}-panel-${option.value}`}
						// Hanya tab aktif yang bisa dicapai dengan Tab. Sisanya dijangkau
						// dengan panah — itu pola roving tabindex, dan tanpanya pengguna
						// papan ketik harus melewati setiap tab satu per satu untuk sampai
						// ke isi halaman.
						tabIndex={aktif ? 0 : -1}
						disabled={option.disabled}
						onClick={() => onChange(option.value)}
						onKeyDown={(event) => {
							if (event.key === "ArrowRight") { event.preventDefault(); pindah(1); }
							else if (event.key === "ArrowLeft") { event.preventDefault(); pindah(-1); }
							else if (event.key === "Home") { event.preventDefault(); pindah("awal"); }
							else if (event.key === "End") { event.preventDefault(); pindah("akhir"); }
						}}
						className={cx(
							"m3-state relative flex min-h-12 flex-1 items-center justify-center gap-2 px-4 text-title-small",
							"transition-colors duration-150 ease-standard",
							"disabled:pointer-events-none disabled:opacity-40",
							aktif ? "text-primary" : "text-on-surface-variant",
						)}
					>
						{option.icon}
						{/* `truncate` di dalam span, bukan di tombol: `overflow:hidden` pada
						    tombol akan ikut memotong indikator yang duduk di tepi bawahnya. */}
						<span className="truncate">{option.label}</span>
						{option.badge != null ? (
							<span className="rounded-full bg-surface-container-highest px-2 text-label-small text-on-surface-variant">
								{option.badge}
							</span>
						) : null}
						{aktif ? (
							<span
								aria-hidden
								className="absolute inset-x-0 bottom-0 mx-auto h-[3px] w-full rounded-t-full bg-primary"
							/>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
