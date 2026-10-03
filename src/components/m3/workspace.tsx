"use client";

import { CaretDown, Check, Columns, LockSimple, MagnifyingGlass, Warning, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type HTMLAttributes, type ReactNode } from "react";
import { useAdminHeaderScroll, useAdminPage } from "@/components/admin/page-context";
import { cx } from "@/lib/m3/cx";
import { Banner } from "./layout";
import { Popover, usePopoverAnchor } from "./popover";

/**
 * Susunan halaman ruang kerja: canonical layout Material 3 (Feed, List-detail,
 * Supporting pane) dengan tampilan dasbor Cloudflare. Margin 24px dan jarak antar
 * panel 24px adalah ukuran M3 untuk jendela besar.
 */

export type WorkspacePageProps = {
	children: ReactNode;
	/**
	 * Halaman setinggi jendela; panel di dalamnya bergulir sendiri.
	 * Dipakai list-detail dan supporting pane. Di bawah `lg` dan di layar pendek
	 * (`short:`) kembali bergulir biasa.
	 */
	fill?: boolean;
	/** Lebar isi. `full` untuk halaman berpanel, `wide` untuk feed, `form` untuk satu kolom. */
	width?: "full" | "wide" | "form";
	className?: string;
};

const WIDTH = { full: "", wide: "max-w-[1400px]", form: "max-w-[960px]" } as const;

export function WorkspacePage({ children, fill, width = "full", className }: WorkspacePageProps) {
	return (
		<main
			className={cx(
				"flex w-full flex-col gap-4 bg-surface p-4 text-on-surface sm:p-6",
				// Di layar pendek (laptop berskala 150%) tinggi tidak dikunci: tabel yang
				// diperas ke sisa ruang hanya muat dua baris, dan judul tidak pernah
				// tergulir ke bilah atas. Halaman bergulir biasa seperti di bawah `lg`.
				fill && "lg:h-[calc(100dvh-var(--workspace-top,57px))] lg:overflow-hidden short:h-auto short:overflow-visible",
				WIDTH[width],
				className,
			)}
		>
			{children}
		</main>
	);
}

export type WorkspaceHeaderProps = {
	/** Bawaannya label menu halaman ini, dibaca PageHeader dari AdminShell. */
	title?: ReactNode;
	/** Satu baris keadaan di bawah judul: status, hitungan, tautan kecil. */
	meta?: ReactNode;
	actions?: ReactNode;
	/** Tautan kembali di atas judul, untuk halaman turunan. */
	back?: ReactNode;
};

