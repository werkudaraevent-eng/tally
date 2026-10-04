import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { HasilCetakMeja, JenisCetak, ModeCetakMeja, PekerjaanCetak, StasiunRingkas, StatusAntrean } from "./stasiun";

/**
 * Separuh server stasiun cetak. Semua keputusan antrean ada di fungsi database
 * migrasi 202610040009 (klaim, ambil, selesai, antrekan, pindah); di sini hanya
 * membaca dan membentuk jawabannya.
 */

type BarisStasiun = { id: number; nama: string; lease_until: string | null; last_seen_at: string | null; dijeda: boolean };
type BarisPekerjaan = {
	id: number;
	jenis: JenisCetak;
	status: StatusAntrean;
	galat: string | null;
	participant_id: string | null;
	stasiun_id: number;
	created_at: string;
	selesai_at: string | null;
};

const KOLOM_PEKERJAAN = "id,jenis,status,galat,participant_id,stasiun_id,created_at,selesai_at";

/** Tabel 202610040009 belum ada di database ini. */
export function stasiunBelumAda(error: { code?: string; message?: string } | null, status?: number): boolean {
	if (!error) return false;
	if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") return true;
	if (/badge_stasiun|badge_cetak|cetak_kedaluwarsa_menit/.test(error.message ?? "")) return true;
	return status === 404 && !error.code;
}

export function ringkasStasiun(baris: BarisStasiun, sekarang = Date.now()): StasiunRingkas {
	return {
		id: baris.id,
		nama: baris.nama,
		online: Boolean(baris.lease_until && Date.parse(baris.lease_until) > sekarang),
		dijeda: baris.dijeda,
		terakhir: baris.last_seen_at,
	};
}

/**
 * Setelan meja acara ini: badge kertas dicetak di meja (`di_meja`) dan batas
 * umur antrean. `siap: false` bila migrasi 0009 belum dijalankan.
 */
export async function setelanMeja(eventId: string): Promise<{ badge: boolean; menit: number; siap: boolean }> {
	const client = getSupabaseServiceClient();
	const { data, error } = await client.from("badge_settings").select("di_meja,cetak_kedaluwarsa_menit").eq("event_id", eventId).maybeSingle();
	if (error) {
		// Kolom batas umur belum ada: badge tetap bisa dipilih di admin, tetapi
		// stasiun belum siap. Dibaca ulang tanpa kolom itu supaya HP tahu bedanya.
		const ulang = await client.from("badge_settings").select("di_meja").eq("event_id", eventId).maybeSingle();
		return { badge: Boolean((ulang.data as { di_meja?: boolean } | null)?.di_meja), menit: 10, siap: false };
	}
	const baris = data as { di_meja?: boolean; cetak_kedaluwarsa_menit?: number } | null;
	return { badge: Boolean(baris?.di_meja), menit: baris?.cetak_kedaluwarsa_menit ?? 10, siap: true };
}

export async function daftarStasiun(eventId: string): Promise<StasiunRingkas[] | null> {
	const { data, error } = await getSupabaseServiceClient()
		.from("badge_stasiun")
		.select("id,nama,lease_until,last_seen_at,dijeda")
		.eq("event_id", eventId)
		.order("nama", { ascending: true });
	if (error) return null;
	const sekarang = Date.now();
	return ((data ?? []) as BarisStasiun[]).map((baris) => ringkasStasiun(baris, sekarang));
}

/**
 * Kedaluwarsa seluruh acara, dihitung database (badge_cetak_sapu).
 *
 * Stasiun hanya menyapu antreannya sendiri saat menarik, jadi antrean stasiun
 * yang mati tidak pernah ditandai. Dipanggil sebelum HP atau stasiun membaca
 * status, supaya "Expired" di layar selalu berarti baris yang memang sudah
 * kedaluwarsa menurut jam database, tidak pernah tebakan jam ponsel.
 */
export async function sapuKedaluwarsa(eventId: string) {
	await getSupabaseServiceClient().rpc("badge_cetak_sapu" as never, { p_event_id: eventId } as never);
}

/** Pekerjaan dengan status terbaru, setelah sapuan kedaluwarsa. */
export async function muatPekerjaan(eventId: string, ids: number[]): Promise<PekerjaanCetak[]> {
	if (ids.length === 0) return [];
	await sapuKedaluwarsa(eventId);
	const client = getSupabaseServiceClient();
	const { data } = await client.from("badge_cetak_antrean").select(KOLOM_PEKERJAAN).eq("event_id", eventId).in("id", ids);
	return bentukPekerjaan(eventId, (data ?? []) as BarisPekerjaan[]);
}

