import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from "react";
import { cx } from "@/lib/m3/cx";

/**
 * Tabel data.
 *
 * Ditambahkan setelah menemukan enam tabel yang ditulis tangan dengan markup
 * yang praktis sama — kepala bergaris bawah, badan berpembatas, sel berpadding —
 * tetapi dengan tiga kepadatan berbeda dan tujuh variasi kelas pada `<th>`. Yang
 * berbeda di antara keenamnya tidak pernah merupakan keputusan; ia hasil
 * salin-tempel yang menyimpang.
 *
 * ---- Kenapa kepadatan hidup di `<table>`, bukan di selnya ------------------
 *
 * Padding dipasang lewat varian keturunan (`[&_td]:px-5`) di elemen tabelnya.
 * Alternatifnya menyalurkan kepadatan ke setiap sel lewat React context atau
 * prop, dan keduanya berarti setiap `<TableCell>` harus tahu tentang tabel yang
 * memuatnya. Dengan cara ini selnya tidak tahu apa-apa: ia hanya mengurus
 * perataan dan bobot, dan satu prop di induknya menggeser seluruh tabel.
 *
 * Konsekuensinya `TableCell` boleh dirender di komponen server — tidak ada
 * context yang harus dibaca.
 */

export type TableDensity = "default" | "compact" | "flush";

const DENSITY: Record<TableDensity, string> = {
	/*
	 * Baris 40px: isi `body-medium` 14/20 ditambah 10px atas-bawah. Itu angka
	 * tengah yang dipakai sistem desain data padat — Carbon menyediakannya
	 * sebagai tinggi baris tersendiri, dan Material memangkas baris tabelnya dari
	 * 52px ke 36px untuk mode padat. Padding mendatar 16px mengikuti anjuran
	 * yang sama: di bawah itu kolom mulai saling menempel.
	 */
	default: "[&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:h-11 [&_th]:py-0",
	/* 32px. Batas bawah yang masih nyaman: di bawah 28px target klik mulai sulit
	 * dan tabel terbaca sebagai dinding teks, bukan kisi yang bisa dipindai. */
	compact: "[&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2",
	/**
	 * Tanpa pinggir luar: dipakai ketika tabel duduk di dalam panel yang sudah
	 * berpadding, dan padding sel akan menambahnya menjadi dua kali. Jarak antar
	 * kolom tetap ada lewat `pe-4`, dan kolom terakhir dilepas supaya tepi
	 * kanannya rata dengan isi panel di atasnya.
	 */
	flush: "[&_td]:py-2.5 [&_td]:pe-4 [&_th]:py-2.5 [&_th]:pe-4 [&_td:last-child]:pe-0 [&_th:last-child]:pe-0",
};

export type TableProps = {
	density?: TableDensity;
	/**
	 * Lebar minimum sebelum tabel boleh menyusut, mis. `"1040px"`.
	 *
	 * Kalau diisi, tabel dibungkus wadah bergulir mendatar. Tanpa pembungkus itu
	 * tabel lebar mendorong seluruh halaman melebar dan yang bergulir menyamping
	 * adalah halamannya, bukan tabelnya — termasuk kepala halaman dan navigasi.
	 */
	minWidth?: string;
	children: ReactNode;
	className?: string;
};

export function Table({ density = "default", minWidth, children, className }: TableProps) {
	const table = (
		<table
			className={cx("w-full text-left text-body-medium", DENSITY[density], className)}
			style={minWidth ? { minWidth } : undefined}
		>
			{children}
		</table>
	);
	return minWidth ? <div className="overflow-x-auto">{table}</div> : table;
}

/**
 * Kepala tabel.
 *
 * Dibedakan dari isinya lewat BOBOT dan WARNA, bukan huruf kapital. Rujukan
 * tabel data sepakat bahwa huruf kapital di dalam tabel memperlambat pembacaan,
 * dan kepala kolom adalah tempat terakhir yang pantas diperlambat: ia dibaca
 * sekilas untuk menemukan kolom, bukan dibaca sebagai kalimat.
 *
 * Sebelumnya kepala ini memakai huruf lebar-tetap berkapital dengan jarak
 * 0.16em, dan hasilnya kepala kolom menjadi teks TERLEBAR di layar — mendorong
 * tabel melewati tepi jendela sebelum satu baris data pun terbaca.
 */
