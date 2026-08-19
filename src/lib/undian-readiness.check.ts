import assert from "node:assert/strict";
import { undianCanRun, undianReadiness, type ReadinessInput, type ReadinessPrize } from "./undian-readiness.ts";

function prize(over: Partial<ReadinessPrize> = {}): ReadinessPrize {
  return { id: 1, name: "Sepeda", is_active: true, winner_quota: 1, source: "participants", entry_group_id: null, ...over };
}

function input(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return { prizes: [prize()], pools: { 1: { candidates: 40 } }, groups: [], activeSession: null, pageTitle: "Undian", ...over };
}

const step = (steps: ReturnType<typeof undianReadiness>, id: string) => steps.find((row) => row.id === id)!;

// Keadaan siap: dua butir pengunci lulus, jadi kontrol boleh dibuka meski sesi
// belum dibuka.
{
  const steps = undianReadiness(input());
  assert.equal(step(steps, "hadiah").done, true);
  assert.equal(step(steps, "kandidat").done, true);
  assert.equal(step(steps, "sesi").done, false);
  assert.equal(undianCanRun(steps), true, "sesi belum dibuka tidak boleh mengunci");
}

// Tidak ada hadiah aktif: mengunci.
{
  const steps = undianReadiness(input({ prizes: [prize({ is_active: false })] }));
  assert.equal(step(steps, "hadiah").done, false);
  assert.equal(undianCanRun(steps), false);
}

// Kuota nol dihitung sebagai tidak ada hadiah: hadiah yang tidak bisa
// menghasilkan pemenang tidak membuat undian siap.
{
  const steps = undianReadiness(input({ prizes: [prize({ winner_quota: 0 })] }));
  assert.equal(step(steps, "hadiah").done, false);
  assert.equal(undianCanRun(steps), false);
}

// Daftar hadiah kosong TIDAK boleh melaporkan "setiap hadiah punya kandidat".
// Tanpa penjagaan ini, `every` pada array kosong menghasilkan true dan panel
// menampilkan centang hijau untuk undian yang belum bisa dijalankan.
{
  const steps = undianReadiness(input({ prizes: [], pools: {} }));
  assert.equal(step(steps, "kandidat").done, false);
  assert.equal(step(steps, "kandidat").detail, "Menunggu hadiah aktif.");
}

// Syarat hadiah tidak cocok dengan siapa pun: mengunci, dan nama hadiahnya
// disebut karena itulah yang harus dibuka panitia.
{
  const steps = undianReadiness(input({ pools: { 1: { candidates: 0 } } }));
  assert.equal(step(steps, "kandidat").done, false);
  assert.equal(undianCanRun(steps), false);
  assert.ok(step(steps, "kandidat").detail.includes("Sepeda"));
}

// Hadiah tanpa entri di pools sama dengan nol kandidat, bukan lolos diam-diam.
{
  const steps = undianReadiness(input({ pools: {} }));
  assert.equal(step(steps, "kandidat").done, false);
}

// Hadiah bersumber daftar entri yang grupnya belum dipilih.
{
  const steps = undianReadiness(input({ prizes: [prize({ source: "entries", entry_group_id: null })], pools: { 1: { candidates: 0 } } }));
  assert.equal(step(steps, "sumber").done, false);
  // Butir sumber memberi tahu, tapi yang mengunci tetap butir kandidat: satu
  // sebab tidak boleh memasang dua gembok.
  assert.equal(step(steps, "sumber").blocking, false);
  assert.equal(undianCanRun(steps), false);
}

// Grup ada tapi kosong: sama saja belum siap.
{
  const steps = undianReadiness(input({
    prizes: [prize({ source: "entries", entry_group_id: 7 })],
    groups: [{ id: 7, entry_count: 0 }],
    pools: { 1: { candidates: 0 } },
  }));
  assert.equal(step(steps, "sumber").done, false);
}

// Grup terisi: butir sumber lulus dan menyebut jumlah entri.
{
  const steps = undianReadiness(input({
    prizes: [prize({ source: "entries", entry_group_id: 7 })],
    groups: [{ id: 7, entry_count: 120 }],
    pools: { 1: { candidates: 120 } },
  }));
  assert.equal(step(steps, "sumber").done, true);
  assert.ok(step(steps, "sumber").detail.includes("120 entri"));
  assert.equal(undianCanRun(steps), true);
}

// Lebih dari tiga hadiah bermasalah diringkas, bukan ditulis semua.
{
  const many = [1, 2, 3, 4, 5].map((id) => prize({ id, name: `Hadiah ${id}` }));
  const steps = undianReadiness(input({ prizes: many, pools: {} }));
  assert.ok(step(steps, "kandidat").detail.includes("dan 2 lainnya"));
}

// Judul panggung kosong: peringatan, bukan gembok.
{
  const steps = undianReadiness(input({ pageTitle: "   " }));
  assert.equal(step(steps, "panggung").done, false);
  assert.equal(undianCanRun(steps), true);
}

console.log("undian-readiness.check.ts OK");
