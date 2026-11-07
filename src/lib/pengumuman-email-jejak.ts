import { BATCH_MAX, sendEmailBatchDetailed } from "@/lib/email/client";
import { tokenJejak, urlBaca, urlBuka } from "@/lib/email/jejak-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Salinan email pengumuman dengan jejak (Email tracking menyala, migrasi
 * 202611070030): satu baris announcement_email_recipients per alamat dibuat
 * lebih dulu, karena id barisnya masuk ke token gambar 1x1 dan tautan baca.
 * Dikirim per potongan dengan Idempotency-Key; baris yang ditolak penyedia
 * dihapus lagi supaya laporan hanya menghitung yang benar-benar terkirim.
 *
 * Null = baris tidak bisa dibuat (mis. migrasi belum ada): pemanggil mengirim
 * tanpa jejak seperti sebelumnya.
 */
export async function kirimPengumumanBerjejak(input: {
  eventId: string;
  slug: string;
  origin: string;
  announcementId: string;
  publishedAt: string;
  penerima: Array<{ address: string; participant_id: string | null }>;
  isi: (jejak: { pixelUrl: string; bacaUrl: string }) => { subject: string; html: string; text: string };
}): Promise<{ sent: number; failed: number; error: string | null } | { notConfigured: true } | null> {
  const client = getSupabaseServiceClient();
  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (let i = 0; i < input.penerima.length; i += BATCH_MAX) {
    const potongan = input.penerima.slice(i, i + BATCH_MAX);
    const { data, error } = await client
      .from("announcement_email_recipients")
      .insert(
        potongan.map((orang) => ({
          event_id: input.eventId,
          announcement_id: input.announcementId,
          participant_id: orang.participant_id,
          address: orang.address,
          published_at: input.publishedAt,
        })) as never,
      )
      .select("id,address");
    // Potongan pertama gagal dibuat: kirim tanpa jejak. Di tengah jalan:
    // sisanya dihitung gagal, supaya tidak ada yang terkirim dua kali.
    if (error || !Array.isArray(data) || data.length !== potongan.length) {
      if (i === 0) return null;
      failed += potongan.length;
      lastError = "Couldn't record recipients for tracking.";
      continue;
    }
    const baris = data as Array<{ id: number; address: string }>;
    const items = baris.map((b) => {
      const token = tokenJejak("a", b.id);
      return {
        to: b.address,
        ...input.isi(token ? { pixelUrl: urlBuka(input.origin, input.slug, token), bacaUrl: urlBaca(input.origin, input.slug, token) } : { pixelUrl: "", bacaUrl: "" }),
      };
    });
    if (items.some((item) => !item.html.includes("/api/jejak/buka/"))) {
      // Tanpa SESSION_SECRET token tidak bisa dibuat: batalkan jejak.
      await client.from("announcement_email_recipients").delete().in("id", baris.map((b) => b.id));
      if (i === 0) return null;
      failed += potongan.length;
      continue;
    }

    const hasil = await sendEmailBatchDetailed(items, `tally:pengumuman:${input.announcementId}:${baris[0].id}`, input.eventId);
    if (hasil.kind === "not_configured") {
      await client.from("announcement_email_recipients").delete().in("id", baris.map((b) => b.id));
      return i === 0 ? { notConfigured: true } : { sent, failed: failed + input.penerima.length - i, error: "Email sender isn't set up." };
    }
    if (hasil.kind === "failed") {
      await client.from("announcement_email_recipients").delete().in("id", baris.map((b) => b.id));
      failed += potongan.length;
      lastError = hasil.error;
      continue;
    }
    const gagal = baris.filter((_, k) => !hasil.items[k].ok).map((b) => b.id);
    if (gagal.length) await client.from("announcement_email_recipients").delete().in("id", gagal);
    for (let k = 0; k < baris.length; k++) {
      const item = hasil.items[k];
      if (item.ok) {
        sent += 1;
        await client.from("announcement_email_recipients").update({ provider_id: item.id } as never).eq("id", baris[k].id);
      } else {
        failed += 1;
        lastError = item.error;
      }
    }
  }
  return { sent, failed, error: lastError };
}
