"use client";

import { MagnifyingGlass, ShareNetwork, UserPlus, X, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState, type KeyboardEvent } from "react";
import { Button, Dialog, IconButton, POPOVER_ITEM } from "@/components/m3";
import { ROLE_LABEL } from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

type Peran = "admin" | "booth" | "cashier" | "scanner";
type Baris = { user_id: string; role: Peran; booth_id: number | null };
type Akun = { id: string; username: string; role: string; is_active: boolean };
type Booth = { id: number; code: string; name: string };

const PERAN: Peran[] = ["admin", "booth", "cashier", "scanner"];
const USERNAME = /^[a-z0-9._-]{3,50}$/;
const FIELD = "h-9 min-w-0 rounded-md border border-outline bg-surface px-2 text-body-medium text-on-surface focus:border-primary";

function Inisial({ nama }: { nama: string }) {
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-large font-semibold uppercase text-on-secondary-container">
      {nama.slice(0, 1)}
    </span>
  );
}

function pinAcak() {
  const angka = new Uint32Array(1);
  crypto.getRandomValues(angka);
  return String(angka[0] % 1_000_000).padStart(6, "0");
}

/**
 * Tombol "Share" di bilah atas acara, dan dialognya.
 *
 * Pola dialog Share Google Drive/Docs, yang dikenal hampir semua orang:
 * orang ditambahkan KE acara (bukan acara ke orang). Di atas: kolom "Add people"
 * yang mencari akun yang ada, atau membuat akun baru di tempat bila username
 * belum ada, lalu peran (dan booth untuk Booth staff). Di bawah: "People with
 * access", tiap orang dengan pemilih peran yang juga memuat "Remove access".
 *
 * Hanya super admin yang melihatnya: API akses acara khusus super admin.
 */
