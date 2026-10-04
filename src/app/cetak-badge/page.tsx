"use client";

import { Printer, Warning } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { BadgeSisi } from "@/components/badge/badge-sisi";
import { Banner, Button, SelectField } from "@/components/m3";
import { eventApiPath } from "@/lib/event-url";
import {
	BADGE_PREVIEW_DATA,
	KERTAS,
	susunLembar,
	type BadgeData,
	type BadgeEventData,
	type BadgeLayout,
	type Garis,
	type Lembar,
} from "@/lib/badge/layout";
import { KUNCI_DRAF, bacaPrinter, bacaPrinterAktif, simpanPrinterAktif, type ProfilPrinter } from "@/lib/badge/printer";
import { RUNDOWN_CONTOH, type BadgeRundownHari } from "@/lib/badge/rundown";

/**
 * Halaman cetak badge kertas: `/e/<slug>/cetak-badge?mode=...`.
 *
 * Di luar AdminShell dengan sengaja. Dialog cetak mencetak SELURUH dokumen, dan
 * bilah samping admin yang ikut tercetak di lembar pertama adalah cara paling
 * cepat membuang satu rim kertas. Bilah alat di atas disembunyikan `@media print`.
 *
 * Mode:
 * - `contoh`: satu lembar dengan peserta contoh (atau `id` bila ada).
 * - `semua`: seluruh peserta aktif urut nama. Untuk cetak massal sebelum hari-H,
 *   langsung ke printer atau "Simpan sebagai PDF" di dialog cetak.
 * - `id`: satu peserta, untuk walk-in dan cetak ulang.
 * - `kalibrasi`: halaman ukur 100 mm dan tanda sudut, tanpa koreksi geser.
 *
 * `cetak=1` membuka dialog cetak begitu semua gambar termuat. Bersama Chrome
 * `--kiosk-printing` badge keluar langsung ke printer bawaan laptop meja.
 */

type Mode = "contoh" | "semua" | "id" | "kalibrasi";

type Muatan = {
	layout: BadgeLayout;
	event: { name: string; slug: string; kv_url: string | null };
	rundown: BadgeRundownHari[];
};

function hariIniLokal() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bacaParam() {
	const p = new URLSearchParams(window.location.search);
	const mode = p.get("mode");
	return {
		mode: (mode === "semua" || mode === "id" || mode === "kalibrasi" ? mode : "contoh") as Mode,
		id: p.get("id"),
		cetak: p.get("cetak") === "1",
		kertas: p.get("kertas") === "A5" ? ("A5" as const) : ("A4" as const),
		draf: p.get("draf") === "1",
	};
}

