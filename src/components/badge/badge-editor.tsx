"use client";

import {
	ArrowCounterClockwise, CaretDown, Check, DownloadSimple, Info, MagnifyingGlassPlus, Plus, Printer, Trash, Warning,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BadgeSisi, MODUL_MIN_MM, PX_PER_MM, matriksQr, type StatusRundown } from "@/components/badge/badge-sisi";
import { PrinterDialog } from "@/components/badge/printer-dialog";
import { Kelompok } from "@/components/admin/compact-form";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import {
	Banner, Button, EmptyState, IconButton, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader, Popover, POPOVER_ITEM,
	SegmentedButton, SelectField, SupportingPane, Switch, TextField, WorkspaceHeader, WorkspacePage, usePopoverAnchor,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import {
	BADGE_PREVIEW_DATA, BADGE_TEXT_LABELS, DEFAULT_BADGE_LAYOUT, MAX_ELEMEN_PER_SISI, UKURAN_KHUSUS,
	areaAman, elemenBaru, kertasCocok, jepitKeSisi, kotakElemen, punyaBelakang, susunLembar, ukuranSisi,
	type BadgeData, type BadgeElement, type BadgeEventData, type BadgeFold, type BadgeFormat, type BadgeFormatKind,
	type BadgeLayout, type BadgeSide, type BadgeTextField, type Mm,
} from "@/lib/badge/layout";
import { KUNCI_DRAF, bacaPrinter, bacaPrinterAktif, simpanPrinter, simpanPrinterAktif, type ProfilPrinter } from "@/lib/badge/printer";
import { RUNDOWN_CONTOH, type BadgeRundownHari } from "@/lib/badge/rundown";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";

/**
 * Penyunting badge kertas: dua sisi, dilipat, dicetak di printer kantor.
 *
 * Bentuknya sengaja sama dengan penyunting label stiker di tab sebelahnya:
 * badgenya sendiri di panel utama dan bisa digeser langsung, setelannya di
 * panel kanan (Isi terpilih, Kertas, Cetak), satu Simpan di kaki panel.
 * Orang yang sudah memakai satu tidak perlu belajar yang lain.
 *
 * Satuannya milimeter, pratinjaunya komponen yang sama dengan halaman cetak
 * (`BadgeSisi`). Lihat `src/lib/badge/layout.ts`.
 */

type Bagian = "isi" | "kertas" | "cetak";
type Zoom = "pas" | "100" | "200";
/**
 * Halaman dikunci setinggi jendela juga di laptop pendek (1280 × 588).
 *
 * WorkspacePage melepas kuncinya di layar pendek supaya tabel tidak terperas.
 * Penyunting ini kebalikannya: yang harus selalu terlihat adalah badge DAN
 * tombol Simpan, dan panel kanan sudah bergulir sendiri. Tanpa kunci, Simpan
 * jatuh di bawah lipatan layar.
 */
const KUNCI_TINGGI = "lg:short:h-[calc(100dvh-var(--workspace-top,58px))]! lg:short:overflow-hidden!";

const NAMA_ZOOM: Record<Zoom, string> = { pas: "Fit", "100": "100%", "200": "200%" };

type Muatan = {
	layout: BadgeLayout;
	migrasi: boolean;
	event: { name: string; slug: string; kv_url: string | null };
	rundown: BadgeRundownHari[];
};

const jepit = (nilai: number, min: number, maks: number) => Math.min(maks, Math.max(min, nilai));
const bulat = (nilai: number) => Math.round(nilai * 2) / 2;

const FORMAT: Array<{ kind: BadgeFormatKind; judul: string; keterangan: string }> = [
	{ kind: "a4_lipat4", judul: "A4 folded in four to A6", keterangan: "80–100 g office paper. Works on any office printer." },
	{ kind: "a5_lipat2", judul: "A5 folded in two to A6", keterangan: "Thick paper, one fold only, so it stays neat." },
	{ kind: "a4_isi2", judul: "Two per A4, cut, fold in two to A6", keterangan: "Thick paper sold as A4. One cut line, saves half a sheet." },
	{ kind: "a4_lipat2", judul: "A4 folded in two to A5", keterangan: "Large badge. Needs an A5 holder." },
	{ kind: "tunggal", judul: "One side, no fold", keterangan: "Several per sheet with cut marks. No agenda on the back." },
	{ kind: "khusus", judul: "Custom size", keterangan: "Type the finished badge width and height, then pick the fold." },
];

const NAMA_FORMAT: Record<BadgeFormatKind, string> = {
	a4_lipat4: "A4 folded in four to A6",
	a5_lipat2: "A5 folded in two to A6",
	a4_isi2: "Two per A4 to A6",
	a4_lipat2: "A4 folded in two to A5",
	tunggal: "One side",
	khusus: "Custom size",
};

/** Gramatur yang dibutuhkan format kertas tebal. Di bawah ini lipatannya pecah dan badge melengkung di holder. */
const GSM_TEBAL = 160;

type Tambahan = { label: string; jenis: "text" | "qr" | "rect" | "image" | "rundown"; field: BadgeTextField | "qr_code" | "rundown_url" };

const MENU_TAMBAH: Tambahan[] = [
	{ label: "Participant name", jenis: "text", field: "name" },
	{ label: "Organisation", jenis: "text", field: "company" },
	{ label: "Job title", jenis: "text", field: "title" },
	{ label: "Participant code (text)", jenis: "text", field: "qr_code" },
	{ label: "Participant QR code", jenis: "qr", field: "qr_code" },
	{ label: "Agenda QR code", jenis: "qr", field: "rundown_url" },
	{ label: "Agenda", jenis: "rundown", field: "static" },
	{ label: "Event name", jenis: "text", field: "event_name" },
	{ label: "Free text", jenis: "text", field: "static" },
	{ label: "Colour band", jenis: "rect", field: "static" },
	{ label: "Image or logo", jenis: "image", field: "static" },
];

function namaElemen(element: BadgeElement): string {
	switch (element.type) {
		case "text": return BADGE_TEXT_LABELS[element.field];
		case "qr": return element.field === "rundown_url" ? "Agenda QR code" : "Participant QR code";
		case "rect": return "Colour band";
		case "image": return "Image";
		case "rundown": return "Agenda";
	}
}

/**
 * Isi disesuaikan saat ukuran sisi berubah: diskalakan sebanding, lalu dijepit.
 * Pindah dari A6 ke A5 tanpa ini meninggalkan badge kecil di pojok kiri atas.
 */
function skalakan(elements: BadgeElement[], dari: Mm, ke: Mm): BadgeElement[] {
	const sx = ke.w / dari.w;
	const sy = ke.h / dari.h;
	const s = Math.min(sx, sy);
	if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return elements;
	const hasil = elements.map((e): BadgeElement => {
		const x = bulat(e.x * sx);
		const y = bulat(e.y * sy);
		switch (e.type) {
			case "text": return { ...e, x, y, w: bulat(e.w * sx), size: Math.max(5, Math.round(e.size * s * 2) / 2) };
			case "qr": return { ...e, x, y, size: Math.max(14, bulat(e.size * s)) };
			case "rundown": return { ...e, x, y, w: Math.max(30, bulat(e.w * sx)), h: Math.max(20, bulat(e.h * sy)) };
			default: return { ...e, x, y, w: Math.max(1, bulat(e.w * sx)), h: Math.max(1, bulat(e.h * sy)) };
		}
	});
	return jepitKeSisi(hasil, ke);
}

function hariIniLokal() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type Meja = "badge" | "label" | "tidak";

export function BadgeEditor({ pilihJenis, hidden, meja, ubahMeja, labelUkuran }: {
	pilihJenis: ReactNode;
	hidden?: boolean;
	/** Null selama dimuat. */
	meja: Meja | null;
	ubahMeja: (meja: Meja) => void;
	/** Mis. "50 × 30 mm", untuk keterangan pilihan label stiker. */
	labelUkuran: string | null;
}) {
	const [muatan, setMuatan] = useState<Muatan | null>(null);
	const [layout, setLayout] = useState<BadgeLayout | null>(null);
	const [sisi, setSisi] = useState<BadgeSide>("front");
	const [terpilih, setTerpilih] = useState<number | null>(null);
	const [bagian, setBagian] = useState<Bagian>("isi");
	const [zoom, setZoom] = useState<Zoom>("pas");
	const [kotor, setKotor] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [contoh, setContoh] = useState<BadgeData[]>([BADGE_PREVIEW_DATA]);
	const [indeksContoh, setIndeksContoh] = useState(0);
	const [statusRundown, setStatusRundown] = useState<StatusRundown | null>(null);
	const [printer, setPrinter] = useState<ProfilPrinter[]>([]);
	const [printerAktif, setPrinterAktif] = useState<string | null>(null);
	const [dialogPrinter, setDialogPrinter] = useState<ProfilPrinter | "baru" | null>(null);
	const [panggung, setPanggung] = useState<HTMLDivElement | null>(null);
	const [ukuranPanggung, setUkuranPanggung] = useState({ w: 0, h: 0 });
	const [pemicuTambah, setPemicuTambah] = useState<HTMLButtonElement | null>(null);
	const menuTambah = usePopoverAnchor(pemicuTambah);
	// Button tidak meneruskan ref, jadi tombolnya diambil dari pembungkus.
	const pasangPemicu = useCallback((el: HTMLSpanElement | null) => setPemicuTambah(el?.querySelector("button") ?? null), []);
	const [pemicuZoom, setPemicuZoom] = useState<HTMLButtonElement | null>(null);
	const menuZoom = usePopoverAnchor(pemicuZoom);
	const pasangPemicuZoom = useCallback((el: HTMLSpanElement | null) => setPemicuZoom(el?.querySelector("button") ?? null), []);
	const toast = useToast();

	const load = useCallback(async () => {
		const response = await fetch(eventApiPath("/api/admin/badge"), { cache: "no-store" }).catch(() => null);
		if (!response?.ok) { setError("Badge settings could not be loaded. Reload the page."); return; }
		const body = (await response.json()) as Muatan;
		setMuatan(body);
		setLayout(body.layout);
		setKotor(false);
		setError("");
		// Peserta sungguhan untuk pratinjau: nama terpanjang di daftar adalah
		// yang membuktikan susunannya, bukan nama contoh yang pas.
		const peserta = await fetch(eventApiPath("/api/admin/badge/peserta?contoh=50"), { cache: "no-store" }).catch(() => null);
		if (peserta?.ok) {
			const data = (await peserta.json()) as { peserta: BadgeData[] };
			if (data.peserta.length > 0) setContoh(data.peserta);
		}
	}, []);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
			const daftar = bacaPrinter();
			setPrinter(daftar);
			const aktif = bacaPrinterAktif();
			setPrinterAktif(daftar.some((p) => p.id === aktif) ? aktif : daftar[0]?.id ?? null);
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	useEffect(() => {
		if (!panggung) return;
		const pengamat = new ResizeObserver(([masuk]) => setUkuranPanggung({ w: masuk.contentRect.width, h: masuk.contentRect.height }));
		pengamat.observe(panggung);
		return () => pengamat.disconnect();
	}, [panggung]);

	const format = layout?.format ?? DEFAULT_BADGE_LAYOUT.format;
	const ukuran = ukuranSisi(format);
	const profil = printer.find((p) => p.id === printerAktif) ?? null;
	const kertasPrinter = profil?.kertas ?? "A4";
	const lembar = susunLembar(format, kertasPrinter);
	const adaBelakang = punyaBelakang(format);
	const sisiAktif: BadgeSide = adaBelakang ? sisi : "front";
	const aman = areaAman(format, sisiAktif, kertasPrinter);

	// px layar per mm.
	const skala = zoom === "100" ? PX_PER_MM
		: zoom === "200" ? PX_PER_MM * 2
			: ukuranPanggung.w > 0 ? Math.max(0.5, Math.min((ukuranPanggung.w - 48) / ukuran.w, (ukuranPanggung.h - 48) / ukuran.h)) : 0;

	const event: BadgeEventData | null = muatan
		? { name: muatan.event.name, kv_url: muatan.event.kv_url, rundown_url: `${typeof window === "undefined" ? "" : window.location.origin}/e/${muatan.event.slug}/rundown` }
		: null;
	const hari = muatan && muatan.rundown.length > 0 ? muatan.rundown : RUNDOWN_CONTOH;
	const data = contoh[indeksContoh % contoh.length] ?? BADGE_PREVIEW_DATA;

	function ubahLayout(fn: (current: BadgeLayout) => BadgeLayout) {
		setLayout((current) => (current ? fn(current) : current));
		setKotor(true);
	}

	function ubahFormat(patch: Partial<BadgeFormat>) {
		ubahLayout((current) => {
			const berikut = { ...current.format, ...patch };
			const dari = ukuranSisi(current.format);
			const ke = ukuranSisi(berikut);
			return { ...current, format: berikut, front: skalakan(current.front, dari, ke), back: skalakan(current.back, dari, ke) };
		});
	}

	const elements = layout ? (sisiAktif === "front" ? layout.front : layout.back) : [];
	const aktif = terpilih != null ? elements[terpilih] : undefined;

	function ubahElemen(index: number, patch: Partial<BadgeElement>) {
		ubahLayout((current) => {
			const daftar = (sisiAktif === "front" ? current.front : current.back).map((e, i) => (i === index ? ({ ...e, ...patch } as BadgeElement) : e));
			return sisiAktif === "front" ? { ...current, front: daftar } : { ...current, back: daftar };
		});
	}

	function hapusElemen(index: number) {
		ubahLayout((current) => {
			const daftar = (sisiAktif === "front" ? current.front : current.back).filter((_, i) => i !== index);
			return sisiAktif === "front" ? { ...current, front: daftar } : { ...current, back: daftar };
		});
		setTerpilih(null);
	}

	function tambah(t: Tambahan) {
		menuTambah.tutup();
		if (!layout || elements.length >= MAX_ELEMEN_PER_SISI) return;
		const baru = elemenBaru(t.jenis, t.field, ukuran);
		ubahLayout((current) => (sisiAktif === "front" ? { ...current, front: [...current.front, baru] } : { ...current, back: [...current.back, baru] }));
		setTerpilih(elements.length);
		setBagian("isi");
	}

	function pilih(index: number) {
		setTerpilih(index);
		setBagian("isi");
	}

	function gantiSisi(berikut: BadgeSide) {
		setSisi(berikut);
		setTerpilih(null);
	}

	function pindah(index: number, x: number, y: number, tempel = true) {
		const element = elements[index];
		if (!element) return;
		const kotak = kotakElemen(element);
		let nx = bulat(x);
		// Menempel ke sumbu tengah saat menyeret, sama seperti penyunting label.
		const tengah = bulat((ukuran.w - kotak.w) / 2);
		if (tempel && Math.abs(nx - tengah) <= 2) nx = tengah;
		const berikut = { x: jepit(nx, 0, Math.max(0, ukuran.w - kotak.w)), y: jepit(bulat(y), 0, Math.max(0, ukuran.h - kotak.h)) };
		if (berikut.x === element.x && berikut.y === element.y) return;
		ubahElemen(index, berikut);
	}

	function mulaiGeser(e: React.PointerEvent<HTMLElement>, index: number) {
		if (skala === 0) return;
		pilih(index);
		const element = elements[index];
		const awal = { x: e.clientX, y: e.clientY, ex: element.x, ey: element.y };
		e.currentTarget.setPointerCapture(e.pointerId);
		const geser = (p: PointerEvent) => pindah(index, awal.ex + (p.clientX - awal.x) / skala, awal.ey + (p.clientY - awal.y) / skala);
		const selesai = () => { window.removeEventListener("pointermove", geser); window.removeEventListener("pointerup", selesai); };
		window.addEventListener("pointermove", geser);
		window.addEventListener("pointerup", selesai);
	}

	function mulaiUbahUkuran(e: React.PointerEvent<HTMLElement>, index: number) {
		if (skala === 0) return;
		e.stopPropagation();
		const element = elements[index];
		const kotak = kotakElemen(element);
		const awal = { x: e.clientX, y: e.clientY, w: kotak.w, h: kotak.h };
		e.currentTarget.setPointerCapture(e.pointerId);
		const geser = (p: PointerEvent) => {
			const w = bulat(awal.w + (p.clientX - awal.x) / skala);
			const h = bulat(awal.h + (p.clientY - awal.y) / skala);
			const maksW = ukuran.w - element.x;
			const maksH = ukuran.h - element.y;
			if (element.type === "qr") ubahElemen(index, { size: jepit(Math.max(w, h), 14, Math.max(14, Math.min(maksW, maksH))) });
			else if (element.type === "text") ubahElemen(index, { w: jepit(w, 4, Math.max(4, maksW)) });
			else {
				const min = element.type === "rundown" ? { w: 30, h: 20 } : { w: 1, h: 1 };
				ubahElemen(index, { w: jepit(w, min.w, Math.max(min.w, maksW)), h: jepit(h, min.h, Math.max(min.h, maksH)) });
			}
		};
		const selesai = () => { window.removeEventListener("pointermove", geser); window.removeEventListener("pointerup", selesai); };
		window.addEventListener("pointermove", geser);
		window.addEventListener("pointerup", selesai);
	}

	function panah(e: React.KeyboardEvent, index: number) {
		const langkah = e.shiftKey ? 5 : 0.5;
		const arah: Record<string, [number, number]> = { ArrowLeft: [-langkah, 0], ArrowRight: [langkah, 0], ArrowUp: [0, -langkah], ArrowDown: [0, langkah] };
		const gerak = arah[e.key];
		if (gerak) {
			e.preventDefault();
			pindah(index, elements[index].x + gerak[0], elements[index].y + gerak[1], false);
		} else if (e.key === "Delete" || e.key === "Backspace") {
			e.preventDefault();
			hapusElemen(index);
		}
	}

	async function simpan() {
		if (!layout) return;
		setBusy(true);
		const response = await fetch(eventApiPath("/api/admin/badge"), {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(layout),
		}).catch(() => null);
		setBusy(false);
		if (!response) { toast.error("Connection failed", "The badge is not saved."); return; }
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			toast.error("Not saved", body?.error?.message ?? "Some content is outside the edges. Check the badge size.");
			return;
		}
		setLayout(body.layout as BadgeLayout);
		setMuatan((current) => (current ? { ...current, layout: body.layout, migrasi: true } : current));
		setKotor(false);
		toast.success("Saved", "The next prints use this layout.");
	}

	function bukaCetak(mode: "contoh" | "semua") {
		if (!layout || !muatan) return;
		if (mode === "semua" && kotor) {
			toast.error("Save first", "Printing all participants uses the saved layout. Save these changes, then print.");
			return;
		}
		let draf = "";
		if (mode === "contoh") {
			try {
				window.localStorage.setItem(KUNCI_DRAF, JSON.stringify({ slug: muatan.event.slug, layout }));
				draf = "&draf=1";
			} catch {
				// Tanpa penyimpanan, contoh dicetak dari susunan tersimpan.
			}
		}
		const pid = (data as BadgeData & { id?: string }).id;
		const id = mode === "contoh" && pid ? `&id=${encodeURIComponent(pid)}` : "";
		window.open(`/e/${encodeURIComponent(muatan.event.slug)}/cetak-badge?mode=${mode}&cetak=1${draf}${id}`, "_blank");
	}

	function simpanProfil(p: ProfilPrinter) {
		const berikut = printer.some((x) => x.id === p.id) ? printer.map((x) => (x.id === p.id ? p : x)) : [...printer, p];
		setPrinter(berikut);
		simpanPrinter(berikut);
		setPrinterAktif(p.id);
		simpanPrinterAktif(p.id);
		setDialogPrinter(null);
	}

	function hapusProfil(id: string) {
		const berikut = printer.filter((x) => x.id !== id);
		setPrinter(berikut);
		simpanPrinter(berikut);
		if (printerAktif === id) { setPrinterAktif(berikut[0]?.id ?? null); simpanPrinterAktif(berikut[0]?.id ?? null); }
		setDialogPrinter(null);
	}

	if (!layout || !muatan || !event) {
		return (
			<WorkspacePage fill className={hidden ? "hidden" : undefined}>
				<WorkspaceHeader actions={pilihJenis} />
				{error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : <PageLoading />}
			</WorkspacePage>
		);
	}

	const penuh = elements.length >= MAX_ELEMEN_PER_SISI;
	const tanpaQr = !layout.front.some((e) => e.type === "qr" && e.field === "qr_code");
	const adaRundown = elements.some((e) => e.type === "rundown");
	const rundownTidakMuat = adaRundown && statusRundown && !statusRundown.muat;
	const rundownBelumTerbit = muatan.rundown.length === 0 && adaBelakang && [...layout.front, ...layout.back].some((e) => e.type === "rundown");
	const kertasPas = !profil || kertasCocok(lembar, profil.kertas);

	// ---- Panel utama ---------------------------------------------------------
	const utama = (
		<Pane aria-label="Badge preview">
			<PaneHeader className="flex-wrap gap-2 px-4 py-3">
				<SegmentedButton<BadgeSide>
					label="Badge side"
					value={sisiAktif}
					onChange={gantiSisi}
					options={[{ value: "front", label: "Front" }, { value: "back", label: "Back", disabled: !adaBelakang }]}
				/>
				<span ref={pasangPemicu} className="inline-flex">
				<Button
					variant="outlined"
					size="sm"
					icon={<Plus size={16} />}
					trailingIcon={<CaretDown size={14} />}
					disabled={penuh}
					aria-haspopup="menu"
					aria-expanded={menuTambah.open}
					onClick={menuTambah.toggle}
				>
					Add content
				</Button>
				</span>
				{menuTambah.open ? (
					<Popover anchor={menuTambah} label="Add content" align="start" width={240}>
						<div className="p-1.5">
							{MENU_TAMBAH.filter((t) => !(t.jenis === "rundown" && elements.some((e) => e.type === "rundown"))).map((t) => (
								<button key={t.label} type="button" role="menuitem" className={POPOVER_ITEM} onClick={() => tambah(t)}>
									{t.label}
								</button>
							))}
						</div>
					</Popover>
				) : null}
				<div className="flex-1" />
				{/* Satu tombol menu, bukan tiga segmen: di 1280 px dengan bilah samping,
				    tiga segmen mematahkan bilah alat jadi dua baris. */}
				<span ref={pasangPemicuZoom} className="inline-flex">
					<Button
						variant="outlined"
						size="sm"
						icon={<MagnifyingGlassPlus size={16} />}
						trailingIcon={<CaretDown size={14} />}
						aria-haspopup="menu"
						aria-expanded={menuZoom.open}
						aria-label={`Zoom: ${NAMA_ZOOM[zoom]}`}
						onClick={menuZoom.toggle}
					>
						{NAMA_ZOOM[zoom]}
					</Button>
				</span>
				{menuZoom.open ? (
					<Popover anchor={menuZoom} label="Zoom" align="end" width={160}>
						<div className="p-1.5">
							{(Object.keys(NAMA_ZOOM) as Zoom[]).map((z) => (
								<button key={z} type="button" role="menuitemradio" aria-checked={zoom === z} className={POPOVER_ITEM} onClick={() => { setZoom(z); menuZoom.tutup(); }}>
									<span className="flex-1">{NAMA_ZOOM[z]}</span>
									{zoom === z ? <Check size={14} weight="bold" /> : null}
								</button>
							))}
						</div>
					</Popover>
				) : null}
			</PaneHeader>

			<PaneBody className="flex flex-col bg-surface-container-highest">
				{/* Tinggi minimum di bawah lg, saat halaman bergulir biasa: "Pas"
				    mengukur panggung ini, dan tanpa batas bawah panggung hanya setinggi
				    badge yang sedang diukur. Di lg halaman dikunci setinggi jendela. */}
				<div ref={setPanggung} className={cx("flex min-h-[360px] flex-1 p-6 lg:min-h-0", zoom === "pas" ? "items-center justify-center overflow-hidden" : "overflow-auto")}>
					{skala > 0 ? (
						<div className="relative m-auto shrink-0 shadow-level2" style={{ width: ukuran.w * skala, height: ukuran.h * skala }}>
							<div style={{ transform: `scale(${skala / PX_PER_MM})`, transformOrigin: "top left", width: `${ukuran.w}mm`, height: `${ukuran.h}mm` }}>
								<BadgeSisi
									layout={layout}
									side={sisiAktif}
									data={data}
									event={event}
									hari={hari}
									hariIni={hariIniLokal()}
									onRundown={setStatusRundown}
								/>
							</div>

							{/* Area aman: printer kantor tidak mencetak 3-5 mm terluar, dan lipatan tangan meleset 1-2 mm. */}
							<div
								aria-hidden
								className="pointer-events-none absolute border border-dashed border-primary/70"
								style={{ left: aman.left * skala, top: aman.top * skala, right: aman.right * skala, bottom: aman.bottom * skala }}
							/>

							{elements.map((element, index) => {
								const kotak = kotakElemen(element);
								const dipilih = terpilih === index;
								const nama = namaElemen(element);
								const kuning = element.type === "rundown" && rundownTidakMuat;
								return (
									<div key={index} className="absolute" style={{ left: kotak.x * skala, top: kotak.y * skala, width: kotak.w * skala, height: kotak.h * skala }}>
										<button
											type="button"
											aria-pressed={dipilih}
											aria-label={`${nama}, ${element.x} by ${element.y} mm from the top left. Arrow keys move it.`}
											onPointerDown={(e) => mulaiGeser(e, index)}
											onKeyDown={(e) => panah(e, index)}
											onFocus={() => pilih(index)}
											className={cx(
												"h-full w-full cursor-grab touch-none rounded-xs active:cursor-grabbing",
												kuning ? "outline outline-2 outline-offset-1 outline-warning"
													: dipilih ? "outline outline-2 outline-offset-2 outline-primary"
														: "outline outline-1 outline-offset-2 outline-transparent hover:outline-outline focus-visible:!outline-primary",
											)}
										/>
										{dipilih && element.type !== "text" ? (
											<span
												aria-hidden
												onPointerDown={(e) => mulaiUbahUkuran(e, index)}
												className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize touch-none rounded-full border-2 border-surface bg-primary"
											/>
										) : dipilih ? (
											<span
												aria-hidden
												onPointerDown={(e) => mulaiUbahUkuran(e, index)}
												className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 border-surface bg-primary"
											/>
										) : null}
									</div>
								);
							})}
						</div>
					) : null}
				</div>
			</PaneBody>

			{tanpaQr || penuh || rundownBelumTerbit || !kertasPas ? (
				<div className="flex shrink-0 flex-col gap-2 border-t border-outline-variant px-4 py-3 text-body-medium">
					{penuh ? <p className="text-on-surface-variant">This side already has {MAX_ELEMEN_PER_SISI} items. Delete one before adding more.</p> : null}
					{rundownBelumTerbit ? (
						<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-on-surface">
							<Warning size={16} className="mt-0.5 shrink-0 text-warning" />
							The agenda is not published yet. The preview uses a sample, but printed badges have an empty back until the agenda is published.
						</p>
					) : null}
					{!kertasPas ? (
						<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-on-surface">
							<Warning size={16} className="mt-0.5 shrink-0 text-warning" />
							This format prints on {lembar.namaKertas} paper, but {profil?.nama || "the active printer"} holds {kertasPrinter}.
						</p>
					) : null}
					{tanpaQr ? (
						<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-on-surface">
							<Warning size={16} className="mt-0.5 shrink-0 text-warning" />
							There is no participant QR code on the front. Without it the badge can&apos;t be scanned at check-in, booths or the lucky draw.
						</p>
					) : null}
				</div>
			) : null}

			<div className="flex shrink-0 flex-wrap items-center gap-x-1.5 border-t border-outline-variant px-4 py-2.5 text-body-medium text-on-surface-variant">
				<span>Sample: {data.name}</span>
				{contoh.length > 1 ? (
					<>
						<span aria-hidden>·</span>
						<button type="button" className="text-primary hover:underline" onClick={() => setIndeksContoh((i) => (i + 1) % contoh.length)}>
							Next sample participant
						</button>
					</>
				) : null}
				<span aria-hidden>·</span>
				<span>move items with the mouse, a finger or the arrow keys</span>
			</div>
		</Pane>
	);

	// ---- Isi terpilih ----------------------------------------------------------
	const isiTerpilih = aktif && terpilih != null ? (
		<div className="flex flex-col gap-5">
			<Kelompok first>
				<div className="flex items-start gap-3">
					<div className="min-w-0 flex-1">
						<h3 className="text-body-medium font-semibold text-on-surface">
							{namaElemen(aktif)} <span className="font-normal text-on-surface-variant">· {sisiAktif === "front" ? "front" : "back"}</span>
						</h3>
						<p className="text-body-medium tabular-nums text-on-surface-variant">{aktif.x} × {aktif.y} mm from the top left</p>
					</div>
					<IconButton size="sm" label="Remove from badge" onClick={() => hapusElemen(terpilih)}>
						<Trash size={16} className="text-error" />
					</IconButton>
				</div>
				<SetelanElemen
					element={aktif}
					ubah={(patch) => ubahElemen(terpilih, patch)}
					hari={muatan.rundown}
					statusRundown={statusRundown}
					sisi={ukuran}
					rundownUrl={event.rundown_url}
					qrPeserta={data.qr_code}
				/>
			</Kelompok>
		</div>
	) : (
		<div className="flex flex-col gap-5">
			<EmptyState
				plain
				className="px-4 py-10"
				title="No item selected"
				description="Click an item on the badge to set its size, colour and content. Add new items with the button above the badge."
			/>
			<Kelompok title="Layout">
				<p className="text-body-medium text-on-surface-variant">Replaces the front and back with the default layout, fitted to the current badge size. Takes effect once saved.</p>
				<div>
					<Button
						variant="outlined"
						size="sm"
						icon={<ArrowCounterClockwise size={16} />}
						onClick={() => {
							const dari = ukuranSisi(DEFAULT_BADGE_LAYOUT.format);
							ubahLayout((current) => ({
								...current,
								front: skalakan(DEFAULT_BADGE_LAYOUT.front, dari, ukuran),
								back: skalakan(DEFAULT_BADGE_LAYOUT.back, dari, ukuran),
							}));
							setTerpilih(null);
						}}
					>
						Restore default layout
					</Button>
				</div>
			</Kelompok>
		</div>
	);

	// ---- Kertas ----------------------------------------------------------------
	const gsmPrinter = profil?.gsm_maks ?? null;
	const isiKertas = (
		<div className="flex flex-col gap-5">
			<Kelompok title="Badge format" first>
				<div className="flex flex-col gap-2" role="radiogroup" aria-label="Badge format">
					{FORMAT.map((f) => {
						const dipakai = format.kind === f.kind;
						const tebal = f.kind === "a5_lipat2" || f.kind === "a4_isi2";
						return (
							<button
								key={f.kind}
								type="button"
								role="radio"
								aria-checked={dipakai}
								onClick={() => ubahFormat(f.kind === "khusus" && format.kind !== "khusus" ? { kind: f.kind, w_mm: ukuran.w, h_mm: ukuran.h, fold: "side" } : f.kind === "tunggal" && format.kind !== "tunggal" ? { kind: f.kind, w_mm: 105, h_mm: 148 } : { kind: f.kind })}
								className={cx(
									"flex items-start gap-3 rounded-md border px-3 py-2.5 text-left text-body-medium",
									dipakai ? "border-2 border-primary bg-secondary-container" : "border-outline-variant hover:bg-primary-soft",
								)}
							>
								<IkonFormat kind={f.kind} />
								<span className="min-w-0 flex-1">
									<span className="block font-semibold text-on-surface">{f.judul}</span>
									<span className="block text-on-surface-variant">
										{tebal
											? gsmPrinter != null
												? `Paper ${GSM_TEBAL} g or heavier. ${profil?.nama || "This printer"} handles up to ${gsmPrinter} g.`
												: `Thick paper, ${GSM_TEBAL} g or heavier, within your printer's limit.`
											: f.keterangan}
									</span>
									{tebal && (gsmPrinter == null || gsmPrinter < GSM_TEBAL) ? (
										<span className="mt-1 inline-block rounded-xs bg-warning-soft px-1.5 text-label-medium font-medium text-on-warning-soft">
											{gsmPrinter == null ? "Needs a thick-paper printer" : `This printer: max ${gsmPrinter} g`}
										</span>
									) : null}
								</span>
								{dipakai ? <Check size={18} weight="bold" className="mt-0.5 shrink-0 text-primary" /> : null}
							</button>
						);
					})}
				</div>

				{format.kind === "khusus" || format.kind === "tunggal" ? (
					<UkuranKhusus format={format} ubah={ubahFormat} />
				) : null}

				<p className="text-body-medium text-on-surface-variant">
					Prints on <span className="font-medium text-on-surface">{lembar.namaKertas}</span> paper
					{lembar.badgePerLembar > 1 ? `, ${lembar.badgePerLembar} badges per sheet` : ""}. Finished badge{" "}
					<span className="tabular-nums">{ukuran.w} × {ukuran.h} mm</span>.
					{lembar.potongan.length > 0 ? " Cut along the dashed lines." : ""}
				</p>
				{lembar.tidakMuat ? (
					<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
						<Warning size={16} className="mt-0.5 shrink-0 text-warning" />{lembar.tidakMuat}
					</p>
				) : null}
				{kertasCocok(lembar, "A4") ? (
					<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
						<Warning size={16} className="mt-0.5 shrink-0 text-warning" />
						Make sure the printer holds A4, not F4 or Folio. Longer paper shifts the fold lines.
					</p>
				) : null}
			</Kelompok>

			<Kelompok title="Background">
				<SegmentedButton<BadgeLayout["background"]["mode"]>
					label="Badge background"
					value={layout.background.mode}
					onChange={(mode) => ubahLayout((c) => ({ ...c, background: { ...c.background, mode } }))}
					options={[{ value: "polos", label: "Plain" }, { value: "kv", label: "Event KV" }, { value: "unggah", label: "Upload design" }]}
				/>
				{layout.background.mode === "kv" && !muatan.event.kv_url ? (
					<p className="text-body-medium text-on-surface-variant">The event page has no KV yet. Add it in Event page › Hero › Background image (KV); for Gathering events in Theme › Page › Link preview image. Or choose Upload design.</p>
				) : null}
				{layout.background.mode === "kv" && muatan.event.kv_url ? (
					<p className="text-body-medium text-on-surface-variant">The event page KV is used on the front, cropped to the badge from the top centre. The back uses the colour below.</p>
				) : null}
				<WarnaField
					label={layout.background.mode === "polos" ? "Background colour" : "Colour behind the image"}
					value={layout.background.color}
					onChange={(color) => ubahLayout((c) => ({ ...c, background: { ...c.background, color } }))}
				/>
				{layout.background.mode === "unggah" ? (
					<>
						<div className="grid grid-cols-2 gap-3">
							<ImageUploadField
								label="Front"
								kind="badge"
								value={layout.background.front_url}
								previewClassName="h-24 w-full"
								onChange={(url) => ubahLayout((c) => ({ ...c, background: { ...c.background, front_url: url } }))}
							/>
							{adaBelakang ? (
								<ImageUploadField
									label="Back"
									kind="badge"
									value={layout.background.back_url}
									previewClassName="h-24 w-full"
									onChange={(url) => ubahLayout((c) => ({ ...c, background: { ...c.background, back_url: url } }))}
								/>
							) : null}
						</div>
						<p className="text-body-medium text-on-surface-variant">
							Per side {ukuran.w + 6} × {ukuran.h + 6} mm including 3 mm bleed, ideally 300 dpi ({Math.round(((ukuran.w + 6) / 25.4) * 300)} × {Math.round(((ukuran.h + 6) / 25.4) * 300)} px).
							Save as JPG under 5 MB; a 300 dpi PNG often goes over that limit. Name, QR and agenda are added here, not in the design.
						</p>
						<PeringatanDpi url={layout.background.front_url} wMm={ukuran.w} hMm={ukuran.h} />
						{adaBelakang ? <PeringatanDpi url={layout.background.back_url} wMm={ukuran.w} hMm={ukuran.h} /> : null}
						{adaBelakang ? (
							<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
								<Info size={16} className="mt-0.5 shrink-0 text-warning" />
								Match the colours at the fold edge on the front and back. Hand folds drift 1–2 mm, and the other side&apos;s colour shows at the edge.
							</p>
						) : null}
					</>
				) : null}
			</Kelompok>
		</div>
	);

	// ---- Cetak -----------------------------------------------------------------
	const isiCetak = (
		<div className="flex flex-col gap-5">
			<Kelompok title="Printed at the check-in desk" first>
				<div role="radiogroup" aria-label="Printed at the check-in desk" className="flex flex-col gap-1">
					{([
						{ value: "badge", label: "Paper badge", sub: NAMA_FORMAT[format.kind] },
						{ value: "label", label: "Sticker label", sub: labelUkuran ? `NIIMBOT · ${labelUkuran}` : "NIIMBOT" },
						{ value: "tidak", label: "Nothing", sub: null },
					] as const).map((o) => (
						<label key={o.value} className="flex min-h-9 cursor-pointer items-center gap-3 text-body-medium text-on-surface">
							<input
								type="radio"
								name="meja-registrasi"
								value={o.value}
								checked={meja === o.value}
								disabled={meja === null || (o.value === "badge" && !muatan.migrasi)}
								onChange={() => ubahMeja(o.value)}
								className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
							/>
							<span className="font-medium">{o.label}</span>
							{o.sub ? <span className="text-on-surface-variant">{o.sub}</span> : null}
						</label>
					))}
				</div>
				<p className="text-body-medium text-on-surface-variant">
					Replaces the &ldquo;Use label printer&rdquo; switch and saves straight away.
					{meja === "badge" ? " A print badge button on the scan screen is coming; until then, print walk-ins with Print sample for the chosen participant." : ""}
					{!muatan.migrasi ? " Paper badge can be chosen once the database migration has run." : ""}
				</p>
			</Kelompok>

			<Kelompok title="Print">
				<div className="flex flex-wrap gap-2">
					<Button variant="outlined" size="sm" icon={<Printer size={16} />} onClick={() => bukaCetak("contoh")}>Print sample</Button>
					<Button variant="outlined" size="sm" icon={<DownloadSimple size={16} />} onClick={() => bukaCetak("semua")}>All participants</Button>
				</div>
				<p className="text-body-medium text-on-surface-variant">
					Print the main batch before event day with All participants, sorted by name, then lay them out alphabetically at the check-in desk.
					For a PDF, choose Save as PDF in the print dialog.
				</p>
			</Kelompok>

			<Kelompok title="Printer" note="Saved on this laptop for every event. Other laptops or phones keep their own printers.">
				{printer.length === 0 ? (
					<p className="text-body-medium text-on-surface-variant">No printers yet. Add one so its print position can be corrected after calibration.</p>
				) : (
					<div className="flex flex-col gap-2">
						{printer.map((p) => (
							<button
								key={p.id}
								type="button"
								onClick={() => setDialogPrinter(p)}
								className={cx(
									"flex flex-col gap-0.5 rounded-md border px-3 py-2.5 text-left text-body-medium hover:bg-primary-soft",
									p.id === printerAktif ? "border-primary" : "border-outline-variant",
								)}
							>
								<span className="flex items-center gap-2">
									<Printer size={16} className="shrink-0 text-on-surface-variant" />
									<span className="min-w-0 flex-1 truncate font-semibold text-on-surface">{p.nama || "Printer"}</span>
									<span className={cx("rounded-xs px-1.5 text-label-medium font-medium", p.dikalibrasi ? "bg-success-soft text-on-success-soft" : "bg-surface-container-high text-on-surface-variant")}>
										{p.dikalibrasi ? "Calibrated" : "Not calibrated"}
									</span>
								</span>
								<span className="text-on-surface-variant">
									{[p.model, p.jenis === "laser" ? "laser" : "inkjet", p.kertas, `max ${p.gsm_maks} g`].filter(Boolean).join(" · ")}
								</span>
							</button>
						))}
					</div>
				)}
				<div>
					<Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setDialogPrinter("baru")}>Add printer</Button>
				</div>
				<p className="text-body-medium text-on-surface-variant">
					The printer itself is chosen in the laptop&apos;s print dialog, because a web page can&apos;t see connected printers.
					On a desk laptop, Chrome can run in kiosk printing mode so badges go straight to the default printer without a dialog.
				</p>
			</Kelompok>

			<Kelompok title="Instant printing at the scan desk">
				<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
					<Info size={16} className="mt-0.5 shrink-0 text-warning" />
					One badge takes about 45–60 seconds including folding and putting it in a holder. Use it for walk-ins and reprints.
					A print badge button on the scan screen comes after the scan screen update.
				</p>
				<p className="text-body-medium text-on-surface-variant">
					Kiosk mode: make a Chrome shortcut with <code className="rounded-xs bg-surface-container-high px-1">--kiosk-printing</code> added, then set the badge printer as the laptop&apos;s default printer.
					Not available on phones; the print dialog still shows there.
				</p>
			</Kelompok>
		</div>
	);

	const panel = (
		<Pane as="aside" aria-label="Badge settings">
			<div className="shrink-0 border-b border-outline-variant px-4 py-3">
				<SegmentedButton<Bagian>
					label="Settings section"
					value={bagian}
					onChange={setBagian}
					className="w-full"
					options={[{ value: "isi", label: "Selected item" }, { value: "kertas", label: "Paper" }, { value: "cetak", label: "Print" }]}
				/>
			</div>
			<PaneBody className="px-4 py-4">{bagian === "isi" ? isiTerpilih : bagian === "kertas" ? isiKertas : isiCetak}</PaneBody>
			<PaneFooter note={!muatan.migrasi ? "Waiting for a database migration" : kotor ? "Unsaved changes" : "All changes saved"}>
				<Button simpan size="sm" loading={busy} disabled={!kotor || !muatan.migrasi} onClick={() => void simpan()}>Save</Button>
			</PaneFooter>
		</Pane>
	);

	return (
		<WorkspacePage fill className={cx(hidden && "hidden", KUNCI_TINGGI)}>
			<WorkspaceHeader
				meta={
					<>
						<span>{format.kind === "khusus" || format.kind === "tunggal" ? `${NAMA_FORMAT[format.kind]} ${ukuran.w} × ${ukuran.h} mm` : NAMA_FORMAT[format.kind]}</span>
						<MetaSeparator />
						<span>{lembar.namaKertas} paper</span>
					</>
				}
				actions={
					<>
						{pilihJenis}
						<Button variant="outlined" size="sm" icon={<Printer size={16} />} onClick={() => bukaCetak("contoh")}>Print sample</Button>
						<Button variant="outlined" size="sm" icon={<DownloadSimple size={16} />} onClick={() => bukaCetak("semua")}>Download PDF</Button>
					</>
				}
			/>
			{!muatan.migrasi ? (
				<Banner tone="warning" icon={<Warning size={18} />}>
					Paper badges can&apos;t be saved yet: database migration 202610040002 has not been run. The editor and Print sample still work.
				</Banner>
			) : null}
			{error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}
			<SupportingPane main={utama} pane={panel} terkunci />
			{dialogPrinter ? (
				<PrinterDialog
					awal={dialogPrinter === "baru" ? null : dialogPrinter}
					slug={muatan.event.slug}
					onClose={() => setDialogPrinter(null)}
					onSimpan={simpanProfil}
					onHapus={hapusProfil}
				/>
			) : null}
		</WorkspacePage>
	);
}

