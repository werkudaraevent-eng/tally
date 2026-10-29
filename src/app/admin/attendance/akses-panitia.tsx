"use client";

import { UsersThree } from "@phosphor-icons/react";
import { useState } from "react";
import Link from "@/components/event-link";
import { Banner, Button, Dialog, FilterChip, Switch } from "@/components/m3";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import { kunciTipe, PANITIA_TIPE_MAX } from "@/lib/member/akses-panitia";

type TipeAda = { type: string; count: number; names: string[] };
type Muat = { committee: { types: string[]; hidden: string[] } | null; member_enabled: boolean; types: TipeAda[] };
type Titik = { key: string; nama: string; tempat: string | null };

/**
 * Check-in > Checkpoints > Committee access (usulan disetujui Mas 29 Okt 2026).
 *
 * Admin memilih Tipe peserta yang boleh melihat kehadiran di portalnya, dan
 * titik mana yang tampil. Kuncinya Tipe karena hanya admin yang menulisnya;
 * jawaban formulir diisi peserta sendiri. Sebelum menyimpan, dialog menyebut
 * berapa orang dan siapa saja yang mendapat akses. Disimpan di
 * `landing_config.member.committee` lewat /api/admin/area-peserta.
 */
export function AksesPanitia({ tipeAwal }: { tipeAwal: string[] | null }) {
  const toast = useToast();
  const [buka, setBuka] = useState(false);
  const [muat, setMuat] = useState<Muat | null>(null);
  const [titik, setTitik] = useState<Titik[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tipe, setTipe] = useState<string[]>([]);
  const [sembunyi, setSembunyi] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tersimpan, setTersimpan] = useState<string[] | null>(null);

  async function bukaDialog() {
    setBuka(true);
    setGalat(null);
    const [a, b] = await Promise.all([
      fetch(eventApiPath("/api/admin/area-peserta?panitia=1"), { cache: "no-store" }).catch(() => null),
      fetch(eventApiPath("/api/admin/overview/checkins"), { cache: "no-store" }).catch(() => null),
    ]);
    const isiA = (await a?.json().catch(() => null)) as Muat | null;
    const isiB = (await b?.json().catch(() => null)) as { rows?: Titik[] } | null;
    if (!a?.ok || !isiA || !b?.ok || !isiB?.rows) {
      setGalat(pesanGalatApi(isiA) ?? pesanGalatApi(isiB) ?? "Committee access could not be loaded. Try again.");
      return;
    }
    setMuat(isiA);
    setTitik(isiB.rows.map((baris) => ({ key: baris.key, nama: baris.nama, tempat: baris.tempat })));
    setTipe(isiA.committee?.types ?? []);
    setSembunyi(isiA.committee?.hidden ?? []);
    setTersimpan(isiA.committee?.types ?? []);
  }

  async function simpan() {
    setBusy(true);
    const committee = tipe.length > 0 ? { types: tipe, hidden: sembunyi.filter((key) => titik?.some((isi) => isi.key === key)) } : null;
    const response = await fetch(eventApiPath("/api/admin/area-peserta"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member: { committee } }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    setBusy(false);
    if (!response?.ok) {
      toast.error("Not saved", pesanGalatApi(body) ?? "Try again.");
      return;
    }
    setTersimpan(committee?.types ?? []);
    setBuka(false);
    toast.success(committee ? "Committee access saved" : "Committee access turned off", committee ? `${jumlahOrang} ${jumlahOrang === 1 ? "person" : "people"} can see attendance in their participant area.` : "Nobody sees attendance in the participant area.");
  }

  const terpilih = new Set(tipe.map(kunciTipe));
  const dipilih = (muat?.types ?? []).filter((isi) => terpilih.has(kunciTipe(isi.type)));
  const jumlahOrang = dipilih.reduce((jumlah, isi) => jumlah + isi.count, 0);
  const nama = dipilih.flatMap((isi) => isi.names).sort((a, b) => a.localeCompare(b, "id"));
  // Tipe tersimpan yang tidak lagi dimiliki siapa pun tetap bisa dilepas.
  const yatim = tipe.filter((isi) => !(muat?.types ?? []).some((ada) => kunciTipe(ada.type) === kunciTipe(isi)));
  const ubahTipe = (nilai: string) =>
    setTipe((lama) => (lama.some((isi) => kunciTipe(isi) === kunciTipe(nilai)) ? lama.filter((isi) => kunciTipe(isi) !== kunciTipe(nilai)) : lama.length >= PANITIA_TIPE_MAX ? lama : [...lama, nilai]));

  const tampilTipe = tersimpan ?? tipeAwal;
  const labelTombol = tampilTipe && tampilTipe.length > 0 ? `Committee: ${tampilTipe.join(", ")}` : "Committee access";

  return (
    <>
      <Button variant="text" icon={<UsersThree size={16} />} onClick={() => void bukaDialog()}>
        {labelTombol}
      </Button>
      <Dialog
        open={buka}
        onClose={() => setBuka(false)}
        dismissible={!busy}
        size="lg"
        scrollBody
        title="Committee access"
        description="Participants with these types see an Attendance card in their participant area: counts per check-in point and who is in or not yet. Names, units, and scan times only."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setBuka(false)}>Cancel</Button>
            <Button simpan loading={busy} disabled={!muat} onClick={() => void simpan()}>
              {tipe.length > 0 ? "Save" : "Save, turned off"}
            </Button>
          </>
        }
      >
        {galat ? (
          <Banner tone="error">{galat}</Banner>
        ) : !muat || !titik ? (
          <p className="text-body-medium text-on-surface-variant">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6">
            {!muat.member_enabled ? (
              <Banner tone="warning">
                The participant area is off, so nobody can open it yet. Turn it on in{" "}
                <Link href="/admin/area-peserta" className="font-medium text-primary hover:underline">Participant area</Link>.
              </Banner>
            ) : null}
            <section className="flex flex-col gap-2">
              <h3 className="text-title-small font-semibold">Participant types</h3>
              {muat.types.length === 0 && yatim.length === 0 ? (
                <p className="text-body-medium text-on-surface-variant">
                  No participant has a type yet. Fill the Type column in Participants (edit or import), for example &quot;Committee&quot;, then come back.
                </p>
              ) : (
                <>
                {tipe.length === 0 ? (
                  <p className="text-body-medium text-on-surface">Tap a type to give it access. With none selected, Save turns access off.</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {muat.types.map((isi) => (
                    <FilterChip key={isi.type} selected={terpilih.has(kunciTipe(isi.type))} onClick={() => ubahTipe(isi.type)}>
                      {isi.type}
                      <span className="tabular-nums opacity-75">{isi.count}</span>
                    </FilterChip>
                  ))}
                  {yatim.map((isi) => (
                    <FilterChip key={isi} selected onClick={() => ubahTipe(isi)}>
                      {isi}
                      <span className="tabular-nums opacity-75">0</span>
                    </FilterChip>
                  ))}
                </div>
                </>
              )}
              <p className="text-body-small text-on-surface-variant">
                Only admins set a participant&apos;s type, so registration answers can&apos;t grant access. Access ends one day after the event&apos;s last day.
              </p>
            </section>
            {tipe.length > 0 ? (
              <section className="flex flex-col gap-2" aria-live="polite">
                <h3 className="text-title-small font-semibold">{jumlahOrang === 1 ? "1 person gets access" : `${jumlahOrang.toLocaleString("en-GB")} people get access`}</h3>
                {nama.length > 0 ? (
                  <p className="text-body-medium text-on-surface-variant">
                    {nama.slice(0, 8).join(", ")}
                    {jumlahOrang > Math.min(8, nama.length) ? `, and ${(jumlahOrang - Math.min(8, nama.length)).toLocaleString("en-GB")} more` : ""}
                  </p>
                ) : null}
              </section>
            ) : null}
            <section className="flex flex-col gap-1">
              <h3 className="text-title-small font-semibold">Check-in points shown</h3>
              {titik.length === 0 ? (
                <p className="text-body-medium text-on-surface-variant">No check-in sessions or checkpoints yet.</p>
              ) : (
                <ul className="flex flex-col">
                  {titik.map((isi) => (
                    <li key={isi.key} className="flex min-h-9 items-center py-1">
                      <Switch
                        className="w-full"
                        checked={!sembunyi.includes(isi.key)}
                        onChange={(nyala) => setSembunyi((lama) => (nyala ? lama.filter((key) => key !== isi.key) : [...lama, isi.key]))}
                        label={isi.nama}
                        description={isi.tempat ?? undefined}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Dialog>
    </>
  );
}
