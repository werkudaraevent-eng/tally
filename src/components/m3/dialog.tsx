"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "@/lib/m3/cx";
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
	className,
}: DialogProps) {
	const id = useId();
	const titleId = `${id}-title`;
	const descriptionId = `${id}-description`;
	const panel = useRef<HTMLDivElement>(null);

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

		const focusables = () => Array.from(element?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

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
					className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/50 p-4 sm:items-center"
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
							"max-h-[90dvh] w-full overflow-y-auto rounded-2xl text-on-surface shadow-level3 outline-none",
							bare ? "bg-surface-container" : "bg-surface-container-high p-6",
							SIZE[size],
							className,
						)}
						initial={{ opacity: 0, scale: 0.96, y: 8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } }}
						transition={{ ...standard.spatial.default, opacity: standard.effects.default }}
					>
						{bare ? children : <>
						<div className="flex items-start gap-3">
							{icon ? (
								<span className={cx("mt-0.5 shrink-0", tone === "danger" ? "text-error" : "text-primary")} aria-hidden>
									{icon}
								</span>
							) : null}
							<div className="min-w-0 flex-1">
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

						{children}

						{actions ? <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div> : null}
						</>}
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
