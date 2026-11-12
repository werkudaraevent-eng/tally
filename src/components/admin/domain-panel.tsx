"use client";

import { ArrowSquareOut, CheckCircle, Circle, CircleNotch, Copy, LinkSimple, ShieldCheck, Trash, Warning, WarningCircle, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { Banner, Button, Dialog, Pane, StatusChip } from "@/components/m3";
import { SettingRow } from "@/components/admin/settings-panel";
import { formatEventDateTime } from "@/lib/datetime";
import { timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";
import { cx } from "@/lib/m3/cx";

/**
 * Kartu "Alamat halaman acara": domain milik klien untuk halaman acara.
 *
 * Kartu SENDIRI di bawah kartu setelan, tanpa footer "Simpan perubahan": semua
 * aksinya langsung berjalan karena melibatkan DNS pihak luar (temuan QA H1).
 * Statusnya diperbarui server (pg_cron tiap 5 menit); halaman ini hanya membaca
 * ulang tiap menit selama domain menunggu.
 */

type RecordDns = { purpose: "arah" | "kepemilikan"; type: "CNAME" | "A" | "TXT"; name: string; value: string };
type Domain = {
  domain: string;
  status: "menunggu" | "aktif" | "bermasalah" | "dilepas";
  records: RecordDns[];
  problem: string | null;
  target: string | null;
  stale: boolean;
  created_at: string;
  status_since: string;
  last_checked_at: string | null;
};
type Data = { ready: boolean; domain: Domain | null; tally_url: string; sender: string | null; time_zone: EventTimeZone };

const kelasInput = "h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium text-on-surface outline-none focus:border-primary";

function tanpaSkema(url: string) {
  return url.replace(/^https?:\/\//, "");
}

function Catatan({ tone, children }: { tone: "error" | "warning"; children: ReactNode }) {
  return (
    <p className={cx("flex items-start gap-2 rounded-md p-3 text-body-medium text-on-surface", tone === "error" ? "bg-error-soft" : "bg-warning-soft")}>
      {tone === "error" ? <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-error" /> : <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-warning" />}
      <span>{children}</span>
    </p>
  );
}

type Tanda = "done" | "active" | "error" | "todo";

function Langkah({ k, title, children }: { k: Tanda; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0">
        {k === "done" ? <CheckCircle size={18} weight="fill" className="text-success" aria-label="Done" />
          : k === "error" ? <WarningCircle size={18} weight="fill" className="text-error" aria-label="Needs fixing" />
          : k === "active" ? <CircleNotch size={18} weight="bold" className="animate-spin text-primary motion-reduce:animate-none" aria-label="In progress" />
          : <Circle size={18} className="text-outline" aria-label="Not yet" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx("text-body-medium", k === "todo" ? "text-on-surface-variant" : "font-medium text-on-surface")}>{title}</p>
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </li>
  );
}

function KartuRecord({ record, onCopy }: { record: RecordDns; onCopy: (label: string, value: string) => void }) {
  const baris: [string, string][] = [["Type", record.type], ["Name", record.name], ["Value", record.value]];
  return (
    <div className="overflow-hidden rounded-md border border-outline-variant">
      <p className="border-b border-outline-variant bg-surface-container-low px-3 py-2 text-body-medium font-medium text-on-surface">
        {record.purpose === "arah" ? "Point the domain to Tally" : "Proof of ownership (this domain was used elsewhere before)"}
      </p>
      {baris.map(([label, nilai]) => (
        <div key={label} className="flex items-center gap-3 border-b border-outline-variant px-3 py-1.5 last:border-b-0">
          <span className="w-12 shrink-0 text-body-medium text-on-surface-variant">{label}</span>
          <code className="min-w-0 flex-1 break-all font-mono text-body-medium text-on-surface">{nilai}</code>
          <button
            type="button"
            aria-label={`Copy ${record.type} ${label.toLowerCase()}`}
            onClick={() => onCopy(label, nilai)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-on-surface-variant hover:bg-primary-soft"
          >
            <Copy size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Teks siap tempel untuk tim IT klien (WhatsApp atau email). */
function petunjuk(domain: Domain) {
  const baris = domain.records.map((r, i) => {
    // Panel DNS berbeda-beda: ada yang minta nama pendek, ada yang nama lengkap.
    const lengkap = r.purpose === "arah" ? (r.name === "@" ? " (domain utama)" : ` (nama lengkap: ${domain.domain})`) : "";
    return `${i + 1}. Tipe: ${r.type}\n   Nama: ${r.name}${lengkap}\n   Nilai: ${r.value}`;
  });
  const arah = domain.records.find((r) => r.purpose === "arah");
  // Record lama yang masih ada untuk nama yang sama (mis. dua record A @).
  const hapus = domain.problem === "record_lama" && domain.target && arah
    ? ["", `Mohon HAPUS juga record ${arah.type} lama untuk nama ${arah.name} dengan nilai: ${domain.target}. Record dengan nilai ${arah.value} jangan dihapus.`]
    : [];
  return [
    `Halo, mohon bantu pasang record DNS berikut supaya halaman acara bisa dibuka di ${domain.domain}:`,
    "",
    ...baris,
    ...hapus,
    "",
    "Bila domain memakai Cloudflare, atur record ini ke \"DNS only\" (awan abu-abu), bukan \"Proxied\".",
    "Setelah dipasang, halaman aktif sendiri dalam beberapa menit. Terima kasih.",
  ].join("\n");
}

function masalahTeks(domain: Domain): ReactNode {
  switch (domain.problem) {
    case "mengarah_lain":
      return <>This domain still points to <code className="font-mono">{domain.target}</code>, not to Tally. Ask the client&apos;s IT team to change the <span className="font-medium">Value</span> to exactly the one above.</>;
    case "record_lama": {
      const arah = domain.records.find((r) => r.purpose === "arah");
      const banyak = (domain.target ?? "").includes(",");
      return <>The right record is in place, but {banyak ? "old records" : "an old record"}{arah ? <> {arah.type} for <code className="font-mono">{arah.name}</code></> : null} still {banyak ? "point" : "points"} to <code className="font-mono">{domain.target}</code>. Ask the client&apos;s IT team to <span className="font-medium">delete</span> {banyak ? "those records" : "that record"} and keep only{arah ? <> <code className="font-mono">{arah.value}</code></> : " the record above"}.</>;
    }
    case "cloudflare":
      return <>This domain goes through the Cloudflare proxy (orange cloud). Ask the client&apos;s IT team to set this record to <span className="font-medium">DNS only</span> (grey cloud).</>;
    case "caa":
      return <>The client&apos;s domain has a CAA record that does not allow Let&apos;s Encrypt, so the secure padlock (HTTPS) cannot be set up. Ask the client&apos;s IT team to add <code className="font-mono">0 issue &quot;letsencrypt.org&quot;</code>.</>;
    default:
      return null;
  }
}

export function DomainPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [masukan, setMasukan] = useState("");
  const [galatMasukan, setGalatMasukan] = useState("");
  const [sibuk, setSibuk] = useState<"" | "hubungkan" | "periksa" | "lepas" | "hapus" | "batal" | "lagi">("");
  const [dialog, setDialog] = useState<"" | "batal" | "lepas" | "hapus">("");
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/domain", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setLoadError("The event page address could not be loaded."); return; }
    setLoadError("");
    setData(await response.json() as Data);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  // Selama menunggu, baca ulang tiap menit: begitu cron server melihat DNS
  // benar, kartu berubah sendiri tanpa admin menekan apa pun.
  const menunggu = data?.domain?.status === "menunggu";
  useEffect(() => {
    if (!menunggu) return;
    const timer = window.setInterval(() => { void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [menunggu, load]);

  async function kirim(method: "POST" | "PATCH" | "DELETE", body: object | null, langkah: typeof sibuk) {
    setSibuk(langkah);
    const response = await fetch("/api/admin/domain", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const hasil = await response?.json().catch(() => null) as (Data & { error?: { code: string; message: string } }) | null;
    setSibuk("");
    if (!response?.ok || !hasil) return { ok: false as const, message: hasil?.error?.message ?? "Could not reach the server. Try again." };
    setData(hasil);
    return { ok: true as const, data: hasil };
  }

  async function hubungkan() {
    setGalatMasukan("");
    if (!masukan.trim()) { setGalatMasukan("Enter the client's domain first, for example event.clientname.com."); return; }
    const hasil = await kirim("POST", { domain: masukan }, "hubungkan");
    if (!hasil.ok) { setGalatMasukan(hasil.message); return; }
    setMasukan("");
    toast.success("Domain added", hasil.data.domain?.status === "aktif" ? "The page now opens on this domain." : "Send the instructions to the client's IT team.");
  }

  async function aksi(nama: "periksa" | "lepas" | "hubungkan_lagi", langkah: typeof sibuk) {
    const hasil = await kirim("PATCH", { aksi: nama }, langkah);
    if (!hasil.ok) { toast.error("Not done", hasil.message); return; }
    if (nama === "lepas") toast.success("Domain disconnected", "The page is back on its Tally address.");
    if (nama === "periksa") {
      const status = hasil.data.domain?.status;
      if (status === "aktif") toast.success("Domain active", "The page now opens on this domain.");
      else toast.info("Checked", "The DNS record is not right yet or not visible yet. Tally checks again automatically.");
    }
  }

  async function hapus(langkah: "batal" | "hapus") {
    const hasil = await kirim("DELETE", null, langkah);
    setDialog("");
    if (!hasil.ok) { toast.error("Not done", hasil.message); return; }
    toast.success(langkah === "batal" ? "Domain cancelled" : "Domain deleted", "Participants use the Tally address.");
  }

  async function salin(teks: string, judul: string) {
    try {
      await navigator.clipboard.writeText(teks);
      toast.success(judul);
    } catch {
      toast.error("Could not copy", "Copy the text by hand.");
    }
  }

  const keterangan = (
    <>
      The address participants open. It can use the client&apos;s own domain, for example event.clientname.com.{" "}
      <span className="font-medium text-on-surface">Applied straight away, no need to Save changes.</span>
    </>
  );

  if (loadError) {
    return (
      <Banner tone="error" icon={<XCircle size={18} />} actions={<Button variant="outlined" size="sm" onClick={() => void load()}>Try again</Button>}>
        {loadError}
      </Banner>
    );
  }

  if (!data) {
    return (
      <Pane aria-label="Loading event page address">
        <div className="grid gap-3 px-5 py-6 md:grid-cols-[2fr_3fr] md:gap-8">
          <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
          <div className="h-9 w-full animate-pulse rounded-md bg-surface-container-high" />
        </div>
      </Pane>
    );
  }

  const domain = data.domain;
  const alamatTally = tanpaSkema(data.tally_url);
  const waktu = (iso: string) => `${formatEventDateTime(iso, data.time_zone)} ${timeZoneAbbr(data.time_zone)}`;

  let isi: ReactNode;
  if (!domain) {
    isi = (
      <div className="flex flex-col gap-3">
        <p className="text-body-medium text-on-surface-variant">
          Now: <a className="rounded-sm font-medium text-primary hover:underline" href={data.tally_url} target="_blank" rel="noreferrer">{alamatTally}</a>
        </p>
        {!data.ready ? (
          <Catatan tone="warning">Client domains cannot be used on this server yet. Contact the Tally team.</Catatan>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void hubungkan(); }}>
            <label className="mb-1.5 block text-body-medium font-medium text-on-surface" htmlFor="domain-klien">Client domain</label>
            <div className="flex gap-2">
              <input
                id="domain-klien"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={253}
                value={masukan}
                placeholder="event.clientname.com"
                aria-invalid={galatMasukan ? true : undefined}
                aria-describedby="domain-klien-bantuan"
                onChange={(event) => { setMasukan(event.target.value); setGalatMasukan(""); }}
                className={cx(kelasInput, galatMasukan && "border-error")}
              />
              <Button type="submit" size="md" className="shrink-0" loading={sibuk === "hubungkan"}>Connect</Button>
            </div>
            {galatMasukan ? (
              <p id="domain-klien-bantuan" role="alert" className="mt-1.5 flex items-start gap-1.5 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{galatMasukan}</p>
            ) : apexDiketik(masukan) ? (
              <div id="domain-klien-bantuan" className="mt-2">
                <Catatan tone="warning">This looks like the client&apos;s main domain. If the client&apos;s website already uses this address, the event page will replace it. A subdomain is safer, for example <span className="font-medium">event.{masukan.trim().replace(/^https?:\/\//, "").split("/")[0]}</span>.</Catatan>
              </div>
            ) : (
              <p id="domain-klien-bantuan" className="mt-1.5 text-body-medium text-on-surface-variant">Use a subdomain, not the client&apos;s main domain, so their website is not affected.</p>
            )}
          </form>
        )}
      </div>
    );
  } else {
    const chip = domain.status === "aktif" ? <StatusChip tone="success" dot>Active</StatusChip>
      : domain.status === "bermasalah" ? <StatusChip tone="warning" dot>Problem</StatusChip>
      : domain.status === "dilepas" ? <StatusChip tone="neutral" dot>Disconnected</StatusChip>
      : masalahTeks(domain) ? <StatusChip tone="error" dot>DNS not right yet</StatusChip>
      : domain.problem === "https" || domain.problem === "tidak_terbuka" ? <StatusChip tone="primary" dot>Setting up HTTPS</StatusChip>
      : <StatusChip tone="warning" dot>Waiting for DNS</StatusChip>;

    const panduanDns = (masalah: ReactNode) => (
      <div className="flex flex-col gap-3">
        {domain.records.map((record) => <KartuRecord key={`${record.type}-${record.name}`} record={record} onCopy={(label, nilai) => void salin(nilai, `${label} copied`)} />)}
        {masalah ? <Catatan tone="error">{masalah}</Catatan> : null}
        {domain.stale && domain.status === "menunggu" ? <Catatan tone="warning">More than 2 days have passed and the record is still not in place. Send the instructions to the client&apos;s IT team again, or cancel this domain.</Catatan> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outlined" size="sm" icon={<Copy size={16} />} onClick={() => void salin(petunjuk(domain), "Instructions copied (in Indonesian). Paste them into WhatsApp or an email to the client's IT team.")}>Copy instructions for the client&apos;s IT team</Button>
          <Button variant="outlined" size="sm" loading={sibuk === "periksa"} onClick={() => void aksi("periksa", "periksa")}>Check now</Button>
        </div>
        <p className="text-body-medium text-on-surface-variant">Tally checks automatically. The status here changes by itself once ready, usually a few minutes after the record is added.</p>
      </div>
    );

    let badan: ReactNode;
    if (domain.status === "aktif") {
      badan = (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5 text-body-medium text-on-surface-variant">
            <li className="flex items-start gap-2"><ShieldCheck size={16} weight="fill" className="mt-0.5 shrink-0 text-success" />Tally now serves the page on this address, with the secure padlock (HTTPS).</li>
            <li className="flex items-start gap-2"><CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-success" /><span>Links in invitation, confirmation and sign-in emails point to this address.{data.sender ? <> The email sender stays <span className="text-on-surface">{data.sender}</span>.</> : null}</span></li>
            <li className="flex items-start gap-2"><CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-success" /><span>The old address <span className="break-all text-on-surface">{alamatTally}</span> redirects here. Participants who signed in on the old address need to sign in once more.</span></li>
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outlined" size="sm" trailingIcon={<ArrowSquareOut size={16} />} onClick={() => window.open(`https://${domain.domain}`, "_blank", "noopener")}>Open page</Button>
            <Button variant="outlined" size="sm" className="text-error" onClick={() => setDialog("lepas")}>Disconnect domain</Button>
          </div>
        </div>
      );
    } else if (domain.status === "bermasalah") {
      // Temuan QA N1: jujur. Saat DNS rusak, kunjungan ke domain klien tidak
      // sampai ke Tally sama sekali, jadi tidak ada yang bisa "dipindahkan".
      badan = (
        <div className="flex flex-col gap-3">
          <Catatan tone="warning">
            Since {waktu(domain.status_since)} this address no longer points to Tally, so participants who open it (including from old emails) do not reach the event page. New emails use <span className="break-all font-medium">{alamatTally}</span> until the DNS is fixed.
          </Catatan>
          {panduanDns(null)}
          <div>
            <Button variant="outlined" size="sm" className="text-error" onClick={() => setDialog("lepas")}>Disconnect domain</Button>
          </div>
        </div>
      );
    } else if (domain.status === "dilepas") {
      badan = (
        <div className="flex flex-col gap-3">
          <p className="text-body-medium text-on-surface-variant">The page is back on <span className="break-all text-on-surface">{alamatTally}</span>. Old links to {domain.domain} still redirect there while the client&apos;s DNS record stays.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outlined" size="sm" loading={sibuk === "lagi"} disabled={!data.ready} onClick={() => void aksi("hubungkan_lagi", "lagi")}>Connect again</Button>
            <Button variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} disabled={!data.ready} onClick={() => setDialog("hapus")}>Delete permanently</Button>
          </div>
        </div>
      );
    } else {
      const masalah = masalahTeks(domain);
      const dnsBenar = domain.problem === "https" || domain.problem === "tidak_terbuka";
      badan = (
        <>
          <ol className="flex flex-col gap-4">
            <Langkah k="done" title="Domain added to Tally" />
            <Langkah k={dnsBenar ? "done" : masalah ? "error" : "active"} title="The client's IT team adds the DNS record">
              {dnsBenar ? null : panduanDns(masalah)}
            </Langkah>
            <Langkah k={dnsBenar ? "active" : "todo"} title={dnsBenar ? "Setting up the secure padlock (HTTPS), usually a few minutes" : "Page live with the secure padlock (HTTPS)"} />
          </ol>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-body-medium text-on-surface-variant">While waiting, participants keep using <span className="break-all text-on-surface">{alamatTally}</span>.</p>
            <button type="button" onClick={() => setDialog("batal")} className="rounded-sm text-body-medium font-medium text-error hover:underline">Cancel this domain</button>
          </div>
        </>
      );
    }

    isi = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-body-medium font-medium text-on-surface">
            <LinkSimple size={16} className="shrink-0 text-on-surface-variant" />
            <span className="truncate">{domain.domain}</span>
          </span>
          {chip}
        </div>
        {badan}
      </div>
    );
  }

  return (
    <>
      <Pane aria-label="Event page address">
        <SettingRow title="Event page address" description={keterangan}>{isi}</SettingRow>
      </Pane>

      <Dialog
        open={dialog === "batal"}
        onClose={() => setDialog("")}
        dismissible={!sibuk}
        tone="danger"
        icon={<Warning size={20} weight="fill" />}
        title={`Cancel ${domain?.domain ?? "domain"}?`}
        description={<>The domain is removed from Tally and the DNS instructions already sent no longer apply. Participants keep using <span className="font-medium">{alamatTally}</span>.</>}
        actions={<><Button variant="outlined" disabled={Boolean(sibuk)} onClick={() => setDialog("")}>Keep</Button><Button variant="danger" loading={sibuk === "batal"} onClick={() => void hapus("batal")}>Cancel domain</Button></>}
      />
      <Dialog
        open={dialog === "lepas"}
        onClose={() => setDialog("")}
        dismissible={!sibuk}
        tone="danger"
        icon={<Warning size={20} weight="fill" />}
        title={`Disconnect ${domain?.domain ?? "domain"}?`}
        description={<>The page goes back to <span className="font-medium">{alamatTally}</span>. Old links to the client&apos;s domain still redirect there while the client&apos;s DNS record stays. You can connect it again at any time.</>}
        actions={<><Button variant="outlined" disabled={Boolean(sibuk)} onClick={() => setDialog("")}>Cancel</Button><Button variant="danger" loading={sibuk === "lepas"} onClick={() => { void aksi("lepas", "lepas").then(() => setDialog("")); }}>Disconnect domain</Button></>}
      />
      <Dialog
        open={dialog === "hapus"}
        onClose={() => setDialog("")}
        dismissible={!sibuk}
        tone="danger"
        icon={<Warning size={20} weight="fill" />}
        title={`Delete ${domain?.domain ?? "domain"} from Tally?`}
        description={<>Links to this domain in emails already sent will stop opening. The event page stays on <span className="font-medium">{alamatTally}</span>.</>}
        actions={<><Button variant="outlined" disabled={Boolean(sibuk)} onClick={() => setDialog("")}>Cancel</Button><Button variant="danger" loading={sibuk === "hapus"} icon={<Trash size={16} />} onClick={() => void hapus("hapus")}>Delete permanently</Button></>}
      />
    </>
  );
}

/** Tebakan ringan di browser; server tetap menormalkan dan memutuskan. */
function apexDiketik(teks: string) {
  const bersih = teks.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/\.+$/, "");
  const bagian = bersih.split(".").filter(Boolean);
  if (bagian.length < 2 || !/^[a-z]{2,}$/.test(bagian.at(-1) ?? "")) return false;
  if (bagian.length === 2) return true;
  return bagian.length === 3 && /^(co|or|ac|go|web|my|biz|sch|net)$/.test(bagian[1]) && bagian[2] === "id";
}