// ---- Potongan panel --------------------------------------------------------

/** Di bawah ini gambar terlihat pecah di jarak baca badge. */
const DPI_MIN = 150;

/**
 * Peringatan resolusi untuk gambar unggahan, dihitung dari ukuran cetaknya.
 *
 * Diukur di peramban dari ukuran asli gambar, bukan dari metadata dpi berkas:
 * angka dpi di berkas tidak dipakai siapa pun saat mencetak HTML, yang
 * menentukan hanya jumlah piksel dibagi milimeter yang ditutupnya.
 */
function PeringatanDpi({ url, wMm, hMm }: { url: string | null; wMm: number; hMm: number }) {
	const [asli, setAsli] = useState<{ url: string; w: number; h: number } | null>(null);
	useEffect(() => {
		if (!url) return;
		let batal = false;
		const img = new Image();
		img.onload = () => { if (!batal) setAsli({ url, w: img.naturalWidth, h: img.naturalHeight }); };
		img.src = url;
		return () => { batal = true; };
	}, [url]);
	if (!url || !asli || asli.url !== url) return null;
	const dpi = Math.round(Math.min(asli.w / (wMm / 25.4), asli.h / (hMm / 25.4)));
	if (dpi >= DPI_MIN) return null;
	return (
		<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
			<Warning size={16} className="mt-0.5 shrink-0 text-warning" />
			Gambar {asli.w} × {asli.h} px hanya sekitar {dpi} dpi di ukuran cetaknya, jadi akan terlihat pecah. Pakai minimal {Math.round((wMm / 25.4) * DPI_MIN)} × {Math.round((hMm / 25.4) * DPI_MIN)} px.
		</p>
	);
}

