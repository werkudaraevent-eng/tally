"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/m3/cx";

export type TopAppBarProps = {
	/** Tombol navigasi atau kembali. Duduk di ujung awal bilah. */
	leading?: ReactNode;
	title: ReactNode;
	/** Baris kecil di bawah judul. Konteks, bukan kalimat kedua. */
	subtitle?: ReactNode;
	/**
	 * Kelas tambahan untuk subjudul. Ada supaya pemanggil bisa menyembunyikannya
	 * pada lebar tertentu — mis. ketika navigasi samping sudah menampilkan
	 * keterangan yang sama dan subjudulnya jadi pengulangan bersebelahan.
	 */
	subtitleClassName?: string;
	/** Aksi di ujung akhir. Ikon, bukan tombol berteks panjang. */
	actions?: ReactNode;
	/** Lebar isi bilah disamakan dengan konten halaman di bawahnya. */
	maxWidth?: string;
	className?: string;
};

/**
 * Top app bar M3.
 *
 * Dua hal yang paling sering salah, dan keduanya ada di spesifikasi:
 *
 * 1. **Diam = tidak terlihat.** Saat halaman berada di posisi paling atas,
 *    bilah ini berwarna sama persis dengan kanvas dan tidak punya garis bawah.
 *    Blok putih dengan garis di bawahnya adalah pola Material 2. Yang membuat
 *    bilah terbaca sebagai lapisan terpisah bukan warnanya, melainkan fakta
 *    bahwa konten bergulir MASUK ke bawahnya.
 *
 * 2. **Bukan bayangan.** Bayangan di bawah bilah selebar layar hanya
 *    menghasilkan pita kabur yang mengaburkan baris teratas konten. M3
 *    menggantinya dengan perubahan tone; di sini diganti garis rambut, karena
 *    perubahan tone merusak bentuk panel — lihat catatan di kelasnya.
 *
 * Bilahnya selalu menempel (`sticky`). Di layar admin dan booth, isi halaman
 * jauh lebih panjang daripada layar, dan aksi utama beserta identitas booth
 * harus tetap terjangkau tanpa menggulir balik ke atas.
 */
/**
 * Mendeteksi apakah ada yang sudah tergulir di bawah bilah.
 *
 * Kembaliannya sepasang: penanda untuk dipasang tepat DI ATAS bilah, dan
 * keadaan `scrolled`. Dipisahkan dari komponennya supaya layar dengan bilah
 * berisi khusus — booth dan kasir membawa pemilih booth, chip mode pengambilan,
 * dan tombol keluar — tetap memperoleh perilaku warna yang sama tanpa harus
 * memaksa isinya masuk ke slot judul/subjudul.
 *
 * IntersectionObserver, bukan pendengar `scroll`. Pendengar scroll berjalan pada
 * setiap frame gulir dan membaca posisi — sepele sekali jalan, tetapi ini layar
 * yang digulir terus-menerus di ponsel panitia yang sudah menyala berjam-jam.
 * Observer hanya terbangun dua kali: saat penanda meninggalkan layar, dan saat
 * ia kembali.
 */
export function useScrolledPastTop() {
	const sentinel = useRef<HTMLDivElement>(null);
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const target = sentinel.current;
		if (!target) return;
		const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
		observer.observe(target);
		return () => observer.disconnect();
	}, []);

	return { sentinel, scrolled };
}

export function TopAppBar({ leading, title, subtitle, subtitleClassName, actions, maxWidth = "1440px", className }: TopAppBarProps) {
	const { sentinel, scrolled } = useScrolledPastTop();

	return (
		<>
			<div ref={sentinel} aria-hidden className="h-px" />
			<header
				className={cx(
					// z-20, di bawah laci navigasi (z-40) dan latar gelapnya (z-30).
					"sticky top-0 z-20 border-b px-5 transition-colors duration-200 ease-standard sm:px-8",
					// Bilah SELALU setone dengan panel konten, tidak pernah berubah warna.
					//
					// Spesifikasi M3 menaikkan tone bilah begitu ada yang tergulir di
					// bawahnya, dan itu benar untuk bilah yang berdiri di atas kanvas
					// polos. Di sini bilah adalah bagian ATAS dari panel yang sudutnya
					// membulat — begitu warnanya berbeda dari panel, ia terbaca sebagai
					// kepingan terpisah: takik sudut membulat di atas, tepi lurus tepat
					// di bawahnya, dan garis putus di antaranya.
					//
					// Isyarat gulirnya dipindahkan ke garis rambut di bawah ini. Ia
					// muncul HANYA saat ada yang tergulir, jadi bukan garis bawah
					// permanen ala Material 2; saat halaman di posisi teratas bilah tetap
					// tak terlihat sama sekali.
					"bg-surface",
					scrolled ? "border-b-outline-variant" : "border-b-transparent",
					className,
				)}
			>
				<div className="mx-auto flex min-h-16 items-center gap-3" style={{ maxWidth }}>
					{leading}
					{/* Ini SATU-SATUNYA judul halaman — halaman di bawahnya langsung
					    mulai dari isinya. Sebelumnya bilah dan konten masing-masing
					    membawa judul, dan dua judul yang saling mengulang menghabiskan
					    sepertiga layar sebelum ada satu pun data yang terbaca.
					    `<h1>`, bukan `<p>`: pembaca layar dan daftar heading peramban
					    memakainya untuk melompat ke isi utama. */}
					<div className="min-w-0 flex-1">
						<h1 className="truncate text-title-large font-semibold text-on-surface">{title}</h1>
						{subtitle ? (
							<p className={cx("truncate text-label-medium uppercase tracking-[0.16em] text-on-surface-variant", subtitleClassName)}>{subtitle}</p>
						) : null}
					</div>
					{actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
				</div>
			</header>
		</>
	);
}
