"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/m3/cx";
import { IconButton } from "./icon-button";
import { standard } from "@/lib/m3/motion";

/**
 * Dialog M3.
 *
 * ---- Kenapa satu komponen ----------------------------------------------------
 *
 * Sebelumnya tiap halaman menulis `fixed inset-0` + panel sendiri. Sebagian
 * punya `role="dialog"`, sebagian tidak; tidak satu pun mengunci fokus, dan
 * hanya beberapa yang menutup dengan Escape. Pengguna papan ketik yang menekan
 * Tab dari kolom alasan void mendarat di tabel di belakang lapisan gelap —
 * dialognya masih terbuka, fokusnya sudah pergi.
 *
 * ---- Gerak -------------------------------------------------------------------
 *
 * Skema tenang (`standard`), karena dialog muncul di layar kerja: lapisan gelap
 * memudar, panel naik 8px sambil membesar dari 96%. Keluar lebih cepat daripada
 * masuk — sesuai spesifikasi, karena yang menutup sudah tahu apa yang terjadi.
 * Opasitas dikunci ke pegas `effects` supaya tidak ikut melewati 100%.
 *
 * ---- Fokus -------------------------------------------------------------------
 *
 * Saat terbuka: fokus pindah ke elemen pertama yang bisa difokuskan (atau ke
 * panel), Tab berputar di dalam panel, Escape menutup. Saat tertutup: fokus
 * kembali ke tombol yang membukanya, supaya Tab berikutnya melanjutkan dari
 * tempat pengguna berhenti, bukan dari awal halaman.
 *
 * ---- Gulir -------------------------------------------------------------------
 *
 * Yang bergulir hanya ISI. Judul dan baris tombol tetap di tempatnya, seperti
 * spesifikasi M3: dialog yang lebih panjang dari layar menggulir kontennya,
 * bukan dirinya. Sebelumnya seluruh panel yang bergulir, jadi di 1280x588 judul
 * "Create a draft event" hilang begitu formulirnya digulir dan tombol Create
 * baru terlihat di dasar. Garis pemisah muncul hanya saat isinya memang lebih
 * panjang dari panel, karena garis di dialog pendek tidak memisahkan apa pun.
 */

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DialogProps = {
	open: boolean;
	/** Dipanggil pada Escape, klik di luar panel, atau tombol tutup milik pemanggil. */
	onClose: () => void;
	title: ReactNode;
	/** Ikon di depan judul. Mengikuti nada: `danger` mewarnainya `error`. */
	icon?: ReactNode;
	/** Satu-dua kalimat tentang AKIBAT, bukan "yakin?". */
	description?: ReactNode;
	children?: ReactNode;
	/** Baris tombol. Di layar lebar rata kanan, aksi utama paling kanan. */
	actions?: ReactNode;
	/**
	 * Panel kosong: hanya `children`, tanpa header, tanpa baris aksi, tanpa
	 * padding. Untuk isi yang harus menyentuh tepi panelnya, seperti blok status
	 * berwarna penuh di lembar hasil pemindaian.
	 *
	 * Yang tetap disediakan Dialog justru bagian yang paling sering salah kalau
	 * ditulis ulang: lapisan gelap, kunci fokus, Escape, dan pengembalian fokus.
	 * Tanpa prop ini, satu-satunya jalan bagi isi tanpa padding adalah menulis
	 * `fixed inset-0` sendiri -- persis kebiasaan yang membuat komponen ini ada.
	 *
	 * `title` tetap wajib dan dipakai sebagai nama panel bagi pembaca layar.
	 */
	bare?: boolean;
	size?: "sm" | "md" | "lg" | "xl";
	/** Nada judul. `danger` untuk konfirmasi yang membatalkan atau menghapus. */
	tone?: "neutral" | "danger";
	/**
	 * Boleh ditutup lewat Escape dan klik di luar. Matikan selama aksi berjalan:
	 * dialog yang tertutup di tengah permintaan meninggalkan pengguna tanpa
	 * kabar apakah aksinya jadi.
	 */
	dismissible?: boolean;
	/**
	 * Di layar sempit (< 600px) panel memenuhi layar: tombol tutup dan judul di
	 * atas, tombol aksi menempel di bawah. Untuk formulir yang lebih dari dua-tiga
	 * kolom, sesuai pola full-screen dialog M3 untuk perangkat seluler.
	 */
	fullScreenOnMobile?: boolean;
	className?: string;
};

const SIZE: Record<NonNullable<DialogProps["size"]>, string> = {
	sm: "max-w-md",
	md: "max-w-lg",
	lg: "max-w-xl",
	xl: "max-w-2xl",
};

