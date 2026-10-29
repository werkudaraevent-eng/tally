import { getMemberSession } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { bolehPantau, POLA_KUNCI_TITIK } from "@/lib/member/akses-panitia";
import { tanggalDiZona } from "@/lib/checkpoint/waktu";
import { hitungPantau, rincianPantau } from "@/lib/pantau-checkin";
import { muatBahanPantau } from "@/lib/pantau-checkin-server";
import { jawabanPeserta } from "@/lib/sasaran-bagian";
import { KOLOM_HOTEL } from "@/lib/sasaran-blok";
import { normalizeTimeZone } from "@/lib/timezone";

/**
 * Kehadiran untuk panitia di portal (lib/member/akses-panitia.ts).
 *
 * GET tanpa `titik`: satu baris per titik check-in, angka sama dengan kartu
 * Check-ins by checkpoint di Dashboard admin. `?titik=cp-12`: orangnya, belum
 * dan sudah. Hanya nama, unit, kelompok (jawaban pertanyaan yang dipakai Who
 * sees it baris Agenda titik itu, mis. Batch), dan jam pencatatan pertama.
 * Email, telepon, kode QR, dan jawaban lain tidak pernah ikut.
 *
 * Aksesnya diperiksa ulang di setiap permintaan dari sesi peserta: Tipe yang
 * diubah atau dicabut admin langsung berlaku pada pembaruan 30 detik berikutnya.
 */
export const dynamic = "force-dynamic";

const TANPA_SIMPAN = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const { event, member, response } = await requireMemberEvent(request);
  if (response) return response;
  const lang = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "id";
  const sesi = await getMemberSession(event);
  if (!sesi) return memberError("UNAUTHENTICATED", 401, lang === "en" ? "Sign in again to see attendance." : "Masuk lagi untuk melihat kehadiran.");
  const zona = normalizeTimeZone(event.time_zone);
  const setelan = bolehPantau(member, sesi.participant, event, tanggalDiZona(new Date(), zona));
  if (!setelan) return memberError("FORBIDDEN", 403, lang === "en" ? "Attendance is only for the organising committee." : "Kehadiran hanya untuk panitia acara ini.");

  const titik = new URL(request.url).searchParams.get("titik");
  if (titik !== null && (!POLA_KUNCI_TITIK.test(titik) || setelan.hidden.includes(titik))) {
    return memberError("NOT_FOUND", 404, lang === "en" ? "This check-in point is not available." : "Titik ini tidak tersedia.");
  }

  const sekarang = new Date();
  const dimuat = await muatBahanPantau(event, sekarang, { orang: titik !== null });
  if (!dimuat) return memberError("INTERNAL_ERROR", 500, lang === "en" ? "Attendance could not be loaded. Try again." : "Kehadiran belum bisa dimuat. Coba lagi.");

  const rows = hitungPantau(dimuat.bahan)
    .filter((baris) => !setelan.hidden.includes(baris.key))
    .map((baris) => ({
      key: baris.key,
      nama: baris.nama,
      tempat: baris.tempat,
      tanggal: baris.tanggal,
      jam: baris.jam,
      diharapkan: baris.diharapkan,
      sudah: baris.sudah,
      lainnya: baris.lainnya,
      terakhir: baris.terakhir,
      aktif: baris.aktif,
    }));
  const dasar = { time_zone: zona, updated_at: sekarang.toISOString() };
  if (titik === null) return Response.json({ rows, ...dasar }, { headers: TANPA_SIMPAN });

  const baris = rows.find((isi) => isi.key === titik);
  const rinci = rincianPantau(dimuat.bahan, titik);
  if (!baris || !rinci) return memberError("NOT_FOUND", 404, lang === "en" ? "This check-in point is not available." : "Titik ini tidak tersedia.");

  // Kelompok = jawaban pertanyaan yang dipakai Who sees it baris Agenda titik
  // ini (Batch untuk titik kumpul per batch). Hotel tidak: itu data menginap.
  const cp = titik.startsWith("cp-") ? dimuat.checkpoints.find((isi) => `cp-${isi.id}` === titik) : null;
  const kunciKelompok = [
    ...new Set(
      (cp?.agenda_item_ids ?? [])
        .flatMap((id) => dimuat.bahan.agenda.get(id)?.syarat ?? [])
        .map((syarat) => syarat.field)
        .filter((field) => field && field !== KOLOM_HOTEL),
    ),
  ];
  const orang = (id: string, at: string | null) => {
    const isi = dimuat.orang.get(id);
    const kelompok = kunciKelompok.map((key) => jawabanPeserta(isi?.extra, key)).filter(Boolean).join(" · ");
    return { nama: isi?.name ?? "", unit: isi?.company?.trim() || null, kelompok: kelompok || null, at };
  };
  const urutNama = (a: { nama: string }, b: { nama: string }) => a.nama.localeCompare(b.nama, "id");
  return Response.json(
    {
      row: baris,
      belum: rinci.belum.map((id) => orang(id, null)).sort(urutNama),
      // Yang terbaru di atas: panitia di meja melihat siapa yang baru lewat.
      sudah: rinci.sudah.map((isi) => orang(isi.id, isi.at)).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
      ...dasar,
    },
    { headers: TANPA_SIMPAN },
  );
}
