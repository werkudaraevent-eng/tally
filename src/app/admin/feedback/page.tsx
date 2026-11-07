"use client";

import { ArrowDown, ArrowSquareOut, ArrowUp, Cards, ChatsCircle, Copy, DownloadSimple, ListChecks, PaperPlaneTilt, Plus, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Kelompok } from "@/components/admin/compact-form";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, IconButton, PageLoading, SelectField, StatusChip, Switch, Table, TableBody, TableCard, TableCell,
  TableHead, TableHeaderCell, TableRow, Tabs, TextArea, TextField, WorkspaceHeader, WorkspacePage, FilterChip,
} from "@/components/m3";
import { KARTU, PERTANYAAN_MAX, kunciBaru, statusBuka, type HasilPertanyaan, type JenisPertanyaan, type KunciKartu, type Pertanyaan, type SetelanKilas, type Tampilan } from "@/lib/kilas-balik/setelan";
import { ISI_MAX, JUDUL_MAX } from "@/lib/kilas-balik/undangan";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { PilihPeserta, type PesertaPratinjau } from "../area-peserta/pratinjau-peserta";

/**
 * Admin > Feedback: Kilas balik, kuesioner akhir acara.
 *
 * Satu tab per pekerjaan: Questions (apa yang ditanyakan dan di layar mana),
 * Settings (kapan dibuka, kartu kenangan, kalimat pembuka dan penutup), Look
 * (tampilan, warna, pratinjau sebagai peserta), Send (undang lalu ingatkan
 * yang belum menjawab, lewat lonceng dan email), Results (tingkat respons,
 * ringkasan, jawaban per peserta dengan kolom peserta pilihan, unduh .xlsx).
 */

type Tab = "questions" | "settings" | "look" | "send" | "results";

type Data = {
  siap: true;
  tersimpan: boolean;
  setelan: SetelanKilas;
  agenda: string[];
  lang: "id" | "en";
  area_peserta: boolean;
  tautan: string;
  slug: string;
  tema_acara: { brand: string; accent: string };
  contoh: PesertaPratinjau | null;
  zona: { offset: string; singkat: string };
  hasil: {
    total_peserta: number;
    jumlah: number;
    ringkas: HasilPertanyaan[];
    baris: { participant_id: string; submitted_at: string; answers: Record<string, unknown>; peserta: Record<string, string | null> }[];
    label: Record<string, string>;
  } | null;
};

const JENIS_LABEL: Record<JenisPertanyaan, string> = {
  faces: "Faces, 1 to 5",
  nps: "Scale, 0 to 10 (recommend)",
  choice: "Choice",
  text: "Short text",
};

const KARTU_LABEL: Record<KunciKartu, { judul: string; isi: string }> = {
  trip: { judul: "Travel", isi: "First outbound ticket from Logistics > Tickets, or the first vehicle trip. Only when Tickets or Vehicles are shown in the Participant area." },
  stay: { judul: "Stay", isi: "Hotel, room number and roommates from Logistics > Rooms. Only when Rooms are shown in the Participant area." },
  agenda: { judul: "Agenda", isi: "How many check-in sessions they were scanned at, and the Agenda items they could see." },
  prize: { judul: "Lucky draw", isi: "Prizes they won, when the prize card is on in the Participant area." },
};

const KOLOM_AWAL = ["name", "company"];
const KUNCI_KOLOM = "tally:feedback:kolom";

function keLokal(iso: string | null, offset: string): string {
  if (!iso) return "";
  const [jam, menit] = offset.replace("+", "").split(":").map(Number);
  const tanda = offset.startsWith("-") ? -1 : 1;
  const geser = tanda * (Math.abs(jam) * 60 + (menit || 0));
  return new Date(Date.parse(iso) + geser * 60_000).toISOString().slice(0, 16);
}

