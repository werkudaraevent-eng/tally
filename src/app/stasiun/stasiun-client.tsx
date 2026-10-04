"use client";

import { CheckCircle, Copy, Pause, Play, Printer, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LembarBadge, hariIniDi } from "@/components/badge/lembar-badge";
import { PrinterDialog } from "@/components/badge/printer-dialog";
import { Button, Card, Dialog, SelectField, StatusChip, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";
import { eventApiPath } from "@/lib/event-url";
import { kertasCocok, susunLembar, type BadgeData, type BadgeEventData, type BadgeLayout } from "@/lib/badge/layout";
import { bacaPrinter, bacaPrinterAktif, simpanPrinter, simpanPrinterAktif, type ProfilPrinter } from "@/lib/badge/printer";
import type { BadgeRundownHari } from "@/lib/badge/rundown";
import type { JenisCetak, StatusAntrean } from "@/lib/badge/stasiun";
import { normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

/**
 * Stasiun cetak: laptop di meja registrasi yang mencetak badge kertas untuk HP
 * dan tablet pemindai.
 *
 * Dua layar: pemasangan (nama, profil printer, dua pintasan Chrome, Cetak uji)
 * lalu stasiun berjalan (keadaan, dua angka, cetakan terakhir). Saat berjalan
 * halaman menarik antrean setiap 1,5 detik; tarikan itu sekaligus detak jantung
 * yang membuat HP menulis "Connected".
 *
 * Mencetak lewat dokumen ini sendiri, satu badge per dialog: lembar badge
 * dipasang di wadah tersembunyi, `@media print` menyembunyikan semua yang lain
 * (termasuk toast dan dialog yang dipasang di luar layar ini), lalu
 * `window.print()`. Dengan Chrome `--kiosk-printing` dialognya tidak
 * muncul dan lembar langsung ke printer bawaan. `afterprint` menandai
 * "terkirim": Chrome tidak pernah tahu apakah kertasnya benar-benar keluar,
 * jadi tidak ada kata "printed" di layar ini.
 *
 * Token lease hidup di sessionStorage: satu tab satu pemegang. Muat ulang tab
 * yang sama tetap pemegangnya; tab atau laptop lain harus menekan Take over.
 *
 * Teks layar ini berbahasa Inggris sejak awal (keputusan Hanung 2026-10-04,
 * glosarium /mnt/project-files/bahasa-admin/glosarium-en.md).
 */

type Susunan = {
	layout: BadgeLayout;
	event: { name: string; slug: string; kv_url: string | null };
	rundown: BadgeRundownHari[];
	time_zone?: string;
};

type BarisRiwayat = {
	id: number;
	jenis: JenisCetak;
	status: StatusAntrean;
	galat: string | null;
	participant_id: string | null;
	nama: string | null;
	asal: string | null;
	created_at: string;
	selesai_at: string | null;
};

type Riwayat = { terkirim_hari_ini: number; menunggu: number; baris: BarisRiwayat[] };

type Koneksi =
	| { jenis: "ok" }
	| { jenis: "terputus"; sejak: string }
	| { jenis: "sesi" }
	| { jenis: "dipakai"; sejak: string | null }
	| { jenis: "belum" }
	| { jenis: "tutup" };

type Jawaban = { status: number; ok: boolean; body: Record<string, unknown> };

const KUNCI_NAMA = "tally.stasiun.nama";
const KUNCI_TOKEN = "tally.stasiun.token";
const JEDA_TARIK_MS = 1500;
const JEDA_RIWAYAT_MS = 5000;
/** Batas mundur saat Tally tidak terjangkau: 1,5, 3, 6, 12, lalu 15 detik. */
const JEDA_TARIK_MAKS_MS = 15000;

/** Badge Cetak uji: tidak lewat antrean, langsung dari laptop ini. */
const BADGE_UJI: BadgeData = { name: "Test Badge", company: "Tally print station", title: null, qr_code: "TEST0000" };

/** Jam di zona acara, bukan zona laptop: laptop sewaan sering masih berjam lain. */
const jamDi = (iso: string | null | undefined, zona: EventTimeZone) =>
	iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: zona }) : "";

/** Nama kertas dari layout.ts masih berbahasa Indonesia; diterjemahkan di layar ini saja supaya /cetak-badge tidak berubah. */
const kertasEn = (nama: string) => nama.replace(/ tegak$/, " portrait").replace(/ mendatar$/, " landscape");

function tidakMuatEn(pesan: string | null): string | null {
	if (!pesan) return null;
	const m = /^Lembar (\d+) × (\d+) mm lebih besar dari kertas (\w+)\./.exec(pesan);
	return m ? `The ${m[1]} × ${m[2]} mm sheet is larger than ${m[3]} paper. Make the badge smaller or choose another fold.` : pesan;
}

/** 409 dari route stasiun: acara selesai atau diarsipkan, atau migrasi 0009 belum ada. */
const koneksi409 = (r: Jawaban): Koneksi =>
	(r.body.error as { code?: string } | undefined)?.code === "EVENT_NOT_WRITABLE" ? { jenis: "tutup" } : { jenis: "belum" };

const tidur = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const bingkai = () => new Promise((r) => window.requestAnimationFrame(() => window.requestAnimationFrame(r)));

