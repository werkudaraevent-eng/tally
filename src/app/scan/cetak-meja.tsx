"use client";

import { Printer } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Dialog, SegmentedButton, SelectField, StatusChip } from "@/components/m3";
import { useToast } from "@/components/toast";
import { eventApiPath } from "@/lib/event-url";
import { masihJalan, type HasilCetakMeja, type ModeCetakMeja, type PekerjaanCetak, type StasiunRingkas } from "@/lib/badge/stasiun";
import { bunyikan } from "./umpan-balik";

/**
 * Badge kertas lewat stasiun cetak, dari sisi HP pemindai.
 *
 * Dipisah dari scan-client.tsx supaya layar pemindai hanya menyambungkan tiga
 * hal: badan permintaan scan (`bodyCetak`), jawaban server (`catat`), dan dua
 * potongan tampilan (panel "Badge printer" dan baris status di lembar hasil).
 *
 * HP tidak pernah mencetak di sini. Ia memilih stasiun, memberi tahu server
 * kapan badge diantrekan (mode), lalu menunggu kabar stasiun: setiap pekerjaan
 * yang masih antre atau sedang diambil ditanyakan ulang setiap 1,5 detik.
 * Status yang dibaca sudah disapu database, jadi "Expired" di HP berarti
 * baris yang memang kedaluwarsa, bukan tebakan jam ponsel.
 *
 * Teks baru berbahasa Inggris (glosarium bahasa-admin/glosarium-en.md).
 */

const KUNCI_STASIUN = "scan-badge-stasiun";
const KUNCI_MODE = "scan-badge-autoprint";
const JEDA_STASIUN_MS = 5000;
const JEDA_PEKERJAAN_MS = 1500;

const jam = (iso: string | null | undefined) =>
	iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

function baca(kunci: string): string | null {
	try {
		return window.localStorage.getItem(kunci);
	} catch {
		return null;
	}
}

function simpan(kunci: string, nilai: string | null) {
	try {
		if (nilai === null) window.localStorage.removeItem(kunci);
		else window.localStorage.setItem(kunci, nilai);
	} catch {
		// Penyimpanan tidak tersedia; pilihan tetap berlaku sesi ini.
	}
}

type Antrean = Map<number, { nama: string }>;

/**
 * Seluruh keadaan cetak meja di HP ini.
 *
 * `aktif`: acara ini mencetak badge kertas di meja dan migrasinya sudah ada.
 */
