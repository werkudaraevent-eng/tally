import type { ReactNode } from "react";
import { useAdminHeaderScroll, useAdminPage } from "@/components/admin/page-context";
import { cx } from "@/lib/m3/cx";

/**
 * Garis pemisah. `outline-variant`, bukan `outline`: pemisah adalah dekorasi,
 * dan garis setebal tepi kolom isian membuat daftar tampak seperti tabel.
 */
export function Divider({ className, vertical }: { className?: string; vertical?: boolean }) {
	return (
		<hr
			aria-hidden
			className={cx(
				"border-0 bg-outline-variant",
				vertical ? "h-full w-px" : "h-px w-full",
				className,
			)}
		/>
	);
}

export type PageHeaderProps = {
	/** Kata di atas judul: nama bagian, bukan kalimat. */
	eyebrow?: ReactNode;
	/**
	 * Judul halaman.
	 *
	 * Boleh dikosongkan di ruang kerja: kalau kosong, ia dibaca dari identitas
	 * halaman yang disediakan AdminShell — tabel `navigation` yang sama yang
	 * memberi label menu. Itu mencegah lahirnya daftar judul kedua yang akan
	 * berpisah dari menunya pada perubahan pertama.
	 */
	title?: ReactNode;
	description?: ReactNode;
	/** Ikon di kiri judul. Bawaannya ikon menu halaman ini. */
	icon?: ReactNode;
	/**
	 * Baris kecil di bawah deskripsi: status, penghitung, tautan kelola.
	 *
	 * Bukan tempat untuk kalimat kedua. Ia dipakai oleh hal yang keadaannya
	 * berubah sendiri — sinkronisasi berjalan atau tidak — dan yang dulu menuntut
	 * panel setinggi sepertiga layar untuk mengatakan hal yang sama.
	 */
	meta?: ReactNode;
	/** Aksi halaman. Sekunder dulu, primer paling kanan, maksimal satu primer. */
	actions?: ReactNode;
	className?: string;
};

