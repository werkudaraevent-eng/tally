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
        {k === "done" ? <CheckCircle size={18} weight="fill" className="text-success" aria-label="Selesai" />
          : k === "error" ? <WarningCircle size={18} weight="fill" className="text-error" aria-label="Perlu dibetulkan" />
          : k === "active" ? <CircleNotch size={18} weight="bold" className="animate-spin text-primary motion-reduce:animate-none" aria-label="Sedang berjalan" />
          : <Circle size={18} className="text-outline" aria-label="Belum" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx("text-body-medium", k === "todo" ? "text-on-surface-variant" : "font-medium text-on-surface")}>{title}</p>
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </li>
  );
}

function KartuRecord({ record, onCopy }: { record: RecordDns; onCopy: (label: string, value: string) => void }) {
  const baris: [string, string][] = [["Tipe", record.type], ["Nama", record.name], ["Nilai", record.value]];
  return (
    <div className="overflow-hidden rounded-md border border-outline-variant">
      <p className="border-b border-outline-variant bg-surface-container-low px-3 py-2 text-body-medium font-medium text-on-surface">
        {record.purpose === "arah" ? "Arahkan domain ke Tally" : "Bukti kepemilikan (domain ini pernah dipakai di tempat lain)"}
      </p>
      {baris.map(([label, nilai]) => (
        <div key={label} className="flex items-center gap-3 border-b border-outline-variant px-3 py-1.5 last:border-b-0">
          <span className="w-12 shrink-0 text-body-medium text-on-surface-variant">{label}</span>
          <code className="min-w-0 flex-1 break-all font-mono text-body-medium text-on-surface">{nilai}</code>
          <button
            type="button"
            aria-label={`Salin ${label.toLowerCase()} ${record.type}`}
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
  return [
    `Halo, mohon bantu pasang record DNS berikut supaya halaman acara bisa dibuka di ${domain.domain}:`,
    "",
    ...baris,
    "",
    "Bila domain memakai Cloudflare, atur record ini ke \"DNS only\" (awan abu-abu), bukan \"Proxied\".",
    "Setelah dipasang, halaman aktif sendiri dalam beberapa menit. Terima kasih.",
  ].join("\n");
}

function masalahTeks(domain: Domain): ReactNode {
  switch (domain.problem) {
    case "mengarah_lain":
      return <>Domain ini masih mengarah ke <code className="font-mono">{domain.target}</code>, belum ke Tally. Minta tim IT klien mengganti <span className="font-medium">Nilai</span> menjadi persis seperti di atas.</>;
    case "cloudflare":
      return <>Domain ini lewat proxy Cloudflare (awan oranye). Minta tim IT klien mengubahnya menjadi <span className="font-medium">DNS only</span> (awan abu-abu) untuk record ini.</>;
    case "caa":
      return <>Ada record CAA di domain klien yang tidak mengizinkan Let&apos;s Encrypt, jadi gembok aman (HTTPS) tidak bisa dibuat. Minta tim IT klien menambahkan <code className="font-mono">0 issue &quot;letsencrypt.org&quot;</code>.</>;
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
    if (!response?.ok) { setLoadError("Alamat halaman acara gagal dimuat."); return; }
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
    if (!response?.ok || !hasil) return { ok: false as const, message: hasil?.error?.message ?? "Tidak tersambung ke server. Coba lagi." };
    setData(hasil);
    return { ok: true as const, data: hasil };
  }

  async function hubungkan() {
    setGalatMasukan("");
    if (!masukan.trim()) { setGalatMasukan("Isi domain klien dulu, misalnya event.namaklien.com."); return; }
    const hasil = await kirim("POST", { domain: masukan }, "hubungkan");
    if (!hasil.ok) { setGalatMasukan(hasil.message); return; }
    setMasukan("");
    toast.success("Domain didaftarkan", hasil.data.domain?.status === "aktif" ? "Halaman sudah bisa dibuka di domain ini." : "Kirim petunjuk ke tim IT klien.");
  }

  async function aksi(nama: "periksa" | "lepas" | "hubungkan_lagi", langkah: typeof sibuk) {
    const hasil = await kirim("PATCH", { aksi: nama }, langkah);
    if (!hasil.ok) { toast.error("Belum berhasil", hasil.message); return; }
    if (nama === "lepas") toast.success("Domain dilepas", "Halaman kembali ke alamat Tally.");
    if (nama === "periksa") {
      const status = hasil.data.domain?.status;
      if (status === "aktif") toast.success("Domain aktif", "Halaman sudah bisa dibuka di domain ini.");
      else toast.info("Sudah diperiksa", "Record DNS belum benar atau belum terlihat. Tally memeriksa lagi otomatis.");
    }
  }

  async function hapus(langkah: "batal" | "hapus") {
    const hasil = await kirim("DELETE", null, langkah);
    setDialog("");
    if (!hasil.ok) { toast.error("Belum berhasil", hasil.message); return; }
    toast.success(langkah === "batal" ? "Domain dibatalkan" : "Domain dihapus", "Peserta memakai alamat Tally.");
  }

  async function salin(teks: string, judul: string) {
    try {
      await navigator.clipboard.writeText(teks);
      toast.success(judul);
    } catch {
      toast.error("Tidak bisa menyalin", "Salin teksnya secara manual.");
    }
  }

  const keterangan = (
    <>
      Alamat yang dibuka peserta. Bisa memakai domain milik klien, misalnya event.namaklien.com.{" "}
      <span className="font-medium text-on-surface">Langsung diproses, tidak perlu Simpan perubahan.</span>
    </>
  );

  if (loadError) {
    return (
      <Banner tone="error" icon={<XCircle size={18} />} actions={<Button variant="outlined" size="sm" onClick={() => void load()}>Coba lagi</Button>}>
        {loadError}
      </Banner>
    );
  }

  if (!data) {
    return (
      <Pane aria-label="Memuat alamat halaman acara">
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
          Sekarang: <a className="rounded-sm font-medium text-primary hover:underline" href={data.tally_url} target="_blank" rel="noreferrer">{alamatTally}</a>
        </p>
        {!data.ready ? (
          <Catatan tone="warning">Domain klien belum bisa dipakai di server ini. Hubungi pengelola Tally.</Catatan>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void hubungkan(); }}>
            <label className="mb-1.5 block text-body-medium font-medium text-on-surface" htmlFor="domain-klien">Domain klien</label>
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
                placeholder="event.namaklien.com"
                aria-invalid={galatMasukan ? true : undefined}
                aria-describedby="domain-klien-bantuan"
                onChange={(event) => { setMasukan(event.target.value); setGalatMasukan(""); }}
                className={cx(kelasInput, galatMasukan && "border-error")}
              />
              <Button type="submit" size="md" className="shrink-0" loading={sibuk === "hubungkan"}>Hubungkan</Button>
            </div>
            {galatMasukan ? (
              <p id="domain-klien-bantuan" role="alert" className="mt-1.5 flex items-start gap-1.5 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{galatMasukan}</p>
            ) : apexDiketik(masukan) ? (
              <div id="domain-klien-bantuan" className="mt-2">
                <Catatan tone="warning">Ini tampak seperti domain utama klien. Kalau situs klien sudah memakai alamat ini, situs itu akan tergantikan halaman acara. Lebih aman memakai subdomain, misalnya <span className="font-medium">event.{masukan.trim().replace(/^https?:\/\//, "").split("/")[0]}</span>.</Catatan>
              </div>
            ) : (
              <p id="domain-klien-bantuan" className="mt-1.5 text-body-medium text-on-surface-variant">Pakai subdomain, bukan domain utama klien, supaya situs mereka tidak terganggu.</p>
            )}
          </form>
        )}
      </div>
    );
  } else {
    const chip = domain.status === "aktif" ? <StatusChip tone="success" dot>Aktif</StatusChip>
      : domain.status === "bermasalah" ? <StatusChip tone="warning" dot>Bermasalah</StatusChip>
      : domain.status === "dilepas" ? <StatusChip tone="neutral" dot>Dilepas</StatusChip>
      : masalahTeks(domain) ? <StatusChip tone="error" dot>DNS belum benar</StatusChip>
      : domain.problem === "https" || domain.problem === "tidak_terbuka" ? <StatusChip tone="primary" dot>Menyiapkan HTTPS</StatusChip>
      : <StatusChip tone="warning" dot>Menunggu DNS</StatusChip>;

    const panduanDns = (masalah: ReactNode) => (
      <div className="flex flex-col gap-3">
        {domain.records.map((record) => <KartuRecord key={`${record.type}-${record.name}`} record={record} onCopy={(label, nilai) => void salin(nilai, `${label} disalin`)} />)}
        {masalah ? <Catatan tone="error">{masalah}</Catatan> : null}
        {domain.stale && domain.status === "menunggu" ? <Catatan tone="warning">Sudah lebih dari 2 hari dan record belum terpasang. Kirim ulang petunjuk ke tim IT klien, atau batalkan domain ini.</Catatan> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outlined" size="sm" icon={<Copy size={16} />} onClick={() => void salin(petunjuk(domain), "Petunjuk disalin. Tempel ke WhatsApp atau email tim IT klien.")}>Salin petunjuk untuk tim IT klien</Button>
          <Button variant="outlined" size="sm" loading={sibuk === "periksa"} onClick={() => void aksi("periksa", "periksa")}>Periksa sekarang</Button>
        </div>
        <p className="text-body-medium text-on-surface-variant">Tally memeriksa otomatis. Status di sini berubah sendiri begitu siap, biasanya beberapa menit setelah record dipasang.</p>
      </div>
    );

    let badan: ReactNode;
    if (domain.status === "aktif") {
      badan = (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5 text-body-medium text-on-surface-variant">
            <li className="flex items-start gap-2"><ShieldCheck size={16} weight="fill" className="mt-0.5 shrink-0 text-success" />Halaman sudah dibuka Tally lewat alamat ini, dengan gembok aman (HTTPS).</li>
            <li className="flex items-start gap-2"><CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-success" /><span>Tautan di email undangan, konfirmasi, dan masuk mengarah ke alamat ini.{data.sender ? <> Pengirim email tetap <span className="text-on-surface">{data.sender}</span>.</> : null}</span></li>
            <li className="flex items-start gap-2"><CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-success" /><span>Alamat lama <span className="break-all text-on-surface">{alamatTally}</span> diarahkan ke sini. Peserta yang sudah masuk lewat alamat lama perlu masuk sekali lagi.</span></li>
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outlined" size="sm" trailingIcon={<ArrowSquareOut size={16} />} onClick={() => window.open(`https://${domain.domain}`, "_blank", "noopener")}>Buka halaman</Button>
            <Button variant="outlined" size="sm" className="text-error" onClick={() => setDialog("lepas")}>Lepas domain</Button>
          </div>
        </div>
      );
    } else if (domain.status === "bermasalah") {
      // Temuan QA N1: jujur. Saat DNS rusak, kunjungan ke domain klien tidak
      // sampai ke Tally sama sekali, jadi tidak ada yang bisa "dipindahkan".
      badan = (
        <div className="flex flex-col gap-3">
          <Catatan tone="warning">
            Sejak {waktu(domain.status_since)} alamat ini tidak lagi mengarah ke Tally, jadi peserta yang membukanya (termasuk dari email lama) tidak sampai ke halaman acara. Email baru memakai <span className="break-all font-medium">{alamatTally}</span> sampai DNS dibetulkan.
          </Catatan>
          {panduanDns(null)}
          <div>
            <Button variant="outlined" size="sm" className="text-error" onClick={() => setDialog("lepas")}>Lepas domain</Button>
          </div>
        </div>
      );
    } else if (domain.status === "dilepas") {
      badan = (
        <div className="flex flex-col gap-3">
          <p className="text-body-medium text-on-surface-variant">Halaman kembali di <span className="break-all text-on-surface">{alamatTally}</span>. Tautan lama ke {domain.domain} masih diarahkan ke sana selama DNS klien belum dihapus.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outlined" size="sm" loading={sibuk === "lagi"} disabled={!data.ready} onClick={() => void aksi("hubungkan_lagi", "lagi")}>Hubungkan lagi</Button>
            <Button variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} disabled={!data.ready} onClick={() => setDialog("hapus")}>Hapus permanen</Button>
          </div>
        </div>
      );
    } else {
      const masalah = masalahTeks(domain);
      const dnsBenar = domain.problem === "https" || domain.problem === "tidak_terbuka";
      badan = (
        <>
          <ol className="flex flex-col gap-4">
            <Langkah k="done" title="Domain didaftarkan ke Tally" />
            <Langkah k={dnsBenar ? "done" : masalah ? "error" : "active"} title="Tim IT klien memasang record DNS">
              {dnsBenar ? null : panduanDns(masalah)}
            </Langkah>
            <Langkah k={dnsBenar ? "active" : "todo"} title={dnsBenar ? "Menyiapkan gembok aman (HTTPS), biasanya beberapa menit" : "Halaman aktif dengan gembok aman (HTTPS)"} />
          </ol>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-body-medium text-on-surface-variant">Selama menunggu, peserta tetap memakai <span className="break-all text-on-surface">{alamatTally}</span>.</p>
            <button type="button" onClick={() => setDialog("batal")} className="rounded-sm text-body-medium font-medium text-error hover:underline">Batalkan domain ini</button>
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
      <Pane aria-label="Alamat halaman acara">
        <SettingRow title="Alamat halaman acara" description={keterangan}>{isi}</SettingRow>
      </Pane>

      <Dialog
        open={dialog === "batal"}
        onClose={() => setDialog("")}
        dismissible={!sibuk}
        tone="danger"
        icon={<Warning size={20} weight="fill" />}
        title={`Batalkan ${domain?.domain ?? "domain"}?`}
        description={<>Domain dihapus dari Tally dan petunjuk DNS yang sudah dikirim tidak berlaku lagi. Peserta tetap memakai <span className="font-medium">{alamatTally}</span>.</>}
        actions={<><Button variant="outlined" disabled={Boolean(sibuk)} onClick={() => setDialog("")}>Batal</Button><Button variant="danger" loading={sibuk === "batal"} onClick={() => void hapus("batal")}>Batalkan domain</Button></>}
      />
      <Dialog
        open={dialog === "lepas"}
        onClose={() => setDialog("")}
        dismissible={!sibuk}
        tone="danger"
        icon={<Warning size={20} weight="fill" />}
        title={`Lepas domain ${domain?.domain ?? ""}?`}
        description={<>Halaman kembali ke <span className="font-medium">{alamatTally}</span>. Tautan lama ke domain klien tetap diarahkan ke sana selama DNS klien belum dihapus. Bisa dihubungkan lagi kapan saja.</>}
        actions={<><Button variant="outlined" disabled={Boolean(sibuk)} onClick={() => setDialog("")}>Batal</Button><Button variant="danger" loading={sibuk === "lepas"} onClick={() => { void aksi("lepas", "lepas").then(() => setDialog("")); }}>Lepas domain</Button></>}
      />
      <Dialog
        open={dialog === "hapus"}
        onClose={() => setDialog("")}
        dismissible={!sibuk}
        tone="danger"
        icon={<Warning size={20} weight="fill" />}
        title={`Hapus ${domain?.domain ?? "domain"} dari Tally?`}
        description={<>Tautan ke domain ini di email yang sudah terkirim tidak akan bisa dibuka lagi. Halaman acara tetap di <span className="font-medium">{alamatTally}</span>.</>}
        actions={<><Button variant="outlined" disabled={Boolean(sibuk)} onClick={() => setDialog("")}>Batal</Button><Button variant="danger" loading={sibuk === "hapus"} icon={<Trash size={16} />} onClick={() => void hapus("hapus")}>Hapus permanen</Button></>}
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
