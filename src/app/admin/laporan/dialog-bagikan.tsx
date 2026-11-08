"use client";

import { ArrowSquareOut, Copy, UserCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Dialog } from "@/components/m3";
import type { DataLaporan } from "./jenis";

const waktu = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Share with client, seperti dialog Share di Google Drive: siapa yang bisa
 * melihat (akun Viewer acara ini), di mana (link halaman klien, tab Report),
 * lalu Share / Update / Stop. Tidak ada yang dikirim: panitia sendiri yang
 * memberi link ke klien.
 */
export function DialogBagikan({ data, open, sibuk, onClose, onKirim }: {
  data: DataLaporan;
  open: boolean;
  sibuk: boolean;
  onClose: () => void;
  onKirim: (aksi: "bagikan" | "tarik") => void;
}) {
  const [tersalin, setTersalin] = useState(false);
  const link = typeof window === "undefined" ? `/e/${data.slug}/live` : `${window.location.origin}/e/${encodeURIComponent(data.slug)}/live`;
  const salin = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      setTersalin(false);
    }
  };
  const dibagikan = !!data.shared_at;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dibagikan ? "Shared with the client" : "Share with the client"}
      description={
        dibagikan
          ? `The client sees the figures as of ${waktu(data.shared_at!)}. Update the copy to show today's figures and edits.`
          : "The figures are locked as of now and stay the same until you share again."
      }
      actions={
        dibagikan ? (
          <>
            <Button variant="text" disabled={sibuk} onClick={() => onKirim("tarik")}>Stop sharing</Button>
            <Button loading={sibuk} onClick={() => onKirim("bagikan")}>Update shared copy</Button>
          </>
        ) : (
          <>
            <Button variant="text" onClick={onClose}>Cancel</Button>
            <Button loading={sibuk} onClick={() => onKirim("bagikan")}>Share</Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5 pt-3">
        <section className="flex flex-col gap-2" aria-labelledby="bg-siapa">
          <h3 id="bg-siapa" className="m-0 text-title-small text-on-surface">Who can see it</h3>
          {data.klien.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {data.klien.map((k) => (
                <li key={k.username} className="flex min-h-9 items-center gap-3 text-body-medium">
                  <UserCircle size={24} aria-hidden className="shrink-0 text-on-surface-variant" />
                  <span className="min-w-0 flex-1 truncate">{k.username}</span>
                  <span className="text-body-small text-on-surface-variant">{k.aktif ? "Client (Viewer)" : "Inactive, can't sign in"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-body-medium text-on-surface">No client account for this event yet, so nobody sees the report.</p>
          )}
          <a href="/users" target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1 self-start text-label-large text-primary">
            {data.klien.length ? "Manage client accounts in Users & roles" : "Add one in Users & roles"}
            <ArrowSquareOut size={16} aria-hidden />
          </a>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="bg-mana">
          <h3 id="bg-mana" className="m-0 text-title-small text-on-surface">Where they see it</h3>
          <div className="flex items-center gap-2">
            <input readOnly value={link} aria-label="Client page link" onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-outline-variant bg-surface-container-low px-3 text-body-medium text-on-surface" />
            <Button variant="outlined" icon={<Copy size={18} aria-hidden />} onClick={() => void salin()}>{tersalin ? "Copied" : "Copy link"}</Button>
          </div>
          <p className="m-0 text-body-small text-on-surface-variant" aria-live="polite">
            They sign in with their username and PIN, then open the Report tab. Locked Daily highlights show there too, even before you share the deck. Tally sends nothing: give them this link yourself.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