function dariLokal(lokal: string, offset: string): string | null {
  if (!lokal) return null;
  const t = Date.parse(`${lokal}:00${offset}`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export default function FeedbackPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("questions");
  const [data, setData] = useState<Data | null>(null);
  const [belumSiap, setBelumSiap] = useState(false);
  const [gagalMuat, setGagalMuat] = useState(false);
  const [draf, setDraf] = useState<SetelanKilas | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setGagalMuat(false);
    const res = await fetch("/api/admin/feedback", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setGagalMuat(true);
      return;
    }
    const isi = await res.json();
    if (!isi.siap) {
      setBelumSiap(true);
      return;
    }
    setData(isi as Data);
    setDraf((lama) => lama ?? (isi as Data).setelan);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat]);

  const berubah = useMemo(() => Boolean(data && draf && JSON.stringify(draf) !== JSON.stringify(data.setelan)) || Boolean(data && !data.tersimpan), [data, draf]);

  async function simpan(nyalakan?: boolean) {
    if (!draf) return;
    const isi = nyalakan === undefined ? draf : { ...draf, enabled: nyalakan };
    setMenyimpan(true);
    setGalat(null);
    const res = await fetch("/api/admin/feedback", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...isi, title: isi.title || null, intro: isi.intro || null, closing: isi.closing || null, signed_by: isi.signed_by || null }),
    }).catch(() => null);
    setMenyimpan(false);
    if (!res || !res.ok) {
      const j = await res?.json().catch(() => null);
      const pesan = j?.error?.details?.formErrors?.[0] ?? Object.values((j?.error?.details?.fieldErrors ?? {}) as Record<string, string[]>)[0]?.[0] ?? "Check the questions and times, then save again.";
      setGalat(pesan);
      toast.error("Feedback not saved", pesan);
      return;
    }
    setDraf(isi);
    setData((d) => (d ? { ...d, setelan: isi, tersimpan: true } : d));
    toast.success(nyalakan === true ? "Feedback is open" : nyalakan === false ? "Feedback is off" : "Feedback saved");
  }

  if (belumSiap) {
    return (
      <WorkspacePage width="form">
        <WorkspaceHeader title="Feedback" />
        <Banner tone="info">Feedback isn&apos;t active yet: database migration 202611070010 has not been run.</Banner>
      </WorkspacePage>
    );
  }
  if (gagalMuat) {
    return (
      <WorkspacePage width="form">
        <WorkspaceHeader title="Feedback" />
        <Banner tone="error" actions={<Button variant="text" onClick={() => void muat()}>Try again</Button>}>Feedback couldn&apos;t be loaded.</Banner>
      </WorkspacePage>
    );
  }
  if (!data || !draf) return <PageLoading />;

  const status = statusBuka(draf, new Date());
  const chip = { off: { tone: "neutral", label: "Off" }, not_yet: { tone: "primary", label: "Opens later" }, open: { tone: "success", label: "Open" }, closed: { tone: "neutral", label: "Closed" } }[status] as { tone: "neutral" | "primary" | "success"; label: string };

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Feedback"
        meta={
          <>
            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
            <span>A look back at the trip, with a few questions in between.</span>
          </>
        }
        actions={
          <>
            {draf.enabled ? (
              <Button variant="outlined" onClick={() => void simpan(false)} disabled={menyimpan}>Turn off</Button>
            ) : (
              <Button variant="tonal" onClick={() => void simpan(true)} disabled={menyimpan || draf.questions.length === 0}>Turn on</Button>
            )}
            <Button onClick={() => void simpan()} loading={menyimpan} disabled={!berubah}>Save</Button>
          </>
        }
      />
      {!data.area_peserta ? <Banner tone="warning">Participants open Feedback from the participant area, which is off for this event. Turn it on in Participant area first.</Banner> : null}
      {galat ? <Banner tone="error">{galat}</Banner> : null}

      <Tabs
        idPrefix="feedback"
        label="Feedback"
        value={tab}
        onChange={setTab}
        options={[
          { value: "questions", label: "Questions", badge: draf.questions.length },
          { value: "settings", label: "Settings" },
          { value: "look", label: "Look" },
          { value: "send", label: "Send" },
          { value: "results", label: "Results", badge: data.hasil?.jumlah ?? 0 },
        ]}
      />
      <div role="tabpanel" id={`feedback-panel-${tab}`} aria-labelledby={`feedback-tab-${tab}`} className="max-w-[880px]">
        {tab === "questions" ? <TabPertanyaan draf={draf} setDraf={setDraf} agenda={data.agenda} /> : null}
        {tab === "settings" ? <TabSetelan draf={draf} setDraf={setDraf} data={data} /> : null}
        {tab === "look" ? <TabTampilan draf={draf} setDraf={setDraf} data={data} /> : null}
        {tab === "send" ? <TabKirim data={data} berubah={berubah} /> : null}
        {tab === "results" ? <TabHasil data={data} /> : null}
      </div>
    </WorkspacePage>
  );
}

