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

/**
 * Judul halaman: 30px/600.
 *
 * Ditulis sebagai nilai arbitrer, bukan kelas peran, karena skala peran tidak
 * punya anak tangga 30px -- `headline-large` 24px terlalu kecil untuk memimpin
 * satu layar penuh, `display-small` 28px satu langkah di bawah acuan.
 *
 * TANPA `tracking`. Versi sebelumnya merapatkan -0.01em, dan itu satu-satunya
 * tempat di ruang kerja yang masih melakukannya: ramp `.press` menyetel
 * `letter-spacing` per KELAS PERAN, jadi ia tidak menjangkau nilai arbitrer ini
 * dan rapatannya benar-benar hidup di layar. Acuan melarangnya mutlak.
 */
const JUDUL_HALAMAN = "min-w-0 text-headline-medium text-on-surface";

export function PageHeader({ eyebrow, title, description, icon, meta, actions, className }: PageHeaderProps) {
	const page = useAdminPage();
	const gulir = useAdminHeaderScroll();
	const judul = title ?? page?.label;
	const keterangan = description ?? page?.description;
	const Ikon = page?.icon;
	// 28px, dicocokkan secara optik dengan judul 30px. Acuan memakai glyph 32px
	// untuk judul yang sama; ikon Phosphor `regular` menggambar lebih penuh di
	// dalam kotaknya daripada set yang dipakai di sana, jadi 28 yang seimbang.
	const ikon = icon ?? (Ikon ? <Ikon size={28} weight="regular" /> : null);

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
		<header className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-4 pb-6", className)}>
			<div className="min-w-0">
				{eyebrow ? <p className="ed-label mb-2 text-on-surface-variant">{eyebrow}</p> : null}
				<div className="flex items-center gap-1.5">
					{/* Ikon sebaris dengan judul, bukan di atasnya: ia penanda halaman,
					    bukan hiasan tersendiri. Warnanya ikut teks — satu aksen per layar
					    disimpan untuk tombolnya. */}
					{ikon ? <span className="shrink-0 text-on-surface" aria-hidden>{ikon}</span> : null}
					{/* `ref` diserahkan ke shell, yang mengamati kapan judul tergulir
					    lewat dan mengambil alih ke bilah atas. */}
					<h1 ref={gulir?.amati} className={JUDUL_HALAMAN}>{judul}</h1>
				</div>
				{/* 14px, dibatasi 65 karakter.
				    Sebelumnya 15px -- ukuran yang tidak ada di skala empat langkah
				    acuan, dan yang membuat deskripsi terbaca sepadat judul bagian
				    di bawahnya. Batas 65ch bukan gaya: kalimat sepanjang 1400px
				    memaksa mata melompat balik mencari awal baris berikutnya.
				    Jaraknya ke judul 6px, bukan 8px, karena judul dan deskripsi
				    adalah SATU pasangan; yang 24px adalah jarak dari pasangan itu
				    ke isi halaman. */}
				{keterangan ? (
					<p className="mt-1.5 max-w-[65ch] text-body-medium leading-6 text-on-surface-variant">{keterangan}</p>
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
	/**
	 * Angka atau status di ujung kanan baris judul: "12 agenda", "Tersinkron".
	 *
	 * Terpisah dari `action` karena ia tidak bisa ditekan, dan menaruh keduanya di
	 * satu slot berarti tinggi baris judul berubah-ubah tergantung mana yang diisi.
	 */
	meta?: ReactNode;
	children?: ReactNode;
	className?: string;
};

/**
 * Bagian di dalam halaman: judul 16px, deskripsi, aksi atau angka di kanan.
 *
 * Tingkat kedua di bawah `PageHeader`, dan ukurannya sengaja jauh lebih kecil
 * daripada judul halaman (16 lawan 30). Dua judul yang berdekatan ukurannya
 * membuat halaman terbaca sebagai dua halaman yang ditempel.
 *
 * ---- Judulnya DI LUAR kartu, dan itu aturan, bukan selera ----------------
 *
 * Aturan yang sama yang melarang kartu di dalam kartu. Judul yang duduk sebagai
 * baris pertama kartunya sendiri membuat kartu itu punya dua peran sekaligus:
 * pengumuman dan wadah. Yang terjadi di layar, dan terlihat di halaman denah
 * sebelum ini, adalah empat kartu yang masing-masing berjudul sendiri sehingga
 * tidak ada satu pun yang terbaca sebagai bagian dari sesuatu yang lebih besar
 * -- dan tombol Simpan yang menyimpan keempatnya jadi tidak punya tempat untuk
 * berdiri.
 *
 * ---- Jaraknya mengkodekan kedekatan -------------------------------------
 *
 * 6px di dalam pasangan judul + deskripsi, 24px dari pasangan itu ke isinya.
 * Satu jarak seragam untuk ketiganya adalah kesalahan yang disebut namanya di
 * acuan, dan alasannya terbaca: dengan jarak yang sama, deskripsi tampak milik
 * isi di bawahnya, bukan milik judul di atasnya.
 */
export function PageSection({ title, description, action, meta, children, className }: PageSectionProps) {
	return (
		<section className={className}>
			<div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
				<div className="min-w-0">
					<h2 className="text-title-large font-semibold text-on-surface">{title}</h2>
					{description ? (
						<p className="mt-1.5 max-w-[65ch] text-body-medium text-on-surface-variant">{description}</p>
					) : null}
				</div>
				{action || meta ? (
					<div className="flex shrink-0 items-center gap-3">
						{meta ? <span className="text-body-small text-on-surface-variant">{meta}</span> : null}
						{action}
					</div>
				) : null}
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
	/**
	 * Satu baris tipis, untuk penanda yang menetap di setiap halaman (acara
	 * terkunci). Banner biasa setinggi 56px di atas setiap tabel membuat
	 * keadaan yang sudah diketahui terbaca seperti peringatan baru.
	 */
	compact?: boolean;
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
export function Banner({ tone = "info", icon, children, actions, compact, className }: BannerProps) {
	return (
		<div className={cx("flex flex-wrap items-center justify-between gap-3 border", compact ? "rounded-md px-3 py-1.5 text-label-large" : "rounded-lg px-5 py-4 text-body-medium", BANNER[tone], className)}>
			<div className={cx("flex min-w-0 flex-1 items-start", compact ? "gap-2" : "gap-2.5")}>
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
 *
 * ---- Ia MENGGANTIKAN kartunya, bukan duduk di dalamnya ------------------
 *
 * Bentuknya sengaja berbeda dari kartu: radius 12px, bukan 8px, dan garis tepi
 * sungguhan alih-alih ring. Perbedaan itu yang memberi tahu bahwa yang dilihat
 * bukan wadah yang kebetulan kosong melainkan keadaan tersendiri. Varian
 * `plain` untuk yang duduk di dalam badan tabel, tempat bingkai kedua hanya
 * menggambar kotak di dalam kotak.
 *
 * ---- Bobot judulnya bersyarat -------------------------------------------
 *
 * DENGAN deskripsi ia judul 16px/600. TANPA deskripsi ia 14px abu biasa, karena
 * keadaan kosong satu baris ("Belum ada label khusus") adalah keterangan, bukan
 * pengumuman -- dan mencetaknya setebal judul bagian membuat layar yang kosong
 * berteriak lebih keras daripada layar yang penuh.
 *
 * ---- Aksinya ada DI SINI ------------------------------------------------
 *
 * Bukan di kartu terpisah di atasnya. Halaman denah sebelum ini memasang
 * formulir "Tambah agenda" sebagai kartu sendiri, lalu di bawahnya kotak abu
 * bertuliskan "Tambahkan satu di atas" -- dua tempat untuk satu perbuatan,
 * berurutan terbalik, dan yang kedua hanya menunjuk ke yang pertama.
 */
export function EmptyState({ icon, title, description, action, plain, className }: EmptyStateProps) {
	return (
		<div
			className={cx(
				"flex w-full flex-col items-center gap-6 px-10 py-16 text-center",
				!plain && "rounded-xl border border-outline-variant bg-surface-container-lowest",
				className,
			)}
		>
			{icon ? <div className="text-outline" aria-hidden>{icon}</div> : null}
			<div className="flex flex-col items-center gap-2.5">
				{description ? (
					<h2 className="text-title-large font-semibold text-on-surface">{title}</h2>
				) : (
					<p className="text-body-medium text-on-surface-variant">{title}</p>
				)}
				{description ? (
					<p className="max-w-[35rem] text-pretty text-body-medium leading-relaxed text-on-surface-variant">{description}</p>
				) : null}
			</div>
			{action ? <div className="flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
		</div>
	);
}
