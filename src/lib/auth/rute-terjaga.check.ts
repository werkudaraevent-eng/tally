/**
 * Penjaga statis: setiap handler API (GET/POST/PUT/PATCH/DELETE di
 * src/app/api/**\/route.ts) harus memeriksa siapa pemanggilnya, langsung atau
 * lewat fungsi lokal di berkas yang sama (mis. `siapkan(request)` yang memanggil
 * requireRequestEvent). Rute yang sengaja publik harus tercatat di PUBLIK
 * beserta alasannya, per method. Rute di bawah api/admin TIDAK boleh publik.
 *
 * Ini tidak membuktikan perannya benar (itu tugas QA per PR), tetapi menangkap
 * rute baru yang lupa diberi penjaga sama sekali.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PENJAGA = /\b(requireRequestEvent|requireUser|requireMemberEvent|getCurrentUser|kunciDariRequest)\s*\(|process\.env\.CRON_SECRET/;
const METHOD = /^(GET|POST|PUT|PATCH|DELETE)$/;

/** Jalur relatif terhadap src/app/api, tanpa /route.ts. Alasan wajib diisi. */
const PUBLIK: Record<string, { method: string[]; alasan: string }> = {
  "auth/login": { method: ["POST"], alasan: "langkah pertama masuk staf; dibatasi begin_login_attempt" },
  "auth/login/kode": { method: ["POST"], alasan: "langkah kode authenticator; butuh cookie tally_pending bertanda tangan" },
  "auth/setup": { method: ["GET", "POST"], alasan: "setup dua langkah; butuh cookie tally_pending tahap setup" },
  "display/leaderboard": { method: ["GET"], alasan: "layar panggung publik" },
  "display/reveal": { method: ["GET"], alasan: "layar panggung publik" },
  "display/settings": { method: ["GET"], alasan: "layar panggung publik (PUT tetap dijaga)" },
  "jejak/buka/[token]": { method: ["GET"], alasan: "piksel buka email; token bertanda tangan, jawaban selalu sama" },
  "jejak/klik": { method: ["POST"], alasan: "catat klik email; token bertanda tangan, jawaban selalu 204" },
  join: { method: ["GET"], alasan: "tautan QR publik ke acara" },
  leaderboard: { method: ["GET"], alasan: "papan skor publik" },
  "pesan/berhenti": { method: ["GET", "POST"], alasan: "berhenti langganan; token bertanda tangan" },
  "peserta/keluar": { method: ["POST"], alasan: "keluar dari sesi peserta milik pemanggil sendiri" },
  "peserta/konfirmasi": { method: ["GET"], alasan: "konfirmasi email peserta; token, tidak memberi sesi" },
  "peserta/lengkapi": { method: ["POST"], alasan: "tautan pribadi bertanda tangan atau sesi peserta" },
  "registrasi/info": { method: ["GET"], alasan: "formulir pendaftaran publik" },
  registrasi: { method: ["POST"], alasan: "pendaftaran publik lewat submit_event_registration" },
  "registrasi/upload": { method: ["POST"], alasan: "unggah berkas formulir pendaftaran publik" },
  rundown: { method: ["GET"], alasan: "agenda publik" },
  sapa: { method: ["GET"], alasan: "layar sapa publik" },
  "seat-map": { method: ["GET"], alasan: "denah kursi publik" },
  "seat-map/qr": { method: ["GET"], alasan: "denah kursi publik" },
  "seat-map/search": { method: ["GET"], alasan: "cari kursi publik" },
  "undangan/buka": { method: ["POST"], alasan: "tandai undangan dibuka; dibatasi per IP" },
  "undangan/kirim-ulang": { method: ["POST"], alasan: "kirim ulang undangan; dibatasi per IP" },
  "undian/hp": { method: ["GET"], alasan: "jadwal Cahaya HP publik" },
  "vote/participants": { method: ["GET"], alasan: "daftar kandidat voting publik" },
  vote: { method: ["POST"], alasan: "voting publik; nama pemilih tidak dikembalikan" },
  "vote/state": { method: ["GET"], alasan: "status voting publik" },
  "webhooks/resend": { method: ["POST"], alasan: "webhook Resend; tanda tangan svix diperiksa" },
};

const AKAR = "src/app/api";

function rute(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) return rute(jalur);
    return nama === "route.ts" ? [jalur] : [];
  });
}

/** Potong berkas per fungsi/konstanta tingkat atas: nama -> isi sampai deklarasi berikutnya. */
function potong(isi: string): Map<string, string> {
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=/gm;
  const awal: { nama: string; at: number }[] = [];
  for (let m = re.exec(isi); m; m = re.exec(isi)) awal.push({ nama: m[1] ?? m[2], at: m.index });
  return new Map(awal.map((a, i) => [a.nama, isi.slice(a.at, awal[i + 1]?.at ?? isi.length)]));
}

const salah: string[] = [];
const dipakai = new Set<string>();

for (const berkas of rute(AKAR)) {
  const kunci = relative(AKAR, berkas).replace(/\/?route\.ts$/, "");
  const bagian = potong(readFileSync(berkas, "utf8"));

  const terjaga = new Set([...bagian].filter(([, isi]) => PENJAGA.test(isi)).map(([nama]) => nama));
  for (let ubah = true; ubah; ) {
    ubah = false;
    for (const [nama, isi] of bagian) {
      if (terjaga.has(nama)) continue;
      if ([...terjaga].some((n) => new RegExp(`\\b${n}\\s*\\(`).test(isi))) {
        terjaga.add(nama);
        ubah = true;
      }
    }
  }

  for (const nama of bagian.keys()) {
    if (!METHOD.test(nama) || terjaga.has(nama)) continue;
    const publik = PUBLIK[kunci];
    if (publik?.method.includes(nama) && !kunci.startsWith("admin")) {
      dipakai.add(`${kunci} ${nama}`);
      continue;
    }
    salah.push(`${nama} /api/${kunci}: tidak memanggil penjaga akses dan tidak tercatat publik`);
  }
}

for (const [kunci, { method, alasan }] of Object.entries(PUBLIK)) {
  if (kunci.startsWith("admin")) salah.push(`PUBLIK /api/${kunci}: rute admin tidak boleh publik`);
  if (!alasan.trim()) salah.push(`PUBLIK /api/${kunci}: alasan kosong`);
  for (const m of method) {
    if (!dipakai.has(`${kunci} ${m}`)) salah.push(`PUBLIK /api/${kunci} ${m}: tidak ada lagi atau sekarang sudah dijaga; hapus dari daftar`);
  }
}

if (salah.length) {
  console.error("rute-terjaga.check: handler API tanpa penjaga akses:\n  " + salah.join("\n  "));
  process.exit(1);
}
console.log("rute-terjaga.check: ok");
