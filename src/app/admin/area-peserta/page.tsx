"use client";

import { Info, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/event-link";
import { Banner, Button, MetaSeparator, Pane, PaneBody, PaneFooter, Switch, TextField, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { SettingRow } from "@/components/admin/settings-panel";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { LANDING_MEMBER_AUDIENCE_LABELS, type LandingMemberAudience, type LandingMemberConfig } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";

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

const angka = (nilai: number) => nilai.toLocaleString("id-ID");

function catatanPilihan(key: LandingMemberAudience, counts: Hitungan | null) {
  if (key === "approved") {
    const jumlah = counts?.approved;
    return `Dari Pendaftaran dengan status disetujui.${jumlah != null ? ` Saat ini ${angka(jumlah)} pendaftaran.` : ""}`;
  }
  const semua = counts?.participants;
  const berEmail = counts?.with_email;
  return `Termasuk peserta impor, selama datanya punya email.${semua != null && berEmail != null ? ` Saat ini ${angka(berEmail)} dari ${angka(semua)} peserta punya email.` : ""}`;
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
    if (!response?.ok) { setGalatMuat("Setelan area peserta gagal dimuat."); return; }
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
      toast.error("Tautan belum valid", "Tautan formulir umpan balik harus diawali https:// atau dikosongkan.");
      return;
    }
    setSimpan(true);
    const response = await fetch(eventApiPath("/api/admin/area-peserta"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member: { ...anggota, feedback_url: umpanBalik } }),
    }).catch(() => null);
    setSimpan(false);
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat keadaan sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error("Gagal disimpan", pesanGalatApi(body) ?? "Coba lagi."); return; }
    const tersimpan = (body as { member: LandingMemberConfig }).member;
    setData((current) => current && { ...current, member: tersimpan });
    setAnggotaState(tersimpan);
    toast.success("Tersimpan", tersimpan.enabled ? "Halaman acara langsung memakai setelan baru." : "Area peserta ditutup. Tombol Masuk tidak tampil di halaman acara.");
  }

  const counts = data?.counts ?? null;

  return (
    <WorkspacePage width="form">
      <WorkspaceHeader
        title="Area peserta"
        meta={
          <>
            <span>{anggota ? (anggota.enabled ? "Dibuka" : "Ditutup") : "Memuat"}</span>
            {counts?.accounts != null ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">{angka(counts.accounts)} akun peserta</span>
              </>
            ) : null}
            <MetaSeparator />
            <span>Kabar untuk peserta ada di <Link href="/admin/pengumuman/lonceng" className={TAUTAN}>Pesan peserta → Pengumuman</Link></span>
          </>
        }
      />

      {galatMuat ? (
        <Banner tone="error" icon={<XCircle size={18} />} actions={<Button variant="outlined" size="sm" onClick={() => void load()}>Coba lagi</Button>}>
          {galatMuat}
        </Banner>
      ) : !anggota || !data ? (
        <Pane aria-label="Memuat setelan area peserta">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="grid gap-3 border-b border-outline-variant px-5 py-6 last:border-b-0 md:grid-cols-[2fr_3fr] md:gap-8">
              <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
              <div className="h-9 w-full animate-pulse rounded-md bg-surface-container-high" />
            </div>
          ))}
        </Pane>
      ) : (
        <Pane aria-label="Setelan area peserta">
          <PaneBody>
            <SettingRow title="Area peserta" description="Peserta masuk dengan email dan kata sandi untuk melihat kode QR, kursi, dan susunan acaranya.">
              <Switch
                checked={anggota.enabled}
                onChange={(value) => set({ enabled: value })}
                label="Buka area peserta"
                description="Tombol Masuk tampil di halaman acara. Formulir pendaftaran meminta kata sandi, jadi pendaftar langsung punya akun. Peserta impor membuat kata sandi lewat tautan di email."
              />
            </SettingRow>
            {anggota.enabled ? (
              <>
                <SettingRow title="Siapa yang bisa masuk" description={<>Peserta impor ada di <Link href="/admin/participants" className={TAUTAN}>Daftar peserta</Link>, bukan di Pendaftaran.</>}>
                  <div role="radiogroup" aria-label="Siapa yang bisa masuk" className="flex flex-col gap-2">
                    {(Object.keys(LANDING_MEMBER_AUDIENCE_LABELS) as LandingMemberAudience[]).map((key) => (
                      <Pilihan
                        key={key}
                        checked={(anggota.audience ?? "approved") === key}
                        onSelect={() => set({ audience: key })}
                        label={LANDING_MEMBER_AUDIENCE_LABELS[key]}
                        description={catatanPilihan(key, counts)}
                      />
                    ))}
                  </div>
                </SettingRow>
                <SettingRow title="Yang tampil di area peserta">
                  <div className="flex flex-col gap-4">
                    <Switch checked={anggota.show_code !== false} onChange={(value) => set({ show_code: value })} label="Kode QR dan kode peserta" description="Untuk registrasi di pintu masuk." />
                    <Switch checked={anggota.show_seat !== false} onChange={(value) => set({ show_seat: value })} label="Kursi" description="Dari Denah kursi." />
                    <Switch checked={anggota.show_schedule !== false} onChange={(value) => set({ show_schedule: value })} label="Susunan acara" description="Dari Rundown acara." />
                    <Switch checked={anggota.show_vote !== false} onChange={(value) => set({ show_vote: value })} label="Voting langsung" description="Kode peserta terisi otomatis di halaman voting." />
                    <TextField
                      label="Tautan formulir umpan balik"
                      optional
                      type="url"
                      placeholder="https://"
                      hint="Kosongkan bila tidak ada. Dibuka di tab baru."
                      value={anggota.feedback_url ?? ""}
                      onChange={(event) => set({ feedback_url: event.target.value })}
                    />
                  </div>
                </SettingRow>
                <SettingRow title="Cara peserta masuk">
                  <Banner tone="info" icon={<Info size={18} />}>
                    Belum ada email aktivasi. Peserta membuat kata sandi sendiri di halaman Masuk dengan email pendaftaran dan kode peserta dari email konfirmasi atau undangan. Peserta tanpa email di datanya belum bisa masuk.
                  </Banner>
                </SettingRow>
              </>
            ) : null}
            <SettingRow title="Diatur di halaman lain">
              <ul className="flex flex-col gap-1.5 text-body-medium text-on-surface-variant">
                <li>Tampilan halaman acara dan tombol Masuk di <Link href="/admin/landing" className={TAUTAN}>Halaman acara</Link>.</li>
              </ul>
            </SettingRow>
          </PaneBody>
          <PaneFooter note={berubah ? "Perubahan belum disimpan" : null}>
            {berubah ? <Button variant="outlined" size="sm" disabled={simpan} onClick={() => setAnggotaState(data.member)}>Batalkan</Button> : null}
            <Button simpan size="sm" loading={simpan} disabled={!berubah} onClick={() => void save()}>Simpan perubahan</Button>
          </PaneFooter>
        </Pane>
      )}
    </WorkspacePage>
  );
}
