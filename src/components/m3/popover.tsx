"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MENU_MOTION } from "@/lib/m3/menu-motion";
import { cx } from "@/lib/m3/cx";

/**
 * Panel mengambang yang dirender ke `document.body`, bukan ke tempatnya berdiri.
 *
 * ---- Kenapa portal, bukan `position: absolute` ---------------------------
 *
 * Dua kegagalan yang sama-sama sudah terjadi di layar, dan keduanya tidak bisa
 * diperbaiki dari dalam panelnya sendiri:
 *
 * 1. **Dipotong.** Kartu daftar memakai `overflow: hidden` supaya sudut 10px
 *    memotong baris di dalamnya. Menu di baris terakhir tumbuh melewati tepi
 *    bawah kartu, dan `overflow` memotongnya tepat di sana. Menaikkan z-index
 *    tidak menolong sama sekali: pemotongan terjadi sebelum penumpukan.
 *
 * 2. **Tertimpa tetangga.** Pembungkus aksi tiap baris memakai `relative z-10`,
 *    dan pasangan itu MEMBUAT stacking context. Akibatnya `z-50` pada menu hanya
 *    berlaku di dalam kotak barisnya sendiri; terhadap baris lain yang juga
 *    `z-10`, yang menang adalah urutan DOM. Menu baris kedua karena itu
 *    tertimbun tombol baris ketiga.
 *
 * Portal memindahkan panelnya ke luar kedua masalah: tidak ada leluhur yang
 * memotong, dan tidak ada stacking context di antaranya dan puncak halaman.
 *
 * ---- Kenapa posisinya dihitung dari rect, bukan diukur setelah dipasang ---
 *
 * Mengukur tinggi panel setelah ia terpasang berarti `setState` di dalam efek —
 * satu render tambahan pada setiap pembukaan, dan React Compiler menolaknya.
 * Jadi yang dipakai hanya rect PEMICUNYA, yang sudah diketahui pada saat
 * diklik: sisi dipilih dari ruang yang tersisa di atas dan di bawah, dan
 * `max-height` diisi sebesar ruang itu. Panel yang lebih tinggi daripada
 * ruangnya bergulir sendiri, bukan menembus tepi layar.
 */

/** Jarak panel dari pemicunya, dan dari tepi jendela. */
const OFFSET = 4;
const PADDING = 8;

/**
 * Hook ini TIDAK memegang maupun mengembalikan ref.
 *
 * Elemen pemicunya dimiliki pemanggil, sebagai state, dan dipasang dengan
 * `ref={setPemicu}` — callback ref yang kebetulan berupa setter state. Dua
 * alasan, dan keduanya praktis:
 *
 *   * React Compiler menganggap apa pun yang pernah muncul di posisi `ref=`
 *     sebagai ref, lalu menolak pembacaan properti lain dari objek yang sama
 *     selama render. Selama `pasang` ikut keluar dari hook ini, membaca
 *     `menu.open` di JSX gagal lint.
 *   * Elemen sebagai state berarti perhitungan posisi otomatis benar pada
 *     render pertama setelah pemicunya terpasang, tanpa efek pengukur.
 */
export type PopoverAnchor = {
	/** Rect pemicu saat dibuka. Null berarti tertutup. */
	rect: DOMRect | null;
	open: boolean;
	buka: () => void;
	tutup: () => void;
	toggle: () => void;
	/** Mengembalikan fokus ke pemicu setelah menu ditutup dengan Esc. */
	fokus: () => void;
	/** Apakah sebuah node berada di dalam pemicu. Dipakai pemeriksaan klik di luar. */
	berisi: (node: Node) => boolean;
	/**
	 * Profil permukaan yang berlaku di tempat pemicunya berdiri.
	 *
	 * Portal mendarat di `document.body`, JAUH di luar `<div class="press">` yang
	 * menimpa warna, bentuk, dan ukuran huruf ruang kerja. Tanpa ini, menu yang
	 * dibuka dari layar admin muncul dengan nilai tema mentah: garis lavender,
	 * teks 16px, sudut 12px. Itu benar-benar terjadi, dan terlihat sebagai menu
	 * dari aplikasi lain yang menumpang di atas halaman.
	 *
	 * Dibaca dari leluhur pemicunya saat dibuka, bukan ditetapkan pemanggil:
	 * satu komponen menu dipakai di layar ber-`press` maupun tidak, dan yang tahu
	 * jawabannya adalah tempat ia berdiri.
	 */
	profil: string;
};

