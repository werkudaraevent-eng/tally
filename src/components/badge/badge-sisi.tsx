"use client";

import QRCode from "qrcode";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
	badgeText,
	ukuranSisi,
	type BadgeData,
	type BadgeElement,
	type BadgeEventData,
	type BadgeLayout,
	type BadgeQrElement,
	type BadgeRundownElement,
	type BadgeSide,
	type BadgeTextElement,
} from "@/lib/badge/layout";
import { barisRundown, judulRundown, type BadgeRundownHari } from "@/lib/badge/rundown";

/**
 * Satu sisi badge, digambar dalam milimeter CSS.
 *
 * Komponen yang SAMA dipakai penyunting (diskalakan dengan `transform`) dan
 * halaman cetak (ukuran asli). Karena itu tidak ada satu pun angka piksel di
 * sini: semua posisi `mm` dan semua huruf `pt`, dua satuan yang dipegang
 * dialog cetak peramban apa adanya.
 */

/** Piksel CSS per milimeter pada skala 100%. */
export const PX_PER_MM = 96 / 25.4;

/** Ukuran modul QR terkecil yang masih terbaca kamera ponsel dari jarak genggam. */
export const MODUL_MIN_MM = 0.5;

export type StatusRundown = { muat: boolean; ukuran: number };

/** Matriks QR beserta ukuran modulnya. Zona tenang empat modul di dalam pelat. */
export function matriksQr(teks: string, pelatMm: number) {
	const qr = QRCode.create(teks || "-", { errorCorrectionLevel: "M" });
	const n = qr.modules.size;
	return { n, data: qr.modules.data, modulMm: pelatMm / (n + 8) };
}

function QrPelat({ element, teks }: { element: BadgeQrElement; teks: string }) {
	const { n, data } = useMemo(() => matriksQr(teks, element.size), [teks, element.size]);
	// Satu path untuk seluruh modul: 600 <rect> per badge kali 300 badge membuat
	// dialog cetak Chrome berpikir puluhan detik sebelum pratinjaunya muncul.
	const jalur = useMemo(() => {
		let d = "";
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
		return d;
	}, [n, data]);
	return (
		<svg
			viewBox={`0 0 ${n + 8} ${n + 8}`}
			shapeRendering="crispEdges"
			aria-hidden
			style={{ position: "absolute", left: `${element.x}mm`, top: `${element.y}mm`, width: `${element.size}mm`, height: `${element.size}mm` }}
		>
			<rect width={n + 8} height={n + 8} fill="#ffffff" />
			<path d={jalur} fill="#000000" />
		</svg>
	);
}

/**
 * Teks yang mengecil sendiri bila tidak muat, lalu pindah ke dua baris.
 *
 * Nama "Prof. Dr. Ir. Raden Mas Soetomo Wirjodiprodjo, M.Sc." tetap harus utuh di
 * badge: dipotong berarti salah nama, dan salah nama di badge adalah keluhan
 * pertama yang sampai ke panitia. Urutannya:
 *
 * 1. Satu baris, mengecil sampai 50% ukuran semula.
 * 2. Masih tidak muat: dua baris, mulai 55% lalu turun sampai 35%. Dua baris di
 *    55% kira-kira setinggi satu baris semula, jadi isi di bawahnya tidak tertimpa.
 */
function TeksPas({ element, teks }: { element: BadgeTextElement; teks: string }) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [pas, setPas] = useState({ skala: 1, bungkus: false });
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const coba = (skala: number, bungkus: boolean) => {
			el.style.fontSize = `${element.size * skala}pt`;
			el.style.whiteSpace = bungkus ? "normal" : "nowrap";
			const lebarCukup = el.scrollWidth <= el.clientWidth + 0.5;
			if (!bungkus) return lebarCukup;
			const duaBaris = element.size * skala * 1.2 * 2 * (96 / 72);
			return lebarCukup && el.scrollHeight <= duaBaris + 1;
		};
		let hasil = { skala: 1, bungkus: false };
		if (!coba(1, false)) {
			el.style.whiteSpace = "nowrap";
			el.style.fontSize = `${element.size}pt`;
			const rasio = Math.floor((el.clientWidth / Math.max(1, el.scrollWidth)) * 100) / 100;
			if (rasio >= 0.5 && coba(rasio, false)) hasil = { skala: rasio, bungkus: false };
			else {
				hasil = { skala: 0.35, bungkus: true };
				for (let skala = 0.55; skala >= 0.35; skala -= 0.05) {
					if (coba(skala, true)) { hasil = { skala, bungkus: true }; break; }
				}
			}
		}
		el.style.fontSize = `${element.size * hasil.skala}pt`;
		el.style.whiteSpace = hasil.bungkus ? "normal" : "nowrap";
		setPas(hasil);
	}, [teks, element.size, element.w, element.weight, element.uppercase]);
	return (
		<div
			ref={ref}
			style={{
				position: "absolute",
				left: `${element.x}mm`,
				top: `${element.y}mm`,
				width: `${element.w}mm`,
				fontSize: `${element.size * pas.skala}pt`,
				lineHeight: 1.2,
				fontWeight: element.weight === "bold" ? 700 : 400,
				textAlign: element.align,
				color: element.color,
				whiteSpace: pas.bungkus ? "normal" : "nowrap",
				overflowWrap: "anywhere",
				letterSpacing: element.uppercase ? "0.08em" : undefined,
			}}
		>
			{teks}
		</div>
	);
}

