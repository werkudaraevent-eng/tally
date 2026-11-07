import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { drawWinners, normalizePrize, initialsOf, shuffle, stageRosterItem, type Candidate, type UndianPrize } from "@/lib/undian";
import { buildPool } from "@/lib/undian-pool";
import { CAHAYA_MIN_MS } from "@/lib/undian-cahaya";
import { siapkanCahaya, type CahayaPending } from "@/lib/undian-cahaya-server";
import { PACK_INTRO_MS, packAllPlan, tierNumber, type PackPlan } from "@/lib/undian-kartu";
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

const ROW = "mode,rehearsal,active_prize_id,phase,draw_round,spin_started_at,reveal_at,pending,pool,pool_frozen_at,pool_size,session_id,updated_at";

type StateRow = {
  mode: "off" | "live";
  /** true = undian berjalan normal di layar tetapi pemenang tidak dicatat. */
  rehearsal: boolean;
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
    /** Hadiah nama ini. Kosong = `prize_id` undian ini; terisi pada bungkus Mesin Kartu "semua hadiah". */
    prize_id?: number;
  }>;
  /** Mesin Kartu saja: hadiah dan jumlah kartu di bungkus, urut seperti dibuka. */
  pack?: PackPlan;
  /**
   * Cahaya HP saja: jadwal gelombang, kunci per gelombang, dan gelombang padam
   * tiap peserta. Tidak pernah keluar apa adanya: /api/undian/state dan
   * /api/undian/hp hanya mengirim jadwal dan kunci yang waktunya sudah lewat,
   * /api/peserta/undian-hp hanya hasil terkunci milik peserta yang bertanya.
   */
  cahaya?: CahayaPending;
};

const postSchema = z.object({
  action: z.enum(["mode", "rehearsal", "select", "draw", "reveal", "decide", "reset", "redraw"]),
  mode: z.enum(["off", "live"]).optional(),
  /** Untuk aksi `rehearsal`. */
  on: z.boolean().optional(),
  prize_id: z.number().int().positive().nullable().optional(),
  winner_id: z.number().int().positive().optional(),
  /**
   * Untuk aksi `decide`: beberapa pemenang sekaligus ("Mark all N present",
   * "Release backups"). Dulu klien mengirim satu permintaan per nama, berurutan,
   * dan memuat ulang state di antara setiap nama; 20 pemenang berarti 60
   * panggilan dan operator menunggu di atas panggung. Semua nama diputuskan
   * dalam satu pembaruan: semua berhasil atau tidak ada yang berubah.
   */
  winner_ids: z.array(z.number().int().positive()).min(1).max(100).optional(),
  status: z.enum(["confirmed", "rejected"]).optional(),
  reason: z.string().trim().max(200).optional(),
  /**
   * Untuk aksi `draw`: jumlah nama yang diundi, di bawah "per undi" hadiahnya.
   * Dipakai "Tidak hadir, undi pengganti": satu kursi kosong diisi satu nama,
   * bukan satu rombongan penuh, dan tanpa cadangan (cadangan sudah diundi
   * bersama rombongan awal).
   */
  count: z.number().int().min(1).max(60).optional(),
  /**
   * Untuk aksi `draw` pada Mesin Kartu "semua hadiah": bungkus PENGGANTI.
   * Kursi kosong dari bungkus sebelumnya (pemenang yang tidak hadir, di
   * beberapa hadiah sekaligus) diundi lagi dalam satu bungkus, hadiah pemegang
   * tetap kartu terakhir. Jumlahnya dijepit ke sisa kuota tiap hadiah di server.
   */
  refill: z.array(z.object({ prize_id: z.number().int().positive(), count: z.number().int().min(1).max(30) })).min(1).max(30).optional(),
});

async function loadState(eventId: string): Promise<StateRow | null> {
  const client = getSupabaseServiceClient();
  const { data } = await client.from("undian_state").select(ROW).eq("event_id", eventId).maybeSingle();
  if (data) return data as StateRow;
  // Baris state dibuat saat event dibuat, tapi bila hilang ia dipasang ulang di
  // sini alih-alih menolak permintaan. Halaman ini dipakai di atas panggung:
  // "baris tidak ditemukan" pada saat itu tidak bisa ditindaklanjuti siapa pun.
  // `id` TIDAK ditulis tangan lagi — kini satu baris per event dengan id sequence.
  const inserted = await client.from("undian_state").insert({ event_id: eventId } as never).select(ROW).single();
  return (inserted.data as StateRow | null) ?? null;
}