/* ------------------------------------------------------------ Questions */

function TabPertanyaan({ draf, setDraf, agenda }: { draf: SetelanKilas; setDraf: (s: SetelanKilas) => void; agenda: string[] }) {
  const ubah = (i: number, q: Partial<Pertanyaan>) => setDraf({ ...draf, questions: draf.questions.map((lama, n) => (n === i ? { ...lama, ...q } : lama)) });
  const pindah = (i: number, arah: -1 | 1) => {
    const q = [...draf.questions];
    const j = i + arah;
    if (j < 0 || j >= q.length) return;
    [q[i], q[j]] = [q[j], q[i]];
    setDraf({ ...draf, questions: q });
  };
  const tambah = () => {
    const key = kunciBaru("question", draf.questions.map((q) => q.key));
    setDraf({ ...draf, questions: [...draf.questions, { key, type: "faces", title: "", title_alt: null, required: false, after: null }] });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-medium text-on-surface-variant">
        Participants see one question per screen, between their travel, stay, agenda and prize cards. Keep it to five or six questions: about two minutes.
      </p>
      {draf.questions.length === 0 ? (
        <EmptyState title="No questions yet" description="Add the first question. Faces 1 to 5 are the quickest to answer." action={<Button onClick={tambah} icon={<Plus size={18} />}>Add question</Button>} />
      ) : null}
      {draf.questions.map((q, i) => (
        <section key={q.key} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4" aria-label={`Question ${i + 1}`}>
          <div className="flex items-start gap-3">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <TextField label={`Question ${i + 1}`} value={q.title} maxLength={200} onChange={(e) => ubah(i, { title: e.target.value })} placeholder="How were your travel and stay?" />
              <SelectField label="Answer type" value={q.type} onChange={(e) => {
                const type = e.target.value as JenisPertanyaan;
                ubah(i, { type, ...(type === "choice" && !(q.options?.length) ? { options: ["", ""], max: 1 } : {}) });
              }}>
                {(Object.keys(JENIS_LABEL) as JenisPertanyaan[]).map((j) => <option key={j} value={j}>{JENIS_LABEL[j]}</option>)}
              </SelectField>
              <TextField label="In the other language" optional value={q.title_alt ?? ""} maxLength={200} onChange={(e) => ubah(i, { title_alt: e.target.value || null })} hint="Shown on the English (or Indonesian) version of the page." className="sm:col-span-2" />
            </div>
            <div className="flex shrink-0 flex-col gap-1 pt-6">
              <IconButton label="Move up" onClick={() => pindah(i, -1)} disabled={i === 0}><ArrowUp size={18} /></IconButton>
              <IconButton label="Move down" onClick={() => pindah(i, 1)} disabled={i === draf.questions.length - 1}><ArrowDown size={18} /></IconButton>
              <IconButton label="Delete question" onClick={() => setDraf({ ...draf, questions: draf.questions.filter((_, n) => n !== i) })}><Trash size={18} /></IconButton>
            </div>
          </div>

          {q.type === "choice" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <TextArea
                label="Options, one per line"
                rows={5}
                value={(q.options ?? []).join("\n")}
                onChange={(e) => ubah(i, { options: e.target.value.split("\n").map((o) => o.slice(0, 80)).slice(0, 12) })}
                hint="Up to 12 options."
              />
              <div className="flex flex-col gap-3">
                <SelectField label="Participants can pick" value={String(q.max ?? 1)} onChange={(e) => ubah(i, { max: Number(e.target.value) })}>
                  <option value="1">One</option>
                  <option value="2">Up to two</option>
                  <option value="3">Up to three</option>
                </SelectField>
                <Button variant="outlined" size="sm" disabled={agenda.length < 2} onClick={() => ubah(i, { options: agenda.slice(0, 12), from_agenda: true })}>
                  Fill from Agenda
                </Button>
              </div>
              <Switch
                className="sm:col-span-2"
                checked={q.from_agenda === true}
                onChange={(v) => ubah(i, { from_agenda: v })}
                label="Only show Agenda items each participant could see"
                description="Options that match an Agenda item with Who sees it are hidden from participants outside that group."
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-outline-variant pt-3">
            <SelectField label="Show after" value={q.after ?? ""} onChange={(e) => ubah(i, { after: (e.target.value || null) as KunciKartu | null })} className="w-56">
              {KARTU.map((k) => <option key={k} value={k}>{KARTU_LABEL[k].judul} card</option>)}
              <option value="">At the end</option>
            </SelectField>
            <Switch checked={q.required} onChange={(v) => ubah(i, { required: v })} label="Needs an answer" description="Off: participants can skip it." />
          </div>
        </section>
      ))}
      {draf.questions.length > 0 && draf.questions.length < PERTANYAAN_MAX ? (
        <Button variant="outlined" onClick={tambah} icon={<Plus size={18} />} className="self-start">Add question</Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- Settings */

function TabSetelan({ draf, setDraf, data }: { draf: SetelanKilas; setDraf: (s: SetelanKilas) => void; data: Data }) {
  return (
    <div className="flex flex-col gap-5">
      <Kelompok first title="When it's open" note={`Times are in ${data.zona.singkat}. Leave both empty to keep it open while Feedback is on. Participants can change their answers until it closes.`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Opens" optional type="datetime-local" value={keLokal(draf.opens_at, data.zona.offset)} onChange={(e) => setDraf({ ...draf, opens_at: dariLokal(e.target.value, data.zona.offset) })} />
          <TextField label="Closes" optional type="datetime-local" value={keLokal(draf.closes_at, data.zona.offset)} onChange={(e) => setDraf({ ...draf, closes_at: dariLokal(e.target.value, data.zona.offset) })} />
        </div>
      </Kelompok>

      <Kelompok title="Memory cards" note="Each card is built from that participant's own data, and only from what the Participant area already shows them. A card without data is skipped.">
        <div className="flex flex-col gap-3">
          {KARTU.map((k) => (
            <Switch key={k} checked={draf.cards[k]} onChange={(v) => setDraf({ ...draf, cards: { ...draf.cards, [k]: v } })} label={KARTU_LABEL[k].judul} description={KARTU_LABEL[k].isi} />
          ))}
        </div>
      </Kelompok>

      <Kelompok title="Opening and closing" note="Written in the event's language. Empty fields use a warm default greeting.">
        <div className="grid gap-3">
          <TextField label="Opening title" optional maxLength={120} value={draf.title ?? ""} onChange={(e) => setDraf({ ...draf, title: e.target.value || null })} placeholder="Hi, Dewi (their first name)" />
          <TextArea label="Opening message" optional rows={3} maxLength={600} counter value={draf.intro ?? ""} onChange={(e) => setDraf({ ...draf, intro: e.target.value || null })} />
          <TextArea label="Thank-you message" optional rows={3} maxLength={600} counter value={draf.closing ?? ""} onChange={(e) => setDraf({ ...draf, closing: e.target.value || null })} hint="Shown on the last card, above the participant's recap." />
          <TextField label="Signed by" optional maxLength={120} value={draf.signed_by ?? ""} onChange={(e) => setDraf({ ...draf, signed_by: e.target.value || null })} placeholder="Rina Wulandari, Organising committee" />
        </div>
      </Kelompok>

    </div>
  );
}

/* ----------------------------------------------------------------- Look */

const TAMPILAN_PILIHAN: { value: Tampilan; label: string; detail: string; Ikon: typeof Cards }[] = [
  { value: "kilas", label: "Look back", detail: "One card per screen, like Stories. Their trip, stay and agenda come back as cards, with a question in between. The warmest, about two minutes.", Ikon: Cards },
  { value: "percakapan", label: "Chat", detail: "A conversation with the organisers. Memories arrive as messages and answers go out as replies, so it feels like texting, not a form.", Ikon: ChatsCircle },
  { value: "ringkas", label: "One page", detail: "All questions on one page with one Send button. The quickest. Memories show as a few numbers at the top.", Ikon: ListChecks },
];

function Swatch({ warna, label }: { warna: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-body-small text-on-surface-variant">
      <span className="size-5 rounded-full border border-outline-variant" style={{ background: warna }} aria-hidden />
      {label} <span className="font-mono">{warna.toUpperCase()}</span>
    </span>
  );
}

function TabTampilan({ draf, setDraf, data }: { draf: SetelanKilas; setDraf: (s: SetelanKilas) => void; data: Data }) {
  const [peserta, setPeserta] = useState<PesertaPratinjau | null>(data.contoh);
  const tema = draf.theme;
  const alamat = `/e/${data.slug}/kilas-balik?${new URLSearchParams({ pratinjau: peserta?.id ?? "1", tampilan: draf.display, tema: JSON.stringify(tema) }).toString()}`;
  const sendiri = tema.mode === "custom";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-5">
        <Kelompok first title="Display" note="The questions, answers and results are the same in every display, so you can switch at any time. On Look back and Chat, participants can also switch to One page themselves.">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Display</legend>
            {TAMPILAN_PILIHAN.map(({ value, label, detail, Ikon }) => {
              const on = draf.display === value;
              return (
                <label key={value} className={cx("flex cursor-pointer gap-3 rounded-lg p-3 text-body-medium", on ? "border-2 border-primary bg-primary-soft" : "border border-outline")}>
                  <input type="radio" name="feedback-display" value={value} checked={on} onChange={() => setDraf({ ...draf, display: value })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                  <Ikon size={22} aria-hidden className="mt-px shrink-0 text-on-surface-variant" />
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-on-surface-variant">{detail}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </Kelompok>

        <Kelompok title="Colours" note="Memory cards use the background colour, darkened when needed so white text stays easy to read on a bright train. Question cards use a soft tint of the accent.">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Colours</legend>
            <label className={cx("flex cursor-pointer gap-3 rounded-lg p-3 text-body-medium", !sendiri ? "border-2 border-primary bg-primary-soft" : "border border-outline")}>
              <input type="radio" name="feedback-tema" checked={!sendiri} onChange={() => setDraf({ ...draf, theme: { ...tema, mode: "event" } })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">Follow the event theme</span>
                <span className="text-on-surface-variant">From Event page &gt; Theme. Changes there show up here too.</span>
                <span className="flex flex-wrap gap-4 pt-1">
                  <Swatch warna={data.tema_acara.brand} label="Background" />
                  <Swatch warna={data.tema_acara.accent} label="Accent" />
                </span>
              </span>
            </label>
            <label className={cx("flex cursor-pointer gap-3 rounded-lg p-3 text-body-medium", sendiri ? "border-2 border-primary bg-primary-soft" : "border border-outline")}>
              <input
                type="radio"
                name="feedback-tema"
                checked={sendiri}
                onChange={() => setDraf({ ...draf, theme: { mode: "custom", brand: tema.brand ?? data.tema_acara.brand, accent: tema.accent ?? data.tema_acara.accent } })}
                className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
              />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">Own colours</span>
                <span className="text-on-surface-variant">For a closing mood that differs from the event page, such as a night or sunset palette.</span>
              </span>
            </label>
            {sendiri ? (
              <div className="grid gap-3 pl-10 sm:grid-cols-2">
                {(["brand", "accent"] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-1 text-body-small text-on-surface-variant">
                    {k === "brand" ? "Background" : "Accent"}
                    <span className="flex items-center gap-2">
                      <input
                        type="color"
                        value={tema[k] ?? data.tema_acara[k]}
                        onChange={(e) => setDraf({ ...draf, theme: { ...tema, [k]: e.target.value } })}
                        className="h-9 w-14 cursor-pointer rounded-md border border-outline bg-surface-container-lowest px-1"
                        aria-label={k === "brand" ? "Background colour" : "Accent colour"}
                      />
                      <span className="font-mono text-body-medium text-on-surface">{(tema[k] ?? data.tema_acara[k]).toUpperCase()}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
        </Kelompok>
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-[calc(var(--workspace-top,58px)+16px)] lg:self-start">
        <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-1">
          <PilihPeserta peserta={peserta} onPilih={setPeserta} />
          <ButtonLink native variant="text" href={alamat} target="_blank" rel="noopener" icon={<ArrowSquareOut size={18} />}>Open</ButtonLink>
        </div>
        <p className="text-body-small text-on-surface-variant">
          Preview as this participant. Display and colours update here before you save; questions and texts show the saved version. Nothing is sent or saved, even when Feedback is off.
        </p>
        <iframe key={alamat} src={alamat} title="Feedback preview" className="hidden h-[760px] w-full max-w-[400px] rounded-[28px] border border-outline-variant bg-surface-container lg:block" />
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------- Send */

type InfoKirim = {
  siap: true;
  status: "off" | "not_yet" | "open" | "closed";
  belum: number;
  tanpa_email: number;
  riwayat: { waktu: string; lonceng: number; terkirim: number; email: boolean }[];
  teks: { title: string; body: string };
  tautan_label: string;
  mode_uji: boolean;
};

function TabKirim({ data, berubah }: { data: Data; berubah: boolean }) {
  const toast = useToast();
  const [info, setInfo] = useState<InfoKirim | null>(null);
  const [gagal, setGagal] = useState(false);
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [saluran, setSaluran] = useState<"portal" | "portal_email">("portal_email");
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const tautanPenuh = typeof window === "undefined" ? data.tautan : `${window.location.origin}${data.tautan}`;

  const muat = useCallback(async () => {
    setGagal(false);
    const res = await fetch("/api/admin/feedback/undang", { cache: "no-store" }).catch(() => null);
    const j = res?.ok ? ((await res.json().catch(() => null)) as InfoKirim | { siap: false } | null) : null;
    if (!j || !j.siap) {
      setGagal(true);
      return;
    }
    setInfo(j);
    setJudul((lama) => lama || j.teks.title);
    setIsi((lama) => lama || j.teks.body);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat]);

  async function kirim() {
    setMengirim(true);
    const res = await fetch("/api/admin/feedback/undang", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saluran, title: judul, body: isi }),
    }).catch(() => null);
    setMengirim(false);
    setKonfirmasi(false);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) {
      toast.error("Not sent", j?.error?.details?.message ?? j?.error?.message ?? "Try again in a moment.");
      return;
    }
    const r = j as { lonceng: number; terkirim: number; gagal: number; tanpa_email: number; galat: string | null };
    toast.success(
      `Sent to ${plural(r.lonceng, "participant")}`,
      saluran === "portal_email" ? `${plural(r.terkirim, "email")} sent${r.gagal ? `, ${r.gagal} failed` : ""}${r.tanpa_email ? `, ${r.tanpa_email} without an email address got the bell only` : ""}.` : "They'll see it in the participant area bell.",
    );
    setJudul("");
    setIsi("");
    void muat();
  }

  if (gagal) return <Banner tone="error" actions={<Button variant="text" onClick={() => void muat()}>Try again</Button>}>The send list couldn&apos;t be loaded.</Banner>;
  if (!info) return <p className="text-body-medium text-on-surface-variant">Loading…</p>;
  const terbuka = info.status === "open";
  const pertama = info.riwayat.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {!terbuka ? (
        <Banner tone="info">
          {info.status === "not_yet" ? "Feedback hasn't opened yet. Sending is available from the opening time in Settings." : info.status === "closed" ? "Feedback has closed, so there's nothing to send." : "Turn Feedback on first. Then send it here."}
        </Banner>
      ) : null}
      {berubah ? <Banner tone="warning">You have unsaved changes. Participants see the saved version, so save before sending.</Banner> : null}
      {info.mode_uji ? <Banner tone="info">Test mode on this server: email only goes to addresses on the test list. The bell reaches everyone.</Banner> : null}

      <Kelompok first title={pertama ? "Invite participants" : "Remind who hasn't answered"} note="Goes only to participants who haven't sent their answers, so sending again later reminds the rest and never reaches someone who already answered.">
        <p className="text-title-medium font-semibold tabular-nums">
          {info.belum === 0 ? "Everyone has answered." : info.belum === 1 ? "1 participant hasn't answered yet" : `${plural(info.belum, "participant")} haven't answered yet`}
        </p>
        {info.belum > 0 && info.tanpa_email > 0 ? <p className="text-body-medium text-on-surface-variant">{plural(info.tanpa_email, "has", "have")} no email address and will get the bell only.</p> : null}
        <div className="mt-2 grid gap-3">
          <TextField label="Title" maxLength={JUDUL_MAX} value={judul} onChange={(e) => setJudul(e.target.value)} />
          <TextArea label="Message" rows={4} maxLength={ISI_MAX} counter value={isi} onChange={(e) => setIsi(e.target.value)} hint={`The button "${info.tautan_label}" is added below the message. The email starts with the participant's name.`} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-medium font-semibold">Send through</legend>
            {([
              { v: "portal_email", label: "Bell and email", detail: "The participant area bell, plus a personal email with the button. Best for the trip home, when the app may be closed." },
              { v: "portal", label: "Bell only", detail: "Only participants who open the participant area see it." },
            ] as const).map((o) => (
              <label key={o.v} className={cx("flex cursor-pointer gap-3 rounded-lg p-3 text-body-medium", saluran === o.v ? "border-2 border-primary" : "border border-outline")}>
                <input type="radio" name="feedback-saluran" checked={saluran === o.v} onChange={() => setSaluran(o.v)} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                <span>
                  <span className="block font-semibold">{o.label}</span>
                  <span className="block text-on-surface-variant">{o.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button
            className="self-start"
            icon={<PaperPlaneTilt size={18} />}
            disabled={!terbuka || info.belum === 0 || !judul.trim() || !isi.trim()}
            onClick={() => setKonfirmasi(true)}
          >
            {info.belum > 0 ? `Send to ${plural(info.belum, "participant")}` : "Send"}
          </Button>
        </div>
      </Kelompok>

      {info.riwayat.length ? (
        <Kelompok title="Sent so far">
          <ul className="flex flex-col gap-1 text-body-medium">
            {info.riwayat.map((r) => (
              <li key={r.waktu}>
                <span className="font-semibold">{new Date(r.waktu).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-on-surface-variant">, {plural(r.lonceng, "participant")}{r.email ? `, ${plural(r.terkirim, "email")} sent` : ", bell only"}</span>
              </li>
            ))}
          </ul>
        </Kelompok>
      ) : null}

      <Kelompok title="Or use your own announcement" note="Paste the link into Messages > Announcements > Link. Participants who aren't signed in are asked to sign in and come straight back.">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-body-medium">{tautanPenuh}</code>
          <Button
            variant="outlined"
            icon={<Copy size={18} />}
            onClick={() => {
              navigator.clipboard.writeText(tautanPenuh).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy", "Select the link and copy it."));
            }}
          >
            Copy link
          </Button>
        </div>
      </Kelompok>

      <Dialog
        open={konfirmasi}
        onClose={() => (mengirim ? null : setKonfirmasi(false))}
        title={`Send to ${plural(info.belum, "participant")}?`}
        description={saluran === "portal_email" ? "They get a bell in the participant area and a personal email now. This can't be taken back." : "They get a bell in the participant area now. This can't be taken back."}
        actions={
          <>
            <Button variant="text" onClick={() => setKonfirmasi(false)} disabled={mengirim}>Cancel</Button>
            <Button onClick={() => void kirim()} loading={mengirim}>Send now</Button>
          </>
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------- Results */

function TabHasil({ data }: { data: Data }) {
  const hasil = data.hasil;
  const [kolom, setKolom] = useState<string[]>(KOLOM_AWAL);
  useEffect(() => {
    try {
      const simpan = JSON.parse(window.localStorage.getItem(KUNCI_KOLOM) ?? "null");
      // Pilihan kolom tersimpan di peramban ini, dibaca sesudah hidrasi.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(simpan)) setKolom(simpan.filter((k): k is string => typeof k === "string"));
    } catch {
      /* abaikan */
    }
  }, []);
  const gantiKolom = (k: string) => {
    const baru = kolom.includes(k) ? kolom.filter((x) => x !== k) : [...kolom, k];
    setKolom(baru);
    try {
      window.localStorage.setItem(KUNCI_KOLOM, JSON.stringify(baru));
    } catch {
      /* abaikan */
    }
  };

  if (!hasil) return <Banner tone="error">Results couldn&apos;t be loaded. Reload the page.</Banner>;
  if (hasil.jumlah === 0) return <EmptyState title="No answers yet" description="Answers appear here as soon as participants send them. Copy the link from Settings into an announcement to start." />;

  const persen = hasil.total_peserta ? Math.round((hasil.jumlah / hasil.total_peserta) * 100) : 0;
  const semuaKolom = [...new Set(hasil.baris.flatMap((b) => Object.keys(b.peserta)))].filter((k) => hasil.baris.some((b) => b.peserta[k]));
  const tanya = data.setelan.questions;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[2rem] font-semibold leading-10 tabular-nums">{hasil.jumlah.toLocaleString("en-GB")} <span className="text-title-medium font-normal text-on-surface-variant">of {hasil.total_peserta.toLocaleString("en-GB")} participants responded, {persen}%</span></p>
          <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-surface-container-high" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, persen)}%` }} />
          </div>
        </div>
        <ButtonLink native variant="outlined" href="/api/admin/feedback/export" icon={<DownloadSimple size={18} />}>Download .xlsx</ButtonLink>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {hasil.ringkas.map((r) => <KartuRingkas key={r.key} r={r} />)}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-title-medium font-semibold">Answers by participant</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Participant columns">
          {semuaKolom.map((k) => (
            <FilterChip key={k} selected={kolom.includes(k)} onClick={() => gantiKolom(k)}>{hasil.label[k] ?? k.replace(/^extra\./, "")}</FilterChip>
          ))}
        </div>
        <TableCard>
          <Table minWidth={`${Math.max(640, (kolom.length + tanya.length) * 160)}px`}>
            <TableHead>
              <tr>
                {kolom.filter((k) => semuaKolom.includes(k)).map((k) => <TableHeaderCell key={k}>{hasil.label[k] ?? k.replace(/^extra\./, "")}</TableHeaderCell>)}
                {tanya.map((q) => <TableHeaderCell key={q.key} title={q.title}>{q.title.length > 28 ? `${q.title.slice(0, 27)}…` : q.title}</TableHeaderCell>)}
                <TableHeaderCell>Sent</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {hasil.baris.map((b) => (
                <TableRow key={b.participant_id}>
                  {kolom.filter((k) => semuaKolom.includes(k)).map((k, n) => <TableCell key={k} strong={n === 0}><span className="whitespace-nowrap">{b.peserta[k] ?? "—"}</span></TableCell>)}
                  {tanya.map((q) => {
                    const v = b.answers[q.key];
                    return <TableCell key={q.key} numeric={typeof v === "number"}>{Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "—" : String(v)}</TableCell>;
                  })}
                  <TableCell>{new Date(b.submitted_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </div>
    </div>
  );
}

function Batang({ label, n, total }: { label: string; n: number; total: number }) {
  const p = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_64px] items-center gap-2 text-body-small tabular-nums">
      <span className="truncate" title={label}>{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-surface-container-high"><span className="block h-full rounded-full bg-primary" style={{ width: `${p}%` }} /></span>
      <span className="text-right text-on-surface-variant">{n}, {p}%</span>
    </div>
  );
}

function KartuRingkas({ r }: { r: HasilPertanyaan }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-body-large font-semibold">{r.title}</h3>
        <span className="shrink-0 text-body-small text-on-surface-variant">{r.count} answers</span>
      </div>
      {r.type === "faces" ? (
        <>
          <p className="text-title-large font-semibold tabular-nums">{r.average ?? "—"} <span className="text-body-medium font-normal text-on-surface-variant">average of 5</span></p>
          {["Poor", "Fair", "Okay", "Good", "Great"].map((l, n) => <Batang key={l} label={`${n + 1}, ${l}`} n={r.spread[n]} total={r.count} />).reverse()}
        </>
      ) : null}
      {r.type === "nps" ? (
        <>
          <p className="text-title-large font-semibold tabular-nums">{r.score === null ? "—" : r.score > 0 ? `+${r.score}` : r.score} <span className="text-body-medium font-normal text-on-surface-variant">Net Promoter Score</span></p>
          <Batang label="9 to 10" n={r.promoters} total={r.count} />
          <Batang label="7 to 8" n={r.passives} total={r.count} />
          <Batang label="0 to 6" n={r.detractors} total={r.count} />
        </>
      ) : null}
      {r.type === "choice" ? r.options.slice(0, 8).map((o) => <Batang key={o.label} label={o.label} n={o.count} total={r.count} />) : null}
      {r.type === "text" ? (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {r.latest.map((x, n) => <li key={n} className="border-l-2 border-outline-variant pl-3 text-body-medium">{x.text}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