export function usePopoverAnchor(
	el: HTMLElement | null,
	/**
	 * Dipanggil setiap kali panel dibuka atau ditutup, TERMASUK saat ditutup dari
	 * dalam `Popover` (Esc, klik di luar).
	 *
	 * Ada karena rel navigasi perlu tahu: rel yang tidak disematkan menutup
	 * dirinya sendiri begitu kursor keluar, dan panel pemilih acara membuat kursor
	 * memang keluar. Tanpa kabar ini, membuka pemilih acara dari rel sempit
	 * berarti menutup relnya sendiri di kedipan berikutnya.
	 */
	onOpenChange?: (terbuka: boolean) => void,
): PopoverAnchor {
	const [rect, setRect] = useState<DOMRect | null>(null);
	const [profil, setProfil] = useState("");

	const fokus = useCallback(() => el?.focus(), [el]);
	const berisi = useCallback((node: Node) => Boolean(el?.contains(node)), [el]);
	const buka = useCallback(() => {
		setRect(el?.getBoundingClientRect() ?? null);
		setProfil(el?.closest(".press") ? "press" : "");
		onOpenChange?.(true);
	}, [el, onOpenChange]);
	const tutup = useCallback(() => {
		setRect(null);
		onOpenChange?.(false);
	}, [onOpenChange]);
	const toggle = useCallback(() => {
		setProfil(el?.closest(".press") ? "press" : "");
		setRect((sekarang) => {
			const berikutnya = sekarang ? null : el?.getBoundingClientRect() ?? null;
			onOpenChange?.(berikutnya !== null);
			return berikutnya;
		});
	}, [el, onOpenChange]);

	const open = rect !== null;

	/**
	 * Panel `fixed` tidak ikut bergerak saat halaman digulir, jadi rect-nya diukur
	 * ulang. `capture: true` pada `scroll` wajib: peristiwa gulir dari wadah di
	 * dalam halaman tidak menggelembung ke `window`, dan pemicu ini sering berada
	 * di dalam tabel yang bergulir sendiri.
	 */
	useEffect(() => {
		if (!open) return;
		const ukur = () => setRect(el?.getBoundingClientRect() ?? null);
		window.addEventListener("scroll", ukur, true);
		window.addEventListener("resize", ukur);
		return () => {
			window.removeEventListener("scroll", ukur, true);
			window.removeEventListener("resize", ukur);
		};
	}, [open, el]);

	return { rect, open, buka, tutup, toggle, fokus, berisi, profil };
}

export type PopoverProps = {
	anchor: PopoverAnchor;
	/** Nama panel untuk pembaca layar. */
	label: string;
	role?: "menu" | "listbox" | "dialog";
	id?: string;
	/** Tepi panel yang disejajarkan dengan pemicu. */
	align?: "start" | "end";
	/** Lebar tetap. Tanpa ini panel selebar isinya, dibatasi lebar pemicu sebagai minimum. */
	width?: number | string;
	children: ReactNode;
	className?: string;
	onKeyDown?: (peristiwa: React.KeyboardEvent) => void;
};