async function kirimJson(path: string, body: unknown, method = "POST"): Promise<Jawaban | null> {
	const batas = new AbortController();
	const pewaktu = window.setTimeout(() => batas.abort(), 8000);
	const response = await fetch(eventApiPath(path), {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		cache: "no-store",
		signal: batas.signal,
	}).catch(() => null);
	window.clearTimeout(pewaktu);
	if (!response) return null;
	return { status: response.status, ok: response.ok, body: ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
}

function bacaToken(): string {
	try {
		const ada = window.sessionStorage.getItem(KUNCI_TOKEN);
		if (ada) return ada;
		const baru = crypto.randomUUID();
		window.sessionStorage.setItem(KUNCI_TOKEN, baru);
		return baru;
	} catch {
		return crypto.randomUUID();
	}
}

function bacaNama(): string {
	try {
		return window.localStorage.getItem(KUNCI_NAMA) || "Station 1";
	} catch {
		return "Station 1";
	}
}

function simpanNama(nama: string) {
	try {
		window.localStorage.setItem(KUNCI_NAMA, nama);
	} catch {
		// Mode privat: nama tetap berlaku selama tab ini terbuka.
	}
}

const STATUS_BARIS: Record<StatusAntrean, { teks: string; tone: "neutral" | "warning" | "success" | "error" }> = {
	antre: { teks: "Queued", tone: "neutral" },
	diambil: { teks: "Sending…", tone: "warning" },
	terkirim: { teks: "Sent", tone: "success" },
	gagal: { teks: "Failed", tone: "error" },
	kedaluwarsa: { teks: "Expired", tone: "error" },
};

export default function StasiunClient() {
	const toast = useToast();
	const [siapBaca, setSiapBaca] = useState(false);
	const [susunan, setSusunan] = useState<Susunan | null>(null);
	const [galatMuat, setGalatMuat] = useState("");
	const [printer, setPrinter] = useState<ProfilPrinter[]>([]);
	const [aktif, setAktif] = useState<string | null>(null);
	const [dialogPrinter, setDialogPrinter] = useState<ProfilPrinter | "baru" | null>(null);
	const [nama, setNama] = useState("");
	const [token, setToken] = useState("");
	const [fase, setFase] = useState<"pasang" | "jalan">("pasang");
	const [memulai, setMemulai] = useState(false);
	const [galatMulai, setGalatMulai] = useState("");
	const [stasiun, setStasiun] = useState<{ id: number; nama: string } | null>(null);
	const [koneksi, setKoneksi] = useState<Koneksi>({ jenis: "ok" });
	const [dijeda, setDijeda] = useState(false);
	const [mengirim, setMengirim] = useState<string | null>(null);
	const [gagalSiap, setGagalSiap] = useState<{ nama: string | null; participant_id: string | null } | null>(null);
	const [riwayat, setRiwayat] = useState<Riwayat | null>(null);
	const [isiCetak, setIsiCetak] = useState<BadgeData[] | null>(null);
	const [tanyaUji, setTanyaUji] = useState(false);
	const [ujiGagal, setUjiGagal] = useState(false);
	const [cobaKe, setCobaKe] = useState(0);
	const [salinan, setSalinan] = useState<string | null>(null);
	const [tersembunyi, setTersembunyi] = useState(false);

	// Satu badge pada satu waktu. Ref, bukan state: putaran tarik membacanya di
	// tengah await, dan nilai state di sana sudah basi.
	const sibukRef = useRef(false);
	const areaCetakRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			const daftar = bacaPrinter();
			setPrinter(daftar);
			const tersimpan = bacaPrinterAktif();
			setAktif(daftar.some((p) => p.id === tersimpan) ? tersimpan : daftar[0]?.id ?? null);
			setNama(bacaNama());
			setToken(bacaToken());
			setSiapBaca(true);
		}, 0);
		return () => window.clearTimeout(timer);
	}, []);

	useEffect(() => {
		let batal = false;
		void (async () => {
			const r = await fetch(eventApiPath("/api/stasiun-cetak/susunan"), { cache: "no-store" }).catch(() => null);
			if (batal) return;
			if (r?.status === 401) { setKoneksi({ jenis: "sesi" }); return; }
			if (!r?.ok) { setGalatMuat("The badge layout could not be loaded. Reload this page."); return; }
			setSusunan((await r.json()) as Susunan);
		})();
		return () => { batal = true; };
	}, []);

	const zona = normalizeTimeZone(susunan?.time_zone);
	const jamZona = (iso: string | null | undefined) => jamDi(iso, zona);
	const jamZonaLengkap = (iso: string | null | undefined) => `${jamDi(iso, zona)} ${timeZoneAbbr(zona)}`;
	const profil = printer.find((p) => p.id === aktif) ?? null;
	const lembar = susunan ? susunLembar(susunan.layout.format, profil?.kertas ?? "A4") : null;
	const kertasOk = !lembar || lembar.tidakMuat === null && (!profil || kertasCocok(lembar, profil.kertas));
	const geser = profil ? { x: profil.geser_x, y: profil.geser_y } : { x: 0, y: 0 };
	const event: BadgeEventData | null = susunan
		? { name: susunan.event.name, kv_url: susunan.event.kv_url, rundown_url: `${typeof window === "undefined" ? "" : window.location.origin}/e/${susunan.event.slug}/rundown` }
		: null;

	/**
	 * Memasang lembar di wadah cetak, menunggu huruf dan gambar, lalu mencetak.
	 * Selesai saat `afterprint`, atau 20 detik bila peramban tidak pernah
	 * mengirimnya.
	 */
	const cetakLembar = useCallback(async (isi: BadgeData[]) => {
		setIsiCetak(isi);
		await bingkai();
		await document.fonts.ready;
		const gambar = Array.from(areaCetakRef.current?.querySelectorAll("img") ?? []);
		await Promise.race([
			Promise.all(gambar.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))),
			tidur(8000),
		]);
		if (!areaCetakRef.current?.querySelector(".cetak-lembar")) return false;
		await tidur(150);
		const selesai = new Promise<void>((r) => {
			const cadangan = window.setTimeout(r, 20000);
			window.addEventListener("afterprint", () => { window.clearTimeout(cadangan); r(); }, { once: true });
		});
		window.print();
		await selesai;
		return true;
	}, []);

	const muatRiwayat = useCallback(async (id: number) => {
		const r = await fetch(eventApiPath(`/api/stasiun-cetak/riwayat?stasiun_id=${id}`), { cache: "no-store" }).catch(() => null);
		if (r?.ok) setRiwayat((await r.json()) as Riwayat);
	}, []);

	const putus = useCallback(() => {
		setKoneksi((k) => (k.jenis === "terputus" ? k : { jenis: "terputus", sejak: new Date().toISOString() }));
	}, []);

	/** Jawaban klaim, dipakai Start station, Take over, dan detak jantung saat kertas tidak cocok. */
	const tanganiKlaim = useCallback((r: Jawaban | null): boolean => {
		if (!r) { putus(); return false; }
		if (r.status === 401) { setKoneksi({ jenis: "sesi" }); return false; }
		if (r.status === 409) { setKoneksi(koneksi409(r)); return false; }
		if (!r.ok) { putus(); return false; }
		const b = r.body as { status: string; stasiun_id: number; nama: string; dijeda?: boolean; sejak?: string | null };
		setStasiun({ id: b.stasiun_id, nama: b.nama });
		if (b.status === "dipakai") { setKoneksi({ jenis: "dipakai", sejak: b.sejak ?? null }); return false; }
		setDijeda(Boolean(b.dijeda));
		setKoneksi({ jenis: "ok" });
		return true;
	}, [putus]);

	async function selesai(jobId: number, hasil: "terkirim" | "gagal", galat: string | null) {
		// Dicoba dua kali: laporan yang hilang membuat pekerjaan ini jadi "gagal"
		// oleh sapuan 60 detik, padahal badge-nya sudah keluar.
		for (let i = 0; i < 2; i += 1) {
			const r = await kirimJson("/api/stasiun-cetak/selesai", { job_id: jobId, token, hasil, galat });
			if (r?.ok) return;
			await tidur(1000);
		}
	}

	/** Satu tarikan. `false` bila Tally tidak terjangkau, supaya putaran mundur. */
	async function satuPutaran(): Promise<boolean> {
		if (!stasiun) return true;
		// Kertas tidak cocok, atau dialog terbuka (Cetak uji, profil printer):
		// tetap terlihat tersambung di HP, tetapi tidak mengambil badge. Kertas
		// salah mencetak di tempat yang salah, dan dialog yang terbuka ikut
		// menghalangi petugas melihat apa yang sedang dicetak.
		if (!kertasOk || tanyaUji || dialogPrinter !== null) {
			const k = await kirimJson("/api/stasiun-cetak/klaim", { nama: stasiun.nama, token });
			tanganiKlaim(k);
			return Boolean(k && k.status < 500);
		}
		const r = await kirimJson("/api/stasiun-cetak/ambil", { stasiun_id: stasiun.id, token });
		if (!r) { putus(); return false; }
		if (r.status === 401) { setKoneksi({ jenis: "sesi" }); return true; }
		if (r.status === 409) { setKoneksi(koneksi409(r)); return true; }
		if (!r.ok) { putus(); return false; }
		const b = r.body as {
			status: string;
			sejak?: string | null;
			job?: { id: number; participant_id: string | null; jenis: JenisCetak };
			peserta?: BadgeData | null;
		};
		if (b.status === "lease_hilang") { setKoneksi({ jenis: "dipakai", sejak: b.sejak ?? null }); return true; }
		if (b.status === "tidak_ada") {
			tanganiKlaim(await kirimJson("/api/stasiun-cetak/klaim", { nama: stasiun.nama, token }));
			return true;
		}
		setKoneksi({ jenis: "ok" });
		setDijeda(b.status === "dijeda");
		if (b.status !== "ok" || !b.job) return true;

		const job = b.job;
		sibukRef.current = true;
		try {
			if (!b.peserta) {
				await selesai(job.id, "gagal", "data peserta tidak terbaca");
				setGagalSiap({ nama: null, participant_id: job.participant_id });
				return true;
			}
			setGagalSiap(null);
			setMengirim(b.peserta.name);
			const terkirim = await cetakLembar([b.peserta]);
			await selesai(job.id, terkirim ? "terkirim" : "gagal", terkirim ? null : "badge gagal disiapkan");
			if (!terkirim) setGagalSiap({ nama: b.peserta.name, participant_id: job.participant_id });
		} finally {
			setMengirim(null);
			sibukRef.current = false;
			void muatRiwayat(stasiun.id);
		}
		return true;
	}

	const putaranRef = useRef(satuPutaran);
	useEffect(() => { putaranRef.current = satuPutaran; });

	const berhenti = koneksi.jenis === "sesi" || koneksi.jenis === "dipakai" || koneksi.jenis === "belum" || koneksi.jenis === "tutup";
	const stasiunId = stasiun?.id ?? null;

	// Putaran tarik. Berurutan, bukan setInterval: tarikan berikutnya baru
	// dimulai setelah yang ini (termasuk mencetaknya) selesai. Saat Tally tidak
	// terjangkau jedanya berlipat sampai 15 detik; Try again memulai ulang dari
	// 1,5 detik. Berhenti total saat sesi habis, stasiun dipegang laptop lain,
	// atau acara ditutup: tarikan berikutnya hanya akan ditolak lagi.
	useEffect(() => {
		if (fase !== "jalan" || stasiunId === null || berhenti) return;
		let batal = false;
		let pewaktu = 0;
		let gagal = 0;
		const putar = async () => {
			if (batal) return;
			if (!sibukRef.current) gagal = (await putaranRef.current()) ? 0 : gagal + 1;
			if (!batal) pewaktu = window.setTimeout(putar, Math.min(JEDA_TARIK_MS * 2 ** gagal, JEDA_TARIK_MAKS_MS));
		};
		pewaktu = window.setTimeout(putar, 0);
		return () => { batal = true; window.clearTimeout(pewaktu); };
	}, [fase, stasiunId, berhenti, cobaKe]);

	useEffect(() => {
		if (fase !== "jalan" || stasiunId === null || berhenti) return;
		const timer = window.setTimeout(() => void muatRiwayat(stasiunId), 0);
		const ulang = window.setInterval(() => void muatRiwayat(stasiunId), JEDA_RIWAYAT_MS);
		return () => { window.clearTimeout(timer); window.clearInterval(ulang); };
	}, [fase, stasiunId, berhenti, muatRiwayat]);

	// Tab di belakang: Chrome memperlambat pewaktunya sampai sekali semenit
	// setelah lima menit, dan badge ikut tertahan. Judul tab memberi tahu dari
	// bilah tab, pita memberi tahu saat petugas kembali. Web Lock yang dipegang
	// selama stasiun berjalan mencegah Chrome membekukan atau membuang tab ini.
	useEffect(() => {
		if (fase !== "jalan") return;
		const judulAsli = document.title;
		const cek = () => {
			const sembunyi = document.visibilityState === "hidden";
			if (sembunyi) setTersembunyi(true);
			document.title = sembunyi ? "Bring this tab to the front · Print station" : judulAsli;
		};
		document.addEventListener("visibilitychange", cek);
		let lepas: () => void = () => {};
		const kunci = new Promise<void>((r) => { lepas = r; });
		void navigator.locks?.request("tally-stasiun-cetak", () => kunci).catch(() => {});
		return () => {
			document.removeEventListener("visibilitychange", cek);
			document.title = judulAsli;
			lepas();
		};
	}, [fase]);

	async function mulai() {
		const bersih = nama.trim();
		if (!bersih) { setGalatMulai("Give this station a name."); return; }
		setMemulai(true);
		setGalatMulai("");
		const r = await kirimJson("/api/stasiun-cetak/klaim", { nama: bersih, token });
		setMemulai(false);
		if (!r) { setGalatMulai("No connection to Tally. Check the laptop's Wi-Fi."); return; }
		if (r.status === 401) { setKoneksi({ jenis: "sesi" }); return; }
		if (r.status === 409) {
			setGalatMulai(koneksi409(r).jenis === "tutup"
				? "This event is completed or archived, so it doesn't take new badges."
				: String((r.body.error as { message?: string } | undefined)?.message ?? "Print stations are not active yet."));
			return;
		}
		if (!r.ok) { setGalatMulai("The station could not be started. Try again."); return; }
		simpanNama(bersih);
		tanganiKlaim(r);
		setFase("jalan");
	}

	async function ambilAlih() {
		if (!stasiun) return;
		const r = await kirimJson("/api/stasiun-cetak/klaim", { nama: stasiun.nama, token, ambil_alih: true });
		if (tanganiKlaim(r)) setCobaKe((n) => n + 1);
	}

	async function gantiJeda() {
		if (!stasiun) return;
		const r = await kirimJson("/api/stasiun-cetak/jeda", { stasiun_id: stasiun.id, token, dijeda: !dijeda });
		if (r?.ok) setDijeda(Boolean(r.body.dijeda));
		else if (r?.status === 409) setKoneksi({ jenis: "dipakai", sejak: null });
		else toast.error(dijeda ? "Could not resume" : "Could not pause", "Check the connection and try again.");
	}

	async function cetakUlang(participantId: string | null) {
		if (!stasiun || !participantId) return;
		const r = await kirimJson("/api/stasiun-cetak/pekerjaan", { stasiun_id: stasiun.id, participant_id: participantId });
		if (!r?.ok) {
			toast.error("Not queued", String((r?.body.error as { details?: { message?: string } } | undefined)?.details?.message ?? "Check the connection and try again."));
			return;
		}
		setGagalSiap(null);
		void muatRiwayat(stasiun.id);
	}

	async function cetakUji() {
		if (sibukRef.current || !susunan) return;
		sibukRef.current = true;
		setMengirim(BADGE_UJI.name);
		try {
			await cetakLembar([BADGE_UJI]);
		} finally {
			setMengirim(null);
			sibukRef.current = false;
		}
		setTanyaUji(true);
	}

	function simpanProfil(p: ProfilPrinter) {
		const daftar = printer.some((x) => x.id === p.id) ? printer.map((x) => (x.id === p.id ? p : x)) : [...printer, p];
		setPrinter(daftar);
		simpanPrinter(daftar);
		setAktif(p.id);
		simpanPrinterAktif(p.id);
		setDialogPrinter(null);
	}

	function hapusProfil(id: string) {
		const daftar = printer.filter((x) => x.id !== id);
		setPrinter(daftar);
		simpanPrinter(daftar);
		const berikut = daftar[0]?.id ?? null;
		setAktif(berikut);
		simpanPrinterAktif(berikut);
		setDialogPrinter(null);
	}

	async function salin(jenis: string, teks: string) {
		try {
			await navigator.clipboard.writeText(teks);
			setSalinan(jenis);
			window.setTimeout(() => setSalinan(null), 2000);
		} catch {
			toast.error("Could not copy", "Select the command and copy it by hand.");
		}
	}

	if (!siapBaca) return null;

	const slug = susunan?.event.slug ?? "";
	const alamat = typeof window === "undefined" ? "" : `${window.location.origin}/e/${slug}/stasiun`;
	const winPilih = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir=C:\\TallyStation ${alamat}`;
	const macPilih = `open -na "Google Chrome" --args --user-data-dir=$HOME/TallyStation ${alamat}`;
	const winKiosk = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir=C:\\TallyStation --kiosk-printing ${alamat}`;
	const macKiosk = `open -na "Google Chrome" --args --user-data-dir=$HOME/TallyStation --kiosk-printing ${alamat}`;
	const namaPrinter = profil ? profil.nama || profil.model || "Printer" : null;
	const namaFormat = lembar ? kertasEn(lembar.namaKertas) : "";
	const tidakMuat = tidakMuatEn(lembar?.tidakMuat ?? null);

	// ---- Pita keadaan, urut dari yang paling menghentikan ----------------
	const pita: ReactNode[] = [];
	if (koneksi.jenis === "sesi") {
		pita.push(
			<Pita key="sesi" nada="error" judul="Session expired" aksi={<Button size="md" onClick={() => window.location.assign("/login")}>Sign in again</Button>}>
				Sign in again with the station account. Queued badges are not lost.
			</Pita>,
		);
	}
	if (koneksi.jenis === "belum") {
		pita.push(
			<Pita key="belum" nada="error" judul="Print stations are not active yet">
				The database update for print stations has not been run. Ask the Tally admin.
			</Pita>,
		);
	}
	if (koneksi.jenis === "tutup") {
		pita.push(
			<Pita key="tutup" nada="error" judul="This event is closed">
				Completed or archived events don&apos;t take new badges. Check that this station is open on the right event.
			</Pita>,
		);
	}
	if (fase === "jalan" && koneksi.jenis === "dipakai" && stasiun) {
		pita.push(
			<Pita key="dipakai" nada="error" judul={`${stasiun.nama} is being used by another laptop`} aksi={<Button variant="outlined" size="md" onClick={() => void ambilAlih()}>Take over</Button>}>
				{koneksi.sejak ? `Another laptop has held this name since ${jamZonaLengkap(koneksi.sejak)}, ` : "Another laptop holds this name, "}
				so this laptop stopped printing to avoid duplicate badges.
			</Pita>,
		);
	}
	if (fase === "jalan" && koneksi.jenis === "terputus") {
		pita.push(
			<Pita key="putus" nada="error" judul={`Disconnected from Tally since ${jamZonaLengkap(koneksi.sejak)}`} aksi={<Button variant="outlined" size="md" onClick={() => setCobaKe((n) => n + 1)}>Try again</Button>}>
				Check the laptop&apos;s Wi-Fi. The queue is safe on the server and prints as soon as you&apos;re back online.
			</Pita>,
		);
	}
	if (fase === "jalan" && !kertasOk && lembar) {
		pita.push(
			<Pita key="kertas" nada="error" judul="Paper doesn't match" aksi={<Button variant="outlined" size="md" onClick={() => setFase("pasang")}>Change profile</Button>}>
				{tidakMuat ?? `This badge format prints on ${namaFormat} paper, but ${namaPrinter ?? "this printer"} at this station has ${profil?.kertas}. Change the paper or the printer profile.`}
			</Pita>,
		);
	}
	if (fase === "jalan" && dijeda && koneksi.jenis === "ok") {
		pita.push(
			<Pita key="jeda" nada="warning" judul="Paused" aksi={<Button size="md" icon={<Play size={16} weight="fill" />} onClick={() => void gantiJeda()}>Resume</Button>}>
				Scanners keep checking participants in. Their badges queue and print when you press Resume.
			</Pita>,
		);
	}
	if (gagalSiap) {
		pita.push(
			<Pita
				key="siap"
				nada="error"
				judul={gagalSiap.nama ? `Badge for ${gagalSiap.nama} could not be prepared` : "A badge could not be prepared"}
				aksi={gagalSiap.participant_id ? <Button variant="outlined" size="md" disabled={Boolean(mengirim)} onClick={() => void cetakUlang(gagalSiap.participant_id)}>Try again</Button> : null}
			>
				The participant data could not be read. Try again; if it fails again, ask an admin to check this participant.
			</Pita>,
		);
	}
	if (fase === "jalan" && tersembunyi) {
		pita.push(
			<Pita key="belakang" nada="warning" judul="Keep this tab in front" aksi={<Button variant="outlined" size="md" onClick={() => setTersembunyi(false)}>OK</Button>}>
				This tab went to the background. Chrome slows background tabs, so badges can wait up to a minute. Keep the station tab in front of other tabs and windows.
			</Pita>,
		);
	}
	if (mengirim) {
		pita.push(
			<Pita key="kirim" nada="info" judul={`Sending to printer: ${mengirim}`}>
				One at a time. Wait for the sheet to come out.
			</Pita>,
		);
	}

	const chip =
		koneksi.jenis === "ok"
			? dijeda ? <StatusChip tone="warning" dot>Paused</StatusChip> : <StatusChip tone="success" dot>Connected</StatusChip>
			: koneksi.jenis === "terputus" ? <StatusChip tone="error" dot>Disconnected</StatusChip>
				: <StatusChip tone="error" dot>Stopped</StatusChip>;

	const namaIni = stasiun?.nama ?? "this station";
	const teksHero = mengirim
		? "One badge at a time. The next one starts when this sheet has been sent."
		: koneksi.jenis === "terputus"
			? "Badges keep queuing on the server and print once this laptop is back online."
			: berhenti
				? "This laptop isn't taking badges. See the message above."
				: dijeda
					? "Scanners keep checking participants in. Their badges wait here until you press Resume."
					: !kertasOk
						? "Badges wait until the paper matches the badge format."
						: `Badges go to the printer whenever a scanner that picked ${namaIni} checks in a new participant. Keep this tab in front and the laptop on.`;
	const judulHero = mengirim ? "Sending to printer" : berhenti || koneksi.jenis === "terputus" ? "Not printing" : dijeda ? "Paused" : !kertasOk ? "Not printing" : "Ready to print";

	return (
		<>
			<style>{`
				${lembar ? `@page { size: ${lembar.kertas.w}mm ${lembar.kertas.h}mm; margin: 0; }` : ""}
				.stasiun-cetak { position: fixed; left: -10000px; top: 0; pointer-events: none; }
				@media print {
					html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
					.stasiun-layar { display: none !important; }
					body * { visibility: hidden !important; }
					.stasiun-cetak, .stasiun-cetak * { visibility: visible !important; }
					.stasiun-cetak { position: absolute !important; left: 0 !important; top: 0 !important; }
					.cetak-lembar { box-shadow: none !important; break-after: auto; }
				}
			`}</style>

			<div className="stasiun-layar min-h-dvh bg-surface px-4 py-6 text-on-surface sm:px-8">
				{fase === "pasang" ? (
					<div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-8">
						<section>
							<h1 className="text-headline-medium font-semibold">Make this laptop a print station</h1>
							<p className="mt-2 text-body-large text-on-surface-variant">
								The laptop connected to the printer prints badges for the scanning phones and tablets. Sign in with a scanner account used only for this station.
							</p>

							{pita.length > 0 ? <div className="mt-4 flex flex-col gap-3">{pita}</div> : null}
							{galatMuat ? <div className="mt-4"><Pita nada="error" judul="Layout not loaded">{galatMuat}</Pita></div> : null}

							<TextField
								className="mt-6"
								label="Station name"
								value={nama}
								maxLength={40}
								onChange={(e) => setNama(e.target.value)}
								hint="Phones pick this name under Print station."
							/>

							<SelectField
								className="mt-4"
								label="Printer"
								value={aktif ?? ""}
								onChange={(e) => { const id = e.target.value || null; setAktif(id); simpanPrinterAktif(id); }}
							>
								<option value="">No printer profile (A4, no offset)</option>
								{printer.map((p) => (
									<option key={p.id} value={p.id}>
										{[p.nama || p.model || "Printer", p.kertas, p.dikalibrasi ? "calibrated" : "not calibrated"].join(" · ")}
									</option>
								))}
							</SelectField>
							<div className="mt-2 flex flex-wrap gap-2">
								<Button variant="text" size="sm" onClick={() => setDialogPrinter("baru")}>Add printer</Button>
								{profil ? <Button variant="text" size="sm" onClick={() => setDialogPrinter(profil)}>Edit or calibrate</Button> : null}
							</div>

							{lembar ? (
								kertasOk ? (
									<p className="mt-4 flex items-start gap-2 rounded-lg bg-success-soft px-4 py-3 text-body-medium text-on-success-container">
										<CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
										{profil ? `${profil.kertas} paper matches this badge format (${namaFormat}).` : `This badge format prints on ${namaFormat} paper.`}
									</p>
								) : (
									<p className="mt-4 flex items-start gap-2 rounded-lg bg-error-soft px-4 py-3 text-body-medium text-error">
										<Warning size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
										{tidakMuat ?? `This badge format prints on ${namaFormat} paper, but the printer profile has ${profil?.kertas}.`}
									</p>
								)
							) : null}

							{ujiGagal ? (
								<div className="mt-4">
									<Pita nada="warning" judul="The test badge didn't come out">
										Check that the badge printer is the laptop&apos;s default printer, that it has paper, and that Chrome was opened with the second shortcut. Then press Print test again.
									</Pita>
								</div>
							) : null}

							{galatMulai ? <p role="alert" className="mt-4 text-body-medium text-error">{galatMulai}</p> : null}

							<div className="mt-6 flex flex-wrap gap-3">
								<Button variant="outlined" size="md" disabled={!susunan || !kertasOk || Boolean(mengirim)} onClick={() => void cetakUji()}>Print test</Button>
								<Button size="md" loading={memulai} disabled={!susunan || !kertasOk || !nama.trim()} onClick={() => void mulai()}>Start station</Button>
							</div>
						</section>

						<Card className="!rounded-2xl !px-6 !py-6">
							<h2 className="text-title-large">So badges print without the print dialog</h2>
							<ol className="mt-4 flex list-decimal flex-col gap-4 pl-5 text-body-large">
								<li>
									<span className="font-semibold">Make the badge printer the laptop&apos;s default printer</span>, with the right paper and tray.
								</li>
								<li>
									<span className="font-semibold">Choose the printer (once).</span> Open the station Chrome <em>without</em> kiosk, print one sheet, pick the badge printer, then close that Chrome.
									<Perintah win={winPilih} mac={macPilih} kunci="pilih" salinan={salinan} onSalin={(k, t) => void salin(k, t)} />
								</li>
								<li>
									<span className="font-semibold">Run the station</span> with the second shortcut. Chrome remembers that printer, and from now on badges print without a dialog.
									<Perintah win={winKiosk} mac={macKiosk} kunci="kiosk" salinan={salinan} onSalin={(k, t) => void salin(k, t)} />
								</li>
								<li>
									<span className="font-semibold">Keep the station tab in front</span>, sleep turned off, and the laptop plugged in. Then press <span className="font-semibold">Print test</span>.
								</li>
							</ol>
						</Card>
					</div>
				) : (
					<div className="mx-auto max-w-7xl">
						<header className="flex flex-wrap items-start justify-between gap-4">
							<div className="min-w-0">
								<h1 className="truncate text-headline-medium font-semibold">{stasiun?.nama ?? nama}</h1>
								<p className="mt-1 text-body-large text-on-surface-variant">
									{["Print station", susunan?.event.name, lembar ? `${namaFormat} paper` : null, namaPrinter].filter(Boolean).join(" · ")}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{chip}
								<Button variant="outlined" size="md" disabled={Boolean(mengirim) || berhenti} onClick={() => void cetakUji()}>Print test</Button>
								{koneksi.jenis === "ok" && !dijeda ? (
									<Button variant="outlined" size="md" icon={<Pause size={16} weight="fill" />} onClick={() => void gantiJeda()}>
										Pause
									</Button>
								) : null}
								<Button variant="text" size="md" onClick={() => setFase("pasang")}>Station settings</Button>
							</div>
						</header>

						{pita.length > 0 ? <div className="mt-6 grid gap-3 lg:grid-cols-2">{pita}</div> : null}

						<div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
							<section className="flex min-h-80 flex-col items-center justify-center rounded-2xl bg-primary-soft px-6 py-10 text-center text-on-primary-soft">
								<span className="flex size-20 items-center justify-center rounded-full bg-primary text-on-primary">
									<Printer size={36} aria-hidden />
								</span>
								<h2 className="mt-4 text-headline-small font-semibold">{judulHero}</h2>
								<p className="mt-2 max-w-xl text-body-large opacity-80">{teksHero}</p>
								<dl className="mt-8 flex flex-wrap justify-center gap-x-12 gap-y-4">
									<div>
										<dt className="sr-only">Sent to printer today</dt>
										<dd className="text-display-small font-semibold tabular-nums">{riwayat?.terkirim_hari_ini ?? 0}</dd>
										<dd className="text-body-large opacity-80">sent to printer today</dd>
									</div>
									<div>
										<dt className="sr-only">Waiting</dt>
										<dd className="text-display-small font-semibold tabular-nums">{riwayat?.menunggu ?? 0}</dd>
										<dd className="text-body-large opacity-80">waiting</dd>
									</div>
								</dl>
							</section>

							<Card variant="outlined" padded={false} className="!rounded-2xl">
								<div className="border-b border-outline-variant px-5 py-4">
									<h2 className="text-title-medium">Recent prints <span className="text-body-medium font-normal text-on-surface-variant">· times in {timeZoneAbbr(zona)}</span></h2>
									<p className="mt-1 text-body-medium text-on-surface-variant">Badge didn&apos;t come out or paper ran out? Fix the printer, then press Print again.</p>
								</div>
								{riwayat && riwayat.baris.length > 0 ? (
									<ul className="divide-y divide-outline-variant">
										{riwayat.baris.map((b) => {
											const s = STATUS_BARIS[b.status];
											const teks = b.status === "terkirim" && b.jenis === "ulang" ? "Sent again" : s.teks;
											return (
												<li key={b.id} className="flex items-start gap-3 px-5 py-3">
													<span className="w-12 shrink-0 pt-0.5 text-body-medium tabular-nums text-on-surface-variant">{jamZona(b.created_at)}</span>
													<span className="min-w-0 flex-1">
														<span className="line-clamp-2 text-body-large font-medium [overflow-wrap:break-word]">{b.jenis === "uji" ? "Test badge" : b.nama ?? "Participant removed"}</span>
														{b.asal ? <span className="block truncate text-body-medium text-on-surface-variant">{b.asal}</span> : null}
													</span>
													<span className="flex shrink-0 flex-col items-end gap-1">
														<StatusChip tone={s.tone} title={b.galat ?? undefined}>{teks}</StatusChip>
														{b.participant_id ? (
															<Button variant="text" size="sm" disabled={Boolean(mengirim) || b.status === "antre" || b.status === "diambil" || berhenti} onClick={() => void cetakUlang(b.participant_id)}>
																Print again
															</Button>
														) : null}
													</span>
												</li>
											);
										})}
									</ul>
								) : (
									<p className="px-5 py-8 text-body-medium text-on-surface-variant">No badges printed yet. Badges appear here as scanners check participants in.</p>
								)}
							</Card>
						</div>
					</div>
				)}
			</div>

			{/* Wadah cetak: di luar layar, ditampilkan sendirian oleh @media print. */}
			<div ref={areaCetakRef} className="stasiun-cetak" aria-hidden>
				{isiCetak && susunan && lembar && event ? (
					<LembarBadge
						className="cetak-lembar relative overflow-hidden bg-white"
						layout={susunan.layout}
						lembar={lembar}
						isi={isiCetak}
						event={event}
						hari={susunan.rundown}
						hariIni={hariIniDi(zona)}
						geser={geser}
					/>
				) : null}
			</div>

			<Dialog
				open={tanyaUji}
				onClose={() => setTanyaUji(false)}
				title="Did the test badge come out of the printer?"
				description={'Tally only knows the badge was sent, not that it printed. Check the printer: the test sheet has a badge named "Test Badge".'}
				actions={
					<>
						<Button variant="text" size="md" onClick={() => { setTanyaUji(false); setUjiGagal(true); }}>No, nothing came out</Button>
						<Button size="md" onClick={() => { setTanyaUji(false); setUjiGagal(false); toast.success("Printer ready", "Badges from scanners will print here."); }}>Yes, it came out</Button>
					</>
				}
			/>

			{dialogPrinter ? (
				<PrinterDialog
					awal={dialogPrinter === "baru" ? null : dialogPrinter}
					slug={slug}
					onClose={() => setDialogPrinter(null)}
					onSimpan={simpanProfil}
					onHapus={hapusProfil}
				/>
			) : null}
		</>
	);
}