export function WorkspaceHeader({ title, meta, actions, back }: WorkspaceHeaderProps) {
	const page = useAdminPage();
	const gulir = useAdminHeaderScroll();
	return (
		<>
		<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
			<div className="min-w-[240px] flex-1">
				{back ? <div className="mb-1">{back}</div> : null}
				<h1 ref={gulir?.amati} className="text-headline-medium text-on-surface">{title ?? page?.label}</h1>
				{meta ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium text-on-surface-variant">{meta}</div> : null}
			</div>
			{actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
		</header>
		{page?.kunci ? <PenandaKunci {...page.kunci} /> : null}
		</>
	);
}

/**
 * Penanda acara yang sudah ditutup, di bawah judul setiap halaman.
 *
 * Tanpa ini semua halaman tetap terlihat bisa disunting, dan admin baru tahu
 * acaranya terkunci setelah menekan Simpan dan ditolak server, sekali per
 * halaman. Satu tempat di kepala halaman, bukan per tombol: yang terkunci adalah
 * acaranya, bukan satu formulir.
 */
function PenandaKunci({ status, pemilik }: { status: "completed" | "archived"; pemilik: boolean }) {
	const kata = status === "archived" ? "diarsipkan" : "selesai";
	return pemilik ? (
		<Banner compact tone="warning" icon={<Warning size={16} />}>
			<span className="font-medium">Acara ini sudah {kata}.</span> Sebagai super admin, perubahan Anda tetap tersimpan dan mengubah angka yang sudah diserahkan.
		</Banner>
	) : (
		<Banner compact tone="info" icon={<LockSimple size={16} />}>
			<span className="font-medium">Acara ini sudah {kata}, jadi hanya bisa dilihat dan diekspor.</span> Perubahan tidak akan tersimpan. Untuk mengoreksi, minta super admin membuka kembali acaranya.
		</Banner>
	);
}

export function MetaSeparator() {
	return <span aria-hidden className="text-outline">·</span>;
}

/** Titik status 8px di baris meta. Warna selalu berpasangan dengan teks di sebelahnya. */
export function StatusDot({ tone = "neutral" }: { tone?: "neutral" | "success" | "warning" | "error" }) {
	const warna = { neutral: "bg-outline", success: "bg-success", warning: "bg-warning", error: "bg-error" }[tone];
	return <span aria-hidden className={cx("size-2 shrink-0 rounded-full", warna)} />;
}

/* ------------------------------------------------------------------ Panel */

export function Pane({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "aside" | "div"; "aria-label"?: string; id?: string }) {
	return (
		<Tag
			{...rest}
			className={cx(
				"flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest",
				className,
			)}
		>
			{children}
		</Tag>
	);
}

export function PaneHeader({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cx("flex shrink-0 items-center gap-2 border-b border-outline-variant px-4 py-3", className)}>{children}</div>;
}

/** Isi panel yang bergulir sendiri. `min-h-0` wajib supaya anak flex mau menyusut. */
export function PaneBody({ children, className, ...rest }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
	// `relative` wajib. Tanpanya, elemen `position: absolute` di dalam isi yang
	// bergulir (label `sr-only` saklar, misalnya) tidak punya leluhur ber-posisi,
	// lolos dari potongan `overflow`, dan ikut memanjangkan HALAMAN setinggi isi
	// panel. Akibatnya editor yang dikunci setinggi layar tetap bisa digulir ke
	// bidang kosong di bawahnya (diukur di Halaman acara: 1690px pada layar 588px).
	return (
		<div {...rest} className={cx("relative min-h-0 flex-1 overflow-y-auto", className)}>
			{children}
		</div>
	);
}

/** Kaki panel yang menempel: keterangan di kiri, aksi di kanan. Satu aksi utama per panel. */
export function PaneFooter({ note, children, className }: { note?: ReactNode; children?: ReactNode; className?: string }) {
	return (
		<div className={cx("flex shrink-0 flex-wrap items-center gap-2 border-t border-outline-variant bg-surface-container-high px-4 py-3", className)}>
			{/* min-w-40, bukan min-w-0: di panel sempit catatannya harus mendorong
			    tombol ke baris berikut, bukan diperas jadi satu kata per baris. */}
			<div className="min-w-40 flex-1 text-body-medium text-on-surface-variant">{note}</div>
			{children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
		</div>
	);
}

/* ------------------------------------------------------- Canonical layout */

/**
 * Panel kanan di layar pendek, saat halaman tidak dikunci setinggi jendela.
 * Tanpa ini, memilih baris di bawah daftar yang panjang membuka detail di atas,
 * di luar layar. Panel menempel di bawah bilah atas dan bergulir sendiri.
 */
const PANEL_MENEMPEL =
	"lg:short:sticky lg:short:top-[calc(var(--workspace-top,57px)+16px)] lg:short:self-start lg:short:max-h-[calc(100dvh-var(--workspace-top,57px)-32px)]";

/**
 * Panel daftar di layar pendek: setinggi layar dan bergulir sendiri. Halaman
 * bergulir dulu sampai judul pindah ke bilah atas, lalu daftar mengisi layar.
 * Tanpa batas tinggi, panelnya memanjang mengikuti isi dan kepala tabel yang
 * `sticky top-0` di dalamnya ikut tergulir hilang.
 */
const DAFTAR_SETINGGI_LAYAR = "lg:short:h-[calc(100dvh-var(--workspace-top,57px)-32px)]";

/** Sama dengan `lg` + `short` di globals.css. */
const MQ_PENDEK = "(min-width: 64rem) and (max-height: 720px)";

/**
 * Roda di atas daftar menggulir HALAMAN dulu sampai panel daftar mencapai bilah
 * atas, baru kemudian isi daftar. Peramban melakukan kebalikannya (isi dulu),
 * sehingga di layar pendek daftar tertahan di bawah judul dan hanya dua baris
 * yang terlihat. Menggulir ke atas tidak perlu diatur: saat isi daftar sudah di
 * puncak, peramban meneruskannya ke halaman.
 */
function useGulirHalamanDulu() {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const mq = window.matchMedia(MQ_PENDEK);
		const onWheel = (event: WheelEvent) => {
			if (!mq.matches || event.deltaY <= 0 || event.ctrlKey) return;
			const batas = el.getBoundingClientRect().top - 16 - (parseFloat(getComputedStyle(el).getPropertyValue("--workspace-top")) || 57);
			const sisaHalaman = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
			// Halaman yang sudah mentok tidak boleh menahan gulir daftar.
			if (batas <= 1 || sisaHalaman <= 1) return;
			event.preventDefault();
			window.scrollBy({ top: Math.min(event.deltaY, batas, sisaHalaman) });
		};
		// passive: false wajib agar preventDefault menahan gulir isi daftar.
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);
	return ref;
}

export type ListDetailProps = {
	list: ReactNode;
	/** Null = belum ada yang dipilih; daftar memakai seluruh lebar. */
	detail: ReactNode | null;
	detailWidth?: number;
};

/**
 * List-detail M3. Di layar besar dua panel berdampingan; di bawah `lg` detail
 * menggantikan daftar (satu panel), ditutup lewat tombol tutup di detailnya.
 */
export function ListDetail({ list, detail, detailWidth = 440 }: ListDetailProps) {
	const terbuka = detail != null;
	const daftarRef = useGulirHalamanDulu();
	return (
		<div className="flex min-h-0 flex-1 gap-6">
			<div ref={daftarRef} className={cx("flex min-h-0 min-w-0 flex-1 flex-col *:flex-1", DAFTAR_SETINGGI_LAYAR, terbuka && "max-lg:hidden")}>{list}</div>
			{terbuka ? (
				<div className={cx("flex min-h-0 w-full flex-col *:flex-1 lg:w-[var(--detail-w)] lg:shrink-0", PANEL_MENEMPEL)} style={{ "--detail-w": `${detailWidth}px` } as React.CSSProperties}>
					{detail}
				</div>
			) : null}
		</div>
	);
}

/** Supporting pane M3: objek yang disunting di tengah, setelannya di panel kanan. */
export function SupportingPane({ main, pane, paneWidth = 400 }: { main: ReactNode; pane: ReactNode; paneWidth?: number }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
			<div className="flex min-h-0 min-w-0 flex-1 flex-col *:flex-1">{main}</div>
			<div className={cx("flex min-h-0 w-full flex-col *:flex-1 lg:w-[var(--pane-w)] lg:shrink-0", PANEL_MENEMPEL)} style={{ "--pane-w": `${paneWidth}px` } as React.CSSProperties}>
				{pane}
			</div>
		</div>
	);
}

/* --------------------------------------------------------- Isi panel detail */

export function DetailSection({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
	return (
		<section className={cx("flex flex-col gap-2.5 border-b border-outline-variant px-5 py-4 last:border-b-0", className)}>
			{title || action ? (
				<div className="flex items-center gap-2">
					{title ? <h3 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">{title}</h3> : null}
					{action}
				</div>
			) : null}
			{children}
		</section>
	);
}

export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="flex items-start gap-3 text-body-medium">
			<dt className="w-[132px] shrink-0 text-on-surface-variant">{label}</dt>
			<dd className="min-w-0 flex-1 break-words text-on-surface">{children}</dd>
		</div>
	);
}

/** Baris daftar yang bisa dipilih. Seluruh baris adalah tombolnya. */
export function ListRow({ selected, onSelect, children, className, label }: { selected?: boolean; onSelect?: () => void; children: ReactNode; className?: string; label?: string }) {
	return (
		<button
			type="button"
			aria-pressed={onSelect ? Boolean(selected) : undefined}
			aria-label={label}
			onClick={onSelect}
			className={cx(
				"flex w-full items-center gap-3 border-b border-outline-variant px-4 py-2.5 text-left text-body-medium",
				selected ? "bg-secondary-container" : "hover:bg-primary-soft",
				className,
			)}
		>
			{children}
		</button>
	);
}

/* ---------------------------------------------------------- Pilihan kolom */

export type ColumnOption = { key: string; label: string; locked?: boolean };

const PERISTIWA_KOLOM = "tally-kolom";

function langgananKolom(onChange: () => void) {
	window.addEventListener("storage", onChange);
	window.addEventListener(PERISTIWA_KOLOM, onChange);
	return () => {
		window.removeEventListener("storage", onChange);
		window.removeEventListener(PERISTIWA_KOLOM, onChange);
	};
}

function bacaPenyimpanan(kunci: string): string | null {
	try { return window.localStorage.getItem(kunci); } catch { return null; }
}

/**
 * Pilihan kolom tabel, disimpan per akun per acara di peramban.
 * Belum ikut pindah perangkat; itu butuh tabel preferensi di server.
 */
export function useColumnPrefs(table: string, defaults: string[]) {
	const page = useAdminPage();
	const kunci = `tally:kolom:${table}:${page?.username ?? "anon"}:${page?.eventSlug ?? "-"}`;
	const mentah = useSyncExternalStore(langgananKolom, () => bacaPenyimpanan(kunci), () => null);
	let nilai: string[] | null = null;
	try { nilai = mentah ? (JSON.parse(mentah) as string[]) : null; } catch { nilai = null; }
	const setVisible = (next: string[] | null) => {
		try {
			if (next) window.localStorage.setItem(kunci, JSON.stringify(next));
			else window.localStorage.removeItem(kunci);
		} catch { /* penyimpanan peramban diblokir: pilihan tidak tersimpan */ }
		window.dispatchEvent(new Event(PERISTIWA_KOLOM));
	};
	return { visible: nilai ?? defaults, setVisible, isDefault: nilai == null };
}

export function ColumnMenu({ columns, visible, onChange, onReset, isDefault }: {
	columns: ColumnOption[];
	visible: string[];
	onChange: (next: string[]) => void;
	onReset: () => void;
	isDefault?: boolean;
}) {
	const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
	const anchor = usePopoverAnchor(pemicu);
	const id = useId();
	const toggle = (key: string) => onChange(visible.includes(key) ? visible.filter((item) => item !== key) : [...visible, key]);
	return (
		<>
			<button
				ref={setPemicu}
				type="button"
				aria-haspopup="dialog"
				aria-expanded={anchor.open}
				aria-controls={anchor.open ? id : undefined}
				onClick={anchor.toggle}
				className={cx(
					"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-outline px-2.5 text-body-medium font-medium text-on-surface",
					anchor.open ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft",
				)}
			>
				<Columns size={16} aria-hidden />
				Kolom
			</button>
			<Popover anchor={anchor} label="Tampilkan kolom" role="dialog" id={id} align="end" width={264}>
				<p className="px-3 pb-1 pt-1.5 text-body-medium font-medium text-on-surface-variant">Tampilkan kolom</p>
				<div className="py-0.5">
					{columns.map((column) => {
						const on = column.locked || visible.includes(column.key);
						return (
							<label key={column.key} className={cx("flex min-h-[34px] items-center gap-2.5 rounded-md px-3 text-body-medium", column.locked ? "text-on-surface-variant" : "cursor-pointer text-on-surface hover:bg-primary-soft")}>
								<input
									type="checkbox"
									checked={on}
									disabled={column.locked}
									onChange={() => toggle(column.key)}
									className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
								/>
								<span className="min-w-0 flex-1 truncate">{column.label}</span>
								{column.locked ? <span className="text-on-surface-variant">selalu</span> : null}
							</label>
						);
					})}
				</div>
				<div className="border-t border-outline-variant px-3 pb-1 pt-2">
					<button type="button" disabled={isDefault} onClick={onReset} className="rounded-sm text-body-medium font-medium text-primary hover:underline disabled:text-on-surface-variant disabled:no-underline">
						Kembalikan bawaan
					</button>
				</div>
			</Popover>
		</>
	);
}

/* ------------------------------------------------------------ Chip saring */

export type ChipMenuOption = { value: string; label: string; count?: number };

export type ChipMenuProps = {
	/** Nama penyaring, mis. "Perusahaan". Tampil sendirian saat belum ada pilihan. */
	label: string;
	options: ChipMenuOption[];
	selected: string[];
	onChange: (next: string[]) => void;
	/** Boleh memilih lebih dari satu. Bawaannya satu. */
	multiple?: boolean;
	/** Kolom cari di dalam menu, untuk daftar panjang seperti perusahaan. */
	searchable?: boolean;
	/** Teks chip saat aktif. Bawaannya "Label: pilihan" atau "Label: 3". */
	summary?: (selected: ChipMenuOption[]) => string;
};

/**
 * Chip penyaring M3 berbentuk pil, membuka menu pilihan. Aktif = bertepi aksen
 * dengan tombol hapus; itu satu-satunya tanda, jadi teksnya selalu menyebut pilihannya.
 */
export function ChipMenu({ label, options, selected, onChange, multiple, searchable, summary }: ChipMenuProps) {
	const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
	const anchor = usePopoverAnchor(pemicu);
	const [cari, setCari] = useState("");
	const id = useId();
	const terpilih = options.filter((option) => selected.includes(option.value));
	const aktif = terpilih.length > 0;
	const teks = !aktif
		? label
		: summary
			? summary(terpilih)
			: terpilih.length === 1
				? `${label}: ${terpilih[0].label}`
				: `${label}: ${terpilih.length}`;
	const tersaring = cari ? options.filter((option) => option.label.toLowerCase().includes(cari.toLowerCase())) : options;

	const pilih = (value: string) => {
		if (!multiple) {
			onChange(selected.includes(value) ? [] : [value]);
			anchor.tutup();
			return;
		}
		onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
	};

	return (
		<div
			className={cx(
				"inline-flex h-8 shrink-0 items-center rounded-md border text-body-medium",
				aktif ? "border-primary bg-accent-soft text-primary" : "border-outline bg-surface-container-lowest text-on-surface",
			)}
		>
			<button
				ref={setPemicu}
				type="button"
				aria-haspopup="listbox"
				aria-expanded={anchor.open}
				aria-controls={anchor.open ? id : undefined}
				onClick={anchor.toggle}
				className={cx("inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-md pl-3", aktif ? "pr-1.5" : "pr-2.5 hover:bg-primary-soft")}
			>
				{teks}
				{aktif ? null : <CaretDown size={14} aria-hidden className="text-on-surface-variant" />}
			</button>
			{aktif ? (
				<button
					type="button"
					aria-label={`Hapus saringan ${label}`}
					onClick={() => onChange([])}
					className="mr-1 grid size-6 place-items-center rounded-sm hover:bg-surface-container-high"
				>
					<X size={14} aria-hidden />
				</button>
			) : null}
			<Popover anchor={anchor} label={label} role="listbox" id={id} align="start" width={multiple || searchable ? 300 : undefined}>
				{searchable ? (
					<div className="sticky -top-1 z-10 -mt-1 flex items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-2 pb-1.5 pt-1.5">
						<MagnifyingGlass size={16} aria-hidden className="text-on-surface-variant" />
						<input
							value={cari}
							onChange={(event) => setCari(event.target.value)}
							placeholder={`Cari ${label.toLowerCase()}...`}
							aria-label={`Cari ${label.toLowerCase()}`}
							className="h-8 min-w-0 flex-1 bg-transparent text-body-medium outline-none placeholder:text-on-surface-variant"
						/>
					</div>
				) : null}
				<div className="py-1">
					{tersaring.length === 0 ? <p className="px-3 py-2 text-body-medium text-on-surface-variant">Tidak ada yang cocok.</p> : null}
					{tersaring.map((option) => {
						const on = selected.includes(option.value);
						return (
							<button
								key={option.value}
								type="button"
								role="option"
								aria-selected={on}
								onClick={() => pilih(option.value)}
								title={option.label}
								className="flex min-h-[34px] w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-body-medium text-on-surface hover:bg-primary-soft"
							>
								{multiple ? (
									<span aria-hidden className={cx("grid size-4 shrink-0 place-items-center rounded-[4px] border", on ? "border-primary bg-primary text-on-primary" : "border-outline bg-surface-container-lowest")}>
										{on ? <Check size={12} weight="bold" /> : null}
									</span>
								) : (
									<Check size={16} aria-hidden className={cx("shrink-0", on ? "text-primary" : "invisible")} />
								)}
								{/* Dua baris, bukan satu: nama perusahaan panjang sering berawalan sama dan tak terbedakan bila dipotong. */}
								<span className="line-clamp-2 min-w-0 flex-1 break-words">{option.label}</span>
								{option.count != null ? <span className="tabular-nums text-on-surface-variant">{option.count}</span> : null}
							</button>
						);
					})}
				</div>
				{multiple && aktif ? (
					<div className="sticky -bottom-1 z-10 -mb-1 flex items-center justify-between border-t border-outline-variant bg-surface-container-lowest px-3 pb-2 pt-2 text-body-medium">
						<span className="text-on-surface-variant">{terpilih.length} dipilih</span>
						<button type="button" onClick={() => onChange([])} className="rounded-sm font-medium text-primary hover:underline">Hapus pilihan</button>
					</div>
				) : null}
			</Popover>
		</div>
	);
}
