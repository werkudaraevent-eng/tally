import type { ReactNode } from "react";
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
	title: ReactNode;
	description?: ReactNode;
	/** Aksi utama halaman. Satu saja. */
	actions?: ReactNode;
	className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
	return (
		<header className={cx("flex flex-wrap items-end justify-between gap-4", className)}>
			<div className="min-w-0">
				{eyebrow ? (
					<p className="text-label-medium font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
				) : null}
				<h1 className="mt-1 text-headline-small font-semibold tracking-tight text-on-surface sm:text-headline-medium">{title}</h1>
				{description ? <p className="mt-2 max-w-2xl text-body-medium text-on-surface-variant">{description}</p> : null}
			</div>
			{actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
		</header>
	);
}

export type EmptyStateProps = {
	icon?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	className?: string;
};

/**
 * Keadaan kosong selalu menyebutkan langkah berikutnya.
 *
 * "Belum ada data" memberi tahu apa yang terjadi tetapi tidak apa yang harus
 * dilakukan, dan di tengah acara tidak ada waktu menebak apakah itu berarti
 * salah saring, salah event, atau memang belum ada yang datang.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
	return (
		<div className={cx("flex flex-col items-center rounded-lg border border-dashed border-outline-variant px-6 py-12 text-center", className)}>
			{icon ? <div className="mb-4 text-on-surface-variant" aria-hidden>{icon}</div> : null}
			<p className="text-title-medium font-semibold text-on-surface">{title}</p>
			{description ? <p className="mt-2 max-w-md text-body-medium text-on-surface-variant">{description}</p> : null}
			{action ? <div className="mt-6">{action}</div> : null}
		</div>
	);
}
