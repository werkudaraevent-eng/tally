import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { drawWinners, normalizePrize, shuffle, type Candidate, type UndianPrize } from "@/lib/undian";
import { buildPool } from "@/lib/undian-pool";
import { PRIZE_COLUMNS } from "../../admin/undian/prizes/route";

// Kontrol undian. Admin saja. Layar panggung membaca lewat GET /api/undian/state.
//
// -------------------------------------------------------------------------
// ATURAN PALING PENTING DI SELURUH FITUR INI
// -------------------------------------------------------------------------
// Pemenang ditentukan DI SINI, di server, pada saat tombol ditekan, lalu disimpan
// di undian_state.pending. Ia TIDAK dikirim ke klien mana pun sampai now() >=
// reveal_at.
//
// Animasi roda dan slot di layar hanyalah teater. Kalau nama pemenang dikirim
// lebih awal dan hanya disembunyikan oleh animasi di browser, siapa pun yang
// membuka /undian di laptopnya sendiri melihat pemenang di tab Network sebelum MC
// menyebutnya — dan pada acara dengan hadiah bernilai, itu bukan kemungkinan
// teoretis. Alasan yang sama dengan /api/display/reveal.

const ROW = "mode,active_prize_id,phase,draw_round,spin_started_at,reveal_at,pending,pool,pool_frozen_at,pool_size,session_id,updated_at";

type StateRow = {
  mode: "off" | "live";
  active_prize_id: number | null;
  phase: "idle" | "spinning" | "revealed";
  draw_round: number;
  spin_started_at: string | null;
  reveal_at: string | null;
  pending: PendingDraw | null;
  pool: Candidate[] | null;
  pool_frozen_at: string | null;
  pool_size: number;
  session_id: number | null;
  updated_at: string;
};

/** Isi kolom `pending`: hasil undian yang menunggu waktu tampil. */
type PendingDraw = {
  prize_id: number;
  draw_round: number;
  /**
   * ID baris `undian_winners` milik undian INI.
   *
   * Layar wajib memakai daftar ini, bukan pasangan (prize_id, draw_round).
   * `draw_round` bukan penanda unik: ia tersimpan di baris singleton
   * `undian_state` dan TIDAK direset oleh "bersihkan tampilan" maupun penutupan
   * sesi — hanya oleh penghapusan baris state. Jadi undian pertama di sesi malam
   * juga bernomor 1, tepat seperti undian pertama di sesi siang, dan mengambil
   * pemenang berdasarkan nomor ronde memunculkan KEDUA rombongan sekaligus:
   * hadiah berkuota 10 tampil dengan 20 kartu di layar panggung.
   *
   * Menambahkan session_id ke query tidak cukup, karena undian yang dijalankan
   * tanpa sesi aktif semuanya bernomor ronde 1 dengan session_id null.
   *
   * ID baris tidak pernah bertabrakan, jadi tidak ada kombinasi keadaan yang
   * membuat layar menampilkan nama dari undian lain.
   */
  winner_ids: number[];
  winners: Array<{
    ref: string;
    kind: "participant" | "entry";
    name: string;
    company: string | null;
    seat: string | null;
    is_backup: boolean;
    slot_order: number;
  }>;
};

const postSchema = z.object({
  action: z.enum(["mode", "select", "draw", "reveal", "decide", "reset"]),
  mode: z.enum(["off", "live"]).optional(),
  prize_id: z.number().int().positive().nullable().optional(),
  winner_id: z.number().int().positive().optional(),
  status: z.enum(["confirmed", "rejected"]).optional(),
  reason: z.string().trim().max(200).optional(),
});

async function loadState(): Promise<StateRow | null> {
  const client = getSupabaseServiceClient();
  const { data } = await client.from("undian_state").select(ROW).eq("id", 1).maybeSingle();
  if (data) return data as StateRow;
  // Baris singleton dibuat migrasi, tapi bila hilang ia dipasang ulang di sini
  // alih-alih menolak permintaan. Halaman ini dipakai di atas panggung: "baris
  // tidak ditemukan" pada saat itu tidak bisa ditindaklanjuti siapa pun.
  const inserted = await client.from("undian_state").insert({ id: 1 } as never).select(ROW).single();
  return (inserted.data as StateRow | null) ?? null;
}