export function PageHeader({ eyebrow, title, description, icon, meta, actions, className }: PageHeaderProps) {
	const page = useAdminPage();
	const gulir = useAdminHeaderScroll();
	const judul = title ?? page?.label;
	const keterangan = description ?? page?.description;
	const Ikon = page?.icon;
	const ikon = icon ?? (Ikon ? <Ikon size={24} weight="regular" /> : null);

	return (
		// Tanpa garis bawah, dan tanpa kartu. Kepala halaman berdiri LANGSUNG di
		// atas kanvas; yang memisahkannya dari isi adalah jarak 32px dan ukuran,
		// bukan bingkai. Membungkusnya dalam kartu bersama tabel di bawahnya
		// menyempitkan keduanya dan menghapus satu-satunya tempat di layar yang
		// boleh lapang.
		//
		// `items-start`: tombol sejajar dengan BARIS JUDUL, bukan dengan bagian
		// bawah blok teks. Deskripsi bisa satu atau tiga baris, dan tombol yang
		// mengikuti tepi bawahnya akan duduk di ketinggian berbeda di tiap halaman.
		<header className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-4 pb-8", className)}>
			<div className="min-w-0">
				{eyebrow ? <p className="ed-label mb-2 text-on-surface-variant">{eyebrow}</p> : null}
				<div className="flex items-center gap-2.5">
					{/* Ikon sebaris dengan judul, bukan di atasnya: ia penanda halaman,
					    bukan hiasan tersendiri. Warnanya ikut teks — satu aksen per layar
					    disimpan untuk tombolnya. */}
					{ikon ? <span className="shrink-0 text-on-surface" aria-hidden>{ikon}</span> : null}
					{/* 28px/600, turun dari 40px/700.
					    Empat puluh piksel benar ketika judul adalah satu-satunya hal besar
					    di layar yang lapang. Di layar daftar ia berdiri 32px di atas tabel
					    berisi dua belas kolom, dan yang terjadi bukan hierarki melainkan
					    dua blok yang sama-sama menuntut. `tracking` dirapatkan karena pada
					    ukuran ini jarak huruf bawaan Inter terlihat renggang.
					    `ref` diserahkan ke shell, yang mengamati kapan judul tergulir lewat
					    dan mengambil alih ke bilah atas. */}
					<h1
						ref={gulir?.amati}
						className="min-w-0 text-[1.75rem] font-semibold leading-9 tracking-[-0.01em] text-on-surface"
					>
						{judul}
					</h1>
				</div>
				{keterangan ? (
					<p className="mt-1.5 max-w-[40rem] text-[0.9375rem] leading-6 text-on-surface-variant">{keterangan}</p>
				) : null}
				{meta ? <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-small text-on-surface-variant">{meta}</div> : null}
			</div>
			{actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
		</header>
	);
}

export type PageToolbarProps = {
	/** Kolom cari. Tumbuh mengisi ruang; penyaring di kanannya tidak. */
	search?: ReactNode;
	/** Penyaring. Beri lebar yang sama supaya deretannya terbaca sebagai satu grup. */
	children?: ReactNode;
	/** Baris kecil di bawah: "42 peserta". Angka, bukan kalimat. */
	count?: ReactNode;
	/** Ditampilkan sebagai "Reset filter" hanya kalau ada penyaring yang aktif. */
	onReset?: () => void;
	className?: string;
};

/**
 * Baris cari dan saring, DI LUAR kartu tabel.
 *
 * Sebelumnya keduanya duduk di dalam kartu yang sama dengan tabelnya, dipisah
 * garis mendatar, dan hasilnya kartu setinggi 200px sebelum satu baris data pun
 * terbaca. Kontrol yang MENYARING tabel bukan bagian dari tabel; ia berdiri di
 * atasnya, di atas kanvas, seperti kepala halaman.
 *
 * Label "Filter" di depan deretan penyaring dibuang. Tiga kotak bertuliskan
 * "Semua asal", "Semua kehadiran", "Semua RSVP" sudah mengatakan dirinya
 * penyaring; kata "Filter" hanya memundurkan yang pertama sejauh 60px dan
 * memutus kesejajaran deretannya.
 */
export function PageToolbar({ search, children, count, onReset, className }: PageToolbarProps) {
	return (
		<div className={cx("mb-4", className)}>
			<div className="flex flex-wrap items-center gap-2">
				{search ? <div className="min-w-[15rem] flex-1">{search}</div> : null}
				{children}
			</div>
			{count || onReset ? (
				<div className="mt-2 flex items-center gap-3 text-body-small text-on-surface-variant">
					{count ? <span>{count}</span> : null}
					{onReset ? (
						<button type="button" onClick={onReset} className="rounded-sm text-body-small font-medium text-primary hover:underline">
							Reset filter
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export type PageSectionProps = {
	title: ReactNode;
	description?: ReactNode;
	/** Aksi bagian ini. Sekunder, bukan primer — yang primer milik kepala halaman. */
	action?: ReactNode;
	children?: ReactNode;
	className?: string;
};

/**
 * Bagian di dalam halaman: judul 16px, deskripsi, aksi di kanan.
 *
 * Tingkat kedua di bawah `PageHeader`, dan ukurannya sengaja jauh lebih kecil
 * daripada judul halaman (16 lawan 28). Dua judul yang berdekatan ukurannya
 * membuat halaman terbaca sebagai dua halaman yang ditempel.
 */
export function PageSection({ title, description, action, children, className }: PageSectionProps) {
	return (
		<section className={className}>
			<div className="mb-3 flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="text-title-medium font-semibold text-on-surface">{title}</h2>
					{description ? (
						<p className="mt-0.5 max-w-[40rem] text-body-medium text-on-surface-variant">{description}</p>
					) : null}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children}
		</section>
	);
}

export type BannerTone = "info" | "warning" | "error" | "success";

const BANNER: Record<BannerTone, string> = {
	info: "border-primary-soft-outline bg-primary-soft text-on-primary-soft",
	warning: "border-warning-soft-outline bg-warning-soft text-warning",
	error: "border-error-soft-outline bg-error-soft text-error",
	success: "border-success-soft-outline bg-success-soft text-on-success-container",
};

export type BannerProps = {
	tone?: BannerTone;
	icon?: ReactNode;
	children: ReactNode;
	/** Aksi di ujung kanan. Tombol kecil, bukan tautan teks panjang. */
	actions?: ReactNode;
	className?: string;
};

/**
 * Pita keterangan selebar konten.
 *
 * Perannya beda dari toast: toast lewat, pita ini menetap selama keadaannya
 * masih berlaku. Dipakai untuk hal yang mengubah arti halaman di bawahnya —
 * sumber peserta yang membuat sinkronisasi dilewati, setelan yang belum bisa
 * dinyalakan sebelum sesuatu yang lain menyala.
 *
 * `role="status"` untuk yang informatif, `role="alert"` untuk galat, diserahkan
 * pemanggil lewat props biasa; komponen ini tidak menebak mana yang harus
 * menyela pembaca layar.
 */
export function Banner({ tone = "info", icon, children, actions, className }: BannerProps) {
	return (
		<div className={cx("flex flex-wrap items-center justify-between gap-3 rounded-lg border px-5 py-4 text-body-medium", BANNER[tone], className)}>
			<div className="flex min-w-0 flex-1 items-start gap-2.5">
				{icon ? <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span> : null}
				<div className="min-w-0">{children}</div>
			</div>
			{actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
		</div>
	);
}

export type EmptyStateProps = {
	icon?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	/**
	 * Tanpa bingkai sendiri. Dipakai ketika keadaan kosong duduk DI DALAM kartu
	 * yang sudah bergaris — mis. di badan tabel — dan bingkai kedua hanya
	 * menggambar kotak di dalam kotak.
	 */
	plain?: boolean;
	className?: string;
};

/**
 * Keadaan kosong selalu menyebutkan langkah berikutnya.
 *
 * "Belum ada data" memberi tahu apa yang terjadi tetapi tidak apa yang harus
 * dilakukan, dan di tengah acara tidak ada waktu menebak apakah itu berarti
 * salah saring, salah event, atau memang belum ada yang datang.
 */
export function EmptyState({ icon, title, description, action, plain, className }: EmptyStateProps) {
	return (
		<div
			className={cx(
				"flex flex-col items-center px-6 py-14 text-center",
				!plain && "rounded-lg border border-outline-variant bg-surface-container-lowest",
				className,
			)}
		>
			{icon ? <div className="mb-4 text-outline" aria-hidden>{icon}</div> : null}
			<p className="text-body-large font-semibold text-on-surface">{title}</p>
			{description ? <p className="mt-1.5 max-w-md text-body-medium text-on-surface-variant">{description}</p> : null}
			{action ? <div className="mt-5">{action}</div> : null}
		</div>
	);
}
