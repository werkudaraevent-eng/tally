"use client";

import { Flag, Plus, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/event-link";
import { Button, ButtonLink, DetailSection, EmptyState, IconButton, ListDetail, ListRow, Pane, PaneBody, PaneFooter, SelectField, Switch, TextField, Dialog } from "@/components/m3";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";

/**
 * Check-in > Checkpoints: langkah berurutan yang dilihat peserta di Dashboard
 * saya (ambil ID card, ambil kaos, titip bagasi).
 *
 * Tiap checkpoint menunjuk satu bukti yang sudah ada: pemindaian di satu sesi
 * (tab Sessions) atau satu barang yang diserahkan (Logistics > Kit items).
 * Tidak ada pemindai baru; petugas tetap memakai /scan seperti biasa.
 *
 * Setelan di sini satu-satunya: "Show in participant area" menyalakan kartu di
 * Dashboard saya dan catatan di layar scan; urutannya di Beranda diatur di
 * Participant area > Participant home seperti kartu lain.
 */

type Checkpoint = {
  id: number;
  title: string;
  title_en: string | null;
  place: string | null;
  place_en: string | null;
  session_id: number | null;
  item_id: number | null;
  points: number | null;
  done: number;
};

type Muat = {
  settings: { enabled: boolean; points_enabled: boolean };
  checkpoints: Checkpoint[];
  sessions: { id: number; name: string; is_active: boolean }[];
  items: { id: number; name: string }[];
  finished_all: number | null;
  participants: number | null;
};

type Form = { title: string; title_en: string; place: string; place_en: string; bukti: string; points: string };

const FORM_KOSONG: Form = { title: "", title_en: "", place: "", place_en: "", bukti: "", points: "" };

const angka = (nilai: number) => nilai.toLocaleString("en-GB");

/** "s:12" = sesi 12, "i:4" = barang 4. Satu pilihan untuk satu bukti. */
function keForm(cp: Checkpoint): Form {
  return {
    title: cp.title,
    title_en: cp.title_en ?? "",
    place: cp.place ?? "",
    place_en: cp.place_en ?? "",
    bukti: cp.session_id ? `s:${cp.session_id}` : cp.item_id ? `i:${cp.item_id}` : "",
    points: cp.points == null ? "" : String(cp.points),
  };
}

function keIsi(form: Form, poin: boolean) {
  const [jenis, nomor] = form.bukti.split(":");
  return {
    title: form.title.trim(),
    title_en: form.title_en.trim() || null,
    place: form.place.trim() || null,
    place_en: form.place_en.trim() || null,
    session_id: jenis === "s" ? Number(nomor) : null,
    item_id: jenis === "i" ? Number(nomor) : null,
    // Poin yang mati tidak dihapus: menyalakannya lagi mengembalikan angkanya.
    ...(poin ? { points: form.points.trim() === "" ? null : Math.max(0, Math.min(10000, Math.round(Number(form.points)))) } : {}),
  };
}

export function CheckpointsTab({ keSesi }: { keSesi: () => void }) {
  const [data, setData] = useState<Muat | null>(null);
  const [galat, setGalat] = useState("");
  const [pilih, setPilih] = useState<number | "baru" | null>(null);
  // Galat isian baru tampil sesudah admin menekan Add/Save, bukan saat mengetik.
  const [dicoba, setDicoba] = useState(false);
  const [form, setForm] = useState<Form>(FORM_KOSONG);
  const [busy, setBusy] = useState(false);
  const [hapus, setHapus] = useState<Checkpoint | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/checkpoints"), { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setGalat(pesanGalatApi(body) ?? "Checkpoints could not be loaded.");
      return;
    }
    setGalat("");
    setData(body as Muat);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    // Sama dengan tab Sessions: angka selesai bergerak saat petugas memindai.
    const poll = window.setInterval(() => void load(), 30_000);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); };
  }, [load]);

  async function kirim(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown> | null, query = "") {
    setBusy(true);
    const response = await fetch(eventApiPath(`/api/admin/checkpoints${query}`), {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Connection failed", "Reload to see the current state."); return null; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error("Not saved", pesanGalatApi(body) ?? "Try again."); return null; }
    await load();
    return body as Record<string, unknown>;
  }

  async function ubahSetelan(patch: Partial<Muat["settings"]>) {
    if (!data) return;
    const lama = data.settings;
    // Optimistis, sama dengan sakelar Walk-in: dikembalikan bila server menolak.
    setData({ ...data, settings: { ...lama, ...patch } });
    const hasil = await kirim("PATCH", { settings: patch });
    if (!hasil) setData((kini) => (kini ? { ...kini, settings: lama } : kini));
  }

  function buka(id: number | "baru") {
    setPilih(id);
    setDicoba(false);
    const cp = id === "baru" ? null : data?.checkpoints.find((item) => item.id === id) ?? null;
    setForm(cp ? keForm(cp) : FORM_KOSONG);
  }

  async function simpan() {
    if (!data) return;
    const isi = keIsi(form, data.settings.points_enabled);
    if (pilih === "baru") {
      const hasil = await kirim("POST", isi);
      if (hasil) { toast.success("Checkpoint added", `${isi.title} is now step ${data.checkpoints.length + 1}.`); setPilih(Number(hasil.id)); setDicoba(false); }
    } else if (typeof pilih === "number") {
      const hasil = await kirim("PATCH", { id: pilih, ...isi });
      if (hasil) toast.success("Checkpoint saved", isi.title);
    }
  }

  async function hapusCheckpoint(cp: Checkpoint) {
    const hasil = await kirim("DELETE", null, `?id=${cp.id}`);
    setHapus(null);
    if (hasil) { setPilih(null); toast.success("Checkpoint deleted", "Scans and handed-out items are kept."); }
  }

  if (galat && !data) {
    return (
      <Pane className="w-full max-w-[760px]">
        <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error">
          <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden />{galat} The page tries again every 30 seconds.
        </p>
      </Pane>
    );
  }

  const poin = data?.settings.points_enabled === true;
  const daftar = data?.checkpoints ?? [];
  const namaBukti = (cp: Checkpoint) =>
    cp.session_id
      ? { jenis: "Scanned at session", nama: data?.sessions.find((s) => s.id === cp.session_id)?.name ?? "Session" }
      : { jenis: "Item handed out", nama: data?.items.find((i) => i.id === cp.item_id)?.name ?? "Kit item" };
  const terpilih = typeof pilih === "number" ? daftar.find((cp) => cp.id === pilih) ?? null : null;
  const posisi = terpilih ? daftar.indexOf(terpilih) : -1;
  const galatJudul = dicoba && form.title.trim().length === 0 ? "Add a title participants will see." : undefined;
  const galatBukti = dicoba && form.bukti === "" ? "Choose what records this checkpoint." : undefined;

  const list = (
    <Pane aria-label="Checkpoints">
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-outline-variant px-4 py-2.5">
        <Switch simpan
          checked={data?.settings.enabled === true}
          disabled={!data || busy}
          onChange={(value) => void ubahSetelan({ enabled: value })}
          label="Show in participant area"
        />
        <Switch simpan
          checked={poin}
          disabled={!data || busy}
          onChange={(value) => void ubahSetelan({ points_enabled: value })}
          label="Points"
        />
        <span className="ml-auto text-body-medium tabular-nums text-on-surface-variant">
          {data && daftar.length > 0 && data.finished_all != null && data.participants != null
            ? `${angka(data.finished_all)} of ${angka(data.participants)} finished all`
            : null}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-2.5 text-body-medium font-medium text-on-surface-variant">
        <span className="w-7 shrink-0" />
        <span className="min-w-0 flex-1">Checkpoint</span>
        <span className="w-40 shrink-0 max-sm:hidden">Done when</span>
        <span className="w-16 shrink-0 text-right">Done</span>
        {poin ? <span className="w-10 shrink-0 text-right">Pts</span> : null}
      </div>
      <PaneBody>
        {!data ? (
          <div role="status" aria-label="Loading" className="flex flex-col">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3.5">
                <div className="h-3 w-44 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-32 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : daftar.length === 0 ? (
          <EmptyState
            plain
            icon={<Flag size={40} />}
            title="No checkpoints yet"
            description="A checkpoint is a step participants tick off, such as collecting the ID card or dropping luggage. It is done when they are scanned at a session or an item is handed to them."
            action={<Button icon={<Plus size={16} weight="bold" />} onClick={() => buka("baru")}>New checkpoint</Button>}
          />
        ) : (
          daftar.map((cp, index) => {
            const bukti = namaBukti(cp);
            return (
              <ListRow key={cp.id} selected={cp.id === pilih} onSelect={() => buka(cp.id)}>
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-container-high text-body-small font-semibold tabular-nums text-on-surface-variant">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-on-surface">{cp.title}</span>
                  <span className="block truncate text-on-surface-variant">{cp.place || <span className="sm:hidden">{bukti.nama}</span>}</span>
                </span>
                <span className="w-40 shrink-0 max-sm:hidden">
                  <span className="block text-body-small text-on-surface-variant">{bukti.jenis}</span>
                  <span className="block truncate text-on-surface">{bukti.nama}</span>
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums text-on-surface">{angka(cp.done)}</span>
                {poin ? <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-on-surface">{cp.points ?? 0}</span> : null}
              </ListRow>
            );
          })
        )}
      </PaneBody>
      <PaneFooter note="Participants see this order. The scan desk never turns anyone away for skipping a step; it only shows what is still open.">
        {daftar.length > 0 ? <Button size="sm" icon={<Plus size={16} weight="bold" />} disabled={!data} onClick={() => buka("baru")}>New checkpoint</Button> : null}
      </PaneFooter>
    </Pane>
  );

  const tanpaPilihan = data && data.sessions.length === 0 && data.items.length === 0;
  const detail = pilih !== null && data ? (
    <Pane as="aside" aria-label={pilih === "baru" ? "New checkpoint" : `Checkpoint ${terpilih?.title ?? ""}`}>
      <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
        <h2 className="min-w-0 flex-1 break-words text-title-medium font-semibold leading-6">{pilih === "baru" ? "New checkpoint" : terpilih?.title}</h2>
        <IconButton size="sm" label="Close" onClick={() => setPilih(null)}><X size={16} /></IconButton>
      </div>
      <PaneBody>
        <form
          id="form-checkpoint"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            // Tombol tidak pernah mati diam-diam: isian yang kurang ditandai di
            // tempatnya, dan fokus pindah ke sana.
            if (form.title.trim().length === 0 || form.bukti === "") {
              setDicoba(true);
              const sasaran = form.title.trim().length === 0 ? "checkpoint-judul-isian" : "checkpoint-bukti";
              requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${sasaran} input, #${sasaran} select, #${sasaran} [tabindex]`)?.focus());
              return;
            }
            void simpan();
          }}
        >
          <DetailSection>
            <div id="checkpoint-judul-isian">
            <TextField
              label="Title participants see"
              error={galatJudul}
              value={form.title}
              maxLength={80}
              autoFocus={pilih === "baru"}
              placeholder="e.g. Collect your ID card"
              hint="In the event's main language."
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            </div>
            <TextField
              label="Where"
              optional
              value={form.place}
              maxLength={120}
              placeholder="e.g. Registration desk, main lobby"
              onChange={(event) => setForm({ ...form, place: event.target.value })}
            />
          </DetailSection>
          <DetailSection title="Done when">
            {tanpaPilihan ? (
              <div id="checkpoint-bukti">
                <p tabIndex={-1} className={`flex gap-2 text-body-medium outline-none ${dicoba ? "text-error" : "text-on-surface"}`}>
                  <WarningCircle size={20} weight="fill" aria-hidden className="mt-px shrink-0 text-error" />
                  <span><span className="font-semibold">Can&apos;t add yet:</span> a checkpoint is done when a scan session or a kit item records it, and this event has neither. Create one first.</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outlined" size="sm" onClick={keSesi}>Open Sessions</Button>
                  <ButtonLink href="/admin/logistik?tab=barang" variant="outlined" size="sm">Open Logistics &gt; Kit items</ButtonLink>
                </div>
              </div>
            ) : (
              <div id="checkpoint-bukti"><SelectField label="Recorded by" error={galatBukti} value={form.bukti} onChange={(event) => setForm({ ...form, bukti: event.target.value })} hint="Staff scan the participant's QR at that session, or hand the item out on the scan screen.">
                <option value="" disabled>Choose a session or kit item</option>
                {data.sessions.length > 0 ? (
                  <optgroup label="Scanned at session">
                    {data.sessions.map((s) => <option key={`s${s.id}`} value={`s:${s.id}`}>{s.name}{s.is_active ? "" : " (closed)"}</option>)}
                  </optgroup>
                ) : null}
                {data.items.length > 0 ? (
                  <optgroup label="Item handed out">
                    {data.items.map((i) => <option key={`i${i.id}`} value={`i:${i.id}`}>{i.name}</option>)}
                  </optgroup>
                ) : null}
              </SelectField></div>
            )}
            {poin ? (
              <TextField
                label="Points"
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                value={form.points}
                placeholder="0"
                className="max-w-40"
                onChange={(event) => setForm({ ...form, points: event.target.value })}
              />
            ) : null}
          </DetailSection>
          <DetailSection title="English participant page">
            <TextField label="Title in English" optional value={form.title_en} maxLength={80} onChange={(event) => setForm({ ...form, title_en: event.target.value })} hint="Leave empty to use the title above." />
            <TextField label="Where in English" optional value={form.place_en} maxLength={120} onChange={(event) => setForm({ ...form, place_en: event.target.value })} />
          </DetailSection>
          {terpilih ? (
            <DetailSection title="Progress">
              <p className="text-body-medium text-on-surface-variant">
                <span className="font-semibold tabular-nums text-on-surface">{angka(terpilih.done)}</span> participants have done this.
                {" "}Deleting the checkpoint keeps their scans and handed-out items.
              </p>
            </DetailSection>
          ) : null}
        </form>
      </PaneBody>
      <PaneFooter>
        {terpilih ? (
          <>
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus(terpilih)}>Delete</Button>
            <Button simpan variant="outlined" size="sm" disabled={busy || posisi <= 0} onClick={() => void kirim("PATCH", { id: terpilih.id, move: "up" })}>Move up</Button>
            <Button simpan variant="outlined" size="sm" disabled={busy || posisi < 0 || posisi >= daftar.length - 1} onClick={() => void kirim("PATCH", { id: terpilih.id, move: "down" })}>Move down</Button>
          </>
        ) : null}
        <Button simpan size="sm" type="submit" form="form-checkpoint" loading={busy}>{pilih === "baru" ? "Add checkpoint" : "Save"}</Button>
      </PaneFooter>
    </Pane>
  ) : null;

  return (
    <>
      {data && !data.settings.enabled && daftar.length > 0 ? (
        <p className="mb-3 rounded-md bg-surface-container-high px-4 py-2.5 text-body-medium text-on-surface-variant">
          Participants do not see these yet. Switch on Show in participant area when the list is ready. Its place on the participant home is set in{" "}
          <Link href="/admin/area-peserta" className="rounded-sm font-medium text-primary hover:underline">Participant area</Link>.
        </p>
      ) : null}
      <ListDetail list={list} detail={detail} />
      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={`Delete ${hapus?.title ?? "checkpoint"}?`}
        description="Participants stop seeing this step. Scans and handed-out items stay recorded."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={() => { if (hapus) void hapusCheckpoint(hapus); }}>Delete checkpoint</Button>
          </>
        }
      />
    </>
  );
}