async function loadPrize(id: number): Promise<UndianPrize | null> {
  const { data } = await getSupabaseServiceClient().from("undian_prizes").select(PRIZE_COLUMNS).eq("id", id).maybeSingle();
  return data ? normalizePrize(data as Record<string, unknown>) : null;
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const state = await loadState();
  if (!state) return apiError("INTERNAL_ERROR", 500);

  const now = new Date();
  const stamp = { updated_at: now.toISOString(), updated_by: auth.user.id };

  switch (parsed.data.action) {
    // -----------------------------------------------------------------------
    case "mode": {
      if (!parsed.data.mode) return apiError("VALIDATION_ERROR", 422);
      // Mematikan mode membersihkan state sekalian. Kalau tidak, operator yang
      // mematikan lalu menyalakan mode lagi mendarat pada pemenang lama yang
      // masih tampil — nama itu langsung muncul di layar tanpa ada yang menekan
      // apa pun, dan penonton mengira undian baru saja selesai.
      const patch = parsed.data.mode === "off"
        ? { mode: "off", phase: "idle", pending: null, pool: null, pool_frozen_at: null, pool_size: 0, spin_started_at: null, reveal_at: null, ...stamp }
        : { mode: "live", ...stamp };
      const { error } = await client.from("undian_state").update(patch as never).eq("id", 1);
      if (error) return apiError("INTERNAL_ERROR", 500);
      await audit(auth.user.id, "undian_mode_change", { old: { mode: state.mode }, new: { mode: parsed.data.mode } });
      break;
    }

    // -----------------------------------------------------------------------
    case "select": {
      const prizeId = parsed.data.prize_id ?? null;
      if (prizeId !== null && !(await loadPrize(prizeId))) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);
      // Berganti hadiah selalu mengembalikan layar ke keadaan diam. Membawa
      // pemenang hadiah sebelumnya ke tampilan hadiah baru akan menampilkan nama
      // yang benar di bawah hadiah yang salah.
      const { error } = await client
        .from("undian_state")
        .update({ active_prize_id: prizeId, phase: "idle", pending: null, pool: null, pool_frozen_at: null, pool_size: 0, spin_started_at: null, reveal_at: null, ...stamp } as never)
        .eq("id", 1);
      if (error) return apiError("INTERNAL_ERROR", 500);
      break;
    }

    // -----------------------------------------------------------------------
    case "draw": {
      const prizeId = parsed.data.prize_id ?? state.active_prize_id;
      if (!prizeId) return apiError("UNDIAN_NO_ACTIVE_PRIZE", 422);
      const prize = await loadPrize(prizeId);
      if (!prize) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);

      // Tombol ganda saat gugup adalah hal biasa di atas panggung. Tanpa penjaga
      // ini, tekanan kedua membuang pemenang yang sudah dipilih dan mengundi ulang
      // di tengah animasi yang sedang berjalan.
      if (state.phase === "spinning" && state.reveal_at && new Date(state.reveal_at) > now) {
        return apiError("UNDIAN_ALREADY_SPINNING", 409);
      }

      // Sesi tempat pemenang dicatat.
      //
      // Diambil dari database, bukan dari state, supaya sesi yang dimulai lewat
      // tab lain langsung terpakai tanpa halaman kontrol perlu disegarkan.
      //
      // Tanpa sesi aktif, undian TETAP DIJALANKAN dengan session_id null.
      // Menolaknya akan mengubah kelalaian administratif menjadi tombol yang mati
      // di atas panggung, dan pemenang tanpa sesi masih sepenuhnya sah — ia hanya
      // tidak ikut terkelompokkan di riwayat.
      const { data: activeSession } = await client
        .from("undian_sessions")
        .select("id")
        .eq("status", "active")
        .maybeSingle();
      const sessionId = (activeSession as { id: number } | null)?.id ?? null;

      // Kuota dihitung dalam lingkup SESI yang sama.
      //
      // Kalau dihitung lintas sesi, hadiah berkuota 10 yang sudah habis di sesi
      // siang akan menolak diundi lagi di sesi malam — padahal panitia sengaja
      // menutup sesi sebelumnya justru supaya bisa mengundi ulang hadiah itu.
      let quotaQuery = client
        .from("undian_winners")
        .select("id", { count: "exact", head: true })
        .eq("prize_id", prizeId)
        .eq("is_backup", false)
        .neq("status", "rejected");
      quotaQuery = sessionId === null
        ? quotaQuery.is("session_id", null)
        : quotaQuery.eq("session_id", sessionId);
      const { count } = await quotaQuery;
      const confirmed = count ?? 0;
      if (confirmed >= prize.winner_quota) return apiError("UNDIAN_QUOTA_REACHED", 409);

      const pool = await buildPool(prize);
      if ("error" in pool) return apiError("INTERNAL_ERROR", 500);
      if (pool.candidates.length === 0) return apiError("UNDIAN_POOL_EMPTY", 409);

      // Jumlah pemenang dijepit ke sisa kuota. Hadiah dengan kuota 10 dan 3 orang
      // per undi tidak boleh mengeluarkan 3 nama pada undian keempat, karena hanya
      // 1 kursi tersisa dan dua orang akan dipanggil untuk hadiah yang tidak ada.
      const mainCount = Math.min(prize.winners_per_draw, prize.winner_quota - confirmed);
      const picked = drawWinners(pool.candidates, mainCount + prize.backup_per_draw);

      const round = state.draw_round + 1;
      const pending: PendingDraw = {
        prize_id: prizeId,
        draw_round: round,
        // Diisi setelah baris pemenang ditulis; idnya belum ada di sini.
        winner_ids: [],
        winners: picked.map((candidate, index) => ({
          ref: candidate.ref,
          kind: candidate.kind,
          name: candidate.name,
          company: candidate.company,
          seat: candidate.seat,
          is_backup: index >= mainCount,
          slot_order: index < mainCount ? index + 1 : index - mainCount + 1,
        })),
      };

      // Kolam ikut dibekukan dan disimpan. Layar memakainya sebagai daftar nama
      // yang berputar. Membiarkannya hidup berarti daftar itu berubah di tengah
      // putaran ketika ada peserta baru check-in, dan pertanyaan "tadi nama saya
      // ada di roda tidak?" tidak punya jawaban yang bisa dipertanggungjawabkan.
      //
      // Urutannya diacak: mengirim dalam urutan abjad membuat posisi nama di roda
      // dapat ditebak dari daftar peserta yang beredar sebelum acara.
      //
      // Dibatasi 500 nama. Roda dan slot tidak terbaca di atas itu, dan payload
      // yang dipoll setiap 2 detik harus tetap ringan. Pembatasan hanya menyentuh
      // TAMPILAN; pemilihan tetap dari seluruh kolam, jadi peluangnya tidak berubah.
      const roster = shuffle(pool.candidates).slice(0, 500).map((candidate) => ({
        name: candidate.name,
        seat: candidate.seat,
        code: candidate.code,
      }));

      const spinMs = Math.round(prize.spin_seconds * 1000);
      const { data: settings } = await client.from("undian_settings").select("reveal_delay_seconds").eq("id", 1).maybeSingle();
      const delayMs = Math.round(Number((settings as { reveal_delay_seconds?: number } | null)?.reveal_delay_seconds ?? 0) * 1000);

      // Pemenang dicatat SEKARANG, sebelum state diperbarui.
      //
      // Kalau ditulis saat reveal, listrik padam atau peramban operator ditutup
      // di antara keduanya akan menghapus hasil undian yang sudah terjadi, dan
      // tidak ada cara memulihkannya selain mengundi ulang di depan penonton yang
      // sudah melihat rodanya berputar.
      //
      // Urutannya sengaja insert DULU lalu update state: `pending.winner_ids`
      // harus berisi id baris yang sebenarnya, dan id itu baru ada setelah insert.
      // Bila insert gagal, state belum tersentuh sehingga layar tetap pada keadaan
      // sebelumnya — lebih baik daripada layar berputar untuk undian yang tidak
      // pernah tercatat.
      const { data: insertedWinners, error: winnerError } = await client
        .from("undian_winners")
        .insert(
          pending.winners.map((winner) => ({
            prize_id: prizeId,
            session_id: sessionId,
            draw_round: round,
            participant_id: winner.kind === "participant" ? winner.ref : null,
            entry_id: winner.kind === "entry" ? Number(winner.ref) : null,
            display_name: winner.name,
            company: winner.company,
            seat_label: winner.seat,
            is_backup: winner.is_backup,
            slot_order: winner.slot_order,
            drawn_by: auth.user.id,
          })) as never,
        )
        .select("id");
      if (winnerError) return apiError("INTERNAL_ERROR", 500);
      pending.winner_ids = ((insertedWinners ?? []) as { id: number }[]).map((row) => row.id);

      const { error } = await client
        .from("undian_state")
        .update({
          mode: "live",
          active_prize_id: prizeId,
          phase: "spinning",
          draw_round: round,
          spin_started_at: now.toISOString(),
          reveal_at: new Date(now.getTime() + spinMs + delayMs).toISOString(),
          pending,
          pool: roster,
          pool_frozen_at: now.toISOString(),
          pool_size: pool.candidates.length,
          session_id: sessionId,
          ...stamp,
        } as never)
        .eq("id", 1);
      if (error) return apiError("INTERNAL_ERROR", 500);

      await audit(auth.user.id, "undian_draw", {
        old: null,
        new: {
          prize: prize.name, draw_round: round, session_id: sessionId,
          pool_size: pool.candidates.length,
          total_tickets: pool.total_tickets,
          winners: pending.winners.map((winner) => ({ name: winner.name, is_backup: winner.is_backup })),
        },
      });
      break;
    }

    // -----------------------------------------------------------------------
    case "reveal": {
      // Lewati sisa waktu putaran. Dipakai ketika waktu acara mepet atau animasi
      // tersendat di komputer panggung.
      if (state.phase !== "spinning") return apiError("VALIDATION_ERROR", 422, { form: ["Tidak ada undian yang sedang berjalan."] });
      const { error } = await client
        .from("undian_state")
        .update({ phase: "revealed", reveal_at: now.toISOString(), ...stamp } as never)
        .eq("id", 1);
      if (error) return apiError("INTERNAL_ERROR", 500);
      break;
    }

    // -----------------------------------------------------------------------
    case "decide": {
      if (!parsed.data.winner_id || !parsed.data.status) return apiError("VALIDATION_ERROR", 422);
      const { data: winner } = await client
        .from("undian_winners")
        .select("id,prize_id,display_name,status")
        .eq("id", parsed.data.winner_id)
        .maybeSingle();
      if (!winner) return apiError("UNDIAN_WINNER_NOT_FOUND", 404);
      const current = winner as { id: number; prize_id: number; display_name: string; status: string };
      // Sudah diputuskan berarti hadiahnya sudah diserahkan atau sudah diundi
      // ulang. Membalik keputusan lewat endpoint ini akan membuat dua orang
      // memegang klaim atas satu hadiah yang sama.
      if (current.status !== "pending") return apiError("UNDIAN_WINNER_DECIDED", 409);

      const { error } = await client
        .from("undian_winners")
        .update({
          status: parsed.data.status,
          reject_reason: parsed.data.status === "rejected" ? parsed.data.reason?.trim() || null : null,
          decided_at: now.toISOString(),
          decided_by: auth.user.id,
        } as never)
        .eq("id", current.id);
      if (error) return apiError("INTERNAL_ERROR", 500);

      await audit(auth.user.id, parsed.data.status === "confirmed" ? "undian_winner_confirm" : "undian_winner_reject", {
        old: { name: current.display_name, status: "pending" },
        new: { name: current.display_name, status: parsed.data.status, reason: parsed.data.reason ?? null },
      });
      break;
    }

    // -----------------------------------------------------------------------
    case "reset": {
      // Membersihkan tampilan, BUKAN menghapus pemenang. Riwayat pemenang adalah
      // catatan serah terima hadiah; tombol di atas panggung tidak boleh bisa
      // menghapusnya. Pembatalan satu nama dilakukan lewat aksi decide.
      const { error } = await client
        .from("undian_state")
        .update({ phase: "idle", pending: null, pool: null, pool_frozen_at: null, pool_size: 0, spin_started_at: null, reveal_at: null, ...stamp } as never)
        .eq("id", 1);
      if (error) return apiError("INTERNAL_ERROR", 500);
      await audit(auth.user.id, "undian_reset", { old: { phase: state.phase, draw_round: state.draw_round }, new: { phase: "idle" } });
      break;
    }
  }

  return Response.json({ ok: true });
}

async function audit(userId: string, action: string, payload: unknown) {
  await getSupabaseServiceClient().from("audit_logs").insert({ user_id: userId, action, payload } as never);
}
