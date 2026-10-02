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

type CounterProps = {
	/**
	 * Penghitung karakter di kanan bawah, mis. "312/480". Butuh `maxLength`.
	 * Melewati `ideal`, penghitung berubah kuning dan menyebut angka idealnya,
	 * jadi artinya tidak bergantung pada warna saja.
	 */
	counter?: boolean | { ideal?: number };
};

type Hitungan = { length: number; max: number; ideal?: number };

function hitungan(counter: CounterProps["counter"], value: unknown, maxLength: number | undefined): Hitungan | null {
	if (!counter || !maxLength) return null;
	return { length: typeof value === "string" ? value.length : 0, max: maxLength, ideal: typeof counter === "object" ? counter.ideal : undefined };
}

function useFieldIds(error?: string, hint?: ReactNode) {
	const id = useId();
	const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
	return { id, describedBy };
}

/**
 * Penghitung ikut dibacakan (aria-describedby), dan kolom yang isinya melewati
 * batas ditandai aria-invalid: warna merah "· batas" saja tidak sampai ke
 * pembaca layar (WCAG 3.3.1, 4.1.2). Isi bisa melewati maxLength bila diisi
 * dari data (Impor, data lama), bukan diketik.
 */
function ariaKolom(id: string, describedBy: string | undefined, error: string | undefined, count: Hitungan | null) {
	return {
		"aria-invalid": error || (count && count.length > count.max) ? true : undefined,
		"aria-describedby": [describedBy, count ? `${id}-count` : null].filter(Boolean).join(" ") || undefined,
	} as const;
}

function Penghitung({ id, count }: { id: string; count: Hitungan }) {
	const lewat = count.ideal !== undefined && count.length > count.ideal;
	const penuh = count.length >= count.max;
	return (
		<span
			id={`${id}-count`}
			className={cx(
				"shrink-0 text-body-small tabular-nums",
				penuh ? "font-medium text-error" : lewat ? "font-medium text-on-warning-soft" : "text-on-surface-variant",
			)}
		>
			{count.length}/{count.max}
			{penuh ? " · batas" : lewat ? ` · ideal ${count.ideal}` : null}
		</span>
	);
}

function FieldMessages({ id, error, hint, count }: { id: string; error?: string; hint?: ReactNode; count?: Hitungan | null }) {
	if (count) {
		return (
			<div className="mt-2 flex items-start justify-between gap-3">
				<div className="min-w-0 [&>p]:mt-0">
					<FieldMessages id={id} error={error} hint={hint} />
				</div>
				<Penghitung id={id} count={count} />
			</div>
		);
	}
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
		<label htmlFor={htmlFor} className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
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
	FieldShellProps & CounterProps & {
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

export function TextField({ label, hint, error, optional, className, inputClassName, leading, trailing, size = "md", counter, ...rest }: TextFieldProps) {
	const { id, describedBy } = useFieldIds(error, hint);
	const count = hitungan(counter, rest.value, rest.maxLength);
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
					{...ariaKolom(id, describedBy, error, count)}
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
			<FieldMessages id={id} error={error} hint={hint} count={count} />
		</div>
	);
}

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "id"> & FieldShellProps & CounterProps;

export function TextArea({ label, hint, error, optional, className, rows = 4, counter, ...rest }: TextAreaProps) {
	const { id, describedBy } = useFieldIds(error, hint);
	const count = hitungan(counter, rest.value, rest.maxLength);
	return (
		<div className={className}>
			<FieldLabel htmlFor={id} optional={optional}>
				{label}
			</FieldLabel>
			<textarea
				{...rest}
				id={id}
				rows={rows}
				{...ariaKolom(id, describedBy, error, count)}
				className={cx(controlClass(error), "mt-2 resize-y py-3 leading-6")}
			/>
			<FieldMessages id={id} error={error} hint={hint} count={count} />
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
