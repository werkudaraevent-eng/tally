import type { RegistrationFormConfig } from "@/lib/domain";
import { barisInfo, bacaInfoScan, butuhLogistik, infoBerlaku, pilihanInfo, type BarisInfo, type DataPesertaInfo } from "@/lib/info-scan";
import { loadMemberLogistics } from "@/lib/logistik/peserta";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";

/**
 * Baris Shown after scan untuk orang yang barusan dipindai di sesi ini.
 *
 * Disusun di server: ponsel petugas hanya menerima info yang dipilih panitia
 * untuk orang ini, bukan seluruh jawaban form atau seluruh logistiknya.
 * Null = sesi belum diatur (atau kolomnya belum ada): lembar tetap menulis
 * Company · Title seperti sebelumnya. Tidak melempar: galat = null.
 *
 * Logistik dibaca untuk petugas, tidak terikat sakelar Logistics di
 * Participant area (itu untuk halaman peserta).
 */
export async function infoTamu(
  event: { id: string; time_zone?: string | null; registration_form_config?: unknown },
  sessionId: number,
  participantId: string,
): Promise<BarisInfo[] | null> {
  try {
    const db = getSupabaseServiceClient();
    // select *: scan_fields baru ada setelah migrasi 202610300001.
    const { data: sesi } = await db.from("attendance_sessions").select("*").eq("event_id", event.id).eq("id", sessionId).maybeSingle();
    const tersimpan = bacaInfoScan((sesi as { scan_fields?: unknown } | null)?.scan_fields);
    if (!tersimpan || tersimpan.length === 0) return null;

    const config = event.registration_form_config as RegistrationFormConfig | null;
    const adaLogistik = tersimpan.some((kunci) => kunci.startsWith("logistik:"));
    // Logistik dianggap ada di sini: nilai kosong ditulis "Not set", dan
    // penghitungan tabelnya hanya untuk menyusun menu di admin.
    const info = infoBerlaku(tersimpan, pilihanInfo(config?.fields ?? [], { hotel: adaLogistik, vehicle: adaLogistik, train: adaLogistik }));
    if (info.length === 0) return null;

    const [peserta, logistik] = await Promise.all([
      db.from("participants").select("company,title,participant_type,extra").eq("event_id", event.id).eq("id", participantId).maybeSingle(),
      butuhLogistik(info) ? loadMemberLogistics(event.id, participantId, true) : Promise.resolve(null),
    ]);
    const baris = (peserta.data ?? {}) as Partial<Pick<DataPesertaInfo, "company" | "title" | "participant_type" | "extra">>;
    const stays = logistik ? (logistik.stays.length > 0 ? logistik.stays : logistik.lodging ? [logistik.lodging] : []) : [];
    const data: DataPesertaInfo = {
      company: baris.company ?? null,
      title: baris.title ?? null,
      participant_type: baris.participant_type ?? null,
      extra: baris.extra && typeof baris.extra === "object" ? baris.extra : null,
      stays,
      transport: logistik?.transport ?? null,
      trains: logistik?.trains ?? [],
    };
    return barisInfo(info, data, new Date(), timeZoneOffset(normalizeTimeZone(event.time_zone)));
  } catch {
    return null;
  }
}