/**
 * Rundown dengan tangga ukuran: mulai dari ukuran pilihan admin, turun 0,5 pt
 * sampai 8 pt. Bila 8 pt pun tidak muat, hanya baris yang muat utuh yang
 * digambar, ditutup "+N acara lagi". Memotong baris di tengah membuat tamu
 * mengira acaranya selesai di situ. Statusnya dikabarkan ke penyunting (garis
 * kuning dan kalimat di panel) dan ke halaman cetak (peringatan di bilah alat).
 *
 * Pengukuran dua tahap: render pertama untuk masukan baru selalu memuat semua
 * baris, efek mengukurnya, lalu menyimpan ukuran dan jumlah baris untuk kunci
 * itu. Render berikutnya dengan kunci sama memakai hasilnya.
 */
function RundownBlok({
	element, hari, hariIni, onStatus, cetak,
}: { element: BadgeRundownElement; hari: BadgeRundownHari[]; hariIni: string; onStatus?: (status: StatusRundown) => void; cetak?: boolean }) {
	const baris = useMemo(() => barisRundown(hari, element.day, element.merge_parallel, hariIni), [hari, element.day, element.merge_parallel, hariIni]);
	const judul = judulRundown(hari, element.day, hariIni);
	const ref = useRef<HTMLDivElement | null>(null);
	const kunci = `${element.size}|${element.w}|${element.h}|${baris.length}|${baris.map((b) => b.judul).join("|")}`;
	const [ukur, setUkur] = useState<{ kunci: string; ukuran: number; tampil: number | null }>({ kunci: "", ukuran: element.size, tampil: null });
	const terukur = ukur.kunci === kunci;
	const ukuran = terukur ? ukur.ukuran : element.size;
	const tampil = terukur ? ukur.tampil : null;

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el || terukur) return;
		let pt = element.size;
		el.style.fontSize = `${pt}pt`;
		const luber = () => el.scrollHeight > el.clientHeight + 0.5;
		while (luber() && pt > 8) {
			pt = Math.max(8, pt - 0.5);
			el.style.fontSize = `${pt}pt`;
		}
		let batas: number | null = null;
		if (luber()) {
			// Sisakan satu baris untuk "+N acara lagi".
			const sisa = el.clientHeight - pt * 1.3 * (96 / 72) - 4;
			const semua = Array.from(el.querySelectorAll<HTMLElement>("[data-baris]"));
			batas = semua.filter((b) => b.offsetTop + b.offsetHeight <= sisa).length;
		}
		setUkur({ kunci, ukuran: pt, tampil: batas });
		onStatus?.({ muat: batas === null, ukuran: pt });
		// `kunci` merangkum semua masukan yang mengubah tinggi isi.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [kunci, terukur]);

	// Di lembar cetak, rundown yang belum terbit tidak menggambar apa pun: kalimat
	// "belum diterbitkan" di punggung 300 badge tidak berguna bagi tamu.
	if (cetak && baris.length === 0) return null;

	const terlihat = tampil === null ? baris : baris.slice(0, tampil);
	const lagi = baris.length - terlihat.length;

	return (
		<div
			ref={ref}
			style={{
				position: "absolute",
				left: `${element.x}mm`,
				top: `${element.y}mm`,
				width: `${element.w}mm`,
				height: `${element.h}mm`,
				overflow: "hidden",
				fontSize: `${ukuran}pt`,
				lineHeight: 1.3,
				color: element.color,
			}}
		>
			{judul ? <div style={{ fontWeight: 700, marginBottom: "0.4em" }}>{judul}</div> : null}
			{baris.length === 0 ? (
				<div style={{ opacity: 0.6 }}>Rundown belum diterbitkan.</div>
			) : (
				terlihat.map((b, i) => (
					<div key={i} data-baris style={{ display: "flex", gap: "0.7em", padding: "0.18em 0", borderTop: i === 0 ? undefined : "0.2mm solid rgba(0,0,0,0.12)" }}>
						<span style={{ width: "3.1em", flexShrink: 0, fontWeight: 700, color: element.accent, fontVariantNumeric: "tabular-nums" }}>{b.jam}</span>
						<span style={{ minWidth: 0, flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
							{b.hari ? <span style={{ fontWeight: 700 }}>{b.hari} · </span> : null}
							{b.judul}
						</span>
					</div>
				))
			)}
			{lagi > 0 ? (
				<div style={{ paddingTop: "0.18em", borderTop: "0.2mm solid rgba(0,0,0,0.12)", fontWeight: 700, color: element.accent }}>
					+{lagi} acara lagi
				</div>
			) : null}
		</div>
	);
}

function Elemen({
	element, data, event, hari, hariIni, onRundown, cetak,
}: {
	element: BadgeElement;
	data: BadgeData;
	event: BadgeEventData;
	hari: BadgeRundownHari[];
	hariIni: string;
	onRundown?: (status: StatusRundown) => void;
	cetak?: boolean;
}) {
	switch (element.type) {
		case "text":
			return <TeksPas element={element} teks={badgeText(element, data, event)} />;
		case "qr":
			return <QrPelat element={element} teks={element.field === "rundown_url" ? event.rundown_url : data.qr_code} />;
		case "rect":
			return (
				<div
					style={{
						position: "absolute", left: `${element.x}mm`, top: `${element.y}mm`, width: `${element.w}mm`, height: `${element.h}mm`,
						background: element.color, borderRadius: `${element.radius}mm`,
					}}
				/>
			);
		case "image":
			return element.url ? (
				// eslint-disable-next-line @next/next/no-img-element -- dicetak apa adanya, bukan dioptimalkan
				<img
					src={element.url}
					alt=""
					style={{ position: "absolute", left: `${element.x}mm`, top: `${element.y}mm`, width: `${element.w}mm`, height: `${element.h}mm`, objectFit: "contain" }}
				/>
			) : (
				<div
					style={{
						position: "absolute", left: `${element.x}mm`, top: `${element.y}mm`, width: `${element.w}mm`, height: `${element.h}mm`,
						border: "0.3mm dashed #9a9a9a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "7pt", color: "#7a7a7a",
					}}
				>
					Gambar
				</div>
			);
		case "rundown":
			return <RundownBlok element={element} hari={hari} hariIni={hariIni} onStatus={onRundown} cetak={cetak} />;
	}
}

/** Latar satu sisi: warna polos, KV halaman acara (depan saja), atau desain unggahan. */
function latar(layout: BadgeLayout, side: BadgeSide, kvUrl: string | null): CSSProperties {
	const { background } = layout;
	const url =
		background.mode === "unggah" ? (side === "front" ? background.front_url : background.back_url)
			: background.mode === "kv" && side === "front" ? kvUrl
				: null;
	return {
		backgroundColor: background.color,
		backgroundImage: url ? `url("${url}")` : undefined,
		backgroundSize: "cover",
		backgroundPosition: background.mode === "kv" ? "top center" : "center",
	};
}

export function BadgeSisi({
	layout, side, data, event, hari, hariIni, onRundown, cetak, className, style,
}: {
	layout: BadgeLayout;
	side: BadgeSide;
	data: BadgeData;
	event: BadgeEventData;
	hari: BadgeRundownHari[];
	/** "YYYY-MM-DD" hari pencetakan, untuk rundown "Hari ini". */
	hariIni: string;
	onRundown?: (status: StatusRundown) => void;
	/** Lembar cetak sungguhan: rundown kosong tidak digambar sama sekali. */
	cetak?: boolean;
	className?: string;
	style?: CSSProperties;
}) {
	const sisi = ukuranSisi(layout.format);
	const elements = side === "front" ? layout.front : layout.back;
	return (
		<div
			className={className}
			style={{
				position: "relative",
				width: `${sisi.w}mm`,
				height: `${sisi.h}mm`,
				overflow: "hidden",
				fontFamily: "var(--font-sans), Inter, Arial, sans-serif",
				// Warna latar dan gambar wajib ikut tercetak; tanpa ini Chrome dan
				// Safari membuangnya demi hemat tinta dan badge keluar putih polos.
				printColorAdjust: "exact",
				WebkitPrintColorAdjust: "exact",
				...latar(layout, side, event.kv_url),
				...style,
			}}
		>
			{elements.map((element, index) => (
				<Elemen key={index} element={element} data={data} event={event} hari={hari} hariIni={hariIni} onRundown={onRundown} cetak={cetak} />
			))}
		</div>
	);
}
