"use client";

import { useId, type ReactNode } from "react";
import { SegmentedButton, type SegmentedOption } from "./segmented-button";
import { FieldMessages } from "./text-field";

export type SegmentedFieldProps<T extends string> = {
	label: string;
	options: SegmentedOption<T>[];
	value: T;
	onChange: (value: T) => void;
	hint?: ReactNode;
	error?: string;
	/** Untuk formulir yang dikirim lewat FormData: nilai ikut sebagai input tersembunyi. */
	name?: string;
	className?: string;
};

/**
 * Kolom formulir pilihan tunggal: label, segmented button selebar kolom, petunjuk.
 *
 * Pengganti `SelectField` bila pilihannya TETAP dan cuma dua sampai empat,
 * berlabel pendek (Outbound/Return, WIB/WITA/WIT, Laser/Inkjet). Semua opsi
 * terlihat, satu ketukan, tanpa daftar sistem operasi yang muncul gelap di
 * Android. Daftar yang panjang atau datang dari data (hotel, sesi, peran) tetap
 * `SelectField`: segmen yang jumlahnya ikut data akan pecah di layar 360px.
 *
 * Tingginya sama dengan kolom isian di ruang kerja (36px) supaya sejajar dengan
 * TextField di sebelahnya. Di layar sentuh bidang tekan tiap segmen diperluas
 * ke 48px tanpa mengubah tingginya (globals.css, target sentuh M3).
 */
export function SegmentedField<T extends string>({ label, options, value, onChange, hint, error, name, className }: SegmentedFieldProps<T>) {
	const id = useId();
	return (
		<div className={className}>
			<p id={`${id}-label`} className="m3-field-label text-label-large font-semibold text-on-surface">{label}</p>
			<SegmentedButton
				className="mt-2 flex w-full"
				label={label}
				labelledBy={`${id}-label`}
				describedBy={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
				field
				value={value}
				onChange={onChange}
				options={options}
			/>
			{name ? <input type="hidden" name={name} value={value} /> : null}
			<FieldMessages id={id} error={error} hint={hint} />
		</div>
	);
}
