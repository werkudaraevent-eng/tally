"use client";

import type { CSSProperties } from "react";
import { BadgeSisi, type StatusRundown } from "@/components/badge/badge-sisi";
import type { BadgeData, BadgeEventData, BadgeLayout, Garis, Lembar, Mm } from "@/lib/badge/layout";
import type { BadgeRundownHari } from "@/lib/badge/rundown";

/**
 * Satu lembar kertas badge: panel badge, takik lipat, garis potong, dan
 * petunjuk melipat. Dipakai halaman cetak (/cetak-badge) dan stasiun cetak
 * (/stasiun), supaya badge yang keluar dari keduanya sama persis.
 *
 * `isi` adalah peserta untuk lembar ini, urut slot: A4 isi dua memuat dua.
 */
export function LembarBadge({
	layout, lembar, isi, event, hari, hariIni, geser, onRundown, className, style,
}: {
	layout: BadgeLayout;
	lembar: Lembar;
	isi: BadgeData[];
	event: BadgeEventData;
	hari: BadgeRundownHari[];
	hariIni: string;
	geser: { x: number; y: number };
	onRundown?: (status: StatusRundown) => void;
	className?: string;
	style?: CSSProperties;
}) {
	const { kertas } = lembar;
	return (
		<div className={className} style={{ width: `${kertas.w}mm`, height: `${kertas.h}mm`, ...style }}>
			<div style={{ position: "absolute", inset: 0, transform: `translate(${geser.x}mm, ${geser.y}mm)` }}>
				{lembar.panels.map((panel, p) => {
					const data = isi[panel.slot];
					if (!data) return null;
					return (
						<BadgeSisi
							key={p}
							layout={layout}
							side={panel.side}
							data={data}
							event={event}
							hari={hari}
							hariIni={hariIni}
							onRundown={onRundown}
							cetak
							style={{
								position: "absolute",
								left: `${panel.x}mm`,
								top: `${panel.y}mm`,
								transform: panel.rotate === 180 ? "rotate(180deg)" : undefined,
							}}
						/>
					);
				})}
				<TandaLembar lembar={lembar} />
			</div>
		</div>
	);
}

/** "YYYY-MM-DD" hari ini di jam perangkat, untuk rundown "Hari ini". */
export function hariIniLokal() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Garis tipis berwarna abu, cukup terlihat untuk dilipat, nyaris hilang di badge jadi. */
const TINTA_TANDA = "#9a9a9a";

/**
 * Tanda lipat dan potong.
 *
 * Lipatan hanya ditandai dengan TAKIK pendek di kedua ujungnya, bukan garis
 * penuh: garis putus-putus yang membelah depan badge tetap terlihat setelah
 * dilipat. Takiknya 4 mm, dimulai 4 mm dari tepi, karena printer kantor tidak
 * mencetak 3-5 mm terluar.
 *
 * Garis potong digambar penuh tetapi hanya di bagian yang dibuang, kecuali
 * garis potong di antara dua badge (A4 isi dua) yang memang dibelah di situ.
 */