export function useCetakMeja(aktif: boolean, laneId: number | null, suaraNyala: () => boolean) {
	const toast = useToast();
	const [stasiun, setStasiun] = useState<StasiunRingkas[] | null>(null);
	const [stasiunId, setStasiunId] = useState<number | null>(null);
	const [mode, setMode] = useState<ModeCetakMeja>("walkin");
	const [pekerjaan, setPekerjaan] = useState<Record<number, PekerjaanCetak>>({});
	const antreanRef = useRef<Antrean>(new Map());
	const [jumlahTunggu, setJumlahTunggu] = useState(0);
	const pilihanRef = useRef<{ stasiunId: number | null; mode: ModeCetakMeja }>({ stasiunId: null, mode: "walkin" });

	useEffect(() => {
		const timer = window.setTimeout(() => {
			const id = Number(baca(KUNCI_STASIUN));
			const m = baca(KUNCI_MODE);
			const modeAwal: ModeCetakMeja = m === "off" || m === "semua" ? m : "walkin";
			setStasiunId(Number.isFinite(id) && id > 0 ? id : null);
			setMode(modeAwal);
			pilihanRef.current = { stasiunId: Number.isFinite(id) && id > 0 ? id : null, mode: modeAwal };
		}, 0);
		return () => window.clearTimeout(timer);
	}, []);

	// Daftar stasiun dan keadaannya, untuk pemilih dan chip "Connected".
	useEffect(() => {
		if (!aktif) return;
		let batal = false;
		const muat = async () => {
			const r = await fetch(eventApiPath("/api/stasiun-cetak"), { cache: "no-store" }).catch(() => null);
			if (batal || !r?.ok) return;
			const body = (await r.json()) as { stasiun: StasiunRingkas[] };
			setStasiun(body.stasiun);
		};
		const awal = window.setTimeout(() => void muat(), 0);
		const ulang = window.setInterval(() => void muat(), JEDA_STASIUN_MS);
		return () => { batal = true; window.clearTimeout(awal); window.clearInterval(ulang); };
	}, [aktif]);

	const terima = useCallback((daftar: PekerjaanCetak[]) => {
		if (daftar.length === 0) return;
		setPekerjaan((lama) => {
			const baru = { ...lama };
			for (const p of daftar) baru[p.id] = p;
			return baru;
		});
		const antrean = antreanRef.current;
		for (const p of daftar) {
			const catatan = antrean.get(p.id);
			if (!catatan || masihJalan(p.status)) continue;
			antrean.delete(p.id);
			// Kabar buruk untuk tamu yang lembarnya mungkin sudah ditutup: bunyi dan
			// toast, karena petugas sudah memandang tamu berikutnya.
			if (p.status === "gagal" || p.status === "kedaluwarsa") {
				bunyikan("galat", suaraNyala());
				toast.error(
					`Badge for ${catatan.nama} not printed`,
					p.status === "kedaluwarsa" ? `It waited too long for ${p.stasiun.nama}. Open the participant and press Print again.` : `${p.stasiun.nama} reported a problem. Check the printer, then print again.`,
				);
			}
		}
		setJumlahTunggu(antrean.size);
	}, [suaraNyala, toast]);

	// Pekerjaan yang masih ditunggu, ditanyakan ulang sampai selesai.
	useEffect(() => {
		if (!aktif || jumlahTunggu === 0) return;
		let batal = false;
		const tanya = async () => {
			const ids = [...antreanRef.current.keys()].slice(0, 20);
			if (ids.length === 0) return;
			const r = await fetch(eventApiPath(`/api/stasiun-cetak/pekerjaan?id=${ids.join(",")}`), { cache: "no-store" }).catch(() => null);
			if (batal || !r?.ok) return;
			const body = (await r.json()) as { pekerjaan: PekerjaanCetak[] };
			// Pekerjaan yang hilang (peserta dihapus) tidak ditunggu lagi.
			const ada = new Set(body.pekerjaan.map((p) => p.id));
			for (const id of ids) if (!ada.has(id)) antreanRef.current.delete(id);
			terima(body.pekerjaan);
			setJumlahTunggu(antreanRef.current.size);
		};
		const ulang = window.setInterval(() => void tanya(), JEDA_PEKERJAAN_MS);
		return () => { batal = true; window.clearInterval(ulang); };
	}, [aktif, jumlahTunggu, terima]);

	/** Bagian `cetak` dari badan permintaan scan dan walk-in. */
	const bodyCetak = useCallback(() => {
		const { stasiunId: id, mode: m } = pilihanRef.current;
		return aktif && id !== null && m !== "off" ? { stasiun_id: id, mode: m } : null;
	}, [aktif]);

	const lacak = useCallback((p: PekerjaanCetak | null | undefined, nama: string) => {
		if (!p) return;
		if (masihJalan(p.status)) {
			antreanRef.current.set(p.id, { nama });
			setJumlahTunggu(antreanRef.current.size);
		}
		terima([p]);
	}, [terima]);

	/** Jawaban server atas scan atau walk-in. */
	const catat = useCallback((hasil: HasilCetakMeja | undefined, nama: string) => {
		lacak(hasil?.pekerjaan, nama);
	}, [lacak]);

	const pilihStasiun = useCallback((id: number | null) => {
		pilihanRef.current = { ...pilihanRef.current, stasiunId: id };
		setStasiunId(id);
		simpan(KUNCI_STASIUN, id === null ? null : String(id));
	}, []);

	const gantiMode = useCallback((m: ModeCetakMeja) => {
		pilihanRef.current = { ...pilihanRef.current, mode: m };
		setMode(m);
		simpan(KUNCI_MODE, m);
	}, []);

	/** Print again / Print badge: pekerjaan `ulang` baru di stasiun yang dipilih. */
	const cetakUlang = useCallback(async (participantId: string, nama: string): Promise<number | null> => {
		const id = pilihanRef.current.stasiunId;
		if (id === null) return null;
		const r = await fetch(eventApiPath("/api/stasiun-cetak/pekerjaan"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stasiun_id: id, participant_id: participantId, lane_id: laneId }),
		}).catch(() => null);
		const body = (await r?.json().catch(() => ({}))) as { pekerjaan?: PekerjaanCetak; error?: { message?: string; details?: { message?: string } } } | undefined;
		if (!r?.ok || !body?.pekerjaan) {
			toast.error("Badge not queued", body?.error?.details?.message ?? body?.error?.message ?? "Check the connection and try again.");
			return null;
		}
		lacak(body.pekerjaan, nama);
		return body.pekerjaan.id;
	}, [laneId, lacak, toast]);

	/** Change station: hanya pekerjaan yang masih antre, ke stasiun yang tersambung. */
	const pindah = useCallback(async (jobId: number, tujuan: number, nama: string) => {
		const r = await fetch(eventApiPath("/api/stasiun-cetak/pekerjaan"), {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: jobId, stasiun_id: tujuan }),
		}).catch(() => null);
		const body = (await r?.json().catch(() => ({}))) as { pekerjaan?: PekerjaanCetak; error?: { details?: { message?: string } } } | undefined;
		if (!r?.ok || !body?.pekerjaan) {
			toast.error("Station not changed", body?.error?.details?.message ?? "Check the connection and try again.");
			return;
		}
		lacak(body.pekerjaan, nama);
		pilihStasiun(tujuan);
	}, [lacak, pilihStasiun, toast]);

	return {
		stasiun,
		stasiunId,
		stasiunDipilih: stasiun?.find((s) => s.id === stasiunId) ?? null,
		mode,
		pekerjaan,
		jumlahTunggu,
		bodyCetak,
		catat,
		pilihStasiun,
		gantiMode,
		cetakUlang,
		pindah,
	};
}

