"use client";

import { EnvelopeSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Dialog } from "@/components/m3";
import { useToast } from "@/components/toast";
import { plural } from "@/lib/plural";

/**
 * Banner "Email room numbers" di Logistics > Assignments (migrasi 202611040003).
 *
 * Tampil hanya bila ada peserta dengan nomor kamar yang belum dikabarkan
 * lewat email, dan acaranya belum lewat. Tidak ada yang terkirim sebelum
 * panitia menekan Send di dialog: email tidak bisa ditarik.
 *
 * `pemicu` berganti setiap kali data Logistik dimuat ulang (import, Assign,
 * Stays), jadi hitungannya ikut segar tanpa polling.
 */

type Ringkasan = {
  siap: true;
  perlu: number;
  berubah: number;
  tanpa_email: number;
  nama_tanpa_email: string[];
  nama: string[];
  terkirim: number;
  mode_uji: boolean;
};

function daftarNama(nama: string[], total: number): string {
  if (total <= nama.length) {
    return nama.length <= 1 ? nama.join("") : `${nama.slice(0, -1).join(", ")} and ${nama[nama.length - 1]}`;
  }
  const sisa = total - nama.length;
  return `${nama.join(", ")} and ${plural(sisa, "other")}`;
}

export function KabarKamar({ pemicu }: { pemicu: unknown }) {
  const toast = useToast();
  const [data, setData] = useState<Ringkasan | null>(null);
  const [buka, setBuka] = useState(false);
  const [kirim, setKirim] = useState(false);

  const muat = useCallback(async () => {
    const response = await fetch("/api/admin/logistik/kabar-kamar", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as Ringkasan | { siap: false } | null;
    setData(response?.ok && body?.siap ? body : null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat, pemicu]);

  async function kirimSekarang() {
    setKirim(true);
    const response = await fetch("/api/admin/logistik/kabar-kamar", { method: "POST" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setKirim(false);
    setBuka(false);
    if (!response?.ok) {
      toast.error("Room numbers not emailed", body?.error?.message ?? "Try again in a moment.");
    } else {
      const hasil = body as { terkirim: number; gagal: number; dilewati: number; galat: string | null };
      const catatan = [
        hasil.gagal > 0 ? `${plural(hasil.gagal, "email")} failed${hasil.galat ? `: ${hasil.galat}` : "."}` : null,
        hasil.dilewati > 0 ? `${plural(hasil.dilewati, "participant")} skipped (no email address${data?.mode_uji ? " or not on the test list" : ""}).` : null,
      ].filter(Boolean).join(" ");
      if (hasil.gagal > 0) toast.error(`Emailed ${plural(hasil.terkirim, "participant")}`, catatan);
      else toast.success(`Emailed ${plural(hasil.terkirim, "participant")}`, catatan || "Each one got their hotel, room number and roommates.");
    }
    void muat();
  }

  if (!data || data.perlu === 0) return null;
  const bisaDikirim = data.perlu - data.tanpa_email;

  return (
    <>
      <Banner
        tone="info"
        icon={<EnvelopeSimple size={18} />}
        className="mb-3 [&>div:first-child]:basis-[20rem]"
        actions={<Button size="sm" onClick={() => setBuka(true)} disabled={bisaDikirim === 0}>Email room numbers</Button>}
      >
        <p className="font-semibold">{`${plural(data.perlu, "participant")} ${data.perlu === 1 ? "has" : "have"} a room number we haven't emailed yet`}</p>
        <p className="text-on-surface-variant">
          {daftarNama(data.nama, data.perlu)}
          {data.tanpa_email > 0 ? `. ${plural(data.tanpa_email, "has", "have")} no email address.` : "."}
        </p>
      </Banner>

      <Dialog
        open={buka}
        onClose={() => { if (!kirim) setBuka(false); }}
        dismissible={!kirim}
        icon={<EnvelopeSimple size={20} />}
        title={`Email room numbers to ${plural(bisaDikirim, "participant")}?`}
        description="Each person gets a personal email with their hotel, room number, roommates and check-in time. Emails can't be recalled."
        actions={
          <>
            <Button variant="text" onClick={() => setBuka(false)} disabled={kirim}>Cancel</Button>
            <Button onClick={() => void kirimSekarang()} loading={kirim}>{`Send ${plural(bisaDikirim, "email")}`}</Button>
          </>
        }
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-medium text-on-surface">
          {data.berubah > 0 ? <li>{`${plural(data.berubah, "participant")} had a different room number before and get "Your room number has changed".`}</li> : null}
          {data.tanpa_email > 0 ? (
            <li>{`Skipped, no email address: ${daftarNama(data.nama_tanpa_email, data.tanpa_email)}.`}</li>
          ) : null}
          <li>People still waiting for a room number are not emailed. When their number is set, they show up here again.</li>
          {data.mode_uji ? <li>Test mode: only addresses on the test list (MESSAGING_ALLOWLIST) receive it.</li> : null}
        </ul>
      </Dialog>
    </>
  );
}
