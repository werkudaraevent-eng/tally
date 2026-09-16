"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/m3/cx";

/**
 * Label duduk DI ATAS kolom, bukan mengambang di dalamnya seperti kolom teks M3
 * baku.
 *
 * Label mengambang menghemat tinggi dengan menukarnya dengan dua hal yang mahal
 * di sini: label menjadi sekecil 12px begitu kolom terisi, dan posisinya
 * berpindah saat difokuskan. Staf yang memeriksa ulang formulir yang sudah diisi
 * harus membaca label sekecil itu di ruang temaram — dan itu terjadi di setiap
 * transaksi. Sisa sistemnya tetap M3: peran warna, bentuk, dan lapisan status
 * yang sama.
 */
type FieldShellProps = {
	label: ReactNode;
	/** Teks bantuan di bawah kolom. Digantikan pesan galat saat ada galat. */
	hint?: ReactNode;
	error?: string;
	/** Tampilkan penanda opsional, bukan tanda bintang wajib. */
	optional?: boolean;
	className?: string;
};

function useFieldIds(error?: string, hint?: ReactNode) {
	const id = useId();
	const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
	return { id, describedBy };
}

function FieldMessages({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
	if (error) {
		return (
			<p id={`${id}-error`} role="alert" className="mt-2 flex items-start gap-1.5 text-body-small font-medium text-error">
				<WarningCircle size={16} weight="fill" className="mt-px shrink-0" aria-hidden />
				{error}
			</p>
		);
	}
	if (hint) {
		return (
			<p id={`${id}-hint`} className="mt-2 text-body-small text-on-surface-variant">
				{hint}
			</p>
		);
	}
	return null;
}

function FieldLabel({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
	return (
		<label htmlFor={htmlFor} className="flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
			{children}
			{optional ? <span className="text-body-small font-normal text-on-surface-variant">opsional</span> : null}
		</label>
	);
}

/**
 * `outline`, bukan `outline-variant`, untuk tepi kolom.
 *
 * Tepi kolom isian membawa arti — ia memberi tahu di mana bisa mengetik.
 * `outline-variant` hanya mencapai ~2:1 terhadap permukaan, di bawah 3:1 yang
 * dituntut WCAG untuk elemen antarmuka non-teks.
 */
const CONTROL_BASE =
	"w-full rounded-lg border bg-surface-container-lowest px-3 text-body-large text-on-surface outline-none transition-[border-color,box-shadow] duration-150 ease-standard placeholder:text-on-surface-variant/70 disabled:opacity-50";

function controlClass(error?: string) {
	return cx(
		CONTROL_BASE,
		error
			? "border-error focus:border-error focus-visible:outline-error"
			: "border-outline focus:border-primary",
	);
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id" | "size"> &
	FieldShellProps & {
		leading?: ReactNode;
		trailing?: ReactNode;
		/** Tinggi kolom. `lg` untuk kolom utama layar operasional. */
		size?: "md" | "lg";
		/**
		 * Kelas untuk elemen `<input>` itu sendiri, bukan pembungkusnya.
		 *
		 * Ada karena `className` menempel di pembungkus — dan sebagian kolom butuh
		 * perlakuan pada teks yang diketik: jarak huruf lebar untuk PIN dan kode,
		 * huruf lebar tetap untuk nomor order, rata tengah untuk kolom satu angka.
		 * Tanpa jalan ini, kolom-kolom itu tetap ditulis tangan hanya karena satu
		 * kelas — dan itu persis cara markup tangan bertahan.
		 */
		inputClassName?: string;
	};

export function TextField({ label, hint, error, optional, className, inputClassName, leading, trailing, size = "md", ...rest }: TextFieldProps) {
	const { id, describedBy } = useFieldIds(error, hint);
	return (
		<div className={className}>
			<FieldLabel htmlFor={id} optional={optional}>
				{label}
			</FieldLabel>
			<div className="relative mt-2">
				{leading ? (
					<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden>
						{leading}
					</span>
				) : null}
				<input
					{...rest}
					id={id}
					aria-invalid={error ? true : undefined}
					aria-describedby={describedBy}
					className={cx(
						controlClass(error),
						size === "lg" ? "m3-field-lg h-16" : "m3-field h-14",
						!!leading && "pl-9",
						!!trailing && "pr-9",
						inputClassName,
					)}
				/>
				{trailing ? <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span> : null}
			</div>
			<FieldMessages id={id} error={error} hint={hint} />
		</div>
	);
}

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "id"> & FieldShellProps;

export function TextArea({ label, hint, error, optional, className, rows = 4, ...rest }: TextAreaProps) {
	const { id, describedBy } = useFieldIds(error, hint);
	return (
		<div className={className}>
			<FieldLabel htmlFor={id} optional={optional}>
				{label}
			</FieldLabel>
			<textarea
				{...rest}
				id={id}
				rows={rows}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy}
				className={cx(controlClass(error), "mt-2 resize-y py-3 leading-6")}
			/>
			<FieldMessages id={id} error={error} hint={hint} />
		</div>
	);
}

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "id"> &
	FieldShellProps & { children: ReactNode };

export function SelectField({ label, hint, error, optional, className, children, ...rest }: SelectFieldProps) {
	const { id, describedBy } = useFieldIds(error, hint);
	return (
		<div className={className}>
			<FieldLabel htmlFor={id} optional={optional}>
				{label}
			</FieldLabel>
			<select
				{...rest}
				id={id}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy}
				// appearance-none dilepas dengan sengaja: panah bawaan sistem ikut
				// mengikuti color-scheme, dan menggantinya dengan ikon sendiri berarti
				// membangun ulang perilaku papan ketik yang sudah benar.
				className={cx(controlClass(error), "m3-field h-14")}
			>
				{children}
			</select>
			<FieldMessages id={id} error={error} hint={hint} />
		</div>
	);
}