async function loadPrize(eventId: string, id: number): Promise<UndianPrize | null> {
  const { data } = await getSupabaseServiceClient().from("undian_prizes").select(PRIZE_COLUMNS).eq("event_id", eventId).eq("id", id).maybeSingle();
  return data ? normalizePrize(data as Record<string, unknown>) : null;
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const state = await loadState(eventId);
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
      const { error } = await client.from("undian_state").update(patch as never).eq("event_id", eventId);
      if (error) return apiError("INTERNAL_ERROR", 500);
      await audit(eventId, auth.user.id, "undian_mode_change", { old: { mode: state.mode }, new: { mode: parsed.data.mode } });
      break;
    }

    // -----------------------------------------------------------------------
    case "rehearsal": {
      if (typeof parsed.data.on !== "boolean") return apiError("VALIDATION_ERROR", 422);

      // Berganti mode SELALU membersihkan tampilan, ke arah mana pun.
      //
      // Tanpa ini, mematikan latihan meninggalkan pemenang latihan tetap terpampang
      // di layar panggung, dan tidak ada satu pun tanda bahwa nama itu tidak
      // tercatat — persis keadaan yang membuat orang mengira undian sungguhan sudah
      // berjalan. Arah sebaliknya sama berbahayanya: menyalakan latihan sementara
      // pemenang SUNGGUHAN masih tampil akan memberi mereka label "LATIHAN" di
      // layar, membuat pemenang sah terlihat seperti hasil uji coba.
      const { error } = await client
        .from("undian_state")
        .update({
          rehearsal: parsed.data.on,
          phase: "idle",
          pending: null,
          pool: null,
          pool_frozen_at: null,
          pool_size: 0,
          spin_started_at: null,
          reveal_at: null,
          ...stamp,
        } as never)
        .eq("event_id", eventId);
      if (error) return apiError("INTERNAL_ERROR", 500);
      await audit(eventId, auth.user.id, parsed.data.on ? "undian_rehearsal_on" : "undian_rehearsal_off", {
        old: { rehearsal: state.rehearsal },
        new: { rehearsal: parsed.data.on },
      });
      break;
    }

    // -----------------------------------------------------------------------
    case "select": {
      const prizeId = parsed.data.prize_id ?? null;
      if (prizeId !== null && !(await loadPrize(eventId, prizeId))) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);
      // Berganti hadiah selalu mengembalikan layar ke keadaan diam. Membawa
      // pemenang hadiah sebelumnya ke tampilan hadiah baru akan menampilkan nama
      // yang benar di bawah hadiah yang salah.
      const { error } = await client
        .from("undian_state")
        .update({ active_prize_id: prizeId, phase: "idle", pending: null, pool: null, pool_frozen_at: null, pool_size: 0, spin_started_at: null, reveal_at: null, ...stamp } as never)
        .eq("event_id", eventId);
      if (error) return apiError("INTERNAL_ERROR", 500);
      break;
    }

    // -----------------------------------------------------------------------
    case "draw": {
      const prizeId = parsed.data.prize_id ?? state.active_prize_id;
      if (!prizeId) return apiError("UNDIAN_NO_ACTIVE_PRIZE", 422);
      const prize = await loadPrize(eventId, prizeId);
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
        .eq("event_id", eventId)
        .eq("status", "active")
        .maybeSingle();
      const sessionId = (activeSession as { id: number } | null)?.id ?? null;

      // Kuota dihitung dalam lingkup SESI yang sama.
      //
      // Kalau dihitung lintas sesi, hadiah berkuota 10 yang sudah habis di sesi
      // siang akan menolak diundi lagi di sesi malam — padahal panitia sengaja
      // menutup sesi sebelumnya justru supaya bisa mengundi ulang hadiah itu.
      //
      // Pada mode latihan pemeriksaan ini DILEWATI seluruhnya. Latihan tidak
      // menulis pemenang, jadi tidak ada kuota yang terpakai; menolaknya hanya
      // membuat gladi bersih mustahil dilakukan untuk hadiah yang kuotanya
      // kebetulan sudah penuh — justru hadiah yang paling perlu diuji ulang.
      // Bungkus pengganti Mesin Kartu: hanya hadiah dengan kursi kosong, dan
      // pemegang boleh tidak ikut (kuotanya penuh bukan alasan menolak).
      const refill = parsed.data.refill;
      const isPackAll = prize.animation === "pack" && prize.pack_contents === "all";
      if (refill && !isPackAll) return apiError("VALIDATION_ERROR", 422);
      const refillCounts = refill ? new Map(refill.map((item) => [item.prize_id, item.count])) : null;
      const holderWanted = refillCounts ? refillCounts.get(prizeId) ?? 0 : null;

      let confirmed = 0;
      if (!state.rehearsal) {
        const taken = await seatsTaken(eventId, prizeId, sessionId);
        if (taken === null) return apiError("INTERNAL_ERROR", 500);
        confirmed = taken;
        if (confirmed >= prize.winner_quota && holderWanted !== 0) return apiError("UNDIAN_QUOTA_REACHED", 409);
      }

      const pool = await buildPool(eventId, prize);
      if ("error" in pool && pool.error === "RULE_BROKEN") return apiError("UNDIAN_RULE_BROKEN", 409, { rules: pool.rules });
      if ("error" in pool) return apiError("INTERNAL_ERROR", 500);
      if (pool.candidates.length === 0 && holderWanted !== 0) return apiError("UNDIAN_POOL_EMPTY", 409);

      // Jumlah pemenang dijepit ke sisa kuota. Hadiah dengan kuota 10 dan 3 orang
      // per undi tidak boleh mengeluarkan 3 nama pada undian keempat, karena hanya
      // 1 kursi tersisa dan dua orang akan dipanggil untuk hadiah yang tidak ada.
      const requested = parsed.data.count;
      const mainCount = holderWanted !== null
        ? Math.max(0, Math.min(holderWanted, state.rehearsal ? holderWanted : prize.winner_quota - confirmed))
        : Math.min(requested ?? prize.winners_per_draw, prize.winners_per_draw, prize.winner_quota - confirmed);
      const round = state.draw_round + 1;

      // Mesin Kartu "semua hadiah": satu bungkus mengundi setiap hadiah aktif
      // yang kuotanya masih tersisa di sesi ini, hadiah ini kartu terakhir.
      // Undian pengganti (`count`) selalu satu hadiah: kursi yang kosong milik
      // satu hadiah tertentu, bukan seluruh bungkus.
      const packAll = isPackAll && !requested;
      let pending: PendingDraw;
      if (packAll) {
        const bundle = await drawPackAll(eventId, prize, pool.candidates, mainCount, sessionId, state.rehearsal, refillCounts);
        if ("error" in bundle) {
          if (bundle.error === "RULE_BROKEN") return apiError("UNDIAN_RULE_BROKEN", 409, { rules: bundle.rules });
          return apiError("INTERNAL_ERROR", 500);
        }
        if (bundle.winners.length === 0) return apiError(refill ? "UNDIAN_POOL_EMPTY" : "UNDIAN_QUOTA_REACHED", 409);
        pending = { prize_id: prizeId, draw_round: round, winner_ids: [], winners: bundle.winners, pack: bundle.plan };
      } else {
        const picked = drawWinners(pool.candidates, mainCount + (requested ? 0 : prize.backup_per_draw));
        pending = {
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
        if (prize.animation === "pack") {
          const mains = pending.winners.filter((winner) => !winner.is_backup).length;
          // Pengganti pemegang "semua hadiah" tetap kartu emas, sama seperti di bungkusnya.
          const tier = prize.pack_contents === "all" ? 3 : tierNumber(prize.card_tier);
          pending.pack = { mode: "one", groups: [{ prize_id: prizeId, prize: prize.name, tier, count: mains }] };
        }
      }

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
      //
      // Spotlight wall dengan inisial: inisialnya dibentuk DI SINI, jadi nama
      // lengkap kolam tidak pernah sampai ke layar publik. Nama pemenang tetap
      // datang utuh lewat `winners` setelah waktu reveal, seperti animasi lain.
      const wallInitials = prize.animation === "wall" && prize.wall_names === "initials";
      const roster = shuffle(pool.candidates).slice(0, 500).map((candidate) => stageRosterItem(
        wallInitials ? { name: initialsOf(candidate.name), seat: null, code: null } : candidate,
      ));

      // Cahaya HP butuh waktu untuk menyala, pertunjukan, dan paling tidak dua
      // gelombang: Duration yang lebih pendek dipanjangkan, bukan ditolak.
      // Mesin Kartu sama: kode slot, spiral, dan bungkus jatuh butuh PACK_INTRO_MS
      // sebelum bungkus bisa disobek.
      const cahaya = prize.animation === "cahaya";
      const minSpinMs = cahaya ? CAHAYA_MIN_MS : prize.animation === "pack" ? PACK_INTRO_MS : 0;
      const spinMs = Math.max(minSpinMs, Math.round(prize.spin_seconds * 1000));
      const { data: settings } = await client.from("undian_settings").select("reveal_delay_seconds").eq("event_id", eventId).maybeSingle();
      const delayMs = Math.round(Number((settings as { reveal_delay_seconds?: number } | null)?.reveal_delay_seconds ?? 0) * 1000);

      // Mode manual = tanpa waktu berhenti. Bukan "waktu yang sangat lama":
      // NULL sudah punya arti di seluruh rantai hilir -- `revealDue` di
      // /api/undian/state menjaga `reveal_at !== null`, dan ticker animasi
      // memakai kecepatan tetap saat `endsAt` kosong. Angka besar justru akan
      // membuat animasi melambat seolah hendak berhenti.
      //
      // `reveal_delay_seconds` ikut tidak berlaku di sini: jeda itu ada untuk
      // menahan nama sesaat setelah animasi berhenti sendiri, sedangkan pada
      // mode manual penekanan tombol operator ADALAH momen berhentinya.
      //
      // Cahaya HP selalu berjalan dengan waktu: gelombang di semua HP dijadwalkan
      // terhadap reveal_at, dan tanpa waktu berhenti tidak ada jadwal.
      const manual = prize.spin_mode === "manual" && !cahaya;
      const revealAt = manual ? null : new Date(now.getTime() + spinMs + delayMs);
      if (cahaya && revealAt) pending.cahaya = siapkanCahaya(pool.candidates, pending.winners, now.getTime(), revealAt.getTime());

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
      //
      // PADA MODE LATIHAN seluruh penulisan dilewati. Inilah satu-satunya
      // perbedaan nyata antara latihan dan undian sungguhan: animasi, pemilihan
      // pemenang, kolam, dan tampilan layar berjalan identik, hanya hasilnya yang
      // tidak menyentuh `undian_winners`. Dengan begitu gladi bersih benar-benar
      // menguji apa yang akan terjadi, bukan versi yang disederhanakan.
      //
      // `winner_ids` tetap kosong di sini karena tidak ada baris yang ditulis.
      // `/api/undian/state` menanganinya lewat cabang khusus latihan yang membaca
      // nama langsung dari `pending`. Cabang itu WAJIB ada: cabang biasa akan
      // jatuh ke pencarian berdasarkan (prize_id, draw_round), dan nomor ronde
      // dibagi bersama antara latihan dan undian sungguhan — sehingga layar bisa
      // menampilkan pemenang SUNGGUHAN dari undian sebelumnya sebagai hasil
      // latihan, lengkap dengan pita "MODE LATIHAN" di atasnya.
      if (!state.rehearsal) {
        const { data: insertedWinners, error: winnerError } = await client
          .from("undian_winners")
          .insert(
            pending.winners.map((winner) => ({
              event_id: eventId,
              prize_id: winner.prize_id ?? prizeId,
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
      }

      const { error } = await client
        .from("undian_state")
        .update({
          mode: "live",
          active_prize_id: prizeId,
          phase: "spinning",
          draw_round: round,
          spin_started_at: now.toISOString(),
          reveal_at: revealAt ? revealAt.toISOString() : null,
          pending,
          pool: roster,
          pool_frozen_at: now.toISOString(),
          pool_size: pool.candidates.length,
          session_id: sessionId,
          ...stamp,
        } as never)
        .eq("event_id", eventId);
      if (error) return apiError("INTERNAL_ERROR", 500);

      await audit(eventId, auth.user.id, "undian_draw", {
        old: null,
        new: {
          prize: prize.name, draw_round: round, session_id: sessionId,
          spin_mode: prize.spin_mode,
          // Ditandai di audit juga, bukan hanya di state. Tanpa ini baris latihan
          // dan baris sungguhan terbaca identik di jejak audit, dan pertanyaan
          // "kenapa hadiah ini diundi enam kali" tidak punya jawaban.
          rehearsal: state.rehearsal,
          pool_size: pool.candidates.length,
          total_tickets: pool.total_tickets,
          winners: pending.winners.map((winner) => ({ name: winner.name, is_backup: winner.is_backup, ...(winner.prize_id && winner.prize_id !== prizeId ? { prize_id: winner.prize_id } : {}) })),
          ...(pending.pack?.mode === "all" ? { pack: pending.pack.groups.map((group) => ({ prize: group.prize, count: group.count })) } : {}),
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
        .eq("event_id", eventId);
      if (error) return apiError("INTERNAL_ERROR", 500);
      break;
    }

    // -----------------------------------------------------------------------
    case "decide": {
      const status = parsed.data.status;
      const ids = [...new Set(parsed.data.winner_ids ?? (parsed.data.winner_id ? [parsed.data.winner_id] : []))];
      if (ids.length === 0 || !status) return apiError("VALIDATION_ERROR", 422);
      const { data: winnerRows, error: winnerError } = await client
        .from("undian_winners")
        .select("id,prize_id,session_id,display_name,status")
        .eq("event_id", eventId)
        .in("id", ids);
      if (winnerError) return apiError("INTERNAL_ERROR", 500);
      const winners = (winnerRows ?? []) as { id: number; prize_id: number; session_id: number | null; display_name: string; status: string }[];
      if (winners.length !== ids.length) return apiError("UNDIAN_WINNER_NOT_FOUND", 404);
      // Sudah diputuskan berarti hadiahnya sudah diserahkan atau sudah diundi
      // ulang. Membalik keputusan lewat endpoint ini akan membuat dua orang
      // memegang klaim atas satu hadiah yang sama. Satu nama yang sudah
      // diputuskan (mis. operator lain di tab lain) menggagalkan seluruh
      // permintaan, supaya panel memuat ulang dan operator melihat keadaan nyata.
      if (winners.some((winner) => winner.status !== "pending")) return apiError("UNDIAN_WINNER_DECIDED", 409);

      // Pengaman kuota di server, dihitung per (hadiah, sesi). Cadangan yang
      // disahkan juga memegang hadiah: tanpa pemeriksaan ini, "sahkan semua"
      // (atau dua operator di dua tab) bisa mengesahkan pemenang utama DAN
      // cadangannya untuk hadiah berkuota 1.
      if (status === "confirmed") {
        const groups = new Map<string, { prizeId: number; sessionId: number | null; count: number }>();
        for (const winner of winners) {
          const key = `${winner.prize_id}:${winner.session_id ?? ""}`;
          const group = groups.get(key) ?? { prizeId: winner.prize_id, sessionId: winner.session_id, count: 0 };
          group.count += 1;
          groups.set(key, group);
        }
        for (const group of groups.values()) {
          const { data: prizeRow } = await client
            .from("undian_prizes")
            .select("winner_quota")
            .eq("event_id", eventId)
            .eq("id", group.prizeId)
            .maybeSingle();
          const quota = (prizeRow as { winner_quota: number } | null)?.winner_quota;
          if (typeof quota !== "number") continue;
          let confirmedQuery = client
            .from("undian_winners")
            .select("id")
            .eq("event_id", eventId)
            .eq("prize_id", group.prizeId)
            .eq("status", "confirmed");
          confirmedQuery = group.sessionId === null
            ? confirmedQuery.is("session_id", null)
            : confirmedQuery.eq("session_id", group.sessionId);
          const { data: confirmedRows, error: countError } = await confirmedQuery;
          if (countError) return apiError("INTERNAL_ERROR", 500);
          if ((confirmedRows ?? []).length + group.count > quota) return apiError("UNDIAN_QUOTA_REACHED", 409);
        }
      }

      // `status = pending` di WHERE: bila tab lain memutuskan salah satu nama di
      // antara pemeriksaan di atas dan pembaruan ini, nama itu tidak ditimpa.
      const { data: updated, error } = await client
        .from("undian_winners")
        .update({
          status,
          reject_reason: status === "rejected" ? parsed.data.reason?.trim() || null : null,
          decided_at: now.toISOString(),
          decided_by: auth.user.id,
        } as never)
        .eq("event_id", eventId)
        .eq("status", "pending")
        .in("id", ids)
        .select("id");
      if (error) return apiError("INTERNAL_ERROR", 500);
      const changed = new Set(((updated ?? []) as { id: number }[]).map((row) => row.id));

      // Satu baris audit per nama, sama seperti sebelumnya, dalam satu insert.
      const rows = winners.filter((winner) => changed.has(winner.id)).map((winner) => ({
        event_id: eventId,
        user_id: auth.user.id,
        action: status === "confirmed" ? "undian_winner_confirm" : "undian_winner_reject",
        payload: {
          old: { name: winner.display_name, status: "pending" },
          new: { name: winner.display_name, status, reason: parsed.data.reason ?? null },
        },
      }));
      if (rows.length > 0) await client.from("audit_logs").insert(rows as never);
      if (changed.size !== ids.length) return apiError("UNDIAN_WINNER_DECIDED", 409);
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
        .eq("event_id", eventId);
      if (error) return apiError("INTERNAL_ERROR", 500);
      await audit(eventId, auth.user.id, "undian_reset", { old: { phase: state.phase, draw_round: state.draw_round }, new: { phase: "idle" } });
      break;
    }

    // -----------------------------------------------------------------------
    case "redraw": {
      // Mengosongkan kuota sebuah hadiah dengan MENOLAK pemenang yang masih
      // menggantung, bukan menghapusnya.
      //
      // Ini jalan keluar dari keadaan "kuota penuh" yang selama ini ada tetapi
      // tidak terlihat: kuota dihitung dengan `status <> 'rejected'`, jadi menolak
      // sepuluh nama sudah cukup untuk bisa mengundi lagi. Operator sebelumnya
      // harus menekan "Tidak hadir" sepuluh kali, dan karena itu tidak terlihat
      // sebagai jalan keluar, yang ditempuh justru menghapus seluruh hasil undian.
      //
      // Baris tetap tersimpan lengkap dengan alasan dan waktunya. Pertanyaan
      // "kenapa hadiah ini diundi dua kali" masih bisa dijawab berminggu-minggu
      // kemudian, dan itu tidak mungkin bila barisnya dibuang.
      const prizeId = parsed.data.prize_id ?? state.active_prize_id;
      if (!prizeId) return apiError("UNDIAN_NO_ACTIVE_PRIZE", 422);
      const prize = await loadPrize(eventId, prizeId);
      if (!prize) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);

      // Menolak di tengah animasi akan membatalkan pemenang yang rodanya masih
      // berputar di depan penonton.
      if (state.phase === "spinning" && state.reveal_at && new Date(state.reveal_at) > now) {
        return apiError("UNDIAN_ALREADY_SPINNING", 409);
      }

      const { data: activeSession } = await client
        .from("undian_sessions")
        .select("id")
        .eq("event_id", eventId)
        .eq("status", "active")
        .maybeSingle();
      const sessionId = (activeSession as { id: number } | null)?.id ?? null;

      // HANYA yang berstatus `pending`.
      //
      // Pemenang `confirmed` berarti orangnya sudah naik panggung dan menerima
      // hadiahnya. Membatalkan itu lewat satu tombol akan membuat dua orang
      // memegang klaim atas hadiah yang sama, dan tidak ada satu pun keadaan di
      // mana operator memaksudkan hal tersebut saat menekan "undi ulang".
      //
      // Bungkus Mesin Kartu "semua hadiah": nama-namanya milik banyak hadiah.
      // Undi ulang membatalkan SELURUH isi bungkus itu (id barisnya ada di
      // pending), bukan hanya kartu hadiah pemegang; kalau tidak, kartu lain
      // tetap memegang kursi di belasan hadiah sementara layar sudah kosong.
      const packIds = state.pending?.pack?.mode === "all" && state.pending.prize_id === prizeId ? state.pending.winner_ids : [];
      let targetQuery = client
        .from("undian_winners")
        .select("id,display_name")
        .eq("event_id", eventId)
        .eq("status", "pending");
      if (packIds.length > 0) targetQuery = targetQuery.in("id", packIds);
      else {
        targetQuery = targetQuery.eq("prize_id", prizeId);
        targetQuery = sessionId === null
          ? targetQuery.is("session_id", null)
          : targetQuery.eq("session_id", sessionId);
      }
      const { data: targets, error: targetError } = await targetQuery;
      if (targetError) return apiError("INTERNAL_ERROR", 500);

      const rows = (targets ?? []) as { id: number; display_name: string }[];
      if (rows.length === 0) {
        return apiError("VALIDATION_ERROR", 422, {
          message: "Tidak ada pemenang yang masih menunggu konfirmasi pada hadiah ini. Pemenang yang sudah ditandai hadir tidak dapat dibatalkan dari sini.",
        });
      }

      const reason = parsed.data.reason?.trim() || "Diundi ulang";
      const { error } = await client
        .from("undian_winners")
        .update({ status: "rejected", reject_reason: reason, decided_at: now.toISOString(), decided_by: auth.user.id } as never)
        .eq("event_id", eventId)
        .in("id", rows.map((row) => row.id));
      if (error) return apiError("INTERNAL_ERROR", 500);

      // Tampilan layar ikut dibersihkan. Nama yang baru saja dibatalkan tidak
      // boleh tetap terpampang di panggung sebagai pemenang.
      const { error: stateError } = await client
        .from("undian_state")
        .update({ phase: "idle", pending: null, pool: null, pool_frozen_at: null, pool_size: 0, spin_started_at: null, reveal_at: null, ...stamp } as never)
        .eq("event_id", eventId);
      if (stateError) return apiError("INTERNAL_ERROR", 500);

      await audit(eventId, auth.user.id, "undian_redraw", {
        old: { prize: prize.name, session_id: sessionId, cancelled: rows.map((row) => row.display_name) },
        new: { reason, count: rows.length },
      });
      return Response.json({ ok: true, cancelled: rows.length });
    }
  }

  return Response.json({ ok: true });
}

async function audit(eventId: string, userId: string, action: string, payload: unknown) {
  await getSupabaseServiceClient().from("audit_logs").insert({ event_id: eventId, user_id: userId, action, payload } as never);
}

type PackWinner = PendingDraw["winners"][number];

/**
 * Bungkus Mesin Kartu "semua hadiah": pemenang setiap hadiah aktif yang masih
 * punya sisa kuota di sesi ini, dengan `holder` sebagai kartu terakhir.
 *
 * - Tiap hadiah diundi dari KOLAMNYA SENDIRI (syarat, tiket, pengecualian
 *   pemenang sebelumnya), persis seperti bila diundi satu per satu.
 * - Diundi dari yang paling langka dulu (packAllPlan.drawOrder). Nama yang sudah
 *   keluar di bungkus ini ikut dikecualikan dari hadiah berikutnya bila hadiah
 *   itu "Excluded from all prizes after winning once", aturan yang sama dengan
 *   undian_blocking_winner_ids untuk pemenang yang sudah tercatat.
 * - Tanpa cadangan: kursi yang kosong diisi lewat undian pengganti hadiah itu.
 * - Hadiah lain yang kolamnya kosong dilewati, tidak menggagalkan bungkus.
 *   Syarat yang rusak tetap menolak, seperti undian biasa.
 */
async function drawPackAll(
  eventId: string,
  holder: UndianPrize,
  holderPool: Candidate[],
  holderCount: number,
  sessionId: number | null,
  rehearsal: boolean,
  /** Bungkus pengganti: hanya hadiah ini, dengan jumlah kursi kosongnya. */
  only: Map<number, number> | null = null,
): Promise<{ winners: PackWinner[]; plan: PackPlan } | { error: "RULE_BROKEN"; rules: string[] } | { error: "POOL_ERROR" }> {
  const { data, error } = await getSupabaseServiceClient()
    .from("undian_prizes")
    .select(PRIZE_COLUMNS)
    .eq("event_id", eventId)
    .eq("is_active", true)
    .neq("id", holder.id);
  if (error) return { error: "POOL_ERROR" };
  const others = ((data ?? []) as Record<string, unknown>[]).map(normalizePrize).filter((item) => !only || only.has(item.id));
  const byId = new Map<number, UndianPrize>([[holder.id, holder], ...others.map((item): [number, UndianPrize] => [item.id, item])]);

  // Sisa kursi per hadiah, sama dengan pemeriksaan kuota undian biasa. Latihan
  // tidak memakai kuota, jadi tiap hadiah mendapat satu rombongan penuh.
  // Semua hadiah dihitung bersamaan: satu per satu terasa lambat di atas
  // panggung saat bungkus berisi belasan hadiah.
  const remaining = new Map<number, number>();
  const takenList = rehearsal ? others.map(() => 0) : await Promise.all(others.map((item) => seatsTaken(eventId, item.id, sessionId)));
  for (const [index, item] of others.entries()) {
    const taken = takenList[index];
    if (taken === null) return { error: "POOL_ERROR" };
    const want = only ? only.get(item.id) ?? 0 : item.winners_per_draw;
    remaining.set(item.id, Math.max(0, rehearsal ? want : Math.min(want, item.winner_quota - taken)));
  }

  // Jumlah per hadiah sudah dipotong ke 30 kartu, dari yang paling umum.
  const first = packAllPlan(
    { id: holder.id, name: holder.name, tier: "grand", sort_order: holder.sort_order, count: holderCount },
    others.map((item) => ({ id: item.id, name: item.name, tier: item.card_tier, sort_order: item.sort_order, count: remaining.get(item.id) ?? 0 })),
  );
  const allocated = new Map(first.groups.map((group) => [group.prize_id, group.count]));

  // Kolam tiap hadiah juga dibangun bersamaan; hanya penyaringan "sudah
  // menang di bungkus ini" yang harus berurutan.
  const poolIds = first.drawOrder.filter((id) => id !== holder.id);
  const pools = await Promise.all(poolIds.map((id) => buildPool(eventId, byId.get(id)!)));
  const poolOf = new Map<number, Candidate[]>();
  for (const [index, pool] of pools.entries()) {
    if ("error" in pool && pool.error === "RULE_BROKEN") return { error: "RULE_BROKEN", rules: pool.rules };
    if ("error" in pool) return { error: "POOL_ERROR" };
    poolOf.set(poolIds[index], pool.candidates);
  }
  const picked = new Map<number, Candidate[]>();
  const taken = new Set<string>();
  const key = (candidate: Candidate) => `${candidate.kind}:${candidate.ref}`;
  for (const id of first.drawOrder) {
    const item = byId.get(id)!;
    let candidates = id === holder.id ? holderPool : poolOf.get(id) ?? [];
    if (item.exclude_scope === "all_prizes") candidates = candidates.filter((candidate) => !taken.has(key(candidate)));
    const chosen = drawWinners(candidates, allocated.get(id) ?? 0);
    for (const candidate of chosen) taken.add(key(candidate));
    picked.set(id, chosen);
  }

  // Urutan tampil: rencana dihitung ulang dengan jumlah yang benar-benar
  // keluar (kolam kecil bisa memberi lebih sedikit dari kuotanya).
  const final = packAllPlan(
    { id: holder.id, name: holder.name, tier: "grand", sort_order: holder.sort_order, count: picked.get(holder.id)?.length ?? 0 },
    others.map((item) => ({ id: item.id, name: item.name, tier: item.card_tier, sort_order: item.sort_order, count: picked.get(item.id)?.length ?? 0 })),
  );
  const winners: PackWinner[] = final.groups.flatMap((group) => (picked.get(group.prize_id) ?? []).slice(0, group.count).map((candidate, index) => ({
    ref: candidate.ref,
    kind: candidate.kind,
    name: candidate.name,
    company: candidate.company,
    seat: candidate.seat,
    is_backup: false,
    slot_order: index + 1,
    prize_id: group.prize_id,
  })));
  return { winners, plan: { mode: "all", groups: final.groups } };
}

/**
 * Kursi hadiah yang sudah terpakai di satu sesi.
 *
 * Pemenang utama terhitung selama belum dibatalkan (yang masih menunggu sudah
 * memegang kursinya). Cadangan baru terhitung setelah DISAHKAN: saat itu ia
 * menggantikan pemenang utama yang tidak hadir dan memegang hadiahnya. Tanpa
 * cadangan di hitungan ini, kursi yang diisi cadangan terbaca kosong dan bisa
 * diundi sekali lagi.
 */
async function seatsTaken(eventId: string, prizeId: number, sessionId: number | null): Promise<number | null> {
  let query = getSupabaseServiceClient()
    .from("undian_winners")
    .select("is_backup,status")
    .eq("event_id", eventId)
    .eq("prize_id", prizeId)
    .neq("status", "rejected");
  query = sessionId === null ? query.is("session_id", null) : query.eq("session_id", sessionId);
  const { data, error } = await query;
  if (error) return null;
  return ((data ?? []) as { is_backup: boolean; status: string }[])
    .filter((row) => !row.is_backup || row.status === "confirmed").length;
}