function WarnaField({ label, value, onChange }: { label: string; value: string; onChange: (nilai: string) => void }) {
	return (
		<label className="flex items-center justify-between gap-3 text-body-medium text-on-surface">
			<span className="font-medium">{label}</span>
			<span className="flex items-center gap-2">
				<span className="tabular-nums text-on-surface-variant">{value}</span>
				<input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border border-outline-variant bg-transparent p-0.5" />
			</span>
		</label>
	);
}

function AngkaMm({ label, value, min, max, step = 0.5, hint, onChange }: { label: string; value: number; min: number; max: number; step?: number; hint?: string; onChange: (nilai: number) => void }) {
	return (
		<TextField
			label={label}
			type="number"
			min={min}
			max={max}
			step={step}
			hint={hint}
			value={value}
			onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && e.target.value !== "") onChange(jepit(n, min, max)); }}
		/>
	);
}

function UkuranKhusus({ format, ubah }: { format: BadgeFormat; ubah: (patch: Partial<BadgeFormat>) => void }) {
	// Diketik dulu, diterapkan saat keluar kolom: menerapkan per ketukan
	// menyekalakan isi badge ke "1 mm" saat orang baru mengetik angka pertama.
	const [w, setW] = useState(String(format.w_mm));
	const [h, setH] = useState(String(format.h_mm));
	const terapkan = () => {
		const nw = jepit(Number(w) || format.w_mm, UKURAN_KHUSUS.min, UKURAN_KHUSUS.max);
		const nh = jepit(Number(h) || format.h_mm, UKURAN_KHUSUS.min, UKURAN_KHUSUS.max);
		setW(String(nw));
		setH(String(nh));
		if (nw !== format.w_mm || nh !== format.h_mm) ubah({ w_mm: nw, h_mm: nh });
	};
	return (
		<div className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
			<div className="grid grid-cols-2 gap-3">
				<TextField label="Badge width (mm)" type="number" min={UKURAN_KHUSUS.min} max={UKURAN_KHUSUS.max} value={w} onChange={(e) => setW(e.target.value)} onBlur={terapkan} onKeyDown={(e) => { if (e.key === "Enter") terapkan(); }} />
				<TextField label="Badge height (mm)" type="number" min={UKURAN_KHUSUS.min} max={UKURAN_KHUSUS.max} value={h} onChange={(e) => setH(e.target.value)} onBlur={terapkan} onKeyDown={(e) => { if (e.key === "Enter") terapkan(); }} />
			</div>
			<p className="text-body-medium text-on-surface-variant">
				Finished badge size, {UKURAN_KHUSUS.min} to {UKURAN_KHUSUS.max} mm. Make sure you have holders this size before printing hundreds.
			</p>
			{format.kind === "khusus" ? (
				<div>
					<p className="text-body-medium font-medium text-on-surface">Fold</p>
					<SegmentedButton<BadgeFold>
						className="mt-2 w-full"
						label="Fold"
						value={format.fold}
						onChange={(fold) => ubah({ fold })}
						options={[{ value: "side", label: "Side" }, { value: "top", label: "Top" }, { value: "none", label: "None" }]}
					/>
					<p className="mt-2 text-body-medium text-on-surface-variant">
						{format.fold === "side"
							? "Recommended. Front and back side by side, back upright."
							: format.fold === "top"
								? "The back prints upside down below the front, so it is upright after folding."
								: "One side only, no agenda on the back."}
					</p>
				</div>
			) : null}
		</div>
	);
}

