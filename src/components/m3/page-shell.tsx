import type { ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

/**
 * Bingkai isi satu halaman ruang kerja.
 *
 * Ditambahkan setelah menemukan `max-w-[1440px] px-5 sm:px-8 pt-6 pb-8 lg:pb-10`
 * ditulis ulang dengan tangan di 25 tempat, tanpa satu pun sumber bersama —
 * lengkap dengan beberapa yang sudah menyimpang (`pt-5`, `pb-6`). Empat angka
 * yang harus sama di dua puluh lima berkas akan berpisah pada perubahan pertama
 * yang hanya menyentuh sebagiannya, dan yang terlihat panitia adalah tepi kiri
 * yang bergeser saat berpindah menu.
 *
 * Lebarnya 1280px dan RATA KIRI, bukan di tengah.
 *
 * Rata tengah benar untuk halaman yang berdiri sendiri; di sini kolom konten
 * sudah punya tepi kiri yang ditentukan rel navigasi, dan memusatkannya membuat
 * jarak judul ke rel berubah-ubah mengikuti lebar jendela. Padding 32px di
 * desktop, 16px di ponsel.
 */

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

export function PageShell({ children, reading, className }: PageShellProps) {
	return (
		<main className={cx("px-4 pb-10 pt-6 sm:px-8 sm:pt-8", className)}>
			<div className={cx("w-full max-w-[1280px]", reading && "[&>*]:max-w-3xl")}>{children}</div>
		</main>
	);
}
