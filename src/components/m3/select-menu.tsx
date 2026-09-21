"use client";

import { CaretDown, CaretUpDown, Check } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Popover, usePopoverAnchor } from "./popover";
import { cx } from "@/lib/m3/cx";

/**
 * Penyaring pilihan tunggal. Tombol + daftar mengambang, bukan `<select>` bawaan.
 *
 * ---- Kenapa bukan `<select>` ----------------------------------------------
 *
 * Tiga hal yang tidak bisa dikerjakan `<select>`, dan ketiganya terlihat di
 * layar Daftar peserta:
 *
 *   1. **Lebarnya ditentukan isi terpanjang.** "Semua kehadiran" membuat satu
 *      penyaring jauh lebih lebar daripada dua tetangganya, dan tiga kotak
 *      dengan tiga lebar berbeda berdiri berjajar terbaca sebagai tiga jenis
 *      kontrol yang berbeda.
 *   2. **Teks panjang tidak bisa dipotong.** Tidak ada `text-overflow` di dalam
 *      `<select>`; nama sesi kehadiran sepanjang tujuh kata melebarkan kotaknya
 *      sampai melewati tepi layar.
 *   3. **Tinggi dan huruf daftarnya milik sistem operasi.** Di Windows ia
 *      muncul sebagai daftar 11px bergaris siku di tengah antarmuka 14px.
 *
 * Yang HILANG dengan menggantinya nyata dan dicatat di sini supaya tidak
 * ditemukan lagi nanti: papan ketik ponsel tidak lagi memunculkan roda pilihan
 * asli, dan pengetikan huruf pertama untuk melompat ke opsi tidak ada. Yang
 * pertama tidak berlaku — ini kontrol di layar kerja desktop. Yang kedua
 * diganti panah dan Home/End di bawah.
 */

export type SelectOption<T extends string> = { value: T; label: string };

export type SelectMenuProps<T extends string> = {
	options: SelectOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** Nama kontrol untuk pembaca layar. Wajib: kontrol tanpa nama tidak punya konteks. */
	label: string;
	/**
	 * Ikon penanda.
	 *
	 * `filter` memakai satu caret ke bawah, `sort` memakai caret ganda. Bedanya
	 * bukan hiasan: satu caret berarti "buka daftar", caret ganda berarti "nilai
	 * ini punya arah". Dasbor acuan memakai perbedaan yang sama.
	 */
	kind?: "filter" | "sort";
	/** Lebar tetap, supaya beberapa penyaring berjajar punya lebar yang sama. */
	width?: string;
	className?: string;
	disabled?: boolean;
};

export function SelectMenu<T extends string>({
	options, value, onChange, label, kind = "filter", width = "12.5rem", className, disabled,
}: SelectMenuProps<T>) {
	const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
	const menu = usePopoverAnchor(pemicu);
	const [sorot, setSorot] = useState(0);
	const id = useId();
	const open = menu.open;

	const terpilih = options.find((option) => option.value === value);

	function buka() {
		if (disabled) return;
		// Sorot mulai dari yang sedang dipilih, bukan dari atas. Panah bawah dari
		// opsi teratas di daftar yang pilihannya ada di nomor tujuh berarti tujuh
		// ketukan hanya untuk kembali ke tempat semula.
		setSorot(Math.max(0, options.findIndex((option) => option.value === value)));
		menu.buka();
	}

	function pilih(option: SelectOption<T>) {
		onChange(option.value);
		menu.tutup();
		menu.fokus();
	}

	function onKeyDown(peristiwa: React.KeyboardEvent) {
		if (!open) {
			if (peristiwa.key === "ArrowDown" || peristiwa.key === "Enter" || peristiwa.key === " ") {
				peristiwa.preventDefault();
				buka();
			}
			return;
		}
		if (peristiwa.key === "Escape") { peristiwa.stopPropagation(); menu.tutup(); menu.fokus(); return; }
		if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
			peristiwa.preventDefault();
			const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
			setSorot((indeks) => (indeks + arah + options.length) % options.length);
			return;
		}
		if (peristiwa.key === "Home") { peristiwa.preventDefault(); setSorot(0); return; }
		if (peristiwa.key === "End") { peristiwa.preventDefault(); setSorot(options.length - 1); return; }
		if (peristiwa.key === "Enter" || peristiwa.key === " ") {
			peristiwa.preventDefault();
			if (options[sorot]) pilih(options[sorot]);
		}
	}

	const Ikon = kind === "sort" ? CaretUpDown : CaretDown;

	return (
		<div className={cx("relative", className)} style={{ width }}>
			<button
				ref={setPemicu}
				type="button"
				disabled={disabled}
				// `role="combobox"`, bukan tombol biasa. `aria-activedescendant` hanya
				// berlaku pada peran yang memang memiliki daftar pilihan, dan itulah
				// yang dikerjakan kontrol ini: satu nilai terpilih, daftar di baliknya.
				role="combobox"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				// Fokus TETAP di tombol selama daftar terbuka, dan yang bergerak adalah
				// `aria-activedescendant`. Itu pola combobox: memindahkan fokus asli ke
				// dalam daftar berarti menutupnya membuang fokus entah ke mana, dan
				// pengguna papan ketik kehilangan tempatnya di deretan penyaring.
				aria-activedescendant={open && options[sorot] ? `${id}-${options[sorot].value}` : undefined}
				aria-label={label}
				onClick={() => (open ? menu.tutup() : buka())}
				onKeyDown={onKeyDown}
				className={cx(
					"m3-field flex h-9 w-full items-center gap-2 rounded-lg border bg-surface-container-lowest px-3 text-left text-body-medium text-on-surface",
					"transition-[border-color,box-shadow] duration-150 ease-standard disabled:opacity-50",
					open ? "border-primary" : "border-outline",
				)}
			>
				{/* Label terpotong dengan elipsis, bukan dibiarkan melebarkan kotaknya.
				    Lebar penyaring ditetapkan pemanggil supaya beberapa yang berjajar
				    sejajar; yang menyesuaikan adalah teksnya. */}
				<span className="min-w-0 flex-1 truncate">{terpilih?.label ?? label}</span>
				<Ikon size={14} className="shrink-0 text-on-surface-variant" aria-hidden />
			</button>

			{/* Daftar dirender lewat PORTAL, bukan `absolute` di dalam pembungkus ini.
			    Penyaring sering berdiri di dalam kartu ber-`overflow: hidden`, dan di
			    sana daftar yang lebih panjang daripada sisa kartu akan terpotong di
			    tepinya. Lihat catatan di `m3/popover.tsx`. */}
			{open ? (
				<Popover anchor={menu} id={id} label={label} role="listbox" align="start" width={width} className="p-1">
					<ul>
						{options.map((option, indeks) => {
							const aktif = option.value === value;
							return (
								<li key={option.value}>
									<button
										type="button"
										role="option"
										id={`${id}-${option.value}`}
										aria-selected={aktif}
										onClick={() => pilih(option)}
										onPointerMove={() => setSorot(indeks)}
										className={cx(
											"flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-body-medium",
											indeks === sorot ? "bg-primary-soft" : "",
										)}
									>
										<span className="min-w-0 flex-1 truncate">{option.label}</span>
										{aktif ? <Check size={14} weight="bold" className="shrink-0" aria-hidden /> : null}
									</button>
								</li>
							);
						})}
					</ul>
				</Popover>
			) : null}
		</div>
	);
}