export type CetakMeja = ReturnType<typeof useCetakMeja>;

function chipStasiun(s: StasiunRingkas) {
	if (!s.online) return <StatusChip tone="error" dot>{s.terakhir ? `Disconnected since ${jam(s.terakhir)}` : "Not connected"}</StatusChip>;
	if (s.dijeda) return <StatusChip tone="warning" dot>Paused</StatusChip>;
	return <StatusChip tone="success" dot>Connected</StatusChip>;
}

/** Panel "Badge printer" di kolom kanan layar pemindai. */
export function PanelCetakMeja({ meja, slug }: { meja: CetakMeja; slug: string }) {
	const { stasiun, stasiunId, stasiunDipilih, mode } = meja;
	return (
		<>
			<h2 className="flex items-center gap-2 text-title-small">
				<Printer size={18} aria-hidden />
				Badge printer
			</h2>
			<p className="mt-1 text-body-small text-on-surface-variant">Paper badges print at the print station on the desk laptop.</p>

			{stasiun && stasiun.length === 0 ? (
				<p className="mt-3 rounded-lg bg-warning-soft p-3 text-body-small text-on-warning-soft">
					No print station yet. On the desk laptop, open {slug ? `/e/${slug}/stasiun` : "the print station page"} and start a station.
				</p>
			) : (
				<>
					<SelectField
						className="mt-3"
						label="Print station"
						value={stasiunId ?? ""}
						onChange={(e) => meja.pilihStasiun(e.target.value ? Number(e.target.value) : null)}
					>
						<option value="">Choose a station</option>
						{(stasiun ?? []).map((s) => (
							<option key={s.id} value={s.id}>{s.nama}</option>
						))}
					</SelectField>
					{stasiunDipilih ? <div className="mt-2">{chipStasiun(stasiunDipilih)}</div> : null}
				</>
			)}

			<div className="mt-4">
				<p className="text-label-large text-on-surface-variant">Automatic printing</p>
				<SegmentedButton
					className="mt-2"
					size="lg"
					label="When a badge prints by itself"
					value={mode}
					onChange={meja.gantiMode}
					options={[
						{ value: "off" as const, label: "Off" },
						{ value: "walkin" as const, label: "Walk-in" },
						{ value: "semua" as const, label: "All" },
					]}
				/>
				<p className="mt-2 text-body-small text-on-surface-variant">
					{mode === "off"
						? "Badges print only when you press Print badge."
						: mode === "walkin"
							? "Only walk-ins registered at this desk. Registered participants already carry a badge printed before the event."
							: "Every participant who checks in for the first time. Scanning again doesn't print."}
				</p>
			</div>

			{meja.jumlahTunggu > 0 ? (
				<p role="status" className="mt-3 text-body-medium text-on-surface-variant">
					<span className="tabular-nums">{meja.jumlahTunggu}</span> {meja.jumlahTunggu === 1 ? "badge" : "badges"} from this device waiting for the station
				</p>
			) : null}
		</>
	);
}

/**
 * Baris status badge dan tombolnya di lembar hasil.
 *
 * `pekerjaan` adalah status terbaru pekerjaan lembar ini (null: belum ada badge
 * untuk peserta ini). Dikembalikan sebagai dua potongan supaya lembar hasil
 * menaruhnya di tempat baris status printer dan baris aksinya.
 */
