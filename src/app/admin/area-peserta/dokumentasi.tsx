"use client";

import { Megaphone } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import Link from "@/components/event-link";
import { Button, SegmentedField, Switch, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";
import type { LandingMemberConfig } from "@/lib/domain";
import { withEventPrefix } from "@/lib/event-path";
import { labelTanpaTanggal, POLA_URL_DOKUMENTASI, URL_DOKUMENTASI_MAX, type ModeDokumentasi } from "@/lib/member/dokumentasi";
import type { HariAgendaAdmin } from "@/lib/member/dokumentasi-server";
import { KUNCI_DRAF_PENGUMUMAN } from "@/lib/sasaran-pengumuman";

/**
 * Participant area > Event photos and videos (lib/member/dokumentasi.ts).
 * Hari dan sesi dibaca dari Agenda; di sini hanya link-nya. Pengumuman tidak
 * dikirim dari sini: "Tell participants" membuka pengumuman baru yang sudah
 * terisi di Messages, dan panitia sendiri yang menekan kirim.
 */
type Setelan = NonNullable<LandingMemberConfig["photos"]>;

const MODE: { value: ModeDokumentasi; label: string }[] = [
  { value: "event", label: "One link" },
  { value: "day", label: "Per day" },
  { value: "session", label: "Per session" },
];

const TAUTAN = "rounded-sm font-medium text-primary hover:underline";

function galat(url: string | undefined | null): string | undefined {
  const isi = url?.trim();
  return isi && !POLA_URL_DOKUMENTASI.test(isi) ? "Use a full link that starts with https://" : undefined;
}

/** "Fri 6 Nov · Batch 2": tanggal di label bagian tidak ditulis dua kali. */
function judulHari(bagian: HariAgendaAdmin, urutan: number): string {
  const label = bagian.date ? labelTanpaTanggal(bagian.label) : bagian.label;
  return [tanggal(bagian.date) ?? `Day ${urutan + 1}`, label].filter(Boolean).join(" · ");
}

function tanggal(nilai: string | null): string | null {
  return nilai ? new Date(`${nilai}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : null;
}

/** Peta link tanpa isian kosong: kolom yang dikosongkan dihapus, bukan disimpan "". */
function petaBaru(peta: Record<string, string> | null | undefined, kunci: string, nilai: string): Record<string, string> {
  const hasil = { ...(peta ?? {}) };
  if (nilai.trim()) hasil[kunci] = nilai;
  else delete hasil[kunci];
  return hasil;
}

const DRAF = {
  id: { title: "Foto dan video acara sudah bisa dilihat", body: "Buka Beranda di halaman peserta untuk melihat album foto dan video acara.", link_label: "Lihat foto dan video" },
  en: { title: "Event photos and videos are ready", body: "Open Home in the participant area to see the event photo and video albums.", link_label: "See photos and videos" },
};

export function DokumentasiPeserta({
  photos,
  agenda,
  lang,
  slug,
  adaPerubahan,
  onChange,
}: {
  photos: LandingMemberConfig["photos"];
  /** null = Agenda gagal dibaca. */
  agenda: HariAgendaAdmin[] | null;
  lang: "id" | "en";
  slug: string | null;
  adaPerubahan: boolean;
  onChange: (photos: Setelan) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const isi: Setelan = { enabled: photos?.enabled === true, mode: photos?.mode ?? "day", url: photos?.url ?? null, days: photos?.days ?? null, sessions: photos?.sessions ?? null };
  const ubah = (patch: Partial<Setelan>) => onChange({ ...isi, ...patch });
  const hari = agenda ?? [];
  const sesi = hari.flatMap((bagian) => bagian.items);
  // Hanya link untuk hari atau baris yang masih ada di Agenda (link baris yang sudah dihapus tidak tampil).
  const adaDiAgenda = new Set((isi.mode === "day" ? hari.map((bagian) => bagian.id) : sesi.map((item) => item.id)).map(String));
  const terisi =
    isi.mode === "event"
      ? isi.url?.trim() ? 1 : 0
      : Object.entries((isi.mode === "day" ? isi.days : isi.sessions) ?? {}).filter(([kunci, url]) => url.trim() && adaDiAgenda.has(kunci)).length;

  function umumkan() {
    const teks = DRAF[lang];
    const tautan = isi.mode === "event" && isi.url?.trim() ? isi.url.trim() : slug ? `${window.location.origin}/e/${encodeURIComponent(slug)}/peserta` : "";
    try {
      window.sessionStorage.setItem(KUNCI_DRAF_PENGUMUMAN, JSON.stringify({ ...teks, link_url: tautan, waktu: Date.now() }));
    } catch {
      toast.error("Couldn't open Announcements", "Your browser blocked it. Write the announcement in Messages instead.");
      return;
    }
    router.push(withEventPrefix("/admin/pengumuman/lonceng", window.location.pathname));
  }

  const kolom = (key: string, label: string, nilai: string | undefined | null, set: (url: string) => void, hint?: string) => (
    <TextField
      key={key}
      label={label}
      type="url"
      inputMode="url"
      placeholder="https://"
      maxLength={URL_DOKUMENTASI_MAX}
      value={nilai ?? ""}
      onChange={(event) => set(event.target.value)}
      error={galat(nilai)}
      hint={hint}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Switch
        checked={isi.enabled}
        onChange={(enabled) => ubah({ enabled })}
        label="Show photo and video links on Participant home"
        description="Off by default. Signed-in participants see each link once its day or session has ended."
      />
      {isi.enabled ? (
        <>
          <SegmentedField
            label="Links"
            options={MODE}
            value={isi.mode}
            onChange={(mode) => ubah({ mode })}
            hint={
              isi.mode === "event"
                ? "One folder for everyone. Shows once the event has ended."
                : isi.mode === "day"
                  ? "One folder per Agenda day. Shows after that day's last item."
                  : "One folder per Agenda item. Shows after it ends (items without an end time: at their start time), only to participants who see that item, and also under the item in the Schedule."
            }
          />
          {isi.mode === "event" ? kolom("acara", "Album link", isi.url, (url) => ubah({ url: url.trim() ? url : null }), "Leave empty to show nothing.") : null}
          {isi.mode !== "event" && agenda === null ? <p className="text-body-medium text-error">Couldn&apos;t load the Agenda. Reload the page to add links.</p> : null}
          {isi.mode !== "event" && agenda !== null && (isi.mode === "day" ? hari.length === 0 : sesi.length === 0) ? (
            <p className="text-body-medium text-on-surface-variant">
              No published {isi.mode === "day" ? "days" : "items"} in the <Link href="/admin/rundown" className={TAUTAN}>Agenda</Link> yet.
            </p>
          ) : null}
          {isi.mode === "day"
            ? hari.map((bagian, urutan) =>
                kolom(
                  `hari-${bagian.id}`,
                  judulHari(bagian, urutan),
                  isi.days?.[String(bagian.id)],
                  (url) => ubah({ days: petaBaru(isi.days, String(bagian.id), url) }),
                ),
              )
            : null}
          {isi.mode === "session"
            ? hari
                .filter((bagian) => bagian.items.length > 0)
                .map((bagian, urutan) => (
                  <fieldset key={bagian.id} className="flex min-w-0 flex-col gap-3">
                    <legend className="mb-1 text-label-large font-semibold text-on-surface-variant">{judulHari(bagian, urutan)}</legend>
                    {bagian.items.map((item) =>
                      kolom(
                        `sesi-${item.id}`,
                        [item.time ? (item.end ? `${item.time}–${item.end}` : item.time) : null, item.title].filter(Boolean).join(" · "),
                        isi.sessions?.[String(item.id)],
                        (url) => ubah({ sessions: petaBaru(isi.sessions, String(item.id), url) }),
                        item.limited ? "Only participants who see this item under Who sees it." : undefined,
                      ),
                    )}
                  </fieldset>
                ))
            : null}
          <p className="text-body-medium text-on-surface-variant">
            Set each folder to &ldquo;Anyone with the link&rdquo; first, or participants are asked to request access. To check what they see, set the preview date to after the event.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button variant="outlined" size="sm" icon={<Megaphone size={16} />} disabled={adaPerubahan || terisi === 0} onClick={umumkan}>
              Tell participants
            </Button>
            <span className="text-body-medium text-on-surface-variant">
              {adaPerubahan ? "Save your changes first." : terisi === 0 ? "Add a link first." : isi.mode === "event"
                  ? "Opens a new announcement in Messages. Nothing is sent until you publish it. The album shows once the event has ended."
                  : "Opens a new announcement in Messages. Nothing is sent until you publish it. Each album shows once its day or session has ended, so publish after that."}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
