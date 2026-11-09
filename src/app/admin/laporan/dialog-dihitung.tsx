"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button, Dialog, Switch, TextField } from "@/components/m3";
import { BATAS_KECUALI, SUMBER, type Kecuali, type Sumber } from "@/lib/laporan/config";
import type { Dihitung } from "@/lib/laporan/server";

type Orang = { id: string; name: string; company: string | null };

/** Nama sumber di layar admin, dan di slide mana sumber itu dipakai. */
export const LABEL_SUMBER: Record<Sumber, { nama: string; dipakai: string }> = {
  daftar: { nama: "Online registration", dipakai: "Registered and Approved in the funnel" },
  feedback: { nama: "Feedback", dipakai: "Satisfaction slide, Feedback charts and Survey in the funnel" },
  portal: { nama: "Participant area visits", dipakai: "Participant area slide and Opened in the funnel" },
  pengumuman: { nama: "Announcements", dipakai: "Announcements slide" },
  undian: { nama: "Lucky draw and voting", dipakai: "Lucky draw slide" },
  logistik: { nama: "Logistics", dipakai: "Operations slide" },
};

/**
 * What this report counts: keluarkan peserta uji coba, Type peserta, atau
 * sumber yang tidak sengaja menyala. Tidak ada data yang dihapus; berlaku untuk
 * deck dan Daily highlights. Disimpan sekali lewat Save.
 */
export function DialogDihitung({ open, dihitung, kecuali, terkunci, hariKunci, onClose, onSimpan }: {
  open: boolean;
  /** Hari Daily highlights yang dikunci ("6 Nov", "Whole event"): angkanya tidak ikut berubah. */
  hariKunci: string[];
  dihitung: Dihitung;
  kecuali: Kecuali;
  terkunci: boolean;
  onClose: () => void;
  onSimpan: (kecuali: Kecuali) => void;
}) {
  const [draf, setDraf] = useState(kecuali);
  const [nama, setNama] = useState<Map<string, Orang>>(new Map());
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraf(kecuali);
    setNama(new Map(dihitung.keluar.map((o) => [o.id, o])));
  }, [open, kecuali, dihitung.keluar]);

  const ubah = (x: Partial<Kecuali>) => setDraf((d) => ({ ...d, ...x }));
  const tipeMati = new Set(draf.tipe.map((t) => t.toLowerCase()));
  const sumber = SUMBER.filter((k) => dihitung.sumber[k] !== null || draf.sumber.includes(k));
  const sama = JSON.stringify(draf) === JSON.stringify(kecuali);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      scrollBody
      fullScreenOnMobile
      title="What this report counts"
      description="Leave out test accounts or anything switched on by mistake. Nothing is deleted. Applies to the deck and Daily highlights days that are not locked."
      actions={
        <>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button disabled={terkunci || sama} onClick={() => onSimpan(draf)}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 pt-3">
        <section className="flex flex-col gap-2" aria-labelledby="dh-peserta">
          <h3 id="dh-peserta" className="m-0 text-title-small text-on-surface">Participants</h3>
          <p className="m-0 text-body-medium text-on-surface-variant">
            Counting {dihitung.dihitung.toLocaleString("en-GB")} of {dihitung.total.toLocaleString("en-GB")} participants.
          </p>
          {draf.peserta.length ? (
            <ul aria-label="Left out" className="m-0 flex list-none flex-col overflow-hidden rounded-md border border-outline-variant p-0">
              {draf.peserta.map((id) => (
                <li key={id} className="flex min-h-12 items-center gap-3 border-t border-outline-variant px-3 py-1 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-medium font-medium text-on-surface">{nama.get(id)?.name ?? "Participant"}</span>
                    {nama.get(id)?.company ? <span className="block truncate text-body-small text-on-surface-variant">{nama.get(id)!.company}</span> : null}
                  </span>
                  <Button variant="text" onClick={() => ubah({ peserta: draf.peserta.filter((x) => x !== id) })}>Count again</Button>
                </li>
              ))}
            </ul>
          ) : null}
          <CariPeserta
            ids={draf.peserta}
            onPilih={(o) => { setNama((m) => new Map(m).set(o.id, o)); ubah({ peserta: [...draf.peserta, o.id] }); }}
          />
        </section>

        {dihitung.tipe.length || draf.tipe.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="dh-tipe">
            <div>
              <h3 id="dh-tipe" className="m-0 text-title-small text-on-surface">Participant types</h3>
              <p className="m-0 text-body-small text-on-surface-variant">Switch a type off to leave everyone of that type out.</p>
            </div>
            {[...dihitung.tipe, ...draf.tipe.filter((t) => !dihitung.tipe.some((x) => x.nama.toLowerCase() === t.toLowerCase())).map((nama) => ({ nama, jumlah: 0 }))].map((t) => (
              <Switch
                key={t.nama}
                label={t.nama}
                description={t.jumlah === 1 ? "1 person" : `${t.jumlah.toLocaleString("en-GB")} people`}
                checked={!tipeMati.has(t.nama.toLowerCase())}
                onChange={(v) => ubah({ tipe: v ? draf.tipe.filter((x) => x.toLowerCase() !== t.nama.toLowerCase()) : [...draf.tipe, t.nama] })}
              />
            ))}
          </section>
        ) : null}

        {sumber.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="dh-sumber">
            <div>
              <h3 id="dh-sumber" className="m-0 text-title-small text-on-surface">Sources</h3>
              <p className="m-0 text-body-small text-on-surface-variant">Switched off, a source leaves every slide and highlight page. Slides left empty move to Not in this report.</p>
            </div>
            {sumber.map((k) => (
              <Switch
                key={k}
                label={LABEL_SUMBER[k].nama}
                description={`${dihitung.sumber[k] ?? "No data"}. ${LABEL_SUMBER[k].dipakai}.`}
                checked={!draf.sumber.includes(k)}
                onChange={(v) => ubah({ sumber: v ? draf.sumber.filter((x) => x !== k) : [...draf.sumber, k] })}
              />
            ))}
          </section>
        ) : null}

        <p className="m-0 text-body-small text-on-surface-variant">Slides say what isn&apos;t counted in a footnote on the cover and the funnel.</p>
        {hariKunci.length ? <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-body-medium text-on-surface">{teksKunci(hariKunci)}</p> : null}
      </div>
    </Dialog>
  );
}