function Pita({ nada, judul, aksi, children }: { nada: "error" | "warning" | "info"; judul: string; aksi?: ReactNode; children: ReactNode }) {
	const warna = nada === "error" ? "bg-error-soft text-error" : nada === "warning" ? "bg-warning-soft text-warning" : "bg-primary-soft text-on-primary-soft";
	return (
		<div role={nada === "error" ? "alert" : "status"} className={`flex flex-wrap items-center gap-4 rounded-2xl px-5 py-4 ${warna}`}>
			<Printer size={22} className="shrink-0 self-start" aria-hidden />
			<div className="min-w-0 flex-1">
				<p className="text-title-medium font-semibold">{judul}</p>
				<p className="mt-0.5 text-body-medium">{children}</p>
			</div>
			{aksi ? <div className="shrink-0">{aksi}</div> : null}
		</div>
	);
}

/** Perintah Windows (terlihat) dan Mac (di bawahnya), masing-masing dengan tombol salin. */
function Perintah({ win, mac, kunci, salinan, onSalin }: { win: string; mac: string; kunci: string; salinan: string | null; onSalin: (kunci: string, teks: string) => void }) {
	return (
		<>
			<pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-inverse-surface px-4 py-3 font-mono text-body-small text-inverse-on-surface">{win}</pre>
			<p className="mt-2 break-all font-mono text-body-small text-on-surface-variant">Mac: {mac}</p>
			<div className="mt-2 flex flex-wrap gap-2">
				<Button variant="text" size="sm" icon={<Copy size={16} />} onClick={() => onSalin(`${kunci}-win`, win)}>{salinan === `${kunci}-win` ? "Copied" : "Copy for Windows"}</Button>
				<Button variant="text" size="sm" icon={<Copy size={16} />} onClick={() => onSalin(`${kunci}-mac`, mac)}>{salinan === `${kunci}-mac` ? "Copied" : "Copy for Mac"}</Button>
			</div>
		</>
	);
}
