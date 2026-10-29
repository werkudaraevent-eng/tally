"use client";

import { Info, Warning, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "@/components/event-link";
import { Banner, Button, MetaSeparator, Pane, PaneBody, PaneFooter, SelectField, StatusChip, Switch, TextField, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { SettingRow } from "@/components/admin/settings-panel";
import { PratinjauPeserta, type PesertaPratinjau } from "./pratinjau-peserta";
import { SusunanBeranda, type BlokPeserta } from "./susunan-beranda";
import { KontakDaruratForm } from "./kontak-darurat";
import { KelompokSetiapHari } from "./setiap-hari";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { LANDING_BLOCK_LABELS, MEMBER_HOME_BUILTINS, type LandingMemberAudience, type LandingMemberConfig, type LandingMemberSignIn } from "@/lib/domain";
import { TETAP_HORIZON, letakkanHorizon, urutanHorizon } from "@/lib/member/susunan-horizon";
import { CONTOH_KOLOM_MAX, type PilihanKolomMasuk } from "@/lib/member/kolom-masuk";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { rapikanBantuan } from "@/lib/member/kontak-darurat";
import { OUTFIT_LABEL_BAWAAN, OUTFIT_LABEL_MAX, labelOutfit } from "@/lib/outfit";
import { FOTO_OUTFIT_SALAH, fotoOutfitSah, unggahFotoOutfit } from "@/lib/outfit-foto";
import { bacaOutfitSetiapHari, drafSetiapHari, galatSetiapHari, kirimanSetiapHari, samaSetiapHari, type IsianSetiapHari } from "@/lib/outfit-setiap-hari";
import { plural } from "@/lib/plural";
import { BAGIAN_LOGISTIK, bedaBagian, type BagianLogistik } from "@/lib/logistik/bagian-tampil";

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
type Muat = {
  member: LandingMemberConfig;
  counts: Hitungan;
  /** Tata letak dashboard peserta; null = Editorial atau Forum, tanpa Participant home. */
  layout: "gathering" | "modern" | null;
  blocks: BlokPeserta[];
  /** Semua blok acara, untuk batas Add block. */
  blocks_count?: number;
  /** Peserta bawaan pratinjau: yang pertama punya kamar dan bus. */
  preview: PesertaPratinjau | null;
  /** Check-in > Checkpoints dinyalakan. */
  checkpoints_on?: boolean;
  /** Gathering Horizon: Participant home tanpa "Today's agenda". */
  horizon?: boolean;
  /** Horizon: tanggal dan jam mulai acara untuk "Preview on" di pratinjau. */
  dates?: { start: string | null; end: string | null; start_time?: string | null };
  /** Horizon: jumlah bagian Agenda yang punya dress code (baris Today's dress code). */
  outfit_days?: number;
  /** Horizon: ada telepon atau email panitia di Event settings (baris Help card). */
  organiser_contact?: boolean;
  /** Halaman English ada: Emergency and help menampilkan isian English. */
  english?: boolean;
  /** Kolom yang boleh dipakai cara masuk Participant fields. */
  sign_in_options?: PilihanKolomMasuk[];
  /** Pengiriman email aktif (Email code membutuhkannya). */
  email_ready?: boolean;
};

/** Ringkasan dua kolom terpilih: yang punya keduanya, dan yang kembar. */
type RingkasKolom = { participants: number; filled: number; duplicates: number };

/**
 * Cara masuk, dengan kekuatannya. Kekuatan ditulis di pilihannya sendiri,
 * bukan di catatan terpisah: panitia harus melihat risikonya saat memilih.
 */
const CARA: { key: LandingMemberSignIn; label: string; kuat: "Strong" | "Weak"; description: string }[] = [
  {
    key: "password",
    label: "Email and password",
    kuat: "Strong",
    description: "Participants create a password from a one-time link in their email.",
  },
  {
    key: "email_code",
    label: "Email code",
    kuat: "Strong",
    description: "Participants enter their email and get a 6-digit code each time. No password to create or remember.",
  },
  {
    key: "fields",
    label: "Participant fields",
    kuat: "Weak",
    description: "Participants sign in with two fields from their own participant data, such as Email and Phone. Nothing is emailed.",
  },
];

const angka = (nilai: number) => nilai.toLocaleString("en-GB");

const AUDIENCE_LABELS: Record<LandingMemberAudience, string> = {
  approved: "Participants with an approved registration",
  all: "All participants in the Participant list",
};

function catatanPilihan(key: LandingMemberAudience, counts: Hitungan | null, cara: LandingMemberSignIn = "password") {
  if (key === "approved") {
    const jumlah = counts?.approved;
    return `From Registration, with the Approved status.${jumlah != null ? ` Currently ${plural(jumlah, "registration")}.` : ""}`;
  }
  const semua = counts?.participants;
  const berEmail = counts?.with_email;
  if (cara === "fields") return `Includes imported participants and walk-ins.${semua != null ? ` Currently ${plural(semua, "participant")}.` : ""}`;
  return `Includes imported participants, as long as they have an email address.${semua != null && berEmail != null ? ` Currently ${plural(semua, "participant")}, ${angka(berEmail)} with an email address.` : ""}`;
}

function Pilihan({ checked, onSelect, label, description, name = "siapa-masuk", tanda }: { checked: boolean; onSelect: () => void; label: string; description: string; name?: string; tanda?: ReactNode }) {
  return (
    <label className={cx("flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5", checked ? "border-primary" : "border-outline-variant hover:bg-primary-soft")}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium font-medium text-on-surface">{label}{tanda}</span>
        <span className="mt-0.5 block text-body-medium text-on-surface-variant">{description}</span>
      </span>
    </label>
  );
}

const TAUTAN = "rounded-sm font-medium text-primary hover:underline";

/** Blok khusus peserta yang tersembunyi saat dimuat dan kini matanya menyala. */
function blokDinyalakan(data: Muat | null, anggota: LandingMemberConfig): string[] {
  const awal = new Set(data?.member.home?.hidden ?? []);
  const kini = new Set(anggota.home?.hidden ?? []);
  return (data?.blocks ?? []).filter((block) => block.show_on === "member" && awal.has(block.id) && !kini.has(block.id)).map((block) => block.id);
}

export default function AreaPesertaPage() {
  const [data, setData] = useState<Muat | null>(null);
  const [anggota, setAnggotaState] = useState<LandingMemberConfig | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [simpan, setSimpan] = useState(false);
  const toast = useToast();
  const [slug, setSlug] = useState<string | null>(null);
  const [pesertaPratinjau, setPesertaPratinjau] = useState<PesertaPratinjau | null>(null);
  const [sorot, setSorot] = useState<{ id: string; n: number } | null>(null);
  // Kartu yang diklik atau diseret di pratinjau: barisnya disorot tanpa menggulir pratinjau.
  const [pilihKartu, setPilihKartu] = useState<string | null>(null);
  const [tanpaNama, setTanpaNama] = useState<number | null>(null);
  // Every day: foto yang sedang diunggah, galat unggah atau 422 Save changes,
  // dan versi kelompoknya (Cancel dan Save memasangnya ulang, jadi Note yang
  // dibuka tanpa isi kembali menjadi Add note).
  const [unggahFoto, setUnggahFoto] = useState(false);
  const [galatSetiap, setGalatSetiap] = useState<string | null>(null);
  const [versiSetiap, setVersiSetiap] = useState(0);

  const load = useCallback(async () => {
    setGalatMuat("");
    const response = await fetch(eventApiPath("/api/admin/area-peserta"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setGalatMuat("Couldn't load Participant area settings."); return; }
    const body = (await response.json()) as Muat;
    setData(body);
    setAnggotaState(body.member);
    setPesertaPratinjau((current) => current ?? body.preview ?? null);
    const dariAlamat = window.location.pathname.match(/^\/e\/([^/]+)/)?.[1];
    setSlug(dariAlamat ? decodeURIComponent(dariAlamat) : null);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  // ?fokus= dari Agenda › Dress code ("Edit in Participant area", "Rename in
  // Participant area"): baris Dress code page jauh di bawah Participant home,
  // jadi kolomnya dibawa ke layar dan difokus, sekali sesudah dimuat. Ke
  // tengah, bukan ke atas: bagian atas layar tertutup bilah atas yang menempel.
  const tautanFokus = useRef(false);
  useEffect(() => {
    if (!data || tautanFokus.current) return;
    tautanFokus.current = true;
    const fokus = new URLSearchParams(window.location.search).get("fokus");
    const pilih = fokus === "setiap-hari" ? "[data-setiap-apa]" : fokus === "nama-halaman" ? "[data-nama-halaman]" : null;
    if (!pilih) return;
    window.requestAnimationFrame(() => {
      const kolom = document.querySelector<HTMLElement>(pilih);
      kolom?.scrollIntoView({ block: "center" });
      kolom?.focus({ preventScroll: true });
    });
  }, [data]);

  const set = (patch: Partial<LandingMemberConfig>) => setAnggotaState((current) => current && { ...current, ...patch });
  const berubah = Boolean(data && anggota && JSON.stringify(anggota) !== JSON.stringify(data.member));
  // Untuk meninggalkan halaman, foto Every day yang masih diunggah dihitung
  // belum disimpan, seperti di Agenda: hasilnya mendarat di draf halaman ini.
  const belumDisimpan = berubah || unggahFoto;

  /** Satu kolom Every day. Isian yang sama persis dengan yang tersimpan kembali ke nilai tersimpan, bukan perubahan. */
  const ubahSetiapHari = (ubah: Partial<IsianSetiapHari>) => {
    setGalatSetiap(null);
    setAnggotaState((current) => current && { ...current, outfit_every_day: drafSetiapHari(current.outfit_every_day, ubah, data?.member.outfit_every_day) });
  };

  function gagalFoto(pesan: string) {
    setGalatSetiap(pesan);
    toast.error("Photo not uploaded", pesan);
  }

  /** Foto Every day lewat endpoint unggah foto Agenda (lib/outfit-foto.ts); masuk draf sampai Save changes. */
  async function unggahFotoSetiapHari(file: File) {
    setGalatSetiap(null);
    // Diperiksa di sini dulu: berkas yang salah tidak perlu diunggah untuk ditolak.
    if (!fotoOutfitSah(file)) {
      gagalFoto(FOTO_OUTFIT_SALAH);
      return;
    }
    setUnggahFoto(true);
    const hasil = await unggahFotoOutfit(file);
    setUnggahFoto(false);
    if ("galat" in hasil) {
      gagalFoto(hasil.galat);
      return;
    }
    ubahSetiapHari({ photo_url: hasil.url });
    toast.info("Photo uploaded", "Select Save changes to show it to participants.");
  }

  async function save() {
    if (!anggota) return;
    const umpanBalik = anggota.feedback_url?.trim() || null;
    if (anggota.enabled && umpanBalik && !/^https?:\/\/\S+\.\S+/.test(umpanBalik)) {
      toast.error("Link not valid", "The feedback form link must start with https:// or be left empty.");
      return;
    }
    const bantuan = rapikanBantuan(anggota.help);
    setTanpaNama(bantuan.tanpaNama);
    if (bantuan.tanpaNama !== null) {
      toast.error("A contact has no name", "Add a name or role in Emergency and help, or remove that contact.");
      window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-kontak="${bantuan.tanpaNama}"]`)?.focus());
      return;
    }
    setSimpan(true);
    const setelan: Partial<LandingMemberConfig> = { ...anggota, feedback_url: umpanBalik, help: bantuan.help };
    // Kontak darurat hanya dikirim bila diubah di layar ini, supaya tab lain
    // yang basi tidak menghapus kontak yang baru disimpan di tab ini.
    if (JSON.stringify(anggota.help ?? null) === JSON.stringify(data?.member.help ?? null)) delete setelan.help;
    // Nama halaman Dress code: satu-satunya penulisnya layar ini (Agenda hanya
    // menampilkannya). Sama dengan kontak, hanya dikirim bila diubah di sini.
    if ((anggota.outfit_label ?? "").trim() === (data?.member.outfit_label ?? "").trim()) delete setelan.outfit_label;
    else setelan.outfit_label = anggota.outfit_label?.trim() || null;
    // Every day: juga hanya ditulis layar ini, dan hanya dikirim bila diubah di
    // sini. What to wear kosong dikirim sebagai null: server tidak menyimpan apa pun.
    if (samaSetiapHari(anggota.outfit_every_day, data?.member.outfit_every_day)) delete setelan.outfit_every_day;
    else setelan.outfit_every_day = kirimanSetiapHari(anggota.outfit_every_day);
    // Bagian Logistik juga bisa diubah dari Logistics > Vehicles: hanya
    // bagian yang diubah di sini yang dikirim, supaya tab basi tidak menimpanya.
    // Dikirim per bagian, digabung server ke simpanan terkini (QA #331 M1).
    delete setelan.hide_logistics;
    const logistikBagian = bedaBagian(data?.member.hide_logistics, anggota.hide_logistics);
    // Sama untuk plat dan kru bus: disunting di Logistics > Buses.
    delete setelan.show_bus_plate;
    delete setelan.show_bus_crew;
    // Akses panitia disunting di Check-in > Checkpoints > Committee access:
    // salinan di layar ini bisa basi, jadi tidak pernah dikirim dari sini.
    delete setelan.committee;
    const response = await fetch(eventApiPath("/api/admin/area-peserta"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Mata blok khusus peserta yang dinyalakan di sini sejak dimuat: hanya
      // itu yang dinyalakan lagi di Page sections (lihat PATCH Area peserta).
      body: JSON.stringify({ member: setelan, blok_nyala: blokDinyalakan(data, anggota), logistik_bagian: logistikBagian }),
    }).catch(() => null);
    setSimpan(false);
    if (!response) { toast.error("Connection failed", "Reload to see the current state."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Every day yang ditolak (422) juga disebut di kelompoknya, di dekat kolomnya.
      setGalatSetiap(galatSetiapHari(body));
      toast.error("Couldn't save", pesanGalatApi(body) ?? "Try again.");
      return;
    }
    const tersimpan = (body as { member: LandingMemberConfig }).member;
    setData((current) => current && { ...current, member: tersimpan });
    setAnggotaState(tersimpan);
    setGalatSetiap(null);
    setVersiSetiap((versi) => versi + 1);
    toast.success("Saved", tersimpan.enabled ? "The Event page uses the new settings right away." : "Participant area closed. The Sign in button no longer shows on the Event page.");
  }

  const counts = data?.counts ?? null;
  // Modern dan Gathering: pratinjau di kiri, setelan di kanan, seperti Event page.
  const berpratinjau = Boolean(data?.layout && slug);

  // Gathering Horizon: seret kartu di pratinjau ponsel, dengan urutan dan aturan
  // tempat tetap yang sama dengan daftar Participant home (susunan-horizon.ts).
  const susunanHorizon = data?.horizon && data.layout === "gathering" && anggota ? urutanHorizon(anggota.home, data.blocks.map((block) => block.id)) : null;
  const seretPratinjau =
    susunanHorizon && data
      ? {
          gerak: susunanHorizon.filter((id) => !TETAP_HORIZON.has(id)),
          // Teman sekamar tidak punya kartu sendiri: barisnya di kartu perjalanan.
          kartu: susunanHorizon.filter((id) => id !== "roommates"),
          urutan: susunanHorizon,
          label: Object.fromEntries(
            susunanHorizon.map((id) => {
              const bawaan = MEMBER_HOME_BUILTINS.horizon.find((item) => item.id === id);
              const blok = data.blocks.find((block) => block.id === id);
              return [id, bawaan?.label ?? blok?.heading ?? (blok ? LANDING_BLOCK_LABELS[blok.type] : id)];
            }),
          ),
        }
      : null;
  const cariBaris = (id: string) => {
    setPilihKartu(id);
    window.requestAnimationFrame(() => document.getElementById(`baris-beranda-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <div lang="en" className="contents">
    <WorkspacePage width={berpratinjau ? "full" : "form"} fill={berpratinjau}>
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
        <div className={berpratinjau ? "flex min-h-0 flex-1 flex-col gap-4 lg:flex-row" : "contents"}>
        {berpratinjau && slug ? (
          // Layar pendek (1280x588): halaman bergulir utuh, jadi pratinjau menempel
          // di bawah bilah atas agar tetap terlihat saat menyunting bagian bawah.
          <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col *:flex-1 lg:min-h-0 lg:short:sticky lg:short:top-[calc(var(--workspace-top,58px)+16px)] lg:short:h-[calc(100dvh-var(--workspace-top,58px)-32px)] lg:short:self-start">
            <PratinjauPeserta
              slug={slug}
              peserta={pesertaPratinjau}
              onPeserta={setPesertaPratinjau}
              member={anggota}
              sorot={sorot}
              reloadKey={0}
              tanggal={data.horizon ? (data.dates ?? null) : null}
              seret={seretPratinjau}
              onPindah={(id, sebelum) => {
                if (!susunanHorizon) return;
                // Seret yang tidak memindah apa pun tidak mengubah draf (dan tidak mengubah simpanan lama).
                const baru = letakkanHorizon(susunanHorizon, id, sebelum);
                if (baru.join() !== susunanHorizon.join()) set({ home: { ...anggota.home, order: baru } });
                cariBaris(id);
              }}
              onPilihKartu={cariBaris}
            />
          </div>
        ) : null}
        <Pane aria-label="Participant area settings" className={berpratinjau ? "lg:w-[460px] lg:shrink-0" : undefined}>
          <PaneBody>
            <SettingRow stacked={berpratinjau} title="Participant area" description="Participants sign in to see their QR code, seat and agenda.">
              <Switch
                checked={anggota.enabled}
                onChange={(value) => set({ enabled: value })}
                label="Open Participant area"
                description={(anggota.sign_in ?? "password") === "password" ? "The Sign in button shows on the Event page. The registration form asks for a password, so registrants get an account straight away. Imported participants create a password through the link in their email." : "The Sign in button shows on the Event page. Choose how participants sign in below."}
              />
            </SettingRow>
            {anggota.enabled ? (
              <>
                <SettingRow stacked={berpratinjau} title="Who can sign in" description={<>Imported participants are in the <Link href="/admin/participants" className={TAUTAN}>Participant list</Link>, not in Registration.</>}>
                  <div role="radiogroup" aria-label="Who can sign in" className="flex flex-col gap-2">
                    {(Object.keys(AUDIENCE_LABELS) as LandingMemberAudience[]).map((key) => (
                      <Pilihan
                        key={key}
                        checked={(anggota.audience ?? "approved") === key}
                        onSelect={() => set({ audience: key })}
                        label={AUDIENCE_LABELS[key]}
                        description={catatanPilihan(key, counts, anggota.sign_in ?? "password")}
                      />
                    ))}
                  </div>
                </SettingRow>
                {data.layout ? (
                  <SettingRow
                    stacked={berpratinjau}
                    title="Participant home"
                    description={
                      seretPratinjau
                        ? "What participants see first after signing in, and in what order. Drag a row here or a card in the preview; click a row to find its card."
                        : "What participants see first after signing in, and in what order. Click a row to find it in the preview."
                    }
                  >
                    <SusunanBeranda
                      layout={data.layout}
                      member={anggota}
                      blocks={data.blocks}
                      checkpointsOn={data.checkpoints_on === true}
                      horizon={data.horizon === true}
                      jumlahBlok={data.blocks_count ?? data.blocks.length}
                      adaPerubahan={belumDisimpan}
                      set={set}
                      dipilih={pilihKartu ?? sorot?.id ?? null}
                      onPilih={(id) => {
                        setPilihKartu(null);
                        setSorot((current) => ({ id, n: (current?.n ?? 0) + 1 }));
                      }}
                      // Every day (draf, seperti pratinjau) juga mengisi kartunya, tanpa tab Agenda sekalipun.
                      outfitAda={data.outfit_days === undefined ? undefined : data.outfit_days > 0 || bacaOutfitSetiapHari(anggota.outfit_every_day) !== null}
                      outfitDari={
                        data.outfit_days === undefined || bacaOutfitSetiapHari(anggota.outfit_every_day) === null
                          ? "agenda"
                          : data.outfit_days > 0
                            ? "keduanya"
                            : "setiap"
                      }
                      kontakAda={data.organiser_contact}
                    />
                  </SettingRow>
                ) : null}
                {seretPratinjau ? (
                  <SettingRow
                    stacked={berpratinjau}
                    title="Dress code page"
                    description="A page under each day of the participant Schedule, and Today’s dress code on Participant home. With Agenda off for participants, it is a tab on wide screens and a Menu row on phones."
                  >
                    {/* Every day dan nama halaman untuk seluruh acara, jadi di sini, bukan per tab di Agenda. */}
                    <div className="flex min-w-0 flex-col gap-4">
                      <KelompokSetiapHari
                        key={versiSetiap}
                        nilai={anggota.outfit_every_day}
                        onUbah={ubahSetiapHari}
                        labelHalaman={labelOutfit(anggota.outfit_label)}
                        tautanAgenda={
                          <Link
                            href="/admin/rundown"
                            className={TAUTAN}
                            onClick={(event) => {
                              if (!belumDisimpan) return;
                              event.preventDefault();
                              toast.error("Save or cancel your changes first", "Leaving Participant area now would lose them.");
                            }}
                          >
                            Agenda › Dress code
                          </Link>
                        }
                        unggah={unggahFoto}
                        menyimpan={simpan}
                        galat={galatSetiap}
                        onUnggah={(file) => void unggahFotoSetiapHari(file)}
                      />
                      <TextField
                        label="Page name"
                        optional
                        maxLength={OUTFIT_LABEL_MAX}
                        counter
                        hint={`For the whole event. Left empty, participants see “${OUTFIT_LABEL_BAWAAN}”.`}
                        value={anggota.outfit_label ?? ""}
                        onChange={(event) => {
                          const nilai = event.target.value;
                          // Dikosongkan saat yang tersimpan juga kosong: kembali ke nilai tersimpan, bukan perubahan.
                          set({ outfit_label: nilai.trim() || data.member.outfit_label?.trim() ? nilai : data.member.outfit_label });
                        }}
                        data-nama-halaman=""
                      />
                    </div>
                  </SettingRow>
                ) : null}
                {data.horizon === true ? (
                  <SettingRow
                    stacked={berpratinjau}
                    title="Emergency and help"
                    description={
                      <>
                        Emergency services, not organisers: nearest hospital, police, hotel front desk. Shown in Menu and on Profile, each with Call, WhatsApp and Map buttons where they apply. Organiser contacts come from{" "}
                        <Link href="/admin/settings" className={TAUTAN}>Event settings</Link>.
                      </>
                    }
                  >
                    <KontakDaruratForm
                      help={anggota.help}
                      onChange={(help) => set({ help })}
                      blocks={data.blocks}
                      helpBlock={anggota.help_block ?? null}
                      onSalin={(help) => set({ help })}
                      onFokus={() => setSorot((current) => (current?.id === "darurat" ? current : { id: "darurat", n: (current?.n ?? 0) + 1 }))}
                      tanpaNama={tanpaNama}
                      english={data.english === true}
                    />
                  </SettingRow>
                ) : null}
                <SettingRow stacked={berpratinjau} title="Shown in the Participant area">
                  <div className="flex flex-col gap-4">
                    <Switch checked={anggota.show_code !== false} onChange={(value) => set({ show_code: value })} label="QR code and participant code" description="For check-in at the entrance." />
                    {/* Gathering (Horizon juga) tidak menampilkan kursi, voting, dan tautan umpan balik (U-14): sakelarnya disembunyikan. */}
                    {data.layout !== "gathering" ? (
                      <Switch checked={anggota.show_seat !== false} onChange={(value) => set({ show_seat: value })} label="Seat" description="From the Seating plan." />
                    ) : null}
                    <Switch checked={anggota.show_schedule !== false} onChange={(value) => set({ show_schedule: value })} label="Agenda" description="From the Agenda page." />
                    <div className="flex flex-col gap-2">
                      <Switch
                        checked={anggota.show_logistics === true}
                        onChange={(value) => set({ show_logistics: value })}
                        label="Logistics"
                        description="From Logistics. Turn this on once allocations are final, then choose which parts participants see."
                      />
                      {anggota.show_logistics === true ? (
                        <BagianLogistikPilih hidden={anggota.hide_logistics ?? []} onChange={(hide_logistics) => set({ hide_logistics })} />
                      ) : null}
                    </div>
                    {data.layout !== "gathering" ? (
                      <>
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
                      </>
                    ) : null}
                  </div>
                </SettingRow>
                <SettingRow stacked={berpratinjau} title="How participants sign in" description="One way for every participant of this event.">
                  <CaraMasuk anggota={anggota} set={set} data={data} />
                </SettingRow>
              </>
            ) : null}
            <SettingRow stacked={berpratinjau} title="Set on other pages">
              <ul className="flex flex-col gap-1.5 text-body-medium text-on-surface-variant">
                <li>Event page design and the Sign in button are on the <Link href="/admin/landing" className={TAUTAN}>Event page</Link>.</li>
              </ul>
            </SettingRow>
          </PaneBody>
          <PaneFooter note={belumDisimpan ? "Unsaved changes" : null}>
            {/* Menunggu foto Every day selesai diunggah: tersimpan bersama, bukan mendarat sesudahnya sebagai suntingan baru. */}
            {berubah ? (
              <Button
                variant="outlined"
                size="sm"
                disabled={simpan || unggahFoto}
                onClick={() => {
                  setAnggotaState(data.member);
                  setGalatSetiap(null);
                  setVersiSetiap((versi) => versi + 1);
                }}
              >
                Cancel
              </Button>
            ) : null}
            <Button simpan size="sm" loading={simpan} disabled={!berubah || unggahFoto} onClick={() => void save()}>Save changes</Button>
          </PaneFooter>
        </Pane>
        </div>
      )}
    </WorkspacePage>
    </div>
  );
}

/** Participant area > How participants sign in. */
function CaraMasuk({ anggota, set, data }: { anggota: LandingMemberConfig; set: (patch: Partial<LandingMemberConfig>) => void; data: Muat }) {
  const cara = anggota.sign_in ?? "password";
  const pilihanKolom = data.sign_in_options ?? [];
  const kolom = anggota.sign_in_fields ?? null;
  const [ringkas, setRingkas] = useState<{ kunci: string; isi: RingkasKolom | null } | null>(null);
  const kunci = cara === "fields" && kolom ? kolom.join(",") : null;

  useEffect(() => {
    if (!kunci) return;
    let batal = false;
    void fetch(eventApiPath(`/api/admin/area-peserta?kolom=${encodeURIComponent(kunci)}`), { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<RingkasKolom>) : null))
      .catch(() => null)
      .then((isi) => { if (!batal) setRingkas({ kunci, isi }); });
    return () => { batal = true; };
  }, [kunci]);

  const label = (id: string) => pilihanKolom.find((pilihan) => pilihan.id === id)?.label ?? id;
  const pilih = (key: LandingMemberSignIn) =>
    set(key === "fields" && !kolom ? { sign_in: key, sign_in_fields: ["email", "phone"] } : { sign_in: key });
  const ubahKolom = (indeks: 0 | 1, id: string) => {
    const baru: [string, string] = kolom ? [...kolom] : ["email", "phone"];
    baru[indeks] = id;
    set({ sign_in_fields: baru });
  };
  const hasil = ringkas && ringkas.kunci === kunci ? ringkas.isi : null;
  const contoh = anggota.sign_in_examples ?? null;
  // Dikunci id kolom, jadi contoh ikut kolomnya bila First/Second ditukar.
  // Kolom yang kedua isiannya kosong dibuang dari simpanan.
  const ubahContoh = (id: string, patch: { text?: string; en?: string }) => {
    const isi = { ...contoh?.[id], ...patch };
    const sisa = Object.fromEntries(Object.entries(contoh ?? {}).filter(([kunci]) => kunci !== id));
    set({ sign_in_examples: isi.text?.trim() || isi.en?.trim() ? { ...sisa, [id]: isi } : sisa });
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="How participants sign in" className="flex flex-col gap-2">
        {CARA.map((pilihan) => (
          <Pilihan
            key={pilihan.key}
            name="cara-masuk"
            checked={cara === pilihan.key}
            onSelect={() => pilih(pilihan.key)}
            label={pilihan.label}
            tanda={<StatusChip tone={pilihan.kuat === "Strong" ? "success" : "error"}>{pilihan.kuat}</StatusChip>}
            description={pilihan.description}
          />
        ))}
      </div>

      {cara === "password" ? (
        <>
          <Banner tone="info" icon={<Info size={18} />}>
            Participants create their password from a one-time link in their email: the Sign-in link message, &quot;Forgot password?&quot; on the Sign in page, or the walk-in email below. Participants without an email address in their data can&apos;t sign in.
          </Banner>
          <Switch
            checked={anggota.walkin_link === true}
            onChange={(value) => set({ walkin_link: value })}
            label="Email a sign-in link to walk-ins"
            description="When the desk saves a walk-in with an email address, they get a link to create a password. Valid for 7 days. Only new walk-ins get it, nobody already on the list."
          />
          {anggota.walkin_link === true && (anggota.audience ?? "approved") !== "all" ? (
            <Banner tone="warning" icon={<Warning size={18} />}>
              Walk-ins have no approved registration, so no email goes out while Who can sign in is set to {AUDIENCE_LABELS.approved.toLowerCase()}. Choose {AUDIENCE_LABELS.all.toLowerCase()}.
            </Banner>
          ) : null}
        </>
      ) : null}

      {cara === "email_code" ? (
        data.email_ready === false ? (
          <Banner tone="error" icon={<XCircle size={18} />}>
            Email sending isn&apos;t set up, so no codes can be sent and nobody can sign in. Choose Email and password until it is.
          </Banner>
        ) : (
          <Banner tone="info" icon={<Info size={18} />}>
            Codes expire after 10 minutes and work once. Participants without an email address in their data can&apos;t sign in. Passwords made earlier still work if you switch back.
          </Banner>
        )
      ) : null}

      {cara === "fields" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {([0, 1] as const).map((indeks) => {
              const id = kolom?.[indeks] ?? null;
              const pilihanIni = pilihanKolom.find((pilihan) => pilihan.id === id);
              const bawaan = pilihanIni?.contoh;
              // Halaman English tanpa Example in English: Example, lalu bawaan English.
              const bawaanEn = contoh?.[id ?? ""]?.text?.trim() || pilihanIni?.contoh_en;
              return (
                <div key={indeks} className="flex min-w-0 flex-col gap-3">
                  <SelectField
                    label={indeks === 0 ? "First field" : "Second field"}
                    value={id ?? ""}
                    onChange={(event) => ubahKolom(indeks, event.target.value)}
                  >
                    {pilihanKolom
                      .filter((pilihan) => pilihan.id !== kolom?.[indeks === 0 ? 1 : 0])
                      .map((pilihan) => (
                        <option key={pilihan.id} value={pilihan.id}>{pilihan.label}</option>
                      ))}
                  </SelectField>
                  {id ? (
                    <>
                      <TextField
                        label="Example"
                        optional
                        maxLength={CONTOH_KOLOM_MAX}
                        placeholder={bawaan}
                        hint={bawaan ? "Faded text in the sign-in box. Empty = the default shown here." : "Faded text in the sign-in box."}
                        value={contoh?.[id]?.text ?? ""}
                        onChange={(event) => ubahContoh(id, { text: event.target.value })}
                      />
                      {data.english ? (
                        <TextField
                          label="Example in English"
                          optional
                          maxLength={CONTOH_KOLOM_MAX}
                          placeholder={bawaanEn}
                          hint={bawaanEn ? "Empty = the text shown here." : "Empty = no example."}
                          value={contoh?.[id]?.en ?? ""}
                          onChange={(event) => ubahContoh(id, { en: event.target.value })}
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="text-body-medium text-on-surface-variant" aria-live="polite">
            {!kunci
              ? "Choose two fields."
              : !hasil
                ? "Counting participants…"
                : `${angka(hasil.filled - hasil.duplicates)} of ${plural(hasil.participants, "participant")} can sign in.${hasil.filled < hasil.participants ? ` ${angka(hasil.participants - hasil.filled)} ${hasil.participants - hasil.filled === 1 ? "is" : "are"} missing one of the fields.` : ""}${hasil.duplicates ? ` ${angka(hasil.duplicates)} share the same pair with someone else, so ${hasil.duplicates === 1 ? "that participant" : "they"} can't sign in this way.` : ""}`}
          </p>
          {kolom ? (
            <Banner tone="error" icon={<Warning size={18} />}>
              <span className="block font-semibold">
                Anyone who knows a participant&apos;s {label(kolom[0])} and {label(kolom[1])} can open their area.
              </span>
              Colleagues often know both, and phone numbers appear on name lists. They would see the ticket QR code, seat and room. ID numbers such as NIK are personal data: everyone with access to the Participant list or Export can see them. Use this only when the organiser accepts that risk. Switching to another sign-in method later signs out everyone who signed in this way.
            </Banner>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const LABEL_BAGIAN: Record<BagianLogistik, { label: string; tab: string }> = {
  rooms: { label: "Room and roommates", tab: "kamar" },
  vehicles: { label: "Vehicle and trips", tab: "bus" },
  trains: { label: "Train tickets", tab: "kereta" },
  items: { label: "Kit items", tab: "barang" },
};

/**
 * Bagian Logistik yang sampai ke peserta (lib/logistik/bagian-tampil.ts).
 * Disimpan sebagai yang disembunyikan, jadi acara lama dan bagian baru tampil.
 */
function BagianLogistikPilih({ hidden, onChange }: { hidden: readonly string[]; onChange: (hidden: BagianLogistik[]) => void }) {
  const semuaMati = BAGIAN_LOGISTIK.every((bagian) => hidden.includes(bagian));
  return (
    <fieldset className="flex flex-col gap-1 rounded-md bg-surface-container-low px-3 py-2">
      <legend className="sr-only">Logistics parts participants see</legend>
      <ul className="flex flex-col">
        {BAGIAN_LOGISTIK.map((bagian) => (
          <li key={bagian} className="flex min-h-10 items-center gap-3">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1 text-body-medium text-on-surface">
              <input
                type="checkbox"
                checked={!hidden.includes(bagian)}
                onChange={(event) => onChange(BAGIAN_LOGISTIK.filter((isi) => (isi === bagian ? !event.target.checked : hidden.includes(isi))))}
                className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
              />
              <span className="min-w-0 flex-1">{LABEL_BAGIAN[bagian].label}</span>
            </label>
            <Link href={`/admin/logistik?tab=${LABEL_BAGIAN[bagian].tab}`} aria-label={`Edit ${LABEL_BAGIAN[bagian].label} in Logistics`} className="shrink-0 rounded-sm text-body-small font-medium text-primary hover:underline">
              Edit in Logistics
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-body-small text-on-surface-variant">
        {semuaMati
          ? "Every part is hidden, so participants see no Travel tab. Same as turning Logistics off."
          : "A hidden part never reaches participants: no card, no Home row, no Next up reminder. Logistics data stays as it is."}
      </p>
    </fieldset>
  );
}