export function TableHead({ children, className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
	return (
		<thead
			{...rest}
			// `whitespace-nowrap` di sini, bukan per sel. Kepala kolom yang membungkus
			// menjadi dua baris menaikkan tinggi SELURUH kepala, dan "Walk in
			// Registration" sendirian pernah membuat kepala setinggi 72px di atas
			// baris data setinggi 40px. Kolom yang namanya tidak muat dipendekkan
			// namanya, bukan dibiarkan melipat.
			className={cx("whitespace-nowrap border-b border-outline-variant text-title-small font-medium text-on-surface-variant", className)}
		>
			{children}
		</thead>
	);
}

/** Badan tabel. Baris dipisah garis, bukan warna selang-seling. */
export function TableBody({ children, className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
	return (
		<tbody {...rest} className={cx("divide-y divide-outline-variant", className)}>
			{children}
		</tbody>
	);
}

export type TableRowProps = HTMLAttributes<HTMLTableRowElement> & {
	/** Baris yang bisa disorot: dipakai saat barisnya sendiri dapat ditindak. */
	interactive?: boolean;
	/** Baris yang sudah tidak berlaku — dibatalkan, ditolak, kedaluwarsa. */
	muted?: boolean;
};

export function TableRow({ interactive, muted, children, className, ...rest }: TableRowProps) {
	return (
		<tr
			{...rest}
			className={cx(
				interactive && "transition-colors duration-150 ease-standard hover:bg-panel-high",
				// Opasitas, bukan warna teks yang diredupkan: baris ini memuat angka
				// dan status yang masih harus terbaca, hanya tidak lagi menuntut
				// perhatian. Menurunkan kontras teksnya akan menjatuhkannya di bawah
				// ambang WCAG; menurunkan opasitas seluruh barisnya tidak.
				muted && "opacity-55",
				className,
			)}
		>
			{children}
		</tr>
	);
}

type CellAlign = "start" | "end";

const ALIGN: Record<CellAlign, string> = { start: "", end: "text-right" };

// `align` di-Omit dari atribut HTML bawaan: `<th align>` masih ada di tipe React
// sebagai atribut presentasi HTML4 dengan nilai "left" | "center" | "right", dan
// irisannya dengan tipe di bawah menghasilkan `never` — prop yang tidak bisa
// diisi apa pun. Nama ini dipertahankan karena ia nama yang benar; yang dibuang
// atribut usangnya.
export type TableHeaderCellProps = Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & {
	align?: CellAlign;
	/**
	 * Nama kolom yang datang dari DATA, bukan dari kode: label kolom isian buatan
	 * admin, nama sesi kehadiran, nama hadiah.
	 *
	 * Kolom seperti ini memakai huruf antarmuka, bukan mono berjarak lebar milik
	 * kepala tabel. Dua alasan, dan keduanya terukur di layar Daftar peserta:
	 *
	 *   1. Yang diketik admin bisa berupa kalimat ("Nomor sepatu yang dipakai"),
	 *      dan kalimat dalam huruf kapital berjarak lebar melebar melewati
	 *      kolomnya lalu memaksa seluruh tabel melebar.
	 *   2. Bedanya jadi punya arti: mono berjarak lebar berarti "nama kolom dari
	 *      kami", huruf antarmuka berarti "nama yang Anda ketik sendiri".
	 */
	plain?: boolean;
	/**
	 * Kolom pertama menempel di kiri saat tabel digulir mendatar.
	 *
	 * Latarnya ditulis eksplisit, dan itu wajib: sel `position: sticky` melayang
	 * di atas sel lain, dan tanpa latar sendiri ia menjadi jendela tembus pandang
	 * yang memperlihatkan kolom yang sedang lewat di bawahnya. Bayangan tipis di
	 * tepi kanannya yang memberi tahu ada sesuatu di balik sana.
	 */
	sticky?: boolean;
};

const STICKY = "sticky left-0 z-10 bg-inherit shadow-[1px_0_0_var(--md-sys-color-outline-variant)]";

/**
 * Nilai yang tidak ada, ditulis SEKALI.
 *
 * Konstanta, bukan karakter yang diketik ulang di tiap sel, dan alasannya baru
 * saja terbukti mahal: em-dash pernah ditulis sebagai escape enam huruf di
 * beberapa sel, dan di posisi TEKS JSX urutan itu BUKAN escape. Ia tampil apa
 * adanya, enam huruf di tengah kolom Jabatan, Tipe, dan RSVP. Di dalam string
 * JavaScript escape itu bekerja, di dalam teks JSX tidak, dan bedanya tidak
 * terlihat saat menulis. Satu konstanta menghapus seluruh kelas kesalahan itu.
 */
export const EMPTY_VALUE = "—";

/** Sel kosong: em-dash abu tersier. Dipakai di mana pun nilainya null. */
export function EmptyCell({ className }: { className?: string }) {
	return <span className={cx("text-on-surface-variant", className)} aria-label="tidak ada nilai">{EMPTY_VALUE}</span>;
}

export function TableHeaderCell({ align = "start", plain, sticky, children, className, ...rest }: TableHeaderCellProps) {
	return (
		<th
			scope="col"
			{...rest}
			className={cx("font-medium", ALIGN[align], plain && "ed-plain", sticky && STICKY, className)}
		>
			{children}
		</th>
	);
}

export type TableCellProps = Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
	align?: CellAlign;
	/** Sel yang membawa identitas barisnya: nomor order, username, nama peserta. */
	strong?: boolean;
	/** Angka yang harus berbaris ke bawah. */
	numeric?: boolean;
	/** Menempel di kiri saat tabel digulir mendatar. Lihat `TableHeaderCellProps`. */
	sticky?: boolean;
};

export function TableCell({ align = "start", strong, numeric, sticky, children, className, ...rest }: TableCellProps) {
	return (
		<td
			{...rest}
			// `font-medium`, bukan `font-semibold`. Sel identitas harus menonjol dari
			// sel di sebelahnya, bukan dari seluruh halaman; 600 pada kolom nama
			// membuat kolom itu terbaca sebagai daftar judul dan sisanya sebagai
			// catatan kaki.
			className={cx(ALIGN[align], strong && "font-medium", numeric && "tabular-nums", sticky && STICKY, className)}
		>
			{children}
		</td>
	);
}

/* ---- Wadah, halaman, dan keadaan ---------------------------------------- */

/**
 * Kartu tabel: putih, bergaris, sudut 10px, dan yang paling penting — MILIK
 * TABEL SENDIRI.
 *
 * Sebelumnya tabel, kolom cari, penyaring, dan judul halaman berbagi satu kartu
 * raksasa. Akibatnya bukan sekadar sempit: tabel yang kolomnya lebih lebar
 * daripada layar mendorong kartu itu melebar, dan yang bergulir menyamping
 * adalah SELURUH halaman, termasuk judulnya. Dengan tabel di kartunya sendiri,
 * yang bergulir hanya isi kartu.
 */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cx("overflow-hidden rounded-[10px] border border-outline-variant bg-surface-container-lowest", className)}>
			{children}
		</div>
	);
}

