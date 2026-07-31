// Peserta contoh untuk mengambil gambar panduan operator.
//
// Kenapa perlu: halaman /panduan terbuka tanpa login, jadi gambar apa pun di
// public/panduan bisa dilihat siapa saja yang tahu alamatnya. Screenshot layar
// booth secara alami memuat nama peserta, instansi, dan nominal transaksi.
// Memotret peserta asli berarti menerbitkan data mereka ke internet lewat
// halaman panduan.
//
// Peserta contoh ini sengaja dibuat TANPA `source_participant_id`. Sinkronisasi
// scanner API hanya menandai baris yang punya kolom itu, sehingga peserta contoh
// tidak akan ikut ditandai "dihapus di sumber" saat sync berjalan, dan juga tidak
// akan menimpa atau bentrok dengan peserta sungguhan.
//
// Cara pakai:
//   node --env-file=.env.local scripts/panduan-demo-data.mjs setup
//   node --env-file=.env.local scripts/panduan-demo-data.mjs cleanup
//
// Node 20+ mendukung --env-file. Bila versi Node lebih lama, setel
// NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY secara manual.

import { createClient } from "@supabase/supabase-js";

const DEMO_QR = "DEMO-PANDUAN-01";
const DEMO_NAME = "Budi Contoh";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Variabel lingkungan belum lengkap.\n" +
    "Jalankan dengan: node --env-file=.env.local scripts/panduan-demo-data.mjs setup",
  );
  process.exit(1);
}

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function setup() {
  const { data: existing } = await client
    .from("participants")
    .select("id,name,qr_code")
    .eq("qr_code", DEMO_QR)
    .maybeSingle();

  if (existing) {
    console.log(`Peserta contoh sudah ada: ${existing.name} (QR ${existing.qr_code}).`);
    return existing;
  }

  const { data, error } = await client
    .from("participants")
    .insert({
      qr_code: DEMO_QR,
      name: DEMO_NAME,
      company: "PT Contoh Sejahtera",
      title: "Manager Operasional",
      // Nama boleh tampil: ini memang data contoh, bukan orang sungguhan.
      allow_name_display: true,
      participant_type: "Delegates",
      rsvp_status: "confirmed",
      // Dibiarkan null dengan sengaja — lihat catatan di atas berkas ini.
      source_participant_id: null,
    })
    .select("id,name,qr_code")
    .single();

  if (error) {
    console.error("Gagal membuat peserta contoh:", error.message);
    process.exit(1);
  }

  console.log(`Peserta contoh dibuat: ${data.name} (QR ${data.qr_code}).`);
  return data;
}

async function cleanup() {
  const { data: participant } = await client
    .from("participants")
    .select("id,name")
    .eq("qr_code", DEMO_QR)
    .maybeSingle();

  if (!participant) {
    console.log("Tidak ada peserta contoh yang perlu dihapus.");
    return;
  }

  // Order milik peserta contoh dihitung lebih dulu. Kalau ada, peserta tidak
  // dihapus: menghapusnya akan meninggalkan order tanpa pemilik dan merusak
  // laporan. Order contoh harus di-void lalu dibersihkan lewat menu admin.
  const { count } = await client
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participant.id);

  if ((count ?? 0) > 0) {
    console.log(
      `Peserta contoh masih punya ${count} order dan TIDAK dihapus.\n` +
      "Void order tersebut lalu pakai Reset data di menu admin bila perlu membersihkannya.",
    );
    return;
  }

  const { error } = await client.from("participants").delete().eq("id", participant.id);
  if (error) {
    console.error("Gagal menghapus peserta contoh:", error.message);
    process.exit(1);
  }
  console.log(`Peserta contoh dihapus: ${participant.name}.`);
}

const command = process.argv[2];
if (command === "setup") {
  await setup();
  console.log(
    "\nLangkah berikutnya:\n" +
    "  1. npm run dev, lalu login sebagai operator booth.\n" +
    `  2. Scan QR atau cari nama "${DEMO_NAME}" lewat Cari peserta manual.\n` +
    "  3. Ambil gambar tiap langkah sesuai daftar di public/panduan/README.md.\n" +
    "  4. Setelah selesai, jalankan perintah cleanup.",
  );
} else if (command === "cleanup") {
  await cleanup();
} else {
  console.error("Perintah tidak dikenal. Pakai: setup atau cleanup");
  process.exit(1);
}