export function TandaLembar({ lembar }: { lembar: Lembar }) {
	const { kertas } = lembar;
	const takik = (g: Garis, i: number) => {
		const tegak = Math.abs(g.x1 - g.x2) < 0.01;
		// Lipatan yang berujung di tepi kertas: takik di dalam, mulai 4 mm dari
		// tepi. Lipatan badge yang ditata di tengah lembar: takik di LUAR badge,
		// di sela antarbadge, supaya tidak tercetak di badge jadi.
		const diTepi = tegak ? g.y1 < 0.6 : g.x1 < 0.6;
		const [a1, a2, b1, b2] = diTepi ? [4, 8, -8, -4] : [-4, -1, 1, 4];
		const ruas: Garis[] = tegak
			? [{ x1: g.x1, y1: g.y1 + a1, x2: g.x1, y2: g.y1 + a2 }, { x1: g.x1, y1: g.y2 + b1, x2: g.x1, y2: g.y2 + b2 }]
			: [{ x1: g.x1 + a1, y1: g.y1, x2: g.x1 + a2, y2: g.y1 }, { x1: g.x2 + b1, y1: g.y1, x2: g.x2 + b2, y2: g.y1 }];
		return ruas.map((r, j) => <line key={`l${i}-${j}`} {...r} stroke={TINTA_TANDA} strokeWidth={0.25} />);
	};
	return (
		<>
			<svg
				aria-hidden
				viewBox={`0 0 ${kertas.w} ${kertas.h}`}
				style={{ position: "absolute", inset: 0, width: `${kertas.w}mm`, height: `${kertas.h}mm`, pointerEvents: "none" }}
			>
				{lembar.lipatan.flatMap(takik)}
				{lembar.tanda.map((g, i) => <line key={`t${i}`} {...g} stroke="#555555" strokeWidth={0.2} />)}
				{lembar.potongan.map((g, i) => (
					<line key={`p${i}`} {...g} stroke={TINTA_TANDA} strokeWidth={0.2} strokeDasharray="2 1.5" />
				))}
			</svg>
			{lembar.petunjuk ? (
				<div
					style={{
						position: "absolute",
						left: `${lembar.petunjuk.x + 10}mm`,
						top: `${lembar.petunjuk.y + 12}mm`,
						width: `${lembar.petunjuk.w - 20}mm`,
						fontFamily: "var(--font-sans), Arial, sans-serif",
						fontSize: "9pt",
						lineHeight: 1.45,
						color: "#555555",
					}}
				>
					<p style={{ fontWeight: 700, marginBottom: "2mm" }}>Cara melipat</p>
					<p>1. Lipat bagian kanan ke belakang, tepat di takik tengah atas dan bawah.</p>
					<p>2. Lipat bagian bawah ke belakang di takik samping.</p>
					<p>3. Nama di depan, rundown di belakang. Bagian ini tersembunyi di dalam.</p>
				</div>
			) : null}
		</>
	);
}

/**
 * Halaman kalibrasi: garis 100 mm dan tanda sudut 10 mm dari tepi.
 *
 * Dua kesalahan cetak yang paling sering di printer kantor bisa diukur dari
 * sini dengan penggaris: skala (Fit to page diam-diam aktif, garisnya jadi
 * 94-97 mm) dan geser (tanda sudut 11 mm di satu sisi, 9 mm di sisi lain).
 * Koreksi geser TIDAK dipakai di halaman ini, supaya yang terukur adalah
 * kesalahan printernya sendiri.
 */
export function LembarKalibrasi({ kertas, nama }: { kertas: Mm; nama: string }) {
	const { w, h } = kertas;
	const sudut = (x: number, y: number, dx: number, dy: number, i: number) => (
		<path key={i} d={`M${x + dx * 6} ${y} H${x} V${y + dy * 6}`} fill="none" stroke="#000" strokeWidth={0.3} />
	);
	const mulai = (w - 100) / 2;
	const yGaris = Math.min(60, h / 3);
	return (
		<div className="cetak-lembar relative bg-white shadow-level2" style={{ width: `${w}mm`, height: `${h}mm` }}>
			<svg aria-hidden viewBox={`0 0 ${w} ${h}`} style={{ width: `${w}mm`, height: `${h}mm`, display: "block" }}>
				{[sudut(10, 10, 1, 1, 0), sudut(w - 10, 10, -1, 1, 1), sudut(10, h - 10, 1, -1, 2), sudut(w - 10, h - 10, -1, -1, 3)]}
				<text x={14} y={17} fontSize={3} fill="#333">Setiap sudut tepat 10 mm dari tepi kertas</text>
				<line x1={mulai} y1={yGaris} x2={mulai + 100} y2={yGaris} stroke="#000" strokeWidth={0.3} />
				{Array.from({ length: 11 }, (_, i) => (
					<line key={i} x1={mulai + i * 10} y1={yGaris - (i % 5 === 0 ? 4 : 2.5)} x2={mulai + i * 10} y2={yGaris} stroke="#000" strokeWidth={0.25} />
				))}
				<text x={w / 2} y={yGaris + 6} fontSize={3.2} textAnchor="middle" fill="#333">Garis ini harus tepat 100 mm</text>
				<line x1={w / 2} y1={h / 2 - 15} x2={w / 2} y2={h / 2 + 15} stroke="#c0392b" strokeWidth={0.2} strokeDasharray="1.5 1" />
				<line x1={w / 2 - 15} y1={h / 2} x2={w / 2 + 15} y2={h / 2} stroke="#c0392b" strokeWidth={0.2} strokeDasharray="1.5 1" />
				<text x={w / 2} y={h - 14} fontSize={2.8} textAnchor="middle" fill="#777">Tally · kalibrasi {nama}</text>
			</svg>
		</div>
	);
}