export type PaginationProps = {
	/** Halaman sekarang, mulai dari 1. */
	page: number;
	pageCount: number;
	/** Jumlah baris seluruhnya, untuk kalimat "Menampilkan 1-25 dari 42". */
	total: number;
	pageSize: number;
	onChange: (page: number) => void;
	/**
	 * Mengubah jumlah baris per halaman.
	 *
	 * Opsional, dan itu disengaja: pilihan ini hanya berarti kalau yang
	 * memaginasi adalah SERVER. Tabel yang sudah memuat seluruh barisnya tidak
	 * mendapat apa pun dari "100 per halaman" selain gulir yang lebih panjang.
	 */
	onPageSizeChange?: (size: number) => void;
	className?: string;
};

const UKURAN_HALAMAN = [25, 50, 100];

/**
 * Pengendali halaman. Di BAWAH kartu, bukan di dalamnya.
 *
 * Empat tombol lompat, bukan deretan nomor. Deretan nomor berguna kalau orang
 * punya alasan menuju halaman tujuh secara langsung; di daftar peserta yang
 * diurutkan nama, halaman tujuh tidak berarti apa-apa — yang dipakai adalah
 * berikutnya, sebelumnya, dan kembali ke awal. Nomornya tetap ditampilkan di
 * tengah supaya orang tahu ia sedang di mana.
 */