/** Sketsa kecil format lembar: kotak biru tua = depan, garis putus = lipatan. */
function IkonFormat({ kind }: { kind: BadgeFormatKind }) {
	const mendatar = kind === "a5_lipat2" || kind === "a4_lipat2";
	const w = mendatar ? 32 : 24;
	const h = mendatar ? 24 : 32;
	return (
		<svg width={32} height={32} viewBox="0 0 32 32" aria-hidden className="mt-0.5 shrink-0">
			<rect x={(32 - w) / 2 + 0.5} y={(32 - h) / 2 + 0.5} width={w - 1} height={h - 1} rx={1.5} fill="var(--color-surface-container-lowest)" stroke="var(--color-on-surface-variant)" />
			<rect x={(32 - w) / 2 + 2.5} y={(32 - h) / 2 + 2.5} width={kind === "tunggal" || kind === "khusus" ? w - 5 : w / 2 - 4} height={3} fill="var(--color-primary)" />
			{kind === "a4_lipat4" ? (
				<path d="M16 4.5V27.5M4.5 16H27.5" stroke="var(--color-primary)" strokeDasharray="2 1.5" />
			) : kind === "a4_isi2" ? (
				<>
					<path d="M16 4.5V27.5" stroke="var(--color-primary)" strokeDasharray="2 1.5" />
					<path d="M4.5 16H27.5" stroke="var(--color-error)" />
				</>
			) : kind === "a5_lipat2" || kind === "a4_lipat2" ? (
				<path d="M16 4.5V27.5" stroke="var(--color-primary)" strokeDasharray="2 1.5" />
			) : null}
		</svg>
	);
}