export function barisCetakMeja(input: {
	meja: CetakMeja;
	pekerjaan: PekerjaanCetak | null;
	galat: string | null;
	ulangi: boolean;
	onCetak: () => void;
	onGanti: () => void;
	mengantre: boolean;
}): { status: React.ReactNode; aksi: React.ReactNode; menahan: boolean } {
	const { meja, pekerjaan: p, galat, ulangi, onCetak, onGanti, mengantre } = input;
	const adaStasiun = meja.stasiunId !== null;

	let nada: "biasa" | "ok" | "awas" | "galat" = "biasa";
	let teks: React.ReactNode = null;
	let tombol: "ulang" | "lagi" | "cetak" | null = null;
	let ganti = false;

	if (galat) {
		nada = "galat";
		teks = galat;
		tombol = adaStasiun ? "lagi" : null;
	} else if (p) {
		const s = p.stasiun;
		if (p.status === "terkirim") {
			nada = ulangi ? "biasa" : "ok";
			teks = ulangi ? <>Badge already sent to printer at <span className="tabular-nums">{jam(p.selesai_at)}</span> on {s.nama}.</> : <>Sent to printer at {s.nama} · <span className="tabular-nums">{jam(p.selesai_at)}</span></>;
			tombol = "ulang";
		} else if (p.status === "diambil") {
			teks = `Sending to printer at ${s.nama}…`;
		} else if (p.status === "antre") {
			if (!s.online) {
				nada = "awas";
				teks = s.terakhir ? <>{s.nama} not connected since <span className="tabular-nums">{jam(s.terakhir)}</span>. Badge waiting.</> : `${s.nama} is not connected. Badge waiting.`;
				ganti = true;
			} else if (s.dijeda) {
				nada = "awas";
				teks = `${s.nama} is paused. The badge is queued and prints when it resumes.`;
			} else {
				teks = `Queued at ${s.nama}…`;
			}
		} else if (p.status === "kedaluwarsa") {
			nada = "galat";
			teks = "Expired, badge not printed.";
			tombol = "lagi";
		} else {
			nada = "galat";
			teks = p.galat === "macet" || p.galat === "diambil_alih"
				? `${s.nama} stopped while printing. Check whether the badge came out before printing again.`
				: `${s.nama} could not print this badge.`;
			tombol = "lagi";
		}
	} else if (adaStasiun) {
		tombol = "cetak";
	} else if (meja.stasiun) {
		teks = "Choose a print station in the Badge printer panel to print badges.";
	}

	const warna = nada === "ok" ? "text-on-success-container" : nada === "awas" ? "text-warning" : nada === "galat" ? "text-error" : "text-on-surface-variant";
	const status = teks ? (
		<p role="status" className={`mb-2 flex items-start gap-2 text-body-medium ${warna} ${nada === "ok" ? "font-semibold" : ""}`}>
			<Printer size={18} weight={nada === "ok" ? "fill" : "regular"} className="mt-0.5 shrink-0" aria-hidden />
			<span>{teks}</span>
		</p>
	) : null;

	const sedang = mengantre || Boolean(p && masihJalan(p.status));
	const aksi = (
		<>
			{ganti ? <Button variant="text" size="md" onClick={onGanti}>Change station</Button> : null}
			{tombol && adaStasiun ? (
				<Button
					variant={tombol === "lagi" ? "filled" : "text"}
					size="md"
					loading={mengantre}
					disabled={sedang && !mengantre}
					icon={<Printer size={20} aria-hidden />}
					onClick={onCetak}
				>
					{tombol === "cetak" ? "Print badge" : "Print again"}
				</Button>
			) : null}
		</>
	);

	// Lembar tidak menutup sendiri selama badge-nya masih ditunggu: kabarnya
	// hanya ada di lembar ini.
	return { status, aksi, menahan: sedang || nada === "galat" || nada === "awas" };
}

/** Change station: hanya stasiun lain yang sedang tersambung. */
export function DialogGantiStasiun({
	meja, jobId, nama, onClose,
}: { meja: CetakMeja; jobId: number | null; nama: string; onClose: () => void }) {
	const sekarang = jobId !== null ? meja.pekerjaan[jobId]?.stasiun.id : null;
	const pilihan = (meja.stasiun ?? []).filter((s) => s.online && s.id !== sekarang);
	return (
		<Dialog
			open={jobId !== null}
			onClose={onClose}
			title="Print at another station"
			description="Only connected stations are listed. The badge moves; it isn't printed twice."
			actions={<Button variant="text" size="md" onClick={onClose}>Cancel</Button>}
		>
			{pilihan.length === 0 ? (
				<p className="text-body-medium text-on-surface-variant">No other station is connected right now.</p>
			) : (
				<div className="flex flex-col gap-2">
					{pilihan.map((s) => (
						<Button
							key={s.id}
							variant="outlined"
							size="md"
							block
							onClick={() => { if (jobId !== null) void meja.pindah(jobId, s.id, nama); onClose(); }}
						>
							{s.nama}{s.dijeda ? " (paused)" : ""}
						</Button>
					))}
				</div>
			)}
		</Dialog>
	);
}
