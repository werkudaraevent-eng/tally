"use client";

import { useId, type ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

export type SwitchProps = {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: ReactNode;
	description?: ReactNode;
	disabled?: boolean;
	/** Peringatan atau catatan di bawah deskripsi, di dalam baris yang sama. */
	note?: ReactNode;
	className?: string;
};

/**
 * Sakelar: teks di kiri, kontrol di kanan.
 *
 * ---- Kenapa ikon centang/silang dibuang ----------------------------------
 *
 * Ikon di dalam kenop pernah ada di sini, dan alasannya masuk akal: sakelar yang
 * hanya bergeser dan berganti warna gagal bagi siapa pun yang tidak membedakan
 * biru dan abu. Ternyata itu salah membaca masalahnya. Yang membedakan hidup
 * dari mati bukan warnanya, melainkan POSISI kenop — kiri atau kanan — dan itu
 * isyarat bentuk, bukan warna. Ikonnya menambah satu hal untuk dibaca pada
 * kontrol setinggi 20px, dan pada empat sakelar berderet hasilnya adalah empat
 * lencana bulat yang menarik mata lebih dulu daripada teksnya sendiri.
 *
 * Yang ditinggalkan tetap dijaga: `role="switch"` dan `aria-checked` mengumumkan
 * keadaannya, dan labelnya sendiri mengatakan apa yang menyala.
 *
 * ---- Kenapa teks di kiri -------------------------------------------------
 *
 * Sakelar di kiri memaksa kolom kontrol selebar 36px berdiri di depan setiap
 * baris, dan pada daftar setelan mata harus melewatinya empat kali sebelum
 * sampai ke kata pertama. Dengan kontrol di kanan, keempat sakelar berbaris pada
 * satu sumbu tegak di tepi kanan: satu tempat untuk dilihat kalau yang dicari
 * adalah keadaannya, dan kolom teks yang mulai rata kiri kalau yang dicari
 * adalah artinya.
 */
export function Switch({ checked, onChange, label, description, disabled, note, className }: SwitchProps) {
	const id = useId();
	const labelId = `${id}-label`;
	const descId = description ? `${id}-desc` : undefined;

	return (
		<div className={cx("flex items-start justify-between gap-6", className)}>
			{/* Seluruh blok teks bisa ditekan, bukan hanya sakelarnya. Target 36x20px
			    adalah target terkecil di layar ini; judul dan deskripsinya jauh lebih
			    mudah dikenai, dan orang memang mengarahkan ke sana lebih dulu. */}
			<div
				onClick={() => { if (!disabled) onChange(!checked); }}
				className={cx("min-w-0 flex-1", disabled ? "opacity-50" : "cursor-pointer")}
			>
				{/* `<div>`, bukan `<button>` kedua. Dua tombol untuk satu sakelar berarti
				    papan ketik berhenti dua kali di baris yang sama dan pembaca layar
				    mengumumkan kontrolnya dua kali. Blok ini hanya memperbesar sasaran
				    tetikus; keadaannya diumumkan oleh sakelar di sebelahnya, yang
				    menamai dirinya dari teks di sini lewat `aria-labelledby`. */}
				<span id={labelId} className="block text-body-medium font-medium text-on-surface">{label}</span>
				{description ? (
					<span id={descId} className="mt-0.5 block max-w-[40rem] text-body-medium text-on-surface-variant">{description}</span>
				) : null}
				{note ? <span className="mt-3 block">{note}</span> : null}
			</div>

			<button
				type="button"
				role="switch"
				id={id}
				aria-checked={checked}
				aria-labelledby={labelId}
				aria-describedby={descId}
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={cx(
					"relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ease-standard",
					"disabled:cursor-not-allowed disabled:opacity-50",
					checked ? "bg-primary" : "bg-outline-variant",
				)}
			>
				{/* Kenop digerakkan `translate`, bukan `left`. Properti tata letak
				    dianimasikan di thread utama dan menghitung ulang posisi tiap frame;
				    `translate` dikerjakan kompositor. Aturannya ada di DESIGN.md. */}
				<span
					aria-hidden
					className={cx(
						"absolute left-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-150 ease-standard",
						checked ? "translate-x-4" : "translate-x-0",
					)}
				/>
			</button>
		</div>
	);
}
