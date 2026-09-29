"use client";

import { CaretDown, Check, Columns, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAdminHeaderScroll, useAdminPage } from "@/components/admin/page-context";
import { cx } from "@/lib/m3/cx";
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
	 * Dipakai list-detail dan supporting pane. Di bawah `lg` kembali bergulir biasa.
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
				fill && "lg:h-[calc(100dvh-var(--workspace-top,58px))] lg:overflow-hidden",
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
		<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
			<div className="min-w-[240px] flex-1">
				{back ? <div className="mb-1">{back}</div> : null}
				<h1 ref={gulir?.amati} className="text-[1.875rem] font-semibold leading-10 text-on-surface">{title ?? page?.label}</h1>
				{meta ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium text-on-surface-variant">{meta}</div> : null}
			</div>
			{actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
		</header>
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

export function Pane({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "aside" | "div"; "aria-label"?: string }) {
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
export function PaneBody({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cx("min-h-0 flex-1 overflow-y-auto", className)}>{children}</div>;
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
	return (
		<div className="flex min-h-0 flex-1 gap-6">
			<div className={cx("flex min-h-0 min-w-0 flex-1 flex-col *:flex-1", terbuka && "max-lg:hidden")}>{list}</div>
			{terbuka ? (
				<div className="flex min-h-0 w-full flex-col *:flex-1 lg:w-[var(--detail-w)] lg:shrink-0" style={{ "--detail-w": `${detailWidth}px` } as React.CSSProperties}>
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
			<div className="flex min-h-0 w-full flex-col *:flex-1 lg:w-[var(--pane-w)] lg:shrink-0" style={{ "--pane-w": `${paneWidth}px` } as React.CSSProperties}>
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
				"inline-flex h-8 shrink-0 items-center rounded-full border text-body-medium font-medium",
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
				className={cx("inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-full pl-3", aktif ? "pr-1.5" : "pr-2.5 hover:bg-primary-soft")}
			>
				{teks}
				{aktif ? null : <CaretDown size={14} aria-hidden className="text-on-surface-variant" />}
			</button>
			{aktif ? (
				<button
					type="button"
					aria-label={`Hapus saringan ${label}`}
					onClick={() => onChange([])}
					className="mr-1 grid size-6 place-items-center rounded-full hover:bg-surface-container-high"
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
