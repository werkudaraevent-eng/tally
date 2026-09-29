import type { ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

/**
 * Bingkai isi halaman. SATU sumber untuk padding, lebar, dan jarak atas-bawah.
 *
 * Ditambahkan setelah menemukan empat angka yang sama ditulis ulang dengan
 * tangan di dua puluh lima tempat, beberapa sudah menyimpang (`pt-5`, `pb-6`).
 * Yang terlihat panitia dari penyimpangan itu adalah tepi kiri yang bergeser
 * saat berpindah menu.
 *
 * ---- Kenapa nilainya persis begini ---------------------------------------
 *
 * Padding mendatar bertingkat: 16px di ponsel, 24px di tablet, 32px di desktop.
 * Bukan dua langkah (16 lalu 32): pada 800px, 32px di kiri dan kanan memakan 8%
 * lebar layar sebelum ada satu kolom data pun.
 *
 * Bilah atas memakai PEMBUNGKUS YANG SAMA, dan itu bukan kerapian belaka.
 * Sebelumnya bilah memakai `px-5 sm:px-8` sementara isinya `px-4 sm:px-8`, jadi
 * di bawah 640px logo berdiri 4px lebih ke dalam daripada judul di bawahnya —
 * cukup untuk terlihat salah, terlalu kecil untuk ketahuan sebabnya.
 */

/**
 * Dipakai bilah atas maupun isi halaman, supaya keduanya berbagi satu tepi kiri.
 *
 * 24 / 32 / 40px. Naik dari 16 / 24 / 32 mengikuti ramp dasbor acuan, yang
 * menaruh lantainya di 40px pada desktop. Yang membuat perbedaan 8px itu terasa
 * bukan kelapangannya melainkan tepi kanannya: aksi kepala halaman dan tombol
 * simpan di dasar formulir keduanya rata ke tepi ini, dan pada 32px keduanya
 * nyaris menempel ke sisi jendela.
 */
export const CONTAINER_PADDING = "px-6 md:px-8 lg:px-10";

export type PageContainerProps = {
	children: ReactNode;
	/**
	 * Diletakkan di tengah, bukan rata kiri.
	 *
	 * Halaman DI DALAM acara rata kiri: tepi kirinya sudah ditentukan rel
	 * navigasi, dan memusatkannya membuat jarak judul ke rel berubah mengikuti
	 * lebar jendela. Halaman di LUAR acara tidak punya rel, jadi tidak ada tepi
	 * yang harus diikuti, dan konten yang menempel ke kiri layar 1920px terbaca
	 * sebagai halaman yang gagal memuat.
	 */
	center?: boolean;
	/** Tanpa padding atas: dipakai pembungkus bilah atas, yang tingginya sendiri. */
	flush?: boolean;
	className?: string;
};

export function PageContainer({ children, center, flush, className }: PageContainerProps) {
	return (
		<div
			className={cx(
				CONTAINER_PADDING,
				// 1400px, angka dasbor acuan. Sebelumnya 1280 di sini sementara
				// tujuh belas halaman menulis sendiri 1440 di `<main>`-nya, jadi
				// judul di bilah atas dan judul di halaman TIDAK PERNAH berbagi
				// satu tepi kiri -- 12px meleset, cukup terlihat untuk terasa
				// salah dan terlalu kecil untuk ketahuan sebabnya.
				"w-full max-w-[1400px]",
				flush ? "" : "py-6 md:py-8 lg:py-9",
				center && "mx-auto",
				className,
			)}
		>
			{children}
		</div>
	);
}

export type PageShellProps = {
	children: ReactNode;
	/**
	 * Lebar baca sempit untuk prosa dan formulir.
	 *
	 * Dipasang pada ANAK LANGSUNG, bukan pada pembungkusnya, supaya tepi kirinya
	 * tetap di grid yang sama: menyempitkan containernya sendiri akan
	 * memindahkannya ke tengah dan memutus kesejajaran dengan judul bilah.
	 */
	reading?: boolean;
	className?: string;
};

/**
 * `PageContainer` yang membungkus dirinya dalam `<main>`.
 *
 * Halaman di dalam ruang kerja memakai ini; halaman di luar acara memakai
 * `PageContainer` langsung, karena `<main>`-nya juga menampung bilah atasnya.
 */
export function PageShell({ children, reading, className }: PageShellProps) {
	return (
		<main className={className}>
			<PageContainer className={cx(reading && "[&>*]:max-w-3xl")}>{children}</PageContainer>
		</main>
	);
}

/**
 * Irama menegak antar bagian halaman: 16px, naik ke 24px di layar lebar.
 *
 * Satu tempat, bukan `mt-4`/`mt-5`/`mt-6`/`mt-8`/`mt-10` yang ditulis ulang di
 * tiap bagian. Yang terlihat panitia dari lima angka itu bukan variasi melainkan
 * ketidakhadiran irama: kalau jarak antar bagian berubah-ubah, tidak ada satu
 * pun jarak yang berarti "bagian baru dimulai di sini".
 *
 * Dipasang pada PEMBUNGKUS dengan `gap`, bukan sebagai margin tiap anak. Margin
 * runtuh, bertumpuk, dan menempel pada anak pertama dan terakhir; `gap` hanya
 * ada di antara.
 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cx("flex flex-col gap-4 xl:gap-6", className)}>{children}</div>;
}
