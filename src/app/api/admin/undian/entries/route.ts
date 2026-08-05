import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { MAX_ROWS, parseEntryText, parseEntryXlsx, type ParsedEntry } from "@/lib/undian-import";

// Daftar entri manual dan hasil import.
//
// Sumber data kedua di samping tabel peserta, untuk kasus yang tidak tercakup
// sistem: kupon fisik dari meja registrasi, daftar karyawan sponsor, atau nomor
// kursi polos.
//
// Menerima DUA bentuk permintaan pada endpoint yang sama:
//   * JSON     — teks yang ditempel operator
//   * FormData — berkas XLSX atau CSV yang diunggah
//
// Satu endpoint, bukan dua, karena keduanya berakhir pada tabel dan aturan
// validasi yang sama. Memisahkannya berarti menggandakan pembuatan grup, batas
// jumlah baris, penulisan audit, dan penanganan kegagalan — dan begitu salah satu
// diubah, keduanya berbeda tanpa ada yang menyadarinya.
//
// Semua parsing dikerjakan DI SERVER, termasuk XLSX. Lihat src/lib/undian-import.ts.

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const jsonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(300).nullable().optional(),
  // Teks mentah: CSV, TSV, atau satu nama per baris. Formatnya dideteksi.
  text: z.string().max(1_000_000),
});

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();
  const { data: groups, error } = await client
    .from("undian_entry_groups")
    .select("id,name,note,created_at")
    .order("id", { ascending: false });
  if (error) return apiError("INTERNAL_ERROR", 500);

  // Jumlah baris per grup dihitung dalam satu query, bukan satu per grup.
  const { data: rows } = await client.from("undian_entries").select("group_id").eq("is_active", true);
  const counts: Record<number, number> = {};
  for (const row of (rows ?? []) as { group_id: number }[]) counts[row.group_id] = (counts[row.group_id] ?? 0) + 1;

  return Response.json({
    groups: ((groups ?? []) as { id: number }[]).map((group) => ({ ...group, entry_count: counts[group.id] ?? 0 })),
  });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const contentType = request.headers.get("content-type") ?? "";
  const input = contentType.includes("multipart/form-data")
    ? await readFileRequest(request)
    : await readJsonRequest(request);
  if ("response" in input) return input.response;

  const { name, note, rows, source } = input;

  if (rows.length === 0) {
    return apiError("VALIDATION_ERROR", 422, {
      fieldErrors: {
        [source]: [
          source === "file"
            ? "Tidak ada baris yang terbaca. Pastikan kolom pertama berisi nama, atau unduh templatnya."
            : "Tidak ada baris yang terbaca.",
        ],
      },
    });
  }
  if (rows.length > MAX_ROWS) {
    return apiError("VALIDATION_ERROR", 422, { fieldErrors: { [source]: [`Maksimal ${MAX_ROWS} baris per daftar.`] } });
  }

  const client = getSupabaseServiceClient();
  const { data: group, error: groupError } = await client
    .from("undian_entry_groups")
    .insert({ name, note: note?.trim() || null, created_by: auth.user.id } as never)
    .select("id,name,note,created_at")
    .single();
  if (groupError || !group) return apiError("INTERNAL_ERROR", 500);

  const groupId = (group as { id: number }).id;
  const { error: rowError } = await client
    .from("undian_entries")
    .insert(rows.map((row) => ({ ...row, group_id: groupId })) as never);
  if (rowError) {
    // Grup tanpa baris adalah jebakan: ia muncul di daftar pilihan, dipilih untuk
    // sebuah hadiah, lalu menghasilkan kolam kosong tanpa penjelasan. Lebih baik
    // dibatalkan seluruhnya.
    await client.from("undian_entry_groups").delete().eq("id", groupId);
    return apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "undian_entry_import",
    payload: { old: null, new: { group, entry_count: rows.length, source } },
  } as never);

  return Response.json({ ...(group as object), entry_count: rows.length }, { status: 201 });
}

type ReadResult =
  | { name: string; note: string | null; rows: ParsedEntry[]; source: "text" | "file" }
  | { response: Response };

async function readJsonRequest(request: Request): Promise<ReadResult> {
  const parsed = jsonSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { response: apiError("VALIDATION_ERROR", 422, parsed.error.flatten()) };
  return {
    name: parsed.data.name,
    note: parsed.data.note ?? null,
    rows: parseEntryText(parsed.data.text),
    source: "text",
  };
}

async function readFileRequest(request: Request): Promise<ReadResult> {
  const form = await request.formData().catch(() => null);
  if (!form) return { response: apiError("VALIDATION_ERROR", 422, { fieldErrors: { file: ["Berkas tidak terbaca."] } }) };

  const rawName = form.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name || name.length > 120) {
    return { response: apiError("VALIDATION_ERROR", 422, { fieldErrors: { name: ["Nama daftar wajib diisi."] } }) };
  }
  const rawNote = form.get("note");
  const note = typeof rawNote === "string" ? rawNote.trim() : "";

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { response: apiError("VALIDATION_ERROR", 422, { fieldErrors: { file: ["Berkas tidak ditemukan."] } }) };
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    return { response: apiError("VALIDATION_ERROR", 422, { fieldErrors: { file: ["Ukuran berkas maksimal 10 MB."] } }) };
  }

  // Jenis berkas ditentukan dari EKSTENSI, bukan dari `file.type`.
  //
  // MIME type yang dikirim peramban untuk berkas Excel tidak dapat diandalkan: ia
  // berbeda antar sistem operasi, dan pada Windows tanpa Excel terpasang sering
  // datang sebagai string kosong atau `application/octet-stream`. Menolak
  // berdasarkan MIME akan menolak berkas yang sebenarnya sah.
  const lower = file.name.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xlsm");
  const isText = lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv");

  if (lower.endsWith(".xls")) {
    // Format biner Excel lama; exceljs tidak membacanya. Disebut terpisah karena
    // "format tidak didukung" tidak memberi tahu apa yang harus dilakukan.
    return {
      response: apiError("VALIDATION_ERROR", 422, {
        fieldErrors: { file: ["Format .xls lama tidak didukung. Buka di Excel lalu Save As .xlsx."] },
      }),
    };
  }
  if (!isXlsx && !isText) {
    return {
      response: apiError("VALIDATION_ERROR", 422, {
        fieldErrors: { file: ["Format harus .xlsx, .csv, atau .txt."] },
      }),
    };
  }

  if (isXlsx) {
    const result = await parseEntryXlsx(await file.arrayBuffer());
    if ("error" in result) {
      return {
        response: apiError("VALIDATION_ERROR", 422, {
          fieldErrors: { file: ["Berkas Excel tidak terbaca. Pastikan berkasnya tidak rusak atau terproteksi kata sandi."] },
        }),
      };
    }
    return { name, note: note || null, rows: result, source: "file" };
  }

  return { name, note: note || null, rows: parseEntryText(await file.text()), source: "file" };
}
