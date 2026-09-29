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
	// `m3-card` adalah kait untuk profil permukaan, bukan gaya. Di `.press` kartu
	// mendapat garis tepi karena profil itu tidak punya bayangan dan langkah
	// nadanya terlalu kecil untuk memisahkan kartu dari kanvas sendirian —
	// lihat globals.css.
	//
	// `px-5 py-4`, bukan `p-5`. Padding di sekitar teks tidak simetris secara
	// optik: tinggi baris sudah menyumbang ruang menegak, jadi 20px di atas dan
	// bawah membuat kartu terbaca lebih longgar ke bawah daripada ke samping.
	// Acuan menyebut `p-5` namanya sebagai contoh yang harus dihindari.
	return (
		<div {...rest} className={cx("m3-card rounded-lg", VARIANT[variant], padded && "px-5 py-4", className)}>
			{children}
		</div>
	);
}

/**
 * Kaki kartu: satu garis, lalu aksi rata kanan.
 *
 * Ini jawaban untuk tombol simpan yang melayang. Formulir bertingkat dua di
 * ruang kerja menyimpan SELURUH isi kartunya lewat satu tombol, dan tombol itu
 * sebelumnya berdiri di kanvas di bawah kartu-kartunya -- rata ke tepi kanan
 * halaman, bukan ke tepi kanan apa pun yang disimpannya. Yang terbaca dari sana
 * bukan "simpan yang di atas" melainkan "simpan sesuatu".
 *
 * Margin negatif membatalkan padding kartu supaya garisnya menyentuh kedua tepi.
 * Tanpa itu garis berhenti 20px dari sisi kartu dan terbaca sebagai pemisah
 * antar isi, bukan sebagai dasar kartu.
 */
export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cx(
				"-mx-5 -mb-4 mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-outline-variant px-5 py-3",
				className,
			)}
		>
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
				<h2 className="text-title-large font-semibold text-on-surface">{title}</h2>
				{subtitle ? <p className="mt-1 text-body-medium text-on-surface-variant">{subtitle}</p> : null}
			</div>
			{trailing ? <div className="shrink-0">{trailing}</div> : null}
		</div>
	);
}
