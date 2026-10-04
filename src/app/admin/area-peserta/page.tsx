"use client";

import { Info, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/event-link";
import { Banner, Button, MetaSeparator, Pane, PaneBody, PaneFooter, Switch, TextField, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { SettingRow } from "@/components/admin/settings-panel";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { type LandingMemberAudience, type LandingMemberConfig } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";

/**
 * Area peserta: siapa yang bisa masuk ke Dashboard saya dan apa yang tampil di
 * sana. Dulu tab "Peserta" di editor Halaman acara; dipindah ke sini supaya
 * ditemukan di samping Daftar peserta dan Pengumuman, tempat panitia mencarinya.
 *
 * Disimpan lewat /api/admin/area-peserta, yang hanya menulis
 * `landing_config.member`. Editor Halaman acara tidak lagi menulis kunci itu,
 * jadi Simpan di dua layar ini tidak saling menimpa.
 */

type Hitungan = { participants: number | null; with_email: number | null; approved: number | null; accounts: number | null };
type Muat = { member: LandingMemberConfig; counts: Hitungan };

const angka = (nilai: number) => nilai.toLocaleString("en-GB");

const AUDIENCE_LABELS: Record<LandingMemberAudience, string> = {
  approved: "Participants with an approved registration",
  all: "All participants in the Participant list",
};

function catatanPilihan(key: LandingMemberAudience, counts: Hitungan | null) {
  if (key === "approved") {
    const jumlah = counts?.approved;
    return `From Registration, with the Approved status.${jumlah != null ? ` Currently ${plural(jumlah, "registration")}.` : ""}`;
  }
  const semua = counts?.participants;
  const berEmail = counts?.with_email;
  return `Includes imported participants, as long as they have an email address.${semua != null && berEmail != null ? ` Currently ${plural(semua, "participant")}, ${angka(berEmail)} with an email address.` : ""}`;
}

function Pilihan({ checked, onSelect, label, description }: { checked: boolean; onSelect: () => void; label: string; description: string }) {
  return (
    <label className={cx("flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5", checked ? "border-primary" : "border-outline-variant hover:bg-primary-soft")}>
      <input type="radio" name="siapa-masuk" checked={checked} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
      <span className="min-w-0">
        <span className="block text-body-medium font-medium text-on-surface">{label}</span>
        <span className="mt-0.5 block text-body-medium text-on-surface-variant">{description}</span>
      </span>
    </label>
  );
}

const TAUTAN = "rounded-sm font-medium text-primary hover:underline";

export default function AreaPesertaPage() {
  const [data, setData] = useState<Muat | null>(null);
  const [anggota, setAnggotaState] = useState<LandingMemberConfig | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [simpan, setSimpan] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setGalatMuat("");
    const response = await fetch(eventApiPath("/api/admin/area-peserta"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setGalatMuat("Couldn't load Participant area settings."); return; }
    const body = (await response.json()) as Muat;
    setData(body);
    setAnggotaState(body.member);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const set = (patch: Partial<LandingMemberConfig>) => setAnggotaState((current) => current && { ...current, ...patch });
  const berubah = Boolean(data && anggota && JSON.stringify(anggota) !== JSON.stringify(data.member));

  async function save() {
    if (!anggota) return;
    const umpanBalik = anggota.feedback_url?.trim() || null;
    if (anggota.enabled && umpanBalik && !/^https?:\/\/\S+\.\S+/.test(umpanBalik)) {
      toast.error("Link not valid", "The feedback form link must start with https:// or be left empty.");
      return;
    }
    setSimpan(true);
    const response = await fetch(eventApiPath("/api/admin/area-peserta"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member: { ...anggota, feedback_url: umpanBalik } }),
    }).catch(() => null);
    setSimpan(false);
    if (!response) { toast.error("Connection failed", "Reload to see the current state."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error("Couldn't save", pesanGalatApi(body) ?? "Try again."); return; }
    const tersimpan = (body as { member: LandingMemberConfig }).member;
    setData((current) => current && { ...current, member: tersimpan });
    setAnggotaState(tersimpan);
    toast.success("Saved", tersimpan.enabled ? "The Event page uses the new settings right away." : "Participant area closed. The Sign in button no longer shows on the Event page.");
  }

  const counts = data?.counts ?? null;

  return (
    <div lang="en" className="contents">
    <WorkspacePage width="form">
      <WorkspaceHeader
        title="Participant area"
        meta={
          <>
            <span>{anggota ? (anggota.enabled ? "Open" : "Closed") : "Loading…"}</span>
            {counts?.accounts != null ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">{plural(counts.accounts, "participant account")}</span>
              </>
            ) : null}
            <MetaSeparator />
            <span>News for participants is in <Link href="/admin/pengumuman/lonceng" className={TAUTAN}>Messages → Announcements</Link></span>
          </>
        }
      />

      {galatMuat ? (
        <Banner tone="error" icon={<XCircle size={18} />} actions={<Button variant="outlined" size="sm" onClick={() => void load()}>Try again</Button>}>
          {galatMuat}
        </Banner>
      ) : !anggota || !data ? (
        <Pane aria-label="Loading Participant area settings">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="grid gap-3 border-b border-outline-variant px-5 py-6 last:border-b-0 md:grid-cols-[2fr_3fr] md:gap-8">
              <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
              <div className="h-9 w-full animate-pulse rounded-md bg-surface-container-high" />
            </div>
          ))}
        </Pane>
      ) : (
        <Pane aria-label="Participant area settings">
          <PaneBody>
            <SettingRow title="Participant area" description="Participants sign in with their email and a password to see their QR code, seat and agenda.">
              <Switch
                checked={anggota.enabled}
                onChange={(value) => set({ enabled: value })}
                label="Open Participant area"
                description="The Sign in button shows on the Event page. The registration form asks for a password, so registrants get an account straight away. Imported participants create a password through the link in their email."
              />
            </SettingRow>
            {anggota.enabled ? (
              <>
                <SettingRow title="Who can sign in" description={<>Imported participants are in the <Link href="/admin/participants" className={TAUTAN}>Participant list</Link>, not in Registration.</>}>
                  <div role="radiogroup" aria-label="Who can sign in" className="flex flex-col gap-2">
                    {(Object.keys(AUDIENCE_LABELS) as LandingMemberAudience[]).map((key) => (
                      <Pilihan
                        key={key}
                        checked={(anggota.audience ?? "approved") === key}
                        onSelect={() => set({ audience: key })}
                        label={AUDIENCE_LABELS[key]}
                        description={catatanPilihan(key, counts)}
                      />
                    ))}
                  </div>
                </SettingRow>
                <SettingRow title="Shown in the Participant area">
                  <div className="flex flex-col gap-4">
                    <Switch checked={anggota.show_code !== false} onChange={(value) => set({ show_code: value })} label="QR code and participant code" description="For check-in at the entrance." />
                    <Switch checked={anggota.show_seat !== false} onChange={(value) => set({ show_seat: value })} label="Seat" description="From the Seating plan." />
                    <Switch checked={anggota.show_schedule !== false} onChange={(value) => set({ show_schedule: value })} label="Agenda" description="From the Agenda page." />
                    <Switch
                      checked={anggota.show_logistics === true}
                      onChange={(value) => set({ show_logistics: value })}
                      label="Room and bus"
                      description="From Logistics: room, roommate, bus and kit items. Turn this on once allocations are final."
                    />
                    <Switch checked={anggota.show_vote !== false} onChange={(value) => set({ show_vote: value })} label="Live voting" description="The participant code is filled in automatically on the voting page." />
                    <TextField
                      label="Feedback form link"
                      optional
                      type="url"
                      placeholder="https://"
                      hint="Leave empty if there is none. Opens in a new tab."
                      value={anggota.feedback_url ?? ""}
                      onChange={(event) => set({ feedback_url: event.target.value })}
                    />
                  </div>
                </SettingRow>
                <SettingRow title="How participants sign in">
                  <Banner tone="info" icon={<Info size={18} />}>
                    There is no activation email yet. Participants create their own password on the Sign in page, using their registration email and the participant code from the confirmation or invitation email. Participants without an email address in their data can&apos;t sign in yet.
                  </Banner>
                </SettingRow>
              </>
            ) : null}
            <SettingRow title="Set on other pages">
              <ul className="flex flex-col gap-1.5 text-body-medium text-on-surface-variant">
                <li>Event page design and the Sign in button are on the <Link href="/admin/landing" className={TAUTAN}>Event page</Link>.</li>
              </ul>
            </SettingRow>
          </PaneBody>
          <PaneFooter note={berubah ? "Unsaved changes" : null}>
            {berubah ? <Button variant="outlined" size="sm" disabled={simpan} onClick={() => setAnggotaState(data.member)}>Cancel</Button> : null}
            <Button simpan size="sm" loading={simpan} disabled={!berubah} onClick={() => void save()}>Save changes</Button>
          </PaneFooter>
        </Pane>
      )}
    </WorkspacePage>
    </div>
  );
}
