"use client";

import { CopySimple, DotsThree, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Button, Dialog, IconButton, Popover, POPOVER_ITEM, POPOVER_ITEM_DANGER, usePopoverAnchor } from "@/components/m3";
import { EventDetailsDialog } from "@/components/admin/event-details-dialog";
import { ACTIONS, CONFIRM_TEXT, DuplicateEventDialog, type Action } from "@/components/admin/event-actions";
import type { EventRow } from "@/lib/domain";

/**
 * Aksi acara di kepala dashboard: Edit details, Activate, dan menu ⋯.
 *
 * Sebelumnya semua ini hanya ada di menu ⋯ daftar acara, satu layar di luar
 * acaranya sendiri. Orang yang sedang menyiapkan acara mencari "ubah tanggal"
 * dan "aktifkan" di dashboard acara itu, seperti halaman acara di Eventbrite
 * dan Luma.
 *
 * Pembagian peran:
 *   - Edit details: Admin acara ini dan super_admin. Admin klien tidak bisa
 *     mengubah acara Completed/Archived (penjaga tulis di server).
 *   - Activate, menu ⋯ (Duplicate, Access, status): super_admin saja, sama
 *     dengan endpoint-nya.
 *
 * Activate satu-satunya tombol penuh, dan hanya selama acara masih draft:
 * itulah langkah berikutnya bagi pemiliknya.
 */
export function DashboardEventActions({ slug, onChanged }: { slug: string; onChanged: () => void }) {
  // Ringkasan dashboard tidak membawa id dan zona waktu; baris lengkapnya dicari
  // di daftar acara, yang sudah dibatasi ke acara yang boleh dilihat pemanggil.
  const [acara, setAcara] = useState<EventRow | null>(null);
  const [pemilik, setPemilik] = useState(false);
  const [mengubah, setMengubah] = useState(false);
  const [menyalin, setMenyalin] = useState(false);
  const [aksi, setAksi] = useState<{ action: Action; label: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();

  useEffect(() => {
    let batal = false;
    void Promise.all([
      fetch("/api/events", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/auth/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([daftar, akun]) => {
      if (batal) return;
      setAcara(((daftar?.events ?? []) as EventRow[]).find((item) => item.slug === slug) ?? null);
      setPemilik(akun?.user?.role === "super_admin");
    }).catch(() => {});
    return () => { batal = true; };
  }, [slug]);

  if (!acara) return null;
  const terkunci = acara.status === "completed" || acara.status === "archived";
  // Activate untuk draft sudah jadi tombolnya sendiri; tidak diulang di menu.
  const aksiMenu = ACTIONS[acara.status].filter((entry) => !(acara.status === "draft" && entry.action === "activate"));

  async function jalankan() {
    if (!acara || !aksi) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/events/${acara.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: aksi.action }),
    }).catch(() => null);
    setPending(false);
    if (!response) { setError("Connection failed. Reload the page to see the actual status."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.details?.message ?? body.error?.message ?? `Action failed (${response.status}).`); return; }
    setAksi(null);
    setAcara(body.event as EventRow);
    onChanged();
  }

  return (
    <>
      {pemilik || !terkunci ? <Button variant="outlined" onClick={() => setMengubah(true)}>Edit details</Button> : null}
      {pemilik && acara.status === "draft" ? (
        <Button onClick={() => { setError(""); setAksi({ action: "activate", label: "Activate" }); }}>Activate</Button>
      ) : null}
      {pemilik ? (
        <>
          <IconButton
            ref={setPemicu}
            label="More actions for this event"
            aria-haspopup="menu"
            aria-expanded={menu.open}
            aria-controls={menu.open ? menuId : undefined}
            onClick={menu.toggle}
          >
            <DotsThree size={20} weight="bold" />
          </IconButton>
          {menu.open ? (
            <Popover anchor={menu} id={menuId} label="More actions for this event" width={240} align="end">
              <button type="button" role="menuitem" className={POPOVER_ITEM} onClick={() => { menu.tutup(); setMenyalin(true); }}>
                <CopySimple size={16} className="text-on-surface-variant" /> Duplicate event
              </button>
              <Link href={`/events/${acara.id}/access`} role="menuitem" className={POPOVER_ITEM} onClick={() => menu.tutup()}>
                <UsersThree size={16} className="text-on-surface-variant" /> Access
              </Link>
              {aksiMenu.length > 0 ? <div className="my-1.5 border-t border-outline-variant" /> : null}
              {aksiMenu.map((entry) => (
                <button
                  key={entry.action}
                  type="button"
                  role="menuitem"
                  className={entry.danger ? POPOVER_ITEM_DANGER : POPOVER_ITEM}
                  onClick={() => { menu.tutup(); setError(""); setAksi(entry); }}
                >
                  {entry.label}
                </button>
              ))}
            </Popover>
          ) : null}
        </>
      ) : null}

      <EventDetailsDialog
        event={mengubah ? acara : null}
        onClose={() => setMengubah(false)}
        onSaved={(baru) => { setMengubah(false); setAcara(baru); onChanged(); }}
      />

      <DuplicateEventDialog
        event={menyalin ? acara : null}
        onClose={() => setMenyalin(false)}
        // Salinan langsung dibuka: yang menduplikasi hampir selalu ingin
        // menyesuaikan salinannya, bukan kembali ke acara aslinya.
        onDone={(salinan) => { window.location.href = `/e/${salinan.slug}/admin`; }}
      />

      <Dialog
        open={aksi !== null}
        onClose={() => setAksi(null)}
        dismissible={!pending}
        title={aksi?.action === "activate" ? "Activate this event?" : `${aksi?.label ?? ""}?`}
        description={aksi ? CONFIRM_TEXT[aksi.action] : undefined}
        actions={
          <>
            <Button variant="outlined" disabled={pending} onClick={() => setAksi(null)}>Cancel</Button>
            <Button loading={pending} onClick={() => void jalankan()}>{aksi?.label}</Button>
          </>
        }
      >
        {error ? <p role="alert" className="mt-4 rounded-lg border border-error-soft-outline bg-error-soft p-3 text-body-small text-on-error-soft">{error}</p> : null}
      </Dialog>
    </>
  );
}