export function Popover({ anchor, label, role = "menu", id, align = "end", width, children, className, onKeyDown }: PopoverProps) {
	const panel = useRef<HTMLDivElement | null>(null);
	const { rect, open, tutup, fokus, berisi, profil } = anchor;

	useEffect(() => {
		if (!open) return;
		const onKey = (peristiwa: KeyboardEvent) => {
			if (peristiwa.key !== "Escape") return;
			tutup();
			fokus();
		};
		const onPointer = (peristiwa: PointerEvent) => {
			const target = peristiwa.target as Node;
			if (panel.current?.contains(target) || berisi(target)) return;
			tutup();
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onPointer);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointer);
		};
	}, [open, tutup, fokus, berisi]);

	if (!rect) return null;

	const ruangBawah = window.innerHeight - rect.bottom - OFFSET - PADDING;
	const ruangAtas = rect.top - OFFSET - PADDING;
	// Ke atas hanya kalau bawah benar-benar sempit DAN atas lebih lega. Membalik
	// terlalu cepat membuat menu yang sama muncul di sisi berbeda pada dua baris
	// berdekatan, dan itu terbaca sebagai kedipan, bukan sebagai penyesuaian.
	const keAtas = ruangBawah < 180 && ruangAtas > ruangBawah;

	const gaya: React.CSSProperties = {
		position: "fixed",
		maxHeight: Math.max(120, keAtas ? ruangAtas : ruangBawah),
		minWidth: rect.width,
		width,
		...(keAtas
			? { bottom: window.innerHeight - rect.top + OFFSET }
			: { top: rect.bottom + OFFSET }),
		...(align === "end"
			// Dijepit ke dalam jendela: panel yang lebih lebar daripada pemicunya di
			// tepi kanan layar akan keluar layar tanpa penjepit ini.
			? { right: Math.max(PADDING, window.innerWidth - rect.right) }
			: { left: Math.max(PADDING, rect.left) }),
	};

	return createPortal(
		// Pembungkus tanpa gaya sendiri; tugasnya hanya membawa kelas profil ke
		// dalam portal, supaya token warna dan ukuran huruf di dalamnya sama
		// dengan tempat pemicunya berdiri.
		<div className={profil}>
		<AnimatePresence>
			<motion.div
				ref={panel}
				id={id}
				role={role}
				aria-label={label}
				onKeyDown={onKeyDown}
				style={gaya}
				className={cx(
					"z-popover overflow-y-auto rounded-[10px] border border-outline-variant bg-surface-container-lowest p-1 shadow-level2",
					className,
				)}
				{...MENU_MOTION}
			>
				{children}
			</motion.div>
		</AnimatePresence>
		</div>,
		document.body,
	);
}

/**
 * Satu baris di dalam menu. Tinggi 34px, ikon 16px abu, teks 14px.
 *
 * Diekspor supaya empat menu di aplikasi ini tidak masing-masing menulis ulang
 * string kelasnya — yang sudah terjadi, dan hasilnya empat menu dengan tiga
 * tinggi baris berbeda.
 */
const POPOVER_ITEM_BASE =
	"flex h-[34px] w-full items-center gap-2.5 rounded-md px-3 text-left text-body-medium transition-colors duration-100";

export const POPOVER_ITEM = `${POPOVER_ITEM_BASE} text-on-surface hover:bg-primary-soft`;

/**
 * Varian merah untuk aksi yang membuang sesuatu: keluar, hapus.
 *
 * Konstanta TERSENDIRI, bukan `POPOVER_ITEM` ditambah `hover:bg-error-soft`.
 * Dua utilitas hover pada satu elemen tidak diselesaikan oleh urutan di string
 * kelas, melainkan oleh urutan Tailwind menuliskannya di stylesheet — dan di
 * sana `bg-primary-soft:hover` kebetulan jatuh SESUDAH `bg-error-soft:hover`.
 * Diukur di CSS hasil build: yang menang abu, bukan merah. Menyusun dua kelas
 * yang saling meniadakan dan berharap yang benar menang adalah taruhan yang
 * tidak terlihat sampai seseorang mengarahkan kursor ke sana.
 */
export const POPOVER_ITEM_DANGER = `${POPOVER_ITEM_BASE} text-error hover:bg-error-soft`;
