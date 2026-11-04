"use client";

import { Bell } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Dialog } from "@/components/m3";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";

/**
 * Banner "Tell participants" di Logistics > Assignments (migrasi 202611040003).
 *
 * Tampil hanya bila ada peserta dengan nomor kamar yang belum dikabarkan, dan
 * acaranya belum lewat. Tidak ada yang terkirim sebelum panitia menekan Send
 * di dialog. Di dialog panitia memilih salurannya: lonceng di area peserta
 * saja, atau lonceng ditambah email pribadi (bawaan, karena peserta di lokasi
 * acara jarang membuka portal tanpa diberi tahu).
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
  kamar_tampil: boolean;
};

type Saluran = "portal" | "portal_email";

const SALURAN: Array<{ value: Saluran; judul: string; isi: string }> = [
  {
    value: "portal_email",
    judul: "Participant area and email",
    isi: "A notice in the participant area bell, plus a personal email with their hotel, room number, roommates and check-in time.",
  },
  {
    value: "portal",
    judul: "Participant area only",
    isi: "A notice in the bell. They see it the next time they open the participant area.",
  },
];

function daftarNama(nama: string[], total: number): string {
  if (total <= nama.length) {
    return nama.length <= 1 ? nama.join("") : `${nama.slice(0, -1).join(", ")} and ${nama[nama.length - 1]}`;
  }
  return `${nama.join(", ")} and ${plural(total - nama.length, "other")}`;
}

export function KabarKamar({ pemicu }: { pemicu: unknown }) {
  const toast = useToast();
  const [data, setData] = useState<Ringkasan | null>(null);
  const [buka, setBuka] = useState(false);
  const [kirim, setKirim] = useState(false);
  const [saluran, setSaluran] = useState<Saluran>("portal_email");

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
    const response = await fetch("/api/admin/logistik/kabar-kamar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saluran }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setKirim(false);
    setBuka(false);
    if (!response?.ok) {
      toast.error("Participants not told", body?.error?.details?.message ?? body?.error?.message ?? "Try again in a moment.");
    } else {
      const hasil = body as { lonceng: number; terkirim: number; gagal: number; tanpa_email: number; galat: string | null };
      const judul = `Told ${plural(hasil.lonceng, "participant")}`;
      if (saluran === "portal") {
        toast.success(judul, hasil.galat ?? "They see the notice in the participant area bell.");
      } else {
        const catatan = [
          `${plural(hasil.terkirim, "email")} sent.`,
          hasil.gagal > 0 ? `${plural(hasil.gagal, "email")} failed${hasil.galat ? `: ${hasil.galat}` : "."} They stay on the list.` : null,
          hasil.tanpa_email > 0 ? `${plural(hasil.tanpa_email, "participant")} got the bell only (no email address${data?.mode_uji ? " or not on the test list" : ""}).` : null,
        ].filter(Boolean).join(" ");
        if (hasil.gagal > 0) toast.error(judul, catatan);
        else toast.success(judul, catatan);
      }
    }
    void muat();
  }

  if (!data || data.perlu === 0) return null;

  return (
    <>
      <Banner
        tone="info"
        icon={<Bell size={18} />}
        className="mb-3 [&>div:first-child]:basis-[20rem]"
        actions={<Button size="sm" onClick={() => { setSaluran("portal_email"); setBuka(true); }} disabled={!data.kamar_tampil}>Tell participants</Button>}
      >
        <p className="font-semibold">{`${plural(data.perlu, "participant")} ${data.perlu === 1 ? "has" : "have"} a room number they haven't been told about`}</p>
        <p className="text-on-surface-variant">
          {data.kamar_tampil ? `${daftarNama(data.nama, data.perlu)}.` : "Rooms are hidden from participants. Show them in Participant area › Logistics first."}
        </p>
      </Banner>

      <Dialog
        open={buka}
        onClose={() => { if (!kirim) setBuka(false); }}
        dismissible={!kirim}
        icon={<Bell size={20} />}
        title={`Tell ${plural(data.perlu, "participant")} their room number?`}
        description="Notices can't be recalled. People still waiting for a room number are not told; they show up here again when their number is set."
        actions={
          <>
            <Button variant="text" onClick={() => setBuka(false)} disabled={kirim}>Cancel</Button>
            <Button onClick={() => void kirimSekarang()} loading={kirim}>Send</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-title-small font-semibold text-on-surface">Send through</legend>
            {SALURAN.map((pilihan) => (
              <label
                key={pilihan.value}
                className={cx(
                  "flex min-h-12 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5",
                  saluran === pilihan.value ? "border-primary bg-primary-soft" : "border-outline-variant",
                )}
              >
                <input
                  type="radio"
                  name="saluran-kamar"
                  value={pilihan.value}
                  checked={saluran === pilihan.value}
                  onChange={() => setSaluran(pilihan.value)}
                  disabled={kirim}
                  className="mt-1 size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-body-medium font-semibold text-on-surface">{pilihan.judul}</span>
                  <span className="block text-body-small text-on-surface-variant">{pilihan.isi}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-medium text-on-surface">
            {saluran === "portal_email" && data.berubah > 0 ? <li>{`${plural(data.berubah, "participant")} had a different room number before and get "Your room number has changed".`}</li> : null}
            {saluran === "portal_email" && data.tanpa_email > 0 ? (
              <li>{`No email address, bell only: ${daftarNama(data.nama_tanpa_email, data.tanpa_email)}.`}</li>
            ) : null}
            {saluran === "portal_email" && data.mode_uji ? <li>Test mode: only addresses on the test list (MESSAGING_ALLOWLIST) get the email.</li> : null}
            <li>The bell notice also appears in Announcements, sent to these participants.</li>
          </ul>
        </div>
      </Dialog>
    </>
  );
}
