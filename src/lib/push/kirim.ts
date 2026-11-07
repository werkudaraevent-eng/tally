import webpush from "web-push";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { PesanPush } from "@/lib/push/pesan";

/**
 * Pengiriman Web Push dari server. Kunci VAPID situs disimpan di tabel
 * web_push_keys (migrasi 202611070002) dan dibuat sendiri saat pertama dipakai:
 * tidak ada env var yang perlu diisi panitia atau developer.
 *
 * Subjek VAPID (kontak bagi layanan push peramban bila ada masalah) memakai
 * alamat situs produksi.
 */

type Kunci = { publicKey: string; privateKey: string };

let simpanan: Promise<Kunci | null> | null = null;

async function muatAtauBuat(): Promise<Kunci | null> {
  const client = getSupabaseServiceClient();
  const baca = async () => {
    const { data, error } = await client.from("web_push_keys").select("public_key,private_key").eq("kunci", "vapid").maybeSingle();
    if (error) return { galat: true as const, kunci: null };
    const baris = data as { public_key: string; private_key: string } | null;
    return { galat: false as const, kunci: baris ? { publicKey: baris.public_key, privateKey: baris.private_key } : null };
  };
  const pertama = await baca();
  // Tabel belum ada (migrasi belum dijalankan) atau galat baca: fitur mati.
  if (pertama.galat) return null;
  if (pertama.kunci) return pertama.kunci;
  // Belum ada: buat. Dua server yang membuat bersamaan -> yang kalah membaca
  // milik pemenang, jadi semua langganan memakai satu kunci yang sama.
  const baru = webpush.generateVAPIDKeys();
  await client.from("web_push_keys").upsert({ kunci: "vapid", public_key: baru.publicKey, private_key: baru.privateKey } as never, { onConflict: "kunci", ignoreDuplicates: true });
  return (await baca()).kunci;
}

/** Kunci VAPID situs, atau null bila tabelnya belum ada. Disimpan per proses. */
export async function kunciPush(): Promise<Kunci | null> {
  if (!simpanan) {
    simpanan = muatAtauBuat().then((kunci) => {
      if (!kunci) simpanan = null; // coba lagi di permintaan berikutnya
      return kunci;
    });
  }
  return simpanan;
}

function subjek(): string {
  const situs = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return situs ? `https://${situs}` : "https://localhost";
}

export type Langganan = { id: string; endpoint: string; p256dh: string; auth: string };
export type HasilKirim = { terkirim: number; gagal: number; dihapus: number };

/**
 * Kirim satu pesan ke beberapa perangkat. Langganan yang sudah dicabut
 * peramban (404/410) dihapus, karena tidak akan pernah berlaku lagi.
 * Tidak pernah melempar galat: hasilnya dihitung.
 */
export async function kirimPush(langganan: Langganan[], pesan: PesanPush, opsi: { ttlDetik?: number } = {}): Promise<HasilKirim> {
  const hasil: HasilKirim = { terkirim: 0, gagal: 0, dihapus: 0 };
  if (!langganan.length) return hasil;
  const kunci = await kunciPush();
  if (!kunci) return { ...hasil, gagal: langganan.length };
  const client = getSupabaseServiceClient();
  const isi = JSON.stringify(pesan);
  const mati: string[] = [];
  const berhasil: string[] = [];
  // 20 sekaligus: cukup cepat untuk 1.000 perangkat, tanpa membanjiri jaringan.
  for (let i = 0; i < langganan.length; i += 20) {
    await Promise.all(
      langganan.slice(i, i + 20).map(async (satu) => {
        try {
          await webpush.sendNotification({ endpoint: satu.endpoint, keys: { p256dh: satu.p256dh, auth: satu.auth } }, isi, {
            vapidDetails: { subject: subjek(), publicKey: kunci.publicKey, privateKey: kunci.privateKey },
            TTL: opsi.ttlDetik ?? 12 * 60 * 60,
            urgency: "high",
            contentEncoding: "aes128gcm",
            timeout: 10_000,
          });
          hasil.terkirim += 1;
          berhasil.push(satu.id);
        } catch (galat) {
          const kode = (galat as { statusCode?: number }).statusCode;
          if (kode === 404 || kode === 410) mati.push(satu.id);
          else hasil.gagal += 1;
        }
      }),
    );
  }
  if (mati.length) {
    await client.from("push_subscriptions").delete().in("id", mati);
    hasil.dihapus = mati.length;
  }
  if (berhasil.length) {
    for (let i = 0; i < berhasil.length; i += 200) {
      await client.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() } as never).in("id", berhasil.slice(i, i + 200));
    }
  }
  return hasil;
}
