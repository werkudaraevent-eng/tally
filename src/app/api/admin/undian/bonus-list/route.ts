import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BONUS_LIST_MAX } from "@/lib/undian";
import { matchBonusRows, rowsToBonusKeys, type BonusParticipant } from "@/lib/undian-bonus-list";
import { textToRows, xlsxToRows } from "@/lib/undian-import";

// Cek daftar tiket tambahan: cocokkan berkas panitia ke peserta acara.
//
// TIDAK MENYIMPAN APA PUN. Hasilnya (id peserta yang cocok) dibawa layar ke
// aturan hadiah dan baru tersimpan lewat "Simpan hadiah", bersama perubahan
// hadiah lainnya. Karena itu panitia bisa upload, melihat 3 baris yang tidak
// ditemukan, memperbaiki Excel-nya, lalu upload ulang tanpa meninggalkan daftar
// setengah jadi di database.
//
// Dua bentuk permintaan:
//   multipart  berkas .xlsx / .csv / .txt -> hasil pencocokan per baris.
//   JSON       { participant_ids } -> nama peserta itu, untuk "Lihat nama".

// 5.000 baris CSV sekitar 200 KB, xlsx lebih kecil lagi. Di bawah batas body
// proxy Next (10 MB), supaya berkas besar mendapat pesan ini, bukan 500.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const idsSchema = z.object({ participant_ids: z.array(z.string().uuid()).max(BONUS_LIST_MAX) });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const isFile = (request.headers.get("content-type") ?? "").includes("multipart/form-data");

  if (!isFile) {
    const parsed = idsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
    const people = await eventParticipants(eventId);
    if (!people) return apiError("INTERNAL_ERROR", 500);
    const wanted = new Set(parsed.data.participant_ids);
    const found = people
      .filter((person) => wanted.has(person.id))
      .map((person) => ({ participant_id: person.id, name: person.name, company: person.company }))
      .sort((a, b) => a.name.localeCompare(b.name));
    // Peserta yang sudah dihapus dari acara sejak daftar diupload dihitung,
    // supaya angka di kartu aturan dan daftar nama tidak tampak tidak cocok.
    return Response.json({ participants: found, gone: wanted.size - found.length });
  }

  // Ditolak dari header sebelum body dibaca: body di atas batas proxy terpotong
  // dan formData() menggantung sampai koneksi putus.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 64 * 1024) return fileError("Ukuran berkas maksimal 5 MB.");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fileError("Berkas tidak ditemukan.");
  if (file.size === 0 || file.size > MAX_FILE_BYTES) return fileError("Ukuran berkas maksimal 5 MB.");

  // Jenis berkas dari ekstensi, sama seperti impor Daftar import: MIME type
  // berkas Excel tidak dapat diandalkan antar sistem operasi.
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xls")) return fileError("Format .xls lama tidak didukung. Buka di Excel lalu Save As .xlsx.");
  const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xlsm");
  const isText = lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv");
  if (!isXlsx && !isText) return fileError("Format harus .xlsx atau .csv.");

  const rows = isXlsx ? await xlsxToRows(await file.arrayBuffer()) : textToRows(await file.text());
  if (!rows) return fileError("Berkas tidak terbaca. Pastikan berkasnya .xlsx yang bisa dibuka di Excel.");
  const keys = rowsToBonusKeys(rows);
  if (!keys) return fileError("Kolom QR atau Email tidak ditemukan. Pakai judul kolom dari templat.");
  if (keys.length === 0) return fileError("Tidak ada baris yang terbaca. Unduh templatnya lalu isi kolom QR atau Email.");
  if (keys.length > BONUS_LIST_MAX) return fileError(`Maksimal ${BONUS_LIST_MAX.toLocaleString("id-ID")} baris per daftar.`);

  const people = await eventParticipants(eventId);
  if (!people) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ file_name: file.name, ...matchBonusRows(keys, people) });
}

function fileError(message: string) {
  return apiError("VALIDATION_ERROR", 422, { fieldErrors: { file: [message] } });
}

/**
 * Peserta acara yang masih terdaftar, dibaca per 1.000 baris (batas baca
 * tabel). Keyset pada id supaya peserta yang ditambah di tengah pembacaan tidak
 * membuat satu orang terbaca dua kali.
 */
async function eventParticipants(eventId: string): Promise<BonusParticipant[] | null> {
  const client = getSupabaseServiceClient();
  const people: BonusParticipant[] = [];
  const PAGE = 1000;
  let after: string | null = null;
  for (;;) {
    let query = client
      .from("participants")
      .select("id,name,company,qr_code,email")
      .eq("event_id", eventId)
      .is("source_removed_at", null)
      .order("id")
      .limit(PAGE);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) return null;
    const page = (data ?? []) as BonusParticipant[];
    people.push(...page);
    if (page.length < PAGE) return people;
    after = page[page.length - 1].id;
  }
}
