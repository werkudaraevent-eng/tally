"use client";

import { Printer, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import type { StatusRundown } from "@/components/badge/badge-sisi";
import { LembarBadge, LembarKalibrasi, hariIniLokal } from "@/components/badge/lembar-badge";
import { Banner, Button, SelectField } from "@/components/m3";
import { eventApiPath } from "@/lib/event-url";
import {
	BADGE_PREVIEW_DATA,
	KERTAS,
	kertasCocok,
	punyaBelakang,
	susunLembar,
	type BadgeData,
	type BadgeEventData,
	type BadgeLayout,
} from "@/lib/badge/layout";
import { KUNCI_DRAF, bacaPrinter, bacaPrinterAktif, simpanPrinterAktif, type ProfilPrinter } from "@/lib/badge/printer";
import type { BadgeRundownHari } from "@/lib/badge/rundown";

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
	const kertasPrinter = profil?.kertas ?? "A4";
	const lembar = muatan ? susunLembar(muatan.layout.format, kertasPrinter) : null;
	const [rundownLuber, setRundownLuber] = useState(false);
	const catatRundown = useCallback((status: StatusRundown) => { if (!status.muat) setRundownLuber(true); }, []);
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
	// Rundown yang belum terbit TIDAK diganti contoh: jam karangan di punggung
	// 300 badge lebih buruk daripada punggung kosong.
	const hari = muatan?.rundown ?? [];
	const pakaiRundown = Boolean(muatan && punyaBelakang(muatan.layout.format) && [...muatan.layout.back, ...muatan.layout.front].some((e) => e.type === "rundown"));
	const peringatan: string[] = [];
	if (param.mode !== "kalibrasi" && muatan && lembar) {
		if (pakaiRundown && hari.length === 0) peringatan.push("Rundown acara belum diterbitkan, jadi kotak rundown di belakang badge kosong. Terbitkan dulu di menu Rundown acara bila ingin ikut tercetak.");
		if (rundownLuber) peringatan.push("Rundown tidak muat walau sudah 8 pt. Badge mencetak baris yang muat lalu \"+N acara lagi\". Perbesar kotaknya atau pilih satu hari di penyunting.");
		if (profil && !kertasCocok(lembar, profil.kertas)) peringatan.push(`Format ini dicetak di kertas ${lembar.namaKertas}, sedangkan ${profil.nama || "printer ini"} berisi ${profil.kertas}. Ganti kertasnya atau pilih format lain.`);
	}

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
			{peringatan.map((teks) => (
				<div key={teks} className="cetak-alat px-4 pt-4"><Banner tone="warning" icon={<Warning size={18} />}>{teks}</Banner></div>
			))}
			{lembar?.tidakMuat && param.mode !== "kalibrasi" ? (
				<div className="cetak-alat p-4"><Banner tone="warning" icon={<Warning size={18} />}>{lembar.tidakMuat}</Banner></div>
			) : null}

			<div className="cetak-tumpuk flex flex-col items-center gap-6 bg-surface-container-highest p-6">
				{param.mode === "kalibrasi" ? (
					<LembarKalibrasi kertas={kertas} nama={namaKertas} />
				) : siap && muatan && lembar && event ? (
					halaman.map((isi, i) => (
						<LembarBadge
							key={i}
							className="cetak-lembar relative overflow-hidden bg-white shadow-level2"
							layout={muatan.layout}
							lembar={lembar}
							isi={isi}
							event={event}
							hari={hari}
							hariIni={hariIniLokal()}
							geser={geser}
							onRundown={catatRundown}
						/>
					))
				) : !error ? (
					<p className="cetak-alat py-20 text-body-medium text-on-surface-variant">Menyiapkan badge…</p>
				) : null}
			</div>
		</>
	);
}