export default function CetakBadgePage() {
	const [param, setParam] = useState<ReturnType<typeof bacaParam> | null>(null);
	const [muatan, setMuatan] = useState<Muatan | null>(null);
	const [peserta, setPeserta] = useState<BadgeData[] | null>(null);
	const [printer, setPrinter] = useState<ProfilPrinter[]>([]);
	const [aktif, setAktif] = useState<string | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		const timer = window.setTimeout(() => {
			const p = bacaParam();
			setParam(p);
			const daftar = bacaPrinter();
			setPrinter(daftar);
			const tersimpan = bacaPrinterAktif();
			setAktif(daftar.some((x) => x.id === tersimpan) ? tersimpan : daftar[0]?.id ?? null);
		}, 0);
		return () => window.clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (!param || param.mode === "kalibrasi") return;
		let batal = false;
		void (async () => {
			const r = await fetch(eventApiPath("/api/admin/badge"), { cache: "no-store" }).catch(() => null);
			if (!r?.ok) { if (!batal) setError(r?.status === 401 || r?.status === 403 ? "Masuk sebagai admin acara ini untuk mencetak badge." : "Susunan badge gagal dimuat. Muat ulang halaman."); return; }
			const body = (await r.json()) as Muatan;
			if (batal) return;
			// Cetak contoh dari penyunting: susunan yang sedang dilihat, belum
			// tentu sudah disimpan. Hanya untuk acara yang sama.
			if (param.draf) {
				try {
					const draf = JSON.parse(window.localStorage.getItem(KUNCI_DRAF) ?? "null") as { slug?: string; layout?: BadgeLayout } | null;
					if (draf?.slug === body.event.slug && draf.layout) body.layout = draf.layout;
				} catch {
					// Draf rusak: cetak susunan tersimpan.
				}
			}
			setMuatan(body);
			if (param.mode === "contoh" && !param.id) { setPeserta([BADGE_PREVIEW_DATA]); return; }
			const q = param.id ? `?id=${encodeURIComponent(param.id)}` : "";
			const rp = await fetch(eventApiPath(`/api/admin/badge/peserta${q}`), { cache: "no-store" }).catch(() => null);
			if (!rp?.ok) { if (!batal) setError(rp?.status === 404 ? "Peserta tidak ditemukan." : "Data peserta gagal dimuat. Muat ulang halaman."); return; }
			const data = (await rp.json()) as { peserta: BadgeData[] };
			if (!batal) setPeserta(data.peserta);
		})();
		return () => { batal = true; };
	}, [param]);

	const profil = printer.find((p) => p.id === aktif) ?? null;
	const lembar = useMemo(() => (muatan ? susunLembar(muatan.layout.format) : null), [muatan]);
	const siap = param?.mode === "kalibrasi" || Boolean(muatan && peserta && lembar);

	// Dialog cetak dibuka setelah huruf dan gambar latar selesai dimuat; terlalu
	// cepat dan lembar pertama tercetak tanpa KV.
	useEffect(() => {
		if (!param?.cetak || !siap) return;
		let batal = false;
		void (async () => {
			await document.fonts.ready;
			await Promise.all(Array.from(document.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
			await new Promise((r) => window.setTimeout(r, 300));
			if (!batal) window.print();
		})();
		return () => { batal = true; };
	}, [param, siap]);

	if (!param) return null;

	const kertasKalibrasi = param.mode === "kalibrasi"
		? (param.kertas === "A5" ? { w: KERTAS.A5.h, h: KERTAS.A5.w } : KERTAS.A4)
		: null;
	const kertas = kertasKalibrasi ?? lembar?.kertas ?? KERTAS.A4;
	const geser = param.mode === "kalibrasi" || !profil ? { x: 0, y: 0 } : { x: profil.geser_x, y: profil.geser_y };

	const event: BadgeEventData | null = muatan
		? { name: muatan.event.name, kv_url: muatan.event.kv_url, rundown_url: `${window.location.origin}/e/${muatan.event.slug}/rundown` }
		: null;
	const hari = muatan && muatan.rundown.length > 0 ? muatan.rundown : RUNDOWN_CONTOH;

	// Peserta dikelompokkan per lembar: A4 isi dua memuat dua badge.
	const perLembar = lembar?.badgePerLembar ?? 1;
	const halaman: BadgeData[][] = [];
	for (let i = 0; peserta && i < peserta.length; i += perLembar) halaman.push(peserta.slice(i, i + perLembar));

	const namaKertas = param.mode === "kalibrasi" ? (param.kertas === "A5" ? "A5 mendatar" : "A4 tegak") : lembar?.namaKertas ?? "";

	return (
		<>
			<style>{`
				@page { size: ${kertas.w}mm ${kertas.h}mm; margin: 0; }
				@media print {
					html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
					.cetak-alat { display: none !important; }
					.cetak-tumpuk { padding: 0 !important; gap: 0 !important; background: none !important; }
					.cetak-lembar { box-shadow: none !important; break-after: page; }
					.cetak-lembar:last-child { break-after: auto; }
				}
			`}</style>

			<div className="cetak-alat sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-outline-variant bg-surface px-4 py-3 text-body-medium text-on-surface">
				<div className="min-w-60 flex-1">
					<p className="font-semibold">
						{param.mode === "kalibrasi" ? "Halaman kalibrasi" : param.mode === "semua" ? `Badge semua peserta${peserta ? `, ${peserta.length} orang` : ""}` : "Badge"}
						{namaKertas ? <span className="font-normal text-on-surface-variant"> · kertas {namaKertas}</span> : null}
					</p>
					<p className="text-on-surface-variant">
						Di dialog cetak pilih printernya, ukuran kertas {namaKertas || "A4"}, skala 100% atau Ukuran sebenarnya, dan margin Tidak ada.
						Untuk PDF, pilih Tujuan: Simpan sebagai PDF.
					</p>
				</div>
				{param.mode !== "kalibrasi" && printer.length > 0 ? (
					<div className="w-60">
						<SelectField
							label="Koreksi printer"
							value={aktif ?? ""}
							onChange={(e) => { const id = e.target.value || null; setAktif(id); simpanPrinterAktif(id); }}
						>
							<option value="">Tanpa koreksi</option>
							{printer.map((p) => <option key={p.id} value={p.id}>{p.nama || p.model || "Printer"}</option>)}
						</SelectField>
					</div>
				) : null}
				<Button size="sm" icon={<Printer size={16} />} disabled={!siap} onClick={() => window.print()}>Cetak</Button>
			</div>

			{error ? <div className="cetak-alat p-4"><Banner tone="error" icon={<Warning size={18} />}>{error}</Banner></div> : null}
			{lembar?.tidakMuat && param.mode !== "kalibrasi" ? (
				<div className="cetak-alat p-4"><Banner tone="warning" icon={<Warning size={18} />}>{lembar.tidakMuat}</Banner></div>
			) : null}

			<div className="cetak-tumpuk flex flex-col items-center gap-6 bg-surface-container-highest p-6">
				{param.mode === "kalibrasi" ? (
					<LembarKalibrasi kertas={kertas} nama={namaKertas} />
				) : siap && muatan && lembar && event ? (
					halaman.map((isi, i) => (
						<div key={i} className="cetak-lembar relative overflow-hidden bg-white shadow-level2" style={{ width: `${kertas.w}mm`, height: `${kertas.h}mm` }}>
							<div style={{ position: "absolute", inset: 0, transform: `translate(${geser.x}mm, ${geser.y}mm)` }}>
								{lembar.panels.map((panel, p) => {
									const data = isi[panel.slot];
									if (!data) return null;
									return (
										<BadgeSisi
											key={p}
											layout={muatan.layout}
											side={panel.side}
											data={data}
											event={event}
											hari={hari}
											hariIni={hariIniLokal()}
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
					))
				) : !error ? (
					<p className="cetak-alat py-20 text-body-medium text-on-surface-variant">Menyiapkan badge…</p>
				) : null}
			</div>
		</>
	);
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
function TandaLembar({ lembar }: { lembar: Lembar }) {
	const { kertas } = lembar;
	const takik = (g: Garis, i: number) => {
		const tegak = Math.abs(g.x1 - g.x2) < 0.01;
		const ruas: Garis[] = tegak
			? [{ x1: g.x1, y1: g.y1 + 4, x2: g.x1, y2: g.y1 + 8 }, { x1: g.x1, y1: g.y2 - 8, x2: g.x1, y2: g.y2 - 4 }]
			: [{ x1: g.x1 + 4, y1: g.y1, x2: g.x1 + 8, y2: g.y1 }, { x1: g.x2 - 8, y1: g.y1, x2: g.x2 - 4, y2: g.y1 }];
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
function LembarKalibrasi({ kertas, nama }: { kertas: { w: number; h: number }; nama: string }) {
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