/** Pekerjaan terakhir seorang peserta, untuk pemindaian ulang: "sudah terkirim 10.42 di Stasiun 1". */
export async function pekerjaanTerakhir(eventId: string, participantId: string): Promise<PekerjaanCetak | null> {
	await sapuKedaluwarsa(eventId);
	const { data } = await getSupabaseServiceClient()
		.from("badge_cetak_antrean")
		.select(KOLOM_PEKERJAAN)
		.eq("event_id", eventId)
		.eq("participant_id", participantId)
		.order("created_at", { ascending: false })
		.limit(1);
	const [pekerjaan] = await bentukPekerjaan(eventId, (data ?? []) as BarisPekerjaan[]);
	return pekerjaan ?? null;
}

async function bentukPekerjaan(eventId: string, baris: BarisPekerjaan[]): Promise<PekerjaanCetak[]> {
	if (baris.length === 0) return [];
	const client = getSupabaseServiceClient();
	const stasiunIds = [...new Set(baris.map((b) => b.stasiun_id))];
	const { data: stasiun } = await client.from("badge_stasiun").select("id,nama,lease_until,last_seen_at,dijeda").eq("event_id", eventId).in("id", stasiunIds);
	const sekarang = Date.now();
	const peta = new Map(((stasiun ?? []) as BarisStasiun[]).map((s) => [s.id, ringkasStasiun(s, sekarang)]));
	return baris.map((b) => ({
		id: b.id,
		jenis: b.jenis,
		status: b.status,
		galat: b.galat,
		participant_id: b.participant_id,
		created_at: b.created_at,
		selesai_at: b.selesai_at,
		stasiun: peta.get(b.stasiun_id) ?? { id: b.stasiun_id, nama: "?", online: false, dijeda: false, terakhir: null },
	}));
}

/** Teks galat database -> kalimat untuk petugas. Tetap Inggris: UI baru memakai bahasa Inggris. */
export function pesanGalatStasiun(pesan: string): string {
	if (pesan.includes("STASIUN_NOT_FOUND")) return "That print station no longer exists. Pick another one.";
	if (pesan.includes("STASIUN_OFFLINE")) return "That print station is not connected.";
	if (pesan.includes("PARTICIPANT_NOT_FOUND")) return "Participant not found in this event.";
	return "The badge could not be queued.";
}

/**
 * Mengantrekan badge. Dipakai route scan dan walk-in (`otomatis`) serta tombol
 * Cetak ulang (`ulang`). Tidak pernah melempar: kehadiran sudah tersimpan saat
 * ini dipanggil, dan gagal mengantrekan badge tidak boleh menggagalkannya.
 */
export async function antrekan(input: {
	eventId: string;
	stasiunId: number;
	participantId: string | null;
	jenis: JenisCetak;
	userId: string;
	laneId: number | null;
}): Promise<HasilCetakMeja> {
	const { data, error } = await getSupabaseServiceClient().rpc("badge_cetak_antrekan" as never, {
		p_event_id: input.eventId,
		p_stasiun_id: input.stasiunId,
		p_participant_id: input.participantId,
		p_jenis: input.jenis,
		p_user: input.userId,
		p_lane_id: input.laneId,
	} as never);
	if (error) return { pekerjaan: null, galat: pesanGalatStasiun(String(error.message ?? "")) };
	const hasil = data as { baru: boolean; job_id: number };
	const [pekerjaan] = await muatPekerjaan(input.eventId, [hasil.job_id]);
	return { pekerjaan: pekerjaan ?? null, baru: hasil.baru };
}

/**
 * Bagian cetak dari route scan dan walk-in.
 *
 * `cetak` datang dari HP: stasiun yang dipilih dan mode cetak otomatisnya.
 * Server tetap memeriksa setelan acara: badge kertas harus dipilih sebagai yang
 * dicetak di meja registrasi. Pemindaian ulang tidak mengantrekan apa pun; ia
 * membawa pekerjaan terakhir peserta itu supaya HP bisa menulis "sudah terkirim".
 */
export async function cetakSetelahHadir(input: {
	eventId: string;
	cetak: { stasiun_id: number; mode: ModeCetakMeja } | null | undefined;
	status: string;
	participantId: string | null;
	userId: string;
	laneId: number | null;
}): Promise<HasilCetakMeja | null> {
	const { cetak, status, participantId } = input;
	if (!cetak || !participantId) return null;
	const setelan = await setelanMeja(input.eventId);
	if (!setelan.badge || !setelan.siap) return null;

	const baru = status === "recorded" || status === "created";
	const perlu = cetak.mode === "semua" ? baru : cetak.mode === "walkin" ? status === "created" : false;
	if (perlu) {
		return antrekan({ eventId: input.eventId, stasiunId: cetak.stasiun_id, participantId, jenis: "otomatis", userId: input.userId, laneId: input.laneId });
	}
	return { pekerjaan: await pekerjaanTerakhir(input.eventId, participantId) };
}