export function Dialog({
	open,
	onClose,
	title,
	icon,
	description,
	children,
	actions,
	bare = false,
	size = "sm",
	tone = "neutral",
	dismissible = true,
	fullScreenOnMobile = false,
	className,
}: DialogProps) {
	const id = useId();
	const titleId = `${id}-title`;
	const descriptionId = `${id}-description`;
	const panel = useRef<HTMLDivElement>(null);
	const [isi, setIsi] = useState<HTMLDivElement | null>(null);
	const [bergulir, setBergulir] = useState(false);

	// Garis pemisah hanya bila isi lebih tinggi dari ruangnya. Diukur ulang saat
	// ukuran isi berubah (kolom yang muncul karena sakelar, pesan galat).
	useEffect(() => {
		if (!isi) return;
		const ukur = () => setBergulir(isi.scrollHeight > isi.clientHeight + 1);
		ukur();
		const pengamat = new ResizeObserver(ukur);
		pengamat.observe(isi);
		for (const anak of Array.from(isi.children)) pengamat.observe(anak);
		return () => pengamat.disconnect();
	}, [isi, open]);

	// `onClose` hampir selalu fungsi baru tiap render. Kalau ia masuk dependensi
	// efek di bawah, efeknya dipasang ulang tiap ketikan — dan pembersihannya
	// mengembalikan fokus ke tombol pembuka tepat saat pengguna sedang mengetik
	// alasan void. Ref memutus rantai itu.
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	});

	useEffect(() => {
		if (!open) return;
		const element = panel.current;
		const previous = document.activeElement as HTMLElement | null;
		const { body } = document;
		const overflow = body.style.overflow;
		body.style.overflow = "hidden";

		// Hanya yang tampil: panel yang disembunyikan (hidden) tetap terpasang, dan
		// tanpa saringan ini perangkap fokus tidak pernah berputar.
		const focusables = () =>
			Array.from(element?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.getClientRects().length > 0);

		// Ditunda satu tik supaya `autoFocus` milik isi dialog menang bila ada.
		const timer = window.setTimeout(() => {
			if (element && !element.contains(document.activeElement)) (focusables()[0] ?? element).focus();
		}, 0);

		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				if (!dismissible) return;
				event.preventDefault();
				onCloseRef.current();
				return;
			}
			if (event.key !== "Tab" || !element) return;
			const list = focusables();
			if (list.length === 0) {
				event.preventDefault();
				element.focus();
				return;
			}
			const first = list[0];
			const last = list[list.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", onKey);

		return () => {
			window.clearTimeout(timer);
			document.removeEventListener("keydown", onKey);
			body.style.overflow = overflow;
			previous?.focus?.();
		};
	}, [open, dismissible]);

	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					key="scrim"
					className={cx("fixed inset-0 z-50 flex items-end justify-center bg-scrim/50 p-4 sm:items-center", fullScreenOnMobile && "max-sm:p-0")}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, transition: { duration: 0.12 } }}
					transition={{ duration: 0.18 }}
					onMouseDown={(event) => {
						if (dismissible && event.target === event.currentTarget) onCloseRef.current();
					}}
				>
					<motion.div
						ref={panel}
						role="dialog"
						aria-modal="true"
						// Panel kosong tidak punya judul yang bisa ditunjuk, jadi namanya
						// diberikan langsung. Dialog tanpa nama diumumkan pembaca layar
						// sebagai "dialog" saja, dan itu tidak memberi tahu apa pun.
						aria-labelledby={bare ? undefined : titleId}
						aria-label={bare && typeof title === "string" ? title : undefined}
						aria-describedby={!bare && description ? descriptionId : undefined}
						tabIndex={-1}
						className={cx(
							"max-h-[90dvh] w-full rounded-2xl text-on-surface shadow-level3 outline-none",
							bare ? "overflow-y-auto bg-surface-container" : "flex flex-col overflow-hidden bg-surface-container-high",
							fullScreenOnMobile && "max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none",
							SIZE[size],
							className,
						)}
						initial={{ opacity: 0, scale: 0.96, y: 8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } }}
						transition={{ ...standard.spatial.default, opacity: standard.effects.default }}
					>
						{bare ? children : <>
						<div className={cx("flex shrink-0 items-start gap-3 px-6 pt-6", bergulir ? "border-b border-outline-variant pb-4" : null, fullScreenOnMobile && "max-sm:px-4 max-sm:pt-2")}>
							{fullScreenOnMobile ? (
								<span className="-ml-2 sm:hidden">
									<IconButton label="Close" onClick={() => onCloseRef.current()} disabled={!dismissible}>
										<X size={20} />
									</IconButton>
								</span>
							) : null}
							{icon ? (
								<span className={cx("mt-0.5 shrink-0", tone === "danger" ? "text-error" : "text-primary")} aria-hidden>
									{icon}
								</span>
							) : null}
							<div className={cx("min-w-0 flex-1", fullScreenOnMobile && "max-sm:pt-2")}>
								<h2 id={titleId} className={cx("text-title-large font-semibold", tone === "danger" && "text-error")}>
									{title}
								</h2>
								{description ? (
									<p id={descriptionId} className="mt-2 text-body-medium leading-6 text-on-surface-variant">
										{description}
									</p>
								) : null}
							</div>
						</div>

						{/* pb-1: cincin fokus kolom terakhir tidak terpotong tepi gulir. */}
						<div ref={setIsi} className={cx("min-h-0 flex-1 overflow-y-auto px-6 pb-1", !actions && "pb-6", fullScreenOnMobile && "max-sm:px-4")}>
							{children}
						</div>

						{actions ? (
							<div className={cx(
								"flex shrink-0 flex-col-reverse gap-2 px-6 pb-6 sm:flex-row sm:justify-end",
								bergulir ? "border-t border-outline-variant pt-4" : "pt-6",
								fullScreenOnMobile && "max-sm:px-4 max-sm:pb-4",
							)}>{actions}</div>
						) : null}
						</>}
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