function SetelanElemen({
	element, ubah, hari, statusRundown, sisi, rundownUrl, qrPeserta,
}: {
	element: BadgeElement;
	ubah: (patch: Partial<BadgeElement>) => void;
	hari: BadgeRundownHari[];
	statusRundown: StatusRundown | null;
	sisi: Mm;
	rundownUrl: string;
	qrPeserta: string;
}) {
	switch (element.type) {
		case "text":
			return (
				<>
					{element.field === "static" ? (
						<TextField label="Text" maxLength={160} value={element.text ?? ""} onChange={(e) => ubah({ text: e.target.value })} />
					) : null}
					<AngkaMm label="Font size (pt)" value={element.size} min={5} max={96} hint="Text that is too long shrinks to fit instead of being cut." onChange={(size) => ubah({ size })} />
					<div>
						<p className="text-body-medium font-medium text-on-surface">Alignment</p>
						<SegmentedButton
							className="mt-2 w-full"
							label="Text alignment"
							value={element.align}
							onChange={(align) => ubah({ align })}
							options={[{ value: "left" as const, label: "Left" }, { value: "center" as const, label: "Centre" }, { value: "right" as const, label: "Right" }]}
						/>
					</div>
					<WarnaField label="Colour" value={element.color} onChange={(color) => ubah({ color })} />
					<Switch checked={element.weight === "bold"} onChange={(v) => ubah({ weight: v ? "bold" : "normal" })} label="Bold" />
					<Switch checked={Boolean(element.uppercase)} onChange={(v) => ubah({ uppercase: v })} label="All capitals" />
				</>
			);
		case "qr": {
			const { modulMm } = matriksQr(element.field === "rundown_url" ? rundownUrl : qrPeserta, element.size);
			const terlaluKecil = modulMm < MODUL_MIN_MM;
			return (
				<>
					<SelectField label="Code content" value={element.field} onChange={(e) => ubah({ field: e.target.value === "rundown_url" ? "rundown_url" : "qr_code" })}>
						<option value="qr_code">Participant code, for check-in and booths</option>
						<option value="rundown_url">Link to the latest agenda</option>
					</SelectField>
					<AngkaMm
						label="Plate size (mm)"
						value={element.size}
						min={14}
						max={Math.min(sisi.w, sisi.h)}
						step={1}
						hint={`${modulMm.toFixed(2).replace(".", ",")} mm per dot. At least 0.5 mm so phone cameras can read it.`}
						onChange={(size) => ubah({ size })}
					/>
					{terlaluKecil ? (
						<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
							<Warning size={16} className="mt-0.5 shrink-0 text-warning" />Too small: the dots are under 0.5 mm. Make the plate bigger.
						</p>
					) : null}
					<p className="flex items-start gap-2 rounded-md bg-success-soft p-3 text-body-medium text-on-surface">
						<Check size={16} className="mt-0.5 shrink-0 text-success" />
						<span><span className="font-semibold">The white plate and 4-dot quiet zone are kept automatically.</span> The code is always black on white, whatever the background.</span>
					</p>
					<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
						<Info size={16} className="mt-0.5 shrink-0 text-warning" />
						Use matte or anti-glare holders. Shiny plastic holders reflect the lights and slow scanning down.
					</p>
				</>
			);
		}
		case "rect":
			return (
				<>
					<WarnaField label="Colour" value={element.color} onChange={(color) => ubah({ color })} />
					<div className="grid grid-cols-2 gap-3">
						<AngkaMm label="Width (mm)" value={element.w} min={1} max={sisi.w} onChange={(w) => ubah({ w })} />
						<AngkaMm label="Height (mm)" value={element.h} min={1} max={sisi.h} onChange={(h) => ubah({ h })} />
					</div>
					<AngkaMm label="Corner radius (mm)" value={element.radius} min={0} max={20} onChange={(radius) => ubah({ radius })} />
					<p className="text-body-medium text-on-surface-variant">A band touching the badge edge needs to run 3 mm past the paper edge, so use the full width and let the printer trim it.</p>
				</>
			);
		case "image":
			return (
				<>
					<ImageUploadField label="Image" kind="badge" fit="contain" value={element.url} previewClassName="h-24 w-full" hint="Transparent PNG or JPG, under 5 MB." onChange={(url) => ubah({ url })} />
					<PeringatanDpi url={element.url} wMm={element.w} hMm={element.h} />
					<div className="grid grid-cols-2 gap-3">
						<AngkaMm label="Width (mm)" value={element.w} min={4} max={sisi.w} onChange={(w) => ubah({ w })} />
						<AngkaMm label="Height (mm)" value={element.h} min={4} max={sisi.h} onChange={(h) => ubah({ h })} />
					</div>
				</>
			);
		case "rundown":
			return (
				<>
					<SelectField label="Day printed" value={element.day} onChange={(e) => ubah({ day: e.target.value })}>
						<option value="auto">First day</option>
						<option value="hari_ini">Day the badge is printed</option>
						<option value="semua">All days, compact</option>
						{hari.map((h) => <option key={h.id} value={h.id}>{h.nama}</option>)}
					</SelectField>
					{hari.length === 0 ? (
						<p className="text-body-medium text-on-surface-variant">The agenda is not published yet. The preview uses a sample; on printed badges this box stays empty until the agenda is published.</p>
					) : null}
					<Switch checked={element.merge_parallel} onChange={(v) => ubah({ merge_parallel: v })} label="Merge sessions at the same time" description="Three parallel sessions become one row." />
					<AngkaMm label="Starting font size (pt)" value={element.size} min={8} max={14} hint="Goes down to 8 pt by itself if it doesn't fit." onChange={(size) => ubah({ size })} />
					<div className="grid grid-cols-2 gap-3">
						<AngkaMm label="Width (mm)" value={element.w} min={30} max={sisi.w} onChange={(w) => ubah({ w })} />
						<AngkaMm label="Height (mm)" value={element.h} min={20} max={sisi.h} onChange={(h) => ubah({ h })} />
					</div>
					<WarnaField label="Text colour" value={element.color} onChange={(color) => ubah({ color })} />
					<WarnaField label="Time colour" value={element.accent} onChange={(accent) => ubah({ accent })} />
					{statusRundown && !statusRundown.muat ? (
						<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
							<Warning size={16} className="mt-0.5 shrink-0 text-warning" />
							The agenda doesn&apos;t fit even at 8 pt; the last rows are cut. Make the box bigger, turn on Merge sessions, or pick one day only.
						</p>
					) : statusRundown && statusRundown.ukuran < element.size ? (
						<p className="text-body-medium text-on-surface-variant">Shrunk to {statusRundown.ukuran} pt to fit.</p>
					) : null}
				</>
			);
	}
}
