import { cx } from "@/lib/m3/cx";

/**
 * Layar tunggu satu halaman penuh: satu pemintal abu di tengah, tanpa teks.
 *
 * ---- Kenapa tanpa teks, logo, atau batang kemajuan -----------------------
 *
 * Ketiganya menjanjikan sesuatu yang tidak bisa ditepati. "Memuat..." tidak
 * memberi tahu apa pun yang belum disimpulkan orang dari layar yang kosong;
 * batang kemajuan menjanjikan berapa lama lagi, dan navigasi klien tidak punya
 * angka itu; logo besar mengubah jeda 300ms menjadi layar pembuka.
 *
 * ---- Kenapa muncul TERLAMBAT --------------------------------------------
 *
 * Sebagian besar perpindahan halaman selesai di bawah 200ms. Pemintal yang
 * muncul seketika lalu hilang lagi terlihat sebagai KEDIPAN, dan kedipan terasa
 * lebih lambat daripada jeda diam yang sama panjangnya. Jadi ia mulai dari
 * `opacity: 0` dan baru muncul setelah 200ms.
 *
 * Penundaannya dikerjakan CSS, bukan `setTimeout` + state. Efek yang memanggil
 * `setState` memicu render tambahan tepat pada saat halaman sedang sibuk
 * berpindah — dan React Compiler menolaknya.
 */
export function PageLoading({ className }: { className?: string }) {
	return (
		<div
			role="status"
			aria-label="Memuat"
			className={cx("flex min-h-[60dvh] items-center justify-center", className)}
		>
			{/* `border`, bukan SVG: tidak ada berkas untuk diunduh, dan strokenya
			    ikut menebal bila pengguna memperbesar teks. Aturannya di
			    globals.css, karena penundaan kemunculannya butuh dua animasi
			    sekaligus dan itu tidak muat sebagai utilitas. */}
			<span aria-hidden className="m3-spinner" />
		</div>
	);
}