export function ShareAcara({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [buka, setBuka] = useState(false);
  return (
    <>
      <Button size="sm" variant="tonal" icon={<ShareNetwork size={16} />} onClick={() => setBuka(true)}>
        Share
      </Button>
      {buka ? <DialogShare eventId={eventId} eventName={eventName} onClose={() => setBuka(false)} /> : null}
    </>
  );
}

function DialogShare({ eventId, eventName, onClose }: { eventId: string; eventName: string; onClose: () => void }) {
  const [akses, setAkses] = useState<Baris[]>([]);
  const [akun, setAkun] = useState<Akun[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // Baris "Add people".
  const [cari, setCari] = useState("");
  const [terpilih, setTerpilih] = useState<Akun | null>(null);
  const [baru, setBaru] = useState<{ username: string; pin: string } | null>(null);
  const [peran, setPeran] = useState<Peran>("booth");
  const [booth, setBooth] = useState<number | null>(null);
  const [sorot, setSorot] = useState(0);
  const [daftarTerbuka, setDaftarTerbuka] = useState(false);
  const idDaftar = useId();

  const muat = useCallback(async () => {
    const response = await fetch(`/api/events/${eventId}/access`, { cache: "no-store" }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) setGalat(body.error?.details?.message ?? body.error?.message ?? "Access could not be loaded.");
    else { setAkses(body.access ?? []); setAkun(body.users ?? []); setBooths(body.booths ?? []); }
    setMemuat(false);
  }, [eventId]);

  useEffect(() => { const timer = window.setTimeout(() => void muat(), 0); return () => window.clearTimeout(timer); }, [muat]);

  const punyaAkses = new Set(akses.map((baris) => baris.user_id));
  const kata = cari.trim().toLowerCase();
  const saran = kata
    ? akun.filter((user) => user.is_active && user.role !== "super_admin" && !punyaAkses.has(user.id) && user.username.includes(kata)).slice(0, 6)
    : [];
  const bisaBuat = USERNAME.test(kata) && !akun.some((user) => user.username === kata);
  const pilihan: Array<{ jenis: "akun"; akun: Akun } | { jenis: "baru"; username: string }> = [
    ...saran.map((user) => ({ jenis: "akun" as const, akun: user })),
    ...(bisaBuat ? [{ jenis: "baru" as const, username: kata }] : []),
  ];

  function pilih(index: number) {
    const opsi = pilihan[index];
    if (!opsi) return;
    if (opsi.jenis === "akun") {
      setTerpilih(opsi.akun);
      setBaru(null);
      if (opsi.akun.role !== "super_admin") setPeran(opsi.akun.role as Peran);
      setCari(opsi.akun.username);
    } else {
      setTerpilih(null);
      setBaru({ username: opsi.username, pin: pinAcak() });
      setCari(opsi.username);
    }
    setDaftarTerbuka(false);
  }

  function tombol(peristiwa: KeyboardEvent<HTMLInputElement>) {
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      setDaftarTerbuka(true);
      if (pilihan.length === 0) return;
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((sekarang) => (sekarang + arah + pilihan.length) % pilihan.length);
    } else if (peristiwa.key === "Enter" && daftarTerbuka && pilihan.length > 0) {
      peristiwa.preventDefault();
      pilih(Math.min(sorot, pilihan.length - 1));
    } else if (peristiwa.key === "Escape" && daftarTerbuka) {
      peristiwa.stopPropagation();
      setDaftarTerbuka(false);
    }
  }

  const siapTambah = Boolean((terpilih || baru) && (peran !== "booth" || booth));

  async function tambah() {
    if (!siapTambah) return;
    setSibuk(true); setGalat("");
    const response = baru
      ? await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: baru.username, pin: baru.pin, role: peran, events: [{ event_id: eventId, booth_id: peran === "booth" ? booth : null }] }),
        }).catch(() => null)
      : await fetch(`/api/events/${eventId}/access`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: terpilih?.id, role: peran, booth_id: peran === "booth" ? booth : null }),
        }).catch(() => null);
    setSibuk(false);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setGalat(body.error?.details?.message ?? body.error?.message ?? "Could not add them."); return; }
    setCari(""); setTerpilih(null); setBooth(null);
    if (!baru) setBaru(null);
    void muat();
  }

  async function ubahPeran(baris: Baris, nilai: string) {
    setSibuk(true); setGalat("");
    const response = nilai === "hapus"
      ? await fetch(`/api/events/${eventId}/access`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: baris.user_id }) }).catch(() => null)
      : await fetch(`/api/events/${eventId}/access`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: baris.user_id, role: nilai, booth_id: nilai === "booth" ? baris.booth_id : null }) }).catch(() => null);
    setSibuk(false);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setGalat(body.error?.details?.message ?? body.error?.message ?? "Could not change access."); return; }
    void muat();
  }

  const nama = (id: string) => akun.find((user) => user.id === id)?.username ?? "Unknown account";
  const pemilik = akun.filter((user) => user.role === "super_admin" && user.is_active);
  const urut = [...akses].sort((a, b) => nama(a.user_id).localeCompare(nama(b.user_id)));

  return (
    <Dialog open bare size="lg" title={`Share ${eventName}`} onClose={onClose} dismissible={!sibuk} fullScreenOnMobile>
      <div className="flex max-h-[90dvh] flex-col max-sm:h-dvh max-sm:max-h-none">
        <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-4">
          <h2 className="min-w-0 flex-1 truncate text-title-large font-semibold">Share “{eventName}”</h2>
          <IconButton size="sm" label="Close" onClick={onClose} disabled={sibuk}><X size={16} /></IconButton>
        </div>

        {/* Baris tambah: cari akun atau buat baru, peran, booth, Add. */}
        <div className="shrink-0 px-5 pb-3">
          <div className="relative">
            <label className="flex h-10 items-center gap-2 rounded-md border border-outline px-3 focus-within:border-primary">
              <MagnifyingGlass size={16} className="shrink-0 text-on-surface-variant" />
              <input
                role="combobox"
                aria-expanded={daftarTerbuka && pilihan.length > 0}
                aria-controls={idDaftar}
                aria-autocomplete="list"
                aria-activedescendant={daftarTerbuka && pilihan.length > 0 ? `${idDaftar}-${Math.min(sorot, pilihan.length - 1)}` : undefined}
                aria-label="Add people by username"
                placeholder="Add people by username"
                value={cari}
                onChange={(change) => { setCari(change.target.value.toLowerCase()); setTerpilih(null); setBaru(null); setSorot(0); setDaftarTerbuka(true); }}
                onFocus={() => setDaftarTerbuka(true)}
                onKeyDown={tombol}
                className="min-w-0 flex-1 bg-transparent text-body-large outline-none"
              />
            </label>
            {daftarTerbuka && pilihan.length > 0 && !terpilih && !baru ? (
              <ul id={idDaftar} role="listbox" aria-label="Accounts" className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-outline-variant bg-surface-container py-1 shadow-level2">
                {pilihan.map((opsi, index) => {
                  const aktif = index === Math.min(sorot, pilihan.length - 1);
                  return (
                    <li
                      key={opsi.jenis === "akun" ? opsi.akun.id : "baru"}
                      id={`${idDaftar}-${index}`}
                      role="option"
                      aria-selected={aktif}
                      onMouseDown={(klik) => klik.preventDefault()}
                      onMouseEnter={() => setSorot(index)}
                      onClick={() => pilih(index)}
                      className={cx(POPOVER_ITEM, "cursor-pointer gap-3", aktif && "bg-primary-soft")}
                    >
                      {opsi.jenis === "akun" ? (
                        <>
                          <Inisial nama={opsi.akun.username} />
                          <span className="min-w-0 flex-1 truncate">{opsi.akun.username}</span>
                          <span className="shrink-0 text-body-small text-on-surface-variant">{ROLE_LABEL[opsi.akun.role as Peran] ?? opsi.akun.role}</span>
                        </>
                      ) : (
                        <>
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-outline text-primary"><UserPlus size={16} /></span>
                          <span className="min-w-0 flex-1 truncate">Create account “{opsi.username}”</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {terpilih || baru ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {terpilih ? (
                <span className="text-body-medium">{ROLE_LABEL[peran]} <span className="text-on-surface-variant">· role of this account</span></span>
              ) : (
                <select aria-label="Role" className={cx(FIELD, "w-36 max-sm:flex-1")} value={peran} onChange={(change) => setPeran(change.target.value as Peran)}>
                  {PERAN.map((nilai) => <option key={nilai} value={nilai}>{ROLE_LABEL[nilai]}</option>)}
                </select>
              )}
              {peran === "booth" ? (
                <select aria-label="Booth" className={cx(FIELD, "w-40 max-sm:flex-1", !booth && "border-error")} value={booth ?? ""} onChange={(change) => setBooth(change.target.value ? Number(change.target.value) : null)}>
                  <option value="">Choose a booth</option>
                  {booths.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                </select>
              ) : null}
              <Button size="sm" className="ml-auto max-sm:w-full" disabled={!siapTambah} loading={sibuk} onClick={() => void tambah()}>
                {baru ? "Create and add" : "Add"}
              </Button>
              {baru ? (
                <p className="basis-full text-body-small text-on-surface-variant">
                  New account. PIN <b className="tabular-nums tracking-wider text-on-surface">{baru.pin}</b>, give it to them in person.
                  <button type="button" className="ml-2 whitespace-nowrap font-medium text-primary" onClick={() => setBaru((sekarang) => sekarang && { ...sekarang, pin: pinAcak() })}>New PIN</button>
                </p>
              ) : null}
            </div>
          ) : null}
          {galat ? <p role="alert" className="mt-2 flex items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{galat}</p> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-outline-variant px-5 py-3">
          <h3 className="text-body-medium font-semibold">People with access</h3>
          {memuat ? (
            <p className="py-4 text-body-medium text-on-surface-variant">Loading…</p>
          ) : (
            <ul className="mt-1">
              {pemilik.map((user) => (
                <li key={user.id} className="flex items-center gap-3 py-2">
                  <Inisial nama={user.username} />
                  <span className="min-w-0 flex-1 truncate text-body-medium">{user.username}</span>
                  <span className="shrink-0 text-body-medium text-on-surface-variant">Super admin</span>
                </li>
              ))}
              {urut.map((baris) => (
                <li key={baris.user_id} className="flex items-center gap-3 py-2">
                  <Inisial nama={nama(baris.user_id)} />
                  <span className="min-w-0 flex-1 truncate text-body-medium">{nama(baris.user_id)}</span>
                  {baris.role === "booth" ? (
                    <span className="shrink-0 text-body-small text-on-surface-variant">
                      {booths.find((item) => item.id === baris.booth_id)?.code ?? "No booth"}
                    </span>
                  ) : null}
                  <select
                    aria-label={`Access for ${nama(baris.user_id)}`}
                    className={cx(FIELD, "w-36 border-transparent hover:border-outline")}
                    value={baris.role}
                    disabled={sibuk}
                    onChange={(change) => void ubahPeran(baris, change.target.value)}
                  >
                    <option value={baris.role}>{ROLE_LABEL[baris.role]}</option>
                    <option value="hapus">Remove access</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-outline-variant px-5 py-3">
          <Link href="/users" className="min-w-0 flex-1 truncate text-body-medium text-primary hover:underline">All accounts in Users &amp; roles</Link>
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