/** Hari yang dikunci menyimpan salinannya sendiri. */
export const teksKunci = (hari: string[]) => `Locked days keep their figures. Unlock and lock again to update: ${hari.join(", ")}.`;

function CariPeserta({ ids, onPilih }: { ids: string[]; onPilih: (o: Orang) => void }) {
  const [cari, setCari] = useState("");
  const [hasil, setHasil] = useState<{ kata: string; orang: Orang[] } | null>(null);
  const kata = cari.trim();
  useEffect(() => {
    if (kata.length < 2) return;
    const pengendali = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: kata, limit: "8", meta: "0" });
      void fetch(`/api/admin/participants?${params.toString()}`, { cache: "no-store", signal: pengendali.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("cari"))))
        .then((body: { participants?: Array<{ id: string; name: string; company?: string | null }> }) =>
          setHasil({ kata, orang: (body.participants ?? []).map((p) => ({ id: p.id, name: p.name, company: p.company ?? null })) }))
        .catch(() => { if (!pengendali.signal.aborted) setHasil({ kata, orang: [] }); });
    }, 300);
    return () => { window.clearTimeout(timer); pengendali.abort(); };
  }, [kata]);
  const daftar = hasil && hasil.kata === kata && kata.length >= 2 ? hasil.orang : null;
  const penuh = ids.length >= BATAS_KECUALI.peserta;

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Leave out a participant"
        value={cari}
        onChange={(event) => setCari(event.target.value)}
        leading={<MagnifyingGlass size={16} />}
        placeholder="Name, organisation or email"
        hint={penuh ? `Up to ${BATAS_KECUALI.peserta} people. Use Participant types for larger groups.` : undefined}
      />
      {kata.length >= 2 ? (
        <ul aria-label="Search results" className="m-0 flex list-none flex-col overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest p-0">
          {daftar === null ? (
            <li className="px-3 py-2 text-body-medium text-on-surface-variant">Searching…</li>
          ) : daftar.length === 0 ? (
            <li className="px-3 py-2 text-body-medium text-on-surface-variant">No participant matches “{kata}”.</li>
          ) : (
            daftar.map((o) => {
              const sudah = ids.includes(o.id);
              return (
                <li key={o.id} className="border-t border-outline-variant first:border-t-0">
                  <button
                    type="button"
                    disabled={sudah || penuh}
                    onClick={() => { onPilih(o); setCari(""); }}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-body-medium hover:bg-primary-soft disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-on-surface">{o.name}</span>
                      {o.company ? <span className="block truncate text-body-small text-on-surface-variant">{o.company}</span> : null}
                    </span>
                    <span className="shrink-0 text-body-small text-on-surface-variant">{sudah ? "Left out" : "Leave out"}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