export function Pagination({ page, pageCount, total, pageSize, onChange, onPageSizeChange, className }: PaginationProps) {
	const awal = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const akhir = Math.min(page * pageSize, total);
	const tombol =
		"flex h-8 min-w-8 items-center justify-center border-outline-variant px-2 text-body-small text-on-surface transition-colors duration-150 hover:bg-primary-soft disabled:pointer-events-none disabled:text-outline-variant";

	return (
		<div className={cx("mt-4 flex flex-wrap items-center justify-between gap-3", className)}>
			<div className="flex flex-wrap items-center gap-3">
				<p className="text-body-small text-on-surface-variant">
					{total === 0 ? "Tidak ada baris" : <>Menampilkan {awal}&ndash;{akhir} dari {total}</>}
				</p>
				{onPageSizeChange ? (
					<div className="flex items-center gap-1 text-body-small text-on-surface-variant">
						{UKURAN_HALAMAN.map((ukuran) => (
							<button
								key={ukuran}
								type="button"
								onClick={() => onPageSizeChange(ukuran)}
								aria-pressed={ukuran === pageSize}
								className={cx(
									"rounded-sm px-1.5 py-0.5 transition-colors duration-150 hover:bg-primary-soft",
									ukuran === pageSize && "font-medium text-on-surface",
								)}
							>
								{ukuran}
							</button>
						))}
						<span>per halaman</span>
					</div>
				) : null}
			</div>
			{/* Grup menyatu: radius hanya di dua ujung, garis pemisah di antaranya.
			    Empat tombol terpisah berjarak akan terbaca sebagai empat aksi berbeda;
			    menyatukannya membuatnya terbaca sebagai satu kontrol. */}
			<div className="inline-flex overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
				<button type="button" onClick={() => onChange(1)} disabled={page <= 1} aria-label="Halaman pertama" className={cx(tombol, "border-r")}>&laquo;</button>
				<button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya" className={cx(tombol, "border-r")}>&lsaquo;</button>
				<span aria-current="page" className="flex h-8 min-w-10 items-center justify-center border-r border-outline-variant px-3 text-body-small font-medium text-on-surface">{page}</span>
				<button type="button" onClick={() => onChange(page + 1)} disabled={page >= pageCount} aria-label="Halaman berikutnya" className={cx(tombol, "border-r")}>&rsaquo;</button>
				<button type="button" onClick={() => onChange(pageCount)} disabled={page >= pageCount} aria-label="Halaman terakhir" className={tombol}>&raquo;</button>
			</div>
		</div>
	);
}

/**
 * Rangka baris saat data sedang dimuat.
 *
 * Lima baris, setinggi yang akan ditempati data pertamanya. Pemintal di tengah
 * kartu kosong memberi tahu bahwa sesuatu sedang terjadi tetapi tidak berapa
 * besar; rangka baris menahan tinggi kartunya, jadi isi halaman di bawahnya
 * tidak melompat begitu data datang.
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
	return (
		<div className="divide-y divide-outline-variant" aria-hidden>
			{Array.from({ length: rows }).map((_, baris) => (
				<div key={baris} className="flex items-center gap-4 px-4 py-3.5">
					{Array.from({ length: cols }).map((__, kolom) => (
						<div
							key={kolom}
							className="h-4 animate-pulse rounded-sm bg-primary-soft"
							style={{ flex: kolom === 0 ? "2 1 0" : "1 1 0" }}
						/>
					))}
				</div>
			))}
		</div>
	);
}
