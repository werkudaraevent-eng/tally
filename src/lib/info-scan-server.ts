import { kunciNomorBagasi } from "@/lib/bagasi/nomor";
import type { RegistrationFormConfig } from "@/lib/domain";
import { barisInfo, bacaInfoScan, type AcuanAgenda, butuhLogistik, infoBerlaku, kunciInti, pilihanInfo, type BarisInfo, type DataPesertaInfo } from "@/lib/info-scan";
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
    const config = event.registration_form_config as RegistrationFormConfig | null;
    const pilihanTersimpan = bacaInfoScan((sesi as { scan_fields?: unknown } | null)?.scan_fields);
    // Meja bagasi (Drop-off atau Pick-up) dengan Luggage number: nomornya
    // selalu baris pertama dan besar, juga bila panitia tidak memilihnya di
    // Shown after scan. Sesi yang belum diatur tetap mendapat Company · Job
    // title di bawahnya.
    const mejaBagasi = (sesi as { records_luggage?: boolean; luggage_pickup?: boolean } | null)?.records_luggage === true
      || (sesi as { luggage_pickup?: boolean } | null)?.luggage_pickup === true;
    const kunciNomor = mejaBagasi ? kunciNomorBagasi(config) : null;
    const pilihanNomor = kunciNomor ? `extra:${kunciNomor}` : null;
    // Tetap paling banyak BATAS_INFO_SCAN baris: bacaInfoScan memotongnya.
    const tersimpan = pilihanNomor
      ? bacaInfoScan([`*${pilihanNomor}`, ...(pilihanTersimpan ?? ["base:company", "base:title"]).filter((kunci) => kunciInti(kunci) !== pilihanNomor)])
      : pilihanTersimpan;
    if (!tersimpan || tersimpan.length === 0) return null;

    const adaLogistik = tersimpan.some((kunci) => kunciInti(kunci).startsWith("logistik:"));
    // Logistik dianggap ada di sini: nilai kosong ditulis "Not set", dan
    // penghitungan tabelnya hanya untuk menyusun menu di admin.
    const info = infoBerlaku(tersimpan, pilihanInfo(config?.fields ?? [], { hotel: adaLogistik, vehicle: adaLogistik, train: adaLogistik }));
    if (info.length === 0) return null;

    const [peserta, logistik, acuan] = await Promise.all([
      db.from("participants").select("company,title,participant_type,extra").eq("event_id", event.id).eq("id", participantId).maybeSingle(),
      butuhLogistik(info) ? loadMemberLogistics(event.id, participantId, true) : Promise.resolve(null),
      info.some((p) => p.kunci === "logistik:vehicle") ? acuanAgendaSesi(event.id, sessionId) : Promise.resolve([]),
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
    const hasil = barisInfo(info, data, new Date(), timeZoneOffset(normalizeTimeZone(event.time_zone)), acuan);
    return pilihanNomor && info[0]?.kunci === pilihanNomor
      ? hasil.map((baris, i) => (i === 0 ? { ...baris, label: "Luggage number", besar: true } : baris))
      : hasil;
  } catch {
    return null;
  }
}

/**
 * Jam baris Agenda yang ditautkan ke checkpoint sesi ini (checkpoints.
 * agenda_item_ids), untuk Vehicle: trip sebelum jam itu, bukan trip hari scan.
 * Galat atau tanpa tautan = [] (Vehicle kembali ke aturan tanggal scan).
 */
export async function acuanAgendaSesi(eventId: string, sessionId: number): Promise<AcuanAgenda[]> {
  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db.from("checkpoints").select("agenda_item_ids").eq("event_id", eventId).eq("session_id", sessionId);
    if (error || !data) return [];
    const cp = data as Array<{ agenda_item_ids: unknown }>;
    const ids = [...new Set(cp.flatMap((row) => (Array.isArray(row.agenda_item_ids) ? (row.agenda_item_ids as unknown[]) : [])).filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0))].slice(0, 32);
    if (ids.length === 0) return [];
    const { data: barisData } = await db.from("rundown_items").select("id,start_time,section_id").eq("event_id", eventId).in("id", ids);
    const baris = (barisData ?? []) as Array<{ id: number; start_time: unknown; section_id: unknown }>;
    const bagianIds = [...new Set(baris.map((row) => row.section_id).filter((id): id is number => typeof id === "number"))];
    if (bagianIds.length === 0) return [];
    const { data: bagianData } = await db.from("rundown_sections").select("id,event_date").eq("event_id", eventId).in("id", bagianIds);
    const bagian = (bagianData ?? []) as Array<{ id: number; event_date: string | null }>;
    const tanggal = new Map(bagian.map((row) => [row.id, row.event_date]));
    return baris.flatMap((row) => {
      const date = tanggal.get(row.section_id as number);
      return date && typeof row.start_time === "string" ? [{ date, start: row.start_time }] : [];
    });
  } catch {
    return [];
  }
}

/** Sesi yang checkpoint-nya tertaut ke Agenda, untuk label di admin. Galat = kosong. */
export async function sesiDenganAgenda(eventId: string): Promise<Set<number>> {
  try {
    const { data, error } = await getSupabaseServiceClient().from("checkpoints").select("session_id,agenda_item_ids").eq("event_id", eventId);
    if (error || !data) return new Set();
    return new Set((data as Array<{ session_id: unknown; agenda_item_ids: unknown }>).filter((row) => Array.isArray(row.agenda_item_ids) && row.agenda_item_ids.length > 0 && typeof row.session_id === "number").map((row) => row.session_id as number));
  } catch {
    return new Set();
  }
}
